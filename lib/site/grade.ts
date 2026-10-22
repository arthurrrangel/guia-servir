/* =============================================================================
   GRADES QUE FECHAM · 21/10/2026

   Quantas colunas deixam a última linha de uma grade de n cartões o mais
   cheia possível: das opções (da maior para a menor), a que deixa menos
   buracos; no empate, a maior. 8 cartões em até 5 colunas: 4 + 4 (as
   colunas automáticas davam 5 + 3); 9: 3 + 3 + 3; 12: 4 + 4 + 4.

   Usam: as funções de cada área do Servir (components/site/Area.tsx) e os
   grupos da Pequena Guia (components/Grupos.tsx, que mudam com o filtro).
   A folha (app/site.css) escolhe qual das contas vale em cada largura.
   ============================================================================= */
export function colunasQueFecham(n: number, opcoes: readonly number[]): number {
  const buracos = (c: number) => (n % c ? c - (n % c) : 0);
  return opcoes.reduce((melhor, c) => (buracos(c) < buracos(melhor) ? c : melhor), opcoes[0]);
}
