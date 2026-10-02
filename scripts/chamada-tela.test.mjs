/* CHAMAR QUEM PODE COBRIR, NA TELA — 106, 02/10/2026.

   Fase 4 do estudo do ServoApp. O que esta prova exige, no harness:

     1. Escala do líder: a seção "Chamar quem pode cobrir" só existe quando o
        banco responde (sem a 106, nada); uma linha por vaga aberta; "Chamar
        quem pode" lista quem o banco deu, com os três primeiros ainda não
        chamados já marcados; chamar manda exatamente os marcados, avisa no
        celular os convites novos e diz quem ficou de fora e por quê; cada
        chamado aparece com o estado e, enquanto espera, o WhatsApp com o
        recado e o link pessoal; "Parar de chamar" cancela; quem aceitou
        aparece com "Atualizar a escala"; recuso do banco vira frase; o
        celular não rola de lado;
     2. página de quem serve: a seção "Convites para cobrir", o convite aberto
        com "Posso cobrir" e "Não posso", o do dia em que ela avisou que não
        pode com o motivo e "Posso nesse dia", o fechado como notícia; aceitar
        manda o convite certo e confirma; "alguém já ficou" quando o banco diz;
        sem a variante, nada disso.

   Roda com BASE=http://127.0.0.1:3500 node scripts/chamada-tela.test.mjs */
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const OUT = '/tmp/chamada-tela';
mkdirSync(OUT, { recursive: true });
const esperar = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0, feitas = 0;
const ok = (c, nome, extra = '') => { feitas++; if (!c) falhas++; console.log(`  ${c ? 'ok ' : 'FALHOU'} ${nome}${!c && extra ? '\n      ' + extra : ''}`); };
const nav = await chromium.launch({ executablePath: chromeDoContainer() });
async function ctx(w, h, toque) {
  const c = await nav.newContext({ viewport: { width: w, height: h }, isMobile: toque, hasTouch: toque, deviceScaleFactor: 2 });
  await c.route('**', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
  return c;
}
const semRolagemDeLado = p => p.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1);
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const responder = (r, corpo) => r.request().method() === 'OPTIONS'
  ? r.fulfill({ status: 204, headers: CORS })
  : r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(corpo) });

const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
/* os cultos que vêm no mês (sábado e domingo), como o harness monta */
const DIAS = (() => {
  const out = []; const d = new Date(hoje + 'T12:00:00Z');
  for (let k = 0; k < 31; k++) {
    const x = new Date(d.getTime() + k * 86400000);
    if (x.getUTCMonth() !== d.getUTCMonth()) break;
    if (x.getUTCDay() === 6 || x.getUTCDay() === 0) out.push(x.toISOString().slice(0, 10));
  }
  return out;
})();

