do $tranca$begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(89);
  end if;
end
$tranca$;

begin;

create or replace function demandas.invisiveis() returns text
language sql immutable parallel safe as $fn$
  select '[[:space:]'
      || chr(133)                              -- U+0085  NEL
      || chr(160)                              -- U+00A0  NBSP
      || chr(173)                              -- U+00AD  soft hyphen
      || chr(847)                              -- U+034F  combining grapheme joiner
      || chr(1536) || '-' || chr(1541)         -- U+0600-0605  arabic number signs
      || chr(1564)                             -- U+061C  arabic letter mark
      || chr(1757)                             -- U+06DD  arabic end of ayah
      || chr(1807)                             -- U+070F  syriac abbreviation mark
      || chr(2192) || '-' || chr(2193)         -- U+0890-0891
      || chr(2274)                             -- U+08E2
      || chr(4447) || '-' || chr(4448)         -- U+115F-1160  preenchedores Hangul
      || chr(5760)                             -- U+1680  ogham space
      || chr(6158)                             -- U+180E  mongolian vowel separator
      || chr(8192) || '-' || chr(8207)         -- U+2000-200F  espacos + ZWSP/ZWNJ/ZWJ/LRM/RLM
      || chr(8232) || chr(8233)                -- U+2028-2029  line/paragraph separator
      || chr(8234) || '-' || chr(8238)         -- U+202A-202E  LRE RLE PDF LRO RLO  (Trojan Source)
      || chr(8239)                             -- U+202F  narrow NBSP
      || chr(8287)                             -- U+205F  medium math space
      || chr(8288) || '-' || chr(8292)         -- U+2060-2064  word joiner + invisiveis matematicos
      || chr(8294) || '-' || chr(8303)         -- U+2066-206F  isolates + deprecated  (Trojan Source)
      || chr(10240)                            -- U+2800  braille em branco
      || chr(12288)                            -- U+3000  ideographic space
      || chr(12644)                            -- U+3164  hangul filler
      || chr(65024) || '-' || chr(65039)       -- U+FE00-FE0F  seletores de variacao
      || chr(65279)                            -- U+FEFF  BOM
      || chr(65440)                            -- U+FFA0  halfwidth hangul filler
      || chr(65529) || '-' || chr(65531)       -- U+FFF9-FFFB  interlinear annotation
      || chr(69821) || chr(69837)              -- U+110BD U+110CD  kaithi number sign
      || chr(78896) || '-' || chr(78911)       -- U+13430-1343F  egyptian format controls
      || chr(113824) || '-' || chr(113827)     -- U+1BCA0-1BCA3  shorthand format
      || chr(119155) || '-' || chr(119162)     -- U+1D173-1D17A  musical format
      || chr(917505)                           -- U+E0001  language tag
      || chr(917536) || '-' || chr(917631)     -- U+E0020-E007F  tag characters
      || ']'
$fn$;

comment on function demandas.invisiveis() is
  'A classe de caracteres que nao desenham nada. UMA lista: `limpo()` e '
  '`url_boa()` leem daqui. Antes eram duas copias manuais e so uma cresceu, '
  'e por isso U+3164 era barrado no titulo e aceito no host. Ver a 89.';

do $classe$declare
  v_cf int; v_passam int;
begin

  perform pg_catalog.regexp_replace('x', demandas.invisiveis(), '', 'g');

  with faixas(lo,hi) as (values
    (x'00AD'::int,x'00AD'::int),(x'0600'::int,x'0605'::int),(x'061C'::int,x'061C'::int),
    (x'06DD'::int,x'06DD'::int),(x'070F'::int,x'070F'::int),(x'0890'::int,x'0891'::int),
    (x'08E2'::int,x'08E2'::int),(x'180E'::int,x'180E'::int),(x'200B'::int,x'200F'::int),
    (x'202A'::int,x'202E'::int),(x'2060'::int,x'2064'::int),(x'2066'::int,x'206F'::int),
    (x'FEFF'::int,x'FEFF'::int),(x'FFF9'::int,x'FFFB'::int),(x'110BD'::int,x'110BD'::int),
    (x'110CD'::int,x'110CD'::int),(x'13430'::int,x'1343F'::int),(x'1BCA0'::int,x'1BCA3'::int),
    (x'1D173'::int,x'1D17A'::int),(x'E0001'::int,x'E0001'::int),(x'E0020'::int,x'E007F'::int))
  select count(*), count(*) filter (where demandas.invisiveis() is not null
           and pg_catalog.regexp_replace(chr(cp), demandas.invisiveis(), '', 'g') <> '')
    into v_cf, v_passam
    from (select generate_series(lo,hi) cp from faixas) t;

  if v_passam > 0 then
    raise exception '89 · a classe nao cobre % dos % pontos Cf', v_passam, v_cf;
  end if;
  raise notice '89 · a classe de invisiveis cobre os % pontos Cf do Unicode.', v_cf;
