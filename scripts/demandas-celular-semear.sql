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
     · os cinco papéis, o participante e o pedido de papel, para ver o
       menu de abas e o portal de cada um.

   Roda depois das migrações do Demandas, até a 95. */

-- ------------------------------------------------------- a lista de anexo --
/* 95 · a lista nasce desligada no banco (a migração explica por quê). Aqui
   ela fica LIGADA, porque é o estado que a igreja vai usar e o que a tela tem
   que mostrar: a dica "Aceita links de…" no campo de anexo, o seletor em "Só
   os da lista" e os sites na administração. O anexo semeado abaixo é do
   Google Drive, que está na lista. */
update demandas.regras_gerais set anexo_restrito = true where id;

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

/* OS PAPÉIS DA MIGRAÇÃO 94 · 22/09/2026.

   Até a 93 eram quatro papéis, e o medidor olhava três. A 94 trouxe o líder
   de ministério, o escopo da gestão, o participante e o pedido de papel, e
   cada um muda a tela: o líder tem a aba "Ministério", quem acompanha tem
   "Acompanho", a gestão tem o título com os setores do escopo, e o pedido
   aparece no Início de quem pediu e na administração.

   E OS QUATRO NOVOS SÃO TAMBÉM O TESTE DE ISOLAMENTO: Rafael e Pedro servem
   no MESMO ministério (eventos), e Rafael não pode ver o que Pedro pediu, a
   não ser a demanda em que Pedro o incluiu. Carla está num setor que atende
   (comunicação) sem papel de equipe, e setor sem papel não é credencial: ela
   não vê a fila da comunicação. Bruno é gestor só da comunicação, e não
   alcança compras nem manutenção. `demandas-isolamento.mjs` cobra os três. */
insert into demandas.membros (nome, email, telefone, setor_id, papel, token, funcao) values
  ('Luciana Ferreira de Albuquerque Moura', 'luciana@exemplo.org', '21999990006',
     (select id from demandas.setores where slug='eventos'),       'lider',        'tok-lider',
     'Líder do ministério de eventos'),
  ('Rafael Augusto Pereira Nogueira',       'rafael@exemplo.org',  '21999990007',
     (select id from demandas.setores where slug='eventos'),       'solicitante',  'tok-colega',
     'Recepção'),
  ('Carla Simone Duarte Bittencourt',       'carla@exemplo.org',   '21999990008',
     (select id from demandas.setores where slug='comunicacao'),   'solicitante',  'tok-pedido',
     'Fotografia'),
  ('Bruno Tavares de Menezes Filho',        'bruno@exemplo.org',   '21999990009',
     (select id from demandas.setores where slug='pastoral'),      'gestor',       'tok-gestor-com',
     'Coordenação de mídia')
on conflict (token) do nothing;

/* A GESTORA DA SEMENTE ACOMPANHA TUDO, E ISSO AGORA É UMA DECISÃO ESCRITA.

   Desde a 94 o gestor nasce sem escopo (`escopo_total = false`) e não vê
   nada além do que é dele. A semente usa Ana para assumir e concluir as
   demandas 6 e 9, de manutenção: sem esta linha as duas ações seriam
   recusadas, e antes do `exige` abaixo a recusa passava calada. */
update demandas.membros set escopo_total = true where token = 'tok-gestor';
insert into demandas.gestao (membro_id, setor_id)
  select m.id, s.id from demandas.membros m, demandas.setores s
   where m.token = 'tok-gestor-com' and s.slug = 'comunicacao'
on conflict do nothing;
/* o pedido de papel, como o cadastro deixa: a pessoa já é membro e pediu mais.
   Cadastrou-se há três dias e pediu há dois: a ficha dizia "Pedido em 21/09"
   embaixo de "Cadastrou-se em 23/09" (23/09/2026) */
