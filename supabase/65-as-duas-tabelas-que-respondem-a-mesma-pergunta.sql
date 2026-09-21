/* =============================================================================
   65 · AS DUAS TABELAS QUE RESPONDEM A MESMA PERGUNTA

   21/09/2026. Só de Escalas.

   -------------------------------------------------------------------------
   O QUE EXISTE HOJE

   Duas tabelas guardam a mesma resposta do voluntário sobre um domingo:

     `indisponibilidades (voluntario_id, data)`  — a linha existe = não posso
     `disponibilidade (voluntario_id, data, pode)` — a resposta explícita

   E `lib/ponte.ts` já escreveu, em comentário, o contrato entre elas:

       "Só conta pode=true: um pode=false já virou indisponibilidade lá no
        eu_disponibilidade, então não conta duas vezes."

   Ou seja: TODA linha com `pode = false` tem uma linha correspondente em
   `indisponibilidades`. É um invariante de verdade — o motor depende dele.

   Quatro funções escrevem nessas tabelas. Só UMA mantém o invariante.

   -------------------------------------------------------------------------
   A DERIVA, MEDIDA — NÃO DEDUZIDA

   Rodado em 21/09/2026 num banco nascido de `scripts/banco-do-zero.sh`, com
   um voluntário e o domingo seguinte:

     A) eu_disponibilidade('nao')          pode=false | indisp=1   ✓ de acordo
     B) e então eu_responder('confirmado') pode=FALSE | indisp=0   ✗
        A pessoa confirmou. A tabela de disponibilidade continua dizendo que
        ela não pode.
     C) e a tela dela, nesse estado:       eu_dados -> indisponivel=[] e
        disponivel=[]. O dia some das DUAS listas: ela respondeu duas vezes e
        a tela diz que ela não respondeu nenhuma.
     D) 'posso' e então eu_responder('recusado')  pode=TRUE | indisp=1   ✗
        O contrário, com o mesmo formato.
     E) 'nao' e então eu_indisponibilidade(desmarcar)  pode=FALSE | indisp=0  ✗
        Desmarcou, e a disponibilidade continua "não posso".

   E mais três, do mesmo passeio:

     G) a líder marca FUROU; a pessoa abre o link e toca "Eu vou"; o status
        vira `confirmado`. O furo que a liderança registrou some.
        `eu_indisponibilidade` tem `and e.status <> 'furou'` desde sempre.
        `eu_responder` nunca teve. Duas portas, a mesma pessoa, o mesmo dia,
        regras opostas.

     H) eu_disponibilidade(token, dia, 'sim')  — um erro de digitação de
        'posso' — NÃO levanta erro: cai no `else`, que APAGA a resposta que
        existia, nas duas tabelas, em silêncio. O ramo não tem um único
        chamador no app (`app/eu/[token]/page.tsx` só manda 'posso' e 'nao'),
        então ele hoje só pode ser alcançado por engano. Um ramo que só roda
        por engano e cujo efeito é apagar dado é a definição de armadilha.

     I) datas de 1999 e de 2399 são aceitas e gravadas.

   -------------------------------------------------------------------------
   O QUE ESTE ARQUIVO FAZ, E O QUE ELE NÃO FAZ

   NÃO funde as duas tabelas. Seria o conserto de raiz — uma tabela só, com
   `pode` nulo para "não respondeu" — e ele atravessa o motor, a ponte, o
   cron e três telas. Dito sem maquiagem: fica de dívida, anotada aqui, e o
   que este arquivo entrega é o invariante VALENDO nas quatro portas, num
   lugar só, com conferência que reprova quando alguém escrever numa tabela
   sem escrever na outra.

   O lugar só é `eu_marcar_dia(voluntario, data, pode)`:

     pode = true   -> disponibilidade.pode = true   + apaga a indisponibilidade
     pode = false  -> disponibilidade.pode = false  + grava a indisponibilidade
     pode = null   -> apaga das duas ("não respondeu")

   As quatro portas passam a chamá-la. Nenhuma delas volta a escrever numa
   tabela direto.

   Além disso:

     · `eu_responder` ganha `and status <> 'furou'`, igual à irmã, e só toca
       na resposta do dia SE a atualização pegou alguma linha — hoje ela
       apaga a indisponibilidade mesmo quando o culto não tem escalação
       nenhuma daquela pessoa.
     · `eu_disponibilidade` levanta erro em resposta desconhecida, e ganha
       'limpar' como o nome explícito de apagar. A mensagem sai em português
       porque `lib/erros.ts` repassa P0001 como veio.
     · as três ganham uma janela de datas (400 dias para trás e para frente).

   PLANTÃO NÃO PASSA POR AQUI: `eu_dados` devolve plantão com `culto_id`, mas
   a tela diz "não precisa confirmar" e não oferece botão. A guarda de
   escalação abaixo não o afeta.
   ============================================================================= */


