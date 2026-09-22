/* CLASSE ESCRITA NO JSX QUE A FOLHA NÃO CONHECE — 20/09/2026.

   Auditoria de tela. `app/demandas/d/[numero]/page.tsx` escrevia
   `className={e.interno ? 'interno' : ''}` e a folha define
   `.dm-hist .dm-interno`. O irmão da linha de cima escrevia `'marco'` e a
   folha define `.dm-hist li.dm-marco::before`. Resultado: o comentário
   marcado como INTERNO saía idêntico a um comentário público, e os marcos
   (abertura, status, aprovação, reabertura) nunca ganhavam o ponto escuro.

   A promessa da caixa ("Marque como interno o que for combinação da equipe")
   ficava falsa, e duas regras da folha morriam caladas.

   `demandas-css.test.mjs` não pega isso e não deveria: ele mede peso de
   seletor e escopo. Este arquivo mede outra coisa — que toda classe `dm-*`
   usada no JSX exista na folha, e que nenhuma classe da folha seja escrita
   sem o prefixo obrigatório.

   A regra do prefixo já está escrita em demandas.css: tudo desta folha vive
   sob `.dm`, e classe sem `dm-` é classe que vai colidir com o outro sistema
   ou morrer sem estilo. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

const folha = readFileSync('app/demandas/demandas.css', 'utf8');
const naFolha = new Set([...folha.matchAll(/\.(dm-[a-z0-9-]+)/g)].map(m => m[1]));
ok(naFolha.size > 40, 'a folha tem classes dm- para conferir', String(naFolha.size));

const arquivos = [];
(function anda(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) anda(p);
    else if (/\.tsx?$/.test(n)) arquivos.push(p);
  }
})('app/demandas');
/* TODA a pasta de peças, e não uma lista escrita à mão · 22/09/2026.

   Esta linha era `arquivos.push('components/demandas/Ui.tsx',
   'components/demandas/Casca.tsx')`. A migração 94 trouxe `Lista.tsx` (a
   lista dos dois portais) e `Configuracao.tsx` (setores e categorias), e as
   classes que elas escrevem (`dm-item`, `dm-prazo`...) passaram a parecer
   "regra da folha sem ninguém que a escreva". Lista à mão envelhece calada;
   a pasta inteira não. */
(function anda(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) anda(p);
    else if (/\.tsx?$/.test(n)) arquivos.push(p);
  }
})('components/demandas');

/* 1) toda classe dm- escrita no JSX existe na folha */
const faltando = [];
for (const a of arquivos) {
  const txt = readFileSync(a, 'utf8');
  for (const m of txt.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{[^}]*?'([^']*)'[^}]*?\})/g)) {
    const bruto = `${m[1] || ''} ${m[2] || ''} ${m[3] || ''}`;
    for (const c of bruto.split(/[\s${}?:()|&]+/)) {
      if (/^dm-[a-z0-9-]+$/.test(c) && !naFolha.has(c)) faltando.push(`${a}: ${c}`);
    }
  }
}
ok(faltando.length === 0, 'nenhuma classe dm- do JSX falta na folha', faltando.join(', '));

/* 2) E O CASO QUE ACONTECEU: as duas classes do histórico, pelo nome.

      Escrito à mão de propósito. A varredura acima não pega `'interno'` (sem
      prefixo), porque ela só conhece o que TEM prefixo — e o defeito era
      justamente a ausência dele. */
const ficha = readFileSync('app/demandas/d/[numero]/page.tsx', 'utf8');
ok(/'dm-interno'/.test(ficha), 'o comentário interno usa a classe com prefixo');
ok(!/[^-]'interno'/.test(ficha), 'e não a versão sem prefixo, que a folha não conhece');
ok(/'dm-marco'/.test(ficha), 'o marco do histórico usa a classe com prefixo');
ok(!/[^-]'marco'/.test(ficha), 'e não a versão sem prefixo');
ok(naFolha.has('dm-interno') && naFolha.has('dm-marco'), 'e as duas existem na folha');

/* 3) E A DIREÇÃO CONTRÁRIA: regra na folha que ninguém usa.

   `.dm-entrada` existia em `demandas.css` com seis declarações e nenhum JSX
   a escrevia. Não faz mal nenhum ao usuário — é peso de bytes e, pior, é
   armadilha de leitura: quem chega e vê a regra acredita que existe um
   componente "entrada" e vai procurá-lo.

   É uma lista de perdão, e não uma proibição, porque classe usada só via
   template (`dm-${x}`) não aparece na varredura acima e não pode reprovar
   por isso. Quando a lista crescer sem motivo, é sinal de que a folha está
   virando sótão. */
/* A LISTA DE PERDÃO, COM O LUGAR DE CADA UMA.

   Classe montada por concatenação (`'dm-' + tom`) não aparece em varredura
   estática nenhuma, e reprovar por isso seria reprovar código correto. Cada
   entrada aqui aponta ONDE ela nasce, para a próxima pessoa poder conferir em
   vez de acreditar. */
const PERDOADAS = new Set([
  /* `'dm-' + tomPill(status)` — app/demandas/page.tsx:167,
     app/demandas/d/[numero]/page.tsx:87 e components/demandas/Ui.tsx:19.
     Os valores possíveis estão em lib/demandas/regras.ts:52. */
  'dm-ok', 'dm-warn', 'dm-bad',
  /* `dm-pill dm-${tom}` em components/demandas/Ui.tsx, com `tom` vindo de
     quem chama: 'info' é usado na ficha da demanda. */
  'dm-info',
  /* `dm-item dm-${situacao}` e `dm-num ${destaque ? 'dm-destaque' : ''}` */
  'dm-atrasada', 'dm-urgente', 'dm-hoje', 'dm-aviso', 'dm-ruim', 'dm-destaque',
  /* escritas à mão no JSX e conferidas pelo bloco 2, logo acima */
  'dm-interno', 'dm-marco',
  /* utilitária de cor, usada via composição em outras regras da própria
     folha (`.dm-x .dm-dim`), não pelo JSX */
  'dm-dim',
]);
const usadasNoJsx = new Set();
for (const a of arquivos) {
  const txt = readFileSync(a, 'utf8');
  for (const m of txt.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{[^}]*?'([^']*)'[^}]*?\})/g)) {
    const bruto = `${m[1] || ''} ${m[2] || ''} ${m[3] || ''}`;
    for (const c of bruto.split(/[\s${}?:()|&]+/)) if (/^dm-[a-z0-9-]+$/.test(c)) usadasNoJsx.add(c);
  }
}
const sobrando = [...naFolha].filter(c => !usadasNoJsx.has(c) && !PERDOADAS.has(c)).sort();
ok(sobrando.length === 0, 'nenhuma regra dm- na folha sem ninguém que a escreva',
   sobrando.join(', '));

if (falhas) { console.log(`classe-que-a-folha-conhece: ${falhas} falha(s) em ${feitas}`); process.exit(1); }
console.log(`classe-que-a-folha-conhece: ${feitas}/${feitas} ok`);
