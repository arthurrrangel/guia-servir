/* =============================================================================
   O CABEÇALHO ESTÁ CENTRADO NO CELULAR? (pedido do Arthur, 08/09/2026: "tudo
   tem que estar centralizado no mobile")

   09/09/2026 — A REGRA MUDOU, E ESTE SCRIPT MUDA COM ELA. A auditoria em
   captura das 12 telas mostrou parágrafo de 3 a 10 linhas centrado em quase
   toda página: as duas bordas irregulares, o olho perdendo onde a linha
   começa. A regra passou a ser mais precisa, não mais frouxa:

     cabeçalho de seção (rótulo + título + linha de apoio) fica CENTRADO;
     todo bloco que é CARTÃO alinha rótulo, título e texto à esquerda.

   Então o que este script cobra é o cabeçalho, e ele pula, de propósito, os
   blocos que agora alinham (lista de PULADOS, abaixo). Pular não é abrir mão:
   quem cobra o alinhamento desses blocos é a régua da esquerda, que é visível
   a olho na captura — um cartão desalinhado salta.

   Em 390 (W=360/430 para outras larguras), todo elemento com texto visível
   em main/footer é comparado com o bloco que o segura, e cada bloco com o
   pai, até o viewport: desvio acima de 8px é listado. Células de grade e
   itens de linha flex são julgados pelo pai; rótulos com quadradinho,
   contadores de chip e palavras animadas são pulados.
   Uso: PORTA=3700 node scripts/texto-centrado.mjs [rota...]
   ============================================================================= */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
