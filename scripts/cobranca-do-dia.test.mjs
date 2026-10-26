/* Preparo das ações de quinta com dados sintéticos, sem executar a rota,
   consultar banco, abrir WhatsApp ou enviar mensagem.
   node --import ./scripts/_ts.mjs scripts/cobranca-do-dia.test.mjs */
import assert from 'node:assert/strict';
import { linhasDaCobranca } from '../lib/cobranca-do-dia.ts';
import { cobrarDoDia } from '../lib/engine.ts';

let casos = 0;
const caso = (nome, fn) => { fn(); casos++; console.log('  ok ' + nome); };
const CONTEXTO = { onde: 'e domingo', dia: '01/11', site: 'https://exemplo.invalid' };
const ANA = { id: 'a', nome: 'Ana Sintética', tel: '(21) 90000-0001', token: 'token-a' };
const BIA = { id: 'b', nome: 'Bia Sintética', tel: '21900000002', token: 'token-b' };
const pendente = (funcao, vid = 'a') => ({ funcao, vid });
const links = texto => (texto.match(/https:\/\/wa\.me\/\S+/g) || []).map(x => new URL(x));
const mensagens = texto => links(texto).map(x => x.searchParams.get('text'));
const corpo = (nome, funcao, token, contexto = CONTEXTO) =>
  `${nome}, você está na escala d${contexto.onde} (${contexto.dia}) em ${funcao}. Confirma? ${contexto.site}/eu/${token}`;

caso('um posto mantém a linha e o link anteriores', () => {
  const msg = corpo(ANA.nome, 'FOTO', ANA.token);
  assert.equal(linhasDaCobranca([pendente('FOTO')], [ANA], CONTEXTO),
    `• ${ANA.nome} — FOTO\n  1 toque: https://wa.me/5521900000001?text=${encodeURIComponent(msg)}`);
});

caso('dois postos pendentes do mesmo vínculo geram uma ação com os dois', () => {
  const texto = linhasDaCobranca([pendente('EDIÇÃO'), pendente('FOTO')], [ANA], CONTEXTO);
  assert.equal(links(texto).length, 1, 'duas pendências da mesma pessoa precisam de uma ação');
  assert.equal(mensagens(texto)[0], corpo(ANA.nome, 'EDIÇÃO e FOTO', ANA.token));
  assert.ok(texto.startsWith(`• ${ANA.nome} — EDIÇÃO e FOTO\n`));
});

caso('homônimos com vínculos diferentes preservam suas duas ações', () => {
  const pessoas = [{ ...ANA, nome: 'Alex Lima' }, { ...BIA, nome: 'Alex Lima' }];
  const texto = linhasDaCobranca([pendente('FOTO'), pendente('SOM', 'b')], pessoas, CONTEXTO);
  assert.equal(links(texto).length, 2);
  assert.deepEqual(links(texto).map(x => x.pathname), ['/5521900000001', '/5521900000002']);
  assert.deepEqual(mensagens(texto), [corpo('Alex Lima', 'FOTO', 'token-a'), corpo('Alex Lima', 'SOM', 'token-b')]);
});

caso('sem telefone há uma referência pessoal reunindo os postos', () => {
  assert.equal(linhasDaCobranca([pendente('FOTO'), pendente('EDIÇÃO')], [{ ...ANA, tel: '' }], CONTEXTO),
    `• ${ANA.nome} — FOTO e EDIÇÃO\n  sem telefone: ${CONTEXTO.site}/eu/${ANA.token}`);
});

caso('telefone internacional e link pessoal mantêm o formato anterior', () => {
  const v = { ...ANA, tel: '+351 912 345 678' };
  const texto = linhasDaCobranca([pendente('FOTO')], [v], CONTEXTO);
  assert.equal(links(texto)[0].pathname, '/351912345678');
  assert.ok(mensagens(texto)[0].endsWith('/eu/token-a'));
});

