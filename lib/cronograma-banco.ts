'use client';
/* =============================================================================
   O CRONOGRAMA DO CULTO, NO BANCO — 109, 03/10/2026

   As portas da migração 109, uma função por porta. Quem lidera fala pelo
   cliente com sessão (`sb`); a folha pública e o dirigente falam pelo
   cliente sem sessão (`sbPublico`), e a autorização é o token na URL.

   Sem a 109 no banco, toda porta responde PGRST202 (função que não existe).
   Quem chama pergunta `semCronogramaNoBanco(erro)` e esconde o cronograma
   em vez de mostrar erro: o código sobe antes de o Arthur rodar a migração.
   ============================================================================= */
import { sb, sbPublico } from './supabase';
import { type Autoria, type Bloco, type Folha, folhaDoBanco } from './cronograma';

export type FolhaDoLider = { folha: Folha; podeEditar: boolean; admin: boolean };
export type Registrado = { data: string; tipo: 'domingo' | 'follow'; tema: string | null; quem: string | null; ceia: boolean };
export type RespostaDoBloco =
  | { ok: true; valor: unknown; linhaPropria: boolean | null; autoria: Autoria | null }
  | { ok: false; erro: string; atual?: unknown };

/** erro de negócio (ok:false) vira exceção com o código em `erroDoBanco` */
function recusa(r: any): Error & { erroDoBanco?: string } {
  return Object.assign(new Error(String(r?.erro || 'ERRO')), { erroDoBanco: String(r?.erro || 'ERRO') });
}

export async function cronogramaDoDia(data: string): Promise<FolhaDoLider> {
  const { data: r, error } = await sb()!.rpc('cronograma_do_dia', { p_data: data });
  if (error) throw error;
  if (!(r as any)?.ok) throw recusa(r);
  const folha = folhaDoBanco(r);
  if (!folha) throw new Error('FOLHA_INVALIDA');
  return { folha, podeEditar: (r as any).pode_editar === true, admin: (r as any).admin === true };
}

/** até 20 datas de uma vez, cada uma a folha inteira */
export async function cronogramasDasDatas(datas: string[]): Promise<Folha[]> {
  const { data: r, error } = await sb()!.rpc('cronogramas_das_datas', { p_datas: datas.slice(0, 20) });
  if (error) throw error;
  if (!(r as any)?.ok) throw recusa(r);
  return ((r as any).cultos || []).map(folhaDoBanco).filter(Boolean) as Folha[];
}

/** os cultos que já têm cronograma gravado, antes de `antes`, do mais novo */
export async function cronogramasRegistrados(antes: string, limite = 60): Promise<Registrado[]> {
  const { data: r, error } = await sb()!.rpc('cronogramas_registrados', { p_antes: antes, p_limite: limite });
  if (error) throw error;
  if (!(r as any)?.ok) throw recusa(r);
  return ((r as any).cultos || []).map((x: any) => ({
    data: String(x.data), tipo: x.tipo === 'follow' ? 'follow' : 'domingo',
    tema: typeof x.tema === 'string' ? x.tema : null, quem: typeof x.quem === 'string' ? x.quem : null,
    ceia: x.ceia === true,
  }));
}

function respostaDoBloco(r: any): RespostaDoBloco {
  if (r?.ok) {
    const a = r.autoria;
    return {
      ok: true, valor: r.valor ?? null,
      linhaPropria: typeof r.linha_propria === 'boolean' ? r.linha_propria : null,
      autoria: a && typeof a.por === 'string' && typeof a.em === 'string'
        ? { por: a.por, em: a.em, via: a.via === 'dirigente' ? 'dirigente' : 'lider' } : null,
    };
  }
  return { ok: false, erro: String(r?.erro || 'ERRO'), atual: r?.atual ?? null };
}

/** Grava UM bloco. `antes` é o que a tela leu (se alguém gravou no meio,
 *  volta MUDOU com o que está lá). `modelo`: os horários viram o modelo do
 *  tipo de culto ("usar nos próximos"). */
export async function salvarBloco(data: string, bloco: Bloco, valor: unknown, antes: unknown, modelo = false): Promise<RespostaDoBloco> {
  const { data: r, error } = await sb()!.rpc('cronograma_salvar', {
    p_data: data, p_bloco: bloco, p_valor: valor ?? null, p_antes: antes ?? null, p_modelo: modelo,
  });
  if (error) throw error;
  return respostaDoBloco(r);
}

/** O token da folha pública (o culto e o cronograma nascem se preciso). */
export async function linkDoCronograma(data: string): Promise<string> {
  const { data: r, error } = await sb()!.rpc('cronograma_link', { p_data: data });
  if (error) throw error;
  if (!(r as any)?.ok || typeof (r as any).token !== 'string') throw recusa(r);
  return (r as any).token;
}

/* ------------------------------------------------- sem login (pelo link) -- */
export async function folhaPublica(token: string): Promise<{ ok: true; folha: Folha } | { ok: false; erro: string }> {
  const { data: r, error } = await sbPublico()!.rpc('cronograma_publico', { p_token: token });
  if (error) throw error;
  if (!(r as any)?.ok) return { ok: false, erro: String((r as any)?.erro || 'LINK_INVALIDO') };
  const folha = folhaDoBanco(r);
  return folha ? { ok: true, folha } : { ok: false, erro: 'LINK_INVALIDO' };
}

/** os cultos dos próximos 21 dias em que o dono do link é o dirigente */
export async function euCronogramas(token: string): Promise<Folha[]> {
  const { data: r, error } = await sbPublico()!.rpc('eu_cronogramas', { p_token: token });
  if (error) throw error;
  if (!(r as any)?.ok) throw recusa(r);
  return ((r as any).cultos || []).map(folhaDoBanco).filter(Boolean) as Folha[];
}

export async function euSalvarBloco(token: string, data: string, bloco: 'palavra' | 'avisos', valor: unknown, antes: unknown): Promise<RespostaDoBloco> {
  const { data: r, error } = await sbPublico()!.rpc('eu_cronograma_salvar', {
    p_token: token, p_data: data, p_bloco: bloco, p_valor: valor ?? null, p_antes: antes ?? null,
  });
  if (error) throw error;
  return respostaDoBloco(r);
}
