# A CADEIA PARA NO PROPRIO NUMERO, E ISSO NAO E DESCUIDO.
#
# Uma conferencia testa o estado logo DEPOIS do arquivo dela. A migracao 88
# reverteu duas decisoes desta rodada (o cursor de `dem_lista` e a recusa de
# prazo no passado), entao rodar esta conferencia contra um banco ja na 88
# reprova com razao. A regua protege isso em producao: `exige_versao_ate`
# recusa reaplicar a 87 num banco na 88 com "MIGRACAO SUPERADA".

RESTAURA = [84, 85, 86, 87]
# As duas sabotagens do CURSOR sairam: a migracao 88 tirou `depois_de` de
# `dem_lista` porque ele lia a linha ancora sem `pode_ver` e vazava prioridade,
# prazo e situacao de demanda de outro setor, alem de perder e duplicar linhas
# quando a ordem mudava entre paginas. O que ele resolvia agora e resolvido
# pelos filtros.
CASOS = [
 {"nome": "hoje() volta a ser o dia de UTC",
  "sql": "create or replace function demandas.hoje() returns date language sql stable "
         "parallel safe as $fn$ select current_date $fn$;",
  "espera": "1: hoje() mudou com o fuso da sessao"},

 {"nome": "a ordem volta a ignorar o atraso",
  "sql": troca('dem_lista',
    "order by f.k_fechada, f.k_atraso, f.k_prio, f.prazo nulls last, f.numero desc limit v_lim",
    "order by f.k_prio, f.prazo nulls last, f.numero desc limit v_lim"),
  "espera": "2: com limite 1 a pagina veio"},

 {"nome": "a fechada volta a subir junto com as abertas",
  "sql": troca('dem_lista',
    "o.k_fechada, o.k_atraso, o.k_prio, o.prazo nulls last, o.numero desc), '[]'::jsonb)",
    "o.k_atraso, o.k_prio, o.prazo nulls last, o.numero desc), '[]'::jsonb)"),
  "espera": "2: a concluida nao foi para o fim"},

 {"nome": "o curinga da busca volta a valer como curinga",
  "sql": "create or replace function demandas.como_texto(t text) returns text language sql "
         "immutable parallel safe as $fn$ select coalesce(t,'') $fn$;",
  "espera": "3: busca \"%\" devolveu"},

 {"nome": "aba desconhecida volta a falhar ABERTO",
  "sql": troca('dem_lista',
    "if v_aba not in ('tudo','minhas','setor','comigo') then "
    "return jsonb_build_object('ok', false, 'erro', 'ABA_INVALIDA'); end if;", ""),
  "espera": "4: aba desconhecida falhou ABERTO"},

 {"nome": "os filtros errados voltam a levantar P0001",
  "sql": troca('dem_lista',
    "if (p_f ? 'setor') and nullif(p_f->>'setor','') is not null and p_f->>'setor' !~* "
    "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then "
    "return jsonb_build_object('ok', false, 'erro', 'SETOR_INVALIDO'); end if;",
    "if (p_f ? 'setor') and nullif(p_f->>'setor','') is not null and p_f->>'setor' !~* "
    "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then "
    "raise exception 'SETOR_INVALIDO' using errcode = 'raise_exception'; end if;"),
  "espera": "5: {\"setor\":\"x\"} LEVANTOU"},

 {"nome": "no_prazo_pct volta a contar quem nunca teve prazo",
  "sql": troca('dem_numeros',
    "'no_prazo_pct', (select case when count(*) filter (where prazo is not null) = 0 then null else "
    "round(100.0 * count(*) filter (where prazo is not null and concluida_em::date <= prazo) "
    "/ count(*) filter (where prazo is not null), 0) end",
    "'no_prazo_pct', (select case when count(*) = 0 then null else "
    "round(100.0 * count(*) filter (where prazo is null or concluida_em::date <= prazo) "
    "/ count(*), 0) end"),
  "espera": "7: no_prazo_pct devia ser 50"},

 {"nome": "no_prazo_base some e o indicador volta a nao dizer a base",
  "sql": troca('dem_numeros',
    "'no_prazo_base', (select count(*) from base where status = 'concluida' and prazo is not null),", ""),
  "espera": "7: no_prazo_base devia dizer 2"},
]
