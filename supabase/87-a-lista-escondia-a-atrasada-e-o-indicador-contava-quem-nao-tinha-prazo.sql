/* A TRANCA. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(87);
  end if;
end $tranca$;

/* =============================================================================
   87 · A LISTA ESCONDIA A ATRASADA, E O INDICADOR CONTAVA QUEM NAO TINHA PRAZO
   21/09/2026

   -------------------------------------------------------------------------
   DEFEITO 1 · O AVISO DO TOPO APONTAVA PARA ONDE A LISTA NAO APONTA

   `app/demandas/page.tsx:7` promete, em comentario: "O que precisa de atencao
   sobe." E `dem_lista` ordena assim:

       order by case prioridade when 'urgente' then 0 ... end,
                prazo nulls last, criada_em

   Atraso nao entra na ordem. MEDIDO, com a demanda 5 vencida em 01/08 e o
   sistema em 21/09:

     filtro "Em aberto" · aviso do topo: «1 passou do prazo · 1 espera a sua
                                          aprovacao.»
      1. #4  Em execucao · Alta · para 24/09
      2. #2  Aberta · Alta · para 11/10
      3. #1  Aberta · para 26/09
      4. #3  Travada · esperando aprovacao · para 03/10
      5. #5 [ATRASADA] Aberta · 51 dias de atraso     <- ULTIMA

     filtro "Todas"
      3. #6  Concluida · para 19/09         <- acima de tres abertas

   A pessoa le "1 passou do prazo", procura o vermelho de cima para baixo, nao
   acha nas tres primeiras e desiste. Com sessenta demandas e teto de 300, ela
   nunca vai achar. Um aviso que aponta para onde a lista nao aponta e pior do
   que nao ter aviso.

   A ordem passa a ser: fechada por ultimo, atrasada primeiro, e so entao
   prioridade e prazo.

   -------------------------------------------------------------------------
   DEFEITO 2 · `current_date` E O DIA DE UTC, NAO O DIA DO RIO

   O Supabase roda em UTC. Das 21h a meia-noite no Rio, `current_date` ja e
   amanha. Consequencia medida na aritmetica: toda demanda que vence HOJE
   aparece como ATRASADA a partir das 21h, e o aviso vermelho do topo aparece
   para quem esta olhando o celular a noite, sobre uma demanda que ainda tem o
   dia inteiro de amanha.

   `lib/demandas/regras.ts:128-158` ja documenta essa divida do lado do
   cliente. Ela e do banco.

   `demandas.hoje()` entra e passa a ser a unica definicao de "hoje" do
   sistema: `dem_lista`, `dem_numeros`, `resumo`, `dem_mover` e `dem_abrir`.

   -------------------------------------------------------------------------
   DEFEITO 3 · `busca` LEVAVA OS CURINGAS DO ILIKE INTEIROS

     busca: "%"  -> devolve TUDO
     busca: "_"  -> devolve TUDO

   Nao e ataque; e a pessoa procurando um titulo que tem `%` ou `_`, e o
   sistema respondendo com a base inteira. O escape entra.

   -------------------------------------------------------------------------
   DEFEITO 4 · `aba` DESCONHECIDA FALHAVA ABERTO

     {"aba":"inventada"} -> devolve TUDO

   As tres comparacoes sao `<> 'minhas'`, `<> 'setor'`, `<> 'comigo'`. Uma aba
   que nao e nenhuma das tres satisfaz as tres, e o filtro desaparece. Um
   filtro que falha aberto e a forma exata de um vazamento silencioso: se
   amanha alguem escrever `aba: 'meu_setor'` por engano num refactor, a tela
   passa a mostrar tudo e ninguem percebe, porque nada quebra.

   -------------------------------------------------------------------------
   DEFEITO 5 · ALEM DE 300, O RESTO ERA INALCANCAVEL

   O teto de 300 da migracao 57 esta certo. O que faltava era a porta para o
   301: `dem_lista` nao tinha cursor nenhum. `tem_mais` avisava que havia
   mais, e nao havia como pedir.

   O cursor e `depois_de` (o numero da ultima demanda da pagina) junto com a
   mesma ordenacao — nao um `offset`, que numa lista que muda de ordem
   sozinha pula e repete linhas.

   -------------------------------------------------------------------------
   DEFEITO 6 · `no_prazo_pct` CONTAVA QUEM NUNCA TEVE PRAZO COMO PONTUAL

       count(*) filter (where prazo is null or concluida_em::date <= prazo)

   Demanda sem prazo nao e pontual nem atrasada: ela nao tem o que medir.
   Contar como pontual infla o numero exatamente no caso em que o sistema
   menos sabe. Medido pelo auditor: 90% relatado contra 50% real.

   Agora o indicador olha so quem tinha prazo, e devolve junto quantas ficaram
   de fora da conta, para o numero nao fingir uma base que nao tem.
   ============================================================================= */

