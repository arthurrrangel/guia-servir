-- =========================================================================
-- 80 · OS CASTS CEGOS QUE A 68 DEIXOU, A JANELA QUE A 65 PROMETEU, E UM
--      GRANT QUE A 70 AFIRMOU EXISTIR
--
-- 21/09/2026. Três achados da reauditoria das migrações 63 a 70. Os três são
-- a mesma coisa vista de ângulos diferentes: o arquivo diz que fez, e não fez.
--
-- -------------------------------------------------------------------------
-- 1. `dem_lista` AINDA DEVOLVE ERRO CRU DO POSTGRES
--
-- A 68 tirou o cast cego de `limite` e escreveu no cabeçalho que "o mesmo
-- padrão — cast cego em parâmetro de fora — é o tipo de coisa que se copia
-- para a próxima função". Ela descreveu o que ela mesma não fez: três linhas
-- abaixo da correção ficaram três casts iguais.
--
-- Medido em 21/09, com um membro de teste:
--
--     dem_lista(token, '{"setor":"x"}')
--       -> 22P02 invalid input syntax for type uuid: "x"
--     dem_lista(token, '{"abertas":"talvez"}')
--       -> 22P02 invalid input syntax for type boolean: "talvez"
--
-- `dem_lista` não tem `exception`, então nada segura.
--
-- -------------------------------------------------------------------------
-- 2. `eu_responder` NUNCA TEVE A JANELA DE DATAS
--
-- A 65 diz, no cabeçalho: "as três ganham uma janela de datas (400 dias para
-- trás e para frente)". `eu_disponibilidade` ganhou, `eu_indisponibilidade`
-- ganhou, `eu_responder` não. E é ela que termina chamando `eu_marcar_dia`
-- com a data do culto — e `eu_marcar_dia`, que a mesma 65 define como "o
-- único lugar que escreve", também não tem janela.
--
-- -------------------------------------------------------------------------
-- 3. A 70 AFIRMA UM GRANT POR COLUNA EM `pessoas` QUE NÃO EXISTE
--
-- O cabeçalho da 70, explicando por que `pessoas_editar` fica sem caso de
-- teste, diz: "Quem protege `auth_email` de verdade é o GRANT por coluna,
-- não a política. Abrir a política não abre a escrita."
--
-- Medido:
--
--     select ... from information_schema.column_privileges
--      where table_name = 'pessoas' and grantee = 'authenticated'
--
--     -> auth_email/UPDATE, email/UPDATE, nome/UPDATE, telefone/UPDATE, ...
--        (todas as colunas, sem restrição nenhuma)
--
-- Não existe GRANT por coluna em `pessoas`. O único revoke que toca a tabela
-- em todo `supabase/` é `revoke all on pessoas from anon` (22:290). Quem
-- barra é só `pessoas_editar`, que é `lidera_tudo()` nas duas pontas.
--
-- POR QUE ISSO É PIOR QUE UM COMENTÁRIO ERRADO: `pessoas.auth_email` é
-- credencial de entrada. `lidera_tudo()` decide quem é admin comparando
-- `lower(p.auth_email)` com o e-mail do JWT (33:320). O cabeçalho da 70 é o
-- documento que diz ao próximo auditor que essa política dispensa caso —
-- então quem um dia afrouxar `pessoas_editar`, por exemplo para o líder
-- corrigir o contato do próprio time, entrega a escrita de `auth_email` na
-- linha do admin, com o arquivo garantindo que o GRANT pega.
--
-- Esta migração faz a afirmação virar verdade, em vez de só corrigir o texto:
-- o GRANT por coluna passa a existir, lido do catálogo com lista de exclusão
-- (o idioma da 59), e `auth_email` fica de fora.
--
-- Quem escreve `auth_email` legitimamente continua escrevendo: `candidatar` e
-- `dem_ajustar` são `security definer` e não passam por GRANT de
-- `authenticated`. Conferido nos dois.
-- =========================================================================

