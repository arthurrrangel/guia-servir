-- =========================================================================
-- 73 · A SONDA DO CATÁLOGO OLHAVA UMA VERSÃO SÓ, E ESCOLHIA QUAL SEM CRITÉRIO
--
-- 21/09/2026. Encontrado rodando `escala-banco.sh` depois da migração 71.
--
-- `schema_versao_conferir()` (migração 56) responde "que versão está no ar?"
-- olhando o CATÁLOGO: para cada linha de `schema_sonda`, procura um trecho de
-- código dentro do corpo da função alvo. A busca é esta:
--
--     select coalesce(lower(regexp_replace(prosrc, '\s+', ' ', 'g')), '')
--       into v_corpo
--       from pg_proc where proname = r.alvo
--        and pronamespace = 'public'::regnamespace limit 1;
--
-- `limit 1` SEM `order by`. Enquanto cada nome tinha uma função só, isso
-- funcionou. A 71 criou `eu_responder(text, uuid, text, uuid)` ao lado da
-- `eu_responder(text, uuid, text)` que já existia — de propósito, para que o
-- deploy antigo continuasse funcionando enquanto o novo não sobe. A partir
-- daí `pg_proc` tem duas linhas com esse nome, e o `limit 1` passou a pegar a
-- de três argumentos, que é a que só delega.
--
-- Resultado medido: QUATRO casos disseram SUMIU com o código todo no lugar.
--
--     65 · eu_responder escreve pelo lugar so          -> SUMIU
--     65 · eu_responder nao apaga furo                 -> SUMIU
--     71 · eu_responder responde por posto             -> SUMIU
--     71 · o dia sai do estado de todos os postos      -> SUMIU
--
-- E o lado pior não é esse. `limit 1` sem ordem é o planejador decidindo: o
-- mesmo banco, depois de um `create or replace` que mude a ordem física das
-- linhas, pode passar a olhar a OUTRA versão e ficar verde sem nada ter sido
-- consertado. Uma sonda que às vezes acerta ensina a ignorar a sonda — foi o
-- que a própria 56 escreveu sobre o caso do espaço em branco, e é o mesmo
-- erro de novo, por outro caminho.
--
-- O CONSERTO. A sonda passa a olhar TODAS as funções com aquele nome, juntas.
-- É a pergunta certa: "este código está no banco?" — e, com sobrecarga, o
-- código está numa das versões da família, não numa específica.
--
-- O QUE ISSO NÃO PEGA, escrito aqui em vez de descoberto depois: se um dia
-- um trecho precisar estar em TODAS as versões (um guarda de permissão que
-- as duas pontas têm que ter, por exemplo), esta sonda não serve — ela
-- aceita o trecho numa só. Por isso `obtido` passa a dizer em quantos corpos
-- ela olhou: ler "está lá (2 corpos)" é o que faz alguém perceber que existe
-- sobrecarga ali.
-- =========================================================================

/* A TRANCA. Reaplicar este arquivo num banco mais novo gravaria a sonda
   antiga por cima da nova, em silêncio — a lição da 55. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(73);
  end if;
end $tranca$;

create or replace function public.schema_versao_conferir()
returns table(caso text, esperado text, obtido text, passou boolean)
language plpgsql security definer set search_path = public as $fn$
declare
  v_regua int;
  r record;
  /* corpo da função, em minúsculas e com o espaço em branco NORMALIZADO.

     O espaço normalizado não é capricho: a primeira versão procurava
     `old.data is distinct from new.data` e não achava, porque no arquivo a
     linha está alinhada com a de baixo e tem cinco espaços no meio de
     `old.data     is distinct`. A sonda reprovou código correto e me mandou
     procurar defeito onde não havia. Sonda que quebra com indentação é sonda
     que ensina a ignorar a sonda.

     73: e o corpo agora é a JUNÇÃO de todas as versões com aquele nome, em
     ordem fixa de assinatura. `limit 1` sem `order by` deixava o planejador
     escolher qual sobrecarga seria olhada. */
  v_corpo text;
  v_quantos int;
begin
  select max(n) into v_regua from schema_versao;

  caso := 'a régua diz alguma coisa'; esperado := 'não nula';
  obtido := coalesce(v_regua::text, 'null'); passou := v_regua is not null; return next;

  for r in select * from schema_sonda order by n, caso loop
    select string_agg(lower(regexp_replace(p.prosrc, '\s+', ' ', 'g')),
                      E'\n-- ---- outra versao ---- \n'
                      order by pg_get_function_identity_arguments(p.oid)),
           count(*)
      into v_corpo, v_quantos
      from pg_proc p
     where p.proname = r.alvo and p.pronamespace = 'public'::regnamespace;

    caso := r.caso;
    esperado := format('%s no corpo de %s()', r.procura, r.alvo);
    if v_quantos = 0 or coalesce(v_corpo, '') = '' then
      obtido := format('%s() não existe', r.alvo); passou := false;
    elsif position(lower(r.procura) in v_corpo) > 0 then
      obtido := case when v_quantos = 1 then 'está lá'
                     else format('está lá (%s corpos)', v_quantos) end;
      passou := true;
    else
      obtido := case when v_quantos = 1 then 'SUMIU'
                     else format('SUMIU (procurado em %s corpos)', v_quantos) end;
      passou := false;
    end if;
    return next;
  end loop;

  /* estas duas não são sobre corpo de função, então ficam escritas aqui */
  caso := '53 · funcoes.tipos só aceita palavra conhecida';
  esperado := 'funcoes_tipos_conhecidos_ck existe';
  passou := exists (select 1 from pg_constraint where conname = 'funcoes_tipos_conhecidos_ck');
  obtido := case when passou then 'está lá' else 'SUMIU' end;
  return next;

  caso := '56 · um evento por dia por ministério';
  esperado := 'ux_cultos_evento sem a coluna evento';
  obtido := coalesce((select case when pg_get_indexdef(i.indexrelid) like '%evento)%'
                                  then 'AINDA CONTA O NOME' else 'certo' end
                        from pg_index i join pg_class c on c.oid = i.indexrelid
                       where c.relname = 'ux_cultos_evento'), 'índice não existe');
  passou := obtido = 'certo'; return next;
