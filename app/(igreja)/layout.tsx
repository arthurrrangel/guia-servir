import '../site.css';
import Topo from '@/components/site/Topo';
import Pe from '@/components/site/Pe';
import Movimento from '@/components/site/Movimento';
import Fronteira from '@/components/Fronteira';

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
export default function IgrejaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="s">
      <a href="#conteudo" className="s-pular">Pular para o conteúdo</a>
      <Movimento />
      <Fronteira lado="site" />
      <Topo site="igreja" />
      <main id="conteudo">{children}</main>
      <Pe site="igreja" />
    </div>
  );
}
