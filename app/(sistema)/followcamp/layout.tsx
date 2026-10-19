import type { Metadata } from 'next';
import { SITE_IGREJA } from '@/lib/igreja';

/* O FOLLOW CAMP É DA IGREJA · 19/10/2026

   A ficha, o pagamento e o painel do retiro moram no grupo do sistema (usam
   o CSS dele), mas são do Follow, que é da igreja: a página do retiro é
   guiachurch.com/followcamp. Quando o casco do sistema passou a dizer "GUIA
   Servir", este casco segura o nome e o cartão de antes: "· GUIA Church" na
   aba e a prévia do retiro (a mesma imagem da landing). Com o Guia Follow
   (guiafollow.com), o nome muda aqui. */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_IGREJA),
  title: { default: 'Follow Camp 2027 · GUIA Church', template: '%s · GUIA Church' },
  openGraph: {
    siteName: 'GUIA Church', type: 'website', locale: 'pt_BR',
    title: 'Follow Camp 2027 · Eu me Rendo',
    description: 'Retiro de jovens de 13 a 24 anos, de 05 a 10 de fevereiro de 2027, no Carnaval.',
    images: [{ url: '/followcamp/a/og.jpg', width: 1200, height: 630, alt: 'Follow Camp 2027' }],
  },
};

export default function FollowCampLayout({ children }: { children: React.ReactNode }) {
  return children;
}
