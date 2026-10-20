/* =============================================================================
   AUDITORIA · HOVER E FOCO (20/10/2026)

   Todo link, botão, pergunta que abre e campo do site responde ao mouse no
   computador e mostra o foco quando se chega nele pelo teclado?

   HOVER: para cada controle visível, a assinatura de estilo dele e dos pais
   antes e durante o hover (cor, fundo, opacidade, transform, sombra,
   sublinhado, fio). Igual = sem resposta. Item dentro de painel fechado da
   barra (opacity 0, sem ponteiro) sai como falso positivo: o hover nem chega.
   FOCO: Tab pelo documento (até 90 paradas) e, em cada parada visível pelo
   teclado (:focus-visible), outline ou sombra tem que existir.

     PORTA=3700 node scripts/auditoria-hover-foco.mjs [/rota ...]
   ============================================================================= */
import { chromium } from 'playwright';
import { rotear, rolarTudo, ROTAS_SITE } from './_rpc-mock.mjs';

const B = `http://localhost:${process.env.PORTA || 3000}`;
const ROTAS = process.argv.slice(2).length ? process.argv.slice(2) : ROTAS_SITE.filter(r => !r.includes('nao-existe'));
const PROPS = ['backgroundColor', 'color', 'opacity', 'transform', 'boxShadow', 'textDecorationLine', 'borderColor', 'outlineStyle', 'outlineWidth', 'textDecorationColor'];
const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', hasTouch: false });
await ctx.route('**', r => rotear(r, B));
const semHover = {}, semFoco = {};
for (const rota of ROTAS) {
  const p = await ctx.newPage();
  await p.goto(B + rota, { waitUntil: 'networkidle' }); await p.waitForTimeout(400); await rolarTudo(p);
  const n = await p.evaluate(() => {
    let k = 0;
    for (const e of document.querySelectorAll('main a, main button, main summary, footer a, footer button, header a, header button')) {
      const r = e.getBoundingClientRect(), s = getComputedStyle(e);
      /* fora: o que está em painel fechado (sem ponteiro) ou escondido */
      if (r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !e.closest('[inert]') && !e.closest('.s-sub:not(.aberto)')) e.setAttribute('data-k', String(k++));
    }
    return k;
  });
  const assinatura = (sel) => p.evaluate(([sel, PROPS]) => { const e = document.querySelector(sel); const c = []; for (let a = e; a && a !== document.body; a = a.parentElement) c.push(a); return c.map(a => PROPS.map(pp => getComputedStyle(a)[pp]).join('|')).join('#'); }, [sel, PROPS]);
  for (let k = 0; k < n; k++) {
    const sel = `[data-k="${k}"]`;
    const antes = await assinatura(sel);
    try { await p.locator(sel).hover({ force: true, timeout: 1500 }); } catch { continue; }
    await p.waitForTimeout(60);
    if (antes === await assinatura(sel)) (semHover[rota] ||= []).push(await p.evaluate(sel => { const e = document.querySelector(sel); return e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).trim().split(/\s+/).slice(0, 2).join('.') : '') + ' "' + (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30) + '"'; }, sel));
    await p.mouse.move(0, 0);
  }
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.keyboard.press('Tab');
  const vistos = new Set();
  for (let i = 0; i < 90; i++) {
    const r = await p.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const s = getComputedStyle(e); const k = e.getAttribute('data-k') || e.tagName + (e.className || '') + (e.textContent || '').slice(0, 20); const ok = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none'; return { k, ok, vis: e.matches(':focus-visible'), nome: e.tagName.toLowerCase() + ' "' + (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30) + '"' }; });
    if (!r || vistos.has(r.k)) break; vistos.add(r.k);
    if (!r.ok && r.vis) (semFoco[rota] ||= []).push(r.nome);
    await p.keyboard.press('Tab');
  }
  console.log(`${rota}: ${n} controles · sem hover ${(semHover[rota] || []).length} · sem foco ${(semFoco[rota] || []).length}`);
  await p.close();
}
await nav.close();
const total = Object.values(semHover).flat().length + Object.values(semFoco).flat().length;
if (Object.keys(semHover).length) { console.log('\nSEM HOVER:'); for (const [r, l] of Object.entries(semHover)) console.log(' ', r, [...new Set(l)].join(' · ')); }
if (Object.keys(semFoco).length) { console.log('\nSEM FOCO VISÍVEL:'); for (const [r, l] of Object.entries(semFoco)) console.log(' ', r, [...new Set(l)].join(' · ')); }
console.log(total ? `\n${total} problema(s)` : '\ntudo responde');
process.exit(total ? 1 : 0);