update demandas.membros set papel_pedido = 'responsavel', papel_pedido_em = now() - interval '2 days',
       origem = 'cadastro', criado_em = now() - interval '3 days'
 where token = 'tok-pedido';

/* NENHUMA CHAMADA DESTA SEMENTE FALHA CALADA · 22/09/2026.

   O cabeçalho da demanda 6 conta duas vezes a mesma história: `perform`
   joga fora a resposta, a função devolve `{"ok": false}` em vez de levantar
   erro, e a tela que dependia daquela demanda some da medição sem aviso. Com
   a 94 havia um terceiro jeito de cair nisso: o teto de dez demandas por hora
   para quem pede, e esta semente abre doze de uma vez.

   Toda chamada passa por aqui. Resposta sem `ok` vira ERRO, e o
   `demandas-celular-subir.sh` para. */
create or replace function pg_temp.exige(r jsonb, o_que text) returns jsonb
language plpgsql as $f$
begin
  if not coalesce((r->>'ok')::boolean, false) then
    raise exception 'semente: "%" falhou: %', o_que, r;
  end if;
  return r;
end $f$;

-- ------------------------------------------------------------------ pedidos --

/* UMA HISTÓRIA POSSÍVEL PARA AS DEMANDAS ATRASADAS · 23/09/2026.

   O prazo destas nasce no futuro e anda para trás com um UPDATE cru (ver a
   nota da demanda 6), e isso contava uma história impossível na tela: a #107
   aberta às 19:57 com prazo de ontem, "Você mudou o prazo de 29/09 para
   22/09" (o gatilho grava a mudança em nome da última pessoa que agiu, que
   era quem pediu), "50 dias de atraso" numa demanda aberta há três horas, e
   todos os gestos "há 18 min". Aqui a demanda nasce ANTES do prazo, o gesto
   de assumir (quando há) acontece no dia seguinte, e a mudança crua de prazo
   sai do histórico, porque ninguém a fez. */
create or replace function pg_temp.historia_possivel(p_numero int, p_dias int, p_assumiu_dias int)
returns void language plpgsql as $h$
declare v_id uuid;
begin
  select id into v_id from demandas.demandas where numero = p_numero;
  update demandas.demandas set criada_em = now() - make_interval(days => p_dias) where id = v_id;
  update demandas.eventos set em = now() - make_interval(days => p_dias)
   where demanda_id = v_id and tipo = 'abertura';
  delete from demandas.eventos where demanda_id = v_id and tipo = 'prazo';
  if p_assumiu_dias is not null then
    update demandas.eventos set em = now() - make_interval(days => p_assumiu_dias)
     where demanda_id = v_id
       and (tipo = 'responsavel' or (tipo = 'status' and de = 'aberta' and para = 'execucao'));
  end if;
