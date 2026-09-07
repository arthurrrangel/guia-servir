/* =============================================================================
   O CELULAR ESTÁ CENTRADO?

   Pedido do Arthur: "site 100% centralizado no mobile, alinhamento impecável,
   espaçamentos consistentes, zero poluição". Isso são quatro perguntas
   diferentes e cada uma quer uma medida própria, então este arquivo mede as
   quatro e não opina sobre nenhuma:

   1 CENTRO      um contêiner centrado tem a mesma folga dos dois lados. Se a
                 esquerda dá 20 e a direita 12, ele NÃO está centrado, e é o
                 tipo de desvio que ninguém nomeia mas todo mundo sente.
   2 RÉGUA       quantas bordas esquerdas distintas o conteúdo usa. Uma tela
                 empilhada tem uma; duas já é uma a mais.
   3 ESTOURO     o que passa da largura da tela. Rolagem horizontal no celular
                 é o defeito mais barato de achar e o mais caro de deixar.
   4 DEGRAU      as distâncias verticais entre blocos irmãos. Se aparecerem
                 doze valores diferentes, o espaçamento não é sistema, é
                 acidente — e é isso que lê como poluição.

   O QUE ELE NÃO DECIDE: se um recuo é intencional. Bloco de citação recuado de
   propósito aparece como régua extra e está certo. A saída é lista, não
   veredito; quem julga é o olho, e o papel disto é dizer ONDE olhar.
============================================================================= */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';

const B = `http://localhost:${process.env.PORTA || 3000}`;
const LARGURA = +(process.env.W || 390);
const TELAS = process.argv.slice(2).length ? process.argv.slice(2) : [
  '', 'sobre', 'cultos', 'como-chegar', 'pequena-guia', 'guia-church-tv',
  'servir', 'servir/midia', 'servir/onde-me-encaixo', 'acessar', 'privacidade',
];

async function serveRpc(route) {
  const req = route.request(), u = req.url();
  const fn = u.split('/rpc/')[1]?.split('?')[0];
  let slug = ''; try { slug = (JSON.parse(req.postData() || '{}').p_slug) || ''; } catch {}
  for (const nome of [slug ? `${fn}__${slug}` : null, fn]) {
    if (!nome) continue;
    const f = `/tmp/rpc/${nome}.json`;
    if (existsSync(f)) return route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' }, body: readFileSync(f, 'utf8') });
  }
  return route.fulfill({ status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: '[]' });
}

