/* =============================================================================
   AUDITORIA · AS CORES FORÇADAS (o alto contraste do Windows) (22/10/2026)

   No modo de cores forçadas o sistema troca as cores da página pelas do tema
   da pessoa: o texto vira CanvasText, os links LinkText, toda borda e todo
   contorno aparecem (até os transparentes), o FUNDO de tudo vira Canvas (a
   cor do papel do tema) e a sombra some. O que o site desenha só com fundo
   ou só com sombra desaparece. Nos três sites, no celular e no computador,
   no tema escuro e no claro:

     A. todo controle sem texto (ícone, ponto, barra, hambúrguer) aparece:
        escondê-lo muda os pixels da caixa dele (com o menu fechado e aberto,
        e na busca);
     B. todo controle que tinha forma (fundo) continua com forma: borda,
        contorno ou foto dentro;
     C. todo estado (aria-pressed, aria-current) se vê: o ligado e o
        desligado do mesmo grupo não ficam iguais no que o modo pinta
        (borda, contorno, sublinhado, peso, cor de sistema, ícone);
     D. todo foco do teclado tem marca: contorno (a sombra e a cor da borda
        não contam, porque o modo apaga uma e iguala a outra).

     PORTA=3800 node scripts/auditoria-cores-forcadas.mjs
     PASTA=<pasta> guarda as capturas de prova; ROTAS=/,/servir filtra
   Sai com 1 se algum caso falhar.
   ============================================================================= */
import { chromium } from 'playwright';
import sharp from 'sharp';
import { rotear } from './_rpc-mock.mjs';
const B = `http://localhost:${process.env.PORTA || 3700}`;
const PASTA = process.env.PASTA || '';
const TODAS = ['/', '/cultos', '/como-chegar', '/eventos', '/pequena-guia', '/sobre', '/ofertar', '/privacidade', '/servir', '/servir/midia', '/servir/louvor', '/servir/kids', '/servir/servico', '/servir/livraria', '/servir/onde-me-encaixo', '/acessar', '/follow'];
const ROTAS = process.env.ROTAS ? process.env.ROTAS.split(',') : TODAS;
const PROVA = new Set(['/', '/servir', '/follow', '/pequena-guia', '/ofertar']);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let ruins = 0;
const res = (ok, txt) => { if (!ok) ruins++; console.log(`${ok ? 'ok ' : 'MAL'} ${txt}`); };

/* ---------- no navegador: o que é visível, o nome de cada peça, a assinatura ---------- */
const AJUDA = () => {
  window.__cf = {};
  document.documentElement.style.scrollBehavior = 'auto';
  const F = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]';
  const vis = e => {
    if (e.closest('[inert]')) return false;
    /* o conteúdo de um <details> fechado não é desenhado (content-visibility), mas tem caixa */
    if (e.checkVisibility && !e.checkVisibility({ contentVisibilityAuto: true, opacityProperty: true, visibilityProperty: true })) return false;
    const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    if (getComputedStyle(e).visibility === 'hidden') return false;
    for (let a = e; a && a !== document.documentElement; a = a.parentElement) { const c = getComputedStyle(a); if (c.display === 'none' || +c.opacity < 0.05) return false; }
    return true;
  };
  const nome = e => {
    const t = e.tagName.toLowerCase();
    if (e.classList.length) return `${t}.${[...e.classList].slice(0, 2).join('.')}`;
    const anc = e.parentElement?.closest('[class]');
    return `${t} (em .${anc ? anc.classList[0] : '?'})`;
  };
  const alfa = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return c === 'transparent' ? 0 : 1; const p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1; };
  const borda = c => ['Top', 'Right', 'Bottom', 'Left'].some(s => c[`border${s}Style`] !== 'none' && c[`border${s}Style`] !== 'hidden' && parseFloat(c[`border${s}Width`]) > 0);
  const contorno = c => c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0;
  /* o que o modo pinta de um elemento e dos filhos (sem o texto em si) */
  const pinta = e => {
    const c = getComputedStyle(e);
    const p = [borda(c) ? ['Top', 'Right', 'Bottom', 'Left'].map(s => `${c[`border${s}Style`]}${c[`border${s}Width`]}`).join('/') : '-',
      contorno(c) ? `${c.outlineStyle}${c.outlineWidth}` : '-', c.textDecorationLine, c.textDecorationThickness, c.fontWeight, c.fontStyle, c.color,
      c.forcedColorAdjust === 'none' ? `fundo:${c.backgroundColor}:${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}:${c.transform}:${c.opacity}` : ''];
    return p.join('|');
  };
  const assinatura = e => {
    const kids = [...e.querySelectorAll('*')].slice(0, 12).map(k => k.tagName === 'svg' ? `svg:${k.innerHTML.length}:${k.innerHTML.slice(0, 80)}` : `${k.tagName}:${pinta(k)}`);
    return `${pinta(e)}#${kids.join(';')}`;
  };
  Object.assign(window.__cf, { F, vis, nome, alfa, borda, contorno, assinatura });
};

