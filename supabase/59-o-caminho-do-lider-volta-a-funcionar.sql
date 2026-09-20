/* =============================================================================
   59 · O CAMINHO DO LÍDER VOLTA A FUNCIONAR
   20/09/2026. Só de Escalas.

   -------------------------------------------------------------------------
   O QUE ESTÁ QUEBRADO EM PRODUÇÃO NESTE MOMENTO, MEDIDO E NÃO SUPOSTO

       has_column_privilege('authenticated','voluntarios','pessoa_id','insert')
         -> false
       policies de INSERT em `pessoas`
         -> 0
       criar_voluntario.prosecdef      -> false  (security INVOKER)
       decidir_candidatura.prosecdef   -> false  (security INVOKER)

   As duas funções do caminho do LÍDER rodam como quem chamou. Logo, caem na
   RLS e no GRANT por coluna. E as duas escrevem `voluntarios.pessoa_id`:

       32:298  insert into voluntarios (equipe_id, pessoa_id, ...)
       23:286  insert into voluntarios (..., pessoa_id) select ... from pessoas

   1 · APROVAR CANDIDATURA QUEBROU HOJE, E A CULPA É DA 52.

      A 52 trocou o INSERT de tabela por INSERT POR COLUNA em `voluntarios`,
      com LISTA DE INCLUSÃO escrita à mão:

          nome, telefone, ativo, limite_mes, conferido, email, sexo, equipe_id

      `pessoa_id` ficou de fora. Antes da 52, `authenticated` tinha INSERT de
      TABELA (o padrão do Supabase), que cobre toda coluna — então aprovar
      candidatura funcionava. Depois da 52, não funciona mais: a liderança
      toca "Aprovar" em /painel/candidaturas e leva `permission denied`.

      Pior: a justificativa escrita na própria 52 diz o contrário do que o
      catálogo diz. Ela afirma (52:610-614) que "a criação passa por
      `criar_voluntario`, que é SECURITY DEFINER e roda como dona da tabela,
      fora deste GRANT". `criar_voluntario` é INVOKER desde a 32, e a 32 diz
      isso com todas as letras na linha 264: "SECURITY INVOKER: é ação de
      líder, então roda como ele e cai na RLS". Eu li a nota e não conferi o
      catálogo. A nota estava errada e a correção foi construída em cima dela.

      A lição é a mesma que este repositório já pagou duas vezes com índice
      único: mexer em GRANT é mexer em todo caminho que escreve naquela
      tabela, e quem responde quem escreve é o CATÁLOGO, não o comentário.

   2 · CADASTRAR VOLUNTÁRIO JÁ ESTAVA QUEBRADO ANTES DE HOJE.

      `criar_voluntario` também faz `insert into pessoas` (32:293). A 22
      ligou RLS em `pessoas` e criou duas políticas: `pessoas_ler` (select) e
      `pessoas_editar` (update, e só para `lidera_tudo()`). INSERT nunca teve
      política. Em RLS, o que não tem política é negado.

      Ou seja: o botão "Cadastrar voluntário" do /time morre na primeira
      linha que escreve, e morre desde a 32. O autocadastro público continuou
      funcionando o tempo todo porque `candidatar` e `inscrever` são
      SECURITY DEFINER e passam por cima da RLS. Foi isso que escondeu o
      defeito: o funil de entrada nunca dependeu do caminho do líder.

   -------------------------------------------------------------------------
   O QUE ESTE ARQUIVO FAZ

   a) O INSERT de `voluntarios` passa a se ler do CATÁLOGO, com lista de
      EXCLUSÃO, que é o idioma que a própria 52 escolheu para o SELECT e não
      aplicou aqui. Coluna nova passa a entrar sozinha. `pin_hash`, `token` e
      `id` continuam fora, por escrito.

      O UPDATE continua sendo lista de inclusão curta, e isso é de propósito:
      lá a decisão é coluna a coluna (mudar `equipe_id` moveria alguém de
      ministério por baixo do pano), e a 52 acertou.

   b) `criar_voluntario` vira SECURITY DEFINER, com guarda explícita.

      Ela precisa criar uma linha em `pessoas` e ler o id dela de volta. Como
      INVOKER isso é impossível sem abrir `pessoas` para todo líder, e a razão
      só apareceu medindo:

          insert into pessoas (nome, telefone) values (...)
            -> PASSA
          insert into pessoas (nome, telefone) values (...) returning id
            -> ERROR 42501: new row violates row-level security policy

      Não é o `on conflict`, como eu cheguei a escrever antes de testar: é o
      RETURNING. `INSERT ... RETURNING` também aplica a política de SELECT, e
      `pessoas_ler` só enxerga alguém que já tem vínculo ou candidatura numa
      equipe que você lidera. A pessoa que acabou de nascer não tem nenhum dos
      dois, então ela é invisível para quem a criou, e a função morre.

      Dá para alargar `pessoas_ler` até `sou_lider()`. Não é o que este
      arquivo faz: isso entregaria a agenda inteira da igreja a qualquer
      organizador de área, para resolver o cadastro de uma pessoa. O caminho
      certo é o que o resto deste repositório já usa em toda porta
      (`criar_evento`, `dem_*`, `candidatar`): função SECURITY DEFINER com
      guarda explícita na primeira linha. Aqui a guarda é
      `lidera_equipe(p_equipe)`, que é exatamente o que a RLS garantia antes.

      `decidir_candidatura` continua INVOKER: ela não escreve em `pessoas`,
      só em `voluntarios`, e para ela o item (a) basta.

   -------------------------------------------------------------------------
   UM ACHADO QUE EU QUASE "CONSERTEI", E QUE ERA FALSO

   A auditoria de hoje levantou `equipe_entrar` como buraco vivo: nasceu na
   03 concedida a `anon, authenticated`, a 07 revogou só de `anon, public`, e
   a 08:38 afirma por escrito que ela "continua REVOGADA da 07", o que é
   falso para `authenticated`. Ela é SECURITY DEFINER, não chama
   `lidera_equipe` em lugar nenhum, e devolveria o token pessoal de qualquer
   voluntário de qualquer ministério contra os 4 últimos dígitos do telefone.

   O raciocínio está certo e a conclusão está errada: a migração 31, na linha
   88, faz `drop function if exists equipe_entrar(text, uuid, text)`. Num
   banco aplicado em ordem ela não existe de 31 em diante. Conferido nos dois
   lados: em produção `pg_proc` devolve 0, e no banco reconstruído do
   repositório também.

   Fica escrito aqui porque a próxima auditoria vai encontrar o mesmo rastro
   de GRANT e chegar à mesma conclusão. O que fecha a questão não é a
   sequência de `grant`/`revoke`: é o `drop` da 31.

   ORDEM:  ... 57 → 58 → 59
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(59);
  end if;
end $tranca$;


-- =========================================================================
-- a) o INSERT de `voluntarios` se lê do catálogo
-- =========================================================================

do $grants$
declare
  v_cols text;
  /* fora do INSERT, por escrito e com motivo:
       pin_hash — é credencial, e a 52 já a tirou de tudo;
       token    — é a credencial do link pessoal; ela nasce do default, e
                  líder nenhum precisa escolher a de outra pessoa;
       id       — nasce do default. */
  v_fora constant text[] := array['pin_hash','token','id'];