const CHECK = () => {
  const V = document.documentElement.clientWidth;
  const cs = getComputedStyle;
  const vis = e => { const s = cs(e), r = e.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > .05
      && r.width > 8 && r.height > 4 && s.position !== 'fixed'; };
  const nome = e => (String(e.className) || e.tagName).trim().split(/\s+/)[0].slice(0, 22) || e.tagName;

  /* 1 CENTRO — só de CONTÊINER. Cobrar simetria de um parágrafo alinhado à
     esquerda seria cobrar que ele deixasse de ser alinhado à esquerda. O que
     tem obrigação de estar centrado é a caixa que segura o conteúdo. */
  const centro = [];
  for (const e of document.querySelectorAll('main > *, main section, main section > .g, footer, footer > .g, .g')) {
    if (!vis(e)) continue;
    const r = e.getBoundingClientRect();
    const esq = Math.round(r.left), dir = Math.round(V - r.right);
    if (Math.abs(esq - dir) > 2) centro.push(`${nome(e)} esq${esq} dir${dir} (dif ${esq - dir})`);
  }

  /* 3 ESTOURO — e SANGRIA APARADA NÃO É ESTOURO. Primeira rodada acusou um
     `IMG L-23 R413` em nove das onze telas e o herói da home junto. Os dois
     são a mesma coisa e a coisa está certa: foto absoluta, mais larga que a
     caixa de propósito, centrada (as sobras dos dois lados são iguais) e
     aparada por um pai com `overflow:hidden`. É assim que se preenche uma
     caixa com uma foto de outra proporção. O `scrollW` igual à tela em todas
     elas já dizia isso: ninguém rola de lado. O que interessa é o que passa
     da tela E NÃO É APARADO por ninguém. */
  const aparado = e => {
    let n = e.parentElement;
    while (n && n !== document.documentElement) {
      const s = cs(n), o = s.overflow + s.overflowX;
      if (/hidden|clip|auto|scroll/.test(o)) {
        const r = n.getBoundingClientRect();
        if (r.right <= V + 1 && r.left >= -1) return true;
      }
      n = n.parentElement;
    }
    return false;
  };
  const estouro = [];
  for (const e of document.querySelectorAll('body *')) {
    if (!vis(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.right <= V + 1 && r.left >= -1) continue;
    if (aparado(e)) continue;
    estouro.push(`${nome(e)} L${Math.round(r.left)} R${Math.round(r.right)}`);
  }

  /* 2 RÉGUA — bordas esquerdas do texto de bloco, fora de linhas horizontais */
  const baldes = [];
  for (const e of document.querySelectorAll('main *')) {
    if (!vis(e)) continue;
    if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const s = cs(e);
    if (s.display === 'inline' || s.position === 'absolute') continue;
    if (s.textAlign === 'center' || s.textAlign === 'right') continue;
    const meu = e.getBoundingClientRect();
    const irmaoAEsquerda = e.parentElement && [...e.parentElement.children].some(o => {
      if (o === e) return false;
      const r = o.getBoundingClientRect();
      return r.width > 2 && r.right <= meu.left + 2 && r.bottom > meu.top + 2 && r.top < meu.bottom - 2;
    });
    if (irmaoAEsquerda) continue;
    const L = Math.round(meu.left);
    const b = baldes.find(x => Math.abs(x.L - L) <= 2);
    if (b) b.n++; else baldes.push({ L, n: 1, ex: nome(e) });
  }
  baldes.sort((a, b) => b.n - a.n);

  /* 4 DEGRAU — distância vertical entre irmãos de bloco visíveis */
  const passos = new Map();
  for (const pai of document.querySelectorAll('main, main section, main section > .g, main > div')) {
    const filhos = [...pai.children].filter(vis);
    for (let i = 1; i < filhos.length; i++) {
      const a = filhos[i - 1].getBoundingClientRect(), b = filhos[i].getBoundingClientRect();
      const d = Math.round(b.top - a.bottom);
      if (d < 0 || d > 200) continue;
      passos.set(d, (passos.get(d) || 0) + 1);
    }
  }
  return {
    centro: centro.slice(0, 8), estouro: estouro.slice(0, 6),
    reguas: baldes.slice(0, 5),
    degraus: [...passos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
    alt: document.body.scrollHeight, scrollW: document.documentElement.scrollWidth, V,
  };
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: LARGURA, height: 844 }, deviceScaleFactor: 2 });
await ctx.route('**', r => {
  const u = r.request().url();
  if (u.includes('/rest/v1/rpc/')) return serveRpc(r);
  return u.startsWith(B) ? r.continue() : r.abort();
});
let problemas = 0;
for (const tela of TELAS) {
  const p = await ctx.newPage();
  try { await p.goto(`${B}/${tela}`, { waitUntil: 'domcontentloaded', timeout: 25000 }); } catch { await p.close(); continue; }
  await p.waitForTimeout(2400);
  /* as seções revelam com o rolar: sem passar por elas, metade da página
     nunca é medida (foi assim que a folha de contato mentiu em 06/09) */
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 300) {
      window.scrollTo(0, y); await new Promise(r => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(600);
  const r = await p.evaluate(CHECK).catch(e => ({ erro: String(e).slice(0, 80) }));
  const ruim = (r.centro?.length || 0) + (r.estouro?.length || 0);
  problemas += ruim;
  console.log(`\n=== /${tela || '(home)'}  alt=${r.alt} scrollW=${r.scrollW}/${r.V}`);
  if (r.estouro?.length) console.log(`  ESTOURO  ${r.estouro.join(' | ')}`);
  if (r.centro?.length) console.log(`  FORA DO CENTRO  ${r.centro.join(' | ')}`);
  if (r.reguas) console.log(`  RÉGUAS  ${r.reguas.map(x => `x${x.L}(${x.n})`).join('  ')}`);
  if (r.degraus) console.log(`  DEGRAUS  ${r.degraus.map(([d, n]) => `${d}px×${n}`).join('  ')}`);
  await p.close();
}
await ctx.close(); await b.close();
console.log(`\nCENTRO+ESTOURO: ${problemas}`);
