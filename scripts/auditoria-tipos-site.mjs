/* AUDITORIA · Tipografia do site público: tamanhos por classe em 390 e 1440; uma classe com mais de um tamanho na mesma largura aparece (as exceções intencionais têm nome: .g-h2.nome, .cartao-t.fn, .qa-areas .qa-q, .g-tile-l.num).
   Requer o dev server: PORTA=3700 node scripts/auditoria-tipos-site.mjs  (ver claude/site-v4-volta-ao-modelo-startup-08-09-2026.md no Project) */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
const B = `http://localhost:${process.env.PORTA || 3000}`;
async function serveRpc(route) { const req = route.request(), u = req.url(); const fn = u.split('/rpc/')[1]?.split('?')[0]; let slug=''; try { slug=(JSON.parse(req.postData()||'{}').p_slug)||''; } catch {} for (const nome of [slug?`${fn}__${slug}`:null, fn]) { if (!nome) continue; const f=`/tmp/rpc/${nome}.json`; if (existsSync(f)) return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:readFileSync(f,'utf8')}); } return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'[]'}); }
const ROTAS = ['/', '/cultos', '/como-chegar', '/pequena-guia', '/sobre', '/servir', '/servir/midia', '/servir/onde-me-encaixo', '/acessar', '/guia-church-tv', '/privacidade'];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const W of [390, 1440]) {
  const ctx = await b.newContext({ viewport: { width: W, height: 900 } });
  await ctx.route('**', r => { const u = r.request().url(); if (u.includes('/rest/v1/rpc/')) return serveRpc(r); return u.startsWith(B) ? r.continue() : r.abort(); });
  const porClasse = new Map(); const tamanhos = new Map();
  for (const rota of ROTAS) {
    const p = await ctx.newPage(); await p.goto(B + rota, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
    const lista = await p.evaluate(() => { const cs = getComputedStyle; const out = [];
      for (const e of document.querySelectorAll('main *, footer *')) { const t = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()); if (!t) continue; if (e.closest('.leaflet-container, nextjs-portal, .so-leitor')) continue; const s = cs(e); if (s.display === 'none') continue;
        const cls = (String(e.className).split(' ').filter(c => c && !/^(rev|visto|centro|c|g|grande|c-bloco|claro|cheia)$/.test(c))[0]) || e.tagName.toLowerCase();
        out.push({ cls, fs: s.fontSize, fw: s.fontWeight, ff: s.fontFamily.split(',')[0].replace(/"/g, ''), lh: s.lineHeight }); }
      return out; });
    for (const it of lista) { const k = it.cls; if (!porClasse.has(k)) porClasse.set(k, new Map()); const m = porClasse.get(k); const v = `${it.fs}/${it.fw}/${it.ff}`; m.set(v, (m.get(v) || new Set()).add(rota)); tamanhos.set(it.fs, (tamanhos.get(it.fs) || 0) + 1); }
    await p.close();
  }
  console.log(`== ${W}: ${tamanhos.size} tamanhos: ` + [...tamanhos.entries()].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])).map(([k, v]) => `${k}(${v})`).join(' '));
  for (const [cls, m] of porClasse) if (m.size > 1) console.log(`  ${cls}: ` + [...m.entries()].map(([v, rs]) => `${v} [${[...rs].join(',')}]`).join(' | '));
  await ctx.close();
}
await b.close();
