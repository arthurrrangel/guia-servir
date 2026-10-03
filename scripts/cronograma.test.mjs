/* =============================================================================
   O CRONOGRAMA DO CULTO, NO PURO — 109, 03/10/2026

   O que este arquivo exige:
     1. a hora como a pessoa escreve vira "HH:MM", e o que não dá para
        entender volta como erro (nada é gravado com hora errada);
     2. o texto que a tela aceita é o MESMO que o banco aceita: os casos
        abaixo são os da conferência da 109 (`cron_bloco_valido`), para a tela
        e o banco nunca discordarem;
     3. o que a tela manda gravar sai igual ao que o banco guardaria
        (`cron_normalizar`): aparado, sem campo vazio, Ceia "não" fora, os
        horários em ordem; senão a próxima gravação responderia MUDOU;
     4. o que vem do banco chega à tela no tipo certo, e o que não presta
        não quebra a página;
     5. o que falta, o prazo (três dias antes) e o estado de longe;
     6. a mensagem do grupo, exata;
     7. o erro do banco em português, e a 109 ausente reconhecida.

   Roda com `npm test`. */
import { strict as assert } from 'node:assert';
import {
  horaNormalizada, horaValida, horaFalada, horaDeFalada, limparTexto, textoValido,
  folhaDoBanco, antesDoBloco, palavraParaGravar, avisosParaGravar, louvorParaGravar, linhaParaGravar,
  palavraValida, avisosValidos, louvorValido, linhaValida,
  tituloDaFolha, diaCurto, prazoDaFolha, rotuloDoPrazo, horarioDaFolha,
  pendenciasDaFolha, estadoDaFolha, mensagemDoGrupo, linkDaFolha, rotuloDaAutoria,
  linhaDaMusicaNaFolha, erroDoCronograma, semCronogramaNoBanco, donoDoDirigente, rotuloDoPapel, TETO,
} from '@/lib/cronograma';

let feitas = 0;
const caso = (nome, fn) => {
  try { fn(); feitas++; }
  catch (e) { console.error(`FALHOU: ${nome}\n${e.message}`); process.exit(1); }
};

/* uma folha como a RPC devolve (copiada de `cronograma_dados` no banco local) */
const DO_BANCO = {
  data: '2026-09-13', tipo: 'domingo', culto_id: 'c1', inicio: null, fim: null, existe: true,
  token: '0123456789abcdef01',
  palavra: { quem: 'Pr. Altomir Rangel', tema: 'Peniel: hoje Deus mudará sua identidade', leitura: 'Gênesis 32:30',
             frase: 'Você pode ter chegado carregando o nome que o passado lhe deu.' },
  avisos: [{ texto: 'Honra aos voluntários', como: 'falado' }, { texto: 'Batismo dia 20', como: 'video' }],
  louvor: { final: 'Bondade de Deus' },
  linha: [
    { h: '09:00', o: 'Líderes chegam e conferem escala e ambientes', q: 'Todos os líderes' },
    { h: '10:00', o: 'Louvor', q: 'Louvor e Mídia' },
    { h: '11:00', o: 'Palavra', q: 'Pastor' },
    { h: '12:00', o: 'Encerramento', q: 'Recepção e Diaconia' },
  ],
  linha_propria: false,
  autoria: { palavra: { por: 'Paulo Roberto', em: '2026-09-09T23:05:00+00:00', via: 'dirigente' } },
  atualizado_em: '2026-09-09T23:05:00+00:00',
  comando: [
    { papel: 'direcao', equipe: 'Produção', equipe_id: 'e-prod', posto: 'COORDENADOR DO DIA', funcao_id: 'f1', nome: 'Rafa Lima', status: 'confirmado', convidado: null },
    { papel: 'dirigente', equipe: 'Dirigentes', equipe_id: 'e-dir', posto: 'DIRIGENTE', funcao_id: 'f2', nome: 'Paulo Roberto', status: 'confirmado', convidado: null },
    { papel: 'lider', equipe: 'Mídia', equipe_id: 'e-mid', posto: 'HEAD', funcao_id: 'f3', nome: null, status: null, convidado: 'Guest Léo' },
    { papel: 'lider', equipe: 'Louvor', equipe_id: 'e-lou', posto: 'DIRIGENTE', funcao_id: 'f4', nome: 'Letícia Souza', status: 'pendente', convidado: null },
  ],
  musicas: [
    { equipe: 'Louvor', titulo: 'Leão', tom: 'E', bpm: 67, quem: 'Letícia' },
    { equipe: 'Louvor', titulo: 'Ousado Amor' },
  ],
  repertorio: [{ equipe: 'Louvor', equipe_id: 'e-lou' }],
};
const cheia = () => folhaDoBanco(JSON.parse(JSON.stringify(DO_BANCO)));
/* a folha de um culto que ainda não tem nada: o modelo, ninguém no comando */
const vazia = () => folhaDoBanco({
  ...JSON.parse(JSON.stringify(DO_BANCO)),
  existe: false, token: null, palavra: null, avisos: null, louvor: null, autoria: {}, atualizado_em: null,
  comando: DO_BANCO.comando.map(c => ({ ...c, nome: null, status: null, convidado: null })),
  musicas: [],
});

