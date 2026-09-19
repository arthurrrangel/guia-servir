'use client';
/* A conversa do sistema de demandas com o banco.

   Uma função por RPC, e nada além disso: quem decide o que pode é o servidor,
   então aqui não há regra nenhuma escondida.

   ---------------------------------------------------------------------------
   POR QUE ESTE ARQUIVO IMPORTA O CLIENTE DO OUTRO SISTEMA

   `sb()` vem de `lib/supabase.ts`, que é do sistema de escalas. Isso parece
   contrariar a regra de não misturar, e é o contrário: criar um SEGUNDO
   `createClient` com sessão persistente na mesma origem põe dois clientes
   disputando a mesma chave de autenticação no localStorage, cada um
   renovando o token por conta própria. É assim que se derruba o login do
   líder — e derrubar o login do líder é exatamente o que não pode acontecer.

   Importar não muda uma linha daquele arquivo. E tem um efeito bom de graça:
   quem já está logado no GUIA Servir chega em /demandas já identificado.

   As tabelas continuam do outro lado de uma parede: elas moram no esquema
   `demandas`, que não é exposto na API, e a única porta são as funções
   `dem_*`, que conferem quem chama. Nenhuma linha daqui alcança uma tabela
   de escala, e nenhuma linha de lá alcança uma tabela de demanda.
   --------------------------------------------------------------------------- */

import { sb } from '@/lib/supabase';
import type { Bases, Eu, Membro, Numeros, Resumo, Vista } from './tipos';
import type { Acao, Rascunho } from './regras';

type Resposta<T> = ({ ok: true } & T) | { ok: false; erro: string; regra?: string };

async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<Resposta<T>> {
  const c = sb();
  if (!c) return { ok: false, erro: 'SEM_CONFIG' };
  const { data, error } = await c.rpc(nome, args);
  if (error) {
    /* erro de rede ou de permissão no próprio Postgres, não regra de negócio */
    return { ok: false, erro: 'REDE', regra: error.message };
  }
  return (data as Resposta<T>) ?? { ok: false, erro: 'VAZIO' };
}

/* ------------------------------------------------------------------ o link

   Duas portas, as mesmas do GUIA Servir: o link pessoal (token na URL) e o
   e-mail com senha, que aqui já vem pronto da sessão do líder.

   A chave do localStorage é `demandas.link`, separada de `escala.equipe` e
   `escala.credenciais` de propósito: um sistema não pode limpar o estado do
   outro nem por acidente. */

const K = 'demandas.link';

export function guardarToken(t: string) {
  try { localStorage.setItem(K, t); } catch {}
}

/* O TOKEN NÃO PODE FICAR NA BARRA DE ENDEREÇO.

   19/09/2026. O link pessoal do membro chega como `/demandas?t=<token>`, e
   este arquivo guardava o token e ia embora — deixando-o na barra, no
   histórico do navegador e, principalmente, no log de requisição da Vercel,
   que grava a URL inteira de cada acesso.

   A regra já estava escrita neste repositório, em app/api/cron/route.ts:
   "Query string não é lugar de credencial. (…) Um segredo que já apareceu
   numa URL deve ser considerado conhecido." Lá o `?secret=` foi removido; aqui
   o `?t=` tinha ficado.

   O `replaceState` tira o parâmetro assim que ele é guardado, sem recarregar
   a página e sem criar entrada nova no histórico. Não desfaz o que já foi
   registrado — para isso o token precisaria ser trocado —, mas fecha a porta
   a partir de agora, que é o que dá para fazer daqui.

   Um dia isto deve virar `/demandas/t/<token>`, que é o padrão que
   `/eu/[token]` já usa e que nunca põe o segredo em query string. Enquanto
   não vira, o link antigo continua funcionando e se limpa sozinho. */
export function meuToken(): string | null {
  if (typeof window === 'undefined') return null;
  const naUrl = new URLSearchParams(window.location.search).get('t');
  if (naUrl) {
    guardarToken(naUrl);
    try {
      const u = new URL(window.location.href);
      u.searchParams.delete('t');
      window.history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch { /* navegador sem history: o token fica na barra, mas funciona */ }
    return naUrl;
  }
  try { return localStorage.getItem(K); } catch { return null; }
}

export function esquecerToken() {
  try { localStorage.removeItem(K); } catch {}
}

const t = () => meuToken();

/* ------------------------------------------------------------------- RPCs */

export const quemSou = () =>
  rpc<Omit<Eu, 'ok'>>('dem_quem_sou', { p_token: t() });

export const bases = () =>
  rpc<Bases>('dem_bases', { p_token: t() });

export const abrir = (r: Rascunho, anexos: { nome: string; url: string }[] = []) =>
  rpc<{ numero: number; precisa_aprovacao: boolean; setor_responsavel: string;
        contato: { nome: string; telefone: string | null } | null }>('dem_abrir', {
    p_token: t(),
    p_d: {
      titulo: r.titulo, descricao: r.descricao, objetivo: r.objetivo,
      local: r.local, publico: r.publico,
      categoria_id: r.categoria_id, setor_solicitante: r.setor_solicitante || null,
      prioridade: r.prioridade, impacto: r.impacto,
      prazo: r.prazo || null, sem_prazo_porque: r.sem_prazo_porque,
      evento: r.evento, evento_data: r.evento_data || null,
      orcamento: r.orcamento || null,
      anexos,
    },
  });

export type Filtro = {
  aba?: 'tudo' | 'minhas' | 'setor' | 'comigo';
  status?: string; abertas?: boolean; atrasadas?: boolean;
  setor?: string; busca?: string;
};

export const lista = (f: Filtro = {}) =>
  rpc<{ itens: Resumo[] }>('dem_lista', { p_token: t(), p_f: f });

export const ver = (numero: number) =>
  rpc<Vista>('dem_ver', { p_token: t(), p_numero: numero });

export const mover = (numero: number, acao: Acao, dados: Record<string, unknown> = {}) =>
  rpc<Record<string, never>>('dem_mover', {
    p_token: t(), p_numero: numero, p_acao: acao, p_d: dados,
  });

export const numeros = (de?: string, ate?: string) =>
  rpc<{ numeros: Numeros }>('dem_numeros', { p_token: t(), p_de: de || null, p_ate: ate || null });

export const pessoas = () =>
  rpc<{ membros: Membro[] }>('dem_pessoas', { p_token: t() });

export const ajustar = (oQue: 'setor' | 'categoria' | 'membro', d: Record<string, unknown>) =>
  rpc<{ id: string }>('dem_ajustar', { p_token: t(), p_o_que: oQue, p_d: d });

/* NÃO EXISTE LOGIN AQUI, DE PROPÓSITO.

   Entrar, criar senha, trocar senha e sair já são resolvidos em /entrar, do
   sistema de escalas, na mesma sessão do Supabase. Reimplementar qualquer um
   desses aqui seria um segundo caminho mexendo na autenticação do líder — e
   um segundo caminho é uma segunda chance de quebrar o primeiro. */
