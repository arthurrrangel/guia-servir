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
-- O TERCEIRO PAPEL, QUE FALTAVA E CUSTOU UMA MIGRACAO INTEIRA.
--
-- 22/09/2026. `service_role` e quem o SERVIDOR usa (a rota de avisos, o cron).
-- Este harness nao o tinha, entao nenhuma conferencia conseguia perguntar "e
-- quem precisa chamar, consegue chamar?" -- e a resposta, medida em producao
-- pela quarta auditoria, era NAO: a migracao 90 inteira estava morta porque
-- `service_role` nao tinha USAGE no schema `demandas`. O bloco `do $conf$` da
-- 90 dava verde porque rodava como `postgres`, superusuario, que passa por
-- qualquer grant. Harness que nao tem os papeis da producao mede um sistema
-- que nao existe em lugar nenhum.
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
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
# A 68 sai da lista porque a 84, a 85 e a 87 reescrevem `dem_mover` e
# `dem_lista` por inteiro; a 80 nunca esteve aqui porque mexe em
# `public.pessoas`, que esta base nao tem de proposito.
#
# A 67 VOLTOU — 22/09/2026, E ELA NAO ERA SO `dem_mover` E `dem_lista`.
#
# A justificativa de tirar a 67 valia para as duas funcoes que a 84/85/87
# reescrevem por inteiro. So que a 67 tem um § 2, e nele ela reescreve
# `dem_bases` — e NENHUMA migracao posterior reescreve `dem_bases` por
# inteiro: a 92 so a remenda por dentro, com `troca_se_faltar`, para
# acrescentar o teto do setor.
#
# Medido neste harness, com a 67 fora, chamando `dem_bases` com o token de um
# `responsavel`:
#
#   VAZA: dem_bases devolve membros
#   { "id": "...", "nome": "Ana Kids", "papel": "solicitante",
#     "setor_id": "...", "telefone": "5531900000006" }
#
# Ou seja: nome, papel, setor e TELEFONE de todo mundo, para qualquer
# responsavel — exatamente o vazamento que a 67 existe para fechar, e que
# `lib/demandas/tipos.ts` ja nem declara (`Bases` perdeu o campo `membros` no
# mesmo commit da 67). Os 63 casos e as nove conferencias rodavam contra uma
# `dem_bases` que nao existe em producao desde 21/09.
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
         93-o-carimbo-velho-sobre-trabalho-novo-e-a-ficha-de-20-mb \
         94-a-base-central-de-pessoas-e-o-escopo-que-o-banco-cobra \
         95-o-anexo-vem-de-site-que-a-igreja-conhece; do
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

# ===========================================================================
# OS CODIGOS DO BANCO CONTRA AS FRASES DA TELA
#
# 22/09/2026. Renomear uma chave de `PORBANCO` em `lib/demandas/regras.ts` --
# `ATRASO_PRECISA_MOTIVO`, por exemplo -- deixava ESTE harness verde do comeco
# ao fim e `npm test` verde tambem: o harness nao conhece o TypeScript, e a
# varredura de `demandas.test.mjs` percorre `Object.keys(PORBANCO)`, ou seja,
# varre justamente a lista que acabou de ser estragada.
#
# O unico lugar do repositorio onde as duas listas podem ser cruzadas e aqui,
# porque so aqui existe o banco MONTADO -- com todas as migracoes aplicadas em
# ordem, que e o que decide qual versao de cada funcao esta viva. Ler os
# arquivos de migracao daria orfaos inventados: um codigo escrito na 52 e
# apagado pela 85 continua no disco.
cat > /tmp/_codigos.sql <<'SQL'
with f as (
  select pg_get_functiondef(p.oid) as src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'demandas'
      or (n.nspname = 'public' and p.proname like 'dem\_%')
)
select distinct m[1] from f, regexp_matches(f.src, '''erro''\s*,\s*''([A-Z][A-Z0-9_]*)''', 'g') m
order by 1;
SQL
chmod 644 /tmp/_codigos.sql
su postgres -c "$PG/psql -h /tmp -U postgres -d dem -tAq -v ON_ERROR_STOP=1 -f /tmp/_codigos.sql" \
  > /tmp/_codigos-do-banco.txt
chmod 644 /tmp/_codigos-do-banco.txt
( cd "$B" && node --import ./scripts/_ts.mjs scripts/demandas-codigos.test.mjs /tmp/_codigos-do-banco.txt ) || {
  echo
  echo "FALHOU — os codigos que o banco devolve e as frases da tela divergem."
  exit 1
}

echo
echo "OK — demandas: as regras do PDF valem no banco, e a suite agora reprova quando nao valem."
