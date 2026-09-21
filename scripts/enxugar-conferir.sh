#!/usr/bin/env bash
# PROVA DE QUE O ENXUTO E O ORIGINAL PRODUZEM O MESMO BANCO.
#
# `scripts/enxugar-migracao.py` tira comentario para o arquivo caber no editor
# do Supabase. "Tirei so comentario" e uma afirmacao que se faz com facilidade
# e que quebra de tres jeitos silenciosos: comentario dentro de corpo de
# funcao vira parte da funcao; `--` dentro de string nao e comentario; e
# dollar-quote aninhado confunde qualquer regex.
#
# Entao ninguem acredita no enxugador. Este roteiro monta DOIS bancos do zero,
# aplica o original num e o enxuto no outro, e compara o catalogo: toda funcao
# por `pg_get_functiondef`, toda constraint por `pg_get_constraintdef`, todo
# indice, todo gatilho e todo comentario de objeto. Um byte de diferenca
# reprova.
set -euo pipefail
PG=/usr/lib/postgresql/16/bin
B="$(cd "$(dirname "$0")/.." && pwd)"
S=${TMPDIR:-/tmp}/enxugar-conferir
rm -rf "$S"; mkdir -p "$S"; chmod 777 "$S"

MIGS="50-demandas 52-o-que-a-auditoria-de-arquitetura-provou 57-dem-lista-com-teto
      58-membro-novo-nasce-em-producao
      84-o-portao-congelava-no-nascimento-e-um-tab-passava-por-texto
      85-o-anexo-nao-era-anexo-era-um-link-sem-dono
      86-sete-casts-cegos-e-quatro-acoes-que-diziam-ok-sem-fazer-nada
      87-a-lista-escondia-a-atrasada-e-o-indicador-contava-quem-nao-tinha-prazo
      88-a-segunda-auditoria-achou-o-que-a-primeira-deixou"

cat > "$S/prep.sql" <<'SQL'
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ begin execute format('alter database %I set search_path to public, extensions', current_database()); end $$;
do $$ begin create role anon;          exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('teste.jwt', true), '')::jsonb, '{}'::jsonb);
$$;
create table if not exists public.schema_versao (n int primary key, arquivo text, aplicada_em timestamptz not null default now());
SQL

# o retrato do catalogo: tudo que uma migracao pode ter deixado no banco
cat > "$S/retrato.sql" <<'SQL'
\pset format unaligned
\pset tuples_only on
select 'FN ' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
       || E'\n' || pg_get_functiondef(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public','demandas') and p.prokind = 'f'
 order by 1;
select 'CK ' || c.conrelid::regclass || ' ' || c.conname || ' ' || pg_get_constraintdef(c.oid)
  from pg_constraint c join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
 where n.nspname in ('public','demandas') order by 1;
select 'IX ' || indexdef from pg_indexes
 where schemaname in ('public','demandas') order by 1;
select 'TG ' || tgname || ' ' || pg_get_triggerdef(t.oid)
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
 where not t.tgisinternal and n.nspname in ('public','demandas') order by 1;
select 'CM ' || coalesce(obj_description(p.oid, 'pg_proc'), '')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public','demandas') and obj_description(p.oid,'pg_proc') is not null
 order by 1;
select 'CO ' || table_schema || '.' || table_name || '.' || column_name || ' ' || data_type
       || ' ' || is_nullable || ' ' || coalesce(column_default,'-')
  from information_schema.columns where table_schema in ('demandas') order by 1;
SQL

monta () {                     # $1 = nome do banco, $2 = diretorio dos .sql
  su postgres -c "$PG/psql -h /tmp -p 5439 -U postgres -q -c 'drop database if exists $1;' -c 'create database $1;'" >/dev/null
  { cat "$S/prep.sql"; for f in $MIGS; do echo "-- == $f =="; cat "$2/$f.sql"; done; } > "$S/$1.sql"
  chmod 644 "$S/$1.sql"
  su postgres -c "$PG/psql -h /tmp -p 5439 -U postgres -d $1 -q -v ON_ERROR_STOP=1 -f $S/$1.sql" 2>&1 \
    | grep -E "^(ERROR|FATAL)" && { echo "  $1: FALHOU ao aplicar"; exit 1; } || true
  su postgres -c "$PG/psql -h /tmp -p 5439 -U postgres -d $1 -f $S/retrato.sql" > "$S/$1.retrato"
}

mkdir -p "$S/enxuto"
for f in $MIGS; do python3 "$B/scripts/enxugar-migracao.py" "$B/supabase/$f.sql" "$S/enxuto/$f.sql" 2>/dev/null; done
chmod -R 755 "$S/enxuto"

echo "montando o banco do ORIGINAL"; monta enx_orig "$B/supabase"
echo "montando o banco do ENXUTO";   monta enx_novo "$S/enxuto"

if diff -q "$S/enx_orig.retrato" "$S/enx_novo.retrato" >/dev/null; then
  echo
  echo "IGUAIS: $(wc -l < "$S/enx_orig.retrato") linhas de catalogo conferem byte a byte."
  echo "  funcoes ..... $(grep -c '^FN ' "$S/enx_orig.retrato")"
  echo "  constraints . $(grep -c '^CK ' "$S/enx_orig.retrato")"
  echo "  indices ..... $(grep -c '^IX ' "$S/enx_orig.retrato")"
  echo "  gatilhos .... $(grep -c '^TG ' "$S/enx_orig.retrato")"
  exit 0
fi
echo
echo "DIFEREM. O enxugador mudou o banco, e nao so o arquivo:"
diff "$S/enx_orig.retrato" "$S/enx_novo.retrato" | head -40
exit 1
