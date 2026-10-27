/* O DRESS CODE DO LOUVOR DE PONTA A PONTA · 116 · 26/10/2026.
   Roda pelo scripts/dress-code-e2e.sh (o banco e o build ficam prontos lá).

   A · a liderança do Louvor, no celular (390): sem dress code, "Definir" e
       "Repetir o de dd/mm"; escolhe as cores (paleta e personalizada), duas
       combinações, o estilo e as orientações; envia três fotos (uma de 4000
       px com a orientação da câmera, um PNG transparente), gera uma por IA
       (a rota de verdade, gerador de mentira) para a segunda combinação,
       troca uma, envia e tira outra; a prévia da mensagem; salva: só sobe o
       que ficou, em WebP leve, na pasta do Louvor; o banco guarda o formato
       da 116; o resumo fecha com tudo
   B · a mensagem do grupo ("Copiar a escala") leva o bloco DRESS CODE e o link
   C · quem serve vê no próprio link (390 e 1440), abre as imagens inteiras;
       quem não serve naquele culto não vê
   D · o link do grupo abre sem login, com o título da prévia do WhatsApp, e
       não se indexa; link torto ou de culto antigo não abre
   E · no computador: repetir o do culto anterior em outro domingo (sem subir
       nada de novo, com um id novo), duas pessoas salvando ao mesmo tempo
       (MUDOU: o aviso, e salvar o meu) e tirar o dress code
   F · quem não deve não grava: a Mídia (tela, banco, armário, IA), quem não
       entrou, arquivo torto, o limite de 12 por dia da IA, escrita direto na
       tabela; e a mensagem da Mídia continua a mesma */
import { createServer, request as pedir } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';

const RAIZ = new URL('..', import.meta.url).pathname;
const PORTA = Number(process.env.PORTA || 5447);
const BANCO = process.env.BANCO || 'dress';
const PGRST = process.env.PGRST || '/tmp/postgrest-12.2.3/postgrest';
const PORTA_PGRST = Number(process.env.PORTA_PGRST || 54381);
const PORTA_PONTE = Number(process.env.PORTA_PONTE || 54382);
const PORTA_APP = Number(process.env.PORTA_APP || 3520);
const SUPA = `http://127.0.0.1:${PORTA_PONTE}`;
const BASE = `http://127.0.0.1:${PORTA_APP}`;
const SEGREDO = 'segredo-local-da-prova-do-dress-code-com-mais-de-32-caracteres';
const BALDE = 'dress-code';
const OUT = '/tmp/dress-e2e';
mkdirSync(OUT, { recursive: true });

const esperar = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0, feitas = 0;
const ok = (c, nome, extra = '') => { feitas++; if (!c) falhas++; console.log(`  ${c ? 'ok ' : 'FALHOU'} ${nome}${!c && extra ? '\n      ' + extra : ''}`); };

