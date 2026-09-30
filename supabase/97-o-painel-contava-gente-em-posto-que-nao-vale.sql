/* =============================================================================
   97 · O PAINEL CONTAVA GENTE EM POSTO QUE NÃO VALE

   30/09/2026. Só de Escalas.

   Visto em produção, no Painel novo, na seção "A igreja no próximo culto":

       Mídia · Follow, 3 de outubro ........ 8 de 6 · 6 sem resposta

   Oito pessoas em seis postos. O Painel antigo mostrava o mesmo "8 de 6";
   a tela nova só deixou mais à vista.

   A CAUSA. A 60 ensinou `visao_geral()` a contar os POSTOS que valem naquele
   culto: função ativa, e do tipo do dia (domingo ou Follow). A contagem de
   GENTE, no fim da mesma função, ficou sem o filtro. Ela soma toda escalação
   de função da equipe naquela data, inclusive:

     · de função desativada;
     · de função que não existe naquele tipo de culto (HEAD e TRANSMISSÃO num
       sábado de Follow, desde a 09; qualquer posto com `tipos` de um só dia);
     · de culto que não é o da equipe (evento de outro ministério no mesmo
       dia), que a 60 já tinha tirado do `prox` e não daqui;
     · e, em "pendentes", linha sem ninguém: a vaga guardada vira "sem
       resposta".

   O motor nunca contou nada disso (`funcoesDoDia` e `resumoDia`, em
   lib/engine.ts), então a Escala dizia uma coisa e o Painel da igreja outra.
   E o estrago não para no "8 de 6": `vagas` é `postos - preenchidos`, então
   a pessoa que sobrou num posto que não vale ESCONDE uma vaga de verdade. No
   cenário da conferência abaixo, rodado com a função da 60:

       postos 2 · preenchidos 3 · vagas 0 · pendentes 4

   quando o certo é 1 pessoa, 1 vaga e 1 sem resposta. O painel dizia "de pé"
   para um culto com um posto vazio.

   A CORREÇÃO é repetir na contagem de gente o filtro que `conta` e `prox`
   já usam (a expressão fica escrita três vezes no arquivo, pelo mesmo motivo
   que a 60 explica: SQL não tem onde guardá-la sem criar uma função só para
   isso), e exigir alguém na linha para ela contar como preenchida,
   confirmada, recusada, furo ou sem resposta.

   Nada é apagado. A escalação velha continua no banco, fora da conta, que é
   o que o motor já faz com ela; o próximo sorteio daquele dia a descarta.

   A CONFERÊNCIA, no fim: monta um ministério de teste com um evento hoje,
   uma pessoa num posto que vale, um posto que vale sem ninguém, uma pessoa
   num posto de outro tipo de culto e uma num posto desativado; mede como
   quem organiza aquele ministério; e desfaz tudo. Se a conta não for a
   certa, o arquivo inteiro volta atrás. Depois mede a igreja inteira como
   organizador geral e diz, só em números, quantas áreas ainda teriam mais
   gente que postos (o esperado é zero; se não for, é aviso, não
   reprovação: ver o comentário no bloco).

   ORDEM:  ... 95 → 96 → 97
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(97);
  end if;
end $tranca$;

begin;

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
  /* o próximo culto de cada equipe: o próximo em que ESTA equipe tem posto
     ativo daquele tipo, contando evento só se for dela (60) */
  prox as (
    select m.id,
           (select c.data from cultos c
             where c.data >= current_date
               and (c.evento is null or c.equipe_id = m.id)
               and exists (select 1 from funcoes f
                            where f.equipe_id = m.id and f.ativa
                              and (f.tipos is null or array_length(f.tipos,1) is null
                                   or (case when extract(dow from c.data) = 6
                                            then 'follow' else 'domingo' end) = any(f.tipos)))
             order by c.data limit 1) as data
      from minhas m
  ),
  /* os postos que valem NAQUELE culto (60) */
  conta as (
    select m.id,
           (select count(*)::int from funcoes f
             where f.equipe_id = m.id and f.ativa
               and (p.data is null
                    or f.tipos is null or array_length(f.tipos,1) is null
                    or (case when extract(dow from p.data) = 6
                             then 'follow' else 'domingo' end) = any(f.tipos))) as postos
      from minhas m left join prox p on p.id = m.id
  )
  select m.slug, m.nome, m.ordem,
         p.data,
         (case when p.data is null then null
               when extract(dow from p.data) = 6 then 'follow' else 'domingo' end)::text,
         q.postos,
         coalesce(x.preenchidos, 0)::int,
         coalesce(x.confirmados, 0)::int,
         /* vaga = posto que vale sem ninguém. NULO quando não há próximo
            culto: zero vagas e nenhum culto são estados diferentes. */
         (case when p.data is null then null
               else greatest(q.postos - coalesce(x.preenchidos,0), 0) end)::int as vagas,
         coalesce(x.furos, 0)::int,
         coalesce(x.recusados, 0)::int,
         coalesce(x.pendentes, 0)::int,
         (select count(*)::int from candidaturas c
           where c.equipe_id = m.id and c.status = 'enviada')                   as candidaturas_novas
    from minhas m
    left join prox p on p.id = m.id
    join conta q on q.id = m.id
    left join lateral (
      /* 97: gente só em posto que vale, e só com alguém na linha. O mesmo
         filtro de `conta` (função ativa, do tipo do dia) e de `prox` (culto
         da igreja ou evento da própria equipe). */
      select count(*)                                                        as preenchidos,
             count(*) filter (where e.status = 'confirmado')                  as confirmados,
             count(*) filter (where e.status = 'furou')                       as furos,
             count(*) filter (where e.status = 'recusado')                    as recusados,
             count(*) filter (where coalesce(e.status::text,'pendente') = 'pendente') as pendentes
        from escalacoes e
        join funcoes f on f.id = e.funcao_id
        join cultos  c on c.id = e.culto_id
       where f.equipe_id = m.id and c.data = p.data
         and e.voluntario_id is not null
         and f.ativa
         and (f.tipos is null or array_length(f.tipos,1) is null
              or (case when extract(dow from p.data) = 6
                       then 'follow' else 'domingo' end) = any(f.tipos))
         and (c.evento is null or c.equipe_id = m.id)
    ) x on true
   order by m.ordem, m.nome;
