/* =============================================================================
   118 · A VIRADA 2027 TEM RESERVA

   21/11/2026. O Arthur mandou a copy da landing page da Virada 2027 (31 de
   dezembro de 2026, Espaço Bethel, Barra de Guaratiba) e pediu a página no
   domínio da igreja com o QR da inscrição caindo nela. A reserva é gratuita,
   com vagas limitadas a 150 pessoas, e pede nome completo, CPF, e-mail,
   telefone e se a pessoa é membro ou visitante.

   O QUE PASSA A EXISTIR
     1 · `virada.eventos`: a linha da noite, com a capacidade (150), o máximo
         de pessoas numa reserva (6: uma família, contando quem reserva) e a
         hora em que o site para de reservar. Mudar a capacidade é mudar esta
         linha, sem código.
     2 · `virada.reservas`: cada reserva. Uma por CPF (as canceladas não
         contam). Cada pessoa da reserva conta nas 150.
     3 · O site grava pelo SERVIDOR (chave de serviço): `virada_reservar` e
         `virada_vagas` não abrem para anon nem authenticated.
     4 · O painel lê, lança e cancela pela porta das Demandas
         (`demandas.quem`), e só a ADMINISTRAÇÃO, como o do Follow Camp (110).

   A CONTA DAS VAGAS NÃO CORRE. Duas famílias reservando no mesmo segundo
   passariam as duas pela conta "cabe?" antes de qualquer uma gravar. Cada
   reserva pega a trava do evento (pg_advisory_xact_lock) antes de contar:
   a segunda espera a primeira gravar, e conta de novo.

   CPF MORA AQUI. Por isso: esquema próprio sem `usage` para anon e
   authenticated, RLS ligado e nenhuma política (só as funções abaixo entram).

   PORTA PÚBLICA: três funções novas no inventário da 77 (as do painel). Elas
   respondem SEM_ACESSO e SO_ADMIN para qualquer um que não seja a
   administração.

   SEM `create temp table` (101). O EDITOR DO SUPABASE NÃO MOSTRA NOTICE: a
   última linha é um select com o resultado.

   ORDEM:  ... 116 → 117 → 118
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(118);
  end if;
  if to_regclass('public.schema_versao') is not null
     and not exists (select 1 from public.schema_versao where n = 117) then
    raise exception 'FALTA A 117: rode antes a 117 (supabase/117-o-reenvio-da-ficha-nao-apaga-o-preco.sql). Nada foi mudado.';
  end if;
  if to_regprocedure('demandas.quem(text)') is null then
    raise exception 'FALTA O SISTEMA DE DEMANDAS (94): o painel entra pela mesma porta. Nada foi mudado.';
  end if;
end $tranca$;

begin;

-- =========================================================================
-- 1 · o esquema e as duas tabelas
-- =========================================================================
create schema if not exists virada;
revoke all on schema virada from public;
do $g$ begin
  execute 'revoke all on schema virada from anon, authenticated';
exception when undefined_object then null;
end $g$;

create table if not exists virada.eventos (
  slug             text primary key check (slug ~ '^[a-z0-9-]{3,40}$'),
  nome             text not null check (char_length(btrim(nome)) between 3 and 80),
  capacidade       int not null check (capacidade between 1 and 5000),
  max_por_reserva  int not null default 6 check (max_por_reserva between 1 and 20),
  fecha_em         timestamptz
);
comment on table virada.eventos is
  '118: a noite da Virada (capacidade, maximo por reserva e a hora em que o site para de reservar). Mudar a capacidade e mudar esta linha.';

create table if not exists virada.reservas (
  id             uuid primary key default gen_random_uuid(),
  evento         text not null references virada.eventos(slug),
  criada_em      timestamptz not null default now(),
  origem         text not null default 'site' check (origem in ('site', 'manual')),
  nome           text not null check (char_length(btrim(nome)) between 3 and 80),
  cpf            text check (cpf is null or cpf ~ '^[0-9]{11}$'),
  email          text check (email is null or char_length(email) between 3 and 254),
  telefone       text check (telefone is null or telefone ~ '^[0-9]{10,11}$'),
  vinculo        text check (vinculo is null or vinculo in ('membro', 'visitante')),
  pessoas        int not null default 1 check (pessoas between 1 and 20),
  lancada_por    text check (char_length(lancada_por) <= 80),
  cancelada_em   timestamptz,
  cancelada_por  text check (char_length(cancelada_por) <= 80),
  motivo         text check (char_length(motivo) <= 200),
  /* o site manda tudo; a administração pode lançar sem CPF (reserva por telefone) */
  constraint reserva_do_site_completa check (origem = 'manual' or (cpf is not null and email is not null and telefone is not null and vinculo is not null))
);
comment on table virada.reservas is
  '118: as reservas da Virada. O site grava pela chave de servico (virada_reservar); a administracao le, lanca e cancela pelo painel (virada_painel, virada_lancar, virada_cancelar). Tem CPF: sem acesso direto para anon e authenticated.';
