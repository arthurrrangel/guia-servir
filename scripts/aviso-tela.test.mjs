/* O CARTÃO "AVISO NO CELULAR" NO LINK DO VOLUNTÁRIO — 104, 01/10/2026.

   O que a prova exige, no harness (/eu/x?demo=troca):
     1. sem as chaves no servidor (/api/aviso/chave devolve null), o cartão
        NÃO aparece: nada promete aviso que o servidor não manda;
     2. com as chaves, num navegador que recebe aviso, o cartão oferece
        "Ligar aviso" e diz o que chega (troca e lembrete 3 e 1 dia antes);
     3. no iPhone fora da Tela de Início, o cartão diz o caminho do iOS e não
        oferece um botão que não funcionaria ali;
     4. nada rola de lado no celular;
     5. desligar só anuncia sucesso quando o banco confirma: erro resolvido,
        payload nulo, ok:false e exceção mantêm ligado e permitem tentar de
        novo; apagados:0 também é sucesso;
     6. sem inscrição no navegador, desligar não chama o banco; nenhuma saída
        cancela a inscrição compartilhada com outro vínculo.

   Roda com BASE=http://127.0.0.1:3500 node scripts/aviso-tela.test.mjs.
   Só aceita servidor local; service worker, inscrição e RPCs são fictícios.
   O navegador bloqueia toda rede externa, inclusive WebSockets. */
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const origem = new URL(BASE);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(origem.hostname)) throw new Error('BASE precisa ser local');
const esperar = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0, feitas = 0;
const ok = (c, nome, extra = '') => { feitas++; if (!c) falhas++; console.log(`  ${c ? 'ok ' : 'FALHOU'} ${nome}${!c && extra ? '\n      ' + extra : ''}`); };
const nav = await chromium.launch({ executablePath: chromeDoContainer() });
const CHAVE = 'B' + 'x'.repeat(86);
const ENDPOINT = 'https://fcm.googleapis.com/aviso-fixture-sem-servico';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

async function abrir({ chave, ua, largura = 390, push = false, respostas = [] }) {
  const c = await nav.newContext({ viewport: { width: largura, height: 844 }, isMobile: largura < 700, hasTouch: largura < 700,
    serviceWorkers: 'block', ...(ua ? { userAgent: ua } : {}) });
  const chamadas = [];
  await c.addInitScript(({ base, push, endpoint }) => {
    // Até as RPCs fictícias apontam para loopback: nenhuma credencial real.
    localStorage.setItem('escala.credenciais', JSON.stringify({ url: base + '/supabase-falso', key: 'fixture-sem-credencial' }));
    if (!push) return;
    const fake = window.__avisoFixture = { cancelamentos: 0, semInscricao: false, lancar: false };
    const sub = { endpoint, unsubscribe: async () => { fake.cancelamentos++; return true; } };
    const reg = { pushManager: { getSubscription: async () => {
      if (fake.lancar) { fake.lancar = false; throw new Error('exceção sintética'); }
      return fake.semInscricao ? null : sub;
    } } };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
      register: async () => reg, ready: Promise.resolve(reg),
    } });
    Object.defineProperty(window, 'PushManager', { configurable: true, value: function PushManager() {} });
    Object.defineProperty(window, 'Notification', { configurable: true, value: { permission: 'granted' } });
  }, { base: origem.origin, push, endpoint: ENDPOINT });
  await c.route('**', async r => {
    const u = new URL(r.request().url());
    if (u.pathname.includes('/rest/v1/rpc/')) {
      if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
      const fn = u.pathname.split('/rpc/')[1];
      let resposta = { status: 200, corpo: fn === 'eu_aviso_estado' ? { ok: true, ligado: true } : [] };
      if (fn === 'eu_aviso_desligar') {
        chamadas.push(r.request().postDataJSON());
        resposta = respostas.shift() || { status: 500, corpo: { message: 'RPC sem resposta fictícia' } };
      }
      return r.fulfill({ status: resposta.status, headers: CORS, contentType: 'application/json', body: JSON.stringify(resposta.corpo) });
    }
    return u.origin === origem.origin ? r.continue() : r.abort();
  });
  await c.routeWebSocket('**', ws => {
    if (new URL(ws.url()).host === origem.host) ws.connectToServer();
    else ws.close();
  });
  const p = await c.newPage();
  await p.route('**/api/aviso/chave', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chave }) }));
  await p.goto(`${BASE}/eu/x?demo=troca`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.vol', { timeout: 30000 }); await esperar(2500);
  return { c, p, chamadas };
}

