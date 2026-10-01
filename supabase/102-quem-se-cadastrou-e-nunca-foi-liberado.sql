/* =============================================================================
   102 · QUEM SE CADASTROU E NUNCA FOI LIBERADO NÃO APARECIA EM LUGAR NENHUM

   01/10/2026. Só de Escalas.

   O Elias, baixista, para o Arthur: "Já fiz a inscrição no sistema no mês
   passado mas ainda não aparece." O cadastro de hoje respondeu a ele "Esse
   WhatsApp já está no time desta área. Abra a sua página pela lista da
   equipe", e na lista ele não está.

   A CAUSA, MEDIDA EM PRODUÇÃO (select no editor, 01/10):
     O vínculo dele no Louvor nasceu em 04/09 pela lista da equipe
     (`inscrever`), com identidade nova. O Louvor pede aprovação, então o
     vínculo nasce inativo e espera alguém tocar em Liberar (63). Depois
     alguém conferiu o nível (Contrabaixo, faz sozinho) e ninguém liberou.
     Zero escalas, sem PIN, sem disponibilidade: nunca esteve ativo.

       · `equipe_time` só lista vínculo ativo: ele não aparece na lista.
       · `painel_ministerio` conta `sem_conferir` só entre ativos, e nada conta
         quem espera liberação: nenhum selo, nenhuma linha no Painel.
       · A tela do Time chama de "pausado" todo inativo já conferido, e
         "pausado" diz que alguém decidiu. Ninguém decidiu.
       · `candidatar` e `inscrever` respondem "já está no time" a vínculo
         inativo, e a tela manda procurar o nome numa lista que não o mostra.

   Na mesma medida: 1 pessoa no GUIA Kids e 1 na Mídia esperando desde 07/09.

   O QUE ESTA MIGRAÇÃO FAZ
     1. `voluntarios.liberado_em`: quando o vínculo ficou ativo pela primeira
        vez. Um gatilho preenche; ninguém escreve à mão (só grant de SELECT).
        Vínculo antigo: vale o `criado_em` se ele já esteve ativo (está ativo,
        tem PIN, escala ou resposta de disponibilidade); senão fica nulo.
     2. `painel_ministerio` ganha `esperando_liberacao` e `visao_geral` ganha a
        coluna `esperando_liberacao`: vínculo inativo que nunca foi liberado.
        O app soma em Entradas e no Painel, e o Time põe essas pessoas num
        grupo no alto, com "Liberar".
     3. `candidatar` e `inscrever`: vínculo inativo responde `NAO_LIBERADO`.
        Continua recusando (reativar pela porta pública desfaria decisão da
        liderança); só para de mandar procurar o nome onde ele não está.

   SÓ MEXE NO QUE CONHECE: cada função trocada aqui confere antes o md5 do
   corpo atual. Corpo diferente do que o repositório tem (antes ou depois
   desta migração) aborta tudo. Rodar duas vezes não estraga nada.

   SEM `create temp table`: no editor do Supabase ela dispara o "Run and
   enable RLS", que acrescenta um ALTER depois do commit (101).

   O EDITOR DO SUPABASE NÃO MOSTRA NOTICE: a última linha é um select com o
   resultado.

   ORDEM:  ... 100 → 101 → 102
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(102);
  end if;
end $tranca$;

begin;

-- =========================================================================
-- 0 · cada corpo que esta migração troca é o do repositório (antes ou depois)
-- =========================================================================
do $antes$
declare
  r record; v_md5 text;
begin
  for r in
    select * from (values
      ('candidatar(text,text,text,text,text[],jsonb)', 'b08b18f873109b42ec4af7eea6d73d04', 'a7308a544e071ebba4ce03217b00e267'),
      ('inscrever(text,text,text,text,jsonb)',         'e8a5d74e01bcd49860eb253ce09d7d2a', 'aa0c4592298132f45f339c9a45f175de'),
      ('painel_ministerio(uuid)',                      '5e6cb4ac39eafd21fc6ed6bfacf4a012', 'dc8d75b5429b7a8dbc42ede6dd7e342c'),
      ('visao_geral()',                                '8e1339e561b946106b33461d9a03776b', '98173d137242e5c2c277c0fac08c197f')
    ) as x(assinatura, antes, depois)
  loop
    select md5(prosrc) into v_md5 from pg_proc where oid = to_regprocedure('public.' || r.assinatura);
    if v_md5 is null then
      raise exception '102 PAROU: %() nao existe neste banco', r.assinatura;
    elsif v_md5 not in (r.antes, r.depois) then
      raise exception E'102 PAROU: o corpo de %() neste banco nao e o do repositorio (md5 %).\n'
        '  Esta migracao troca trechos exatos e nao vai adivinhar. Compare com scripts/impressao-digital.sql.',
        r.assinatura, v_md5;
    end if;
  end loop;
end $antes$;

-- =========================================================================
-- 1 · liberado_em: a primeira vez que o vínculo ficou ativo
-- =========================================================================
alter table voluntarios add column if not exists liberado_em timestamptz;

comment on column voluntarios.liberado_em is
  'Quando o vinculo ficou ativo pela primeira vez (102). Nulo com ativo = false: a pessoa se cadastrou e ninguem liberou ainda (aguardando). Preenchido com ativo = false: pausado por decisao da lideranca. Quem escreve e o gatilho tg_liberado_em; authenticated so le.';

/* o passado: quem já esteve ativo de algum jeito ganha o criado_em */
update voluntarios v set liberado_em = v.criado_em
 where v.liberado_em is null
   and (v.ativo
        or v.pin_hash is not null
        or exists (select 1 from escalacoes s where s.voluntario_id = v.id)
        or exists (select 1 from disponibilidade d where d.voluntario_id = v.id)
        or exists (select 1 from indisponibilidades i where i.voluntario_id = v.id));

