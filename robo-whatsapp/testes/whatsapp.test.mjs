/* A LIGAÇÃO COM O WHATSAPP, COM UM BAILEYS DE MENTIRA · 26/10/2026.

   whatsapp.mjs recebe a biblioteca por parâmetro (`lib`). Aqui ela é de
   mentira: um socket que guarda o que o robô pediu e deixa o teste disparar
   os eventos do WhatsApp (conexão aberta, em dia, QR, queda, erro devolvido
   para uma mensagem). Nada sai da máquina.

   Roda com `node testes/whatsapp.test.mjs` (na pasta do robô). */

import { abrirWhatsApp, carregarBaileys } from '../whatsapp.mjs';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const CFG = { digitandoS: [0, 0], prazoDoEnvioS: 0.4, esperaRecusaS: 0.3 };
const normal = (jid) => { const [u, s] = String(jid || '').split('@'); return u ? `${u.split(':')[0]}@${s}` : ''; };
const queda = (codigo) => ({ connection: 'close', lastDisconnect: { error: { output: { statusCode: codigo } } } });

function bibliotecaDeMentira() {
  const socks = [];
  const lib = {
    socks,
    DisconnectReason: { loggedOut: 401, restartRequired: 515, connectionReplaced: 440, forbidden: 403, badSession: 500, multideviceMismatch: 411 },
    Browsers: { macOS: (x) => ['Mac OS', x, '14'] },
    isLidUser: (j) => String(j).endsWith('@lid'),
    jidNormalizedUser: normal,
    logger: { level: 'silent' },
    fetchLatestBaileysVersion: async () => ({ version: [2, 3000, 1] }),
    useMultiFileAuthState: async () => ({ state: { creds: { registered: false } }, saveCreds: () => {} }),
    makeWASocket: (opts) => {
      const ouvintes = {};
      const sock = {
        opts, enviados: [], presencas: [], codigos: 0, lidPedidos: [],
        user: { id: '5521972976946:7@s.whatsapp.net', lid: '900000000000001:7@lid' },
        authState: opts.auth,
        ev: { on: (n, f) => { (ouvintes[n] ||= []).push(f); } },
        emitir: async (n, x) => { for (const f of ouvintes[n] || []) await f(x); },
        grupos: {},
        groupFetchAllParticipating: async () => sock.grupos,
        groupMetadata: async (jid) => sock.grupos[jid],
        sendPresenceUpdate: async (t, jid) => { sock.presencas.push([t, jid]); },
        responder: (jid, conteudo) => ({ key: { id: 'MSG' + (sock.enviados.length), remoteJid: jid, fromMe: true }, message: { conversation: conteudo.text } }),
        sendMessage: async (jid, conteudo) => { sock.enviados.push({ jid, ...conteudo }); return sock.responder(jid, conteudo); },
        requestPairingCode: async (num) => { sock.codigos++; sock.numeroDoCodigo = num; return 'ABCD1234'; },
        signalRepository: { lidMapping: { getLIDForPN: async (pn) => { sock.lidPedidos.push(pn); return sock.mapaLid?.[pn] || null; } } },
        end: () => { sock.fechado = true; },
        logout: async () => { sock.saiu = true; },
      };
      socks.push(sock);
      return sock;
    },
  };
  return lib;
}

const LOG = [];
const log = (...p) => LOG.push(p.join(' '));
const abrir = async (lib, extra = {}) => abrirWhatsApp({ pastaSessao: '/tmp/nao-usada', log, cfg: CFG, lib, ...extra });
/* conectado e em dia (o Baileys avisa que leu o que chegou com o aparelho desligado) */
const emDia = async (s) => { await s.emitir('connection.update', { connection: 'open' }); await s.emitir('connection.update', { receivedPendingNotifications: true }); };

