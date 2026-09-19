#!/usr/bin/env bash
# =============================================================================
# REAPLICAR UMA MIGRAÇÃO PRECISA SER OU SEGURO, OU RECUSADO. NUNCA SILENCIOSO.
#
# ESTE ARQUIVO FOI REESCRITO EM 19/09/2026, e vale explicar do quê, porque a
# versão anterior parou de fazer sentido por dois motivos ao mesmo tempo.
#
# 1. ELE SE RECUSAVA A RODAR SEM `supabase/00-estado.sql`, e o texto da recusa
#    dizia: "sem ele, 13 dos 51 arquivos aplicam num banco vazio. A causa é a
#    tabela 'equipes', criada por nenhum (o '02-multi-ministerio.sql' que o 01
#    cita não existe aqui)."
#
#    Isso era verdade e deixou de ser: a `02` foi escrita, e
#    `scripts/banco-do-zero.sh` prova, a cada execução, que os 56 arquivos
#    aplicam num Postgres vazio. A pergunta "o repositório reconstrói o banco?"
#    tem dono, e o dono é aquele arquivo. Manter aqui um portão que responde
#    "não sei" a uma pergunta já respondida é pior que não ter o portão: ele
#    faz `npm run test:banco` parar no meio, dando a impressão de que o banco
#    está quebrado quando ele está de pé.
#
# 2. O PASSO "PROVE IDEMPOTÊNCIA" REAPLICAVA TODAS AS MIGRAÇÕES, e desde a 56
#    isso é exatamente o que o sistema DEVE recusar.
#
#    A 55 escreveu `exige_versao_ate()` e a 56 a instalou em 21 arquivos: os
#    que definem uma função que um arquivo mais novo redefine. Reaplicar a 23
#    num banco na versão 56 desfazia, em silêncio, a correção de segurança da
#    51 — medido. Agora ela aborta. Um teste que exigisse o contrário estaria
#    cobrando o defeito.
#
# O QUE ESTE ARQUIVO PASSA A EXIGIR, que é o que ainda não tinha dono:
#
#   A. os arquivos COM tranca REALMENTE recusam, com a mensagem certa. Tranca
#      escrita e não instalada foi o buraco da 55; tranca instalada e que não
#      dispara seria o mesmo buraco com mais linhas. E a recusa acontece na
#      PRIMEIRA linha do arquivo, então nada dele chega a rodar — é por isso
#      que este passo pode rodar contra o banco de verdade sem sujá-lo.
#
#   B. depois disso, o banco continua íntegro: `testar_permissoes()`,
#      `testar_identidade()` e `schema_versao_conferir()` passam.
#
# E O PASSO QUE EU ESCREVI, RODEI E APAGUEI — vale mais que os dois acima:
#
#   Entre A e B havia um passo que reaplicava todo arquivo SEM tranca,
#   exigindo que fosse idempotente. A ideia parecia boa e o resultado provou o
#   contrário: 39 reprovações, e nenhuma delas era defeito.
#
#       48-quem-pode-entrar-onde   duplicate key em ux_funcoes_equipe_nome
#       53-postos-que-nunca-apar.  o CHECK que ela cria é violado por linha
#                                  que ela mesma acabou de corrigir
#
#   São arquivos de DADOS: eles semeiam postos e consertam linhas. Rodar duas
#   vezes semeia duas vezes, e o Postgres está certo em recusar. O cabeçalho
#   do `banco-do-zero.sh` já dizia isso em letras claras — "o que ele NÃO
#   exige, de propósito: que toda migração possa ser aplicada DUAS vezes" — e
#   eu escrevi um teste que cobrava exatamente o que o projeto tinha decidido
#   não prometer.
#
#   Pior: o passo SUJAVA o banco. Depois dele, os passos seguintes reprovavam
#   por causa do estrago, e não do que estavam medindo. Um teste que estraga o
#   ambiente que ele mede não mede nada.
#
# Uso:  bash scripts/escala-banco.sh
# =============================================================================
set -u
PG=${PGBIN:-/usr/lib/postgresql/16/bin}
D=/tmp/pgesc
PORTA=${PORTA_ESC:-5441}
BANCO=escteste
B="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -x "$PG/initdb" ]; then
  echo "Sem Postgres 16 em $PG. Aponte com PGBIN=/caminho/para/bin"
  exit 2
fi
id postgres >/dev/null 2>&1 || useradd -m postgres >/dev/null 2>&1

echo "1. um Postgres vazio"
su postgres -c "$PG/pg_ctl -D $D stop" >/dev/null 2>&1
# SOCKET ÓRFÃO EM /tmp FAZ A SEGUNDA EXECUÇÃO FALHAR SEM DIZER POR QUÊ.
# `rm -rf` no diretório de dados não apaga `/tmp/.s.PGSQL.<porta>.lock`, e o
# Postgres seguinte recusa subir com "lock file already exists". A mensagem
# some no /dev/null do start e o script diz só "não subiu". Uma linha resolve.
rm -f /tmp/.s.PGSQL.$PORTA*
rm -rf $D; mkdir -p $D; chown -R postgres:postgres $D
su postgres -c "$PG/initdb -D $D -A trust -U postgres" >/dev/null 2>&1 || { echo "   initdb falhou"; exit 1; }
su postgres -c "$PG/pg_ctl -D $D -l $D/log -o '-k /tmp -p $PORTA -c listen_addresses=' start" >/dev/null 2>&1
sleep 2
P="su postgres -c \"$PG/psql -h /tmp -p $PORTA -U postgres\""
su postgres -c "$PG/psql -h /tmp -p $PORTA -U postgres -d postgres -qc 'create database $BANCO'" >/dev/null 2>&1 \
  || { echo "   o Postgres não subiu; veja $D/log"; exit 1; }

