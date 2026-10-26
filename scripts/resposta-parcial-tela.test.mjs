/* Recuperação por posto na tela real, com RPCs e dados fictícios.
   Não executa banco, cron ou envio. Só aceita servidor de desenvolvimento
   local; toda requisição externa e todo WebSocket externo são bloqueados.
   BASE=http://127.0.0.1:3500 CHROME_BIN=/caminho/chrome node scripts/resposta-parcial-tela.test.mjs */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const origem = new URL(BASE);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(origem.hostname)) throw new Error('BASE precisa ser local');
const browser = await chromium.launch({ ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}) });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
let feitas = 0;
const ok = (valor, nome) => { assert.ok(valor, nome); feitas++; console.log('  ok ' + nome); };

/* Lê o estado que desenha a página; a injeção semId só representa uma linha
   legada do harness existente, sem criar outro componente de teste. */
const lerItens = ({ semId = false, esperarSemId = false } = {}) => {
  const el = document.querySelector('.vol');
  const chave = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
  let raiz = el[chave];
  while (raiz.return) raiz = raiz.return;
  /* O nó DOM pode guardar o alternate anterior; só lemos a árvore atual. */
  const fila = [raiz.stateNode.current];
  while (fila.length) {
    const f = fila.pop();
    if (f.child) fila.push(f.child);
    if (f.sibling) fila.push(f.sibling);
    for (let h = f.memoizedState; h; h = h.next) {
      const s = h.memoizedState;
      if (!Array.isArray(s) || !s.some(i => i?.culto_id === 'c1' && 'status' in i) || !h.queue?.dispatch) continue;
      if (semId) h.queue.dispatch(s.map(i => i.culto_id === 'c1' ? { ...i, funcao_id: null } : i));
      if (esperarSemId) return s.filter(i => i.culto_id === 'c1').every(i => i.funcao_id === null);
      return s.map(i => ({ culto: i.culto_id, posto: i.funcao_id, nome: i.funcao, status: i.status }));
    }
  }
  throw new Error('Estado dos postos não encontrado');
};
const itens = (page, semId = false) => page.evaluate(lerItens, { semId });
const estados = xs => Object.fromEntries(xs.filter(i => i.culto === 'c1').map(i => [i.posto || i.nome, i.status]));

async function abrir(largura, modo) {
  const context = await browser.newContext({ viewport: { width: largura, height: 900 }, serviceWorkers: 'block' });
  const b = { pedidos: [], falhar: true };
  const erros = [];
  await context.addInitScript(base => localStorage.setItem('escala.credenciais', JSON.stringify({
    url: base + '/supabase-falso', key: 'fixture-sem-credencial',
  })), origem.origin);
  await context.route('**', r => {
    const u = new URL(r.request().url());
    if (u.pathname.includes('/rest/v1/rpc/')) {
      if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
      const fn = u.pathname.split('/rpc/')[1];
      const corpo = r.request().postDataJSON();
      if (fn === 'eu_responder') {
        b.pedidos.push(corpo);
        if (b.falhar && (modo === 'todas' || modo === 'sem-id' || corpo.p_funcao_id === 'f2')) {
          return r.fulfill({ status: modo === 'zero' ? 200 : 500, headers: CORS,
            contentType: 'application/json', body: JSON.stringify(modo === 'zero'
              ? { ok: true, mudou: 0, motivo: 'SEM_POSTO_SEU' } : { message: 'falha sintética' }) });
        }
        return r.fulfill({ status: 200, headers: CORS, contentType: 'application/json',
          body: JSON.stringify(modo === 'legado' ? null : { ok: true, mudou: 1 }) });
      }
      return r.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: '[]' });
    }
    if (u.pathname === '/api/aviso/chave') return r.fulfill({ contentType: 'application/json', body: '{"chave":null}' });
    if (u.pathname.startsWith('/api/')) return r.abort();
    return u.origin === origem.origin ? r.continue() : r.abort();
  });
  await context.routeWebSocket('**', ws => new URL(ws.url()).host === origem.host ? ws.connectToServer() : ws.close());
  const page = await context.newPage();
  page.on('pageerror', e => erros.push(e.message));
  await page.goto(BASE + '/eu/x?demo=troca', { waitUntil: 'domcontentloaded' });
  await page.locator('#confirmar .vol-pede').waitFor();
  if (modo === 'sem-id') { await itens(page, true); await page.waitForFunction(lerItens, { esperarSemId: true }); }
  return { context, page, b, erros };
}
const aguardar = (p, texto) => p.locator('.vol-flash').filter({ hasText: texto }).waitFor();

