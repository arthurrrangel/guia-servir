/* O CARTÃO "AVISO NO CELULAR" NO LINK DO VOLUNTÁRIO — 104, 01/10/2026.

   O que a prova exige, no harness (/eu/x?demo=troca):
     1. sem as chaves no servidor (/api/aviso/chave devolve null), o cartão
        NÃO aparece: nada promete aviso que o servidor não manda;
     2. com as chaves, num navegador que recebe aviso, o cartão oferece
        "Ligar aviso" e diz o que chega (troca e lembrete 3 e 1 dia antes);
     3. no iPhone fora da Tela de Início, o cartão diz o caminho do iOS e não
        oferece um botão que não funcionaria ali;
     4. nada rola de lado no celular.

   Roda com BASE=http://127.0.0.1:3500 node scripts/aviso-tela.test.mjs */
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const esperar = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0, feitas = 0;
const ok = (c, nome, extra = '') => { feitas++; if (!c) falhas++; console.log(`  ${c ? 'ok ' : 'FALHOU'} ${nome}${!c && extra ? '\n      ' + extra : ''}`); };
const nav = await chromium.launch({ executablePath: chromeDoContainer() });
const CHAVE = 'B' + 'x'.repeat(86);
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

async function abrir({ chave, ua, largura = 390 }) {
  const c = await nav.newContext({ viewport: { width: largura, height: 844 }, isMobile: largura < 700, hasTouch: largura < 700,
    ...(ua ? { userAgent: ua } : {}) });
  await c.route('**', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
  const p = await c.newPage();
  await p.route('**/api/aviso/chave', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chave }) }));
  await p.goto(`${BASE}/eu/x?demo=troca`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.vol', { timeout: 30000 }); await esperar(2500);
  return { c, p };
}

try {
  {
    const { c, p } = await abrir({ chave: null });
    ok(!(await p.locator('#aviso-no-celular').count()), 'sem as chaves no servidor, o cartão não aparece');
    await c.close();
  }
  {
    const { c, p } = await abrir({ chave: CHAVE, largura: 1440 });
    const cartao = p.locator('#aviso-no-celular');
    ok(await cartao.count() === 1, 'com as chaves, o cartão aparece');
    const txt = (await cartao.innerText()).replace(/\s+/g, ' ');
    ok(/pedir troca com você/.test(txt) && /3 dias e 1 dia antes/.test(txt), 'diz o que chega: troca e lembrete', txt);
    ok(await cartao.getByRole('button', { name: 'Ligar aviso' }).count() === 1, 'e oferece "Ligar aviso"');
    await c.close();
  }
  {
    const { c, p } = await abrir({ chave: CHAVE, ua: IPHONE });
    const cartao = p.locator('#aviso-no-celular');
    const txt = (await cartao.innerText()).replace(/\s+/g, ' ');
    ok(/No iPhone, o aviso funciona com esta página na Tela de Início/.test(txt), 'no iPhone fora da Tela de Início, diz o caminho', txt);
    ok(!(await cartao.getByRole('button').count()), 'e não oferece botão que não funcionaria ali');
    ok(await p.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1), 'sem rolagem de lado no celular');
    await c.close();
  }
} catch (e) {
  falhas++; console.log('  FALHOU (exceção)', e?.message || e);
} finally {
  await nav.close();
}
console.log(`aviso-tela: ${feitas - falhas}/${feitas} ${falhas ? 'FALHOU' : 'ok'}`);
process.exit(falhas ? 1 : 0);
