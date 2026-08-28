'use client';
import { sb } from './supabase';

/* Conversa com o banco no lado do LÍDER. Toda leitura aqui passa pela RLS que
   a migração 22 escreveu: o organizador escopado recebe só o ministério dele
   sem que esta camada precise filtrar nada — e é de propósito, porque filtro
   no cliente é filtro que um dia alguém esquece. */

export type StatusCand =
  | 'enviada' | 'em_analise' | 'conversa' | 'entrevista'
  | 'aprovada' | 'recusada' | 'integrando' | 'ativa' | 'inativa';

/* O NOME DO ESTADO, e só o nome. Usado no histórico, onde a pergunta é "o que
   aconteceu", não "o que fazer". Era aqui que morava a instrução ("chamar para
   conversar") e por isso o histórico ficava dando ordens sobre o passado. O que
   fazer agora mora em O_QUE_FAZER, logo abaixo. */
export const ROTULO_STATUS: Record<StatusCand, string> = {
  enviada: 'cadastro enviado', em_analise: 'em análise', conversa: 'em conversa',
  entrevista: 'conversa marcada', aprovada: 'aprovada', recusada: 'encerrada',
  integrando: 'integrando', ativa: 'servindo', inativa: 'inativa',
};
/* as que exigem ação do líder aparecem primeiro na fila */
export const ABERTAS: StatusCand[] = ['enviada', 'em_analise', 'conversa', 'entrevista'];
export const NO_TIME: StatusCand[] = ['aprovada', 'integrando', 'ativa'];

/* -----------------------------------------------------------------------------
   O QUE O LÍDER PRECISA FAZER

   ROTULO_STATUS diz em que estado a candidatura está. Isso é vocabulário de
   banco de dados, e o líder não abre a fila para consultar um enum: ele abre
   para saber o que fazer. Estas duas coisas são diferentes e agora moram em
   lugares diferentes.

   `chama` marca as situações em que a bola está com a liderança. Elas são
   maioria de propósito: quem se ofereceu já fez a parte dela, e o padrão do
   sistema é a igreja ir atrás da pessoa, nunca o contrário.
----------------------------------------------------------------------------- */
export type OQueFazer = {
  rot: string;      // o rótulo curto da linha fechada: uma instrução, não um estado
  txt: string;      // a frase inteira, dentro da linha aberta
  tom: '' | 'ok' | 'pend' | 'ruim';
  chama: boolean;   // a ação do momento é ligar para a pessoa
};

export const O_QUE_FAZER: Record<StatusCand, OQueFazer> = {
  enviada: {
    rot: 'chame no WhatsApp', tom: 'ruim', chama: true,
    txt: 'Ninguém falou com essa pessoa ainda. Chame no WhatsApp, se apresente e '
       + 'pergunte por que ela quer servir. Depois de falar, aprove ou encerre aqui.',
  },
  em_analise: {
    rot: 'chame no WhatsApp', tom: 'ruim', chama: true,
    txt: 'Você marcou para olhar com calma, e ela está esperando. Chame no WhatsApp '
       + 'e converse. Depois de falar, aprove ou encerre aqui.',
  },
  conversa: {
    rot: 'você disse que ia chamar', tom: 'ruim', chama: true,
    txt: 'A pessoa já viu na tela dela que a liderança quer conversar. Agora ela '
       + 'está esperando o seu WhatsApp. Quanto mais tempo passa, mais parece que ninguém viu.',
  },
  entrevista: {
    rot: 'conversa marcada', tom: 'pend', chama: false,
    txt: 'A conversa está marcada. Depois que ela acontecer, volte aqui e aprove '
       + 'ou encerre. Enquanto ficar assim, a pessoa continua sem resposta.',
  },
  aprovada: {
    rot: 'já está no time', tom: 'ok', chama: false,
    txt: 'Ela já entrou no time e já recebeu o link pessoal na tela dela. As funções '
       + 'entraram como a conferir: confirme o nível na aba Time quando vir a pessoa servindo.',
  },
  integrando: {
    rot: 'integrando', tom: 'ok', chama: false,
    txt: 'Está conhecendo como tudo funciona. Nada é obrigatório de sua parte agora.',
  },
  ativa: {
    rot: 'servindo', tom: 'ok', chama: false,
    txt: 'Já está na escala normalmente. Esta linha fica só como histórico.',
  },
  recusada: {
    rot: 'encerrada', tom: '', chama: false,
    txt: 'Encerrada por enquanto. A pessoa vê que não é um não definitivo e recebe '
       + 'as outras áreas como opção. Dá para reabrir aprovando aqui.',
  },
  inativa: {
    rot: 'inativa', tom: '', chama: false,
    txt: 'Fora do time por enquanto.',
  },
};

