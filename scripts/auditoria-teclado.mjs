/* =============================================================================
   AUDITORIA · O SITE SÓ NO TECLADO (22/10/2026)

   Quem não usa mouse nem dedo (teclado, controle por botão, leitor de tela)
   precisa chegar a tudo, ver onde está e sair de qualquer painel. Nos três sites:
     A. o primeiro Tab cai no "Pular para o conteúdo", visível, e o Enter leva
        ao conteúdo;
     B. a página inteira no Tab (até 90): cada parada visível, com indicador de foco (contorno ou
        sombra), sem cair dentro de painel fechado, de coisa escondida ou atrás
        de um painel aberto;
     C. o submenu da barra (computador): o foco no botão sozinho não abre; Enter
        abre, Tab entra, Esc fecha (o painel some) e o foco volta para o botão do
        grupo; fechado, o Tab pula os links do painel; o Tab que sai do grupo
        fecha o painel;
     D. a busca: Enter abre com o foco no campo, os Tabs ficam dentro dela (é um
        diálogo; o resto da página inerte), Esc fecha e o foco volta para a lupa;
     E. o menu do celular: Enter abre, os Tabs ficam no menu e na barra (o resto
        inerte), Esc fecha e o foco volta para o botão;
     F. a faixa que desliza (o trio da home, no celular): com foco, a seta anda;
     G. o filtro das Pequenas Guias: Enter no "Quarta" filtra;
     H. as perguntas que abrem: Enter abre, espaço fecha;
     I. o painel que o mouse abriu some com Esc sem tirar o mouse (WCAG 1.4.13)
        e volta quando o mouse sai e entra de novo;
     J. a cortina aberta no iPad em pé fecha quando ele deita (a barra larga não
        tem o botão de fechar) e a página deixa de ser inerte.
   Requer o servidor: PORTA=3800 node scripts/auditoria-teclado.mjs
   Sai com 1 se algum caso falhar.
   ============================================================================= */
