/* O horário do banco precisa valer na ficha de compromisso, como o da tela.
 * Teste puro, com evento/pessoa fictícios, sem banco nem relógio corrente.
 * Uso: node scripts/horario-evento-compromisso.test.mjs [engine-anterior.ts]
 * O argumento opcional permite repetir a prova como controle negativo. */
import { pathToFileURL } from 'node:url';

const E = await import(process.argv[2]
  ? pathToFileURL(process.argv[2]).href
  : new URL('../lib/engine.ts', import.meta.url).href);
let feitas = 0, falhas = 0;
const ok = (c, nome, detalhe = '') => {
  feitas++;
  if (!c) { falhas++; console.log(`FALHOU ${nome}${detalhe ? ': ' + detalhe : ''}`); }
};

const EVENTO = '2026-10-28';
const RESPOSTA = '2026-10-26T21:00:00Z'; // segunda, 18h em São Paulo
function estado(inicio, data = EVENTO) {
  const S = E.estadoVazio();
  S.voluntarios = [{ id: 'v1', nome: 'Pessoa Fictícia', ativo: true, funcoes: {}, indisponivel: [] }];
  const dia = E.garantirDia(S, data);
  dia.evento = 'Ensaio Geral'; dia.inicio = inicio;
  dia.slots.PROJEÇÃO = { vid: 'v1', status: 'recusado', fixo: false, respondidoEm: RESPOSTA };
  return S;
}

for (const [inicio, minutos] of [
  ['19h30', 1170], ['07h30', 450], ['7h', 420],
  ['19:30', 1170], ['19:30:00', 1170], ['19:30:59', 1170],
  ['00:00', 0], ['23:59:59', 1439], [' 07:05:09 ', 425],
]) {
  const obtido = E.minutosDoCulto(estado(inicio), EVENTO);
  ok(obtido === minutos, `${JSON.stringify(inicio)} vira ${minutos} minutos inteiros`, String(obtido));
}

// Ausência e formato ilegível continuam voltando ao tipo do dia.
for (const [data, padrao] of [['2026-11-01', 600], ['2026-11-14', 1140]]) {
  ok(E.minutosDoCulto(E.estadoVazio(), data) === padrao, `${data}: sem dia no estado usa o padrão`);
  for (const inicio of [undefined, null, '', 'manhã', '24:00', '19:60', '19:30:60', '19:30:xx', '19:30 extra']) {
    ok(E.minutosDoCulto(estado(inicio, data), data) === padrao,
      `${data}: ${JSON.stringify(inicio)} mantém o fallback de ${padrao} minutos`);
  }
}

const reais = (Date.parse(EVENTO + 'T19:30:00-03:00') - Date.parse(RESPOSTA)) / 3600000;
ok(reais === 49.5, 'a reprodução tem 49h30 reais entre a resposta e o evento');
for (const inicio of ['19h30', '19:30', '19:30:00']) {
  const S = estado(inicio);
  const sl = S.escalas[EVENTO].slots.PROJEÇÃO;
  const h = E.horasDeAntecedencia(EVENTO, RESPOSTA, E.minutosDoCulto(S, EVENTO));
  ok(h === 50, `${inicio}: a ficha preserva seu arredondamento de 49h30 para 50h`, String(h));
  ok(!E.desmarqueTardio(S, EVENTO, sl), `${inicio}: a recusa não é tardia pela regra de 48h`);
  ok(JSON.stringify(E.fichaDe(S, 'v1')) === JSON.stringify({ confirmou: 0, avisouAntes: 1, tardios: 0, furos: 0 }),
    `${inicio}: a ficha conta como aviso antecipado`);
  ok(E.furosAbertos(S, '2026-10-25').length === 0, `${inicio}: não cria alerta de recusa tardia`);
}

// O contrato continua em minutos: os segundos do início não deslocam a ficha.
const S = estado('19:30:59');
const minutos = E.minutosDoCulto(S, EVENTO);
ok(minutos === 1170 && E.horasDeAntecedencia(EVENTO, RESPOSTA, minutos) === 50,
  'segundos válidos são aceitos sem acrescentar precisão fracionária à ficha');
for (const [resposta, horas, tardio] of [
  ['2026-10-26T23:00:00Z', 48, false], // 47h30 reais: o arredondamento existente permanece
  ['2026-10-26T23:01:00Z', 47, true],
]) {
  const sl = { ...S.escalas[EVENTO].slots.PROJEÇÃO, respondidoEm: resposta };
  ok(E.horasDeAntecedencia(EVENTO, resposta, minutos) === horas
    && E.desmarqueTardio(S, EVENTO, sl) === tardio,
    `a fronteira arredondada da ficha mantém ${horas}h e tardio=${tardio}`);
}
ok(E.horasDeAntecedencia(EVENTO, null, minutos) === null, 'sem resposta não inventa antecedência');
ok(!E.desmarqueTardio(S, EVENTO, { ...S.escalas[EVENTO].slots.PROJEÇÃO, respondidoEm: null }),
  'sem resposta não classifica como tardio');

console.log(`horario-evento-compromisso: ${feitas - falhas}/${feitas}${falhas ? ' FALHOU' : ' ok'}`);
process.exitCode = falhas ? 1 : 0;
