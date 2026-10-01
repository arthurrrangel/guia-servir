/* =============================================================================
   STONE / PAGAR.ME PARA O FOLLOW CAMP — 01/10/2026

   SÓ SERVIDOR, pelo mesmo motivo de lib/checkout.ts: `STONE_SECRET_KEY` cobra
   em nome da igreja e não pode chegar ao navegador. A tela fala com
   /api/followcamp/*, e só as rotas importam este arquivo.

   Por que um arquivo novo, e não mais uma função em lib/checkout.ts: aquele é o
   checkout das OFERTAS (valor livre, link de meia hora, sem dado de pessoa) e
   tem testes próprios. Aqui é uma cobrança com dono, Pix na nossa tela e
   cartão parcelado. Misturar os dois faria uma mudança no Camp mexer na
   oferta de domingo.

   O QUE ESTÁ DOCUMENTADO (docs.pagar.me, API v5, lido em 01/10/2026):
     · POST /orders com Pix: `customer` exige name, email, document, type e
       phones. O copia e cola vem em charges[0].last_transaction.qr_code.
       `pix.expires_in` é em SEGUNDOS. Aceita `code` (até 52), `metadata` e o
       cabeçalho `Idempotency-Key` (24 h em produção).
     · GET /orders/{id}: status pending | paid | canceled | failed.
     · POST /paymentlinks: `installments_setup` com max_installments, amount,
       free_installments e, ou `customer_fee` (repassa as taxas a quem paga),
       ou `interest_type` + `interest_rate` (inteiro, %). `flow_settings.
       success_url` é a volta; `order_code` é a referência; `expires_in` é em
       MINUTOS; `max_paid_sessions: 1` deixa tentar de novo depois de um
       cartão recusado.

   AUDITORIA DE 01/10/2026, antes de ligar a chave. O que mudou por causa dela:
     · o código do pagamento é sorteado no SERVIDOR (era no navegador, e era a
       chave de idempotência: reenviar o código de outra pessoa devolvia o
       pedido dela);
     · a resposta da Stone é conferida (code e valor) antes de chegar à tela;
     · o log leva status, mensagem e NOMES de campo, nunca valores: a resposta
       de erro da Stone pode ecoar o pedido inteiro, com nome de menor de idade;
     · a consulta de estado exige a assinatura que o próprio POST devolveu, e
       id inventado não chega à Stone;
     · "expirado" só depois de 5 min de folga além do prazo da Stone.

   ○ NÃO OBSERVADO, e é o que o primeiro teste com `sk_test_...` precisa ver:
     · se a conta é PSP e por isso exige ENDEREÇO do cliente;
     · se `customer_fee` vale para esta conta e se cobra acréscimo também em 1x
       (aí o "Total" da tela não seria o valor cobrado no cartão à vista);
     · se a `success_url` só é chamada com o pagamento aprovado;
     · se a resposta repetida por Idempotency-Key traz o `qr_code`;
     · o formato de `expires_at` (com ou sem fuso);
     · se o Pix está habilitado na conta (precisa de aditivo de contrato).
   ============================================================================= */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { CODIGO_OK, maxParcelasCartao, type Celular, type Referente } from './followcamp';

if (typeof window !== 'undefined') {
  throw new Error('lib/pagarme.ts é só de servidor: ele carrega a chave secreta da Stone.');
}

const CHAVE = (process.env.STONE_SECRET_KEY || '').trim();
/* Base em variável porque a doc da Pagar.me se contradiz: uma página manda
   testar em sdx-api.pagar.me, outra diz que teste e produção usam api.pagar.me
   e a chave decide. O dublê dos testes locais também entra por aqui. */
const BASE = (process.env.PAGARME_API_URL || 'https://api.pagar.me/core/v5').replace(/\/+$/, '');

/* Juro fixo ao mês, INTEIRO (a doc da Stone diz integer). Vazio = `customer_fee`,
   que repassa a taxa real da Stone a quem parcela. Valor inválido não vira
   palpite: avisa alto no log e fica no `customer_fee`. */
const JUROS_TEXTO = (process.env.PAGARME_JUROS || '').trim();

