/* O TOKEN DE DEMANDAS NÃO PODE FICAR NA BARRA, NEM A ROTA PODE SER INDEXÁVEL.

   19/09/2026. O link pessoal do membro chega como `/demandas?t=<token>`, e
   esse token é a credencial inteira: `demandas.quem()` aceita qualquer um e
   devolve o membro. Três coisas estavam erradas ao mesmo tempo:

     1. `meuToken()` guardava o token e ia embora, deixando-o na barra de
        endereço — e, portanto, no histórico do navegador e no log de
        requisição da Vercel, que grava a URL inteira;
     2. `/demandas` não estava em `ROTAS_FECHADAS` do next.config.mjs, então
        era a única rota do sistema sem `X-Robots-Tag: noindex` — justamente a
        que carrega credencial na URL;
     3. `/demandas` não estava no `disallow` do robots.txt.

   A regra já estava escrita neste repositório, em app/api/cron/route.ts:
   "Query string não é lugar de credencial." Lá o `?secret=` foi removido em
   agosto; aqui o `?t=` tinha ficado.

   Este arquivo existe para as três não voltarem. Ele lê os arquivos como
   texto de propósito: o que precisa ser garantido é o CONTEÚDO da
   configuração, e importar next.config.mjs num teste exigiria carregar o
   Next inteiro.

   Roda com `npm test`. */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (p) => readFileSync(join(raiz, p), 'utf8');

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

/* ------------------------------------------- 1. o token sai da barra */
{
  const api = ler('lib/demandas/api.ts');
  const corpo = api.slice(api.indexOf('export function meuToken'), api.indexOf('export function esquecerToken'));
  ok(/replaceState/.test(corpo), 'meuToken limpa a URL com replaceState');
  ok(/searchParams\.delete\(['"]t['"]\)/.test(corpo), "e o que ela apaga é o parâmetro 't'");
  ok(/catch/.test(corpo), 'e a limpeza não derruba a página se o history falhar');
  /* a ordem importa: guardar ANTES de limpar, senão o token se perde */
  ok(corpo.indexOf('guardarToken(naUrl)') < corpo.indexOf('replaceState'),
    'guarda o token ANTES de tirar da barra (senão some sem ter sido salvo)');
  ok(corpo.indexOf('return naUrl') > corpo.indexOf('replaceState'),
    'e devolve o token depois de limpar, não antes');
}

/* --------------------------------- 2. a rota recebe noindex no cabeçalho */
{
  const cfg = ler('next.config.mjs');
  const lista = cfg.slice(cfg.indexOf('const ROTAS_FECHADAS'), cfg.indexOf('const nextConfig'));
  ok(/'\/demandas'/.test(lista), '/demandas está em ROTAS_FECHADAS');
  ok(/'\/demandas\/:caminho\+'/.test(lista), 'e as filhas de /demandas também');
  /* e as que já estavam continuam lá — um teste que só olha a linha nova
     deixaria passar quem apagasse as outras */
  for (const r of ['/entrar', '/painel', '/escala', '/time', '/ajustes']) {
    ok(lista.includes(`'${r}'`), `${r} continua fechada`);
  }
  ok(/ROTAS_FECHADAS\.map\(source => \(\{ source, headers: \[NAO_INDEXAR\] \}\)\)/.test(cfg),
    'a lista continua virando cabeçalho de verdade (e não só uma constante bonita)');
}

/* --------------------------------------------- 3. e o robots.txt pede */
{
  const robots = ler('app/robots.ts');
  const bloco = robots.slice(robots.indexOf('disallow'), robots.indexOf('sitemap'));
  ok(/'\/demandas'/.test(bloco), '/demandas está no disallow do robots.txt');
  for (const r of ['/eu/', '/painel', '/equipe/', '/candidatura/', '/api/']) {
    ok(bloco.includes(`'${r}'`), `${r} continua no disallow`);
  }
}

/* -------------------------- 4. e ninguém voltou a montar link com ?t=
   O link pessoal é montado em Ajustes. Ele PRECISA ter o `?t=` — é assim que
   a pessoa recebe a credencial pela primeira vez. O que não pode é aparecer
   um segundo lugar montando isso, porque aí a limpeza de `meuToken` deixa de
   cobrir todos os caminhos. Este teste conta: um, e só um. */
{
  const arquivos = [
    'app/demandas/ajustes/page.tsx', 'app/demandas/page.tsx',
    'lib/demandas/api.ts', 'lib/demandas/regras.ts',
    'components/demandas/Casca.tsx', 'components/demandas/Ui.tsx',
  ];
  let n = 0;
  for (const f of arquivos) {
    let txt = '';
    try { txt = ler(f); } catch { continue; }
    n += (txt.match(/\?t=\$\{/g) || []).length;
  }
  ok(n === 1, 'existe UM único lugar que monta o link com ?t= (o de Ajustes)', `achei ${n}`);
}

console.log(falhas ? `\ndemandas-token-na-url: ${falhas} falha(s) em ${feitas}` : `\ndemandas-token-na-url: ${feitas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
