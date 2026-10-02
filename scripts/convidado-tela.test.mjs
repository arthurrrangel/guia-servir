/* =============================================================================
   QUEM É DE FORA DA LISTA NO POSTO, NA TELA DA ESCALA — 02/10/2026 (108)

   O posto do Louvor que é de um convidado ("Guest", "Guest Rafa") ou de
   alguém de outro ministério. Esta prova exige, a 390 e a 1440:

     1. o posto com Guest mostra o nome e "fora da lista", e a mensagem do
        grupo leva o nome sem situação (nada de "PRECISO DE ALGUÉM" nele);
     2. "Escrever um nome" abre a caixa com o campo focado e os nomes já
        usados como atalho; Salvar grava UM pedido salvar_convidado com o
        culto, a função e o nome; o posto passa a mostrar o nome;
     3. Voltar e Escape não gravam nada e a lista volta ao que estava;
     4. quem já CONFIRMOU pede confirmação antes de sair do posto;
     5. "precisa de alguém" no posto do Guest tira o texto (p_nome nulo);
     6. escolher alguém da lista no posto do Guest grava a escalação e não
        chama salvar_convidado (o gatilho da 108 tira o texto no banco);
     7. sem a 108 no banco (demo comum), a opção não existe;
     8. nada rola de lado, e a caixa cabe na tela do celular.

   O banco aqui é de mentira (rotas interceptadas): o que se confere é o que a
   tela PEDE. O que o banco faz com isso foi provado à parte (conferência da
   108 e a ponta a ponta com o PostgREST).

   Roda com BASE=http://127.0.0.1:3500 node scripts/convidado-tela.test.mjs */
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const esperar = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0, feitas = 0;
const ok = (c, nome, extra = '') => { feitas++; if (!c) falhas++; console.log(`  ${c ? 'ok ' : 'FALHOU'} ${nome}${!c && extra ? '\n      ' + extra : ''}`); };
const nav = await chromium.launch({ executablePath: chromeDoContainer() });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
const semRolagemDeLado = p => p.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1);
const FID = {
  'PROJEÇÃO': 'f1', 'ILUMINAÇÃO': 'f2', 'EDIÇÃO': 'f3', 'FOTO': 'f4', 'FILMAGEM': 'f5', 'HEAD': 'f6',
  'TRANSMISSÃO (CORTE + PTZ)': 'f7', 'CÂMERA 1': 'f8', 'CÂMERA 2': 'f9', 'APOIO NO BANHEIRO': 'f10',
};

async function banco(p) {
  const pedidos = [];
  await p.route('**/rest/v1/**', async r => {
    const req = r.request(); const m = req.method(); const u = new URL(req.url());
    if (m === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    const alvo = u.pathname.replace(/^\/rest\/v1\//, '');
    let corpo = null; try { corpo = req.postDataJSON(); } catch { corpo = req.postData(); }
    const json = (status, b) => r.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(b) });
    pedidos.push({ m, alvo, corpo });
    if (alvo === 'rpc/salvar_convidado') return json(200, { ok: true, convidados: {} });
    if (alvo.startsWith('rpc/')) return json(404, { code: 'PGRST202', message: 'Could not find the function' });
    if (alvo === 'escalacoes' && m === 'GET') return json(200, []);
    if (alvo === 'cultos' && m === 'GET') return json(200, []);
    if (alvo === 'plantoes' && m === 'GET') return json(200, []);
    if (m === 'GET') return json(500, { code: 'XX000', message: 'recarga desligada no teste' });
    return json(201, []);
  });
  return pedidos;
}

