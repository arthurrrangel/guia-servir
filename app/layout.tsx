import './globals.css';
import type { Metadata, Viewport } from 'next';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Medidas from '@/components/Medidas';

/* =============================================================================
   TIPOGRAFIA — as fontes do manual, e só elas

   O manual da marca (Apresentação GuiaChurch.pdf, 01/09/2026) define duas
   famílias: PP Neue Montreal (Bold e Book) e PP Editorial New (Ultralight
   Italic). O Arthur foi explícito: nada de substituta. Então a pilha de
   fontes do CSS tem a marca em primeiro lugar e, atrás dela, só o que o
   sistema operacional da pessoa já tem — nenhuma outra família é carregada.

   POR QUE OS ARQUIVOS NÃO ESTÃO NESTE REPOSITÓRIO, e não é escolha minha:
   as duas são da Pangram Pangram, licenciadas, e o EULA deles proíbe
   textualmente pôr a fonte em "public internet file transfer or storing
   channel". Este repositório é público. Os .woff2 entram no BUILD, baixados
   de uma origem privada por scripts/fontes.mjs, e são servidos pelo próprio
   guiaservir.com — que é o que a Web License cobre.

   Antes havia aqui dois `next/font/local` (Inter e, por um dia, Instrument
   Serif). Saíram: `next/font/local` exige que o arquivo exista no build, e
   arquivo licenciado não pode existir no repositório. No lugar, um bloco
   <style> com os @font-face que o script gerou — inline, sem requisição a
   mais — e os preloads de cada arquivo que de fato está presente.
   ============================================================================= */
const PASTA_FONTES = join(process.cwd(), 'public', 'fontes');

function fontesDaMarca(): { css: string; arquivos: string[] } {
  try {
    const css = readFileSync(join(PASTA_FONTES, 'marca.css'), 'utf8');
    const m = JSON.parse(readFileSync(join(PASTA_FONTES, 'manifest.json'), 'utf8'));
    return { css, arquivos: Array.isArray(m.fontes) ? m.fontes : [] };
  } catch {
    /* sem prebuild (por exemplo `next dev` sem rodar o script): fallback */
    return { css: '', arquivos: [] };
  }
}

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
  const fontes = fontesDaMarca();
  return (
    <html lang="pt-BR">
      <head>
        {/* preload só do que existe: um preload de arquivo ausente é um 404
            na abertura de toda página */}
        {fontes.arquivos.map(a => (
          <link key={a} rel="preload" href={`/fontes/${a}`} as="font" type="font/woff2" crossOrigin="anonymous" />
        ))}
        {fontes.css && <style dangerouslySetInnerHTML={{ __html: fontes.css }} />}
      </head>
      <body><Medidas />{children}</body>
    </html>
  );
}

