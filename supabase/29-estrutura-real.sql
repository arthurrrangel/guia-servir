-- =============================================================================
-- 29 — A ESTRUTURA REAL DAS EQUIPES
--
-- Até aqui o sistema tinha três equipes com os nomes que eu tinha inferido:
-- "Mídia", "Louvor" e "Diaconia". O relatório de estrutura da igreja
-- (27/08/2026) diz outra coisa, e o Arthur confirmou a leitura:
--
--   Creative   = multimídia. É o que estava como "Mídia".
--   Louvor     = já estava certo.
--   GUIA Kids  = departamento infantil. NÃO existia no sistema.
--   Connect    = os diáconos E a livraria. É o que estava como "Diaconia".
--   Trilho     = fica de fora por enquanto, por decisão do Arthur.
--
-- O QUE NÃO MUDA: os slugs. `midia` e `servico` continuam nas URLs porque
-- esses links já foram colados em grupo de WhatsApp, e link de igreja circula
-- por meses. Nome é o que a pessoa lê; slug é endereço. Trocar o segundo
-- quebraria o que já está na mão das pessoas para arrumar uma coisa que
-- ninguém vê.
--
-- O GUIA KIDS ENTRA COM APROVAÇÃO OBRIGATÓRIA. Não é preferência de produto:
-- é ministério com criança. Ninguém é escalado sem que a liderança converse
-- antes, e o sistema tem que impedir isso por desenho, não por combinado.
-- =============================================================================

begin;

-- ---------------------------------------------------------------- Creative --
update equipes set
  nome = 'Creative',
  artigo = 'o',
  descricao = 'Mídia, som, iluminação, fotografia e as funções técnicas e criativas que fazem o culto acontecer e chegar mais longe.',
  convite = 'Ninguém entra sabendo. Se você gosta de câmera, som ou edição, aqui você aprende fazendo, ao lado de quem já faz.'
where slug = 'midia';

-- ------------------------------------------------------------------ Louvor --
update equipes set
  descricao = 'Conduz a igreja na adoração, no domingo e nos encontros da semana: vocal, banda, som e palco.',
  convite = 'O Louvor ensaia durante a semana e conversa com cada pessoa antes de escalar.'
where slug = 'louvor';

-- ----------------------------------------------------------------- Connect --
update equipes set
  nome = 'Connect',
  artigo = 'o',
  descricao = 'Acolhimento, cuidado e apoio às pessoas durante os cultos: recepção, estacionamento, segurança, visitantes e livraria.',
  convite = 'Quem chega na igreja encontra o Connect primeiro. É a equipe que faz o domingo funcionar sem ninguém perceber.'
where slug = 'servico';

-- as funções que faltavam no Connect, vindas do relatório
insert into funcoes (equipe_id, nome, ordem, ativa, tipos, descricao, descricao_familia)
select e.id, v.nome, v.ordem, true, array['culto']::text[], v.descricao, v.familia
from equipes e,
     (values
       ('SEGURANÇA 1', 40, 'Zela pela segurança durante o culto, observa o ambiente e apoia em emergências.', 'Segurança do culto: observar, prevenir e apoiar quando alguma coisa foge do previsto.'),
       ('SEGURANÇA 2', 41, 'Zela pela segurança durante o culto, observa o ambiente e apoia em emergências.', null),
       ('VISITANTES 1', 50, 'Identifica e acolhe quem está vindo pela primeira vez, e encaminha para o acompanhamento.', 'Quem chega pela primeira vez é recebido por essa dupla, que apresenta a casa e encaminha o próximo passo.'),
       ('VISITANTES 2', 51, 'Identifica e acolhe quem está vindo pela primeira vez, e encaminha para o acompanhamento.', null),
       ('LIVRARIA 1', 60, 'Atende a livraria antes e depois do culto.', 'A livraria abre antes e fecha depois do culto, com duas pessoas por domingo.'),
       ('LIVRARIA 2', 61, 'Atende a livraria antes e depois do culto.', null)
     ) as v(nome, ordem, descricao, familia)
where e.slug = 'servico'
  and not exists (select 1 from funcoes f where f.equipe_id = e.id and f.nome = v.nome);

-- descrições das funções que já existiam no Connect e estavam sem texto
update funcoes f set
  descricao_familia = coalesce(f.descricao_familia,
    'Orienta a chegada e a saída dos carros e organiza o fluxo do estacionamento.')
from equipes e where f.equipe_id = e.id and e.slug='servico' and f.nome = 'ESTACIONAMENTO 1';
update funcoes f set
  descricao_familia = coalesce(f.descricao_familia,
    'Recebe membros e visitantes, orienta onde fica cada espaço e encaminha quem precisa de alguma coisa.')
from equipes e where f.equipe_id = e.id and e.slug='servico' and f.nome = 'RECEPÇÃO 1';

-- --------------------------------------------------------------- GUIA Kids --
insert into equipes (nome, slug, ordem, artigo, exige_aprovacao, descricao, convite,
                     aviso_cadastro, sem_niveis)
select 'GUIA Kids', 'kids', 30, 'o', true,
       'Cuida, ensina e acompanha as crianças durante o culto, em quatro turmas por faixa etária.',
       'Servir com criança pede preparo. A liderança conversa com cada pessoa antes de escalar, sempre.',
       'O GUIA Kids conversa com cada pessoa antes de escalar. Você preenche o cadastro e a liderança fala com você.',
       false
