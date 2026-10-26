/* O BOTÃO "MANDAR AGORA PELO ROBÔ" DE PONTA A PONTA · 26/10/2026.
   Roda pelo scripts/robo-pedidos-e2e.sh (o banco e o build ficam prontos lá).

   A · a liderança do Louvor, no celular: robô ligado, aperta, confirma; o
       robô de verdade posta nos grupos do Louvor o texto das linhas da tela;
       a tela chega a "Mandado em 3 grupos", grupo por grupo
   B · apertar de novo: nada sai ("Nada novo")
   C · a Mídia, no computador: os grupos da Multimídia, no lugar de sempre
       do estado do robô (o topo)
   D · robô desligado: a tela diz, o botão some
   E · o robô que volta não manda o que esperou (a tela mandou mandar à mão)
   O robô roda copiado numa pasta temporária, com um whatsapp.mjs de mentira
   que grava o que "saiu" em saiu.jsonl. */
import { createServer, request as pedir } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { chromeDoContainer } from './medida-celular.mjs';

const RAIZ = new URL('..', import.meta.url).pathname;
const PORTA = Number(process.env.PORTA || 5446);
const BANCO = process.env.BANCO || 'robo';
const PGRST = process.env.PGRST || '/tmp/postgrest-12.2.3/postgrest';
const PORTA_PGRST = Number(process.env.PORTA_PGRST || 54371);
const PORTA_PONTE = Number(process.env.PORTA_PONTE || 54372);
const PORTA_APP = Number(process.env.PORTA_APP || 3510);
const SUPA = `http://127.0.0.1:${PORTA_PONTE}`;
const BASE = `http://127.0.0.1:${PORTA_APP}`;
const SEGREDO = 'segredo-local-da-prova-do-robo-com-mais-de-32-caracteres';
const SEGREDO_DO_ROBO = 'segredo-do-robo-da-prova-de-ponta-a-ponta-0123456789';
const ROBO = '/tmp/robo-e2e';
const OUT = '/tmp/robo-pedidos-e2e';
mkdirSync(OUT, { recursive: true });

const esperar = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0, feitas = 0;
const ok = (c, nome, extra = '') => { feitas++; if (!c) falhas++; console.log(`  ${c ? 'ok ' : 'FALHOU'} ${nome}${!c && extra ? '\n      ' + extra : ''}`); };

function sql(texto, vars = {}) {
  const args = ['-h', '/tmp', '-p', String(PORTA), '-U', 'postgres', '-d', BANCO, '-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'];
  for (const [k, v] of Object.entries(vars)) args.push('-v', `${k}=${v}`);
  return execFileSync('psql', args, { input: texto, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function assinar(claims) {
  const cab = b64({ alg: 'HS256', typ: 'JWT' }), corpo = b64(claims);
  return `${cab}.${corpo}.${createHmac('sha256', SEGREDO).update(`${cab}.${corpo}`).digest('base64url')}`;
}
function conferirJwt(cabecalho) {
  const m = /^Bearer\s+([\w-]+)\.([\w-]+)\.([\w-]+)$/.exec(cabecalho || '');
  if (!m) return null;
  if (createHmac('sha256', SEGREDO).update(`${m[1]}.${m[2]}`).digest('base64url') !== m[3]) return null;
  try { return JSON.parse(Buffer.from(m[2], 'base64url').toString('utf8')); } catch { return null; }
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

const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const somar = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
/* o primeiro domingo daqui a pelo menos dois dias (dentro dos 14 do robô) */
let D1 = somar(hoje, 2);
while (new Date(D1 + 'T12:00:00Z').getUTCDay() !== 0) D1 = somar(D1, 1);

/* =================================================================== ponte */
const CORS = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Content-Range, Preference-Applied, Range-Unit' };
function json(res, status, corpo) { res.writeHead(status, { ...CORS, 'content-type': 'application/json' }); res.end(JSON.stringify(corpo)); }
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
    const p = new URL(req.url, 'http://x').pathname;
    if (p.startsWith('/rest/v1/')) return repassar(req, res, corpo);
    if (p === '/auth/v1/user') {
      const c = conferirJwt(req.headers.authorization);
      return json(res, c ? 200 : 401, c ? { id: c.sub, aud: 'authenticated', role: 'authenticated', email: c.email,
        app_metadata: {}, user_metadata: {}, created_at: new Date(0).toISOString() } : { msg: 'sem sessão' });
    }
    if (p === '/auth/v1/logout') { res.writeHead(204, CORS); return res.end(); }
    json(res, 404, { message: `a ponte não fala ${req.method} ${p}` });
  });
});

