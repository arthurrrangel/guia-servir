/* =============================================================================
   CHAMAR QUEM PODE COBRIR, NO PURO — 106, 02/10/2026

   O que este arquivo exige:
     1. a vaga aberta é a mesma do banco (`vaga_aberta`): sem ninguém, ou com
        quem disse que não pode ou furou; e só posto que vale no dia;
     2. os chamados de uma vaga: o mais recente de cada pessoa, quem aceitou e
        quem espera primeiro;
     3. os três primeiros vêm marcados, e nunca quem já disse que não pode
        cobrir esta vaga nem quem já está esperando;
     4. cada recuso do banco vira uma frase que diz o que fazer;
     5. o recado do WhatsApp leva o link pessoal aberto nos convites, e o
        aviso no celular abre no mesmo lugar;
     6. o número do WhatsApp: com DDD vira 55 + número; curto demais, nada.

   Roda com `npm test`. */
import { strict as assert } from 'node:assert';
import {
  vagaAberta, vagasAbertas, chamadosDaVaga, marcadosDeInicio, detalheDoCandidato, erroAoChamar,
  motivoDeNaoChamar, resultadoDeChamar, erroAoResponderChamada, separarChamadas, noticiaDaChamada,
  recadoDaChamada, linkDoWhats,
} from '@/lib/chamadas';
import { mensagemDaChamada } from '@/lib/aviso';
import { estadoVazio, garantirDia } from '@/lib/engine';

let feitas = 0;
const caso = (nome, fn) => { fn(); feitas++; };

/* 1 · a vaga */
caso('vaga aberta: sem ninguém, quem não pode ou quem furou', () => {
  const S = estadoVazio();
  S.funcoes = [
    { id: 'f1', nome: 'VOZ', ordem: 1, simultanea: true, ativa: true, tipos: ['domingo', 'follow'] },
    { id: 'f2', nome: 'BAIXO', ordem: 2, simultanea: true, ativa: true, tipos: ['domingo', 'follow'] },
    { id: 'f3', nome: 'TECLADO', ordem: 3, simultanea: true, ativa: true, tipos: ['follow'] },
    { id: 'f4', nome: 'GUITARRA', ordem: 4, simultanea: true, ativa: true, tipos: ['domingo'] },
    { id: 'f5', nome: 'PARADO', ordem: 5, simultanea: true, ativa: false, tipos: ['domingo'] },
  ];
  const d = garantirDia(S, '2026-10-04');                 // domingo
  d.slots['VOZ'] = { vid: 'a', status: 'recusado', fixo: false };
  d.slots['BAIXO'] = { vid: 'b', status: 'confirmado', fixo: false };
  d.slots['GUITARRA'] = { vid: 'c', status: 'furou', fixo: false };
  assert.equal(vagaAberta(S, '2026-10-04', 'VOZ'), true);
  assert.equal(vagaAberta(S, '2026-10-04', 'BAIXO'), false);
  assert.deepEqual(vagasAbertas(S, '2026-10-04').map(f => f.nome), ['VOZ', 'GUITARRA'],
    'TECLADO só existe no Follow e PARADO está desativado');
  d.slots['BAIXO'] = { vid: 'b', status: 'pendente', fixo: false };
  assert.equal(vagaAberta(S, '2026-10-04', 'BAIXO'), false, 'quem ainda não respondeu está na vaga');
});

/* 2 · os chamados de uma vaga */
const ch = (id, vid, nome, status, criado = '2026-10-02T10:00:00Z', vaga = ['c1', 'f1']) =>
  ({ id, culto_id: vaga[0], funcao_id: vaga[1], voluntario_id: vid, nome, status, criado_em: criado, respondido_em: null });
caso('o mais recente de cada pessoa, quem aceitou e quem espera primeiro', () => {
  const lista = [
    ch('1', 'bia', 'Bia Lima', 'cancelada', '2026-10-01T10:00:00Z'),
    ch('2', 'bia', 'Bia Lima', 'aberta', '2026-10-02T10:00:00Z'),
    ch('3', 'caio', 'Caio Reis', 'recusada'),
    ch('4', 'ana', 'Ana Souza', 'aceita'),
    ch('5', 'duda', 'Duda Melo', 'aberta', '2026-10-02T10:00:00Z', ['c1', 'f2']),
  ];
  assert.deepEqual(chamadosDaVaga(lista, 'c1', 'f1').map(c => `${c.voluntario_id}:${c.status}`),
    ['ana:aceita', 'bia:aberta', 'caio:recusada']);
});

