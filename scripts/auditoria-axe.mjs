/* AUDITORIA · axe-core (wcag2a/aa/21aa + boas práticas) em 12 rotas × 2 larguras, com todas as seções reveladas antes de medir.
   Requer o dev server: PORTA=3700 node scripts/auditoria-axe.mjs  (ver claude/site-v4-volta-ao-modelo-startup-08-09-2026.md no Project) */
import { chromium } from 'playwright';
import { rotear } from './_rpc-mock.mjs';
import { readFileSync, existsSync } from 'node:fs';
const B=`http://localhost:${process.env.PORTA || 3000}`;
/* o axe-core não é dependência do projeto: AXE=/caminho/axe.min.js, ou npm i -D axe-core */
const AXE = readFileSync(process.env.AXE || 'node_modules/axe-core/axe.min.js', 'utf8');
const ROTAS = ['/', '/cultos', '/como-chegar', '/eventos', '/pequena-guia', '/sobre', '/ofertar', '/privacidade', '/servir', '/servir/midia', '/servir/louvor', '/servir/kids', '/servir/servico', '/servir/livraria', '/servir/onde-me-encaixo', '/acessar', '/follow', '/servir/midia/cadastro', '/rota-que-nao-existe'];
let total = 0, visitadas = 0;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const W of [390, 1440]) {
  const ctx = await b.newContext({ viewport: { width: W, height: 900 } });
  await ctx.route('**', r => rotear(r, B));
  for (const rota of ROTAS) {
    const p = await ctx.newPage();
    await p.goto(B + rota, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1800);
    /* revela todas as seções antes de medir: a palavra em revelação passa por
       cores intermediárias e o axe media o meio da animação (08/09/2026) */
    await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 50)); } window.scrollTo(0, 0); }); await p.waitForTimeout(1200);
    await p.addScriptTag({ content: AXE });
    const r = await p.evaluate(async () => {
      const res = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] }, rules: { 'color-contrast': { enabled: true } } });
      return res.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, ex: v.nodes.slice(0, 2).map(n => n.target.join(' ').slice(0, 70) + ' :: ' + (n.failureSummary || '').split('\n')[1]?.slice(0, 90)) }));
    });
    const graves = r.filter(v => ['critical', 'serious'].includes(v.impact) || v.id === 'color-contrast');
    visitadas++; total += r.length;
    if (r.length) console.log(W, rota, JSON.stringify(r.map(v => `${v.id}(${v.impact})×${v.n}`)));
    for (const v of graves) console.log('   ', v.id, v.ex.join(' | '));
    await p.close();
  }
  await ctx.close();
}
await b.close();
/* SILÊNCIO NÃO É ZERO. Sem esta linha o script terminava sem imprimir nada
   quando estava tudo certo — e também quando não visitava rota nenhuma. As
   duas saídas eram idênticas. Agora ele diz quantas telas mediu. */
console.log(total ? `VIOLAÇÕES: ${total} em ${visitadas} telas` : `AXE LIMPO em ${visitadas} telas`);
process.exit(total ? 1 : 0);
