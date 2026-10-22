/* =============================================================================
   AUDITORIA · ACABAMENTO (21/10/2026)

   Três defeitos que a colisão não pega, em todas as páginas e larguras:
   · aperto: parágrafo de 10+ palavras espremido (menos de 3,2 palavras por
     linha), como o "próximo passo" do /cultos no tablet, em 200 px;
   · fila incompleta: grade de 3+ colunas cuja última linha sobra com 2+
     buracos, ou um item sozinho (as funções de cada área: 5 + 3, 5 + 4);
   · rótulo partido: título curto que quebra deixando só número e pontuação
     na primeira linha ("01 -" / "Relacionamento", no /sobre).
   Os achados são para olhar, não reprovam sozinhos: uma grade de 7 em 4 + 3
   é a melhor que existe.

     PORTA=3700 node scripts/auditoria-acabamento.mjs [--larguras=820,1440] [/rota ...]
   ============================================================================= */
import { chromium } from 'playwright';
import { rotear, rolarTudo, ROTAS_SITE } from './_rpc-mock.mjs';
const arg = process.argv.slice(2);
const B = arg.find(a => a.startsWith('http')) || `http://localhost:${process.env.PORTA || 3000}`;
const lArg = arg.find(a => a.startsWith('--larguras='));
const LARGURAS = lArg ? lArg.split('=')[1].split(',').map(Number) : [390, 440, 760, 820, 1000, 1180, 1440, 1920];
const rotasArg = arg.filter(a => a.startsWith('/'));
const ROTAS = rotasArg.length ? rotasArg : ROTAS_SITE;
const b = await chromium.launch();
let total = 0, esgotadas = 0;
const t0 = Date.now();
console.log(`${ROTAS.length} rotas x ${LARGURAS.length} larguras (${LARGURAS.join(', ')}): uma linha por página`);
for (const W of LARGURAS) {
  const ctx = await b.newContext({ viewport: { width: W, height: W < 760 ? 800 : 900 }, isMobile: W < 760, hasTouch: W <= 1180, reducedMotion: 'reduce' });
  await ctx.route('**', r => rotear(r, B));
  for (const rota of ROTAS) {
    const p = await ctx.newPage();
    const inicio = Date.now();
    const pagina = (async () => {
    await p.goto(B + rota, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(300); await rolarTudo(p); await p.waitForTimeout(250);
    const r = await p.evaluate(() => {
      const vis = el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
      const nome = el => (el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''));
      const linhas = el => { const rg = document.createRange(); rg.selectNodeContents(el); const tops = new Set(); for (const q of rg.getClientRects()) if (q.width > 1 && q.height > 4) tops.add(Math.round(q.top / 4)); return tops.size; };
      const ach = [];
      for (const el of document.querySelectorAll('main p, main .s-cartao-d, main .s-funcao p, main li')) {
        if (!vis(el) || el.closest('[aria-hidden="true"]')) continue;
        if (el.querySelector('p, li, div') || el.getBoundingClientRect().width < 20) continue;
        const pal = el.textContent.trim().split(/\s+/).filter(Boolean).length;
        if (pal < 10) continue;
        const n = linhas(el);
        if (n && pal / n < 3.2) ach.push(`aperto: ${nome(el)} "${el.textContent.trim().slice(0, 36)}" ${pal} palavras em ${n} linhas (${Math.round(el.getBoundingClientRect().width)}px)`);
      }
      for (const el of document.querySelectorAll('main *')) {
        const s = getComputedStyle(el);
        if (!/grid/.test(s.display) || !vis(el)) continue;
        const cols = s.gridTemplateColumns.split(' ').filter(Boolean).length;
        const filhos = [...el.children].filter(c => vis(c) && c.getBoundingClientRect().height > 20);
        if (cols < 3 || filhos.length < 4 || s.gridTemplateAreas !== 'none' || el.closest('.s-scrub')) continue;
        const tops = new Map();
        for (const c of filhos) { const t = Math.round(c.getBoundingClientRect().top / 6); tops.set(t, (tops.get(t) || 0) + 1); }
        const fil = [...tops.entries()].sort((a, b) => a[0] - b[0]).map(x => x[1]);
        if (fil.length < 2) continue;
        const ult = fil[fil.length - 1], cheia = Math.max(...fil);
        if (ult === 1 || cheia - ult >= 2) ach.push(`fila incompleta: ${nome(el)} ${filhos.length} itens em filas de ${fil.join('+')} (${cols} colunas)`);
      }
      for (const el of document.querySelectorAll('main b, main strong, main h3, main .s-cartao-t, main .s-funcao b')) {
        if (!vis(el)) continue;
        const rg = document.createRange(); rg.selectNodeContents(el);
        const qs = [...rg.getClientRects()].filter(q => q.width > 1);
        if (new Set(qs.map(q => Math.round(q.top / 4))).size < 2) continue;
        const t0 = Math.round(qs[0].top);
        /* o texto da primeira linha: o que cabe até a largura da primeira caixa */
        const txt = el.textContent.trim();
        const m = txt.match(/^[\d\s.\-–·:/]+/);
        if (m && m[0].trim().length && qs.filter(q => Math.abs(Math.round(q.top) - t0) < 4).reduce((a, q) => a + q.width, 0) < el.getBoundingClientRect().width * 0.35) ach.push(`rótulo partido: ${nome(el)} "${txt.slice(0, 30)}"`);
      }
      return [...new Set(ach)];
    });
    return r;
    })();
    const r = await Promise.race([pagina, new Promise(res => setTimeout(() => res(null), 120000))]);
    const seg = ((Date.now() - inicio) / 1000).toFixed(1);
    if (r === null) { esgotadas++; console.log(`${String(W).padStart(4)} ${rota.padEnd(26)} TEMPO ESGOTADO (120 s)`); }
    else if (r.length) { total += r.length; console.log(`${String(W).padStart(4)} ${rota.padEnd(26)} ${r.length} achado(s) · ${seg} s`); for (const x of r.slice(0, 12)) console.log('      ' + x); if (r.length > 12) console.log(`      ... e mais ${r.length - 12}`); }
    else console.log(`${String(W).padStart(4)} ${rota.padEnd(26)} ok · ${seg} s`);
    await p.close();
  }
  await ctx.close();
}
await b.close();
console.log(`\n${Math.round((Date.now() - t0) / 1000)} s no total${esgotadas ? `, ${esgotadas} página(s) sem resposta` : ''}`);
console.log(total ? `\n${total} achado(s)` : '\nnada');
process.exit(esgotadas ? 1 : 0);