end
$classe$;

create or replace function demandas.limpo(t text) returns text
language sql immutable parallel safe as $fn$
  select nullif(pg_catalog.regexp_replace(
           pg_catalog.regexp_replace(coalesce(t, ''),
             '^(' || demandas.invisiveis() || ')+', ''),
                  '(' || demandas.invisiveis() || ')+$', ''), '')
$fn$;

do $reparo$declare
  r record; v_n int := 0;
begin
  for r in
    select d.id, d.numero, d.titulo, d.descricao
      from demandas.demandas d
     where coalesce(length(demandas.limpo(d.titulo)), 0) not between 3 and 200
        or coalesce(length(demandas.limpo(d.descricao)), 0) not between 1 and 20000
  loop
    insert into demandas.eventos (demanda_id, membro_id, tipo, texto)
      values (r.id, null, 'comentario',
        'O sistema passou a enxergar caracteres invisiveis que antes contavam como texto. '
        || 'O que estava gravado aqui nao era legivel e foi substituido. '
        || 'Titulo original, em bytes: ' || encode(convert_to(coalesce(r.titulo,''), 'UTF8'), 'hex'));

    update demandas.demandas
       set titulo = case when coalesce(length(demandas.limpo(titulo)), 0) between 3 and 200
                         then titulo
                         else coalesce(nullif(left(demandas.limpo(titulo), 200), ''),
                                       'Sem titulo legivel (#' || r.numero || ')') end,
           descricao = case when coalesce(length(demandas.limpo(descricao)), 0) between 1 and 20000
                            then descricao
                            else coalesce(nullif(left(demandas.limpo(descricao), 20000), ''),
                                          'Sem descricao legivel. Ver o historico desta demanda.') end
     where id = r.id;
    v_n := v_n + 1;
  end loop;

  update demandas.anexos
     set nome = coalesce(nullif(left(demandas.limpo(nome), 200), ''), 'Anexo sem nome legivel')
   where coalesce(length(demandas.limpo(nome)), 0) not between 1 and 200;

  if v_n > 0 then
    raise notice '89 · reparo: % demanda(s) tinham texto que so era texto para a regra antiga.', v_n;
  else
    raise notice '89 · reparo: nenhuma linha precisou de conserto.';
  end if;
end
$reparo$;

alter table demandas.demandas   validate constraint demandas_titulo_tam_ck;
alter table demandas.demandas   validate constraint demandas_descricao_tam_ck;
alter table demandas.anexos     validate constraint anexos_nome_tam_ck;

create or replace function demandas.falta_aprovacao(d demandas.demandas)
returns boolean language sql stable as $fn$
  select coalesce(
       d.aprovacao is not distinct from 'pendente'
    or ( d.aprovacao is null
         and d.status not in ('concluida','cancelada')
         and exists (select 1 from demandas.categorias c
                      where c.id = d.categoria_id and c.exige_aprovacao) ), false)
$fn$;

create or replace function demandas.url_host(u text) returns text
language sql immutable parallel safe as $fn$
  /* `coalesce(..., '')`: host vazio e string vazia, nao nulo. Nulo propaga
     para `url_boa` e vira "passa". Ver o item 1 da 89. */
  select coalesce(rtrim(lower(pg_catalog.substring(
    pg_catalog.regexp_replace(demandas.url_autoridade(u), '^[^@]*@', ''),
    '^[^:]+')), '.'), '')
$fn$;

create or replace function demandas.url_boa(u text) returns boolean
language sql immutable parallel safe as $fn$
  select coalesce(
       u is not null
   and u ~* '^https://'
   and length(u) between 12 and 2048
   /* a MESMA lista de `limpo()`, porque agora e a mesma funcao. Em qualquer
      posicao, nao so nas pontas: `drive.google<NBSP>.com` passa por
      `drive.google.com` numa lida rapida do rotulo, e e no meio que ele
      aparece. */
   and u !~ demandas.invisiveis()
   and demandas.url_autoridade(u) !~ '@'
   and demandas.url_host(u) ~ '\.'
   and demandas.url_host(u) !~ '(^|\.)localhost$'
   /* 89 · IP PELO ULTIMO ROTULO.

      A 88 recusava host com QUALQUER rotulo so numerico, e com isso recusava
      `1.bp.blogspot.com` e `0.gravatar.com`. Nenhum TLD do mundo e so
      digito, e todo IP — decimal, octal, hexadecimal, com ponto ou sem —
      termina em digito ou em `0x...`. O ultimo rotulo decide. */
   and pg_catalog.regexp_replace(demandas.url_host(u), '^.*\.', '')
         !~* '^([0-9]+|0x[0-9a-f]*)$'
   and demandas.url_host(u) !~ '^\[?[0-9a-f:]+\]?$'
   , false)
