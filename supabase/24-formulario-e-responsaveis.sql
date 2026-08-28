-- =========================================================================
-- 24 — O FORMULÁRIO DE CADA ÁREA, E QUEM RESPONDE POR ELA
--
-- Perguntas curtas de propósito. A §8 pede questionário inteligente, e
-- inteligente aqui quer dizer POUCAS perguntas certas: quem está preenchendo
-- pelo celular, em pé, depois do culto, abandona um formulário longo.
--
-- equipe_id nulo = pergunta de todos os ministérios.
-- =========================================================================

delete from perguntas where ativa;   -- idempotente: reescreve o conjunto

-- ---- de todos
insert into perguntas (equipe_id, ordem, texto, ajuda, tipo, opcoes, obrigatoria) values
  (null, 10, 'Você já serve em alguma outra área da igreja?', null, 'sim_nao', '{}', false),
  (null, 20, 'Com que frequência você consegue servir?', 'Dá para mudar depois — isso é só para a liderança se organizar.',
   'escolha', '{"Todo domingo","Dois domingos por mês","Um domingo por mês","Só quando precisarem"}', true);

-- ---- Mídia
insert into perguntas (equipe_id, ordem, texto, ajuda, tipo, opcoes, obrigatoria)
select e.id, o, t, a, tp::tipo_pergunta, op, ob from equipes e, (values
  (110, 'Você já mexeu com câmera, foto, edição ou projeção?', 'Vale qualquer experiência, inclusive fora da igreja.', 'sim_nao', '{}'::text[], true),
  (120, 'Conte rapidamente o que você já fez', 'Uma ou duas linhas. Se nunca fez nada, escreva "nunca fiz" — tem gente para ensinar.', 'texto_longo', '{}'::text[], false),
  (130, 'Você tem equipamento próprio?', null, 'escolha', '{"Câmera","Notebook","Os dois","Nenhum"}'::text[], false)
) as v(o,t,a,tp,op,ob) where e.slug = 'midia';

-- ---- Louvor
insert into perguntas (equipe_id, ordem, texto, ajuda, tipo, opcoes, obrigatoria)
select e.id, o, t, a, tp::tipo_pergunta, op, ob from equipes e, (values
  (110, 'O que você faz?', null, 'multipla', '{"Canto","Violão","Guitarra","Contrabaixo","Bateria","Teclado","Som","Palco e cabos"}'::text[], true),
  (120, 'Há quanto tempo?', null, 'escolha', '{"Estou começando","1 a 3 anos","Mais de 3 anos"}'::text[], true),
  (130, 'Você consegue vir aos ensaios de sábado?', 'O ensaio é mais cedo que o Follow.', 'sim_nao', '{}'::text[], true),
  (140, 'Já serviu no louvor de outra igreja?', null, 'texto', '{}'::text[], false)
) as v(o,t,a,tp,op,ob) where e.slug = 'louvor';

-- ---- Diaconia
insert into perguntas (equipe_id, ordem, texto, ajuda, tipo, opcoes, obrigatoria)
select e.id, o, t, a, tp::tipo_pergunta, op, ob from equipes e, (values
  (110, 'Você se sente bem recebendo e conversando com quem chega?', null, 'sim_nao', '{}'::text[], true),
  (120, 'Tem alguma limitação para ficar em pé por bastante tempo?', 'Pergunta prática, para te encaixar no posto certo.', 'sim_nao', '{}'::text[], false),
  (130, 'Alguma coisa que a liderança precise saber?', null, 'texto_longo', '{}'::text[], false)
) as v(o,t,a,tp,op,ob) where e.slug = 'servico';

-- =========================================================================
-- QUEM RESPONDE POR CADA ÁREA  (§11, §27)
-- O número sai do cadastro de quem já lidera, e não de literal no código.
-- =========================================================================
update equipes e set responsavel_nome = 'Jander',
       responsavel_whatsapp = (select tel_norm(v.telefone) from voluntarios v
                                where v.equipe_id = e.id and v.nome ilike 'jander%' limit 1)
 where e.slug = 'louvor';

update equipes e set responsavel_nome = 'João Vitor',
       responsavel_whatsapp = (select tel_norm(v.telefone) from voluntarios v
                                where v.equipe_id = e.id and (v.nome ilike 'joão vi%' or v.nome ilike 'joao vi%') limit 1)
 where e.slug = 'midia';

-- =========================================================================
-- PRIMEIROS PASSOS DA INTEGRAÇÃO  (§20)
-- =========================================================================
delete from onboarding_etapas;
insert into onboarding_etapas (equipe_id, ordem, titulo, descricao) values
  (null, 10, 'Conhecer quem lidera', 'Uma conversa, nem que seja no WhatsApp.'),
  (null, 20, 'Entrar no grupo da área', 'É por lá que sai a escala e o aviso da semana.'),
  (null, 30, 'Ver alguém fazendo', 'Um domingo acompanhando, antes de assumir sozinho.'),
  (null, 40, 'Primeiro serviço', 'Chega mais cedo neste dia. Sempre tem alguém junto.');