/* 1 · a hora --------------------------------------------------------------- */
caso('a hora como a pessoa escreve vira HH:MM', () => {
  for (const [entra, sai] of [
    ['9', '09:00'], ['9h', '09:00'], ['9:30', '09:30'], ['09h30', '09:30'], ['0930', '09:30'], ['930', '09:30'],
    ['10:00', '10:00'], ['10h00', '10:00'], [' 19h ', '19:00'], ['23:59', '23:59'], ['0', '00:00'], ['9.15', '09:15'],
    ['24:00', null], ['9:60', null], ['25', null], ['abc', null], ['', null], ['9:5', null], [null, null], ['10:00:00', null],
  ]) assert.equal(horaNormalizada(entra), sai, `"${entra}"`);
});
caso('hora válida é a do CHECK do banco', () => {
  for (const h of ['00:00', '09:00', '23:59']) assert.ok(horaValida(h), h);
  for (const h of ['24:00', '9:00', '09:0', '09:60', '', ' 09:00']) assert.ok(!horaValida(h), h);
});
caso('a hora falada', () => {
  assert.equal(horaFalada('10:00'), '10h');
  assert.equal(horaFalada('10:30'), '10h30');
  assert.equal(horaFalada('09:05'), '9h05');
  assert.equal(horaFalada('xx'), '');
  assert.equal(horaDeFalada('10h'), '10:00');
  assert.equal(horaDeFalada('19h30'), '19:30');
  assert.equal(horaDeFalada('dez'), null);
});

