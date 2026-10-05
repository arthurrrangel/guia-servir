#!/usr/bin/env bash
# =============================================================================
# A LETRA EM PDF DE PONTA A PONTA — 111, 05/10/2026.
#
# O harness de tela (`letra-tela.test.mjs`) desenha com respostas inventadas:
# prova a tela, e nada sobre o armário. O que só um banco de verdade prova:
#
#   · a política do Storage da 111 deixa a liderança do Louvor gravar na
#     pasta do Louvor, e mais ninguém (Mídia, quem não entrou, caminho torto);
#   · o arquivo chega ao armário como PDF mesmo quando o celular não diz o
#     tipo (o Storage confere o tipo da parte do formulário, não a opção);
#   · `ordem_valida`, `salvar_ordem`, `musicas_do_ministerio` e `eu_ordens`
#     levam e trazem compasso, segundos e letra pelo PostgREST, com os grants
#     de produção;
#   · quem serve no culto toca em "Letra" e o PDF que baixa é o mesmo que
#     subiu, com o nome da música;
#   · o dirigente do culto é quem a escala do Louvor pôs no posto DIRIGENTE.
#
# O QUE RODA AQUI: Postgres 16 com o andar do Supabase e TODAS as migrações,
# o PostgREST de verdade (a mesma série 12 do Supabase) e, na frente dele,
# uma ponte pequena (dentro do .mjs) que fala o pedaço do Storage que o app
# usa: recebe o envio, grava a linha em `storage.objects` COM O PAPEL E O
# JWT DE QUEM ENVIOU (quem decide é a política da 111, como lá) e serve o
# download público com o cabeçalho que a API do Storage monta.
#
# Uso (com o app no ar em $BASE, padrão http://127.0.0.1:3500):
#   bash scripts/letra-e2e.sh
# =============================================================================
set -uo pipefail
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PORTA=${PORTA:-5443}
DIR=${DIR:-/tmp/pg-letra}
BANCO=letra
VERSAO=12.2.3
PGRST=${PGRST:-/tmp/postgrest-$VERSAO/postgrest}
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

[ -x "$PGBIN/initdb" ] || { echo "Sem Postgres 16 em $PGBIN."; exit 2; }
id postgres >/dev/null 2>&1 || useradd -m postgres >/dev/null 2>&1

echo "· Postgres do zero em $DIR (porta $PORTA, só 127.0.0.1)"
su postgres -c "$PGBIN/pg_ctl -D $DIR/data stop -m fast" >/dev/null 2>&1
rm -f /tmp/.s.PGSQL.$PORTA*
rm -rf "$DIR"; mkdir -p "$DIR"; chown -R postgres:postgres "$DIR"
su postgres -c "$PGBIN/initdb -D $DIR/data -U postgres --auth=trust" >/dev/null 2>&1 || { echo "initdb falhou"; exit 1; }
# o PostgREST entra por TCP; o resto, pelo socket
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
# sem a 111 não há o que provar: o app esconde compasso, segundos e letra
$P -d $BANCO -tAc "select 1 from schema_versao where n = 111" | grep -q 1 \
  || { echo "FALHOU — a 111 não está no banco"; exit 1; }

if [ ! -x "$PGRST" ]; then
  echo "· baixando o PostgREST $VERSAO"
  mkdir -p "$(dirname "$PGRST")"
  curl -fsSL "https://github.com/PostgREST/postgrest/releases/download/v$VERSAO/postgrest-v$VERSAO-linux-static-x64.tar.xz" \
    | tar -xJ -C "$(dirname "$PGRST")" || { echo "não consegui baixar o PostgREST"; exit 1; }
fi

echo "· a prova"
PORTA=$PORTA BANCO=$BANCO PGRST=$PGRST node "$RAIZ/scripts/letra-e2e.mjs"
r=$?
su postgres -c "$PGBIN/pg_ctl -D $DIR/data stop -m fast" >/dev/null 2>&1
exit $r
