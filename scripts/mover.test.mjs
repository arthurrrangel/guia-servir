/* =============================================================================
   MUDAR PESSOAS DE POSTO NUM DIA MONTADO, NO PURO — 02/10/2026

   O que este arquivo exige (lib/mover.ts e o pedaço do motor que ele usa):
     1. escolher quem já está em outro posto AO MESMO TEMPO é mudança de
        posto, nunca bloqueio; posto que não é simultâneo (EDIÇÃO, depois do
        culto) não conta, nem na origem nem no destino;
     2. a pergunta oferece "trocar os dois de lugar" só quando quem está no
        destino pode ir para a origem (faz a função, não avisou que não pode,
        não furou, o sexo do posto, não está em um terceiro posto ao mesmo
        tempo), e diz por que quando não pode;
     3. o plano regrava as duas vagas por id, levando com cada pessoa a
        situação, a hora da resposta e a 1ª vez; quem tinha dito que não pode
        volta a "falta confirmar"; as vagas mexidas ficam fixas;
     4. se o banco não está como a tela mostrou, o plano recusa (MUDOU) em
        vez de apagar o que outro líder fez;
     5. a lista do líder passa a mostrar quem avisou que não pode, e o
        sorteio continua sem essa pessoa;
     6. as frases não têm travessão.

   Roda com `npm test`. */
import { strict as assert } from 'node:assert';
import { comoMover, perguntaDeMover, planoDeMover } from '@/lib/mover';
import { candidatos, estadoVazio, garantirDia, gerarDia, ocupadoNoDia, postoSimultaneoNoDia } from '@/lib/engine';

let feitas = 0;
const caso = (nome, fn) => {
  try { fn(); feitas++; }
  catch (e) { console.error(`FALHOU: ${nome}\n  ${e.message}`); process.exit(1); }
};

const DIA = '2030-03-10';   // um domingo
const F = (nome, ordem, simultanea = true, exigeSexo) => ({ id: 'f' + ordem, nome, ordem, simultanea, ativa: true, tipos: ['domingo', 'follow'], exigeSexo });
const P = (id, nome, funcoes, extra = {}) => ({
  id, nome, tel: '21999990000', ativo: true, limiteMes: 4, token: 'tok' + id, funcoes, conferido: true,
  confirmadas: Object.fromEntries(Object.keys(funcoes).map(f => [f, true])),
  indisponivel: [], disponivel: [], ...extra,
});

function estado() {
  const S = estadoVazio();
  S.temAcesso = true;
  S.funcoes = [F('CAM 1', 1), F('CAM 2', 2), F('LUZ', 3), F('EDICAO', 4, false), F('APOIO F', 5, true, 'F')];
  const todas = { 'CAM 1': 'titular', 'CAM 2': 'titular', 'LUZ': 'titular', 'EDICAO': 'titular' };
  S.voluntarios = [
    P('va', 'Pessoa A', { ...todas, 'APOIO F': 'titular' }, { sexo: 'F' }),
    P('vb', 'Pessoa B', todas, { sexo: 'M' }),
    P('vc', 'Pessoa C', { 'CAM 2': 'titular', 'LUZ': 'titular' }, { sexo: 'M' }),   // não faz CAM 1
    P('vd', 'Pessoa D', todas, { sexo: 'F' }),
  ];
  const dia = garantirDia(S, DIA);
  dia.cultoId = 'culto-1';
  dia.slots['CAM 1'] = { vid: 'va', status: 'confirmado', fixo: false };
  dia.slots['CAM 2'] = { vid: 'vb', status: 'pendente', fixo: false };
  dia.slots['LUZ'] = { vid: 'vc', status: 'pendente', fixo: false };
  return S;
}

