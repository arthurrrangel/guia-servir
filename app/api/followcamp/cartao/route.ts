/* =============================================================================
   POST /api/followcamp/cartao — 01/10/2026

   Abre o link de pagamento da Stone para o cartão, em até 12x (parcela mínima
   de R$ 50) com o juro por conta de quem paga (lib/pagarme.ts). A pessoa
   digita o cartão na página da Stone, não na nossa: o site nunca vê número de
   cartão.

   Aqui não vai CPF nem e-mail: quem paga preenche os dados no próprio link.
   O nome do campista vai no nome do pedido, e o irmão inscrito na descrição,
   que é como a organização confere o desconto.
   ============================================================================= */
import { NextResponse } from 'next/server';
import { codigoFC27, conferirPedido, descricaoDe, nomeCurtoDe } from '@/lib/followcamp';
import { criarLinkCartao, TEM_PAGARME } from '@/lib/pagarme';
import { passe, deQuem } from '@/lib/teto-de-taxa';

export const dynamic = 'force-dynamic';

const nada = { 'Cache-Control': 'no-store' };

export async function POST(req: Request) {
  const p = passe('fc27cartao:' + deQuem(req), 40, 60);
  if (!p.ok) {
    return NextResponse.json({ ok: false, erro: 'Muitas tentativas seguidas nesta rede. Espere um instante e tente de novo.' },
      { status: 429, headers: { ...nada, 'Retry-After': String(p.esperar) } });
  }
  if (!TEM_PAGARME) return NextResponse.json({ ok: false, erro: 'O cartão ainda não está ligado.' }, { status: 503, headers: nada });

  let c: Record<string, unknown>;
  try {
    c = (await req.json()) as Record<string, unknown>;
    if (!c || typeof c !== 'object' || Array.isArray(c)) throw new Error();
  } catch {
    return NextResponse.json({ ok: false, erro: 'Pedido inválido.' }, { status: 400, headers: nada });
  }
  const pedido = conferirPedido(c);
  if (!pedido.ok) return NextResponse.json(pedido, { status: 400, headers: nada });
  const d = pedido.dados;
  const codigo = codigoFC27();
  const r = await criarLinkCartao({
    codigo, valor: d.valor,
    nome: nomeCurtoDe(d.referente, d.campista),
    descricao: descricaoDe(d.referente, d.campista, d.irmao),
  });
  return NextResponse.json(r.ok ? { ...r, codigo, valor: d.valor } : r, { status: r.ok ? 200 : 502, headers: nada });
}