end $h$;

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
  r := pg_temp.exige(public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Arte para o culto de domingo',
    'descricao','Precisamos de uma arte para o feed e para o story, no padrão da igreja.',
    'objetivo','Divulgar o culto de domingo para quem acompanha pelo Instagram.',
    'local','Instagram e grupo do WhatsApp', 'publico','Membros e visitantes',
    'categoria_id', c_divul, 'prioridade','normal',
    'prazo', (current_date + 5)::text)), 'dem_abrir: Arte para o culto de domingo');
  n1 := (r->>'numero')::int;

  /* 2. TÍTULO LONGO DE PROPÓSITO: é o que estoura a tela estreita */
  r := pg_temp.exige(public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Revisão completa do sistema de som e iluminação do templo antes da conferência de novembro',
    'descricao','As caixas de retorno do palco estão com chiado desde o último domingo, e dois refletores da frente não acendem. Antes da conferência precisamos de uma revisão completa, com troca do que estiver no fim da vida útil e um relatório do que foi feito.',
    'objetivo','Não correr risco de ficar sem som no meio da conferência, que é o maior evento do ano.',
    'local','Templo principal', 'publico','Toda a igreja e os visitantes da conferência',
    'categoria_id', c_manut, 'prioridade','alta',
    'prazo', (current_date + 20)::text, 'evento', true,
    'evento_data', (current_date + 30)::text)), 'dem_abrir: Revisão completa do sistema de som e iluminação do templo antes da conferência de novembro');
  n2 := (r->>'numero')::int;

  /* 3. compra: nasce travada esperando aprovação, com orçamento de 5 dígitos */
  r := pg_temp.exige(public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Compra de 12 cadeiras para a sala das crianças',
    'descricao','As cadeiras atuais estão quebrando. Orçamento já levantado com dois fornecedores.',
    'objetivo','Sala do GUIA Kids segura para as crianças.',
    'local','Sala 2 do GUIA Kids', 'publico','Crianças de 4 a 10 anos',
    'categoria_id', c_compra, 'prioridade','normal',
    'prazo', (current_date + 12)::text, 'orcamento', 14750.90)), 'dem_abrir: Compra de 12 cadeiras para a sala das crianças');
  n3 := (r->>'numero')::int;

  /* 4. em execução, com histórico comprido */
  r := pg_temp.exige(public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Vídeo de chamada para o Follow',
    'descricao','Um corte de 40 segundos com os melhores momentos do último Follow.',
    'objetivo','Puxar mais jovens para o sábado.',
    'local','Instagram', 'publico','Jovens de 15 a 24',
    'categoria_id', c_divul, 'prioridade','alta',
    'prazo', (current_date + 3)::text)), 'dem_abrir: Vídeo de chamada para o Follow');
  n4 := (r->>'numero')::int;
  perform pg_temp.exige(public.dem_mover(t_com, n4, 'assumir', '{}'::jsonb), 'dem_mover(t_com, n4, ''assumir'')');
  perform pg_temp.exige(public.dem_mover(t_com, n4, 'comentar',
    jsonb_build_object('texto','Separei o material bruto do último Follow, são 3 horas de gravação. Começo a decupagem amanhã.')), 'dem_mover(t_com, n4, ''comentar'')');
  perform pg_temp.exige(public.dem_mover(t_com, n4, 'comentar',
    jsonb_build_object('texto','Decupagem feita. Tenho 6 trechos bons, vou montar duas versões para a liderança escolher.')), 'dem_mover(t_com, n4, ''comentar'')');
  perform pg_temp.exige(public.dem_mover(t_com, n4, 'comentar',
    jsonb_build_object('texto','Primeira versão pronta, mandei no grupo da mídia para conferir o áudio.')), 'dem_mover(t_com, n4, ''comentar'')');

  /* 5. travada por falta de informação: o pedido volta para quem abriu */
  r := pg_temp.exige(public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Banner para a entrada do templo',
    'descricao','Um banner grande para a porta.',
    'objetivo','Sinalizar a entrada.',
    'local','Entrada', 'publico','Visitantes',
    'categoria_id', c_divul, 'prioridade','baixa',
    'sem_prazo_porque','Não tem data fechada ainda, depende da reforma da entrada.')), 'dem_abrir: Banner para a entrada do templo');
  n5 := (r->>'numero')::int;
  perform pg_temp.exige(public.dem_mover(t_com, n5, 'assumir', '{}'::jsonb), 'dem_mover(t_com, n5, ''assumir'')');
  perform pg_temp.exige(public.dem_mover(t_com, n5, 'travar',
    jsonb_build_object('motivo','informacao','texto','Qual a medida do banner e o texto que tem que estar nele? Sem isso não dá para orçar a impressão.')), 'dem_mover(t_com, n5, ''travar'')');

  /* 6. concluída, para a tela de números não ficar toda zerada */
  r := pg_temp.exige(public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Troca das lâmpadas do corredor',
    'descricao','Três lâmpadas queimadas no corredor da secretaria.',
    'objetivo','Corredor iluminado.',
    'local','Corredor da secretaria', 'publico','Equipe',
    'categoria_id', c_manut, 'prioridade','normal',
    'prazo', (current_date + 5)::text)), 'dem_abrir: Troca das lâmpadas do corredor');
  n6 := (r->>'numero')::int;
  /* O PRAZO NASCE NO FUTURO E DEPOIS ANDA PARA TRAS, porque e assim que
     acontece de verdade: ninguem abre uma demanda com prazo que ja passou, e
     desde a migracao 86 o servidor recusa isso com `PRAZO_NO_PASSADO`. A
     semente vinha abrindo com `current_date - 2` e, a partir da 86, a demanda
     6 simplesmente NAO NASCIA — em silencio, porque `perform` nao le a
     resposta. A tela de detalhe-concluida deixou de ter o que medir. */
  update demandas.demandas set prazo = current_date - 2 where numero = n6;
  perform pg_temp.exige(public.dem_mover(t_ges, n6, 'assumir', '{}'::jsonb), 'dem_mover(t_ges, n6, ''assumir'')');
  /* O `atraso` NAO E ENFEITE AQUI: esta demanda vence dois dias antes de ser
     concluida, e desde a migracao 86 o servidor recusa concluir depois do
     prazo sem uma palavra sobre o atraso. Sem esta chave a semente falhava em
     SILENCIO e a tela de detalhe-concluida deixava de existir — foi assim que
     eu descobri, com o medidor pedindo uma demanda concluida e nao achando
     nenhuma. */
  perform pg_temp.exige(public.dem_mover(t_ges, n6, 'concluir',
    jsonb_build_object('texto','Trocadas as três lâmpadas por LED. Sobrou uma de reserva, ficou no armário da secretaria.',
                       'atraso','A loja ficou sem LED de 9W e a gente esperou a reposição.')), 'dem_mover(t_ges, n6, ''concluir'')');
  perform pg_temp.historia_possivel(n6, 9, 8);

  /* 7. O QUE FALTAVA NESTA SEMENTE, E POR QUE 252/252 FICOU VERDE COM TRES
        DEFEITOS GRAVES DENTRO — 21/09/2026.

     Nenhuma das seis demandas acima tem um link colado, um anexo na lista ou
     uma palavra sem espaco. E e exatamente isso que a tela pede a pessoa:
     "Cole o link do arquivo (Drive, Fotos, o que for)". O medidor abria cada
     rota no estado inicial de uma semente higienica e nao via nada.

     As tres linhas abaixo poem no banco o que a igreja realmente cola, e o
     instrumento passa a pegar sozinho o que eu tive que abrir na mao. */
  r := pg_temp.exige(public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Arte do Follow para o Instagram',
    'descricao','Segue a referencia que a gente gostou: ' ||
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxxxxxxxxxxxxxxxxxxxxxxxx&index=7&t=142s',
    'objetivo','Divulgar o Follow.',
    'local','Instagram', 'publico','Jovens',
    'categoria_id', c_divul, 'prioridade','alta',
    'prazo', (current_date + 12)::text,
    'anexos', jsonb_build_array(
      jsonb_build_object('nome','referencia',
        'url','https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/view?usp=sharing_eip_se_dm')))), 'dem_abrir: Arte do Follow para o Instagram');
  n7 := (r->>'numero')::int;
  perform pg_temp.exige(public.dem_mover(t_com, n7, 'assumir', '{}'::jsonb), 'dem_mover(t_com, n7, ''assumir'')');
  perform pg_temp.exige(public.dem_mover(t_com, n7, 'comentar', jsonb_build_object('texto',
    'Primeira versao aqui: https://drive.google.com/file/d/1ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210/view?usp=sharing')), 'dem_mover(t_com, n7, ''comentar'')');

  /* 8. e uma ATRASADA de verdade, para a ordem da lista ter o que provar */
  r := pg_temp.exige(public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Consertar o ar da sala do Kids',
    'descricao','O ar da sala grande do Kids parou de gelar.',
    'objetivo','Sala utilizavel no domingo.',
    'local','Kids', 'publico','Criancas',
    'categoria_id', c_manut, 'prioridade','baixa',
    'prazo', (current_date + 5)::text)), 'dem_abrir: Consertar o ar da sala do Kids');
  n8 := (r->>'numero')::int;
  update demandas.demandas set prazo = current_date - 51 where numero = n8;
  perform pg_temp.historia_possivel(n8, 60, null);

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
  r := pg_temp.exige(public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Impressao dos cartoes de visitante',
    'descricao','Cem cartoes de visitante para o balcao da recepcao, no papel de sempre.',
    'objetivo','Recepcao com material para o domingo.',
    'local','Recepcao', 'publico','Visitantes',
    'categoria_id', c_manut, 'prioridade','normal',
    'prazo', (current_date + 6)::text)), 'dem_abrir: Impressao dos cartoes de visitante');
  n9 := (r->>'numero')::int;
  perform pg_temp.exige(public.dem_mover(t_ges, n9, 'assumir', '{}'::jsonb), 'dem_mover(t_ges, n9, ''assumir'')');
  perform pg_temp.exige(public.dem_mover(t_ges, n9, 'concluir',
    jsonb_build_object('texto','Cem cartoes impressos e entregues no balcao da recepcao.')), 'dem_mover(t_ges, n9, ''concluir'')');
  perform pg_temp.exige(public.dem_mover(t_pede, n9, 'validar', '{}'::jsonb), 'dem_mover(t_pede, n9, ''validar'')');

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

  /* O TETO DE DEZ POR HORA DA 94 VALE PARA ESTA SEMENTE TAMBEM.

     Pedro e quem pede, e quem pede tem teto: dez demandas por hora
     (`MUITAS_DE_UMA_VEZ`). Dentro de uma transacao `now()` nao anda, entao as
     nove de cima contam como abertas agora e a 11a seria recusada. Recuar a
     abertura das nove em tres horas e contar a historia como ela seria na
     igreja: ninguem abre doze pedidos no mesmo minuto. O teto em si tem
     conferencia propria na 94 (bloco 13) e em `demandas-banco.test.sql`. */
  update demandas.demandas set criada_em = criada_em - interval '3 hours'
   where aberta_por = (select id from demandas.membros where token = t_pede);
  /* e a linha "abriu a demanda" do histórico anda junto: a ficha dizia
     "Aberta em 12:31 · há 10 h" e, na atividade, "abriu a demanda · há 7 h" */
  update demandas.eventos set em = em - interval '3 hours'
   where tipo = 'abertura'
     and demanda_id in (select id from demandas.demandas
                         where aberta_por = (select id from demandas.membros where token = t_pede));

  /* 10. concluida e NAO validada, no setor de quem atende: e a que exercita o
         BOTAO "Resolveu, obrigado" da etapa 5 vendo pelos olhos de quem fez o
         trabalho e NAO pode confirmar o proprio servico. */
  r := pg_temp.exige(public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Post de agradecimento aos voluntarios do mutirao',
    'descricao','Um card para o feed agradecendo quem ficou ate o fim no mutirao de sabado.',
    'objetivo','Reconhecer publicamente quem trabalhou.',
    'local','Instagram', 'publico','Igreja toda',
    'categoria_id', c_divul, 'prioridade','normal',
    'prazo', (current_date + 4)::text)), 'dem_abrir: Post de agradecimento aos voluntarios do mutirao');
  n10 := (r->>'numero')::int;
  perform pg_temp.exige(public.dem_mover(t_com, n10, 'assumir', '{}'::jsonb), 'dem_mover(t_com, n10, ''assumir'')');
  perform pg_temp.exige(public.dem_mover(t_com, n10, 'concluir',
    jsonb_build_object('texto','Card publicado no feed e no story, com as fotos que o Pedro mandou.')), 'dem_mover(t_com, n10, ''concluir'')');

  /* 11. concluida E confirmada, no mesmo setor: e a FRASE "Validada por X",
         que e outra caixa e outra altura. */
  r := pg_temp.exige(public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Arte do aviso de mudanca de horario do culto de quarta',
    'descricao','Precisa sair antes de domingo para a igreja toda ficar sabendo.',
    'objetivo','Ninguem chegar no horario velho.',
    'local','Instagram e WhatsApp', 'publico','Membros',
    'categoria_id', c_divul, 'prioridade','alta',
    'prazo', (current_date + 7)::text)), 'dem_abrir: Arte do aviso de mudanca de horario do culto de quarta');
  n11 := (r->>'numero')::int;
  perform pg_temp.exige(public.dem_mover(t_com, n11, 'assumir', '{}'::jsonb), 'dem_mover(t_com, n11, ''assumir'')');
  perform pg_temp.exige(public.dem_mover(t_com, n11, 'concluir',
    jsonb_build_object('texto','Arte pronta, publicada nos dois canais na quinta de manha.')), 'dem_mover(t_com, n11, ''concluir'')');
  perform pg_temp.exige(public.dem_mover(t_pede, n11, 'validar', '{}'::jsonb), 'dem_mover(t_pede, n11, ''validar'')');

  /* 12. atrasada no setor de quem atende: a pilula vermelha e o "N dias de
         atraso" so foram medidos pelos olhos de quem pede e do admin. */
  r := pg_temp.exige(public.dem_abrir(t_pede, jsonb_build_object(
    'titulo','Atualizar a capa do canal do YouTube',
    'descricao','A capa ainda e a da conferencia do ano passado.',
    'objetivo','Canal com a cara certa para quem chega pelo YouTube.',
    'local','YouTube', 'publico','Visitantes',
    'categoria_id', c_divul, 'prioridade','baixa',
    'prazo', (current_date + 5)::text)), 'dem_abrir: Atualizar a capa do canal do YouTube');
  n12 := (r->>'numero')::int;
  update demandas.demandas set prazo = current_date - 18 where numero = n12;
  perform pg_temp.historia_possivel(n12, 25, null);

  /* 13. QUEM ACOMPANHA SEM TER PEDIDO · migração 94.

     Pedro inclui Rafael na demanda 1, pelo e-mail (a 94 nunca acha pessoa
     por nome: seria uma lista telefonica da igreja aberta a qualquer membro).
     Rafael e do mesmo ministerio e passa a ver a 1, e SO a 1 das de Pedro. E
     ele tem o proprio pedido, para o Inicio dele ter "Minhas" e "Acompanho". */
  perform pg_temp.exige(public.dem_mover(t_pede, n1, 'incluir',
    jsonb_build_object('quem', 'rafael@exemplo.org')), 'dem_mover(t_pede, n1, ''incluir'')');
  perform pg_temp.exige(public.dem_mover(t_com, n1, 'comentar',
    jsonb_build_object('texto', 'Vou usar a paleta nova. Rafael, me manda as fotos da recepcao ate quinta?')),
    'dem_mover(t_com, n1, ''comentar'')');
  r := pg_temp.exige(public.dem_abrir('tok-colega', jsonb_build_object(
    'titulo','Placas de sinalizacao para a recepcao',
    'descricao','Placas indicando banheiro, Kids e auditorio, no padrao visual da igreja.',
    'objetivo','Visitante achar sozinho onde ir.',
    'local','Recepcao', 'publico','Visitantes',
    'categoria_id', c_divul, 'prioridade','normal',
    'prazo', (current_date + 15)::text)), 'dem_abrir: Placas de sinalizacao para a recepcao');

  raise notice 'semeado: % % % % % % % % % % % % e a de Rafael: %',
    n1, n2, n3, n4, n5, n6, n7, n8, n9, n10, n11, n12, (r->>'numero');
end $$;
