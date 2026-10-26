#!/usr/bin/env node
/* O ROBÔ DO WHATSAPP DA ESCALA · 26/10/2026.

   Pedido do Arthur: "tá tudo liberado, eu quero tudo automatizado". A escala
   da Mídia sai sozinha nos 8 grupos da Multimídia, pelo número da igreja,
   2 dias antes de cada culto, e o grupo geral é cobrado com @ até todos
   confirmarem. Roda no MacBook dele, como serviço do macOS (launchd).

   Modos:
     node robo.mjs                  o serviço (o launchd chama assim)
     node robo.mjs --parear         QR code para ligar o robô ao número da igreja
     node robo.mjs --parear --codigo  o mesmo, por código de 8 letras (sem câmera)
     node robo.mjs --grupos         confere os grupos da tabela (com o serviço parado)
     node robo.mjs --grupos --refixar  aceita os grupos de agora como os certos
                                    (depois de recriar ou renomear um grupo de propósito)
     node robo.mjs --ensaio [datas] lê a escala no sistema e diz o que faria, sem WhatsApp
     node robo.mjs --status         resumo do serviço (conexão, grupos, última rodada)
     node robo.mjs --conferido AAAA-MM-DD "<nome do grupo>"|cobranca saiu|nao-saiu
                                    depois de conferir um envio incerto no grupo
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
};
const NO_SERVICO = process.env.ROBO_SERVICO === '1';
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
  /* a notificação do Mac, para o Arthur ver sem abrir nada */
  execFile('/usr/bin/osascript', ['-e', `display notification ${JSON.stringify(texto)} with title "Robô do WhatsApp"`], () => {});
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
const normalizarEstado = (e) => ({ inicio: e.inicio || null, envios: e.envios || {}, cobrancas: e.cobrancas || {}, rodadas: e.rodadas || {} });
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

async function lerDia(segredo, data) {
  const url = `${CONFIG.site}/api/robo/grupos?equipe=${encodeURIComponent(CONFIG.equipe)}&data=${data}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${segredo}` }, signal: AbortSignal.timeout(30000) });
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
async function ensaio(segredo, datas) {
  const agora = R.agoraSP();
  const estado = carregarEstado();
  const alvo = datas.length ? datas : [0, 1, 2, 3, 4, 5, 6].map((n) => R.somaDias(agora.data, n));
  const inicioMs = Date.parse(estado.inicio || '') || Date.now();
  console.log(`ENSAIO · nada é mandado · ${agora.data} ${hhmm(agora.min)} · robô ${estado.inicio ? 'ligado desde ' + estado.inicio.slice(0, 16) : 'ainda não ligado (conta a partir de agora)'}`);
  for (const data of alvo) {
    let resp;
    try { resp = await lerDia(segredo, data); } catch (e) { console.log(`${data} · ERRO: ${e.message}`); continue; }
    if (!resp.culto?.preenchidos) { console.log(`${data} · sem escala da ${resp.equipe?.nome || CONFIG.equipe}${resp.culto?.existe ? ' (culto sem ninguém escalado)' : ''}`); continue; }
    const c = resp.culto;
    console.log(`${data} · ${c.evento || 'culto'} ${c.hora || 'sem hora'} · ${c.preenchidos} de ${c.postos} postos com gente`);
    const momento = R.momentoDaPrimeira(data, CONFIG.rodadas, CONFIG.diasDeAntecedencia);
    const dono = momento == null || momento >= inicioMs;
    const quando = `${R.somaDias(data, -CONFIG.diasDeAntecedencia)} às ${CONFIG.rodadas.find((r) => r.primeira)?.hhmm}`;
    for (const l of resp.linhas) {
      const grupo = CONFIG.grupos[l.nome];
      const e = estado.envios[data]?.[l.gid];
      const r = R.resumoSemDados(l.texto);
      const situacao = l.vazio ? 'nada neste dia'
        : !grupo ? 'SEM GRUPO NA TABELA (seria pulado)'
          : e?.situacao === 'incerto' ? 'INCERTO: parado até conferir'
            : !e ? (dono ? `primeira postagem em ${quando}` : `não é do robô (a hora de sair, ${quando}, foi antes de ele começar)`)
              : e.ass !== l.ass ? 'mudou depois do envio: vai a versão nova na próxima rodada' : `já postado (${e.em.slice(0, 16)})`;
      console.log(`  ${l.nome} → ${grupo || '?'} · ${r.linhas} linhas, ${r.caracteres} caracteres · ${situacao}`);
    }
    if (resp.cobranca) {
      console.log(`  cobrança: ${resp.cobranca.pendentes} ${resp.cobranca.pendentes === 1 ? 'pessoa falta' : 'pessoas faltam'} confirmar, ${resp.cobranca.mencoes.length} com telefone para o @`);
    }
  }
}

