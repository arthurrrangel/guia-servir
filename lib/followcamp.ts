/* =============================================================================
   FOLLOW CAMP 2027: AS REGRAS DO PAGAMENTO — 01/10/2026

   Este arquivo é lido pela TELA e pelo SERVIDOR, e é por isso que ele existe
   separado: o valor que a pessoa vê e o valor que a rota cobra têm que sair da
   mesma conta. A tela mostra; quem decide é o servidor (app/api/followcamp/*),
   que recalcula tudo a partir do que a pessoa escolheu e nunca aceita um
   valor pronto vindo do navegador, a não ser a parcela do carnê, que é livre
   por definição e por isso tem piso e teto.

   De onde vêm os números: PDF "Info faltantes - Guia Follow Camp" (30/09/2026).
     · R$ 697 por campista, 1º lote até 3 de novembro;
     · 10% de desconto quando dois ou mais irmãos se inscrevem;
     · Carnê Follow: parcelado, com quitação até 3 de janeiro.
   O que o PDF NÃO diz, e por isso está decidido aqui de forma conservadora:
     · o valor do 2º lote. Depois de 03/11, "inscrição" e "irmãos" FECHAM e a
       tela manda falar com a organização. Cobrar R$ 697 depois do prazo seria
       inventar preço; travar é só uma linha a mudar quando o valor sair.
     · as regras do carnê (quantas parcelas, de quanto). A parcela é livre,
       entre PARCELA_MIN e o valor do lote.

   Nenhum dado de pessoa mora aqui. Nome, CPF, e-mail e celular passam pela
   rota direto para a Stone e não são gravados pelo site.
   ============================================================================= */

export const FC27 = {
  nome: 'Follow Camp 2027',
  tema: 'Eu me Rendo',
  quando: '05 a 10 de fevereiro de 2027',
  /* o WhatsApp da organização, o mesmo da página do Camp */
  whatsapp: '5521995946491',
  whatsappTexto: '21 99594-6491',
} as const;

/** `fim` é EXCLUSIVO: o primeiro instante em que o lote já não vale (00:00 do
 *  dia seguinte, em -03:00). "Até 3 de novembro" inclui o dia 3 inteiro. */
export type Lote = { nome: string; valor: number; fim: string };

/** Os lotes, em ordem. O 2º entra aqui quando a organização divulgar. */
export const LOTES: readonly Lote[] = [
  { nome: '1º lote', valor: 697, fim: '2026-11-04T00:00:00-03:00' },
];

export const DESCONTO_IRMAOS = 0.10;
/** Exclusivo, como `Lote.fim`: "quitação até 3 de janeiro" inclui o dia 3. */
export const CARNE_FIM = '2027-01-04T00:00:00-03:00';
/** Abaixo disto quase sempre é engano de digitação, e cada parcela vira uma
 *  linha a conferir no painel da Stone. */
export const PARCELA_MIN = 50;
/** A parcela nunca passa do valor cheio do 1º lote: quem vai pagar tudo de uma
 *  vez escolhe "Inscrição", que tem o valor travado. */
export const PARCELA_MAX = LOTES[0].valor;

export type Referente = 'inscricao' | 'irmaos' | 'parcela';
export const REFERENTES: readonly Referente[] = ['inscricao', 'irmaos', 'parcela'];

export function loteVigente(agora = new Date()): Lote | null {
  const t = agora.getTime();
  return LOTES.find(l => t < new Date(l.fim).getTime()) ?? null;
}

export function carneAberto(agora = new Date()): boolean {
  return agora.getTime() < new Date(CARNE_FIM).getTime();
}

const centavos = (v: number) => Math.round(v * 100);
const deCentavos = (c: number) => c / 100;

/** 10% sobre R$ 697 = R$ 627,30. Arredondado no centavo, uma vez só. */
export function valorIrmaos(cheio: number): number {
  return deCentavos(Math.round(centavos(cheio) * (1 - DESCONTO_IRMAOS)));
}

