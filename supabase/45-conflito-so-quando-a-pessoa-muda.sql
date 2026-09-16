/* =============================================================================
   45 · A REGRA DE CONFLITO SÓ OLHA A LINHA QUANDO A PESSOA MUDA
   16/09/2026.

   Supabase → SQL Editor → colar tudo → Run. Idempotente. Independe da 43 e
   da 44.

   ---------------------------------------------------------------------------
   O QUE ESTÁ ERRADO HOJE

   `fn_conflito_simultaneo` (migração 04) é um gatilho AFTER, adiado para o
   fim da transação, que recusa uma pessoa em duas funções simultâneas no
   mesmo culto. Ele avalia TODA linha inserida ou atualizada em `escalacoes`,
   inclusive quando a linha não mudou de pessoa:

     · `salvar_dia` grava o dia inteiro com `on conflict do update`, então
       salvar um recado, travar uma vaga ou marcar "1ª vez" re-avalia as
       nove linhas do culto;
     · mudar a situação de alguém (confirmou, não pode, furou) é um UPDATE
       de status e também passa pelo gatilho.

   Enquanto o dado está limpo, isso é só trabalho à toa. Mas basta um par que
   já existe (por exemplo, uma função que virou `simultanea` DEPOIS de a
   escala do mês ter sido montada) para o culto inteiro ficar imexível: todo
   salvar naquele dia é recusado, com a frase da regra, e a tela do líder
   (até a correção de hoje em lib/erros.ts) dizia só "Não consegui salvar".

   A regra continua valendo onde importa: quando uma PESSOA entra numa vaga
   (INSERT) ou quando a vaga TROCA de pessoa ou de função. É o mesmo guarda
   que `fn_indisponivel` já tem desde a migração 01.
   ============================================================================= */

create or replace function fn_conflito_simultaneo() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare v_nome text; v_outra text;
begin
  /* só quando a pessoa entra ou muda. Status, travar, 1ª vez e recado não
     re-abrem a pergunta. */
  if tg_op = 'UPDATE'
     and new.voluntario_id is not distinct from old.voluntario_id
     and new.funcao_id     is not distinct from old.funcao_id
     and new.culto_id      is not distinct from old.culto_id then
    return new;
  end if;
  if new.voluntario_id is null then return new; end if;
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

/* o gatilho continua o da migração 04: after, adiado, por linha. Recriar aqui
   garante que ele aponte para a função, se alguém o tiver derrubado. */
drop trigger if exists tg_conflito on escalacoes;
create constraint trigger tg_conflito
  after insert or update on escalacoes
  deferrable initially deferred
  for each row execute function fn_conflito_simultaneo();

/* =============================================================================
   CONFERÊNCIA

     -- a função nova está no lugar (tem o guarda de UPDATE)
     select prosrc like '%is not distinct from old.voluntario_id%' as tem_guarda
       from pg_proc where proname = 'fn_conflito_simultaneo';

     -- o gatilho está preso e adiado
     select tgname, tgdeferrable, tginitdeferred
       from pg_trigger where tgrelid = 'escalacoes'::regclass and tgname = 'tg_conflito';

     -- pares que já existem no dado (a regra nova não os cria nem os apaga;
     -- se a lista não vier vazia, a tela do líder é o lugar de desfazer)
     select c.data, v.nome, string_agg(f.nome, ' + ' order by f.nome) as funcoes
       from escalacoes e
       join cultos c on c.id = e.culto_id
       join funcoes f on f.id = e.funcao_id and f.simultanea
       join voluntarios v on v.id = e.voluntario_id
      group by c.data, v.nome
     having count(*) > 1
      order by c.data;

   ROLLBACK
     Rodar de novo o bloco `create or replace function fn_conflito_simultaneo`
     da migração 04 (a versão sem o guarda).
   ============================================================================= */
