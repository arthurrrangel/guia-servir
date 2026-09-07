import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport:{width:390,height:700}, deviceScaleFactor:2 });
const telas = process.argv.slice(2);
for (const t of telas) {
  await p.goto(`http://localhost:3700/${t}?demo=1`,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(2200);
  await p.screenshot({ path:`/tmp/top-${t.replace(/\//g,'-')}.png` });
}
await b.close();
console.log('ok');
