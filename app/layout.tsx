import './globals.css';
import type { Metadata, Viewport } from 'next';
import Medidas from '@/components/Medidas';

/* =============================================================================
   TIPOGRAFIA — uma família, servida daqui

   Inter, variável, um arquivo de 48kB em public/tipos/ (SIL OFL, licença ao
   lado). O @font-face mora no globals.css; aqui só o preload, para o título
   da primeira tela não piscar na fonte do aparelho.

   Até 08/09/2026 este arquivo lia um marca.css gerado no build com as fontes
   licenciadas do manual (PP Neue Montreal / PP Editorial New), baixadas de
   uma origem privada por scripts/fontes.mjs. As variáveis de ambiente nunca
   foram configuradas, o CSS servido era vazio e o site caía na fonte de cada
   aparelho. O Arthur escolheu a Inter para o site e o sistema; o mecanismo
   saiu (está no histórico do git, se um dia a marca voltar a pedir).
   ============================================================================= */

/* O título era 'Escala de Mídia' e valia para o site inteiro: a aba do Louvor
   dizia Mídia, a da Diaconia dizia Mídia, e o link que a pessoa recebe no
   WhatsApp mostrava o nome do ministério errado. Aqui fica o nome do produto;
   cada tela que sabe de qual ministério é ajusta o próprio título. */
export const metadata: Metadata = {
  metadataBase: new URL('https://guiaservir.com'),
  title: { default: 'GUIA Church · Cultivando uma nova cultura', template: '%s · GUIA Church' },
  description:
    'Domingo às 10h na Rua Pedra de Itaúna, 534, Barra da Tijuca. Venha visitar, ou entre para uma das áreas de voluntários da GUIA Church.',
  appleWebApp: { capable: true, title: 'GUIA', statusBarStyle: 'black-translucent' },
  /* o card que aparece quando alguém cola o link num grupo de WhatsApp. A
     imagem PRECISA ser absoluta (metadataBase resolve isso): com caminho
     relativo, todo link compartilhado sai sem foto. */
  openGraph: {
    title: 'GUIA Church · Cultivando uma nova cultura',
    description: 'Domingo às 10h, Barra da Tijuca. Comece por aqui, visite um culto ou entre para uma das áreas de voluntários.',
    url: 'https://guiaservir.com', type: 'website', locale: 'pt_BR', siteName: 'GUIA Church',
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
      <body><Medidas />{children}</body>
    </html>
  );
}

