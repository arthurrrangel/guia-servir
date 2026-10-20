/* =============================================================================
   AUDITORIA · A IMPRESSÃO DIGITAL DAS PÁGINAS (20/10/2026)

   Para cada rota × largura, a lista de todos os elementos visíveis com tag,
   classes, texto, caixa e 21 estilos computados. Serve para refatorar com
   segurança: grava a impressão antes, mexe no CSS ou nos componentes, grava
   depois e compara. Só o que foi mudado de propósito pode aparecer no diff.

     PORTA=3700 node scripts/auditoria-impressao.mjs antes.json
     (mexe no código)
     PORTA=3700 node scripts/auditoria-impressao.mjs depois.json
     node scripts/auditoria-impressao.mjs --diff antes.json depois.json

   O dev server: NEXT_PUBLIC_SITES_LOCAL=1 npx next dev -p 3700
   ============================================================================= */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { rotear, rolarTudo, ROTAS_SITE } from './_rpc-mock.mjs';

const PROPS = ['fontSize', 'fontWeight', 'fontFamily', 'fontStyle', 'lineHeight', 'letterSpacing', 'textTransform', 'textAlign', 'color', 'backgroundColor', 'borderRadius', 'borderTopWidth', 'borderBottomWidth', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'marginTop', 'marginBottom', 'display', 'opacity'];

if (process.argv[2] === '--diff') {
  const A = JSON.parse(readFileSync(process.argv[3], 'utf8')), B = JSON.parse(readFileSync(process.argv[4], 'utf8'));
  const chave = e => `${e.t}|${e.c}|${e.x}`;
  let total = 0;
  for (const tela of Object.keys(A)) {
    const ca = {}, cb = {};
    for (const e of A[tela]) (ca[chave(e)] ||= []).push(e);
    for (const e of B[tela] || []) (cb[chave(e)] ||= []).push(e);
    const sumiu = Object.keys(ca).filter(k => !cb[k]), novo = Object.keys(cb).filter(k => !ca[k]), mudou = [];
    for (const k of Object.keys(ca)) {
      if (!cb[k] || ca[k].length !== cb[k].length) continue;
      ca[k].forEach((x, i) => {
        const y = cb[k][i]; if (x.s === y.s) return;
        const da = x.s.split('|'), db = y.s.split('|');
        mudou.push(k.slice(0, 60) + ' | ' + PROPS.map((p, j) => da[j] !== db[j] ? `${p}: ${da[j]} → ${db[j]}` : '').filter(Boolean).join('; '));
      });
    }
    if (sumiu.length || novo.length || mudou.length) {
      total += sumiu.length + novo.length + mudou.length;
      console.log(`\n### ${tela}  sumiu ${sumiu.length} · novo ${novo.length} · mudou ${mudou.length}`);
      sumiu.slice(0, 20).forEach(k => console.log('  -', k.slice(0, 100)));
      novo.slice(0, 20).forEach(k => console.log('  +', k.slice(0, 100)));
      [...new Set(mudou)].slice(0, 40).forEach(m => console.log('  ~', m.slice(0, 220)));
    }
  }
  console.log(`\nDIFERENÇAS: ${total}`);
  process.exit(total ? 1 : 0);
}

const B = `http://localhost:${process.env.PORTA || 3000}`;
const SAIDA = process.argv[2] || 'impressao.json';
const nav = await chromium.launch();
const out = {};
for (const W of [390, 1440]) {
  const ctx = await nav.newContext({ viewport: { width: W, height: 900 }, reducedMotion: 'reduce' });
  await ctx.route('**', r => rotear(r, B));
  for (const rota of ROTAS_SITE) {
    const p = await ctx.newPage();
    await p.goto(B + rota, { waitUntil: 'networkidle' }).catch(() => {});
    await p.waitForTimeout(500); await rolarTudo(p);
    out[`${W} ${rota}`] = await p.evaluate(PROPS => {
      const cs = getComputedStyle, res = [];
      const vis = e => { const r = e.getBoundingClientRect(); if (!r.width && !r.height) return false; for (let a = e; a && a !== document.body; a = a.parentElement) { const s = cs(a); if (s.display === 'none' || s.visibility === 'hidden') return false; } return true; };
      for (const e of document.querySelectorAll('main *, footer *, header *')) {
        if (!vis(e) || ['SVG', 'PATH', 'CIRCLE', 'SOURCE', 'SCRIPT', 'STYLE', 'G', 'DEFS', 'USE'].includes(e.tagName)) continue;
        const s = cs(e), r = e.getBoundingClientRect();
        const texto = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim().replace(/\s+/g, ' ').slice(0, 40);
        res.push({ t: e.tagName.toLowerCase(), c: String(e.className?.baseVal ?? e.className ?? '').trim(), x: texto, r: [Math.round(r.left), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height)], s: PROPS.map(k => s[k]).join('|') });
      }
      return res;
    }, PROPS);
    await p.close();
  }
  await ctx.close();
}
await nav.close();
writeFileSync(SAIDA, JSON.stringify(out));
console.log('gravado', SAIDA, Object.keys(out).length, 'telas');
