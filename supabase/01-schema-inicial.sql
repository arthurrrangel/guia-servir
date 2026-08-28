-- ============================================================================
--  01 — ESQUEMA INICIAL (mono-ministério). HISTÓRICO, NÃO É O ESTADO ATUAL.
--
--  ⚠️  NÃO RODE ESTE ARQUIVO NO BANCO QUE ESTÁ NO AR.
--      Ele é anterior à migração multi-ministério: não tem `equipes`,
--      não tem `equipe_id`, e os `create or replace function` daqui
--      REVERTERIAM salvar_dia, eu_dados, eu_responder e os dois gatilhos
--      para a versão que apagava a escala dos outros ministérios.
--
--  Ordem correta em um banco vazio:
--      01-schema-inicial.sql  →  02-multi-ministerio.sql  →  03-auditoria.sql
--
--  A fonte da verdade é o banco. Para tirar um dump fiel:
--      supabase db dump --db-url "$DATABASE_URL" -f supabase/dump-YYYY-MM-DD.sql
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------- tipos ---
do $$ begin
  create type nivel_habilidade as enum ('titular','reserva','treino');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_escala as enum ('pendente','confirmado','recusado','furou');
exception when duplicate_object then null; end $$;

-- --------------------------------------------------------------- tabelas ---
create table if not exists funcoes (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null unique,
  simultanea  boolean not null default true,
  ordem       int not null default 0,
  ativa       boolean not null default true
);

create table if not exists voluntarios (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  telefone    text,
  ativo       boolean not null default true,
  limite_mes  int not null default 2,
  token       text not null unique default encode(gen_random_bytes(9),'hex'),
  criado_em   timestamptz not null default now()
);

create table if not exists habilidades (
  voluntario_id uuid references voluntarios(id) on delete cascade,
  funcao_id     uuid references funcoes(id) on delete cascade,
  nivel         nivel_habilidade not null default 'reserva',
  primary key (voluntario_id, funcao_id)
);

create table if not exists indisponibilidades (
  voluntario_id uuid references voluntarios(id) on delete cascade,
  data          date not null,
  primary key (voluntario_id, data)
);

create table if not exists cultos (
  id        uuid primary key default gen_random_uuid(),
  data      date not null unique,
  obs       text
);
alter table cultos drop column if exists publicada;

create table if not exists escalacoes (
  id            uuid primary key default gen_random_uuid(),
  culto_id      uuid not null references cultos(id) on delete cascade,
  funcao_id     uuid not null references funcoes(id) on delete cascade,
  voluntario_id uuid references voluntarios(id) on delete cascade,
  status        status_escala not null default 'pendente',
  fixo          boolean not null default false,
  respondido_em timestamptz,
  unique (culto_id, funcao_id)
);
create index if not exists ix_esc_culto on escalacoes(culto_id);
create index if not exists ix_esc_vol   on escalacoes(voluntario_id);

create table if not exists plantoes (
  culto_id      uuid references cultos(id) on delete cascade,
  voluntario_id uuid references voluntarios(id) on delete cascade,
  primary key (culto_id, voluntario_id)
);

create table if not exists config (
  id    int primary key default 1,
  dados jsonb not null default '{}'::jsonb,
  check (id = 1)
);

-- -------------------------------------------------------------- semente ---
insert into funcoes (nome, simultanea, ordem) values
  ('PROJEÇÃO',true,1),('ILUMINAÇÃO',true,2),('EDIÇÃO',false,3),
  ('FOTO',true,4),('FILMAGEM',true,5),('HEAD',true,6),('TRANSMISSÃO',true,7)
on conflict (nome) do nothing;

insert into config (id, dados) values (1, jsonb_build_object(
  'limitePadrao', 2, 'janelaCarga', 90, 'plantaoQtd', 1,
  'prazoConfirmacao', 'quinta-feira',
  'saudacao', 'Boa noite galera',
  'rodape', 'Confirma no seu link pessoal até {PRAZO}. Quem não puder, avisa agora e já indica o substituto.'
)) on conflict (id) do nothing;

-- ============================================================ REGRAS DURAS ==
-- Ninguém em duas funções que acontecem ao mesmo tempo no mesmo culto.
create or replace function fn_conflito_simultaneo() returns trigger
language plpgsql set search_path = public as $$
declare eh_sim boolean; colide text;
begin
  if new.voluntario_id is null then return new; end if;
  -- só valida quando a PESSOA entra na vaga. Mudar só o status nunca trava.
  if TG_OP = 'UPDATE' and old.voluntario_id is not distinct from new.voluntario_id
     and old.funcao_id is not distinct from new.funcao_id then return new; end if;
  select simultanea into eh_sim from funcoes where id = new.funcao_id;
  if not eh_sim then return new; end if;
  select f.nome into colide
    from escalacoes e join funcoes f on f.id = e.funcao_id
   where e.culto_id = new.culto_id and e.voluntario_id = new.voluntario_id
     and e.id <> new.id and f.simultanea limit 1;
  if colide is not null then
    raise exception 'Essa pessoa já está em % neste domingo.', colide;
  end if;
  return new;
