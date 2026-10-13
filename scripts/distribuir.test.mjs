/* =============================================================================
   A LIDERANÇA DISTRIBUI OS POSTOS · 13/10/2026 · roda com `npm test`

   O pedido do Connect: "alguns setores ficam sem voluntário ou entendemos que
   tal posição necessita de outra pessoa, e não a que se inscreveu". O que
   este arquivo exige do modo `config.distribuir` (lib/engine.ts, lib/mover.ts):

     1. desligado, nada muda: `aberto` não faz efeito e ninguém vira 'livre';
     2. ligado, o sorteio de sempre roda primeiro (só quem marcou) e o posto
        aberto que sobrar vazio é completado com quem estiver livre;
     3. quem marcou só perde o posto que marcou quando isso preenche mais uma
        vaga (quem entra sem tirar ninguém vem primeiro); no mês, o teto de
        quem é o único que marcou não é gasto num vazio que outra pessoa
        preencheria;
     4. as regras do prédio valem para quem não marcou: sexo do posto, não
        posso, teto do mês, dois postos ao mesmo tempo, "aprendendo";
     5. posto fechado: só quem a liderança marcou (conferido), nunca é
        completado com qualquer um, e o reparo pode liberar a pessoa marcada
        de um posto aberto para ele;
     6. a lista do líder mostra o time inteiro (quem marcou na frente), e
        mudar de posto não pergunta mais se a pessoa "faz" o posto;
     7. Time e Painel contam pela regra do ministério: posto aberto não é
        "ninguém sabe fazer", declaração não é "a escala depende disto".
   ============================================================================= */
import { strict as assert } from 'node:assert';
import {
  candidatos, completarDia, declaracoesSuspeitas, ehCuringa, estadoVazio, garantirDia, gerarDia, gerarMes,
  nivelNoSorteio, pendenciasDeSexo, postoFechado, postosSemQuemPossa, quemPodeCobrir, saudeDoTime,
  sugerirPlantao, filaDeConferencia,
} from '@/lib/engine';
import { comoMover } from '@/lib/mover';

let feitas = 0;
const caso = (nome, fn) => {
  try { fn(); feitas++; }
  catch (e) { console.error(`FALHOU: ${nome}\n  ${e.message}`); process.exit(1); }
};

const DOM = '2030-03-10';   // domingo
const F = (nome, ordem, extra = {}) => ({ id: 'f' + ordem, nome, ordem, simultanea: true, ativa: true, tipos: ['domingo', 'follow'], ...extra });
/* quem se cadastrou sozinho: o que marcou, sem conferência (como o Connect,
   sem níveis: tudo nasce "reserva" e "a conferir") */
const P = (id, nome, marcou = [], extra = {}) => ({
  id, nome, tel: '21999990000', ativo: true, limiteMes: 4, token: 'tok' + id, sexo: 'F',
  funcoes: Object.fromEntries(marcou.map(f => [f, 'reserva'])),
  confirmadas: Object.fromEntries(marcou.map(f => [f, false])),
  indisponivel: [], disponivel: [], conferido: false, ...extra,
});
/* quem a liderança marcou (aba Time): conferido */
const marcado = (v, funcao, nivel = 'titular') => { v.funcoes[funcao] = nivel; v.confirmadas[funcao] = true; return v; };

function connect({ distribuir = true, fechados } = {}) {
  const S = estadoVazio();
  S.temAcesso = true;
  S.funcoes = [
    F('LÍDER 1', 1, { relata: true }),
    F('ESTACIONAMENTO 1', 2, { exigeSexo: 'M' }),
    F('RECEPÇÃO 1', 3),
    F('SETOR A', 4),
    F('SETOR B', 5),
  ];
  S.voluntarios = [
    P('ana', 'Ana', ['RECEPÇÃO 1']),
    P('bia', 'Bia', ['RECEPÇÃO 1', 'LÍDER 1']),           // marcou LÍDER sozinha
    P('caio', 'Caio', ['ESTACIONAMENTO 1'], { sexo: 'M' }),
    P('davi', 'Davi', [], { sexo: 'M' }),                  // não marcou nada
    P('eva', 'Eva', []),
  ];
  marcado(S.voluntarios.find(v => v.id === 'eva'), 'LÍDER 1');   // a liderança marcou a Eva
  S.config.limitePadrao = 4;
  if (distribuir) S.config.distribuir = true;
  if (fechados) S.config.postosFechados = fechados;
  garantirDia(S, DOM);
  return S;
}
const ids = (xs) => xs.map(c => c.id);
const quem = (S, d, f) => S.escalas[d]?.slots?.[f]?.vid ?? null;

