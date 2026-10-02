/* =============================================================================
   "CHEGUEI" E "COMO FOI", NO PURO — 107, 02/10/2026

   O que este arquivo exige:
     1. o que chega de `eu_hoje` e de `eu_como_foi` passa por conferência: forma
        errada vira nada, e o time do dia só existe para quem lidera o dia;
     2. a hora da chegada no relógio da igreja, qualquer que seja o fuso do
        aparelho, e a frase do time ("6 de 9 chegaram");
     3. a lista do líder: uma linha por pessoa, na ordem dos postos; quem
        disse que não pode some, a não ser que tenha chegado mesmo assim;
     4. a pergunta "como foi" só depois do culto: no dia, uma hora e meia
        depois de começar; sem hora conhecida, só às 21h;
     5. cada recusa do banco vira uma frase que diz o que fazer;
     6. o resumo do como foi e a ordem de atenção (problema, puxado, bom);
     7. a porta do cartaz (/cheguei/<ministério>) segue a mesma regra de salto
        das outras e abre a página no "Cheguei".

   Roda com `npm test`. */
import { strict as assert } from 'node:assert';
import {
  hojeDoLink, horaDaChegada, quemMarcou, fraseDoTime, contaDoTime, erroAoChegar, erroAoMarcar, genteDoDia,
  comoFoiDoLink, perguntaAberta, erroAoContar, resumoComoFoi, emOrdemDeAtencao, hojeNaIgreja, COMO_FOI, NOTA_MAX,
} from '@/lib/chegada';
import { estadoVazio, garantirDia, linkDoVoluntario } from '@/lib/engine';
import { proximoPassoDaPorta } from '@/lib/meu-token';

let feitas = 0;
const caso = (nome, fn) => { fn(); feitas++; };
const ID = n => `00000000-0000-4000-8000-00000000000${n}`;

/* 1 · o que vem do banco */
caso('eu_hoje: forma errada vira nada; o time só para quem lidera o dia', () => {
  assert.deepEqual(hojeDoLink(null), []);
  assert.deepEqual(hojeDoLink({ ok: true, cultos: 'x' }), []);
  const l = hojeDoLink({ ok: true, cultos: [
    { culto_id: ID(1), data: '2026-10-04', evento: null, inicio: null, chegou_em: '2026-10-04T12:12:00Z', marcado_por: 'eu', relata: false, time: null },
    { culto_id: 'nao-e-id!', data: '2026-10-04' },
    { culto_id: ID(2), data: '04/10/2026' },
    { culto_id: ID(3), data: '2026-10-04', evento: 'Ensaio', inicio: '19:30:00', chegou_em: 'ontem', marcado_por: 'hacker',
      relata: true, time: [
        { voluntario_id: ID(4), nome: '  Ana Souza ', funcoes: ['VOZ', 7, ''], chegou_em: null, marcado_por: null, eu: true },
        { voluntario_id: ID(5), nome: '', funcoes: [] },
        { voluntario_id: '../x y', nome: 'Sem Id' },
      ] },
  ] });
  assert.equal(l.length, 2);
  assert.equal(l[0].chegou_em, '2026-10-04T12:12:00Z');
  assert.equal(l[0].time, null);
  assert.equal(l[1].chegou_em, null, 'instante que não é data vira nada');
  assert.equal(l[1].marcado_por, null, 'marca desconhecida vira nada');
  assert.equal(l[1].inicio, '19:30:00');
  assert.equal(l[1].relata, true);
  assert.deepEqual(l[1].time.map(g => [g.nome, g.funcoes.join('+'), g.eu]), [['Ana Souza', 'VOZ', true]]);
  /* relata sem time: não finge ser líder do dia */
  assert.equal(hojeDoLink({ cultos: [{ culto_id: ID(1), data: '2026-10-04', relata: true, time: 'x' }] })[0].relata, false);
});

caso('eu_como_foi: só resposta conhecida, nota com teto', () => {
  const l = comoFoiDoLink([
    { culto_id: ID(1), data: '2026-10-03', evento: null, inicio: null, funcoes: ['FOTO'], resposta: 'puxado', texto: 'a'.repeat(900), atualizado_em: '2026-10-03T23:00:00Z' },
    { culto_id: ID(2), data: '2026-10-04', funcoes: null, resposta: 'otimo', texto: null },
    { culto_id: 'x/..', data: '2026-10-04' },
  ]);
  assert.equal(l.length, 2);
  assert.equal(l[0].texto.length, NOTA_MAX);
  assert.equal(l[1].resposta, null);
  assert.deepEqual(l[1].funcoes, []);
  assert.deepEqual(comoFoiDoLink({}), []);
  assert.deepEqual(COMO_FOI.map(o => o.rot), ['Foi bom', 'Foi puxado', 'Teve problema']);
});

