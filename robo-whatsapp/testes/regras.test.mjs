/* AS REGRAS DO ROBÔ E UMA SEMANA DE MENTIRA · 26/10/2026.

   Sem WhatsApp, sem rede, sem relógio de verdade. Primeiro as funções puras
   (regras.mjs); depois a rodada inteira (rodada.mjs) numa semana simulada:
   quinta 29/10 a domingo 01/11, com o Follow de sábado (19h) e o culto de
   domingo (10h), um WhatsApp de mentira que guarda o que "saiu" e um sistema
   de mentira que responde como /api/robo/grupos.

   Roda com `node testes/regras.test.mjs` (na pasta do robô). */

import * as R from '../regras.mjs';
import { executarRodada } from '../rodada.mjs';
import { CONFIG } from '../config.mjs';
import { matriz, paraPagina, paraTerminal } from '../qr.mjs';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ============================================================ puras === */

/* hora de Brasília */
{
  const a = R.agoraSP(new Date('2026-10-29T22:58:00Z'));
  ok(a.data === '2026-10-29' && a.min === 19 * 60 + 58, 'agoraSP: 22:58 UTC é 19:58 em Brasília', JSON.stringify(a));
  const b = R.agoraSP(new Date('2026-10-30T02:30:00Z'));
  ok(b.data === '2026-10-29' && b.min === 23 * 60 + 30, 'agoraSP: depois da meia-noite UTC ainda é o dia anterior', JSON.stringify(b));
  ok(R.somaDias('2026-10-30', 2) === '2026-11-01' && R.somaDias('2026-11-01', -2) === '2026-10-30', 'somaDias atravessa o mês');
  ok(R.diasEntre('2026-10-29', '2026-11-01') === 3, 'diasEntre');
}
/* hora do culto e começo */
{
  ok(R.horaDoCulto('10h') === 600 && R.horaDoCulto('19h30') === 1170 && R.horaDoCulto('19h') === 1140, 'horaDoCulto lê 10h, 19h e 19h30');
  ok(R.horaDoCulto('') === null && R.horaDoCulto('19:30') === null && R.horaDoCulto(null) === null, 'horaDoCulto: sem hora conhecida é null');
  const ag = { data: '2026-10-31', min: 18 * 60 };
  ok(!R.cultoJaComecou('2026-10-31', '19h', ag) && R.cultoJaComecou('2026-10-31', '19h', { ...ag, min: 1140 }), 'cultoJaComecou na hora exata');
  ok(R.cultoJaComecou('2026-10-30', '19h', ag) && !R.cultoJaComecou('2026-11-01', '10h', ag), 'dia passado começou; dia futuro não');
  ok(!R.cultoJaComecou('2026-10-31', '', { ...ag, min: 1439 }), 'sem hora: não começou até o fim do dia');
}
/* rodadas devidas */
{
  const rod = CONFIG.rodadas;
  const ag = (min) => ({ data: '2026-10-29', min });
  ok(igual(R.rodadasDevidas(rod, ag(1197), {}, 90).map((r) => r.hhmm), []), 'às 19:57 a das 19:58 não é devida');
  ok(igual(R.rodadasDevidas(rod, ag(1198), {}, 90).map((r) => r.hhmm), ['19:58']), 'às 19:58 é');
  ok(igual(R.rodadasDevidas(rod, ag(1198 + 90), {}, 90).map((r) => r.hhmm), ['19:58']), 'no fim da tolerância ainda é');
  ok(igual(R.rodadasDevidas(rod, ag(1198 + 91), {}, 90).map((r) => r.hhmm), []), 'depois da tolerância não é mais');
  ok(igual(R.rodadasDevidas(rod, ag(1200), { '19:58': '2026-10-29' }, 90).map((r) => r.hhmm), []), 'a que já rodou hoje não roda de novo');
  ok(igual(R.rodadasDevidas(rod, ag(1200), { '19:58': '2026-10-28' }, 90).map((r) => r.hhmm), ['19:58']), 'a de ontem não conta');
}
/* quando a escala sai pela primeira vez, e de quem ela é */
{
  const m = R.momentoDaPrimeira('2026-10-31', CONFIG.rodadas, 2);
  ok(m === Date.parse('2026-10-29T19:58:00-03:00'), 'a do sábado 31/10 sai quinta 29/10 às 19:58', new Date(m).toISOString());
  const prim = { hhmm: '19:58', primeira: true }, manha = { hhmm: '09:00', primeira: false };
  ok(R.primeiraPermitida(2, prim, 2) && !R.primeiraPermitida(2, manha, 2), 'daqui a 2 dias: só na rodada da noite');
  ok(R.primeiraPermitida(1, manha, 2) && R.primeiraPermitida(0, manha, 2), 'a que ficou para trás sai em qualquer rodada');
  ok(!R.primeiraPermitida(3, prim, 2) && !R.primeiraPermitida(-1, prim, 2), 'fora da janela, nunca');
  ok(!R.primeiraPermitida(1, manha, 2, m, m + 1) && R.primeiraPermitida(1, manha, 2, m, m), 'hora de sair antes de o robô começar: não é dele');
}
/* nome de grupo */
{
  const nfd = 'Multimídia · Geral';
  ok(R.mesmoNome('Multimídia · Geral', nfd), 'acento composto e decomposto são o mesmo nome');
  ok(R.mesmoNome(' Multimídia  ·  Geral ', 'Multimídia · Geral'), 'espaços sobrando não importam');
  ok(!R.mesmoNome('Multimídia • Geral', 'Multimídia · Geral') && !R.mesmoNome('Multimídia · Geral 2', 'Multimídia · Geral'), 'outro ponto ou outro nome: diferente');
  ok(!R.mesmoNome('', '') && !R.mesmoNome(null, undefined), 'vazio nunca casa');
}
/* telefones brasileiros e quem está no grupo */
{
  ok(igual(R.variantesBR('5521988887777'), ['5521988887777', '552188887777']), 'celular com 9: também sem o 9');
  ok(igual(R.variantesBR('552188887777'), ['552188887777', '5521988887777']), 'celular sem o 9: também com o 9');
  ok(igual(R.variantesBR('552133334444'), ['552133334444']), 'fixo: só ele');
  ok(igual(R.variantesBR(''), []) && igual(R.variantesBR(null), []), 'vazio: nada');
  const part = [
    { id: '111111111111111@lid', phoneNumber: '552188887777@s.whatsapp.net' }, // conta antiga, sem o 9
    { id: '5521977776666@s.whatsapp.net' },                                    // grupo antigo, pelo número
    { id: '222222222222222@lid' },                                             // número escondido
  ];
  const r = R.mencoesNoGrupo(part, ['5521988887777', '5521977776666', '5521966665555']);
  ok(r[0].jid === '111111111111111@lid', 'acha pelo número do grupo "@lid", mesmo sem o 9 na conta', JSON.stringify(r[0]));
  ok(r[1].jid === '5521977776666@s.whatsapp.net', 'acha pelo número no grupo antigo');
  ok(r[2].jid === null, 'quem não está no grupo fica sem menção');
}
/* aplicar as menções */
{
  const mencoes = [{ nome: 'Ana', telefone: '552197654321' }, { nome: 'Bia', telefone: '5521976543210' }, { nome: 'Caio', telefone: '5521911112222' }];
  const texto = 'Falta confirmar: @5521976543210, @552197654321 e @5521911112222. Ver @5521999999999.';
  const res = R.aplicarMencoes(texto, mencoes, [
    { telefone: '552197654321', jid: '333@lid' }, { telefone: '5521976543210', jid: '444@lid' }, { telefone: '5521911112222', jid: null },
  ]);
  ok(res.texto === 'Falta confirmar: @444, @333 e Caio. Ver @5521999999999.', 'troca o número inteiro, nunca um pedaço; sem grupo vira o nome', res.texto);
  ok(igual(res.mentions, ['444@lid', '333@lid']), 'menciona só quem está no grupo, na ordem do texto', JSON.stringify(res.mentions));
  const dup = R.aplicarMencoes('@5521911112222 e @5521911112222', [{ nome: 'C', telefone: '5521911112222' }], [{ telefone: '5521911112222', jid: '9@lid' }]);
  ok(dup.texto === '@9 e @9' && igual(dup.mentions, ['9@lid']), 'a mesma pessoa duas vezes: uma menção só');
  const j = R.juntarCobrancas([{ texto: 'sábado', mentions: ['1@lid', '2@lid'] }, { texto: 'domingo', mentions: ['2@lid', '3@lid'] }]);
  ok(j.texto === 'sábado\n\ndomingo' && igual(j.mentions, ['1@lid', '2@lid', '3@lid']), 'duas cobranças viram uma mensagem');
}
/* o registro não leva nome nem telefone */
{
  const r = R.resumoSemDados('ESCALA\nAna Lima\n@5521988887777 e @111111111111111');
  ok(igual(r, { linhas: 3, caracteres: 49, mencoes: 2 }) && !JSON.stringify(r).match(/Ana|5521/), 'resumo só com números', JSON.stringify(r));
  const e = { envios: { '2026-09-01': {}, '2026-10-30': {} }, cobrancas: { '2026-09-01': {} } };
  R.podar(e, '2026-10-30', 30);
  ok(igual(Object.keys(e.envios), ['2026-10-30']) && igual(Object.keys(e.cobrancas), []), 'podar tira o que tem mais de 30 dias');
}
/* o plano de um dia */
{
  const grupos = { 'Grupo geral': 'G', 'Multimídia · Foto': 'F' };
  const resp = (linhas, extra = {}) => ({ ok: true, culto: { preenchidos: 3, hora: '19h' }, linhas, ...extra });
  const L = (gid, nome, ass, vazio = false) => ({ gid, nome, texto: vazio ? '' : `texto ${gid} ${ass}`, ass, vazio });
  let p = R.planoDoDia({ resposta: resp([L('geral', 'Grupo geral', 'a'), L('g2', 'Multimídia · Foto', 'b')]), estadoDoDia: {}, grupos, primeiraPermitida: true, comecou: false });
  ok(igual(p.acoes.map((a) => [a.tipo, a.grupo]), [['primeira', 'G'], ['primeira', 'F']]), 'primeira vez: as duas linhas');
  p = R.planoDoDia({ resposta: resp([L('geral', 'Grupo geral', 'a')]), estadoDoDia: {}, grupos, primeiraPermitida: false, comecou: false });
  ok(!p.acoes.length, 'primeira não permitida: nada');
  const est = { geral: { ass: 'a', situacao: 'postado', versao: 1 }, g2: { ass: 'b', situacao: 'postado', versao: 1 } };
  p = R.planoDoDia({ resposta: resp([L('geral', 'Grupo geral', 'a'), L('g2', 'Multimídia · Foto', 'b2')]), estadoDoDia: est, grupos, primeiraPermitida: false, comecou: false });
  ok(igual(p.acoes.map((a) => [a.tipo, a.grupo]), [['atualizacao', 'F']]), 'mudou só a Foto: só ela de novo');
  p = R.planoDoDia({ resposta: resp([L('g2', 'Multimídia · Foto', 'b9')]), estadoDoDia: { g2: { ass: 'b', situacao: 'postado', versao: 4 } }, grupos, primeiraPermitida: true, comecou: false });
  ok(!p.acoes.length && p.avisos[0]?.chave === 'versoes:g2', 'na quarta versão para de repor e avisa', JSON.stringify(p.avisos));
  p = R.planoDoDia({ resposta: resp([L('g2', 'Multimídia · Foto', 'b9')]), estadoDoDia: { g2: { ass: 'b', situacao: 'incerto', versao: 1 } }, grupos, primeiraPermitida: true, comecou: false });
  ok(!p.acoes.length && p.avisos[0]?.chave === 'incerto:g2', 'incerto não repete, avisa');
  p = R.planoDoDia({ resposta: resp([L('g2', 'Multimídia · Foto', 'x', true)]), estadoDoDia: { g2: { ass: 'b', situacao: 'postado', versao: 1 } }, grupos, primeiraPermitida: true, comecou: false });
  ok(!p.acoes.length && p.avisos[0]?.chave === 'vazio:g2', 'grupo que ficou vazio depois do envio: avisa, não manda');
  p = R.planoDoDia({ resposta: resp([L('g9', 'Multimídia · Outro', 'z')]), estadoDoDia: {}, grupos, primeiraPermitida: true, comecou: false });
  ok(!p.acoes.length && p.avisos[0]?.chave === 'semgrupo:Multimídia · Outro', 'linha fora da tabela: pula e avisa');
  p = R.planoDoDia({ resposta: resp([L('geral', 'Grupo geral', 'a')]), estadoDoDia: {}, grupos, primeiraPermitida: true, comecou: true });
  ok(!p.acoes.length, 'culto começou: nada');
  p = R.planoDoDia({ resposta: { ok: false }, estadoDoDia: {}, grupos, primeiraPermitida: true, comecou: false });
  ok(!p.acoes.length, 'resposta ruim: nada');
}
/* cobrar? */
{
  const cfg = { cobrancaDepoisDaEscalaH: 6, cobrancaIntervaloMinimoH: 6 };
  const t0 = Date.parse('2026-10-29T22:58:00Z');
  const resp = { ok: true, cobranca: { texto: 'x', pendentes: 2, mencoes: [] } };
  const est = { geral: { situacao: 'postado', em: new Date(t0).toISOString() } };
  ok(!R.deveCobrar({ resposta: resp, estadoDoDia: est, agoraMs: t0 + 5 * 3600000, cfg, comecou: false }), 'escala no grupo há menos de 6 h: não cobra');
  ok(R.deveCobrar({ resposta: resp, estadoDoDia: est, agoraMs: t0 + 7 * 3600000, cfg, comecou: false }), 'depois de 6 h: cobra');
  ok(!R.deveCobrar({ resposta: resp, estadoDoDia: est, agoraMs: t0 + 7 * 3600000, cfg, comecou: true }), 'culto começou: não cobra');
  ok(!R.deveCobrar({ resposta: { ok: true, cobranca: { texto: 'x', pendentes: 0 } }, estadoDoDia: est, agoraMs: t0 + 7 * 3600000, cfg, comecou: false }), 'ninguém faltando: não cobra');
  ok(!R.deveCobrar({ resposta: resp, estadoDoDia: {}, agoraMs: t0 + 7 * 3600000, cfg, comecou: false }), 'escala não postada pelo robô: não cobra');
  ok(!R.deveCobrar({ resposta: resp, estadoDoDia: est, cobranca: { em: new Date(t0 + 4 * 3600000).toISOString(), situacao: 'postado' }, agoraMs: t0 + 7 * 3600000, cfg, comecou: false }), 'cobrou há 3 h: espera');
  ok(!R.deveCobrar({ resposta: resp, estadoDoDia: est, cobranca: { situacao: 'incerto', em: new Date(t0).toISOString() }, agoraMs: t0 + 20 * 3600000, cfg, comecou: false }), 'cobrança incerta: parada até conferir');
}

