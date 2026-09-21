-- =========================================================================
-- 79 · DIZER "POSSO" NÃO DESFAZIA O "NÃO POSSO"
--
-- 21/09/2026. Continuação da reauditoria. Um achado, medido, e a correção da
-- assimetria que o produziu.
--
-- -------------------------------------------------------------------------
-- O QUE FOI MEDIDO
--
-- A 71 fez `eu_disponibilidade(..., 'nao')` derrubar as escalações do dia
-- para `recusado`, e isso está certo: quem avisa na grade que não vem
-- precisa que a líder veja a vaga sem depender de ninguém traduzir.
--
-- Só que apenas um lado foi escrito. Num banco nascido do repositório:
--
--     ela está CONFIRMADA em dois postos do domingo 26/09
--     toca "Não posso" na grade
--       -> escalacoes: recusado, recusado | pode = false | indisponivel: 1
--     muda de ideia e toca "Posso", na mesma grade
--       -> escalacoes: recusado, recusado | pode = TRUE  | indisponivel: 0
--
-- Estado final: a grade diz que ela PODE e a escala diz que ela RECUSOU. O
-- motor lê a escala, então ela continua fora do domingo; a líder vê duas
-- vagas abertas de alguém que acabou de dizer que vem; e a pessoa, olhando a
-- própria tela, vê "posso" marcado e acha que resolveu.
--
-- É a mesma divergência entre `disponibilidade`, `indisponibilidades` e
-- `escalacoes` que a 65 fechou, com os sinais trocados. E é alcançável pelo
-- caminho que a própria 71 descreve como o único que sobra: o cartão "Sua
-- próxima escala" não tem botão de desmarcar, então quem mudou de ideia
-- volta pela grade.
--
-- -------------------------------------------------------------------------
-- A ASSIMETRIA QUE PRODUZIU ISSO
--
-- `eu_indisponibilidade(marcar => false)` JÁ devolve a escalação para
-- `pendente` desde a 65, com o comentário "clicou errado? desmarcar devolve
-- a escala e ele pode confirmar de novo". As duas funções mexem no mesmo
-- dia, pelos dois botões da mesma grade, e só uma sabia voltar atrás.
--
-- Duas decisões, escritas:
--
--   · volta para `pendente`, não para `confirmado`. A pessoa disse que o DIA
--     está livre, não que aceita de volta cada posto. Quem confirma posto é
--     o botão do posto.
--   · só `recusado` volta. `furou` é fato observado por quem estava lá, e
--     desfazer isso é ato de quem lidera, na tela de Escala. Mesma regra que
--     a 65 e a 71 já aplicam em toda escrita desta família.
--
-- `'limpar'` recebe o mesmo tratamento: "não respondi" não pode deixar uma
-- recusa de pé que a pessoa acabou de apagar.
-- =========================================================================

