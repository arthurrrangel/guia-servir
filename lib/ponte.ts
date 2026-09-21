/* Ponte pura entre as linhas do banco e o Estado do motor.
   SEM 'use client': roda no navegador (db.ts) e no servidor (cron). */
/* Os TIPOS vêm em `import type` separado dos VALORES. Não é estilo: sem
   isso, o Node de linha de comando (que só apaga os tipos, não os resolve)
   tenta importar `Estado` como valor em tempo de execução e o módulo nem
   carrega — foi o que impediu de testar este arquivo. */
import { CONFIG_PADRAO, estadoVazio, garantirDia } from './engine';
import type { Estado, Nivel, Status } from './engine';

/* =============================================================================
   AS LINHAS DO BANCO, COM TIPO — 20/09/2026.

   Este bloco era `any[]` em todos os nove campos. Entre o `select` e o
   `montarEstado` não havia tipo nenhum: trocar `f.simultanea` por
   `f.simultânea` compilava, e a escala quebrava em produção. O compilador
   existe e estava desligado justo na fronteira onde os nomes vêm de fora.

   O QUE ESTÁ ESCRITO AQUI SAIU DO CATÁLOGO, não de memória: o banco foi
   reconstruído do repositório (`bash scripts/banco-do-zero.sh`) e
   `information_schema.columns` respondeu nome, tipo e nulabilidade de cada
   coluna. Onde o tipo diz `| null`, o banco diz `is_nullable = YES`.

   As colunas OPCIONAIS aparecem com `?` porque a degradação deste arquivo
   pode não trazê-las: quando o banco recusa uma coluna nova por falta de
   GRANT, a consulta é refeita sem ela e a linha chega sem o campo. Ver a nota
   do apagão de 18/09, mais abaixo. `montarEstado` já trata cada uma dessas
   ausências, e agora o compilador cobra que continue tratando.

   Só entram as colunas que a carga PEDE. `voluntarios` tem treze colunas no
   banco e a consulta pede oito; pôr as cinco restantes aqui faria o tipo
   prometer dado que não chega. */

export type LinhaFuncao = {
  id: string; nome: string; simultanea: boolean; ordem: number;
  ativa: boolean; equipe_id: string; tipos: string[];
  relata?: boolean;                    // opcional na carga (degradação)
  exige_sexo?: string | null;          // idem, e nulável no banco
};
export type LinhaVoluntario = {
  id: string; nome: string; telefone: string | null; ativo: boolean;
  /* null = SEGUE o limitePadrao da equipe, que é a regra da migração 11.
     `is_nullable = YES` no banco, e o motor trata null e 0 como coisas
     diferentes desde 20/09. */
  limite_mes: number | null;
  token: string; equipe_id: string; conferido: boolean;
  sexo?: string | null;                // opcional na carga (degradação)
};
export type LinhaHabilidade = {
  voluntario_id: string; funcao_id: string; nivel: Nivel; confirmado: boolean;
};
export type LinhaIndisponibilidade = { voluntario_id: string; data: string };
export type LinhaDisponibilidade = {
  voluntario_id: string; data: string; pode: boolean;
  /* NOT NULL no banco (a coluna nasce com default). `montarEstado` não lê,
     mas ela vem junto no `select('*')` desta consulta. */
  respondido_em: string;
};
export type LinhaCulto = {
  id: string; data: string;
  evento?: string | null;              // as três da 54: somem na degradação
  equipe_id?: string | null;
  inicio?: string | null;
};
export type LinhaEscalacao = {
  id: string; culto_id: string; funcao_id: string;
  voluntario_id: string | null;        // vaga aberta é linha com voluntário nulo
  status: Status; fixo: boolean; primeira_vez: boolean;
  respondido_em: string | null; escalado_em: string | null;
};
export type LinhaPlantao = { culto_id: string; voluntario_id: string };
export type LinhaRecado = {
  culto_id: string; equipe_id: string; obs: string;
  relatorio: string | null; problemas: string | null;
  relatado_por: string | null; relatado_em: string | null;
};
export type LinhaConfig = { id?: number | null; dados: Record<string, any>; equipe_id: string | null };

export type LinhasDoBanco = {
  funcoes: LinhaFuncao[]; voluntarios: LinhaVoluntario[];
  habilidades: LinhaHabilidade[]; indisponibilidades: LinhaIndisponibilidade[];
  cultos: LinhaCulto[]; escalacoes: LinhaEscalacao[]; plantoes: LinhaPlantao[];
  config: LinhaConfig | null;
  /* recado do domingo POR EQUIPE (culto_obs). Sem isso, o recado de um
     ministério aparecia no aviso do outro e um sobrescrevia o do outro. */
  recados?: LinhaRecado[];
  /* respostas de "posso" por domingo (tabela disponibilidade) */
  disponibilidades?: LinhaDisponibilidade[];
  equipe?: string;
};

