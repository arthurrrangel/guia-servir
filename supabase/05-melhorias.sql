/* =============================================================================
   05 — MELHORIAS (aplicado em produção em 2026-08-06)

   1. Plantão curinga: só quem cobre 2+ funções sem treino (feito no motor).
   2. Marca de "1ª vez" por domingo: escalacoes.primeira_vez → instrução no link.
   3. Disponibilidade explícita: voluntário responde posso/não posso por domingo.
   Idempotente.
   ============================================================================= */

/* -------------------------------------------------- 2. marca de 1ª vez no slot */
alter table escalacoes add column if not exists primeira_vez boolean not null default false;

create or replace function salvar_dia(
  p_equipe uuid, p_data date, p_obs text, p_slots jsonb, p_plantao uuid[]
) returns uuid
language plpgsql security invoker set search_path = public as $fn$
declare v_culto uuid; r record;
begin
  if p_equipe is null then raise exception 'salvar_dia sem ministerio'; end if;

  insert into cultos (data) values (p_data)
    on conflict (data) do update set data = excluded.data
    returning id into v_culto;
  if v_culto is null then select id into v_culto from cultos where data = p_data; end if;

  insert into culto_obs (culto_id, equipe_id, obs)
    values (v_culto, p_equipe, coalesce(p_obs, ''))
  on conflict (culto_id, equipe_id) do update set obs = excluded.obs;

  for r in
    select (x ->> 'funcao_id')::uuid fid,
           (x ->> 'voluntario_id')::uuid vid,
           coalesce(x ->> 'status', 'pendente')::status_escala st,
           coalesce((x ->> 'fixo')::boolean, false) fx,
           coalesce((x ->> 'primeira_vez')::boolean, false) pv
      from jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) x
  loop
    if not exists (select 1 from funcoes where id = r.fid and equipe_id = p_equipe) then
      raise exception 'funcao de outro ministerio'; end if;
    if not exists (select 1 from voluntarios where id = r.vid and equipe_id = p_equipe) then
      raise exception 'voluntario de outro ministerio'; end if;

    insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
      values (v_culto, r.fid, r.vid, r.st, r.fx, r.pv)
    on conflict (culto_id, funcao_id) do update
      set voluntario_id = excluded.voluntario_id,
          fixo          = excluded.fixo,
          primeira_vez  = excluded.primeira_vez,
          status        = case when escalacoes.voluntario_id is distinct from excluded.voluntario_id
                               then excluded.status else escalacoes.status end,
          respondido_em = case when escalacoes.voluntario_id is distinct from excluded.voluntario_id
                               then null else escalacoes.respondido_em end;
  end loop;

  delete from escalacoes e using funcoes f
   where f.id = e.funcao_id and e.culto_id = v_culto and f.equipe_id = p_equipe
     and not exists (select 1 from jsonb_array_elements(coalesce(p_slots,'[]'::jsonb)) x
                      where (x ->> 'funcao_id')::uuid = e.funcao_id);

  delete from plantoes p using voluntarios v
   where v.id = p.voluntario_id and p.culto_id = v_culto and v.equipe_id = p_equipe
     and not (p.voluntario_id = any (coalesce(p_plantao, '{}'::uuid[])));

  insert into plantoes (culto_id, voluntario_id)
  select v_culto, v.id from voluntarios v
   where v.id = any (coalesce(p_plantao, '{}'::uuid[])) and v.equipe_id = p_equipe
  on conflict do nothing;

  return v_culto;
end $fn$;
revoke all on function salvar_dia(uuid,date,text,jsonb,uuid[]) from public, anon;
grant execute on function salvar_dia(uuid,date,text,jsonb,uuid[]) to authenticated;

/* -------------------------------------------- 3. disponibilidade explícita */
create table if not exists disponibilidade (
  voluntario_id uuid not null references voluntarios(id) on delete cascade,
  data date not null,
  pode boolean not null,
  respondido_em timestamptz not null default now(),
  primary key (voluntario_id, data)
);
alter table disponibilidade enable row level security;
drop policy if exists p_disp_lider on disponibilidade;
create policy p_disp_lider on disponibilidade for select to authenticated using (is_lider());
revoke all on table disponibilidade from anon, public;

-- garante dedupe do lado das indisponibilidades (usado no on conflict abaixo)
create unique index if not exists ux_indisp_vol_data on indisponibilidades(voluntario_id, data);

/* o voluntário responde posso/não posso. 'nao' também vira indisponibilidade
   (o motor lê essa tabela); 'posso' remove a indisponibilidade. */
create or replace function eu_disponibilidade(p_token text, p_data date, p_resposta text)
returns void
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  select id into v_id from voluntarios where token = p_token and ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  if p_resposta = 'posso' then
    insert into disponibilidade (voluntario_id, data, pode) values (v_id, p_data, true)
      on conflict (voluntario_id, data) do update set pode = true, respondido_em = now();
    delete from indisponibilidades where voluntario_id = v_id and data = p_data;
  elsif p_resposta = 'nao' then
    insert into disponibilidade (voluntario_id, data, pode) values (v_id, p_data, false)
      on conflict (voluntario_id, data) do update set pode = false, respondido_em = now();
    insert into indisponibilidades (voluntario_id, data) values (v_id, p_data)
      on conflict (voluntario_id, data) do nothing;
  else
    delete from disponibilidade where voluntario_id = v_id and data = p_data;
    delete from indisponibilidades where voluntario_id = v_id and data = p_data;
  end if;
end $fn$;
revoke all on function eu_disponibilidade(text, date, text) from public;
grant execute on function eu_disponibilidade(text, date, text) to anon, authenticated;

/* -------------------------------- eu_dados: + primeira_vez por item, + disponivel */
drop function if exists eu_dados(text);
create function eu_dados(p_token text)
 returns table(nome text, equipe text, escalas jsonb, indisponivel jsonb, disponivel jsonb)
 language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid; v_nome text; v_eq uuid; v_eqnome text;
begin
  select v.id, v.nome, v.equipe_id into v_id, v_nome, v_eq
    from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;
  select e.nome into v_eqnome from equipes e where e.id = v_eq;

  return query select v_nome, coalesce(v_eqnome,'Escala'),
    coalesce((select jsonb_agg(x order by x->>'data') from (
        select jsonb_build_object('culto_id',c.id,'data',c.data,'funcao',f.nome,'status',e.status,
                 'primeira_vez',e.primeira_vez,
                 'obs',(select o.obs from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'plantao',false) as x
          from escalacoes e join cultos c on c.id=e.culto_id join funcoes f on f.id=e.funcao_id
         where e.voluntario_id = v_id and c.data >= current_date - 1
        union all
        select jsonb_build_object('culto_id',c.id,'data',c.data,'funcao','PLANTAO','status','pendente',
                 'primeira_vez',false,
                 'obs',(select o.obs from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'plantao',true)
          from plantoes p join cultos c on c.id=p.culto_id
         where p.voluntario_id = v_id and c.data >= current_date - 1) t), '[]'::jsonb),
    coalesce((select jsonb_agg(i.data order by i.data) from indisponibilidades i
               where i.voluntario_id = v_id and i.data >= current_date), '[]'::jsonb),
    coalesce((select jsonb_agg(d.data order by d.data) from disponibilidade d
               where d.voluntario_id = v_id and d.pode = true and d.data >= current_date), '[]'::jsonb);
end $function$;
revoke all on function eu_dados(text) from public;
grant execute on function eu_dados(text) to anon, authenticated;
