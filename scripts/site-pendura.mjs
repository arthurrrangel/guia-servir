import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'fs';
/* =============================================================================
   PALAVRA CURTA PENDURADA · 12/10/2026

   Em texto centralizado, "o", "a", "de", "que" no fim de uma linha ("Que Deus
   multiplique o / que você semeou") puxam o olho para a borda torta. Esta
   régua abre cada rota nas larguras pedidas, quebra cada título, chamada,
   cartão e pergunta em linhas (pela posição real de cada palavra) e lista
   as linhas que terminam em palavra curta. O conserto mora em `liga()`
   (components/site/Blocos.tsx) e na segunda voz dos títulos.

   Uso: node scripts/site-pendura.mjs <base> <larguras> <rota> [rota...]
   RPC_DIR=<pasta> responde as RPCs com JSON gravado; PROXY=1 usa o proxy.
   O que fica de propósito: o herói em duas vozes ("Ofertar é / adorar.").
   Linha que termina em pontuação de fim de frase ou oração não conta.
   ============================================================================= */
const [BASE, LARG, ...ROTAS] = process.argv.slice(2);
const RPC_DIR = process.env.RPC_DIR;
const b = await chromium.launch({ headless: true, ...(process.env.PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) });
const out = [];
for (const w of LARG.split(',').map(Number)) {
  const ctx = await b.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 1, isMobile: w < 760, hasTouch: w < 760 });
  for (const rota of ROTAS) {
    const p = await ctx.newPage();
    if (RPC_DIR) await p.route('**/rest/v1/rpc/**', async route => {
      const fn = new URL(route.request().url()).pathname.split('/').pop();
      let c = {}; try { c = JSON.parse(route.request().postData() || '{}'); } catch {}
      const arq = fn === 'ministerios_publicos' ? 'rpc-mins.json' : fn === 'numeros_publicos' ? 'rpc-num.json' : fn === 'equipe_funcoes' ? `rpc-funcoes-${c.p_slug}.json` : null;
      if (!arq || !existsSync(`${RPC_DIR}/${arq}`)) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(`${RPC_DIR}/${arq}`, 'utf8') });
    });
    await p.goto(BASE + rota, { waitUntil: 'networkidle', timeout: 60000 });
    await p.waitForTimeout(1600);
    const r = await p.evaluate(() => {
      const curtas = new Set(['o','a','e','é','de','da','do','em','no','na','um','uma','à','ao','os','as','pra','por','que','se','com','dos','das','nos','nas','seu','sua','te','me']);
      const achados = [];
      const els = document.querySelectorAll('.s main :is(h1,h2,h3,summary,.s-cartao-t,.s-cartao-f,.s-lead,.s-micro,.s-faq-t), .s .s-pe :is(p)');
      for (const el of els) {
        const cs = getComputedStyle(el);
        if (el.offsetParent === null || cs.visibility === 'hidden') continue;
        const pal = [];
        const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = tw.nextNode())) {
          const t = n.textContent; const re = /[^\s ]+/g; let m;
          while ((m = re.exec(t))) {
            const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
            const rc = [...rg.getClientRects()].filter(x => x.width > 0);
            if (!rc.length) continue;
            pal.push({ w: m[0], top: Math.round(rc[rc.length - 1].top), firstTop: Math.round(rc[0].top) });
          }
        }
        if (pal.length < 3) continue;
        const linhas = [];
        for (const p of pal) { const l = linhas[linhas.length - 1]; if (l && Math.abs(l.top - p.firstTop) < 6) l.ws.push(p.w); else linhas.push({ top: p.top, ws: [p.w] }); }
        for (let i = 0; i < linhas.length - 1; i++) {
          const bruta = linhas[i].ws[linhas[i].ws.length - 1];
          /* fim de frase ou de oração ("o seu.", "a gente é:") fecha a linha:
             a pontuação segura o olho, não é palavra pendurada */
          if (/[.:;!?]["”)]?$/.test(bruta)) continue;
          const ult = bruta.toLowerCase().replace(/[^\p{L}]/gu, '');
          if (curtas.has(ult)) achados.push({ tag: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''), linha: linhas[i].ws.join(' '), texto: el.textContent.trim().slice(0, 70) });
        }
      }
      return achados;
    });
    for (const a of r) out.push({ w, rota, ...a });
    await p.close();
  }
  await ctx.close();
}
await b.close();
console.log(JSON.stringify(out, null, 0));