/* A. escondido (opacidade 0), a caixa muda? conta os pixels que mudam */
async function aparece(p, h) {
  await h.evaluate(e => { e.scrollIntoView({ block: 'center' }); if (document.activeElement === e) e.blur(); e.style.transition = 'none'; });
  await p.waitForTimeout(120);
  let a, z;
  try {
    a = await h.screenshot({ animations: 'disabled', timeout: 8000 });
    await h.evaluate(e => { e.dataset.cfOp = e.style.opacity; e.style.setProperty('opacity', '0', 'important'); });
    z = await h.screenshot({ animations: 'disabled', timeout: 8000 });
  } catch (err) { return { tinta: -1, area: 0, erro: err.message.split('\n')[0] }; }
  finally { await h.evaluate(e => { e.style.removeProperty('opacity'); if (e.dataset.cfOp) e.style.opacity = e.dataset.cfOp; delete e.dataset.cfOp; e.style.transition = ''; }).catch(() => {}); }
  const [A, Z] = await Promise.all([a, z].map(x => sharp(x).removeAlpha().raw().toBuffer()));
  if (A.length !== Z.length) return { tinta: -1, area: 0 };
  let n = 0;
  for (let i = 0; i < A.length; i += 3) if (Math.max(Math.abs(A[i] - Z[i]), Math.abs(A[i + 1] - Z[i + 1]), Math.abs(A[i + 2] - Z[i + 2])) > 48) n++;
  return { tinta: n, area: A.length / 3 };
}

