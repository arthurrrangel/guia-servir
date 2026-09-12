/* =============================================================================
   POST /api/ofertar/checkout — abre o pagamento por cartão, Apple Pay ou Google Pay

   A tela manda {valor, tipo, txid} e recebe uma URL para onde ir. É o único
   caminho entre o navegador e o adquirente, e ele existe por um motivo só: a
   credencial que autoriza cobrar em nome da igreja não pode passar pelo
   navegador de ninguém. Ela vive em `MP_ACCESS_TOKEN`, no painel da Vercel, e
   é lida aqui (ver lib/checkout.ts).

   O QUE ESTA ROTA NÃO FAZ, de propósito: não guarda nada. Quem registra a
   oferta é o adquirente, e é no extrato dele e do banco que a tesouraria lê.
   Um banco de dados nosso com quem deu quanto seria mais uma cópia de dado
   sensível para alguém ter que proteger, sem nada em troca.
   ============================================================================= */
import { NextResponse } from 'next/server';
import { criarCheckout } from '@/lib/checkout';
import { MIN, MAX, valorInvalido } from '@/lib/oferta';

export const dynamic = 'force-dynamic';

/** O mesmo formato que `txidDe` produz, conferido aqui porque ele chega do
 *  navegador: até 25 alfanuméricos, nada mais. Ele vai para o adquirente como
 *  referência externa, e referência externa com caractere estranho é o tipo de
 *  coisa que volta como erro três semanas depois. */
const TXID_OK = /^[A-Za-z0-9]{1,25}$/;

export async function POST(req: Request) {
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: 'Pedido inválido.' }, { status: 400 });
  }

  const c = corpo as { valor?: unknown; tipo?: unknown; txid?: unknown };

  const valor = typeof c.valor === 'number' ? c.valor : Number(c.valor);
  const mal = !Number.isFinite(valor) ? `O valor precisa estar entre R$${MIN} e R$${MAX}.` : valorInvalido(valor);
  if (mal) return NextResponse.json({ ok: false, erro: mal }, { status: 400 });

  if (c.tipo !== 'dizimo' && c.tipo !== 'oferta') {
    return NextResponse.json({ ok: false, erro: 'Escolha entre dízimo e oferta.' }, { status: 400 });
  }

  const txid = String(c.txid || '');
  if (!TXID_OK.test(txid)) {
    return NextResponse.json({ ok: false, erro: 'Pedido inválido.' }, { status: 400 });
  }

  const r = await criarCheckout({ valor, tipo: c.tipo, txid });
  /* 502 quando o adquirente falhou, 400 quando o pedido estava errado: a tela
     usa a mesma frase nos dois, mas o log da Vercel separa os dois problemas,
     que têm donos diferentes. */
  return NextResponse.json(r, { status: r.ok ? 200 : 502 });
}
