/* GRUPOS POR ÁREA E A PORTA DO LINK DO GRUPO, NA TELA — 01/10/2026.

   Pedido do Arthur: a escala sai para cada grupo do WhatsApp só com a parte
   dele, com o link para cada pessoa confirmar. Esta bateria confere, no app
   de desenvolvimento com o Supabase FALSO (toda gravação falha, que é o caso
   que interessa):
     · o painel "Mandar nos grupos" (geral + cada grupo, link do ministério,
       nenhum link pessoal, marca de enviado, sábado sem os postos de domingo);
     · o editor de grupos nos Ajustes (falha volta ao salvo sem apagar o que se
       digita ao lado, foco preservado, nome repetido recusado);
     · a porta /confirmar e /disponibilidade (aparelho conhecido vai direto,
       desconhecido vai para o PIN, vínculo de outro ministério não abre);
     · a porta da equipe dizendo para que a pessoa veio.
   Roda com BASE=http://127.0.0.1:3500 node scripts/grupos-tela.test.mjs */
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';
import { fimDeSemana, mesDe } from './dias-do-demo.mjs';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const OUT = '/tmp/grupos-tela';
mkdirSync(OUT, { recursive: true });
const esperar = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0, feitas = 0;
const ok = (c, nome, extra = '') => { feitas++; if (!c) falhas++; console.log(`  ${c ? 'ok ' : 'FALHOU'} ${nome}${!c && extra ? '\n      ' + extra : ''}`); };
const nav = await chromium.launch({ executablePath: chromeDoContainer() });
async function ctx(w, h, toque) {
  const c = await nav.newContext({ viewport: { width: w, height: h }, isMobile: toque, hasTouch: toque, deviceScaleFactor: 2 });
  await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await c.route('**', async r => {
    const u = r.request().url();
    if (u.startsWith(BASE)) return r.continue();
    /* gravação de config falha devagar, como na rede ruim da igreja */
    if (/\/rest\/v1\/config/.test(u) && r.request().method() !== 'GET') await esperar(1500);
    return r.abort();
  });
  return c;
}
try {
  /* 1. Escala: o painel do dia */
  for (const [w, h, toque, nome] of [[1440, 900, false, '1440'], [390, 844, true, '390']]) {
    const c = await ctx(w, h, toque); const p = await c.newPage();
    /* o primeiro fim de semana que vem (era 03 e 04/10 escrito na mão, e a
       prova reprovou na virada do dia: ver scripts/dias-do-demo.mjs) */
    const { sab: SAB, dom: DOM } = fimDeSemana;
    await p.goto(`${BASE}/escala?demo=1&m=${mesDe(DOM)}#d${DOM}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.es-casca', { timeout: 20000 }); await esperar(2500);
    const dia = p.locator(`#d${DOM}`);
    const bt = dia.getByRole('button', { name: 'Mandar nos grupos' });
    ok(await bt.count() === 1, `${nome}: o dia tem "Mandar nos grupos"`);
    const classe = await bt.getAttribute('class');
    ok(!/es-txt/.test(classe || ''), `${nome}: com grupos, ele é a ação de contorno`, classe);
    await bt.click(); await esperar(400);
    const linhas = await dia.locator('.es-mg-linha .es-mg-tit b').allInnerTexts();
    ok(linhas.join('|') === 'Grupo geral|Mídia · Projeção e luz|Mídia · Foto e vídeo|Mídia · Transmissão', `${nome}: geral + 3 grupos`, linhas.join('|'));
    const hrefs = await dia.locator('.es-mg-linha a.es-btn').evaluateAll(as => as.map(a => decodeURIComponent(a.getAttribute('href').split('?text=')[1] || '')));
    ok(hrefs.length === 4 && hrefs.every(t => t.includes(`Confirma por aqui: ${BASE}/confirmar/midia`)), `${nome}: as 4 mensagens fecham com o link do ministério`);
    ok(hrefs[2].includes('· Mídia · Foto e vídeo') && hrefs[2].includes('FOTO') && !hrefs[2].includes('PROJEÇÃO'), `${nome}: a do grupo leva só a parte dele`, hrefs[2].slice(0, 300));
    ok(hrefs.every(t => !/\/eu\/tok/.test(t)), `${nome}: nenhum link pessoal em mensagem de grupo`);
    await dia.locator('.es-mg-linha').nth(1).getByRole('button', { name: /Copiar a mensagem/ }).click(); await esperar(500);
    ok(/enviado \d\d:\d\d/.test(await dia.locator('.es-mg-linha').nth(1).innerText()), `${nome}: copiar marca enviado com a hora`);
    await dia.locator('.es-mg').screenshot({ path: `${OUT}/painel-dia-${nome}.png` });
    await dia.screenshot({ path: `${OUT}/dia-inteiro-${nome}.png` });
    /* sábado: o grupo só de domingo fica sem posto */
    const sab = p.locator(`#d${SAB}`);
    if (!(await sab.evaluate(e => e.open))) { await sab.locator('summary').click(); await esperar(300); }
    await sab.getByRole('button', { name: 'Mandar nos grupos' }).click(); await esperar(300);
    const tTrans = await sab.locator('.es-mg-linha').nth(3).innerText();
    ok(/nenhuma função deste grupo neste dia/.test(tTrans) && !(await sab.locator('.es-mg-linha').nth(3).locator('a').count()),
      `${nome}: no sábado, Transmissão aparece sem posto e sem botão`, tTrans);
    await c.close();
  }

  /* 2. Ajustes: o editor */
  for (const [w, h, toque, nome] of [[1440, 900, false, '1440'], [390, 844, true, '390']]) {
    const c = await ctx(w, h, toque); const p = await c.newPage();
    await p.goto(`${BASE}/ajustes?demo=1#grupos`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#grupos .es-gz', { timeout: 20000 }); await esperar(1500);
    const sec = p.locator('#grupos');
    const nomes = await sec.locator('.es-gz-nome input').evaluateAll(is => is.map(i => i.value));
    ok(nomes.length === 3, `${nome}: os 3 grupos aparecem nos Ajustes`, nomes.join('|'));
    const geral = await sec.locator('.es-gz-geral').innerText();
    ok(/APOIO NO BANHEIRO/.test(geral), `${nome}: a função sem grupo aparece como "só no geral"`, geral);
    await sec.scrollIntoViewIfNeeded();
    await sec.screenshot({ path: `${OUT}/ajustes-grupos-${nome}.png` });
    /* no harness toda gravação falha: a ficha volta ao salvo, com aviso */
    const ficha = sec.locator('.es-gz-grupo').first().locator('.es-gz-fn', { hasText: 'EDIÇÃO' });
    ok(await ficha.getAttribute('aria-pressed') === 'false', `${nome}: EDIÇÃO não está em Projeção e luz`);
    await ficha.click(); await esperar(150);
    ok(await sec.locator('.es-gz-grupo').first().locator('.es-gz-fn', { hasText: 'EDIÇÃO' }).getAttribute('aria-pressed') === 'true', `${nome}: o toque marca na hora`);
    /* enquanto a gravação está no ar, a pessoa digita o nome de um grupo novo */
    await sec.getByPlaceholder('Nome do grupo, ex.: Banda').fill('Som e palco');
    await esperar(2500);
    ok(await sec.locator('.es-gz-grupo').first().locator('.es-gz-fn', { hasText: 'EDIÇÃO' }).getAttribute('aria-pressed') === 'false', `${nome}: a gravação falhou e a ficha voltou ao salvo`);
    ok(await sec.getByPlaceholder('Nome do grupo, ex.: Banda').inputValue() === 'Som e palco', `${nome}: a falha não apaga o que se digita ao lado`);
    const avisoTxt = await p.locator('body').innerText();
    ok(/voltou ao que está salvo/.test(avisoTxt) && !/Nada do que você fez se perdeu/.test(avisoTxt), `${nome}: o aviso diz que voltou ao salvo, e não que nada se perdeu`);
    /* nome repetido não entra */
    await sec.getByPlaceholder('Nome do grupo, ex.: Banda').fill('mídia · foto e vídeo');
    await sec.getByRole('button', { name: 'Adicionar grupo' }).click(); await esperar(300);
    ok(await sec.locator('.es-gz-grupo').count() === 3 && /Já existe o grupo/.test(await p.locator('body').innerText()),
      `${nome}: grupo com nome repetido não é criado, e o aviso diz por quê`);
    /* o foco fica na ficha tocada, mesmo depois da falha */
    const f2 = sec.locator('.es-gz-grupo').nth(1).locator('.es-gz-fn', { hasText: 'HEAD' });
    await f2.focus(); await p.keyboard.press('Space'); await esperar(2600);
    const focado = await p.evaluate(() => document.activeElement?.textContent || '');
    ok(focado.includes('HEAD'), `${nome}: depois da falha o foco continua na ficha`, focado);
    await c.close();
  }

  /* 3. A porta do link do grupo */
  {
    const c = await ctx(390, 844, true); const p = await c.newPage();
    await p.goto(`${BASE}/confirmar/midia`, { waitUntil: 'domcontentloaded' });
    await p.waitForURL(/\/equipe\/midia\?ir=confirmar/, { timeout: 8000 }).catch(() => {});
    ok(/\/equipe\/midia\?ir=confirmar$/.test(p.url()), 'aparelho desconhecido vai para a porta da equipe, com o destino', p.url());
    await p.evaluate(() => localStorage.setItem('escala.meus-vinculos', JSON.stringify({ midia: 'tokgiovanarosalem' })));
    await p.goto(`${BASE}/confirmar/midia`, { waitUntil: 'domcontentloaded' });
    await p.waitForURL(/\/eu\//, { timeout: 8000 }).catch(() => {});
    ok(p.url() === `${BASE}/eu/tokgiovanarosalem?porta=c&m=midia#confirmar`, 'aparelho que já conhece a pessoa NESTE ministério vai direto à confirmação', p.url());
    await p.goto(`${BASE}/disponibilidade/midia`, { waitUntil: 'domcontentloaded' });
    await p.waitForURL(/\/eu\//, { timeout: 8000 }).catch(() => {});
    ok(p.url() === `${BASE}/eu/tokgiovanarosalem?porta=d&m=midia#quando-posso`, 'o link de disponibilidade vai direto aos dias', p.url());
    /* o token de outro ministério não abre esta porta */
    await p.goto(`${BASE}/confirmar/louvor`, { waitUntil: 'domcontentloaded' });
    await p.waitForURL(/\/equipe\/louvor/, { timeout: 8000 }).catch(() => {});
    ok(/\/equipe\/louvor\?ir=confirmar$/.test(p.url()), 'o vínculo da Mídia não abre o link do Louvor', p.url());
    /* lixo no armazenamento não vira endereço */
    await p.evaluate(() => localStorage.setItem('escala.meus-vinculos', JSON.stringify({ midia: '../../x?y' })));
    await p.goto(`${BASE}/confirmar/midia`, { waitUntil: 'domcontentloaded' });
    await p.waitForURL(/\/equipe\/midia/, { timeout: 8000 }).catch(() => {});
    ok(/\/equipe\/midia\?ir=confirmar$/.test(p.url()), 'token inválido no aparelho é ignorado', p.url());
    await c.close();
  }

  /* 4. A porta da equipe, chegando pelo link do grupo (harness) */
  {
    const c = await ctx(390, 844, true); const p = await c.newPage();
    await p.goto(`${BASE}/equipe/midia?demo=lista&ir=confirmar`, { waitUntil: 'domcontentloaded' });
    await esperar(3000);
    const sub = await p.locator('.eu-sub').first().innerText().catch(() => '');
    ok(/confirmar a sua escala/.test(sub), 'a porta da equipe diz para que a pessoa veio', sub);
    await p.screenshot({ path: `${OUT}/porta-equipe-390.png` });
    await c.close();
  }
} catch (e) { falhas++; console.log('ERRO', String(e).slice(0, 600)); }
finally { await nav.close(); }
console.log(`\ngrupos-tela: ${feitas - falhas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