/* 2 · o texto: os casos da conferência da 109 ------------------------------ */
caso('o texto que a tela aceita é o que o banco aceita', () => {
  assert.ok(textoValido('Peniel', 120));
  for (const [s, teto] of [['', 10], [' x', 10], ['x ', 10], ['a\nb', 10], ['a\tb', 10], ['a\u0085b', 10], ['abc', 2], [1, 10], [null, 10]]) {
    assert.ok(!textoValido(s, teto), JSON.stringify(s));
  }
  /* o teto conta letra, não byte nem unidade de UTF-16 */
  assert.ok(textoValido('ã'.repeat(120), 120));
  assert.ok(!textoValido('a'.repeat(121), 120));
  assert.ok(textoValido('🎵'.repeat(80), 80), 'emoji conta como uma letra, como no length() do banco');
});
caso('os mesmos 19 casos ruins que a conferência manda ao banco', () => {
  const ruins = [
    ['palavra', ['x']], ['palavra', { autor: 'x' }], ['palavra', { tema: '' }], ['palavra', { tema: ' x' }],
    ['palavra', { tema: 'a\nb' }], ['palavra', { ceia: 'sim' }], ['palavra', { tema: 1 }],
    ['avisos', { texto: 'x' }], ['avisos', [{ como: 'falado' }]], ['avisos', [{ texto: 'x', como: 'cantado' }]],
    ['avisos', [{ texto: 'x', url: 'y' }]],
    ['louvor', { final: 'x', tom: 'G' }], ['louvor', [{ final: 'x' }]],
    ['linha', []], ['linha', [{ h: '24:00', o: 'x' }]], ['linha', [{ h: '9:00', o: 'x' }]], ['linha', [{ h: '09:00' }]],
    ['linha', [{ h: '09:00', o: 'x', cor: 'red' }]], ['linha', [{ h: '09:00', o: 'x', q: '' }]],
  ];
  const valida = { palavra: palavraValida, avisos: avisosValidos, louvor: louvorValido, linha: linhaValida };
  assert.equal(ruins.length, 19);
  for (const [b, v] of ruins) assert.ok(!valida[b](v), `${b} aceitou ${JSON.stringify(v)}`);
  assert.ok(palavraValida({ quem: 'Pr. X', tema: 'Peniel', leitura: 'Gn 32', frase: 'Uma frase', ceia: true }));
  assert.ok(avisosValidos([]), 'lista vazia é "sem avisos"');
  assert.ok(!avisosValidos(Array.from({ length: 13 }, (_, i) => ({ texto: 'a' + i }))), '13 avisos');
  assert.ok(!linhaValida(Array.from({ length: 31 }, () => ({ h: '09:00', o: 'x' }))), '31 linhas');
  assert.ok(!palavraValida({ tema: 'a'.repeat(121) }));
  assert.ok(palavraValida({ tema: 'a'.repeat(120) }));
  assert.equal(TETO.tema, 120);
});

/* 3 · o que a tela manda gravar sai como o banco guardaria ------------------ */
caso('a Palavra: aparada, espaços juntados, vazio fora, Ceia "não" fora', () => {
  /* o mesmo exemplo da conferência ('norm_palavra') */
  assert.deepEqual(palavraParaGravar({ tema: '  Peniel   hoje\n Deus ', leitura: '', ceia: false, quem: undefined }),
    { tema: 'Peniel hoje Deus' });
  assert.equal(palavraParaGravar({ tema: '   ', ceia: false }), null, 'nada sobrou: nulo (volta a faltar)');
  assert.deepEqual(palavraParaGravar({ ceia: true }), { ceia: true });
});
caso('os avisos: aviso sem texto sai, e a lista vazia fica (é "sem avisos")', () => {
  /* 'norm_avisos' da conferência */
  assert.deepEqual(avisosParaGravar([{ texto: '  Batismo ' }, { texto: '   ' }, { texto: 'Ceia', como: 'video' }]),
    [{ texto: 'Batismo' }, { texto: 'Ceia', como: 'video' }]);
  assert.deepEqual(avisosParaGravar([]), []);
  assert.deepEqual(avisosParaGravar([{ texto: 'x', como: 'cantado' }]), [{ texto: 'x' }], 'jeito desconhecido sai');
});
caso('a música final', () => {
  assert.deepEqual(louvorParaGravar({ final: '  Bondade  de Deus ' }), { final: 'Bondade de Deus' });
  assert.equal(louvorParaGravar({ final: '  ' }), null);
});
caso('os horários: hora entendida, linha sem "o que" fora, em ordem', () => {
  /* 'norm_linha' da conferência */
  assert.deepEqual(linhaParaGravar([{ h: '10:00', o: 'Louvor' }, { h: '09:00', o: ' Chegada ', q: '' }, { h: '09:30', o: '' }]),
    { ok: true, linha: [{ h: '09:00', o: 'Chegada' }, { h: '10:00', o: 'Louvor' }] });
  assert.deepEqual(linhaParaGravar([{ h: '9h', o: 'A' }, { h: '9', o: 'B', q: ' Todos ' }]),
    { ok: true, linha: [{ h: '09:00', o: 'A' }, { h: '09:00', o: 'B', q: 'Todos' }] }, 'empate fica na ordem escrita');
  assert.deepEqual(linhaParaGravar([{ h: '', o: '', q: '' }]), { ok: true, linha: [] }, 'linha em branco some');
  assert.deepEqual(linhaParaGravar([{ h: '10:00', o: 'A' }, { h: '25h', o: 'B' }]), { ok: false, erro: 'HORA', indice: 1 });
  assert.deepEqual(linhaParaGravar([{ h: '', o: 'Sem hora' }]), { ok: false, erro: 'HORA', indice: 0 });
});

