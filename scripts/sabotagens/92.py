# A bateria da 92. Cada conserto do arquivo tem aqui uma sabotagem que o desfaz
# no corpo VIVO da funcao, e a conferencia tem que reprovar nomeando o caso.
#
# Conserto sem sabotagem e conferencia por enfeite: o verde nao prova nada
# porque ninguem tentou fazer ficar vermelho.
RESTAURA = [84, 85, 86, 87, 88, 89, 90, 91, 92]

CASOS = [
 # ------------------------------------------------- a classe de invisiveis
 {"nome": "a classe encolhe e o plano de tags volta a passar",
  # o buraco medido na 91: 4096 pontos em U+E0000-E0FFF, dos quais ela
  # conhecia 97. Voltar a conhecer so um deles e voltar a 91.
  "sql": troca('classe_zero', "chr(917504) || '-' || chr(921599)", "chr(917505)", schema='demandas'),
  "espera": "1: a classe de invisiveis deixa passar"},

 {"nome": "o vao invisivel passa a sumir em vez de virar espaco",
  "sql": troca('uma_linha', "'[' || demandas.classe_vao() || ']+', ' ', 'g')",
                            "'[' || demandas.classe_vao() || ']+', '', 'g')", schema='demandas'),
  "espera": "1: o vao invisivel devia virar UM espaco"},

 {"nome": "a lista de reordenadores perde os overrides",
  "sql": troca('reordenadores', "chr(8234) || '-' || chr(8238)", "chr(8238)", schema='demandas'),
  "espera": "1: o override bidirecional (U+202A a U+202E) continua passando pelo meio"},

 {"nome": "a lista de reordenadores perde os isolamentos",
  # o defeito da 89 em miniatura: a lista tem dois pedacos e so um cresceu.
  "sql": troca('reordenadores', "chr(8294) || '-' || chr(8297)", "chr(8294)", schema='demandas'),
  "espera": "1: o isolamento bidirecional (U+2066 a U+2069) continua passando pelo meio"},

 # ------------------------------------------- o titulo e a descricao (A3/A4)
 {"nome": "uma_linha para de apagar o invisivel de largura zero, e o Trojan Source volta",
  "sql": troca('uma_linha',
               "pg_catalog.regexp_replace(coalesce(t, ''), '[' || demandas.classe_zero() || ']+', '', 'g')",
               "coalesce(t, '')", schema='demandas'),
  "espera": "2: o reordenador bidirecional sobreviveu no meio do titulo"},

 {"nome": "o invisivel de largura zero vira espaco em vez de sumir",
  "sql": troca('uma_linha', "'[' || demandas.classe_zero() || ']+', '', 'g')",
                            "'[' || demandas.classe_zero() || ']+', ' ', 'g')", schema='demandas'),
  "espera": "2: o titulo gravado nao e o titulo legivel"},

 {"nome": "o titulo volta a ser gravado com a regra da descricao",
  "sql": troca('dem_abrir', "demandas.uma_linha(p_d->>'titulo'), demandas.limpo(p_d->>'descricao')",
                            "demandas.limpo(p_d->>'titulo'), demandas.limpo(p_d->>'descricao')"),
  "espera": "4: dois titulos visualmente iguais nao viraram o mesmo texto"},

 {"nome": "a descricao passa a ser gravada com a regra do titulo",
  "sql": troca('dem_abrir',
               "demandas.uma_linha(p_d->>'titulo'), demandas.limpo(p_d->>'descricao'), demandas.limpo(p_d->>'objetivo'),",
               "demandas.uma_linha(p_d->>'titulo'), demandas.uma_linha(p_d->>'descricao'), demandas.limpo(p_d->>'objetivo'),"),
  "espera": "3: a quebra de linha legitima da descricao foi apagada"},

 {"nome": "limpo() para de matar o reordenador no meio do texto",
  "sql": troca('limpo', "pg_catalog.regexp_replace(coalesce(t, ''), demandas.reordenadores(), '', 'g')",
                        "coalesce(t, '')", schema='demandas'),
  "espera": "3: a descricao aceita reordenador bidirecional"},

 # ------------------------------------------------------- o teto do setor (A5)
 {"nome": "o teto deixa de nascer vazio e passa a valer para todo setor novo",
  # NULL e o unico valor que preserva o comportamento da 91 byte a byte.
  "sql": "alter table demandas.setores alter column teto_sem_aprovacao set default 100;",
  "espera": "5: com teto NULL a demanda devia nascer aberta e sem aprovacao"},

 {"nome": "dem_abrir volta a olhar so a flag da categoria",
  "sql": troca('dem_abrir', "v_exige := c.exige_aprovacao or (v_teto is not null",
                            "v_exige := c.exige_aprovacao or (false and v_teto is not null"),
  "espera": "6: o valor acima do teto devia nascer travado por aprovacao"},

 {"nome": "a resposta de dem_abrir volta a contar o portao da categoria",
  "sql": troca('dem_abrir', "'precisa_aprovacao', v_exige,", "'precisa_aprovacao', c.exige_aprovacao,"),
  "espera": "6: dem_abrir nao avisou que o valor precisa de aprovacao"},

 {"nome": "falta_aprovacao volta a ignorar o valor",
  "sql": troca('falta_aprovacao',
               "and s.teto_sem_aprovacao is not null and coalesce(d.orcamento, 0) > s.teto_sem_aprovacao",
               "and false", schema='demandas'),
  "espera": "6: falta_aprovacao nao soma o teto do setor"},

 {"nome": "dem_ajustar recebe o teto e nao grava",
  "sql": troca('dem_ajustar',
               "then replace(nullif(p_d->>'teto_sem_aprovacao',''), ',', '.')::numeric else teto_sem_aprovacao end,",
               "then teto_sem_aprovacao else teto_sem_aprovacao end,"),
  "espera": "5: o teto gravado nao e o teto enviado"},

 {"nome": "o teto deixa de ser validado como dinheiro",
  # sem a guarda, `'quinhentos'::numeric` levanta 22P02 cru: o `exception` de
  # dem_ajustar so pega chave estrangeira, nulo, unique e check.
  "sql": troca('dem_ajustar', "and p_d->>'teto_sem_aprovacao' !~ '^[0-9]+([.,][0-9]{1,2})?$' then",
                              "and false then"),
  "espera": "7: teto que nao e numero passou"},

 {"nome": "dem_bases esconde o teto e a tela fica escrevendo no escuro",
  "sql": troca('dem_bases', "'teto_sem_aprovacao', s.teto_sem_aprovacao) order by s.ordem, s.nome)",
                            "'teto_sem_aprovacao', null) order by s.ordem, s.nome)"),
  "espera": "7: dem_bases nao devolve o teto que o admin definiu"},

 # ---------------------------------------- dem_ajustar grava o que validou (A7)
 {"nome": "dem_ajustar volta a validar com limpo e gravar com btrim",
  "sql": troca('dem_ajustar',
               "values (demandas.uma_linha(p_d->>'grupo'), demandas.uma_linha(p_d->>'nome'), nullif(p_d->>'setor_id','')::uuid,",
               "values (btrim(p_d->>'grupo'), btrim(p_d->>'nome'), nullif(p_d->>'setor_id','')::uuid,"),
  "espera": "8: nome com invisivel furou o UNIQUE da categoria"},

 # ------------------------------------------------------------- url_boa (A8)
 {"nome": "o guarda do arroba volta a olhar a autoridade crua",
  "sql": troca('url_boa', "and demandas.autoridade_lida(u) !~ '@'",
                          "and demandas.url_autoridade(u) !~ '@'", schema='demandas'),
  "espera": "9: o arroba escrito como %40 continua passando"},

 {"nome": "a decodificacao vira uma passada so e o escape duplo escapa",
  "sql": troca('autoridade_lida',
               "demandas.url_percent(demandas.url_percent(demandas.url_autoridade(u)))",
               "demandas.url_percent(demandas.url_autoridade(u))", schema='demandas'),
  "espera": "9: o arroba escrito duas vezes continua passando"},

 {"nome": "url_host volta a ler o host escrito em vez do host de verdade",
  "sql": troca('url_host', "pg_catalog.regexp_replace(demandas.autoridade_lida(u), '^[^@]*@', '')",
                           "pg_catalog.regexp_replace(demandas.url_autoridade(u), '^[^@]*@', '')",
               schema='demandas'),
  "espera": "9: IP com o ultimo octeto escapado continua passando"},

 {"nome": "a autoridade volta a poder conter barra escapada",
  "sql": troca('url_boa', "and demandas.autoridade_lida(u) !~ '[/?#]'", "and true", schema='demandas'),
  "espera": "9: barra escapada dentro da autoridade continua passando"},

 {"nome": "a decodificacao passa a julgar a URL inteira e derruba link legitimo",
  # o contrapeso: sem este caso, a bateria premiaria qualquer regra mais dura,
  # inclusive as que recusam `%20` no caminho de um link do Google Docs.
  "sql": troca('url_boa', "and u !~ demandas.invisiveis()",
                          "and demandas.url_percent(u) !~ demandas.invisiveis()", schema='demandas'),
  "espera": "9: a decodificacao derrubou link legitimo"},

 # --------------------------------------------- travar por aprovacao (A9)
 {"nome": "a guarda do travar volta ao `=` e cai no NULL",
  "sql": troca('dem_mover',
               "and coalesce(d.aprovacao, 'aprovada') is not distinct from 'aprovada' and m.papel not in ('gestor','admin') then",
               "and d.aprovacao = 'aprovada' and m.papel not in ('gestor','admin') then"),
  "espera": "10: quem atende travou por aprovacao uma demanda sem portao"},

 {"nome": "a guarda passa a barrar tambem quem decide",
  "sql": troca('dem_mover',
               "and coalesce(d.aprovacao, 'aprovada') is not distinct from 'aprovada' and m.papel not in ('gestor','admin') then",
               "and coalesce(d.aprovacao, 'aprovada') is not distinct from 'aprovada' then"),
  "espera": "10: o gestor perdeu o direito de travar por aprovacao"},

 # ------------------------------------------------- as CHECK conferidas (A10)
 {"nome": "uma CHECK volta a valer so para linha nova",
  "sql": "alter table demandas.demandas drop constraint ck_prazo;\n"
         "alter table demandas.demandas add constraint ck_prazo\n"
         "  check (prazo is not null or demandas.limpo(sem_prazo_porque) is not null) not valid;",
  "espera": "11: sobraram 1 CHECK"},

 # -------------------------------------- o veredito de permissao (A11)
 {"nome": "pode_ver volta a devolver NULL",
  "sql": troca('pode_ver',
               "select coalesce( m.papel in ('gestor','admin') or d.aberta_por = m.id"
               " or (m.setor_id is not null and (d.setor_solicitante = m.setor_id"
               " or d.setor_responsavel = m.setor_id)), false);",
               "select m.papel in ('gestor','admin') or d.aberta_por = m.id"
               " or (m.setor_id is not null and (d.setor_solicitante = m.setor_id"
               " or d.setor_responsavel = m.setor_id));", schema='demandas'),
  "espera": "12: pode_ver devolve NULL em vez de false"},

 {"nome": "pode_atender volta a devolver NULL",
  "sql": troca('pode_atender',
               "select coalesce( m.papel in ('gestor','admin')"
               " or (m.papel = 'responsavel' and m.setor_id is not null"
               " and d.setor_responsavel = m.setor_id), false);",
               "select m.papel in ('gestor','admin')"
               " or (m.papel = 'responsavel' and m.setor_id is not null"
               " and d.setor_responsavel = m.setor_id);", schema='demandas'),
  "espera": "12: pode_atender devolve NULL em vez de false"},

 # ------------------------------------------------ um setor, um nome (A12)
 {"nome": "o nome do setor volta a poder repetir",
  "sql": "drop index demandas.ux_dem_setores_nome;",
  "espera": "13: dois setores com o mesmo nome entraram"},

 # ------------------------------- destravar com valor, e o gatilho (A13)
 {"nome": "destravar recebe o valor e nao grava",
  "sql": troca('dem_mover', "set orcamento = replace(p_d->>'orcamento', ',', '.')::numeric",
                            "set orcamento = orcamento"),
  "espera": "14: o valor informado na resposta nao foi gravado"},

 {"nome": "o valor de destravar deixa de ser validado",
  "sql": troca('dem_mover', "if p_d->>'orcamento' !~ '^[0-9]+([.,][0-9]{1,2})?$' then", "if false then"),
  "espera": "14: orcamento que nao e numero passou por destravar"},

 {"nome": "destravar volta a soltar em vez de trocar de portao",
  "sql": troca('dem_mover',
               "set status = case when demandas.falta_aprovacao(d) then 'travada'"
               " when responsavel_id is null then 'aberta' else 'execucao' end,"
               " travada_por = case when demandas.falta_aprovacao(d) then 'aprovacao' else null end,",
               "set status = case when responsavel_id is null then 'aberta' else 'execucao' end,"
               " travada_por = null,"),
  "espera": "15: o valor acima do teto devia trocar de portao"},

 {"nome": "o ramo morto de titulo volta para o gatilho",
  "sql": troca('fn_historico', "if new.orcamento is distinct from old.orcamento then",
               "if new.titulo is distinct from old.titulo then\n"
               "    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para)\n"
               "      values (new.id, v_m, 'titulo', old.titulo, new.titulo);\n"
               "  end if;\n"
               "  if new.orcamento is distinct from old.orcamento then", schema='demandas'),
  "espera": "16: fn_historico ainda registra mudanca de titulo"},

 {"nome": "o ramo de orcamento sai junto com os dois mortos",
  "sql": troca('fn_historico', "if new.orcamento is distinct from old.orcamento then",
                               "if new.orcamento is not distinct from old.orcamento then",
               schema='demandas'),
  "espera": "16: o ramo de orcamento saiu junto"},

 # ---------------------------------------------------------- dem_numeros
 {"nome": "o cast cego da data volta",
  "sql": troca('dem_numeros',
               "if demandas.limpo(p_de) is null then v_de := demandas.hoje() - 90; else"
               " if demandas.limpo(p_de) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then"
               " return jsonb_build_object('ok', false, 'erro', 'PERIODO_INVALIDO', 'campo', 'de'); end if;"
               " begin v_de := demandas.limpo(p_de)::date;"
               " exception when invalid_datetime_format or datetime_field_overflow then"
               " return jsonb_build_object('ok', false, 'erro', 'PERIODO_INVALIDO', 'campo', 'de');"
               " end; end if;",
               "v_de := coalesce(p_de::date, demandas.hoje() - 90);"),
  "espera": "17: dem_numeros levantou"},

 {"nome": "a assinatura antiga volta e as duas viram ambiguidade no PostgREST",
  "sql": "create function public.dem_numeros(p_token text, p_de date default null, "
         "p_ate date default null) returns jsonb language sql stable as $x$ select '{}'::jsonb $x$;",
  "espera": "17: a assinatura antiga de dem_numeros continua la"},

 {"nome": "o periodo invertido da 88 para de avisar",
  "sql": troca('dem_numeros', "if v_de > v_ate then return jsonb_build_object('ok', false, 'erro', 'PERIODO_INVERTIDO'); end if;",
                              "if false then return jsonb_build_object('ok', false, 'erro', 'PERIODO_INVERTIDO'); end if;"),
  "espera": "17: o periodo invertido da 88 parou de avisar"},

 {"nome": "a funcao passa a ignorar o periodo que recebeu",
  "sql": troca('dem_numeros', "v_de := demandas.limpo(p_de)::date;", "v_de := demandas.hoje() - 90;"),
  "espera": "17: a funcao nao usou o periodo que recebeu"},

 {"nome": "a assinatura nova fecha para quem entra pelo link pessoal",
  # a armadilha real desta migracao: assinatura nova nasce sem grant, e quem usa
  # Demandas pelo link e `anon` para o PostgREST. O sintoma seria "permission
  # denied for function" numa tela que funcionava.
  "sql": "revoke execute on function public.dem_numeros(text,text,text) from anon;",
  "espera": "17: dem_numeros fechou para quem entra pelo link pessoal"},

 {"nome": "a assinatura nova fecha para quem entra pelo login",
  "sql": "revoke execute on function public.dem_numeros(text,text,text) from authenticated;",
  "espera": "17: dem_numeros fechou para quem entra pelo login"},

 # ------------------------------------------------- o alcance do TRUNCATE (A15)
 {"nome": "quem logou ganha TRUNCATE numa tabela de Demandas",
  # o achado da auditoria era sobre 22 tabelas de `public`, que sao do sistema
  # de escalas e nao desta casa. O que esta migracao pode medir e o alcance: se
  # um dia alcancar Demandas, este caso acusa.
  "sql": "grant truncate on table demandas.avisos to authenticated;",
  "espera": "18: a porta publica pode esvaziar tabela de Demandas"},

 {"nome": "uma tabela de Demandas nasce em public, onde o TRUNCATE alcanca",
  "sql": "create table public.dem_fantasma (id int);",
  "espera": "18: apareceu tabela de Demandas em `public`"},
]
