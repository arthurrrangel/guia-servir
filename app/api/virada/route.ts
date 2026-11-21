/* =============================================================================
   /api/virada — a reserva da Virada 2027 (21/11/2026, migração 118)

   POST: confere a reserva (lib/virada.ts, as mesmas regras da tela) e grava
   no banco pelo servidor (lib/virada-banco.ts). Responde:
     · { ok:true, guardado:true, restantes? }  o lugar está reservado;
       com `repetida`, esse CPF já tinha reserva (nada é duplicado);
     · { ok:true, guardado:false }  a reserva está certa, mas o banco não
       gravou (a 118 não rodou, fora do ar, demorou): a tela manda a reserva
       escrita pelo WhatsApp da igreja e diz isso;
     · { ok:false, esgotado:true, restantes }  não cabe: as vagas acabaram
       (ou só restam menos lugares do que a família pediu);
     · { ok:false, fechada:true }  a noite já começou;
     · { ok:false, erro, campo }  o campo errado, para a tela apontar.

   GET: { aberta, restantes } — as vagas de agora (restantes null quando o
   banco não responde). Não diz mais que isso.

   O campo `site` é a armadilha de robô (invisível para gente): preenchido,
   a rota responde como se tivesse gravado e não grava nada.

   O que esta rota NÃO faz: escrever dado de pessoa no log.

   `Response.json` (a do padrão da web) e não `NextResponse`: a rota roda
   igual no Next e no teste em Node puro (scripts/virada.test.mjs).
   ============================================================================= */
import { conferirReserva, reservaAberta } from '@/lib/virada';
import { bancoLigado, reservarNoBanco, vagasNoBanco } from '@/lib/virada-banco';
import { passe, deQuem } from '@/lib/teto-de-taxa';

export const dynamic = 'force-dynamic';

const SEM_CACHE = { 'Cache-Control': 'no-store' };

export async function POST(req: Request) {
  /* generoso de propósito: no culto, muita gente reserva do mesmo Wi-Fi da igreja */
  const p = passe('virada:' + deQuem(req), 30, 600);
  if (!p.ok) {
    return Response.json(
      { ok: false, erro: 'Muitas reservas deste aparelho agora. Espere um instante e tente de novo.', campo: '' },
      { status: 429, headers: { 'Retry-After': String(p.esperar), ...SEM_CACHE } });
  }

  let corpo: unknown;
  try { corpo = await req.json(); } catch {
    return Response.json({ ok: false, erro: 'Reserva inválida.', campo: '' }, { status: 400, headers: SEM_CACHE });
  }
  const isca = corpo && typeof corpo === 'object' ? (corpo as Record<string, unknown>).site : '';
  if (typeof isca === 'string' && isca.trim()) return Response.json({ ok: true, guardado: true }, { headers: SEM_CACHE });

  const v = conferirReserva(corpo);
  if (!v.ok) return Response.json({ ok: false, erro: v.erro, campo: v.campo }, { status: 400, headers: SEM_CACHE });

  if (!reservaAberta()) {
    return Response.json({ ok: false, fechada: true, erro: 'As reservas pelo site já fecharam.' }, { headers: SEM_CACHE });
  }

  if (!bancoLigado()) {
    console.error('[virada] sem SUPABASE_SERVICE_ROLE: a reserva vai pelo WhatsApp');
    return Response.json({ ok: true, guardado: false }, { headers: SEM_CACHE });
  }

  const r = await reservarNoBanco(v.reserva);
  if (r.ok) {
    return Response.json(
      { ok: true, guardado: true, ...(r.repetida ? { repetida: true } : {}), ...(r.restantes !== undefined ? { restantes: r.restantes } : {}) },
      { headers: SEM_CACHE });
  }
  if (r.erro === 'ESGOTADO') {
    return Response.json({ ok: false, esgotado: true, erro: 'As vagas acabaram.', ...(r.restantes !== undefined ? { restantes: r.restantes } : {}) }, { headers: SEM_CACHE });
  }
  if (r.erro === 'ENCERRADA') {
    return Response.json({ ok: false, fechada: true, erro: 'As reservas pelo site já fecharam.' }, { headers: SEM_CACHE });
  }
  console.error('[virada] o banco não gravou:', 'motivo' in r ? r.motivo : r.erro);
  return Response.json({ ok: true, guardado: false }, { headers: SEM_CACHE });
}

export async function GET(req: Request) {
  const p = passe('viradaget:' + deQuem(req), 60, 60);
  if (!p.ok) return Response.json({ ok: false }, { status: 429, headers: { 'Retry-After': String(p.esperar), ...SEM_CACHE } });
  const aberta = reservaAberta();
  const v = await vagasNoBanco();
  return Response.json({ aberta: aberta && (v ? v.aberta : true), restantes: v ? v.restantes : null }, { headers: SEM_CACHE });
}