export function montarEstado(l: LinhasDoBanco): Estado {
  const S = estadoVazio();
  /* líder de verdade sempre lê a linha de config; quem logou sem estar na
     allowlist recebe null (RLS) — o Shell usa isso para mostrar "sem acesso" */
  S.temAcesso = !!l.config;
  S.equipe = l.equipe || '';
  S.config = { ...CONFIG_PADRAO, ...(l.config?.dados || {}) };
  S.funcoes = (l.funcoes || []).map(f => ({
    id: f.id, nome: f.nome, simultanea: f.simultanea, ordem: f.ordem, ativa: f.ativa,
    /* Em que tipo de culto esta área existe. Linha antiga (sem a coluna) vale
       para os dois: só quem foi marcado explicitamente fica de fora do Follow.

       19/09/2026 — POR QUE ISTO FILTRA EM VEZ DE REPASSAR.

       `cultos.tipo` é coluna gerada e só produz 'domingo' ou 'follow'. Uma
       palavra fora dessas duas no array não casa com nada, e o posto some da
       escala EM SILÊNCIO — `vagasDe` não o lista, `resumoDia` não o conta, e
       o dia fecha "9 de 9" sem ele existir.

       Não é hipótese: a migração 18 achou 'evento' no Louvor e tirou; a 29
       pôs 'culto' e o GUIA Kids INTEIRO (9 postos), a Livraria (2) e quatro
       postos do Connect passaram meses sem aparecer em domingo nenhum. A 53
       consertou as linhas e pôs um CHECK para a palavra inventada não entrar
       de novo.

       Aqui é a segunda tranca, para o caso de a carga vir de um banco que
       ainda não recebeu a 53. A escolha do fallback é deliberada: se sobrar
       NADA de conhecido, o posto vale para os dois tipos — ou seja, ele
       APARECE. Posto aparecendo onde não devia alguém percebe e reclama;
       posto que nunca aparece ninguém percebe nunca. Entre errar para o lado
       visível e errar para o lado invisível, este arquivo erra para o
       visível. */
    tipos: (() => {
      const conhecidos = (Array.isArray(f.tipos) ? f.tipos : []).filter(
        (t: unknown) => t === 'domingo' || t === 'follow',
      );
      if (conhecidos.length) return conhecidos;
      if (Array.isArray(f.tipos) && f.tipos.length && typeof console !== 'undefined') {
        console.warn('[ponte] o posto', f.nome, 'tem tipos', f.tipos,
          '— nenhum deles existe. Vale para domingo e follow para NÃO sumir da escala. Falta a migração 53.');
      }
      return ['domingo', 'follow'];
    })(),
    /* posto que preenche o relatório do dia (líder escalado do Serviço) */
    relata: !!f.relata,
    /* a regra do prédio: 'M', 'F' ou nada. Coluna nova, então linha antiga
       vem sem ela e vale como "qualquer pessoa", que é o que era antes. */
    exigeSexo: f.exige_sexo === 'M' || f.exige_sexo === 'F' ? f.exige_sexo : undefined,
  }));

  const nomeFuncao = new Map<string, string>((l.funcoes || []).map(f => [f.id, f.nome]));
  const habPorVol = new Map<string, Record<string, Nivel>>();
  /* nível declarado no auto-cadastro x nível que alguém do time conferiu.
     Linha antiga (sem a coluna) vale como conferida: foi o líder que criou. */
  const okPorVol = new Map<string, Record<string, boolean>>();
  for (const h of l.habilidades || []) {
    const fn = nomeFuncao.get(h.funcao_id);
    if (!fn) continue;
    const m = habPorVol.get(h.voluntario_id) || {};
    m[fn] = h.nivel; habPorVol.set(h.voluntario_id, m);
    const c = okPorVol.get(h.voluntario_id) || {};
    c[fn] = h.confirmado !== false; okPorVol.set(h.voluntario_id, c);
  }
  const indisPorVol = new Map<string, string[]>();
  for (const i of l.indisponibilidades || []) {
    const arr = indisPorVol.get(i.voluntario_id) || [];
    arr.push(i.data); indisPorVol.set(i.voluntario_id, arr);
  }
  /* quem respondeu "posso". Só conta pode=true: um pode=false já virou
     indisponibilidade lá no eu_disponibilidade, então não conta duas vezes. */
  const dispPorVol = new Map<string, string[]>();
  for (const d of l.disponibilidades || []) {
    if (d.pode === false) continue;
    const arr = dispPorVol.get(d.voluntario_id) || [];
    arr.push(d.data); dispPorVol.set(d.voluntario_id, arr);
  }
  S.voluntarios = (l.voluntarios || []).map(v => ({
    id: v.id, nome: v.nome, tel: v.telefone || '', ativo: v.ativo,
    limiteMes: v.limite_mes, token: v.token,
    /* coluna nova: cadastros antigos vêm sem ela e valem como conferidos */
    conferido: v.conferido !== false,
    /* undefined de propósito quando ninguém informou: o motor trata "não sei"
       diferente de "tanto faz". */
    sexo: v.sexo === 'M' || v.sexo === 'F' ? v.sexo : undefined,
    funcoes: habPorVol.get(v.id) || {}, confirmadas: okPorVol.get(v.id) || {},
    indisponivel: indisPorVol.get(v.id) || [],
    disponivel: dispPorVol.get(v.id) || [],
  }));

  /* O culto (o domingo) é compartilhado pela igreja inteira; o que é DESTA
     equipe são as escalações, os plantões e o recado. Materializar um dia só
     porque outro ministério montou nele fazia o app mostrar "7 funções sem
     ninguém" e sumir com o botão "Montar a escala deste mês". */
  const dataDoCulto = new Map<string, string>((l.cultos || []).map(c => [c.id, c.data]));
  /* O QUARTO LADO DA MESMA REGRA — 20/09/2026, reauditoria.

     `idDoCulto` chaveia por DATA, e uma data pode ter DUAS linhas nesta
     lista: a regular e o evento DESTA equipe (a consulta já filtra os de
     outras). Com `new Map(pares)`, vence o último, e o último é a ordem em
     que o banco devolveu — que muda sozinha.

     Isso importa porque `salvar_dia` (migração 61) e `salvarDia` (lib/db.ts)
     gravam sempre no EVENTO. Se `d.cultoId` apontar para a linha regular, a
     tela escreve num id e grava em outro: `mudarStatus` casa zero linhas e
     diz `ESCALA_MUDOU_NO_POSTO` sem nada ter mudado. Era o terceiro estrago
     descrito na 61, e ele sobreviveu à correção dela porque esta linha é um
     quarto lado que ninguém tinha olhado.

     A regra é a mesma dos outros três: evento da própria equipe ganha.

     O QUE ESTA ESCOLHA PIORA, E POR QUE MESMO ASSIM É ELA (21/09):
     num banco LEGADO em que o robô já criou o fantasma e gravou a escala
     NELE — o caso que a faxina da 61 se recusa a apagar, porque tem gente
     dentro, e só avisa — `d.cultoId` passa a apontar sempre para o evento,
     enquanto a escala vive na linha regular. Antes era cara ou coroa; agora
     `mudarStatus` falha SEMPRE naquele dia.

     A escolha continua sendo esta porque ela é a certa para o estado normal
     depois da 61, e porque `apagarEvento(dia.cultoId)` e `salvarDia` já
     decidem assim. O estado legado é finito, a 61 avisa quais datas são, e
     falhar sempre é mais fácil de perceber que falhar às vezes. Mas é uma
     piora real naquele estado, e ela não pode ficar sem estar escrita. */
  const idDoCulto = new Map<string, string>();
  for (const c of l.cultos || []) {
    if (!idDoCulto.has(c.data) || c.evento) idDoCulto.set(c.data, c.id);
  }
  const abrir = (data: string) => {
    const d = garantirDia(S, data);
    const id = idDoCulto.get(data);
    if (id) d.cultoId = id;
    return d;
  };

  /* OS DIAS DE EVENTO SÃO MATERIALIZADOS; OS DEMAIS, NÃO.

     A regra geral deste arquivo é NÃO criar o dia só porque ele existe em
     `cultos` — está explicado mais abaixo: materializar um domingo só porque
     outro ministério montou nele fazia o app mostrar "7 funções sem ninguém"
     e sumir com o botão de montar o mês.

     Evento é o caso oposto, e por isso é a exceção: ele só chega aqui se for
     DESTE ministério (o filtro da consulta garante), e ele precisa aparecer
     mesmo vazio — um evento recém-criado não tem escalação nenhuma, e se ele
     não aparecesse, o líder cadastraria o GUIA Empreendedor e não veria
     nada. O dia vazio COM nome é justamente o que ele precisa ver para
     tocar "montar". */
  for (const c of l.cultos || []) {
    if (!c.evento) continue;
    const d = abrir(c.data);
    d.evento = c.evento;
    d.inicio = c.inicio || null;
  }
  for (const e of l.escalacoes || []) {
    const data = dataDoCulto.get(e.culto_id); const fn = nomeFuncao.get(e.funcao_id);
    if (!data || !fn) continue;
    abrir(data).slots[fn] = { vid: e.voluntario_id, status: e.status as Status, fixo: e.fixo,
      primeiraVez: !!e.primeira_vez, respondidoEm: e.respondido_em || null,
      escaladoEm: e.escalado_em || null };
  }
  for (const p of l.plantoes || []) {
    const data = dataDoCulto.get(p.culto_id);
    if (data) abrir(data).plantao.push(p.voluntario_id);
  }
  for (const r of l.recados || []) {
    const data = dataDoCulto.get(r.culto_id);
    if (!data) continue;
    if ((r.obs || '').trim()) abrir(data).obs = r.obs;
    /* relatório do fim do culto: mora na mesma linha do recado */
    if (r.relatorio || r.problemas) {
      const d = abrir(data);
      d.relatorio = r.relatorio || '';
      d.problemas = r.problemas || '';
      d.relatadoEm = r.relatado_em || null;
      d.relatadoPor = r.relatado_por || null;
    }
  }
  return S;
}

