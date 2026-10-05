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

/* O STORAGE, NO QUE AS MIGRAÇÕES TOCAM — 05/10/2026, migração 111.

   A 111 guarda a letra das músicas do Louvor (PDF) no Storage do Supabase:
   cria o armário `letras` em `storage.buckets` e as políticas de quem envia
   em `storage.objects`. No Supabase essas tabelas já existem (são da
   plataforma, como o `auth`); aqui vai o pedaço delas que a 111 usa, com os
   mesmos nomes, o RLS ligado e os GRANTs que o Supabase dá. Sem isto a
   conferência da 111 não teria onde provar que só a liderança do ministério
   envia letra para a pasta dele.

   Não é o Storage inteiro: o serviço que recebe o arquivo (a API do Storage)
   não roda aqui. O que roda é o que decide: a linha que ele grava em
   `storage.objects` passa ou não passa pelas políticas. */
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;
create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  public boolean default false,
  avif_autodetection boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  owner_id text
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  version text,
  owner_id text,
  user_metadata jsonb
);
create unique index if not exists bucketid_objname on storage.objects (bucket_id, name);
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant all on storage.buckets to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;
create or replace function storage.foldername(name text) returns text[] language plpgsql as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;

/* APAGAR PELA TABELA É BARRADO, COMO NO SUPABASE — 05/10/2026.

   A primeira rodada da 111 em produção reprovou num ponto só: o `delete`
   direto em `storage.objects`, que aqui passava sem achar linha (o RLS
   filtra), lá voltou erro de privilégio (42501). A plataforma barra o
   delete pela tabela antes do RLS, para ninguém deixar arquivo órfão no
   armário: quem apaga é a API do Storage. Este gatilho faz o mesmo aqui,
   para a conferência que passa neste banco passar lá também. */
create or replace function storage.protect_delete() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('storage.allow_delete_query', true), 'false') <> 'true' then
    raise exception 'Direct deletion from storage tables is not allowed. Use the Storage API instead.'
      using errcode = '42501';
  end if;
  return null;
end $$;
drop trigger if exists protect_objects_delete on storage.objects;
create trigger protect_objects_delete before delete on storage.objects
  for each statement execute function storage.protect_delete();
