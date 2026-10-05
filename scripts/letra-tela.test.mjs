/* =============================================================================
   O LOUVOR COM COMPASSO, MINUTO E SEGUNDO E A LETRA EM PDF — 111, 05/10/2026

   Pedido do Louvor, pelo Arthur: "Na parte do BPM colocar ao lado a opção de
   compasso", "No tempo total da música coloca no formato minuto/segundo" e
   "Adicionar um campo para carregar a letra em PDF (a pessoa clica e faz o
   download do PDF)". O que esta prova exige, no harness:

     1. Escala do líder (`?demo=letra`, a ordem já com a 111): a lista mostra
        o compasso ao lado do BPM, o tempo da música em minuto e segundo e
        "com letra"; o formulário tem o Compasso AO LADO do BPM (no celular
        também), a Duração em dois campos (minutos : segundos) e a Letra
        (PDF) com o arquivo salvo; salvar manda compasso, segundos e a letra,
        e o item antigo (em minutos) sai em segundos; tirar a letra tira; o
        PDF escolhido é conferido na hora (tipo, vazio, 10 MB), e o campo diz
        que ele sobe no Salvar;
     2. a pergunta ao banco: `ordem_valida` diz que aceita, e a ordem antiga
        (`?demo=1`) ganha os campos; diz que não, e fica como era;
     3. página de quem serve (`?demo=letra`): o setlist e a ordem com o
        compasso e o minuto e segundo, e o botão "Letra" que BAIXA o PDF
        (o Storage manda como download, com o nome da música), com 44 de
        toque, sem abrir outra aba;
     4. nada rola de lado a 320, 390 e 1440.

   O ENVIO DO PDF PARA O ARMÁRIO não roda aqui: o harness é a Mídia de id
   'demo', que não é uma pasta do armário. Ele é provado de ponta a ponta,
   com o banco de verdade, o PostgREST e a política do Storage, em
   `bash scripts/letra-e2e.sh`.

   Roda com BASE=http://127.0.0.1:3500 node scripts/letra-tela.test.mjs */
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';
import { cultosQueVem } from './dias-do-demo.mjs';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const SUPA = process.env.SUPA || 'http://127.0.0.1:54321';
const OUT = '/tmp/letra-tela';
mkdirSync(OUT, { recursive: true });
const esperar = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0, feitas = 0;
const ok = (c, nome, extra = '') => { feitas++; if (!c) falhas++; console.log(`  ${c ? 'ok ' : 'FALHOU'} ${nome}${!c && extra ? '\n      ' + extra : ''}`); };
/* O LOCALE EM UTF-8, COMO NO CELULAR DE QUEM BAIXA. O container sobe sem
   LANG, e o Chromium sem locale recusa o nome com acento que o Storage manda
   em `filename*` e salva como "download" (medido em 05/10: com LANG=C.UTF-8
   o mesmo cabeçalho dá "Canção.pdf"). A prova é do nome que a pessoa vê. */
