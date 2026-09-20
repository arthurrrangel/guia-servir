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
arquivos.push('components/demandas/Ui.tsx', 'components/demandas/Casca.tsx');

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

if (falhas) { console.log(`classe-que-a-folha-conhece: ${falhas} falha(s) em ${feitas}`); process.exit(1); }
console.log(`classe-que-a-folha-conhece: ${feitas}/${feitas} ok`);
