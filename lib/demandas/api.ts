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

/* "A FUNÇÃO NÃO EXISTE" NÃO É "VOCÊ NÃO ESTÁ CADASTRADO" — 20/09/2026.

   Medido em produção, logado como o dono do sistema: `/demandas` mostrava

     "Você não está no sistema de demandas. Você está logado como <e-mail>,
      mas esse e-mail ainda não foi cadastrado aqui. Quem administra o
      sistema de demandas cadastra em Ajustes, e leva um minuto."

   E não havia cadastro nenhum a fazer: o schema `demandas` NÃO EXISTE naquele
   banco. A migração 50 nunca foi aplicada lá. O PostgREST responde PGRST202
   ("Could not find the function"), este ajudante transformava isso num
   `REDE` genérico, e a casca lê qualquer negativa como "não é membro".

   O estrago não é o texto: é o que ele manda a pessoa fazer. Ela vai para
   Ajustes procurar um cadastro impossível, e a aba Ajustes só aparece para
   quem já é admin — que ela não é, porque a tabela de membros não existe.
   Beco sem saída, com placa apontando para dentro.

   Sistema que não está instalado tem que dizer que não está instalado. */
export const ehSemSistema = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST202' ||
  /could not find the function|schema "?demandas"? does not exist/i.test(e.message || '');

/* QUANDO DESCARTAR O LINK GUARDADO, E SÓ QUANDO.

   A casca descarta o token quando a resposta é negativa, para um link velho
   não sombrear o login por e-mail. Isso vale para recusa de IDENTIDADE
   ("esse token não é de ninguém"), e não para falha de infraestrutura.

   Quem entra pelo link do WhatsApp e cai num 5xx passageiro perderia o link,
   e ele só existe naquela mensagem: é perda de acesso por um erro que ia
   passar em três segundos. Mora aqui, e não na casca, porque a pergunta é
   sobre o CÓDIGO da resposta — assunto deste arquivo. */
export const ehRecusaDeIdentidade = (r: { ok: boolean; erro?: string }) =>
  !r.ok && r.erro !== 'REDE' && r.erro !== 'SEM_SISTEMA' && r.erro !== 'SEM_CONFIG'
       && r.erro !== 'VAZIO';

/* O CLIENTE ENTRA POR PARÂMETRO PARA O TESTE PODER SEGURAR ESTE CAMINHO.

   20/09/2026. Escrevi `ehSemSistema` e um teste para ele, e o teste ficou
   VERDE depois de eu apagar a linha que o chama aqui dentro. Ele media os
   predicados, não a tradução — a mesma armadilha que `cron-guarda.test.mjs`
   já tinha pago neste repositório, cometida de novo no mesmo dia em que eu
   escrevi o arquivo que conta essa história.

   Com o cliente injetável, o teste entrega um dublê que devolve PGRST202 e
   cobra o RESULTADO (`erro === 'SEM_SISTEMA'`). Apagar a linha passa a
   reprovar, que é o mínimo que se pede de um teste. */
export async function rpcCom<T>(
  c: { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: any }> } | null,
  nome: string, args: Record<string, unknown>,
): Promise<Resposta<T>> {
  if (!c) return { ok: false, erro: 'SEM_CONFIG' };
  const { data, error } = await c.rpc(nome, args);
  if (error) {
    if (ehSemSistema(error)) return { ok: false, erro: 'SEM_SISTEMA', regra: error.message };
    /* erro de rede ou de permissão no próprio Postgres, não regra de negócio */
    return { ok: false, erro: 'REDE', regra: error.message };
  }
  return (data as Resposta<T>) ?? { ok: false, erro: 'VAZIO' };
}

const rpc = <T>(nome: string, args: Record<string, unknown>) =>
  rpcCom<T>(sb() as any, nome, args);

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

/* `total` e `tem_mais` chegam desde a migração 57, que pôs teto de 300 na
   `dem_lista`. Sem teto, a aba "Tudo" com 20 mil demandas media 10 MB de
   JSON; com teto e SEM aviso, a lista passaria a mentir em silêncio, que é
   exatamente a classe de defeito que este repositório mais paga caro. A tela
   diz quantas ficaram de fora e o que fazer (filtrar, ou buscar pelo número).

   Os dois campos são opcionais no tipo porque um banco que ainda não recebeu
   a 56 não os manda, e a tela precisa continuar de pé nessa janela. */
export const lista = (f: Filtro = {}) =>
  rpc<{ itens: Resumo[]; total?: number; tem_mais?: boolean; limite?: number }>(
    'dem_lista', { p_token: t(), p_f: f });

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
