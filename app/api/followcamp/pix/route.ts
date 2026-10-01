/* =============================================================================
   /api/followcamp/pix — 01/10/2026

   POST cria o Pix na Stone e devolve o copia e cola. GET ?pedido=or_...&a=...
   diz se já foi pago, e só isso.

   O valor é recalculado AQUI a partir do que a pessoa escolheu (lib/followcamp
   .ts): o navegador não manda preço, manda "inscrição", "irmãos" ou o valor da
   parcela, que tem piso e teto. O código do pagamento também nasce aqui, a
   cada pedido. Nome, CPF, e-mail e celular vão para a Stone e não ficam em
   lugar nenhum deste lado; o log leva só status e nomes de campo
   (lib/pagarme.ts).
   ============================================================================= */
import { NextResponse } from 'next/server';
import { codigoFC27, conferirPedido, conferirPagador, descricaoDe } from '@/lib/followcamp';
import { criarPix, estadoDoPix, PEDIDO_OK, TEM_PAGARME } from '@/lib/pagarme';
import { passe, deQuem } from '@/lib/teto-de-taxa';

export const dynamic = 'force-dynamic';

const nada = { 'Cache-Control': 'no-store' };

export async function POST(req: Request) {
  /* cada Pix criado é um pedido na conta da igreja. 40 por minuto por IP
     cobre uma noite de inscrição no wi-fi da igreja e não cobre um laço de
     script; teto de verdade, se precisar, é a firewall da Vercel */
  const p = passe('fc27pix:' + deQuem(req), 40, 60);
  if (!p.ok) {
    return NextResponse.json({ ok: false, erro: 'Muitas tentativas seguidas nesta rede. Espere um instante e tente de novo.' },
      { status: 429, headers: { ...nada, 'Retry-After': String(p.esperar) } });
  }
  if (!TEM_PAGARME) return NextResponse.json({ ok: false, erro: 'O Pix pelo site ainda não está ligado.' }, { status: 503, headers: nada });

  let c: Record<string, unknown>;
  try {
    c = (await req.json()) as Record<string, unknown>;
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error();
  } catch {
    return NextResponse.json({ ok: false, erro: 'Pedido inválido.' }, { status: 400, headers: nada });
  }
  const pedido = conferirPedido(c);
  if (!pedido.ok) return NextResponse.json(pedido, { status: 400, headers: nada });
  const pagador = conferirPagador((c.pagador && typeof c.pagador === 'object' ? c.pagador : {}) as Record<string, unknown>);
  if (!pagador.ok) return NextResponse.json(pagador, { status: 400, headers: nada });

  const d = pedido.dados;
  const codigo = codigoFC27();
  const r = await criarPix({
    codigo,
    valor: d.valor,
    descricao: descricaoDe(d.referente, d.campista, d.irmao),
    campista: d.campista,
    referente: d.referente,
    irmao: d.irmao,
    pagador: pagador.dados,
  });
  return NextResponse.json(r.ok ? { ...r, codigo } : r, { status: r.ok ? 200 : 502, headers: nada });
}

export async function GET(req: Request) {
  /* a tela pergunta a cada 4 s: 15 por minuto por aba aberta. 120 deixa folga
     para uma casa com vários celulares no mesmo IP */
  const p = passe('fc27st:' + deQuem(req), 120, 60);
  if (!p.ok) return NextResponse.json({ estado: 'desconhecido' }, { status: 429, headers: { ...nada, 'Retry-After': String(p.esperar) } });
  const q = new URL(req.url).searchParams;
  const pedido = q.get('pedido') || '';
  const assinatura = q.get('a') || '';
  if (!PEDIDO_OK.test(pedido) || !assinatura) return NextResponse.json({ estado: 'desconhecido' }, { status: 400, headers: nada });
  const estado = await estadoDoPix(pedido, assinatura);
  return NextResponse.json({ estado }, { headers: nada });
}
