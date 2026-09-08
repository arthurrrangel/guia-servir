/* AUDITORIA · Estados de rede (RPC 500), vazio (RPC []) e carregando (RPC nunca responde) em 6 rotas: capturas est-<modo>-<largura><rota>.png e o texto do main. Uso: node scripts/auditoria-estados.mjs rede|vazio|carregando [largura]
   Requer o dev server: PORTA=3700 node scripts/auditoria-estados.mjs  (ver claude/site-v4-volta-ao-modelo-startup-08-09-2026.md no Project) */
import { chromium } from 'playwright';
const B = `http://localhost:${process.env.PORTA || 3000}`;
const MODO = process.argv[2] || 'rede'; const W = +(process.argv[3] || 390);
const ROTAS = ['/', '/servir', '/servir/midia', '/servir/onde-me-encaixo', '/servir/midia/cadastro', '/servir/naoexiste'];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: W, height: W < 500 ? 844 : 900 } });
await ctx.route('**', r => { const u = r.request().url();
  if (u.includes('/rest/v1/rpc/')) { if (MODO === 'rede') return r.fulfill({ status: 500, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"message":"erro"}' }); if (MODO === 'vazio') return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' }); return new Promise(() => {}); }
  return u.startsWith(B) ? r.continue() : r.abort(); });
for (const rota of ROTAS) {
  const p = await ctx.newPage(); await p.goto(B + rota, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(MODO === 'carregando' ? 1200 : 2500);
  const y = rota === '/' ? 900 : 0; await p.evaluate(y => window.scrollTo(0, y), y); await p.waitForTimeout(500);
  const nome = `est-${MODO}-${W}${rota.replace(/[^a-z0-9]+/gi, '_')}.png`; await p.screenshot({ path: nome });
  const txt = await p.evaluate(() => document.querySelector('main')?.innerText.replace(/\s+/g, ' ').slice(0, 200));
  console.log(nome, '::', txt); await p.close();
}
await b.close();