create unique index if not exists ux_virada_reserva_cpf on virada.reservas (evento, cpf) where cancelada_em is null;
create index if not exists ix_virada_reservas_evento on virada.reservas (evento, criada_em);

alter table virada.eventos enable row level security;
alter table virada.reservas enable row level security;
revoke all on all tables in schema virada from public;
do $g$ begin
  execute 'revoke all on all tables in schema virada from anon, authenticated';
exception when undefined_object then null;
end $g$;

insert into virada.eventos (slug, nome, capacidade, max_por_reserva, fecha_em)
values ('virada-2027', 'Virada 2027', 150, 6, '2026-12-31 19:30:00-03')
on conflict (slug) do nothing;

-- =========================================================================
-- 2 · as contas
-- =========================================================================
create or replace function virada.ocupadas(p_evento text)
returns int language sql stable set search_path = virada, public as $fn$
  select coalesce(sum(pessoas), 0)::int from virada.reservas where evento = p_evento and cancelada_em is null
$fn$;
revoke all on function virada.ocupadas(text) from public;

create or replace function virada.txt(p jsonb, k text, n int)
returns text language sql immutable as $fn$
  select nullif(left(btrim(coalesce(p ->> k, '')), n), '')
$fn$;
revoke all on function virada.txt(jsonb, text, int) from public;

create or replace function virada.so_digitos(p jsonb, k text)
returns text language sql immutable as $fn$
  select nullif(regexp_replace(coalesce(p ->> k, ''), '[^0-9]', '', 'g'), '')
$fn$;
revoke all on function virada.so_digitos(jsonb, text) from public;

/* a gravação com a conta das vagas, para o site e para o painel */
create or replace function virada.gravar(p jsonb, p_origem text, p_quem text)
returns jsonb language plpgsql security definer set search_path = virada, public as $fn$
declare
  e virada.eventos;
  v_cpf text := virada.so_digitos(p, 'cpf');
  v_pessoas int := case when coalesce(p ->> 'pessoas', '') ~ '^[0-9]{1,2}$' then (p ->> 'pessoas')::int end;
  v_ocupadas int;
  v_id uuid;
