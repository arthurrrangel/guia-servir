/* =============================================================================
   MUDAR PESSOAS NA ESCALA MONTADA, NA TELA — 02/10/2026

   Pedido do Arthur: "verifique se não há nenhum impedimento sobre mudar os
   nomes de posição de escalas já montadas, tava tendo bloqueio e não tava
   conseguindo mudar pessoas". Três bloqueios, os três aqui:

     1. TROCAR A PESSOA DE UM POSTO OCUPADO (o principal, desde 19/09): a tela
        mandava INSERT no posto que ainda tinha linha, o banco recusava pelo
        unique (culto, função) e a tela dizia "Isso já está cadastrado". Esta
        prova exige que a troca vá como regravação da PRÓPRIA linha (upsert
        por id) e que nenhum INSERT nem DELETE toque o posto ocupado.
     2. QUEM JÁ ESTÁ EM OUTRO POSTO DO MESMO CULTO: era "Tire de lá antes".
        Agora a lista marca ("em ILUMINAÇÃO · ..."), escolher abre UMA
        pergunta com as saídas (trocar os dois de lugar / passar só a
        pessoa), e a gravação é uma instrução só com as duas vagas. Voltar e
        Escape não gravam nada.
     3. QUEM AVISOU QUE NÃO PODE: sumia da lista. Agora aparece no fim, num
        grupo próprio; escolher pergunta antes, tira o "não posso" daquele
        dia e escala; se a escalação falhar, o "não posso" volta.

   O banco aqui é de mentira (rotas interceptadas): o que se confere é o que a
   tela PEDE ao banco. O que o banco faz com isso foi provado à parte, com o
   PostgREST e o RLS de verdade, na 102 e na 107 (registro no Project).

   Roda com BASE=http://127.0.0.1:3500 node scripts/mudar-pessoas-tela.test.mjs */
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const OUT = '/tmp/mudar-pessoas-tela';
mkdirSync(OUT, { recursive: true });
const esperar = ms => new Promise(r => setTimeout(r, ms));
const ate = async (cond, ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await cond().catch(() => false)) return true; await esperar(200); }
  return false;
};
let falhas = 0, feitas = 0;
const ok = (c, nome, extra = '') => { feitas++; if (!c) falhas++; console.log(`  ${c ? 'ok ' : 'FALHOU'} ${nome}${!c && extra ? '\n      ' + extra : ''}`); };
const nav = await chromium.launch({ executablePath: chromeDoContainer() });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
const semRolagemDeLado = p => p.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1);

/* as funções do harness (lib/demo.ts): id = 'f' + ordem */
const FID = {
  'PROJEÇÃO': 'f1', 'ILUMINAÇÃO': 'f2', 'EDIÇÃO': 'f3', 'FOTO': 'f4', 'FILMAGEM': 'f5', 'HEAD': 'f6',
  'TRANSMISSÃO (CORTE + PTZ)': 'f7', 'CÂMERA 1': 'f8', 'CÂMERA 2': 'f9', 'APOIO NO BANHEIRO': 'f10',
};
const NOME_FN = Object.fromEntries(Object.entries(FID).map(([k, v]) => [v, k]));

/* O BANCO DE MENTIRA. Cada pedido fica registrado; `dia` é o retrato do dia
   como a tela mostrava antes do toque (é o que o banco "tem"). */
async function banco(p, estado) {
  const pedidos = [];
  await p.route('**/rest/v1/**', async r => {
    const req = r.request(); const m = req.method(); const u = new URL(req.url());
    if (m === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    const alvo = u.pathname.replace(/^\/rest\/v1\//, '');
    let corpo = null; try { corpo = req.postDataJSON(); } catch { corpo = req.postData(); }
    const reg = { m, alvo, busca: decodeURIComponent(u.search), prefer: req.headers()['prefer'] || '', corpo };
    const json = (status, b) => r.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(b) });
    /* RPCs (chegada, chamadas, como foi...): banco sem elas, como a 102 */
    if (alvo.startsWith('rpc/')) return json(404, { code: 'PGRST202', message: 'Could not find the function' });
    pedidos.push(reg);
    if (alvo === 'escalacoes' && m === 'GET') {
      const fns = (u.searchParams.get('funcao_id') || '').replace(/^in\.\(|\)$/g, '').split(',').filter(Boolean);
      const linhas = Object.entries(estado.dia || {})
        .filter(([fn, sl]) => sl.vid && (!fns.length || fns.includes(FID[fn])))
        .map(([fn, sl]) => ({ id: 'l-' + FID[fn], funcao_id: FID[fn], voluntario_id: sl.vid, status: sl.status || 'pendente',
          respondido_em: sl.status && sl.status !== 'pendente' ? '2026-09-28T12:00:00.000Z' : null, fixo: false, primeira_vez: false }));
      return json(200, linhas);
    }
    if (alvo === 'escalacoes' && m === 'POST') {
      if (estado.falharEscrita) return json(400, { code: 'P0001', message: estado.falharEscrita });
      return json(201, []);
    }
    if (alvo === 'escalacoes') return r.fulfill({ status: 204, headers: CORS });
    if (alvo === 'cultos' && m === 'GET') return json(200, [{ id: estado.culto, evento: null, equipe_id: null }]);
    if (alvo === 'indisponibilidades' && m === 'DELETE') return json(200, [{ data: estado.data }]);
    if (alvo === 'plantoes' && m === 'GET') return json(200, []);
    if (m === 'GET') return json(500, { code: 'XX000', message: 'recarga desligada no teste' });
    return json(201, []);
  });
  return pedidos;
}

