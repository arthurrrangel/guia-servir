'use client';
import { useMemo, useState } from 'react';
import { IcSeta } from '@/components/Icones';
import { canalDeConversa } from '@/lib/igreja';
import { PEQUENAS_GUIAS, mapaDaPequenaGuia, type PequenaGuia } from '@/lib/pequenas-guias';

/* =============================================================================
   OS GRUPOS, COM FILTRO POR DIA

   Doze cartões é lista demais para escolher de olho. O filtro responde a
   pergunta real de quem escolhe — "qual dia eu posso?" — e reduz a lista a
   três ou quatro. Sem filtro ativo, aparecem todos. É um estado só, sem
   roteamento e sem rede: a lista já está na página.

   O mapa continua um por grupo, no bairro (ver lib/pequenas-guias). Os
   cartões escondidos saem do fluxo (display:none), então os mapas deles nem
   carregam — o filtro também é economia de rede.
   ============================================================================= */

const DIAS: Array<{ rot: string; teste: (p: PequenaGuia) => boolean }> = [
  { rot: 'Todos', teste: () => true },
  { rot: 'Terça', teste: p => p.dia === 'Terça' && !p.online },
  { rot: 'Quarta', teste: p => p.dia === 'Quarta' && !p.online },
  { rot: 'Quinta', teste: p => p.dia === 'Quinta' && !p.online },
  { rot: 'Online', teste: p => !!p.online },
];

export function Grupos() {
  const [ativo, setAtivo] = useState(0);
  const contagens = useMemo(() => DIAS.map(d => PEQUENAS_GUIAS.filter(d.teste).length), []);
  const teste = DIAS[ativo].teste;
  return (
    <>
      <div className="chips" role="group" aria-label="Filtrar por dia">
        {DIAS.map((d, i) => (
          <button key={d.rot} type="button" className="chip" aria-pressed={i === ativo} onClick={() => setAtivo(i)}>
            {d.rot}<small>{contagens[i]}</small>
          </button>
        ))}
      </div>
      <div className="pgs centro fila" aria-live="polite">
        {PEQUENAS_GUIAS.map(pg => {
          const conv = canalDeConversa(`Oi! Vi o site da GUIA e quero ir na ${pg.nome} (${pg.dia}, ${pg.hora}). Meu nome é: `);
          const visivel = teste(pg);
          return (
            <article key={pg.nome} className={'pg' + (visivel ? '' : ' some')} aria-hidden={!visivel}>
              <div className="pg-mapa">
                {pg.online
                  ? <div className="pg-online" aria-hidden="true"><span>{pg.online}</span></div>
                  : <>
                      <iframe src={mapaDaPequenaGuia(pg)} title={`Mapa: ${pg.nome}, ${pg.bairro}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                      <span className="pg-mira" aria-hidden="true" />
                    </>}
              </div>
              <div className="pg-corpo">
                <p className="g-rot">{pg.bairro}</p>
                <span className="pg-nome">{pg.nome}</span>
                <span className="pg-quando">{pg.dia}, {pg.hora}</span>
                {(pg.lideres || pg.publico) && (
                  <span className="pg-nota">{[pg.lideres, pg.publico].filter(Boolean).join(' · ')}</span>
                )}
                <div className="g-acoes">
                  <a href={conv.href} target="_blank" rel="noreferrer" className="acao cheia">Quero ir nessa <IcSeta /></a>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
