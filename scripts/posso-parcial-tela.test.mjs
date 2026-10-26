/* "Posso no mês" e "Posso em todos" na tela real, com RPCs e dados fictícios.
   Abre /eu/<token> fora da demonstração, porque a releitura de fundo
   (`carregar`) é parte do que se testa: na demonstração ela devolve o estado
   inicial e não mexe no aviso. O banco é uma tabela em memória aqui dentro.
   Não executa banco, cron ou envio. Só aceita servidor de desenvolvimento
   local; toda requisição externa e todo WebSocket externo são bloqueados.
   BASE=http://127.0.0.1:3500 CHROME_BIN=/caminho/chrome node scripts/posso-parcial-tela.test.mjs */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const origem = new URL(BASE);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(origem.hostname)) throw new Error('BASE precisa ser local');
const browser = await chromium.launch({ ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}) });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };

/* Conta tudo e não para na primeira falha: o mesmo arquivo mostra o defeito
   numa versão e a correção na outra. Sai com código 1 se algo falhou. */
let feitas = 0;
const falhas = [];
const ok = (valor, nome, detalhe = '') => {
  if (valor) { feitas++; console.log('  ok ' + nome); return; }
  falhas.push(nome); console.log('  FALHOU ' + nome + (detalhe ? ` · ${detalhe}` : ''));
};
const igual = (atual, esperado, nome) => ok(JSON.stringify(atual) === JSON.stringify(esperado), nome,
  `veio ${JSON.stringify(atual)}, esperado ${JSON.stringify(esperado)}`);
const esperar = async (cond, nome, ms = 7000) => {
  const fim = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > fim) throw new Error('esperou demais: ' + nome);
    await new Promise(r => setTimeout(r, 25));
  }
};

/* Quatro domingos nos dois meses seguintes: A, sem escala; B, com dois postos
   pendentes e um recusado; C, sem escala, no outro mês; E, com um posto
   confirmado. */
const domingosDoMes = adiante => {
  const agora = new Date();
  const ini = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + adiante, 1));
  const out = [];
  for (const dt = new Date(ini); dt.getUTCMonth() === ini.getUTCMonth(); dt.setUTCDate(dt.getUTCDate() + 1))
    if (dt.getUTCDay() === 0) out.push(dt.toISOString().slice(0, 10));
  return out;
};
const [A, B] = domingosDoMes(1);
const [C, E] = domingosDoMes(2);
const fmt = d => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const posto = (culto_id, funcao_id, data, funcao, status) =>
  ({ culto_id, funcao_id, data, funcao, status, obs: null, primeira_vez: false, plantao: false });
const escalas = () => [
  posto('cB', 'f1', B, 'PROJEÇÃO', 'pendente'),
  posto('cB', 'f2', B, 'CÂMERA 1', 'pendente'),
  posto('cB', 'f3', B, 'FOTO', 'recusado'),
  posto('cE', 'f4', E, 'FILMAGEM', 'confirmado'),
];

/* O banco fictício. `plano` diz o que cada data (eu_disponibilidade) ou posto
   (eu_responder) devolve: ok (200 com null, ou mudou:1), vazio (204 sem
   corpo), legado (null, sem mudou), zero (mudou:0) ou erro (500). */
const portao = () => { let abrir; const p = new Promise(r => { abrir = r; }); return { p, abrir: () => abrir() }; };
const novoBanco = () => ({
  disponivel: [], indisponivel: [], escalas: escalas(), plano: {},
  releituraFalha: false, segurarLeitura: false, leituras: 0, leiturasPresas: 0,
  segurar: new Set(), presas: 0, envios: [], emVoo: 0,
  portoes: { envio: portao(), leitura: portao() },
});
const desc = p => p.fn === 'eu_disponibilidade'
  ? `disponibilidade ${p.p_data === A ? 'A' : p.p_data === C ? 'C' : p.p_data} ${p.p_resposta}`
  : `responder ${p.p_funcao_id} ${p.p_status}`;
const corposCertos = xs => xs.every(p => p.p_token === 'x'
  && Object.keys(p).filter(k => k !== 'fn').sort().join(',') === (p.fn === 'eu_disponibilidade'
    ? 'p_data,p_resposta,p_token' : 'p_culto_id,p_funcao_id,p_status,p_token')
  && (p.fn !== 'eu_responder' || p.p_culto_id === (['f4', 'f5'].includes(p.p_funcao_id) ? 'cE' : 'cB')));