/* o retrato do dia na tela: posto → pessoa e situação */
const retratoDoDia = dia => dia.locator('.es-ec-posto').evaluateAll(ps => Object.fromEntries(ps.filter(x => x.querySelector('.es-ec-quem select')).map(x => {
  const sels = x.querySelectorAll('select');
  return [x.querySelector('.es-ec-fn')?.textContent, { vid: sels[0]?.value || '', status: sels[1]?.value || 'pendente' }];
}).filter(([fn]) => fn)));
const posto = (dia, fn) => dia.locator('.es-ec-posto').filter({ has: dia.page().locator('.es-ec-fn', { hasText: fn }) }).first();
/* `atual`: a opção que já está escolhida no posto. Escolher de novo quem já
   está lá não muda nada (nem pergunta), e o demo às vezes põe no posto
   alguém que avisou que não pode naquele dia: a cena 3 pegava essa opção e
   esperava uma pergunta que não vem (medido em 05/10/2026, no master de
   04/10 também: depende de qual domingo é o segundo que vem). */
const opcoes = (dia, fn) => posto(dia, fn).locator('.es-ec-quem select').evaluate(s => [...s.options].map(o => ({
  v: o.value, t: o.textContent, atual: o.value === s.value,
  grupo: o.parentElement?.tagName === 'OPTGROUP' ? o.parentElement.label : '' })));

