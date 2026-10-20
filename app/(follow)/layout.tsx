import '../site.css';
import type { Metadata, Viewport } from 'next';
import { og } from '@/lib/site/meta';
import { IGREJA, SITE_FOLLOW } from '@/lib/igreja';
import Topo from '@/components/site/Topo';
import Pe from '@/components/site/Pe';
import Movimento from '@/components/site/Movimento';
import Fronteira from '@/components/Fronteira';
import Medidor from '@/components/site/Medidor';

/* =============================================================================
   O CASCO DO GUIA FOLLOW · guiafollow.com · 19/10/2026, refeito em 20/10

   O terceiro site da GUIA, de uma página só (app/(follow)/follow/page.tsx).
   Nasceu em 19/10 com folha própria (azul-marinho e creme, Bricolage
   Grotesque) e o Arthur reprovou na hora em que viu no ar: "esse do Follow
   tá sem id visual". Desde 20/10 é a mesma casa do Guia Church e do Guia
   Servir: app/site.css (noite, papel e areia; Inter 800 com a última
   palavra em serifa itálica; pílulas; o chapéu), a mesma barra e o mesmo
   pé, com o mapa do Follow (lib/site/nav.ts). O que é só dele é o herói que
   anda com o scroll sobre as fotos de verdade do Follow
   (components/site/Scrub.tsx), e esse também fala na língua da casa.

   A MARCA DELE (mais tarde em 20/10): o Arthur mandou as artes oficiais da
   GUIA e do Follow ("usa no site, nessas ids, pdf + essas"). O Follow tem
   logotipo (FO»OW) e símbolo (o chevron duplo), vermelho sobre verde-claro;
   components/Marca.tsx tem os dois em vetor. A classe `s-follow` no
   invólucro liga a identidade dele na folha: o claro vira o verde-claro da
   arte, o acento vira o vermelho, a janela do fecho abre pelo chevron
   duplo. A barra e o pé mostram o logotipo dele (Topo e Pe olham o `site`),
   e o favicon, o ícone de app e o manifesto são os dele (public/follow/).

   O ENDEREÇO. O next.config reescreve a raiz do guiafollow.com para /follow
   e manda /follow dos outros dois domínios para cá. `metadataBase` faz o
   canonical ('/') e o cartão de prévia saírem em guiafollow.com. O Follow
   Camp continua em guiachurch.com (o pagamento usa sessionStorage do
   domínio): daqui é link inteiro.
   ============================================================================= */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_FOLLOW),
  title: { absolute: 'Follow · O culto de jovens da GUIA Church' },
  description: `O Follow é o culto de jovens da GUIA Church, todo sábado às ${IGREJA.followHora}, na ${IGREJA.bairro}. Não precisa ser de igreja. Não precisa conhecer ninguém. Vem como você está.`,
  alternates: { canonical: '/' },
  appleWebApp: { capable: true, title: 'Follow', statusBarStyle: 'black-translucent' },
  /* a marca do Follow (20/10/2026): o favicon e o ícone de app são o chevron
     duplo dele, vermelho no verde-claro da arte (public/follow/icone*). Os da
     raiz do app (app/icon.svg, app/apple-icon.png) são a GUIA, e este `icons`
     os substitui. O favicon.ico e o manifesto (app/favicon.ico, app/manifest.ts)
     o Next liga em toda página sem perguntar; no guiafollow.com o next.config
     reescreve os dois para os do Follow (o manifesto dá o nome e as cores
     certas a quem salva o site na tela inicial). */
  icons: { icon: [{ url: '/follow/icone.svg', type: 'image/svg+xml' }, { url: '/follow/icone-32.png', sizes: '32x32', type: 'image/png' }], apple: '/follow/icone-180.png' },
  openGraph: og('follow', '/', 'Follow · Um lugar para todos',
    `O culto de jovens da GUIA Church. Todo sábado, ${IGREJA.followHora}, na ${IGREJA.bairro}. Vem como você está.`,
    '/follow/og.jpg', 'Follow, o culto de jovens da GUIA Church'),
  twitter: { card: 'summary_large_image' },
};

/* a barra do celular na cor da barra do site (a noite); o esquema fica claro
   como na raiz, para o navegador não reescrever campo nem rolagem */
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, themeColor: '#111113',
  colorScheme: 'light', viewportFit: 'cover',
};

export default function FollowLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="s s-follow">
      <a href="#conteudo" className="s-pular">Pular para o conteúdo</a>
      <Movimento />
      <Fronteira lado="site" />
      <Topo site="follow" />
      <main id="conteudo">{children}</main>
      <Pe site="follow" />
      <Medidor />
    </div>
  );
}
