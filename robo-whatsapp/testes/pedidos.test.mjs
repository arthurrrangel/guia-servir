/* O BOTÃO "MANDAR AGORA PELO ROBÔ", DO LADO DO ROBÔ · 26/10/2026.

   O Arthur: "Gostaria de na aba do sistema ter a opção de disparar escala,
   através desse robo, vou deixar o macbook ligado" e "Para todos os
   ministérios".

   Sem WhatsApp, sem rede: um sistema de mentira com a Mídia e o Louvor, e um
   WhatsApp de mentira com os 14 grupos da tabela. Confere que:
     · o pedido do Louvor sai só nos grupos do Louvor, e fica gravado à parte
       (a Mídia, no topo do estado, não é tocada);
     · o mesmo pedido de novo não repete nada ("nada novo");
     · pedido de ministério sem grupo, de data fora, com o robô pausado ou sem
       WhatsApp: recusa ou espera, sem mandar nada;
     · envio incerto vira aviso para o líder conferir;
     · o relato fica na fila até o sistema dizer que recebeu.

   Roda com `node testes/pedidos.test.mjs` (na pasta do robô). */

import * as R from '../regras.mjs';
import * as P from '../pedidos.mjs';
import { CONFIG } from '../config.mjs';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const JID = (n) => `120363${String(n).padStart(12, '0')}@g.us`;
const GRUPOS_WA = Object.fromEntries(R.todosOsGrupos(CONFIG).map((nome, i) => [nome, { jid: JID(i + 1), soAdmin: false, admin: true, participantes: 20 }]));
const nomeDoJid = (jid) => Object.entries(GRUPOS_WA).find(([, g]) => g.jid === jid)?.[0];

function whatsapp() {
  const saiu = [];
  const w = {
    saiu, falhar: null, mapa: { ...GRUPOS_WA }, aberto: () => true, esperarAberto: async () => {}, tentativas: 0,
    mapearGrupos: async (nomes) => Object.fromEntries(nomes.map((n) => [n, w.mapa[n] || { erro: 'não achei o grupo' }])),
    mencoesDoGrupo: async () => [],
    postar: async (jid, texto) => {
      w.tentativas++;
      const f = w.falhar?.(w.tentativas, jid, texto);
      if (f) { const e = new Error('falha de mentira'); e.fase = f; throw e; }
      saiu.push({ jid, texto });
      return 'id' + w.tentativas;
    },
  };
  return w;
}

/* o sistema de mentira: o domingo 01/11 (10h) da Mídia e do Louvor */
function sistema() {
  const lidos = [];
  const ler = async (slug, data) => {
    lidos.push(`${slug} ${data}`);
    if (data !== '2026-11-01') return { ok: true, data, culto: { existe: false, preenchidos: 0, postos: 0 }, linhas: [], cobranca: null };
    const L = (gid, nome, texto, ass) => ({ gid, nome, texto, ass, vazio: !texto });
    const linhas = slug === 'louvor'
      ? [L('geral', 'Grupo geral', 'LOUVOR geral', 'lg'), L('b', 'Louvor · Banda', 'LOUVOR banda', 'lb'), L('v', 'Louvor · Vocal', 'LOUVOR vocal', 'lv'),
        L('t', 'Louvor · Teclas', 'LOUVOR teclas', 'lt'), L('s', 'Louvor · Som e Palco', '', 'ls')]
      : [L('geral', 'Grupo geral', 'MIDIA geral', 'mg'), L('g1', 'Multimídia · Projeção', 'MIDIA projeção', 'mp')];
    return {
      ok: true, data, equipe: { slug, nome: slug },
      culto: { existe: true, evento: 'Culto', hora: '10h', postos: 5, preenchidos: 4 },
      linhas, cobranca: { texto: 'falta confirmar', mencoes: [], pendentes: 1 },
    };
  };
  return { ler, lidos };
}

