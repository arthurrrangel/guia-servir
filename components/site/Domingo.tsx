'use client';
import { useCallback, useRef, useState } from 'react';
import gerado from '@/lib/site/videos.gerado.json';
import { Video } from './Video';
import { ligaTexto } from './Blocos';

/* =============================================================================
   COMO É UM DOMINGO · 13/10/2026

   Eram quatro fotos numeradas (acolhida, louvor, Palavra, oração), de
   qualidades e luzes diferentes. Agora é um vídeo só, em quatro capítulos.

   - computador: o vídeo à esquerda e a lista à direita; o capítulo que está
     passando acende e uma linha corre embaixo dele. Tocar num item leva o
     vídeo para aquele momento.
   - celular: a lista inteira embaixo do vídeo dava 1.100 px de rolagem com
     três itens apagados. Vira o formato de "stories": quatro barrinhas em
     cima do texto e só o capítulo atual, no mesmo lugar (os quatro moram na
     mesma célula da grade: a altura é a do maior, nada pula). Sem vídeo, as
     barrinhas são abas e o texto troca no toque.

   Os segundos em que cada capítulo começa vêm de lib/site/videos.gerado.json
   (scripts/site-videos.py grava ao montar o trecho). Sem vídeo (reduzir
   movimento, economia de dados), fica o pôster. A home usa a forma curta;
   o /cultos, a com horário.
   ============================================================================= */

type Item = { n: string; t: string; d: string };
const ARQ = '/site/v/domingo-v';
const DADOS = (gerado as Record<string, Record<string, { duracao: number; capitulos?: number[] }>>).domingo?.V;
const CAPS = DADOS?.capitulos ?? [0];
const DUR = DADOS?.duracao ?? 0;

export function Domingo({ itens, rotulo }: { itens: ReadonlyArray<Item>; rotulo: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [vivo, setVivo] = useState(false);
  const [cap, setCap] = useState(0);
  const [prog, setProg] = useState(0);

  const aoTempo = useCallback((t: number, d: number) => {
    const total = Number.isFinite(d) && d > 0 ? d : DUR;
    let k = 0;
    for (let i = 0; i < CAPS.length; i++) if (t >= CAPS[i]) k = i;
    const ini = CAPS[k], fimCap = CAPS[k + 1] ?? total;
    setCap(k);
    setProg(Math.max(0, Math.min(1, (t - ini) / Math.max(0.1, fimCap - ini))));
  }, []);

  const irPara = (k: number) => {
    setCap(k); setProg(0);
    const v = ref.current;
    if (!v || !vivo) return;
    v.currentTime = (CAPS[k] ?? 0) + 0.04;
    v.play().catch(() => {});
  };

  /* quanto de cada barrinha está cheio: as de trás cheias, a atual andando */
  const cheio = (k: number) => (!vivo ? (k === cap ? 1 : 0) : k < cap ? 1 : k === cap ? prog : 0);

  return (
    <div className={'s-dom' + (vivo ? ' vivo' : '')}>
      <div className="s-quadro v s-dom-quadro">
        <img src={`${ARQ}.webp`} width={720} height={900} alt="" loading="lazy" decoding="async" />
        <Video ref={ref} src={ARQ} perto className="s-quadro-video" aoTempo={aoTempo} aoTocar={() => setVivo(true)} />
      </div>
      <div className="s-dom-texto">
        {/* as barrinhas (só no celular) */}
        <div className="s-dom-barras" role="group" aria-label={rotulo}>
          {itens.map((it, k) => (
            <button key={it.t} type="button" onClick={() => irPara(k)} aria-label={`${it.n} ${it.t}`} aria-current={k === cap ? 'step' : undefined}>
              <i style={{ transform: `scaleX(${cheio(k)})` }} />
            </button>
          ))}
        </div>
        <ol className="s-dom-lista" aria-label={rotulo}>
          {itens.map((it, k) => {
            const atual = k === cap;
            const miolo = (
              <>
                <small>{it.n}</small>
                <b>{it.t}</b>
                <p>{ligaTexto(it.d)}</p>
                <i className="s-dom-linha" aria-hidden="true" style={vivo && atual ? { transform: `scaleX(${prog})` } : undefined} />
              </>
            );
            return (
              <li key={it.t} className={atual ? 'atual' : undefined} aria-current={vivo && atual ? 'step' : undefined}>
                {vivo ? <button type="button" onClick={() => irPara(k)}>{miolo}</button> : <div>{miolo}</div>}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
