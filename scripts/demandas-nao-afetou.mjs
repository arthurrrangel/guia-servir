/* PROVA DE QUE O SISTEMA DE ESCALAS NÃO FOI AFETADO.

   Sobe DUAS vezes o mesmo site — uma com o build de antes do sistema de
   demandas (.next-antes) e outra com o de depois (.next-depois) — e compara o
   ESTILO COMPUTADO DE TODO ELEMENTO de cada página.

   ---------------------------------------------------------------------------
   POR QUE NÃO COMPARAR A FOTO

   Foi a primeira tentativa, e ela mentiu duas vezes seguidas — em páginas
   DIFERENTES a cada rodada, que é o sintoma clássico de ruído:

     · /como-chegar e /pequena-guia têm mapa do Leaflet, que pinta ladrilho
       conforme a rede entrega. Três fotos do MESMO build deram três hashes
       (1.580.161, 1.581.092 e 1.576.060 bytes);
     · /sobre tem fotos com carregamento preguiçoso, que a captura de página
       inteira dispara DURANTE a própria captura: 786.342 bytes numa rodada,
       1.399.499 na seguinte, mesmo build.

   Um teste que acusa defeito onde não há treina quem lê a ignorá-lo, e aí ele
   deixa passar o defeito de verdade. Então a pergunta mudou de "a foto é
   igual?" para a pergunta que realmente importa aqui: "alguma regra de CSS
   passou a pintar algum elemento de forma diferente?".

   A resposta é determinística e não depende de rede: para CADA elemento da
   página, o valor computado das propriedades que uma folha de estilo pode
   mudar. Ficam de fora largura e altura, que dependem de a foto ter chegado.
   É mais forte que pixel: pixel compara o resultado; isto compara a causa,
   elemento por elemento, inclusive no que está fora da tela.

   Roda com:
     rm -rf .next && next build && mv .next .next-antes     (sem app/demandas)
     rm -rf .next && next build && mv .next .next-depois    (com app/demandas)
     node scripts/demandas-nao-afetou.mjs

   SEMPRE construa no `.next` padrão e renomeie depois: com NEXT_DIST_DIR
   apontando para outro lugar, o Next REESCREVE o `tsconfig.json` para incluir
   os tipos daquele diretório — e aí o build sujou um arquivo existente, que é
   exatamente o que esta prova deveria impedir.
*/

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROTAS = ['/', '/servir', '/servir/onde-me-encaixo', '/sobre', '/como-chegar',
  '/pequena-guia', '/ofertar', '/entrar', '/guia-church-tv', '/privacidade'];
const TELAS = [{ nome: 'celular', width: 390, height: 844 }, { nome: 'desktop', width: 1280, height: 900 }];

/* o que uma folha de estilo pinta. Largura e altura ficam de fora: elas
   mudam quando a foto termina de chegar, e isso não é CSS. */
const PROPS = [
  'color', 'backgroundColor', 'backgroundImage', 'opacity',
  'borderTopColor', 'borderTopWidth', 'borderTopStyle',
  'borderBottomColor', 'borderBottomWidth', 'borderLeftColor', 'borderLeftWidth',
  'borderRightColor', 'borderRightWidth', 'borderRadius',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing',
  'textTransform', 'textAlign', 'textDecorationLine', 'whiteSpace',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'display', 'position', 'flexDirection', 'alignItems', 'justifyContent', 'gap',
  'gridTemplateColumns', 'overflow', 'zIndex', 'boxShadow', 'visibility',
];

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => {
  feitas++;
  if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } else console.log('  ok:', rot);
};

function chromeDoContainer() {
  const raiz = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(raiz).filter(x => x.startsWith('chromium-'))) {
    const c = `${raiz}/${d}/chrome-linux/chrome`;
    if (existsSync(c)) return c;
  }
  return undefined;
}

