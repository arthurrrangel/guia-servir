'use client';
import { useEffect } from 'react';

/* =============================================================================
   A FRONTEIRA ENTRE O SITE E O SISTEMA · 19/10/2026

   O site (app/(igreja)/, app/(servir)/, a folha app/site.css) e o sistema
   (app/(sistema)/, as nove mil linhas de globals.css com regra de elemento:
   body, main, h1, a, button, input) moram no mesmo app, mas não podem
   dividir a mesma página. Só que um <Link> do Next navega sem recarregar, e
   a folha da página de onde a pessoa veio FICA carregada. Medido na LP do
   Servir depois de "/eu → Quero servir": três folhas em vez de uma, a página
   230 px mais alta no celular, o herói recuado e o título quebrando em três
   linhas. Era assim desde 11/10, quando as folhas foram separadas por grupo
   de rotas; com o Guia Servir, o caminho LP ↔ /eu ↔ cadastro virou o
   caminho de todo dia.

   A REGRA: clique num link que atravessa a fronteira vira carregamento
   inteiro (location.assign). Dentro do mesmo lado, o <Link> segue como era.
   O ouvinte fica na janela, na fase de captura: roda antes do React (que
   ouve no document), e o <Link> do Next desiste quando o clique já chega
   com preventDefault (next/dist/client/app-dir/link.js, "defaultPrevented").
   Assim nenhum link do sistema precisou mudar.

   O que é do site é a lista abaixo; o resto do app é sistema. O /followcamp
   é um HTML estático (nem site nem sistema): sempre carregamento inteiro.
   ============================================================================= */

const SITE = /^\/(?:|sobre|cultos|como-chegar|eventos|pequena-guia|ofertar|privacidade|acessar|servir|servir\/onde-me-encaixo|servir\/[^/]+)\/?$/;
const FORA = /^\/followcamp\/?$/;

export type Lado = 'site' | 'sistema';
export const ladoDe = (caminho: string): Lado | 'fora' =>
  FORA.test(caminho) ? 'fora' : SITE.test(caminho) ? 'site' : 'sistema';

export default function Fronteira({ lado }: { lado: Lado }) {
  useEffect(() => {
    const clique = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      let u: URL;
      try { u = new URL(a.href, location.href); } catch { return; }
      /* outro domínio: o navegador já carrega inteiro */
      if (u.origin !== location.origin) return;
      /* âncora da mesma página */
      if (u.pathname === location.pathname && u.hash) return;
      if (ladoDe(u.pathname) === lado) return;
      e.preventDefault();
      location.assign(u.href);
    };
    window.addEventListener('click', clique, true);
    return () => window.removeEventListener('click', clique, true);
  }, [lado]);
  return null;
}
