/* A TAG DO LEMBRETE, POR VÍNCULO E DATA · 26/10/2026

   O aparelho usa a tag do aviso para saber qual substitui qual: um aviso
   novo com a mesma tag apaga o anterior da bandeja (public/sw.js repassa a
   tag). Quem serve em dois ministérios e ligou o aviso nos dois links, no
   mesmo celular, tem dois vínculos com o mesmo aparelho.

   O que este arquivo exige, só com linhas fictícias de `avisos_para_lembrar`
   e sem rota, cron, banco nem serviço de aviso:
     1. dois vínculos, mesmo aparelho e mesma data: tags diferentes. O preparo
        antigo, que a rota usava (`mensagemDoLembrete`), dá a mesma tag aos
        dois, e isso é conferido aqui como controle;
     2. o lembrete de 3 dias e o de 1 dia do mesmo vínculo e data: a mesma tag;
     3. datas diferentes, tags diferentes; a mesma entrada, o mesmo resultado;
     4. aparelho, funções, confirmação, evento e horário não mudam a tag;
     5. a tag não leva o token, nem o token codificado;
     6. só a tag muda: título, texto e endereço são os de antes;
     7. a criptografia não chega ao navegador: lib/aviso.ts carrega com
        `node:crypto` bloqueado, e nenhum arquivo 'use client' alcança o
        módulo da tag.

   Roda com: node --import ./scripts/_ts.mjs scripts/tag-do-lembrete.test.mjs */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { mensagemDoLembrete } from '@/lib/aviso';
import { lembreteParaMandar, tagDoLembrete } from '@/lib/tag-do-lembrete';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };
const eq = (a, b, rot) => ok(a === b, rot, `disse ${JSON.stringify(a)}, esperava ${JSON.stringify(b)}`);

const base = 'https://guiaservir.com';
const prep = l => lembreteParaMandar(l, base, '10h', '19h');
const antigo = l => mensagemDoLembrete(l, base, '10h', '19h');
/* uma linha como a função do banco devolve: o aparelho e o lembrete */
const aparelho = { endpoint: 'https://fcm.googleapis.com/fcm/send/aparelho-ficticio-1', p256dh: 'B' + 'x'.repeat(86), auth: 'a'.repeat(22) };
const linha = (token, data, mais = {}) => ({ ...aparelho, token, tipo: 'd3', data, evento: null, inicio: null, funcoes: 'PROJEÇÃO', pendente: true, ...mais });
const MIDIA = 'aaaaaaaaaaaaaaaa01', LOUVOR = 'bbbbbbbbbbbbbbbb02', DOM = '2026-11-08';

/* 1 · dois vínculos no mesmo aparelho e na mesma data */
{
  const a = linha(MIDIA, DOM), b = linha(LOUVOR, DOM, { funcoes: 'VOZ', pendente: false });
  ok(a.endpoint === b.endpoint && a.data === b.data && a.token !== b.token, 'fixture: mesmo aparelho e data, tokens distintos');
  eq(antigo(a).tag, antigo(b).tag, 'controle: o preparo antigo dá a mesma tag aos dois vínculos');
  ok(prep(a).tag !== prep(b).tag, 'dois vínculos na mesma data: tags diferentes', `${prep(a).tag} · ${prep(b).tag}`);
}

/* 2 · o de 3 dias e o de 1 dia do mesmo vínculo e data */
for (const pendente of [true, false]) {
  eq(prep(linha(MIDIA, DOM, { tipo: 'd1', pendente })).tag, prep(linha(MIDIA, DOM, { pendente })).tag,
    `d3 e d1 do mesmo vínculo e data: a mesma tag (pendente ${pendente})`);
}

/* 3 · datas diferentes; a mesma entrada */
{
  const datas = ['2026-11-07', DOM, '2026-11-09', '2026-12-08', '2027-11-08'];
  const tags = datas.map(d => prep(linha(MIDIA, d)).tag);
  eq(new Set(tags).size, datas.length, 'datas diferentes: tags diferentes');
  for (const [i, d] of datas.entries()) ok(tags[i].startsWith(`lembrete-${d}`), `a tag continua começando por lembrete-${d}`, tags[i]);
  eq(prep(linha(MIDIA, DOM)).tag, prep(structuredClone(linha(MIDIA, DOM))).tag, 'a mesma entrada, de novo: a mesma tag');
  eq(tagDoLembrete(MIDIA, DOM), tagDoLembrete(MIDIA, DOM), 'tagDoLembrete é determinística');
  eq(tagDoLembrete(MIDIA, DOM), prep(linha(MIDIA, DOM)).tag, 'a mensagem usa tagDoLembrete');
}

