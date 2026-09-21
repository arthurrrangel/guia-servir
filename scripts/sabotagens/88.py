RESTAURA = [84, 85, 86, 87, 88]
CASOS = [
 {"nome": "o cursor volta, e o vazamento com ele",
  "sql": troca('dem_lista',
    "if p_f ? 'depois_de' then return jsonb_build_object('ok', false, 'erro', 'CURSOR_SAIU'); end if;", ""),
  "espera": "1: `depois_de` ainda e aceito"},

 {"nome": "prazo no passado volta a ser recusado",
  "sql": troca('dem_abrir',
    "v_prazo := nullif(p_d->>'prazo','')::date;",
    "v_prazo := nullif(p_d->>'prazo','')::date; "
    "if v_prazo is not null and v_prazo < demandas.hoje() then "
    "return jsonb_build_object('ok', false, 'erro', 'PRAZO_NO_PASSADO'); end if;"),
  "espera": "2: registrar o que ja aconteceu foi recusado"},

 {"nome": "a cura volta a deixar a trava de informacao no lugar",
  "sql": troca('dem_mover',
    "travada_por = 'aprovacao', travada_nota = 'A categoria passou a exigir aprovação depois que esta demanda foi aberta.'",
    "travada_por = case when status in ('aberta','execucao') then 'aprovacao' else travada_por end, "
    "travada_nota = 'A categoria passou a exigir aprovação depois que esta demanda foi aberta.'"),
  "espera": "3: a cura deixou travada_por=informacao"},

 {"nome": "a cura volta a inventar o evento que o gatilho ja grava",
  "sql": troca('dem_mover',
    "perform set_config('demandas.membro', coalesce(m.id::text, ''), true);",
    "perform set_config('demandas.membro', coalesce(m.id::text, ''), true); "
    "insert into demandas.eventos (demanda_id, membro_id, tipo, para, texto) "
    "values (d.id, null, 'aprovacao', 'pendente', 'dobrado');"),
  "espera": "3: a cura gravou 2 eventos"},

 {"nome": "a cura volta a atribuir a decisao a quem so comentou",
  "sql": troca('dem_mover',
    "perform set_config('demandas.membro', '', true);", ""),
  "espera": "3: o historico atribuiu a decisao a quem so comentou"},

 {"nome": "a ficha para de dizer o veredito do portao",
  "sql": troca('resumo', "'falta_aprovacao', demandas.falta_aprovacao(d),", "'falta_aprovacao', false,",
               schema='demandas'),
  "espera": "3: a ficha nao diz ao gestor que falta aprovacao"},

 {"nome": "as CHECKs voltam a avaliar para NULL",
  "sql": "alter table demandas.demandas drop constraint demandas_titulo_tam_ck;\n"
         "alter table demandas.demandas add constraint demandas_titulo_tam_ck "
         "check (length(demandas.limpo(titulo)) between 3 and 200) not valid;",
  "espera": "4: titulo so de espacos entrou"},

 {"nome": "url_boa volta a aceitar localhost com ponto final",
  "sql": "create or replace function demandas.url_host(u text) returns text language sql immutable "
         "parallel safe as $fn$ select lower(pg_catalog.substring("
         "pg_catalog.regexp_replace(demandas.url_autoridade(u), '^[^@]*@', ''), '^[^:]+')) $fn$;",
  "espera": "5: url_boa aceitou https://localhost."},

 {"nome": "url_boa volta a recusar HTTPS em maiusculo",
  "sql": troca("url_boa", "and u ~* '^https://'", "and u ~ '^https://'", schema='demandas'),
  "espera": "5: url_boa recusou HTTPS em maiusculo"},

 {"nome": "limpo() volta a nao conhecer os invisiveis",
  "sql": "create or replace function demandas.limpo(t text) returns text language sql immutable "
         "parallel safe as $fn$ select nullif(pg_catalog.regexp_replace("
         "pg_catalog.regexp_replace(coalesce(t,''), '^[[:space:]]+',''), '[[:space:]]+$',''), '') $fn$;",
  "espera": "6: limpo() deixou passar U+"},

 {"nome": "desanexar volta a levantar com id invalido",
  "sql": troca('dem_mover',
    "if coalesce(p_d->>'anexo_id','') !~* "
    "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then "
    "return jsonb_build_object('ok', false, 'erro', 'ANEXO_NAO_ENCONTRADO'); end if;", ""),
  "espera": "7: desanexar LEVANTOU"},

 {"nome": "dem_ajustar volta a ter cast cego",
  "sql": troca('dem_ajustar',
    "for v_ch in select unnest(array['ordem','prazo_padrao_dias']) loop "
    "if (p_d ? v_ch) and coalesce(p_d->>v_ch,'') <> '' and p_d->>v_ch !~ '^-?[0-9]{1,6}$' then "
    "return jsonb_build_object('ok', false, 'erro', 'NUMERO_INVALIDO', 'campo', v_ch); end if; end loop;", ""),
  "espera": "8: dem_ajustar LEVANTOU"},

 {"nome": "a categoria repetida volta a ignorar os campos em silencio",
  # a sabotagem tem que continuar sendo SQL valido, senao ela testa o parser e
  # nao a regra: os campos passam a vir da linha que ja existe, que e
  # exatamente o defeito de antes.
  "sql": troca('dem_ajustar',
    "setor_id = excluded.setor_id, exige_aprovacao = excluded.exige_aprovacao, "
    "exige_orcamento = excluded.exige_orcamento, "
    "prazo_padrao_dias = excluded.prazo_padrao_dias, ordem = excluded.ordem",
    "setor_id = categorias.setor_id, exige_aprovacao = categorias.exige_aprovacao, "
    "exige_orcamento = categorias.exige_orcamento, "
    "prazo_padrao_dias = categorias.prazo_padrao_dias, ordem = categorias.ordem"),
  "espera": "8: a categoria repetida ignorou os campos enviados"},

 {"nome": "o periodo invertido volta a devolver zero com ok",
  "sql": troca('dem_numeros',
    "if v_de > v_ate then return jsonb_build_object('ok', false, 'erro', 'PERIODO_INVERTIDO'); end if;", ""),
  "espera": "9: periodo invertido devolveu ok"},

 {"nome": "dem_numeros volta a medir no fuso da sessao",
  "sql": troca('dem_numeros', "demandas.dia(concluida_em)", "concluida_em::date"),
  "espera": "9: sobrou conversao de data no fuso da sessao"},

 {"nome": "as ajudantes voltam a ser porta publica",
  "sql": "grant execute on function public.troca_unica(text,text,text,text) to anon;",
  "espera": "10: troca_unica continua alcancavel"},

# A sabotagem da REGUA nao cabe nesta bateria: `public.schema_sonda` e do
# sistema de escalas e nao existe num banco montado so com as migracoes de
# Demandas. Quem cobra as sondas 67 e 80 e `bash scripts/escala-banco.sh`,
# que monta o banco inteiro, e ele ficou verde depois da 88.
]
