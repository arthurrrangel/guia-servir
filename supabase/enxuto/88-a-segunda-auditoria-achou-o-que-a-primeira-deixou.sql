do $tranca$begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(88);
  end if;
end
$tranca$;

begin;

create or replace function public.troca_se_faltar(s text, marca text, antes text, depois text, etiqueta text)
returns text language plpgsql immutable as $fn$
begin
  if position(marca in s) > 0 then
    raise notice '  (troca "%" ja estava feita)', etiqueta;
    return s;
  end if;
  return public.troca_unica(s, antes, depois, etiqueta);
end $fn$;
revoke all on function public.troca_se_faltar(text,text,text,text,text) from public;
do $g$begin
  begin execute 'revoke all on function public.troca_se_faltar(text,text,text,text,text) from anon, authenticated';
  exception when undefined_object then null; end;
end
$g$;

create or replace function demandas.dia(t timestamptz) returns date
language sql stable parallel safe as $fn$
  select (t at time zone 'America/Sao_Paulo')::date
$fn$;

comment on function demandas.dia(timestamptz) is
  'O dia de um instante no fuso do Rio. `demandas.hoje()` e o caso particular '
  'de agora. Existe para nao haver um quarto lugar convertendo na mao. '
  'Ver a migracao 88.';

create or replace function demandas.limpo(t text) returns text
language sql immutable parallel safe as $fn$
  select nullif(pg_catalog.regexp_replace(
           pg_catalog.regexp_replace(coalesce(t, ''),
             '^[[:space:]\u0085 ­͏؜ᅟᅠ ᠎ -‏    ⁠-⁤⁪-⁯⠀　ㅤ﻿ﾠ]+', ''),
             '[[:space:]\u0085 ­͏؜ᅟᅠ ᠎ -‏    ⁠-⁤⁪-⁯⠀　ㅤ﻿ﾠ]+$', ''), '')
$fn$;

alter table demandas.demandas drop constraint if exists demandas_titulo_tam_ck;
alter table demandas.demandas add constraint demandas_titulo_tam_ck
  check (coalesce(length(demandas.limpo(titulo)), 0) between 3 and 200) not valid;

alter table demandas.demandas drop constraint if exists demandas_descricao_tam_ck;
alter table demandas.demandas add constraint demandas_descricao_tam_ck
  check (coalesce(length(demandas.limpo(descricao)), 0) between 1 and 20000) not valid;

alter table demandas.anexos drop constraint if exists anexos_nome_tam_ck;
alter table demandas.anexos add constraint anexos_nome_tam_ck
  check (coalesce(length(demandas.limpo(nome)), 0) between 1 and 200) not valid;

create or replace function demandas.url_host(u text) returns text
language sql immutable parallel safe as $fn$
  /* 88 · `rtrim(..., '.')`: `localhost.` e um FQDN absoluto e resolve igual a
     `localhost`. Sem tirar o ponto final, `(^|\.)localhost$` nao casava e o
     ponto ainda satisfazia a exigencia de haver `\.` no host. */
  select rtrim(lower(pg_catalog.substring(
    pg_catalog.regexp_replace(demandas.url_autoridade(u), '^[^@]*@', ''),
    '^[^:]+')), '.')
$fn$;

