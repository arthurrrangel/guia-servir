RESTAURA = [84, 85, 86, 87, 88, 89, 90, 91]
CASOS = [
 # ---------------------------------------------------- a fila enfileira certo
 {"nome": "o gatilho para de enfileirar a demanda nova",
  # a primeira versao desta sabotagem trocava `if TG_OP = 'INSERT'` por `if false`
  # e PASSOU: sem o `return null` do ramo de insercao, o fluxo caia no ramo de
  # UPDATE, onde `old.setor_responsavel` e nulo num INSERT, `is distinct from`
  # da verdadeiro, e a fila era alimentada do mesmo jeito -- pelo caminho
  # errado. Sabotagem que o sistema conserta sozinho nao mede nada.
  "sql": troca('fn_enfileirar_aviso', "select new.id, m.id, 'nova'\n        from demandas.membros m\n       where m.setor_id = new.setor_responsavel",
                                      "select new.id, m.id, 'nova'\n        from demandas.membros m\n       where false and m.setor_id = new.setor_responsavel", schema='demandas'),
  "espera": "1: devia enfileirar 3"},

 {"nome": "quem abriu volta a ser avisado do proprio pedido",
  "sql": troca('fn_enfileirar_aviso', "and m.id is distinct from new.aberta_por;\n    return null;",
                                      ";\n    return null;", schema='demandas'),
  "espera": "2: quem abriu, sendo do setor que atende, foi avisado do proprio pedido"},

 {"nome": "membro sem email volta para a fila",
  "sql": troca('fn_enfileirar_aviso',
               "and demandas.limpo(coalesce(m.auth_email, m.email)) is not null\n         and m.id is distinct from new.aberta_por;\n    return null;",
               "and m.id is distinct from new.aberta_por;\n    return null;", schema='demandas'),
  "espera": "2: membro sem email entrou na fila"},

 {"nome": "membro inativo volta para a fila",
  "sql": troca('fn_enfileirar_aviso', "and coalesce(m.ativo, true)\n         and m.papel in ('responsavel','gestor','admin')\n         and demandas.limpo",
                                      "and m.papel in ('responsavel','gestor','admin')\n         and demandas.limpo", schema='demandas'),
  "espera": "2: membro inativo entrou na fila"},

 {"nome": "o solicitante do setor que atende entra na lista de quem atende",
  "sql": troca('fn_enfileirar_aviso', "and m.papel in ('responsavel','gestor','admin')\n         and demandas.limpo",
                                      "and demandas.limpo", schema='demandas'),
  "espera": "2: solicitante do setor que atende entrou na lista de quem atende"},

 # ------------------------------------------------------- a fila RESERVA
 {"nome": "a varredura volta a so ler, e duas pegam o mesmo aviso",
  "sql": troca('dem_avisos_pendentes', "set reservado_em = now(), tentativas = a.tentativas + 1",
                                       "set tentativas = a.tentativas + 1"),
  "espera": "3: a segunda varredura pegou de novo o que a primeira reservou"},

 {"nome": "a reserva para de filtrar e a fila devolve o que ja saiu",
  "sql": troca('dem_avisos_pendentes', "where a.enviado_em is null\n       and (a.reservado_em is null",
                                       "where (a.reservado_em is null"),
  "espera": "5: aviso carimbado continua na fila"},

 {"nome": "o teto some e a varredura devolve a fila inteira",
  "sql": troca('dem_avisos_pendentes', "limit greatest(coalesce(p_limite, 50), 1)", "limit 1000"),
  "espera": "13: o limite da varredura nao foi respeitado"},

# `for update skip locked` -> `for update` NAO ESTA AQUI, E ISSO E DECISAO.
#
# Um bloco `do` roda numa sessao so, e numa sessao so as duas formas se
# comportam igual: nao ha com quem disputar a linha. Sabotagem que nao muda o
# resultado nao prova nada, e deixa-la na lista com um "ok" verde seria
# exatamente a mentira que esta bateria existe para pegar.
#
# Quem prova esse caso e `scripts/duas-varreduras.sh`, que abre DUAS sessoes de
# psql ao mesmo tempo contra o mesmo banco.

 # -------------------------------------------------- carimbo e devolucao
 {"nome": "carimbar passa a valer para quem ja tinha carimbo",
  "sql": troca('dem_aviso_enviado', "where id = any(coalesce(p_ids, '{}'::uuid[])) and enviado_em is null",
                                    "where id = any(coalesce(p_ids, '{}'::uuid[]))"),
  "espera": "5: carimbar duas vezes contou de novo"},

 {"nome": "a falha deixa de devolver o aviso para a fila",
  "sql": troca('dem_aviso_falhou', "set reservado_em = null,", "set reservado_em = now(),"),
  "espera": "5: o que falhou nao voltou para a fila"},

 # ------------------------------------- o aviso de quem pediu (regra 10)
 {"nome": "mudanca de estado para de avisar quem pediu",
  "sql": troca('fn_enfileirar_aviso',
               "elsif demandas.estado_do_pdf(new) is distinct from demandas.estado_do_pdf(old) then",
               "elsif false then", schema='demandas'),
  "espera": "6: mudanca de estado devia avisar quem pediu 1 vez, avisou 0"},

 {"nome": "quem mexeu volta a receber aviso do proprio gesto",
  "sql": troca('fn_enfileirar_aviso',
               "and demandas.limpo(coalesce(m.auth_email, m.email)) is not null\n       and m.id is distinct from v_quem;\n  return null;",
               "and demandas.limpo(coalesce(m.auth_email, m.email)) is not null;\n  return null;", schema='demandas'),
  "espera": "6: quem mexeu recebeu aviso do proprio gesto (o solicitante destravou)"},

 {"nome": "a trava por informacao vira aviso generico e a pergunta se perde",
  "sql": troca('fn_enfileirar_aviso', "v_nota := new.travada_nota;", "v_nota := null;", schema='demandas'),
  "espera": "7: o aviso nao leva a pergunta junto"},

 {"nome": "o estado do aviso volta a falar a lingua da tabela",
  "sql": troca('estado_do_pdf', "when d.status = 'travada' then 'Aguardando informações'",
                                "when d.status = 'travada' then 'Travada'", schema='demandas'),
  "espera": "7: o estado do aviso nao usa a palavra do documento"},

 # ------------------------------------------------ a etapa 5 do documento
 {"nome": "quem atende passa a validar o proprio trabalho",
  "sql": troca('dem_mover', "if not (d.aberta_por = m.id or m.papel in ('gestor','admin')) then\n      return jsonb_build_object('ok', false, 'erro', 'SO_QUEM_PEDIU'); end if;",
                            "if false then\n      return jsonb_build_object('ok', false, 'erro', 'SO_QUEM_PEDIU'); end if;"),
  "espera": "8: quem atende validou o proprio trabalho"},

 {"nome": "validar deixa de gravar quem validou",
  "sql": troca('dem_mover', "set validada_em = now(), validada_por = m.id", "set validada_em = now()"),
  "espera": "8: a validacao nao ficou gravada"},

 {"nome": "validar para de entrar no historico",
  "sql": troca('dem_mover', "values (d.id, m.id, 'validacao', m.nome, v_txt);", "values (d.id, m.id, 'comentario', m.nome, v_txt);"),
  "espera": "8: a validacao nao entrou no historico"},

 {"nome": "a guarda de ja validada some e da para validar duas vezes",
  "sql": troca('dem_mover', "if d.validada_em is not null then\n      return jsonb_build_object('ok', false, 'erro', 'JA_VALIDADA'); end if;",
                            "if false then\n      return jsonb_build_object('ok', false, 'erro', 'JA_VALIDADA'); end if;"),
  "espera": "8: validou duas vezes"},

 {"nome": "da para validar demanda que ninguem concluiu",
  "sql": troca('dem_mover', "if d.status <> 'concluida' then\n      return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_CONCLUIDA'); end if;",
                            "if false then\n      return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_CONCLUIDA'); end if;"),
  "espera": "9: validou uma demanda que nao esta concluida"},

 {"nome": "a ficha para de dizer quem validou",
  "sql": troca('dem_ver', "'validada_por', (select x.nome from demandas.membros x where x.id = d.validada_por),",
                          "'validada_por', null,"),
  "espera": "8: a ficha nao diz quem validou"},

 {"nome": "a lista para de saber que a demanda foi validada",
  "sql": troca('resumo', "'validada_em', d.validada_em);", "'validada_em', null);", schema='demandas'),
  "espera": "8: a ficha nao diz quando foi validada"},

 {"nome": "a demanda fechada volta a recusar validar",
  "sql": troca('dem_mover', "'desanexar','reabrir','validar')", "'desanexar','reabrir')"),
  "espera": "8: quem pediu nao conseguiu validar"},

 # ------------------------------------------------------- a porta publica
 {"nome": "a fila de avisos abre para a porta publica",
  "sql": "grant execute on function public.dem_avisos_pendentes(int) to anon;",
  "espera": "10: dem_avisos_pendentes esta aberta para a porta publica"},

 {"nome": "a fila de avisos abre para quem logou",
  "sql": "grant execute on function public.dem_avisos_pendentes(int) to authenticated;",
  "espera": "10: dem_avisos_pendentes esta aberta para quem logou"},

 {"nome": "o carimbo abre para quem logou",
  "sql": "grant execute on function public.dem_aviso_enviado(uuid[]) to authenticated;",
  "espera": "10: dem_aviso_enviado esta aberta"},

 {"nome": "a devolucao abre para a porta publica",
  "sql": "grant execute on function public.dem_aviso_falhou(uuid[], text) to anon;",
  "espera": "10: dem_aviso_falhou esta aberta"},

 {"nome": "a tabela de avisos, que tem email de gente dentro, abre para quem logou",
  "sql": "grant select on table demandas.avisos to authenticated;",
  "espera": "10: a tabela de avisos esta legivel pela porta publica"},

 {"nome": "a funcao que devolve o token de cada pessoa volta a ser publica",
  "sql": "grant execute on function demandas.quem(text) to public;",
  "espera": "11: demandas.quem continua devolvendo token para PUBLIC"},

 {"nome": "o a_avisar da 90 volta a existir sem ninguem para chamar",
  "sql": "create function demandas.a_avisar(p_limite int default 50) returns jsonb "
         "language sql stable as $x$ select '[]'::jsonb $x$;",
  "espera": "12: a_avisar da 90 continua existindo sem ninguem para chamar"},
]
