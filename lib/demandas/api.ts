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
import type { AvisoDentro, Bases, Cadastro, Eu, FichaPessoa, Membro, Numeros, Portal, Resumo, Vista } from './tipos';
import type { Acao, Rascunho } from './regras';

type Resposta<T> = ({ ok: true } & T) | { ok: false; erro: string; regra?: string; codigo?: string };

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
/* A LISTA CRESCE JUNTO COM `rpcCom`, E ELA JÁ TINHA FICADO PARA TRÁS.

   22/09/2026. Esta lista nasceu com os quatro erros que `rpcCom` produzia
   quando ela foi escrita. Depois `rpcCom` ganhou `SEM_PERMISSAO_DB` (42501) e
   agora `VINCULO_EM_USO` (23503) — os dois saídos de `REDE`, que ESTÁ na
   lista. Ou seja: dar nome próprio ao erro de infraestrutura, sem tocar aqui,
   transformava falha de grant em "esse token não é de ninguém" e QUEIMAVA o
   link da pessoa. O link só existe na mensagem do WhatsApp.

   Nenhum dos dois é recusa de IDENTIDADE: 42501 é permissão faltando no
   Postgres e 23503 é vínculo de dado. Escrito como lista nomeada para a
   próxima chave nova ser posta aqui junto. */
const NAO_E_IDENTIDADE = ['REDE', 'SEM_SISTEMA', 'SEM_CONFIG', 'VAZIO',
                          'SEM_PERMISSAO_DB', 'VINCULO_EM_USO'];

export const ehRecusaDeIdentidade = (r: { ok: boolean; erro?: string }) =>
  !r.ok && !NAO_E_IDENTIDADE.includes(r.erro || '');

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
    if (ehSemSistema(error)) return { ok: false, erro: 'SEM_SISTEMA', regra: error.message, codigo: error.code };
    /* erro de rede ou de permissão no próprio Postgres, não regra de negócio.

       O `codigo` VIAJA JUNTO — 21/09/2026.

       Guardar só `error.message` jogava fora `error.code`, e com isso o ramo
       `codigo === 'P0001'` de `lib/erros.ts:289` nunca disparava do lado das
       demandas. Uma frase em português que nós mesmos escrevemos num `raise
       exception` era trocada pela genérica de quatro palavras. É exatamente o
       defeito que `lib/erros.ts:31-50` conta ter matado em 16/09 do lado das
       escalas, de volta inteiro do lado de cá. */
    /* 42501 TEM NOME PRÓPRIO, E SEM ELE A FRASE DAS ESCALAS VAZAVA — 22/09/2026.

       `SEM_PERMISSAO_DB` foi escrita em `regras.ts` justamente para impedir
       que um 42501 do Postgres caísse na tabela das ESCALAS e respondesse
       "Você não tem permissão para isso neste MINISTÉRIO" dentro do sistema
       de Demandas. Só que nada nunca produzia esse código: aqui todo 42501
       virava `REDE`, `PORBANCO['REDE']` não existe, e a tradução ia parar em
       `humano()` — exatamente na frase que a chave existia para bloquear.

       Uma chave morta que dá a impressão de cobrir um buraco é pior do que
       não ter chave nenhuma, porque ninguém volta a olhar. */
    if (error.code === '42501') {
      return { ok: false, erro: 'SEM_PERMISSAO_DB', regra: error.message, codigo: error.code };
    }
    /* E O 23503 ERA A MESMA CHAVE MORTA, UM CÓDIGO ADIANTE — 22/09/2026.

       O comentário acima conta que uma chave sem ninguém a produzindo é pior
       que chave nenhuma. A linha do 42501 nasceu e o 23503 ficou de fora, e
       ele é a violação de chave estrangeira: cai aqui quando `dem_ajustar`
       tenta apagar setor, categoria ou pessoa que já tem demanda pendurada.

       Virando `REDE`, a tradução ia parar em `PORCODIGO['23503']` de
       `lib/erros.ts:210`, que responde, dentro do sistema de Demandas:

         "Não dá para fazer isso enquanto houver ESCALA ou cadastro ligado a
          este item."

       O mesmo vazamento que a linha de cima existe para fechar, pela porta do
       lado. `VINCULO_EM_USO` diz a mesma coisa no vocabulário daqui. */
    if (error.code === '23503') {
      return { ok: false, erro: 'VINCULO_EM_USO', regra: error.message, codigo: error.code };
    }
    return { ok: false, erro: 'REDE', regra: error.message, codigo: error.code };
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

/* O AVISO SAI DEPOIS QUE A DEMANDA JA EXISTE, E NUNCA SEGURA A TELA.

   `void` e `catch` vazio de propósito, e esta é a única vez neste arquivo em
   que engolir a falha é o certo: a demanda JÁ ESTÁ NO BANCO quando isto roda.
   Se o aviso falhar, quem abriu não pode ver um erro vermelho sobre uma coisa
   que deu certo — e o aviso não se perde, porque o carimbo é do banco e a
   varredura do cron pega o que ficou para trás (migração 90).

   Sem `await` pelo mesmo motivo: o Resend leva de 200 ms a 15 s, e ninguém
   deve olhar "Enviando…" esperando o servidor de e-mail de terceiro. */
