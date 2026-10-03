/* =============================================================================
   O CRONOGRAMA DO CULTO, NAS TELAS — 109, 03/10/2026

   A aba Culto do líder, a folha pelo link do grupo e o dirigente pelo link
   dele. Esta prova exige, de 320 a 1440:
     1. a lista: os próximos cultos e o histórico, a aba Culto acesa, e as
        SEIS abas cabendo a 320px (o rótulo "Entradas" não vaza);
     2. a folha do líder: o que falta, na ordem da folha; cada bloco grava UM
        pedido `cronograma_salvar` com o dia, o bloco, o valor como o banco
        guarda e o que a tela tinha lido (`p_antes`); Escape e Cancelar não
        gravam; hora que não dá para entender não sai da tela; MUDOU traz o
        que está salvo e diz isso;
     3. "Mandar no grupo": a mensagem com o link da folha (pedindo o link ao
        banco quando o culto ainda não tem), o mesmo texto no WhatsApp; e
        "Salvar PDF" abre a impressão;
     4. a folha pública: alinhada à esquerda no celular (o site centraliza
        tudo dentro de <main> abaixo de 760px, e a folha é documento), sem
        rolar de lado, e o PDF em UMA página, até no culto comprido;
     5. o dirigente: o cartão no link dele, o formulário que grava
        `eu_cronograma_salvar` com o token, e o MUDOU;
     6. o cartão do painel.
   O banco aqui é de mentira (rotas interceptadas): o que se confere é o que a
   tela PEDE. O que o banco faz com isso foi provado à parte (conferência da
   109 e a ponta a ponta com o PostgREST).
   Roda com BASE=http://127.0.0.1:3500 TZ=America/Sao_Paulo node scripts/cronograma-tela.test.mjs */
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const esperar = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0, feitas = 0;
const ok = (c, nome, extra = '') => { feitas++; if (!c) falhas++; console.log(`  ${c ? 'ok ' : 'FALHOU'} ${nome}${!c && extra ? '\n      ' + extra : ''}`); };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
const semRolagemDeLado = p => p.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1);

/* o domingo do harness: o primeiro domingo de hoje em diante (lib/demo.ts) */
const hoje = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
const DOM = (() => { const d = new Date(hoje + 'T12:00:00Z'); for (let k = 0; k < 14; k++) { const x = new Date(d.getTime() + k * 864e5); if (x.getUTCDay() === 0) return x.toISOString().slice(0, 10); } })();