/* ------------------------------------------------------------ serviço --- */
async function servico(segredo) {
  const outro = pidDoServico();
  if (outro) {
    avisar(`Já existe um robô rodando neste Mac (processo ${outro}); este segundo saiu.`, 'duplicado');
    await espera(1500);
    process.exit(0);
  }
  writeFileSync(ARQ.pid, String(process.pid));
  girarLog();
  /* o Mac não dorme sozinho enquanto o robô roda (tampa aberta). O
     caffeinate acompanha este processo e acaba junto com ele */
  try {
    const c = spawn('/usr/bin/caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' });
    c.on('error', () => log('sem caffeinate: o Mac pode dormir com o robô ligado'));
    c.unref();
  } catch { /* sem caffeinate, segue */ }
  const { abrirWhatsApp } = await import('./whatsapp.mjs');

  /* sem sessão, ou com a sessão recusada, o serviço fica parado (sem
     reiniciar em laço e sem notificar a cada minuto) até o pareamento */
  const parado = (motivo) => {
    try { writeFileSync(ARQ.precisaParear, motivo + '\n'); } catch { /* segue */ }
    avisar(`O robô está desligado do número da igreja (${motivo}). Rode o configurar.command para parear de novo.`, 'parear');
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
      avisar(`O robô está ligado a OUTRO número, não ao da igreja. Nada sai. Rode o configurar.command e leia o QR com o celular da igreja.`, 'conta');
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
          const mapa = await waFixo.mapearGrupos([...new Set([...Object.values(CONFIG.grupos), CONFIG.grupoDaCobranca])]);
          salvarStatus({ grupos: Object.fromEntries(Object.entries(mapa).map(([n, g]) => [n, g.jid
            ? { ok: true, participantes: g.participantes, soAdmin: g.soAdmin, admin: g.admin, lid: g.lid } : { ok: false, erro: g.erro }])) });
          gruposConferidos = true;
          const faltam = Object.entries(mapa).filter(([, g]) => !g.jid).map(([n]) => n);
          if (faltam.length) avisar(`Grupos que o robô não achou no WhatsApp: ${faltam.join(', ')}`, 'grupos');
        } catch (e) { log('não consegui conferir os grupos agora:', e.message); }
      }
      let feitas;
      try { feitas = carregarEstado().rodadas; } catch (e) { avisar(e.message, 'estado'); return; }
      for (const rodada of R.rodadasDevidas(CONFIG.rodadas, agora, feitas, CONFIG.toleranciaMin)) {
        const chave = `${agora.data} ${rodada.hhmm}`;
        const ult = tentativas.get(chave);
        if (ult && Date.now() - ult < CONFIG.retentarAposMin * 60000) continue;
        tentativas.set(chave, Date.now());
        const res = await comTrava(async () => {
          const estado = carregarEstado();
          let r;
          try {
            r = await executarRodada({
              wa: waFixo, lerDia: (d) => lerDia(segredo, d), rodada, agora: R.agoraSP(), estado, cfg: CONFIG,
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
      /* rodada que passou da tolerância sem completar: avisa uma vez e fecha */
      for (const r of CONFIG.rodadas) {
        const chave = `${agora.data} ${r.hhmm}`;
        if (tentativas.has(chave) && feitas[r.hhmm] !== agora.data && agora.min > R.minutos(r.hhmm) + CONFIG.toleranciaMin) {
          tentativas.delete(chave);
          avisar(`A rodada das ${r.hhmm} não conseguiu terminar. O que ficou para trás sai na próxima rodada.`, `fim:${r.hhmm}`);
        }
      }
      const proxima = CONFIG.rodadas.map((r) => r.hhmm).find((h) => R.minutos(h) > agora.min) || `${CONFIG.rodadas[0].hhmm} de amanhã`;
      salvarStatus({ conectado: wa.aberto(), conta: wa.conta(), ultimaRodada: ultima, proximaRodada: proxima, pausado: existsSync(ARQ.pausa) });
    } catch (e) {
      log('ERRO', e.message);
    } finally {
      ocupado = false;
    }
  };
  log(`serviço no ar · ${CONFIG.equipe} · rodadas ${CONFIG.rodadas.map((r) => r.hhmm).join(', ')}`);
  setInterval(tick, 30000);
  setTimeout(tick, 15000);
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
  console.log(`O serviço do robô está rodando (pid ${pid}). Pare antes (o configurar.command faz isso) ou veja o resumo com --status.`);
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
  const qrcode = modo === 'parear' && !comCodigo ? (await import('qrcode-terminal')).default : null;
  const wa = await abrirWhatsApp({
    pastaSessao: ARQ.sessao, log, cfg: CONFIG,
    codigoPara: modo === 'parear' && comCodigo ? CONFIG.numeroDaIgreja : null,
    aoCodigo: (c) => {
      console.log(`\nNo celular da IGREJA: WhatsApp Business > Dispositivos conectados > Conectar dispositivo > "Conectar com número de telefone".`);
      console.log(`Digite este código: ${String(c).slice(0, 4)}-${String(c).slice(4)}\n`);
    },
    aoQR: (qr) => {
      if (!qrcode) return;
      console.clear();
      console.log('No celular da IGREJA (+55 21 97297-6946): WhatsApp Business > Dispositivos conectados > Conectar dispositivo.');
      console.log('Leia este QR code (ele troca a cada 20 segundos):\n');
      qrcode.generate(qr, { small: true });
    },
    aoSairDeVez: (motivo) => {
      if (motivo === 'logout' || motivo === 'sessao') { guardarSessaoAntiga(); console.log('\nO WhatsApp recusou a sessão antiga. Rode de novo para ler um QR novo.'); }
      else if (motivo === 'barrado') console.log('\nO WhatsApp barrou a conexão (403). O número da igreja pode estar bloqueado: confira no celular.');
      else console.log('\nOutra conexão com a mesma sessão tomou o lugar. Pare o serviço e rode de novo.');
      process.exit(1);
    },
  });
  try { await wa.esperarAberto(modo === 'parear' ? 600000 : 90000); } catch (e) { console.log(`\n${e.message}. Rode de novo.`); process.exit(1); }
  const conta = wa.conta();
  if (!ehDaIgreja(conta)) {
    console.log(`\nATENÇÃO: este aparelho ficou ligado ao número ${conta}, que NÃO é o da igreja (${CONFIG.numeroDaIgreja}).`);
    console.log('Vou desligar e apagar esta sessão. Rode de novo e leia o QR com o celular da igreja.');
    await wa.desligarAparelho();
    await espera(2000);
    guardarSessaoAntiga();
    process.exit(1);
  }
  console.log(`\nConectado ao número da igreja (${conta}).`);
  if (modo === 'parear') rmSync(ARQ.precisaParear, { force: true });
  await espera(3000);
  if (refixar) { rmSync(ARQ.fixos, { force: true }); console.log('Endereços dos grupos refeitos a partir de agora.'); }
  let mapa;
  try { mapa = await comFixos(wa).mapearGrupos([...new Set([...Object.values(CONFIG.grupos), CONFIG.grupoDaCobranca])]); } catch (e) {
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
    const alvo = gid === 'cobranca' ? estado.cobrancas : (estado.envios[data] ||= {});
    let chave = gid === 'cobranca' ? data : gid;
    /* o aviso mostra o nome do grupo no WhatsApp: vale o nome ou o código */
    if (gid !== 'cobranca' && !alvo[chave]) chave = Object.keys(alvo).find((k) => R.mesmoNome(alvo[k]?.grupo, gid)) || chave;
    const e = alvo[chave];
    if (!e) return 'não há registro desse envio';
    if (resultado === 'saiu') { e.situacao = 'postado'; delete e.erro; } else delete alvo[chave];
    salvarEstado(estado);
    return resultado === 'saiu' ? 'marcado como postado' : 'liberado para sair de novo na próxima rodada';
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
    conectado: st?.conectado ?? null, conta: st?.conta ?? null, motivo: st?.motivo,
    pausado: existsSync(ARQ.pausa) ? readFileSync(ARQ.pausa, 'utf8').trim() : false,
    precisaParear: existsSync(ARQ.precisaParear), pareado: pareado(),
    estado: erroEstado || 'ok', inicio: e?.inicio ?? null,
    ultimaRodada: st?.ultimaRodada ?? null, proximaRodada: st?.proximaRodada ?? null, grupos: st?.grupos ?? null,
    envios: e ? Object.fromEntries(Object.entries(e.envios).map(([d, g]) => [d, Object.entries(g).map(([gid, x]) => `${x.grupo} (${gid}): ${x.situacao} v${x.versao}${x.erro ? ' · ' + x.erro : ''}`)])) : null,
    cobrancas: e?.cobrancas ?? null, rodadas: e?.rodadas ?? null,
    avisos: (st?.avisos || []).slice(-10), atualizadoEm: st?.atualizadoEm ?? null,
  }, null, 1));
}

/* -------------------------------------------------------------- início --- */
const args = process.argv.slice(2);
if (args[0] === '--conferido' || args[0] === '--a-partir-de') {
  try {
    await (args[0] === '--conferido' ? conferido : aPartirDe)(args.slice(1));
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
    if (!segredo) { console.log('Falta o segredo do robô (.env). Rode o configurar.command.'); process.exit(1); }
    try { await ensaio(segredo, args.slice(1).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))); } catch (e) { console.log(`Não deu: ${e.message}`); process.exit(1); }
  } else if (!segredo) {
    /* o serviço sem segredo fica parado e avisa uma vez (sair faria o launchd
       religar em laço, com uma notificação a cada religada) */
    avisar('Falta o segredo do robô (.env). Rode o configurar.command.', 'segredo');
    salvarStatus({ conectado: false, motivo: 'sem segredo' });
    setInterval(() => {}, 3600000);
  } else {
    await servico(segredo);
  }
}
