/* =============================================================================
   AUDITORIA · ESPAÇAMENTO DE TEXTO (WCAG 2.2, 1.4.12) · 22/10/2026

   Quem lê com espaçamento maior (por extensão do navegador ou folha própria)
   não pode perder texto: com altura de linha 1,5, letras a 0,12 em, palavras a
   0,16 em e parágrafos com 2 em embaixo, nada pode ficar cortado nem vazar da
   tela. Para cada rota e largura: aplica o espaçamento e procura
     · corte: elemento com overflow escondido cujo conteúdo passa da caixa
       (texto que some), ignorando os de leitor de tela e os de altura zero;
     · estouro: a página mais larga que a tela.
   Requer o servidor: PORTA=3800 node scripts/auditoria-espacamento-texto.mjs [/rota ...]
   Sai com 1 se achar corte ou estouro.
   ============================================================================= */
import { chromium } from 'playwright';
import { rotear, rolarTudo, ROTAS_SITE } from './_rpc-mock.mjs';
const B = `http://localhost:${process.env.PORTA || 3700}`;
const arg = process.argv.slice(2).filter(a => a.startsWith('/'));
const ROTAS = arg.length ? arg : ROTAS_SITE;
const LARGURAS = [390, 1440];
const ESPACO = `*{ line-height:1.5 !important; letter-spacing:.12em !important; word-spacing:.16em !important }
p{ margin-bottom:2em !important }`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let achados = 0;
for (const W of LARGURAS) {
  const ctx = await b.newContext({ viewport: { width: W, height: W < 760 ? 844 : 900 }, isMobile: W < 760, hasTouch: W < 760, reducedMotion: 'reduce' });
  await ctx.route('**', r => rotear(r, B));
  for (const rota of ROTAS) {
    const p = await ctx.newPage();
    await p.goto(B + rota, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
    await p.waitForTimeout(300); await rolarTudo(p);
    await p.addStyleTag({ content: ESPACO });
    await p.waitForTimeout(300);
    const r = await p.evaluate(() => {
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
        /* corte de verdade só se há texto (não imagem) do lado de fora */
        if (corteY || corteX) {
          const cx = e.getBoundingClientRect();
          let fora = false;
          const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
          for (let n = w.nextNode(); n && !fora; n = w.nextNode()) {
            if (!n.textContent.trim()) continue;
            const pai = n.parentElement; if (pai.closest('[aria-hidden="true"]')) continue;
            const rg = document.createRange(); rg.selectNodeContents(n);
            for (const q of rg.getClientRects()) {
              if (q.width < 1) continue;
              if (corteY && (q.bottom > cx.bottom + 2 || q.top < cx.top - 2)) fora = true;
              if (corteX && (q.right > cx.right + 2 || q.left < cx.left - 2)) fora = true;
            }
          }
          if (fora) out.push(`corte: ${e.tagName.toLowerCase()}.${String(e.className).trim().split(/\s+/).slice(0, 2).join('.')} «${e.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)}» (${corteY ? 'altura ' + e.clientHeight + ' < ' + e.scrollHeight : ''}${corteX ? ' largura ' + e.clientWidth + ' < ' + e.scrollWidth : ''})`);
        }
      }
      const estouro = document.documentElement.scrollWidth > window.innerWidth + 1 ? `estouro: página com ${document.documentElement.scrollWidth}px numa tela de ${window.innerWidth}` : null;
      return { out: [...new Set(out)].slice(0, 8), estouro };
    });
    const n = r.out.length + (r.estouro ? 1 : 0);
    achados += n;
    console.log(`${String(W).padStart(4)} ${rota.padEnd(28)} ${n ? n + ' achado(s)' : 'ok'}`);
    if (r.estouro) console.log('      ' + r.estouro);
    for (const o of r.out) console.log('      ' + o);
    await p.close();
  }
  await ctx.close();
}
await b.close();
console.log(achados ? `\n${achados} achado(s) com o espaçamento de texto da WCAG 1.4.12` : '\nnenhum texto cortado e nenhuma página mais larga que a tela com o espaçamento da WCAG 1.4.12');
process.exit(achados ? 1 : 0);
