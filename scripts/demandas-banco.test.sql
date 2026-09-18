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
     'evento','Culto de Celebração', 'evento_data','2026-09-26',
     'prazo','2026-09-22'))->>'ok'));

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
     'titulo','Urgente cru', 'descricao','x', 'prioridade','urgente', 'prazo','2026-09-20',
     'categoria_id',(select id from demandas.categorias where nome='Suporte de som')))->>'erro'));

select chk('urgente com impacto: aceita', 'true',
  (public.dem_abrir('tk-jovem', jsonb_build_object(
     'titulo','Som mudo no domingo', 'descricao','x', 'prioridade','urgente',
     'impacto','Sem som nao tem culto', 'prazo','2026-09-20',
     'categoria_id',(select id from demandas.categorias where nome='Suporte de som')))->>'ok'));

select chk('evento sem data: recusa', 'REGRA',
  (public.dem_abrir('tk-jovem', jsonb_build_object(
     'titulo','Evento solto', 'descricao','x', 'prazo','2026-09-30', 'evento','Congresso',
     'categoria_id',(select id from demandas.categorias where nome='Reserva de espaço')))->>'erro'));

select chk('numero pulado por abertura recusada nao vira buraco de dado', 'true',
  (select (count(*) = 3)::text from demandas.demandas));

-- 4 ---------------------------------- aprovação vem da categoria, sozinha ---
select public.dem_abrir('tk-jovem', jsonb_build_object(
  'titulo','Comprar cadeiras', 'descricao','30 cadeiras', 'prazo','2026-10-10',
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
select chk('setor de fora nem enxerga', 'SEM_ACESSO',
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
select chk('demanda que nao e minha: sem acesso', 'SEM_ACESSO',
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
/* O prazo 20/09 do "som mudo" ainda não venceu hoje. Para medir atraso o
   teste precisa de uma demanda com prazo REALMENTE vencido — e o banco aceita
   prazo no passado de propósito: demanda registrada depois do fato existe. */
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
select public.dem_abrir('tk-jovem', jsonb_build_object(
  'titulo','Reembolso do combustivel', 'descricao','x', 'prazo','2026-10-01',
  'categoria_id',(select id from demandas.categorias where nome='Reembolso')));
select chk('reembolso tambem nasce esperando aprovacao', 'travada/aprovacao',
  (select status||'/'||travada_por from demandas.demandas where titulo='Reembolso do combustivel'));
select chk('ninguem destrava por fora o que espera aprovacao', 'FALTA_APROVACAO',
  public.dem_mover('tk-gestor', nd('Reembolso do combustivel'), 'destravar',
    '{"texto":"vamos tocar"}'::jsonb)->>'erro');
select public.dem_mover('tk-gestor', nd('Reembolso do combustivel'), 'rejeitar',
  '{"texto":"Falta a nota fiscal."}'::jsonb);
select chk('rejeitar encerra com motivo', 'cancelada',  st('Reembolso do combustivel'));

\t off
select n, caso, esperado, deu, case when deu = esperado then 'ok' else 'FALHOU' end as v from res order by n;
select count(*) filter (where deu is distinct from esperado) as falhas, count(*) as total from res;
