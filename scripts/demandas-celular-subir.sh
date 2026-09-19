#!/bin/bash
# SOBE O SISTEMA DE DEMANDAS INTEIRO AQUI, PARA OLHAR AS TELAS DE VERDADE.
#
# Postgres 16 + migração 50 + dados desconfortáveis + a ponte que fala o
# protocolo do Supabase + o app compilado. Sem isso, auditar as telas de
# demandas é impossível enquanto a produção não tiver o esquema.
#
# O BANCO AQUI SE CHAMA `demcel`, NÃO `dem`, E ISSO É DE PROPÓSITO:
# `scripts/demandas-banco.sh` derruba e recria o `dem` toda vez que roda. Na
# primeira versão os dois dividiam o mesmo banco, a suíte passou por cima da
# semente no meio da auditoria, os tokens sumiram, e a auditoria seguiu
# medindo a tela de login achando que era o sistema — e deu tudo verde.
#
# Uso:  bash scripts/demandas-celular-subir.sh
# Depois: node scripts/demandas-celular.mjs
set -e
PG=/usr/lib/postgresql/16/bin
D=/tmp/pgdem
BANCO=demcel
PORTA_PONTE=54321
PORTA_APP=3400
B="$(cd "$(dirname "$0")/.." && pwd)"

echo "1. Postgres"
if ! su postgres -c "$PG/pg_ctl -D $D status" >/dev/null 2>&1; then
  rm -rf $D; mkdir -p $D; chown postgres:postgres $D
  su postgres -c "$PG/initdb -D $D -A trust -U postgres" >/dev/null 2>&1
  printf "listen_addresses=''\nunix_socket_directories='/tmp'\n" >> $D/postgresql.conf
  chown -R postgres:postgres $D
  su postgres -c "$PG/pg_ctl -D $D -l /tmp/pgdem.log start -w" >/dev/null 2>&1
fi

echo "2. banco $BANCO, migração e semente"
su postgres -c "$PG/psql -h /tmp -U postgres -q -c 'drop database if exists $BANCO;' -c 'create database $BANCO;'" >/dev/null 2>&1
cat > /tmp/_prep.sql <<'SQL'
create extension if not exists pgcrypto;
do $$ begin create role anon;          exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('teste.jwt', true), '')::jsonb, '{}'::jsonb);
$$;
SQL
cp "$B/supabase/50-demandas.sql" /tmp/_mig.sql
cp "$B/scripts/demandas-celular-semear.sql" /tmp/_seed.sql
chmod 644 /tmp/_prep.sql /tmp/_mig.sql /tmp/_seed.sql
su postgres -c "$PG/psql -h /tmp -U postgres -d $BANCO -q -f /tmp/_prep.sql"
su postgres -c "$PG/psql -h /tmp -U postgres -d $BANCO -q -v ON_ERROR_STOP=1 -f /tmp/_mig.sql" >/dev/null
su postgres -c "$PG/psql -h /tmp -U postgres -d $BANCO -q -v ON_ERROR_STOP=1 -f /tmp/_seed.sql" 2>&1 | grep -E "^ERROR" || true

echo "3. ponte na $PORTA_PONTE"
ps -eo pid,cmd | grep -E 'ponte-teste|ponte\.mjs' | grep -v grep | awk '{print $1}' | while read p; do kill -9 "$p" 2>/dev/null; done
sleep 1
(PORTA=$PORTA_PONTE BANCO=$BANCO setsid nohup node "$B/scripts/ponte-teste.mjs" > /tmp/ponte.log 2>&1 &)
sleep 2

echo "4. app na $PORTA_APP"
ps -eo pid,cmd | grep -E 'next-server|next start' | grep -v grep | awk '{print $1}' | while read p; do kill -9 "$p" 2>/dev/null; done
sleep 1
cd "$B"
rm -rf .next
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:$PORTA_PONTE \
NEXT_PUBLIC_SUPABASE_ANON_KEY=chave-de-teste \
  npx next build >/tmp/build.log 2>&1 || { tail -20 /tmp/build.log; exit 1; }
(NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:$PORTA_PONTE \
 NEXT_PUBLIC_SUPABASE_ANON_KEY=chave-de-teste \
 setsid nohup npx next start -p $PORTA_APP > /tmp/next.log 2>&1 &)

echo "5. conferindo"
for i in $(seq 1 40); do
  [ "$(curl -s --noproxy '*' -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORTA_APP/demandas 2>/dev/null)" = "200" ] && break
  sleep 1
done
quem=$(curl -s --noproxy '*' -X POST http://127.0.0.1:$PORTA_PONTE/rest/v1/rpc/dem_quem_sou \
  -H 'content-type: application/json' -d '{"p_token":"tok-admin"}')
echo "   quem_sou: $(echo "$quem" | head -c 90)"
case "$quem" in *'"ok": true'*) echo "   pronto: node scripts/demandas-celular.mjs" ;;
  *) echo "   FALHOU: o token não foi reconhecido"; exit 1 ;; esac
