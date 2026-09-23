'use client';
/* A LISTA DE DEMANDAS, UMA SÓ, PARA OS DOIS PORTAIS · migração 94.

   Até a 93 esta lista era a tela `/demandas` inteira, com a mesma cara para
   todo mundo e a aba "Tudo" aberta por padrão. Agora ela é uma peça: o portal
   de quem pede a monta com "Minhas / Acompanho / Ministério" e "Abertas /
   Concluídas / Histórico"; o portal de quem atende, com as seis vistas. Quem
   decide o que cada recorte traz é `dem_lista`, sempre dentro de `pode_ver`:
   a peça só pergunta.

   A MESMA DEMANDA EM QUATRO FORMAS — 23/09/2026.

   A linha era a mesma peça de 320 e de 1920: título em 16px e uma linha de
   metadados de 12px espalhada por 1015px. Agora `Linha` é UMA peça com
   células nomeadas (`dm-c-*`), e a folha decide a forma pela largura do
   CONTÊINER (`@container` em `.dm-fila`): lista no celular, tabela com
   cabeçalho a partir de 560px, com as colunas "com" e "categoria" entrando
   conforme cabe. Quem monta a lista diz se o setor aparece (`mostrarSetor`:
   na fila da Comunicação, "Comunicação" em toda linha é ruído; para a gestão,
   que olha vários setores, é o fato que distingue).

   Tudo que a lista antiga já tinha provado continua aqui: a resposta atrasada
   que não sobrescreve a recente, a busca que espera o dedo parar, a lista
   cortada que diz que foi cortada, e a pílula que fala os nomes do documento. */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Aviso, Esqueleto, Pill, Vazio, useEstreito } from './Ui';