/** Parâmetros prontos para a RPC transacional salvar_dia.
 *  p_equipe é obrigatório: sem ele o banco apagava a escala dos OUTROS
 *  ministérios no mesmo domingo (o culto é uma linha só para a igreja toda). */
export function paraSalvarDia(S: Estado, data: string, equipeId: string) {
  const dia = S.escalas[data];
  if (!dia) return null;
  if (!equipeId) throw new Error('salvarDia sem ministério');
  const idFuncao = new Map(S.funcoes.map(f => [f.nome, f.id!]));
  const meus = new Set(S.voluntarios.map(v => v.id));
  const slots = Object.entries(dia.slots)
    .filter(([fn, sl]) => sl?.vid && idFuncao.get(fn) && meus.has(sl.vid!))
    .map(([fn, sl]) => ({
      funcao_id: idFuncao.get(fn), voluntario_id: sl.vid,
      status: sl.status || 'pendente', fixo: !!sl.fixo, primeira_vez: !!sl.primeiraVez,
    }));
  return {
    p_equipe: equipeId, p_data: data, p_obs: dia.obs || '', p_slots: slots,
    p_plantao: (dia.plantao || []).filter(v => meus.has(v)),
  };
}

/* ============================================================================
   BUSCAR AS LINHAS — uma vez só, para os dois que precisam
   Auditoria técnica, 29/08/2026.

   Esta consulta existia DUAS VEZES, palavra por palavra: em `lib/db.ts`
   (navegador, chave anônima, RLS valendo) e em `app/api/cron/route.ts`
   (servidor, service role, RLS desligado). Cliente diferente é motivo legítimo
   para dois caminhos; a CONSULTA ser diferente não é.

   E as duas já tinham divergido. O cron buscava CINCO tabelas dependentes; o
   navegador, SEIS — faltava `disponibilidade`, a tabela onde o voluntário
   responde "posso" a cada domingo. Hoje isso é inofensivo, porque o sorteio só
   lê `indisponivel` (o "não posso"); no dia em que alguém usar o "posso" para
   ordenar candidatos, o botão do líder passa a honrar a resposta e o robô das
   9h do dia 26 não — e o líder pode estar no app bem nessa hora.

   O jeito de essa divergência não voltar não é conferir de novo: é existir uma
   função só. O cliente entra por parâmetro; a lista de colunas, a janela de
   histórico e o conjunto de tabelas moram aqui.
   ============================================================================ */

