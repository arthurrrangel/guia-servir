import { chromium, webkit } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:3000';
for (const [nome, motor] of [['chromium', chromium], ['webkit', webkit]]) {
  let b;
  try { b = await motor.launch({ headless: true, ...(process.env.PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) }); } catch (e) { console.log(nome, 'indisponível:', e.message.split('\n')[0]); continue; }
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: nome === 'chromium' && w < 500, hasTouch: w < 500 });
    const p = await ctx.newPage();
    await p.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(() => {});
    await p.waitForTimeout(3500);
    const r = await p.evaluate(() => { const v = document.querySelector('.s-heroi-video'); if (!v) return { video: false }; return { video: true, src: (v.currentSrc || '').split('/').pop(), pronto: v.classList.contains('pronto'), readyState: v.readyState, tempo: Math.round(v.currentTime * 10) / 10, pausado: v.paused, erro: v.error && v.error.code, tocaMp4: v.canPlayType('video/mp4; codecs="avc1.640028"') }; });
    console.log(nome, `${w}x${h}`, JSON.stringify(r));
    await ctx.close();
  }
  await b.close();
}
