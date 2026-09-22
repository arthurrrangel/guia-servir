/* As regras do PDF, conferidas no banco. Roda contra um Postgres 16
   descartável com a migração 50 já aplicada, num banco RECÉM-CRIADO.

   O que este arquivo protege, em uma frase: as onze regras da seção 8 do
   documento não podem depender de nenhuma tela lembrar delas. Se o banco
   aceita uma demanda urgente sem impacto, a regra não existe — existe um
   comentário.

   UMA ARMADILHA DE TESTE, ANOTADA PORQUE ME PEGOU: ação e conferência têm
   que ser DUAS instruções. Num `select` só, o Postgres lê a foto tirada no
   começo da instrução, então `dem_mover(...) || (select status ...)` devolve
   o status de ANTES da própria ação e o teste passa dizendo nada.

   E os números das demandas têm buracos de propósito: uma abertura recusada
   por regra já consumiu o número da sequência. Por isso aqui tudo é buscado
   pelo título, nunca por `numero = 2`. */
\set ON_ERROR_STOP off
\pset pager off
\t on

create temp table res (n int generated always as identity, caso text, esperado text, deu text);
create function chk(p_caso text, p_esperado text, p_deu text) returns void
language plpgsql as $$ begin insert into res (caso, esperado, deu) values (p_caso, p_esperado, p_deu); end $$;
/* atalho: o número da demanda pelo título */
create function nd(p_titulo text) returns int
language sql stable as $$ select numero from demandas.demandas where titulo = p_titulo $$;
create function st(p_titulo text) returns text
language sql stable as $$ select status from demandas.demandas where titulo = p_titulo $$;

-- ----------------------------------------------------------------- gente ---
do $$
declare s_com uuid; s_jov uuid; s_sec uuid; s_cpr uuid;
begin
  select id into s_com from demandas.setores where slug = 'comunicacao';
  select id into s_jov from demandas.setores where slug = 'jovens';
  select id into s_sec from demandas.setores where slug = 'secretaria';
  select id into s_cpr from demandas.setores where slug = 'compras';

  insert into demandas.membros (nome, auth_email, telefone, papel, setor_id, token) values
    ('Arthur Rangel',  'arthur@teste',  '5531900000001', 'admin',        s_sec, 'tk-admin'),
    ('Joice Bianca',   'joice@teste',   '5531900000002', 'gestor',       s_sec, 'tk-gestor'),
    ('Monik Ribeiro',  'monik@teste',   '5531900000003', 'responsavel',  s_com, 'tk-com'),
    ('Jander Souza',   null,            '5531900000004', 'responsavel',  s_cpr, 'tk-compras'),
    ('Pedro Jovens',   null,            '5531900000005', 'solicitante',  s_jov, 'tk-jovem'),
    ('Ana Kids',       null,            '5531900000006', 'solicitante',
       (select id from demandas.setores where slug = 'kids'), 'tk-kids');
  /* A 94 DEU ESCOPO AO GESTOR, E ESTA LINHA DIZ QUAL E O DA JOICE.

     Ate a 93, gestor via e aprovava tudo, sempre, e por isso este arquivo
     nunca precisou dizer o escopo dela. Na 94 o gestor nasce SEM escopo
     (`escopo_total = false`, nenhum setor em `demandas.gestao`), porque
     "gestor de tudo" passou a ser uma decisao de quem administra, e nao um
     efeito colateral do papel. Sem esta linha, 15 casos daqui reprovam, todos
     do gestor: ela deixa de ver, aprovar, redirecionar e contar.

     Os gestores que JA EXISTIAM quando a 94 entrou recebem `escopo_total =
     true` na propria migracao; esta fixture nasce depois dela, por isso diz
     por escrito. */
  update demandas.membros set escopo_total = true where token = 'tk-gestor';
end $$;

-- 1 ------------------------------------------ as duas portas de entrada ---
select chk('quem sou pelo link pessoal', 'Pedro Jovens',
  public.dem_quem_sou('tk-jovem')->>'nome');

select set_config('teste.jwt', '{"email":"joice@teste"}', false);
select chk('quem sou pelo e-mail do login', 'gestor', public.dem_quem_sou(null)->>'papel');
select set_config('teste.jwt', '{"email":"ninguem@teste"}', false);
select chk('e-mail que nao e de ninguem', 'SEM_ACESSO', public.dem_quem_sou(null)->>'erro');
select set_config('teste.jwt', '', false);
select chk('link que nao existe', 'SEM_ACESSO', public.dem_quem_sou('tk-inventado')->>'erro');

-- 2 --------------------------------- o exemplo da seção 10, palavra por ---
/* "Divulgação do Culto de Celebração", Ministério de Jovens, Comunicação. */
select chk('abre a demanda do exemplo do PDF', 'true',
  (public.dem_abrir('tk-jovem', jsonb_build_object(
     'titulo','Divulgação do Culto de Celebração',
     'descricao','Criar e divulgar uma arte para o Culto de Celebração, que acontecerá no próximo sábado.',
     'categoria_id',(select id from demandas.categorias where nome='Criação de arte'),
     'prioridade','alta',
     'publico','Jovens e membros da igreja',
     'evento','Culto de Celebração', 'evento_data',(current_date + 12)::text,
     'prazo',(current_date + 8)::text))->>'ok'));

select chk('nasce roteada para Comunicacao, sem ninguem triar', 'Comunicação',
  (public.dem_ver('tk-jovem', nd('Divulgação do Culto de Celebração'))->'demanda')->>'responsavel_setor');

-- 3 ------------------------------------------- as regras da seção 8 ------
select chk('sem prazo e sem justificativa: recusa', 'REGRA',
  (public.dem_abrir('tk-jovem', jsonb_build_object(
     'titulo','Sem prazo', 'descricao','x',
     'categoria_id',(select id from demandas.categorias where nome='Limpeza')))->>'erro'));

