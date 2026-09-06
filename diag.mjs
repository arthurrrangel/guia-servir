import { chromium } from 'playwright';
const B='http://localhost:3600';
const PASSA=[B,'https://qjtcaijhgldypudzyafz.supabase.co'];
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:1440,height:900}});
await ctx.route('**',r=>PASSA.some(u=>r.request().url().startsWith(u))?r.continue():r.abort());
const p=await ctx.newPage();
await p.goto(B+'/',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(3000);
console.log(JSON.stringify(await p.evaluate(()=>{
  const box=s=>{const e=document.querySelector(s); if(!e) return s+': ausente';
    const r=e.getBoundingClientRect(); return {sel:s,L:Math.round(r.left),R:Math.round(r.right),W:Math.round(r.width)};};
  const ed=document.querySelector('.g-cab-txt .g-ed');
  return {
    caixas:[box('#domingo .g'),box('#domingo .g-cab'),box('#domingo .g-cab-txt'),
            box('#domingo .g-acoes'),box('#domingo .c-foto'),box('#domingo .g-foto'),
            box('#areas .g-cab'),box('#areas .casa-areas')],
    italica: ed?{txt:ed.textContent,linhas:Math.round(ed.getBoundingClientRect().height/parseFloat(getComputedStyle(ed).lineHeight)),
      w:Math.round(ed.getBoundingClientRect().width), mw:getComputedStyle(ed).maxWidth}:null,
    fatos:[...document.querySelectorAll('.fatos > *')].map(f=>({h:Math.round(f.getBoundingClientRect().height),
      txt:(f.textContent||'').trim().slice(0,28)})),
  };
}),null,1));
await b.close();
