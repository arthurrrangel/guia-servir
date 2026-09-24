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
import { Aviso, Cabecalho, Esqueleto, Secao, Vazio } from '@/components/demandas/Ui';
import { avisos } from '@/lib/demandas/api';
import {
  HOJE, agruparAvisos, carimbo, dataCheia, diaNoRio, fraseDoEvento, quando, recadoDoErro, semRepetir, somaDias,
  type GrupoDeAvisos,
} from '@/lib/demandas/regras';
import type { AvisoDentro } from '@/lib/demandas/tipos';

export default function Pagina() {
  return <Casca><Avisos /></Casca>;
}

type Grupo = GrupoDeAvisos;

/* o dia do Rio, e não o de UTC: das 21h à meia-noite o de UTC já é amanhã,
   e o que tinha acontecido às 15h aparecia debaixo de "Ontem" */
const dia = (iso: string) => {
  const d = diaNoRio(iso);
  const hoje = HOJE();
  if (d === hoje) return 'Hoje';
  if (d === somaDias(hoje, -1)) return 'Ontem';
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
    return { novos: agruparAvisos(todos.filter(a => a.novo)), antigos: agruparAvisos(todos.filter(a => !a.novo)) };
  }, [itens]);

  const grupo = (g: Grupo, novoBloco: boolean) => (
    <li key={`${g.numero}-${novoBloco ? 'n' : 'a'}`} className="dm-aviso-grupo">
      <Link href={`/demandas/d/${g.numero}`}><span className="dm-num">#{g.numero}</span> {g.titulo}</Link>
      <ul>
        {semRepetir(g.itens).map((a, i) => (
          <li key={`${a.em}-${i}`} className={a.novo ? 'dm-novo' : undefined}>
            {/* a frase e a hora como duas peças de `dm-sep`: o "·" antes da
                hora nunca abre a linha quando a frase quebra */}
            <div className="dm-aviso-o-que dm-sep">
              <div className="dm-sep-in">
                <span>
                  {fraseDoEvento(a)}
                  {a.novo ? <span className="dm-so-leitor"> (novo)</span> : null}
                </span>
                <span className="dm-quando" title={carimbo(a.em)}>{quando(a.em)}</span>
              </div>
            </div>
            {/* o que foi escrito: o comentário, a pergunta da trava (quem pediu
                precisa ler o que perguntaram) e o que foi feito, na conclusão */}
            {a.texto && (a.tipo === 'comentario' || (a.tipo === 'status' && (a.para === 'travada' || a.para === 'concluida')))
              ? <div className="dm-aviso-de">“{a.texto.length > 140 ? a.texto.slice(0, 140) + '…' : a.texto}”</div>
              : null}
          </li>
        ))}
      </ul>
    </li>
  );

  /* OS ANTERIORES, POR DIA E, DENTRO DO DIA, POR DEMANDA — 23/09/2026. Era
     o contrário: a demanda inteira (60 dias de fatos) ia para o dia do fato
     mais novo, e "Ana assumiu · há 8 dias" aparecia embaixo de "Ontem". Agora
     cada fato mora no dia dele, e a demanda aparece em cada dia em que teve
     fato. */
  const antigosPorDia = useMemo(() => {
    const porDia = new Map<string, AvisoDentro[]>();
    for (const a of (itens || []).filter(x => !x.novo)) {
      const d = diaNoRio(a.em);
      const lista = porDia.get(d);
      if (lista) lista.push(a); else porDia.set(d, [a]);
    }
    /* o dia mais novo em cima, pela data (a chave), e não pelo rótulo */
    return [...porDia.entries()].sort((x, y) => (x[0] < y[0] ? 1 : -1))
      .map(([d, xs]) => ({ dia: dia(d), grupos: agruparAvisos(xs) }));
  }, [itens]);

  const quantosNovos = novos.reduce((s, g) => s + g.itens.length, 0);

  return (
    <div className="dm-leitura">
      {/* o mesmo desenho das outras telas: o nome da seção em cima (o mesmo
          da aba) e a pergunta que ela responde no título */}
      <Cabecalho sobre="Avisos" titulo="O que mudou nas suas demandas"
        meta={<span>O que outras pessoas fizeram nos últimos 60 dias. Abrir esta tela marca tudo como visto.</span>} />
      {erro ? <Aviso tom="bad">{erro}</Aviso> : null}
      {itens === null ? <Esqueleto forma="lista" /> : itens.length === 0 && !erro ? (
        <div className="dm-tabela">
          <Vazio titulo="Nenhum aviso ainda.">Quando alguém mexer numa demanda sua, aparece aqui.</Vazio>
        </div>
      ) : (
        <>
          {novos.length ? (
            <Secao titulo="Novos" n={quantosNovos} destaque>
              <ul className="dm-avisos dm-tabela">{novos.map(g => grupo(g, true))}</ul>
            </Secao>
          ) : null}
          {/* "Anteriores" só existe em contraste com "Novos": sem novos, a
              lista vem direto, com os dias como cabeçalho */}
          {antigos.length ? (
            (() => {
              const tabela = (
                <div className="dm-tabela">
                  {antigosPorDia.map(b => (
                    <div key={b.dia}>
                      <div className="dm-avisos-dia">{b.dia}</div>
                      <ul className="dm-avisos">{b.grupos.map(g => grupo(g, false))}</ul>
                    </div>
                  ))}
                </div>
              );
              return novos.length ? <Secao titulo="Anteriores">{tabela}</Secao> : tabela;
            })()
          ) : null}
        </>
      )}
    </div>
  );
}
