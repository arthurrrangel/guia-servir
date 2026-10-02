/* =============================================================================
   O QUE MUDA NUM DIA, LINHA A LINHA · 17/09/2026

   `salvar_dia` (RPC) regrava o dia inteiro com `insert … on conflict do
   update`. No Postgres, o gatilho BEFORE INSERT roda na linha proposta ANTES
   de o conflito ser detectado, então `fn_indisponivel` via um "INSERT" de
   quem já estava na vaga, achava o "não posso" que a pessoa mandou depois de
   escalada, e recusava. Bastou o Thiago e a Fernanda responderem "não posso"
   em 20/09 para o João Victor não conseguir mexer em NADA naquele domingo,
   nem tirar os dois (tirar um regravava o outro). Provado no SQL Editor em
   16/09 com o upsert do dia dentro de uma transação desfeita.

   A migração 46 conserta o gatilho. Mas o navegador não pode depender de uma
   migração que ainda não rodou: a partir daqui o dia é salvo EM PARTES, só o
   que mudou, com as tabelas direto (RLS valendo, como a RPC já valia por ser
   `security invoker`):

     · vaga que continua com a mesma pessoa: só `fixo` e `primeira_vez`,
       e só se mudaram (UPDATE sem troca de pessoa: o gatilho deixa passar);
     · vaga que trocou de pessoa, ou vaga que sumiu: DELETE, e a nova pessoa
       entra por INSERT (mesmo efeito que a RPC: status volta a pendente,
       `respondido_em` limpa, `escalado_em` marca a entrada);
     · os DELETEs vêm antes dos INSERTs, senão trocar duas pessoas de lugar
       tropeçaria na regra de função simultânea no meio do caminho.

   Esta função é pura: recebe o desejado e o que está no banco, devolve o
   plano. Quem fala com o banco é `salvarDia` em lib/db.ts.

   02/10/2026 · TROCAR A PESSOA DE UM POSTO OCUPADO NÃO GRAVAVA DESDE 19/09.

   Pedido do Arthur: "tava tendo bloqueio e não tava conseguindo mudar
   pessoas". A causa, provada com este código contra o banco local na 102
   pelo PostgREST: em 19/09 a ordem passou a ser INSERIR PRIMEIRO na troca
   simples (sai uma pessoa, entra outra), para nada se perder se um
   gatilho recusasse. Mas `escalacoes` tem `unique (culto_id, funcao_id)`
   (um posto, uma linha; é nele que a RPC `salvar_dia` faz o `on conflict`):
   o INSERT de quem entra com a linha de quem sai ainda lá estourava o unique, a
   requisição inteira caía e a tela dizia "Isso já está cadastrado". Valia
   para TODA troca de pessoa em posto ocupado, para o "Sortear de novo" e
   para o "Remontar" de dias com gente. Só esvaziar o posto e escolher de
   novo funcionava. O teste deste plano conferia a ordem, não o banco.

   Agora a vaga que continua existindo e muda de PESSOA vai em `trocar`: a
   linha dela é regravada por id, todas numa instrução só (`upsert`). Sem
   DELETE, a vaga nunca fica vazia por causa de uma recusa; sem INSERT, o
   unique não tem o que acusar; e numa instrução só, duas pessoas trocando
   de lugar não tropeçam na regra de função simultânea (o gatilho dela é
   adiado para o fim da transação, e aí as duas já trocaram). O efeito é o
   da RPC: situação volta a "falta confirmar", `respondido_em` limpa,
   `escalado_em` marca a entrada (gatilho da 38).

   DELETE e INSERT ficam para o que eles são: posto que sumiu do dia, posto
   que ainda não tinha linha. A ordem entre eles e o `trocar` está em
   `apagarPrimeiro`.
   ============================================================================= */

export type SlotDesejado = {
  funcao_id: string; voluntario_id: string; status: string; fixo: boolean; primeira_vez: boolean;
  /* 103 · quem o BANCO tinha nesta vaga quando a tela carregou. Ausente =
     não sei (vaga refeita na tela, ou quem chama não informou): aí vale a
     regra de sempre. Ver o comentário de `planoDoDia`. */
  carregado?: string | null;
};
export type LinhaAtual = {
  id: string; funcao_id: string; voluntario_id: string | null; fixo: boolean; primeira_vez: boolean;
};
/** vaga que continua existindo e muda de pessoa: a linha é regravada por id */
export type VagaTrocada = {
  id: string; funcao_id: string; voluntario_id: string; status: string; fixo: boolean; primeira_vez: boolean;
};
export type PlanoDoDia = {
  apagar: string[];                                        // ids de escalacoes
  /* 02/10/2026: troca de pessoa em vaga que já tem linha (ver o topo) */
  trocar: VagaTrocada[];
  atualizar: { id: string; fixo?: boolean; primeira_vez?: boolean }[];
  inserir: SlotDesejado[];
  /* A ORDEM ENTRE APAGAR E INSERIR NÃO É SEMPRE A MESMA — 19/09/2026.

     São três requisições separadas ao PostgREST, logo três transações. Se o
     DELETE passar e o INSERT for recusado por gatilho — a pessoa avisou que
     não pode entre a carga da tela e o clique, ou outro líder mexeu —, a vaga
     fica VAZIA no banco. A tela mostra o erro e recarrega, então ninguém fica
     com informação errada; mas a vaga esvaziou por causa da tentativa, e o
     comentário desta função prometia que nada ficava meio salvo.

     Quando dá, inserir PRIMEIRO resolve: se o INSERT for recusado, o DELETE
     nem acontece e nada se perde. Só não dá quando as mesmas pessoas
     aparecem dos dois lados — a permuta, "Letícia e Thiago trocam de posto".
     Aí é preciso liberar antes, senão o gatilho de função simultânea recusa
     a segunda antes de a primeira ter saído. Esse é o caso que o
     `escala-diff.test.mjs` já cobre e que não pode afrouxar.

     `apagarPrimeiro` diz qual dos dois mundos é este. Quem grava obedece.

     02/10/2026: a "troca simples" do parágrafo acima nunca chegou a gravar
     inserindo primeiro: o INSERT no posto que ainda tinha linha estourava o
     unique (culto, função). Ela e a permuta saíram daqui e foram para
     `trocar` (uma instrução, sem DELETE nem INSERT). O que sobra para esta
     ordem é o posto que sumiu do dia com a pessoa dele entrando em outro
     posto (pela inserção ou pela troca): aí apagar vem antes. Quem grava faz
     [apagar, se primeiro] → trocar → atualizar → inserir → [apagar]. */
  apagarPrimeiro: boolean;
};