/* ------------------------------------------------------------ 1 · desligado */
caso('desligado: `aberto` não faz efeito, ninguém vira livre', () => {
  const S = connect({ distribuir: false });
  const c = candidatos(S, 'SETOR A', DOM, { aberto: true });
  assert.deepEqual(c, []);
  assert.equal(nivelNoSorteio(S, S.voluntarios[3], 'SETOR A', true), undefined);
  assert.equal(postoFechado({ ...S, config: { ...S.config, postosFechados: ['f1'] } }, 'LÍDER 1'), false,
    'fechado só existe com o modo ligado');
});
caso('desligado: o sorteio deixa vazio o setor que ninguém marcou (o defeito de hoje)', () => {
  const S = connect({ distribuir: false });
  gerarDia(S, DOM);
  assert.equal(quem(S, DOM, 'SETOR A'), null);
  assert.equal(quem(S, DOM, 'SETOR B'), null);
});

/* ------------------------------------------------- 2 · ligado: as passadas */
caso('ligado: setor que ninguém marcou é completado com quem está livre', () => {
  const S = connect();
  gerarDia(S, DOM);
  assert.ok(quem(S, DOM, 'SETOR A'), 'SETOR A preenchido');
  assert.ok(quem(S, DOM, 'SETOR B'), 'SETOR B preenchido');
  const todos = Object.values(S.escalas[DOM].slots).map(s => s.vid);
  assert.equal(new Set(todos).size, todos.length, 'ninguém em dois postos ao mesmo tempo');
});
caso('ligado: quem marcou o posto fica com ele (Ana e Bia na RECEPÇÃO, Caio no estacionamento)', () => {
  const S = connect();
  gerarDia(S, DOM);
  assert.ok(['ana', 'bia'].includes(quem(S, DOM, 'RECEPÇÃO 1')));
  assert.equal(quem(S, DOM, 'ESTACIONAMENTO 1'), 'caio');
});
caso('a primeira passada não rouba: o posto que alguém marcou não perde essa pessoa para o vazio', () => {
  /* P1 ninguém marcou; P2 só o Aarão marcou. Numa passada só com o time
     inteiro, P1 vem antes (empate de tamanho, ordem do posto) e leva o
     Aarão, que tem a menor carga; P2 ficaria com quem não marcou. */
  const S = estadoVazio();
  S.funcoes = [F('P1', 1), F('P2', 2)];
  S.voluntarios = [P('x', 'Aarão', ['P2']), P('y', 'Zuleica', [])];
  S.config.distribuir = true;
  garantirDia(S, DOM);
  gerarDia(S, DOM);
  assert.equal(quem(S, DOM, 'P2'), 'x');
  assert.equal(quem(S, DOM, 'P1'), 'y');
});

caso('a segunda passada põe quem entra direto antes de tirar quem marcou do lugar', () => {
  /* achado da auditoria de 13/10: RECEPÇÃO só a Ana marcou, SETOR A ninguém,
     o Bruno faz EDIÇÃO depois do culto e está livre durante. O reparo tirava a
     Ana da RECEPÇÃO (primeira no nome) e punha o Bruno lá; com o Bruno chamado
     "Abel", a Ana ficava. A ordem alfabética decidia quem perdia o posto. */
  for (const nome of ['Bruno', 'Abel']) {
    const S = estadoVazio();
    S.funcoes = [F('RECEPÇÃO', 1), F('SETOR A', 2), F('EDIÇÃO', 3, { simultanea: false })];
    S.voluntarios = [P('ana', 'Ana', ['RECEPÇÃO']), P('bruno', nome, ['EDIÇÃO'])];
    S.config.distribuir = true;
    garantirDia(S, DOM);
    gerarDia(S, DOM);
    assert.equal(quem(S, DOM, 'RECEPÇÃO'), 'ana', nome);
    assert.equal(quem(S, DOM, 'SETOR A'), 'bruno', nome);
    const M = estadoVazio();
    M.funcoes = S.funcoes; M.voluntarios = S.voluntarios; M.config.distribuir = true;
    gerarMes(M, 2030, 3, DOM);
    assert.equal(quem(M, DOM, 'RECEPÇÃO'), 'ana', 'no mês também: ' + nome);
  }
});
caso('quem marcou só sai do posto que marcou quando isso preenche mais uma vaga', () => {
  /* X o Caio marcou; Y é de homens e ninguém marcou; o Caio é o único homem
     e a Wanda está livre. Sem mexer, Y fica vazio. Mexendo, os dois postos
     ficam cheios: a regra é preencher, e o que a pessoa marcou é preferência. */
  const S = estadoVazio();
  S.funcoes = [F('X', 1), F('Y', 2, { exigeSexo: 'M' })];
  S.voluntarios = [P('c', 'Caio', ['X'], { sexo: 'M' }), P('w', 'Wanda', [])];
  S.config.distribuir = true;
  garantirDia(S, DOM);
  gerarDia(S, DOM);
  assert.equal(quem(S, DOM, 'Y'), 'c');
  assert.equal(quem(S, DOM, 'X'), 'w');
});