where not exists (select 1 from equipes where slug = 'kids');

-- as nove posições por culto: quatro turmas com professora e auxiliar, mais o lanche.
-- Professora conduz a turma; auxiliar apoia a professora, as crianças e a segurança
-- da sala. Os dois papéis são funções separadas de propósito: no infantil, "quem
-- conduz" e "quem apoia" não podem ser a mesma linha da escala.
insert into funcoes (equipe_id, nome, ordem, ativa, tipos, descricao, descricao_familia)
select e.id, v.nome, v.ordem, true, array['culto']::text[], v.descricao, v.familia
from equipes e,
     (values
       ('BERÇÁRIO PROFESSORA',  10, 'Conduz a turma dos bebês, de 0 a 1 ano e 11 meses.', 'Sala dos bebês, de 0 a 1 ano e 11 meses. Duas voluntárias por culto.'),
       ('BERÇÁRIO AUXILIAR',    11, 'Apoia a professora, as crianças e a organização da sala.', null),
       ('TURMA 2-4 PROFESSORA', 20, 'Conduz a turma de 2 a 4 anos: ensino e atividades.', 'Turma de 2 a 4 anos. Duas voluntárias por culto: uma conduz, outra apoia.'),
       ('TURMA 2-4 AUXILIAR',   21, 'Apoia a professora, as crianças e a organização da sala.', null),
       ('TURMA 5-7 PROFESSORA', 30, 'Conduz a turma de 5 a 7 anos: ensino e atividades.', 'Turma de 5 a 7 anos. Duas voluntárias por culto: uma conduz, outra apoia.'),
       ('TURMA 5-7 AUXILIAR',   31, 'Apoia a professora, as crianças e a organização da sala.', null),
       ('TURMA 8-12 PROFESSORA',40, 'Conduz a turma de 8 a 12 anos: ensino e atividades.', 'Turma de 8 a 12 anos. Duas voluntárias por culto: uma conduz, outra apoia.'),
       ('TURMA 8-12 AUXILIAR',  41, 'Apoia a professora, as crianças e a organização da sala.', null),
       ('LANCHE',               50, 'Prepara e organiza o lanche das crianças.', 'Prepara e organiza o lanche das crianças. Uma pessoa por culto.')
     ) as v(nome, ordem, descricao, familia)
where e.slug = 'kids'
  and not exists (select 1 from funcoes f where f.equipe_id = e.id and f.nome = v.nome);

-- perguntas próprias do infantil. As duas primeiras não são burocracia: são o
-- mínimo que a liderança precisa saber antes de marcar uma conversa.
insert into perguntas (equipe_id, ordem, texto, ajuda, tipo, obrigatoria, ativa)
select e.id, v.ordem, v.texto, v.ajuda, v.tipo::tipo_pergunta, v.obr, true
from equipes e,
     (values
       (10, 'Você já trabalhou ou serviu com crianças antes?', 'Escola, igreja, família, qualquer contexto.', 'texto_longo', true),
       (20, 'Com qual faixa etária você tem mais facilidade?', 'Pode marcar mais de uma.', 'multipla', false),
       (30, 'Você tem disponibilidade para chegar 30 minutos antes do culto?', 'A sala abre antes do culto para receber as crianças.', 'sim_nao', true)
     ) as v(ordem, texto, ajuda, tipo, obr)
where e.slug = 'kids'
  and not exists (select 1 from perguntas p where p.equipe_id = e.id and p.texto = v.texto);

update perguntas set opcoes = array['Berçário (0 a 1 ano)','2 a 4 anos','5 a 7 anos','8 a 12 anos','Tanto faz']
where texto = 'Com qual faixa etária você tem mais facilidade?';

-- ordem de exibição: Creative, Louvor, GUIA Kids, Connect
update equipes set ordem = 10 where slug = 'midia';
update equipes set ordem = 20 where slug = 'louvor';
update equipes set ordem = 30 where slug = 'kids';
update equipes set ordem = 40 where slug = 'servico';

-- =============================================================================
-- ministerios_publicos() passa a devolver o responsável
--
-- A tela da área mostra QUEM vai falar com a pessoa antes dela se cadastrar.
-- Sem isso, "a liderança entra em contato" é uma frase sem dono, e frase sem
-- dono é o que faz cadastro morrer na gaveta.
--
-- Tipo de retorno mudou, então precisa de DROP: `create or replace` não muda
-- assinatura de RETURNS TABLE.
-- =============================================================================
drop function if exists ministerios_publicos();
create function ministerios_publicos()
returns table (
  slug text, nome text, descricao text, convite text,
  postos bigint, aberto boolean, artigo text,
  responsavel text, whatsapp text
)
language sql security definer stable set search_path = public as $$
  select e.slug, e.nome, e.descricao, e.convite,
         count(f.id) filter (where f.ativa) as postos,
         not e.exige_aprovacao as aberto,
         e.artigo,
         e.responsavel_nome, e.responsavel_whatsapp
  from equipes e
  left join funcoes f on f.equipe_id = e.id
  group by e.id, e.slug, e.nome, e.descricao, e.convite, e.exige_aprovacao,
           e.artigo, e.responsavel_nome, e.responsavel_whatsapp, e.ordem
  having count(f.id) filter (where f.ativa) > 0
  order by e.ordem;
$$;
revoke all on function ministerios_publicos() from public;
grant execute on function ministerios_publicos() to anon, authenticated;

commit;
