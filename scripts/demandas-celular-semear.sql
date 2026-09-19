/* DADOS DE VERDADE PARA OLHAR AS TELAS NO CELULAR.

   Tela vazia não revela defeito de layout. Um nome curto cabe em qualquer
   largura; o que quebra a tela é o nome comprido, o título de três linhas, o
   valor com seis dígitos, a lista com vinte itens. Então aqui os dados são
   propositalmente DESCONFORTÁVEIS, e é isso que os torna úteis:

     · nomes longos de verdade, como os que existem na igreja;
     · um título que não cabe numa linha em 320px;
     · orçamento de cinco dígitos, para ver o alinhamento do número;
     · demanda em cada um dos cinco estados, inclusive travada por dois
       motivos diferentes;
     · uma demanda com histórico comprido, que é onde a tela de detalhe
       costuma estourar;
     · os quatro papéis, para ver o menu de abas de cada um.

   Roda depois de `supabase/50-demandas.sql`. */

-- ------------------------------------------------------------------ gente --
insert into demandas.membros (nome, email, telefone, setor_id, papel, token) values
  ('Arthur Rangel',                      'arthur@exemplo.org', '21999990001',
     (select id from demandas.setores where slug='tecnologia'),    'admin',        'tok-admin'),
  ('Maria Aparecida Gonçalves da Silva',  'maria@exemplo.org',  '21999990002',
     (select id from demandas.setores where slug='comunicacao'),   'responsavel',  'tok-comunica'),
  ('José Carlos de Oliveira Nascimento',  'jose@exemplo.org',   '21999990003',
     (select id from demandas.setores where slug='compras'),       'responsavel',  'tok-compras'),
  ('Ana Beatriz Rodrigues dos Santos',    'ana@exemplo.org',    '21999990004',
     (select id from demandas.setores where slug='pastoral'),      'gestor',       'tok-gestor'),
  ('Pedro Henrique Almeida Vasconcelos',  'pedro@exemplo.org',  '21999990005',
     (select id from demandas.setores where slug='eventos'),       'solicitante',  'tok-pede')
on conflict (token) do nothing;

-- ------------------------------------------------------------------ pedidos --
do $$
declare
  t_pede  text := 'tok-pede';
  t_com   text := 'tok-comunica';
  t_ges   text := 'tok-gestor';
  c_divul uuid; c_compra uuid; c_manut uuid; c_reemb uuid;
  r jsonb; n1 int; n2 int; n3 int; n4 int; n5 int; n6 int;
