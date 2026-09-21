#!/usr/bin/env bash
# =============================================================================
# O BANCO PRECISA NASCER DO REPOSITÓRIO.
#
# 19/09/2026. Escrito depois de descobrir, medindo, que ele não nascia.
#
# Aplicando `supabase/*.sql` em ordem num Postgres 16 vazio, 42 das 52
# migrações falhavam. Trinta e cinco delas pela mesma linha — `relation
# "equipes" does not exist` — porque a migração que cria `equipes` nunca
# virou arquivo: foi aplicada direto no banco e o número 02 acabou usado por
# outro assunto. O cabeçalho da 01 chama esse arquivo pelo nome desde o
# primeiro dia ("01 → 02-multi-ministerio.sql → 03"); ele simplesmente não
# estava lá.
#
# O QUE ISSO CUSTAVA: sem rebuild não existe cópia de homologação, não existe
# ensaio de migração antes de aplicar no que está no ar, e não existe volta se
# o projeto do Supabase se perder. É o ponto único de falha mais caro do
# sistema, e ficava numa AUSÊNCIA — que é o tipo de defeito que nenhuma
# leitura de código encontra, só a tentativa de reconstruir.
#
# Este script é a tentativa, automatizada, para que a resposta deixe de
# depender de alguém lembrar de tentar.
#
# O QUE ELE EXIGE, em ordem:
#   1. as 52 migrações aplicam, em ordem, num banco vazio, sem um único erro;
#   2. `testar_permissoes()` passa 100% no banco que saiu daí;
#   3. `testar_identidade()` passa 100% também.
#
# O QUE ELE NÃO EXIGE, de propósito: que toda migração possa ser aplicada
# DUAS vezes. Reaplicar migração antiga sobre banco novo é errado e o Postgres
# está certo em recusar — `create or replace function` que muda tipo de
# retorno reverteria a função para a assinatura velha, e a 01 diz em letras
# garrafais para não ser rodada no banco que está no ar. Idempotência é
# exigida de quem a promete (política, GRANT, constraint), e essas foram
# corrigidas uma a uma.
#
#   bash scripts/banco-do-zero.sh
# =============================================================================
set -uo pipefail

PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PORTA=${PORTA:-5439}
DIR=${DIR:-/tmp/pg-do-zero}
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -x "$PGBIN/initdb" ]; then
  echo "Sem Postgres 16 em $PGBIN."
  echo "  Ubuntu/Debian:  apt-get install -y postgresql-16"
  echo "  Ou aponte:      PGBIN=/caminho/para/bin bash scripts/banco-do-zero.sh"
  exit 2
fi

id postgres >/dev/null 2>&1 || useradd -m postgres >/dev/null 2>&1

echo "· subindo um Postgres vazio em $DIR (porta $PORTA)"
"$PGBIN/pg_ctl" -D "$DIR/data" stop >/dev/null 2>&1
# SOCKET ÓRFÃO EM /tmp FAZ A SEGUNDA EXECUÇÃO FALHAR SEM DIZER POR QUÊ.
# `rm -rf` no diretório de dados não apaga `/tmp/.s.PGSQL.<porta>.lock`, e o
# Postgres seguinte recusa subir com "lock file already exists". A mensagem
# some no /dev/null do start e o script diz só "não subiu". Uma linha resolve.
rm -f /tmp/.s.PGSQL.$PORTA*
rm -rf "$DIR"; mkdir -p "$DIR"; chown -R postgres:postgres "$DIR"
su postgres -c "$PGBIN/initdb -D $DIR/data -U postgres --auth=trust" >/dev/null 2>&1 || { echo "initdb falhou"; exit 1; }
su postgres -c "$PGBIN/pg_ctl -D $DIR/data -l $DIR/log -o '-k /tmp -p $PORTA -c listen_addresses=' start" >/dev/null 2>&1
sleep 2

P="psql -h /tmp -p $PORTA -U postgres"
$P -q -c "create database guia;" >/dev/null 2>&1 || { echo "nao subiu; veja $DIR/log"; exit 1; }

# O ANDAR DO SUPABASE, que nenhuma migração cria (papéis, esquema `auth`,
# pgcrypto, GRANTs padrão). Mora em `scripts/andar-do-supabase.sql` para o
# `escala-banco.sh` usar o MESMO: era copiado, e copiar já custou 73 casos
# reprovando por `role "authenticated" does not exist` num roteiro que não
# tinha a cópia. O arquivo explica o resto.
$P -d guia -q -v ON_ERROR_STOP=1 -f "$RAIZ/scripts/andar-do-supabase.sql" >/dev/null 2>&1 \
  || { echo "nao consegui montar o andar do Supabase"; exit 1; }