/* Colunas explícitas, nunca `*`: desde a migração 18 o `pin_hash` está fora do
   GRANT de `authenticated`, e `select *` num GRANT por coluna estoura com
   "permission denied for column" em vez de simplesmente omitir a coluna.
   O cron passaria por cima (service role), mas escrever `*` lá é uma armadilha
   esperando o dia em que aquele código rodar com outra credencial. */
/* 18/09/2026 — A COLUNA NOVA QUE DERRUBOU O PAINEL.

   O parágrafo acima descreve a armadilha, e eu caí nela assim mesmo. A
   migração 48 criou `voluntarios.sexo`; no Postgres, coluna nova NÃO herda o
   GRANT da tabela, e aqui o GRANT é por coluna. No mesmo dia eu acrescentei
   `sexo` a esta lista. A partir daí, toda carga do Painel, da Escala e do
   Time pedia uma coluna proibida — e o PostgREST recusa o PEDIDO INTEIRO com
   42501, não só a coluna. A tela do líder caiu junto: "LOUVOR · 0" e um
   aviso de permissão, com os 13 voluntários intactos no banco o tempo todo.

   Consertado com `grant select (sexo), update (sexo) … to authenticated`.

   O que fica aqui é a lição, não o remendo: a lista agora é ESSENCIAL +
   OPCIONAIS. Se o banco recusar as opcionais, `lerVoluntarios` pede de novo
   só as essenciais e a tela continua de pé, com a informação que falta
   aparecendo como "não sei" em vez de derrubar o produto. Degradar é melhor
   que morrer — principalmente numa lista de colunas que vai crescer de novo. */
/* TRÊS COLUNAS SAÍRAM DAQUI EM 20/09, E O MOTIVO É O PRÓPRIO PARÁGRAFO ACIMA.

   A lista estava assim:
     'id,nome,telefone,ativo,limite_mes,token,criado_em,equipe_id,conferido,email'

   `criado_em` e `email` NINGUÉM LÊ. `montarEstado`, logo no começo deste
   arquivo, mapeia id, nome, telefone, ativo, limite_mes, token, conferido e
   sexo — e mais nada. Nenhuma tela lê as outras duas (o `criado_em` que
   aparece em /painel/candidaturas é da tabela `candidaturas`).

   ESSENCIAL é a lista SEM REDE: se o banco recusar qualquer uma delas, a
   consulta não degrada, o erro sobe e Painel, Escala e Time caem juntos. Era
   o apagão de 18/09 armado de novo, em duas colunas que o produto não usa.
   Um `revoke` acidental em `voluntarios.email` derrubaria a tela do líder
   inteira para não entregar nada.

   `equipe_id` fica: é a coluna do `.eq('equipe_id', equipeId)` logo abaixo,
   então sem ela a consulta não existe. */
const COLUNAS_ESSENCIAIS =
  'id,nome,telefone,ativo,limite_mes,token,equipe_id,conferido';
const COLUNAS_OPCIONAIS = ['sexo'];
const COLUNAS_VOLUNTARIO = [COLUNAS_ESSENCIAIS, ...COLUNAS_OPCIONAIS].join(',');

/** Permissão negada em alguma coluna. 42501 é o código do Postgres. */
const semPermissao = (e: any) =>
  e?.code === '42501' || /permission denied/i.test(e?.message || '');

/** A coluna não existe NESTE banco. 42703 é o código do Postgres, e o
    PostgREST também devolve PGRST204 quando não acha a coluna no schema.

    19/09/2026 — por que isto passou a existir ao lado de `semPermissao`:

    As duas situações são a mesma do ponto de vista da tela. "Você não pode ler
    esta coluna" e "esta coluna ainda não existe" chegam como códigos
    diferentes e têm a MESMA consequência: o PostgREST recusa o pedido INTEIRO,
    não a coluna, e a tela morre.

    A segunda acontece numa janela muito concreta: entre PUBLICAR o código e
    APLICAR a migração. Se o deploy sobe antes, o app pede colunas que o banco
    ainda não tem, e Painel, Escala e Time caem juntos — exatamente o apagão de
    18/09, pela porta ao lado. */
const colunaNaoExiste = (e: any) =>
  e?.code === '42703' || e?.code === 'PGRST204' ||
  /column .* does not exist|could not find the .* column/i.test(e?.message || '');

const bancoRecusouColuna = (e: any) => semPermissao(e) || colunaNaoExiste(e);

/* OS CULTOS, COM A MESMA REDE DE PROTEÇÃO DOS VOLUNTÁRIOS — 19/09/2026.

   A migração 54 acrescentou `evento`, `equipe_id` e `inicio` em `cultos`, e a
   consulta passou a pedir as três mais um filtro `.or()` sobre `equipe_id`.

   Eu escrevi isso algumas horas DEPOIS de consertar o apagão de 18/09, e caí
   na mesma armadilha pela porta ao lado: uma lista de colunas sem rede.
   Publicar o código antes de aplicar a migração faria o PostgREST recusar o
   pedido inteiro, e Painel, Escala e Time morreriam juntos — de novo.

   E a ordem "migração primeiro, deploy depois" não é uma garantia: a Vercel
   publica sozinha no `git push`, então a janela existe quer alguém lembre da
   ordem ou não.

   Com a degradação abaixo a ordem deixa de importar. Sem as colunas, a carga
   segue com `id,data` e sem o filtro: o app funciona exatamente como
   funcionava antes da 54, e os eventos simplesmente não aparecem até a
   migração rodar. É o mesmo contrato do `lerVoluntarios`, pelo mesmo motivo:
   degradar é melhor que morrer.

   O filtro `.or()` sai junto, e tem que sair: ele fala de `equipe_id`, que é
   justamente a coluna que pode não existir. */
const CULTOS_ESSENCIAL = 'id,data';
const CULTOS_COM_EVENTO = 'id,data,evento,equipe_id,inicio';

