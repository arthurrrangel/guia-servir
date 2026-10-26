#!/usr/bin/env bash
# =============================================================================
# O BOTÃO "MANDAR AGORA PELO ROBÔ" DE PONTA A PONTA — 115, 26/10/2026.
#
# O Arthur: "Gostaria de na aba do sistema ter a opção de disparar escala,
# através desse robo, vou deixar o macbook ligado" e "Para todos os
# ministérios".
#
# Os testes de unidade provam cada pedaço com mentiras. O que só a soma prova:
#   · a liderança do Louvor aperta o botão no celular, com o banco de verdade
#     (robo_pedir, robo_situacao, as permissões da 115 pelo PostgREST);
#   · o robô de verdade (robo-whatsapp/robo.mjs, o serviço, com um WhatsApp de
#     mentira) passa na rota de verdade (/api/robo/pedidos, o app compilado),
#     leva o pedido, lê a escala na outra rota (/api/robo/grupos) e posta nos
#     grupos do Louvor exatamente o texto das linhas do "Mandar nos grupos";
#   · a tela acompanha até "Mandado em N grupos", grupo por grupo;
#   · apertar de novo não repete nada; a Mídia fica no lugar dela;
#   · robô desligado: a tela diz, e o botão some.
#
# O QUE RODA AQUI: Postgres 16 com o andar do Supabase e TODAS as migrações,
# o PostgREST de verdade, uma ponte pequena que fala /rest/v1 e /auth/v1, o
# app compilado (next build + next start) e o robô copiado para uma pasta
# temporária com um whatsapp.mjs de mentira. Rode sem rede (o robô nunca
# alcança a produção): no container do Claude, dentro de `semrede.sh`.
#
# Uso: bash scripts/robo-pedidos-e2e.sh
# =============================================================================
set -uo pipefail
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PORTA=${PORTA:-5446}
DIR=${DIR:-/tmp/pg-robo-e2e}
BANCO=robo
PORTA_PONTE=${PORTA_PONTE:-54372}
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

[ -x "$PGBIN/initdb" ] || { echo "Sem Postgres 16 em $PGBIN."; exit 2; }
id postgres >/dev/null 2>&1 || useradd -m postgres >/dev/null 2>&1

echo "· Postgres do zero em $DIR (porta $PORTA, só 127.0.0.1)"
su postgres -c "$PGBIN/pg_ctl -D $DIR/data stop -m fast" >/dev/null 2>&1
rm -f /tmp/.s.PGSQL.$PORTA*
rm -rf "$DIR"; mkdir -p "$DIR"; chown -R postgres:postgres "$DIR"
su postgres -c "$PGBIN/initdb -D $DIR/data -U postgres --auth=trust" >/dev/null 2>&1 || { echo "initdb falhou"; exit 1; }
su postgres -c "$PGBIN/pg_ctl -D $DIR/data -l $DIR/log -o '-k /tmp -p $PORTA -c listen_addresses=127.0.0.1' start -w" >/dev/null 2>&1
P="psql -h /tmp -p $PORTA -U postgres -X"
$P -q -c "create database $BANCO;" >/dev/null 2>&1 || { echo "nao subiu; veja $DIR/log"; exit 1; }
$P -d $BANCO -q -v ON_ERROR_STOP=1 -f "$RAIZ/scripts/andar-do-supabase.sql" >/dev/null 2>&1 \
  || { echo "nao consegui montar o andar do Supabase"; exit 1; }

echo "· todas as migrações"
ok=0
for f in $(ls "$RAIZ"/supabase/*.sql | grep -E '/[0-9]{2,3}-' | grep -v '00-ESTADO' | sort -V); do
  if $P -d $BANCO -v ON_ERROR_STOP=1 -q -f "$f" > "$DIR/ultima.log" 2>&1; then ok=$((ok+1)); else
    echo "  ✗ $(basename "$f")"; grep -m2 ERROR "$DIR/ultima.log" | cut -c1-200; exit 1
  fi
done
echo "  → $ok aplicaram"
$P -d $BANCO -tAc "select 1 from schema_versao where n = 115" | grep -q 1 \
  || { echo "FALHOU — a 115 não está no banco"; exit 1; }

# o app compilado aponta para a ponte (NEXT_PUBLIC_* entra no build). Só
# recompila se o build que está aí não for este.
MARCA="ponte=http://127.0.0.1:$PORTA_PONTE"
if [ "$(cat "$RAIZ/.next/e2e-robo" 2>/dev/null)" != "$MARCA" ] || [ "${RECOMPILAR:-0}" = 1 ]; then
  echo "· compilando o app (next build), apontado para a ponte"
  ( cd "$RAIZ" && rm -rf .next && NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:$PORTA_PONTE" NEXT_PUBLIC_SUPABASE_ANON_KEY=chave-de-teste \
    ./node_modules/.bin/next build > "$DIR/build.log" 2>&1 ) || { tail -25 "$DIR/build.log"; exit 1; }
  echo "$MARCA" > "$RAIZ/.next/e2e-robo"
fi

echo "· a prova"
PORTA=$PORTA BANCO=$BANCO PORTA_PONTE=$PORTA_PONTE node "$RAIZ/scripts/robo-pedidos-e2e.mjs"
r=$?
su postgres -c "$PGBIN/pg_ctl -D $DIR/data stop -m fast" >/dev/null 2>&1
exit $r