/* ===================================================== a semana de mentira === */

const JID = (n) => `120363${String(n).padStart(12, '0')}@g.us`;
const GRUPOS_WA = Object.fromEntries([...new Set(Object.values(CONFIG.grupos))].map((nome, i) => [nome, { jid: JID(i + 1), soAdmin: false, admin: true, participantes: 20 }]));
const PARTICIPANTES_GERAL = [
  { id: '111111111111111@lid', phoneNumber: '552188887777@s.whatsapp.net' },
  { id: '5521977776666@s.whatsapp.net' },
  { id: '222222222222222@lid' },
];

/* o sistema de mentira: Follow no sábado 31/10 (19h) e culto no domingo 01/11 (10h) */
function sistema() {
  const ass = { '2026-10-31': { geral: 's1', g1: 's1p', g2: 's1f' }, '2026-11-01': { geral: 'd1', g1: 'd1p', g2: 'd1f' } };
  const pend = { '2026-10-31': 2, '2026-11-01': 1 };
  const falhaEm = new Set();
  const lidos = [];
  const ler = async (data) => {
    lidos.push(data);
    if (falhaEm.has(data)) throw new Error('o sistema respondeu 503');
    const a = ass[data];
    if (!a) return { ok: true, data, culto: { existe: false, preenchidos: 0, postos: 0 }, linhas: [], cobranca: null };
    const hora = data === '2026-10-31' ? '19h' : '10h';
    const mencoes = [{ nome: 'Ana', telefone: '5521988887777' }, { nome: 'Bia', telefone: '5521966665555' }].slice(0, pend[data]);
    return {
      ok: true, data, equipe: { slug: 'midia', nome: 'Mídia' },
      culto: { existe: true, evento: data === '2026-10-31' ? 'Follow' : 'Culto', hora, postos: 5, preenchidos: 4 },
      linhas: [
        { gid: 'geral', nome: 'Grupo geral', texto: `ESCALA ${data} ${a.geral}`, ass: a.geral, vazio: false },
        { gid: 'g1', nome: 'Multimídia · Projeção', texto: `PROJEÇÃO ${data} ${a.g1}`, ass: a.g1, vazio: false },
        { gid: 'g2', nome: 'Multimídia · Foto', texto: `FOTO ${data} ${a.g2}`, ass: a.g2, vazio: false },
        { gid: 'g3', nome: 'Multimídia · Head', texto: '', ass: 'h', vazio: true },
      ],
      cobranca: pend[data] ? { texto: `${data}: falta confirmar ${mencoes.map((m) => '@' + m.telefone).join(' e ')}`, mencoes, pendentes: pend[data] } : null,
    };
  };
  return { ler, ass, pend, falhaEm, lidos };
}

