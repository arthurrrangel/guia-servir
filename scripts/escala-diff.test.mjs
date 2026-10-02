/* O plano de salvar um dia em partes. Roda com `npm test`.

   17/09/2026. A regra que este arquivo protege: uma vaga que continua com a
   mesma pessoa NUNCA vira DELETE+INSERT (é isso que fazia o gatilho recusar
   quem avisou "não posso" depois de escalado).

   02/10/2026. A segunda regra deste cabeçalho era "trocar de pessoa é sempre
   DELETE e depois INSERT". Em 19/09 a ordem virou INSERT primeiro, e o INSERT
   no posto que ainda tinha linha estourava `unique (culto_id, funcao_id)`:
   nenhuma troca de pessoa em posto ocupado gravava. Este arquivo conferia a
   ORDEM e nunca o banco, por isso ficou verde. Agora trocar de pessoa numa
   vaga que já tem linha vai em `trocar` (a linha muda por id, todas numa
   instrução só), e a prova contra o banco mora fora daqui (PostgREST + RLS,
   registrada no Project). Aqui ficam as formas do plano. */
import { planoDoDia, planoDoPlantao } from '../lib/escala-diff.ts';

let falhas = 0;
let feitas = 0;
const ok = (cond, rotulo, extra = '') => { feitas++; if (!cond) { falhas++; console.log('  FALHOU:', rotulo, extra); } };
/* `apagarPrimeiro` entrou no plano em 19/09 e é comparado à parte, nos três
   casos do fim do arquivo. Aqui a comparação continua sendo sobre as três
   listas — senão cada teste antigo teria que repetir um campo que não é o
   assunto dele. */
const igual = (a, b) => {
  /* A GUARDA QUE FALTAVA, E O QUE ELA CUSTOU — 20/09/2026.

     `igual` lê `.apagar`, `.atualizar` e `.inserir` dos dois lados. Quando os
     dois lados são ARRAYS, esses três campos são `undefined` nos dois, os
     dois viram a string "{}" e a comparação é SEMPRE verdadeira:

         igual(['e9'], ['e2'])           -> true
         igual([],     ['e9'])           -> true
         igual(['x','y','z'], ['e1'])    -> true

     Quatro asserções deste arquivo comparavam array com array por aqui, e
     nenhuma delas podia falhar. Confirmado sabotando `lib/escala-diff.ts`
     para transformar "trocar de pessoa" em UPDATE: `p.apagar` virou `[]` e a
     asserção da linha 49 não apareceu entre as falhas.

     Pior: o caso 9 escondia um defeito de verdade. Tirando o
     `vistas.has(linha.funcao_id)` do filtro, o plano passava a emitir um
     INSERT de alguém num posto cuja linha NÃO foi apagada — linha duplicada
     em `escalacoes`, ou violação de unique na hora de gravar. O teste só
     olhava `apagar`, então passava.

     Agora `igual` só compara PLANOS, e quem compara array usa `mesmo`. */
  if (Array.isArray(a) || Array.isArray(b)) {
    throw new Error('igual() compara PLANOS, não arrays — use mesmo() para array');
  }
  /* 02/10/2026: `trocar` entra na comparação. Sem ele, um plano que
     esquecesse a troca de pessoa passaria por igual a um plano vazio. */
  return JSON.stringify({ apagar: a.apagar, trocar: a.trocar || [], atualizar: a.atualizar, inserir: a.inserir })
    === JSON.stringify({ apagar: b.apagar, trocar: b.trocar || [], atualizar: b.atualizar, inserir: b.inserir });
};
const mesmo = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const F = { proj: 'f-proj', ilum: 'f-ilum', edic: 'f-edic', foto: 'f-foto' };
const V = { leticia: 'v-let', thiago: 'v-thi', maria: 'v-mar', joao: 'v-joao' };
const atual = [
  { id: 'e1', funcao_id: F.proj, voluntario_id: V.leticia, fixo: true, primeira_vez: false },
  { id: 'e2', funcao_id: F.ilum, voluntario_id: V.thiago, fixo: true, primeira_vez: false },
  { id: 'e3', funcao_id: F.edic, voluntario_id: V.maria, fixo: true, primeira_vez: false },
];
const quer = (sobrescreve = {}) => [
  { funcao_id: F.proj, voluntario_id: V.leticia, status: 'pendente', fixo: true, primeira_vez: false },
  { funcao_id: F.ilum, voluntario_id: V.thiago, status: 'pendente', fixo: true, primeira_vez: false },
  { funcao_id: F.edic, voluntario_id: V.maria, status: 'pendente', fixo: true, primeira_vez: false },
].map(s => ({ ...s, ...(sobrescreve[s.funcao_id] || {}) }));

