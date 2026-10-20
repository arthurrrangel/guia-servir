/* =============================================================================
   AUDITORIA · A ESTRUTURA DO ECOSSISTEMA (20/10/2026)

   Três leituras que não dependem de gosto, em todas as rotas públicas:

   1. A ESTRUTURA SERVIDA de cada rota: as seções em ordem, com o título, o
      chapéu, as pílulas (e o tom de cada uma) e os carimbos. É o que se lê
      para ver se a ordem conduz, se há seção repetida, se o fecho fecha.
   2. O MAPA DAS CHAMADAS: para cada pílula, o rótulo e o destino. Um rótulo
      com mais de um destino (ou um destino com mais de um rótulo) é
      inconsistência de navegação, a não ser que a copy mande (o documento
      do Guia Church varia de propósito: "Vou visitar" / "Vou conhecer").
   3. O QUE QUEBRA SEM NINGUÉM VER: aria-labelledby apontando para id que não
      existe (o axe não acusa) e id repetido na mesma página. Isto reprova.

     PORTA=3700 node scripts/auditoria-estrutura.mjs [/rota ...]
   ============================================================================= */
import { chromium } from 'playwright';
import { rotear, ROTAS_SITE } from './_rpc-mock.mjs';

const B = `http://localhost:${process.env.PORTA || 3000}`;
const ROTAS = process.argv.slice(2).length ? process.argv.slice(2) : ROTAS_SITE.filter(r => !r.includes('nao-existe'));
const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.route('**', r => rotear(r, B));
const porRotulo = {}, porDestino = {};
let quebrados = 0;
for (const rota of ROTAS) {
  const p = await ctx.newPage();
  await p.goto(B + rota, { waitUntil: 'networkidle' }).catch(() => {});
  await p.waitForTimeout(300);
  const o = await p.evaluate(() => {
    const t = e => (e?.textContent || '').trim().replace(/\s+/g, ' ');
    const tom = a => a.classList.contains('vidro') ? '◇' : a.classList.contains('preta') ? '●' : a.classList.contains('contorno') ? '○' : '◯';
    const secoes = [...document.querySelectorAll('main > section')].map(s => {
      const cls = [...s.classList].filter(c => !/^(s-rev|d\d)$/.test(c)).join('.');
      const h = s.querySelector('h1, h2'); const chapeu = s.querySelector('.s-chapeu');
      const pils = [...s.querySelectorAll('.s-pil, .acao')].map(a => t(a) + tom(a));
      const carimbos = [...s.querySelectorAll('.s-sede, .s-arroba')].map(c => c.classList.contains('s-sede') ? 'sede' : '@');
      return `${s.id ? '#' + s.id : '-'} .${cls} | ${h ? h.tagName.toLowerCase() + ' "' + t(h).slice(0, 56) + '"' : '(sem título)'}${chapeu ? ' · chapéu "' + t(chapeu).slice(0, 36) + '"' : ''} | ${pils.join(' · ')}${carimbos.length ? ' | ' + carimbos.join(',') : ''}`;
    });
    const chamadas = [...document.querySelectorAll('main .s-pil, main .acao')].map(a => {
      const el = a.closest('a'); const sec = a.closest('section');
      return { rot: t(a), href: el ? (el.getAttribute('href') || '') : '(botão)', onde: sec ? (sec.id || t(sec.querySelector('h1,h2')).slice(0, 28)) : '?' };
    });
    const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
    const existe = new Set(ids);
    const repetidos = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
    const semAlvo = [...document.querySelectorAll('[aria-labelledby]')].flatMap(e => e.getAttribute('aria-labelledby').split(/\s+/)).filter(x => !existe.has(x));
    return { h1: document.querySelectorAll('h1').length, titulo: document.title, secoes, chamadas, repetidos, semAlvo };
  });
  console.log(`\n#### ${rota}  "${o.titulo}"  h1=${o.h1}`);
  for (const s of o.secoes) console.log('   ', s);
  if (o.repetidos.length) { quebrados++; console.log('    !! id repetido:', o.repetidos.join(', ')); }
  if (o.semAlvo.length) { quebrados++; console.log('    !! aria-labelledby sem alvo:', o.semAlvo.join(', ')); }
  if (o.h1 !== 1) { quebrados++; console.log('    !! h1:', o.h1); }
  for (const c of o.chamadas) {
    if (c.href === '(botão)') continue;
    const d = c.href.replace(/^https?:\/\/(www\.)?/, '').replace(/^localhost:\d+/, '');
    (porRotulo[c.rot] ||= new Set()).add(d);
    (porDestino[d] ||= new Set()).add(`${c.rot} [${rota} · ${c.onde}]`);
  }
  await p.close();
}
await nav.close();

console.log('\n==== RÓTULOS COM MAIS DE UM DESTINO (fora os do WhatsApp, que levam a mensagem do lugar)');
for (const [r, d] of Object.entries(porRotulo).sort()) {
  const semZap = [...d].filter(x => !x.startsWith('wa.me'));
  if (semZap.length > 1) console.log(`  "${r}" → ${semZap.join('  |  ')}`);
}
console.log('\n==== DESTINOS COM MAIS DE UM RÓTULO');
for (const [d, r] of Object.entries(porDestino).sort()) {
  const rots = new Set([...r].map(x => x.split(' [')[0]));
  if (rots.size > 1) console.log(`  ${d.slice(0, 90)}\n     ${[...r].join('\n     ')}`);
}
console.log(quebrados ? `\n${quebrados} problema(s) de estrutura` : '\nestrutura íntegra (ids, aria-labelledby, um h1 por página)');
process.exit(quebrados ? 1 : 0);
