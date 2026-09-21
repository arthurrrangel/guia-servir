/* A FOLHA DO SISTEMA DE DEMANDAS NÃO PODE SE SABOTAR.

   Escrito em 18/09/2026, depois de achar a logo do topo com texto #252525
   sobre fundo #252525 — uma caixa preta e vazia no canto da tela, em
   produção.

   A causa não foi um erro de cor. Foi de PESO. A regra genérica

       .dm a{color:inherit}                       peso 0-1-1

   ganha de qualquer classe aplicada num link:

       .dm-logo{background:#252525;color:#fff}    peso 0-1-0

   E repare de onde vem a armadilha: a disciplina de escopo desta folha
   manda pendurar TUDO em `.dm`, então toda regra de elemento vira
   classe+elemento e passa a pesar mais que as classes. Quem escrever a
   próxima `.dm-etiqueta{color:...}` e puser num link cai no mesmo buraco,
   calado, sem nenhum erro no console. O conserto foi `:where(.dm a)`, que
   zera o peso.

   ---------------------------------------------------------------------------
   POR QUE ESTE TESTE NÃO RECLAMA DE TUDO

   A primeira versão dele reprovava toda regra `.dm <elemento>` que pintasse
   uma propriedade que ALGUMA classe também pinta. Com isso acusou onze
   regras, e dez eram inofensivas: `.dm h1{margin}` só atrapalharia se
   existisse um `<h1 className="dm-algo">` com margin, e não existe.

   Um teste que acusa defeito onde não há treina quem lê a ignorá-lo, e aí
   ele deixa passar o defeito de verdade. Então a pergunta aqui é mais
   estreita e é a que importa: existe, NOS COMPONENTES, um elemento que
   carrega uma classe `.dm-*`, sendo que a folha também tem uma regra
   `.dm <esse elemento>` mexendo na mesma propriedade? Só aí o peso decide, e
   só aí a classe perde calada.

   Não abre navegador e não sobe servidor: é leitura de texto.

   Roda com `node scripts/demandas-css.test.mjs`. */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const bruto = readFileSync(join(raiz, 'app/demandas/demandas.css'), 'utf8');
const css = bruto.replace(/\/\*[\s\S]*?\*\//g, '');

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => {
  feitas++;
  if (!c) { falhas++; console.log('  FALHOU:', rot, extra); }
};

/* ------------------------------------------------- lê a folha em blocos */
/* VIRGULA DENTRO DE PARENTESE NAO SEPARA SELETOR.

   `sel.split(',')` quebrava `.dm :where(button,input,select,textarea)` em
   quatro pedacos, tres deles sem `.dm` nenhum, e a trava de escopo reprovava
   um seletor que nunca existiu. Um instrumento que acusa o que nao existe
   custa duas vezes: a primeira agora, e a segunda no dia em que alguem
   afrouxar a regra para calar o falso positivo e ela deixar passar o
   verdadeiro. E o mesmo tropeco que a migracao 69 registrou com "comentario
   nao e guarda". */
function virgulasDeFora(sel) {
  const fora = [];
  let nivel = 0, atual = '';
  for (const c of sel) {
    if (c === '(') nivel++;
    else if (c === ')') nivel--;
    if (c === ',' && nivel === 0) { fora.push(atual); atual = ''; continue; }
    atual += c;
  }
  fora.push(atual);
  return fora.filter(x => x.trim());
}

const blocos = [];
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const sel = m[1].trim();
  if (!sel || sel.startsWith('@')) continue;
  const props = [...m[2].matchAll(/(^|;)\s*([a-z-]+)\s*:/g)].map(x => x[2]);
  for (const parte of virgulasDeFora(sel)) blocos.push({ sel: parte.trim(), props });
}

/* o que cada classe `.dm-*` pinta, quando ela está sozinha no seletor */
const propsDaClasse = new Map();
for (const b of blocos) {
  const m = /^\.(dm-[a-z0-9-]+)$/.exec(b.sel);
  if (!m) continue;
  const alvo = propsDaClasse.get(m[1]) || new Set();
  for (const p of b.props) alvo.add(p);
  propsDaClasse.set(m[1], alvo);
}

