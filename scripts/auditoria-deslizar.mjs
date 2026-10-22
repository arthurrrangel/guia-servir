/* =============================================================================
   AUDITORIA · O DESLIZAR DAS FAIXAS NO CELULAR (22/10/2026)

   As listas que no computador são grade viram, abaixo de 760 px, uma faixa de
   deslizar (components/site/Trilho.tsx: scroll-snap e os pontos embaixo).
   Aqui o dedo de verdade (eventos de toque pelo protocolo do Chromium, não
   rolagem por script): em cada faixa que rola, um arrasto da direita para a
   esquerda e, depois do encaixe,
     · a faixa andou (e a página não andou na vertical junto);
     · um cartão ficou no centro da faixa (o encaixe, ±3 px);
     · o ponto aceso é o desse cartão;
   e o toque no último ponto leva ao último cartão.
   Requer o servidor: PORTA=3800 node scripts/auditoria-deslizar.mjs [/rota ...]
   Sai com 1 se alguma faixa falhar.
   ============================================================================= */
import { chromium } from 'playwright';
import { rotear } from './_rpc-mock.mjs';
const B = `http://localhost:${process.env.PORTA || 3700}`;
const arg = process.argv.slice(2).filter(a => a.startsWith('/'));
const ROTAS = arg.length ? arg : ['/', '/cultos', '/eventos', '/pequena-guia', '/sobre', '/servir', '/servir/midia', '/servir/louvor', '/servir/onde-me-encaixo', '/acessar', '/follow'];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let ruins = 0, faixas = 0;
for (const rota of ROTAS) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route('**', r => rotear(r, B));
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await p.goto(B + rota, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  await p.waitForTimeout(800);
  const n = await p.evaluate(() => [...document.querySelectorAll('.desliza')].filter(e => e.scrollWidth > e.clientWidth + 4 && e.offsetParent !== null).length);
  const linhas = [];
  for (let k = 0; k < n; k++) {
    /* a faixa k no meio da tela */
    const caixa = await p.evaluate(k => {
      const e = [...document.querySelectorAll('.desliza')].filter(e => e.scrollWidth > e.clientWidth + 4 && e.offsetParent !== null)[k];
      document.documentElement.style.scrollBehavior = 'auto';
      e.style.scrollBehavior = 'auto'; e.scrollLeft = 0; e.style.scrollBehavior = '';
      const r0 = e.getBoundingClientRect();
      window.scrollTo(0, scrollY + r0.top - (innerHeight - Math.min(r0.height, innerHeight * .6)) / 2);
      const r = e.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height, rotulo: e.getAttribute('aria-label') || e.className };
    }, k);
    await p.waitForTimeout(500);
    const antes = await p.evaluate(() => scrollY);
    const yToque = Math.round(caixa.y + Math.min(caixa.h, 300) / 2);
    const x0 = Math.round(caixa.x + caixa.w * .8), x1 = Math.round(caixa.x + caixa.w * .2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: yToque }] });
    for (let s = 1; s <= 10; s++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(x0 + (x1 - x0) * s / 10), y: yToque + (s % 2) }] });
      await p.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(1200);
    const r = await p.evaluate(k => {
      const e = [...document.querySelectorAll('.desliza')].filter(e => e.scrollWidth > e.clientWidth + 4 && e.offsetParent !== null)[k];
      const fs = [...e.children].filter(c => c.offsetParent !== null);
      const meio = e.getBoundingClientRect().left + e.clientWidth / 2;
      let j = 0, d = Infinity;
      fs.forEach((c, i) => { const r = c.getBoundingClientRect(); const dd = Math.abs(r.left + r.width / 2 - meio); if (dd < d) { d = dd; j = i; } });
      /* os pontos: a próxima irmã com .trilho-pontos */
      let pts = e.nextElementSibling; while (pts && !pts.classList.contains('trilho-pontos')) pts = pts.nextElementSibling;
      const aceso = pts ? [...pts.children].findIndex(b => b.getAttribute('aria-current') === 'true') : -1;
      /* o encaixe: alinhado ao centro, ou à borda nas pontas (o primeiro e o último encostam na margem) */
      const snap = getComputedStyle(fs[j]).scrollSnapAlign;
      return { sl: Math.round(e.scrollLeft), j, d: Math.round(d), aceso, nPts: pts ? pts.children.length : 0, nCartoes: fs.length, snap, fim: e.scrollWidth - e.clientWidth - e.scrollLeft < 2 };
    }, k);
    const depois = await p.evaluate(() => scrollY);
    /* toque no último ponto */
    let ultimo = null;
    if (r.nPts > 1) {
      ultimo = await p.evaluate(async k => {
        const e = [...document.querySelectorAll('.desliza')].filter(e => e.scrollWidth > e.clientWidth + 4 && e.offsetParent !== null)[k];
        let pts = e.nextElementSibling; while (pts && !pts.classList.contains('trilho-pontos')) pts = pts.nextElementSibling;
        pts.lastElementChild.click();
        await new Promise(res => setTimeout(res, 900));
        const fs = [...e.children].filter(c => c.offsetParent !== null);
        const ult = fs[fs.length - 1].getBoundingClientRect(), cx = e.getBoundingClientRect();
        return { inteiro: ult.left >= cx.left - 2 && ult.right <= cx.right + 2, aceso: [...pts.children].findIndex(b => b.getAttribute('aria-current') === 'true') };
      }, k);
    }
    const centrado = r.d <= 3 || r.fim;
    const ok = r.sl > 20 && Math.abs(depois - antes) <= 4 && centrado && (r.nPts === 0 || r.aceso === r.j) && (!ultimo || (ultimo.inteiro && ultimo.aceso === r.nPts - 1));
    faixas++;
    if (!ok) ruins++;
    linhas.push(`   ${ok ? 'ok ' : 'MAL'} «${String(caixa.rotulo).slice(0, 28)}» ${r.nCartoes} cartões · arrasto: andou ${r.sl}px, página ${depois - antes >= 0 ? '+' : ''}${depois - antes}px, cartão ${r.j + 1} a ${r.d}px do centro${r.fim ? ' (fim da faixa)' : ''}, ponto ${r.aceso + 1}/${r.nPts}${ultimo ? ` · último ponto: cartão inteiro ${ultimo.inteiro ? 'sim' : 'NÃO'}, ponto ${ultimo.aceso + 1}` : ''}`);
  }
  console.log(`${rota.padEnd(26)} ${n} faixa(s) que deslizam`);
  for (const l of linhas) console.log(l);
  await ctx.close();
}
await b.close();
console.log(ruins ? `\n${ruins} de ${faixas} faixa(s) com problema no deslizar` : `\nas ${faixas} faixas deslizam com o dedo, encaixam no centro e os pontos acompanham`);
process.exit(ruins ? 1 : 0);