select chk('sem prazo COM justificativa: aceita', 'true',
  (public.dem_abrir('tk-jovem', jsonb_build_object(
     'titulo','Limpeza da sala', 'descricao','x',
     'sem_prazo_porque','Depende da agenda do pastor',
     'categoria_id',(select id from demandas.categorias where nome='Limpeza')))->>'ok'));

select chk('urgente sem impacto: recusa', 'REGRA',
  (public.dem_abrir('tk-jovem', jsonb_build_object(
     'titulo','Urgente cru', 'descricao','x', 'prioridade','urgente', 'prazo',(current_date + 6)::text,
     'categoria_id',(select id from demandas.categorias where nome='Suporte de som')))->>'erro'));

select chk('urgente com impacto: aceita', 'true',
  (public.dem_abrir('tk-jovem', jsonb_build_object(
     'titulo','Som mudo no domingo', 'descricao','x', 'prioridade','urgente',
     'impacto','Sem som nao tem culto', 'prazo',(current_date + 6)::text,
     'categoria_id',(select id from demandas.categorias where nome='Suporte de som')))->>'ok'));

select chk('evento sem data: recusa', 'REGRA',
  (public.dem_abrir('tk-jovem', jsonb_build_object(
     'titulo','Evento solto', 'descricao','x', 'prazo',(current_date + 16)::text, 'evento','Congresso',
     'categoria_id',(select id from demandas.categorias where nome='Reserva de espaço')))->>'erro'));

select chk('numero pulado por abertura recusada nao vira buraco de dado', 'true',
  (select (count(*) = 3)::text from demandas.demandas));

-- 4 ---------------------------------- aprovação vem da categoria, sozinha ---
select public.dem_abrir('tk-jovem', jsonb_build_object(
  'titulo','Comprar cadeiras', 'descricao','30 cadeiras', 'prazo',(current_date + 26)::text,
  'orcamento','4500',
  'categoria_id',(select id from demandas.categorias where nome='Compra de equipamentos')));

select chk('compra nasce travada esperando aprovacao', 'travada/aprovacao/pendente',
  (select status||'/'||travada_por||'/'||aprovacao from demandas.demandas where titulo='Comprar cadeiras'));

select chk('assumir antes da aprovacao: recusa', 'FALTA_APROVACAO',
  public.dem_mover('tk-compras', nd('Comprar cadeiras'), 'assumir')->>'erro');

select chk('quem nao e gestor nao aprova', 'SO_GESTOR',
  public.dem_mover('tk-jovem', nd('Comprar cadeiras'), 'aprovar')->>'erro');

select public.dem_mover('tk-gestor', nd('Comprar cadeiras'), 'aprovar',
  '{"texto":"Aprovado com o orcamento apresentado."}'::jsonb);
select chk('gestor aprova e a demanda destrava', 'aberta/aprovada',
  (select status||'/'||aprovacao from demandas.demandas where titulo='Comprar cadeiras'));

-- 5 ----------------------------------------------- permissão por setor ---
/* quem VE mas nao ATENDE: o proprio solicitante */
select chk('quem pediu nao assume o atendimento', 'NAO_E_SEU_SETOR',
  public.dem_mover('tk-jovem', nd('Divulgação do Culto de Celebração'), 'assumir')->>'erro');
/* quem nem ve: setor que nao e nem solicitante nem responsavel */
-- 'NAO_EXISTE' E NAO 'SEM_ACESSO', DESDE A MIGRACAO 86.
-- A diferenca entre as duas respostas contava, para quem tivesse qualquer
-- token valido, quantas demandas a igreja tem e em que ritmo nascem, porque
-- `numero` e sequencial. Medido: varrendo de 1 a 22 com um token de outro
-- setor, 21 vazios e 1 'SEM_ACESSO', e a contagem real do banco era
-- exatamente 1. As duas portas passaram a responder igual.
select chk('setor de fora nem enxerga', 'NAO_EXISTE',
  public.dem_mover('tk-compras', nd('Divulgação do Culto de Celebração'), 'assumir')->>'erro');

select public.dem_mover('tk-com', nd('Divulgação do Culto de Celebração'), 'assumir');
select chk('setor certo assume', 'execucao', st('Divulgação do Culto de Celebração'));

-- 6 --------------------------------------------- conclusão precisa dizer ---
select chk('concluir sem dizer o que foi feito: recusa', 'CONCLUSAO_VAZIA',
  public.dem_mover('tk-com', nd('Divulgação do Culto de Celebração'), 'concluir')->>'erro');

select public.dem_mover('tk-com', nd('Divulgação do Culto de Celebração'), 'concluir',
  '{"texto":"Arte publicada no feed e nos stories."}'::jsonb);
select chk('concluir dizendo: aceita', 'concluida', st('Divulgação do Culto de Celebração'));

-- 7 ------------------------------------------- o histórico se escreve só ---
/* Ninguém inseriu evento de status na mão. O gatilho gravou. */
select chk('gatilho gravou abertura, responsavel, dois status', '4',
  (select count(*)::text from demandas.eventos
    where demanda_id = (select id from demandas.demandas where titulo='Divulgação do Culto de Celebração')));
select chk('e a troca de status aparece com os dois lados', 'execucao>concluida',
  (select de||'>'||para from demandas.eventos e
    where e.demanda_id = (select id from demandas.demandas where titulo='Divulgação do Culto de Celebração')
      and e.tipo='status' order by e.id desc limit 1));

-- 8 --------------------------------------------------------- reabertura ---
select public.dem_mover('tk-jovem', nd('Divulgação do Culto de Celebração'), 'reabrir',
  '{"texto":"A arte saiu com a data errada."}'::jsonb);