async function abrir(largura) {
  const context = await browser.newContext({ viewport: { width: largura, height: 900 }, serviceWorkers: 'block' });
  const b = novoBanco();
  const erros = [];
  await context.addInitScript(base => localStorage.setItem('escala.credenciais', JSON.stringify({
    url: base + '/supabase-falso', key: 'fixture-sem-credencial',
  })), origem.origin);
  await context.route('**', async r => {
    try {
      const req = r.request();
      const u = new URL(req.url());
      if (!u.pathname.includes('/rest/v1/rpc/')) {
        if (u.pathname === '/api/aviso/chave') return await r.fulfill({ contentType: 'application/json', body: '{"chave":null}' });
        if (u.pathname.startsWith('/api/')) return await r.abort();
        return await (u.origin === origem.origin ? r.continue() : r.abort());
      }
      if (req.method() === 'OPTIONS') return await r.fulfill({ status: 204, headers: CORS });
      const fn = u.pathname.split('/rpc/')[1];
      const corpo = req.postDataJSON() || {};
      const json = (status, v) => r.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(v) });
      b.emVoo++;
      try {
        if (fn === 'eu_dados') {
          b.leituras++;
          if (b.segurarLeitura && b.leituras > 1) { b.leiturasPresas++; await b.portoes.leitura.p; }
          if (b.releituraFalha && b.leituras > 1) return await json(500, { message: 'releitura sintética indisponível' });
          return await json(200, [{ nome: 'Pessoa Fictícia', equipe: 'Mídia', escalas: structuredClone(b.escalas),
            indisponivel: [...b.indisponivel], disponivel: [...b.disponivel] }]);
        }
        if (fn === 'eu_proximos_domingos') return await json(200, [A, B, C, E]);
        if (fn === 'eu_disponibilidade' || fn === 'eu_responder') {
          const alvo = fn === 'eu_disponibilidade' ? corpo.p_data : corpo.p_funcao_id;
          b.envios.push({ fn, ...corpo });
          if (b.segurar.has(alvo)) { b.presas++; await b.portoes.envio.p; }
          const plano = b.plano[alvo] || 'ok';
          if (plano === 'erro') return await json(500, { message: 'falha sintética' });
          if (fn === 'eu_disponibilidade') {
            b.disponivel = b.disponivel.filter(d => d !== corpo.p_data);
            b.indisponivel = b.indisponivel.filter(d => d !== corpo.p_data);
            (corpo.p_resposta === 'posso' ? b.disponivel : b.indisponivel).push(corpo.p_data);
            return await (plano === 'vazio' ? r.fulfill({ status: 204, headers: CORS }) : json(200, null));
          }
          if (plano === 'zero') return await json(200, { ok: true, mudou: 0, motivo: 'SEM_POSTO_SEU' });
          for (const i of b.escalas) if (i.culto_id === corpo.p_culto_id && i.funcao_id === corpo.p_funcao_id) i.status = corpo.p_status;
          return await json(200, plano === 'legado' ? null : { ok: true, mudou: 1, status: corpo.p_status });
        }
        if (fn === 'quem_sou' || fn === 'eu_espaco') return await json(200, null);
        return await json(200, []);
      } finally { b.emVoo--; }
    } catch { /* o contexto fechou com uma resposta presa */ }
  });
  await context.routeWebSocket('**', ws => new URL(ws.url()).host === origem.host ? ws.connectToServer() : ws.close());
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  page.setDefaultNavigationTimeout(90000);
  page.on('pageerror', e => erros.push(e.message));
  await page.goto(BASE + '/eu/x', { waitUntil: 'domcontentloaded' });
  await page.locator('#quando-posso .vol-dia').nth(3).waitFor({ timeout: 60000 });
  await page.locator('#confirmar .vol-pede').first().waitFor();
  await esperar(() => b.emVoo === 0, 'carga inicial');
  await page.waitForTimeout(500);
  await esperar(() => b.emVoo === 0, 'carga inicial');
  return { context, page, b, erros };
}

/* O que a pessoa vê: a resposta de cada dia (aria-pressed), a marca de falta,
   as ações em massa e a barra de aviso. */
