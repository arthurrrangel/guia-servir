#!/usr/bin/env bash
# =============================================================================
# O DRESS CODE DO LOUVOR DE PONTA A PONTA — 116, 26/10/2026.
#
# O pedido: o líder do Louvor define, em cada culto, as cores, o estilo, as
# orientações e as imagens de inspiração; quem serve vê na própria página; a
# mensagem do grupo leva as cores e o link das imagens. Os testes de unidade
# provam cada pedaço com mentiras. O que só a soma prova:
#
#   · a liderança do Louvor, no celular, escolhe as cores (da paleta e uma
#     personalizada), duas combinações, o estilo e as orientações, envia
#     fotos (que ficam leves ANTES de subir: WebP, até 1600 px, a orientação
#     da câmera aplicada), gera uma imagem por IA (a rota de verdade, com um
#     gerador de mentira), troca e tira imagens, e salva: o armário recebe só
#     o que ficou, na pasta do Louvor, com o JWT dela; o banco guarda o dress
#     code no formato da 116;
#   · a mensagem do grupo leva o bloco DRESS CODE com o link /dress/<id>;
#   · quem está escalado vê o dress code no próprio link (e quem não está,
#     não), abre as imagens inteiras; o link do grupo abre sem login, com o
#     título certo na prévia, e não se indexa;
#   · repetir o de um culto anterior, duas pessoas salvando ao mesmo tempo
#     (MUDOU) e tirar o dress code;
#   · quem não deve não grava: a Mídia, quem não entrou, arquivo torto, o
#     limite da IA; e a Mídia continua sem dress code nenhum.
#
# O QUE RODA AQUI: Postgres 16 com o andar do Supabase e TODAS as migrações,
# o PostgREST de verdade, uma ponte que fala /rest/v1, /auth/v1 e o pedaço
# do Storage que o app usa (o envio grava a linha em storage.objects com o
# papel e o JWT de quem enviou: quem decide é a política da 116), e o app
# compilado (next build + next start). Rode sem rede: no container do
# Claude, dentro de `semrede.sh`.
#
# Uso: bash scripts/dress-code-e2e.sh
# =============================================================================
set -uo pipefail
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PORTA=${PORTA:-5447}
DIR=${DIR:-/tmp/pg-dress-e2e}
BANCO=dress
PORTA_PONTE=${PORTA_PONTE:-54382}
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
$P -d $BANCO -tAc "select 1 from schema_versao where n = 116" | grep -q 1 \
  || { echo "FALHOU — a 116 não está no banco"; exit 1; }

# o app compilado aponta para a ponte (NEXT_PUBLIC_* entra no build). Só
# recompila se o build que está aí não for este.
MARCA="ponte=http://127.0.0.1:$PORTA_PONTE"
if [ "$(cat "$RAIZ/.next/e2e-dress" 2>/dev/null)" != "$MARCA" ] || [ "${RECOMPILAR:-0}" = 1 ]; then
  echo "· compilando o app (next build), apontado para a ponte"
  ( cd "$RAIZ" && rm -rf .next && NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:$PORTA_PONTE" NEXT_PUBLIC_SUPABASE_ANON_KEY=chave-de-teste \
    ./node_modules/.bin/next build > "$DIR/build.log" 2>&1 ) || { tail -25 "$DIR/build.log"; exit 1; }
  echo "$MARCA" > "$RAIZ/.next/e2e-dress"
fi

echo "· a prova"
PORTA=$PORTA BANCO=$BANCO PORTA_PONTE=$PORTA_PONTE node "$RAIZ/scripts/dress-code-e2e.mjs"
r=$?
su postgres -c "$PGBIN/pg_ctl -D $DIR/data stop -m fast" >/dev/null 2>&1
exit $r
