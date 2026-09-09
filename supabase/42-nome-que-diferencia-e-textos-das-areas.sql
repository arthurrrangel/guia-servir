/* =============================================================================
   42 · DOIS CLÁUDIOS NA MESMA LISTA, E OS TEXTOS PÚBLICOS DAS ÁREAS
   09/09/2026.

   RODE SÓ ESTE ARQUIVO. Ele inclui, inteiro, o conteúdo do 41 — que ficou sem
   rodar. Supabase → SQL Editor → colar tudo → Run. É idempotente: rodar duas
   vezes dá o mesmo resultado.

   ---------------------------------------------------------------------------
   PARTE 1 — O PROBLEMA QUE A JOICE VIU

   Ela mandou a captura: na lista da Connect aparecem dois CLAUDIO, um embaixo
   do outro, na mesma função (ESTACIONAMENTO 1), sem nada que os separe. O
   mesmo com duas LUCIENE. Medido na produção em 09/09, pela própria RPC:

     servico   CLAUDIO ×2 · LUCIENE ×2
     midia     MARIA ×2
     louvor    JOÃO ×2

   DUAS PERGUNTAS, DUAS RESPOSTAS DIFERENTES.

   1) "Isso pode atrapalhar o sistema na hora de gerar a escala?"
      NÃO. A escala nunca olha o nome. `equipe_time` devolve `voluntario_id`
      (o uuid de `voluntarios.id`) e é ele que viaja em habilidades, escalas e
      disponibilidade. Dois Cláudios são duas linhas com ids diferentes, e o
      motor os trata como duas pessoas porque eles SÃO duas pessoas. Nenhuma
      escala já gerada está errada por causa disto.

   2) "Mas a pessoa não sabe qual é ela."
      SIM, e este é o problema de verdade. Não é falha de SEGURANÇA: tocar na
      linha errada não abre o espaço de ninguém, porque `equipe_pin_criar`
      exige os quatro últimos dígitos do telefone DAQUELE voluntário e trava
      em oito tentativas por dia (migração 08). Quem erra recebe
      DIGITOS_NAO_CONFEREM.
      O estrago é outro, e é grande do mesmo jeito: a pessoa tenta, não entra,
      conclui que o sistema está quebrado e desiste — e a lista não lhe dá
      nenhuma pista de qual das duas linhas é ela.

   O CONSERTO. `equipe_time` passa a devolver `nome_completo`: o nome inteiro,
   como a pessoa se cadastrou, para TODO MUNDO da lista.

   Cheguei aqui em três passos, e vale registrar por que os dois primeiros
   ficaram para trás. Primeiro escrevi a inicial do sobrenome ("CLAUDIO S."),
   e só para quem tinha homônimo — por receio de publicar nome completo numa
   lista aberta a quem tem o link. Depois virou o sobrenome, ainda só para os
   homônimos. Agora é o nome inteiro de todos, decisão do Arthur.

   O receio não se sustentava: `/equipe/` está em Disallow no robots.txt, ou
   seja a página não é indexada — ela circula por link DENTRO da equipe, que é
   exatamente o lugar onde uma lista de gente tem nome inteiro. E mostrar o
   nome só de quem tem homônimo criava uma lista de duas classes, em que a
   marca de "tem alguém com seu nome" era justamente aparecer por extenso.

   `primeiro_nome` continua vindo, e continua sendo o primeiro nome: é ele que
   abre a saudação depois do PIN ("Oi, Cláudio"). Nome completo em saudação soa
   a cartório.

   ---------------------------------------------------------------------------
   PARTE 2 — OS TEXTOS DAS CINCO ÁREAS (era o 41)

   Só a coluna `equipes.descricao` das cinco áreas publicadas. É o texto do
   azulejo de cada área em /servir e na home. Nenhuma função, política ou
   tabela muda por causa dele.

   Por que o slug do Connect é `servico`: a equipe nasceu como "Serviço" e o
   slug é chave de URL e de história (/servir/servico, links já divulgados).
   O nome público é o da coluna `nome` — Connect — e é o que aparece.
   ============================================================================= */

-- ---------------------------------------------------------------- parte 1 ---
/* O tipo de retorno muda (ganha uma coluna), e `create or replace` não muda
   tipo de retorno: tem que derrubar antes. O grant é refeito no fim. */
drop function if exists equipe_time(text);

create function equipe_time(p_slug text)
returns table(area text, ordem int, voluntario_id uuid, primeiro_nome text,
              nome_completo text, nivel text, tem_pin boolean, tem_tel boolean)
