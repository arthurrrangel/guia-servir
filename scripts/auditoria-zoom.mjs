/* =============================================================================
   AUDITORIA · O ZOOM DO NAVEGADOR NO COMPUTADOR (WCAG 1.4.4, 1.4.10, 2.4.11)
   (22/10/2026)

   Quem aumenta o zoom no computador não vira celular: o Chrome a 200% numa
   tela de 1280×800 desenha a página numa janela de 640×400 px, com mouse, sem
   toque e com hover; a 400% numa de 1280×1024 (a referência da WCAG 1.4.10),
   numa de 320×256. As outras auditorias têm a largura do celular, mas não a
   altura baixa nem o mouse. Em cada rota, nos dois zooms:

     A. nada pede rolagem para o lado (a página cabe na largura);
     B. nenhum texto cortado (caixa com overflow escondido e texto do lado de fora);
     C. o que fica preso na tela (a barra) deixa pelo menos 65% da altura;
     D. o foco do teclado nunca fica inteiro debaixo do que é fixo (2.4.11),
        indo (Tab desde o topo) e voltando (Shift+Tab desde o fim);
     E. o menu e a busca abrem e cada destino deles recebe o foco à vista;
     F. o texto cresce (1.4.4, a falha F94 da WCAG): com o zoom do navegador,
        até o máximo dele (500%), o corpo, os títulos e os botões chegam a
        pelo menos o dobro do que mediam a 100%. Os números a 200% e 400%
        são informados; a régua é a 500% (só a medida, sem A a E: a WCAG
        só pede refluxo até 320 px).

     PORTA=3800 node scripts/auditoria-zoom.mjs        ROTAS=/,/servir filtra
   Sai com 1 se A a E falharem; com 3 se só o F falhar (o texto que não
   dobra é decisão de tipografia, fica pendente e não esconde o resto).
   ============================================================================= */
import { chromium } from 'playwright';
import { rotear, rolarTudo, ROTAS_SITE } from './_rpc-mock.mjs';
const B = `http://localhost:${process.env.PORTA || 3700}`;
const ROTAS = process.env.ROTAS ? process.env.ROTAS.split(',') : ROTAS_SITE.filter(r => r !== '/rota-que-nao-existe');
const ZOOMS = [
  { nome: '200%', z: 2, viewport: { width: 640, height: 400 } },
  { nome: '400%', z: 4, viewport: { width: 320, height: 256 } },
];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let ruins = 0, pendentes = 0;
const res = (ok, txt) => { if (!ok) ruins++; console.log(`${ok ? 'ok ' : 'MAL'} ${txt}`); };

/* no navegador: o que é fixo na tela, e se um elemento está à vista (amostra de pontos) */
const AJUDA = () => {
  document.documentElement.style.scrollBehavior = 'auto';
  const fixos = () => [...document.querySelectorAll('body *')].filter(e => {
    const c = getComputedStyle(e);
    if (c.position !== 'fixed' && c.position !== 'sticky') return false;
    if (c.visibility === 'hidden' || +c.opacity < 0.05 || c.display === 'none') return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  });
  /* quanto do elemento se vê: pontos da caixa (dentro da tela) que acertam ele mesmo */
  const avista = e => {
    const r = e.getBoundingClientRect();
    const x0 = Math.max(r.left, 0), x1 = Math.min(r.right, innerWidth), y0 = Math.max(r.top, 0), y1 = Math.min(r.bottom, innerHeight);
    if (x1 - x0 < 1 || y1 - y0 < 1) return { total: 15, vistos: 0, fora: true };
    let vistos = 0, total = 0;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
      const x = x0 + (x1 - x0) * (i + 0.5) / 5, y = y0 + (y1 - y0) * (j + 0.5) / 3;
      const h = document.elementFromPoint(x, y); total++;
      if (h && (h === e || e.contains(h) || h.contains(e))) vistos++;
    }
    return { total, vistos, fora: false };
  };
  const nome = e => `${e.tagName.toLowerCase()}${e.classList.length ? '.' + [...e.classList].slice(0, 2).join('.') : ''}${e.id ? '#' + e.id : ''} «${(e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)}»`;
  window.__z = { fixos, avista, nome };
};