roda() {  # roda <arquivo> ; devolve 0 se aplicou
  cp "$1" /tmp/_m.sql; chmod 644 /tmp/_m.sql
  su postgres -c "$PG/psql -h /tmp -p $PORTA -U postgres -d $BANCO -q -v ON_ERROR_STOP=1 -f /tmp/_m.sql" > /tmp/_m.log 2>&1
}
pergunta() { su postgres -c "$PG/psql -h /tmp -p $PORTA -U postgres -d $BANCO -tAc \"$1\"" 2>/dev/null; }

# o andar do Supabase (papéis, `auth`, pgcrypto, GRANTs padrão) é o MESMO
# arquivo que o `banco-do-zero.sh` usa. Sem ele, toda migração que fala de RLS
# falha com `role "authenticated" does not exist`.
cp "$B/scripts/andar-do-supabase.sql" /tmp/_andar.sql; chmod 644 /tmp/_andar.sql
su postgres -c "$PG/psql -h /tmp -p $PORTA -U postgres -d $BANCO -q -v ON_ERROR_STOP=1 -f /tmp/_andar.sql" >/dev/null 2>&1 \
  || { echo "   não consegui montar o andar do Supabase"; exit 1; }

echo "2. as migrações, em ordem, num banco vazio"
falhas=0
ARQS=$(ls "$B"/supabase/[0-9][0-9]-*.sql | grep -v '00-ESTADO' | sort)
for f in $ARQS; do
  if ! roda "$f"; then
    echo "   FALHOU  $(basename "$f")"
    grep -m1 "ERROR" /tmp/_m.log | sed 's/^/     /'
    falhas=$((falhas+1))
  fi
done
[ "$falhas" = "0" ] && echo "   ok: todas aplicaram"

echo
echo "3. A · os arquivos COM tranca RECUSAM, e recusam pelo motivo certo"
# O MAIS NOVO FICA DE FORA, e isso não é exceção de conveniência.
#
# `exige_versao_ate(n)` aborta quando o banco passou de n. O arquivo mais novo
# carrega o PRÓPRIO número, então ele aceita rodar num banco que está nele —
# e tem que aceitar: se a conferência dele reprovar, a régua já registrou a
# versão, e o operador precisa poder corrigir e rodar de novo. Deploy
# interrompido que não pode ser retomado é pior que deploy que falha.
#
# O passo 3b abaixo cobra exatamente essa propriedade, em vez de deixá-la como
# buraco na cobertura.
NOVO=$(echo "$ARQS" | tail -1)
com=0; com_ruim=0
for f in $ARQS; do
  [ "$f" = "$NOVO" ] && continue
  grep -q 'exige_versao_ate' "$f" || continue
  com=$((com+1))
  if roda "$f"; then
    echo "   PASSOU (e não devia)  $(basename "$f")"
    echo "     este arquivo pode gravar uma versão antiga por cima de uma nova"
    com_ruim=$((com_ruim+1))
  elif ! grep -q "MIGRACAO SUPERADA" /tmp/_m.log; then
    echo "   RECUSOU PELO MOTIVO ERRADO  $(basename "$f")"
    grep -m1 "ERROR" /tmp/_m.log | sed 's/^/     /'
    com_ruim=$((com_ruim+1))
  fi
done
if [ "$com_ruim" = "0" ]; then echo "   ok: $com arquivo(s) com tranca recusaram com MIGRACAO SUPERADA"; else falhas=$((falhas+com_ruim)); fi

echo
echo "3b. e o arquivo MAIS NOVO reaplica, para deploy interrompido ser retomável"
if roda "$NOVO"; then
  echo "   ok: $(basename "$NOVO") rodou de novo sem erro"
else
  echo "   FALHOU  $(basename "$NOVO") não pode ser reaplicado"
  grep -m1 "ERROR" /tmp/_m.log | sed 's/^/     /'
  echo "     um deploy que morre no meio deste arquivo fica sem saída:"
  echo "     a régua já registrou a versão e o arquivo se recusa a continuar."
  falhas=$((falhas+1))
fi

echo
echo "4. B · e o banco continua íntegro depois de tudo isso"
for fn in testar_permissoes testar_identidade schema_versao_conferir; do
  total=$(pergunta "select count(*) from $fn();")
  passou=$(pergunta "select count(*) from $fn() where passou;")
  if [ "$total" = "$passou" ] && [ "$total" != "0" ] && [ -n "$total" ]; then
    echo "   ✓ $fn(): $passou/$total"
  else
    echo "   ✗ $fn(): $passou/$total"
    su postgres -c "$PG/psql -h /tmp -p $PORTA -U postgres -d $BANCO -c 'select caso, esperado, obtido from $fn() where not passou;'" | sed 's/^/      /'
    falhas=$((falhas+1))
  fi
done

su postgres -c "$PG/pg_ctl -D $D stop" >/dev/null 2>&1

echo
if [ "$falhas" = "0" ]; then
  echo "OK — reaplicar é seguro onde deve ser, e recusado onde tem que ser."
  exit 0
fi
echo "FALHOU — $falhas problema(s)."
exit 1
