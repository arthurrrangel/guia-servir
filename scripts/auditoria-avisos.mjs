/* =============================================================================
   AUDITORIA · OS AVISOS QUE O LEITOR DE TELA OUVE SEM MUDAR DE LUGAR (22/10/2026)

   WCAG 4.1.3 (nível AA): mensagem de estado (quantos resultados, "procurando",
   "não deu") tem que chegar ao leitor de tela sem tirar o foco de onde a
   pessoa está: numa região viva (role="status"), que já existe na página
   antes de mudar (região trocada inteira não é lida). Confere:

     A. a busca (nos três sites): "culto" → "N resultados para culto" (N igual
        à lista); "xyzw" → a dica de "nada"; a região é a mesma o tempo todo;
     B. as Pequenas Guias, o filtro: "Quarta" → "4 de 12 grupos no filtro atual";
     C. as Pequenas Guias, "Achar o mais perto de mim": com a posição liberada
        (na Barra), o grupo mais perto; com a posição negada, o aviso de que
        sem ela não dá; nos dois casos, na MESMA região viva.

     PORTA=3800 node scripts/auditoria-avisos.mjs
   Sai com 1 se algum caso falhar.
   ============================================================================= */
import { chromium } from 'playwright';
import { rotear } from './_rpc-mock.mjs';
const B = `http://localhost:${process.env.PORTA || 3700}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let ruins = 0;
const res = (ok, txt) => { if (!ok) ruins++; console.log(`${ok ? 'ok ' : 'MAL'} ${txt}`); };
const ctxDe = async (extra = {}) => {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', ...extra });
  await ctx.route('**', r => rotear(r, B));
  return ctx;
};

/* A. a busca */
for (const rota of ['/', '/servir', '/follow']) {
  const ctx = await ctxDe();
  const p = await ctx.newPage();
  await p.goto(B + rota, { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(300);
  await p.locator('button[aria-label="Buscar no site"]').click(); await p.waitForTimeout(400);
  const marca = await p.evaluate(() => { const r = document.querySelector('.s-busca [role="status"]'); if (r) r.dataset.marca = 'a'; return !!r; });
  await p.keyboard.type('culto'); await p.waitForTimeout(1000);
  const r1 = await p.evaluate(() => ({ txt: document.querySelector('.s-busca [role="status"]')?.textContent || '', n: document.querySelectorAll('.s-busca li a').length }));
  await p.fill('#s-busca-campo', ''); await p.keyboard.type('xyzw'); await p.waitForTimeout(1000);
  const r2 = await p.evaluate(() => ({ txt: document.querySelector('.s-busca [role="status"]')?.textContent || '', nada: document.querySelector('.s-busca-nada')?.textContent || '', mesma: document.querySelector('.s-busca [role="status"]')?.dataset.marca === 'a' }));
  const ok = marca && r1.txt === `${r1.n} ${r1.n === 1 ? 'resultado' : 'resultados'} para culto` && r2.txt === r2.nada && r2.mesma;
  res(ok, `A ${rota}: "culto" → «${r1.txt}» (${r1.n} na lista); "xyzw" → «${r2.txt.slice(0, 40)}»${r2.txt === r2.nada ? ' (a dica de nada)' : ' (DIFERENTE da dica)'}; ${r2.mesma ? 'a mesma região viva' : 'a região FOI TROCADA'}`);
  await ctx.close();
}

/* B. o filtro das Pequenas Guias */
{
  const ctx = await ctxDe();
  const p = await ctx.newPage();
  await p.goto(B + '/pequena-guia', { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(400);
  await p.locator('.pg-chip', { hasText: 'Quarta' }).first().click(); await p.waitForTimeout(500);
  const t = await p.evaluate(() => [...document.querySelectorAll('[role="status"]')].map(e => e.textContent.trim()).find(x => /grupos no filtro/.test(x)) || '');
  res(/^4 de \d+ grupos no filtro atual$/.test(t), `B /pequena-guia: "Quarta" → «${t}»`);
  await ctx.close();
}

/* C. o mais perto de mim, com a posição liberada e negada */
for (const [nome, extra] of [['liberada', { geolocation: { latitude: -23.0004, longitude: -43.3659 }, permissions: ['geolocation'] }], ['negada', { permissions: [] }]]) {
  const ctx = await ctxDe(extra);
  const p = await ctx.newPage();
  await p.goto(B + '/pequena-guia', { waitUntil: 'networkidle', timeout: 60000 }); await p.waitForTimeout(400);
  const antes = await p.evaluate(() => { const r = document.querySelector('.pg-perto [role="status"]'); if (r) r.dataset.marca = 'c'; return r ? r.textContent.trim() : null; });
  await p.locator('.pg-perto button').click(); await p.waitForTimeout(1500);
  const depois = await p.evaluate(() => { const r = document.querySelector('.pg-perto [role="status"]'); return { txt: r ? r.textContent.trim() : null, mesma: r?.dataset.marca === 'c' }; });
  const ok = antes !== null && depois.mesma && (nome === 'liberada' ? /^Mais perto de você/.test(depois.txt) : /Sem a posição|não informa a posição/.test(depois.txt));
  res(ok, `C /pequena-guia (posição ${nome}): «${(antes || '').slice(0, 30)}…» → «${(depois.txt || '').slice(0, 60)}»; ${depois.mesma ? 'a mesma região viva' : 'a região FOI TROCADA'}`);
  await ctx.close();
}
await b.close();
console.log(ruins ? `\n${ruins} caso(s) com aviso que não chega` : '\ntodo aviso chega ao leitor de tela');
process.exit(ruins ? 1 : 0);
