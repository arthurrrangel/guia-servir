/* Regressão pura dos cabeçalhos de cobrança, com nomes e datas fictícios.
 * Uso: node scripts/eventos-cobrancas.test.mjs [caminho/para/lib/engine.ts]
 * O mesmo teste recebe a cópia anterior para o controle negativo. */
import { pathToFileURL } from 'node:url';

const E = await import(process.argv[2]
  ? pathToFileURL(process.argv[2]).href
  : new URL('../lib/engine.ts', import.meta.url).href);
let feitas = 0, falhas = 0;
const ok = (c, rotulo, detalhe = '') => {
  feitas++;
  if (!c) { falhas++; console.log(`FALHOU ${rotulo}${detalhe ? ': ' + detalhe : ''}`); }
};
const BASE = 'https://guia.invalid';
const LINK = BASE + '/confirmar/demo';
const FIM = 'Se não puder, marca "não posso" que eu chamo outra pessoa, sem problema.';
const casos = [
  { nome: 'domingo', data: '2026-11-01', deQue: 'de domingo', titulo: 'Escala de domingo' },
  { nome: 'Follow', data: '2026-11-14', deQue: 'do Follow de sábado', titulo: 'Escala do Follow, sábado' },
  { nome: 'evento de quarta', data: '2026-11-04', evento: 'Ensaio geral', deQue: 'do Ensaio geral', titulo: 'Escala do Ensaio geral' },
  { nome: 'evento de quinta', data: '2026-11-05', evento: 'GUIA Empreendedor', deQue: 'do GUIA Empreendedor', titulo: 'Escala do GUIA Empreendedor' },
];
for (const c of casos) {
  const S = E.estadoVazio();
  S.config.prazoConfirmacao = 'véspera';
  S.config.saudacao = 'Olá, time';
  S.funcoes = ['PROJEÇÃO', 'EDIÇÃO', 'FOTO'].map((nome, i) => ({
    id: 'f' + i, nome, ordem: i, ativa: true, simultanea: nome !== 'EDIÇÃO', tipos: ['domingo', 'follow'],
  }));
  S.voluntarios = [
    { id: 'v1', nome: 'Pessoa Um', token: 'token-ficticio', ativo: true, funcoes: {}, indisponivel: [] },
    { id: 'v2', nome: 'Pessoa Dois', token: 'outro-token-ficticio', ativo: true, funcoes: {}, indisponivel: [] },
  ];
  const dia = E.garantirDia(S, c.data);
  if (c.evento) dia.evento = c.evento;
  dia.slots = {
    PROJEÇÃO: { vid: 'v1', status: 'pendente', fixo: false },
    EDIÇÃO: { vid: 'v1', status: 'pendente', fixo: false },
    FOTO: { vid: 'v2', status: 'confirmado', fixo: false },
  };
  const antes = JSON.stringify(S);
  const cab = `Pessoa Um: vocês estão na escala ${c.deQue} (${E.fmtDia(c.data)}) e ainda falta confirmar. `;
  const grupo = E.msgConfirmar(S, c.data, LINK);
  const privado = E.msgCobranca(S, 'v1', c.data, BASE);
  ok(E.msgConfirmar(S, c.data) === cab + 'Entrem no link de vocês e toquem em EU VOU. ' + FIM,
    c.nome + ': cobrança sem link preserva texto, nomes e data');
  ok(grupo === cab + `Toquem em EU VOU por aqui:\n${LINK}\n\n${FIM}`,
    c.nome + ': cobrança coletiva mantém a porta comum e não duplica a pessoa');
  ok(privado === `Pessoa Um, você está na escala ${c.deQue} (${E.fmtDia(c.data)}) em PROJEÇÃO e EDIÇÃO. `
    + `Confirma no seu link até ${E.prazoDoDia(S, c.data)}?\n${BASE}/eu/token-ficticio#confirmar`,
    c.nome + ': cobrança individual preserva funções, prazo e link pessoal');
  const cabEscala = E.msgEscala(S, c.data, { agora: new Date('2026-10-25T15:00:00Z') }).split('\n')[1];
  ok(cabEscala === `${c.titulo} (${E.fmtDia(c.data)})`,
    c.nome + ': identificação corresponde à mensagem da escala', cabEscala);
  ok(JSON.stringify(S) === antes, c.nome + ': preparar mensagens não altera o estado');
  dia.slots.PROJEÇÃO.status = 'confirmado';
  dia.slots.EDIÇÃO.status = 'recusado';
  ok(E.msgConfirmar(S, c.data, LINK) === '', c.nome + ': sem pendentes não cria cobrança');
}
console.log(`eventos-cobrancas: ${feitas - falhas}/${feitas}${falhas ? ' FALHOU' : ' ok'}`);
process.exitCode = falhas ? 1 : 0;
