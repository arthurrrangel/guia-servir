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
-- A REGUA, porque as migracoes da 84 em diante escrevem nela na ultima linha.
-- Ela nasce na 55, que e do sistema de escalas e nao entra aqui. Sem esta
-- tabela, cada uma delas morre DEPOIS de a conferencia ter passado, que e o
-- pior lugar possivel para falhar: o log mostra OK e o banco fica pela metade.
create table if not exists public.schema_versao (
  n int primary key, arquivo text, aplicada_em timestamptz not null default now());
SQL
B=$(cd "$(dirname "$0")/.." && pwd)

# TODAS AS MIGRACOES DE DEMANDAS, E NAO SEIS DELAS.
#
# 21/09/2026. Esta lista era 50/52/57/58/67/68 e ficou assim enquanto o banco
# andava ate a 88. Os 62 casos passavam 62/62 contra um esquema SEIS MIGRACOES
# ATRAS do repositorio — mediam um sistema que nao existe em lugar nenhum.
# Medido por uma auditoria independente: trazendo o harness para o dia, oito
# casos reprovavam.
#
# A 67 e a 68 saem da lista porque a 84, a 85 e a 87 reescrevem `dem_mover` e
# `dem_lista` por inteiro; a 80 nunca esteve aqui porque mexe em
# `public.pessoas`, que esta base nao tem de proposito.
for f in 50-demandas 52-o-que-a-auditoria-de-arquitetura-provou 57-dem-lista-com-teto \
         58-membro-novo-nasce-em-producao \
         84-o-portao-congelava-no-nascimento-e-um-tab-passava-por-texto \
         85-o-anexo-nao-era-anexo-era-um-link-sem-dono \
         86-sete-casts-cegos-e-quatro-acoes-que-diziam-ok-sem-fazer-nada \
         87-a-lista-escondia-a-atrasada-e-o-indicador-contava-quem-nao-tinha-prazo \
         88-a-segunda-auditoria-achou-o-que-a-primeira-deixou; do
  echo "-- ===== $f ====="
  cat "$B/supabase/$f.sql"
done > /tmp/_mig.sql
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