import { lista, type Aba, type Filtro } from '@/lib/demandas/api';
import {
  MOTIVOS, comoOPdfChama, dataCurta, diasDeAtraso, recadoDoErro, rotPrioridade,
  situacao, tomPill, tomPrioridade, quemManda,
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
  const [ordem, setOrdem] = useState<Ordem>('urgencia');
  const [ocupado, setOcupado] = useState(true);
  /* A RESPOSTA ATRASADA SOBRESCREVIA A RECENTE. Cada chamada carimba o número
     do seu pedido e só escreve na tela se ainda for o último. */
  const pedido = useRef(0);
  const campoBusca = useRef<HTMLInputElement>(null);
  const estreito = useEstreito(719);

  useEffect(() => {
    if (busca.trim() === termo) return;
    const id = setTimeout(() => setTermo(busca.trim()), ESPERA_DA_BUSCA);
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

  /* a ordem é decisão de leitura no desktop; o servidor manda por urgência e
     a tela reordena o que já tem, sem nova ida ao banco */
  const ordenados = useMemo(() => ordenar(itens || [], ordem), [itens, ordem]);

  const v = vazio(aba, so);
  const temPasso = (itens || []).some(d => !!d.motivo);
  return (
    <>
      {/* a busca, a ordem e (no celular) a lupa que abre a busca */}
      {(() => {
        const dir = (
          <div className="dm-ferramentas-dir">
            <button type="button" className="dm-btn dm-mini dm-busca-toggle"
              aria-label={buscaAberta ? 'Fechar a busca' : 'Abrir a busca'} aria-expanded={buscaAberta}
              onClick={() => { setBuscaAberta(x => !x); setTimeout(() => campoBusca.current?.focus(), 50); }}>
              <Lupa />
            </button>
            <label className={buscaAberta ? 'dm-busca dm-aberta' : 'dm-busca'}>
              <Lupa />
              <input ref={campoBusca} type="search" aria-label="Procurar" placeholder="Título ou número"
                value={busca} onChange={e => setBusca(e.target.value)} />
            </label>
            <label className="dm-ordem dm-so-desktop">
              Ordem
              <select className="dm-filtro" value={ordem} onChange={e => setOrdem(e.target.value as Ordem)}>
                <option value="urgencia">Urgência</option>
                <option value="prazo">Prazo mais próximo</option>
                <option value="recente">Mexida por último</option>
                <option value="numero">Número</option>
              </select>
            </label>
          </div>
        );
        const r = itens ? resumoDe(itens, eu) : null;
        /* `role="status"` e não `alert`: alerta interrompe o leitor de tela a
           cada troca de filtro. A cor continua vermelha, que é o que importa
           para quem vê. */
        const resumo = r ? (
          <span className={`dm-aviso-linha dm-${r.tom}`} role="status"><span className="dm-ponto" />{r.texto}.</span>
        ) : null;
        /* quando a lista desenha as próprias tiras (Início): no celular a
           lupa mora na linha delas, à direita, e o resumo só ocupa uma linha
           quando tem o que dizer (a lupa sozinha numa linha de 44px era
           ruído); a partir de 720 a linha de ferramentas é a mesma do
           Atender, resumo à esquerda e busca e ordem à direita */
        if (!controle && (abas.length > 1 || recortes.length > 1)) {
          return (
            <>
              <div className="dm-linha dm-tiras">
                {abas.length > 1 ? (
                  <div className="dm-seg" role="group" aria-label="De quem">
                    {abas.map(a => (
                      <button key={a.v} type="button" aria-pressed={aba === a.v} onClick={() => setAba(a.v)}>
                        {a.rot}{contas && contas[a.v] ? <span className="dm-selo">{contas[a.v]}</span> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="dm-seg" role="group" aria-label="Em que estado">
                  {recortes.map(r => (
                    <button key={r.v} type="button" aria-pressed={so === r.v} onClick={() => setSo(r.v)}>{r.rot}</button>
                  ))}
                </div>
                {estreito ? dir : null}
              </div>
              {estreito
                ? (resumo ? <div className="dm-ferramentas">{resumo}</div> : null)
                : <div className="dm-ferramentas">{resumo || <span />}{dir}</div>}
            </>
          );
        }
        /* quando quem escolhe é a página (Atender): resumo à esquerda, busca
           e ordem à direita */
        return (
          <div className="dm-ferramentas">
            {resumo || <span />}
            {dir}
          </div>
        );
      })()}

      {/* falha de rede no 4G da igreja é o caso comum: a lista oferece a
          saída, em vez de mostrar o erro e nada mais */}
      {erro ? (
        <>
          <Aviso tom="bad">{erro}</Aviso>
          <button className="dm-btn" style={{ marginBottom: 'var(--dm-e3)' }} onClick={buscar}>
            Tentar de novo
          </button>
        </>
      ) : null}

      <div aria-busy={ocupado}>
        {itens === null ? <Esqueleto forma="lista" /> : itens.length === 0 ? (
          <Vazio titulo={v.titulo} tom={v.tom ?? tomDoVazio}>{v.dica}</Vazio>
        ) : (
          <>
            <Fila itens={ordenados} eu={eu} mostrarSetor={mostrarSetor} semPasso={!temPasso} />
            {/* LISTA CORTADA TEM QUE DIZER QUE FOI CORTADA: teto sem aviso é
                pior que o problema que ele resolve. */}
            {sobraram > 0 && (
              <p className="dm-corte" role="status">
                Mostrando as {itens.length} mais urgentes. Outras {sobraram} não
                couberam. Use os filtros acima, ou busque pelo número da demanda.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}

function Lupa() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
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
  if (paradas) partes.push(`${paradas} sem movimento há mais de uma semana`);
  if (esperando && manda) partes.push(`${esperando} ${esperando === 1 ? 'espera' : 'esperam'} aprovação`);
  return { texto: partes.join(' · '), tom: atrasadas ? 'bad' : 'warn' };
}

/* A fila: o cabeçalho de tabela (a folha só o mostra nas formas com colunas)
   e uma `Linha` por demanda. */
export function Fila({ itens, eu, mostrarSetor = true, semPasso }: {
  itens: Resumo[]; eu?: Eu | null; mostrarSetor?: boolean; semPasso?: boolean;
}) {
  return (
    <div className={semPasso ? 'dm-fila dm-sem-passo' : 'dm-fila'}>
      <div className="dm-fila-cab" aria-hidden="true">
        <span className="dm-c-num">#</span>
        <span className="dm-c-tit">Demanda</span>
        <span className="dm-c-cat">{mostrarSetor ? 'Setor · pediu' : 'Categoria · pediu'}</span>
        <span className="dm-c-estado">Estado</span>
        <span className="dm-c-prazo">Prazo</span>
        <span className="dm-c-com">Com</span>
        {semPasso ? null : <span className="dm-c-passo">Próximo passo</span>}
      </div>
      {itens.map(d => <Linha key={d.numero} d={d} eu={eu} mostrarSetor={mostrarSetor} />)}
    </div>
  );
}

export function Linha({ d, eu, mostrarSetor = true }: { d: Resumo; eu?: Eu | null; mostrarSetor?: boolean }) {
  const sit = situacao(d);
  const atraso = diasDeAtraso(d.prazo);
  const comigo = !!eu && !!d.responsavel_id && d.responsavel_id === eu.id;
  const prio = tomPrioridade(d.prioridade);
  /* o contexto da linha: o setor (quando a lista cruza setores) ou a
     categoria, e quem pediu. O próprio nome de quem olha não entra: na lista
     "minhas" seria "· Pedro" em toda linha, e aí entra a categoria no lugar */
  const quem = d.abriu ? d.abriu.split(' ')[0] : null;
  const souEu = !!quem && !!eu && quem === (eu.primeiro_nome || eu.nome.split(' ')[0]);
  const ctx = [...new Set([mostrarSetor ? d.responsavel_setor : d.categoria,
                           souEu && mostrarSetor ? d.categoria : null,
                           souEu ? null : quem].filter(Boolean))].join(' · ');
  const prazo = sit === 'atrasada' ? `${atraso} ${atraso === 1 ? 'dia' : 'dias'} de atraso`
    : sit === 'hoje' ? 'vence hoje'
    : d.prazo ? <><span className="dm-pre">para </span>{dataCurta(d.prazo)}</> : 'sem data';
  return (
    <Link href={`/demandas/d/${d.numero}`}
      className={`dm-item ${d.prioridade === 'urgente' ? 'dm-urgente' : ''} ${sit === 'atrasada' ? 'dm-atrasada' : ''}`}>
      <span className="dm-c-num">#{d.numero}</span>
      <span className="dm-c-tit">
        <b>{d.titulo}</b>
        {ctx ? <span className="dm-c-ctx">{ctx}</span> : null}
      </span>
      <span className="dm-c-meta">
        <span className="dm-c-estado">
          {/* os nomes do documento, pelo veredito do servidor: "Aguardando
              aprovação" e não "Travada", e nunca "Aberta" sobre uma demanda
              congelada pelo portão */}
          <Pill tom={tomPill(d.status)}>
            <span className={`dm-ponto ${tomPill(d.status) ? 'dm-' + tomPill(d.status) : ''}`} />
            {comoOPdfChama(d)}
          </Pill>
          {prio ? <Pill tom={prio}>{rotPrioridade(d.prioridade)}</Pill> : null}
        </span>
        <span className="dm-c-cat">{ctx}</span>
        {/* três fatos, não cinco: para quando, com quem está, e o que fazer */}
        <span className={`dm-c-fato dm-c-prazo ${sit === 'atrasada' ? 'dm-bad' : ''}`}>{prazo}</span>
        {sit === 'parada' ? <span className="dm-c-fato">parada há {d.parada_dias} dias</span> : null}
        <span className="dm-c-fato dm-c-com">
          {comigo ? <b>com você</b> : d.responsavel ? `com ${d.responsavel.split(' ')[0]}` : 'sem dono'}
        </span>
        {/* 94 · quando a lista é "o que espera por você", o que falta fazer
            vem no fim da linha, como texto do link, e não como uma pílula com
            cara de botão que não faz o que parece */}
        {d.motivo ? <span className="dm-c-passo">{MOTIVOS[d.motivo] ?? d.motivo}</span> : null}
      </span>
    </Link>
  );
}