import { chromium } from 'playwright';
import { rotear } from './_rpc-mock.mjs';
const B = `http://localhost:${process.env.PORTA || 3700}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let ruins = 0;
const res = (ok, txt) => { if (!ok) ruins++; console.log(`${ok ? 'ok ' : 'MAL'} ${txt}`); };
async function abrir(W, H, rota) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, reducedMotion: 'reduce', isMobile: false, hasTouch: false });
  await ctx.route('**', r => rotear(r, B));
  const p = await ctx.newPage();
  await p.goto(B + rota, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(400);
  return { ctx, p };
}
/* o que está com o foco, e se dá para ver */
const foco = p => p.evaluate(() => {
  const e = document.activeElement;
  if (!e || e === document.body) return { nada: true };
  const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
  const desc = `${e.tagName.toLowerCase()}${e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/)[0] : ''} «${(e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)}»`;
  const naTela = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  const marca = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
  const escondido = !!e.closest('[inert], [aria-hidden="true"]') || cs.visibility === 'hidden' || +cs.opacity === 0;
  /* atrás de painel: o ponto do meio é de outro elemento (que não é ele, nem dentro, nem o pai dele) */
  let atras = false;
  if (naTela) { const n = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))); atras = !!n && !(n === e || e.contains(n) || n.contains(e)); }
  const dentro = sel => !!e.closest(sel);
  return { desc, naTela, marca, escondido, atras, busca: dentro('.s-busca'), cortina: dentro('.s-cortina'), topo: dentro('.s-topo'), main: dentro('main'), sub: e.closest('.s-sub')?.id || null };
});
const tab = async (p, shift) => { await p.keyboard.press(shift ? 'Shift+Tab' : 'Tab'); await p.waitForTimeout(60); };

for (const rota of ['/', '/servir', '/follow']) {
  console.log(`\n== ${rota}`);
  /* A. pular para o conteúdo */
  {
    const { ctx, p } = await abrir(1440, 900, rota);
    await tab(p);
    const f = await foco(p);
    const ehPular = /Pular para o conteúdo/.test(f.desc || '');
    await p.keyboard.press('Enter'); await p.waitForTimeout(300);
    const destino = await p.evaluate(() => ({ hash: location.hash, topoMain: Math.round(document.querySelector('main')?.getBoundingClientRect().top ?? 9999) }));
    res(ehPular && f.naTela && f.marca && destino.hash === '#conteudo' && destino.topoMain < 200, `A ${rota}: 1º Tab ${f.desc || '(nada)'}${f.naTela ? ', visível' : ', FORA DA TELA'}${f.marca ? '' : ', SEM MARCA'}; Enter → ${destino.hash || '(sem âncora)'}, conteúdo a ${destino.topoMain}px do topo`);
    await ctx.close();
  }
  /* B. 60 Tabs */
  {
    const { ctx, p } = await abrir(1440, 900, rota);
    const ruinsB = [];
    const vistos = new Set();
    let volta = null;
    for (let i = 0; i < 90; i++) {
      await tab(p);
      const f = await foco(p);
      if (f.nada) {
        /* o fim da página: o Tab seguinte tem que voltar ao começo (o "Pular") */
        await tab(p);
        const g = await foco(p);
        volta = i + 1;
        if (!/Pular para o conteúdo/.test(g.desc || '')) ruinsB.push(`#${i + 1} foco no corpo da página e o Tab seguinte não voltou ao começo (${g.desc || 'corpo'})`);
        break;
      }
      vistos.add(f.desc);
      if (!f.naTela) ruinsB.push(`#${i + 1} ${f.desc} fora da tela`);
      else if (!f.marca) ruinsB.push(`#${i + 1} ${f.desc} sem marca de foco`);
      if (f.escondido) ruinsB.push(`#${i + 1} ${f.desc} escondido (inert/aria-hidden/invisível)`);
      if (f.atras) ruinsB.push(`#${i + 1} ${f.desc} atrás de outra coisa`);
    }
    res(!ruinsB.length, `B ${rota}: ${volta ? `a página inteira em ${volta - 1} Tabs (o seguinte volta ao começo)` : '60 Tabs'}, ${vistos.size} paradas diferentes${ruinsB.length ? ' · ' + ruinsB.slice(0, 4).join(' · ') : ', todas visíveis e com marca'}`);
    await ctx.close();
  }
  /* C. o submenu da barra */
  {
    const { ctx, p } = await abrir(1440, 900, rota);
    const bt = p.locator('button.s-nav-bt[aria-expanded]').first();
    if (await bt.count()) {
      const visPainel = id => p.evaluate(id => { const e = document.getElementById(id); const c = e && getComputedStyle(e); return !!c && c.visibility !== 'hidden' && +c.opacity > 0; }, id);
      const sub = await bt.getAttribute('aria-controls');
      await bt.focus(); await p.waitForTimeout(300);
      const soFoco = await visPainel(sub);
      /* fechado, o Tab vai para o próximo item da barra, não para dentro do painel */
      await tab(p);
      const fPula = await foco(p);
      await bt.focus();
      await p.keyboard.press('Enter'); await p.waitForTimeout(250);
      const aberto = await bt.getAttribute('aria-expanded');
      await tab(p);
      const f1 = await foco(p);
      await p.keyboard.press('Escape'); await p.waitForTimeout(350);
      const fechado = await bt.getAttribute('aria-expanded');
      const sumiu = !(await visPainel(sub));
      const volta = await p.evaluate(() => document.activeElement?.classList.contains('s-nav-bt') && document.activeElement.getAttribute('aria-expanded') !== null);
      /* abre de novo e passa por todos os links: o Tab que sai do grupo fecha o painel */
      await p.keyboard.press('Enter'); await p.waitForTimeout(250);
      const nLinks = await p.locator(`#${sub} a`).count();
      for (let i = 0; i <= nLinks; i++) await tab(p);
      const fSaiu = await foco(p);
      const fechouAoSair = (await bt.getAttribute('aria-expanded')) === 'false';
      const ok = !soFoco && !fPula.sub && aberto === 'true' && !!f1.sub && fechado === 'false' && sumiu && volta && !fSaiu.sub && fechouAoSair;
      res(ok, `C ${rota}: só o foco no botão ${soFoco ? 'JÁ ABRE o painel' : 'não abre'}; fechado, o Tab ${fPula.sub ? 'ENTRA no painel (' + fPula.desc + ')' : 'pula o painel (' + fPula.desc + ')'}; Enter abre (${aberto}), Tab entra (${f1.sub ? 'no ' + f1.sub : 'FORA do submenu: ' + f1.desc}), Esc fecha (${fechado}${sumiu ? ', o painel some' : ', o painel CONTINUA NA TELA'}) e o foco ${volta ? 'volta para o botão' : 'NÃO volta para o botão'}; Tab depois do último dos ${nLinks} links → ${fSaiu.desc || 'corpo'}, painel ${fechouAoSair ? 'fechado' : 'AINDA ABERTO'}`);
    } else res(true, `C ${rota}: sem submenu na barra`);
    await ctx.close();
  }
  /* D. a busca */
  {
    const { ctx, p } = await abrir(1440, 900, rota);
    await p.locator('button[aria-label="Buscar no site"]').focus();
    await p.keyboard.press('Enter'); await p.waitForTimeout(350);
    const f0 = await p.evaluate(() => document.activeElement?.id);
    await p.keyboard.type('culto'); await p.waitForTimeout(250);
    const n = await p.locator('.s-busca li a').count();
    const inerteAberta = await p.evaluate(() => ({ main: !!document.querySelector('main')?.closest('[inert]'), topo: !!document.querySelector('.s-topo')?.closest('[inert]') }));
    const fora = [];
    for (let i = 0; i < n + 4; i++) { await tab(p); const f = await foco(p); if (!f.busca) fora.push(f.nada ? 'corpo' : f.desc); }
    for (let i = 0; i < 3; i++) { await tab(p, true); const f = await foco(p); if (!f.busca) fora.push('⇧ ' + (f.nada ? 'corpo' : f.desc)); }
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    const fim = await p.evaluate(() => ({ aberta: document.querySelector('.s-busca')?.classList.contains('aberta'), volta: document.activeElement?.getAttribute('aria-label') === 'Buscar no site', inerte: !!document.querySelector('main')?.closest('[inert]') }));
    res(f0 === 's-busca-campo' && n > 0 && inerteAberta.main && inerteAberta.topo && !fora.length && !fim.aberta && fim.volta && !fim.inerte, `D ${rota}: Enter abre com o foco ${f0 === 's-busca-campo' ? 'no campo' : 'FORA do campo (' + f0 + ')'}, ${n} resultados para "culto", página e barra ${inerteAberta.main && inerteAberta.topo ? 'inertes' : 'NÃO inertes'} atrás dela, Tabs ${fora.length ? 'SAEM do diálogo: ' + fora.slice(0, 3).join(', ') : 'ficam no diálogo'}, Esc ${fim.aberta ? 'NÃO fecha' : 'fecha'} e o foco ${fim.volta ? 'volta para a lupa' : 'NÃO volta para a lupa'}${fim.inerte ? ', a página FICOU inerte' : ''}`);
    await ctx.close();
  }
  /* E. o menu do celular */
  {
    const { ctx, p } = await abrir(390, 844, rota);
    const bt = p.locator('button.s-menu-bt');
    await bt.focus();
    await p.keyboard.press('Enter'); await p.waitForTimeout(400);
    const aberto = await bt.getAttribute('aria-expanded');
    const nLinks = await p.locator('#s-cortina a').count();
    const inerteAberto = await p.evaluate(() => ({ main: !!document.querySelector('main')?.closest('[inert]'), topo: !!document.querySelector('.s-topo')?.closest('[inert]') }));
    const fora = [];
    for (let i = 0; i < nLinks + 5; i++) { await tab(p); const f = await foco(p); if (!(f.cortina || f.topo)) fora.push(f.nada ? 'corpo' : f.desc); }
    await p.keyboard.press('Escape'); await p.waitForTimeout(400);
    const fim = await p.evaluate(() => ({ aberto: document.querySelector('.s-menu-bt')?.getAttribute('aria-expanded'), volta: document.activeElement?.classList.contains('s-menu-bt'), inerte: !!document.querySelector('main')?.closest('[inert]') }));
    res(aberto === 'true' && inerteAberto.main && !inerteAberto.topo && !fora.length && fim.aberto === 'false' && fim.volta && !fim.inerte, `E ${rota} (390): Enter abre (${aberto}), ${nLinks} links, página ${inerteAberto.main ? 'inerte' : 'NÃO inerte'} e barra ${inerteAberto.topo ? 'INERTE' : 'livre'}, Tabs ${fora.length ? 'SAEM do menu para trás dele: ' + fora.slice(0, 3).join(', ') : 'ficam no menu e na barra'}, Esc fecha (${fim.aberto}) e o foco ${fim.volta ? 'volta para o botão' : 'NÃO volta para o botão'}${fim.inerte ? ', a página FICOU inerte' : ''}`);
    await ctx.close();
  }
}

