import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'fs';
const RPC_DIR = process.env.RPC_DIR;
/* =============================================================================
   A PÁGINA INTEIRA, COMO GENTE VÊ · 12/10/2026

   As réguas medem margem e eixo; desenho se julga olhando. Esta captura abre
   cada rota como um iPhone (ou um monitor), rola a página inteira para as
   revelações e as fotos preguiçosas acontecerem, volta ao topo e grava a
   página inteira. Com PRIMEIRA=1 grava só a primeira tela (a área visível
   do Safari no iPhone é ~390x664: é ela que decide o herói).

   Uso: node scripts/site-inteira.mjs <base> <saida> <largura> <altura> <dpr> rota1 rota2 ...
   RPC_DIR=<pasta> responde as RPCs com JSON gravado; PROXY=1 usa o proxy.
   ============================================================================= */
const [BASE, OUT, W, H, DPR, ...ROTAS] = process.argv.slice(2);
const w = Number(W), h = Number(H);
const b = await chromium.launch({ headless: true, ...(process.env.PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) });
const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: Number(DPR), isMobile: w < 760, hasTouch: w < 760, locale: 'pt-BR',
  userAgent: w < 760 ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' : undefined });
const res = [];
for (const rota of ROTAS) {
  const p = await ctx.newPage();
  if (RPC_DIR) await p.route('**/rest/v1/rpc/**', async route => {
    const fn = new URL(route.request().url()).pathname.split('/').pop();
    let c = {}; try { c = JSON.parse(route.request().postData() || '{}'); } catch {}
    const arq = fn === 'ministerios_publicos' ? 'rpc-mins.json' : fn === 'numeros_publicos' ? 'rpc-num.json'
      : fn === 'equipe_funcoes' ? `rpc-funcoes-${c.p_slug}.json` : fn === 'perguntas_publicas' ? `rpc-perguntas-${c.p_slug}.json`
      : fn === 'areas_do_espaco' ? 'rpc-areas.json' : null;
    if (!arq || !existsSync(`${RPC_DIR}/${arq}`)) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(`${RPC_DIR}/${arq}`, 'utf8') });
  });
  const erros = [];
  p.on('console', m => { if (m.type() === 'error') erros.push(m.text().slice(0, 140)); });
  p.on('pageerror', e => erros.push('pageerror: ' + e.message.slice(0, 140)));
  await p.goto(BASE + rota, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(1500);
  const nome = rota === '/' ? 'home' : rota.replace(/^\//, '').replace(/[\/#?]/g, '_');
  if (process.env.PRIMEIRA) {
    await p.waitForTimeout(1000);
    await p.screenshot({ path: `${OUT}/${nome}.png` });
    res.push({ rota, erros }); await p.close(); continue;
  }
  const alt = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < alt; y += Math.round(h * 0.8)) { await p.evaluate(v => window.scrollTo(0, v), y); await p.waitForTimeout(250); }
  await p.waitForTimeout(800);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(1800);
  await p.screenshot({ path: `${OUT}/${nome}.png`, fullPage: true });
  res.push({ rota, alt, erros });
  await p.close();
}
console.log(JSON.stringify(res));
await b.close();
