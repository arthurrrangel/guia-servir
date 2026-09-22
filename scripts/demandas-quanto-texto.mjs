/* QUANTO TEXTO CADA TELA JOGA EM CIMA DE QUEM USA.

   "Menos texto, e textos mais diretos" e um pedido que se mede. Esta conta
   abre cada tela, em cada papel, a 390px, e conta:

     palavras ... tudo o que esta visivel dentro de <main>, fora o menu
     telas ..... altura da pagina dividida pela altura do celular (844px):
                 quantas vezes a pessoa tem que rolar
     ajuda ..... frases de explicacao: `.dm-peq`, `.dm-mudo`, `.dm-ajuda`
                 que tem mais de 6 palavras

   Nao julga. So conta, para o antes e o depois serem o mesmo instrumento.

   Precisa do app em 127.0.0.1:3400 e dos numeros por papel em
   /tmp/celular-numeros.json (scripts/demandas-celular-subir.sh). */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromeDoContainer } from './medida-celular.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:3400';
const N = JSON.parse(readFileSync('/tmp/celular-numeros.json', 'utf8'));
const PAPEIS = [
  { tok: 'tok-pede',     quem: 'solicitante' },
  { tok: 'tok-comunica', quem: 'responsavel' },
  { tok: 'tok-admin',    quem: 'admin' },
];
const telas = q => [
  ['lista',     '/demandas'],
  ['nova',      '/demandas/nova'],
  ...(q !== 'solicitante' ? [['numeros', '/demandas/numeros']] : []),
  ...(q === 'admin' ? [['ajustes', '/demandas/ajustes']] : []),
  ['execucao',  `/demandas/d/${N[q].execucao}`],
  ['travada',   `/demandas/d/${N[q].travada}`],
  ['concluida', `/demandas/d/${N[q].concluida}`],
];

const nav = await chromium.launch({ executablePath: chromeDoContainer() });
const linhas = [];
const textos = {};
for (const p of PAPEIS) {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const pag = await ctx.newPage();
  await pag.goto(`${BASE}/demandas?t=${p.tok}`, { waitUntil: 'networkidle' });
  for (const [nome, rota] of telas(p.quem)) {
    await pag.goto(BASE + rota, { waitUntil: 'networkidle' });
    await pag.waitForTimeout(500);
    const m = await pag.evaluate(() => {
      const raiz = document.querySelector('main') || document.body;
      const menu = document.querySelector('.dm-topo, .dm-abas, header');
      const vis = el => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null; };
      const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
      let palavras = 0; const pedacos = [];
      while (w.nextNode()) {
        const n = w.currentNode; const el = n.parentElement;
        if (!el || !vis(el)) continue;
        if (menu && menu.contains(el)) continue;
        if (el.closest('script,style,noscript,option')) continue;
        const t = (n.textContent || '').replace(/\s+/g, ' ').trim();
        if (!t) continue;
        palavras += t.split(' ').filter(Boolean).length;
        pedacos.push(t);
      }
      let ajuda = 0; const frases = [];
      for (const el of raiz.querySelectorAll('.dm-peq, .dm-mudo, .dm-ajuda')) {
        if (!vis(el)) continue;
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        const n = t.split(' ').filter(Boolean).length;
        if (n > 6) { ajuda++; frases.push(t); }
      }
      return { palavras, altura: document.documentElement.scrollHeight, ajuda, pedacos, frases };
    });
    const telasDeRolagem = (m.altura / 844);
    linhas.push({ papel: p.quem, tela: nome, palavras: m.palavras, telas: +telasDeRolagem.toFixed(1), ajuda: m.ajuda });
    textos[`${p.quem}/${nome}`] = { texto: m.pedacos.join(' | '), ajuda: m.frases };
  }
  await ctx.close();
}
await nav.close();

const saida = process.argv[2] || '/tmp/quanto-texto.json';
writeFileSync(saida, JSON.stringify({ linhas, textos }, null, 2));
let tp = 0, tt = 0;
console.log('papel        tela        palavras  telas  ajuda');
for (const l of linhas) {
  tp += l.palavras; tt += l.telas;
  console.log(`${l.papel.padEnd(12)} ${l.tela.padEnd(11)} ${String(l.palavras).padStart(8)}  ${String(l.telas).padStart(5)}  ${String(l.ajuda).padStart(5)}`);
}
console.log(`${'TOTAL'.padEnd(24)} ${String(tp).padStart(8)}  ${tt.toFixed(1).padStart(5)}`);
