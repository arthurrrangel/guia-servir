/* =============================================================================
   A URL TEM TETO, E O SEGUNDO `.in()` NÃO ESTAVA NA CONTA

   20/09/2026. Auditoria de performance.

   `emLotes` quebrava o PRIMEIRO `.in()` em blocos de 100 justamente para a URL
   não estourar. O comentário que dimensionou esse 100 diz que "sobra espaço
   para o segundo `.in('culto_id', ...)`". Medido, não sobra: o segundo ia
   INTEIRO dentro de cada lote do primeiro.

   Cada UUID custa 39 bytes na URL (36 do id + 3 da vírgula codificada, `%2C`).
   O teto do nginx na frente do PostgREST é 8192.

       100 voluntarios ...... 3.916 B
       106 cultos ........... 4.146 B   <- a janela de hoje
       + base ............... 8.137 B = 99,3% do teto

   E `culto_obs` não passava por lote nenhum: a lista de cultos ia crua, e era
   a consulta que estourava primeiro.

   O termo que cresce sozinho é o dos CULTOS, não o das pessoas: a janela é
   `hoje - 200 dias` sem teto superior, então ela engorda um culto por semana
   sem ninguém mexer em nada. Quem espera o defeito aparecer "quando a igreja
   crescer" espera a coisa errada.

   Este arquivo mede o comprimento das URLs que a carga de verdade monta,
   fingindo um banco que só registra o que foi pedido. Se alguém voltar a
   mandar lista crescente na URL, o número sobe e o teste reprova.
   ============================================================================= */
import { linhasDaEquipe, emLotes2 } from '@/lib/ponte';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

const TETO = 8192;                 // o limite do nginx na frente do PostgREST
const BASE = 120;                  // host + caminho + select, arredondado para cima

/* Um cliente falso que MONTA a URL como o PostgREST faria e a guarda.
   Não é o supabase-js: é a mesma aritmética, que é o que este teste mede. */
function fingeBanco({ vols, funcoes, cultos }) {
  const urls = [];
  const uuid = (p, i) => `${p}${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`;
  const dados = {
    funcoes: Array.from({ length: funcoes }, (_, i) => ({ id: uuid('f', i), nome: 'POSTO ' + i, equipe_id: 'e1', ativa: true, ordem: i })),
    voluntarios: Array.from({ length: vols }, (_, i) => ({ id: uuid('v', i), nome: 'P' + i, ativo: true, equipe_id: 'e1' })),
    cultos: Array.from({ length: cultos }, (_, i) => ({ id: uuid('c', i), data: '2026-01-' + String((i % 28) + 1).padStart(2, '0') })),
  };
  const tabela = (nome) => {
    let pediuCount = false;
    const partes = [];
    const eu = {
      select(_c, o) { pediuCount = o?.count === 'exact'; return eu; },
      eq(col, v) { partes.push(`${col}=eq.${v}`); return eu; },
      gte(col, v) { partes.push(`${col}=gte.${v}`); return eu; },
      or(q) { partes.push(`or=(${encodeURIComponent(q)})`); return eu; },
      order() { return eu; },
      in(col, ids) {
        /* é assim que o PostgREST recebe: `col=in.(a,b,c)`, com as vírgulas
           codificadas. Três bytes por vírgula, e são eles que somam. */
        partes.push(`${col}=in.(${ids.join('%2C')})`);
        return eu;
      },
      maybeSingle() { urls.push(montar()); return { data: null, error: null }; },
      then(res) { urls.push(montar()); return Promise.resolve(resposta()).then(res); },
    };
    const montar = () => `https://xxxxxxxxxxxxxxxxxxxx.supabase.co/rest/v1/${nome}?select=*&` + partes.join('&');
    const resposta = () => {
      const d = dados[nome] || [];
      return { data: d, error: null, ...(pediuCount ? { count: d.length } : {}) };
    };
    return eu;
  };
  return { cliente: { from: tabela }, urls };
}

async function medir(cfg) {
  const { cliente, urls } = fingeBanco(cfg);
  await linhasDaEquipe(cliente, 'e1', '2026-01-01');
  const maior = urls.reduce((a, u) => Math.max(a, u.length), 0);
  const pior = urls.find(u => u.length === maior) || '';
  return { maior: maior + BASE, qtd: urls.length, tabela: (pior.match(/v1\/(\w+)\?/) || [])[1] };
}

