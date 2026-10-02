/* =============================================================================
   108 · QUEM É DE FORA DA LISTA NO POSTO ("Guest")

   02/10/2026. Só de Escalas. O Arthur mandou a escala de domingo copiada do
   grupo do Louvor e disse: "as mensagens tem que sair assim". Nela, DIRIGENTE
   é "Guest Rafa", GUITARRA, BATERIA e TECLADO são "Guest" e o SOM é
   alguém de outro ministério, sem situação. O sistema só sabia dizer
   "*** PRECISO DE ALGUÉM ***" nesses postos, e o líder reescrevia a mensagem
   à mão antes de mandar.

   O QUE MUDA (só acrescenta)
     1 · `culto_obs.convidados`: por culto e por ministério, o texto de quem
         é de fora da lista em cada posto ({id da função: "Guest Rafa"}). O
         CHECK `convidados_validos` aceita só o que pode virar uma linha da
         mensagem: até 60 postos, chave de função, texto aparado de 1 a 60
         letras, sem quebra de linha.
     2 · `salvar_convidado(culto, função, nome)`: só quem lidera o ministério
         da função. Com nome, o posto passa a ser dessa pessoa de fora: quem
         estava escalado nele sai, na mesma transação. Sem nome, o texto sai.
     3 · Quem é da lista vale mais que o texto: escalar alguém no posto (pela
         tela, pelo sorteio, pelo convite aceito no link) tira o texto
         (gatilho `tg_tira_convidado`).
     4 · `vaga_aberta` (106): posto com alguém de fora da lista não está
         aberto. Ninguém é chamado para ele, e convite antigo para ele fecha.

   NADA MUDA para quem não usa: sem texto no posto, tudo é como antes.

   SEM `create temp table` (101). O EDITOR DO SUPABASE NÃO MOSTRA NOTICE: a
   última linha é um select com o resultado.

   ORDEM:  ... 105 → 106 → 107 → 108
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(108);
  end if;
  if to_regclass('public.schema_versao') is not null
     and not exists (select 1 from public.schema_versao where n = 107) then
    raise exception 'FALTA A 107: rode antes a 103, a 104, a 105, a 106 e a 107. Nada foi mudado.';
  end if;
end $tranca$;

begin;

-- =========================================================================
-- 1 · o que pode ir no posto
-- =========================================================================
create or replace function public.convidados_validos(p jsonb)
returns boolean language plpgsql immutable set search_path = public as $fn$
declare k text; v jsonb; s text; n int := 0;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'object' then return false; end if;
  for k, v in select e.key, e.value from jsonb_each(p) e loop
    n := n + 1;
    if n > 60 then return false; end if;
    if k !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
    if jsonb_typeof(v) <> 'string' then return false; end if;
    s := v #>> '{}';
    /* aparado, não vazio, sem quebra de linha nem tabulação: vira uma linha
       da mensagem do grupo */
    if s = '' or s <> btrim(s) or length(s) > 60 or s ~ '[[:cntrl:]]' then return false; end if;
  end loop;
  return true;
end $fn$;
revoke all on function public.convidados_validos(jsonb) from public, anon;
grant execute on function public.convidados_validos(jsonb) to authenticated;
comment on function public.convidados_validos(jsonb) is
  '108: o CHECK de culto_obs.convidados. Objeto {id da funcao: texto}, ate 60 postos, texto aparado de 1 a 60 letras, sem quebra de linha.';

-- =========================================================================
-- 2 · a coluna, com o CHECK
-- =========================================================================
alter table culto_obs add column if not exists convidados jsonb;
alter table culto_obs drop constraint if exists culto_obs_convidados_ok;
alter table culto_obs add constraint culto_obs_convidados_ok check (public.convidados_validos(convidados));
comment on column culto_obs.convidados is
  '108: quem e de fora da lista em cada posto deste culto e deste ministerio ({id da funcao: "Guest Rafa"}). Grava por salvar_convidado(); vai na mensagem do grupo como esta escrito e o posto conta como coberto.';

