import './site.css';
import Topo from '@/components/site/Topo';
import Pe from '@/components/site/Pe';
import Movimento from '@/components/site/Movimento';

/* =============================================================================
   O CASCO DO SITE PÚBLICO — 11/10/2026

   Tudo que é da igreja para fora mora neste grupo de rotas: home, servir e
   as áreas, cultos, quem somos, eventos, Pequena Guia, ofertar, como chegar,
   acessar, privacidade. A folha é site.css, escrita do zero a partir da
   apresentação ApresentaSite.pdf; a barra e o pé são os mesmos em toda
   página; cada página traz só as faixas dela.

   O sistema (app/(sistema)/) não passa por aqui e não conhece esta folha.
   ============================================================================= */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="s">
      <a href="#conteudo" className="s-pular">Pular para o conteúdo</a>
      <Movimento />
      <Topo />
      <main id="conteudo">{children}</main>
      <Pe />
    </div>
  );
}
