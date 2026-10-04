/* =============================================================================
   /api/followcamp/informado — "paguei", dito pela própria pessoa (04/10/2026)

   A página de pagamento chama aqui, sem esperar resposta, quando a pessoa
   toca em "Avisar no WhatsApp" (link da Stone) ou "Mandar o comprovante"
   (Pix direto). Vira uma linha A CONFERIR no painel do Follow Camp: não é
   confirmação de nada, e o painel diz isso. Quem confirma é a organização,
   no app da Stone.

   Confere tudo de novo (lib/followcamp.ts, `conferirInformado`): código no
   formato, valor da regra ou do link do lote, nome. O mesmo código tocado
   duas vezes é uma linha só (o banco garante). Nada de dado no log.
   ============================================================================= */
import { NextResponse } from 'next/server';
import { conferirInformado } from '@/lib/followcamp';
import { bancoLigado, informarPagamento } from '@/lib/followcamp-banco';
import { passe, deQuem } from '@/lib/teto-de-taxa';

export const dynamic = 'force-dynamic';

const SEM_CACHE = { 'Cache-Control': 'no-store' };

export async function POST(req: Request) {
  const p = passe('fc27informado:' + deQuem(req), 20, 600);
  if (!p.ok) return NextResponse.json({ ok: false }, { status: 429, headers: { 'Retry-After': String(p.esperar), ...SEM_CACHE } });

  let corpo: unknown;
  try { corpo = await req.json(); } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: SEM_CACHE });
  }
  const v = conferirInformado((corpo && typeof corpo === 'object' ? corpo : {}) as Record<string, unknown>);
  if (!v.ok) return NextResponse.json({ ok: false, erro: v.erro }, { status: 400, headers: SEM_CACHE });
  if (!bancoLigado()) return NextResponse.json({ ok: false, guardado: false }, { headers: SEM_CACHE });

  const r = await informarPagamento(v.dados);
  if (!r.ok) console.error('[followcamp-informado] o banco não gravou:', r.motivo);
  return NextResponse.json({ ok: r.ok, guardado: r.ok }, { headers: SEM_CACHE });
}
