import { chromium } from 'playwright';
/* a porta vem do ambiente: PORTA=3555 node scripts/... . Ela ja ficou
   fixa em 3555 num commit e todo mundo que rodava em 3000 via tela vazia. */
const B=`http://localhost:${process.env.PORTA||3000}`;
const TELAS=[['/painel?demo=1','painel'],['/escala?demo=1','escala'],['/time?demo=1','time'],
['/time/conferir?demo=1','conferir'],['/ajustes?demo=1','ajustes'],['/ajustes/ministerios?demo=1','ministerios'],
['/painel/candidaturas?demo=1','candidaturas'],['/entrar','entrar'],['/eu/x?demo=1','voluntario']];
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let total=0;
for(const [w,h,tag] of [[1280,900,'desk'],[390,844,'cel']]){
  const ctx=await b.newContext({viewport:{width:w,height:h}});
  await ctx.route('**',r=>r.request().url().startsWith(B)?r.continue():r.abort());
  for(const [rota,nome] of TELAS){
    const p=await ctx.newPage();
    try{await p.goto(B+rota,{waitUntil:'domcontentloaded',timeout:15000});}catch{}
    await p.waitForTimeout(2200);
    const r=await p.evaluate((vw)=>{
      const cs=getComputedStyle, out={cortado:[],forado:[],toque:[],inline:[]};
      const raiz=document.querySelector('.sistema')||document.querySelector('.lid')||document.querySelector('.vol');
      if(!raiz) return {semRaiz:true};
      for(const e of raiz.querySelectorAll('*')){
        const s=cs(e), rc=e.getBoundingClientRect();
        if(s.display==='none'||s.visibility==='hidden'||rc.width===0) continue;
        // texto cortado: conteudo mais largo que a caixa, sem rolagem propria
        if(e.scrollWidth>e.clientWidth+1 && s.overflowX==='visible' && s.textOverflow!=='ellipsis'
           && e.children.length===0 && (e.textContent||'').trim())
          out.cortado.push(String(e.className||e.tagName).slice(0,30)+' '+e.scrollWidth+'>'+e.clientWidth+' :'+(e.textContent||'').trim().slice(0,18));
        // caixa fora da tela
        if(rc.right>vw+1||rc.left<-1)
          out.forado.push(String(e.className||e.tagName).slice(0,30)+' '+Math.round(rc.left)+'..'+Math.round(rc.right));
        // alvo de toque pequeno
        if(/^(a|button|summary)$/i.test(e.tagName) && rc.height>0 && rc.height<40 && (e.textContent||'').trim())
          out.toque.push(String(e.className||e.tagName).slice(0,26)+' h='+Math.round(rc.height)+' :'+(e.textContent||'').trim().slice(0,16));
        /* MARGEM VERTICAL EM ELEMENTO INLINE NAO TEM EFEITO. A regra existe no
           arquivo, parece certa lendo o CSS, e nao faz nada na tela. Foi assim
           que "MidiaDOMINGO 06/09 - 9 DE 9" ficou no ar: dois <span> irmaos sem
           display:block, colados na mesma linha, com um margin-top que nunca
           valeu. Sintoma provavel, nao gosto pessoal: e sempre um erro. */
        if(s.display==='inline' && ((parseFloat(s.marginTop)||0) || (parseFloat(s.marginBottom)||0)))
          out.inline.push(String(e.className||e.tagName).slice(0,26)+' inline+margin :'+(e.textContent||'').trim().slice(0,18));
      }
      for(const k in out) out[k]=[...new Set(out[k])].slice(0,4);
      return out;
    },w).catch(e=>({erro:String(e).slice(0,70)}));
    const n=(r.cortado?.length||0)+(r.forado?.length||0)+(r.toque?.length||0)+(r.inline?.length||0);
    total+=n;
    if(n||r.erro||r.semRaiz) console.log(`[${tag}] ${nome}`, JSON.stringify(r));
    await p.close();
  }
  await ctx.close();
}
console.log('TOTAL DE SINTOMAS:', total);
await b.close();
