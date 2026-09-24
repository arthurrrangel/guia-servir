/* A 96 NO BANCO QUE A SUITE ANTIGA DEIXOU.

   `demandas-banco.sh` roda a suite antiga (`demandas-banco.test.sql`) com a
   cadeia ate a 95, como a producao estava: ela tem uma administracao (Arthur)
   e duas gestoras (Joice, com escopo de tudo, e Gil, so da Comunicacao). Em
   seguida aplica a 96 duas vezes e roda ESTE arquivo, que confere o que a 96
   prometeu sobre gente de verdade, e nao so sobre as linhas CONF96 da
   conferencia:

     · quem era gestor virou membro, sem escopo, e o historico diz;
     · quem era gestor perdeu o alcance (Joice via tudo; agora so o dela);
     · a administracao nao ganha segunda, nem por engano, nem por fora;
     · a unica administracao nao se desfaz, nem pelo pedido de papel, nem
       pelo e-mail de entrar, e o proprio link novo volta para ela;
     · as demandas que estavam com quem era gestor voltaram para a fila;
     · quem aprova recebe o aviso de aprovar, com o valor;
     · o panorama e so dela, sem contato nem link, e as contas batem com as
       do Atendimento (`dem_portal`), que e a tela que ela ja usa.

   O estado de antes (demanda com gestora, pedido na linha da administracao)
   e montado por `demandas-banco.sh` antes de aplicar a 96, em
   `public._antes96`. */
\set ON_ERROR_STOP off
\pset pager off
\t on

create temp table res (n int generated always as identity, caso text, esperado text, deu text);
create function pg_temp.chk(p_caso text, p_esperado text, p_deu text) returns void
language plpgsql as $$ begin insert into res (caso, esperado, deu) values (p_caso, p_esperado, p_deu); end $$;
create function pg_temp.nd(p_titulo text) returns int
language sql stable as $$ select numero from demandas.demandas where titulo = p_titulo $$;
create function pg_temp.pid(p_token text) returns text
language sql stable as $$ select id::text from demandas.membros where token = p_token $$;

-- --------------------------------------------------------- quem era gestor
select pg_temp.chk('96: Joice, que era gestora de tudo, virou membro', 'solicitante',
  (select papel from demandas.membros where token = 'tk-gestor'));
select pg_temp.chk('96: Gil, gestor da Comunicacao, virou membro', 'solicitante',
  (select papel from demandas.membros where token = 'tk-gil'));
select pg_temp.chk('96: nao sobra gestor, escopo nem escopo total', '0/0/0',
  (select count(*) from demandas.membros where papel = 'gestor')::text || '/'
  || (select count(*) from demandas.gestao)::text || '/'
  || (select count(*) from demandas.membros where escopo_total)::text);
select pg_temp.chk('96: o historico da Joice diz gestor -> membro, sem autor (foi a migracao)', 'gestor>solicitante:sem autor',
  (select h.de || '>' || h.para || ':' || case when h.por is null then 'sem autor' else 'com autor' end
     from demandas.pessoas_historico h
    where h.membro_id = (select id from demandas.membros where token = 'tk-gestor')
      and h.tipo = 'papel' order by h.em desc limit 1));
select pg_temp.chk('96: quem era gestora perdeu os numeros de quem atende', 'SEM_PERMISSAO',
  public.dem_numeros('tk-gestor')->>'erro');
select pg_temp.chk('96: e deixou de ver a compra que outra pessoa pediu', 'NAO_EXISTE',
  public.dem_ver('tk-gestor', pg_temp.nd('Comprar cadeiras'))->>'erro');
select pg_temp.chk('96: e deixou de aprovar', 'false',
  (select demandas.pode_aprovar(m, d)::text from demandas.membros m, demandas.demandas d
    where m.token = 'tk-gestor' and d.titulo = 'Comprar cadeiras'));
select pg_temp.chk('96: a demanda em execucao com a Joice voltou para a fila', 'aberta/sem ninguem',
  (select d.status || '/' || case when d.responsavel_id is null then 'sem ninguem' else 'com alguem' end
     from demandas.demandas d where d.numero = (select numero from public._antes96 where caso = 'joice em execucao')));
select pg_temp.chk('96: a travada com a Joice continua travada, sem ninguem', 'travada/sem ninguem',
  (select d.status || '/' || case when d.responsavel_id is null then 'sem ninguem' else 'com alguem' end
     from demandas.demandas d where d.numero = (select numero from public._antes96 where caso = 'joice travada')));