/* ---------------------------------------------- 3 · o mês, antes do vazio */
caso('no mês, o teto de quem é o único que marcou não é gasto num vazio de antes', () => {
  /* sábado 09 só tem B (ninguém marcou); domingo 10 tem A, que só o Aarão
     marcou, com teto 1. Completando dia a dia, o sábado leva o Aarão para B
     (primeiro no nome, todos com carga zero) e o domingo perde quem marcou A. */
  const monta = () => {
    const S = estadoVazio();
    S.funcoes = [F('A', 1, { tipos: ['domingo'] }), F('B', 2, { tipos: ['follow'] })];
    S.voluntarios = [P('x', 'Aarão', ['A'], { limiteMes: 1 }), P('y', 'Bruna', []), P('z', 'Clara', [])];
    S.config.distribuir = true;
    S.config.limitePadrao = 4;
    return S;
  };
  /* o controle: dia a dia, o defeito aparece (prova que o caso discrimina) */
  const C = monta();
  for (const d of ['2030-03-09', '2030-03-10']) { garantirDia(C, d); gerarDia(C, d); }
  assert.equal(quem(C, '2030-03-09', 'B'), 'x', 'controle: dia a dia, o sábado gasta o Aarão');
  assert.notEqual(quem(C, '2030-03-10', 'A'), 'x', 'controle: e o domingo perde quem marcou A');
  /* o mês: primeiro todo mundo que marcou, depois o vazio */
  const S = monta();
  gerarMes(S, 2030, 3, '2030-03-09');
  assert.equal(quem(S, '2030-03-10', 'A'), 'x', 'o Aarão fica no A do domingo');
  assert.notEqual(quem(S, '2030-03-09', 'B'), 'x');
  assert.ok(quem(S, '2030-03-09', 'B'), 'e o B do sábado é completado com outra pessoa');
});

/* --------------------------------------------- 4 · as regras do prédio */
caso('posto de homens não recebe mulher nem quem não informou o sexo', () => {
  const S = connect();
  S.voluntarios.find(v => v.id === 'caio').ativo = false;     // o único que marcou saiu
  S.voluntarios.push(P('fil', 'Fil', [], { sexo: undefined }));
  gerarDia(S, DOM);
  assert.equal(quem(S, DOM, 'ESTACIONAMENTO 1'), 'davi', 'o único homem livre');
  const lista = ids(candidatos(S, 'ESTACIONAMENTO 1', DOM, { aberto: true, excluirOcupados: false }));
  assert.ok(!lista.includes('ana') && !lista.includes('fil'), JSON.stringify(lista));
});
caso('não posso, teto do mês e "aprendendo" valem para quem não marcou', () => {
  const S = connect();
  const davi = S.voluntarios.find(v => v.id === 'davi');
  davi.indisponivel = [DOM];
  const eva = S.voluntarios.find(v => v.id === 'eva');
  eva.limiteMes = 0;
  const ana = S.voluntarios.find(v => v.id === 'ana');
  ana.funcoes['SETOR A'] = 'treino'; ana.confirmadas['SETOR A'] = true;
  const lista = ids(candidatos(S, 'SETOR A', DOM, { aberto: true }));
  assert.ok(!lista.includes('davi'), 'avisou que não pode');
  assert.ok(!lista.includes('eva'), 'teto zero');
  assert.ok(!lista.includes('ana'), 'aprendendo em SETOR A fica fora do sorteio de SETOR A');
  assert.ok(lista.includes('bia'));
});
caso('posto com alguém de fora da lista e vaga confirmada não são mexidos', () => {
  const S = connect();
  const dia = S.escalas[DOM];
  dia.convidados = { 'SETOR A': 'Guest' };
  dia.slots['SETOR B'] = { vid: 'ana', status: 'confirmado', fixo: false };
  gerarDia(S, DOM);
  assert.equal(quem(S, DOM, 'SETOR A'), null, 'o convidado segue no posto');
  assert.equal(quem(S, DOM, 'SETOR B'), 'ana', 'quem confirmou continua');
});

