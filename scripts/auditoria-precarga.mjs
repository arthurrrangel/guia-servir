/* =============================================================================
   AUDITORIA · O QUE A PÁGINA PRÉ-CARREGA SEM A PESSOA PEDIR (22/10/2026)

   O <Link> do Next pré-carrega a página de cada link que está na área da
   tela. A cortina do menu, os painéis da barra e a lista da busca ficam no
   DOM e na área da tela mesmo fechados (opacidade 0, visibility, inert), e
   eram pré-carregados a cada página aberta. Aqui, nos três sites, no celular
   e no computador:

     A. ao abrir a página, sem tocar em nada: nenhuma pré-carga vem de link
        escondido (cada página pré-carregada tem um link VISÍVEL na tela que
        leva a ela, fora da barra, da cortina e da busca);
     B. abrir o menu (celular) ou passar o mouse no primeiro grupo (computador)
        pré-carrega os destinos dele;
     C. tocar num destino da cortina leva à página.

     PORTA=3800 node scripts/auditoria-precarga.mjs
   Sai com 1 se algum caso falhar.
   ============================================================================= */
import { chromium } from 'playwright';
import { rotear } from './_rpc-mock.mjs';
const B = `http://localhost:${process.env.PORTA || 3700}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let ruins = 0;
const res = (ok, txt) => { if (!ok) ruins++; console.log(`${ok ? 'ok ' : 'MAL'} ${txt}`); };
const caminho = u => { try { const x = new URL(u); return x.pathname; } catch { return u; } };

for (const [W, H] of [[390, 844], [1440, 900]]) for (const rota of ['/', '/servir', '/follow']) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, isMobile: W < 760, hasTouch: W < 1000, reducedMotion: 'reduce' });
  await ctx.route('**', r => rotear(r, B));
  const p = await ctx.newPage();
  const pre = [];
  p.on('request', rq => { const u = rq.url(); if (u.includes('_rsc=') && rq.method() === 'GET') pre.push(caminho(u)); });
  await p.goto(B + rota, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(2500);
  /* A. cada página pré-carregada tem um link visível na tela, fora da barra/cortina/busca */
  const visiveis = await p.evaluate(() => [...document.querySelectorAll('a[href]')].filter(a => {
    if (a.closest('.s-topo, #s-cortina, .s-busca, [inert]')) return false;
    const r = a.getBoundingClientRect(); const c = getComputedStyle(a);
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight + 200 && c.visibility !== 'hidden' && +c.opacity > 0;
  }).map(a => new URL(a.href, location.href).pathname));
  const naCarga = [...new Set(pre)];
  const deEscondido = naCarga.filter(c => !visiveis.includes(c));
  res(!deEscondido.length, `A ${W} ${rota}: ${naCarga.length} pré-carga(s) na abertura${naCarga.length ? ' (' + naCarga.join(', ') + ')' : ''}${deEscondido.length ? ' · DE LINK ESCONDIDO: ' + deEscondido.join(', ') : ', todas de link visível'}`);
  /* B. abrir o menu / passar o mouse pré-carrega os destinos */
  const antes = pre.length;
  let destinos = [];
  if (W < 1000) {
    /* só a lista da cortina: o "Já sirvo" do pé e o Follow Camp são <a> comuns (o
       sistema e o HTML estático do retiro), que o Next nunca pré-carrega */
    destinos = await p.evaluate(() => [...document.querySelectorAll('#s-cortina .s-cortina-lista a[href]')].map(a => a.getAttribute('href')).filter(h => h.startsWith('/') && !h.includes('#') && !/^\/(followcamp|eu)(\/|$)/.test(h)));
    await p.locator('button.s-menu-bt').click(); await p.waitForTimeout(2000);
  } else {
    const li = p.locator('.s-nav > li:has(.s-sub)').first();
    destinos = await li.evaluate(e => [...e.querySelectorAll('.s-sub a[href]')].map(a => a.getAttribute('href')).filter(h => h.startsWith('/') && !h.includes('#') && !/^\/(followcamp|eu)(\/|$)/.test(h)));
    await li.hover(); await p.waitForTimeout(2000);
  }
  const novos = [...new Set(pre.slice(antes))];
  const alvo = [...new Set(destinos.map(caminho))].filter(d => d !== rota && !naCarga.includes(d));
  const faltam = alvo.filter(d => !novos.includes(d) && !naCarga.includes(d));
  res(!faltam.length, `B ${W} ${rota}: ${W < 1000 ? 'abrir o menu' : 'o mouse no primeiro grupo'} → ${novos.length} pré-carga(s)${alvo.length ? ` para ${alvo.length} destino(s) que faltavam` : ''}${faltam.length ? ' · SEM PRÉ-CARGA: ' + faltam.join(', ') : ''}`);
  /* C. tocar num destino da cortina navega */
  if (W < 1000) {
    const link = p.locator('#s-cortina a[href^="/"]:not([href*="#"])').first();
    const href = await link.getAttribute('href');
    await link.click(); await p.waitForTimeout(1500);
    const agora = await p.evaluate(() => location.pathname);
    res(agora === href.split('?')[0], `C ${W} ${rota}: tocar em ${href} → ${agora}`);
  }
  await ctx.close();
}
await b.close();
console.log(ruins ? `\n${ruins} caso(s) com problema na pré-carga` : '\nsó pré-carrega o que está à vista ou o que a pessoa abriu');
process.exit(ruins ? 1 : 0);
