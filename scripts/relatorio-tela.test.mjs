/* =============================================================================
   O RELATÓRIO DO LÍDER DO DIA, NA TELA · 26/10/2026

   Achado no mês sintético encadeado (pacote de aceite do ciclo atual), com
   a página real: `eu_relatorio` (75) só aceita o relatório depois que o culto
   começa, e culto regular não tem hora cadastrada, então o começo vale 18h.
   A página desenhava o formulário desde a meia-noite do dia do culto
   (`paraRelatar`: só `data <= hoje`). O líder do dia escrevia ao fim do culto
   das 10h, tocava "Enviar relatório" e lia o texto cru do banco:

       RELATORIO_ANTES_DA_HORA: o culto de 2026-11-01 ainda nao comecou, e
       relatorio se escreve depois.

   A própria 75 diz que "a tela do voluntário já não desenha o formulário
   antes do culto começar": esta prova cobra isso, pela mesma conta que o
   banco faz (`horasAteCulto`, 18h sem hora cadastrada), e cobra que nenhum
   código do banco chegue cru na tela. A hora em si (18h ou a hora real do
   culto) é decisão separada (D2); esta prova não a muda.

   Abre /eu/<token> fora da demonstração, com o relógio do navegador fixado
   e um banco fictício em memória que aplica a regra do banco. Nada de rede
   externa, banco, cron ou envio.
   BASE=http://127.0.0.1:3500 CHROME_BIN=/caminho/chrome node scripts/relatorio-tela.test.mjs
   ============================================================================= */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const origem = new URL(BASE);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(origem.hostname)) throw new Error('BASE precisa ser local');
const browser = await chromium.launch({ ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}) });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };

let feitas = 0;
const falhas = [];
const ok = (valor, nome, detalhe = '') => {
  if (valor) { feitas++; console.log('  ok ' + nome); return; }
  falhas.push(nome); console.log('  FALHOU ' + nome + (detalhe ? ` · ${detalhe}` : ''));
};

/* um domingo de culto às 10h (sem hora cadastrada, como o culto regular) e
   um evento numa quarta às 19h30 (com hora) */
const DOMINGO = '2026-11-01', QUARTA = '2026-11-04';
const LIDER1 = { token: 'fict-lider-um', nome: 'Alan Teste' };
const LIDER2 = { token: 'fict-lider-dois', nome: 'Joana Teste' };
const cultos = {
  [DOMINGO]: { culto_id: 'c-domingo', data: DOMINGO, evento: null, inicio: null },
  [QUARTA]: { culto_id: 'c-quarta', data: QUARTA, evento: 'Evento Fictício', inicio: '19:30:00' },
};
const novoBanco = () => ({ relatos: {} });   /* culto_id -> { relatorio, problemas, por } */
const item = (b, c, eu, funcao) => {
  const r = b.relatos[c.culto_id];
  return { ...c, funcao, funcao_id: 'f-' + funcao, status: 'confirmado', relata: true, primeira_vez: false,
    escalado_em: null, obs: null, repertorio: null, plantao: false,
    relatorio: r?.relatorio ?? null, problemas: r?.problemas ?? null,
    relatado_por: r ? r.por.nome : null, relatado_eu: r ? r.por.token === eu.token : null };
};

async function abrir(b, eu, quando, largura, data = DOMINGO) {
  const context = await browser.newContext({ viewport: { width: largura, height: 900 }, serviceWorkers: 'block',
    timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' });
  const agora = new Date(quando);
  await context.clock.setFixedTime(agora);
  await context.addInitScript(base => localStorage.setItem('escala.credenciais', JSON.stringify({
    url: base + '/supabase-falso', key: 'fixture-sem-credencial' })), origem.origin);
  const envios = [];
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
      if (fn === 'eu_dados') {
        const funcao = eu === LIDER1 ? 'LÍDER 1' : 'LÍDER 2';
        return await json(200, [{ nome: eu.nome, equipe: 'Connect', escalas: [item(b, cultos[data], eu, funcao)], indisponivel: [], disponivel: [] }]);
      }
      if (fn === 'eu_proximos_domingos') return await json(200, [DOMINGO, '2026-11-07', '2026-11-08'].map(d => ({ data: d })));
      if (fn === 'eu_relatorio') {
        envios.push(corpo);
        /* a regra do banco (75:252): o culto começa em `inicio`, ou às 18h */
        const c = Object.values(cultos).find(x => x.culto_id === corpo.p_culto_id);
        const comeco = Date.parse(`${c.data}T${(c.inicio || '18:00:00').slice(0, 8)}-03:00`);
        if (comeco > agora.getTime()) {
          return await json(400, { code: 'P0001', details: null, hint: null,
            message: `RELATORIO_ANTES_DA_HORA: o culto de ${c.data} ainda nao comecou, e relatorio se escreve depois.` });
        }
        b.relatos[c.culto_id] = { relatorio: (corpo.p_texto || '').trim() || null, problemas: (corpo.p_problemas || '').trim() || null, por: eu };
        return await r.fulfill({ status: 204, headers: CORS });
      }
      if (fn === 'quem_sou' || fn === 'eu_espaco') return await json(200, null);
      return await json(200, []);
    } catch { /* contexto fechado */ }
  });
  await context.routeWebSocket('**', ws => new URL(ws.url()).host === origem.host ? ws.connectToServer() : ws.close());
  const page = await context.newPage();
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(120000);
  await page.goto(`${BASE}/eu/${eu.token}`, { waitUntil: 'domcontentloaded' });
  /* a página carregou quando o nome da pessoa aparece */
  await page.getByText(eu.nome.split(' ')[0], { exact: false }).first().waitFor({ timeout: 90000 });
  await page.waitForTimeout(400);
  return { context, page, envios, erros };
}
const semCodigoCru = t => !/[A-Z]{3,}_[A-Z_]{3,}/.test(t);

