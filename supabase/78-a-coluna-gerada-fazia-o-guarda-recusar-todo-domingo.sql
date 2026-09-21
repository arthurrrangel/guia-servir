-- =========================================================================
-- 78 · A COLUNA GERADA FAZIA O GUARDA RECUSAR TODO DOMINGO
--
-- 21/09/2026. Reauditoria das migrações 71 a 77, que encontrou um defeito na
-- 69 — escrita por mim, nesta mesma rodada, e AINDA NÃO APLICADA em
-- produção. É o defeito mais grave desta auditoria inteira, e é meu.
--
-- -------------------------------------------------------------------------
-- O QUE A 69 QUEBROU
--
-- A 69 trocou, dentro de `culto_guarda`, a lista de quatro colunas por uma
-- comparação da linha inteira:
--
--     if old.evento is null and not lidera_tudo()
--        and old is distinct from new then
--       raise exception 'CULTO_REGULAR_SO_ORGANIZADOR_GERAL: ...';
--
-- e eu escrevi ao lado, com todas as letras:
--
--     "O `on conflict do update set data = excluded.data` de `salvar_dia`
--      continua passando, porque ali nada muda de verdade."
--
-- Não continua. `cultos.tipo` é `GENERATED ALWAYS` (migração 53). Num
-- gatilho BEFORE, o Postgres ainda não calculou as colunas geradas: `new`
-- chega com `tipo` NULO enquanto `old` vem preenchido. Então
-- `old is distinct from new` é VERDADEIRO em toda atualização de `cultos` —
-- inclusive na que não muda nada.
--
-- MEDIDO, como o organizador do Louvor (que não organiza a igreja inteira),
-- num domingo que já estava no calendário:
--
--     salvar_dia(louvor, 2026-10-04, null, '[]', null)
--       -> CULTO_REGULAR_SO_ORGANIZADOR_GERAL: mudar o culto de 2026-10-04
--          muda a escala de todos os ministerios daquele dia.
--
-- `salvar_dia` faz `insert into cultos (data) values (p_data) on conflict
-- (data) where evento is null do update set data = excluded.data`. O
-- `do update` dispara o gatilho, e o gatilho recusa.
--
-- Com a 69 aplicada e sem esta, NENHUM organizador de área salva a escala de
-- domingo nenhum. Só quem organiza a igreja inteira. E salvar a escala de
-- domingo é o app.
--
-- -------------------------------------------------------------------------
-- POR QUE A CONFERÊNCIA DA 69 DISSE 8/8
--
-- Os oito casos dela medem o que a 69 veio consertar: quem escreve no evento
-- de quem, e se o culto regular está protegido. Nenhum deles chama
-- `salvar_dia` como organizador de área num domingo que já existe — o
-- caminho mais comum do sistema inteiro. Conferência mede o que o autor
-- pensou em medir, e eu pensei no ataque, não no uso.
--
-- O caso 4 desta conferência é exatamente esse, e ele reprova sem a correção.
--
-- -------------------------------------------------------------------------
-- O CONSERTO
--
-- A comparação tira as colunas GERADAS dos dois lados. A lista vem do
-- catálogo, e não escrita à mão — pelo mesmo motivo que a linha inteira
-- entrou no lugar das quatro colunas na 69: lista escrita é a primeira coisa
-- a ficar para trás.
--
-- É correto por construção: coluna gerada é função das outras colunas, logo
-- se todas as outras são iguais, ela também é.
-- =========================================================================