try {
  /* 0 · sem a 106 no banco, a seção não existe (a pergunta falha) */
  {
    const c = await ctx(1440, 900, false); const p = await c.newPage();
    await p.goto(`${BASE}/escala?demo=1&m=${hoje.slice(0, 7)}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.es-casca', { timeout: 30000 }); await esperar(2500);
    for (const d of DIAS.slice(0, 3)) {
      const dia = p.locator(`#d${d}`);
      if (await dia.count() && !(await dia.evaluate(e => e.open))) { await dia.locator(':scope > summary').click(); await esperar(200); }
    }
    await esperar(800);
    ok(await p.locator('section.es-ec-chamar').count() === 0, 'sem a 106 no banco, a escala fica como era');
    await c.close();
  }

  /* 1 · Escala do líder */
  for (const [w, h, toque, nome] of [[1440, 900, false, '1440'], [390, 844, true, '390']]) {
    const c = await ctx(w, h, toque); const p = await c.newPage();
    let chamadas = [];
    let candidatos = [];
    let chamar = null;
    const pedidos = { chamar: [], cancelar: [], aviso: [] };
    await p.route('**/rest/v1/rpc/chamadas_do_dia', r => responder(r, chamadas));
    await p.route('**/rest/v1/rpc/chamar_candidatos', r => responder(r, candidatos));
    await p.route('**/rest/v1/rpc/chamar_para_cobrir', r => {
      if (r.request().method() !== 'OPTIONS') pedidos.chamar.push(r.request().postDataJSON());
      return responder(r, chamar);
    });
    await p.route('**/rest/v1/rpc/cancelar_chamadas', r => {
      if (r.request().method() !== 'OPTIONS') pedidos.cancelar.push(r.request().postDataJSON());
      return responder(r, { ok: true, canceladas: 2 });
    });
    await p.route(`${BASE}/api/aviso/chamada`, r => {
      pedidos.aviso.push(r.request().postDataJSON());
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{"enviados":0}' });
    });
    await p.goto(`${BASE}/escala?demo=1&m=${hoje.slice(0, 7)}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.es-casca', { timeout: 30000 }); await esperar(2500);

    /* o primeiro culto que vem com vaga aberta */
    let dia = null, sec = null;
    for (const d of DIAS) {
      const x = p.locator(`#d${d}`);
      if (!(await x.count())) continue;
      if (!(await x.evaluate(e => e.open))) { await x.locator(':scope > summary').click(); await esperar(500); }
      const s = x.locator('section.es-ec-chamar');
      if (await s.count()) { dia = x; sec = s; break; }
    }
    ok(!!sec, `${nome}: um dia com vaga aberta tem "Chamar quem pode cobrir"`);
    if (!sec) { await c.close(); continue; }
    const vagas = sec.locator('li.es-ec-cv');
    const nVagas = await vagas.count();
    ok(nVagas >= 1 && new RegExp(`^${nVagas} vagas? abertas?$`).test(await sec.locator('.es-ec-ordem-resumo').innerText()),
      `${nome}: uma linha por vaga aberta, e a conta no alto`, `${nVagas} | ${await sec.locator('.es-ec-ordem-resumo').innerText()}`);
    const vaga = vagas.first();
    const funcao = (await vaga.locator('.es-ec-cv-fn').innerText()).trim();

    /* quem pode: pessoas de verdade do harness, tiradas da lista do posto */
    const pessoas = await dia.locator('.es-ec-quem select option[value]:not([value=""])').evaluateAll(os =>
      [...new Map(os.map(o => [o.value, o.textContent.replace(/^.*?·\s*|\s·.*$/g, '').trim()])).entries()].slice(0, 5));
    candidatos = [
      { voluntario_id: pessoas[0][0], nome: 'Pessoa Um', nivel: 'titular', disse_que_pode: true, no_mes: 0, limite: 2, chamada: null },
      { voluntario_id: pessoas[1][0], nome: 'Pessoa Dois', nivel: 'reserva', disse_que_pode: false, no_mes: 1, limite: 2, chamada: 'recusada' },
      { voluntario_id: pessoas[2][0], nome: 'Pessoa Tres', nivel: 'titular', disse_que_pode: false, no_mes: 1, limite: 2, chamada: null },
      { voluntario_id: pessoas[3][0], nome: 'Pessoa Quatro', nivel: 'titular', disse_que_pode: false, no_mes: 2, limite: 2, chamada: null },
      { voluntario_id: pessoas[4][0], nome: 'Pessoa Cinco', nivel: 'titular', disse_que_pode: false, no_mes: 3, limite: 4, chamada: null },
    ];
    await vaga.getByRole('button', { name: 'Chamar quem pode' }).click(); await esperar(600);
    const escolha = vaga.locator('.es-ec-cv-escolha');
    const marcados = await escolha.locator('input[type=checkbox]').evaluateAll(es => es.map(e => e.checked));
    ok(marcados.join(',') === 'true,false,true,true,false',
      `${nome}: vêm marcados os três primeiros ainda não chamados (nunca quem disse que não pode cobrir)`, marcados.join(','));
    ok(/disse que pode · 0 escalas no mês \(limite 2\)/.test(await escolha.innerText()) && /disse que não pode cobrir/.test(await escolha.innerText()),
      `${nome}: cada pessoa diz se disse que pode, quantas escalas tem no mês e se já recusou`);
    if (toque) {
      const alt = await escolha.locator('label.es-ec-cv-pessoa').evaluateAll(es => es.map(e => Math.round(e.getBoundingClientRect().height)));
      ok(alt.every(a => a >= 44), `${nome}: cada pessoa é um alvo de 44 no dedo`, alt.join(','));
    }
    const alinhada = await escolha.locator('label.es-ec-cv-pessoa').first().evaluate(l => {
      const i = l.querySelector('input').getBoundingClientRect(), n = l.querySelector('.es-ec-cv-nome').getBoundingClientRect();
      return Math.abs((i.top + i.height / 2) - (n.top + n.height / 2));
    });
    ok(alinhada <= 4, `${nome}: a caixinha fica na altura do nome, e não da linha de baixo`, `${alinhada}px`);
    ok(await escolha.getByRole('button', { name: 'Chamar 3 pessoas' }).count() === 1, `${nome}: o botão diz quantas`);
    await escolha.screenshot({ path: `${OUT}/escolha-${nome}.png` });

    /* chamar: manda exatamente os marcados; o banco recusa um, com motivo */
    chamar = { ok: true, chamadas: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
      recusados: [{ voluntario_id: pessoas[3][0], motivo: 'INDISPONIVEL' }] };
    chamadas = [
      { id: '11111111-1111-4111-8111-111111111111', culto_id: 'x', funcao_id: 'x', voluntario_id: pessoas[0][0], nome: 'Pessoa Um', status: 'aberta', criado_em: '2026-10-02T10:00:00Z', respondido_em: null },
    ];
    await escolha.getByRole('button', { name: 'Chamar 3 pessoas' }).click(); await esperar(1000);
    const ped = pedidos.chamar.at(-1) || {};
    ok(JSON.stringify([...(ped.p_voluntarios || [])].sort()) === JSON.stringify([pessoas[0][0], pessoas[2][0], pessoas[3][0]].sort())
      && !!ped.p_culto && !!ped.p_funcao, `${nome}: chamar manda exatamente os marcados, com o culto e o posto`, JSON.stringify(ped));
    ok(pedidos.aviso.some(a => (a.chamadas || []).length === 2), `${nome}: os convites novos vão para o aviso no celular`, JSON.stringify(pedidos.aviso));
    const toasts = () => p.locator('.es-toast').allInnerTexts();
    ok((await toasts()).some(t => t === '2 pessoas chamadas. Pessoa avisou que não pode nesse dia.'),
      `${nome}: a frase diz quantas e quem ficou de fora, e por quê`, (await toasts()).join(' | '));
    ok(await escolha.count() === 0, `${nome}: a escolha fecha`);

    /* os chamados da vaga aparecem; os de outra vaga, não */
    const cultoId = ped.p_culto, funcaoId = ped.p_funcao;
    chamadas = [
      { id: 'a1', culto_id: cultoId, funcao_id: funcaoId, voluntario_id: pessoas[0][0], nome: 'Pessoa Um', status: 'aberta', criado_em: '2026-10-02T10:00:00Z', respondido_em: null },
      { id: 'a2', culto_id: cultoId, funcao_id: funcaoId, voluntario_id: pessoas[2][0], nome: 'Pessoa Tres', status: 'recusada', criado_em: '2026-10-02T10:00:00Z', respondido_em: null },
      { id: 'a3', culto_id: cultoId, funcao_id: 'outra', voluntario_id: pessoas[4][0], nome: 'Pessoa Cinco', status: 'aberta', criado_em: '2026-10-02T10:00:00Z', respondido_em: null },
    ];
    await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await esperar(800);
    const linhas = vaga.locator('li.es-ec-cv-chamado');
    ok(await linhas.count() === 2, `${nome}: os chamados desta vaga, e nenhum de outra`, String(await linhas.count()));
    ok(/Pessoa Um\s*esperando/.test((await linhas.nth(0).innerText()).replace(/\n/g, ' ')) && /Pessoa Tres\s*não pode/.test((await linhas.nth(1).innerText()).replace(/\n/g, ' ')),
      `${nome}: quem espera primeiro, cada um com o estado`, (await linhas.allInnerTexts()).join(' / '));
    const zap = linhas.nth(0).locator('a');
    const href = await zap.getAttribute('href').catch(() => '');
    ok(/^https:\/\/wa\.me\/55\d{10,11}\?text=/.test(href || '') && decodeURIComponent(href).includes(`${funcao}`) && /\/eu\/[^#\s]+#chamadas/.test(decodeURIComponent(href)),
      `${nome}: quem espera tem o WhatsApp com o recado e o link pessoal, aberto nos convites`, (href || '').slice(0, 120));
    ok(await linhas.nth(1).locator('a').count() === 0, `${nome}: quem já respondeu não tem WhatsApp`);
    ok(await vaga.getByRole('button', { name: 'Chamar mais' }).count() === 1, `${nome}: com chamados, o botão vira "Chamar mais"`);

    /* parar de chamar */
    await p.locator('.es-toast').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    await vaga.getByRole('button', { name: 'Parar de chamar' }).click(); await esperar(800);
    ok(pedidos.cancelar.length === 1 && pedidos.cancelar[0].p_funcao === funcaoId, `${nome}: "Parar de chamar" cancela a vaga certa`);
    ok((await toasts()).some(t => t === '2 convites cancelados'), `${nome}: e diz quantos`, (await toasts()).join(' | '));

    /* quem aceitou depois que a tela abriu */
    chamadas = [{ ...chamadas[0], status: 'aceita' }];
    await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await esperar(800);
    const aceitas = sec.locator('.es-ec-cv-aceitas');
    ok(await aceitas.count() === 1 && /Pessoa aceitou/.test(await aceitas.innerText())
      && await aceitas.getByRole('button', { name: 'Atualizar a escala' }).count() === 1,
      `${nome}: quem aceitou aparece, com "Atualizar a escala"`);

    /* recuso do banco vira frase; lista vazia diz por quê */
    chamar = { ok: false, erro: 'VAGA_OCUPADA' };
    await p.locator('.es-toast').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    await vaga.getByRole('button', { name: 'Chamar mais' }).click(); await esperar(600);
    await vaga.locator('.es-ec-cv-escolha').getByRole('button', { name: /^Chamar \d pessoas?$/ }).click(); await esperar(800);
    ok((await toasts()).some(t => /A vaga já tem alguém\. Recarregue a tela para ver quem\./.test(t)), `${nome}: "vaga ocupada" diz o que fazer`, (await toasts()).join(' | '));
    candidatos = [];
    const outra = vagas.nth(nVagas > 1 ? 1 : 0);
    if (nVagas > 1) {
      await outra.getByRole('button', { name: /^Chamar (quem pode|mais)$/ }).click(); await esperar(600);
      ok(/Ninguém mais pode cobrir/.test(await outra.innerText()), `${nome}: sem ninguém para chamar, diz por quê`);
    }
    ok(await semRolagemDeLado(p), `${nome}: a escala não rola de lado`);
    await sec.screenshot({ path: `${OUT}/escala-chamar-${nome}.png` });
    await c.close();
  }

  /* 2 · página de quem serve */
  for (const [w, h, toque, nome] of [[1440, 900, false, '1440'], [390, 844, true, '390']]) {
    const c = await ctx(w, h, toque); const p = await c.newPage();
    let resposta = { ok: true, status: 'aceita' };
    const pedidos = [];
    await p.route('**/rest/v1/rpc/eu_chamada_responder', r => {
      if (r.request().method() !== 'OPTIONS') pedidos.push(r.request().postDataJSON());
      return responder(r, resposta);
    });
    await p.goto(`${BASE}/eu/x?demo=chamada`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.vol-in', { timeout: 30000 }); await esperar(2000);
    const sec = p.locator('#chamadas');
    ok(await sec.count() === 1 && /Convites para cobrir/i.test(await sec.innerText()), `${nome}: a seção de convites`);
    const cards = sec.locator('.vol-troca');
    ok(await cards.count() === 2, `${nome}: dois convites abertos`, String(await cards.count()));
    const c1 = cards.nth(0), c2 = cards.nth(1);
    ok(await c1.getByRole('button', { name: 'Posso cobrir' }).count() === 1 && await c1.getByRole('button', { name: 'Não posso' }).count() === 1,
      `${nome}: o convite aberto oferece "Posso cobrir" e "Não posso"`);
    ok(/Você marcou que não pode nesse dia/.test(await c2.innerText()) && await c2.getByRole('button', { name: 'Posso cobrir' }).count() === 0
      && await c2.getByRole('button', { name: 'Posso nesse dia' }).count() === 1,
      `${nome}: no dia em que ela avisou que não pode: o motivo e "Posso nesse dia", sem "Posso cobrir"`);
    ok(/Alguém já ficou com essa vaga/.test(await sec.locator('.vol-linha').innerText()), `${nome}: o convite fechado vira notícia`);
    const alt = await c1.locator('button').evaluateAll(es => es.map(e => Math.round(e.getBoundingClientRect().height)));
    ok(alt.every(a => a >= 44), `${nome}: botões de 44 no dedo`, alt.join(','));
    await sec.screenshot({ path: `${OUT}/eu-chamadas-${nome}.png` });

    await c1.getByRole('button', { name: 'Posso cobrir' }).click(); await esperar(900);
    ok(pedidos.at(-1)?.p_chamada === 'ch1' && pedidos.at(-1)?.p_aceita === true && pedidos.at(-1)?.p_token === 'x',
      `${nome}: aceitar manda o convite certo`, JSON.stringify(pedidos.at(-1)));
    ok(/Pronto\. HEAD é sua, já confirmada\./i.test(await p.locator('.vol-flash').textContent().catch(() => '')),
      `${nome}: e confirma`, await p.locator('.vol-flash').innerText().catch(() => '(sem aviso)'));
    resposta = { ok: false, erro: 'PREENCHIDA' };
    await esperar(300);
    await sec.locator('.vol-troca').first().getByRole('button', { name: 'Posso cobrir' }).click(); await esperar(900);
    ok(/Alguém já ficou com essa vaga\. Obrigado por responder\./i.test(await p.locator('.vol-flash').textContent().catch(() => '')),
      `${nome}: quando outra pessoa aceitou antes, diz isso`, await p.locator('.vol-flash').innerText().catch(() => '(sem aviso)'));
    ok(await semRolagemDeLado(p), `${nome}: a página não rola de lado`);
    await c.close();
  }

  /* 3 · sem a variante, a página de sempre */
  {
    const c = await ctx(390, 844, true); const p = await c.newPage();
    await p.goto(`${BASE}/eu/x?demo=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.vol-in', { timeout: 30000 }); await esperar(1500);
    ok(await p.locator('#chamadas').count() === 0, 'sem convite, a página do voluntário fica como era');
    await c.close();
  }
} catch (e) {
  falhas++; console.log('  FALHOU (exceção)', e?.message || e);
} finally {
  await nav.close();
}
console.log(`chamada-tela: ${feitas - falhas}/${feitas} ${falhas ? 'FALHOU' : 'ok'}`);
process.exit(falhas ? 1 : 0);