/* 4 · o que vem do banco --------------------------------------------------- */
caso('a folha do banco chega no tipo da tela', () => {
  const f = cheia();
  assert.equal(f.data, '2026-09-13');
  assert.equal(f.tipo, 'domingo');
  assert.equal(f.token, '0123456789abcdef01');
  assert.equal(f.comando.length, 4);
  assert.equal(f.comando[2].convidado, 'Guest Léo');
  assert.equal(f.musicas[0].bpm, 67);
  assert.equal(f.autoria.palavra.via, 'dirigente');
  assert.equal(f.linha.length, 4);
  assert.deepEqual(antesDoBloco(f, 'palavra'), DO_BANCO.palavra, 'o "antes" é o que o banco tem: salvar sem mexer não dá MUDOU');
  assert.deepEqual(antesDoBloco(f, 'avisos'), DO_BANCO.avisos);
  assert.deepEqual(antesDoBloco(f, 'linha'), DO_BANCO.linha);
});
caso('nulo e lista vazia não se confundem nos avisos', () => {
  assert.equal(vazia().avisos, null);
  assert.deepEqual(folhaDoBanco({ ...DO_BANCO, avisos: [] }).avisos, []);
});
caso('o que não presta não quebra a página', () => {
  assert.equal(folhaDoBanco(null), null);
  assert.equal(folhaDoBanco('x'), null);
  assert.equal(folhaDoBanco({ data: '13/09/2026' }), null);
  const f = folhaDoBanco({ data: '2026-09-13', comando: [{ papel: 'chefe' }, null, 'x'], musicas: [{}, { titulo: '' }],
                            linha: [{ h: '9:00', o: 'x' }, { h: '09:00' }, 'x'], palavra: ['x'], louvor: 'x' });
  assert.equal(f.comando.length, 0);
  assert.equal(f.musicas.length, 0);
  assert.equal(f.linha.length, 0);
  assert.equal(f.palavra, null);
  assert.equal(f.louvor, null);
  assert.equal(f.avisos, null);
});