select pg_temp.chk('96: e a ficha da demanda diz a troca, sem autor (foi a migracao)', 'bate',
  case when (select e.de || '>' || coalesce(e.para, 'ninguem') || ':'
                    || case when e.membro_id is null then 'sem autor' else 'com autor' end
               from demandas.eventos e join demandas.demandas d on d.id = e.demanda_id
              where d.numero = (select numero from public._antes96 where caso = 'joice em execucao')
                and e.tipo = 'responsavel' order by e.em desc, e.id desc limit 1)
            = (select nome from demandas.membros where token = 'tk-gestor') || '>ninguem:sem autor'
       then 'bate' else 'nao bate' end);
select pg_temp.chk('96: e quem pediu fica sabendo, por e-mail, que ela voltou para a fila', '1/aberta',
  (select count(*)::text || '/' || coalesce(max(d.status), '-')
     from demandas.avisos a
     join demandas.demandas d on d.id = a.demanda_id
    where d.numero = (select numero from public._antes96 where caso = 'joice em execucao')
      and a.tipo = 'status' and a.membro_id = pg_temp.pid('tk-lara')::uuid));
select pg_temp.chk('96: e a equipe de Compras pode assumir de novo', 'true',
  public.dem_mover('tk-compras', (select numero from public._antes96 where caso = 'joice em execucao'), 'assumir', '{}'::jsonb)->>'ok');
/* o escopo do Gil na hora da 96 e Compras: a suite antiga trocou o da
   Comunicacao por ele ("94: trocar o escopo inteiro") */
select pg_temp.chk('96: o historico do Gil diz os setores que ele acompanhava', 'bate',
  case when (select h.de || '>' || h.para from demandas.pessoas_historico h
              where h.membro_id = (select id from demandas.membros where token = 'tk-gil')
                and h.tipo = 'escopo' and h.para = 'nenhum' order by h.em desc, h.id desc limit 1)
            = (select nome from demandas.setores where slug = 'compras') || '>nenhum'
       then 'bate' else 'nao bate' end);
select pg_temp.chk('96: o historico da Joice diz que ela via tudo e agora nenhum', 'todos>nenhum',
  (select h.de || '>' || h.para from demandas.pessoas_historico h
    where h.membro_id = (select id from demandas.membros where token = 'tk-gestor')
      and h.tipo = 'escopo' and h.de = 'todos' order by h.em desc, h.id desc limit 1));
select pg_temp.chk('96: nenhum historico diz "setores escolhidos" depois da 96', '0',
  (select count(*) from demandas.pessoas_historico h
    where h.tipo = 'escopo' and h.para = 'escolhidos'
      and h.membro_id in (select id from demandas.membros where token in ('tk-gestor','tk-gil')))::text);
select pg_temp.chk('96: o pedido de papel na linha da administracao foi limpo', 'sem pedido',
  (select case when papel_pedido is null then 'sem pedido' else papel_pedido end
     from demandas.membros where token = 'tk-admin'));

-- ----------------------------------------------- a administracao recusa
select pg_temp.chk('96: criar uma gestora', 'SEM_GESTAO',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('nome', 'Nova Gestora 96', 'papel', 'gestor',
    'setor_id', (select id from demandas.setores where slug = 'compras')))->>'erro');
select pg_temp.chk('96: e ela nao nasceu', '0',
  (select count(*) from demandas.membros where nome = 'Nova Gestora 96')::text);
select pg_temp.chk('96: promover a equipe a gestora', 'SEM_GESTAO',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('id', pg_temp.pid('tk-com'), 'papel', 'gestor'))->>'erro');
select pg_temp.chk('96: dar escopo', 'SEM_GESTAO',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('id', pg_temp.pid('tk-com'),
    'escopo', jsonb_build_array((select id from demandas.setores where slug = 'compras'))))->>'erro');
select pg_temp.chk('96: dar escopo de tudo', 'SEM_GESTAO',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('id', pg_temp.pid('tk-com'), 'escopo_total', 'true'))->>'erro');
select pg_temp.chk('96: a equipe continua equipe', 'responsavel',
  (select papel from demandas.membros where token = 'tk-com'));
select pg_temp.chk('96: cadastrar uma segunda administracao', 'ADMIN_UNICO',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('nome', 'Outra Administracao 96', 'papel', 'admin',
    'setor_id', (select id from demandas.setores where slug = 'secretaria')))->>'erro');