const D = '2026-11-01';
const estado = (slots, funcoes = ['FOTO', 'EDIÇÃO', 'SOM', 'ILUMINAÇÃO', 'CÂMERA']) => ({
  funcoes: funcoes.map((nome, ordem) => ({ id: 'f' + ordem, nome, ativa: true, simultanea: false, ordem })),
  voluntarios: [ANA, BIA], config: {}, escalas: { [D]: { slots, plantao: [], obs: '' } },
});
const slot = (vid, status) => ({ vid, status, fixo: false });

caso('confirmação mista cobra apenas o posto que ainda está pendente', () => {
  const S = estado({ FOTO: slot('a', 'pendente'), 'EDIÇÃO': slot('a', 'confirmado') });
  const fila = cobrarDoDia(S, D);
  assert.equal(mensagens(linhasDaCobranca(fila.pendentes, S.voluntarios, CONTEXTO))[0], corpo(ANA.nome, 'FOTO', ANA.token));
  assert.equal(S.escalas[D].slots['EDIÇÃO'].status, 'confirmado');
});

caso('recusados, furos e vagas continuam separados da cobrança à pessoa', () => {
  const S = estado({ FOTO: slot('a', 'pendente'), 'EDIÇÃO': slot('a', 'recusado'), SOM: slot('b', 'furou') });
  const fila = cobrarDoDia(S, D);
  const antes = structuredClone(fila);
  const texto = linhasDaCobranca(fila.pendentes, S.voluntarios, CONTEXTO);
  assert.equal(mensagens(texto)[0], corpo(ANA.nome, 'FOTO', ANA.token));
  assert.deepEqual(fila, antes);
  assert.deepEqual(fila.vagou.map(x => [x.funcao, x.status]), [['EDIÇÃO', 'recusado'], ['SOM', 'furou']]);
  assert.deepEqual(fila.vagas, ['ILUMINAÇÃO', 'CÂMERA']);
});

caso('posto ocultado já ocupado continua na ação de quem precisa confirmar', () => {
  const S = estado({ FOTO: slot('a', 'pendente'), 'EDIÇÃO': slot('a', 'pendente') });
  S.funcoes.find(f => f.nome === 'FOTO').ativa = false;
  const fila = cobrarDoDia(S, D);
  const texto = linhasDaCobranca(fila.pendentes, S.voluntarios, CONTEXTO);
  assert.equal(fila.pendentes.length, 2, 'o diagnóstico continua contando postos');
  assert.equal(links(texto).length, 1);
  assert.equal(mensagens(texto)[0], corpo(ANA.nome, 'EDIÇÃO e FOTO', ANA.token));
});

caso('outra data mantém sua própria ação para o mesmo vínculo', () => {
  const sabado = { ...CONTEXTO, onde: 'o Follow de sábado', dia: '07/11' };
  const primeiro = linhasDaCobranca([pendente('FOTO')], [ANA], CONTEXTO);
  const segundo = linhasDaCobranca([pendente('SOM')], [ANA], sabado);
  assert.equal(mensagens(primeiro)[0], corpo(ANA.nome, 'FOTO', ANA.token));
  assert.equal(mensagens(segundo)[0], corpo(ANA.nome, 'SOM', ANA.token, sabado));
});

caso('outro estado de equipe não herda nome, postos ou token anteriores', () => {
  const outra = { ...ANA, nome: 'Lia Outra Área', token: 'token-outra-area' };
  const evento = { ...CONTEXTO, onde: 'o Evento Sintético', dia: '04/11' };
  linhasDaCobranca([pendente('FOTO')], [ANA], CONTEXTO);
  const texto = linhasDaCobranca([pendente('VOCAL')], [outra], evento);
  assert.equal(mensagens(texto)[0], corpo(outra.nome, 'VOCAL', outra.token, evento));
});

caso('sem pendências não há ação e os dados de entrada não são alterados', () => {
  const p = [pendente('FOTO'), pendente('EDIÇÃO')];
  const pessoas = [ANA];
  const antes = structuredClone({ p, pessoas, CONTEXTO });
  linhasDaCobranca(p, pessoas, CONTEXTO);
  assert.equal(linhasDaCobranca([], pessoas, CONTEXTO), '');
  assert.deepEqual({ p, pessoas, CONTEXTO }, antes);
});

console.log(`cobranca-do-dia: ${casos}/${casos} cenários passaram`);