-- =========================================================================
-- 1 · O LUGAR SÓ
-- =========================================================================

create or replace function eu_marcar_dia(p_vol uuid, p_data date, p_pode boolean)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if p_vol is null or p_data is null then return; end if;

  if p_pode is null then
    delete from disponibilidade   where voluntario_id = p_vol and data = p_data;
    delete from indisponibilidades where voluntario_id = p_vol and data = p_data;
    return;
  end if;

  insert into disponibilidade (voluntario_id, data, pode) values (p_vol, p_data, p_pode)
    on conflict (voluntario_id, data) do update set pode = p_pode, respondido_em = now();

  if p_pode then
    delete from indisponibilidades where voluntario_id = p_vol and data = p_data;
  else
    insert into indisponibilidades (voluntario_id, data) values (p_vol, p_data)
      on conflict (voluntario_id, data) do nothing;
  end if;
end $fn$;

/* SEM GRANT PARA `anon` NEM PARA `authenticated`, DE PROPÓSITO. Ela recebe um
   `voluntario_id` cru, sem token: quem pudesse chamá-la marcaria o domingo de
   qualquer pessoa. As quatro portas que a usam são `security definer` e
   conferem o token antes. */
revoke all on function eu_marcar_dia(uuid, date, boolean) from public, anon, authenticated;
comment on function eu_marcar_dia(uuid, date, boolean) is
  'O UNICO lugar que escreve a resposta do voluntario sobre um dia. Mantem disponibilidade e indisponibilidades de acordo: pode=false SEMPRE tem indisponibilidade, e pode=true NUNCA tem. Interna: nao e concedida a ninguem.';


-- =========================================================================
-- 2 · `eu_disponibilidade`
--
-- Corpo de `supabase/05-melhorias.sql`. As duas escritas viram chamada, o
-- `else` silencioso vira erro, e 'limpar' passa a ser o nome de apagar.
-- =========================================================================

create or replace function eu_disponibilidade(p_token text, p_data date, p_resposta text)
returns void
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  select id into v_id from voluntarios where token = p_token and ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  /* 65 · janela. Sem ela, 1999 e 2399 entram e ficam. */
  if p_data is null or p_data < current_date - 400 or p_data > current_date + 400 then
    raise exception 'Essa data esta fora do periodo que da para responder.';
  end if;

  if    p_resposta = 'posso'  then perform eu_marcar_dia(v_id, p_data, true);
  elsif p_resposta = 'nao'    then perform eu_marcar_dia(v_id, p_data, false);
  elsif p_resposta = 'limpar' then perform eu_marcar_dia(v_id, p_data, null);
  else
    /* 65 · ERA UM `else` QUE APAGAVA.
       Qualquer texto que não fosse 'posso' nem 'nao' caía aqui e apagava a
       resposta nas duas tabelas, sem um aviso. O app só manda os dois
       valores certos, então este ramo nunca rodava por vontade de ninguém —
       rodava por engano, e o efeito do engano era perda de dado. Apagar
       continua possível, com nome: 'limpar'. */
    raise exception 'Resposta invalida: %. Use posso, nao ou limpar.', coalesce(p_resposta, '<nulo>');
  end if;
end $fn$;
revoke all on function eu_disponibilidade(text, date, text) from public;
grant execute on function eu_disponibilidade(text, date, text) to anon, authenticated;
comment on function eu_disponibilidade(text, date, text) is
  'O voluntario responde posso/nao/limpar para um dia. Desde a 65 escreve pelas maos de eu_marcar_dia (as duas tabelas de acordo) e recusa resposta desconhecida em vez de apagar em silencio.';