/* o banco de mentira: guarda os pedidos e responde o que cada caso manda */
async function banco(p, resposta = {}) {
  const pedidos = [];
  await p.route('**/rest/v1/**', async r => {
    const req = r.request(); const m = req.method(); const u = new URL(req.url());
    if (m === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    const alvo = u.pathname.replace(/^\/rest\/v1\//, '');
    let corpo = null; try { corpo = req.postDataJSON(); } catch { corpo = req.postData(); }
    const json = (status, b) => r.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(b) });
    pedidos.push({ m, alvo, corpo });
    const fn = alvo.replace(/^rpc\//, '');
    if (resposta[fn]) return json(200, typeof resposta[fn] === 'function' ? resposta[fn](corpo) : resposta[fn]);
    if (alvo.startsWith('rpc/')) return json(404, { code: 'PGRST202', message: 'Could not find the function' });
    if (m === 'GET') return json(200, []);
    return json(201, []);
  });
  return pedidos;
}
const pedidosDe = (pedidos, fn) => pedidos.filter(x => x.alvo === `rpc/${fn}`);

/* SO=2,4 roda só essas partes (a bateria de sabotagens usa isso) */
const SO = (process.env.SO || '').split(',').filter(Boolean);
const roda = n => !SO.length || SO.includes(String(n));

const nav = await chromium.launch({ executablePath: chromeDoContainer() });
try {
  /* ------------------------------------------------------------ 1 · a lista */
  console.log('\n1 · a lista da aba Culto');
  if (roda(1)) {
  for (const w of [320, 390, 1440]) {
    const c = await nav.newContext({ timezoneId: 'America/Sao_Paulo', viewport: { width: w, height: 900 }, isMobile: w < 600, hasTouch: w < 600 });
    const p = await c.newPage();
    await banco(p);
    await p.goto(`${BASE}/cronogramas?demo=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('text=Já aconteceram', { timeout: 30000 });
    const secoes = await p.locator('.es-secao').evaluateAll(ss => ss.map(s => s.querySelectorAll('.es-item').length));
    ok(secoes[0] === 8 && secoes[1] === 4, `${w}: oito cultos à frente e quatro no histórico`, JSON.stringify(secoes));
    const acesa = await p.locator(w < 1024 ? '.es-abas [aria-current="page"]' : '.es-nav [aria-current="page"]').innerText();
    ok(acesa.includes('Culto'), `${w}: a aba Culto acesa`, acesa);
    ok(await semRolagemDeLado(p), `${w}: nada rola de lado`);
    if (w === 320) {
      const vaza = await p.locator('.es-abas .es-aba > span:not(.es-aba-n)').evaluateAll(xs => xs
        .filter(x => x.getBoundingClientRect().width > x.parentElement.getBoundingClientRect().width - 2).map(x => x.textContent));
      ok(vaza.length === 0, '320: as seis abas cabem, nenhum rótulo vaza para a do lado', vaza.join(', '));
      ok(await p.locator('.es-abas .es-aba').count() === 6, '320: são seis abas');
    }
    await c.close();
  }
  }

  /* --------------------------------------------------- 2 · a folha do líder */
  console.log('\n2 · a folha do líder');
  if (roda(2)) {
  for (const w of [390, 1440]) {
    const c = await nav.newContext({ timezoneId: 'America/Sao_Paulo', viewport: { width: w, height: 900 }, isMobile: w < 600, hasTouch: w < 600 });
    await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
    const p = await c.newPage();
    let mudou = false;
    const pedidos = await banco(p, {
      cronograma_salvar: corpo => mudou
        ? { ok: false, erro: 'MUDOU', atual: { quem: 'Pr. Daniel Moura', tema: 'Tema de outra pessoa' } }
        : { ok: true, bloco: corpo.p_bloco, valor: corpo.p_valor, linha_propria: corpo.p_bloco === 'linha' ? !corpo.p_modelo : null,
            autoria: { por: 'Lia', em: new Date().toISOString(), via: 'lider' } },
    });
    await p.goto(`${BASE}/cronogramas/${DOM}?demo=parcial`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#cr-palavra', { timeout: 30000 });
    await p.evaluate(() => { window.__imprimiu = 0; window.print = () => { window.__imprimiu++; }; });
    const pend = await p.locator('.es-cr-pend .es-item b').allInnerTexts();
    ok(pend.join(' | ') === 'A Palavra: leitura | Mídia: ninguém escalado | Connect: ninguém escalado | A música final | Os avisos',
      `${w}: o que falta, na ordem da folha`, pend.join(' | '));
    ok(await semRolagemDeLado(p), `${w}: nada rola de lado`);

    /* a Palavra: Escape não grava; Salvar grava UM pedido, com o "antes" */
    await p.locator('#cr-palavra').getByRole('button', { name: 'Editar' }).click();
    ok(await p.evaluate(() => document.activeElement?.id) === 'cr-quem', `${w}: o formulário abre com o foco em "Quem prega"`);
    await p.keyboard.press('Escape');
    ok(await p.locator('#cr-quem').count() === 0 && pedidosDe(pedidos, 'cronograma_salvar').length === 0, `${w}: Escape fecha sem gravar`);
    await p.locator('#cr-palavra').getByRole('button', { name: 'Editar' }).click();
    await p.fill('#cr-leitura', '  Gênesis   32:30 ');
    await p.locator('#cr-palavra').getByRole('button', { name: 'Salvar' }).click();
    await esperar(400);
    const sp = pedidosDe(pedidos, 'cronograma_salvar');
    ok(sp.length === 1, `${w}: um pedido só`, String(sp.length));
    ok(sp[0]?.corpo?.p_data === DOM && sp[0]?.corpo?.p_bloco === 'palavra' && sp[0]?.corpo?.p_modelo === false, `${w}: o dia e o bloco`, JSON.stringify(sp[0]?.corpo));
    ok(sp[0]?.corpo?.p_valor?.leitura === 'Gênesis 32:30' && sp[0]?.corpo?.p_valor?.tema === 'Peniel: hoje Deus mudará sua identidade',
      `${w}: o valor como o banco guarda (aparado, e o resto da Palavra junto)`, JSON.stringify(sp[0]?.corpo?.p_valor));
    ok(JSON.stringify(sp[0]?.corpo?.p_antes) === JSON.stringify({ quem: 'Pr. Daniel Moura', tema: 'Peniel: hoje Deus mudará sua identidade' }),
      `${w}: p_antes é o que a tela leu`, JSON.stringify(sp[0]?.corpo?.p_antes));
    ok((await p.locator('#cr-palavra').innerText()).includes('Gênesis 32:30') && (await p.locator('#cr-palavra').innerText()).includes('Salvo por Lia'),
      `${w}: a folha mostra o que gravou, e quem`);
    ok((await p.locator('.es-cr-pend .es-item').count()) === 4, `${w}: e a pendência da Palavra sai da lista`);

    /* MUDOU: a tela passa a mostrar o que está salvo */
    mudou = true;
    await p.locator('#cr-palavra').getByRole('button', { name: 'Editar' }).click();
    await p.fill('#cr-tema', 'Meu tema');
    await p.locator('#cr-palavra').getByRole('button', { name: 'Salvar' }).click();
    await p.waitForSelector('.es-toast', { timeout: 5000 });
    ok((await p.locator('.es-toast').innerText()).startsWith('Alguém gravou'), `${w}: MUDOU vira a frase`, await p.locator('.es-toast').innerText());
    ok((await p.locator('#cr-palavra').innerText()).includes('Tema de outra pessoa') && await p.locator('#cr-tema').count() === 0,
      `${w}: e a folha mostra o que está salvo, com o formulário fechado`);
    mudou = false;

    /* os horários: hora errada não sai da tela; "usar nos próximos" vai junto */
    const antes = pedidosDe(pedidos, 'cronograma_salvar').length;
    await p.locator('#cr-linha').getByRole('button', { name: 'Editar' }).click();
    await p.locator('.es-cr-linhas .es-cr-lin').first().locator('.es-cr-hora').fill('meio-dia');
    await p.locator('#cr-linha').getByRole('button', { name: 'Salvar' }).click();
    await esperar(200);
    ok(pedidosDe(pedidos, 'cronograma_salvar').length === antes && await p.locator('.es-cr-erro').count() === 1
      && await p.locator('.es-cr-linhas .es-cr-lin').first().locator('.es-cr-hora').evaluate(e => e.getAttribute('aria-invalid') === 'true'),
      `${w}: hora que não dá para entender: a linha avisa e nada vai ao banco`);
    await p.locator('.es-cr-linhas .es-cr-lin').first().locator('.es-cr-hora').fill('8h30');
    await p.locator('.es-cr-modelo input').check();
    await p.locator('#cr-linha').getByRole('button', { name: 'Salvar' }).click();
    await esperar(400);
    const sl = pedidosDe(pedidos, 'cronograma_salvar').at(-1)?.corpo;
    ok(sl?.p_bloco === 'linha' && sl?.p_modelo === true && sl?.p_valor?.[0]?.h === '08:30' && sl?.p_valor?.[0]?.o === 'Líderes chegam e conferem escala e ambientes',
      `${w}: os horários entendidos e em ordem, com "usar nos próximos"`, JSON.stringify(sl?.p_valor?.slice(0, 2)));
    ok(Array.isArray(sl?.p_antes) && sl.p_antes.length === 14 && sl.p_antes[0].h === '09:00', `${w}: p_antes dos horários é o modelo que a tela leu`);

    /* os avisos: lista vazia é "sem avisos", e o botão diz isso */
    await p.locator('#cr-avisos').getByRole('button', { name: 'Editar' }).click();
    const rot = await p.locator('#cr-avisos button[type="submit"]').innerText();
    ok(rot === 'Salvar: sem avisos neste culto', `${w}: com tudo vazio, o botão diz o que vai acontecer`, rot);
    await p.locator('#cr-avisos button[type="submit"]').click();
    await esperar(400);
    const sa = pedidosDe(pedidos, 'cronograma_salvar').at(-1)?.corpo;
    ok(sa?.p_bloco === 'avisos' && Array.isArray(sa?.p_valor) && sa.p_valor.length === 0 && sa.p_antes === null, `${w}: grava a lista vazia, e o antes era "falta" (nulo)`, JSON.stringify(sa));

    /* mandar no grupo e o PDF */
    await p.getByRole('button', { name: 'Mandar no grupo' }).click();
    await p.waitForSelector('.es-cr-msg');
    const msg = await p.locator('.es-cr-msg').innerText();
    ok(msg.startsWith('Cronograma do culto\n') && msg.endsWith(`${BASE}/cronograma/0123456789abcdef01`), `${w}: a mensagem com o link da folha`, msg);
    const zap = await p.locator('.es-cr-mandar a', { hasText: 'Abrir no WhatsApp' }).getAttribute('href');
    ok(decodeURIComponent(zap.replace('https://wa.me/?text=', '')) === msg, `${w}: o WhatsApp abre com o mesmo texto`);
    await p.locator('.es-cr-mandar').getByRole('button', { name: 'Copiar a mensagem' }).click();
    await esperar(200);
    ok(await p.evaluate(() => navigator.clipboard.readText()) === msg, `${w}: "Copiar" copia o mesmo texto`);
    await p.getByRole('button', { name: 'Salvar PDF' }).click();
    ok(await p.evaluate(() => window.__imprimiu) === 1, `${w}: "Salvar PDF" abre a impressão`);
    ok(await p.locator('.impresso-folha .fo-titulo').count() === 1, `${w}: e a folha do papel está na página`);
    await c.close();
  }
  /* o culto ainda sem cronograma: o link é pedido ao banco */
  {
    const c = await nav.newContext({ timezoneId: 'America/Sao_Paulo', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await c.newPage();
    const pedidos = await banco(p, { cronograma_link: { ok: true, token: 'abcdefabcdefabcdef' } });
    await p.goto(`${BASE}/cronogramas/${DOM}?demo=vazia`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#cr-palavra', { timeout: 30000 });
    await p.getByRole('button', { name: 'Mandar no grupo' }).click();
    await p.waitForSelector('.es-cr-msg');
    const lk = pedidosDe(pedidos, 'cronograma_link');
    ok(lk.length === 1 && lk[0].corpo?.p_data === DOM, 'culto sem cronograma: pede o link ao banco, uma vez', JSON.stringify(lk));
    ok((await p.locator('.es-cr-msg').innerText()).endsWith('/cronograma/abcdefabcdefabcdef'), 'e a mensagem leva o link que o banco deu');
    ok((await p.locator('.es-cr-mandar').innerText()).includes('Ainda faltam'), 'e avisa que ainda falta coisa');
    await c.close();
  }
  }

  /* -------------------------------------------------- 3 · a folha pública */
  console.log('\n3 · a folha pelo link do grupo');
  if (roda(3)) {
  for (const w of [320, 390, 1440]) {
    const c = await nav.newContext({ timezoneId: 'America/Sao_Paulo', viewport: { width: w, height: 900 }, isMobile: w < 600 });
    const p = await c.newPage();
    await banco(p);
    await p.goto(`${BASE}/cronograma/0123456789abcdef01?demo=cheia`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.fo-titulo', { timeout: 30000 });
    const al = await p.evaluate(() => ['.fo-titulo', '.fo-sub', '.fo-campo', '.fo-musicas li', '.fo-avisos li']
      .map(s => getComputedStyle(document.querySelector(s)).textAlign));
    ok(al.every(a => a === 'left' || a === 'start'), `${w}: a folha se lê alinhada à esquerda`, al.join(','));
    ok(await semRolagemDeLado(p), `${w}: nada rola de lado`);
    const fundo = await p.evaluate(() => { const r = document.querySelector('.fo-pagina').getBoundingClientRect(); return Math.round(r.width); });
    ok(fundo >= w - 1, `${w}: o fundo da página vai de borda a borda`, String(fundo));
    if (w === 1440) {
      for (const v of ['cheia', 'longa', 'vazia']) {
        await p.goto(`${BASE}/cronograma/0123456789abcdef01?demo=${v}`, { waitUntil: 'domcontentloaded' });
        await p.waitForSelector('.fo-titulo', { timeout: 30000 });
        const pdf = await p.pdf({ format: 'A4', printBackground: true });
        const n = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
        ok(n === 1, `PDF da folha "${v}" em UMA página`, `${n} páginas`);
      }
    }
    await c.close();
  }
  {
    const c = await nav.newContext({ timezoneId: 'America/Sao_Paulo', viewport: { width: 390, height: 844 }, isMobile: true });
    const p = await c.newPage();
    const pedidos = await banco(p, { cronograma_publico: { ok: false, erro: 'LINK_INVALIDO' } });
    await p.goto(`${BASE}/cronograma/0123456789abcdef99`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.fo-pagina-msg h1', { timeout: 30000 });
    ok((await p.locator('h1').innerText()).includes('não abre') && pedidosDe(pedidos, 'cronograma_publico').length === 1, 'link que não vale: a página diz, sem quebrar');
    await p.goto(`${BASE}/cronograma/nao-e-token`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.fo-pagina-msg h1', { timeout: 30000 });
    ok(pedidosDe(pedidos, 'cronograma_publico').length === 1, 'endereço que nem tem cara de token não chega ao banco');
    await c.close();
  }
  }

  /* ----------------------------------------------------- 4 · o dirigente */
  console.log('\n4 · o dirigente da semana');
  if (roda(4)) {
  {
    const c = await nav.newContext({ timezoneId: 'America/Sao_Paulo', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await c.newPage();
    await banco(p);
    await p.goto(`${BASE}/eu/tok-demo?demo=dirigente`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#cronograma', { timeout: 30000 });
    const card = await p.locator('#cronograma').innerText();
    ok(/ainda falta: a leitura e os avisos/i.test(card), 'o cartão diz o que falta do bloco dele', card);
    ok(await p.locator('#cronograma a').getAttribute('href') === `/eu/tok-demo/culto/${DOM}`, 'e leva ao formulário daquele culto');
    ok(await semRolagemDeLado(p), 'nada rola de lado');
    await c.close();
  }
  for (const w of [320, 390]) {
    const c = await nav.newContext({ timezoneId: 'America/Sao_Paulo', viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true });
    const p = await c.newPage();
    let mudou = false;
    const pedidos = await banco(p, {
      eu_cronograma_salvar: corpo => mudou
        ? { ok: false, erro: 'MUDOU', atual: { quem: 'Pr. Daniel Moura', tema: 'Tema da liderança' } }
        : { ok: true, bloco: corpo.p_bloco, valor: corpo.p_valor, autoria: { por: 'Rui Teixeira', em: new Date().toISOString(), via: 'dirigente' } },
    });
    await p.goto(`${BASE}/eu/tok-demo/culto/${DOM}?demo=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#d-tema', { timeout: 30000 });
    ok(await p.inputValue('#d-quem') === 'Pr. Daniel Moura' && await p.inputValue('#d-leitura') === '', `${w}: o formulário abre com o que já tem`);
    ok(await semRolagemDeLado(p), `${w}: nada rola de lado`);
    await p.fill('#d-leitura', ' Gênesis 32:30 ');
    await p.getByRole('button', { name: 'Salvar a Palavra' }).click();
    await p.waitForSelector('.vol-flash', { timeout: 5000 });
    const sp = pedidosDe(pedidos, 'eu_cronograma_salvar');
    ok(sp.length === 1 && sp[0].corpo.p_token === 'tok-demo' && sp[0].corpo.p_data === DOM && sp[0].corpo.p_bloco === 'palavra'
      && sp[0].corpo.p_valor.leitura === 'Gênesis 32:30', `${w}: grava pelo token, aparado`, JSON.stringify(sp[0]?.corpo));
    ok(JSON.stringify(sp[0]?.corpo?.p_antes) === JSON.stringify({ quem: 'Pr. Daniel Moura', tema: 'Peniel: hoje Deus mudará sua identidade' }),
      `${w}: com o que a tela leu`);
    /* os avisos */
    ok(await p.locator('#avisos button[type="submit"]').innerText() === 'Salvar: não tem aviso neste culto', `${w}: sem aviso escrito, o botão diz o que acontece`);
    await p.locator('.vol-cr-aviso input').first().fill('Batismo no domingo 25');
    ok(await p.locator('#avisos button[type="submit"]').innerText() === 'Salvar os avisos', `${w}: com aviso, o botão muda`);
    await p.locator('#avisos button[type="submit"]').click();
    await esperar(400);
    const sa = pedidosDe(pedidos, 'eu_cronograma_salvar').at(-1)?.corpo;
    ok(sa?.p_bloco === 'avisos' && JSON.stringify(sa?.p_valor) === JSON.stringify([{ texto: 'Batismo no domingo 25', como: 'falado' }]) && sa?.p_antes === null,
      `${w}: os avisos gravados, e o antes era "falta"`, JSON.stringify(sa));
    /* MUDOU */
    mudou = true;
    await p.fill('#d-tema', 'Outro tema');
    await p.getByRole('button', { name: 'Salvar a Palavra' }).click();
    await p.waitForSelector('.vol-flash-ruim', { timeout: 5000 });
    ok(await p.inputValue('#d-tema') === 'Tema da liderança', `${w}: MUDOU: a tela mostra o que está salvo e avisa`);
    await c.close();
  }
  }

  /* ------------------------------------------------------- 5 · o painel */
  console.log('\n5 · o cartão do painel');
  if (roda(5)) {
  {
    const c = await nav.newContext({ timezoneId: 'America/Sao_Paulo', viewport: { width: 1440, height: 900 } });
    const p = await c.newPage();
    await banco(p);
    await p.goto(`${BASE}/painel?demo=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('text=Cronograma ·', { timeout: 30000 });
    const s = await p.locator('section.es-secao', { has: p.locator('h2', { hasText: 'Cronograma ·' }) }).innerText();
    /* o harness é a Mídia: o cartão mostra primeiro o que é com ela */
    ok(s.includes('Abrir') && s.includes('Mídia: ninguém escalado') && /é com Mídia\. (O prazo era|Prazo:)/.test(s) && !s.includes('A Palavra: leitura'),
      'o cartão mostra o que é com a área de quem abre, e o caminho', s);
    await c.close();
  }
  }

} finally {
  await nav.close();
}
console.log(`\ncronograma-tela: ${feitas - falhas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
