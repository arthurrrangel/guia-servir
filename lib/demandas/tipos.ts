/* O vocabulário do sistema, num lugar só.

   Os nomes aqui são os mesmos do banco, de propósito: quando o servidor
   recusa alguma coisa, a palavra que ele devolve é a palavra que a tela
   procura nesta lista. Duas grafias para o mesmo conceito é como se perde uma
   regra sem ninguém ver. */

export type Papel = 'solicitante' | 'responsavel' | 'gestor' | 'admin';
export type Status = 'aberta' | 'execucao' | 'travada' | 'concluida' | 'cancelada';
export type Trava = 'informacao' | 'aprovacao' | 'terceiros';
export type Prioridade = 'baixa' | 'normal' | 'alta' | 'urgente';
export type Aprovacao = 'pendente' | 'aprovada' | 'rejeitada' | null;

export type Eu = {
  ok: boolean; id: string; nome: string; primeiro_nome: string;
  papel: Papel; setor_id: string | null; setor: string | null;
  setor_atende: boolean; tem_login: boolean;
};

export type Setor = {
  id: string; nome: string; slug: string; atende: boolean;
  /* 92 · O PORTÃO DEIXOU DE SER ESCOLHIDO POR QUEM PEDE.

     Medido pela quarta auditoria, contra o banco real: R$ 999.999,99 numa
     categoria que não exige aprovação nasce aberta, é assumida e concluída
     por uma pessoa só, e o histórico não tem um único evento de aprovação.
     `exige_aprovacao` é flag da CATEGORIA, e nada olhava o valor.

     `null` é o padrão e quer dizer SEM TETO: o comportamento de hoje,
     preservado. Quem escolhe o número é quem administra, na aba Setores. */
  teto_sem_aprovacao: number | null;
};

export type Categoria = {
  id: string; grupo: string; nome: string; setor_id: string | null;
  exige_aprovacao: boolean; exige_orcamento: boolean; prazo_padrao_dias: number | null;
};

export type Membro = {
  id: string; nome: string; setor_id: string | null; papel: Papel;
  telefone: string | null;
  email?: string | null; auth_email?: string | null; token?: string | null; ativo?: boolean;
};

/* SEM `membros` DESDE A MIGRAÇÃO 67. `dem_bases` entregava nome, telefone,
   papel e setor de todo mundo para qualquer responsável, e as três telas que
   chamam `bases()` guardavam a lista e nunca a liam — a lista de gente dos
   Ajustes vem de `dem_pessoas`, que é SÓ_ADMIN. O campo sai do tipo para o
   tsc cobrar quem tentar voltar a lê-lo de graça. */
export type Bases = { setores: Setor[]; categorias: Categoria[] };

/** O que a lista devolve por demanda. */
export type Resumo = {
  numero: number; titulo: string;
  status: Status; travada_por: Trava | null;
  prioridade: Prioridade;
  categoria: string; grupo: string;
  solicitante: string; responsavel_setor: string; responsavel: string | null; abriu: string;
  prazo: string | null; evento: string | null; evento_data: string | null;
  aprovacao: Aprovacao;
  /* O VEREDITO DO PORTÃO, E NÃO SÓ A COLUNA — migração 88.

     `aprovacao` é o que foi gravado quando a demanda nasceu; `falta_aprovacao`
     é o que o servidor vai cobrar AGORA, lendo a categoria. Os dois divergem
     no dia em que alguém liga "exige aprovação" numa categoria que já tem
     demanda andando, e foi assim que a tela passou a mostrar botão morto para
     quem atende e a esconder "Aprovar" de quem decide. */
  falta_aprovacao: boolean;
  responsavel_id: string | null;
  criada_em: string; mexida_em: string; parada_dias: number;
  atrasada: boolean; reaberturas: number;
  /* A ETAPA 5 DO PDF, QUE NÃO TINHA COLUNA — migração 91.

     "Depois da execução, o setor solicitante ou responsável pela gestão
     valida se a demanda foi atendida corretamente." Até aqui o sistema
     registrava a DISCORDÂNCIA (`reabrir`) e não registrava a concordância, e
     as duas não são a mesma informação: sem este carimbo, "não foi reaberta"
     conta a mesma história para a demanda que resolveu e para a que a pessoa
     desistiu de cobrar.

     Vem na lista, e não só na ficha, porque a pergunta que ele responde é de
     painel: quantas concluídas ninguém confirmou. */
  validada_em: string | null;
};

/** O que a tela de uma demanda devolve a mais. */
export type Detalhe = Resumo & {
  descricao: string; objetivo: string | null; local: string | null; publico: string | null;
  impacto: string | null; orcamento: number | null; sem_prazo_porque: string | null;
  travada_nota: string | null; aprovacao_nota: string | null;
  conclusao: string | null; concluida_em: string | null;
  atraso_motivo: string | null; cancelada_motivo: string | null;
  categoria_id: string; setor_responsavel_id: string; responsavel_id: string | null;
  abriu_telefone: string | null; resp_telefone: string | null;
  /* o NOME de quem confirmou. `validada_em` já vem do `Resumo`; aqui entra
     quem, porque "Validada em 22/09" sem dono não fecha a etapa 5: o PDF diz
     "o setor solicitante OU responsável pela gestão", e são decisões
     diferentes. */
  validada_por: string | null;
};

export type Evento = {
  em: string; tipo: string; de: string | null; para: string | null;
  texto: string | null; interno: boolean; quem: string | null;
};

/* `id`, `quem` e `depois_de_fechar` entraram com a migracao 85: sem o id a
   tela nao tem como oferecer "tirar", e sem os outros dois a ficha nao
   responde as duas perguntas que se faz depois de um boleto trocado — quem
   pos isso aqui, e quando. */
export type Anexo = {
  id: string; nome: string; url: string; em: string;
  quem: string | null; depois_de_fechar: boolean;
  /* QUEM PODE TIRAR, DECIDIDO PELO SERVIDOR — migração 89.

     `desanexar` aceita `pode_atender(m,d) OR o anexo é meu`. A tela oferecia
     "tirar" em TODO anexo para quem atende ou quem abriu, e não tinha como
     acertar: o payload trazia `quem` (o NOME) e nunca o `membro_id`. Medido, a
     solicitante tocava em "tirar" no boleto que Compras pregou e lia "Esse
     anexo não está mais aqui, ou não é seu para tirar."

     `dem_ver` passa a decidir por anexo, com a MESMA expressão do `desanexar`.
     A regra mora num lugar só, e é do lado que manda. */
  posso_tirar: boolean;
};

export type Vista = {
  demanda: Detalhe;
  eu: { id: string; papel: Papel; atende: boolean; abriu: boolean };
  eventos: Evento[];
  anexos: Anexo[];
};

export type Numeros = {
  de: string; ate: string;
  total: number; abertas: number; concluidas: number; canceladas: number;
  atrasadas: number; reabertas: number; paradas: number;
  horas_ate_concluir: number | null; horas_ate_resposta: number | null;
  no_prazo_pct: number | null;
  /* sobre QUANTAS demandas a conta foi feita. O indicador sozinho dizia 90%
     quando o real era 50%, porque contava como pontual toda demanda que nunca
     teve prazo. Ver a migração 87. */
  no_prazo_base?: number;
  por_setor: { nome: string; pediu: number; atendeu: number; abertas: number; atrasadas: number }[];
  por_categoria: { grupo: string; nome: string; n: number }[];
  por_prioridade: Partial<Record<Prioridade, number>>;
  motivos_de_atraso: { motivo: string; n: number }[];
  por_mes: { mes: string; n: number }[];
};