/* o WhatsApp de mentira: guarda o que saiu; `falhar` diz qual envio dá erro e de que fase */
function whatsapp() {
  const saiu = [];
  const w = {
    saiu, falhar: null, mapa: { ...GRUPOS_WA }, aberto: () => true, esperarAberto: async () => {},
    tentativas: 0,
    mapearGrupos: async (nomes) => Object.fromEntries(nomes.map((n) => [n, w.mapa[n] || { erro: 'não achei o grupo' }])),
    mencoesDoGrupo: async (jid, tels) => R.mencoesNoGrupo(PARTICIPANTES_GERAL, tels),
    postar: async (jid, texto, mentions) => {
      w.tentativas++;
      const f = w.falhar?.(w.tentativas, jid, texto);
      if (f) { const e = new Error('falha de mentira'); e.fase = f; throw e; }
      saiu.push({ jid, texto, mentions });
      return 'id' + w.tentativas;
    },
  };
  return w;
}
const nomeDoJid = (jid) => Object.entries(GRUPOS_WA).find(([, g]) => g.jid === jid)?.[0];

/* roda as rodadas de um dia, na hora certa de cada uma; `pular` deixa uma de fora (Mac dormindo) */
async function semana({ inicio, dias, sis = sistema(), wa = whatsapp(), pular = new Set(), antes = () => {}, ctx = {} }) {
  const estado = ctx.estado || { inicio, envios: {}, cobrancas: {}, rodadas: {} };
  const avisos = [];
  let pausadoEm = null;
  for (const dia of dias) {
    for (const rodada of CONFIG.rodadas) {
      const quando = Date.parse(`${dia}T${rodada.hhmm}:00-03:00`);
      if (pular.has(`${dia} ${rodada.hhmm}`)) continue;
      antes(dia, rodada.hhmm, sis, wa, estado);
      const agora = R.agoraSP(new Date(quando));
      const res = await executarRodada({
        wa, lerDia: sis.ler, rodada, agora, estado, cfg: CONFIG,
        avisar: (t, k) => avisos.push({ t, k, dia, hh: rodada.hhmm }), log: () => {},
        pausado: () => !!pausadoEm, pausar: (m) => { pausadoEm = m; }, espera: async () => {}, salvar: () => {},
        agoraMs: () => quando,
      });
      (ctx.resultados ||= []).push({ dia, hh: rodada.hhmm, ...res });
    }
  }
  return { estado, avisos, saiu: wa.saiu, sis, wa, pausadoEm: () => pausadoEm, ctx };
}
const DIAS = ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];
const resumo = (saiu) => saiu.map((m) => `${nomeDoJid(m.jid)} | ${m.texto.split('\n')[0].slice(0, 40)}`);