console.log('\n1. A janela de hoje, e os tamanhos que a igreja pode ter');
for (const cfg of [
  { vols: 13, funcoes: 9, cultos: 106, rot: 'Louvor hoje' },
  { vols: 17, funcoes: 20, cultos: 106, rot: 'o maior ministério hoje' },
  { vols: 74, funcoes: 43, cultos: 106, rot: 'a igreja inteira num time só' },
  { vols: 150, funcoes: 60, cultos: 106, rot: 'o dobro da igreja' },
]) {
  const m = await medir(cfg);
  ok(m.maior < TETO, `${cfg.rot}: a maior URL cabe no teto`, `${m.maior} B de ${TETO} (${m.tabela}, ${m.qtd} consultas)`);
  console.log(`  [medida] ${cfg.rot}: maior URL ${m.maior} B (${Math.round(m.maior / TETO * 100)}% do teto), ${m.qtd} consultas`);
}

console.log('\n2. A JANELA CRESCENDO, que é o termo que ninguém controla');
/* 106 cultos é hoje. 400 é a mesma igreja daqui a alguns anos, sem ninguém
   mexer em nada. Antes desta correção, 108 já estourava. */
for (const cultos of [106, 200, 400, 1000]) {
  const m = await medir({ vols: 74, funcoes: 43, cultos });
  ok(m.maior < TETO, `${cultos} cultos na janela: a URL ainda cabe`,
     `${m.maior} B de ${TETO} (${m.tabela})`);
  console.log(`  [medida] ${cultos} cultos: maior URL ${m.maior} B, ${m.qtd} consultas`);
}

console.log('\n3. `emLotes2` não perde nem duplica linha');
{
  const vistos = [];
  const r = await emLotes2(
    Array.from({ length: 250 }, (_, i) => 'a' + i),
    Array.from({ length: 130 }, (_, i) => 'c' + i),
    (ids, cs) => {
      vistos.push([ids.length, cs.length]);
      /* cada par devolve uma linha por combinação, para a soma ser conferível */
      return Promise.resolve({
        data: ids.flatMap(a => cs.map(c => ({ a, c }))),
        count: ids.length * cs.length,
      });
    },
  );
  ok(r.data.length === 250 * 130, 'toda combinação volta, exatamente uma vez', String(r.data.length));
  ok(new Set(r.data.map(x => x.a + '|' + x.c)).size === 250 * 130, 'e nenhuma repetida');
  ok(r.count === 250 * 130, 'a contagem soma os lotes', String(r.count));
  ok(vistos.length === 3 * 3, 'dividiu em 3x3 lotes', JSON.stringify(vistos.length));
  ok(vistos.every(([a, c]) => a <= 100 && c <= 60), 'e nenhum lote passou do tamanho', JSON.stringify(vistos));
}
{
  /* o caminho curto: cabendo num lote só, nada de Promise.all nem flatMap */
  let chamadas = 0;
  const r = await emLotes2(['a'], ['c'], () => { chamadas++; return Promise.resolve({ data: [{ a: 'a' }], count: 1 }); });
  ok(chamadas === 1 && r.data.length === 1, 'lote único faz uma chamada só');
}
{
  const vazio1 = await emLotes2([], ['c'], () => { throw new Error('não devia chamar'); });
  const vazio2 = await emLotes2(['a'], [], () => { throw new Error('não devia chamar'); });
  ok(vazio1.data.length === 0 && vazio2.data.length === 0, 'lista vazia não vira consulta');
}
{
  /* erro de UM lote derruba o conjunto: meio resultado é pior que nenhum, e
     é a mesma regra que `emLotes` já seguia */
  let n = 0;
  const r = await emLotes2(
    Array.from({ length: 150 }, (_, i) => 'a' + i),
    Array.from({ length: 70 }, (_, i) => 'c' + i),
    () => Promise.resolve(++n === 3 ? { data: null, error: { code: '42501' } } : { data: [], count: 0 }),
  );
  ok(r.error?.code === '42501', 'um lote com erro derruba o conjunto', JSON.stringify(r.error));
}

console.log('\n4. E a carga continua trazendo o que tem que trazer');
{
  /* o lote em duas dimensões não pode mudar o RESULTADO, só a forma de pedir */
  const { cliente } = fingeBanco({ vols: 3, funcoes: 2, cultos: 5 });
  const r = await linhasDaEquipe(cliente, 'e1', '2026-01-01');
  ok((r.funcoes || []).length === 2, 'funções chegam', String((r.funcoes || []).length));
  ok((r.voluntarios || []).length === 3, 'voluntários chegam', String((r.voluntarios || []).length));
  ok((r.cultos || []).length === 5, 'cultos chegam', String((r.cultos || []).length));
}

if (falhas) { console.log(`\nurl-no-teto: ${falhas} falha(s) em ${feitas}\n`); process.exit(1); }
console.log(`\nurl-no-teto: ${feitas}/${feitas} ok\n`);