/* E QUEM CHAMAVA ERA SÓ O `abrir`, 22/09/2026.

   A regra 10 do documento é "o solicitante deve receber notificações QUANDO
   HOUVER mudança de status ou necessidade de informação". Medido, as duas
   metades dela estavam no banco e nenhuma saía na hora:

     · `fn_enfileirar_aviso` (91:258) enfileira na hora, em `after update`,
       tanto o `status` quanto o `informacao`;
     · quem ESVAZIA a fila eram duas coisas, e só duas: esta função, chamada
       depois de `abrir()`, e o cron `0 11 * * *` do `vercel.json`.

   `mover()` não chamava. Ou seja: a trava por falta de informação, que é o
   único caso em que a demanda PARA até quem pediu responder e ele não tem
   como saber disso sem abrir o sistema por conta própria, ficava até 24
   horas na fila esperando o robô da manhã seguinte.

   O cabeçalho de `app/api/demandas/avisar/route.ts` já tinha escrito a regra
   inteira ("um aviso que chega 23 horas depois nao e aviso, e arquivo") e
   aplicado só à abertura. O conserto é a outra ponta da mesma frase: toda
   resposta `ok` de `dem_mover` esvazia a fila, igual à abertura.

   Custa o mesmo nada: é `void fetch` com `keepalive`, não segura a tela, não
   mostra erro, e a varredura é idempotente porque quem reserva as linhas é o
   banco (`public.dem_avisos_pendentes`). Mover uma demanda que não gerou
   aviso nenhum manda uma requisição que volta "0". */
function avisarEmSegundoPlano() {
  try {
    const tok = t();
    if (!tok) return;
    void fetch('/api/demandas/avisar', {
      method: 'POST',
      /* o token vai no CABEÇALHO, nunca na URL: URL entra em log de servidor,
         em Referer e no histórico do navegador, e este token é uma senha */
      headers: { 'x-demandas-token': tok },
      keepalive: true,
    }).catch(() => {});
  } catch { /* nada aqui pode derrubar a abertura da demanda */ }
}

export const abrir = async (r: Rascunho, anexos: { nome: string; url: string }[] = []) => {
  const resposta = await rpc<{ numero: number; precisa_aprovacao: boolean; setor_responsavel: string;
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
  if (resposta.ok) avisarEmSegundoPlano();
  return resposta;
};

/* 94 · os recortes dos dois portais. Todos são filtros DENTRO do que a
   pessoa pode ver: pedir `ministerio` sem ser líder devolve lista vazia, e
   não a lista dos outros. Quem decide é `dem_lista`, não esta linha. */
export type Aba = 'tudo' | 'minhas' | 'setor' | 'comigo' | 'participo' | 'ministerio' | 'responder' | 'agir';
export type Filtro = {
  aba?: Aba;
  status?: string; abertas?: boolean; atrasadas?: boolean; urgentes?: boolean;
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

export const mover = async (numero: number, acao: Acao, dados: Record<string, unknown> = {}) => {
  const resposta = await rpc<Record<string, never>>('dem_mover', {
    p_token: t(), p_numero: numero, p_acao: acao, p_d: dados,
  });
  /* a mesma linha que `abrir()` tem, pelo motivo que o comentário de
     `avisarEmSegundoPlano` conta. Só quando a resposta é `ok`: recusa do
     servidor não gerou evento nenhum, e chamar a varredura ali seria pedir
     e-mail sobre uma coisa que não aconteceu. */
  if (resposta.ok) avisarEmSegundoPlano();
  return resposta;
};

export const numeros = (de?: string, ate?: string) =>
  rpc<{ numeros: Numeros }>('dem_numeros', { p_token: t(), p_de: de || null, p_ate: ate || null });

export const pessoas = () =>
  rpc<{ membros: Membro[] }>('dem_pessoas', { p_token: t() });

export const pessoa = (id: string) =>
  rpc<FichaPessoa>('dem_pessoa', { p_token: t(), p_id: id });

export const ajustar = (oQue: 'setor' | 'categoria' | 'membro' | 'pedido' | 'link', d: Record<string, unknown>) =>
  rpc<{ id: string; quem?: { id: string; nome: string; setor: string | null; ativo: boolean }[] }>(
    'dem_ajustar', { p_token: t(), p_o_que: oQue, p_d: d });

/* ------------------------------------------------ migração 94: os portais */

export const portal = () =>
  rpc<Portal>('dem_portal', { p_token: t() });

/* `marcar` diz ao servidor que a pessoa ABRIU os avisos: o contador da casca
   volta a zero dali em diante. Só a tela de avisos marca. */
export const avisos = (marcar = false) =>
  rpc<{ itens: AvisoDentro[]; novos: number; vistos_em: string }>(
    'dem_avisos', { p_token: t(), p_marcar: marcar });

export const perfil = (d: { nome?: string; telefone?: string; funcao?: string; papel_pedido?: string }) =>
  rpc<Omit<Eu, 'ok'>>('dem_perfil', { p_token: t(), p_d: d });

/* O CADASTRO NÃO MANDA TOKEN, DE PROPÓSITO.

   Quem tem link pessoal já está cadastrado. A identidade aqui é a sessão do
   login por e-mail, que o Supabase só abre depois de a pessoa tocar no link
   que chegou na caixa dela: é o e-mail confirmado que vira a pessoa. As duas
   funções do banco nem aceitam `p_token`. */
export const cadastro = () =>
  rpc<Cadastro>('dem_cadastro', {});

export const cadastrar = (d: { nome: string; telefone: string; setor_id: string;
                               funcao?: string; papel_pedido?: string }) =>
  rpc<Omit<Eu, 'ok'> & { novo?: boolean }>('dem_cadastrar', { p_d: d });

/* NÃO EXISTE LOGIN AQUI, DE PROPÓSITO.

   Entrar, criar senha, trocar senha e sair já são resolvidos em /entrar, do
   sistema de escalas, na mesma sessão do Supabase. Reimplementar qualquer um
   desses aqui seria um segundo caminho mexendo na autenticação do líder — e
   um segundo caminho é uma segunda chance de quebrar o primeiro. */