async function lerCultos(s: any, equipeId: string, desde: string) {
  /* `.order('id')` no desempate: com duas linhas na mesma data (a regular e o
     evento desta equipe), `order('data')` sozinho deixa a ordem por conta do
     heap, e ela muda sozinha. Quem escolhe entre as duas é o `idDoCulto` lá
     em cima, mas uma leitura que muda de ordem sem motivo é sempre a semente
     do próximo defeito difícil. */
  const r = await s.from('cultos').select(CULTOS_COM_EVENTO)
    .or(`equipe_id.is.null,equipe_id.eq.${equipeId}`)
    .gte('data', desde).order('data').order('id');
  if (!r?.error || !bancoRecusouColuna(r.error)) return r;

  /* segunda tentativa sem nada da 54. Se ESTA falhar, o erro sobe: aí não é
     migração que falta, é a tabela fechada, e esconder isso seria pior. */
  const r2 = await s.from('cultos').select(CULTOS_ESSENCIAL)
    .gte('data', desde).order('data');
  if (r2?.error) return r2;
  if (typeof console !== 'undefined') {
    console.warn('[ponte] o banco recusou evento/equipe_id/inicio em cultos',
      '— segui sem eventos esporádicos. Falta aplicar a migração 54.');
  }
  return r2;
}

async function lerVoluntarios(s: any, equipeId: string) {
  const pede = (cols: string) =>
    s.from('voluntarios').select(cols).eq('equipe_id', equipeId).order('nome');

  const r = await pede(COLUNAS_VOLUNTARIO);
  if (!r?.error || !bancoRecusouColuna(r.error)) return r;

  /* segunda tentativa sem as opcionais. Se ESTA falhar, o erro sobe: aí não é
     coluna nova sem grant, é a tabela fechada, e esconder isso seria pior. */
  const r2 = await pede(COLUNAS_ESSENCIAIS);
  if (r2?.error) return r2;
  if (typeof console !== 'undefined') {
    console.warn('[ponte] o banco recusou', COLUNAS_OPCIONAIS.join(', '),
      '— segui sem essa(s) coluna(s). Falta um GRANT.');
  }
  return r2;
}

/* A carga olha no máximo 200 dias para trás. Sem a janela, cada troca de
   ministério puxava o histórico inteiro da equipe desde sempre.

   200 e não 180: o comentário dizia 180 e o código dizia 200 desde que o
   número foi ajustado, e comentário que mente num arquivo onde o comentário É
   a documentação é o começo da erosão. Vale 200, e o motivo do número é a
   folga sobre `janelaCarga`, que vale 90 por padrão — `cargaJanela` e
   `escalasNoMes` contam em cima do que foi CARREGADO, então encurtar esta
   janela muda o resultado do sorteio em silêncio. Não desça daqui sem mexer
   no motor junto. */
export const DIAS_DE_HISTORICO = -200;

/* =============================================================================
   A LISTA DE IDs VAI NA URL, E URL TEM TETO — 19/09/2026.

   `.in('voluntario_id', volIds)` não vira corpo de requisição: vira query
   string de um GET, com um UUID de 36 letras por pessoa mais vírgula. Medido,
   montando a consulta com o próprio `@supabase/supabase-js` e lendo a URL
   antes do envio:

        voluntários     habilidades        plantões (dois `.in`)
            13 (hoje)        593 B               2.946 B
            60            2.426 B               4.779 B
           150            5.936 B               8.289 B     <- passa de 8 KB
           300           11.786 B              14.139 B

   Oito quilobytes é o `large_client_header_buffers` padrão do nginx, que é o
   que roda na frente do PostgREST. Passando disso a resposta é 414, e como
   um erro de leitura SOBE (e deve subir), a tela do líder morre inteira:
   Painel, Escala e Time juntos. Não é lentidão, é apagão.

   O gatilho é 150 pessoas em UM ministério, não na igreja. Hoje o maior tem
   17. Mas o Connect e o GUIA Kids são os que crescem, e o modo de falhar é o
   pior que existe: tela branca, sem pista, para quem não mudou nada.

   LOTE DE 100 porque 100 UUIDs dão cerca de 3,9 KB, metade do teto, e sobra
   espaço para o segundo `.in('culto_id', ...)` de `escalacoes` e `plantoes`.
   O custo é uma requisição a mais a cada 100 pessoas, todas em paralelo.

   E O ERRO CONTINUA SUBINDO: se QUALQUER lote falhar, a função devolve o
   erro, porque meio resultado é pior que nenhum — lista parcial de escalação
   faz o robô das 9h achar que o líder não montou o mês.
   ============================================================================= */
const POR_LOTE = 100;

/* O SEGUNDO `.in()` TAMBÉM CONTA, E NINGUÉM TINHA CONTADO — 20/09/2026.

   O parágrafo acima dimensionou o lote de 100 dizendo que "sobra espaço para
   o segundo `.in('culto_id', ...)`". Medido, não sobra. Cada UUID custa
   exatamente 39 bytes na URL (36 do id + 3 da vírgula codificada, `%2C`), e
   o teto do nginx na frente do PostgREST é 8192:

       100 voluntarios       -> 3.916 B
       106 cultos (a janela de hoje: 200 dias para trás + 1 mês montado)
                             -> 4.146 B
       + base                -> 8.137 B = 99,3% do teto

   Ou seja, o lote foi calculado como se o segundo `.in()` fosse de graça. O
   dia em que um ministério passar de 100 pessoas, a primeira carga volta 414
   e Painel, Escala e Time caem juntos — que é exatamente o modo de falha que
   os lotes foram criados para evitar.

   E o termo que CRESCE SOZINHO é o dos cultos, não o das pessoas: a janela é
   `gte('data', hoje - 200 dias)` sem teto superior, então a lista engorda um
   culto por semana sem ninguém mexer em nada.

   POR QUE LOTEAR OS DOIS E NÃO TROCAR POR UM JOIN. O caminho mais elegante é
   filtrar pela data do culto com o join embutido do PostgREST
   (`select('*, cultos!inner(data)').gte('cultos.data', desde)`), e aí a URL
   para de crescer com o número de cultos, para sempre. É o que este arquivo
   deve fazer um dia. Não é o que ele faz hoje porque essa é uma mudança de
   FORMA da consulta no caminho que carrega o app inteiro, e não há PostgREST
   aqui para experimentá-la: o apagão de 18/09, documentado mais abaixo,
   nasceu exatamente de uma mudança dessas aplicada sem experimentar.

   Lotear as duas dimensões é aritmética do lado de cá, com a MESMA forma de
   consulta que já está no ar há meses. O teto some do mesmo jeito, ao custo
   de mais requisições — todas em paralelo, numa onda só. */
