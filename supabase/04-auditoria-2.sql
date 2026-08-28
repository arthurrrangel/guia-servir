/* =============================================================================
   04 — 2ª AUDITORIA (aplicado em produção em 2026-08-06)

   Uma correção CRÍTICA e a reversão de um exagero da 1ª auditoria.
   Idempotente.
   ============================================================================= */

/* -----------------------------------------------------------------------------
   CRÍTICA — re-sortear/mover pessoas entre funções simultâneas abortava o save.

   `salvar_dia` grava slot a slot (upsert). O gatilho de conflito era
   BEFORE ... FOR EACH ROW, então avaliava o estado INTERMEDIÁRIO do upsert:
   ao gravar PROJEÇÃO=Bruno, ILUMINAÇÃO=Bruno (linha antiga) ainda existia no
   banco → "Bruno já está em ILUMINAÇÃO" → todo re-sorteio que troca gente entre
   funções simultâneas falhava. Provado em produção (SWAP e MOVE-p/-vazio).

   Correção: gatilho vira CONSTRAINT TRIGGER DEFERIDO — avalia só o estado FINAL
   da transação, onde a escala é válida. A dupla-marcação genuína (mesma pessoa
   em duas simultâneas no fim da transação) continua barrada.

   Reversão: a 1ª auditoria fez os gatilhos casarem a mesma pessoa entre
   ministérios por telefone. Isso protegia um caso hipotético (multi-ministério
   com gente compartilhada) e QUEBRAVA o uso real (abortava o save do 2º
   ministério inteiro no cron). Volta a checar só DENTRO do ministério
   (por voluntario_id). Conflito entre ministérios, se e quando existir, deve
   ser um AVISO no app, não um erro que aborta a transação.
   ----------------------------------------------------------------------------- */

create or replace function fn_conflito_simultaneo() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare v_nome text; v_outra text;
begin
  if not exists (select 1 from funcoes where id = new.funcao_id and simultanea) then
    return new;
  end if;
  select nome into v_nome from voluntarios where id = new.voluntario_id;
  select f.nome into v_outra
    from escalacoes e
    join funcoes f on f.id = e.funcao_id and f.simultanea
   where e.culto_id = new.culto_id
     and e.funcao_id <> new.funcao_id
     and e.voluntario_id = new.voluntario_id      -- só dentro do ministério
   limit 1;
  if v_outra is not null then
    raise exception '% ja esta em % ao mesmo tempo neste domingo.', v_nome, v_outra;
  end if;
  return new;
end $fn$;

drop trigger if exists tg_conflito on escalacoes;
create constraint trigger tg_conflito
  after insert or update on escalacoes
  deferrable initially deferred          -- avalia no FIM da transação, não por linha
  for each row execute function fn_conflito_simultaneo();

/* indisponibilidade: também só por voluntario_id (sem casar telefone entre
   ministérios). Mantém o guard de UPDATE (editar status/recado não re-checa). */
create or replace function fn_indisponivel() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare v_data date; v_nome text; v_bloq int;
begin
  if tg_op = 'UPDATE'
     and new.voluntario_id is not distinct from old.voluntario_id
     and new.culto_id      is not distinct from old.culto_id then
    return new;
  end if;
  select data into v_data from cultos where id = new.culto_id;
  select nome into v_nome from voluntarios where id = new.voluntario_id;
  select count(*) into v_bloq from indisponibilidades
   where data = v_data and voluntario_id = new.voluntario_id;
  if v_bloq > 0 then raise exception '% avisou que nao pode neste domingo.', v_nome; end if;
  return new;
end $fn$;

/* hardening: salvar_dia é só de líder autenticado, nunca de anon */
revoke all on function salvar_dia(uuid, date, text, jsonb, uuid[]) from public, anon;
grant execute on function salvar_dia(uuid, date, text, jsonb, uuid[]) to authenticated;