/* A TRANCA. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(80);
  end if;
end $tranca$;

-- =========================================================================
-- 3 · o GRANT por coluna de `pessoas`, lido do catálogo
-- =========================================================================
do $grants$
declare
  v_cols text;
  /* fora do UPDATE, por escrito e com motivo:
       auth_email — é a credencial de entrada, e `lidera_tudo()` decide quem
                    é admin comparando com ela;
       id         — chave. */
  v_fora constant text[] := array['auth_email','id'];
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'pessoas'
     and column_name <> all (v_fora);

  execute 'revoke update on public.pessoas from authenticated';
  execute format('grant update (%s) on public.pessoas to authenticated', v_cols);
  raise notice 'OK — UPDATE de pessoas relido do catalogo, sem auth_email: %', v_cols;
end $grants$;

CREATE OR REPLACE FUNCTION public.dem_lista(p_token text DEFAULT NULL::text, p_f jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'demandas', 'public'
AS $function$
declare
  m demandas.membros; v jsonb; v_total int;
  /* 300 é o teto duro. A tela pede menos quando sabe o que quer; quem não
     pedir nada recebe 300, que é mais do que cabe num polegar e MUITO menos
     que 20 mil. */
  /* 68 · O CÁLCULO SAIU DO `declare`, E O CAST DEIXOU DE SER CEGO.
     Aqui em cima nada é alcançável por `exception`: o `declare` roda ANTES do
     `begin`. Com `limite` = "abc", o `::int` estourava com o erro cru do
     Postgres ("invalid input syntax for type integer") e `lib/erros.ts`, que
     não reconhece a mensagem, traduzia para REDE — "verifique sua conexão"
     sobre um problema que não é de conexão. */
  v_lim int;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

  /* ============================================================== 80 ======
     OS OUTROS TRÊS CASTS CEGOS, QUE A 68 DEIXOU NO MESMO CORPO.

     A 68 tirou o cast de `limite` e escreveu, no cabeçalho, que "o mesmo
     padrão — cast cego em parâmetro de fora — é o tipo de coisa que se copia
     para a próxima função". Ela descreveu com precisão o que ela mesma não
     fez: três linhas abaixo da correção ficaram `(p_f->>'abertas')::boolean`,
     `(p_f->>'atrasadas')::boolean` e `(p_f->>'setor')::uuid`.

     Medido em 21/09, com um membro de teste:

         dem_lista(token, '{"setor":"x"}')
           -> 22P02 invalid input syntax for type uuid: "x"
         dem_lista(token, '{"abertas":"talvez"}')
           -> 22P02 invalid input syntax for type boolean: "talvez"

     cru, exatamente a forma que a 68 diz ter removido. `dem_lista` não tem
     `exception`, então nada segura.

     Cada um vira uma guarda com nome, como `LIMITE_INVALIDO`. O padrão aqui
     é o mesmo da 68: validar ANTES, com regex ou lista fechada, em vez de
     deixar o Postgres falar por nós. */
  if (p_f ? 'setor') and nullif(p_f->>'setor','') is not null
     and p_f->>'setor' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'SETOR_INVALIDO' using errcode = 'raise_exception';
  end if;
  /* `''` entra na lista porque chave presente com valor vazio é o que a tela
     manda quando o filtro é desmarcado — e é "não filtrei", não erro. Mas aí
     a EXPRESSÃO lá embaixo precisa de `nullif`, senão `''::boolean` levanta
     22P02 do mesmo jeito. A primeira versão desta guarda deixou a string
     vazia passar e o caso 4 da conferência contou. */
  if (p_f ? 'abertas') and coalesce(p_f->>'abertas','') not in ('', 'true', 'false') then
    raise exception 'FILTRO_INVALIDO: abertas' using errcode = 'raise_exception';
  end if;
  if (p_f ? 'atrasadas') and coalesce(p_f->>'atrasadas','') not in ('', 'true', 'false') then
    raise exception 'FILTRO_INVALIDO: atrasadas' using errcode = 'raise_exception';
  end if;

  if (p_f ? 'limite') and coalesce(p_f->>'limite','') !~ '^-?[0-9]{1,9}$' then
    return jsonb_build_object('ok', false, 'erro', 'LIMITE_INVALIDO');
  end if;
  v_lim := least(greatest(coalesce((p_f->>'limite')::int, 300), 1), 300);

  with filtradas as (
    select d.* from demandas.demandas d
     where demandas.pode_ver(m, d)
       and (coalesce(p_f->>'aba','tudo') <> 'minhas'  or d.aberta_por = m.id)
       and (coalesce(p_f->>'aba','tudo') <> 'setor'
            or (m.setor_id is not null and d.setor_responsavel = m.setor_id))
       and (coalesce(p_f->>'aba','tudo') <> 'comigo'  or d.responsavel_id = m.id)
       and (nullif(p_f->>'status','') is null or d.status = p_f->>'status')
       and (coalesce(nullif(p_f->>'abertas','')::boolean, false) = false
            or d.status in ('aberta','execucao','travada'))
       and (coalesce(nullif(p_f->>'atrasadas','')::boolean, false) = false
            or (d.prazo is not null and d.prazo < current_date
                and d.status in ('aberta','execucao','travada')))
       and (nullif(p_f->>'setor','') is null
            or d.setor_responsavel = (p_f->>'setor')::uuid)
       and (nullif(p_f->>'busca','') is null
            or d.titulo ilike '%'||(p_f->>'busca')||'%'
            or d.descricao ilike '%'||(p_f->>'busca')||'%'
            or d.numero::text = p_f->>'busca')
  ), ordenadas as (
    select f.* from filtradas f
     order by case f.prioridade when 'urgente' then 0 when 'alta' then 1
                                when 'normal' then 2 else 3 end,
              f.prazo nulls last, f.criada_em
     limit v_lim
  )
  select coalesce(jsonb_agg(demandas.resumo(o) order by
           case o.prioridade when 'urgente' then 0 when 'alta' then 1
                             when 'normal' then 2 else 3 end,
           o.prazo nulls last, o.criada_em), '[]'::jsonb),
         (select count(*) from filtradas)
    into v, v_total
    from ordenadas o;

  return jsonb_build_object('ok', true, 'itens', v,
                            'total', v_total, 'limite', v_lim,
                            'tem_mais', v_total > jsonb_array_length(v));
end $function$

;
CREATE OR REPLACE FUNCTION public.eu_responder(p_token text, p_culto_id uuid, p_status text, p_funcao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_data date; v_n int;
begin
  if p_status not in ('confirmado','recusado') then raise exception 'Resposta invalida'; end if;
  select id into v_id from voluntarios where token = p_token and ativo;
  if v_id is null then raise exception 'Link invalido'; end if;
  select data into v_data from cultos where id = p_culto_id;

  /* 65 · MUDANÇA 1: culto que não existe. Antes `v_data` ficava nulo e a
     função seguia mexendo em `indisponibilidades` com `data = null`. */
  if v_data is null then raise exception 'Esse culto nao existe mais.'; end if;

  /* ============================================================== 80 ======
     A JANELA QUE A 65 DISSE TER POSTO NAS TRÊS PORTAS.

     O cabeçalho da 65 diz: "as três ganham uma janela de datas (400 dias
     para trás e para frente)". `eu_disponibilidade` ganhou e
     `eu_indisponibilidade` ganhou. Esta não — e é justamente ela que termina
     chamando `eu_marcar_dia` com a data do culto, sem filtro nenhum.
     `eu_marcar_dia`, que a 65 define como "o único lugar que escreve",
     também não tem janela: a guarda ficou fora dela, em dois dos três
     chamadores.

     `eu_responder(token, <id de um culto de 2019>, 'confirmado')` grava em
     `disponibilidade` na data daquele culto. Não é dano grande — é uma linha
     numa tabela que a grade não mostra — mas é a afirmação do cabeçalho não
     valendo, e é a terceira porta da mesma família ficando sem a mesma
     guarda. Mesma janela, mesma frase. */
  if v_data < current_date - 400 or v_data > current_date + 400 then
    raise exception 'Essa data esta fora do periodo que da para responder.';
  end if;

  /* 65 · MUDANÇA 2: a ORDEM inverteu, e é o coração deste arquivo.
     Antes a função apagava a indisponibilidade ANTES de tentar atualizar a
     escalação — então um culto em que a pessoa não tem posto nenhum (tela
     velha aberta, id de outra equipe, link antigo no WhatsApp) apagava o "não
     posso" dela daquele dia, em silêncio, sem mudar mais nada. Agora a
     escalação decide: se nada meu mudou, o dia não é tocado.

     MUDANÇA 3, na mesma instrução: `and e.status <> 'furou'`. A irmã
     `eu_indisponibilidade` tem essa guarda desde o primeiro dia; esta não
     tinha, e por isso quem furou podia abrir o link, tocar "Eu vou" e apagar
     o registro que a liderança fez. Furo é fato observado por quem estava
     lá; desfazer é ato de quem lidera, na tela de Escala. */
  /* 71 · `and (p_funcao_id is null or funcao_id = p_funcao_id)`.

     A tela desenha UM CARTÃO POR POSTO, cada um com "Eu vou" e "Não posso", e
     esta função mexia no culto INTEIRO. Medido em 21/09: a pessoa tinha FOTO
     confirmada e EDIÇÃO pendente, tocou "Não posso" no cartão da EDIÇÃO, e as
     DUAS viraram `recusado`. A líder vê duas vagas e remaneja gente que não
     precisava.

     O caminho de volta era pior: "Consegui, posso sim" num posto RECONFIRMAVA
     o outro, que ela tinha recusado de propósito — e ela aparece escalada num
     lugar onde disse que não podia.

     `p_funcao_id` nulo continua querendo dizer "respondo pelo dia inteiro",
     que é uma resposta legítima e é o que a versão de três argumentos manda. */
  update escalacoes set status = p_status::status_escala, respondido_em = now()
   where culto_id = p_culto_id and voluntario_id = v_id
     and status <> 'furou'
     and (p_funcao_id is null or funcao_id = p_funcao_id);
  get diagnostics v_n = row_count;

  if v_n = 0 then
    if exists (select 1 from escalacoes
                where culto_id = p_culto_id and voluntario_id = v_id and status = 'furou') then
      raise exception 'A lideranca registrou falta nesse dia. Fale com quem organiza a sua area.';
    end if;
    /* ========================================================== 75 ======
       NADA FOI ESCRITO, E A TELA PRECISA SABER DISSO.

       Este `return` existe desde a 65 e está certo: não é erro da pessoa, e
       não há dia para marcar. O problema é que a função devolvia `void`,
       então a tela não tinha como distinguir "gravei" de "não havia o que
       gravar" — e escrevia, nos dois casos:

           "Confirmado. Obrigado!"

       Acontece com tela velha aberta numa aba, com link antigo mandado no
       grupo, e quando a líder tira a pessoa do posto entre a tela carregar e
       ela responder. A pessoa fecha o celular achando que confirmou. */
    return jsonb_build_object('ok', true, 'mudou', 0, 'motivo', 'SEM_POSTO_SEU');
  end if;

  /* 65 · as duas escritas passam pelo lugar só. 71 · E O DIA DEIXA DE SAIR DA
     ÚLTIMA TECLA.

     Era `eu_marcar_dia(..., p_status = 'confirmado')`: recusar UM posto
     marcava o DIA inteiro como indisponível, mesmo com a pessoa continuando
     escalada e confirmada em outro. O motor então a tirava de um domingo em
     que ela tinha dito que ia.

     A pergunta certa não é "o que ela acabou de teclar" e sim "depois desta
     resposta, ela ainda vem neste dia?". Ela vem se sobrou qualquer posto dela
     que não esteja recusado nem furado. */
  perform eu_marcar_dia(v_id, v_data,
    exists (select 1 from escalacoes e
             where e.culto_id = p_culto_id and e.voluntario_id = v_id
               and e.status not in ('recusado','furou')));

  return jsonb_build_object('ok', true, 'mudou', v_n, 'status', p_status);
end $function$;

do $reg$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (80, '80 · dem_lista valida setor antes de converter', 'dem_lista', 'setor_invalido'),
      (80, '80 · dem_lista valida os booleanos', 'dem_lista', 'filtro_invalido: abertas'),
      (80, '80 · eu_responder tem a janela que a 65 prometeu', 'eu_responder',
           'v_data < current_date - 400')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo)
      values (80, '80-os-casts-cegos-que-a-68-deixou-e-a-janela-que-a-65-prometeu.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;

-- =========================================================================
-- CONFERÊNCIA
-- =========================================================================
do $conferir$
declare
  v_falhas text := ''; v_suf text; v_tok text; v_s uuid; v_m uuid; v_erro text;
  v_eq uuid; v_fn uuid; v_p uuid; v_v uuid; v_vtok text; v_c uuid; v_velho uuid; v_n int;
begin
  v_suf := substr(md5(random()::text || clock_timestamp()::text), 1, 8);

  -- =====================================================================
  -- 1 a 4 · os casts de `dem_lista`
  -- =====================================================================
  select id into v_s from demandas.setores limit 1;
  if v_s is null then
    v_falhas := v_falhas || E'\n  0. base sem setor de demandas: os casos 1 a 4 seriam vacuo';
  else
    insert into demandas.membros (nome, papel, setor_id, token)
         values ('Conf80 ' || v_suf, 'solicitante', v_s, encode(gen_random_bytes(12),'hex'))
      returning id, token into v_m, v_tok;

    -- 1 · um filtro BOM continua funcionando (senão o conserto quebrou o recurso)
    begin
      perform dem_lista(v_tok, jsonb_build_object('setor', v_s::text)); v_erro := 'ok';
    exception when others then v_erro := sqlerrm; end;
    if v_erro <> 'ok' then
      v_falhas := v_falhas || format(E'\n  1. filtro de setor VALIDO foi recusado: %s', v_erro);
    end if;
    begin
      perform dem_lista(v_tok, '{"abertas":"true","atrasadas":"false"}'::jsonb); v_erro := 'ok';
    exception when others then v_erro := sqlerrm; end;
    if v_erro <> 'ok' then
      v_falhas := v_falhas || format(E'\n  1b. booleanos validos foram recusados: %s', v_erro);
    end if;

    -- 2 · setor que não é uuid: erro COM NOME, e não 22P02 cru
    begin
      perform dem_lista(v_tok, '{"setor":"x"}'::jsonb); v_erro := 'ACEITOU';
    exception when others then v_erro := sqlerrm; end;
    if v_erro not like 'SETOR_INVALIDO%' then
      v_falhas := v_falhas || format(E'\n  2. setor="x" respondeu "%s" (esperava SETOR_INVALIDO)', v_erro);
    end if;

    -- 3 · e os dois booleanos
    begin
      perform dem_lista(v_tok, '{"abertas":"talvez"}'::jsonb); v_erro := 'ACEITOU';
    exception when others then v_erro := sqlerrm; end;
    if v_erro not like 'FILTRO_INVALIDO%' then
      v_falhas := v_falhas || format(E'\n  3. abertas="talvez" respondeu "%s"', v_erro);
    end if;
    begin
      perform dem_lista(v_tok, '{"atrasadas":"1"}'::jsonb); v_erro := 'ACEITOU';
    exception when others then v_erro := sqlerrm; end;
    if v_erro not like 'FILTRO_INVALIDO%' then
      v_falhas := v_falhas || format(E'\n  3b. atrasadas="1" respondeu "%s"', v_erro);
    end if;

    -- 4 · e NENHUM caminho devolve 22P02, que era a forma do defeito
    for v_erro in
      select x from unnest(array['{"setor":"x"}','{"abertas":"talvez"}','{"atrasadas":"1"}',
                                 '{"setor":""}','{"abertas":""}','{"limite":"abc"}']) x
    loop
      declare v_st text; begin
        begin
          perform dem_lista(v_tok, v_erro::jsonb); v_st := '00000';
        exception when others then v_st := sqlstate; end;
        if v_st = '22P02' then
          v_falhas := v_falhas || format(E'\n  4. %s ainda devolve 22P02 cru', v_erro);
        end if;
      end;
    end loop;

    delete from demandas.membros where id = v_m;
  end if;

  -- =====================================================================
  -- 5 e 6 · a janela de `eu_responder`
  -- =====================================================================
  insert into equipes (nome, slug, ordem)
       values ('Conf80 ' || v_suf, 'conf80-' || v_suf, 9993) returning id into v_eq;
  insert into funcoes (equipe_id, nome, ordem, ativa, tipos)
       values (v_eq, 'POSTO 80', 1, true, array['domingo','follow']) returning id into v_fn;
  insert into pessoas (nome, telefone) values ('Conf80 ' || v_suf, '21900000800') returning id into v_p;
  insert into voluntarios (equipe_id, pessoa_id, nome, telefone, conferido, ativo)
       values (v_eq, v_p, 'Conf80 ' || v_suf, '21900000800', true, true)
    returning id, token into v_v, v_vtok;

  /* um culto BEM velho, que só a migração consegue criar (as telas recusam) */
  select id into v_velho from cultos where data = date '2019-01-06' and evento is null;
  if v_velho is null then
    insert into cultos (data) values (date '2019-01-06') returning id into v_velho;
  end if;
  insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
       values (v_velho, v_fn, v_v, 'pendente', false, false);

  -- 5 · responder num culto de 2019 é recusado, e nada é gravado na grade
  begin
    perform eu_responder(v_vtok, v_velho, 'confirmado', v_fn); v_erro := 'ACEITOU';
  exception when others then v_erro := sqlerrm; end;
  if v_erro not like 'Essa data esta fora%' then
    v_falhas := v_falhas || format(E'\n  5. responder num culto de 2019: "%s"', v_erro);
  end if;
  select count(*) into v_n from disponibilidade where voluntario_id = v_v;
  if v_n > 0 then
    v_falhas := v_falhas || format(E'\n  5b. e %s linha(s) foram gravadas na grade com data de 2019', v_n);
  end if;

  -- 6 · MAS responder num culto de verdade continua funcionando
  select id into v_c from cultos where evento is null and data >= current_date order by data limit 1;
  if v_c is null then
    insert into cultos (data) values (current_date + 3) returning id into v_c;
  end if;
  insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
       values (v_c, v_fn, v_v, 'pendente', false, false);
  begin
    perform eu_responder(v_vtok, v_c, 'confirmado', v_fn); v_erro := 'ok';
  exception when others then v_erro := sqlerrm; end;
  if v_erro <> 'ok' then
    v_falhas := v_falhas || format(E'\n  6. a janela ficou apertada demais: culto proximo recusado com "%s"', v_erro);
  end if;

  -- =====================================================================
  -- 7 · o GRANT por coluna de `pessoas`
  -- =====================================================================
  if has_column_privilege('authenticated', 'public.pessoas', 'auth_email', 'update') then
    v_falhas := v_falhas || E'\n  7. `authenticated` ainda escreve em pessoas.auth_email';
  end if;
  if not has_column_privilege('authenticated', 'public.pessoas', 'nome', 'update') then
    v_falhas := v_falhas || E'\n  7b. o revoke levou junto o que a liderança precisa (pessoas.nome)';
  end if;
  if not has_column_privilege('authenticated', 'public.pessoas', 'telefone', 'update') then
    v_falhas := v_falhas || E'\n  7c. idem para pessoas.telefone';
  end if;
  /* e quem escreve `auth_email` de direito continua escrevendo: as duas são
     `security definer` e não passam por GRANT de `authenticated` */
  select count(*) into v_n from pg_proc
   where pronamespace = 'public'::regnamespace and proname in ('candidatar')
     and prosecdef;
  if v_n <> 1 then
    v_falhas := v_falhas || E'\n  7d. `candidatar` deixou de ser definer: o revoke acima passa a quebrar o cadastro';
  end if;

  -- limpeza
  delete from escalacoes where voluntario_id = v_v;
  delete from disponibilidade where voluntario_id = v_v;
  delete from indisponibilidades where voluntario_id = v_v;
  delete from voluntarios where id = v_v;
  delete from pessoas where id = v_p;
  delete from funcoes where equipe_id = v_eq;
  delete from equipes where id = v_eq;
  delete from cultos where id = v_velho and data = date '2019-01-06';

  if v_falhas <> '' then
    raise exception E'CONFERENCIA DA 80 REPROVOU:%s', v_falhas;
  end if;
  raise notice 'CONFERENCIA DA 80: 7/7. Nenhum 22P02 cru, a janela vale nas tres portas, e auth_email saiu do GRANT.';
end $conferir$;