const CULTOS_POR_LOTE = 60;   /* 60 x 39 B = 2.340 B, sobra folga para 100 pessoas */

/* =============================================================================
   `funcoes` ERA A ÚLTIMA `select('*')` DA CARGA.

   O parágrafo mais abaixo neste arquivo diz, desde o apagão de 18/09:
   "Colunas explícitas, nunca `*`". `voluntarios` e `cultos` seguiram a regra;
   `funcoes` ficou de fora — e é a tabela que mais ganhou coluna nova na
   história deste banco (sete migrações mexeram nela).

   O que `*` custava, medido: `descricao` e `descricao_familia` (migrações 14
   e 15) somam cerca de 139 letras cada, vêm em toda carga e `montarEstado`
   não lê nenhuma das duas. `chegada` também não é lida em lugar nenhum do
   app. Com 40 postos são uns 11 KB por carga, e `recarregar()` é chamado de
   onze lugares só na tela de escala.

   Mas o motivo principal não são os bytes: é que `*` esconde de quem lê o
   código quais colunas a tela realmente precisa, e é isso que transforma uma
   coluna nova sem GRANT num apagão silencioso.

   `exige_sexo` entra como OPCIONAL, com a mesma degradação de `sexo` em
   `voluntarios`: ela nasceu na 48, é a mais nova da lista, e se um dia faltar
   GRANT a tela tem que continuar de pé sem a regra do prédio em vez de morrer
   inteira.
   ============================================================================= */
/* `relata` saiu da lista sem rede pelo mesmo motivo de `criado_em` e `email`
   em `voluntarios`: ele é opcional na prática (o mapa logo acima trata
   ausência) e não tem por que derrubar a tela inteira se for recusado.
   `equipe_id` fica: é a coluna do `.eq()` desta própria consulta. */
const FUNCOES_ESSENCIAIS = 'id,nome,simultanea,ordem,ativa,equipe_id,tipos';
const FUNCOES_OPCIONAIS = ['exige_sexo', 'relata'];
const FUNCOES_COMPLETAS = [FUNCOES_ESSENCIAIS, ...FUNCOES_OPCIONAIS].join(',');

async function lerFuncoes(s: any, equipeId: string) {
  const pede = (cols: string) =>
    /* `.order('nome')` como desempate: `funcoes.ordem` não tem unique e a
       tela consegue criar dois postos com a mesma ordem. Sem isso a ordem
       vinha do heap do Postgres e o sorteio mudava de resultado entre duas
       execuções com os mesmos dados (ver `funcoesAtivas` em lib/engine.ts). */
    s.from('funcoes').select(cols).eq('equipe_id', equipeId).order('ordem').order('nome');
  const r = await pede(FUNCOES_COMPLETAS);
  if (!r?.error || !bancoRecusouColuna(r.error)) return r;
  const r2 = await pede(FUNCOES_ESSENCIAIS);
  if (!r2?.error && typeof console !== 'undefined') {
    console.warn('[ponte] o banco recusou', FUNCOES_OPCIONAIS.join(', '),
      'em funcoes — segui sem a regra de sexo do posto. Falta um GRANT.');
  }
  return r2;
}

const fatiar = (ids: string[], por: number) => {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += por) out.push(ids.slice(i, i + por));
  return out;
};

const juntar = (rs: any[]): { data: any[]; error?: any; count?: number } => {
  const ruim = rs.find((r: any) => r?.error);
  if (ruim) return ruim;
  /* `count` soma: cada lote traz o total DELE, e quem confere o corte é
     `inteira()`, que compara com o que chegou. */
  const temCount = rs.some((r: any) => typeof r?.count === 'number');
  return {
    data: rs.flatMap((r: any) => r?.data || []),
    ...(temCount ? { count: rs.reduce((a: number, r: any) => a + (r?.count || 0), 0) } : {}),
  };
};

/* O LOTE FOI DIMENSIONADO POR BYTES, E EXISTE UM TETO DE LINHAS TAMBÉM.

   20/09/2026, reauditoria. `POR_LOTE` e `CULTOS_POR_LOTE` foram escolhidos
   contando BYTES DE URL contra os 8192 do nginx. Certo, e insuficiente: o
   PostgREST tem um segundo teto, o `max-rows` (1000 por padrão no Supabase),
   e ele corta a resposta devolvendo 200 sem erro. `inteira()`, logo abaixo,
   passou a detectar esse corte e a transformá-lo em erro — o que é a decisão
   certa, e que também transforma "tela errada" em "tela que não abre".

   A conta que ninguém tinha feito: um lote de `escalacoes` é até
   `POR_LOTE funções × CULTOS_POR_LOTE cultos` LINHAS. Medido com os números
   reais da igreja e 106 cultos na janela:

       Louvor,  10 postos ->  maior lote ~540 linhas   (teto 1000)
       Connect, 18 postos ->  maior lote ~960 linhas   96% do teto
       Connect, 18 postos e todos preenchidos -> ~1080  ESTOURA

   E não é só `escalacoes`: `habilidades` é `voluntários × funções`, e
   `indisponibilidades` é `voluntários × dias marcados`. As três crescem com o
   produto de duas coisas, e nenhuma delas tem `.range()` em lugar nenhum
   deste arquivo. Sem recuperação, o app fica morto para aquele ministério até
   alguém editar uma constante.

   POR QUE PARTIR O LOTE EM VEZ DE ESCOLHER UM NÚMERO MENOR. Um número menor
   é o mesmo erro de novo, um degrau mais adiante: ele vale para os tamanhos
   de hoje e alguém descobre o próximo teto do mesmo jeito, em produção. O
   corte é OBSERVÁVEL (`count` diz quantas linhas existem, `data.length` diz
   quantas vieram), então dá para reagir a ele em vez de prevê-lo. O lote que
   voltou cortado é partido ao meio e pedido de novo, recursivamente, e só
   vira erro quando um lote de UM id ainda vem cortado — aí é uma linha só que
   passa de mil, e nenhuma constante resolveria.

   Custa no máximo log2(N) rodadas, e só no caso que hoje simplesmente
   quebrava. O caminho normal continua sendo uma onda só. */