/* os controles sem texto visível da página (ou de dentro de um seletor) */
async function semTexto(p, dentro = 'body') {
  return p.$$eval(`${dentro} :is(a[href], button, summary, [role="button"])`, els => {
    const { vis, nome } = window.__cf;
    return els.map((e, i) => { e.dataset.cfId = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`; return e; })
      .filter(e => vis(e) && !e.innerText.trim() && !e.querySelector('img, video, picture'))
      .map(e => ({ id: e.dataset.cfId, nome: nome(e), rot: e.getAttribute('aria-label') || '' }));
  });
}

async function testarAparece(p, lista, onde, achados) {
  for (const it of lista) {
    const h = await p.$(`[data-cf-id="${it.id}"]`);
    if (!h) continue;
    const r = await aparece(p, h);
    if (r.erro) { achados.push(`${it.nome}${it.rot ? ` «${it.rot}»` : ''}${onde ? ` (${onde})` : ''}: NÃO MEDIDO (${r.erro})`); continue; }
    const ok = r.tinta > Math.max(6, r.area * 0.003);
    if (!ok) achados.push(`${it.nome}${it.rot ? ` «${it.rot}»` : ''}${onde ? ` (${onde})` : ''}: some (${r.tinta} px mudam em ${r.area})`);
  }
}

/* B, C e D na página como está */
async function forma(p) {
  return p.evaluate(() => {
    const { vis, nome, alfa, borda, contorno } = window.__cf;
    const ruins = {};
    for (const e of document.querySelectorAll('a[href], button, summary, [role="button"]')) {
      if (!vis(e)) continue;
      const c = getComputedStyle(e);
      if (alfa(c.backgroundColor) < 0.3 || borda(c) || contorno(c)) continue;
      const r = e.getBoundingClientRect();
      /* fora da página (o "Pular para o conteúdo" mora acima do topo até ganhar o foco, e aí tem o contorno) */
      if (r.bottom + scrollY <= 0 || r.right + scrollX <= 0) continue;
      const pai = e.parentElement;
      if (pai && borda(getComputedStyle(pai))) { const q = pai.getBoundingClientRect(); if ([r.left - q.left, q.right - r.right, r.top - q.top, q.bottom - r.bottom].filter(d => Math.abs(d) <= 3).length >= 3) continue; }
      const foto = [...e.querySelectorAll('img, video, picture, svg')].some(m => { const q = m.getBoundingClientRect(); return q.width * q.height > r.width * r.height * 0.3; });
      if (foto) continue;
      const k = nome(e); ruins[k] = (ruins[k] || 0) + 1;
    }
    return Object.entries(ruins).map(([k, n]) => `${k} ×${n}`);
  });
}
async function estados(p) {
  /* um grupo de botões de alternar sem nenhum ligado (o dízimo ou a oferta antes da
     escolha) não tem o que comparar: liga o primeiro de cada grupo (o pausar dos
     vídeos tem teste próprio; nenhum desses botões envia nada) */
  const ligar = await p.evaluate(() => {
    const { vis } = window.__cf; const ids = [];
    const grupos = new Map();
    for (const e of document.querySelectorAll('button[aria-pressed]:not(.s-video-pausa)')) { if (!vis(e)) continue; const g = e.parentElement; if (!grupos.has(g)) grupos.set(g, []); grupos.get(g).push(e); }
    for (const [, bs] of grupos) if (bs.length > 1 && !bs.some(x => x.getAttribute('aria-pressed') === 'true')) { bs[0].dataset.cfLiga = '1'; ids.push(1); }
    return ids.length;
  });
  for (let i = 0; i < ligar; i++) { const h = await p.$('[data-cf-liga="1"]'); if (!h) break; await h.evaluate(e => { delete e.dataset.cfLiga; e.scrollIntoView({ block: 'center' }); }); await h.click({ force: true }); await p.waitForTimeout(300); }
  return p.evaluate(() => {
    const { vis, nome, assinatura } = window.__cf;
    const ligado = e => { for (const a of ['aria-pressed', 'aria-current', 'aria-selected', 'aria-checked']) { const v = e.getAttribute(a); if (v !== null) return v !== 'false'; } return false; };
    const caixa = e => e.closest('ul, ol, nav, [role="group"], [role="tablist"], .pg-chips, .trilho-pontos, .s-dom-barras') || e.parentElement;
    const ruins = [], vistos = new Set();
    for (const e of document.querySelectorAll('[aria-pressed], [aria-current], [aria-selected], [aria-checked]')) {
      if (!ligado(e) || !vis(e)) continue;
      const k = nome(e), cx = caixa(e);
      const chave = k + '@' + (cx.className || cx.tagName);
      if (vistos.has(chave)) continue; vistos.add(chave);
      const par = [...cx.querySelectorAll(e.tagName)].find(o => o !== e && nome(o) === k && !ligado(o) && vis(o));
      if (!par) continue;
      if (assinatura(e) === assinatura(par)) ruins.push(`${k} [${['aria-pressed', 'aria-current', 'aria-selected', 'aria-checked'].find(a => e.hasAttribute(a))}]: ligado igual ao desligado`);
    }
    return ruins;
  });
}
async function foco(p) {
  await p.keyboard.press('Tab'); /* o teclado passa a ser o modo: o foco por script também ganha :focus-visible */
  return p.evaluate(() => {
    const { F, vis, nome, contorno } = window.__cf;
    const ruins = {}; let n = 0, sem = 0;
    for (const e of document.querySelectorAll(F)) {
      if (e.tabIndex < 0 || e.disabled || !vis(e)) continue;
      /* a marca pode estar no próprio controle ou num vizinho/invólucro que ganha o
         contorno com o foco (o valor da oferta: a caixa ao lado do campo) */
      const anc = []; for (let a = e.parentElement, i = 0; a && i < 3; a = a.parentElement, i++) anc.push(a);
      const cands = [...anc, ...(e.parentElement ? [...e.parentElement.querySelectorAll('*')].slice(0, 150) : [])].filter(x => x !== e);
      const antes = cands.map(x => contorno(getComputedStyle(x)));
      e.focus({ preventScroll: true });
      if (document.activeElement !== e) continue;
      if (!e.matches(':focus-visible')) { sem++; continue; }
      n++;
      const marca = contorno(getComputedStyle(e)) || cands.some((x, i) => !antes[i] && contorno(getComputedStyle(x)));
      if (!marca) { const k = nome(e); ruins[k] = (ruins[k] || 0) + 1; }
    }
    document.activeElement?.blur?.();
    return { n, sem, ruins: Object.entries(ruins).map(([k, v]) => `${k} ×${v}`) };
  });
}

for (const esquema of ['dark', 'light']) for (const [W, H] of [[390, 844], [1440, 900]]) {
  const cel = W < 1000;
  for (const rota of ROTAS) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: W < 760, hasTouch: cel, deviceScaleFactor: cel ? 2 : 1, forcedColors: 'active', colorScheme: esquema, reducedMotion: 'reduce' });
    await ctx.route('**', r => rotear(r, B));
    const p = await ctx.newPage();
    await p.goto(B + rota, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(500);
    await p.evaluate(AJUDA);
    const ativo = await p.evaluate(() => matchMedia('(forced-colors: active)').matches);
    const nomeTela = `${esquema === 'dark' ? 'escuro' : 'claro'} ${W} ${rota}`;
    if (!ativo) { res(false, `${nomeTela}: o modo de cores forçadas não ligou`); await ctx.close(); continue; }
    if (PASTA && PROVA.has(rota)) await p.screenshot({ path: `${PASTA}/cf-${esquema}-${W}-${rota === '/' ? 'home' : rota.replace(/\//g, '_').slice(1)}.png` });
    const sumiu = [];
    /* A: a página (o topo e o corpo) */
    await testarAparece(p, await semTexto(p), '', sumiu);
    const bForma = await forma(p);
    const cEstado = await estados(p);
    /* o menu do celular aberto: o X aparece, o estado da página aberta se vê */
    if (cel) {
      await p.evaluate(() => scrollTo(0, 0));
      await p.locator('button.s-menu-bt').click(); await p.waitForTimeout(600);
      await testarAparece(p, await semTexto(p, '.s-topo'), 'menu aberto', sumiu);
      cEstado.push(...(await estados(p)).map(x => `${x} (menu aberto)`));
      if (PASTA && rota === '/') await p.screenshot({ path: `${PASTA}/cf-${esquema}-${W}-menu.png` });
      await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    }
    /* a busca aberta: o X aparece; o campo com o foco tem marca */
    await p.evaluate(() => scrollTo(0, 0));
    await p.locator('button[aria-label="Buscar no site"]').click(); await p.waitForTimeout(500);
    await testarAparece(p, await semTexto(p, '.s-busca'), 'busca', sumiu);
    await p.keyboard.type('culto'); await p.waitForTimeout(400);
    const campo = await p.evaluate(() => { const e = document.activeElement; const c = getComputedStyle(e); return { id: e.id, visivel: e.matches(':focus-visible'), marca: c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0 }; });
    const dBusca = campo.marca ? [] : [`#${campo.id} (o campo da busca, com o foco): sem contorno`];
    if (PASTA && rota === '/') await p.screenshot({ path: `${PASTA}/cf-${esquema}-${W}-busca.png` });
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    /* D: o foco de cada controle da página */
    const d = await foco(p);
    const dRuins = [...d.ruins, ...dBusca];
    const ok = !sumiu.length && !bForma.length && !cEstado.length && !dRuins.length;
    res(ok, `${nomeTela}: ${ok ? `tudo aparece; ${d.n} focos com marca` : [
      sumiu.length ? `SOME: ${sumiu.join('; ')}` : '',
      bForma.length ? `SEM FORMA: ${bForma.join(', ')}` : '',
      cEstado.length ? `ESTADO INVISÍVEL: ${cEstado.join('; ')}` : '',
      dRuins.length ? `FOCO SEM MARCA: ${dRuins.join(', ')}` : ''].filter(Boolean).join(' · ')}${d.sem ? ` (${d.sem} sem :focus-visible no teste)` : ''}`);
    await ctx.close();
  }
}

/* o botão de pausar os vídeos (só existe com movimento): parado, aparece nos dois temas */
for (const esquema of ['dark', 'light']) for (const [W, H] of [[390, 844], [1440, 900]]) for (const rota of ['/', '/servir']) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: W < 760, hasTouch: W < 1000, forcedColors: 'active', colorScheme: esquema, reducedMotion: 'no-preference' });
  await ctx.route('**', r => rotear(r, B));
  const p = await ctx.newPage();
  await p.goto(B + rota, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(600);
  await p.evaluate(AJUDA);
  /* os vídeos só baixam perto da tela: rola até cada um e espera tocar */
  const nv = await p.evaluate(() => document.querySelectorAll('video').length);
  for (let i = 0; i < nv; i++) { await p.evaluate(i => { document.documentElement.style.scrollBehavior = 'auto'; document.querySelectorAll('video')[i].scrollIntoView({ block: 'center' }); }, i); await p.waitForTimeout(900); }
  const bt = p.locator('.s-video-pausa').first();
  if (!(await bt.count())) { res(false, `pausar ${esquema} ${W} ${rota}: sem botão`); await ctx.close(); continue; }
  await bt.click(); await p.waitForTimeout(500); /* parado: os quadros não mudam entre as duas capturas */
  const sumiu = [];
  const ids = await p.$$eval('.s-video-pausa', els => els.filter(e => window.__cf.vis(e)).map((e, i) => { e.dataset.cfId = `pausa-${i}`; return { id: `pausa-${i}`, nome: 'button.s-video-pausa', rot: e.getAttribute('aria-label') }; }));
  await testarAparece(p, ids, 'parado', sumiu);
  res(!sumiu.length, `pausar ${esquema === 'dark' ? 'escuro' : 'claro'} ${W} ${rota}: ${ids.length} botão(ões) ${sumiu.length ? `· SOME: ${sumiu.join('; ')}` : 'aparecem'}`);
  await ctx.close();
}
await b.close();
console.log(ruins ? `\n${ruins} tela(s) com problema nas cores forçadas` : '\ntudo aparece nas cores forçadas');
process.exit(ruins ? 1 : 0);
