/* =============================================================================
   98 · O FOLLOW É TODO SÁBADO, ÀS 19H

   30/09/2026. Só de Escalas.

   O Arthur: "culto follow terá agora todos os sabados do mes, as 19h". Até
   aqui o primeiro sábado do mês não tinha Follow, e essa exceção morava em
   cinco lugares. Dois são do app (`sabadosDoFollow` e `cultosAte`, em
   lib/engine.ts, que mudam no mesmo commit). Três são do banco, e mudam
   aqui:

     · `eu_proximos_domingos()`: a grade "Quando você pode" do link pessoal.
       Sem esta troca, o sábado 3 de outubro não aparece para ninguém marcar
       se pode ou não pode;
     · `criar_evento()` e `culto_guarda()`: evento esporádico era aceito no
       primeiro sábado, porque ele não era dia de culto. Agora é, e evento
       fica para dia sem culto, como no domingo.

   OS EVENTOS QUE JÁ ESTÃO NUM SÁBADO. Com o primeiro sábado sem Follow,
   quem precisava escalar gente nele criava um evento. A partir de hoje esse
   dia é o Follow da igreja, e a regra da 69 ("um dia é um dia: ou o culto da
   igreja, ou o evento") recusaria o culto regular de qualquer outra área
   naquela data. Então cada sábado futuro com UM evento e nenhum culto
   regular vira o culto regular daquele dia: a mesma linha, com a mesma
   escala e o mesmo recado, sem nome de evento e sem dono. A hora própria do
   evento sai, e vale a do Follow. Sábado com dois ou mais eventos, ou já com
   culto regular, fica como está e sai no aviso, para decidir à mão.

   A CONFERÊNCIA, no fim: a grade do voluntário tem todo sábado dos
   próximos 60 dias; um organizador de teste não cria evento no primeiro
   sábado (nem pela função, nem direto na tabela) e cria o culto regular
   dele; e nenhum sábado futuro ficou com evento sozinho. Tudo que ela monta
   é desfeito.

   ORDEM:  ... 96 → 97 → 98
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(98);
  end if;
end $tranca$;

begin;

-- =========================================================================
-- 1 · a grade do voluntário: todo domingo e todo sábado dos próximos 60 dias
-- =========================================================================
create or replace function eu_proximos_domingos()
returns table (data date)
language sql security definer set search_path = public as $$
  /* 98: todo sábado é Follow; antes, `or (dow = 6 and day > 7)` */
  select d::date from generate_series(current_date, current_date + 60, '1 day') d
   where extract(dow from d) in (0, 6);
$$;
grant execute on function eu_proximos_domingos() to anon, authenticated;

-- =========================================================================
-- 2 · evento não nasce em sábado nenhum (pela função)
-- =========================================================================
create or replace function public.criar_evento(
  p_equipe uuid, p_data date, p_nome text, p_inicio time default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_nome text := btrim(coalesce(p_nome, '')); v_ocupa text;
begin
  if not lidera_equipe(p_equipe) then
    return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO');
  end if;
  if p_data is null then
    return jsonb_build_object('ok', false, 'erro', 'FALTA_DATA');
  end if;
  if length(v_nome) < 2 then
    return jsonb_build_object('ok', false, 'erro', 'FALTA_NOME');
  end if;
  if p_data < current_date then
    return jsonb_build_object('ok', false, 'erro', 'DATA_NO_PASSADO');
  end if;

  /* O LIMITE DO MODELO, DITO EM VOZ ALTA (a 54 explica inteiro): a escala é
     UM DIA POR DATA. Evento em dia de culto precisaria de dois conjuntos de
     postos na mesma data, e o modelo não sabe dizer isso. */
  /* 98: todo sábado é Follow (Arthur, 30/09/2026); antes, o primeiro
     sábado do mês ficava de fora e recebia evento */
  if extract(dow from p_data) in (0, 6) then
    return jsonb_build_object('ok', false, 'erro', 'DIA_DE_CULTO');
  end if;
  if exists (select 1 from cultos c where c.data = p_data and c.evento is null) then
    return jsonb_build_object('ok', false, 'erro', 'JA_TEM_CULTO');
  end if;

  /* e o mesmo limite vale entre dois EVENTOS, que era o buraco da 54 */
  select c.evento into v_ocupa from cultos c
   where c.data = p_data and c.equipe_id = p_equipe and c.evento is not null limit 1;
  if v_ocupa is not null then
    return jsonb_build_object('ok', false, 'erro', 'JA_TEM_EVENTO', 'ocupa', v_ocupa);
  end if;

  insert into cultos (data, evento, equipe_id, inicio)
       values (p_data, v_nome, p_equipe, p_inicio)
    returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'data', p_data, 'nome', v_nome);
