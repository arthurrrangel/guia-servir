/* =============================================================================
   /api/followcamp/minha — a ficha à vista passa para o carnê (19/10/2026, 114;
   carnê sem plano desde 18/11/2026)

   POST { token, carne: true }: a página pessoal de uma ficha à vista pede o
   carnê. O banco marca a ficha (parcelas = MARCA_DO_CARNE, pagamento =
   'carne'), e daí a pessoa paga quanto quiser até 03/01. O número de
   parcelas não vale mais nada (lib/followcamp-carne.ts). Pedido antigo, com
   `parcelas`, cai no mesmo lugar. Ficha que já é do carnê: ok, sem gravar
   de novo. Voltar para à vista é com a organização. O token é o link
   pessoal; nada de dado no log.
   ============================================================================= */
import { NextResponse } from 'next/server';
import { bancoLigado, escolherPlano, lerMinha } from '@/lib/followcamp-banco';
import { conferirEntradaNoCarne } from '@/lib/followcamp-minha';
import { MARCA_DO_CARNE } from '@/lib/followcamp-carne';
import { TOKEN_OK } from '@/lib/followcamp-cobranca';
import { passe, deQuem } from '@/lib/teto-de-taxa';

export const dynamic = 'force-dynamic';

const SEM_CACHE = { 'Cache-Control': 'no-store' };
const ERROS: Record<string, string> = {
  LINK_INVALIDO: 'Este link não é de nenhuma inscrição.',
};

export async function POST(req: Request) {
  const p = passe('fc27minha:' + deQuem(req), 20, 600);
  if (!p.ok) return NextResponse.json({ ok: false, erro: 'Muitas tentativas. Espere um instante.' }, { status: 429, headers: { 'Retry-After': String(p.esperar), ...SEM_CACHE } });

  let corpo: Record<string, unknown> = {};
  try { const j = await req.json(); if (j && typeof j === 'object') corpo = j as Record<string, unknown>; } catch {
    return NextResponse.json({ ok: false, erro: 'Pedido inválido.' }, { status: 400, headers: SEM_CACHE });
  }
  const token = String(corpo.token ?? '');
  if (!TOKEN_OK.test(token)) return NextResponse.json({ ok: false, erro: ERROS.LINK_INVALIDO }, { status: 400, headers: SEM_CACHE });
  if (corpo.carne !== true && typeof corpo.parcelas !== 'number') return NextResponse.json({ ok: false, erro: 'Pedido inválido.' }, { status: 400, headers: SEM_CACHE });
  const v = conferirEntradaNoCarne();
  if (!v.ok) return NextResponse.json({ ok: false, erro: v.erro }, { status: 400, headers: SEM_CACHE });
  if (!bancoLigado()) return NextResponse.json({ ok: false, erro: 'O sistema está fora do ar. Tente de novo em instantes.' }, { status: 503, headers: SEM_CACHE });

  const m = await lerMinha(token);
  if (!m.ok) {
    const st = m.erro === 'FORA_DO_AR' ? 503 : 404;
    return NextResponse.json({ ok: false, erro: m.erro === 'CANCELADA' ? 'Esta inscrição foi cancelada.' : m.erro === 'FORA_DO_AR' ? 'O sistema está fora do ar. Tente de novo em instantes.' : ERROS.LINK_INVALIDO }, { status: st, headers: SEM_CACHE });
  }
  if (m.ficha.valor == null) return NextResponse.json({ ok: false, erro: 'A organização ainda vai confirmar o valor da sua inscrição.' }, { status: 409, headers: SEM_CACHE });
  if (m.ficha.pagamento === 'carne' || m.ficha.parcelas != null) return NextResponse.json({ ok: true }, { headers: SEM_CACHE });

  const r = await escolherPlano(token, MARCA_DO_CARNE);
  /* PLANO_JA_ESCOLHIDO: outra aba chegou antes; a ficha já é do carnê */
  if (!r.ok && r.erro !== 'PLANO_JA_ESCOLHIDO') {
    if (!r.erro) console.error('[followcamp-minha] o banco não passou a ficha para o carnê:', r.motivo);
    return NextResponse.json({ ok: false, erro: (r.erro && ERROS[r.erro]) || 'Não deu certo agora. Tente de novo em instantes.' }, { status: r.erro ? 409 : 503, headers: SEM_CACHE });
  }
  return NextResponse.json({ ok: true }, { headers: SEM_CACHE });
}
