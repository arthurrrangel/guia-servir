import type { Metadata } from 'next';
import { SITE, SITE_IGREJA, SITE_FOLLOW } from '@/lib/igreja';
import type { QualSite } from '@/lib/site/nav';

/* =============================================================================
   O CARTÃO DE PRÉVIA DE CADA PÁGINA (Open Graph), de uma forma só · 20/10/2026

   O que o WhatsApp e o Instagram mostram quando alguém cola o link. Cada
   página escrevia o bloco à mão, e os blocos tinham divergido: as do Guia
   Church levavam `type` e `locale`, as do Servir não; a versão da imagem
   (`?v=`, que fura o cache do WhatsApp quando o cartão muda) estava escrita
   em onze lugares. Agora toda página chama `og(...)` e ganha os mesmos
   campos: o nome do site, website, pt_BR, a URL canônica inteira e a
   imagem 1200×630 com a versão.

   `OG_VERSAO`: mude quando os cartões (scripts/og-cartoes.py) mudarem.
   ============================================================================= */
export const OG_VERSAO = '20261020';

const NOME: Record<QualSite, string> = { igreja: 'GUIA Church', servir: 'GUIA Servir', follow: 'Follow' };
const BASE: Record<QualSite, string> = { igreja: SITE_IGREJA, servir: SITE, follow: SITE_FOLLOW };

/** O bloco `openGraph` de uma página. `titulo` ganha " · <site>" no fim, a
 *  não ser que já traga o nome do site (a home de cada um começa por ele). */
export function og(site: QualSite, caminho: string, titulo: string, descricao: string | undefined, imagem: string, alt?: string): NonNullable<Metadata['openGraph']> {
  const nome = NOME[site];
  return {
    siteName: nome, type: 'website', locale: 'pt_BR',
    title: titulo.includes(nome) ? titulo : `${titulo} · ${nome}`,
    ...(descricao ? { description: descricao } : {}),
    url: BASE[site] + caminho,
    images: [{ url: `${imagem}?v=${OG_VERSAO}`, width: 1200, height: 630, ...(alt ? { alt } : {}) }],
  };
}
