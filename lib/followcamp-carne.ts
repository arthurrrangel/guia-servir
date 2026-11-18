/* =============================================================================
   O CARNÊ FOLLOW: QUANTO QUISER, ATÉ 03/01 · 18/11/2026

   O Arthur, 18/11: "nao pode fixar um valor, quem escolhe carne tem que
   pagar tudo ate janeiro. Ela daria um sinal e iria acertando até janeiro"
   e "deixar ela escolher a quantia e ir registrando os pagamentos pelo
   sistema e o envio dos comprovantes".

   Então o carnê não tem plano nem parcela de valor fixo: pela página pessoal
   a pessoa paga no Pix quanto quiser (no mínimo PARCELA_MIN, ou o que falta
   se for menos), quantas vezes quiser, e manda o comprovante de cada
   pagamento ali mesmo. A única data é o fim do carnê: tudo pago até 03/01
   (CARNE_FIM, em lib/followcamp.ts).

   O PLANO DE 19/10 (migração 114, "parcelas iguais com data") SAIU DA CONTA.
   As colunas `parcelas` e `plano_em` continuam no banco, sem migração:
   `parcelas` preenchida ainda quer dizer "esta ficha é do carnê" (o
   fc27_plano_escolher e o fc27_ficha_plano gravam pagamento = 'carne'
   junto), e é por elas que uma ficha à vista passa para o carnê
   (MARCA_DO_CARNE). O número em si não vale mais nada.

   O QUE CONTA COMO PAGO. "Pago" é só o que a organização CONFERIU. O que a
   pessoa avisou e ainda não foi conferido fica "em conferência": não atrasa
   ninguém (a pessoa fez a parte dela), mas também não quita.

   ATRASO. Sem datas no meio, só existe um: passou de 03/01 e ainda falta
   dinheiro que ninguém pagou nem avisou.

   Tudo em CENTAVOS, inteiros.
   ============================================================================= */
import { CARNE_FIM, PARCELA_MIN, carneAberto } from './followcamp';

export const centavos = (v: number) => Math.round(v * 100);

/** O último dia do carnê, 'AAAA-MM-DD' no dia de Brasília. CARNE_FIM é
 *  exclusivo (04/01 00:00), então o último dia é 03/01. */
export const PRAZO_DO_CARNE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })
  .format(new Date(new Date(CARNE_FIM).getTime() - 1));

/** O que vai na coluna `parcelas` quando uma ficha entra no carnê pela página
 *  pessoal ou pelo painel: só marca a ficha (o banco grava pagamento = 'carne'). */
export const MARCA_DO_CARNE = 1;

/** O menor pagamento que o carnê aceita agora, em centavos: PARCELA_MIN, ou
 *  o que falta, quando falta menos que isso. */
export const minimoDoPagamento = (falta: number) => Math.max(0, Math.min(falta, centavos(PARCELA_MIN)));

/** 'AAAA-MM-DD' → 'DD/MM' */
export const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/* ------------------------------------------------------------- a conta ---
   A mesma conta para a página pessoal, o painel, a cobrança e a planilha:
   quanto deve, quanto foi conferido, quanto está em conferência e quanto
   falta. */
export type FichaDaConta = {
  valor: number | string | null;
  pagamento: string | null;
  parcelas: number | null;
  plano_em?: string | null;
};
export type PagamentoDaConta = { valor: number | string; conferido: boolean };

export type Conta = {
  /** centavos devidos (nulo: a ficha ainda não tem valor) */
  total: number | null;
  pago: number;
  conferindo: number;
  /** centavos que ainda não foram nem pagos nem avisados */
  falta: number | null;
  quitado: boolean;
  /** a ficha é do carnê (escolheu o carnê na ficha ou entrou nele depois) */
  carne: boolean;
  /** carnê que passou de 03/01 com dinheiro que ninguém pagou nem avisou */
  vencido: boolean;
};

export function contaDaFicha(f: FichaDaConta, pagamentos: readonly PagamentoDaConta[], agora: Date): Conta {
  const total = f.valor == null || f.valor === '' ? null : centavos(Number(f.valor));
  let pago = 0, conferindo = 0;
  for (const p of pagamentos) {
    const v = centavos(Number(p.valor));
    if (p.conferido) pago += v; else conferindo += v;
  }
  const falta = total == null ? null : Math.max(0, total - pago - conferindo);
  const quitado = total != null && total > 0 && pago >= total;
  const carne = f.pagamento === 'carne' || f.parcelas != null;
  const vencido = carne && !quitado && falta != null && falta > 0 && !carneAberto(agora);
  return { total, pago, conferindo, falta, quitado, carne, vencido };
}
