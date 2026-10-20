import { IGREJA, SITE_IGREJA } from '@/lib/igreja';
import type { Metadata, Viewport } from 'next';
import { og } from '@/lib/site/meta';

/* =============================================================================
   A RAIZ — 11/10/2026

   Só o documento: <html>, <body>, os metadados padrão e o preload da Inter.
   Nenhuma folha de estilo mora aqui. Cada grupo de rotas carrega a sua:

   · app/(sistema)/layout.tsx — globals.css, editorial.css, identidade.css,
     Medidas e Transicao, exatamente como a raiz carregava antes. É o casco
     do painel, da escala, do /eu, das demandas, do cadastro de área.
   · app/(igreja)/layout.tsx e app/(servir)/layout.tsx: app/site.css, o
     site público refeito do zero com base na apresentação ApresentaSite.pdf
     (até 19/10/2026 um grupo só, app/(site)/; agora o Guia Church e o Guia
     Servir, a mesma folha). Não conhecem o CSS do sistema.

   Por que separar: o site público carregava nove mil linhas de CSS do
   sistema para pintar uma página de igreja, e toda regra de elemento
   (body, main, h1, a, button, input) do sistema vazava para o site. Agora
   cada um só paga pelo que usa, e nenhum dos dois quebra o outro.

   TIPOGRAFIA: a Inter (variável, 48kB, SIL OFL, public/tipos/) é a fonte dos
   dois lados; o @font-face mora em cada folha, o preload mora aqui.
   ============================================================================= */

/* 19/10/2026, A COPY FINAL: "Cultivando uma nova cultura" é conceito
   interno e saiu de todas as páginas (fica só como frase do rodapé). O
   título padrão diz o que a pessoa procura; o cartão de prévia, a frase do
   herói. O Guia Servir tem os seus (app/(servir)/layout.tsx).

   O CARTÃO DO TWITTER não leva título nem imagem próprios: com eles aqui,
   toda página saía com o título da home (o `twitter` da raiz não é trocado
   pelo `openGraph` de cada página). Sem eles, o X lê o og:title e a
   og:image de cada uma. */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_IGREJA),
  title: { default: 'GUIA Church · Igreja na Barra da Tijuca', template: '%s · GUIA Church' },
  description:
    `Uma igreja na ${IGREJA.bairro} feita de pessoas reais, histórias reais e um domingo que pode mudar a sua semana. ${IGREJA.cultoDia} às ${IGREJA.cultoHora}, na ${IGREJA.rua}.`,
  appleWebApp: { capable: true, title: 'GUIA', statusBarStyle: 'black-translucent' },
  /* o card que aparece quando alguém cola o link num grupo de WhatsApp. A
     imagem PRECISA ser absoluta (metadataBase resolve isso): com caminho
     relativo, todo link compartilhado sai sem foto. */
  openGraph: og('igreja', '/', 'GUIA Church · Existe um lugar para você',
    `${IGREJA.cultoDia} às ${IGREJA.cultoHora}, ${IGREJA.bairro}. Uma igreja feita de pessoas reais, histórias reais e um domingo que pode mudar a sua semana.`,
    '/og.jpg', 'GUIA Church, Barra da Tijuca'),
  twitter: { card: 'summary_large_image' },
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
