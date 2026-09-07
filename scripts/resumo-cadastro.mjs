/* =============================================================================
   O CARTÃO DE CONFERÊNCIA DO CADASTRO

   07/09/2026. Gente tentando se cadastrar de verdade reportou o nome saindo
   UMA LETRA POR LINHA na tela 4. Medido com o CSS de então: a coluna do valor
   tinha 0px de largura e o cartão 1253px de altura.

   Este arquivo reproduz a condição exata que causava — pergunta longa num
   `<dt>` mais nome longo num `<dd>` — e cobra que não volte. Rodar com
   VELHO=1 reinjeta o CSS antigo e o teste TEM que falhar: um verificador que
   nunca acusa é carimbo, não verificação.

     PORTA=3700 node scripts/resumo-cadastro.mjs           -> tem que passar
     PORTA=3700 VELHO=1 node scripts/resumo-cadastro.mjs   -> tem que falhar
============================================================================= */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport:{width:390,height:844}, deviceScaleFactor:2 });
await p.goto(`http://localhost:${process.env.PORTA||3000}/servir/midia/cadastro`+(process.env.VELHO?'#velho':''),{waitUntil:'domcontentloaded'});
await p.waitForTimeout(3000);
// monta um resumo igual ao da tela 4, com a pergunta longa que o Connect tem
const r = await p.evaluate(() => {
  const dl = document.createElement('dl');
  dl.className = 'wiz-resumo';
  dl.innerHTML = `<dt>Nome</dt><dd id="alvo">Eliete Rangel Silva Moreira</dd>
    <dt>WhatsApp</dt><dd>21999998888</dd>
    <dt>Voce ja serviu em alguma outra area da igreja antes, e por quanto tempo?</dt><dd>Sim, dois anos</dd>`;
  (document.querySelector('main') || document.body).appendChild(dl);
  if (location.hash === '#velho') {
    const st=document.createElement('style');
    st.textContent = '.wiz-resumo{display:grid!important;grid-template-columns:auto 1fr!important;gap:8px 16px!important}.wiz-resumo dd{overflow-wrap:anywhere!important;margin:0!important}.wiz-resumo dt{margin:0!important}';
    document.head.appendChild(st);
  }
  const alvo = dl.querySelector('#alvo');
  const rr = alvo.getBoundingClientRect();
  const linhas = alvo.getClientRects().length;
  return { larguraValor:Math.round(rr.width), alturaValor:Math.round(rr.height),
    linhas, alturaCartao:Math.round(dl.getBoundingClientRect().height) };
});
console.log(JSON.stringify(r));
const passou = r.larguraValor > 120 && r.alturaValor < 60 && r.alturaCartao < 400;
console.log(passou ? 'OK: o nome cabe na largura do cartao' : 'QUEBRADO: o valor nao tem largura');
await b.close();
process.exit(passou ? 0 : 1);