/* 1 · abre, só fica pronto em dia, e mapeia os grupos pelo nome exato */
{
  const lib = bibliotecaDeMentira();
  const wa = await abrir(lib);
  const s = lib.socks[0];
  ok(s.opts.markOnlineOnConnect === false && s.opts.syncFullHistory === false && s.opts.shouldSyncHistoryMessage() === false,
    'não aparece online, não puxa histórico');
  ok(!wa.aberto(), 'antes do "open", fechado');
  const pronto = wa.esperarAberto(1000);
  await s.emitir('connection.update', { connection: 'open' });
  ok(!wa.aberto(), 'aberto mas ainda lendo o que chegou com o aparelho desligado: não posta');
  let e = null;
  try { await wa.postar('g1@g.us', 'cedo demais', []); } catch (x) { e = x; }
  ok(e?.fase === 'antes' && !s.enviados.length, 'postar antes de ficar em dia: "antes", nada sai');
  await s.emitir('connection.update', { receivedPendingNotifications: true });
  await pronto;
  ok(wa.aberto() && wa.conta() === '5521972976946', 'em dia: pronto, na conta da igreja', String(wa.conta()));

  s.grupos = {
    'c1@g.us': { id: 'c1@g.us', subject: 'Multimídia · Geral', isCommunity: true, participants: [] },              // a comunidade
    'a1@g.us': { id: 'a1@g.us', subject: 'Multimídia · Geral', isCommunityAnnounce: true, participants: [] },      // avisos da comunidade
    'g1@g.us': { id: 'g1@g.us', subject: 'Multimídia · Geral', addressingMode: 'lid', participants: [{ id: '900000000000001@lid', admin: 'admin' }, { id: 'x@lid' }] },
    'g2@g.us': { id: 'g2@g.us', subject: 'Multimídia · Foto', announce: true, participants: [{ id: '5521972976946@s.whatsapp.net', admin: null }] },
    'g3@g.us': { id: 'g3@g.us', subject: 'Multimídia · Head', participants: [] },
    'g4@g.us': { id: 'g4@g.us', subject: 'Multimídia · Head', participants: [] },
  };
  const m = await wa.mapearGrupos(['Multimídia · Geral', 'Multimídia · Foto', 'Multimídia · Head', 'Multimídia · Edição']);
  ok(m['Multimídia · Geral']?.jid === 'g1@g.us', 'o grupo, nunca a comunidade nem os avisos dela, mesmo com o acento decomposto', JSON.stringify(m['Multimídia · Geral']));
  ok(m['Multimídia · Geral'].admin === true && m['Multimídia · Geral'].lid === true && m['Multimídia · Geral'].participantes === 2, 'admin pelo @lid da própria conta');
  ok(m['Multimídia · Foto'].soAdmin === true && m['Multimídia · Foto'].admin === false, 'grupo só de admin, e a igreja não é admin');
  ok(m['Multimídia · Head'].erro === 'há mais de um grupo com esse nome' && !m['Multimídia · Head'].jid, 'nome repetido: erro, nunca um dos dois');
  ok(m['Multimídia · Edição'].erro === 'não achei o grupo', 'nome ausente: erro');
  ok(typeof s.opts.cachedGroupMetadata === 'function' && (await s.opts.cachedGroupMetadata('g1@g.us'))?.id === 'g1@g.us', 'a lista do grupo fica guardada para o envio');
  await s.emitir('group-participants.update', { id: 'g1@g.us', action: 'add' });
  ok((await s.opts.cachedGroupMetadata('g1@g.us')) === undefined, 'entrou gente: a lista guardada é descartada');

  /* lista vazia (o WhatsApp não respondeu a tempo) e nenhum grupo da tabela: falha, não "grupo não existe" */
  const guardados = s.grupos;
  s.grupos = {};
  e = null;
  try { await wa.mapearGrupos(['Multimídia · Geral']); } catch (x) { e = x; }
  ok(e && /lista de grupos/.test(e.message), 'lista vazia: erro (a rodada tenta de novo)', String(e?.message));
  s.grupos = { 'z@g.us': { id: 'z@g.us', subject: 'Outro grupo', participants: [] } };
  e = null;
  try { await wa.mapearGrupos(['Multimídia · Geral', 'Multimídia · Foto']); } catch (x) { e = x; }
  ok(e && /nenhum grupo da tabela/.test(e.message), 'nenhum grupo da tabela: erro', String(e?.message));
  s.grupos = guardados;

  /* 2 · quem da cobrança está no grupo */
  s.grupos['g1@g.us'].participants = [
    { id: '111111111111111@lid', phoneNumber: '552188887777@s.whatsapp.net' },
    { id: '222222222222222@lid' },
    { id: '5521977776666@s.whatsapp.net' },
  ];
  s.mapaLid = { '5521955554444@s.whatsapp.net': '222222222222222:3@lid' };
  const r = await wa.mencoesDoGrupo('g1@g.us', ['5521988887777', '5521955554444', '5521977776666', '5521933332222']);
  ok(r[0].jid === '111111111111111@lid', 'pelo número que o grupo mostra (conta sem o 9)');
  ok(r[1].jid === '222222222222222@lid', 'pelo @lid quando o grupo esconde o número', JSON.stringify(r[1]));
  ok(r[2].jid === '5521977776666@s.whatsapp.net', 'pelo número no grupo antigo');
  ok(r[3].jid === null, 'quem não está no grupo: sem menção');
  ok(!s.lidPedidos.includes('5521988887777@s.whatsapp.net') && !s.lidPedidos.includes('5521977776666@s.whatsapp.net'),
    'só pergunta ao WhatsApp por quem o grupo não mostrou', JSON.stringify(s.lidPedidos));

  /* 3 · postar: "digitando", a mensagem, e o id */
  const id = await wa.postar('g1@g.us', 'oi grupo', ['111111111111111@lid']);
  ok(id === 'MSG1' && s.enviados[0].text === 'oi grupo' && JSON.stringify(s.enviados[0].mentions) === '["111111111111111@lid"]', 'a mensagem sai com as menções');
  ok(JSON.stringify(s.presencas) === JSON.stringify([['composing', 'g1@g.us'], ['paused', 'g1@g.us']]), '"digitando" antes, "parou" depois');
  await wa.postar('g1@g.us', 'sem menção', []);
  ok(!('mentions' in s.enviados[1]), 'sem menção, sem o campo');

  /* 4 · o WhatsApp devolve erro para a mensagem: "recusado" (como atualização ou junto com a mensagem) */
  const original = s.sendMessage;
  s.sendMessage = async (jid, conteudo) => {
    s.enviados.push({ jid, ...conteudo });
    const msg = s.responder(jid, conteudo);
    setTimeout(() => s.emitir('messages.update', [{ key: { id: msg.key.id, fromMe: true }, update: { status: 0, messageStubParameters: ['479'] } }]), 50);
    return msg;
  };
  e = null;
  try { await wa.postar('g1@g.us', 'vai ser recusada', []); } catch (x) { e = x; }
  ok(e?.fase === 'recusado' && /479/.test(e.message), 'erro devolvido: fase "recusado" com o código', String(e?.message));
  s.sendMessage = async (jid, conteudo) => {
    s.enviados.push({ jid, ...conteudo });
    const msg = s.responder(jid, conteudo);
    setTimeout(() => s.emitir('messages.upsert', { type: 'append', messages: [{ key: { id: msg.key.id, fromMe: true }, status: 0, messageStubParameters: ['463'] }] }), 50);
    return msg;
  };
  e = null;
  try { await wa.postar('g1@g.us', 'recusada junto com a própria mensagem', []); } catch (x) { e = x; }
  ok(e?.fase === 'recusado' && /463/.test(e.message), 'erro que vem junto com a própria mensagem também conta', String(e?.message));

  /* 5 · a biblioteca joga erro com a conexão de pé (lista do grupo, chaves): "antes" */
  s.sendMessage = async () => { throw new Error('All encryptions failed'); };
  e = null;
  try { await wa.postar('g1@g.us', 'x', []); } catch (x) { e = x; }
  ok(e?.fase === 'antes', 'erro antes de sair, conexão de pé: "antes" (tenta de novo)', String(e?.fase));

  /* 6 · o envio não volta a tempo: "durante" (pode ter saído) */
  s.sendMessage = () => new Promise(() => {});
  e = null;
  try { await wa.postar('g1@g.us', 'fica no ar', []); } catch (x) { e = x; }
  ok(e?.fase === 'durante', 'sem resposta no prazo: fase "durante"', String(e?.fase));
  s.sendMessage = original;

  /* 7 · conexão caiu: "antes" (nada saiu); o 515 reabre e só fica pronto em dia */
  await s.emitir('connection.update', queda(515));
  ok(!wa.aberto(), 'caiu: fechado');
  e = null;
  try { await wa.postar('g1@g.us', 'x', []); } catch (x) { e = x; }
  ok(e?.fase === 'antes', 'sem conexão: fase "antes"');
  await espera(700);
  ok(lib.socks.length === 2, 'o 515 (reiniciar) abre um socket novo em meio segundo', String(lib.socks.length));
  await lib.socks[1].emitir('connection.update', { connection: 'connecting', receivedPendingNotifications: false });
  await lib.socks[1].emitir('connection.update', { connection: 'open' });
  ok(!wa.aberto(), 'depois de reabrir, espera ficar em dia de novo');
  await lib.socks[1].emitir('connection.update', { receivedPendingNotifications: true });
  ok(wa.aberto(), 'em dia: pronto de novo');
  await wa.fechar();
}

