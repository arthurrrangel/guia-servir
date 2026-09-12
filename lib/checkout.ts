/* =============================================================================
   O CHECKOUT DE CARTÃO, APPLE PAY E GOOGLE PAY — 12/09/2026

   SÓ SERVIDOR. Nada aqui pode virar bundle: a credencial do adquirente dá
   acesso a cobrar em nome da igreja, e uma variável `NEXT_PUBLIC_` vai inteira
   para o JavaScript que qualquer pessoa baixa. Por isso as chaves NÃO têm
   prefixo público, e por isso a tela nunca fala com o adquirente direto — ela
   fala com /api/ofertar/checkout, e é o servidor que fala com o adquirente.

   ---------------------------------------------------------------------------
   POR QUE CHECKOUT HOSPEDADO, E NÃO APPLE PAY NA NOSSA PÁGINA

   Apple Pay na web exige, do dono do domínio: conta no Apple Developer
   Program, Merchant ID, certificado de processamento, certificado de
   identidade de comerciante, e verificação de CADA domínio e subdomínio — que
   expira e precisa ser renovada. Quando expira, o botão morre calado e a
   igreja descobre pela reclamação de quem tentou ofertar.

   Num checkout hospedado, tudo isso é do adquirente, no domínio dele. A igreja
   não mantém certificado nenhum. Em troca, a pessoa sai do guiaservir.com para
   pagar e volta — e esse é um preço bem menor do que um botão que morre
   sozinho num domingo.

   ---------------------------------------------------------------------------
   DOIS ADQUIRENTES, E NENHUM DELES OBRIGATÓRIO

   A STONE é o caminho da igreja: é o banco que ela já usa, e a Pagar.me (que é
   Stone) está na lista oficial de provedores de Apple Pay no Brasil. Chave em
   `STONE_SECRET_KEY` e pronto.

   O MERCADO PAGO fica como segunda porta, por um motivo prático: tarifa
   pública, conta self-service, e serve de plano B se a Stone demorar. Chave em
   `MP_ACCESS_TOKEN`.

   Quem tem chave, ganha; a Stone primeiro se as duas existirem, e `ADQUIRENTE`
   força uma delas quando for preciso. A rota, a tela e o resto do site não
   sabem qual está ligado — trocar de adquirente não pode obrigar a mexer no
   que a pessoa vê.
   ============================================================================= */
import { emReais, type TipoOferta } from './oferta';

/** As credenciais. NENHUMA tem prefixo público, e é isso que as mantém fora do
 *  navegador. Enquanto as duas forem vazias, a tela nem mostra o botão. */
const STONE = (process.env.STONE_SECRET_KEY || '').trim();
const MP = (process.env.MP_ACCESS_TOKEN || '').trim();

/** Qual adquirente está ligado. Não precisa ser dito: quem tem chave, ganha.
 *  A Stone vem primeiro porque é o banco da igreja. `ADQUIRENTE` só existe
 *  para forçar um dos dois quando os dois estiverem configurados. */
const ADQUIRENTE = process.env.ADQUIRENTE || (STONE ? 'stone' : MP ? 'mercadopago' : '');

export const TEM_CHECKOUT = ADQUIRENTE === 'stone' ? !!STONE : ADQUIRENTE === 'mercadopago' ? !!MP : false;

/** A origem pública do site, para as URLs de volta. A Vercel entrega
 *  VERCEL_PROJECT_PRODUCTION_URL sem protocolo. */
function origem(): string {
  const v = process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  return (v || 'https://guiaservir.com').replace(/\/+$/, '');
}

export type PedidoCheckout = {
  valor: number;
  tipo: TipoOferta;
  /** O mesmo identificador que o Pix carrega no txid. Viaja como
   *  `external_reference` e volta no registro do adquirente, para dízimo e
   *  oferta não virarem a mesma linha no relatório. */
  txid: string;
};

export type RespostaCheckout =
  | { ok: true; url: string }
  | { ok: false; erro: string };

/* ---------------------------------------------------------- mercado pago ---
   POST https://api.mercadopago.com/checkout/preferences
   Devolve `init_point`: a URL hospedada onde Apple Pay, Google Pay, cartão e
   Pix aparecem juntos. */