/* ------------------------------------------------------------- 1 · decidir */
caso('quem está em outro posto ao mesmo tempo é mudança, com troca possível', () => {
  const S = estado();
  const m = comoMover(S, DIA, 'CAM 2', 'va');
  assert.deepEqual(m, { de: 'CAM 1', ocupante: 'vb', podeTrocar: true, semTroca: '' });
});
caso('vaga de destino vazia: só passar', () => {
  const S = estado();
  delete S.escalas[DIA].slots['CAM 2'];
  assert.deepEqual(comoMover(S, DIA, 'CAM 2', 'va'), { de: 'CAM 1', ocupante: null, podeTrocar: false, semTroca: '' });
});
caso('quem não está em outro posto não é mudança (caminho de sempre)', () => {
  const S = estado();
  assert.equal(comoMover(S, DIA, 'CAM 2', 'vd'), null);
});
caso('posto que não é simultâneo não conta (destino EDICAO)', () => {
  const S = estado();
  assert.equal(comoMover(S, DIA, 'EDICAO', 'va'), null);
});
caso('posto que não é simultâneo não conta (origem EDICAO)', () => {
  const S = estado();
  S.escalas[DIA].slots['EDICAO'] = { vid: 'vd', status: 'pendente', fixo: false };
  assert.equal(comoMover(S, DIA, 'CAM 2', 'vd'), null);
});
caso('o defeito que existia: em EDICAO e em CAM 1, o conflito é CAM 1', () => {
  const S = estado();
  /* EDICAO vem ANTES no objeto: `ocupadoNoDia` devolvia ela e a tela
     deixava passar o que o banco recusava */
  const slots = S.escalas[DIA].slots;
  S.escalas[DIA].slots = { 'EDICAO': { vid: 'va', status: 'pendente', fixo: false }, ...slots };
  assert.equal(ocupadoNoDia(S, DIA, 'va', 'CAM 2'), 'EDICAO');
  assert.equal(postoSimultaneoNoDia(S, DIA, 'va', 'CAM 2'), 'CAM 1');
  assert.equal(comoMover(S, DIA, 'CAM 2', 'va')?.de, 'CAM 1');
});
caso('sem troca: quem está no destino não faz a função da origem', () => {
  const S = estado();
  const m = comoMover(S, DIA, 'LUZ', 'va');   // LUZ tem a Pessoa C, que não faz CAM 1
  assert.equal(m.podeTrocar, false);
  assert.equal(m.semTroca, 'Pessoa C não faz CAM 1');
});
caso('sem troca: quem está no destino avisou que não pode (situação)', () => {
  const S = estado();
  S.escalas[DIA].slots['CAM 2'].status = 'recusado';
  assert.equal(comoMover(S, DIA, 'CAM 2', 'va').semTroca, 'Pessoa B avisou que não pode nesse dia');
});
caso('sem troca: quem está no destino marcou "não posso" no dia', () => {
  const S = estado();
  S.voluntarios.find(v => v.id === 'vb').indisponivel = [DIA];
  assert.equal(comoMover(S, DIA, 'CAM 2', 'va').semTroca, 'Pessoa B avisou que não pode nesse dia');
});
caso('sem troca: furou', () => {
  const S = estado();
  S.escalas[DIA].slots['CAM 2'].status = 'furou';
  assert.equal(comoMover(S, DIA, 'CAM 2', 'va').semTroca, 'Pessoa B está como furou nesse dia');
});
caso('sem troca: o sexo do posto de origem', () => {
  const S = estado();
  S.escalas[DIA].slots = { 'APOIO F': { vid: 'va', status: 'pendente', fixo: false }, 'CAM 2': { vid: 'vb', status: 'pendente', fixo: false } };
  const b = S.voluntarios.find(v => v.id === 'vb');
  b.funcoes['APOIO F'] = 'titular'; b.confirmadas['APOIO F'] = true;   // faz a função, mas é homem
  const m = comoMover(S, DIA, 'CAM 2', 'va');
  assert.equal(m.de, 'APOIO F');
  assert.equal(m.semTroca, 'APOIO F é um posto de mulheres');
});
caso('sem troca: quem está no destino também está num terceiro posto ao mesmo tempo', () => {
  const S = estado();
  S.escalas[DIA].slots['LUZ'] = { vid: 'vb', status: 'pendente', fixo: false };
  assert.equal(comoMover(S, DIA, 'CAM 2', 'va').semTroca, 'Pessoa B também está em LUZ');
});