create or replace function demandas.url_boa(u text) returns boolean
language sql immutable parallel safe as $fn$
  select u is not null
     /* 88 · `~*`: `HTTPS://` em maiusculo e um link valido, e recusa-lo com a
        frase "precisa comecar com https://" e o sistema mentindo. */
     and u ~* '^https://'
     and length(u) between 12 and 2048
     /* 88 · a MESMA classe de espaco de `limpo()`. `[[:space:]]` nao conhece
        U+00A0, e `https://drive.google<NBSP>.com` passava por
        `drive.google.com` numa lida rapida do rotulo. */
     and demandas.limpo(u) = u
     and u !~ '[[:space:]   -‏    ⁠　﻿]'
     and demandas.url_autoridade(u) !~ '@'
     and demandas.url_host(u) ~ '\.'
     and demandas.url_host(u) !~ '(^|\.)localhost$'
     /* 88 · IP escrito de qualquer jeito. `0x7f.0.0.1` resolve para
        127.0.0.1 e escapava do teste de "so digitos e ponto". A regra passa a
        ser por ROTULO: nenhum pedaco do host pode ser so numero, nem comecar
        com `0x`. Nome de dominio de verdade nao tem rotulo assim. */
     and not exists (
       select 1 from unnest(string_to_array(demandas.url_host(u), '.')) r
        where r ~ '^[0-9]+$' or r ~* '^0x[0-9a-f]*$')
     and demandas.url_host(u) !~ '^\[?[0-9a-f:]+\]?$'
$fn$;

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
    'responsavel_id', d.responsavel_id,
    'abriu', (select x.nome from demandas.membros x where x.id = d.aberta_por),
    'prazo', d.prazo, 'evento_data', d.evento_data, 'evento', d.evento,
    'aprovacao', d.aprovacao,
    /* 88 · O VEREDITO, E NAO SO A COLUNA. Ver o item 4 do cabecalho: com a
       coluna crua, o gestor nao via que havia o que aprovar e quem atende via
       botoes que o servidor recusava. */
    'falta_aprovacao', demandas.falta_aprovacao(d),
    'criada_em', d.criada_em, 'mexida_em', d.mexida_em,
    'parada_dias', floor(extract(epoch from (now() - d.mexida_em)) / 86400)::int,
    'atrasada', demandas.atrasada(d),
    'reaberturas', d.reaberturas);
$function$;

