RESTAURA = [84, 85, 86, 87]
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

 {"nome": "o cursor some e alem do teto volta a ser inalcancavel",
  "sql": troca('dem_lista',
    "'proximo', case when jsonb_array_length(v) >= v_lim then "
    "(v -> (jsonb_array_length(v)-1) ->> 'numero')::int else null end,",
    "'proximo', null,"),
  "espera": "6: a primeira pagina nao devolveu o cursor"},

 {"nome": "o cursor perde o desempate total e repete linhas",
  "sql": troca('dem_lista',
    "or (f.k_fechada, f.k_atraso, f.k_prio, coalesce(f.prazo, 'infinity'::date), -f.numero) "
    "> (v_ck_f, v_ck_a, v_ck_p, v_ck_prazo, -v_depois)",
    "or (f.k_fechada, f.k_atraso, f.k_prio, coalesce(f.prazo, 'infinity'::date)) "
    ">= (v_ck_f, v_ck_a, v_ck_p, v_ck_prazo)"),
  "espera": "6: a segunda pagina REPETE linhas"},

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
