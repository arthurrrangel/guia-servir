'use client';
/* O PAINEL. A primeira tela, e a que decide se o sistema é usado.

   Uma lista, não um quadro de colunas. Quadro com onze colunas é bonito na
   apresentação e, no celular, vira rolagem horizontal onde ninguém acha nada.
   Aqui cada linha diz, em uma olhada: número, título, quem pediu, quem
   atende, o estado e o tempo. O que precisa de atenção sobe.

   As abas do topo da lista são as quatro perguntas que as pessoas fazem de
   verdade: "o que eu pedi", "o que caiu no meu setor", "o que é meu" e
   "tudo". Elas mudam conforme o papel: perguntar "o que caiu no meu setor"
   para quem não atende nada seria uma aba sempre vazia. */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import Casca, { useEu } from '@/components/demandas/Casca';
import { Aviso, Esqueleto, Pill, Vazio } from '@/components/demandas/Ui';
import { lista, type Filtro } from '@/lib/demandas/api';
import {
  comoOPdfChama, dataCurta, diasDeAtraso, recadoDoErro, rotPrioridade,
  situacao, tomPill, tomPrioridade, quemManda,
} from '@/lib/demandas/regras';
import type { Eu, Resumo } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca><Painel /></Casca>;
}

/* OS QUATRO RECORTES DE ESTADO, E O QUARTO É O DO DOCUMENTO.

   O escopo da primeira versão pede, com estas palavras, "painel com demandas
   abertas, atrasadas e concluídas". A tira tinha três botões e nenhum deles
   era "concluídas": quem quisesse ver o que já foi entregue precisava tocar
   em "Todas" e rolar até o fim, porque `dem_lista` ordena por `k_fechada`
   primeiro e empurra tudo que fechou para baixo das abertas. Com o teto de
   300 da migração 57, numa casa com muito movimento a demanda concluída nem
   chegava na resposta: a lista avisava que tinha cortado e o que ficou de
   fora era justamente o recorte que o documento pede.

   `dem_lista` já aceita: a migração 88 valida `p_f.status` contra a lista
   ('aberta','execucao','travada','concluida','cancelada'), e `Filtro` já
   declara o campo. Não houve controle novo: o quarto botão entra na tira que
   já existia. */
type Recorte = 'abertas' | 'atrasadas' | 'concluidas' | 'tudo';
const RECORTES: [Recorte, string][] = [
  ['abertas', 'Em aberto'], ['atrasadas', 'Atrasadas'],
  ['concluidas', 'Concluídas'], ['tudo', 'Todas'],
];

/* UMA IDA AO BANCO POR TECLA, MEDIDA NO NAVEGADOR.

   Digitar "arte do culto" disparava 13 chamadas a `dem_lista`, uma por
   letra, cada uma podendo trazer 300 itens (174 kB medidos no teto). No 4G
   da igreja isso é a lista sumindo e voltando treze vezes debaixo do dedo.
   Aba e filtro continuam instantâneos, porque são um toque e não treze; só
   o texto espera. */
const ESPERA_DA_BUSCA = 300;

