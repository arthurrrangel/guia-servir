'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Analytics } from '@vercel/analytics/next';
import { enderecoMedivel, eventoDoLink, paginaPublica } from '@/lib/site/medir';
import { PIXEL, gravarEscolha, lerEscolha, ligarPixel, medir, visitaNoPixel } from '@/lib/site/medir-cliente';
import { naIgreja } from '@/lib/site/sites';
import css from './Medidor.module.css';

/* =============================================================================
   O MEDIDOR · 19/10/2026 (regras em lib/site/medir.ts)

   Mora no casco do Guia Church, do Guia Servir e do cadastro de área. Faz
   três coisas:

   1. Vercel Web Analytics, só com as páginas públicas (beforeSend).
   2. A faixa de cookies, só quando existe Pixel no build e a pessoa ainda
      não escolheu. "Aceitar" liga o Pixel; "Agora não" não carrega nada da
      Meta. A faixa fica abaixo do menu do celular e da busca (z-index 58) e
      deixa um respiro no fim da página para não cobrir o pé.
   3. Os cliques que valem: WhatsApp, mapa, o salto para o Servir, e o que
      tiver data-medir (o "Avisar que vou"). Escuta na captura, sem tocar no
      clique: a Fronteira e o próprio link continuam fazendo o que faziam.
   ============================================================================= */

export default function Medidor() {
  const caminho = usePathname();
  const [faixa, setFaixa] = useState(false);
  const anterior = useRef<string | null>(null);

  useEffect(() => {
    if (!PIXEL) return;
    const e = lerEscolha();
    if (e === 'sim') ligarPixel();
    else if (e === null) setFaixa(true);
  }, []);

  /* troca de página sem recarregar (dentro do mesmo site): visita no Pixel */
  useEffect(() => {
    if (anterior.current !== null && anterior.current !== caminho && paginaPublica(location.pathname)) visitaNoPixel();
    anterior.current = caminho;
  }, [caminho]);

  useEffect(() => {
    const clique = (ev: MouseEvent) => {
      const alvo = ev.target as Element | null;
      const a = alvo && typeof alvo.closest === 'function' ? alvo.closest('a[href]') : null;
      if (!a) return;
      const evento = eventoDoLink(a.getAttribute('href') || '', a.getAttribute('data-medir'), location.hostname);
      if (evento) medir(evento, { pagina: location.pathname });
    };
    window.addEventListener('click', clique, true);
    return () => window.removeEventListener('click', clique, true);
  }, []);

  function escolher(e: 'sim' | 'nao') {
    gravarEscolha(e);
    setFaixa(false);
    if (e === 'sim') ligarPixel();
  }

  return (
    <>
      <Analytics beforeSend={ev => { const url = enderecoMedivel(ev.url); return url ? { ...ev, url } : null; }} />
      {faixa && (
        <>
          <div className={css.respiro} aria-hidden="true" />
          <div className={css.faixa} role="region" aria-label="Cookies">
            <p className={css.texto}>
              Usamos cookies da Meta para medir os nossos anúncios.{' '}
              <a className={css.mais} href={naIgreja('/privacidade#medicao')}>Saiba mais</a>
            </p>
            <div className={css.botoes}>
              <button type="button" className={css.nao} onClick={() => escolher('nao')}>Agora não</button>
              <button type="button" className={css.sim} onClick={() => escolher('sim')}>Aceitar</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
