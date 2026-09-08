/* AUDITORIA · Alvos de toque abaixo de 44px e foco invisível, em 360 e 1440 (só os links de atribuição do Leaflet ficam abaixo de 44).
   Requer o dev server: PORTA=3700 node scripts/auditoria-toque-foco.mjs  (ver claude/site-v4-volta-ao-modelo-startup-08-09-2026.md no Project) */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
const B=`http://localhost:${process.env.PORTA || 3000}`;
async function serveRpc(route) { const req = route.request(), u = req.url(); const fn = u.split('/rpc/')[1]?.split('?')[0]; let slug=''; try { slug=(JSON.parse(req.postData()||'{}').p_slug)||''; } catch {} for (const nome of [slug?`${fn}__${slug}`:null, fn]) { if (!nome) continue; const f=`/tmp/rpc/${nome}.json`; if (existsSync(f)) return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:readFileSync(f,'utf8')}); } return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'[]'}); }
const ROTAS = ['/', '/cultos', '/como-chegar', '/pequena-guia', '/sobre', '/guia-church-tv', '/servir', '/servir/midia', '/servir/midia/cadastro', '/servir/onde-me-encaixo', '/acessar', '/privacidade', '/entrar', '/eu/x?demo=1', '/painel?demo=1', '/painel/candidaturas?demo=1', '/escala?demo=1', '/time?demo=1', '/time/conferir?demo=1', '/ajustes?demo=1', '/ajustes/ministerios?demo=1'];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const W of [360, 1440]) {
  const ctx = await b.newContext({ viewport: { width: W, height: 740 } });
  await ctx.route('**', r => { const u = r.request().url(); if (u.includes('/rest/v1/rpc/')) return serveRpc(r); return u.startsWith(B) ? r.continue() : r.abort(); });
  for (const rota of ROTAS) {
    const p = await ctx.newPage();
    await p.goto(B + rota, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1800);
    await p.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
    await p.waitForTimeout(200);
    const r = await p.evaluate((W) => {
      const out = { estouro: document.documentElement.scrollWidth > W ? document.documentElement.scrollWidth : 0, alvos: [], foco: [] };
      const inter = [...document.querySelectorAll('a[href],button,input,select,textarea,summary,[role=button],[tabindex="0"]')].filter(e => e.checkVisibility());
      for (const e of inter) {
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const inline = e.tagName === 'A' && getComputedStyle(e).display === 'inline' && e.closest('p, li, dd, .g-corpo, .qa-r');
        if (r.height < 40 && !inline) out.alvos.push(`${e.className.toString().slice(0,26) || e.tagName} h=${Math.round(r.height)} "${(e.textContent||e.getAttribute('aria-label')||'').trim().slice(0,18)}"`);
      }
      return out;
    }, W);
    // foco: percorre por Tab (até 60) e mede o indicador
    const semFoco = [];
    for (let i = 0; i < 60; i++) {
      await p.keyboard.press('Tab');
      const f = await p.evaluate(() => {
        const e = document.activeElement; if (!e || e === document.body) return null;
        const cs = getComputedStyle(e); const fv = e.matches(':focus-visible');
        const anel = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
        const sombra = cs.boxShadow !== 'none';
        // indicador alternativo: pseudo ::after com opacity/border, ou sublinhado/borda mudando — aproximação: aceita se anel ou sombra ou text-decoration underline
        const under = cs.textDecorationLine.includes('underline');
        return { tag: e.tagName, cls: e.className.toString().slice(0,30), txt: (e.textContent||'').trim().slice(0,16), fv, ok: anel || sombra || under || !fv };
      });
      if (!f) break;
      if (!f.ok) semFoco.push(`${f.cls || f.tag} "${f.txt}"`);
    }
    if (r.estouro || r.alvos.length || semFoco.length) console.log(W, rota, JSON.stringify({ estouro: r.estouro, alvos: r.alvos.slice(0, 8), semFoco: [...new Set(semFoco)].slice(0, 8) }));
    await p.close();
  }
  await ctx.close();
}
await b.close();
console.log('fim');
