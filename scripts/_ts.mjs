/* Resolve, nos testes em Node puro, o que o Node não adivinha sozinho:

     1. `import './igreja'`  ->  `./igreja.ts`   (o Node tira os tipos, mas
        não completa a extensão);
     2. `import '@/lib/...'` ->  caminho real a partir da raiz do projeto.

   O ATALHO `@/` PRECISA VALER AQUI, E O MOTIVO NÃO É COMODIDADE — 20/09/2026.

   Sem ele, um teste que quer olhar `lib/demandas/api.ts` (que importa
   `@/lib/supabase`) não consegue IMPORTAR o módulo, e a saída fácil é ler o
   arquivo como texto e passar expressão regular nele. Isso é exatamente o
   erro que este repositório já pagou: `cron-guarda.test.mjs`, na primeira
   versão, casava texto e continuava verde com o guarda REMOVIDO. Teste que
   lê código em vez de executá-lo não testa comportamento, testa grafia.

   `tsconfig.json` já declara `"@/*": ["./*"]`. Esta ponte faz o Node
   concordar com o TypeScript em vez de cada um resolver de um jeito.

   Uso: node --import ./scripts/_ts.mjs scripts/semana.test.mjs */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const RAIZ = pathToFileURL(process.cwd() + '/').href;

register(new URL('data:text/javascript,' + encodeURIComponent(`
  import { existsSync } from 'node:fs';
  import { fileURLToPath, pathToFileURL } from 'node:url';

  const RAIZ = ${JSON.stringify(RAIZ)};

  /* acha o arquivo real de um caminho sem extensão: X.ts, X.tsx, X/index.ts */
  const comExtensao = (urlBase) => {
    const p = fileURLToPath(urlBase);
    for (const tentativa of [p + '.ts', p + '.tsx', p + '/index.ts', p + '/index.tsx', p]) {
      if (existsSync(tentativa)) return tentativa;
    }
    return null;
  };

  export async function resolve(spec, ctx, next) {
    if (spec.startsWith('@/')) {
      const alvo = comExtensao(new URL(spec.slice(2), RAIZ));
      if (alvo) return next(pathToFileURL(alvo).href, ctx);
    }
    if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.[a-z]+$/.test(spec) && ctx.parentURL) {
      const alvo = comExtensao(new URL(spec, ctx.parentURL));
      if (alvo) return next(pathToFileURL(alvo).href, ctx);
    }
    return next(spec, ctx);
  }
`)), pathToFileURL('./'));
