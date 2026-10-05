/* O REPERTÓRIO NA TELA — 01/10/2026.

   Pedido do Louvor: o setlist do culto (Spotify, Deezer e uma playlist do
   YouTube) no link de quem serve. O que esta prova exige, no harness:

     1. Escala do líder: os três campos no dia, com o que está salvo; link
        de outra plataforma não grava e diz o que colar; Esc desiste; uma
        gravação que falha não apaga o que foi colado; a mensagem do grupo
        leva os links;
     2. Ajustes: a seção, com o estado dito em texto;
     3. página de quem serve: a seção Repertório com um culto por linha, os
        botões na ordem das plataformas, abrindo fora, nada do dia recusado,
        a entrada na barra, e o celular sem rolagem de lado.

   Roda com BASE=http://127.0.0.1:3500 node scripts/repertorio-tela.test.mjs */
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';
import { cultosQueVem, mesDe } from './dias-do-demo.mjs';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const OUT = '/tmp/repertorio-tela';
mkdirSync(OUT, { recursive: true });
const esperar = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0, feitas = 0;
const ok = (c, nome, extra = '') => { feitas++; if (!c) falhas++; console.log(`  ${c ? 'ok ' : 'FALHOU'} ${nome}${!c && extra ? '\n      ' + extra : ''}`); };
const SPOT = 'https://open.spotify.com/playlist/37i9dQZF1DX0XUfTFmNBRM';
const YT = 'https://youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG';
const nav = await chromium.launch({ executablePath: chromeDoContainer() });
async function ctx(w, h, toque) {
  const c = await nav.newContext({ viewport: { width: w, height: h }, isMobile: toque, hasTouch: toque, deviceScaleFactor: 2 });
  await c.route('**', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
  return c;
}
const semRolagemDeLado = p => p.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1);