begin
  select * into e from virada.eventos where slug = coalesce(virada.txt(p, 'evento', 40), 'virada-2027');
  if e.slug is null then return jsonb_build_object('ok', false, 'erro', 'SEM_EVENTO'); end if;
  if p_origem = 'site' and e.fecha_em is not null and now() >= e.fecha_em then
    return jsonb_build_object('ok', false, 'erro', 'ENCERRADA');
  end if;
  if v_pessoas is null or v_pessoas < 1 or v_pessoas > e.max_por_reserva then
    return jsonb_build_object('ok', false, 'erro', 'PESSOAS', 'max', e.max_por_reserva);
  end if;
  /* uma reserva por vez neste evento: a conta das vagas não corre */
  perform pg_advisory_xact_lock(hashtext('virada:' || e.slug));
  if v_cpf is not null then
    select id into v_id from virada.reservas where evento = e.slug and cpf = v_cpf and cancelada_em is null;
    if v_id is not null then
      return jsonb_build_object('ok', true, 'id', v_id, 'repetida', true,
        'restantes', greatest(e.capacidade - virada.ocupadas(e.slug), 0));
    end if;
  end if;
  v_ocupadas := virada.ocupadas(e.slug);
  if v_ocupadas + v_pessoas > e.capacidade then
    return jsonb_build_object('ok', false, 'erro', 'ESGOTADO', 'restantes', greatest(e.capacidade - v_ocupadas, 0));
  end if;
  insert into virada.reservas (evento, origem, nome, cpf, email, telefone, vinculo, pessoas, lancada_por)
  values (e.slug, p_origem, virada.txt(p, 'nome', 80), v_cpf, lower(virada.txt(p, 'email', 254)),
          virada.so_digitos(p, 'telefone'), virada.txt(p, 'vinculo', 10), v_pessoas, p_quem)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'restantes', e.capacidade - v_ocupadas - v_pessoas);
end $fn$;
revoke all on function virada.gravar(jsonb, text, text) from public;

-- =========================================================================
-- 3 · o site (SÓ a chave de serviço)
-- =========================================================================
create or replace function public.virada_reservar(p jsonb)
returns jsonb language plpgsql security definer set search_path = virada, public as $fn$
begin
  /* `{"teste": true}` responde sem gravar: é como a rota sabe se o banco está pronto */
  if coalesce((p ->> 'teste')::boolean, false) then
    return jsonb_build_object('ok', true, 'teste', true);
  end if;
  /* o site manda tudo: o servidor já conferiu, e aqui confere de novo */
  if coalesce(virada.so_digitos(p, 'cpf'), '') !~ '^[0-9]{11}$'
     or coalesce(virada.so_digitos(p, 'telefone'), '') !~ '^[0-9]{10,11}$'
     or virada.txt(p, 'email', 254) is null
     or coalesce(virada.txt(p, 'vinculo', 10), '') not in ('membro', 'visitante')
     or char_length(coalesce(virada.txt(p, 'nome', 80), '')) < 3 then
    return jsonb_build_object('ok', false, 'erro', 'DADOS');
  end if;
  return virada.gravar(p, 'site', null);
end $fn$;
revoke all on function public.virada_reservar(jsonb) from public;

create or replace function public.virada_vagas(p_evento text default 'virada-2027')
returns jsonb language plpgsql stable security definer set search_path = virada, public as $fn$
declare e virada.eventos; v_ocup int;
begin
  select * into e from virada.eventos where slug = p_evento;
  if e.slug is null then return jsonb_build_object('ok', false, 'erro', 'SEM_EVENTO'); end if;
  v_ocup := virada.ocupadas(e.slug);
  return jsonb_build_object('ok', true, 'capacidade', e.capacidade, 'ocupadas', v_ocup,
    'restantes', greatest(e.capacidade - v_ocup, 0), 'max_por_reserva', e.max_por_reserva,
    'aberta', (e.fecha_em is null or now() < e.fecha_em) and v_ocup < e.capacidade);
end $fn$;
revoke all on function public.virada_vagas(text) from public;

do $g$ begin
  execute 'revoke all on function public.virada_reservar(jsonb) from anon, authenticated';
  execute 'revoke all on function public.virada_vagas(text) from anon, authenticated';
  execute 'grant execute on function public.virada_reservar(jsonb) to service_role';
  execute 'grant execute on function public.virada_vagas(text) to service_role';
exception when undefined_object then null;
end $g$;

