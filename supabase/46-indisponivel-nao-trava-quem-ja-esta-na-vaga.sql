/* =============================================================================
   46 · "AVISOU QUE NÃO PODE" NÃO TRAVA O DIA INTEIRO
   16/09/2026, 15h.

   Supabase → SQL Editor → colar tudo → Run. Idempotente. Independe da 43, 44
   e 45.

   ---------------------------------------------------------------------------
   O QUE ACONTECEU

   O João Victor não conseguia mexer em NADA no domingo 20/09 da Mídia: trocar,
   travar, destravar, recado. Tudo voltava "Não consegui salvar". O log do
   Postgres às 14:04 tinha a resposta, sete vezes:

     ERROR: Fernanda Alencar avisou que nao pode neste domingo.
     ERROR: Thiago Gonçalves avisou que nao pode neste domingo.

   Os dois estão escalados em 20/09 (Iluminação e Filmagem 2) e, DEPOIS de
   escalados, responderam "não posso" no link: status `recusado` e uma linha
   em `indisponibilidades` para o dia. Certo até aqui.

   O problema é o gatilho `fn_indisponivel` (migração 04) somado a como
   `salvar_dia` grava: o dia inteiro, slot a slot, com
   `insert … on conflict (culto_id, funcao_id) do update`. No Postgres, um
   gatilho BEFORE INSERT roda na linha proposta ANTES de o conflito ser
   detectado. Então, a cada salvar, o gatilho vê "INSERT de Fernanda em
   Filmagem 2 de 20/09", consulta `indisponibilidades`, acha o "não posso" e
   recusa. O guarda que ele tem ("no UPDATE, se a pessoa não mudou, passa")
   nunca chega a valer, porque na hora do gatilho a operação é INSERT.

   Resultado: bastou uma pessoa escalada avisar que não pode para o culto
   inteiro ficar imexível. E o líder não consegue nem tirá-la: tirar um dos
   dois ainda regrava o outro.

   O CONSERTO

   No INSERT, se a vaga (culto, função) já tem exatamente essa pessoa, não é
   uma escalação nova: é o upsert regravando o que já existe. Passa. A regra
   continua valendo onde importa: pôr alguém que avisou que não pode numa
   vaga em que ainda não estava, ou trocar a vaga para essa pessoa.
   ============================================================================= */

create or replace function fn_indisponivel() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare v_data date; v_nome text; v_bloq int;
begin
  if new.voluntario_id is null then return new; end if;
  /* UPDATE sem troca de pessoa nem de culto: status, travar, 1ª vez. Passa. */
  if tg_op = 'UPDATE'
     and new.voluntario_id is not distinct from old.voluntario_id
     and new.culto_id      is not distinct from old.culto_id then
    return new;
  end if;
  /* INSERT do upsert de salvar_dia: a vaga já tem essa pessoa. Passa. */
  if tg_op = 'INSERT' and exists (
       select 1 from escalacoes e
        where e.culto_id = new.culto_id
          and e.funcao_id = new.funcao_id
          and e.voluntario_id = new.voluntario_id) then
    return new;
  end if;
  select data into v_data from cultos where id = new.culto_id;
  select nome into v_nome from voluntarios where id = new.voluntario_id;
  select count(*) into v_bloq from indisponibilidades
   where data = v_data and voluntario_id = new.voluntario_id;
  if v_bloq > 0 then raise exception '% avisou que nao pode neste domingo.', v_nome; end if;
  return new;
end $fn$;

/* o gatilho continua o de sempre (before insert or update, por linha);
   recriar garante que aponte para a função. */
drop trigger if exists tg_indisp on escalacoes;
create trigger tg_indisp before insert or update on escalacoes
  for each row execute function fn_indisponivel();

/* =============================================================================
   CONFERÊNCIA

     -- a função nova está no lugar
     select prosrc like '%INSERT do upsert%' as tem_guarda
       from pg_proc where proname = 'fn_indisponivel';

     -- regravar o dia 20/09 inteiro, como salvar_dia faz, dentro de uma
     -- transação desfeita: antes desta migração, estourava em Thiago/Fernanda
     begin;
     insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
     select e.culto_id, e.funcao_id, e.voluntario_id, e.status, e.fixo, e.primeira_vez
       from escalacoes e join cultos c on c.id = e.culto_id where c.data = '2026-09-20'
     on conflict (culto_id, funcao_id) do update set voluntario_id = excluded.voluntario_id;
     rollback;

     -- e a regra continua barrando escalação NOVA de quem avisou que não pode
     -- (dentro de uma transação desfeita; tem que dar ERROR):
     begin;
     insert into escalacoes (culto_id, funcao_id, voluntario_id)
     select c.id, f.id, v.id from cultos c, funcoes f, voluntarios v
      where c.data = '2026-09-20' and f.nome = 'FOTO' and v.nome = 'Fernanda Alencar';
     rollback;

   ROLLBACK
     Rodar de novo o bloco `create or replace function fn_indisponivel` da
     migração 04.
   ============================================================================= */
