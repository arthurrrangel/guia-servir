/* =============================================================================
   AUDITORIA · O TESTE DE FLICK (21/10/2026)

   O teste da skill site-de-10k (references/pipeline-scrub.md) nos heróis que
   andam com o scroll: passos de 120, 240 e 360 px, 400 ms entre eles, a
   partir do topo, no monitor (1440 x 900) e no celular do Arthur (Pro Max no
   Safari 26: 956 de tela, 800 à vista). Para cada faixa: quantos passos de
   120 seguidos ela fica inteira (opacidade >= 0,95; a skill pede cinco a
   seis), e se chega inteira pelo menos uma vez com passos de 240 e 360 (uma
   faixa que nunca chega é uma batida que dá para pular).

     PORTA=3700 node scripts/auditoria-flick.mjs [/rota ...]
   ============================================================================= */
import { chromium } from 'playwright';
import { rotear } from './_rpc-mock.mjs';
const arg = process.argv.slice(2);
const B = arg.find(a => a.startsWith('http')) || `http://localhost:${process.env.PORTA || 3000}`;
const rotas = arg.filter(a => a.startsWith('/'));
const ROTAS = rotas.length ? rotas : ['/', '/cultos', '/servir', '/follow'];
const TELAS = [['1440x900', 1440, 900, 900, false], ['Pro Max iOS 26', 440, 956, 800, true]];
const b = await chromium.launch();
let pulos = 0;
for (const [nome, W, H, V, cel] of TELAS) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: cel, hasTouch: cel });
  if (cel) await ctx.addInitScript(v => { Object.defineProperty(window, 'innerHeight', { get: () => v, configurable: true }); }, V);
  await ctx.route('**', r => rotear(r, B));
  for (const rota of ROTAS) {
    const linha = [];
    for (const passo of [120, 240, 360]) {
      const p = await ctx.newPage();
      await p.goto(B + rota, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
      await p.waitForTimeout(1200);
      await p.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, 0); });
      const fim = await p.evaluate(v => { const h = document.querySelector('.s-scrub'); return h.offsetTop + h.offsetHeight - v; }, V);
      const n = await p.evaluate(() => document.querySelectorAll('.s-scrub-faixa').length);
      const hist = Array.from({ length: n }, () => []);
      for (let y = 0; y <= fim + passo; y += passo) {
        await p.evaluate(y => scrollTo(0, y), y);
        await p.waitForTimeout(400);
        const ops = await p.evaluate(() => [...document.querySelectorAll('.s-scrub-faixa')].map(e => +getComputedStyle(e).opacity));
        ops.forEach((o, i) => hist[i].push(o));
      }
      const rot = await p.evaluate(() => [...document.querySelectorAll('.s-scrub-faixa')].map(e => (e.querySelector('.s-scrub-frase')?.textContent || '').trim().slice(0, 22)));
      if (passo === 120) {
        hist.forEach((h, i) => { let m = 0, c = 0; for (const o of h) { c = o >= 0.95 ? c + 1 : 0; m = Math.max(m, c); } linha.push(`${rot[i]}: ${m}${m < 5 ? ' (!)' : ''}`); });
      } else {
        const puladas = hist.map((h, i) => Math.max(...h) < 0.95 ? rot[i] : null).filter(Boolean);
        if (puladas.length) pulos++;
        linha.push(`passo ${passo}: ${puladas.length ? 'PULOU ' + puladas.join(', ') : 'nenhuma pulada'}`);
      }
      await p.close();
    }
    console.log(`${nome.padEnd(15)} ${rota.padEnd(8)} ` + linha.join(' · '));
  }
  await ctx.close();
}
await b.close();
console.log(pulos ? `\n${pulos} rodada(s) com faixa pulada` : '\nnenhuma faixa pulada em passos de 240 e 360 px');
process.exit(pulos ? 1 : 0);
