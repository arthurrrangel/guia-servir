/* =============================================================================
   91 · O AVISO NUNCA SAIU, E A ETAPA 5 DO PDF NAO EXISTIA
   22/09/2026 (noite)

   Duas coisas neste arquivo, e as duas sao correcao de afirmacao falsa.

   ---------------------------------------------------------------------------
   1 · O AVISO DA 90 NUNCA SAIU DE PRODUCAO, NEM UMA VEZ

   A 90 foi escrita, conferida, aplicada em producao e declarada CONFERIDO. A
   quarta auditoria, independente, mediu o que ninguem tinha medido: quem
   precisa chamar nao consegue chamar.

     select has_schema_privilege('service_role','demandas','usage');   -> f
     set role service_role; select demandas.a_avisar(50);
     ERROR:  permission denied for schema demandas

   E ha um segundo muro, antes desse. A rota chama

     s.schema('demandas').rpc('a_avisar', ...)

   e o schema `demandas` NAO esta na lista de schemas expostos da API do
   projeto (o padrao do Supabase e `public` e `graphql_public`). Mesmo com o
   grant, o PostgREST recusaria antes de chegar no Postgres. Todo o resto do
   sistema chama `public.dem_*` exatamente por isso; a 90 foi a unica que saiu
   do padrao, e por isso foi a unica que nao funcionou.

   POR QUE A CONFERENCIA DA 90 DEU VERDE MESMO ASSIM

   Porque ela roda DENTRO da propria migracao, como `postgres`, chamando
   `demandas.a_avisar` direto. Ela provou que a consulta esta certa. Ela nao
   provou, e nao tinha como provar daquele jeito, que quem chama consegue
   chamar. Um bloco que diz CONFERIDO e conferiu a parte facil e pior do que
   nenhum bloco: ele encerra a pergunta.

   E A FILA DA 90 NAO DAVA CONTA DO QUE O PDF PEDE

   `avisado_em` e UM carimbo por demanda, gasto uma vez na vida. Serve para
   "chegou demanda nova". Nao serve para a regra 10 do documento:

     "O solicitante deve receber notificacoes quando houver mudanca de status
      ou necessidade de informacao."

   Isso e N avisos por demanda, para uma pessoa diferente da do primeiro, e
   uma coluna booleana nao expressa isso. Entao a fila vira TABELA: uma linha
   por (demanda, pessoa, motivo). O que a 90 acertou continua valendo, e o que
   ela nao alcancava passa a caber.

   E ela reserva em vez de so ler. Medido pela auditoria: `a_avisar` era
   STABLE, sem lock e sem carimbo, e duas varreduras concorrentes liam a mesma
   fila e mandavam o mesmo aviso duas vezes. O carimbo so decidia quem gravava,
   depois de os dois emails ja terem saido. O cabecalho da rota afirmava
   "chamar duas vezes no mesmo segundo manda uma vez so". Nao mandava.

   ---------------------------------------------------------------------------
   2 · A ETAPA 5 DO DOCUMENTO NAO EXISTIA EM NENHUMA CAMADA

   O PDF original do sistema diz, na etapa 5:

     "Depois da execucao, o setor solicitante ou responsavel pela gestao valida
      se a demanda foi atendida corretamente."

   entre as capacidades do Solicitante:

     "Confirmar a conclusao."

   e no modelo resumido de fluxo:

     "Solicitar -> Triar -> Aprovar quando necessario -> Executar -> VALIDAR
      -> Concluir"

   `dem_mover` tinha 14 acoes e nenhuma delas era validar. Quem executa era
   quem fechava, e o estado `concluida` era terminal. O sistema registrava
   DISCORDANCIA (`reabrir`) e nao registrava CONCORDANCIA: nao havia como
   distinguir "a pessoa conferiu e estava certo" de "ninguem olhou".

   ---------------------------------------------------------------------------
   3 · E UMA FUNCAO QUE ENTREGAVA TOKEN DE GENTE PARA QUEM PERGUNTASSE

   `demandas.quem(text)` e `security definer`, devolve `demandas.membros`
   INTEIRO (inclusive `token`, que e a senha de cada pessoa) e tem EXECUTE para
   PUBLIC por ACL default do Postgres. O `revoke all on schema demandas` da 50
   e privilegio de SCHEMA, nao de funcao: ele fecha a porta da rua e deixa a
   chave na fechadura.

   Hoje isso e latente, porque ninguem tem USAGE no schema. Mas a primeira
   linha que alguem digita para destravar o aviso e justamente

     grant usage on schema demandas to service_role;

   e a 90 escreveu, com todas as letras, que "um `grant usage` futuro nao pode
   abrir uma funcao que le email de gente", e aplicou esse cuidado as DUAS
   funcoes dela, deixando as outras 20 do schema como estavam. Este arquivo
   precisa dar o grant, entao fecha as funcoes ANTES, todas, e muda o default
   para as proximas.

   ---------------------------------------------------------------------------
   O QUE ESTE ARQUIVO NAO FAZ

     · nao manda email. Quem manda e `app/api/demandas/avisar/route.ts`.
     · nao decide o texto do email. Decide QUEM recebe, POR QUE, e entrega os
       fatos ja limpos.
     · nao expoe o schema `demandas` na API. As tres funcoes novas moram em
       `public`, como todo o resto do sistema, e sao fechadas para `anon` e
       `authenticated`.
     · nao toca em nada do sistema de escalas.
   ============================================================================= */
do $tranca$begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(91);
  end if;
end
$tranca$;

begin;

/* -------------------------------------------------------------------------
   1 · FECHAR AS FUNCOES DO SCHEMA ANTES DE ABRIR O SCHEMA

   Uma por uma, e o default para as futuras. Sem isto, o `grant usage` do
   bloco 6 abriria `demandas.quem` para `service_role` e, se `demandas` um dia
   for exposto na API, para `anon`.
   ------------------------------------------------------------------------- */
