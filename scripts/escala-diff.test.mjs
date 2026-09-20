/* O plano de salvar um dia em partes. Roda com `npm test`.

   17/09/2026. A regra que este arquivo protege: uma vaga que continua com a
   mesma pessoa NUNCA vira DELETE+INSERT (é isso que fazia o gatilho recusar
   quem avisou "não posso" depois de escalado); e trocar de pessoa é sempre
   DELETE e depois INSERT, nunca UPDATE de voluntario_id, para que dois nomes
   trocando de lugar não tropecem na regra de função simultânea. */
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
  return JSON.stringify({ apagar: a.apagar, atualizar: a.atualizar, inserir: a.inserir })
    === JSON.stringify({ apagar: b.apagar, atualizar: b.atualizar, inserir: b.inserir });
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

/* 3. trocar o Thiago pelo João: DELETE do Thiago + INSERT do João, o resto quieto */
{
  const p = planoDoDia(quer({ [F.ilum]: { voluntario_id: V.joao } }), atual);
  ok(mesmo(p.apagar, ['e2']), 'trocar → apaga a linha antiga', JSON.stringify(p));
  ok(p.atualizar.length === 0, 'trocar → nenhum update');
  ok(p.inserir.length === 1 && p.inserir[0].voluntario_id === V.joao && p.inserir[0].funcao_id === F.ilum, 'trocar → insere o novo', JSON.stringify(p.inserir));
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

/* 6. duas pessoas trocam de lugar: os dois DELETEs vêm no plano antes dos
   dois INSERTs (quem grava faz apagar → atualizar → inserir) */
{
  const p = planoDoDia(quer({ [F.proj]: { voluntario_id: V.thiago }, [F.ilum]: { voluntario_id: V.leticia } }), atual);
  ok(mesmo([...p.apagar].sort(), ['e1', 'e2']), 'troca cruzada → apaga as duas', JSON.stringify(p.apagar));
  ok(p.inserir.length === 2, 'troca cruzada → insere as duas');
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

/* O PLACAR ERA UMA CONSTANTE, E ELA NÃO SABIA QUANTAS ASSERÇÕES EXISTEM.
   17 escrito à mão, com 4 das 17 mortas: o "17/17" cobria 13 de verdade.
   Agora `ok` conta, como no resto da suíte. */
const total = feitas;
/* ---- 19/09/2026: a ordem entre apagar e inserir ----

   Três requisições, três transações. Se o DELETE passa e o INSERT é recusado
   por gatilho, a vaga esvazia por causa da tentativa. Inserir primeiro evita
   a perda — exceto na permuta, onde liberar antes é obrigatório, senão o
   gatilho de função simultânea recusa a entrada antes de a saída acontecer.
   Este é o caso que não pode afrouxar. */
{
  /* troca simples: sai a Fernanda, entra o Thiago. Ninguém aparece dos dois
     lados, então dá para inserir primeiro. */
  const p = planoDoDia(
    [{ funcao_id: 'f1', voluntario_id: 'thiago', status: 'pendente', fixo: false, primeira_vez: false }],
    [{ id: 'l1', funcao_id: 'f1', voluntario_id: 'fernanda', fixo: false, primeira_vez: false }],
  );
  ok(p.apagarPrimeiro === false, 'troca simples insere primeiro (nada se perde se o gatilho recusar)');
}
{
  /* permuta: Letícia e Thiago trocam de posto. Os dois saem E entram. */
  const p = planoDoDia(
    [
      { funcao_id: 'f1', voluntario_id: 'thiago', status: 'pendente', fixo: false, primeira_vez: false },
      { funcao_id: 'f2', voluntario_id: 'leticia', status: 'pendente', fixo: false, primeira_vez: false },
    ],
    [
      { id: 'l1', funcao_id: 'f1', voluntario_id: 'leticia', fixo: false, primeira_vez: false },
      { id: 'l2', funcao_id: 'f2', voluntario_id: 'thiago', fixo: false, primeira_vez: false },
    ],
  );
  ok(p.apagarPrimeiro === true, 'permuta apaga primeiro (senão o gatilho de simultânea recusa)');
}
{
  /* vaga nova, sem ninguém saindo */
  const p = planoDoDia(
    [{ funcao_id: 'f1', voluntario_id: 'ana', status: 'pendente', fixo: false, primeira_vez: false }],
    [],
  );
  ok(p.apagarPrimeiro === false, 'vaga nova insere primeiro');
}

if (falhas) { console.log(`escala-diff: ${falhas} falha(s) em ${total}`); process.exit(1); }
console.log(`escala-diff: ${total}/${total} ok`);