/* 8 · quedas definitivas: o robô para e avisa, sem reconectar em laço */
for (const [codigo, motivo] of [[401, 'logout'], [403, 'barrado'], [500, 'sessao'], [411, 'sessao'], [440, 'substituida']]) {
  const lib = bibliotecaDeMentira();
  const saidas = [];
  const wa = await abrir(lib, { aoSairDeVez: (m) => saidas.push(m) });
  await emDia(lib.socks[0]);
  await lib.socks[0].emitir('connection.update', queda(codigo));
  await espera(600);
  ok(JSON.stringify(saidas) === JSON.stringify([motivo]) && lib.socks.length === 1, `queda ${codigo}: "${motivo}", sem reconectar`, JSON.stringify(saidas));
  await wa.fechar();
}
/* e uma queda comum reconecta sozinha */
{
  const lib = bibliotecaDeMentira();
  const saidas = [];
  const wa = await abrir(lib, { aoSairDeVez: (m) => saidas.push(m) });
  await emDia(lib.socks[0]);
  await lib.socks[0].emitir('connection.update', queda(428));
  ok(!saidas.length && /tento de novo em 10 s/.test(LOG[LOG.length - 1]), 'queda comum (428): tenta de novo, com espera', LOG[LOG.length - 1]);
  await wa.fechar();
}

