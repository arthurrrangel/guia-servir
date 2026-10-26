/* DO SISTEMA AO GRUPO, DE PONTA A PONTA · 26/10/2026.

   O robô do WhatsApp (robo-whatsapp/) não monta texto: ele recebe da rota
   /api/robo/grupos a resposta de `respostaDoRobo` (lib/robo-grupos.ts) e
   decide o que postar (robo-whatsapp/rodada.mjs). Este teste liga as duas
   pontas sem rede e sem banco: um Follow e um domingo da Mídia montados com
   o motor de verdade, a mesma função que a rota usa, e um WhatsApp de mentira
   com os participantes do grupo geral. Confere que:
     · o que sai em cada grupo é exatamente a mensagem do "Mandar nos grupos";
     · a cobrança é a frase do botão "Cobrar confirmação", com o @ de quem
       está no grupo (pelo endereço "@lid" do grupo, mesmo com a conta sem o 9)
       e o nome de quem não está ou não tem telefone;
     · nada de telefone cru sai no grupo.

   Roda com `npm test`. */

import {
  estadoVazio, garantirDia, gruposDoDia, linkDoVoluntario, msgConfirmar, msgEscala,
} from '@/lib/engine';
import { respostaDoRobo } from '@/lib/robo-grupos';
import { IGREJA } from '@/lib/igreja';
import { executarRodada } from '../robo-whatsapp/rodada.mjs';
import * as R from '../robo-whatsapp/regras.mjs';
import { CONFIG as CONFIG_TODA } from '../robo-whatsapp/config.mjs';
import * as Pedidos from '../robo-whatsapp/pedidos.mjs';
import { lerCorpoDoRobo, limparResultado, leituraDoPedido } from '@/lib/robo-pedidos';

/* a Mídia, com as regras gerais (o robô tem a configuração por ministério) */
const CONFIG = R.configDoMinisterio(CONFIG_TODA, 'midia');

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

/* a Mídia com dois grupos por área, como na produção (nomes da tabela do robô) */
const F = (nome, ordem) => ({ id: 'f' + ordem, nome, ordem, simultanea: true, ativa: true, tipos: ['domingo', 'follow'] });
const P = (nome, funcoes, tel = '') => ({
  id: 'v' + nome.toLowerCase().replace(/\W/g, ''), nome, tel, ativo: true, limiteMes: 4,
  token: 'tok' + nome.toLowerCase().replace(/\W/g, ''), funcoes, conferido: true,
  confirmadas: Object.fromEntries(Object.keys(funcoes).map(f => [f, true])), indisponivel: [], disponivel: [],
});
const S = estadoVazio();
S.temAcesso = true;
S.equipe = 'Mídia';
S.funcoes = [F('PROJEÇÃO', 1), F('ILUMINAÇÃO', 2), F('FOTO', 3), F('HEAD', 4)];
S.config.grupos = [
  { id: 'g1', nome: 'Multimídia · Projeção', funcoes: ['f1'] },
  { id: 'g2', nome: 'Multimídia · Iluminação', funcoes: ['f2'] },
  { id: 'g3', nome: 'Multimídia · Foto', funcoes: ['f3'] },
  { id: 'g4', nome: 'Multimídia · Head', funcoes: ['f4'] },
];
S.voluntarios = [
  P('Ana Lima', { 'PROJEÇÃO': 'titular' }, '(21) 98888-7777'),  // no grupo pelo @lid, conta antiga sem o 9
  P('Bruno Reis', { 'ILUMINAÇÃO': 'titular' }, '21 97777-6666'), // no grupo pelo número
  P('Carla Dias', { 'FOTO': 'titular' }, '(21) 96666-5555'),     // fora do grupo geral
  P('Davi Melo', { 'HEAD': 'titular' }, ''),                      // sem telefone
];
const SAB = '2026-10-31', DOM = '2026-11-01';
for (const d of [SAB, DOM]) {
  const dia = garantirDia(S, d);
  dia.cultoId = 'c' + d;
  dia.slots['PROJEÇÃO'] = { vid: 'vanalima', status: 'pendente', fixo: false, primeiraVez: false };
  dia.slots['ILUMINAÇÃO'] = { vid: 'vbrunoreis', status: 'pendente', fixo: false, primeiraVez: false };
  dia.slots['FOTO'] = { vid: 'vcarladias', status: d === SAB ? 'pendente' : 'confirmado', fixo: false, primeiraVez: false };
  dia.slots['HEAD'] = { vid: 'vdavimelo', status: 'pendente', fixo: false, primeiraVez: false };
}
const link = linkDoVoluntario('https://escalas.guiaservir.com', 'midia', 'confirmar');
const rota = (data) => JSON.parse(JSON.stringify(
  respostaDoRobo(S, data, { slug: 'midia', nome: 'Mídia' }, link, IGREJA.cultoHora, IGREJA.followHora)));

