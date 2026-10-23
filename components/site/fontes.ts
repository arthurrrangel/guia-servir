import { preload, type PreloadOptions } from 'react-dom';

/* =============================================================================
   A SERIFA ITÁLICA ADIANTADA, SÓ ONDE ELA MEXE NA PÁGINA · 23/10/2026 (o 22i)

   O defeito: a palavra em itálico dos títulos (o `it` do Vozes) é da Instrument
   Serif itálica, e sem aviso o navegador só descobre a fonte depois de ler a
   folha. A primeira pintura sai com a serifa de reserva do aparelho, mais
   larga, e troca quando a fonte chega. No /privacidade essa troca muda o
   título de duas linhas para uma e a página inteira sobe (90 px a 1440): CLS
   de 0,249 a 0,281 a 768, 1024 e 1440 px (o Google chama de ruim acima de
   0,25), na produção e no build local. Com a fonte certa o título cabe numa
   linha a partir de 692 px de largura; abaixo disso as duas fontes quebram
   igual e nada se mexe. O limite de cima depende da reserva de cada aparelho
   (com a do Linux, 1464 px). Nas outras 16 rotas a troca quase não move nada
   (CLS de no máximo 0,012 em 6 telas, rede rápida e 4G).

   O caminho até aqui, medido no build local (cargas frias alternadas, 4G de
   150 ms e 1,6 Mb/s):
   - o 22f pedia a fonte em todas as páginas do site. O salto sumiu, mas no
     celular a fonte divide a banda com o CSS, que bloqueia a pintura, e o FCP
     piorou de 44 a 84 ms nas quatro rotas medidas. Não foi publicado.
   - o 22g pôs um <link rel="preload" media> no JSX da página. O React leva esse
     link para o fim do <head>, depois do CSS e dos scripts, e na 4G a fonte
     chegava logo depois da primeira pintura: CLS 0,28 em 5 de 5 cargas. O
     mesmo link no começo do <head>: CLS 0 em 5 de 5.
   - o 22h, este preload() de 760 px para cima: o salto caiu de 43 cargas em 45
     para 2 em 45 (as duas na 4G), com a primeira pintura de 20 a 40 ms depois
     na 4G; no celular em pé, nada muda. A varredura de largura achou o salto
     também de 692 a 759 px (o celular deitado, o tablet pequeno): daí os 690.
   O preload() do react-dom vai para o começo do <head>, antes do CSS. O media
   (que o React repassa, mas os tipos do @types/react-dom 19.0 ainda não
   declaram) deixa o celular em pé exatamente como estava. Levar o preload para
   o site inteiro é escolha do Arthur.
   ============================================================================= */
export function adiantarSerifa() {
  const opcoes: PreloadOptions & { media: string } = { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous', media: '(min-width: 690px)' };
  preload('/tipos/instrument-serif-italic.woff2', opcoes);
}