/* A · a semana normal, com o robô ligado desde segunda */
{
  const r = await semana({ inicio: '2026-10-26T18:00:00.000Z', dias: DIAS });
  const s = resumo(r.saiu);
  ok(s.length === 10, 'semana normal: 10 mensagens', JSON.stringify(s, null, 1));
  ok(igual(s.slice(0, 3), ['Multimídia · Geral | ESCALA 2026-10-31 s1', 'Multimídia · Projeção | PROJEÇÃO 2026-10-31 s1p', 'Multimídia · Foto | FOTO 2026-10-31 s1f']),
    'quinta 19:58: o Follow de sábado no geral e nos grupos, e nada no grupo vazio (Head)', JSON.stringify(s.slice(0, 3)));
  ok(s[3].startsWith('Multimídia · Geral | 2026-10-31: falta confirmar @1111'), 'sexta 12:00: a primeira cobrança do sábado', s[3]);
  ok(igual(s.slice(4, 7), ['Multimídia · Geral | ESCALA 2026-11-01 d1', 'Multimídia · Projeção | PROJEÇÃO 2026-11-01 d1p', 'Multimídia · Foto | FOTO 2026-11-01 d1f'])
    && s[7].startsWith('Multimídia · Geral | 2026-10-31: falta confirmar @1111') && !r.saiu[7].texto.includes('2026-11-01'),
    'sexta 19:58: o domingo nos grupos e a segunda cobrança do sábado', JSON.stringify(s.slice(4, 8)));
  ok(r.saiu[8].texto.startsWith('2026-10-31: falta') && r.saiu[8].texto.includes('\n\n2026-11-01: falta'), 'sábado 12:00: sábado e domingo numa cobrança só', r.saiu[8].texto);
  ok(s[9].startsWith('Multimídia · Geral | 2026-11-01: falta'), 'sábado 19:58: o Follow começou, cobra só o domingo', s[9]);
  const c = r.saiu[3];
  ok(c.texto === '2026-10-31: falta confirmar @111111111111111 e Bia', 'a cobrança marca quem está no grupo (pelo @lid) e escreve o nome de quem não está', c.texto);
  ok(igual(c.mentions, ['111111111111111@lid']), 'a menção vai com o endereço que o grupo usa', JSON.stringify(c.mentions));
  ok(r.saiu.every((m) => !/@55\d{10,11}/.test(m.texto)), 'nenhum telefone cru sai no grupo');
  ok(r.estado.envios['2026-10-31'].geral.situacao === 'postado' && r.estado.envios['2026-10-31'].g3 === undefined, 'estado: o geral postado; o grupo vazio sem registro');
  ok(r.estado.cobrancas['2026-10-31'].vezes === 3 && r.estado.cobrancas['2026-11-01'].vezes === 2, 'três cobranças do sábado e duas do domingo', JSON.stringify(r.estado.cobrancas));
  ok(r.ctx.resultados.every((x) => x.completa), 'todas as rodadas completas');
  ok(!r.saiu.some((m) => m.jid === GRUPOS_WA['Multimídia · Head'].jid), 'nada no Head (linha vazia)');
}

/* B · a escala muda depois do envio: a versão nova vai só onde mudou, até o limite */
{
  const r = await semana({
    inicio: '2026-10-26T18:00:00.000Z', dias: ['2026-10-29', '2026-10-30'],
    antes: (dia, hh, sis) => {
      if (dia === '2026-10-30' && hh === '09:00') { sis.ass['2026-10-31'].geral = 's2'; sis.ass['2026-10-31'].g2 = 's2f'; }
      if (dia === '2026-10-30' && hh === '12:00') { sis.ass['2026-10-31'].g2 = 's3f'; }
      if (dia === '2026-10-30' && hh === '19:58') { sis.ass['2026-10-31'].g2 = 's4f'; }
    },
  });
  const s = resumo(r.saiu);
  ok(igual(s.slice(3, 5), ['Multimídia · Geral | ESCALA 2026-10-31 s2', 'Multimídia · Foto | FOTO 2026-10-31 s2f']), 'sexta 09:00: geral e Foto de novo, Projeção não', JSON.stringify(s));
  ok(s.filter((x) => x.includes('FOTO 2026-10-31')).length === 4, 'Foto: quatro versões (a primeira e três trocas)', JSON.stringify(s));
  ok(r.estado.envios['2026-10-31'].g2.versao === 4, 'a quarta versão gravada');
  /* a quinta troca não sai: passa do limite e avisa */
  const sis = r.sis;
  sis.ass['2026-10-31'].g2 = 's5f';
  const antes = r.saiu.length;
  const res = await executarRodada({
    wa: r.wa, lerDia: sis.ler, rodada: CONFIG.rodadas[0], agora: R.agoraSP(new Date('2026-10-31T12:00:00Z')), estado: r.estado, cfg: CONFIG,
    avisar: (t, k) => r.avisos.push({ t, k }), log: () => {}, pausado: () => false, pausar: () => {}, espera: async () => {}, salvar: () => {},
    agoraMs: () => Date.parse('2026-10-31T12:00:00Z'),
  });
  ok(r.saiu.length === antes && res.completa, 'a quinta versão não sai');
  ok(r.avisos.some((a) => a.k === '2026-10-31:versoes:g2'), 'e o Arthur é avisado');
}