/* a resposta da rota tem o que o robô usa */
{
  const r = rota(SAB);
  ok(r.ok && r.culto.existe && r.culto.preenchidos === 4 && r.culto.postos === 4, 'sábado: 4 de 4 postos', JSON.stringify(r.culto));
  ok(r.culto.hora === IGREJA.followHora && R.horaDoCulto(r.culto.hora) !== null, 'a hora do Follow vem num formato que o robô lê', String(r.culto.hora));
  ok(R.horaDoCulto(rota(DOM).culto.hora) === R.horaDoCulto(IGREJA.cultoHora), 'a hora do domingo também');
  ok(r.linhas.every(l => typeof l.gid === 'string' && typeof l.ass === 'string' && typeof l.vazio === 'boolean'), 'cada linha com gid, assinatura e vazio');
  ok(r.linhas.filter(l => !l.vazio).every(l => CONFIG.grupos[l.nome]), 'toda linha com texto tem grupo na tabela do robô',
    JSON.stringify(r.linhas.map(l => l.nome)));
  const vazio = rota('2026-11-07');
  ok(vazio.ok && vazio.culto.preenchidos === 0 && vazio.linhas.length === 0 && vazio.cobranca === null, 'dia sem escala: nada para o robô');
}

/* o grupo geral de mentira: Ana pelo @lid (conta sem o 9), Bruno pelo número, Carla fora */
const LID_ANA = '123456789012345@lid';
const PARTICIPANTES = [
  { id: LID_ANA, phoneNumber: '552188887777@s.whatsapp.net' },
  { id: '5521977776666@s.whatsapp.net' },
  { id: '999999999999999@lid' },
];
const GRUPOS = Object.fromEntries([...new Set(Object.values(CONFIG.grupos))].map((n, i) => [n, { jid: `12036300000000000${i}@g.us`, admin: true, soAdmin: false }]));
const saiu = [];
const wa = {
  aberto: () => true, esperarAberto: async () => {},
  mapearGrupos: async (nomes) => Object.fromEntries(nomes.map(n => [n, GRUPOS[n] || { erro: 'não achei o grupo' }])),
  mencoesDoGrupo: async (jid, tels) => R.mencoesNoGrupo(PARTICIPANTES, tels),
  postar: async (jid, texto, mentions) => { saiu.push({ grupo: Object.keys(GRUPOS).find(n => GRUPOS[n].jid === jid), texto, mentions }); return 'id' + saiu.length; },
};
const estado = { inicio: '2026-10-26T18:00:00.000Z', envios: {}, cobrancas: {}, rodadas: {} };
const rodar = (iso, rodada) => executarRodada({
  wa, lerDia: async (d) => rota(d), rodada, agora: R.agoraSP(new Date(iso)), estado, cfg: CONFIG,
  avisar: () => {}, log: () => {}, pausado: () => false, pausar: () => {}, espera: async () => {}, salvar: () => {},
  agoraMs: () => Date.parse(iso),
});
const NOITE = CONFIG.rodadas.find(r => r.primeira), MEIO_DIA = CONFIG.rodadas.find(r => r.hhmm === '12:00');

/* quinta 19:58: o Follow sai no geral e nos grupos, com o texto da tela */
{
  const r = await rodar('2026-10-29T22:58:00Z', NOITE);
  ok(r.completa, 'a rodada de quinta completa');
  const esperado = [['Multimídia · Geral', msgEscala(S, SAB, { link })],
    ...gruposDoDia(S, SAB).filter(x => x.funcoes.length).map(x => [x.grupo.nome, msgEscala(S, SAB, { link, grupo: x.grupo })])];
  ok(saiu.length === esperado.length, 'uma mensagem por linha com gente', `${saiu.length} x ${esperado.length}`);
  for (const [i, [grupo, texto]] of esperado.entries()) {
    ok(saiu[i]?.grupo === grupo && saiu[i]?.texto === texto, `${grupo}: a mensagem exata do "Mandar nos grupos"`, saiu[i]?.grupo);
    ok(!saiu[i]?.mentions?.length, `${grupo}: a escala sai sem menção`);
  }
}

/* sexta 12:00: a cobrança do Follow, com @ de quem está no grupo */
{
  const antes = saiu.length;
  await rodar('2026-10-30T15:00:00Z', MEIO_DIA);
  ok(saiu.length === antes + 1, 'sexta 12:00: uma mensagem, a cobrança', String(saiu.length - antes));
  const c = saiu[saiu.length - 1];
  const rotulo = { vanalima: '@123456789012345', vbrunoreis: '@5521977776666', vcarladias: 'Carla Dias', vdavimelo: 'Davi Melo' };
  ok(c.grupo === 'Multimídia · Geral', 'no grupo geral');
  ok(c.texto === msgConfirmar(S, SAB, link, vid => rotulo[vid]), 'a frase do botão, com @ de quem está no grupo e nome de quem não está', `\n${c.texto}`);
  ok(JSON.stringify(c.mentions) === JSON.stringify([LID_ANA, '5521977776666@s.whatsapp.net']), 'as menções no endereço que o grupo usa', JSON.stringify(c.mentions));
  let devolta = c.texto;
  devolta = devolta.replace('@123456789012345', 'Ana Lima').replace('@5521977776666', 'Bruno Reis');
  ok(devolta === msgConfirmar(S, SAB, link), 'trocando cada @ pelo nome, é a frase exata do botão');
}