const SEXTA = '2026-10-30T21:00:00-03:00';
const contexto = (estado, wa, sis, extra = {}) => ({
  estado, cfg: CONFIG, wa, lerDia: sis.ler, avisar: () => {}, log: () => {}, pausado: () => false, pausar: () => {},
  espera: async () => {}, salvar: () => {}, agora: R.agoraSP(new Date(SEXTA)), agoraMs: () => Date.parse(SEXTA), ...extra,
});
const estadoNovo = () => ({
  inicio: '2026-10-26T20:38:54.000Z', rodadas: {}, cobrancas: {},
  /* a Mídia já tem o domingo no grupo (o envio de 26/10, a pedido do Arthur) */
  envios: { '2026-11-01': { geral: { ass: 'mg', situacao: 'postado', em: '2026-10-26T20:48:28.000Z', versao: 1, grupo: 'Multimídia · Geral' } } },
  equipes: {}, pedidos: {}, relatos: [],
});

/* ---------------------------------------------------- decidir */
{
  const e = estadoNovo();
  const base = { cfg: CONFIG, estado: e, pausado: false, conectado: true, hoje: '2026-10-30', agoraMs: Date.parse('2026-10-30T21:00:00-03:00') };
  const ped = (x = {}) => ({ id: 'p1', equipe: 'louvor', data: '2026-11-01', status: 'pendente', ...x });
  ok(P.decidirPedido(ped(), base).tipo === 'mandar', 'pedido bom, robô ligado: manda');
  const kids = P.decidirPedido(ped({ equipe: 'kids' }), base);
  ok(kids.tipo === 'final' && kids.relato.status === 'falhou' && /não tem os grupos/.test(kids.relato.resultado.resumo), 'ministério sem grupo na tabela: recusa com o motivo');
  ok(P.decidirPedido(ped({ data: '2026-10-29' }), base).tipo === 'final', 'data passada: recusa');
  ok(P.decidirPedido(ped({ data: '2026-11-14' }), base).tipo === 'final' && P.decidirPedido(ped({ data: '2026-11-13' }), base).tipo === 'mandar', 'até 14 dias, não 15');
  ok(P.decidirPedido(ped({ data: 'amanha' }), base).tipo === 'final', 'data torta: recusa');
  const pausa = P.decidirPedido(ped(), { ...base, pausado: true });
  ok(pausa.tipo === 'final' && /pausado/.test(pausa.relato.resultado.resumo), 'robô pausado: recusa na hora (a tela não fica esperando à toa)');
  const semZap = P.decidirPedido(ped(), { ...base, conectado: false });
  ok(semZap.tipo === 'final' && /sem conexão com o WhatsApp/.test(semZap.relato.resultado.resumo), 'sem WhatsApp: cai na hora (esperar viraria mensagem em dobro: a tela já mandou mandar à mão)');
  ok(P.decidirPedido(ped({ criado_em: '2026-10-30T20:29:00-03:00' }), base).tipo === 'ignorar', 'pedido com mais de 30 minutos (pela hora do sistema): não sai');
  ok(P.decidirPedido(ped({ criado_em: '2026-10-30T20:31:00-03:00' }), base).tipo === 'mandar', 'com 29 minutos: sai');
  const meio = P.decidirPedido(ped({ status: 'enviando' }), { ...base, pausado: true });
  ok(meio.tipo === 'final' && /parou no meio do envio/.test(meio.relato.resultado.resumo) && /Confira os grupos/.test(meio.relato.resultado.resumo) && !/nada foi mandado/i.test(meio.relato.resultado.resumo),
    'pedido que estava mandando e não pode continuar: "parou no meio, confira" (nunca "nada foi mandado")', meio.relato.resultado.resumo);
  e.pedidos.p1 = { em: '2026-10-30T23:00:00.000Z', final: true, status: 'enviado', resultado: { resumo: 'Mandado em 3 grupos.', grupos: [], avisos: [] } };
  const rep = P.decidirPedido(ped(), base);
  ok(rep.tipo === 'repetir' && rep.relato.status === 'enviado' && rep.relato.resultado.resumo === 'Mandado em 3 grupos.', 'pedido já atendido que volta (o relato não chegou): só repete o relato, sem mandar de novo');
}