/* 5 · o dia, o prazo, o que falta ------------------------------------------ */
caso('o dia, o prazo de três dias e a hora', () => {
  assert.equal(tituloDaFolha('2026-09-13'), 'Domingo, 13 de setembro');
  assert.equal(tituloDaFolha('2026-10-03'), 'Sábado (Follow), 3 de outubro');
  assert.equal(diaCurto('2026-09-13'), 'dom, 13/09');
  assert.equal(prazoDaFolha('2026-09-13'), '2026-09-10');
  assert.equal(rotuloDoPrazo('2026-09-13'), 'qui, 10/09');
  assert.equal(rotuloDoPrazo('2026-10-03'), 'qua, 30/09');
  assert.equal(horarioDaFolha(cheia(), '10h', '19h'), '10h às 12h');
  assert.equal(horarioDaFolha({ ...cheia(), linha: [] }, '10h', '19h'), '10h');
  assert.equal(horarioDaFolha({ ...cheia(), tipo: 'follow', linha: [{ h: '21:00', o: 'Fim' }] }, '10h', '19h'), '19h às 21h');
  assert.equal(horarioDaFolha({ ...cheia(), inicio: '18:30', fim: '20:00' }, '10h', '19h'), '18h30 às 20h');
  assert.equal(horarioDaFolha({ ...cheia(), linha: [{ h: '09:00', o: 'Antes' }] }, '10h', '19h'), '10h', 'linha que acaba antes do culto não vira fim');
});
caso('a folha cheia não tem pendência; o Guest vale como gente', () => {
  assert.deepEqual(pendenciasDaFolha(cheia()), []);
});
caso('a folha vazia: o que falta, na ordem da folha, com o dono', () => {
  const p = pendenciasDaFolha(vazia());
  assert.deepEqual(p.map(x => `${x.texto} | ${x.dono} | ${x.equipeId}`), [
    'A Palavra: quem prega, tema e leitura | Dirigente | e-dir',
    'Direção do culto: ninguém escalado | Produção | e-prod',
    'Dirigente: ninguém escalado | Dirigentes | e-dir',
    'Mídia: ninguém escalado | Mídia | e-mid',
    'Louvor: ninguém escalado | Louvor | e-lou',
    'As músicas (na ordem do culto) | Louvor | e-lou',
    'A música final | Louvor | e-lou',
    'Os avisos | Dirigente | e-dir',
  ]);
});
caso('o dono da Palavra ganha o nome do dirigente quando ele está escalado', () => {
  const f = { ...vazia(), comando: cheia().comando };
  assert.equal(donoDoDirigente(f), 'Dirigente: Paulo Roberto');
  assert.equal(pendenciasDaFolha(f)[0].dono, 'Dirigente: Paulo Roberto');
  assert.equal(rotuloDoPapel(f.comando[2]), 'Mídia');
});
caso('"sem avisos" responde; frase na tela é opcional; sem área de repertório não cobra músicas', () => {
  const f = { ...cheia(), avisos: [] };
  assert.deepEqual(pendenciasDaFolha(f), []);
  const g = { ...cheia(), palavra: { quem: 'X', tema: 'Y', leitura: 'Z' } };
  assert.deepEqual(pendenciasDaFolha(g), []);
  const h = { ...cheia(), repertorio: [], musicas: [] };
  assert.deepEqual(pendenciasDaFolha(h), []);
  const i = { ...cheia(), linha: [] };
  assert.deepEqual(pendenciasDaFolha(i).map(x => `${x.texto} | ${x.dono}`), ['Os horários do culto | Produção']);
});
caso('o estado de longe', () => {
  assert.deepEqual(estadoDaFolha(cheia(), '2026-09-09'), { tipo: 'pronto', tom: 'ok', texto: 'Tudo pronto' });
  assert.equal(estadoDaFolha(vazia(), '2026-09-14').tipo, 'passou');
  assert.deepEqual(estadoDaFolha(vazia(), '2026-09-10'), { tipo: 'aberto', tom: 'warn', texto: '8 pendências · até qui, 10/09' });
  assert.deepEqual(estadoDaFolha(vazia(), '2026-09-11'), { tipo: 'atrasado', tom: 'bad', texto: '8 pendências · prazo era qui, 10/09' });
  assert.equal(estadoDaFolha(vazia(), '2026-09-13').tipo, 'atrasado', 'no dia, ainda falta: atrasado, não passou');
  assert.equal(estadoDaFolha(vazia(), '2026-09-05').tipo, 'cedo', 'mais de quatro dias antes do prazo não é alarme');
  assert.equal(estadoDaFolha(vazia(), '2026-09-06').tipo, 'aberto');
  assert.equal(estadoDaFolha({ ...cheia(), louvor: null }, '2026-09-10').texto, '1 pendência · até qui, 10/09');
});