/* A TRANCA. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(79);
  end if;
end $tranca$;

CREATE OR REPLACE FUNCTION public.eu_disponibilidade(p_token text, p_data date, p_resposta text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  select id into v_id from voluntarios where token = p_token and ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  /* 65 · janela. Sem ela, 1999 e 2399 entram e ficam. */
  if p_data is null or p_data < current_date - 400 or p_data > current_date + 400 then
    raise exception 'Essa data esta fora do periodo que da para responder.';
  end if;

  if    p_resposta = 'posso'  then
    perform eu_marcar_dia(v_id, p_data, true);
    /* ========================================================== 79 ======
       DIZER "POSSO" DESFAZ O "NÃO POSSO", INCLUSIVE NA ESCALA.

       A 71 fez `'nao'` derrubar as escalações do dia para `recusado`, que
       estava certo: quem avisa na grade que não vem precisa que a líder
       veja a vaga. Mas só um lado foi escrito. Medido em 21/09:

           confirmada nos dois postos
           toca "Não posso"  -> escalacoes: recusado, recusado | pode=false
           muda de ideia,
           toca "Posso"      -> escalacoes: recusado, recusado | pode=TRUE

       Estado final: a grade diz que ela PODE e a escala diz que ela
       RECUSOU. O motor lê a escala, então ela continua fora — e a líder vê
       duas vagas abertas de alguém que disse que vem.

       É a mesma divergência entre as três tabelas que a 65 fechou, com os
       sinais trocados. E é alcançável pelo caminho que a própria 71
       descreve como o único que sobra: o cartão da próxima escala não tem
       botão de desmarcar, então a pessoa volta pela grade.

       `eu_indisponibilidade(marcar=false)` já faz exatamente isto desde a
       65 — as duas irmãs mexem no mesmo dia e só uma sabia voltar atrás.

       `pendente` e não `confirmado`: a pessoa disse que o DIA está livre,
       não que aceita de volta cada posto. Quem confirma posto é o botão do
       posto. E só `recusado` volta: `furou` é fato observado por quem
       estava lá, e desfazer isso é ato de quem lidera. */
    update escalacoes e set status = 'pendente', respondido_em = null
      from cultos c
     where c.id = e.culto_id and c.data = p_data
       and e.voluntario_id = v_id and e.status = 'recusado';
  elsif p_resposta = 'nao'    then
    perform eu_marcar_dia(v_id, p_data, false);
    /* 71 · A TERCEIRA RESPOSTA PARA A MESMA PERGUNTA.

       A 65 conciliou `disponibilidade` com `indisponibilidades` e deixou de
       fora a terceira tabela que responde "eu vou no dia 11?":
       `escalacoes.status`.

       Medido em 21/09: a pessoa confirma o domingo, muda de ideia, e a tela
       dela só oferece a grade "Quando você pode" (o cartão do próximo
       domingo não tem o botão de desmarcar). Ela toca "Não". O banco fica com
       `escalacoes.status = 'confirmado'` E `indisponibilidades = 1`, ao mesmo
       tempo, e a tela mostra as duas coisas fielmente. Ela acredita que
       avisou; a líder tem uma pessoa confirmada que não vai.

       `eu_indisponibilidade` faz isto desde o primeiro dia, com o comentário
       "avisa o líder na hora" — e não tem um único chamador no produto. A
       função que a tela usa de verdade é esta, e ela não fazia. */
    update escalacoes e set status = 'recusado', respondido_em = now()
      from cultos c
     where c.id = e.culto_id and c.data = p_data
       and e.voluntario_id = v_id and e.status <> 'furou';
  elsif p_resposta = 'limpar' then
    perform eu_marcar_dia(v_id, p_data, null);
    /* 79 · "limpar" é "não respondi", e por isso ele também devolve a
       escalação para `pendente`: deixar `recusado` num dia sem resposta
       seria a escala afirmando uma recusa que a pessoa acabou de apagar. */
    update escalacoes e set status = 'pendente', respondido_em = null
      from cultos c
     where c.id = e.culto_id and c.data = p_data
       and e.voluntario_id = v_id and e.status = 'recusado';
  else
    /* 65 · ERA UM `else` QUE APAGAVA.
       Qualquer texto que não fosse 'posso' nem 'nao' caía aqui e apagava a
       resposta nas duas tabelas, sem um aviso. O app só manda os dois
       valores certos, então este ramo nunca rodava por vontade de ninguém —
       rodava por engano, e o efeito do engano era perda de dado. Apagar
       continua possível, com nome: 'limpar'. */
    raise exception 'Resposta invalida: %. Use posso, nao ou limpar.', coalesce(p_resposta, '<nulo>');
  end if;
end $function$

;