create or replace function fn_liberado_em() returns trigger
language plpgsql set search_path = public as $fn$
begin
  /* 102 · a primeira liberação fica gravada; pausar e reativar não apagam */
  if new.ativo and new.liberado_em is null then
    new.liberado_em := now();
  end if;
  return new;
end $fn$;
revoke all on function fn_liberado_em() from public, anon, authenticated;

drop trigger if exists tg_liberado_em on voluntarios;
create trigger tg_liberado_em
  before insert or update of ativo on voluntarios
  for each row execute function fn_liberado_em();

/* SELECT para a tela do Time; UPDATE não (82: coluna nova nasce com grant) */
grant select (liberado_em) on public.voluntarios to authenticated;

-- =========================================================================
-- 2 · painel_ministerio: quem espera liberação (corpo da 23 + uma linha)
-- =========================================================================
create or replace function painel_ministerio(p_equipe uuid)
returns jsonb
language sql security invoker stable set search_path = public as $fn$
  select jsonb_build_object(
    'voluntarios',      (select count(*) from voluntarios v where v.equipe_id = p_equipe and v.ativo),
    'funcoes',          (select count(*) from funcoes f where f.equipe_id = p_equipe and f.ativa),
    'candidaturas_novas',(select count(*) from candidaturas c
                           where c.equipe_id = p_equipe and c.status in ('enviada','em_analise')),
    'aguardando_conversa',(select count(*) from candidaturas c
                           where c.equipe_id = p_equipe and c.status in ('conversa','entrevista')),
    /* 102: inativo que nunca foi liberado. Não é "pausado": ninguém decidiu */
    'esperando_liberacao',(select count(*) from voluntarios v
                          where v.equipe_id = p_equipe and not v.ativo and v.liberado_em is null),
    'sem_conferir',     (select count(*) from voluntarios v
                          where v.equipe_id = p_equipe and v.ativo and not v.conferido),
    'sem_disponibilidade',(select count(*) from voluntarios v
                          where v.equipe_id = p_equipe and v.ativo
                            and not exists (select 1 from disponibilidade d
                                             where d.voluntario_id = v.id and d.data >= current_date)),
    'vagas_pendentes',  (select count(*) from escalacoes x
                          join funcoes f on f.id = x.funcao_id
                          join cultos ct on ct.id = x.culto_id
                         where f.equipe_id = p_equipe and x.status = 'pendente' and ct.data >= current_date),
    'funcoes_sem_gente',(select count(*) from funcoes f
                          where f.equipe_id = p_equipe and f.ativa
                            and not exists (select 1 from habilidades h
                                             join voluntarios v on v.id = h.voluntario_id
                                            where h.funcao_id = f.id and v.ativo))
  );
$fn$;
revoke all on function painel_ministerio(uuid) from public, anon;
grant execute on function painel_ministerio(uuid) to authenticated;