/* C · marco zero: escala cuja hora de sair veio antes de o robô começar não é dele */
{
  const r = await semana({ inicio: '2026-10-30T23:30:00.000Z', dias: DIAS }); /* sexta 20:30, depois das duas horas de sair */
  ok(r.saiu.length === 0, 'robô ligado sexta 20:30: não manda sábado nem domingo, nem cobra', JSON.stringify(resumo(r.saiu)));
  const r2 = await semana({ inicio: '2026-10-29T22:00:00.000Z', dias: DIAS }); /* quinta 19:00 */
  ok(resumo(r2.saiu)[0] === 'Multimídia · Geral | ESCALA 2026-10-31 s1', 'robô ligado quinta 19:00: manda o sábado às 19:58');
  const r3 = await semana({ inicio: '2026-10-30T12:00:00.000Z', dias: DIAS }); /* sexta 09:00 */
  ok(!resumo(r3.saiu).some((x) => x.includes('2026-10-31')) && resumo(r3.saiu).some((x) => x.includes('ESCALA 2026-11-01')),
    'robô ligado sexta 09:00: o sábado fica com quem já mandava; o domingo é dele', JSON.stringify(resumo(r3.saiu)));
}

/* D · Mac dormindo na quinta 19:58: o sábado sai na sexta 09:00 */
{
  const r = await semana({ inicio: '2026-10-26T18:00:00.000Z', dias: ['2026-10-29', '2026-10-30'], pular: new Set(['2026-10-29 19:58']) });
  const s = resumo(r.saiu);
  ok(igual(s.slice(0, 3), ['Multimídia · Geral | ESCALA 2026-10-31 s1', 'Multimídia · Projeção | PROJEÇÃO 2026-10-31 s1p', 'Multimídia · Foto | FOTO 2026-10-31 s1f']), 'a rodada das 09:00 manda o que ficou para trás', JSON.stringify(s));
  ok(!s.slice(0, 3).some((x) => x.includes('2026-11-01')), 'e não adianta o domingo');
}