/* ------------------------------------------------------------ 2 · palavras */
caso('a pergunta com troca: duas saídas, a troca primeiro e cheia', () => {
  const S = estado();
  const q = perguntaDeMover(S, DIA, 'CAM 2', 'va', comoMover(S, DIA, 'CAM 2', 'va'));
  assert.equal(q.titulo, 'Pessoa A já está em CAM 1 nesse culto.');
  assert.equal(q.texto, '');
  assert.deepEqual(q.opcoes.map(o => [o.v, o.rot, o.sub, o.pri]), [
    ['trocar', 'Trocar os dois de lugar', 'Pessoa B vai para CAM 1.', true],
    ['passar', 'Passar só Pessoa A', 'CAM 1 fica sem ninguém e Pessoa B sai desse dia.', false],
  ]);
});
caso('quem sai do dia e já tinha confirmado: a pergunta diz', () => {
  const S = estado();
  S.escalas[DIA].slots['CAM 2'].status = 'confirmado';
  const q = perguntaDeMover(S, DIA, 'CAM 2', 'va', comoMover(S, DIA, 'CAM 2', 'va'));
  assert.equal(q.opcoes[1].sub, 'CAM 1 fica sem ninguém e Pessoa B sai desse dia (já tinha confirmado).');
});
caso('sem troca: uma saída, cheia, e o porquê no texto', () => {
  const S = estado();
  const q = perguntaDeMover(S, DIA, 'LUZ', 'va', comoMover(S, DIA, 'LUZ', 'va'));
  assert.equal(q.opcoes.length, 1);
  assert.equal(q.opcoes[0].pri, true);
  assert.equal(q.texto, 'Não dá para trocar os dois de lugar: Pessoa C não faz CAM 1.');
});
caso('destino vazio: "Passar para"', () => {
  const S = estado();
  delete S.escalas[DIA].slots['CAM 2'];
  const q = perguntaDeMover(S, DIA, 'CAM 2', 'va', comoMover(S, DIA, 'CAM 2', 'va'));
  assert.deepEqual(q.opcoes.map(o => [o.v, o.rot, o.sub]), [['passar', 'Passar para CAM 2', 'CAM 1 fica sem ninguém.']]);
});
caso('nenhuma frase com travessão', () => {
  const S = estado();
  const frases = [];
  for (const [para, quem] of [['CAM 2', 'va'], ['LUZ', 'va']]) {
    const q = perguntaDeMover(S, DIA, para, quem, comoMover(S, DIA, para, quem));
    frases.push(q.titulo, q.texto, ...q.opcoes.flatMap(o => [o.rot, o.sub]));
  }
  for (const f of frases) assert.ok(!/[—–]/.test(f), f);
});

/* ---------------------------------------------------------------- 3 · plano */
const AGORA = '2030-03-08T12:00:00.000Z';
const L = (id, funcao_id, voluntario_id, status = 'pendente', extra = {}) =>
  ({ id, funcao_id, voluntario_id, status, respondido_em: status === 'pendente' ? null : '2030-03-05T10:00:00.000Z', fixo: false, primeira_vez: false, ...extra });

