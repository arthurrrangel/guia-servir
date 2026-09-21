RESTAURA = [84, 85, 86]
CASOS = [
 {"nome": "o portao volta a ler so a coluna congelada",
  "sql": "create or replace function demandas.falta_aprovacao(d demandas.demandas) returns boolean "
         "language sql stable as $fn$ select d.aprovacao = 'pendente' $fn$;",
  "espera": "3: CONCLUIR FECHOU O GASTO"},
 {"nome": "limpo volta a ser btrim (so o U+0020)",
  "sql": "create or replace function demandas.limpo(t text) returns text language sql immutable "
         "parallel safe as $fn$ select nullif(btrim(coalesce(t,'')),'') $fn$;",
  "espera": "1: limpo() deixou passar"},
 {"nome": "travar volta a desfazer aprovacao de quem nao decide",
  "sql": troca('dem_mover',
    "if v_motivo = 'aprovacao' and d.aprovacao = 'aprovada' and m.papel not in ('gestor','admin') then "
    "return jsonb_build_object('ok', false, 'erro', 'SO_GESTOR_REABRE_APROVACAO'); end if;", ""),
  "espera": "5: quem atende desfez a decisao do gestor"},
 {"nome": "reabrir volta a gravar execucao fixo",
  "sql": troca('dem_mover',
    "status = case when d.aprovacao in ('rejeitada','pendente') then 'travada' "
    "when responsavel_id is null then 'aberta' else 'execucao' end,",
    "status = case when d.aprovacao in ('rejeitada','pendente') then 'travada' else 'execucao' end,"),
  "espera": "6: reabriu EM EXECUCAO e SEM NINGUEM"},
 {"nome": "aprovar mais estreito que as guardas, e sem a cura (impasse)",
  "sql": troca('dem_mover',
    "if not demandas.falta_aprovacao(d) then return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_PENDENTE'); end if;",
    "if d.aprovacao is distinct from 'pendente' then return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_PENDENTE'); end if;")
    + "\n" + troca('dem_mover', "if d.aprovacao is null and demandas.falta_aprovacao(d) then", "if false then"),
  "espera": "4: IMPASSE"},
 {"nome": "o historico volta a abrir dizendo 'aberta'",
  "sql": troca('dem_abrir', "values (v_id, m.id, 'abertura', v_status, null);",
                            "values (v_id, m.id, 'abertura', 'aberta', null);"),
  "espera": "7: a demanda nasceu travada"},
 {"nome": "as CHECKs voltam a usar btrim (a regra deixa de ser do banco)",
  "sql": "alter table demandas.demandas drop constraint ck_conclusao; "
         "alter table demandas.demandas add constraint ck_conclusao "
         "check (status <> 'concluida' or nullif(btrim(coalesce(conclusao,'')),'') is not null) not valid;",
  "espera": "2: ck_conclusao aceitou NBSP por SQL direto"},
]
