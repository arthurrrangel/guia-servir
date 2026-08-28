'use client';
import { sb } from './supabase';

export type Equipe = { id: string; nome: string; slug: string; whatsapp_grupo: string | null; ordem: number };

function slugify(nome: string) {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'equipe';
}

export async function souLider(): Promise<boolean> {
  const s = sb(); if (!s) return false;
  const { data, error } = await s.rpc('sou_lider');
  if (error) throw error;
  return !!data;
}

export async function listarEquipes(): Promise<Equipe[]> {
  const { data, error } = await sb()!.from('equipes').select('*').order('ordem').order('nome');
  if (error) throw error;
  return (data || []) as Equipe[];
}

export async function criarEquipe(nome: string): Promise<Equipe> {
  const s = sb()!;
  const base = slugify(nome);
  // slug único: se colidir, sufixa com número
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const { data } = await s.from('equipes').select('id').eq('slug', slug).maybeSingle();
    if (!data) break;
    slug = `${base}-${i}`;
  }
  const { data: ord } = await s.from('equipes').select('ordem').order('ordem', { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await s.from('equipes')
    .insert({ nome: nome.trim(), slug, ordem: (ord?.ordem || 0) + 1 }).select('*').single();
  if (error) throw error;
  return data as Equipe;
}

export async function atualizarEquipe(id: string, campos: Partial<Equipe>) {
  const { error } = await sb()!.from('equipes').update(campos).eq('id', id);
  if (error) throw error;
}

export async function removerEquipe(id: string) {
  const { error } = await sb()!.from('equipes').delete().eq('id', id);
  if (error) throw error;
}

/* -------------------------------------------------------- A VISÃO DA IGREJA

   Três dos quatro organizadores da GUIA são admin da igreja inteira. Para
   saber se o domingo está coberto, eles precisavam trocar de equipe cinco
   vezes e somar de cabeça. `visao_geral()` (migração 35) responde por todas as
   equipes que a pessoa organiza numa consulta só, já filtrada por quem ela é.

   Quem organiza uma área só recebe uma linha, e a tela não mostra o bloco:
   painel de cinco para quem cuida de um não é visão geral, é ruído. */
export type AreaVisao = {
  slug: string; equipe: string; ordem: number;
  proxima_data: string | null; tipo: string | null;
  postos: number; preenchidos: number; confirmados: number;
  /* nulo = não há próximo culto marcado. Zero = há culto e está coberto.
     São estados diferentes e a tela diz coisas diferentes. */
  vagas: number | null;
  furos: number; recusados: number; pendentes: number;
  candidaturas_novas: number;
};

export async function visaoGeral(): Promise<AreaVisao[]> {
  const s = sb();
  if (!s) return [];
  const { data, error } = await s.rpc('visao_geral');
  if (error) return [];
  return (data || []) as AreaVisao[];
}
