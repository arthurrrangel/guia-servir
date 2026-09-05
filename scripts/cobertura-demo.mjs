import { chromium } from 'playwright';
/* a porta vem do ambiente: PORTA=3555 node scripts/... . Ela ja ficou
   fixa em 3555 num commit e todo mundo que rodava em 3000 via tela vazia. */
const B=`http://localhost:${process.env.PORTA||3000}`;
const TELAS=[['/painel?demo=1','painel'],['/escala?demo=1','escala'],['/time?demo=1','time'],
['/time/conferir?demo=1','conferir'],['/ajustes?demo=1','ajustes'],['/ajustes/ministerios?demo=1','ministerios'],
['/painel/candidaturas?demo=1','candidaturas'],['/eu/x?demo=1','voluntario']];
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:1280,height:900}});
await ctx.route('**',r=>r.request().url().startsWith(B)?r.continue():r.abort());
for(const [rota,nome] of TELAS){
  const p=await ctx.newPage();
  try{await p.goto(B+rota,{waitUntil:'domcontentloaded',timeout:15000});}catch{}
  await p.waitForTimeout(2200);
  const r=await p.evaluate(()=>{
    const raiz=document.querySelector('.sistema')||document.querySelector('.vol');
    const main=document.querySelector('main')||raiz;
    const txt=(main?.innerText||'').trim();
    return { altura:document.documentElement.scrollHeight, elementos:main?main.querySelectorAll('*').length:0,
      palavras: txt.split(/\s+/).filter(Boolean).length,
      vazio: /nada por aqui|ninguém|nenhum|sem nada|Carregando/i.test(txt.slice(0,400)),
      primeiras: txt.split('\n').filter(l=>l.trim()).slice(0,4) };
  }).catch(e=>({erro:String(e).slice(0,60)}));
  console.log(nome.padEnd(14), JSON.stringify(r));
  await p.close();
}
await b.close();
