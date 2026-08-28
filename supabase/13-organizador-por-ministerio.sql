-- ============ ORGANIZADOR DE ESCALA POR MINISTÉRIO (acesso separado) =======
-- Sintoma: `lideres` era uma lista de e-mails, sem ministério nenhum, e
-- is_lider() devolvia true ou false para o app inteiro. Resultado: quem
-- organiza a Mídia abria o app e via, editava e sorteava o Serviço do Culto
-- também, e vice-versa. Com um ministério só isso não incomodava. Com dois,
-- cada organizador mexe na casa do outro.
--
-- Correção: a linha de líder passa a apontar para um ministério.
--   equipe_id = NULL  -> enxerga e organiza TUDO (quem cuida do app)
--   equipe_id = X     -> enxerga e organiza só o ministério X
--
-- Quem já estava cadastrado fica com NULL, ou seja, ninguém perde acesso ao
-- aplicar esta migração. A separação começa quando alguém for apontado para um
-- ministério específico. Isso é de propósito: migração de permissão que tranca
-- o dono para fora do próprio sistema é pior que o problema que resolve.

-- 1) a coluna, e a possibilidade de a mesma pessoa organizar dois ministérios
alter table lideres add column if not exists equipe_id uuid references equipes(id) on delete cascade;
alter table lideres drop constraint if exists lideres_pkey;
drop index if exists lideres_email_equipe;
create unique index lideres_email_equipe on lideres (email, coalesce(equipe_id, '00000000-0000-0000-0000-000000000000'::uuid));
comment on column lideres.equipe_id is
  'null = organiza todos os ministérios. Preenchido = só aquele.';

-- 2) as duas perguntas que as políticas passam a fazer
create or replace function lidera_tudo() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from lideres
     where email <> '' and lower(email) = lower(nullif(auth.jwt() ->> 'email', ''))
       and equipe_id is null);
$$;
grant execute on function lidera_tudo() to authenticated, anon;

create or replace function lidera_equipe(p_equipe uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from lideres
     where email <> '' and lower(email) = lower(nullif(auth.jwt() ->> 'email', ''))
       and (equipe_id is null or equipe_id = p_equipe));
$$;
grant execute on function lidera_equipe(uuid) to authenticated, anon;

-- 3) políticas por ministério.
--    `cultos` fica fora de propósito: a linha do domingo é da igreja inteira,
--    os dois ministérios precisam dela para montar a própria escala, e ela não
--    guarda nada de ninguém além da data.
do $$
declare t text;
begin
  -- tabelas que têm equipe_id na própria linha
  foreach t in array array['funcoes','voluntarios','config','culto_obs'] loop
    execute format('drop policy if exists lider_tudo_%1$s on %1$I', t);
    execute format('drop policy if exists p_%1$s on %1$I', t);
    execute format('drop policy if exists eq_%1$s on %1$I', t);
    execute format($f$create policy eq_%1$s on %1$I for all to authenticated
                     using (lidera_equipe(equipe_id)) with check (lidera_equipe(equipe_id))$f$, t);
  end loop;

  -- tabelas que chegam no ministério pelo voluntário
  foreach t in array array['habilidades','indisponibilidades','plantoes','disponibilidade'] loop
    execute format('drop policy if exists lider_tudo_%1$s on %1$I', t);
    execute format('drop policy if exists p_disp_lider on %1$I', t);
    execute format('drop policy if exists eq_%1$s on %1$I', t);
    execute format($f$create policy eq_%1$s on %1$I for all to authenticated
      using (exists (select 1 from voluntarios v where v.id = voluntario_id and lidera_equipe(v.equipe_id)))
      with check (exists (select 1 from voluntarios v where v.id = voluntario_id and lidera_equipe(v.equipe_id)))$f$, t);
  end loop;
end $$;

-- escalação chega no ministério pela função
drop policy if exists lider_tudo_escalacoes on escalacoes;
drop policy if exists eq_escalacoes on escalacoes;
create policy eq_escalacoes on escalacoes for all to authenticated
  using (exists (select 1 from funcoes f where f.id = funcao_id and lidera_equipe(f.equipe_id)))
  with check (exists (select 1 from funcoes f where f.id = funcao_id and lidera_equipe(f.equipe_id)));

-- o seletor do topo passa a listar só o que a pessoa organiza
drop policy if exists lider_tudo_equipes on equipes;
drop policy if exists eq_equipes on equipes;
create policy eq_equipes_ler on equipes for select to authenticated using (lidera_equipe(id));
create policy eq_equipes_mexer on equipes for all to authenticated
  using (lidera_tudo()) with check (lidera_tudo());

-- quem dá e tira acesso é só quem organiza tudo. Ler, qualquer organizador lê
-- (para saber quem mais mexe no ministério dele).
drop policy if exists lider_tudo_lideres on lideres;
drop policy if exists eq_lideres on lideres;
create policy eq_lideres_ler on lideres for select to authenticated
  using (lidera_tudo() or equipe_id is null or lidera_equipe(equipe_id));
create policy eq_lideres_mexer on lideres for all to authenticated
  using (lidera_tudo()) with check (lidera_tudo());

----------------------------------------------------------------------------
-- sou_lider() continua respondendo "esta pessoa entra no app?", que é o que o
-- Shell pergunta na porta. O que mudou é o que ela ENXERGA depois de entrar.
create or replace function sou_lider() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from lideres
     where email <> '' and lower(email) = lower(nullif(auth.jwt() ->> 'email', '')));
$$;
grant execute on function sou_lider() to authenticated, anon;

-- conferência
select l.email,
       coalesce(e.nome, 'TUDO') as organiza,
       (select count(*) from equipes) as ministerios
  from lideres l left join equipes e on e.id = l.equipe_id
 order by l.email;
