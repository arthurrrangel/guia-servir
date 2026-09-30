/* O QUE A TELA FAZ QUANDO GRAVAR FALHA, E PARA ONDE O LINK LEVA · 30/09/2026

   Três rodadas de auditoria adversarial acharam, nesta ordem:
     · a falha de UM campo dos Ajustes remontava os seis e apagava o parágrafo
       que o líder escrevia em outro campo, com a tela dizendo "nada se perdeu";
     · depois, o rascunho que a nota prometia salvar sumia ao sair da tela;
     · passar com Tab por campos intactos gravava e pintava "não salvou";
     · duas escolhas seguidas no seletor: a falha da primeira desfazia a
       segunda, ainda no ar;
     · o link para um dia (`#d`) parava longe do topo a 1440px, porque a
       página ainda crescia depois da rolagem.

   Cada um vira uma verificação aqui. No harness (`?demo=1`) toda gravação
   falha, porque o Supabase é falso: é exatamente a falha que interessa. O
   atraso na recusa simula a rede ruim da igreja.

   Precisa do app em desenvolvimento, com o Supabase FALSO no ambiente
   (NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:59999). Tudo que não for a
   própria BASE é recusado no navegador.
   Roda com `BASE=http://127.0.0.1:3500 node scripts/escalas-falhas.test.mjs`. */

import { chromium } from 'playwright';
import { chromeDoContainer, criaContador } from './medida-celular.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const { estado, ok } = criaContador();
const esperar = ms => new Promise(z => setTimeout(z, ms));

const nav = await chromium.launch({ executablePath: chromeDoContainer() });
async function contexto(largura, altura, toque, atraso) {
  const ctx = await nav.newContext({ viewport: { width: largura, height: altura }, isMobile: toque, hasTouch: toque });
  ctx.gravacoes = 0;
  await ctx.route('**', async r => {
    const u = r.request().url();
    if (u.startsWith(BASE)) return r.continue();
    if (/\/rest\/v1\/config/.test(u) && r.request().method() !== 'GET') ctx.gravacoes++;
    if (atraso) await esperar(atraso);
    return r.abort();
  });
  return ctx;
}
const abrir = async (pag, rota) => {
  await pag.goto(BASE + rota, { waitUntil: 'domcontentloaded' });
  await pag.waitForSelector('.es-casca', { timeout: 15000 });
  await esperar(1400);
};