/* A TRANCA. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(78);
  end if;
end $tranca$;

-- =========================================================================
-- quais colunas o Postgres calcula sozinho
--
-- `stable` e não `immutable`: a resposta muda quando alguém acrescenta uma
-- coluna gerada, e um plano guardado com a lista antiga é justamente o que
-- traria o defeito de volta. Custa uma leitura de catálogo por linha alterada
-- em `cultos` — tabela de algumas centenas de linhas, mexida algumas vezes
-- por semana. Medido: nenhuma diferença perceptível em `salvar_dia`.
-- =========================================================================
create or replace function public.colunas_geradas(p_tabela regclass)
returns text[]
language sql stable set search_path = public as $fn$
  select coalesce(array_agg(a.attname order by a.attnum), '{}'::text[])
    from pg_attribute a
   where a.attrelid = p_tabela
     and a.attnum > 0 and not a.attisdropped
     and a.attgenerated <> '';
$fn$;
revoke all on function public.colunas_geradas(regclass) from public, anon, authenticated;
comment on function public.colunas_geradas(regclass) is
  'As colunas GENERATED de uma tabela, lidas do catalogo. Existe porque num gatilho BEFORE o Postgres ainda nao calculou essas colunas: `new` chega com elas nulas e `old` vem preenchida, entao `old is distinct from new` e sempre verdade. Ver a migracao 78.';

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
    if extract(dow from new.data) = 6 and extract(day from new.data) > 7 then
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
end $function$

;

do $reg$ begin
  if to_regclass('public.schema_sonda') is not null then
    /* a sonda da 56 e a da 69 procuravam `old is distinct from new`, que saiu
       do corpo. Elas passam a procurar a comparacao nova. */
    update public.schema_sonda set procura = 'colunas_geradas(''public.cultos''::regclass)'
     where alvo = 'culto_guarda' and procura = 'old is distinct from new';
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (78, '78 · o guarda ignora coluna gerada', 'culto_guarda',
           'to_jsonb(old) - colunas_geradas')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo)
      values (78, '78-a-coluna-gerada-fazia-o-guarda-recusar-todo-domingo.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;

-- =========================================================================
-- CONFERÊNCIA
--
-- O caso 4 é o que faltava na 69: `salvar_dia` como organizador de ÁREA, num
-- domingo que já está no calendário. É o caminho mais usado do sistema, e
-- nenhum dos oito casos da 69 passava por ele.
--
-- Os casos 5 a 8 recobram o que a 69 protegia, porque conserto que abre um
-- buraco no lugar do outro não é conserto.
-- =========================================================================
do $conferir$
declare
  v_falhas text := ''; v_suf text; v_louvor uuid; v_midia uuid;
  v_dia date; v_culto uuid; v_criei boolean := false;
  v_ev uuid; v_dia_ev date; v_r uuid; v_erro text; v_n int;
  jwt_lider constant text := '{"email":"jander.jpcris@gmail.com","role":"authenticated"}';
  jwt_geral constant text := '{"email":"arthurrangel427@gmail.com","role":"authenticated"}';
begin
  v_suf := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  select id into v_louvor from equipes where slug = 'louvor';
  select id into v_midia  from equipes where slug = 'midia';
  if v_louvor is null or v_midia is null then
    raise notice '78 · PULEI a conferencia: base sem as equipes de exemplo.'; return;
  end if;

  -- 1 · o cenário: `cultos.tipo` É gerada (sem isso o resto não prova nada)
  select count(*) into v_n from information_schema.columns
   where table_schema = 'public' and table_name = 'cultos' and is_generated = 'ALWAYS';
  if v_n = 0 then
    v_falhas := v_falhas || E'\n  1. `cultos` nao tem coluna gerada: a conferencia inteira seria vacuo';
  end if;
  if coalesce(array_length(colunas_geradas('public.cultos'::regclass), 1), 0) <> v_n then
    v_falhas := v_falhas || format(E'\n  1b. colunas_geradas disse %s e o catalogo diz %s',
      coalesce(array_length(colunas_geradas('public.cultos'::regclass), 1), 0), v_n);
  end if;

  -- o domingo do cenário: reusa o que existe, como a 76 aprendeu a fazer
  v_dia := (current_date + 7)::date;
  while extract(dow from v_dia) <> 0 loop v_dia := v_dia + 1; end loop;
  select id into v_culto from cultos where data = v_dia and evento is null;
  if v_culto is null then
    insert into cultos (data) values (v_dia) returning id into v_culto;
    v_criei := true;
  end if;

  -- 2 · a no-op direta não levanta mais
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_lider, true);
    update cultos set data = data where id = v_culto;
    reset role; v_erro := 'passou';
  exception when others then reset role; v_erro := sqlerrm; end;
  if v_erro <> 'passou' then
    v_falhas := v_falhas || format(E'\n  2. `update cultos set data = data` ainda levanta: %s', v_erro);
  end if;

  -- 3 · e a coluna gerada continua sendo o que a faria levantar
  if not ((to_jsonb((select c from cultos c where c.id = v_culto)) ? 'tipo')) then
    v_falhas := v_falhas || E'\n  3. `tipo` sumiu de `cultos`: a premissa desta migracao mudou';
  end if;

  -- 4 · O CASO QUE FALTAVA NA 69: o organizador de ÁREA salva o domingo
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_lider, true);
    v_r := salvar_dia(v_louvor, v_dia, null, '[]'::jsonb, null);
    reset role; v_erro := 'ok';
  exception when others then reset role; v_erro := sqlerrm; end;
  if v_erro <> 'ok' then
    v_falhas := v_falhas || format(
      E'\n  4. o organizador de AREA nao consegue salvar a escala de domingo: %s', v_erro);
  end if;

  -- 4b · e o organizador GERAL também, que nunca esteve em dúvida
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_geral, true);
    v_r := salvar_dia(v_midia, v_dia, null, '[]'::jsonb, null);
    reset role; v_erro := 'ok';
  exception when others then reset role; v_erro := sqlerrm; end;
  if v_erro <> 'ok' then
    v_falhas := v_falhas || format(E'\n  4b. o organizador GERAL tambem nao salva: %s', v_erro);
  end if;

  -- =====================================================================
  -- 5 a 8 · E O QUE A 69 PROTEGIA CONTINUA PROTEGIDO
  -- =====================================================================

  -- 5 · mudar a DATA do domingo continua sendo só de quem organiza a igreja
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_lider, true);
    update cultos set data = v_dia + 1 where id = v_culto;
    get diagnostics v_n = row_count;
    reset role;
    v_erro := case when v_n = 0 then 'recusado' else 'MUDOU ' || v_n || ' linha(s)' end;
  exception when insufficient_privilege then reset role; v_erro := 'recusado';
            when others then reset role; v_erro := 'outro: ' || sqlerrm; end;
  if v_erro <> 'recusado' then
    v_falhas := v_falhas || format(E'\n  5. o organizador de area mudou a DATA do domingo: %s', v_erro);
  end if;

  -- 6 · e a anotação do domingo também
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_lider, true);
    update cultos set obs = 'mexi aqui ' || v_suf where id = v_culto;
    get diagnostics v_n = row_count;
    reset role;
    v_erro := case when v_n = 0 then 'recusado' else 'MUDOU ' || v_n || ' linha(s)' end;
  exception when insufficient_privilege then reset role; v_erro := 'recusado';
            when others then reset role; v_erro := 'outro: ' || sqlerrm; end;
  if v_erro <> 'recusado' then
    v_falhas := v_falhas || format(E'\n  6. o organizador de area mudou a anotacao do domingo: %s', v_erro);
  end if;
  if exists (select 1 from cultos where id = v_culto and obs = 'mexi aqui ' || v_suf) then
    v_falhas := v_falhas || E'\n  6b. e a anotacao ficou gravada';
  end if;

  -- 7 · e o evento de OUTRO ministério continua fora do alcance dele
  v_dia_ev := (current_date + 45)::date;
  while extract(dow from v_dia_ev) in (0, 6) loop v_dia_ev := v_dia_ev + 1; end loop;
  if not exists (select 1 from cultos where data = v_dia_ev) then
    insert into cultos (data, evento, equipe_id, obs)
         values (v_dia_ev, 'Conf78 ' || v_suf, v_midia, 'anotacao ' || v_suf)
      returning id into v_ev;
    /* CONTA LINHA, e nao confia na ausencia de excecao. A primeira versao
       deste caso marcava 'ACEITOU' quando nada levantava — mas a politica
       `cultos_editar` simplesmente NAO ENXERGA o evento de outro ministerio,
       entao o update alcanca zero linhas e volta em silencio, que e o
       comportamento certo. O caso acusava o conserto de ter aberto um buraco
       que ele nao abriu. Erro meu, e foi a propria conferencia que contou. */
    begin
      set local role authenticated; perform set_config('request.jwt.claims', jwt_lider, true);
      update cultos set obs = null where id = v_ev;
      get diagnostics v_n = row_count;
      reset role;
      v_erro := case when v_n = 0 then 'recusado' else 'MUDOU ' || v_n || ' linha(s)' end;
    exception when insufficient_privilege then reset role; v_erro := 'recusado';
              when others then reset role; v_erro := 'outro: ' || sqlerrm; end;
    if v_erro <> 'recusado' then
      v_falhas := v_falhas || format(E'\n  7. o organizador do Louvor mexeu no evento da Midia: %s', v_erro);
    end if;
    if (select obs from cultos where id = v_ev) is distinct from 'anotacao ' || v_suf then
      v_falhas := v_falhas || E'\n  7b. e a anotacao do evento alheio mudou';
    end if;

    /* 7c · A SEGUNDA CAMADA, OLHADA NO CATALOGO — e isto foi medido, nao
       suposto: tirei a guarda do gatilho e os casos 7 e 7b continuaram
       VERDES. Quem recusa o update acima e a politica `cultos_editar`, que
       simplesmente nao enxerga o evento de outro ministerio; o gatilho e a
       rede embaixo dela, e nenhum teste de comportamento consegue separar as
       duas enquanto as duas funcionam.

       E a 69 existe porque a politica sozinha JA FALHOU uma vez. Entao a
       camada de baixo e pinada aqui, pelo corpo da funcao, do mesmo jeito
       que a conferencia da 69 pina as suas. */
    select (length(prosrc) - length(replace(prosrc, 'not lidera_equipe(old.equipe_id)', '')))
           / length('not lidera_equipe(old.equipe_id)')
      into v_n from pg_proc where proname = 'culto_guarda';
    if coalesce(v_n, 0) < 2 then
      v_falhas := v_falhas || format(
        E'\n  7c. `not lidera_equipe(old.equipe_id)` aparece %s vez(es) em culto_guarda, esperava 2 (DELETE e UPDATE)',
        coalesce(v_n, 0));
    end if;
    delete from culto_obs where culto_id = v_ev;
    delete from escalacoes where culto_id = v_ev;
    delete from cultos where id = v_ev;
  else
    v_falhas := v_falhas || E'\n  7. nao consegui um dia livre para o evento do cenario';
  end if;

  -- 8 · e o domingo continua não virando evento na mão dele
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_lider, true);
    update cultos set evento = 'virou evento', equipe_id = v_louvor where id = v_culto;
    get diagnostics v_n = row_count;
    reset role;
    v_erro := case when v_n = 0 then 'recusado' else 'MUDOU ' || v_n || ' linha(s)' end;
  exception when insufficient_privilege then reset role; v_erro := 'recusado';
            when others then reset role; v_erro := 'outro: ' || sqlerrm; end;
  if v_erro <> 'recusado' then
    v_falhas := v_falhas || format(E'\n  8. o domingo virou evento na mao do organizador de area: %s', v_erro);
  end if;

  /* limpeza: só o que esta conferência criou. `salvar_dia` com lista vazia
     não deixa escalação, mas deixa a linha de `culto_obs` do dia. */
  delete from culto_obs where culto_id = v_culto and equipe_id in (v_louvor, v_midia);
  if v_criei then delete from cultos where id = v_culto; end if;

  if v_falhas <> '' then
    raise exception E'CONFERENCIA DA 78 REPROVOU:%s', v_falhas;
  end if;
  raise notice 'CONFERENCIA DA 78: 9/9. O organizador de area volta a salvar o domingo, e tudo que a 69 protegia continua protegido.';
end $conferir$;
