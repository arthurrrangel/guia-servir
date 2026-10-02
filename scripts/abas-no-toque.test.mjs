/* A BARRA DE ABAS DO CELULAR NÃO ROUBA O TOQUE — 02/10/2026.

   Escrevendo num campo no celular, a barra de abas some (para não subir com o
   teclado e cobrir o campo). Ela voltava no MESMO instante em que o campo
   perdia o foco, e o campo perde o foco no começo do toque num botão: quem
   tocava em "Salvar" rente ao pé da tela via a barra reaparecer embaixo do
   dedo, e o toque caía nela. A ordem do culto (105) perdia 2 de cada 5 toques
   no "Salvar" assim, no harness.

   O que esta prova exige, no celular (390px), numa tela do líder:
     1. com o foco num campo de texto, a barra não aparece nem recebe toque;
     2. no instante em que o campo perde o foco, o pé da tela ainda é da
        página (é aí que o toque do botão termina);
     3. pouco depois, a barra volta;
     4. no computador, nada disso existe (a barra nem aparece).

   Roda com BASE=http://127.0.0.1:3500 node scripts/abas-no-toque.test.mjs */
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const esperar = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0, feitas = 0;
const ok = (c, nome, extra = '') => { feitas++; if (!c) falhas++; console.log(`  ${c ? 'ok ' : 'FALHOU'} ${nome}${!c && extra ? '\n      ' + extra : ''}`); };
const nav = await chromium.launch({ executablePath: chromeDoContainer() });
const noPe = p => p.evaluate(() => {
  const el = document.elementFromPoint(innerWidth / 2, innerHeight - 20);
  return el && el.closest('.es-abas') ? 'barra' : 'pagina';
});

try {
  const c = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await c.route('**', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
  const p = await c.newPage();
  await p.goto(`${BASE}/escala?demo=1`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.es-casca', { timeout: 30000 }); await esperar(2500);
  const campo = p.locator('.es-ec-recado input').first();
  ok(await campo.count() === 1, 'há um campo de texto na escala do dia aberto');
  ok(await noPe(p) === 'barra', 'sem foco em campo, o pé da tela é a barra de abas');

  await campo.focus(); await esperar(200);
  ok(await noPe(p) === 'pagina', 'escrevendo, a barra sai da frente e não recebe toque');

  /* sair do campo e olhar o pé da tela no mesmo instante, como o toque faz */
  const noToque = await p.evaluate(() => {
    document.activeElement && document.activeElement.blur();
    const el = document.elementFromPoint(innerWidth / 2, innerHeight - 20);
    return el && el.closest('.es-abas') ? 'barra' : 'pagina';
  });
  ok(noToque === 'pagina', 'no instante em que o campo perde o foco, o toque ainda é da página', noToque);
  await esperar(700);
  ok(await noPe(p) === 'barra', 'pouco depois, a barra volta');
  await c.close();

  const d = await nav.newContext({ viewport: { width: 1440, height: 900 } });
  await d.route('**', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
  const q = await d.newPage();
  await q.goto(`${BASE}/escala?demo=1`, { waitUntil: 'domcontentloaded' });
  await q.waitForSelector('.es-casca', { timeout: 30000 }); await esperar(2000);
  ok(await q.evaluate(() => getComputedStyle(document.querySelector('.es-abas')).display) === 'none',
    'no computador, a barra de abas não existe');
  await d.close();
} catch (e) {
  falhas++; console.log('  FALHOU (exceção)', e?.message || e);
} finally {
  await nav.close();
}
console.log(`\nabas-no-toque: ${feitas - falhas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
