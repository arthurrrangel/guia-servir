/* =============================================================================
   115 · O BOTÃO "MANDAR PELO ROBÔ"

   26/10/2026. O Arthur: "Gostaria de na aba do sistema ter a opção de
   disparar escala, através desse robo, vou deixar o macbook ligado" e
   "Para todos os ministérios".

   O robô do WhatsApp (robo-whatsapp/, no MacBook do Arthur, ligado ao número
   da igreja) não recebe chamada de fora: o Mac fica atrás da internet de
   casa. Então o pedido vira uma LINHA no banco, e o robô passa a cada minuto
   para buscar o que foi pedido (pela rota /api/robo/pedidos, com o segredo
   dele) e devolver o resultado.

   O QUE PASSA A EXISTIR
     · `robo_pedidos`: um pedido por ministério e dia ("manda a escala de
       domingo agora"), com quem pediu, a situação (pendente → enviando →
       enviado ou falhou) e o resultado por grupo. Um aberto por vez para o
       mesmo ministério e dia: apertar duas vezes não manda duas vezes.
     · `robo_estado`: a última vez que o robô passou, se estava conectado ao
       WhatsApp, se estava pausado e quais ministérios ele sabe mandar (os que
       têm grupo na tabela dele). É o que a tela usa para dizer "robô ligado"
       ou "robô desligado".
     · `robo_pedir(equipe, data)`: o líder do ministério (ou a administração)
       pede. Recusa data passada, data a mais de 14 dias, mais de 30 pedidos
       no dia e ministério que o robô diz não saber mandar.
     · `robo_situacao(equipe, data)`: o que a tela mostra ao líder.

   QUEM VÊ O QUÊ: as duas tabelas são fechadas (RLS ligado, sem grant para
   anon nem authenticated). O líder fala só pelas duas funções, que conferem
   `lidera_equipe`; o robô fala só pela rota do servidor, com a chave de
   serviço.

   PORTA PÚBLICA: nenhuma função nova para anon (só authenticated); o
   inventário da 77 não muda.

   SEM `create temp table` (101). O EDITOR DO SUPABASE NÃO MOSTRA NOTICE: a
   última linha é um select com o resultado.

   ORDEM:  ... 113 → 114 → 115
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(115);
  end if;
  if to_regclass('public.schema_versao') is not null
     and not exists (select 1 from public.schema_versao where n = 114) then
    raise exception 'FALTA A 114: rode antes a 114 (o carne do Follow Camp). Nada foi mudado.';
  end if;
end $tranca$;

begin;

-- =========================================================================
-- 1 · os pedidos
-- =========================================================================
create table if not exists robo_pedidos (
  id            uuid primary key default gen_random_uuid(),
  equipe_id     uuid not null references equipes(id) on delete cascade,
  data          date not null,
  pedido_por    text,
  /* clock_timestamp: dois pedidos na mesma transação têm ordem */
  criado_em     timestamptz not null default clock_timestamp(),
  status        text not null default 'pendente',
  resultado     jsonb,
  atualizado_em timestamptz not null default clock_timestamp(),
  constraint robo_pedidos_status_ck check (status in ('pendente', 'enviando', 'enviado', 'falhou')),
  constraint robo_pedidos_resultado_ck check (
    resultado is null or (jsonb_typeof(resultado) = 'object' and length(resultado::text) <= 20000)),
  constraint robo_pedidos_por_ck check (pedido_por is null or length(pedido_por) <= 200)
);
/* um aberto por vez para o mesmo ministério e dia */
create unique index if not exists ux_robo_pedidos_aberto on robo_pedidos (equipe_id, data)
  where status in ('pendente', 'enviando');
create index if not exists ix_robo_pedidos_fila on robo_pedidos (status, criado_em);
create index if not exists ix_robo_pedidos_equipe on robo_pedidos (equipe_id, data, criado_em desc);
alter table robo_pedidos enable row level security;
revoke all on robo_pedidos from public, anon, authenticated;
grant select, insert, update, delete on robo_pedidos to service_role;
comment on table robo_pedidos is
  'Pedidos de "mandar a escala pelo robo do WhatsApp", por ministerio e dia (115). O lider pede por robo_pedir; o robo busca e devolve o resultado pela rota /api/robo/pedidos (chave de servico).';

