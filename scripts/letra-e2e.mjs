/* =============================================================================
   A LETRA EM PDF DE PONTA A PONTA — 111, 05/10/2026

   Roda por `bash scripts/letra-e2e.sh`, que monta o banco com todas as
   migrações. Aqui: a semente, o PostgREST de verdade, a ponte do Storage e o
   navegador. O que esta prova exige:

     A · a liderança do Louvor, no celular, acrescenta a música com compasso,
         minuto e segundo e o PDF da letra: o PDF sobe para a pasta do Louvor
         como `application/pdf`, a linha em `storage.objects` é gravada com o
         papel e o JWT dela (a política da 111 deixou), e a ordem no banco
         guarda compasso, segundos e o caminho da letra;
     B · no culto seguinte, a mesma música vem do banco de músicas com o
         compasso, o tempo e a letra, e salvar NÃO sobe o PDF de novo; trocar
         por um PDF que o aparelho entrega SEM TIPO sobe como PDF; e quem perdeu
         a liderança no meio do caminho vê a frase certa e nada é gravado;
     C · quem serve no culto vê o compasso e o minuto e segundo, toca em
         "Letra" e baixa O MESMO ARQUIVO, com o nome da música (o cabeçalho é
         o que a API do Storage monta hoje);
     D · o dirigente do culto é quem a escala do Louvor pôs no posto
         DIRIGENTE: o link dele mostra "Você dirige o culto";
     E · o armário não abre para quem não deve: Mídia, quem não entrou,
         caminho fora do formato, arquivo que não é PDF, mais de 10 MB e
         gravar por cima. E nenhuma tentativa recusada deixa linha no banco.

   A PONTE DO STORAGE. O serviço do Storage do Supabase não roda aqui. O que
   roda é o que decide: a ponte grava a linha em `storage.objects` numa
   transação com `set local role` e `request.jwt.claims` de quem enviou,
   exatamente o que a API do Storage faz, e a política da 111 aceita ou
   recusa. O tamanho e o tipo vêm do armário (`storage.buckets`), como lá. O
   erro volta no formato da API (HTTP 400 com `statusCode` no corpo).
   ============================================================================= */
import { createServer, request as pedir } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:3500';
const PORTA = Number(process.env.PORTA || 5443);
const BANCO = process.env.BANCO || 'letra';
const PGRST = process.env.PGRST || '/tmp/postgrest-12.2.3/postgrest';
const PORTA_PGRST = Number(process.env.PORTA_PGRST || 54351);
const PORTA_PONTE = Number(process.env.PORTA_PONTE || 54352);
const SUPA = `http://127.0.0.1:${PORTA_PONTE}`;
const SEGREDO = 'segredo-local-da-prova-da-letra-com-mais-de-32-caracteres';
const OUT = '/tmp/letra-e2e';
mkdirSync(OUT, { recursive: true });

const esperar = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0, feitas = 0;
const ok = (c, nome, extra = '') => { feitas++; if (!c) falhas++; console.log(`  ${c ? 'ok ' : 'FALHOU'} ${nome}${!c && extra ? '\n      ' + extra : ''}`); };