/* F. a faixa que desliza (o trio da home, no celular) */
{
  const { ctx, p } = await abrir(390, 844, '/');
  const t = p.locator('.s-trio');
  await t.focus();
  const antes = await t.evaluate(e => e.scrollLeft);
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500);
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500);
  const depois = await t.evaluate(e => e.scrollLeft);
  const f = await foco(p);
  res(depois > antes && f.marca, `F /: a faixa do trio com foco (${f.marca ? 'com marca' : 'SEM marca'}), duas setas → andou ${Math.round(depois - antes)}px`);
  await ctx.close();
}
/* G. o filtro das Pequenas Guias */
{
  const { ctx, p } = await abrir(1440, 900, '/pequena-guia');
  const chip = p.locator('.pg-chip', { hasText: 'Quarta' });
  await chip.focus();
  await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  const r = await p.evaluate(() => ({ ativo: document.querySelector('.pg-chip[aria-pressed="true"]')?.firstChild?.textContent, n: [...document.querySelectorAll('.pgs > .pg')].filter(e => getComputedStyle(e).display !== 'none').length }));
  res(r.ativo === 'Quarta' && r.n === 4, `G /pequena-guia: Enter no "Quarta" → filtro "${r.ativo}", ${r.n} cartões`);
  await ctx.close();
}
/* H. as perguntas que abrem */
/* no computador as perguntas são a lista do PDF; no celular, o acordeão. Na
   home do Church a faixa de perguntas é só do computador (so-largo, desde o
   celular minimalista de 14/10): no celular elas ficam em /cultos */
