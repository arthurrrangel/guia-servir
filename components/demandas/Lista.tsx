'use client';
/* A LISTA DE DEMANDAS, UMA SÓ, PARA OS DOIS PORTAIS · migração 94.

   Até a 93 esta lista era a tela `/demandas` inteira, com a mesma cara para
   todo mundo e a aba "Tudo" aberta por padrão. Agora ela é uma peça: o portal
   de quem pede a monta com "Minhas / Acompanho / Ministério" e "Abertas /
   Concluídas / Histórico"; o portal de quem atende, com as seis vistas. Quem
   decide o que cada recorte traz é `dem_lista`, sempre dentro de `pode_ver`:
   a peça só pergunta.

   A FORMA · 23/09/2026. Uma tabela de verdade, numa superfície só: a linha de
   ferramentas em cima (os recortes à esquerda, a busca e a ordem à direita),
   uma linha de estado quando há o que dizer ("2 passaram do prazo"), e a
   tabela, com cabeçalho. `Linha` é UMA peça com células nomeadas
   (`dm-c-*`), e a folha decide a forma pela largura do CONTÊINER
   (`@container` em `.dm-fila`): lista de duas linhas no celular, tabela a
   partir de 720px, com as colunas "responsável" e "setor" entrando conforme
   cabem. A linha inteira é o link.

   Tudo que a lista antiga já tinha provado continua aqui: a resposta atrasada
   que não sobrescreve a recente, a busca que espera o dedo parar, a lista
   cortada que diz que foi cortada, e a pílula que fala os nomes do documento. */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Aviso, Esqueleto, Estado, Prio, Vazio } from './Ui';
import { Icone } from './Icone';
import { lista, type Aba, type Filtro } from '@/lib/demandas/api';
import {
  MOTIVOS, dataCurta, diasDeAtraso, recadoDoErro, situacao, quemManda,
} from '@/lib/demandas/regras';
import type { Eu, Resumo } from '@/lib/demandas/tipos';

export type Recorte = 'abertas' | 'urgentes' | 'atrasadas' | 'concluidas' | 'tudo';
export type Ordem = 'urgencia' | 'prazo' | 'recente' | 'numero';

/* UMA IDA AO BANCO POR TECLA, MEDIDA NO NAVEGADOR: digitar "arte do culto"
   disparava 13 chamadas. Aba e filtro continuam instantâneos; só o texto
   espera o dedo parar. */
const ESPERA_DA_BUSCA = 300;

