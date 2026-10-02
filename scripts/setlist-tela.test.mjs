/* =============================================================================
   O SETLIST LOGO ABAIXO DOS LINKS, NA PÁGINA DE QUEM SERVE — 02/10/2026

   Sugestão do ministério de Louvor: logo abaixo dos links do setlist, a
   lista com o tom e o BPM de cada música e as observações. O que esta prova
   exige, a 390 e a 1440, na variante `?demo=setlist` (alguém do Louvor):

     1. no bloco de cada culto do Repertório, DEPOIS dos botões das
        plataformas, o "Setlist": as músicas numeradas na ordem do culto, com
        o tom em destaque e o BPM; a cifra abre fora;
     2. as "Observações": a nota de cada música, com o número dela;
     3. a ordem do próprio ministério que é só música não se repete na seção
        "Ordem do culto"; a que tem momentos (abertura, palavra) continua lá;
     4. sem ordem, nada muda (a variante de sempre não ganha bloco nenhum), e
        a ordem de OUTRO ministério não vira setlist no meu repertório;
     5. nada rola de lado, e a cifra tem tamanho de toque.

   Roda com BASE=http://127.0.0.1:3500 node scripts/setlist-tela.test.mjs */
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const OUT = '/tmp/setlist-tela';
mkdirSync(OUT, { recursive: true });
const esperar = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0, feitas = 0;
const ok = (c, nome, extra = '') => { feitas++; if (!c) falhas++; console.log(`  ${c ? 'ok ' : 'FALHOU'} ${nome}${!c && extra ? '\n      ' + extra : ''}`); };
const nav = await chromium.launch({ executablePath: chromeDoContainer() });
async function abrir(w, h, toque, variante) {
  const c = await nav.newContext({ viewport: { width: w, height: h }, isMobile: toque, hasTouch: toque, deviceScaleFactor: 2 });
  await c.route('**', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
  const p = await c.newPage();
  await p.goto(`${BASE}/eu/x?demo=${variante}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.vol-in', { timeout: 60000 });
  await p.waitForSelector('#repertorio', { timeout: 20000 }).catch(() => {});
  await esperar(500);
  return { c, p };
}

try {
  for (const [w, h, toque, nome] of [[390, 844, true, '390'], [1440, 900, false, '1440']]) {
    const { c, p } = await abrir(w, h, toque, 'setlist');
    const blocos = p.locator('#repertorio .vol-rep');
    ok(await blocos.count() === 2, `${nome}: dois cultos no repertório`, String(await blocos.count()));

    /* 1 · o setlist depois dos botões */
    const b1 = blocos.nth(0);
    const ordemNoBloco = await b1.evaluate(el => {
      const botoes = el.querySelector('.vol-btns'), sl = el.querySelector('.vol-setlist');
      return !!(botoes && sl && (botoes.compareDocumentPosition(sl) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    ok(ordemNoBloco, `${nome}: o setlist vem logo abaixo dos links`);
    const linhas = b1.locator('.vol-setlist li.vol-sl');
    ok(await linhas.count() === 4, `${nome}: as quatro músicas`, String(await linhas.count()));
    const lidas = await linhas.evaluateAll(ls => ls.map(l => [
      l.querySelector('.vol-oi-hora')?.textContent?.trim(),
      l.querySelector('.vol-oi-tit')?.textContent?.trim(),
      l.querySelector('.vol-oi-meta')?.textContent?.replace(/\s+/g, ' ').trim(),
    ]));
    ok(JSON.stringify(lidas) === JSON.stringify([
      ['1', 'Canção da Manhã', 'Tom E · 137 BPM'],
      ['2', 'Rio de Graça', 'Tom D · 65 BPM'],
      ['3', 'Luz no Caminho', 'Tom C · 62 BPM'],
      ['4', 'Só a Tua Presença', 'Tom C · 65 BPM'],
    ]), `${nome}: número, música, tom e BPM, na ordem do culto`, JSON.stringify(lidas));
    ok(await linhas.nth(0).locator('.vol-oi-meta b').innerText() === 'E', `${nome}: o tom vem em destaque`);
    const cifra = linhas.nth(0).locator('a.vol-oi-cifra');
    ok(await cifra.count() === 1 && await cifra.getAttribute('target') === '_blank'
       && /noopener/.test(await cifra.getAttribute('rel')) && /noreferrer/.test(await cifra.getAttribute('rel')),
      `${nome}: a cifra abre fora, sem passar a página adiante`);
    ok(/cifraclub\.com\.br/.test(await cifra.getAttribute('aria-label')), `${nome}: e o leitor de tela ouve o site`);
    const caixa = await cifra.boundingBox();
    ok(caixa && caixa.height >= 44 && caixa.width >= 44, `${nome}: a cifra tem tamanho de toque`, JSON.stringify(caixa));
    ok(await linhas.nth(1).locator('a.vol-oi-cifra').count() === 0, `${nome}: música sem cifra, sem botão`);

    /* 2 · as observações */
    const obs = await b1.locator('.vol-setlist-obs p').allInnerTexts();
    ok(obs.length === 1 && obs[0] === '3. Luz no Caminho: Medley começando da ponte de Manhã de Sol (Coral Modelo).',
      `${nome}: a observação vem com o número da música`, JSON.stringify(obs));
    ok(!/[—–]/.test(await b1.innerText()), `${nome}: sem travessão`);

    /* o segundo culto: a ordem tem momentos; o setlist só das músicas */
    const b2 = blocos.nth(1);
    const t2 = await b2.locator('.vol-setlist li.vol-sl .vol-oi-tit').allInnerTexts();
    ok(t2.join('|') === 'Canção da Manhã|Rio de Graça|Luz no Caminho', `${nome}: no outro culto, só as músicas da ordem`, t2.join('|'));
    ok((await b2.locator('.vol-setlist-obs p').allInnerTexts()).join('|') === '1. Canção da Manhã: Começa só voz e teclado',
      `${nome}: e a observação dele`);

    /* 3 · a ordem do culto não repete o que já está no repertório */
    const ordens = p.locator('#ordem .vol-ordem');
    ok(await ordens.count() === 1, `${nome}: a seção "Ordem do culto" fica só com a ordem que tem momentos`, String(await ordens.count()));
    ok(/Abertura/.test(await ordens.first().innerText()), `${nome}: e é a linha do tempo do culto`);

    /* 5 · nada rola de lado */
    ok(await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth + 1), `${nome}: sem rolagem de lado`);
    if (nome === '390') { await b1.scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/setlist-${nome}.png` }); }
    await c.close();
  }

  /* 4 · sem ordem, nada muda; ordem de outro ministério não vira setlist */
  for (const variante of ['1', 'ordem']) {
    const { c, p } = await abrir(390, 844, true, variante);
    ok(await p.locator('.vol-setlist').count() === 0, `?demo=${variante}: nenhum setlist no repertório`);
    if (variante === 'ordem') ok(await p.locator('#ordem .vol-ordem').count() === 2, `?demo=ordem: a ordem do Louvor segue na seção dela`,
      String(await p.locator('#ordem .vol-ordem').count()));
    await c.close();
  }
} catch (e) {
  falhas++; console.log('  FALHOU (exceção)', e?.stack || e);
} finally {
  await nav.close();
}
console.log(`\nsetlist-tela: ${feitas - falhas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
