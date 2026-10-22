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

/* A ÚLTIMA LINHA NO CENTRO · 21/10/2026: quando nenhuma das opções fecha (7
   funções do Louvor: 4 + 3), a última linha fica no meio, e não encostada à
   esquerda com um buraco no fim. A folha dobra as trilhas da grade (cada
   cartão ocupa duas), e o primeiro cartão da última linha começa na trilha
   (c - r) + 1: meio cartão de deslocamento para cada cartão que falta.
   Devolve as colunas (c) e, se a última linha não fecha, o índice do primeiro
   cartão dela (i, a partir de 0) e a trilha onde ele começa (t, a partir de 1). */
export function gradeQueFecha(n: number, opcoes: readonly number[]): { c: number; ini: { i: number; t: number } | null } {
  const c = colunasQueFecham(n, opcoes);
  const r = n % c;
  return { c, ini: r ? { i: n - r, t: c - r + 1 } : null };
}