const nav = await chromium.launch({ executablePath: chromeDoContainer(), env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const responder = (r, corpo) => r.request().method() === 'OPTIONS'
  ? r.fulfill({ status: 204, headers: CORS })
  : r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
async function ctx(w, h, toque) {
  const c = await nav.newContext({ viewport: { width: w, height: h }, isMobile: toque, hasTouch: toque, deviceScaleFactor: 2,
    acceptDownloads: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await c.route('**', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
  return c;
}
const semRolagemDeLado = p => p.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1);

const LETRA = 'd0000000-0000-4000-8000-000000000001/a0000000-0000-4000-8000-000000000001.pdf';
/* o SEGUNDO culto que vem, onde o harness põe a ordem */
const DIA = cultosQueVem[1] || '';
const H = new Date(DIA + 'T12:00:00Z').getUTCDay() === 6 ? 19 * 60 : 10 * 60;
const rel = m => { const h = Math.floor(m / 60), mm = m % 60; return mm ? `${h}h${String(mm).padStart(2, '0')}` : `${h}h`; };
/* 300 + 275 + 312 + 360 + 300 + 2400 segundos: 1h05min47s */
const HORAS = [0, 300, 575, 887, 1247, 1547].map(s => rel(H + Math.floor(s / 60)));

/* um PDF de verdade, pequeno, e os que não servem */
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const arquivo = (name, mimeType, buffer) => ({ name, mimeType, buffer });

async function abrirDia(p) {
  await p.waitForSelector('.es-casca', { timeout: 60000 }); await esperar(2500);
  const dia = p.locator(`#d${DIA}`);
  if (!(await dia.evaluate(e => e.open))) { await dia.locator(':scope > summary').click(); await esperar(400); }
  return dia;
}

try {
  if (!DIA) throw new Error('o harness não tem dois cultos por vir: a prova não tem o que olhar');

  /* ------------------------------------------------- 1 · a escala do líder */
  for (const [w, h, toque, nome] of [[1440, 900, false, '1440'], [390, 844, true, '390']]) {
    const c = await ctx(w, h, toque); const p = await c.newPage();
    const pedidos = [];
    await p.route('**/rest/v1/rpc/musicas_do_ministerio', r => responder(r, []));
    await p.route('**/rest/v1/rpc/salvar_ordem', r => {
      if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
      const corpo = r.request().postDataJSON(); pedidos.push(corpo);
      return responder(r, { ok: true, ordem: corpo.p_ordem });
    });
    const envios = [];
    await p.route('**/storage/v1/object/**', r => { envios.push(r.request().url()); return r.abort(); });
    await p.goto(`${BASE}/escala?demo=letra&m=${DIA.slice(0, 7)}#d${DIA}`, { waitUntil: 'domcontentloaded' });
    const dia = await abrirDia(p);
    const ordem = dia.locator('section.es-ec-ordem');
    const itens = ordem.locator('li.es-ec-oi');
    ok(await itens.count() === 6, `${nome}: os seis itens`, String(await itens.count()));
    const horas = await ordem.locator('.es-ec-oi-hora').allInnerTexts();
    ok(horas.join(',') === HORAS.join(','), `${nome}: a hora de cada item conta os segundos`, horas.join(','));
    const resumo = await ordem.locator('.es-ec-ordem-resumo').innerText();
    ok(resumo === `3 músicas · 1h05 · termina ${rel(H + 65)}`, `${nome}: o resumo`, resumo);
    const metas = await ordem.locator('.es-ec-oi-meta').allInnerTexts();
    ok(metas[1] === 'G · 72 BPM · 6/8 · Lia · 4:35 · com cifra · com letra', `${nome}: o compasso ao lado do BPM, o tempo em minuto e segundo e "com letra"`, metas[1]);
    ok(metas[3] === 'Bb · 6:00', `${nome}: o item antigo, em minutos, também em minuto e segundo`, metas[3]);
    ok(metas[5] === 'Momento · Pastor · 40 min', `${nome}: o momento continua em minutos`, metas[5]);

    /* o formulário da música com a 111 */
    await itens.nth(1).locator('button.es-ec-oi-abre').click(); await esperar(400);
    const form = ordem.locator('form.es-ec-of');
    const bpm = form.getByLabel('BPM'), compasso = form.getByLabel('Compasso');
    ok(await compasso.count() === 1 && await compasso.inputValue() === '6/8', `${nome}: o compasso salvo no campo dele`);
    const [cb, bb] = [await compasso.boundingBox(), await bpm.boundingBox()];
    ok(cb && bb && Math.abs(cb.y - bb.y) < 2 && cb.x > bb.x + bb.width - 1, `${nome}: o compasso fica AO LADO do BPM`, JSON.stringify({ cb, bb }));
    const opcoes = await compasso.locator('option').allInnerTexts();
    ok(opcoes.slice(0, 4).join(',') === 'sem compasso,4/4,3/4,6/8' && opcoes.includes('12/8'), `${nome}: os compassos do louvor na lista`, opcoes.join(','));
    ok(await form.getByLabel('Minutos').inputValue() === '4' && await form.getByLabel('Segundos').inputValue() === '35',
      `${nome}: a duração em minuto e segundo`);
    ok(await form.getByRole('group', { name: 'Duração' }).count() === 1, `${nome}: os dois campos são um grupo "Duração"`);
    const salva = form.getByRole('link', { name: 'Letra salva' });
    ok(await salva.count() === 1 && await salva.getAttribute('href') === `${SUPA}/storage/v1/object/public/letras/${LETRA}`
      && await salva.getAttribute('target') === '_blank', `${nome}: a letra salva abre o PDF do armário`, await salva.getAttribute('href').catch(() => '-'));
    ok(await form.locator('label', { hasText: 'Trocar o PDF' }).count() === 1 && await form.getByRole('button', { name: 'Tirar', exact: true }).count() === 1,
      `${nome}: e oferece trocar e tirar`);
    if (toque) {
      const alts = await form.locator('input:not([type="file"]), select, label.es-btn').evaluateAll(es => es.map(e => Math.round(e.getBoundingClientRect().height)));
      ok(alts.every(a => a >= 44), `${nome}: campos e botões com 44 no dedo`, alts.join(','));
      /* "Letra salva" com 44 de toque, e os dois botões juntos na linha de
         baixo (o "Tirar" caía sozinho numa terceira linha) */
      const [cs, ct, ctr] = [await salva.boundingBox(), await form.locator('label', { hasText: 'Trocar o PDF' }).boundingBox(),
        await form.getByRole('button', { name: 'Tirar', exact: true }).boundingBox()];
      ok(cs && cs.height >= 44 && cs.width < 200, `${nome}: "Letra salva" com 44 de toque, sem esticar pela linha`, JSON.stringify(cs));
      ok(ct && ctr && Math.abs(ct.y - ctr.y) < 2 && ct.y >= cs.y + cs.height - 1, `${nome}: "Trocar o PDF" e "Tirar" juntos, embaixo do nome`,
        JSON.stringify({ ct, ctr }));
    }
    await form.screenshot({ path: `${OUT}/form-musica-${nome}.png` });

    /* mudar compasso e tempo: vai compasso, segundos e a letra (que fica) */
    await compasso.selectOption('3/4');
    await form.getByLabel('Minutos').fill('5'); await form.getByLabel('Segundos').fill('07');
    await form.getByRole('button', { name: 'Salvar' }).click(); await esperar(900);
    const s1 = pedidos.at(-1) || {};
    const it1 = s1.p_ordem?.[1] || {};
    ok(it1.compasso === '3/4' && it1.seg === 307 && it1.letra === LETRA && !('min' in it1),
      `${nome}: Salvar manda o compasso, os segundos e a letra`, JSON.stringify(it1));
    ok(s1.p_antes?.[1]?.seg === 275 && s1.p_antes?.[1]?.letra === LETRA, `${nome}: com a ordem que a tela tinha`, JSON.stringify(s1.p_antes?.[1]));
    ok((await ordem.locator('.es-ec-oi-meta').allInnerTexts())[1] === 'G · 72 BPM · 3/4 · Lia · 5:07 · com cifra · com letra',
      `${nome}: e a lista mostra o que foi salvo`);
    ok(envios.length === 0, `${nome}: sem PDF novo, nada vai ao armário`, envios.join(' | '));

    /* o item antigo, em minutos: abre com 6 e salva em segundos */
    await itens.nth(3).locator('button.es-ec-oi-abre').click(); await esperar(400);
    ok(await form.getByLabel('Minutos').inputValue() === '6' && await form.getByLabel('Segundos').inputValue() === '',
      `${nome}: o item antigo abre com os minutos dele`);
    ok(await form.getByRole('link', { name: 'Letra salva' }).count() === 0 && await form.locator('label', { hasText: 'Escolher PDF' }).count() === 1,
      `${nome}: sem letra, o botão é "Escolher PDF"`);
    /* o PDF é conferido na hora */
    const input = form.locator('input[type="file"]');
    await input.setInputFiles(arquivo('letra.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from('x')));
    await esperar(200);
    ok(/não é PDF/.test(await form.locator('[id$="-d-letra"]').innerText()) && await input.getAttribute('aria-invalid') === 'true',
      `${nome}: arquivo que não é PDF: a frase diz, e o campo fica marcado`, await form.locator('[id$="-d-letra"]').innerText());
    await input.setInputFiles(arquivo('vazio.pdf', 'application/pdf', Buffer.alloc(0))); await esperar(200);
    ok(/vazio/.test(await form.locator('[id$="-d-letra"]').innerText()), `${nome}: PDF vazio também não`);
    /* o rótulo diz PDF, o conteúdo é de foto: quem decide é o conteúdo */
    await input.setInputFiles(arquivo('foto.pdf', 'application/pdf', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1])));
    await esperar(300);
    ok(/não é PDF/.test(await form.locator('[id$="-d-letra"]').innerText()) && await form.locator('label', { hasText: 'Escolher PDF' }).count() === 1,
      `${nome}: foto com nome de PDF: o conteúdo não passa`, await form.locator('[id$="-d-letra"]').innerText());
    /* e o PDF que o aparelho entrega como arquivo genérico passa, pelo
       conteúdo (tipo vazio o Playwright troca por application/pdf) */
    await input.setInputFiles(arquivo('sem tipo.pdf', 'application/octet-stream', PDF)); await esperar(300);
    ok(/sem tipo\.pdf · 1 KB/.test(await form.innerText()), `${nome}: PDF que chega como arquivo genérico, com conteúdo de PDF, é aceito`);
    await form.getByRole('button', { name: 'Tirar', exact: true }).click(); await esperar(200);
    await input.setInputFiles(arquivo('grande.pdf', 'application/pdf', Buffer.alloc(10 * 1024 * 1024 + 1, 65))); await esperar(300);
    ok(/limite é 10 MB/.test(await form.locator('[id$="-d-letra"]').innerText()), `${nome}: nem o de mais de 10 MB`,
      await form.locator('[id$="-d-letra"]').innerText());
    await input.setInputFiles(arquivo('Luz no Caminho.pdf', 'application/pdf', PDF)); await esperar(300);
    ok(/Luz no Caminho\.pdf · 1 KB/.test(await form.innerText()) && /Sobe quando você salvar/.test(await form.innerText())
      && await input.getAttribute('aria-invalid') === 'false', `${nome}: o PDF escolhido aparece com o tamanho, esperando o Salvar`);
    ok(envios.length === 0, `${nome}: escolher não envia nada`);
    /* tirar o escolhido volta ao "Escolher PDF"; salvar sem ele: segundos */
    await form.getByRole('button', { name: 'Tirar', exact: true }).click(); await esperar(200);
    ok(await form.locator('label', { hasText: 'Escolher PDF' }).count() === 1, `${nome}: tirar o escolhido volta ao começo`);
    await form.getByRole('button', { name: 'Salvar' }).click(); await esperar(900);
    const it3 = (pedidos.at(-1) || {}).p_ordem?.[3] || {};
    ok(it3.seg === 360 && !('min' in it3) && !('letra' in it3), `${nome}: o item antigo, salvo, vai em segundos`, JSON.stringify(it3));

    /* tirar a letra salva */
    await itens.nth(1).locator('button.es-ec-oi-abre').click(); await esperar(400);
    await form.getByRole('button', { name: 'Tirar', exact: true }).click(); await esperar(200);
    ok(await form.getByRole('link', { name: 'Letra salva' }).count() === 0, `${nome}: tirar a letra salva some com ela da tela`);
    await form.getByRole('button', { name: 'Salvar' }).click(); await esperar(900);
    const it1b = (pedidos.at(-1) || {}).p_ordem?.[1] || {};
    ok(!('letra' in it1b) && it1b.compasso === '3/4', `${nome}: e o Salvar manda a música sem a letra`, JSON.stringify(it1b));
    ok(!/com letra/.test((await ordem.locator('.es-ec-oi-meta').allInnerTexts())[1]), `${nome}: a lista deixa de dizer "com letra"`);

    /* o momento: Duração em minuto e segundo, sem compasso nem letra */
    await ordem.getByRole('button', { name: 'Acrescentar momento' }).click(); await esperar(300);
    ok(await form.getByLabel('Compasso').count() === 0 && await form.getByRole('group', { name: 'Letra (PDF)' }).count() === 0
      && await form.getByLabel('Minutos').count() === 1, `${nome}: o momento tem a duração, e não compasso nem letra`);
    await form.getByLabel('Momento', { exact: true }).fill('Oração');
    await form.getByLabel('Minutos').fill('2'); await form.getByLabel('Segundos').fill('75');
    await form.getByRole('button', { name: 'Salvar' }).click(); await esperar(400);
    ok(/segundos de 0 a 59/.test(await form.innerText()) && await form.getByLabel('Segundos').getAttribute('aria-invalid') === 'true',
      `${nome}: 75 segundos não passa, e a frase diz o porquê`);
    await form.getByLabel('Segundos').fill('30');
    await form.getByRole('button', { name: 'Salvar' }).click(); await esperar(900);
    const mom = (pedidos.at(-1) || {}).p_ordem?.at(-1) || {};
    ok(mom.t === 'momento' && mom.titulo === 'Oração' && mom.seg === 150, `${nome}: o momento vai com 150 segundos`, JSON.stringify(mom));
    ok((await ordem.locator('.es-ec-oi-meta').allInnerTexts()).at(-1) === 'Momento · 2:30', `${nome}: e aparece como 2:30`);

    ok(await semRolagemDeLado(p), `${nome}: a escala não rola de lado`);
    await ordem.screenshot({ path: `${OUT}/escala-${nome}.png` });
    await c.close();
  }

  /* ---------------------------------- 2 · a pergunta ao banco: aceita ou não */
  for (const aceita of [true, false]) {
    const c = await ctx(1440, 900, false); const p = await c.newPage();
    const perguntas = [];
    await p.route('**/rest/v1/rpc/ordem_valida', r => {
      if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
      perguntas.push(r.request().postDataJSON());
      return responder(r, aceita);
    });
    await p.route('**/rest/v1/rpc/musicas_do_ministerio', r => responder(r, []));
    await p.goto(`${BASE}/escala?demo=1&m=${DIA.slice(0, 7)}#d${DIA}`, { waitUntil: 'domcontentloaded' });
    const dia = await abrirDia(p);
    const ordem = dia.locator('section.es-ec-ordem');
    await ordem.getByRole('button', { name: 'Acrescentar música' }).click(); await esperar(400);
    const form = ordem.locator('form.es-ec-of');
    const sonda = perguntas[0]?.p?.[0] || {};
    ok(perguntas.length >= 1 && sonda.compasso && sonda.seg && sonda.letra, `aceita=${aceita}: a tela pergunta ao banco com compasso, segundos e letra`,
      JSON.stringify(perguntas[0] || null));
    if (aceita) {
      ok(await form.getByLabel('Compasso').count() === 1 && await form.getByLabel('Minutos').count() === 1
        && await form.getByRole('group', { name: 'Letra (PDF)' }).count() === 1, 'o banco aceita: a ordem antiga ganha compasso, minuto e segundo e a letra');
    } else {
      ok(await form.getByLabel('Compasso').count() === 0 && await form.getByLabel('Duração (min)').count() === 1
        && await form.getByRole('group', { name: 'Letra (PDF)' }).count() === 0, 'o banco não aceita: o formulário fica como era');
    }
    await c.close();
  }

  /* ------------------------------------------ 3 · a página de quem serve */
  for (const [w, h, toque, nome] of [[1440, 900, false, '1440'], [390, 844, true, '390'], [320, 640, true, '320']]) {
    const c = await ctx(w, h, toque); const p = await c.newPage();
    const baixados = [];
    await c.route(`${SUPA}/storage/v1/object/public/letras/**`, r => {
      const u = new URL(r.request().url());
      baixados.push(u.pathname + u.search);
      const nomeArq = u.searchParams.get('download') || 'letra.pdf';
      /* o cabeçalho COMO A API DO STORAGE MONTA HOJE (supabase/storage
         #1385): o mesmo `encodeURIComponent` no nome de reserva e no
         `filename*`. É o formato de produção que a prova tem de aguentar. */
      const enc = encodeURIComponent(nomeArq);
      return r.fulfill({ status: 200, headers: { 'content-type': 'application/pdf',
        'content-disposition': `attachment; filename=${enc}; filename*=UTF-8''${enc};` }, body: PDF });
    });
    await p.goto(`${BASE}/eu/x?demo=letra`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.vol-in', { timeout: 60000 });
    await p.waitForSelector('#repertorio .vol-setlist', { timeout: 20000 }).catch(() => {});
    await esperar(500);
    const linhas = p.locator('#repertorio .vol-setlist li.vol-sl');
    ok(await linhas.count() === 3, `${nome}: as três músicas no setlist`, String(await linhas.count()));
    const metas = await linhas.locator('.vol-oi-meta').evaluateAll(es => es.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
    ok(JSON.stringify(metas) === JSON.stringify(['Tom G · 72 BPM · 6/8 · 4:35 · Banda Exemplo · Lia',
      'Tom F#m · 68 BPM · 4/4 · 5:12 · Coral Modelo', 'Tom Bb · 6:00']),
      `${nome}: tom, BPM, compasso ao lado e o tempo em minuto e segundo`, JSON.stringify(metas));
    const letra = linhas.nth(0).getByRole('link', { name: 'Baixar a letra de Canção da Manhã (PDF)' });
    const esperado = `${SUPA}/storage/v1/object/public/letras/${LETRA}?download=${encodeURIComponent('Canção da Manhã - letra.pdf')}`;
    ok(await letra.count() === 1 && await letra.getAttribute('href') === esperado, `${nome}: o botão Letra aponta para o PDF do armário, como download`,
      await letra.getAttribute('href').catch(() => '-'));
    ok(await letra.getAttribute('download') === 'Canção da Manhã - letra.pdf' && !(await letra.getAttribute('target')),
      `${nome}: com o nome da música, e sem abrir outra aba`);
    const caixa = await letra.boundingBox();
    ok(caixa && caixa.height >= 44 && caixa.width >= 44, `${nome}: a letra tem 44 de toque`, JSON.stringify(caixa));
    ok(await linhas.nth(1).getByRole('link', { name: /Baixar a letra/ }).count() === 0, `${nome}: música sem letra, sem botão`);
    /* tocar baixa o PDF */
    const [down] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }).catch(() => null), letra.click()]);
    ok(!!down && down.suggestedFilename() === 'Canção da Manhã - letra.pdf', `${nome}: tocar baixa o PDF com o nome da música`,
      down ? down.suggestedFilename() : `sem download; pedidos: ${baixados.join(' | ')}`);
    ok(baixados.some(b => b.includes(`/letras/${LETRA}`)), `${nome}: do armário certo`);
    /* a ordem do culto (com os momentos) também */
    const oi = p.locator('#ordem .vol-oi').nth(1);
    ok(/Banda Exemplo · Tom G · 72 BPM · 6\/8 · Lia · 4:35/.test((await oi.locator('.vol-oi-meta').innerText()).replace(/\s+/g, ' '))
      && await oi.getByRole('link', { name: 'Baixar a letra de Canção da Manhã (PDF)' }).count() === 1,
      `${nome}: na ordem do culto, o compasso, o tempo e a letra também`);
    ok(await semRolagemDeLado(p), `${nome}: a página não rola de lado`);
    if (nome !== '1440') { await p.locator('#repertorio').screenshot({ path: `${OUT}/eu-setlist-${nome}.png` }); }
    await c.close();
  }
} catch (e) {
  falhas++; console.log('  FALHOU (exceção)', e?.stack || e);
} finally {
  await nav.close();
}
console.log(`\nletra-tela: ${feitas - falhas}/${feitas} ${falhas ? 'FALHOU' : 'ok'}`);
process.exit(falhas ? 1 : 0);
