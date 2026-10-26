/* Uma ação de cobrança por vínculo e culto, sem alterar a conta dos postos.
   Usa a tela real e a injeção sintética de estado do harness existente.
   Não abre links do WhatsApp nem consulta banco. Só aceita servidor local.
   BASE=http://127.0.0.1:3500 CHROME_BIN=/caminho/chrome node scripts/cobranca-pessoas-tela.test.mjs */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const origem = new URL(BASE);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(origem.hostname)) throw new Error('BASE precisa ser local');
const browser = await chromium.launch({ ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}) });
let feitas = 0;
const ok = (valor, nome) => { assert.ok(valor, nome); feitas++; console.log('  ok ' + nome); };
const pessoa = (id, nome = 'Ana Sintética', tel = '21900000001') => ({
  id, nome, tel, ativo: true, limiteMes: null, token: 'token-' + id,
  funcoes: { FOTO: 'titular', 'EDIÇÃO': 'titular', SOM: 'titular' },
  indisponivel: [], disponivel: [],
});
const slot = (vid, status = 'pendente') => ({ vid, status, fixo: false });
const A = pessoa('a');
const B = pessoa('b', 'Bia Sintética', '21900000002');

/* Substitui o estado que o Shell já carregou em ?demo=1, como os testes de
   liberação existentes. A função de cobrança e o JSX continuam os reais. */
const preparar = (page, cena) => page.evaluate(cena => {
  const el = document.querySelector('.es-casca');
  const chave = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
  for (let f = el[chave]; f; f = f.return) {
    for (let h = f.memoizedState; h; h = h.next) {
      const S = h.memoizedState;
      if (!S || !Array.isArray(S.voluntarios) || !S.config || !h.queue?.dispatch) continue;
      const agora = new Date();
      const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 12);
      while (![0, 6].includes(dia.getDay())) dia.setDate(dia.getDate() + 1);
      const D = iso(dia);
      dia.setDate(dia.getDate() + 7);
      const outro = iso(dia);
      const funcoes = Object.keys(cena.slots).map((nome, i) => ({ id: 'f' + i, nome, simultanea: false, ordem: i, ativa: true }));
      h.queue.dispatch({ ...S, equipe: cena.equipe || 'Mídia', funcoes, voluntarios: cena.pessoas,
        escalas: { [D]: { slots: cena.slots, obs: '', plantao: [] },
          [outro]: { slots: { 'OUTRO DIA': { vid: 'a', status: 'pendente', fixo: false } }, obs: '', plantao: [] } },
      });
      if (cena.equipeId) h.next.next.queue.dispatch(cena.equipeId);
      return { dia: D, outro };
    }
  }
  throw new Error('Estado do Shell não encontrado');
}, cena);

