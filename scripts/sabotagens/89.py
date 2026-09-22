RESTAURA = [84, 85, 86, 87, 88, 89]
CASOS = [
 # ---- 1 · url_boa nunca devolve NULO -----------------------------------
 {"nome": "url_host volta a devolver NULO com host vazio",
  "sql": "create or replace function demandas.url_host(u text) returns text language sql immutable "
         "parallel safe as $fn$ select rtrim(lower(pg_catalog.substring("
         "pg_catalog.regexp_replace(demandas.url_autoridade(u), '^[^@]*@', ''), '^[^:]+')), '.') $fn$;",
  "espera": "1: url_host devolveu NULO"},

 {"nome": "url_boa volta a poder devolver NULO",
  "sql": "create or replace function demandas.url_boa(u text) returns boolean language sql immutable "
         "parallel safe as $fn$ select u is not null and u ~* '^https://' "
         "and length(u) between 12 and 2048 and u !~ demandas.invisiveis() "
         "and demandas.url_autoridade(u) !~ '@' "
         "and nullif(demandas.url_host(u), '') ~ '\\.' "
         "and demandas.url_host(u) !~ '(^|\\.)localhost$' $fn$;",
  "espera": "1: url_boa(https://:8443/orcamento.pdf) devolveu NULO"},

 # ---- 2 · UMA lista de invisiveis, nos dois lugares --------------------
 {"nome": "limpo() volta a conhecer so os 20 pontos da 88",
  "sql": "create or replace function demandas.limpo(t text) returns text language sql immutable "
         "parallel safe as $fn$ select nullif(pg_catalog.regexp_replace("
         "pg_catalog.regexp_replace(coalesce(t,''), '^[[:space:]]+',''), '[[:space:]]+$',''), '') $fn$;",
  "espera": "2: limpo() nao ve U+"},

 {"nome": "url_boa volta a ter a propria copia da lista de espaco",
  "sql": troca("url_boa", "and u !~ demandas.invisiveis()", "and u !~ '[[:space:]]'", schema='demandas'),
  "espera": "2: url_boa aceitou U+"},

 {"nome": "a classe perde os pontos de Trojan Source",
  "sql": troca("invisiveis", "|| chr(8234) || '-' || chr(8238)", "|| chr(8234)", schema='demandas'),
  "espera": "2: "},

 {"nome": "a classe perde os tag characters",
  "sql": troca("invisiveis", "|| chr(917536) || '-' || chr(917631)", "|| chr(917536)", schema='demandas'),
  "espera": "2: "},

 {"nome": "limpo() passa a comer o miolo do texto, e nao so as pontas",
  "sql": "create or replace function demandas.limpo(t text) returns text language sql immutable "
         "parallel safe as $fn$ select nullif(pg_catalog.regexp_replace(coalesce(t,''), "
         "demandas.invisiveis(), '', 'g'), '') $fn$;",
  "espera": "2: limpo() estragou texto normal"},

 # ---- 3 · o reparo e as CHECKs validas ---------------------------------
 {"nome": "as CHECKs voltam a ser not valid",
  "sql": "alter table demandas.demandas drop constraint demandas_titulo_tam_ck;\n"
         "alter table demandas.demandas add constraint demandas_titulo_tam_ck "
         "check (coalesce(length(demandas.limpo(titulo)), 0) between 3 and 200) not valid;",
  "espera": "3: sobrou CHECK not valid"},

 # ---- 4 · o veredito e booleano em todo estado -------------------------
 {"nome": "falta_aprovacao volta a devolver NULO em demanda fechada",
  "sql": "create or replace function demandas.falta_aprovacao(d demandas.demandas) returns boolean "
         "language sql stable as $fn$ select d.aprovacao = 'pendente' or (d.aprovacao is null "
         "and d.status not in ('concluida','cancelada') and exists (select 1 from demandas.categorias c "
         "where c.id = d.categoria_id and c.exige_aprovacao)) $fn$;",
  "espera": "4: falta_aprovacao devolveu NULO"},

 {"nome": "o portao passa a dizer que nunca falta aprovacao",
  "sql": "create or replace function demandas.falta_aprovacao(d demandas.demandas) returns boolean "
         "language sql stable as $fn$ select false $fn$;",
  "espera": "4: o portao fechado nao aparece no resumo"},

 # ---- 5 · IP pelo ultimo rotulo ----------------------------------------
 {"nome": "a regra de IP volta a olhar rotulo por rotulo",
  "sql": troca("url_boa",
    "and pg_catalog.regexp_replace(demandas.url_host(u), '^.*\\.', '') !~* '^([0-9]+|0x[0-9a-f]*)$'",
    "and not exists (select 1 from unnest(string_to_array(demandas.url_host(u), '.')) r "
    "where r ~ '^[0-9]+$' or r ~* '^0x[0-9a-f]*$')", schema='demandas'),
  "espera": "5: RECUSOU host legitimo"},

 {"nome": "a regra de IP some, e o endereco de metadados passa",
  "sql": troca("url_boa",
    "and pg_catalog.regexp_replace(demandas.url_host(u), '^.*\\.', '') !~* '^([0-9]+|0x[0-9a-f]*)$'",
    "", schema='demandas'),
  "espera": "5: aceitou https://169.254.169.254"},

 # ---- 6 · dem_abrir: os dois setores -----------------------------------
 {"nome": "setor_solicitante volta a ser cast cego",
  "sql": troca('dem_abrir',
    "if coalesce(p_d->>'setor_solicitante','') <> '' and p_d->>'setor_solicitante' !~* "
    "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then "
    "return jsonb_build_object('ok', false, 'erro', 'SETOR_INVALIDO', 'campo', 'setor_solicitante'); end if;", ""),
  "espera": "6: setor_solicitante LEVANTOU"},

 {"nome": "setor_responsavel volta a ser cast cego",
  "sql": troca('dem_abrir',
    "if coalesce(p_d->>'setor_responsavel','') <> '' and p_d->>'setor_responsavel' !~* "
    "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then "
    "return jsonb_build_object('ok', false, 'erro', 'SETOR_INVALIDO', 'campo', 'setor_responsavel'); end if;", ""),
  "espera": "6: setor_responsavel LEVANTOU"},

 # ---- 7 · dem_ajustar --------------------------------------------------
 {"nome": "ordem volta a ser cast cego com string vazia",
  "sql": troca('dem_ajustar', "coalesce(nullif(p_d->>'ordem','')::int, 99)",
                              "coalesce((p_d->>'ordem')::int, 99)"),
  "espera": "7: setor {\"nome\":\"CONF89 Zeta\",\"ordem\":\"\"} LEVANTOU"},

 {"nome": "atende volta a ser cast cego com string vazia",
  "sql": troca('dem_ajustar', "coalesce(nullif(p_d->>'atende','')::boolean, false)",
                              "coalesce((p_d->>'atende')::boolean, false)"),
  "espera": "7: setor {\"nome\":\"CONF89 Zeta\",\"atende\":\"\"} LEVANTOU"},

 {"nome": "a chave estrangeira volta a subir crua",
  "sql": troca('dem_ajustar',
    "when foreign_key_violation then return jsonb_build_object('ok', false, 'erro', 'SETOR_INVALIDO');", ""),
  "espera": "7: fk LEVANTOU"},

 {"nome": "o not-null volta a subir cru",
  "sql": troca('dem_ajustar',
    "when not_null_violation then return jsonb_build_object('ok', false, 'erro', 'FALTA_CAMPO');", ""),
  # o caminho que chega ao handler NAO e o de setor/categoria: la a guarda de
  # nome da 89 devolve FALTA_CAMPO antes do insert. E o de MEMBRO sem nome,
  # que a guarda nao cobre de proposito (membro e cadastrado por outra tela).
  "espera": "7: membro sem nome LEVANTOU"},

 {"nome": "categoria volta a poder nascer sem nome",
  "sql": troca('dem_ajustar',
    "if p_o_que in ('setor','categoria') and nullif(p_d->>'id','') is null "
    "and demandas.limpo(p_d->>'nome') is null then "
    "return jsonb_build_object('ok', false, 'erro', 'FALTA_CAMPO', 'campo', 'nome'); end if;", ""),
  "espera": "7: criou categoria com nome so de espaco"},

 # ---- 8 · por_mes no fuso do Rio ---------------------------------------
 {"nome": "por_mes volta a contar no fuso da sessao",
  "sql": troca('dem_numeros', "to_char(demandas.dia(criada_em), 'YYYY-MM')",
                              "to_char(criada_em, 'YYYY-MM')"),
  "espera": "8: por_mes pos a demanda no mes errado"},

 # ---- 9 · posso_tirar --------------------------------------------------
 {"nome": "o servidor volta a nao dizer quem pode tirar o anexo",
  "sql": troca('dem_ver', "'posso_tirar', (demandas.pode_atender(m, d) or a.membro_id = m.id),",
                          "'posso_tirar', true,"),
  "espera": "9: a tela oferece para a Eva tirar o anexo da Ana"},

 {"nome": "posso_tirar passa a mentir para o lado contrario",
  "sql": troca('dem_ver', "'posso_tirar', (demandas.pode_atender(m, d) or a.membro_id = m.id),",
                          "'posso_tirar', demandas.pode_atender(m, d),"),
  "espera": "9: a Eva nao pode tirar o anexo que ela mesma colou"},

 # ---- 6b · a CHECK do anexo nao prende o anexo ruim --------------------
 {"nome": "a CHECK do anexo volta a valer sobre o que ja foi tirado",
  "sql": "alter table demandas.anexos drop constraint anexos_url_ck;\n"
         "alter table demandas.anexos add constraint anexos_url_ck "
         "check (coalesce(demandas.url_boa(url), false));",
  "espera": "6b: a CHECK impede TIRAR"},

 # ---- 10 · limite invalido ---------------------------------------------
 {"nome": "o limite volta a aceitar zero e negativo",
  "sql": troca('dem_lista',
    "if (p_f ? 'limite') and coalesce(p_f->>'limite','') !~ '^[0-9]{1,6}$' then "
    "return jsonb_build_object('ok', false, 'erro', 'LIMITE_INVALIDO'); end if; "
    "if (p_f ? 'limite') and (p_f->>'limite')::int < 1 then "
    "return jsonb_build_object('ok', false, 'erro', 'LIMITE_INVALIDO'); end if;",
    "if (p_f ? 'limite') and coalesce(p_f->>'limite','') !~ '^-?[0-9]{1,9}$' then "
    "return jsonb_build_object('ok', false, 'erro', 'LIMITE_INVALIDO'); end if;"),
  "espera": "10: limite 0 foi aceito"},

 {"nome": "o limite passa a recusar tambem o valor bom",
  "sql": troca('dem_lista',
    "if (p_f ? 'limite') and (p_f->>'limite')::int < 1 then",
    "if (p_f ? 'limite') and (p_f->>'limite')::int < 1000 then"),
  "espera": "10: limite bom foi recusado"},

 # ---- 11 · a marca no codigo executavel --------------------------------
 {"nome": "a marca do anexo_id volta para dentro do comentario",
  "sql": troca('dem_mover', "'ANEXO_NAO_ENCONTRADO', 'campo', 'anexo_id'", "'ANEXO_NAO_ENCONTRADO'"),
  "espera": "11: a marca do anexo_id"},

 # ---- porta publica ----------------------------------------------------
 {"nome": "as ajudantes de cirurgia voltam a ser da porta publica",
  "sql": "grant execute on function public.troca_se_faltar(text,text,text,text,text) to anon;",
  "espera": "porta: public.troca_se_faltar"},
]