-- =========================================================================
-- 3 · `eu_indisponibilidade`
--
-- Corpo de `supabase/01-schema-inicial.sql`. O `and e.status <> 'furou'` e o
-- `update ... 'pendente'` continuam palavra por palavra; só as escritas nas
-- tabelas de resposta viram chamada.
-- =========================================================================

create or replace function eu_indisponibilidade(p_token text, p_data date, p_marcar boolean)
returns void
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  select id into v_id from voluntarios where token = p_token and ativo;
  if v_id is null then raise exception 'Link inválido'; end if;

  if p_data is null or p_data < current_date - 400 or p_data > current_date + 400 then
    raise exception 'Essa data esta fora do periodo que da para responder.';
  end if;

  if p_marcar then
    /* 65 · era `insert into indisponibilidades ... on conflict do nothing`, e
       só isso: a disponibilidade da pessoa continuava dizendo "posso". */
    perform eu_marcar_dia(v_id, p_data, false);
    -- avisa o líder na hora, em vez de deixar como "não respondeu"
    update escalacoes e set status = 'recusado', respondido_em = now()
      from cultos c where c.id = e.culto_id and c.data = p_data
       and e.voluntario_id = v_id and e.status <> 'furou';
  else
    /* 65 · era `delete from indisponibilidades ...`, deixando `pode = false`
       órfão — o caso E da medição do cabeçalho. Desmarcar é "não respondi",
       e não "posso": quem quer dizer "posso" tem o botão que diz posso. */
    perform eu_marcar_dia(v_id, p_data, null);
    -- clicou errado? desmarcar devolve a escala e ele pode confirmar de novo
    update escalacoes e set status = 'pendente', respondido_em = null
      from cultos c where c.id = e.culto_id and c.data = p_data
       and e.voluntario_id = v_id and e.status = 'recusado';
  end if;
end $fn$;
revoke all on function eu_indisponibilidade(text, date, boolean) from public;
grant execute on function eu_indisponibilidade(text, date, boolean) to anon, authenticated;
comment on function eu_indisponibilidade(text, date, boolean) is
  'Marca ou desmarca um dia pelo calendario do voluntario. Desde a 65 escreve pelas maos de eu_marcar_dia; desmarcar volta para "nao respondi", nao para "posso".';


-- =========================================================================
-- 4 · `eu_responder`
--
-- Corpo de `supabase/01-schema-inicial.sql`, com quatro mudanças.
-- =========================================================================