const lerTela = () => {
  const sec = document.querySelector('#quando-posso');
  const meses = [...sec.querySelectorAll('.vol-mes')].map(m => ({
    mes: !!m.querySelector('.vol-mes-cab .vol-mes-todos'),
    nota: m.querySelector('.vol-mes-nota')?.textContent || '',
    dias: [...m.querySelectorAll('.vol-dia')].map(d => {
      const posso = d.querySelector('.vol-seg-bt.sim')?.getAttribute('aria-pressed') === 'true';
      const nao = d.querySelector('.vol-seg-bt.nao')?.getAttribute('aria-pressed') === 'true';
      return { r: posso ? 'posso' : nao ? 'nao' : '-', falta: d.classList.contains('falta') };
    }),
  }));
  const barra = document.querySelector('.vol-flash');
  return {
    meses,
    tudo: sec.querySelector('.vol-tudo .vol-mes-todos')?.textContent?.trim() || '',
    aviso: barra?.textContent?.trim() || '',
    ruim: !!barra?.classList.contains('vol-flash-ruim'),
    presos: [...sec.querySelectorAll('button')].filter(x => x.disabled).length,
  };
};
const tela = async page => {
  const t = await page.evaluate(lerTela);
  const dias = { A: t.meses[0]?.dias[0], B: t.meses[0]?.dias[1], C: t.meses[1]?.dias[0], E: t.meses[1]?.dias[1] };
  t.resp = Object.fromEntries(Object.entries(dias).map(([k, v]) => [k, v ? v.r : 'ausente']));
  t.coerente = Object.values(dias).every(v => v && v.falta === (v.r === '-'));
  return t;
};
/* O estado dos postos que a página desenha, lido da árvore do React. */
const lerItens = () => {
  const el = document.querySelector('.vol');
  const chave = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
  let raiz = el[chave];
  while (raiz.return) raiz = raiz.return;
  const fila = [raiz.stateNode.current];
  while (fila.length) {
    const f = fila.pop();
    if (f.child) fila.push(f.child);
    if (f.sibling) fila.push(f.sibling);
    for (let h = f.memoizedState; h; h = h.next) {
      const s = h.memoizedState;
      if (!h.queue?.dispatch || !Array.isArray(s) || !s.some(i => i?.culto_id === 'cB' && 'plantao' in i && 'status' in i)) continue;
      return Object.fromEntries(s.map(i => [i.funcao_id, i.status]));
    }
  }
  throw new Error('Estado dos postos não encontrado');
};
const itens = page => page.evaluate(lerItens);

const mes = (page, m) => page.locator('#quando-posso .vol-mes').nth(m).locator('.vol-mes-cab .vol-mes-todos');
const todos = page => page.locator('#quando-posso .vol-tudo .vol-mes-todos');
const dia = (page, m, j, nome) => page.locator('#quando-posso .vol-mes').nth(m).locator('.vol-dia').nth(j)
  .getByRole('button', { name: nome, exact: true });
const tocar = async loc => { await loc.evaluate(el => el.scrollIntoView({ block: 'center' })); await loc.click(); };
const livre = page => page.waitForFunction(() => ![...document.querySelectorAll('#quando-posso button')].some(x => x.disabled));

/* Espera a ação terminar: nenhuma resposta pendente no banco fictício e a
   grade livre de novo (`ocupado` vazio). Depois espera a releitura que a
   tela agenda 1,2 s depois de gravar. */
async function assentar(page, b, releitura) {
  await esperar(() => b.emVoo === 0, 'respostas do banco fictício');
  await livre(page);
  if (!releitura) return;
  await page.waitForTimeout(1500);
  await esperar(() => b.emVoo === 0, 'releitura agendada');
  await livre(page);
}
/* Toca, espera `n` envios novos e devolve a tela logo ao fim da ação e
   depois de assentar, com tudo o que foi enviado nesse intervalo. */
async function enviar(page, b, loc, n, rot) {
  const antes = b.envios.length;
  await tocar(loc);
  await esperar(() => b.envios.length >= antes + n, `${rot}: ${n} envio(s)`);
  await assentar(page, b, false);
  const logo = await tela(page);
  const itensLogo = await itens(page);
  await assentar(page, b, true);
  return { logo, itensLogo, depois: await tela(page), itensDepois: await itens(page), envios: b.envios.slice(antes) };
}
const PRIMEIRO_MES = ['disponibilidade A posso', 'responder f1 confirmado', 'responder f2 confirmado'];
const fases = r => [['logo depois', r.logo, r.itensLogo], ['depois de assentar', r.depois, r.itensDepois]];