-- =========================================================================
-- 3 · visao_geral: a mesma conta por ministério (corpo da 97 + uma coluna)
--     O tipo de retorno muda, então é drop + create. O corpo vem do banco,
--     conferido pelo md5 no passo 0, com dois trechos trocados.
-- =========================================================================
do $visao$
declare
  d text; v_coment text;
  v_cab_velho constant text := 'pendentes integer, candidaturas_novas integer)';
  v_cab_novo  constant text := 'pendentes integer, candidaturas_novas integer, esperando_liberacao integer)';
  v_fim_velho constant text := $v$where c.equipe_id = m.id and c.status = 'enviada')                   as candidaturas_novas$v$;
  v_fim_novo  constant text := $v$where c.equipe_id = m.id and c.status = 'enviada')                   as candidaturas_novas,
         /* 102: inativo que nunca foi liberado. Também quer entrar. */
         (select count(*)::int from voluntarios v
           where v.equipe_id = m.id and not v.ativo and v.liberado_em is null)    as esperando_liberacao$v$;
begin
  if pg_get_function_result('public.visao_geral()'::regprocedure) like '%esperando_liberacao%' then
    return;   -- já aplicada
  end if;
  d := pg_get_functiondef('public.visao_geral()'::regprocedure);
  v_coment := obj_description('public.visao_geral()'::regprocedure, 'pg_proc');
  if length(d) - length(replace(d, v_cab_velho, '')) <> length(v_cab_velho)
     or length(d) - length(replace(d, v_fim_velho, '')) <> length(v_fim_velho) then
    raise exception '102 PAROU: visao_geral() nao tem os dois trechos esperados exatamente uma vez';
  end if;
  d := replace(replace(d, v_cab_velho, v_cab_novo), v_fim_velho, v_fim_novo);
  drop function public.visao_geral();
  execute d;
  revoke all on function public.visao_geral() from public, anon;
  grant execute on function public.visao_geral() to authenticated;
  execute format('comment on function public.visao_geral() is %L',
                 v_coment || ' Desde a 102: esperando_liberacao conta vinculo inativo que nunca foi liberado.');
end $visao$;

-- =========================================================================
-- 4 · candidatar e inscrever: vínculo inativo não é "já está no time"
-- =========================================================================
do $portas$
declare
  d text;
  /* candidatar (64) */
  c_decl_velho constant text := $c$  v_pessoa_nova boolean := false;
begin$c$;
  c_decl_novo  constant text := $c$  v_pessoa_nova boolean := false;
  v_ativo boolean;
begin$c$;
  c_velho constant text := $c$  if exists (select 1 from voluntarios v
              where v.pessoa_id = v_pessoa and v.equipe_id = v_eq) then
    return jsonb_build_object('ok', false, 'erro', 'JA_NO_TIME');
  end if;$c$;
  c_novo constant text := $c$  /* 102 · inativo continua recusado, mas com o nome certo: a lista da
     equipe não mostra vínculo inativo, e "abra pela lista" era um beco. */
  select v.ativo into v_ativo from voluntarios v
   where v.pessoa_id = v_pessoa and v.equipe_id = v_eq
   order by v.ativo desc limit 1;
  if found then
    return jsonb_build_object('ok', false, 'erro',
                              case when v_ativo then 'JA_NO_TIME' else 'NAO_LIBERADO' end);
  end if;$c$;
  /* inscrever (81) */
  i_decl_velho constant text := $i$  v_pessoa_nova boolean := false;   -- MUDANÇA 1
begin$i$;
  i_decl_novo  constant text := $i$  v_pessoa_nova boolean := false;   -- MUDANÇA 1
  v_ativo boolean;
begin$i$;
  i_velho constant text := $i$  if exists (
    select 1 from voluntarios v
     where v.equipe_id = v_eq and tel_norm(v.telefone) = v_tel
  ) then
    return jsonb_build_object('ok', false, 'erro', 'JA_CADASTRADO');
  end if;$i$;
  i_novo constant text := $i$  /* 102 · inativo continua recusado, mas com o nome certo */
  select v.ativo into v_ativo from voluntarios v
   where v.equipe_id = v_eq and tel_norm(v.telefone) = v_tel
   order by v.ativo desc limit 1;
  if found then
    return jsonb_build_object('ok', false, 'erro',
                              case when v_ativo then 'JA_CADASTRADO' else 'NAO_LIBERADO' end);
  end if;$i$;
