/* =============================================================================
   99 · NO FOLLOW, OS MESMOS POSTOS DO DOMINGO

   01/10/2026. Só de Escalas.

   O Arthur: "no follow precisa ter as mesmas posições de que no culto de
   domingo". Perguntado onde a regra vale: na Mídia e no Louvor. Connect,
   GUIA Kids e Livraria continuam sem escala no sábado.

   MEDIDO EM PRODUÇÃO em 01/10/2026, antes desta migração (select no editor):

       ministério   postos ativos   no domingo   no Follow
       Louvor            10             10           10     já igual
       Mídia             10             10            6     faltam HEAD, TRANSMISSÃO
                                                            (CORTE + PTZ), CÂMERA 1, CÂMERA 2
       Connect           18             18            0
       GUIA Kids          9              9            0
       Livraria           2              2            0

   A diferença da Mídia vem da 09: "o Follow tem SÓ 5 áreas ... fora HEAD e
   fora tudo que é transmissão". A regra mudou e esta migração a troca.

   E JÁ HAVIA GENTE NESSES POSTOS. O Follow de 03/10 nasceu como evento da
   Mídia, com os postos todos, e a 98 o fez Follow da igreja com a escala que
   ele tinha. Três pessoas ficaram em TRANSMISSÃO, CÂMERA 1 e CÂMERA 2, num
   sábado que não tinha esses postos: o app as escondia (`funcoesDoDia`), o
   Painel não as contava e a cobrança de quinta não as via. Com esta
   migração elas voltam a aparecer, para o líder e para a cobrança.

   O QUE MUDA
     1 · os postos da Mídia e do Louvor passam a valer no domingo E no Follow;
     2 · posto NOVO segue o ministério (`salvar_funcoes`, a única porta pela
         qual o líder cria posto): quem serve no Follow ganha o posto nos dois
         cultos, quem não serve ganha só no domingo. Até aqui todo posto novo
         nascia nos dois (o default da coluna, desde a 09), e o primeiro posto
         que o líder do Kids criasse abriria uma escala de sábado para um
         ministério que não serve no sábado. O default da coluna não muda: as
         conferências das migrações antigas montam cenário com ele.

   PARA UM MINISTÉRIO PASSAR A SERVIR NO FOLLOW:
       update funcoes set tipos = array['domingo','follow'] where equipe_id = <id>;
   Daí em diante o posto novo dele também nasce nos dois.

   A CONFERÊNCIA, no fim: Mídia e Louvor sem posto fora do Follow; Connect,
   Kids e Livraria sem posto no Follow; posto novo criado por `salvar_funcoes`
   nasce certo nos dois tipos de ministério (e é desfeito); e nenhuma
   escalação de culto regular futuro fica em posto que não vale naquele dia.

   O EDITOR DO SUPABASE NÃO MOSTRA NOTICE: a última linha é um select com o
   resultado, para quem roda ver o que aconteceu.

   ORDEM:  ... 97 → 98 → 99
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(99);
  end if;
end $tranca$;

begin;

-- =========================================================================
-- 1 · Mídia e Louvor: todo posto vale no domingo e no Follow
-- =========================================================================
do $postos$
declare v_n int; v_nomes text;
begin
  select count(*), string_agg(f.nome, ', ' order by f.ordem)
    into v_n, v_nomes
    from funcoes f join equipes e on e.id = f.equipe_id
   where e.slug in ('midia', 'louvor')
     and not (f.tipos @> array['domingo','follow']);

  update funcoes f set tipos = array['domingo','follow']
    from equipes e
   where e.id = f.equipe_id and e.slug in ('midia', 'louvor')
     and not (f.tipos @> array['domingo','follow']);

  raise notice '99 · % posto(s) passaram a valer tambem no Follow: %', v_n, coalesce(v_nomes, 'nenhum');
end $postos$;

-- =========================================================================
-- 2 · posto novo segue o ministério
--
-- Corpo copiado da 48 (a versão no ar), com UMA mudança: a coluna `tipos`
-- no insert. Nada mais.
-- =========================================================================
create or replace function salvar_funcoes(p_equipe uuid, p_funcoes jsonb)
returns jsonb
language plpgsql security invoker set search_path = public as $fn$
declare r record; v_vistos uuid[] := '{}'; v_id uuid;
begin
  for r in
    select (x ->> 'id')::uuid                            as id,
           btrim(coalesce(x ->> 'nome',''))              as nome,
           coalesce((x ->> 'simultanea')::boolean,false)  as simultanea,
           coalesce((x ->> 'ordem')::int, 0)             as ordem,
           coalesce((x ->> 'ativa')::boolean,true)       as ativa,
           nullif(x ->> 'exige_sexo','')                 as exige_sexo
      from jsonb_array_elements(coalesce(p_funcoes,'[]'::jsonb)) x
  loop
    if r.nome = '' then
      raise exception 'funcao sem nome';
    end if;
    if r.exige_sexo is not null and r.exige_sexo not in ('M','F') then
      raise exception 'exige_sexo invalido';
    end if;

    if r.id is not null then
      if not exists (select 1 from funcoes where id = r.id and equipe_id = p_equipe) then
        raise exception 'funcao de outro ministerio';
      end if;
      update funcoes set nome = r.nome, simultanea = r.simultanea,
                         ordem = r.ordem, ativa = r.ativa, exige_sexo = r.exige_sexo
       where id = r.id;
      v_id := r.id;
    else
      insert into funcoes (equipe_id, nome, simultanea, ordem, ativa, exige_sexo, tipos)
           values (p_equipe, r.nome, r.simultanea, r.ordem, r.ativa, r.exige_sexo,
                   /* 99: posto novo segue o ministerio no Follow. Ministerio
                      que ja serve no Follow (ou que ainda nao tem posto)
                      ganha o posto nos dois cultos; o que so serve no
                      domingo ganha so no domingo. */
                   case when not exists (select 1 from funcoes f where f.equipe_id = p_equipe)
                          or exists (select 1 from funcoes f
                                      where f.equipe_id = p_equipe and 'follow' = any(f.tipos))
                        then array['domingo','follow']
                        else array['domingo'] end)
        returning id into v_id;
    end if;
    v_vistos := v_vistos || v_id;
  end loop;

  return jsonb_build_object('ok', true, 'salvas', coalesce(array_length(v_vistos,1),0));
