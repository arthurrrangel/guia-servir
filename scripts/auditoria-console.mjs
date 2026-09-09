/* =============================================================================
   AUDITORIA: CONSOLE E REDE

   Abre cada rota pública em duas larguras e coleta o que o navegador reclama:
   erros de página (exceções), erros e avisos de console (inclui os de
   hidratação do React, que são o defeito invisível mais comum num site Next),
   e requisições que falharam (4xx/5xx, ou que nem responderam). Um site
   "polido" com um aviso de hidratação no console não está polido.

   Uso: PORTA=3700 node scripts/auditoria-console.mjs [rotas...]
   Sai com 1 se houver qualquer problema.
   ============================================================================= */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';

const PORTA = process.env.PORTA || '3000';
const BASE = `http://localhost:${PORTA}`;
const ROTAS = process.argv.slice(2).length ? process.argv.slice(2) : [
  '/', '/cultos', '/sobre', '/servir', '/servir/onde-me-encaixo', '/servir/midia',
  '/pequena-guia', '/pequena-guia?dia=qua', '/como-chegar', '/acessar', '/guia-church-tv',
  '/privacidade', '/entrar', '/eu', '/uma-rota-que-nao-existe',
];
const LARGURAS = [390, 1280];

/* ruído conhecido que não é defeito do site */
const IGNORAR = [
  /Download the React DevTools/,
  /\[Fast Refresh\]/,
  /webpack-hmr/, /_next\/webpack-hmr/,
  /favicon\.ico.*404/,
];

/* o contêiner não alcança a internet: as chamadas ao banco recebem as
   fixtures de /tmp/rpc (as mesmas dos outros scripts) e o resto de fora é
   abortado sem contar como falha do site */
async function serveRpc(route) {
  const req = route.request(), u = req.url();
  const fn = u.split('/rpc/')[1]?.split('?')[0];
  let slug = ''; try { slug = JSON.parse(req.postData() || '{}').p_slug || ''; } catch {}
  for (const nome of [slug ? `${fn}__${slug}` : null, fn]) {
    if (!nome) continue;
    const f = `/tmp/rpc/${nome}.json`;
    if (existsSync(f)) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: readFileSync(f, 'utf8') });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' });
}

const nav = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
let problemas = 0;
for (const rota of ROTAS) {
  for (const W of LARGURAS) {
    const ctx = await nav.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 1 });
    await ctx.route('**', r => { const u = r.request().url(); if (u.includes('/rest/v1/rpc/')) return serveRpc(r); return u.startsWith(BASE) ? r.continue() : r.abort(); });
    const pg = await ctx.newPage();
    const achados = [];
    pg.on('pageerror', e => achados.push(`EXCEÇÃO ${e.message.split('\n')[0]}`));
    pg.on('console', m => {
      const t = m.type();
      if (t !== 'error' && t !== 'warning') return;
      const txt = m.text();
      if (IGNORAR.some(r => r.test(txt))) return;
      /* recurso de fora abortado pelo próprio script (tiles do mapa), e o
         documento 404 da rota inexistente: não são defeitos do site */
      const onde = m.location()?.url || '';
      if (/Failed to load resource/.test(txt) && (!onde.startsWith(BASE) || (rota === '/uma-rota-que-nao-existe' && onde === BASE + rota))) return;
      achados.push(`CONSOLE.${t} ${txt.split('\n').slice(0, 2).join(' ⏎ ').slice(0, 300)}`);
    });
    pg.on('requestfailed', r => {
      const u = r.url();
      if (/webpack-hmr/.test(u)) return;
      /* tiles de mapa e hosts externos: o contêiner não alcança a internet */
      if (!u.startsWith(BASE)) return;
      achados.push(`REDE.falhou ${u.replace(BASE, '')} ${r.failure()?.errorText || ''}`);
    });
    pg.on('response', r => {
      const u = r.url();
      if (!u.startsWith(BASE)) return;
      const s = r.status();
      if (s >= 400 && !(rota === '/uma-rota-que-nao-existe' && u === BASE + rota)) achados.push(`REDE.${s} ${u.replace(BASE, '')}`);
    });
    try {
      await pg.goto(BASE + rota, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await pg.waitForTimeout(1500);
    } catch (e) { achados.push(`GOTO ${e.message.split('\n')[0]}`); }
    /* rola até o fim para disparar lazy, reveals e hidratações tardias */
    await pg.evaluate(async () => {
      document.documentElement.style.scrollBehavior = 'auto'; /* o site rola suave; aqui precisa chegar ao fim de fato */
      const h = document.documentElement.scrollHeight;
      for (let y = 0; y < h; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); }
      window.scrollTo(0, 0);
    });
    await pg.waitForTimeout(600);
    /* abre e fecha o menu, quando houver, para pegar erros de interação */
    const menu = pg.locator('.menu-bt').first();
    if (await menu.count()) {
      await menu.click().catch(() => {});
      await pg.waitForTimeout(250);
      await pg.keyboard.press('Escape').catch(() => {});
      await pg.waitForTimeout(250);
    }
    if (achados.length) {
      problemas += achados.length;
      console.log(`\n${rota} @${W}`);
      for (const a of [...new Set(achados)]) console.log('  ' + a);
    }
    await ctx.close();
  }
}
await nav.close();
console.log(`\n${problemas ? `${problemas} problema(s)` : 'console e rede limpos'} em ${ROTAS.length} rotas × ${LARGURAS.length} larguras`);
process.exit(problemas ? 1 : 0);
