/* =============================================================================
   A COBRANÇA COM A MENSAGEM PRONTA — 19/10/2026 (migração 114)

   O Arthur: "quer um botão de cobrança no painel" → "Sim, mensagem pronta".
   O botão abre o WhatsApp da pessoa certa com o texto já escrito: o que
   falta, a data, e o LINK PESSOAL, que é onde ela paga e manda o comprovante.
   Quem aperta enviar é a organização: o site não manda mensagem sozinho.

   COM QUEM SE FALA: menor de idade, com o responsável (é quem paga e quem
   assinou o termo); maior, com o próprio campista, e sem número dele, com o
   contato de emergência.

   O TEXTO depende de onde a pessoa está, nesta ordem: quitado; avisou que
   pagou e não mandou o comprovante; carnê sem plano; parcela vencida;
   próxima parcela; inscrição em aberto; em conferência.
   ============================================================================= */
import { soDigitos } from './followcamp';
import { centavos, diaMes, type Conta } from './followcamp-carne';

export const LINK_PESSOAL = 'https://guiaservir.com/followcamp/minha/';
export const linkPessoal = (token: string) => LINK_PESSOAL + token;

export const TOKEN_OK = /^[0-9a-f]{24}$/;

export type FichaDoContato = {
  campista: string;
  idade: number | null;
  responsavel_nome: string | null;
  responsavel_whats: string | null;
  whats_campista: string | null;
  emergencia_nome: string | null;
  emergencia_whats: string | null;
};

export type Contato = { nome: string; whats: string; quem: 'responsavel' | 'campista' | 'emergencia' };

const primeiroNome = (n: string) => (n || '').trim().split(/\s+/)[0] || '';
const ehMenor = (f: FichaDoContato) => !!f.responsavel_nome || (f.idade != null && f.idade < 18);

/** Com quem falar sobre esta ficha, e por qual número. Nulo sem número nenhum. */
export function contatoDe(f: FichaDoContato): Contato | null {
  const tentativas: Contato[] = ehMenor(f)
    ? [{ nome: f.responsavel_nome || '', whats: f.responsavel_whats || '', quem: 'responsavel' }]
    : [
        { nome: f.campista, whats: f.whats_campista || '', quem: 'campista' },
        { nome: f.emergencia_nome || '', whats: f.emergencia_whats || '', quem: 'emergencia' },
      ];
  return tentativas.find(t => numeroWhats(t.whats)) ?? null;
}

/** '(21) 98888-7777' → '5521988887777'. Nulo se não for um celular do Brasil. */
export function numeroWhats(s: string): string | null {
  let d = soDigitos(s);
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 11 && d.length !== 10) return null;
  return '55' + d;
}

export const linkDoWhats = (numero: string, texto: string) => `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;

const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export type PagamentoDaCobranca = { valor: number | string; conferido: boolean; comprovantes?: number };

/** O texto da cobrança. `conta` sai de contaDaFicha (lib/followcamp-carne.ts). */
export function mensagemDeCobranca(p: {
  ficha: FichaDoContato;
  conta: Conta;
  pagamentos: readonly PagamentoDaCobranca[];
  link: string;
}): string {
  const { ficha, conta, link } = p;
  const contato = contatoDe(ficha);
  const oi = `Oi${contato?.nome ? `, ${primeiroNome(contato.nome)}` : ''}! Aqui é da organização do Follow Camp 2027.`;
  const de = contato?.quem === 'campista' ? 'a sua inscrição' : `a inscrição de ${primeiroNome(ficha.campista)}`;
  const De = de.charAt(0).toUpperCase() + de.slice(1);
  const doCarne = contato?.quem === 'campista' ? 'do seu carnê' : `do carnê de ${primeiroNome(ficha.campista)}`;
  const oCarne = contato?.quem === 'campista' ? 'o seu carnê' : `o carnê de ${primeiroNome(ficha.campista)}`;
  const avisadoSemComprovante = p.pagamentos.filter(x => !x.conferido && !(x.comprovantes && x.comprovantes > 0));

  if (conta.quitado) {
    return `${oi} ${De} está quitada: ${reais(conta.pago)} recebidos. Obrigado! Qualquer coisa, é por este link: ${link}`;
  }
  if (avisadoSemComprovante.length > 0) {
    const soma = avisadoSemComprovante.reduce((s, x) => s + centavos(Number(x.valor)), 0);
    return `${oi} Recebemos o aviso de pagamento de ${reais(soma)} para ${de}. Para confirmarmos, manda o comprovante por este link: ${link}`;
  }
  if (conta.carne && !conta.plano) {
    return `${oi} No link abaixo você escolhe em quantas parcelas quer pagar ${oCarne} (até 3, com a última até 03/01) e já paga a primeira no Pix. Lá mesmo você manda o comprovante: ${link}`;
  }
  const prox = conta.situacao?.proxima;
  if (prox && prox.estado === 'vencida') {
    return `${oi} A parcela ${prox.numero} ${doCarne} (${reais(prox.falta)}) venceu em ${diaMes(prox.vencimento)}. Para pagar no Pix e mandar o comprovante: ${link}. Se já pagou, é só mandar o comprovante pelo mesmo link.`;
  }
  if (prox) {
    return `${oi} A parcela ${prox.numero} ${doCarne} (${reais(prox.falta)}) vence em ${diaMes(prox.vencimento)}. Para pagar no Pix e mandar o comprovante: ${link}`;
  }
  if (conta.falta != null && conta.falta > 0) {
    return `${oi} ${De} (${reais(conta.falta)}) ainda está em aberto. Pelo link você paga no Pix ou no cartão e manda o comprovante, e também dá para parcelar no carnê: ${link}`;
  }
  return `${oi} Recebemos os comprovantes de ${de} e estamos conferindo. Você acompanha tudo por este link: ${link}`;
}