$fn$;

revoke all on function visao_geral() from public, anon;
grant execute on function visao_geral() to authenticated;
comment on function visao_geral() is
  'estado do proximo culto de cada equipe que o chamador organiza, numa consulta so. Filtrada por lidera_equipe() dentro do where. Desde a 60: `postos` conta so o que vale NAQUELE culto (funcoes.tipos), e evento esporadico de outra equipe nao vira o proximo culto desta. Desde a 97: a gente (preenchidos, confirmados, furos, recusados, pendentes) tambem so conta em posto que vale, em culto da equipe, e com alguem na linha.';


-- =========================================================================
-- A CONFERÊNCIA
-- =========================================================================
do $conf$
declare
  falhas text[] := '{}';
  v_eq uuid; f_ok uuid; f_vaga uuid; f_tipo uuid; f_off uuid;
  v1 uuid; v2 uuid; v3 uuid; c_ev uuid;
  tipo_hoje text := case when extract(dow from current_date) = 6 then 'follow' else 'domingo' end;
  outro     text := case when extract(dow from current_date) = 6 then 'domingo' else 'follow' end;
  r record;
  n_areas int := null; n_mais_gente int := null; n_mais_pendente int := null;
  montou boolean := false; achou boolean := false;
begin
  begin
    insert into equipes (nome, slug, ordem) values ('CONF97 Teste', 'conf97-teste', 999) returning id into v_eq;
    insert into funcoes (nome, equipe_id, tipos, ativa) values ('CONF97 VALE', v_eq, array[tipo_hoje], true) returning id into f_ok;
    insert into funcoes (nome, equipe_id, tipos, ativa) values ('CONF97 VAGA', v_eq, array[tipo_hoje], true) returning id into f_vaga;
    insert into funcoes (nome, equipe_id, tipos, ativa) values ('CONF97 OUTRO CULTO', v_eq, array[outro], true) returning id into f_tipo;
    insert into funcoes (nome, equipe_id, tipos, ativa) values ('CONF97 DESATIVADA', v_eq, array['domingo','follow'], false) returning id into f_off;
    insert into voluntarios (nome, equipe_id) values ('CONF97 Um', v_eq) returning id into v1;
    insert into voluntarios (nome, equipe_id) values ('CONF97 Dois', v_eq) returning id into v2;
    insert into voluntarios (nome, equipe_id) values ('CONF97 Tres', v_eq) returning id into v3;
    insert into cultos (data, evento, equipe_id) values (current_date, 'CONF97 evento', v_eq) returning id into c_ev;
    insert into escalacoes (culto_id, funcao_id, voluntario_id) values
      (c_ev, f_ok, v1), (c_ev, f_vaga, null), (c_ev, f_tipo, v2), (c_ev, f_off, v3);
    insert into lideres (email, equipe_id) values ('conf97@exemplo.invalid', v_eq);
    /* organizador geral de teste: `lideres` com equipe nula lidera tudo */
    insert into lideres (email, equipe_id) values ('conf97-geral@exemplo.invalid', null);
    montou := true;

    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf97@exemplo.invalid","role":"authenticated"}', true);
    select * into r from visao_geral() g where g.slug = 'conf97-teste';
    achou := found;

    perform set_config('request.jwt.claims', '{"email":"conf97-geral@exemplo.invalid","role":"authenticated"}', true);
    select count(*) filter (where g.slug <> 'conf97-teste'),
           count(*) filter (where g.slug <> 'conf97-teste' and g.preenchidos > g.postos),
           count(*) filter (where g.slug <> 'conf97-teste' and g.pendentes > g.preenchidos)
      into n_areas, n_mais_gente, n_mais_pendente
      from visao_geral() g;
    reset role;

    raise exception 'CONF97_DESFAZ';
  exception when others then
    if sqlerrm <> 'CONF97_DESFAZ' then
      falhas := falhas || ('o cenario nao montou (' || case when montou then 'medindo' else 'montando' end || '): ' || sqlerrm)::text;
    end if;
  end;

  if montou and achou then
    if r.proxima_data is distinct from current_date then
      falhas := falhas || format('o proximo culto do teste devia ser hoje (%s), veio %s', current_date, r.proxima_data); end if;
    if r.postos <> 2 then
      falhas := falhas || format('postos: esperado 2 (VALE e VAGA), veio %s', r.postos); end if;
    if r.preenchidos <> 1 then
      falhas := falhas || format('preenchidos: esperado 1 (so o posto que vale e tem alguem), veio %s', r.preenchidos); end if;
    if r.vagas <> 1 then
      falhas := falhas || format('vagas: esperado 1 (o posto VAGA), veio %s', r.vagas); end if;
    if r.pendentes <> 1 then
      falhas := falhas || format('pendentes: esperado 1 (a linha vazia e os postos que nao valem ficam fora), veio %s', r.pendentes); end if;
  elsif montou then
    falhas := falhas || 'visao_geral() nao devolveu o ministerio de teste para quem o organiza'::text;
  end if;

  /* A IGREJA DE VERDADE entra como MEDIDA, e não como reprovação: um caso
     que este arquivo não conserta (uma área com culto da igreja E evento
     próprio no mesmo dia, por exemplo, conta gente dos dois) não pode
     impedir a correção do que ele conserta. O número sai no aviso. */
  if montou and n_mais_pendente is not null and n_mais_pendente > 0 then
    falhas := falhas || format('%s area(s) com mais "sem resposta" que gente escalada, o que esta funcao nao permite mais', n_mais_pendente); end if;
  if montou and coalesce(n_mais_gente, 0) > 0 then
    raise warning '97 · ATENCAO: % area(s) da igreja ainda com mais gente que postos no proximo culto. Nao e o caso que esta migracao conserta; vale olhar.', n_mais_gente;
  end if;

  /* o cenário foi desfeito: nada com o nome dele pode ter ficado */
  if exists (select 1 from equipes where slug = 'conf97-teste')
     or exists (select 1 from lideres where email like 'conf97%@exemplo.invalid') then
    falhas := falhas || 'o cenario de teste ficou no banco'::text; end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'97 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 97 · conferencia: no cenario de teste, 2 postos, 1 pessoa, 1 vaga e 1 sem resposta (a funcao da 60 dizia 3 pessoas, 0 vaga e 4 sem resposta). Na igreja, % area(s) medidas, % com mais gente que postos. Cenario desfeito.', coalesce(n_areas, 0), coalesce(n_mais_gente, 0);
end $conf$;

/* a sonda: se um arquivo antigo reescrever `visao_geral()` por cima desta, a
   régua diz SUMIU em vez de o "8 de 6" voltar em silêncio */
do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (97, '97 · a igreja no painel conta gente so em posto que vale', 'visao_geral', '97: gente só em posto que vale')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (97, '97-o-painel-contava-gente-em-posto-que-nao-vale.sql')
  on conflict (n) do nothing;

commit;
