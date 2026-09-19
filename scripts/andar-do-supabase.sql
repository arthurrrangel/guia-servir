-- =============================================================================
-- O PEDAÇO DO SUPABASE QUE NÃO ESTÁ NAS MIGRAÇÕES.
--
-- Os papéis `anon`/`authenticated`/`service_role`, o esquema `auth` com
-- `auth.jwt()`, o pgcrypto em `extensions` e os GRANTs padrão em tabelas novas
-- são da PLATAFORMA, não do projeto. Nenhuma migração os cria, porque no
-- Supabase eles já vêm prontos — e toda migração que fala de RLS depende deles.
--
-- POR QUE ISTO VIROU ARQUIVO PRÓPRIO — 19/09/2026.
--
-- Este bloco morava dentro de `banco-do-zero.sh`. Quando `escala-banco.sh` foi
-- reescrito para também subir um Postgres do zero, a escolha era copiar as 20
-- linhas para lá ou extraí-las. Copiar é o começo de duas verdades: a primeira
-- versão do `escala-banco.sh` reescrito NÃO copiou, e reprovou 73 casos com
-- `role "authenticated" does not exist` — um andar que o script não sabia que
-- precisava construir.
--
-- Com um arquivo só, quem acrescentar um papel ou uma função de `auth`
-- acrescenta em um lugar e os dois roteiros enxergam.
--
-- Não é para rodar no banco que está no ar: lá isto já existe, feito pelo
-- Supabase.
-- =============================================================================

create schema if not exists auth;
create schema if not exists extensions;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls; end if;
end $$;

grant usage on schema public, extensions, auth to anon, authenticated, service_role;
create extension if not exists pgcrypto with schema extensions;

/* O `search_path` COM `extensions` DENTRO, e por que ele é dinâmico.

   `pgcrypto` fica no esquema `extensions`, como no Supabase. Sem ele no
   caminho, a `01` morre logo na linha 68 com `function gen_random_bytes(integer)
   does not exist` e as 55 seguintes caem em dominó.

   A versão que morava no `banco-do-zero.sh` era `alter database guia set ...`,
   com o nome do banco escrito na mão. Isso funcionava lá e só lá: o
   `escala-banco.sh` usa outro nome, e foi exatamente esse detalhe que
   derrubou as 56 migrações na primeira execução depois da extração.
   `current_database()` tira o nome da frente.

   Vale para SESSÃO NOVA, não para esta: os dois roteiros abrem um psql por
   arquivo, então a próxima já nasce com o caminho certo. */
do $$ begin
  execute format('alter database %I set search_path to public, extensions', current_database());
end $$;

create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb, '{}'::jsonb) $$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create or replace function auth.email() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.email', true),'') $$;

alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
