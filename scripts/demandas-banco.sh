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
cat "$B/supabase/50-demandas.sql" "$B/supabase/52-o-que-a-auditoria-de-arquitetura-provou.sql" "$B/supabase/57-dem-lista-com-teto.sql" "$B/supabase/58-membro-novo-nasce-em-producao.sql" "$B/supabase/67-o-portao-de-aprovacao-tinha-tres-portas-dos-fundos.sql" "$B/supabase/68-dem-lista-devolvia-o-erro-cru-do-postgres.sql" > /tmp/_mig.sql
cp "$B/scripts/demandas-banco.test.sql"   /tmp/_test.sql
chmod 644 /tmp/_prep.sql /tmp/_mig.sql /tmp/_test.sql
su postgres -c "$PG/psql -h /tmp -U postgres -d dem -q -f /tmp/_prep.sql"
su postgres -c "$PG/psql -h /tmp -U postgres -d dem -q -v ON_ERROR_STOP=1 -f /tmp/_mig.sql" >/dev/null
# de novo, para provar que a migração é idempotente
su postgres -c "$PG/psql -h /tmp -U postgres -d dem -q -v ON_ERROR_STOP=1 -f /tmp/_mig.sql" >/dev/null
# O CÓDIGO DE SAÍDA PRECISA CHEGAR AQUI INTEIRO.
#
# 21/09/2026. Esta linha era um `psql ... | grep -v NOTICE | tail -80`, e o
# status de um pipeline é o do ÚLTIMO comando — `tail`, que sempre devolve 0.
# Resultado: `demandas-banco.test.sql` imprimia "falhas | 1" e o script dizia
# que estava tudo bem. Os 62 casos eram decorativos, e ficaram assim até
# alguém (eu) ler a tabela impressa em vez de confiar no código de saída.
#
# `pipefail` não serve aqui: `grep -v` devolve 1 quando não sobra linha
# nenhuma, e isso reprovaria a suíte por um motivo que não é reprovação.
# Guardar o status do psql num arquivo e filtrar DEPOIS é o que mantém as
# duas coisas separadas: o que se imprime e o que se decide.
st=0
su postgres -c "$PG/psql -h /tmp -U postgres -d dem -f /tmp/_test.sql" \
  > /tmp/_test.log 2>&1 || st=$?
grep -v '^NOTICE' /tmp/_test.log | tail -80
if [ "$st" != 0 ]; then
  echo
  echo "FALHOU — demandas-banco reprovou (psql saiu $st). O detalhe está acima."
  exit 1
fi
echo
echo "OK — demandas: as regras do PDF valem no banco, e a suite agora reprova quando nao valem."
