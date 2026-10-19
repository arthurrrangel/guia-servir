/* =============================================================================
   /api/followcamp/ficha — a ficha de inscrição do Follow Camp 2027 (02/10/2026)

   POST: confere a ficha (lib/followcamp-ficha.ts, as mesmas regras da tela) e
   grava no banco do site pelo servidor (lib/followcamp-banco.ts, migração
   110; até 04/10 era uma planilha que nunca foi ligada). Responde:
     · { ok:true, guardado:true, token } a ficha está no banco, e o painel já
       mostra; `token` é o link pessoal (114). Com `repetida` (a mesma pessoa
       já tinha ficha: ela é atualizada, não duplicada) o token NÃO vem;
     · { ok:true, guardado:false } a ficha está certa, mas o banco não gravou
       (a 110 não rodou, fora do ar, demorou). A tela então manda a ficha
       inteira pelo WhatsApp da organização e diz isso.
     · { ok:false, erro, campo }   o campo errado, para a tela apontar.

   GET: { configurada, responde } — se o servidor tem a chave e o banco está
   pronto, sem gravar nada. Não diz mais que isso.

   O que esta rota NÃO faz: escrever dado de pessoa no log, nem aceitar valor
   vindo do navegador (o valor é recalculado).

   Teto de taxa generoso de propósito: numa inscrição em massa no Follow de
   sábado, muita gente manda do mesmo Wi-Fi da igreja.
   ============================================================================= */
import { NextResponse } from 'next/server';
import { conferirFicha, fichaParaBanco } from '@/lib/followcamp-ficha';
import { bancoLigado, bancoResponde, gravarFicha } from '@/lib/followcamp-banco';
import { passe, deQuem } from '@/lib/teto-de-taxa';

export const dynamic = 'force-dynamic';

const SEM_CACHE = { 'Cache-Control': 'no-store' };

export async function POST(req: Request) {
  const p = passe('fc27ficha:' + deQuem(req), 30, 600);
  if (!p.ok) {
    return NextResponse.json(
      { ok: false, erro: 'Muitas fichas deste aparelho agora. Espere um instante e tente de novo.' },
      { status: 429, headers: { 'Retry-After': String(p.esperar), ...SEM_CACHE } });
  }

  let corpo: unknown;
  try { corpo = await req.json(); } catch {
    return NextResponse.json({ ok: false, erro: 'Ficha inválida.', campo: '' }, { status: 400, headers: SEM_CACHE });
  }

  const v = conferirFicha(corpo);
  if (!v.ok) return NextResponse.json({ ok: false, erro: v.erro, campo: v.campo }, { status: 400, headers: SEM_CACHE });

  if (!bancoLigado()) {
    console.error('[followcamp-ficha] sem SUPABASE_SERVICE_ROLE: a ficha vai pelo WhatsApp');
    return NextResponse.json({ ok: true, guardado: false, motivo: 'banco não configurado' }, { headers: SEM_CACHE });
  }

  const r = await gravarFicha(fichaParaBanco(v.ficha));
  if (!r.ok) console.error('[followcamp-ficha] o banco não gravou:', r.motivo);
  /* 114: a ficha NOVA volta com o LINK PESSOAL (o token). A repetida (mesmo
     nome e nascimento de uma que já existia) NÃO volta com o link: nome e
     data de nascimento não são segredo, e o link dá acesso aos pagamentos
     da inscrição. Quem já tinha ficha tem o link da primeira vez; senão, a
     organização manda pelo botão Cobrar do painel. */
  return NextResponse.json(
    {
      ok: true, guardado: r.ok,
      ...(r.ok ? {} : { motivo: r.motivo }),
      ...(r.ok && r.token && !r.repetida ? { token: r.token } : {}),
      ...(r.ok && r.repetida ? { repetida: true } : {}),
    },
    { headers: SEM_CACHE });
}

export async function GET(req: Request) {
  const p = passe('fc27fichaget:' + deQuem(req), 10, 60);
  if (!p.ok) return NextResponse.json({ ok: false }, { status: 429, headers: { 'Retry-After': String(p.esperar), ...SEM_CACHE } });
  if (!bancoLigado()) return NextResponse.json({ configurada: false, responde: false }, { headers: SEM_CACHE });
  return NextResponse.json({ configurada: true, responde: await bancoResponde() }, { headers: SEM_CACHE });
}