end $fn$;

-- =========================================================================
-- 3 · conferência
-- =========================================================================
do $conf$
declare
  falhas text[] := '{}';
  v_midia uuid; v_kids uuid;
  v_n int; v_t text[];
begin
  /* 1 · Mídia e Louvor: nenhum posto fora de um dos dois cultos */
  select count(*) into v_n
    from funcoes f join equipes e on e.id = f.equipe_id
   where e.slug in ('midia', 'louvor') and not (f.tipos @> array['domingo','follow']);
  if v_n > 0 then
    falhas := falhas || format('%s posto(s) da Midia ou do Louvor ainda fora do domingo ou do Follow', v_n); end if;

  /* 2 · Connect, Kids e Livraria: nenhum posto no Follow */
  select count(*) into v_n
    from funcoes f join equipes e on e.id = f.equipe_id
   where e.slug in ('servico', 'kids', 'livraria') and 'follow' = any(f.tipos);
  if v_n > 0 then
    falhas := falhas || format('%s posto(s) de Connect, Kids ou Livraria no Follow', v_n); end if;

  /* 3 · posto novo nasce certo, nos dois tipos de ministério (desfeito) */
  select id into v_midia from equipes where slug = 'midia';
  select id into v_kids  from equipes where slug = 'kids';
  begin
    if v_midia is not null then
      perform salvar_funcoes(v_midia, '[{"nome":"CONF99 NOVO","ordem":99}]'::jsonb);
      select tipos into v_t from funcoes where equipe_id = v_midia and nome = 'CONF99 NOVO';
      if v_t is null or not (v_t @> array['domingo','follow']) then
        falhas := falhas || format('posto novo da Midia nasceu com %s', coalesce(array_to_string(v_t, '+'), 'nada')); end if;
    end if;
    if v_kids is not null then
      perform salvar_funcoes(v_kids, '[{"nome":"CONF99 NOVO","ordem":99}]'::jsonb);
      select tipos into v_t from funcoes where equipe_id = v_kids and nome = 'CONF99 NOVO';
      if v_t is null or v_t <> array['domingo'] then
        falhas := falhas || format('posto novo do Kids nasceu com %s', coalesce(array_to_string(v_t, '+'), 'nada')); end if;
    end if;
    raise exception 'CONF99_DESFAZ';
  exception when others then
    if sqlerrm <> 'CONF99_DESFAZ' then
      falhas := falhas || ('o cenario nao montou: ' || sqlerrm)::text;
    end if;
  end;
  if exists (select 1 from funcoes where nome = 'CONF99 NOVO') then
    falhas := falhas || 'o cenario de teste ficou no banco'::text; end if;

  /* 4 · nenhuma escalação de culto regular futuro em posto que não vale no dia */
  select count(*) into v_n
    from escalacoes x
    join cultos c on c.id = x.culto_id
    join funcoes f on f.id = x.funcao_id
   where c.evento is null and c.data >= current_date
     and x.voluntario_id is not null
     and not (c.tipo = any(f.tipos));
  if v_n > 0 then
    falhas := falhas || format('%s escalacao(oes) futura(s) em posto que nao vale no dia', v_n); end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'99 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 99 · conferencia: Midia e Louvor com os mesmos postos no domingo e no Follow; Connect, Kids e Livraria sem posto no Follow; posto novo nasce certo nos dois tipos de ministerio; nenhuma escalacao futura em posto que nao vale no dia. Cenario desfeito.';
end $conf$;

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (99, '99 · posto novo segue o ministerio no Follow', 'salvar_funcoes', '99: posto novo segue o ministerio')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (99, '99-o-follow-tem-os-postos-do-domingo.sql')
  on conflict (n) do nothing;

commit;

/* o que o editor mostra: a conta depois de aplicar */
select '99' as versao,
       (select count(*) filter (where 'follow' = any(f.tipos)) || ' de ' || count(*)
          from funcoes f join equipes e on e.id = f.equipe_id where e.slug = 'midia' and f.ativa) as midia_no_follow,
       (select count(*) filter (where 'follow' = any(f.tipos)) || ' de ' || count(*)
          from funcoes f join equipes e on e.id = f.equipe_id where e.slug = 'louvor' and f.ativa) as louvor_no_follow,
       (select count(*) from escalacoes x join cultos c on c.id = x.culto_id join funcoes f on f.id = x.funcao_id
         where c.evento is null and c.data >= current_date and x.voluntario_id is not null
           and not (c.tipo = any(f.tipos))) as escalacoes_escondidas;