-- =========================================================================
-- 4 · o painel (SÓ a administração, pela porta das Demandas)
-- =========================================================================
create or replace function public.virada_painel(p_token text default null)
returns jsonb language plpgsql stable security definer set search_path = demandas, virada, public as $fn$
declare m demandas.membros;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  if m.papel <> 'admin' then return jsonb_build_object('ok', false, 'erro', 'SO_ADMIN'); end if;
  return jsonb_build_object(
    'ok', true,
    'eu', m.nome,
    'agora', now(),
    'evento', (select to_jsonb(e) from virada.eventos e where e.slug = 'virada-2027'),
    'reservas', coalesce((select jsonb_agg(to_jsonb(r) order by r.criada_em)
                            from virada.reservas r where r.evento = 'virada-2027'), '[]'::jsonb));
end $fn$;
revoke all on function public.virada_painel(text) from public;
grant execute on function public.virada_painel(text) to anon, authenticated;

/* a reserva que chegou pelo WhatsApp, por telefone ou na porta */
create or replace function public.virada_lancar(p_token text, p jsonb)
returns jsonb language plpgsql security definer set search_path = demandas, virada, public as $fn$
declare m demandas.membros; v_cpf text := virada.so_digitos(p, 'cpf');
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  if m.papel <> 'admin' then return jsonb_build_object('ok', false, 'erro', 'SO_ADMIN'); end if;
  if virada.txt(p, 'nome', 80) is null or char_length(virada.txt(p, 'nome', 80)) < 3 then
    return jsonb_build_object('ok', false, 'erro', 'SEM_NOME'); end if;
  if v_cpf is not null and v_cpf !~ '^[0-9]{11}$' then return jsonb_build_object('ok', false, 'erro', 'CPF_INVALIDO'); end if;
  if virada.so_digitos(p, 'telefone') is not null and virada.so_digitos(p, 'telefone') !~ '^[0-9]{10,11}$' then
    return jsonb_build_object('ok', false, 'erro', 'TELEFONE_INVALIDO'); end if;
  return virada.gravar(jsonb_set(p, '{evento}', '"virada-2027"'), 'manual', left(m.nome, 80));
end $fn$;
revoke all on function public.virada_lancar(text, jsonb) from public;
grant execute on function public.virada_lancar(text, jsonb) to anon, authenticated;