/* 1. nada mudou: plano vazio. É o caso do recado e do "destravar" que o
   João não conseguia: o Thiago (que avisou que não pode) continua na vaga e
   NÃO é regravado. */
{
  const p = planoDoDia(quer(), atual);
  ok(igual(p, { apagar: [], atualizar: [], inserir: [] }), 'nada mudou → plano vazio', JSON.stringify(p));
}

/* 2. destravar a Letícia: só um UPDATE de fixo, ninguém mais é tocado */
{
  const p = planoDoDia(quer({ [F.proj]: { fixo: false } }), atual);
  ok(igual(p, { apagar: [], atualizar: [{ id: 'e1', fixo: false }], inserir: [] }), 'destravar → um update', JSON.stringify(p));
}

/* 3. trocar uma pessoa por outra: a LINHA de quem sai passa a ser de quem
   entra, o resto quieto. Sem DELETE (a vaga nunca fica vazia por causa de uma
   recusa) e sem INSERT (era ele que estourava o unique, 02/10/2026). */
{
  const p = planoDoDia(quer({ [F.ilum]: { voluntario_id: V.joao } }), atual);
  ok(igual(p, { apagar: [], trocar: [{ id: 'e2', funcao_id: F.ilum, voluntario_id: V.joao, status: 'pendente', fixo: true, primeira_vez: false }], atualizar: [], inserir: [] }),
    'trocar → a mesma linha muda de pessoa, nada apagado nem inserido', JSON.stringify(p));
  ok(p.apagarPrimeiro === false, 'trocar → nada a apagar antes');
}

/* 4. tirar o Thiago (vaga fica vazia): só DELETE */
{
  const p = planoDoDia(quer().filter(s => s.funcao_id !== F.ilum), atual);
  ok(igual(p, { apagar: ['e2'], atualizar: [], inserir: [] }), 'tirar → só delete', JSON.stringify(p));
}

/* 5. vaga nova (Foto) num dia já gravado: só INSERT */
{
  const p = planoDoDia([...quer(), { funcao_id: F.foto, voluntario_id: V.joao, status: 'pendente', fixo: false, primeira_vez: true }], atual);
  ok(p.apagar.length === 0 && p.atualizar.length === 0 && p.inserir.length === 1 && p.inserir[0].funcao_id === F.foto, 'vaga nova → só insert', JSON.stringify(p));
}

/* 6. duas pessoas trocam de lugar: as duas linhas mudam de pessoa no mesmo
   `trocar` (uma instrução só: a regra de função simultânea é conferida no
   fim, com as duas já trocadas) */
{
  const p = planoDoDia(quer({ [F.proj]: { voluntario_id: V.thiago }, [F.ilum]: { voluntario_id: V.leticia } }), atual);
  ok(mesmo(p.trocar.map(t => [t.id, t.voluntario_id]), [['e1', V.thiago], ['e2', V.leticia]]), 'troca cruzada → as duas no trocar', JSON.stringify(p.trocar));
  ok(p.apagar.length === 0 && p.inserir.length === 0, 'troca cruzada → nada apagado nem inserido', JSON.stringify(p));
}

/* 7. dia sem nada no banco: tudo INSERT */
{
  const p = planoDoDia(quer(), []);
  ok(p.inserir.length === 3 && p.apagar.length === 0, 'dia novo → três inserts');
}

/* 8. marca de 1ª vez e travar juntos: um update com os dois campos */
{
  const p = planoDoDia(quer({ [F.edic]: { fixo: false, primeira_vez: true } }), atual);
  ok(mesmo(p.atualizar, [{ id: 'e3', fixo: false, primeira_vez: true }]), '1ª vez + destravar → um update', JSON.stringify(p.atualizar));
}

/* 9. linha duplicada da mesma função no banco (não deveria existir): a
   segunda sai */
{
  const p = planoDoDia(quer(), [...atual, { id: 'e9', funcao_id: F.proj, voluntario_id: V.joao, fixo: false, primeira_vez: false }]);
  /* o plano INTEIRO, e não só `apagar`: era aqui que o teste deixava passar
     um INSERT a mais, que vira linha duplicada em `escalacoes` ou estouro de
     unique na hora de gravar. */
  ok(igual(p, { apagar: ['e9'], atualizar: [], inserir: [] }),
     'duplicada → apaga a sobra E NÃO insere nada', JSON.stringify(p));
}

