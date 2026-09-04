'use client';
import { useEffect, useRef } from 'react';

/* =============================================================================
   CONTADOR — o número sobe até o valor quando entra na tela

   A faixa de números da home é a única prova concreta da página: quantas
   pessoas servem, em quantas áreas, hoje, saído do banco. Um número que sobe
   de 0 até 118 em um segundo faz a pessoa OLHAR para ele — e olhar para a
   prova é o que a faixa existe para provocar.

   O valor final está no HTML desde o servidor (é o que o Google e o leitor
   de tela leem). A animação é só o que o olho vê nos primeiros 1,1s, e em
   prefers-reduced-motion ela nem começa. Curva de saída: rápida no início,
   desacelerando no fim, para o último dígito assentar em vez de bater.
   ============================================================================= */

export default function Contador({ n, dur = 1100 }: { n: number; dur?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!Number.isFinite(n) || n <= 0) return;

    let quadro = 0;
    const obs = new IntersectionObserver(es => {
      if (!es.some(e => e.isIntersecting)) return;
      obs.disconnect();
      const t0 = performance.now();
      const passo = (t: number) => {
        const p = Math.min(1, (t - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);           /* easeOutCubic */
        el.textContent = String(Math.round(n * e));
        if (p < 1) quadro = requestAnimationFrame(passo);
        else el.textContent = String(n);
      };
      el.textContent = '0';
      quadro = requestAnimationFrame(passo);
    }, { threshold: 0.4 });
    obs.observe(el);
    return () => { obs.disconnect(); cancelAnimationFrame(quadro); el.textContent = String(n); };
  }, [n, dur]);

  return <span ref={ref}>{n}</span>;
}
