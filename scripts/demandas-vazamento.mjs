/* O VAZAMENTO MEDIDO NA DIREÇÃO QUE EU TINHA ESQUECIDO.

   `demandas-nao-afetou.mjs` prova um lado: a folha de demandas não alcança o
   sistema de escalas. Este prova o outro: `globals.css` não pode alcançar
   dentro de `/demandas`.

   Ele existe porque o esquecimento custou caro. `globals.css` tem 31
   seletores de ELEMENTO sem classe que pintam alguma coisa — `a`, `button`,
   `input`, `select`, `textarea`, `label`, `h1`, `h2`, `h3`, `b`, `strong` e
   os estados deles. Dois entravam por baixo da casca:

     · `label{text-transform:uppercase;letter-spacing:.12em}` deixava o
       rótulo E o texto de ajuda de TODO campo em caixa alta espaçada. O
       formulário de nova demanda inteiro ficou gritando;
     · `h3::before{content:"›"}` pendurava um chevron em todo título h3.

   Nenhuma medição minha acusava, porque eu só olhava de dentro para fora.

   ---------------------------------------------------------------------------
   POR QUE ESTE TESTE TEM VALORES ESCRITOS À MÃO

   A primeira versão era esperta: percorria todas as regras da página, achava
   as que não mencionam `.dm`, e reprovava quando uma delas casasse com algum
   elemento lá dentro. Ela coletava as 2.967 regras certas, encontrava o
   `label{text-transform:uppercase}` certo — e mesmo assim dava 10/10 verde
   com o defeito na tela. Passei mais tempo tentando depurar o medidor do que
   levaria para escrever o que eu espero ver.

   E tem um problema de fundo, não só de implementação: "regra de fora casa
   com elemento de dentro" NÃO é o mesmo que defeito. `a{text-decoration:
   none}` vem de fora, casa aqui dentro, e é exatamente o que eu quero. Só
   quem sabe distinguir vazamento de coincidência é quem escreveu a folha.

   Então aqui está o que esta folha manda, elemento por elemento, para cada
   tipo que o `globals.css` toca. É mais chato de manter e é verificável: dá
   para provar que o teste reprova quando a defesa sai, e está provado.

   Precisa do app no ar (`scripts/demandas-celular-subir.sh`).
   Roda com `node scripts/demandas-vazamento.mjs`. */

import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://127.0.0.1:3400';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => {
  feitas++;
  if (!c) { falhas++; console.log('  FALHOU:', rot, extra ? ` — ${extra}` : ''); }
};

function chromeDoContainer() {
  const raiz = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(raiz).filter(x => x.startsWith('chromium-'))) {
    const c = `${raiz}/${d}/chrome-linux/chrome`;
    if (existsSync(c)) return c;
  }
  return undefined;
}

/* O QUE ESTA FOLHA MANDA. Uma linha por elemento que o globals.css alcança.
   `prop` é medida no elemento que `onde` encontra dentro da casca. */
const ESPERADO = [
  // o defeito de 19/09: label vinha de fora em caixa alta espaçada
  { rota: '/demandas/nova', onde: '.dm-campo',        prop: 'textTransform', vale: 'none',   por: 'rótulo de campo não é caixa alta' },
  { rota: '/demandas/nova', onde: '.dm-campo',        prop: 'letterSpacing', vale: 'normal', por: 'rótulo de campo sem espaçamento de letra' },
  { rota: '/demandas/nova', onde: '.dm-campo small',  prop: 'textTransform', vale: 'none',   por: 'texto de ajuda não é caixa alta' },
  { rota: '/demandas/nova', onde: '.dm-campo small',  prop: 'letterSpacing', vale: 'normal', por: 'texto de ajuda sem espaçamento de letra' },
  { rota: '/demandas/nova', onde: '.dm-campo small',  prop: 'fontSize',      vale: '12px',   por: 'texto de ajuda no tamanho desta folha' },

  /* CAMPO: A REGRA É "PELO MENOS 16", NÃO "EXATAMENTE 16".

     Esta linha pedia 16px cravado e reprovou com 17px. Fui atrás achando
     defeito e encontrei o contrário: o `globals.css` JÁ TEM a própria
     correção de zoom do iOS, dentro de `@media (max-width:719px)`, com o
     seletor `input:not([type="checkbox"]):not(...)`, que pesa 0-2-1 e ganha
     do meu `.dm input`, de 0-1-1. Ele entrega `max(16px, var(--t-corpo))`,
     que dá 17px.

     17px não dispara o zoom: o gatilho do Safari é ficar ABAIXO de 16. Ou
     seja, o comportamento está certo e quem estava errado era a minha
     expectativa — eu tinha escrito o número em vez da exigência.

     Subir a especificidade aqui só para ganhar de uma regra que já faz a
     coisa certa seria briga de seletor, e deixaria as duas folhas piores.
     Fica como está, e o teste passa a perguntar o que importa. */
  { rota: '/demandas/nova', onde: '.dm-campo input',    prop: 'fontSize', minimo: 16, por: 'campo com 16px ou mais, senão o iOS dá zoom' },
  { rota: '/demandas/nova', onde: '.dm-campo select',   prop: 'fontSize', minimo: 16, por: 'select com 16px ou mais' },
  { rota: '/demandas/nova', onde: '.dm-campo textarea', prop: 'fontSize', minimo: 16, por: 'textarea com 16px ou mais' },

  // títulos: o chevron do globals não entra
  { rota: '/demandas/d/4',  onde: '.dm h3', pseudo: '::before', prop: 'content', vale: 'none', por: 'h3 sem o chevron do outro sistema' },

  // a logo continua branca no preto (o defeito de 18/09, agora com trava)
  { rota: '/demandas',      onde: '.dm-logo', prop: 'color', vale: 'rgb(255, 255, 255)', por: 'logo legível' },
];

const nav = await chromium.launch({ executablePath: chromeDoContainer() });
try {
  const ctx = await nav.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'pt-BR',
  });
  const pag = await ctx.newPage();
  await pag.goto(`${BASE}/demandas?t=tok-admin`, { waitUntil: 'networkidle' });
  await pag.waitForTimeout(600);

  const dentro = await pag.$('.dm-abas a');
  ok(!!dentro, 'a sessão foi reconhecida (senão isto audita o portão)');

  let rotaAtual = '';
  for (const e of ESPERADO) {
    if (e.rota !== rotaAtual) {
      await pag.goto(BASE + e.rota, { waitUntil: 'networkidle' });
      await pag.waitForTimeout(450);
      rotaAtual = e.rota;
    }
    const obtido = await pag.evaluate(({ onde, prop, pseudo }) => {
      const el = document.querySelector(onde);
      if (!el) return '(não achei o elemento)';
      return getComputedStyle(el, pseudo || null)[prop];
    }, { onde: e.onde, prop: e.prop, pseudo: e.pseudo });
    if (e.minimo !== undefined) {
      const n = parseFloat(obtido);
      ok(Number.isFinite(n) && n >= e.minimo, `${e.rota} ${e.onde} — ${e.por}`,
        `esperava >= ${e.minimo}px, veio ${obtido}`);
    } else {
      ok(obtido === e.vale, `${e.rota} ${e.onde}${e.pseudo || ''} — ${e.por}`,
        `esperava ${e.vale}, veio ${obtido}`);
    }
  }
  await ctx.close();
} catch (e) {
  falhas++; console.log('  ERRO:', String(e).slice(0, 400));
} finally {
  await nav.close().catch(() => {});
}

console.log(falhas ? `\nvazamento: ${falhas} falha(s) em ${feitas}` : `\nvazamento: ${feitas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