/* 9 · pareamento: QR, ou código de 8 letras pedido uma vez só */
{
  const lib = bibliotecaDeMentira();
  const qrs = [];
  const wa1 = await abrir(lib, { aoQR: (q) => qrs.push(q) });
  await lib.socks[0].emitir('connection.update', { qr: 'QR-1' });
  await lib.socks[0].emitir('connection.update', { qr: 'QR-2' });
  ok(JSON.stringify(qrs) === '["QR-1","QR-2"]', 'cada QR novo é mostrado');
  const lib2 = bibliotecaDeMentira();
  const codigos = [];
  const wa2 = await abrir(lib2, { codigoPara: '5521972976946', aoCodigo: (c) => codigos.push(c), aoQR: () => codigos.push('QR!') });
  await lib2.socks[0].emitir('connection.update', { qr: 'QR-1' });
  await lib2.socks[0].emitir('connection.update', { qr: 'QR-2' });
  ok(JSON.stringify(codigos) === '["ABCD1234"]' && lib2.socks[0].codigos === 1 && lib2.socks[0].numeroDoCodigo === '5521972976946',
    'com código: pede uma vez, para o número da igreja, e não mostra QR', JSON.stringify(codigos));
  await wa1.fechar();
  await wa2.fechar();
}

/* 10 · com as bibliotecas instaladas (no Mac, depois do npm ci): os nomes que o
   robô usa existem na versão travada do Baileys. Sem elas (no repositório), pula */
{
  let b = null;
  try { b = await carregarBaileys(); } catch { /* sem node_modules do robô */ }
  if (b) {
    ok(typeof b.makeWASocket === 'function' && typeof b.useMultiFileAuthState === 'function' && typeof b.fetchLatestBaileysVersion === 'function',
      'Baileys de verdade: socket, sessão e versão');
    const D = b.DisconnectReason;
    ok(D.loggedOut === 401 && D.restartRequired === 515 && D.connectionReplaced === 440 && D.forbidden === 403 && D.badSession === 500 && D.multideviceMismatch === 411,
      'Baileys de verdade: os códigos de queda que o robô trata');
    ok(b.isLidUser('1@lid') && !b.isLidUser('1@s.whatsapp.net') && b.jidNormalizedUser('5521972976946:7@s.whatsapp.net') === '5521972976946@s.whatsapp.net',
      'Baileys de verdade: @lid e número');
    ok(typeof b.Browsers.macOS === 'function' && typeof b.logger?.info === 'function', 'Baileys de verdade: navegador e registro mudo');
  } else {
    console.log('  (Baileys não instalado aqui: conferência da biblioteca de verdade pulada)');
  }
}

console.log(`robô do WhatsApp, ligação com o WhatsApp: ${feitas - falhas}/${feitas}`);
if (falhas) process.exit(1);
process.exit(0);