begin
  d := pg_get_functiondef('public.candidatar(text,text,text,text,text[],jsonb)'::regprocedure);
  if position('NAO_LIBERADO' in d) = 0 then
    if length(d) - length(replace(d, c_decl_velho, '')) <> length(c_decl_velho)
       or length(d) - length(replace(d, c_velho, '')) <> length(c_velho) then
      raise exception '102 PAROU: candidatar() nao tem os trechos esperados exatamente uma vez';
    end if;
    execute replace(replace(d, c_decl_velho, c_decl_novo), c_velho, c_novo);
  end if;

  d := pg_get_functiondef('public.inscrever(text,text,text,text,jsonb)'::regprocedure);
  if position('NAO_LIBERADO' in d) = 0 then
    if length(d) - length(replace(d, i_decl_velho, '')) <> length(i_decl_velho)
       or length(d) - length(replace(d, i_velho, '')) <> length(i_velho) then
      raise exception '102 PAROU: inscrever() nao tem os trechos esperados exatamente uma vez';
    end if;
    execute replace(replace(d, i_decl_velho, i_decl_novo), i_velho, i_novo);
  end if;
end $portas$;

-- =========================================================================
-- 5 · conferência
-- =========================================================================
do $conf$
declare
  falhas text[] := '{}';
  r record; v_md5 text;
  v_eq uuid; v_fn uuid; v_vol uuid; v_novo uuid;
  v_tel constant text := '21900000102';
  v_resp jsonb; v_j jsonb; v_n int;
  montou boolean := false;
  -- o que o cenário mede, guardado para depois do desfazer
  m_insc text; m_ativo boolean; m_lib timestamptz;
  m_painel1 text; m_visao1 int; m_cand1 text; m_insc2 text;
  m_lib2 timestamptz; m_painel2 text; m_cand2 text; m_insc3 text;
  m_lib3 timestamptz; m_painel3 text; m_cand3 text;
  m_lib_novo timestamptz;