/* ---------------------------------------------------- o Louvor, a pedido */
{
  const e = estadoNovo();
  const midiaAntes = JSON.stringify(e.envios);
  const wa = whatsapp();
  const sis = sistema();
  const rel = await P.atenderPedido({ pedido: { id: 'p2', equipe: 'louvor', data: '2026-11-01' }, ...contexto(e, wa, sis) });
  const destinos = wa.saiu.map((m) => nomeDoJid(m.jid));
  ok(igual(destinos, ['Louvor · Equipe', 'Louvor · Banda', 'Louvor · Vocal']), 'o pedido do Louvor sai nos grupos do Louvor, e só neles', JSON.stringify(destinos));
  ok(!wa.saiu.some((m) => /falta confirmar/.test(m.texto)), 'sem cobrança no pedido');
  ok(igual(sis.lidos, ['louvor 2026-11-01']), 'lê só o Louvor, e só o dia pedido', JSON.stringify(sis.lidos));
  ok(e.equipes.louvor.envios['2026-11-01'].geral.grupo === 'Louvor · Equipe' && e.equipes.louvor.envios['2026-11-01'].b.situacao === 'postado', 'o envio do Louvor fica gravado em estado.equipes.louvor');
  ok(JSON.stringify(e.envios) === midiaAntes, 'a Mídia não é tocada');
  ok(rel.id === 'p2' && rel.status === 'enviado' && rel.resultado.resumo === 'Mandado em 3 grupos; 1 não mandado.', 'o relato: mandado em 3, e a linha sem grupo na tabela não', rel.resultado.resumo);
  ok(rel.resultado.grupos.find((g) => g.nome === 'Louvor · Teclas')?.detalhe === 'sem grupo do WhatsApp no robô', 'a linha fora da tabela aparece com o motivo');
  ok(rel.resultado.avisos.some((a) => /Teclas/.test(a)), 'e o aviso da linha sem grupo vai para o líder');
  /* o mesmo pedido de novo (o líder apertou outra vez depois) */
  const wa2 = whatsapp();
  const rel2 = await P.atenderPedido({ pedido: { id: 'p3', equipe: 'louvor', data: '2026-11-01' }, ...contexto(e, wa2, sis, { agoraMs: () => Date.parse(SEXTA) + 600000 }) });
  ok(wa2.saiu.length === 0 && rel2.status === 'enviado' && /^Nada novo|já tinham/.test(rel2.resultado.resumo), 'de novo: nada sai, "já tinham"', rel2.resultado.resumo);
}

/* ---------------------------------------------------- a Mídia, a pedido: no topo do estado */
{
  const e = estadoNovo();
  const wa = whatsapp();
  const rel = await P.atenderPedido({ pedido: { id: 'p4', equipe: 'midia', data: '2026-11-01' }, ...contexto(e, wa, sistema()) });
  ok(igual(wa.saiu.map((m) => nomeDoJid(m.jid)), ['Multimídia · Projeção']), 'Mídia: o geral já estava (26/10); só a Projeção sai', JSON.stringify(wa.saiu.map((m) => nomeDoJid(m.jid))));
  ok(e.envios['2026-11-01'].g1.situacao === 'postado' && !e.equipes.midia, 'gravado no topo, como sempre');
  ok(rel.resultado.resumo === 'Mandado em 1 grupo; 1 já tinha.', 'o relato conta o que já estava', rel.resultado.resumo);
}

