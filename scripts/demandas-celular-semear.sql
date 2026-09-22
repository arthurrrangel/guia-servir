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
  r jsonb; n1 int; n2 int; n3 int; n4 int; n5 int; n6 int; n7 int; n8 int; n9 int;
  n10 int; n11 int; n12 int;
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
    'prazo', (current_date + 5)::text));
  n6 := (r->>'numero')::int;
  /* O PRAZO NASCE NO FUTURO E DEPOIS ANDA PARA TRAS, porque e assim que
     acontece de verdade: ninguem abre uma demanda com prazo que ja passou, e
     desde a migracao 86 o servidor recusa isso com `PRAZO_NO_PASSADO`. A
     semente vinha abrindo com `current_date - 2` e, a partir da 86, a demanda
     6 simplesmente NAO NASCIA — em silencio, porque `perform` nao le a
     resposta. A tela de detalhe-concluida deixou de ter o que medir. */
  update demandas.demandas set prazo = current_date - 2 where numero = n6;
  perform public.dem_mover(t_ges, n6, 'assumir', '{}'::jsonb);
  /* O `atraso` NAO E ENFEITE AQUI: esta demanda vence dois dias antes de ser
     concluida, e desde a migracao 86 o servidor recusa concluir depois do
     prazo sem uma palavra sobre o atraso. Sem esta chave a semente falhava em
     SILENCIO e a tela de detalhe-concluida deixava de existir — foi assim que
     eu descobri, com o medidor pedindo uma demanda concluida e nao achando
     nenhuma. */
  perform public.dem_mover(t_ges, n6, 'concluir',
    jsonb_build_object('texto','Trocadas as três lâmpadas por LED. Sobrou uma de reserva, ficou no armário da secretaria.',
                       'atraso','A loja ficou sem LED de 9W e a gente esperou a reposição.'));

  /* 7. O QUE FALTAVA NESTA SEMENTE, E POR QUE 252/252 FICOU VERDE COM TRES
        DEFEITOS GRAVES DENTRO — 21/09/2026.

     Nenhuma das seis demandas acima tem um link colado, um anexo na lista ou
     uma palavra sem espaco. E e exatamente isso que a tela pede a pessoa:
     "Cole o link do arquivo (Drive, Fotos, o que for)". O medidor abria cada
     rota no estado inicial de uma semente higienica e nao via nada.

     As tres linhas abaixo poem no banco o que a igreja realmente cola, e o
     instrumento passa a pegar sozinho o que eu tive que abrir na mao. */
  r := public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Arte do Follow para o Instagram',
    'descricao','Segue a referencia que a gente gostou: ' ||
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxxxxxxxxxxxxxxxxxxxxxxxx&index=7&t=142s',
    'objetivo','Divulgar o Follow.',
    'local','Instagram', 'publico','Jovens',
    'categoria_id', c_divul, 'prioridade','alta',
    'prazo', (current_date + 12)::text,
    'anexos', jsonb_build_array(
      jsonb_build_object('nome','referencia',
        'url','https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/view?usp=sharing_eip_se_dm'))));
  n7 := (r->>'numero')::int;
  perform public.dem_mover(t_com, n7, 'assumir', '{}'::jsonb);
  perform public.dem_mover(t_com, n7, 'comentar', jsonb_build_object('texto',
    'Primeira versao aqui: https://drive.google.com/file/d/1ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210/view?usp=sharing'));

  /* 8. e uma ATRASADA de verdade, para a ordem da lista ter o que provar */
  r := public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Consertar o ar da sala do Kids',
    'descricao','O ar da sala grande do Kids parou de gelar.',
    'objetivo','Sala utilizavel no domingo.',
    'local','Kids', 'publico','Criancas',
    'categoria_id', c_manut, 'prioridade','baixa',
    'prazo', (current_date + 5)::text));
  n8 := (r->>'numero')::int;
  update demandas.demandas set prazo = current_date - 51 where numero = n8;

  /* 9. A ETAPA 5 DO PDF PRECISA DOS DOIS LADOS NA SEMENTE — 22/09/2026.

     A migracao 91 pos no cartao verde da ficha um botao ("Resolveu,
     obrigado") e, no lugar dele depois de confirmada, uma frase ("Validada
     por X em dd/mm/aaaa"). Sao duas caixas diferentes, com alturas e alvos de
     toque diferentes, e so uma delas existia aqui: a demanda 6 e concluida e
     NAO validada de proposito (nenhuma linha a valida, e e assim que tem que
     ficar — ela e a que exercita o BOTAO).

     Esta nona e a outra metade: concluida E confirmada por quem pediu, para a
     FRASE ter uma tela onde ser medida. Sem ela, apagar a frase inteira nao
     mudaria uma unica conferencia de celular.

     Quem valida e `t_pede`, que foi quem abriu: e o caminho do PDF
     ("Confirmar a conclusao" esta entre as capacidades do Solicitante), e nao
     o atalho da lideranca. */
  r := public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Impressao dos cartoes de visitante',
    'descricao','Cem cartoes de visitante para o balcao da recepcao, no papel de sempre.',
    'objetivo','Recepcao com material para o domingo.',
    'local','Recepcao', 'publico','Visitantes',
    'categoria_id', c_manut, 'prioridade','normal', 'impacto','baixo',
    'prazo', (current_date + 6)::text));
  n9 := (r->>'numero')::int;
  perform public.dem_mover(t_ges, n9, 'assumir', '{}'::jsonb);
  perform public.dem_mover(t_ges, n9, 'concluir',
    jsonb_build_object('texto','Cem cartoes impressos e entregues no balcao da recepcao.'));
  perform public.dem_mover(t_pede, n9, 'validar', '{}'::jsonb);

  /* 10, 11 e 12. O SETOR DE QUEM ATENDE PRECISA DOS SEIS ESTADOS — 22/09/2026.

     Medido hoje, montando a pagina que mostra o sistema: das seis telas de
     detalhe do RESPONSAVEL, quatro eram o cartao "Essa demanda nao existe".

     A causa nao era defeito do app. A regra esta certa: Maria atende
     comunicacao, e `dem_ver` recusa 79 (compras), 82, 84 e 85 (manutencao).
     O defeito era do INSTRUMENTO: `demandas-celular-subir.sh` escolhia as
     rotas com `min(numero)` sobre o banco inteiro, sem perguntar se o papel
     daquela volta enxergava aquele numero. Maria era mandada para a demanda
     de outro setor e o medidor fotografava, media e aprovava o cartao de
     erro — que passa em contraste, em alvo de toque e em rolagem lateral,
     porque nao tem quase nada dentro.

     Consequencia concreta do que ficou sem medida: o botao "Destravar" so
     existe para quem atende, e so aparece na ficha travada. Como a ficha
     travada de Maria nunca abria, esse botao nunca foi medido em 320px.

     O conserto tem tres partes, e esta e a primeira: dar ao setor de quem
     atende (comunicacao) os tres estados que faltavam. As outras duas estao
     em `demandas-celular-subir.sh` (numeros por papel, via `dem_ver`) e em
     `demandas-celular.mjs` (a guarda que reprova quando a ficha nao chega). */

  /* 10. concluida e NAO validada, no setor de quem atende: e a que exercita o
         BOTAO "Resolveu, obrigado" da etapa 5 vendo pelos olhos de quem fez o
         trabalho e NAO pode confirmar o proprio servico. */
  r := public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Post de agradecimento aos voluntarios do mutirao',
    'descricao','Um card para o feed agradecendo quem ficou ate o fim no mutirao de sabado.',
    'objetivo','Reconhecer publicamente quem trabalhou.',
    'local','Instagram', 'publico','Igreja toda',
    'categoria_id', c_divul, 'prioridade','normal', 'impacto','baixo',
    'prazo', (current_date + 4)::text));
  n10 := (r->>'numero')::int;
  perform public.dem_mover(t_com, n10, 'assumir', '{}'::jsonb);
  perform public.dem_mover(t_com, n10, 'concluir',
    jsonb_build_object('texto','Card publicado no feed e no story, com as fotos que o Pedro mandou.'));

  /* 11. concluida E confirmada, no mesmo setor: e a FRASE "Validada por X",
         que e outra caixa e outra altura. */
  r := public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Arte do aviso de mudanca de horario do culto de quarta',
    'descricao','Precisa sair antes de domingo para a igreja toda ficar sabendo.',
    'objetivo','Ninguem chegar no horario velho.',
    'local','Instagram e WhatsApp', 'publico','Membros',
    'categoria_id', c_divul, 'prioridade','alta', 'impacto','medio',
    'prazo', (current_date + 7)::text));
  n11 := (r->>'numero')::int;
  perform public.dem_mover(t_com, n11, 'assumir', '{}'::jsonb);
  perform public.dem_mover(t_com, n11, 'concluir',
    jsonb_build_object('texto','Arte pronta, publicada nos dois canais na quinta de manha.'));
  perform public.dem_mover(t_pede, n11, 'validar', '{}'::jsonb);

  /* 12. atrasada no setor de quem atende: a pilula vermelha e o "N dias de
         atraso" so foram medidos pelos olhos de quem pede e do admin. */
  r := public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Atualizar a capa do canal do YouTube',
    'descricao','A capa ainda e a da conferencia do ano passado.',
    'objetivo','Canal com a cara certa para quem chega pelo YouTube.',
    'local','YouTube', 'publico','Visitantes',
    'categoria_id', c_divul, 'prioridade','baixa', 'impacto','baixo',
    'prazo', (current_date + 5)::text));
  n12 := (r->>'numero')::int;
  update demandas.demandas set prazo = current_date - 18 where numero = n12;

  raise notice 'semeado: % % % % % % % % % % % %',
    n1, n2, n3, n4, n5, n6, n7, n8, n9, n10, n11, n12;
end $$;
