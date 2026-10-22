/* =============================================================================
   AUDITORIA · O CONTRASTE QUE A PESSOA VÊ, MEDIDO NOS PIXELS (21/10/2026)

   O axe mede contraste pela árvore de CSS e, quando há foto, gradiente ou
   vidro atrás do texto, desiste ("incompleto"). Nos três sites quase toda
   primeira tela é texto sobre foto, e foi aí que a medida achou o chapéu
   ("GUIA Church", "Servir") a 2:1 sobre a parede clara do Kids e a fachada
   ao sol. Aqui a conta é a de scripts/contraste-real.mjs, feita por janela:

     · rola a página de janela em janela (modo "reduzir movimento": tudo
       revelado, o herói parado no primeiro quadro);
     · em cada janela, guarda as linhas de texto inteiras na tela e não
       cobertas nem recortadas (elementFromPoint em cinco pontos da linha
       cai no próprio texto), com a tinta, o tamanho e o peso;
     · apaga a tinta e a sombra de todo texto, fotografa a janela (o fundo
       como o navegador pinta: foto, escurecimento, vidro, gradiente) e
       compara a tinta com os pixels debaixo de cada linha;
     · nas páginas com o herói que anda com o scroll, repete para cada faixa
       de legenda no ponto em que ela está inteira (modo com movimento): a
       foto de baixo muda a cada faixa.

   Sem a sombra do texto, a conta é a pessimista. Mínimo WCAG 1.4.3: 4,5:1,
   ou 3:1 para texto grande (24px+, ou 18,66px+ em negrito). Reprova pela
   média do fundo; o "pior décimo" (o décimo de pixels mais parecido com a
   tinta) vai como aviso, como no contraste-real.

     PORTA=3800 node scripts/auditoria-contraste-foto.mjs [--telas=390,1440] [/rota ...]

   Sai com 1 se algum trecho fica abaixo do mínimo na média.
   ============================================================================= */
import { chromium } from 'playwright';
import sharp from 'sharp';
import { rotear, rolarTudo, ROTAS_SITE } from './_rpc-mock.mjs';

const arg = process.argv.slice(2);
const B = `http://localhost:${process.env.PORTA || 3000}`;
const CHROME = process.env.CHROMIUM || undefined;
const rArg = arg.filter(a => a.startsWith('/'));
const ROTAS = rArg.length ? rArg : ROTAS_SITE.filter(r => !r.includes('nao-existe'));
const tArg = arg.find(a => a.startsWith('--telas='));
const TODAS = [[390, 844], [820, 1180], [1440, 900]];
const TELAS = tArg ? TODAS.filter(t => tArg.slice(8).split(',').map(Number).includes(t[0])) : TODAS;
const LIMITE_PAGINA = 150_000;

const lum = (r, g, b) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const razao = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const APAGAR = '*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;text-decoration-color:transparent!important;caret-color:transparent!important}';

/* as linhas de texto inteiras na janela, de quem está por cima (dentro de
   `raiz`, quando dada) */
const COLHER = (raizSel) => {
  const raizes = raizSel ? [...document.querySelectorAll(raizSel)] : [document.body];
  const W = innerWidth, H = innerHeight, out = [], fx = document.createRange();
  for (const raiz of raizes) {
    const tw = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    for (let n; (n = tw.nextNode());) {
      if (!n.textContent.trim()) continue;
      const e = n.parentElement;
      if (!e) continue;
      /* primeiro a caixa (barato): só o que está inteiro nesta janela segue */
      fx.selectNodeContents(n);
      const rs = [...fx.getClientRects()].filter(r => r.width >= 3 && r.height >= 6 && r.top >= 0 && r.left >= 0 && r.bottom <= H && r.right <= W);
      if (!rs.length) continue;
      if (e.closest('script,style,noscript,svg,[aria-hidden="true"],.leaflet-control-attribution')) continue;
      { const q = e.getBoundingClientRect(); if (q.width < 4 || q.height < 4) continue; }
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden') continue;
      let op = 1; for (let a = e; a && a !== document.documentElement; a = a.parentElement) op *= +getComputedStyle(a).opacity;
      if (op < 0.1) continue;
      const c = ((cs.webkitTextFillColor && !cs.webkitTextFillColor.startsWith('currentcolor')) ? cs.webkitTextFillColor : cs.color).match(/[\d.]+/g)?.map(Number);
      if (!c || c.length < 3) continue;
      const alfa = (c.length > 3 ? c[3] : 1) * op;
      if (alfa < 0.1) continue;
      for (const r of rs) {
        /* por cima de verdade: o meio e as duas pontas da linha, e um pouco abaixo
           do topo e acima da base, caem no próprio texto. Um ancestral no ponto
           quer dizer texto recortado (a resposta de um <details> fechado, o
           rótulo só para leitor de tela), a não ser o link ou botão que o
           contém (o cartão inteiro que é um link); outra coisa no ponto, texto
           coberto (a barra fixa do topo por cima de meia linha) */
        const pontos = [[.5, .5], [.12, .5], [.88, .5], [.5, .2], [.5, .8]];
        if (!pontos.every(([fx2, fy]) => { const no = document.elementFromPoint(r.left + r.width * fx2, r.top + r.height * fy); return !!no && (no === e || e.contains(no) || (no.contains(e) && no.matches('a,button'))); })) continue;
        const nome = e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/)[0] : '');
        out.push({ nome, txt: n.textContent.trim().replace(/\s+/g, ' ').slice(0, 28), tam: parseFloat(cs.fontSize), peso: +cs.fontWeight, tinta: c.slice(0, 3), alfa, x: r.left, y: r.top, w: r.width, h: r.height });
      }
    }
  }
  return out;
};