/* E · falhas no envio */
{
  /* "antes": nada saiu; a rodada para e a próxima tentativa manda o resto sem repetir */
  const wa = whatsapp();
  wa.falhar = (n) => (n === 2 ? 'antes' : null);
  const sis = sistema();
  const estado = { inicio: '2026-10-26T18:00:00.000Z', envios: {}, cobrancas: {}, rodadas: {} };
  const rodar = (iso) => executarRodada({
    wa, lerDia: sis.ler, rodada: CONFIG.rodadas[2], agora: R.agoraSP(new Date(iso)), estado, cfg: CONFIG,
    avisar: () => {}, log: () => {}, pausado: () => false, pausar: () => {}, espera: async () => {}, salvar: () => {}, agoraMs: () => Date.parse(iso),
  });
  const r1 = await rodar('2026-10-29T22:58:00Z');
  ok(!r1.completa && wa.saiu.length === 1, 'falha antes do envio: rodada incompleta, só o geral saiu', JSON.stringify(r1));
  const r2 = await rodar('2026-10-29T23:03:00Z');
  ok(r2.completa && igual(resumo(wa.saiu), ['Multimídia · Geral | ESCALA 2026-10-31 s1', 'Multimídia · Projeção | PROJEÇÃO 2026-10-31 s1p', 'Multimídia · Foto | FOTO 2026-10-31 s1f']),
    'a nova tentativa manda Projeção e Foto, sem repetir o geral', JSON.stringify(resumo(wa.saiu)));
}
{
  /* "durante": pode ter saído; fica incerto, não repete, o resto sai */
  const wa = whatsapp();
  wa.falhar = (n) => (n === 2 ? 'durante' : null);
  const avisos = [];
  const sis = sistema();
  const estado = { inicio: '2026-10-26T18:00:00.000Z', envios: {}, cobrancas: {}, rodadas: {} };
  const rodar = (iso) => executarRodada({
    wa, lerDia: sis.ler, rodada: CONFIG.rodadas[2], agora: R.agoraSP(new Date(iso)), estado, cfg: CONFIG,
    avisar: (t, k) => avisos.push(k), log: () => {}, pausado: () => false, pausar: () => {}, espera: async () => {}, salvar: () => {}, agoraMs: () => Date.parse(iso),
  });
  const r1 = await rodar('2026-10-29T22:58:00Z');
  ok(!r1.completa && estado.envios['2026-10-31'].g1.situacao === 'incerto', 'envio incerto: gravado como incerto');
  await rodar('2026-10-29T23:03:00Z');
  ok(igual(resumo(wa.saiu), ['Multimídia · Geral | ESCALA 2026-10-31 s1', 'Multimídia · Foto | FOTO 2026-10-31 s1f']), 'a Projeção incerta não sai de novo; a Foto sai', JSON.stringify(resumo(wa.saiu)));
  ok(avisos.includes('2026-10-31:incerto:g1'), 'e o aviso de conferir a Projeção');
  /* conferido "não saiu": libera para a próxima rodada */
  delete estado.envios['2026-10-31'].g1;
  await rodar('2026-10-30T12:00:00Z');
  ok(resumo(wa.saiu).filter((x) => x.includes('PROJEÇÃO 2026-10-31')).length === 1, 'depois de conferido, a Projeção sai uma vez', JSON.stringify(resumo(wa.saiu)));
}
{
  /* "recusado": o WhatsApp devolveu erro; o robô pausa e nada mais sai */
  const r = await semana({
    inicio: '2026-10-26T18:00:00.000Z', dias: DIAS,
    wa: Object.assign(whatsapp(), {}),
    antes: (dia, hh, sis, wa) => { if (dia === '2026-10-29') wa.falhar = (n) => (n === 2 ? 'recusado' : null); },
  });
  ok(r.saiu.length === 1 && !!r.pausadoEm(), 'recusa na segunda mensagem: o robô se pausa e nada mais sai a semana toda', JSON.stringify(resumo(r.saiu)));
  ok(r.avisos.some((a) => String(a.k).startsWith('recusado:')), 'com aviso de recusa');
}
{
  /* o sistema fora num dia: os outros seguem e a rodada fica incompleta */
  const sis = sistema();
  sis.falhaEm.add('2026-10-31');
  const r = await semana({ inicio: '2026-10-26T18:00:00.000Z', dias: ['2026-10-30'], sis });
  const s = resumo(r.saiu);
  ok(!s.some((x) => x.includes('2026-10-31')) && s.some((x) => x.includes('ESCALA 2026-11-01')), 'sábado fora do ar não segura o domingo', JSON.stringify(s));
  ok(r.ctx.resultados.every((x) => !x.completa), 'e cada rodada fica incompleta para tentar de novo');
}
{
  /* grupo que sumiu do WhatsApp ou só deixa admin escrever: pula e avisa, o resto sai */
  const wa = whatsapp();
  wa.mapa = { ...GRUPOS_WA, 'Multimídia · Foto': undefined, 'Multimídia · Projeção': { ...GRUPOS_WA['Multimídia · Projeção'], soAdmin: true, admin: false } };
  const r = await semana({ inicio: '2026-10-26T18:00:00.000Z', dias: ['2026-10-29'], wa });
  ok(igual(resumo(r.saiu), ['Multimídia · Geral | ESCALA 2026-10-31 s1']), 'só o geral sai', JSON.stringify(resumo(r.saiu)));
  ok(r.avisos.some((a) => a.k === '2026-10-31:alvo:Multimídia · Foto') && r.avisos.some((a) => a.k === '2026-10-31:admin:Multimídia · Projeção'), 'com os dois avisos');
}
{
  /* pausado no meio da rodada: para na hora */
  const wa = whatsapp();
  let pausa = false;
  const orig = wa.postar;
  wa.postar = async (...a) => { const id = await orig(...a); pausa = true; return id; };
  const sis = sistema();
  const estado = { inicio: '2026-10-26T18:00:00.000Z', envios: {}, cobrancas: {}, rodadas: {} };
  const res = await executarRodada({
    wa, lerDia: sis.ler, rodada: CONFIG.rodadas[2], agora: R.agoraSP(new Date('2026-10-29T22:58:00Z')), estado, cfg: CONFIG,
    avisar: () => {}, log: () => {}, pausado: () => pausa, pausar: () => {}, espera: async () => {}, salvar: () => {}, agoraMs: () => Date.parse('2026-10-29T22:58:00Z'),
  });
  ok(wa.saiu.length === 1 && res.motivo === 'pausado', 'PAUSADO no meio: só a mensagem que já tinha saído', JSON.stringify(res));
}
{
  /* intervalo entre mensagens: uma pausa entre cada duas, nenhuma antes da primeira */
  let pausas = 0;
  const wa = whatsapp();
  const sis = sistema();
  await executarRodada({
    wa, lerDia: sis.ler, rodada: CONFIG.rodadas[2], agora: R.agoraSP(new Date('2026-10-29T22:58:00Z')),
    estado: { inicio: '2026-10-26T18:00:00.000Z', envios: {}, cobrancas: {}, rodadas: {} }, cfg: CONFIG,
    avisar: () => {}, log: () => {}, pausado: () => false, pausar: () => {}, espera: async (faixa) => { pausas++; ok(igual(faixa, CONFIG.intervaloEntreMensagensS), 'a pausa usa a faixa da configuração'); },
    salvar: () => {}, agoraMs: () => Date.parse('2026-10-29T22:58:00Z'),
  });
  ok(pausas === wa.saiu.length - 1, 'uma pausa entre cada duas mensagens', `${pausas} pausas, ${wa.saiu.length} mensagens`);
}
{
  /* sem conexão: não lê nada, rodada incompleta */
  const wa = whatsapp();
  wa.aberto = () => false;
  wa.esperarAberto = async () => { throw new Error('não conectou'); };
  const sis = sistema();
  const res = await executarRodada({
    wa, lerDia: sis.ler, rodada: CONFIG.rodadas[2], agora: R.agoraSP(new Date('2026-10-29T22:58:00Z')),
    estado: { inicio: '2026-10-26T18:00:00.000Z', envios: {}, cobrancas: {}, rodadas: {} }, cfg: CONFIG,
    avisar: () => {}, log: () => {}, pausado: () => false, pausar: () => {}, espera: async () => {}, salvar: () => {}, agoraMs: () => Date.now(),
  });
  ok(!res.completa && wa.saiu.length === 0 && sis.lidos.length === 0, 'sem conexão: nada lido, nada mandado, tenta de novo');
}

