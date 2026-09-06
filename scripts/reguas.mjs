import { chromium } from 'playwright';
/* =============================================================================
   AS RÉGUAS DA PÁGINA

   Achado à mão em 06/09 na faixa "O domingo": o título da seção começava em
   x=92 e a foto da MESMA seção em x=160. Numa página que é só tipo, fio e
   fotografia, a borda esquerda é a única régua que o olho tem — duas réguas
   já é nenhuma.

   Isto generaliza o achado: para cada seção, mede a borda esquerda de cada
   filho de primeiro nível que tem conteúdo, e acusa quando a seção usa mais
   de uma. Tolerância de 2px (arredondamento de subpixel).
============================================================================= */
const B=`http://localhost:${process.env.PORTA||3000}`;
const PASSA=[B,'https://qjtcaijhgldypudzyafz.supabase.co'];
const ROTAS=process.argv.slice(2);
const CHECK=()=>{
  /* O INVARIANTE NÃO É A BORDA, É O EIXO. Primeira versão deste teste acusou
     42 seções e quase todas eram falso positivo: num bloco centrado, dois
     filhos de larguras diferentes TÊM bordas esquerdas diferentes de
     propósito — o que eles compartilham é o centro. O defeito real, o que eu
     achei a olho na faixa "O domingo", é a seção em que os filhos discordam
     sobre a régua: uns alinhados pela esquerda, outros centrados em outra
     medida. Então: ou todos concordam no CENTRO, ou todos concordam na
     ESQUERDA. Discordar nos dois é que é o defeito. */
  const cs=getComputedStyle, out=[];
  const vis=e=>{const s=cs(e),r=e.getBoundingClientRect();
    return s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity>.05&&r.width>40&&r.height>4;};
  const junta=(vals,tol)=>{const g=[]; for(const v of vals){const a=g.find(x=>Math.abs(x[0]-v)<=tol);
    if(a) a.push(v); else g.push([v]);} return g.length;};
  for(const sec of document.querySelectorAll('section, footer')){
    if(!vis(sec)) continue;
    const alvo=sec.querySelector(':scope > .g')||sec;
    const filhos=[...alvo.children].filter(e=>vis(e)&&((e.textContent||'').trim().length||e.querySelector('img'))
      && cs(e).position!=='absolute' && cs(e).position!=='fixed');
    if(filhos.length<2) continue;
    const cx=[], lx=[], desc=[];
    for(const f of filhos){ const r=f.getBoundingClientRect();
      cx.push(Math.round(r.left+r.width/2)); lx.push(Math.round(r.left));
      desc.push(`${String(f.className||f.tagName).trim().slice(0,20)||f.tagName} L${Math.round(r.left)} C${Math.round(r.left+r.width/2)}`); }
    /* um grid de colunas (3 filhos lado a lado na mesma faixa vertical) não é
       uma pilha de blocos: os filhos dividem a linha e não compartilham eixo. */
    const alturas=filhos.map(f=>f.getBoundingClientRect().top);
    const ladoALado=junta(alturas,6)<filhos.length;
    if(ladoALado) continue;
    /* E AINDA FALTAVA UM CASO, que era justamente o original. Na faixa "O
       domingo" o cabeçalho estava em L92 e a foto em L160, mas os DOIS
       tinham centro 720: concordavam no eixo e discordavam na régua. Com
       cabeçalho centrado isso não se vê; com cabeçalho alinhado à esquerda,
       a régua é o que o olho usa, e duas réguas ficam gritando.
       Então: seção que tem um bloco alinhado à esquerda exige que TODOS
       compartilhem a esquerda — concordar no centro não basta. */
    const cont=alvo.getBoundingClientRect();
    const eixo=Math.round(cont.left+cont.width/2);
    const temEsquerda=filhos.some((f,i)=>Math.abs(cx[i]-eixo)>3 || Math.abs(lx[i]-Math.round(cont.left))<=3);
    const discorda = temEsquerda ? junta(lx,3)>1 : (junta(cx,3)>1 && junta(lx,3)>1);
    if(discorda) out.push({sec:String(sec.className||sec.tagName).slice(0,26)||sec.tagName, filhos:desc});
  }
  return out;
};
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let total=0;
for(const [w,h,tag] of [[1440,900,'desk'],[1024,800,'tablet']]){
  const ctx=await b.newContext({viewport:{width:w,height:h}});
  await ctx.route('**',r=>PASSA.some(u=>r.request().url().startsWith(u))?r.continue():r.abort());
  for(const rota of ROTAS){
    const p=await ctx.newPage();
    try{await p.goto(B+(rota==='home'?'/':'/'+rota),{waitUntil:'domcontentloaded',timeout:25000});}catch{}
    await p.waitForTimeout(2600);
    const r=await p.evaluate(CHECK).catch(e=>[{erro:String(e).slice(0,60)}]);
    if(r.length){ total+=r.length; console.log(`[${tag}] /${rota}`); for(const x of r) console.log('   ',JSON.stringify(x)); }
    await p.close();
  }
  await ctx.close();
}
console.log('SECOES COM MAIS DE UMA REGUA:',total);
/* LIMITE CONHECIDO, 06/09/2026: reintroduzi de propósito o defeito original
   (.c-foto travado em 1120px dentro de um container de 1256) e este teste NÃO
   acusou. Ou a regra ainda está permissiva, ou o CSS não tinha recompilado no
   momento da medição — não separei os dois. Enquanto isso não estiver provado,
   um zero aqui NÃO é prova de que as réguas estão certas: é só a ausência dos
   casos que ele sabe ver. O olho continua sendo o teste desta classe. */
await b.close();