create or replace function eu_responder(p_token text, p_culto_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_data date; v_n int;
begin
  if p_status not in ('confirmado','recusado') then raise exception 'Resposta invalida'; end if;
  select id into v_id from voluntarios where token = p_token and ativo;
  if v_id is null then raise exception 'Link invalido'; end if;
  select data into v_data from cultos where id = p_culto_id;

  /* 65 · MUDANÇA 1: culto que não existe. Antes `v_data` ficava nulo e a
     função seguia mexendo em `indisponibilidades` com `data = null`. */
  if v_data is null then raise exception 'Esse culto nao existe mais.'; end if;

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
  update escalacoes set status = p_status::status_escala, respondido_em = now()
   where culto_id = p_culto_id and voluntario_id = v_id
     and status <> 'furou';
  get diagnostics v_n = row_count;

  if v_n = 0 then
    if exists (select 1 from escalacoes
                where culto_id = p_culto_id and voluntario_id = v_id and status = 'furou') then
      raise exception 'A lideranca registrou falta nesse dia. Fale com quem organiza a sua area.';
    end if;
    /* nada seu neste culto: não é erro da pessoa, e não há dia para marcar */
    return;
  end if;

  /* 65 · MUDANÇA 4: as duas escritas passam pelo lugar só, e agora as duas
     EXISTEM. Antes só o `confirmado` mexia em `disponibilidade` (não mexia:
     apagava a indisponibilidade e deixava `pode = false` para trás), e o
     `recusado` gravava a indisponibilidade sem tocar em `disponibilidade`.
     confirmar = "eu POSSO nesse dia"; recusar = "eu NÃO POSSO nesse dia", e
     um re-sorteio do domingo nunca devolve a pessoa para o mesmo dia. */
  perform eu_marcar_dia(v_id, v_data, p_status = 'confirmado');
end $fn$;
revoke all on function eu_responder(text, uuid, text) from public;
grant execute on function eu_responder(text, uuid, text) to anon, authenticated;
comment on function eu_responder(text, uuid, text) is
  'O voluntario responde a UM culto pelo link dele. Desde a 65: nao apaga furo registrado pela lideranca, so mexe na resposta do dia se a escalacao dele mudou, e mantem disponibilidade e indisponibilidades de acordo.';


-- =========================================================================
-- REGISTRO NA RÉGUA E NA SONDA
-- =========================================================================

do $reg$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (65, '65 · eu_responder nao apaga furo', 'eu_responder', 'and status <> ''furou'''),
      (65, '65 · eu_responder escreve pelo lugar so', 'eu_responder', 'eu_marcar_dia'),
      (65, '65 · eu_disponibilidade recusa resposta desconhecida', 'eu_disponibilidade',
           'Resposta invalida: %'),
      (65, '65 · eu_indisponibilidade escreve pelo lugar so', 'eu_indisponibilidade', 'eu_marcar_dia')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;

  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo)
      values (65, '65-as-duas-tabelas-que-respondem-a-mesma-pergunta.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;


-- =========================================================================
-- 5 · O BACKFILL DO QUE JÁ DERIVOU
--
-- Produção roda estas funções desde o primeiro dia, então as duas tabelas já
-- estão fora de acordo em algum número de linhas. As duas direções têm
-- conserto diferente, e a diferença é sobre QUEM tem razão:
--
--   `pode = false` sem indisponibilidade -> a indisponibilidade foi apagada
--     por uma confirmação (o caso B). Quem tem razão é a confirmação, que é
--     mais recente e mais específica: vira `pode = true`.
--
--   indisponibilidade sem linha em `disponibilidade` -> ninguém apagou nada;
--     a pessoa marcou pelo calendário, que nunca escreveu na outra tabela.
--     Vira `pode = false`, que é o que ela disse.
--
-- Não há como recuperar o caso D (recusou e ficou `pode = true`) sem olhar a
-- escalação, então ele é tratado por último, pela escalação mesmo.
-- =========================================================================

do $bf$
declare v_a int; v_b int; v_c int;
begin
  update disponibilidade d set pode = true, respondido_em = now()
   where d.pode = false
     and not exists (select 1 from indisponibilidades i
                      where i.voluntario_id = d.voluntario_id and i.data = d.data);
  get diagnostics v_a = row_count;

  insert into disponibilidade (voluntario_id, data, pode)
  select i.voluntario_id, i.data, false from indisponibilidades i
   where not exists (select 1 from disponibilidade d
                      where d.voluntario_id = i.voluntario_id and d.data = i.data)
     on conflict (voluntario_id, data) do nothing;
  get diagnostics v_b = row_count;

  /* o caso D: recusou o culto e a disponibilidade ficou dizendo "posso".
     A indisponibilidade existe (o `recusado` a gravou), então a linha acima
     não pegou — esta pega. */
  update disponibilidade d set pode = false, respondido_em = now()
   where d.pode = true
     and exists (select 1 from indisponibilidades i
                  where i.voluntario_id = d.voluntario_id and i.data = d.data);
  get diagnostics v_c = row_count;

  raise notice '65 · backfill: % viraram posso, % nasceram como nao posso, % viraram nao posso.',
    v_a, v_b, v_c;
end $bf$;


-- =========================================================================
-- A CONFERÊNCIA
--
-- Anda a mesma medição do cabeçalho, caso por caso, e cobra o invariante
-- depois de CADA porta. Catálogo não serve: as quatro funções estavam
-- escritas, legíveis, e cada uma parecia certa sozinha. O defeito é a
-- composição delas.
-- =========================================================================

do $conf$
declare
  v_eq uuid; v_fn uuid; v_vol uuid; v_tok text; v_culto uuid; v_dia date;
  v_pessoa uuid; v_outro int; v_pode boolean; v_n int; v_st text;
  ok int := 0; falhou int := 0; msg text := '';

begin
  select (current_date + ((7 - extract(dow from current_date)::int) % 7) + 7)::date into v_dia;

  insert into equipes (nome, slug, ordem) values ('Conf65','conf65',9971) returning id into v_eq;
  insert into funcoes (equipe_id, nome, ordem, ativa) values (v_eq,'P65',1,true) returning id into v_fn;
  insert into pessoas (nome, telefone) values ('Conf Sessentaecinco','21999990071') returning id into v_pessoa;
  insert into voluntarios (equipe_id, pessoa_id, nome, telefone, conferido, ativo)
       values (v_eq, v_pessoa, 'Conf Sessentaecinco','21999990071', true, true)
    returning id, token into v_vol, v_tok;
  insert into habilidades (voluntario_id, funcao_id, nivel, confirmado)
       values (v_vol, v_fn, 'titular', true);
  insert into cultos (data) values (v_dia) on conflict do nothing;
  select id into v_culto from cultos where data = v_dia and evento is null;
  insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
       values (v_culto, v_fn, v_vol, 'pendente', false, false);

  /* ---- 1. 'nao' e depois CONFIRMAR o culto: o caso B da medição -------- */
  perform eu_disponibilidade(v_tok, v_dia, 'nao');
  perform eu_responder(v_tok, v_culto, 'confirmado');
  select pode into v_pode from disponibilidade where voluntario_id = v_vol and data = v_dia;
  select count(*) into v_n from indisponibilidades where voluntario_id = v_vol and data = v_dia;
  if v_pode and v_n = 0 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || format(E'\n  x confirmou e a disponibilidade nao acompanhou: pode=%s indisp=%s', v_pode, v_n);
  end if;

  /* ---- 2. e a tela dela mostra o dia como RESPONDIDO ------------------- */
  if (select disponivel from eu_dados(v_tok))::jsonb ? v_dia::text then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x eu_dados nao lista o dia como disponivel: a pessoa respondeu e a tela diz que nao';
  end if;

  /* ---- 3. 'posso' e depois RECUSAR: o caso D -------------------------- */
  perform eu_disponibilidade(v_tok, v_dia, 'posso');
  perform eu_responder(v_tok, v_culto, 'recusado');
  select pode into v_pode from disponibilidade where voluntario_id = v_vol and data = v_dia;
  select count(*) into v_n from indisponibilidades where voluntario_id = v_vol and data = v_dia;
  if v_pode is false and v_n = 1 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || format(E'\n  x recusou e a disponibilidade nao acompanhou: pode=%s indisp=%s', v_pode, v_n);
  end if;

  /* ---- 4. desmarcar pelo calendário: o caso E ------------------------- */
  perform eu_disponibilidade(v_tok, v_dia, 'nao');
  perform eu_indisponibilidade(v_tok, v_dia, false);
  select count(*) into v_n from disponibilidade where voluntario_id = v_vol and data = v_dia;
  if v_n = 0 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x desmarcou e a disponibilidade ficou orfa dizendo "nao posso"';
  end if;

  /* ---- 5. marcar pelo calendário escreve nas DUAS --------------------- */
  perform eu_disponibilidade(v_tok, v_dia, 'posso');
  perform eu_indisponibilidade(v_tok, v_dia, true);
  select pode into v_pode from disponibilidade where voluntario_id = v_vol and data = v_dia;
  select count(*) into v_n from indisponibilidades where voluntario_id = v_vol and data = v_dia;
  if v_pode is false and v_n = 1 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || format(E'\n  x marcou pelo calendario e a disponibilidade ficou dizendo posso: pode=%s', v_pode);
  end if;

  /* ---- 6. O FURO DA LÍDER NÃO É APAGADO PELA PESSOA ------------------- */
  update escalacoes set status = 'furou' where culto_id = v_culto and voluntario_id = v_vol;
  begin
    perform eu_responder(v_tok, v_culto, 'confirmado');
    falhou := falhou + 1;
    msg := msg || E'\n  x eu_responder aceitou por cima de um furo, sem nem reclamar';
  exception when others then
    ok := ok + 1;   -- levantou, que é o esperado
  end;
  select status::text into v_st from escalacoes where culto_id = v_culto and voluntario_id = v_vol;
  if v_st = 'furou' then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || format(E'\n  x o furo registrado pela lideranca virou %s', v_st);
  end if;

  /* ---- 7. culto SEM escalação minha não mexe na minha resposta -------- */
  update escalacoes set status = 'pendente' where culto_id = v_culto and voluntario_id = v_vol;
  perform eu_disponibilidade(v_tok, v_dia, 'nao');
  delete from escalacoes where culto_id = v_culto and voluntario_id = v_vol;
  perform eu_responder(v_tok, v_culto, 'confirmado');
  select count(*) into v_n from indisponibilidades where voluntario_id = v_vol and data = v_dia;
  if v_n = 1 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x um culto onde a pessoa nao tem posto nenhum apagou o "nao posso" dela daquele dia';
  end if;

  /* ---- 8. resposta desconhecida LEVANTA, em vez de apagar ------------- */
  begin
    perform eu_disponibilidade(v_tok, v_dia, 'sim');
    falhou := falhou + 1;
    msg := msg || E'\n  x eu_disponibilidade aceitou uma resposta que nao existe';
  exception when others then
    ok := ok + 1;
  end;
  select count(*) into v_n from indisponibilidades where voluntario_id = v_vol and data = v_dia;
  if v_n = 1 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x a resposta invalida chegou a apagar o dado antes de levantar';
  end if;

  /* ---- 9. 'limpar' apaga, porque agora tem nome ----------------------- */
  perform eu_disponibilidade(v_tok, v_dia, 'limpar');
  select count(*) into v_n from disponibilidade where voluntario_id = v_vol and data = v_dia;
  select count(*) into v_outro from indisponibilidades where voluntario_id = v_vol and data = v_dia;
  if v_n = 0 and v_outro = 0 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x limpar nao limpou as duas';
  end if;

  /* ---- 10. data absurda é recusada ------------------------------------ */
  begin
    perform eu_disponibilidade(v_tok, date '1999-01-03', 'nao');
    falhou := falhou + 1;
    msg := msg || E'\n  x data de 1999 foi aceita';
  exception when others then
    ok := ok + 1;
  end;

  /* ---- 11. O INVARIANTE, NO BANCO INTEIRO ----------------------------- */
  select count(*) into v_n from disponibilidade d
   where d.pode = false
     and not exists (select 1 from indisponibilidades i
                      where i.voluntario_id = d.voluntario_id and i.data = d.data);
  if v_n = 0 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || format(E'\n  x %s linha(s) com pode=false sem indisponibilidade: o backfill nao fechou', v_n);
  end if;

  select count(*) into v_n from indisponibilidades i
   where not exists (select 1 from disponibilidade d
                      where d.voluntario_id = i.voluntario_id and d.data = i.data and d.pode = false);
  if v_n = 0 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || format(E'\n  x %s indisponibilidade(s) sem a linha correspondente em disponibilidade', v_n);
  end if;

  /* ---- limpeza, POR ID ------------------------------------------------ */
  delete from escalacoes where culto_id = v_culto and voluntario_id = v_vol;
  delete from disponibilidade where voluntario_id = v_vol;
  delete from indisponibilidades where voluntario_id = v_vol;
  delete from habilidades where voluntario_id = v_vol;
  delete from voluntarios where id = v_vol;
  delete from pessoas where id = v_pessoa;
  delete from funcoes where id = v_fn;
  delete from equipes where id = v_eq;

  if falhou > 0 then
    raise exception 'A CONFERENCIA DA 65 REPROVOU: % de % casos', falhou, ok + falhou
      using detail = msg, errcode = 'raise_exception';
  end if;
  raise notice '65 · conferencia: %/% casos. As quatro portas escrevem pelo mesmo lugar, o furo da lideranca fica de pe, e o invariante vale no banco inteiro.', ok, ok;
end $conf$;


/* =============================================================================
   DÍVIDA ANOTADA

   `disponibilidade` e `indisponibilidades` continuam sendo duas tabelas para
   uma pergunta. Este arquivo fez o invariante valer; não fez a fusão. Quando
   for a hora: uma tabela `resposta_do_dia (voluntario_id, data, pode)`, com
   a ausência de linha querendo dizer "não respondeu", e `indisponibilidades`
   virando uma view por compatibilidade enquanto o motor, a ponte, o cron e
   as três telas migram.

   ROLLBACK
     Copiar `eu_responder` e `eu_indisponibilidade` da 01 e `eu_disponibilidade`
     da 05 por cima, e `drop function eu_marcar_dia(uuid, date, boolean);`.
     O backfill não precisa ser desfeito: deixar as duas tabelas de acordo é
     correto com qualquer versão das funções.

   VERIFICAÇÃO DEPOIS DE APLICAR
     select * from testar_permissoes();
     select * from schema_versao_conferir();
   ============================================================================= */