begin
  /* 1 · cada corpo com o md5 que este arquivo produz */
  for r in
    select * from (values
      ('candidatar(text,text,text,text,text[],jsonb)', 'a7308a544e071ebba4ce03217b00e267'),
      ('inscrever(text,text,text,text,jsonb)',         'aa0c4592298132f45f339c9a45f175de'),
      ('painel_ministerio(uuid)',                      'dc8d75b5429b7a8dbc42ede6dd7e342c'),
      ('visao_geral()',                                '98173d137242e5c2c277c0fac08c197f'),
      ('fn_liberado_em()',                             'b75cb550583a7cbe62d144776e0ab59d')
    ) as x(assinatura, esperado)
  loop
    select md5(prosrc) into v_md5 from pg_proc where oid = to_regprocedure('public.' || r.assinatura);
    if v_md5 is distinct from r.esperado then
      falhas := falhas || format('%s com corpo %s, esperado %s', r.assinatura, coalesce(v_md5, 'nenhum'), r.esperado);
    end if;
  end loop;

  /* 2 · coluna, grant e gatilho */
  if not exists (select 1 from information_schema.role_column_grants
                  where table_schema = 'public' and table_name = 'voluntarios' and column_name = 'liberado_em'
                    and grantee = 'authenticated' and privilege_type = 'SELECT') then
    falhas := falhas || 'liberado_em sem grant de select para authenticated'::text; end if;
  if exists (select 1 from information_schema.role_column_grants
              where table_schema = 'public' and table_name = 'voluntarios' and column_name = 'liberado_em'
                and grantee = 'authenticated' and privilege_type in ('UPDATE', 'INSERT')) then
    falhas := falhas || 'liberado_em com grant de escrita para authenticated'::text; end if;
  if not exists (select 1 from pg_trigger where tgname = 'tg_liberado_em' and tgrelid = 'public.voluntarios'::regclass) then
    falhas := falhas || 'tg_liberado_em nao esta em voluntarios'::text; end if;
  select count(*) into v_n from voluntarios where ativo and liberado_em is null;
  if v_n > 0 then falhas := falhas || format('%s vinculo(s) ativo(s) sem liberado_em', v_n); end if;

  /* 3 · o caminho inteiro, num ministério de teste que pede aprovação (desfeito) */
  if exists (select 1 from pessoas where telefone = v_tel)
     or exists (select 1 from voluntarios where tel_norm(telefone) = v_tel) then
    falhas := falhas || format('o telefone de teste %s ja existe; o cenario nao roda', v_tel);
  else
    begin
      insert into equipes (nome, slug, ordem, exige_aprovacao)
           values ('CONF102 Teste', 'conf102-teste', 998, true) returning id into v_eq;
      insert into funcoes (nome, equipe_id, tipos, ativa)
           values ('CONF102 POSTO', v_eq, array['domingo','follow'], true) returning id into v_fn;
      insert into lideres (email, equipe_id) values ('conf102@exemplo.invalid', v_eq);
      select coalesce(jsonb_object_agg(q.id::text, 'resposta de teste'), '{}'::jsonb) into v_resp
        from perguntas q
       where q.ativa and q.obrigatoria and (q.equipe_id is null or q.equipe_id = v_eq);
      montou := true;

      /* a pessoa se cadastra pela lista da equipe: nasce esperando */
      v_j := inscrever('conf102-teste', 'Conf102 Pessoa Teste', v_tel, null, '{"CONF102 POSTO":"titular"}'::jsonb);
      m_insc := coalesce(v_j ->> 'erro', case when (v_j ->> 'pendente')::boolean then 'pendente' else 'ativo' end);
      select v.id, v.ativo, v.liberado_em into v_vol, m_ativo, m_lib
        from voluntarios v where v.equipe_id = v_eq and tel_norm(v.telefone) = v_tel;

      /* o líder enxerga, com o papel de quem lidera (grant da coluna incluso) */
      set local role authenticated;
      perform set_config('request.jwt.claims', '{"email":"conf102@exemplo.invalid","role":"authenticated"}', true);
      m_painel1 := painel_ministerio(v_eq) ->> 'esperando_liberacao';
      select g.esperando_liberacao into m_visao1 from visao_geral() g where g.slug = 'conf102-teste';
      reset role;

      /* ela tenta de novo pelas duas portas: o nome certo, não o beco */
      m_cand1 := candidatar('conf102-teste', 'Conf102 Pessoa Teste', v_tel, null, array['CONF102 POSTO'], v_resp) ->> 'erro';
      m_insc2 := inscrever('conf102-teste', 'Conf102 Pessoa Teste', v_tel, null, '{"CONF102 POSTO":"titular"}'::jsonb) ->> 'erro';

      /* o líder libera: o gatilho grava, e as portas dizem "já está" */
      update voluntarios set ativo = true where id = v_vol;
      select liberado_em into m_lib2 from voluntarios where id = v_vol;
      set local role authenticated;
      perform set_config('request.jwt.claims', '{"email":"conf102@exemplo.invalid","role":"authenticated"}', true);
      m_painel2 := painel_ministerio(v_eq) ->> 'esperando_liberacao';
      reset role;
      m_cand2 := candidatar('conf102-teste', 'Conf102 Pessoa Teste', v_tel, null, array['CONF102 POSTO'], v_resp) ->> 'erro';
      m_insc3 := inscrever('conf102-teste', 'Conf102 Pessoa Teste', v_tel, null, '{"CONF102 POSTO":"titular"}'::jsonb) ->> 'erro';

      /* o líder pausa: continua liberada uma vez, não volta a "esperando" */
      update voluntarios set ativo = false where id = v_vol;
      select liberado_em into m_lib3 from voluntarios where id = v_vol;
      set local role authenticated;
      perform set_config('request.jwt.claims', '{"email":"conf102@exemplo.invalid","role":"authenticated"}', true);
      m_painel3 := painel_ministerio(v_eq) ->> 'esperando_liberacao';
      reset role;
      m_cand3 := candidatar('conf102-teste', 'Conf102 Pessoa Teste', v_tel, null, array['CONF102 POSTO'], v_resp) ->> 'erro';

      /* quem o líder cadastra direto nasce ativo e liberado */
      insert into voluntarios (nome, equipe_id) values ('CONF102 Pelo Lider', v_eq) returning liberado_em into m_lib_novo;

      raise exception 'CONF102_DESFAZ';
    exception when others then
      if sqlerrm <> 'CONF102_DESFAZ' then
        falhas := falhas || ('o cenario nao rodou ate o fim (' || case when montou then 'medindo' else 'montando' end || '): ' || sqlerrm)::text;
      end if;
    end;

    if montou then
      if m_insc is distinct from 'pendente' then falhas := falhas || format('inscrever num ministerio com aprovacao devolveu %s, esperado pendente', m_insc); end if;
      if m_ativo is distinct from false or m_lib is not null then falhas := falhas || format('o vinculo novo nasceu ativo=%s liberado_em=%s, esperado false e nulo', m_ativo, m_lib); end if;
      if m_painel1 is distinct from '1' then falhas := falhas || format('painel_ministerio esperando_liberacao = %s, esperado 1', m_painel1); end if;
      if m_visao1 is distinct from 1 then falhas := falhas || format('visao_geral esperando_liberacao = %s, esperado 1', m_visao1); end if;
      if m_cand1 is distinct from 'NAO_LIBERADO' then falhas := falhas || format('candidatar com vinculo esperando devolveu %s', m_cand1); end if;
      if m_insc2 is distinct from 'NAO_LIBERADO' then falhas := falhas || format('inscrever com vinculo esperando devolveu %s', m_insc2); end if;
      if m_lib2 is null then falhas := falhas || 'liberar nao gravou liberado_em'::text; end if;
      if m_painel2 is distinct from '0' then falhas := falhas || format('depois de liberar, esperando_liberacao = %s', m_painel2); end if;
      if m_cand2 is distinct from 'JA_NO_TIME' then falhas := falhas || format('candidatar com vinculo ativo devolveu %s', m_cand2); end if;
      if m_insc3 is distinct from 'JA_CADASTRADO' then falhas := falhas || format('inscrever com vinculo ativo devolveu %s', m_insc3); end if;
      if m_lib3 is distinct from m_lib2 then falhas := falhas || 'pausar mexeu em liberado_em'::text; end if;
      if m_painel3 is distinct from '0' then falhas := falhas || format('pausado contou como esperando liberacao (%s)', m_painel3); end if;
      if m_cand3 is distinct from 'NAO_LIBERADO' then falhas := falhas || format('candidatar com vinculo pausado devolveu %s', m_cand3); end if;
      if m_lib_novo is null then falhas := falhas || 'vinculo criado pelo lider nasceu sem liberado_em'::text; end if;
    end if;
  end if;

  /* o cenário foi desfeito */
  if exists (select 1 from equipes where slug = 'conf102-teste')
     or exists (select 1 from pessoas where telefone = v_tel)
     or exists (select 1 from lideres where email = 'conf102@exemplo.invalid') then
    falhas := falhas || 'o cenario de teste ficou no banco'::text; end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'102 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 102 · conferencia: cadastro pela lista num ministerio com aprovacao nasce esperando, o painel e a visao geral contam, as duas portas respondem NAO_LIBERADO; liberar grava liberado_em e as portas dizem que ja esta; pausar nao volta a esperando. Cenario desfeito.';
