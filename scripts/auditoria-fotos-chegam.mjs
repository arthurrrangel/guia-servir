/* =============================================================================
   AUDITORIA · AS FOTOS QUE CHEGAM (22/10/2026)

   A foto "lazy" entra com fusão quando termina de baixar (app/site.css e
   components/site/Movimento.tsx). O risco de uma fusão assim é uma foto que
   nunca recebe a marca e fica invisível. Aqui, com movimento:
     · cada página rolada inteira, devagar, como uma pessoa: nenhuma foto pronta
       (baixada, com largura) pode ficar com opacidade abaixo de 1;
     · a troca de página pelo menu (navegação do Next, sem recarregar): o mesmo
       na página nova;
     · uma foto atrasada de propósito (1,5 s): fica apagada enquanto baixa e
       aparece inteira quando chega;
     · com "reduzir movimento": nenhuma foto apagada, nunca.
   A janela do fecho fica de fora (a opacidade dela segue a rolagem).
   Requer o servidor: PORTA=3800 node scripts/auditoria-fotos-chegam.mjs
   Sai com 1 se alguma foto ficar apagada.
   ============================================================================= */
import { chromium } from 'playwright';
import { rotear } from './_rpc-mock.mjs';
const B = `http://localhost:${process.env.PORTA || 3700}`;
const ROTAS = ['/', '/cultos', '/eventos', '/sobre', '/como-chegar', '/pequena-guia', '/servir', '/servir/midia', '/servir/onde-me-encaixo', '/follow'];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let ruins = 0;
const apagadas = p => p.evaluate(() => [...document.querySelectorAll('main img[loading="lazy"]')]
  .filter(im => !im.closest('.s-janela-foto') && im.complete && im.naturalWidth > 0 && +getComputedStyle(im).opacity < .99)
  .map(im => `${im.currentSrc.split('/').pop()} (op ${getComputedStyle(im).opacity})`));
const rolarDevagar = async p => {
  await p.evaluate(async () => {
    document.documentElement.style.scrollBehavior = 'auto';
    for (let y = 0; y < document.documentElement.scrollHeight; y += Math.round(innerHeight * .7)) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
  });
  await p.waitForLoadState('networkidle').catch(() => {});
  await p.waitForTimeout(900);
};
for (const [W, H] of [[390, 844], [1440, 900]]) {
  for (const modo of ['no-preference', 'reduce']) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: W < 760, hasTouch: W < 760, reducedMotion: modo });
    await ctx.route('**', r => rotear(r, B));
    const p = await ctx.newPage();
    for (const rota of ROTAS) {
      await p.goto(B + rota, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
      await p.waitForTimeout(400);
      await rolarDevagar(p);
      const r = await apagadas(p);
      const n = await p.evaluate(() => document.querySelectorAll('main img[loading="lazy"]').length);
      if (r.length) ruins++;
      console.log(`${r.length ? 'MAL' : 'ok '} ${String(W).padStart(4)} ${modo.padEnd(13)} ${rota.padEnd(26)} ${n} fotos lazy${r.length ? ' · apagadas: ' + r.join(', ') : ''}`);
    }
    /* a troca de página pelo link do pé (sem recarregar) */
    await p.goto(B + '/', { waitUntil: 'networkidle' });
    const link = p.locator('a[href="/sobre"]').first();
    if (await link.count()) {
      await link.evaluate(a => a.click());
      await p.waitForURL('**/sobre', { timeout: 15000 }).catch(() => {});
      await p.waitForTimeout(600);
      await rolarDevagar(p);
      const r = await apagadas(p);
      if (r.length) ruins++;
      console.log(`${r.length ? 'MAL' : 'ok '} ${String(W).padStart(4)} ${modo.padEnd(13)} / → /sobre pelo link (sem recarregar)${r.length ? ' · apagadas: ' + r.join(', ') : ''}`);
    }
    await ctx.close();
  }
}
/* a foto atrasada: o violão da home chega 1,5 s depois de pedido */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  await ctx.route('**', async r => {
    if (/gente-violao/.test(r.request().url())) { await new Promise(res => setTimeout(res, 1500)); }
    return rotear(r, B);
  });
  const p = await ctx.newPage();
  await p.goto(B + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  const sel = 'main img[src*="gente-violao"]';
  await p.evaluate(sel => { document.documentElement.style.scrollBehavior = 'auto'; const e = document.querySelector(sel); scrollTo(0, e.getBoundingClientRect().top + scrollY - 200); }, sel);
  await p.waitForTimeout(250);
  const durante = await p.evaluate(sel => { const e = document.querySelector(sel); return { op: +getComputedStyle(e).opacity, pronta: e.complete && e.naturalWidth > 0 }; }, sel);
  await p.waitForTimeout(2600);
  const depois = await p.evaluate(sel => { const e = document.querySelector(sel); return { op: +getComputedStyle(e).opacity, pronta: e.complete && e.naturalWidth > 0 }; }, sel);
  const ok = (!durante.pronta ? durante.op < .05 : true) && depois.pronta && depois.op > .99;
  if (!ok) ruins++;
  console.log(`${ok ? 'ok ' : 'MAL'} foto atrasada (violão, 1,5 s): enquanto baixa op ${durante.op} (pronta: ${durante.pronta}) · depois op ${depois.op} (pronta: ${depois.pronta})`);
  await ctx.close();
}
await b.close();
console.log(ruins ? `\n${ruins} caso(s) com foto apagada` : '\nnenhuma foto pronta ficou apagada; a atrasada entra quando chega');
process.exit(ruins ? 1 : 0);
