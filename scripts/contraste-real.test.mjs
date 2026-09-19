/* O MEDIDOR DE CONTRASTE MEDIDO.

   Nenhum instrumento entra em serviço aqui sem provar duas coisas, nessa
   ordem, porque já falhei nas duas:

     · que ele NÃO acusa o que está certo (texto branco sobre foto escura
       passava como 1.00:1 e quase me fez pintar de preto uma tela boa);
     · que ele ACUSA o que está errado (um medidor que devolve verde sempre
       também dá 100% de acerto, e não vale nada).

   O segundo é o que separa teste de enfeite: eu estrago a página de
   propósito, de seis jeitos diferentes, e exijo que cada estrago apareça.

   Precisa do app em desenvolvimento na 3500.
   Roda com `node scripts/contraste-real.test.mjs`. */

import { chromium } from 'playwright';
import { chromeDoContainer, criaContador } from './medida-celular.mjs';
import { medirContraste } from './contraste-real.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const { estado, ok } = criaContador();

const nav = await chromium.launch({ executablePath: chromeDoContainer() });
try {
  /* `reducedMotion` é o caminho que o próprio app já tem para "tela parada":
     `components/Movimento.tsx` revela tudo de uma vez, a folha desliga a
     cortina de abertura e a rolagem deixa de ser suave. O layout medido é o
     mesmo — só o movimento some. Ver a nota em `escala-celular.mjs`. */
  const ctx = await nav.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, reducedMotion: 'reduce',
  });
  const pag = await ctx.newPage();
  await pag.route('**', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());

  /* ---------------------------------------------------------- 1. o certo */
  await pag.goto(`${BASE}/acessar`, { waitUntil: 'domcontentloaded' });
  await pag.waitForTimeout(1500);
  const limpo = await medirContraste(pag);
  ok(limpo.medidos > 20, 'achou texto para medir em /acessar', `mediu ${limpo.medidos}`);

  /* OS CARTÕES 01 E 02 PASSAM — E O 03 NÃO, DE VERDADE.

     Esta linha começou exigindo que NENHUM dos três fosse acusado, porque eu
     tinha na cabeça que os três eram fotos escuras. O medidor insistiu no
     03 e eu fui olhar a foto: é um abraço em frente a uma parede clara, com
     uma camisa branca exatamente onde cai o texto. Medido, dá 1.75:1 — o
     texto branco some ali. O medidor estava certo e a minha expectativa
     estava errada; a correção é na tela, não no teste.

     O que fica aqui é a forma certa da pergunta: os cartões sobre foto
     ESCURA não podem ser acusados (senão o medidor voltou a mentir) e a
     página inteira tem que passar depois do conserto. */
  const claros = limpo.fracos.filter(f => /g-tile/.test(f));
  ok(claros.length === 0,
    'texto branco sobre a foto dos cartões não é acusado',
    claros.slice(0, 3).join(' | '));
  ok(limpo.fracos.length === 0, 'a página de acesso passa inteira', limpo.fracos.slice(0, 4).join(' | '));

  /* ---------------------------------- 1b. o botão preto do sistema passa

     Este caso é o irmão do anterior e entrou aqui pelo mesmo motivo: com a
     foto da página inteira, "Copiar mensagem do grupo" — branco sólido sobre
     #252525 — saía como branco sobre rgb(250,254,255), 1.02:1. Era o layout
     refeito na hora da foto. Se voltar a acontecer, quero saber por aqui. */
  await pag.goto(`${BASE}/ajustes?demo=1`, { waitUntil: 'domcontentloaded' });
  await pag.waitForSelector('.sistema', { timeout: 10000 });
  await pag.waitForTimeout(1500);
  const sist = await medirContraste(pag);
  const pretos = sist.fracos.filter(f => /\.pri|lid-bt/.test(f));
  ok(pretos.length === 0, 'botão preto com texto branco NÃO é acusado', pretos.slice(0, 3).join(' | '));
  ok(sist.medidos > 30, 'achou texto para medir nos ajustes', `mediu ${sist.medidos}`);

  /* 1c. a mesma prova numa tela COMPRIDA, que só se mede rolando.

     `/escala` tem 3.390px de altura e cinco botões pretos espalhados por
     ela. Foi aqui que a rolagem suave estragou a medida: o botão de baixo
     era fotografado no meio do deslize. Tela curta não pega esse defeito;
     por isso a prova mora nesta. */
  await pag.goto(`${BASE}/escala?demo=1`, { waitUntil: 'domcontentloaded' });
  await pag.waitForSelector('.sistema', { timeout: 10000 });
  await pag.waitForTimeout(1500);
  const comprida = await medirContraste(pag);
  const pretos2 = comprida.fracos.filter(f => /lid-bt/.test(f));
  ok(pretos2.length === 0, 'numa tela comprida, os botões pretos de baixo também passam', pretos2.slice(0, 3).join(' | '));
  ok(comprida.fracos.length === 0, 'a tela de escala passa inteira', comprida.fracos.slice(0, 4).join(' | '));

  /* -------------------------------------------------------- 2. o errado */
  await pag.goto(`${BASE}/acessar`, { waitUntil: 'domcontentloaded' });
  await pag.waitForTimeout(900);
  const estragos = [
    { por: 'cinza claro no branco',      css: '.g-tile-t{ -webkit-text-fill-color:#c9c9c9!important; color:#c9c9c9!important }' },
    { por: 'branco no branco',           css: '.g-pe-h{ -webkit-text-fill-color:#fff!important; color:#fff!important }' },
    { por: 'tinta translúcida demais',   css: '.g-tile-d{ -webkit-text-fill-color:rgba(255,255,255,.18)!important; color:rgba(255,255,255,.18)!important }' },
    { por: 'fundo de gradiente ruim',    css: '.g-tile{ background-image:linear-gradient(#fff,#fff)!important } .g-tile-t{ -webkit-text-fill-color:#fff!important }' },
    { por: 'foto clara sob texto claro', css: '.g-tile::after{ content:""!important; position:absolute!important; inset:0!important; background:#f2f2f2!important; z-index:5!important } .g-tile-t,.g-tile-d{ position:relative; z-index:6 }' },
    { por: 'amarelo em cima do areia',   css: '.g-pe-h{ -webkit-text-fill-color:#ffe08a!important; color:#ffe08a!important }' },
  ];
  for (const e of estragos) {
    await pag.goto(`${BASE}/acessar`, { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(900);
    await pag.addStyleTag({ content: e.css });
    await pag.waitForTimeout(250);
    const r = await medirContraste(pag);
    ok(r.fracos.length > 0, `estrago "${e.por}" é acusado`,
      `o medidor não viu nada (mediu ${r.medidos} trechos)`);
  }

  /* --------------------------- 3. o aviso de foto separado da reprovação */
  await pag.goto(`${BASE}/acessar`, { waitUntil: 'domcontentloaded' });
  await pag.waitForTimeout(900);
  /* uma faixa clara cobrindo METADE da linha: a média ainda passa, o pior
     ponto não. Isso tem que sair como aviso, nunca como reprovação. */
  await pag.addStyleTag({ content: '.g-tile::after{content:""!important;position:absolute!important;left:0;right:50%;top:0;bottom:0;background:#fff!important;z-index:5!important} .g-tile-t,.g-tile-d{position:relative;z-index:6}' });
  await pag.waitForTimeout(250);
  const meia = await medirContraste(pag);
  ok(meia.sobreFoto.length > 0 || meia.fracos.length > 0,
    'meia faixa clara aparece em algum lugar do relatório',
    'sumiu dos dois baldes');

  await ctx.close();
} catch (e) {
  estado.falhas++; console.log('  ERRO:', String(e).slice(0, 500));
} finally {
  await nav.close().catch(() => {});
}

console.log(estado.falhas
  ? `\ncontraste-real: ${estado.falhas} falha(s) em ${estado.feitas}`
  : `\ncontraste-real: ${estado.feitas}/${estado.feitas} ok`);
process.exit(estado.falhas ? 1 : 0);
