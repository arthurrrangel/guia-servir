/* =============================================================================
   AUDITORIA DE ALINHAMENTO — o site medido com régua, não com o olho
   (11/10/2026)

   Abre cada rota pública em larguras de celular e mede, em pixels:

   1. MARGEM: todo bloco de conteúdo começa e termina na mesma coluna?
      A margem da página é a moda das bordas esquerdas; qualquer bloco fora
      dela (e que não seja faixa de borda a borda) é desalinhamento.
   2. CENTRO: o que está marcado como centralizado está centralizado?
      Folga da esquerda igual à da direita, com 1px de tolerância.
   3. VAZAMENTO: nada passa da largura da janela, nem encosta na borda.
   4. ESTOURO: nenhum texto transborda o próprio container.
   5. CARTÕES: itens de uma mesma grade têm a mesma largura e as mesmas
      bordas (esquerda igual, direita igual por coluna).
   6. TOQUE: alvos clicáveis com pelo menos 40px de altura.

   Uso: node scripts/site-alinhamento.mjs [base] [larguras] [rotas]
   RPC_DIR=<pasta> responde as RPCs públicas com JSON gravado.
   ============================================================================= */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3000';
const LARGURAS = (process.argv[3] || '360,390,430').split(',').map(Number);
const ROTAS = (process.argv[4] || '/,/cultos,/sobre,/eventos,/pequena-guia,/ofertar,/como-chegar,/servir,/servir/midia,/servir/louvor,/servir/onde-me-encaixo,/acessar,/privacidade,/naoexiste').split(',');
const RPC_DIR = process.env.RPC_DIR;
const TOL = 1.5;

const instalaRotas = async (page) => {
  if (!RPC_DIR) return;
  await page.route('**/rest/v1/rpc/**', async route => {
    const fn = new URL(route.request().url()).pathname.split('/').pop();
    let corpo = {}; try { corpo = JSON.parse(route.request().postData() || '{}'); } catch {}
    const arq = fn === 'ministerios_publicos' ? 'rpc-mins.json'
      : fn === 'numeros_publicos' ? 'rpc-num.json'
      : fn === 'equipe_funcoes' ? `rpc-funcoes-${corpo.p_slug}.json`
      : fn === 'perguntas_publicas' ? `rpc-perguntas-${corpo.p_slug}.json`
      : fn === 'areas_do_espaco' ? 'rpc-areas.json' : null;
    if (!arq || !existsSync(`${RPC_DIR}/${arq}`)) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(`${RPC_DIR}/${arq}`, 'utf8') });
  });
};