/** O juro fixo, se o texto for um inteiro válido; senão `null` (= customer_fee). */
export function jurosDe(texto: string): number | null {
  const t = (texto || '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n > 0 && n < 20 ? n : null;
}
const JUROS = jurosDe(JUROS_TEXTO);
if (JUROS_TEXTO && JUROS === null) {
  console.error(`[followcamp] PAGARME_JUROS="${JUROS_TEXTO}" é inválido (precisa ser inteiro entre 1 e 19, em % ao mês). Usando customer_fee.`);
}

/** O parcelamento do link, em função do valor e do juro configurado. */
export function parcelasDe(valor: number, juros: number | null) {
  const amount = Math.round(valor * 100);
  const max_installments = maxParcelasCartao(valor);
  return juros
    ? { max_installments, amount, free_installments: 1, interest_type: 'simple', interest_rate: juros }
    : { max_installments, amount, free_installments: 1, customer_fee: true };
}

export const TEM_PAGARME = CHAVE.length > 0;

function origem(): string {
  const v = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  return (v || 'https://guiaservir.com').replace(/\/+$/, '');
}

/* ------------------------------------------------------------------ log ---
   Só o que ajuda a consertar: status, a mensagem da Stone e os NOMES dos
   campos com erro. Nunca os valores, e nunca o corpo inteiro, que pode trazer
   o pedido de volta (chave `request`) com nome, CPF e celular. */
/* A mensagem da Stone pode citar o que mandamos ("documento inválido para
   Fulano"). Por isso, além de e-mail e números, sai dela cada palavra dos nomes
   que ESTE pedido levou: a gente sabe exatamente o que mandou. */
function tirarDoTexto(t: string, segredos: string[]): string {
  let x = t;
  for (const seg of segredos) {
    for (const p of String(seg || '').split(/\s+/)) {
      if (p.length < 3) continue;
      x = x.split(p).join('<…>');
    }
  }
  return x.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<email>').replace(/\d[\d.\- ]{3,}\d/g, '<n>');
}

export function resumoDoErro(json: unknown, status: number, segredos: string[] = []): string {
  const j = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const msg = typeof j.message === 'string' ? tirarDoTexto(j.message, segredos).slice(0, 160) : '';
  const erros = j.errors && typeof j.errors === 'object' ? Object.keys(j.errors as object).slice(0, 12) : [];
  return `status=${status}${msg ? ` mensagem="${msg}"` : ''}${erros.length ? ` campos=${erros.join(',')}` : ''}`;
}

type Resposta = { ok: boolean; status: number; json: any };

async function chamar(metodo: 'GET' | 'POST', caminho: string, corpo?: unknown, idem?: string, segredos: string[] = []): Promise<Resposta> {
  const cab: Record<string, string> = {
    accept: 'application/json',
    /* Basic com a chave secreta como usuário e senha vazia: o dois-pontos no
       fim é o formato da Pagar.me, não engano */
    authorization: 'Basic ' + Buffer.from(`${CHAVE}:`).toString('base64'),
  };
  if (corpo !== undefined) cab['content-type'] = 'application/json';
  if (idem) cab['Idempotency-Key'] = idem;
  const rota = caminho.split('?')[0].replace(/\/or_[A-Za-z0-9]+/, '/{id}');
  let r: Response;
  try {
    r = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      headers: cab,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      /* 10 s de teto: com a Stone lenta, a tela diz "tente de novo" em vez de girar */
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
  } catch (e) {
    console.error('[followcamp] stone sem resposta', metodo, rota, String((e as Error)?.name || e));
    return { ok: false, status: 0, json: null };
  }
  const texto = await r.text();
  let json: any = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { json = null; }
  if (!r.ok) console.error('[followcamp] stone', metodo, rota, resumoDoErro(json, r.status, segredos));
  return { ok: r.ok, status: r.status, json };
}

/* ------------------------------------------------------------ assinatura ---
   O POST devolve o id do pedido junto com uma assinatura; o GET de estado só
   aceita o par. Sem isso, qualquer id inventado virava uma chamada à Stone com
   a chave da igreja. A chave da assinatura deriva da chave secreta e não sai
   do servidor. */
const CHAVE_ASSINATURA = createHmac('sha256', 'fc27-estado').update(CHAVE || 'sem-chave').digest();

export function assinar(pedido: string): string {
  return createHmac('sha256', CHAVE_ASSINATURA).update(pedido).digest('base64url').slice(0, 22);
}

export function assinaturaOk(pedido: string, assinatura: string): boolean {
  const a = Buffer.from(assinar(pedido));
  const b = Buffer.from(String(assinatura || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ------------------------------------------------------------------- Pix --- */
export type PedidoPix = {
  codigo: string;
  valor: number;
  descricao: string;
  campista: string;
  referente: Referente;
  irmao?: string;
  pagador: { nome: string; email: string; cpf: string; celular: Celular };
};

export type PixCriado =
  | { ok: true; pedido: string; assinatura: string; copiaECola: string; expiraEm: string | null; valor: number }
  | { ok: false; erro: string };

/** Meia hora: tempo de abrir o app do banco, pedir a senha ao pai e pagar. Um
 *  QR que vale dias fica circulando em print de WhatsApp. */
export const PIX_VALIDADE_S = 30 * 60;
/** Folga depois do prazo antes de dizer "expirou": relógio, fila do banco. */
export const FOLGA_EXPIRADO_MS = 5 * 60 * 1000;

const FALHA_PIX = 'Não consegui gerar o Pix agora. Tente de novo em instantes, ou use o cartão.';

export async function criarPix(p: PedidoPix): Promise<PixCriado> {
  if (!TEM_PAGARME) return { ok: false, erro: 'O Pix pelo site ainda não está ligado.' };
  if (!CODIGO_OK.test(p.codigo)) return { ok: false, erro: FALHA_PIX };
  const centavos = Math.round(p.valor * 100);
  const corpo = {
    code: p.codigo,
    items: [{
      code: `FC27-${p.referente}`,
      /* EM CENTAVOS. Mandar reais cobra cem vezes menos e ninguém percebe até o extrato. */
      amount: centavos,
      description: p.descricao.slice(0, 250),
      quantity: 1,
    }],
    customer: {
      name: p.pagador.nome,
      email: p.pagador.email,
      type: 'individual',
      document: p.pagador.cpf,
      document_type: 'CPF',
      phones: { mobile_phone: { country_code: '55', area_code: p.pagador.celular.area_code, number: p.pagador.celular.number } },
    },
    payments: [{
      payment_method: 'pix',
      pix: {
        expires_in: PIX_VALIDADE_S,
        /* aparece no app do banco de quem paga, antes de confirmar */
        additional_information: [
          { name: 'Campista', value: p.campista.slice(0, 60) },
          { name: 'Código', value: p.codigo },
        ],
      },
    }],
    /* é por aqui que a organização acha o campista no painel da Stone */
    metadata: {
      evento: 'followcamp2027',
      campista: p.campista,
      referente: p.referente,
      irmao: p.irmao || '',
      codigo: p.codigo,
    },
  };
  const r = await chamar('POST', '/orders', corpo, p.codigo,
    [p.pagador.nome, p.campista, p.irmao || '', p.pagador.email, p.pagador.cpf, p.pagador.celular.number]);
  if (!r.ok || !r.json) return { ok: false, erro: FALHA_PIX };
  const t = r.json?.charges?.[0]?.last_transaction;
  const qr = typeof t?.qr_code === 'string' ? t.qr_code : '';
  const id = typeof r.json.id === 'string' ? r.json.id : '';
  /* o pedido que voltou tem que ser ESTE: mesmo código e mesmo valor */
  const codigoVolta = r.json.code;
  const valorVolta = typeof r.json.amount === 'number' ? r.json.amount : centavos;
  if (!id || !qr || String(r.json.status).toLowerCase() === 'failed'
      || (codigoVolta !== undefined && codigoVolta !== p.codigo) || valorVolta !== centavos) {
    console.error('[followcamp] pix recusado na conferência', `status=${r.json?.status}`, `transacao=${t?.status}`,
      `codigo_bate=${codigoVolta === undefined || codigoVolta === p.codigo}`, `valor_bate=${valorVolta === centavos}`);
    return { ok: false, erro: FALHA_PIX };
  }
  return {
    ok: true, pedido: id, assinatura: assinar(id), copiaECola: qr,
    expiraEm: t?.expires_at ? String(t.expires_at) : null, valor: valorVolta / 100,
  };
}

export type EstadoPix = 'aguardando' | 'pago' | 'expirado' | 'falhou' | 'desconhecido';

export const PEDIDO_OK = /^or_[A-Za-z0-9]{8,64}$/;

/** Só o estado volta para a tela: nada de nome, valor ou CPF. E só de pedido
 *  do Camp, com a assinatura que o POST entregou. */
export async function estadoDoPix(pedido: string, assinatura: string, agora = Date.now()): Promise<EstadoPix> {
  if (!TEM_PAGARME || !PEDIDO_OK.test(pedido) || !assinaturaOk(pedido, assinatura)) return 'desconhecido';
  const r = await chamar('GET', `/orders/${pedido}`);
  if (!r.ok || !r.json) return 'desconhecido';
  const doCamp = CODIGO_OK.test(String(r.json.code || '')) || r.json?.metadata?.evento === 'followcamp2027';
  if (!doCamp) return 'desconhecido';
  const st = String(r.json.status || '').toLowerCase();
  if (st === 'paid') return 'pago';
  if (st === 'canceled' || st === 'failed') return 'falhou';
  const t = r.json?.charges?.[0]?.last_transaction;
  const tst = String(t?.status || '').toLowerCase();
  if (tst === 'paid') return 'pago';
  if (tst === 'failed' || tst === 'with_error') return 'falhou';
  /* o estado depois de expirar não está documentado: decide-se pelo relógio,
     com folga, e só para um prazo que a Stone devolveu com fuso */
  const prazo = typeof t?.expires_at === 'string' && /(Z|[+-]\d\d:?\d\d)$/.test(t.expires_at) ? Date.parse(t.expires_at) : NaN;
  if (Number.isFinite(prazo) && agora > prazo + FOLGA_EXPIRADO_MS) return 'expirado';
  return 'aguardando';
}

/* ---------------------------------------------------------------- cartão --- */
export type PedidoCartao = { codigo: string; valor: number; nome: string; descricao: string };
export type LinkCriado = { ok: true; url: string } | { ok: false; erro: string };

export async function criarLinkCartao(p: PedidoCartao): Promise<LinkCriado> {
  if (!TEM_PAGARME) return { ok: false, erro: 'O cartão ainda não está ligado.' };
  const falha = 'Não consegui abrir o pagamento por cartão agora. Tente de novo em instantes, ou use o Pix.';
  if (!CODIGO_OK.test(p.codigo)) return { ok: false, erro: falha };
  const total = Math.round(p.valor * 100);
  const parcelas = parcelasDe(p.valor, JUROS);
  const corpo = {
    type: 'order',
    name: p.nome.slice(0, 64),
    order_code: p.codigo,
    /* uma hora, em MINUTOS: link velho circulando é link que alguém paga sem querer */
    expires_in: 60,
    /* UM pagamento aprovado por link; cartão recusado ainda pode tentar de novo */
    max_paid_sessions: 1,
    payment_settings: {
      accepted_payment_methods: ['credit_card'],
      credit_card_settings: { operation_type: 'auth_and_capture', installments_setup: parcelas },
    },
    cart_settings: {
      items: [{ name: p.nome.slice(0, 64), amount: total, description: p.descricao.slice(0, 250), default_quantity: 1 }],
    },
    flow_settings: { success_url: `${origem()}/followcamp/pagar?fim=cartao&c=${p.codigo}` },
  };
  const r = await chamar('POST', '/paymentlinks', corpo, `${p.codigo}-cartao`, [p.nome, p.descricao]);
  const url = r.json?.url;
  if (!r.ok || typeof url !== 'string' || !/^https:\/\//.test(url)) return { ok: false, erro: falha };
  return { ok: true, url };
}
