import { preload } from 'react-dom';

/* =============================================================================
   A SERIFA ITÁLICA ADIANTADA · 23/10/2026 (o 22f)

   A palavra em itálico de todo título do site (o `it` do Vozes: "para você",
   "quê", "todos") é da Instrument Serif itálica, e o navegador só descobria a
   fonte depois de ler a folha e montar o título: a primeira pintura saía com a
   serifa do aparelho (mais larga) e, quando a fonte chegava, o título mudava de
   linha. No /privacidade, a 1440x900, o título caía de duas linhas para uma e a
   página inteira subia 90 px: CLS 0,272 (o Google chama de ruim acima de 0,25),
   medido em produção e no build local, e 0,249 a 768x1024 (scripts no
   scratchpad: cls-fontes.mjs e cls-varredura.mjs).

   O preload pede a fonte junto com o HTML, ao lado da Inter (app/layout.tsx), e
   ela chega antes da primeira pintura. As 17 rotas do site já baixavam esta
   fonte na primeira tela (todas têm título com itálico): nenhum byte a mais. Só
   o site chama isto (os três cascos); o sistema não usa a serifa e não a pede.
   ============================================================================= */
export function adiantarSerifa() {
  preload('/tipos/instrument-serif-italic.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });
}