/* ------------------------------------------------------- 5 · posto fechado */
caso('fechado: só quem a liderança marcou entra; quem marcou sozinha, não', () => {
  const S = connect({ fechados: ['f1'] });
  assert.equal(postoFechado(S, 'LÍDER 1'), true, 'pelo id');
  assert.deepEqual(ids(candidatos(S, 'LÍDER 1', DOM)), ['eva']);
  const S2 = connect({ fechados: ['LÍDER 1'] });
  assert.equal(postoFechado(S2, 'LÍDER 1'), true, 'pelo nome (linha antiga)');
});
caso('fechado e sem ninguém marcado livre: fica vazio, nunca é completado', () => {
  const S = connect({ fechados: ['f1'] });
  S.voluntarios.find(v => v.id === 'eva').indisponivel = [DOM];
  gerarDia(S, DOM);
  assert.equal(quem(S, DOM, 'LÍDER 1'), null);
  assert.equal(completarDia(S, DOM), 0);
  assert.equal(quem(S, DOM, 'LÍDER 1'), null);
});
caso('aberto (sem fechar), o LÍDER é completado: é por isso que ligar já fecha os postos de relato', () => {
  const S = connect({ fechados: [] });
  S.voluntarios.find(v => v.id === 'eva').indisponivel = [DOM];
  S.voluntarios.find(v => v.id === 'bia').indisponivel = [DOM];
  gerarDia(S, DOM);
  assert.ok(quem(S, DOM, 'LÍDER 1'));
});
caso('o reparo da segunda passada libera a pessoa marcada de um posto aberto para o fechado', () => {
  /* S (aberto) vem antes na ordem e a Eva marcou os dois: a primeira passada
     a põe em S, e L (fechado, só ela) fica vazio. Com o time inteiro, o
     reparo leva a Eva para L e completa S com quem está livre. */
  const S = estadoVazio();
  S.funcoes = [F('S', 1), F('L', 2)];
  S.voluntarios = [marcado(marcado(P('e', 'Eva'), 'S'), 'L'), P('o', 'Otto', [])];
  S.config.distribuir = true;
  S.config.postosFechados = ['f2'];
  garantirDia(S, DOM);
  gerarDia(S, DOM);
  assert.equal(quem(S, DOM, 'L'), 'e');
  assert.equal(quem(S, DOM, 'S'), 'o');
});

/* ---------------------------------------------- 6 · a lista e o mover */
caso('a lista do líder tem o time inteiro, quem marcou na frente mesmo com carga maior', () => {
  const S = connect();
  /* a Ana marcou RECEPÇÃO e já serviu duas vezes; o Davi nunca */
  for (const d of ['2030-02-24', '2030-03-03']) {
    garantirDia(S, d).slots['RECEPÇÃO 1'] = { vid: 'ana', status: 'confirmado', fixo: false };
  }
  const c = candidatos(S, 'RECEPÇÃO 1', DOM, { excluirOcupados: false, ignorarLimite: true, incluirTreino: true, incluirQuemNaoPode: true, aberto: true });
  const pos = (id) => c.findIndex(x => x.id === id);
  assert.ok(pos('ana') < pos('davi'), JSON.stringify(c.map(x => [x.id, x.nivel, x.carga])));
  assert.equal(c.find(x => x.id === 'davi').nivel, 'livre');
  assert.equal(c.find(x => x.id === 'ana').nivel, 'reserva');
  assert.equal(c.length, 5, 'as cinco pessoas: RECEPÇÃO não exige sexo');
});
caso('mudar de posto: quem não marcou o posto de origem pode trocar', () => {
  const S = connect();
  const dia = S.escalas[DOM];
  dia.cultoId = 'c1';
  dia.slots['RECEPÇÃO 1'] = { vid: 'ana', status: 'pendente', fixo: false };
  dia.slots['SETOR A'] = { vid: 'eva', status: 'pendente', fixo: false };
  /* a Ana vai para SETOR A; a Eva (não marcou RECEPÇÃO) vai para a RECEPÇÃO */
  assert.deepEqual(comoMover(S, DOM, 'SETOR A', 'ana'), { de: 'RECEPÇÃO 1', ocupante: 'eva', podeTrocar: true, semTroca: '' });
  S.config.distribuir = false;
  assert.equal(comoMover(S, DOM, 'SETOR A', 'ana').podeTrocar, false, 'desligado continua perguntando');
});