try {
  for (const largura of [390, 1440]) {
    for (const [modo, recusar] of [['parcial', false], ['parcial', true], ['zero', false], ['todas', false], ['sem-id', false], ['legado', false]]) {
      const { context, page, b, erros } = await abrir(largura, modo);
      const antes = await itens(page);
      const alvos = antes.filter(i => i.culto === 'c1');
      ok(alvos.length === 2 && alvos.every(i => i.status === 'pendente')
        && (modo === 'sem-id' ? alvos.every(i => i.posto === null) : alvos.map(i => i.posto).sort().join(',') === 'f1,f2'),
        `${largura}/${modo}: fixture começa com exatamente dois postos pendentes`);
      if (modo === 'legado') b.falhar = false;
      await page.locator('#confirmar .vol-pede').getByRole('button', { name: recusar ? /^Não posso/ : /^Eu vou/ }).click();
      await aguardar(page, modo === 'legado' ? 'Confirmado. Obrigado!' : modo === 'zero' ? 'Uma parte dos postos' : 'falha');
      const depois = await itens(page);
      const status = recusar ? 'recusado' : 'confirmado';
      ok(b.pedidos.length === (modo === 'sem-id' ? 1 : 2), `${largura}/${modo}: uma chamada por posto ou uma chamada legada pelo culto`);
      ok(b.pedidos.every(p => p.p_token === 'x' && p.p_culto_id === 'c1' && p.p_status === status
        && Object.keys(p).sort().join(',') === 'p_culto_id,p_funcao_id,p_status,p_token')
        && (modo === 'sem-id' ? b.pedidos[0].p_funcao_id === null : b.pedidos.map(p => p.p_funcao_id).sort().join(',') === 'f1,f2'),
        `${largura}/${modo}: primeira tentativa preserva token, culto, status e postos-alvo`);
      const esperados = Object.fromEntries(antes.filter(i => i.culto === 'c1').map(i => [i.posto || i.nome,
        modo === 'legado' || ((modo === 'parcial' || modo === 'zero') && i.posto === 'f1') ? status : 'pendente']));
      assert.deepEqual(estados(depois), esperados); feitas++;
      ok(JSON.stringify(depois.filter(i => i.culto !== 'c1')) === JSON.stringify(antes.filter(i => i.culto !== 'c1')),
        `${largura}/${modo}/${status}: outros cultos preservados`);
      const pendentes = Object.values(esperados).filter(s => s === 'pendente').length;
      ok(await page.locator('#confirmar .vol-pede').count() === (pendentes ? 1 : 0), `${largura}/${modo}: cartão mantém só pendências`);
      if (pendentes === 1) {
        const fn = await page.locator('#confirmar .vol-pede-fn').innerText();
        ok(!fn.includes('PROJEÇÃO') && /FILMAGEM|CÂMERA 1/.test(fn), `${largura}/${modo}: sucesso sai do cartão e falha fica`);
      }
      if (recusar) {
        const ofertas = page.locator('.vol-linha').filter({ has: page.getByRole('button', { name: 'Pedir a um colega', exact: true }) });
        ok(await ofertas.count() === 1 && (await ofertas.innerText()).includes('PROJEÇÃO'), `${largura}: oferta só para a recusa gravada`);
      }
      if (modo !== 'legado') {
        ok(!(await page.locator('.vol-flash').innerText()).includes('Confirmado. Obrigado!'), `${largura}/${modo}: falha não anuncia sucesso total`);
        const n = b.pedidos.length;
        b.falhar = false;
        await page.locator('#confirmar .vol-pede').getByRole('button', { name: /^Eu vou/ }).click();
        await aguardar(page, 'Confirmado. Obrigado!');
        const novas = b.pedidos.slice(n);
        ok(novas.length === (modo === 'sem-id' ? 1 : pendentes), `${largura}/${modo}: nova tentativa só para pendências`);
        if (pendentes === 1) ok(novas[0].p_funcao_id === 'f2', `${largura}/${modo}: não repete o posto já gravado`);
        ok(Object.values(estados(await itens(page))).every(s => s === 'confirmado' || (recusar && s === 'recusado')),
          `${largura}/${modo}: nova tentativa recupera sem desfazer o sucesso anterior`);
      }
      ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${largura}/${modo}: sem rolagem horizontal`);
      ok(erros.length === 0, `${largura}/${modo}: sem exceções de página`);
      await context.close();
    }
  }
  console.log(`resposta-parcial-tela: ${feitas}/${feitas} ok`);
} finally { await browser.close(); }