begin
  select id into c_divul  from demandas.categorias where nome = 'Divulgação de culto' limit 1;
  select id into c_compra from demandas.categorias where nome = 'Compra de equipamentos' limit 1;
  select id into c_manut  from demandas.categorias
    where nome = 'Reparo elétrico' limit 1;
  select id into c_reemb  from demandas.categorias where nome = 'Manutenção predial' limit 1;

  /* 1. aberta, título curto */
  r := public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Arte para o culto de domingo',
    'descricao','Precisamos de uma arte para o feed e para o story, no padrão da igreja.',
    'objetivo','Divulgar o culto de domingo para quem acompanha pelo Instagram.',
    'local','Instagram e grupo do WhatsApp', 'publico','Membros e visitantes',
    'categoria_id', c_divul, 'prioridade','normal', 'impacto','medio',
    'prazo', (current_date + 5)::text));
  n1 := (r->>'numero')::int;

  /* 2. TÍTULO LONGO DE PROPÓSITO: é o que estoura a tela estreita */
  r := public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Revisão completa do sistema de som e iluminação do templo antes da conferência de novembro',
    'descricao','As caixas de retorno do palco estão com chiado desde o último domingo, e dois refletores da frente não acendem. Antes da conferência precisamos de uma revisão completa, com troca do que estiver no fim da vida útil e um relatório do que foi feito.',
    'objetivo','Não correr risco de ficar sem som no meio da conferência, que é o maior evento do ano.',
    'local','Templo principal', 'publico','Toda a igreja e os visitantes da conferência',
    'categoria_id', c_manut, 'prioridade','alta', 'impacto','alto',
    'prazo', (current_date + 20)::text, 'evento', true,
    'evento_data', (current_date + 30)::text));
  n2 := (r->>'numero')::int;

  /* 3. compra: nasce travada esperando aprovação, com orçamento de 5 dígitos */
  r := public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Compra de 12 cadeiras para a sala das crianças',
    'descricao','As cadeiras atuais estão quebrando. Orçamento já levantado com dois fornecedores.',
    'objetivo','Sala do GUIA Kids segura para as crianças.',
    'local','Sala 2 do GUIA Kids', 'publico','Crianças de 4 a 10 anos',
    'categoria_id', c_compra, 'prioridade','normal', 'impacto','medio',
    'prazo', (current_date + 12)::text, 'orcamento', 14750.90));
  n3 := (r->>'numero')::int;

  /* 4. em execução, com histórico comprido */
  r := public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Vídeo de chamada para o Follow',
    'descricao','Um corte de 40 segundos com os melhores momentos do último Follow.',
    'objetivo','Puxar mais jovens para o sábado.',
    'local','Instagram', 'publico','Jovens de 15 a 24',
    'categoria_id', c_divul, 'prioridade','alta', 'impacto','medio',
    'prazo', (current_date + 3)::text));
  n4 := (r->>'numero')::int;
  perform public.dem_mover(t_com, n4, 'assumir', '{}'::jsonb);
  perform public.dem_mover(t_com, n4, 'comentar',
    jsonb_build_object('texto','Separei o material bruto do último Follow, são 3 horas de gravação. Começo a decupagem amanhã.'));
  perform public.dem_mover(t_com, n4, 'comentar',
    jsonb_build_object('texto','Decupagem feita. Tenho 6 trechos bons, vou montar duas versões para a liderança escolher.'));
  perform public.dem_mover(t_com, n4, 'comentar',
    jsonb_build_object('texto','Primeira versão pronta, mandei no grupo da mídia para conferir o áudio.'));

  /* 5. travada por falta de informação: o pedido volta para quem abriu */
  r := public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Banner para a entrada do templo',
    'descricao','Um banner grande para a porta.',
    'objetivo','Sinalizar a entrada.',
    'local','Entrada', 'publico','Visitantes',
    'categoria_id', c_divul, 'prioridade','baixa', 'impacto','baixo',
    'sem_prazo_porque','Não tem data fechada ainda, depende da reforma da entrada.'));
  n5 := (r->>'numero')::int;
  perform public.dem_mover(t_com, n5, 'assumir', '{}'::jsonb);
  perform public.dem_mover(t_com, n5, 'travar',
    jsonb_build_object('motivo','informacao','texto','Qual a medida do banner e o texto que tem que estar nele? Sem isso não dá para orçar a impressão.'));

  /* 6. concluída, para a tela de números não ficar toda zerada */
  r := public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Troca das lâmpadas do corredor',
    'descricao','Três lâmpadas queimadas no corredor da secretaria.',
    'objetivo','Corredor iluminado.',
    'local','Corredor da secretaria', 'publico','Equipe',
    'categoria_id', c_manut, 'prioridade','normal', 'impacto','baixo',
    'prazo', (current_date - 2)::text));
  n6 := (r->>'numero')::int;
  perform public.dem_mover(t_ges, n6, 'assumir', '{}'::jsonb);
  perform public.dem_mover(t_ges, n6, 'concluir',
    jsonb_build_object('texto','Trocadas as três lâmpadas por LED. Sobrou uma de reserva, ficou no armário da secretaria.'));

  raise notice 'semeado: % % % % % %', n1, n2, n3, n4, n5, n6;
end $$;