const B = `http://localhost:${process.env.PORTA || 3700}`;
const ROTAS = process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/cultos', '/como-chegar', '/pequena-guia', '/sobre', '/servir', '/servir/midia', '/servir/onde-me-encaixo', '/acessar', '/guia-church-tv', '/privacidade', '/rota-que-nao-existe'];
async function serveRpc(route) { const req = route.request(), u = req.url(); const fn = u.split('/rpc/')[1]?.split('?')[0]; let slug=''; try { slug=(JSON.parse(req.postData()||'{}').p_slug)||''; } catch {} for (const nome of [slug?`${fn}__${slug}`:null, fn]) { if (!nome) continue; const f=`/tmp/rpc/${nome}.json`; if (existsSync(f)) return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:readFileSync(f,'utf8')}); } return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'[]'}); }
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const W = +(process.env.W || 390); const ctx = await b.newContext({ viewport: { width: W, height: 844 } });
await ctx.route('**', r => { const u = r.request().url(); if (u.includes('/rest/v1/rpc/')) return serveRpc(r); return u.startsWith(B) ? r.continue() : r.abort(); });
let total = 0;
for (const rota of ROTAS) {
  const p = await ctx.newPage();
  await p.goto(B + rota, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2200);
  await p.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } window.scrollTo(0, 0); });
  await p.waitForTimeout(500);
  const falhas = await p.evaluate(() => {
    const V = document.documentElement.clientWidth, cs = getComputedStyle, out = [];
    const vis = e => { const s = cs(e); const r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 && s.position !== 'fixed'; };
    const raiz = document.querySelector('main');
    const alvo = [...(raiz ? raiz.querySelectorAll('*') : []), ...document.querySelectorAll('footer *')];
    /* o bloco que segura o texto: o ancestral mais perto que é bloco/flex/grid
       (não inline) — o centro do texto é comparado com o centro DELE; e o
       centro dele com o do pai dele, até chegar ao viewport */
    const bloco = e => { let p = e.parentElement; while (p && p !== document.body) { const d = cs(p).display; if (d !== 'inline' && d !== 'contents') return p; p = p.parentElement; } return document.body; };
    const centroDe = r => (r.left + r.right) / 2;
    const visto = new Set();
    for (const e of alvo) {
      if (!vis(e)) continue;
      if (e.closest('.leaflet-container, .pgs.fila, .rolo, .menu, .casa-barra, nextjs-portal, script, style, .pgs-dica')) continue;
      /* PULADOS: os blocos que alinham à esquerda por regra (09/09/2026) */
      if (e.closest('.cartao, .ficha, .fato, .casa-area, .cartoes, .qa, .g-perg, .g-linhas, .g-pe-cols, .g-pe-onde, .g-pe-linha, .pg-corpo, .g-vira, .g-texto')) continue;
      if (e.classList.contains('pal') || e.closest('.pal')) continue;
      /* 10/09/2026 — link EM LINHA dentro de frase centrada. O link "Como
         cuidamos deles" ganhou `inline-block` com padding para virar alvo de
         toque de 40px; isso deu caixa a ele, e a régua passou a cobrar dele o
         que só faz sentido para bloco. Quem tem que estar centrada é a frase,
         e ela está. */
      if (e.tagName === 'A' && e.closest('.g-form-nota, .dim, .pequeno')) continue;
      const disp = cs(e).display;
      if (disp === 'inline') continue;                       // faz parte do texto do pai
      if (e.matches('.g-rot,.fato-r,.ficha-r,small,.so-leitor,.lz')) continue; // rótulo com quadradinho (centrado como conjunto), contador do chip, só-leitor, palavra do versículo
      const pai = e.parentElement, dp = cs(pai).display;
      /* item de linha flex ou célula de grade: o texto é comparado com a
         própria caixa do item (a linha/grade é julgada pelo pai) */
      const emLinha = ((dp === 'flex' || dp === 'inline-flex') && pai.children.length > 1 && cs(pai).flexDirection.startsWith('row'))
        || (dp === 'grid' && cs(pai).gridTemplateColumns.split(' ').length > 1 && pai.children.length > 1);
      const proprio = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) || e.querySelector(':scope > span > .pal');
      if (!proprio) continue;
      const range = document.createRange(); range.selectNodeContents(e); const tr = range.getBoundingClientRect();
      const r = e.getBoundingClientRect();
      const caixa = tr.width ? tr : r;
      let alvoBox = emLinha ? e.getBoundingClientRect() : bloco(e).getBoundingClientRect();
      /* texto de várias linhas: a caixa do range é a largura do bloco; aí o
         que conta é text-align */
      const multi = caixa.height > parseFloat(cs(e).lineHeight || '0') * 1.5;
      const desvio = multi ? 0 : Math.abs(centroDe(caixa) - centroDe(alvoBox));
      if (desvio > 8) out.push(`${(e.className && String(e.className).split(' ')[0]) || e.tagName} "${e.textContent.trim().slice(0, 28)}" desvio=${Math.round(desvio)} em ${(bloco(e).className && String(bloco(e).className).split(' ')[0]) || bloco(e).tagName}`);
      /* e os blocos acima, um a um, até o viewport */
      let b = bloco(e);
      while (b && b !== document.body) {
        if (visto.has(b)) break; visto.add(b);
        const pb = bloco(b), rb = b.getBoundingClientRect(), rp = pb === document.body ? { left: 0, right: V } : pb.getBoundingClientRect();
        const d2 = Math.abs(centroDe(rb) - centroDe(rp));
        const dpb = cs(pb).display, celula = (dpb === 'grid' && cs(pb).gridTemplateColumns.split(' ').length > 1) || ((dpb === 'flex') && pb.children.length > 1 && cs(pb).flexDirection.startsWith('row'));
        if (!celula && d2 > 8 && rb.width < (rp.right - rp.left) - 16) out.push(`[bloco] ${(b.className && String(b.className).split(' ')[0]) || b.tagName} desvio=${Math.round(d2)} em ${(pb.className && String(pb.className).split(' ')[0]) || pb.tagName}`);
        b = pb;
      }
    }
    return [...new Set(out)];
  });
  total += falhas.length;
  console.log(rota, falhas.length, falhas.slice(0, 12).join('\n   '));
  await p.close();
}
console.log('FORA DO CENTRO:', total);
await b.close();