export type Candidatura = {
  id: string; status: StatusCand; criado_em: string; atualizado_em: string;
  observacao: string | null; nota_interna: string | null;
  decidido_por: string | null; decidido_em: string | null;
  voluntario_id: string | null;
  pessoas: { id: string; nome: string; telefone: string; email: string | null } | null;
  candidatura_funcoes: { funcoes: { nome: string } | null }[];
};

export async function listarCandidaturas(equipeId: string): Promise<Candidatura[]> {
  const { data, error } = await sb()!
    .from('candidaturas')
    .select(`id,status,criado_em,atualizado_em,observacao,nota_interna,decidido_por,decidido_em,voluntario_id,
             pessoas(id,nome,telefone,email),
             candidatura_funcoes(funcoes(nome))`)
    .eq('equipe_id', equipeId)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as Candidatura[];
}

export type Resposta = { pergunta: string; resposta: string };
export async function respostasDe(candId: string): Promise<Resposta[]> {
  const { data, error } = await sb()!
    .from('candidatura_respostas')
    .select('resposta,perguntas(texto,ordem)')
    .eq('candidatura_id', candId);
  if (error) throw error;
  return ((data || []) as any[])
    .map(r => ({ pergunta: r.perguntas?.texto || 'Pergunta', resposta: r.resposta, ordem: r.perguntas?.ordem ?? 0 }))
    .sort((a, b) => a.ordem - b.ordem)
    .map(({ pergunta, resposta }) => ({ pergunta, resposta }));
}

export type Passo = { de: string | null; para: string; quando: string; por: string | null; nota: string | null };
export async function historicoDe(candId: string): Promise<Passo[]> {
  const { data, error } = await sb()!
    .from('historico_candidatura')
    .select('de,para,quando,por,nota')
    .eq('candidatura_id', candId)
    .order('quando');
  if (error) throw error;
  return (data || []) as Passo[];
}

/* A decisão NÃO é um update direto: passa pela função, que na aprovação cria o
   voluntário, liga a candidatura a ele, gera as habilidades e grava o histórico
   na mesma transação. Um update solto aqui deixaria candidatura aprovada sem
   voluntário nenhum — e ninguém perceberia até a escala do mês. */
export async function decidir(id: string, status: StatusCand, nota?: string) {
  const { data, error } = await sb()!.rpc('decidir_candidatura', {
    p_id: id, p_status: status, p_nota: nota ?? null,
  });
  if (error) throw error;
  const r = data as any;
  if (!r?.ok) throw new Error(r?.erro || 'não consegui mudar o status');
  return r;
}

export type Painel = {
  voluntarios: number; funcoes: number; candidaturas_novas: number;
  aguardando_conversa: number; sem_conferir: number; sem_disponibilidade: number;
  vagas_pendentes: number; funcoes_sem_gente: number;
};
export async function painelDoMinisterio(equipeId: string): Promise<Painel | null> {
  const { data, error } = await sb()!.rpc('painel_ministerio', { p_equipe: equipeId });
  if (error) return null;
  return data as Painel;
}

/* O número como as pessoas escrevem, não como o banco guarda. Um telefone em
   dígitos corridos obriga quem lê a contar os números para saber se é o certo,
   e é justamente a linha que o líder confere antes de ligar. */
export function telefoneLegivel(t?: string | null) {
  const n = (t || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
  return t || '';
}

/* wa.me a partir do número guardado, nunca de literal na tela (§27) */
export function linkWhatsApp(telefone: string, texto: string) {
  const n = (telefone || '').replace(/\D/g, '');
  const com55 = n.length <= 11 ? '55' + n : n;
  return `https://wa.me/${com55}?text=${encodeURIComponent(texto)}`;
}