/* ---------------------------------- o que os componentes realmente montam */
const arquivos = [];
(function varrer(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) varrer(p);
    else if (/\.tsx$/.test(n)) arquivos.push(p);
  }
})(join(raiz, 'app/demandas'));
varrerComponentes();
function varrerComponentes() {
  const d = join(raiz, 'components/demandas');
  for (const n of readdirSync(d)) if (/\.tsx$/.test(n)) arquivos.push(join(d, n));
}

/* tag → classes dm- que aparecem nela. `Link` e `a` são a mesma coisa no
   navegador: o Link do Next entrega um <a>. */
const classesPorTag = new Map();
for (const f of arquivos) {
  const txt = readFileSync(f, 'utf8');
  for (const m of txt.matchAll(/<([A-Za-z][A-Za-z0-9]*)\b([^>]*)>/g)) {
    let tag = m[1];
    if (tag === 'Link') tag = 'a';
    if (/^[A-Z]/.test(tag)) continue;              // componente próprio, não elemento
    const classes = [...m[2].matchAll(/\bdm-[a-z0-9-]+/g)].map(x => x[0]);
    if (!classes.length) continue;
    const alvo = classesPorTag.get(tag) || new Set();
    for (const c of classes) alvo.add(c);
    classesPorTag.set(tag, alvo);
  }
}
ok(classesPorTag.size > 0, 'o teste enxergou os componentes', `${arquivos.length} arquivo(s)`);

/* ------------------------------------------------------------ 1. a trava */
const colisoes = [];
for (const b of blocos) {
  const m = /^\.dm\s+([a-z][a-z0-9]*)$/.exec(b.sel);   // `.dm a`, fora de :where()
  if (!m) continue;
  const tag = m[1];
  for (const classe of classesPorTag.get(tag) || []) {
    const daClasse = propsDaClasse.get(classe);
    if (!daClasse) continue;
    const mesmas = b.props.filter(p => daClasse.has(p));
    if (mesmas.length) {
      colisoes.push(`.dm ${tag}{${mesmas.join(',')}} ganha de .${classe}, que está num <${tag}>`);
    }
  }
}
ok(colisoes.length === 0,
  'nenhuma regra de elemento ganha calada de uma classe que os componentes usam',
  colisoes.length ? `envolva em :where() → ${colisoes.join(' | ')}` : '');

/* prova de que a trava ENXERGA o defeito de hoje. Sem isto, um teste que
   nunca reprova passa por saudável. */
{
  const finge = { sel: '.dm a', props: ['color'] };
  const daClasse = propsDaClasse.get('dm-logo');
  const pegaria = /^\.dm\s+[a-z]+$/.test(finge.sel)
    && (classesPorTag.get('a') || new Set()).has('dm-logo')
    && !!daClasse && finge.props.some(p => daClasse.has(p));
  ok(pegaria, 'a trava reprova o defeito de 18/09 se ele voltar');
}

/* -------------------------------------------- 2. o escopo, de quebra */
const soltos = blocos
  .map(b => b.sel)
  .filter(s => s && !/^\d+%$/.test(s) && !/(^|[\s>+~(])\.dm\b/.test(s));
ok(soltos.length === 0, 'nenhum seletor escapa da casca .dm', soltos.slice(0, 6).join(' | '));

const noRoot = [...css.matchAll(/:root[^{]*\{([^}]*)\}/g)].some(m => /--dm-/.test(m[1]));
ok(!noRoot, 'nenhuma variável --dm-* nasce em :root');

/* ---------------------------------- 3. a logo, que foi o sintoma de hoje */
const daLogo = propsDaClasse.get('dm-logo');
ok(!!daLogo && daLogo.has('color') && daLogo.has('background'),
  'a logo diz a cor do texto E a do fundo, para uma nunca virar a outra');
ok(/:where\(\.dm a\)/.test(css), 'a regra de link está dentro de :where()');

if (falhas) { console.log(`demandas-css: ${falhas} falha(s) em ${feitas}`); process.exit(1); }
console.log(`demandas-css: ${feitas}/${feitas} ok`);