/* ---------------------------------------------------- envio incerto */
{
  const e = estadoNovo();
  const wa = whatsapp();
  wa.falhar = (n) => (n === 2 ? 'durante' : null);
  const rel = await P.atenderPedido({ pedido: { id: 'p5', equipe: 'louvor', data: '2026-11-01' }, ...contexto(e, wa, sistema()) });
  ok(rel.status === 'falhou' && /uma mensagem ficou incerta/.test(rel.resultado.resumo), 'mensagem incerta: o pedido não terminou', rel.resultado.resumo);
  ok(rel.resultado.grupos.some((g) => g.nome === 'Louvor · Banda' && g.situacao === 'incerto'), 'o grupo incerto aparece');
  ok(/mande à mão/.test(rel.resultado.avisos[0] || ''), 'e o líder lê o que fazer', JSON.stringify(rel.resultado.avisos));
  const wa2 = whatsapp();
  await P.atenderPedido({ pedido: { id: 'p6', equipe: 'louvor', data: '2026-11-01' }, ...contexto(e, wa2, sistema(), { agoraMs: () => Date.parse(SEXTA) + 600000 }) });
  ok(!wa2.saiu.some((m) => nomeDoJid(m.jid) === 'Louvor · Banda'), 'o pedido seguinte não repete o grupo incerto');
  /* pausado no meio */
  const e3 = estadoNovo();
  let pausa = false;
  const wa3 = whatsapp();
  wa3.falhar = (n) => { if (n === 1) pausa = true; return null; };
  const rel3 = await P.atenderPedido({ pedido: { id: 'p7', equipe: 'louvor', data: '2026-11-01' }, ...contexto(e3, wa3, sistema(), { pausado: () => pausa }) });
  ok(wa3.saiu.length === 1 && rel3.status === 'falhou' && /pausado no meio \(mandado em 1 grupo; 3 não mandados\)/.test(rel3.resultado.resumo), 'pausado no meio: para, e diz o que saiu e o que não', rel3.resultado.resumo);
  /* o sistema fora */
  const rel4 = await P.atenderPedido({ pedido: { id: 'p8', equipe: 'louvor', data: '2026-11-01' }, ...contexto(estadoNovo(), whatsapp(), { ler: async () => { throw new Error('503'); } }) });
  ok(rel4.status === 'falhou' && /Não consegui ler a escala/.test(rel4.resultado.resumo), 'sistema fora: falhou, sem mandar');
  /* o culto já começou */
  const domingo = '2026-11-01T10:30:00-03:00';
  const wa5 = whatsapp();
  const rel5 = await P.atenderPedido({ pedido: { id: 'p9', equipe: 'louvor', data: '2026-11-01' }, ...contexto(estadoNovo(), wa5, sistema(), { agora: R.agoraSP(new Date(domingo)), agoraMs: () => Date.parse(domingo) }) });
  ok(wa5.saiu.length === 0 && rel5.status === 'falhou' && /já começou/.test(rel5.resultado.resumo), 'culto começado: nada sai', rel5.resultado.resumo);
  /* uma exceção que escapa da rodada vira "falhou", sem derrubar o serviço */
  const rel6 = await P.atenderPedido({ pedido: { id: 'p10', equipe: 'louvor', data: '2026-11-01' }, ...contexto(estadoNovo(), { ...whatsapp(), aberto: () => { throw new Error('quebrou'); } }, sistema()) });
  ok(rel6.status === 'falhou', 'erro inesperado: falhou, com o serviço de pé');
}