do $fechar$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p
            where p.pronamespace = 'demandas'::regnamespace
  loop
    execute format('revoke all on function %s from public', r.sig);
  end loop;
end
$fechar$;

alter default privileges in schema demandas revoke execute on functions from public;

/* -------------------------------------------------------------------------
   2 · O ESTADO COM O NOME QUE O DOCUMENTO USA

   O email precisa dizer "a sua demanda esta agora em Aguardando informacoes",
   e nao "status=travada, travada_por=informacao". A tela ja traduz, em
   `comoOPdfChama` (`lib/demandas/regras.ts`). O banco passa a traduzir com a
   MESMA ordem de decisao, porque duas grafias para o mesmo conceito e como se
   perde uma regra sem ninguem ver.

   A ordem importa e e copiada de la: o portao de aprovacao vem ANTES do teste
   de `travada`, porque enquanto ele estiver fechado ele e o fato mais
   importante sobre a demanda, qualquer que seja o rotulo da trava.

   'Rascunho' e 'Em triagem' nao aparecem aqui, e e de proposito: nenhum
   caminho do sistema coloca demanda nesses estados. Rascunho e o pedido que
   ainda nao virou linha (mora no aparelho de quem esta escrevendo) e a triagem
   do documento acontece no nascimento, pela categoria, que ja carrega o setor
   que atende, se exige aprovacao e o prazo padrao.
   ------------------------------------------------------------------------- */
create or replace function demandas.estado_do_pdf(d demandas.demandas)
returns text language sql stable as $fn$
  select case
    when d.status = 'cancelada' then 'Cancelada'
    when d.status = 'concluida' then 'Concluída'
    when demandas.falta_aprovacao(d) then 'Aguardando aprovação'
    when d.status = 'travada' and d.travada_por = 'aprovacao'  then 'Aguardando aprovação'
    when d.status = 'travada' and d.travada_por = 'terceiros'  then 'Aguardando terceiros'
    when d.status = 'travada' then 'Aguardando informações'
    when d.status = 'execucao' and coalesce(d.reaberturas, 0) > 0 then 'Reaberta'
    when d.status = 'execucao' then 'Em execução'
    when d.aprovacao = 'aprovada' then 'Aprovada'
    else 'Aberta' end
$fn$;
revoke all on function demandas.estado_do_pdf(demandas.demandas) from public;

/* -------------------------------------------------------------------------
   3 · A ETAPA 5: VALIDACAO

   Duas colunas, nao um estado novo. Pensei em `status = 'validada'` e descartei:
   `ck_status` tem cinco valores e cada valor novo se multiplica por tudo que
   ja existe (a ordenacao da lista, os filtros, os indicadores, o espelho da
   tela, a matriz de acoes). `validada_em` e um fato SOBRE a conclusao, nao um
   lugar diferente de estar. A demanda continua concluida; agora da para saber
   se alguem conferiu.
   ------------------------------------------------------------------------- */
alter table demandas.demandas add column if not exists validada_em  timestamptz;
alter table demandas.demandas add column if not exists validada_por uuid references demandas.membros(id);

/* quem le a coluna e a tela, pelas funcoes `dem_*`; a tabela continua fechada */
do $g$ begin
  execute 'revoke all (validada_em, validada_por) on demandas.demandas from public, anon, authenticated';
exception when undefined_object then null; end $g$;

/* -------------------------------------------------------------------------
   4 · A FILA DE VERDADE

   Uma linha por (demanda, pessoa, motivo). `reservado_em` e o que faz duas
   varreduras nao mandarem o mesmo aviso: quem reserva leva, e quem chegou
   junto pula (`for update skip locked`). A reserva VENCE em 10 minutos, para
   um processo que morreu no meio nao sequestrar o aviso para sempre.

   `tentativas` e `ultimo_erro` existem porque "o aviso nao chegou" precisa ter
   resposta no banco. Sem eles, um `resend 429` de um minuto ruim vira um
   misterio permanente.
   ------------------------------------------------------------------------- */
create table if not exists demandas.avisos (
  id           uuid primary key default extensions.gen_random_uuid(),
  demanda_id   uuid not null references demandas.demandas(id) on delete cascade,
  membro_id    uuid not null references demandas.membros(id)  on delete cascade,
  tipo         text not null,
  nota         text,
  criado_em    timestamptz not null default now(),
  reservado_em timestamptz,
  enviado_em   timestamptz,
  tentativas   int not null default 0,
  ultimo_erro  text
);

do $ck$ begin
  alter table demandas.avisos add constraint ck_aviso_tipo
    check (tipo in ('nova','status','informacao'));
exception when duplicate_object then null; end $ck$;

/* o indice cobre exatamente a consulta da fila, e so as linhas que faltam:
   uma fila saudavel e vazia, e um indice parcial sobre ela e minusculo */
create index if not exists ix_dem_avisos_fila
  on demandas.avisos (criado_em, id) where enviado_em is null;

alter table demandas.avisos enable row level security;
revoke all on table demandas.avisos from public, anon, authenticated;

