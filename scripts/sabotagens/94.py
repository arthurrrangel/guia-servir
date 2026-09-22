# A bateria da 94. Cada guarda nova da migracao tem aqui uma sabotagem que a
# desfaz no corpo VIVO da funcao, e a conferencia tem que reprovar nomeando o
# caso certo. Conserto sem sabotagem e conferencia por enfeite.
#
# Os quatro ataques do pedido tem sabotagem propria:
#   A (usuario A na demanda do usuario B) ......... casos pode_ver e participa
#   B (profissional do setor A no setor B) ......... pode_ver, no_escopo
#   C (usuario comum na area administrativa) ....... dem_pessoas
#   D (usuario mudando o proprio papel) ............ dem_perfil, dem_cadastrar
#
# DUAS GUARDAS AQUI SAO EM CAMADA, E A BATERIA SABOTA AS DUAS JUNTAS: o
# "ja cadastrado" (a consulta de `dem_cadastrar` E o indice unico mais o
# gatilho cruzado) e o telefone repetido (a consulta E o indice). Sabotar so
# uma camada deixaria a outra respondendo o mesmo codigo, e o caso passaria
# verde com meia guarda de pe. Isso e a defesa em profundidade funcionando, e
# nao a conferencia cega; por isso as sabotagens de camada unica nao estao
# aqui, e as de camada dupla estao.
RESTAURA = [67, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94]