select chk('quem pediu pode reabrir', 'execucao/1',
  (select status||'/'||reaberturas from demandas.demandas where titulo='Divulgação do Culto de Celebração'));
select chk('reabrir limpa a conclusao', 'sim',
  (select case when conclusao is null and concluida_em is null then 'sim' else 'nao' end
     from demandas.demandas where titulo='Divulgação do Culto de Celebração'));

-- 9 ---------------------------------------------------- quem vê o quê ---
select chk('solicitante de outro setor nao ve nada', '0',
  jsonb_array_length(public.dem_lista('tk-kids','{}'::jsonb)->'itens')::text);
select chk('quem pediu ve as quatro que abriu ate aqui', '4',
  jsonb_array_length(public.dem_lista('tk-jovem','{}'::jsonb)->'itens')::text);
select chk('o gestor ve tudo', '4',
  jsonb_array_length(public.dem_lista('tk-gestor','{}'::jsonb)->'itens')::text);
select chk('a fila do meu setor', '1',
  jsonb_array_length(public.dem_lista('tk-com','{"aba":"setor"}'::jsonb)->'itens')::text);
-- idem: ver o comentario do caso "setor de fora nem enxerga"
select chk('demanda que nao e minha: sem acesso', 'NAO_EXISTE',
  public.dem_ver('tk-kids', nd('Divulgação do Culto de Celebração'))->>'erro');

-- 10 --------------------------------- o tempo até a primeira resposta ---
select chk('primeira resposta marcada por quem NAO abriu', 'sim',
  (select case when primeira_resposta_em is not null then 'sim' else 'nao' end
     from demandas.demandas where titulo='Divulgação do Culto de Celebração'));
select chk('e NAO e marcada pela propria pessoa que abriu', 'sim',
  (select case when primeira_resposta_em is null then 'sim' else 'nao' end
     from demandas.demandas where titulo='Som mudo no domingo'));

-- 11 ------------------------------------------------ prioridade revisada ---
/* "a prioridade não deve ser definida apenas pelo solicitante" */
select chk('solicitante nao mexe na prioridade', 'NAO_E_SEU_SETOR',
  public.dem_mover('tk-jovem', nd('Divulgação do Culto de Celebração'), 'prioridade',
    '{"prioridade":"urgente"}'::jsonb)->>'erro');
select chk('quem atende revisa, e urgente sem impacto esbarra na regra', 'REGRA',
  public.dem_mover('tk-com', nd('Divulgação do Culto de Celebração'), 'prioridade',
    '{"prioridade":"urgente"}'::jsonb)->>'erro');
select public.dem_mover('tk-com', nd('Divulgação do Culto de Celebração'), 'prioridade',
  '{"prioridade":"urgente","texto":"O culto e sabado"}'::jsonb);
select chk('urgente com impacto passa', 'urgente',
  (select prioridade from demandas.demandas where titulo='Divulgação do Culto de Celebração'));

-- 12 ------------------------------------------------------- redirecionar ---
select chk('nao da para jogar num setor que nao atende', 'SETOR_NAO_ATENDE',
  public.dem_mover('tk-gestor', nd('Divulgação do Culto de Celebração'), 'redirecionar',
    jsonb_build_object('setor',(select id from demandas.setores where slug='kids')))->>'erro');
select public.dem_mover('tk-gestor', nd('Divulgação do Culto de Celebração'), 'redirecionar',
  jsonb_build_object('setor',(select id from demandas.setores where slug='tecnologia')));
select chk('redirecionar para setor que atende', 'Tecnologia e audiovisual',
  (select s.nome from demandas.demandas d join demandas.setores s on s.id=d.setor_responsavel
    where d.titulo='Divulgação do Culto de Celebração'));
select chk('redirecionar solta o responsavel antigo', 'sim',
  (select case when responsavel_id is null then 'sim' else 'nao' end
     from demandas.demandas where titulo='Divulgação do Culto de Celebração'));

-- 13 ------------------------------------------------ comentário interno ---
select public.dem_mover('tk-gestor', nd('Divulgação do Culto de Celebração'), 'comentar',
  '{"texto":"combinar com o pastor antes","interno":true}'::jsonb);
select chk('comentario interno some para quem pediu', 'nao',
  (select case when public.dem_ver('tk-jovem', nd('Divulgação do Culto de Celebração'))::text
                    like '%combinar com o pastor%' then 'sim' else 'nao' end));
select chk('e aparece para quem atende', 'sim',
  (select case when public.dem_ver('tk-gestor', nd('Divulgação do Culto de Celebração'))::text
                    like '%combinar com o pastor%' then 'sim' else 'nao' end));
select public.dem_mover('tk-jovem', nd('Som mudo no domingo'), 'comentar',
  '{"texto":"alguem viu a mesa de som?","interno":true}'::jsonb);
select chk('solicitante nao consegue marcar comentario como interno', 'false',
  (select interno::text from demandas.eventos
    where demanda_id = (select id from demandas.demandas where titulo='Som mudo no domingo')
      and tipo = 'comentario' order by id desc limit 1));

-- 13b ------------------------------------------- uma que de fato atrasou ---
/* Para medir atraso o teste precisa de uma demanda com prazo REALMENTE
   vencido, e o banco aceita prazo no passado de propósito: demanda registrada
   depois do fato existe.

   E TODOS OS OUTROS PRAZOS DESTE ARQUIVO SÃO RELATIVOS A `current_date`, POR
   CAUSA DO QUE ACONTECEU EM 21/09/2026. Eles eram datas absolutas, escritas
   em 18/09 com o comentário "o prazo 20/09 do som mudo ainda não venceu
   hoje". No dia 21 a frase deixou de ser verdade sozinha, sem ninguém tocar
   em uma linha de código: o "som mudo" virou atrasado também, `atrasadas`
   passou de 1 para 2, e o caso 46 reprovou.

   Ninguém viu, porque `scripts/demandas-banco.sh` imprimia a tabela e saía
   com código 0 — os 62 casos deste arquivo eram decorativos no CI. As duas
   coisas foram corrigidas juntas, e é o par que importa: fixture que depende
   do calendário é bomba-relógio, e harness que não falha é o detonador
   silencioso. */
