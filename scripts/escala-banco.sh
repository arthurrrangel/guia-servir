#!/bin/bash
# O BANCO DAS ESCALAS, RECONSTRUÍDO AQUI E CONFERIDO — QUANDO O RETRATO EXISTIR.
#
# POR QUE ESTE ARQUIVO EXISTE, E POR QUE ELE AINDA NÃO RODA
#
# O sistema de demandas tem `scripts/demandas-banco.sh`: sobe um Postgres
# descartável, aplica `50-demandas.sql` DUAS vezes para provar idempotência e
# roda 59 asserções de permissão. É a melhor coisa deste repositório.
#
# O sistema de escalas — o que a igreja usa no domingo — não tem nada disso.
# E não tem por um motivo que eu medi em 19/09/2026:
#
#     De 51 arquivos em `supabase/`, apenas 13 aplicam num banco vazio.
#
# A causa é uma só, e é pequena: a tabela `equipes` é ALTERADA por 14 arquivos
# e REFERENCIADA por 42, e não é CRIADA por nenhum. O próprio
# `01-schema-inicial.sql:10` diz que a ordem certa é
# `01` → `02-multi-ministerio.sql` → `03`, e o `02-multi-ministerio.sql` NÃO
# ESTÁ NO REPOSITÓRIO. O `32-integridade-e-identidade.sql:200` já registrava a
# suspeita: "a migração que criou `equipes` não está no repositório, então a
# unique pode ou não existir".
#
# `00-ESTADO-REAL-DO-BANCO.sql` tem nome de fonte da verdade e não é: ele é um
# retrato em COMENTÁRIO (92 linhas de `-- tabela.coluna tipo`), sem um único
# `create table`, e parou por volta da migração 21 — não tem `pessoas`, não tem
# `candidaturas`, não tem `papeis`.
#
# O QUE ISSO SIGNIFICA NA PRÁTICA
#
# Hoje, nada: o banco está de pé no Supabase. Significa no dia em que for
# preciso restaurar de um backup lógico, subir um ambiente para testar uma
# migração antes de aplicar, ou simplesmente provar o que está em produção sem
# abrir o painel. Nesse dia, o repositório não reconstrói o produto.
#
# O QUE FALTA, E É UM COMANDO SÓ
#
# No Supabase, em Database → Backups, ou pelo terminal com a string de conexão
# do projeto:
#
#     pg_dump --schema-only --no-owner --no-privileges \
#             --schema=public "$CONEXAO" > supabase/00-estado.sql
#
# (com `--schema=public --schema=demandas` se quiser os dois de uma vez.)
#
# Grave o resultado como `supabase/00-estado.sql` e rode este script. Ele passa
# a funcionar sozinho e o sistema que importa ganha a mesma rede que o outro já
# tem. Daí em diante, regerar o retrato a cada lote de migrações é o hábito que
# impede a defasagem de voltar.
#
# Uso:  bash scripts/escala-banco.sh
set -u
PG=/usr/lib/postgresql/16/bin
D=/tmp/pgesc
BANCO=escteste
B="$(cd "$(dirname "$0")/.." && pwd)"
RETRATO="$B/supabase/00-estado.sql"

if [ ! -f "$RETRATO" ]; then
  echo "PAREI: não achei $RETRATO"
  echo
  echo "  Sem o retrato do esquema, reconstruir aqui é adivinhação — e um teste"
  echo "  que roda contra um esquema adivinhado dá verde sobre ficção, que é"
  echo "  pior que não ter teste."
  echo
  echo "  Gere com:"
  echo "    pg_dump --schema-only --no-owner --no-privileges \\"
  echo "            --schema=public \"\$CONEXAO\" > supabase/00-estado.sql"
  echo
  echo "  Medido em 19/09/2026: sem ele, 13 dos 51 arquivos aplicam num banco"
  echo "  vazio. A causa é a tabela 'equipes', alterada por 14 arquivos e criada"
  echo "  por nenhum (o '02-multi-ministerio.sql' que o 01 cita não existe aqui)."
  exit 2
fi

echo "1. Postgres"
if ! su postgres -c "$PG/pg_ctl -D $D status" >/dev/null 2>&1; then
  rm -rf $D; mkdir -p $D; chown postgres:postgres $D
  su postgres -c "$PG/initdb -D $D -A trust -U postgres" >/dev/null 2>&1
  printf "listen_addresses=''\nunix_socket_directories='/tmp'\n" >> $D/postgresql.conf
  chown -R postgres:postgres $D
  su postgres -c "$PG/pg_ctl -D $D -l /tmp/pgesc.log start -w" >/dev/null 2>&1
fi

