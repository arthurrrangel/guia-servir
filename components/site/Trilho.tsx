'use client';
import { Children, useCallback, useEffect, useRef, useState } from 'react';

/* =============================================================================
   O TRILHO · 12/10/2026

   No computador é a grade de sempre (a classe que vier: s-cartoes, pgs,
   s-funcoes...). No celular, abaixo de 760 px, a mesma lista vira uma faixa
   de deslizar: um cartão no centro, a ponta do vizinho dos dois lados (é o
   que diz "tem mais") e os pontos embaixo dizendo onde a pessoa está.

   Por que existe: a apresentação é de computador. Cinco cartões numa linha,
   no celular, viravam cinco caixas pretas empilhadas (1.700 px de rolagem
   só nas áreas do /servir; 2.700 px nos grupos da Pequena Guia).

   - o deslizar é CSS puro (scroll-snap): sem JS a faixa funciona igual;
   - os pontos nascem no HTML com a conta dos filhos (sem pulo de layout) e
     acompanham a rolagem; tocar num ponto leva ao cartão;
   - cartão escondido por filtro (display:none, como os grupos por dia) não
     conta: o trilho remede quando a classe de um filho muda e volta ao
     começo se a lista mudou de tamanho.
   ============================================================================= */
export function Trilho({ className = '', rotulo, style, children }: { className?: string; rotulo: string; style?: React.CSSProperties; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(() => Children.toArray(children).length);
  const [i, setI] = useState(0);
  const [rola, setRola] = useState(true);

  const visiveis = useCallback(() => {
    const el = ref.current;
    return el ? ([...el.children] as HTMLElement[]).filter(c => c.offsetParent !== null) : [];
  }, []);

  const medir = useCallback(() => {
    const el = ref.current; if (!el) return;
    const fs = visiveis();
    setN(fs.length);
    setRola(el.scrollWidth > el.clientWidth + 4);
    const meio = el.scrollLeft + el.clientWidth / 2;
    let k = 0, d = Infinity;
    fs.forEach((c, j) => { const dd = Math.abs(c.offsetLeft + c.offsetWidth / 2 - meio); if (dd < d) { d = dd; k = j; } });
    setI(k);
  }, [visiveis]);

  useEffect(() => {
    const el = ref.current; if (!el) return;
    let pedido = 0;
    const aoRolar = () => { if (!pedido) pedido = requestAnimationFrame(() => { pedido = 0; medir(); }); };
    el.addEventListener('scroll', aoRolar, { passive: true });
    const ro = new ResizeObserver(() => medir());
    ro.observe(el);
    let antes = visiveis().length;
    const mo = new MutationObserver(() => {
      const agora = visiveis().length;
      if (agora !== antes) { antes = agora; el.scrollTo({ left: 0 }); }
      medir();
    });
    mo.observe(el, { attributes: true, attributeFilter: ['class'], subtree: true, childList: true });
    medir();
    return () => { el.removeEventListener('scroll', aoRolar); ro.disconnect(); mo.disconnect(); if (pedido) cancelAnimationFrame(pedido); };
  }, [medir, visiveis]);

  const irPara = (k: number) => {
    const el = ref.current; const c = visiveis()[k];
    if (!el || !c) return;
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: c.offsetLeft - (el.clientWidth - c.offsetWidth) / 2, behavior: quieto ? 'auto' : 'smooth' });
  };

  return (
    <>
      <div ref={ref} className={`${className} desliza`.trim()} style={style} role="group" aria-label={rotulo}>
        {children}
      </div>
      {n > 1 && rola && (
        <div className="trilho-pontos" aria-hidden="true">
          {Array.from({ length: n }, (_, k) => (
            <button key={k} type="button" tabIndex={-1} aria-current={k === i} onClick={() => irPara(k)}><i /></button>
          ))}
        </div>
      )}
    </>
  );
}