/* ================================================== o robô, com WhatsApp falso */
const WHATSAPP_FALSO = `/* whatsapp.mjs DE MENTIRA (prova de ponta a ponta): os grupos da tabela
   existem, a conta é a da igreja, e o que sai vai para saiu.jsonl */
import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const PASTA = dirname(fileURLToPath(import.meta.url));
export async function carregarBaileys() { return null; }
export async function abrirWhatsApp({ cfg }) {
  const jids = new Map();
  const jid = (nome) => { if (!jids.has(nome)) jids.set(nome, '120363' + String(jids.size + 1).padStart(12, '0') + '@g.us'); return jids.get(nome); };
  return {
    aberto: () => true, conta: () => cfg.numeroDaIgreja, esperarAberto: async () => {},
    mapearGrupos: async (nomes) => Object.fromEntries(nomes.map((n) => [n, { jid: jid(n), soAdmin: false, admin: true, participantes: 10, lid: true }])),
    mencoesDoGrupo: async () => [],
    postar: async (j, texto, mentions) => {
      const grupo = [...jids].find(([, v]) => v === j)?.[0] || null;
      appendFileSync(join(PASTA, 'saiu.jsonl'), JSON.stringify({ grupo, texto, mentions, em: new Date().toISOString() }) + '\\n');
      return 'id-' + Date.now();
    },
    fechar: async () => {}, desligarAparelho: async () => {},
  };
}
`;
const CONFIG_DA_PROVA = `import { CONFIG as C } from './config.original.mjs';
/* a prova: o app local, sem esperar 15 a 40 s entre mensagens, e a Mídia
   sem rodada de horário (a prova é do botão) */
export const CONFIG = {
  ...C, site: ${JSON.stringify(BASE)}, versao: 'prova', intervaloEntreMensagensS: [0.2, 0.4],
  ministerios: { ...C.ministerios, midia: { ...C.ministerios.midia, automatico: false } },
};
`;
function prepararRobo() {
  rmSync(ROBO, { recursive: true, force: true });
  mkdirSync(join(ROBO, 'sessao'), { recursive: true });
  for (const f of ['regras.mjs', 'rodada.mjs', 'pedidos.mjs', 'robo.mjs', 'qr.mjs']) copyFileSync(join(RAIZ, 'robo-whatsapp', f), join(ROBO, f));
  copyFileSync(join(RAIZ, 'robo-whatsapp', 'config.mjs'), join(ROBO, 'config.original.mjs'));
  writeFileSync(join(ROBO, 'config.mjs'), CONFIG_DA_PROVA);
  writeFileSync(join(ROBO, 'whatsapp.mjs'), WHATSAPP_FALSO);
  writeFileSync(join(ROBO, '.env'), `ROBO_WHATSAPP_SEGREDO=${SEGREDO_DO_ROBO}\n`, { mode: 0o600 });
  writeFileSync(join(ROBO, 'sessao', 'creds.json'), JSON.stringify({ account: { prova: true }, me: { id: '5521972976946:1@s.whatsapp.net' } }));
}
const saiu = () => { try { return readFileSync(join(ROBO, 'saiu.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } };
const logDoRobo = () => { try { return readFileSync(join(ROBO, 'logs', 'robo.log'), 'utf8'); } catch { return ''; } };

/* ================================================================ subida */
let pgrst = null, app = null, robo = null, nav = null;
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
/* o psql não troca :'d1' dentro do bloco do do: vai por uma configuração */
select set_config('e2e.d1', :'d1', false) is not null as _;
do $semente$
declare L uuid; M uuid; fl uuid[]; fm uuid[]; c uuid; v uuid; i int;
begin
  select id into L from equipes where slug = 'louvor';
  select id into M from equipes where slug = 'midia';
  select array_agg(id order by ordem) into fl from (select id, ordem from funcoes
    where equipe_id = L and ativa and 'domingo' = any (tipos) order by ordem limit 3) x;
  select array_agg(id order by ordem) into fm from (select id, ordem from funcoes
    where equipe_id = M and ativa and 'domingo' = any (tipos) order by ordem limit 2) x;
  if coalesce(array_length(fl, 1), 0) < 3 or coalesce(array_length(fm, 1), 0) < 2 then
    raise exception 'a semente precisa de 3 postos do Louvor e 2 da Mídia (tem % e %)', array_length(fl, 1), array_length(fm, 1);
  end if;
  /* os grupos por área, com os nomes da tabela do robô */
  update config set dados = dados || jsonb_build_object('grupos', jsonb_build_array(
      jsonb_build_object('id', 'gb', 'nome', 'Louvor · Banda', 'funcoes', jsonb_build_array(fl[1]::text)),
      jsonb_build_object('id', 'gv', 'nome', 'Louvor · Vocal', 'funcoes', jsonb_build_array(fl[2]::text, fl[3]::text))))
   where equipe_id = L;
  update config set dados = dados || jsonb_build_object('grupos', jsonb_build_array(
      jsonb_build_object('id', 'gp', 'nome', 'Multimídia · Projeção', 'funcoes', jsonb_build_array(fm[1]::text))))
   where equipe_id = M;
  insert into cultos (data) values (current_setting('e2e.d1')::date) on conflict (data) where evento is null do nothing;
  select id into c from cultos where data = current_setting('e2e.d1')::date and evento is null;
  for i in 1..3 loop
    insert into voluntarios (nome, equipe_id, token, telefone, ativo)
      values ('Pessoa ' || i || ' Louvor', L, 'e2erobol' || i || '00000000', '2199000000' || i, true) returning id into v;
    insert into escalacoes (culto_id, funcao_id, voluntario_id, status) values (c, fl[i], v, 'pendente');
  end loop;
  for i in 1..2 loop
    insert into voluntarios (nome, equipe_id, token, telefone, ativo)
      values ('Pessoa ' || i || ' Midia', M, 'e2erobom' || i || '00000000', '2198000000' || i, true) returning id into v;
    insert into escalacoes (culto_id, funcao_id, voluntario_id, status) values (c, fm[i], v, 'pendente');
  end loop;
end $semente$;
`, { lider_louvor: LIDER_LOUVOR.email, lider_midia: LIDER_MIDIA.email, d1: D1 });

  pgrst = spawn(PGRST, [], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env,
    PGRST_DB_URI: `postgres://authenticator@127.0.0.1:${PORTA}/${BANCO}`, PGRST_DB_SCHEMAS: 'public',
    PGRST_DB_ANON_ROLE: 'anon', PGRST_JWT_SECRET: SEGREDO, PGRST_DB_EXTRA_SEARCH_PATH: 'public, extensions',
    PGRST_SERVER_HOST: '127.0.0.1', PGRST_SERVER_PORT: String(PORTA_PGRST), PGRST_LOG_LEVEL: 'error' } });
  await esperarHttp(`http://127.0.0.1:${PORTA_PGRST}/`, 30000, 'o PostgREST');
  await new Promise(r => ponte.listen(PORTA_PONTE, '127.0.0.1', r));

  app = spawn(join(RAIZ, 'node_modules/.bin/next'), ['start', '-p', String(PORTA_APP), '-H', '127.0.0.1'], {
    cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', SUPABASE_SERVICE_ROLE: SERVICO, ROBO_WHATSAPP_SEGREDO: SEGREDO_DO_ROBO },
  });
  let logApp = ''; app.stdout.on('data', c => { logApp += c; }); app.stderr.on('data', c => { logApp += c; });
  await esperarHttp(`${BASE}/`, 60000, 'o app').catch(e => { console.log(logApp.slice(-800)); throw e; });

  prepararRobo();
  robo = spawn(process.execPath, [join(ROBO, 'robo.mjs')], { cwd: ROBO, stdio: 'ignore', env: { ...process.env, ROBO_SERVICO: '1' } });
}