echo "2. banco $BANCO e os dublês do Supabase"
su postgres -c "$PG/psql -h /tmp -U postgres -q -c 'drop database if exists $BANCO;' -c 'create database $BANCO;'" >/dev/null 2>&1
cat > /tmp/_prep_esc.sql <<'SQL'
create extension if not exists pgcrypto;
do $$ begin create role anon;          exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role;  exception when duplicate_object then null; end $$;
create schema if not exists auth;
/* o dublê de auth.jwt(): quem testa escolhe quem está falando */
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('teste.jwt', true), '')::jsonb, '{}'::jsonb);
$$;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
SQL
chmod 644 /tmp/_prep_esc.sql
su postgres -c "$PG/psql -h /tmp -U postgres -d $BANCO -q -f /tmp/_prep_esc.sql" 2>&1 | grep -E "^ERROR" || true

echo "3. o retrato"
cp "$RETRATO" /tmp/_retrato.sql; chmod 644 /tmp/_retrato.sql
if ! su postgres -c "$PG/psql -h /tmp -U postgres -d $BANCO -q -v ON_ERROR_STOP=1 -f /tmp/_retrato.sql" > /tmp/_retrato.log 2>&1; then
  echo "   FALHOU ao aplicar o retrato:"; grep -m3 "ERROR" /tmp/_retrato.log | sed 's/^/     /'
  exit 1
fi

echo "4. as migrações posteriores ao retrato, em ordem"
# quais já estão dentro do retrato? o retrato é de um momento; as migrações
# daquele momento para cá precisam ser aplicadas por cima. Como toda migração
# deste repositório é escrita para ser idempotente (if not exists, or replace,
# on conflict), aplicar todas por cima é seguro e é o teste mais forte:
# se alguma não for idempotente, ela falha aqui e não em produção.
falhas=0
for f in $(ls "$B"/supabase/[0-9][0-9]-*.sql | sort); do
  base=$(basename "$f")
  case "$base" in 00-*) continue ;; esac
  cp "$f" /tmp/_m.sql; chmod 644 /tmp/_m.sql
  if ! su postgres -c "$PG/psql -h /tmp -U postgres -d $BANCO -q -v ON_ERROR_STOP=1 -f /tmp/_m.sql" > /tmp/_m.log 2>&1; then
    echo "   FALHOU  $base"
    grep -m1 "ERROR" /tmp/_m.log | sed 's/^/     /'
    falhas=$((falhas+1))
  fi
done

echo "5. de novo, para provar idempotência"
# Esta passada é o que separa "aplicou" de "pode aplicar outra vez". Foi o que
# pegou defeito no sistema de demandas antes de ele ir para produção.
for f in $(ls "$B"/supabase/[0-9][0-9]-*.sql | sort); do
  base=$(basename "$f")
  case "$base" in 00-*) continue ;; esac
  cp "$f" /tmp/_m.sql; chmod 644 /tmp/_m.sql
  if ! su postgres -c "$PG/psql -h /tmp -U postgres -d $BANCO -q -v ON_ERROR_STOP=1 -f /tmp/_m.sql" > /tmp/_m.log 2>&1; then
    echo "   NÃO É IDEMPOTENTE  $base"
    grep -m1 "ERROR" /tmp/_m.log | sed 's/^/     /'
    falhas=$((falhas+1))
  fi
done

echo "6. a matriz de permissão"
cat > /tmp/_perm.sql <<'SQL'
\pset pager off
select * from testar_permissoes();
SQL
chmod 644 /tmp/_perm.sql
su postgres -c "$PG/psql -h /tmp -U postgres -d $BANCO -f /tmp/_perm.sql" > /tmp/_perm.log 2>&1 || true
ruins=$(grep -ciE "FALHOU|ERRADO|VAZANDO" /tmp/_perm.log || true)
linhas=$(grep -cE "^ " /tmp/_perm.log || true)
echo "   $linhas linha(s) na matriz, $ruins com problema"
[ "$ruins" != "0" ] && { grep -iE "FALHOU|ERRADO|VAZANDO" /tmp/_perm.log | head -8 | sed 's/^/     /'; falhas=$((falhas+ruins)); }

echo "7. a matriz de identidade"
cat > /tmp/_ident.sql <<'SQL'
\pset pager off
select * from testar_identidade();
SQL
chmod 644 /tmp/_ident.sql
if su postgres -c "$PG/psql -h /tmp -U postgres -d $BANCO -f /tmp/_ident.sql" > /tmp/_ident.log 2>&1; then
  ruins2=$(grep -ciE "FALHOU|ERRADO" /tmp/_ident.log || true)
  echo "   $ruins2 com problema"
  [ "$ruins2" != "0" ] && { grep -iE "FALHOU|ERRADO" /tmp/_ident.log | head -8 | sed 's/^/     /'; falhas=$((falhas+ruins2)); }
else
  echo "   (testar_identidade não existe neste esquema)"
fi

echo
if [ "$falhas" = "0" ]; then
  echo "escala-banco: tudo verde. O repositório reconstrói o banco."
else
  echo "escala-banco: $falhas problema(s). Nada disso apareceria em produção antes de doer."
fi
exit $([ "$falhas" = "0" ] && echo 0 || echo 1)