/* -------------------------------------------------------------------------
   5 · QUEM ENTRA NA FILA, E QUANDO

   Gatilho proprio, separado de `fn_historico`. Podia ter entrado la dentro:
   o historico ja detecta mudanca de status e ja sabe quem mexeu. Nao entrou
   porque as duas coisas falham de jeitos diferentes e por motivos diferentes,
   e um gatilho que grava historico E enfileira email fica sem dono no dia em
   que um dos dois precisar mudar.

   TRES MOTIVOS, e nenhum a mais:

     'nova'       -> para quem ATENDE. A demanda nasceu, o setor precisa saber.
                     Quem abriu nao recebe: ele acabou de escrever.
     'status'     -> para quem PEDIU. A regra 10 do documento, primeira metade.
     'informacao' -> para quem PEDIU, quando a demanda trava esperando um dado
                     dele. A regra 10, segunda metade, e a mais importante das
                     duas: e o unico caso em que a demanda PARA ate a pessoa
                     responder, e ela nao tem como saber disso sem abrir o
                     sistema por conta propria.

   QUEM MEXEU NAO E AVISADO DO PROPRIO GESTO. `demandas.membro` carrega quem
   esta agindo (o mesmo mecanismo que `fn_historico` usa para gravar autoria).
   Sem esta linha, o solicitante que destrava respondendo recebe um email
   dizendo que a demanda dele mudou de estado, dois segundos depois de ele
   mesmo ter mudado.

   SO ENTRA NA FILA QUEM TEM PARA ONDE RECEBER. Membro inativo e membro sem
   email nao viram linha: fila com destinatario impossivel e fila que nunca
   esvazia, e a varredura tem teto.
   ------------------------------------------------------------------------- */
create or replace function demandas.fn_enfileirar_aviso()
returns trigger language plpgsql security definer
set search_path to 'demandas','public' as $fn$
declare
  v_quem uuid := nullif(current_setting('demandas.membro', true), '')::uuid;
  v_tipo text;
  v_nota text;
begin
  if TG_OP = 'INSERT' then
    insert into demandas.avisos (demanda_id, membro_id, tipo)
      select new.id, m.id, 'nova'
        from demandas.membros m
       where m.setor_id = new.setor_responsavel
         and coalesce(m.ativo, true)
         and m.papel in ('responsavel','gestor','admin')
         and demandas.limpo(coalesce(m.auth_email, m.email)) is not null
         and m.id is distinct from new.aberta_por;
    return null;
  end if;

  /* setor trocado: o setor novo precisa saber que chegou trabalho, do mesmo
     jeito que saberia se a demanda tivesse nascido nele. O setor antigo nao
     recebe nada: para ele a novidade e que saiu, e isso ele ve na lista. */
  if new.setor_responsavel is distinct from old.setor_responsavel then
    insert into demandas.avisos (demanda_id, membro_id, tipo)
      select new.id, m.id, 'nova'
        from demandas.membros m
       where m.setor_id = new.setor_responsavel
         and coalesce(m.ativo, true)
         and m.papel in ('responsavel','gestor','admin')
         and demandas.limpo(coalesce(m.auth_email, m.email)) is not null
         and m.id is distinct from new.aberta_por
         and m.id is distinct from v_quem;
  end if;

  /* e agora o lado de quem pediu */
  if new.travada_por = 'informacao'
     and old.travada_por is distinct from 'informacao' then
    v_tipo := 'informacao';
    v_nota := new.travada_nota;
  elsif demandas.estado_do_pdf(new) is distinct from demandas.estado_do_pdf(old) then
    v_tipo := 'status';
    v_nota := null;
  else
    return null;
  end if;

  insert into demandas.avisos (demanda_id, membro_id, tipo, nota)
    select new.id, m.id, v_tipo, v_nota
      from demandas.membros m
     where m.id = new.aberta_por
       and coalesce(m.ativo, true)
       and demandas.limpo(coalesce(m.auth_email, m.email)) is not null
       and m.id is distinct from v_quem;
  return null;
end $fn$;
revoke all on function demandas.fn_enfileirar_aviso() from public;

drop trigger if exists tg_enfileirar_aviso on demandas.demandas;
create trigger tg_enfileirar_aviso
  after insert or update on demandas.demandas
  for each row execute function demandas.fn_enfileirar_aviso();

/* -------------------------------------------------------------------------
   6 · AS TRES PORTAS, EM `public`, ONDE A API ALCANCA

   `public` e nao `demandas` porque o PostgREST so serve o que esta na lista de
   schemas expostos do projeto, e essa lista e `public, graphql_public`. Todo o
   resto do sistema ja mora aqui pelo mesmo motivo. A 90 foi a unica excecao, e
   foi a unica que nunca funcionou.

   `security definer` com `search_path` curto, `revoke` de `anon` e
   `authenticated` (a fila tem email de gente dentro), `grant` so para
   `service_role`, que e quem a rota usa.
   ------------------------------------------------------------------------- */
create or replace function public.dem_avisos_pendentes(p_limite int default 50)
returns jsonb language plpgsql volatile security definer
set search_path to 'demandas','public' as $fn$
declare v jsonb;
begin
  with escolhidos as (
    select a.id from demandas.avisos a
     where a.enviado_em is null
       and (a.reservado_em is null or a.reservado_em < now() - interval '10 minutes')
     order by a.criado_em, a.id
     limit greatest(coalesce(p_limite, 50), 1)
       for update skip locked
  ), reservados as (
    update demandas.avisos a
       set reservado_em = now(), tentativas = a.tentativas + 1
     where a.id in (select id from escolhidos)
    returning a.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'aviso_id', r.id,
      'tipo',     r.tipo,
      'nota',     r.nota,
      'email',    lower(demandas.limpo(coalesce(mm.auth_email, mm.email))),
      'nome',     mm.nome,
      'numero',   d.numero,
      'titulo',   d.titulo,
      'grupo',    c.grupo,
      'categoria', c.nome,
      'setor',    (select s.nome from demandas.setores s where s.id = d.setor_responsavel),
      'abriu',    (select x.nome from demandas.membros x where x.id = d.aberta_por),
      'prioridade', d.prioridade,
      'prazo',    d.prazo,
      'falta_aprovacao', demandas.falta_aprovacao(d),
      'estado',   demandas.estado_do_pdf(d)
    ) order by r.criado_em, r.id), '[]'::jsonb)
    into v
    from reservados r
    join demandas.demandas   d  on d.id  = r.demanda_id
    join demandas.categorias c  on c.id  = d.categoria_id
    join demandas.membros    mm on mm.id = r.membro_id;
  return v;