async function abrir(w, h, toque, demo = 'convidado') {
  const c = await nav.newContext({ viewport: { width: w, height: h }, isMobile: toque, hasTouch: toque, deviceScaleFactor: 2 });
  await c.route('**', r => {
    const u = r.request().url();
    return u.startsWith(BASE) || u.includes('/rest/v1/') ? r.fallback() : r.abort();
  });
  const p = await c.newPage();
  const pedidos = await banco(p);
  await p.goto(`${BASE}/escala?demo=${demo}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('details[id^="d20"]', { timeout: 90000 });
  await esperar(1200);
  return { c, p, pedidos };
}
/* o primeiro dia que ainda vem (é onde o harness pôs o Guest) */
async function diaComGuest(p) {
  const ids = await p.locator('details[id^="d20"]').evaluateAll(ds => ds.map(d => d.id));
  const hoje = new Date(); const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  const id = ids.find(x => x.slice(1) >= iso);
  const d = p.locator(`#${id}`);
  if (!(await d.evaluate(e => e.open))) { await d.locator(':scope > summary').click(); await esperar(400); }
  return { d, data: id.slice(1) };
}
const posto = (dia, fn) => dia.locator('.es-ec-posto').filter({ has: dia.page().locator('.es-ec-fn', { hasText: new RegExp(`^${fn.replace(/[()+]/g, m => '\\' + m)}$`) }) }).first();
const caixa = p => p.locator('dialog.es-escrever[open]');

try {
  const LARGURAS = (process.env.LARGURAS || '390,1440').split(',');
  for (const [w, h, toque, nome] of [[390, 844, true, '390'], [1440, 900, false, '1440']].filter(x => LARGURAS.includes(x[3]))) {
    console.log(`\n${nome}px`);

    /* 1 · o posto com Guest, e a mensagem */
    {
      const { c, p } = await abrir(w, h, toque);
      const { d } = await diaComGuest(p);
      const foto = posto(d, 'FOTO');
      const mostra = (await foto.locator('.es-escolha-txt').first().innerText()).trim();
      ok(mostra === 'Guest Rafa', `${nome}: o posto mostra o nome escrito`, mostra);
      ok(await foto.getByText('fora da lista').count() === 1, `${nome}: e diz "fora da lista"`);
      ok(await foto.locator('.es-ec-quem select').inputValue() === '__fora', `${nome}: a lista está na opção de fora`);
      await d.getByRole('button', { name: 'Mandar nos grupos' }).click(); await esperar(500);
      const msgs = await d.locator('.es-mg-linha pre.es-msg').allTextContents();
      ok(msgs.length >= 2 && msgs[0].includes('FOTO\nGuest Rafa\n'), `${nome}: a mensagem do grupo geral leva o nome, sem situação`, (msgs[0] || '').slice(0, 400));
      ok(msgs.every(t => !/FOTO\n\*\*\* PRECISO/.test(t)), `${nome}: e não pede alguém para a FOTO`);
      const doGrupo = msgs.find(t => t.includes('· Mídia · Foto e vídeo'));
      ok(!!doGrupo && doGrupo.includes('FOTO\nGuest Rafa\n'), `${nome}: o grupo da foto também leva o nome`);
      ok(await semRolagemDeLado(p), `${nome}: a página não rola de lado`);
      await c.close();
    }

    /* 2 · escrever um nome num posto com gente da lista (pendente) */
    {
      const { c, p, pedidos } = await abrir(w, h, toque);
      const { d, data } = await diaComGuest(p);
      /* um posto com alguém que ainda não respondeu */
      const postos = await d.locator('.es-ec-posto').evaluateAll(ps => ps.map(x => ({
        fn: x.querySelector('.es-ec-fn')?.textContent || '', vid: x.querySelector('.es-ec-quem select')?.value || '',
        st: x.querySelectorAll('select')[1]?.value || '' })));
      const alvo = postos.find(x => x.vid && x.vid !== '__fora' && x.st === 'pendente');
      ok(!!alvo, `${nome}: o harness tem um posto com alguém pendente`, JSON.stringify(postos));
      const sel = posto(d, alvo.fn).locator('.es-ec-quem select');
      const opcoes = await sel.evaluate(s => [...s.options].map(o => ({ v: o.value, t: o.textContent, g: o.parentElement?.tagName === 'OPTGROUP' ? o.parentElement.label : '' })));
      const fora = opcoes.find(o => o.v === '__fora');
      ok(!!fora && fora.g === 'Fora da lista' && /Escrever um nome/.test(fora.t), `${nome}: a opção "Escrever um nome" mora no fim, em "Fora da lista"`, JSON.stringify(fora));
      pedidos.length = 0;
      await sel.selectOption('__fora'); await esperar(400);
      ok(await caixa(p).count() === 1, `${nome}: abre a caixa de escrever`);
      const titulo = await caixa(p).locator('.es-dialogo-titulo').innerText();
      ok(titulo.startsWith(`Quem faz ${alvo.fn} em `), `${nome}: a caixa pergunta quem faz o posto`, titulo);
      ok(await p.evaluate(() => document.activeElement?.matches('dialog.es-escrever input')), `${nome}: o campo nasce com o foco`);
      const atalhos = await caixa(p).locator('.es-escrever-sugestoes .es-ficha').allInnerTexts();
      ok(atalhos.includes('Guest Rafa'), `${nome}: os nomes já usados viram atalho`, atalhos.join(','));
      /* Voltar: nada grava */
      await caixa(p).getByRole('button', { name: 'Voltar' }).click(); await esperar(400);
      ok(await caixa(p).count() === 0 && !pedidos.some(x => x.alvo === 'rpc/salvar_convidado'), `${nome}: Voltar não grava nada`);
      ok(await sel.inputValue() === alvo.vid, `${nome}: e a lista volta a quem estava`, await sel.inputValue());
      /* Escape: nada grava */
      await sel.selectOption('__fora'); await esperar(400);
      await p.keyboard.press('Escape'); await esperar(400);
      ok(await caixa(p).count() === 0 && !pedidos.some(x => x.alvo === 'rpc/salvar_convidado'), `${nome}: Escape não grava nada`);
      /* o atalho preenche, Salvar grava */
      await sel.selectOption('__fora'); await esperar(400);
      const box = await caixa(p).locator('.es-dialogo-corpo').boundingBox();
      ok(!!box && box.x >= 0 && box.x + box.width <= w + 1 && box.y >= 0 && box.y + box.height <= h + 1, `${nome}: a caixa cabe na tela`, JSON.stringify(box));
      await caixa(p).locator('.es-escrever-sugestoes .es-ficha', { hasText: 'Guest Rafa' }).click(); await esperar(200);
      ok(await caixa(p).locator('input').inputValue() === 'Guest Rafa', `${nome}: o atalho preenche o campo`);
      /* espaços sobrando saem (aparado, um espaço só entre palavras) */
      await caixa(p).locator('input').fill('  Guest   Teste  ');
      await caixa(p).locator('input').press('Enter'); await esperar(900);
      const grav = pedidos.filter(x => x.alvo === 'rpc/salvar_convidado');
      ok(grav.length === 1 && grav[0].corpo?.p_culto === 'c' + data && grav[0].corpo?.p_funcao === FID[alvo.fn] && grav[0].corpo?.p_nome === 'Guest Teste',
        `${nome}: Enter grava um pedido só, com culto, função e o nome aparado`, JSON.stringify(grav));
      ok(!pedidos.some(x => x.alvo === 'escalacoes' && x.m !== 'GET'), `${nome}: e não mexe na escalação pela tela (o banco tira quem estava)`);
      const mostra = (await posto(d, alvo.fn).locator('.es-escolha-txt').first().innerText()).trim();
      ok(mostra === 'Guest Teste', `${nome}: o posto passa a mostrar o nome`, mostra);
      await c.close();
    }

    /* 3 · quem já confirmou pede antes */
    {
      const { c, p, pedidos } = await abrir(w, h, toque);
      const { d } = await diaComGuest(p);
      const postos = await d.locator('.es-ec-posto').evaluateAll(ps => ps.map(x => ({
        fn: x.querySelector('.es-ec-fn')?.textContent || '', vid: x.querySelector('.es-ec-quem select')?.value || '',
        st: x.querySelectorAll('select')[1]?.value || '' })));
      const alvo = postos.find(x => x.vid && x.vid !== '__fora' && x.st === 'confirmado');
      if (alvo) {
        await posto(d, alvo.fn).locator('.es-ec-quem select').selectOption('__fora'); await esperar(400);
        const conf = p.locator('dialog.es-dialogo[open]:not(.es-escrever):not(.es-decidir)');
        ok(await conf.count() === 1 && /já CONFIRMOU/.test(await conf.innerText()), `${nome}: quem já confirmou pede confirmação antes`);
        await conf.getByRole('button', { name: 'Voltar' }).click(); await esperar(300);
        ok(await caixa(p).count() === 0 && !pedidos.some(x => x.alvo === 'rpc/salvar_convidado'), `${nome}: e Voltar ali não abre nem grava nada`);
      } else ok(false, `${nome}: o harness tem um posto confirmado`, JSON.stringify(postos));
      await c.close();
    }

    /* 4 · tirar o texto, e 5 · escolher alguém da lista no posto do Guest */
    {
      const { c, p, pedidos } = await abrir(w, h, toque);
      const { d, data } = await diaComGuest(p);
      const sel = posto(d, 'FOTO').locator('.es-ec-quem select');
      pedidos.length = 0;
      await sel.selectOption(''); await esperar(900);
      const grav = pedidos.filter(x => x.alvo === 'rpc/salvar_convidado');
      ok(grav.length === 1 && grav[0].corpo?.p_nome === null && grav[0].corpo?.p_funcao === 'f4' && grav[0].corpo?.p_culto === 'c' + data,
        `${nome}: "precisa de alguém" tira o texto`, JSON.stringify(grav));
      const mostra = (await posto(d, 'FOTO').locator('.es-escolha-txt').first().innerText()).trim();
      ok(mostra === 'precisa de alguém', `${nome}: e o posto volta a pedir alguém`, mostra);
      await c.close();
    }
    {
      const { c, p, pedidos } = await abrir(w, h, toque);
      const { d } = await diaComGuest(p);
      const sel = posto(d, 'FOTO').locator('.es-ec-quem select');
      const livre = (await sel.evaluate(s => [...s.options].map(o => ({ v: o.value, t: o.textContent, g: o.parentElement?.tagName === 'OPTGROUP' }))))
        .find(o => o.v && o.v !== '__fora' && !o.g && !o.t.startsWith('em '));
      pedidos.length = 0;
      await sel.selectOption(livre.v); await esperar(1200);
      ok(pedidos.some(x => x.alvo === 'escalacoes' && x.m === 'POST'), `${nome}: escolher alguém da lista grava a escalação`, pedidos.map(x => x.m + ' ' + x.alvo).join(', '));
      ok(!pedidos.some(x => x.alvo === 'rpc/salvar_convidado'), `${nome}: sem pedido de tirar o texto (o gatilho do banco tira)`);
      const mostra = (await posto(d, 'FOTO').locator('.es-escolha-txt').first().innerText()).trim();
      ok(mostra !== 'Guest Rafa' && mostra !== 'precisa de alguém', `${nome}: o posto mostra a pessoa da lista`, mostra);
      await c.close();
    }

    /* 6 · sem a 108: a opção não existe */
    {
      const { c, p } = await abrir(w, h, toque, '1');
      const { d } = await diaComGuest(p);
      const grupos = await d.locator('.es-ec-quem select optgroup').evaluateAll(gs => gs.map(g => g.label));
      ok(!grupos.includes('Fora da lista'), `${nome}: sem a 108 no banco, nada de "Fora da lista"`, grupos.join(','));
      await c.close();
    }
  }
} finally {
  await nav.close();
}
console.log(`\nconvidado-tela: ${feitas - falhas}/${feitas} ok`);
if (falhas) process.exit(1);
