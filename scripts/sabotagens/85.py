RESTAURA = [84, 85, 86, 87, 88]
CASOS = [
 {"nome": "url_boa volta a aceitar qualquer http(s)",
  "sql": "create or replace function demandas.url_boa(u text) returns boolean "
         "language sql immutable parallel safe as $fn$ select u ~* '^https?://' $fn$;",
  "espera": "1: url_boa aceitou"},

 {"nome": "anexar volta a ser gateada por quem so VE",
  "sql": troca('dem_mover',
    "if not (demandas.pode_atender(m, d) or d.aberta_por = m.id) then "
    "return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if; "
    "v_url := demandas.limpo(p_d->>'url');",
    "v_url := demandas.limpo(p_d->>'url');"),
  "espera": "2: o solicitante do setor pregou um boleto"},

 {"nome": "o rotulo volta a ser o que o cliente mandou",
  "sql": "create or replace function demandas.rotulo_do_anexo(p_nome text, p_url text) returns text "
         "language sql immutable parallel safe as $fn$ select coalesce(demandas.limpo(p_nome),'anexo') $fn$;",
  "espera": "5: o rotulo nao diz para onde vai"},

 {"nome": "o teto de 20 anexos cai",
  "sql": troca('dem_mover', "if v_n >= 20 then", "if v_n >= 100000 then"),
  "espera": "6: a demanda ficou com"},

 {"nome": "o toque duplo no comentario volta a duplicar",
  "sql": troca('dem_mover',
    "and e.em > now() - interval '20 seconds') then",
    "and e.em > now() + interval '20 seconds') then"),
  "espera": "6: tres toques no mesmo comentario"},

 {"nome": "o toque duplo no anexo volta a duplicar",
  "sql": "drop index if exists demandas.ux_anexos_vivo;\n" + troca('dem_mover',
    "if exists (select 1 from demandas.anexos where demanda_id = d.id and url = v_url "
    "and removido_em is null) then return jsonb_build_object('ok', true, 'repetido', true); end if;",
    ""),
  "espera": "6: tres toques no mesmo link"},

 {"nome": "desanexar volta a APAGAR a linha",
  "sql": troca('dem_mover',
    "update demandas.anexos a set removido_em = now(), removido_por = m.id "
    "where a.demanda_id = d.id and a.removido_em is null",
    "delete from demandas.anexos a where a.demanda_id = d.id and a.removido_em is null"),
  "espera": "7: desanexar APAGOU a linha"},

 {"nome": "desanexar volta a aceitar qualquer um",
  "sql": troca('dem_mover',
    "and (demandas.pode_atender(m, d) or a.membro_id = m.id) returning a.nome into v_rot;",
    "returning a.nome into v_rot;"),
  "espera": "7: quem e do setor mas nao atende nem colou tirou o anexo dos outros"},

 {"nome": "dem_ver volta a mostrar o anexo tirado",
  "sql": troca('dem_ver',
    "where x.demanda_id = d.id and x.removido_em is null",
    "where x.demanda_id = d.id"),
  "espera": "7: a ficha continua mostrando o anexo tirado"},

 {"nome": "a ficha para de dizer que o anexo chegou depois de fechar",
  "sql": troca('dem_ver',
    "'depois_de_fechar', d.concluida_em is not null and a.em > d.concluida_em",
    "'depois_de_fechar', false"),
  "espera": "8: a ficha nao separa o anexo que chegou depois"},

 {"nome": "dem_abrir volta a deixar entrar url ruim em lote",
  "sql": troca('dem_abrir',
    "if v_maus > 0 then return jsonb_build_object('ok', false, 'erro', 'URL_INVALIDA'); end if;",
    ""),
  "espera": "4: dem_abrir recusou pela CHECK e nao pelo guarda"},

 {"nome": "dem_abrir volta a aceitar lote sem teto",
  "sql": troca('dem_abrir',
    "if jsonb_array_length(p_d->'anexos') > 20 then return jsonb_build_object('ok', false, 'erro', 'ANEXOS_DEMAIS'); end if;",
    ""),
  "espera": "4: dem_abrir aceitou 30 anexos"},
]