end $fn$;

create or replace function public.dem_aviso_enviado(p_ids uuid[])
returns int language plpgsql volatile security definer
set search_path to 'demandas','public' as $fn$
declare n int;
begin
  /* `enviado_em is null` na guarda: carimbar duas vezes nao pode contar duas
     vezes, e a contagem e o que a rota devolve para quem esta olhando. */
  with feito as (
    update demandas.avisos set enviado_em = now(), ultimo_erro = null
     where id = any(coalesce(p_ids, '{}'::uuid[])) and enviado_em is null
    returning 1)
  select count(*)::int into n from feito;
  return n;
end $fn$;

create or replace function public.dem_aviso_falhou(p_ids uuid[], p_erro text default null)
returns int language plpgsql volatile security definer
set search_path to 'demandas','public' as $fn$
declare n int;
begin
  /* DEVOLVE PARA A FILA. Esta e a diferenca entre "tentei e nao deu" e "dei
     por avisado": limpar a reserva faz a proxima varredura pegar de novo. O
     erro fica gravado para a pergunta "por que o aviso nao chegou" ter
     resposta no banco em vez de num log que ninguem le. */
  with feito as (
    update demandas.avisos
       set reservado_em = null,
           ultimo_erro = left(coalesce(demandas.limpo(p_erro), 'sem motivo'), 200)
     where id = any(coalesce(p_ids, '{}'::uuid[])) and enviado_em is null
    returning 1)
  select count(*)::int into n from feito;
  return n;
end $fn$;

revoke all on function public.dem_avisos_pendentes(int)        from public, anon, authenticated;
revoke all on function public.dem_aviso_enviado(uuid[])        from public, anon, authenticated;
revoke all on function public.dem_aviso_falhou(uuid[], text)   from public, anon, authenticated;

do $sr$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.dem_avisos_pendentes(int)      to service_role';
    execute 'grant execute on function public.dem_aviso_enviado(uuid[])      to service_role';
    execute 'grant execute on function public.dem_aviso_falhou(uuid[], text) to service_role';
  else
    raise notice '91 · service_role nao existe neste banco (harness local). Os grants ficam para producao.';
  end if;
end $sr$;

/* -------------------------------------------------------------------------
   7 · A 90 SAI DE CENA

   `a_avisar` e `marcar_avisado` nao eram alcancaveis por quem precisava, e a
   fila que elas liam nao expressa a regra 10 do documento. Ficam como codigo
   morto que parece vivo, que e a familia de defeito que esta sessao inteira
   passou o dia cacando. As colunas `avisado_em` e `aviso_motivo` FICAM: elas
   sao registro do que aconteceu, e apagar registro e outra coisa.
   ------------------------------------------------------------------------- */
drop function if exists demandas.a_avisar(int);
drop function if exists demandas.marcar_avisado(uuid[], text);
drop index if exists demandas.ix_dem_sem_aviso;

/* -------------------------------------------------------------------------
   8 · CIRURGIA NAS FUNCOES DA TELA

   Cada troca le o corpo vivo com `pg_get_functiondef` e exige casamento
   exato. A marca de `troca_se_faltar` e sempre CODIGO EXECUTAVEL unico do
   conserto, nunca comentario e nunca codigo de erro que ja exista: as duas
   licoes caras das migracoes 88 e 89.
   ------------------------------------------------------------------------- */
