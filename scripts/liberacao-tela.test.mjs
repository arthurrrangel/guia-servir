/* QUEM ESPERA LIBERAÇÃO APARECE — 01/10/2026 (migração 102).

   O Elias se cadastrou no Louvor em 04/09 pela lista da equipe. O Louvor pede
   aprovação, alguém conferiu o nível e ninguém tocou em Liberar. Um mês
   depois: fora da lista, nenhum selo, nenhuma linha no Painel, a tela do Time
   dizendo "pausado", e o cadastro mandando procurar o nome na lista.

   O que esta prova exige, no harness:
     1. Time: quem nunca foi liberado fica num grupo "Esperando liberação" no
        alto, com "Liberar" e a frase do que isso custa; pausado de verdade
        continua "pausado", com "Reativar". Sem a coluna (banco antes da 102),
        vale o sinal antigo.
     2. Painel: a linha "se cadastrou e espera você liberar", indo ao Time, e
        o selo de Entradas somando essas pessoas.
     3. Entradas: o título conta, e a seção lista quem espera, indo ao Time.
     4. As duas portas: NAO_LIBERADO vira a frase certa, não o beco.

   Roda com BASE=http://127.0.0.1:3500 node scripts/liberacao-tela.test.mjs */
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:3500';
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

/* troca um estado do Shell por fora, como uma recarga faria (técnica do
   ajustes-segue-o-salvo): acha o useState pelo formato e despacha */
const despachar = (p, qual, mudar) => p.evaluate(([qual, mudar]) => {
  const el = document.querySelector('.es-casca');
  const fk = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
  for (let f = el[fk]; f; f = f.return) {
    for (let h = f.memoizedState; h; h = h.next) {
      const v = h.memoizedState;
      if (!v || typeof v !== 'object' || !h.queue?.dispatch) continue;
      if (qual === 'S' && Array.isArray(v.voluntarios) && v.config) {
        h.queue.dispatch({ ...v, voluntarios: [...v.voluntarios, ...mudar] }); return true;
      }
      if (qual === 'nums' && 'candidaturas_novas' in v && 'sem_conferir' in v) {
        h.queue.dispatch({ ...v, ...mudar }); return true;
      }
    }
  }
  return false;
}, [qual, mudar]);

const pessoa = (id, nome, extra) => ({
  id, nome, tel: '', ativo: false, limiteMes: null, token: 't' + id,
  funcoes: { 'FOTO': 'titular' }, confirmadas: { 'FOTO': true }, indisponivel: [], disponivel: [],
  conferido: true, ...extra,
});
const GENTE = [
  /* o caso do Elias: nível conferido, nunca liberado */
  pessoa('x1', 'Otávio Mendes Prova', { liberadoEm: null }),
  /* pausado de verdade: já foi liberado um dia */
  pessoa('x2', 'Renata Lopes Prova', { liberadoEm: '2026-09-01T12:00:00Z' }),
  /* banco sem a 102 (sem a coluna): vale o sinal antigo */
  pessoa('x3', 'Caio Antunes Prova', { conferido: false }),
  pessoa('x4', 'Bia Fontes Prova', {}),
];

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const rpc = (p, nome, corpo) => p.route(`**/rest/v1/rpc/${nome}`, r => {
  if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
  return r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
});