export function emReais(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const ROTULO: Record<Referente, string> = {
  inscricao: 'Inscrição',
  irmaos: 'Inscrição com desconto de irmãos',
  parcela: 'Parcela do Carnê Follow',
};

export type Preco = { ok: true; valor: number } | { ok: false; erro: string };

/** O valor a cobrar. A mesma função responde à tela e à rota. */
export function precoDe(ref: Referente, agora = new Date(), parcela?: number | null): Preco {
  if (ref === 'inscricao' || ref === 'irmaos') {
    const lote = loteVigente(agora);
    if (!lote) {
      return { ok: false, erro: 'O 1º lote terminou em 3 de novembro, e o valor do próximo lote ainda não saiu. Fale com a organização no WhatsApp.' };
    }
    return { ok: true, valor: ref === 'irmaos' ? valorIrmaos(lote.valor) : lote.valor };
  }
  if (ref === 'parcela') {
    if (!carneAberto(agora)) return { ok: false, erro: 'O Carnê Follow fechou em 3 de janeiro.' };
    const v = typeof parcela === 'number' ? parcela : NaN;
    if (!Number.isFinite(v) || v <= 0) return { ok: false, erro: 'Digite o valor da parcela.' };
    /* centavo exato: quem chama a rota direto não passa pelo campo da tela */
    if (centavos(v) !== Number((v * 100).toFixed(4))) return { ok: false, erro: 'O valor precisa ter no máximo dois dígitos depois da vírgula.' };
    if (v < PARCELA_MIN) return { ok: false, erro: `A parcela mínima é ${emReais(PARCELA_MIN)}.` };
    if (v > PARCELA_MAX) return { ok: false, erro: `A parcela não passa de ${emReais(PARCELA_MAX)}. Para pagar tudo de uma vez, escolha "Inscrição".` };
    return { ok: true, valor: v };
  }
  return { ok: false, erro: 'Escolha o que você está pagando.' };
}

/* ------------------------------------------------------------------ nomes ---
   Nome completo: duas palavras ou mais, letras de qualquer alfabeto, e só os
   sinais que aparecem em nome de gente (apóstrofo, hífen, ponto). */
export function limpaNome(s: string): string {
  /* NFC: texto colado de algumas origens vem com o acento separado da letra
     (NFD), e aí "José" não passa na regra de letras */
  return (s || '').normalize('NFC').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function nomeInvalido(s: string, quem = 'do campista'): string | null {
  const n = limpaNome(s);
  if (!n) return `Escreva o nome completo ${quem}.`;
  if (!/^[\p{L}][\p{L}'’ .-]*[\p{L}.]$/u.test(n)) return `O nome ${quem} só pode ter letras.`;
  if (n.split(' ').filter(p => p.replace(/[.'’-]/g, '').length >= 2).length < 2) return `Escreva nome e sobrenome ${quem}.`;
  return null;
}

/* -------------------------------------------------------------- documentos --- */
export const soDigitos = (s: string) => (s || '').replace(/\D+/g, '');

/** CPF pelos dois dígitos verificadores. Não prova que o CPF existe: prova que
 *  não foi digitado errado, que é o que importa antes de ir à Stone. */
export function cpfValido(s: string): boolean {
  const c = soDigitos(s);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (base: string, peso: number) => {
    let soma = 0;
    for (const ch of base) soma += Number(ch) * peso--;
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(c.slice(0, 9), 10) === Number(c[9]) && dv(c.slice(0, 10), 11) === Number(c[10]);
}

export type Celular = { area_code: string; number: string };

/** Celular brasileiro: DDD + 9 dígitos começando em 9. Aceita com ou sem 55 e
 *  com qualquer pontuação. */
export function celularDe(s: string): Celular | null {
  let d = soDigitos(s);
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 11) return null;
  const ddd = d.slice(0, 2);
  if (Number(ddd) < 11 || ddd[1] === '0') return null;
  if (d[2] !== '9') return null;
  return { area_code: ddd, number: d.slice(2) };
}

export function emailValido(s: string): boolean {
  const e = (s || '').trim();
  return e.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(e);
}

/* ------------------------------------------------------------------ código ---
   O código do pagamento: FC27 + 8 sorteados. Vai como `code` do pedido na
   Stone, como chave de idempotência e como txid do Pix direto. É a referência
   que a pessoa manda no WhatsApp e que a organização procura no painel.

   NÃO carrega nome nem valor (a mesma regra do txid das ofertas, em
   lib/oferta.ts): o nome do campista vai no pedido da Stone, que é onde a
   organização confere, e não num texto que viaja dentro do QR.

   Alfabeto sem I, O, 0 e 1, que se confundem lidos em voz alta. 32 símbolos,
   divisor exato de 256: sem viés de módulo. */
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODIGO_OK = /^FC27[A-HJ-NP-Z2-9]{8}$/;

export function codigoFC27(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  let s = 'FC27';
  for (const x of b) s += ALFABETO[x % ALFABETO.length];
  return s;
}

/** "FC27-K7P3M9QX": mais fácil de ler e de ditar. */
export const codigoLegivel = (c: string) => (c.length === 12 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);

export const ROTULO_CURTO: Record<Referente, string> = { inscricao: 'Inscrição', irmaos: 'Irmãos', parcela: 'Carnê' };

export function descricaoDe(ref: Referente, campista: string, irmao?: string): string {
  const base = `${FC27.nome} · ${ROTULO[ref]} · ${limpaNome(campista)}`;
  return ref === 'irmaos' && irmao ? `${base} · irmão inscrito: ${limpaNome(irmao)}` : base;
}

/** O nome que aparece no painel da Stone. Curto (o link aceita 64), com o
 *  campista sempre inteiro: é por ele que a organização acha o pagamento. */
export function nomeCurtoDe(ref: Referente, campista: string): string {
  return `FC27 · ${ROTULO_CURTO[ref]} · ${limpaNome(campista)}`.slice(0, 64);
}

/** Cartão: no máximo 12x, e nenhuma parcela abaixo de R$ 50 (uma parcela do
 *  carnê de R$ 100 em 12x viraria 12 cobranças de R$ 8,33). */
export function maxParcelasCartao(valor: number): number {
  return Math.max(1, Math.min(12, Math.floor(valor / 50)));
}

/* ------------------------------------------- o cartão pelo link da Stone ---
   01/10/2026. O Arthur: "Só temos stone nao temos pagar.me". A igreja tem a
   Conta Stone, e a Conta Stone já faz LINK DE PAGAMENTO (no app ou em
   conta.stone.com.br), sem contrato novo: valor fixo, aceita vários
   pagamentos, cartão "em até 18x sem juros" no número de parcelas que quem
   cria escolhe. É esse link que a tela abre quando a API da Stone
   (lib/pagarme.ts) não está ligada.

   O link não é segredo: quem tem o link paga, e é para isso que ele existe.
   Por isso ele mora aqui, no código, com commit, e não numa variável da
   Vercel: o que está no ar tem que ter um commit.

   O que o link NÃO faz, e a tela diz:
     · não sabe quem é o campista nem o código: a pessoa avisa no WhatsApp, e
       a organização acha o pagamento no app pelo nome de quem pagou, o valor
       e o horário. Por isso a tela pede o nome de quem vai pagar no cartão;
     · não volta para o site e não confirma nada para o site.
     · não cobra o juro do parcelamento de quem paga: a taxa é da igreja, ou
       entra no preço do cartão (Lei 13.455/2017 permite preço diferente por
       meio de pagamento, informado antes, como a tela faz).

   Cada link DECLARA o valor e as parcelas digitados no app. A tela só oferece
   um link do lote vigente, e só se o valor declarado ficar entre o preço da
   regra (nunca menos) e 30% acima dele (mais que isso é erro de digitação).
   Lote novo: o link velho some sozinho da tela, e é desativado no app. */
export type LinkCartao = {
  /** o lote a que o link pertence, igual a `Lote.nome` */
  lote: string;
  ref: 'inscricao' | 'irmaos';
  /** o valor digitado no app da Stone, em reais */
  valor: number;
  /** o máximo de parcelas escolhido no app */
  parcelas: number;
  url: string;
};

/** Vazio = o cartão por link fica desligado e a tela nem mostra a opção.
 *
 *  03/10/2026: o link que o Arthur mandou. Lido na página pública dele (sem
 *  pagar nada): vendido por GUIA CHURCH COMUNIDADE EVANGELICA, CNPJ
 *  49.173.580/0001-08 (o mesmo da chave Pix); R$ 697,00; aceita Pix,
 *  crédito e débito (o débito só pela carteira digital); crédito SÓ À VISTA
 *  (a única parcela configurada é 1x de R$ 697,00), e por isso `parcelas: 1`.
 *  O item do link se chama "Follow Camp 2026": o nome se corrige no app da
 *  Stone, não aqui.
 *  Irmãos (R$ 627,30) ainda não têm link: na tela, o cartão fica fechado para
 *  eles e o Pix direto cobra o valor com desconto. */
export const LINKS_CARTAO: readonly LinkCartao[] = [
  { lote: '1º lote', ref: 'inscricao', valor: 697, parcelas: 1, url: 'https://payment-link-v3.stone.com.br/pl_b1ZM7pm2zVEGwK1ues6lQqvn9jxyDRBg' },
];

const HOST_DO_LINK = /(^|\.)(stone\.com\.br|pagar\.me)$/;

/** Por que este link não pode ir para a tela (null = pode). */
export function linkInvalido(l: LinkCartao): string | null {
  let u: URL;
  try { u = new URL(l.url); } catch { return 'endereço inválido'; }
  if (u.protocol !== 'https:' || !HOST_DO_LINK.test(u.hostname)) return `o link não é da Stone: ${u.hostname}`;
  const lote = LOTES.find(x => x.nome === l.lote);
  if (!lote) return `lote desconhecido: ${l.lote}`;
  if (l.ref !== 'inscricao' && l.ref !== 'irmaos') return 'só inscrição e irmãos têm link: a parcela do carnê tem valor livre';
  if (typeof l.valor !== 'number' || !Number.isFinite(l.valor) || centavos(l.valor) !== Number((l.valor * 100).toFixed(4))) return 'valor com mais de dois dígitos depois da vírgula';
  const preco = l.ref === 'irmaos' ? valorIrmaos(lote.valor) : lote.valor;
  if (centavos(l.valor) < centavos(preco)) return `o link cobra ${emReais(l.valor)}, menos que o preço do lote (${emReais(preco)})`;
  if (centavos(l.valor) > Math.round(centavos(preco) * 1.3)) return `o link cobra ${emReais(l.valor)}, mais de 30% acima do preço (${emReais(preco)}): confira o valor`;
  if (!Number.isInteger(l.parcelas) || l.parcelas < 1 || l.parcelas > 18) return 'parcelas fora de 1 a 18';
  return null;
}

/** O link do lote dado para o que se está pagando, ou null. A tela passa o
 *  lote que ela já calculou (o mesmo no servidor e na primeira pintura).
 *  `links` só muda nos testes. */
export function linkDoLote(ref: Referente | null, lote: Lote | null, links: readonly LinkCartao[] = LINKS_CARTAO): LinkCartao | null {
  if (!lote || (ref !== 'inscricao' && ref !== 'irmaos')) return null;
  return links.find(l => l.lote === lote.nome && l.ref === ref && !linkInvalido(l)) ?? null;
}

export function linkCartaoDe(ref: Referente | null, agora = new Date(), links: readonly LinkCartao[] = LINKS_CARTAO): LinkCartao | null {
  return linkDoLote(ref, loteVigente(agora), links);
}

export function temLinkCartao(agora = new Date(), links: readonly LinkCartao[] = LINKS_CARTAO): boolean {
  return linkCartaoDe('inscricao', agora, links) !== null || linkCartaoDe('irmaos', agora, links) !== null;
}

export type MeioDoAviso = 'pix' | 'cartao' | 'pixdireto' | 'cartaoLink';

/** O texto que a pessoa manda para a organização, já pronto.
 *
 *  O link da Stone não diz "cartão" (03/10/2026): a página dele também
 *  aceita Pix, e quem escolheu "cartão" aqui pode pagar no Pix lá. A
 *  mensagem diz por onde a pessoa pagou, que é o que a organização procura
 *  no app. */
export function mensagemWhatsApp(p: {
  campista: string; ref: Referente; valor: number; codigo: string; meio: MeioDoAviso; irmao?: string; titular?: string;
}): string {
  const meio = p.meio === 'cartao' ? 'pelo cartão'
    : p.meio === 'cartaoLink' ? 'pelo link de pagamento da Stone'
    : p.meio === 'pix' ? 'pelo Pix do site' : 'pelo Pix direto na conta da igreja';
  const linhas = [
    `Oi! Paguei ${meio}.`,
    `Campista: ${limpaNome(p.campista)}`,
    `${ROTULO[p.ref]}: ${emReais(p.valor)}`,
  ];
  if (p.ref === 'irmaos' && p.irmao) linhas.push(`Irmão inscrito: ${limpaNome(p.irmao)}`);
  if (p.meio === 'cartaoLink' && p.titular) linhas.push(`Quem pagou: ${limpaNome(p.titular)}`);
  linhas.push(`Código: ${codigoLegivel(p.codigo)}`);
  if (p.meio === 'pixdireto' || p.meio === 'cartaoLink') linhas.push('O comprovante vai em seguida.');
  return linhas.join('\n');
}

export const linkWhatsApp = (texto: string) => `https://wa.me/${FC27.whatsapp}?text=${encodeURIComponent(texto)}`;

/* ------------------------------------------------------- o pedido inteiro ---
   A mesma conferência na tela (para dizer o que falta antes de ir) e na rota
   (porque quem chama a rota direto não passa pela tela). */
export type Pedido = {
  campista: string;
  referente: Referente;
  irmao: string;
  valor: number;
};

export type Conferido<T> = { ok: true; dados: T } | { ok: false; erro: string };

export function conferirPedido(c: Record<string, unknown>, agora = new Date()): Conferido<Pedido> {
  const campista = limpaNome(String(c.campista ?? ''));
  const mal = nomeInvalido(campista, 'do campista');
  if (mal) return { ok: false, erro: mal };
  const referente = String(c.referente ?? '') as Referente;
  if (!REFERENTES.includes(referente)) return { ok: false, erro: 'Escolha o que você está pagando.' };
  let irmao = '';
  if (referente === 'irmaos') {
    irmao = limpaNome(String(c.irmao ?? ''));
    const m = nomeInvalido(irmao, 'do irmão inscrito');
    if (m) return { ok: false, erro: m };
    if (irmao.toLocaleLowerCase('pt-BR') === campista.toLocaleLowerCase('pt-BR')) {
      return { ok: false, erro: 'O irmão inscrito é outra pessoa: escreva o nome dele.' };
    }
  }
  const preco = precoDe(referente, agora, referente === 'parcela' ? (c.parcela as number) : null);
  if (!preco.ok) return preco;
  /* O CÓDIGO NÃO VEM DAQUI — 01/10/2026, auditoria. Ele era sorteado no
     navegador e usado como chave de idempotência na Stone: quem reenviasse o
     código de outra pessoa (até 24 h depois) recebia o pedido DELA de volta,
     e a tela dizia "confirmado" para o campista errado. Agora o servidor
     sorteia o código a cada pedido (app/api/followcamp/*). */
  return { ok: true, dados: { campista, referente, irmao, valor: preco.valor } };
}

/* ------------------------------------------------------ o aviso de "paguei" ---
   04/10/2026 (migração 110). Quem pagou no Pix direto ou no link da Stone e
   toca em "Avisar no WhatsApp" deixa uma linha A CONFERIR no painel da
   organização: campista, valor, meio, código e quem pagou. Não é
   confirmação (o site não fala com banco nenhum): é o que a organização
   procura no app da Stone, e confirma com um toque.

   A rota confere tudo de novo: o valor tem que ser o da regra (Pix direto) ou
   o do link do lote (cartão), nunca um número vindo do navegador. */
export type Informado = {
  codigo: string; campista: string; referente: Referente; irmao: string;
  valor: number; meio: 'pixdireto' | 'cartaoLink'; titular: string;
};

export function conferirInformado(c: Record<string, unknown>, agora = new Date(), links: readonly LinkCartao[] = LINKS_CARTAO): Conferido<Informado> {
  const codigo = String(c.codigo ?? '');
  if (!CODIGO_OK.test(codigo)) return { ok: false, erro: 'Código do pagamento inválido.' };
  const meio = c.meio;
  if (meio !== 'pixdireto' && meio !== 'cartaoLink') return { ok: false, erro: 'Meio de pagamento inválido.' };
  const valor = typeof c.valor === 'number' ? c.valor : NaN;
  if (!Number.isFinite(valor)) return { ok: false, erro: 'Valor inválido.' };
  const pedido = conferirPedido({ campista: c.campista, referente: c.referente, irmao: c.irmao, parcela: c.referente === 'parcela' ? valor : null }, agora);
  if (!pedido.ok) return pedido;
  let esperado = pedido.dados.valor;
  if (meio === 'cartaoLink') {
    const l = linkCartaoDe(pedido.dados.referente, agora, links);
    if (!l) return { ok: false, erro: 'Este pagamento não tem link de cartão.' };
    esperado = l.valor;
  }
  if (centavos(esperado) !== centavos(valor)) return { ok: false, erro: 'Valor diferente do combinado.' };
  const titular = limpaNome(String(c.titular ?? ''));
  if (titular && nomeInvalido(titular, 'de quem pagou')) return { ok: false, erro: 'Nome de quem pagou inválido.' };
  return {
    ok: true,
    dados: { codigo, campista: pedido.dados.campista, referente: pedido.dados.referente, irmao: pedido.dados.irmao, valor: esperado, meio, titular },
  };
}

export type Pagador = { nome: string; email: string; cpf: string; celular: Celular };

export function conferirPagador(c: Record<string, unknown>): Conferido<Pagador> {
  const nome = limpaNome(String(c.nome ?? ''));
  const mal = nomeInvalido(nome, 'de quem está pagando');
  if (mal) return { ok: false, erro: mal };
  const cpf = soDigitos(String(c.cpf ?? ''));
  if (!cpfValido(cpf)) return { ok: false, erro: 'Confira o CPF de quem está pagando.' };
  const email = String(c.email ?? '').trim().toLowerCase();
  if (!emailValido(email)) return { ok: false, erro: 'Confira o e-mail.' };
  const celular = celularDe(String(c.celular ?? ''));
  if (!celular) return { ok: false, erro: 'Confira o celular, com DDD.' };
  return { ok: true, dados: { nome, email, cpf, celular } };
}
