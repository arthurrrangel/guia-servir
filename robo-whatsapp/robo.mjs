#!/usr/bin/env node
/* O ROBÔ DO WHATSAPP DA ESCALA · 26/10/2026.

   Pedido do Arthur: "tá tudo liberado, eu quero tudo automatizado". A escala
   da Mídia sai sozinha nos 8 grupos da Multimídia, pelo número da igreja,
   2 dias antes de cada culto, e o grupo geral é cobrado com @ até todos
   confirmarem. Roda no MacBook dele, como serviço do macOS (launchd).
   Depois: "Gostaria de na aba do sistema ter a opção de disparar escala,
   através desse robo" e "Para todos os ministérios". O serviço passa a cada
   30 s no sistema e atende o botão "Mandar agora pelo robô" de qualquer
   ministério da tabela (config.mjs; pedidos.mjs).

   Modos:
     node robo.mjs                  o serviço (o launchd chama assim)
     node robo.mjs --parear         QR code para ligar o robô ao número da igreja
     node robo.mjs --parear --codigo  o mesmo, por código de 8 letras (sem câmera)
     node robo.mjs --grupos         confere os grupos da tabela (com o serviço parado)
     node robo.mjs --grupos --refixar  aceita os grupos de agora como os certos
                                    (depois de recriar ou renomear um grupo de propósito)
     node robo.mjs --ensaio [ministério] [datas]
                                    lê a escala no sistema e diz o que faria, sem WhatsApp
                                    (ministério: midia, louvor, servico; sem ele, midia)
     node robo.mjs --status         resumo do serviço (conexão, grupos, última rodada)
     node robo.mjs --conferido AAAA-MM-DD "<nome do grupo>"|cobranca saiu|nao-saiu
                                    depois de conferir um envio incerto no grupo
     node robo.mjs --mandar-agora AAAA-MM-DD [ministério]
                                    manda já a escala daquele dia (pedido do Arthur);
                                    quem manda é o serviço, na próxima volta (até 30 s)
     node robo.mjs --a-partir-de AAAA-MM-DDTHH:MM-03:00
                                    de quando o robô cuida das escalas (o que
                                    saía antes disso fica com quem mandava)

   Para parar tudo na hora: pausar.command (cria o arquivo PAUSADO nesta pasta).
   Nada de nome ou telefone vai para o registro (logs/robo.log). */

