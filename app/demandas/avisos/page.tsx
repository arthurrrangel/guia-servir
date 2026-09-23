'use client';
/* OS AVISOS: o que mudou nas minhas demandas desde a última vez.

   Cada aviso é um fato do histórico feito por OUTRA pessoa numa demanda que
   a pessoa pediu, atende, acompanha ou lidera. Vêm de `dem_avisos` (94), que
   decide o recorte pelo `pode_ver`; abrir a tela marca tudo como visto
   (`p_marcar`) e zera o selo da aba.

   AGRUPADO POR DEMANDA — 23/09/2026. Era um extrato: uma linha por fato, a
   demanda #105 com cinco avisos seguidos repetindo o título e o carimbo em
   cada um. Agora o grupo é a demanda (o título, que é o que a pessoa usa
   para decidir se abre, vira o cabeçalho), os fatos ficam embaixo, "Novos"
   vêm antes de "Anteriores", e o dia separa os anteriores. Assumir e "mudou
   para Em execução" do mesmo toque viram uma linha, como na ficha. */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Casca, { useEu } from '@/components/demandas/Casca';
import { Aviso, Esqueleto, Vazio } from '@/components/demandas/Ui';
import { avisos } from '@/lib/demandas/api';
import { carimbo, dataCheia, fraseDoEvento, quando, recadoDoErro } from '@/lib/demandas/regras';
import type { AvisoDentro } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca><Avisos /></Casca>;
}

type Grupo = { numero: number; titulo: string; itens: AvisoDentro[]; novo: boolean };

/* agrupa por demanda, mantendo a ordem de chegada (do mais novo para o mais
   antigo); dentro do grupo, os fatos na mesma ordem */
function agrupar(itens: AvisoDentro[]): Grupo[] {
  const m = new Map<number, Grupo>();
  for (const a of itens) {
    const g = m.get(a.numero) || { numero: a.numero, titulo: a.titulo, itens: [], novo: false };
    g.itens.push(a);
    if (a.novo) g.novo = true;
    m.set(a.numero, g);
  }
  return [...m.values()];
}

/* "assumiu" e "mudou de Aberta para Em execução" no mesmo instante são um
   gesto só: a segunda linha some quando está colada na primeira */
function semRepetir(itens: AvisoDentro[]): AvisoDentro[] {
  const ms = (e: { em: string }) => { const t = Date.parse(e.em); return Number.isNaN(t) ? 0 : t; };
  return itens.filter((e, i) => {
    if (!(e.tipo === 'status' && (e.de || 'aberta') === 'aberta' && e.para === 'execucao')) return true;
    return ![itens[i - 1], itens[i + 1]].some(o => o && o.tipo === 'responsavel' && o.quem === e.quem
      && Math.abs(ms(o) - ms(e)) < 5000);
  });
}

const dia = (iso: string) => {
  const d = iso.slice(0, 10);
  const hoje = new Date().toISOString().slice(0, 10);
  if (d === hoje) return 'Hoje';
  const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (d === ontem) return 'Ontem';
  return dataCheia(d);
};

function Avisos() {
  const ctx = useEu();
  const [itens, setItens] = useState<AvisoDentro[] | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    avisos(true).then(r => {
      if (!vivo) return;
      if (!r.ok) { setErro(recadoDoErro(r, 'carregar os avisos')); setItens([]); return; }
      setItens(r.itens || []);
      ctx.zerarAvisos?.();
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { novos, antigos } = useMemo(() => {
    const todos = itens || [];
    return { novos: agrupar(todos.filter(a => a.novo)), antigos: agrupar(todos.filter(a => !a.novo)) };
  }, [itens]);

  const grupo = (g: Grupo, novoBloco: boolean) => (
    <li key={`${g.numero}-${novoBloco ? 'n' : 'a'}`} className="dm-aviso-grupo">
      <Link href={`/demandas/d/${g.numero}`}>#{g.numero} {g.titulo}</Link>
      <ul>
        {semRepetir(g.itens).map((a, i) => (
          <li key={`${a.em}-${i}`} className={a.novo ? 'dm-novo' : undefined}>
            <div className="dm-aviso-o-que">
              {fraseDoEvento(a)}
              {a.novo ? <span className="dm-so-leitor"> (novo)</span> : null}
              <span className="dm-mudo" title={carimbo(a.em)}> · {quando(a.em)}</span>
            </div>
            {a.tipo === 'comentario' && a.texto
              ? <div className="dm-aviso-de">“{a.texto.length > 140 ? a.texto.slice(0, 140) + '…' : a.texto}”</div>
              : null}
          </li>
        ))}
      </ul>
    </li>
  );

  /* os anteriores, separados por dia */
  const antigosPorDia = useMemo(() => {
    const blocos: { dia: string; grupos: Grupo[] }[] = [];
    for (const g of antigos) {
      const d = dia(g.itens[0].em);
      const ultimo = blocos[blocos.length - 1];
      if (ultimo && ultimo.dia === d) ultimo.grupos.push(g); else blocos.push({ dia: d, grupos: [g] });
    }
    return blocos;
  }, [antigos]);

  return (
    <>
      <div className="dm-cab">
        <div>
          <div className="dm-rot">{'>'} avisos</div>
          <h1 style={{ marginTop: 4 }}>Avisos</h1>
          <p className="dm-peq dm-mudo" style={{ margin: '6px 0 0' }}>
            O que outras pessoas fizeram nas suas demandas, nos últimos 60 dias.
          </p>
        </div>
      </div>
      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}
      <div className="dm-duas">
      <div className="dm-leitura-larga">
        {itens === null ? <Esqueleto forma="lista" /> : itens.length === 0 && !erro ? (
          <Vazio titulo="Nenhum aviso ainda.">Quando alguém mexer numa demanda sua, aparece aqui.</Vazio>
        ) : (
          <>
            {novos.length ? (
              <>
                <h2 style={{ margin: '0 0 var(--dm-e1)' }}>Novos<span className="dm-selo">{novos.reduce((s, g) => s + g.itens.length, 0)}</span></h2>
                <ul className="dm-avisos">{novos.map(g => grupo(g, true))}</ul>
              </>
            ) : null}
            {antigos.length ? (
              <>
                <h2 style={{ margin: `${novos.length ? 'var(--dm-e4)' : '0'} 0 var(--dm-e1)` }}>Anteriores</h2>
                {antigosPorDia.map(b => (
                  <div key={b.dia}>
                    <div className="dm-avisos-dia">{b.dia}</div>
                    <ul className="dm-avisos">{b.grupos.map(g => grupo(g, false))}</ul>
                  </div>
                ))}
              </>
            ) : null}
          </>
        )}
      </div>
      {/* a coluna da direita no desktop: o que esta tela é, em duas linhas,
          no lugar de 40% de tela vazia */}
      <aside className="dm-card dm-quieto dm-fixa dm-so-desktop" aria-label="Como funciona">
        <h3>Como funciona</h3>
        <p className="dm-peq dm-mudo" style={{ margin: 0 }}>
          Aparece aqui o que outras pessoas fizeram nas suas demandas: assumiram, mudaram o prazo,
          escreveram, concluíram. Abrir esta tela marca tudo como visto.
        </p>
      </aside>
      </div>
    </>
  );
}