select public.dem_abrir('tk-jovem', jsonb_build_object(
  'titulo','Trocar a lampada do corredor', 'descricao','x',
  'prazo',(current_date - 5)::text,
  'categoria_id',(select id from demandas.categorias where nome='Reparo elétrico')));

-- 14 ------------------------------------------------------------ números ---
select chk('numeros: o solicitante nao abre', 'SEM_PERMISSAO', public.dem_numeros('tk-jovem')->>'erro');
select chk('numeros: total do gestor', '5', (public.dem_numeros('tk-gestor')->'numeros')->>'total');
select chk('numeros: nenhuma concluida agora', '0', (public.dem_numeros('tk-gestor')->'numeros')->>'concluidas');
select chk('numeros: uma reaberta', '1', (public.dem_numeros('tk-gestor')->'numeros')->>'reabertas');
select chk('numeros: uma atrasada', '1',
  (public.dem_numeros('tk-gestor')->'numeros')->>'atrasadas');
select chk('numeros: por categoria tem linha', 'sim',
  case when jsonb_array_length((public.dem_numeros('tk-gestor')->'numeros')->'por_categoria') > 0
       then 'sim' else 'nao' end);
select chk('numeros: motivo de atraso aparece', 'sim',
  case when jsonb_array_length((public.dem_numeros('tk-gestor')->'numeros')->'motivos_de_atraso') > 0
       then 'sim' else 'nao' end);

-- 15 ------------------------------------------------------------ ajustes ---
select chk('so admin ajusta', 'SO_ADMIN',
  public.dem_ajustar('tk-gestor','setor','{"nome":"Novo"}'::jsonb)->>'erro');
select chk('admin cria categoria', 'true',
  public.dem_ajustar('tk-admin','categoria', jsonb_build_object(
    'grupo','Comunicação e divulgação','nome','Legenda de corte',
    'setor_id',(select id from demandas.setores where slug='comunicacao'),
    'prazo_padrao_dias',3))->>'ok');
select chk('e ela ja aparece no formulario', 'sim',
  case when public.dem_bases('tk-jovem')::text like '%Legenda de corte%' then 'sim' else 'nao' end);
/* CADASTRAR PESSOA, que e o que a tela Ajustes faz primeiro e este arquivo
   nunca tinha feito. Em producao o pgcrypto mora em `extensions`, fora do
   search_path curto de `dem_ajustar`; ate a 58, este caso caia com
   "function gen_random_bytes(integer) does not exist" -- e o harness, com o
   pgcrypto em `public`, nao teria visto. Agora o harness espelha a producao
   e este caso existe. */
select chk('admin cadastra pessoa', 'true',
  public.dem_ajustar('tk-admin','membro', jsonb_build_object(
    'nome','Pessoa Cadastrada Pela Tela','papel','solicitante',
    'setor_id',(select id from demandas.setores where slug='jovens')))->>'ok');
select chk('e ela nasce com token de 24 hex', '24',
  (select length(token)::text from demandas.membros where nome = 'Pessoa Cadastrada Pela Tela'));
select chk('e o token e hexadecimal', 'sim',
  (select case when token ~ '^[0-9a-f]{24}$' then 'sim' else 'nao' end
     from demandas.membros where nome = 'Pessoa Cadastrada Pela Tela'));

-- 16 ---------------------------------------------------------- travar ---
select chk('travar sem motivo valido: recusa', 'MOTIVO_INVALIDO',
  public.dem_mover('tk-gestor', nd('Limpeza da sala'), 'travar',
    '{"motivo":"porque sim","texto":"x"}'::jsonb)->>'erro');
select chk('travar so quem atende', 'NAO_E_SEU_SETOR',
  public.dem_mover('tk-jovem', nd('Limpeza da sala'), 'travar',
    '{"motivo":"informacao","texto":"x"}'::jsonb)->>'erro');
select public.dem_mover('tk-gestor', nd('Limpeza da sala'), 'travar',
  '{"motivo":"informacao","texto":"Qual sala precisa de limpeza?"}'::jsonb);
select chk('travada por falta de informacao', 'travada/informacao',
  (select status||'/'||travada_por from demandas.demandas where titulo='Limpeza da sala'));
select public.dem_mover('tk-jovem', nd('Limpeza da sala'), 'destravar',
  '{"texto":"E a sala 3, no primeiro andar."}'::jsonb);
select chk('quem pediu destrava respondendo', 'aberta',  st('Limpeza da sala'));
select chk('e a resposta dele entrou no historico', 'sim',
  (select case when count(*) > 0 then 'sim' else 'nao' end from demandas.eventos
    where demanda_id = (select id from demandas.demandas where titulo='Limpeza da sala')
      and texto like '%sala 3%'));

-- 17 --------------------------------- travada por aprovacao nao destrava ---
-- O ORCAMENTO ENTROU AQUI, E NAO E ENFEITE.
-- `Reembolso` tem `exige_orcamento = true` desde a migracao 50, e ate a 86
-- NENHUMA linha do banco olhava para essa coluna. Desde a 86 ela e cobrada, e
-- esta demanda simplesmente nao nascia — derrubando este caso e os tres
-- seguintes em cadeia, sem que nenhum deles fosse sobre orcamento.
select public.dem_abrir('tk-jovem', jsonb_build_object(
  'titulo','Reembolso do combustivel', 'descricao','x', 'prazo',(current_date + 17)::text,
  'orcamento','180.00',
  'categoria_id',(select id from demandas.categorias where nome='Reembolso')));