for (const largura of [390, 1440]) {
  const b = novoBanco();
  /* 1 · 12h30 do domingo, depois do culto das 10h: o banco ainda recusa */
  {
    const { context, page, envios, erros } = await abrir(b, LIDER1, `${DOMINGO}T12:30:00-03:00`, largura);
    const formularios = await page.locator('.relatorio').count();
    ok(formularios === 0, `${largura} · 12h30: o formulário não aparece antes da hora em que o banco aceita`, `${formularios} formulário(s)`);
    if (formularios) {
      await page.locator(`#rel${cultos[DOMINGO].culto_id}`).fill('Equipe completa.');
      await page.locator('.relatorio').getByRole('button', { name: 'Enviar relatório' }).click();
      const aviso = page.locator('.relatorio .aviso.erro');
      await aviso.waitFor();
      const t = (await aviso.textContent()).trim();
      ok(semCodigoCru(t), `${largura} · 12h30: nenhum código do banco chega cru na tela`, t);
    }
    ok(!b.relatos[cultos[DOMINGO].culto_id], `${largura} · 12h30: nada foi gravado`);
    ok(!erros.length, `${largura} · 12h30: sem erro de página`, erros.join(' | '));
    await context.close();
  }
  /* 2 · 18h35: o formulário aparece e o envio entra */
  {
    const { context, page, envios, erros } = await abrir(b, LIDER1, `${DOMINGO}T18:35:00-03:00`, largura);
    const rel = page.locator('.relatorio');
    ok(await rel.count() === 1, `${largura} · 18h35: o formulário aparece quando o banco já aceita`);
    await page.locator(`#rel${cultos[DOMINGO].culto_id}`).fill('Equipe completa, recepção tranquila.');
    await rel.getByRole('button', { name: 'Enviar relatório' }).click();
    await rel.locator('.pill.ok').waitFor();
    ok(b.relatos[cultos[DOMINGO].culto_id]?.relatorio === 'Equipe completa, recepção tranquila.', `${largura} · 18h35: o relatório entra`);
    ok(envios.length === 1 && envios[0].p_token === LIDER1.token && envios[0].p_culto_id === cultos[DOMINGO].culto_id,
      `${largura} · 18h35: uma chamada, com o token e o culto certos`, JSON.stringify(envios));
    ok(!erros.length, `${largura} · 18h35: sem erro de página`, erros.join(' | '));
    await context.close();
  }
  /* 3 · 18h45: o LÍDER 2 vê de quem é o texto antes de salvar por cima */
  {
    const { context, page, erros } = await abrir(b, LIDER2, `${DOMINGO}T18:45:00-03:00`, largura);
    const rel = page.locator('.relatorio');
    await rel.waitFor();
    ok((await rel.locator('.eu-lbl').textContent()).trim() === 'Relatório de Alan', `${largura} · 18h45: o rótulo diz de quem é`);
    ok(((await rel.locator('[role="note"]').textContent()) || '').includes('Este texto é de Alan Teste'), `${largura} · 18h45: o aviso antes de salvar por cima continua`);
    ok(await rel.getByRole('button', { name: 'Atualizar relatório' }).count() === 1, `${largura} · 18h45: o botão diz "Atualizar relatório"`);
    ok(!erros.length, `${largura} · 18h45: sem erro de página`, erros.join(' | '));
    await context.close();
  }
  /* 4 · segunda de manhã: o relatório do domingo continua ali */
  {
    const { context, page, erros } = await abrir(b, LIDER1, '2026-11-02T10:00:00-03:00', largura);
    ok(await page.locator('.relatorio').count() === 1, `${largura} · segunda 10h: o relatório do domingo continua aberto`);
    ok((await page.locator('.relatorio .eu-lbl').textContent()).trim() === 'Relatório enviado', `${largura} · segunda 10h: "Relatório enviado"`);
    ok(!erros.length, `${largura} · segunda 10h: sem erro de página`, erros.join(' | '));
    await context.close();
  }
  /* 5 · evento com hora (19h30): fechado às 19h, aberto às 19h45 */
  {
    const a = await abrir(b, LIDER1, `${QUARTA}T19:00:00-03:00`, largura, QUARTA);
    ok(await a.page.locator('.relatorio').count() === 0, `${largura} · evento 19h: fechado antes da hora do evento`);
    ok(!a.erros.length, `${largura} · evento 19h: sem erro de página`, a.erros.join(' | '));
    await a.context.close();
    const c = await abrir(b, LIDER1, `${QUARTA}T19:45:00-03:00`, largura, QUARTA);
    ok(await c.page.locator('.relatorio').count() === 1, `${largura} · evento 19h45: aberto depois da hora do evento`);
    ok(!c.erros.length, `${largura} · evento 19h45: sem erro de página`, c.erros.join(' | '));
    await c.context.close();
  }
}
await browser.close();
console.log(`\nrelatório na tela: ${feitas} ok · ${falhas.length} falha(s)`);
if (falhas.length) process.exit(1);
