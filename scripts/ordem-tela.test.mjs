/* A ORDEM DO CULTO NA TELA — 105, 02/10/2026.

   Fase 3 do estudo do ServoApp: as músicas com tom, BPM e cifra, e os
   momentos do culto com o tempo de cada um. O que esta prova exige, no
   harness:

     1. Escala do líder: a ordem do dia com a hora de cada item calculada
        da hora do culto; o resumo (músicas, tempo, fim); acrescentar uma
        música que o ministério já tocou traz o tom, o BPM e a cifra da última
        vez; "Salvar" manda a ordem inteira com a ordem que a tela tinha;
        subir troca dois itens; cifra que não é https não sai da tela; sem
        conexão, o formulário fica com o que foi digitado; quando outro líder
        salvou antes (MUDOU), a tela mostra a versão dele e diz isso; a
        mensagem do grupo leva as músicas com o tom;
     2. página de quem serve: a seção Ordem do culto, um bloco por culto, a
        do outro ministério com o nome dele, nada do dia recusado, a hora de
        cada item, o tom em destaque, a cifra abrindo fora, a entrada na
        barra, e o celular sem rolagem de lado.

   Roda com BASE=http://127.0.0.1:3500 node scripts/ordem-tela.test.mjs */
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const OUT = '/tmp/ordem-tela';
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

/* o SEGUNDO culto que vem, onde o harness põe a ordem (sábado ou domingo, a
   partir de hoje, no mês); o primeiro fica com o repertório só de links */
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const DIA = (() => {
  const d = new Date(hoje + 'T12:00:00Z');
  let achados = 0;
  for (let k = 0; k < 15; k++) {
    const x = new Date(d.getTime() + k * 86400000);
    if (x.getUTCMonth() !== d.getUTCMonth()) break;
    if ((x.getUTCDay() === 6 || x.getUTCDay() === 0) && ++achados === 2) return x.toISOString().slice(0, 10);
  }
  return '';
})();
/* e o primeiro, que é onde a página do voluntário do harness põe a ordem */
const DIA1 = (() => {
  const d = new Date(hoje + 'T12:00:00Z');
  for (let k = 0; k < 8; k++) {
    const x = new Date(d.getTime() + k * 86400000);
    if (x.getUTCDay() === 6 || x.getUTCDay() === 0) return x.toISOString().slice(0, 10);
  }
  return '';
})();
const inicioDe = dia => (new Date(dia + 'T12:00:00Z').getUTCDay() === 6 ? 19 * 60 : 10 * 60);
const H = inicioDe(DIA);
const rel = m => { const h = Math.floor(m / 60), mm = m % 60; return mm ? `${h}h${String(mm).padStart(2, '0')}` : `${h}h`; };
const HORAS = [0, 5, 11, 16, 22, 27].map(x => rel(H + x));
const HORAS1 = [0, 5, 11, 16, 22, 27].map(x => rel(inicioDe(DIA1) + x));

const BANCO = [{ titulo: 'Mar Aberto', artista: 'Grupo Teste', tom: 'D', bpm: 80,
  cifra: 'https://www.cifras.com.br/cifra/grupo-teste/mar-aberto', vezes: 2, ultima: '2026-09-13', proxima: null }];

