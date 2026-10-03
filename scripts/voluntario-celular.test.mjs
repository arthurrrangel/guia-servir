/* =============================================================================
   A ÁREA DO VOLUNTÁRIO NO CELULAR: CONFIRMAR E "QUANDO VOCÊ PODE" — 02/10/2026

   Pedido do Arthur: "melhore a intuitividade e objetividade da área do
   voluntário no celular para posso / não posso e confirmar escala". Esta prova
   exige, a 360, 390 e 1440:

     1. um cartão por CULTO no bloco escuro, com a data e a hora primeiro e os
        postos dentro; "Eu vou" grava os postos do cartão (uma chamada por
        posto) e o cartão sai NA HORA, antes de o banco responder;
     2. "Não posso" perto do dia grava os postos e abre "Quem pode te cobrir";
     3. o banco recusando, o cartão volta e a barra diz o porquê;
     4. na grade, o dia em que a pessoa está escalada responde a ESCALA:
        "Posso" confirma os postos que esperam (e o cartão de cima some
        junto), e não marca só disponibilidade;
     5. o dia sem escala responde a disponibilidade, muda na hora, e volta se
        o banco recusar;
     6. "Posso no mês" cobre os dias soltos e os postos que esperam;
     7. o cartão da próxima escala mostra todos os postos do culto, e
        "Depois disso" não repete o mesmo culto; com dias em branco, o título
        diz o que fazer ("Diga quando você pode"), e "Tudo certo" só aparece
        com tudo respondido; as frases não têm gênero ("Presença
        confirmada", "Boas-vindas"); as ações de "Depois disso" ficam lado a
        lado numa linha própria, e "Marcar chegada" do líder do dia cabe numa
        linha (achados da auditoria visual de 02/10);
     8. nada rola de lado, todo alvo tem 44px, e a coluna das datas da grade
        tem uma régua só (o ponto de "falta" fica na margem).

   O banco aqui é de mentira (rotas interceptadas): o que se confere é o que a
   tela PEDE e como ela reage. O que `eu_responder` e `eu_disponibilidade`
   fazem no banco já está provado nas conferências da 71, 75 e 79.

   Roda com BASE=http://127.0.0.1:3500 node scripts/voluntario-celular.test.mjs */
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const esperar = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0, feitas = 0;
const ok = (c, nome, extra = '') => { feitas++; if (!c) falhas++; console.log(`  ${c ? 'ok ' : 'FALHOU'} ${nome}${!c && extra ? '\n      ' + extra : ''}`); };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const nav = await chromium.launch({ executablePath: chromeDoContainer() });

/* o banco de mentira: guarda os pedidos, responde com atraso e, quando
   mandado, recusa */
