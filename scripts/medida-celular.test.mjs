/* A MEDIDA DO CELULAR, MEDIDA.

   O irmão de `contraste-real.test.mjs`, pelo mesmo motivo: um medidor que
   nunca reprova dá 100% e não vale nada. Aqui eu estrago a página de
   propósito, um defeito por vez, e exijo que cada um apareça — e, do outro
   lado, exijo que o que está certo continue passando.

   Os "certos" desta lista não são hipóteses: são as três exceções que eu
   tive que aprender à força, cada uma depois de um relatório falso.

     · rótulo em CAIXA ALTA espaçada a 11px é a régua da casa, não descuido;
     · link no meio de uma frase é dispensado dos 44px pela própria WCAG;
     · "dia" dentro de "Recado deste dia" não faz do campo uma data.

   Precisa do app em desenvolvimento na 3500.
   Roda com `node scripts/medida-celular.test.mjs`. */

import { chromium } from 'playwright';
import { MEDIR, chromeDoContainer, criaContador } from './medida-celular.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const { estado, ok } = criaContador();

const medir = async (pag, largura) => pag.evaluate(MEDIR, largura);

const nav = await chromium.launch({ executablePath: chromeDoContainer() });
try {
  const ctx = await nav.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, reducedMotion: 'reduce',
  });
  const pag = await ctx.newPage();
  await pag.route('**', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());

  /* ---------------------------------------------- 1. o que está certo passa */
  await pag.goto(`${BASE}/acessar`, { waitUntil: 'domcontentloaded' });
  await pag.waitForTimeout(1600);
  let m = await medir(pag, 390);
  ok(m.miudos.length === 0,
    'rótulo de 11px em caixa alta espaçada não conta como texto miúdo',
    m.miudos.slice(0, 4).join(' | '));
  ok(m.larguraDoc <= 391, 'a página de acesso não desliza de lado',
    `documento ${m.larguraDoc}px`);

  await pag.goto(`${BASE}/escala?demo=1`, { waitUntil: 'domcontentloaded' });
  await pag.waitForSelector('.sistema', { timeout: 10000 });
  await pag.waitForTimeout(1600);
  m = await medir(pag, 390);
  ok(m.teclado.length === 0,
    'o campo "Recado deste dia" não é confundido com campo de data',
    m.teclado.slice(0, 4).join(' | '));
  ok(m.pequenos.length === 0, 'a tela de escala não tem alvo menor que 44px',
    m.pequenos.slice(0, 4).join(' | '));

  /* ------------------------------------------------ 2. o que está errado cai */
  const estragos = [
    {
      por: 'frase de 10px',
      css: '.g-pe-rua{ font-size:10px!important; text-transform:none!important; letter-spacing:normal!important }',
      balde: 'miudos', rota: '/acessar',
    },
    {
      por: 'rótulo abaixo do piso da casa (9px)',
      css: '.g-pe-h{ font-size:9px!important }',
      balde: 'miudos', rota: '/acessar',
    },
    {
      por: 'etiqueta em caixa alta mas sem espaçamento',
      css: '.g-pe-h{ font-size:11px!important; letter-spacing:normal!important }',
      balde: 'miudos', rota: '/acessar',
    },
    {
      por: 'botão de 30px de altura',
      css: '.bt-barra{ min-height:0!important; padding:2px 10px!important }',
      balde: 'pequenos', rota: '/acessar',
    },
    {
      por: 'campo que dá zoom no iOS',
      css: '.g-pe-cols input, .lid-cand-nota, input{ font-size:13px!important }',
      balde: 'zoomIos', rota: '/escala?demo=1',
    },
    {
      /* O ESTRAGO TEM QUE SER UM ESTRAGO DE VERDADE.

         A primeira tentativa esticava `.g-pe-rua` para 900px e a medida não
         acusou — com razão: aquele bloco mora dentro de um pai que recorta,
         então ele não empurra a página. Recortado não desliza, e a medida
         pergunta exatamente isso. Um elemento solto no `body` é que empurra
         de verdade, e é esse que tem que ser pego. */
      /* 21/09/2026 · ESTE ESTRAGO MUDOU DE BALDE, E ISSO NÃO É AFROUXAMENTO.

         Ele estava no balde `estoura`, que é medido por `larguraDoc`. Naquela
         época `larguraDoc` era `Math.max(html.scrollWidth, body.scrollWidth)`.
         Essa conta foi corrigida para só `html.scrollWidth`, porque quem faz
         a JANELA rolar é o `documentElement` — e a conta antiga reprovava como
         "desliza de lado" um defeito que é outro: conteúdo cortado sem
         recuperação, com `window.scrollX` parado em 0.

         O `body` destas telas tem `overflow-x: clip`, então este bloco de
         900px não faz a janela andar: ele é RECORTADO. Medido:

           {"htmlScrollW":390,"bodyScrollW":900,"bodyOverflowX":"clip",
            "rolouDeFato":0}

         Ou seja, ele sempre foi um caso de `cortadoSemSaida` e estava sendo
         cobrado no balde errado. A medida nova o pega, e o pega pelo motivo
         certo. Quem ainda cobra o deslizamento de verdade é o estrago abaixo,
         que rola a janela de fato. */
      por: 'bloco de 900px solto no corpo da página',
      js: () => {
        const d = document.createElement('div');
        d.style.cssText = 'width:900px;height:30px;background:#ccc';
        document.body.appendChild(d);
      },
      balde: 'cortadoSemSaida', rota: '/acessar',
    },
    {
      /* E A PÁGINA ANDANDO DE VERDADE, que é o que `larguraDoc` mede.

         Sem este caso, a troca de `Math.max` por `html.scrollWidth` teria
         deixado o balde `estoura` sem nenhum estrago que o exercite, e uma
         medida que nunca é cobrada é uma medida que se pode apagar sem
         ninguém notar. O bloco vai no `documentElement`, acima do `body` e
         do `overflow-x: clip` dele. */
      por: 'bloco de 900px acima do body, que faz a janela rolar mesmo',
      js: () => {
        const d = document.createElement('div');
        d.style.cssText = 'width:900px;height:30px;background:#ccc;position:absolute;top:0;left:0';
        document.documentElement.appendChild(d);
      },
      balde: 'estoura', rota: '/acessar',
    },
    {
      por: 'zoom bloqueado no viewport',
      js: () => {
        const m = document.querySelector('meta[name="viewport"]');
        if (m) m.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
      },
      balde: 'zoomPreso', rota: '/acessar',
    },
  ];

  for (const e of estragos) {
    await pag.goto(BASE + e.rota, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(1300);
    if (e.css) await pag.addStyleTag({ content: e.css });
    if (e.js) await pag.evaluate(e.js);
    await pag.waitForTimeout(300);
    const r = await medir(pag, 390);
    const pegou = e.balde === 'zoomPreso' ? r.zoomPreso
      : e.balde === 'estoura' ? r.larguraDoc > 391
      : r[e.balde].length > 0;
    ok(pegou, `estrago "${e.por}" é acusado`, `o balde ${e.balde} ficou vazio`);
  }

  /* --------------- 3. a dispensa do link dentro de frase continua valendo */
  await pag.goto(`${BASE}/acessar`, { waitUntil: 'domcontentloaded' });
  await pag.waitForTimeout(1300);
  await pag.evaluate(() => {
    const p = document.createElement('p');
    p.style.cssText = 'font-size:17px;line-height:1.5;padding:20px';
    p.innerHTML = 'Uma frase comum com <a href="#" id="solto">um link no meio</a> dela.';
    document.body.appendChild(p);
    const b = document.createElement('a');
    b.href = '#'; b.id = 'sozinho'; b.textContent = 'Um link sozinho';
    b.style.cssText = 'display:block;height:24px;font-size:17px';
    document.body.appendChild(b);
  });
  await pag.waitForTimeout(200);
  const r3 = await medir(pag, 390);
  ok(!r3.pequenos.some(x => /um link no meio/.test(x)),
    'link dentro de uma frase não é cobrado em 44px',
    r3.pequenos.filter(x => /no meio/.test(x)).join(' | '));
  ok(r3.pequenos.some(x => /Um link sozinho/.test(x)),
    'link que existe sozinho É cobrado em 44px',
    'passou batido');

  await ctx.close();
} catch (e) {
  estado.falhas++; console.log('  ERRO:', String(e).slice(0, 500));
} finally {
  await nav.close().catch(() => {});
}

console.log(estado.falhas
  ? `\nmedida-celular: ${estado.falhas} falha(s) em ${estado.feitas}`
  : `\nmedida-celular: ${estado.feitas}/${estado.feitas} ok`);
process.exit(estado.falhas ? 1 : 0);