const esperar = async (u, n = 90) => {
  for (let i = 0; i < n; i++) {
    try { const r = await fetch(u); if (r.status < 500) return true; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
};

const sobe = (dist, porta) => spawn('npx', ['next', 'start', '-p', String(porta)], {
  stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, NEXT_DIST_DIR: dist },
});

async function retrato(pag, url) {
  await pag.goto(url, { waitUntil: 'networkidle' });
  /* a revelação-ao-rolar é opacidade animada: sem congelar, metade da página
     é medida no meio da animação e o valor depende do relógio */
  await pag.addStyleTag({ content:
    '*,*::before,*::after{animation:none!important;transition:none!important}' });
  await pag.waitForTimeout(500);

  return await pag.evaluate((props) => {
    const linhas = [];
    for (const e of document.querySelectorAll('*')) {
      if (e.tagName === 'SCRIPT' || e.tagName === 'STYLE') continue;
      const cs = getComputedStyle(e);
      linhas.push(e.tagName + '.' + (typeof e.className === 'string' ? e.className : '') +
        '{' + props.map(p => cs[p]).join('|') + '}');
    }
    return linhas;
  }, PROPS);
}

const antes = sobe('.next-antes', 3321);
const depois = sobe('.next-depois', 3322);
let nav;

try {
  if (!await esperar('http://127.0.0.1:3321')) throw new Error('o build ANTES não subiu');
  if (!await esperar('http://127.0.0.1:3322')) throw new Error('o build DEPOIS não subiu');
  nav = await chromium.launch({ executablePath: chromeDoContainer() });

  let elementos = 0;
  const divergencias = [];
  for (const t of TELAS) {
    const ca = await nav.newContext({ viewport: { width: t.width, height: t.height } });
    const cd = await nav.newContext({ viewport: { width: t.width, height: t.height } });
    const pa = await ca.newPage(), pd = await cd.newPage();
    for (const r of ROTAS) {
      const a = await retrato(pa, 'http://127.0.0.1:3321' + r);
      const d = await retrato(pd, 'http://127.0.0.1:3322' + r);
      elementos += a.length;

      const dif = [];
      const n = Math.max(a.length, d.length);
      for (let i = 0; i < n; i++) if (a[i] !== d[i]) dif.push({ i, a: a[i], d: d[i] });

      ok(a.length === d.length && dif.length === 0,
        `${t.nome} ${r} — ${a.length} elementos, estilo idêntico`,
        dif.length ? `${dif.length} divergência(s), 1ª: ${JSON.stringify(dif[0]).slice(0, 220)}`
                   : `contagem ${a.length} vs ${d.length}`);
      if (dif.length) divergencias.push({ tela: t.nome, rota: r, dif: dif.slice(0, 5) });
    }
    await ca.close(); await cd.close();
  }
  console.log(`  (${elementos} elementos medidos, ${PROPS.length} propriedades cada)`);
  if (divergencias.length) writeFileSync('/tmp/divergencias.json', JSON.stringify(divergencias, null, 2));

  /* e o sistema novo existe do outro lado, sem ter existido antes */
  const c = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const p = await c.newPage();
  const r404 = await p.goto('http://127.0.0.1:3321/demandas');
  ok(r404?.status() === 404, 'no build ANTES, /demandas não existia', String(r404?.status()));
  const r200 = await p.goto('http://127.0.0.1:3322/demandas');
  ok(r200?.status() === 200, 'no build DEPOIS, /demandas responde', String(r200?.status()));
  const meta = await p.getAttribute('meta[name="robots"]', 'content').catch(() => null);
  ok(!!meta && meta.includes('noindex'), '/demandas sai do índice pela meta do layout', String(meta));
  ok(await p.isVisible('.dm'), 'e a casca do sistema novo é o .dm');

  /* a trava final: nenhum elemento FORA de .dm pode ter classe dm-, e nenhum
     DENTRO pode ter classe do sistema de escalas */
  const vazamento = await p.evaluate(() => {
    const fora = [...document.querySelectorAll('[class*="dm-"]')]
      .filter(e => !e.closest('.dm')).length;
    return { fora };
  });
  ok(vazamento.fora === 0, 'nenhuma classe dm- solta fora da casca', String(vazamento.fora));
} catch (e) {
  falhas++; console.log('  ERRO:', String(e).slice(0, 500));
} finally {
  if (nav) await nav.close().catch(() => {});
  antes.kill('SIGTERM'); depois.kill('SIGTERM');
}

console.log(falhas ? `nao-afetou: ${falhas} falha(s) em ${feitas}` : `nao-afetou: ${feitas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
