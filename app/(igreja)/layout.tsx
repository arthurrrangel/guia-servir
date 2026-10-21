import '../site.css';
import type { Viewport } from 'next';
import Topo from '@/components/site/Topo';
import Pe from '@/components/site/Pe';
import Movimento from '@/components/site/Movimento';
import Fronteira from '@/components/Fronteira';
import Medidor from '@/components/site/Medidor';

/* =============================================================================
   O CASCO DO GUIA CHURCH · guiachurch.com · 11/10/2026, separado em 19/10

   A igreja: home, quem somos, cultos, como chegar, eventos, Pequena Guia,
   ofertar e privacidade. A folha é app/site.css, escrita do zero a partir
   da apresentação ApresentaSite.pdf, e é a mesma do Guia Servir (a mesma
   identidade visual, pedido do Arthur); a barra e o pé são os mesmos em
   toda página, com o mapa da igreja (lib/site/nav.ts).

   O Guia Servir mora em app/(servir)/, com o mesmo desenho e o seu mapa. O
   sistema (app/(sistema)/) não passa por aqui e não conhece esta folha.
   Qual domínio mostra o quê: next.config.mjs, "OS DOIS SITES".
   ============================================================================= */
/* a barra do navegador no celular (o iOS pinta a faixa de cima e a de baixo com
   isto) na cor da barra do site, a noite: com o #252525 do sistema, herdado da raiz,
   ficava uma emenda cinza em cima do preto da barra (21/10/2026) */
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, themeColor: '#111113',
  colorScheme: 'light', viewportFit: 'cover',
};

export default function IgrejaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="s">
      <a href="#conteudo" className="s-pular">Pular para o conteúdo</a>
      <Movimento />
      <Fronteira lado="site" />
      <Topo site="igreja" />
      <main id="conteudo">{children}</main>
      <Pe site="igreja" />
      <Medidor />
    </div>
  );
}
