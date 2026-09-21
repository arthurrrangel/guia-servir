/* =============================================================================
   OS TIPOS DAS LINHAS CONTRA O CATÁLOGO DO BANCO

   20/09/2026. `lib/ponte.ts` declarava `any[]` em todos os nove campos de
   `LinhasDoBanco`: entre o `select` e o `montarEstado` não havia tipo nenhum,
   e trocar `f.simultanea` por `f.simultânea` compilava e quebrava a escala em
   produção. Os tipos existem agora, escritos a partir do catálogo de um banco
   reconstruído do repositório.

   Tipo escrito à mão a partir do catálogo é verdade no dia em que foi escrito.
   Este arquivo é o que o mantém verdade: ele lê os tipos do próprio
   `lib/ponte.ts` e pergunta ao Postgres se cada coluna existe e se a
   nulabilidade bate.

   A REGRA DA NULABILIDADE, e por que ela é assimétrica:

     coluna NOT NULL no banco  -> o tipo NÃO pode dizer `| null`
        (prometer nulo que nunca chega obriga a tratar um caso impossível, e
         `v.telefone ?? ''` espalhado por onde não precisa vira ruído que
         esconde os lugares onde precisa)

     coluna NULLABLE no banco  -> o tipo TEM que dizer `| null`, a não ser que
        o campo seja `?`
        (campo opcional já obriga o consumidor a tratar ausência, que é a
         mesma obrigação; foi assim que `limite_mes` deixou de mentir)

   Precisa de um banco de pé. Roda dentro de `scripts/escala-banco.sh`, que já
   tem um; sozinho, aponte PGHOST/PGPORT/PGUSER/PGDATABASE para um banco
   construído pelo repositório.

     node scripts/tipos-contra-o-catalogo.mjs
   ============================================================================= */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('   ✗', rot, extra); } };

const PSQL = process.env.PSQL || 'psql';
const args = [
  '-h', process.env.PGHOST || '/tmp',
  '-p', process.env.PGPORT || '5439',
  '-U', process.env.PGUSER || 'postgres',
  '-d', process.env.PGDATABASE || 'guia',
  '-tAF', '|', '-c',
];
const perguntar = (sql) => {
  try { return execFileSync(PSQL, [...args, sql], { encoding: 'utf8' }).trim(); }
  catch (e) { return `__ERRO__ ${String(e.message || e).slice(0, 200)}`; }
};

const vivo = perguntar('select 1');
if (vivo.startsWith('__ERRO__') || vivo !== '1') {
  console.log('   PULEI a conferência de tipos: não achei um banco de pé.');
  console.log('   ', vivo.slice(0, 160));
  process.exit(0);
}

/* de qual tabela cada tipo fala. É o de-para que não dá para inferir: o nome
   do tipo é do lado do TypeScript e o da tabela é do lado do banco. */
const DE_PARA = {
  LinhaFuncao: 'funcoes',
  LinhaVoluntario: 'voluntarios',
  LinhaHabilidade: 'habilidades',
  LinhaIndisponibilidade: 'indisponibilidades',
  LinhaDisponibilidade: 'disponibilidade',
  LinhaCulto: 'cultos',
  LinhaEscalacao: 'escalacoes',
  LinhaPlantao: 'plantoes',
  LinhaRecado: 'culto_obs',
  LinhaConfig: 'config',
};

const fonte = readFileSync('lib/ponte.ts', 'utf8');

/* o catálogo inteiro numa consulta só */
const catalogo = new Map();   // tabela -> Map(coluna -> nulavel)
{
  const linhas = perguntar(`
    select table_name, column_name, is_nullable
      from information_schema.columns
     where table_schema = 'public'
       and table_name in (${Object.values(DE_PARA).map(t => `'${t}'`).join(',')})
     order by table_name, ordinal_position;`);
  for (const l of linhas.split('\n')) {
    const [t, c, n] = l.split('|');
    if (!t || !c) continue;
    if (!catalogo.has(t)) catalogo.set(t, new Map());
    catalogo.get(t).set(c, n === 'YES');
  }
}

