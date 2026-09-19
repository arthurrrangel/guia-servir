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

async function chamar(fn, args) {
  const pares = Object.entries(args).map(([k, v]) => `${k} => ${lit(v)}`);
  /* numa linha só: a chamada vai por `su postgres -c`, que passa por um
     shell, e quebra de linha ali vira "\n" literal dentro do psql */
  const sql = `select public.${fn}(${pares.join(', ')})::text`.replace(/[\r\n]+/g, ' ');
  const { stdout } = await exec('su', [
    'postgres', '-c',
    `${PG} -h /tmp -U postgres -d ${BANCO} -X -A -t -c ${JSON.stringify(sql)}`,
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

  /* o app usa só RPC. O resto do Supabase (auth, storage) não é exercitado
     aqui: o caminho testado é o do LINK PESSOAL, que não passa pelo auth. */
  if (url.pathname.startsWith('/rest/v1/rpc/')) {
    const fn = url.pathname.split('/').pop();
    try {
      const saida = await chamar(fn, corpo ? JSON.parse(corpo) : {});
      res.writeHead(200, { ...CORS, 'content-type': 'application/json' });
      res.end(saida || 'null');
    } catch (e) {
      console.error('  ponte:', fn, String(e).slice(0, 300));
      res.writeHead(500, { ...CORS, 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: String(e).slice(0, 300) }));
    }
    return;
  }

  if (url.pathname.startsWith('/auth/v1/')) {
    res.writeHead(400, { ...CORS, 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'nao_testado_aqui' }));
    return;
  }

  res.writeHead(404, CORS); res.end('{}');
}).listen(PORTA, '127.0.0.1', () => console.log('ponte de teste em ' + PORTA));
