/* =============================================================================
   ESTADOS DO CELULAR — o que só aparece quando alguém toca
   (11/10/2026)

   Menu (cortina), busca, dropdown de área, FAQ aberto, foco no formulário.
   Grava uma imagem por estado e mede alvo de toque e centralização.

   Uso: node scripts/site-estados.mjs [base] [pasta] [largura]
   ============================================================================= */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3000';
const PASTA = process.argv[3] || '/tmp/estados';
const W = Number(process.argv[4] || 390);
const RPC_DIR = process.env.RPC_DIR;
mkdirSync(PASTA, { recursive: true });

/* PROXY=1: produção através do proxy da sessão (o NSS do navegador já confia na CA dele) */
const browser = await chromium.launch({ headless: true, ...(process.env.PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) });
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

const medir = async (rotulo) => {
  const r = await page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const nome = e => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    const vis = e => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < .05) return false; const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight + 2000; };
    const pequenos = [], vazam = [];
    document.querySelectorAll('.s-cortina a,.s-cortina button,.s-busca a,.s-busca input,.s-busca button,.s-topo a,.s-topo button').forEach(e => {
      if (!vis(e)) return;
      const r = e.getBoundingClientRect();
      if (r.height < 44) pequenos.push(`${nome(e)} ${r.width.toFixed(0)}x${r.height.toFixed(0)} "${(e.textContent || '').trim().slice(0, 24)}"`);
      if (r.right > W + .6 || r.left < -.6) vazam.push(`${nome(e)} [${r.left.toFixed(0)}..${r.right.toFixed(0)}]`);
    });
    return { W, scrollW: document.documentElement.scrollWidth, pequenos: [...new Set(pequenos)].slice(0, 14), vazam: vazam.slice(0, 6) };
  });
  console.log(JSON.stringify({ estado: rotulo, ...r }));
};

/* 1. menu fechado */
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
await page.screenshot({ path: `${PASTA}/01-topo.png` });
await medir('topo');

/* 2. menu aberto */
await page.click('.s-menu-bt').catch(() => {});
await page.waitForTimeout(700);
await page.screenshot({ path: `${PASTA}/02-menu.png` });
await medir('menu');
/* 2b. menu rolado até o fim */
await page.evaluate(() => { const c = document.querySelector('.s-cortina'); if (c) c.scrollTop = c.scrollHeight; });
await page.waitForTimeout(400);
await page.screenshot({ path: `${PASTA}/03-menu-fim.png` });

/* 3. busca */
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await page.click('[aria-label="Buscar no site"]').catch(() => {});
await page.waitForTimeout(600);
await page.type('.s-busca input', 'serv', { delay: 40 }).catch(() => {});
await page.waitForTimeout(600);
await page.screenshot({ path: `${PASTA}/04-busca.png` });
await medir('busca');

/* 4. FAQ aberto (abre todos os <details>) */
await page.keyboard.press('Escape');
await page.goto(BASE + '/cultos', { waitUntil: 'networkidle' });
await page.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
await page.waitForTimeout(600);
const temFaq = await page.evaluate(() => { const d = document.querySelector('details'); if (!d) return false; d.scrollIntoView({ block: 'center' }); return true; });
await page.waitForTimeout(400);
if (temFaq) await page.screenshot({ path: `${PASTA}/05-faq.png` });

/* 5. formulário de servir com foco */
await page.goto(BASE + '/servir', { waitUntil: 'networkidle' });
await page.evaluate(() => { const f = document.querySelector('.s-form'); if (f) f.scrollIntoView({ block: 'center' }); });
await page.waitForTimeout(500);
await page.click('.s-form input').catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: `${PASTA}/06-form.png` });
await medir('form');

/* 6. âncoras: depois do pulo, o começo da seção fica abaixo da barra fixa */
/* o terceiro item é o link de verdade quando ele mora em outra página: o
   "Ver as outras áreas" de cada área leva a /servir#areas */
for (const [rota, alvo, href = alvo] of [['/pequena-guia', '#grupos'], ['/pequena-guia', '#encontrar'], ['/ofertar', '#porque'], ['/ofertar', '#ofertar'], ['/servir/midia', '#areas', '/servir#areas']]) {
  await page.goto(BASE + rota, { waitUntil: 'networkidle' });
  await page.evaluate(() => { document.documentElement.classList.add('nao-anima'); document.querySelectorAll('.s-rev').forEach(e => e.classList.add('visto')); });
  const link = await page.$(`.s main a[href="${href}"]`);
  if (!link) { console.log(JSON.stringify({ ancora: rota + ' → ' + href, erro: 'sem link na página' })); continue; }
  await link.click();
  if (href !== alvo) await page.waitForURL('**' + href, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const r = await page.evaluate((alvo) => {
    const t = document.querySelector(alvo); const b = document.querySelector('.s-topo');
    if (!t || !b) return { erro: 'sem alvo ou barra' };
    return { topoAlvo: Math.round(t.getBoundingClientRect().top), fimBarra: Math.round(b.getBoundingClientRect().bottom) };
  }, alvo);
  console.log(JSON.stringify({ ancora: href === alvo ? rota + alvo : rota + ' → ' + href, ...r, ok: r.topoAlvo >= r.fimBarra }));
}

await browser.close();
