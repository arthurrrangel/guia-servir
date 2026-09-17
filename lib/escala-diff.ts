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
   ============================================================================= */

export type SlotDesejado = {
  funcao_id: string; voluntario_id: string; status: string; fixo: boolean; primeira_vez: boolean;
};
export type LinhaAtual = {
  id: string; funcao_id: string; voluntario_id: string | null; fixo: boolean; primeira_vez: boolean;
};
export type PlanoDoDia = {
  apagar: string[];                                        // ids de escalacoes
  atualizar: { id: string; fixo?: boolean; primeira_vez?: boolean }[];
  inserir: SlotDesejado[];
};

export function planoDoDia(desejados: SlotDesejado[], atuais: LinhaAtual[]): PlanoDoDia {
  const plano: PlanoDoDia = { apagar: [], atualizar: [], inserir: [] };
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
      plano.apagar.push(linha.id);
      plano.inserir.push(quer);
      continue;
    }
    const patch: { id: string; fixo?: boolean; primeira_vez?: boolean } = { id: linha.id };
    if (!!linha.fixo !== !!quer.fixo) patch.fixo = !!quer.fixo;
    if (!!linha.primeira_vez !== !!quer.primeira_vez) patch.primeira_vez = !!quer.primeira_vez;
    if ('fixo' in patch || 'primeira_vez' in patch) plano.atualizar.push(patch);
  }
  for (const d of desejados) if (!vistas.has(d.funcao_id)) plano.inserir.push(d);
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
