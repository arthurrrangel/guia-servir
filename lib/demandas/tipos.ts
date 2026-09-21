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

export type Setor = { id: string; nome: string; slug: string; atende: boolean };

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
  criada_em: string; mexida_em: string; parada_dias: number;
  atrasada: boolean; reaberturas: number;
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
};

export type Evento = {
  em: string; tipo: string; de: string | null; para: string | null;
  texto: string | null; interno: boolean; quem: string | null;
};

export type Anexo = { nome: string; url: string; em: string };

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
  por_setor: { nome: string; pediu: number; atendeu: number; abertas: number; atrasadas: number }[];
  por_categoria: { grupo: string; nome: string; n: number }[];
  por_prioridade: Partial<Record<Prioridade, number>>;
  motivos_de_atraso: { motivo: string; n: number }[];
  por_mes: { mes: string; n: number }[];
};
