-- =========================================================================
-- 72 · O TESTE DE IDENTIDADE PASSAVA COM O BANCO INTEIRO ABERTO
--
-- 21/09/2026. Sétima rodada de auditoria adversarial. `testar_identidade()`
-- existe desde a migração 33 com uma promessa escrita no próprio comentário:
-- "prova que a migração 33 não mudou o dono de nada". Ela não provava.
--
-- O QUE FOI MEDIDO, num banco nascido do repositório:
--
--   1. Derrubando as 37 políticas de RLS do schema dentro de uma transação,
--      `testar_identidade()` continuou respondendo 12 DE 12. Os doze casos
--      nunca executam `set local role`: rodam com o privilégio de quem
--      chamou (no `banco-do-zero.sh`, o dono do banco), e RLS não se aplica
--      ao dono. Ela não exercitava uma única política.
--
--   2. Trocando o corpo de `meu_link` por um que devolve TODOS os vínculos
--      ativos do banco — os 12 tokens pessoais, que são credencial — a
--      função continuou 12 de 12. O caso olhava só `ok`, e `ok` é `true` em
--      todo caminho de sucesso, inclusive no que vaza.
--
--   3. O caso do `quem_sou` tinha o mesmo formato: `-> 'ok' = 'true'`.
--
--   4. Os dois blocos que dependem de "existe voluntário com token" e
--      "existe pessoa com auth_email" simplesmente não emitem linha quando
--      não existe. `banco-do-zero.sh` compara `total = passou`, então um
--      banco onde oito casos somem imprime "✓ 4/4" e passa.
--
-- O que NÃO foi encontrado: os casos 1 a 5 (a comparação `lideres` × `papeis`
-- da migração 33) estão certos para o que prometem. Mas vale dizer o que eles
-- não provam, porque o comentário da função sugere mais: eles comparam duas
-- tabelas que o atacante escreve, então um admin implantado nas duas passa
-- nos cinco. Medido: inserindo uma linha em `papeis` e outra em `lideres`,
-- `testar_identidade()` deu 12 de 12 e `testar_permissoes()` deu 64 de 64.
-- Quem impede o implante é a política de escrita, e é por isso que esta
-- migração acrescenta casos de ESCRITA em vez de mais comparações de
-- contagem. O comentário da função também foi corrigido para dizer isso.
--
-- É o mesmo defeito que a 70 corrigiu em `testar_permissoes()`, na outra
-- função de teste — e eu não tinha olhado esta.
--
-- O QUE MUDA AQUI
--
--   · a função passa a criar o PRÓPRIO CENÁRIO (duas equipes, duas pessoas,
--     dois voluntários com token, um papel de organizador de área) e a
--     apagá-lo no fim, para que nenhum caso dependa do que o banco tem;
--   · os dois casos que olhavam `ok` passam a cobrar CONTEÚDO: a ficha é
--     desta pessoa, os links são os vínculos dela, nenhum token de terceiro
--     entrou;
--   · oito casos novos trocam de papel de verdade (`set local role` +
--     JWT no GUC) e cobram a superfície que é desta função: quem lê e quem
--     escreve em `papeis` e em `lideres`, incluindo o ataque da 69 (update
--     com constante e sem `where`) nas duas;
--   · o último caso confere a PRÓPRIA CONTAGEM de casos, para que nenhum
--     deles possa sumir em silêncio.
--
-- Medido depois: 12 → 27 casos; com a RLS desligada no schema inteiro, a
-- versão antiga respondia 12 de 12 e a nova reprova 5 casos.
-- =========================================================================