/* sábado 12:00: Follow e domingo numa mensagem só; nenhum telefone cru em nada que saiu */
{
  await rodar('2026-10-30T22:58:00Z', NOITE); /* sexta 19:58: o domingo nos grupos */
  const antes = saiu.length;
  await rodar('2026-10-31T15:00:00Z', MEIO_DIA);
  const c = saiu[saiu.length - 1];
  ok(saiu.length === antes + 1 && c.texto.includes('(31/10)') && c.texto.includes('(01/11)'), 'sábado 12:00: as duas cobranças numa mensagem', `\n${c.texto}`);
  ok(!c.texto.includes('Carla Dias') || c.texto.indexOf('Carla Dias') < c.texto.indexOf('(01/11)'), 'a Carla, que confirmou o domingo, só aparece no sábado');
  ok(saiu.every(m => !/@55\d{10,11}\b/.test(m.texto.split('@5521977776666').join(''))), 'nenhum telefone cru (fora o do grupo antigo, que é o próprio endereço)');
}

/* O BOTÃO DO SISTEMA (115): o relato do robô passa inteiro pela rota e vira
   o que a tela mostra. Um pedido da Mídia para um domingo novo, com a mesma
   resposta da rota; o relato atravessa lerCorpoDoRobo (o que a rota aceita)
   sem perder nada, e a tela lê grupo por grupo */
{
  const DOM2 = '2026-11-08';
  garantirDia(S, DOM2).slots['PROJEÇÃO'] = { vid: 'vanalima', status: 'confirmado', fixo: false, primeiraVez: false };
  const antes = saiu.length;
  const est2 = { inicio: '2026-10-26T18:00:00.000Z', envios: {}, cobrancas: {}, rodadas: {}, equipes: {}, pedidos: {}, relatos: [] };
  const iso = '2026-11-03T21:00:00Z';
  const relato = await Pedidos.atenderPedido({
    pedido: { id: '0b8f6c1e-1d2a-4c3b-9e4f-5a6b7c8d9e0f', equipe: 'midia', data: DOM2 },
    estado: est2, cfg: CONFIG_TODA, wa, lerDia: async (slug, d) => rota(d), avisar: () => {}, log: () => {},
    pausado: () => false, pausar: () => {}, espera: async () => {}, salvar: () => {},
    agora: R.agoraSP(new Date(iso)), agoraMs: () => Date.parse(iso),
  });
  const novos = saiu.slice(antes);
  ok(relato.status === 'enviado' && novos.length >= 2 && novos[0].grupo === 'Multimídia · Geral' && novos[0].texto === msgEscala(S, DOM2, { link }),
    'pedido do botão: a escala do domingo sai com o texto exato do "Mandar nos grupos"', `${relato.status} ${novos.length}`);
  ok(!novos.some(m => m.texto.includes('falta confirmar')), 'e sem cobrança');
  const corpo = lerCorpoDoRobo(Pedidos.corpoDaPassada({ conectado: true, pausado: false, versao: CONFIG_TODA.versao, cfg: CONFIG_TODA, relatos: [relato] }));
  ok(!!corpo && corpo.relatos.length === 1, 'a rota aceita a passada do robô', JSON.stringify(corpo?.relatos?.length));
  ok(JSON.stringify(corpo?.relatos[0].resultado) === JSON.stringify(relato.resultado), 'o relato atravessa a rota sem perder nada', JSON.stringify(relato.resultado));
  ok(JSON.stringify(limparResultado(relato.resultado)) === JSON.stringify(relato.resultado), 'cada situação do robô é uma que o sistema conhece');
  const tela = leituraDoPedido({ id: relato.id, status: relato.status, criado_em: '2026-11-03T20:59:00Z', atualizado_em: iso, pedido_por: 'Arthur', resultado: relato.resultado }, Date.parse(iso));
  ok(tela.titulo === relato.resultado.resumo.replace(/\.$/, '') && tela.grupos.length === relato.resultado.grupos.length && tela.grupos.every(g => g.texto === 'mandada agora'),
    'a tela mostra o resumo e cada grupo "mandada agora"', JSON.stringify(tela));
  /* as cinco situações do robô são as cinco da tela */
  for (const sit of ['postado', 'ja_estava', 'incerto', 'pulado', 'erro']) {
    ok(limparResultado({ resumo: 'x', grupos: [{ nome: 'G', situacao: sit }], avisos: [] }).grupos.length === 1, `a situação "${sit}" do robô passa pela rota`);
  }
}

console.log(`robô do WhatsApp de ponta a ponta: ${feitas - falhas}/${feitas}`);
if (falhas) process.exit(1);