import {
  appendFileSync, closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { CONFIG } from './config.mjs';
import * as R from './regras.mjs';
import { executarRodada } from './rodada.mjs';
import * as P from './pedidos.mjs';

const PASTA = dirname(fileURLToPath(import.meta.url));
const ARQ = {
  estado: join(PASTA, 'estado.json'),
  anterior: join(PASTA, 'estado.anterior.json'),
  fixos: join(PASTA, 'grupos-fixos.json'),
  status: join(PASTA, 'status.json'),
  pausa: join(PASTA, 'PAUSADO'),
  env: join(PASTA, '.env'),
  logs: join(PASTA, 'logs'),
  sessao: join(PASTA, 'sessao'),
  precisaParear: join(PASTA, 'PRECISA-PAREAR'),
  pid: join(PASTA, 'robo.pid'),
  trava: join(PASTA, 'estado.trava'),
  qr: join(PASTA, 'qr.html'),
  pedido: join(PASTA, 'pedido-mandar-agora.json'),
  noServidor: join(PASTA, 'NO-SERVIDOR'),
};
const NO_SERVICO = process.env.ROBO_SERVICO === '1';
/* Mac (launchd, notificação, caffeinate) ou servidor Linux (systemd) */
const NO_MAC = process.platform === 'darwin';
const CONFIGURAR = NO_MAC ? 'o configurar.command' : 'o servidor/configurar-servidor.sh';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const entre = ([a, b]) => (a + Math.random() * (b - a)) * 1000;

/* ------------------------------------------------------------ registro --- */
function log(...partes) {
  const linha = `${new Date().toISOString()} ${partes.join(' ')}`;
  if (!NO_SERVICO) console.log(linha);
  try { mkdirSync(ARQ.logs, { recursive: true }); appendFileSync(join(ARQ.logs, 'robo.log'), linha + '\n'); } catch { /* sem disco, segue */ }
}
/* nada de erro solto derrubando o serviço em laço: registra; o que não tem
   conserto sai com erro e o launchd religa em 30 s */
process.on('unhandledRejection', (e) => log('ERRO sem tratamento:', e?.message || String(e)));
process.on('uncaughtException', (e) => { log('ERRO fatal:', e?.stack || e?.message || String(e)); process.exit(1); });

function girarLog() {
  try {
    const f = join(ARQ.logs, 'robo.log');
    if (statSync(f).size > 5 * 1024 * 1024) renameSync(f, f + '.1');
  } catch { /* ainda não existe */ }
}

/* o mesmo aviso não vira notificação mais de uma vez por dia */
const avisos = [];
const avisados = new Map();
function avisar(texto, chave = texto) {
  log('AVISO', texto);
  const hoje = R.agoraSP().data;
  const k = `${hoje}|${chave}`;
  if (avisados.has(k)) return;
  avisados.set(k, true);
  if (avisados.size > 500) avisados.delete(avisados.keys().next().value);
  avisos.push({ em: new Date().toISOString(), texto });
  if (avisos.length > 30) avisos.shift();
  /* a notificação do Mac, para o Arthur ver sem abrir nada (no servidor, o
     aviso fica no registro e no --status) */
  if (NO_MAC) execFile('/usr/bin/osascript', ['-e', `display notification ${JSON.stringify(texto)} with title "Robô do WhatsApp"`], () => {});
}

/* -------------------------------------------------------------- arquivos --- */
function lerSegredo() {
  try {
    const m = /^ROBO_WHATSAPP_SEGREDO=(\S+)\s*$/m.exec(readFileSync(ARQ.env, 'utf8'));
    return m?.[1] || null;
  } catch { return null; }
}

/* O ESTADO É O QUE IMPEDE MANDAR DUAS VEZES. Arquivo estragado nunca vira
   "estado vazio" (isso mandaria tudo de novo): usa a cópia da gravação
   anterior, avisando, ou para tudo até alguém conferir. */
/* 26/10: os outros ministérios (a Mídia segue no topo), os pedidos do botão
   já atendidos e os relatos que o sistema ainda não confirmou (regras.mjs) */
const normalizarEstado = (e) => R.normalizarEstado(e);
function carregarEstado() {
  const ler = (f) => normalizarEstado(JSON.parse(readFileSync(f, 'utf8')));
  if (existsSync(ARQ.estado)) {
    try { return ler(ARQ.estado); } catch { /* tenta a cópia */ }
    if (existsSync(ARQ.anterior)) {
      try {
        const e = ler(ARQ.anterior);
        avisar('O arquivo de estado do robô estava estragado; usei a cópia da gravação anterior.', 'estado-anterior');
        return e;
      } catch { /* as duas estragadas */ }
    }
    throw new Error('o arquivo de estado do robô (estado.json) está estragado; nada sai até alguém conferir');
  }
  if (existsSync(ARQ.anterior)) {
    try { return ler(ARQ.anterior); } catch { throw new Error('o arquivo de estado do robô está estragado; nada sai até alguém conferir'); }
  }
  return normalizarEstado({});
}
function salvarEstado(e) {
  const tmp = ARQ.estado + '.tmp';
  writeFileSync(tmp, JSON.stringify(e, null, 1));
  if (existsSync(ARQ.estado)) copyFileSync(ARQ.estado, ARQ.anterior);
  renameSync(tmp, ARQ.estado);
}

let status = {};
function salvarStatus(parte) {
  status = { ...status, ...parte, atualizadoEm: new Date().toISOString(), avisos };
  try {
    const tmp = ARQ.status + '.tmp';
    writeFileSync(tmp, JSON.stringify(status, null, 1));
    renameSync(tmp, ARQ.status);
  } catch { /* segue */ }
}

/* outro processo do robô de verdade, e não um número de processo reaproveitado
   depois de reiniciar o Mac (o arquivo .pid sobra quando o Mac desliga) */
function processoDoRobo(pid) {
  if (!pid || pid === process.pid) return false;
  try {
    const cmd = execFileSync('/bin/ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
    return /robo\.mjs/.test(cmd);
  } catch { return false; }
}
function pidDoServico() {
  try {
    const pid = Number(readFileSync(ARQ.pid, 'utf8').trim());
    return processoDoRobo(pid) ? pid : null;
  } catch { return null; }
}

/* a trava do estado: só um escreve por vez (a rodada ou o --conferido) */
async function comTrava(fn, esperarMs = 0) {
  const ate = Date.now() + esperarMs;
  for (;;) {
    try {
      const fd = openSync(ARQ.trava, 'wx');
      writeFileSync(fd, String(process.pid));
      closeSync(fd);
      break;
    } catch {
      let dono = 0;
      try { dono = Number(readFileSync(ARQ.trava, 'utf8').trim()); } catch { /* sumiu agora */ }
      if (!processoDoRobo(dono)) { rmSync(ARQ.trava, { force: true }); continue; }
      if (Date.now() >= ate) throw new Error('o estado está em uso por uma rodada; tente de novo em alguns minutos');
      await espera(2000);
    }
  }
  try { return await fn(); } finally { rmSync(ARQ.trava, { force: true }); }
}

/* O WHATSAPP COM AS TRAVAS DO ROBÔ, para o serviço e para o pareamento:
   · os grupos ficam presos ao endereço do primeiro encontro (regras.mjs,
     conferirFixos): grupo renomeado para um nome da tabela nunca recebe nada;
   · nada sai por um número que não seja o da igreja, mesmo que a conexão
     tenha ficado pronta no meio de uma rodada (antes da conferência do tick) */
function lerFixos() { try { return JSON.parse(readFileSync(ARQ.fixos, 'utf8')); } catch { return {}; } }
function comFixos(wa) {
  return {
    ...wa,
    postar: async (jid, texto, mentions) => {
      if (!ehDaIgreja(wa.conta())) {
        const e = new Error('o robô não está ligado ao número da igreja');
        e.fase = 'antes';
        throw e;
      }
      return wa.postar(jid, texto, mentions);
    },
    mapearGrupos: async (nomes) => {
      const mapa = await wa.mapearGrupos(nomes);
      const atuais = lerFixos();
      const r = R.conferirFixos(mapa, atuais);
      if (JSON.stringify(r.fixos) !== JSON.stringify(atuais)) {
        try { writeFileSync(ARQ.fixos, JSON.stringify(r.fixos, null, 1)); } catch { /* segue */ }
      }
      for (const n of r.trocados) avisar(`O grupo "${n}" não é mais o mesmo do começo (renomeado ou recriado). O robô não posta nele até alguém conferir.`, `trocado:${n}`);
      return r.mapa;
    },
  };
}

function pausar(motivo) {
  try { writeFileSync(ARQ.pausa, `${new Date().toISOString()} ${motivo}\n`); } catch { /* segue */ }
}

async function lerDia(segredo, slug, data) {
  const url = `${CONFIG.site}/api/robo/grupos?equipe=${encodeURIComponent(slug)}&data=${data}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${segredo}` }, signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) throw new Error(`o sistema respondeu ${r.status}${j?.erro ? ' ' + j.erro : ''}`);
  return j;
}

