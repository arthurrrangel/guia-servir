/* =============================================================================
   AUDITORIA · A PRIMEIRA TELA (21/10/2026)

   O que cada página mostra sem rolar, como o navegador mostra de verdade: nos
   iPhones com Safari 26 a barra flutuante cobre o pé da tela (100svh é a tela
   inteira, innerHeight é o que se vê), então o teste simula isso; e nos
   outros aparelhos, a janela inteira. Com e sem "reduzir movimento".

   · herói que anda com o scroll e abre no pouso (home, /cultos, Guia Servir,
     Guia Follow): chapéu, título, linha, todas as pílulas e a nota, inteiros
     e acima da barra, e o pouso clicável (sem `inert`);
   · herói de foto (as outras páginas): o título e a primeira pílula.

   Pedido do Arthur (21/10/2026): "na primeira tela da home, sem rolar, deixe
   claro o que é a GUIA e onde fica, o horário do culto principal e um convite
   explícito para visitar, com acesso rápido a como chegar ou tirar dúvidas",
   respeitando a área visível do Safari; o mesmo vale para a porta de cada site.

     PORTA=3700 node scripts/auditoria-primeira-tela.mjs [--capturas] [--telas=iPad,Notebook] [/rota ...]
   ============================================================================= */
import { chromium } from 'playwright';
import { rotear, ROTAS_SITE } from './_rpc-mock.mjs';
import { mkdirSync } from 'node:fs';

const arg = process.argv.slice(2);
const B = `http://localhost:${process.env.PORTA || 3000}`;
const CAP = arg.includes('--capturas');
const rotasArg = arg.filter(a => a.startsWith('/'));
const ROTAS = rotasArg.length ? rotasArg : ROTAS_SITE.filter(r => !r.includes('nao-existe'));
const D = 'tmp/primeira-tela/';
if (CAP) mkdirSync(D, { recursive: true });
/* nome, largura, altura da janela (100svh), altura que se vê */
const TELAS = [['Pro Max iOS 26', 440, 956, 800], ['iPhone 17 iOS 26', 402, 874, 718], ['iPhone SE iOS 26', 375, 667, 553], ['iPhone 14 iOS 18', 390, 664, 664], ['Android', 360, 740, 740], ['iPad retrato', 820, 1180, 1180], ['iPad deitado', 1180, 820, 820], ['Notebook 1366', 1366, 657, 657], ['MacBook 1440', 1440, 760, 760], ['Monitor', 1920, 1080, 1080]];
/* os dois notebooks com a página que se vê de verdade: 1366 x 768 menos a barra
   de tarefas e a do navegador (~657); o MacBook de 1440 x 900 menos a barra de
   menus, a do navegador e o Dock (~760) */
const tArg = arg.find(a => a.startsWith('--telas='));
const filtro = tArg ? tArg.split('=')[1].split(',') : null;
const nav = await chromium.launch();
let ruins = 0;
for (const [nome, W, H, V] of TELAS.filter(t => !filtro || filtro.some(f => t[0].includes(f)))) for (const modo of ['no-preference', 'reduce']) {
  const toque = W <= 1180;
  const ctx = await nav.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: CAP ? 2 : 1, isMobile: W < 800, hasTouch: toque, reducedMotion: modo });
  if (V !== H) await ctx.addInitScript(v => { Object.defineProperty(window, 'innerHeight', { get: () => v, configurable: true }); }, V);
  await ctx.route('**', r => rotear(r, B));
  for (const rota of ROTAS) {
    const p = await ctx.newPage();
    await p.goto(B + rota, { waitUntil: 'networkidle' }).catch(() => {});
    await p.waitForTimeout(1200);
    const r = await p.evaluate((V) => {
      const vis = e => { if (!e) return false; const q = e.getBoundingClientRect(); if (!q.height || q.bottom > V - 8 || q.top < 56) return false; let o = 1; for (let a = e; a && a !== document.body; a = a.parentElement) o *= +getComputedStyle(a).opacity; return o > .9; };
      const txt = e => e ? e.textContent.replace(/\s+/g, ' ').trim() : '';
      const pouso = document.querySelector('.s-scrub-faixa.pouso.primeiro');
      if (pouso) {
        const ch = pouso.querySelector('.s-chapeu'), h1 = pouso.querySelector('h1'), sub = pouso.querySelector('.s-scrub-sub'), micro = pouso.querySelector('.s-micro');
        const itens = [['chapéu', ch], ['título', h1], ['linha', sub], ['nota', micro], ...[...pouso.querySelectorAll('.s-pil')].map(e => ['pílula ' + txt(e), e])].filter(([, e]) => e && txt(e));
        return { tipo: 'pouso', inerte: pouso.hasAttribute('inert'), falta: itens.filter(([, e]) => !vis(e)).map(([k]) => k), fundo: Math.round(Math.max(...itens.map(([, e]) => e.getBoundingClientRect().bottom))) };
      }
      const h = document.querySelector('main > .s-heroi, main > section');
      const h1 = h?.querySelector('h1'), pil = h?.querySelector('.s-pil');
      const itens = [['título', h1], ['pílula', pil]].filter(([, e]) => e);
      return { tipo: 'herói', inerte: false, falta: itens.filter(([, e]) => !vis(e)).map(([k]) => k), fundo: Math.round(Math.max(0, ...itens.map(([, e]) => e.getBoundingClientRect().bottom))) };
    }, V);
    const prob = [...(r.inerte ? ['pouso inerte'] : []), ...r.falta];
    if (prob.length) ruins++;
    console.log(`${nome.padEnd(17)} ${modo === 'reduce' ? 'parado ' : 'movendo'} ${rota.padEnd(24)} ${r.tipo.padEnd(6)} até ${String(r.fundo).padStart(4)}/${V}${prob.length ? '  !! fora: ' + prob.join(', ') : '  ok'}`);
    if (CAP && modo === 'no-preference') await p.screenshot({ path: `${D}${W}${rota.replace(/\//g, '_') || '_'}.png`, clip: { x: 0, y: 0, width: W, height: V } });
    await p.close();
  }
  await ctx.close();
}
await nav.close();
console.log(ruins ? `\n${ruins} primeira(s) tela(s) incompleta(s)` : '\ntodas as primeiras telas completas');
process.exit(ruins ? 1 : 0);
