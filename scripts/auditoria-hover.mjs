/* AUDITORIA · Microinterações: hover em fatos, botões, áreas, links, pílula, menu, chips muda o que deve mudar.
   Requer o dev server: PORTA=3700 node scripts/auditoria-hover.mjs  (ver claude/site-v4-volta-ao-modelo-startup-08-09-2026.md no Project) */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
const B=`http://localhost:${process.env.PORTA || 3000}`;
async function serveRpc(route) { const req = route.request(), u = req.url(); const fn = u.split('/rpc/')[1]?.split('?')[0]; let slug=''; try { slug=(JSON.parse(req.postData()||'{}').p_slug)||''; } catch {} for (const nome of [slug?`${fn}__${slug}`:null, fn]) { if (!nome) continue; const f=`/tmp/rpc/${nome}.json`; if (existsSync(f)) return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:readFileSync(f,'utf8')}); } return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'[]'}); }
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.route('**', r => { const u = r.request().url(); if (u.includes('/rest/v1/rpc/')) return serveRpc(r); return u.startsWith(B) ? r.continue() : r.abort(); });
const p = await ctx.newPage(); await p.goto(B + '/', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
async function hov(sel, props) { const el = p.locator(sel).first(); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
  const antes = await el.evaluate((e, ps) => Object.fromEntries(ps.map(k => [k, getComputedStyle(e)[k]])), props);
  await el.hover(); await p.waitForTimeout(450);
  const depois = await el.evaluate((e, ps) => Object.fromEntries(ps.map(k => [k, getComputedStyle(e)[k]])), props);
  const mudou = props.filter(k => antes[k] !== depois[k]);
  console.log((mudou.length ? '  ✓ ' : '  ✗ ') + sel + ' hover muda: ' + (mudou.join(', ') || 'NADA')); }
await hov('a.fato', ['transform', 'boxShadow', 'borderColor']);
await hov('.acao.cheia', ['backgroundColor', 'transform', 'boxShadow']);
await hov('.casa-area', ['transform', 'boxShadow']);
await hov('.g-link', ['textDecorationColor']);
await hov('.agora-pill', ['borderColor', 'backgroundColor']);
await hov('.casa-nav a', ['color', 'opacity', 'textDecorationColor']);
await p.goto(B + '/pequena-guia', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2000);
await hov('.pg-chip:not([aria-pressed="true"])', ['borderColor', 'backgroundColor']);
await hov('.acao:not(.cheia)', ['backgroundColor', 'color', 'borderColor']);
await b.close();
