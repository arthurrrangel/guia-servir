/* A LIGAÇÃO COM O WHATSAPP · 26/10/2026.

   O robô entra no número da igreja como um aparelho conectado (como o
   WhatsApp Web), pela biblioteca Baileys. Não é a API oficial da Meta: o
   Arthur escolheu este caminho em 09/10 e de novo em 26/10, sabendo do risco
   de o WhatsApp bloquear o número. Para não chamar atenção, o robô se
   comporta como uma pessoa: poucas mensagens, "digitando" antes de cada uma,
   intervalo entre os grupos, nada de conversa privada, nada de mexer em grupo,
   nada de consultar números em massa.

   A sessão fica na pasta sessao/, criada no pareamento. Ela é a chave do
   número: nunca vai para o git nem sai do Mac. */

import { mencoesNoGrupo, mesmoNome, variantesBR } from './regras.mjs';

/* a biblioteca entra só aqui, na hora de abrir: o teste
   (testes/whatsapp.test.mjs) passa uma de mentira no lugar, e quem só lê
   (--ensaio, --status) nem carrega o Baileys */
export async function carregarBaileys() {
  const b = await import('baileys');
  const pino = (await import('pino')).default;
  return {
    makeWASocket: b.default, Browsers: b.Browsers, DisconnectReason: b.DisconnectReason,
    fetchLatestBaileysVersion: b.fetchLatestBaileysVersion, isLidUser: b.isLidUser,
    jidNormalizedUser: b.jidNormalizedUser, useMultiFileAuthState: b.useMultiFileAuthState,
    logger: pino({ level: 'silent' }),
  };
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const entre = ([a, b]) => (a + Math.random() * (b - a)) * 1000;

/* o erro de envio diz a fase: "antes" (nada saiu, pode tentar de novo),
   "durante" (pode ter saído: o robô não repete sozinho) ou "recusado" (o
   WhatsApp devolveu erro para a mensagem: o robô pausa tudo) */
export function erroComFase(mensagem, fase) {
  const e = new Error(mensagem);
  e.fase = fase;
  return e;
}

/* depois de abrir, o Baileys segura os eventos até terminar o que chegou com o
   aparelho desligado; um erro devolvido nessa hora não aparece. O robô só
   posta depois disso (ou de 30 s, se o aviso não vier) */
const PRONTO_DEPOIS_MS = 30000;

export async function abrirWhatsApp({ pastaSessao, log, aoQR, aoCodigo, codigoPara, aoSairDeVez, cfg, lib = null }) {
  const {
    makeWASocket, Browsers, DisconnectReason, fetchLatestBaileysVersion, isLidUser, jidNormalizedUser, useMultiFileAuthState, logger,
  } = lib || await carregarBaileys();
  /* quedas que não se resolvem tentando de novo: o aparelho foi desligado,
     o número foi barrado, a sessão estragou ou outro programa tomou o lugar */
  const DEFINITIVAS = new Map([
    [DisconnectReason.loggedOut, 'logout'],
    [DisconnectReason.forbidden, 'barrado'],
    [DisconnectReason.multideviceMismatch, 'sessao'],
    [DisconnectReason.badSession, 'sessao'],
    [DisconnectReason.connectionReplaced, 'substituida'],
  ]);
  let sock = null;
  let aberto = false;
  let pendentesLidas = false;
  let pronto = false;
  let prazoPronto = null;
  let encerrado = false;
  let tentativas = 0;
  let codigoPedido = false;
  const esperando = [];
  /* o que o robô mandou, para o WhatsApp poder pedir de novo (reenvio a
     quem não conseguiu decifrar a mensagem) */
  const enviados = new Map();
  const metadados = new Map();
  /* id da mensagem → código do erro que o WhatsApp devolveu */
  const recusas = new Map();

  const ficarPronto = (porque) => {
    if (pronto || !aberto) return;
    pronto = true;
    clearTimeout(prazoPronto);
    log(`pronto para postar (${porque})`);
    while (esperando.length) esperando.shift()();
  };

  async function iniciar() {
    const { state, saveCreds } = await useMultiFileAuthState(pastaSessao);
    let versao;
    try { ({ version: versao } = await fetchLatestBaileysVersion()); } catch { /* fica a da biblioteca */ }
    sock = makeWASocket({
      ...(versao ? { version: versao } : {}),
      auth: state,
      browser: Browsers.macOS('Desktop'),
      logger,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      getMessage: async (chave) => enviados.get(chave.id)?.message,
      cachedGroupMetadata: async (jid) => metadados.get(jid),
    });
    sock.ev.on('creds.update', (...a) => { Promise.resolve(saveCreds(...a)).catch((e) => log('não consegui gravar a sessão:', e.message)); });
    /* grupo mudou (nome, gente que entrou ou saiu): a lista guardada não vale
       mais. Mandar com a lista velha deixa quem entrou sem conseguir ler */
    sock.ev.on('groups.update', (lista) => { for (const g of lista || []) metadados.delete(g.id); });
    sock.ev.on('group-participants.update', (u) => { if (u?.id) metadados.delete(u.id); });
    /* erro devolvido para uma mensagem do robô, venha como atualização ou
       junto com a própria mensagem */
    sock.ev.on('messages.update', (lista) => {
      for (const { key, update } of lista || []) {
        if (key?.fromMe && update?.status === 0) recusas.set(key.id, String(update.messageStubParameters?.[0] ?? '?'));
      }
    });
    sock.ev.on('messages.upsert', (u) => {
      for (const m of u?.messages || []) {
        if (m?.key?.fromMe && m.status === 0) recusas.set(m.key.id, String(m.messageStubParameters?.[0] ?? '?'));
      }
    });
    sock.ev.on('connection.update', async (u) => {
      if (u.qr) {
        if (codigoPara && !codigoPedido && !sock.authState?.creds?.registered) {
          codigoPedido = true;
          try { aoCodigo?.(await sock.requestPairingCode(codigoPara)); } catch (e) { log('não consegui pedir o código:', e.message); }
        } else if (!codigoPara) {
          aoQR?.(u.qr);
        }
      }
      if (u.connection === 'connecting') { pendentesLidas = false; pronto = false; }
      if (u.receivedPendingNotifications === true) {
        pendentesLidas = true;
        ficarPronto('o que chegou com o aparelho desligado já foi lido');
      }
      if (u.connection === 'open') {
        aberto = true;
        tentativas = 0;
        log(`conectado ao WhatsApp como ${jidNormalizedUser(sock.user?.id || '').split('@')[0] || '?'}`);
        if (pendentesLidas) ficarPronto('já estava em dia');
        else { clearTimeout(prazoPronto); prazoPronto = setTimeout(() => ficarPronto('30 s depois de conectar'), PRONTO_DEPOIS_MS); }
      }
      if (u.connection === 'close') {
        aberto = false;
        pronto = false;
        clearTimeout(prazoPronto);
        const codigo = u.lastDisconnect?.error?.output?.statusCode;
        if (DEFINITIVAS.has(codigo)) {
          encerrado = true;
          const motivo = DEFINITIVAS.get(codigo);
          log(`o WhatsApp encerrou a sessão (código ${codigo}, ${motivo}); o robô não tenta de novo sozinho`);
          aoSairDeVez?.(motivo);
          return;
        }
        if (encerrado) return;
        tentativas++;
        const em = Math.min(300000, 5000 * 2 ** Math.min(tentativas, 6));
        log(`conexão caiu (código ${codigo ?? '?'}); tento de novo em ${Math.round(em / 1000)} s`);
        setTimeout(() => { if (!encerrado) iniciar().catch((e) => log('falha ao reconectar:', e.message)); },
          codigo === DisconnectReason.restartRequired ? 500 : em);
      }
    });
  }

  await iniciar();

  const api = {
    /* conectado E em dia: só aí o robô posta */
    aberto: () => aberto && pronto,
    conta: () => jidNormalizedUser(sock?.user?.id || '').split('@')[0] || null,

    esperarAberto(ms = 60000) {
      if (aberto && pronto) return Promise.resolve();
      return new Promise((ok, falha) => {
        const t = setTimeout(() => falha(new Error('o WhatsApp não conectou a tempo')), ms);
        esperando.push(() => { clearTimeout(t); ok(); });
      });
    },

    /* nome exato → grupo; nome repetido ou ausente vira erro, nunca um
       parecido. A comunidade e o grupo de avisos dela nunca entram. Lista
       vazia (o WhatsApp não respondeu a tempo) é falha, não "nenhum grupo" */
    async mapearGrupos(nomes) {
      const todos = await sock.groupFetchAllParticipating();
      if (!todos || !Object.keys(todos).length) throw new Error('o WhatsApp não devolveu a lista de grupos');
      metadados.clear();
      for (const [jid, g] of Object.entries(todos)) metadados.set(jid, g);
      const grupos = Object.values(todos).filter((g) => !g.isCommunity && !g.isCommunityAnnounce);
      const eu = new Set([jidNormalizedUser(sock.user?.id || ''), jidNormalizedUser(sock.user?.lid || '')].filter(Boolean));
      const mapa = {};
      for (const nome of nomes) {
        const achados = grupos.filter((g) => mesmoNome(g.subject, nome));
        if (achados.length !== 1) { mapa[nome] = { erro: achados.length ? 'há mais de um grupo com esse nome' : 'não achei o grupo' }; continue; }
        const g = achados[0];
        const admin = (g.participants || []).some((p) => eu.has(jidNormalizedUser(p.id || '')) && p.admin);
        mapa[nome] = { jid: g.id, soAdmin: !!g.announce, admin, participantes: (g.participants || []).length, lid: g.addressingMode === 'lid' };
      }
      if (nomes.length && !Object.values(mapa).some((g) => g.jid)) throw new Error('nenhum grupo da tabela apareceu na lista do WhatsApp');
      return mapa;
    },

    /* quem da cobrança está no grupo, pelo endereço que o grupo usa. Só
       consulta o WhatsApp para quem o grupo não mostra o número (grupos com
       "@lid"), e só um por vez */
    async mencoesDoGrupo(jid, telefones) {
      const g = await sock.groupMetadata(jid);
      metadados.set(jid, g);
      const participantes = g.participants || [];
      const resolvidos = mencoesNoGrupo(participantes, telefones);
      const semNumero = participantes.filter((p) => isLidUser(p.id) && !p.phoneNumber);
      if (!semNumero.length) return resolvidos;
      const lids = new Set(semNumero.map((p) => jidNormalizedUser(p.id)));
      for (const r of resolvidos) {
        if (r.jid) continue;
        for (const v of variantesBR(r.telefone)) {
          try {
            const lid = await sock.signalRepository.lidMapping.getLIDForPN(`${v}@s.whatsapp.net`);
            const normal = lid ? jidNormalizedUser(lid) : null;
            if (normal && lids.has(normal)) { r.jid = normal; break; }
          } catch { /* fica pelo nome */ }
        }
      }
      return resolvidos;
    },

    /* "digitando", a mensagem e alguns segundos para ver se o WhatsApp
       devolveu erro para ela. Erro jogado pela biblioteca com a conexão de pé
       acontece antes de a mensagem sair (lista do grupo, chaves de
       criptografia): "antes". Sem resposta no prazo, ou conexão que caiu no
       meio, a mensagem pode ter saído: "durante" */
    async postar(jid, texto, mentions = []) {
      if (!aberto || !pronto) throw erroComFase('sem conexão com o WhatsApp', 'antes');
      try {
        await sock.sendPresenceUpdate('composing', jid);
        await espera(entre(cfg.digitandoS));
        await sock.sendPresenceUpdate('paused', jid);
      } catch { /* presença é enfeite: não impede o envio */ }
      if (!aberto) throw erroComFase('a conexão caiu antes do envio', 'antes');
      let prazo;
      let msg;
      let estourou = false;
      try {
        const envio = sock.sendMessage(jid, { text: texto, ...(mentions.length ? { mentions } : {}) });
        msg = await Promise.race([
          envio,
          new Promise((_, falha) => { prazo = setTimeout(() => { estourou = true; falha(new Error('o WhatsApp não confirmou o envio a tempo')); }, cfg.prazoDoEnvioS * 1000); }),
        ]);
      } catch (e) {
        throw erroComFase(e.message || String(e), !estourou && aberto ? 'antes' : 'durante');
      } finally {
        clearTimeout(prazo);
      }
      const id = msg?.key?.id || null;
      if (id) {
        enviados.set(id, msg);
        if (enviados.size > 300) enviados.delete(enviados.keys().next().value);
        const ate = Date.now() + cfg.esperaRecusaS * 1000;
        while (Date.now() < ate && !recusas.has(id)) await espera(250);
        if (recusas.has(id)) throw erroComFase(`código ${recusas.get(id)}`, 'recusado');
      }
      if (!aberto) throw erroComFase('a conexão caiu logo depois do envio', 'durante');
      return id;
    },

    async fechar() {
      encerrado = true;
      clearTimeout(prazoPronto);
      try { sock?.end?.(undefined); } catch { /* já fechado */ }
    },

    /* desliga este aparelho do número (some de "Dispositivos conectados" no
       celular). Só no pareamento lido pelo celular errado */
    async desligarAparelho() {
      encerrado = true;
      clearTimeout(prazoPronto);
      try { await sock?.logout?.(); } catch { /* já fora */ }
    },
  };
  return api;
}

export { espera, entre };
