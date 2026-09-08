/* AUDITORIA · Animações: com prefers-reduced-motion nada anima e tudo fica visível; sem, só as dirigidas por rolagem, nenhuma infinita.
   Requer o dev server: PORTA=3700 node scripts/auditoria-motion.mjs  (ver claude/site-v4-volta-ao-modelo-startup-08-09-2026.md no Project) */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
const B=`http://localhost:${process.env.PORTA || 3000}`;
async function serveRpc(route) { const req = route.request(), u = req.url(); const fn = u.split('/rpc/')[1]?.split('?')[0]; let slug=''; try { slug=(JSON.parse(req.postData()||'{}').p_slug)||''; } catch {} for (const nome of [slug?`${fn}__${slug}`:null, fn]) { if (!nome) continue; const f=`/tmp/rpc/${nome}.json`; if (existsSync(f)) return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:readFileSync(f,'utf8')}); } return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'[]'}); }
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const reduce of ['reduce', 'no-preference']) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: reduce });
  await ctx.route('**', r => { const u = r.request().url(); if (u.includes('/rest/v1/rpc/')) return serveRpc(r); return u.startsWith(B) ? r.continue() : r.abort(); });
  for (const rota of ['/', '/cultos', '/pequena-guia']) {
    const p = await ctx.newPage(); await p.goto(B + rota, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
    const r = await p.evaluate(() => { const cs = getComputedStyle;
      const anims = document.getAnimations().filter(a => a.playState === 'running').map(a => (a.effect?.target?.className || '').toString().split(' ')[0] + ':' + (a.animationName || a.constructor.name));
      const infinitas = document.getAnimations().filter(a => a.effect && a.effect.getTiming().iterations === Infinity).map(a => (a.effect.target.className || '').toString().split(' ')[0]);
      // seções fora da tela: visíveis sem rolar? (com reduce, tudo visível)
      const rev = [...document.querySelectorAll('.rev')].map(e => ({ cls: e.className.split(' ')[0], op: cs(e).opacity, visto: e.classList.contains('visto') }));
      return { anims: anims.slice(0, 12), infinitas: [...new Set(infinitas)], revInvisiveis: rev.filter(x => +x.op < .5).length, revTotal: rev.length };
    });
    console.log(reduce, rota, JSON.stringify(r));
    await p.close();
  }
  await ctx.close();
}
await b.close();