/* F. os tamanhos de texto que importam, medidos na página como está */
const TAMANHOS = () => {
  const vis = e => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.display !== 'none'; };
  const primeiro = (sel, f = () => true) => [...document.querySelectorAll(sel)].find(e => vis(e) && f(e));
  const corpo = primeiro('main p', e => e.textContent.trim().length >= 60 && !e.closest('.s-heroi, .s-scrub, .s-chapeu'));
  const itens = { h1: primeiro('main h1'), h2: primeiro('main h2'), corpo, botao: primeiro('main .s-pil, main .acao'), chapeu: primeiro('main .s-chapeu') };
  return Object.fromEntries(Object.entries(itens).filter(([, e]) => e).map(([k, e]) => [k, parseFloat(getComputedStyle(e).fontSize)]));
};

/* B. texto cortado (a mesma régua da auditoria de espaçamento) */
const CORTES = () => {
  const out = [];
  const leitor = e => { const cs = getComputedStyle(e); return cs.position === 'absolute' && (parseFloat(cs.width) <= 1 || parseFloat(cs.height) <= 1) || cs.clip !== 'auto' && cs.clip !== '' || cs.clipPath === 'inset(50%)'; };
  for (const e of document.querySelectorAll('body *')) {
    if (!e.textContent || !e.textContent.trim()) continue;
    if (e.closest('[aria-hidden="true"], [inert], .leaflet-container, .s-busca, .s-cortina, svg, script, style, noscript')) continue;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    if (e.clientHeight < 6 || e.clientWidth < 6 || leitor(e)) continue;
    const escY = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
    const escX = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
    const corteY = escY && e.scrollHeight > e.clientHeight + 2;
    const corteX = escX && e.scrollWidth > e.clientWidth + 2;
    if (!corteY && !corteX) continue;
    const cx = e.getBoundingClientRect();
    let fora = false;
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n && !fora; n = w.nextNode()) {
      if (!n.textContent.trim()) continue;
      if (n.parentElement.closest('[aria-hidden="true"]')) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const q of rg.getClientRects()) {
        if (q.width < 1) continue;
        if (corteY && (q.bottom > cx.bottom + 2 || q.top < cx.top - 2)) fora = true;
        if (corteX && (q.right > cx.right + 2 || q.left < cx.left - 2)) fora = true;
      }
    }
    if (fora) out.push(`${e.tagName.toLowerCase()}.${String(e.className).trim().split(/\s+/).slice(0, 2).join('.')} «${e.textContent.trim().replace(/\s+/g, ' ').slice(0, 32)}»`);
  }
  return [...new Set(out)].slice(0, 6);
};

/* A. o que passa da largura (fora de um trilho que rola de lado) */
const ESTOURO = () => {
  if (document.documentElement.scrollWidth <= innerWidth + 1) return null;
  const rola = e => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const c = getComputedStyle(a); if (/(auto|scroll|hidden|clip)/.test(c.overflowX)) return true; } return false; };
  const culpados = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > innerWidth + 1 && !rola(e); })
    .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right).slice(0, 3)
    .map(e => `${e.tagName.toLowerCase()}.${String(e.className).trim().split(/\s+/).slice(0, 2).join('.')} (até ${Math.round(e.getBoundingClientRect().right)})`);
  return `página com ${document.documentElement.scrollWidth} px numa janela de ${innerWidth}: ${culpados.join(', ')}`;
};

/* a 100%, numa tela de 1280×800: os tamanhos de referência */
const base = {};
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await ctx.route('**', r => rotear(r, B));
  for (const rota of ROTAS) {
    const p = await ctx.newPage();
    await p.goto(B + rota, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(300);
    base[rota] = await p.evaluate(TAMANHOS);
    await p.close();
  }
  await ctx.close();
}