-- =========================================================================
-- 3 · gravar um posto
-- =========================================================================
create or replace function public.salvar_convidado(p_culto uuid, p_funcao uuid, p_nome text)
returns jsonb language plpgsql security invoker set search_path = public as $fn$
declare v_eq uuid; v_nome text := nullif(btrim(coalesce(p_nome, '')), ''); v_atual jsonb;
begin
  select f.equipe_id into v_eq from funcoes f where f.id = p_funcao;
  if v_eq is null then return jsonb_build_object('ok', false, 'erro', 'POSTO_INEXISTENTE'); end if;
  if not public.lidera_equipe(v_eq) then
    return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO');
  end if;
  if not exists (select 1 from cultos where id = p_culto) then
    return jsonb_build_object('ok', false, 'erro', 'CULTO_INEXISTENTE');
  end if;
  if v_nome is not null and (length(v_nome) > 60 or v_nome ~ '[[:cntrl:]]') then
    return jsonb_build_object('ok', false, 'erro', 'NOME_INVALIDO');
  end if;

  /* a linha nasce se não existe, e fica TRAVADA até o fim: dois líderes
     mexendo em postos diferentes do mesmo culto passam um de cada vez, e
     nenhum apaga o do outro */
  insert into culto_obs (culto_id, equipe_id) values (p_culto, v_eq)
    on conflict (culto_id, equipe_id) do nothing;
  select o.convidados into v_atual from culto_obs o
   where o.culto_id = p_culto and o.equipe_id = v_eq
     for update;

  if v_nome is not null then
    /* o posto passa a ser de quem é de fora da lista: quem estava escalado
       nele sai, na mesma transação */
    delete from escalacoes e where e.culto_id = p_culto and e.funcao_id = p_funcao;
    v_atual := coalesce(v_atual, '{}'::jsonb) || jsonb_build_object(p_funcao::text, v_nome);
  else
    v_atual := coalesce(v_atual, '{}'::jsonb) - p_funcao::text;
  end if;

  update culto_obs
     set convidados = case when v_atual = '{}'::jsonb then null else v_atual end
   where culto_id = p_culto and equipe_id = v_eq;
  return jsonb_build_object('ok', true, 'convidados', v_atual);
end $fn$;
revoke all on function public.salvar_convidado(uuid, uuid, text) from public, anon;
grant execute on function public.salvar_convidado(uuid, uuid, text) to authenticated;

-- =========================================================================
-- 4 · quem é da lista vale mais que o texto
-- =========================================================================
create or replace function public.fn_tira_convidado()
returns trigger language plpgsql security definer set search_path = public as $fn$
begin
  update culto_obs o
     set convidados = nullif(o.convidados - new.funcao_id::text, '{}'::jsonb)
    from funcoes f
   where f.id = new.funcao_id
     and o.culto_id = new.culto_id and o.equipe_id = f.equipe_id
     and o.convidados ? new.funcao_id::text;
  return null;
end $fn$;
revoke all on function public.fn_tira_convidado() from public, anon, authenticated;

drop trigger if exists tg_tira_convidado on escalacoes;
create trigger tg_tira_convidado
  after insert or update of voluntario_id, funcao_id, culto_id on escalacoes
  for each row when (new.voluntario_id is not null)
  execute function public.fn_tira_convidado();

