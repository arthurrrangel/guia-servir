/* AUDITORIA · Vãos verticais entre blocos irmãos fora da escala do sistema (8/10/12/16/20/24/32/36/40/44/52/64/80/84), com os elementos. Uso: W=390 node scripts/auditoria-degraus.mjs /rota [/rota...]
   Requer o dev server: PORTA=3700 node scripts/auditoria-degraus.mjs  (ver claude/site-v4-volta-ao-modelo-startup-08-09-2026.md no Project) */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
const B=`http://localhost:${process.env.PORTA || 3000}`; const W = +(process.env.W || 390);
async function serveRpc(route) { const req = route.request(), u = req.url(); const fn = u.split('/rpc/')[1]?.split('?')[0]; let slug=''; try { slug=(JSON.parse(req.postData()||'{}').p_slug)||''; } catch {} for (const nome of [slug?`${fn}__${slug}`:null, fn]) { if (!nome) continue; const f=`/tmp/rpc/${nome}.json`; if (existsSync(f)) return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:readFileSync(f,'utf8')}); } return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'[]'}); }
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: W, height: 900 } });
await ctx.route('**', r => { const u = r.request().url(); if (u.includes('/rest/v1/rpc/')) return serveRpc(r); return u.startsWith(B) ? r.continue() : r.abort(); });
for (const rota of process.argv.slice(2)) {
  const p = await ctx.newPage(); await p.goto(B + rota, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1800);
  /* 09/09/2026 — ROLAR ANTES DE MEDIR. Os blocos com `.rev` entram com
     `transform:translateY(8px)` e só zeram quando revelam. Medindo sem rolar,
     TODO vão de um bloco ainda não revelado saía 8px maior que o real: um
     degrau de 52 (que está na escala) era acusado como 60. O script rola a
     página inteira, com o rolar suave desligado, e só então mede. */
  await p.evaluate(async () => {
    document.documentElement.style.scrollBehavior = 'auto';
    for (let y = 0; y < document.body.scrollHeight + 900; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 45)); }
    window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 500));
  });
  await p.waitForTimeout(600);
  const out = await p.evaluate(() => { const cs = getComputedStyle; const res = []; const nome = e => (String(e.className).split(' ')[0] || e.tagName).slice(0, 18);
    const vis = e => { const s = cs(e), r = e.getBoundingClientRect(); return s.display !== 'none' && r.height > 0 && s.position !== 'fixed' && s.position !== 'absolute'; };
    for (const pai of document.querySelectorAll('main section > .g, main .g-secao, main .g-cab-txt, main .c')) {
      const filhos = [...pai.children].filter(vis); for (let i = 1; i < filhos.length; i++) { const a = filhos[i - 1].getBoundingClientRect(), b2 = filhos[i].getBoundingClientRect(); const gap = Math.round(b2.top - a.bottom); if (gap > 0 && ![8,10,12,16,20,24,32,36,40,44,52,64,80,84].includes(gap)) res.push(`${gap}px entre ${nome(filhos[i-1])} e ${nome(filhos[i])} (em ${nome(pai)})`); } }
    return res; });
  console.log(rota, out.length ? '\n   ' + [...new Set(out)].join('\n   ') : 'ok');
  await p.close();
}
await b.close();
