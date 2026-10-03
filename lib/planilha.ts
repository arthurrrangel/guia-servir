/* =============================================================================
   A PLANILHA DA IGREJA, PELO APPS SCRIPT — 02/10/2026

   O caminho que o site usa para guardar dado de visitante fora do banco das
   escalas: uma planilha do Google com um Apps Script publicado como "app da
   web". A URL do app mora numa variável da Vercel, nunca no código nem no
   navegador (quem tem a URL escreve na planilha).

   Só o servidor usa este arquivo. Ele nunca escreve no log o que foi enviado:
   só o motivo da falha.

   CONFERÊNCIA ESTRITA (a Pequena Guia aceita qualquer 200): um Apps Script
   mal publicado responde 200 com uma página HTML de erro do Google. Aqui só
   conta como gravado um JSON com `ok: true`.
   ============================================================================= */
if (typeof window !== 'undefined') throw new Error('lib/planilha.ts é só do servidor');

/** Só o endereço de um app da web do Apps Script. Qualquer outra coisa na
 *  variável é engano de quem colou, e o site não manda dado de gente para lá. */
export const URL_DE_APP = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec$/;

export type Gravacao = { ok: true } | { ok: false; motivo: string };

export function urlDaPlanilha(bruta: string | undefined): string | null {
  const u = (bruta || '').trim();
  return URL_DE_APP.test(u) ? u : null;
}

async function chamar(url: string, init: RequestInit, teto: number): Promise<{ status: number; json: unknown } | { erro: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), teto);
  try {
    const r = await fetch(url, { ...init, redirect: 'follow', signal: ctl.signal, cache: 'no-store' });
    let json: unknown = null;
    try { json = await r.json(); } catch { /* HTML de erro do Google, ou vazio */ }
    return { status: r.status, json };
  } catch (e) {
    return { erro: e instanceof Error && e.name === 'AbortError' ? 'planilha demorou' : 'planilha fora do ar' };
  } finally {
    clearTimeout(t);
  }
}

/** Grava uma linha. `corpo` vai inteiro para o doPost do Apps Script. */
export async function gravarNaPlanilha(url: string, corpo: unknown, teto = 10000): Promise<Gravacao> {
  const r = await chamar(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) }, teto);
  if ('erro' in r) return { ok: false, motivo: r.erro };
  const j = r.json as { ok?: unknown } | null;
  if (r.status === 200 && j && j.ok === true) return { ok: true };
  return { ok: false, motivo: `planilha respondeu ${r.status}${j ? '' : ' sem JSON'}` };
}

/** O doGet do script responde {ok:true} sem escrever nada: serve para saber
 *  se a planilha está ligada sem criar linha de teste. */
export async function planilhaResponde(url: string, teto = 8000): Promise<boolean> {
  const r = await chamar(url, { method: 'GET' }, teto);
  if ('erro' in r) return false;
  const j = r.json as { ok?: unknown } | null;
  return r.status === 200 && !!j && j.ok === true;
}