# ---------------------------------------------------------------------------
# 1 · as migrações, em ordem
#
# `00-ESTADO-REAL-DO-BANCO.sql` fica de fora: é um retrato do banco, escrito
# para ser LIDO, não aplicado (ele começa referenciando uma tabela temporária
# que não existe mais). Se um dia existir `supabase/00-estado.sql` de um
# `pg_dump` de verdade, o caminho passa a ser aquele, e este vira o teste de
# que as migrações ainda contam a mesma história que o dump.
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# 0 · AS TRANCAS, ANTES DE APLICAR QUALQUER COISA
#
# Migração que pode desfazer outra precisa de `exige_versao_ate`. Isso era
# posto à mão e em 21/09 vinte e uma estavam sem — inclusive a 52, cuja
# reaplicação reabre o portão de aprovação que a 67 fechou (medido: as
# guardas de `aprovacao` em `dem_mover` caem de 32 para 25, e a conferência
# da 67 passa a reprovar 6 de 14 casos). O teste ao lado faz a pergunta que
# ninguém fazia. Ele é de LEITURA: não precisa de banco, e por isso roda
# antes de subir um.
# ---------------------------------------------------------------------------
if ! node "$RAIZ/scripts/trancas.test.mjs"; then
  echo "FALHOU — ha migracao sem tranca que pode desfazer outra (veja acima)."
  su postgres -c "$PGBIN/pg_ctl -D $DIR/data stop" >/dev/null 2>&1
  exit 1
fi

echo "· aplicando as migrações num banco vazio"
ok=0; falhou=0; quebradas=""
for f in $(ls "$RAIZ"/supabase/*.sql | grep -E '/[0-9]{2}-' | grep -v '00-ESTADO' | sort); do
  if $P -d guia -v ON_ERROR_STOP=1 -q -f "$f" > "$DIR/ultima.log" 2>&1; then
    ok=$((ok+1))
  else
    falhou=$((falhou+1)); quebradas="$quebradas $(basename "$f")"
    echo "  ✗ $(basename "$f")"
    grep -m2 "ERROR" "$DIR/ultima.log" | sed 's/^/      /' | cut -c1-160
  fi
done
echo "  → $ok aplicaram, $falhou falharam"

# ---------------------------------------------------------------------------
# 2 e 3 · os testes que o próprio sistema escreveu para si
# ---------------------------------------------------------------------------
reprova=0
# O PISO DE CASOS, QUE E UMA CATRACA — 21/09/2026, migracao 72.
#
# A checagem abaixo compara `total` com `passou`, e o unico piso dela e
# `!= 0`. Isso deixa passar o modo de falha mais silencioso que estas duas
# funcoes tem: um caso que para de ser EMITIDO. Foi o que se mediu na 72 —
# dois blocos de `testar_identidade` so emitiam linha se o banco tivesse um
# voluntario com token, e num banco sem isso o script imprimia "4/4" e dizia
# OK, sem ter testado identidade nenhuma.
#
# `testar_identidade` passou a conferir a propria contagem por dentro (ultimo
# caso). `testar_permissoes` nao confere, e o piso aqui cobre as duas.
#
# O numero e escrito a mao de proposito e so anda para CIMA: e o que a funcao
# tinha no dia em que este piso foi posto. Caso novo nao mexe nele; caso que
# some, derruba. Se um dia um caso for removido por bom motivo, baixar o piso
# e uma decisao consciente, escrita no commit — que e exatamente o que se
# quer que aconteca.
declare -A PISO=( [testar_permissoes]=68 [testar_identidade]=27 [testar_porta_publica]=6 )
for fn in testar_permissoes testar_identidade testar_porta_publica; do
  if ! $P -d guia -tAc "select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                         where n.nspname='public' and p.proname='$fn'" | grep -q 1; then
    echo "  ✗ $fn() não existe no banco reconstruído"; reprova=$((reprova+1)); continue
  fi
  total=$($P -d guia -tAc "select count(*) from $fn();")
  passou=$($P -d guia -tAc "select count(*) from $fn() where passou;")
  piso=${PISO[$fn]}
  if [ "$total" -lt "$piso" ]; then
    echo "  ✗ $fn(): $passou/$total — emitiu MENOS casos que o piso ($piso). Algum caso parou de sair."
    reprova=$((reprova+1))
  elif [ "$total" = "$passou" ] && [ "$total" != "0" ]; then
    echo "  ✓ $fn(): $passou/$total"
  else
    echo "  ✗ $fn(): $passou/$total"
    $P -d guia -c "select caso, esperado, obtido from $fn() where not passou;" | sed 's/^/      /'
    reprova=$((reprova+1))
  fi
done

su postgres -c "$PGBIN/pg_ctl -D $DIR/data stop" >/dev/null 2>&1

echo
if [ "$falhou" -eq 0 ] && [ "$reprova" -eq 0 ]; then
  echo "OK — o banco nasce do repositório: $ok/$ok migrações, e os testes de permissão passam."
  exit 0
fi
[ "$falhou" -gt 0 ] && echo "FALHOU — não reconstrói:$quebradas"
[ "$reprova" -gt 0 ] && echo "FALHOU — reconstruiu, mas os testes de permissão reprovaram."
exit 1
