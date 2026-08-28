/* =============================================================================
   A IDENTIDADE, DO LADO DA TELA

   Uma pergunta só, uma resposta só: `quem_sou`. Vale para as duas portas.

   Antes disto, cada tela descobria com quem estava falando do seu próprio
   jeito: o painel lia a sessão do Supabase Auth e a lista de líderes, o
   espaço do voluntário lia a linha de `voluntarios` casada pelo token. Duas
   perguntas diferentes, duas respostas com formatos diferentes, e nenhuma das
   duas sabia da outra. Era por isso que o Jander, que organiza o Louvor e
   serve no Louvor, era duas pessoas para o sistema.

   Agora existe um lugar só que responde: quem é, o que organiza, onde serve.
   A tela deixa de perguntar "que tipo de usuário é este" e passa a perguntar
   "o que esta pessoa pode fazer" — que é a pergunta certa quando a mesma
   pessoa faz mais de uma coisa.

   O QUE ESTA CAMADA NÃO FAZ: decidir permissão. Ela mostra. Quem decide é o
   RLS, no banco, e continua decidindo mesmo que alguém mexa nisto aqui.
   ============================================================================= */
import { sbPublico } from './supabase';

export type Vinculo = {
  equipe: string; slug: string; artigo: string;
  ativo: boolean; conferido: boolean; tem_pin: boolean;
  /* true no vínculo cujo token a pessoa apresentou. Os outros vêm sem token,
     de propósito: um link vazado não pode virar chave de tudo. */
  este: boolean;
  funcoes: string[];
};

export type Identidade = {
  ok: boolean;
  erro?: string;
  conhecida?: boolean;
  pessoa?: { id: string; nome: string; primeiro_nome: string; email: string | null; telefone_final: string };
  admin?: boolean;
  organiza?: { equipe: string; slug: string }[];
  serve?: Vinculo[];
};

/** Quem chegou. Com token, é quem serve; sem token, é quem entrou por e-mail. */
export async function quemSou(token?: string | null): Promise<Identidade | null> {
  const s = sbPublico();
  if (!s) return null;
  const { data, error } = await s.rpc('quem_sou', { p_token: token ?? null });
  if (error) return null;
  return data as Identidade;
}

/* ------------------------------------------------- leituras da identidade

   Ficam aqui, e não espalhadas pelas telas, porque são a regra de negócio de
   "o que esta pessoa é". Espalhadas, cada tela inventaria a sua e elas
   divergiriam no primeiro ajuste. */

/** Organiza alguma coisa: admin da igreja ou líder de pelo menos uma equipe. */
export const organiza = (i?: Identidade | null) =>
  !!i?.admin || (i?.organiza?.length ?? 0) > 0;

/** Serve em pelo menos uma área. */
export const serve = (i?: Identidade | null) => (i?.serve?.length ?? 0) > 0;

/** Faz as duas coisas. É o caso que o sistema tratava como duas pessoas. */
export const dupla = (i?: Identidade | null) => organiza(i) && serve(i);

/** As áreas em que serve, fora aquela de onde veio o link. */
export const outrasAreas = (i?: Identidade | null) => (i?.serve ?? []).filter(v => !v.este);

/** Como chamar a pessoa numa frase, sem soar como formulário. */
export const comoChamar = (i?: Identidade | null) => i?.pessoa?.primeiro_nome || '';

/** Uma linha honesta sobre o papel, para a tela não precisar montar a frase.
    Ordem importa: o mais amplo primeiro, porque é o que define o acesso. */
export function papelEmPalavras(i?: Identidade | null): string {
  if (!i?.ok || !i.conhecida) return '';
  const partes: string[] = [];
  if (i.admin) partes.push('organiza a igreja toda');
  else if (i.organiza?.length) {
    const nomes = i.organiza.map(o => o.equipe);
    partes.push(`organiza ${nomes.length === 1 ? nomes[0] : nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1]}`);
  }
  if (i.serve?.length) {
    const nomes = i.serve.map(v => v.equipe);
    partes.push(`serve ${nomes.length === 1 ? `${i.serve[0].artigo === 'a' ? 'na' : 'no'} ${nomes[0]}` : 'em ' + nomes.join(', ')}`);
  }
  return partes.join(' e ');
}
