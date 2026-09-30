/* A TRAVA DA FOLHA DAS ESCALAS · 30/09/2026.

   As telas de quem monta a escala ganharam uma folha própria
   (`components/escalas/*.css`), na mesma língua do Demandas. Ela divide a
   página com `app/globals.css`, que veste o site público e o espaço do
   voluntário, e o Next junta tudo numa folha só. Uma regra solta de um lado
   manda no outro sem ninguém ver: foi assim que o Demandas perdeu o diálogo
   de confirmação para os resets desta casa, e que o `.lid-faixa` de uma tela
   pública mandou numa tela do gestor.

   O que este arquivo exige, sem exceção:

     1. toda classe da folha começa com `es-` (ou é a raiz `.es`);
     2. todo seletor carrega uma classe `es` (nenhum elemento solto manda);
     3. toda variável definida começa com `--es-`, e nenhuma nasce em :root;
     4. todo `var(--x)` sem reserva tem o seu `--x:` nestas folhas;
     5. toda classe `es-` escrita no código existe na folha;
     6. e a direção contrária: classe da folha que ninguém escreve é regra
        morta, e regra morta confunde quem vem depois.

   Roda com `npm test`. */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra ? `\n    ${extra}` : ''); } };

/* ------------------------------------------------------------ as folhas */
const pastaFolhas = join(raiz, 'components/escalas');
const folhas = readdirSync(pastaFolhas).filter(n => n.endsWith('.css')).map(n => join('components/escalas', n));
ok(folhas.includes('components/escalas/escalas.css'), 'a folha base existe', folhas.join(', '));

/* comentário não é folha, e o miolo de url(...) também não: o SVG embutido
   tem "www.w3.org", que um leitor ingênuo tomaria pela classe `.w3` */
