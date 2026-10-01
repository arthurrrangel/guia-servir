/* APAGAR O PIN DIZ ONDE CRIAR OUTRO — 01/10/2026.

   Uma voluntária do Louvor esqueceu o PIN. O líder apaga no Time, e o aviso
   dizia "Ela já pode criar outro em /servir": de /servir até o nome dela são
   quatro telas, e o "Ela" valia para qualquer um, João incluído.

   O que esta prova exige, no harness (o banco responde pela rota):
     1. a confirmação diz o endereço da lista da equipe, sem "/servir";
     2. o aviso depois de apagar chama a pessoa pelo primeiro nome e diz o
        mesmo endereço;
     3. quem não tinha PIN recebe a frase do outro problema, sem "dela";
     4. no celular, nada disso rola de lado.

   Roda com BASE=http://127.0.0.1:3500 node scripts/pin-apagado-tela.test.mjs */
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const esperar = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0, feitas = 0;
const ok = (c, nome, extra = '') => { feitas++; if (!c) falhas++; console.log(`  ${c ? 'ok ' : 'FALHOU'} ${nome}${!c && extra ? '\n      ' + extra : ''}`); };
const nav = await chromium.launch({ executablePath: chromeDoContainer() });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };

try {
  for (const [w, h, toque, nome] of [[390, 844, true, '390'], [1440, 900, false, '1440']]) {
    for (const tinha of [true, false]) {
      const c = await nav.newContext({ viewport: { width: w, height: h }, isMobile: toque, hasTouch: toque, deviceScaleFactor: 2 });
      await c.route('**', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
      const p = await c.newPage();
      /* depois de apagar, a tela relê o time no banco; no harness o banco não
         existe e a releitura falharia por cima do aviso. Ela fica pendurada:
         o que se mede aqui é o aviso da ação, não a releitura. */
      await p.route(u => u.href.includes('/rest/v1/') && !u.href.includes('/rpc/pin_limpar'), () => {});
      await p.route('**/rest/v1/rpc/pin_limpar', r => {
        if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
        return r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' },
          body: JSON.stringify({ ok: true, nome: 'x', tinha_pin: tinha }) });
      });
      await p.goto(`${BASE}/time?demo=1`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('.es-casca', { timeout: 30000 }); await esperar(2500);

      /* a primeira pessoa ativa da lista: é quem tem "Apagar PIN" */
      const linhas = p.locator('button.es-tm-linha');
      let alvo = null, nomeAlvo = '';
      for (let i = 0; i < await linhas.count() && !alvo; i++) {
        const l = linhas.nth(i);
        await l.click(); await esperar(300);
        const painel = p.locator(`#${await l.getAttribute('aria-controls')}`);
        if (await painel.getByRole('button', { name: 'Apagar PIN' }).count()) {
          alvo = painel; nomeAlvo = (await l.locator('.es-tm-nome b').innerText()).trim();
        } else { await l.click(); await esperar(200); }
      }
      ok(!!alvo, `${nome}${tinha ? '' : ' sem PIN'}: achou alguém com "Apagar PIN"`);
      if (!alvo) { await c.close(); continue; }
      const primeiro = nomeAlvo.split(/\s+/)[0];

      await alvo.getByRole('button', { name: 'Apagar PIN' }).click(); await esperar(400);
      const dlg = p.locator('[role=dialog], [role=alertdialog], dialog[open]').first();
      const txtDlg = (await dlg.innerText()).replace(/\s+/g, ' ');
      if (tinha) {
        ok(/guiaservir\.com\/equipe\/[a-z0-9-]+/.test(txtDlg) && !/\/servir/.test(txtDlg),
          `${nome}: a confirmação diz o endereço da lista da equipe, sem /servir`, txtDlg.slice(0, 220));
      }
      await dlg.getByRole('button', { name: 'Apagar o PIN' }).click(); await esperar(900);
      const avisos = (await p.locator('.es-toast').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
      if (tinha) {
        ok(new RegExp(`${primeiro} cria outro em guiaservir\\.com/equipe/[a-z0-9-]+, tocando no próprio nome`).test(avisos)
          && !/Ela já pode|\/servir\b/.test(avisos),
          `${nome}: o aviso chama pelo nome e diz o endereço`, avisos);
      } else {
        ok(/não tinha PIN\. O problema é outro/.test(avisos) && !/dela/.test(avisos),
          `${nome}: sem PIN, a frase do outro problema, sem "dela"`, avisos);
      }
      ok(await p.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1),
        `${nome}${tinha ? '' : ' sem PIN'}: sem rolagem de lado`);
      await c.close();
    }
  }
} catch (e) {
  falhas++; console.log('  FALHOU (exceção)', e?.message || e);
} finally {
  await nav.close();
}
console.log(`pin-apagado-tela: ${feitas - falhas}/${feitas} ${falhas ? 'FALHOU' : 'ok'}`);
process.exit(falhas ? 1 : 0);