end $$;

drop trigger if exists tg_conflito on escalacoes;
create trigger tg_conflito before insert or update on escalacoes
  for each row execute function fn_conflito_simultaneo();

-- Não escala quem marcou indisponibilidade naquela data.
create or replace function fn_indisponivel() returns trigger
language plpgsql set search_path = public as $$
declare d date;
begin
  if new.voluntario_id is null then return new; end if;
  if TG_OP = 'UPDATE'
     and old.voluntario_id is not distinct from new.voluntario_id
     and old.culto_id is not distinct from new.culto_id then return new; end if;
  select data into d from cultos where id = new.culto_id;
  if exists (select 1 from indisponibilidades
              where voluntario_id = new.voluntario_id and data = d) then
    raise exception 'Essa pessoa avisou que não pode em %.', to_char(d,'DD/MM');
  end if;
  return new;
end $$;

drop trigger if exists tg_indisp on escalacoes;
create trigger tg_indisp before insert or update on escalacoes
  for each row execute function fn_indisponivel();

-- ================================================ PÁGINA DO VOLUNTÁRIO (RPC)
-- O voluntário não faz login. Ele abre /eu/<token>. Estas funções rodam com
-- privilégio elevado mas SÓ enxergam e alteram as linhas do dono do token.

create or replace function eu_dados(p_token text)
returns table (nome text, escalas jsonb, indisponivel jsonb)
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nome text;
begin
  select id, voluntarios.nome into v_id, v_nome from voluntarios where token = p_token and ativo;
  if v_id is null then raise exception 'Link inválido'; end if;
  return query
  select v_nome,
    coalesce((
      select jsonb_agg(x order by x->>'data')
      from (
        select jsonb_build_object(
          'culto_id', c.id, 'data', c.data, 'funcao', f.nome,
          'status', e.status, 'obs', c.obs, 'plantao', false) as x
        from escalacoes e
        join cultos c on c.id = e.culto_id
        join funcoes f on f.id = e.funcao_id
        where e.voluntario_id = v_id and c.data >= current_date - 1
        union all
        select jsonb_build_object(
          'culto_id', c.id, 'data', c.data, 'funcao', 'PLANTÃO',
          'status', 'pendente', 'obs', c.obs, 'plantao', true)
        from plantoes p join cultos c on c.id = p.culto_id
        where p.voluntario_id = v_id and c.data >= current_date - 1
      ) t
    ), '[]'::jsonb),
    coalesce((select jsonb_agg(data order by data) from indisponibilidades
               where voluntario_id = v_id and data >= current_date), '[]'::jsonb);
end $$;