function Painel() {
  const { eu } = useEu();
  const [itens, setItens] = useState<Resumo[] | null>(null);
  /* quantas ficaram de fora do teto de 300 da migração 57 (0 = nenhuma) */
  const [sobraram, setSobraram] = useState(0);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState<Filtro['aba']>('tudo');
  const [so, setSo] = useState<Recorte>('abertas');
  /* `busca` é o que está escrito no campo; `termo` é o que já virou consulta */
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');
  const [ocupado, setOcupado] = useState(true);
  /* A RESPOSTA ATRASADA SOBRESCREVIA A RECENTE.

     Era `const r = await lista(f); setItens(r.itens)`, sem conferir se ainda
     era a busca atual. Medido num navegador de verdade, atrasando a primeira
     resposta em 4 segundos: a pessoa digitava "arte", a consulta de "arte"
     voltava primeiro, e depois a resposta velha chegava e pintava por cima.
     A lista mostrava o resultado de uma busca que ninguém pediu mais, e nada
     na tela dizia isso.

     `Casca.tsx` já tinha a guarda (`let vivo`) para a mesma classe de
     defeito. Aqui a guarda é um contador: cada chamada carimba o número do
     seu pedido e só escreve na tela se ainda for o último. */
  const pedido = useRef(0);

  useEffect(() => {
    if (busca.trim() === termo) return;
    const id = setTimeout(() => setTermo(busca.trim()), ESPERA_DA_BUSCA);
    return () => clearTimeout(id);
  }, [busca, termo]);

  const buscar = useCallback(async () => {
    const f: Filtro = { aba, busca: termo || undefined };
    if (so === 'abertas') f.abertas = true;
    if (so === 'atrasadas') f.atrasadas = true;
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

  /* SEM `setItens(null)` AQUI, E ISSO É O CONSERTO.

     Apagar a lista antes de a próxima chegar fazia a tela piscar em branco a
     cada troca de filtro e a cada tecla. A lista anterior fica no lugar e o
     bloco diz `aria-busy`, que é como se avisa "estou trocando isto" sem
     tirar da frente o que a pessoa estava lendo. O esqueleto continua, mas só
     na primeira carga, quando não há nada para segurar. */
  useEffect(() => { buscar(); }, [buscar]);

  if (!eu) return null;

  /* RÓTULO CURTO PARA OS QUATRO CABEREM NA TELA DE UMA VEZ.

     Com "O que eu pedi / Do meu setor / Comigo / Tudo que eu vejo", o quarto
     recorte ficava fora da tela em 390px, e nada avisava que ele existia.
     A saída óbvia seria um esmaecido na borda indicando rolagem — mas isso é
     resolver por sinalização um problema que some com rótulo menor. Filtro
     que cabe inteiro na tela não precisa ser descoberto. */
  const abas: { v: Filtro['aba']; rot: string }[] = [
    { v: 'minhas', rot: 'Eu pedi' },
  ];
  if (eu.setor_atende) abas.push({ v: 'setor', rot: 'Meu setor' });
  if (eu.papel !== 'solicitante') abas.push({ v: 'comigo', rot: 'Comigo' });
  abas.push({ v: 'tudo', rot: 'Tudo' });

  return (
    <>
      <div className="dm-entre" style={{ marginBottom: 'var(--dm-e3)' }}>
        <div>
          <div className="dm-rot">{'>'} demandas</div>
          <h1 style={{ marginTop: 4 }}>O que a igreja está pedindo</h1>
        </div>
        <Link className="dm-btn dm-pri" href="/demandas/nova">Pedir alguma coisa</Link>
      </div>

      {/* Duas perguntas, dois controles, nessa ordem: primeiro "de quem?",
          depois "em que estado?". Juntas num monte só, como estavam, elas se
          anulavam — a pessoa não sabia qual mexer para achar o que queria. */}
      <div className="dm-card">
        <div className="dm-seg" role="group" aria-label="De quem">
          {abas.map(a => (
            <button key={a.v} type="button" aria-pressed={aba === a.v} onClick={() => setAba(a.v)}>{a.rot}</button>
          ))}
        </div>
        {/* SEM `dm-igual` DESDE QUE SÃO QUATRO.

            `dm-igual` existia para três rótulos curtos em fatias iguais, sem
            rolagem, "porque cabem". Com o quarto recorte param de caber, e a
            variante também desligava a regra de 370px (`.dm-seg:not(.dm-igual)`),
            então não havia nem a queda para duas por duas. Medido no Chromium,
            recriando aquela geometria com os quatro botões:

              360px: a tira mede 294px, os quatro precisam de 346, e "Todas"
                     termina em x=379 contra a borda do cartão em 327;
              390px: a tira mede 324px, os mesmos 346, "Todas" em 379 contra 357.

            Ou seja: o quarto recorte ficaria pendurado para fora do cartão nos
            dois tamanhos de celular. Sem a variante vale a regra que a tira de
            cima já usa com quatro botões: duas por duas abaixo de 370px, trilho
            que desliza acima disso. Nenhuma linha de folha nova. */}
        <div className="dm-seg" role="group" aria-label="Em que estado"
          style={{ marginTop: 'var(--dm-e1)' }}>
          {RECORTES.map(([v, r]) => (
            <button key={v} type="button" aria-pressed={so === v} onClick={() => setSo(v)}>{r}</button>
          ))}
        </div>
        <label className="dm-busca">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input aria-label="Procurar" placeholder="Procurar por título ou número"
            value={busca} onChange={e => setBusca(e.target.value)} />
        </label>
      </div>

      {/* A TELA MAIS USADA DO SISTEMA NÃO TINHA COMO TENTAR DE NOVO.
          Medido, derrubando todas as RPCs menos `dem_quem_sou`: `/demandas` e
          `/demandas/d/[n]` mostravam o erro e nenhuma saída; as outras três já
          ofereciam. Falha de rede no 4G da igreja é o caso comum. */}
      {erro ? (
        <>
          <Aviso tom="bad">{erro}</Aviso>
          <button className="dm-btn" style={{ marginBottom: 'var(--dm-e3)' }} onClick={buscar}>
            Tentar de novo
          </button>
        </>
      ) : null}

      <div aria-busy={ocupado}>
        {itens === null ? <Esqueleto /> : itens.length === 0 ? (
          <Vazio titulo={vazioDe(aba, so)}>
            {so !== 'tudo'
              ? <>Experimente “Todas” aqui em cima, ou <Link href="/demandas/nova">abrir uma demanda</Link>.</>
              : <>Quando alguém pedir alguma coisa, aparece aqui.</>}
          </Vazio>
        ) : (
          <>
            <Resumão itens={itens} eu={eu} />
            <div className="dm-fila">{itens.map(d => <Linha key={d.numero} d={d} />)}</div>
            {/* LISTA CORTADA TEM QUE DIZER QUE FOI CORTADA.

                A migração 57 pôs teto de 300 na consulta, porque sem teto a
                aba "Tudo" descia 10 MB de JSON. Teto sem aviso é pior que o
                problema que ele resolve: a pessoa olharia uma lista incompleta
                achando que é a lista. */}
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

function vazioDe(aba: Filtro['aba'], so: Recorte) {
  if (so === 'atrasadas') return 'Nada atrasado.';
  /* O QUARTO RECORTE PRECISAVA DO SEU PRÓPRIO VAZIO.

     Sem esta linha, o setor que ainda não entregou nada lia "Nenhuma demanda
     em aberto." dentro do filtro "Concluídas", que é a frase de outro
     recorte e faz a pessoa achar que tocou no botão errado. */
  if (so === 'concluidas') {
    if (aba === 'minhas') return 'Nenhum pedido seu foi concluído ainda.';
    if (aba === 'setor') return 'O seu setor ainda não concluiu nada.';
    if (aba === 'comigo') return 'Você ainda não concluiu nada.';
    return 'Nada concluído ainda.';
  }
  if (aba === 'minhas') return 'Você não tem demanda aberta.';
  if (aba === 'setor') return 'O seu setor está em dia.';
  if (aba === 'comigo') return 'Nada está com você agora.';
  return 'Nenhuma demanda em aberto.';
}

/* Uma linha de leitura antes da lista: o que precisa de atenção, em palavras.
   Sem isto, o líder tem que contar as linhas vermelhas com o dedo. */
function Resumão({ itens, eu }: { itens: Resumo[]; eu: Eu }) {
  const atrasadas = itens.filter(d => situacao(d) === 'atrasada').length;
  const paradas = itens.filter(d => situacao(d) === 'parada').length;
  /* SÓ DEMANDA VIVA — 21/09/2026, auditoria de Demandas.
     `aprovacao` fica em 'pendente' para sempre quando a demanda é CANCELADA
     antes de o gestor decidir: quem pediu desistiu, e não existe valor para
     "retirado antes de decidir" (`ck_aprovacao` aceita pendente, aprovada,
     rejeitada). Contando todas, o painel dizia "4 esperam a sua aprovação"
     sobre quatro demandas encerradas — e nenhuma delas abre, porque
     `JA_FECHADA` barra `aprovar` e `rejeitar` em demanda fechada, com razão.
     Um contador que nunca zera é um contador que ensina a ignorar o painel. */
  /* E CONTAVA A COLUNA, NAO O VEREDITO — 22/09/2026.

     `aprovacao === 'pendente'` e o que foi gravado quando a demanda nasceu. O
     servidor cobra `falta_aprovacao`, que le a categoria AGORA. Quando o
     administrador liga "exige aprovacao" numa categoria que ja tem demanda
     andando, o servidor cobra a aprovacao e este numero diz ZERO: o gestor so
     descobre abrindo ficha por ficha. E o mesmo defeito da pilula de estado,
     no outro sentido — la a tela mostrava demais, aqui de menos.

     O `??` cobre carga antiga que ainda nao traga o campo. */
  const esperando = itens.filter(d =>
    (d.falta_aprovacao ?? (d.aprovacao === 'pendente'))
    && d.status !== 'concluida' && d.status !== 'cancelada').length;
  const manda = quemManda(eu.papel);
  if (!atrasadas && !paradas && !(esperando && manda)) return null;
  const partes: string[] = [];
  if (atrasadas) partes.push(`${atrasadas} ${atrasadas === 1 ? 'passou do prazo' : 'passaram do prazo'}`);
  if (paradas) partes.push(`${paradas} sem movimento há mais de uma semana`);
  if (esperando && manda) partes.push(`${esperando} ${esperando === 1 ? 'espera' : 'esperam'} a sua aprovação`);
  /* `tom="bad"` dava `role="alert"` a este resumo, e alerta INTERROMPE o
     leitor de tela — a cada troca de filtro. Alerta é para o que não pode
     esperar; um resumo pode. A cor continua vermelha, que é o que importa
     para quem vê; só o anúncio deixa de atropelar. */
  return (
    <div className={`dm-aviso dm-${atrasadas ? 'bad' : 'warn'}`} role="status">
      <div>{partes.join(' · ')}.</div>
    </div>
  );
}

function Linha({ d }: { d: Resumo }) {
  const sit = situacao(d);
  const atraso = diasDeAtraso(d.prazo);
  return (
    <Link href={`/demandas/d/${d.numero}`}
      className={`dm-item ${d.prioridade === 'urgente' ? 'dm-urgente' : ''} ${sit === 'atrasada' ? 'dm-atrasada' : ''}`}>
      <div className="dm-item-topo">
        <span className="dm-item-num">#{d.numero}</span>
        <span className="dm-item-tit dm-cresce">{d.titulo}</span>
      </div>
      <div className="dm-item-baixo">
        {/* A LISTA FALAVA UM VOCABULÁRIO QUE O DOCUMENTO NÃO TEM.

            A ficha já traduz os estados para os nomes do documento com
            `comoOPdfChama`; a lista, que é a tela mais usada do sistema,
            imprimia `rotStatus` mais `rotTrava` e saía com "Travada ·
            esperando alguém de fora", "Travada · falta aprovação", "Aberta".
            Cinco dos onze nomes do documento ("Aguardando aprovação",
            "Aguardando informações", "Aguardando terceiros", "Aprovada",
            "Reaberta") não apareciam em lugar nenhum daqui, e "Travada" é
            exatamente a etiqueta genérica que o documento proíbe: "os status
            devem refletir o que está acontecendo com a demanda, e não apenas
            servir como etiquetas".

            Pior que o vocabulário: `rotStatus` lê só a COLUNA `status`, e o
            portão de aprovação que o servidor cobra agora mora em
            `falta_aprovacao` (migração 88). Quando o administrador liga
            "exige aprovação" numa categoria que já tem demanda andando, a
            lista dizia "Aberta" sobre uma demanda congelada. A ficha dizia
            "Aguardando aprovação" na mesma demanda, no mesmo minuto.

            `dem_lista` já devolve tudo que `comoOPdfChama` consome
            (`status`, `travada_por`, `aprovacao`, `falta_aprovacao`,
            `reaberturas`) e `Resumo` já declara os cinco. O nome mais longo
            que sai daqui é "Aguardando informações", mais curto que o
            "Travada · esperando alguém de fora" que saía antes. */}
        <Pill tom={tomPill(d.status)}>
          <span className={`dm-ponto ${tomPill(d.status) ? 'dm-' + tomPill(d.status) : ''}`} />
          {comoOPdfChama(d)}
        </Pill>
        {tomPrioridade(d.prioridade)
          ? <Pill tom={tomPrioridade(d.prioridade)}>{rotPrioridade(d.prioridade)}</Pill> : null}
        {/* TRÊS FATOS, NÃO CINCO.

            Antes esta linha carregava: setor de quem pediu, setor que
            atende, prazo, tempo desde a última mexida e quem está com ela.
            Em 390px isso virava duas linhas e meia de texto cinza, e a
            segunda linha começava com um ponto solto — parecia lista com
            marcador quebrado.

            Numa lista, a pergunta é "o que preciso olhar primeiro". Quem
            responde isso é: de quem é, para quando, e com quem está. O setor
            de quem pediu e o "há 1 min" são contexto, não decisão, e estão
            os dois na tela da demanda, a um toque daqui. Quando a demanda
            empaca, aí sim o tempo vira decisão — e aí ele aparece. */}
        <span>{d.responsavel_setor}</span>
        <span className="dm-prazo">
          {sit === 'atrasada' ? `${atraso} ${atraso === 1 ? 'dia' : 'dias'} de atraso`
            : sit === 'hoje' ? 'vence hoje'
            : d.prazo ? `para ${dataCurta(d.prazo)}` : 'sem data'}
        </span>
        {sit === 'parada' ? <span>parada há {d.parada_dias} dias</span> : null}
        {d.responsavel ? <span>com {d.responsavel.split(' ')[0]}</span> : null}
      </div>
    </Link>
  );
}