/* 4 · o que não é vínculo nem data não mexe na tag */
{
  const t = prep(linha(MIDIA, DOM)).tag;
  for (const [rot, mais] of [
    ['outro aparelho', { endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/outro-aparelho', p256dh: 'C' + 'y'.repeat(86), auth: 'b'.repeat(22) }],
    ['outra função', { funcoes: 'FOTO · FILMAGEM' }],
    ['já confirmado', { pendente: false }],
    ['com evento e horário', { evento: 'Ensaio Geral', inicio: '19:30:00' }],
    ['o de 1 dia', { tipo: 'd1' }],
  ]) eq(prep(linha(MIDIA, DOM, mais)).tag, t, `${rot}: a mesma tag`);
}

/* 5 · nem o token, nem o token codificado */
const codificacoes = tk => {
  const bytes = Buffer.from(tk, 'utf8');
  return [tk, tk.toUpperCase(), [...tk].reverse().join(''), encodeURIComponent(tk), bytes.toString('hex'),
    bytes.toString('base64'), bytes.toString('base64url'), bytes.toString('base64').replace(/=+$/, '')];
};
for (const tk of [MIDIA, LOUVOR, '9f3c41d07be26a5c88', 'token-de-teste_Com.Outros~Caracteres']) {
  const tag = prep(linha(tk, DOM)).tag;
  const pedacos = codificacoes(tk).flatMap(c => Array.from({ length: Math.max(0, c.length - 7) }, (_, i) => c.slice(i, i + 8)));
  const achado = pedacos.find(p => tag.toLowerCase().includes(p.toLowerCase()));
  ok(!achado, `a tag não contém o token ${tk.slice(0, 6)}… nem codificação dele (8+ caracteres)`, `${tag} contém ${achado}`);
  ok(/^lembrete-\d{4}-\d{2}-\d{2}-[0-9a-f]{16}$/.test(tag), `a tag é a data e uma impressão de 16 dígitos (${tk.slice(0, 6)}…)`, tag);
}

/* 6 · só a tag muda */
for (const data of [DOM, '2026-11-07', '2026-11-11'])
  for (const tipo of ['d3', 'd1'])
    for (const pendente of [true, false])
      for (const ev of [{}, { evento: 'Ensaio Geral', inicio: '19:30:00' }]) {
        const l = linha(MIDIA, data, { tipo, pendente, ...ev });
        const n = prep(l), v = antigo(l);
        const rot = `${data} ${tipo}${pendente ? ' pendente' : ''}${ev.evento ? ' com evento' : ''}`;
        ok(n.titulo === v.titulo && n.corpo === v.corpo && n.url === v.url
          && Object.keys(n).sort().join() === Object.keys(v).sort().join(), `${rot}: título, texto e endereço iguais`,
          JSON.stringify({ n, v }));
        ok(n.tag !== v.tag && v.tag === `lembrete-${data}`, `${rot}: só a tag mudou`, `${v.tag} → ${n.tag}`);
      }

/* 7 · a criptografia não chega ao navegador */
{
  /* executado: lib/aviso.ts carrega com node:crypto bloqueado; o módulo da
     tag não carrega (prova de que o bloqueio funciona) */
  const bloqueio = 'data:text/javascript,' + encodeURIComponent(
    `import { register } from 'node:module';
     register('data:text/javascript,' + encodeURIComponent(
       "export async function resolve(s, c, n) { if (s === 'node:crypto' || s === 'crypto') throw new Error('crypto bloqueado'); return n(s, c); }"));`);
  const carregar = m => spawnSync(process.execPath, ['--import', './scripts/_ts.mjs', '--import', bloqueio,
    '--input-type=module', '-e', `await import('${m}')`], { encoding: 'utf8' });
  const aviso = carregar('@/lib/aviso');
  ok(aviso.status === 0, 'lib/aviso.ts carrega sem node:crypto', aviso.stderr.slice(-300));
  const tag = carregar('@/lib/tag-do-lembrete');
  ok(tag.status !== 0 && /crypto bloqueado/.test(tag.stderr), 'controle: o módulo da tag não carrega sem node:crypto', `saída ${tag.status}`);

  /* o grafo de importação de cada arquivo 'use client' */
  const RAIZ = process.cwd();
  const varrer = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory()
    ? (['node_modules', '.next', '.git'].includes(e.name) ? [] : varrer(join(d, e.name)))
    : /\.(ts|tsx|js|jsx|mjs)$/.test(e.name) ? [join(d, e.name)] : []);
  const achar = p => [p, `${p}.ts`, `${p}.tsx`, `${p}.js`, `${p}.jsx`, join(p, 'index.ts'), join(p, 'index.tsx')]
    .find(x => existsSync(x) && statSync(x).isFile());
  const importacoes = f => [...readFileSync(f, 'utf8').matchAll(
    /(?:import|export)\s[^'"]*?\sfrom\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)/g)]
    .map(m => m[1] || m[2] || m[3] || m[4]);
  const clientes = ['app', 'components', 'lib'].flatMap(d => varrer(join(RAIZ, d)))
    .filter(f => /^(?:\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*))*\s*['"]use client['"]/.test(readFileSync(f, 'utf8')));
  const vistos = new Set(clientes), fila = [...clientes], pacotes = new Set();
  while (fila.length) {
    const f = fila.pop();
    for (const s of importacoes(f)) {
      const alvo = s.startsWith('@/') ? achar(join(RAIZ, s.slice(2))) : s.startsWith('.') ? achar(resolve(dirname(f), s)) : (pacotes.add(s), null);
      if (alvo && !vistos.has(alvo)) { vistos.add(alvo); fila.push(alvo); }
    }
  }
  ok(clientes.length > 50, `achou os arquivos 'use client' (${clientes.length})`);
  ok(vistos.has(join(RAIZ, 'app/(sistema)/eu/[token]/page.tsx')) && vistos.has(join(RAIZ, 'lib/trocas.ts')),
    'controle: o grafo alcança a página pessoal e lib/trocas.ts');
  ok(!vistos.has(join(RAIZ, 'lib/tag-do-lembrete.ts')), 'nenhum arquivo de cliente alcança lib/tag-do-lembrete.ts');
  ok(!pacotes.has('node:crypto') && !pacotes.has('crypto'), 'nenhum arquivo de cliente importa crypto');
}

if (falhas) { console.log(`tag-do-lembrete: ${falhas} falha(s) em ${feitas}`); process.exit(1); }
console.log(`tag-do-lembrete: ${feitas}/${feitas} ok`);
