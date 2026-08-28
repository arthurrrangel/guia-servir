/* =============================================================================
   28 — OS NÚMEROS DA PORTA PÚBLICA

   A landing dizia "escolha uma área" e mais nada. Nenhum motivo para acreditar,
   nenhuma prova de que existe gente do outro lado.

   Número inventado numa landing é o defeito clássico — e numa igreja é pior,
   porque quem lê conhece as pessoas e sabe contar. Então nada aqui é redondo
   nem escrito à mão: sai do banco, na hora, e se cair, cai na tela.

   Cacheado por hora no servidor: a prévia do link no WhatsApp bate várias
   vezes no mesmo endereço, e isso não pode virar carga no banco.
   ============================================================================= */

create or replace function numeros_publicos()
returns jsonb
language sql security definer stable set search_path = public as $fn$
  select jsonb_build_object(
    'pessoas',     (select count(*) from voluntarios where ativo),
    'ministerios', (select count(*) from equipes e
                     where exists (select 1 from funcoes f where f.equipe_id = e.id and f.ativa)),
    'postos',      (select count(*) from funcoes where ativa),
    /* domingos e Follows dos próximos 90 dias: é o compromisso real que a
       pessoa está pesando ao decidir se entra */
    'cultos_no_mes', (select count(*) from cultos
                       where data >= date_trunc('month', current_date)
                         and data <  date_trunc('month', current_date) + interval '1 month'),
    'respostas',   (select count(*) from disponibilidade where data >= current_date - 60)
  );
$fn$;

revoke all on function numeros_publicos() from public;
grant execute on function numeros_publicos() to anon, authenticated;

comment on function numeros_publicos() is
  'contagens da porta publica. Saem do banco na hora — numero escrito a mao numa igreja e o defeito classico, porque quem le conhece as pessoas e sabe contar.';
