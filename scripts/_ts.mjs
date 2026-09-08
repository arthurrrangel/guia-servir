/* Resolve `import './igreja'` para `./igreja.ts` nos testes em Node puro
   (o Node tira os tipos, mas não adivinha extensão). Uso:
     node --import ./scripts/_ts.mjs scripts/semana.test.mjs */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register(new URL('data:text/javascript,' + encodeURIComponent(`
  import { existsSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  export async function resolve(spec, ctx, next) {
    if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.[a-z]+$/.test(spec) && ctx.parentURL) {
      const base = new URL(spec, ctx.parentURL);
      for (const ext of ['.ts', '.tsx']) { const f = fileURLToPath(base) + ext; if (existsSync(f)) return next(spec + ext, ctx); }
    }
    return next(spec, ctx);
  }
`)), pathToFileURL('./'));