const cortado = (r: any) =>
  !r?.error && typeof r?.count === 'number' && (r?.data?.length ?? 0) < r.count;

async function pedirPartindo(
  ids: string[], consulta: (ids: string[]) => any, oQue: string,
): Promise<{ data: any[]; error?: any; count?: number }> {
  const r = await consulta(ids);
  if (!cortado(r)) return r;
  if (ids.length <= 1) {
    return { data: null as any, error: {
      code: 'LEITURA_CORTADA',
      message: `A leitura de ${oQue} veio cortada mesmo pedindo um item por vez: `
        + `${r.data?.length ?? 0} de ${r.count} linhas. Uma linha só da lista passa do teto `
        + `de linhas do PostgREST, e partir o lote não resolve isso.`,
    } };
  }
  const meio = Math.ceil(ids.length / 2);
  return juntar(await Promise.all([
    pedirPartindo(ids.slice(0, meio), consulta, oQue),
    pedirPartindo(ids.slice(meio), consulta, oQue),
  ]));
}

export async function emLotes(
  ids: string[], consulta: (ids: string[]) => any, oQue = 'esta lista',
): Promise<{ data: any[]; error?: any; count?: number }> {
  if (!ids.length) return { data: [] };
  return juntar(await Promise.all(
    fatiar(ids, POR_LOTE).map(l => pedirPartindo(l, consulta, oQue))));
}

/* Lote em DUAS dimensões, para as consultas que têm dois `.in()`.
   Ver a nota de `CULTOS_POR_LOTE`: o segundo `.in()` ia inteiro dentro de
   cada lote do primeiro, e era ele que empurrava a URL para o teto.

   Aqui quem parte é a dimensão dos CULTOS, e não a dos ids: a lista de
   cultos é a que cresce sozinha (a janela engorda um por semana), enquanto a
   de funções e voluntários só muda quando a igreja muda. */
export async function emLotes2(
  ids: string[], cultos: string[], consulta: (ids: string[], cultos: string[]) => any,
  oQue = 'esta lista',
): Promise<{ data: any[]; error?: any; count?: number }> {
  if (!ids.length || !cultos.length) return { data: [] };
  const pares: Promise<any>[] = [];
  for (const x of fatiar(ids, POR_LOTE)) {
    for (const y of fatiar(cultos, CULTOS_POR_LOTE)) {
      pares.push(pedirPartindo(y, (cs) => consulta(x, cs), oQue));
    }
  }
  return juntar(await Promise.all(pares));
}

/* LISTA NO TETO NÃO É A LISTA, É "NÃO SEI" — 20/09/2026.

   Este arquivo já tinha aprendido que lista vazia por erro não é "ninguém":
   um 5xx virava escalação vazia, o cron lia "o líder não montou" e
   `salvar_dia` apagava o mês. A mesma frase vale para a lista CORTADA, e
   esse caminho estava aberto.

   O PostgREST do Supabase tem teto de linhas por resposta (`max-rows`, 1000
   por padrão). Passando disso ele devolve 200, com menos linhas, e SEM erro.
   Nenhuma das consultas daqui pedia contagem, então não havia como saber.
   E `escalacoes` não tinha `order`, então o que caía fora era o que entrou
   por último: justamente o mês que o líder acabou de montar.

   Simulado com 62 cultos por 20 postos: 1240 linhas viram 1000, sem erro;
   `montados` conta 0; `decisaoDoRobo` responde 'monta'; e o laço de
   `salvar_dia` apaga a escala do mês inteiro e regrava sorteada. A rota
   devolve 200 e o e-mail diz "montada".

   Com `count: 'exact'`, o PostgREST informa o total no cabeçalho
   Content-Range. Se chegou menos do que o total, a leitura está incompleta e
   isso vira erro — porque toda decisão feita em cima dela estaria errada. */
export function inteira(r: any, oQue: string) {
  if (r?.error) return r;
  const veio = (r?.data || []).length;
  const total = typeof r?.count === 'number' ? r.count : null;
  if (total !== null && veio < total) {
    return { data: null, error: {
      code: 'LEITURA_CORTADA',
      message: `A leitura de ${oQue} veio cortada: ${veio} de ${total} linhas. `
        + 'O banco limita o tamanho da resposta e o resto ficou de fora. '
        + 'Nada foi decidido com essa lista pela metade.',
    } };
  }
  return r;
}

