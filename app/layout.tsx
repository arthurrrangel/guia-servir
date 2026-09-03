import './globals.css';
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import Medidas from '@/components/Medidas';

/* A logo é uma grotesca geométrica de tracking largo. Inter é a mais próxima
   disso, e o arquivo mora NO REPOSITÓRIO.
   Antes era `next/font/google`, que baixa o .woff2 de fonts.gstatic.com na
   hora do build. Funcionou dezenas de vezes e um dia o build da Vercel não
   alcançou o gstatic: "Failed to fetch font file", build quebrado, deploy
   perdido, e nada a ver com o código. Publicar não pode depender de a rede
   de um terceiro estar boa naquele minuto.
   Um arquivo variável (peso 100 a 900) cobre todos os pesos que uso e ainda
   pesa menos que as seis instâncias estáticas que o google-font baixava. */
const inter = localFont({
  src: './fontes/inter-latin-wght-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--fonte-inter',
});

/* A LETRA EDITORIAL — Instrument Serif Italic.

   O manual da marca (Apresentação GuiaChurch.pdf, 01/09/2026) define DUAS
   famílias: PP Neue Montreal Bold/Book para o grotesco, e PP Editorial New
   Ultralight Italic para o editorial. As duas são da Pangram Pangram e são
   COMERCIAIS.

   Por que elas não estão aqui, e a decisão não é minha para reverter: este
   repositório é PÚBLICO no GitHub. Subir um .woff2 licenciado nele não é
   "usar a fonte", é REDISTRIBUIR — e licença de desktop, que é a que um
   designer normalmente tem para montar uma apresentação, não cobre nem uso
   web nem redistribuição. Comprar a licença web resolve; até lá, publicar o
   arquivo criaria uma exposição real, num endereço que qualquer um clona.

   O que está aqui no lugar, e por que estas duas:

   · Grotesco → INTER, que já morava no repositório. A PP Neue Montreal é um
     neo-grotesco neutro e apertado; a Inter é da mesma escola e é a
     substituta mais próxima que existe em licença aberta. A Raleway, que
     ocupava este posto até hoje, é uma GEOMÉTRICA — família diferente, gesto
     diferente. Ela veio de um site de referência, não da marca. Agora existe
     manual, e o manual ganha.

   · Editorial → INSTRUMENT SERIF ITALIC (SIL OFL, livre para redistribuir).
     É a mais próxima da PP Editorial New Ultralight Italic em licença
     aberta: mesma lógica de serifa alta em contraste, mesmo desenho fino e
     inclinado, mesmo uso — frase de respiro, não texto corrido.

   PARA TROCAR PELAS VERDADEIRAS: com a licença web comprada, é pôr os dois
   .woff2 em app/fontes/ e mudar o `src` de dois `localFont` aqui. Nenhuma
   regra de CSS muda — tudo consome --fonte, --fonte-display e
   --fonte-editorial, nunca o nome da família.

   O nome da variável do arquivo termina em -arq de propósito: o CSS monta a
   pilha completa (com os fallbacks do sistema) num token de mesmo nome sem o
   sufixo. Sem isso as duas declarações caem no mesmo elemento <html>, com a
   mesma especificidade, e quem vence passa a ser a ordem do arquivo. */
const editorial = localFont({
  src: [
    { path: './fontes/instrument-serif-latin-italic.woff2', style: 'italic', weight: '400' },
    { path: './fontes/instrument-serif-latin-normal.woff2', style: 'normal', weight: '400' },
  ],
  display: 'swap',
  variable: '--fonte-editorial-arq',
});

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
    <html lang="pt-BR" className={`${inter.variable} ${editorial.variable}`}>
      <body><Medidas />{children}</body>
    </html>
  );
}