exception
  /* a checagem acima resolve o caso normal; esta pega a CORRIDA, dois
     organizadores da mesma área cadastrando no mesmo segundo */
  when unique_violation then
    return jsonb_build_object('ok', false, 'erro', 'JA_TEM_EVENTO',
      'ocupa', (select c.evento from cultos c
                 where c.data = p_data and c.equipe_id = p_equipe
                   and c.evento is not null limit 1));
  when check_violation then
    return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
end $fn$;

-- =========================================================================
-- 3 · evento não nasce em sábado nenhum (direto na tabela)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.culto_guarda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_tem_culto boolean;
begin
  /* QUEM ESTE GUARDA PEGA (a explicação inteira está na 54).

     `current_setting('role')` e não `current_user`: dentro de uma função
     `security definer`, `current_user` é o DONO da função, nunca quem
     chamou. O GUC `role` é a assinatura do PostgREST, que faz `set role
     authenticated` antes de cada requisição, e volta a `none` no `reset
     role` — então manutenção legítima não é travada. */
  if coalesce(current_setting('role', true), '') <> 'authenticated' then
    return case when TG_OP = 'DELETE' then old else new end;
  end if;

  if TG_OP = 'DELETE' then
    if old.evento is null and not lidera_tudo() then
      raise exception 'CULTO_REGULAR_SO_ORGANIZADOR_GERAL: apagar o culto de % derruba a escala de todos os ministerios.', old.data
        using errcode = 'insufficient_privilege';
    end if;
    if old.evento is not null and not lidera_equipe(old.equipe_id) then
      raise exception 'EVENTO_DE_OUTRO_MINISTERIO: % nao e do seu ministerio.', old.evento
        using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;

  if TG_OP = 'UPDATE' then
    /* ================================================================ 69 ===
       A LINHA QUE O DELETE E O INSERT TÊM E O UPDATE NÃO TINHA.

       Os dois outros ramos recusam mexer em evento de outro ministério com
       esta mesma condição, escrita com estas mesmas palavras. O UPDATE
       vigiava só TRANSIÇÕES (virar evento, deixar de ser, trocar de dono) —
       e mudar o conteúdo de um evento alheio não é transição nenhuma.

       Medido em 21/09/2026: o organizador do Louvor enxergava 3 cultos e
       escrevia em 7, apagando a observação interna dos eventos do Kids, da
       Livraria, da Mídia e do Connect. */
    if old.evento is not null and not lidera_equipe(old.equipe_id) then
      raise exception 'EVENTO_DE_OUTRO_MINISTERIO: % nao e do seu ministerio.', old.evento
        using errcode = 'insufficient_privilege';
    end if;

    /* A TRANSIÇÃO é o que se nega. Virar evento, deixar de ser evento, ou
       trocar de dono: cada uma exige quem de direito. */
    if old.evento is null and new.evento is not null and not lidera_tudo() then
      raise exception 'CULTO_REGULAR_NAO_VIRA_EVENTO: o culto de % e da igreja inteira.', old.data
        using errcode = 'insufficient_privilege';
    end if;
    if old.evento is not null and new.evento is null and not lidera_tudo() then
      raise exception 'EVENTO_NAO_VIRA_CULTO_REGULAR: isso transformaria % num culto da igreja.', old.evento
        using errcode = 'insufficient_privilege';
    end if;
    if old.equipe_id is distinct from new.equipe_id
       and not (lidera_equipe(old.equipe_id) and lidera_equipe(new.equipe_id)) then
      raise exception 'EVENTO_NAO_TROCA_DE_DONO: so quem lidera os dois ministerios.'
        using errcode = 'insufficient_privilege';
    end if;

    /* ================================================================ 56 ===
       E O CONTEÚDO DO CULTO REGULAR TAMBÉM, QUE ERA O BURACO.

       Vigiar só a transição deixava de fora o caso mais simples e mais
       provável: o líder do Louvor mudando a data ou o horário do domingo.
       `escalacoes.culto_id` aponta para esta linha, então isso arrasta a
       escala de todos os ministérios daquele dia.

       Evento continua livre para o dono: `criar_evento`/`apagar_evento` já
       exigem `lidera_equipe`, e a linha acima protege a troca de dono.

       Não listo coluna por coluna de propósito. Coluna nova em `cultos` é
       do domingo da igreja até prova em contrário, e a lista fechada seria
       a primeira coisa a ficar para trás — foi assim que `tipos` deixou 15
       postos sumirem por meses (migração 53). */
    /* 69 · A LISTA FECHADA VIROU A LINHA INTEIRA.

       O comentário acima diz, em 20/09: "Não listo coluna por coluna de
       propósito [...] a lista fechada seria a primeira coisa a ficar para
       trás". E logo abaixo listava quatro colunas. `ensaio_em` já tinha
       ficado de fora: `update cultos set ensaio_em = '2030-01-01'` passava.

       `old is distinct from new` compara a linha toda. Coluna nova em
       `cultos` passa a ser protegida no dia em que nasce, sem ninguém
       lembrar.

       ================================================================ 78 ===
       E A FRASE QUE VINHA AQUI ERA FALSA. Estava escrito: "o `on conflict do
       update set data = excluded.data` de `salvar_dia` continua passando,
       porque ali nada muda de verdade." Não continua. Era raciocínio, não
       medição, e custou a função principal do app.

       `cultos.tipo` é `GENERATED ALWAYS`. Num gatilho BEFORE, o Postgres
       ainda não calculou as colunas geradas: `new.tipo` é sempre NULL
       enquanto `old.tipo` vem preenchido. Então `old is distinct from new` é
       VERDADE em toda atualização de `cultos`, inclusive na que não muda
       nada.

       Medido em 21/09, como o organizador do Louvor, num domingo que já
       estava no calendário:

           salvar_dia(louvor, 2026-10-04, ...)
             -> CULTO_REGULAR_SO_ORGANIZADOR_GERAL: mudar o culto de
                2026-10-04 muda a escala de todos os ministerios daquele dia.

       Quer dizer: com a 69 aplicada e sem esta, NENHUM organizador de área
       consegue salvar a escala de domingo nenhum. Só quem organiza a igreja
       inteira. O app inteiro é isso.

       A comparação passa a tirar as colunas GERADAS dos dois lados, e a
       lista vem do catálogo — não escrita à mão, pelo mesmo motivo que a
       linha inteira entrou no lugar das quatro colunas. E é correta por
       construção: coluna gerada é função das outras, então se as outras são
       iguais, ela é igual. */
    if old.evento is null and not lidera_tudo()
       and (to_jsonb(old) - colunas_geradas('public.cultos'::regclass))
           is distinct from
           (to_jsonb(new) - colunas_geradas('public.cultos'::regclass)) then
      raise exception 'CULTO_REGULAR_SO_ORGANIZADOR_GERAL: mudar o culto de % muda a escala de todos os ministerios daquele dia.', old.data
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end if;

  /* ------------------------------------------------------------ INSERT --- */
  if new.evento is not null then
    if new.equipe_id is null then
      raise exception 'EVENTO_SEM_MINISTERIO: evento e de um ministerio so.'
        using errcode = 'not_null_violation';
    end if;
    if not lidera_equipe(new.equipe_id) then
      raise exception 'EVENTO_DE_OUTRO_MINISTERIO: % nao e do seu ministerio.', new.evento
        using errcode = 'insufficient_privilege';
    end if;
    if new.data < current_date then
      raise exception 'DATA_NO_PASSADO: % ja passou.', new.data
        using errcode = 'check_violation';
    end if;
    /* DIA DE CULTO NÃO RECEBE EVENTO (a 54 explica os dois lados). A regra é
       sobre o CALENDÁRIO e não sobre o que já existe, porque o culto regular
       só nasce quando o líder salva o domingo. */
    if extract(dow from new.data) = 0 then
      raise exception 'DIA_DE_CULTO: % e domingo, e domingo ja tem culto. Evento esporadico e para dia sem culto.', new.data
        using errcode = 'check_violation';
    end if;
    /* 98: todo sábado é Follow (Arthur, 30/09/2026). Até aqui o primeiro
       sábado do mês ficava de fora (`day > 7`) e recebia evento. */
    if extract(dow from new.data) = 6 then
      raise exception 'DIA_DE_CULTO: % e sabado de Follow. Evento esporadico e para dia sem culto.', new.data
        using errcode = 'check_violation';
    end if;
    select exists (select 1 from cultos c where c.data = new.data and c.evento is null)
      into v_tem_culto;
    if v_tem_culto then
      raise exception 'JA_TEM_CULTO: % ja tem culto marcado.', new.data
        using errcode = 'check_violation';
    end if;

    /* ================================================================ 56 ===
       UM DIA É UM DIA, E ISSO PRECISA SER DITO ANTES DO ÍNDICE.

       O índice único abaixo é quem garante de verdade. Esta checagem existe
       só para a frase: violação de índice chega na tela como
       `23505 duplicate key value violates unique constraint "ux_..."`, que
       não diz a ninguém o que fazer. Aqui a pessoa lê o nome do evento que
       já está lá e entende que precisa escolher outro dia. */
    if exists (select 1 from cultos c
                where c.data = new.data and c.equipe_id = new.equipe_id
                  and c.evento is not null) then
      raise exception 'JA_TEM_EVENTO: % ja tem "%" marcado para este ministerio, e a escala e um dia por data.',
        new.data, (select c.evento from cultos c
                    where c.data = new.data and c.equipe_id = new.equipe_id
                      and c.evento is not null limit 1)
        using errcode = 'unique_violation';
    end if;

  elsif not sou_lider() then
    raise exception 'SEM_PERMISSAO' using errcode = 'insufficient_privilege';

  else
    /* ================================================================ 69 ===
       O RECÍPROCO DE `JA_TEM_CULTO`, QUE FALTAVA.

       O ramo do evento, logo acima, recusa criar evento em dia que já tem
       culto regular. Não havia o contrário: criar CULTO REGULAR num dia que
       já tem evento passava, e o dia ficava com dois.

       É exatamente o culto fantasma que a migração 61 existe para consertar,
       entrando por outra porta: `idDoCulto` (lib/ponte.ts) e `salvar_dia`
       preferem o evento, então a escala fica gravada numa linha e a tela
       aponta para a outra. A 56 já escreveu a regra — "um dia é um dia" — e
       aplicou num sentido só. */
    if exists (select 1 from cultos c where c.data = new.data and c.evento is not null) then
      raise exception 'DIA_TEM_EVENTO: % ja tem "%" marcado. Um dia e um dia: ou o culto da igreja, ou o evento.',
        new.data, (select c.evento from cultos c
                    where c.data = new.data and c.evento is not null
                    order by c.id limit 1)
        using errcode = 'unique_violation';
    end if;
  end if;
  return new;