function banco(p) {
  const b = { pedidos: [], atraso: 0, recusar: new Set() };
  p.route('**/rest/v1/rpc/*', async r => {
    const req = r.request();
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
    const rpc = new URL(req.url()).pathname.split('/rpc/')[1];
    let corpo = {}; try { corpo = req.postDataJSON() || {}; } catch {}
    b.pedidos.push({ rpc, corpo });
    if (b.atraso) await esperar(b.atraso);
    const json = (status, x) => r.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(x) });
    if (b.recusar.has(rpc)) return json(500, { code: 'XX000', message: 'falhou de proposito' });
    if (rpc === 'eu_responder') return json(200, { ok: true, mudou: 1, status: corpo.p_status });
    if (rpc === 'eu_quem_cobre') return json(200, [{ nome: 'Larissa Moura', telefone: '21999990000', nivel: 'titular', disse_que_pode: true }]);
    return json(200, null);
  });
  return b;
}
async function abrir(c, demo) {
  const p = await c.newPage();
  const b = banco(p);
  await p.goto(`${BASE}/eu/x?demo=${demo}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#meu-perfil', { timeout: 90000 }); await esperar(1500);
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  b.pedidos.length = 0;
  return { p, b };
}
const barra = async p => (await p.locator('.vol-flash').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
const so = (b, rpc) => b.pedidos.filter(x => x.rpc === rpc);
/* o "·" da linha dos postos é seguido de espaço que não quebra (U+00A0) */
const linhaEscalada = p => p.locator('#quando-posso .vol-dia', { has: p.locator('.vol-dia-sub', { hasText: /^na escala · PROJEÇÃO/ }) }).first();

try {
  const LARGURAS = (process.env.LARGURAS || '360,390,1440').split(',');
  for (const [w, h, toque, nome] of [[360, 780, true, '360'], [390, 844, true, '390'], [1440, 900, false, '1440']].filter(x => LARGURAS.includes(x[3]))) {
    console.log(`\n${nome}px`);
    const c = await nav.newContext({ viewport: { width: w, height: h }, isMobile: toque, hasTouch: toque, deviceScaleFactor: 1 });
    await c.route('**', r => { const u = r.request().url(); return u.startsWith(BASE) || u.includes('/rest/v1/') ? r.fallback() : r.abort(); });

    /* 1 · o cartão por culto, e "Eu vou" que muda na hora */
    {
      const { p, b } = await abrir(c, '1');
      const cartoes = p.locator('#confirmar .vol-pede');
      ok(await cartoes.count() === 1, `${nome}: um cartão só para os dois postos do mesmo culto`, String(await cartoes.count()));
      const quando = (await cartoes.first().locator('.vol-pede-quando').innerText()).trim();
      ok(/\d{1,2} de [a-zç]+, \d{1,2}h/.test(quando), `${nome}: a data vem primeiro, com a hora`, quando);
      const fn = (await cartoes.first().locator('.vol-pede-fn').innerText()).trim();
      ok(/PROJEÇÃO · (FILMAGEM|CÂMERA 1)/i.test(fn), `${nome}: os dois postos no mesmo cartão`, fn);
      ok(/Primeira vez em (FILMAGEM|CÂMERA 1): chegue 30 minutos antes/.test(await cartoes.first().innerText()),
        `${nome}: a primeira vez diz em qual posto`);
      ok((await p.locator('#confirmar h1').innerText()).trim() === 'Confirme se você vai', `${nome}: o título conta dias, não postos`);
      ok(!(await p.locator('#confirmar .vol-pede-depois').count()), `${nome}: uma frase só antes dos botões`);
      b.atraso = 1500;
      await cartoes.first().getByRole('button', { name: /^Eu vou/ }).click();
      await esperar(250);
      ok(await p.locator('#confirmar .vol-pede').count() === 0, `${nome}: o cartão sai no toque, antes de o banco responder`);
      const pedidos = so(b, 'eu_responder');
      ok(pedidos.length === 2 && pedidos.every(x => x.corpo.p_status === 'confirmado')
        && new Set(pedidos.map(x => x.corpo.p_funcao_id)).size === 2 && pedidos.every(x => !!x.corpo.p_funcao_id),
        `${nome}: uma gravação por posto do cartão, com o posto`, JSON.stringify(pedidos.map(x => x.corpo)));
      await esperar(1700);
      ok(/Confirmado\. Obrigado!/i.test(await barra(p)), `${nome}: e a barra agradece quando o banco grava`, await barra(p));
      const esc = linhaEscalada(p);
      ok(await esc.getByRole('button', { name: 'Posso', exact: true }).getAttribute('aria-pressed') === 'true',
        `${nome}: a grade mostra o mesmo dia como "posso"`);
      await p.close();
    }

    /* 2 · "Não posso" perto do dia, e quem pode cobrir */
    {
      const { p, b } = await abrir(c, '1');
      await p.locator('#confirmar .vol-pede').first().getByRole('button', { name: /^Não posso/ }).click();
      await esperar(900);
      const pedidos = so(b, 'eu_responder');
      ok(pedidos.length === 2 && pedidos.every(x => x.corpo.p_status === 'recusado'), `${nome}: "Não posso" recusa os postos do cartão`,
        JSON.stringify(pedidos.map(x => x.corpo)));
      ok(/Registrado\./i.test(await barra(p)), `${nome}: a barra diz que registrou, sem prometer aviso ao líder`, await barra(p));
      ok(so(b, 'eu_quem_cobre').length === 1, `${nome}: em cima da hora, pergunta quem pode cobrir, uma vez`, JSON.stringify(b.pedidos.map(x => x.rpc)));
      ok(await p.getByText('Quem pode te cobrir').count() === 1, `${nome}: e mostra a lista`);
      const esc = linhaEscalada(p);
      ok(await esc.getByRole('button', { name: 'Não posso', exact: true }).getAttribute('aria-pressed') === 'true',
        `${nome}: a grade mostra o dia como "não posso"`);
      await p.close();
    }

    /* 3 · o banco recusa: o cartão volta */
    {
      const { p, b } = await abrir(c, '1');
      b.recusar.add('eu_responder');
      await p.locator('#confirmar .vol-pede').first().getByRole('button', { name: /^Eu vou/ }).click();
      await esperar(900);
      ok(await p.locator('#confirmar .vol-pede').count() === 1, `${nome}: o banco recusou, o cartão volta`);
      ok(await p.locator('.vol-flash.vol-flash-ruim').count() === 1 && !/Confirmado/i.test(await barra(p)),
        `${nome}: e a barra é a de erro, sem "Confirmado"`, await barra(p));
      await p.close();
    }

    /* 4 · a grade no dia escalado responde a escala */
    {
      const { p, b } = await abrir(c, '1');
      const esc = linhaEscalada(p);
      ok(/^na escala · PROJEÇÃO · (FILMAGEM|CÂMERA 1)$/.test((await esc.locator('.vol-dia-sub').innerText()).trim()),
        `${nome}: o dia escalado diz os postos numa linha quieta`, JSON.stringify(await esc.locator('.vol-dia-sub').innerText()));
      /* a linha dos postos mora embaixo da data E das respostas, na largura
         toda: a 360px, ao lado dos botões, ela quebrava em três linhas */
      const linhas = await esc.locator('.vol-dia-sub').evaluate(e => {
        const r = document.createRange(); r.selectNodeContents(e);
        return new Set([...r.getClientRects()].map(x => Math.round(x.top))).size;
      });
      ok(linhas === 1, `${nome}: os postos do dia cabem numa linha`, String(linhas));
      const pos = await esc.evaluate(e => {
        const sub = e.querySelector('.vol-dia-sub').getBoundingClientRect();
        const seg = e.querySelector('.vol-seg').getBoundingClientRect();
        return { subTopo: Math.round(sub.top), segBase: Math.round(seg.bottom) };
      });
      ok(pos.subTopo >= pos.segBase, `${nome}: e fica embaixo das respostas, não ao lado`, JSON.stringify(pos));
      ok(await esc.evaluate(e => e.classList.contains('falta')), `${nome}: e conta como "falta responder"`);
      const faltaAntes = (await p.locator('#quando-posso .vol-secao-nota').innerText()).trim();
      b.atraso = 1200;
      await esc.getByRole('button', { name: 'Posso', exact: true }).click();
      await esperar(200);
      ok(await esc.getByRole('button', { name: 'Posso', exact: true }).getAttribute('aria-pressed') === 'true',
        `${nome}: "Posso" fica verde no toque`);
      ok(await p.locator('#confirmar .vol-pede').count() === 0, `${nome}: e o cartão de cima sai junto (é o mesmo dia)`);
      await esperar(1400);
      ok(so(b, 'eu_disponibilidade').length === 0 && so(b, 'eu_responder').length === 2
        && so(b, 'eu_responder').every(x => x.corpo.p_status === 'confirmado'),
        `${nome}: no dia escalado, "Posso" confirma os postos (eu_responder), não só a disponibilidade`,
        JSON.stringify(b.pedidos.map(x => x.rpc)));
      const faltaDepois = (await p.locator('#quando-posso .vol-secao-nota').innerText()).trim();
      ok(faltaAntes !== faltaDepois, `${nome}: a contagem do cabeçalho anda`, `${faltaAntes} -> ${faltaDepois}`);
      await p.close();
    }

    /* 5 · o dia sem escala: disponibilidade, na hora, e volta se recusar */
    {
      const { p, b } = await abrir(c, '1');
      const solto = p.locator('#quando-posso .vol-dia.falta:not(:has(.vol-dia-sub))').first();
      const rot = (await solto.locator('.vol-dia-rot').innerText()).trim();
      b.atraso = 1200;
      await solto.getByRole('button', { name: 'Não posso', exact: true }).click();
      await esperar(200);
      const mesma = p.locator('#quando-posso .vol-dia', { has: p.locator('.vol-dia-rot', { hasText: rot }) }).first();
      ok(await mesma.getByRole('button', { name: 'Não posso', exact: true }).getAttribute('aria-pressed') === 'true',
        `${nome}: "Não posso" fica vermelho no toque (${rot})`);
      await esperar(1300);
      const d = so(b, 'eu_disponibilidade');
      ok(d.length === 1 && d[0].corpo.p_resposta === 'nao', `${nome}: grava a disponibilidade do dia`, JSON.stringify(d));
      ok(!(await mesma.evaluate(e => e.classList.contains('falta'))), `${nome}: e o dia deixa de faltar`);
      b.atraso = 0; b.recusar.add('eu_disponibilidade');
      const outro = p.locator('#quando-posso .vol-dia.falta:not(:has(.vol-dia-sub))').first();
      const rot2 = (await outro.locator('.vol-dia-rot').innerText()).trim();
      await outro.getByRole('button', { name: 'Posso', exact: true }).click();
      await esperar(700);
      const mesma2 = p.locator('#quando-posso .vol-dia', { has: p.locator('.vol-dia-rot', { hasText: rot2 }) }).first();
      ok(await mesma2.getByRole('button', { name: 'Posso', exact: true }).getAttribute('aria-pressed') === 'false'
        && await mesma2.evaluate(e => e.classList.contains('falta')), `${nome}: o banco recusou, o dia volta a faltar`);
      ok(await p.locator('.vol-flash.vol-flash-ruim').count() === 1, `${nome}: e a barra diz`);
      await p.close();
    }

    /* 6 · "Posso no mês" */
    {
      const { p, b } = await abrir(c, '1');
      const mes = p.locator('#quando-posso .vol-mes').first();
      const soltos = await mes.locator('.vol-dia.falta').evaluateAll(ls => ls.filter(l => !/^na escala/.test(l.querySelector('.vol-dia-sub')?.textContent || '')).length);
      await mes.getByRole('button', { name: 'Posso no mês' }).click();
      await esperar(900);
      ok(so(b, 'eu_disponibilidade').length === soltos && so(b, 'eu_disponibilidade').every(x => x.corpo.p_resposta === 'posso'),
        `${nome}: "Posso no mês" grava os ${soltos} dias soltos`, JSON.stringify(so(b, 'eu_disponibilidade').map(x => x.corpo.p_data)));
      ok(so(b, 'eu_responder').length === 2 && so(b, 'eu_responder').every(x => x.corpo.p_status === 'confirmado'),
        `${nome}: e confirma os postos que esperavam no mês`);
      /* o mês respondido fica quieto: sem botão e sem nota (o "tudo
         respondido" do cabeçalho da seção basta) */
      ok(await mes.locator('.vol-dia.falta').count() === 0 && !(await mes.locator('.vol-mes-cab button').count())
        && (await mes.locator('.vol-mes-cab').innerText()).trim() === (await mes.locator('.vol-mes-nome').innerText()).trim(),
        `${nome}: o mês fica todo respondido, e o cabeçalho fica só com o nome`, await mes.locator('.vol-mes-cab').innerText());
      await p.close();
    }

    /* 7 · a próxima escala com os postos do culto, e "Depois disso" sem repetir */
    {
      const { p } = await abrir(c, 'confirmado');
      const fn = (await p.locator('.vol-prox-fn').innerText()).trim();
      ok(/PROJEÇÃO · (FILMAGEM|CÂMERA 1)/.test(fn), `${nome}: o cartão da próxima escala tem os dois postos`, fn);
      const quando = (await p.locator('.vol-prox-dia').innerText()).trim();
      const depois = await p.locator('.vol-linha-dia').allInnerTexts();
      ok(!depois.some(t => quando.startsWith(t.trim())), `${nome}: "Depois disso" não repete o culto do cartão`, JSON.stringify(depois));
      const bt = p.locator('.ingresso-acoes button', { hasText: 'Não vou mais poder' });
      const caixa = await bt.evaluate(e => { const s = getComputedStyle(e); return { topo: s.borderTopWidth, esq: s.borderLeftWidth }; });
      ok(caixa.topo === '0px' && caixa.esq === '0px', `${nome}: "Não vou mais poder" tem o traje do calendário, sem caixa`, JSON.stringify(caixa));
      const sub = (await p.locator('#confirmar .vol-sub').allInnerTexts()).join(' ');
      ok(!/próxima vez/i.test(sub), `${nome}: sem a frase que repetia a data do cartão`, sub);
      /* "Tudo certo por aqui" em cima de "Faltam 8 dias" foi achado da
         auditoria de 02/10: com dias em branco, o título é o que falta */
      const titulo = (await p.locator('#confirmar h1').innerText()).trim();
      ok(titulo === 'Diga quando você pode', `${nome}: com dias em branco, o título diz o que fazer (não "Tudo certo")`, titulo);
      ok(/^\d+ dias sem resposta\.$/.test(sub.trim()), `${nome}: e a frase conta os dias em branco`, sub);
      ok(await p.locator('#confirmar a[href="#quando-posso"]').count() === 1, `${nome}: e leva até a grade`);
      ok((await p.locator('#confirmar .rot').innerText()).trim().toLowerCase() === 'olá, giovana', `${nome}: a saudação usa o primeiro nome`);
      const est = (await p.locator('.vol-prox-est').innerText()).trim();
      ok(/^Presença confirmada\./.test(est), `${nome}: "Presença confirmada", sem gênero`, est);
      await p.close();
    }

    /* 7b · tudo respondido: aí sim "Tudo certo", sem frase e sem botão */
    {
      const { p } = await abrir(c, 'tudo');
      const titulo = (await p.locator('#confirmar h1').innerText()).trim();
      ok(titulo === 'Tudo certo por aqui', `${nome}: tudo respondido, "Tudo certo por aqui"`, titulo);
      ok(!(await p.locator('#confirmar .vol-sub').count()) && !(await p.locator('#confirmar a[href="#quando-posso"]').count()),
        `${nome}: sem frase e sem botão para a grade`);
      ok((await p.locator('#quando-posso .vol-secao-nota').innerText()).trim() === 'tudo respondido', `${nome}: a seção diz "tudo respondido"`);
      const cabs = await p.locator('#quando-posso .vol-mes-cab').evaluateAll(cs => cs.map(c => c.innerText.trim()));
      ok(cabs.length >= 1 && cabs.every(t => !/respondido|falta/.test(t)), `${nome}: uma vez só: os meses ficam quietos`, JSON.stringify(cabs));
      /* o primeiro mês não encosta no fio da seção */
      const vao = await p.evaluate(() => {
        const cab = document.querySelector('#quando-posso .vol-secao-cab').getBoundingClientRect();
        const mes = document.querySelector('#quando-posso .vol-mes').getBoundingClientRect();
        return Math.round(mes.top - cab.bottom);
      });
      ok(vao >= 20, `${nome}: o primeiro mês tem respiro embaixo do cabeçalho da seção`, `${vao}px`);
      await p.close();
    }

    /* 7c · recém-chegado: boas-vindas sem gênero */
    {
      const { p } = await abrir(c, 'novo');
      ok((await p.locator('#confirmar .rot').innerText()).trim().toLowerCase() === 'boas-vindas', `${nome}: "Boas-vindas", e não "Bem-vindo"`);
      await p.close();
    }

    /* 7d · "Depois disso": as ações numa linha própria, lado a lado */
    {
      const { p } = await abrir(c, 'troca');
      const pares = await p.evaluate(() => [...document.querySelectorAll('.vol-linha-acoes')]
        .map(a => [...a.querySelectorAll('.vol-acao')].map(b => ({ t: b.textContent.trim(), topo: Math.round(b.getBoundingClientRect().top), h: Math.round(b.getBoundingClientRect().height) }))));
      ok(pares.length >= 2 && pares.some(x => x.length === 2), `${nome}: a troca tem as duas ações na linha`, JSON.stringify(pares));
      ok(pares.every(x => new Set(x.map(b => b.topo)).size === 1), `${nome}: "Não vou mais poder" e "Pedir troca" lado a lado`, JSON.stringify(pares));
      ok(pares.flat().every(b => b.h <= 50), `${nome}: e nenhuma quebra em duas linhas`, JSON.stringify(pares));
      const rot = await p.evaluate(() => [...document.querySelectorAll('.vol-eq-rot')].map(e => {
        const r = document.createRange(); r.selectNodeContents(e);
        return { t: e.textContent, linhas: new Set([...r.getClientRects()].map(x => Math.round(x.top))).size };
      }).filter(x => x.linhas > 1));
      ok(!rot.length, `${nome}: os rótulos de "Você na GUIA" numa linha só`, JSON.stringify(rot));
      await p.close();
    }

    /* 7e · o líder do dia: "Marcar chegada" numa linha e dentro da tela */
    {
      const { p } = await abrir(c, 'hoje-lider');
      const acoes = await p.evaluate(() => [...document.querySelectorAll('.vol-linha > .vol-acao')].map(b => {
        const r = b.getBoundingClientRect(); const linha = b.closest('.vol-linha').getBoundingClientRect();
        return { t: b.textContent.trim(), h: Math.round(r.height), sobra: b.scrollWidth - b.clientWidth, fora: Math.round(r.right - linha.right) };
      }));
      ok(acoes.length >= 2 && acoes.every(a => a.h <= 50 && a.sobra <= 1 && a.fora <= 1),
        `${nome}: as ações do time numa linha, sem passar da borda`, JSON.stringify(acoes));
      ok(await p.locator('.relatorio .postos-falta').count() === 0, `${nome}: o relatório vazio não abre com aviso vermelho`);
      await p.close();
    }

    /* 8 · medida: rolagem de lado, alvos e a régua da grade */
    {
      const { p } = await abrir(c, '1');
      ok(await p.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1), `${nome}: a página não rola de lado`);
      const pequenos = await p.evaluate(() => [...document.querySelectorAll('#confirmar button, #quando-posso button, .ingresso-acoes button, .ingresso-acoes a')]
        .filter(e => e.checkVisibility()).map(e => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height) }; })
        .filter(x => x.h < 44 || x.w < 44));
      ok(!pequenos.length, `${nome}: todo alvo de toque tem 44px`, JSON.stringify(pequenos));
      /* onde a LETRA começa, e não a caixa: o ponto de "falta" é um ::before,
         e dentro do fluxo ele empurra o texto sem mexer na caixa */
      const reguas = await p.evaluate(() => [...new Set([...document.querySelectorAll('#quando-posso .vol-dia-rot')].map(e => {
        const t = [...e.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
        const r = document.createRange(); r.selectNodeContents(t || e);
        return Math.round((r.getClientRects()[0] || e.getBoundingClientRect()).left);
      }))]);
      ok(reguas.length === 1, `${nome}: as datas da grade começam na mesma régua`, JSON.stringify(reguas));
      const seg = await p.evaluate(() => [...document.querySelectorAll('#quando-posso .vol-seg')].map(e => Math.round(e.getBoundingClientRect().right)));
      ok(new Set(seg).size === 1, `${nome}: e as respostas terminam na mesma borda`, JSON.stringify([...new Set(seg)]));
      const cortado = await p.evaluate(() => [...document.querySelectorAll('#confirmar *, #quando-posso *')]
        .filter(e => e.children.length === 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').map(e => e.textContent.slice(0, 30)));
      ok(!cortado.length, `${nome}: nenhum texto cortado`, JSON.stringify(cortado));
      await p.close();
    }
    await c.close();
  }
} catch (e) {
  falhas++; console.log('  FALHOU (exceção)', e?.message || e);
} finally {
  await nav.close();
}
console.log(`voluntario-celular: ${feitas - falhas}/${feitas} ${falhas ? 'FALHOU' : 'ok'}`);
process.exit(falhas ? 1 : 0);