try {
  /* ------------------------------------ 1. Ajustes: texto que não gravou */
  {
    const ctx = await contexto(390, 844, true, 1500);
    const pag = await ctx.newPage();
    await abrir(pag, '/ajustes?demo=1');
    const ini = pag.getByLabel('Como você começa o aviso');
    const fim = pag.getByLabel('Como você termina o aviso');
    const salvoIni = await ini.inputValue();

    await ini.fill('Paz, pessoal!');
    await fim.click();
    await fim.fill('Contamos com vocês. Qualquer troca, avise até quinta.');
    await esperar(2500);
    ok(await ini.inputValue() === 'Paz, pessoal!', 'o começo que não gravou continua na tela');
    ok((await fim.inputValue()).startsWith('Contamos com vocês'), 'a falha de um campo não apaga o que se digita em outro');
    ok(await pag.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Como você termina o aviso',
      'o foco continua no campo em digitação');
    ok(await pag.locator('#nao-salvou-saudacao').count() === 1, 'a nota "não salvou" aparece no campo que falhou');
    ok(await ini.getAttribute('aria-invalid') === 'true', 'e o campo fica marcado como inválido');

    /* sair da tela desmonta tudo; o rascunho volta do aparelho */
    await pag.evaluate(() => document.activeElement?.blur());
    await abrir(pag, '/escala?demo=1');
    await abrir(pag, '/ajustes?demo=1');
    ok(await pag.getByLabel('Como você começa o aviso').inputValue() === 'Paz, pessoal!',
      'o rascunho volta depois de sair da tela');
    ok(await pag.locator('#nao-salvou-saudacao').count() === 1, 'e a nota volta com ele');

    /* voltar ao texto salvo apaga o rascunho */
    await pag.getByLabel('Como você começa o aviso').fill(salvoIni);
    await pag.getByLabel('Prazo para confirmar').focus();
    await esperar(400);
    ok(await pag.locator('#nao-salvou-saudacao').count() === 0, 'voltar ao texto salvo tira a nota');
    const sobra = await pag.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('escalas:rascunho:')));
    ok(sobra.every(k => !k.endsWith(':saudacao')), 'e apaga o rascunho guardado', sobra.join(', '));
    await pag.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('escalas:rascunho:')) localStorage.removeItem(k); });
    await ctx.close();
  }

  /* ------------------------------ 2. Ajustes: passar sem mexer não grava */
  {
    const ctx = await contexto(1440, 900, false, 300);
    const pag = await ctx.newPage();
    await abrir(pag, '/ajustes?demo=1');
    await pag.getByLabel('Prazo para confirmar').focus();
    for (let i = 0; i < 6; i++) { await pag.keyboard.press('Tab'); await esperar(150); }
    await esperar(1200);
    ok(ctx.gravacoes === 0, 'passar pelos campos com Tab, sem mexer, não grava', `gravações: ${ctx.gravacoes}`);
    ok(await pag.locator('.es-erro-campo').count() === 0, 'nem pinta campo intacto de "não salvou"');
    await ctx.close();
  }

  /* ------------------- 3. Ajustes: seletor, falha e escolha mais nova no ar */
  {
    const ctx = await contexto(1440, 900, false, 3000);
    const pag = await ctx.newPage();
    await abrir(pag, '/ajustes?demo=1');
    const sel = pag.getByLabel('Plantonistas por domingo');
    const salvo = await sel.inputValue();
    const outro = salvo === '2' ? '3' : '2', terceiro = salvo === '0' ? '1' : '0';
    await sel.focus();
    await sel.selectOption(outro);            // t0: falha em t0+3000
    await esperar(1500);
    await sel.selectOption(terceiro);         // t0+1500: falha em t0+4500
    await esperar(2000);                      // t0+3500
    ok(await sel.inputValue() === terceiro, 'a falha da primeira escolha não desfaz a segunda, ainda no ar');
    await esperar(2000);                      // t0+5500
    ok(await sel.inputValue() === salvo, 'quando a última falha, o seletor volta ao valor salvo');
    ok(await pag.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Plantonistas por domingo',
      'e volta com o foco');
    await ctx.close();
  }

  /* ------------------------------------- 4. o link para um dia para no alto */
  for (const [largura, altura, toque, topo] of [[1440, 900, false, 32], [390, 844, true, 72]]) {
    const ctx = await contexto(largura, altura, toque, 0);
    const pag = await ctx.newPage();
    for (const dia of ['2026-10-25', '2026-10-18']) {
      await pag.goto(`${BASE}/escala?demo=1&m=2026-10#d${dia}`, { waitUntil: 'domcontentloaded' });
      await pag.waitForSelector('.es-casca', { timeout: 15000 });
      await esperar(2500);
      const r = await pag.evaluate(id => {
        const e = document.getElementById(id);
        return e ? { topo: Math.round(e.getBoundingClientRect().top), aberto: e.open,
          fim: Math.round(scrollY + innerHeight) >= document.documentElement.scrollHeight - 2 } : null;
      }, 'd' + dia);
      ok(!!r && r.aberto && (Math.abs(r.topo - topo) <= 4 || (r.fim && r.topo < topo + 200)),
        `a ${largura}px, o link #d${dia} abre o dia e para no alto`, JSON.stringify(r));
    }
    await ctx.close();
  }
} catch (e) {
  estado.falhas++; console.log('  ERRO:', String(e).slice(0, 500));
} finally {
  await nav.close();
}

console.log(estado.falhas
  ? `\nescalas-falhas: ${estado.falhas} falha(s) em ${estado.feitas}`
  : `\nescalas-falhas: ${estado.feitas}/${estado.feitas} ok`);
process.exit(estado.falhas ? 1 : 0);
