'use client';
import { sb } from './supabase';
import { addDias, Estado, hojeISO, Nivel, Status } from './engine';
import { montarEstado, paraSalvarDia, linhasDaEquipe, DIAS_DE_HISTORICO } from './ponte';
import { planoDoDia, planoDoPlantao, type SlotDesejado, type LinhaAtual } from './escala-diff';

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
/* 17/09/2026: era a RPC `salvar_dia`, uma transação só. Ela regrava o dia
   inteiro por upsert, e o gatilho BEFORE INSERT `fn_indisponivel` recusava
   quem já estava na vaga e avisou "não posso" depois de escalado (o caso do
   João Victor em 20/09: nada no dia salvava). Agora o dia é salvo em partes,
   só o que mudou, direto nas tabelas (o RLS já valia na RPC, que era
   `security invoker`). O plano é puro e testado em lib/escala-diff.ts. Se uma
   parte falhar, a tela recarrega do banco e mostra o motivo; nada fica
   "meio salvo" sem a pessoa ver. */
export async function salvarDia(S: Estado, data: string, equipeId: string) {
  const s = sb()!;
  const p = paraSalvarDia(S, data, equipeId);
  if (!p) return;

  /* 1. o culto do dia (a data é única) */
  let cultoId: string | undefined;
  {
    const { data: c, error } = await s.from('cultos').select('id').eq('data', p.p_data).maybeSingle();
    if (error) throw error;
    cultoId = c?.id;
    if (!cultoId) {
      const { data: novo, error: e2 } = await s.from('cultos').insert({ data: p.p_data }).select('id').single();
      if (e2) {
        /* outro líder criou o mesmo dia neste instante: busca de novo */
        const { data: c2, error: e3 } = await s.from('cultos').select('id').eq('data', p.p_data).maybeSingle();
        if (e3 || !c2) throw e2;
        cultoId = c2.id;
      } else cultoId = novo.id;
    }
  }

  /* 2. o recado do dia deste ministério */
  {
    const { error } = await s.from('culto_obs')
      .upsert({ culto_id: cultoId, equipe_id: p.p_equipe, obs: p.p_obs }, { onConflict: 'culto_id,equipe_id' });
    if (error) throw error;
  }

  /* 3. as vagas: só o que mudou */
  const funcaoIds = S.funcoes.map(f => f.id!).filter(Boolean);
  {
    const { data: atuais, error } = await s.from('escalacoes')
      .select('id,funcao_id,voluntario_id,fixo,primeira_vez')
      .eq('culto_id', cultoId).in('funcao_id', funcaoIds);
    if (error) throw error;
    const plano = planoDoDia(p.p_slots as SlotDesejado[], (atuais || []) as LinhaAtual[]);
    if (plano.apagar.length) {
      const { error: e } = await s.from('escalacoes').delete().in('id', plano.apagar);
      if (e) throw e;
    }
    for (const a of plano.atualizar) {
      const { id, ...patch } = a;
      const { error: e } = await s.from('escalacoes').update(patch).eq('id', id);
      if (e) throw e;
    }
    if (plano.inserir.length) {
      const { error: e } = await s.from('escalacoes').insert(plano.inserir.map(x => ({
        culto_id: cultoId, funcao_id: x.funcao_id, voluntario_id: x.voluntario_id,
        status: x.status, fixo: x.fixo, primeira_vez: x.primeira_vez,
      })));
      if (e) throw e;
    }
  }

  /* 4. o plantão */
  {
    const meus = S.voluntarios.map(v => v.id);
    const { data: atuais, error } = meus.length
      ? await s.from('plantoes').select('voluntario_id').eq('culto_id', cultoId).in('voluntario_id', meus)
      : { data: [], error: null };
    if (error) throw error;
    const plano = planoDoPlantao(p.p_plantao, (atuais || []).map((r: any) => r.voluntario_id as string));
    if (plano.apagar.length) {
      const { error: e } = await s.from('plantoes').delete().eq('culto_id', cultoId).in('voluntario_id', plano.apagar);
      if (e) throw e;
    }
    if (plano.inserir.length) {
      const { error: e } = await s.from('plantoes').insert(plano.inserir.map(v => ({ culto_id: cultoId, voluntario_id: v })));
      if (e) throw e;
    }
  }

  S.escalas[data].cultoId = cultoId;
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
/* 18/09/2026: quem organiza nunca teve senha, entrava só pelo link do
   email. A senha é da conta de quem está logado (Supabase Auth), não de um
   ministério: por isso não passa por RLS nem por tabela nossa. Quem chegou
   pelo link de acesso pode criar a senha aqui mesmo, sem outro email. */
export async function definirMinhaSenha(senha: string) {
  const { error } = await sb()!.auth.updateUser({ password: senha });
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
