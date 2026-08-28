-- =============================================================================
-- 30 — CORREÇÃO DA 29
--
-- Na 29 eu li o relatório e assumi duas coisas que o Arthur desfez na hora:
--
-- 1. Renomeei a Mídia para "Creative" e reescrevi o texto dela e o do Louvor.
--    Ele foi direto: "a estrutura que foi criada para multimídia e para o
--    louvor, não altere absolutamente nada". Essas duas áreas já rodam com
--    gente dentro, com escala fechando e com líder que fala esse nome. Nome de
--    equipe que muda debaixo de quem já usa é ruído puro. Revertido ao original.
--
-- 2. Coloquei a Livraria como duas funções dentro do Connect, porque a primeira
--    mensagem dizia "connect são os diáconos e livraria". A mensagem seguinte
--    listou as áreas a criar: "diaconia, connect, ou seja diaconia é o connect.
--    Kids, e livraria". A Livraria é área própria, como o relatório também
--    trazia. As duas funções saem do Connect e viram equipe.
--
-- O que fica da 29: o GUIA Kids inteiro, o Connect com nome novo e as funções
-- de segurança e visitantes, e o responsável em ministerios_publicos().
-- =============================================================================

-- ------------------------------------------------- volta ao que já existia --
update equipes set
  nome      = 'Mídia',
  artigo    = 'a',
  descricao = 'A Mídia é quem registra e transmite o que acontece na igreja: câmera, projeção, luz, foto, edição e a transmissão ao vivo.',
  convite   = 'Se você gosta de câmera, computador ou edição, ou quer aprender, tem lugar aqui.'
where slug = 'midia';

update equipes set
  descricao = 'O Louvor conduz a igreja na adoração, no domingo e no Follow: vocal, banda, som e palco.',
  convite   = 'Se você canta ou toca, o primeiro passo é conversar com a liderança.'
where slug = 'louvor';

-- --------------------------------------------- Connect sem a livraria dentro --
update equipes set
  descricao = 'O Connect cuida de quem chega: recepção, estacionamento, segurança, visitantes e os setores do salão.',
  convite   = 'Não precisa saber nada antes. Precisa querer receber bem.'
where slug = 'servico';

delete from funcoes f
using equipes e
where f.equipe_id = e.id and e.slug = 'servico' and f.nome in ('LIVRARIA 1','LIVRARIA 2')
  and not exists (select 1 from habilidades h where h.funcao_id = f.id)
  and not exists (select 1 from escalacoes x where x.funcao_id = f.id);

-- ------------------------------------------------------------- Livraria ----
insert into equipes (nome, slug, ordem, artigo, exige_aprovacao, descricao, convite, sem_niveis)
select 'Livraria', 'livraria', 50, 'a', false,
       'A Livraria abre antes do culto e fecha depois, atendendo quem quer levar um livro ou uma indicação para casa.',
       'São duas pessoas por domingo. Se você gosta de livro e de conversar com gente, é aqui.',
       false
where not exists (select 1 from equipes where slug = 'livraria');

insert into funcoes (equipe_id, nome, ordem, ativa, tipos, descricao, descricao_familia)
select e.id, v.nome, v.ordem, true, array['culto']::text[], v.descricao, v.familia
from equipes e,
     (values
       ('LIVRARIA 1', 10, 'Atende a livraria antes e depois do culto.', 'Duas pessoas por domingo: uma abre antes do culto, as duas atendem na saída.'),
       ('LIVRARIA 2', 11, 'Atende a livraria antes e depois do culto.', null)
     ) as v(nome, ordem, descricao, familia)
where e.slug = 'livraria'
  and not exists (select 1 from funcoes f where f.equipe_id = e.id and f.nome = v.nome);