begin;

/* -------------------------------------------------------------------------
   0 · A TROCA QUE ACEITA JA TER SIDO FEITA

   `public.troca_unica` da 86 levanta quando o trecho antigo nao existe, e
   isso esta certo para ela: as funcoes que a 86 opera sao reescritas
   inteiras pela 85, entao reaplicar a rodada devolve o alvo ao lugar.

   `dem_numeros` nao tem esse socorro: nenhuma migracao anterior a reescreve
   por inteiro. Se a 87 so soubesse levantar, ela viraria um arquivo de uso
   unico, e o primeiro problema que aparecesse em producao deixaria o banco
   sem como voltar. Entao aqui a troca distingue "o alvo nao existe" de "o
   alvo nao existe PORQUE ja foi trocado", e a segunda e sucesso. */
create or replace function public.troca_unica_ou_ja(s text, antes text, depois text, etiqueta text)
returns text language plpgsql immutable as $fn$
declare v_a int; v_d int;
begin
  v_a := (length(s) - length(replace(s, antes, ''))) / nullif(length(antes), 0);
  v_d := (length(s) - length(replace(s, depois, ''))) / nullif(length(depois), 0);
  if v_a = 1 then return replace(s, antes, depois); end if;
  if coalesce(v_a, 0) = 0 and coalesce(v_d, 0) >= 1 then
    raise notice '  (troca "%" ja estava feita)', etiqueta;
    return s;
  end if;
  raise exception E'TROCA "%" casou % vez(es) do texto antigo e % do novo.\n'
    '  O banco nao esta nem antes nem depois desta migracao. Nada foi gravado.',
    etiqueta, coalesce(v_a,0), coalesce(v_d,0);
end $fn$;

/* -------------------------------------------------------------------------
   1 · HOJE, NO FUSO DE QUEM USA */
create or replace function demandas.hoje() returns date
language sql stable parallel safe as $fn$
  select (now() at time zone 'America/Sao_Paulo')::date
$fn$;

comment on function demandas.hoje() is
  'O dia de hoje no Rio, e a unica definicao de "hoje" do sistema de demandas. '
  '`current_date` no Supabase e o dia de UTC: das 21h a meia-noite ele ja e '
  'amanha, e tudo que vence hoje aparece como atrasado. Ver a migracao 87.';

/* -------------------------------------------------------------------------
   2 · ESCAPAR O QUE O ILIKE LE COMO CURINGA */
create or replace function demandas.como_texto(t text) returns text
language sql immutable parallel safe as $fn$
  /* `\` primeiro, senao ele escapa os escapes que vierem depois */
  select pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
           coalesce(t,''), '\', '\\'), '%', '\%'), '_', '\_')
$fn$;

create or replace function demandas.atrasada(d demandas.demandas) returns boolean
language sql stable as $fn$
  select d.prazo is not null and d.prazo < demandas.hoje()
     and d.status in ('aberta','execucao','travada')
$fn$;

comment on function demandas.atrasada(demandas.demandas) is
  'A unica definicao de "atrasada". Estava escrita cinco vezes, em dem_lista, '
  'dem_numeros (tres) e resumo. Ver a migracao 87.';

/* -------------------------------------------------------------------------
   3 · `resumo`: atrasada passa a ser a verdade do Rio, e vira chave de ordem */
create or replace function demandas.resumo(d demandas.demandas) returns jsonb
language sql stable as $function$
  select jsonb_build_object(
    'numero', d.numero, 'titulo', d.titulo,
    'status', d.status, 'travada_por', d.travada_por,
    'prioridade', d.prioridade,
    'categoria', (select c.nome from demandas.categorias c where c.id = d.categoria_id),
    'grupo', (select c.grupo from demandas.categorias c where c.id = d.categoria_id),
    'solicitante', (select s.nome from demandas.setores s where s.id = d.setor_solicitante),
    'responsavel_setor', (select s.nome from demandas.setores s where s.id = d.setor_responsavel),
    'responsavel', (select x.nome from demandas.membros x where x.id = d.responsavel_id),
    'abriu', (select x.nome from demandas.membros x where x.id = d.aberta_por),
    'prazo', d.prazo, 'evento_data', d.evento_data, 'evento', d.evento,
    'aprovacao', d.aprovacao,
    'criada_em', d.criada_em, 'mexida_em', d.mexida_em,
    'parada_dias', floor(extract(epoch from (now() - d.mexida_em)) / 86400)::int,
    'atrasada', demandas.atrasada(d),
    'reaberturas', d.reaberturas);