end $fn$;

revoke all on function public.schema_versao_conferir() from public, anon, authenticated;

do $reg$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (73, '73 · a sonda olha TODAS as sobrecargas', 'schema_versao_conferir',
           'order by pg_get_function_identity_arguments')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;

  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo)
      values (73, '73-a-sonda-so-olhava-uma-das-versoes-da-funcao.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;

-- =========================================================================
-- CONFERÊNCIA
-- =========================================================================
do $conferir$
declare v_falhas text := ''; v_n int; v_total int; v_ok int; v_corpo text;
begin
  -- 1 · a sonda passa inteira
  select count(*), count(*) filter (where passou) into v_total, v_ok
    from schema_versao_conferir();
  if v_ok <> v_total then
    v_falhas := v_falhas || format(E'\n  1. %s de %s casos da sonda reprovaram: %s',
      v_total - v_ok, v_total,
      (select string_agg(caso || ' -> ' || obtido, '; ')
         from schema_versao_conferir() where not passou));
  end if;

  -- 2 · o cenário existe: `eu_responder` TEM duas versões, senão o caso 3 é vácuo
  select count(*) into v_n from pg_proc
   where proname = 'eu_responder' and pronamespace = 'public'::regnamespace;
  if v_n < 2 then
    v_falhas := v_falhas || format(
      E'\n  2. eu_responder tem %s versao(oes); sem sobrecarga esta migracao nao prova nada', v_n);
  end if;

  -- 3 · os quatro casos que estavam vermelhos estão verdes E dizem quantos corpos
  select count(*) into v_n from schema_versao_conferir()
   where caso like '%eu_responder%' or caso like '71 · o dia sai%';
  if v_n < 4 then
    v_falhas := v_falhas || format(E'\n  3. esperava 4 casos de eu_responder na sonda, achei %s', v_n);
  end if;
  select count(*) into v_n from schema_versao_conferir()
   where (caso like '%eu_responder%' or caso like '71 · o dia sai%') and not passou;
  if v_n > 0 then
    v_falhas := v_falhas || format(E'\n  4. %s caso(s) de eu_responder ainda reprovam', v_n);
  end if;

  -- 5 · e `obtido` conta a sobrecarga, que é o que faz alguém enxergar que ela existe
  select obtido into v_corpo from schema_versao_conferir()
   where caso like '71 · eu_responder responde por posto%' limit 1;
  if coalesce(v_corpo, '') not like '%corpos)%' then
    v_falhas := v_falhas || format(
      E'\n  5. a sonda nao diz em quantos corpos olhou (disse "%s")', coalesce(v_corpo, 'nada'));
  end if;

  -- 6 · A PROVA DE QUE A BUSCA E DETERMINISTICA: o `string_agg` tem `order by`.
  --     Sem ele, duas chamadas podem montar o texto em ordens diferentes — o
  --     resultado da busca nao muda, mas a ordem escolhida volta a ser do
  --     planejador, que era a raiz do defeito.
  select count(*) into v_n from pg_proc
   where proname = 'schema_versao_conferir' and pronamespace = 'public'::regnamespace
     and position('order by pg_get_function_identity_arguments' in
                  lower(regexp_replace(prosrc, '\s+', ' ', 'g'))) > 0;
  if v_n <> 1 then
    v_falhas := v_falhas || E'\n  6. o string_agg da sonda esta sem order by: a escolha voltou a ser do planejador';
  end if;

  -- 7 · `limit 1` sumiu do corpo (era ele o defeito)
  select count(*) into v_n from pg_proc
   where proname = 'schema_versao_conferir' and pronamespace = 'public'::regnamespace
     and position('pronamespace = ''public''::regnamespace limit 1' in
                  lower(regexp_replace(prosrc, '\s+', ' ', 'g'))) > 0;
  if v_n > 0 then
    v_falhas := v_falhas || E'\n  7. o `limit 1` sem ordem continua no corpo da sonda';
  end if;

  if v_falhas <> '' then
    raise exception E'CONFERENCIA DA 73 REPROVOU:%s', v_falhas;
  end if;
  raise notice 'CONFERENCIA DA 73: 7/7. Sonda %s/%s, e eu_responder tem 2 versoes.', v_ok, v_total;
end $conferir$;