async function contexto(largura) {
  const context = await browser.newContext({ viewport: { width: largura, height: 900 }, serviceWorkers: 'block' });
  await context.addInitScript(base => {
    localStorage.setItem('escala.credenciais', JSON.stringify({ url: base + '/supabase-falso', key: 'fixture-sem-credencial' }));
    window.__copiasCobranca = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async texto => { window.__copiasCobranca.push(texto); },
    } });
  }, origem.origin);
  await context.route('**', r => {
    const u = new URL(r.request().url());
    if (u.pathname.includes('/rest/v1/')) return r.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"banco fora do teste"}' });
    return u.origin === origem.origin ? r.continue() : r.abort();
  });
  await context.routeWebSocket('**', ws => new URL(ws.url()).host === origem.host ? ws.connectToServer() : ws.close());
  const page = await context.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  await page.goto(`${BASE}/painel?demo=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('.es-casca').waitFor();
  await page.locator('.es-passo').waitFor();
  return { context, page, erros };
}

try {
  for (const largura of [390, 1440]) {
    const { context, page, erros } = await contexto(largura);
    const fila = page.locator('#cobrar .es-fila > .es-item');
    const aplicar = async cena => {
      await preparar(page, cena);
      await page.waitForFunction(nome => document.querySelector('#cobrar')?.textContent.includes(nome), cena.pessoas[0].nome);
    };
    await aplicar({ pessoas: [A, B], slots: { FOTO: slot('a'), 'EDIÇÃO': slot('a'), SOM: slot('b', 'confirmado') } });
    await page.waitForTimeout(100);
    ok(await fila.count() === 1, `${largura}: dois postos pendentes da mesma pessoa geram uma ação`);
    ok(await page.locator('#cobrar .es-selo').innerText() === '1', `${largura}: selo da fila conta uma pessoa`);
    ok((await fila.first().locator('small').innerText()) === 'FOTO · EDIÇÃO', `${largura}: a linha reúne os postos pendentes`);
    ok((await page.locator('.es-passo-sub').innerText()).includes('1 pessoa ainda não respondeu'), `${largura}: passo conta uma pessoa`);
    const kpi = page.locator('.es-kpi').filter({ has: page.locator('.es-kpi-rot', { hasText: 'Sem resposta' }) });
    ok((await kpi.locator('.es-kpi-valor').innerText()).trim() === '2', `${largura}: saúde continua contando dois postos`);
    const href = new URL(await fila.first().getByRole('link').getAttribute('href'));
    ok(href.hostname === 'wa.me' && href.pathname === '/5521900000001', `${largura}: telefone e destino preservados`);
    ok(href.searchParams.get('text').includes('em FOTO e EDIÇÃO.') && href.searchParams.get('text').endsWith('/eu/token-a#confirmar'), `${largura}: mensagem e link pessoal preservados`);
    ok(!(await page.locator('#cobrar').innerText()).includes('OUTRO DIA'), `${largura}: posto de outro dia não entra na cobrança`);

    await aplicar({ pessoas: [pessoa('a', 'Alex Lima'), pessoa('b', 'Alex Lima', '21900000002')], slots: { FOTO: slot('a'), 'EDIÇÃO': slot('b') } });
    await page.waitForFunction(() => document.querySelectorAll('#cobrar .es-fila > .es-item').length === 2);
    ok(await fila.count() === 2, `${largura}: homônimos com vínculos diferentes mantêm duas ações`);
    const links = await fila.locator('a').evaluateAll(xs => xs.map(a => new URL(a.href).searchParams.get('text')));
    ok(links.some(t => t.endsWith('/eu/token-a#confirmar')) && links.some(t => t.endsWith('/eu/token-b#confirmar')), `${largura}: homônimos preservam seus próprios links`);

    await aplicar({ pessoas: [A, B], slots: { FOTO: slot('a'), 'EDIÇÃO': slot('a', 'confirmado'), SOM: slot('b', 'confirmado') } });
    await page.waitForFunction(() => document.querySelector('#cobrar .es-c-tit small')?.textContent === 'FOTO');
    ok(await fila.count() === 1 && await fila.first().locator('small').innerText() === 'FOTO', `${largura}: confirmação mista lista só o posto pendente`);
    ok(new URL(await fila.first().getByRole('link').getAttribute('href')).searchParams.get('text').includes('em FOTO e EDIÇÃO.'), `${largura}: confirmação mista preserva o texto individual existente`);
    ok((await page.locator('.es-passo-tit').innerText()) === 'Falta 1 confirmação', `${largura}: confirmação do outro posto permanece contabilizada`);

    await aplicar({ equipeId: 'demo-louvor', equipe: 'Louvor', pessoas: [pessoa('a', 'Lia Outra Área', '')], slots: { VOCAL: slot('a') } });
    await page.waitForFunction(() => document.querySelector('#cobrar .es-c-tit small')?.textContent === 'VOCAL');
    ok(await fila.count() === 1 && !(await fila.first().innerText()).includes('FOTO'), `${largura}: outro estado de equipe não herda os postos anteriores`);
    ok(await fila.first().getByRole('button', { name: 'Copiar', exact: true }).count() === 1 && await fila.first().getByRole('link').count() === 0, `${largura}: sem telefone mantém a ação Copiar`);
    await fila.first().getByRole('button', { name: 'Copiar', exact: true }).click();
    await page.waitForFunction(() => window.__copiasCobranca.length === 1);
    ok(await page.evaluate(() => window.__copiasCobranca[0].includes('em VOCAL.') && window.__copiasCobranca[0].endsWith('/eu/token-a#confirmar')), `${largura}: cópia usa a mensagem da equipe atual`);
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${largura}: fila sem rolagem horizontal`);
    ok(erros.length === 0, `${largura}: nenhuma exceção de página`);
    await context.close();
  }
  console.log(`cobranca-pessoas-tela: ${feitas}/${feitas} ok`);
} finally {
  await browser.close();
}
