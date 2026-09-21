/* =============================================================================
   A OFERTA — as regras que a tela obedece. 12/09/2026.

   A tela é `components/Ofertar.tsx`; aqui ficam as decisões, porque elas são
   de política e não de layout, e porque mudar uma delas não deveria exigir
   ler JSX.

   ---------------------------------------------------------------------------
   POR QUE NÃO EXISTEM BOTÕES DE VALOR

   A primeira versão tinha R$20, R$50, R$100. O Arthur cortou, e tinha razão
   por um motivo que só aparece quando se separa dízimo de oferta: DÍZIMO É
   DEZ POR CENTO DA RENDA. Não é número redondo, nunca. Um botão de R$50 não
   serve para dízimo nenhum, e na oferta ele faz outra coisa pior — sugere
   quanto dar, que é decisão pastoral da igreja e não de quem escreve a tela.

   Então: campo livre, teclado numérico, e nenhuma sugestão.

   ---------------------------------------------------------------------------
   POR QUE A IDENTIFICAÇÃO NÃO TEM CAMPO

   O pedido era identificação obrigatória. Ela é obrigatória — e não custa
   nenhum campo digitado, porque todo meio de pagamento já carrega quem pagou:

     Apple Pay / Google Pay  →  nome e e-mail da conta
     cartão                  →  nome do portador
     Pix                     →  nome e CPF de quem enviou, no registro do banco

   O que faltava era amarrar o Pix ao TIPO (dízimo ou oferta), porque o extrato
   do banco não sabe disso. É o que `txidDe` resolve: o txid viaja dentro do
   BR Code e volta no registro do Pix recebido. Extrato + txid = "João Silva,
   dízimo, R$350", sem formulário e sem banco de dados nosso.

   ○ NÃO OBSERVADO, e é o único pé no ar deste arquivo: que o Itaú devolva o
   txid no extrato de cobrança estática. Prova-se com um Pix de R$0,01, não com
   documentação. Enquanto não se provar, a coluna "tipo" do extrato é uma
   aposta.

   ---------------------------------------------------------------------------
   POR QUE O PEDIDO DE ORAÇÃO VEM DEPOIS DE PAGAR

   Pedido de oração carrega dado sensível — diagnóstico, remédio, dependência,
   violência doméstica. A LGPD trata isso no art. 11, e, diferente do GDPR
   europeu (art. 9(2)(d)), NÃO tem hipótese específica para organismo
   religioso: a igreja depende de consentimento específico e destacado. Um
   campo obrigatório no meio de um formulário de pagamento é o oposto de
   destacado.

   Depois do pagamento ele é: opcional, sozinho na tela, com o aviso ao lado.
   Isso é consentimento destacado, e de quebra protege a conversão do
   pagamento, que era o outro motivo.
   ============================================================================= */

import { IGREJA } from './igreja';
import { pixCopiaECola } from './pix';

export type TipoOferta = 'dizimo' | 'oferta';

export const TIPOS: { id: TipoOferta; rot: string; dica: string }[] = [
  {
    id: 'dizimo',
    rot: 'Dízimo',
    dica: 'A décima parte, entregue com regularidade.',
  },
  {
    id: 'oferta',
    rot: 'Oferta',
    dica: 'O que você decidir dar, além do dízimo.',
  },
];

/** A chave Pix da igreja. Vem de `lib/igreja.ts`, ao lado do endereço e do @,
 *  porque é um fato público da igreja e não um segredo: chave Pix só RECEBE,
 *  e esta vai impressa em adesivo de cadeira. A variável de ambiente continua
 *  valendo como atalho (trocar sem commit), mas não é mais obrigatória — a
 *  razão inteira está escrita em `lib/igreja.ts`.
 *
 *  O código é montado no próprio celular, sem ida ao servidor, e por isso a
 *  página continua funcionando com a rede ruim de um salão cheio. */
