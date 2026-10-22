/* =============================================================================
   AUDITORIA · OS VÍDEOS QUE TOCAM SOZINHOS PODEM PARAR (22/10/2026)

   WCAG 2.2.2 (nível A): o que se mexe sozinho por mais de cinco segundos, ao
   lado de outro conteúdo, precisa de um jeito de pausar. Os vídeos do site
   são laços sem som (o domingo da home, o "ao vivo" do /cultos, o abraço e
   os círculos do Guia Servir, os heróis do /onde-me-encaixo e do /acessar).
   Em cada página, no celular e no computador, com movimento:

     1. todo vídeo que toca tem o botão "Pausar os vídeos" na mesma cena (o
        círculo de baixo divide o botão com o de cima), visível (o ponto do
        meio é o próprio botão), com 44 px e sem cobrir texto;
     2. o clique para todos os vídeos da página e o botão fica pressionado;
     3. recarregar mantém tudo parado (a escolha vale até fechar a aba);
     4. pelo teclado (foco no botão, com a marca de foco, e Enter) solta todos;
     5. com "reduzir movimento", nenhum vídeo toca e não há botão.

     PORTA=3800 node scripts/auditoria-videos.mjs
   Sai com 1 se algum caso falhar.
   ============================================================================= */
import { chromium } from 'playwright';
import { rotear } from './_rpc-mock.mjs';
const B = `http://localhost:${process.env.PORTA || 3700}`;
const ROTAS = ['/', '/cultos', '/servir', '/servir/onde-me-encaixo', '/acessar'];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let ruins = 0;
const res = (ok, txt) => { if (!ok) ruins++; console.log(`${ok ? 'ok ' : 'MAL'} ${txt}`); };

/* rola até cada vídeo para ele baixar (eles só baixam perto da tela) e espera tocar */
async function acordar(p) {
  const n = await p.evaluate(() => document.querySelectorAll('video').length);
  for (let i = 0; i < n; i++) {
    await p.evaluate(i => { document.documentElement.style.scrollBehavior = 'auto'; const v = document.querySelectorAll('video')[i]; v.scrollIntoView({ block: 'center' }); }, i);
    await p.waitForTimeout(900);
  }
  return n;
}
const estado = p => p.evaluate(() => [...document.querySelectorAll('video')].map(v => ({ src: !!v.currentSrc, tocando: !v.paused && v.readyState > 2, parado: v.paused })));

for (const [W, H] of [[390, 844], [1440, 900]]) for (const rota of ROTAS) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: W < 760, hasTouch: W < 1000, reducedMotion: 'no-preference' });
  await ctx.route('**', r => rotear(r, B));
  const p = await ctx.newPage();
  await p.goto(B + rota, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(600);
  const n = await acordar(p);
  const e0 = await estado(p);
  const tocando = e0.filter(v => v.tocando).length;
  /* 1. cada cena que toca tem o botão, visível e sem cobrir texto */
  const cenas = await p.evaluate(() => [...document.querySelectorAll('video')].map(v => {
    const cena = v.closest('.s-circs') || v.parentElement;
    const bt = cena.querySelector('.s-video-pausa');
    if (!bt) return { tem: false };
    bt.scrollIntoView({ block: 'center' });
    const r = bt.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const el = document.elementFromPoint(x, y);
    /* texto da cena por baixo do botão */
    const textos = [...cena.querySelectorAll('h1, h2, p, a, .s-pil, .s-chapeu')].filter(t => { const q = t.getBoundingClientRect(); return q.width && q.height && q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top; });
    return { tem: true, visivel: !!el && (el === bt || bt.contains(el)), tam: `${Math.round(r.width)}x${Math.round(r.height)}`, cobre: textos.map(t => t.textContent.trim().slice(0, 24)) };
  }));
  const semBotao = cenas.filter(c => !c.tem).length, invis = cenas.filter(c => c.tem && !c.visivel).length, cobrindo = cenas.filter(c => c.tem && c.cobre.length);
  const pequenos = cenas.filter(c => c.tem && c.tam !== '44x44').length;
  /* 2. o clique para todos */
  const bt = p.locator('.s-video-pausa').first();
  let parouTodos = false, pressionado = null, manteve = false, soltou = false, marca = false;
  if (await bt.count()) {
    await bt.click(); await p.waitForTimeout(500);
    const e1 = await estado(p);
    parouTodos = e1.every(v => v.parado);
    pressionado = await bt.getAttribute('aria-pressed');
    /* 3. recarregar mantém parado */
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(600);
    await acordar(p);
    const e2 = await estado(p);
    const bt2 = p.locator('.s-video-pausa').first();
    manteve = e2.every(v => v.parado) && (await bt2.count()) > 0 && (await bt2.getAttribute('aria-pressed')) === 'true';
    /* 4. pelo teclado: foco no botão (com a marca) e Enter solta todos (os que estão na tela tocam) */
    await bt2.scrollIntoViewIfNeeded(); await bt2.focus();
    marca = await bt2.evaluate(e => { const c = getComputedStyle(e); return e === document.activeElement && c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0; });
    await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
    const e3 = await estado(p);
    soltou = e3.some(v => v.tocando) && (await bt2.getAttribute('aria-pressed')) === 'false';
  }
  const ok = n > 0 && tocando > 0 && !semBotao && !invis && !cobrindo.length && !pequenos && parouTodos && pressionado === 'true' && manteve && soltou && marca;
  res(ok, `${W} ${rota}: ${n} vídeo(s), ${tocando} tocando; botão em ${cenas.length - semBotao}/${cenas.length} cena(s)${invis ? `, ${invis} ESCONDIDO(S)` : ''}${pequenos ? `, ${pequenos} FORA DE 44px` : ''}${cobrindo.length ? `, COBRE TEXTO: ${cobrindo.map(c => c.cobre.join('/')).join('; ')}` : ''}; clique ${parouTodos ? 'para todos' : 'NÃO PARA TODOS'} (aria-pressed ${pressionado}); recarregar ${manteve ? 'mantém parado' : 'NÃO MANTÉM'}; teclado (foco ${marca ? 'com marca' : 'SEM MARCA'} + Enter) ${soltou ? 'solta' : 'NÃO SOLTA'}`);
  await ctx.close();
}
/* 5. reduzir movimento: nada toca, nenhum botão */
for (const rota of ROTAS) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await ctx.route('**', r => rotear(r, B));
  const p = await ctx.newPage();
  await p.goto(B + rota, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(600); await acordar(p);
  const r = await p.evaluate(() => ({ tocando: [...document.querySelectorAll('video')].filter(v => !v.paused).length, botoes: document.querySelectorAll('.s-video-pausa').length }));
  res(r.tocando === 0 && r.botoes === 0, `reduzir movimento ${rota}: ${r.tocando} tocando, ${r.botoes} botão(ões)`);
  await ctx.close();
}
await b.close();
console.log(ruins ? `\n${ruins} caso(s) com problema nos vídeos` : '\ntodo vídeo que toca pode parar');
process.exit(ruins ? 1 : 0);
