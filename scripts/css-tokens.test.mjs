/* TOKEN INVENTADO NA HORA NÃO PODE ENTRAR NA FOLHA.

   19/09/2026. Escrevi um bloco novo em `globals.css` e usei dois tokens que
   não existem: `--fonte-corpo` e `--t-peq`. Os nomes são plausíveis, parecem
   com os de verdade (`--fonte`, `--t-apoio`), e o CSS não reclama.

   O QUE ACONTECE, E POR QUE É PIOR DO QUE PARECE

   Uma declaração que usa `var()` de um token indefinido é DESCARTADA INTEIRA.
   Não é "cai para o padrão": ela some, e a propriedade volta ao que a
   herança disser.

   E quando a declaração é um ATALHO, o estrago se multiplica:

       font: max(16px,var(--t-corpo))/1.4 var(--fonte-corpo);

   Isso devia fixar tamanho, entrelinha e família. Com a família indefinida,
   o atalho inteiro cai — e o campo ficou com os 12px que herdou do rótulo,
   num lugar onde o comentário ao lado dizia, em letras claras, que o piso de
   16px existia para o iOS não dar zoom ao focar.

   POR QUE NENHUM TESTE PEGOU

   Os testes de celular medem 320px e 390px. Nessa faixa uma regra geral da
   casa põe um piso de 16px em todo input, e o piso escondia o defeito. Acima
   de 719px — um iPad em retrato — o piso some e sobra a regra morta. Ou
   seja: o defeito nasceu num ponto cego entre duas defesas boas.

   Este arquivo fecha a classe, não o caso: ele varre a folha inteira e exige
   que todo `var(--x)` tenha um `--x:` em algum lugar, ou um valor de reserva
   escrito na própria chamada (`var(--x, 16px)`, que é legítimo).

   Roda com `npm test`. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

/* comentário não é folha: `/* ... *​/` sai antes de qualquer conta, senão a
   explicação de um defeito vira o próprio defeito */
const semComentario = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

function analisar(caminho) {
  const bruto = readFileSync(join(raiz, caminho), 'utf8');
  const css = semComentario(bruto);

  const definidos = new Set();
  for (const m of css.matchAll(/(^|[;{\s])(--[A-Za-z0-9_-]+)\s*:/g)) definidos.add(m[2]);

  /* uso SEM valor de reserva: `var(--x)` ou `var(--x )`, mas não
     `var(--x, algo)` — o segundo é deliberado e válido */
  const usadosSemReserva = new Map();
  for (const m of css.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g)) {
    usadosSemReserva.set(m[1], (usadosSemReserva.get(m[1]) || 0) + 1);
  }
  const orfaos = [...usadosSemReserva.keys()].filter(t => !definidos.has(t));
  return { caminho, definidos, usadosSemReserva, orfaos, css };
}

const FOLHAS = ['app/globals.css', 'app/demandas/demandas.css'];
const analises = FOLHAS.map(analisar);

/* ------------------------------------- 1. nenhum token órfão em nenhuma folha

   `demandas.css` é isolado sob `.dm` mas roda na MESMA página, então ele
   enxerga os tokens de `globals.css`. A conta de órfão considera as duas. */
const todosDefinidos = new Set(analises.flatMap(a => [...a.definidos]));
for (const a of analises) {
  const orfaos = a.orfaos.filter(t => !todosDefinidos.has(t));
  ok(orfaos.length === 0,
    `${a.caminho}: todo var(--x) tem um --x: em algum lugar`,
    orfaos.length ? `órfãos: ${orfaos.join(', ')}` : '');
}

/* ------------- 2. e o teste PEGA de verdade: um órfão plantado é detectado */
{
  const a = analises[0];
  const comDefeito = a.css + '\n.teste-plantado{ color: var(--token-que-nao-existe-123) }';
  const definidos = new Set();
  for (const m of comDefeito.matchAll(/(^|[;{\s])(--[A-Za-z0-9_-]+)\s*:/g)) definidos.add(m[2]);
  const usados = [...comDefeito.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g)].map(m => m[1]);
  const pegou = usados.some(t => !definidos.has(t) && !todosDefinidos.has(t));
  ok(pegou, 'o detector acusa um token órfão plantado de propósito');
}

/* ---- 3. e um com valor de reserva NÃO é acusado (senão o teste vira ruído) */
{
  const comReserva = '.x{ color: var(--nao-existe-456, #000) }';
  const usadosSemReserva = [...comReserva.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g)];
  ok(usadosSemReserva.length === 0,
    'var(--x, reserva) não é acusado: reserva é uso legítimo');
}

/* ------------------------- 4. o atalho `font:` não carrega token de família

   É a armadilha específica que me pegou: no atalho, um valor inválido derruba
   TAMANHO, ENTRELINHA e FAMÍLIA juntos. Em longhand, cada linha cai sozinha.
   Onde há piso de acessibilidade em jogo (o `max(16px, …)` que impede o zoom
   do iOS), o atalho é proibido nesta folha. */
for (const a of analises) {
  const atalhosComMax = [...a.css.matchAll(/(^|[;{])\s*font\s*:\s*([^;}]*max\s*\([^;}]*)/g)]
    .map(m => m[2].trim().slice(0, 90));
  ok(atalhosComMax.length === 0,
    `${a.caminho}: nenhum atalho font: carregando um piso de tamanho (use longhand)`,
    atalhosComMax.join(' | '));
}

/* --------------- 5. os tokens que o bloco do evento usa existem mesmo

   Caso concreto, para a correção de hoje não voltar por descuido. */
{
  const a = analises[0];
  /* Os nomes REAIS da folha. Eu tinha escrito `--fundo` e `--tinta` aqui
     também, por reflexo, e o próprio teste os acusou: os que existem são
     `--papel` e `--ink`. Errar o nome do token duas vezes seguidas é o
     argumento deste arquivo existir. */
  for (const t of ['--t-apoio', '--t-corpo', '--fonte', '--linha', '--papel', '--ink', '--cinza', '--r4']) {
    ok(a.definidos.has(t), `${t} está definido em globals.css`);
  }
  ok(!a.css.includes('--fonte-corpo'), 'o token inventado --fonte-corpo não voltou');
  ok(!a.css.includes('--t-peq'), 'o token inventado --t-peq não voltou');
}

console.log(falhas ? `\ncss-tokens: ${falhas} falha(s) em ${feitas}` : `\ncss-tokens: ${feitas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