/* ------------------------------------------------ 7 · Time, Painel, plantão */
caso('Time: posto aberto conta o time que pode entrar; fechado, quem a liderança marcou', () => {
  const S = connect({ fechados: ['f1'] });
  const s = Object.fromEntries(saudeDoTime(S).funcoes.map(f => [f.nome, f]));
  assert.equal(s['SETOR A'].aptos, 5);
  assert.equal(s['SETOR A'].texto, 'ok');
  assert.equal(s['ESTACIONAMENTO 1'].aptos, 2, 'os dois homens');
  assert.equal(s['ESTACIONAMENTO 1'].texto, 'sem folga');
  assert.equal(s['LÍDER 1'].aptos, 1, 'só a Eva');
  assert.equal(s['LÍDER 1'].texto, 'uma pessoa só');
  S.voluntarios.find(v => v.id === 'eva').ativo = false;
  const l = saudeDoTime(S).funcoes.find(f => f.nome === 'LÍDER 1');
  assert.equal(l.texto, 'ninguém marcado pela liderança');
});
caso('Painel: o setor que ninguém marcou não é "função sem ninguém"', () => {
  const S = connect({ fechados: ['f1'] });
  assert.deepEqual(postosSemQuemPossa(S), []);
  S.voluntarios.find(v => v.id === 'eva').ativo = false;
  assert.deepEqual(postosSemQuemPossa(S), ['LÍDER 1']);
  S.config.distribuir = false;
  assert.deepEqual(postosSemQuemPossa(S), ['SETOR A', 'SETOR B'], 'desligado: a conta de sempre');
});
caso('Conferir: nenhuma declaração "segura a escala"; a fila de conferência continua', () => {
  const S = connect({ fechados: ['f1'] });
  assert.deepEqual(declaracoesSuspeitas(S), []);
  assert.ok(filaDeConferencia(S).some(x => x.funcao === 'LÍDER 1' && x.pendentes.some(p => p.id === 'bia')));
});
caso('sexo: com posto aberto que exige, quem não informou passa a contar', () => {
  const S = connect();
  S.voluntarios.push(P('fil', 'Fil', [], { sexo: undefined }));
  assert.ok(pendenciasDeSexo(S).semSexo.some(p => p.id === 'fil'));
  S.config.distribuir = false;
  assert.ok(!pendenciasDeSexo(S).semSexo.some(p => p.id === 'fil'), 'desligado: só quem marcou o posto que exige');
});
caso('plantão: quem não marcou nada serve de curinga no modo da liderança', () => {
  const S = connect();
  const davi = S.voluntarios.find(v => v.id === 'davi');
  assert.equal(ehCuringa(davi, S), true);
  assert.equal(ehCuringa(davi), false, 'sem o estado, a regra de sempre');
  gerarDia(S, DOM);
  const livres = S.voluntarios.filter(v => !Object.values(S.escalas[DOM].slots).some(s => s.vid === v.id));
  const p = sugerirPlantao(S, DOM, 1);
  assert.equal(p.length, Math.min(1, livres.length));
});
caso('quem pode cobrir: posto aberto inclui quem não marcou; fechado, não', () => {
  const S = connect({ fechados: ['f1'] });
  assert.ok(quemPodeCobrir(S, DOM, 'SETOR A', 10).some(c => c.id === 'davi'));
  assert.ok(!quemPodeCobrir(S, DOM, 'LÍDER 1', 10).some(c => c.id === 'bia'));
});

console.log(`distribuir: ${feitas} casos ok`);
