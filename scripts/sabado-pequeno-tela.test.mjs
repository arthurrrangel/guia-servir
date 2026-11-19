/* O SÁBADO PEQUENO, NA TELA — 19/11/2026.

   A regra está em scripts/sabado-pequeno.test.mjs; esta bateria confere o
   que o líder vê, no app de desenvolvimento com o Supabase FALSO (toda
   gravação falha, que é o caso que interessa para "não mentir"):
     · o cartão do sábado pequeno: a escolha no topo, "só foto e filmagem" na
       linha fechada e só os postos da escala pequena;
     · "Mandar nos grupos": o geral diz que é só foto e filmagem, o grupo
       misto diz o posto dele que não serve, o grupo sem posto recebe uma
       linha escrita (com o botão do WhatsApp levando exatamente ela);
     · o sábado completo montado: passar para o pequeno pergunta antes, com
       nome e posto de quem sai, e voltar não muda nada;
     · a gravação que falha deixa o sábado como estava, com o aviso;
     · domingo não tem a escolha;
     · os Ajustes: ligado (`?demo=sabado`) e desligado (`?demo=1`, com FOTO e
       FILMAGEM já marcados para ligar).
   Roda com BASE=http://127.0.0.1:3500 node scripts/sabado-pequeno-tela.test.mjs */
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';
import { cultosQueVem, diaDaSemana, mesDe } from './dias-do-demo.mjs';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const OUT = '/tmp/sabado-pequeno-tela';
mkdirSync(OUT, { recursive: true });
const esperar = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0, feitas = 0;
const ok = (c, nome, extra = '') => { feitas++; if (!c) falhas++; console.log(`  ${c ? 'ok ' : 'FALHOU'} ${nome}${!c && extra ? '\n      ' + extra : ''}`); };
const nav = await chromium.launch({ executablePath: chromeDoContainer() });
async function ctx(w, h, toque) {
  const c = await nav.newContext({ viewport: { width: w, height: h }, isMobile: toque, hasTouch: toque, deviceScaleFactor: 2 });
  await c.route('**', r => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
  return c;
}
/* o demo monta os sábados deste mês e do próximo; `?demo=sabado` deixa o
   primeiro que vem pequeno e os outros montados completos */
const sabados = cultosQueVem.filter(d => diaDaSemana(d) === 6);
const [SAB1, SAB2] = sabados;
const DOM = cultosQueVem.find(d => diaDaSemana(d) === 0 && d > SAB1);
const aberto = async (p, d) => {
  const card = p.locator(`#d${d}`);
  if (await card.getAttribute('open') === null) await card.locator(':scope > summary').click();
  await esperar(300);
  return card;
};
try {
  for (const [w, h, toque, nome] of [[1440, 900, false, '1440'], [390, 844, true, '390']]) {
    const c = await ctx(w, h, toque); const p = await c.newPage();
    const erros = []; p.on('pageerror', e => erros.push(String(e)));

    /* 1. o sábado pequeno */
    await p.goto(`${BASE}/escala?demo=sabado&m=${mesDe(SAB1)}#d${SAB1}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.es-casca', { timeout: 30000 }); await esperar(2500);
    const d1 = await aberto(p, SAB1);
    ok(/só foto e filmagem/.test(await d1.locator(':scope > summary').innerText()), `${nome}: a linha fechada diz "só foto e filmagem"`);
    ok(await d1.locator('.es-ec-formato button[aria-pressed="true"]').innerText() === 'Só foto e filmagem', `${nome}: a escolha marcada é "Só foto e filmagem"`);
    const postos = await d1.locator('.es-ec-postos .es-ec-fn').allInnerTexts();
    ok(postos.join('|') === 'FOTO|FILMAGEM|Plantão', `${nome}: só FOTO e FILMAGEM (e o plantão)`, postos.join('|'));
    await d1.screenshot({ path: `${OUT}/${nome}-sabado-pequeno.png` });

    /* 2. mandar nos grupos */
    await d1.getByRole('button', { name: 'Mandar nos grupos' }).click(); await esperar(500);
    const textos = await d1.locator('.es-mg-linha').evaluateAll(ls => ls.map(l => ({
      nome: l.querySelector('.es-mg-tit b')?.textContent || '',
      href: decodeURIComponent((l.querySelector('a.es-btn')?.getAttribute('href') || '').split('?text=')[1] || ''),
    })));
    const de = n => textos.find(t => t.nome === n)?.href || '';
    ok(de('Grupo geral').includes('Neste sábado vamos precisar só de foto e filmagem.'), `${nome}: o geral diz que é só foto e filmagem`);
    ok(!de('Grupo geral').includes('PROJEÇÃO'), `${nome}: o geral não lista os outros postos`);
    const linha = de('Mídia · Projeção e luz');
    ok(/^Bo[am] (dia|tarde|noite) galera! Neste sábado \(\d\d\/\d\d\) o Follow vai ter só foto e filmagem: não vamos precisar de PROJEÇÃO e ILUMINAÇÃO\.$/.test(linha),
      `${nome}: Projeção e luz recebe a linha escrita, e só ela`, linha);
    ok(de('Mídia · Foto e vídeo').includes('Neste sábado não vamos precisar de EDIÇÃO.'), `${nome}: o grupo misto diz o posto dele que não serve`);
    ok(/não serve neste sábado/.test(await d1.locator('.es-mg-linha').nth(1).innerText()), `${nome}: a linha do grupo explica que vai só a linha`);
    await d1.locator('.es-mg').screenshot({ path: `${OUT}/${nome}-mandar.png` });

    /* 3. o sábado completo montado: perguntar antes, voltar não muda nada */
    const d2 = await aberto(p, SAB2);
    ok(await d2.locator('.es-ec-formato button[aria-pressed="true"]').innerText() === 'Escala completa', `${nome}: o sábado montado continua completo`);
    const antes = await d2.locator('.es-ec-postos .es-ec-fn').count();
    await d2.locator('.es-ec-formato button').nth(1).click(); await esperar(500);
    const dlg = p.locator('dialog[open]');
    const pergunta = (await dlg.count()) ? await dlg.innerText() : '';
    ok(/Só foto e filmagem em/.test(pergunta) && /Saem? da escala: .+\((PROJEÇÃO|ILUMINAÇÃO|EDIÇÃO)/.test(pergunta), `${nome}: pergunta antes, com nome e posto de quem sai`, pergunta.replace(/\s+/g, ' '));
    await p.keyboard.press('Escape'); await esperar(400);
    ok(await d2.locator('.es-ec-formato button[aria-pressed="true"]').innerText() === 'Escala completa'
      && await d2.locator('.es-ec-postos .es-ec-fn').count() === antes, `${nome}: voltar não muda nada`);

    /* 4. a gravação falha: o sábado fica como estava, e a tela avisa */
    await d1.locator('.es-ec-formato button').nth(0).click(); await esperar(2500);
    ok(await d1.locator('.es-ec-formato button[aria-pressed="true"]').innerText() === 'Só foto e filmagem', `${nome}: sem banco, continua pequeno`);
    ok(/conexão|salvar|internet/i.test(await p.locator('body').innerText()), `${nome}: e a tela avisa que não salvou`);

    /* 5. domingo não tem a escolha */
    if (DOM) ok(await p.locator(`#d${DOM} .es-ec-formato`).count() === 0, `${nome}: domingo sem a escolha`);

    /* 6. os Ajustes */
    await p.goto(`${BASE}/ajustes?demo=sabado#sabado`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#sabado', { timeout: 30000 }); await esperar(1500);
    const lig = p.locator('#sabado');
    ok((await lig.locator('.es-gz-fn[aria-pressed="true"]').allInnerTexts()).map(t => t.trim()).join('|') === 'FOTO|FILMAGEM', `${nome}: Ajustes ligado com FOTO e FILMAGEM`);
    ok(/^Ligado\. O sábado novo nasce só com foto e filmagem\./.test((await lig.locator('[role="status"]').innerText()).trim()), `${nome}: Ajustes diz que está ligado`);
    await lig.screenshot({ path: `${OUT}/${nome}-ajustes-ligado.png` });
    await p.goto(`${BASE}/ajustes?demo=1#sabado`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#sabado', { timeout: 30000 }); await esperar(1500);
    const des = p.locator('#sabado');
    ok((await des.locator('.es-gz-fn[aria-pressed="true"]').allInnerTexts()).map(t => t.trim()).join('|') === 'FOTO|FILMAGEM', `${nome}: desligado, FOTO e FILMAGEM já vêm marcados`);
    ok(await des.getByRole('button', { name: 'Ligar o sábado pequeno' }).isEnabled(), `${nome}: o botão de ligar está ativo`);
    await des.screenshot({ path: `${OUT}/${nome}-ajustes-desligado.png` });

    ok(!erros.length, `${nome}: nenhum erro de página`, erros.join(' | '));
    await c.close();
  }
} finally { await nav.close(); }
console.log(`sabado-pequeno-tela: ${feitas - falhas}/${feitas} ok`);
if (falhas) process.exit(1);
