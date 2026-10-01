/* A TROCA, A FUNÇÃO NOVA E A AGENDA NA TELA DO VOLUNTÁRIO — 103, 01/10/2026.

   No harness (/eu/x?demo=troca), com o banco respondendo pela rota. O que a
   prova exige:
     1. sem a 103 no banco (demo=1), a tela é a de antes: nenhuma seção de
        troca, nenhum "Pedir troca", nenhum "Acrescentar função";
     2. pedido recebido: aceitar avisa que a vaga é sua; o pedido num dia em
        que a pessoa disse que não pode oferece "Posso nesse dia" e não
        "Fico com a vaga"; a recusa do banco (MUDOU) vira frase, não "erro";
     3. pedir troca: o painel abre com a lista sem telefone, pedir marca
        "pedido enviado" e dá o WhatsApp SEM número, com o link da porta;
        a recusa do banco (JA_ESCALADO) diz o motivo pelo primeiro nome;
     4. desistir do pedido; acrescentar e tirar função;
     5. a agenda: o evento da quarta aparece na grade com o nome e a hora, e
        o dia em que a pessoa serve tem a etiqueta;
     6. no celular, nada rola de lado.

   Roda com BASE=http://127.0.0.1:3500 node scripts/troca-tela.test.mjs */
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const esperar = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0, feitas = 0;
const ok = (c, nome, extra = '') => { feitas++; if (!c) falhas++; console.log(`  ${c ? 'ok ' : 'FALHOU'} ${nome}${!c && extra ? '\n      ' + extra : ''}`); };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const responde = (corpo) => (r) => r.request().method() === 'OPTIONS'
  ? r.fulfill({ status: 204, headers: CORS })
  : r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(typeof corpo === 'function' ? corpo(r) : corpo) });
const nav = await chromium.launch({ executablePath: chromeDoContainer() });