end $function$;

-- =========================================================================
-- 4 · o evento que já está num sábado futuro vira o Follow da igreja
-- =========================================================================
do $conv$
declare r record; v_regular uuid; n_conv int := 0; pulou text[] := '{}';
begin
  for r in
    select c.data, array_agg(c.id order by c.id) as ids, count(*) as n
      from cultos c
     where c.evento is not null and c.data >= current_date and extract(dow from c.data) = 6
     group by c.data order by c.data
  loop
    select id into v_regular from cultos where data = r.data and evento is null;
    if v_regular is null and r.n = 1 then
      update cultos set evento = null, equipe_id = null, inicio = null where id = r.ids[1];
      n_conv := n_conv + 1;
    else
      pulou := pulou || format('%s (%s evento(s)%s)', to_char(r.data, 'DD/MM/YYYY'), r.n,
                               case when v_regular is not null then ', ja com culto regular' else '' end);
    end if;
  end loop;
  raise notice '98 · % sabado(s) com evento viraram o Follow da igreja, com a escala que ja tinham.', n_conv;
  if array_length(pulou, 1) > 0 then
    raise warning '98 · ficaram como estavam, para decidir a mao: %', array_to_string(pulou, '; ');
  end if;
end $conv$;

-- =========================================================================
-- A CONFERÊNCIA
-- =========================================================================
do $conf$
declare
  falhas text[] := '{}';
  v_sabados int; v_na_grade int; v_primeiro date; v_r jsonb; v_eq uuid;
  v_regular_ok boolean := false; v_evento_recusado text := null; montou boolean := false;
  v_sozinhos int;