$function$;

/* -------------------------------------------------------------------------
   4 · dem_lista */
create or replace function public.dem_lista(p_token text default null, p_f jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'demandas','public'
as $function$
declare
  m demandas.membros; v jsonb; v_total int; v_lim int;
  v_aba text := coalesce(nullif(p_f->>'aba',''), 'tudo');
  v_busca text; v_depois int;
  v_ck_f int; v_ck_a int; v_ck_p int; v_ck_prazo date;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

  /* ---- 87 · OS ERROS DE FILTRO PARAM DE LEVANTAR --------------------
     A 68 e a 80 tiraram os casts cegos daqui, mas deixaram os tres guardas
     como `raise exception ... errcode = 'raise_exception'` (P0001). O
     PostgREST devolve isso como HTTP 400 com o codigo, `lib/erros.ts:289`
     passa P0001 adiante palavra por palavra, e `PORBANCO` nao conhece
     nenhum dos tres nomes. Resultado na tela: o texto cru.
     Guarda de entrada devolve `{ok:false, erro:...}` como todas as outras
     funcoes deste sistema; levantar era a excecao, nao a regra. */
  if (p_f ? 'setor') and nullif(p_f->>'setor','') is not null
     and p_f->>'setor' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'erro', 'SETOR_INVALIDO');
  end if;
  if (p_f ? 'abertas') and coalesce(p_f->>'abertas','') not in ('', 'true', 'false') then
    return jsonb_build_object('ok', false, 'erro', 'FILTRO_INVALIDO', 'campo', 'abertas');
  end if;
  if (p_f ? 'atrasadas') and coalesce(p_f->>'atrasadas','') not in ('', 'true', 'false') then
    return jsonb_build_object('ok', false, 'erro', 'FILTRO_INVALIDO', 'campo', 'atrasadas');
  end if;
  if (p_f ? 'limite') and coalesce(p_f->>'limite','') !~ '^-?[0-9]{1,9}$' then
    return jsonb_build_object('ok', false, 'erro', 'LIMITE_INVALIDO');
  end if;
  if (p_f ? 'status') and coalesce(p_f->>'status','')
     not in ('', 'aberta','execucao','travada','concluida','cancelada') then
    return jsonb_build_object('ok', false, 'erro', 'FILTRO_INVALIDO', 'campo', 'status');
  end if;
  /* 87 · ABA DESCONHECIDA FALHAVA ABERTO. As tres comparacoes sao `<> x`, e
     uma aba que nao e nenhuma das tres satisfaz as tres: o filtro some e a
     funcao devolve tudo. Lista fechada. */
  if v_aba not in ('tudo','minhas','setor','comigo') then
    return jsonb_build_object('ok', false, 'erro', 'ABA_INVALIDA');
  end if;
  if (p_f ? 'depois_de') and coalesce(p_f->>'depois_de','') !~ '^[0-9]{1,9}$' then
    return jsonb_build_object('ok', false, 'erro', 'CURSOR_INVALIDO');
  end if;

  v_lim := least(greatest(coalesce((p_f->>'limite')::int, 300), 1), 300);
  v_busca := demandas.limpo(p_f->>'busca');
  v_depois := nullif(p_f->>'depois_de','')::int;

  /* As chaves da ULTIMA linha da pagina anterior, lidas uma vez. Comparar uma
     tupla contra uma subconsulta dentro do CTE nao funciona (o Postgres le a
     subconsulta como uma coluna so), e deixar a leitura aqui torna o `where`
     la embaixo legivel: "tudo que vem depois desta linha na mesma ordem". */
  if v_depois is not null then
    select case when d.status in ('concluida','cancelada') then 1 else 0 end,
           case when demandas.atrasada(d) then 0 else 1 end,
           case d.prioridade when 'urgente' then 0 when 'alta' then 1
                             when 'normal' then 2 else 3 end,
           coalesce(d.prazo, 'infinity'::date)
      into v_ck_f, v_ck_a, v_ck_p, v_ck_prazo
      from demandas.demandas d where d.numero = v_depois;
    if v_ck_f is null then return jsonb_build_object('ok', false, 'erro', 'CURSOR_INVALIDO'); end if;
  end if;

  with filtradas as (
    /* a linha inteira vai junto como coluna composta, para `resumo` receber
       exatamente `demandas.demandas` mesmo com as chaves de ordem do lado */
    select d as linha, d.numero, d.prazo,
           (case when d.status in ('concluida','cancelada') then 1 else 0 end) k_fechada,
           (case when demandas.atrasada(d) then 0 else 1 end) k_atraso,
           (case d.prioridade when 'urgente' then 0 when 'alta' then 1
                              when 'normal' then 2 else 3 end) k_prio
      from demandas.demandas d
     where demandas.pode_ver(m, d)
       and (v_aba <> 'minhas' or d.aberta_por = m.id)
       and (v_aba <> 'setor'
            or (m.setor_id is not null and d.setor_responsavel = m.setor_id))
       and (v_aba <> 'comigo' or d.responsavel_id = m.id)
       and (nullif(p_f->>'status','') is null or d.status = p_f->>'status')
       and (coalesce(nullif(p_f->>'abertas','')::boolean, false) = false
            or d.status in ('aberta','execucao','travada'))
       and (coalesce(nullif(p_f->>'atrasadas','')::boolean, false) = false
            or demandas.atrasada(d))
       and (nullif(p_f->>'setor','') is null
            or d.setor_responsavel = (p_f->>'setor')::uuid)
       /* 87 · `%` e `_` eram curingas: `busca: "%"` devolvia a base inteira.
          Nao e ataque, e a pessoa procurando um titulo que tem esses sinais. */
       and (v_busca is null
            or d.titulo    ilike '%'||demandas.como_texto(v_busca)||'%'
            or d.descricao ilike '%'||demandas.como_texto(v_busca)||'%'
            or d.numero::text = v_busca)
  ), ordenadas as (
    /* 87 · A ORDEM QUE A TELA JA PROMETIA. Fechada por ultimo, atrasada
       primeiro, e so entao prioridade e prazo. `numero desc` no fim e o
       desempate TOTAL de que o cursor depende: sem ele, a proxima pagina
       pula e repete linhas. */
    select f.* from filtradas f
     where v_depois is null
        or (f.k_fechada, f.k_atraso, f.k_prio, coalesce(f.prazo, 'infinity'::date), -f.numero)
          > (v_ck_f, v_ck_a, v_ck_p, v_ck_prazo, -v_depois)
     order by f.k_fechada, f.k_atraso, f.k_prio, f.prazo nulls last, f.numero desc
     limit v_lim
  )
  select coalesce(jsonb_agg(demandas.resumo(o.linha) order by
           o.k_fechada, o.k_atraso, o.k_prio, o.prazo nulls last, o.numero desc), '[]'::jsonb),
         (select count(*) from filtradas)
    into v, v_total
    from ordenadas o;

  return jsonb_build_object('ok', true, 'itens', v,
                            'total', v_total, 'limite', v_lim,
                            /* o cursor da proxima pagina: o numero da ultima
                               linha desta. A tela devolve isso em `depois_de`. */
                            'proximo', case when jsonb_array_length(v) >= v_lim
                                            then (v -> (jsonb_array_length(v)-1) ->> 'numero')::int
                                            else null end,
                            'tem_mais', v_total > jsonb_array_length(v)
                                        and v_depois is null);
