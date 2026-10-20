/* =============================================================================
   AUDITORIA · OS PAPÉIS DO SITE (20/10/2026)

   O mesmo papel (título, linha de apoio, chapéu, pílula, cartão, fato,
   pergunta, pé) tem a mesma medida em todas as páginas? Para cada seletor de
   papel, a assinatura de cada ocorrência visível (corpo, peso, entrelinha,
   espaçamento, caixa, cor, família; para caixas, recuos, raio, fio, gap) e
   em que rotas cada assinatura aparece. Modificadores (menor, media, grande,
   preta, vidro, lista, indice…) contam como papéis à parte.

   Variação por superfície (a mesma classe em cor de tinta sobre papel e de
   papel sobre a noite) é esperada e aparece; o que importa é corpo, peso e
   recuo diferentes para o mesmo papel na mesma largura.

     PORTA=3700 node scripts/auditoria-papeis.mjs
   ============================================================================= */
import { chromium } from 'playwright';
import { rotear, rolarTudo, ROTAS_SITE } from './_rpc-mock.mjs';

const B = `http://localhost:${process.env.PORTA || 3000}`;
const LARGURAS = [390, 1440];
const TEXTO = ['.s-h1', '.s-h2', '.s-lead', '.s-chapeu', '.s-chapeu b', '.s-pil', '.acao', '.s-fato small', '.s-fato b', '.s-fato p', '.s-qa b', '.s-qa p', '.s-cartao-t', '.s-cartao-n', '.s-cartao-tag', '.s-cartao-f', '.s-cartao-p', '.s-cartao-d', '.s-cartao-ir', 'figcaption', '.s-abre summary', '.s-abre p', '.s-pe a', '.s-pe small', '.s-sep', '.s-micro', '.s-faq-t', '.s-faq p', '.s-obj b', '.s-obj p', '.s-passos b', '.s-passos p', '.s-serifa', '.s-sede', '.s-arroba', '.s-selo', '.s-aviso', '.s-link', '.s-topo .s-nav-bt', '.s-sub b', '.s-sub small', '.s-cortina-lista a span', '.s-scrub-frase', '.s-scrub-sub', '.s-scrub-rotulo', '.s-vivos b', '.s-vivos li', '.s-sigla b', '.s-sigla p', '.s-funcao b', '.s-funcao p', '.s-campo input', '.s-campo select', '.g-form-campo input', '.g-form-campo select', '.g-rot', '.g-form-nota', '.pg-nome', '.pg-quando', '.pg-chip'];
const CAIXA = ['.s-faixa', '.s-in', '.s-cab', '.s-acoes', '.s-pil', '.acao', '.s-cartao', '.s-claro', '.s-fato', '.s-qa > div', '.s-abre details', '.s-pe', '.s-topo', '.s-campo input', '.s-campo select', '.g-form-campo input', '.s-so-texto', '.s-cartoes', '.s-fatos', '.s-janela', '.s-trio figure', '.s-gente', '.s-duas', '.s-mapa-cartao', '.s-funcao', '.pg', '.of'];
const MODS = /^(menor|media|minima|grande|preta|vidro|contorno|cheia|noite|papel|areia|justa|lista|indice|simples|quatro|tres|duas|cinco|centro|topo|base|dir|esq|fora|sem-ponto|so-largo|so-celular|pouso|baixo|sobe|desliza|claro|curto|porta|longa|it|v|h|q)$/;

const nav = await chromium.launch();
const tudo = {};
for (const W of LARGURAS) {
  const ctx = await nav.newContext({ viewport: { width: W, height: 900 }, reducedMotion: 'reduce' });
  await ctx.route('**', r => rotear(r, B));
  tudo[W] = {};
  for (const rota of ROTAS_SITE) {
    const p = await ctx.newPage();
    await p.goto(B + rota, { waitUntil: 'networkidle' }).catch(() => {});
    await p.waitForTimeout(400); await rolarTudo(p);
    const res = await p.evaluate(([TEXTO, CAIXA, MODS]) => {
      const out = {}; const cs = getComputedStyle; const re = new RegExp(MODS);
      const vis = e => { const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false; for (let a = e; a && a !== document.body; a = a.parentElement) { const s = cs(a); if (s.display === 'none' || s.visibility === 'hidden') return false; } return true; };
      const mods = e => [...e.classList].filter(c => re.test(c)).sort().join('.');
      for (const sel of TEXTO) for (const e of document.querySelectorAll(sel)) { if (!vis(e)) continue; const s = cs(e); const k = sel + (mods(e) ? ` [${mods(e)}]` : ''); (out[k] ||= new Set()).add(`${s.fontSize}/${s.fontWeight}/${s.lineHeight}/${s.letterSpacing}/${s.textTransform}/${s.color}/${s.fontFamily.split(',')[0].replace(/"/g, '')}`); }
      for (const sel of CAIXA) for (const e of document.querySelectorAll(sel)) { if (!vis(e)) continue; const s = cs(e); const k = '□ ' + sel + (mods(e) ? ` [${mods(e)}]` : ''); (out[k] ||= new Set()).add(`pad ${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft} · r ${s.borderRadius} · fio ${s.borderTopWidth} · gap ${s.gap} · mw ${s.maxWidth}`); }
      return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
    }, [TEXTO, CAIXA, MODS.source]);
    for (const [k, sigs] of Object.entries(res)) for (const sig of sigs) ((tudo[W][k] ||= {})[sig] ||= new Set()).add(rota);
    await p.close();
  }
  await ctx.close();
}
await nav.close();
let n = 0;
for (const W of LARGURAS) {
  console.log(`\n==== ${W}px`);
  for (const [k, sigs] of Object.entries(tudo[W]).sort()) {
    if (Object.keys(sigs).length < 2) continue;
    n++; console.log(`${k}: ${Object.keys(sigs).length} assinaturas`);
    for (const [sig, rotas] of Object.entries(sigs)) console.log(`   ${sig}  [${[...rotas].join(',')}]`);
  }
}
console.log(`\n${n} papéis com mais de uma assinatura (ver o cabeçalho: variação por superfície é esperada)`);