/* F · grava antes de mandar: o que está no disco na hora do envio já diz "incerto" */
{
  const wa = whatsapp();
  const sis = sistema();
  const estado = { inicio: '2026-10-26T18:00:00.000Z', envios: {}, cobrancas: {}, rodadas: {} };
  let disco = null;
  const visto = [];
  const orig = wa.postar;
  wa.postar = async (...a) => { visto.push(JSON.parse(JSON.stringify(disco))); return orig(...a); };
  const rodar = (iso, extra = {}) => executarRodada({
    wa, lerDia: sis.ler, rodada: CONFIG.rodadas[2], agora: R.agoraSP(new Date(iso)), estado, cfg: CONFIG,
    avisar: () => {}, log: () => {}, pausado: () => false, pausar: () => {}, espera: async () => {},
    salvar: () => { disco = JSON.parse(JSON.stringify(estado)); }, agoraMs: () => Date.parse(iso), ...extra,
  });
  await rodar('2026-10-29T22:58:00Z');
  ok(visto[0]?.envios['2026-10-31']?.geral?.situacao === 'incerto' && /parou no meio/.test(visto[0].envios['2026-10-31'].geral.erro),
    'na hora do envio, o disco já diz "incerto" (se o Mac desligar, não repete)', JSON.stringify(visto[0]?.envios));
  ok(disco.envios['2026-10-31'].geral.situacao === 'postado' && disco.envios['2026-10-31'].g1.situacao === 'postado', 'depois de sair, "postado" no disco');
  /* o processo "morre" no meio do envio da Foto: o que sobra é o disco daquele instante */
  const morto = visto[2];
  ok(morto.envios['2026-10-31'].g2.situacao === 'incerto', 'Foto marcada incerta antes de sair');
  const wa2 = whatsapp();
  const avisos = [];
  const res = await executarRodada({
    wa: wa2, lerDia: sis.ler, rodada: CONFIG.rodadas[2], agora: R.agoraSP(new Date('2026-10-29T23:05:00Z')), estado: morto, cfg: CONFIG,
    avisar: (t, k) => avisos.push(k), log: () => {}, pausado: () => false, pausar: () => {}, espera: async () => {}, salvar: () => {},
    agoraMs: () => Date.parse('2026-10-29T23:05:00Z'),
  });
  ok(res.completa && wa2.saiu.length === 0 && avisos.includes('2026-10-31:incerto:g2'), 'depois de religar: não repete a Foto, avisa para conferir', JSON.stringify(resumo(wa2.saiu)));
}
{
  /* sem conseguir gravar, nada sai */
  const wa = whatsapp();
  const sis = sistema();
  const avisos = [];
  const res = await executarRodada({
    wa, lerDia: sis.ler, rodada: CONFIG.rodadas[2], agora: R.agoraSP(new Date('2026-10-29T22:58:00Z')),
    estado: { inicio: '2026-10-26T18:00:00.000Z', envios: {}, cobrancas: {}, rodadas: {} }, cfg: CONFIG,
    avisar: (t, k) => avisos.push(k), log: () => {}, pausado: () => false, pausar: () => {}, espera: async () => {},
    salvar: () => { throw new Error('ENOSPC: disco cheio'); }, agoraMs: () => Date.parse('2026-10-29T22:58:00Z'),
  });
  ok(!res.completa && res.motivo === 'gravar' && wa.saiu.length === 0 && avisos.includes('gravar'), 'disco sem gravar: nada sai, e avisa', JSON.stringify(res));
}
{
  /* "antes" numa troca: volta a versão anterior gravada, e a troca sai na próxima tentativa */
  const wa = whatsapp();
  const sis = sistema();
  const estado = { inicio: '2026-10-26T18:00:00.000Z', envios: {}, cobrancas: {}, rodadas: {} };
  const rodar = (iso, rod = CONFIG.rodadas[2]) => executarRodada({
    wa, lerDia: sis.ler, rodada: rod, agora: R.agoraSP(new Date(iso)), estado, cfg: CONFIG,
    avisar: () => {}, log: () => {}, pausado: () => false, pausar: () => {}, espera: async () => {}, salvar: () => {}, agoraMs: () => Date.parse(iso),
  });
  await rodar('2026-10-29T22:58:00Z');
  sis.ass['2026-10-31'].g2 = 's2f';
  wa.falhar = (n, jid, texto) => (texto.includes('s2f') ? 'antes' : null);
  await rodar('2026-10-30T12:00:00Z', CONFIG.rodadas[0]);
  ok(estado.envios['2026-10-31'].g2.situacao === 'postado' && estado.envios['2026-10-31'].g2.ass === 's1f' && estado.envios['2026-10-31'].g2.versao === 1,
    '"antes" na troca: fica a versão anterior, não "incerto"', JSON.stringify(estado.envios['2026-10-31'].g2));
  wa.falhar = null;
  await rodar('2026-10-30T12:05:00Z', CONFIG.rodadas[0]);
  ok(estado.envios['2026-10-31'].g2.ass === 's2f' && estado.envios['2026-10-31'].g2.versao === 2 && resumo(wa.saiu).filter((x) => x.includes('FOTO 2026-10-31 s2f')).length === 1,
    'e a troca sai na tentativa seguinte, uma vez', JSON.stringify(estado.envios['2026-10-31'].g2));
}
{
  /* um dia sem leitura: a cobrança espera, e sai uma só, juntada, na tentativa seguinte */
  const r = await semana({ inicio: '2026-10-26T18:00:00.000Z', dias: ['2026-10-29', '2026-10-30'] });
  const sis = r.sis;
  sis.falhaEm.add('2026-11-01');
  const antes = r.saiu.length;
  const rodar = (iso) => executarRodada({
    wa: r.wa, lerDia: sis.ler, rodada: CONFIG.rodadas[1], agora: R.agoraSP(new Date(iso)), estado: r.estado, cfg: CONFIG,
    avisar: () => {}, log: () => {}, pausado: () => false, pausar: () => {}, espera: async () => {}, salvar: () => {}, agoraMs: () => Date.parse(iso),
  });
  const r1 = await rodar('2026-10-31T15:00:00Z');
  ok(!r1.completa && r.saiu.length === antes, 'sábado 12:00 com o domingo fora do ar: a cobrança espera', JSON.stringify(resumo(r.saiu.slice(antes))));
  sis.falhaEm.clear();
  const r2 = await rodar('2026-10-31T15:05:00Z');
  ok(r2.completa && r.saiu.length === antes + 1 && r.saiu[antes].texto.includes('2026-10-31') && r.saiu[antes].texto.includes('2026-11-01'),
    'e sai uma só, com os dois dias, na tentativa seguinte', JSON.stringify(resumo(r.saiu.slice(antes))));
}
/* os grupos presos ao endereço do primeiro encontro */
{
  const m1 = { A: { jid: 'a@g.us' }, B: { jid: 'b@g.us' }, C: { erro: 'não achei o grupo' } };
  const p1 = R.conferirFixos(m1, {});
  ok(igual(p1.fixos, { A: 'a@g.us', B: 'b@g.us' }) && !p1.trocados.length && p1.mapa.A.jid === 'a@g.us', 'primeiro encontro: guarda os endereços');
  const p2 = R.conferirFixos({ A: { jid: 'a@g.us' }, B: { jid: 'x@g.us' }, C: { jid: 'c@g.us' } }, p1.fixos);
  ok(p2.mapa.A.jid === 'a@g.us' && !p2.mapa.B.jid && /não é mais o mesmo/.test(p2.mapa.B.erro) && igual(p2.trocados, ['B']), 'outro grupo com o nome B: não posta nele', JSON.stringify(p2.mapa.B));
  ok(p2.fixos.B === 'b@g.us' && p2.fixos.C === 'c@g.us', 'o endereço antigo continua guardado; o novo grupo C entra');
}

