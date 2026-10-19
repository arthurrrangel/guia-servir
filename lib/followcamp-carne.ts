/* =============================================================================
   O CARNÊ FOLLOW TEM PLANO — 19/10/2026 (migração 114)

   O Arthur decidiu (19/10): "parcelas iguais com data". A pessoa escolhe 1, 2
   ou 3 parcelas iguais; cada uma vence no dia 10, e a última vence até 3 de
   janeiro (o fim do carnê, CARNE_FIM). O banco guarda só a ESCOLHA
   (`parcelas`, `plano_em`); as datas e os valores saem daqui, para a página
   pessoal e o painel nunca discordarem.

   AS DATAS SÃO FIXAS PARA TODOS: 10/11, 10/12 e 03/01. Quem escolhe o plano
   usa as próximas a partir do dia em que escolheu, com folga de 3 dias (a
   primeira parcela nunca vence daqui a 2 dias). Quem chega em novembro só
   tem 10/12 e 03/01; quem chega depois de 31/12, só a inscrição inteira.

   O QUE CONTA COMO PAGO. "Pago" é só o que a organização CONFERIU. O que a
   pessoa avisou e ainda não foi conferido fica "em conferência": não atrasa
   ninguém (a pessoa fez a parte dela), mas também não quita.

   Pagamento antes do plano (o carnê de valor livre que existia até 19/10)
   conta para as primeiras parcelas: o plano é de quanto deve estar pago em
   cada data, não de quantos Pix foram feitos.

   Tudo em CENTAVOS, inteiros: R$ 627,30 em 3 parcelas são 209,10 + 209,10 +
   209,10; R$ 697 são 232,33 + 232,33 + 232,34 (o resto vai na última).
   ============================================================================= */

/** Os vencimentos do carnê, em ordem (dia inteiro, horário de Brasília). */
export const VENCIMENTOS = ['2026-11-10', '2026-12-10', '2027-01-03'] as const;
export const MAX_PARCELAS = 3;
/** A primeira parcela nunca vence em menos que isto, contado de quando o plano foi escolhido. */
export const FOLGA_DIAS = 3;

const DIA = 24 * 60 * 60 * 1000;
/** O último instante do dia `d` em Brasília: vencer "em 10/11" é pagar até o fim do dia 10. */
export const fimDoDia = (d: string) => new Date(`${d}T23:59:59.999-03:00`).getTime();
export const centavos = (v: number) => Math.round(v * 100);

/** As datas que um plano escolhido em `desde` ainda pode usar. */
export function vencimentosDesde(desde: Date): string[] {
  const limite = desde.getTime() + FOLGA_DIAS * DIA;
  return VENCIMENTOS.filter(d => fimDoDia(d) >= limite);
}

/** Quantas parcelas dá para escolher em `desde` (0: o carnê fechou para quem chega agora). */
export const maxParcelas = (desde: Date) => Math.min(MAX_PARCELAS, vencimentosDesde(desde).length);

export type Parcela = {
  numero: number;
  /** 'AAAA-MM-DD' */
  vencimento: string;
  /** centavos desta parcela */
  valor: number;
  /** centavos que precisam estar pagos até o fim do vencimento */
  acumulado: number;
};

/** As parcelas de um total (centavos) em `n` vezes, a partir de `desde`. Nulo quando não cabe. */
export function planoDe(total: number, n: number, desde: Date): Parcela[] | null {
  if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(n) || n < 1 || n > MAX_PARCELAS) return null;
  const datas = vencimentosDesde(desde).slice(0, n);
  if (datas.length < n) return null;
  const base = Math.floor(total / n);
  let acumulado = 0;
  return datas.map((vencimento, i) => {
    const valor = i === n - 1 ? total - base * (n - 1) : base;
    acumulado += valor;
    return { numero: i + 1, vencimento, valor, acumulado };
  });
}

export type EstadoParcela = 'paga' | 'conferindo' | 'aberta' | 'vencida';
export type ParcelaComEstado = Parcela & {
  estado: EstadoParcela;
  /** centavos que ainda faltam NESTA parcela (zero se paga ou em conferência) */
  falta: number;
};

export type SituacaoDoPlano = {
  parcelas: ParcelaComEstado[];
  /** a primeira parcela em aberto ou vencida */
  proxima: ParcelaComEstado | null;
  atrasada: boolean;
  /** quantas estão vencidas sem pagamento */
  vencidas: number;
};

/**
 * O estado de cada parcela, dado o que foi conferido (`pago`) e o que foi
 * avisado e ainda não conferido (`conferindo`), em centavos.
 */
export function situacaoDoPlano(plano: readonly Parcela[], pago: number, conferindo: number, agora: Date): SituacaoDoPlano {
  const t = agora.getTime();
  const coberto = pago + conferindo;
  const parcelas = plano.map<ParcelaComEstado>(p => {
    if (pago >= p.acumulado) return { ...p, estado: 'paga', falta: 0 };
    if (coberto >= p.acumulado) return { ...p, estado: 'conferindo', falta: 0 };
    const falta = Math.min(p.valor, p.acumulado - coberto);
    return { ...p, estado: t > fimDoDia(p.vencimento) ? 'vencida' : 'aberta', falta };
  });
  const proxima = parcelas.find(p => p.estado === 'aberta' || p.estado === 'vencida') ?? null;
  const vencidas = parcelas.filter(p => p.estado === 'vencida').length;
  return { parcelas, proxima, atrasada: vencidas > 0, vencidas };
}

/** 'AAAA-MM-DD' → 'DD/MM' */
export const diaMes = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/* ------------------------------------------------------------- a conta ---
   A mesma conta para a página pessoal e para o painel: quanto deve, quanto
   foi conferido, quanto está em conferência, quanto falta e, no carnê com
   plano, o estado de cada parcela. */
export type FichaDaConta = {
  valor: number | string | null;
  pagamento: string | null;
  parcelas: number | null;
  plano_em: string | null;
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
  /** a ficha é do carnê (escolheu o carnê ou tem plano) */
  carne: boolean;
  plano: Parcela[] | null;
  situacao: SituacaoDoPlano | null;
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
  const plano = total != null && f.parcelas != null && f.plano_em
    ? planoDe(total, f.parcelas, new Date(f.plano_em)) : null;
  const situacao = plano ? situacaoDoPlano(plano, pago, conferindo, agora) : null;
  return { total, pago, conferindo, falta, quitado, carne, plano, situacao };
}