async function criarMercadoPago({ valor, tipo, txid }: PedidoCheckout): Promise<RespostaCheckout> {
  const base = origem();
  const rot = tipo === 'dizimo' ? 'Dízimo' : 'Oferta';

  /* `auto_return: 'approved'` só é aceito com back_urls em https. Em
     desenvolvimento (http://localhost) o Mercado Pago recusa a preferência
     inteira, então o campo sai fora e a pessoa volta pelo botão da tela dele.
     Melhor perder o retorno automático em desenvolvimento do que a rota
     responder 400 e ninguém entender por quê. */
  const httpsOk = base.startsWith('https://');

  const corpo: Record<string, unknown> = {
    items: [{
      id: txid,
      title: `${rot} · ${process.env.NEXT_PUBLIC_PIX_NOME || 'GUIA Church'}`,
      description: `${rot} de ${emReais(valor)}`,
      quantity: 1,
      currency_id: 'BRL',
      unit_price: Math.round(valor * 100) / 100,
    }],
    external_reference: txid,
    statement_descriptor: 'GUIA CHURCH',
    back_urls: {
      success: `${base}/ofertar?fim=1&t=${tipo}&v=${valor.toFixed(2)}`,
      pending: `${base}/ofertar?fim=1&t=${tipo}&v=${valor.toFixed(2)}&p=1`,
      failure: `${base}/ofertar?erro=1`,
    },
  };
  if (httpsOk) corpo.auto_return = 'approved';

  /* 10s de teto: se o adquirente estiver lento num domingo de manhã, a tela
     precisa dizer "não deu, tenta o Pix" em vez de ficar girando. */
  const corta = AbortSignal.timeout(10_000);

  let r: Response;
  try {
    r = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${MP}`,
        /* duas tentativas com a mesma chave não viram duas cobranças */
        'x-idempotency-key': txid,
      },
      body: JSON.stringify(corpo),
      signal: corta,
      cache: 'no-store',
    });
  } catch {
    return { ok: false, erro: 'O pagamento por cartão não respondeu. Tente o Pix.' };
  }

  if (!r.ok) {
    /* o texto do erro do adquirente NÃO volta para a tela: ele às vezes traz
       identificador de conta. Fica no log do servidor, que é onde serve. */
    console.error('[checkout] mercadopago', r.status, (await r.text()).slice(0, 400));
    return { ok: false, erro: 'Não consegui abrir o pagamento por cartão. Tente o Pix.' };
  }

  const j = await r.json().catch(() => null);
  const url = j?.init_point || j?.sandbox_init_point;
  if (!url) {
    console.error('[checkout] mercadopago sem init_point', JSON.stringify(j).slice(0, 300));
    return { ok: false, erro: 'Não consegui abrir o pagamento por cartão. Tente o Pix.' };
  }
  return { ok: true, url };
}

/* ------------------------------------------------------------- stone ---
   Stone / Pagar.me, link de pagamento:
   POST https://api.pagar.me/core/v5/paymentlinks

   É o checkout hospedado deles. Aceita cartão, Pix e boleto, e é dentro dele
   que Apple Pay, Google Pay e Click to Pay aparecem — as carteiras não são um
   "método" à parte, elas são um jeito de pagar o CARTÃO. Por isso
   `accepted_payment_methods` pede `credit_card` e não `apple_pay`.

   ○ NÃO OBSERVADO, e é o que precisa ser testado no dia em que a chave chegar:
   se as carteiras vêm ligadas de fábrica ou se é preciso habilitá-las no painel
   da Pagar.me. Se o botão do Apple Pay não aparecer no checkout, é ali que se
   liga, não aqui no código.

   ○ NÃO OBSERVADO também: o campo de redirecionamento depois do pagamento. Não
   inventei nome de campo — sem ele, quem paga vê a tela de confirmação da
   própria Pagar.me em vez de voltar para a nossa. Funciona; é só menos bonito.
   Quando houver conta, dá para conferir em dez minutos e ligar. */
async function criarStone({ valor, tipo, txid }: PedidoCheckout): Promise<RespostaCheckout> {
  const rot = tipo === 'dizimo' ? 'Dízimo' : 'Oferta';
  const igreja = process.env.NEXT_PUBLIC_PIX_NOME || 'GUIA Church';

  const corpo = {
    type: 'order',
    name: `${rot} · ${igreja}`.slice(0, 64),
    /* meia hora: é link de oferta feito na hora, não carrinho de loja. Link
       velho circulando é link que alguém paga sem querer. */
    expires_in: 30,
    /* UM pagamento por link. Sem isto, um link compartilhado no grupo da igreja
       vira várias cobranças. */
    max_paid_sessions: 1,
    payment_settings: {
      accepted_payment_methods: ['credit_card', 'pix'],
      credit_card_settings: { operation_type: 'auth_and_capture', installments: [{ number: 1, total: Math.round(valor * 100) }] },
    },
    cart_settings: {
      items: [{
        name: `${rot} · ${igreja}`.slice(0, 64),
        /* EM CENTAVOS. Mandar reais aqui cobra cem vezes menos e ninguém
           percebe até o extrato. */
        amount: Math.round(valor * 100),
        description: `${rot} de ${emReais(valor)}`,
        default_quantity: 1,
      }],
    },
  };

  let r: Response;
  try {
    r = await fetch('https://api.pagar.me/core/v5/paymentlinks', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        /* Basic com a chave secreta como usuário e senha vazia: é o formato da
           Pagar.me, e o dois-pontos no fim não é engano. */
        authorization: 'Basic ' + Buffer.from(`${STONE}:`).toString('base64'),
        'idempotency-key': txid,
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, erro: 'O pagamento por cartão não respondeu. Tente o Pix.' };
  }

  if (!r.ok) {
    console.error('[checkout] stone', r.status, (await r.text()).slice(0, 400));
    return { ok: false, erro: 'Não consegui abrir o pagamento por cartão. Tente o Pix.' };
  }
  const j = await r.json().catch(() => null);
  if (!j?.url) {
    console.error('[checkout] stone sem url', JSON.stringify(j).slice(0, 300));
    return { ok: false, erro: 'Não consegui abrir o pagamento por cartão. Tente o Pix.' };
  }
  return { ok: true, url: j.url };
}

/** A porta única. Quem chama não sabe qual adquirente está do outro lado, e é
 *  de propósito: trocar de adquirente não pode obrigar a mexer na tela. */
export async function criarCheckout(p: PedidoCheckout): Promise<RespostaCheckout> {
  if (!TEM_CHECKOUT) return { ok: false, erro: 'O pagamento por cartão ainda não está configurado.' };
  if (ADQUIRENTE === 'stone') return criarStone(p);
  if (ADQUIRENTE === 'mercadopago') return criarMercadoPago(p);
  console.error('[checkout] ADQUIRENTE desconhecido:', ADQUIRENTE);
  return { ok: false, erro: 'O pagamento por cartão ainda não está configurado.' };
}