do $cirurgia$declare src text; novo text;
begin

  select pg_get_functiondef('public.dem_mover(text,integer,text,jsonb)'::regprocedure) into src;
  novo := src;

  novo := public.troca_unica_ou_ja(novo,
'  if d.aprovacao is null and demandas.falta_aprovacao(d) then
    update demandas.demandas
       set aprovacao = ''pendente'',
           status = case when status in (''aberta'',''execucao'') then ''travada'' else status end,
           travada_por = case when status in (''aberta'',''execucao'') then ''aprovacao'' else travada_por end,
           travada_nota = case when status in (''aberta'',''execucao'')
                               then ''A categoria passou a exigir aprovacao depois que esta demanda foi aberta.''
                               else travada_nota end
     where id = d.id;
    insert into demandas.eventos (demanda_id, membro_id, tipo, para, texto)
      values (d.id, null, ''aprovacao'', ''pendente'',
              ''A categoria passou a exigir aprovacao depois que esta demanda foi aberta.'');
    select * into d from demandas.demandas where id = d.id for update;
  end if;',
'  if d.aprovacao is null and demandas.falta_aprovacao(d) then
    /* 88 · TRES CONSERTOS NESTE BLOCO.

       1. `travada_por` passa a ser ''aprovacao'' SEMPRE, e nao so quando a
          demanda estava aberta ou em execucao. Uma demanda travada por
          ''informacao'' cuja categoria passa a exigir aprovacao ficava
          dizendo "falta informacao" sobre uma compra parada na lideranca, e
          `destravar` recusava para quem atende E para quem abriu: dois botoes
          mortos. A trava antiga vai para a nota, para nao se perder.

       2. O `insert` manual de evento SAIU. `fn_historico` ja grava a mudanca
          de `aprovacao`; os dois juntos escreviam a mesma coisa duas vezes.

       3. `demandas.membro` e limpo durante o update, para o gatilho gravar
          `membro_id` nulo. Sem isso o historico afirmava que quem passou por
          ali e so comentou tinha posto a demanda em aprovacao. Num sistema
          que existe para responder "quem pos isso aqui", isso e registro
          falso. */
    perform set_config(''demandas.membro'', '''', true);
    update demandas.demandas
       set aprovacao = ''pendente'',
           status = case when status in (''aberta'',''execucao'') then ''travada'' else status end,
           travada_por = ''aprovacao'',
           travada_nota = ''A categoria passou a exigir aprovação depois que esta demanda foi aberta.''
             || case when travada_nota is not null and travada_por is distinct from ''aprovacao''
                     then '' (antes estava parada por: '' || travada_nota || '')'' else '''' end
     where id = d.id;
    perform set_config(''demandas.membro'', coalesce(m.id::text, ''''), true);
    select * into d from demandas.demandas where id = d.id for update;
  end if;',
    'dem_mover: a cura');

  novo := public.troca_unica_ou_ja(novo,
    'and a.id = nullif(p_d->>''anexo_id'','''')::uuid',
    'and a.id = (p_d->>''anexo_id'')::uuid',
    'dem_mover: desanexar usa o id ja conferido');

  novo := public.troca_se_faltar(novo, '88 · guarda do anexo_id',
'  elsif p_acao = ''desanexar'' then',
'  elsif p_acao = ''desanexar'' then
    /* 88 · guarda do anexo_id. A unica acao de dem_mover que LEVANTAVA em vez de devolver
       {ok:false}: o cast de `anexo_id` era cego, e o `exception` da funcao so
       pega check_violation e unique_violation. A 86 fechou os casts de
       dem_mover, e este nasceu na 85, depois da leitura. */
    if coalesce(p_d->>''anexo_id'','''') !~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then
      return jsonb_build_object(''ok'', false, ''erro'', ''ANEXO_NAO_ENCONTRADO''); end if;',
    'dem_mover: guarda do anexo_id');

  execute novo;

  select pg_get_functiondef('public.dem_abrir(text,jsonb)'::regprocedure) into src;
  novo := public.troca_unica_ou_ja(src,
'  if v_prazo is not null and v_prazo < demandas.hoje() then
    return jsonb_build_object(''ok'', false, ''erro'', ''PRAZO_NO_PASSADO''); end if;',
'  /* 88 · A GUARDA DE PRAZO NO PASSADO SAIU, E A CULPA E MINHA.

     A 86 passou a recusar prazo no passado chamando isso de "sempre engano de
     digitacao". O repositorio ja tinha decidido o contrario, por escrito, em
     `scripts/demandas-banco.test.sql:227`:

       "o banco aceita prazo no passado DE PROPOSITO: demanda registrada
        depois do fato existe"

     E e verdade: "a lampada do corredor queimou semana passada, poe ai no
     sistema" e o caso normal numa igreja. Eu revertí uma decisao deliberada
     sem ler o motivo dela, e o efeito em cadeia derrubou tres casos da suite
     de 62, porque a demanda vencida que ela monta deixou de nascer.

     O que a regra realmente queria pegar e erro de digitacao, e isso se pega
     ONDE SE DIGITA: `min` no campo de data, em `app/demandas/nova/page.tsx`.
     Guarda de servidor que impede o uso legitimo para evitar um engano de
     tela e a arquitetura pagando por um problema que nao e dela. */',
    'dem_abrir: prazo no passado volta a ser aceito');
  execute novo;

  select pg_get_functiondef('public.dem_numeros(text,date,date)'::regprocedure) into src;
  novo := src;

  novo := replace(novo, 'd.criada_em::date between', 'demandas.dia(d.criada_em) between');
  novo := replace(novo, 'concluida_em::date', 'demandas.dia(concluida_em)');
  if position('::date' in novo) > 0 and novo ~ '(criada_em|concluida_em)::date' then
    raise exception 'dem_numeros: sobrou conversao de data no fuso da sessao';
  end if;

  novo := replace(novo,
'    ''no_prazo_base'', (select count(*) from base where status = ''concluida'' and prazo is not null),
    ''no_prazo_base'', (select count(*) from base where status = ''concluida'' and prazo is not null),
    ''no_prazo_base'', (select count(*) from base where status = ''concluida'' and prazo is not null),',
'    ''no_prazo_base'', (select count(*) from base where status = ''concluida'' and prazo is not null),');

  novo := public.troca_se_faltar(novo, 'PERIODO_INVERTIDO',
'  v_ate := coalesce(p_ate, demandas.hoje());',
'  v_ate := coalesce(p_ate, demandas.hoje());
  /* 88 · invertido, a funcao devolvia "a igreja nao abriu nenhuma demanda no
     periodo" em vez de "as datas estao trocadas". Relatorio mentindo em
     silencio e a classe de defeito que este repositorio existe para nao ter. */
  if v_de > v_ate then return jsonb_build_object(''ok'', false, ''erro'', ''PERIODO_INVERTIDO''); end if;',
    'dem_numeros: periodo invertido');
  execute novo;

  select pg_get_functiondef('public.dem_ajustar(text,text,jsonb)'::regprocedure) into src;
  novo := public.troca_se_faltar(src, 'NUMERO_INVALIDO',
'  if m.papel <> ''admin'' then return jsonb_build_object(''ok'', false, ''erro'', ''SO_ADMIN''); end if;',
'  if m.papel <> ''admin'' then return jsonb_build_object(''ok'', false, ''erro'', ''SO_ADMIN''); end if;

  /* 88 · OS CASTS CEGOS DA TELA DE AJUSTES.

     A 86 fechou os de `dem_abrir` e `dem_mover` e nao olhou para esta. E e a
     tela que um administrador de verdade usa: o campo "ordem" e texto livre
     no navegador, e qualquer coisa que nao seja numero devolvia
     `22P02 invalid input syntax for type integer` em vez de "escreva um
     numero". O `exception` desta funcao so pega unique_violation e
     check_violation, entao o erro cru subia inteiro. */
  if (p_d ? ''id'') and nullif(p_d->>''id'','''') is not null
     and p_d->>''id'' !~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then
    return jsonb_build_object(''ok'', false, ''erro'', ''NAO_EXISTE''); end if;
  if (p_d ? ''setor_id'') and nullif(p_d->>''setor_id'','''') is not null
     and p_d->>''setor_id'' !~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then
    return jsonb_build_object(''ok'', false, ''erro'', ''SETOR_INVALIDO''); end if;
  if (p_d ? ''pessoa_id'') and nullif(p_d->>''pessoa_id'','''') is not null
     and p_d->>''pessoa_id'' !~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then
    return jsonb_build_object(''ok'', false, ''erro'', ''NAO_EXISTE''); end if;
  for v_ch in select unnest(array[''ordem'',''prazo_padrao_dias'']) loop
    if (p_d ? v_ch) and coalesce(p_d->>v_ch,'''') <> '''' and p_d->>v_ch !~ ''^-?[0-9]{1,6}$'' then
      return jsonb_build_object(''ok'', false, ''erro'', ''NUMERO_INVALIDO'', ''campo'', v_ch); end if;
  end loop;
  for v_ch in select unnest(array[''atende'',''ativo'',''ativa'',''exige_aprovacao'',''exige_orcamento'']) loop
    if (p_d ? v_ch) and coalesce(p_d->>v_ch,'''') not in ('''',''true'',''false'') then
      return jsonb_build_object(''ok'', false, ''erro'', ''SIM_OU_NAO'', ''campo'', v_ch); end if;
  end loop;',
    'dem_ajustar: casts cegos');

  novo := public.troca_se_faltar(novo, 'v_id uuid; v_ch text;',
    'declare m demandas.membros; v_id uuid;',
    'declare m demandas.membros; v_id uuid; v_ch text;',
    'dem_ajustar: variavel do laco');

  novo := public.troca_unica_ou_ja(novo,
    'on conflict (grupo, nome) do update set ativa = true
        returning id into v_id;',
'on conflict (grupo, nome) do update set
             ativa = true,
             /* 88 · ERA SO `ativa = true`, e os campos enviados eram
                IGNORADOS EM SILENCIO com `ok:true`. Medido: o admin cria
                "Compra de equipamentos" sem aprovacao e sem orcamento, e o
                que existe depois e a categoria antiga, exigindo os dois,
                reativada por engano. Todo mundo que escolher essa categoria
                vai bater no portao sem entender por que. Resposta errada com
                cara de certa e pior que erro. */
             setor_id = excluded.setor_id,
             exige_aprovacao = excluded.exige_aprovacao,
             exige_orcamento = excluded.exige_orcamento,
             prazo_padrao_dias = excluded.prazo_padrao_dias,
             ordem = excluded.ordem
        returning id into v_id;',
    'dem_ajustar: categoria repetida');
  execute novo;
end
$cirurgia$;

create or replace function public.dem_lista(p_token text default null, p_f jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'demandas','public'
as $function$
declare
  m demandas.membros; v jsonb; v_total int; v_lim int;
  v_aba text := coalesce(nullif(p_f->>'aba',''), 'tudo');
  v_busca text;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

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
  if v_aba not in ('tudo','minhas','setor','comigo') then
    return jsonb_build_object('ok', false, 'erro', 'ABA_INVALIDA');
  end if;
  /* 88 · `depois_de` SAIU. Ver o item 1 do cabecalho: ele lia a linha ancora
     sem `pode_ver` e vazava prioridade, prazo e situacao de demanda de outro
     setor, e perdia e duplicava linhas quando a ordem mudava entre paginas.
     Uma chave que sobrou de um cliente velho nao pode ser ignorada em
     silencio: isso e como um filtro desaparece sem ninguem notar. */
  if p_f ? 'depois_de' then
    return jsonb_build_object('ok', false, 'erro', 'CURSOR_SAIU');
  end if;

  v_lim := least(greatest(coalesce((p_f->>'limite')::int, 300), 1), 300);
  v_busca := demandas.limpo(p_f->>'busca');

  with filtradas as (
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
       and (v_busca is null
            or d.titulo    ilike '%'||demandas.como_texto(v_busca)||'%'
            or d.descricao ilike '%'||demandas.como_texto(v_busca)||'%'
            or d.numero::text = v_busca)
  ), ordenadas as (
    select f.* from filtradas f
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
                            'tem_mais', v_total > jsonb_array_length(v));
end $function$;

revoke all on function public.troca_unica(text,text,text,text) from public;
revoke all on function public.troca_unica_ou_ja(text,text,text,text) from public;
do $g$begin
  for i in 1..1 loop
    begin execute 'revoke all on function public.troca_unica(text,text,text,text) from anon, authenticated';
    exception when undefined_object then null; end;
    begin execute 'revoke all on function public.troca_unica_ou_ja(text,text,text,text) from anon, authenticated';
    exception when undefined_object then null; end;
  end loop;
end
$g$;

do $sondas$begin
  if to_regclass('public.schema_sonda') is not null then
    update public.schema_sonda set procura = 'demandas.falta_aprovacao(d) then'
     where n = 67 and caso like '%concluir olha o portao%';
    update public.schema_sonda set procura = '''FILTRO_INVALIDO'', ''campo'''
     where n = 80 and caso like '%valida os booleanos%';
    update public.schema_sonda set procura = 'SETOR_INVALIDO'
     where n = 80 and caso like '%valida setor antes%';
  end if;
end
$sondas$;

do $conf$declare
  falhas text[] := '{}';
  v_set uuid; v_set2 uuid; v_cat uuid; v_ana uuid; v_ges uuid; v_eva uuid;
  r jsonb; n int; v_i int; v_ch text; base jsonb; v_q int; v_st text; v_tp text; v_js text;
begin
  insert into demandas.setores (nome, slug, ativo, atende, ordem)
    values ('CONF 88 setor', 'conf-88-setor', true, true, 97) returning id into v_set;
  insert into demandas.setores (nome, slug, ativo, atende, ordem)
    values ('CONF 88 fora', 'conf-88-fora', true, true, 98) returning id into v_set2;
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, ativa)
    values ('CONF 88', 'livre', v_set, false, true) returning id into v_cat;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('C88 Ana', 'conf88-ana', 'responsavel', v_set, true) returning id into v_ana;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('C88 Ges', 'conf88-ges', 'gestor', v_set, true) returning id into v_ges;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('C88 Fora', 'conf88-fora', 'responsavel', v_set2, true);
  base := jsonb_build_object('descricao','Conferencia da migracao 88.',
            'setor_solicitante', v_set, 'categoria_id', v_cat, 'sem_prazo_porque','sem data');

  r := public.dem_lista('conf88-ana', '{"depois_de":"1"}'::jsonb);
  if coalesce((r->>'ok')::boolean,false) then
    falhas := falhas || '1: `depois_de` ainda e aceito; o vazamento continua de pe'::text;
  elsif r->>'erro' <> 'CURSOR_SAIU' then
    falhas := falhas || format('1: `depois_de` foi ignorado em silencio: %s', r::text);
  end if;
  if (public.dem_lista('conf88-ana','{}'::jsonb)) ? 'proximo' then
    falhas := falhas || '1: a resposta ainda carrega `proximo`'::text;
  end if;

  r := public.dem_abrir('conf88-ana', base || jsonb_build_object('titulo','Registro retroativo',
        'prazo', (demandas.hoje() - 7)::text));
  if not coalesce((r->>'ok')::boolean,false) then
    falhas := falhas || format('2: registrar o que ja aconteceu foi recusado: %s', r::text);
  end if;
  n := (r->>'numero')::int;
  if not (public.dem_ver('conf88-ana', n)->'demanda'->>'atrasada')::boolean then
    falhas := falhas || '2: a demanda retroativa nao aparece como atrasada'::text;
  end if;

  r := public.dem_abrir('conf88-ana', base || '{"titulo":"Travada por informacao"}'::jsonb);
  n := (r->>'numero')::int;
  perform public.dem_mover('conf88-ana', n, 'assumir', '{}'::jsonb);
  perform public.dem_mover('conf88-ana', n, 'travar',
    '{"motivo":"informacao","texto":"qual a medida do banner"}'::jsonb);
  update demandas.categorias set exige_aprovacao = true where id = v_cat;
  perform public.dem_mover('conf88-ana', n, 'comentar', '{"texto":"so comentando"}'::jsonb);
  select status, travada_por into v_st, v_tp from demandas.demandas where numero = n;
  if v_tp <> 'aprovacao' then
    falhas := falhas || format('3: a cura deixou travada_por=%s; a tela diz "falta informacao" '
      'sobre uma compra parada na lideranca', coalesce(v_tp,'NULL'));
  end if;
  select count(*) into v_q from demandas.eventos e join demandas.demandas d on d.id = e.demanda_id
   where d.numero = n and e.tipo = 'aprovacao';
  if v_q <> 1 then
    falhas := falhas || format('3: a cura gravou %s eventos de aprovacao para uma mudanca so', v_q);
  end if;
  select count(*) into v_q from demandas.eventos e join demandas.demandas d on d.id = e.demanda_id
   where d.numero = n and e.tipo = 'aprovacao' and e.membro_id is not null;
  if v_q > 0 then
    falhas := falhas || '3: o historico atribuiu a decisao a quem so comentou'::text;
  end if;

  if not (public.dem_ver('conf88-ges', n)->'demanda'->>'falta_aprovacao')::boolean then
    falhas := falhas || '3: a ficha nao diz ao gestor que falta aprovacao'::text;
  end if;
  r := public.dem_mover('conf88-ges', n, 'aprovar', '{"texto":"autorizado"}'::jsonb);
  if not coalesce((r->>'ok')::boolean,false) then
    falhas := falhas || format('3: o gestor nao consegue aprovar: %s', r::text);
  end if;
  update demandas.categorias set exige_aprovacao = false where id = v_cat;

  begin
    insert into demandas.demandas (titulo, descricao, categoria_id, setor_solicitante,
      setor_responsavel, aberta_por, status, sem_prazo_porque)
      values (chr(160)||chr(160)||chr(160), 'x', v_cat, v_set, v_set, v_ana, 'aberta', 'x');
    falhas := falhas || '4: titulo so de espacos entrou; a CHECK avalia para NULL e passa'::text;
  exception when check_violation then null; end;

  for v_ch in select unnest(array[
      'https://localhost./admin','https://localhost.:8443/admin','https://0x7f.0.0.1/admin',
      'https://127.0.0.1.nip.io/admin','https://0177.0.0.1/x']) loop
    if demandas.url_boa(v_ch) then falhas := falhas || format('5: url_boa aceitou %s', v_ch); end if;
  end loop;
  if not demandas.url_boa('HTTPS://drive.google.com/file/d/X/view') then
    falhas := falhas || '5: url_boa recusou HTTPS em maiusculo, que e link valido'::text;
  end if;
  if demandas.url_boa('https://drive.google' || chr(160) || '.com/x') then
    falhas := falhas || '5: url_boa aceitou espaco duro no host'::text;
  end if;
  for v_ch in select unnest(array[
      'https://drive.google.com/file/d/1AbC/view?usp=sharing',
      'https://igreja.sharepoint.com/sites/adm/nota.pdf',
      'https://www.dropbox.com/s/abc/orcamento.pdf?dl=0']) loop
    if not demandas.url_boa(v_ch) then falhas := falhas || format('5: url_boa recusou %s', v_ch); end if;
  end loop;

  for v_ch in select unnest(array[chr(133), chr(173), chr(12644), chr(10240), chr(8291), chr(4447)]) loop
    if demandas.limpo(v_ch) is not null then
      falhas := falhas || format('6: limpo() deixou passar U+%s', upper(to_hex(ascii(v_ch))));
    end if;
  end loop;
  if demandas.limpo('  comprei o projetor  ') <> 'comprei o projetor' then
    falhas := falhas || '6: limpo() estragou texto de verdade'::text;
  end if;

  begin
    r := public.dem_mover('conf88-ana', n, 'desanexar', '{"anexo_id":"amanha"}'::jsonb);
    if coalesce((r->>'ok')::boolean,false) then falhas := falhas || '7: desanexar aceitou id invalido'::text; end if;
  exception when others then
    falhas := falhas || format('7: desanexar LEVANTOU com id invalido: %s', SQLERRM);
  end;

  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('C88 Adm', 'conf88-adm', 'admin', v_set, true);
  for v_ch in select unnest(array['{"nome":"x","ordem":"primeiro"}','{"nome":"x","atende":"sim"}','{"id":"nao-e-uuid","nome":"x"}']) loop
    begin
      r := public.dem_ajustar('conf88-adm', 'setor', v_ch::jsonb);
      if coalesce((r->>'ok')::boolean,false) then falhas := falhas || format('8: dem_ajustar aceitou %s', v_ch); end if;
    exception when others then
      falhas := falhas || format('8: dem_ajustar LEVANTOU em %s: %s', v_ch, SQLERRM);
    end;
  end loop;
  r := public.dem_ajustar('conf88-adm', 'categoria',
    jsonb_build_object('grupo','CONF 88','nome','livre','setor_id',v_set,'exige_aprovacao',true));
  if not coalesce((r->>'ok')::boolean,false) then
    falhas := falhas || format('8: criar categoria repetida falhou: %s', r::text);
  end if;
  if not (select exige_aprovacao from demandas.categorias where id = v_cat) then
    falhas := falhas || '8: a categoria repetida ignorou os campos enviados e respondeu ok'::text;
  end if;
  update demandas.categorias set exige_aprovacao = false where id = v_cat;

  r := public.dem_numeros('conf88-ana', demandas.hoje() + 10, demandas.hoje());
  if coalesce((r->>'ok')::boolean,false) then
    falhas := falhas || '9: periodo invertido devolveu ok com tudo zerado'::text;
  end if;
  select (length(pg_get_functiondef('public.dem_numeros(text,date,date)'::regprocedure))
        - length(replace(pg_get_functiondef('public.dem_numeros(text,date,date)'::regprocedure), 'no_prazo_base', '')))
        / length('no_prazo_base') into v_q;
  if v_q <> 1 then falhas := falhas || format('9: `no_prazo_base` aparece %s vezes no corpo', v_q); end if;
  if pg_get_functiondef('public.dem_numeros(text,date,date)'::regprocedure) ~ '(criada_em|concluida_em)::date' then
    falhas := falhas || '9: sobrou conversao de data no fuso da sessao'::text;
  end if;

  if has_function_privilege('anon', 'public.troca_unica(text,text,text,text)', 'execute') then
    falhas := falhas || '10: troca_unica continua alcancavel pela internet'::text;
  end if;
  if to_regprocedure('public.testar_porta_publica()') is not null then
    select count(*) into v_q from public.testar_porta_publica() t where not t.passou;
    if v_q > 0 then falhas := falhas || format('10: a conferencia da 77 ainda reprova em %s caso(s)', v_q); end if;
  end if;

  if to_regprocedure('public.schema_versao_conferir()') is not null then
    select count(*) into v_q from public.schema_versao_conferir() t where not t.passou;
    if v_q > 0 then
      select string_agg(t.caso, '; ') into v_ch from public.schema_versao_conferir() t where not t.passou;
      falhas := falhas || format('11: a regua reprova em %s sonda(s): %s', v_q, v_ch);
    end if;
  end if;

  r := public.dem_abrir('conf88-ana', base || '{"titulo":"Caminho normal"}'::jsonb);
  if not coalesce((r->>'ok')::boolean,false) then falhas := falhas || format('12: abrir quebrou: %s', r::text); end if;
  v_i := (r->>'numero')::int;
  for v_ch, v_js in select * from (values ('assumir','{}'),('comentar','{"texto":"oi"}'),
      ('anexar','{"url":"https://drive.google.com/file/d/Y/view","nome":"doc"}'),
      ('concluir','{"texto":"feito"}')) x(a,b) loop
    r := public.dem_mover('conf88-ana', v_i, v_ch, v_js::jsonb);
    if not coalesce((r->>'ok')::boolean,false) then
      falhas := falhas || format('12: %s quebrou: %s', v_ch, r::text);
    end if;
  end loop;
  if public.dem_ver('conf88-fora', v_i)->>'erro' is distinct from 'NAO_EXISTE' then
    falhas := falhas || '12: quem e de fora passou a enxergar'::text;
  end if;

  delete from demandas.eventos where demanda_id in (select id from demandas.demandas where setor_solicitante in (v_set,v_set2));
  delete from demandas.anexos  where demanda_id in (select id from demandas.demandas where setor_solicitante in (v_set,v_set2));
  delete from demandas.demandas where setor_solicitante in (v_set,v_set2);
  delete from demandas.membros where token like 'conf88-%';
  delete from demandas.categorias where grupo = 'CONF 88';
  delete from demandas.setores where slug in ('conf-88-setor','conf-88-fora');

  if array_length(falhas, 1) > 0 then
    raise exception E'88 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 88 · conferencia: 12 blocos. O cursor saiu com o vazamento junto, o registro retroativo voltou, a cura cobre travada e nao mente sobre quem decidiu, as CHECKs enxergam o vazio, url_boa pega localhost. e 0x7f, limpo() conhece os invisiveis, dem_ajustar nao levanta, o periodo invertido avisa, e a porta publica e a regua voltaram ao verde.';
end
$conf$;

insert into schema_versao (n, arquivo)
     values (88, '88-a-segunda-auditoria-achou-o-que-a-primeira-deixou.sql')
on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();

commit;
