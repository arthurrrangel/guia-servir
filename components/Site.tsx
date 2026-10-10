'use client';
import { preload } from 'react-dom';
import Movimento from './Movimento';
import Topo from './Topo';
import Pe from './Pe';

/* =============================================================================
   O CASCO DAS PÁGINAS PÚBLICAS

   A mesma barra e o mesmo pé em todas as páginas do site, home inclusive.
   Copiar a barra para dentro de cada página daria seis acabamentos para o
   mesmo cabeçalho — que é exatamente o problema que o componente Tela
   resolveu para as telas internas.

   10/10/2026: a barra e o pé passaram a ser os da identidade nova
   (components/Topo.tsx e components/Pe.tsx), os mesmos da /servir. A
   `Barra` clara de vidro e o `Rodape` claro que moravam aqui saíram (estão
   no histórico do git); o CSS deles continua em globals/editorial e não
   atrapalha ninguém.

   Cliente por um motivo só: o estado da barra sobre a foto. As páginas que
   usam este casco continuam sendo componentes de servidor: o conteúdo entra
   por `children`, renderizado no servidor e passado por aqui.
   ============================================================================= */

/* açúcar: barra + conteúdo + rodapé, que é o formato de toda página pública
   nova. A `main` fica fora do casco de propósito — cada página escolhe as
   próprias faixas, e faixa precisa sangrar de ponta a ponta. */
export function Site({ atual, escuro, children }: { atual?: string; escuro?: boolean; children: React.ReactNode }) {
  /* `escuro` (08/09/2026): a página abre com foto de ponta a ponta, e a
     barra nasce transparente sobre ela, como na home, e fica escura pela
     rolagem (o Topo mede isso). O `main` deixa de reservar a altura da
     barra: o herói (.g-cheio) já reserva por dentro (padding-top ≥ 120px). */
  /* a serifa itálica da identidade entra no título de toda página pública;
     o preload evita o piscar na primeira pintura (react-dom o põe no head) */
  preload('/tipos/instrument-serif-italic.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
  return (
    <div data-movimento className="id">
      {/* o primeiro item focável da página. Quem navega por teclado pula a
          barra inteira com um Tab e um Enter. Invisível até receber foco. */}
      <a href="#conteudo" className="pular">Pular para o conteúdo</a>
      <Movimento />
      <Topo atual={atual} escuro={!!escuro} />
      {/* a regra global de `main` é do app interno: largura travada em 1180 e
          padding lateral. Aqui as faixas precisam sangrar de ponta a ponta,
          então a regra é desfeita nesta instância — não no CSS, que continua
          valendo para todas as telas do sistema. */}
      <main id="conteudo" style={{ maxWidth: 'none', margin: 0, padding: escuro ? 0 : 'var(--barra-alt) 0 0' }}>{children}</main>
      <Pe />
    </div>
  );
}