/* mede as linhas contra a foto da janela sem tinta */
async function medir(p, linhas, W, H) {
  const marca = await p.addStyleTag({ content: APAGAR });
  await p.waitForTimeout(80);
  const png = await p.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
  await marca.evaluate(e => e.remove());
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const res = [];
  for (const l of linhas) {
    const x0 = Math.max(0, Math.round(l.x)), y0 = Math.max(0, Math.round(l.y));
    const x1 = Math.min(info.width, Math.round(l.x + l.w)), y1 = Math.min(info.height, Math.round(l.y + l.h));
    if (x1 <= x0 || y1 <= y0) continue;
    const ls = []; let sr = 0, sg = 0, sb = 0;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      const i = (y * info.width + x) * 3; sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; ls.push(lum(data[i], data[i + 1], data[i + 2]));
    }
    const n = ls.length; if (!n) continue;
    const fundo = [sr / n, sg / n, sb / n];
    /* tinta translúcida (ou num pai com opacidade): composta sobre o fundo médio */
    const tinta = l.tinta.map((v, j) => l.alfa * v + (1 - l.alfa) * fundo[j]);
    const lt = lum(...tinta), lf = lum(...fundo);
    ls.sort((a, b) => a - b);
    const pior = lt > lf ? ls[Math.floor(n * 0.9)] : ls[Math.floor(n * 0.1)];
    const grande = l.tam >= 24 || (l.tam >= 18.66 && l.peso >= 700);
    res.push({ ...l, media: razao(lt, lf), pior: razao(lt, pior), min: grande ? 3 : 4.5, fundo });
  }
  return res;
}

const nav = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const achados = new Map();   // rota|tela|nome|txt -> pior medida
let medidos = 0, paginas = 0, estouros = 0;
const anota = (rota, tela, quadro, r) => {
  medidos++;
  const k = `${rota}|${tela}|${r.nome}|${r.txt}`;
  const v = achados.get(k);
  if (!v || r.media / r.min < v.media / v.min) achados.set(k, { rota, tela, quadro, ...r });
};

