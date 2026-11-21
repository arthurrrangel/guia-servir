/* A VIRADA 2027, NA TELA — 21/11/2026.

   A regra da reserva está em scripts/virada.test.mjs; esta bateria confere o
   que a pessoa vê em guiachurch.com/virada, no app de desenvolvimento, com a
   internet cortada (as respostas da rota /api/virada são inventadas aqui,
   uma por cena):
     · a primeira tela: a data, o lugar, a promessa e as duas chamadas, sem
       rolar, no computador e no celular; nada vaza para o lado;
     · a programação com as oito horas e a declaração de 2027; as perguntas;
     · o formulário: em branco aponta o nome; com tudo certo e o banco
       gravando, "Lugar reservado"; com o banco fora, "Falta um toque" e o
       WhatsApp com a reserva escrita; com as vagas esgotadas, a página já
       abre na lista de espera;
     · o QR: /v27 leva à página; e guiaservir.com/virada leva ao guiachurch;
     · o painel da administração (/demandas/admin/virada) com reservas de
       mentira: números, lista e a planilha.
   Roda com BASE=http://127.0.0.1:3500 node scripts/virada-tela.test.mjs */
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';
import { mkdirSync } from 'node:fs';
import { request as pedirHttp } from 'node:http';
const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const OUT = process.env.OUT || '/tmp/virada-tela';
mkdirSync(OUT, { recursive: true });
const esperar = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0, feitas = 0;
const ok = (c, nome, extra = '') => { feitas++; if (!c) falhas++; console.log(`  ${c ? 'ok ' : 'FALHOU'} ${nome}${!c && extra ? '\n      ' + extra : ''}`); };
const nav = await chromium.launch({ executablePath: chromeDoContainer() });

/* cada cena responde a rota da reserva do seu jeito; o resto da internet é cortado */
async function ctx(w, h, toque, cena = {}) {
  const c = await nav.newContext({ viewport: { width: w, height: h }, isMobile: toque, hasTouch: toque, deviceScaleFactor: 1 });
  await c.route('**', async r => {
    const u = r.request().url();
    if (u.startsWith(BASE + '/api/virada')) {
      const corpo = r.request().method() === 'GET' ? (cena.get ?? { aberta: true, restantes: null }) : cena.post;
      if (!corpo) return r.continue();
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(corpo) });
    }
    if (u.includes('/rest/v1/rpc/')) {
      const fn = u.split('/rpc/')[1].split('?')[0];
      const corpo = cena.rpc?.[fn];
      return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(corpo ?? []) });
    }
    return u.startsWith(BASE) ? r.continue() : r.abort();
  });
  return c;
}
const preencher = async (p) => {
  const f = p.locator('form.vr-form');
  await f.getByLabel('Nome completo').fill('Maria da Silva');
  await f.getByLabel('CPF').fill('52998224725');
  await f.getByLabel('Telefone para contato').fill('21999990000');
  await f.getByLabel('E-mail').fill('maria@exemplo.com');
  await f.getByText('Sou visitante').click();
  await f.getByLabel('Quantas pessoas, contando você').selectOption('3');
};

