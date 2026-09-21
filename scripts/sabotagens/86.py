RESTAURA = [84, 85, 86]
CASOS = [
 {"nome": "dem_ver volta a diferenciar alheia de inexistente",
  "sql": troca('dem_ver',
    "if not demandas.pode_ver(m, d) then return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;",
    "if not demandas.pode_ver(m, d) then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;"),
  "espera": "8: dem_ver diferencia demanda alheia"},

 {"nome": "assumir volta a nao ter guarda de dono",
  "sql": troca('dem_mover',
    "if d.responsavel_id is not null and d.responsavel_id <> m.id then "
    "return jsonb_build_object('ok', false, 'erro', 'JA_TEM_DONO', 'quem', "
    "(select x.nome from demandas.membros x where x.id = d.responsavel_id)); end if;", ""),
  "espera": "3: a segunda pessoa roubou a demanda"},

 {"nome": "prazo volta a apagar com corpo vazio",
  "sql": troca('dem_mover',
    "if not (p_d ? 'prazo') then return jsonb_build_object('ok', false, 'erro', 'PRAZO_NAO_VEIO'); end if;", ""),
  "espera": "2: `prazo` sem a chave APAGOU a data"},

 {"nome": "apagar prazo volta a nao exigir motivo",
  "sql": troca('dem_mover',
    "if nullif(p_d->>'prazo','') is null and v_txt is null then "
    "return jsonb_build_object('ok', false, 'erro', 'SEM_PRAZO_PRECISA_MOTIVO'); end if;", ""),
  "espera": "2: apagar o prazo sem motivo foi barrado pela CHECK"},

 {"nome": "redirecionar volta a levar a trava",
  "sql": troca('dem_mover',
    "status = case when demandas.falta_aprovacao(d) then 'travada' "
    "when status in ('execucao','travada') then 'aberta' else status end, "
    "travada_por = case when demandas.falta_aprovacao(d) then 'aprovacao' else null end, "
    "travada_nota = case when demandas.falta_aprovacao(d) then travada_nota else null end",
    "status = case when status = 'execucao' then 'aberta' else status end"),
  "espera": "4: a demanda chegou no setor novo TRAVADA"},

 {"nome": "concluir atrasada volta a nao pedir nada",
  "sql": troca('dem_mover',
    "if d.prazo is not null and d.prazo < current_date and demandas.limpo(p_d->>'atraso') is null then "
    "return jsonb_build_object('ok', false, 'erro', 'ATRASO_PRECISA_MOTIVO'); end if;", ""),
  "espera": "5: concluiu 51 dias depois do prazo"},

 {"nome": "exige_orcamento volta a nao exigir nada",
  "sql": troca('dem_abrir',
    "if c.exige_orcamento and nullif(p_d->>'orcamento','') is null then "
    "return jsonb_build_object('ok', false, 'erro', 'ORCAMENTO_OBRIGATORIO'); end if;", ""),
  "espera": "6: a categoria exige orcamento e a demanda nasceu sem"},

 {"nome": "orcamento negativo volta a entrar",
  "sql": "alter table demandas.demandas drop constraint if exists ck_orcamento;\n" + troca('dem_abrir',
    "if p_d->>'orcamento' !~ '^[0-9]+([.,][0-9]{1,2})?$' then "
    "return jsonb_build_object('ok', false, 'erro', 'ORCAMENTO_INVALIDO'); end if;", ""),
  "espera": "6: aceitou uma compra de menos oito mil reais"},

 {"nome": "prazo no passado volta a ser aceito na abertura",
  "sql": troca('dem_abrir',
    "if v_prazo is not null and v_prazo < current_date then "
    "return jsonb_build_object('ok', false, 'erro', 'PRAZO_NO_PASSADO'); end if;", ""),
  "espera": "7: a demanda nasceu ja atrasada"},

 {"nome": "o cast de categoria volta a ser cego",
  "sql": troca('dem_abrir',
    "if coalesce(p_d->>'categoria_id','') !~* "
    "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then "
    "return jsonb_build_object('ok', false, 'erro', 'CATEGORIA_INVALIDA'); end if;", ""),
  "espera": "1: {\"categoria_id\":\"nao-e-uuid\"} LEVANTOU"},

 {"nome": "o cast de interno volta a ser cego",
  "sql": troca('dem_mover',
    "coalesce(nullif(p_d->>'interno','') in ('true','t'), false) and demandas.pode_atender(m, d));",
    "coalesce((p_d->>'interno')::boolean, false) and demandas.pode_atender(m, d));"),
  "espera": "1: comentar com interno=\"talvez\" LEVANTOU"},

 {"nome": "o cast de setor no redirecionar volta a ser cego",
  "sql": troca('dem_mover',
    "if nullif(p_d->>'setor','') is null or p_d->>'setor' !~* "
    "'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then "
    "return jsonb_build_object('ok', false, 'erro', 'SETOR_INVALIDO'); end if; "
    "if not exists (select 1 from demandas.setores where id = (p_d->>'setor')::uuid and ativo and atende) then",
    "if not exists (select 1 from demandas.setores where id = nullif(p_d->>'setor','')::uuid and ativo and atende) then"),
  "espera": "1: redirecionar com setor invalido LEVANTOU"},

 {"nome": "o historico volta a nao olhar orcamento",
  "sql": troca('fn_historico',
    "if new.orcamento is distinct from old.orcamento then "
    "insert into demandas.eventos (demanda_id, membro_id, tipo, de, para) "
    "values (new.id, v_m, 'orcamento', to_char(old.orcamento, 'FM999G999G990D00'), "
    "to_char(new.orcamento, 'FM999G999G990D00')); end if;", "", schema='demandas'),
  "espera": "9: mudar o orcamento de uma compra"},

 {"nome": "os tetos de texto caem",
  "sql": "alter table demandas.eventos drop constraint if exists ck_tam_texto;",
  "espera": "10: um comentario de 200 mil letras entrou"},
]
