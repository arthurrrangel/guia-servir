/* =============================================================================
   O LINK PESSOAL: AS REGRAS — 19/10/2026 (migração 114), carnê livre 18/11/2026

   A página /followcamp/minha/<token> e as rotas dela leem estas regras, para
   a tela e o servidor nunca discordarem. Quem decide é o servidor: a tela só
   mostra o que ele vai aceitar.

   O QUE O SERVIDOR NÃO ACEITA DO NAVEGADOR: o "referente" (inscrição, irmãos
   ou parcela) sai da ficha, e o valor não passa do que falta. Pagar a mais
   pelo link é engano de digitação, não generosidade, e vira devolução.

   QUANTO SE PAGA DE CADA VEZ (18/11/2026):
     · à vista: o que falta, inteiro (no Pix, ou no cartão no valor do link);
     · carnê: quanto a pessoa quiser, de PARCELA_MIN até o que falta (ou só
       o que falta, quando falta menos que PARCELA_MIN). Sem plano e sem
       data no meio: tudo até 03/01 (lib/followcamp-carne.ts).
   ============================================================================= */
import { CODIGO_OK, carneAberto, linkCartaoDe, limpaNome, nomeInvalido, LINKS_CARTAO, type LinkCartao, type Referente } from './followcamp';
import { contaDaFicha, minimoDoPagamento, type FichaDaConta, type PagamentoDaConta } from './followcamp-carne';

export type Conferido<T> = { ok: true; dados: T } | { ok: false; erro: string };

export type FichaDoLink = FichaDaConta & { irmao: string | null };
export type PagamentoDoLink = PagamentoDaConta & { codigo: string | null; referente: string; forma: string };

export type PedidoDoLink = {
  codigo: string;
  meio: 'pixdireto' | 'cartaoLink';
  referente: Referente;
  valor: number;
  titular: string;
  /** o código já existe nesta ficha: é mais um comprovante do mesmo pagamento */
  repetido: boolean;
};

const centavos = (v: number) => Math.round(v * 100);
const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** O valor de UM pagamento do carnê, em centavos, contra o que falta. A
 *  página pessoal mostra o mesmo recado que o servidor daria. */
export function conferirValorDoCarne(valor: number, falta: number): Conferido<number> {
  if (!Number.isInteger(valor) || valor <= 0) return { ok: false, erro: 'Digite o valor deste pagamento.' };
  if (falta <= 0) return { ok: false, erro: 'Não falta nada a pagar nesta inscrição.' };
  if (valor > falta) return { ok: false, erro: `Esse valor passa do que falta (${reais(falta)}).` };
  const min = minimoDoPagamento(falta);
  if (valor < min) {
    return { ok: false, erro: min === falta ? `Falta só ${reais(falta)}: pague esse valor.` : `Cada pagamento do carnê é de pelo menos ${reais(min)}.` };
  }
  return { ok: true, dados: valor };
}

/** O referente sai da ficha, não do navegador. */
export const referenteDa = (f: FichaDoLink): Referente =>
  f.pagamento === 'carne' || f.parcelas != null ? 'parcela' : f.irmao ? 'irmaos' : 'inscricao';

