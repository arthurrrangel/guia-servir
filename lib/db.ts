'use client';
import { sb } from './supabase';
import { addDias, Estado, hojeISO, Nivel, Status } from './engine';
import { montarEstado, paraSalvarDia } from './ponte';

/* Ponte entre o banco e o objeto de estado que o motor entende.
   O motor nunca sabe que existe Supabase. */

export async function carregarEstado(equipeId: string, nomeEquipe = ''): Promise<Estado> {
  const s = sb();
  if (!s) throw new Error('sem conexão');
  /* Janela: o app só precisa do histórico recente (a carga olha no máximo
     180 dias para trás) e do futuro. Sem isso, cada troca de ministério
     puxava o histórico inteiro da igreja desde sempre. */
  const desde = addDias(hojeISO(), -200);
  const [funcoes, vols, cultos, cfg] = await Promise.all([
    s.from('funcoes').select('*').eq('equipe_id', equipeId).order('ordem'),
    /* colunas explícitas, não `*`: desde a migração 18 o `pin_hash` está fora
       do GRANT de `authenticated`, e `select *` num GRANT por coluna estoura
       com "permission denied for column" em vez de simplesmente omitir. */
    s.from('voluntarios')
      .select('id,nome,telefone,ativo,limite_mes,token,criado_em,equipe_id,conferido,email')
      .eq('equipe_id', equipeId).order('nome'),
    s.from('cultos').select('id,data').gte('data', desde).order('data'),
    s.from('config').select('*').eq('equipe_id', equipeId).maybeSingle(),
  ]);
  const e1 = [funcoes, vols, cultos].find(r => r.error);
  if (e1?.error) throw e1.error;

  const funcaoIds = (funcoes.data || []).map(f => f.id);
  const volIds = (vols.data || []).map(v => v.id);
  const cultoIds = (cultos.data || []).map(c => c.id);
  const vazio = Promise.resolve({ data: [] as any[] });
  // fase 2: linhas dependentes, filtradas para a equipe (nada vaza de outra)
  const [habs, indis, escs, plants, recados, disp] = await Promise.all([
    volIds.length ? s.from('habilidades').select('*').in('voluntario_id', volIds) : vazio,
    volIds.length ? s.from('indisponibilidades').select('*').in('voluntario_id', volIds) : vazio,
    funcaoIds.length ? s.from('escalacoes').select('*').in('funcao_id', funcaoIds) : vazio,
    volIds.length ? s.from('plantoes').select('*').in('voluntario_id', volIds) : vazio,
    cultoIds.length ? s.from('culto_obs').select('*').eq('equipe_id', equipeId).in('culto_id', cultoIds) : vazio,
    /* respostas de "posso": é o que o líder precisa ver para montar a escala.
       Sem isto o voluntário respondia e ninguém enxergava. */
    volIds.length ? s.from('disponibilidade').select('*').in('voluntario_id', volIds).gte('data', desde) : vazio,
  ]);
  return montarEstado({
    funcoes: funcoes.data || [], voluntarios: vols.data || [], habilidades: (habs as any).data || [],
    indisponibilidades: (indis as any).data || [], cultos: cultos.data || [],
    escalacoes: (escs as any).data || [], plantoes: (plants as any).data || [],
    recados: (recados as any).data || [], disponibilidades: (disp as any).data || [],
    config: cfg?.data || null, equipe: nomeEquipe,
  });
}

/* -------------------------------------------------------------- escrita --- */
export async function salvarDia(S: Estado, data: string, equipeId: string) {
  const s = sb()!;
  const params = paraSalvarDia(S, data, equipeId);
  if (!params) return;
  // uma transação só: ou grava o domingo inteiro, ou não mexe em nada
  const { data: cultoId, error } = await s.rpc('salvar_dia', params);
  if (error) throw error;
  S.escalas[data].cultoId = cultoId as string;
}

export async function salvarDias(S: Estado, datas: string[], equipeId: string) {
  for (const d of datas) await salvarDia(S, d, equipeId);
}

export async function mudarStatus(cultoId: string, funcaoId: string, status: Status) {
  const s = sb()!;
  const { error } = await s.from('escalacoes').update({ status, respondido_em: new Date().toISOString() })
    .eq('culto_id', cultoId).eq('funcao_id', funcaoId);
  if (error) throw error;
}

/* ---------------------------------------------------------- voluntários --- */
/* Antes isto eram DOIS inserts a partir do navegador: a pessoa e, depois, as
   habilidades dela. O segundo não olhava o erro, então quando ele falhava a
   pessoa nascia sem função nenhuma e a tela dizia que ela tinha entrado no
   time. Também não havia validação: o caminho público exige nome com
   sobrenome e telefone de 10 a 13 dígitos, o caminho do líder aceitava
   qualquer coisa.

   Agora é a RPC `criar_voluntario` (migração 32), que grava identidade,
   vínculo e habilidades numa transação só e valida no banco. Mesmo idioma do
   `salvar_dia`. O mapa nome→id deixou de ser necessário: a função casa a
   função pelo nome dentro do SQL. */