-- =========================================================================
-- 2 · o robô, visto daqui
-- =========================================================================
create table if not exists robo_estado (
  id          smallint primary key default 1,
  visto_em    timestamptz,
  conectado   boolean,
  pausado     boolean,
  versao      text,
  ministerios text[],
  constraint robo_estado_um_ck check (id = 1),
  constraint robo_estado_versao_ck check (versao is null or length(versao) <= 40),
  constraint robo_estado_ministerios_ck check (ministerios is null or cardinality(ministerios) <= 30)
);
insert into robo_estado (id) values (1) on conflict (id) do nothing;
alter table robo_estado enable row level security;
revoke all on robo_estado from public, anon, authenticated;
grant select, insert, update on robo_estado to service_role;
comment on table robo_estado is
  'A ultima passada do robo do WhatsApp (115): quando, conectado, pausado e os ministerios que ele sabe mandar. So o servidor escreve.';

-- =========================================================================
-- 3 · o líder pede
-- =========================================================================
create or replace function public.robo_pedir(p_equipe uuid, p_data date)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
        v_slug text; e robo_estado; v robo_pedidos; v_aberto boolean; v_dia int;
begin
  if p_equipe is null or not public.lidera_equipe(p_equipe) then
    return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO');
  end if;
  if p_data is null or p_data < v_hoje or p_data > v_hoje + 14 then
    return jsonb_build_object('ok', false, 'erro', 'DATA_FORA');
  end if;
  select slug into v_slug from equipes where id = p_equipe;
  if v_slug is null then
    return jsonb_build_object('ok', false, 'erro', 'SEM_EQUIPE');
  end if;
  /* SÓ COM O ROBÔ NO AR. Fora do ar (3 minutos sem passar), pausado ou sem
     WhatsApp, a tela manda o líder mandar à mão; um pedido que esperasse o
     robô voltar viraria mensagem em dobro. A aba velha do celular, que ainda
     mostra o botão, cai aqui (o mesmo número em lib/robo-pedidos.ts) */
  select * into e from robo_estado where id = 1;
  if e.visto_em is null or e.visto_em < now() - interval '180 seconds' then
    return jsonb_build_object('ok', false, 'erro', 'ROBO_DESLIGADO');
  end if;
  if coalesce(e.pausado, false) then
    return jsonb_build_object('ok', false, 'erro', 'ROBO_PAUSADO');
  end if;
  if e.conectado is not true then
    return jsonb_build_object('ok', false, 'erro', 'ROBO_SEM_WHATSAPP');
  end if;
  if e.ministerios is not null and not (v_slug = any (e.ministerios)) then
    return jsonb_build_object('ok', false, 'erro', 'SEM_GRUPOS');
  end if;

  select * into v from robo_pedidos
   where equipe_id = p_equipe and data = p_data and status in ('pendente', 'enviando')
   for update;
  v_aberto := found;
  /* "mandar agora" é agora: o que o robô não pegou em 30 minutos vence e um
     toque novo abre outro (o mesmo número em lib/robo-pedidos.ts) */
  if v_aberto and v.status = 'pendente' and v.criado_em < now() - interval '30 minutes' then
    update robo_pedidos
       set status = 'falhou', atualizado_em = clock_timestamp(),
           resultado = jsonb_build_object('resumo',
             'O robô não pegou o pedido em 30 minutos (Mac desligado, dormindo ou sem internet). Nada foi mandado por ele.',
             'grupos', '[]'::jsonb, 'avisos', '[]'::jsonb)
     where id = v.id;
    v_aberto := false;
  end if;
  if not v_aberto then
    select count(*) into v_dia from robo_pedidos
     where equipe_id = p_equipe and criado_em >= now() - interval '1 day';
    if v_dia >= 30 then
      return jsonb_build_object('ok', false, 'erro', 'MUITOS_HOJE');
    end if;
    begin
      insert into robo_pedidos (equipe_id, data, pedido_por)
           values (p_equipe, p_data, left(lower(nullif(auth.jwt() ->> 'email', '')), 200))
      returning * into v;
    exception when unique_violation then
      /* dois toques ao mesmo tempo: fica o que entrou primeiro */
      select * into v from robo_pedidos
       where equipe_id = p_equipe and data = p_data and status in ('pendente', 'enviando');
    end;
  end if;
  return jsonb_build_object('ok', true,
    'pedido', jsonb_build_object('id', v.id, 'status', v.status, 'criado_em', v.criado_em));
