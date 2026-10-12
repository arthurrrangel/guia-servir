'use client';
import { useEffect, useRef, useState } from 'react';

/* =============================================================================
   O VÍDEO DO HERÓI · 12/10/2026

   Um loop curto, sem som, por cima da foto do herói (a foto é o pôster: é o
   que aparece enquanto o vídeo carrega, e o que fica quando ele não toca).

   - escolhe o arquivo pela tela: em pé, o vídeo vertical; deitada, o largo.
     Sem vídeo para a tela atual, não carrega nada (fica a foto).
   - cada vídeo vai em MP4 (H.264, primeiro: iPhone e Chrome decodificam no
     chip) e WebM (VP9, para navegador sem H.264, como o Chromium de Linux).
     O nome passado é sem extensão: "/site/heroi-largo".
   - não toca com "reduzir movimento" ligado nem com economia de dados.
   - só começa a baixar depois que a página montou (não disputa com a foto,
     que é o maior elemento da primeira tela).
   - pausa fora da tela e com a aba escondida: bateria do celular.
   - aparece com um fade quando o primeiro quadro está pronto.
   ============================================================================= */
export function VideoHeroi({ largo, retrato }: { largo?: string; retrato?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const economia = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (quieto || economia) return;
    const emPe = window.matchMedia('(orientation: portrait)').matches;
    const escolhido = emPe ? retrato : largo;
    if (escolhido) setSrc(escolhido);
  }, [largo, retrato]);

  useEffect(() => {
    const v = ref.current;
    if (!v || !src) return;
    /* o atributo muted (não só a propriedade) é o que o Safari do iPhone confere para deixar tocar sozinho */
    v.muted = true; v.setAttribute('muted', '');
    const tocar = () => { v.play().catch(() => {}); };
    const visivel = { tela: true, aba: !document.hidden };
    const decidir = () => (visivel.tela && visivel.aba ? tocar() : v.pause());
    const obs = new IntersectionObserver(es => { visivel.tela = es.some(e => e.isIntersecting); decidir(); }, { threshold: 0.05 });
    obs.observe(v);
    const aba = () => { visivel.aba = !document.hidden; decidir(); };
    document.addEventListener('visibilitychange', aba);
    tocar();
    return () => { obs.disconnect(); document.removeEventListener('visibilitychange', aba); };
  }, [src]);

  if (!src) return null;
  return (
    <video
      ref={ref}
      className={'s-heroi-video' + (pronto ? ' pronto' : '')}
      muted
      loop
      playsInline
      autoPlay
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
      disablePictureInPicture
      onPlaying={() => setPronto(true)}
    >
      <source src={`${src}.mp4`} type="video/mp4" />
      <source src={`${src}.webm`} type="video/webm" />
    </video>
  );
}