begin
  /* 1 · a grade tem todo sábado da janela */
  select count(*) into v_sabados from generate_series(current_date, current_date + 60, '1 day') d
   where extract(dow from d) = 6;
  select count(*) into v_na_grade from eu_proximos_domingos() g where extract(dow from g.data) = 6;
  if v_na_grade <> v_sabados then
    falhas := falhas || format('a grade do voluntario tem %s sabado(s) de %s', v_na_grade, v_sabados); end if;

  /* um primeiro sábado de mês, no futuro e sem nenhum culto marcado */
  select min(d)::date into v_primeiro from generate_series(current_date + 1, current_date + 800, '1 day') d
   where extract(dow from d) = 6 and extract(day from d) <= 7
     and not exists (select 1 from cultos c where c.data = d::date);

  begin
    insert into equipes (nome, slug, ordem) values ('CONF98 Teste', 'conf98-teste', 998) returning id into v_eq;
    insert into lideres (email, equipe_id) values ('conf98@exemplo.invalid', v_eq);
    montou := true;
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf98@exemplo.invalid","role":"authenticated"}', true);

    /* 2 · pela função, o primeiro sábado é dia de culto */
    v_r := public.criar_evento(v_eq, v_primeiro, 'CONF98 evento', null);
    if coalesce(v_r->>'erro', '') <> 'DIA_DE_CULTO' then
      falhas := falhas || format('criar_evento aceitou o primeiro sabado %s: %s', v_primeiro, v_r::text); end if;

    /* 3 · direto na tabela, também */
    begin
      insert into cultos (data, evento, equipe_id) values (v_primeiro, 'CONF98 direto', v_eq);
      falhas := falhas || format('o guarda aceitou evento no primeiro sabado %s', v_primeiro)::text;
    exception when others then
      v_evento_recusado := sqlerrm;
      if position('DIA_DE_CULTO' in sqlerrm) = 0 then
        falhas := falhas || ('o guarda recusou, mas por outro motivo: ' || sqlerrm)::text; end if;
    end;

    /* 4 · e o culto regular desse sábado nasce */
    begin
      insert into cultos (data) values (v_primeiro);
      v_regular_ok := true;
    exception when others then
      falhas := falhas || ('o culto regular do primeiro sabado nao nasceu: ' || sqlerrm)::text;
    end;
    reset role;
    raise exception 'CONF98_DESFAZ';
  exception when others then
    if sqlerrm <> 'CONF98_DESFAZ' then
      falhas := falhas || ('o cenario nao montou: ' || sqlerrm)::text;
    end if;
  end;

  /* 5 · nenhum sábado futuro ficou com evento sozinho (sem culto regular) */
  select count(*) into v_sozinhos from (
    select c.data from cultos c
     where c.evento is not null and c.data >= current_date and extract(dow from c.data) = 6
       and not exists (select 1 from cultos r where r.data = c.data and r.evento is null)
     group by c.data having count(*) = 1) x;
  if v_sozinhos > 0 then
    falhas := falhas || format('%s sabado(s) futuro(s) ainda com um evento sozinho', v_sozinhos); end if;

  if exists (select 1 from equipes where slug = 'conf98-teste')
     or exists (select 1 from lideres where email = 'conf98@exemplo.invalid') then
    falhas := falhas || 'o cenario de teste ficou no banco'::text; end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'98 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 98 · conferencia: a grade do voluntario tem os % sabados dos proximos 60 dias; o primeiro sabado (%) recusa evento pela funcao e pela tabela e aceita o culto regular; nenhum sabado futuro ficou com evento sozinho. Cenario desfeito.', v_sabados, to_char(v_primeiro, 'DD/MM/YYYY');
end $conf$;

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (98, '98 · todo sabado entra na grade do voluntario', 'eu_proximos_domingos', 'in (0, 6)'),
      (98, '98 · criar_evento recusa todo sabado', 'criar_evento', '98: todo sábado'),
      (98, '98 · o guarda recusa evento em todo sabado', 'culto_guarda', '98: todo sábado')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (98, '98-o-follow-e-todo-sabado-as-19h.sql')
  on conflict (n) do nothing;

commit;
