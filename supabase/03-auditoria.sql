/* =============================================================================
   03 — CORREÇÕES DA AUDITORIA (aplicado em produção em 2026-08-06)

   Cada bloco existe por causa de um cenário concreto que quebrava o app.
   Idempotente: pode rodar de novo.
   ============================================================================= */

/* -----------------------------------------------------------------------------
   1. salvar_dia: escopo por ministério + upsert por slot.

   O culto é UMA linha para a igreja inteira (cultos.data é único). A versão
   antiga fazia `delete from escalacoes where culto_id = v_culto` sem filtro:
   qualquer ação comum do líder da Mídia (sortear, trocar, travar, salvar o
   recado) apagava a escala inteira do Louvor naquele domingo.

   E o delete+reinsert apagava a resposta que o voluntário tinha acabado de
   dar: às 20h01 a Ana confirma; às 20h05 o líder salva o recado com o estado
   de 19h40 em mãos e a confirmação da Ana vira "não respondeu".
   ----------------------------------------------------------------------------- */
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
           coalesce((x ->> 'fixo')::boolean, false) fx
      from jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) x
  loop
    if not exists (select 1 from funcoes where id = r.fid and equipe_id = p_equipe) then
      raise exception 'funcao de outro ministerio'; end if;
    if not exists (select 1 from voluntarios where id = r.vid and equipe_id = p_equipe) then
      raise exception 'voluntario de outro ministerio'; end if;

    insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo)
      values (v_culto, r.fid, r.vid, r.st, r.fx)
    on conflict (culto_id, funcao_id) do update
      set voluntario_id = excluded.voluntario_id,
          fixo          = excluded.fixo,
          -- trocar a pessoa zera a resposta; manter a mesma preserva
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

/* -----------------------------------------------------------------------------
   2. equipe_entrar: devolve OBJETO em vez de estourar.

   Com `raise exception`, o próprio INSERT no contador de tentativas era
   desfeito junto — o freio de força bruta nunca contava nada, e 4 dígitos
   são só 10 mil combinações. Além disso, dígitos errados voltavam como
   `null` com HTTP 200: o app mandava o voluntário para /eu/null.
   ----------------------------------------------------------------------------- */
create table if not exists entrar_tentativas (
  voluntario_id uuid not null references voluntarios(id) on delete cascade,
  dia  date not null default current_date,
  n    int  not null default 0,
  primary key (voluntario_id, dia)
);
alter table entrar_tentativas enable row level security;   -- sem policy: ninguém lê
revoke all on table entrar_tentativas from anon, public;

drop function if exists equipe_entrar(text, uuid, text);
create or replace function equipe_entrar(p_slug text, p_voluntario uuid, p_ult4 text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_tel text; v_tok text; v_n int; v_max constant int := 8;
begin
  select nullif(tel_norm(v.telefone),''), v.token into v_tel, v_tok
    from voluntarios v join equipes e on e.id = v.equipe_id
   where v.id = p_voluntario and e.slug = p_slug and v.ativo;

  if v_tok is null then return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO'); end if;
  -- sem WhatsApp não há como provar quem é: o link do grupo é público para o grupo
  if v_tel is null or length(v_tel) < 4 then
    return jsonb_build_object('ok', false, 'erro', 'SEM_TELEFONE');
  end if;

  insert into entrar_tentativas (voluntario_id) values (p_voluntario)
  on conflict (voluntario_id, dia) do update set n = entrar_tentativas.n + 1
  returning n into v_n;

  if v_n > v_max then return jsonb_build_object('ok', false, 'erro', 'MUITAS_TENTATIVAS'); end if;

  if right(v_tel, 4) <> tel_norm(coalesce(p_ult4,'')) then
    return jsonb_build_object('ok', false, 'erro', 'DIGITOS_NAO_CONFEREM',
                              'restam', greatest(v_max - v_n, 0));
  end if;

  delete from entrar_tentativas where voluntario_id = p_voluntario;
  return jsonb_build_object('ok', true, 'token', v_tok);
end $fn$;
revoke all on function equipe_entrar(text, uuid, text) from public;
grant execute on function equipe_entrar(text, uuid, text) to anon, authenticated;

/* -----------------------------------------------------------------------------
   3. Gatilhos: ignorar o próprio slot no upsert, e casar a mesma PESSOA
      cadastrada em dois ministérios (linhas diferentes, mesmo telefone).

   Sem o `e.funcao_id <> new.funcao_id`, o ON CONFLICT DO UPDATE disparava o
   gatilho contra a linha que ele mesmo ia substituir: todo save quebrava com
   "Fulano já está em X neste domingo".
   ----------------------------------------------------------------------------- */
create or replace function fn_conflito_simultaneo() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare v_tel text; v_nome text; v_outra text;
begin
  if not exists (select 1 from funcoes where id = new.funcao_id and simultanea) then
    return new;
  end if;
  select nullif(tel_norm(telefone),''), nome into v_tel, v_nome
    from voluntarios where id = new.voluntario_id;

  select f.nome into v_outra
    from escalacoes e
    join funcoes f on f.id = e.funcao_id and f.simultanea
    join voluntarios v on v.id = e.voluntario_id
   where e.culto_id = new.culto_id
     and e.funcao_id <> new.funcao_id
     and ( e.voluntario_id = new.voluntario_id
        or (v_tel is not null and nullif(tel_norm(v.telefone),'') = v_tel) )
   limit 1;

  if v_outra is not null then
    raise exception '% ja esta em % neste domingo.', v_nome, v_outra;
  end if;
  return new;
end $fn$;

create or replace function fn_indisponivel() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare v_data date; v_tel text; v_nome text; v_bloq int;
begin
  -- só valida quando a PESSOA ou o DIA mudam: editar o recado do domingo
  -- não pode congelar a linha inteira
  if tg_op = 'UPDATE'
     and new.voluntario_id is not distinct from old.voluntario_id
     and new.culto_id      is not distinct from old.culto_id then
    return new;
  end if;

  select data into v_data from cultos where id = new.culto_id;
  select nullif(tel_norm(telefone),''), nome into v_tel, v_nome
    from voluntarios where id = new.voluntario_id;

  select count(*) into v_bloq
    from indisponibilidades i
    join voluntarios v on v.id = i.voluntario_id
   where i.data = v_data
     and ( i.voluntario_id = new.voluntario_id
        or (v_tel is not null and nullif(tel_norm(v.telefone),'') = v_tel) );

  if v_bloq > 0 then raise exception '% avisou que nao pode neste domingo.', v_nome; end if;
  return new;
end $fn$;

/* --------------------------------------------- 4. allowlist à prova de vazio */
-- uma única linha com email '' fazia is_lider() devolver true para qualquer
-- usuário autenticado, e o cadastro é aberto
delete from lideres where position('@' in coalesce(email, '')) < 2;
alter table lideres drop constraint if exists lider_email_valido;
alter table lideres add  constraint lider_email_valido check (position('@' in email) > 1);

create or replace function is_lider() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from lideres
    where email <> '' and lower(email) = lower(nullif(auth.jwt() ->> 'email', '')));