/* ---------------------------------------------------- o relógio anda durante o pedido */
{
  /* cada mensagem leva 40 s; o pedido começa às 09:59:00 do domingo (culto às 10h) */
  let t = Date.parse('2026-11-01T09:59:00-03:00');
  const wa = whatsapp();
  const postar0 = wa.postar;
  wa.postar = async (...x) => { const id = await postar0(...x); t += 40000; return id; };
  const rel = await P.atenderPedido({ pedido: { id: 'c1', equipe: 'louvor', data: '2026-11-01' },
    ...contexto(estadoNovo(), wa, sistema(), { agora: R.agoraSP(new Date(t)), agoraMs: () => t }) });
  ok(wa.saiu.length === 2, 'o culto começa no meio do pedido: as mensagens param na hora', String(wa.saiu.length));
  ok(rel.resultado.grupos.find((g) => g.nome === 'Louvor · Vocal')?.detalhe === 'o culto começou antes da vez deste grupo', 'e o grupo que ficou de fora diz por quê', JSON.stringify(rel.resultado.grupos));
  /* o Mac dormiu no meio: o pedido não continua depois do prazo */
  let t2 = Date.parse(SEXTA);
  const wa2 = whatsapp();
  const p2 = wa2.postar;
  wa2.postar = async (...x) => { const id = await p2(...x); t2 += 26 * 60000; return id; };
  const rel2 = await P.atenderPedido({ pedido: { id: 'c2', equipe: 'louvor', data: '2026-11-01' }, ...contexto(estadoNovo(), wa2, sistema(), { agoraMs: () => t2 }) });
  ok(wa2.saiu.length === 1 && rel2.status === 'falhou' && /passou do prazo/.test(rel2.resultado.resumo), 'passou do prazo (Mac que dormiu): para, e diz o que saiu', rel2.resultado.resumo);
  ok(rel.resultado.grupos.every((g) => g.situacao !== 'postado' || (g.linha && g.ass)), 'cada grupo mandado leva a linha e a assinatura (a tela marca a linha)');
}

/* ---------------------------------------------------- a fila de relatos */
{
  const e = estadoNovo();
  P.guardarRelato(e, { id: 'a', status: 'enviado', resultado: { resumo: 'ok', grupos: [], avisos: [] }, motivo: null }, '2026-10-30T23:00:00.000Z');
  P.guardarRelato(e, { id: 'b', status: 'falhou', resultado: { resumo: 'x', grupos: [], avisos: [] } }, '2026-10-30T23:01:00.000Z');
  P.guardarRelato(e, { id: 'a', status: 'enviado', resultado: { resumo: 'ok2', grupos: [], avisos: [] } }, '2026-10-30T23:02:00.000Z');
  ok(igual(e.relatos.map((x) => x.id), ['b', 'a']) && e.relatos[1].resultado.resumo === 'ok2', 'o mesmo pedido entra uma vez, com o relato mais novo');
  ok(!('motivo' in e.relatos[0]) && e.pedidos.a.final && e.pedidos.b.status === 'falhou', 'a fila leva só o que o sistema aceita; o pedido fica marcado como atendido');
  P.guardarRelato(e, { id: 'c', status: 'enviando', resultado: null }, '2026-10-30T23:03:00.000Z');
  ok(!e.pedidos.c, '"enviando" não marca o pedido como atendido');
  P.tirarVistos(e, ['a', 'zz']);
  ok(igual(e.relatos.map((x) => x.id), ['b', 'c']), 'o que o sistema viu sai da fila; o resto fica');
  P.tirarVistos(e, null);
  ok(e.relatos.length === 2, 'resposta sem "vistos": nada sai da fila');
  const corpo = P.corpoDaPassada({ conectado: 1, pausado: 0, versao: 'v', cfg: CONFIG, relatos: Array.from({ length: 25 }, (_, i) => ({ id: 'r' + i, status: 'enviado', resultado: null, extra: 1 })) });
  ok(corpo.batimento.conectado === true && corpo.batimento.pausado === false && igual(corpo.batimento.ministerios, ['midia', 'louvor', 'servico']), 'o batimento conta os ministérios que o robô sabe');
  ok(corpo.relatos.length === 20 && !('extra' in corpo.relatos[0]), 'no máximo 20 relatos por passada, só com os campos da rota');
}

console.log(`robô do WhatsApp, pedidos do botão: ${feitas - falhas}/${feitas}`);
if (falhas) process.exit(1);
