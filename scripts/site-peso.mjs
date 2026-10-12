/* =============================================================================
   PESO NO CELULAR — quantos bytes a página pede num 4G
   (12/10/2026)

   Mede, por rota, o que o navegador baixa até a rede ficar quieta: total,
   imagens, fontes, scripts. Lista as cinco imagens mais pesadas e o LCP.
   Uso: node scripts/site-peso.mjs [base] [largura] [rotas]
   ============================================================================= */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3000';
const W = Number(process.argv[3] || 390);
const ROTAS = (process.argv[4] || '/,/cultos,/sobre,/eventos,/pequena-guia,/ofertar,/como-chegar,/servir,/servir/midia,/acessar').split(',');
const RPC_DIR = process.env.RPC_DIR;
const kb = n => Math.round(n / 1024);

const browser = await chromium.launch({ headless: true });
for (const rota of ROTAS) {
  const ctx = await browser.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR' });
  const page = await ctx.newPage();
  if (RPC_DIR) await page.route('**/rest/v1/rpc/**', async route => {
    const fn = new URL(route.request().url()).pathname.split('/').pop();
    let c = {}; try { c = JSON.parse(route.request().postData() || '{}'); } catch {}
    const arq = fn === 'ministerios_publicos' ? 'rpc-mins.json' : fn === 'numeros_publicos' ? 'rpc-num.json'
      : fn === 'equipe_funcoes' ? `rpc-funcoes-${c.p_slug}.json` : fn === 'perguntas_publicas' ? `rpc-perguntas-${c.p_slug}.json`
      : fn === 'areas_do_espaco' ? 'rpc-areas.json' : null;
    if (!arq || !existsSync(`${RPC_DIR}/${arq}`)) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(`${RPC_DIR}/${arq}`, 'utf8') });
  });
  const porTipo = {}; const imgs = [];
  page.on('response', async r => {
    try {
      const h = r.headers(); const t = (h['content-type'] || '').split(';')[0];
      const n = Number(h['content-length'] || 0) || (await r.body().catch(() => Buffer.alloc(0))).length;
      const g = t.startsWith('image/') ? 'imagem' : t.startsWith('font/') || t.includes('woff') ? 'fonte' : t.includes('javascript') ? 'js' : t.includes('css') ? 'css' : t.includes('html') ? 'html' : 'outro';
      porTipo[g] = (porTipo[g] || 0) + n;
      if (g === 'imagem') imgs.push({ u: r.url().split('/').pop().slice(0, 42), n });
    } catch {}
  });
  await page.goto(BASE + rota, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(900);
  const lcp = await page.evaluate(() => new Promise(res => {
    let v = 0;
    try { new PerformanceObserver(l => { for (const e of l.getEntries()) v = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
    setTimeout(() => res(Math.round(v)), 400);
  }));
  const total = Object.values(porTipo).reduce((a, b) => a + b, 0);
  imgs.sort((a, b) => b.n - a.n);
  console.log(JSON.stringify({
    rota, totalKB: kb(total), lcpMs: lcp,
    tipos: Object.fromEntries(Object.entries(porTipo).map(([k, v]) => [k, kb(v)])),
    maiores: imgs.slice(0, 5).map(i => `${i.u} ${kb(i.n)}KB`),
  }));
  await ctx.close();
}
await browser.close();