for (const Z of ZOOMS) for (const rota of ROTAS) {
  const ctx = await b.newContext({ viewport: Z.viewport, deviceScaleFactor: Z.z, isMobile: false, hasTouch: false, reducedMotion: 'reduce' });
  await ctx.route('**', r => rotear(r, B));
  const p = await ctx.newPage();
  await p.goto(B + rota, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(400);
  await p.evaluate(AJUDA);
  await rolarTudo(p);
  const mal = [], info = [];
  /* A e B */
  const est = await p.evaluate(ESTOURO); if (est) mal.push(`ROLA DE LADO: ${est}`);
  const cortes = await p.evaluate(CORTES); if (cortes.length) mal.push(`TEXTO CORTADO: ${cortes.join('; ')}`);
  /* C. o que fica preso, no meio da página */
  const preso = await p.evaluate(async () => {
    scrollTo(0, Math.min(1400, document.body.scrollHeight / 2)); await new Promise(r => setTimeout(r, 400));
    const fs = window.__z.fixos().filter(e => !window.__z.fixos().some(o => o !== e && o.contains(e)));
    let topo = 0, baixo = 0;
    for (const e of fs) { const r = e.getBoundingClientRect(); if (r.top <= 1) topo = Math.max(topo, Math.min(r.bottom, innerHeight)); else if (r.bottom >= innerHeight - 1) baixo = Math.max(baixo, innerHeight - Math.max(r.top, 0)); }
    return { frac: (topo + baixo) / innerHeight, topo: Math.round(topo), baixo: Math.round(baixo), quem: fs.map(e => `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}`).join(', ') };
  });
  (preso.frac > 0.35 ? mal : info).push(`${preso.frac > 0.35 ? 'PRESO DEMAIS' : 'preso'}: ${Math.round(preso.frac * 100)}% da altura (topo ${preso.topo}, baixo ${preso.baixo} px${preso.quem ? ': ' + preso.quem : ''})`);
  /* D. o foco, indo e voltando */
  await p.evaluate(() => { scrollTo(0, 0); document.activeElement?.blur?.(); });
  const enc = [], parcial = [];
  const olhaFoco = async () => p.evaluate(() => {
    const e = document.activeElement; if (!e || e === document.body) return null;
    if (window.__z.fixos().some(f => f.contains(e))) return null; /* o foco dentro da própria barra */
    const v = window.__z.avista(e);
    return { nome: window.__z.nome(e), ...v };
  });
  let vistos = 0;
  for (let i = 0; i < 45; i++) {
    await p.keyboard.press('Tab'); await p.waitForTimeout(40);
    const f = await olhaFoco(); if (!f) continue; vistos++;
    if (f.vistos === 0) enc.push(`${f.nome}${f.fora ? ' (fora da tela)' : ''}`); else if (f.vistos < f.total) parcial.push(f.nome);
  }
  await p.evaluate(() => { const fs = [...document.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && !e.closest('[inert]') && getComputedStyle(e).visibility !== 'hidden'; }); fs.at(-1)?.focus(); });
  for (let i = 0; i < 25; i++) {
    await p.keyboard.press('Shift+Tab'); await p.waitForTimeout(40);
    const f = await olhaFoco(); if (!f) continue; vistos++;
    if (f.vistos === 0) enc.push(`${f.nome} (voltando)${f.fora ? ' (fora da tela)' : ''}`); else if (f.vistos < f.total) parcial.push(f.nome);
  }
  if (enc.length) mal.push(`FOCO ENCOBERTO: ${[...new Set(enc)].slice(0, 5).join('; ')}`);
  info.push(`foco: ${vistos} paradas${parcial.length ? `, ${parcial.length} parcialmente sob a barra` : ', todas inteiras à vista'}`);
  /* E. o menu e a busca */
  await p.evaluate(() => { scrollTo(0, 0); document.activeElement?.blur?.(); });
  const menuBt = p.locator('button.s-menu-bt');
  if (await menuBt.isVisible()) {
    await menuBt.click(); await p.waitForTimeout(500);
    const total = await p.evaluate(() => document.querySelectorAll('#s-cortina a[href]').length);
    const vistosM = new Set(), escondidos = new Set();
    for (let i = 0; i < total + 6; i++) {
      await p.keyboard.press('Tab'); await p.waitForTimeout(40);
      const f = await p.evaluate(() => { const e = document.activeElement; if (!e.closest('#s-cortina')) return null; const v = window.__z.avista(e); return { nome: window.__z.nome(e), ok: v.vistos > 0 }; });
      if (f) (f.ok ? vistosM : escondidos).add(f.nome);
    }
    if (escondidos.size || vistosM.size < total) mal.push(`MENU: ${vistosM.size}/${total} destinos à vista com o foco${escondidos.size ? ' · escondidos: ' + [...escondidos].slice(0, 3).join('; ') : ''}`);
    else info.push(`menu: ${total}/${total} destinos à vista`);
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  }
  await p.locator('button[aria-label="Buscar no site"]').click(); await p.waitForTimeout(500);
  await p.keyboard.type('culto'); await p.waitForTimeout(500);
  const nRes = await p.evaluate(() => document.querySelectorAll('.s-busca li a').length);
  const campo = await p.evaluate(() => { const e = document.activeElement; return e.id === 's-busca-campo' && window.__z.avista(e).vistos > 0; });
  const vistosB = new Set(), escB = new Set();
  for (let i = 0; i < nRes + 2; i++) {
    await p.keyboard.press('Tab'); await p.waitForTimeout(40);
    const f = await p.evaluate(() => { const e = document.activeElement; if (!e.closest('.s-busca li')) return null; const v = window.__z.avista(e); return { nome: window.__z.nome(e), ok: v.vistos > 0 }; });
    if (f) (f.ok ? vistosB : escB).add(f.nome);
  }
  if (!campo || escB.size || vistosB.size < nRes) mal.push(`BUSCA: campo ${campo ? 'à vista' : 'ESCONDIDO'}, ${vistosB.size}/${nRes} resultados à vista com o foco${escB.size ? ' · escondidos: ' + [...escB].slice(0, 3).join('; ') : ''}`);
  else info.push(`busca: ${nRes}/${nRes} resultados à vista`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  /* F. o texto cresce */
  await p.evaluate(() => scrollTo(0, 0));
  const tam = await p.evaluate(TAMANHOS);
  const cres = Object.entries(tam).filter(([k]) => base[rota]?.[k]).map(([k, v]) => [k, (v * Z.z) / base[rota][k]]);
  const pouco = cres.filter(([, r]) => r < 2);
  const txtCres = cres.map(([k, r]) => `${k} ${r.toFixed(2)}×`).join(', ');
  info.push(`texto: ${txtCres}`);
  res(!mal.length, `${Z.nome} ${rota}: ${mal.length ? mal.join(' · ') + ' · ' : ''}${info.join(' · ')}`);
  await ctx.close();
}
/* F. no máximo do navegador (500% numa tela de 1280×1024: 256×205 px) */
for (const rota of ROTAS) {
  const ctx = await b.newContext({ viewport: { width: 256, height: 205 }, deviceScaleFactor: 5, isMobile: false, hasTouch: false, reducedMotion: 'reduce' });
  await ctx.route('**', r => rotear(r, B));
  const p = await ctx.newPage();
  await p.goto(B + rota, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(300);
  const tam = await p.evaluate(TAMANHOS);
  const cres = Object.entries(tam).filter(([k]) => base[rota]?.[k]).map(([k, v]) => [k, (v * 5) / base[rota][k]]);
  const pouco = cres.filter(([, r]) => r < 2);
  if (pouco.length) pendentes++;
  console.log(`${pouco.length ? 'PENDENTE' : 'ok '} 500% ${rota}: ${pouco.length ? `NÃO DOBRA: ${pouco.map(([k, r]) => `${k} ${r.toFixed(2)}×`).join(', ')} · ` : ''}texto: ${cres.map(([k, r]) => `${k} ${r.toFixed(2)}×`).join(', ')}`);
  await ctx.close();
}
await b.close();
console.log(ruins ? `\n${ruins} tela(s) com problema no zoom de 200% e 400%` : '\no zoom de 200% e 400% não perde nada (largura, corte, barra, foco, menu e busca)');
if (pendentes) console.log(`${pendentes} rota(s) com texto que não chega ao dobro nem a 500% (1.4.4): pendente`);
process.exit(ruins ? 1 : pendentes ? 3 : 0);