async function abrir(w, h, toque) {
  const c = await nav.newContext({ viewport: { width: w, height: h }, isMobile: toque, hasTouch: toque, deviceScaleFactor: 2 });
  await c.route('**', r => {
    const u = r.request().url();
    return u.startsWith(BASE) || u.includes('/rest/v1/') ? r.fallback() : r.abort();
  });
  const p = await c.newPage();
  const estado = { dia: {}, culto: '', data: '', falharEscrita: null };
  const pedidos = await banco(p, estado);
  await p.goto(`${BASE}/escala?demo=1`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('details[id^="d20"]', { timeout: 90000 });
  await esperar(1200);
  return { c, p, estado, pedidos };
}
async function abrirDia(p, i) {
  const d = p.locator('details[id^="d20"]').nth(i);
  if (!(await d.evaluate(e => e.open))) { await d.locator(':scope > summary').click(); await esperar(300); }
  return d;
}

try {
  /* LARGURAS=390 roda só o celular (as sabotagens usam para ir mais rápido) */
  const LARGURAS = (process.env.LARGURAS || '390,1440').split(',');
  for (const [w, h, toque, nome] of [[390, 844, true, '390'], [1440, 900, false, '1440']].filter(x => LARGURAS.includes(x[3]))) {
    console.log(`\n${nome}px`);

    /* ------------------------------------- 1 · trocar a pessoa de um posto ocupado */
    {
      const { c, p, estado, pedidos } = await abrir(w, h, toque);
      const nDias = await p.locator('details[id^="d20"]').count();
      let feito = false;
      for (let i = 0; i < nDias && !feito; i++) {
        const dia = await abrirDia(p, i);
        const data = (await dia.getAttribute('id')).slice(1);
        const ret = await retratoDoDia(dia);
        for (const [fn, sl] of Object.entries(ret)) {
          if (!sl.vid || feito) continue;
          /* alguém livre: não está em outro posto ao mesmo tempo, não avisou que não pode */
          const livre = (await opcoes(dia, fn)).find(o => o.v && o.v !== sl.vid && !o.grupo && !o.t.startsWith('em ') && !/não está mais/.test(o.t));
          if (!livre) continue;
          Object.assign(estado, { dia: ret, culto: 'c' + data, data });
          pedidos.length = 0;
          await posto(dia, fn).locator('.es-ec-quem select').selectOption(livre.v);
          /* quem já respondeu pede confirmação antes ("trocar apaga essa resposta") */
          const conf = p.locator('dialog.es-dialogo[open]');
          if (await ate(async () => await conf.count() > 0, 1500)) await conf.locator('[data-sim]').click();
          ok(await ate(async () => pedidos.some(x => x.alvo === 'escalacoes' && x.m === 'POST')), `${nome}: a troca chega ao banco`);
          const escritas = pedidos.filter(x => x.alvo === 'escalacoes' && x.m !== 'GET');
          const up = escritas.find(x => x.m === 'POST');
          ok(!!up && /on_conflict=id/.test(up.busca) && /merge-duplicates/.test(up.prefer),
            `${nome}: vai como regravação por id (upsert), não como INSERT`, JSON.stringify(up));
          const linha = Array.isArray(up?.corpo) ? up.corpo[0] : null;
          ok(!!linha && linha.id === 'l-' + FID[fn] && linha.funcao_id === FID[fn] && linha.voluntario_id === livre.v
             && linha.status === 'pendente' && linha.respondido_em === null && linha.fixo === true,
            `${nome}: a PRÓPRIA linha do posto muda de pessoa, falta confirmar, fixa`, JSON.stringify(up?.corpo));
          ok(!escritas.some(x => x.m === 'DELETE') && escritas.filter(x => x.m === 'POST').length === 1,
            `${nome}: nada apagado, nada inserido no posto ocupado`, JSON.stringify(escritas.map(x => [x.m, x.busca])));
          feito = true;
        }
      }
      ok(feito, `${nome}: achou um posto ocupado com gente livre para pôr`);
      await c.close();
    }

    /* ------------------------------------------- 2 · quem já está em outro posto */
    {
      const { c, p, estado, pedidos } = await abrir(w, h, toque);
      const nDias = await p.locator('details[id^="d20"]').count();
      let viuTroca = false, viuSoPassar = false, voltou = false, escapou = false, marca = false;
      for (let i = 0; i < nDias && !(viuTroca && viuSoPassar); i++) {
        const dia = await abrirDia(p, i);
        const data = (await dia.getAttribute('id')).slice(1);
        const ret = await retratoDoDia(dia);
        for (const [fn, sl] of Object.entries(ret)) {
          if (!sl.vid || (viuTroca && viuSoPassar)) continue;
          for (const o of (await opcoes(dia, fn)).filter(o => o.t.startsWith('em '))) {
            if (viuTroca && viuSoPassar) break;
            marca = true;
            const de = o.t.slice(3, o.t.indexOf(' · '));
            Object.assign(estado, { dia: ret, culto: 'c' + data, data });
            pedidos.length = 0;
            await posto(dia, fn).locator('.es-ec-quem select').selectOption(o.v);
            const dlg = p.locator('dialog.es-decidir[open]');
            if (!(await ate(async () => await dlg.count() > 0, 4000))) { ok(false, `${nome}: escolher quem está em ${de} abre a pergunta`); continue; }
            const titulo = (await dlg.locator('.es-dialogo-titulo').innerText()).trim();
            const saidas = await dlg.locator('.es-saida').evaluateAll(bs => bs.map(b => ({ v: b.dataset.saida, rot: b.querySelector('.es-saida-rot')?.textContent, sub: b.querySelector('.es-saida-sub')?.textContent })));
            ok(new RegExp(`já está em ${de.replace(/[()+]/g, '\\$&')} nesse culto\\.$`).test(titulo), `${nome}: a pergunta diz onde a pessoa está`, titulo);
            ok(!/[—–]/.test(await dlg.innerText()), `${nome}: sem travessão na pergunta`);
            /* o desenho: nada sai da tela, nada cortado */
            const caixa = await dlg.evaluate(d => { const r = d.getBoundingClientRect(); return { l: r.left, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight }; });
            ok(caixa.l >= 0 && caixa.r <= caixa.w && caixa.b <= caixa.h, `${nome}: a pergunta cabe na tela`, JSON.stringify(caixa));
            const cortado = await dlg.locator('.es-saida').evaluateAll(bs => bs.some(b => b.scrollWidth > b.clientWidth + 1));
            ok(!cortado, `${nome}: nenhuma saída cortada`);
            const temTroca = saidas.some(s => s.v === 'trocar');
            if (!voltou) {
              /* Voltar não grava nada e o posto continua com quem estava */
              await dlg.locator('[data-nao]').click(); await esperar(400);
              ok(!pedidos.some(x => x.alvo === 'escalacoes' && x.m !== 'GET'), `${nome}: Voltar não grava nada`, JSON.stringify(pedidos));
              ok((await posto(dia, fn).locator('.es-ec-quem select').inputValue()) === sl.vid, `${nome}: e o posto continua com quem estava`);
              voltou = true;
              continue;
            }
            if (!escapou) {
              await p.keyboard.press('Escape'); await esperar(400);
              ok(await dlg.count() === 0 && !pedidos.some(x => x.alvo === 'escalacoes' && x.m !== 'GET'), `${nome}: Escape fecha sem gravar`);
              escapou = true;
              continue;
            }
            if (temTroca && !viuTroca) {
              ok(saidas[0].v === 'trocar' && saidas[0].rot === 'Trocar os dois de lugar' && / vai para /.test(saidas[0].sub || ''),
                `${nome}: com troca, "Trocar os dois de lugar" vem primeiro, com quem vai para onde`, JSON.stringify(saidas));
              if (toque && nome === '390') await p.screenshot({ path: `${OUT}/pergunta-troca-${nome}.png` });
              await dlg.locator('[data-saida="trocar"]').click();
              ok(await ate(async () => pedidos.some(x => x.alvo === 'escalacoes' && x.m === 'POST')), `${nome}: trocar grava`);
              const ups = pedidos.filter(x => x.alvo === 'escalacoes' && x.m === 'POST');
              const corpo = ups[0]?.corpo || [];
              const porId = Object.fromEntries(corpo.map(l => [l.id, l]));
              ok(ups.length === 1 && corpo.length === 2 && /on_conflict=id/.test(ups[0].busca),
                `${nome}: UMA instrução com as duas vagas`, JSON.stringify(ups));
              ok(porId['l-' + FID[fn]]?.voluntario_id === o.v && porId['l-' + FID[de]]?.voluntario_id === sl.vid,
                `${nome}: a escolhida entra no posto, quem estava vai para ${de}`, JSON.stringify(corpo));
              ok(corpo.every(l => l.fixo === true), `${nome}: as duas vagas ficam fixas`);
              ok(!pedidos.some(x => x.alvo === 'escalacoes' && x.m === 'DELETE'), `${nome}: e nada é apagado`);
              ok(await ate(async () => await p.getByText(/^Trocados: /).count() > 0, 5000), `${nome}: e diz que trocou`);
              viuTroca = true;
            } else if (!temTroca && !viuSoPassar) {
              ok(saidas.length === 1 && saidas[0].v === 'passar', `${nome}: sem troca possível, só "passar"`, JSON.stringify(saidas));
              const texto = (await dlg.locator('.es-dialogo-texto').innerText()).trim();
              ok(/^Não dá para trocar os dois de lugar: .+\.$/.test(texto), `${nome}: e diz por que não dá para trocar`, texto);
              if (nome === '390') await p.screenshot({ path: `${OUT}/pergunta-so-passar-${nome}.png` });
              await dlg.locator('[data-saida="passar"]').click();
              ok(await ate(async () => pedidos.some(x => x.alvo === 'escalacoes' && x.m === 'POST')), `${nome}: passar grava`);
              const up = pedidos.find(x => x.alvo === 'escalacoes' && x.m === 'POST');
              const porId = Object.fromEntries((up?.corpo || []).map(l => [l.id, l]));
              ok(porId['l-' + FID[fn]]?.voluntario_id === o.v && porId['l-' + FID[de]]?.voluntario_id === null,
                `${nome}: a pessoa entra no posto e a origem fica sem ninguém, na mesma instrução`, JSON.stringify(up?.corpo));
              ok(await ate(async () => pedidos.some(x => x.alvo === 'escalacoes' && x.m === 'DELETE' && x.busca.includes('l-' + FID[de]) && /voluntario_id=is\.null/.test(x.busca))),
                `${nome}: e a linha vazia sai depois (só se continuar vazia)`, JSON.stringify(pedidos.filter(x => x.m === 'DELETE')));
              ok(await ate(async () => await p.getByText(new RegExp(`passou para ${fn.replace(/[()+]/g, '\\$&')}$`)).count() > 0, 5000), `${nome}: e diz que passou`);
              viuSoPassar = true;
            } else {
              await dlg.locator('[data-nao]').click(); await esperar(300);
            }
          }
        }
      }
      ok(marca, `${nome}: a lista marca quem já está em outro posto ("em ... · ")`);
      ok(viuTroca, `${nome}: o caso com troca possível foi visto`);
      ok(viuSoPassar, `${nome}: o caso sem troca possível foi visto`);
      ok(await semRolagemDeLado(p), `${nome}: sem rolagem de lado`);
      await c.close();
    }

    /* ---------------------------------------------- 3 · quem avisou que não pode */
    for (const falhar of [false, true]) {
      const { c, p, estado, pedidos } = await abrir(w, h, toque);
      const nDias = await p.locator('details[id^="d20"]').count();
      let feito = false;
      for (let i = 0; i < nDias && !feito; i++) {
        const dia = await abrirDia(p, i);
        const data = (await dia.getAttribute('id')).slice(1);
        const ret = await retratoDoDia(dia);
        for (const fn of Object.keys(ret)) {
          if (feito) break;
          const o = (await opcoes(dia, fn)).find(x => x.grupo === 'Avisaram que não podem nesse dia' && !x.t.startsWith('em ') && !x.atual);
          if (!o) continue;
          Object.assign(estado, { dia: ret, culto: 'c' + data, data, falharEscrita: falhar ? 'Erro de teste: o banco recusou.' : null });
          pedidos.length = 0;
          await posto(dia, fn).locator('.es-ec-quem select').selectOption(o.v);
          const dlg = p.locator('dialog.es-dialogo[open]');
          ok(await ate(async () => await dlg.count() > 0, 4000), `${nome}${falhar ? ' (falha)' : ''}: escolher quem avisou que não pode pergunta antes`);
          const titulo = (await dlg.locator('.es-dialogo-titulo').innerText()).trim();
          ok(/avisou que não pode em \d{2}\/\d{2}\.$/.test(titulo), `${nome}: a pergunta diz o dia`, titulo);
          ok((await dlg.locator('[data-sim]').innerText()).trim() === 'Escalar mesmo assim', `${nome}: o botão diz o que faz`);
          if (!falhar && nome === '390') await p.screenshot({ path: `${OUT}/nao-posso-${nome}.png` });
          await dlg.locator('[data-sim]').click();
          /* se já respondeu quem estava no posto, vem a confirmação de sempre */
          const conf2 = p.locator('dialog.es-dialogo[open]');
          if (await ate(async () => await conf2.count() > 0, 1500)) await conf2.locator('[data-sim]').click();
          ok(await ate(async () => pedidos.some(x => x.alvo === 'indisponibilidades' && x.m === 'DELETE')),
            `${nome}: o "não posso" daquele dia sai`, JSON.stringify(pedidos.map(x => [x.m, x.alvo])));
          const tira = pedidos.find(x => x.alvo === 'indisponibilidades' && x.m === 'DELETE');
          ok(tira.busca.includes(`voluntario_id=eq.${o.v}`) && tira.busca.includes(`data=eq.${data}`), `${nome}: só o daquele dia e daquela pessoa`, tira.busca);
          ok(await ate(async () => pedidos.some(x => x.alvo === 'escalacoes' && x.m === 'POST')), `${nome}: e escala`);
          const iTira = pedidos.indexOf(tira), iEsc = pedidos.findIndex(x => x.alvo === 'escalacoes' && x.m === 'POST');
          ok(iTira < iEsc, `${nome}: nessa ordem (sem tirar, o banco recusa)`);
          if (falhar) {
            ok(await ate(async () => pedidos.some(x => x.alvo === 'indisponibilidades' && x.m === 'POST')),
              `${nome} (falha): a escalação recusada devolve o "não posso"`, JSON.stringify(pedidos.map(x => [x.m, x.alvo])));
            const volta = pedidos.find(x => x.alvo === 'indisponibilidades' && x.m === 'POST');
            ok(volta?.corpo?.voluntario_id === o.v && volta?.corpo?.data === data, `${nome} (falha): da mesma pessoa e do mesmo dia`, JSON.stringify(volta));
          } else {
            ok(!pedidos.some(x => x.alvo === 'indisponibilidades' && x.m === 'POST'), `${nome}: deu certo, nada é devolvido`);
          }
          feito = true;
        }
      }
      ok(feito, `${nome}${falhar ? ' (falha)' : ''}: a lista mostra quem avisou que não pode, num grupo no fim`);
      await c.close();
    }
  }
} catch (e) {
  falhas++; console.log('  FALHOU (exceção)', e?.stack || e);
} finally {
  await nav.close();
}
console.log(`\nmudar-pessoas-tela: ${feitas - falhas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
