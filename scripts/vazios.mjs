import { chromium } from 'playwright';
/* -----------------------------------------------------------------------------
   AS RPCs SÃO SERVIDAS DE ARQUIVO, E ISSO NÃO É MOCK POR PREGUIÇA
   07/09/2026. O Chromium deste container não alcança o Supabase: `fetch`
   nativo dentro da página dá timeout em 9s, sequencial e paralelo, enquanto o
   MESMO endpoint responde em 0,8s pelo curl (o curl usa o proxy de saída, o
   navegador não). Sem isto, /servir/<área>, o cadastro, /onde-me-encaixo e
   /equipe/<slug> aparecem eternamente em "Carregando" e eu audito uma tela que
   nenhum visitante vê — foi assim que eu quase abri conserto para três
   páginas "vazias" que estão inteiras em produção.
   O conteúdo é a resposta REAL, baixada por curl para /tmp/rpc. Não é dado
   inventado: é o banco do Arthur, entregue por outro caminho.
----------------------------------------------------------------------------- */
import { readFileSync, existsSync } from 'node:fs';
const RPC='/tmp/rpc';
async function serveRpc(route){
  const req=route.request(); const u=req.url();
  const fn=u.split('/rpc/')[1]?.split('?')[0];
  let slug=''; try{ slug=(JSON.parse(req.postData()||'{}').p_slug)||''; }catch{}
  for(const nome of [slug?`${fn}__${slug}`:null, fn]){
    if(!nome) continue;
    const f=`${RPC}/${nome}.json`;
    if(existsSync(f)) return route.fulfill({status:200, contentType:'application/json',
      headers:{'access-control-allow-origin':'*'}, body:readFileSync(f,'utf8')});
  }
  return route.fulfill({status:200, contentType:'application/json',
    headers:{'access-control-allow-origin':'*'}, body:'[]'});
}

/* =============================================================================
   VAZIO SEM PROPÓSITO

   Mede, em cada seção, a distância entre o topo da seção e o primeiro pixel de
   conteúdo, e entre o último pixel de conteúdo e o fim da seção. Respiro é
   projeto; 600px de nada é seção que perdeu o conteúdo ou padding que ninguém
   revisou depois de mudar a estrutura.

   Acusa acima de 240px, que é o dobro do maior padding-block do sistema
   (clamp(64px,8.5vw,128px)).
============================================================================= */
const B=`http://localhost:${process.env.PORTA||3000}`;
const PASSA=[B,'https://qjtcaijhgldypudzyafz.supabase.co'];
const LIMITE=240;
const CHECK=(LIM)=>{
  const cs=getComputedStyle, out=[];
  const vis=e=>{const s=cs(e),r=e.getBoundingClientRect();
    return s.display!=='none'&&s.visibility!=='hidden'&&+s.opacity>.05&&r.width>2&&r.height>2;};
  for(const sec of document.querySelectorAll('section, footer')){
    if(!vis(sec)) continue;
    const r=sec.getBoundingClientRect(); const topo=r.top+scrollY, fim=topo+r.height;
    let min=Infinity, max=-Infinity, n=0;
    for(const e of sec.querySelectorAll('*')){
      if(!vis(e)) continue;
      if(e.children.length && !(e.textContent||'').trim() && e.tagName!=='IMG' && e.tagName!=='SVG') continue;
      const q=e.getBoundingClientRect();
      min=Math.min(min,q.top+scrollY); max=Math.max(max,q.bottom+scrollY); n++;
    }
    if(!n||min===Infinity){ out.push({sec:String(sec.className||sec.tagName).slice(0,26),
      alerta:`SEM CONTEUDO, ${Math.round(r.height)}px de altura`}); continue; }
    const cima=Math.round(min-topo), baixo=Math.round(fim-max);
    if(cima>LIM||baixo>LIM) out.push({sec:String(sec.className||sec.tagName).slice(0,26)||sec.tagName,
      alt:Math.round(r.height), vazioCima:cima, vazioBaixo:baixo});
  }
  return out;
};
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:1440,height:900}});
await ctx.route('**', r => {
  const u=r.request().url();
  if(u.includes('/rest/v1/rpc/')) return serveRpc(r);
  return u.startsWith(B) ? r.continue() : r.abort();
});
let total=0;
for(const rota of process.argv.slice(2)){
  const p=await ctx.newPage();
  try{await p.goto(B+(rota==='home'?'/':'/'+rota),{waitUntil:'domcontentloaded',timeout:25000});}catch{}
  await p.waitForTimeout(2600);
  await p.evaluate(async()=>{const H=document.body.scrollHeight;
    for(let y=0;y<H;y+=300){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,420));}
    window.scrollTo(0,0);await new Promise(r=>setTimeout(r,600));});
  await p.waitForTimeout(900);
  const r=await p.evaluate(CHECK,LIMITE).catch(e=>[{erro:String(e).slice(0,60)}]);
  if(r.length){ total+=r.length; console.log(`/${rota}`); for(const x of r) console.log('   ',JSON.stringify(x)); }
  await p.close();
}
console.log('VAZIOS ACIMA DE',LIMITE+'px:',total);
await b.close();
