import { chromium } from 'playwright';
/* PERCORRE A PÁGINA COMO QUEM VISITA, e é diferente de fullPage.
   fullPage renderiza tudo com o scroll em 0: qualquer coisa dirigida por
   rolagem (revelação, parallax, a sigla que atravessa a tela) aparece no
   estado inicial, e julgar por essa imagem é julgar uma tela que ninguém vê.
   Aqui a página rola de viewport em viewport e fotografa o que está no ar. */
const B=`http://localhost:${process.env.PORTA||3000}`;
const [rota, larg, alt, tag] = [process.argv[2], +(process.argv[3]||1440), +(process.argv[4]||900), process.argv[5]||'desk'];
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:larg,height:alt},deviceScaleFactor:1.5});
/* O SUPABASE PRECISA PASSAR. 06/09/2026.
   Bloquear tudo que não é localhost derrubava as três seções guiadas por
   dados (números da igreja, próximo culto, lista de áreas) — e auditar a
   página sem elas é auditar uma tela que nenhum visitante vê. A API pública
   é leitura com a chave anon, que já é pública por projeto. */
const PASSA=[B,'https://qjtcaijhgldypudzyafz.supabase.co'];
await ctx.route('**',r=>PASSA.some(u=>r.request().url().startsWith(u))?r.continue():r.abort());
const p=await ctx.newPage();
await p.goto(B+(rota==='home'?'/':'/'+rota),{waitUntil:'domcontentloaded',timeout:25000});
await p.waitForTimeout(2200);
const H=await p.evaluate(()=>document.body.scrollHeight);
const passo=Math.round(alt*0.92);
const nome=rota.replace(/\//g,'_');
let n=0;
for(let y=0;y<H-alt*0.25;y+=passo){
  await p.evaluate(v=>window.scrollTo(0,v),y);
  await p.waitForTimeout(1100);            // deixa a revelação terminar
  await p.screenshot({path:`/tmp/v-${nome}-${tag}-${String(n).padStart(2,'0')}.png`});
  n++;
}
console.log(`${nome} ${tag}: ${n} telas, pagina de ${H}px`);
await b.close();
