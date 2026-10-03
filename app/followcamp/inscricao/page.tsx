import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import Ficha from '@/components/followcamp/Ficha';

/* =============================================================================
   /followcamp/inscricao — a ficha de inscrição do Follow Camp 2027 (02/10/2026)

   Fora da busca: quem acha o Camp no Google cai na página dele, e é de lá que
   todo botão "Quero me inscrever" traz para cá. As mesmas fontes da página do
   Camp e da página de pagamento (public/followcamp/a/).
   ============================================================================= */
const poppins = localFont({
  src: [
    { path: '../../../public/followcamp/a/poppins-400.woff2', weight: '400', style: 'normal' },
    { path: '../../../public/followcamp/a/poppins-600.woff2', weight: '600', style: 'normal' },
    { path: '../../../public/followcamp/a/poppins-700.woff2', weight: '700', style: 'normal' },
    { path: '../../../public/followcamp/a/poppins-900.woff2', weight: '900', style: 'normal' },
  ],
  variable: '--fc-poppins',
  display: 'swap',
});
const pixel = localFont({
  src: '../../../public/followcamp/a/silkscreen-400.woff2',
  variable: '--fc-pixel',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Ficha de inscrição · Follow Camp 2027',
  description: 'Ficha de inscrição do Follow Camp 2027, retiro de jovens de 13 a 24 anos, de 05 a 10 de fevereiro de 2027.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: '#F32402', colorScheme: 'light dark',
};

export default function Pagina() {
  return (
    <div className={`${poppins.variable} ${pixel.variable}`}>
      <Ficha />
    </div>
  );
}