const medir = (TOL) => {
  const W = document.documentElement.clientWidth;
  const nome = (e) => {
    const c = typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return e.tagName.toLowerCase() + c + (e.id ? '#' + e.id : '');
  };
  /* trilho de deslizar (celular): o cartão fora da janela é medido quando
     entra nela; o trilho em si sangra até a borda de propósito */
  const foraDoTrilho = (e) => { const c = e.closest && e.closest('.desliza > *'); if (!c) return false; const r = c.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; };
  const vis = (e) => {
    if (foraDoTrilho(e)) return false;
    const s = getComputedStyle(e);
    if (s.display === 'none' || s.visibility === 'hidden' || s.position === 'fixed') return false;
    if (Number(s.opacity) < 0.05) return false;
    const r = e.getBoundingClientRect();
    /* o link de pular o menu mora acima da página até receber foco */
    if (r.bottom < -4) return false;
    return r.width > 2 && r.height > 2;
  };
  const txt = (e) => (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  /* recortado: algum ancestral corta o excesso (overflow ≠ visible) E o
     elemento passa da caixa dele, ou seja, o que sobra nem aparece (azulejos
     do mapa). Um filho que só encosta na borda de um herói que recorta NÃO é
     recortado: está inteiro à vista, e é defeito. */
  const recorta = (e) => {
    const r = e.getBoundingClientRect();
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowX === 'visible' && s.overflow === 'visible') continue;
      const ra = a.getBoundingClientRect();
      if (r.left < ra.left - 0.5 || r.right > ra.right + 0.5) return true;
    }
    return false;
  };
  /* escondido fora da tela de propósito (isca de robô, rótulo só para leitor de tela) */
  const escondido = (e) => { const r = e.getBoundingClientRect(); return r.right < -1000 || r.left > W + 1000; };
  /* o pai é uma janela de rolagem ou de corte: o filho maior é intencional */
  const paiRola = (p) => { const s = getComputedStyle(p); return s.overflowX !== 'visible'; };

  /* 1. a coluna da página: bordas dos blocos dentro de cada .s-in */
  const esq = [], dir = [];
  document.querySelectorAll('.s-in').forEach(caixa => {
    const rc = caixa.getBoundingClientRect();
    esq.push(Math.round(rc.left)); dir.push(Math.round(rc.right));
  });
  const moda = (a) => { const m = {}; a.forEach(v => m[v] = (m[v] || 0) + 1); return Object.entries(m).sort((x, y) => y[1] - x[1])[0]; };
  const colEsq = esq.length ? Number(moda(esq)[0]) : null;
  const colDir = dir.length ? Number(moda(dir)[0]) : null;

  const fora = [];
  document.querySelectorAll('.s-in').forEach(caixa => {
    const r = caixa.getBoundingClientRect();
    if (colEsq !== null && Math.abs(r.left - colEsq) > TOL) fora.push(`${nome(caixa)} esq=${Math.round(r.left)} (coluna ${colEsq})`);
    if (colDir !== null && Math.abs(r.right - colDir) > TOL) fora.push(`${nome(caixa)} dir=${Math.round(r.right)} (coluna ${colDir})`);
  });

  /* 2. o que deveria estar centrado */
  const centro = [];
  document.querySelectorAll('.s-centro, .centro, .s-cab.centro, .s-acoes.centro, [style*="text-align:center"]').forEach(e => {
    if (!vis(e)) return;
    const p = e.parentElement; if (!p) return;
    const r = e.getBoundingClientRect(), rp = p.getBoundingClientRect();
    const a = r.left - rp.left, b = rp.right - r.right;
    if (Math.abs(a - b) > TOL) centro.push(`${nome(e)} esq=${a.toFixed(1)} dir=${b.toFixed(1)} "${txt(e)}"`);
  });

  /* o conteúdo de um bloco centrado por texto: a linha mais larga tem que caber */
  const centroTexto = [];
  document.querySelectorAll('h1,h2,h3,p,li,blockquote').forEach(e => {
    if (!vis(e)) return;
    if (getComputedStyle(e).textAlign !== 'center') return;
    const r = e.getBoundingClientRect();
    const rng = document.createRange(); rng.selectNodeContents(e);
    const rects = [...rng.getClientRects()].filter(x => x.width > 1);
    if (!rects.length) return;
    const maisLarga = Math.max(...rects.map(x => x.width));
    if (maisLarga > r.width + TOL) centroTexto.push(`${nome(e)} linha=${maisLarga.toFixed(0)} caixa=${r.width.toFixed(0)} "${txt(e)}"`);
  });

  /* 3. vazamento e encosto na borda */
  const vaza = [], encosta = [];
  const bordaOk = new Set(['s-faixa', 's-heroi', 's-fecho', 's-topo', 's-pe', 's-cortina', 's-busca', 's-movimento', 's-sub', 's-nav']);
  document.querySelectorAll('body *').forEach(e => {
    if (!vis(e)) return;
    const r = e.getBoundingClientRect();
    if (escondido(e) || recorta(e)) return;
    if (r.right > W + 0.6 || r.left < -0.6) vaza.push(`${nome(e)} [${Math.round(r.left)}..${Math.round(r.right)}] de ${W}`);
    const cls = typeof e.className === 'string' ? e.className.split(/\s+/) : [];
    const deBorda = cls.some(c => bordaOk.has(c)) || e.tagName === 'IMG' || e.tagName === 'SVG' || e.tagName === 'VIDEO' || e.closest('.s-topo,.s-pe,.s-cortina,.s-busca,.s-heroi-foto,picture');
    if (!deBorda && colEsq !== null && (r.left < colEsq - TOL || r.right > colDir + TOL) && r.width < W - 4) {
      encosta.push(`${nome(e)} [${Math.round(r.left)}..${Math.round(r.right)}] coluna [${colEsq}..${colDir}]`);
    }
  });

  /* 4. texto estourando o container */
  const estoura = [];
  document.querySelectorAll('h1,h2,h3,h4,p,li,b,em,span,a,button,blockquote,small').forEach(e => {
    if (!vis(e)) return;
    if (e.children.length > 0) return;
    const s = getComputedStyle(e);
    if (s.overflow !== 'visible' && s.overflow !== '') return;
    if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0) estoura.push(`${nome(e)} scroll=${e.scrollWidth} caixa=${e.clientWidth} "${txt(e)}"`);
  });

  /* 5. grades: itens irmãos com larguras diferentes */
  const grades = [];
  document.querySelectorAll('.s-cartoes, .s-funcoes, .s-passos, .s-sigla, .s-momentos, .s-circs, .s-num, .s-mapa, .s-vivos, .s-objs, .s-obj').forEach(g => {
    if (!vis(g)) return;
    const filhos = [...g.children].filter(vis);
    if (filhos.length < 2) return;
    const rs = filhos.map(f => f.getBoundingClientRect());
    const linhas = {};
    rs.forEach((r, i) => { const k = Math.round(r.top / 4); (linhas[k] = linhas[k] || []).push({ r, i }); });
    for (const k of Object.keys(linhas)) {
      const L = linhas[k]; if (L.length < 2) continue;
      const larg = L.map(x => x.r.width);
      if (Math.max(...larg) - Math.min(...larg) > TOL) grades.push(`${nome(g)} linha ${k}: larguras ${larg.map(v => v.toFixed(0)).join('/')}`);
      const tops = L.map(x => x.r.top);
      if (Math.max(...tops) - Math.min(...tops) > TOL) grades.push(`${nome(g)} linha ${k}: topos ${tops.map(v => v.toFixed(0)).join('/')}`);
    }
    /* colunas: mesma coluna, mesma borda esquerda */
    const porCol = {};
    rs.forEach(r => { const k = Math.round(r.left / 4); (porCol[k] = porCol[k] || []).push(r.left); });
  });

  /* 7. filho mais largo que o pai: palavra longa ou rótulo que não quebra
     alarga a coluna e empurra o resto até a borda (pega o que a moda das
     margens não pega, porque o .s-in continua certo) */
  const largo = [];
  document.querySelectorAll('.s main *').forEach(e => {
    if (!vis(e)) return;
    const s = getComputedStyle(e);
    if (s.position === 'absolute') return;
    const p = e.parentElement; if (!p) return;
    const ps = getComputedStyle(p);
    const rp = p.getBoundingClientRect();
    const dentro = rp.width - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight) - parseFloat(ps.borderLeftWidth) - parseFloat(ps.borderRightWidth);
    const r = e.getBoundingClientRect();
    if (e.classList.contains('desliza')) return;
    if (r.width > dentro + TOL && !paiRola(p) && !escondido(e)) largo.push(`${nome(e)} ${r.width.toFixed(0)} > ${dentro.toFixed(0)} em ${nome(p)} "${txt(e)}"`);
  });

  /* 8. botão que some: fundo do botão igual ao fundo de trás e sem borda
     que o desenhe (papel sobre papel, noite sobre noite) */
  const some = [];
  const rgb = (c) => { const m = (c || '').match(/[\d.]+/g); if (!m) return null; const [r, g, b, a = 1] = m.map(Number); return { r, g, b, a }; };
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
  const fundoDe = (e) => { for (let a = e.parentElement; a; a = a.parentElement) { const c = rgb(getComputedStyle(a).backgroundColor); if (c && c.a > .5) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  document.querySelectorAll('.s main a.s-pil, .s main button, .s main .acao, .s main .s-enviar').forEach(e => {
    if (!vis(e)) return;
    const s = getComputedStyle(e);
    const bg = rgb(s.backgroundColor); if (!bg || bg.a < .5) return;
    const atras = fundoDe(e);
    const bd = rgb(s.borderTopColor); const bw = parseFloat(s.borderTopWidth) || 0;
    /* borda translúcida: mistura sobre o fundo do próprio botão antes de comparar */
    const mistura = (c, base) => ({ r: c.r * c.a + base.r * (1 - c.a), g: c.g * c.a + base.g * (1 - c.a), b: c.b * c.a + base.b * (1 - c.a), a: 1 });
    const borda = bd && bw > 0.5 && bd.a > .05 ? contraste(mistura(bd, bg), atras) : 1;
    const c = contraste(bg, atras);
    if (c < 1.25 && borda < 1.6) some.push(`${nome(e)} contraste ${c.toFixed(2)} "${txt(e)}"`);
  });

  /* 6. alvos de toque */
  const toque = [];
  document.querySelectorAll('a,button,input,select,summary,[role="button"]').forEach(e => {
    if (!vis(e)) return;
    const r = e.getBoundingClientRect();
    if (e.closest('.s-prosa, p, li')) return;
    if (r.height < 40) toque.push(`${nome(e)} h=${r.height.toFixed(0)} "${txt(e)}"`);
  });

  return {
    W, scrollW: document.documentElement.scrollWidth, colEsq, colDir,
    margem: colEsq, margemDir: W - colDir,
    fora: [...new Set(fora)].slice(0, 12),
    centro: [...new Set(centro)].slice(0, 12),
    centroTexto: [...new Set(centroTexto)].slice(0, 8),
    vaza: [...new Set(vaza)].slice(0, 12),
    encosta: [...new Set(encosta)].slice(0, 12),
    estoura: [...new Set(estoura)].slice(0, 10),
    grades: [...new Set(grades)].slice(0, 12),
    toque: [...new Set(toque)].slice(0, 10),
    largo: [...new Set(largo)].slice(0, 10),
    some: [...new Set(some)].slice(0, 10),
  };
};

/* PROXY=1: produção através do proxy da sessão (o NSS do navegador já confia na CA dele) */
const browser = await chromium.launch({ headless: true, ...(process.env.PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) });
let problemas = 0;
for (const w of LARGURAS) {
  for (const rota of ROTAS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR' });
    const page = await ctx.newPage();
    await instalaRotas(page);
    const erros = [];
    page.on('console', m => { if (m.type() === 'error') erros.push(m.text().slice(0, 120)); });
    await page.goto(BASE + rota, { waitUntil: 'networkidle', timeout: 60000 }).catch(e => erros.push('goto ' + e.message));
    await page.evaluate(() => { document.documentElement.classList.add('nao-anima'); document.querySelectorAll('.rev,.sv-r,.s-rev').forEach(e => e.classList.add('visto')); });
    await page.waitForTimeout(700);
    const r = await page.evaluate(medir, TOL);
    const falhas = ['fora', 'centro', 'centroTexto', 'vaza', 'encosta', 'estoura', 'grades', 'largo', 'some'].reduce((n, k) => n + r[k].length, 0) + (r.scrollW > r.W ? 1 : 0);
    problemas += falhas;
    console.log(JSON.stringify({ rota, w, ...r, erros: erros.slice(0, 3), falhas }));
    await ctx.close();
  }
}
await browser.close();
console.log(JSON.stringify({ TOTAL_PROBLEMAS: problemas }));
