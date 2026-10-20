/* =============================================================================
   AUDITORIA · O RITMO VERTICAL (20/10/2026; substitui auditoria-degraus, que
   media o site antigo pelas classes .g)

   O espaço entre dois vizinhos do mesmo tipo é o mesmo em toda página? Para
   cada par de irmãos visíveis dentro das colunas do site (.s-in, .s-claro,
   .s-cab, .s-heroi-in, .s-so-texto, as colunas de .s-duas e .s-gente), o
   vão em px, agrupado pelo par de papéis (classe principal de cada um). Um
   par com mais de um valor na mesma largura é ritmo acidental: o mesmo
   título→linha ou texto→pílulas com recuos diferentes conforme a página.

   Os valores são fluidos no computador (clamp), então a comparação é feita
   dentro de uma largura, nunca entre larguras.

     PORTA=3700 node scripts/auditoria-ritmo.mjs [/rota ...]
   ============================================================================= */
import { chromium } from 'playwright';
import { rotear, rolarTudo, ROTAS_SITE } from './_rpc-mock.mjs';

const B = `http://localhost:${process.env.PORTA || 3000}`;
const ROTAS = process.argv.slice(2).length ? process.argv.slice(2) : ROTAS_SITE.filter(r => !r.includes('nao-existe'));
const nav = await chromium.launch();
const pares = {};
for (const W of [390, 1440]) {
  const ctx = await nav.newContext({ viewport: { width: W, height: 900 }, reducedMotion: 'reduce' });
  await ctx.route('**', r => rotear(r, B));
  for (const rota of ROTAS) {
    const p = await ctx.newPage();
    await p.goto(B + rota, { waitUntil: 'networkidle' }).catch(() => {});
    await p.waitForTimeout(400); await rolarTudo(p);
    const res = await p.evaluate(() => {
      const cs = getComputedStyle, out = [];
      const papel = e => { const c = String(e.className || '').trim().split(/\s+/).filter(x => x && !/^(s-rev|d[1-4]|visto|so-largo|so-celular|centro|topo|base)$/.test(x)); return (c[0] ? '.' + c.slice(0, 2).join('.') : e.tagName.toLowerCase()); };
      const vis = e => { const s = cs(e), r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.height > 0 && s.position !== 'absolute' && s.position !== 'fixed'; };
      for (const pai of document.querySelectorAll('main .s-in, main .s-claro, main .s-cab, main .s-heroi-in, main .s-so-texto, main .s-duas > div, main .s-gente > div, main .s-scrub-faixa.pouso')) {
        const f = [...pai.children].filter(vis);
        for (let i = 1; i < f.length; i++) {
          const a = f[i - 1].getBoundingClientRect(), b = f[i].getBoundingClientRect();
          const gap = Math.round(b.top - a.bottom);
          if (gap < 0) continue; /* lado a lado (grade, trilho): não é vão vertical */
          out.push({ par: `${papel(f[i - 1])} → ${papel(f[i])}`, em: papel(pai), gap });
        }
      }
      return out;
    });
    for (const r of res) (((pares[W] ||= {})[`${r.em}: ${r.par}`] ||= {})[r.gap] ||= new Set()).add(rota);
    await p.close();
  }
  await ctx.close();
}
await nav.close();
let n = 0;
for (const W of Object.keys(pares)) {
  console.log(`\n==== ${W}px`);
  for (const [par, gaps] of Object.entries(pares[W]).sort()) {
    const vals = Object.keys(gaps);
    if (vals.length < 2) continue;
    n++;
    console.log(`${par}: ${vals.map(g => `${g}px [${[...gaps[g]].join(',')}]`).join('  ·  ')}`);
  }
}
console.log(`\n${n} par(es) com mais de um vão`);
