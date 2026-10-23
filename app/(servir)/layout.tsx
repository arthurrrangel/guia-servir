import '../site.css';
import type { Metadata, Viewport } from 'next';
import { SITE } from '@/lib/igreja';
import Topo from '@/components/site/Topo';
import Pe from '@/components/site/Pe';
import Movimento from '@/components/site/Movimento';
import Tela from '@/components/site/Tela';
import Fronteira from '@/components/Fronteira';
import Medidor from '@/components/site/Medidor';

/* =============================================================================
   O CASCO DO GUIA SERVIR · guiaservir.com · 19/10/2026

   A LP do Servir (que o next.config serve na raiz do domínio), as cinco
   áreas, "não sei onde me encaixo" e o acesso às equipes. A mesma folha e
   as mesmas peças do Guia Church; muda o mapa (barra, menu do celular,
   busca e pé: lib/site/nav.ts) e o endereço que o Google lê.

   O ENDEREÇO. `metadataBase` aqui vale para as páginas deste grupo: o
   canonical relativo de cada uma ('/', '/servir/midia') sai em
   guiaservir.com, e não no guiachurch.com da raiz. O espaço do voluntário e
   o cadastro da área são sistema (app/(sistema)/) e não mudaram.

   O TÍTULO É `absolute`: um `default` aqui ainda passaria pelo modelo da
   raiz ("%s · GUIA Church") e a aba diria "... · GUIA Servir · GUIA Church".
   ============================================================================= */
/* a barra do navegador no celular na cor da barra do site (a noite), como no Guia
   Church e no Follow; o sistema (app/(sistema)) segue com o #252525 da raiz */
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, themeColor: '#111113',
  colorScheme: 'light', viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { absolute: 'GUIA Servir', template: '%s · GUIA Servir' },
  description: 'Mídia, Louvor, GUIA Kids, Connect e Livraria: as áreas de voluntários da GUIA Church, na Barra da Tijuca. Cadastro de menos de um minuto.',
};

export default function ServirLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="s">
      <Tela />
      <a href="#conteudo" className="s-pular">Pular para o conteúdo</a>
      <Movimento />
      <Fronteira lado="site" />
      <Topo site="servir" />
      <main id="conteudo">{children}</main>
      <Pe site="servir" />
      <Medidor />
    </div>
  );
}