export const PIX_CHAVE = (process.env.NEXT_PUBLIC_PIX_CHAVE || IGREJA.pixChave || '').trim();

/** O nome que aparece no app de quem paga, antes de confirmar (campo 59 do BR
 *  Code). Máximo 25 caracteres, sem acento — `lib/pix.ts` corta e limpa. */
export const PIX_NOME = process.env.NEXT_PUBLIC_PIX_NOME || IGREJA.pixNome;
export const PIX_CIDADE = process.env.NEXT_PUBLIC_PIX_CIDADE || IGREJA.pixCidade;

/** A página existe mesmo sem chave configurada: ela explica em vez de quebrar.
 *  Enquanto for false, a perna do Pix mostra o aviso e não desenha QR nenhum. */
/* TEM_PIX FAZ A MESMA PERGUNTA QUE `pixCopiaECola` FAZ — 21/09/2026.

   Era `PIX_CHAVE.trim().length > 0`, e `pixCopiaECola` recusa chave acima de
   77 caracteres ou com caractere fora do ASCII. Entre as duas havia uma faixa
   em que a tela DESENHAVA o botão do Pix e o código saía vazio: a pessoa lia
   "Dízimo · R$ 350,75", via um QR (válido, da string vazia), tocava em copiar,
   lia "Código copiado" e chegava no app do banco sem nada.

   Agora a pergunta é uma só, feita uma vez na carga do módulo, tentando montar
   um código de verdade. Se não monta, não existe Pix nesta configuração e a
   tela nem oferece — que é muito melhor que oferecer e falhar no meio do
   culto. */
export function pixDisponivel(chave: string): boolean {
  if (!chave) return false;
  try {
    pixCopiaECola({ chave, nome: PIX_NOME, cidade: PIX_CIDADE, valor: 10, txid: 'TESTE' });
    return true;
  } catch (e) {
    /* o motivo precisa aparecer em algum lugar: uma chave mal colada no painel
       da Vercel some sem isto, e o Pix simplesmente não existe no site sem
       ninguém saber por quê. */
    if (typeof console !== 'undefined') {
      console.warn('[oferta] o Pix esta DESLIGADO:', String((e as Error)?.message || e));
    }
    return false;
  }
}

/* A REGRA E A FIAÇÃO SÃO TESTADAS EM LUGARES DIFERENTES, E ISSO ESTÁ ESCRITO
   PORQUE UMA DELAS É MAIS FRACA.

   `pixDisponivel` é uma função pura de uma chave: `scripts/ofertar-nao-mente.
   test.mjs` a chama com chave boa, vazia, longa demais, acentuada e com
   espaço-zero, então a REGRA está presa em qualquer máquina.

   `TEM_PIX` é a fiação: a regra aplicada à chave DESTE ambiente. Um teste só
   consegue ver a fiação quebrar quando o ambiente tem uma chave que as duas
   perguntas respondem diferente — medido: com `NEXT_PUBLIC_PIX_CHAVE` de 78
   caracteres, o caso do invariante reprova; com a chave vazia da máquina de
   desenvolvimento, as duas dizem `false` e ele fica quieto, porque aí não há
   divergência nenhuma para ver. */
export const TEM_PIX = pixDisponivel(PIX_CHAVE);

/* O cartão, o Apple Pay e o Google Pay NÃO têm constante aqui, e isso é uma
   decisão de segurança, não de organização: a credencial do adquirente mora em
   `STONE_SECRET_KEY` (ou `MP_ACCESS_TOKEN`), sem prefixo público, e qualquer
   `NEXT_PUBLIC_` que a tocasse a mandaria inteira para o JavaScript que
   qualquer pessoa baixa.

   É EXATAMENTE POR ISSO que a chave Pix pôde sair da variável de ambiente e a
   do adquirente não: uma só recebe, a outra cobra.

   Quem sabe se o cartão está ligado é o servidor (`lib/checkout.ts`), e ele
   conta para a tela por propriedade, na página. A tela recebe um booleano e
   nunca vê o token. */