begin
  if to_regclass('public.voluntarios') is null then
    raise notice 'PULEI: esta base nao tem public.voluntarios.';
    return;
  end if;

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'voluntarios'
     and column_name <> all (v_fora);

  execute 'revoke insert on public.voluntarios from authenticated';
  execute format('grant insert (%s) on public.voluntarios to authenticated', v_cols);

  raise notice 'OK — INSERT de voluntarios relido do catalogo: %', v_cols;
end $grants$;


-- =========================================================================
-- b) `criar_voluntario` roda como dona da tabela, com guarda na porta
--
-- Corpo da 32, palavra por palavra, com DUAS mudanças: `security definer` no
-- lugar de `security invoker`, e a guarda `lidera_equipe` na primeira linha.
-- A lição da 54 vale aqui também: quando a correção é pequena, o arquivo
-- copia o resto em vez de reescrever.
-- =========================================================================

create or replace function criar_voluntario(
  p_equipe uuid, p_nome text, p_tel text, p_limite int, p_funcoes jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_nome text; v_tel text; v_pessoa uuid; v_id uuid;
begin
  /* 59: a guarda que a RLS fazia antes. Como DEFINER esta função enxerga o
     banco inteiro, então quem chama precisa provar aqui, e não depois, que
     lidera a equipe onde está escrevendo. */
  if not lidera_equipe(p_equipe) then
    return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO');
  end if;

  v_nome := btrim(coalesce(p_nome, ''));
  v_tel  := tel_norm(coalesce(p_tel, ''));

  if length(v_nome) < 3 or position(' ' in v_nome) = 0 then
    return jsonb_build_object('ok', false, 'erro', 'NOME_INCOMPLETO');
  end if;
  if v_tel <> '' and (length(v_tel) < 10 or length(v_tel) > 13) then
    return jsonb_build_object('ok', false, 'erro', 'TELEFONE_INVALIDO');
  end if;
  if v_tel <> '' and exists (
    select 1 from voluntarios v where v.equipe_id = p_equipe and tel_norm(v.telefone) = v_tel
  ) then
    return jsonb_build_object('ok', false, 'erro', 'JA_CADASTRADO');
  end if;

  /* a identidade primeiro, como em `inscrever` e `candidatar`. Sem telefone
     não dá para casar pessoa: o vínculo nasce sem identidade e o líder
     completa depois. É o único caso em que isso é aceitável, porque foi um
     líder que digitou e ele sabe quem é.

     59: a função passou a ser DEFINER (ver o cabeçalho), então esta escrita
     não depende mais de política nenhuma em `pessoas`. Continua sem
     `on conflict` porque o `do update` da 32 tocava `atualizado_em` de uma
     linha que não é desta pessoa, e o `unique_violation` cobre a corrida. */
  if v_tel <> '' then
    select p.id into v_pessoa from pessoas p where p.telefone = v_tel;
    if v_pessoa is null then
      begin
        insert into pessoas (nome, telefone) values (v_nome, v_tel)
          returning id into v_pessoa;
      exception when unique_violation then
        select p.id into v_pessoa from pessoas p where p.telefone = v_tel;
      end;
    end if;
  end if;

  insert into voluntarios (equipe_id, pessoa_id, nome, telefone, limite_mes, conferido)
       values (p_equipe, v_pessoa, v_nome, nullif(v_tel,''), p_limite, true)
    returning id into v_id;

  /* nível dado por líder nasce conferido: foi ele que olhou. */
  insert into habilidades (voluntario_id, funcao_id, nivel, confirmado)
  select v_id, f.id, x.value::nivel_habilidade, true
    from jsonb_each_text(coalesce(p_funcoes, '{}'::jsonb)) x
    join funcoes f on f.equipe_id = p_equipe and f.nome = x.key
   where x.value in ('titular', 'reserva', 'treino')
      on conflict (voluntario_id, funcao_id) do nothing;

  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;


-- =========================================================================
-- sondas e registro
-- =========================================================================

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (59, '59 · criar_voluntario roda como definer com guarda', 'criar_voluntario', 'lidera_equipe(p_equipe)')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

do $reg$ begin
  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo) values (59, '59-o-caminho-do-lider-volta-a-funcionar.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;


-- =========================================================================
-- A CONFERÊNCIA
--
-- Não confere GRANT lendo catálogo: confere CHAMANDO as duas funções como um
-- líder de área de verdade, que é o caminho que quebrou. Catálogo já disse
-- que estava tudo certo uma vez, na 52, e estava errado.
-- =========================================================================

do $conf$
declare
  v_eq uuid; v_p uuid; v_fn uuid; v_tel text;
  v_r jsonb; v_vol uuid; v_cand uuid; v_pessoa_cand uuid;
  ok int := 0; falhou int := 0; msg text := '';
begin
  if to_regclass('public.voluntarios') is null then
    raise notice 'PULEI a conferencia da 59: base sem public.voluntarios.'; return;
  end if;

  v_tel := '21' || lpad((floor(random()*900000000)+100000000)::text, 9, '0');

  insert into equipes (slug, nome) values ('conf59','Conferencia 59')
    on conflict (slug) do nothing;
  select id into v_eq from equipes where slug = 'conf59';

  insert into funcoes (equipe_id, nome, simultanea, ordem, ativa, tipos)
       values (v_eq, 'POSTO CONF 59', true, 991, true, array['domingo'])
    on conflict do nothing;
  select id into v_fn from funcoes where equipe_id = v_eq and nome = 'POSTO CONF 59';

  insert into pessoas (nome, telefone, auth_email)
       values ('Lider Conf 59', '11900000059', 'conf59@teste.local')
    on conflict (telefone) do update set auth_email = 'conf59@teste.local'
    returning id into v_p;
  if v_p is null then select id into v_p from pessoas where telefone = '11900000059'; end if;
  insert into papeis (pessoa_id, equipe_id, papel) values (v_p, v_eq, 'lider')
    on conflict do nothing;

  /* ---- 1. o líder cadastra um voluntário, que é o botão do /time ------- */
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf59@teste.local","role":"authenticated"}', true);
    v_r := criar_voluntario(v_eq, 'Fulano Conf Cinquentaenove', v_tel, 2,
                            jsonb_build_object('POSTO CONF 59', 'titular'));
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) then
      ok := ok + 1;
      v_vol := (v_r->>'id')::uuid;
    else
      falhou := falhou + 1;
      msg := msg || E'\n  x criar_voluntario recusou: ' || coalesce(v_r->>'erro', v_r::text);
    end if;
  exception when others then
    reset role; falhou := falhou + 1;
    msg := msg || E'\n  x criar_voluntario EXPLODIU: ' || sqlerrm || ' (' || sqlstate || ')';
  end;

  /* e a identidade tem que ter sido ligada, senão o vínculo nasce órfão */
  if v_vol is not null then
    if (select pessoa_id from voluntarios where id = v_vol) is null then
      falhou := falhou + 1;
      msg := msg || E'\n  x o voluntario nasceu SEM pessoa_id (a identidade nao ligou)';
    else ok := ok + 1; end if;
    if not exists (select 1 from habilidades where voluntario_id = v_vol and funcao_id = v_fn) then
      falhou := falhou + 1;
      msg := msg || E'\n  x a habilidade nao entrou junto';
    else ok := ok + 1; end if;
  end if;

  /* ---- 2. o telefone que JÁ existe (o caso comum) ---------------------- */
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf59@teste.local","role":"authenticated"}', true);
    v_r := criar_voluntario(v_eq, 'Outro Nome Cinquentaenove', '11900000059', 2, '{}'::jsonb);
    reset role;
    /* a pessoa 11900000059 já existe: tem que entrar assim mesmo, reusando
       a identidade, e não morrer em permission denied no `on conflict` */
    if coalesce((v_r->>'ok')::boolean, false) then ok := ok + 1;
    else
      falhou := falhou + 1;
      msg := msg || E'\n  x telefone que ja existe foi recusado: ' || coalesce(v_r->>'erro', v_r::text);
    end if;
  exception when others then
    reset role; falhou := falhou + 1;
    msg := msg || E'\n  x o caso do telefone existente EXPLODIU: ' || sqlerrm;
  end;

  /* ---- 3. aprovar candidatura de gente nova, que é o /painel ----------- */
  insert into pessoas (nome, telefone) values ('Candidato Cinquentaenove',
    '21' || lpad((floor(random()*900000000)+100000000)::text, 9, '0'))
    returning id into v_pessoa_cand;
  insert into candidaturas (pessoa_id, equipe_id) values (v_pessoa_cand, v_eq)
    returning id into v_cand;
  insert into candidatura_funcoes (candidatura_id, funcao_id) values (v_cand, v_fn)
    on conflict do nothing;

  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf59@teste.local","role":"authenticated"}', true);
    v_r := decidir_candidatura(v_cand, 'aprovada', 'conferencia da 59');
    reset role;
    if coalesce((v_r->>'ok')::boolean, false)
       and exists (select 1 from voluntarios where pessoa_id = v_pessoa_cand and equipe_id = v_eq) then
      ok := ok + 1;
    else
      falhou := falhou + 1;
      msg := msg || E'\n  x aprovar candidatura nao criou o vinculo: ' || coalesce(v_r::text, 'nulo');
    end if;
  exception when others then
    reset role; falhou := falhou + 1;
    msg := msg || E'\n  x decidir_candidatura EXPLODIU: ' || sqlerrm || ' (' || sqlstate || ')';
  end;

  /* ---- 4. a guarda da porta: quem NAO lidera nao escreve ---------------
     Função DEFINER sem teste de recusa é porta aberta com placa de fechada.
     Este caso é o preço de ter trocado INVOKER por DEFINER. */
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"ninguem59@exemplo.invalido","role":"authenticated"}', true);
    v_r := criar_voluntario(v_eq, 'Intruso Cinquentaenove', '21999990059', 2, '{}'::jsonb);
    reset role;
    if coalesce(v_r->>'erro','') = 'SEM_PERMISSAO' then ok := ok + 1;
    else
      falhou := falhou + 1;
      msg := msg || E'\n  x um estranho cadastrou voluntario na equipe: ' || v_r::text;
    end if;
  exception when others then
    reset role; falhou := falhou + 1;
    msg := msg || E'\n  x a guarda EXPLODIU em vez de recusar: ' || sqlerrm;
  end;
  if exists (select 1 from voluntarios where telefone = '21999990059') then
    falhou := falhou + 1;
    msg := msg || E'\n  x o estranho recusado AINDA assim gravou a linha';
  else ok := ok + 1; end if;

  /* ---- 5. e `pin_hash` continua sem INSERT, que era a regra da 52 ------ */
  if has_column_privilege('authenticated','public.voluntarios','pin_hash','insert') then
    falhou := falhou + 1;
    msg := msg || E'\n  x o INSERT novo alargou demais: pin_hash entrou';
  else ok := ok + 1; end if;

  /* ---- limpeza: tudo que este bloco criou, por id ---------------------- */
  delete from habilidades where voluntario_id in
    (select id from voluntarios where equipe_id = v_eq);
  delete from candidatura_funcoes where candidatura_id = v_cand;
  delete from historico_candidatura where candidatura_id = v_cand;
  delete from candidaturas where id = v_cand;
  delete from voluntarios where equipe_id = v_eq;
  delete from funcoes where equipe_id = v_eq;
  delete from papeis where pessoa_id = v_p;
  delete from voluntarios where telefone = '21999990059';
  delete from pessoas where id in (v_p, v_pessoa_cand) or telefone in (v_tel, '21999990059');
  delete from equipes where id = v_eq;

  if falhou > 0 then
    raise exception 'A CONFERENCIA DA 59 REPROVOU: % de % casos', falhou, ok + falhou
      using detail = msg, errcode = 'raise_exception';
  end if;
  raise notice '59 · conferencia: %/% casos. O lider cadastra voluntario, reusa telefone existente, aprova candidatura, e pin_hash continua fora do INSERT.', ok, ok;
end $conf$;
