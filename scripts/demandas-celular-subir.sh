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
do $$ begin create role anon;          exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('teste.jwt', true), '')::jsonb, '{}'::jsonb);
$$;
SQL
# 19/09/2026: a 52 redefine dem_abrir e dem_mover. Subir so a 50 punha no ar
# a versao antiga, e o teste media um sistema que nao e o que esta publicado.
# A 57 entra aqui desde 19/09/2026. Sem ela, este roteiro monta a base com a
# `dem_lista` ANTIGA e as 252 conferencias de tela ficam verdes medindo a
# versao errada — que e exatamente por que o teto foi tirado da 56 e posto
# num arquivo so de Demandas. Um arquivo, um sistema.
# AS MIGRACOES DO SISTEMA DE DEMANDAS, EM ORDEM.
#
# Esta lista era 50/52/57/58 e ficou assim por semanas enquanto o banco andava
# ate a 87. O medidor de celular estava entao medindo uma versao do sistema
# que nao existe em lugar nenhum: nem aqui, nem em producao. Um instrumento
# apontado para o passado nao mede nada — pior, da confianca.
#
# As que nao sao do Demandas ficam de fora de proposito (esta base e isolada,
# sem public.voluntarios), e as do Demandas trazem sozinhas a guarda de
# "pulei o que depende das escalas".
# A 68 e a 80 NAO entram: as duas mexem em `dem_mover` e `dem_lista`, e a 84, a
# 85 e a 87 reescrevem as duas por inteiro. A 80 ainda mexe em
# `public.pessoas`, que esta base nao tem de proposito. Listar migracao
# superada aqui so faria o arquivo morrer no meio.
#
# A 67 ENTRA, e o motivo e o mesmo que trouxe ela de volta para
# `scripts/demandas-banco.sh` em 22/09/2026: o § 2 dela reescreve `dem_bases`,
# e nenhuma migracao posterior reescreve essa funcao por inteiro (a 92 so a
# remenda por dentro). Sem a 67, esta base sobe com um `dem_bases` que entrega
# nome, papel, setor e TELEFONE de todo mundo a qualquer responsavel — coisa
# que producao nao faz desde 21/09, e que `lib/demandas/tipos.ts` ja nem
# declara.
#
# E A LISTA ESTAVA DUAS MIGRACOES ATRAS — 22/09/2026.
#
# Ela parava na 90, e o cabecalho logo acima conta que isso ja aconteceu uma
# vez ("um instrumento apontado para o passado nao mede nada — pior, da
# confianca"). Aconteceu de novo. Medido numa base montada com esta lista:
#
#   validada_em existe? .......... NAO
#   teto_sem_aprovacao existe? ... NAO
#   eventos_total em dem_ver? .... NAO
#   dem_mover(..., 'validar') .... {"ok": false, "erro": "JA_FECHADA"}
#
# Ou seja: `npm run test:demandas` media um sistema SEM a etapa 5 do PDF. O
# botao "Resolveu, obrigado" do cartao verde, a frase "Validada por X", o teto
# por setor da aba Setores e o aviso de historico cortado da ficha nao existiam
# na base, e nenhuma conferencia de tela podia ve-los.
for f in 50-demandas 52-o-que-a-auditoria-de-arquitetura-provou 57-dem-lista-com-teto \
         58-membro-novo-nasce-em-producao \
         67-o-portao-de-aprovacao-tinha-tres-portas-dos-fundos \
         84-o-portao-congelava-no-nascimento-e-um-tab-passava-por-texto \
         85-o-anexo-nao-era-anexo-era-um-link-sem-dono \
         86-sete-casts-cegos-e-quatro-acoes-que-diziam-ok-sem-fazer-nada \
         87-a-lista-escondia-a-atrasada-e-o-indicador-contava-quem-nao-tinha-prazo \
         88-a-segunda-auditoria-achou-o-que-a-primeira-deixou \
         89-a-terceira-auditoria-e-a-lista-de-invisiveis-que-so-uma-copia-cresceu \
         90-o-setor-nao-ficava-sabendo-que-chegou-demanda \
         91-o-aviso-nunca-saiu-e-a-etapa-5-do-pdf-nao-existia \
         92-o-teto-era-de-quem-pede-e-o-invisivel-passava-pelo-meio \
         93-o-carimbo-velho-sobre-trabalho-novo-e-a-ficha-de-20-mb; do
  echo "-- ===== $f ====="
  cat "$B/supabase/$f.sql"
