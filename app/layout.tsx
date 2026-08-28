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

/* A LETRA DA CASA — Raleway.

   Não é escolha estética minha: é a tipografia do site que o Arthur apontou
   como referência (igrejamananciais.com.br), medida na página deles — Raleway
   400, corpo 17px, título 26px em caixa alta com tracking largo. Ele pediu
   "a mesma pegada", e pegada de site é 80% tipografia e espaço.

   Ela também não briga com a GUI>: a logo já é uma geométrica de caixa alta
   com tracking largo, que é exatamente o que a Raleway faz em display.

   Mesmo motivo da Inter para morar no repositório: build não pode depender de
   o gstatic estar de pé no minuto do deploy. Arquivo variável, 200 a 700,
   só o subset latin — 48 kB para todos os pesos. */
const raleway = localFont({
  src: './fontes/raleway-latin-wght-normal.woff2',
  weight: '200 700',
  style: 'normal',
  display: 'swap',
  variable: '--fonte-raleway',
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
  width: 'device-width', initialScale: 1, themeColor: '#070708',
  colorScheme: 'light', viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${raleway.variable}`}>
      <body><Medidas />{children}</body>
    </html>
  );
}