export async function linhasDaEquipe(
  s: any, equipeId: string, desde: string, nomeEquipe = '',
): Promise<LinhasDoBanco> {
  const [funcoes, vols, cultos, cfg] = await Promise.all([
    lerFuncoes(s, equipeId),
    lerVoluntarios(s, equipeId),
    lerCultos(s, equipeId, desde),
    s.from('config').select('*').eq('equipe_id', equipeId).maybeSingle(),
  ]);
  /* config pode vir nula por RLS (quem logou sem estar na allowlist) — isso é
     informação, não falha. As outras três, se falharem, a tela não tem o que
     mostrar e o erro precisa subir.

     20/09/2026: "NULA POR RLS" E "A LEITURA FALHOU" NÃO SÃO A MESMA COISA.

     Esta linha era `[funcoes, vols, cultos]` e `cfg` ficava inteiramente de
     fora, com o comentário acima como justificativa. Só que RLS negando
     devolve `{data: null, error: null}`, enquanto um 5xx passageiro devolve
     `error` — e os dois viravam `config: null`. `montarEstado` então monta o
     padrão, jogando fora `limitePadrao`, `janelaCarga`, `plantaoQtd` e
     `horasTardio` da equipe.

     O estrago não é de tela: é do robô das 9h. Medido com o Connect, que usa
     `limitePadrao: 4` e `plantaoQtd: 3` — com a leitura de `config` falhando,
     o mês sai sorteado com teto 2 e um plantão só, e o e-mail diz que está
     montado. Indistinguível de um mês legitimamente apertado.

     PGRST116 é "nenhuma linha", que é o caso legítimo do `maybeSingle` e
     continua passando. O resto sobe junto com as outras três. */
  const cfgRuim = cfg?.error && cfg.error.code !== 'PGRST116' ? cfg : null;
  const ruim = [funcoes, vols, cultos, cfgRuim].find((r: any) => r?.error);
  if (ruim?.error) throw ruim.error;

  const funcaoIds = (funcoes.data || []).map((f: any) => f.id);
  const volIds = (vols.data || []).map((v: any) => v.id);
  const cultoIds = (cultos.data || []).map((c: any) => c.id);

  /* A JANELA VALE PARA AS TABELAS QUE CRESCEM COM O TEMPO.

     Ela chegava só a `cultos` e `disponibilidade`. `escalacoes`,
     `indisponibilidades` e `plantoes` vinham INTEIRAS — todo o histórico
     daquela equipe desde o primeiro domingo —, e `montarEstado` jogava fora
     o que não casava com nenhum culto carregado. Ou seja: o navegador baixava
     anos de escala para calcular o mês que vem, a cada carga de tela e a cada
     `recarregar()`, que roda depois de CADA ação do líder.

     `escalacoes` e `plantoes` cortam por `culto_id`, não por data: os ids já
     estão calculados logo acima, e vêm de uma consulta que JÁ é janelada.
     `indisponibilidades` corta por data, como `disponibilidade`.

     `habilidades` fica inteira de propósito — ela é por pessoa e por função,
     não cresce com o tempo, e é o que diz quem PODE fazer o quê. */
  /* `{ count: 'exact' }` nas seis: é o que permite `inteira()` saber se a
     resposta veio completa. Ver o comentário de `inteira` logo acima. */
  const C = { count: 'exact' as const };
  const [habs, indis, escs, plants, recados, disp] = (await Promise.all([
    emLotes(volIds, ids => s.from('habilidades').select('*', C).in('voluntario_id', ids), 'habilidades'),
    emLotes(volIds, ids => s.from('indisponibilidades').select('*', C).in('voluntario_id', ids).gte('data', desde), 'indisponibilidades'),
    emLotes2(funcaoIds, cultoIds, (ids, cs) =>
      s.from('escalacoes').select('*', C).in('funcao_id', ids).in('culto_id', cs), 'escalacoes'),
    emLotes2(volIds, cultoIds, (ids, cs) =>
      s.from('plantoes').select('*', C).in('voluntario_id', ids).in('culto_id', cs), 'plantoes'),
    /* `culto_obs` não passava por lote nenhum: a lista inteira de cultos ia
       na URL sempre, e era a consulta que estourava primeiro (207 cultos). */
    emLotes2([equipeId], cultoIds, (ids, cs) =>
      s.from('culto_obs').select('*', C).in('equipe_id', ids).in('culto_id', cs), 'recados do culto'),
    emLotes(volIds, ids => s.from('disponibilidade').select('*', C).in('voluntario_id', ids).gte('data', desde), 'disponibilidade'),
  ])).map((r: any, i: number) =>
    inteira(r, ['habilidades', 'indisponibilidades', 'escalacoes', 'plantoes', 'recados do culto', 'disponibilidade'][i]));
  /* 14/09/2026. ESTAS SEIS TAMBÉM SOBEM. Antes, um erro aqui virava lista
     vazia em silêncio — e lista vazia de `escalacoes` não é "ninguém escalado",
     é "não sei". A diferença custa o mês inteiro: o cron lê escalação vazia
     como "o líder não montou", chama gerarMes e depois salvar_dia, e
     salvar_dia APAGA toda escalação da equipe naquele culto que não estiver
     nos slots novos (05-melhorias.sql:55-58). Um 5xx passageiro do PostgREST
     às 9h do dia 26 zeraria a escala de outubro, e o relatório diria "vagas:
     9" como se fosse normal. O mesmo caminho existe na tela: mês vazio, botão
     "Montar a escala deste mês", um toque.

     Leitura que falha tem que falhar. Quem chama decide o que fazer com isso;
     ninguém decide nada com um vazio que mente. */
  const ruim2 = [habs, indis, escs, plants, recados, disp].find((r: any) => r?.error);
  if (ruim2?.error) throw ruim2.error;

  return {
    funcoes: funcoes.data || [], voluntarios: vols.data || [],
    habilidades: habs.data || [], indisponibilidades: indis.data || [],
    cultos: cultos.data || [], escalacoes: escs.data || [], plantoes: plants.data || [],
    recados: recados.data || [], disponibilidades: disp.data || [],
    config: cfg?.data || null, equipe: nomeEquipe,
  };
}
