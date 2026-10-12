/* =============================================================================
   EIXO E ACABAMENTO — o celular medido linha a linha
   (12/10/2026)

   EIXO (abaixo de 760 px tudo é centralizado):
   1. LINHAS: cada linha de texto, dentro do bloco que a contém, tem a
      mesma folga à esquerda e à direita (2 px de tolerância).
   2. CAIXAS: cada fileira de itens (pílulas lado a lado, cartões, ícone +
      texto, bloco estreito com max-width) fica no meio do pai.

   ACABAMENTO:
   3. VIÚVA: título ou texto curto terminando com uma palavra sozinha.
   4. BOTÕES: alturas e raios das ações principais (todas iguais).
   5. RAIOS: arredondamento dos cartões (poucos valores, sempre os mesmos).
   6. RITMO: espaço de cima e de baixo das faixas (mesmo valor por tipo).
   7. RESPIRO: distância entre título e o texto logo abaixo.
   8. CORPO: texto visível menor que 13 px.
   9. CONTRASTE: texto contra o fundo de trás (4,5 normal, 3 grande).

   Uso: node scripts/site-eixo.mjs [base] [larguras] [rotas]
   RPC_DIR=<pasta> responde as RPCs com JSON gravado; PROXY=1 usa o proxy.
   ============================================================================= */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:3000';
const LARGURAS = (process.argv[3] || '360,390,430').split(',').map(Number);
const ROTAS = (process.argv[4] || '/,/cultos,/sobre,/eventos,/pequena-guia,/ofertar,/como-chegar,/servir,/servir/midia,/servir/louvor,/servir/onde-me-encaixo,/acessar,/privacidade').split(',');
const RPC_DIR = process.env.RPC_DIR;
const SO = (process.env.SO || '').split(',').filter(Boolean); /* SO=eixo,viuva... filtra o relatório */

const instalaRotas = async (page) => {
  if (!RPC_DIR) return;
  await page.route('**/rest/v1/rpc/**', async route => {
    const fn = new URL(route.request().url()).pathname.split('/').pop();
    let c = {}; try { c = JSON.parse(route.request().postData() || '{}'); } catch {}
    const arq = fn === 'ministerios_publicos' ? 'rpc-mins.json' : fn === 'numeros_publicos' ? 'rpc-num.json'
      : fn === 'equipe_funcoes' ? `rpc-funcoes-${c.p_slug}.json` : fn === 'perguntas_publicas' ? `rpc-perguntas-${c.p_slug}.json`
      : fn === 'areas_do_espaco' ? 'rpc-areas.json' : null;
    if (!arq || !existsSync(`${RPC_DIR}/${arq}`)) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(`${RPC_DIR}/${arq}`, 'utf8') });
  });
};

