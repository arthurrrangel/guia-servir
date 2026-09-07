import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';
/* RPCs servidas de /tmp/rpc — ver a nota longa em scripts/tira-contato.mjs:
   o Chromium deste container não alcança o Supabase. */
async function serveRpc(route){
  const req=route.request(); const u=req.url();
  const fn=u.split('/rpc/')[1]?.split('?')[0];
  let slug=''; try{ slug=(JSON.parse(req.postData()||'{}').p_slug)||''; }catch{}
  for(const nome of [slug?`${fn}__${slug}`:null, fn]){
    if(!nome) continue; const f=`/tmp/rpc/${nome}.json`;
    if(existsSync(f)) return route.fulfill({status:200,contentType:'application/json',
      headers:{'access-control-allow-origin':'*'},body:readFileSync(f,'utf8')});
  }
  return route.fulfill({status:200,contentType:'application/json',
    headers:{'access-control-allow-origin':'*'},body:'[]'});
}

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
const ARGS=process.argv.slice(2);
const AUTOTESTE=ARGS[0]==='--autoteste';
const ROTAS=AUTOTESTE?ARGS.slice(1):ARGS;
/* SEM ROTAS, ELE MENTIA DUAS VEZES. 07/09/2026. Rodei `--autoteste` sem passar
   página nenhuma: zero páginas visitadas, total 0, e o script imprimiu
   "AUTOTESTE FALHOU: NAO confie no zero" — que é a mensagem de um verificador
   cego, não a de um verificador sem trabalho. Gastei uma investigação inteira
   procurando regressão no CHECK. Sem rotas ele também imprimiria um zero
   tranquilizador no modo normal. As duas saídas eram falsas pelo mesmo motivo. */
if(!ROTAS.length){
  console.log('USO: node scripts/reguas.mjs [--autoteste] <rota> [rota...]   (ex.: home sobre servir)');
  console.log('Nenhuma rota recebida — nada foi medido. Isto NAO e um zero.');
  process.exit(2);
}
/* O DEFEITO CONHECIDO, PARA PROVAR QUE O TESTE O ENXERGA.
   Este arquivo já deu zero duas vezes numa página que eu estava vendo
   desalinhada com os próprios olhos. Um verificador que nunca acusa não é um
   verificador: é um carimbo. `--autoteste` injeta de volta a medida centrada
   que causava L92 no título e L160 na grade; se o resultado não for MAIOR que
   zero, o problema está aqui e não na página. */
const CSS_DEFEITO=`.g-cab ~ .cartoes,.g-cab ~ .g-passos,.g-cab ~ .ficha,
  .g-cab ~ .pgs,.g-cab ~ .c-larga{ max-width:1120px !important; margin-inline:auto !important }`;
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
    /* A BORDA DO CONTAINER É A DE CONTEÚDO, NÃO A EXTERNA — e era exatamente
       aqui que este verificador estava cego. `.g` tem max-width 1360, margem
       automática e padding-inline de 52px: em 1440 o retângulo dele começa em
       40 e o CONTEÚDO em 92. Eu comparava o filho (92) com a borda externa
       (40), a diferença dava 52, e o teste concluía "ninguém está colado na
       esquerda, logo é uma seção centrada" — e seções centradas podem ter
       esquerdas diferentes. Resultado: zero numa página que eu estava vendo
       desalinhada. Duas vezes.
       Com a borda de conteúdo, um filho em 92 é reconhecido como alinhado à
       esquerda, e aí a régua passa a valer para todos os irmãos.
       `--autoteste` injeta o defeito de volta e cobra que este bloco o veja. */
    const cont=alvo.getBoundingClientRect();
    const ks=cs(alvo);
    const bordaConteudo=Math.round(cont.left+parseFloat(ks.paddingLeft||'0'));
    const eixo=Math.round(cont.left+cont.width/2);
    /* E BLOCO DE LARGURA CHEIA COM text-align:center NÃO É BLOCO ALINHADO À
       ESQUERDA. Sem esta condição o herói acusava: `g-rot`, `g-ed` e `g-acoes`
       ocupam a coluna inteira (portanto encostam na borda) mas estão centrados
       por text-align, e o `g-h1` ao lado tem medida curta — três esquerdas,
       zero defeito. Quem manda é a intenção declarada no alinhamento. */
    const aEsquerda=f=>{ const t=cs(f).textAlign; return t!=='center' && t!=='-webkit-center'; };
    const temEsquerda=filhos.some((f,i)=>Math.abs(lx[i]-bordaConteudo)<=3 && aEsquerda(f));
    const discorda = temEsquerda ? junta(lx,3)>1 : (junta(cx,3)>1 && junta(lx,3)>1);
    if(discorda) out.push({sec:String(sec.className||sec.tagName).slice(0,26)||sec.tagName, filhos:desc});
  }
  return out;
};
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
let total=0;
for(const [w,h,tag] of [[1440,900,'desk'],[1024,800,'tablet']]){
  const ctx=await b.newContext({viewport:{width:w,height:h}});
  await ctx.route('**', r => { const u=r.request().url();
      if(u.includes('/rest/v1/rpc/')) return serveRpc(r);
      return u.startsWith(B) ? r.continue() : r.abort(); });
  for(const rota of ROTAS){
    const p=await ctx.newPage();
    try{await p.goto(B+(rota==='home'?'/':'/'+rota),{waitUntil:'domcontentloaded',timeout:25000});}catch{}
    await p.waitForTimeout(2600);
    if(AUTOTESTE) { await p.addStyleTag({content:CSS_DEFEITO}); await p.waitForTimeout(400); }
    const r=await p.evaluate(CHECK).catch(e=>[{erro:String(e).slice(0,60)}]);
    if(r.length){ total+=r.length; console.log(`[${tag}] /${rota}`); for(const x of r) console.log('   ',JSON.stringify(x)); }
    await p.close();
  }
  await ctx.close();
}
console.log('SECOES COM MAIS DE UMA REGUA:',total);
if(AUTOTESTE){ console.log(total>0
  ? 'AUTOTESTE OK: o verificador enxerga o defeito conhecido.'
  : 'AUTOTESTE FALHOU: o defeito foi injetado e o verificador nao viu. NAO confie no zero.'); }
/* LIMITE CONHECIDO, 06/09/2026: reintroduzi de propósito o defeito original
   (.c-foto travado em 1120px dentro de um container de 1256) e este teste NÃO
   acusou. Ou a regra ainda está permissiva, ou o CSS não tinha recompilado no
   momento da medição — não separei os dois. Enquanto isso não estiver provado,
   um zero aqui NÃO é prova de que as réguas estão certas: é só a ausência dos
   casos que ele sabe ver. O olho continua sendo o teste desta classe. */
await b.close();
