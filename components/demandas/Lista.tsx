'use client';
/* A LISTA DE DEMANDAS, UMA SÓ, PARA OS DOIS PORTAIS · migração 94.

   Até a 93 esta lista era a tela `/demandas` inteira, com a mesma cara para
   todo mundo e a aba "Tudo" aberta por padrão. Agora ela é uma peça: o portal
   de quem pede a monta com "Minhas / Acompanho / Ministério" e "Abertas /
   Concluídas / Histórico"; o portal de quem atende, com "Aguardando você /
   Comigo / Do setor" e cinco estados. Quem decide o que cada recorte traz é
   `dem_lista`, sempre dentro de `pode_ver`: a peça só pergunta.

   Tudo que a lista antiga já tinha provado continua aqui, com os mesmos
   comentários: a resposta atrasada que não sobrescreve a recente, a busca que
   espera o dedo parar, a lista cortada que diz que foi cortada, e a pílula que
   fala os nomes do documento. */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Aviso, Esqueleto, Pill, Vazio } from './Ui';
import { lista, type Aba, type Filtro } from '@/lib/demandas/api';
import {
  MOTIVOS, comoOPdfChama, dataCurta, diasDeAtraso, recadoDoErro, rotPrioridade,
  situacao, tomPill, tomPrioridade, quemManda,
} from '@/lib/demandas/regras';
import type { Eu, Resumo } from '@/lib/demandas/tipos';

export type Recorte = 'abertas' | 'urgentes' | 'atrasadas' | 'concluidas' | 'tudo';

/* UMA IDA AO BANCO POR TECLA, MEDIDA NO NAVEGADOR.

   Digitar "arte do culto" disparava 13 chamadas a `dem_lista`, uma por
   letra, cada uma podendo trazer 300 itens (174 kB medidos no teto). Aba e
   filtro continuam instantâneos, porque são um toque e não treze; só o texto
   espera. */
const ESPERA_DA_BUSCA = 300;

export default function Lista({ eu, abas, recortes, abaInicial, recorteInicial = 'abertas', vazio, contas, controle }: {
  eu: Eu;
  /** "de quem". Com uma opção só, a tira não aparece: pergunta sem escolha é ruído. */
  abas: { v: Aba; rot: string }[];
  /** "em que estado", com o rótulo que faz sentido em cada portal */
  recortes: { v: Recorte; rot: string }[];
  abaInicial?: Aba;
  recorteInicial?: Recorte;
  /** a frase da lista vazia, que depende do recorte */
  vazio: (aba: Aba, so: Recorte) => { titulo: string; dica?: React.ReactNode };
  /** quantas há em cada aba, quando o portal já sabe (vem de `dem_portal`) */
  contas?: Partial<Record<Aba, number>>;
  /** quando quem escolhe o recorte é a página (o Atendimento escolhe pelos
      seis atalhos do topo), a lista não desenha as tiras dela: dois
      controles para a mesma pergunta é como a pessoa se perde */
  controle?: { aba: Aba; so: Recorte };
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
  const [ocupado, setOcupado] = useState(true);
  /* A RESPOSTA ATRASADA SOBRESCREVIA A RECENTE.

     Era `const r = await lista(f); setItens(r.itens)`, sem conferir se ainda
     era a busca atual. Medido num navegador de verdade, atrasando a primeira
     resposta em 4 segundos: a lista mostrava o resultado de uma busca que
     ninguém pediu mais. Cada chamada carimba o número do seu pedido e só
     escreve na tela se ainda for o último. */
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

  const v = vazio(aba, so);
  return (
    <>
      <div className="dm-card">
        {!controle && abas.length > 1 ? (
          <div className="dm-seg" role="group" aria-label="De quem">
            {abas.map(a => (
              <button key={a.v} type="button" aria-pressed={aba === a.v} onClick={() => setAba(a.v)}>
                {a.rot}{contas && contas[a.v] ? <span className="dm-selo">{contas[a.v]}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
        {!controle ? (
          <div className="dm-seg" role="group" aria-label="Em que estado"
            style={abas.length > 1 ? { marginTop: 'var(--dm-e1)' } : undefined}>
            {recortes.map(r => (
              <button key={r.v} type="button" aria-pressed={so === r.v} onClick={() => setSo(r.v)}>{r.rot}</button>
            ))}
          </div>
        ) : null}
        <label className="dm-busca" style={controle ? { marginTop: 0 } : undefined}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input type="search" aria-label="Procurar" placeholder="Título ou número"
            value={busca} onChange={e => setBusca(e.target.value)} />
        </label>
      </div>

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
        {itens === null ? <Esqueleto /> : itens.length === 0 ? (
          <Vazio titulo={v.titulo}>{v.dica}</Vazio>
        ) : (
          <>
            <Resumao itens={itens} eu={eu} />
            <div className="dm-fila">{itens.map(d => <Linha key={d.numero} d={d} />)}</div>
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

/* Uma linha de leitura antes da lista: o que precisa de atenção, em palavras.
   Só demanda viva, e o veredito do portão (`falta_aprovacao`), não a coluna. */
function Resumao({ itens, eu }: { itens: Resumo[]; eu: Eu }) {
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
  /* `role="status"` e não `alert`: alerta interrompe o leitor de tela a cada
     troca de filtro. A cor continua vermelha, que é o que importa para quem vê. */
  return (
    <div className={`dm-aviso dm-${atrasadas ? 'bad' : 'warn'}`} role="status">
      <div>{partes.join(' · ')}.</div>
    </div>
  );
}

export function Linha({ d }: { d: Resumo }) {
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
        {/* 94 · quando a lista é "o que espera por você", o que falta fazer
            vem primeiro, com o nome do botão que resolve */}
        {d.motivo ? <Pill tom="info">{MOTIVOS[d.motivo] ?? d.motivo}</Pill> : null}
        {/* os nomes do documento, pelo veredito do servidor: "Aguardando
            aprovação" e não "Travada", e nunca "Aberta" sobre uma demanda
            congelada pelo portão */}
        <Pill tom={tomPill(d.status)}>
          <span className={`dm-ponto ${tomPill(d.status) ? 'dm-' + tomPill(d.status) : ''}`} />
          {comoOPdfChama(d)}
        </Pill>
        {tomPrioridade(d.prioridade)
          ? <Pill tom={tomPrioridade(d.prioridade)}>{rotPrioridade(d.prioridade)}</Pill> : null}
        {/* três fatos, não cinco: de quem é, para quando, e com quem está */}
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