end $fn$;
revoke all on function public.robo_pedir(uuid, date) from public, anon, authenticated;
grant execute on function public.robo_pedir(uuid, date) to authenticated;

-- =========================================================================
-- 4 · o que a tela mostra ao líder
-- =========================================================================
create or replace function public.robo_situacao(p_equipe uuid, p_data date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_slug text; e robo_estado; v_pedidos jsonb;
begin
  if p_equipe is null or not public.lidera_equipe(p_equipe) then
    return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO');
  end if;
  select slug into v_slug from equipes where id = p_equipe;
  select * into e from robo_estado where id = 1;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'status', p.status, 'criado_em', p.criado_em, 'atualizado_em', p.atualizado_em,
           'pedido_por', coalesce((select x.nome from pessoas x where lower(x.auth_email) = p.pedido_por limit 1), p.pedido_por),
           /* a idade pelo relógio do banco (o do celular pode estar errado) */
           'idade_s', greatest(0, floor(extract(epoch from now() - p.criado_em)))::int,
           'resultado', p.resultado) order by p.criado_em desc), '[]'::jsonb)
    into v_pedidos
    from (select * from robo_pedidos where equipe_id = p_equipe and data = p_data
           order by criado_em desc limit 5) p;
  return jsonb_build_object('ok', true,
    'robo', jsonb_build_object(
      'visto_em', e.visto_em, 'conectado', e.conectado, 'pausado', e.pausado,
      /* a idade sai do relógio do banco: o do celular pode estar errado */
      'segundos', case when e.visto_em is null then null else greatest(0, floor(extract(epoch from now() - e.visto_em)))::int end,
      'sabe', case when e.ministerios is null then null else v_slug = any (e.ministerios) end),
    'pedidos', v_pedidos);
end $fn$;
revoke all on function public.robo_situacao(uuid, date) from public, anon, authenticated;
grant execute on function public.robo_situacao(uuid, date) to authenticated;

-- =========================================================================
-- 5 · conferência: o cenário entra, é medido e sai
-- =========================================================================
do $conf$
declare
  falhas text[] := '{}';
  m jsonb := '{}'::jsonb;
  r record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_a uuid; v_b uuid; v_j jsonb; v_id text; v_n int;