export function planoDoDia(desejados: SlotDesejado[], atuais: LinhaAtual[]): PlanoDoDia {
  const plano: PlanoDoDia = { apagar: [], trocar: [], atualizar: [], inserir: [], apagarPrimeiro: false };
  const porFuncao = new Map(desejados.map(d => [d.funcao_id, d]));
  const vistas = new Set<string>();

  for (const linha of atuais) {
    const quer = porFuncao.get(linha.funcao_id);
    if (!quer || vistas.has(linha.funcao_id)) {
      /* vaga que sumiu, ou linha duplicada da mesma função (não deveria
         existir, mas se existir, sai) */
      plano.apagar.push(linha.id);
      continue;
    }
    vistas.add(linha.funcao_id);
    if (linha.voluntario_id !== quer.voluntario_id) {
      /* 103 · A TROCA QUE A TELA ABERTA NÃO VIU.

         Desde a 103 o voluntário passa a vaga para um colega pelo próprio
         link, e o banco muda sem a tela do líder saber. A tela aberta antes
         disso ainda mostra quem pediu; se o líder salvar QUALQUER coisa
         desse dia, este laço via "vaga com outra pessoa" e devolvia a vaga a
         quem pediu, apagando a troca e a confirmação de quem aceitou, sem
         um aviso.

         Regra: a vaga que a tela NÃO mexeu (a pessoa desejada é a mesma que
         o banco tinha ao carregar) e que o banco mudou depois (a linha de
         agora é outra pessoa) fica como o banco está. Quem o líder trocou de
         propósito nasce sem `carregado` e segue a regra de sempre. */
      if (quer.carregado !== undefined && quer.voluntario_id === quer.carregado
          && linha.voluntario_id !== quer.carregado) continue;
      /* 02/10/2026: era `apagar` + `inserir`, e o INSERT vinha antes e
         estourava o unique (culto, função). Agora a própria linha muda de
         pessoa (ver o topo do arquivo). */
      plano.trocar.push({
        id: linha.id, funcao_id: quer.funcao_id, voluntario_id: quer.voluntario_id,
        status: quer.status, fixo: !!quer.fixo, primeira_vez: !!quer.primeira_vez,
      });
      continue;
    }
    const patch: { id: string; fixo?: boolean; primeira_vez?: boolean } = { id: linha.id };
    if (!!linha.fixo !== !!quer.fixo) patch.fixo = !!quer.fixo;
    if (!!linha.primeira_vez !== !!quer.primeira_vez) patch.primeira_vez = !!quer.primeira_vez;
    if ('fixo' in patch || 'primeira_vez' in patch) plano.atualizar.push(patch);
  }
  for (const d of desejados) if (!vistas.has(d.funcao_id)) plano.inserir.push(d);

  /* quem SAI por um DELETE (posto que sumiu do dia) e ENTRA em outro posto
     do mesmo dia: só aí o DELETE precisa vir antes, senão a regra de função
     simultânea recusa a entrada com a pessoa ainda no posto antigo. A troca
     cruzada entre duas vagas que continuam existindo não passa mais por
     aqui: as duas vão no mesmo `trocar`, numa instrução só. */
  const idParaLinha = new Map(atuais.map(l => [l.id, l]));
  const saindo = new Set(
    plano.apagar.map(id => idParaLinha.get(id)?.voluntario_id).filter(Boolean) as string[],
  );
  plano.apagarPrimeiro = [...plano.inserir, ...plano.trocar].some(d => saindo.has(d.voluntario_id));
  return plano;
}

/* plantão: só ids. Quem sai, quem entra. */
export function planoDoPlantao(desejados: string[], atuais: string[]) {
  const quer = new Set(desejados), tem = new Set(atuais);
  return {
    apagar: atuais.filter(v => !quer.has(v)),
    inserir: desejados.filter(v => !tem.has(v)),
  };
}
