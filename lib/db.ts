'use client';
import { sb } from './supabase';
import { addDias, Estado, hojeISO, Nivel, Status } from './engine';
import { montarEstado, paraSalvarDia, linhasDaEquipe, DIAS_DE_HISTORICO } from './ponte';

/* Ponte entre o banco e o objeto de estado que o motor entende.
   O motor nunca sabe que existe Supabase. */

export async function carregarEstado(equipeId: string, nomeEquipe = ''): Promise<Estado> {
  const s = sb();
  if (!s) throw new Error('sem conexão');
  /* A consulta mora em ponte.ts, junto do cron. Ver o cabeçalho de
     `linhasDaEquipe`: esta busca já existiu em duplicata e as duas cópias
     divergiram em silêncio. */
  const desde = addDias(hojeISO(), DIAS_DE_HISTORICO);
  return montarEstado(await linhasDaEquipe(s, equipeId, desde, nomeEquipe));
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
