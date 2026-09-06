import { chromium } from 'playwright';
/* a porta vem do ambiente: PORTA=3600 node scripts/tirar-telas.mjs rota ... */
const B=`http://localhost:${process.env.PORTA||3000}`;
const alvos=process.argv.slice(2);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
for(const [w,h,tag] of [[1440,900,'desk'],[390,844,'cel']]){
  const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2});
  /* O SUPABASE PRECISA PASSAR. 06/09/2026.
   Bloquear tudo que não é localhost derrubava as três seções guiadas por
   dados (números da igreja, próximo culto, lista de áreas) — e auditar a
   página sem elas é auditar uma tela que nenhum visitante vê. A API pública
   é leitura com a chave anon, que já é pública por projeto. */
const PASSA=[B,'https://qjtcaijhgldypudzyafz.supabase.co'];
await ctx.route('**',r=>PASSA.some(u=>r.request().url().startsWith(u))?r.continue():r.abort());
  for(const a of alvos){
    const p=await ctx.newPage();
    try{ await p.goto(B+(a==='home'?'/':'/'+a),{waitUntil:'domcontentloaded',timeout:25000}); }catch{}
    await p.waitForTimeout(1200);
    /* revelações por rolagem: desce a página inteira para acionar tudo, volta ao topo */
    await p.evaluate(async()=>{ const H=document.body.scrollHeight;
      for(let y=0;y<H;y+=400){ window.scrollTo(0,y); await new Promise(r=>setTimeout(r,60)); }
      window.scrollTo(0,0); await new Promise(r=>setTimeout(r,300)); });
    await p.waitForTimeout(900);
    await p.screenshot({path:`/tmp/s-${a.replace(/\//g,'_')}-${tag}.png`,fullPage:true});
    await p.close();
  }
  await ctx.close();
}
await b.close();
console.log('ok');