/* G · pedido do Arthur: mandar a escala de domingo já na segunda (--mandar-agora) */
{
  ok(igual(R.datasDaRodada('2026-10-26', 2, {}, []), ['2026-10-26', '2026-10-27', '2026-10-28']), 'datas da rodada: só a janela');
  ok(igual(R.datasDaRodada('2026-10-26', 2, { '2026-11-01': { geral: {} }, '2026-10-20': { geral: {} }, '2026-11-30': { geral: {} } }, ['2026-10-31', '2026-10-01', 'x']),
    ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-31', '2026-11-01']), 'mais as já postadas à frente e a pedida; nada do passado nem além da vigia');
  const sis = sistema();
  const wa = whatsapp();
  const estado = { inicio: '2026-10-26T20:38:54.000Z', envios: {}, cobrancas: {}, rodadas: {} };
  const avisos = [];
  const rodar = (iso, rodada, antecipar = []) => executarRodada({
    wa, lerDia: sis.ler, rodada, agora: R.agoraSP(new Date(iso)), estado, cfg: CONFIG, antecipar,
    avisar: (t, k) => avisos.push(k), log: () => {}, pausado: () => false, pausar: () => {}, espera: async () => {}, salvar: () => {},
    agoraMs: () => Date.parse(iso),
  });
  const PEDIDO = { hhmm: 'pedido', primeira: false, cobrar: false };
  const r0 = await rodar('2026-10-26T21:00:00Z', PEDIDO, ['2026-11-01']);
  ok(r0.completa && igual(resumo(wa.saiu), ['Multimídia · Geral | ESCALA 2026-11-01 d1', 'Multimídia · Projeção | PROJEÇÃO 2026-11-01 d1p', 'Multimídia · Foto | FOTO 2026-11-01 d1f']),
    'segunda 18:00: o domingo sai no geral e nos grupos, sem cobrança e sem o sábado', JSON.stringify(resumo(wa.saiu)));
  /* a semana segue: terça a escala de domingo muda e a troca sai na rodada seguinte */
  sis.ass['2026-11-01'].g2 = 'd2f';
  for (const dia of ['2026-10-27', '2026-10-28']) for (const rod of CONFIG.rodadas) await rodar(`${dia}T${rod.hhmm}:00-03:00`, rod);
  const ateQuarta = resumo(wa.saiu).slice(3);
  ok(igual(ateQuarta, ['Multimídia · Foto | FOTO 2026-11-01 d2f']), 'a troca do domingo sai na terça 09:00, mesmo fora da janela de 2 dias', JSON.stringify(ateQuarta));
  ok(!wa.saiu.some((m) => m.texto.includes('falta confirmar')), 'e nenhuma cobrança do domingo antes de sexta');
  for (const rod of CONFIG.rodadas) await rodar(`2026-10-29T${rod.hhmm}:00-03:00`, rod);
  for (const rod of CONFIG.rodadas) await rodar(`2026-10-30T${rod.hhmm}:00-03:00`, rod);
  const s2 = resumo(wa.saiu).slice(4);
  ok(s2.filter((x) => x.includes('ESCALA 2026-11-01')).length === 0, 'sexta 19:58 não manda o domingo de novo', JSON.stringify(s2));
  ok(s2.filter((x) => x.includes('ESCALA 2026-10-31')).length === 1, 'o sábado sai na quinta 19:58, como sempre');
  const cob = wa.saiu.filter((m) => m.texto.includes('falta confirmar'));
  ok(cob.length === 2 && cob[0].texto.includes('2026-10-31') && cob[0].texto.includes('2026-11-01'), 'a cobrança do domingo começa na sexta 12:00 (janela de 2 dias), junto com a do sábado', JSON.stringify(cob.map((m) => m.texto.slice(0, 40))));
  /* pedido de dia que já começou: nada */
  const antes = wa.saiu.length;
  await rodar('2026-11-01T14:00:00Z', PEDIDO, ['2026-11-01']);
  ok(wa.saiu.length === antes, 'pedido depois de o culto começar: nada sai');
}

/* o QR do pareamento: cores fixas no terminal (preto sobre branco) e a página do navegador */
{
  const m = [[true, false], [false, true]];
  ok(paraTerminal(m, 0) === '\x1b[30;47m\u2580\u2584\x1b[0m', 'terminal: meio bloco de cima e de baixo, com as cores escritas', JSON.stringify(paraTerminal(m, 0)));
  const t = paraTerminal(m, 2).split('\n');
  ok(t.length === 3 && t.every((l) => l.startsWith('\x1b[30;47m') && l.endsWith('\x1b[0m')) && t[0].includes('      '), 'terminal: margem branca em volta', JSON.stringify(t));
  const p = paraPagina(m);
  ok(p.includes('http-equiv="refresh"') && p.includes('viewBox="0 0 100 100"') && (p.match(/h10v10h-10z/g) || []).length === 2, 'página: SVG com um quadrado por módulo escuro e recarga sozinha');
  ok(!/97297-6946/.test(paraTerminal(m)) && /97297-6946/.test(p), 'a página diz qual celular usar');
  let real = null;
  try { real = matriz('2@robo-guia-teste,abc,def,ghi'); } catch { /* sem a biblioteca (no repositório) */ }
  if (real) {
    ok(real.length >= 21 && real.every((l) => l.length === real.length), 'QR de verdade: quadrado', String(real.length));
    ok([0, 1, 2, 3, 4, 5, 6].every((c) => real[0][c]) && real[0][7] === false, 'QR de verdade: o quadrado de canto no lugar');
  } else {
    console.log('  (qrcode-terminal não instalado aqui: QR de verdade pulado)');
  }
}

/* a configuração: só os grupos da Multimídia, nunca outro */
{
  const destinos = new Set([...Object.values(CONFIG.grupos), CONFIG.grupoDaCobranca]);
  ok([...destinos].every((g) => g.startsWith('Multimídia · ')), 'todos os destinos são grupos da Multimídia', JSON.stringify([...destinos]));
  ok(destinos.size === 8, 'os oito grupos da tabela de 08/10');
  ok(CONFIG.numeroDaIgreja === '5521972976946', 'o número da igreja');
  ok(CONFIG.rodadas.filter((r) => r.primeira).length === 1, 'uma rodada só manda a primeira vez');
}

console.log(`robô do WhatsApp, regras e semana simulada: ${feitas - falhas}/${feitas}`);
if (falhas) process.exit(1);
