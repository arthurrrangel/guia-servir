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
   TIRA DE CONTATO

   Para caçar defeito de COMPOSIÇÃO, o detalhe atrapalha: o que denuncia
   gabarito é o RITMO — quantas seções seguidas têm a mesma silhueta, o mesmo
   eixo, o mesmo par de botões no mesmo lugar. Uma página inteira reduzida a
   uma tira estreita mostra isso numa olhada; nove capturas em tamanho real
   escondem, porque cada uma parece boa sozinha.

   Rola a página antes de fotografar, para as revelações e a fotografia
   entrarem. Depois reduz a 380px de largura, que é onde a silhueta ainda lê e
   o texto já não distrai.
============================================================================= */
const B=`http://localhost:${process.env.PORTA||3000}`;
const PASSA=[B,'https://qjtcaijhgldypudzyafz.supabase.co'];
const ROTAS=process.argv.slice(2);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const ctx=await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
await ctx.route('**', r => {
  const u=r.request().url();
  if(u.includes('/rest/v1/rpc/')) return serveRpc(r);
  return u.startsWith(B) ? r.continue() : r.abort();
});
for(const rota of ROTAS){
  const p=await ctx.newPage();
  const alvo = rota==='home' ? '/' : (rota.startsWith('/')?rota:'/'+rota);
  try{ await p.goto(B+alvo,{waitUntil:'domcontentloaded',timeout:25000}); }catch{}
  await p.waitForTimeout(2200);
  /* ROLAGEM EM RITMO HUMANO, E ISSO NÃO É DETALHE. 07/09/2026.
     A primeira versão rolava 500px a cada 90ms. A tira da /sobre saiu com uma
     faixa de 900px de branco e um filete no meio, e eu quase abri um conserto
     para uma seção que "não aparecia". Medido depois: com passo de 300px e
     420ms de espera, as 23 palavras da revelação aparecem e as 7 seções ganham
     `.visto`. O branco era a animação fotografada no meio do caminho.
     Ferramenta que mente sobre a tela produz conserto de fantasma. */
  await p.evaluate(async()=>{ const H=document.body.scrollHeight;
    for(let y=0;y<H;y+=300){ window.scrollTo(0,y); await new Promise(r=>setTimeout(r,420)); }
    window.scrollTo(0,0); await new Promise(r=>setTimeout(r,600)); });
  await p.waitForTimeout(1200);
  const nome=rota.replace(/[\/?=&]/g,'_');
  await p.screenshot({path:`/tmp/tc-${nome}.png`,fullPage:true});
  const h=await p.evaluate(()=>document.body.scrollHeight);
  console.log(`${nome.padEnd(26)} ${h}px`);
  await p.close();
}
await b.close();