/* desistência (ou desfazer): a reserva fica no banco, e o lugar volta para a conta */
create or replace function public.virada_cancelar(p_token text, p_id uuid, p_cancelar boolean, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = demandas, virada, public as $fn$
declare m demandas.membros; r virada.reservas;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  if m.papel <> 'admin' then return jsonb_build_object('ok', false, 'erro', 'SO_ADMIN'); end if;
  select * into r from virada.reservas where id = p_id for update;
  if r.id is null then return jsonb_build_object('ok', false, 'erro', 'RESERVA_INEXISTENTE'); end if;
  begin
    update virada.reservas
       set cancelada_em = case when p_cancelar then now() end,
           cancelada_por = case when p_cancelar then left(m.nome, 80) end,
           motivo = case when p_cancelar then left(nullif(btrim(coalesce(p_motivo, '')), ''), 200) end
     where id = p_id;
  exception when unique_violation then
    /* desfazer o cancelamento de um CPF que já reservou de novo */
    return jsonb_build_object('ok', false, 'erro', 'CPF_REPETIDO');
  end;
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.virada_cancelar(text, uuid, boolean, text) from public;
grant execute on function public.virada_cancelar(text, uuid, boolean, text) to anon, authenticated;

-- =========================================================================
-- 5 · inventário da porta pública (77)
-- =========================================================================
do $porta$ begin
  if to_regclass('public.porta_publica') is null then
    raise notice 'PULEI o inventario: este banco nao tem porta_publica (falta a 77).';
    return;
  end if;
  insert into public.porta_publica (funcao, motivo, n) values
    ('virada_painel(p_token text)',
     'o painel da Virada 2027: as reservas, so para a administracao das Demandas (SEM_ACESSO e SO_ADMIN para o resto) (118).', 118),
    ('virada_lancar(p_token text, p jsonb)',
     'a administracao lanca a reserva que chegou pelo WhatsApp ou por telefone, com a conta das vagas; SO_ADMIN para o resto (118).', 118),
    ('virada_cancelar(p_token text, p_id uuid, p_cancelar boolean, p_motivo text)',
     'a administracao marca desistencia (ou desfaz); a reserva fica no banco e o lugar volta. SO_ADMIN para o resto (118).', 118)
  on conflict (funcao) do update set motivo = excluded.motivo, n = excluded.n;
end $porta$;

-- =========================================================================
-- 6 · conferência: o cenário entra, é medido e sai
-- =========================================================================
do $conf$
declare
  falhas text[] := '{}';
  r jsonb;
  v_id uuid;
  n int;
begin
  insert into virada.eventos (slug, nome, capacidade, max_por_reserva, fecha_em)
  values ('conf118', 'Conferencia 118', 5, 3, now() + interval '1 day');

  if (public.virada_reservar('{"teste": true}') ->> 'teste') is distinct from 'true' then
    falhas := falhas || 'o teste da rota gravou ou nao respondeu'::text; end if;

  r := public.virada_reservar(jsonb_build_object('evento', 'conf118', 'nome', '  Conf  Cento Dezoito ', 'cpf', '118.000.001-38',
         'email', 'Conf118@Exemplo.com', 'telefone', '(21) 99999-1180', 'vinculo', 'visitante', 'pessoas', 3));
  v_id := (r ->> 'id')::uuid;
  if v_id is null or (r ->> 'restantes')::int is distinct from 2 then
    falhas := falhas || ('a primeira reserva nao gravou com 2 restantes: ' || r::text); end if;
  if (select cpf || '|' || email || '|' || telefone || '|' || nome from virada.reservas where id = v_id)
     is distinct from '11800000138|conf118@exemplo.com|21999991180|Conf  Cento Dezoito' then
    falhas := falhas || 'a reserva nao saiu limpa (cpf, e-mail, telefone ou nome)'::text; end if;

  r := public.virada_reservar(jsonb_build_object('evento', 'conf118', 'nome', 'Conf Sem Cpf',
         'email', 'w@exemplo.com', 'telefone', '21977771180', 'vinculo', 'membro', 'pessoas', 1));
  if (r ->> 'erro') is distinct from 'DADOS' then
    falhas := falhas || ('o site gravou reserva sem CPF: ' || r::text); end if;
  begin
    insert into virada.reservas (evento, origem, nome, pessoas) values ('conf118', 'site', 'Conf Sem Nada', 1);
    falhas := falhas || 'a tabela aceitou reserva do site sem CPF'::text;
  exception when check_violation then null;
  end;

  r := public.virada_reservar(jsonb_build_object('evento', 'conf118', 'nome', 'Conf Repetida', 'cpf', '11800000138',
         'email', 'x@exemplo.com', 'telefone', '21999991181', 'vinculo', 'membro', 'pessoas', 1));
  if (r ->> 'repetida') is distinct from 'true' or (r ->> 'id')::uuid is distinct from v_id then
    falhas := falhas || ('o mesmo CPF virou outra reserva: ' || r::text); end if;

  r := public.virada_reservar(jsonb_build_object('evento', 'conf118', 'nome', 'Conf Familia Grande', 'cpf', '11800000219',
         'email', 'y@exemplo.com', 'telefone', '2133331180', 'vinculo', 'membro', 'pessoas', 3));
  if (r ->> 'erro') is distinct from 'ESGOTADO' or (r ->> 'restantes')::int is distinct from 2 then
    falhas := falhas || ('a familia que nao cabe entrou: ' || r::text); end if;

  r := public.virada_reservar(jsonb_build_object('evento', 'conf118', 'nome', 'Conf Familia Grande', 'cpf', '11800000219',
         'email', 'y@exemplo.com', 'telefone', '2133331180', 'vinculo', 'membro', 'pessoas', 4));
  if (r ->> 'erro') is distinct from 'PESSOAS' then
    falhas := falhas || ('passou do maximo por reserva: ' || r::text); end if;

  r := public.virada_reservar(jsonb_build_object('evento', 'conf118', 'nome', 'Conf Casal', 'cpf', '11800000308',
         'email', 'z@exemplo.com', 'telefone', '21988881180', 'vinculo', 'membro', 'pessoas', 2));
  if (r ->> 'ok') is distinct from 'true' or (r ->> 'restantes')::int is distinct from 0 then
    falhas := falhas || ('a ultima vaga nao fechou a conta: ' || r::text); end if;

  r := public.virada_vagas('conf118');
  if (r ->> 'restantes')::int is distinct from 0 or (r ->> 'aberta') is distinct from 'false' then
    falhas := falhas || ('as vagas nao zeraram: ' || r::text); end if;

  update virada.reservas set cancelada_em = now() where id = v_id;
  r := public.virada_vagas('conf118');
  if (r ->> 'restantes')::int is distinct from 3 then
    falhas := falhas || ('cancelar nao devolveu os lugares: ' || r::text); end if;

  update virada.eventos set fecha_em = now() - interval '1 minute' where slug = 'conf118';
  r := public.virada_reservar(jsonb_build_object('evento', 'conf118', 'nome', 'Conf Atrasada', 'cpf', '11800000480',
         'email', 'v@exemplo.com', 'telefone', '21966661180', 'vinculo', 'visitante', 'pessoas', 1));
  if (r ->> 'erro') is distinct from 'ENCERRADA' then
    falhas := falhas || ('reservou depois de fechar: ' || r::text); end if;

  if (public.virada_painel('CONF118-NINGUEM') ->> 'erro') is distinct from 'SEM_ACESSO' then
    falhas := falhas || 'painel com link falso nao respondeu SEM_ACESSO'::text; end if;
  if (public.virada_lancar('CONF118-NINGUEM', '{"nome":"Conf Lancada","pessoas":1}') ->> 'erro') is distinct from 'SEM_ACESSO' then
    falhas := falhas || 'lancar com link falso nao respondeu SEM_ACESSO'::text; end if;

  if has_function_privilege('anon', 'public.virada_reservar(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.virada_vagas(text)', 'execute') then
    falhas := falhas || 'a gravacao do site ficou aberta para a chave publica'::text; end if;
  if has_table_privilege('anon', 'virada.reservas', 'select') or has_table_privilege('authenticated', 'virada.reservas', 'select') then
    falhas := falhas || 'as reservas ficaram legiveis pela chave publica'::text; end if;

  delete from virada.reservas where evento = 'conf118';
  delete from virada.eventos where slug = 'conf118';
  select count(*) into n from virada.reservas where nome ilike 'conf%';
  if n > 0 then falhas := falhas || 'o cenario de teste ficou no banco'::text; end if;
  if (select capacidade from virada.eventos where slug = 'virada-2027') is distinct from 150 then
    falhas := falhas || 'a Virada 2027 nao ficou com 150 lugares'::text; end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'118 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 118 · conferencia da reserva da Virada: tudo como esperado. Cenario desfeito.';
end $conf$;

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (118, '118 · a conta das vagas pega a trava', 'virada_reservar', 'virada.gravar(p, ''site'', null)'),
      (118, '118 · o painel e so da administracao', 'virada_painel', 'so_admin')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (118, '118-a-virada-2027-tem-reserva.sql')
  on conflict (n) do nothing;

commit;

notify pgrst, 'reload schema';

/* o que o editor mostra: só números */
select '118' as versao,
       (select capacidade from virada.eventos where slug = 'virada-2027') as capacidade,
       (select count(*) from virada.reservas where cancelada_em is null) as reservas,
       (select count(*) from testar_porta_publica() where not passou) as porta_reprovada,
       (select count(*) from schema_versao_conferir() where not passou) as sondas_reprovadas;
