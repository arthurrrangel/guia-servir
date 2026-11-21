'use client';
/* =============================================================================
   A BARRA DA RESERVA NO CELULAR · 21/11/2026 ("mais comercial")

   No celular, a chamada fica a um toque o tempo todo: uma barra presa ao pé
   da tela com "Garantir meu lugar". Ela só aparece quando nenhuma outra
   chamada está à vista (a do herói, a do ingresso, o formulário, a do fecho)
   e some no rodapé; nunca em cima da faixa de cookies, que tem a vez dela.
   Fora do celular, não existe.
   ============================================================================= */
import { useEffect, useState } from 'react';

const CHAMADAS = ['.s-heroi .s-acoes', '.vr-ingresso .s-acoes', '#reserva', '.s-fim .s-acoes', '.s-pe'];

export default function BarraReserva() {
  const [ver, setVer] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function' || typeof IntersectionObserver === 'undefined') return;
    const celular = window.matchMedia('(max-width: 759px)');
    const vistas = new Set<Element>();
    let quadro = 0;
    const decide = () => {
      quadro = 0;
      const cookies = document.querySelector('[role="region"][aria-label="Cookies"]');
      setVer(celular.matches && vistas.size === 0 && !cookies && window.scrollY > 80);
    };
    const pede = () => { if (!quadro) quadro = requestAnimationFrame(decide); };
    const io = new IntersectionObserver(es => {
      es.forEach(e => (e.isIntersecting ? vistas.add(e.target) : vistas.delete(e.target)));
      pede();
    });
    CHAMADAS.forEach(s => document.querySelectorAll(s).forEach(el => io.observe(el)));
    window.addEventListener('scroll', pede, { passive: true });
    celular.addEventListener?.('change', pede);
    pede();
    return () => {
      if (quadro) cancelAnimationFrame(quadro);
      io.disconnect();
      window.removeEventListener('scroll', pede);
      celular.removeEventListener?.('change', pede);
    };
  }, []);

  return (
    <div className={'vr-barra' + (ver ? ' ver' : '')} aria-hidden={!ver}>
      <a className="s-pil vr-ouro" href="#reserva" tabIndex={ver ? 0 : -1}>Garantir meu lugar</a>
    </div>
  );
}
