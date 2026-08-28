-- =================== A EXPLICAÇÃO É DA FAMÍLIA, NÃO DE CADA POSTO =========
-- A primeira versão colocou uma descrição em cada um dos 12 postos. No papel
-- parecia certo; na tela ficou o parágrafo do LÍDER impresso duas vezes
-- seguidas, o do ESTACIONAMENTO três, o do SETOR quatro. Doze postos com cinco
-- explicações de verdade, repetidas doze vezes: a página triplicou de altura e
-- a repetição faz o texto virar paisagem, que é o oposto de explicar.
--
-- Agora existem dois níveis:
--   descricao_familia -> o que o grupo faz. Aparece UMA vez, no título.
--   descricao         -> só o que distingue aquele posto dos irmãos dele
--                        (a posição do setor). Vazio quando nada distingue.

alter table funcoes add column if not exists descricao_familia text;
comment on column funcoes.descricao_familia is
  'o que a família de postos faz (LÍDER, SETOR...). Mostrada uma vez no título do grupo.';
comment on column funcoes.descricao is
  'só o que distingue este posto dos irmãos da mesma família. Vazio quando nada distingue.';

do $$
declare v_eq uuid;
begin
  select id into v_eq from equipes where slug = 'servico';
  if v_eq is null then return; end if;

  update funcoes set descricao_familia = d.fam, descricao = d.posto from (values
    ('LÍDER 1', 'Os dois lideram juntos. Chegam antes das 9h, reúnem o grupo para orar, cuidam do púlpito e da água do pastor, contam o ofertório com o pastor, dão uma volta pela igreja durante o culto para ver como está o serviço e são os últimos a sair. No fim, preenchem o relatório do dia.', ''),
    ('LÍDER 2', 'Os dois lideram juntos. Chegam antes das 9h, reúnem o grupo para orar, cuidam do púlpito e da água do pastor, contam o ofertório com o pastor, dão uma volta pela igreja durante o culto para ver como está o serviço e são os últimos a sair. No fim, preenchem o relatório do dia.', ''),

    ('ESTACIONAMENTO 1', 'Chegam às 8h30 para organizar os cones. Orientam quem estaciona para não bloquear a saída dos vizinhos e deixam livres as vagas perto das entradas deles. Ficam no estacionamento o culto inteiro: se um precisa sair, o outro permanece. Em dia de chuva, ajudam os irmãos com guarda-chuva.', ''),
    ('ESTACIONAMENTO 2', 'Chegam às 8h30 para organizar os cones. Orientam quem estaciona para não bloquear a saída dos vizinhos e deixam livres as vagas perto das entradas deles. Ficam no estacionamento o culto inteiro: se um precisa sair, o outro permanece. Em dia de chuva, ajudam os irmãos com guarda-chuva.', ''),
    ('ESTACIONAMENTO 3', 'Chegam às 8h30 para organizar os cones. Orientam quem estaciona para não bloquear a saída dos vizinhos e deixam livres as vagas perto das entradas deles. Ficam no estacionamento o culto inteiro: se um precisa sair, o outro permanece. Em dia de chuva, ajudam os irmãos com guarda-chuva.', ''),

    ('RECEPÇÃO 1', 'Chegam antes das 9h e recebem com alegria. Podem se dividir entre a porta da rua e a porta do templo. Identificam o visitante, anotam nome e telefone e entregam no fim para a sala do visitante, e mostram onde é banheiro, bebedouro e sala Kids. Ficam na posição das 9h30 até o fim do louvor e depois na entrada do templo, evitando que criança saia desacompanhada.', ''),
    ('RECEPÇÃO 2', 'Chegam antes das 9h e recebem com alegria. Podem se dividir entre a porta da rua e a porta do templo. Identificam o visitante, anotam nome e telefone e entregam no fim para a sala do visitante, e mostram onde é banheiro, bebedouro e sala Kids. Ficam na posição das 9h30 até o fim do louvor e depois na entrada do templo, evitando que criança saia desacompanhada.', ''),

    ('GABINETE, COZINHA E BANHEIROS', '', 'É um casal. Prepara o café dos pastores, e só o homem entra no gabinete se o pastor estiver lá. Conferem os banheiros, cada um o do seu sexo, olhando limpeza e falta de material, trocam o galão do bebedouro e mantêm a parte de fora do templo organizada. Defeito encontrado vai para o líder do dia anotar no relatório.'),

    ('SETOR A', 'Cada um cuida de um quarto do templo. Confere se está tudo certo no setor antes de começar, recebe os irmãos e orienta a ocupação da frente para trás, ajuda no dízimo e na oferta com máquina ou PIX, recolhe os cálices da ceia e senta no ponto de melhor visão do setor. Só sai dali para ajudar em outra situação, e volta logo depois.', 'frente, lado esquerdo de quem entra'),
    ('SETOR B', 'Cada um cuida de um quarto do templo. Confere se está tudo certo no setor antes de começar, recebe os irmãos e orienta a ocupação da frente para trás, ajuda no dízimo e na oferta com máquina ou PIX, recolhe os cálices da ceia e senta no ponto de melhor visão do setor. Só sai dali para ajudar em outra situação, e volta logo depois.', 'frente, lado direito de quem entra'),
    ('SETOR C', 'Cada um cuida de um quarto do templo. Confere se está tudo certo no setor antes de começar, recebe os irmãos e orienta a ocupação da frente para trás, ajuda no dízimo e na oferta com máquina ou PIX, recolhe os cálices da ceia e senta no ponto de melhor visão do setor. Só sai dali para ajudar em outra situação, e volta logo depois.', 'fundos, lado esquerdo de quem entra'),
    ('SETOR D', 'Cada um cuida de um quarto do templo. Confere se está tudo certo no setor antes de começar, recebe os irmãos e orienta a ocupação da frente para trás, ajuda no dízimo e na oferta com máquina ou PIX, recolhe os cálices da ceia e senta no ponto de melhor visão do setor. Só sai dali para ajudar em outra situação, e volta logo depois.', 'fundos, lado direito de quem entra')
  ) as d(nome, fam, posto)
  where funcoes.equipe_id = v_eq and funcoes.nome = d.nome;

  update funcoes set descricao = nullif(descricao, ''),
                     descricao_familia = nullif(descricao_familia, '')
   where equipe_id = v_eq;
end $$;

----------------------------------------------------------------------------
drop function if exists equipe_funcoes(text);
create function equipe_funcoes(p_slug text)
returns table (nome text, ordem int, tipos text[], relata boolean,
               descricao text, descricao_familia text)
language sql security definer stable set search_path = public as $$
  select f.nome, f.ordem, coalesce(f.tipos, array['domingo','follow']), f.relata,
         f.descricao, f.descricao_familia
    from funcoes f join equipes e on e.id = f.equipe_id
   where e.slug = p_slug and f.ativa
   order by f.ordem, f.nome;
$$;
revoke all on function equipe_funcoes(text) from public;
grant execute on function equipe_funcoes(text) to anon, authenticated;

-- conferência
select nome, coalesce(nullif(left(descricao_familia, 34), ''), '—') as familia,
       coalesce(nullif(descricao, ''), '—') as so_deste_posto
  from funcoes where equipe_id = (select id from equipes where slug = 'servico')
 order by ordem;
