#!/bin/bash
# DUAS VARREDURAS AO MESMO TEMPO NAO PODEM MANDAR O MESMO AVISO.
#
# Por que este arquivo existe, e nao mais um caso na bateria de sabotagem:
#
# A bateria roda a conferencia num bloco `do`, numa sessao so. Numa sessao so,
# `for update skip locked` e `for update` se comportam identicamente: nao ha
# com quem disputar a linha. Uma sabotagem que troca um pelo outro saia VERDE,
# e um "ok" verde sobre uma coisa nao medida e pior do que nao medir.
#
# O defeito que isto existe para pegar foi medido em producao pela quarta
# auditoria, contra a migracao 90:
#
#   /tmp/ra.txt:A leu a fila: 461      /tmp/rb.txt:B leu a fila: 461
#   /tmp/ra.txt:A carimbou: 1          /tmp/rb.txt:B carimbou: 0
#
# As duas varreduras leram a MESMA demanda e as duas mandaram o email. O
# carimbo atomico so decidia quem gravava, depois de os dois emails ja terem
# saido. O cabecalho da rota afirmava, em prosa, "chamar duas vezes no mesmo
# segundo manda uma vez so".
#
# Roda com: bash scripts/duas-varreduras.sh
# Precisa do banco `dem` montado por scripts/demandas-banco.sh.
set -u
PG=/usr/lib/postgresql/16/bin
# `-c` com SQL de varias linhas atravessa duas camadas de aspas (bash e
# `su -c`) e chega quebrado do outro lado. Tudo aqui vai por ARQUIVO.
Qf() { su postgres -c "$PG/psql -h /tmp -U postgres -d dem -tAq -v ON_ERROR_STOP=1 -f $1"; }

cat > /tmp/_dv_prep.sql <<'SQL'
delete from demandas.avisos a using demandas.demandas d
 where a.demanda_id = d.id and d.titulo like 'DV91%';
delete from demandas.eventos e using demandas.demandas d
 where e.demanda_id = d.id and d.titulo like 'DV91%';
delete from demandas.demandas where titulo like 'DV91%';
delete from demandas.membros  where nome like 'DV91%';
delete from demandas.categorias where grupo = 'DV91 grupo';
delete from demandas.setores  where nome like 'DV91%';

do $$
declare v_set uuid; v_adm uuid; v_cat uuid; v_tok text; v_r jsonb;
begin
  insert into demandas.setores (nome, slug, atende) values ('DV91 Setor','dv91-setor',true)
    returning id into v_set;
  insert into demandas.setores (nome, slug, atende) values ('DV91 Outro','dv91-outro',false)
    returning id into v_adm;
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, prazo_padrao_dias)
    values ('DV91 grupo','DV91 cat', v_set, false, 5) returning id into v_cat;
  insert into demandas.membros (nome,email,papel,setor_id,token,ativo)
    values ('DV91 Resp','dv91resp@exemplo.test','responsavel',v_set,'DV91TOKRESP',true);
  insert into demandas.membros (nome,email,papel,setor_id,token,ativo)
    values ('DV91 Sol','dv91sol@exemplo.test','solicitante',v_adm,'DV91TOKSOL',true)
    returning token into v_tok;
  for i in 1..10 loop
    v_r := public.dem_abrir(v_tok, jsonb_build_object(
      'categoria_id', v_cat, 'titulo', 'DV91 demanda ' || i,
      'descricao', 'Demanda numero ' || i || ' so para a corrida das duas varreduras',
      'prazo', to_char(demandas.hoje() + 10, 'YYYY-MM-DD')));
  end loop;
end $$;
SQL
chmod 644 /tmp/_dv_prep.sql
Qf /tmp/_dv_prep.sql >/dev/null

cat > /tmp/_dv_conta.sql <<'SQL'
select count(*) from demandas.avisos a
  join demandas.demandas d on d.id = a.demanda_id
 where d.titulo like 'DV91%' and a.enviado_em is null;
