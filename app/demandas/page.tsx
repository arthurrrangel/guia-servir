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
import { useCallback, useEffect, useState } from 'react';
import Casca, { useEu } from '@/components/demandas/Casca';
import { Aviso, Esqueleto, Pill, Vazio } from '@/components/demandas/Ui';
import { lista, type Filtro } from '@/lib/demandas/api';
import {
  dataCurta, diasDeAtraso, quando, recadoDoErro, rotPrioridade, rotStatus,
  rotTrava, situacao, tomPill, tomPrioridade, quemManda,
} from '@/lib/demandas/regras';
import type { Eu, Resumo } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca><Painel /></Casca>;
}

function Painel() {
  const { eu } = useEu();
  const [itens, setItens] = useState<Resumo[] | null>(null);
  /* quantas ficaram de fora do teto de 300 da migração 57 (0 = nenhuma) */
  const [sobraram, setSobraram] = useState(0);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState<Filtro['aba']>('tudo');
  const [so, setSo] = useState<'abertas' | 'atrasadas' | 'tudo'>('abertas');
  const [busca, setBusca] = useState('');

  const buscar = useCallback(async () => {
    const f: Filtro = { aba, busca: busca.trim() || undefined };
    if (so === 'abertas') f.abertas = true;
    if (so === 'atrasadas') f.atrasadas = true;
    const r = await lista(f);
    if (!r.ok) { setErro(recadoDoErro(r, 'carregar a lista')); setItens([]); setSobraram(0); return; }
    setErro(''); setItens(r.itens);
    setSobraram(r.tem_mais ? Math.max((r.total || 0) - r.itens.length, 0) : 0);
  }, [aba, so, busca]);

  useEffect(() => { setItens(null); buscar(); }, [buscar]);

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
        <div className="dm-seg dm-igual" role="group" aria-label="Em que estado"
          style={{ marginTop: 'var(--dm-e1)' }}>
          {([['abertas', 'Em aberto'], ['atrasadas', 'Atrasadas'], ['tudo', 'Todas']] as const).map(([v, r]) => (
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

              A migração 57 pôs teto de 300 na consulta, porque sem teto a aba
              "Tudo" descia 10 MB de JSON. Teto sem aviso é pior que o
              problema que ele resolve: a pessoa olharia uma lista incompleta
              achando que é a lista. */}
          {sobraram > 0 && (
            <p className="dm-corte" role="status">
              Mostrando as {itens.length} mais urgentes. Outras {sobraram} não
              couberam — use os filtros acima, ou busque pelo número da demanda.
            </p>
          )}
        </>
      )}
    </>
  );
}

function vazioDe(aba: Filtro['aba'], so: string) {
  if (so === 'atrasadas') return 'Nada atrasado.';
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
        <Pill tom={tomPill(d.status)}>
          <span className={`dm-ponto ${tomPill(d.status) ? 'dm-' + tomPill(d.status) : ''}`} />
          {rotStatus(d.status)}
          {d.travada_por ? ` · ${rotTrava(d.travada_por).toLowerCase()}` : ''}
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