select pg_temp.chk('96: promover um membro a administracao', 'ADMIN_UNICO',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('id', pg_temp.pid('tk-jovem'), 'papel', 'admin'))->>'erro');
select pg_temp.chk('96: promover a ex-gestora a administracao', 'ADMIN_UNICO',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('id', pg_temp.pid('tk-gestor'), 'papel', 'admin'))->>'erro');
select pg_temp.chk('96: continua uma administracao so', '1',
  (select count(*) from demandas.membros where papel = 'admin' and ativo)::text);
select pg_temp.chk('96: a administracao nao se rebaixa', 'ULTIMO_ADMIN',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('id', pg_temp.pid('tk-admin'), 'papel', 'responsavel'))->>'erro');
select pg_temp.chk('96: nem se desativa', 'ULTIMO_ADMIN',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('id', pg_temp.pid('tk-admin'), 'ativo', 'false'))->>'erro');
select pg_temp.chk('96: e continua podendo mudar os proprios dados', 'true',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('id', pg_temp.pid('tk-admin'), 'funcao', 'Administracao geral'))->>'ok');
/* acao e conferencia em DUAS instrucoes (a armadilha do cabecalho da suite
   antiga: numa so, a leitura ve a foto de antes da propria acao) */
select pg_temp.chk('96: Membro vira Lider (a administracao faz)', 'true',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('id', pg_temp.pid('tk-jovem'), 'papel', 'lider'))->>'ok');
select pg_temp.chk('96: e ficou Lider', 'lider', (select papel from demandas.membros where token = 'tk-jovem'));
select pg_temp.chk('96: e volta a Membro', 'true',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('id', pg_temp.pid('tk-jovem'), 'papel', 'solicitante'))->>'ok');
select pg_temp.chk('96: e ficou Membro', 'solicitante', (select papel from demandas.membros where token = 'tk-jovem'));
select pg_temp.chk('96: quem nao administra nem chega na regra', 'SO_ADMIN',
  public.dem_ajustar('tk-com', 'membro', jsonb_build_object('id', pg_temp.pid('tk-com'), 'papel', 'admin'))->>'erro');

-- ----------------------------------- a administracao nao se tranca para fora
select pg_temp.chk('96: a administracao sem e-mail de entrar', 'LOGIN_VAZIO',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('id', pg_temp.pid('tk-admin'), 'auth_email', '', 'email', ''))->>'erro');
select pg_temp.chk('96: trocar o e-mail de entrar pede confirmacao', 'CONFIRMAR_LOGIN',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('id', pg_temp.pid('tk-admin'), 'auth_email', 'arthur.novo@teste'))->>'erro');
select pg_temp.chk('96: e nada mudou', 'arthur@teste', (select auth_email from demandas.membros where token = 'tk-admin'));
select pg_temp.chk('96: o e-mail de contato nao e o de entrar: muda sem pergunta', 'true',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('id', pg_temp.pid('tk-admin'), 'email', 'contato@teste'))->>'ok');
select pg_temp.chk('96: mandar o mesmo e-mail de entrar nao e trocar', 'true',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('id', pg_temp.pid('tk-admin'), 'auth_email', ' Arthur@Teste '))->>'ok');
select pg_temp.chk('96: esvaziar o de entrar, com o de contato de pe, tambem nao', 'LOGIN_VAZIO',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('id', pg_temp.pid('tk-admin'), 'auth_email', ''))->>'erro');
select pg_temp.chk('96: e-mail com espaco de largura zero nao entra', 'EMAIL_INVALIDO',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('id', pg_temp.pid('tk-admin'), 'auth_email', 'arthur.novo@teste' || chr(8203)))->>'erro');
select pg_temp.chk('96: nem na ficha de outra pessoa', 'EMAIL_INVALIDO',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('id', pg_temp.pid('tk-lara'), 'auth_email', 'lara' || chr(8294) || '@teste'))->>'erro');
select pg_temp.chk('96: confirmado, troca', 'true',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('id', pg_temp.pid('tk-admin'), 'auth_email', 'arthur.novo@teste', 'confirmar_login', 'true'))->>'ok');
select set_config('teste.jwt', '{"email":"arthur.novo@teste"}', false);
select pg_temp.chk('96: e entra pelo e-mail novo', 'admin', (demandas.quem(null)).papel);
select set_config('teste.jwt', '', false);
select pg_temp.chk('96: e volta ao de antes (confirmado)', 'true',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('id', pg_temp.pid('tk-admin'), 'auth_email', 'arthur@teste', 'confirmar_login', 'true'))->>'ok');
select pg_temp.chk('96: a guarda e so da administracao: a equipe troca o login sem pergunta', 'true',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('id', pg_temp.pid('tk-lara'), 'auth_email', 'lara.nova@teste'))->>'ok');