do $reg$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (79, '79 · dizer posso desfaz a recusa do dia', 'eu_disponibilidade',
           'set status = ''pendente'', respondido_em = null')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo)
      values (79, '79-dizer-que-pode-nao-desfazia-o-nao-posso.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;

-- =========================================================================
-- CONFERÊNCIA
--
-- A ida e a volta, medidas como estado das TRÊS tabelas depois de cada
-- toque. Não basta conferir que o botão não explodiu: o defeito era
-- justamente um estado coerente em duas tabelas e incoerente na terceira.
-- =========================================================================
do $conferir$
declare
  v_falhas text := ''; v_suf text; v_eq uuid; v_f1 uuid; v_f2 uuid;
  v_p uuid; v_v uuid; v_tok text; v_c uuid; v_dia date; v_meu_culto boolean := false;
  v_esc text; v_pode text; v_ind int;
begin
  v_suf := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  insert into equipes (nome, slug, ordem)
       values ('Conf79 ' || v_suf, 'conf79-' || v_suf, 9994) returning id into v_eq;
  insert into funcoes (equipe_id, nome, ordem, ativa, tipos)
       values (v_eq, 'POSTO A 79', 1, true, array['domingo','follow']) returning id into v_f1;
  insert into funcoes (equipe_id, nome, ordem, ativa, tipos)
       values (v_eq, 'POSTO B 79', 2, true, array['domingo','follow']) returning id into v_f2;
  insert into pessoas (nome, telefone) values ('Conf79 ' || v_suf, '21900000790') returning id into v_p;
  insert into voluntarios (equipe_id, pessoa_id, nome, telefone, conferido, ativo)
       values (v_eq, v_p, 'Conf79 ' || v_suf, '21900000790', true, true)
    returning id, token into v_v, v_tok;

  /* reusa o calendário — a lição da 75 e da 76 */
  select id, data into v_c, v_dia from cultos
   where evento is null and data > current_date order by data limit 1;
  if v_c is null then
    v_dia := current_date + 10;
    insert into cultos (data) values (v_dia) returning id into v_c;
    v_meu_culto := true;
  end if;

  insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
       values (v_c, v_f1, v_v, 'confirmado', false, false),
              (v_c, v_f2, v_v, 'confirmado', false, false);

  -- 1 · "não posso" derruba os dois postos (o que a 71 trouxe)
  perform eu_disponibilidade(v_tok, v_dia, 'nao');
  select string_agg(status::text, ',' order by status::text) into v_esc
    from escalacoes where culto_id = v_c and voluntario_id = v_v;
  if v_esc is distinct from 'recusado,recusado' then
    v_falhas := v_falhas || format(E'\n  1. "nao posso" nao derrubou os dois postos: %s', v_esc);
  end if;
  select coalesce(pode::text,'-') into v_pode from disponibilidade where voluntario_id = v_v and data = v_dia;
  select count(*) into v_ind from indisponibilidades where voluntario_id = v_v and data = v_dia;
  if v_pode is distinct from 'false' or v_ind <> 1 then
    v_falhas := v_falhas || format(E'\n  1b. e a grade ficou pode=%s indisponivel=%s', v_pode, v_ind);
  end if;

  -- 2 · O CASO QUE DÁ NOME AO ARQUIVO: "posso" devolve a escala
  perform eu_disponibilidade(v_tok, v_dia, 'posso');
  select string_agg(status::text, ',' order by status::text) into v_esc
    from escalacoes where culto_id = v_c and voluntario_id = v_v;
  if v_esc is distinct from 'pendente,pendente' then
    v_falhas := v_falhas || format(
      E'\n  2. depois de "posso", a escala ainda diz %s — a grade e a escala discordam', v_esc);
  end if;
  select coalesce(pode::text,'-') into v_pode from disponibilidade where voluntario_id = v_v and data = v_dia;
  select count(*) into v_ind from indisponibilidades where voluntario_id = v_v and data = v_dia;
  if v_pode is distinct from 'true' or v_ind <> 0 then
    v_falhas := v_falhas || format(E'\n  2b. e a grade ficou pode=%s indisponivel=%s', v_pode, v_ind);
  end if;

  -- 3 · "limpar" também não deixa recusa de pé
  perform eu_disponibilidade(v_tok, v_dia, 'nao');
  perform eu_disponibilidade(v_tok, v_dia, 'limpar');
  select string_agg(status::text, ',' order by status::text) into v_esc
    from escalacoes where culto_id = v_c and voluntario_id = v_v;
  if v_esc is distinct from 'pendente,pendente' then
    v_falhas := v_falhas || format(E'\n  3. depois de "limpar", a escala ainda diz %s', v_esc);
  end if;

  -- 4 · MAS `furou` NÃO VOLTA. É fato de quem estava lá.
  update escalacoes set status = 'furou' where culto_id = v_c and funcao_id = v_f1 and voluntario_id = v_v;
  update escalacoes set status = 'recusado' where culto_id = v_c and funcao_id = v_f2 and voluntario_id = v_v;
  perform eu_disponibilidade(v_tok, v_dia, 'posso');
  select status::text into v_esc from escalacoes where culto_id = v_c and funcao_id = v_f1 and voluntario_id = v_v;
  if v_esc is distinct from 'furou' then
    v_falhas := v_falhas || format(E'\n  4. "posso" desfez um FURO registrado pela lideranca: virou %s', v_esc);
  end if;
  select status::text into v_esc from escalacoes where culto_id = v_c and funcao_id = v_f2 and voluntario_id = v_v;
  if v_esc is distinct from 'pendente' then
    v_falhas := v_falhas || format(E'\n  4b. e o posto recusado ao lado NAO voltou: %s', v_esc);
  end if;

  -- 5 · e "posso" não mexe em posto de OUTRO dia
  declare v_outro uuid; v_dia2 date; v_meu2 boolean := false; begin
    select id, data into v_outro, v_dia2 from cultos
     where evento is null and data > v_dia order by data limit 1;
    if v_outro is null then
      v_dia2 := v_dia + 7;
      insert into cultos (data) values (v_dia2) returning id into v_outro;
      v_meu2 := true;
    end if;
    insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
         values (v_outro, v_f1, v_v, 'recusado', false, false);
    perform eu_disponibilidade(v_tok, v_dia, 'posso');
    select status::text into v_esc from escalacoes where culto_id = v_outro and voluntario_id = v_v;
    if v_esc is distinct from 'recusado' then
      v_falhas := v_falhas || format(E'\n  5. "posso" no dia %s mexeu no dia %s: virou %s', v_dia, v_dia2, v_esc);
    end if;
    delete from escalacoes where culto_id = v_outro and voluntario_id = v_v;
    if v_meu2 then delete from cultos where id = v_outro; end if;
  end;

  -- limpeza
  delete from escalacoes where voluntario_id = v_v;
  delete from disponibilidade where voluntario_id = v_v;
  delete from indisponibilidades where voluntario_id = v_v;
  delete from voluntarios where id = v_v;
  delete from pessoas where id = v_p;
  delete from funcoes where equipe_id = v_eq;
  delete from equipes where id = v_eq;
  if v_meu_culto then delete from cultos where id = v_c; end if;

  if v_falhas <> '' then
    raise exception E'CONFERENCIA DA 79 REPROVOU:%s', v_falhas;
  end if;
  raise notice 'CONFERENCIA DA 79: 5/5. A grade e a escala concordam nos dois sentidos, e o furo continua de pe.';
end $conferir$;
