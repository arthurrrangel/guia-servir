/* O ROBÔ MUDOU DE CASA · 29/10/2026.

   Com o robô no servidor, a pasta do Mac guarda o arquivo NO-SERVIDOR (o
   levar-para-o-servidor.command grava). Esta prova roda o robo.mjs de verdade,
   numa cópia da pasta, e confere que com o arquivo:
     · o serviço não liga no WhatsApp: fica parado, avisa e grava o motivo
       (dois robôs com a mesma sessão derrubam um ao outro);
     · --grupos, --parear, --ensaio, --mandar-agora, --conferido e
       --a-partir-de recusam, sem tocar no estado nem na sessão;
     · --status continua, e diz onde o robô está;
   e que, sem o arquivo, o --status não fala em servidor.

   Roda com `npm test` (raiz) e no configurar-servidor.sh não entra: lá o
   arquivo nunca existe. */
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

const pasta = mkdtempSync(join(tmpdir(), 'robo-no-servidor-'));
try {
  for (const f of ['robo.mjs', 'config.mjs', 'regras.mjs', 'rodada.mjs', 'pedidos.mjs', 'whatsapp.mjs', 'qr.mjs', 'package.json']) {
    cpSync(join(RAIZ, f), join(pasta, f));
  }
  mkdirSync(join(pasta, 'logs'));
  writeFileSync(join(pasta, '.env'), 'ROBO_WHATSAPP_SEGREDO=' + 'x'.repeat(64) + '\n', { mode: 0o600 });
  const estado0 = JSON.stringify({ inicio: '2026-10-26T20:38:54.263Z', envios: {}, cobrancas: {}, rodadas: {}, equipes: {}, pedidos: {}, relatos: [] });
  writeFileSync(join(pasta, 'estado.json'), estado0);
  const roda = (args, env = {}) => spawnSync(process.execPath, [join(pasta, 'robo.mjs'), ...args], {
    cwd: pasta, encoding: 'utf8', timeout: 20000, env: { ...process.env, ROBO_SERVICO: '', ...env },
  });

  /* sem o arquivo: o --status não fala em servidor */
  const s0 = roda(['--status']);
  ok(s0.status === 0 && !/noServidor/.test(s0.stdout), 'sem NO-SERVIDOR, o --status de sempre', s0.stdout.slice(0, 200));

  writeFileSync(join(pasta, 'NO-SERVIDOR'), '203.0.113.10\n');

  for (const args of [['--grupos'], ['--parear'], ['--parear', '--codigo'], ['--ensaio', 'midia'], ['--mandar-agora', '2026-11-01'],
    ['--conferido', '2026-11-01', 'Multimídia · Geral', 'saiu'], ['--a-partir-de', '2026-10-26T17:38-03:00']]) {
    const r = roda(args);
    ok(r.status === 1 && r.stdout.includes('O robô agora roda no servidor (203.0.113.10)'), `${args[0]}${args[1] ? ' ' + args[1] : ''}: recusa e diz onde o robô está`, `${r.status} ${r.stdout.slice(0, 160)}`);
  }
  ok(readFileSync(join(pasta, 'estado.json'), 'utf8') === estado0, 'nenhum dos comandos recusados mexeu no estado');
  ok(!existsSync(join(pasta, 'sessao')) && !existsSync(join(pasta, 'pedido-mandar-agora.json')), 'nem criou sessão, nem pedido');

  /* o serviço: fica parado, sem ligar no WhatsApp e sem sair (sair faria o launchd religar em laço) */
  const filho = spawn(process.execPath, [join(pasta, 'robo.mjs')], { cwd: pasta, env: { ...process.env, ROBO_SERVICO: '1' }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  const vivo = filho.exitCode === null && filho.signalCode === null;
  if (vivo) {
    const saiu = new Promise((r) => filho.once('exit', r));
    filho.kill('SIGKILL');
    await saiu;
  }
  const st = JSON.parse(readFileSync(join(pasta, 'status.json'), 'utf8'));
  const reg = readFileSync(join(pasta, 'logs', 'robo.log'), 'utf8');
  ok(vivo, 'o serviço fica parado, sem sair');
  ok(st.conectado === false && st.motivo === 'o robô roda no servidor (203.0.113.10)', 'o motivo no status', JSON.stringify(st));
  ok(/AVISO O robô agora roda no servidor \(203\.0\.113\.10\)/.test(reg) && !/conectado ao WhatsApp|serviço no ar/.test(reg), 'o aviso no registro, e nada de WhatsApp', reg.slice(-300));
  ok(!existsSync(join(pasta, 'robo.pid')) && !existsSync(join(pasta, 'sessao')), 'nem pid de serviço, nem sessão');

  /* o --status continua, e diz onde */
  const s1 = roda(['--status']);
  let j = null;
  try { j = JSON.parse(s1.stdout); } catch { /* ver abaixo */ }
  ok(s1.status === 0 && j?.noServidor === '203.0.113.10', 'com NO-SERVIDOR, o --status diz o servidor', s1.stdout.slice(0, 200));
} finally {
  rmSync(pasta, { recursive: true, force: true });
}

console.log(`robô do WhatsApp, no servidor: ${feitas - falhas}/${feitas}`);
if (falhas) process.exit(1);
