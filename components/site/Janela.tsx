'use client';
import { useEffect } from 'react';

/* =============================================================================
   A JANELA: o símbolo da marca abrindo para a foto · 20/10/2026

   A assinatura da casa nas faixas de foto (.s-janela em app/site.css): a
   foto começa vista pelo chevron da GUIA, pequeno, atrás do título; conforme
   a faixa sobe pela tela o chevron cresce e a foto inteira aparece por
   trás. Um número só, `--jk` (0 a 1), escrito na faixa quando muda; o resto
   é CSS (máscara e opacidade). Sem JS a faixa nasce aberta (`--jk` vale 1
   na folha); com "reduzir movimento" fica aberta também.

   O progresso: 0 quando o topo da faixa entra pela base da janela, 1 quando
   o meio da faixa chega ao meio da janela. Roda em todas as .s-janela da
   página, de uma vez, num rAF por rolagem.
   ============================================================================= */
export default function Janela() {
  useEffect(() => {
    const faixas = Array.from(document.querySelectorAll<HTMLElement>('.s-janela'));
    if (!faixas.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { faixas.forEach(f => f.style.setProperty('--jk', '1')); return; }
    const ultimo = new Map<HTMLElement, string>();
    let pedindo = false;
    const mede = () => {
      pedindo = false;
      const vh = window.innerHeight;
      for (const f of faixas) {
        const r = f.getBoundingClientRect();
        const comeca = vh * 0.92;                       /* o topo da faixa entrando por baixo */
        const termina = vh / 2 - r.height / 2;          /* o meio da faixa no meio da janela */
        const k = Math.min(1, Math.max(0, (comeca - r.top) / Math.max(1, comeca - termina)));
        const v = k.toFixed(3);
        if (ultimo.get(f) !== v) { ultimo.set(f, v); f.style.setProperty('--jk', v); }
      }
    };
    const pede = () => { if (!pedindo) { pedindo = true; requestAnimationFrame(mede); } };
    faixas.forEach(f => f.classList.add('viva'));
    mede();
    window.addEventListener('scroll', pede, { passive: true });
    window.addEventListener('resize', pede);
    return () => { window.removeEventListener('scroll', pede); window.removeEventListener('resize', pede); };
  }, []);
  return null;
}
