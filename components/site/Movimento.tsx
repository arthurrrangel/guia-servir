'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/* =============================================================================
   MOVIMENTO — a revelação ao rolar, e nada mais · 11/10/2026

   Sem JS, tudo nasce visível (o CSS só esconde dentro de `.s.js`). Com JS,
   cada `.s-rev` entra quando chega perto da tela; uma rede de segurança
   revela o que sobrou depois de 1,5 s, e "reduzir movimento" desliga pelo
   CSS. Roda de novo a cada troca de página.
   ============================================================================= */
export default function Movimento() {
  const caminho = usePathname();
  useEffect(() => {
    const raiz = document.querySelector<HTMLElement>('.s');
    if (!raiz) return;
    /* AS FOTOS QUE CHEGAM (22/10/2026): a foto "lazy" entra com fusão quando
       termina de baixar (app/site.css, "AS FOTOS QUE CHEGAM"). A que já está
       pronta é marcada antes do .js, no mesmo passo (nenhum quadro sem ela); toda
       que chegar depois, ou falhar, é marcada pelo evento, ouvido no documento
       (pega também as que um componente desenhar mais tarde) */
    const chegou = (im: HTMLImageElement) => im.classList.add('s-chegou');
    raiz.querySelectorAll<HTMLImageElement>('main img').forEach(im => { if (im.complete) chegou(im); });
    const aoChegar = (e: Event) => { const t = e.target; if (t instanceof HTMLImageElement && raiz.contains(t)) chegou(t); };
    document.addEventListener('load', aoChegar, true);
    document.addEventListener('error', aoChegar, true);
    const largarFotos = () => { document.removeEventListener('load', aoChegar, true); document.removeEventListener('error', aoChegar, true); };
    raiz.classList.add('js');
    const tudo = () => raiz.querySelectorAll('.s-rev:not(.visto)').forEach(e => e.classList.add('visto'));
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { tudo(); return largarFotos; }
    const obs = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visto'); obs.unobserve(e.target); }
    }), { rootMargin: '0px 0px 18% 0px' });
    raiz.querySelectorAll('.s-rev:not(.visto)').forEach(e => obs.observe(e));
    /* o que já está na tela ao abrir entra na hora */
    requestAnimationFrame(() => raiz.querySelectorAll<HTMLElement>('.s-rev:not(.visto)').forEach(e => {
      if (e.getBoundingClientRect().top < window.innerHeight * 0.9) { e.classList.add('visto'); obs.unobserve(e); }
    }));
    /* a rolagem também revela: uma rolagem rápida salta seções inteiras entre
       dois quadros do observador */
    let pedindo = false;
    const varre = () => {
      pedindo = false;
      const lim = window.innerHeight * 1.15;
      raiz.querySelectorAll<HTMLElement>('.s-rev:not(.visto)').forEach(e => { if (e.getBoundingClientRect().top < lim) { e.classList.add('visto'); obs.unobserve(e); } });
    };
    const aoRolar = () => { if (!pedindo) { pedindo = true; requestAnimationFrame(varre); } };
    window.addEventListener('scroll', aoRolar, { passive: true });
    const rede = setTimeout(tudo, 1200);
    return () => { obs.disconnect(); clearTimeout(rede); window.removeEventListener('scroll', aoRolar); largarFotos(); };
  }, [caminho]);
  return null;
}