try {
  /* 1 · Time */
  for (const [w, h, toque, nome] of [[1440, 900, false, '1440'], [390, 844, true, '390']]) {
    const c = await ctx(w, h, toque); const p = await c.newPage();
    await p.goto(`${BASE}/time?demo=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.es-casca', { timeout: 30000 }); await esperar(2500);
    ok(await despachar(p, 'S', GENTE), `${nome}: achou o estado do Shell`);
    await esperar(700);
    const sec = p.locator('section#liberar');
    ok(await sec.count() === 1, `${nome}: há o grupo "Esperando liberação"`);
    const nomesNoGrupo = await sec.locator('.es-tm-nome b').allInnerTexts();
    ok(nomesNoGrupo.length === 2 && nomesNoGrupo.includes('Otávio Mendes Prova') && nomesNoGrupo.includes('Caio Antunes Prova'),
      `${nome}: no grupo, quem nunca foi liberado (com a coluna e pelo sinal antigo)`, nomesNoGrupo.join(', '));
    const secTop = await sec.evaluate(e => e.getBoundingClientRect().top + scrollY);
    const outros = await p.locator('section.es-secao h2').evaluateAll(hs => hs
      .filter(x => /Esperando sua conferência|Time conferido/.test(x.textContent))
      .map(x => x.getBoundingClientRect().top + scrollY));
    ok(outros.every(t => t > secTop), `${nome}: e ele vem antes dos outros grupos`);
    ok(await sec.locator('.es-pilula, [class*=pilula]').filter({ hasText: 'aguardando' }).count() === 0,
      `${nome}: no grupo, sem a pílula "aguardando" repetindo o título`);

    /* abrir quem espera: Liberar e o que custa esperar */
    await sec.locator('button.es-tm-linha', { hasText: 'Otávio Mendes Prova' }).click(); await esperar(400);
    const aberta = sec.locator('.es-tm-aberta').first();
    ok(await aberta.getByRole('button', { name: 'Liberar' }).count() === 1, `${nome}: aberto, o botão é Liberar`);
    ok(/Ainda não aparece na lista da equipe/.test(await aberta.innerText()), `${nome}: e diz o que a espera custa`);
    ok(await aberta.getByRole('button', { name: 'Reativar' }).count() === 0, `${nome}: e não diz Reativar`);

    /* pausado de verdade */
    const linhaRenata = p.locator('button.es-tm-linha', { hasText: 'Renata Lopes Prova' });
    ok(/pausado/.test(await linhaRenata.innerText()), `${nome}: quem já foi liberado continua "pausado"`, await linhaRenata.innerText());
    ok(await sec.locator('button.es-tm-linha', { hasText: 'Renata Lopes Prova' }).count() === 0, `${nome}: e fora do grupo de liberar`);
    await linhaRenata.click(); await esperar(400);
    const abertaR = p.locator('.es-tm-aberta', { has: p.getByRole('button', { name: 'Reativar' }) });
    ok(await abertaR.count() >= 1, `${nome}: aberto, o botão é Reativar`);
    const linhaBia = p.locator('button.es-tm-linha', { hasText: 'Bia Fontes Prova' });
    ok(/pausado/.test(await linhaBia.innerText()), `${nome}: sem a coluna, inativo conferido continua "pausado" (sinal antigo)`);
    ok(await semRolagemDeLado(p), `${nome}: sem rolagem de lado`);
    await c.close();
  }

  /* 2 · Painel: a linha e o selo */
  {
    const c = await ctx(1440, 900, false); const p = await c.newPage();
    await p.goto(`${BASE}/painel?demo=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.es-casca', { timeout: 30000 }); await esperar(2500);
    const selo = async () => {
      const l = p.locator('a[href="/painel/candidaturas"]').first();
      const t = await l.locator('.es-nav-n, .es-aba-n').first().innerText({ timeout: 1500 }).catch(() => '0');
      return parseInt(t, 10) || 0;
    };
    const antes = await selo();
    ok(await despachar(p, 'nums', { esperando_liberacao: 2 }), 'painel: achou os números do Shell');
    await esperar(600);
    const linha = p.locator('a[href="/time#liberar"]');
    ok(await linha.count() === 1 && /2\s*pessoas se cadastraram e esperam você liberar/.test(await linha.innerText()),
      'painel: a linha diz quantos esperam e vai ao Time', await linha.count() ? await linha.innerText() : 'sem linha');
    const depois = await selo();
    ok(depois === antes + 2, 'painel: o selo de Entradas soma quem espera liberação', `${antes} -> ${depois}`);
    await c.close();
  }

  /* 3 · Entradas */
  {
    const c = await ctx(390, 844, true); const p = await c.newPage();
    await p.goto(`${BASE}/painel/candidaturas?demo=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.es-casca', { timeout: 30000 }); await esperar(2500);
    const tituloAntes = await p.locator('h1').first().innerText();
    const nAntes = parseInt((tituloAntes.match(/\d+/) || ['0'])[0], 10);
    ok(await despachar(p, 'S', [GENTE[0]]), 'entradas: achou o estado do Shell');
    await esperar(700);
    const tituloDepois = await p.locator('h1').first().innerText();
    const nDepois = parseInt((tituloDepois.match(/\d+/) || ['0'])[0], 10);
    ok(nDepois === nAntes + 1, 'entradas: o título conta quem espera liberação', `${tituloAntes} -> ${tituloDepois}`);
    const item = p.locator('a[href="/time#liberar"]', { hasText: 'Otávio Mendes Prova' });
    ok(await item.count() === 1, 'entradas: a pessoa aparece, indo ao Time');
    ok(await semRolagemDeLado(p), 'entradas: sem rolagem de lado no celular');
    await c.close();
  }

  /* 4 · a porta do cadastro (/servir/<área>/cadastro) */
  {
    const c = await ctx(390, 844, true); const p = await c.newPage();
    await rpc(p, 'ministerios_publicos', [{ slug: 'louvor', nome: 'Louvor', convite: null, aberto: true, artigo: 'o' }]);
    await rpc(p, 'equipe_funcoes', [{ nome: 'CONTRABAIXO', descricao: null, descricao_familia: null, tipos: ['domingo'] }]);
    await rpc(p, 'perguntas_publicas', []);
    await rpc(p, 'candidatar', { ok: false, erro: 'NAO_LIBERADO' });
    await p.goto(`${BASE}/servir/louvor/cadastro`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#w-nome', { timeout: 30000 });
    await p.fill('#w-nome', 'Pessoa de Prova'); await p.fill('#w-tel', '21900000102'); await p.fill('#w-mail', 'prova@exemplo.com');
    const continuar = p.getByRole('button', { name: /Continuar/ });
    await continuar.click(); await esperar(300);
    await p.locator('button.wiz-op', { hasText: 'CONTRABAIXO' }).click(); await esperar(200);
    await continuar.click(); await esperar(300);
    await continuar.click(); await esperar(300);
    await p.getByRole('button', { name: 'Enviar cadastro' }).click(); await esperar(1200);
    const txt = await p.locator('main').innerText();
    ok(/esperando a liderança liberar/.test(txt) && !/Abra a sua página pela lista/.test(txt),
      'cadastro: NAO_LIBERADO diz que espera a liderança, sem mandar procurar na lista');
    await c.close();
  }

  /* 5 · a porta da lista (/equipe/<área>, "Entrar no time") */
  {
    const c = await ctx(390, 844, true); const p = await c.newPage();
    await rpc(p, 'equipe_publica', [{ equipe: 'Louvor', sem_niveis: false, aviso_cadastro: '' }]);
    await rpc(p, 'equipe_time', []);
    await rpc(p, 'equipe_funcoes', [{ nome: 'CONTRABAIXO', tipos: ['domingo'], descricao: '', descricao_familia: '' }]);
    await rpc(p, 'inscrever', { ok: false, erro: 'NAO_LIBERADO' });
    await p.goto(`${BASE}/equipe/louvor?novo=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#eq-nome', { timeout: 30000 });
    await p.fill('#eq-nome', 'Pessoa de Prova'); await p.fill('#eq-tel', '21900000102'); await p.fill('#eq-email', 'prova@exemplo.com');
    await p.locator('button[aria-pressed]', { hasText: 'CONTRABAIXO' }).first().click(); await esperar(300);
    await p.getByRole('button', { name: 'Entrar no time' }).click(); await esperar(1200);
    const txt = await p.locator('body').innerText();
    ok(/esperando a liderança liberar/.test(txt) && !/Ache seu nome na lista e entre por ele/.test(txt),
      'lista: NAO_LIBERADO diz que espera a liderança, sem mandar achar o nome');
    await c.close();
  }
} catch (e) {
  falhas++; console.log('  FALHOU (exceção)', e?.message || e);
} finally {
  await nav.close();
}
console.log(`liberacao-tela: ${feitas - falhas}/${feitas} ${falhas ? 'FALHOU' : 'ok'}`);
process.exit(falhas ? 1 : 0);
