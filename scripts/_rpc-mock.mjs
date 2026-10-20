/* =============================================================================
   AS RPCs DE ARQUIVO · para as auditorias do site (20/10/2026)

   O Chromium das auditorias não alcança o Supabase (e não deve: auditoria
   não bate em produção). Cada chamada `/rest/v1/rpc/<fn>` responde com o
   JSON de scripts/rpc-mocks/<fn>.json, ou <fn>__<p_slug>.json quando a
   chamada traz um slug (as funções de uma área, as perguntas). Sem arquivo,
   responde `[]`, e a página mostra o estado "sem dados" dela.

     import { rotear } from './_rpc-mock.mjs';
     await ctx.route('**', r => rotear(r, BASE));

   RPC_DIR=<pasta> troca a pasta dos JSONs.
   ============================================================================= */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PASTA = process.env.RPC_DIR || join(dirname(fileURLToPath(import.meta.url)), 'rpc-mocks');

export function respostaRpc(route) {
  const req = route.request();
  const fn = req.url().split('/rpc/')[1]?.split('?')[0];
  let slug = '';
  try { slug = JSON.parse(req.postData() || '{}').p_slug || ''; } catch {}
  for (const nome of [slug ? `${fn}__${slug}` : null, fn].filter(Boolean)) {
    const f = join(PASTA, `${nome}.json`);
    if (existsSync(f)) return readFileSync(f, 'utf8');
  }
  return '[]';
}

/* a rota completa: RPC de arquivo, o próprio servidor passa, o resto da
   internet é cortado (fontes e fotos são locais; vídeo externo não existe) */
export function rotear(route, base) {
  const u = route.request().url();
  if (u.includes('/rest/v1/rpc/')) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: respostaRpc(route) });
  return u.startsWith(base) ? route.continue() : route.abort();
}

/* as rotas públicas dos três sites, servidas por um dev server só
   (NEXT_PUBLIC_SITES_LOCAL=1: os links entre sites viram caminhos locais) */
export const ROTAS_SITE = ['/', '/cultos', '/como-chegar', '/eventos', '/pequena-guia', '/sobre', '/ofertar', '/privacidade',
  '/servir', '/servir/midia', '/servir/louvor', '/servir/kids', '/servir/servico', '/servir/livraria', '/servir/onde-me-encaixo', '/acessar',
  '/follow', '/rota-que-nao-existe'];

/* rola a página inteira (revela os .s-rev) e volta ao topo; sem o rolar
   suave, que atrapalha a medição */
export async function rolarTudo(page) {
  await page.evaluate(async () => {
    document.documentElement.style.scrollBehavior = 'auto';
    for (let y = 0; y < document.body.scrollHeight + 900; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 30)); }
    window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 400));
  });
}
