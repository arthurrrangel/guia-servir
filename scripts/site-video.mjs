/* =============================================================================
   RÉGUA DO VÍDEO · 12/10/2026 (herói da home) → 13/10/2026 (todo vídeo do site)

   Para cada página, no celular (390x844, em pé) e no computador (1440x900),
   rola até cada <video> e confere que ele carregou o arquivo certo para a
   tela (-p em pé, -l deitado, -v/-q nos quadros), está tocando (o tempo
   anda), entrou em fade (classe "pronto") e não deu erro. Termina com
   "FALHAS n"; zero é o esperado.

   Uso: node scripts/site-video.mjs [base] [rotas separadas por vírgula]
   PROXY=1 vai para a produção pelo proxy da sessão. O WebKit só roda se
   estiver instalado (no container não está: a régua diz "indisponível").
   ============================================================================= */
import { chromium, webkit } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3000';
const ROTAS = (process.argv[3] || '/,/cultos,/sobre,/eventos,/pequena-guia,/ofertar,/como-chegar,/servir,/servir/midia,/servir/louvor,/servir/kids,/servir/servico,/servir/livraria,/servir/onde-me-encaixo,/acessar').split(',');
let falhas = 0;

for (const [nome, motor] of [['chromium', chromium], ['webkit', webkit]]) {
  let b;
  try { b = await motor.launch({ headless: true, ...(process.env.PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) }); } catch (e) { console.log(nome, 'indisponível:', e.message.split('\n')[0]); continue; }
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    for (const rota of ROTAS) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: nome === 'chromium' && w < 500, hasTouch: w < 500 });
      const p = await ctx.newPage();
      await p.goto(BASE + rota, { waitUntil: 'networkidle' }).catch(() => {});
      const n = await p.evaluate(() => document.querySelectorAll('video').length);
      const linhas = [];
      for (let i = 0; i < n; i++) {
        await p.evaluate(k => document.querySelectorAll('video')[k].scrollIntoView({ block: 'center' }), i);
        await p.waitForTimeout(2200);
        /* o tempo tem que andar entre duas leituras (uma leitura só pega o
           loop recomeçando em 0 e acusa falha à toa) */
        const r = await p.evaluate(async k => {
          const v = document.querySelectorAll('video')[k];
          const t1 = v.currentTime;
          await new Promise(res => setTimeout(res, 450));
          const t2 = v.currentTime;
          return { arq: (v.currentSrc || '').split('/').pop(), pronto: v.classList.contains('pronto'), pausado: v.paused, t: Math.round(t2 * 10) / 10, anda: t2 !== t1, erro: v.error ? v.error.code : 0 };
        }, i);
        const emPe = h > w;
        const sufixo = (r.arq.match(/-([lpvq])\.(mp4|webm)$/) || [])[1];
        const certo = sufixo === 'v' || sufixo === 'q' || (emPe ? sufixo === 'p' : sufixo === 'l');
        const ok = r.arq && certo && r.pronto && !r.pausado && r.anda && !r.erro;
        if (!ok) falhas++;
        linhas.push(`${ok ? 'ok' : 'FALHA'} ${r.arq || '(sem arquivo)'} t=${r.t}${r.anda ? '' : ' parado'}${r.pausado ? ' pausado' : ''}${r.pronto ? '' : ' sem-fade'}${r.erro ? ' erro=' + r.erro : ''}`);
      }
      console.log(`${nome} ${w}x${h} ${rota}: ${n} vídeo(s)${linhas.length ? '\n   ' + linhas.join('\n   ') : ''}`);
      await ctx.close();
    }
  }
  await b.close();
}
console.log('FALHAS', falhas);