caso('trocar: as duas linhas, por id, cada pessoa com o que é dela', () => {
  const r = planoDeMover({ culto: 'c', de: 'f1', para: 'f2', quem: 'va', ocupante: 'vb', modo: 'trocar' },
    [L('x', 'f1', 'va', 'confirmado', { primeira_vez: true }), L('y', 'f2', 'vb')], AGORA);
  assert.equal(r.ok, true);
  assert.deepEqual(r.limpar, []);
  assert.deepEqual(r.gravar, [
    { id: 'x', culto_id: 'c', funcao_id: 'f1', voluntario_id: 'vb', status: 'pendente', respondido_em: null, fixo: true, primeira_vez: false, escalado_em: AGORA },
    { id: 'y', culto_id: 'c', funcao_id: 'f2', voluntario_id: 'va', status: 'confirmado', respondido_em: '2030-03-05T10:00:00.000Z', fixo: true, primeira_vez: true, escalado_em: AGORA },
  ]);
});
caso('passar para vaga sem linha: a própria linha muda de função', () => {
  const r = planoDeMover({ culto: 'c', de: 'f1', para: 'f2', quem: 'va', ocupante: null, modo: 'passar' },
    [L('x', 'f1', 'va', 'confirmado')], AGORA);
  assert.deepEqual(r, { ok: true, limpar: [], gravar: [
    { id: 'x', culto_id: 'c', funcao_id: 'f2', voluntario_id: 'va', status: 'confirmado', respondido_em: '2030-03-05T10:00:00.000Z', fixo: true, primeira_vez: false, escalado_em: AGORA },
  ] });
});
caso('passar para a vaga de alguém: a pessoa entra na linha do destino, a origem fica vazia e sai', () => {
  const r = planoDeMover({ culto: 'c', de: 'f1', para: 'f2', quem: 'va', ocupante: 'vb', modo: 'passar' },
    [L('x', 'f1', 'va'), L('y', 'f2', 'vb', 'confirmado')], AGORA);
  assert.equal(r.ok, true);
  assert.deepEqual(r.gravar.map(g => [g.id, g.funcao_id, g.voluntario_id, g.status, g.fixo]), [
    ['y', 'f2', 'va', 'pendente', true],
    ['x', 'f1', null, 'pendente', false],
  ]);
  assert.deepEqual(r.limpar, ['x']);
  /* as mesmas chaves em todas as linhas: o PostgREST monta UMA instrução */
  const chaves = r.gravar.map(g => Object.keys(g).sort().join());
  assert.equal(new Set(chaves).size, 1);
});
caso('quem tinha dito que não pode e foi mudado de posto volta a "falta confirmar"', () => {
  const r = planoDeMover({ culto: 'c', de: 'f1', para: 'f2', quem: 'va', ocupante: null, modo: 'passar' },
    [L('x', 'f1', 'va', 'recusado')], AGORA);
  assert.equal(r.gravar[0].status, 'pendente');
  assert.equal(r.gravar[0].respondido_em, null);
});
caso('MUDOU: a pessoa já não está na origem', () => {
  const r = planoDeMover({ culto: 'c', de: 'f1', para: 'f2', quem: 'va', ocupante: 'vb', modo: 'trocar' },
    [L('x', 'f1', 'vd'), L('y', 'f2', 'vb')], AGORA);
  assert.deepEqual(r, { ok: false, erro: 'MUDOU' });
});
caso('MUDOU: outra pessoa entrou no destino', () => {
  const r = planoDeMover({ culto: 'c', de: 'f1', para: 'f2', quem: 'va', ocupante: 'vb', modo: 'passar' },
    [L('x', 'f1', 'va'), L('y', 'f2', 'vd')], AGORA);
  assert.deepEqual(r, { ok: false, erro: 'MUDOU' });
});
caso('MUDOU: o destino estava vazio na tela e agora tem gente', () => {
  const r = planoDeMover({ culto: 'c', de: 'f1', para: 'f2', quem: 'va', ocupante: null, modo: 'passar' },
    [L('x', 'f1', 'va'), L('y', 'f2', 'vd')], AGORA);
  assert.deepEqual(r, { ok: false, erro: 'MUDOU' });
});
caso('linha vazia que sobrou no destino conta como vaga vazia', () => {
  const r = planoDeMover({ culto: 'c', de: 'f1', para: 'f2', quem: 'va', ocupante: null, modo: 'passar' },
    [L('x', 'f1', 'va'), L('y', 'f2', null)], AGORA);
  assert.equal(r.ok, true);
  assert.deepEqual(r.gravar.map(g => [g.id, g.voluntario_id]), [['y', 'va'], ['x', null]]);
});

/* ----------------------------------------------- 5 · a lista e o sorteio */
caso('a lista do líder mostra quem avisou que não pode; o sorteio não', () => {
  const S = estado();
  delete S.escalas[DIA].slots['CAM 2'];
  S.voluntarios.find(v => v.id === 'vd').indisponivel = [DIA];
  const lider = candidatos(S, 'CAM 2', DIA, { excluirOcupados: false, ignorarLimite: true, incluirTreino: true, incluirQuemNaoPode: true }).map(c => c.id);
  const sorteio = candidatos(S, 'CAM 2', DIA).map(c => c.id);
  assert.ok(lider.includes('vd'));
  assert.ok(!sorteio.includes('vd'));
  /* e o sorteio do dia inteiro nunca põe quem disse "não posso" */
  for (let i = 0; i < 20; i++) {
    const T = estado();
    T.escalas[DIA].slots = {};
    T.voluntarios.find(v => v.id === 'vd').indisponivel = [DIA];
    gerarDia(T, DIA);
    assert.ok(!Object.values(T.escalas[DIA].slots).some(s => s?.vid === 'vd'));
  }
});

console.log(`mover: ${feitas} casos ok`);
