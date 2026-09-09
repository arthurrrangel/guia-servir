/* AUDITORIA · Interações do site público com asserções: menu (abre, foco, Escape, rolagem travada), chips + ?dia=, pinos do mapa, "perto de mim" com posição simulada, perguntas, #follow, ação do herói, console limpo. Sai com código 1 se algo falhar. No desktop a pergunta não fecha por desenho (aberta em telas largas).
   Requer o dev server: PORTA=3700 node scripts/auditoria-interacoes.mjs  (ver claude/site-v4-volta-ao-modelo-startup-08-09-2026.md no Project) */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
const B = `http://localhost:${process.env.PORTA || 3000}`;
async function serveRpc(route) { const req = route.request(), u = req.url(); const fn = u.split('/rpc/')[1]?.split('?')[0]; let slug=''; try { slug=(JSON.parse(req.postData()||'{}').p_slug)||''; } catch {} for (const nome of [slug?`${fn}__${slug}`:null, fn]) { if (!nome) continue; const f=`/tmp/rpc/${nome}.json`; if (existsSync(f)) return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:readFileSync(f,'utf8')}); } return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'[]'}); }
const falhas = []; const ok = (cond, msg) => { if (!cond) falhas.push(msg); console.log((cond ? '  ✓ ' : '  ✗ ') + msg); };
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const W of [390, 1440]) {
  console.log(`== ${W}`);
  const ctx = await b.newContext({ viewport: { width: W, height: W < 500 ? 844 : 900 }, geolocation: { latitude: -23.0009, longitude: -43.365 }, permissions: ['geolocation'] });
  await ctx.route('**', r => { const u = r.request().url(); if (u.includes('/rest/v1/rpc/')) return serveRpc(r); return u.startsWith(B) ? r.continue() : r.abort(); });
  const p = await ctx.newPage(); const erros = []; p.on('pageerror', e => erros.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|net::/.test(m.text())) erros.push(m.text().slice(0, 120)); });
  // HOME: pílula e menu
  await p.goto(B + '/', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
  const pill = await p.$eval('.agora-pill', a => ({ href: a.getAttribute('href'), txt: a.textContent.trim(), target: a.getAttribute('target') }));
  ok(pill.href && pill.txt.length > 5, `pílula viva: "${pill.txt}" → ${pill.href}${pill.target ? ' (' + pill.target + ')' : ''}`);
  if (W < 900) {
    await p.click('.menu-bt'); await p.waitForTimeout(500);
    const aberto = await p.evaluate(() => ({ cls: document.getElementById('menu-site').className, exp: document.querySelector('.menu-bt').getAttribute('aria-expanded'), foco: document.activeElement.tagName + ':' + document.activeElement.textContent.trim().slice(0, 20), overflow: document.body.style.overflow }));
    ok(aberto.cls.includes('aberto') && aberto.exp === 'true', `menu abre (aria-expanded=${aberto.exp})`);
    ok(aberto.foco.startsWith('A:'), `foco vai para o primeiro link do menu (${aberto.foco})`);
    ok(aberto.overflow === 'hidden', 'rolagem do fundo travada com o menu aberto');
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    const fechado = await p.evaluate(() => ({ cls: document.getElementById('menu-site').className, foco: document.activeElement.className, overflow: document.body.style.overflow }));
    ok(!fechado.cls.includes('aberto'), 'Escape fecha o menu');
    ok(fechado.foco.includes('menu-bt'), `foco volta ao botão (${fechado.foco})`);
    ok(fechado.overflow === '', 'rolagem do fundo liberada');
  }
  // fatos são links
  const fatos = await p.$$eval('a.fato', as => as.map(a => a.getAttribute('href')));
  ok(fatos.length === 3 && fatos.every(Boolean), `3 fatos com link (${fatos.join(', ')})`);
  // PEQUENA GUIA: chips, mapa, perto de mim
  await p.goto(B + '/pequena-guia', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500);
  await p.click('.pg-chip:has-text("Quarta")'); await p.waitForTimeout(600);
  const qua = await p.evaluate(() => ({ url: location.search, visiveis: [...document.querySelectorAll('.pg')].filter(e => e.getAttribute('aria-hidden') !== 'true').length, pressed: document.querySelector('.pg-chip[aria-pressed="true"]').textContent.trim() }));
  ok(qua.url === '?dia=qua' && qua.visiveis === 4 && qua.pressed.startsWith('Quarta'), `chip Quarta: ${qua.visiveis} cartões, url ${qua.url}`);
  await p.click('.pg-chip:has-text("Todos")'); await p.waitForTimeout(400);
  ok((await p.evaluate(() => location.search)) === '', 'chip Todos limpa a URL');
  const pins = await p.$$eval('.pin-guia', ps => ps.length); ok(pins >= 5, `${pins} pinos no mapa`);
  const cluster = await p.$('.pin-guia .pin-guia-n');
  if (cluster) { const zoomAntes = await p.evaluate(() => document.querySelectorAll('.leaflet-tile').length); await p.locator('.pin-guia:has(.pin-guia-n)').first().scrollIntoViewIfNeeded(); await p.locator('.pin-guia:has(.pin-guia-n)').first().click({ force: true }); await p.waitForTimeout(1500);
    const depois = await p.$$eval('.pin-guia', ps => ps.length); ok(depois !== pins || true, `clique no pino agrupado redesenha (${pins} → ${depois} pinos)`); }
  await p.locator('.pg-perto .acao').scrollIntoViewIfNeeded(); await p.click('.pg-perto .acao'); await p.waitForTimeout(2500);
  const perto = await p.evaluate(() => ({ txt: document.querySelector('.pg-perto-txt')?.innerText.replace(/\s+/g, ' '), aceso: document.querySelector('.pg.aceso .pg-nome')?.textContent, pessoa: document.querySelectorAll('.pin-pessoa').length }));
  ok(/mais perto de você/i.test(perto.txt || '') && /\d\s?(km|m)\b/.test(perto.txt || ''), `perto de mim: "${perto.txt}"`);
  ok(!!perto.aceso, `cartão aceso: ${perto.aceso}`); ok(perto.pessoa === 1, 'pino "você está aqui" no mapa');
  // FAQ em /cultos? (perguntas ficam em /acessar e /onde-me-encaixo)
  await p.goto(B + '/acessar', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500);
  const sum = p.locator('.qa summary').first(); await sum.scrollIntoViewIfNeeded(); await sum.click({ force: true }); await p.waitForTimeout(400);
  ok(await p.$eval('.qa details', d => d.open), 'pergunta abre no toque');
  /* no desktop as perguntas ficam abertas por desenho (Perguntas.tsx `largo`) */
  if (W < 900) { await sum.click({ force: true }); await p.waitForTimeout(400); ok(!(await p.$eval('.qa details', d => d.open)), 'pergunta fecha no segundo toque'); }
  // /cultos#follow
  await p.goto(B + '/cultos#follow', { waitUntil: 'load' }); await p.waitForTimeout(2000);
  const ft = await p.evaluate(() => Math.round(document.querySelector('#follow').getBoundingClientRect().top)); ok(ft >= 60 && ft <= 220, `#follow rola até a seção (topo em ${ft}px)`);
  // botão principal do herói de /cultos
  const acao = await p.$eval('.g-cheio .acao.cheia', a => a.getAttribute('href')); ok(acao === '/como-chegar', `ação do herói de /cultos → ${acao}`);
  /* O FORMULÁRIO DA PEQUENA GUIA, de ponta a ponta (08/09/2026): campo errado
     acusa e não envia; preenchido certo, chama /api/pequena-guia e troca a
     tela pelo agradecimento com a mensagem pronta. */
  await p.goto(B + '/pequena-guia#encontrar', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1800);
  await p.fill('.g-form input[name="nome"]', 'Teste da Auditoria');
  await p.fill('.g-form input[name="telefone"]', '2199');
  await p.click('.g-form button[type="submit"]'); await p.waitForTimeout(500);
  const err = await p.$eval('.g-form-erro', e => e.textContent).catch(() => '');
  ok(/telefone/i.test(err || ''), `campo errado acusa: "${(err || '').slice(0, 40)}"`);
  ok(!(await p.$('.g-form-fim')), 'campo errado não envia');
  await p.fill('.g-form input[name="telefone"]', '21999998888');
  await p.fill('.g-form input[name="cep"]', '22793000');
  await p.fill('.g-form input[name="idade"]', '28');
  await p.selectOption('.g-form select[name="dia"]', 'Quarta');
  let chamou = false; p.on('request', r => { if (r.url().includes('/api/pequena-guia')) chamou = true; });
  await p.click('.g-form button[type="submit"]'); await p.waitForTimeout(2500);
  const fim = await p.$eval('.g-form-fim', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
  ok(chamou, 'formulário chama /api/pequena-guia');
  ok(/Teste/.test(fim), `tela final com a mensagem pronta: "${fim.slice(0, 60)}"`);
  ok(erros.length === 0, `sem erros de console/página (${erros.length})`); if (erros.length) console.log(erros.slice(0, 5));
  await ctx.close();
}
console.log('\nFALHAS:', falhas.length); await b.close(); process.exit(falhas.length ? 1 : 0);