$$;

/* ------------------------- 5. índices do padrão de acesso multi-ministério */
create index if not exists ix_esc_funcao  on escalacoes(funcao_id);
create index if not exists ix_plant_vol   on plantoes(voluntario_id);
create index if not exists ix_vol_equipe  on voluntarios(equipe_id);
create index if not exists ix_func_equipe on funcoes(equipe_id);
create index if not exists ix_indisp_vol  on indisponibilidades(voluntario_id);

/* ---------- 6. tabelas novas não podem nascer abertas para anon (padrão do Supabase) */
revoke all on table culto_obs, entrar_tentativas, equipes, lideres from anon, public;
grant select, insert, update, delete on table culto_obs to authenticated;

/* -----------------------------------------------------------------------------
   7. Recado do domingo POR MINISTÉRIO.

   `cultos.obs` era global: o líder do Louvor escrevia "ensaio 16h, trazer
   partitura" e os voluntários da MÍDIA liam esse aviso colado na escalação
   deles; depois o líder da Mídia escrevia por cima e o recado do Louvor sumia.
   ----------------------------------------------------------------------------- */
create table if not exists culto_obs (
  culto_id  uuid not null references cultos(id)  on delete cascade,
  equipe_id uuid not null references equipes(id) on delete cascade,
  obs       text not null default '',
  primary key (culto_id, equipe_id)
);
alter table culto_obs enable row level security;
drop policy if exists p_culto_obs on culto_obs;
create policy p_culto_obs on culto_obs for all to authenticated
  using (is_lider()) with check (is_lider());

/* -----------------------------------------------------------------------------
   8. equipe_publica: nome do ministério mesmo sem ninguém cadastrado.

   Com INNER JOIN, um ministério recém-criado devolvia zero linhas e a tela
   dizia "Link inválido" — exatamente no fluxo recomendado, em que o líder
   fixa o link no grupo ANTES de cadastrar o time. O LEFT JOIN devolve uma
   linha com voluntario_id nulo, que o app trata como "ninguém ainda".

   `precisa_link` = a pessoa não tem WhatsApp cadastrado, então não dá para
   provar que é ela; o app mostra "peça o link ao líder" em vez de deixar
   qualquer um do grupo abrir a página pessoal dela.
   ----------------------------------------------------------------------------- */
create or replace function equipe_publica(p_slug text)
returns table (equipe text, voluntario_id uuid, primeiro_nome text, precisa_link boolean)
language sql security definer stable set search_path = public as $$
  select e.nome, v.id, split_part(v.nome, ' ', 1),
         coalesce(length(nullif(tel_norm(v.telefone), '')), 0) < 4
    from equipes e
    left join voluntarios v on v.equipe_id = e.id and v.ativo
   where e.slug = p_slug
   order by v.nome;
$$;
revoke all on function equipe_publica(text) from public;
grant execute on function equipe_publica(text) to anon, authenticated;

/* ------------------------------------------------- 9. líderes autorizados */
insert into lideres (email) values
  ('arthurrangel427@gmail.com'),
  ('otero.fabricio@gmail.com')
on conflict (email) do nothing;
