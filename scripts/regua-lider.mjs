/* =============================================================================
   A RÉGUA DAS TELAS DO LÍDER

   POR QUE ESTE ARQUIVO EXISTE. `reguas.mjs` percorre `section, footer`. As
   telas do líder não são feitas de `section`: são `div.lid` com `div.lid-faixa`
   e `details.esc-dia` dentro. O verificador é estruturalmente cego a elas — e
   provou ser: deu zero na /escala no mesmo dia em que o `h1` da página estava
   48px fora da régua que todo o resto da tela usava, defeito que eu achei a
   olho numa captura.

   O QUE ELE MEDE. Numa tela empilhada, existe UMA borda esquerda. Rótulo,
   título, subtítulo, botão e cabeçalho de seção nascem todos nela; quem não
   nasce, ou está dentro de uma linha horizontal (e aí a borda dele é a do
   irmão à esquerda), ou é defeito. O teste pega a espinha da página — os
   elementos que carregam texto e são filhos diretos da coluna principal — e
   conta quantas bordas esquerdas distintas elas usam. Mais de uma é suspeita,
   e a saída diz quem está em cada uma para eu julgar.

   O QUE ELE NÃO MEDE, DECLARADO. Ele não sabe se um recuo é intencional. Um
   corpo de `details` recuado de propósito aparece aqui como segunda régua e é
   legítimo. Por isso a saída é uma LISTA, não um veredito: o número sozinho
   mentiria nas duas direções. O olho continua decidindo; isto só garante que
   o olho olhe para os lugares certos em vez de varrer oito telas na sorte.
============================================================================= */
import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'node:fs';

const B = `http://localhost:${process.env.PORTA || 3000}`;
const TELAS = process.argv.slice(2).length ? process.argv.slice(2) : [
  'painel', 'painel/candidaturas', 'escala', 'time', 'time/conferir',
  'ajustes', 'ajustes/ministerios', 'eu/x',
];

async function serveRpc(route) {
  const req = route.request(), u = req.url();
  const fn = u.split('/rpc/')[1]?.split('?')[0];
  let slug = ''; try { slug = (JSON.parse(req.postData() || '{}').p_slug) || ''; } catch {}
  for (const nome of [slug ? `${fn}__${slug}` : null, fn]) {
    if (!nome) continue;
    const f = `/tmp/rpc/${nome}.json`;
    if (existsSync(f)) return route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' }, body: readFileSync(f, 'utf8') });
  }
  return route.fulfill({ status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: '[]' });
}

