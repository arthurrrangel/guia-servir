'use client';

import { useEffect } from 'react';

/* =============================================================================
   A VIDA DA PÁGINA DO FOLLOW · 19/10/2026

   Tudo que se move fora do hero, em nível de sussurro:
   · `.f-rev` entra quando chega perto da tela (sem JS, nasce visível);
   · `.f-chev` (o chevron da marca entre as seções) se traça ao aparecer;
   · a aba escondida pausa toda animação (body.paused), para a grade de LEDs
     e o pulso da contagem não gastarem bateria às escuras.
   "Menos movimento" é respeitado pelo CSS (estados finais) e aqui (tudo
   marcado de uma vez).
   ============================================================================= */
export default function Vida() {
  useEffect(() => {
    const raiz = document.querySelector<HTMLElement>('.f');
    if (!raiz) return;
    raiz.classList.add('js');
    const reduz = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const revela = (e: Element) => { e.classList.add(e.classList.contains('f-chev') ? 'in' : 'visto'); };
    const todos = () => raiz.querySelectorAll('.f-rev:not(.visto), .f-chev:not(.in)');
    if (reduz) { todos().forEach(revela); }
    else {
      const obs = new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting) { revela(e.target); obs.unobserve(e.target); }
      }), { rootMargin: '0px 0px 14% 0px' });
      todos().forEach(e => obs.observe(e));
      /* uma rolagem rápida salta seções inteiras entre dois quadros do observador */
      let pedindo = false;
      const varre = () => {
        pedindo = false;
        const lim = window.innerHeight * 1.15;
        todos().forEach(e => { if (e.getBoundingClientRect().top < lim) { revela(e); obs.unobserve(e); } });
      };
      const aoRolar = () => { if (!pedindo) { pedindo = true; requestAnimationFrame(varre); } };
      window.addEventListener('scroll', aoRolar, { passive: true });
      const rede = setTimeout(() => todos().forEach(revela), 1500);
      const aoEsconder = () => document.body.classList.toggle('paused', document.hidden);
      document.addEventListener('visibilitychange', aoEsconder);
      return () => { obs.disconnect(); clearTimeout(rede); window.removeEventListener('scroll', aoRolar); document.removeEventListener('visibilitychange', aoEsconder); document.body.classList.remove('paused'); };
    }
  }, []);
  return null;
}