async function abrir(c, demo, rotas = {}) {
  const p = await c.newPage();
  for (const [rpc, corpo] of Object.entries(rotas)) await p.route(`**/rest/v1/rpc/${rpc}`, responde(corpo));
  await p.goto(`${BASE}/eu/x?demo=${demo}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.vol', { timeout: 30000 }); await esperar(1800);
  await p.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  return p;
}
const barra = async p => (await p.locator('.vol-flash').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');

const CANDIDATOS = [
  { voluntario_id: 'v1', nome: 'Larissa Moura', nivel: 'titular', disse_que_pode: true, ja_pedi: false },
  { voluntario_id: 'v2', nome: 'Pedro Henrique Alves', nivel: 'titular', disse_que_pode: false, ja_pedi: false },
  { voluntario_id: 'v3', nome: 'Ana Clara', nivel: 'reserva', disse_que_pode: false, ja_pedi: false },
];
const FUNCOES = [
  { funcao_id: 'f1', nome: 'PROJEÇÃO', ordem: 1, descricao: null, nivel: 'titular', confirmado: true, pode_pedir: false, exige_sexo: null, sem_niveis: false },
  { funcao_id: 'f5', nome: 'EDIÇÃO', ordem: 5, descricao: null, nivel: 'reserva', confirmado: false, pode_pedir: false, exige_sexo: null, sem_niveis: false },
  { funcao_id: 'f6', nome: 'CÂMERA 2', ordem: 6, descricao: 'Câmera da lateral.', nivel: null, confirmado: null, pode_pedir: true, exige_sexo: null, sem_niveis: false },
];

try {
  for (const [w, h, toque, nome] of [[390, 844, true, '390'], [1440, 900, false, '1440']]) {
    const c = await nav.newContext({ viewport: { width: w, height: h }, isMobile: toque, hasTouch: toque, deviceScaleFactor: 1 });
    await c.route('**', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());

    /* 1 · sem a 103: a tela de antes */
    {
      const p = await abrir(c, '1');
      ok(!(await p.locator('#trocas').count()), `${nome}: sem a 103, nenhuma seção de troca`);
      ok(!(await p.getByRole('button', { name: 'Pedir troca' }).count()), `${nome}: sem a 103, nenhum "Pedir troca"`);
      ok(!(await p.getByRole('button', { name: 'Acrescentar função' }).count()), `${nome}: sem a 103, nenhum "Acrescentar função"`);
      await p.close();
    }

    /* 2 · pedido recebido */
    {
      let aceite = { ok: true, status: 'aceita' };
      const p = await abrir(c, 'troca', { eu_troca_responder: () => aceite });
      const cartoes = p.locator('.vol-troca');
      ok(await cartoes.count() === 2, `${nome}: dois pedidos recebidos`, String(await cartoes.count()));
      const foto = cartoes.filter({ hasText: 'FOTO' });
      ok(await foto.getByText('Você marcou que não pode nesse dia.').count() === 1, `${nome}: o pedido no dia "não posso" diz o porquê`);
      ok(await foto.getByRole('button', { name: 'Posso nesse dia' }).count() === 1
        && !(await foto.getByRole('button', { name: 'Fico com a vaga' }).count()),
        `${nome}: e oferece "Posso nesse dia" no lugar de "Fico com a vaga"`);
      const edicao = cartoes.filter({ hasText: 'EDIÇÃO' });
      await edicao.getByRole('button', { name: 'Fico com a vaga' }).click(); await esperar(600);
      ok(/Pronto\. A vaga de EDIÇÃO é sua, já confirmada\./i.test(await barra(p)), `${nome}: aceitar avisa que a vaga é sua`, await barra(p));
      aceite = { ok: false, erro: 'MUDOU' };
      await edicao.getByRole('button', { name: 'Fico com a vaga' }).click(); await esperar(600);
      ok(/mudou de mão antes do seu aceite/i.test(await barra(p)) && !/erro/i.test(await barra(p)),
        `${nome}: a recusa do banco vira frase`, await barra(p));
      await p.close();
    }

    /* 3 · pedir troca */
    {
      const p = await abrir(c, 'troca', {
        eu_troca_candidatos: CANDIDATOS,
        eu_troca_pedir: (r) => {
          const corpo = JSON.parse(r.request().postData() || '{}');
          return corpo.p_para === 'v3' ? { ok: false, erro: 'NAO_PODE', motivo: 'JA_ESCALADO' } : { ok: true, id: 'novo' };
        },
      });
      const bts = p.getByRole('button', { name: 'Pedir troca' });
      ok(await bts.count() >= 2, `${nome}: "Pedir troca" nas vagas da pessoa`, String(await bts.count()));
      await bts.first().click(); await esperar(900);
      const painel = p.locator('#pedir-troca');
      ok(await painel.count() === 1, `${nome}: o painel de pedir abre`);
      const texto = (await painel.innerText()).replace(/\s+/g, ' ');
      ok(texto.includes('Larissa Moura') && texto.includes('disse que pode nesse dia'.toUpperCase()) || texto.includes('DISSE QUE PODE NESSE DIA') || texto.toLowerCase().includes('disse que pode nesse dia'),
        `${nome}: a lista diz quem disse que pode`, texto.slice(0, 200));
      ok(!/\(?\d{2}\)?\s?\d{4,5}-?\d{4}/.test(texto), `${nome}: a lista não mostra telefone`);
      const topo = await painel.evaluate(el => el.getBoundingClientRect().top);
      ok(topo >= 0 && topo < h * 0.6, `${nome}: a tela vai até o painel`, `topo ${Math.round(topo)}`);
      await painel.locator('.vol-linha', { hasText: 'Pedro Henrique Alves' }).getByRole('button', { name: 'Pedir' }).click(); await esperar(700);
      const linhaPedro = painel.locator('.vol-linha', { hasText: 'Pedro Henrique Alves' });
      ok(await linhaPedro.getByText('pedido enviado').count() === 1, `${nome}: pedir marca "pedido enviado"`);
      const zap = await linhaPedro.locator('a').first().getAttribute('href');
      const recado = zap ? decodeURIComponent(zap.replace('https://wa.me/?text=', '')) : '';
      ok(!!zap && zap.startsWith('https://wa.me/?text=') && recado.startsWith('Oi, Pedro!') && /\/confirmar\/midia$/.test(recado),
        `${nome}: o WhatsApp vai sem número, com o primeiro nome e o link da porta`, recado);
      await painel.locator('.vol-linha', { hasText: 'Ana Clara' }).getByRole('button', { name: 'Pedir' }).click(); await esperar(600);
      ok(/Ana já está na escala desse dia\./i.test(await barra(p)), `${nome}: a recusa diz o motivo pelo primeiro nome`, await barra(p));
      await p.close();
    }

    /* 4 · desistir; acrescentar e tirar função */
    {
      const p = await abrir(c, 'troca', {
        eu_troca_cancelar: { ok: true },
        eu_funcoes: FUNCOES,
        eu_funcao_adicionar: { ok: true, nivel: 'titular' },
        eu_funcao_retirar: { ok: true },
      });
      await p.getByRole('button', { name: 'Desistir' }).first().click(); await esperar(600);
      ok(/Pedido desfeito\./i.test(await barra(p)), `${nome}: desistir desfaz o pedido`, await barra(p));
      ok(/EDIÇÃO \(a conferir\)/.test(await p.locator('#meu-perfil').innerText()), `${nome}: "Você faz" marca a função a conferir`);
      await p.getByRole('button', { name: 'Acrescentar função' }).click(); await esperar(700);
      await p.getByRole('button', { name: /CÂMERA 2/ }).click(); await esperar(200);
      const add = p.getByRole('button', { name: 'Acrescentar CÂMERA 2' });
      ok(await add.isDisabled(), `${nome}: sem escolher o nível, não acrescenta`);
      await p.getByRole('button', { name: 'Faço sozinho' }).click(); await esperar(200);
      await add.click(); await esperar(700);
      ok(/CÂMERA 2 entrou na sua lista, a conferir\./i.test(await barra(p))
        && /Arthur confere; até lá, você só entra nela quando faltar alguém/.test(await p.locator('.vol-func').innerText()),
        `${nome}: acrescentar diz que entra a conferir e o que isso muda`, await barra(p));
      await p.locator('.vol-func .vol-linha', { hasText: 'EDIÇÃO' }).getByRole('button', { name: 'Tirar' }).click(); await esperar(600);
      ok(/EDIÇÃO saiu da sua lista\./i.test(await barra(p)), `${nome}: tirar a função a conferir`, await barra(p));
      await p.close();
    }

    /* 5 · a agenda e 6 · o celular */
    {
      const p = await abrir(c, 'troca');
      const grade = (await p.locator('#quando-posso').innerText()).replace(/\s+/g, ' ');
      ok(/qua \d{2} · Ensaio Geral, 19h30/.test(grade), `${nome}: o evento da quarta entra na grade com nome e hora`, grade.slice(0, 300));
      ok(/Ensaio Geral, 19h30\s*na escala/i.test(grade), `${nome}: o dia em que ela serve tem a etiqueta`);
      ok(await p.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1), `${nome}: sem rolagem de lado`);
      await p.close();
    }
    await c.close();
  }
} catch (e) {
  falhas++; console.log('  FALHOU (exceção)', e?.message || e);
} finally {
  await nav.close();
}
console.log(`troca-tela: ${feitas - falhas}/${feitas} ${falhas ? 'FALHOU' : 'ok'}`);
process.exit(falhas ? 1 : 0);
