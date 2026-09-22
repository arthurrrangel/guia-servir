/* A CHAVE DO ARMÁRIO, EXECUTADA — E ELA TEM TRÊS DONOS.

   ===========================================================================
   O QUE ESTE ARQUIVO EXISTE PARA IMPEDIR

   `lib/demandas/api.ts` guarda o link pessoal do membro em `demandas.link`.
   O comentário dele diz por que a chave é essa e não outra:

     "separada de `escala.equipe` e `escala.credenciais` de propósito: um
      sistema não pode limpar o estado do outro nem por acidente."

   Medido em 22/09/2026: trocar `const K = 'demandas.link'` por
   `'escala.equipe'` deixava `npm test` inteiro VERDE. Com a troca,
   `guardarToken` passa a ESCREVER por cima da chave do sistema de escalas e
   `esquecerToken` passa a APAGÁ-LA — e `esquecerToken` é chamada sozinha,
   pela casca, toda vez que um link velho é recusado. Ou seja: quem entrasse
   em /demandas com um token vencido perdia a equipe selecionada no GUIA
   Servir, e nenhum dos dois sistemas teria como explicar o que aconteceu.

   O único caso que prometia cobrir isso (`demandas-telas.test.mjs`, "o
   armário de mentira") roda a tela NOVA, que nunca chama `guardarToken` — ela
   só grava o rascunho. Prometer e não cobrar é pior do que não prometer: dá a
   impressão de cobertura exatamente onde não há nenhuma.

   ===========================================================================
   POR QUE ELE EXECUTA, E NÃO CASA TEXTO

   `scripts/_ts.mjs` conta no cabeçalho o preço que este repositório já pagou
   por teste que lê código em vez de rodá-lo. Então aqui as funções de
   verdade escrevem num `localStorage` de mentira, e o que se lê é O QUE ELAS
   ESCREVERAM — a chave sai do armário, não do arquivo.

   A ÚNICA parte que olha o texto é a terceira: `components/demandas/Casca.tsx`
   repete a string `'demandas.link'` à mão em duas linhas (92 e 283), e a
   pergunta "as três estão de acordo?" é sobre grafia por construção. Mesmo
   ali o lado de referência é EXECUTADO: compara-se o literal da casca com a
   chave que `guardarToken` acabou de usar de verdade.

   Uso: node --import ./scripts/_ts.mjs scripts/demandas-armario.test.mjs
*/

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { esquecerToken, guardarToken, meuToken } from '../lib/demandas/api.ts';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (p) => readFileSync(join(raiz, p), 'utf8');

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => {
  feitas++;
  if (!c) { falhas++; console.log('  FALHOU:', rot, extra ? '\n           ' + extra : ''); }
};

/* ---------------------------------------------------- o armário de mentira

   O que o sistema de ESCALAS deixa guardado aqui está escrito com o valor que
   ele teria de verdade: se alguma função de demandas passar por cima, o que
   reprova não é a chave que sumiu, é o dado da outra pessoa que foi perdido. */
function armario(inicial = {}) {
  const m = new Map(Object.entries(inicial));
  return {
    mapa: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(String(k)); },
    clear: () => m.clear(),
  };
}

const DO_OUTRO_SISTEMA = {
  'escala.equipe': 'equipe-midia-central',
  'escala.credenciais': '{"url":"https://x.supabase.co","key":"anon"}',
};

function mundo(busca = '') {
  const arm = armario(DO_OUTRO_SISTEMA);
  globalThis.localStorage = arm;
  globalThis.window = {
    localStorage: arm,
    location: { href: 'http://x/demandas' + busca, search: busca, pathname: '/demandas', hash: '' },
    history: { replaceState() {} },
  };
  return arm;
}

/* =========================================================== 1. guardar */
let CHAVE = null;
{
  const arm = mundo();
  const antes = new Set(arm.mapa.keys());
  guardarToken('tk-da-pessoa-1234');

  const novas = [...arm.mapa.keys()].filter(k => !antes.has(k));
  ok(novas.length === 1, 'guardarToken escreve em UMA chave, e só uma',
    JSON.stringify([...arm.mapa.keys()]));
  CHAVE = novas[0];

  ok(CHAVE === 'demandas.link',
    'e a chave é `demandas.link`', `escreveu em ${JSON.stringify(CHAVE)}`);
  ok(String(CHAVE).startsWith('demandas.'),
    'ela mora no espaço de nomes das Demandas', String(CHAVE));
  ok(!String(CHAVE).startsWith('escala.'),
    'e não no do sistema de escalas', String(CHAVE));
  ok(arm.mapa.get(CHAVE) === 'tk-da-pessoa-1234',
    'o token guardado é o token', String(arm.mapa.get(CHAVE)));

  /* a parte que dói: o estado do outro sistema continua exatamente onde
     estava. Não basta a chave ser outra — tem que estar INTEIRO. */
  for (const [k, v] of Object.entries(DO_OUTRO_SISTEMA)) {
    ok(arm.mapa.get(k) === v, `guardarToken não encosta em \`${k}\``,
      `agora vale ${JSON.stringify(arm.mapa.get(k))}`);
  }
}

