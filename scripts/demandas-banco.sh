#!/bin/bash
# Sobe um Postgres 16 descartável, aplica a migração e roda banco.test.sql.
# Precisa rodar como root num container com postgresql-16 instalado.
set -e
D=/tmp/pgdem
PG=/usr/lib/postgresql/16/bin
if ! su postgres -c "$PG/pg_ctl -D $D status" >/dev/null 2>&1; then
  rm -rf $D; mkdir -p $D; chown postgres:postgres $D
  su postgres -c "$PG/initdb -D $D -A trust -U postgres" >/dev/null 2>&1
  printf "listen_addresses=''\nunix_socket_directories='/tmp'\n" >> $D/postgresql.conf
  chown -R postgres:postgres $D
  su postgres -c "$PG/pg_ctl -D $D -l /tmp/pgdem.log start -w" >/dev/null 2>&1
fi
su postgres -c "$PG/psql -h /tmp -U postgres -q -c 'drop database if exists dem;' -c 'create database dem;'" >/dev/null
cat > /tmp/_prep.sql <<'SQL'
-- O PGCRYPTO FICA ONDE A PRODUCAO TEM: em `extensions`, fora do search_path
-- curto das funcoes `security definer`. Medido no Supabase em 20/09/2026:
-- pgcrypto 1.3 em `extensions`, search_path da sessao "$user", public,
-- extensions. Com o pgcrypto em `public`, este harness ESCONDIA o defeito
-- que a 58 conserta (gen_random_bytes invisivel dentro de dem_ajustar).
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ begin
  execute format('alter database %I set search_path to public, extensions', current_database());
end $$;
-- os dois papéis que o Supabase cria sozinho e um Postgres cru não tem
do $$ begin create role anon;          exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create schema if not exists auth;
-- o que o Supabase dá de graça e aqui precisa de dublê: quem está logado
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('teste.jwt', true), '')::jsonb, '{}'::jsonb);
$$;
SQL
B=$(cd "$(dirname "$0")/.." && pwd)
cat "$B/supabase/50-demandas.sql" "$B/supabase/52-o-que-a-auditoria-de-arquitetura-provou.sql" "$B/supabase/57-dem-lista-com-teto.sql" "$B/supabase/58-membro-novo-nasce-em-producao.sql" > /tmp/_mig.sql
cp "$B/scripts/demandas-banco.test.sql"   /tmp/_test.sql
chmod 644 /tmp/_prep.sql /tmp/_mig.sql /tmp/_test.sql
su postgres -c "$PG/psql -h /tmp -U postgres -d dem -q -f /tmp/_prep.sql"
su postgres -c "$PG/psql -h /tmp -U postgres -d dem -q -v ON_ERROR_STOP=1 -f /tmp/_mig.sql" >/dev/null
# de novo, para provar que a migração é idempotente
su postgres -c "$PG/psql -h /tmp -U postgres -d dem -q -v ON_ERROR_STOP=1 -f /tmp/_mig.sql" >/dev/null
su postgres -c "$PG/psql -h /tmp -U postgres -d dem -f /tmp/_test.sql" 2>&1 | grep -v '^NOTICE' | tail -80