async function contexto(w, h, toque, quem) {
  const c = await nav.newContext({ viewport: { width: w, height: h }, isMobile: toque, hasTouch: toque, deviceScaleFactor: 2,
    locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await c.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => {});
  await c.addInitScript(([cred, chave, sessao]) => {
    try { localStorage.setItem('escala.credenciais', cred); localStorage.setItem(chave, sessao); } catch {}
  }, [JSON.stringify({ url: SUPA, key: ANON }), `sb-${new URL(SUPA).hostname.split('.')[0]}-auth-token`, JSON.stringify(sessaoDe(quem))]);
  return c;
}
async function abrirMandar(p, dia) {
  await p.goto(`${BASE}/escala?m=${dia.slice(0, 7)}#d${dia}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector(`#d${dia}`, { timeout: 90000 });
  await esperar(1200);
  const d = p.locator(`#d${dia}`);
  if (!(await d.evaluate(e => e.open))) { await d.locator(':scope > summary').click(); await esperar(500); }
  await d.getByRole('button', { name: 'Mandar nos grupos' }).first().click();
  const painel = p.locator(`#mg${dia}`);
  await painel.waitFor({ timeout: 20000 });
  return painel;
}
const textoDe = async (loc) => ((await loc.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
async function esperarPilula(bloco, re, ms) {
  const ate = Date.now() + ms;
  for (;;) {
    const t = await textoDe(bloco.locator('.es-mg-robo-ped'));
    if (re.test(t)) return t;
    if (Date.now() > ate) return t;
    await esperar(1000);
  }
}
const semLink = t => t.replace(/https?:\/\/\S+\/confirmar\/[a-z0-9-]+/g, 'LINK');

try {
  await subir();
  console.log(`· domingo ${D1}`);
  nav = await chromium.launch({ executablePath: chromeDoContainer(), env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });

  /* o robô passa e conta que está vivo (o primeiro giro sai em 15 s) */
  for (let i = 0; i < 45 && sql(`select coalesce((select visto_em is not null from robo_estado where id = 1), false)`) !== 't'; i++) await esperar(1000);
  const est = JSON.parse(sql(`select row_to_json(e) from robo_estado e where id = 1`) || '{}');
  ok(!!est.visto_em && est.conectado === true && est.pausado === false && JSON.stringify(est.ministerios) === JSON.stringify(['midia', 'louvor', 'servico']),
    'o robô passa na rota e o banco guarda: vivo, conectado, sem pausa, com os três ministérios', JSON.stringify(est) + '\n' + logDoRobo().slice(-600));

  /* ======================= A · o Louvor, no celular */
  const louvor = await contexto(390, 844, true, LIDER_LOUVOR);
  const p = await louvor.newPage();
  const erros = []; p.on('pageerror', e => erros.push(String(e)));
  const painel = await abrirMandar(p, D1);
  const bloco = painel.locator('section.es-mg-robo');
  await bloco.waitFor({ timeout: 20000 }).catch(() => {});
  ok(/Robô ligado/.test(await textoDe(bloco.locator('.es-mg-robo-cab'))), 'A: "Pelo robô · Robô ligado" no painel', await textoDe(bloco));
  const linhas = await painel.locator('li.es-mg-linha:not(.es-mg-vazio)').evaluateAll(ls => ls.map(l => ({
    nome: l.querySelector('.es-mg-tit b')?.textContent?.trim(), texto: l.querySelector('pre.es-msg')?.textContent || '' })));
  ok(JSON.stringify(linhas.map(l => l.nome)) === JSON.stringify(['Grupo geral', 'Louvor · Banda', 'Louvor · Vocal']), 'A: as três linhas do Louvor', JSON.stringify(linhas.map(l => l.nome)));
  const botao = bloco.getByRole('button', { name: 'Mandar agora pelo robô' });
  const caixa = await botao.boundingBox().catch(() => null);
  ok(!!caixa && caixa.height >= 40, 'A: o botão tem altura de toque', JSON.stringify(caixa));
  await botao.click();
  const conf = bloco.getByRole('group', { name: 'Confirmar o envio pelo robô' });
  await conf.waitFor({ timeout: 5000 });
  ok(await p.evaluate(() => document.activeElement?.textContent?.includes('Mandar agora')), 'A: a confirmação recebe o foco no botão de mandar');
  await bloco.screenshot({ path: `${OUT}/A-confirmar-390.png` }).catch(() => {});
  await conf.getByRole('button', { name: 'Mandar agora', exact: true }).click();
  const fim = await esperarPilula(bloco, /Mandado em|Nada novo|Não deu|venceu|Não terminou/, 120000);
  ok(/^Mandado em 3 grupos$/.test(fim.split('Pedido')[0].trim()), 'A: a tela chega a "Mandado em 3 grupos"', fim + '\n' + logDoRobo().slice(-900));
  const porGrupo = await bloco.locator('.es-mg-robo-grupos li').evaluateAll(ls => ls.map(l =>
    [...l.children].map(c => c.textContent.replace(/\s+/g, ' ').trim()).join(' ')));
  ok(JSON.stringify(porGrupo) === JSON.stringify(['Louvor · Equipe mandada agora', 'Louvor · Banda mandada agora', 'Louvor · Vocal mandada agora']),
    'A: grupo por grupo, com o nome do WhatsApp', JSON.stringify(porGrupo));
  await bloco.screenshot({ path: `${OUT}/A-mandado-390.png` }).catch(() => {});
  const s1 = saiu();
  ok(JSON.stringify(s1.map(m => m.grupo)) === JSON.stringify(['Louvor · Equipe', 'Louvor · Banda', 'Louvor · Vocal']), 'A: o robô postou nos três grupos do Louvor, e só neles', JSON.stringify(s1.map(m => m.grupo)));
  ok(s1.length === 3 && s1.every((m, i) => semLink(m.texto) === semLink(linhas[i].texto)), 'A: cada grupo recebeu exatamente o texto da linha da tela (fora o endereço do link, que é o do ambiente)',
    s1.map((m, i) => semLink(m.texto) === semLink(linhas[i].texto)).join(','));
  /* a escala diz "(falta confirmar)" ao lado de cada nome; a cobrança seria uma
     quarta mensagem, no geral, com menção */
  ok(s1.length === 3 && s1.every(m => !m.mentions?.length && /^Boa (noite|tarde|dia)|^Bom dia/.test(m.texto)), 'A: só as três escalas: sem cobrança e sem menção no pedido',
    JSON.stringify(s1.map(m => m.texto.slice(0, 30))));
  ok(sql(`select string_agg(status, ',') from robo_pedidos`) === 'enviado', 'A: o pedido fica "enviado" no banco');
  const pilulas = await painel.locator('li.es-mg-linha:not(.es-mg-vazio) .es-mg-est').evaluateAll(es => es.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  ok(pilulas.length === 3 && pilulas.every(t => /^pelo robô \d\d:\d\d$/.test(t)), 'A: as três linhas ficam marcadas "pelo robô" com a hora (ninguém manda à mão de novo)', JSON.stringify(pilulas));
  ok(await p.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + 1), 'A: a página não rola de lado no celular');

  /* ======================= B · de novo: nada sai */
  /* o líder copia a mensagem da Banda (envio à mão): a confirmação avisa */
  await painel.getByRole('button', { name: 'Copiar a mensagem do grupo Louvor · Banda' }).click();
  await esperar(600);
  await bloco.getByRole('button', { name: 'Mandar agora pelo robô' }).click();
  const conf2 = bloco.getByRole('group', { name: 'Confirmar o envio pelo robô' });
  const aviso2 = await textoDe(conf2.locator('.es-mg-robo-amao'));
  ok(/já mandou à mão: Louvor · Banda\. O robô não sabe disso e manda de novo nesse grupo/.test(aviso2), 'B: a confirmação avisa a linha que este aparelho já mandou à mão', aviso2);
  await bloco.screenshot({ path: `${OUT}/B-aviso-a-mao-390.png` }).catch(() => {});
  await conf2.getByRole('button', { name: 'Mandar agora', exact: true }).click();
  await esperar(1500);
  const fim2 = await esperarPilula(bloco, /Nada novo|Mandado em 1|Não deu|venceu/, 120000);
  ok(/^Nada novo: a escala já estava nos 3 grupos$/.test(fim2.split('Pedido')[0].trim()), 'B: apertar de novo: "Nada novo"', fim2);
  ok(saiu().length === 3, 'B: e nada sai', String(saiu().length));
  ok(JSON.stringify(erros) === '[]', 'A e B: sem erro na página', JSON.stringify(erros));
  await louvor.close();

  /* ======================= C · a Mídia, no computador */
  const midia = await contexto(1280, 900, false, LIDER_MIDIA);
  const pm = await midia.newPage();
  const painelM = await abrirMandar(pm, D1);
  const blocoM = painelM.locator('section.es-mg-robo');
  await blocoM.waitFor({ timeout: 20000 }).catch(() => {});
  await blocoM.getByRole('button', { name: 'Mandar agora pelo robô' }).click();
  await blocoM.getByRole('group', { name: 'Confirmar o envio pelo robô' }).getByRole('button', { name: 'Mandar agora', exact: true }).click();
  const fimM = await esperarPilula(blocoM, /Mandado em|Não deu|venceu|Não terminou/, 120000);
  ok(/^Mandado em 2 grupos$/.test(fimM.split('Pedido')[0].trim()), 'C: a Mídia, "Mandado em 2 grupos"', fimM + '\n' + logDoRobo().slice(-600));
  ok(JSON.stringify(saiu().slice(3).map(m => m.grupo)) === JSON.stringify(['Multimídia · Geral', 'Multimídia · Projeção']), 'C: nos grupos da Multimídia', JSON.stringify(saiu().slice(3).map(m => m.grupo)));
  await esperar(2500); /* o robô tira da fila o que o sistema viu, logo depois da resposta */
  const estadoRobo = JSON.parse(readFileSync(join(ROBO, 'estado.json'), 'utf8'));
  ok(Object.keys(estadoRobo.envios[D1] || {}).length === 2 && Object.keys(estadoRobo.equipes?.louvor?.envios?.[D1] || {}).length === 3,
    'C: no estado do robô, a Mídia no topo e o Louvor à parte', JSON.stringify({ midia: Object.keys(estadoRobo.envios[D1] || {}), louvor: Object.keys(estadoRobo.equipes?.louvor?.envios?.[D1] || {}) }));
  ok((estadoRobo.relatos || []).length === 0 && Object.keys(estadoRobo.pedidos || {}).length === 3, 'C: o sistema recebeu os três relatos (a fila esvaziou)', JSON.stringify({ r: estadoRobo.relatos, p: Object.keys(estadoRobo.pedidos || {}) }));
  await blocoM.screenshot({ path: `${OUT}/C-mandado-1280.png` }).catch(() => {});
  await midia.close();

  /* ======================= D · robô desligado */
  robo.kill('SIGTERM');
  await esperar(3000);
  sql(`update robo_estado set visto_em = now() - interval '5 minutes' where id = 1`);
  const louvor2 = await contexto(390, 844, true, LIDER_LOUVOR);
  const p2 = await louvor2.newPage();
  const painel2 = await abrirMandar(p2, D1);
  const bloco2 = painel2.locator('section.es-mg-robo');
  await bloco2.waitFor({ timeout: 20000 }).catch(() => {});
  const cab2 = await textoDe(bloco2);
  ok(/Robô desligado agora/.test(cab2) && /há 5 min/.test(cab2) && /botões abaixo/.test(cab2), 'D: "Robô desligado agora", há quanto tempo, e o caminho de antes', cab2);
  ok(await bloco2.getByRole('button', { name: 'Mandar agora pelo robô' }).count() === 0, 'D: sem o botão');
  ok(/Nada novo/.test(cab2), 'D: o último pedido continua à vista');
  await bloco2.screenshot({ path: `${OUT}/D-desligado-390.png` }).catch(() => {});

  /* ======================= E · o robô que volta não manda o que esperou */
  /* um pedido que entrou com o robô já fora do ar (uma aba velha que ainda
     mostrava o botão; robo_pedir hoje recusa, a prova entra direto no banco) */
  const idE = sql(`insert into robo_pedidos (equipe_id, data, pedido_por, criado_em, atualizado_em)
    select id, :'d1'::date, 'lider.louvor@prova.teste', now() - interval '30 seconds', now() - interval '30 seconds' from equipes where slug = 'louvor'
    returning id`, { d1: D1 }).split('\n')[0];
  await p2.reload({ waitUntil: 'domcontentloaded' });
  const painel3 = await abrirMandar(p2, D1);
  const bloco3 = painel3.locator('section.es-mg-robo');
  await bloco3.waitFor({ timeout: 20000 }).catch(() => {});
  const ped3 = await textoDe(bloco3.locator('.es-mg-robo-ped'));
  ok(/^Não vai sair/.test(ped3) && /ficou fora do ar/.test(ped3), 'E: com o robô fora do ar, o pedido aberto aparece como "Não vai sair" (e não "esperando")', ped3);
  await bloco3.screenshot({ path: `${OUT}/E-nao-vai-sair-390.png` }).catch(() => {});
  const antesE = saiu().length;
  robo = spawn(process.execPath, [join(ROBO, 'robo.mjs')], { cwd: ROBO, stdio: 'ignore', env: { ...process.env, ROBO_SERVICO: '1' } });
  for (let i = 0; i < 60 && sql(`select status from robo_pedidos where id = :'id'`, { id: idE }) === 'pendente'; i++) await esperar(1000);
  await esperar(4000);
  const fimE = JSON.parse(sql(`select row_to_json(x) from (select status, resultado ->> 'resumo' as resumo from robo_pedidos where id = :'id') x`, { id: idE }));
  ok(fimE.status === 'falhou' && /ficou fora do ar/.test(fimE.resumo), 'E: o robô volta e o pedido que esperou cai, com o motivo', JSON.stringify(fimE));
  ok(saiu().length === antesE, 'E: e nada sai no grupo', `${saiu().length} x ${antesE}`);
  ok(/o sistema já fechou|velho demais/.test(logDoRobo()) || !/pedido do sistema: louvor/.test(logDoRobo().split('serviço no ar').pop()), 'E: o robô nem tenta mandar');
  await louvor2.close();
} catch (e) {
  falhas++;
  console.log('  FALHOU (exceção):', e?.stack || e);
  console.log(logDoRobo().slice(-1500));
} finally {
  try { await nav?.close(); } catch {}
  try { robo?.kill('SIGKILL'); } catch {}
  try { app?.kill('SIGTERM'); } catch {}
  try { pgrst?.kill('SIGTERM'); } catch {}
  try { ponte.close(); } catch {}
}
console.log(`robô, o botão de ponta a ponta: ${feitas - falhas}/${feitas}`);
process.exit(falhas ? 1 : 0);