/* --------------------------------------------------------------------- txid ---
   Até 25 caracteres alfanuméricos, e é a ÚNICA coisa nossa que volta no
   registro do Pix recebido. Carrega três informações e nada mais:

     GUIA   de onde veio (o site, não a maquininha nem a chave no boletim)
     D | O  dízimo ou oferta
     AAMMDD o dia
     xxxx   sorteio, para dois Pix do mesmo tipo no mesmo dia não colidirem

   NÃO carrega nome, telefone nem valor. Nome e valor já vêm do banco; pôr
   dado de pessoa num campo que viaja em QR impresso seria criar exposição
   sem ganhar informação. */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem I, O, 0, 1: confundem em conferência visual

export function txidDe(tipo: TipoOferta, quando = new Date()): string {
  const d =
    String(quando.getFullYear() % 100).padStart(2, '0') +
    String(quando.getMonth() + 1).padStart(2, '0') +
    String(quando.getDate()).padStart(2, '0');
  let sorteio = '';
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  for (const b of bytes) sorteio += ALFABETO[b % ALFABETO.length];
  return `GUIA${tipo === 'dizimo' ? 'D' : 'O'}${d}${sorteio}`;
}

/* -------------------------------------------------------------------- valor ---
   O campo aceita o que a pessoa digitar e mostra em reais. A regra é chata de
   propósito: dízimo tem centavo quebrado, e arredondar o dízimo de alguém
   seria mexer no que ela decidiu dar. */

/** Dígitos → centavos. "35075" vira 350.75. É assim que o campo funciona: a
 *  pessoa digita números e eles entram pela direita, sem precisar achar a
 *  vírgula num teclado de celular. */
export function valorDeDigitos(d: string): number {
  const so = (d || '').replace(/\D+/g, '').slice(0, 9);
  return so ? parseInt(so, 10) / 100 : 0;
}

export function emReais(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** O mínimo é R$1. Abaixo disso quase sempre é a pessoa testando a tela, e um
 *  Pix de um centavo sem querer gera tarifa e linha no extrato para a igreja
 *  conciliar. O máximo existe só para pegar dedo escorregado: quem for dar
 *  mais que isso fala com a tesouraria, não com um formulário. */
/* O QUE A TELA DO FIM PODE AFIRMAR — 21/09/2026.

   Esta regra saiu de dentro do JSX pelo mesmo motivo que `decisaoDoRobo` saiu
   de dentro de um `if`: ela decide se a igreja AFIRMA ter recebido dinheiro, e
   isso é grande demais para viver numa expressão ternária no meio de um
   componente, sem nome e sem teste.

   Três estados, e a diferença entre eles é QUEM disse que o dinheiro andou:

     'cartao'  o adquirente redirecionou para cá. Há a palavra de um terceiro,
               então "Recebemos" é defensável.
     'pix'     a pessoa tocou em "Já ofertei". O site não falou com banco
               nenhum, não gravou nada, não conferiu nada. A única coisa
               verdadeira é o que ELA disse.
     pendente  o adquirente disse "em análise". Já estava certo desde o começo,
               e é o precedente que faltava aplicar ao Pix. */
export type OrigemDoFim = 'cartao' | 'pix';

export function fraseDoFim(origem: OrigemDoFim, pendente: boolean): { titulo: string; afirma: boolean } {
  if (pendente) return { titulo: 'Estamos aguardando a confirmação.', afirma: false };
  if (origem === 'pix') return { titulo: 'Você marcou que já ofertou.', afirma: false };
  return { titulo: 'Recebemos. Obrigado.', afirma: true };
}

export const MIN = 1;
export const MAX = 100000;

export function valorInvalido(v: number): string | null {
  if (!v || v < MIN) return `O valor mínimo é ${emReais(MIN)}.`;
  if (v > MAX) return `Para valores acima de ${emReais(MAX)}, fale com a tesouraria da igreja.`;
  return null;
}