create or replace function eu_responder(p_token text, p_culto_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_data date;
begin
  if p_status not in ('confirmado','recusado') then raise exception 'Resposta invalida'; end if;
  select id into v_id from voluntarios where token = p_token and ativo;
  if v_id is null then raise exception 'Link invalido'; end if;
  select data into v_data from cultos where id = p_culto_id;
  -- confirmar = "eu POSSO nesse dia": limpa a indisponibilidade da data
  if p_status = 'confirmado' then
    delete from indisponibilidades where voluntario_id = v_id and data = v_data;
  end if;
  update escalacoes set status = p_status::status_escala, respondido_em = now()
   where culto_id = p_culto_id and voluntario_id = v_id;
  -- recusar = "eu NÃO POSSO nesse dia": vira indisponibilidade, e um
  -- re-sorteio do domingo nunca devolve a pessoa para o mesmo dia
  if p_status = 'recusado' and v_data is not null then
    insert into indisponibilidades (voluntario_id, data) values (v_id, v_data)
    on conflict do nothing;
  end if;
end $$;

create or replace function eu_indisponibilidade(p_token text, p_data date, p_marcar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from voluntarios where token = p_token and ativo;
  if v_id is null then raise exception 'Link inválido'; end if;
  if p_marcar then
    insert into indisponibilidades (voluntario_id, data) values (v_id, p_data)
    on conflict do nothing;
    -- avisa o líder na hora, em vez de deixar como "não respondeu"
    update escalacoes e set status = 'recusado', respondido_em = now()
      from cultos c where c.id = e.culto_id and c.data = p_data
       and e.voluntario_id = v_id and e.status <> 'furou';
  else
    delete from indisponibilidades where voluntario_id = v_id and data = p_data;
    -- clicou errado? desmarcar devolve a escala e ele pode confirmar de novo
    update escalacoes e set status = 'pendente', respondido_em = null
      from cultos c where c.id = e.culto_id and c.data = p_data
       and e.voluntario_id = v_id and e.status = 'recusado';
  end if;
end $$;

-- Domingos dos próximos 60 dias, para o voluntário marcar quando não pode.
create or replace function eu_proximos_domingos()
returns table (data date)
language sql security definer set search_path = public as $$
  select d::date from generate_series(current_date, current_date + 60, '1 day') d
   where extract(dow from d) = 0;
$$;

-- ========================================================= QUEM É LÍDER ====
-- Só estes emails enxergam alguma coisa. Qualquer outra pessoa que faça login
-- (o cadastro por link de email é aberto) não lê uma única linha.
create table if not exists lideres (
  email     text primary key,
  criado_em timestamptz not null default now()
);
insert into lideres (email) values ('arthurrangel427@gmail.com') on conflict do nothing;

create or replace function is_lider() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from lideres
    where lower(email) = lower(coalesce(auth.jwt()->>'email','')));
$$;
grant execute on function is_lider() to authenticated, anon;

-- ============================================== GRAVAR UM DOMINGO INTEIRO ==
-- Uma transação só. Se qualquer regra barrar, nada é gravado e o domingo
-- continua como estava. Sem isso, um erro no meio deixaria a escala vazia.
create or replace function salvar_dia(p_data date, p_obs text, p_slots jsonb, p_plantao uuid[])
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_culto uuid; r record;
begin
  insert into cultos (data, obs) values (p_data, coalesce(p_obs,''))
    on conflict (data) do update set obs = excluded.obs
    returning id into v_culto;
  delete from escalacoes where culto_id = v_culto;
  for r in select * from jsonb_to_recordset(coalesce(p_slots,'[]'::jsonb))
                        as x(funcao_id uuid, voluntario_id uuid, status text, fixo boolean)
  loop
    if r.voluntario_id is not null then
      insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo)
      values (v_culto, r.funcao_id, r.voluntario_id,
              coalesce(r.status,'pendente')::status_escala, coalesce(r.fixo,false));
    end if;
  end loop;
  delete from plantoes where culto_id = v_culto;
  if p_plantao is not null and array_length(p_plantao,1) > 0 then
    insert into plantoes (culto_id, voluntario_id)
    select v_culto, x from unnest(p_plantao) x on conflict do nothing;
  end if;
  return v_culto;
end $$;
revoke execute on function salvar_dia(date, text, jsonb, uuid[]) from public;
revoke execute on function eu_dados(text) from public;
revoke execute on function eu_responder(text, uuid, text) from public;
revoke execute on function eu_indisponibilidade(text, date, boolean) from public;
revoke execute on function eu_proximos_domingos() from public;
grant execute on function salvar_dia(date, text, jsonb, uuid[]) to authenticated;
grant execute on function eu_dados(text), eu_responder(text, uuid, text),
  eu_indisponibilidade(text, date, boolean), eu_proximos_domingos() to anon, authenticated;

-- ==================================================================== RLS ==
alter table funcoes            enable row level security;
alter table voluntarios        enable row level security;
alter table habilidades        enable row level security;
alter table indisponibilidades enable row level security;
alter table cultos             enable row level security;
alter table escalacoes         enable row level security;
alter table plantoes           enable row level security;
alter table config             enable row level security;
alter table lideres            enable row level security;

do $$
declare t text;
begin
  foreach t in array array['funcoes','voluntarios','habilidades','indisponibilidades',
                           'cultos','escalacoes','plantoes','config','lideres'] loop
    execute format('drop policy if exists lider_tudo_%1$s on %1$I', t);
    execute format('create policy lider_tudo_%1$s on %1$I for all to authenticated using (is_lider()) with check (is_lider())', t);
  end loop;
end $$;

-- anon não lê tabela nenhuma. Só executa as funções da página do voluntário.
revoke all on all tables in schema public from anon;
grant execute on function eu_dados(text)                              to anon;
grant execute on function eu_responder(text, uuid, text)              to anon;
grant execute on function eu_indisponibilidade(text, date, boolean)   to anon;
grant execute on function eu_proximos_domingos()                      to anon;

-- ============================================================================
--  PRONTO. Entre no app com o email que está na tabela "lideres" acima.
--  Não precisa criar usuário à mão: o app manda um link de acesso por email.
-- ============================================================================