/* 3 · quem vem marcado */
const cand = (id, extra = {}) => ({ voluntario_id: id, nome: id, nivel: 'titular', disse_que_pode: false, no_mes: 0, limite: 2, chamada: null, ...extra });
caso('os três primeiros ainda não chamados; nunca quem já recusou ou espera', () => {
  const lista = [cand('a', { chamada: 'aberta' }), cand('b', { chamada: 'recusada' }), cand('c'),
    cand('d', { chamada: 'cancelada' }), cand('e', { chamada: 'expirada' }), cand('f')];
  assert.deepEqual(marcadosDeInicio(lista), ['c', 'd', 'e']);
  assert.deepEqual(marcadosDeInicio([]), []);
  assert.equal(detalheDoCandidato(cand('x', { disse_que_pode: true, no_mes: 1, nivel: 'reserva' })),
    'disse que pode · 1 escala no mês (limite 2) · ajuda quando falta');
  assert.equal(detalheDoCandidato(cand('x', { chamada: 'recusada', no_mes: 3 })),
    'não respondeu o dia · 3 escalas no mês (limite 2) · disse que não pode cobrir');
});

/* 4 · as frases */
caso('cada recuso do banco diz o que fazer', () => {
  for (const erro of ['SEM_PERMISSAO', 'CULTO_INEXISTENTE', 'JA_PASSOU', 'POSTO_NAO_VALE', 'VAGA_OCUPADA', 'NINGUEM', 'MUITOS', 'MUITOS_HOJE', 'OUTRO']) {
    const t = erroAoChamar({ ok: false, erro });
    assert.ok(t && t.endsWith('.') && !/undefined/.test(t), `${erro}: ${t}`);
  }
  assert.equal(erroAoChamar({ ok: true }), '');
  assert.equal(motivoDeNaoChamar('INDISPONIVEL'), 'avisou que não pode nesse dia');
  assert.equal(resultadoDeChamar(2, [{ nome: 'Duda Melo', motivo: 'INDISPONIVEL' }, { nome: 'Ana Souza', motivo: 'JA_ESCALADO' }]),
    '2 pessoas chamadas. Duda avisou que não pode nesse dia; Ana já está em outro posto nesse dia.');
  assert.equal(resultadoDeChamar(1, []), '1 pessoa chamada.');
  assert.equal(resultadoDeChamar(0, []), 'Ninguém foi chamado.');
  assert.match(erroAoResponderChamada({ ok: false, erro: 'NAO_ESTA_ABERTA', status: 'preenchida' }), /Alguém já ficou/);
  assert.match(erroAoResponderChamada({ ok: false, erro: 'NAO_ESTA_ABERTA', status: 'cancelada' }), /já não precisa/);
  assert.match(erroAoResponderChamada({ ok: false, erro: 'PREENCHIDA' }), /Alguém já ficou/);
  assert.match(erroAoResponderChamada({ ok: false, erro: 'NAO_PODE', motivo: 'JA_ESCALADO' }), /já está na escala/);
});

caso('o convite aberto pede resposta; o resto é notícia', () => {
  const base = { culto_id: 'c', funcao_id: 'f', funcao: 'VOZ', data: '2026-10-04', evento: null, inicio: null, impede: null, criado_em: '' };
  const lista = [
    { ...base, id: '1', status: 'aberta', aberta: true },
    { ...base, id: '2', status: 'aberta', aberta: false },        // o líder preencheu
    { ...base, id: '3', status: 'aceita', aberta: false },
  ];
  const { abertas, fechadas } = separarChamadas(lista);
  assert.deepEqual(abertas.map(c => c.id), ['1']);
  assert.deepEqual(fechadas.map(c => noticiaDaChamada(c)), ['Alguém já ficou com essa vaga.', 'Você ficou com essa vaga.']);
});

/* 5 · o recado e o aviso abrem nos convites */
caso('o recado do WhatsApp leva o link pessoal, aberto nos convites', () => {
  const t = recadoDaChamada('Bia Lima', 'VOZ', 'domingo, 4 de outubro, 10h', 'https://guiaservir.com', 'abc123');
  assert.equal(t, 'Oi, Bia! Precisamos de alguém em VOZ, domingo, 4 de outubro, 10h. Você pode cobrir? '
    + 'Responde por aqui, em um toque: https://guiaservir.com/eu/abc123#chamadas');
  const m = mensagemDaChamada({ token: 'abc123', funcao: 'VOZ', data: '2026-10-04', evento: null, inicio: null },
    'https://guiaservir.com', '10h', '19h');
  assert.equal(m.titulo, 'Precisam de você');
  assert.equal(m.corpo, 'A liderança chamou você para cobrir VOZ, domingo, 4 de outubro, 10h. Toque para responder.');
  assert.equal(m.url, 'https://guiaservir.com/eu/abc123#chamadas');
  assert.ok(!/avisamos|avisaremos|notificamos/i.test(m.corpo), 'sem promessa de aviso');
});

/* 6 · o número */
caso('o número do WhatsApp: com DDD vira 55; curto demais, nada', () => {
  assert.equal(linkDoWhats('(21) 99999-1000', 'oi'), 'https://wa.me/5521999991000?text=oi');
  assert.equal(linkDoWhats('5521999991000', 'oi'), 'https://wa.me/5521999991000?text=oi');
  assert.equal(linkDoWhats('99991000', 'oi'), null);
  assert.equal(linkDoWhats(null, 'oi'), null);
});

console.log(`chamadas: ${feitas}/${feitas} ok`);