try {
  for (const [w, h, toque, nome] of [[1440, 900, false, '1440'], [390, 844, true, '390'], [360, 740, true, '360']]) {
    /* 1 · a primeira tela e a página inteira */
    let c = await ctx(w, h, toque, { post: { ok: true, guardado: true, restantes: 147 } });
    let p = await c.newPage();
    const erros = []; p.on('pageerror', e => erros.push(String(e)));
    await p.goto(`${BASE}/virada`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#t-vr', { timeout: 30000 }); await esperar(2200);
    const h1 = (await p.locator('#t-vr').innerText()).replace(/\s+/g, ' ');
    ok(/Um novo ano para ser transformado pela presença de Deus/.test(h1), `${nome}: o título`, h1);
    const dentro = async (sel) => { const b = await p.locator(sel).first().boundingBox(); return !!b && b.y >= 0 && b.y + b.height <= h; };
    ok(await dentro('.s-heroi .s-chapeu') && await dentro('.s-heroi .s-acoes'), `${nome}: data, título e chamadas na primeira tela`);
    if (!toque || h >= 700) ok(await dentro('.s-heroi .s-micro'), `${nome}: o lugar e as vagas na primeira tela`);
    ok(/31 de dezembro, 19h30/.test(await p.locator('.s-heroi .s-chapeu').innerText()), `${nome}: o chapéu com a data e a hora`);
    const largura = await p.evaluate(() => [document.scrollingElement.scrollWidth, innerWidth]);
    ok(largura[0] <= largura[1], `${nome}: nada vaza para o lado`, largura.join(' > '));
    ok(await p.locator('.vr-noite li').count() === 8, `${nome}: as oito horas da programação`);
    ok(/Soli Deo Gloria!/.test(await p.locator('.vr-declaracao').innerText()), `${nome}: a declaração de 2027`);
    ok(await p.locator('.vr-lista li').count() === 4, `${nome}: os quatro "para quem é"`);
    /* `liga()` cola a palavra curta na seguinte com espaço que não quebra */
    const faq = (await p.locator('#t-vr-faq').locator('xpath=..').innerText()).replace(/\u00a0/g, ' ');
    ok(/A reserva é gratuita\?/.test(faq) && /Quantas pessoas posso reservar\?/.test(faq) && !/\[/.test(faq), `${nome}: as perguntas, sem colchete da copy`);
    ok(!/\[/.test(await p.locator('main').innerText()), `${nome}: nenhum colchete da copy na página`);
    await p.screenshot({ path: `${OUT}/${nome}-primeira-tela.png` });
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo(0, y); await new Promise(r => setTimeout(r, 25)); } scrollTo(0, 0); });
    await esperar(500);
    await p.screenshot({ path: `${OUT}/${nome}-pagina.png`, fullPage: true });

    /* 2 · a chamada leva à reserva; em branco, aponta o nome */
    await p.getByRole('link', { name: 'Quero reservar meu lugar' }).first().click(); await esperar(900);
    ok(/#reserva$/.test(p.url()), `${nome}: a chamada leva à reserva`, p.url());
    await p.locator('form.vr-form button[type=submit]').click(); await esperar(300);
    ok(/Escreva seu nome completo/.test(await p.locator('form.vr-form [role=alert]').innerText()), `${nome}: em branco, o erro aponta o nome`);
    ok(await p.evaluate(() => document.activeElement?.getAttribute('name')) === 'nome', `${nome}: e o foco vai para o nome`);

    /* 3 · tudo certo, o banco grava */
    await preencher(p);
    await p.locator('#reserva').screenshot({ path: `${OUT}/${nome}-formulario.png` });
    await p.locator('form.vr-form button[type=submit]').click(); await esperar(800);
    ok(/Lugar reservado, Maria/.test(await p.locator('.vr-resposta').innerText()), `${nome}: "Lugar reservado"`);
    ok(/3 pessoas na Virada 2027/.test(await p.locator('.vr-resposta').innerText()), `${nome}: com quantas pessoas`);
    await p.locator('.vr-resposta').screenshot({ path: `${OUT}/${nome}-reservado.png` });
    ok(!erros.length, `${nome}: nenhum erro de página`, erros.join(' | '));
    await c.close();

    /* 4 · o banco fora: a reserva vai escrita pelo WhatsApp */
    c = await ctx(w, h, toque, { post: { ok: true, guardado: false } });
    p = await c.newPage();
    await p.goto(`${BASE}/virada#reserva`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('form.vr-form', { timeout: 30000 }); await esperar(1200);
    await preencher(p);
    await p.locator('form.vr-form button[type=submit]').click(); await esperar(800);
    const zap = await p.locator('.vr-resposta a').first().getAttribute('href');
    const texto = decodeURIComponent((zap || '').split('?text=')[1] || '');
    ok(/Falta um toque/.test(await p.locator('.vr-resposta').innerText()), `${nome}: banco fora, "Falta um toque"`);
    ok(/^https:\/\/wa\.me\/\d+\?text=/.test(zap || '') && texto.includes('529.982.247-25') && texto.includes('3 pessoas'), `${nome}: o WhatsApp leva a reserva escrita`, texto);
    await c.close();

    /* 5 · esgotado: a página já abre na lista de espera */
    c = await ctx(w, h, toque, { get: { aberta: false, restantes: 0 } });
    p = await c.newPage();
    await p.goto(`${BASE}/virada#reserva`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#reserva', { timeout: 30000 }); await esperar(1500);
    ok(/As vagas acabaram/.test(await p.locator('#reserva').innerText()) && await p.locator('form.vr-form').count() === 0, `${nome}: esgotado abre na lista de espera`);
    await c.close();

    /* 6 · os últimos lugares */
    c = await ctx(w, h, toque, { get: { aberta: true, restantes: 12 } });
    p = await c.newPage();
    await p.goto(`${BASE}/virada#reserva`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('form.vr-form', { timeout: 30000 }); await esperar(1500);
    ok(/Últimos 12 lugares/.test(await p.locator('form.vr-form .s-micro').innerText()), `${nome}: com até 30, diz quantos restam`);
    await c.close();
  }

  /* 7 · o endereço do QR e o domínio */
  const v27 = await fetch(`${BASE}/v27`, { redirect: 'manual' });
  ok(v27.status === 307 && /\/virada$/.test(v27.headers.get('location') || ''), 'o QR (/v27) leva à página, temporário', `${v27.status} ${v27.headers.get('location')}`);
  /* o fetch do Node não deixa trocar o Host: vai pelo http cru, com o domínio no cabeçalho */
  const comHost = (caminho, host) => new Promise((ok_, erro) => {
    const u = new URL(BASE + caminho);
    const q = pedirHttp({ host: u.hostname, port: u.port, path: u.pathname, headers: { host } }, r => { r.resume(); ok_({ status: r.statusCode, location: r.headers.location }); });
    q.on('error', erro); q.end();
  });
  const servir = await comHost('/virada', 'guiaservir.com');
  ok(servir.status === 307 && servir.location === 'https://guiachurch.com/virada', 'guiaservir.com/virada leva ao guiachurch.com', `${servir.status} ${servir.location}`);
  const follow = await comHost('/virada', 'guiafollow.com');
  ok(follow.status === 307 && follow.location === 'https://guiachurch.com/virada', 'guiafollow.com/virada leva ao guiachurch.com', `${follow.status} ${follow.location}`);
  const igreja = await comHost('/virada', 'guiachurch.com');
  ok(igreja.status === 200, 'guiachurch.com/virada abre a página', String(igreja.status));
  const painel = await fetch(`${BASE}/virada/reservas`, { redirect: 'manual' });
  ok(painel.status === 307 && /\/demandas\/admin\/virada$/.test(painel.headers.get('location') || ''), '/virada/reservas leva ao painel');

  /* 8 · o painel da administração, com reservas de mentira */
  for (const [w, h, toque, nome] of [[1440, 900, false, '1440'], [390, 844, true, '390']]) {
    const R = (id, nome, pessoas, vinculo, extra = {}) => ({ id, evento: 'virada-2027', criada_em: '2026-11-21T22:1' + id.length + ':00Z', origem: 'site', nome,
      cpf: '52998224725', email: `${id}@exemplo.com`, telefone: '21999990000', vinculo, pessoas, lancada_por: null, cancelada_em: null, cancelada_por: null, motivo: null, ...extra });
    const c = await ctx(w, h, toque, { rpc: {
      dem_quem_sou: { ok: true, id: 'adm', nome: 'Administração', primeiro_nome: 'Administração', papel: 'admin', setor_id: null, setor: null, setor_atende: false, tem_login: true },
      virada_painel: { ok: true, eu: 'Administração', agora: '2026-11-21T22:30:00Z',
        evento: { slug: 'virada-2027', nome: 'Virada 2027', capacidade: 150, max_por_reserva: 6, fecha_em: '2026-12-31T22:30:00Z' },
        reservas: [R('a', 'Maria da Silva', 3, 'visitante'), R('bb', 'João Pereira', 4, 'membro'), R('ccc', 'Ana Costa', 2, 'membro', { cancelada_em: '2026-11-21T23:00:00Z' }),
          R('dddd', 'Fulano da Porta', 1, null, { origem: 'manual', cpf: null, email: null, lancada_por: 'Arthur' })] },
    } });
    const p = await c.newPage();
    const erros = []; p.on('pageerror', e => erros.push(String(e)));
    await p.addInitScript(() => { try { localStorage.setItem('demandas.link', 'TOKEN-DE-MENTIRA'); } catch {} });
    await p.goto(`${BASE}/demandas/admin/virada`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('text=Quem reservou', { timeout: 30000 }).catch(() => {}); await esperar(1500);
    const t = await p.locator('main').innerText().catch(() => '');
    ok(/Virada 2027/.test(t) && /Quem reservou/.test(t), `${nome}: o painel abre`, t.slice(0, 300));
    const kpi = await p.locator('.dm-kpi-valor').allInnerTexts();
    ok(kpi.join('|') === '8|142|3|3', `${nome}: pessoas 8, restam 142, reservas 3, visitantes 3`, kpi.join('|'));
    const cancelada = await p.evaluate(() => {
      const itens = [...document.querySelectorAll('[data-reserva]')];
      const ultima = itens[itens.length - 1];
      const riscado = ultima ? getComputedStyle(ultima.querySelector('[class*="nome"]')).textDecorationLine : '';
      return { n: itens.length, canceladas: document.querySelectorAll('[data-reserva][data-cancelada]').length, ultimaCancelada: !!ultima && ultima.hasAttribute('data-cancelada'), riscado };
    });
    ok(cancelada.n === 4 && cancelada.canceladas === 1 && cancelada.ultimaCancelada && cancelada.riscado === 'line-through',
      `${nome}: a cancelada aparece riscada, no fim`, JSON.stringify(cancelada));
    /* 21/11/2026: no celular, cartões e não a tabela (o nome não se parte, nada sai da tela) */
    const forma = await p.evaluate(() => ({ tabela: !!document.querySelector('main table'), cartoes: document.querySelectorAll('main li[data-reserva]').length,
      sobra: document.documentElement.scrollWidth - innerWidth }));
    ok(toque ? (!forma.tabela && forma.cartoes === 4 && forma.sobra <= 0) : (forma.tabela && forma.cartoes === 0),
      `${nome}: ${toque ? 'cartões no celular, sem sair da tela' : 'tabela no computador'}`, JSON.stringify(forma));
    const [download] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.getByRole('button', { name: 'Baixar planilha' }).click()]);
    ok(!!download && /^virada-2027-reservas-\d{4}-\d{2}-\d{2}\.csv$/.test(download.suggestedFilename()), `${nome}: a planilha baixa`, download?.suggestedFilename());
    await p.screenshot({ path: `${OUT}/${nome}-painel.png`, fullPage: true });
    ok(!erros.length, `${nome}: painel sem erro de página`, erros.join(' | '));
    await c.close();
  }
} finally { await nav.close(); }
console.log(`virada-tela: ${feitas - falhas}/${feitas} ok`);
if (falhas) process.exit(1);
