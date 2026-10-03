/* =============================================================================
   /api/followcamp/ficha — a ficha de inscrição do Follow Camp 2027 (02/10/2026)

   POST: confere a ficha (lib/followcamp-ficha.ts, as mesmas regras da tela) e
   grava uma linha na planilha da igreja (lib/planilha.ts). Responde:
     · { ok:true, guardado:true }  a linha está na planilha;
     · { ok:true, guardado:false } a ficha está certa, mas a planilha não
       gravou (não ligada, fora do ar, demorou). A tela então manda a ficha
       inteira pelo WhatsApp da organização e diz isso.
     · { ok:false, erro, campo }   o campo errado, para a tela apontar.

   GET: { configurada, responde } — se a planilha está ligada, sem escrever
   nada (o doGet do script). Não diz a URL.

   O que esta rota NÃO faz: guardar no banco das escalas, escrever dado de
   pessoa no log, aceitar valor vindo do navegador (o valor é recalculado).

   Teto de taxa generoso de propósito: numa inscrição em massa no Follow de
   sábado, muita gente manda do mesmo Wi-Fi da igreja.
   ============================================================================= */
import { NextResponse } from 'next/server';
import { conferirFicha, linhaDaFicha, CABECALHO } from '@/lib/followcamp-ficha';
import { gravarNaPlanilha, planilhaResponde, urlDaPlanilha } from '@/lib/planilha';
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

  const url = urlDaPlanilha(process.env.PLANILHA_FOLLOWCAMP_URL);
  if (!url) {
    if (process.env.PLANILHA_FOLLOWCAMP_URL) console.error('[followcamp-ficha] PLANILHA_FOLLOWCAMP_URL não é a URL de um app da web do Apps Script');
    return NextResponse.json({ ok: true, guardado: false, motivo: 'planilha não configurada' }, { headers: SEM_CACHE });
  }

  const r = await gravarNaPlanilha(url, { cabecalho: CABECALHO, linha: linhaDaFicha(v.ficha), origem: 'site' });
  if (!r.ok) console.error('[followcamp-ficha] a planilha não gravou:', r.motivo);
  return NextResponse.json(
    { ok: true, guardado: r.ok, ...(r.ok ? {} : { motivo: r.motivo }) },
    { headers: SEM_CACHE });
}

export async function GET(req: Request) {
  const p = passe('fc27fichaget:' + deQuem(req), 10, 60);
  if (!p.ok) return NextResponse.json({ ok: false }, { status: 429, headers: { 'Retry-After': String(p.esperar), ...SEM_CACHE } });
  const url = urlDaPlanilha(process.env.PLANILHA_FOLLOWCAMP_URL);
  if (!url) return NextResponse.json({ configurada: false, responde: false }, { headers: SEM_CACHE });
  return NextResponse.json({ configurada: true, responde: await planilhaResponde(url) }, { headers: SEM_CACHE });
}