try {
  if (!DIA) throw new Error('o harness não tem dois cultos por vir neste mês: a prova não tem o que olhar');

  /* 1. Escala do líder */
  for (const [w, h, toque, nome] of [[1440, 900, false, '1440'], [390, 844, true, '390']]) {
    const c = await ctx(w, h, toque); const p = await c.newPage();
    const pedidos = [];
    let resposta = null;            // null = a rede cai (o harness não tem banco)
    await p.route('**/rest/v1/rpc/musicas_do_ministerio', r => responder(r, BANCO));
    await p.route('**/rest/v1/rpc/salvar_ordem', r => {
      if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
      pedidos.push(r.request().postDataJSON());
      if (resposta === null) return r.abort();
      return responder(r, typeof resposta === 'function' ? resposta(pedidos.at(-1)) : resposta);
    });
    await p.goto(`${BASE}/escala?demo=1&m=${DIA.slice(0, 7)}#d${DIA}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.es-casca', { timeout: 30000 }); await esperar(2500);
    const dia = p.locator(`#d${DIA}`);
    if (!(await dia.evaluate(e => e.open))) { await dia.locator('summary').click(); await esperar(300); }
    const ordem = dia.locator('section.es-ec-ordem');
    ok(await ordem.count() === 1, `${nome}: o dia tem a ordem do culto`);
    const itens = ordem.locator('li.es-ec-oi');
    ok(await itens.count() === 6, `${nome}: os seis itens do harness`, String(await itens.count()));
    const horas = await ordem.locator('.es-ec-oi-hora').allInnerTexts();
    ok(horas.join(',') === HORAS.join(','), `${nome}: a hora de cada item sai da hora do culto mais as durações`, horas.join(','));
    const resumo = await ordem.locator('.es-ec-ordem-resumo').innerText();
    ok(resumo === `3 músicas · 1h07 · termina ${rel(H + 67)}`, `${nome}: o resumo diz músicas, tempo e fim`, resumo);
    const meta2 = await itens.nth(1).locator('.es-ec-oi-meta').innerText();
    ok(meta2 === 'G · 72 BPM · Lia · 6 min · com cifra', `${nome}: a música mostra tom, BPM, quem, tempo e cifra`, meta2);

    /* a mensagem do grupo leva as músicas com o tom e o BPM (02/10/2026,
       sugestão do Louvor: "Setlist: Tons e BPM", depois dos links, e as
       observações) */
    await dia.getByRole('button', { name: 'Mandar nos grupos' }).click(); await esperar(400);
    const msgs = await dia.locator('.es-mg-linha a.es-btn').evaluateAll(as => as.map(a => decodeURIComponent(a.getAttribute('href').split('?text=')[1] || '')));
    ok(msgs.length >= 1 && msgs.every(t => t.includes('SETLIST: TOM E BPM\n1. Canção da Manhã · Tom G · 72 BPM\n2. Rio de Graça · Tom F#m · 68 BPM\n3. Luz no Caminho · Tom Bb\n')),
      `${nome}: toda mensagem do dia leva as músicas com o tom`, (msgs[0] || '').slice(-300));
    ok(msgs.every(t => t.includes('OBSERVAÇÕES\n1. Canção da Manhã: Começa só voz e teclado')),
      `${nome}: e as observações, com o número da música`, (msgs[0] || '').slice(-300));
    ok(msgs.every(t => !/Abertura|Avisos|Palavra/.test(t)), `${nome}: os momentos não vão para a mensagem`);
    await dia.getByRole('button', { name: 'Mandar nos grupos' }).click().catch(() => {}); await esperar(300);

    /* a linha inteira abre o item, com o que está salvo */
    await itens.nth(1).locator('button.es-ec-oi-abre').click(); await esperar(300);
    const fEd = ordem.locator('form.es-ec-of');
    ok(await fEd.count() === 1 && await fEd.getByLabel('Música', { exact: true }).inputValue() === 'Canção da Manhã'
      && await fEd.getByLabel('Tom').inputValue() === 'G' && await fEd.getByLabel('Observação').inputValue() === 'Começa só voz e teclado',
      `${nome}: tocar na linha abre o item com o que está salvo`);
    ok(await fEd.getByRole('button', { name: 'Tirar da ordem' }).count() === 1, `${nome}: e oferece tirar da ordem`);
    await fEd.getByRole('button', { name: 'Cancelar' }).click(); await esperar(200);
    if (toque) {
      const alts = await itens.evaluateAll(es => es.map(e => Math.round(e.getBoundingClientRect().height)));
      ok([0, 3, 4, 5].every(k => alts[k] <= 80), `${nome}: no celular o item simples ocupa uma linha de toque, com as setas ao lado`, alts.join(','));
      ok(await ordem.locator('.es-ec-oi-editar').first().isHidden(), `${nome}: e a palavra "Editar" sai (a linha é o botão)`);
    }
    /* o momento não pede tom, BPM nem cifra */
    await ordem.getByRole('button', { name: 'Acrescentar momento' }).click(); await esperar(300);
    const fm = ordem.locator('form.es-ec-of');
    const rotulos = (await fm.locator('label > span').allInnerTexts()).join(',');
    ok(rotulos === 'Momento,Duração (min),Quem,Observação', `${nome}: o momento pede só nome, duração, quem e observação`, rotulos);
    await fm.getByRole('button', { name: 'Cancelar' }).click(); await esperar(200);

    /* acrescentar uma música que o ministério já tocou */
    const toasts = () => p.locator('.es-toast').allInnerTexts();
    await ordem.getByRole('button', { name: 'Acrescentar música' }).click(); await esperar(300);
    const form = ordem.locator('form.es-ec-of');
    ok(await form.count() === 1, `${nome}: o formulário abre`);
    const titulo = form.getByLabel('Música', { exact: true });
    ok(await titulo.evaluate(e => e === document.activeElement), `${nome}: o cursor já está no nome da música`);
    await titulo.fill('mar aberto');
    const yAntes = (await form.getByRole('button', { name: 'Salvar' }).boundingBox())?.y;
    await form.getByLabel('Quem conduz').click(); await esperar(300);
    const yDepois = (await form.getByRole('button', { name: 'Salvar' }).boundingBox())?.y;
    ok(yAntes !== undefined && Math.abs(yAntes - yDepois) < 1,
      `${nome}: completar a música não empurra o "Salvar" (o toque não se perde no meio)`, `${yAntes} → ${yDepois}`);
    ok(await titulo.inputValue() === 'Mar Aberto' && await form.getByLabel('Tom').inputValue() === 'D'
      && await form.getByLabel('BPM').inputValue() === '80' && /cifras\.com\.br/.test(await form.getByLabel('Link da cifra').inputValue()),
      `${nome}: a música já tocada traz nome, tom, BPM e cifra da última vez`,
      [await titulo.inputValue(), await form.getByLabel('Tom').inputValue(), await form.getByLabel('BPM').inputValue()].join(' | '));
    ok(/Tom, BPM e cifra de 13\/09 \(tocada 2 vezes\)/.test(await form.innerText()), `${nome}: e diz de onde veio`, await form.innerText());
    const alturas = await form.locator('input, select').evaluateAll(es => es.map(e => Math.round(e.getBoundingClientRect().height)));
    ok(!toque || alturas.every(a => a >= 44), `${nome}: campos com 44 no dedo`, alturas.join(','));
    await form.screenshot({ path: `${OUT}/escala-form-${nome}.png` });

    /* sem conexão: o que foi digitado fica */
    await form.getByRole('button', { name: 'Salvar' }).click(); await esperar(1200);
    ok(await form.count() === 1 && await titulo.inputValue() === 'Mar Aberto', `${nome}: sem conexão, o formulário fica com o que foi digitado`);
    ok((await toasts()).some(t => /Sem conexão/.test(t)), `${nome}: e o aviso diz que é a conexão`, (await toasts()).join(' | '));

    /* agora o banco responde: grava a ordem inteira, com a de antes */
    resposta = pedido => ({ ok: true, ordem: pedido.p_ordem });
    await p.locator('.es-toast').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    await form.getByRole('button', { name: 'Salvar' }).click(); await esperar(900);
    const ult = pedidos.at(-1) || {};
    ok(ult.p_antes?.length === 6 && ult.p_ordem?.length === 7 && ult.p_ordem[6]?.titulo === 'Mar Aberto'
      && ult.p_ordem[6]?.tom === 'D' && ult.p_ordem[6]?.bpm === 80 && !!ult.p_culto && !!ult.p_equipe,
      `${nome}: Salvar manda a ordem inteira, com a de antes e a música no fim`, JSON.stringify(ult).slice(0, 300));
    ok(await itens.count() === 7 && await form.count() === 0, `${nome}: gravado, a lista tem a música e o formulário fecha`);
    ok((await toasts()).some(t => t === 'Mar Aberto entrou na ordem'), `${nome}: e o aviso confirma`, (await toasts()).join(' | '));

    /* subir troca dois itens, e grava na hora */
    await ordem.getByRole('button', { name: 'Subir Mar Aberto' }).click(); await esperar(800);
    const sub = pedidos.at(-1) || {};
    ok(sub.p_ordem?.[5]?.titulo === 'Mar Aberto' && sub.p_ordem?.[6]?.titulo === 'Palavra' && sub.p_antes?.[6]?.titulo === 'Mar Aberto',
      `${nome}: subir troca a música com o item de cima`, (sub.p_ordem || []).map(i => i.titulo).join(','));
    ok((await ordem.locator('.es-ec-oi-tit').allInnerTexts())[5].startsWith('Mar Aberto'), `${nome}: e a tela mostra a nova ordem`);

    /* editar e voltar: o foco volta para a linha que abriu */
    const linhaMar = itens.nth(5).locator('button.es-ec-oi-abre');
    await linhaMar.click(); await esperar(300);
    await form.getByRole('button', { name: 'Cancelar' }).click(); await esperar(300);
    ok(await linhaMar.evaluate(e => e === document.activeElement), `${nome}: Cancelar devolve o foco à linha que abriu`,
      await p.evaluate(() => (document.activeElement?.outerHTML || '').slice(0, 160)));

    /* tirar pede um segundo toque, e só então grava */
    await linhaMar.click(); await esperar(300);
    const nPed = pedidos.length;
    await form.getByRole('button', { name: 'Tirar da ordem' }).click(); await esperar(300);
    ok(pedidos.length === nPed && await form.getByRole('button', { name: 'Tirar mesmo' }).count() === 1,
      `${nome}: o primeiro toque em Tirar só pergunta`);
    await p.locator('.es-toast').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    await form.getByRole('button', { name: 'Tirar mesmo' }).click(); await esperar(900);
    const tir = pedidos.at(-1) || {};
    ok(pedidos.length === nPed + 1 && tir.p_ordem?.length === 6 && !tir.p_ordem.some(i => i.titulo === 'Mar Aberto'),
      `${nome}: o segundo tira a música e grava o resto`, (tir.p_ordem || []).map(i => i.titulo).join(','));
    ok(await itens.count() === 6 && (await toasts()).some(t => t === 'Mar Aberto saiu da ordem'), `${nome}: e a tela e o aviso concordam`);
    ok(await p.evaluate(() => document.activeElement?.textContent?.trim()) === 'Acrescentar música',
      `${nome}: o foco vai para "Acrescentar música", e não para o começo da página`, await p.evaluate(() => document.activeElement?.outerHTML?.slice(0, 80)));

    /* cifra que não é https não sai da tela */
    const antes = pedidos.length;
    await ordem.getByRole('button', { name: 'Acrescentar música' }).click(); await esperar(300);
    await form.getByLabel('Música', { exact: true }).fill('Outra Canção');
    await form.getByLabel('Link da cifra').fill('http://www.cifraclub.com.br/x');
    await form.getByRole('button', { name: 'Salvar' }).click(); await esperar(500);
    const erroCifra = form.locator('.es-erro-campo');
    ok(pedidos.length === antes && /https:\/\//.test(await erroCifra.innerText().catch(() => '')),
      `${nome}: cifra http não sai da tela e a frase diz o que colar`, await erroCifra.innerText().catch(() => 'sem frase'));
    ok(await form.getByLabel('Link da cifra').getAttribute('aria-invalid') === 'true', `${nome}: o campo fica marcado`);
    await form.getByLabel('Link da cifra').press('Escape'); await esperar(300);
    ok(await form.count() === 0, `${nome}: Esc desiste`);

    /* outro líder salvou antes: a tela mostra a versão dele */
    resposta = { ok: false, erro: 'MUDOU', ordem: [{ t: 'momento', titulo: 'Versão da outra líder', min: 10 }] };
    await p.locator('.es-toast').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    await ordem.getByRole('button', { name: 'Descer Abertura' }).click(); await esperar(900);
    ok(await itens.count() === 1 && (await itens.first().innerText()).includes('Versão da outra líder'),
      `${nome}: MUDOU: a tela passa a mostrar a ordem que está no banco`, String(await itens.count()));
    ok((await toasts()).some(t => /mudou esta ordem/.test(t)), `${nome}: e diz que outra pessoa mudou`, (await toasts()).join(' | '));

    /* MUDOU com um item aberto: o formulário fecha (a posição dele pode ser
       agora a de outro item, e salvar ali trocaria a música errada) */
    resposta = { ok: false, erro: 'MUDOU', ordem: [{ t: 'momento', titulo: 'Oração', min: 5 }, { t: 'momento', titulo: 'Versão da outra líder', min: 10 }] };
    await p.locator('.es-toast').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
    await itens.first().locator('button.es-ec-oi-abre').click(); await esperar(300);
    await form.getByLabel('Observação').fill('mudança minha');
    const nMud = pedidos.length;
    await form.getByRole('button', { name: 'Salvar' }).click();
    await form.waitFor({ state: 'detached', timeout: 6000 }).catch(() => {}); await esperar(300);
    ok(await form.count() === 0 && await itens.count() === 2 && (await itens.first().innerText()).includes('Oração'),
      `${nome}: MUDOU com um item aberto: o formulário fecha e a lista é a do banco`,
      `forms ${await form.count()} · pedidos +${pedidos.length - nMud} · itens ${await itens.count()} · ` +
      `form: ${(await form.getAttribute('aria-label').catch(() => '-'))} · ativo ${await p.evaluate(() => (document.activeElement?.outerHTML || '').slice(0, 80))}`);

    ok(await semRolagemDeLado(p), `${nome}: a escala não rola de lado`);
    await ordem.screenshot({ path: `${OUT}/escala-ordem-${nome}.png` });
    await c.close();
  }

  /* 2. Página de quem serve */
  for (const [w, h, toque, nome] of [[1440, 900, false, '1440'], [390, 844, true, '390']]) {
    const c = await ctx(w, h, toque); const p = await c.newPage();
    await p.goto(`${BASE}/eu/x?demo=ordem`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.vol-in', { timeout: 30000 });
    /* 02/10/2026: a seção chega depois do resto da página (é uma pergunta à
       parte) e, com o servidor de desenvolvimento ocupado, passava dos 2 s
       fixos que esta linha esperava: a 1440, que roda primeiro, contava 0.
       Espera a condição, não o relógio. */
    const sec = p.locator('#ordem');
    await p.waitForSelector('#ordem .vol-ordem', { timeout: 20000 }).catch(() => {});
    await esperar(300);
    ok(await sec.count() === 1, `${nome}: a página tem a seção Ordem do culto`);
    const blocos = sec.locator('.vol-ordem');
    ok(await blocos.count() === 2, `${nome}: um bloco por culto, e nada do dia recusado`, String(await blocos.count()));
    const rot = await blocos.first().locator('.vol-rep-dia').innerText();
    ok(/ · Louvor$/.test(rot), `${nome}: a ordem de outro ministério vem com o nome dele`, rot);
    const hs = await blocos.first().locator('.vol-oi-hora').allInnerTexts();
    ok(hs.join(',') === HORAS1.join(','), `${nome}: a hora de cada item`, hs.join(','));
    const m = blocos.first().locator('.vol-oi').nth(1);
    ok(/Banda Exemplo · Tom G · 72 BPM · Lia · 6 min/.test((await m.locator('.vol-oi-meta').innerText()).replace(/\s+/g, ' '))
      && await m.locator('.vol-oi-meta b').innerText() === 'G', `${nome}: a música diz artista, tom (em destaque), BPM, quem e tempo`);
    ok(/Começa só voz e teclado/.test(await m.innerText()), `${nome}: e a nota`);
    const cifra = m.locator('a.vol-oi-cifra');
    const [href, alvo, relac, rotulo] = await cifra.evaluate(a => [a.getAttribute('href'), a.target, a.rel, a.getAttribute('aria-label')]);
    ok(href.startsWith('https://') && alvo === '_blank' && /noopener/.test(relac) && /noreferrer/.test(relac),
      `${nome}: a cifra abre fora, sem passar a página adiante`);
    ok(/cifraclub\.com\.br/.test(rotulo), `${nome}: e o leitor de tela ouve o nome do site`, rotulo);
    const alt = await cifra.evaluate(a => Math.round(a.getBoundingClientRect().height));
    ok(alt >= 44, `${nome}: a cifra tem 44 de toque`, String(alt));
    ok(await blocos.first().locator('.vol-oi-momento').count() === 3, `${nome}: os três momentos ficam marcados como momento`);
    ok(await p.locator('.vol-barra a[href="#ordem"]').count() === 1, `${nome}: a barra leva à ordem`);
    ok(await semRolagemDeLado(p), `${nome}: a página não rola de lado`);
    await sec.screenshot({ path: `${OUT}/eu-ordem-${nome}.png` });
    await c.close();
  }

  /* 3. sem a variante, a página de sempre: nenhuma seção nova */
  {
    const c = await ctx(390, 844, true); const p = await c.newPage();
    await p.goto(`${BASE}/eu/x?demo=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.vol-in', { timeout: 30000 }); await esperar(1500);
    ok(await p.locator('#ordem').count() === 0 && await p.locator('.vol-barra a[href="#ordem"]').count() === 0,
      'sem ordem no banco, a página do voluntário fica como era');
    await c.close();
  }
} catch (e) {
  falhas++; console.log('  FALHOU (exceção)', e?.message || e);
} finally {
  await nav.close();
}
console.log(`ordem-tela: ${feitas - falhas}/${feitas} ${falhas ? 'FALHOU' : 'ok'}`);
process.exit(falhas ? 1 : 0);
