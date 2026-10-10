/* =============================================================================
   CAPTURA DA /servir — a auditoria em imagem antes de entregar (10/10/2026)

   Abre a página no servidor local (next start ou next dev), em três
   larguras, e grava: a primeira tela, a página inteira, e o menu do celular
   aberto. Também lista erros de console, pedidos que falharam e os
   elementos que ultrapassam a largura da janela (a rolagem lateral que o
   celular denuncia como um tranco).

   Uso: node scripts/servir-captura.mjs [url] [pasta]
   ============================================================================= */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] || 'http://localhost:3000/servir';
const PASTA = process.argv[3] || '/tmp/servir-capturas';
mkdirSync(PASTA, { recursive: true });

const LARGURAS = [
  { nome: 'celular', w: 390, h: 844, dpr: 2, mobile: true },
  { nome: 'tablet', w: 834, h: 1194, dpr: 2, mobile: true },
  { nome: 'desktop', w: 1440, h: 900, dpr: 1, mobile: false },
];

/* O banco, sem rede: no container o navegador não alcança o Supabase, então
   as duas RPCs públicas são respondidas com o JSON gravado em RPC_DIR (o
   resultado real, baixado com curl antes). Sem RPC_DIR, a página fala com o
   banco de verdade. */
const RPC_DIR = process.env.RPC_DIR;
const { readFileSync } = await import('node:fs');
const browser = await chromium.launch({ headless: true });

for (const L of LARGURAS) {
  const ctx = await browser.newContext({
    viewport: { width: L.w, height: L.h }, deviceScaleFactor: L.dpr, isMobile: L.mobile, hasTouch: L.mobile,
    locale: 'pt-BR', ignoreHTTPSErrors: true,
  });
  const page = await ctx.newPage();
  if (RPC_DIR) {
    await page.route('**/rest/v1/rpc/**', route => {
      const u = route.request().url();
      const arq = u.includes('ministerios_publicos') ? 'rpc-mins.json' : u.includes('numeros_publicos') ? 'rpc-num.json' : null;
      if (!arq) return route.fulfill({ status: 404, body: '{}' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(`${RPC_DIR}/${arq}`, 'utf8') });
    });
  }
  const erros = [], falhas = [];
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  page.on('requestfailed', r => falhas.push(`${r.failure()?.errorText} ${r.url()}`));
  page.on('response', r => { if (r.status() >= 400) falhas.push(`${r.status()} ${r.url()}`); });

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 }).catch(e => falhas.push('goto: ' + e.message));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${PASTA}/${L.nome}-1-topo.png` });

  /* rola devagar para a revelação acontecer, depois volta ao topo */
  const altura = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < altura; y += Math.round(L.h * 0.7)) {
    await page.evaluate(v => window.scrollTo(0, v), y);
    await page.waitForTimeout(140);
  }
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${PASTA}/${L.nome}-2-inteira.png`, fullPage: true });

  /* o que vaza para fora da largura da janela */
  const vazam = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const out = [];
    document.querySelectorAll('body *').forEach(e => {
      const r = e.getBoundingClientRect();
      if (r.width > 0 && (r.right > w + 1 || r.left < -1) && getComputedStyle(e).position !== 'fixed') {
        const s = e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').slice(0, 2).join('.') : e.tagName;
        out.push(`${e.tagName.toLowerCase()}${s} left=${Math.round(r.left)} right=${Math.round(r.right)}`);
      }
    });
    return { w, scrollW: document.documentElement.scrollWidth, out: out.slice(0, 12) };
  });

  /* o menu do celular, aberto */
  if (L.w < 1000) {
    await page.click('.sv-menu-bt');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${PASTA}/${L.nome}-3-menu.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  } else {
    await page.hover('.sv-nav > li:nth-child(3) > button');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${PASTA}/${L.nome}-3-submenu.png` });
  }

  /* o formulário: envia vazio e fotografa os erros */
  await page.evaluate(() => document.getElementById('quero-servir')?.scrollIntoView());
  await page.waitForTimeout(900);
  await page.click('.sv-form button[type="submit"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${PASTA}/${L.nome}-4-form-erros.png` });

  const fontes = await page.evaluate(async () => {
    await document.fonts.ready;
    return Array.from(document.fonts).filter(f => f.status === 'loaded').map(f => `${f.family} ${f.style} ${f.weight}`);
  });
  const numeros = await page.evaluate(() => Array.from(document.querySelectorAll('.sv-vivos b')).map(b => b.textContent));
  const cartoes = await page.evaluate(() => Array.from(document.querySelectorAll('.sv-cartao h3')).map(b => b.textContent));
  console.log(JSON.stringify({ largura: L.nome, vazam, fontes: [...new Set(fontes)], numeros, cartoes, erros: erros.slice(0, 8), falhas: falhas.slice(0, 8) }, null, 1));
  await ctx.close();
}
await browser.close();
