import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import Pagar from '@/components/followcamp/Pagar';
import { TEM_PAGARME } from '@/lib/pagarme';
import { TEM_PIX } from '@/lib/oferta';
import { linksNaTela } from '@/lib/followcamp-link-vivo';

/* =============================================================================
   /followcamp/pagar — 01/10/2026

   Fora da busca e fora do sitemap: é o caixa do Camp, não conteúdo. Chega-se
   aqui pela página do Camp (o botão só aparece quando algum meio está ligado,
   ver app/api/followcamp/meios) ou por link mandado no WhatsApp.

   As fontes são as MESMAS da página do Camp (public/followcamp/a/), servidas
   pelo next/font para não piscar Inter antes da Poppins.

   `TEM_PAGARME` e `TEM_PIX` são lidos no build, como em /ofertar: ligar a
   chave da Stone na Vercel pede um novo deploy, e é o deploy que acende os
   botões.

   29/10/2026: o cartão por link só vai para a tela se a Stone disser que o
   link ainda abre (lib/followcamp-link-vivo.ts). A página se refaz a cada 5
   minutos: link que morre some daqui em até 5 minutos, sem deploy.
   ============================================================================= */
const poppins = localFont({
  src: [
    { path: '../../../../public/followcamp/a/poppins-400.woff2', weight: '400', style: 'normal' },
    { path: '../../../../public/followcamp/a/poppins-600.woff2', weight: '600', style: 'normal' },
    { path: '../../../../public/followcamp/a/poppins-700.woff2', weight: '700', style: 'normal' },
    { path: '../../../../public/followcamp/a/poppins-900.woff2', weight: '900', style: 'normal' },
  ],
  variable: '--fc-poppins',
  display: 'swap',
});
const pixel = localFont({
  src: '../../../../public/followcamp/a/silkscreen-400.woff2',
  variable: '--fc-pixel',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Pagar inscrição · Follow Camp 2027',
  description: 'Pagamento da inscrição do Follow Camp 2027 pelo Pix ou pelo cartão.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: '#F32402', colorScheme: 'light dark',
};

export const revalidate = 300;

export default async function Pagina() {
  const links = TEM_PAGARME ? [] : await linksNaTela();
  return (
    <div className={`${poppins.variable} ${pixel.variable}`}>
      <Pagar temPagarme={TEM_PAGARME} temPixDireto={TEM_PIX} links={links} />
    </div>
  );
}