/* 6 · a mensagem do grupo -------------------------------------------------- */
caso('a mensagem do grupo, exata', () => {
  const link = linkDaFolha('https://guiaservir.com/', '0123456789abcdef01');
  assert.equal(link, 'https://guiaservir.com/cronograma/0123456789abcdef01');
  assert.equal(mensagemDoGrupo(cheia(), link, '10h', '19h'), [
    'Cronograma do culto',
    'Domingo, 13 de setembro, 10h às 12h',
    '',
    'Palavra: Pr. Altomir Rangel',
    'Tema: Peniel: hoje Deus mudará sua identidade',
    'Leitura: Gênesis 32:30',
    '',
    'Direção do culto: Rafa Lima',
    'Dirigente: Paulo Roberto',
    'Mídia: Guest Léo',
    'Louvor: Letícia Souza',
    '',
    'Cronograma completo e PDF:',
    'https://guiaservir.com/cronograma/0123456789abcdef01',
  ].join('\n'));
});
caso('o que falta não sai na mensagem; a Ceia sai quando tem', () => {
  const m = mensagemDoGrupo(vazia(), 'L', '10h', '19h');
  assert.equal(m, 'Cronograma do culto\nDomingo, 13 de setembro, 10h às 12h\n\nCronograma completo e PDF:\nL');
  const c = mensagemDoGrupo({ ...cheia(), palavra: { ...DO_BANCO.palavra, ceia: true } }, 'L', '10h', '19h');
  assert.ok(c.includes('Leitura: Gênesis 32:30\nCom Santa Ceia\n'), c);
});

/* 7 · a música, a autoria e o erro ----------------------------------------- */
caso('a música como o Louvor escreve', () => {
  assert.equal(linhaDaMusicaNaFolha({ titulo: 'Leão', tom: 'E', bpm: 67, quem: 'Letícia', equipe: 'Louvor' }), 'Leão (E, 67 BPM) Lead - Letícia');
  assert.equal(linhaDaMusicaNaFolha({ titulo: 'Ousado Amor', equipe: 'Louvor' }), 'Ousado Amor');
  assert.equal(linhaDaMusicaNaFolha({ titulo: 'X', bpm: 70, equipe: 'Louvor' }), 'X (70 BPM)');
});
caso('quem gravou e quando, no horário de Brasília', () => {
  assert.equal(rotuloDaAutoria({ por: 'Paulo Roberto', em: '2026-09-09T23:05:00+00:00', via: 'dirigente' }), 'por Paulo Roberto (dirigente), qua 20h05');
  assert.equal(rotuloDaAutoria({ por: 'Arthur', em: '2026-09-10T13:00:00Z', via: 'lider' }), 'por Arthur, qui 10h');
  assert.equal(rotuloDaAutoria(undefined), '');
});
caso('o erro do banco em português, e a 109 ausente reconhecida', () => {
  for (const e of ['MUDOU', 'VALOR_INVALIDO', 'JA_PASSOU', 'SEM_PERMISSAO', 'DATA_SEM_CULTO', 'BLOCO_INVALIDO',
                   'CULTO_INEXISTENTE', 'LONGE_DEMAIS', 'CULTO_RECUSADO']) {
    const t = erroDoCronograma({ erro: e });
    assert.ok(t && !t.startsWith('Não consegui gravar'), e);
    assert.ok(!/[A-Z]{4,}_/.test(t), `o código não vaza para a frase: ${t}`);
  }
  assert.ok(erroDoCronograma(null).startsWith('Não consegui gravar'));
  assert.ok(semCronogramaNoBanco({ code: 'PGRST202', message: 'Could not find the function public.cronograma_do_dia(p_data)' }));
  assert.ok(semCronogramaNoBanco({ message: 'Could not find the function public.eu_cronogramas(p_token) in the schema cache' }));
  assert.ok(!semCronogramaNoBanco({ code: '42501', message: 'permission denied' }));
  assert.ok(!semCronogramaNoBanco(null));
});

console.log(`cronograma: ${feitas}/${feitas} ok`);
