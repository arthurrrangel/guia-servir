import { chromium } from 'playwright';
/* a porta vem do ambiente: PORTA=3555 node scripts/... . Ela ja ficou
   fixa em 3555 num commit e todo mundo que rodava em 3000 via tela vazia. */
const B=`http://localhost:${process.env.PORTA||3000}`;
/* raiz cai para o body: assim a mesma varredura serve o sistema (.sistema/.lid/
   .vol) e o site público, que não tem casca nenhuma. As rotas vêm do argumento
   quando há um; sem argumento, varre o sistema como antes. */
const PADRAO=[['/painel?demo=1','painel'],['/escala?demo=1','escala'],['/time?demo=1','time'],
['/time/conferir?demo=1','conferir'],['/ajustes?demo=1','ajustes'],['/ajustes/ministerios?demo=1','ministerios'],
['/painel/candidaturas?demo=1','candidaturas'],['/entrar','entrar'],['/eu/x?demo=1','voluntario']];
const ARGS=process.argv.slice(2);
const TELAS=ARGS.length?ARGS.map(a=>[a==='home'?'/':'/'+a, a]):PADRAO;

const CHECK = () => {
  const cs=getComputedStyle, out={sobrepoe:[],contraste:[],morta:[],alvo:[],falsoBotao:[],semNome:[]};
  const raiz=document.querySelector('.sistema')||document.querySelector('.lid')||document.querySelector('.vol')||document.body;
  if(!raiz) return {semRaiz:true};
  const nome=e=>String(e.className||e.tagName).trim().slice(0,26)||e.tagName;
  const vis=e=>{const s=cs(e),r=e.getBoundingClientRect();
    return s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity>0.05&&r.width>0&&r.height>0;};

  /* 1. IRMAOS QUE SE SOBREPOEM. Dois elementos lado a lado no mesmo pai, os
     dois com texto, com as caixas se cruzando na horizontal: e sempre erro. */
  for(const pai of raiz.querySelectorAll('*')){
    const f=[...pai.children].filter(e=>vis(e)&&(e.textContent||'').trim()&&cs(e).position!=='absolute'&&cs(e).position!=='fixed'&&cs(e).display!=='inline');
    for(let i=0;i<f.length-1;i++){
      const a=f[i].getBoundingClientRect(), b=f[i+1].getBoundingClientRect();
      const cruzaH=a.right>b.left+1&&a.left<b.right-1, cruzaV=a.bottom>b.top+1&&a.top<b.bottom-1;
      if(cruzaH&&cruzaV) out.sobrepoe.push(nome(f[i])+' x '+nome(f[i+1])+' :'+(f[i].textContent||'').trim().slice(0,14));
    }
  }

  /* 2. CONTRASTE. Texto folha contra o fundo pintado mais proximo.

     PONTO CEGO CONHECIDO, medido em 06/09/2026: quando o fundo e uma IMAGEM
     e nao uma cor, esta funcao sobe a arvore procurando background-color, nao
     acha nenhum pintado e acaba comparando o texto com ele mesmo — sai
     1.00:1. Foi o que aconteceu com a barra do topo sobre a foto do heroi:
     seis alarmes, e a amostragem de pixel na captura deu 9,4:1 a 10:1, muito
     acima do 4,5 do AA. Alarme de contraste sobre elemento com foto atras
     precisa ser conferido no pixel antes de virar conserto. */
  const lum=c=>{const [r,g,b]=c.map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});
    return .2126*r+.7152*g+.0722*b};
  const rgb=s=>{const m=s.match(/\d+(\.\d+)?/g); return m?m.slice(0,3).map(Number):null};
  const fundo=e=>{let p=e; while(p&&p!==document.documentElement){const b=cs(p).backgroundColor;
    const m=b.match(/rgba?\(([^)]+)\)/); if(m){const v=m[1].split(',').map(parseFloat);
      if(v.length<4||v[3]>0.9) return v.slice(0,3);} p=p.parentElement;} return [255,255,255]};
  for(const e of raiz.querySelectorAll('*')){
    if(e.children.length||!(e.textContent||'').trim()||!vis(e)) continue;
    const s=cs(e), f=rgb(s.color), b=fundo(e); if(!f) continue;
    const L1=lum(f)+.05, L2=lum(b)+.05, r=(Math.max(L1,L2)/Math.min(L1,L2));
    const px=parseFloat(s.fontSize), grande=px>=24||(px>=18.66&&+s.fontWeight>=700);
    const min=grande?3:4.5;
    if(r<min) out.contraste.push(nome(e)+' '+r.toFixed(2)+':1 (min '+min+') '+px+'px :'+(e.textContent||'').trim().slice(0,16));
  }

  /* 3. PROPRIEDADE MORTA: declarada e sem efeito nenhum no contexto. */
  for(const e of raiz.querySelectorAll('*')){
    if(!vis(e)) continue;
    const s=cs(e), d=s.display;
    const flexou=/flex|grid/.test(d), paiFlex=e.parentElement?/flex|grid/.test(cs(e.parentElement).display):false;
    if(!flexou && s.gap!=='normal' && parseFloat(s.gap)>0 && e.children.length>1) out.morta.push(nome(e)+' gap em display:'+d);
    if(d==='inline' && !(e instanceof SVGElement) && !/^(img|svg|input|select|textarea|button)$/i.test(e.tagName) && (parseFloat(s.width)||0)>0 && s.width!=='auto') out.morta.push(nome(e)+' width em inline');
    if(!paiFlex && s.alignSelf!=='auto') out.morta.push(nome(e)+' align-self sem pai flex');
  }

  /* 4. ALVO DE TOQUE de verdade: so o que e controle, nao link dentro de frase. */
  for(const e of raiz.querySelectorAll('button,summary,[role="button"],a.lid-bt,a.acao,a.btn,a.pri')){
    const r=e.getBoundingClientRect(); if(!vis(e)) continue;
    if(r.height<40) out.alvo.push(nome(e)+' h='+Math.round(r.height)+' :'+(e.textContent||'').trim().slice(0,16));
  }
  /* 5. PARECE BOTAO E NAO E. Caixa com borda visivel + padding, texto curto,
     e nenhum comportamento: e o defeito do .pill que ja consertei no /time.
     Aqui procuro se sobrou algum. */
  for(const e of raiz.querySelectorAll('span,div,i,em')){
    if(!vis(e)||e.children.length) continue;
    const s=cs(e), t=(e.textContent||'').trim();
    if(!t||t.length>28) continue;
    const temBorda=['Top','Right','Bottom','Left'].every(l=>parseFloat(s['border'+l+'Width'])>0)
      && s.borderTopStyle!=='none' && !/rgba\(0, 0, 0, 0\)|transparent/.test(s.borderTopColor);
    const temPad=parseFloat(s.paddingLeft)>=6;
    const clicavel=e.closest('button,a,summary,[role="button"],label');
    if(temBorda&&temPad&&!clicavel) out.falsoBotao.push(nome(e)+' :'+t.slice(0,18));
  }

  /* 6. CAMPO SEM NOME. input/select/textarea sem <label>, aria-label ou
     aria-labelledby: quem usa leitor de tela ou quem so bate o olho nao sabe
     o que aquilo pede. */
  for(const e of raiz.querySelectorAll('input,select,textarea')){
    if(!vis(e)||e.type==='hidden') continue;
    const id=e.id, temLabel=id&&document.querySelector('label[for="'+CSS.escape(id)+'"]');
    if(!temLabel && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.closest('label'))
      out.semNome.push(e.tagName.toLowerCase()+'#'+(id||'(sem id)')+' '+nome(e));
  }
  for(const k in out) out[k]=[...new Set(out[k])].slice(0,6);
  return out;
};

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let total=0;
for(const [w,h,tag] of [[1280,900,'desk'],[390,844,'cel']]){
  const ctx=await b.newContext({viewport:{width:w,height:h}});
  const PASSA=[B,'https://qjtcaijhgldypudzyafz.supabase.co'];
  await ctx.route('**',r=>PASSA.some(u=>r.request().url().startsWith(u))?r.continue():r.abort());
  for(const [rota,nome] of TELAS){
    const p=await ctx.newPage();
    try{await p.goto(B+rota,{waitUntil:'domcontentloaded',timeout:15000});}catch{}
    await p.waitForTimeout(2200);
    /* ABRE O QUE ESTA FECHADO ANTES DE MEDIR. 05/09/2026.
       O QUE EU ACHEI QUE ISSO CONSERTAVA E O QUE CONSERTA DE VERDADE, medido:

       Achei que metade do sistema estava fora da varredura por morar dentro de
       <details> fechado. Errado. Medi o primeiro .tm-pessoa do /time fechado e
       aberto: 323x816 nos dois casos, os 34 descendentes com caixa nos dois.
       Chromium diagrama o corpo de um <details> fechado. Ja estava sendo medido.

       O que estava REALMENTE fora era o menu de ministerios: ele so existe no
       DOM depois do clique no botao do topo. Antes desta linha, os 6 itens do
       seletor nunca passaram por nenhuma checagem — nem alvo de toque, nem
       contraste. O forEach nos <details> fica porque custa nada e nao depende
       de o Chromium continuar diagramando fechado. */
    await p.evaluate(()=>{
      document.querySelectorAll('details').forEach(d=>d.open=true);
      const bt=document.querySelector('.seletor-equipe'); if(bt) bt.click();
    }).catch(()=>{});
    await p.waitForTimeout(900);
    const r=await p.evaluate(CHECK).catch(e=>({erro:String(e).slice(0,70)}));
    const n=Object.keys(r).filter(k=>Array.isArray(r[k])).reduce((a,k)=>a+r[k].length,0);
    total+=n;
    if(n||r.erro||r.semRaiz){ const s={}; for(const k in r) if(!Array.isArray(r[k])||r[k].length) s[k]=r[k];
      console.log(`[${tag}] ${nome}`, JSON.stringify(s)); }
    await p.close();
  }
  await ctx.close();
}
console.log('TOTAL:', total);
await b.close();