do $cirurgia$
declare src text; novo text;
begin
  -- ============ dem_mover: a demanda fechada passa a aceitar `validar` =====
  select pg_get_functiondef('public.dem_mover(text,int,text,jsonb)'::regprocedure) into src;

  novo := public.troca_se_faltar(src, '''reabrir'',''validar''',
'     and p_acao not in (''comentar'',''anexar'',''desanexar'',''reabrir'') then',
'     and p_acao not in (''comentar'',''anexar'',''desanexar'',''reabrir'',''validar'') then',
    'dem_mover: fechada aceita validar');

  -- ============ dem_mover: a acao `validar` ================================
  novo := public.troca_se_faltar(novo, '''SO_QUEM_PEDIU''',
'  else
    return jsonb_build_object(''ok'', false, ''erro'', ''ACAO_DESCONHECIDA'');
  end if;',
'  elsif p_acao = ''validar'' then
    /* 91 · A ETAPA 5 DO DOCUMENTO.

       "o setor solicitante ou responsavel pela gestao valida se a demanda foi
        atendida corretamente"

       Quem atende NAO entra na guarda de proposito, nem sendo responsavel:
       validar o proprio trabalho nao e validacao, e o unico ponto da etapa e
       ter uma segunda pessoa dizendo que resolveu. Gestor e admin entram
       porque o documento diz "ou responsavel pela gestao", e porque
       solicitante que sumiu nao pode deixar demanda pendurada para sempre. */
    if not (d.aberta_por = m.id or m.papel in (''gestor'',''admin'')) then
      return jsonb_build_object(''ok'', false, ''erro'', ''SO_QUEM_PEDIU''); end if;
    if d.status <> ''concluida'' then
      return jsonb_build_object(''ok'', false, ''erro'', ''NAO_ESTA_CONCLUIDA''); end if;
    if d.validada_em is not null then
      return jsonb_build_object(''ok'', false, ''erro'', ''JA_VALIDADA''); end if;
    update demandas.demandas
       set validada_em = now(), validada_por = m.id
     where id = d.id;
    /* o evento e escrito aqui e nao no gatilho de historico: `fn_historico`
       nao conhece estas colunas, e ensina-lo a conhecer custaria reescrever
       um gatilho que hoje funciona por uma linha que cabe aqui. */
    insert into demandas.eventos (demanda_id, membro_id, tipo, para, texto)
      values (d.id, m.id, ''validacao'', m.nome, v_txt);

  else
    return jsonb_build_object(''ok'', false, ''erro'', ''ACAO_DESCONHECIDA'');
  end if;',
    'dem_mover: acao validar');
  execute novo;

  -- ============ resumo: a lista precisa saber se foi validada ==============
  select pg_get_functiondef('demandas.resumo(demandas.demandas)'::regprocedure) into src;
  novo := public.troca_se_faltar(src, '''validada_em'', d.validada_em',
'    ''reaberturas'', d.reaberturas);',
'    ''reaberturas'', d.reaberturas,
    /* 91 · concluida sem ninguem conferir e concluida com o solicitante
       dizendo que resolveu sao dois fatos diferentes, e a lista precisa
       distinguir os dois para a pergunta "o que ficou pendurado" ter
       resposta. */
    ''validada_em'', d.validada_em);',
    'resumo: validada_em');
  execute novo;

  -- ============ dem_ver: e a ficha precisa saber QUEM validou =============
  select pg_get_functiondef('public.dem_ver(text,int)'::regprocedure) into src;
  novo := public.troca_se_faltar(src, '''validada_por'', (select',
'      ''setor_responsavel_id'', d.setor_responsavel,',
'      ''setor_responsavel_id'', d.setor_responsavel,
      /* 91 · o nome, nao o id: a frase da ficha e "Validada por Fulano em
         22/09", e nome de pessoa nao se resolve na tela sem uma segunda ida
         ao banco. */
      ''validada_por'', (select x.nome from demandas.membros x where x.id = d.validada_por),',
    'dem_ver: validada_por');
  execute novo;
end $cirurgia$;

/* -------------------------------------------------------------------------
   9 · CONFERENCIA

   UM bloco de conferencia neste arquivo, e nenhum outro. A 89 teve dois e o
   extrator de sabotagem pegou o primeiro: 27 sabotagens mediram o bloco
   errado e sairam todas verdes. `scripts/sabotar-migracao.py` agora recusa
   arquivo com mais de um bloco de etiqueta `conf`, e por isso nem esta prosa
   pode escrever a etiqueta: a contagem e textual, e um comentario que a cita
   ja derruba a bateria.
   ------------------------------------------------------------------------- */
do $conf$
declare
  falhas text[] := '{}';
  v_cat uuid; v_set_com uuid; v_set_adm uuid;
  v_sol uuid; v_resp uuid; v_ges uuid; v_abre uuid;
  v_tok_sol text; v_tok_resp text; v_tok_ges text; v_tok_abre text;
  v_antes int; v_num2 int;
  v_num int; v_d demandas.demandas;
  v_fila jsonb; v_n int; v_r jsonb; v_nota text;
  v_ids uuid[];
begin
  /* 91 · DUAS ARMADILHAS QUE ESTE BLOCO JA CAIU, E POR ISSO ESTAO ESCRITAS

       1. `falhas || 'texto'` sem `::text` o Postgres resolve como
          `text[] || text[]` e estoura com "Array value must start with {".
          Onde ha `format(...)` isso nao acontece, porque `format` devolve
          `text` declarado. Medido: 27 sabotagens "passaram" so por causa
          disto, e nenhuma delas tinha passado de verdade.

       2. `<>` contra NULL devolve NULL, e `if NULL then` nao entra. A primeira
          versao deste bloco comparava `validada_por <> 'CONF91 Solicitante'`,
          e a sabotagem que trocava o nome por NULL passava por baixo da
          guarda. Toda comparacao aqui e `is distinct from`, que e o mesmo
          defeito que a quarta auditoria achou em `pode_ver` e
          `pode_atender`. */
  perform set_config('demandas.membro', '', true);

  /* ---- cenario ---- */
  insert into demandas.setores (nome, slug, atende) values ('CONF91 Comunicação', 'conf91-com', true)
    returning id into v_set_com;
  insert into demandas.setores (nome, slug, atende) values ('CONF91 Administrativo', 'conf91-adm', false)
    returning id into v_set_adm;
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, prazo_padrao_dias)
    values ('CONF91 grupo', 'CONF91 arte', v_set_com, false, 5) returning id into v_cat;

  insert into demandas.membros (nome, email, papel, setor_id, token, ativo)
    values ('CONF91 Solicitante', 'conf91sol@exemplo.test', 'solicitante', v_set_adm, 'CONF91TOKSOL', true)
    returning id, token into v_sol, v_tok_sol;
  insert into demandas.membros (nome, email, papel, setor_id, token, ativo)
    values ('CONF91 Responsavel', 'conf91resp@exemplo.test', 'responsavel', v_set_com, 'CONF91TOKRESP', true)
    returning id, token into v_resp, v_tok_resp;
  insert into demandas.membros (nome, email, papel, setor_id, token, ativo)
    values ('CONF91 Gestor', 'conf91ges@exemplo.test', 'gestor', v_set_com, 'CONF91TOKGES', true)
    returning id, token into v_ges, v_tok_ges;
  /* sem email, e inativo com email: nenhum dos dois pode virar linha de fila */
  insert into demandas.membros (nome, email, papel, setor_id, token, ativo)
    values ('CONF91 SemEmail', null, 'responsavel', v_set_com, 'CONF91TOKSEM', true);
  insert into demandas.membros (nome, email, papel, setor_id, token, ativo)
    values ('CONF91 Inativo', 'conf91ina@exemplo.test', 'responsavel', v_set_com, 'CONF91TOKINA', false);
  /* 91 · DUAS PESSOAS QUE SO EXISTEM PARA A GUARDA TER O QUE BARRAR.

     A primeira versao deste cenario nao tinha nenhuma delas, e duas sabotagens
     "passaram" por isso: tirar `m.papel in (...)` nao mudava nada porque nao
     havia solicitante NO SETOR QUE ATENDE, e tirar
     `m.id is distinct from new.aberta_por` nao mudava nada porque quem abria
     era de outro setor. Guarda so se prova com alguem que ela precise barrar;
     sem isso o teste mede o cenario, nao a regra. */
  insert into demandas.membros (nome, email, papel, setor_id, token, ativo)
    values ('CONF91 SolNoSetor', 'conf91sns@exemplo.test', 'solicitante', v_set_com, 'CONF91TOKSNS', true);
  insert into demandas.membros (nome, email, papel, setor_id, token, ativo)
    values ('CONF91 RespQueAbre', 'conf91rqa@exemplo.test', 'responsavel', v_set_com, 'CONF91TOKRQA', true)
    returning id, token into v_abre, v_tok_abre;

  /* ---- 1 · a demanda nova enfileira para quem atende, e so ---- */
  v_r := public.dem_abrir(v_tok_sol, jsonb_build_object(
    'categoria_id', v_cat, 'titulo', 'CONF91 Arte do culto',
    'descricao', 'Precisamos de uma arte para o culto de domingo de manha',
    'prazo', to_char(demandas.hoje() + 10, 'YYYY-MM-DD')));
  if not (v_r->>'ok')::boolean then
    falhas := falhas || format('1: dem_abrir recusou: %s', v_r); end if;
  v_num := (v_r->>'numero')::int;
  select * into v_d from demandas.demandas where numero = v_num;

  select count(*)::int into v_n from demandas.avisos a
   where a.demanda_id = v_d.id and a.tipo = 'nova';
  /* tres: Responsavel, Gestor e RespQueAbre. Os outros tres do setor ficam
     de fora por motivos diferentes, e e isso que o bloco 2 confere um a um:
     SemEmail nao tem para onde receber, Inativo saiu, SolNoSetor nao atende. */
  if v_n <> 3 then
    falhas := falhas || format('1: devia enfileirar 3 (os dois responsaveis e o gestor, todos com email), enfileirou %s', v_n); end if;

  if exists (select 1 from demandas.avisos a where a.demanda_id = v_d.id and a.membro_id = v_sol) then
    falhas := falhas || '2: quem abriu entrou na fila do proprio pedido'::text; end if;
  if exists (select 1 from demandas.avisos a join demandas.membros m on m.id = a.membro_id
              where a.demanda_id = v_d.id and m.nome = 'CONF91 SolNoSetor') then
    falhas := falhas || '2: solicitante do setor que atende entrou na lista de quem atende'::text; end if;

  /* e o caso que so aparece quando quem abre E de quem atende: a demanda
     aberta pelo proprio responsavel do setor nao pode avisar ele mesmo */
  v_r := public.dem_abrir(v_tok_abre, jsonb_build_object(
    'categoria_id', v_cat, 'titulo', 'CONF91 Aberta por quem atende',
    'descricao', 'O responsavel do setor abriu uma demanda para o proprio setor',
    'prazo', to_char(demandas.hoje() + 10, 'YYYY-MM-DD')));
  v_num2 := (v_r->>'numero')::int;
  if exists (select 1 from demandas.avisos a join demandas.demandas dd on dd.id = a.demanda_id
              where dd.numero = v_num2 and a.membro_id = v_abre) then
    falhas := falhas || '2: quem abriu, sendo do setor que atende, foi avisado do proprio pedido'::text; end if;
  if exists (select 1 from demandas.avisos a join demandas.membros m on m.id = a.membro_id
              where a.demanda_id = v_d.id and m.nome = 'CONF91 SemEmail') then
    falhas := falhas || '2: membro sem email entrou na fila'::text; end if;
  if exists (select 1 from demandas.avisos a join demandas.membros m on m.id = a.membro_id
              where a.demanda_id = v_d.id and m.nome = 'CONF91 Inativo') then
    falhas := falhas || '2: membro inativo entrou na fila'::text; end if;

  /* ---- 3 · a fila RESERVA: a segunda leitura nao ve o que a primeira levou ----

     A CONFERENCIA OLHA SO A PROPRIA DEMANDA, e isso nao e detalhe.

     A primeira versao deste bloco contava a fila INTEIRA e exigia 2. Ela
     passou no banco recem-criado e reprovou no harness completo, porque
     `demandas-banco.test.sql` abre dezenas de demandas antes, e cada uma
     enfileira. Conferencia que depende de o banco estar vazio mede o banco,
     nao a regra. */
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_fila
    from jsonb_array_elements(public.dem_avisos_pendentes(200)) x
   where (x->>'numero')::int = v_num;
  if jsonb_array_length(v_fila) <> 3 then
    falhas := falhas || format('3: a primeira varredura devia ver 3, viu %s', jsonb_array_length(v_fila)); end if;
  if (select count(*) from jsonb_array_elements(public.dem_avisos_pendentes(200)) x
       where (x->>'numero')::int = v_num) <> 0 then
    falhas := falhas || '3: a segunda varredura pegou de novo o que a primeira reservou'::text; end if;

  /* ---- 4 · e o aviso carrega os fatos, ja limpos ---- */
  if (v_fila->0->>'email') is null or (v_fila->0->>'email') !~ '^[^ ]+@[^ ]+$' then
    falhas := falhas || format('4: aviso sem email utilizavel: %s', v_fila->0->>'email'); end if;
  if (v_fila->0->>'numero')::int is distinct from v_num then
    falhas := falhas || '4: o aviso nao diz de que demanda fala'::text; end if;
  if (v_fila->0->>'estado') is distinct from 'Aberta' then
    falhas := falhas || format('4: estado devia ser Aberta, veio %s', v_fila->0->>'estado'); end if;
  if (v_fila->0->>'tipo') is distinct from 'nova' then
    falhas := falhas || format('4: tipo devia ser nova, veio %s', v_fila->0->>'tipo'); end if;

  /* ---- 5 · falha devolve para a fila; sucesso tira ---- */
  select array_agg((x->>'aviso_id')::uuid) into v_ids
    from jsonb_array_elements(v_fila) x;
  if public.dem_aviso_falhou(v_ids, 'resend 429') <> 3 then
    falhas := falhas || '5: dem_aviso_falhou nao devolveu os tres para a fila'::text; end if;
  if (select count(*) from jsonb_array_elements(public.dem_avisos_pendentes(200)) x
       where (x->>'numero')::int = v_num) <> 3 then
    falhas := falhas || '5: o que falhou nao voltou para a fila'::text; end if;
  if public.dem_aviso_enviado(v_ids) <> 3 then
    falhas := falhas || '5: dem_aviso_enviado nao carimbou os tres'::text; end if;
  if public.dem_aviso_enviado(v_ids) <> 0 then
    falhas := falhas || '5: carimbar duas vezes contou de novo'::text; end if;
  /* a reserva vence em 10 minutos. Envelhecendo a dela na mao, o unico
     filtro que sobra e `enviado_em is null` -- e e ele que tem que segurar.
     Sem esta linha, uma sabotagem que apaga esse filtro passava despercebida,
     porque a reserva recente escondia o buraco por 10 minutos. */
  update demandas.avisos set reservado_em = now() - interval '1 hour'
   where id = any(v_ids);
  if (select count(*) from jsonb_array_elements(public.dem_avisos_pendentes(200)) x
       where (x->>'numero')::int = v_num) <> 0 then
    falhas := falhas || '5: aviso carimbado continua na fila'::text; end if;

  /* ---- 6 · mudanca de estado avisa QUEM PEDIU, e nao quem mexeu ---- */
  perform public.dem_mover(v_tok_resp, v_num, 'assumir', '{}'::jsonb);
  select count(*)::int into v_n from demandas.avisos a
   where a.demanda_id = v_d.id and a.tipo = 'status' and a.membro_id = v_sol and a.enviado_em is null;
  if v_n <> 1 then
    falhas := falhas || format('6: mudanca de estado devia avisar quem pediu 1 vez, avisou %s', v_n); end if;
  if exists (select 1 from demandas.avisos a
              where a.demanda_id = v_d.id and a.tipo = 'status' and a.membro_id = v_resp) then
    falhas := falhas || '6: quem mexeu recebeu aviso do proprio gesto'::text; end if;

  /* ---- 7 · trava por informacao avisa quem pediu, com a pergunta junto ---- */
  perform public.dem_mover(v_tok_resp, v_num, 'travar',
    jsonb_build_object('motivo','informacao','texto','Qual e o tamanho da arte?'));
  select a.nota into v_nota from demandas.avisos a
   where a.demanda_id = v_d.id and a.tipo = 'informacao' and a.membro_id = v_sol limit 1;
  if v_nota is null then
    falhas := falhas || '7: trava por informacao nao avisou quem pediu'::text; end if;
  if coalesce(v_nota, '') not like '%tamanho da arte%' then
    falhas := falhas || format('7: o aviso nao leva a pergunta junto: %s', v_nota); end if;
  if (select (x->>'estado') from jsonb_array_elements(public.dem_avisos_pendentes(200)) x
       where (x->>'tipo') = 'informacao' and (x->>'numero')::int = v_num limit 1)
     is distinct from 'Aguardando informações' then
    falhas := falhas || '7: o estado do aviso nao usa a palavra do documento'::text; end if;

  /* ---- 8 · validar: a etapa 5 ---- */

  /* antes, o caso que so aparece quando quem mexe E quem pediu: o solicitante
     destrava respondendo, e nao pode receber email dizendo que a demanda que
     ele acabou de destravar mudou de estado */
  select count(*)::int into v_antes from demandas.avisos a
   where a.demanda_id = v_d.id and a.membro_id = v_sol;
  perform public.dem_mover(v_tok_sol, v_num, 'destravar', jsonb_build_object('texto','Tamanho A3'));
  if (select count(*)::int from demandas.avisos a
       where a.demanda_id = v_d.id and a.membro_id = v_sol) <> v_antes then
    falhas := falhas || '6: quem mexeu recebeu aviso do proprio gesto (o solicitante destravou)'::text; end if;
  perform public.dem_mover(v_tok_resp, v_num, 'concluir', jsonb_build_object('texto','Arte entregue no grupo'));
  select * into v_d from demandas.demandas where numero = v_num;
  if v_d.status is distinct from 'concluida' then
    falhas := falhas || format('8: devia estar concluida, esta %s', v_d.status); end if;

  v_r := public.dem_mover(v_tok_resp, v_num, 'validar', '{}'::jsonb);
  if (v_r->>'erro') is distinct from 'SO_QUEM_PEDIU' then
    falhas := falhas || format('8: quem atende validou o proprio trabalho: %s', v_r); end if;

  v_r := public.dem_mover(v_tok_sol, v_num, 'validar', jsonb_build_object('texto','Ficou ótimo, obrigado'));
  if not coalesce((v_r->>'ok')::boolean, false) then
    falhas := falhas || format('8: quem pediu nao conseguiu validar: %s', v_r); end if;
  select * into v_d from demandas.demandas where numero = v_num;
  if v_d.validada_em is null or v_d.validada_por is distinct from v_sol then
    falhas := falhas || '8: a validacao nao ficou gravada'::text; end if;

  v_r := public.dem_mover(v_tok_sol, v_num, 'validar', '{}'::jsonb);
  if (v_r->>'erro') is distinct from 'JA_VALIDADA' then
    falhas := falhas || format('8: validou duas vezes: %s', v_r); end if;

  if not exists (select 1 from demandas.eventos e
                  where e.demanda_id = v_d.id and e.tipo = 'validacao' and e.membro_id = v_sol) then
    falhas := falhas || '8: a validacao nao entrou no historico'::text; end if;

  v_r := public.dem_ver(v_tok_sol, v_num);
  if (v_r->'demanda'->>'validada_por') is distinct from 'CONF91 Solicitante' then
    falhas := falhas || format('8: a ficha nao diz quem validou: %s', v_r->'demanda'->>'validada_por'); end if;
  if (v_r->'demanda'->>'validada_em') is null then
    falhas := falhas || '8: a ficha nao diz quando foi validada'::text; end if;

  /* ---- 9 · e validar o que nao esta concluida nao cola ---- */
  v_r := public.dem_abrir(v_tok_sol, jsonb_build_object(
    'categoria_id', v_cat, 'titulo', 'CONF91 Segunda demanda',
    'descricao', 'Outra demanda so para provar a guarda de estado',
    'prazo', to_char(demandas.hoje() + 10, 'YYYY-MM-DD')));
  v_r := public.dem_mover(v_tok_sol, (v_r->>'numero')::int, 'validar', '{}'::jsonb);
  if (v_r->>'erro') is distinct from 'NAO_ESTA_CONCLUIDA' then
    falhas := falhas || format('9: validou uma demanda que nao esta concluida: %s', v_r); end if;

  /* ---- 10 · a porta publica nao alcanca nada disto ---- */
  if has_function_privilege('anon', 'public.dem_avisos_pendentes(int)', 'execute') then
    falhas := falhas || '10: dem_avisos_pendentes esta aberta para a porta publica'::text; end if;
  if has_function_privilege('authenticated', 'public.dem_avisos_pendentes(int)', 'execute') then
    falhas := falhas || '10: dem_avisos_pendentes esta aberta para quem logou'::text; end if;
  if has_function_privilege('anon', 'public.dem_aviso_enviado(uuid[])', 'execute')
     or has_function_privilege('authenticated', 'public.dem_aviso_enviado(uuid[])', 'execute') then
    falhas := falhas || '10: dem_aviso_enviado esta aberta'::text; end if;
  if has_function_privilege('anon', 'public.dem_aviso_falhou(uuid[],text)', 'execute')
     or has_function_privilege('authenticated', 'public.dem_aviso_falhou(uuid[],text)', 'execute') then
    falhas := falhas || '10: dem_aviso_falhou esta aberta'::text; end if;
  if has_table_privilege('anon', 'demandas.avisos', 'select')
     or has_table_privilege('authenticated', 'demandas.avisos', 'select') then
    falhas := falhas || '10: a tabela de avisos esta legivel pela porta publica'::text; end if;

  /* ---- 11 · e NENHUMA funcao do schema `demandas` sobrou aberta ---- */
  if exists (
    select 1 from pg_proc p
     where p.pronamespace = 'demandas'::regnamespace
       and has_function_privilege('public', p.oid, 'execute')) then
    falhas := falhas || format('11: sobrou funcao de `demandas` aberta para PUBLIC: %s',
      (select string_agg(p.proname, ', ') from pg_proc p
        where p.pronamespace = 'demandas'::regnamespace
          and has_function_privilege('public', p.oid, 'execute'))); end if;

  /* e a de token, nominalmente, porque e a que devolve a senha de cada um */
  if has_function_privilege('public', 'demandas.quem(text)', 'execute') then
    falhas := falhas || '11: demandas.quem continua devolvendo token para PUBLIC'::text; end if;

  /* ---- 12 · a 90 nao ficou de codigo morto parecendo vivo ---- */
  if to_regprocedure('demandas.a_avisar(int)') is not null then
    falhas := falhas || '12: a_avisar da 90 continua existindo sem ninguem para chamar'::text; end if;

  /* ---- 13 · o teto da varredura vale ---- */
  perform public.dem_aviso_falhou(
    array(select a.id from demandas.avisos a where a.enviado_em is null), 'volta pra fila');
  if jsonb_array_length(public.dem_avisos_pendentes(1)) <> 1 then
    falhas := falhas || '13: o limite da varredura nao foi respeitado'::text; end if;

  /* ---- limpeza ---- */
  delete from demandas.avisos a using demandas.demandas d
   where a.demanda_id = d.id and d.titulo like 'CONF91%';
  delete from demandas.eventos e using demandas.demandas d
   where e.demanda_id = d.id and d.titulo like 'CONF91%';
  delete from demandas.anexos a using demandas.demandas d
   where a.demanda_id = d.id and d.titulo like 'CONF91%';
  delete from demandas.demandas where titulo like 'CONF91%';
  delete from demandas.membros where nome like 'CONF91%';
  delete from demandas.categorias where grupo = 'CONF91 grupo';
  delete from demandas.setores where nome like 'CONF91%';

  if array_length(falhas, 1) > 0 then
    raise exception E'91 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 91 · conferencia: 13 blocos. A fila enfileira so quem atende e tem email, reserva de verdade, devolve o que falhou, avisa quem pediu na mudanca de estado e na pergunta, a etapa 5 do documento existe e so quem pediu valida, a porta publica nao alcanca nada e nenhuma funcao de `demandas` ficou aberta.';
end $conf$;

insert into public.schema_versao (n, arquivo)
  values (91, '91-o-aviso-nunca-saiu-e-a-etapa-5-do-pdf-nao-existia.sql')
  on conflict (n) do nothing;

commit;