/* A TRANCA. Sem ela, colar este arquivo num banco que já passou da 72
   reinstalaria uma versão antiga de `testar_identidade` por cima — e o
   sintoma seria o teste de identidade ficar verde de novo, que é o pior
   sintoma possível para este arquivo em particular. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(72);
  end if;
end $tranca$;

CREATE OR REPLACE FUNCTION public.testar_identidade()
 RETURNS TABLE(caso text, esperado text, obtido text, passou boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare n int; m int; v_eq uuid;
        v_casos int := 0;
        v_vol uuid; v_tok text; v_pessoa uuid; v_email text; v_jwt text;
        v_outro_tok text; v_outra_eq uuid; v_j jsonb; v_erro text;
        v_suf text; v_alheio uuid; v_nome text;
begin
  /* ========================================================= 72, 21/09 ===
     O CENÁRIO, PORQUE SEM ELE OS CASOS DE IDENTIDADE SÃO VÁCUO.

     Os casos antigos liam o primeiro voluntário que aparecesse. Num banco
     sem voluntário com token, o bloco inteiro não emitia linha e o
     `banco-do-zero.sh` dizia "✓ testar_identidade(): 2/2" — verde por não ter
     testado. Mesma correção que a 70 fez em `testar_permissoes`.

     São DUAS pessoas de propósito: uma que vai pedir o próprio link e outra
     cujo token NÃO pode aparecer na resposta. Vazamento de credencial só
     aparece quando existe credencial de terceiro para vazar. */
  v_suf := substr(md5(random()::text || clock_timestamp()::text), 1, 8);

  insert into equipes (nome, slug, ordem)
       values ('Ident ' || v_suf, 'ident-' || v_suf, 9991) returning id into v_eq;
  insert into equipes (nome, slug, ordem)
       values ('Outra ' || v_suf, 'outra-' || v_suf, 9992) returning id into v_outra_eq;

  insert into pessoas (nome, auth_email)
       values ('Ident ' || v_suf, 'ident-' || v_suf || '@exemplo.invalido')
    returning id, auth_email into v_pessoa, v_email;
  insert into voluntarios (equipe_id, pessoa_id, nome, telefone, conferido, ativo)
       values (v_eq, v_pessoa, 'Ident ' || v_suf,
               '21' || lpad((floor(random()*900000000)+100000000)::text, 9, '0'), true, true)
    returning id, token into v_vol, v_tok;

  insert into pessoas (nome, auth_email)
       values ('Terceiro ' || v_suf, 'terceiro-' || v_suf || '@exemplo.invalido')
    returning id into v_alheio;
  insert into voluntarios (equipe_id, pessoa_id, nome, telefone, conferido, ativo)
       values (v_outra_eq, v_alheio, 'Terceiro ' || v_suf,
               '21' || lpad((floor(random()*900000000)+100000000)::text, 9, '0'), true, true)
    returning token into v_outro_tok;

  /* Quem organiza a equipe de teste: é o papel que os casos de escrita usam.
     A linha em `lideres` vai junto de propósito — os casos 1 a 5 comparam as
     duas tabelas, e um cenário que só escreve numa delas reprovaria um caso
     que está certo. Foi o que aconteceu na primeira versão desta migração:
     `quantidade de lideres de equipe bate` ficou 1 contra 2. */
  insert into papeis (pessoa_id, papel, equipe_id) values (v_pessoa, 'lider', v_eq);
  insert into lideres (email, equipe_id, pessoa_id) values (v_email, v_eq, v_pessoa);
  v_jwt := json_build_object('email', v_email, 'role', 'authenticated')::text;

  return query select 'cenario: existe token de TERCEIRO para poder vazar'::text,
    'existe'::text, case when v_outro_tok is null then 'NAO EXISTE' else 'existe' end,
    v_outro_tok is not null and v_outro_tok <> v_tok;
  v_casos := v_casos + 1;

  -- 1. todo organizador virou pessoa
  select count(*) into n from lideres where pessoa_id is null and email <> '';
  return query select 'organizador sem identidade'::text, '0'::text, n::text, n = 0;
  v_casos := v_casos + 1;

  /* 2. TODO ORGANIZADOR VIROU PAPEL, PESSOA A PESSOA (60).
     Estava assim:
         n := count(lideres com pessoa_id);   m := count(*) from papeis;
         passou := m >= n
     `papeis` tem admin e líder juntos, então `>=` era quase sempre verdade:
     dá para apagar metade dos papéis e o caso continua passando. O que
     importa é que NENHUM organizador tenha ficado sem papel, e isso é uma
     conta por pessoa, não um total contra um total. */
  select count(*) into n from lideres l
   where l.pessoa_id is not null
     and not exists (select 1 from papeis x where x.pessoa_id = l.pessoa_id);
  return query select 'organizador com identidade e sem papel'::text, '0'::text, n::text, n = 0;
  v_casos := v_casos + 1;

  -- 3. admin continua admin, líder continua líder
  select count(*) into n from lideres where equipe_id is null and pessoa_id is not null;
  select count(*) into m from papeis where papel = 'admin';
  return query select 'quantidade de admins bate'::text, n::text, m::text, n = m;
  v_casos := v_casos + 1;

  select count(*) into n from lideres where equipe_id is not null and pessoa_id is not null;
  select count(*) into m from papeis where papel = 'lider';
  return query select 'quantidade de lideres de equipe bate'::text, n::text, m::text, n = m;
  v_casos := v_casos + 1;

  -- 4. A PROVA PRINCIPAL: para cada equipe e cada organizador, o acesso pelo
  --    caminho novo é o mesmo do caminho antigo. Zero divergências.
  select count(*) into n from (
    select l.email, e.id as eq,
           (l.equipe_id is null or l.equipe_id = e.id) as antigo,
           exists (select 1 from papeis x join pessoas p on p.id = x.pessoa_id
                    where lower(p.auth_email) = lower(l.email)
                      and (x.papel = 'admin' or (x.papel = 'lider' and x.equipe_id = e.id))) as novo
      from lideres l cross join equipes e
     where l.email <> ''
  ) d where antigo is distinct from novo;
  return query select 'acesso novo diverge do antigo'::text, '0'::text, n::text, n = 0;
  v_casos := v_casos + 1;

  /* 5. a constraint de escopo funciona.

     Os dois blocos abaixo tentam gravar uma linha inválida de propósito. Se a
     constraint estiver certa, ela recusa e nada é gravado. Se estiver errada,
     a linha entraria, e um teste que suja o banco que ele deveria proteger é
     pior que teste nenhum. Por isso, quando o insert PASSA, o bloco levanta
     uma exceção na sequência para desfazer o próprio estrago: o resultado do
     teste vem do código do erro, não de ter chegado ao fim. */
  begin
    insert into papeis (pessoa_id, papel, equipe_id)
    select id, 'admin', (select id from equipes limit 1) from pessoas limit 1;
    raise exception 'desfazendo' using errcode = 'triggered_action_exception';
  exception
    when check_violation then
      return query select 'admin com equipe e recusado'::text, 'recusado'::text, 'recusado'::text, true;
    when triggered_action_exception then
      return query select 'admin com equipe e recusado'::text, 'recusado'::text, 'ACEITOU'::text, false;
  end;
  v_casos := v_casos + 1;

  begin
    insert into papeis (pessoa_id, papel, equipe_id) select id, 'lider', null from pessoas limit 1;
    raise exception 'desfazendo' using errcode = 'triggered_action_exception';
  exception
    when check_violation then
      return query select 'lider sem equipe e recusado'::text, 'recusado'::text, 'recusado'::text, true;
    when triggered_action_exception then
      return query select 'lider sem equipe e recusado'::text, 'recusado'::text, 'ACEITOU'::text, false;
  end;
  v_casos := v_casos + 1;

  -- 6. quem_sou responde as duas portas
  /* ========================================================= 72, 21/09 ===
     ISTO AQUI OLHAVA SÓ O `ok`, E `ok` SEMPRE FOI `true`.

     `quem_sou` devolve nome, e-mail, final do telefone, se a pessoa é admin,
     que ministérios ela organiza e em que postos ela serve. O caso antigo
     aceitava QUALQUER conteúdo desde que viesse com `ok: true` — uma versão
     de `quem_sou` que devolvesse a ficha de OUTRA pessoa passava.

     Agora se cobra o conteúdo: a ficha é de quem tem o token, o nome é o
     nome dela, e o `serve` só tem ministérios dela. */
  if v_tok is not null then
    v_j := quem_sou(v_tok);
    return query select 'quem_sou pelo token do voluntario'::text, 'true'::text,
      coalesce(v_j ->> 'ok', '?'), coalesce(v_j ->> 'ok', '?') = 'true';
    v_casos := v_casos + 1;

    select p.nome into v_nome from pessoas p where p.id = v_pessoa;
    return query select 'quem_sou devolve a ficha DESTA pessoa'::text,
      coalesce(v_nome, '(sem pessoa)'),
      coalesce(v_j #>> '{pessoa,nome}', '(nada)'),
      coalesce(v_j #>> '{pessoa,nome}', '') = coalesce(v_nome, '');
    v_casos := v_casos + 1;

    /* e nenhum ministério de outra pessoa entrou na lista dela */
    select count(*) into n
      from jsonb_array_elements(coalesce(v_j -> 'serve', '[]'::jsonb)) s
     where not exists (select 1 from voluntarios v2 join equipes e2 on e2.id = v2.equipe_id
                        where v2.pessoa_id = v_pessoa and v2.ativo and e2.slug = s ->> 'slug');
    return query select 'e so os ministerios DELA aparecem em quem_sou'::text,
      '0 de fora'::text, n::text || ' de fora', n = 0;
    v_casos := v_casos + 1;
  end if;

  return query select 'quem_sou com token invalido'::text, 'LINK_INVALIDO'::text,
    coalesce(quem_sou('nao-existe-esse-token') ->> 'erro', '?'),
    coalesce(quem_sou('nao-existe-esse-token') ->> 'erro', '?') = 'LINK_INVALIDO';
  v_casos := v_casos + 1;

  -- 7. meu_link exige credencial e nao vaza de terceiro
  perform set_config('request.jwt.claims', '', true);
  return query select 'meu_link sem login e recusado'::text, 'SEM_CREDENCIAL'::text,
    coalesce(meu_link() ->> 'erro', '?'),
    coalesce(meu_link() ->> 'erro', '?') = 'SEM_CREDENCIAL';
  v_casos := v_casos + 1;

  /* ========================================================= 72, 21/09 ===
     O PIOR DOS DOIS. `meu_link` devolve TOKEN — o link pessoal, que é
     credencial. Este caso olhava só `ok`, e `ok` é `true` em todo caminho de
     sucesso, inclusive no que entrega os links de todo mundo.

     Medido em 21/09, num banco nascido do repositório: trocando o corpo de
     `meu_link` por um `where v.ativo` sem `pessoa_id`, ele passou a devolver
     os 12 tokens do banco e `testar_identidade()` continuou 12 de 12.

     Agora se cobra, em três frentes: quantos links vieram, se os slugs são
     os vínculos ativos desta pessoa, e se ALGUM token de terceiro entrou. */
  if v_pessoa is not null then
    perform set_config('request.jwt.claims',
      json_build_object('email', v_email)::text, true);
    v_j := meu_link();
    perform set_config('request.jwt.claims', '', true);

    return query select 'meu_link devolve o proprio vinculo'::text, 'true'::text,
      coalesce(v_j ->> 'ok', '?'), coalesce(v_j ->> 'ok', '?') = 'true';
    v_casos := v_casos + 1;

    select count(*) into m from voluntarios v where v.pessoa_id = v_pessoa and v.ativo;
    select jsonb_array_length(coalesce(v_j -> 'links', '[]'::jsonb)) into n;
    return query select 'meu_link devolve EXATAMENTE os vinculos ativos dela'::text,
      m::text || ' link(s)', n::text || ' link(s)', n = m and m > 0;
    v_casos := v_casos + 1;

    /* O CASO QUE PEGA O VAZAMENTO: cada token que voltou tem que ser de um
       vínculo DESTA pessoa. Um token de terceiro na lista é credencial de
       outra pessoa na mão de quem pediu o próprio link. */
    select count(*) into n
      from jsonb_array_elements(coalesce(v_j -> 'links', '[]'::jsonb)) k
     where not exists (select 1 from voluntarios v2
                        where v2.token = k ->> 'token'
                          and v2.pessoa_id = v_pessoa and v2.ativo);
    return query select 'e NENHUM token de terceiro veio junto'::text,
      '0 de fora'::text, n::text || ' de fora', n = 0;
    v_casos := v_casos + 1;
  end if;

  -- 8. papeis nao e legivel pelo anonimo
  return query select 'papeis fechada para anon'::text, 'sem grant'::text,
    case when has_table_privilege('anon', 'papeis', 'select') then 'TEM GRANT' else 'sem grant' end,
    not has_table_privilege('anon', 'papeis', 'select');
  v_casos := v_casos + 1;

  -- =====================================================================
  -- 72 · OS CASOS QUE EXERCITAM RLS DE VERDADE
  --
  -- O caso acima olha GRANT, que é privilégio de tabela. Nenhum dos doze
  -- casos anteriores executava `set local role`, e por isso nenhum deles
  -- passava por uma política de RLS: medido em 21/09 derrubando as 37
  -- políticas do schema dentro de uma transação — a função continuou
  -- respondendo 12 de 12.
  --
  -- Os casos abaixo trocam de papel e falam como o PostgREST fala: `set
  -- local role authenticated` mais o JWT no GUC. É o que a 70 fez em
  -- `testar_permissoes`, aplicado agora à superfície que é desta função:
  -- quem lê e quem escreve em `papeis` e `lideres`, que são as duas tabelas
  -- que decidem quem manda na igreja.
  -- =====================================================================

  /* I1 · quem organiza UMA área não lê a tabela de papéis (papeis_ler é
     `lidera_tudo()`). Se lesse, ele veria quem é admin e teria a lista de
     alvos — e, pela 33, `papeis` é a tabela que responde "quem manda". */
  set local role authenticated; perform set_config('request.jwt.claims', v_jwt, true);
  select count(*) into n from papeis;
  reset role;
  return query select 'organizador de area NAO le a tabela de papeis'::text,
    '0 linha(s)'::text, n::text || ' linha(s)', n = 0;
  v_casos := v_casos + 1;

  /* I2 · nem escreve em `lideres`, que é a OUTRA tabela de dono.
     `testar_permissoes` C1 já cobre `papeis`; `lideres` não era coberta por
     ninguém, e `eq_lideres_mexer` é `lidera_tudo()` nas duas pontas. */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', v_jwt, true);
    insert into lideres (email, equipe_id, pessoa_id)
         values ('golpe-' || v_suf || '@exemplo.invalido', null, v_pessoa);
    reset role; v_erro := 'ACEITOU';
  exception when insufficient_privilege or check_violation then
    reset role; v_erro := 'recusado';
  end;
  return query select 'organizador de area NAO vira organizador geral em lideres'::text,
    'recusado'::text, v_erro, v_erro = 'recusado';
  v_casos := v_casos + 1;

  /* I3 · O ATAQUE DA 69 APLICADO A `papeis`: `update` com constante e sem
     `where` não cita coluna nenhuma, então a política de SELECT não entra na
     conta e sobra só o USING do UPDATE. `papeis` não tem política de UPDATE,
     o que é deny — mas isso nunca tinha sido medido, e "não tem política" é
     exatamente o tipo de coisa que alguém adiciona sem perceber. */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', v_jwt, true);
    /* `equipe_id = null` JUNTO, e isso importa: `papel = 'admin'` sozinho
       esbarra na constraint `papel_com_escopo_certo` (admin não tem equipe),
       e aí quem recusa é a constraint, não a política. Um caso que passa por
       causa da constraint não mede a RLS — foi exatamente o que aconteceu na
       primeira versão deste caso, e a conferência com a RLS desligada é que
       mostrou, levantando `check_violation` no meio da função. */
    update papeis set papel = 'admin', equipe_id = null;
    get diagnostics n = row_count;
    reset role;
    v_erro := case when n = 0 then 'nenhuma linha' else 'MUDOU ' || n || ' linha(s)' end;
  exception when insufficient_privilege or check_violation then
    reset role; v_erro := 'nenhuma linha';
  end;
  return query select 'update em papeis sem where nao promove ninguem'::text,
    'nenhuma linha'::text, v_erro, v_erro = 'nenhuma linha';
  v_casos := v_casos + 1;

  /* I4 · e o mesmo ataque em `lideres`, que tem política de UPDATE
     (`eq_lideres_mexer` é ALL) e portanto um USING de verdade para passar */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', v_jwt, true);
    update lideres set equipe_id = null;
    get diagnostics n = row_count;
    reset role;
    v_erro := case when n = 0 then 'nenhuma linha' else 'MUDOU ' || n || ' linha(s)' end;
  exception when insufficient_privilege then reset role; v_erro := 'nenhuma linha';
  end;
  return query select 'update em lideres sem where nao promove ninguem'::text,
    'nenhuma linha'::text, v_erro, v_erro = 'nenhuma linha';
  v_casos := v_casos + 1;

  /* I5 · ler `lideres` é escopado: o organizador de uma área não vê o
     organizador geral (`equipe_id is null`) nem o de outra área */
  set local role authenticated; perform set_config('request.jwt.claims', v_jwt, true);
  select count(*) into n from lideres l where l.equipe_id is distinct from v_eq;
  reset role;
  return query select 'organizador de area so enxerga o proprio em lideres'::text,
    '0 de fora'::text, n::text || ' de fora', n = 0;
  v_casos := v_casos + 1;

  /* I6 · e o visitante não lê nenhuma das duas. É `grant` que segura aqui,
     e a exceção que vem é `insufficient_privilege` — por isso o caso mede o
     ERRO e não uma contagem: contagem zero também viria de tabela vazia. */
  begin
    set local role anon; select count(*) into n from papeis;
    reset role; v_erro := 'leu ' || n || ' linha(s)';
  exception when insufficient_privilege then reset role; v_erro := 'permission denied'; end;
  return query select 'visitante nao le papeis'::text,
    'permission denied'::text, v_erro, v_erro = 'permission denied';
  v_casos := v_casos + 1;

  begin
    set local role anon; select count(*) into n from lideres;
    reset role; v_erro := 'leu ' || n || ' linha(s)';
  exception when insufficient_privilege then reset role; v_erro := 'permission denied'; end;
  return query select 'visitante nao le lideres'::text,
    'permission denied'::text, v_erro, v_erro = 'permission denied';
  v_casos := v_casos + 1;

  /* I7 · `meu_link` com o e-mail de OUTRA pessoa devolve os links DELA, não
     os desta. É o mesmo vazamento do caso corrigido acima, olhado pelo outro
     lado: aqui quem pede é o terceiro, e o token desta pessoa é que não pode
     aparecer. Sem este caso, um `meu_link` que devolvesse sempre o primeiro
     vínculo do banco passaria nos dois. */
  perform set_config('request.jwt.claims',
    json_build_object('email', 'terceiro-' || v_suf || '@exemplo.invalido')::text, true);
  v_j := meu_link();
  perform set_config('request.jwt.claims', '', true);
  select count(*) into n
    from jsonb_array_elements(coalesce(v_j -> 'links', '[]'::jsonb)) k
   where k ->> 'token' = v_tok;
  return query select 'meu_link de OUTRA pessoa nao devolve o token desta'::text,
    '0 vez(es)'::text, n::text || ' vez(es)', n = 0;
  v_casos := v_casos + 1;

  /* I8 · `quem_sou` com o token do terceiro devolve a ficha do terceiro.
     Mesma lógica: um `quem_sou` que ignorasse o token e devolvesse sempre a
     mesma pessoa passava em todos os casos acima. */
  v_j := quem_sou(v_outro_tok);
  select p.nome into v_nome from pessoas p where p.id = v_alheio;
  return query select 'quem_sou com outro token devolve a OUTRA pessoa'::text,
    coalesce(v_nome, '(sem pessoa)'), coalesce(v_j #>> '{pessoa,nome}', '(nada)'),
    coalesce(v_j #>> '{pessoa,nome}', '') = coalesce(v_nome, '');
  v_casos := v_casos + 1;

  /* ------------------------------------------------------------ limpeza
     O cenário é apagado aqui. `voluntarios` nunca é apagado em produção
     (regra do repositório), mas estas duas equipes nasceram nesta função e
     nesta transação, e deixá-las para trás sujaria a contagem de todo mundo
     — inclusive a de `testar_permissoes`, que conta ministérios. */
  delete from lideres where pessoa_id in (v_pessoa, v_alheio);
  delete from papeis where pessoa_id in (v_pessoa, v_alheio);
  delete from voluntarios where equipe_id in (v_eq, v_outra_eq);
  delete from pessoas where id in (v_pessoa, v_alheio);
  delete from equipes where id in (v_eq, v_outra_eq);

  /* ===================================================================
     O ÚLTIMO CASO, E É ELE QUE IMPEDE OS OUTROS DE SUMIREM EM SILÊNCIO.

     `banco-do-zero.sh` compara `total` com `passou`. Se metade dos casos
     parar de ser emitida — um `if` que não entra, um `where exists` que não
     casa, foi assim que o caso do `meu_link` já viveu — o script imprime
     "✓ testar_identidade(): 2/2" e ninguém vê nada.

     Este caso cobra a própria contagem. O número está escrito, mas não é um
     número de fora: é conferido contra o contador que a função incrementa a
     cada `return query`, no mesmo arquivo. Um caso que some derruba este. */
  return query select 'a funcao emitiu todos os casos que tem'::text,
    '27 casos'::text, (v_casos + 1)::text || ' casos', v_casos + 1 = 27;
end $function$

;

revoke all on function testar_identidade() from public, anon, authenticated;
comment on function testar_identidade() is
  'prova que a identidade não muda de dono por acidente. Os casos 1 a 5 comparam `lideres` com `papeis` (migração 33) e valem para isso, mas NÃO detectam um admin implantado: quem escreve nas duas tabelas passa nos cinco. Quem impede o implante são os casos de escrita (72), que trocam de papel de verdade e batem nas políticas de `papeis` e `lideres`. O último caso confere a própria contagem: se um caso sumir, ele reprova.';

do $reg$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (72, '72 · o teste de identidade troca de papel', 'testar_identidade',
           'set local role authenticated'),
      (72, '72 · e cobra o conteudo do meu_link, nao so o ok', 'testar_identidade',
           'nenhum token de terceiro veio junto'),
      (72, '72 · e confere a propria contagem de casos', 'testar_identidade',
           'a funcao emitiu todos os casos que tem')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;

  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo)
      values (72, '72-o-teste-de-identidade-passava-com-o-banco-aberto.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;

-- =========================================================================
-- CONFERÊNCIA
--
-- O caso 3 é o que importa e é o que dá nome à migração: com a RLS desligada
-- em todo o schema, a função TEM que reprovar. A versão antiga respondia
-- 12 de 12 nessa mesma condição, e é isso que se impede de voltar.
--
-- O desligamento acontece dentro de um bloco `begin ... exception`, que em
-- plpgsql é um savepoint de verdade: o `raise` no fim desfaz o DDL. Mesmo
-- recurso que a 33 usa nos casos 5 e 6, pelo mesmo motivo — um teste que
-- suja o banco que ele deveria proteger é pior que teste nenhum.
-- =========================================================================
do $conferir$
declare
  v_total int; v_ok int; v_aberto_ok int; v_aberto_total int;
  v_n int; v_falhas text := '';
begin
  -- 1 · a função roda inteira e passa
  select count(*), count(*) filter (where passou) into v_total, v_ok from testar_identidade();
  if v_total <> 27 then
    v_falhas := v_falhas || format(E'\n  1. emitiu %s casos, esperava 27', v_total);
  end if;
  if v_ok <> v_total then
    v_falhas := v_falhas || format(E'\n  2. %s de %s casos reprovaram num banco saudavel: %s',
      v_total - v_ok, v_total,
      (select string_agg(caso, '; ') from testar_identidade() where not passou));
  end if;

  -- 3 · COM O BANCO ABERTO, ELA TEM QUE REPROVAR
  begin
    declare r record;
    begin
      for r in select c.relname from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
                where ns.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity loop
        execute format('alter table public.%I disable row level security', r.relname);
      end loop;
    end;
    select count(*), count(*) filter (where passou)
      into v_aberto_total, v_aberto_ok from testar_identidade();
    raise exception 'desfazendo' using errcode = 'triggered_action_exception',
      detail = v_aberto_ok::text || '/' || v_aberto_total::text;
  exception when triggered_action_exception then
    declare v_det text; begin
      get stacked diagnostics v_det = pg_exception_detail;
      v_aberto_ok    := split_part(v_det, '/', 1)::int;
      v_aberto_total := split_part(v_det, '/', 2)::int;
    end;
  end;

  if v_aberto_ok >= v_aberto_total then
    v_falhas := v_falhas || format(
      E'\n  3. COM A RLS DESLIGADA a funcao respondeu %s de %s: ela nao exercita politica nenhuma, que era o defeito',
      v_aberto_ok, v_aberto_total);
  end if;
  if v_aberto_total - v_aberto_ok < 5 then
    v_falhas := v_falhas || format(
      E'\n  4. com a RLS desligada so %s caso(s) reprovaram, esperava 5 ou mais',
      v_aberto_total - v_aberto_ok);
  end if;

  -- 5 · e a RLS voltou ligada em todas as tabelas
  select count(*) into v_n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
     and c.relname in ('papeis','lideres','pessoas','voluntarios','escalacoes','candidaturas');
  if v_n > 0 then
    v_falhas := v_falhas || format(E'\n  5. %s tabela(s) ficaram com a RLS DESLIGADA depois da conferencia', v_n);
  end if;

  -- 6 · o cenário foi apagado: nenhuma equipe de teste sobrou
  select count(*) into v_n from equipes where slug like 'ident-%' or slug like 'outra-%';
  if v_n > 0 then
    v_falhas := v_falhas || format(E'\n  6. %s equipe(s) do cenario ficaram no banco', v_n);
  end if;

  -- 7 · a função continua fechada para quem vem de fora
  if has_function_privilege('anon', 'testar_identidade()', 'execute')
     or has_function_privilege('authenticated', 'testar_identidade()', 'execute') then
    v_falhas := v_falhas || E'\n  7. testar_identidade() esta executavel por anon ou authenticated';
  end if;

  if v_falhas <> '' then
    raise exception E'CONFERENCIA DA 72 REPROVOU:%s', v_falhas;
  end if;
  raise notice 'CONFERENCIA DA 72: 7/7. % casos, todos passam; com a RLS desligada, % reprovam.',
    v_total, v_aberto_total - v_aberto_ok;
end $conferir$;
