/* =============================================================================
   38 — QUANDO A PESSOA ENTROU NAQUELA VAGA

   A tabela `escalacoes` guardava quem, onde, e como a pessoa respondeu. Não
   guardava QUANDO ela foi escalada. Com isso, "consultar alterações" não era
   uma tela faltando: era um dado que não existia.

   O QUE ISSO QUEBRA NA PRÁTICA

   A escala de setembro foi montada pelo cron no dia 26 e ninguém foi avisado:
   50 das 64 escalações futuras estão pendentes. Agora imagine o caso normal
   dessa igreja: o mês sai, o líder publica no grupo, e na sexta alguém fura.
   O líder põe outra pessoa. Essa pessoa abre o link dela e vê uma linha nova
   que parece exatamente igual às que estão lá desde o dia 26. Se ela já tinha
   olhado a escala naquela semana, ela não olha de novo. E se olhar, não tem
   como saber que aquilo é novo.

   Do outro lado, o líder que trocou não tem como avisar só quem mudou: ou ele
   lembra de cabeça, ou reenvia a escala inteira no grupo e todo mundo ignora.

   UMA COLUNA, NÃO DUAS

   `escalado_em` é quando ESTA PESSOA entrou NESTA vaga. Não é "quando a linha
   foi tocada": um `atualizado_em` genérico subiria quando o próprio voluntário
   confirmasse, e aí toda confirmação viraria "a liderança mudou alguma coisa"
   na tela dele. O gatilho só mexe quando `voluntario_id` muda, que é
   exatamente o que a palavra "alteração" significa para quem serve.

   Isso também casa com o `salvar_dia` que já existe: ele faz
   `on conflict do update` e já preserva status e resposta quando a pessoa é a
   mesma. Salvar o recado do dia não vai marcar 9 pessoas como recém-escaladas.

   AS 92 LINHAS ANTIGAS FICAM NULAS

   Não dá para saber quando elas foram criadas, e chutar `now()` faria a escala
   inteira aparecer como "nova" para todo mundo no primeiro acesso depois desta
   migração. Nulo quer dizer "não sei", e a tela não mostra selo nenhum. O dado
   começa a valer da próxima alteração em diante.
   ============================================================================= */

alter table escalacoes add column if not exists escalado_em timestamptz;

comment on column escalacoes.escalado_em is
  'quando esta pessoa entrou nesta vaga. Null nas linhas anteriores à migração 38: nulo é "não sei", e a tela do voluntário não mostra selo quando não sabe.';

create or replace function fn_escalado_em() returns trigger
language plpgsql set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    new.escalado_em := now();
    return new;
  end if;
  /* só quando MUDA A PESSOA. Confirmar, recusar, travar ou marcar primeira vez
     não são alterações da escala do ponto de vista de quem serve. */
  if new.voluntario_id is distinct from old.voluntario_id then
    new.escalado_em := now();
  end if;
  return new;
end $$;

drop trigger if exists tg_escalado_em on escalacoes;
create trigger tg_escalado_em before insert or update on escalacoes
  for each row execute function fn_escalado_em();


-- =========================================================================
-- eu_dados: a mesma resposta de sempre, com o campo novo
--
-- Reescrita inteira e não emendada porque é plpgsql com uma query só: um
-- ALTER não existe para isso. Nenhum campo saiu nem mudou de nome.
-- =========================================================================
create or replace function eu_dados(p_token text)
returns table(nome text, equipe text, escalas jsonb, indisponivel jsonb, disponivel jsonb)
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_nome text; v_eq uuid; v_eqnome text;
begin
  select v.id, v.nome, v.equipe_id into v_id, v_nome, v_eq
    from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;
  select e.nome into v_eqnome from equipes e where e.id = v_eq;

  return query select v_nome, coalesce(v_eqnome,'Escala'),
    coalesce((select jsonb_agg(x order by x->>'data') from (
        select jsonb_build_object('culto_id',c.id,'data',c.data,'funcao',f.nome,'status',e.status,
                 'primeira_vez',e.primeira_vez,
                 'escalado_em',e.escalado_em,
                 'obs',(select o.obs from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'relata', f.relata,
                 'relatorio',(select o.relatorio from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'problemas',(select o.problemas from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'plantao',false) as x
          from escalacoes e join cultos c on c.id=e.culto_id join funcoes f on f.id=e.funcao_id
         where e.voluntario_id = v_id and c.data >= current_date - 1
        union all
        select jsonb_build_object('culto_id',c.id,'data',c.data,'funcao','PLANTAO','status','pendente',
                 'primeira_vez',false,
                 'escalado_em',null,
                 'obs',(select o.obs from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'relata', false, 'relatorio', null, 'problemas', null,
                 'plantao',true)
          from plantoes p join cultos c on c.id=p.culto_id
         where p.voluntario_id = v_id and c.data >= current_date - 1) t), '[]'::jsonb),
    coalesce((select jsonb_agg(i.data order by i.data) from indisponibilidades i
               where i.voluntario_id = v_id and i.data >= current_date), '[]'::jsonb),
    coalesce((select jsonb_agg(d.data order by d.data) from disponibilidade d
               where d.voluntario_id = v_id and d.pode = true and d.data >= current_date), '[]'::jsonb);
end $fn$;

revoke all on function eu_dados(text) from public;
grant execute on function eu_dados(text) to anon, authenticated;


/* =============================================================================
   CONFERÊNCIA

     -- a coluna existe e o gatilho está preso
     select count(*) from information_schema.columns
      where table_name='escalacoes' and column_name='escalado_em';
     select tgname from pg_trigger where tgrelid='escalacoes'::regclass and not tgisinternal;

     -- o gatilho NÃO sobe quando só o status muda, e SOBE quando a pessoa muda
     -- (rodar dentro de uma transação desfeita)

     -- as linhas antigas continuam nulas
     select count(*) filter (where escalado_em is null) as antigas,
            count(*) filter (where escalado_em is not null) as novas
       from escalacoes;

   ROLLBACK
     drop trigger tg_escalado_em on escalacoes;
     drop function fn_escalado_em();
     alter table escalacoes drop column escalado_em;
     eu_dados volta ao arquivo anterior; o campo novo some da resposta e a tela
     simplesmente não mostra selo.
   ============================================================================= */