-- ------------------------------------------------ o pedido e o link
update demandas.membros set papel_pedido = 'lider', papel_pedido_em = now() where token = 'tk-admin';
select pg_temp.chk('96: aceitar um pedido de papel da administracao', 'ULTIMO_ADMIN',
  public.dem_ajustar('tk-admin', 'pedido', jsonb_build_object('id', pg_temp.pid('tk-admin'), 'decisao', 'aceitar'))->>'erro');
select pg_temp.chk('96: e ela continua administracao', 'admin', (select papel from demandas.membros where token = 'tk-admin'));
select pg_temp.chk('96: recusar o pedido dela continua', 'true',
  public.dem_ajustar('tk-admin', 'pedido', jsonb_build_object('id', pg_temp.pid('tk-admin'), 'decisao', 'recusar'))->>'ok');
select pg_temp.chk('96: e o pedido sumiu', 'sem pedido',
  (select coalesce(papel_pedido, 'sem pedido') from demandas.membros where token = 'tk-admin'));
create temp table t_ids as select pg_temp.pid('tk-admin')::uuid adm, pg_temp.pid('tk-kids')::uuid kids;
create temp table t_link as
  select public.dem_ajustar('tk-admin', 'link', jsonb_build_object('id', (select adm from t_ids))) proprio;
select pg_temp.chk('96: trocar o proprio link devolve o link novo', 'true', (select (proprio ? 'token')::text from t_link));
select pg_temp.chk('96: o link novo entra', 'true', public.dem_quem_sou((select proprio->>'token' from t_link))->>'ok');
select pg_temp.chk('96: o antigo nao entra mais', 'SEM_ACESSO', public.dem_quem_sou('tk-admin')->>'erro');
update demandas.membros set token = 'tk-admin' where id = (select adm from t_ids);
select pg_temp.chk('96: trocar o link de outra pessoa nao devolve o link dela', 'true/sem link',
  (select (r->>'ok') || '/' || case when r ? 'token' then 'com link' else 'sem link' end
     from (select public.dem_ajustar('tk-admin', 'link', jsonb_build_object('id', (select kids from t_ids))) r) x));
update demandas.membros set token = 'tk-kids' where id = (select kids from t_ids);

-- ------------------------------------------------ por fora das funcoes
do $$ begin
  begin
    insert into demandas.membros (nome, papel, token) values ('Gestor por fora 96', 'gestor', 'tk-fora-96');
    perform pg_temp.chk('96: o banco recusa gestor por fora', 'recusou', 'aceitou');
  exception when check_violation then
    perform pg_temp.chk('96: o banco recusa gestor por fora', 'recusou', 'recusou');
  end;
  begin
    update demandas.membros set papel = 'admin' where token = 'tk-jovem';
    perform pg_temp.chk('96: o banco recusa segunda administracao por fora', 'recusou', 'aceitou');
  exception when unique_violation then
    perform pg_temp.chk('96: o banco recusa segunda administracao por fora', 'recusou', 'recusou');
  end;
end $$;

-- --------------------------------------------------------------- o panorama
select pg_temp.chk('96: panorama sem identidade', 'SEM_ACESSO', public.dem_panorama(null)->>'erro');
select pg_temp.chk('96: panorama para a equipe', 'SO_ADMIN', public.dem_panorama('tk-com')->>'erro');
select pg_temp.chk('96: panorama para a ex-gestora', 'SO_ADMIN', public.dem_panorama('tk-gestor')->>'erro');
select pg_temp.chk('96: panorama para o membro', 'SO_ADMIN', public.dem_panorama('tk-jovem')->>'erro');
select pg_temp.chk('96: panorama para a administracao', 'true', public.dem_panorama('tk-admin')->>'ok');
select pg_temp.chk('96: vivas = as vivas do banco', 'bate',
  case when (public.dem_panorama('tk-admin')->'operacao'->>'vivas')::int
            = (select count(*) from demandas.demandas where status in ('aberta','execucao','travada'))
       then 'bate' else 'nao bate' end);
select pg_temp.chk('96: na fila = a fila do Atendimento da administracao', 'bate',
  case when (public.dem_panorama('tk-admin')->'operacao'->>'na_fila')
            = (public.dem_portal('tk-admin')->'n'->>'fila') then 'bate' else 'nao bate' end);
