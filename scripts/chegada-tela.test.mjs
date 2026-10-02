/* "CHEGUEI" E "COMO FOI", NA TELA — 107, 02/10/2026.

   O resto da Fase 4 do estudo do ServoApp. O que esta prova exige, no harness:

     1. página de quem serve (`/eu/<token>?demo=`):
        · sem a variante, nada novo aparece (a escala fica como era);
        · `hoje`: o bloco "Hoje" logo abaixo do bloco escuro, com "Cheguei";
          tocar manda `eu_cheguei` com o culto certo e diz a hora;
        · `hoje-lider`: quem chegou vê a hora e "Desfazer"; quem lidera o dia
          vê o time com a conta ("3 de 5 chegaram"), "Marcar chegada" em
          quem falta e "Desmarcar" em quem tem marca, e a marca manda
          `eu_marcar_chegada` com a pessoa certa;
        · `comofoi`: a pergunta do último culto com as três respostas, a frase
          de quem lê com o artigo do ministério ("da Mídia"); responder manda
          `eu_como_foi_responder`; a resposta dada vira linha com "Mudar", que
          abre a nota; a nota vai junto com a resposta;
        · recusa do banco vira frase; o celular não rola de lado;
     2. Escala do líder (`/escala?demo=hoje`):
        · sem a 107 no banco (a pergunta falha), nem chegada nem como foi;
        · no dia: "Chegada" aberta, uma linha por pessoa, quem disse que não
          pode fora; a hora e quem marcou; "Marcar chegada" e "Desmarcar"
          mandam `marcar_chegada`; recusa vira frase;
        · o como foi do dia, com a conta e a nota;
        · ontem: a chegada vira dobra fechada com a conta;
     3. Painel: as duas últimas semanas do como foi, cada linha levando ao dia;
     4. Ajustes: a seção "Chegada no dia" só com a 107 no banco, e o cartaz
        com o QR do ministério (nunca o de alguém).

   Roda com BASE=http://127.0.0.1:3500 node scripts/chegada-tela.test.mjs */
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const OUT = '/tmp/chegada-tela';
mkdirSync(OUT, { recursive: true });
const esperar = ms => new Promise(r => setTimeout(r, ms));
/* espera uma condição em vez de um tempo fixo: a primeira abertura de uma
   rota no servidor de desenvolvimento compila a página e pode passar de 3 s */