$fn$;

do $anexo$declare v_n int;
begin
  update demandas.anexos
     set removido_em = now()
   where removido_em is null and not demandas.url_boa(url);
  get diagnostics v_n = row_count;
  if v_n > 0 then
    raise notice '89 · % anexo(s) vivo(s) tinham url que a regra nova recusa e foram marcados como tirados.', v_n;
  end if;
end
$anexo$;

alter table demandas.anexos drop constraint if exists anexos_url_ck;
alter table demandas.anexos add constraint anexos_url_ck
  check (removido_em is not null or coalesce(demandas.url_boa(url), false));

do $cirurgia$declare src text; novo text;
begin

  select pg_get_functiondef('public.dem_abrir(text,jsonb)'::regprocedure) into src;

  novo := public.troca_se_faltar(src, '''SETOR_INVALIDO'', ''campo'', ''setor_solicitante''',
'  v_setor := coalesce(nullif(p_d->>''setor_solicitante'','''')::uuid, m.setor_id);',
'  /* 89 · guarda dos setores. A 88 afirmou que a 86 tinha fechado os casts de
     dem_abrir; estes dois ficaram, e o de `setor_solicitante` dispara para
     QUALQUER membro, porque o cast acontece antes da linha que descarta o
     valor de quem nao e gestor. */
  if coalesce(p_d->>''setor_solicitante'','''') <> ''''
     and p_d->>''setor_solicitante'' !~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then
    return jsonb_build_object(''ok'', false, ''erro'', ''SETOR_INVALIDO'', ''campo'', ''setor_solicitante''); end if;
  if coalesce(p_d->>''setor_responsavel'','''') <> ''''
     and p_d->>''setor_responsavel'' !~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then
    return jsonb_build_object(''ok'', false, ''erro'', ''SETOR_INVALIDO'', ''campo'', ''setor_responsavel''); end if;
  v_setor := coalesce(nullif(p_d->>''setor_solicitante'','''')::uuid, m.setor_id);',
    'dem_abrir: guarda dos setores');
  execute novo;

  select pg_get_functiondef('public.dem_ajustar(text,text,jsonb)'::regprocedure) into src;

  novo := replace(src, 'coalesce((p_d->>''ordem'')::int, 99)',
                       'coalesce(nullif(p_d->>''ordem'','''')::int, 99)');
  novo := replace(novo, 'coalesce((p_d->>''ordem'')::int, ordem)',
                        'coalesce(nullif(p_d->>''ordem'','''')::int, ordem)');
  novo := replace(novo, 'coalesce((p_d->>''atende'')::boolean, false)',
                        'coalesce(nullif(p_d->>''atende'','''')::boolean, false)');
  novo := replace(novo, 'coalesce((p_d->>''atende'')::boolean, atende)',
                        'coalesce(nullif(p_d->>''atende'','''')::boolean, atende)');
  novo := replace(novo, 'coalesce((p_d->>''ativo'')::boolean, ativo)',
                        'coalesce(nullif(p_d->>''ativo'','''')::boolean, ativo)');
  novo := replace(novo, 'coalesce((p_d->>''ativa'')::boolean, ativa)',
                        'coalesce(nullif(p_d->>''ativa'','''')::boolean, ativa)');
  novo := replace(novo, 'coalesce((p_d->>''exige_aprovacao'')::boolean, false)',
                        'coalesce(nullif(p_d->>''exige_aprovacao'','''')::boolean, false)');
  novo := replace(novo, 'coalesce((p_d->>''exige_aprovacao'')::boolean, exige_aprovacao)',
                        'coalesce(nullif(p_d->>''exige_aprovacao'','''')::boolean, exige_aprovacao)');
  novo := replace(novo, 'coalesce((p_d->>''exige_orcamento'')::boolean, false)',
                        'coalesce(nullif(p_d->>''exige_orcamento'','''')::boolean, false)');
  novo := replace(novo, 'coalesce((p_d->>''exige_orcamento'')::boolean, exige_orcamento)',
                        'coalesce(nullif(p_d->>''exige_orcamento'','''')::boolean, exige_orcamento)');
  if position('coalesce((p_d->>''ordem'')::int' in novo) > 0
     or position(')::boolean, false)' in replace(novo, 'nullif(p_d->>''atende'','''')::boolean, false)', '')) > 0
       and position('coalesce((p_d->>' in novo) > 0 then
    raise exception '89 · dem_ajustar: sobrou cast sem nullif';
  end if;

  novo := public.troca_se_faltar(novo, '''FALTA_CAMPO'', ''campo'', ''nome''',
'  if p_o_que = ''setor'' then',
'  /* 89 · NOME DE CADASTRO. `dem_ajustar` criava categoria com nome so de
     espaco: `{"grupo":"X","nome":"   "}` devolvia ok e a categoria entrava
     nos seletores sem nada escrito. */
  if p_o_que in (''setor'',''categoria'') and nullif(p_d->>''id'','''') is null
     and demandas.limpo(p_d->>''nome'') is null then
    return jsonb_build_object(''ok'', false, ''erro'', ''FALTA_CAMPO'', ''campo'', ''nome''); end if;
  if p_o_que = ''categoria'' and nullif(p_d->>''id'','''') is null
     and demandas.limpo(p_d->>''grupo'') is null then
    return jsonb_build_object(''ok'', false, ''erro'', ''FALTA_CAMPO'', ''campo'', ''grupo''); end if;
  if (p_d ? ''nome'') and nullif(p_d->>''id'','''') is not null
     and (p_d->>''nome'') is not null and demandas.limpo(p_d->>''nome'') is null then
    return jsonb_build_object(''ok'', false, ''erro'', ''FALTA_CAMPO'', ''campo'', ''nome''); end if;

  if p_o_que = ''setor'' then',
    'dem_ajustar: nome de cadastro');

  novo := public.troca_se_faltar(novo, 'when foreign_key_violation then',
'exception
  when unique_violation then',
'exception
  /* 89 · `dem_abrir`, na mesma familia, ja capturava foreign_key_violation.
     Aqui um `setor_id` inexistente subia 23503 cru para a tela de Ajustes. */
  when foreign_key_violation then
    return jsonb_build_object(''ok'', false, ''erro'', ''SETOR_INVALIDO'');
  when not_null_violation then
    return jsonb_build_object(''ok'', false, ''erro'', ''FALTA_CAMPO'');
  when unique_violation then',
    'dem_ajustar: fk e not-null');
  execute novo;

  select pg_get_functiondef('public.dem_numeros(text,date,date)'::regprocedure) into src;
  novo := replace(src, 'to_char(criada_em, ''YYYY-MM'')',
                       'to_char(demandas.dia(criada_em), ''YYYY-MM'')');
  novo := replace(novo, 'to_char(d.criada_em, ''YYYY-MM'')',
                        'to_char(demandas.dia(d.criada_em), ''YYYY-MM'')');
  novo := replace(novo, 'to_char(concluida_em, ''YYYY-MM'')',
                        'to_char(demandas.dia(concluida_em), ''YYYY-MM'')');
  execute novo;

  select pg_get_functiondef('public.dem_numeros(text,date,date)'::regprocedure) into novo;
  if pg_catalog.regexp_replace(novo, 'demandas\.dia\([^)]*\)', '', 'g')
       ~ '(criada_em|concluida_em|mexida_em)\s*(::|,)' then
    raise exception '89 · dem_numeros: sobrou conversao de instante fora de demandas.dia()';
  end if;

  select pg_get_functiondef('public.dem_lista(text,jsonb)'::regprocedure) into src;
  novo := public.troca_unica_ou_ja(src,
'  if (p_f ? ''limite'') and coalesce(p_f->>''limite'','''') !~ ''^-?[0-9]{1,9}$'' then
    return jsonb_build_object(''ok'', false, ''erro'', ''LIMITE_INVALIDO'');
  end if;',
'  /* 89 · `-1` e `0` passavam por esta guarda, porque ela so conferia o
     FORMATO, e o `-` estava DENTRO do formato aceito. Iam para o
     `least(greatest(..., 1), 300)` da linha de baixo e viravam 1 em
     silencio: a pessoa pede zero itens, recebe um, e nada avisa. A 88
     escreveu que "uma chave que sobrou de um cliente velho nao pode ser
     ignorada em silencio"; vale para o valor tambem.

     Sao dois `if` e nao um `or` porque o segundo faz `::int`, e com
     `limite` presente e vazio o cast levantaria: o primeiro `if` ja
     devolveu antes de chegar la. */
  if (p_f ? ''limite'') and coalesce(p_f->>''limite'','''') !~ ''^[0-9]{1,6}$'' then
    return jsonb_build_object(''ok'', false, ''erro'', ''LIMITE_INVALIDO'');
  end if;
  if (p_f ? ''limite'') and (p_f->>''limite'')::int < 1 then
    return jsonb_build_object(''ok'', false, ''erro'', ''LIMITE_INVALIDO'');
  end if;',
    'dem_lista: limite invalido');
  execute novo;

  select pg_get_functiondef('public.dem_ver(text,int)'::regprocedure) into src;
  novo := public.troca_se_faltar(src, '''posso_tirar''',
'        ''quem'', (select x.nome from demandas.membros x where x.id = a.membro_id),',
'        ''quem'', (select x.nome from demandas.membros x where x.id = a.membro_id),
        /* 89 · O SERVIDOR DIZ, A TELA NAO RECALCULA.

           `desanexar` aceita `pode_atender(m,d) or a.membro_id = m.id`: quem
           abriu mas nao atende so tira o que ele mesmo colou. A tela oferecia
           "tirar" em todo anexo e nao tinha como acertar, porque o payload
           trazia o NOME de quem colou e nunca o id. A MESMA expressao do
           `desanexar`, decidida aqui. */
        ''posso_tirar'', (demandas.pode_atender(m, d) or a.membro_id = m.id),',
    'dem_ver: posso_tirar');
  execute novo;

  select pg_get_functiondef('public.dem_mover(text,int,text,jsonb)'::regprocedure) into src;
  if position('ANEXO_NAO_ENCONTRADO'', ''campo'', ''anexo_id''' in src) = 0 then
    novo := replace(src,
      'return jsonb_build_object(''ok'', false, ''erro'', ''ANEXO_NAO_ENCONTRADO''); end if;',
      'return jsonb_build_object(''ok'', false, ''erro'', ''ANEXO_NAO_ENCONTRADO'', ''campo'', ''anexo_id''); end if;');
    execute novo;
  end if;
end
$cirurgia$;

do $conf$declare
  falhas text[] := '{}';
  v_set uuid; v_set2 uuid; v_cat uuid; v_catx uuid;
  v_ana uuid; v_bia uuid; v_eva uuid; v_adm uuid;
  r jsonb; n int; v_ch text; v_u text; base jsonb; v_id uuid; v_b boolean;
begin
  insert into demandas.setores (nome, slug, ativo, atende, ordem)
    values ('CONF89 dentro', 'conf-89-setor', true, true, 99) returning id into v_set;
  insert into demandas.setores (nome, slug, ativo, atende, ordem)
    values ('CONF89 fora', 'conf-89-fora', true, true, 99) returning id into v_set2;
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, exige_orcamento, ativa)
    values ('CONF 89', 'livre', v_set, false, false, true) returning id into v_cat;
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, exige_orcamento, ativa)
    values ('CONF 89', 'exige', v_set, true, false, true) returning id into v_catx;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('CONF89 Ana', 'conf89-ana', 'responsavel', v_set, true) returning id into v_ana;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('CONF89 Bia', 'conf89-bia', 'responsavel', v_set, true) returning id into v_bia;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('CONF89 Eva', 'conf89-eva', 'solicitante', v_set, true) returning id into v_eva;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('CONF89 Adm', 'conf89-adm', 'admin', v_set, true) returning id into v_adm;

  base := jsonb_build_object('descricao','Conferencia da 89.',
            'setor_solicitante', v_set, 'categoria_id', v_cat,
            'prazo', (demandas.hoje() + 15)::text);

  for v_u in select unnest(array[
      'https://:8443/orcamento.pdf', 'https:///x.pdf', 'https://./x.pdf',
      'https://../x.pdf', 'https://:/x.pdf']) loop
    if demandas.url_boa(v_u) is null then
      falhas := falhas || format('1: url_boa(%s) devolveu NULO', v_u); end if;
    if coalesce(demandas.url_boa(v_u), true) then
      falhas := falhas || format('1: url_boa aceitou %s', v_u); end if;
  end loop;
  if demandas.url_host('https://:8443/x.pdf') is null then
    falhas := falhas || '1: url_host devolveu NULO em vez de string vazia'::text; end if;

  for v_ch in select unnest(array[
      chr(133), chr(173), chr(847), chr(1564), chr(4447), chr(6158),
      chr(8234), chr(8238), chr(8294), chr(8297), chr(10240), chr(12644),
      chr(65440), chr(65529), chr(917505), chr(917536), chr(917631)]) loop
    if demandas.limpo(v_ch) is not null then
      falhas := falhas || format('2: limpo() nao ve U+%s', upper(lpad(to_hex(ascii(v_ch)),4,'0'))); end if;
    if demandas.url_boa('https://drive.google' || v_ch || '.com/file/d/X/view') then
      falhas := falhas || format('2: url_boa aceitou U+%s no host', upper(lpad(to_hex(ascii(v_ch)),4,'0'))); end if;
  end loop;

  r := public.dem_abrir('conf89-ana', base || jsonb_build_object('titulo',
         chr(8238) || chr(8294) || chr(1536) || chr(917505) || chr(65529)));
  if coalesce((r->>'ok')::boolean,false) then
    falhas := falhas || '2: demanda de titulo invisivel NASCEU pela porta oficial'::text; end if;

  if demandas.limpo('Compra do projetor') is distinct from 'Compra do projetor' then
    falhas := falhas || '2: limpo() estragou texto normal'::text; end if;
  if demandas.limpo('  Compra  ') is distinct from 'Compra' then
    falhas := falhas || '2: limpo() deixou de aparar espaco comum'::text; end if;
  if not demandas.url_boa('https://drive.google.com/file/d/1AbC/view') then
    falhas := falhas || '2: url_boa recusou um link bom'::text; end if;
  if not demandas.url_boa('HTTPS://drive.google.com/file/d/1AbC/view') then
    falhas := falhas || '2: url_boa recusou HTTPS em maiusculo'::text; end if;

  r := public.dem_abrir('conf89-ana', base || '{"titulo":"Veredito fechado"}'::jsonb);
  n := (r->>'numero')::int;
  perform public.dem_mover('conf89-ana', n, 'assumir', '{}'::jsonb);
  perform public.dem_mover('conf89-ana', n, 'concluir', '{"texto":"feito"}'::jsonb);
  select demandas.falta_aprovacao(d) into v_b from demandas.demandas d where d.numero = n;
  if v_b is null then
    falhas := falhas || '4: falta_aprovacao devolveu NULO em demanda concluida'::text; end if;
  if v_b then
    falhas := falhas || '4: demanda concluida diz que falta aprovacao'::text; end if;
  if jsonb_typeof(public.dem_ver('conf89-ana', n)->'demanda'->'falta_aprovacao') <> 'boolean' then
    falhas := falhas || format('4: o resumo manda %s em vez de booleano',
      jsonb_typeof(public.dem_ver('conf89-ana', n)->'demanda'->'falta_aprovacao')); end if;

  r := public.dem_abrir('conf89-ana', base || jsonb_build_object('titulo','Veredito aberto','categoria_id',v_catx));
  if not (public.dem_ver('conf89-ana', (r->>'numero')::int)->'demanda'->>'falta_aprovacao')::boolean then
    falhas := falhas || '4: o portao fechado nao aparece no resumo'::text; end if;

  for v_u in select unnest(array[
      'https://127.0.0.1/x.pdf','https://0x7f.0.0.1/x.pdf','https://0177.0.0.1/x.pdf',
      'https://127.1/x.pdf','https://169.254.169.254/latest/meta-data',
      'https://localhost./x.pdf','https://[::1]/x.pdf','https://evil.0x41/x.pdf']) loop
    if demandas.url_boa(v_u) then falhas := falhas || format('5: aceitou %s', v_u); end if;
  end loop;
  for v_u in select unnest(array[
      'https://1.bp.blogspot.com/-abc/foto.jpg','https://0.gravatar.com/avatar/abcdefgh',
      'https://123.imagem.com.br/foto.jpg','https://2.bp.blogspot.com/x/orcamento.png']) loop
    if not demandas.url_boa(v_u) then
      falhas := falhas || format('5: RECUSOU host legitimo %s', v_u); end if;
  end loop;

  for v_ch in select unnest(array['setor_solicitante','setor_responsavel']) loop
    begin
      r := public.dem_abrir('conf89-ana', base || jsonb_build_object('titulo','Setor torto', v_ch, 'amanha'));
      if coalesce((r->>'ok')::boolean,false) then
        falhas := falhas || format('6: %s aceitou lixo', v_ch); end if;
      if coalesce(r->>'erro','') <> 'SETOR_INVALIDO' then
        falhas := falhas || format('6: %s devolveu %s', v_ch, r::text); end if;
    exception when others then
      falhas := falhas || format('6: %s LEVANTOU %s: %s', v_ch, SQLSTATE, SQLERRM); end;
  end loop;

  for v_ch in select unnest(array[
      '{"nome":"CONF89 Zeta","ordem":""}', '{"nome":"CONF89 Zeta","atende":""}',
      '{"nome":"CONF89 Zeta","ativo":""}', '{"nome":null}', '{"nome":"   "}']) loop
    begin
      r := public.dem_ajustar('conf89-adm', 'setor', v_ch::jsonb);
      if coalesce(r->>'erro','') ~* 'invalid input syntax|violates' then
        falhas := falhas || format('7: vazou erro cru em %s', v_ch); end if;
    exception when others then
      falhas := falhas || format('7: setor %s LEVANTOU %s: %s', v_ch, SQLSTATE, SQLERRM); end;
  end loop;
  begin
    r := public.dem_ajustar('conf89-adm', 'categoria', '{"grupo":"CONF 89","nome":"   "}'::jsonb);
    if coalesce((r->>'ok')::boolean,false) then
      falhas := falhas || '7: criou categoria com nome so de espaco'::text; end if;
  exception when others then
    falhas := falhas || format('7: categoria sem nome LEVANTOU %s: %s', SQLSTATE, SQLERRM); end;

  begin
    r := public.dem_ajustar('conf89-adm', 'membro', '{"papel":"solicitante"}'::jsonb);
    if coalesce((r->>'ok')::boolean,false) then
      falhas := falhas || '7: criou membro sem nome'::text; end if;
    if coalesce(r->>'erro','') ~* 'null value in column|violates not-null' then
      falhas := falhas || '7: vazou o texto cru do not-null'::text; end if;
  exception when others then
    falhas := falhas || format('7: membro sem nome LEVANTOU %s: %s', SQLSTATE, SQLERRM); end;
  begin
    r := public.dem_ajustar('conf89-adm', 'categoria',
           '{"grupo":"CONF 89","nome":"Com setor fantasma","setor_id":"00000000-0000-0000-0000-000000000000"}'::jsonb);
    if coalesce(r->>'erro','') ~* 'violates foreign key' then
      falhas := falhas || '7: vazou o texto cru da chave estrangeira'::text; end if;
    if coalesce((r->>'ok')::boolean,false) then
      falhas := falhas || '7: aceitou setor_id inexistente'::text; end if;
  exception when others then
    falhas := falhas || format('7: fk LEVANTOU %s: %s', SQLSTATE, SQLERRM); end;

  r := public.dem_ajustar('conf89-adm', 'setor', '{"nome":"CONF89 Omega","ordem":"7","atende":"true"}'::jsonb);
  if not coalesce((r->>'ok')::boolean,false) then
    falhas := falhas || format('7: o caminho feliz de setor quebrou: %s', r::text); end if;
  if (select ordem from demandas.setores where nome = 'CONF89 Omega') is distinct from 7 then
    falhas := falhas || '7: o caminho feliz disse ok e nao gravou a ordem'::text; end if;
  if (select ordem from demandas.setores where nome = 'CONF89 Zeta') is distinct from 99 then
    falhas := falhas || '7: `ordem: ""` devia virar o padrao 99'::text; end if;

  r := public.dem_abrir('conf89-ana', base || '{"titulo":"Virada do mes"}'::jsonb);
  n := (r->>'numero')::int;
  update demandas.demandas
     set criada_em = timestamptz '2026-09-30 21:30:00 America/Sao_Paulo'
   where numero = n;
  r := public.dem_numeros('conf89-adm', date '2026-09-01', date '2026-09-30');
  if (select count(*) from jsonb_array_elements(r->'numeros'->'por_mes') x
       where x->>'mes' > '2026-09') > 0 then
    falhas := falhas || format('8: por_mes pos a demanda no mes errado: %s',
      (r->'numeros'->'por_mes')::text); end if;

  for v_ch in select unnest(array['0','-1','-999','abc']) loop
    r := public.dem_lista('conf89-ana', jsonb_build_object('limite', v_ch));
    if coalesce((r->>'ok')::boolean,false) then
      falhas := falhas || format('10: limite %s foi aceito', v_ch); end if;
    if coalesce(r->>'erro','') <> 'LIMITE_INVALIDO' then
      falhas := falhas || format('10: limite %s devolveu %s', v_ch, r::text); end if;
  end loop;
  r := public.dem_lista('conf89-ana', '{"limite":"5"}'::jsonb);
  if not coalesce((r->>'ok')::boolean,false) then
    falhas := falhas || format('10: limite bom foi recusado: %s', r::text); end if;

  r := public.dem_abrir('conf89-eva', base || '{"titulo":"Anexo de quem abriu"}'::jsonb);
  n := (r->>'numero')::int;
  perform public.dem_mover('conf89-eva', n, 'anexar',
    '{"url":"https://drive.google.com/file/d/EVA/view","nome":"da Eva"}'::jsonb);
  perform public.dem_mover('conf89-ana', n, 'anexar',
    '{"url":"https://drive.google.com/file/d/ANA/view","nome":"da Ana"}'::jsonb);

  r := public.dem_ver('conf89-eva', n);
  if (select count(*) from jsonb_array_elements(r->'anexos') a
       where a->>'nome' like '%da Eva%' and not (a->>'posso_tirar')::boolean) > 0 then
    falhas := falhas || '9: a Eva nao pode tirar o anexo que ela mesma colou'::text; end if;
  if (select count(*) from jsonb_array_elements(r->'anexos') a
       where a->>'nome' like '%da Ana%' and (a->>'posso_tirar')::boolean) > 0 then
    falhas := falhas || '9: a tela oferece para a Eva tirar o anexo da Ana'::text; end if;

  select a.id into v_id from demandas.anexos a join demandas.demandas d on d.id = a.demanda_id
   where d.numero = n and a.nome like '%da Ana%';
  r := public.dem_mover('conf89-eva', n, 'desanexar', jsonb_build_object('anexo_id', v_id));
  if coalesce((r->>'ok')::boolean,false) then
    falhas := falhas || '9: a Eva TIROU o anexo da Ana'::text; end if;
  select a.id into v_id from demandas.anexos a join demandas.demandas d on d.id = a.demanda_id
   where d.numero = n and a.nome like '%da Eva%';
  r := public.dem_mover('conf89-eva', n, 'desanexar', jsonb_build_object('anexo_id', v_id));
  if not coalesce((r->>'ok')::boolean,false) then
    falhas := falhas || format('9: a Eva nao conseguiu tirar o proprio anexo: %s', r::text); end if;

  r := public.dem_ver('conf89-ana', n);
  if (select count(*) from jsonb_array_elements(r->'anexos') a
       where not (a->>'posso_tirar')::boolean) > 0 then
    falhas := falhas || '9: quem atende viu anexo marcado como "nao posso tirar"'::text; end if;

  select a.id into v_id from demandas.anexos a join demandas.demandas d on d.id = a.demanda_id
   where d.numero = n limit 1;
  begin
    update demandas.anexos set url = 'https://127.0.0.1/ruim.pdf', removido_em = now() where id = v_id;
    update demandas.anexos set removido_em = now() where id = v_id;
  exception when check_violation then
    falhas := falhas || '6b: a CHECK impede TIRAR um anexo cuja url a regra passou a recusar'::text; end;

  if exists (select 1 from pg_constraint
              where conname in ('demandas_titulo_tam_ck','demandas_descricao_tam_ck','anexos_nome_tam_ck')
                and not convalidated) then
    falhas := falhas || '3: sobrou CHECK not valid depois do reparo'::text; end if;
  begin
    update demandas.demandas set titulo = chr(12644) || chr(8238) || chr(917536) where numero = n;
    falhas := falhas || '3: titulo so de invisiveis passou pela CHECK'::text;
  exception when check_violation then null; end;

  if (select count(*) from regexp_matches(
        pg_get_functiondef('public.dem_mover(text,int,text,jsonb)'::regprocedure),
        'ANEXO_NAO_ENCONTRADO'', ''campo'', ''anexo_id''', 'g')) <> 2 then
    falhas := falhas || format('11: a marca do anexo_id aparece %s vez(es) no codigo executavel, e sao 2',
      (select count(*) from regexp_matches(
         pg_get_functiondef('public.dem_mover(text,int,text,jsonb)'::regprocedure),
         'ANEXO_NAO_ENCONTRADO'', ''campo'', ''anexo_id''', 'g'))); end if;

  for v_ch in select unnest(array[
      'public.troca_unica(text,text,text,text)',
      'public.troca_unica_ou_ja(text,text,text,text)',
      'public.troca_se_faltar(text,text,text,text,text)']) loop
    if to_regprocedure(v_ch) is not null
       and (has_function_privilege('anon', v_ch, 'EXECUTE')
         or has_function_privilege('authenticated', v_ch, 'EXECUTE')) then
      falhas := falhas || format('porta: %s aberta para a porta publica', v_ch); end if;
  end loop;

  delete from demandas.eventos where demanda_id in (select id from demandas.demandas where setor_solicitante in (v_set,v_set2));
  delete from demandas.anexos  where demanda_id in (select id from demandas.demandas where setor_solicitante in (v_set,v_set2));
  delete from demandas.demandas where setor_solicitante in (v_set,v_set2);
  delete from demandas.membros where token like 'conf89-%' or (nome is null and criado_em > now() - interval '5 minutes');
  delete from demandas.categorias where grupo = 'CONF 89';
  delete from demandas.setores where slug in ('conf-89-setor','conf-89-fora') or nome in ('CONF89 Zeta','CONF89 Omega');

  if array_length(falhas, 1) > 0 then
    raise exception E'89 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 89 · conferencia: 11 blocos. A lista de invisiveis e uma so e vale nos dois lugares, url_boa nunca e nula, o veredito do portao e booleano em todo estado, host legitimo com rotulo numerico volta a passar, os dois setores de dem_abrir tem guarda, dem_ajustar nao levanta, por_mes conta no fuso do Rio, o limite invalido avisa, e o servidor diz quem pode tirar cada anexo.';
end
$conf$;

insert into public.schema_versao (n, arquivo)
  values (89, '89-a-terceira-auditoria-e-a-lista-de-invisiveis-que-so-uma-copia-cresceu.sql')
  on conflict (n) do nothing;

commit;