const CENAS = [
  ['a · mês gravado inteiro', async ({ page, b, rot }) => {
    const r = await enviar(page, b, mes(page, 0), 3, rot);
    igual(r.envios.map(desc).sort(), PRIMEIRO_MES, `${rot}: um envio por dia sem escala e por posto pendente; nada de C, E ou do recusado`);
    ok(corposCertos(r.envios), `${rot}: token, culto, posto e resposta certos em cada envio`);
    igual([r.logo.aviso, r.logo.ruim], ['2 dias marcados como posso.', false], `${rot}: anuncia os dois dias`);
    igual(r.depois.resp, { A: 'posso', B: 'posso', C: '-', E: 'posso' }, `${rot}: o mês respondido e C intocado`);
    igual(r.itensDepois, { f1: 'confirmado', f2: 'confirmado', f3: 'recusado', f4: 'confirmado' }, `${rot}: o recusado de B e o confirmado de E preservados`);
    igual([r.depois.meses[0].mes, r.depois.meses[0].nota, r.depois.meses[1].nota, r.depois.tudo], [false, '', 'falta 1', ''],
      `${rot}: o mês sai da ação em massa e o seguinte segue com "falta 1"`);
    ok(r.depois.coerente, `${rot}: a marca de falta acompanha a resposta`);
  }],
  ['b · data falha, posto grava', async ({ page, b, rot }) => {
    b.plano = { [A]: 'erro' }; b.releituraFalha = true;
    const r = await enviar(page, b, mes(page, 0), 3, rot);
    igual(r.envios.map(desc).sort(), PRIMEIRO_MES, `${rot}: primeiro envio do mês`);
    for (const [q, t, it] of fases(r)) {
      igual(t.resp, { A: '-', B: 'posso', C: '-', E: 'posso' }, `${rot}: ${q}, A volta a faltar e B fica respondido`);
      igual(it, { f1: 'confirmado', f2: 'confirmado', f3: 'recusado', f4: 'confirmado' }, `${rot}: ${q}, os postos de B gravados`);
      ok(t.ruim && t.aviso.includes(`Não entraram: ${fmt(A)}.`) && !t.aviso.includes(fmt(B)) && !t.aviso.includes('Salvou'),
        `${rot}: ${q}, o aviso diz que só A não entrou`, t.aviso);
      ok(t.coerente, `${rot}: ${q}, a marca de falta acompanha a resposta`);
    }
    igual([r.depois.meses[0].mes, r.depois.meses[0].nota, r.depois.tudo], [false, 'falta 1', 'Posso em todos os 2 dias'],
      `${rot}: com um dia só no mês, o botão do mês some e fica "falta 1"`);
    b.plano = {}; b.releituraFalha = false;
    const s = await enviar(page, b, dia(page, 0, 0, 'Posso'), 1, rot);
    igual(s.envios.map(desc), ['disponibilidade A posso'], `${rot}: a nova tentativa, pelo "Posso" do dia, manda só A`);
    igual(s.depois.resp, { A: 'posso', B: 'posso', C: '-', E: 'posso' }, `${rot}: depois dela o mês está respondido`);
    igual([s.depois.meses[0].nota, s.depois.ruim], ['', false], `${rot}: sem falta no mês e sem aviso de erro`);
  }],
  ['c · um posto grava, o outro falha', async ({ page, b, rot }) => {
    b.plano = { f2: 'erro' }; b.releituraFalha = true;
    const r = await enviar(page, b, mes(page, 0), 3, rot);
    igual(r.envios.map(desc).sort(), PRIMEIRO_MES, `${rot}: primeiro envio do mês`);
    for (const [q, t, it] of fases(r)) {
      igual(t.resp, { A: 'posso', B: '-', C: '-', E: 'posso' }, `${rot}: ${q}, B volta a faltar e A fica respondido`);
      igual(it, { f1: 'confirmado', f2: 'pendente', f3: 'recusado', f4: 'confirmado' }, `${rot}: ${q}, só o posto que falhou volta a pendente`);
      ok(t.ruim && t.aviso.includes(`Não entraram: ${fmt(B)}.`) && !t.aviso.includes(fmt(A)) && !t.aviso.includes('Salvou'),
        `${rot}: ${q}, o aviso diz que B não entrou`, t.aviso);
    }
    igual([r.depois.meses[0].mes, r.depois.meses[0].nota, r.depois.tudo], [false, 'falta 1', 'Posso em todos os 2 dias'],
      `${rot}: o botão do mês some com um dia só e fica "falta 1"`);
    const cartoes = await page.locator('#confirmar .vol-pede-fn').allInnerTexts();
    ok(cartoes.length === 1 && cartoes[0].includes('CÂMERA 1') && !cartoes[0].includes('PROJEÇÃO'),
      `${rot}: o cartão de confirmar pede só o posto que falhou`, JSON.stringify(cartoes));
    b.plano = {}; b.releituraFalha = false;
    const s = await enviar(page, b, dia(page, 0, 1, 'Posso'), 1, rot);
    igual(s.envios.map(desc), ['responder f2 confirmado'], `${rot}: a nova tentativa, pelo "Posso" de B, manda só f2`);
    igual([s.logo.aviso, s.logo.ruim], ['Confirmado. Obrigado!', false], `${rot}: e confirma`);
    igual(s.depois.resp, { A: 'posso', B: 'posso', C: '-', E: 'posso' }, `${rot}: depois dela o mês está respondido`);
    igual(s.itensDepois, { f1: 'confirmado', f2: 'confirmado', f3: 'recusado', f4: 'confirmado' }, `${rot}: o recusado de B segue recusado`);
  }],
  ['c2 · o mesmo, com a releitura funcionando', async ({ page, b, rot }) => {
    b.plano = { f2: 'erro' };
    const antes = b.leituras;
    const r = await enviar(page, b, mes(page, 0), 3, rot);
    ok(b.leituras > antes, `${rot}: a tela releu o banco depois da falha`);
    for (const [q, t, it] of fases(r)) {
      igual(t.resp, { A: 'posso', B: '-', C: '-', E: 'posso' }, `${rot}: ${q}, a tela bate com o banco`);
      igual(it, { f1: 'confirmado', f2: 'pendente', f3: 'recusado', f4: 'confirmado' }, `${rot}: ${q}, os postos batem com o banco`);
      ok(t.ruim && t.aviso.includes(`Não entraram: ${fmt(B)}.`), `${rot}: ${q}, a releitura bem-sucedida não apaga o aviso`, t.aviso);
    }
    b.plano = {};
    const s = await enviar(page, b, dia(page, 0, 1, 'Posso'), 1, rot);
    igual(s.envios.map(desc), ['responder f2 confirmado'], `${rot}: a nova tentativa manda só f2`);
  }],
  ['d · "Posso em todos" com falhas nos dois meses', async ({ page, b, rot }) => {
    b.plano = { f1: 'erro', [C]: 'erro' }; b.releituraFalha = true;
    const r = await enviar(page, b, todos(page), 4, rot);
    igual(r.envios.map(desc).sort(), ['disponibilidade A posso', 'disponibilidade C posso', 'responder f1 confirmado', 'responder f2 confirmado'],
      `${rot}: um envio por dia e por posto, nos dois meses`);
    ok(corposCertos(r.envios), `${rot}: token, culto, posto e resposta certos em cada envio`);
    for (const [q, t, it] of fases(r)) {
      igual(t.resp, { A: 'posso', B: '-', C: '-', E: 'posso' }, `${rot}: ${q}, A fica respondido; B e C voltam a faltar`);
      igual(it, { f1: 'pendente', f2: 'confirmado', f3: 'recusado', f4: 'confirmado' }, `${rot}: ${q}, f2 gravado e f1 de volta a pendente`);
      ok(t.ruim && t.aviso.includes(fmt(B)) && t.aviso.includes(fmt(C)) && !t.aviso.includes(fmt(A)) && !t.aviso.includes('Salvou'),
        `${rot}: ${q}, o aviso diz que B e C não entraram`, t.aviso);
    }
    igual([r.depois.meses[0].nota, r.depois.meses[1].nota, r.depois.tudo], ['falta 1', 'falta 1', 'Posso em todos os 2 dias'],
      `${rot}: falta um dia em cada mês e "Posso em todos" segue disponível`);
    b.plano = {}; b.releituraFalha = false;
    const s = await enviar(page, b, todos(page), 2, rot);
    igual(s.envios.map(desc).sort(), ['disponibilidade C posso', 'responder f1 confirmado'], `${rot}: a nova tentativa manda só C e f1`);
    igual([s.logo.aviso, s.logo.ruim], ['2 dias marcados como posso.', false], `${rot}: e anuncia os dois dias`);
    igual(s.depois.resp, { A: 'posso', B: 'posso', C: 'posso', E: 'posso' }, `${rot}: tudo respondido`);
    igual([s.depois.tudo, s.depois.meses[0].nota, s.depois.meses[1].nota], ['', '', ''], `${rot}: nenhuma ação em massa sobrando`);
  }],
  ['e · falha total sem desfazer o que mudou por fora', async ({ page, b, rot }) => {
    /* "Não posso" em C agenda a releitura de fundo (1,2 s). Ela fica presa
       até o mês estar no ar; nesse meio-tempo a liderança põe a pessoa num
       posto novo em E, e a releitura o traz para a tela. */
    b.segurarLeitura = true;
    const n0 = b.envios.length;
    await tocar(dia(page, 1, 0, 'Não posso'));
    await esperar(() => b.envios.length === n0 + 1 && b.emVoo === 0, `${rot}: C respondido`);
    await livre(page);
    igual(b.envios.slice(n0).map(desc), ['disponibilidade C nao'], `${rot}: antes, C respondido "Não posso"`);
    b.plano = { [A]: 'erro', f1: 'erro', f2: 'erro' }; b.segurar = new Set([A, 'f1', 'f2']);
    const n1 = b.envios.length;
    await tocar(mes(page, 0));
    await esperar(() => b.presas === 3, `${rot}: os três envios do mês no ar`);
    await esperar(() => b.leiturasPresas === 1, `${rot}: a releitura agendada no ar`);
    b.escalas.push(posto('cE', 'f5', E, 'EDIÇÃO', 'pendente'));
    b.portoes.leitura.abrir();
    await esperar(async () => (await itens(page)).f5 === 'pendente', `${rot}: o posto novo chegou pela releitura`);
    ok((await tela(page)).presos > 0, `${rot}: o mês segue no ar enquanto a releitura chega`);
    b.segurarLeitura = false; b.releituraFalha = true;
    b.portoes.envio.abrir();
    await assentar(page, b, false);
    const r = { logo: await tela(page), itensLogo: await itens(page) };
    await assentar(page, b, true);
    Object.assign(r, { depois: await tela(page), itensDepois: await itens(page) });
    igual(b.envios.slice(n1).map(desc).sort(), PRIMEIRO_MES, `${rot}: um envio por dia e por posto do mês, todos falhando`);
    for (const [q, t, it] of fases(r)) {
      igual(t.resp, { A: '-', B: '-', C: 'nao', E: '-' }, `${rot}: ${q}, A e B voltam a faltar, C segue "Não posso" e E pede o posto novo`);
      igual(it, { f1: 'pendente', f2: 'pendente', f3: 'recusado', f4: 'confirmado', f5: 'pendente' },
        `${rot}: ${q}, o posto novo que chegou durante o envio continua na tela`);
      ok(t.ruim && t.aviso.includes(fmt(A)) && t.aviso.includes(fmt(B)) && !t.aviso.includes('Salvou'),
        `${rot}: ${q}, o aviso diz que A e B não entraram`, t.aviso);
    }
    const cartoes = await page.locator('#confirmar .vol-pede-fn').allInnerTexts();
    ok(cartoes.some(x => x.includes('EDIÇÃO')), `${rot}: o cartão de confirmar mostra o posto novo de E`, JSON.stringify(cartoes));
    igual([r.depois.meses[0].mes, r.depois.meses[1].nota, r.depois.tudo], [true, 'falta 1', 'Posso em todos os 3 dias'],
      `${rot}: "Posso no mês" e "Posso em todos" voltam`);
    b.plano = {}; b.releituraFalha = false; b.segurar = new Set();
    const s = await enviar(page, b, mes(page, 0), 3, rot);
    igual(s.envios.map(desc).sort(), PRIMEIRO_MES, `${rot}: a nova tentativa manda A, f1 e f2 uma vez cada`);
    igual([s.logo.aviso, s.logo.ruim], ['2 dias marcados como posso.', false], `${rot}: e anuncia os dois dias`);
    igual(s.depois.resp, { A: 'posso', B: 'posso', C: 'nao', E: '-' }, `${rot}: o mês respondido; C e E como estavam`);
    igual(s.itensDepois, { f1: 'confirmado', f2: 'confirmado', f3: 'recusado', f4: 'confirmado', f5: 'pendente' }, `${rot}: os postos de fora do mês intocados`);
  }],
  ['f · eu_responder devolve mudou:0', async ({ page, b, rot }) => {
    b.plano = { f1: 'zero' }; b.releituraFalha = true;
    const r = await enviar(page, b, mes(page, 0), 3, rot);
    igual(r.envios.map(desc).sort(), PRIMEIRO_MES, `${rot}: primeiro envio do mês`);
    ok(r.logo.ruim && !r.logo.aviso.includes('marcados como posso'), `${rot}: não anuncia o mês como gravado`, r.logo.aviso);
    for (const [q, t, it] of fases(r)) {
      igual(t.resp, { A: 'posso', B: '-', C: '-', E: 'posso' }, `${rot}: ${q}, B segue sem resposta e A fica respondido`);
      igual(it, { f1: 'pendente', f2: 'confirmado', f3: 'recusado', f4: 'confirmado' }, `${rot}: ${q}, o posto com mudou:0 não aparece confirmado`);
      ok(t.ruim && t.aviso.includes('não está mais com você') && t.aviso.includes(fmt(B)) && !t.aviso.includes('Salvou'),
        `${rot}: ${q}, o aviso diz que o posto não está mais com a pessoa`, t.aviso);
    }
    igual([r.depois.meses[0].mes, r.depois.meses[0].nota], [false, 'falta 1'], `${rot}: o botão do mês some com um dia só e fica "falta 1"`);
    b.plano = {}; b.releituraFalha = false;
    const s = await enviar(page, b, dia(page, 0, 1, 'Posso'), 1, rot);
    igual(s.envios.map(desc), ['responder f1 confirmado'], `${rot}: a nova tentativa, pelo "Posso" de B, manda só f1`);
    igual(s.itensDepois, { f1: 'confirmado', f2: 'confirmado', f3: 'recusado', f4: 'confirmado' }, `${rot}: depois dela B está confirmado`);
  }],
  ['g · resposta vazia e resposta antiga contam como gravadas', async ({ page, b, rot }) => {
    b.plano = { [A]: 'vazio', f1: 'legado', f2: 'legado' };
    const r = await enviar(page, b, mes(page, 0), 3, rot);
    igual(r.envios.map(desc).sort(), PRIMEIRO_MES, `${rot}: um envio por dia e por posto`);
    igual([r.logo.aviso, r.logo.ruim], ['2 dias marcados como posso.', false], `${rot}: 204 sem corpo e null sem mudou anunciam os dois dias`);
    igual(r.depois.resp, { A: 'posso', B: 'posso', C: '-', E: 'posso' }, `${rot}: o mês respondido`);
    igual(r.itensDepois, { f1: 'confirmado', f2: 'confirmado', f3: 'recusado', f4: 'confirmado' }, `${rot}: os postos confirmados`);
  }],
];