for (const rota of ['/cultos', '/servir', '/follow']) {
  const { ctx, p } = await abrir(390, 844, rota);
  const s = p.locator('details > summary:visible').first();
  if (!(await s.count())) { res(false, `H ${rota} (390): nenhuma pergunta que abre visível`); await ctx.close(); continue; }
  await s.scrollIntoViewIfNeeded(); await s.focus();
  const a0 = await s.evaluate(e => e.parentElement.open);
  await p.keyboard.press('Enter'); await p.waitForTimeout(200);
  const a1 = await s.evaluate(e => e.parentElement.open);
  await p.keyboard.press(' '); await p.waitForTimeout(200);
  const a2 = await s.evaluate(e => e.parentElement.open);
  const f = await foco(p);
  res(a1 !== a0 && a2 === a0 && f.marca, `H ${rota} (390): Enter ${a1 !== a0 ? (a1 ? 'abre' : 'fecha') : 'NÃO muda'}, espaço ${a2 === a0 ? 'volta' : 'NÃO volta'}, marca de foco ${f.marca ? 'sim' : 'NÃO'}`);
  await ctx.close();
}
/* I. o painel que o mouse abriu: Esc cala sem tirar o mouse (WCAG 1.4.13) */
for (const rota of ['/', '/servir', '/follow']) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });
  await ctx.route('**', r => rotear(r, B));
  const p = await ctx.newPage();
  await p.goto(B + rota, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(400);
  const bt = p.locator('button.s-nav-bt[aria-expanded]').first();
  if (!(await bt.count())) { res(true, `I ${rota}: sem painel na barra`); await ctx.close(); continue; }
  const sub = await bt.getAttribute('aria-controls');
  const vis = () => p.evaluate(id => { const c = getComputedStyle(document.getElementById(id)); return c.visibility !== 'hidden' && +c.opacity > .5; }, sub);
  await bt.hover(); await p.waitForTimeout(450);
  const v1 = await vis();
  await p.keyboard.press('Escape'); await p.waitForTimeout(450);
  const v2 = await vis();
  await p.mouse.move(700, 600); await p.waitForTimeout(450);
  await bt.hover(); await p.waitForTimeout(450);
  const v3 = await vis();
  res(v1 && !v2 && v3, `I ${rota}: o mouse ${v1 ? 'abre' : 'NÃO abre'} o painel, Esc ${v2 ? 'NÃO o esconde' : 'esconde'} com o mouse parado em cima, e ${v3 ? 'volta' : 'NÃO volta'} quando o mouse sai e entra de novo`);
  await ctx.close();
}
/* J. a cortina aberta no iPad em pé, e o iPad deita */
{
  const ctx = await b.newContext({ viewport: { width: 820, height: 1180 }, isMobile: false, hasTouch: true, reducedMotion: 'reduce' });
  await ctx.route('**', r => rotear(r, B));
  const p = await ctx.newPage();
  await p.goto(B + '/', { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(400);
  await p.locator('button.s-menu-bt').click(); await p.waitForTimeout(400);
  const antes = await p.evaluate(() => ({ aberto: document.querySelector('.s-menu-bt')?.getAttribute('aria-expanded'), inerte: !!document.querySelector('main')?.closest('[inert]') }));
  await p.setViewportSize({ width: 1180, height: 820 }); await p.waitForTimeout(500);
  const depois = await p.evaluate(() => ({ aberto: document.querySelector('.s-menu-bt')?.getAttribute('aria-expanded'), inerte: !!document.querySelector('main')?.closest('[inert]'), rola: getComputedStyle(document.body).overflow !== 'hidden' }));
  res(antes.aberto === 'true' && antes.inerte && depois.aberto === 'false' && !depois.inerte && depois.rola, `J / (iPad 820 → 1180): cortina aberta (${antes.aberto}, página ${antes.inerte ? 'inerte' : 'NÃO inerte'}); deitado: cortina ${depois.aberto === 'false' ? 'fechada' : 'AINDA ABERTA'}, página ${depois.inerte ? 'AINDA INERTE' : 'livre'}, rolagem ${depois.rola ? 'de volta' : 'AINDA TRAVADA'}`);
  await ctx.close();
}
await b.close();
console.log(ruins ? `\n${ruins} caso(s) com problema no teclado` : '\ntudo alcançável e operável pelo teclado');
process.exit(ruins ? 1 : 0);