/* 10. plantão */
{
  const p = planoDoPlantao([V.joao, V.maria], [V.maria, V.thiago]);
  ok(mesmo(p, { apagar: [V.thiago], inserir: [V.joao] }), 'plantão: sai um, entra um', JSON.stringify(p));
  ok(mesmo(planoDoPlantao([], []), { apagar: [], inserir: [] }), 'plantão vazio');
}

/* 11. A TROCA QUE A TELA ABERTA NÃO VIU (103, 01/10/2026).
   A Ana pediu troca pelo link e a Bia aceitou: no banco a VOZ é da Bia. A
   tela do líder abriu antes, ainda mostra a Ana, e o líder salva o dia por
   causa de OUTRA vaga. A VOZ não pode voltar para a Ana. */
{
  const base = { status: 'pendente', fixo: false, primeira_vez: false };
  const p = planoDoDia(
    [
      { funcao_id: 'voz', voluntario_id: 'ana', carregado: 'ana', ...base },   // a tela não mexeu
      { funcao_id: 'baixo', voluntario_id: 'caio', ...base },                  // o líder trocou agora
    ],
    [
      { id: 'l1', funcao_id: 'voz', voluntario_id: 'bia', fixo: false, primeira_vez: false },
      { id: 'l2', funcao_id: 'baixo', voluntario_id: 'eva', fixo: false, primeira_vez: false },
    ],
  );
  ok(!p.apagar.includes('l1') && !p.trocar.some(x => x.id === 'l1'), 'troca aceita depois da carga: a vaga da Bia não é mexida', JSON.stringify(p));
  ok(!p.inserir.some(x => x.funcao_id === 'voz'), 'e a Ana não volta para a VOZ', JSON.stringify(p));
  ok(p.trocar.some(x => x.id === 'l2' && x.voluntario_id === 'caio') && !p.apagar.includes('l2'),
    'a vaga que o líder trocou de propósito segue a regra de sempre', JSON.stringify(p));
}
{
  /* o líder escolheu a Ana de propósito (vaga refeita na tela: sem `carregado`) */
  const p = planoDoDia(
    [{ funcao_id: 'voz', voluntario_id: 'ana', status: 'pendente', fixo: true, primeira_vez: false }],
    [{ id: 'l1', funcao_id: 'voz', voluntario_id: 'bia', fixo: false, primeira_vez: false }],
  );
  ok(igual(p, { apagar: [], trocar: [{ id: 'l1', funcao_id: 'voz', voluntario_id: 'ana', status: 'pendente', fixo: true, primeira_vez: false }], atualizar: [], inserir: [] }),
    'escolha nova do líder vence a troca (decisão de quem lidera)', JSON.stringify(p));
}
{
  /* a tela carregou a Ana, o líder pôs a Bia: `carregado` diz Ana, desejado
     diz Bia, banco diz Ana. É troca normal do líder. */
  const p = planoDoDia(
    [{ funcao_id: 'voz', voluntario_id: 'bia', carregado: 'ana', status: 'pendente', fixo: false, primeira_vez: false }],
    [{ id: 'l1', funcao_id: 'voz', voluntario_id: 'ana', fixo: false, primeira_vez: false }],
  );
  ok(p.trocar.some(x => x.id === 'l1' && x.voluntario_id === 'bia'),
    'com carregado diferente do desejado, a troca do líder grava', JSON.stringify(p));
}
{
  /* nada mudou no banco nem na tela: nada a fazer */
  const p = planoDoDia(
    [{ funcao_id: 'voz', voluntario_id: 'ana', carregado: 'ana', status: 'confirmado', fixo: false, primeira_vez: false }],
    [{ id: 'l1', funcao_id: 'voz', voluntario_id: 'ana', fixo: false, primeira_vez: false }],
  );
  ok(igual(p, { apagar: [], atualizar: [], inserir: [] }), 'vaga igual dos dois lados: plano vazio', JSON.stringify(p));
}

/* O PLACAR ERA UMA CONSTANTE, E ELA NÃO SABIA QUANTAS ASSERÇÕES EXISTEM.
   17 escrito à mão, com 4 das 17 mortas: o "17/17" cobria 13 de verdade.
   Agora `ok` conta, como no resto da suíte. */