language sql security definer set search_path = public stable as $fn$
  select f.nome, f.ordem, v.id,
         /* o primeiro nome CONTINUA vindo: é ele que abre a saudação depois do
            PIN ("Oi, Cláudio"). Nome completo em saudação soa a cartório. */
         split_part(btrim(v.nome), ' ', 1),
         /* o nome como a pessoa se cadastrou, inteiro, sem cortar em sobrenome
            nenhum — é o que a lista mostra */
         btrim(v.nome),
         h.nivel::text,
         v.pin_hash is not null,
         nullif(tel_norm(v.telefone),'') is not null
    from voluntarios v
    join equipes e on e.id = v.equipe_id and e.slug = p_slug
    join habilidades h on h.voluntario_id = v.id
    join funcoes f on f.id = h.funcao_id and f.ativa
   where v.ativo
   order by f.ordem, v.nome;
$fn$;

revoke all on function equipe_time(text) from public;
grant execute on function equipe_time(text) to anon, authenticated;

-- ---------------------------------------------------------------- parte 2 ---
update equipes set descricao =
  'Ampliamos a mensagem da igreja por meio da tecnologia, conectando pessoas e registrando momentos com excelência em cada imagem, luz, som e transmissão.'
  where slug = 'midia';

update equipes set descricao =
  'Conduzimos a igreja em uma adoração autêntica, criando um ambiente para que cada pessoa tenha um encontro profundo com Deus por meio da música e do serviço.'
  where slug = 'louvor';

update equipes set descricao =
  'Plantamos sementes de fé no coração das crianças, oferecendo um ambiente seguro, acolhedor e educativo para que elas cresçam no conhecimento de Deus.'
  where slug = 'kids';

update equipes set descricao =
  'Acolhemos com amor e atenção cada pessoa que chega à nossa casa, cuidando para que todos se sintam bem-vindos, seguros e valorizados desde o primeiro momento.'
  where slug = 'servico';

update equipes set descricao =
  'Disponibilizamos recursos que fortalecem a caminhada cristã, ajudando cada pessoa a levar para casa conteúdos que edificam e prolongam a experiência do culto durante a semana.'
  where slug = 'livraria';

-- ------------------------------------------------------------ conferência ---
-- 1) os cinco textos: tem que devolver 5 linhas com o texto novo
select slug, nome, left(descricao, 60) || '…' as descricao
  from equipes
 where slug in ('midia', 'louvor', 'kids', 'servico', 'livraria')
 order by ordem, nome;

-- 2) o nome inteiro: tem que vir preenchido para TODO MUNDO, e os dois Cláudios
--    têm que aparecer como duas linhas diferentes
select distinct primeiro_nome, nome_completo
  from equipe_time('servico')
 order by 1, 2;

/* =============================================================================
   PARTE 3 — CADASTRO EM DUPLICIDADE (a terceira pergunta da Joice)

   NÃO APAGUEI NADA, de propósito: apagar voluntário é irreversível e leva
   junto histórico de escala. O que dá para fazer com segurança é ACHAR.

   Olhando a produção pela RPC pública (que só mostra primeiro nome), os quatro
   pares de nome repetido NÃO parecem cadastro duplicado: em cada par as duas
   pessoas têm PIN, têm telefone e marcaram FUNÇÕES DIFERENTES — é o retrato de
   duas pessoas, não de alguém que se cadastrou duas vezes. O padrão de quem
   errou e refez é o oposto: dois registros com o mesmo nome completo, e um
   deles sem PIN e sem telefone.

   Rode a consulta abaixo no SQL Editor: ela vê o nome inteiro, que a RPC não
   mostra, e é só leitura. Se voltar vazia, não há duplicidade.               */

select v.equipe_id, e.nome as equipe, upper(btrim(v.nome)) as nome,
       count(*) as registros,
       array_agg(v.id order by v.criado_em)                as ids,
       array_agg(v.pin_hash is not null order by v.criado_em) as tem_pin,
       array_agg(nullif(tel_norm(v.telefone),'') is not null order by v.criado_em) as tem_tel,
       array_agg(v.criado_em order by v.criado_em)         as criados
  from voluntarios v
  join equipes e on e.id = v.equipe_id
 where v.ativo
 group by v.equipe_id, e.nome, upper(btrim(v.nome))
having count(*) > 1
 order by e.nome, nome;

/* Achando duplicidade, o caminho seguro NÃO é `delete`: é desativar o registro
   vazio (o sem PIN e sem telefone), o que tira ele da lista e preserva
   qualquer histórico:

     update voluntarios set ativo = false where id = '<o id do registro vazio>';

   Confira antes qual dos dois tem escala:

     select voluntario_id, count(*) from escalas
      where voluntario_id in ('<id A>','<id B>') group by 1;

   Se o registro que tem escala for o vazio, o certo é o inverso: mover o PIN e
   o telefone para ele e desativar o outro. Nesse caso me chame, porque é uma
   troca com duas pontas e não cabe numa linha de SQL cega.                   */
