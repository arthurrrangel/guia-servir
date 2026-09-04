'use client';
import { useEffect, useState } from 'react';
import { Simbolo } from './Marca';

/* =============================================================================
   A ABERTURA — 1,3 segundo, uma vez por sessão

   O símbolo aparece no escuro e a cortina sobe sobre o herói. É o gesto que
   diz "isto é uma marca" antes de qualquer texto. Só na primeira página da
   sessão: quem navega não vê de novo (sessionStorage). prefers-reduced-motion
   desliga por CSS. Depois de tocar, o elemento sai do DOM.
   ============================================================================= */
export default function Abertura() {
  const [ver, setVer] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem('guia-abriu')) return;
      sessionStorage.setItem('guia-abriu', '1');
    } catch { /* sem storage: mostra mesmo assim */ }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setVer(true);
    const t = setTimeout(() => setVer(false), 1500);
    return () => clearTimeout(t);
  }, []);
  if (!ver) return null;
  return <div className="abertura" aria-hidden="true"><Simbolo /></div>;
}
