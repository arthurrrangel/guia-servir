/* =============================================================================
   41 · OS TEXTOS PÚBLICOS DAS CINCO ÁREAS
   08/09/2026, palavra por palavra do Arthur.

   O QUE ISTO MUDA: só a coluna `equipes.descricao` das cinco áreas publicadas.
   É o texto que aparece no azulejo de cada área em /servir e na home, lido
   pela função pública `ministerios_publicos()` (migração 21). Nenhuma função,
   política ou tabela muda aqui — é conteúdo, e conteúdo mora no banco para a
   liderança poder trocar depois sem ninguém mexer em código.

   COMO RODAR: Supabase → SQL Editor → colar → Run. Idempotente: rodar duas
   vezes dá o mesmo resultado. O `where slug in (...)` garante que nada além
   destas cinco linhas é tocado; a contagem final tem que dizer 5.

   Por que o slug do Connect é `servico`: a equipe nasceu como "Serviço" e o
   slug é chave de URL e de história (/servir/servico, links já divulgados).
   O nome público é o que a coluna `nome` diz — Connect — e é o que aparece.
   ============================================================================= */

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

-- conferência: tem que devolver 5 linhas, cada uma com o texto novo
select slug, nome, left(descricao, 60) || '…' as descricao
  from equipes
 where slug in ('midia', 'louvor', 'kids', 'servico', 'livraria')
 order by ordem, nome;