for (const [tipo, tabela] of Object.entries(DE_PARA)) {
  const cols = catalogo.get(tabela);
  ok(cols && cols.size > 0, `a tabela ${tabela} existe no banco`);
  if (!cols) continue;

  /* o corpo do tipo, do `= {` até o PRIMEIRO `};`. Não `\n};`: os tipos de uma
     linha só (LinhaPlantao, LinhaIndisponibilidade) fecham na mesma linha, e
     com `\n};` a leitura atravessava para dentro do tipo seguinte — foi o que
     fez este arquivo acusar `plantoes.problemas` na primeira execução. */
  const m = new RegExp(`export type ${tipo} = \\{([\\s\\S]*?)\\};`).exec(fonte);
  ok(!!m, `achei o tipo ${tipo} em lib/ponte.ts`);
  if (!m) continue;

  /* tira comentários de bloco e de linha antes de ler os campos */
  const corpo = m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const campos = [...corpo.matchAll(/([a-z_][a-z0-9_]*)(\??)\s*:\s*([^;]+);/gi)]
    .map(x => ({ nome: x[1], opcional: x[2] === '?', tipo: x[3].trim() }));

  ok(campos.length > 0, `o tipo ${tipo} tem campos legíveis`, corpo.slice(0, 80));

  for (const f of campos) {
    const temNoBanco = cols.has(f.nome);
    ok(temNoBanco, `${tabela}.${f.nome} existe no banco (declarado em ${tipo})`,
       temNoBanco ? '' : `colunas reais: ${[...cols.keys()].join(', ')}`);
    if (!temNoBanco) continue;

    const nulavelNoBanco = cols.get(f.nome);
    const dizNulo = /\|\s*null\b/.test(f.tipo) || f.opcional;
    if (nulavelNoBanco) {
      ok(dizNulo, `${tabela}.${f.nome} é NULLABLE no banco e o tipo tem que admitir isso`,
         `o tipo diz \`${f.tipo}\` sem \`| null\` e sem \`?\``);
    } else {
      ok(!/\|\s*null\b/.test(f.tipo),
         `${tabela}.${f.nome} é NOT NULL no banco e o tipo não deve prometer nulo`,
         `o tipo diz \`${f.tipo}\``);
    }
  }
}

/* E O OUTRO LADO: toda coluna que a carga PEDE tem que estar declarada.
   Sem isto, tirar um campo do tipo e continuar lendo a coluna passaria — o
   erro apareceria só onde alguém tentasse usá-la. */
for (const [lista, tipo, tabela] of [
  ['COLUNAS_ESSENCIAIS', 'LinhaVoluntario', 'voluntarios'],
  ['FUNCOES_ESSENCIAIS', 'LinhaFuncao', 'funcoes'],
]) {
  const m = new RegExp(`const ${lista} =\\s*\\n?\\s*'([^']+)'`).exec(fonte);
  ok(!!m, `achei ${lista} em lib/ponte.ts`);
  if (!m) continue;
  const tm = new RegExp(`export type ${tipo} = \\{([\\s\\S]*?)\\};`).exec(fonte);
  const decl = new Set([...(tm ? tm[1] : '')
    .replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([a-z_][a-z0-9_]*)\??\s*:/gi)].map(x => x[1]));
  for (const c of m[1].split(',').map(x => x.trim()).filter(Boolean)) {
    ok(decl.has(c), `${tabela}.${c} é pedido por ${lista} e tem que estar em ${tipo}`,
       `declarados: ${[...decl].join(', ')}`);
  }
}

if (falhas) { console.log(`   ✗ tipos-contra-o-catalogo: ${falhas} problema(s) em ${feitas}`); process.exit(1); }
console.log(`   ✓ tipos-contra-o-catalogo: ${feitas}/${feitas}`);
