import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport:{width:390,height:700}, deviceScaleFactor:2 });
const [t, y] = process.argv.slice(2);
await p.goto(`http://localhost:3700/${t}?demo=1`,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(2200);
await p.evaluate(v=>window.scrollTo(0,+v), y||0); await p.waitForTimeout(500);
await p.screenshot({ path:`/tmp/sc-${t.replace(/\//g,'-')}-${y||0}.png` });
console.log(`/tmp/sc-${t.replace(/\//g,'-')}-${y||0}.png`);
await b.close();