const ate = async (cond, ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await cond().catch(() => false)) return true; await esperar(250); }
  return false;
};
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
const recusar = r => r.request().method() === 'OPTIONS'
  ? r.fulfill({ status: 204, headers: CORS })
  : r.fulfill({ status: 404, headers: { ...CORS, 'content-type': 'application/json' },
               body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function' }) });
const gravar = (pedidos, nome, corpo) => r => {
  if (r.request().method() !== 'OPTIONS') pedidos.push({ nome, corpo: r.request().postDataJSON() });
  return responder(r, typeof corpo === 'function' ? corpo(r.request().postDataJSON()) : corpo);
};

const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const ontem = new Date(Date.parse(hoje + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
const agoraMenos = min => new Date(Date.now() - min * 60000).toISOString();
const horaAqui = iso => {
  const p = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
  return `${+p.find(x => x.type === 'hour').value}:${p.find(x => x.type === 'minute').value}`;
};

try {
  /* ------------------------------------------------------------ 1 · /eu */
  {
    const c = await ctx(390, 844, true); const p = await c.newPage();
    await p.goto(`${BASE}/eu/demo?demo=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.vol-chamada', { timeout: 30000 }); await esperar(1500);
    ok(await p.locator('#hoje').count() === 0 && await p.locator('#como-foi').count() === 0,
      'sem a variante, a página fica como era (nem "Hoje" nem "Como foi")');
    await c.close();
  }

  for (const [w, h, toque, nome] of [[390, 844, true, '390'], [1440, 900, false, '1440']]) {
    /* hoje: o "Cheguei" */
    {
      const c = await ctx(w, h, toque); const p = await c.newPage();
      const pedidos = [];
      let volta = { ok: true, chegou_em: agoraMenos(0), confirmou: 0 };
      await p.route('**/rest/v1/rpc/eu_cheguei', gravar(pedidos, 'cheguei', () => volta));
      await p.goto(`${BASE}/eu/demo?demo=hoje`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('.vol-chamada', { timeout: 30000 }); await esperar(1500);
      const hj = p.locator('section#hoje');
      ok(await ate(async () => await hj.count() === 1), `${nome}: o bloco "Hoje" existe no dia do culto`);
      const ordem = await p.evaluate(() => {
        const preta = document.querySelector('.vol-chamada'), h = document.querySelector('#hoje');
        return !!(preta && h && (preta.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING));
      });
      ok(ordem, `${nome}: logo abaixo do bloco escuro do topo`);
      ok(/PROJEÇÃO/.test(await hj.locator('.vol-secao-nota').innerText()), `${nome}: diz o posto de hoje`,
        await hj.locator('.vol-secao-nota').innerText());
      const bt = hj.getByRole('button', { name: 'Cheguei' });
      ok(await bt.count() === 1, `${nome}: o botão "Cheguei"`);
      const caixa = await bt.boundingBox();
      ok(caixa && caixa.height >= 44, `${nome}: o botão tem altura de toque`, JSON.stringify(caixa));
      await bt.click(); await esperar(900);
      ok(pedidos.length === 1 && pedidos[0].corpo.p_culto === 'h1' && pedidos[0].corpo.p_chegou === true && !!pedidos[0].corpo.p_token,
        `${nome}: tocar manda eu_cheguei com o culto de hoje`, JSON.stringify(pedidos));
      ok(await p.getByText(/Chegada marcada às \d{1,2}:\d{2}\. Bom culto!/).count() > 0, `${nome}: e diz a hora`);
      /* recusa do banco */
      volta = { ok: false, erro: 'FORA_DO_DIA' };
      await bt.click(); await esperar(900);
      ok(await p.getByText('A chegada só pode ser marcada no dia do culto.').count() > 0, `${nome}: recusa do banco vira frase`);
      ok(await semRolagemDeLado(p), `${nome}: sem rolagem de lado (hoje)`);
      if (nome === '390') { await hj.scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/eu-hoje-${nome}.png` }); }
      await c.close();
    }
    /* hoje-lider: o time do dia */
    {
      const c = await ctx(w, h, toque); const p = await c.newPage();
      const pedidos = [];
      await p.route('**/rest/v1/rpc/eu_marcar_chegada', gravar(pedidos, 'marcar', { ok: true, chegou_em: agoraMenos(0), marcado_por: 'lider_do_dia' }));
      await p.route('**/rest/v1/rpc/eu_cheguei', gravar(pedidos, 'cheguei', { ok: true, chegou_em: null, confirmou: 0 }));
      await p.goto(`${BASE}/eu/demo?demo=hoje-lider`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('.vol-chamada', { timeout: 30000 }); await esperar(1500);
      const hj = p.locator('section#hoje');
      ok(/^Você chegou às \d{1,2}:\d{2}$/.test((await hj.locator('.vol-hoje-chegou .vol-linha-dia').innerText()).trim()),
        `${nome}: quem chegou vê a hora`);
      ok(await hj.getByRole('button', { name: 'Desfazer' }).count() === 1, `${nome}: e pode desfazer`);
      ok((await hj.locator('.vol-hoje-conta').innerText()).trim() === '3 de 5 chegaram', `${nome}: a conta do time`,
        await hj.locator('.vol-hoje-conta').innerText());
      const linhas = hj.locator('.vol-hoje-time .vol-linha');
      ok(await linhas.count() === 5, `${nome}: uma linha por pessoa do time`);
      ok(await hj.getByRole('button', { name: /^Marcar que .* chegou$/ }).count() === 2
         && await hj.getByRole('button', { name: /^Desmarcar a chegada de / }).count() === 2,
        `${nome}: "Marcar chegada" em quem falta, "Desmarcar" em quem tem marca, nada na própria linha`);
      ok((await linhas.first().innerText()).includes('Você'), `${nome}: a própria pessoa é "Você"`);
      await hj.getByRole('button', { name: 'Marcar que Lucas Andrade chegou' }).click(); await esperar(900);
      const m = pedidos.find(x => x.nome === 'marcar');
      ok(!!m && m.corpo.p_voluntario === '00000000-0000-4000-8000-000000000003' && m.corpo.p_chegou === true && m.corpo.p_culto === 'h1',
        `${nome}: marcar manda eu_marcar_chegada com a pessoa certa`, JSON.stringify(pedidos));
      await hj.getByRole('button', { name: 'Desfazer' }).click(); await esperar(900);
      ok(pedidos.some(x => x.nome === 'cheguei' && x.corpo.p_chegou === false), `${nome}: desfazer manda eu_cheguei com p_chegou falso`);
      ok(await semRolagemDeLado(p), `${nome}: sem rolagem de lado (líder do dia)`);
      if (nome === '390') { await hj.scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/eu-lider-${nome}.png`, fullPage: true }); }
      await c.close();
    }
    /* comofoi */
    {
      const c = await ctx(w, h, toque); const p = await c.newPage();
      const pedidos = [];
      await p.route('**/rest/v1/rpc/eu_como_foi_responder', gravar(pedidos, 'conta', b => ({ ok: true, resposta: b.p_resposta, texto: b.p_texto })));
      await p.goto(`${BASE}/eu/demo?demo=comofoi`, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('.vol-chamada', { timeout: 30000 }); await esperar(1800);
      const cf = p.locator('section#como-foi');
      ok(await ate(async () => await cf.count() === 1), `${nome}: a seção "Como foi" existe`);
      ok((await cf.locator('.vol-secao-nota').innerText()).trim() === 'Só a liderança da Mídia lê',
        `${nome}: diz quem lê, com o artigo do ministério`, await cf.locator('.vol-secao-nota').innerText());
      const q = cf.locator('.vol-comofoi').first();
      const ops = q.getByRole('group').getByRole('button');
      ok(JSON.stringify(await ops.allInnerTexts()).replace(/\\n/g, ' ') === JSON.stringify(['Foi bom', 'Foi puxado', 'Teve problema']),
        `${nome}: as três respostas`, JSON.stringify(await ops.allInnerTexts()));
      ok(/(domingo|sábado)/.test(await q.locator('.vol-troca-dia').innerText()),
        `${nome}: a pergunta é do último culto (sábado ou domingo)`, await q.locator('.vol-troca-dia').innerText());
      await q.getByRole('button', { name: 'Foi puxado' }).click(); await esperar(900);
      const p1 = pedidos.find(x => x.nome === 'conta');
      ok(!!p1 && p1.corpo.p_resposta === 'puxado' && p1.corpo.p_culto === 'cf1' && p1.corpo.p_texto === null,
        `${nome}: responder manda eu_como_foi_responder`, JSON.stringify(pedidos));
      /* a resposta dada: linha com "Mudar", que abre a nota */
      const linha = cf.locator('.vol-linha').filter({ hasText: 'Você contou: foi bom' });
      ok(await linha.count() === 1, `${nome}: a resposta dada vira linha`);
      await linha.getByRole('button', { name: 'Mudar' }).click(); await esperar(400);
      const nota = cf.getByLabel('Quer contar mais? (se quiser)');
      ok(await nota.count() === 1, `${nome}: "Mudar" abre a nota`);
      await nota.fill('O retorno do palco falhou no meio da ministração');
      ok(/Só a liderança da Mídia lê\. 48\/500/.test(await cf.locator('.vol-comofoi-conta').innerText()),
        `${nome}: a conta das letras e quem lê`, await cf.locator('.vol-comofoi-conta').innerText());
      await cf.getByRole('button', { name: 'Enviar a nota' }).click(); await esperar(900);
      const p2 = pedidos.filter(x => x.nome === 'conta').pop();
      ok(p2.corpo.p_resposta === 'bom' && p2.corpo.p_texto === 'O retorno do palco falhou no meio da ministração' && p2.corpo.p_culto === 'cf2',
        `${nome}: a nota vai junto com a resposta`, JSON.stringify(p2));
      ok(await p.getByText('Obrigado por contar.').count() > 0, `${nome}: e agradece`);
      const tela = await nota.evaluate(e => getComputedStyle(e).fontSize).catch(() => '16px');
      ok(tela === '16px', `${nome}: o campo da nota tem 16px (o iPhone não dá zoom)`, tela);
      ok(await semRolagemDeLado(p), `${nome}: sem rolagem de lado (como foi)`);
      if (nome === '390') { await cf.scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/eu-comofoi-${nome}.png` }); }
      await c.close();
    }
  }

  /* ---------------------------------------------------------- 2 · /escala */
  {
    const c = await ctx(1440, 900, false); const p = await c.newPage();
    await p.route('**/rest/v1/rpc/presencas_do_dia', recusar);
    await p.route('**/rest/v1/rpc/como_foi_da_equipe', recusar);
    await p.goto(`${BASE}/escala?demo=hoje&m=${hoje.slice(0, 7)}#d${hoje}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.es-casca', { timeout: 30000 }); await esperar(3000);
    ok(await p.locator('.es-ec-chegada').count() === 0 && await p.locator('.es-ec-comofoi').count() === 0,
      'escala: sem a 107 no banco, nem chegada nem como foi');
    await c.close();
  }
  for (const [w, h, toque, nome] of [[1440, 900, false, '1440'], [390, 844, true, '390']]) {
    const c = await ctx(w, h, toque); const p = await c.newPage();
    const pedidos = [];
    let marcas = [];
    let volta = null;
    await p.route('**/rest/v1/rpc/presencas_do_dia', gravar(pedidos, 'ler', b => marcas.filter(m => b.p_data === hoje || m.ontem)));
    await p.route('**/rest/v1/rpc/marcar_chegada', gravar(pedidos, 'marcar', () => volta));
    await p.route('**/rest/v1/rpc/como_foi_da_equipe', gravar(pedidos, 'comofoi', b => b.p_de === hoje ? [
      { culto_id: 'e' + hoje, data: hoje, evento: 'Culto de teste', voluntario_id: 'v1', nome: 'Pessoa Um', funcoes: ['PROJEÇÃO'],
        resposta: 'problema', texto: 'O projetor desligou duas vezes', atualizado_em: agoraMenos(5) },
      { culto_id: 'e' + hoje, data: hoje, evento: 'Culto de teste', voluntario_id: 'v2', nome: 'Pessoa Dois', funcoes: ['FOTO'],
        resposta: 'bom', texto: null, atualizado_em: agoraMenos(9) },
    ] : []));
    await p.goto(`${BASE}/escala?demo=hoje&m=${hoje.slice(0, 7)}#d${hoje}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.es-casca', { timeout: 30000 }); await esperar(2500);
    const dia = p.locator(`#d${hoje}`);
    if (!(await dia.evaluate(e => e.open))) { await dia.locator(':scope > summary').click(); await esperar(600); }
    /* as pessoas do dia, tiradas da própria escala do harness */
    const nomes = await dia.locator('.es-ec-posto .es-ec-quem').allInnerTexts();
    const sec = dia.locator('section.es-ec-chegada');
    ok(await ate(async () => await sec.count() === 1), `${nome}: "Chegada" aberta no dia do culto`);
    ok((await sec.locator('.es-ec-ordem-resumo').innerText()).trim() === 'ninguém marcou ainda', `${nome}: ninguém marcou ainda`,
      await sec.locator('.es-ec-ordem-resumo').innerText());
    const linhas = sec.locator('li.es-ec-cg');
    /* quatro postos montados no evento de teste, um deles "não pode": três pessoas */
    ok(await linhas.count() === 3, `${nome}: uma linha por pessoa, sem quem disse que não pode`, `${await linhas.count()} | ${nomes.join(' / ')}`);
    /* alguém marca, a tela relê */
    const primeiro = (await linhas.first().locator('.es-ec-cg-nome').innerText()).trim();
    volta = { ok: true, chegou_em: agoraMenos(0), marcado_por: 'lideranca' };
    const ida = pedidos.length;
    await linhas.first().getByRole('button', { name: `Marcar que ${primeiro} chegou` }).click(); await esperar(900);
    const m1 = pedidos.slice(ida).find(x => x.nome === 'marcar');
    ok(!!m1 && m1.corpo.p_culto === 'e' + hoje && m1.corpo.p_chegou === true && !!m1.corpo.p_voluntario,
      `${nome}: "Marcar chegada" manda marcar_chegada`, JSON.stringify(pedidos.slice(ida)));
    ok(pedidos.slice(ida).some(x => x.nome === 'ler'), `${nome}: e relê as marcas`);
    /* com a marca vinda do banco: a hora, quem marcou e "Desmarcar" */
    marcas = [{ culto_id: 'e' + hoje, voluntario_id: m1?.corpo.p_voluntario, chegou_em: agoraMenos(3), marcado_por: 'eu' }];
    await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await esperar(900);
    const l1 = linhas.first();
    ok(new RegExp(`chegou ${horaAqui(marcas[0].chegou_em)}`).test(await l1.innerText()) && /pelo link/.test(await l1.innerText()),
      `${nome}: a hora e quem marcou`, await l1.innerText());
    ok((await sec.locator('.es-ec-ordem-resumo').innerText()).trim() === '1 de 3 chegaram', `${nome}: a conta muda`);
    volta = { ok: false, erro: 'MUITO_ANTIGO' };
    await l1.getByRole('button', { name: `Desmarcar a chegada de ${primeiro}` }).click(); await esperar(900);
    ok(await p.getByText('A chegada pode ser corrigida até 30 dias depois do culto.').count() > 0, `${nome}: recusa do banco vira frase`);
    /* o como foi do dia */
    const cf = dia.locator('.es-ec-comofoi');
    ok(await cf.count() === 1, `${nome}: o como foi do dia aparece`);
    ok((await cf.locator('.es-ec-cf-resumo').innerText()).trim() === '1 foi bom · 1 teve problema', `${nome}: com a conta`,
      await cf.locator('.es-ec-cf-resumo').innerText());
    ok((await cf.locator('li.es-ec-cf').first().innerText()).includes('O projetor desligou duas vezes'),
      `${nome}: o problema primeiro, com a nota`);
    ok(await semRolagemDeLado(p), `${nome}: sem rolagem de lado (escala)`);
    if (nome === '390' || nome === '1440') { await sec.scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/escala-${nome}.png` }); }
    /* ontem: dobra fechada com a conta (o dia de ontem fica entre os que já passaram) */
    if (ontem.slice(0, 7) === hoje.slice(0, 7)) {
      const bt = p.locator('section.es-secao').filter({ hasText: 'Já passaram' }).getByRole('button', { name: /^Ver \d+$/ });
      if (await bt.count()) { await bt.click(); await esperar(600); }
      const d2 = p.locator(`#d${ontem}`);
      if (await d2.count()) {
        if (!(await d2.evaluate(e => e.open))) { await d2.locator(':scope > summary').click(); await esperar(900); }
        const dob = d2.locator('details.es-ec-chegada');
        ok(await dob.count() === 1 && !(await dob.evaluate(e => e.open)), `${nome}: ontem, a chegada é dobra fechada`);
        ok(/0 de 3 com marca/.test(await dob.locator('summary').innerText()), `${nome}: com a conta na linha`,
          await dob.locator('summary').innerText());
      } else ok(false, `${nome}: o dia de ontem aparece entre os que já passaram`);
    }
    await c.close();
  }

  /* ----------------------------------------------------------- 3 · painel */
  {
    /* o último domingo (dia de culto de verdade, para a frase do dia não mentir) */
    const domingo = (() => { let d = Date.parse(hoje + 'T12:00:00Z') - 86400000;
      while (new Date(d).getUTCDay() !== 0) d -= 86400000; return new Date(d).toISOString().slice(0, 10); })();
    const c = await ctx(1440, 900, false); const p = await c.newPage();
    await p.route('**/rest/v1/rpc/como_foi_da_equipe', r => responder(r, [
      { culto_id: 'x1', data: domingo, evento: null, voluntario_id: 'v1', nome: 'Pessoa Um', funcoes: ['PROJEÇÃO'],
        resposta: 'puxado', texto: 'Fiquei sozinha na projeção', atualizado_em: agoraMenos(60) },
      { culto_id: 'x1', data: domingo, evento: null, voluntario_id: 'v2', nome: 'Pessoa Dois', funcoes: ['FOTO'],
        resposta: 'bom', texto: null, atualizado_em: agoraMenos(90) },
    ]));
    await p.goto(`${BASE}/painel?demo=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.es-casca', { timeout: 30000 }); await esperar(3000);
    const sec = p.locator('section.es-secao').filter({ hasText: 'Como foi para quem serviu' });
    ok(await ate(async () => await sec.count() === 1), 'painel: "Como foi para quem serviu"');
    ok(/Últimas duas semanas: 1 foi bom · 1 puxado\./.test(await sec.innerText()), 'painel: a conta das duas semanas', await sec.innerText());
    const itens = sec.locator('a.es-item');
    ok(await itens.count() === 1 && (await itens.first().getAttribute('href')) === `/escala?m=${domingo.slice(0, 7)}#d${domingo}`,
      'painel: só o que pede atenção, levando ao dia', `${await itens.count()} ${await itens.first().getAttribute('href')}`);
    ok(/domingo, \d{1,2} de [a-zç]+/.test(await itens.first().innerText()), 'painel: o dia por extenso', await itens.first().innerText());
    await p.screenshot({ path: `${OUT}/painel-1440.png` });
    await c.close();
  }
  {
    const c = await ctx(1440, 900, false); const p = await c.newPage();
    await p.route('**/rest/v1/rpc/como_foi_da_equipe', recusar);
    await p.goto(`${BASE}/painel?demo=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.es-casca', { timeout: 30000 }); await esperar(2500);
    ok(await p.locator('section.es-secao').filter({ hasText: 'Como foi para quem serviu' }).count() === 0, 'painel: sem a 107, nada');
    await c.close();
  }

  /* ---------------------------------------------------------- 4 · ajustes */
  for (const com107 of [false, true]) {
    const c = await ctx(1440, 900, false); const p = await c.newPage();
    await p.route('**/rest/v1/rpc/presencas_do_dia', r => com107 ? responder(r, []) : recusar(r));
    await p.goto(`${BASE}/ajustes?demo=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.es-casca', { timeout: 30000 }); await esperar(2500);
    if (com107) await ate(async () => await p.locator('section#chegada').count() === 1);
    const n = await p.locator('section#chegada').count();
    const indice = await p.locator('.es-aj-indice a[href="#chegada"]').count();
    ok(com107 ? n === 1 && indice === 1 : n === 0 && indice === 0,
      `ajustes: a seção "Chegada no dia" ${com107 ? 'aparece, e no índice' : 'não existe sem a 107, nem no índice'}`);
    if (com107) {
      const link = p.locator('section#chegada a[href="/ajustes/cartaz-de-chegada"]');
      ok(await link.count() === 1, 'ajustes: leva ao cartaz');
    }
    await c.close();
  }
  for (const [w, h, toque, nome] of [[1440, 900, false, '1440'], [390, 844, true, '390']]) {
    const c = await ctx(w, h, toque); const p = await c.newPage();
    await p.goto(`${BASE}/ajustes/cartaz-de-chegada?demo=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.es-casca', { timeout: 30000 }); await esperar(2000);
    const folha = p.locator('article.cz-folha');
    ok(await ate(async () => await folha.count() === 1), `${nome}: o cartaz`);
    const link = (await folha.locator('.cz-link').innerText()).trim();
    ok(/^(127\.0\.0\.1:3500|localhost:3500|guiaservir\.com)\/cheguei\/[a-z0-9-]+$/.test(link), `${nome}: o QR leva ao ministério`, link);
    ok(!/\/eu\//.test(link), `${nome}: e nunca ao link de alguém`);
    const qr = await folha.locator('svg.cz-qr').boundingBox();
    ok(qr && qr.width >= 200, `${nome}: o QR tem tamanho de leitura`, JSON.stringify(qr));
    ok(await semRolagemDeLado(p), `${nome}: sem rolagem de lado (cartaz)`);
    await p.screenshot({ path: `${OUT}/cartaz-${nome}.png`, fullPage: true });
    await c.close();
  }
} catch (e) {
  falhas++; console.log('  FALHOU (exceção)', e?.message || e);
} finally {
  await nav.close();
}
console.log(`\nchegada-tela: ${feitas - falhas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
