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
let falhas = 0;
/* SELETOR QUE NÃO EXISTE MAIS DERRUBAVA A BATERIA INTEIRA. 08/09/2026: a
   /pequena-guia deixou de ter botão contornado e o script morreu com
   TimeoutError no meio, sem terminar as outras checagens e sem dizer o que
   procurava. Agora ele acusa e segue. */
async function hov(sel, props) { const el = p.locator(sel).first();
  if (!(await el.count())) { falhas++; console.log('  ✗ ' + sel + ' NÃO EXISTE nesta página'); return; }
  /* TIRA O MOUSE DE CIMA ANTES DE MEDIR O "ANTES". Depois de navegar, o
     ponteiro fica na mesma coordenada da tela — e se por acaso ela cair sobre
     o elemento que vem a seguir, o "antes" já é o estado de hover e o teste
     conclui "não muda NADA". Foi o que aconteceu com `a.g-linhas-v` em
     08/09/2026: no navegador o hover funcionava, no script não. */
  await p.mouse.move(2, 2); await p.waitForTimeout(120);
  await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
  const antes = await el.evaluate((e, ps) => Object.fromEntries(ps.map(k => [k, getComputedStyle(e)[k]])), props);
  await el.hover(); await p.waitForTimeout(450);
  const depois = await el.evaluate((e, ps) => Object.fromEntries(ps.map(k => [k, getComputedStyle(e)[k]])), props);
  const mudou = props.filter(k => antes[k] !== depois[k]);
  if (!mudou.length) falhas++;
  console.log((mudou.length ? '  ✓ ' : '  ✗ ') + sel + ' hover muda: ' + (mudou.join(', ') || 'NADA')); }
await hov('a.fato', ['transform', 'boxShadow', 'borderColor']);
await hov('.acao.cheia', ['backgroundColor', 'transform', 'boxShadow']);
await hov('.casa-area', ['transform', 'boxShadow']);
await hov('.g-link', ['textDecorationColor']);
await hov('.agora-pill', ['borderColor', 'backgroundColor']);
await hov('.casa-nav a', ['color', 'opacity', 'textDecorationColor']);
await p.goto(B + '/pequena-guia', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2000);
await hov('.pg-chip:not([aria-pressed="true"])', ['borderColor', 'backgroundColor']);
/* o botão contornado vive em /como-chegar (o Waze do cartão do mapa) */
await p.goto(B + '/como-chegar', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2000);
await hov('.acao:not(.cheia)', ['backgroundColor', 'color', 'borderColor']);
/* a lista em linhas de /cultos ("O que você precisa saber") */
await p.goto(B + '/cultos', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2000);
await hov('a.g-linhas-v', ['textDecorationColor']);
await b.close();
console.log(falhas ? `\nFALHAS: ${falhas}` : '\nFALHAS: 0');
process.exit(falhas ? 1 : 0);
