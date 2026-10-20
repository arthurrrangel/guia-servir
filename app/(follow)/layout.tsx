import '../follow.css';
import type { Metadata, Viewport } from 'next';
import { IGREJA, SITE_FOLLOW } from '@/lib/igreja';
import Medidor from '@/components/site/Medidor';
import Vida from '@/components/follow/Vida';

/* =============================================================================
   O CASCO DO GUIA FOLLOW · guiafollow.com · 19/10/2026

   O terceiro site da GUIA, de uma página só (app/(follow)/follow/page.tsx),
   construído com a skill site-de-10k do Arthur. Tem a própria folha
   (app/follow.css) e não conhece a da igreja nem o CSS do sistema: a sala do
   Follow é azul-marinho e creme, a igreja é areia e laranja, e as duas não
   dividem uma página. Todo link para fora daqui é <a> inteiro (endereço
   completo em produção, via lib/site/sites.ts), nunca <Link>: a folha de um
   site não pode ficar carregada no outro (components/Fronteira.tsx explica).

   O ENDEREÇO. O next.config reescreve a raiz do guiafollow.com para /follow
   e manda /follow dos outros dois domínios para cá. `metadataBase` faz o
   canonical ('/') e o cartão de prévia saírem em guiafollow.com.

   O Medidor é o mesmo dos outros sites: Vercel Web Analytics nas páginas
   públicas ('/follow' está em lib/site/medir.ts) e a faixa de cookies
   quando houver Pixel.
   ============================================================================= */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_FOLLOW),
  title: { absolute: 'Follow · O culto de jovens da GUIA Church' },
  description: `O Follow é o culto de jovens da GUIA Church, todo sábado às ${IGREJA.followHora}, na ${IGREJA.bairro}. Não precisa ser de igreja. Não precisa conhecer ninguém. Vem como você está.`,
  alternates: { canonical: '/' },
  appleWebApp: { capable: true, title: 'Follow', statusBarStyle: 'black-translucent' },
  openGraph: {
    title: 'Follow · Um lugar para todos',
    description: `O culto de jovens da GUIA Church. Todo sábado, ${IGREJA.followHora}, na ${IGREJA.bairro}. Vem como você está.`,
    url: SITE_FOLLOW, type: 'website', locale: 'pt_BR', siteName: 'Follow',
    images: [{ url: '/follow/og.jpg', width: 1200, height: 630, alt: 'Follow, o culto de jovens da GUIA Church' }],
  },
  twitter: { card: 'summary_large_image' },
};

/* a sala é escura: a barra do celular acompanha, e o esquema é escuro para o
   navegador não clarear campo nem rolagem */
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, themeColor: '#071a33',
  colorScheme: 'dark', viewportFit: 'cover',
};

export default function FollowLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="f">
      <a href="#conteudo" className="f-pular">Pular para o conteúdo</a>
      <div className="f-leds" aria-hidden="true" />
      <Vida />
      <main id="conteudo">{children}</main>
      <Medidor />
    </div>
  );
}