SQL
chmod 644 /tmp/_dv_conta.sql
FILA=$(Qf /tmp/_dv_conta.sql | tr -d '[:space:]')
echo "avisos na fila antes: $FILA"

# COMO A CORRIDA ACONTECE DE VERDADE, E POR QUE A PRIMEIRA VERSAO DESTE
# ARQUIVO NAO PEGAVA NADA.
#
# A primeira versao abria `begin`, lia a fila e segurava a transacao por dois
# segundos. Com a transacao aberta, o `for update skip locked` sozinho ja
# resolve: a segunda sessao pula as linhas travadas. Resultado: o teste dava
# verde ATE com a reserva sabotada, porque media uma janela que a rota nao
# tem.
#
# A rota nao segura transacao nenhuma enquanto manda email. Ela chama
# `dem_avisos_pendentes` (a transacao abre e FECHA, e o lock morre junto),
# depois fala com o provedor pela internet, e so entao carimba. A janela
# perigosa e essa, DEPOIS do commit e ANTES do carimbo, e nela nao existe lock
# nenhum: o unico guarda e `reservado_em` gravado no banco.
#
# Entao as duas varreduras aqui rodam em autocommit, uma logo depois da outra,
# que e exatamente o que dois processos da Vercel fazem quando duas demandas
# nascem com segundos de diferenca.
cat > /tmp/_dv_scan.sql <<'SQL'
select coalesce(string_agg(x->>'aviso_id', ','), '(nada)')
  from jsonb_array_elements(public.dem_avisos_pendentes(50)) x;
SQL
chmod 644 /tmp/_dv_scan.sql

Qf /tmp/_dv_scan.sql > /tmp/_dv_a.txt 2>&1
Qf /tmp/_dv_scan.sql > /tmp/_dv_b.txt 2>&1

A=$(grep -v '^$' /tmp/_dv_a.txt | head -1)
B=$(grep -v '^$' /tmp/_dv_b.txt | head -1)
echo "A levou: $(echo "$A" | tr ',' '\n' | grep -c . ) aviso(s)"
echo "B levou: $(echo "$B" | tr ',' '\n' | grep -c . ) aviso(s)"

REPETIDOS=$(python3 - "$A" "$B" <<'PY'
import sys
a = set(x for x in sys.argv[1].split(',') if x and x != '(nada)')
b = set(x for x in sys.argv[2].split(',') if x and x != '(nada)')
print(len(a & b))
PY
)
TOTAL=$(python3 - "$A" "$B" <<'PY'
import sys
a = set(x for x in sys.argv[1].split(',') if x and x != '(nada)')
b = set(x for x in sys.argv[2].split(',') if x and x != '(nada)')
print(len(a | b))
PY
)
echo "avisos que as DUAS levaram (mandariam email dobrado): $REPETIDOS"
echo "avisos distintos levados no total: $TOTAL de $FILA"

cat > /tmp/_dv_limpa.sql <<'SQL'
delete from demandas.avisos  a using demandas.demandas d where a.demanda_id=d.id and d.titulo like 'DV91%';
delete from demandas.eventos e using demandas.demandas d where e.demanda_id=d.id and d.titulo like 'DV91%';
delete from demandas.demandas   where titulo like 'DV91%';
delete from demandas.membros    where nome   like 'DV91%';
delete from demandas.categorias where grupo = 'DV91 grupo';
delete from demandas.setores    where nome   like 'DV91%';
SQL
chmod 644 /tmp/_dv_limpa.sql
Qf /tmp/_dv_limpa.sql >/dev/null

if [ "$REPETIDOS" != "0" ]; then
  echo; echo "REPROVOU: $REPETIDOS aviso(s) sairiam duas vezes."; exit 1
fi
if [ "$TOTAL" != "$FILA" ]; then
  echo; echo "REPROVOU: a fila tinha $FILA e as duas juntas levaram $TOTAL. Sumiu aviso."; exit 1
fi
echo; echo "OK: duas varreduras ao mesmo tempo dividiram a fila e nenhum aviso saiu dobrado."
