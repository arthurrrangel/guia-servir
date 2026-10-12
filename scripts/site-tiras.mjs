/* =============================================================================
   TIRAS DE CELULAR — a página inteira em um filme de telas
   (11/10/2026)

   Grava a página inteira no celular (390 CSS, DPR 2) e deixa o PNG pronto
   para ser cortado em telas e montado em tira (scripts/tiras.py).

   Uso: node scripts/site-tiras.mjs [base] [pasta] [largura] [rotas]
   ============================================================================= */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3000';
const PASTA = process.argv[3] || '/tmp/tiras';
const W = Number(process.argv[4] || 390);
const ROTAS = (process.argv[5] || '/,/cultos,/sobre,/eventos,/pequena-guia,/ofertar,/como-chegar,/servir,/servir/midia,/servir/onde-me-encaixo,/acessar,/privacidade').split(',');
const RPC_DIR = process.env.RPC_DIR;
mkdirSync(PASTA, { recursive: true });
const nomeArq = (p) => p.replace(/^\//, '').replace(/\//g, '_') || 'home';

/* PROXY=1: produção através do proxy da sessão (o NSS do navegador já confia na CA dele) */
const browser = await chromium.launch({ headless: true, ...(process.env.PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) });
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
  await page.goto(BASE + rota, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  /* rolar para carregar imagens preguiçosas, depois voltar e revelar tudo */
  const alt = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < alt; y += 600) { await page.evaluate(v => window.scrollTo(0, v), y); await page.waitForTimeout(90); }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => { document.documentElement.classList.add('nao-anima'); document.querySelectorAll('.rev,.sv-r,.s-rev').forEach(e => e.classList.add('visto')); });
  await page.addStyleTag({ content: '.s-pular{display:none!important}' });
  await page.waitForTimeout(900);
  /* DPR 1 para páginas muito altas (acima de ~15000px a captura sai branca) */
  if (alt * 2 > 15000) {
    const c2 = await browser.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'pt-BR' });
    const p2 = await c2.newPage();
    if (RPC_DIR) await p2.route('**/rest/v1/rpc/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(`${RPC_DIR}/rpc-mins.json`, 'utf8') }));
    await p2.goto(BASE + rota, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    for (let y = 0; y < alt; y += 600) { await p2.evaluate(v => window.scrollTo(0, v), y); await p2.waitForTimeout(80); }
    await p2.evaluate(() => { window.scrollTo(0, 0); document.documentElement.classList.add('nao-anima'); document.querySelectorAll('.rev,.sv-r,.s-rev').forEach(e => e.classList.add('visto')); });
    await p2.addStyleTag({ content: '.s-pular{display:none!important}' });
    await p2.waitForTimeout(800);
    await p2.screenshot({ path: `${PASTA}/${nomeArq(rota)}.png`, fullPage: true });
    await c2.close();
  } else {
    await page.screenshot({ path: `${PASTA}/${nomeArq(rota)}.png`, fullPage: true });
  }
  console.log(`${rota} ${alt}px`);
  await ctx.close();
}
await browser.close();