/* 2 · a hora e a frase */
caso('a hora da chegada no relógio da igreja, em qualquer fuso', () => {
  assert.equal(horaDaChegada('2026-10-04T12:07:00Z'), '9:07');
  assert.equal(horaDaChegada('2026-10-04T23:30:00Z'), '20:30');
  assert.equal(horaDaChegada('2026-10-05T02:05:00Z'), '23:05', 'depois da meia-noite em UTC ainda é o dia anterior aqui');
  assert.equal(horaDaChegada('nada'), '');
  assert.equal(horaDaChegada(null), '');
  assert.equal(quemMarcou('eu', true), 'você marcou');
  assert.equal(quemMarcou('eu'), 'pelo link');
  assert.equal(quemMarcou('lider_do_dia'), 'pelo líder do dia');
  assert.equal(quemMarcou('lideranca'), 'pela liderança');
  assert.equal(quemMarcou(null), '');
});
caso('a frase do time', () => {
  assert.equal(fraseDoTime(0, 0), '');
  assert.equal(fraseDoTime(0, 5), 'ninguém marcou ainda');
  assert.equal(fraseDoTime(3, 5), '3 de 5 chegaram');
  assert.equal(fraseDoTime(5, 5), 'os 5 chegaram');
  assert.equal(fraseDoTime(1, 1), 'chegou');
  assert.deepEqual(contaDoTime([{ chegou_em: 'x' }, { chegou_em: null }]), { chegaram: 1, total: 2 });
});

/* 3 · a lista do líder */
caso('uma linha por pessoa, na ordem dos postos; quem não pode some, a não ser que tenha chegado', () => {
  const S = estadoVazio();
  S.funcoes = [
    { id: 'f1', nome: 'VOZ', ordem: 1, simultanea: true, ativa: true, tipos: ['domingo', 'follow'] },
    { id: 'f2', nome: 'BAIXO', ordem: 2, simultanea: true, ativa: true, tipos: ['domingo', 'follow'] },
    { id: 'f3', nome: 'LÍDER', ordem: 3, simultanea: true, ativa: true, tipos: ['domingo', 'follow'] },
    { id: 'f4', nome: 'TECLADO', ordem: 4, simultanea: true, ativa: true, tipos: ['domingo', 'follow'] },
  ];
  S.voluntarios = [
    { id: 'a', nome: 'Ana Souza' }, { id: 'b', nome: 'Bia Lima' }, { id: 'c', nome: 'Caio Reis' }, { id: 'd', nome: 'Duda Melo' },
  ];
  const d = garantirDia(S, '2026-10-04');
  d.cultoId = 'c1';
  d.slots['VOZ'] = { vid: 'a', status: 'confirmado', fixo: false };
  d.slots['LÍDER'] = { vid: 'a', status: 'confirmado', fixo: false };
  d.slots['BAIXO'] = { vid: 'c', status: 'recusado', fixo: false };
  d.slots['TECLADO'] = { vid: 'd', status: 'recusado', fixo: false };
  const marcas = [
    { culto_id: 'c1', voluntario_id: 'a', chegou_em: '2026-10-04T12:00:00Z', marcado_por: 'eu' },
    { culto_id: 'c1', voluntario_id: 'd', chegou_em: '2026-10-04T12:30:00Z', marcado_por: 'lideranca' },
  ];
  const g = genteDoDia(S, '2026-10-04', marcas);
  assert.deepEqual(g.map(x => `${x.nome}:${x.funcoes.join('+')}:${x.recusou}:${x.marcado_por || '-'}`),
    ['Ana Souza:VOZ+LÍDER:false:eu', 'Duda Melo:TECLADO:true:lideranca']);
  assert.deepEqual(genteDoDia(S, '2026-10-11', marcas), [], 'dia sem escala, ninguém');
});