export default function Lista({ eu, abas, recortes, abaInicial, recorteInicial = 'abertas', vazio, contas, controle,
                                mostrarSetor = true, tomDoVazio }: {
  eu: Eu;
  /** "de quem". Com uma opção só, a tira não aparece: pergunta sem escolha é ruído. */
  abas: { v: Aba; rot: string }[];
  /** "em que estado", com o rótulo que faz sentido em cada portal */
  recortes: { v: Recorte; rot: string }[];
  abaInicial?: Aba;
  recorteInicial?: Recorte;
  /** a frase da lista vazia, que depende do recorte */
  vazio: (aba: Aba, so: Recorte) => { titulo: string; dica?: React.ReactNode; tom?: 'bom' | 'filtro' };
  /** quantas há em cada aba, quando o portal já sabe (vem de `dem_portal`) */
  contas?: Partial<Record<Aba, number>>;
  /** quando quem escolhe o recorte é a página (o Atendimento escolhe pelas
      sub-abas), a lista não desenha as tiras dela: dois controles para a
      mesma pergunta é como a pessoa se perde */
  controle?: { aba: Aba; so: Recorte };
  /** o setor que atende aparece em cada linha? Na fila do próprio setor, não. */
  mostrarSetor?: boolean;
  tomDoVazio?: 'bom' | 'filtro';
}) {
  const [itens, setItens] = useState<Resumo[] | null>(null);
  /* quantas ficaram de fora do teto de 300 da migração 57 (0 = nenhuma) */
  const [sobraram, setSobraram] = useState(0);
  const [erro, setErro] = useState('');
  const [abaLocal, setAba] = useState<Aba>(abaInicial ?? abas[0]?.v ?? 'minhas');
  const [soLocal, setSo] = useState<Recorte>(recorteInicial);
  const aba = controle?.aba ?? abaLocal;
  const so = controle?.so ?? soLocal;
  /* `busca` é o que está escrito no campo; `termo` é o que já virou consulta */
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  const [buscaAberta, setBuscaAberta] = useState(false);
  /* NAS CONCLUÍDAS, A ORDEM É A DO FIM, E NÃO A URGÊNCIA — 23/09/2026: a aba
     Concluídas abria "Por urgência", com a "Alta" já entregue no topo. Sem
     escolha da pessoa, as concluídas vêm "Mexidas por último" */
  const [ordemEscolhida, setOrdem] = useState<Ordem | null>(null);
  const ordem: Ordem = ordemEscolhida ?? (so === 'concluidas' ? 'recente' : 'urgencia');
  const [ocupado, setOcupado] = useState(true);
  /* A RESPOSTA ATRASADA SOBRESCREVIA A RECENTE. Cada chamada carimba o número
     do seu pedido e só escreve na tela se ainda for o último. */
  const pedido = useRef(0);
  const campoBusca = useRef<HTMLInputElement>(null);

  useEffect(() => {
    /* "#113" acha a #113: é assim que o número aparece em toda tela (24/09/2026,
       auditoria R13; só "113" achava) */
    const limpa = busca.trim().replace(/^#\s*/, '');
    if (limpa === termo) return;
    const id = setTimeout(() => setTermo(limpa), ESPERA_DA_BUSCA);
    return () => clearTimeout(id);
  }, [busca, termo]);

  const buscar = useCallback(async () => {
    const f: Filtro = { aba, busca: termo || undefined };
    if (so === 'abertas') f.abertas = true;
    if (so === 'atrasadas') f.atrasadas = true;
    if (so === 'urgentes') f.urgentes = true;
    if (so === 'concluidas') f.status = 'concluida';
    const meu = ++pedido.current;
    setOcupado(true);
    const r = await lista(f);
    if (meu !== pedido.current) return;   // chegou atrasada: já existe pedido mais novo
    setOcupado(false);
    if (!r.ok) { setErro(recadoDoErro(r, 'carregar a lista')); setItens([]); setSobraram(0); return; }
    setErro(''); setItens(r.itens);
    setSobraram(r.tem_mais ? Math.max((r.total || 0) - r.itens.length, 0) : 0);
  }, [aba, so, termo]);

  /* SEM `setItens(null)` AQUI: apagar a lista antes de a próxima chegar fazia
     a tela piscar em branco a cada troca de filtro. A anterior fica no lugar
     e o bloco diz `aria-busy`. */
  useEffect(() => { buscar(); }, [buscar]);
  /* e ao voltar para a aba do navegador, a lista se atualiza: quem deixou o
     Demandas aberto desde a manhã via a fila da manhã (24/09/2026, R13) */
  useEffect(() => {
    const f = () => { if (document.visibilityState === 'visible') buscar(); };
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, [buscar]);

  /* a ordem é decisão de leitura no desktop; o servidor manda por urgência e
     a tela reordena o que já tem, sem nova ida ao banco */
  const ordenados = useMemo(() => ordenar(itens || [], ordem), [itens, ordem]);

  /* A BUSCA SEM RESULTADO NÃO AFIRMA NADA SOBRE A OPERAÇÃO — 23/09/2026.
     Com "zzzz" na busca, a lista vazia dizia a frase do recorte, com o
     visto verde: "O setor está em dia", "Nada esperando você". Era o único
     lugar em que o produto afirmava uma coisa falsa, e com cara de boa
     notícia. Com termo, a frase é da busca, e a saída é limpar. */
  const v = termo
    ? { titulo: `Nenhuma demanda com “${termo}”`, dica: 'Confira a palavra ou procure pelo número da demanda.',
        tom: 'filtro' as const, limpar: true }
    : { ...vazio(aba, so), limpar: false };
  const temPasso = (itens || []).some(d => !!d.motivo);
  const r = itens ? resumoDe(itens, eu) : null;
  const tiras = !controle && (abas.length > 1 || recortes.length > 1);
  /* LISTA VAZIA NÃO GANHA BUSCA NEM ORDEM: no Início de quem atende,
     "Pedidas por você" vazia era um vazio de 150px com busca e "Por
     urgência" em cima, ferramentas para nada. Com busca escrita (a lista
     vazia é o resultado dela), as ferramentas ficam, para desfazer. */
  const semFerramentas = itens !== null && itens.length === 0 && !busca && !termo && !buscaAberta;
  const contando = itens !== null && sobraram > 0;

  return (
    <>
      {/* ---------------------------------------------- a linha de ferramentas */}
      {tiras || contando || r || !semFerramentas ? (
      <div className={`dm-ferramentas ${buscaAberta ? 'dm-buscando' : ''}`}>
        {tiras ? (
          <>
            {abas.length > 1 ? (
              <div className="dm-seg dm-seg-de-quem" role="group" aria-label="De quem">
                {abas.map(a => (
                  <button key={a.v} type="button" aria-pressed={aba === a.v} onClick={() => setAba(a.v)}>
                    {a.rot}{contas && contas[a.v] ? <span className="dm-selo">{contas[a.v]}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="dm-seg" role="group" aria-label="Em que estado">
              {recortes.map(x => (
                <button key={x.v} type="button" aria-pressed={so === x.v} onClick={() => setSo(x.v)}>{x.rot}</button>
              ))}
            </div>
          </>
        ) : (
          /* quando quem escolhe é a página (Atendimento), a sub-aba já diz
             quantas são; a esquerda só fala quando a lista veio cortada
             ("300 de 1204 demandas"), que é o que a sub-aba não sabe dizer */
          <span className="dm-contagem" aria-live="polite">
            {itens === null || !sobraram ? '' : contagem(itens.length, sobraram)}
          </span>
        )}
        {/* sem tiras (o Atendimento), a esquerda da linha estava vazia e o
            resumo ("1 passou do prazo") ocupava uma linha só dele embaixo:
            ele sobe para o lugar vazio */}
        {!tiras && r ? (
          <p className={`dm-resumo dm-${r.tom}`} role="status"><span className="dm-ponto" />{r.texto}</p>
        ) : null}
        {semFerramentas ? null : (
        <div className="dm-ferramentas-dir">
          <button type="button" className="dm-btn dm-icone dm-busca-toggle"
            aria-label={buscaAberta ? 'Fechar a busca' : 'Abrir a busca'} aria-expanded={buscaAberta}
            onClick={() => { setBuscaAberta(x => !x); setTimeout(() => campoBusca.current?.focus(), 50); }}>
            <Icone nome={buscaAberta ? 'fechar' : 'busca'} />
          </button>
          <label className={buscaAberta ? 'dm-busca dm-aberta' : 'dm-busca'}>
            <Icone nome="busca" />
            <input ref={campoBusca} type="search" aria-label="Procurar" placeholder="Título ou número"
              value={busca} onChange={e => setBusca(e.target.value)} />
          </label>
          {/* a ordem se diz na própria opção ("Por urgência"), com o ícone de
              ordenar dentro do controle: o rótulo "Ordenar" solto ao lado
              custava 60px e empurrava a busca para a linha de baixo em 1024 */}
          <select className="dm-ctl dm-filtro dm-ordem dm-so-desktop" aria-label="Ordenar" value={ordem}
            onChange={e => setOrdem(e.target.value as Ordem)}>
            <option value="urgencia">Por urgência</option>
            <option value="prazo">Por prazo</option>
            <option value="recente">Mexidas por último</option>
            <option value="numero">Por número</option>
          </select>
        </div>
        )}
      </div>
      ) : null}

      {/* uma linha de leitura antes da tabela: o que precisa de atenção, em
          palavras. `role="status"` e não `alert`: alerta interrompe o leitor
          de tela a cada troca de filtro. A cor diz o resto. */}
      {r && tiras ? (
        <p className={`dm-resumo dm-${r.tom}`} role="status"><span className="dm-ponto" />{r.texto}</p>
      ) : null}

      {/* falha de rede no 4G da igreja é o caso comum: a lista oferece a
          saída, em vez de mostrar o erro e nada mais */}
      {erro ? (
        <>
          <Aviso tom="bad">{erro}</Aviso>
          <button type="button" className="dm-btn dm-tentar" onClick={buscar}>Tentar de novo</button>
        </>
      ) : null}

      <div aria-busy={ocupado}>
        {/* com erro, a lista vazia não é notícia: "Nada esperando você" com o
            visto verde embaixo de "Sem conexão agora" afirmava o que a tela
            não sabia (24/09/2026, auditoria R11) */}
        {itens === null ? <Esqueleto forma="lista" /> : itens.length === 0 && erro ? null : itens.length === 0 ? (
          <div className="dm-tabela">
            <Vazio titulo={v.titulo} tom={v.tom ?? tomDoVazio}>
              {v.dica}
              {v.limpar ? (
                <div>
                  <button type="button" className="dm-btn dm-peq"
                    onClick={() => { setBusca(''); setTermo(''); campoBusca.current?.focus(); }}>Limpar a busca</button>
                </div>
              ) : null}
            </Vazio>
          </div>
        ) : (
          <div className="dm-tabela">
            <Fila itens={ordenados} eu={eu} mostrarSetor={mostrarSetor} semPasso={!temPasso} />
            {/* LISTA CORTADA TEM QUE DIZER QUE FOI CORTADA: teto sem aviso é
                pior que o problema que ele resolve. */}
            {sobraram > 0 && (
              <p className="dm-corte" role="status">
                Mostrando as {itens.length} mais urgentes. Outras {sobraram} não
                couberam. Use os filtros acima, ou busque pelo número da demanda.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function contagem(n: number, sobraram: number): string {
  if (sobraram > 0) return `${n} de ${n + sobraram} demandas`;
  return `${n} ${n === 1 ? 'demanda' : 'demandas'}`;
}

export function ordenar(itens: Resumo[], ordem: Ordem): Resumo[] {
  if (ordem === 'urgencia') return itens;
  const xs = itens.slice();
  if (ordem === 'prazo') xs.sort((a, b) => (a.prazo ? a.prazo : '9999') < (b.prazo ? b.prazo : '9999') ? -1 : 1);
  if (ordem === 'recente') xs.sort((a, b) => (a.mexida_em < b.mexida_em ? 1 : -1));
  if (ordem === 'numero') xs.sort((a, b) => b.numero - a.numero);
  return xs;
}

/* Uma linha de leitura antes da lista: o que precisa de atenção, em palavras.
   Só demanda viva, e o veredito do portão (`falta_aprovacao`), não a coluna. */
function resumoDe(itens: Resumo[], eu: Eu): { texto: string; tom: 'bad' | 'warn' } | null {
  const atrasadas = itens.filter(d => situacao(d) === 'atrasada').length;
  const paradas = itens.filter(d => situacao(d) === 'parada').length;
  const esperando = itens.filter(d =>
    (d.falta_aprovacao ?? (d.aprovacao === 'pendente'))
    && d.status !== 'concluida' && d.status !== 'cancelada').length;
  const manda = quemManda(eu.papel);
  if (!atrasadas && !paradas && !(esperando && manda)) return null;
  const partes: string[] = [];
  if (atrasadas) partes.push(`${atrasadas} ${atrasadas === 1 ? 'passou do prazo' : 'passaram do prazo'}`);
  if (paradas) partes.push(`${paradas} sem movimento há 7 dias ou mais`);
  if (esperando && manda) partes.push(`${esperando} ${esperando === 1 ? 'espera' : 'esperam'} aprovação`);
  return { texto: partes.join(' · '), tom: atrasadas ? 'bad' : 'warn' };
}

/* A fila: o cabeçalho de tabela (a folha só o mostra nas formas com colunas)
   e uma `Linha` por demanda. */
export function Fila({ itens, eu, mostrarSetor = true, semPasso, semCabecalho, tarefas }: {
  itens: Resumo[]; eu?: Eu | null; mostrarSetor?: boolean; semPasso?: boolean;
  /* o "Precisa de você" é uma lista curta dentro de uma seção que já diz o
     que ela é: o cabeçalho de colunas ali é ruído */
  semCabecalho?: boolean;
  /* `tarefas`: a lista do "Precisa de você", logo acima de "Minhas
     demandas". O próximo passo ocupa o lugar do responsável (a mesma
     largura), e as colunas das duas tabelas empilhadas caem no mesmo x. */
  tarefas?: boolean;
}) {
  return (
    <div className={`dm-fila ${semPasso ? 'dm-sem-passo' : ''} ${tarefas ? 'dm-tarefas' : ''}`}>
      {semCabecalho ? null : (
        <div className="dm-fila-cab" aria-hidden="true">
          <span className="dm-c-num">Nº</span>
          <span className="dm-c-tit">Demanda</span>
          <span className="dm-c-cat">{mostrarSetor ? 'Setor' : 'Categoria'}</span>
          <span className="dm-c-estado">Estado</span>
          <span className="dm-c-prazo">Prazo</span>
          <span className="dm-c-com">Responsável</span>
          {semPasso ? null : <span className="dm-c-passo">Próximo passo</span>}
        </div>
      )}
      {itens.map(d => <Linha key={d.numero} d={d} eu={eu} mostrarSetor={mostrarSetor} />)}
    </div>
  );
}

export function Linha({ d, eu, mostrarSetor = true }: { d: Resumo; eu?: Eu | null; mostrarSetor?: boolean }) {
  const sit = situacao(d);
  const atraso = diasDeAtraso(d.prazo);
  const comigo = !!eu && !!d.responsavel_id && d.responsavel_id === eu.id;
  /* o contexto da linha: o setor (quando a lista cruza setores) ou a
     categoria, e quem pediu. O próprio nome de quem olha não entra: na lista
     "minhas" seria "· Pedro" em toda linha, e aí entra a categoria no lugar */
  const quem = d.abriu ? d.abriu.split(' ')[0] : null;
  const souEu = !!quem && !!eu && quem === (eu.primeiro_nome || eu.nome.split(' ')[0]);
  /* "de Pedro", com a preposição, como "com Ana": sozinho, "Pedro" não dizia
     o que ele é da demanda */
  const dePessoa = quem ? `de ${quem}` : null;
  /* na tabela larga o contexto vira coluna: o setor (ou a categoria) em
     cima, e o resto (a categoria de quem olha as próprias, ou quem pediu)
     embaixo, em cinza */
  const principal = mostrarSetor ? d.responsavel_setor : d.categoria;
  const resto = [...new Set([souEu && mostrarSetor ? d.categoria : null, souEu ? null : dePessoa]
    .filter(x => !!x && x !== principal))].join(' · ');
  const ctx = [principal, resto].filter(Boolean).join(' · ');
  /* nas próprias, o do meio é a categoria: na linha única da tabela ela
     fica no lugar do setor (ver `.dm-c-ctx-minha` na folha) */
  const minha = souEu && mostrarSetor && !!resto;
  const prazo = sit === 'atrasada' ? `${atraso} ${atraso === 1 ? 'dia' : 'dias'} de atraso`
    : sit === 'hoje' ? 'vence hoje'
    : d.prazo ? <><span className="dm-pre">para </span>{dataCurta(d.prazo)}</> : 'sem data';
  const com = comigo ? <><span className="dm-pre">com </span><b>você</b></>
    : d.responsavel ? <><span className="dm-pre">com </span>{d.responsavel.split(' ')[0]}</>
    /* "sem responsável", a mesma palavra da faixa ("Na fila: sem
       responsável"), e em cinza: ausência não tem o peso de um nome */
    : <span className="dm-mudo">sem responsável</span>;
  return (
    <Link href={`/demandas/d/${d.numero}`}
      className={`dm-item ${d.prioridade === 'urgente' ? 'dm-urgente' : ''} ${sit === 'atrasada' ? 'dm-atrasada' : ''}`}>
      <span className="dm-c-num">#{d.numero}</span>{' '}
      <span className="dm-c-tit">
        <b>{d.titulo}</b>
        {/* o contexto em três partes: de onde é (o setor ou a categoria), de
            quem veio (quem pediu, ou a categoria das próprias) e com quem está.
            Quando falta espaço, só a primeira encurta: nome de gente nunca
            vira toco ("Pe…"). Na tabela larga as duas primeiras viram coluna,
            e o "com quem" fica aqui quando o responsável não tem coluna. */}
        {ctx ? (
          <span className={`dm-c-ctx ${minha ? 'dm-c-ctx-minha' : ''}`}>
            <span className="dm-c-ctx-de">{principal}</span>
            <span className="dm-c-ctx-quem">{resto}</span>
            {/* só quando há alguém: "sem responsável" na linha repetia o
                que "Assumir" já diz, e cortava o setor na tabela */}
            <span className="dm-c-ctx-com">{d.responsavel ? com : null}</span>
          </span>
        ) : null}
      </span>
      <span className="dm-c-cat">{principal}{resto ? <small>{resto}</small> : null}</span>
      <span className="dm-c-meta">
        <span className="dm-c-estado">
          {/* os nomes do documento, pelo veredito do servidor: "Aguardando
              aprovação" e não "Travada", e nunca "Aberta" sobre uma demanda
              congelada pelo portão */}
          <Estado d={d} />
          {/* prioridade é de fila: na demanda que acabou, "Alta" ao lado de
              "Concluída" é ruído */}
          {sit !== 'fechada' ? <Prio p={d.prioridade} /> : null}
          {/* e a concluída diz se quem pediu já confirmou (24/09/2026, R11:
              a lista tinha o dado e não o mostrava) */}
          {/* (na lista do que espera, o "Confirmar" do fim da linha já diz) */}
          {d.status === 'concluida' && !d.motivo ? <small className="dm-c-confirma">{d.validada_em ? 'confirmada' : 'a confirmar'}</small> : null}
        </span>
        {/* três fatos, não cinco: para quando, com quem está, e o que fazer */}
        <span className={`dm-c-prazo ${sit === 'atrasada' ? 'dm-bad' : ''}`}>
          {prazo}
          {sit === 'parada' ? <small className="dm-c-parada">parada há {d.parada_dias} dias</small> : null}
        </span>
        <span className="dm-c-com">{com}</span>
        {/* 94 · quando a lista é "o que espera por você", o que falta fazer
            vem no fim da linha, como texto do link, e não como uma pílula com
            cara de botão que não faz o que parece */}
        {d.motivo ? <span className="dm-c-passo">{MOTIVOS[d.motivo] ?? d.motivo}<Icone nome="seta" /></span> : null}
      </span>
    </Link>
  );
}