select chk('reembolso tambem nasce esperando aprovacao', 'travada/aprovacao',
  (select status||'/'||travada_por from demandas.demandas where titulo='Reembolso do combustivel'));
-- O GESTOR ENXERGA TUDO, entao para ele a resposta continua sendo a guarda de
-- aprovacao e nao o oraculo: `pode_ver` devolve verdadeiro para gestor e admin
-- em qualquer setor, por desenho. Eu supus o contrario ao atualizar este
-- arquivo e o proprio teste me corrigiu, que e para isso que ele existe.
select chk('ninguem destrava por fora o que espera aprovacao', 'FALTA_APROVACAO',
  public.dem_mover('tk-gestor', nd('Reembolso do combustivel'), 'destravar',
    '{"texto":"vamos tocar"}'::jsonb)->>'erro');
select chk('e quem ATENDE tambem nao destrava o que espera aprovacao', 'FALTA_APROVACAO',
  public.dem_mover('tk-jovem', nd('Reembolso do combustivel'), 'destravar',
    '{"texto":"vamos tocar"}'::jsonb)->>'erro');
-- quem recusa tem que ENXERGAR a demanda: o gestor do setor dela
select public.dem_mover('tk-admin', nd('Reembolso do combustivel'), 'rejeitar',
  '{"texto":"Falta a nota fiscal."}'::jsonb);
select chk('rejeitar encerra com motivo', 'cancelada',  st('Reembolso do combustivel'));

-- 18 ------------------------------------- o token de todo mundo, e a porta ---
/* `dem_pessoas` E A FUNCAO QUE DEVOLVE O TOKEN DE CADA MEMBRO, E O TOKEN E A
   CREDENCIAL INTEIRA: `demandas.quem()` aceita qualquer um e devolve a pessoa.
   Uma unica linha separa isso de qualquer `responsavel` --

     if m.papel <> 'admin' then return ... 'SO_ADMIN'; end if;

   -- e ate 22/09/2026 NENHUM caso deste arquivo a exercitava. Medido: apagar
   essa linha deixava o harness inteiro verde, com a lista de tokens saindo
   para solicitante, responsavel e gestor. A migracao 50 nunca teve bateria
   propria, entao este e o unico lugar que pode cobrar. */
select chk('dem_pessoas: solicitante nao ve a lista', 'SO_ADMIN',
  public.dem_pessoas('tk-jovem')->>'erro');
select chk('dem_pessoas: responsavel nao ve a lista', 'SO_ADMIN',
  public.dem_pessoas('tk-com')->>'erro');
/* o GESTOR tambem nao: `dem_ajustar` e `dem_pessoas` usam a porta estreita
   (`m.papel <> 'admin'`), e nao a larga (`in ('gestor','admin')`). As duas
   expressoes existem no arquivo e sao parecidas o bastante para trocar uma
   pela outra sem ninguem ver. */
select chk('dem_pessoas: nem o gestor ve a lista', 'SO_ADMIN',
  public.dem_pessoas('tk-gestor')->>'erro');
select chk('dem_pessoas: e quem nao e ninguem toma SEM_ACESSO', 'SEM_ACESSO',
  public.dem_pessoas('tk-inventado')->>'erro');
/* e nao basta recusar: o corpo recusado nao pode trazer a lista junto */
select chk('dem_pessoas: a recusa vem sem a chave membros', 'sim',
  case when public.dem_pessoas('tk-com') ? 'membros' then 'nao' else 'sim' end);
select chk('dem_pessoas: o admin recebe a lista', 'true',
  public.dem_pessoas('tk-admin')->>'ok');
select chk('dem_pessoas: e a lista tem gente de verdade', 'sim',
  case when jsonb_array_length(public.dem_pessoas('tk-admin')->'membros') >= 6
       then 'sim' else 'nao' end);
select chk('dem_pessoas: e o token vem junto, que e o que precisa ser guardado', 'sim',
  case when (select count(*) from jsonb_array_elements(public.dem_pessoas('tk-admin')->'membros') x
              where x->>'token' = 'tk-gestor') = 1 then 'sim' else 'nao' end);

-- 19 -------------------------------------------- o teto de 300 da lista ---
/* A GARANTIA EXISTIA UMA VEZ SO, NA CONFERENCIA DA 57, E DEPOIS DISSO A 87 E
   A 88 REESCREVERAM `dem_lista` POR INTEIRO SEM REAFIRMAR O NUMERO.

   O teto e o que impede a aba "Tudo" de descer 10 MB de JSON; o `tem_mais` e
   o que impede a lista de MENTIR em silencio sobre o que ficou de fora. Os
   dois moram na mesma linha (`least(greatest(coalesce(...,300),1),300)`) e
   nada neste arquivo passava de quatro demandas -- entao trocar 300 por 30000
   ficava verde. */
do $$
declare v_cat uuid; v_set uuid; v_quem uuid;
begin
  select id into v_cat from demandas.categorias where nome = 'Limpeza';
  select setor_id into v_set from demandas.categorias where id = v_cat;
  if v_set is null then select id into v_set from demandas.setores where slug = 'zeladoria'; end if;
  select id into v_quem from demandas.membros where nome = 'Joice Bianca';
  /* insert direto, e nao 320 `dem_abrir`: os gatilhos da tabela sao de
     UPDATE, entao a lista ve exatamente o mesmo que veria pela porta, e o
     caso roda em um piscar em vez de 320 idas. */
  insert into demandas.demandas
    (titulo, descricao, categoria_id, setor_solicitante, setor_responsavel,
     aberta_por, prazo)
  select 'Teto 300 · ' || i, 'enchendo a lista para medir o teto duro',
         v_cat, v_set, v_set, v_quem, current_date + 30
    from generate_series(1, 320) i;
