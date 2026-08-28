-- ============ POSTO EXPLICADO, E MINISTÉRIO SEM NÍVEL DECLARADO ===========
-- Dois pedidos que andam juntos, e os dois são sobre a mesma coisa: quem se
-- cadastra no Serviço do Culto precisa saber o que o posto exige ANTES de
-- marcar, e não precisa se auto-avaliar depois.
--
-- 1) NÍVEL SAI DO SERVIÇO. Na Mídia faz sentido perguntar "faço sozinho ou
--    ajudo", porque o time forma gente na prática e o sorteio precisa saber
--    quem segura a área. No Serviço do Culto o posto é ocupado por quem já
--    sabe: não existe meio-termo para conferir, e quem quer aprender fala com
--    a liderança em vez de se marcar. Marcar um posto passa a ser uma coisa
--    só: eu faço. Continua entrando como não conferido, então o líder ainda
--    valida antes de valer no sorteio.
--
-- 2) CADA POSTO EXPLICA A PRÓPRIA FUNÇÃO. Uma lista de 12 nomes em caixa alta
--    não diz a ninguém o que é ser SETOR C. Sem isso a pessoa marca no chute e
--    a conferência do líder vira o primeiro momento em que alguém descobre o
--    engano.

alter table equipes add column if not exists sem_niveis     boolean not null default false;
alter table equipes add column if not exists aviso_cadastro text;
alter table funcoes add column if not exists descricao      text;

comment on column equipes.sem_niveis is
  'true = marcar um posto é só "eu faço", sem escolher nível. Para ministério que só aloca quem já sabe.';
comment on column equipes.aviso_cadastro is
  'recado no alto da tela pública de cadastro deste ministério';
comment on column funcoes.descricao is
  'o que este posto faz, em uma ou duas frases, mostrado na tela de cadastro';

update equipes
   set sem_niveis = true,
       aviso_cadastro = 'Estes postos são para quem já sabe a função. Se você quer se voluntariar e aprender, chama no (21) 99594-6491 que a liderança te encaixa.'
 where slug = 'servico';

-- ------------------------------------------------------------ descrições --
do $$
declare v_eq uuid;
begin
  select id into v_eq from equipes where slug = 'servico';
  if v_eq is null then return; end if;

  update funcoes set descricao = d.txt from (values
    ('LÍDER 1', 'Chega antes das 9h, reúne o grupo para orar e responde pelo serviço do dia. Cuida do púlpito e da água do pastor, conta o ofertório junto com ele, é o último a sair e preenche o relatório no fim do culto.'),
    ('LÍDER 2', 'Mesma responsabilidade do Líder 1: os dois lideram juntos, dão uma volta pela igreja durante o culto para ver como está o serviço e saem depois da inspeção final.'),
    ('ESTACIONAMENTO 1', 'Chega às 8h30 para organizar os cones. Orienta quem estaciona para não bloquear a saída dos vizinhos e deixa livres as vagas perto das entradas deles.'),
    ('ESTACIONAMENTO 2', 'Fica no estacionamento o culto inteiro: se um precisa sair, o outro permanece. Em dia de chuva, ajuda os irmãos com guarda-chuva.'),
    ('ESTACIONAMENTO 3', 'Zela para as vagas reservadas serem respeitadas e apoia os outros dois em horário de pico e em dia de chuva.'),
    ('RECEPÇÃO 1', 'Chega antes das 9h e recebe com alegria, na porta da rua ou na porta do templo. Identifica o visitante, anota nome e telefone e entrega no fim para a sala do visitante.'),
    ('RECEPÇÃO 2', 'Ajuda o visitante a se situar: banheiro, bebedouro, sala Kids. Fica na posição das 9h30 até o fim do louvor e depois na entrada do templo, evitando que criança saia desacompanhada.'),
    ('GABINETE, COZINHA E BANHEIROS', 'É um casal. Prepara o café dos pastores (só o homem entra no gabinete se o pastor estiver lá), confere os banheiros, cada um o do seu sexo, troca o galão do bebedouro e mantém a parte de fora do templo organizada. Defeito encontrado vai para o líder do dia.'),
    ('SETOR A', 'Frente, lado esquerdo de quem entra. Recebe os irmãos, orienta a ocupação da frente para trás, ajuda no dízimo e na oferta e recolhe os cálices da ceia no setor.'),
    ('SETOR B', 'Frente, lado direito de quem entra. Mesmas tarefas do setor A, sentado no ponto que dá a melhor visão do próprio setor.'),
    ('SETOR C', 'Fundos, lado esquerdo de quem entra. Resolve o que é simples e chama outro setor ou o líder quando precisa.'),
    ('SETOR D', 'Fundos, lado direito de quem entra. Fica atento a qualquer coisa que atrapalhe o culto e só sai do setor para ajudar em outra situação, voltando logo depois.')
  ) as d(nome, txt)
  where funcoes.equipe_id = v_eq and funcoes.nome = d.nome;
end $$;

----------------------------------------------------------------------------
-- as duas funções públicas passam a carregar o que a tela precisa
drop function if exists equipe_funcoes(text);
create function equipe_funcoes(p_slug text)
returns table (nome text, ordem int, tipos text[], relata boolean, descricao text)
language sql security definer stable set search_path = public as $$
  select f.nome, f.ordem, coalesce(f.tipos, array['domingo','follow']), f.relata, f.descricao
    from funcoes f join equipes e on e.id = f.equipe_id
   where e.slug = p_slug and f.ativa
   order by f.ordem, f.nome;
$$;
revoke all on function equipe_funcoes(text) from public;
grant execute on function equipe_funcoes(text) to anon, authenticated;

drop function if exists equipe_publica(text);
create function equipe_publica(p_slug text)
returns table (equipe text, voluntario_id uuid, primeiro_nome text, precisa_link boolean,
               sem_niveis boolean, aviso_cadastro text)
language sql security definer stable set search_path = public as $$
  select e.nome, v.id, split_part(v.nome, ' ', 1),
         coalesce(length(nullif(tel_norm(v.telefone), '')), 0) < 4,
         e.sem_niveis, e.aviso_cadastro
    from equipes e
    left join voluntarios v on v.equipe_id = e.id and v.ativo
   where e.slug = p_slug
   order by v.nome;
$$;
revoke all on function equipe_publica(text) from public;
grant execute on function equipe_publica(text) to anon, authenticated;

-- conferência
select e.nome, e.sem_niveis, (e.aviso_cadastro is not null) as tem_aviso,
       (select count(*) from funcoes f where f.equipe_id = e.id and f.descricao is not null) as postos_explicados,
       (select count(*) from funcoes f where f.equipe_id = e.id and f.ativa) as postos
  from equipes e order by e.ordem;