select pg_temp.chk('96: aprovar = o que a administracao aprova no Atendimento', 'bate',
  case when (public.dem_panorama('tk-admin')->'operacao'->>'aprovar')
            = (public.dem_portal('tk-admin')->'n'->>'aprovar') then 'bate' else 'nao bate' end);
select pg_temp.chk('96: atrasadas = as atrasadas do Atendimento', 'bate',
  case when (public.dem_panorama('tk-admin')->'operacao'->>'atrasadas')
            = (public.dem_portal('tk-admin')->'n'->>'atrasadas') then 'bate' else 'nao bate' end);
select pg_temp.chk('96: a lista do que aprovar sao as cinquenta mais antigas', 'bate',
  case when (select coalesce(array_agg((x->>'numero')::int order by (x->>'numero')::int), '{}')
               from jsonb_array_elements(public.dem_panorama('tk-admin')->'aprovar') x)
            = (select coalesce(array_agg(numero order by numero), '{}') from (
                 select d.numero from demandas.demandas d
                  where d.status in ('aberta','execucao','travada') and demandas.falta_aprovacao(d)
                  order by d.criada_em limit 50) y)
       then 'bate' else 'nao bate' end);
select pg_temp.chk('96: a equipe de Compras e quem atende Compras', 'bate',
  case when (select (x->>'equipe')::int from jsonb_array_elements(public.dem_panorama('tk-admin')->'setores') x
              where x->>'nome' = (select nome from demandas.setores where slug = 'compras'))
            = (select count(*) from demandas.membros m
                where m.ativo and m.papel = 'responsavel'
                  and m.setor_id = (select id from demandas.setores where slug = 'compras'))
       then 'bate' else 'nao bate' end);
select pg_temp.chk('96: todo setor que atende esta no panorama', 'bate',
  case when (select count(*) from demandas.setores where ativo and atende)
            <= jsonb_array_length(public.dem_panorama('tk-admin')->'setores') then 'bate' else 'nao bate' end);
select pg_temp.chk('96: pessoas por papel: uma administracao, nenhuma gestao', '1/sem gestor',
  (public.dem_panorama('tk-admin')->'pessoas'->'por_papel'->>'admin')
  || '/' || case when (public.dem_panorama('tk-admin')->'pessoas'->'por_papel') ? 'gestor'
                 then 'com gestor' else 'sem gestor' end);
/* o que o panorama MONTA nao tem contato nem link; o que alguem DIGITOU
   (titulo, comentario) vem como foi escrito, e o `demandas-banco.sh` poe um
   comentario com o e-mail e o telefone da administracao de proposito (R15B) */
select pg_temp.chk('96: o panorama nao carrega link, telefone nem e-mail', 'limpo',
  case when (select jsonb_path_exists(z.p, '$.** ? (exists (@.token) || exists (@.telefone) || exists (@.email) || exists (@.auth_email))')
                    or jsonb_build_object('o', z.p->'operacao', 's', z.p->'setores', 'p', z.p->'pessoas', 'c', z.p->'carga',
                         'a', (select jsonb_agg(x - array['titulo','texto','travada_nota','nota','descricao']) from jsonb_array_elements(z.p->'aprovar') x),
                         'f', (select jsonb_agg(x - array['titulo','texto','travada_nota','nota','descricao']) from jsonb_array_elements(z.p->'fila') x),
                         'r', (select jsonb_agg(x - array['titulo','texto','de','para']) from jsonb_array_elements(z.p->'recentes') x))::text
                       ~ 'tk-admin|tk-com|tk-gestor|tk-gil|553190000|@teste'
               from (select public.dem_panorama('tk-admin') p) z)
       then 'vazou' else 'limpo' end);
select pg_temp.chk('96: e o comentario digitado aparece como foi escrito', 'aparece',
  case when exists (select 1 from jsonb_array_elements(public.dem_panorama('tk-admin')->'recentes') x
                     where x->>'texto' = 'me chama no arthur@teste ou no 5531900000001')
       then 'aparece' else 'sumiu' end);
select pg_temp.chk('96: os ultimos movimentos vem do mais novo para o mais velho', 'em ordem',
  case when (select bool_and(a.em >= b.em) from (
               select (x->>'em')::timestamptz em, row_number() over () i
                 from jsonb_array_elements(public.dem_panorama('tk-admin')->'recentes') x) a
             join (select (x->>'em')::timestamptz em, row_number() over () i
                     from jsonb_array_elements(public.dem_panorama('tk-admin')->'recentes') x) b
               on b.i = a.i + 1) is not false then 'em ordem' else 'fora de ordem' end);

