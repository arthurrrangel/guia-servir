/* Contexto de evento por ministério. Testes puros com dados sintéticos;
   a rota, banco, rede e envio não são executados.
   node --import ./scripts/_ts.mjs scripts/contexto-da-cobranca.test.mjs */
import assert from 'node:assert/strict';
import { contextoDaCobranca } from '../lib/contexto-da-cobranca.ts';
import { linhasDaCobranca } from '../lib/cobranca-do-dia.ts';
import { avisarDiaSemNinguem } from '../lib/engine.ts';

let casos = 0;
const caso = (nome, fn) => { fn(); casos++; console.log('  ok ' + nome); };
const DIA = '2026-10-28'; // quarta: só entra na união por evento de alguma equipe
const dia = evento => ({ evento, slots: {}, plantao: [], obs: '' });
const estados = new Map([
  ['midia', { escalas: { [DIA]: dia('Reunião Mídia') } }],
  ['connect', { escalas: { [DIA]: dia('Encontro Connect') } }],
]);
const contextos = fonte => [...fonte].map(([id, S]) => [id, contextoDaCobranca(S, DIA)]);
const mensagem = (contexto, nome, token) => {
  const texto = linhasDaCobranca([{ funcao: 'SOM', vid: 'a' }],
    [{ id: 'a', nome, tel: '21900000001', token }], {
      onde: contexto.nomeEvento ? `o ${contexto.nomeEvento}` : '',
      dia: '28/10', site: 'https://exemplo.invalid',
    });
  return new URL(texto.match(/https:\/\/wa\.me\/\S+/)[0]).searchParams.get('text');
};

caso('dois eventos na mesma data têm títulos de suas próprias equipes', () => {
  const midia = contextoDaCobranca(estados.get('midia'), DIA);
  const connect = contextoDaCobranca(estados.get('connect'), DIA);
  assert.equal(midia.rotulo, 'Reunião Mídia · 28/10');
  assert.equal(connect.rotulo, 'Encontro Connect · 28/10', 'Connect não pode receber o título do evento da Mídia');
  assert.equal(midia.regular, false);
  assert.equal(connect.regular, false);
});

caso('as cobranças preparadas mantêm o evento e link de cada vínculo', () => {
  const m = mensagem(contextoDaCobranca(estados.get('midia'), DIA), 'Ana Sintética', 'token-midia');
  const c = mensagem(contextoDaCobranca(estados.get('connect'), DIA), 'Bia Sintética', 'token-connect');
  assert.ok(m.includes('na escala do Reunião Mídia (28/10)'));
  assert.ok(c.includes('na escala do Encontro Connect (28/10)'));
  assert.ok(!c.includes('Reunião Mídia'));
  assert.ok(m.endsWith('/eu/token-midia') && c.endsWith('/eu/token-connect'));
});

caso('inverter a ordem dos estados não troca nenhum evento de dono', () => {
  const normal = new Map(contextos(estados));
  const invertida = new Map(contextos(new Map([...estados].reverse())));
  for (const id of estados.keys()) assert.deepEqual(normal.get(id), invertida.get(id));
});

caso('equipe sem evento em dia útil continua silenciosa', () => {
  const c = contextoDaCobranca({ escalas: {} }, DIA);
  assert.equal(c.nomeEvento, undefined);
  assert.equal(c.regular, false);
  assert.equal(avisarDiaSemNinguem(c.regular, true), false);
});

caso('equipe sem evento não herda o contexto de outro estado já consultado', () => {
  contextoDaCobranca(estados.get('midia'), DIA);
  const c = contextoDaCobranca({ escalas: {} }, DIA);
  assert.equal(c.nomeEvento, undefined);
  assert.ok(!c.rotulo.includes('Reunião Mídia'));
});

caso('domingo sem evento preserva o rótulo e o alerta de culto regular vazio', () => {
  const c = contextoDaCobranca({ escalas: {} }, '2026-11-01');
  assert.deepEqual(c, { nomeEvento: undefined, rotulo: 'domingo 01/11', regular: true });
  assert.equal(avisarDiaSemNinguem(c.regular, true), true);
});

caso('Follow sem evento preserva o rótulo e o alerta para equipe com postos', () => {
  const c = contextoDaCobranca({ escalas: {} }, '2026-10-31');
  assert.deepEqual(c, { nomeEvento: undefined, rotulo: 'Follow sáb 31/10', regular: true });
  assert.equal(avisarDiaSemNinguem(c.regular, true), true);
  assert.equal(avisarDiaSemNinguem(c.regular, false), false);
});

caso('primeiro sábado segue o calendário atual sem criar exceção nova', () => {
  const c = contextoDaCobranca({ escalas: {} }, '2026-11-07');
  assert.equal(c.rotulo, 'Follow sáb 07/11');
  assert.equal(c.regular, true);
});

caso('evento próprio na quinta não vira culto regular', () => {
  const c = contextoDaCobranca({ escalas: { '2026-10-29': dia('Evento Sintético') } }, '2026-10-29');
  assert.deepEqual(c, { nomeEvento: 'Evento Sintético', rotulo: 'Evento Sintético · 29/10', regular: false });
});

caso('preparar contexto não modifica os estados recebidos', () => {
  const antes = structuredClone(estados);
  contextos(estados);
  assert.deepEqual(estados, antes);
});

console.log(`contexto-da-cobranca: ${casos}/${casos} cenários passaram`);