/* =========================================================== 2. esquecer */
{
  const arm = mundo();
  guardarToken('tk-que-vai-embora');
  ok(arm.mapa.get(CHAVE) === 'tk-que-vai-embora', 'o token entrou para poder sair');

  esquecerToken();
  ok(!arm.mapa.has(CHAVE), 'esquecerToken apaga a chave das Demandas',
    JSON.stringify([...arm.mapa.keys()]));
  /* ESTA É A LINHA QUE A SABOTAGEM MATA.

     `esquecerToken()` é chamada sozinha pela casca sempre que um link velho é
     recusado. Com a chave trocada, esse caminho automático apaga a equipe do
     GUIA Servir sem ninguém tocar em nada. */
  for (const [k, v] of Object.entries(DO_OUTRO_SISTEMA)) {
    ok(arm.mapa.get(k) === v, `e esquecerToken não apaga \`${k}\``,
      `agora vale ${JSON.stringify(arm.mapa.get(k))}`);
  }
  ok(arm.mapa.size === Object.keys(DO_OUTRO_SISTEMA).length,
    'o armário volta a ter só o que era do outro sistema', String(arm.mapa.size));
}

/* ====================================== 3. e `meuToken` lê a mesma chave

   Guardar numa e ler de outra seria o mesmo defeito pelo avesso: a pessoa
   entraria pelo link uma vez e seria deslogada na recarga seguinte. */
{
  const arm = mundo();
  guardarToken('tk-vai-e-volta');
  ok(meuToken() === 'tk-vai-e-volta', 'meuToken lê de volta o que guardarToken escreveu',
    String(meuToken()));
  esquecerToken();
  ok(meuToken() === null, 'e depois de esquecer não acha nada', String(meuToken()));

  /* e o caminho de entrada: o token chega pela URL, é GUARDADO na mesma
     chave, e sai da barra de endereço */
  const arm2 = mundo('?t=tk-do-whatsapp');
  ok(meuToken() === 'tk-do-whatsapp', 'o token da URL é devolvido na hora');
  ok(arm2.mapa.get(CHAVE) === 'tk-do-whatsapp',
    'e ele foi guardado na chave das Demandas, não na do outro sistema',
    JSON.stringify([...arm2.mapa.entries()]));
  for (const [k, v] of Object.entries(DO_OUTRO_SISTEMA)) {
    ok(arm2.mapa.get(k) === v, `e a entrada pelo link também não encosta em \`${k}\``);
  }
}

/* ================================== 4. armário que explode não derruba nada

   Navegador em janela anônima, cookies bloqueados, cota estourada: os três
   levantam exceção no `localStorage`. Uma credencial que não pôde ser salva é
   um aborrecimento; uma tela branca é perda de acesso. */
{
  const explode = {
    getItem() { throw new Error('SecurityError: acesso negado'); },
    setItem() { throw new Error('QuotaExceededError'); },
    removeItem() { throw new Error('SecurityError: acesso negado'); },
  };
  globalThis.localStorage = explode;
  globalThis.window = {
    localStorage: explode,
    location: { href: 'http://x/demandas', search: '', pathname: '/demandas', hash: '' },
    history: { replaceState() {} },
  };
  let caiu = false;
  try { guardarToken('x'); esquecerToken(); ok(meuToken() === null, 'e meuToken devolve nada'); }
  catch { caiu = true; }
  ok(!caiu, 'armário indisponível não derruba guardarToken/esquecerToken/meuToken');
}

/* ============================= 5. os três donos da mesma string

   `components/demandas/Casca.tsx` não chama `meuToken()` para decidir se há
   link guardado: ele faz `localStorage.getItem('demandas.link')` à mão, duas
   vezes. Com a chave de `api.ts` trocada, essas duas linhas continuariam
   olhando a chave certa enquanto as funções escrevem na errada — e o caminho
   de descartar o link velho pararia de funcionar em silêncio.

   O lado de referência da comparação é a chave que `guardarToken` USOU lá em
   cima, medida no armário. */
{
  const casca = ler('components/demandas/Casca.tsx');
  const naCasca = [...casca.matchAll(/localStorage\.getItem\(\s*'([^']+)'\s*\)/g)].map(m => m[1]);
  ok(naCasca.length === 2,
    'a casca pergunta pelo link guardado nos dois caminhos que ela tem',
    JSON.stringify(naCasca));
  for (const k of naCasca) {
    ok(k === CHAVE, 'e pergunta pela MESMA chave que guardarToken usa de verdade',
      `a casca lê ${JSON.stringify(k)}, o armário recebeu ${JSON.stringify(CHAVE)}`);
  }

  /* e o dono de origem: um `const K` que deixasse de existir levaria a chave
     para dentro de cada função, e aí seriam cinco donos em vez de três */
  const api = ler('lib/demandas/api.ts');
  const literais = [...api.matchAll(/'(demandas\.[A-Za-z.]+)'/g)].map(m => m[1]);
  ok(literais.filter(x => x === CHAVE).length === 1,
    'em api.ts a chave está escrita uma vez só, na constante',
    JSON.stringify(literais));

  /* NINGUÉM MAIS MEXE EM `escala.*` DE DENTRO DE DEMANDAS. A regra do dono é
     que os dois sistemas não se encostam, e o localStorage é o único chão que
     eles dividem sem uma parede no meio. */
  for (const f of ['lib/demandas/api.ts', 'lib/demandas/regras.ts',
                   'components/demandas/Casca.tsx', 'components/demandas/Ui.tsx',
                   'app/demandas/page.tsx', 'app/demandas/nova/page.tsx',
                   'app/demandas/ajustes/page.tsx', 'app/demandas/numeros/page.tsx',
                   'app/demandas/d/[numero]/page.tsx']) {
    let txt = '';
    try { txt = ler(f); } catch { continue; }
    const encostou = [...txt.matchAll(/localStorage\.\w+\(\s*'(escala\.[^']*)'/g)].map(m => m[1]);
    ok(encostou.length === 0, `${f} não mexe em nenhuma chave do sistema de escalas`,
      JSON.stringify(encostou));
  }
}

console.log(falhas
  ? `\ndemandas-armario: ${falhas} falha(s) em ${feitas}`
  : `\ndemandas-armario: ${feitas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
