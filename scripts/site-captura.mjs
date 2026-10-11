/* =============================================================================
   CAPTURA DO SITE PÚBLICO — a auditoria em imagem de todas as páginas
   (10/10/2026, a identidade nova aplicada ao site inteiro)

   Abre cada rota pública no servidor local em duas larguras (celular 390 e
   desktop 1440) e grava a primeira tela e a página inteira. Para cada uma
   lista: erros de console, pedidos que falharam, elementos que vazam para
   fora da largura da janela, as fontes carregadas e a última palavra de
   cada título (a serifa itálica tem que estar lá).

   Uso: node scripts/site-captura.mjs [base] [pasta] [rotas separadas por vírgula]
   RPC_DIR=<pasta> responde as RPCs públicas com JSON gravado (o navegador do
   container não alcança o Supabase). Sem RPC_DIR, fala com o banco.
   ============================================================================= */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3000';
const PASTA = process.argv[3] || '/tmp/site-capturas';
const ROTAS = (process.argv[4] || '/,/cultos,/sobre,/como-chegar,/pequena-guia,/ofertar,/guia-church-tv,/acessar,/servir,/servir/midia,/servir/onde-me-encaixo,/servir/midia/cadastro,/eu,/privacidade').split(',');
mkdirSync(PASTA, { recursive: true });

const LARGURAS = [
  { nome: 'celular', w: 390, h: 844, dpr: 2, mobile: true },
  { nome: 'desktop', w: 1440, h: 900, dpr: 1, mobile: false },
];
const RPC_DIR = process.env.RPC_DIR;
const nomeArq = (p) => p.replace(/^\//, '').replace(/\//g, '_') || 'home';

const instalaRotas = async (page) => {
  if (!RPC_DIR) return;
  await page.route('**/rest/v1/rpc/**', async route => {
    const u = new URL(route.request().url());
    const fn = u.pathname.split('/').pop();
    let corpo = {};
    try { corpo = JSON.parse(route.request().postData() || '{}'); } catch {}
    const slug = corpo.p_slug;
    const arq = fn === 'ministerios_publicos' ? 'rpc-mins.json'
      : fn === 'numeros_publicos' ? 'rpc-num.json'
      : fn === 'equipe_funcoes' ? `rpc-funcoes-${slug}.json`
      : fn === 'perguntas_publicas' ? `rpc-perguntas-${slug}.json`
      : fn === 'areas_do_espaco' ? 'rpc-areas.json' : null;
    if (!arq || !existsSync(`${RPC_DIR}/${arq}`)) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(`${RPC_DIR}/${arq}`, 'utf8') });
  });
};

const browser = await chromium.launch({ headless: true });
for (const L of LARGURAS) {
  for (const rota of ROTAS) {
    const ctx = await browser.newContext({
      viewport: { width: L.w, height: L.h }, deviceScaleFactor: L.dpr, isMobile: L.mobile, hasTouch: L.mobile,
      locale: 'pt-BR', ignoreHTTPSErrors: true,
    });
    const page = await ctx.newPage();
    await instalaRotas(page);
    const erros = [], falhas = [];
    page.on('console', m => { if (m.type() === 'error') erros.push(m.text().slice(0, 160)); });
    page.on('requestfailed', r => falhas.push(`${r.failure()?.errorText} ${r.url()}`.slice(0, 160)));
    page.on('response', r => { if (r.status() >= 400) falhas.push(`${r.status()} ${r.url()}`.slice(0, 160)); });

    await page.goto(BASE + rota, { waitUntil: 'networkidle', timeout: 60000 }).catch(e => falhas.push('goto: ' + e.message));
    await page.waitForTimeout(1600);
    const nome = `${L.nome}-${nomeArq(rota)}`;
    await page.screenshot({ path: `${PASTA}/${nome}-1-topo.png` });

    const altura = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < altura; y += Math.round(L.h * 0.7)) {
      await page.evaluate(v => window.scrollTo({ top: v, behavior: 'instant' }), y);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(800);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(500);
    await page.addStyleTag({ content: '.pular{display:none!important}' });
    /* página inteira em DPR 1 (acima de ~16k px a GPU deixa a imagem em branco) */
    const ctx1 = L.dpr > 1 && altura * L.dpr > 15000;
    if (ctx1) {
      const p2 = await (await browser.newContext({ viewport: { width: L.w, height: L.h }, deviceScaleFactor: 1, isMobile: L.mobile, hasTouch: L.mobile, locale: 'pt-BR' })).newPage();
      await instalaRotas(p2);
      await p2.goto(BASE + rota, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
      await p2.evaluate(() => document.documentElement.classList.add('nao-anima'));
      await p2.evaluate(() => document.querySelectorAll('.rev,.sv-r,.s-rev').forEach(e => e.classList.add('visto')));
      await p2.waitForTimeout(600);
      await p2.screenshot({ path: `${PASTA}/${nome}-2-inteira.png`, fullPage: true });
      await p2.context().close();
    } else {
      await page.screenshot({ path: `${PASTA}/${nome}-2-inteira.png`, fullPage: true });
    }

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
      return { w, scrollW: document.documentElement.scrollWidth, out: out.slice(0, 10) };
    });
    const fontes = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...new Set(Array.from(document.fonts).filter(f => f.status === 'loaded').map(f => `${f.family} ${f.style} ${f.weight}`))];
    });
    const titulos = await page.evaluate(() => Array.from(document.querySelectorAll('h1,h2')).slice(0, 14).map(h => {
      const it = h.querySelector('.pal.it,.sv-it');
      return `${h.tagName.toLowerCase()}:${(h.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48)}${it ? ' ✓it' : ''}`;
    }));
    const topo = await page.evaluate(() => !!document.querySelector('.sv-topo') && !!document.querySelector('.sv-pe'));
    console.log(JSON.stringify({ rota, largura: L.nome, altura, topoPe: topo, vazam, fontes, titulos, erros: erros.slice(0, 6), falhas: falhas.slice(0, 6) }));
    await ctx.close();
  }
}
await browser.close();