try {
  /* 1. Escala do líder */
  for (const [w, h, toque, nome] of [[1440, 900, false, '1440'], [390, 844, true, '390']]) {
    const c = await ctx(w, h, toque); const p = await c.newPage();
    /* o primeiro culto que vem, onde o demo põe o repertório (era 03/10
       escrito na mão: ver scripts/dias-do-demo.mjs) */
    const D0 = cultosQueVem[0];
    await p.goto(`${BASE}/escala?demo=1&m=${mesDe(D0)}#d${D0}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.es-casca', { timeout: 20000 }); await esperar(2500);
    const dia = p.locator(`#d${D0}`);
    if (!(await dia.evaluate(e => e.open))) { await dia.locator('summary').click(); await esperar(300); }
    const rep = dia.getByRole('group', { name: 'Repertório' });
    ok(await rep.count() === 1, `${nome}: o dia tem o repertório`);
    const sp = rep.getByLabel('Spotify'), dz = rep.getByLabel('Deezer'), yt = rep.getByLabel('YouTube');
    ok(await sp.inputValue() === SPOT && await dz.inputValue() === '' && await yt.inputValue() === YT,
      `${nome}: os campos mostram o que está salvo`, [await sp.inputValue(), await dz.inputValue(), await yt.inputValue()].join(' | '));
    /* a altura é a do sistema: 44 no dedo, a densa só com mouse de verdade */
    const alturas = await rep.locator('input').evaluateAll(es => es.map(e => Math.round(e.getBoundingClientRect().height)));
    const hSistema = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.es')).getPropertyValue('--es-h')));
    ok(alturas.every(a => a >= hSistema) && (!toque || alturas.every(a => a >= 44)),
      `${nome}: campos na altura dos outros controles${toque ? ' (44 no dedo)' : ''}`, `${alturas.join(',')} / sistema ${hSistema}`);

    /* link de outra plataforma: não grava, diz o que colar */
    await dz.fill('https://golpe.com/deezer.com/x'); await dz.press('Tab'); await esperar(300);
    const erro = rep.locator('.es-erro-campo');
    ok(await erro.count() === 1 && /não é do Deezer/.test(await erro.innerText()), `${nome}: link de fora não grava e diz o que colar`,
      await erro.count() ? await erro.innerText() : 'sem frase');
    ok(await dz.getAttribute('aria-invalid') === 'true', `${nome}: o campo fica marcado como inválido`);
    await dz.focus(); await dz.press('Escape'); await esperar(200);
    ok(await dz.inputValue() === '' && await erro.count() === 0, `${nome}: Esc desiste e volta ao salvo`);

    /* o banco do harness não existe: a gravação cai, e o colado fica */
    const toasts = () => p.locator('.es-toast').allInnerTexts();
    await dz.fill('link.deezer.com/s/30AbC'); await dz.press('Tab'); await esperar(1200);
    ok(await dz.inputValue() === 'link.deezer.com/s/30AbC', `${nome}: sem conexão, o que foi colado fica no campo`, await dz.inputValue());
    ok((await toasts()).some(t => /Sem conexão/.test(t)), `${nome}: e o aviso diz que é a conexão`, (await toasts()).join(' | '));

    /* daqui em diante o banco responde, pela rota: o que a tela manda e o que
       ela faz com cada resposta */
    const pedidos = [];
    let resposta = { ok: false, erro: 'LINK_INVALIDO' };
    const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    await p.route('**/rest/v1/rpc/salvar_repertorio', r => {
      if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
      pedidos.push(r.request().postDataJSON());
      return r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(resposta) });
    });
    await p.locator('.es-toast').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    await dz.focus(); await dz.press('End'); await dz.type('X'); await dz.press('Tab'); await esperar(800);
    ok(await dz.inputValue() === 'link.deezer.com/s/30AbCX' && (await toasts()).some(t => /O banco recusou esse link/.test(t)),
      `${nome}: o banco recusa o link: o colado fica e a frase diz o que colar`, `${await dz.inputValue()} | ${(await toasts()).join(' | ')}`);

    resposta = { ok: true };
    await p.locator('.es-toast').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    await dz.fill('link.deezer.com/s/30AbC'); await dz.press('Tab'); await esperar(800);
    const ultimo = pedidos.at(-1) || {};
    ok(ultimo.p_repertorio?.deezer === 'https://link.deezer.com/s/30AbC' && ultimo.p_repertorio?.spotify === SPOT
      && ultimo.p_repertorio?.youtube === YT && !!ultimo.p_culto && !!ultimo.p_equipe,
      `${nome}: grava o link com https e sem perder os outros dois`, JSON.stringify(ultimo));
    ok(await dz.inputValue() === 'https://link.deezer.com/s/30AbC' && (await toasts()).some(t => t === 'Repertório salvo'),
      `${nome}: gravado, o campo mostra o link inteiro e o aviso confirma`, `${await dz.inputValue()} | ${(await toasts()).join(' | ')}`);

    /* a mensagem do grupo leva os links, na ordem das plataformas */
    await dia.getByRole('button', { name: 'Mandar nos grupos' }).click(); await esperar(400);
    const msgs = await dia.locator('.es-mg-linha a.es-btn').evaluateAll(as => as.map(a => decodeURIComponent(a.getAttribute('href').split('?text=')[1] || '')));
    ok(msgs.length >= 1 && msgs.every(t => t.includes(`REPERTÓRIO\nSpotify: ${SPOT}\nDeezer: https://link.deezer.com/s/30AbC\nYouTube: ${YT}`)),
      `${nome}: toda mensagem do dia leva o setlist, já com o Deezer`, (msgs[0] || '').slice(-320));
    await dia.getByRole('button', { name: 'Mandar nos grupos' }).click().catch(() => {}); await esperar(300);

    /* apagar o campo tira só aquele link */
    await p.locator('.es-toast').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    await dz.fill(''); await dz.press('Tab'); await esperar(800);
    const tirado = pedidos.at(-1) || {};
    ok(!('deezer' in (tirado.p_repertorio || {})) && tirado.p_repertorio?.spotify === SPOT && (await toasts()).some(t => t === 'Link tirado do repertório'),
      `${nome}: apagar o campo tira só aquele link`, `${JSON.stringify(tirado)} | ${(await toasts()).join(' | ')}`);
    ok(pedidos.length === 3, `${nome}: uma gravação por saída de campo, nenhuma a mais`, String(pedidos.length));
    ok(await semRolagemDeLado(p), `${nome}: a escala não rola de lado`);
    await rep.screenshot({ path: `${OUT}/escala-repertorio-${nome}.png` });
    await c.close();
  }

  /* 2. Ajustes */
  for (const [w, h, toque, nome] of [[1440, 900, false, '1440'], [390, 844, true, '390']]) {
    const c = await ctx(w, h, toque); const p = await c.newPage();
    await p.goto(`${BASE}/ajustes?demo=1#repertorio`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.es-casca', { timeout: 20000 }); await esperar(2000);
    const sec = p.locator('#repertorio');
    ok(await sec.count() === 1, `${nome}: Ajustes tem a seção Repertório`);
    const bt = sec.getByRole('button', { name: 'Desligar o repertório' });
    ok(await bt.count() === 1 && await bt.getAttribute('aria-pressed') === 'true', `${nome}: o botão diz o que faz e o estado`);
    ok(/Ligado neste ministério\./.test(await sec.innerText()), `${nome}: o estado também em texto`);
    ok(await semRolagemDeLado(p), `${nome}: Ajustes não rola de lado`);
    await sec.screenshot({ path: `${OUT}/ajustes-repertorio-${nome}.png` });
    await c.close();
  }

  /* 3. Página de quem serve */
  for (const [w, h, toque, nome] of [[1440, 900, false, '1440'], [390, 844, true, '390']]) {
    const c = await ctx(w, h, toque); const p = await c.newPage();
    await p.goto(`${BASE}/eu/demo?demo=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.vol-in', { timeout: 20000 }); await esperar(2000);
    const sec = p.locator('#repertorio');
    ok(await sec.count() === 1, `${nome}: a página tem a seção Repertório`);
    const linhas = sec.locator('.vol-rep');
    ok(await linhas.count() === 2, `${nome}: um culto por linha, e nada do dia recusado`, String(await linhas.count()));
    const bts = await linhas.nth(0).locator('a').evaluateAll(as => as.map(a => [a.innerText.trim(), a.getAttribute('href'), a.target, a.rel]));
    ok(bts.map(b => b[0]).join(',') === 'Spotify,Deezer,YouTube', `${nome}: na ordem das plataformas`, bts.map(b => b[0]).join(','));
    ok(bts.every(b => b[1].startsWith('https://') && b[2] === '_blank' && /noopener/.test(b[3])), `${nome}: os botões abrem fora, sem passar a página adiante`);
    const seg = await linhas.nth(1).locator('a').allInnerTexts();
    ok(seg.join(',') === 'YouTube', `${nome}: setlist parcial mostra só o que tem`, seg.join(','));
    ok(await p.locator('.vol-barra a[href="#repertorio"]').count() === 1, `${nome}: a barra leva ao repertório`);
    const caixas = await linhas.nth(0).locator('a').evaluateAll(as => as.map(a => { const r = a.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height)]; }));
    ok(caixas.every(x => x[1] >= 44), `${nome}: botões com altura de toque`, JSON.stringify(caixas));
    ok(new Set(caixas.map(x => x[0])).size === 1, `${nome}: as três plataformas na mesma linha`, JSON.stringify(caixas));
    ok(await semRolagemDeLado(p), `${nome}: a página não rola de lado`);
    await sec.screenshot({ path: `${OUT}/voluntario-repertorio-${nome}.png` });
    await c.close();
  }
} catch (e) {
  falhas++; console.log('  FALHOU (exceção)', e?.message || e);
} finally {
  await nav.close();
}
console.log(`repertorio-tela: ${feitas - falhas}/${feitas} ${falhas ? 'FALHOU' : 'ok'}`);
process.exit(falhas ? 1 : 0);
