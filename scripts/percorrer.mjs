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
await ctx.route('**', r => {
  const u=r.request().url();
  if(u.includes('/rest/v1/rpc/')) return serveRpc(r);
  return u.startsWith(B) ? r.continue() : r.abort();
});
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