const barra = async p => (await p.locator('.vol-flash').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
const esperarAviso = async (p, texto) => p.waitForFunction(t =>
  [...document.querySelectorAll('.vol-flash')].some(el => el.textContent.includes(t)), texto, { timeout: 5000 });

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
  for (const caso of [
    { nome: 'erro resolvido pela RPC', resposta: { status: 500, corpo: { code: 'XX000', message: 'falha sintética' } } },
    { nome: 'payload nulo', resposta: { status: 200, corpo: null } },
    { nome: 'ok:false', resposta: { status: 200, corpo: { ok: false } } },
    { nome: 'exceção', lancar: true },
  ]) {
    const sucesso = { status: 200, corpo: { ok: true, apagados: 0 } };
    const respostas = caso.resposta ? [caso.resposta, sucesso] : [sucesso];
    const { c, p, chamadas } = await abrir({ chave: CHAVE, push: true, respostas });
    const cartao = p.locator('#aviso-no-celular');
    const desligar = cartao.getByRole('button', { name: 'Desligar', exact: true });
    await desligar.waitFor();
    if (caso.lancar) await p.evaluate(() => { window.__avisoFixture.lancar = true; });
    await desligar.click();
    await esperarAviso(p, 'Não consegui desligar agora. Tente de novo.');
    ok((await cartao.innerText()).includes('Aviso ligado neste celular') && await desligar.isEnabled(),
      `${caso.nome}: mantém ligado e libera o botão para tentar de novo`);
    ok(!(await barra(p)).includes('Aviso desligado neste celular.'), `${caso.nome}: não anuncia sucesso`);
    ok(chamadas.length === (caso.lancar ? 0 : 1), `${caso.nome}: só tenta a RPC quando há inscrição acessível`);

    await desligar.click();
    await esperarAviso(p, 'Aviso desligado neste celular.');
    ok(await cartao.getByRole('button', { name: 'Ligar aviso', exact: true }).count() === 1,
      `${caso.nome}: nova tentativa com apagados:0 confirma desligado`);
    ok(chamadas.length === (caso.lancar ? 1 : 2) && chamadas.every(x =>
      x.p_token === 'x' && x.p_endpoint === ENDPOINT && Object.keys(x).length === 2),
      `${caso.nome}: usa só token e endpoint fictícios do vínculo atual`);
    ok(await p.evaluate(() => window.__avisoFixture.cancelamentos === 0),
      `${caso.nome}: preserva a inscrição do navegador para os outros vínculos`);
    await c.close();
  }
  {
    const { c, p, chamadas } = await abrir({ chave: CHAVE, push: true });
    const cartao = p.locator('#aviso-no-celular');
    const desligar = cartao.getByRole('button', { name: 'Desligar', exact: true });
    await desligar.waitFor();
    await p.evaluate(() => { window.__avisoFixture.semInscricao = true; });
    await desligar.click();
    await esperarAviso(p, 'Aviso desligado neste celular.');
    ok(chamadas.length === 0 && await cartao.getByRole('button', { name: 'Ligar aviso', exact: true }).count() === 1,
      'sem inscrição no navegador: desliga sem chamar a RPC');
    ok(await p.evaluate(() => window.__avisoFixture.cancelamentos === 0), 'sem inscrição: não chama unsubscribe');
    await c.close();
  }
} catch (e) {
  falhas++; console.log('  FALHOU (exceção)', e?.message || e);
} finally {
  await nav.close();
}
console.log(`aviso-tela: ${feitas - falhas}/${feitas} ${falhas ? 'FALHOU' : 'ok'}`);
process.exit(falhas ? 1 : 0);