CASOS = [
 # ---------------------------------------------------------------- A · pode_ver
 {"nome": "pode_ver volta a dar o setor inteiro para qualquer papel",
  "sql": troca('pode_ver',
               "or (m.papel = 'responsavel' and m.setor_id is not null and d.setor_responsavel = m.setor_id)",
               "or (m.setor_id is not null and (d.setor_solicitante = m.setor_id or d.setor_responsavel = m.setor_id))",
               schema='demandas'),
  "espera": "1: solicitante via a demanda de outro solicitante do mesmo setor"},

 {"nome": "pode_ver esquece quem foi incluido",
  "sql": troca('pode_ver', "or demandas.participa(m, d)", "", schema='demandas'),
  "espera": "2: o participante incluido nao ve a demanda"},

 {"nome": "pode_ver esquece o lider",
  "sql": troca('pode_ver',
               "or (m.papel = 'lider' and m.setor_id is not null and d.setor_solicitante = m.setor_id)",
               "", schema='demandas'),
  "espera": "3: o lider nao ve o que o proprio ministerio pediu"},

 {"nome": "o lider deixa de falar por quem pediu",
  "sql": troca('pede',
               "or (m.papel = 'lider' and m.setor_id is not null and d.setor_solicitante = m.setor_id)",
               "", schema='demandas'),
  "espera": "4: o lider do ministerio que pediu nao consegue validar"},

 {"nome": "o ramo de quem atende deixa de pedir o papel",
  "sql": troca('pode_ver',
               "or (m.papel = 'responsavel' and m.setor_id is not null and d.setor_responsavel = m.setor_id)",
               "or (m.setor_id is not null and d.setor_responsavel = m.setor_id)",
               schema='demandas'),
  "espera": "6: solicitante cadastrado num setor que atende ve a fila do setor"},

 # --------------------------------------------------------- participante
 {"nome": "qualquer um que ve passa a incluir gente",
  "sql": troca('dem_mover',
               "elsif p_acao = 'incluir' then if not (demandas.pede(m, d) or demandas.pode_atender(m, d) or demandas.gere(m, d)) then",
               "elsif p_acao = 'incluir' then if false then"),
  "espera": "2: o participante incluiu mais gente"},

 {"nome": "o participante passa a cancelar",
  "sql": troca('dem_mover',
               "if not (demandas.pode_atender(m, d) or demandas.pede(m, d) or demandas.gere(m, d)) then return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if; if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'MOTIVO_VAZIO');",
               "if not (demandas.pode_atender(m, d) or demandas.pede(m, d) or demandas.gere(m, d) or demandas.participa(m, d)) then return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if; if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'MOTIVO_VAZIO');"),
  "espera": "2: o participante cancelou a demanda de outra pessoa"},

 # --------------------------------------------------------- avisos e portal
 {"nome": "os avisos deixam de esconder o comentario interno",
  "sql": troca('avisos_de', "and (not e.interno or demandas.pode_atender(m, d))", "", schema='demandas'),
  "espera": "4: o comentario interno apareceu nos avisos de quem pediu"},

 {"nome": "o portal esquece a demanda que espera resposta",
  "sql": troca('espera_pedido',
               "when d.status = 'travada' and d.travada_por = 'informacao' and not demandas.falta_aprovacao(d) then 'responder'",
               "", schema='demandas'),
  "espera": "4: o portal nao conta a demanda que espera resposta de quem pediu"},

 # ------------------------------------------------ o contato do setor
 {"nome": "o contato do setor volta a aceitar quem so pede",
  "sql": troca('contato_do_setor', "and x.papel in ('responsavel','gestor','admin')", "", schema='demandas'),
  "espera": "7: o contato do setor apontou para quem so pede"},

 # ------------------------------------------------------- B · escopo
 {"nome": "o escopo do gestor deixa de valer",
  "sql": troca('no_escopo',
               "and (m.escopo_total or exists (select 1 from demandas.gestao g where g.membro_id = m.id and g.setor_id = p_setor))",
               "", schema='demandas'),
  "espera": "8: o gestor de um setor ve demanda fora do escopo"},

 # ------------------------------------------- C · area administrativa
 {"nome": "a base de pessoas abre para a lideranca",
  "sql": troca('dem_pessoas', "if m.papel <> 'admin' then", "if m.papel not in ('gestor','admin') then"),
  "espera": "9: a base de pessoas abriu para quem nao administra"},

 # --------------------------------------------- D · o proprio papel
 {"nome": "o perfil passa a aceitar a chave papel",
  "sql": troca('dem_perfil', "if v_k not in ('nome','telefone','funcao','papel_pedido') then",
                             "if v_k not in ('nome','telefone','funcao','papel_pedido','papel') then"),
  "espera": "10: o perfil aceitou a chave papel"},

 {"nome": "o cadastro passa a aceitar e gravar o papel pedido na chamada",
  "sql": troca('dem_cadastrar', "if v_k not in ('nome','telefone','setor_id','funcao','papel_pedido') then",
                                "if v_k not in ('nome','telefone','setor_id','funcao','papel_pedido','papel') then")
         + "\n" + troca('dem_cadastrar', "v_setor, 'solicitante', v_fun,",
                                         "v_setor, coalesce(p_d->>'papel', 'solicitante'), v_fun,"),
  "espera": "11: o cadastro aceitou a chave papel"},

 {"nome": "o cadastro deixa de exigir login",
  "sql": troca('dem_cadastrar', "if v_email is null then return jsonb_build_object('ok', false, 'erro', 'SEM_LOGIN'); end if;",
                                "if false then return null; end if;"),
  "espera": "11: cadastrou sem login"},

 {"nome": "gestor pode nascer sem escopo",
  "sql": troca('dem_ajustar', "if v_n = 0 then return jsonb_build_object('ok', false, 'erro', 'ESCOPO_VAZIO', 'campo', 'escopo'); end if;",
                              "if false then return null; end if;"),
  "espera": "10: virou gestor sem escopo nenhum"},

 # ------------------------------------------- uma pessoa, uma linha
 {"nome": "o telefone deixa de ter forma unica (e a consulta passa a comparar cru)",
  "sql": troca('fn_membro_antes', "new.telefone := demandas.tel(new.telefone);",
               "new.telefone := nullif(regexp_replace(coalesce(new.telefone, ''), '[^0-9]', '', 'g'), '');",
               schema='demandas')
         + "\n" + troca('dem_cadastrar',
               "if exists (select 1 from demandas.membros x where x.ativo and x.telefone = v_tel) then",
               "if exists (select 1 from demandas.membros x where x.ativo and x.telefone = regexp_replace(coalesce(p_d->>'telefone',''), '[^0-9]', '', 'g')) then"),
  "espera": "11: o cadastro aceitou o telefone de outra pessoa ativa, escrito de outro jeito"},

 {"nome": "quem ja existe ganha segunda linha (consulta E gatilho cruzado desligados)",
  "sql": troca('dem_cadastrar', "if m.id is not null and m.ativo then return jsonb_build_object('ok', false, 'erro', 'JA_CADASTRADO'); end if;",
                                "if false then return null; end if;")
         + "\n" + troca('fn_membro_antes',
               "if new.auth_email is not null and exists ( select 1 from demandas.membros x where x.id <> new.id and lower(x.email) = new.auth_email) then",
               "if false then", schema='demandas'),
  "espera": "11: quem ja estava cadastrado ganhou uma segunda linha"},

 {"nome": "o login deixa de achar quem foi cadastrado pelo e-mail",
  "sql": troca('quem', "select * into m from demandas.membros where auth_email is null and lower(email) = v_email and ativo;",
                       "null;", schema='demandas'),
  "espera": "11: quem o administrador cadastrou pelo e-mail nao entra com esse e-mail"},

 {"nome": "o mesmo nome entra sem confirmar",
  "sql": troca('dem_ajustar', "if v_lista is not null then return jsonb_build_object('ok', false, 'erro', 'HOMONIMO', 'quem', v_lista); end if;",
                              "if false then return null; end if;"),
  "espera": "12: o mesmo nome entrou sem ninguem confirmar"},

 # --------------------------------------------------- o teto por hora
 {"nome": "o teto por hora some",
  "sql": troca('dem_abrir', "if m.papel in ('solicitante','lider') and (select count(*) from demandas.demandas x",
                            "if false and (select count(*) from demandas.demandas x"),
  "espera": "13: a decima primeira demanda da mesma hora nasceu"},

 {"nome": "o teto por hora pega a equipe",
  "sql": troca('dem_abrir', "if m.papel in ('solicitante','lider') and (select count(*) from demandas.demandas x",
                            "if (select count(*) from demandas.demandas x"),
  "espera": "13: o teto pegou a equipe"},

 # --------------------------------------------- nada fora das funcoes
 {"nome": "o schema demandas ganha USAGE para anon",
  "sql": "grant usage on schema demandas to anon;",
  "espera": "14: anon tem USAGE no schema demandas"},

 {"nome": "uma tabela nova fica legivel para anon",
  "sql": "grant usage on schema demandas to anon; grant select on demandas.participantes to anon;",
  "espera": "14: anon le tabela do schema demandas"},
]
