/* =============================================================================
   35 — A VISÃO QUE FALTAVA: O DOMINGO DA IGREJA INTEIRA

   O painel do líder responde muito bem uma pergunta: "o que precisa de mim
   NESTA área". Só que três dos quatro organizadores são admin da igreja
   inteira, e para saber se o domingo está coberto eles precisam trocar de
   equipe cinco vezes e somar de cabeça. A pergunta "a igreja está de pé no
   domingo?" não tinha onde ser feita.

   `visao_geral()` responde por todas as equipes que o chamador organiza, de
   uma vez. Para o líder de uma área só, devolve uma linha e a tela nem mostra
   o bloco: quem organiza uma coisa não precisa de painel de cinco.

   POR QUE NO BANCO E NÃO NO NAVEGADOR: montar isso no front exigiria carregar
   o estado inteiro de cada equipe, uma por uma, só para contar. Cinco viagens
   e o motor rodando cinco vezes para produzir cinco números. Aqui é uma
   consulta.

   SEGURANÇA: SECURITY DEFINER com a guarda `lidera_equipe(e.id)` DENTRO do
   where. Cada linha é filtrada pelo mesmo predicado que a RLS usaria, então
   quem organiza só o Louvor recebe só o Louvor, e quem não organiza nada
   recebe zero linhas em vez de erro.
   ============================================================================= */
create or replace function visao_geral()
returns table (
  slug text, equipe text, ordem int,
  proxima_data date, tipo text,
  postos int, preenchidos int, confirmados int,
  vagas int, furos int, recusados int, pendentes int,
  candidaturas_novas int
)
language sql security definer stable set search_path = public as $fn$
  with minhas as (
    select e.id, e.slug, e.nome, coalesce(e.ordem, 99) as ordem
      from equipes e
     where lidera_equipe(e.id)          -- a guarda: mesma regra da RLS
  ),
  /* o próximo culto de cada equipe. Não é "o próximo domingo": o Follow é no
     sábado e algumas áreas não entram nele, então a data certa é a do próximo
     culto em que ESTA equipe tem posto ativo. */
  prox as (
    select m.id,
           (select c.data from cultos c
             where c.data >= current_date
               and exists (select 1 from funcoes f
                            where f.equipe_id = m.id and f.ativa
                              and (f.tipos is null or array_length(f.tipos,1) is null
                                   or (case when extract(dow from c.data) = 6
                                            then 'follow' else 'domingo' end) = any(f.tipos)))
             order by c.data limit 1) as data
      from minhas m
  )
  select m.slug, m.nome, m.ordem,
         p.data,
         (case when p.data is null then null
               when extract(dow from p.data) = 6 then 'follow' else 'domingo' end)::text,
         (select count(*)::int from funcoes f
           where f.equipe_id = m.id and f.ativa)                                as postos,
         coalesce(x.preenchidos, 0)::int,
         coalesce(x.confirmados, 0)::int,
         /* vaga = posto ativo sem ninguém. É o número que decide se o culto
            acontece; tudo o mais é acabamento.

            NULO quando não há próximo culto marcado, e isso importa: sem esta
            distinção a área aparecia com "1 vaga" quando na verdade não há
            culto nenhum para preencher. Zero vagas e nenhum culto são estados
            diferentes e a tela precisa dizer coisas diferentes. */
         (case when p.data is null then null
               else greatest((select count(*)::int from funcoes f
                               where f.equipe_id = m.id and f.ativa)
                             - coalesce(x.preenchidos,0), 0) end)::int as vagas,
         coalesce(x.furos, 0)::int,
         coalesce(x.recusados, 0)::int,
         coalesce(x.pendentes, 0)::int,
         (select count(*)::int from candidaturas c
           where c.equipe_id = m.id and c.status = 'enviada')                   as candidaturas_novas
    from minhas m
    left join prox p on p.id = m.id
    left join lateral (
      select count(*) filter (where e.voluntario_id is not null)              as preenchidos,
             count(*) filter (where e.status = 'confirmado')                  as confirmados,
             count(*) filter (where e.status = 'furou')                       as furos,
             count(*) filter (where e.status = 'recusado')                    as recusados,
             count(*) filter (where coalesce(e.status::text,'pendente') = 'pendente') as pendentes
        from escalacoes e
        join funcoes f on f.id = e.funcao_id
        join cultos  c on c.id = e.culto_id
       where f.equipe_id = m.id and c.data = p.data
    ) x on true
   order by m.ordem, m.nome;
$fn$;

revoke all on function visao_geral() from public, anon;
grant execute on function visao_geral() to authenticated;
comment on function visao_geral() is
  'estado do próximo culto de cada equipe que o chamador organiza, numa consulta só. Filtrada por lidera_equipe() dentro do where: quem organiza uma área recebe uma linha.';


/* =============================================================================
   CONFERÊNCIA
     select * from visao_geral();                       -- como admin: 5 linhas
     -- como líder de uma área só: 1 linha
     set request.jwt.claims = '{"email":"<lider de uma area>"}';
     select count(*) from visao_geral();

   ROLLBACK
     drop function visao_geral();
     Nada depende dela além do bloco novo do painel, que some junto sem erro.
   ============================================================================= */