async function cena(largura, nome, corpo) {
  const rot = `${largura}/${nome.split(' ')[0]}`;
  console.log(`${largura} px · cena ${nome}`);
  const { context, page, b, erros } = await abrir(largura);
  try {
    const t = await tela(page);
    igual(t.resp, { A: '-', B: '-', C: '-', E: 'posso' }, `${rot}: começa com A, B e C sem resposta e E confirmado`);
    igual([t.meses[0]?.mes, t.meses[1]?.mes, t.meses[1]?.nota, t.tudo], [true, false, 'falta 1', 'Posso em todos os 3 dias'], `${rot}: ações em massa iniciais`);
    igual(await itens(page), { f1: 'pendente', f2: 'pendente', f3: 'recusado', f4: 'confirmado' }, `${rot}: postos iniciais`);
    await corpo({ page, b, rot });
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${rot}: sem rolagem horizontal`);
    ok(erros.length === 0, `${rot}: sem exceções de página`, erros.join(' | '));
  } catch (e) {
    ok(false, `${rot}: cena interrompida`, String(e?.message || e).split('\n')[0]);
  } finally {
    b.portoes.envio.abrir(); b.portoes.leitura.abrir();
    await context.close().catch(() => {});
  }
}

try {
  for (const largura of [390, 1440]) for (const [nome, corpo] of CENAS) await cena(largura, nome, corpo);
  console.log(`posso-parcial-tela: ${feitas}/${feitas + falhas.length} ok`);
  if (falhas.length) { console.log(`falharam ${falhas.length}:`); for (const f of falhas) console.log('  - ' + f); process.exitCode = 1; }
} finally { await browser.close(); }