done > /tmp/_mig.sql

# A REGUA EXISTE NESTA BASE SO PARA AS MIGRACOES PODEREM ESCREVER NELA.
# Ela nasce em `55-...`, que e do sistema de escalas e nao entra aqui. Sem esta
# tabela, toda migracao da 84 em diante morre na ultima linha, DEPOIS de a
# conferencia dela ter passado — o pior lugar possivel para falhar, porque o
# log mostra "OK" e o banco fica pela metade.
{ echo "create table if not exists public.schema_versao (n int primary key, arquivo text, aplicada_em timestamptz not null default now());"
  cat /tmp/_mig.sql; } > /tmp/_mig2.sql && mv /tmp/_mig2.sql /tmp/_mig.sql
cp "$B/scripts/demandas-celular-semear.sql" /tmp/_seed.sql
chmod 644 /tmp/_prep.sql /tmp/_mig.sql /tmp/_seed.sql
su postgres -c "$PG/psql -h /tmp -U postgres -d $BANCO -q -f /tmp/_prep.sql"
su postgres -c "$PG/psql -h /tmp -U postgres -d $BANCO -q -v ON_ERROR_STOP=1 -f /tmp/_mig.sql" >/dev/null
su postgres -c "$PG/psql -h /tmp -U postgres -d $BANCO -q -v ON_ERROR_STOP=1 -f /tmp/_seed.sql" 2>&1 | grep -E "^ERROR" || true

# OS NUMEROS DA SEMENTE, PARA O MEDIDOR NAO ADIVINHAR — 21/09/2026.
#
# `demandas-celular.mjs` pedia `/demandas/d/4`, `/d/3` e `/d/6` escritos a mao.
# `numero` vem de `nextval`, e sequencia NAO volta atras em rollback: cada
# conferencia de migracao que abre e desfaz uma demanda queima numeros. Com as
# migracoes 84 a 87 no roteiro, a semente passou a nascer em 40, e as tres
# telas de DETALHE deixaram de ser medidas — em silencio, com o total de
# conferencias ate subindo, porque a tela de "essa demanda nao existe" tambem
# passa em contraste e alvo de toque.
#
# Medido: com as tres rotas de detalhe apontando para o vazio, apagar
# `min-width:0` de `.dm-dupla` e o `overflow-wrap` do historico nao reprovava
# nada. O instrumento estava medindo a tela de erro.
# `validada` E `concluida` SAO DUAS TELAS, E NAO UMA — 22/09/2026.
#
# No cartao verde da ficha, a migracao 91 poe um BOTAO enquanto a demanda nao
# foi confirmada e uma FRASE depois que foi. Caixas diferentes, alturas
# diferentes, alvo de toque so numa das duas. Pedir so `concluida` mediria
# metade do cartao — e a metade que some primeiro, porque a frase e a que
# ninguem lembra de olhar.
#
# `concluida` continua sendo a NAO validada (a semente nao valida a demanda 6
# de proposito) e `validada` e a nona, confirmada por quem pediu.
su postgres -c "$PG/psql -h /tmp -U postgres -d $BANCO -tAc \"
  select jsonb_pretty(jsonb_build_object(
    'execucao', (select min(numero) from demandas.demandas where status = 'execucao'),
    'travada',  (select min(numero) from demandas.demandas where status = 'travada'),
    'concluida',(select min(numero) from demandas.demandas
                  where status = 'concluida' and validada_em is null),
    'validada', (select min(numero) from demandas.demandas where validada_em is not null),
    'comLink',  (select min(numero) from demandas.demandas where descricao like '%http%'),
    'atrasada', (select min(numero) from demandas.demandas where prazo < current_date
                                       and status in ('aberta','execucao','travada'))))\"" \
  > /tmp/celular-numeros.json
chmod 644 /tmp/celular-numeros.json

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