begin
  begin
    insert into equipes (nome, slug, ordem) values ('CONF115 A', 'conf115-a', 995) returning id into v_a;
    insert into equipes (nome, slug, ordem) values ('CONF115 B', 'conf115-b', 994) returning id into v_b;
    insert into lideres (email, equipe_id) values ('conf115-lider@exemplo.invalid', v_a);

    /* o robô nunca passou, passou há mais de 3 minutos, está pausado ou sem
       WhatsApp: não entra pedido */
    update robo_estado set visto_em = null, conectado = null, pausado = null, ministerios = null where id = 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf115-lider@exemplo.invalid","role":"authenticated"}', true);
    m := m || jsonb_build_object('robo_nunca_passou', coalesce(robo_pedir(v_a, v_hoje + 2) ->> 'erro', '-'));
    reset role;
    update robo_estado set visto_em = now() - interval '181 seconds', conectado = true, pausado = false where id = 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf115-lider@exemplo.invalid","role":"authenticated"}', true);
    m := m || jsonb_build_object('desligado', coalesce(robo_pedir(v_a, v_hoje + 2) ->> 'erro', '-'));
    reset role;
    update robo_estado set visto_em = now(), pausado = true where id = 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf115-lider@exemplo.invalid","role":"authenticated"}', true);
    m := m || jsonb_build_object('pausado', coalesce(robo_pedir(v_a, v_hoje + 2) ->> 'erro', '-'));
    reset role;
    update robo_estado set pausado = false, conectado = false where id = 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf115-lider@exemplo.invalid","role":"authenticated"}', true);
    m := m || jsonb_build_object('sem_whatsapp', coalesce(robo_pedir(v_a, v_hoje + 2) ->> 'erro', '-'));
    reset role;
    m := m || jsonb_build_object('nada_entrou', (select count(*) from robo_pedidos where equipe_id = v_a));

    /* o robô no ar, conectado, sem pausa, com este ministério */
    update robo_estado set visto_em = now(), conectado = true, pausado = false, ministerios = array['conf115-a'] where id = 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf115-lider@exemplo.invalid","role":"authenticated"}', true);
    v_j := robo_pedir(v_a, v_hoje);
    m := m || jsonb_build_object('pede', format('%s:%s', v_j ->> 'ok', v_j #>> '{pedido,status}'));
    v_id := v_j #>> '{pedido,id}';
    v_j := robo_pedir(v_a, v_hoje);
    m := m || jsonb_build_object('de_novo', (v_j #>> '{pedido,id}') is not distinct from v_id);
    m := m || jsonb_build_object('outro', coalesce(robo_pedir(v_b, v_hoje) ->> 'erro', '-'));
    m := m || jsonb_build_object('ontem', coalesce(robo_pedir(v_a, v_hoje - 1) ->> 'erro', '-'));
    m := m || jsonb_build_object('longe', coalesce(robo_pedir(v_a, v_hoje + 15) ->> 'erro', '-'));
    m := m || jsonb_build_object('limite', coalesce(robo_pedir(v_a, v_hoje + 14) ->> 'ok', '-'));
    v_j := robo_situacao(v_a, v_hoje);
    m := m || jsonb_build_object('situacao', format('%s:%s:%s:%s:%s', v_j ->> 'ok',
           jsonb_array_length(coalesce(v_j -> 'pedidos', '[]'::jsonb)), v_j #>> '{robo,sabe}', v_j #>> '{pedidos,0,pedido_por}',
           (v_j #>> '{pedidos,0,idade_s}')::int between 0 and 5));
    m := m || jsonb_build_object('situacao_outro', coalesce(robo_situacao(v_b, v_hoje) ->> 'erro', '-'));
    begin
      perform 1 from robo_pedidos limit 1;
      m := m || jsonb_build_object('le_pedidos', 'leu');
    exception when insufficient_privilege then
      m := m || jsonb_build_object('le_pedidos', 'negado');
    end;
    begin
      perform 1 from robo_estado limit 1;
      m := m || jsonb_build_object('le_estado', 'leu');
    exception when insufficient_privilege then
      m := m || jsonb_build_object('le_estado', 'negado');
    end;
    /* nem escrever direto: o líder só fala pelas duas funções */
    begin
      insert into robo_pedidos (equipe_id, data) values (v_a, v_hoje + 5);
      m := m || jsonb_build_object('escreve_pedidos', 'escreveu');
    exception when insufficient_privilege then
      m := m || jsonb_build_object('escreve_pedidos', 'negado');
    end;
    begin
      update robo_estado set visto_em = now() where id = 1;
      m := m || jsonb_build_object('escreve_estado', 'escreveu');
    exception when insufficient_privilege then
      m := m || jsonb_build_object('escreve_estado', 'negado');
    end;
    reset role;

    /* o robô mandou: o próximo toque abre um pedido novo */
    update robo_pedidos set status = 'enviado' where id = v_id::uuid;
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf115-lider@exemplo.invalid","role":"authenticated"}', true);
    v_j := robo_pedir(v_a, v_hoje);
    m := m || jsonb_build_object('depois_de_enviado', (v_j #>> '{pedido,id}') is distinct from v_id);
    reset role;

    /* o robô diz que não tem grupo deste ministério */
    update robo_estado set ministerios = array['outro'] where id = 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf115-lider@exemplo.invalid","role":"authenticated"}', true);
    m := m || jsonb_build_object('sem_grupo', coalesce(robo_pedir(v_a, v_hoje + 1) ->> 'erro', '-'));
    reset role;

    /* o pedido que o robô não pegou em 30 minutos vence; o toque novo abre outro */
    insert into robo_pedidos (equipe_id, data, criado_em)
         values (v_a, v_hoje + 4, now() - interval '31 minutes') returning id::text into v_id;
    update robo_estado set ministerios = array['conf115-a'] where id = 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf115-lider@exemplo.invalid","role":"authenticated"}', true);
    v_j := robo_pedir(v_a, v_hoje + 4);
    reset role;
    m := m || jsonb_build_object('vencido', format('%s:%s', (v_j #>> '{pedido,id}') is distinct from v_id,
           (select status from robo_pedidos where id = v_id::uuid)));

    /* 30 pedidos em 24 horas: para */
    update robo_estado set ministerios = array['conf115-a'] where id = 1;
    insert into robo_pedidos (equipe_id, data, status)
      select v_a, v_hoje, 'enviado' from generate_series(1, 30);
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf115-lider@exemplo.invalid","role":"authenticated"}', true);
    m := m || jsonb_build_object('muitos', coalesce(robo_pedir(v_a, v_hoje + 3) ->> 'erro', '-'));
    reset role;

    m := m || jsonb_build_object('anon', format('%s,%s',
           has_function_privilege('anon', 'public.robo_pedir(uuid, date)', 'execute'),
           has_function_privilege('anon', 'public.robo_situacao(uuid, date)', 'execute')));

    raise exception 'CONF115_DESFAZ';
  exception when others then
    if sqlerrm <> 'CONF115_DESFAZ' then
      falhas := falhas || ('o cenario nao montou: ' || sqlerrm)::text;
    end if;
  end;
  reset role;

  for r in select * from (values
      ('robo_nunca_passou', 'ROBO_DESLIGADO'),
      ('desligado',         'ROBO_DESLIGADO'),
      ('pausado',           'ROBO_PAUSADO'),
      ('sem_whatsapp',      'ROBO_SEM_WHATSAPP'),
      ('nada_entrou',       '0'),
      ('escreve_pedidos',   'negado'),
      ('escreve_estado',    'negado'),
      ('pede',              'true:pendente'),
      ('de_novo',           'true'),
      ('outro',             'SEM_PERMISSAO'),
      ('ontem',             'DATA_FORA'),
      ('longe',             'DATA_FORA'),
      ('limite',            'true'),
      /* um pedido aberto para hoje; o robô sabe este ministério; quem pediu
         não tem pessoa ligada: aparece o e-mail */
      ('situacao',          'true:1:true:conf115-lider@exemplo.invalid:t'),
      ('situacao_outro',    'SEM_PERMISSAO'),
      ('le_pedidos',        'negado'),
      ('le_estado',         'negado'),
      ('depois_de_enviado', 'true'),
      ('sem_grupo',         'SEM_GRUPOS'),
      ('vencido',           't:falhou'),
      ('muitos',            'MUITOS_HOJE'),
      ('anon',              'f,f')
    ) as x(chave, esperado)
  loop
    if (m ->> r.chave) is distinct from r.esperado then
      falhas := falhas || format('%s: obtido %s, esperado %s', r.chave, coalesce(m ->> r.chave, '(nada)'), r.esperado);
    end if;
  end loop;

  if exists (select 1 from equipes where slug like 'conf115-%')
     or exists (select 1 from lideres where email like 'conf115%@exemplo.invalid') then
    falhas := falhas || 'o cenario de teste ficou no banco'::text; end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'115 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  select count(*) into v_n from jsonb_object_keys(m);
  raise notice 'OK 115 · conferencia: % medidas do pedido ao robo e da situacao do lider, todas como esperado. Cenario desfeito.', v_n;
end $conf$;

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (115, '115 · so o lider do ministerio pede ao robo', 'robo_pedir', 'lidera_equipe'),
      (115, '115 · um pedido aberto por ministerio e dia', 'robo_pedir', 'unique_violation'),
      (115, '115 · so o lider do ministerio ve a situacao', 'robo_situacao', 'lidera_equipe')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (115, '115-o-botao-mandar-pelo-robo.sql')
  on conflict (n) do nothing;

commit;

/* o PostgREST guarda o desenho do banco em cache; o Supabase recarrega
   sozinho depois de DDL, e isto só garante */
notify pgrst, 'reload schema';

/* o que o editor mostra: só números */
select '115' as versao,
       (select count(*) from robo_pedidos) as pedidos,
       (select count(*) from robo_estado) as linha_do_robo,
       (select count(*) from testar_porta_publica() where not passou) as porta_reprovada,
       (select count(*) from schema_versao_conferir() where not passou) as sondas_reprovadas;
