/* =============================================================================
   AUDITORIA · COLISÕES (21/10/2026)

   Texto em cima de texto, e texto fora da tela, em todas as páginas dos três
   sites e em doze larguras (do Android de 360 ao monitor de 1920). Mede as
   caixas de cada linha de texto (Range.getClientRects), do topo da maiúscula
   ao pé da descendente; descarta o que não se vê (opacidade 0, visibility
   hidden, display none, recortado por um pai com overflow) e acusa duas linhas
   de elementos diferentes que se cruzam mais de 3 px nos dois eixos. Com
   movimento reduzido: tudo no estado final. Foi ela que achou "Pequenas Guias"
   em cima de "Terça a quinta" na agenda do /eventos, de 760 a 1920 px.

     PORTA=3700 node scripts/auditoria-colisoes.mjs [--larguras=360,1440] [/rota ...]
   ============================================================================= */
import { chromium } from 'playwright';
import { rotear, rolarTudo, ROTAS_SITE } from './_rpc-mock.mjs';
const arg = process.argv.slice(2);
const B = arg.find(a => a.startsWith('http')) || `http://localhost:${process.env.PORTA || 3000}`;
const lArg = arg.find(a => a.startsWith('--larguras='));
const LARGURAS = lArg ? lArg.split('=')[1].split(',').map(Number) : [360, 390, 440, 600, 760, 820, 900, 1000, 1180, 1280, 1440, 1920];
const rotasArg = arg.filter(a => a.startsWith('/'));
const ROTAS = rotasArg.length ? rotasArg : ROTAS_SITE;
const b = await chromium.launch();
let total = 0, esgotadas = 0;
const t0 = Date.now();
console.log(`${ROTAS.length} rotas x ${LARGURAS.length} larguras (${LARGURAS.join(', ')}): uma linha por página`);
for (const W of LARGURAS) {
  const ctx = await b.newContext({ viewport: { width: W, height: W < 760 ? 800 : 900 }, isMobile: W < 760, hasTouch: W <= 1180, reducedMotion: 'reduce' });
  await ctx.route('**', r => rotear(r, B));
  for (const rota of ROTAS) {
    const p = await ctx.newPage();
    const inicio = Date.now();
    const pagina = (async () => {
    await p.goto(B + rota, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(300); await rolarTudo(p); await p.waitForTimeout(250);
    const r = await p.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const caixas = [];
      const andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const fixo = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e).position; if (s === 'fixed' || s === 'sticky') return true; } return false; };
      const recorte = el => { /* o retângulo visível: a interseção dos que cortam,
           22/10/2026: a começar pelo próprio elemento do texto (o ponto escondido do
           endereço, .s-sep, tem altura 0 e overflow hidden; o rótulo só para leitor
           de tela tem 1 px e clip), e não só pelos pais */
        let x0 = -1e9, y0 = -1e9, x1 = 1e9, y1 = 1e9;
        for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
          const s = getComputedStyle(e);
          if (s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)') return [0, 0, 0, 0];
          if (/(hidden|clip|auto|scroll)/.test(s.overflowX + s.overflowY)) { const q = e.getBoundingClientRect(); x0 = Math.max(x0, q.left); y0 = Math.max(y0, q.top); x1 = Math.min(x1, q.right); y1 = Math.min(y1, q.bottom); }
        }
        return [x0, y0, x1, y1];
      };
      const rolaDeLado = el => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (/(auto|scroll)/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 2) return true; } return false; };
      let n;
      const cache = new Map();
      while ((n = andar.nextNode())) {
        if (!n.textContent.trim()) continue;
        const el = n.parentElement;
        if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION)$/.test(el.tagName)) continue;
        if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
        if (el.closest('[aria-hidden="true"]') && !el.closest('.s-sede, .s-arroba')) continue;
        let info = cache.get(el);
        if (!info) { info = { fixo: fixo(el), corte: recorte(el), lado: rolaDeLado(el) }; cache.set(el, info); }
        if (info.fixo) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const q of rg.getClientRects()) {
          if (q.width < 2 || q.height < 2) continue;
          const [x0, y0, x1, y1] = info.corte;
          const L = Math.max(q.left, x0), T = Math.max(q.top, y0), R = Math.min(q.right, x1), Bt = Math.min(q.bottom, y1);
          if (R - L < 2 || Bt - T < 2) continue;      /* recortado: não se vê */
          const h = Bt - T; /* a caixa da linha é a área do tipo (ascendente + descendente, ~1,2 em): o olho vê do topo da maiúscula ao pé da descendente, ~15 % abaixo do topo e ~5 % acima do pé */
          caixas.push({ el, l: L, t: T + h * .15 + scrollY, r: R, b: Bt - h * .05 + scrollY, txt: n.textContent.trim().slice(0, 40), lado: info.lado });
        }
      }
      const nome = el => (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''));
      const ach = [];
      caixas.sort((a, b) => a.t - b.t);
      for (let i = 0; i < caixas.length; i++) {
        const a = caixas[i];
        for (let j = i + 1; j < caixas.length && caixas[j].t < a.b; j++) {
          const c = caixas[j];
          if (a.el === c.el || a.el.contains(c.el) || c.el.contains(a.el)) continue;
          /* 22/10/2026: as linhas do mesmo título não colidem entre si. O título de
             tela tem a entrelinha apertada de propósito (0,95, a segunda voz em serifa
             itálica), e as caixas da fonte de uma linha e da outra se encostam uns
             3 px sem nenhuma letra tocar a outra (o herói parado ficou fora do
             position:sticky, que a auditoria pula, e passou a ser medido) */
          const tit = a.el.closest('h1,h2,h3');
          if (tit && tit === c.el.closest('h1,h2,h3')) continue;
          const dx = Math.min(a.r, c.r) - Math.max(a.l, c.l), dy = Math.min(a.b, c.b) - Math.max(a.t, c.t);
          if (dx > 3 && dy > 3) ach.push(`"${a.txt}" (${nome(a.el)}) × "${c.txt}" (${nome(c.el)}) em ${Math.round(Math.max(a.l, c.l))},${Math.round(Math.max(a.t, c.t))}`);
        }
      }
      const fora = caixas.filter(c => !c.lado && (c.r > vw + 1 || c.l < -1)).map(c => `fora da tela: "${c.txt}" (${nome(c.el)}) ${Math.round(c.l)}–${Math.round(c.r)} de ${vw}`);
      return [...new Set(ach)].concat([...new Set(fora)]);
    });
    return r;
    })();
    const r = await Promise.race([pagina, new Promise(res => setTimeout(() => res(null), 120000))]);
    const seg = ((Date.now() - inicio) / 1000).toFixed(1);
    if (r === null) { esgotadas++; console.log(`${String(W).padStart(4)} ${rota.padEnd(26)} TEMPO ESGOTADO (120 s)`); }
    else if (r.length) { total += r.length; console.log(`${String(W).padStart(4)} ${rota.padEnd(26)} ${r.length} achado(s) · ${seg} s`); for (const x of r.slice(0, 12)) console.log('      ' + x); if (r.length > 12) console.log(`      ... e mais ${r.length - 12}`); }
    else console.log(`${String(W).padStart(4)} ${rota.padEnd(26)} ok · ${seg} s`);
    await p.close();
  }
  await ctx.close();
}
await b.close();
console.log(`\n${Math.round((Date.now() - t0) / 1000)} s no total${esgotadas ? `, ${esgotadas} página(s) sem resposta` : ''}`);
console.log(total ? `\n${total} achado(s)` : '\nnenhuma colisão, nada fora da tela');
process.exit(total || esgotadas ? 1 : 0);
