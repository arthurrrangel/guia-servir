/* =============================================================================
   47 · CONNECT: "GABINETE, COZINHA E BANHEIROS" VIRA TRÊS VAGAS
   18/09/2026.

   Supabase → SQL Editor → colar tudo → Run. Idempotente: rodar duas vezes não
   duplica nada. Independe das migrações 43 a 46.

   ---------------------------------------------------------------------------
   O PEDIDO (liderança do Connect, WhatsApp, 18/09 11:38)

     "Preciso que vc coloque 3 vagas na questão da cozinha, banheiro e
      gabinete."
     "No momento não trabalhamos com segurança."

   Decisão do Arthur: fazer as três vagas; SEGURANÇA 1 e 2 FICAM como estão
   (não apagar). Esta migração não toca em segurança.

   O QUE MUDA

   Hoje o Connect tem UM posto para as três coisas, "GABINETE, COZINHA E
   BANHEIROS" (migração 12: um casal cadastrado como um voluntário). Passa a
   ter três postos, um por lugar, do mesmo jeito que SETOR A/B/C/D são um
   posto por lugar:

     GABINETE   (é o posto antigo, RENOMEADO: mantém o id, as escalações já
                 feitas e as habilidades de quem o marcou)
     COZINHA    (novo)
     BANHEIROS  (novo)

   Quem tinha a habilidade do posto antigo ganha a mesma habilidade (mesmo
   nível, mesma conferência) nos dois novos: essas pessoas já faziam as três
   coisas, então continuam elegíveis para as três vagas. O motor não põe a
   mesma pessoa em duas vagas simultâneas no mesmo culto.

   Os dois postos novos nascem SÓ DOMINGO (`tipos = {domingo}`), como todo o
   Connect. É por isso que esta mudança não foi feita pela tela Ajustes: a
   RPC `salvar_funcoes` cria posto com o default `{domingo, follow}`, e o
   Connect apareceria no Follow de sábado.

   TEXTOS: os três textos abaixo foram repartidos do texto único que existia
   (migração 15). A liderança pode ajustar depois.
   ============================================================================= */

do $$
declare
  v_eq    uuid;
  v_gab   uuid;
  v_ordem int;
  v_cheg  time;
  v_novo  uuid;
begin
  select id into v_eq from equipes where slug = 'servico';
  if v_eq is null then raise exception 'equipe servico (Connect) nao encontrada'; end if;

  /* 1. renomear o posto antigo, se ainda tiver o nome antigo */
  update funcoes
     set nome = 'GABINETE',
         descricao = 'Cuida do gabinete dos pastores: leva o café e deixa tudo pronto. Só entra no gabinete se o pastor estiver lá. Defeito encontrado vai para o líder do dia anotar no relatório.',
         descricao_familia = null
   where equipe_id = v_eq and nome = 'GABINETE, COZINHA E BANHEIROS';

  select id, ordem, chegada into v_gab, v_ordem, v_cheg
    from funcoes where equipe_id = v_eq and nome = 'GABINETE';
  if v_gab is null then raise exception 'posto GABINETE nao encontrado no Connect'; end if;

  /* 2. abrir espaço na ordem para os dois novos ficarem logo depois */
  if not exists (select 1 from funcoes where equipe_id = v_eq and nome in ('COZINHA','BANHEIROS')) then
    update funcoes set ordem = ordem + 2 where equipe_id = v_eq and ordem > v_ordem;
  end if;

  /* 3. os dois postos novos */
  insert into funcoes (equipe_id, nome, simultanea, ordem, ativa, tipos, descricao, descricao_familia, chegada)
  values
    (v_eq, 'COZINHA',   true, v_ordem + 1, true, array['domingo'],
     'Prepara o café dos pastores, troca o galão do bebedouro e mantém a cozinha e a parte de fora do templo organizadas. Defeito encontrado vai para o líder do dia anotar no relatório.',
     null, v_cheg),
    (v_eq, 'BANHEIROS', true, v_ordem + 2, true, array['domingo'],
     'Confere os banheiros antes e durante o culto: limpeza e falta de material. Defeito encontrado vai para o líder do dia anotar no relatório.',
     null, v_cheg)
  on conflict (equipe_id, nome) do nothing;

  /* 4. quem podia o posto antigo pode os dois novos */
  for v_novo in select id from funcoes where equipe_id = v_eq and nome in ('COZINHA','BANHEIROS') loop
    insert into habilidades (voluntario_id, funcao_id, nivel, confirmado)
    select h.voluntario_id, v_novo, h.nivel, h.confirmado
      from habilidades h where h.funcao_id = v_gab
    on conflict (voluntario_id, funcao_id) do nothing;
  end loop;
end $$;

/* =============================================================================
   CONFERÊNCIA (o SQL Editor mostra o resultado da última consulta)

   Esperado: GABINETE, COZINHA e BANHEIROS em sequência, os três com
   tipos {domingo}, e o mesmo número de pessoas habilitadas nos três.
   SEGURANÇA 1 e 2 continuam na lista.
   ============================================================================= */
select f.ordem, f.nome, f.ativa, f.tipos,
       (select count(*) from habilidades h where h.funcao_id = f.id) as pessoas_habilitadas
  from funcoes f join equipes e on e.id = f.equipe_id
 where e.slug = 'servico'
 order by f.ordem, f.nome;

/* ROLLBACK
     update funcoes set nome = 'GABINETE, COZINHA E BANHEIROS'
      where nome = 'GABINETE' and equipe_id = (select id from equipes where slug='servico');
     delete from funcoes where nome in ('COZINHA','BANHEIROS')
      and equipe_id = (select id from equipes where slug='servico');
     -- (apagar função leva habilidade e escalação junto, por cascade)
   ============================================================================= */