export function conferirPagamentoDoLink(
  c: Record<string, unknown>,
  ficha: FichaDoLink,
  pagamentos: readonly PagamentoDoLink[],
  agora = new Date(),
  links: readonly LinkCartao[] = LINKS_CARTAO,
): Conferido<PedidoDoLink> {
  const codigo = String(c.codigo ?? '');
  if (!CODIGO_OK.test(codigo)) return { ok: false, erro: 'Código do pagamento inválido.' };
  const meio = c.meio;
  if (meio !== 'pixdireto' && meio !== 'cartaoLink') return { ok: false, erro: 'Meio de pagamento inválido.' };
  const titular = limpaNome(String(c.titular ?? ''));
  if (titular && nomeInvalido(titular, 'de quem pagou')) return { ok: false, erro: 'Nome de quem pagou inválido.' };

  /* mais um comprovante de um pagamento que já está na ficha */
  const ja = pagamentos.find(p => p.codigo === codigo);
  if (ja) {
    return { ok: true, dados: { codigo, meio, referente: ja.referente as Referente, valor: Number(ja.valor), titular, repetido: true } };
  }

  const valor = typeof c.valor === 'number' ? c.valor : NaN;
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, erro: 'Valor inválido.' };
  if (centavos(valor) !== Number((valor * 100).toFixed(4))) return { ok: false, erro: 'O valor precisa ter no máximo dois dígitos depois da vírgula.' };
  if (valor < 1) return { ok: false, erro: 'O valor mínimo é R$ 1,00.' };

  const conta = contaDaFicha(ficha, pagamentos, agora);
  if (conta.total == null) return { ok: false, erro: 'A organização ainda vai confirmar o valor da sua inscrição.' };
  if (conta.falta == null || conta.falta <= 0) return { ok: false, erro: 'Não falta nada a pagar nesta inscrição.' };
  if (centavos(valor) > conta.falta) return { ok: false, erro: `Esse valor passa do que falta (${reais(conta.falta)}).` };
  if (conta.carne) {
    const v = conferirValorDoCarne(centavos(valor), conta.falta);
    if (!v.ok) return v;
  } else if (centavos(valor) !== conta.falta) {
    return { ok: false, erro: `Na inscrição à vista o pagamento é o que falta (${reais(conta.falta)}). Para pagar em partes, escolha o carnê na sua página.` };
  }

  const referente = referenteDa(ficha);
  if (meio === 'cartaoLink') {
    const l = linkCartaoDe(referente, agora, links);
    if (!l) return { ok: false, erro: 'Este pagamento não tem link de cartão. Pague no Pix.' };
    if (centavos(l.valor) !== centavos(valor)) return { ok: false, erro: 'Valor diferente do link do cartão.' };
  }
  return { ok: true, dados: { codigo, meio, referente, valor, titular, repetido: false } };
}

/** A ficha à vista pode passar para o carnê enquanto o carnê está aberto
 *  (até 03/01). Depois, quem ainda deve paga o que falta, inteiro. */
export function conferirEntradaNoCarne(agora = new Date()): Conferido<true> {
  if (!carneAberto(agora)) return { ok: false, erro: 'O carnê fechou em 3 de janeiro. Pague o que falta no Pix ou no cartão.' };
  return { ok: true, dados: true };
}

/* ------------------------------------------------------------ o arquivo ---
   O comprovante chega como base64. O banco lê o tipo nos primeiros bytes; o
   servidor recusa antes o que nem é foto nem PDF, e o que passa do teto. */
export const COMPROVANTE_MAX = 3_000_000;
export const COMPROVANTE_MIN = 200;

export function tipoDosBytes(b: Uint8Array): string | null {
  const ini = (...x: number[]) => x.every((v, i) => b[i] === v);
  if (ini(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (ini(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (ini(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (ini(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf';
  return null;
}

export function conferirArquivo(base64: unknown): Conferido<{ base64: string; tipo: string; bytes: number }> {
  if (typeof base64 !== 'string' || !base64) return { ok: false, erro: 'Mande a foto ou o PDF do comprovante.' };
  const limpo = base64.replace(/\s+/g, '');
  /* 4/3 do teto em base64, com folga: o teto de verdade é em bytes, abaixo */
  if (limpo.length > Math.ceil(COMPROVANTE_MAX / 3) * 4 + 8) return { ok: false, erro: 'O arquivo passa de 3 MB. Mande um print do comprovante.' };
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(limpo)) return { ok: false, erro: 'Não consegui ler esse arquivo. Mande um print ou o PDF do comprovante.' };
  const bin = Uint8Array.from(Buffer.from(limpo, 'base64'));
  if (bin.length < COMPROVANTE_MIN) return { ok: false, erro: 'Esse arquivo está vazio ou cortado.' };
  if (bin.length > COMPROVANTE_MAX) return { ok: false, erro: 'O arquivo passa de 3 MB. Mande um print do comprovante.' };
  const tipo = tipoDosBytes(bin);
  if (!tipo) return { ok: false, erro: 'O comprovante precisa ser uma foto (JPG, PNG ou WEBP) ou um PDF.' };
  return { ok: true, dados: { base64: limpo, tipo, bytes: bin.length } };
}