end $$;
select chk('a lista para em 300, mesmo com 320 visiveis', '300',
  jsonb_array_length(public.dem_lista('tk-gestor','{}'::jsonb)->'itens')::text);
select chk('e pedir mais que o teto nao levanta o teto', '300',
  jsonb_array_length(public.dem_lista('tk-gestor','{"limite":5000}'::jsonb)->'itens')::text);
select chk('o teto devolvido e o mesmo 300', '300',
  public.dem_lista('tk-gestor','{"limite":5000}'::jsonb)->>'limite');
select chk('e ela DIZ que cortou', 'true',
  public.dem_lista('tk-gestor','{}'::jsonb)->>'tem_mais');
select chk('e o total e o de verdade, nao o da pagina', 'sim',
  case when (public.dem_lista('tk-gestor','{}'::jsonb)->>'total')::int >= 320
       then 'sim' else 'nao' end);
/* e a lista curta continua dizendo a verdade do outro lado: `tem_mais` falso
   quando nao sobrou nada. Sem este caso, `tem_mais := true` fixo passaria. */
select chk('pedindo o que cabe, nao ha aviso de corte', 'false',
  public.dem_lista('tk-kids','{}'::jsonb)->>'tem_mais');

-- 20 ------------------------------------------ desativado nao entra mais ---
/* `demandas.quem` FILTRA POR `ativo`, E NENHUM CASO DESTE ARQUIVO TINHA UM
   MEMBRO DESATIVADO.

   Tirar o `and ativo` das duas linhas de `demandas.quem` deixava os 63 casos
   verdes -- e em producao significa que a pessoa desligada da equipe volta a
   entrar pelo link que ainda esta na conversa dela no WhatsApp. Desativar e
   a UNICA forma de tirar acesso que a tela Ajustes oferece: nao ha "apagar
   pessoa" com demanda pendurada (a 23503 existe por isso). */
do $$ begin
  insert into demandas.membros (nome, auth_email, telefone, papel, setor_id, token, ativo)
  values ('Saiu da Equipe', 'saiu@teste', '5531900000099', 'responsavel',
          (select id from demandas.setores where slug = 'comunicacao'), 'tk-saiu', true);
end $$;
select chk('enquanto ativo, o link entra', 'Saiu da Equipe',
  public.dem_quem_sou('tk-saiu')->>'nome');
update demandas.membros set ativo = false where token = 'tk-saiu';
select chk('desativado, o mesmo link nao entra mais', 'SEM_ACESSO',
  public.dem_quem_sou('tk-saiu')->>'erro');
/* a outra porta, a do e-mail do login, tem a MESMA linha e ela e uma copia:
   consertar uma e esquecer a outra e como este defeito volta */
select set_config('teste.jwt', '{"email":"saiu@teste"}', false);
select chk('e o login por e-mail dele tambem nao', 'SEM_ACESSO',
  public.dem_quem_sou(null)->>'erro');
select set_config('teste.jwt', '', false);
/* e desativado nao enxerga nem abre nada: a porta e uma so, mas quem confia
   nela sao todas as funcoes */
select chk('desativado nao lista', 'SEM_ACESSO',
  public.dem_lista('tk-saiu','{}'::jsonb)->>'erro');
select chk('desativado nao abre demanda', 'SEM_ACESSO',
  public.dem_abrir('tk-saiu', jsonb_build_object(
    'titulo','Nao devia nascer','descricao','x','prazo',(current_date+3)::text,
    'categoria_id',(select id from demandas.categorias where nome='Limpeza')))->>'erro');

-- 21 --------------------------------- dem_bases nao entrega a agenda ---
/* A MIGRACAO 67 TIROU A CHAVE `membros` DAQUI, E ATE 22/09/2026 O HARNESS
   RODAVA SEM A 67 -- ou seja, contra uma `dem_bases` que nao existe em
   producao desde 21/09. Medido antes do conserto, com o token de um
   `responsavel`: nome, papel, setor e TELEFONE de todo mundo.

   `lib/demandas/tipos.ts` ja nem declara o campo (`Bases` perdeu `membros` no
   mesmo commit), entao nenhuma tela quebra -- e e justamente por nenhuma tela
   ler que o vazamento podia voltar calado. */
select chk('dem_bases nao entrega a lista de membros a quem atende', 'sim',
  case when public.dem_bases('tk-com') ? 'membros' then 'nao' else 'sim' end);
select chk('nem ao gestor', 'sim',
  case when public.dem_bases('tk-gestor') ? 'membros' then 'nao' else 'sim' end);
select chk('nem ao admin', 'sim',
  case when public.dem_bases('tk-admin') ? 'membros' then 'nao' else 'sim' end);
/* e continua entregando o que os formularios precisam: guarda que apaga o
   dado util nao e guarda, e a 67 tinha essa conferencia no corpo dela */
select chk('e continua entregando setores e categorias', 'sim',
  case when jsonb_array_length(public.dem_bases('tk-jovem')->'setores') > 0
        and jsonb_array_length(public.dem_bases('tk-jovem')->'categorias') > 0
       then 'sim' else 'nao' end);

-- 22 ------------------------------------- 1980 letras na recusa, e 1981 nao ---
/* O TETO MAIS APERTADO DE TODOS, MEDIDO AQUI PARA O NUMERO NAO SER PALPITE.
   `TETO.rejeitar`, em `lib/demandas/regras.ts`, e `2000 - 'Aprovação
   recusada: '.length` = 1980, e e o contador da caixa "Por que nao aprovar".
   O motivo do numero: o texto da recusa vai INTEIRO para `aprovacao_nota`
   (2000) e, PREFIXADO, para `cancelada_motivo` (2000) --
   `cancelada_motivo = 'Aprovação recusada: ' || v_txt`. Quem manda e a mais
   apertada das duas.
   `scripts/demandas.test.mjs` cruza esse 1980 com a CHECK da migracao 86; o
   que falta e a unica pergunta que so o Postgres responde: o banco aceita
   mesmo 1980 e recusa mesmo 1981? */