function sql(texto, vars = {}) {
  const args = ['-h', '/tmp', '-p', String(PORTA), '-U', 'postgres', '-d', BANCO, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'];
  for (const [k, v] of Object.entries(vars)) args.push('-v', `${k}=${v}`);
  return execFileSync('psql', args, { input: texto, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
const sqlFalha = (texto, vars = {}) => { try { sql(texto, vars); return ''; } catch (e) { return String(e.stderr || e); } };

/* ------------------------------------------------------------------- JWT */
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function assinar(claims) {
  const cab = b64({ alg: 'HS256', typ: 'JWT' }), corpo = b64(claims);
  return `${cab}.${corpo}.${createHmac('sha256', SEGREDO).update(`${cab}.${corpo}`).digest('base64url')}`;
}
function conferirJwt(cabecalho) {
  const m = /^Bearer\s+([\w-]+)\.([\w-]+)\.([\w-]+)$/.exec(cabecalho || '');
  if (!m) return null;
  if (createHmac('sha256', SEGREDO).update(`${m[1]}.${m[2]}`).digest('base64url') !== m[3]) return null;
  try {
    const c = JSON.parse(Buffer.from(m[2], 'base64url').toString('utf8'));
    return c.exp && c.exp < Date.now() / 1000 ? null : c;
  } catch { return null; }
}
const agora = Math.floor(Date.now() / 1000);
const ANON = assinar({ iss: 'supabase', role: 'anon', iat: agora, exp: agora + 6 * 3600 });
const SERVICO = assinar({ iss: 'supabase', role: 'service_role', iat: agora, exp: agora + 6 * 3600 });
const gente = email => ({ id: randomUUID(), email });
const LIDER_LOUVOR = gente('lider.louvor@prova.teste');
const LIDER_MIDIA = gente('lider.midia@prova.teste');
const tokenDe = p => assinar({ aud: 'authenticated', role: 'authenticated', sub: p.id, email: p.email, iat: agora, exp: agora + 6 * 3600 });
const sessaoDe = p => ({
  access_token: tokenDe(p), token_type: 'bearer', expires_in: 6 * 3600, expires_at: agora + 6 * 3600, refresh_token: 'nao-usado',
  user: { id: p.id, aud: 'authenticated', role: 'authenticated', email: p.email, app_metadata: { provider: 'email' },
    user_metadata: {}, created_at: new Date(0).toISOString() },
});

/* ----------------------------------------------------------------- datas */
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const somar = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
/* o primeiro domingo daqui a pelo menos dois dias, o seguinte, e um que já
   passou há duas semanas (o "culto anterior" para repetir) */
let D1 = somar(hoje, 2);
while (new Date(D1 + 'T12:00:00Z').getUTCDay() !== 0) D1 = somar(D1, 1);
const D2 = somar(D1, 7), D0 = somar(D1, -14);
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const longo = d => `domingo, ${+d.slice(8, 10)} de ${MESES[+d.slice(5, 7) - 1]}`;
const ddmm = d => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const TOK_LIA = 'e2edress0000000lia', TOK_DAVI = 'e2edress000000davi', TOK_MARIA = 'e2edress00000maria';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/* -------------------------------------------------------- as fotos da prova */
function fazerFotos() {
  execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageDraw
out = sys.argv[1]
# 1 · a foto grande do celular: 4000 x 3000 no arquivo, de pé na câmera (EXIF 6)
im = Image.new('RGB', (4000, 3000), (31, 42, 68))
ImageDraw.Draw(im).rectangle([0, 0, 1999, 2999], fill=(227, 213, 189))
ex = Image.Exif(); ex[0x0112] = 6
im.save(out + '/foto-grande.jpg', 'JPEG', quality=88, exif=ex.tobytes())
# 2 · o PNG transparente, com um círculo preto no meio (o fundo vira branco)
im = Image.new('RGBA', (800, 800), (0, 0, 0, 0))
ImageDraw.Draw(im).ellipse([200, 200, 600, 600], fill=(17, 17, 17, 255))
im.save(out + '/transparente.png', 'PNG')
# 3 · a que entra no lugar de outra, e a que sai antes de salvar
Image.new('RGB', (1200, 900), (192, 88, 59)).save(out + '/troca.jpg', 'JPEG', quality=85)
Image.new('RGB', (600, 800), (31, 122, 90)).save(out + '/sai.jpg', 'JPEG', quality=85)
Image.new('RGB', (600, 800), (75, 93, 58)).save(out + '/outra.jpg', 'JPEG', quality=85)
open(out + '/nao-e-foto.jpg', 'wb').write(b'isto nao e uma imagem')
`, OUT]);
}
/** formato, tamanho e duas cores de uma imagem que chegou ao armário */
function medir(buf) {
  return JSON.parse(execFileSync('python3', ['-c', `
import sys, io, json
from PIL import Image
im = Image.open(io.BytesIO(sys.stdin.buffer.read()))
w, h = im.size
rgb = im.convert('RGB')
print(json.dumps({'formato': im.format, 'w': w, 'h': h, 'canto': rgb.getpixel((3, 3)), 'meio': rgb.getpixel((w // 2, h // 2))}))
`], { input: buf }).toString());
}
const perto = (a, b, tol = 12) => Array.isArray(a) && a.length === 3 && a.every((v, i) => Math.abs(v - b[i]) <= tol);

/* ===================================================== a ponte do Storage */
const armario = new Map();   // nome -> { dados, tipo, cache }
const envios = [];           // cada tentativa de envio, com o que a ponte decidiu
const CORS = { 'access-control-allow-origin': '*',
  'access-control-expose-headers': 'Content-Range, Content-Disposition, Content-Location, Preference-Applied, Range-Unit' };
function json(res, status, corpo) { res.writeHead(status, { ...CORS, 'content-type': 'application/json' }); res.end(JSON.stringify(corpo)); }
const erroDoStorage = (res, codigo, erro, mensagem) => json(res, 400, { statusCode: String(codigo), error: erro, message: mensagem });

function partes(corpo, tipo) {
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(tipo || '');
  if (!m) return [];
  const fronteira = Buffer.from('--' + (m[1] || m[2]));
  const lista = [];
  let i = corpo.indexOf(fronteira);
  while (i !== -1) {
    const ini = i + fronteira.length;
    if (corpo.subarray(ini, ini + 2).toString() === '--') break;
    const fimCab = corpo.indexOf('\r\n\r\n', ini);
    if (fimCab === -1) break;
    const cab = corpo.subarray(ini + 2, fimCab).toString('utf8');
    const prox = corpo.indexOf(fronteira, fimCab + 4);
    if (prox === -1) break;
    lista.push({
      nome: /;\s*name="([^"]*)"/i.exec(cab)?.[1] ?? '',
      arquivo: /;\s*filename="([^"]*)"/i.exec(cab)?.[1],
      tipo: /content-type:\s*([^\r\n]+)/i.exec(cab)?.[1]?.trim() || '',
      dados: corpo.subarray(fimCab + 4, prox - 2),
    });
    i = prox;
  }
  return lista;
}

/* o envio como a API do Storage faz: o armário lido pelo serviço, e a linha
   gravada com o papel e o JWT de quem enviou (a política da 116 decide; a
   chave do servidor passa por cima do RLS, como lá) */
function enviar(req, res, nome, corpo) {
  const claims = conferirJwt(req.headers.authorization);
  const reg = { nome, email: claims?.email || '', papel: claims?.role || '', tipo: '', tamanho: 0, status: 0, erro: '' };
  envios.push(reg);
  const recusar = (codigo, erro, msg) => { reg.status = codigo; reg.erro = msg; erroDoStorage(res, codigo, erro, msg); };
  if (!claims) return recusar(403, 'Unauthorized', 'invalid signature');
  const papel = claims.role === 'authenticated' || claims.role === 'service_role' ? claims.role : 'anon';
  const balde = JSON.parse(sql(`select coalesce((select row_to_json(b) from storage.buckets b where b.id = :'b'), 'null')`, { b: BALDE }) || 'null');
  if (!balde) return recusar(404, 'Bucket not found', 'Bucket not found');
  let tipo, dados, cache = '3600';
  if (/^multipart\/form-data/i.test(req.headers['content-type'] || '')) {
    const ps = partes(corpo, req.headers['content-type']);
    const arq = ps.find(p => p.arquivo !== undefined);
    if (!arq) return recusar(400, 'InvalidRequest', 'No file in the request');
    tipo = arq.tipo || 'text/plain'; dados = arq.dados;
    cache = ps.find(p => p.nome === 'cacheControl')?.dados.toString() || cache;
  } else {
    tipo = req.headers['content-type'] || 'text/plain'; dados = corpo;
    cache = (/max-age=(\d+)/.exec(req.headers['cache-control'] || '') || [])[1] || cache;
  }
  reg.tipo = tipo; reg.tamanho = dados.length;
  if (balde.file_size_limit && dados.length > Number(balde.file_size_limit)) return recusar(413, 'Payload too large', 'The object exceeded the maximum allowed size');
  if (Array.isArray(balde.allowed_mime_types) && balde.allowed_mime_types.length && !balde.allowed_mime_types.includes(tipo)) {
    return recusar(415, 'invalid_mime_type', `mime type ${tipo} is not supported`);
  }
  try {
    sql(`begin;
select set_config('request.jwt.claims', :'claims', true) is not null as _;
set local role ${papel};
insert into storage.objects (bucket_id, name, owner, metadata)
  values (:'b', :'nome', nullif(:'dono', '')::uuid, :'meta'::jsonb) returning id;
commit;`, {
      b: BALDE, claims: JSON.stringify(claims), nome, dono: papel === 'authenticated' ? claims.sub : '',
      meta: JSON.stringify({ mimetype: tipo, size: dados.length, cacheControl: `max-age=${cache}` }),
    });
  } catch (e) {
    const txt = String(e.stderr || e);
    if (/row-level security/i.test(txt)) return recusar(403, 'Unauthorized', 'new row violates row-level security policy');
    if (/duplicate key/i.test(txt)) return recusar(409, 'Duplicate', 'The resource already exists');
    return recusar(500, 'internal', txt.slice(0, 200));
  }
  armario.set(nome, { dados: Buffer.from(dados), tipo, cache: `max-age=${cache}` });
  reg.status = 200;
  json(res, 200, { Key: `${BALDE}/${nome}`, Id: randomUUID() });
}
function baixar(res, nome) {
  const linha = sql(`select row_to_json(x) from (select b.public from storage.objects o join storage.buckets b on b.id = o.bucket_id
     where o.bucket_id = :'b' and o.name = :'nome') x`, { b: BALDE, nome });
  const a = armario.get(nome);
  if (!linha || !JSON.parse(linha).public || !a) return erroDoStorage(res, 404, 'not_found', 'Object not found');
  res.writeHead(200, { ...CORS, 'content-type': a.tipo, 'cache-control': a.cache, 'content-length': String(a.dados.length) });
  res.end(a.dados);
}
/* a chave pública do build da prova é um texto ("chave-de-teste"); no
   Supabase ela é um JWT de anon. A ponte troca, para o PostgREST ver o que
   veria lá */
function repassar(req, res, corpo) {
  const cab = { ...req.headers }; delete cab.host; delete cab.origin; delete cab.referer;
  if (!conferirJwt(cab.authorization)) cab.authorization = `Bearer ${ANON}`;
  const r = pedir({ host: '127.0.0.1', port: PORTA_PGRST, method: req.method, path: req.url.replace(/^\/rest\/v1/, '') || '/', headers: cab }, resp => {
    const volta = { ...resp.headers };
    for (const k of Object.keys(volta)) if (k.startsWith('access-control-')) delete volta[k];
    res.writeHead(resp.statusCode || 502, { ...volta, ...CORS });
    resp.pipe(res);
  });
  r.on('error', e => json(res, 502, { message: String(e) }));
  r.end(corpo);
}
const ponte = createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...CORS, 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': req.headers['access-control-request-headers'] || '', 'access-control-max-age': '600' });
    res.end(); return;
  }
  const pedacos = [];
  req.on('data', c => pedacos.push(c));
  req.on('end', () => {
    const corpo = Buffer.concat(pedacos);
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    try {
      if (p.startsWith('/rest/v1/')) return repassar(req, res, corpo);
      if (p.startsWith(`/storage/v1/object/public/${BALDE}/`) && req.method === 'GET') return baixar(res, p.slice(`/storage/v1/object/public/${BALDE}/`.length));
      if (p.startsWith(`/storage/v1/object/${BALDE}/`) && req.method === 'POST') return enviar(req, res, p.slice(`/storage/v1/object/${BALDE}/`.length), corpo);
      if (p === '/auth/v1/user') {
        const c = conferirJwt(req.headers.authorization);
        return json(res, c ? 200 : 401, c ? { id: c.sub, aud: 'authenticated', role: 'authenticated', email: c.email,
          app_metadata: {}, user_metadata: {}, created_at: new Date(0).toISOString() } : { msg: 'sem sessão' });
      }
      if (p === '/auth/v1/logout') { res.writeHead(204, CORS); return res.end(); }
      json(res, 404, { message: `a ponte não fala ${req.method} ${p}` });
    } catch (e) { json(res, 500, { message: String(e) }); }
  });
});
async function enviarDireto(token, nome, dados, tipo) {
  const fd = new FormData();
  fd.append('cacheControl', '3600');
  fd.append('', new Blob([dados], { type: tipo }));
  const r = await fetch(`${SUPA}/storage/v1/object/${BALDE}/${nome}`, {
    method: 'POST', body: fd, headers: { authorization: `Bearer ${token}`, apikey: ANON, 'x-upsert': 'false' } });
  return { http: r.status, corpo: await r.json().catch(() => ({})) };
}
async function rpcComo(token, fn, args) {
  const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: 'POST',
    headers: { authorization: `Bearer ${token}`, apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify(args) });
  return { http: r.status, corpo: await r.json().catch(() => null) };
}

/* ================================================================ subida */
let pgrst = null, app = null, nav = null, logApp = '', paginaAtual = null;
async function esperarHttp(url, ms, rotulo) {
  const ate = Date.now() + ms;
  for (;;) {
    const r = await fetch(url).catch(() => null);
    if (r && r.status < 500) return;
    if (Date.now() > ate) throw new Error(`${rotulo} não subiu`);
    await esperar(500);
  }
}
async function subir() {
  sql(`
do $$ begin create role authenticator login noinherit; exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to authenticator;
create or replace function auth.uid() returns uuid language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $f$;
create or replace function auth.email() returns text language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claim.email', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')) $f$;
insert into lideres (email, equipe_id) select :'lider_louvor', id from equipes where slug = 'louvor';
insert into lideres (email, equipe_id) select :'lider_midia', id from equipes where slug = 'midia';
select set_config('e2e.d0', :'d0', false) is not null as _;
select set_config('e2e.d1', :'d1', false) is not null as _;
select set_config('e2e.d2', :'d2', false) is not null as _;
select set_config('e2e.lia', :'lia', false) is not null as _;
select set_config('e2e.davi', :'davi', false) is not null as _;
select set_config('e2e.maria', :'maria', false) is not null as _;
do $semente$
declare L uuid; M uuid; fl uuid[]; fm uuid[]; c0 uuid; c1 uuid; c2 uuid; lia uuid; davi uuid; maria uuid;
begin
  select id into L from equipes where slug = 'louvor';
  select id into M from equipes where slug = 'midia';
  select array_agg(id order by ordem) into fl from (select id, ordem from funcoes
    where equipe_id = L and ativa and 'domingo' = any (tipos) order by ordem limit 2) x;
  select array_agg(id order by ordem) into fm from (select id, ordem from funcoes
    where equipe_id = M and ativa and 'domingo' = any (tipos) order by ordem limit 1) x;
  if coalesce(array_length(fl, 1), 0) < 2 or coalesce(array_length(fm, 1), 0) < 1 then
    raise exception 'a semente precisa de 2 postos do Louvor e 1 da Mídia';
  end if;
  insert into cultos (data) values (current_setting('e2e.d0')::date), (current_setting('e2e.d1')::date), (current_setting('e2e.d2')::date)
    on conflict (data) where evento is null do nothing;
  select id into c0 from cultos where data = current_setting('e2e.d0')::date and evento is null;
  select id into c1 from cultos where data = current_setting('e2e.d1')::date and evento is null;
  select id into c2 from cultos where data = current_setting('e2e.d2')::date and evento is null;
  insert into voluntarios (nome, equipe_id, token, ativo) values ('Lia Prova', L, current_setting('e2e.lia'), true) returning id into lia;
  insert into voluntarios (nome, equipe_id, token, ativo) values ('Davi Prova', L, current_setting('e2e.davi'), true) returning id into davi;
  insert into voluntarios (nome, equipe_id, token, ativo) values ('Maria Prova', M, current_setting('e2e.maria'), true) returning id into maria;
  /* Lia serve nos dois domingos; Davi só no segundo; Maria, da Mídia, no primeiro */
  insert into escalacoes (culto_id, funcao_id, voluntario_id, status) values
    (c1, fl[1], lia, 'confirmado'), (c2, fl[1], lia, 'pendente'), (c2, fl[2], davi, 'pendente'), (c1, fm[1], maria, 'pendente'),
    (c0, fl[1], lia, 'confirmado');
  /* o culto de duas semanas atrás já teve dress code (o banco põe id, versão e hora) */
  insert into culto_obs (culto_id, equipe_id, dress_code) values (c0, L,
    '{"combinacoes":[{"cores":[{"hex":"#ffffff","nome":"Branco"}]}],"estilo":"social","orientacoes":"Tudo branco.","imagens":[]}'::jsonb);
end $semente$;
`, { lider_louvor: LIDER_LOUVOR.email, lider_midia: LIDER_MIDIA.email, d0: D0, d1: D1, d2: D2, lia: TOK_LIA, davi: TOK_DAVI, maria: TOK_MARIA });

  pgrst = spawn(PGRST, [], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env,
    PGRST_DB_URI: `postgres://authenticator@127.0.0.1:${PORTA}/${BANCO}`, PGRST_DB_SCHEMAS: 'public',
    PGRST_DB_ANON_ROLE: 'anon', PGRST_JWT_SECRET: SEGREDO, PGRST_DB_EXTRA_SEARCH_PATH: 'public, extensions',
    PGRST_SERVER_HOST: '127.0.0.1', PGRST_SERVER_PORT: String(PORTA_PGRST), PGRST_LOG_LEVEL: 'error' } });
  await esperarHttp(`http://127.0.0.1:${PORTA_PGRST}/`, 30000, 'o PostgREST');
  await new Promise(r => ponte.listen(PORTA_PONTE, '127.0.0.1', r));

  app = spawn(join(RAIZ, 'node_modules/.bin/next'), ['start', '-p', String(PORTA_APP), '-H', '127.0.0.1'], {
    cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', SUPABASE_SERVICE_ROLE: SERVICO, DRESS_CODE_IA_FALSA: '1' },
  });
  app.stdout.on('data', c => { logApp += c; }); app.stderr.on('data', c => { logApp += c; });
  await esperarHttp(`${BASE}/`, 60000, 'o app').catch(e => { console.log(logApp.slice(-800)); throw e; });
}

async function contexto(w, h, toque, quem) {
  const c = await nav.newContext({ viewport: { width: w, height: h }, isMobile: toque, hasTouch: toque, deviceScaleFactor: 2,
    locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => {});
  await c.addInitScript(([cred, chave, sessao]) => {
    try {
      localStorage.setItem('escala.credenciais', cred);
      if (sessao) localStorage.setItem(chave, sessao); else localStorage.removeItem(chave);
    } catch {}
  }, [JSON.stringify({ url: SUPA, key: ANON }), `sb-${new URL(SUPA).hostname.split('.')[0]}-auth-token`, quem ? JSON.stringify(sessaoDe(quem)) : '']);
  return c;
}
async function abrirDia(p, dia) {
  paginaAtual = p;
  await p.goto(`${BASE}/escala?m=${dia.slice(0, 7)}#d${dia}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector(`#d${dia}`, { timeout: 90000 });
  await esperar(1200);
  const d = p.locator(`#d${dia}`);
  if (!(await d.evaluate(e => e.open))) { await d.locator(':scope > summary').click(); await esperar(500); }
  return d;
}
async function abrirDress(p, dia) {
  const d = await abrirDia(p, dia);
  const sec = d.locator('section.es-ec-dc');
  try { await sec.waitFor({ timeout: 20000 }); } catch {
    await p.screenshot({ path: `${OUT}/falhou-dia-${dia}.png`, fullPage: true }).catch(() => {});
    throw new Error(`o dia ${dia} abriu sem o dress code: ${(await d.innerText().catch(() => '')).slice(0, 500)}`);
  }
  return { d, sec };
}
const textoDe = async (loc) => ((await loc.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const dressNoBanco = (dia, slug = 'louvor') => JSON.parse(sql(`select coalesce((select o.dress_code from culto_obs o join cultos c on c.id = o.culto_id
  join equipes q on q.id = o.equipe_id where c.data = :'d'::date and c.evento is null and q.slug = :'s'), 'null')`, { d: dia, s: slug }) || 'null');
const objetos = () => JSON.parse(sql(`select coalesce(json_agg(json_build_object('nome', name, 'dono', owner, 'tipo', metadata->>'mimetype') order by created_at), '[]')
  from storage.objects where bucket_id = :'b'`, { b: BALDE }));
const semRolagem = p => p.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1);
async function escolherArquivos(p, botao, arquivos) {
  const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 10000 }), botao.click()]);
  await fc.setFiles(arquivos.map(a => join(OUT, a)));
}

try {
  fazerFotos();
  await subir();
  const LOUVOR = sql(`select id from equipes where slug = 'louvor'`);
  const MIDIA = sql(`select id from equipes where slug = 'midia'`);
  const CULTO1 = sql(`select id from cultos where data = :'d'::date and evento is null`, { d: D1 });
  console.log(`· domingos ${D0} (passou), ${D1} e ${D2}; Louvor ${LOUVOR}`);
  nav = await chromium.launch({ executablePath: chromeDoContainer(), env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });

  /* ===================================== A · a liderança do Louvor, no celular */
  let dress1 = null;
  {
    const c = await contexto(390, 844, true, LIDER_LOUVOR); const p = await c.newPage();
    const erros = []; p.on('pageerror', e => erros.push(String(e)));
    const { d, sec } = await abrirDress(p, D1);
    const fechado = await textoDe(sec);
    ok(/Definir o dress code/.test(fechado) && fechado.includes(`Repetir o de ${ddmm(D0)}`),
      `A: sem dress code, "Definir o dress code" e "Repetir o de ${ddmm(D0)}" (o culto que já teve)`, fechado);
    await sec.getByRole('button', { name: 'Definir o dress code' }).click();
    const form = sec.locator('form.es-ec-dc-ed');
    await form.waitFor({ timeout: 10000 });
    ok(await p.evaluate(() => document.activeElement?.textContent?.trim()) === 'Definir o dress code', 'A: o foco vai para o título do formulário');

    /* as cores: da paleta, uma personalizada e a segunda combinação */
    await form.getByRole('button', { name: 'Azul-marinho', exact: true }).click();
    await form.getByRole('button', { name: 'Bege', exact: true }).click();
    ok(await form.locator('.es-ec-dc-escolhida').count() === 2
      && await form.getByRole('button', { name: 'Azul-marinho', exact: true }).getAttribute('aria-pressed') === 'true',
      'A: tocar na cor da paleta põe a cor, e a amostra fica marcada');
    await form.getByRole('button', { name: 'Bege', exact: true }).click();
    ok(await form.locator('.es-ec-dc-escolhida').count() === 1, 'A: tocar de novo tira');
    await form.getByRole('button', { name: 'Bege', exact: true }).click();
    await form.getByRole('button', { name: 'Outra cor' }).click();
    await form.locator('input[type="color"]').fill('#7fc8c0');
    const sugerido = await form.getByLabel('Nome da cor').inputValue();
    ok(sugerido.length > 0 && sugerido !== 'Preto', 'A: a cor personalizada já vem com o nome da cor da paleta mais perto', sugerido);
    await form.getByLabel('Nome da cor').fill('Verde-água');
    await form.getByRole('button', { name: 'Acrescentar', exact: true }).click();
    const nomes1 = await form.locator('.es-ec-dc-escolhida-nome').allTextContents();
    ok(nomes1.join('|') === 'Azul-marinho|Bege|Verde-água', 'A: as três cores da primeira combinação, com o nome escrito', nomes1.join('|'));
    await form.getByRole('button', { name: 'Outra combinação' }).click();
    await form.getByRole('button', { name: 'Preto', exact: true }).click();
    ok(await form.locator('li.es-ec-dc-comb').count() === 2 && await form.locator('li.es-ec-dc-comb-ativa').count() === 1,
      'A: a segunda combinação, com a paleta dentro dela');
    await form.getByRole('button', { name: 'Esporte fino' }).click();
    await form.getByLabel('Orientações').fill('Camisa lisa, sem estampa.\nTênis branco.');

    /* as alvos de toque do celular */
    const caixas = await form.locator('.es-ec-dc-tinta').evaluateAll(es => es.map(e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }));
    const chips = await form.locator('.es-ec-dc-escolhida').evaluateAll(es => es.map(e => e.getBoundingClientRect().height));
    ok(caixas.length === 28 && caixas.every(([w, h]) => w >= 44 && h >= 44) && chips.every(h => h >= 44),
      'A: as 28 amostras da paleta e as cores escolhidas com 44 de toque', JSON.stringify({ caixas: caixas.slice(0, 3), chips }));

    /* as fotos: escolher mostra na hora e não sobe nada */
    await escolherArquivos(p, form.getByRole('button', { name: 'Enviar fotos' }), ['foto-grande.jpg', 'transparente.png', 'sai.jpg']);
    await form.locator('li.es-ec-dc-img img').nth(2).waitFor({ timeout: 20000 });
    await esperar(400);
    const prontas = await form.locator('li.es-ec-dc-img img').evaluateAll(is => is.map(i => i.complete && i.naturalWidth > 0));
    ok(prontas.length === 3 && prontas.every(Boolean) && await form.locator('.es-ec-dc-selo', { hasText: 'Nova' }).count() === 3 && envios.length === 0,
      'A: as três fotos aparecem na hora, marcadas "Nova", e nada subiu ainda', JSON.stringify({ prontas, envios: envios.length }));

    /* a IA, para a segunda combinação */
    await form.getByRole('combobox').selectOption({ label: 'combinação 2' });
    await form.getByRole('button', { name: 'Gerar com IA' }).click();
    await form.locator('.es-ec-dc-selo', { hasText: 'IA' }).waitFor({ timeout: 40000 }).catch(() => {});
    const ia = envios.find(e => e.papel === 'service_role');
    ok(!!ia && ia.status === 200 && ia.tipo === 'image/png' && new RegExp(`^${LOUVOR}/${UUID}\\.png$`).test(ia.nome),
      'A: a imagem da IA sobe pela rota, com a chave do servidor, na pasta do Louvor', JSON.stringify(envios) + '\n' + logApp.slice(-400));
    ok(!!ia && perto(medir(armario.get(ia.nome).dados).meio, [17, 17, 17]), 'A: e é das cores da combinação escolhida (o Preto da segunda)');
    ok(sql(`select count(*) from dress_code_geracoes where equipe_id = :'l'`, { l: LOUVOR }) === '1', 'A: o banco contou a geração');
    ok(/Restam 11 imagens/.test(await textoDe(form.locator(`[id$="-ia"]`))), 'A: e a tela diz quantas restam', await textoDe(form.locator(`[id$="-ia"]`)));

    /* trocar a terceira, e uma quinta que entra e sai antes de salvar */
    await escolherArquivos(p, form.getByRole('button', { name: 'Trocar a inspiração 3' }), ['troca.jpg']);
    await esperar(1200);
    await escolherArquivos(p, form.getByRole('button', { name: 'Enviar fotos' }), ['outra.jpg']);
    await form.locator('li.es-ec-dc-img').nth(4).waitFor({ timeout: 10000 });
    await form.getByRole('button', { name: 'Tirar a inspiração 5' }).click();
    const selos = await form.locator('li.es-ec-dc-img').evaluateAll(ls => ls.map(l => l.querySelector('.es-ec-dc-selo')?.textContent || ''));
    ok(JSON.stringify(selos) === JSON.stringify(['Nova', 'Nova', 'Nova', 'IA']), 'A: quatro inspirações: três fotos novas e a da IA', JSON.stringify(selos));
    /* arquivo que não é foto: a frase, e nada entra */
    await escolherArquivos(p, form.getByRole('button', { name: 'Enviar fotos' }), ['nao-e-foto.jpg']);
    await esperar(1200);
    ok(/Não consegui abrir essa imagem/.test(await textoDe(form.locator('.es-ec-dc-erro'))) && await form.locator('li.es-ec-dc-img').count() === 4,
      'A: arquivo que não é imagem: a frase diz, e nada entra', await textoDe(form.locator('.es-ec-dc-erro')));

    /* a prévia da mensagem */
    await form.locator('details.es-ec-dc-msg > summary').click();
    const previa = (await form.locator('details.es-ec-dc-msg pre').textContent()) || '';
    ok(previa === ['DRESS CODE', 'Azul-marinho + Bege + Verde-água', 'ou Preto', 'Esporte fino. Camisa lisa, sem estampa. Tênis branco.',
      `Cores e inspirações: ${BASE.replace(/^https?:\/\//, '')}/dress/… (o link nasce quando você salva)`].join('\n'),
      'A: a prévia da mensagem do grupo, linha por linha', previa);
    ok(await semRolagem(p), 'A: o formulário não rola de lado no celular');
    await form.screenshot({ path: `${OUT}/A-formulario-390.png` });
    /* o telefone de 320 (a menor tela que a casa mede): nada sai pela direita */
    await p.setViewportSize({ width: 320, height: 700 });
    await esperar(400);
    const fora320 = await form.evaluate(f => [...f.querySelectorAll('*')].filter(e => {
      const b = e.getBoundingClientRect(); return b.width > 0 && b.right > innerWidth + 1; }).map(e => e.className).slice(0, 6));
    ok(await semRolagem(p) && fora320.length === 0, 'A: em 320 px, o formulário inteiro cabe (nada sai pela direita)', JSON.stringify(fora320));
    await form.screenshot({ path: `${OUT}/A-formulario-320.png` });
    await p.setViewportSize({ width: 390, height: 844 });
    await esperar(300);

    await form.getByRole('button', { name: 'Salvar o dress code' }).click();
    await sec.locator('.es-ec-dc-resumo').waitFor({ timeout: 30000 }).catch(() => {});
    const ups = envios.filter(e => e.papel === 'authenticated');
    ok(ups.length === 3 && ups.every(e => e.status === 200 && e.tipo === 'image/webp' && e.email === LIDER_LOUVOR.email),
      'A: o Salvar sobe as três fotos que ficaram (a que saiu e a torta não), em WebP, com o JWT de quem enviou', JSON.stringify(envios));
    ok(ups.every(e => new RegExp(`^${LOUVOR}/${UUID}\\.webp$`).test(e.nome) && e.tamanho < 600 * 1024), 'A: na pasta do Louvor, nomes que não se adivinham, leves');
    dress1 = dressNoBanco(D1);
    const cam = (dress1?.imagens || []).map(i => i.caminho);
    ok(dress1 && dress1.v === 1 && new RegExp(`^${UUID}$`).test(dress1.id) && typeof dress1.atualizado_em === 'string'
      && JSON.stringify(dress1.combinacoes) === JSON.stringify([{ cores: [{ hex: '#1f2a44', nome: 'Azul-marinho' }, { hex: '#e3d5bd', nome: 'Bege' }, { hex: '#7fc8c0', nome: 'Verde-água' }] }, { cores: [{ hex: '#111111', nome: 'Preto' }] }])
      && dress1.estilo === 'esporte-fino' && dress1.orientacoes === 'Camisa lisa, sem estampa.\nTênis branco.',
      'A: o banco guarda as cores, as combinações, o estilo e as orientações (com a quebra de linha)', JSON.stringify(dress1));
    ok(cam.length === 4 && cam[3] === ia?.nome && dress1.imagens[3].ia === true && dress1.imagens.slice(0, 3).every(i => !('ia' in i))
      && new Set(cam.slice(0, 3)).size === 3 && cam.slice(0, 3).every(x => ups.some(u => u.nome === x)),
      'A: e as quatro imagens, na ordem da tela, a da IA marcada', JSON.stringify(dress1?.imagens));
    const m0 = cam[0] && medir(armario.get(cam[0]).dados), m1 = cam[1] && medir(armario.get(cam[1]).dados), m2 = cam[2] && medir(armario.get(cam[2]).dados);
    ok(m0 && m0.formato === 'WEBP' && m0.w === 1200 && m0.h === 1600 && perto(m0.canto, [227, 213, 189], 20),
      'A: a foto de 4000 px deitada no arquivo e de pé na câmera chega com 1200 × 1600, de pé', JSON.stringify(m0));
    ok(m1 && m1.w === 800 && m1.h === 800 && perto(m1.canto, [255, 255, 255]) && perto(m1.meio, [17, 17, 17]),
      'A: o PNG transparente chega com o fundo branco', JSON.stringify(m1));
    ok(m2 && m2.w === 1200 && m2.h === 900 && perto(m2.meio, [192, 88, 59], 16), 'A: a trocada é a que entrou no lugar', JSON.stringify(m2));
    const obj = objetos();
    ok(obj.length === 4 && obj.filter(o => o.dono === LIDER_LOUVOR.id).length === 3 && obj.filter(o => o.dono === null).length === 1,
      'A: quatro linhas em storage.objects: três da liderança, uma do servidor', JSON.stringify(obj));

    const resumo = await textoDe(sec.locator('.es-ec-dc-resumo'));
    const ver = await sec.getByRole('link', { name: 'Ver a página' }).getAttribute('href');
    ok(/Azul-marinho \+ Bege \+ Verde-água/.test(resumo) && /ou Preto/.test(resumo) && /Esporte fino · Camisa lisa, sem estampa\. Tênis branco\./.test(resumo)
      && await sec.locator('.es-ec-dc-minis img').count() === 4 && ver === `${BASE}/dress/${dress1?.id}`,
      'A: o resumo fecha com as cores, o estilo, as orientações, as miniaturas e o link', `${resumo} | ${ver}`);
    ok(await p.evaluate(() => document.activeElement?.textContent?.trim()) === 'Editar o dress code', 'A: o foco volta para o bloco');
    await sec.screenshot({ path: `${OUT}/A-resumo-390.png` });

    /* ============================ B · a mensagem do grupo leva o bloco */
    await d.getByRole('button', { name: 'Copiar a escala' }).first().click();
    await esperar(600);
    const msg = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
    const bloco = ['DRESS CODE', 'Azul-marinho + Bege + Verde-água', 'ou Preto', 'Esporte fino. Camisa lisa, sem estampa. Tênis branco.',
      `Cores e inspirações: ${BASE}/dress/${dress1?.id}`].join('\n');
    ok(msg.includes(bloco), 'B: "Copiar a escala" leva o bloco DRESS CODE com o link das cores e das inspirações', msg);
    ok(msg.indexOf('DRESS CODE') > msg.indexOf('Lia') && msg.lastIndexOf('/confirmar/louvor') > msg.indexOf('DRESS CODE'),
      'B: o bloco vem depois da escala e antes do rodapé com o link de confirmar');
    ok(erros.length === 0, 'A: sem erro de script na página', erros.join(' | '));
    await c.close();
  }

  /* ====================================== C · quem serve vê, no próprio link */
  for (const [w, h, toque] of [[390, 844, true], [320, 640, true], [1440, 900, false]]) {
    const c = await contexto(w, h, toque, null); const p = await c.newPage();
    const erros = []; p.on('pageerror', e => erros.push(String(e)));
    await p.goto(`${BASE}/eu/${TOK_LIA}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#dress-code', { timeout: 90000 }).catch(() => {});
    await esperar(800);
    const s = p.locator('#dress-code');
    const dias = await s.locator('.vol-rep-dia').allTextContents();
    const cores = await s.locator('.dc-nome').allTextContents();
    ok(JSON.stringify(dias) === JSON.stringify([longo(D1)]) && cores.join('|') === 'Azul-marinho|Bege|Verde-água|Preto' && await s.locator('.dc-ou').count() === 1,
      `C ${w}: o dress code do domingo em que a Lia serve, com as quatro cores e o "ou"`, JSON.stringify({ dias, cores }));
    ok(await textoDe(s.locator('.dc-estilo')) === 'Esporte fino' && (await s.locator('.dc-ori').textContent()) === 'Camisa lisa, sem estampa.\nTênis branco.',
      `C ${w}: o estilo e as orientações, com a quebra de linha`);
    await s.locator('.dc-mini img').last().scrollIntoViewIfNeeded();
    await esperar(800);
    const imgs = await s.locator('.dc-mini img').evaluateAll(is => is.map(i => i.complete && i.naturalWidth > 0));
    const alvo = await s.locator('.dc-mini').evaluateAll(bs => bs.map(b => b.getBoundingClientRect().height));
    ok(imgs.length === 4 && imgs.every(Boolean) && await s.locator('.dc-ia').count() === 1 && alvo.every(x => x >= 44),
      `C ${w}: as quatro inspirações abrem do armário, a da IA marcada`, JSON.stringify({ imgs, alvo }));
    const colunas = await s.locator('.dc-galeria').evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length);
    ok(colunas === (w < 600 ? 2 : 3), `C ${w}: ${w < 600 ? 'duas' : 'três'} colunas de inspirações`, String(colunas));
    /* abrir inteira, passar, fechar */
    await s.getByRole('button', { name: 'Ver a inspiração 2 de 4' }).click();
    const dlg = p.getByRole('dialog', { name: /Inspiração/ });
    await dlg.waitFor({ timeout: 5000 });
    const src2 = await dlg.locator('img').getAttribute('src');
    ok(src2 === `${SUPA}/storage/v1/object/public/${BALDE}/${dress1?.imagens[1].caminho}` && /2 de 4/.test(await textoDe(dlg)),
      `C ${w}: tocar na miniatura abre a imagem inteira`, String(src2));
    /* NA TELA, e por cima de tudo: a primeira versão ficava presa ao bloco
       da página (a animação de entrada do .vol-in), com o Fechar lá no alto */
    await esperar(300);
    const naTela = await p.evaluate(() => {
      const caixa = document.querySelector('.dc-inteira');
      const img = caixa?.querySelector('img');
      const fechar = caixa?.querySelector('.dc-inteira-fechar');
      if (!caixa || !img || !fechar) return null;
      const r = e => e.getBoundingClientRect();
      const dentro = b => b.top >= 0 && b.left >= 0 && b.bottom <= innerHeight && b.right <= innerWidth && b.width > 0 && b.height > 0;
      const bi = r(img), bf = r(fechar), bc = r(caixa);
      const meio = document.elementFromPoint(bi.left + bi.width / 2, bi.top + bi.height / 2);
      return { caixa: Math.round(bc.width) === innerWidth && Math.round(bc.height) === innerHeight && bc.top === 0,
        img: dentro(bi), fechar: dentro(bf), porCima: meio === img, noBody: caixa.parentElement === document.body,
        /* o modal do navegador: a página de trás fica inerte para o leitor de tela */
        modal: caixa.matches(':modal'),
        largura: Math.round(bi.width) };
    });
    ok(!!naTela && naTela.caixa && naTela.img && naTela.fechar && naTela.porCima && naTela.noBody && naTela.modal,
      `C ${w}: a imagem inteira cobre a tela (e só a tela), com a foto e o Fechar à vista, por cima de tudo`, JSON.stringify(naTela));
    if (toque) await p.screenshot({ path: `${OUT}/C-inteira-${w}.png` });
    /* o Tab não sai da caixa: nem depois do último botão, nem depois de um
       toque na foto (que tira o foco do botão) */
    await dlg.locator('img').click();
    let fora = 0;
    for (let k = 0; k < 7; k++) {
      await p.keyboard.press(k === 3 ? 'Shift+Tab' : 'Tab');
      if (!(await p.evaluate(() => !!document.querySelector('.dc-inteira')?.contains(document.activeElement)))) fora++;
    }
    ok(fora === 0 && await dlg.count() === 1, `C ${w}: o Tab gira dentro da imagem inteira (a página de trás fica fora)`, `fora ${fora}`);
    await p.keyboard.press('ArrowRight');
    await dlg.getByRole('button', { name: 'Próxima' }).click();
    ok(/4 de 4/.test(await textoDe(dlg)), `C ${w}: a seta do teclado e o botão passam para a próxima`);
    await p.keyboard.press('Escape');
    await esperar(300);
    ok(await dlg.count() === 0 && await p.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Ver a inspiração 4 de 4 (gerada por IA)',
      `C ${w}: Esc fecha, e o foco volta para a miniatura da imagem que estava aberta`);
    ok(await semRolagem(p), `C ${w}: a página não rola de lado`);
    ok(erros.length === 0, `C ${w}: sem erro de script`, erros.join(' | '));
    await s.screenshot({ path: `${OUT}/C-quem-serve-${w}.png` });
    await c.close();
  }
  {
    /* Davi serve só no segundo domingo, que ainda não tem dress code */
    const c = await contexto(390, 844, true, null); const p = await c.newPage();
    await p.goto(`${BASE}/eu/${TOK_DAVI}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.vol-secao', { timeout: 90000 }).catch(() => {});
    await esperar(2500);
    ok(await p.locator('#dress-code').count() === 0, 'C: quem não serve no culto do dress code não vê nada');
    await c.close();
  }

  /* =============================== D · o link do grupo, sem login */
  {
    const c = await contexto(390, 844, true, null); const p = await c.newPage();
    const erros = []; p.on('pageerror', e => erros.push(String(e)));
    const resp = await p.goto(`${BASE}/dress/${dress1?.id}`, { waitUntil: 'domcontentloaded' });
    await p.locator('.dc-cab h1').waitFor({ timeout: 30000 }).catch(() => {});
    await esperar(600);
    const titulo = `Dress code · ${longo(D1).replace(/^d/, 'D')}`;
    ok(await textoDe(p.locator('.dc-cab .rot')) === 'Dress code · Louvor' && await textoDe(p.locator('.dc-cab h1')) === longo(D1)
      && await textoDe(p.locator('.dc-cab .vol-sub')) === 'Culto às 10h', 'D: o chapéu com o ministério, o dia e a hora', await textoDe(p.locator('.dc-cab')));
    ok((await p.locator('.dc-nome').allTextContents()).length === 4 && await p.locator('.dc-mini').count() === 4, 'D: as cores e as inspirações, sem login');
    ok(await p.title() === `${titulo} · GUIA Servir`, 'D: o título da aba', await p.title());
    ok((resp?.headers()['x-robots-tag'] || '').includes('noindex'), 'D: o endereço não se indexa (X-Robots-Tag)', resp?.headers()['x-robots-tag']);
    ok(await semRolagem(p) && erros.length === 0, 'D: sem rolar de lado, sem erro de script', erros.join(' | '));
    await p.screenshot({ path: `${OUT}/D-link-do-grupo-390.png`, fullPage: true });
    /* o HTML que a prévia do WhatsApp lê (sem executar nada) */
    const html = await (await fetch(`${BASE}/dress/${dress1?.id}`)).text();
    ok(html.includes(`<title>${titulo} · GUIA Servir</title>`) && html.includes('content="Azul-marinho + Bege + Verde-água ou Preto · Esporte fino"')
      && /<meta name="robots" content="noindex, nofollow, nocache"/.test(html) && html.includes('og-sistema.jpg'),
      'D: a prévia do WhatsApp: o título com o dia, as cores embaixo, o cartão do sistema, e noindex', html.match(/<title>[^<]*<\/title>/)?.[0]);
    /* id em maiúsculas abre; torto e de culto antigo, não */
    await p.goto(`${BASE}/dress/${dress1?.id.toUpperCase()}`, { waitUntil: 'domcontentloaded' });
    await p.locator('.dc-cab h1').waitFor({ timeout: 20000 }).catch(() => {});
    ok(await p.locator('.dc-cab h1').count() === 1, 'D: o id em maiúsculas (o WhatsApp não muda, mas quem digita pode) abre');
    for (const [rot, id] of [['torto', 'nao-e-um-id'], ['que não existe', randomUUID()], ['de culto de duas semanas atrás', dressNoBanco(D0)?.id]]) {
      await p.goto(`${BASE}/dress/${id}`, { waitUntil: 'domcontentloaded' });
      await p.getByRole('heading', { name: 'Este link não abre um dress code' }).waitFor({ timeout: 20000 }).catch(() => {});
      ok(await p.getByRole('heading', { name: 'Este link não abre um dress code' }).count() === 1, `D: link ${rot}: "Este link não abre um dress code"`);
    }
    const robots = await (await fetch(`${BASE}/robots.txt`)).text();
    ok(/Disallow: \/dress\//.test(robots), 'D: o robots.txt pede para não rastrear /dress/');
    const pub = (await rpcComo(ANON, 'dress_code_publico', { p_id: dress1?.id })).corpo;
    ok(pub?.ok === true && JSON.stringify(Object.keys(pub).sort()) === JSON.stringify(['data', 'dress', 'equipe', 'evento', 'inicio', 'ok']),
      'D: a porta pública devolve só o dia, o ministério e o dress code (sem nome nem telefone)', JSON.stringify(Object.keys(pub || {})));
    await c.close();
  }

  /* ===================== E · no computador: repetir, MUDOU, tirar */
  {
    const c = await contexto(1440, 900, false, LIDER_LOUVOR); const p = await c.newPage();
    const erros = []; p.on('pageerror', e => erros.push(String(e)));
    const { sec } = await abrirDress(p, D2);
    const antesDeRepetir = envios.length;
    await sec.getByRole('button', { name: new RegExp(`^Repetir o dress code de ${ddmm(D1)}`) }).click();
    const form = sec.locator('form.es-ec-dc-ed');
    await form.waitFor({ timeout: 10000 });
    const nomes = await form.locator('.es-ec-dc-escolhida-nome').allTextContents();
    ok(nomes.join('|') === 'Azul-marinho|Bege|Verde-água|Preto' && await form.locator('li.es-ec-dc-img').count() === 4
      && await form.locator('.es-ec-dc-selo', { hasText: 'Nova' }).count() === 0,
      `E: "Repetir o de ${ddmm(D1)}" traz as cores e as mesmas imagens (nada para subir)`, nomes.join('|'));
    const fichas = await form.locator('.es-ec-dc-parte').first().locator('.es-ficha').allTextContents();
    ok(fichas.map(t => t.trim()).join('|') === `${ddmm(D1)}|${ddmm(D0)}`, 'E: e os cultos anteriores para escolher, do mais novo para o mais velho', fichas.join('|'));
    await form.getByRole('button', { name: 'Social' }).click();
    await form.screenshot({ path: `${OUT}/E-formulario-1440.png` });
    await form.getByRole('button', { name: 'Salvar o dress code' }).click();
    await sec.locator('.es-ec-dc-resumo').waitFor({ timeout: 30000 }).catch(() => {});
    const dress2 = dressNoBanco(D2);
    ok(dress2 && dress2.id !== dress1?.id && dress2.estilo === 'social' && JSON.stringify(dress2.imagens) === JSON.stringify(dress1?.imagens) && envios.length === antesDeRepetir,
      'E: o segundo domingo ganha o próprio dress code (outro id, o link é outro), com as mesmas imagens e sem subir nada', JSON.stringify(dress2));
    const lia = (await rpcComo(ANON, 'eu_dress_codes', { p_token: TOK_LIA })).corpo || [];
    const davi = (await rpcComo(ANON, 'eu_dress_codes', { p_token: TOK_DAVI })).corpo || [];
    ok(lia.length === 2 && davi.length === 1 && davi[0].dress?.id === dress2?.id, 'E: cada culto com o seu: a Lia vê os dois, o Davi só o dele',
      JSON.stringify({ lia: lia.length, davi: davi.length }));

    /* MUDOU: outra pessoa grava enquanto o formulário está aberto */
    await sec.getByRole('button', { name: 'Editar o dress code' }).click();
    await form.waitFor({ timeout: 10000 });
    sql(`update culto_obs set dress_code = dress_code || jsonb_build_object('orientacoes', 'Mudou por outra pessoa.')
          where culto_id = (select id from cultos where data = :'d'::date and evento is null) and equipe_id = :'l'`, { d: D2, l: LOUVOR });
    await form.getByLabel('Orientações').fill('A minha versão.');
    await form.getByRole('button', { name: 'Salvar o dress code' }).click();
    await form.locator('.es-aviso').waitFor({ timeout: 15000 }).catch(() => {});
    ok(/Outra pessoa da liderança salvou um dress code deste culto agora há pouco/.test(await textoDe(form.locator('.es-aviso')))
      && dressNoBanco(D2)?.orientacoes === 'Mudou por outra pessoa.' && await form.getByLabel('Orientações').inputValue() === 'A minha versão.',
      'E: MUDOU: a tela avisa, o banco fica com a versão da outra pessoa, e o rascunho continua ali', await textoDe(form.locator('.es-aviso')));
    await form.getByRole('button', { name: 'Salvar o meu' }).click();
    await sec.locator('.es-ec-dc-resumo').waitFor({ timeout: 15000 }).catch(() => {});
    ok(dressNoBanco(D2)?.orientacoes === 'A minha versão.' && dressNoBanco(D2)?.id === dress2?.id, 'E: "Salvar o meu" grava por cima, de olhos abertos (o id do link é o mesmo)');

    /* tirar */
    await sec.getByRole('button', { name: 'Editar o dress code' }).click();
    await form.waitFor({ timeout: 10000 });
    await form.getByRole('button', { name: 'Tirar o dress code' }).click();
    await p.locator('dialog[open] [data-sim]').click();
    await sec.getByRole('button', { name: 'Definir o dress code' }).waitFor({ timeout: 15000 }).catch(() => {});
    ok(dressNoBanco(D2) === null && await sec.getByRole('button', { name: 'Definir o dress code' }).count() === 1,
      'E: "Tirar o dress code" (com a confirmação) tira do banco e a tela volta a "Definir"');
    ok((await rpcComo(ANON, 'dress_code_publico', { p_id: dress2?.id })).corpo?.ok === false && dressNoBanco(D1)?.id === dress1?.id,
      'E: o link do segundo domingo deixa de abrir, e o primeiro continua');
    ok(erros.length === 0, 'E: sem erro de script', erros.join(' | '));
    await c.close();
  }

  /* ========================================= F · quem não deve, não grava */
  {
    const tMidia = tokenDe(LIDER_MIDIA), tLouvor = tokenDe(LIDER_LOUVOR);
    const rascunho = { combinacoes: [{ cores: [{ hex: '#111111', nome: 'Preto' }] }], estilo: null, orientacoes: '', imagens: [] };
    const r1 = await rpcComo(tMidia, 'salvar_dress_code', { p_culto: CULTO1, p_equipe: LOUVOR, p_dress: rascunho, p_antes: null });
    const r2 = await rpcComo(tMidia, 'salvar_dress_code', { p_culto: CULTO1, p_equipe: MIDIA, p_dress: rascunho, p_antes: null });
    const r3 = await rpcComo(ANON, 'salvar_dress_code', { p_culto: CULTO1, p_equipe: LOUVOR, p_dress: rascunho, p_antes: null });
    ok(r1.corpo?.erro === 'SEM_PERMISSAO' && r2.corpo?.erro === 'SO_LOUVOR' && r3.http >= 400,
      'F: a liderança da Mídia não grava no Louvor (SEM_PERMISSAO) nem na Mídia (SO_LOUVOR); quem não entrou nem chama',
      JSON.stringify([r1.corpo, r2.corpo, r3.http]));
    ok(dressNoBanco(D1)?.id === dress1?.id && dressNoBanco(D1, 'midia') === null, 'F: e nada mudou');
    /* direto na tabela, como a liderança: o gatilho e a conferência barram */
    const comoQuem = (p, corpo) => sqlFalha(`begin;
select set_config('request.jwt.claims', :'claims', true) is not null as _;
set local role authenticated;
${corpo}
commit;`, { claims: JSON.stringify({ role: 'authenticated', sub: p.id, email: p.email }), c: CULTO1, l: LOUVOR, m: MIDIA });
    const t1 = comoQuem(LIDER_MIDIA, `insert into culto_obs (culto_id, equipe_id, dress_code) values (:'c', :'m',
      '{"combinacoes":[{"cores":[{"hex":"#111111","nome":"Preto"}]}],"imagens":[]}'::jsonb)
      on conflict (culto_id, equipe_id) do update set dress_code = excluded.dress_code;`);
    const t2 = comoQuem(LIDER_LOUVOR, `update culto_obs set dress_code = dress_code || jsonb_build_object('imagens',
      jsonb_build_array(jsonb_build_object('caminho', :'m' || '/' || gen_random_uuid() || '.webp'))) where culto_id = :'c' and equipe_id = :'l';`);
    ok(/DRESS_SO_LOUVOR/.test(t1) && /culto_obs_dress_code_ok/.test(t2),
      'F: escrevendo direto na tabela: a Mídia não ganha dress code (o gatilho), e imagem de outra pasta não entra (a conferência)', `${t1.slice(0, 160)} | ${t2.slice(0, 160)}`);
    /* o armário */
    const antes = objetos().length;
    const webp = Buffer.from('RIFF\x1a\x00\x00\x00WEBPVP8L\x0d\x00\x00\x00\x2f\x00\x00\x00\x10\x07\x10\x11\x11\x88\x88\xfe\x07\x00', 'binary');
    const novo = eq => `${eq}/${randomUUID()}.webp`;
    const casos = [
      ['a liderança da Mídia, na pasta do Louvor', tMidia, novo(LOUVOR), webp, 'image/webp', 403],
      ['a liderança do Louvor, na pasta da Mídia', tLouvor, novo(MIDIA), webp, 'image/webp', 403],
      ['quem não entrou (a chave pública)', ANON, novo(LOUVOR), webp, 'image/webp', 403],
      ['nome fora do formato', tLouvor, `${LOUVOR}/foto.webp`, webp, 'image/webp', 403],
      ['extensão que não é de imagem', tLouvor, `${LOUVOR}/${randomUUID()}.pdf`, webp, 'image/webp', 403],
      ['GIF', tLouvor, novo(LOUVOR), webp, 'image/gif', 415],
      ['mais de 5 MB', tLouvor, novo(LOUVOR), Buffer.alloc(5 * 1024 * 1024 + 1, 65), 'image/webp', 413],
      ['por cima de uma que já existe', tLouvor, dress1?.imagens[0].caminho, webp, 'image/webp', 409],
    ];
    for (const [rotulo, token, nome, dados, tipo, esperado] of casos) {
      const r = await enviarDireto(token, nome, dados, tipo);
      ok(r.http === 400 && r.corpo.statusCode === String(esperado), `F: armário, ${rotulo}: recusado (${esperado})`, JSON.stringify(r));
    }
    ok(objetos().length === antes, 'F: nenhuma tentativa recusada deixou linha no armário');
    /* a rota da IA */
    const gerar = (token, equipe) => fetch(`${BASE}/api/dress-code/gerar`, { method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ equipe, combinacao: 0, rascunho: { combinacoes: rascunho.combinacoes, estilo: null, orientacoes: '' } }) })
      .then(async r => ({ http: r.status, corpo: await r.json().catch(() => null) }));
    const g1 = await gerar(null, LOUVOR), g2 = await gerar(tMidia, LOUVOR), g3 = await gerar(tMidia, MIDIA);
    ok(g1.http === 401 && g2.http === 403 && g2.corpo?.erro === 'SEM_PERMISSAO' && g3.http === 403 && g3.corpo?.erro === 'SO_LOUVOR',
      'F: a IA: sem login 401; a Mídia não gera para o Louvor nem para si', JSON.stringify([g1, g2, g3]));
    sql(`insert into dress_code_geracoes (equipe_id, por) select :'l', 'prova' from generate_series(1, 11)`, { l: LOUVOR });
    const g4 = await gerar(tLouvor, LOUVOR);
    ok(g4.http === 429 && g4.corpo?.erro === 'LIMITE' && sql(`select count(*) from dress_code_geracoes where equipe_id = :'l'`, { l: LOUVOR }) === '12',
      'F: a IA: no limite de 12 em 24 horas, 429, e nada é gerado nem contado', JSON.stringify(g4));
    {
      const c = await contexto(390, 844, true, LIDER_LOUVOR); const p = await c.newPage();
      const { sec } = await abrirDress(p, D1);
      await sec.getByRole('button', { name: 'Editar o dress code' }).click();
      const form = sec.locator('form.es-ec-dc-ed');
      await form.waitFor({ timeout: 10000 });
      const antesIa = envios.length;
      await form.getByRole('button', { name: 'Gerar com IA' }).click();
      await form.locator('.es-ec-dc-erro').waitFor({ timeout: 20000 }).catch(() => {});
      ok(/Chegou ao limite de 12 imagens geradas em 24 horas/.test(await textoDe(form.locator('.es-ec-dc-erro')))
        && /acabou/.test(await textoDe(form.locator(`[id$="-ia"]`))) && envios.length === antesIa,
        'F: na tela, o limite da IA vira a frase, e nada sobe', await textoDe(form.locator('.es-ec-dc-erro')));
      await c.close();
    }
    /* a Mídia continua sem dress code nenhum, e a mensagem dela, igual */
    {
      const c = await contexto(390, 844, true, LIDER_MIDIA); const p = await c.newPage();
      const d = await abrirDia(p, D1);
      await esperar(1500);
      ok(await d.locator('section.es-ec-dc').count() === 0, 'F: na escala da Mídia não existe dress code');
      await d.getByRole('button', { name: 'Copiar a escala' }).first().click();
      await esperar(600);
      const msg = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
      ok(msg.includes('Maria') && !msg.includes('DRESS CODE') && !msg.includes('/dress/'), 'F: e a mensagem da Mídia sai como sempre saiu', msg.slice(0, 300));
      await c.close();
    }
    const maria = (await rpcComo(ANON, 'eu_dress_codes', { p_token: TOK_MARIA })).corpo;
    ok(Array.isArray(maria) && maria.length === 0, 'F: quem serve na Mídia não recebe dress code', JSON.stringify(maria));
  }
} catch (e) {
  falhas++; console.log('  FALHOU (exceção)', e?.stack || e);
  console.log(logApp.slice(-1200));
  if (paginaAtual) {
    await paginaAtual.screenshot({ path: `${OUT}/falhou.png`, fullPage: true }).catch(() => {});
    const medida = await paginaAtual.evaluate(() => {
      const f = document.querySelector('form.es-ec-dc-ed');
      const r = el => { const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
      return { vw: innerWidth, sw: document.scrollingElement.scrollWidth, form: f && r(f),
        largos: f ? [...f.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(e => `${e.tagName}.${e.className} ${JSON.stringify(r(e))}`) : [] };
    }).catch(err => String(err));
    console.log('  a página:', JSON.stringify(medida, null, 1));
  }
} finally {
  await nav?.close().catch(() => {});
  ponte.close();
  app?.kill('SIGTERM');
  pgrst?.kill('SIGTERM');
}
console.log(`\ndress-code-e2e: ${feitas - falhas}/${feitas} ${falhas ? 'FALHOU' : 'ok'}`);
process.exit(falhas ? 1 : 0);