const limpar = (css) => css
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/url\((?:"[^"]*"|'[^']*'|[^)]*)\)/g, 'url()');

/* vírgula de primeiro nível: `:where(h1,h2)` é UM seletor, e partir na
   vírgula de dentro do parêntese inventava os seletores soltos "h2" e "h3" */
const partes = (sel) => {
  const out = []; let nivel = 0, atual = '';
  for (const ch of sel) {
    if (ch === '(') nivel++;
    if (ch === ')') nivel--;
    if (ch === ',' && nivel === 0) { out.push(atual.trim()); atual = ''; } else atual += ch;
  }
  if (atual.trim()) out.push(atual.trim());
  return out;
};

const classesDaFolha = new Set();
const classesDasTelas = new Set();
const definidos = new Set();
const usosSemReserva = [];
for (const f of folhas) {
  const css = limpar(readFileSync(join(raiz, f), 'utf8'));

  /* 1) classes da folha */
  const classes = [...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(m => m[1]);
  const semPrefixo = [...new Set(classes.filter(c => c !== 'es' && !c.startsWith('es-')))];
  ok(semPrefixo.length === 0, `${f}: toda classe começa com es-`, semPrefixo.join(', '));
  classes.filter(c => c.startsWith('es-')).forEach(c => { classesDaFolha.add(c); if (!f.endsWith('/escalas.css')) classesDasTelas.add(c); });

  /* 2) todo seletor carrega uma classe es. Os blocos de @media e @keyframes
     são abertos e o que conta é o seletor de cada regra. */
  const semKeyframes = css.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, ' ');
  const seletores = [...semKeyframes.matchAll(/([^{};@]+)\{[^{}]*\}/g)].map(m => m[1].trim()).filter(Boolean);
  const soltos = [];
  for (const sel of seletores) {
    for (const parte of partes(sel)) {
      if (!/\.es(?![\w])|\.es-/.test(parte)) soltos.push(parte);
    }
  }
  ok(soltos.length === 0, `${f}: todo seletor carrega uma classe es`, soltos.slice(0, 8).join(' | '));

  /* 3) variáveis */
  ok(!/:root/.test(css), `${f}: nenhuma variável nasce em :root`);
  for (const m of css.matchAll(/(?:^|[;{\s])(--[A-Za-z0-9_-]+)\s*:/g)) definidos.add(m[1]);
  for (const m of css.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g)) usosSemReserva.push([f, m[1]]);
}
const foraDoPrefixo = [...definidos].filter(v => !v.startsWith('--es-'));
ok(foraDoPrefixo.length === 0, 'toda variável definida começa com --es-', foraDoPrefixo.join(', '));

/* 4) nenhum token órfão. `--es-cols` e `--es-n` nascem no style={} de quem
   usa a peça: são os dois que o código define, e eles contam como definidos */
const doCodigo = new Set(['--es-cols', '--es-n']);
const orfaos = [...new Set(usosSemReserva.filter(([, v]) => !definidos.has(v) && !doCodigo.has(v)).map(([f, v]) => `${f}: ${v}`))];
ok(orfaos.length === 0, 'todo var(--x) sem reserva tem o seu --x: nestas folhas', orfaos.join(', '));

/* ------------------------------------------------------------ o código */
const arquivos = [];
const anda = (d) => {
  if (!existsSync(join(raiz, d))) return;
  const st = statSync(join(raiz, d));
  if (st.isFile()) { arquivos.push(d); return; }
  for (const n of readdirSync(join(raiz, d))) {
    const p = join(d, n);
    if (statSync(join(raiz, p)).isDirectory()) anda(p);
    else if (/\.tsx?$/.test(n)) arquivos.push(p);
  }
};
['app/painel', 'app/escala', 'app/time', 'app/ajustes', 'app/entrar', 'components/Shell.tsx',
 'components/escalas', 'lib/confirmar.ts'].forEach(anda);
ok(arquivos.length >= 10, 'os arquivos das telas do líder foram achados', String(arquivos.length));

/* uma classe `es-` no código é qualquer `es-xxx` que não seja o fim de uma
   variável (`--es-cols`) nem parte de outra palavra */
const noCodigo = new Map();
for (const a of arquivos) {
  const txt = readFileSync(join(raiz, a), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  /* o `-` depois também barra: `es-c-n${x}` e `es-como-${forma}` são
     classes montadas, e sem isso o leitor pegava os pedaços "es-c" e
     "es-como" como se fossem classes escritas */
  for (const m of txt.matchAll(/(?<![-\w$])es-[a-z0-9]+(?:-[a-z0-9]+)*(?![\w$-])/g)) {
    if (!noCodigo.has(m[0])) noCodigo.set(m[0], a);
  }
}

/* 5) toda classe escrita existe na folha. Os tons (`es-ok`...) vêm de
   `tomCls()`, que monta `es-${tom}`: eles existem na folha e são checados
   pela direção contrária. */
const faltando = [...noCodigo.entries()].filter(([c]) => !classesDaFolha.has(c)).map(([c, a]) => `${a}: ${c}`);
ok(faltando.length === 0, 'toda classe es- do código existe na folha', faltando.join(', '));

/* 6) regra morta: classe da folha que nenhum arquivo escreve. Os quatro
   tons e os modificadores montados por template entram pela lista. */
const montadasPorTemplate = new Set(['es-ok', 'es-warn', 'es-bad', 'es-info', 'es-zero', 'es-destaque', 'es-texto',
  'es-como-pill', 'es-como-campo', 'es-vazia', 'es-off']);
/* Nas folhas de TELA a regra morta reprova. Na base (`escalas.css`) ela é a
   biblioteca da casa, e peça ainda sem tela que a use sai como lembrete, não
   como falha: o interruptor existe antes da primeira tela que precisa dele. */
const mortas = [...classesDaFolha].filter(c => !noCodigo.has(c) && !montadasPorTemplate.has(c));
const mortasDeTela = mortas.filter(c => classesDasTelas.has(c));
ok(mortasDeTela.length === 0, 'toda classe das folhas de tela é escrita por alguém', mortasDeTela.join(', '));
const naBase = mortas.filter(c => !classesDasTelas.has(c));
if (naBase.length && process.env.ESCALAS_CSS_VERBOSO) console.log('  lembrete, peças da base sem uso ainda:', naBase.join(', '));

/* ------------------------------------------- 7) o detector pega de verdade */
{
  const plantado = limpar('.es-x{color:red} button{color:blue} .dm-y{} :root{--z:1}');
  const cls = [...plantado.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(m => m[1]).filter(c => c !== 'es' && !c.startsWith('es-'));
  ok(cls.includes('dm-y'), 'o detector acusa uma classe sem prefixo plantada de propósito');
  const sels = [...plantado.matchAll(/([^{};@]+)\{[^{}]*\}/g)].map(m => m[1].trim());
  ok(sels.some(s => !/\.es(?![\w])|\.es-/.test(s) && s === 'button'), 'e um elemento solto plantado de propósito');
  ok(/:root/.test(plantado), 'e uma variável em :root plantada de propósito');
  const url = limpar(".es-z{background:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E\")}");
  ok(!/\.w3/.test(url), 'e o miolo de url() não vira classe');
}

console.log(falhas ? `\nescalas-css: ${falhas} falha(s) em ${feitas}` : `\nescalas-css: ${feitas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