do $$ begin
  perform public.dem_abrir('tk-jovem', jsonb_build_object(
    'titulo','Recusa de 1980 letras','descricao','x','prazo',(current_date + 9)::text,
    'orcamento','10.00',
    'categoria_id',(select id from demandas.categorias where nome='Reembolso')));
  perform public.dem_abrir('tk-jovem', jsonb_build_object(
    'titulo','Recusa de 1981 letras','descricao','x','prazo',(current_date + 9)::text,
    'orcamento','10.00',
    'categoria_id',(select id from demandas.categorias where nome='Reembolso')));
end $$;
select chk('recusar com 1980 letras: passa', 'true',
  public.dem_mover('tk-admin', nd('Recusa de 1980 letras'), 'rejeitar',
    jsonb_build_object('texto', repeat('a', 1980)))->>'ok');
select chk('e com 1981 o banco recusa', 'REGRA',
  public.dem_mover('tk-admin', nd('Recusa de 1981 letras'), 'rejeitar',
    jsonb_build_object('texto', repeat('a', 1981)))->>'erro');
/* e a restricao que estoura e a do PREFIXO, e nao a do campo da aprovacao:
   1981 cabe em `aprovacao_nota` e 1981+20 nao cabe em `cancelada_motivo`.
   Sem este caso, o teto certo por um motivo errado passaria igual. */
select chk('e quem estoura e o motivo do cancelamento, por causa do prefixo', 'sim',
  case when public.dem_mover('tk-admin', nd('Recusa de 1981 letras'), 'rejeitar',
         jsonb_build_object('texto', repeat('a', 1981)))->>'regra'
         like '%ck_tam_cancelada_motivo%' then 'sim' else 'nao' end);
/* e a recusa de 1980 gravou os dois campos, o curto e o prefixado */
select chk('a recusa que passou gravou o prefixo junto', '2000',
  (select length(cancelada_motivo)::text from demandas.demandas
    where titulo = 'Recusa de 1980 letras'));


-- 23 --------------------------- a base de pessoas e o escopo (migracao 94) ---
/* A conferencia da 94 prova os quatro ataques do pedido dentro da propria
   migracao. Aqui ficam os que dependem de um banco com gente de verdade em
   volta: o ultimo administrador (a conferencia roda em producao, onde o Arthur
   e admin, e nao tem como ser a unica), a decisao de um pedido de papel, a
   troca de link, e o escopo de gestor mexido pela porta do administrador. */
do $$
declare s_jov uuid; s_com uuid;
begin
  select id into s_jov from demandas.setores where slug = 'jovens';
  select id into s_com from demandas.setores where slug = 'comunicacao';
  insert into demandas.membros (nome, auth_email, telefone, papel, setor_id, token) values
    ('Lara Jovens',  'lara@teste',  '5531900000011', 'solicitante', s_jov, 'tk-lara'),
    ('Caio Lider',   'caio@teste',  '5531900000012', 'lider',       s_jov, 'tk-lider'),
    ('Gil Gestor',   'gil@teste',   '5531900000013', 'gestor',      s_com, 'tk-gil');
  insert into demandas.gestao (membro_id, setor_id)
    select id, s_com from demandas.membros where token = 'tk-gil';
end $$;
/* A: o colega do MESMO setor. Pedro e Lara sao os dois do Jovens. Ate a 93
   a Lara via, comentava e anexava em tudo que o Pedro abriu. */
select chk('94: colega do mesmo setor nao ve a demanda', 'NAO_EXISTE',
  public.dem_ver('tk-lara', nd('Limpeza da sala'))->>'erro');
select chk('94: e a lista Tudo dela fica vazia', '0',
  jsonb_array_length(public.dem_lista('tk-lara','{}'::jsonb)->'itens')::text);
select chk('94: o lider do Jovens ve o que o Jovens pediu', 'true',
  public.dem_ver('tk-lider', nd('Limpeza da sala'))->>'ok');
select chk('94: o lider nao ve o que outro ministerio pediu', 'NAO_EXISTE',
  public.dem_ver('tk-lider', (select numero from demandas.demandas
    where aberta_por = (select id from demandas.membros where token='tk-gestor') limit 1))->>'erro');
/* B: o gestor com escopo so na Comunicacao nao alcanca Compras */
select chk('94: gestor de um setor nao alcanca a compra de outro', 'NAO_EXISTE',
  public.dem_mover('tk-gil', nd('Comprar cadeiras'), 'comentar', '{"texto":"x"}'::jsonb)->>'erro');
select chk('94: e o gestor de todos continua vendo', 'true',
  (public.dem_ver('tk-gestor', nd('Comprar cadeiras'))->>'ok'));
/* a ficha diz o que a pessoa pode, decidido pelo servidor */
select chk('94: a ficha diz que o lider fala por quem pediu', 'true',
  (public.dem_ver('tk-lider', nd('Limpeza da sala'))->'eu')->>'pede');
select chk('94: e que ele nao atende', 'false',
  (public.dem_ver('tk-lider', nd('Limpeza da sala'))->'eu')->>'atende');
/* C e D: area administrativa e o proprio papel */
select chk('94: o lider nao abre a base de pessoas', 'SO_ADMIN',
  public.dem_pessoas('tk-lider')->>'erro');
select chk('94: o perfil recusa papel', 'CAMPO_NAO_PERMITIDO',
  public.dem_perfil('tk-lara', '{"papel":"admin"}'::jsonb)->>'erro');
select chk('94: e o papel continua o mesmo', 'solicitante',
  (select papel from demandas.membros where token = 'tk-lara'));
