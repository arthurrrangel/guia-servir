import { chromium } from 'playwright';
/* a porta vem do ambiente: PORTA=3555 node scripts/... . Ela ja ficou
   fixa em 3555 num commit e todo mundo que rodava em 3000 via tela vazia. */
const B=`http://localhost:${process.env.PORTA||3000}`;
const alvos=process.argv.slice(2);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for(const [w,h,tag] of [[1280,900,'desk'],[390,844,'cel']]){
  const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2});
  await ctx.route('**',r=>r.request().url().startsWith(B)?r.continue():r.abort());
  for(const a of alvos){
    const p=await ctx.newPage();
    await p.goto(B+'/'+a+'?demo=1',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(2500);
    await p.screenshot({path:`/tmp/t-${a.replace(/\//g,'_')}-${tag}.png`,fullPage:true});
    await p.close();
  }
  await ctx.close();
}
await b.close();
console.log('ok');
