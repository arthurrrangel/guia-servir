/* =============================================================================
   A CHAVE DO HARNESS, SEPARADA DAS FIXTURES — e o motivo é medido.

   A pergunta "o demo está ligado?" morava dentro de lib/demo.ts, junto com os
   dados de mentira. Para fazer a pergunta era preciso carregar o módulo:

       const { demoLigado } = await import('./demo');           // incondicional
       if (demoLigado()) { ... }                                // tarde demais

   O primeiro import não tem guarda nenhuma, então o webpack não consegue provar
   que o módulo é inalcançável em produção e emite o chunk. Medido no build de
   05/09/2026: .next/static/chunks/4580.js, 1936 bytes, contendo os nomes das
   pessoas das fixtures. Ia para o navegador de qualquer visitante do site.

   O que elimina o chunk é uma coisa só: a comparação literal que o build
   substitui por `false`. Com `process.env.NODE_ENV === 'development' &&` na
   frente, o ramo inteiro vira código morto e o import dinâmico some com ele.
   Por isso esse pedaço aparece escrito à mão em cada chamador, e não escondido
   dentro desta função: escondido, ele não é constante para o empacotador.

   Este arquivo não importa nada e não guarda nenhum dado. Pode ser importado
   estaticamente sem arrastar fixture nenhuma junto.
============================================================================= */

export const demoLigado = () =>
  process.env.NODE_ENV === 'development'
  && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('demo');