end $conf$;

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (102, '102 · candidatar separa vinculo inativo', 'candidatar', 'NAO_LIBERADO'),
      (102, '102 · inscrever separa vinculo inativo', 'inscrever', 'NAO_LIBERADO'),
      (102, '102 · painel conta quem espera liberacao', 'painel_ministerio', 'v.liberado_em is null'),
      (102, '102 · visao geral conta quem espera liberacao', 'visao_geral', 'v.liberado_em is null'),
      (102, '102 · gatilho grava a primeira liberacao', 'fn_liberado_em', 'new.liberado_em := now()')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (102, '102-quem-se-cadastrou-e-nunca-foi-liberado.sql')
  on conflict (n) do nothing;

commit;

/* o que o editor mostra: a conta depois de aplicar (só números) */
select '102' as versao,
       (select count(*) from voluntarios where not ativo and liberado_em is null) as esperando_liberacao,
       (select string_agg(e.slug || ' ' || x.n, ', ' order by e.slug)
          from (select equipe_id, count(*) as n from voluntarios
                 where not ativo and liberado_em is null group by equipe_id) x
          join equipes e on e.id = x.equipe_id) as por_ministerio,
       (select count(*) from voluntarios where not ativo and liberado_em is not null) as pausados,
       (select count(*) from schema_versao_conferir() where not passou) as sondas_reprovadas,
       (select count(*) from schema_versao_conferir()) as sondas;