/* a passada no sistema: conta que está vivo, devolve relatos, leva pedidos */
async function passarNoSistema(segredo, corpo) {
  const r = await fetch(`${CONFIG.site}/api/robo/pedidos`, {
    method: 'POST', body: JSON.stringify(corpo), signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${segredo}`, 'Content-Type': 'application/json' },
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) throw new Error(`o sistema respondeu ${r.status}${j?.erro ? ' ' + j.erro : ''}`);
  return j;
}

/* pareado de verdade: o WhatsApp devolveu a conta deste aparelho. Um
   pareamento interrompido deixa sessao/creds.json sem ela (o Baileys grava
   as chaves antes de o celular aceitar) */
function pareado() {
  try {
    const c = JSON.parse(readFileSync(join(ARQ.sessao, 'creds.json'), 'utf8'));
    return !!(c?.account && c?.me?.id);
  } catch { return false; }
}

const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const ehDaIgreja = (conta) => !!conta && R.variantesBR(CONFIG.numeroDaIgreja).includes(conta);

/* ------------------------------------------------------------- ensaio --- */
async function ensaio(segredo, slug, datas) {
  const agora = R.agoraSP();
  const cfgM = R.configDoMinisterio(CONFIG, slug);
  if (!cfgM) { console.log(`ministério "${slug}" não está na tabela do robô (${Object.keys(CONFIG.ministerios).join(', ')})`); return; }
  const estadoTodo = carregarEstado();
  const estado = R.visaoDoMinisterio(estadoTodo, slug, CONFIG.principal);
  const alvo = datas.length ? datas : [0, 1, 2, 3, 4, 5, 6].map((n) => R.somaDias(agora.data, n));
  const inicioMs = Date.parse(estado.inicio || '') || Date.now();
  console.log(`ENSAIO · ${slug}${cfgM.automatico ? ' (sai sozinho)' : ' (só a pedido, pelo botão)'} · nada é mandado · ${agora.data} ${hhmm(agora.min)} · robô ${estado.inicio ? 'ligado desde ' + estado.inicio.slice(0, 16) : 'ainda não ligado (conta a partir de agora)'}`);
  for (const data of alvo) {
    let resp;
    try { resp = await lerDia(segredo, slug, data); } catch (e) { console.log(`${data} · ERRO: ${e.message}`); continue; }
    if (!resp.culto?.preenchidos) { console.log(`${data} · sem escala da ${resp.equipe?.nome || slug}${resp.culto?.existe ? ' (culto sem ninguém escalado)' : ''}`); continue; }
    const c = resp.culto;
    console.log(`${data} · ${c.evento || 'culto'} ${c.hora || 'sem hora'} · ${c.preenchidos} de ${c.postos} postos com gente`);
    const momento = R.momentoDaPrimeira(data, CONFIG.rodadas, CONFIG.diasDeAntecedencia);
    const dono = momento == null || momento >= inicioMs;
    const quando = `${R.somaDias(data, -CONFIG.diasDeAntecedencia)} às ${CONFIG.rodadas.find((r) => r.primeira)?.hhmm}`;
    for (const l of resp.linhas) {
      const grupo = cfgM.grupos[l.nome];
      const e = estado.envios[data]?.[l.gid];
      const r = R.resumoSemDados(l.texto);
      const situacao = l.vazio ? 'nada neste dia'
        : !grupo ? 'SEM GRUPO NA TABELA (seria pulado)'
          : e?.situacao === 'incerto' ? 'INCERTO: parado até conferir'
            : !e ? (!cfgM.automatico ? 'sai quando a liderança apertar o botão' : dono ? `primeira postagem em ${quando}` : `não é do robô (a hora de sair, ${quando}, foi antes de ele começar)`)
              : e.ass !== l.ass ? (cfgM.automatico ? 'mudou depois do envio: vai a versão nova na próxima rodada' : 'mudou depois do envio: vai a versão nova no próximo pedido') : `já postado (${e.em.slice(0, 16)})`;
      console.log(`  ${l.nome} → ${grupo || '?'} · ${r.linhas} linhas, ${r.caracteres} caracteres · ${situacao}`);
    }
    if (resp.cobranca && cfgM.grupoDaCobranca) {
      console.log(`  cobrança: ${resp.cobranca.pendentes} ${resp.cobranca.pendentes === 1 ? 'pessoa falta' : 'pessoas faltam'} confirmar, ${resp.cobranca.mencoes.length} com telefone para o @`);
    }
  }
}

/* ------------------------------------------------------------ serviço --- */
async function servico(segredo) {
  const outro = pidDoServico();
  if (outro) {
    avisar(`Já existe um robô rodando ${NO_MAC ? 'neste Mac' : 'neste servidor'} (processo ${outro}); este segundo saiu.`, 'duplicado');
    await espera(1500);
    process.exit(0);
  }
  writeFileSync(ARQ.pid, String(process.pid));
  girarLog();
  /* o Mac não dorme sozinho enquanto o robô roda (tampa aberta). O
     caffeinate acompanha este processo e acaba junto com ele */
  if (NO_MAC) {
    try {
      const c = spawn('/usr/bin/caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' });
      c.on('error', () => log('sem caffeinate: o Mac pode dormir com o robô ligado'));
      c.unref();
    } catch { /* sem caffeinate, segue */ }
  }
  const { abrirWhatsApp } = await import('./whatsapp.mjs');

  /* configuração com erro (grupo em dois ministérios, cobrança fora dos
     grupos): não sai nada até alguém arrumar config.mjs */
  const errosDaConfig = R.conferirConfig(CONFIG);
  if (errosDaConfig.length) {
    avisar(`A configuração do robô tem erro: ${errosDaConfig.join('; ')}. Nada sai até arrumar o config.mjs.`, 'config');
    salvarStatus({ conectado: false, motivo: 'configuração com erro' });
    setInterval(() => {}, 3600000);
    return;
  }

  /* sem sessão, ou com a sessão recusada, o serviço fica parado (sem
     reiniciar em laço e sem notificar a cada minuto) até o pareamento */
  const parado = (motivo) => {
    try { writeFileSync(ARQ.precisaParear, motivo + '\n'); } catch { /* segue */ }
    avisar(`O robô está desligado do número da igreja (${motivo}). Rode ${CONFIGURAR} para parear de novo.`, 'parear');
    salvarStatus({ conectado: false, motivo });
    setInterval(() => {}, 3600000);
  };
  if (!pareado() || existsSync(ARQ.precisaParear)) {
    parado(existsSync(ARQ.precisaParear) ? readFileSync(ARQ.precisaParear, 'utf8').trim() : 'nunca pareado');
    return;
  }

  let caiu = false;
  let ref = null;
  const wa = await abrirWhatsApp({
    pastaSessao: ARQ.sessao, log, cfg: CONFIG,
    /* o serviço nunca pareia sozinho: se o WhatsApp pedir QR, a sessão caiu */
    aoQR: () => { if (caiu) return; caiu = true; ref?.fechar(); parado('o WhatsApp pediu QR de novo'); },
    aoSairDeVez: (motivo) => {
      if (caiu) return;
      caiu = true;
      parado({
        logout: 'o WhatsApp desconectou o aparelho',
        barrado: 'o WhatsApp barrou a conexão (403): o número pode estar bloqueado',
        sessao: 'a sessão do robô estragou',
        substituida: 'outro programa abriu a mesma sessão do robô; este parou para não mandar em dobro',
      }[motivo] || `o WhatsApp encerrou a sessão (${motivo})`);
    },
  });
  ref = wa;
  const waFixo = comFixos(wa);

  /* o número conectado tem de ser o da igreja: nunca posta por outro */
  const conferirConta = () => {
    const conta = wa.conta();
    if (conta && !ehDaIgreja(conta)) {
      caiu = true;
      avisar(`O robô está ligado a OUTRO número, não ao da igreja. Nada sai. Rode ${CONFIGURAR} e leia o QR com o celular da igreja.`, 'conta');
      salvarStatus({ conectado: false, motivo: 'número errado' });
      wa.fechar();
      return false;
    }
    return true;
  };

  const tentativas = new Map();
  let ocupado = false;
  let encerrando = false;
  let ultima = null;
  let gruposConferidos = false;
  let inicioConferido = false;
  let ultimaPassada = 0;

  /* como o robô está, para a tela do líder */
  const comoEsta = () => ({
    conectado: wa.aberto() && ehDaIgreja(wa.conta()), pausado: existsSync(ARQ.pausa), versao: CONFIG.versao,
  });

  /* O BOTÃO "MANDAR AGORA PELO ROBÔ" (115, pedidos.mjs). Uma passada: o
     batimento e os relatos que faltam; o sistema devolve os pedidos abertos.
     Cada pedido roda com a trava do estado, como uma rodada. */
  const enviarRelatos = async () => {
    let fila = [];
    try { fila = carregarEstado().relatos || []; } catch (e) { avisar(e.message, 'estado'); return null; }
    const resp = await passarNoSistema(segredo, P.corpoDaPassada({ ...comoEsta(), cfg: CONFIG, relatos: fila }));
    if (resp.vistos?.length) {
      await comTrava(async () => { const e = carregarEstado(); P.tirarVistos(e, resp.vistos); salvarEstado(e); }, 60000)
        .catch((e) => log('não consegui tirar os relatos já vistos:', e.message));
    }
    /* o relato final que não pegou: o sistema já tinha fechado o pedido (venceu
       ou o robô ficou fora do ar). A tela diz o que o sistema decidiu; o
       registro guarda o que o robô fez */
    for (const r of fila) {
      if (r.status !== 'enviando' && resp.vistos?.includes(r.id) && !resp.aplicados?.includes(r.id)) {
        log(`relato ${r.id.slice(0, 8)} (${r.status}) chegou com o pedido já fechado no sistema: ${r.resultado?.resumo || ''}`);
      }
    }
    return resp;
  };
  const atenderOBotao = async () => {
    let resp;
    try { resp = await enviarRelatos(); } catch (e) { log('pedidos: o sistema não respondeu:', e.message); return; }
    if (!resp) return;
    let atendeu = false;
    for (const pedido of (resp.pedidos || []).slice(0, 5)) {
      if (encerrando || caiu) break;
      let estado0;
      try { estado0 = carregarEstado(); } catch (e) { avisar(e.message, 'estado'); return; }
      const d = P.decidirPedido(pedido, {
        cfg: CONFIG, estado: estado0, pausado: existsSync(ARQ.pausa), conectado: wa.aberto() && ehDaIgreja(wa.conta()), hoje: R.agoraSP().data,
        agoraMs: Date.parse(resp.agora) || Date.now(),
      });
      if (d.tipo === 'ignorar') { log(`pedido ${pedido.equipe} ${pedido.data}: velho demais; o sistema fecha`); continue; }
      if (d.tipo === 'repetir' || d.tipo === 'final') {
        if (d.tipo === 'final') log(`pedido ${pedido.equipe} ${pedido.data}: recusado (${d.relato.resultado?.resumo})`);
        await comTrava(async () => { const e = carregarEstado(); P.guardarRelato(e, d.relato, new Date().toISOString()); salvarEstado(e); }, 60000)
          .catch((e) => log('não consegui guardar o relato:', e.message));
        atendeu = true;
        continue;
      }
      log(`pedido do sistema: ${pedido.equipe} ${pedido.data}`);
      /* SÓ MANDA O QUE CONSEGUIU MARCAR. O "mandando agora" vai antes e
         espera a resposta: pedido que venceu enquanto o robô mandava outro, ou
         que um segundo toque fechou, não pega a marca, e não sai */
      let marca = null;
      try {
        marca = await passarNoSistema(segredo, P.corpoDaPassada({ ...comoEsta(), cfg: CONFIG, relatos: [{ id: pedido.id, status: 'enviando' }] }));
      } catch (e) { log(`pedido ${pedido.equipe} ${pedido.data}: não consegui marcar no sistema (${e.message}); fica para a próxima`); continue; }
      if (!marca.aplicados?.includes(pedido.id)) { log(`pedido ${pedido.equipe} ${pedido.data}: o sistema já fechou este pedido; não mando`); continue; }
      const relato = await comTrava(async () => {
        const estado = carregarEstado();
        const rel = await P.atenderPedido({
          pedido, estado, cfg: CONFIG, wa: waFixo, lerDia: (slug, data) => lerDia(segredo, slug, data),
          avisar, log, pausado: () => encerrando || existsSync(ARQ.pausa), pausar,
          espera: (faixa) => espera(entre(faixa)), salvar: () => salvarEstado(estado), agora: R.agoraSP(),
        });
        /* parar o serviço no meio (configurar.command) não fecha o pedido:
           ele continua aberto no sistema e o robô termina quando voltar */
        if (!encerrando) P.guardarRelato(estado, rel, new Date().toISOString());
        salvarEstado(R.podar(estado, R.agoraSP().data));
        return rel;
      }, 120000).catch((e) => { log(`pedido ${pedido.equipe} ${pedido.data}: não começou:`, e.message); return null; });
      if (relato) { log(`pedido ${pedido.equipe} ${pedido.data}: ${relato.status} (${relato.resultado?.resumo || ''})`); atendeu = true; }
    }
    if (atendeu && !encerrando) {
      try { await enviarRelatos(); } catch (e) { log('relatos: o sistema não respondeu (sigo tentando):', e.message); }
    }
  };

  const tick = async () => {
    if (ocupado || caiu || encerrando) return;
    ocupado = true;
    try {
      const agora = R.agoraSP();
      if (wa.aberto() && !conferirConta()) return;
      /* o dia em que o robô começou a funcionar (conectado ao número da
         igreja): escala cuja hora de sair veio antes disso é de quem já
         mandava (regras.mjs, primeiraPermitida). Fica gravado; para mudar,
         --a-partir-de */
      if (wa.aberto() && !inicioConferido) {
        await comTrava(async () => {
          const e = carregarEstado();
          if (!e.inicio) { e.inicio = new Date().toISOString(); salvarEstado(e); log('primeira vez no ar: o robô cuida das escalas que saem a partir de agora'); }
        }, 60000);
        inicioConferido = true;
      }
      if (wa.aberto() && !gruposConferidos) {
        try {
          const mapa = await waFixo.mapearGrupos(R.todosOsGrupos(CONFIG));
          salvarStatus({ grupos: Object.fromEntries(Object.entries(mapa).map(([n, g]) => [n, g.jid
            ? { ok: true, participantes: g.participantes, soAdmin: g.soAdmin, admin: g.admin, lid: g.lid } : { ok: false, erro: g.erro }])) });
          gruposConferidos = true;
          const faltam = Object.entries(mapa).filter(([, g]) => !g.jid).map(([n]) => n);
          if (faltam.length) avisar(`Grupos que o robô não achou no WhatsApp: ${faltam.join(', ')}`, 'grupos');
        } catch (e) { log('não consegui conferir os grupos agora:', e.message); }
      }
      let feitas;
      try { feitas = carregarEstado().rodadas; } catch (e) { avisar(e.message, 'estado'); return; }
      /* as rodadas do horário são só do ministério automático (a Mídia) */
      const principal = CONFIG.principal;
      const automatico = !!CONFIG.ministerios[principal]?.automatico;
      for (const rodada of automatico ? R.rodadasDevidas(CONFIG.rodadas, agora, feitas, CONFIG.toleranciaMin) : []) {
        const chave = `${agora.data} ${rodada.hhmm}`;
        const ult = tentativas.get(chave);
        if (ult && Date.now() - ult < CONFIG.retentarAposMin * 60000) continue;
        tentativas.set(chave, Date.now());
        const res = await comTrava(async () => {
          const estado = carregarEstado();
          let r;
          try {
            r = await executarRodada({
              wa: waFixo, lerDia: (d) => lerDia(segredo, principal, d), rodada, agora: R.agoraSP(),
              estado: R.visaoDoMinisterio(estado, principal, principal), cfg: R.configDoMinisterio(CONFIG, principal),
              avisar, log, pausado: () => encerrando || existsSync(ARQ.pausa), pausar,
              espera: (faixa) => espera(entre(faixa)), salvar: () => salvarEstado(estado),
            });
          } catch (e) {
            avisar(`A rodada das ${rodada.hhmm} parou no meio: ${e.message}`, `erro:${rodada.hhmm}`);
            r = { completa: false, motivo: e.message };
          }
          /* parar o serviço no meio (launchctl, configurar.command) não fecha
             a rodada: o que faltou sai quando ele voltar */
          if (r.completa && !encerrando) estado.rodadas[rodada.hhmm] = agora.data;
          salvarEstado(R.podar(estado, agora.data));
          return r;
        }, 120000).catch((e) => { avisar(`A rodada das ${rodada.hhmm} não começou: ${e.message}`, `trava:${rodada.hhmm}`); return { completa: false, motivo: e.message }; });
        log(`rodada ${rodada.hhmm}: ${res.completa ? 'completa' : 'incompleta'}${res.motivo ? ' (' + res.motivo + ')' : ''}`);
        if (res.completa) ultima = chave;
      }
      /* PEDIDO DO ARTHUR: mandar já a escala de um dia (--mandar-agora). Roda
         fora do horário, só para aquela data, sem cobrança; o que sai fica
         gravado como qualquer envio (sexta às 19:58 não repete) */
      if (existsSync(ARQ.pedido)) {
        let pedido = null;
        try { pedido = JSON.parse(readFileSync(ARQ.pedido, 'utf8')); } catch { /* estragado */ }
        const slugDoPedido = pedido?.equipe || CONFIG.principal;
        const ok = /^\d{4}-\d{2}-\d{2}$/.test(pedido?.data || '') && pedido.data >= agora.data && pedido.data <= R.somaDias(agora.data, CONFIG.diasDeVigia)
          && !!CONFIG.ministerios[slugDoPedido];
        const ult = tentativas.get('pedido');
        if (!ok) {
          log('pedido de envio antecipado inválido ou de data passada: descartado');
          rmSync(ARQ.pedido, { force: true });
        } else if (existsSync(ARQ.pausa)) {
          avisar(`O pedido de mandar a escala de ${pedido.data} está esperando: o robô está pausado.`, `pedido-pausado:${pedido.data}`);
        } else if (!ult || Date.now() - ult >= CONFIG.retentarAposMin * 60000) {
          tentativas.set('pedido', Date.now());
          const res = await comTrava(async () => {
            const estado = carregarEstado();
            let r;
            try {
              r = await executarRodada({
                wa: waFixo, lerDia: (d) => lerDia(segredo, slugDoPedido, d), rodada: P.RODADA_DO_PEDIDO,
                agora: R.agoraSP(), estado: R.visaoDoMinisterio(estado, slugDoPedido, CONFIG.principal),
                cfg: R.configDoMinisterio(CONFIG, slugDoPedido), soDatas: [pedido.data],
                avisar, log, pausado: () => encerrando || existsSync(ARQ.pausa), pausar,
                espera: (faixa) => espera(entre(faixa)), salvar: () => salvarEstado(estado),
              });
            } catch (e) {
              avisar(`O envio antecipado de ${pedido.data} parou no meio: ${e.message}`, `pedido-erro:${pedido.data}`);
              r = { completa: false, motivo: e.message };
            }
            salvarEstado(R.podar(estado, agora.data));
            return r;
          }, 120000).catch((e) => ({ completa: false, motivo: e.message }));
          log(`pedido ${slugDoPedido} ${pedido.data}: ${res.completa ? 'atendido' : 'incompleto'}${res.motivo ? ' (' + res.motivo + ')' : ''}`);
          if (res.completa && res.motivo !== 'pausado' && !encerrando) {
            /* só apaga se o pedido ainda é o mesmo (um pedido novo no meio fica) */
            try { if (JSON.parse(readFileSync(ARQ.pedido, 'utf8')).em === pedido.em) rmSync(ARQ.pedido, { force: true }); } catch { /* já saiu */ }
            tentativas.delete('pedido');
          }
        }
      }
      /* O BOTÃO DO SISTEMA (115): a cada 30 s, a passada no sistema */
      if (!encerrando && Date.now() - ultimaPassada >= CONFIG.pedidosACadaS * 1000) {
        ultimaPassada = Date.now();
        await atenderOBotao();
      }
      /* rodada que passou da tolerância sem completar: avisa uma vez e fecha */
      for (const r of CONFIG.rodadas) {
        const chave = `${agora.data} ${r.hhmm}`;
        if (tentativas.has(chave) && feitas[r.hhmm] !== agora.data && agora.min > R.minutos(r.hhmm) + CONFIG.toleranciaMin) {
          tentativas.delete(chave);
          avisar(`A rodada das ${r.hhmm} não conseguiu terminar. O que ficou para trás sai na próxima rodada.`, `fim:${r.hhmm}`);
        }
      }
      const proxima = !automatico ? null : CONFIG.rodadas.map((r) => r.hhmm).find((h) => R.minutos(h) > agora.min) || `${CONFIG.rodadas[0].hhmm} de amanhã`;
      salvarStatus({ conectado: wa.aberto(), conta: wa.conta(), ultimaRodada: ultima, proximaRodada: proxima, pausado: existsSync(ARQ.pausa) });
    } catch (e) {
      log('ERRO', e.message);
    } finally {
      ocupado = false;
    }
  };
  log(`serviço no ar · ${Object.entries(CONFIG.ministerios).map(([k, m]) => `${k}${m.automatico ? ' (sozinho)' : ' (a pedido)'}`).join(', ')} · rodadas ${CONFIG.rodadas.map((r) => r.hhmm).join(', ')}`);
  setInterval(tick, 30000);
  setTimeout(tick, 15000);
  /* com uma rodada ou um pedido em andamento (minutos), o tick está ocupado:
     o batimento sai por fora, para a tela não dizer "robô desligado" */
  setInterval(async () => {
    if (!ocupado || caiu || encerrando || Date.now() - ultimaPassada < 50000) return;
    ultimaPassada = Date.now();
    try { await passarNoSistema(segredo, P.corpoDaPassada({ ...comoEsta(), cfg: CONFIG })); } catch (e) { log('batimento: o sistema não respondeu:', e.message); }
  }, 20000);
  const sair = async () => {
    if (encerrando) return;
    encerrando = true;
    log('serviço parando');
    /* deixa a mensagem que está saindo terminar e ser gravada (até 100 s;
       o launchd espera 120, ExitTimeOut no configurar.command) */
    const ate = Date.now() + 100000;
    while (ocupado && Date.now() < ate) await espera(500);
    try { if (Number(readFileSync(ARQ.pid, 'utf8')) === process.pid) rmSync(ARQ.pid, { force: true }); } catch { /* segue */ }
    await wa.fechar();
    process.exit(0);
  };
  process.on('SIGTERM', sair);
  process.on('SIGINT', sair);
}

/* ----------------------------------------------- parear e conferir --- */
function servicoRodando() {
  const pid = pidDoServico();
  if (!pid) return false;
  console.log(`O serviço do robô está rodando (pid ${pid}). Pare antes (${CONFIGURAR} faz isso) ou veja o resumo com --status.`);
  return true;
}

async function parearOuConferir(modo, comCodigo, refixar) {
  if (servicoRodando()) process.exit(1);
  const { abrirWhatsApp } = await import('./whatsapp.mjs');
  const guardarSessaoAntiga = () => {
    if (!existsSync(ARQ.sessao)) return;
    const destino = `${ARQ.sessao}-antiga-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    renameSync(ARQ.sessao, destino);
    log(`sessão antiga guardada em ${destino.split('/').pop()}`);
  };
  if (modo === 'parear' && existsSync(ARQ.precisaParear)) guardarSessaoAntiga();
  if (modo === 'grupos' && !pareado()) { console.log('Ainda não pareado: rode --parear.'); process.exit(1); }
  /* o QR sai no terminal (cores fixas, preto sobre branco) e numa página que
     abre no navegador e se atualiza sozinha (qr.mjs) */
  const desenho = modo === 'parear' && !comCodigo ? await import('./qr.mjs') : null;
  let paginaAberta = false;
  const pagina = (html) => { try { writeFileSync(ARQ.qr, html, { mode: 0o600 }); } catch { /* segue */ } };
  const paginaFinal = (texto) => {
    if (!paginaAberta) return;
    pagina(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Robô do WhatsApp</title></head><body style="font:18px -apple-system,system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;text-align:center"><p>${texto}</p></body></html>\n`);
  };
  const wa = await abrirWhatsApp({
    pastaSessao: ARQ.sessao, log, cfg: CONFIG,
    codigoPara: modo === 'parear' && comCodigo ? CONFIG.numeroDaIgreja : null,
    aoCodigo: (c) => {
      console.log(`\nNo celular da IGREJA: WhatsApp Business > Dispositivos conectados > Conectar dispositivo > "Conectar com número de telefone".`);
      console.log(`Digite este código: ${String(c).slice(0, 4)}-${String(c).slice(4)}\n`);
    },
    aoQR: (qr) => {
      if (!desenho) return;
      let m;
      try { m = desenho.matriz(qr); } catch (e) { console.log('não consegui desenhar o QR:', e.message); return; }
      pagina(desenho.paraPagina(m));
      if (!paginaAberta) { paginaAberta = true; if (NO_MAC) execFile('/usr/bin/open', [ARQ.qr], () => {}); }
      console.clear();
      console.log('No celular da IGREJA (+55 21 97297-6946): WhatsApp Business > Configurações > Dispositivos conectados > Conectar dispositivo.');
      console.log('Leia o QR na página que abriu no navegador (ou este aqui). Ele troca a cada 20 segundos.\n');
      console.log(desenho.paraTerminal(m));
    },
    aoSairDeVez: (motivo) => {
      paginaFinal('O pareamento não terminou. Volte ao Terminal.');
      if (motivo === 'logout' || motivo === 'sessao') { guardarSessaoAntiga(); console.log('\nO WhatsApp recusou a sessão antiga. Rode de novo para ler um QR novo.'); }
      else if (motivo === 'barrado') console.log('\nO WhatsApp barrou a conexão (403). O número da igreja pode estar bloqueado: confira no celular.');
      else console.log('\nOutra conexão com a mesma sessão tomou o lugar. Pare o serviço e rode de novo.');
      process.exit(1);
    },
  });
  try { await wa.esperarAberto(modo === 'parear' ? 600000 : 90000); } catch (e) {
    paginaFinal('O pareamento não terminou. Volte ao Terminal.');
    console.log(`\n${e.message}. Rode de novo.`);
    process.exit(1);
  }
  const conta = wa.conta();
  if (!ehDaIgreja(conta)) {
    paginaFinal('Esse não é o celular da igreja. Volte ao Terminal.');
    console.log(`\nATENÇÃO: este aparelho ficou ligado ao número ${conta}, que NÃO é o da igreja (${CONFIG.numeroDaIgreja}).`);
    console.log('Vou desligar e apagar esta sessão. Rode de novo e leia o QR com o celular da igreja.');
    await wa.desligarAparelho();
    await espera(2000);
    guardarSessaoAntiga();
    process.exit(1);
  }
  paginaFinal('Conectado ao WhatsApp da igreja. Pode fechar esta aba.');
  console.log(`\nConectado ao número da igreja (${conta}).`);
  if (modo === 'parear') rmSync(ARQ.precisaParear, { force: true });
  await espera(3000);
  if (refixar) { rmSync(ARQ.fixos, { force: true }); console.log('Endereços dos grupos refeitos a partir de agora.'); }
  let mapa;
  try { mapa = await comFixos(wa).mapearGrupos(R.todosOsGrupos(CONFIG)); } catch (e) {
    console.log(`\nNão consegui ler os grupos: ${e.message}. Rode de novo.`);
    await wa.fechar();
    process.exit(1);
  }
  console.log('\nGrupos da tabela:');
  for (const [nome, g] of Object.entries(mapa)) {
    console.log(`  ${g.jid ? 'ok ' : 'XX '} ${nome}${g.jid ? ` · ${g.participantes} participantes${g.soAdmin ? (g.admin ? ' · só admin escreve (a igreja é admin)' : ' · SÓ ADMIN ESCREVE e a igreja não é') : ''}` : ` · ${g.erro}`}`);
  }
  await espera(2000);
  await wa.fechar();
  process.exit(0);
}

/* PEDE AO SERVIÇO PARA MANDAR JÁ A ESCALA DE UM DIA e acompanha até sair.
   Quem manda é o serviço (a sessão do WhatsApp é dele); aqui só fica o
   pedido e o acompanhamento pelo estado gravado. */
async function mandarAgora([data, slug = CONFIG.principal]) {
  const hoje = R.agoraSP().data;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '') || data < hoje || data > R.somaDias(hoje, CONFIG.diasDeVigia) || !CONFIG.ministerios[slug]) {
    console.log(`uso: node robo.mjs --mandar-agora AAAA-MM-DD [ministério] (de hoje até ${CONFIG.diasDeVigia} dias à frente; ministérios: ${Object.keys(CONFIG.ministerios).join(', ')})`);
    process.exit(1);
  }
  const tmp = ARQ.pedido + '.tmp';
  writeFileSync(tmp, JSON.stringify({ data, equipe: slug, em: new Date().toISOString() }));
  renameSync(tmp, ARQ.pedido);
  if (!pidDoServico()) {
    console.log('Pedido guardado, mas o serviço não está rodando: a escala sai quando ele voltar.');
    return;
  }
  if (existsSync(ARQ.pausa)) {
    console.log('Pedido guardado, mas o robô está PAUSADO: a escala sai quando ele for retomado.');
    return;
  }
  console.log(`Pedido feito: a escala de ${data} sai pelo serviço em até 30 segundos, com intervalo entre os grupos.`);
  const ate = Date.now() + 10 * 60000;
  let visto = '';
  while (Date.now() < ate) {
    await espera(5000);
    let e = null;
    try { e = carregarEstado(); } catch { /* lendo no meio de uma gravação */ }
    const dia = (e ? R.visaoDoMinisterio(e, slug, CONFIG.principal).envios[data] : null) || {};
    const linhas = Object.values(dia).map((x) => `${x.grupo}: ${x.situacao}`);
    const agoraVisto = linhas.join(' | ');
    if (agoraVisto !== visto) { visto = agoraVisto; console.log(`  ${linhas.length} grupo(s): ${agoraVisto}`); }
    if (!existsSync(ARQ.pedido)) {
      console.log(Object.values(dia).some((x) => x.situacao !== 'postado') ? 'Terminou com envio incerto: confira o grupo.' : 'Pronto: a escala saiu.');
      return;
    }
  }
  console.log('Ainda não terminou: o serviço tenta de novo sozinho. Veja depois com --status.');
}

/* declara de quando o robô passa a cuidar das escalas (depois de um tempo
   fora do ar em que alguém mandou à mão, por exemplo) */
async function aPartirDe([quando]) {
  const ms = Date.parse(quando || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(quando || '') || Number.isNaN(ms)) {
    console.log('uso: node robo.mjs --a-partir-de AAAA-MM-DDTHH:MM-03:00');
    process.exit(1);
  }
  await comTrava(async () => {
    const e = carregarEstado();
    e.inicio = new Date(ms).toISOString();
    salvarEstado(e);
  }, 15 * 60000);
  console.log(`o robô cuida das escalas cuja hora de sair é a partir de ${new Date(ms).toISOString()}`);
}

async function conferido([data, gid, resultado]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '') || !gid || !['saiu', 'nao-saiu'].includes(resultado)) {
    console.log('uso: node robo.mjs --conferido AAAA-MM-DD "<nome do grupo>"|cobranca saiu|nao-saiu');
    process.exit(1);
  }
  const msg = await comTrava(async () => {
    const estado = carregarEstado();
    let alvo; let chave;
    if (gid === 'cobranca') { alvo = estado.cobrancas; chave = data; } else {
      /* o aviso mostra o nome do grupo no WhatsApp: vale o nome, em qualquer
         ministério; o código interno ("geral") existe em todos, e só vale se
         for de um ministério só */
      const achados = [];
      for (const slug of Object.keys(CONFIG.ministerios)) {
        const dia = R.visaoDoMinisterio(estado, slug, CONFIG.principal).envios[data] || {};
        for (const k of Object.keys(dia)) if (k === gid || R.mesmoNome(dia[k]?.grupo, gid)) achados.push([dia, k]);
      }
      if (achados.length > 1) return 'mais de um envio com esse código; use o nome do grupo do WhatsApp, entre aspas';
      [alvo, chave] = achados[0] || [null, null];
    }
    const e = alvo?.[chave];
    if (!e) return 'não há registro desse envio';
    if (resultado === 'saiu') { e.situacao = 'postado'; delete e.erro; } else delete alvo[chave];
    salvarEstado(estado);
    return resultado === 'saiu' ? 'marcado como postado' : 'liberado para sair de novo (na próxima rodada, ou no próximo pedido do botão)';
  }, 15 * 60000);
  console.log(msg);
}

function mostrarStatus() {
  let st = null;
  try { st = JSON.parse(readFileSync(ARQ.status, 'utf8')); } catch { /* o serviço nunca rodou */ }
  let e = null;
  let erroEstado = null;
  try { e = carregarEstado(); } catch (x) { erroEstado = x.message; }
  const pid = pidDoServico();
  console.log(JSON.stringify({
    servico: pid ? `rodando (pid ${pid})` : 'parado',
    ...(noServidor() ? { noServidor: noServidor() } : {}),
    conectado: st?.conectado ?? null, conta: st?.conta ?? null, motivo: st?.motivo,
    pausado: existsSync(ARQ.pausa) ? readFileSync(ARQ.pausa, 'utf8').trim() : false,
    precisaParear: existsSync(ARQ.precisaParear), pareado: pareado(),
    estado: erroEstado || 'ok', inicio: e?.inicio ?? null,
    ultimaRodada: st?.ultimaRodada ?? null, proximaRodada: st?.proximaRodada ?? null, grupos: st?.grupos ?? null,
    envios: e ? Object.fromEntries(Object.keys(CONFIG.ministerios).map((slug) => [slug,
      Object.fromEntries(Object.entries(R.visaoDoMinisterio(e, slug, CONFIG.principal).envios).map(([d, g]) => [d,
        Object.entries(g).map(([gid, x]) => `${x.grupo} (${gid}): ${x.situacao} v${x.versao}${x.erro ? ' · ' + x.erro : ''}`)]))])) : null,
    cobrancas: e?.cobrancas ?? null, rodadas: e?.rodadas ?? null,
    pedidosDoBotao: e ? Object.entries(e.pedidos || {}).map(([id, p]) => `${id.slice(0, 8)} ${p.em?.slice(0, 16)} ${p.status}: ${p.resultado?.resumo || ''}`) : null,
    relatosParaOSistema: e ? (e.relatos || []).length : null,
    avisos: (st?.avisos || []).slice(-10), atualizadoEm: st?.atualizadoEm ?? null,
  }, null, 1));
}

/* ---------------------------------------------- o robô mudou de casa --- */
/* 29/10/2026. No Mac, o robô parava toda vez que a tampa fechava: o macOS
   dorme e leva o robô junto (em 28/10 o Mac dormiu das 18:10 às 21:57, e a
   rodada das 19:58 não saiu). O Arthur escolheu um servidor sempre ligado. O
   levar-para-o-servidor.command deixa nesta pasta do Mac o arquivo
   NO-SERVIDOR, com o endereço do servidor. Com ele, esta cópia não liga no
   WhatsApp de jeito nenhum: dois robôs com a mesma sessão derrubam um ao
   outro, e cada um mandaria a escala por conta própria. O estado daqui também
   parou no dia da mudança, então o ensaio e os acertos de envio (--conferido,
   --a-partir-de, --mandar-agora) são no servidor. Só o --status continua. */
function noServidor() {
  try { return readFileSync(ARQ.noServidor, 'utf8').trim() || 'outro aparelho'; } catch { return null; }
}

/* -------------------------------------------------------------- início --- */
const args = process.argv.slice(2);
const longe = noServidor();
if (longe && args[0] !== '--status') {
  const frase = `O robô agora roda no servidor (${longe}). Esta cópia não liga no WhatsApp.`;
  if (!args[0]) {
    /* o serviço antigo, se alguém religar: parado, sem religar em laço */
    avisar(frase, 'no-servidor');
    salvarStatus({ conectado: false, motivo: `o robô roda no servidor (${longe})` });
    setInterval(() => {}, 3600000);
  } else {
    console.log(`${frase} Use o servidor.`);
    process.exit(1);
  }
} else if (args[0] === '--conferido' || args[0] === '--a-partir-de' || args[0] === '--mandar-agora') {
  try {
    await ({ '--conferido': conferido, '--a-partir-de': aPartirDe, '--mandar-agora': mandarAgora })[args[0]](args.slice(1));
  } catch (e) {
    console.log(`Não deu: ${e.message}`);
    process.exit(1);
  }
} else if (args[0] === '--status') {
  mostrarStatus();
} else if (args[0] === '--parear' || args[0] === '--grupos') {
  await parearOuConferir(args[0].slice(2), args.includes('--codigo'), args.includes('--refixar'));
} else {
  const segredo = lerSegredo();
  if (args[0] === '--ensaio') {
    if (!segredo) { console.log(`Falta o segredo do robô (.env). Rode ${CONFIGURAR}.`); process.exit(1); }
    const slug = args.slice(1).find((x) => !/^\d{4}-\d{2}-\d{2}$/.test(x)) || CONFIG.principal;
    try { await ensaio(segredo, slug, args.slice(1).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))); } catch (e) { console.log(`Não deu: ${e.message}`); process.exit(1); }
  } else if (!segredo) {
    /* o serviço sem segredo fica parado e avisa uma vez (sair faria o launchd
       religar em laço, com uma notificação a cada religada) */
    avisar(`Falta o segredo do robô (.env). Rode ${CONFIGURAR}.`, 'segredo');
    salvarStatus({ conectado: false, motivo: 'sem segredo' });
    setInterval(() => {}, 3600000);
  } else {
    await servico(segredo);
  }
}