/* ------------------------------------------------------------------ banco */
/** SQL pelo psql, com variáveis (`:'nome'`) que o psql cita sozinho */
function sql(texto, vars = {}) {
  const args = ['-h', '/tmp', '-p', String(PORTA), '-U', 'postgres', '-d', BANCO, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'];
  for (const [k, v] of Object.entries(vars)) args.push('-v', `${k}=${v}`);
  return execFileSync('psql', args, { input: texto, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

/* ------------------------------------------------------------------- JWT */
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function assinar(claims) {
  const cab = b64({ alg: 'HS256', typ: 'JWT' }), corpo = b64(claims);
  return `${cab}.${corpo}.${createHmac('sha256', SEGREDO).update(`${cab}.${corpo}`).digest('base64url')}`;
}
/** as claims do token, se a assinatura e a validade conferem (como o Storage faz) */
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
/* o primeiro domingo daqui a pelo menos dois dias, e o seguinte */
let D1 = somar(hoje, 2);
while (new Date(D1 + 'T12:00:00Z').getUTCDay() !== 0) D1 = somar(D1, 1);
const D2 = somar(D1, 7);
const TOK_LIA = 'e2e1e7a0000000000a', TOK_DAVI = 'e2e1e7a0000000000d';

/* ----------------------------------------------------------- os arquivos */
const pdf = texto => Buffer.from(`%PDF-1.4\n% ${texto}\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`);
const PDF1 = pdf('Ousado Amor, a letra'), PDF2 = pdf('Ousado Amor, a letra nova'), PDF3 = pdf('Cancao da Manha');
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/* ===================================================== a ponte do Storage */
const armario = new Map();   // nome -> { dados, tipo, cache }
const envios = [];           // cada tentativa de envio, com o que a ponte decidiu
const CORS = { 'access-control-allow-origin': '*',
  'access-control-expose-headers': 'Content-Range, Content-Disposition, Content-Location, Preference-Applied, Range-Unit' };
function json(res, status, corpo) {
  res.writeHead(status, { ...CORS, 'content-type': 'application/json' });
  res.end(JSON.stringify(corpo));
}
/** o erro como a API do Storage devolve: HTTP 400, o código de verdade no corpo */
const erroDoStorage = (res, codigo, erro, mensagem) => json(res, 400, { statusCode: String(codigo), error: erro, message: mensagem });

/** as partes de um multipart/form-data */
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

function enviar(req, res, nome, corpo) {
  const claims = conferirJwt(req.headers.authorization);
  const reg = { nome, email: claims?.email || '', papel: claims?.role || '', tipo: '', tamanho: 0, status: 0, erro: '' };
  envios.push(reg);
  const recusar = (codigo, erro, msg) => { reg.status = codigo; reg.erro = msg; erroDoStorage(res, codigo, erro, msg); };
  if (!claims) return recusar(403, 'Unauthorized', 'invalid signature');
  const papel = claims.role === 'authenticated' ? 'authenticated' : 'anon';
  /* o armário é lido pelo serviço (o Storage faz `asSuperUser().findBucket`) */
  const balde = JSON.parse(sql(`select coalesce((select row_to_json(b) from storage.buckets b where b.id = 'letras'), 'null')`) || 'null');
  if (!balde) return recusar(404, 'Bucket not found', 'Bucket not found');
  let tipo, dados, cache = '3600';
  if (/^multipart\/form-data/i.test(req.headers['content-type'] || '')) {
    const ps = partes(corpo, req.headers['content-type']);
    const arq = ps.find(p => p.arquivo !== undefined);
    if (!arq) return recusar(400, 'InvalidRequest', 'No file in the request');
    /* O TIPO É O DA PARTE DO FORMULÁRIO, não a opção do storage-js */
    tipo = arq.tipo || 'text/plain'; dados = arq.dados;
    cache = ps.find(p => p.nome === 'cacheControl')?.dados.toString() || cache;
  } else {
    tipo = req.headers['content-type'] || 'text/plain'; dados = corpo;
  }
  reg.tipo = tipo; reg.tamanho = dados.length;
  if (balde.file_size_limit && dados.length > Number(balde.file_size_limit)) {
    return recusar(413, 'Payload too large', 'The object exceeded the maximum allowed size');
  }
  if (Array.isArray(balde.allowed_mime_types) && balde.allowed_mime_types.length && !balde.allowed_mime_types.includes(tipo)) {
    return recusar(415, 'invalid_mime_type', `mime type ${tipo} is not supported`);
  }
  let id = '';
  try {
    id = sql(`begin;
select set_config('request.jwt.claims', :'claims', true) is not null as _;
set local role ${papel};
insert into storage.objects (bucket_id, name, owner, metadata)
  values ('letras', :'nome', nullif(:'dono', '')::uuid, :'meta'::jsonb) returning id;
commit;`, {
      claims: JSON.stringify(claims), nome, dono: papel === 'authenticated' ? claims.sub : '',
      meta: JSON.stringify({ mimetype: tipo, size: dados.length, cacheControl: `max-age=${cache}` }),
    }).split('\n').pop();
  } catch (e) {
    const txt = String(e.stderr || e);
    if (/row-level security/i.test(txt)) return recusar(403, 'Unauthorized', 'new row violates row-level security policy');
    if (/duplicate key/i.test(txt)) return recusar(409, 'Duplicate', 'The resource already exists');
    return recusar(500, 'internal', txt.slice(0, 200));
  }
  armario.set(nome, { dados: Buffer.from(dados), tipo, cache: `max-age=${cache}` });
  reg.status = 200;
  json(res, 200, { Key: `letras/${nome}`, Id: id });
}

function baixar(res, nome, url) {
  const linha = sql(`select row_to_json(x) from (select b.public from storage.objects o join storage.buckets b on b.id = o.bucket_id
     where o.bucket_id = 'letras' and o.name = :'nome') x`, { nome });
  const a = armario.get(nome);
  if (!linha || !JSON.parse(linha).public || !a) return erroDoStorage(res, 404, 'not_found', 'Object not found');
  const cab = { ...CORS, 'content-type': a.tipo, 'cache-control': a.cache, 'content-length': String(a.dados.length) };
  const pedido = url.searchParams.get('download');
  /* COMO A API DO STORAGE MONTA HOJE (supabase/storage#1385): o mesmo
     `encodeURIComponent` nos dois nomes */
  if (pedido !== null) {
    const enc = encodeURIComponent(pedido);
    cab['content-disposition'] = pedido ? `attachment; filename=${enc}; filename*=UTF-8''${enc};` : 'attachment;';
  }
  res.writeHead(200, cab); res.end(a.dados);
}

function repassar(req, res, corpo) {
  const cab = { ...req.headers }; delete cab.host; delete cab.origin; delete cab.referer;
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
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    try {
      if (p.startsWith('/rest/v1/')) return repassar(req, res, corpo);
      if (p.startsWith('/storage/v1/object/public/letras/') && req.method === 'GET') return baixar(res, p.slice('/storage/v1/object/public/letras/'.length), url);
      if (p.startsWith('/storage/v1/object/letras/') && req.method === 'POST') return enviar(req, res, p.slice('/storage/v1/object/letras/'.length), corpo);
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

/** um envio feito direto à ponte (sem a tela), com o formulário do storage-js */
async function enviarDireto(token, nome, dados, tipo = 'application/pdf') {
  const fd = new FormData();
  fd.append('cacheControl', '3600');
  fd.append('', new Blob([dados], { type: tipo }));
  const r = await fetch(`${SUPA}/storage/v1/object/letras/${nome}`, {
    method: 'POST', body: fd, headers: { authorization: `Bearer ${token}`, apikey: ANON, 'x-upsert': 'false' } });
  return { http: r.status, corpo: await r.json().catch(() => ({})) };
}

/* ================================================================ subida */
let pgrst = null, nav = null;
async function subir() {
  /* a semente: quem entra pelo PostgREST, o auth do Supabase que lê as claims
     em JSON, as lideranças, o repertório ligado no Louvor, dois domingos e
     duas pessoas do Louvor (Lia no vocal; Davi no posto DIRIGENTE, e no vocal
     do domingo seguinte) */
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
update config set dados = dados || '{"repertorio": true}'::jsonb where equipe_id = (select id from equipes where slug = 'louvor');
insert into cultos (data) values (:'d1'::date) on conflict (data) where evento is null do nothing;
insert into cultos (data) values (:'d2'::date) on conflict (data) where evento is null do nothing;
insert into voluntarios (nome, equipe_id, token) select 'Lia Prova', id, :'tok_lia' from equipes where slug = 'louvor';
insert into voluntarios (nome, equipe_id, token) select 'Davi Prova', id, :'tok_davi' from equipes where slug = 'louvor';
insert into escalacoes (culto_id, funcao_id, voluntario_id, status)
  select c.id, f.id, v.id, 'confirmado' from cultos c, funcoes f, voluntarios v, equipes q
   where c.evento is null and q.slug = 'louvor' and f.equipe_id = q.id
     and ((c.data = :'d1'::date and f.nome = 'VOCAL 1' and v.token = :'tok_lia')
       or (c.data = :'d1'::date and f.nome = 'DIRIGENTE' and v.token = :'tok_davi')
       /* o domingo regular só vira dia do ministério com alguém escalado nele
          (lib/ponte.ts, "os dias de evento são materializados; os demais, não") */
       or (c.data = :'d2'::date and f.nome = 'VOCAL 2' and v.token = :'tok_davi'))
  on conflict (culto_id, funcao_id) do update set voluntario_id = excluded.voluntario_id, status = excluded.status;
`, { lider_louvor: LIDER_LOUVOR.email, lider_midia: LIDER_MIDIA.email, d1: D1, d2: D2, tok_lia: TOK_LIA, tok_davi: TOK_DAVI });

  pgrst = spawn(PGRST, [], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env,
    PGRST_DB_URI: `postgres://authenticator@127.0.0.1:${PORTA}/${BANCO}`, PGRST_DB_SCHEMAS: 'public',
    PGRST_DB_ANON_ROLE: 'anon', PGRST_JWT_SECRET: SEGREDO, PGRST_DB_EXTRA_SEARCH_PATH: 'public, extensions',
    PGRST_SERVER_HOST: '127.0.0.1', PGRST_SERVER_PORT: String(PORTA_PGRST), PGRST_LOG_LEVEL: 'error' } });
  let log = '';
  pgrst.stderr.on('data', c => { log += c; }); pgrst.stdout.on('data', c => { log += c; });
  for (let i = 0; i < 60; i++) {
    const r = await fetch(`http://127.0.0.1:${PORTA_PGRST}/`).catch(() => null);
    if (r && r.ok) break;
    if (i === 59) throw new Error('o PostgREST não subiu: ' + log.slice(-400));
    await esperar(500);
  }
  await new Promise(r => ponte.listen(PORTA_PONTE, '127.0.0.1', r));
}

async function contexto(w, h, toque, quem) {
  const c = await nav.newContext({ viewport: { width: w, height: h }, isMobile: toque, hasTouch: toque, deviceScaleFactor: 2,
    acceptDownloads: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await c.addInitScript(([cred, chave, sessao]) => {
    try {
      localStorage.setItem('escala.credenciais', cred);
      if (sessao) localStorage.setItem(chave, sessao); else localStorage.removeItem(chave);
    } catch {}
  }, [JSON.stringify({ url: SUPA, key: ANON }), `sb-${new URL(SUPA).hostname.split('.')[0]}-auth-token`, quem ? JSON.stringify(sessaoDe(quem)) : '']);
  return c;
}
async function abrirDia(p, dia) {
  await p.goto(`${BASE}/escala?m=${dia.slice(0, 7)}#d${dia}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector(`#d${dia}`, { timeout: 90000 });
  await esperar(1500);
  const d = p.locator(`#d${dia}`);
  if (!(await d.evaluate(e => e.open))) { await d.locator(':scope > summary').click(); await esperar(500); }
  const ordem = d.locator('section.es-ec-ordem');
  try { await ordem.waitFor({ timeout: 20000 }); } catch (e) {
    await p.screenshot({ path: `${OUT}/falhou-dia-${dia}.png`, fullPage: true }).catch(() => {});
    const como = await d.evaluate(e => ({ open: e.open, texto: e.innerText.slice(0, 600) })).catch(() => null);
    throw new Error(`o dia ${dia} abriu sem a ordem do culto: ${JSON.stringify(como)}`);
  }
  return ordem;
}
const ordemNoBanco = dia => JSON.parse(sql(`select coalesce((select o.ordem from culto_obs o join cultos c on c.id = o.culto_id
  join equipes q on q.id = o.equipe_id where c.data = :'d'::date and c.evento is null and q.slug = 'louvor'), 'null')`, { d: dia }) || 'null');
const objetos = () => sql(`select coalesce(json_agg(json_build_object('nome', name, 'dono', owner, 'tipo', metadata->>'mimetype') order by created_at), '[]') from storage.objects where bucket_id = 'letras'`);

/* C · QUEM SERVE NO CULTO BAIXA A LETRA QUE SUBIU. Sem link de playlist, as
   músicas aparecem na Ordem do culto; com link, no Repertório, embaixo dos
   links, e a Ordem (só de músicas) sai para não repetir (app/eu, 02/10). O
   botão "Letra" mora nos dois, e os dois são provados com o banco. */
async function quemServe(onde, w, h, toque) {
  const tela = `C ${onde} ${w}`;
  const c = await contexto(w, h, toque, null); const p = await c.newPage();
  await p.goto(`${BASE}/eu/${TOK_LIA}`, { waitUntil: 'domcontentloaded' });
  const sel = onde === 'ordem' ? '#ordem li.vol-oi' : '#repertorio .vol-setlist li.vol-sl';
  await p.waitForSelector(sel, { timeout: 90000 }).catch(() => {});
  await esperar(800);
  const texto = t => (t || '').replace(/\s+/g, ' ').trim();
  const linhas = p.locator(sel);
  const metas = (await linhas.locator('.vol-oi-meta').evaluateAll(es => es.map(e => e.textContent))).map(texto);
  const esperadas = onde === 'ordem' ? ['Tom G · 72 BPM · 6/8 · Lia · 4:35', '5:02'] : ['Tom G · 72 BPM · 6/8 · 4:35 · Lia', '5:02'];
  ok(JSON.stringify(metas) === JSON.stringify(esperadas),
    `${tela}: as músicas com o compasso ao lado do BPM e o tempo em minuto e segundo`, JSON.stringify(metas));
  if (!metas.length) {
    await p.screenshot({ path: `${OUT}/falhou-${onde}-${w}.png`, fullPage: true }).catch(() => {});
    console.log('      a página:', texto(await p.locator('body').innerText().catch(() => '')).slice(0, 700));
  }
  const outra = onde === 'ordem' ? '#repertorio' : '#ordem';
  ok(await p.locator(outra).count() === 0, `${tela}: sem repetir as músicas em ${outra}`);
  for (const [i, titulo, arquivo, esperado] of [[0, 'Ousado Amor (Ao Vivo)', PDF1, 'Ousado Amor [Ao Vivo] - letra.pdf'],
                                                [1, 'Canção da Manhã', PDF3, 'Canção da Manhã - letra.pdf']]) {
    const letra = linhas.nth(i).getByRole('link', { name: `Baixar a letra de ${titulo} (PDF)` });
    const caixa = await letra.boundingBox().catch(() => null);
    const [down] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }).catch(() => null),
      letra.click({ timeout: 10000 }).catch(() => {})]);
    const baixado = down ? readFileSync(await down.path()) : Buffer.alloc(0);
    ok(!!down && down.suggestedFilename() === esperado && Buffer.compare(baixado, arquivo) === 0 && !!caixa && caixa.height >= 44,
      `${tela}: "Letra" de ${titulo} (44 de toque) baixa o mesmo PDF, como "${esperado}"`,
      down ? `${down.suggestedFilename()} (${baixado.length} bytes) ${JSON.stringify(caixa)}` : 'sem download');
  }
  ok(await p.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1), `${tela}: a página não rola de lado`);
  if (toque) await p.locator(onde === 'ordem' ? '#ordem' : '#repertorio').screenshot({ path: `${OUT}/C-${onde}-${w}.png` }).catch(() => {});
  await c.close();
}

try {
  await subir();
  const LOUVOR = sql(`select id from equipes where slug = 'louvor'`);
  const MIDIA = sql(`select id from equipes where slug = 'midia'`);
  console.log(`· domingos ${D1} e ${D2}; Louvor ${LOUVOR}`);
  nav = await chromium.launch({ executablePath: chromeDoContainer(), env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });

  /* =================== A · a liderança do Louvor, no celular, com o PDF */
  let nome1 = '';
  {
    const c = await contexto(390, 844, true, LIDER_LOUVOR); const p = await c.newPage();
    const erros = []; p.on('pageerror', e => erros.push(String(e)));
    const ordem = await abrirDia(p, D1);
    await ordem.getByRole('button', { name: 'Acrescentar música' }).click(); await esperar(400);
    const form = ordem.locator('form.es-ec-of');
    ok(await form.getByLabel('Compasso').count() === 1 && await form.getByLabel('Segundos').count() === 1
      && await form.getByRole('group', { name: 'Letra (PDF)' }).count() === 1,
      'A: o banco de verdade responde que aceita (ordem_valida), e o formulário tem compasso, minuto e segundo e a letra');
    await form.getByLabel('Música', { exact: true }).fill('Ousado Amor (Ao Vivo)');
    await form.getByLabel('Tom').selectOption('G');
    await form.getByLabel('BPM').fill('72');
    await form.getByLabel('Compasso').selectOption('6/8');
    await form.getByLabel('Minutos').fill('4'); await form.getByLabel('Segundos').fill('35');
    await form.getByLabel('Lead').fill('Lia');
    await form.locator('input[type="file"]').setInputFiles({ name: 'ousado amor.pdf', mimeType: 'application/pdf', buffer: PDF1 });
    await esperar(400);
    ok(/Sobe quando você salvar/.test(await form.innerText()) && envios.length === 0, 'A: escolher o PDF não envia nada ainda');
    await form.screenshot({ path: `${OUT}/A-form-390.png` });
    await form.getByRole('button', { name: 'Salvar' }).click();
    await ordem.locator('.es-ec-oi-meta', { hasText: 'com letra' }).first().waitFor({ timeout: 20000 }).catch(() => {});
    const e1 = envios[0] || {};
    nome1 = e1.nome || '';
    ok(envios.length === 1 && e1.status === 200, 'A: o Salvar sobe o PDF, e o armário aceita', JSON.stringify(envios));
    ok(new RegExp(`^${LOUVOR}/${UUID}\\.pdf$`).test(nome1), 'A: na pasta do Louvor, com um nome que não se adivinha', nome1);
    ok(e1.tipo === 'application/pdf' && e1.tamanho === PDF1.length && e1.email === LIDER_LOUVOR.email && e1.papel === 'authenticated',
      'A: como PDF, inteiro, e com o JWT de quem enviou', JSON.stringify(e1));
    ok(Buffer.compare(armario.get(nome1)?.dados || Buffer.alloc(0), PDF1) === 0, 'A: o arquivo no armário é o mesmo que foi escolhido');
    const obj = JSON.parse(objetos());
    ok(obj.length === 1 && obj[0].nome === nome1 && obj[0].dono === LIDER_LOUVOR.id && obj[0].tipo === 'application/pdf',
      'A: a linha em storage.objects, com o dono', JSON.stringify(obj));
    const o1 = ordemNoBanco(D1) || [];
    const it = o1.find(i => i.titulo === 'Ousado Amor (Ao Vivo)') || {};
    ok(it.compasso === '6/8' && it.seg === 275 && it.letra === nome1 && !('min' in it) && it.tom === 'G' && it.bpm === 72,
      'A: a ordem no banco guarda compasso, segundos e o caminho da letra', JSON.stringify(it));
    const meta = (await ordem.locator('.es-ec-oi-meta').allInnerTexts())[0] || '';
    ok(meta === 'G · 72 BPM · 6/8 · Lia · 4:35 · com letra', 'A: a lista mostra o compasso, o 4:35 e "com letra"', meta);

    /* a segunda música, com acento no nome, para o download provar o nome */
    await ordem.getByRole('button', { name: 'Acrescentar música' }).click(); await esperar(400);
    await form.getByLabel('Música', { exact: true }).fill('Canção da Manhã');
    await form.getByLabel('Minutos').fill('5'); await form.getByLabel('Segundos').fill('02');
    await form.locator('input[type="file"]').setInputFiles({ name: 'cancao.pdf', mimeType: 'application/pdf', buffer: PDF3 });
    await esperar(400);
    await form.getByRole('button', { name: 'Salvar' }).click();
    await ordem.locator('li.es-ec-oi').nth(1).locator('.es-ec-oi-meta', { hasText: 'com letra' }).waitFor({ timeout: 20000 }).catch(() => {});
    ok(envios.length === 2 && envios[1].status === 200 && (ordemNoBanco(D1) || []).length === 2, 'A: a segunda música também sobe e grava',
      JSON.stringify(envios.at(-1)));
    ok(erros.length === 0, 'A: sem erro de script na página', erros.join(' | '));
    await ordem.screenshot({ path: `${OUT}/A-ordem-390.png` });
    await c.close();
  }

  /* ====== C1 · quem serve, sem link de playlist: a letra na ordem do culto */
  await quemServe('ordem', 390, 844, true);

  /* ========= B · o banco de músicas traz a letra; PDF sem tipo; sem acesso */
  let nome2 = '';
  {
    const c = await contexto(1440, 900, false, LIDER_LOUVOR); const p = await c.newPage();
    const ordem = await abrirDia(p, D2);
    await ordem.getByRole('button', { name: 'Acrescentar música' }).click(); await esperar(400);
    const form = ordem.locator('form.es-ec-of');
    await form.getByLabel('Música', { exact: true }).fill('ousado amor (ao vivo)');
    await form.getByLabel('Música', { exact: true }).press('Tab'); await esperar(500);
    const salva = form.getByRole('link', { name: 'Letra salva' });
    ok(await form.getByLabel('Música', { exact: true }).inputValue() === 'Ousado Amor (Ao Vivo)'
      && await form.getByLabel('Compasso').inputValue() === '6/8'
      && await form.getByLabel('Minutos').inputValue() === '4' && await form.getByLabel('Segundos').inputValue() === '35'
      && await form.getByLabel('Tom').inputValue() === 'G' && await form.getByLabel('BPM').inputValue() === '72',
      'B: a música do banco vem com o nome dela, o tom, o BPM, o compasso e o 4:35 (musicas_do_ministerio)');
    ok(await salva.count() === 1 && await salva.getAttribute('href') === `${SUPA}/storage/v1/object/public/letras/${nome1}`,
      'B: e com a letra da última vez', await salva.getAttribute('href').catch(() => '-'));
    ok(/Preenchido como em/.test(await form.innerText()), 'B: a frase diz que veio do banco');
    await form.getByRole('button', { name: 'Salvar' }).click();
    await ordem.locator('.es-ec-oi-meta', { hasText: 'com letra' }).first().waitFor({ timeout: 20000 }).catch(() => {});
    ok(envios.length === 2, 'B: salvar com a letra do banco NÃO sobe o PDF de novo', JSON.stringify(envios.slice(2)));
    ok(((ordemNoBanco(D2) || [])[0] || {}).letra === nome1, 'B: a ordem do domingo seguinte aponta para o mesmo PDF');

    /* trocar pelo PDF que o aparelho entrega como arquivo genérico. Com o
       tipo vazio o Playwright deduz pela extensão e põe `application/pdf`
       (medido): o caso real que derruba é o `octet-stream`, que é também o
       que o navegador manda no formulário para um arquivo sem tipo. */
    await ordem.locator('li.es-ec-oi').first().locator('button.es-ec-oi-abre').click(); await esperar(400);
    await form.locator('input[type="file"]').setInputFiles({ name: 'sem tipo.pdf', mimeType: 'application/octet-stream', buffer: PDF2 });
    await esperar(400);
    ok(/sem tipo\.pdf/.test(await form.innerText()), 'B: o PDF que chega como arquivo genérico é aceito pelo conteúdo');
    await form.getByRole('button', { name: 'Salvar' }).click();
    await form.waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
    const e3 = envios[2] || {};
    nome2 = e3.nome || '';
    ok(envios.length === 3 && e3.status === 200 && e3.tipo === 'application/pdf',
      'B: e sobe COMO PDF (sem o rótulo, o armário recusaria um PDF bom)', JSON.stringify(e3));
    ok(nome2 && nome2 !== nome1 && ((ordemNoBanco(D2) || [])[0] || {}).letra === nome2 && ((ordemNoBanco(D1) || [])[0] || {}).letra === nome1,
      'B: o domingo seguinte passa a apontar para o PDF novo, e o primeiro continua com o dele');

    /* quem perdeu a liderança no meio do caminho */
    sql(`delete from lideres where email = :'e'`, { e: LIDER_LOUVOR.email });
    await ordem.getByRole('button', { name: 'Acrescentar música' }).click(); await esperar(400);
    await form.getByLabel('Música', { exact: true }).fill('Música de quem saiu');
    await form.locator('input[type="file"]').setInputFiles({ name: 'x.pdf', mimeType: 'application/pdf', buffer: PDF3 });
    await esperar(400);
    await form.getByRole('button', { name: 'Salvar' }).click(); await esperar(2500);
    const frase = await form.locator('[id$="-d-letra"]').innerText().catch(() => '');
    ok(envios.length === 4 && envios[3].status === 403 && frase === 'Seu acesso não envia letra para este ministério.',
      'B: sem a liderança, o armário recusa (RLS) e a tela diz por quê', `${frase} | ${JSON.stringify(envios[3])}`);
    ok((ordemNoBanco(D2) || []).length === 1, 'B: e a ordem não ganhou a música');
    sql(`insert into lideres (email, equipe_id) select :'e', id from equipes where slug = 'louvor'`, { e: LIDER_LOUVOR.email });
    await form.getByRole('button', { name: 'Cancelar' }).click();
    await ordem.screenshot({ path: `${OUT}/B-ordem-1440.png` });

    /* o link da playlist no primeiro domingo: com ele, quem serve vê as
       músicas no Repertório, embaixo dos links */
    await abrirDia(p, D1);
    const spotify = p.locator(`#d${D1}`).getByLabel('Spotify');
    await spotify.fill('https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd'); await spotify.press('Tab');
    await esperar(1500);
    ok(sql(`select o.repertorio ->> 'spotify' from culto_obs o join cultos c on c.id = o.culto_id join equipes q on q.id = o.equipe_id
             where c.data = :'d'::date and c.evento is null and q.slug = 'louvor'`, { d: D1 }).startsWith('https://open.spotify.com/'),
      'B: o link da playlist do primeiro domingo gravado (salvar_repertorio)');
    await c.close();
  }

  /* === C2 · com o link da playlist: a letra no Repertório, embaixo dos links */
  await quemServe('repertorio', 390, 844, true);
  await quemServe('repertorio', 1440, 900, false);

  /* ================= D · o dirigente é quem a escala do Louvor pôs lá */
  {
    const c = await contexto(390, 844, true, null); const p = await c.newPage();
    await p.goto(`${BASE}/eu/${TOK_DAVI}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#cronograma', { timeout: 90000 }).catch(() => {});
    const cartao = p.locator('#cronograma');
    /* textContent: o innerText vem em maiúsculas (o CSS do título) */
    const texto = (await cartao.textContent().catch(() => '') || '').replace(/\s+/g, ' ');
    ok(/Você dirige o culto/i.test(texto) && /Dirigente/.test(texto) && /Ainda falta/.test(texto),
      'D: o link de quem está no posto DIRIGENTE do Louvor mostra "Você dirige o culto"', texto.slice(0, 200));
    const lia = sql(`select jsonb_array_length(eu_cronogramas(:'t') -> 'cultos')`, { t: TOK_LIA });
    const davi = sql(`select jsonb_array_length(eu_cronogramas(:'t') -> 'cultos')`, { t: TOK_DAVI });
    ok(lia === '0' && davi === '1', 'D: e o de quem está no vocal, não (eu_cronogramas)', `Lia ${lia}, Davi ${davi}`);
    await cartao.screenshot({ path: `${OUT}/D-dirigente-390.png` }).catch(() => {});
    await c.close();
  }

  /* ========================== E · o armário não abre para quem não deve */
  {
    const antes = JSON.parse(objetos()).length;
    const novo = eq => `${eq}/${randomUUID()}.pdf`;
    const casos = [
      ['a liderança da Mídia, na pasta do Louvor', tokenDe(LIDER_MIDIA), novo(LOUVOR), PDF1, 'application/pdf', 403],
      ['a liderança do Louvor, na pasta da Mídia', tokenDe(LIDER_LOUVOR), novo(MIDIA), PDF1, 'application/pdf', 403],
      ['quem não entrou (a chave pública)', ANON, novo(LOUVOR), PDF1, 'application/pdf', 403],
      ['nome fora do formato', tokenDe(LIDER_LOUVOR), `${LOUVOR}/letra.pdf`, PDF1, 'application/pdf', 403],
      ['subpasta dentro da pasta', tokenDe(LIDER_LOUVOR), `${LOUVOR}/${randomUUID()}/${randomUUID()}.pdf`, PDF1, 'application/pdf', 403],
      ['extensão em maiúscula', tokenDe(LIDER_LOUVOR), `${LOUVOR}/${randomUUID()}.PDF`, PDF1, 'application/pdf', 403],
      ['token forjado', assinar({ role: 'authenticated', email: LIDER_LOUVOR.email }).replace(/.$/, c => (c === 'A' ? 'B' : 'A')), novo(LOUVOR), PDF1, 'application/pdf', 403],
      ['arquivo que não é PDF', tokenDe(LIDER_LOUVOR), novo(LOUVOR), PDF1, 'application/octet-stream', 415],
      ['mais de 10 MB', tokenDe(LIDER_LOUVOR), novo(LOUVOR), Buffer.alloc(10 * 1024 * 1024 + 1, 65), 'application/pdf', 413],
      ['por cima de um que já existe', tokenDe(LIDER_LOUVOR), nome1, PDF2, 'application/pdf', 409],
    ];
    for (const [rotulo, token, nome, dados, tipo, esperado] of casos) {
      const r = await enviarDireto(token, nome, dados, tipo);
      ok(r.http === 400 && r.corpo.statusCode === String(esperado), `E: ${rotulo}: recusado (${esperado})`, JSON.stringify(r));
    }
    ok(JSON.parse(objetos()).length === antes, 'E: nenhuma tentativa recusada deixou linha no banco');
    ok(Buffer.compare(armario.get(nome1).dados, PDF1) === 0, 'E: e o PDF de quem enviou primeiro continua o mesmo');
    /* o caminho da letra que a ordem aceita é só o do armário */
    const torta = sql(`select ordem_valida('[{"t":"musica","titulo":"x","letra":"https://golpe.com/a.pdf"}]'::jsonb)`);
    ok(torta === 'f', 'E: a ordem não aceita letra fora do armário', torta);
  }
} catch (e) {
  falhas++; console.log('  FALHOU (exceção)', e?.stack || e);
} finally {
  await nav?.close().catch(() => {});
  ponte.close();
  pgrst?.kill('SIGTERM');
}
console.log(`\nletra-e2e: ${feitas - falhas}/${feitas} ${falhas ? 'FALHOU' : 'ok'}`);
process.exit(falhas ? 1 : 0);