const CHECK = () => {
  const raiz = document.querySelector('.lid') || document.querySelector('main') || document.body;
  const cs = getComputedStyle;
  const vis = e => { const s = cs(e), r = e.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > .05 && r.width > 24 && r.height > 4; };
  /* texto PRÓPRIO: um `div` que só embrulha outros não tem borda de leitura,
     tem borda de layout, e cobrar régua dele é cobrar do contêiner errado */
  const temTextoProprio = e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
  /* IRMÃO À ESQUERDA: numa linha horizontal, quem está à direita tem a borda
     do vizinho, não a da página. Sem esta exclusão o teste acusaria toda
     tabela, todo par botão+botão e todo cabeçalho com estado à direita. */
  const emLinha = e => {
    const p = e.parentElement; if (!p) return false;
    const meu = e.getBoundingClientRect();
    /* IRMÃO ESTREITO TAMBÉM É IRMÃO. A primeira versão reusava `vis`, que
       exige largura > 40px porque foi escrita para achar BLOCOS. Um "1" numa
       linha de alerta tem 14px, então o teste não o via e acusava o texto ao
       lado dele como régua nova. O que qualifica um vizinho aqui é ocupar
       espaço à esquerda na mesma faixa vertical, não ser grande. */
    const ocupa = x => { const s = cs(x), r = x.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 2 && r.height > 2
        && s.position !== 'absolute' && s.position !== 'fixed'; };
    return [...p.children].some(irmao => {
      if (irmao === e || !ocupa(irmao)) return false;
      const r = irmao.getBoundingClientRect();
      return r.right <= meu.left + 2 && r.bottom > meu.top + 2 && r.top < meu.bottom - 2;
    });
  };
  const itens = [];
  for (const e of raiz.querySelectorAll('*')) {
    if (!vis(e) || !temTextoProprio(e)) continue;
    const s = cs(e);
    if (s.position === 'absolute' || s.position === 'fixed') continue;
    if (s.textAlign === 'center' || s.textAlign === 'right' || s.textAlign === 'end') continue;
    /* ELEMENTO INLINE NÃO TEM RÉGUA, TEM FLUXO. Primeira rodada deste teste
       acusou `.esc-prob-ir` em quatro bordas diferentes na mesma tela e um
       `<strong>` no meio de um parágrafo como "régua extra". Claro: a borda
       esquerda de um `<a>` depois de 40 caracteres de texto é onde a palavra
       calhou de cair, e cobrar alinhamento dela é cobrar do fluxo de texto.
       Só bloco tem borda de layout. */
    if (s.display === 'inline') continue;
    /* E `inline-block` DEPOIS DE TEXTO TAMBÉM É FLUXO. `.esc-prob-ir` ("ir
       para PROJEÇÃO") apareceu em quatro bordas na mesma tela: é um `<a>`
       inline-block que vem depois da frase do problema, então ele começa onde
       a frase acabou. Quem tem um nó de texto antes de si não está numa
       régua, está numa linha. */
    if ([...e.parentNode.childNodes].slice(0, [...e.parentNode.childNodes].indexOf(e))
      .some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    /* `margin-left:auto` é um empurrão declarado para a direita: o elemento
       está dizendo "eu não pertenço à régua da esquerda". */
    if (s.marginLeft === 'auto') continue;
    if (emLinha(e)) continue;
    itens.push({
      node: e,
      L: Math.round(e.getBoundingClientRect().left),
      q: (String(e.className) || e.tagName).trim().slice(0, 24) || e.tagName,
      t: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 26),
    });
  }
  const baldes = [];
  for (const it of itens) {
    const b = baldes.find(x => Math.abs(x.L - it.L) <= 3);
    if (b) b.itens.push(it); else baldes.push({ L: it.L, itens: [it] });
  }
  baldes.sort((a, b) => b.itens.length - a.itens.length);
  /* DE QUEM É A CULPA. Achar que a régua tem quatro valores é metade do
     trabalho; a outra metade é subir a árvore atrás de quem empurrou. Sem
     isto eu gastava uma sondagem por balde, em oito telas. */
  const culpa = el => {
    const passos = [];
    let n = el;
    while (n && !n.classList?.contains('lid') && n !== document.body) {
      const s = cs(n), r = n.getBoundingClientRect();
      const dentro = parseFloat(s.paddingLeft || '0') + parseFloat(s.borderLeftWidth || '0');
      const desloca = dentro + parseFloat(s.marginLeft === 'auto' ? '0' : s.marginLeft || '0');
      if (Math.abs(desloca) > .5) {
        passos.push(`${String(n.className || n.tagName).trim().slice(0, 22)}(+${Math.round(desloca)}: pad ${s.paddingLeft} bord ${s.borderLeftWidth} mar ${s.marginLeft})`);
      }
      n = n.parentElement;
    }
    return passos.slice(0, 3).join(' < ');
  };
  for (const b of baldes) b.culpa = culpa(b.itens[0].node) || '';
  /* nós DOM não atravessam a fronteira do `evaluate` */
  return baldes.map(b => ({ L: b.L, culpa: b.culpa, itens: b.itens.map(i => ({ L: i.L, q: i.q, t: i.t })) }));
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let suspeitas = 0;
for (const [w, tag] of [[390, 'cel'], [1440, 'desk']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  await ctx.route('**', r => {
    const u = r.request().url();
    if (u.includes('/rest/v1/rpc/')) return serveRpc(r);
    return u.startsWith(B) ? r.continue() : r.abort();
  });
  for (const tela of TELAS) {
    const p = await ctx.newPage();
    try { await p.goto(`${B}/${tela}?demo=1`, { waitUntil: 'domcontentloaded', timeout: 25000 }); } catch { await p.close(); continue; }
    await p.waitForTimeout(2200);
    const baldes = await p.evaluate(CHECK).catch(() => []);
    if (baldes.length > 1) {
      suspeitas += baldes.length - 1;
      console.log(`\n[${tag}] /${tela}  ${baldes.length} réguas`);
      for (const bd of baldes) {
        console.log(`   x=${String(bd.L).padStart(4)}  ${String(bd.itens.length).padStart(3)} itens   ex: ${bd.itens.slice(0, 2).map(i => `.${i.q}"${i.t}"`).join('  ')}`);
        if (bd.culpa) console.log(`             empurrado por: ${bd.culpa}`);
      }
    }
    await p.close();
  }
  await ctx.close();
}
await b.close();
console.log(`\nRÉGUAS EXTRAS SOMADAS: ${suspeitas}`);