/* o pedido de papel: registra, espera, e so o administrador decide */
select public.dem_perfil('tk-lara', '{"papel_pedido":"responsavel"}'::jsonb);
select chk('94: pedir nao muda o papel', 'solicitante/responsavel',
  (select papel || '/' || coalesce(papel_pedido,'-') from demandas.membros where token = 'tk-lara'));
select chk('94: aceitar equipe num setor que nao atende e recusado', 'SETOR_NAO_ATENDE',
  public.dem_ajustar('tk-admin', 'pedido', jsonb_build_object(
    'id', (select id from demandas.membros where token='tk-lara'), 'decisao', 'aceitar'))->>'erro');
select public.dem_ajustar('tk-admin', 'membro', jsonb_build_object(
  'id', (select id from demandas.membros where token='tk-lara'),
  'setor_id', (select id from demandas.setores where slug='comunicacao')));
select chk('94: com o setor certo, aceitar vira o papel', 'true',
  public.dem_ajustar('tk-admin', 'pedido', jsonb_build_object(
    'id', (select id from demandas.membros where token='tk-lara'), 'decisao', 'aceitar'))->>'ok');
select chk('94: e o pedido sai', 'responsavel/-',
  (select papel || '/' || coalesce(papel_pedido,'-') from demandas.membros where token = 'tk-lara'));
select chk('94: o historico conta quem decidiu', 'Arthur Rangel',
  (select y.nome from demandas.pessoas_historico h join demandas.membros y on y.id = h.por
    where h.membro_id = (select id from demandas.membros where token='tk-lara')
      and h.tipo = 'papel' order by h.id desc limit 1));
/* o ultimo administrador */
select chk('94: o unico admin nao deixa de ser admin', 'ULTIMO_ADMIN',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object(
    'id', (select id from demandas.membros where token='tk-admin'), 'papel', 'gestor',
    'escopo_total', true))->>'erro');
select chk('94: nem e desativado', 'ULTIMO_ADMIN',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object(
    'id', (select id from demandas.membros where token='tk-admin'), 'ativo', false))->>'erro');
/* o escopo pela porta do administrador */
select chk('94: gestor sem escopo e recusado', 'ESCOPO_VAZIO',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object(
    'id', (select id from demandas.membros where token='tk-gil'), 'escopo', '[]'::jsonb))->>'erro');
select chk('94: trocar o escopo inteiro', 'true',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object(
    'id', (select id from demandas.membros where token='tk-gil'),
    'escopo', jsonb_build_array((select id from demandas.setores where slug='compras'))))->>'ok');
select chk('94: e agora ele alcanca Compras', 'true',
  public.dem_ver('tk-gil', nd('Comprar cadeiras'))->>'ok');
select chk('94: e deixou de alcancar a Comunicacao', 'NAO_EXISTE',
  public.dem_ver('tk-gil', nd('Divulgação do Culto de Celebração'))->>'erro');
/* o link pessoal trocado invalida o antigo */
select public.dem_ajustar('tk-admin', 'link', jsonb_build_object(
  'id', (select id from demandas.membros where token='tk-lider')));
select chk('94: o link antigo deixa de entrar', 'SEM_ACESSO',
  public.dem_quem_sou('tk-lider')->>'erro');
select chk('94: e a pessoa continua la, com link novo', 'sim',
  (select case when token ~ '^[0-9a-f]{24}$' then 'sim' else 'nao' end
     from demandas.membros where nome = 'Caio Lider'));
/* o mesmo nome entra so confirmando */
select chk('94: homonimo precisa confirmar', 'HOMONIMO',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('nome', 'Pedro Jovens',
    'setor_id', (select id from demandas.setores where slug='kids')))->>'erro');
select chk('94: confirmando, entra', 'true',
  public.dem_ajustar('tk-admin', 'membro', jsonb_build_object('nome', 'Pedro Jovens',
    'setor_id', (select id from demandas.setores where slug='kids'),
    'confirmar_homonimo', true))->>'ok');

\t off
select n, caso, esperado, deu, case when deu = esperado then 'ok' else 'FALHOU' end as v from res order by n;
select count(*) filter (where deu is distinct from esperado) as falhas, count(*) as total from res;

/* E AGORA O ARQUIVO FALHA DE VERDADE.

   Até 21/09/2026 ele terminava na linha de cima: imprimia "falhas | 1" e
   devolvia 0 para quem chamou. `\set ON_ERROR_STOP off`, lá no começo, é
   necessário para um `chk` que erra não abortar os outros 61 — mas ele também
   faz o psql sair com 0 mesmo depois de erro. Ligar de volta AQUI, na última
   instrução, é o que transforma a contagem em veredito. */
\set ON_ERROR_STOP on
do $veredito$
/* `v_n` e nao `n`: a coluna `res.n` existe, e um `order by n` dentro do
   `string_agg` fica ambiguo entre a variavel e a coluna. O Postgres recusa a
   consulta inteira, o bloco levanta a excecao ERRADA, e o veredito passa a
   reprovar sempre — inclusive quando os 62 casos estao verdes. Terceira vez
   que esse mesmo `n` morde neste repositorio (ver migracao 60). */
declare v_n int; v_total int; d text;
begin
  select count(*) filter (where deu is distinct from esperado), count(*)
    into v_n, v_total from res;
  if v_n = 0 then
    raise notice 'demandas-banco: %/% casos.', v_total, v_total;
    return;
  end if;
  select string_agg(format(E'\n  x %s: esperava %L, veio %L', r.caso, r.esperado, r.deu), '' order by r.n)
    into d from res r where r.deu is distinct from r.esperado;
  raise exception 'DEMANDAS-BANCO REPROVOU: % de % casos', v_n, v_total
    using detail = d, errcode = 'raise_exception';
end $veredito$;