-- ------------------------------------------------ quem aprova fica sabendo
select pg_temp.chk('96: o Membro abre uma compra que precisa de aprovacao', 'true',
  public.dem_abrir('tk-jovem', jsonb_build_object('titulo', 'Compra de teste 96', 'descricao', 'x',
    'categoria_id', (select id from demandas.categorias where nome = 'Compra de equipamentos'),
    'prazo', (current_date + 20)::text, 'orcamento', '2500,50'))->>'ok');
select pg_temp.chk('96: a administracao recebe o aviso de aprovar, uma vez, com o motivo do portao', '1/com motivo',
  (select count(*)::text || '/' || case when bool_and(a.nota is not null) then 'com motivo' else 'sem motivo' end
     from demandas.avisos a
    where a.demanda_id = (select id from demandas.demandas where titulo = 'Compra de teste 96')
      and a.membro_id = pg_temp.pid('tk-admin')::uuid and a.tipo = 'aprovar'));
select pg_temp.chk('96: e so ela recebe o de aprovar', '0',
  (select count(*) from demandas.avisos a
    where a.demanda_id = (select id from demandas.demandas where titulo = 'Compra de teste 96')
      and a.tipo = 'aprovar' and a.membro_id <> pg_temp.pid('tk-admin')::uuid)::text);
select pg_temp.chk('96: o e-mail sai com o valor', '2500.50',
  (select x->>'orcamento' from jsonb_array_elements(public.dem_avisos_pendentes(100000)) x
    where x->>'titulo' = 'Compra de teste 96' and x->>'tipo' = 'aprovar'));
select pg_temp.chk('96: o Membro abre uma arte, que nao precisa de aprovacao', 'true',
  public.dem_abrir('tk-jovem', jsonb_build_object('titulo', 'Arte de teste 96', 'descricao', 'x',
    'categoria_id', (select id from demandas.categorias where nome = 'Criação de arte'),
    'prazo', (current_date + 20)::text))->>'ok');
select pg_temp.chk('96: e ela nao gera aviso de aprovar', '0',
  (select count(*) from demandas.avisos a join demandas.demandas d on d.id = a.demanda_id
    where a.tipo = 'aprovar' and d.titulo = 'Arte de teste 96')::text);
select pg_temp.chk('96: mas avisa a equipe da Comunicacao, como sempre', 'avisou',
  case when exists (select 1 from demandas.avisos a join demandas.demandas d on d.id = a.demanda_id
                     where a.tipo = 'nova' and d.titulo = 'Arte de teste 96'
                       and a.membro_id = pg_temp.pid('tk-com')::uuid) then 'avisou' else 'nao avisou' end);

-- ----------------------------------------- o setor desativado com demanda viva
update demandas.setores set ativo = false where slug = 'comunicacao';
select pg_temp.chk('96: o setor desativado com demanda viva continua no panorama, dizendo que foi desativado', 'false',
  (select x->>'ativo' from jsonb_array_elements(public.dem_panorama('tk-admin')->'setores') x
    where x->>'nome' = (select nome from demandas.setores where slug = 'comunicacao')));
select pg_temp.chk('96: e a soma dos setores bate com as vivas', 'bate',
  case when (select sum((x->>'vivas')::int) from jsonb_array_elements(public.dem_panorama('tk-admin')->'setores') x)
            = (select count(*) from demandas.demandas d where d.status in ('aberta','execucao','travada'))
       then 'bate' else 'nao bate' end);
update demandas.setores set ativo = true where slug = 'comunicacao';

-- ------------------------------------------------------------------ veredito
select n, caso, esperado, deu, case when deu = esperado then 'ok' else 'FALHOU' end as v from res order by n;
\set ON_ERROR_STOP on
do $veredito$
declare v_n int; v_total int; d text;
begin
  select count(*) filter (where deu is distinct from esperado), count(*)
    into v_n, v_total from res;
  if v_n = 0 then
    raise notice 'demandas-banco-96: %/% casos.', v_total, v_total;
    return;
  end if;
  select string_agg(format(E'\n  x %s: esperava %L, veio %L', r.caso, r.esperado, r.deu), '' order by r.n)
    into d from res r where r.deu is distinct from r.esperado;
  raise exception 'DEMANDAS-BANCO-96 REPROVOU: % de % casos', v_n, v_total
    using detail = d, errcode = 'raise_exception';
end $veredito$;