-- =========================================================================
-- 5 · vaga aberta (106): o posto com alguém de fora da lista está coberto
-- =========================================================================
create or replace function public.vaga_aberta(p_culto uuid, p_funcao uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select not exists (
    select 1 from escalacoes e
     where e.culto_id = p_culto and e.funcao_id = p_funcao
       and e.voluntario_id is not null and e.status not in ('recusado', 'furou'))
  and not exists (
    select 1 from culto_obs o join funcoes f on f.id = p_funcao
     where o.culto_id = p_culto and o.equipe_id = f.equipe_id
       and o.convidados ? p_funcao::text);
$fn$;
revoke all on function public.vaga_aberta(uuid, uuid) from public, anon, authenticated;

-- =========================================================================
-- 6 · conferência
-- =========================================================================
do $conf$
declare
  falhas text[] := '{}';
  r record;
  m jsonb := '{}'::jsonb;
  v_eq uuid; v_eq2 uuid; v_dir uuid; v_gui uuid; v_som uuid; v_cam uuid;
  v_ana uuid; v_bia uuid; v_culto uuid;
  v_j jsonb;
begin
  /* 1 · estrutura */
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'culto_obs' and column_name = 'convidados') then
    falhas := falhas || 'culto_obs sem a coluna convidados'::text; end if;
  if has_function_privilege('anon', 'public.salvar_convidado(uuid,uuid,text)', 'execute') then
    falhas := falhas || 'salvar_convidado alcancavel por anon'::text; end if;
  if not has_function_privilege('authenticated', 'public.salvar_convidado(uuid,uuid,text)', 'execute') then
    falhas := falhas || 'salvar_convidado sem grant para authenticated'::text; end if;
  if has_function_privilege('authenticated', 'public.vaga_aberta(uuid,uuid)', 'execute')
     or has_function_privilege('anon', 'public.vaga_aberta(uuid,uuid)', 'execute') then
    falhas := falhas || 'vaga_aberta alcancavel de fora'::text; end if;

  /* 2 · o CHECK, caso a caso */
  m := m || jsonb_build_object('valido_guest', convidados_validos('{"00000000-0000-0000-0000-000000000001":"Guest"}'));
  m := m || jsonb_build_object('valido_nulo', convidados_validos(null));
  m := m || jsonb_build_object('ruim_vazio', convidados_validos('{"00000000-0000-0000-0000-000000000001":""}'));
  m := m || jsonb_build_object('ruim_espaco', convidados_validos('{"00000000-0000-0000-0000-000000000001":" Guest"}'));
  m := m || jsonb_build_object('ruim_quebra', convidados_validos(jsonb_build_object('00000000-0000-0000-0000-000000000001', E'Guest\nRafa')));
  m := m || jsonb_build_object('ruim_longo', convidados_validos(jsonb_build_object('00000000-0000-0000-0000-000000000001', repeat('a', 61))));
  m := m || jsonb_build_object('ruim_chave', convidados_validos('{"BATERIA":"Guest"}'));
  m := m || jsonb_build_object('ruim_numero', convidados_validos('{"00000000-0000-0000-0000-000000000001":1}'));
  m := m || jsonb_build_object('ruim_lista', convidados_validos('["Guest"]'));

  /* 3 · o caminho inteiro, em dois ministérios de teste (desfeito no fim) */
  begin
    insert into equipes (nome, slug, ordem) values ('CONF108 Louvor', 'conf108-louvor', 994) returning id into v_eq;
    insert into equipes (nome, slug, ordem) values ('CONF108 Midia', 'conf108-midia', 995) returning id into v_eq2;
    insert into lideres (email, equipe_id) values ('conf108-lider@exemplo.invalid', v_eq);
    insert into lideres (email, equipe_id) values ('conf108-midia@exemplo.invalid', v_eq2);
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq, 'CONF108 DIRIGENTE', 1, true, true, array['domingo','follow']) returning id into v_dir;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq, 'CONF108 GUITARRA', 2, true, true, array['domingo','follow']) returning id into v_gui;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq, 'CONF108 SOM', 3, true, true, array['domingo','follow']) returning id into v_som;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq2, 'CONF108 CAMERA', 1, true, true, array['domingo','follow']) returning id into v_cam;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Ana Conf Cento Oito', '21900108001', true, 'F') returning id into v_ana;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Bia Conf Cento Oito', '21900108002', true, 'F') returning id into v_bia;
    insert into cultos (data, evento, equipe_id) values ((now() at time zone 'America/Sao_Paulo')::date + 9, 'CONF108 evento', v_eq) returning id into v_culto;
    insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo) values (v_culto, v_gui, v_ana, 'confirmado', true);

    m := m || jsonb_build_object('aberta_antes', vaga_aberta(v_culto, v_dir));
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf108-lider@exemplo.invalid","role":"authenticated"}', true);
    /* o líder do Louvor escreve o Guest do dirigente: a vaga fecha */
    v_j := salvar_convidado(v_culto, v_dir, '  Guest Rafa  ');
    m := m || jsonb_build_object('grava', format('%s:%s', v_j ->> 'ok', v_j -> 'convidados' ->> v_dir::text));
    reset role;
    m := m || jsonb_build_object('aberta_depois', vaga_aberta(v_culto, v_dir));
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf108-lider@exemplo.invalid","role":"authenticated"}', true);
    /* o Guest na guitarra tira quem estava escalado nela */
    v_j := salvar_convidado(v_culto, v_gui, 'Guest');
    m := m || jsonb_build_object('tira_escalado', format('%s:%s', v_j ->> 'ok',
      (select count(*) from escalacoes where culto_id = v_culto and funcao_id = v_gui)));
    m := m || jsonb_build_object('nome_longo', salvar_convidado(v_culto, v_som, repeat('x', 61)) ->> 'erro');
    m := m || jsonb_build_object('nome_quebra', salvar_convidado(v_culto, v_som, E'a\nb') ->> 'erro');
    m := m || jsonb_build_object('culto_falso', salvar_convidado(gen_random_uuid(), v_som, 'Guest') ->> 'erro');
    m := m || jsonb_build_object('posto_falso', salvar_convidado(v_culto, gen_random_uuid(), 'Guest') ->> 'erro');
    /* a liderança de outro ministério não escreve no posto do Louvor (pelo
       RLS de `funcoes`, ela nem enxerga o posto: a recusa é POSTO_INEXISTENTE,
       sem dizer que o posto existe) */
    perform set_config('request.jwt.claims', '{"email":"conf108-midia@exemplo.invalid","role":"authenticated"}', true);
    m := m || jsonb_build_object('alheia', salvar_convidado(v_culto, v_som, 'Guest') ->> 'erro');
    perform set_config('request.jwt.claims', '{"email":"conf108-lider@exemplo.invalid","role":"authenticated"}', true);
    /* tirar o texto */
    v_j := salvar_convidado(v_culto, v_dir, null);
    m := m || jsonb_build_object('tira', format('%s:%s', v_j ->> 'ok', coalesce(v_j -> 'convidados' ->> v_dir::text, 'sem')));
    reset role;
    m := m || jsonb_build_object('aberta_sem', vaga_aberta(v_culto, v_dir));

    /* quem é da lista vale mais: escalar a Bia na guitarra tira o Guest */
    insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo) values (v_culto, v_gui, v_bia, 'pendente', true);
    m := m || jsonb_build_object('lista_vale_mais', coalesce((select convidados ->> v_gui::text from culto_obs
                                                    where culto_id = v_culto and equipe_id = v_eq), 'sem'));
    /* o último texto que sai deixa a coluna nula, não um objeto vazio */
    m := m || jsonb_build_object('coluna_nula', (select convidados is null from culto_obs where culto_id = v_culto and equipe_id = v_eq));
    /* o CHECK segura o que passa por fora da função */
    begin
      update culto_obs set convidados = '{"BATERIA":"Guest"}' where culto_id = v_culto and equipe_id = v_eq;
      m := m || jsonb_build_object('check', 'passou');
    exception when check_violation then m := m || jsonb_build_object('check', 'segurou');
    end;

    raise exception 'CONF108_DESFAZ';
  exception when others then
    if sqlerrm <> 'CONF108_DESFAZ' then
      falhas := falhas || ('o cenario nao montou: ' || sqlerrm)::text;
    end if;
  end;
  reset role;

  for r in select * from (values
      ('valido_guest',     'true'),
      ('valido_nulo',      'true'),
      ('ruim_vazio',       'false'),
      ('ruim_espaco',      'false'),
      ('ruim_quebra',      'false'),
      ('ruim_longo',       'false'),
      ('ruim_chave',       'false'),
      ('ruim_numero',      'false'),
      ('ruim_lista',       'false'),
      ('aberta_antes',     'true'),
      ('grava',            'true:Guest Rafa'),
      ('aberta_depois',    'false'),
      ('tira_escalado',    'true:0'),
      ('nome_longo',       'NOME_INVALIDO'),
      ('nome_quebra',      'NOME_INVALIDO'),
      ('culto_falso',      'CULTO_INEXISTENTE'),
      ('posto_falso',      'POSTO_INEXISTENTE'),
      ('alheia',           'POSTO_INEXISTENTE'),
      ('tira',             'true:sem'),
      ('aberta_sem',       'true'),
      ('lista_vale_mais',  'sem'),
      ('coluna_nula',      'true'),
      ('check',            'segurou')
    ) as x(chave, esperado)
  loop
    if (m ->> r.chave) is distinct from r.esperado then
      falhas := falhas || format('%s: obtido %s, esperado %s', r.chave, coalesce(m ->> r.chave, '(nada)'), r.esperado);
    end if;
  end loop;

  if exists (select 1 from equipes where slug like 'conf108-%')
     or exists (select 1 from voluntarios where nome like '% Conf Cento Oito')
     or exists (select 1 from lideres where email like 'conf108%@exemplo.invalid') then
    falhas := falhas || 'o cenario de teste ficou no banco'::text; end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'108 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 108 · conferencia: % medidas, todas como esperado. Cenario desfeito.', (select count(*) from jsonb_object_keys(m));
end $conf$;

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (108, '108 · so quem lidera escreve o Guest', 'salvar_convidado', 'lidera_equipe'),
      (108, '108 · o Guest tira quem estava no posto', 'salvar_convidado', 'delete from escalacoes'),
      (108, '108 · quem e da lista tira o Guest', 'fn_tira_convidado', 'convidados - new.funcao_id'),
      (108, '108 · posto com Guest nao e vaga aberta', 'vaga_aberta', 'convidados ? p_funcao')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (108, '108-quem-e-de-fora-da-lista-no-posto.sql')
  on conflict (n) do nothing;

commit;

/* o que o editor mostra: só números */
select '108' as versao,
       (select count(*) from culto_obs where convidados is not null) as postos_com_guest,
       (select count(*) from schema_versao_conferir() where not passou) as sondas_reprovadas,
       (select count(*) from schema_versao_conferir()) as sondas;
