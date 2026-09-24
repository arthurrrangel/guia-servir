# A bateria da 96. Cada guarda da migracao tem aqui uma sabotagem que a
# desfaz, e a conferencia tem que reprovar nomeando o caso certo.
#
# A segunda administracao tem DUAS camadas na funcao (a pergunta antes de
# gravar e o `exception` que traduz o indice) e uma no banco (o indice). As
# duas da funcao sao sabotadas juntas: sozinha, cada uma deixaria a outra
# respondendo ADMIN_UNICO, e o caso passaria verde com meia guarda de pe
# (a mesma nota da bateria da 94). O indice tem sabotagem propria.
#
# O banco da bateria nasce sem ninguem: a conferencia cria a administracao
# dela, e so assim os casos que ESCREVERIAM na linha da administracao (a
# troca confirmada do e-mail, o pedido de papel, o proprio link) rodam.
RESTAURA = [67, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96]

CASOS = [
 # --------------------------------------------------------------- 1 e 2 · o banco
 {"nome": "o check volta a aceitar gestor",
  "sql": "alter table demandas.membros drop constraint ck_papel;\n"
         "alter table demandas.membros add constraint ck_papel "
         "check (papel in ('solicitante','lider','responsavel','gestor','admin'));",
  "espera": "1: o banco aceitou uma pessoa com o papel gestor"},

 {"nome": "o indice da administracao unica some",
  "sql": "drop index demandas.ux_membros_uma_administracao;",
  "espera": "2: o banco aceitou uma segunda administracao ativa"},

 # --------------------------------------------------------- 3 · dem_ajustar
 {"nome": "dem_ajustar esquece a gestao",
  "sql": troca('dem_ajustar',
               "if p_d->>'papel' = 'gestor' or (p_d ? 'escopo') or coalesce(p_d->>'escopo_total', '') = 'true' then "
               "return jsonb_build_object('ok', false, 'erro', 'SEM_GESTAO', 'campo', 'papel'); end if;",
               ""),
  "espera": "3: criar gestor nao foi SEM_GESTAO"},

 {"nome": "dem_ajustar recusa o papel e esquece o escopo",
  "sql": troca('dem_ajustar',
               "if p_d->>'papel' = 'gestor' or (p_d ? 'escopo') or coalesce(p_d->>'escopo_total', '') = 'true' then",
               "if p_d->>'papel' = 'gestor' then"),
  "espera": "3: dar escopo nao foi SEM_GESTAO"},

 {"nome": "dem_ajustar deixa nascer a segunda administracao (as duas camadas da funcao)",
  "sql": troca('dem_ajustar',
               "if v_papel = 'admin' and (x.id is null or x.papel is distinct from 'admin') then "
               "return jsonb_build_object('ok', false, 'erro', 'ADMIN_UNICO', 'campo', 'papel'); end if;",
               "")
         + "\n"
         + troca('dem_ajustar',
                 "if v_con = 'ux_membros_uma_administracao' then "
                 "return jsonb_build_object('ok', false, 'erro', 'ADMIN_UNICO', 'campo', 'papel'); end if;",
                 ""),
  "espera": "3: criar outra administracao nao foi ADMIN_UNICO"},

 {"nome": "o indice volta cru para a tela (sem o nome no exception)",
  "sql": troca('dem_ajustar',
               "if v_con = 'ux_membros_uma_administracao' then "
               "return jsonb_build_object('ok', false, 'erro', 'ADMIN_UNICO', 'campo', 'papel'); end if;",
               ""),
  "espera": "3: reativar a administracao antiga nao foi ADMIN_UNICO"},

 {"nome": "a guarda do ultimo administrador some",
  "sql": troca('dem_ajustar',
               "and not exists (select 1 from demandas.membros y where y.papel = 'admin' and y.ativo and y.id <> x.id) then "
               "return jsonb_build_object('ok', false, 'erro', 'ULTIMO_ADMIN'); end if;",
               "and false then return jsonb_build_object('ok', false, 'erro', 'ULTIMO_ADMIN'); end if;"),
  "espera": "3: a unica administracao deixou de ser"},

 {"nome": "a administracao pode ficar sem e-mail nenhum (entrando pelo de contato)",
  "sql": troca('dem_ajustar',
               "if v_ch is null then return jsonb_build_object('ok', false, 'erro', 'LOGIN_VAZIO', 'campo', 'auth_email'); end if;",
               ""),
  "espera": "3: a administracao que entra pelo e-mail de contato ficou sem e-mail"},

 {"nome": "o e-mail de entrar da administracao troca sem confirmacao",
  "sql": troca('dem_ajustar',
               "if coalesce(p_d->>'confirmar_login', '') <> 'true' then "
               "return jsonb_build_object('ok', false, 'erro', 'CONFIRMAR_LOGIN', 'campo', 'auth_email'); end if;",
               ""),
  "espera": "3: o e-mail de entrar da administracao mudou sem confirmacao"},

 {"nome": "esvaziar o e-mail de entrar troca o login pelo de contato, em silencio",
  "sql": troca('dem_ajustar',
               "if (p_d ? 'auth_email') and nullif(btrim(p_d->>'auth_email'), '') is null and x.auth_email is not null then "
               "return jsonb_build_object('ok', false, 'erro', 'LOGIN_VAZIO', 'campo', 'auth_email'); end if;",
               ""),
  "espera": "3: esvaziar o e-mail de entrar da administracao nao foi LOGIN_VAZIO"},

 {"nome": "e-mail com caractere invisivel volta a entrar",
  "sql": troca('dem_ajustar',
               "or btrim(p_d->>v_ch) ~ demandas.invisiveis()",
               "or false"),
  "espera": "3: e-mail de entrar com espaco de largura zero nao foi EMAIL_INVALIDO"},

 {"nome": "a confirmacao nunca basta (a administracao nao consegue trocar o proprio e-mail)",
  "sql": troca('dem_ajustar',
               "if coalesce(p_d->>'confirmar_login', '') <> 'true' then",
               "if true then"),
  "espera": "3: a troca confirmada do e-mail de entrar nao gravou"},

 {"nome": "aceitar o pedido de papel desfaz a administracao",
  "sql": troca('dem_ajustar',
               "if x.papel = 'admin' and x.ativo and coalesce(p_d->>'decisao','') = 'aceitar' then "
               "return jsonb_build_object('ok', false, 'erro', 'ULTIMO_ADMIN'); end if;",
               ""),
  "espera": "3: aceitar o pedido de papel da administracao a desfez"},

 {"nome": "a guarda do pedido barra tambem o recusar",
  "sql": troca('dem_ajustar',
               "if x.papel = 'admin' and x.ativo and coalesce(p_d->>'decisao','') = 'aceitar' then",
               "if x.papel = 'admin' and x.ativo then"),
  "espera": "3: recusar o pedido da administracao nao limpou o pedido"},

 {"nome": "o proprio link novo nao volta (a sessao cai)",
  "sql": troca('dem_ajustar',
               "if v_id = m.id then return jsonb_build_object('ok', true, 'id', v_id, 'token', v_ch); end if;",
               ""),
  "espera": "3: trocar o proprio link nao devolveu um link novo que entra"},

 {"nome": "o link de outra pessoa volta para quem trocou",
  "sql": troca('dem_ajustar',
               "if v_id = m.id then return jsonb_build_object('ok', true, 'id', v_id, 'token', v_ch); end if;",
               "return jsonb_build_object('ok', true, 'id', v_id, 'token', v_ch);"),
  "espera": "3: trocar o link de outra pessoa devolveu o link dela"},

 # --------------------------------------------------------- 4 · o panorama
 {"nome": "o panorama abre para quem atende",
  "sql": troca('dem_panorama',
               "if m.papel <> 'admin' then return jsonb_build_object('ok', false, 'erro', 'SO_ADMIN'); end if;",
               ""),
  "espera": "4: o panorama abriu para quem nao administra"},

 {"nome": "travadas passa a contar a que espera aprovacao",
  "sql": troca('dem_panorama',
               "'travadas', count(*) filter (where d.status = 'travada' and not demandas.falta_aprovacao(d)),",
               "'travadas', count(*) filter (where d.status = 'travada'),"),
  "espera": "4: as contas da operacao nao andaram com as tres demandas novas"},

 {"nome": "o que espera aprovacao perde o valor",
  "sql": troca('dem_panorama',
               "|| jsonb_build_object('motivo', 'aprovar', 'orcamento', (x.d).orcamento)",
               "|| jsonb_build_object('motivo', 'aprovar')"),
  "espera": "4: a demanda que espera aprovacao nao apareceu com o valor"},

 {"nome": "os setores passam a mostrar tambem quem so pede",
  "sql": troca('dem_panorama',
               "having (s.ativo and s.atende) or count(d.id) filter (where d.status in ('aberta','execucao','travada')) > 0",
               "having true"),
  "espera": "4: o setor que atende nao contou a fila e a aprovacao, ou o que so pede entrou"},

 {"nome": "a equipe do setor conta quem nao atende",
  "sql": troca('dem_panorama',
               "where p.ativo and p.papel = 'responsavel' and p.setor_id = s.id",
               "where p.ativo and p.setor_id = s.id"),
  "espera": "4: o setor de teste nao mostrou a equipe"},

 {"nome": "equipe sem setor volta a ser so quem nao tem setor",
  "sql": troca('dem_panorama',
               "and not exists (select 1 from demandas.setores s where s.id = p.setor_id and s.atende and s.ativo)",
               "and p.setor_id is null"),
  "espera": "4: a equipe num setor que nao atende nao contou como equipe sem setor"},

 {"nome": "as pessoas por papel contam a administracao desativada",
  "sql": troca('dem_panorama',
               "'admin', count(*) filter (where p.ativo and p.papel = 'admin'),",
               "'admin', count(*) filter (where p.papel = 'admin'),"),
  "espera": "4: as pessoas por papel nao dizem uma administracao e nenhuma gestao"},

 {"nome": "os ultimos movimentos esquecem quem fez",
  "sql": troca('dem_panorama',
               "'quem', (select p.nome from demandas.membros p where p.id = e.membro_id),",
               "'quem', null,"),
  "espera": "4: a abertura nao apareceu nos ultimos movimentos"},

 # --------------------------------------------------------- 5 · o aviso
 {"nome": "a abertura que espera aprovacao nao avisa a administracao",
  "sql": troca('fn_enfileirar_aviso',
               "if demandas.falta_aprovacao(new) then insert into demandas.avisos (demanda_id, membro_id, tipo, nota) "
               "select new.id, m.id, 'aprovar', new.travada_nota",
               "if false then insert into demandas.avisos (demanda_id, membro_id, tipo, nota) "
               "select new.id, m.id, 'aprovar', new.travada_nota", schema='demandas'),
  "espera": "5: a demanda que espera aprovacao nao avisou a administracao uma vez"},

 {"nome": "a administracao do setor recebe dois avisos da mesma demanda",
  "sql": troca('fn_enfileirar_aviso',
               "and not (m.papel = 'admin' and demandas.falta_aprovacao(new));",
               ";", schema='demandas'),
  "espera": "5: a administracao recebeu dois avisos da mesma demanda"},

 {"nome": "o aviso de aprovar vai para todo mundo",
  "sql": troca('fn_enfileirar_aviso',
               "select new.id, m.id, 'aprovar', new.travada_nota from demandas.membros m where m.papel = 'admin' and coalesce(m.ativo, true)",
               "select new.id, m.id, 'aprovar', new.travada_nota from demandas.membros m where coalesce(m.ativo, true)",
               schema='demandas'),
  "espera": "5: alguem alem da administracao recebeu o aviso de aprovar"},

 {"nome": "o aviso de aprovar sai de toda demanda nova",
  "sql": troca('fn_enfileirar_aviso',
               "if demandas.falta_aprovacao(new) then insert into demandas.avisos (demanda_id, membro_id, tipo, nota) "
               "select new.id, m.id, 'aprovar', new.travada_nota",
               "if true then insert into demandas.avisos (demanda_id, membro_id, tipo, nota) "
               "select new.id, m.id, 'aprovar', new.travada_nota", schema='demandas'),
  "espera": "5: houve aviso de aprovar de demanda que nao espera aprovacao"},

 {"nome": "o e-mail de aprovar perde o valor",
  "sql": troca('dem_avisos_pendentes',
               "'orcamento', d.orcamento,",
               ""),
  "espera": "5: o aviso de aprovar nao leva o valor para o e-mail"},

 # --------------------------------------------------------- 6 · o trabalho
 {"nome": "a fila passa a contar quem ja tem dono",
  "sql": troca('dem_panorama',
               "'na_fila', count(*) filter (where d.status = 'aberta' and d.responsavel_id is null and not demandas.falta_aprovacao(d)),",
               "'na_fila', count(*) filter (where d.status in ('aberta','execucao') and not demandas.falta_aprovacao(d)),"),
  "espera": "6: assumir nao tirou da fila e pos em execucao no panorama"},

 {"nome": "a carga esquece quem assumiu",
  "sql": troca('dem_panorama',
               "where d.status in ('aberta','execucao','travada') group by p.id",
               "where d.status in ('aberta','travada') group by p.id"),
  "espera": "6: quem assumiu nao apareceu na carga"},

 {"nome": "a confirmada continua em a confirmar",
  "sql": troca('dem_panorama',
               "'a_confirmar', count(*) filter (where d.status = 'concluida' and d.validada_em is null),",
               "'a_confirmar', count(*) filter (where d.status = 'concluida'),"),
  "espera": "6: a confirmada continuou em \"a confirmar\""},

 {"nome": "parada passa a ser cinco dias",
  "sql": troca('dem_panorama',
               "and d.mexida_em < now() - interval '7 days'),",
               "and d.mexida_em < now() - interval '5 days'),"),
  "espera": "6: a parada ha 8 dias nao contou, ou a de 6 contou"},

 {"nome": "os ultimos movimentos perdem a janela de 60 dias",
  "sql": troca('dem_panorama',
               "where x.em > now() - interval '60 days'",
               "where true"),
  "espera": "6: um movimento de 61 dias entrou nos ultimos movimentos"},

 {"nome": "a que passa a esperar aprovacao nao avisa",
  "sql": troca('fn_enfileirar_aviso',
               "if demandas.falta_aprovacao(new) and not demandas.falta_aprovacao(old) then",
               "if false then", schema='demandas'),
  "espera": "6: a demanda travada por aprovacao nao avisou a administracao, com o motivo"},

 {"nome": "a redirecionada que espera aprovacao manda os dois avisos para a administracao",
  "sql": troca('fn_enfileirar_aviso',
               "/* 96 · nem no setor trocado: a administracao tem o `aprovar` */ "
               "and not (m.papel = 'admin' and demandas.falta_aprovacao(new));",
               ";", schema='demandas'),
  "espera": "6: a redirecionada que espera aprovacao mandou o aviso de demanda nova para a administracao"},

 {"nome": "o setor desativado some do panorama com demanda viva",
  "sql": troca('dem_panorama',
               "having (s.ativo and s.atende) or count(d.id) filter (where d.status in ('aberta','execucao','travada')) > 0",
               "having s.ativo and (s.atende or count(d.id) filter (where d.status in ('aberta','execucao','travada')) > 0)"),
  "espera": "6: o setor desativado com demanda viva sumiu do panorama"},

 {"nome": "o panorama passa a mostrar o link pessoal de quem esta com demanda",
  "sql": troca('dem_panorama',
               "'id', c.id, 'nome', c.nome,",
               "'id', c.id, 'nome', c.nome, 'token', (select p2.token from demandas.membros p2 where p2.id = c.id),"),
  "espera": "6: o panorama carrega link pessoal, telefone ou e-mail"},

 {"nome": "o panorama passa a mostrar o telefone com outro nome de chave",
  "sql": troca('dem_panorama',
               "'id', c.id, 'nome', c.nome,",
               "'id', c.id, 'nome', c.nome, 'fone', (select p2.telefone from demandas.membros p2 where p2.id = c.id),"),
  "espera": "6: o panorama carrega link pessoal, telefone ou e-mail"},

 # --------------------------------------------------------- 7 · por fora
 {"nome": "anon ganha a tabela de pessoas",
  "sql": "grant select on demandas.membros to anon;",
  "espera": "7: anon alcanca a tabela de pessoas por fora"},
]