/* 4 · quando perguntar como foi */
caso('a pergunta só depois do culto', () => {
  const dom = { data: '2026-10-04', inicio: null, evento: null };      // domingo, 10h
  const sab = { data: '2026-10-03', inicio: null, evento: null };      // Follow, 19h
  const ev = { data: '2026-10-07', inicio: '19:30:00', evento: 'Ensaio' };
  const evSemHora = { data: '2026-10-07', inicio: null, evento: 'Mutirão' };
  const em = iso => new Date(iso);                                      // instantes em UTC; a igreja é UTC-3
  assert.equal(perguntaAberta(dom, em('2026-10-04T14:00:00Z'), '10h', '19h'), false, '11h: o culto não acabou');
  assert.equal(perguntaAberta(dom, em('2026-10-04T14:30:00Z'), '10h', '19h'), true, '11h30: uma hora e meia depois');
  assert.equal(perguntaAberta(dom, em('2026-10-03T20:00:00Z'), '10h', '19h'), false, 'antes do dia, nunca');
  assert.equal(perguntaAberta(dom, em('2026-10-06T12:00:00Z'), '10h', '19h'), true, 'dias depois, sim');
  assert.equal(perguntaAberta(sab, em('2026-10-03T23:00:00Z'), '10h', '19h'), false, 'Follow às 20h: ainda não');
  assert.equal(perguntaAberta(sab, em('2026-10-04T00:31:00Z'), '10h', '19h'), true, 'Follow às 21h31');
  assert.equal(perguntaAberta(ev, em('2026-10-07T23:59:00Z'), '10h', '19h'), false, 'evento das 19h30, às 20h59');
  assert.equal(perguntaAberta(ev, em('2026-10-08T00:00:00Z'), '10h', '19h'), true, 'evento das 19h30, às 21h em ponto');
  assert.equal(perguntaAberta(evSemHora, em('2026-10-07T23:00:00Z'), '10h', '19h'), false, 'sem hora: 20h ainda não');
  assert.equal(perguntaAberta(evSemHora, em('2026-10-08T00:00:00Z'), '10h', '19h'), true, 'sem hora: às 21h');
  assert.equal(hojeNaIgreja(em('2026-10-05T02:00:00Z')), '2026-10-04', 'às 23h de domingo aqui ainda é domingo');
});

/* 5 · as frases */
caso('cada recusa do banco diz o que fazer', () => {
  for (const f of [erroAoChegar, erroAoMarcar, erroAoContar]) {
    for (const erro of ['CULTO_INEXISTENTE', 'FORA_DO_DIA', 'SEM_POSTO', 'SEM_PERMISSAO', 'NAO_E_DO_TIME', 'AINDA_NAO',
                        'MUITO_ANTIGO', 'FORA_DA_JANELA', 'NAO_SERVIU', 'TEXTO_LONGO', 'RESPOSTA_INVALIDA', 'OUTRO']) {
      const t = f({ ok: false, erro });
      assert.ok(t && t.endsWith('.') && !/undefined|_/.test(t), `${f.name} ${erro}: ${t}`);
    }
    assert.equal(f({ ok: true }), '');
    assert.equal(f(null), '');
  }
  assert.match(erroAoChegar({ ok: false, erro: 'FORA_DO_DIA' }), /no dia do culto/);
  assert.match(erroAoMarcar({ ok: false, erro: 'MUITO_ANTIGO' }), /30 dias/);
  assert.match(erroAoContar({ ok: false, erro: 'TEXTO_LONGO' }), /500 letras/);
});

/* 6 · o resumo e a atenção */
caso('o resumo do como foi e a ordem de atenção', () => {
  const l = [
    { nome: 'Caio', resposta: 'bom' }, { nome: 'Ana', resposta: 'problema' }, { nome: 'Bia', resposta: 'puxado' },
    { nome: 'Duda', resposta: 'bom' }, { nome: 'Eva', resposta: 'problema' },
  ];
  assert.equal(resumoComoFoi(l), '2 foi bom · 1 puxado · 2 tiveram problema');
  assert.equal(resumoComoFoi([{ resposta: 'problema' }]), '1 teve problema');
  assert.equal(resumoComoFoi([]), '');
  assert.deepEqual(emOrdemDeAtencao(l).map(x => x.nome), ['Ana', 'Eva', 'Bia', 'Caio', 'Duda']);
});

/* 7 · a porta do cartaz */
caso('o cartaz leva ao ministério, e a porta salta como as outras', () => {
  assert.equal(linkDoVoluntario('https://escalas.guiaservir.com', 'louvor', 'cheguei'), 'https://guiaservir.com/cheguei/louvor');
  assert.equal(linkDoVoluntario('https://guiaservir.com', 'mídia', 'cheguei'), 'https://guiaservir.com/cheguei/m%C3%ADdia');
  assert.equal(linkDoVoluntario('https://guiaservir.com', null, 'cheguei'), '');
  assert.equal(proximoPassoDaPorta('a', '', 'e', 'louvor', 'cheguei'), 'https://escalas.guiaservir.com/cheguei/louvor#h=a.e');
  assert.equal(proximoPassoDaPorta('e', '#h=a.e', 'e', 'louvor', 'cheguei'), 'https://guiaservir.com/equipe/louvor?ir=cheguei');
  assert.equal(proximoPassoDaPorta('', '', '', 'louvor', 'cheguei'), '/equipe/louvor?ir=cheguei');
});

console.log(`chegada: ${feitas}/${feitas} ok`);
