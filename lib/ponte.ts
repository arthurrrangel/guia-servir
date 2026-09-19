/* Ponte pura entre as linhas do banco e o Estado do motor.
   SEM 'use client': roda no navegador (db.ts) e no servidor (cron). */
/* Os TIPOS vêm em `import type` separado dos VALORES. Não é estilo: sem
   isso, o Node de linha de comando (que só apaga os tipos, não os resolve)
   tenta importar `Estado` como valor em tempo de execução e o módulo nem
   carrega — foi o que impediu de testar este arquivo. */
import { CONFIG_PADRAO, estadoVazio, garantirDia } from './engine';
import type { Estado, Nivel, Status } from './engine';

export type LinhasDoBanco = {
  funcoes: any[]; voluntarios: any[]; habilidades: any[]; indisponibilidades: any[];
  cultos: any[]; escalacoes: any[]; plantoes: any[]; config: any | null;
  /* recado do domingo POR EQUIPE (culto_obs). Sem isso, o recado de um
     ministério aparecia no aviso do outro e um sobrescrevia o do outro. */
  recados?: any[];
  /* respostas de "posso" por domingo (tabela disponibilidade) */
  disponibilidades?: any[];
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
  const idDoCulto = new Map<string, string>((l.cultos || []).map(c => [c.data, c.id]));
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
   3h do dia 26 não — e ninguém está olhando quando ele roda.

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
const COLUNAS_ESSENCIAIS =
  'id,nome,telefone,ativo,limite_mes,token,criado_em,equipe_id,conferido,email';
const COLUNAS_OPCIONAIS = ['sexo'];
const COLUNAS_VOLUNTARIO = [COLUNAS_ESSENCIAIS, ...COLUNAS_OPCIONAIS].join(',');

/** Permissão negada em alguma coluna. 42501 é o código do Postgres. */
const semPermissao = (e: any) =>
  e?.code === '42501' || /permission denied/i.test(e?.message || '');

async function lerVoluntarios(s: any, equipeId: string) {
  const pede = (cols: string) =>
    s.from('voluntarios').select(cols).eq('equipe_id', equipeId).order('nome');

  const r = await pede(COLUNAS_VOLUNTARIO);
  if (!r?.error || !semPermissao(r.error)) return r;

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

export async function linhasDaEquipe(
  s: any, equipeId: string, desde: string, nomeEquipe = '',
): Promise<LinhasDoBanco> {
  const vazio = { data: [] as any[] };
  const [funcoes, vols, cultos, cfg] = await Promise.all([
    s.from('funcoes').select('*').eq('equipe_id', equipeId).order('ordem'),
    lerVoluntarios(s, equipeId),
    /* EVENTO ESPORÁDICO (migração 54): o dia do evento vem junto com os
       domingos, e o filtro é o que impede o Louvor de abrir a escala e ver um
       dia do Connect. `equipe_id is null` são os cultos da programação fixa,
       que são da igreja inteira; preenchido é evento, e só o dono enxerga. */
    s.from('cultos').select('id,data,evento,equipe_id,inicio')
      .or(`equipe_id.is.null,equipe_id.eq.${equipeId}`)
      .gte('data', desde).order('data'),
    s.from('config').select('*').eq('equipe_id', equipeId).maybeSingle(),
  ]);
  /* config pode vir nula por RLS (quem logou sem estar na allowlist) — isso é
     informação, não falha. As outras três, se falharem, a tela não tem o que
     mostrar e o erro precisa subir. */
  const ruim = [funcoes, vols, cultos].find((r: any) => r?.error);
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
  const [habs, indis, escs, plants, recados, disp] = await Promise.all([
    volIds.length ? s.from('habilidades').select('*').in('voluntario_id', volIds) : vazio,
    volIds.length ? s.from('indisponibilidades').select('*').in('voluntario_id', volIds).gte('data', desde) : vazio,
    (funcaoIds.length && cultoIds.length) ? s.from('escalacoes').select('*').in('funcao_id', funcaoIds).in('culto_id', cultoIds) : vazio,
    (volIds.length && cultoIds.length) ? s.from('plantoes').select('*').in('voluntario_id', volIds).in('culto_id', cultoIds) : vazio,
    cultoIds.length ? s.from('culto_obs').select('*').eq('equipe_id', equipeId).in('culto_id', cultoIds) : vazio,
    volIds.length ? s.from('disponibilidade').select('*').in('voluntario_id', volIds).gte('data', desde) : vazio,
  ]);
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