export async function criarVoluntario(
  equipeId: string, nome: string, tel: string, limite: number, funcoes: Record<string, Nivel>,
) {
  const { data, error } = await sb()!.rpc('criar_voluntario', {
    p_equipe: equipeId, p_nome: nome, p_tel: tel, p_limite: limite, p_funcoes: funcoes,
  });
  if (error) throw error;
  const r = data as { ok: boolean; erro?: string; id?: string };
  if (!r?.ok) throw new Error(RECADO[r?.erro || ''] || r?.erro || 'não deu para cadastrar');
  return r.id as string;
}

/* o banco fala em código; a tela fala com gente. */
const RECADO: Record<string, string> = {
  NOME_INCOMPLETO: 'Escreva nome e sobrenome',
  TELEFONE_INVALIDO: 'Telefone precisa ter DDD e número',
  JA_CADASTRADO: 'Esse telefone já está no time',
};

export async function atualizarVoluntario(id: string, campos: Record<string, any>) {
  const { error } = await sb()!.from('voluntarios').update(campos).eq('id', id);
  if (error) throw error;
}

export async function removerVoluntario(id: string) {
  const { error } = await sb()!.from('voluntarios').delete().eq('id', id);
  if (error) throw error;
}

/* Quando o LÍDER mexe no nível, ele está conferindo — por isso vai pela RPC,
   que grava confirmado = true. Nível que a pessoa declarou sozinha continua
   valendo como reserva até passar por aqui. */
export async function definirHabilidade(vid: string, funcaoId: string, nivel: Nivel | null) {
  const { error } = await sb()!.rpc('conferir_habilidade', {
    p_voluntario: vid, p_funcao: funcaoId, p_nivel: nivel,
  });
  if (error) throw error;
}

/* NOTA: nenhuma tela chama isto ainda. É o caminho para o líder registrar que
   alguém avisou por WhatsApp que não pode num domingo, e hoje esse aviso não
   tem onde ser guardado. Fica aqui, correto, esperando a tela da fase 5.
   Antes engolia o erro dos dois lados. */
export async function definirIndisponibilidade(vid: string, data: string, marcar: boolean) {
  const s = sb()!;
  const { error } = marcar
    ? await s.from('indisponibilidades').upsert({ voluntario_id: vid, data })
    : await s.from('indisponibilidades').delete().eq('voluntario_id', vid).eq('data', data);
  if (error) throw error;
}

export async function salvarConfig(equipeId: string, dados: any) {
  const { error } = await sb()!.from('config').upsert({ equipe_id: equipeId, dados }, { onConflict: 'equipe_id' });
  if (error) throw error;
}

/* Era um update ou insert por função, em série, e nenhum deles olhava o erro:
   cair no meio deixava a lista de postos da área pela metade e a tela dizia
   "Salvo". Agora é a RPC `salvar_funcoes` (migração 32): uma transação, e ela
   ainda recusa explicitamente função de outro ministério em vez de deixar a
   RLS fazer a linha sumir em silêncio. */
export async function salvarFuncoes(equipeId: string, funcoes: { id?: string; nome: string; simultanea: boolean; ordem: number; ativa: boolean }[]) {
  const { error } = await sb()!.rpc('salvar_funcoes', { p_equipe: equipeId, p_funcoes: funcoes });
  if (error) throw error;
}

export async function removerFuncao(id: string) {
  const { error } = await sb()!.from('funcoes').delete().eq('id', id);
  if (error) throw error;
}

/* -------------------------------------------------------------- líderes --- */
export type LinhaLider = { email: string; equipe_id: string | null };

/* equipe_id null = organiza todos os ministérios. Preenchido = só aquele.
   A mesma pessoa pode aparecer duas vezes, uma por ministério. */
export async function listarLideres(): Promise<LinhaLider[]> {
  const { data, error } = await sb()!.from('lideres').select('email,equipe_id').order('email');
  if (error) throw error;
  return (data || []) as LinhaLider[];
}
export async function addLider(email: string, equipeId: string | null) {
  const { error } = await sb()!.from('lideres')
    .insert({ email: email.trim().toLowerCase(), equipe_id: equipeId });
  if (error) throw error;
}
export async function removerLider(email: string, equipeId: string | null) {
  let q = sb()!.from('lideres').delete().eq('email', email);
  q = equipeId ? q.eq('equipe_id', equipeId) : q.is('equipe_id', null);
  const { error } = await q;
  if (error) throw error;
}
/* quem organiza TUDO é quem pode dar e tirar acesso */
export async function souOrganizadorGeral(): Promise<boolean> {
  const { data, error } = await sb()!.rpc('lidera_tudo');
  if (error) return false;
  return !!data;
}

/* o líder confere o nível que a pessoa declarou no auto-cadastro */
export async function conferirVoluntario(id: string) {
  const { error } = await sb()!.rpc('conferir_voluntario', { p_id: id });
  if (error) throw error;
}
