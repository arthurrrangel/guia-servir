/* UMA PONTE DE MENTIRA PARA UM BANCO DE VERDADE.

   Este servidor fala o pedacinho do protocolo do Supabase que o app usa
   (`POST /rest/v1/rpc/<funcao>`) e executa a chamada no Postgres local, pelo
   psql. Com ele, o teste de ponta a ponta é de verdade: navegador → app →
   função `dem_*` → tabelas → e volta.

   Por que isto existe: um teste que devolve resposta inventada prova que a
   tela desenha, e nada mais. Já vi esse filme — na /eu, um `route` registrado
   na ordem errada engoliu as RPCs e a tela ficou dizendo "link não vale" com
   o banco inteiro certo do outro lado. Aqui o banco responde de verdade, e a
   permissão que recusa é a permissão que está em produção.

   Não é para rodar em produção. É `--experimental` de propósito: sem TLS, sem
   autenticação, escutando só em 127.0.0.1. */

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const PG = '/usr/lib/postgresql/16/bin/psql';
const PORTA = Number(process.env.PORTA || 54321);
const BANCO = process.env.BANCO || 'dem';

/** Literal SQL a partir do que o supabase-js mandou em JSON. */
function lit(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return String(v);
  const txt = typeof v === 'object' ? JSON.stringify(v) : String(v);
  const escapado = `'${txt.replace(/'/g, "''")}'`;
  return typeof v === 'object' ? `${escapado}::jsonb` : escapado;
}

/* O PAPEL E A IDENTIDADE DE CADA CHAMADA, COMO O POSTGREST FAZ · 22/09/2026.

   Até a 94 esta ponte chamava tudo como `postgres`, o superusuário: um grant
   faltando numa função nova passava aqui e quebrava em produção, e o caminho
   do login por e-mail (`auth.jwt()`) nunca era exercitado, porque a ponte
   nem olhava o cabeçalho.

   Agora cada chamada roda com o papel que o PostgREST usaria:

     · sem JWT de usuário (o link pessoal, ou ninguém) ...... `anon`
     · com JWT de usuário `authenticated` ................... `authenticated`,
       e as claims do token viram `teste.jwt`, que é o que o `auth.jwt()`
       desta base lê (em produção ele lê `request.jwt.claims`).

   A ponte NÃO confere a assinatura do token: quem monta o JWT é o próprio
   teste (`demandas-isolamento.mjs`). Em produção quem confere é o PostgREST,
   com o segredo do projeto, e um token forjado nem chega ao banco.

   E O PSQL SAI DIRETO, SEM SHELL NO MEIO. Era `su postgres -c "<sql>"`, e o
   SQL passava por um shell: um `$` num comentário virava variável. Esta base
   aceita qualquer usuário do sistema operacional (`initdb -A trust`), então
   o `su` não protegia nada e o shell só atrapalhava. */
function claimsDe(cab) {
  const m = /^Bearer\s+([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]*)$/.exec(cab || '');
  if (!m) return null;
  try {
    const c = JSON.parse(Buffer.from(m[2], 'base64url').toString('utf8'));
    return c && c.role === 'authenticated' ? c : null;
  } catch { return null; }
}

async function chamar(fn, args, claims) {
  if (!/^[a-z_][a-z0-9_]*$/.test(fn)) throw new Error('nome de função inválido');
  const pares = Object.entries(args).map(([k, v]) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(k)) throw new Error('nome de argumento inválido');
    return `${k} => ${lit(v)}`;
  });
  const sql = `select public.${fn}(${pares.join(', ')})::text`;
  const cs = ['-c', `set role ${claims ? 'authenticated' : 'anon'}`];
  if (claims) cs.push('-c', `set teste.jwt = ${lit(JSON.stringify(claims))}`);
  cs.push('-c', sql);
  const { stdout } = await exec(PG, [
    '-h', '/tmp', '-U', 'postgres', '-d', BANCO, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', ...cs,
  ], { maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS,PATCH,DELETE',
};

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }

  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/pronto') { res.writeHead(200, CORS); res.end('ok'); return; }
  const corpo = await new Promise(r => {
    let b = ''; req.on('data', c => { b += c; }); req.on('end', () => r(b));
  });

  /* o app usa só RPC. Storage não existe no sistema de demandas (anexo é
     link, desde a migração 85). */
  if (url.pathname.startsWith('/rest/v1/rpc/')) {
    const fn = url.pathname.split('/').pop();
    try {
      const saida = await chamar(fn, corpo ? JSON.parse(corpo) : {}, claimsDe(req.headers.authorization));
      res.writeHead(200, { ...CORS, 'content-type': 'application/json' });
      res.end(saida || 'null');
    } catch (e) {
      /* o erro volta no formato do PostgREST, com o código do Postgres:
         `permission denied for function` é 42501 lá, e o app trata 42501
         pelo nome (`SEM_PERMISSAO_DB`). Devolver 500 genérico esconderia
         justamente a falha de grant que o papel `anon` existe para achar. */
      const txt = String(e.stderr || e).slice(0, 300);
      console.error('  ponte:', fn, txt);
      const code = /permission denied/i.test(txt) ? '42501'
        : /does not exist/i.test(txt) ? 'PGRST202' : 'P0001';
      res.writeHead(code === '42501' ? 403 : code === 'PGRST202' ? 404 : 400,
        { ...CORS, 'content-type': 'application/json' });
      res.end(JSON.stringify({ code, message: txt }));
    }
    return;
  }

  /* do auth, só o que o app pergunta quando JÁ tem sessão: quem é o usuário
     (lido do próprio token, como descrito acima) e sair. Pedir link por
     e-mail continua fora: aqui ninguém recebe e-mail. */
  if (url.pathname === '/auth/v1/user') {
    const c = claimsDe(req.headers.authorization);
    res.writeHead(c ? 200 : 401, { ...CORS, 'content-type': 'application/json' });
    res.end(JSON.stringify(c ? { id: c.sub, aud: 'authenticated', role: 'authenticated', email: c.email,
      email_confirmed_at: new Date(0).toISOString(), app_metadata: {}, user_metadata: {} }
      : { code: 401, msg: 'sem sessão' }));
    return;
  }
  if (url.pathname === '/auth/v1/logout') { res.writeHead(204, CORS); res.end(); return; }
  if (url.pathname.startsWith('/auth/v1/')) {
    res.writeHead(400, { ...CORS, 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'nao_testado_aqui' }));
    return;
  }

  res.writeHead(404, CORS); res.end('{}');
}).listen(PORTA, '127.0.0.1', () => console.log('ponte de teste em ' + PORTA));