function medir() {
  const TOL = 2;
  const nome = (e) => { const c = typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : ''; return e.tagName.toLowerCase() + c; };
  const txt = (s) => (s || '').trim().replace(/\s+/g, ' ').slice(0, 42);
  const raizes = [...document.querySelectorAll('.s main, .s .s-pe')];
  const fora = (e) => !!e.closest('.leaflet-container, input, select, textarea, option, pre, .s-topo, .s-cortina, .s-busca, [hidden], .s-pular, svg title, .g-form-campo, .s-campo');
  /* trilho de deslizar (celular): o cartão fora da janela não está à vista;
     ele é medido quando a pessoa desliza (todos têm o mesmo desenho) */
  const foraDoTrilho = (e) => { const c = e.closest && e.closest('.desliza > *'); if (!c) return false; const r = c.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; };
  const visivel = (e) => {
    if (foraDoTrilho(e)) return false;
    for (let a = e; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < .05) return false;
    }
    const r = e.getBoundingClientRect();
    return r.width > 1 && r.height > 1 && r.right > -500 && r.left < innerWidth + 500;
  };
  const caixaConteudo = (e) => {
    const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
    const L = r.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft);
    const R = r.right - parseFloat(s.borderRightWidth) - parseFloat(s.paddingRight);
    return { L, R };
  };
  const blocoDe = (n) => { for (let a = n.parentElement; a; a = a.parentElement) { const d = getComputedStyle(a).display; if (d !== 'inline' && d !== 'contents') return a; } return document.body; };
  const absoluto = (e) => { for (let a = e; a && !raizes.includes(a); a = a.parentElement) { const p = getComputedStyle(a).position; if (p === 'absolute' || p === 'fixed') return true; } return false; };

  /* 1. LINHAS */
  const linhas = new Map();
  for (const raiz of raizes) {
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const pai = n.parentElement; if (!pai || fora(pai) || !visivel(pai)) continue;
      const bloco = blocoDe(n);
      if (/flex|grid/.test(getComputedStyle(bloco).display)) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) {
        if (r.width < 1) continue;
        if (!linhas.has(bloco)) linhas.set(bloco, []);
        const lista = linhas.get(bloco);
        const meio = (r.top + r.bottom) / 2;
        /* mesma linha = centros a menos de meia altura (serifa e sem serifa
           na mesma linha têm caixas de alturas diferentes) */
        const at = lista.find(q => Math.abs(q.meio - meio) < Math.min(q.h, r.height) / 2);
        if (at) { at.L = Math.min(at.L, r.left); at.R = Math.max(at.R, r.right); if (at.t.length < 40) at.t += n.nodeValue; }
        else lista.push({ meio, h: r.height, L: r.left, R: r.right, t: n.nodeValue });
      }
    }
  }
  /* caixas atômicas em linha (inline-block, inline-flex, img, svg solto) entram na linha do bloco */
  for (const raiz of raizes) {
    for (const e of raiz.querySelectorAll('*')) {
      if (fora(e) || !visivel(e) || absoluto(e)) continue;
      const d = getComputedStyle(e).display;
      const atomico = /^inline-/.test(d) || (d === 'inline' && /^(IMG|SVG|svg)$/.test(e.tagName));
      if (!atomico) continue;
      const pd = e.parentElement && getComputedStyle(e.parentElement).display;
      if (pd && /flex|grid/.test(pd)) continue; /* item de flex/grade é caixa, não linha */
      /* dentro de outra caixa atômica (ícone dentro da pílula) quem manda é a pílula */
      let dentro = false; for (let a = e.parentElement; a && !raizes.includes(a); a = a.parentElement) { const da = getComputedStyle(a).display; if (/^inline-/.test(da)) { dentro = true; break; } if (da !== 'inline') break; }
      if (dentro) continue;
      const bloco = blocoDe(e); const r = e.getBoundingClientRect();
      if (!linhas.has(bloco)) linhas.set(bloco, []);
      const lista = linhas.get(bloco); const meio = (r.top + r.bottom) / 2;
      const at = lista.find(q => Math.abs(q.meio - meio) < Math.min(q.h, r.height) / 2);
      if (at) { at.L = Math.min(at.L, r.left); at.R = Math.max(at.R, r.right); }
      else lista.push({ meio, h: r.height, L: r.left, R: r.right, t: '[' + e.tagName.toLowerCase() + '] ' + (e.textContent || '') });
    }
  }
  /* o ponto final da voz itálica é ::after (não é nó de texto): mede e soma */
  const tela = document.createElement('canvas').getContext('2d');
  document.querySelectorAll('.s .s-it').forEach(it => {
    if (fora(it) || !visivel(it)) return;
    const ps = getComputedStyle(it, '::after'); const conteudo = (ps.content || '').replace(/^"|"$/g, '');
    if (!conteudo || conteudo === 'none' || ps.display === 'none') return;
    tela.font = `${ps.fontStyle} ${ps.fontWeight} ${ps.fontSize} ${ps.fontFamily}`;
    const largura = tela.measureText(conteudo).width + parseFloat(ps.letterSpacing || 0) * conteudo.length;
    const bloco = blocoDe(it.firstChild || it);
    const lista = linhas.get(bloco); if (!lista) return;
    if (getComputedStyle(it).display === 'inline') {
      /* em linha: as caixas do próprio span já incluem o ::after */
      const rs = [...it.getClientRects()]; if (!rs.length) return;
      const ult = rs[rs.length - 1]; const meio = (ult.top + ult.bottom) / 2;
      const l = lista.find(q => Math.abs(q.meio - meio) < Math.min(q.h, ult.height) / 2);
      if (l) l.R = Math.max(l.R, ult.right);
    } else {
      /* em bloco (herói): soma a largura do ponto à última linha de texto */
      const ult = lista.reduce((a, q) => (!a || q.meio > a.meio ? q : a), null);
      if (ult) ult.R += largura;
    }
  });
  const eixoLinhas = [];
  for (const [bloco, lista] of linhas) {
    const c = caixaConteudo(bloco);
    for (const l of lista) {
      const a = l.L - c.L, b = c.R - l.R;
      if (Math.abs(a - b) > TOL) eixoLinhas.push(`${nome(bloco)} esq=${a.toFixed(0)} dir=${b.toFixed(0)} "${txt(l.t)}"`);
    }
  }

  /* 2. CAIXAS: fileiras de itens dentro de cada pai */
  const eixoCaixas = [];
  for (const raiz of raizes) {
    for (const p of [raiz, ...raiz.querySelectorAll('*')]) {
      if (fora(p) || !visivel(p) || absoluto(p)) continue;
      const ps = getComputedStyle(p);
      if (ps.display === 'inline' || ps.display === 'contents') continue;
      const flexOuGrade = /flex|grid/.test(ps.display);
      const itens = [];
      for (const f of p.childNodes) {
        if (f.nodeType === 1) {
          if (fora(f) || !visivel(f)) continue;
          const fs = getComputedStyle(f);
          if (fs.position === 'absolute' || fs.position === 'fixed') continue;
          if (!flexOuGrade && (fs.display === 'inline' || fs.display === 'contents' || /^inline-/.test(fs.display))) continue;
          const r = f.getBoundingClientRect();
          itens.push({ L: r.left, R: r.right, m: (r.top + r.bottom) / 2, h: r.height, t: f.textContent });
        } else if (f.nodeType === 3 && flexOuGrade && f.nodeValue.trim()) {
          const rg = document.createRange(); rg.selectNodeContents(f);
          const r = rg.getBoundingClientRect();
          if (r.width > 1) itens.push({ L: r.left, R: r.right, m: (r.top + r.bottom) / 2, h: r.height, t: f.nodeValue });
        }
      }
      if (!itens.length) continue;
      /* fileiras: itens que se sobrepõem na vertical */
      itens.sort((x, y) => x.m - y.m);
      const filas = [];
      for (const it of itens) {
        const f = filas.find(q => Math.abs(q.m - it.m) < Math.max(6, Math.min(q.h, it.h) / 2));
        if (f) { f.L = Math.min(f.L, it.L); f.R = Math.max(f.R, it.R); f.n++; } else filas.push({ ...it, n: 1 });
      }
      const c = caixaConteudo(p);
      for (const f of filas) {
        if (f.R - f.L >= c.R - c.L - TOL) continue; /* ocupa a linha toda */
        const a = f.L - c.L, b = c.R - f.R;
        if (Math.abs(a - b) > TOL) eixoCaixas.push(`${nome(p)} esq=${a.toFixed(0)} dir=${b.toFixed(0)} (${f.n} item) "${txt(f.t)}"`);
      }
    }
  }

  /* 3. VIÚVA: última linha com uma palavra só */
  const viuvas = [];
  document.querySelectorAll('.s main h1, .s main h2, .s main h3, .s main .s-lead, .s main .s-micro, .s main .s-cartao-t, .s main .s-cartao-d, .s main p, .s main li, .s main b, .s .s-pe p').forEach(e => {
    if (fora(e) || !visivel(e) || e.querySelector('h1,h2,h3,p,li,div')) return;
    /* em linha (pergunta em negrito seguida da resposta): a linha continua, não é viúva */
    if (getComputedStyle(e).display === 'inline') return;
    const palavras = [];
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const re = /\S+/g; let m;
      /* a voz itálica em bloco (herói, fecho) é linha desenhada, não viúva */
      const itBloco = n.parentElement && n.parentElement.closest('.s-it') && getComputedStyle(n.parentElement.closest('.s-it')).display === 'block';
      if (itBloco) continue;
      while ((m = re.exec(n.nodeValue))) { const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length); const rs = rg.getClientRects(); if (rs.length) { const r = rs[rs.length - 1]; palavras.push({ p: m[0], meio: (r.top + r.bottom) / 2, h: r.height }); } }
    }
    if (palavras.length < 4) return;
    const grupos = [];
    for (const w of palavras) { const g = grupos.find(q => Math.abs(q.meio - w.meio) < Math.min(q.h, w.h) / 2); if (g) g.ws.push(w); else grupos.push({ meio: w.meio, h: w.h, ws: [w] }); }
    grupos.sort((a, b) => a.meio - b.meio);
    if (grupos.length < 2) return;
    const ultima = grupos[grupos.length - 1].ws;
    if (ultima.length === 1 && ultima[0].p.replace(/[^\p{L}\p{N}]/gu, '').length > 0) viuvas.push(`${nome(e)} "…${ultima[0].p}" em ${grupos.length} linhas: "${txt(e.textContent)}"`);
  });

  /* 3b. HÍFEN e SEPARADOR: palavra partida no hífen (e-/mail, 22793-/390) e
     separador "·" sobrando no começo ou no fim de uma linha */
  const hifen = [], separador = [];
  const blocosVistos = new Set();
  for (const raiz of raizes) {
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const pai = n.parentElement; if (!pai || fora(pai) || !visivel(pai)) continue;
      const re = /\S+/g; let m;
      while ((m = re.exec(n.nodeValue))) {
        if (!m[0].includes('-')) continue;
        const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
        const tops = [...new Set([...rg.getClientRects()].filter(r => r.width > 0.5).map(r => Math.round(r.top / 4)))];
        if (tops.length > 1) hifen.push(`${nome(pai)} "${m[0]}"`);
      }
    }
  }
  /* separador: por bloco, junta as palavras por linha e olha a primeira e a última */
  document.querySelectorAll('.s main p, .s main li, .s main span, .s main b, .s main small, .s .s-pe p, .s .s-pe div, .s .s-pe span').forEach(e => {
    if (fora(e) || !visivel(e) || blocosVistos.has(e)) return;
    if (getComputedStyle(e).display === 'inline') return;
    blocosVistos.add(e);
    const ps = [];
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const re = /[^\s ⁠]+/g; let m;
      while ((m = re.exec(n.nodeValue))) { const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length); const rs = rg.getClientRects(); if (rs.length) { const r = rs[0]; ps.push({ p: m[0], meio: (r.top + r.bottom) / 2, h: r.height, x: r.left }); } }
    }
    const linhas2 = [];
    for (const t of ps) { const g = linhas2.find(q => Math.abs(q.meio - t.meio) < Math.min(q.h, t.h) / 2); if (g) g.ts.push(t); else linhas2.push({ meio: t.meio, h: t.h, ts: [t] }); }
    if (linhas2.length < 2) return;
    for (const l of linhas2) {
      l.ts.sort((a, b) => a.x - b.x);
      const pri = l.ts[0].p, ult = l.ts[l.ts.length - 1].p;
      if (l.ts.length > 1 && (/^[·|•]$/.test(pri) || /^[·|•]$/.test(ult))) separador.push(`${nome(e)} linha "${l.ts.map(t => t.p).join(' ').slice(0, 50)}"`);
    }
  });

  /* 4. BOTÕES: altura e raio das ações */
  const botoes = {};
  document.querySelectorAll('.s main a.s-pil, .s main button.s-pil, .s main .acao, .s main .s-enviar, .s main button[type="submit"]').forEach(e => {
    if (!visivel(e) || fora(e)) return;
    const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
    const k = `${Math.round(r.height)}px r=${s.borderTopLeftRadius}`;
    (botoes[k] = botoes[k] || []).push(txt(e.textContent).slice(0, 22));
  });

  /* 5. RAIOS dos cartões */
  const raios = {};
  document.querySelectorAll('.s main .s-cartao, .s main .s-claro, .s main .pg, .s main .s-funcao, .s main .s-sigla li, .s main .of, .s main .s-mapa, .s main .s-foto, .s main .s-faq-t, .s main .s-mapa-cartao, .s main .pg-perto, .s main .pg-mapao, .s main .s-pessoa, .s main .s-momentos > *').forEach(e => {
    if (!visivel(e)) return;
    const k = getComputedStyle(e).borderTopLeftRadius;
    (raios[k] = raios[k] || new Set()).add(nome(e));
  });

  /* 6. RITMO das faixas */
  const ritmo = {};
  document.querySelectorAll('.s main > section, .s main > div > section').forEach(e => {
    if (!visivel(e)) return;
    const s = getComputedStyle(e);
    const tipo = (e.className.match(/s-(faixa|heroi|fecho)[^ ]*/g) || ['?']).join('+') + (e.classList.contains('justa') ? '.justa' : '') + (e.classList.contains('curto') ? '.curto' : '');
    const k = `${tipo} ${Math.round(parseFloat(s.paddingTop))}/${Math.round(parseFloat(s.paddingBottom))}`;
    ritmo[k] = (ritmo[k] || 0) + 1;
  });

  /* 7. RESPIRO título → texto */
  const respiro = {};
  document.querySelectorAll('.s main h1, .s main h2').forEach(h => {
    if (!visivel(h)) return;
    const n = h.nextElementSibling; if (!n || !visivel(n) || !/^(P)$/.test(n.tagName)) return;
    const d = Math.round(n.getBoundingClientRect().top - h.getBoundingClientRect().bottom);
    const k = `${h.tagName.toLowerCase()}${h.classList.contains('s-serifa') ? '.serifa' : ''}→${n.className.split(' ')[0] || 'p'} ${d}px`;
    respiro[k] = (respiro[k] || 0) + 1;
  });

  /* 8. CORPO mínimo e 9. CONTRASTE */
  const pequenos = [], contraste = [];
  const rgb = (c) => { const m = (c || '').match(/[\d.]+/g); if (!m) return null; const [r, g, b, a = 1] = m.map(Number); return { r, g, b, a }; };
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const temImagemAtras = (e) => { for (let a = e; a; a = a.parentElement) { if (a.matches && a.matches('.s-heroi, .s-fecho, .s-cartao.foto, .s-momentos > *')) return true; } return false; };
  const fundo = (e) => { for (let a = e; a; a = a.parentElement) { const c = rgb(getComputedStyle(a).backgroundColor); if (c && c.a > .5) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const vistos = new Set();
  for (const raiz of raizes) {
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const e = n.parentElement; if (!e || vistos.has(e) || fora(e) || !visivel(e)) continue; vistos.add(e);
      const s = getComputedStyle(e); const fs = parseFloat(s.fontSize);
      if (fs < 13) pequenos.push(`${nome(e)} ${fs}px "${txt(e.textContent)}"`);
      if (temImagemAtras(e)) continue; /* foto atrás: o olho decide (tiras) */
      const c = rgb(s.color); if (!c) continue;
      const bg = fundo(e);
      const cor = { r: c.r * c.a + bg.r * (1 - c.a), g: c.g * c.a + bg.g * (1 - c.a), b: c.b * c.a + bg.b * (1 - c.a) };
      const [x, y] = [lum(cor), lum(bg)].sort((p, q) => q - p); const k = (x + .05) / (y + .05);
      const grande = fs >= 24 || (fs >= 18.66 && Number(s.fontWeight) >= 700);
      const op = Number(s.opacity) * (e.parentElement ? Number(getComputedStyle(e.parentElement).opacity) : 1);
      if (k * (op < 1 ? op : 1) < (grande ? 3 : 4.5)) contraste.push(`${nome(e)} ${k.toFixed(2)}:1 ${fs}px "${txt(e.textContent)}"`);
    }
  }

  return {
    W: document.documentElement.clientWidth, scrollW: document.documentElement.scrollWidth,
    eixoLinhas: [...new Set(eixoLinhas)], eixoCaixas: [...new Set(eixoCaixas)],
    viuvas: [...new Set(viuvas)], hifen: [...new Set(hifen)], separador: [...new Set(separador)], botoes, raios: Object.fromEntries(Object.entries(raios).map(([k, v]) => [k, [...v].join(' ')])),
    ritmo, respiro, pequenos: [...new Set(pequenos)], contraste: [...new Set(contraste)],
  };
}

const browser = await chromium.launch({ headless: true, ...(process.env.PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) });
let total = 0;
for (const w of LARGURAS) {
  for (const rota of ROTAS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR' });
    const page = await ctx.newPage();
    await instalaRotas(page);
    await page.goto(BASE + rota, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { document.documentElement.classList.add('nao-anima'); document.querySelectorAll('.rev,.sv-r,.s-rev').forEach(e => e.classList.add('visto')); });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700);
    const r = await page.evaluate(medir);
    const falhas = r.eixoLinhas.length + r.eixoCaixas.length + r.viuvas.length + r.hifen.length + r.separador.length + r.pequenos.length + r.contraste.length;
    total += falhas;
    console.log(JSON.stringify({ rota, w, falhas, ...r }));
    await ctx.close();
  }
}
await browser.close();
console.log(JSON.stringify({ TOTAL: total }));