end $function$;

/* -------------------------------------------------------------------------
   5 · dem_numeros: o dia certo, e o indicador que parava de fingir base */
do $cirurgia$
declare src text; novo text;
begin
  select pg_get_functiondef('public.dem_numeros(text,date,date)'::regprocedure) into src;
  novo := src;

  /* DUAS MUDANCAS INDEPENDENTES, DUAS TROCAS INDEPENDENTES. Na primeira
     versao elas eram uma so, e isso deixou o arquivo sem como se recuperar
     de um estado parcial: uma bateria de sabotagem tirou `no_prazo_base` da
     funcao e a troca unica passou a nao casar nem com o texto antigo nem com
     o novo. Mudanca separada, troca separada. */
  novo := public.troca_unica_ou_ja(novo,
    '''no_prazo_pct'', (select case when count(*) = 0 then null else
                       round(100.0 * count(*) filter (
                         where prazo is null or concluida_em::date <= prazo) / count(*), 0) end',
    /* 87 · demanda sem prazo nao e pontual nem atrasada: ela nao tem o que
       medir. Contar como pontual inflava o numero exatamente onde o sistema
       menos sabe (90% relatado contra 50% real). */
    '''no_prazo_pct'', (select case when count(*) filter (where prazo is not null) = 0 then null else
                       round(100.0 * count(*) filter (
                         where prazo is not null and concluida_em::date <= prazo)
                         / count(*) filter (where prazo is not null), 0) end',
    'dem_numeros: no_prazo_pct');

  /* e o tamanho da base junto: um indicador que nao diz sobre quantas linhas
     ele foi calculado nao e indicador, e slogan. */
  novo := public.troca_unica_ou_ja(novo,
    '    ''no_prazo_pct'', (select case',
    '    ''no_prazo_base'', (select count(*) from base where status = ''concluida'' and prazo is not null),
    ''no_prazo_pct'', (select case',
    'dem_numeros: no_prazo_base');

  /* e `current_date` vira o dia do Rio em todo lugar desta funcao. Aqui nao
     cabe contagem exata (sao sete ocorrencias hoje, e podem virar oito
     amanha), entao o que se exige e o RESULTADO: nenhuma sobra. */
  novo := replace(novo, 'current_date', 'demandas.hoje()');
  if position('current_date' in novo) > 0 then
    raise exception 'dem_numeros: sobrou current_date depois da troca';
  end if;
  if position('demandas.hoje()' in novo) = 0 then
    raise exception 'dem_numeros: nao ficou nenhuma chamada a demandas.hoje()';
  end if;
  execute novo;
end $cirurgia$;

/* -------------------------------------------------------------------------
   6 · e nas duas portas de escrita, o mesmo dia */
do $cirurgia$
declare src text; novo text;
begin
  select pg_get_functiondef('public.dem_mover(text,integer,text,jsonb)'::regprocedure) into src;
  novo := public.troca_unica_ou_ja(src,
    'atraso_motivo = case when prazo is not null and current_date > prazo',
    'atraso_motivo = case when prazo is not null and demandas.hoje() > prazo',
    'dem_mover: hoje no atraso_motivo');
  novo := public.troca_unica_ou_ja(novo,
    'if d.prazo is not null and d.prazo < current_date
       and demandas.limpo(p_d->>''atraso'') is null then',
    'if d.prazo is not null and d.prazo < demandas.hoje()
       and demandas.limpo(p_d->>''atraso'') is null then',
    'dem_mover: hoje no guarda de atraso');
  execute novo;

  select pg_get_functiondef('public.dem_abrir(text,jsonb)'::regprocedure) into src;
  novo := public.troca_unica_ou_ja(src,
    'if v_prazo is not null and v_prazo < current_date then',
    'if v_prazo is not null and v_prazo < demandas.hoje() then',
    'dem_abrir: hoje no prazo no passado');
  execute novo;
end $cirurgia$;

/* =============================================================================
   CONFERENCIA
   ============================================================================= */
do $conf$
declare
  falhas text[] := '{}';
  v_set uuid; v_cat uuid; v_ana uuid;
  r jsonb; v_i int; v_ch text; base jsonb; v_q int; v_n1 int; v_n2 int;
  v_nums int[]; v_pag1 int[]; v_pag2 int[]; v_prox int;
begin
  insert into demandas.setores (nome, slug, ativo, atende, ordem)
    values ('CONF 87 setor', 'conf-87-setor', true, true, 96) returning id into v_set;
  insert into demandas.categorias (grupo, nome, setor_id, ativa)
    values ('CONF 87', 'livre', v_set, true) returning id into v_cat;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('CONF87 Ana', 'conf87-ana', 'responsavel', v_set, true) returning id into v_ana;
  /* `sem_prazo_porque` no molde: `ck_prazo` exige um dos dois, e sem isso as
     demandas sem prazo desta conferencia nem nasciam. Isso derrubou dois
     blocos na primeira rodada, e os dois apontavam para a correcao em vez de
     para a fixture, que e como um teste mal montado gasta o tempo de quem le. */
  base := jsonb_build_object('descricao','Pedido da conferencia da migracao 87.',
                             'setor_solicitante', v_set, 'categoria_id', v_cat,
                             'sem_prazo_porque','a conferencia nao definiu prazo');

  /* ---- 1 · hoje() e o dia do Rio ------------------------------------- */
  if demandas.hoje() <> (now() at time zone 'America/Sao_Paulo')::date then
    falhas := falhas || '1: hoje() nao e o dia do Rio'::text;
  end if;
  /* ESTE CASO PRECISA VALER A QUALQUER HORA, e a primeira versao dele nao
     valia: ela comparava `hoje()` com a data do Rio, e trocar `hoje()` de
     volta por `current_date` so muda alguma coisa entre 21h e meia-noite. Uma
     sabotagem passou por causa disso, e num outro horario o mesmo teste
     "pegaria" sem ninguem ter mudado nada — que e pior.
     `Etc/GMT+12` e `Etc/GMT-14` estao 26 horas de distancia: a data deles
     NUNCA e a mesma, em nenhum instante. Entao `hoje()` ficar igual nos dois
     prova que ela nao depende do fuso da sessao, a qualquer hora do dia. */
  declare v_a date; v_b date; v_c date; v_d2 date;
  begin
    set local timezone = 'Etc/GMT+12';  v_a := demandas.hoje(); v_c := current_date;
    set local timezone = 'Etc/GMT-14';  v_b := demandas.hoje(); v_d2 := current_date;
    set local timezone = 'UTC';
    if v_c = v_d2 then
      falhas := falhas || '1: os dois fusos extremos deram a MESMA data; o caso nao mede nada'::text;
    end if;
    if v_a <> v_b then
      falhas := falhas || format('1: hoje() mudou com o fuso da sessao (%s x %s): ela e current_date disfarcada', v_a, v_b);
    end if;
  end;

  /* ---- 2 · a atrasada sobe ------------------------------------------- */
  r := public.dem_abrir('conf87-ana', base || jsonb_build_object('titulo','Urgente no prazo',
        'prioridade','urgente','impacto','o culto e domingo','prazo',(demandas.hoje()+20)::text));
  v_n1 := (r->>'numero')::int;
  r := public.dem_abrir('conf87-ana', base || jsonb_build_object('titulo','Baixa e atrasada',
        'prioridade','baixa','prazo',(demandas.hoje()+30)::text));
  v_n2 := (r->>'numero')::int;
  update demandas.demandas set prazo = demandas.hoje() - 51 where numero = v_n2;
  r := public.dem_abrir('conf87-ana', base || jsonb_build_object('titulo','Ja concluida',
        'prioridade','urgente','impacto','x','prazo',(demandas.hoje()+5)::text));
  v_i := (r->>'numero')::int;
  perform public.dem_mover('conf87-ana', v_i, 'concluir', '{"texto":"feito"}'::jsonb);

  select array_agg((x->>'numero')::int order by o) into v_nums
    from jsonb_array_elements(public.dem_lista('conf87-ana','{}'::jsonb)->'itens')
         with ordinality t(x, o);
  if v_nums[1] <> v_n2 then
    falhas := falhas || format('2: a atrasada de 51 dias nao esta em primeiro. A ordem veio %s '
      '(atrasada=%s, urgente=%s, concluida=%s)', v_nums, v_n2, v_n1, v_i);
  end if;
  if v_nums[array_length(v_nums,1)] <> v_i then
    falhas := falhas || format('2: a concluida nao foi para o fim. Ordem: %s', v_nums);
  end if;
  /* E A ORDEM DE DENTRO, que e a que decide QUEM CABE NO LIMITE. Sao duas
     ordenacoes: a do `limit` e a do `jsonb_agg`. Se so a de fora estiver
     certa, a pagina sai bonitinha e ordenada — e sem a atrasada, porque ela
     nao entrou no corte. E o defeito mais dificil de ver de todos os deste
     arquivo, e a primeira versao desta conferencia nao o testava. */
  select array_agg((x->>'numero')::int order by o) into v_nums
    from jsonb_array_elements(public.dem_lista('conf87-ana','{"limite":1}'::jsonb)->'itens')
         with ordinality t(x, o);
  if v_nums is null or v_nums[1] <> v_n2 then
    falhas := falhas || format('2: com limite 1 a pagina veio %s e devia vir a atrasada (%s). '
      'A ordem do `limit` nao e a mesma do `jsonb_agg`: a pagina sai ordenada e sem a linha que importa.',
      coalesce(v_nums::text,'vazia'), v_n2);
  end if;

  /* ---- 3 · a busca nao devolve tudo por causa de um curinga ---------- */
  select jsonb_array_length(public.dem_lista('conf87-ana','{"busca":"%"}'::jsonb)->'itens') into v_q;
  if v_q > 0 then
    falhas := falhas || format('3: busca "%%" devolveu %s linhas; ela e texto, nao curinga', v_q);
  end if;
  select jsonb_array_length(public.dem_lista('conf87-ana','{"busca":"_"}'::jsonb)->'itens') into v_q;
  if v_q > 0 then
    falhas := falhas || format('3: busca "_" devolveu %s linhas', v_q);
  end if;
  /* e procurar de verdade continua achando */
  select jsonb_array_length(public.dem_lista('conf87-ana','{"busca":"atrasada"}'::jsonb)->'itens') into v_q;
  if v_q <> 1 then
    falhas := falhas || format('3: procurar "atrasada" devia achar 1 e achou %s', v_q);
  end if;
  /* inclusive um titulo que TEM o curinga dentro */
  perform public.dem_abrir('conf87-ana', base || '{"titulo":"Desconto de 100% na loja"}'::jsonb);
  select jsonb_array_length(public.dem_lista('conf87-ana','{"busca":"100%"}'::jsonb)->'itens') into v_q;
  if v_q <> 1 then
    falhas := falhas || format('3: procurar "100%%" devia achar o titulo que tem isso, e achou %s', v_q);
  end if;

  /* ---- 4 · aba desconhecida nao devolve tudo -------------------------- */
  r := public.dem_lista('conf87-ana','{"aba":"inventada"}'::jsonb);
  if coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || format('4: aba desconhecida falhou ABERTO e devolveu %s linhas',
                               jsonb_array_length(r->'itens'));
  end if;
  for v_ch in select unnest(array['tudo','minhas','setor','comigo']) loop
    if not coalesce((public.dem_lista('conf87-ana', jsonb_build_object('aba', v_ch))->>'ok')::boolean, false) then
      falhas := falhas || format('4: a aba boa "%s" parou de funcionar', v_ch);
    end if;
  end loop;

  /* ---- 5 · os erros de filtro nao levantam mais ----------------------- */
  for v_ch in select unnest(array[
      '{"setor":"x"}', '{"abertas":"talvez"}', '{"atrasadas":"talvez"}',
      '{"limite":"abc"}', '{"status":"inventado"}', '{"depois_de":"abc"}']) loop
    begin
      r := public.dem_lista('conf87-ana', v_ch::jsonb);
      if coalesce((r->>'ok')::boolean, false) then
        falhas := falhas || format('5: %s foi aceito', v_ch);
      end if;
    exception when others then
      falhas := falhas || format('5: %s LEVANTOU (a tela recebe P0001 cru): %s', v_ch, SQLERRM);
    end;
  end loop;

  /* ---- 6 · o cursor alcanca o que esta alem do teto ------------------- */
  for v_i in 1 .. 12 loop
    perform public.dem_abrir('conf87-ana', base ||
      jsonb_build_object('titulo', 'Pagina ' || lpad(v_i::text, 2, '0')));
  end loop;
  r := public.dem_lista('conf87-ana','{"limite":5}'::jsonb);
  select array_agg((x->>'numero')::int order by o) into v_pag1
    from jsonb_array_elements(r->'itens') with ordinality t(x, o);
  v_prox := (r->>'proximo')::int;
  if v_prox is null then
    falhas := falhas || '6: a primeira pagina nao devolveu o cursor da proxima'::text;
  end if;
  r := public.dem_lista('conf87-ana', jsonb_build_object('limite', 5, 'depois_de', v_prox));
  select array_agg((x->>'numero')::int order by o) into v_pag2
    from jsonb_array_elements(r->'itens') with ordinality t(x, o);
  if v_pag2 is null or array_length(v_pag2,1) = 0 then
    falhas := falhas || '6: a segunda pagina veio vazia; alem do teto continua inalcancavel'::text;
  elsif v_pag1 && v_pag2 then
    falhas := falhas || format('6: a segunda pagina REPETE linhas da primeira. p1=%s p2=%s', v_pag1, v_pag2);
  end if;

  /* ---- 7 · no_prazo_pct para de contar quem nao tinha prazo ----------- */
  delete from demandas.eventos where demanda_id in
    (select id from demandas.demandas where setor_solicitante = v_set);
  delete from demandas.demandas where setor_solicitante = v_set;
  /* duas concluidas: uma no prazo, uma atrasada. E duas sem prazo nenhum. */
  r := public.dem_abrir('conf87-ana', base || jsonb_build_object('titulo','No prazo','prazo',(demandas.hoje()+5)::text));
  perform public.dem_mover('conf87-ana', (r->>'numero')::int, 'concluir', '{"texto":"feito"}'::jsonb);
  r := public.dem_abrir('conf87-ana', base || jsonb_build_object('titulo','Atrasada','prazo',(demandas.hoje()+5)::text));
  v_i := (r->>'numero')::int;
  update demandas.demandas set prazo = demandas.hoje() - 10 where numero = v_i;
  perform public.dem_mover('conf87-ana', v_i, 'concluir', '{"texto":"feito","atraso":"demorou"}'::jsonb);
  for v_q in 1 .. 2 loop
    r := public.dem_abrir('conf87-ana', base || jsonb_build_object('titulo','Sem prazo '||v_q,
          'sem_prazo_porque','nao sei quando'));
    perform public.dem_mover('conf87-ana', (r->>'numero')::int, 'concluir', '{"texto":"feito"}'::jsonb);
  end loop;
  /* `dem_numeros` devolve os indicadores DENTRO de `numeros`, e a primeira
     versao deste caso lia a raiz. Com `<>` isso nao aparecia: `null <> 50` e
     NULO, o `if` nao dispara, e o bloco 7 passava sem medir nada. Foi trocar
     por `is distinct from` para o teste falar. Dois bugs meus no mesmo lugar,
     e o segundo escondia o primeiro. */
  /* `+ 1` NO TETO, E NAO E FOLGA: E O PROPRIO DEFEITO QUE A 88 CONSERTOU,
     DENTRO DESTE TESTE — achado em 22/09/2026, as 21:04 do Rio.

     Quando esta conferencia roda, a 88 ainda nao entrou: `dem_numeros` ainda
     recorta por `criada_em::date`, que e o dia do FUSO DA SESSAO. Entre as
     21h do Rio e a meia-noite, `now()` ja e o dia seguinte em UTC, entao a
     demanda que este bloco acabou de abrir cai FORA de uma janela que
     termina em `demandas.hoje()`. A base fica vazia, `no_prazo_base` diz 0 e
     o bloco 7 reprova — 3 horas por dia, todo dia, sem nada de errado no
     sistema.

     Este bloco mede o indicador, nao a fronteira do dia. O teto vai para
     `hoje() + 1` para que ele meça o que se propôs a medir em qualquer hora.
     Quem mede a fronteira e o bloco 4 daqui, que compara `demandas.hoje()`
     com o dia do Rio, e a conferencia da 88, que compara dois fusos a 26
     horas de distancia. */
  r := public.dem_numeros('conf87-ana', demandas.hoje() - 30, demandas.hoje() + 1)->'numeros';
  if r is null then
    falhas := falhas || '7: dem_numeros nao devolveu `numeros`; o bloco 7 nao mede nada'::text;
  end if;
  if (r->>'no_prazo_pct')::int is distinct from 50 then
    falhas := falhas || format('7: no_prazo_pct devia ser 50 (1 de 2 com prazo) e veio %s. '
      'As duas sem prazo estao sendo contadas como pontuais.', r->>'no_prazo_pct');
  end if;
  if (r->>'no_prazo_base')::int is distinct from 2 then
    falhas := falhas || format('7: no_prazo_base devia dizer 2 e disse %s. Um indicador que nao '
      'diz o tamanho da base nao e indicador.', coalesce(r->>'no_prazo_base','<ausente>'));
  end if;

  /* ---- desmonta ------------------------------------------------------- */
  delete from demandas.eventos where demanda_id in
    (select id from demandas.demandas where setor_solicitante = v_set);
  delete from demandas.anexos where demanda_id in
    (select id from demandas.demandas where setor_solicitante = v_set);
  delete from demandas.demandas where setor_solicitante = v_set;
  delete from demandas.membros where token like 'conf87-%';
  delete from demandas.categorias where grupo = 'CONF 87';
  delete from demandas.setores where slug = 'conf-87-setor';

  if array_length(falhas, 1) > 0 then
    raise exception E'87 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 87 · conferencia: 7 blocos. A atrasada sobe e a fechada desce, hoje e o dia do Rio, curinga na busca e texto, aba desconhecida falha FECHADO, filtro errado nao levanta, o cursor alcanca alem do teto, e no_prazo_pct para de contar quem nunca teve prazo.';
end $conf$;

insert into schema_versao (n, arquivo)
     values (87, '87-a-lista-escondia-a-atrasada-e-o-indicador-contava-quem-nao-tinha-prazo.sql')
on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();

commit;