/* ---- 19/09/2026: a ordem entre apagar e inserir ----

   Três requisições, três transações. Se o DELETE passa e o INSERT é recusado
   por gatilho, a vaga esvazia por causa da tentativa. Inserir primeiro evita
   a perda — exceto na permuta, onde liberar antes é obrigatório, senão o
   gatilho de função simultânea recusa a entrada antes de a saída acontecer.
   Este é o caso que não pode afrouxar. */
{
  /* troca simples: sai uma pessoa, entra outra. 02/10/2026: a própria
     linha muda de pessoa. Nada é inserido no posto que ainda tem linha (era
     o INSERT que estourava o unique) e nada é apagado antes. */
  const p = planoDoDia(
    [{ funcao_id: 'f1', voluntario_id: 'pb', status: 'pendente', fixo: false, primeira_vez: false }],
    [{ id: 'l1', funcao_id: 'f1', voluntario_id: 'pa', fixo: false, primeira_vez: false }],
  );
  ok(p.inserir.length === 0 && p.apagar.length === 0 && p.trocar.length === 1 && p.trocar[0].id === 'l1',
    'troca simples: a linha de quem sai vira de quem entra, sem INSERT no posto ocupado', JSON.stringify(p));
  ok(p.apagarPrimeiro === false, 'troca simples: nada a apagar antes');
}
{
  /* permuta: duas pessoas trocam de posto. 02/10/2026: as duas linhas no
     mesmo `trocar`, numa instrução só; não há DELETE para vir antes. */
  const p = planoDoDia(
    [
      { funcao_id: 'f1', voluntario_id: 'pb', status: 'pendente', fixo: false, primeira_vez: false },
      { funcao_id: 'f2', voluntario_id: 'pa', status: 'pendente', fixo: false, primeira_vez: false },
    ],
    [
      { id: 'l1', funcao_id: 'f1', voluntario_id: 'pa', fixo: false, primeira_vez: false },
      { id: 'l2', funcao_id: 'f2', voluntario_id: 'pb', fixo: false, primeira_vez: false },
    ],
  );
  ok(p.trocar.length === 2 && p.apagar.length === 0 && p.inserir.length === 0, 'permuta: as duas no trocar', JSON.stringify(p));
}
{
  /* o posto de uma pessoa sai do dia e ela entra no posto de outra (que
     sai): o DELETE tem de vir antes da troca, senão a regra de simultânea
     recusa a pessoa ainda no posto antigo */
  const p = planoDoDia(
    [{ funcao_id: 'f2', voluntario_id: 'pa', status: 'pendente', fixo: false, primeira_vez: false }],
    [
      { id: 'l1', funcao_id: 'f1', voluntario_id: 'pa', fixo: false, primeira_vez: false },
      { id: 'l2', funcao_id: 'f2', voluntario_id: 'pb', fixo: false, primeira_vez: false },
    ],
  );
  ok(mesmo(p.apagar, ['l1']) && p.trocar.length === 1 && p.trocar[0].voluntario_id === 'pa', 'sai de um posto e entra no de outra pessoa', JSON.stringify(p));
  ok(p.apagarPrimeiro === true, 'e apaga primeiro');
}
{
  /* o posto de uma pessoa sai do dia e ela entra num posto que ainda não
     tinha linha: apagar antes do INSERT, pelo mesmo motivo */
  const p = planoDoDia(
    [{ funcao_id: 'f2', voluntario_id: 'pa', status: 'pendente', fixo: false, primeira_vez: false }],
    [{ id: 'l1', funcao_id: 'f1', voluntario_id: 'pa', fixo: false, primeira_vez: false }],
  );
  ok(mesmo(p.apagar, ['l1']) && p.inserir.length === 1 && p.apagarPrimeiro === true, 'sai de um posto e entra em posto novo: apaga primeiro', JSON.stringify(p));
}
{
  /* vaga nova, sem ninguém saindo */
  const p = planoDoDia(
    [{ funcao_id: 'f1', voluntario_id: 'ana', status: 'pendente', fixo: false, primeira_vez: false }],
    [],
  );
  ok(p.apagarPrimeiro === false, 'vaga nova insere primeiro');
}

/* 02/10/2026: o placar era tirado ANTES do bloco de 19/09, e as asserções
   dele não entravam na conta (falhar ainda falhava; só o número mentia). */
const total = feitas;
if (falhas) { console.log(`escala-diff: ${falhas} falha(s) em ${total}`); process.exit(1); }
console.log(`escala-diff: ${total}/${total} ok`);
