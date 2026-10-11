import { IGREJA, SITE_IGREJA } from '@/lib/igreja';
import type { Metadata, Viewport } from 'next';

/* =============================================================================
   A RAIZ — 11/10/2026

   Só o documento: <html>, <body>, os metadados padrão e o preload da Inter.
   Nenhuma folha de estilo mora aqui. Cada grupo de rotas carrega a sua:

   · app/(sistema)/layout.tsx — globals.css, editorial.css, identidade.css,
     Medidas e Transicao, exatamente como a raiz carregava antes. É o casco
     do painel, da escala, do /eu, das demandas, do cadastro de área.
   · app/(site)/layout.tsx — site.css, o site público refeito do zero com
     base na apresentação ApresentaSite.pdf. Não conhece o CSS do sistema.

   Por que separar: o site público carregava nove mil linhas de CSS do
   sistema para pintar uma página de igreja, e toda regra de elemento
   (body, main, h1, a, button, input) do sistema vazava para o site. Agora
   cada um só paga pelo que usa, e nenhum dos dois quebra o outro.

   TIPOGRAFIA: a Inter (variável, 48kB, SIL OFL, public/tipos/) é a fonte dos
   dois lados; o @font-face mora em cada folha, o preload mora aqui.
   ============================================================================= */

export const metadata: Metadata = {
  metadataBase: new URL(SITE_IGREJA),
  title: { default: 'GUIA Church · Cultivando uma nova cultura', template: '%s · GUIA Church' },
  description:
    `${IGREJA.cultoDia} às ${IGREJA.cultoHora} na ${IGREJA.rua}, ${IGREJA.bairro}. Venha visitar, ou entre para uma das áreas de voluntários da ${IGREJA.nome}.`,
  appleWebApp: { capable: true, title: 'GUIA', statusBarStyle: 'black-translucent' },
  /* o card que aparece quando alguém cola o link num grupo de WhatsApp. A
     imagem PRECISA ser absoluta (metadataBase resolve isso): com caminho
     relativo, todo link compartilhado sai sem foto. */
  openGraph: {
    title: 'GUIA Church · Cultivando uma nova cultura',
    description: `${IGREJA.cultoDia} às ${IGREJA.cultoHora}, ${IGREJA.bairro}. Comece por aqui, visite um culto ou entre para uma das áreas de voluntários.`,
    url: SITE_IGREJA, type: 'website', locale: 'pt_BR', siteName: 'GUIA Church',
    images: [{ url: '/og.jpg', width: 1200, height: 630, alt: 'GUIA Church, Barra da Tijuca' }],
  },
  twitter: { card: 'summary_large_image', title: 'GUIA Church · Cultivando uma nova cultura', images: ['/og.jpg'] },
};
/* colorScheme fixo em light: a maioria dos celulares do time está no modo
   escuro do sistema, e sem isso o navegador reescreve campo e select por
   conta própria em cima de um layout desenhado para papel claro. */
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, themeColor: '#252525',
  colorScheme: 'light', viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preload" href="/tipos/inter.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