for (const [W, H] of TELAS) {
  for (const modo of ['reduce', 'no-preference']) {
    const ctx = await nav.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: W < 800, hasTouch: W < 1000, reducedMotion: modo });
    await ctx.route('**', r => rotear(r, B));
    for (const rota of ROTAS) {
      const t0 = Date.now();
      const p = await ctx.newPage();
      let n0 = medidos, quadros = 0;
      try {
        await p.goto(B + rota, { waitUntil: 'networkidle', timeout: 60000 });
        await p.waitForTimeout(500);
        if (modo === 'reduce') {
          /* a página inteira, de janela em janela */
          await rolarTudo(p);
          const alto = await p.evaluate(() => document.documentElement.scrollHeight);
          for (let y = 0; y < alto && Date.now() - t0 < LIMITE_PAGINA; y += Math.round(H * 0.8)) {
            await p.evaluate(y => window.scrollTo(0, y), y);
            await p.waitForTimeout(220);
            const linhas = await p.evaluate(COLHER, null);
            if (!linhas.length) continue;
            quadros++;
            for (const r of await medir(p, linhas, W, H)) anota(rota, `${W}`, `y=${y}`, r);
          }
        } else {
          /* com movimento: só o herói que anda, faixa a faixa, no ponto em que cada uma está inteira */
          const tem = await p.evaluate(() => !!document.querySelector('.s-scrub:not(.estatico)'));
          if (!tem) { await p.close(); continue; }
          await p.waitForFunction(() => document.querySelector('.s-scrub-palco')?.classList.contains('pronto'), null, { timeout: 20000 }).catch(() => {});
          const geo = await p.evaluate(() => { const h = document.querySelector('.s-scrub'); return { topo: h.getBoundingClientRect().top + scrollY, total: h.offsetHeight - innerHeight, n: h.querySelectorAll('.s-scrub-faixa').length }; });
          /* passos de 1/40 do herói: a parte inteira de cada faixa (op e k em 1) tem
             pelo menos 0,075 de largura, então nenhum passo pula uma faixa. Mede em
             TODO passo em que uma faixa está inteira (a pessoa pode parar em
             qualquer um, e a foto de baixo ainda pode estar trocando) e guarda o
             pior. As legendas não recebem toque (pointer-events:none), e o teste
             de "por cima" do COLHER usa elementFromPoint: a medida liga o toque só
             nas faixas medidas */
          for (let i = 0; i <= 40 && Date.now() - t0 < LIMITE_PAGINA; i++) {
            await p.evaluate(y => window.scrollTo(0, y), Math.round(geo.topo + geo.total * i / 40));
            await p.waitForTimeout(650);
            const vis = await p.evaluate(() => {
              const fs = [...document.querySelectorAll('.s-scrub-faixa')];
              const v = fs.map((f, j) => (+getComputedStyle(f).opacity > 0.99 && (parseFloat(f.style.getPropertyValue('--k')) || 0) > 0.99) ? j : -1).filter(j => j >= 0);
              fs.forEach((f, k) => { const m = v.includes(k); f.toggleAttribute('data-medir', m); f.style.pointerEvents = m ? 'auto' : ''; });
              return v;
            });
            if (!vis.length) continue;
            quadros++;
            const linhas = await p.evaluate(COLHER, '.s-scrub-faixa[data-medir]');
            for (const r of await medir(p, linhas, W, H)) anota(rota, `${W} com movimento`, `faixa ${vis.map(j => j + 1).join('+')} em p=${(i / 40).toFixed(3)}`, r);
          }
        }
      } catch (e) {
        console.log(`  ${rota} ${W} ${modo}: NÃO ABRIU (${String(e.message).slice(0, 80)})`);
      }
      const s = ((Date.now() - t0) / 1000).toFixed(0);
      if (Date.now() - t0 >= LIMITE_PAGINA) { estouros++; console.log(`  ${rota} ${W} ${modo}: ESTOUROU ${LIMITE_PAGINA / 1000} s`); }
      paginas++;
      console.log(`${String(W).padStart(4)} ${modo === 'reduce' ? 'parado ' : 'movendo'} ${rota.padEnd(24)} ${String(quadros).padStart(2)} janela(s), ${medidos - n0} linhas, ${s} s`);
      await p.close();
    }
    await ctx.close();
  }
}
await nav.close();

const todos = [...achados.values()];
const ruins = todos.filter(r => r.media < r.min).sort((a, b) => a.media / a.min - b.media / b.min);
const avisos = todos.filter(r => r.media >= r.min && r.pior < r.min).sort((a, b) => a.pior / a.min - b.pior / b.min);
console.log(`\n${paginas} páginas, ${medidos} linhas medidas, ${todos.length} trechos distintos`);
console.log(`\nABAIXO DO MÍNIMO NA MÉDIA: ${ruins.length}`);
for (const r of ruins.slice(0, 60)) console.log(`  ${r.rota} ${r.tela} (${r.quadro}) ${r.nome} «${r.txt}» ${r.media.toFixed(2)}:1 (mín ${r.min}; pior décimo ${r.pior.toFixed(2)}; ${Math.round(r.tam)}px; fundo rgb(${r.fundo.map(Math.round).join(',')}))`);
console.log(`\naviso, só o pior décimo abaixo: ${avisos.length}`);
for (const r of avisos.slice(0, 25)) console.log(`  ${r.rota} ${r.tela} (${r.quadro}) ${r.nome} «${r.txt}» média ${r.media.toFixed(2)}, pior décimo ${r.pior.toFixed(2)} (mín ${r.min})`);
process.exit(ruins.length || estouros ? 1 : 0);
