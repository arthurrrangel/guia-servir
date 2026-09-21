-- =========================================================================
-- 76 · A LISTA TELEFÔNICA SAÍA PELA REDE, E O PIN NÃO TINHA VOLTA
--
-- 21/09/2026. Nona rodada. Duas coisas, medidas num banco nascido do
-- repositório, e as duas são sobre o que a pessoa comum não tem como desfazer.
--
-- -------------------------------------------------------------------------
-- 1. `eu_quem_cobre` DEVOLVIA TELEFONE DE CULTO A TREZE DIAS
--
-- A função devolve NOME E TELEFONE dos colegas que poderiam cobrir a vaga
-- que a pessoa acabou de deixar. Ela existe para um momento: quem desmarca
-- em cima da hora ajuda a fechar o buraco que abriu. A tela sabe disso e só
-- chama quando faltam menos de 48h (`TARDIO = 48`, em
-- `app/eu/[token]/page.tsx`).
--
-- A função não olhava a data. Medido: escalei uma pessoa em todo culto
-- futuro, recusei um por um, e ela devolveu telefone em todos — inclusive
-- num culto a 13 dias:
--
--     culto de 2026-09-26 (faltam 5 dias)  -> 2 telefone(s)
--     culto de 2026-10-04 (faltam 13 dias) -> 2 telefone(s)
--
-- Quem tem um link pessoal colhe a lista telefônica da área inteira, um
-- domingo de cada vez, sem passar pela tela. É o mesmo formato da 71 e da
-- 75, e o terceiro caso desta forma nesta auditoria: regra de produto que
-- vive na TELA, função chamada pela REDE.
--
-- -------------------------------------------------------------------------
-- 2. UM PIN CRIADO POR ENGANO TRANCA A PESSOA PARA SEMPRE
--
-- `eu_trocar_pin` não pede o PIN antigo, e isso está CERTO: quem abriu a
-- página tem o link pessoal na mão, que é a credencial mais forte do
-- sistema; pedir o PIN antigo reconstruiria o gargalo que o PIN existe para
-- remover. O raciocínio está escrito na tela e continua valendo.
--
-- O que não existe é a volta. Reproduzido inteiro:
--
--     o marido da Maria abre o link dela e toca "Criar meu PIN"
--       eu_trocar_pin(token, '1234')        -> {"ok": true}
--
--     meses depois a Maria perde o link, vai em /servir/louvor, escolhe o
--     nome dela e digita os 4 ultimos digitos do proprio telefone:
--       equipe_pin_criar(...)               -> {"erro": "JA_TEM_PIN"}
--       a tela escreve: "Voce ja criou seu PIN. Entre com ele."
--
-- Ela nunca criou PIN nenhum. E não há saída:
--
--     UPDATE em voluntarios.pin_hash por `authenticated`  -> false
--     funções que limpam `pin_hash`                       -> 0
--
-- Não é só o caso do engano: é qualquer pessoa que esqueceu o PIN. Hoje o
-- sistema inteiro não tem como desfazer isso, e a frase da tela manda ela
-- fazer exatamente o que não vai funcionar.
--
-- POR QUE A SAÍDA É PELO ORGANIZADOR, E NÃO POR MAIS UMA PERGUNTA
--
-- A tentação é deixar `equipe_pin_criar` REDEFINIR quando a pessoa acerta os
-- 4 dígitos, já que é a mesma prova que ela pede para criar. Seria mais
-- fraco do que parece: hoje, quem adivinha os dígitos de alguém que JÁ tem
-- PIN recebe `JA_TEM_PIN` e nada mais. Abrir a redefinição ali entregaria o
-- token a quem adivinhou quatro dígitos — e quatro dígitos do telefone, numa
-- igreja, não são segredo.
--
-- O organizador já pode ler `voluntarios.token`, que é a credencial mais
-- forte, e já reenvia o link por aí. Limpar o PIN de alguém da própria área
-- não lhe dá nada que ele não tenha; só devolve à pessoa a porta que existia.
--
-- -------------------------------------------------------------------------
-- DOIS ACHADOS DA AUDITORIA QUE NÃO SE CONFIRMARAM, e ficam escritos:
--
--   · `eu_disponibilidade` aceitando dia que a grade nunca mostra: NÃO
--     acontece. A migração 65 já pôs a janela de ±400 dias. Medido:
--     14/03/2029 e 03/01/1999 foram os dois recusados, e nenhuma linha ficou
--     em `disponibilidade`.
--
--   · `eu_sexo` sobrescrevendo resposta já dada: acontece (era F, virou M
--     sem perguntar), mas TEM volta — `sexo` está no GRANT de UPDATE do
--     organizador, e a tela do Time edita. Fica como anotação, não como
--     migração: o que faz a 2 acima ser vermelha é justamente não ter volta.
-- =========================================================================

/* A TRANCA. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(76);
  end if;
end $tranca$;

CREATE OR REPLACE FUNCTION public.eu_quem_cobre(p_token text, p_culto_id uuid)
 RETURNS TABLE(nome text, telefone text, nivel text, disse_que_pode boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_eq uuid; v_fn uuid; v_data date; v_inicio time;
begin
  select v.id, v.equipe_id into v_id, v_eq
    from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  select c.data, c.inicio into v_data, v_inicio from cultos c where c.id = p_culto_id;
  if v_data is null then return; end if;

  /* ============================================================ 76 ======
     A JANELA DE 48 HORAS MORAVA SÓ NA TELA.

     Esta função devolve NOME E TELEFONE dos colegas que poderiam cobrir a
     vaga. Ela existe para um momento específico, e a tela sabe disso: ela só
     chama quando `horasAte(data) < 48`, porque quem desmarca em cima da hora
     ajuda a fechar o buraco que abriu. Fora dessa janela, a lista de
     telefones do time não é assunto de ninguém.

     A função não olhava a data. Medido em 21/09, num banco nascido do
     repositório: me escalei em todo culto futuro, recusei um por um, e ela
     devolveu os telefones inclusive de um culto a 13 DIAS. Quem tem um link
     pessoal colhe a lista telefônica da área inteira, um domingo de cada vez,
     sem passar pela tela.

     É o mesmo formato da 71 e da 75: a regra estava na TELA e a função é
     chamada pela rede. Terceiro caso desta forma nesta auditoria, e por isso
     a janela passa a ser a MESMA expressão dos dois lados — 18h quando o
     culto não tem hora cadastrada, igual a `horasAte` em
     `app/eu/[token]/page.tsx`.

     O limite de baixo é `current_date - 1` porque é até onde `eu_dados`
     devolve: a tela não consegue nem desenhar um culto mais velho que isso,
     então a função também não precisa responder por ele. */
  if v_data < current_date - 1 then return; end if;
  if (v_data + coalesce(v_inicio, time '18:00')) at time zone 'America/Sao_Paulo'
       - now() >= interval '48 hours' then
    return;
  end if;

  /* a vaga que ESTA pessoa deixou neste domingo */
  select e.funcao_id into v_fn
    from escalacoes e join funcoes f on f.id = e.funcao_id
   where e.culto_id = p_culto_id and e.voluntario_id = v_id
     and f.equipe_id = v_eq and e.status in ('recusado','furou')
   limit 1;
  if v_fn is null then return; end if;

  return query
  select v.nome, v.telefone, h.nivel::text,
         exists (select 1 from disponibilidade d
                  where d.voluntario_id = v.id and d.data = v_data and d.pode)
    from voluntarios v
    join habilidades h on h.voluntario_id = v.id and h.funcao_id = v_fn
   where v.equipe_id = v_eq and v.ativo and v.id <> v_id
     and h.nivel in ('titular','reserva')          -- aprendiz não cobre buraco
     and nullif(v.telefone,'') is not null
     /* fora quem avisou que não pode neste domingo */
     and not exists (select 1 from indisponibilidades i
                      where i.voluntario_id = v.id and i.data = v_data)
     /* fora quem já está escalado em outra função no mesmo domingo */
     and not exists (select 1 from escalacoes e2
                      join funcoes f2 on f2.id = e2.funcao_id and f2.simultanea
                     where e2.culto_id = p_culto_id and e2.voluntario_id = v.id
                       and e2.status <> 'recusado')
     /* A GUARDA QUE A 62 ACRESCENTA, E É A ÚNICA MUDANÇA DESTE CORPO.

        Fora quem RECUSOU ou FUROU qualquer posto deste culto. O filtro logo
        acima tira `recusado` da conta de "ocupação", e tem razão em tirar (um
        posto recusado é vaga, não ocupação), mas o efeito colateral era a
        PESSOA voltar a ficar disponível: quem recusou a FOTO deste domingo
        era oferecida para cobrir a PROJEÇÃO do mesmo domingo, com telefone e
        botão de WhatsApp.

        E ficava de cabeça para baixo: `furou` contava como ocupação (o filtro
        só tira `recusado`), então quem faltou era excluída e quem avisou que
        não pode era oferecida.

        `indisponibilidades`, no filtro de cima, não cobria isso, e é por isso
        que o defeito passou: a recusa pelo LINK do voluntário grava a
        indisponibilidade junto (`eu_responder`), mas a recusa DIGITADA PELA
        LÍDER na tela de Escala é `mudarStatus`, um update cru em `escalacoes`
        que não gera linha nenhuma lá. */
     and not exists (select 1 from escalacoes e3
                      join funcoes f3 on f3.id = e3.funcao_id and f3.equipe_id = v_eq
                     where e3.culto_id = p_culto_id and e3.voluntario_id = v.id
                       and e3.status in ('recusado','furou'))
   order by exists (select 1 from disponibilidade d
                     where d.voluntario_id = v.id and d.data = v_data and d.pode) desc,
            (h.nivel = 'titular') desc, v.nome
   limit 3;
end $function$

;

-- =========================================================================
-- A PORTA DE VOLTA DO PIN
--
-- `security definer` porque `pin_hash` não tem GRANT de UPDATE para
-- `authenticated` e não vai ter: é credencial, e a 52 a tirou de tudo de
-- propósito. A permissão fica escrita aqui, na primeira linha, como em
-- `criar_voluntario` (59) e `decidir_candidatura` (74).
--
-- Ela NÃO devolve o token. Limpar o PIN devolve à pessoa o caminho de
-- `/servir/<slug>`, onde ela prova os 4 dígitos do próprio telefone; o
-- organizador que quiser mandar o link manda pela tela do Time, que é outro
-- ato, visível, e já existia.
-- =========================================================================
create or replace function public.pin_limpar(p_voluntario uuid)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_eq uuid; v_nome text; v_tinha boolean;
begin
  select v.equipe_id, v.nome, v.pin_hash is not null
    into v_eq, v_nome, v_tinha
    from voluntarios v where v.id = p_voluntario;
  if v_eq is null then
    return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE');
  end if;
  if not lidera_equipe(v_eq) then
    return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO');
  end if;

  update voluntarios set pin_hash = null where id = p_voluntario;
  /* o contador de tentativas vai junto: quem acabou de ser destravado não
     pode encontrar a porta fechada pelo MUITAS_TENTATIVAS de ontem */
  delete from entrar_tentativas where voluntario_id = p_voluntario;

  return jsonb_build_object('ok', true, 'nome', v_nome, 'tinha_pin', v_tinha);
end $fn$;

revoke all on function public.pin_limpar(uuid) from public, anon;
grant execute on function public.pin_limpar(uuid) to authenticated;
comment on function public.pin_limpar(uuid) is
  'Apaga o PIN de alguem da propria area, para que a pessoa possa criar outro em /servir/<slug>. Existe porque um PIN criado por engano (ou esquecido) trancava a pessoa para sempre: `equipe_pin_criar` responde JA_TEM_PIN e nada no sistema limpava `pin_hash`. Nao devolve token: quem quer mandar o link manda pela tela do Time.';

do $reg$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (76, '76 · a lista de quem cobre tem janela de 48h', 'eu_quem_cobre',
           'interval ''48 hours'''),
      (76, '76 · e nao responde por culto velho', 'eu_quem_cobre',
           'v_data < current_date - 1'),
      (76, '76 · o PIN tem porta de volta', 'pin_limpar',
           'update voluntarios set pin_hash = null')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo)
      values (76, '76-a-lista-telefonica-saia-pela-rede-e-o-pin-nao-tinha-volta.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;

-- =========================================================================
-- CONFERÊNCIA
-- =========================================================================
do $conferir$
declare
  v_falhas text := ''; v_suf text; v_eq uuid; v_outra uuid;
  v_p uuid; v_v uuid; v_tok text; v_p2 uuid; v_v2 uuid;
  v_fn uuid; v_perto uuid; v_longe uuid; v_velho uuid;
  v_n int; v_r jsonb; v_lider text; v_jwt text; v_pl uuid;
  v_meu_perto boolean := false; v_meu_longe boolean := false; v_meu_velho boolean := false;
begin
  v_suf := substr(md5(random()::text || clock_timestamp()::text), 1, 8);

  /* cenário próprio: uma área com DOIS voluntários habilitados no mesmo
     posto, um culto a 12 horas, um a 13 dias e um de ontem */
  insert into equipes (nome, slug, ordem)
       values ('Conf76 ' || v_suf, 'conf76-' || v_suf, 9996) returning id into v_eq;
  insert into funcoes (equipe_id, nome, ordem, ativa, tipos)
       values (v_eq, 'POSTO 76', 1, true, array['domingo','follow']) returning id into v_fn;

  insert into pessoas (nome, telefone) values ('Conf76 A ' || v_suf, '21900760001') returning id into v_p;
  insert into voluntarios (equipe_id, pessoa_id, nome, telefone, conferido, ativo)
       values (v_eq, v_p, 'Conf76 A ' || v_suf, '21900760001', true, true)
    returning id, token into v_v, v_tok;
  insert into pessoas (nome, telefone) values ('Conf76 B ' || v_suf, '21900760002') returning id into v_p2;
  insert into voluntarios (equipe_id, pessoa_id, nome, telefone, conferido, ativo)
       values (v_eq, v_p2, 'Conf76 B ' || v_suf, '21900760002', true, true)
    returning id into v_v2;
  insert into habilidades (voluntario_id, funcao_id, nivel, confirmado)
       values (v_v, v_fn, 'titular', true), (v_v2, v_fn, 'titular', true);

  /* o organizador desta área de teste */
  insert into papeis (pessoa_id, papel, equipe_id) values (v_p, 'lider', v_eq);
  insert into lideres (email, equipe_id, pessoa_id)
       values ('conf76-' || v_suf || '@exemplo.invalido', v_eq, v_p);
  update pessoas set auth_email = 'conf76-' || v_suf || '@exemplo.invalido' where id = v_p;
  v_lider := 'conf76-' || v_suf || '@exemplo.invalido';
  v_jwt := json_build_object('email', v_lider, 'role', 'authenticated')::text;

  /* AS TRÊS DATAS: hoje (dentro das 48h por construção, qualquer que seja a
     hora do culto), daqui a 13 dias, e cinco dias atrás.

     REUSA o culto do dia quando já existe, em vez de inserir sempre. A
     primeira versão inseria direto e morria em `ux_cultos_data_regular` —
     que é o índice da 56 funcionando: culto regular é UM por data, da igreja
     inteira. A conferência não pode presumir um calendário vazio, e só apaga
     no fim o que ela mesma criou. */
  select id into v_perto from cultos where data = current_date and evento is null;
  if v_perto is null then
    insert into cultos (data, inicio) values (current_date, time '18:00') returning id into v_perto;
    v_meu_perto := true;
  end if;
  select id into v_longe from cultos where data = current_date + 13 and evento is null;
  if v_longe is null then
    insert into cultos (data, inicio) values (current_date + 13, time '18:00') returning id into v_longe;
    v_meu_longe := true;
  end if;
  select id into v_velho from cultos where data = current_date - 5 and evento is null;
  if v_velho is null then
    insert into cultos (data, inicio) values (current_date - 5, time '18:00') returning id into v_velho;
    v_meu_velho := true;
  end if;

  insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
       values (v_perto, v_fn, v_v, 'recusado', false, false),
              (v_longe, v_fn, v_v, 'recusado', false, false),
              (v_velho, v_fn, v_v, 'recusado', false, false);

  -- 1 · DENTRO da janela, a lista vem (senão o conserto quebrou o recurso)
  select count(*) into v_n from eu_quem_cobre(v_tok, v_perto);
  if v_n < 1 then
    v_falhas := v_falhas || format(
      E'\n  1. culto a 12h nao devolveu ninguem (%s): a janela ficou apertada demais', v_n);
  end if;

  -- 2 · FORA da janela, não vem nada. Era aqui que a lista vazava.
  select count(*) into v_n from eu_quem_cobre(v_tok, v_longe);
  if v_n > 0 then
    v_falhas := v_falhas || format(
      E'\n  2. culto a 13 dias devolveu %s telefone(s)', v_n);
  end if;

  -- 3 · e culto velho também não
  select count(*) into v_n from eu_quem_cobre(v_tok, v_velho);
  if v_n > 0 then
    v_falhas := v_falhas || format(
      E'\n  3. culto de 5 dias atras devolveu %s telefone(s)', v_n);
  end if;

  -- 4 · quem NÃO deixou vaga continua sem lista, que é a guarda que já havia
  update escalacoes set status = 'confirmado' where culto_id = v_perto and voluntario_id = v_v;
  select count(*) into v_n from eu_quem_cobre(v_tok, v_perto);
  if v_n > 0 then
    v_falhas := v_falhas || format(
      E'\n  4. quem NAO deixou vaga recebeu %s telefone(s)', v_n);
  end if;
  update escalacoes set status = 'recusado' where culto_id = v_perto and voluntario_id = v_v;

  -- =====================================================================
  -- 5 a 8 · A PORTA DE VOLTA DO PIN
  -- =====================================================================

  -- 5 · o cenário do engano, inteiro: alguém põe PIN pelo link
  v_r := eu_trocar_pin((select token from voluntarios where id = v_v2), '1234');
  if coalesce(v_r ->> 'ok', '') <> 'true' then
    v_falhas := v_falhas || format(E'\n  5. eu_trocar_pin parou de funcionar: %s', v_r::text);
  end if;
  v_r := equipe_pin_criar('conf76-' || v_suf, v_v2, '0002', '9876');
  if coalesce(v_r ->> 'erro', '') <> 'JA_TEM_PIN' then
    v_falhas := v_falhas || format(
      E'\n  5b. equipe_pin_criar devia responder JA_TEM_PIN e respondeu %s', v_r::text);
  end if;

  -- 6 · o organizador limpa, e agora ela consegue criar o dela
  set local role authenticated; perform set_config('request.jwt.claims', v_jwt, true);
  v_r := pin_limpar(v_v2);
  reset role;
  if coalesce(v_r ->> 'ok', '') <> 'true' or coalesce(v_r ->> 'tinha_pin', '') <> 'true' then
    v_falhas := v_falhas || format(E'\n  6. pin_limpar recusou para o proprio organizador: %s', v_r::text);
  end if;
  v_r := equipe_pin_criar('conf76-' || v_suf, v_v2, '0002', '9876');
  if coalesce(v_r ->> 'ok', '') <> 'true' then
    v_falhas := v_falhas || format(
      E'\n  6b. depois de limpar, ela AINDA nao consegue criar o PIN: %s', v_r::text);
  end if;

  -- 7 · e o organizador de OUTRA área não limpa o PIN de ninguém daqui
  insert into equipes (nome, slug, ordem)
       values ('Outra76 ' || v_suf, 'outra76-' || v_suf, 9997) returning id into v_outra;
  insert into pessoas (nome, telefone, auth_email)
       values ('Outro76 ' || v_suf, '21900760003', 'outro76-' || v_suf || '@exemplo.invalido')
    returning id into v_pl;
  insert into papeis (pessoa_id, papel, equipe_id) values (v_pl, 'lider', v_outra);
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('email', 'outro76-' || v_suf || '@exemplo.invalido',
                      'role', 'authenticated')::text, true);
  v_r := pin_limpar(v_v2);
  reset role;
  if coalesce(v_r ->> 'erro', '') <> 'SEM_PERMISSAO' then
    v_falhas := v_falhas || format(
      E'\n  7. organizador de OUTRA area limpou o PIN daqui: %s', v_r::text);
  end if;
  if (select pin_hash from voluntarios where id = v_v2) is null then
    v_falhas := v_falhas || E'\n  7b. e o PIN foi mesmo apagado por ele';
  end if;

  -- 8 · o visitante não chama isso de jeito nenhum
  if has_function_privilege('anon', 'pin_limpar(uuid)', 'execute') then
    v_falhas := v_falhas || E'\n  8. `anon` pode executar pin_limpar';
  end if;
  /* e ela não devolve token em caminho nenhum: é a linha que separa
     "destravar" de "entregar a credencial" */
  set local role authenticated; perform set_config('request.jwt.claims', v_jwt, true);
  v_r := pin_limpar(v_v2);
  reset role;
  if v_r::text like '%' || (select token from voluntarios where id = v_v2) || '%' then
    v_falhas := v_falhas || E'\n  8b. pin_limpar devolveu o TOKEN da pessoa na resposta';
  end if;

  -- limpeza
  delete from escalacoes where funcao_id = v_fn;
  delete from habilidades where funcao_id = v_fn;
  delete from entrar_tentativas where voluntario_id in (v_v, v_v2);
  delete from culto_obs where culto_id in (v_perto, v_longe, v_velho);
  if v_meu_perto then delete from cultos where id = v_perto; end if;
  if v_meu_longe then delete from cultos where id = v_longe; end if;
  if v_meu_velho then delete from cultos where id = v_velho; end if;
  delete from lideres where pessoa_id in (v_p, v_pl);
  delete from papeis where pessoa_id in (v_p, v_pl);
  delete from voluntarios where equipe_id in (v_eq, v_outra);
  delete from funcoes where equipe_id in (v_eq, v_outra);
  delete from pessoas where id in (v_p, v_p2, v_pl);
  delete from equipes where id in (v_eq, v_outra);

  if v_falhas <> '' then
    raise exception E'CONFERENCIA DA 76 REPROVOU:%s', v_falhas;
  end if;
  raise notice 'CONFERENCIA DA 76: 8/8. A lista de telefones so sai dentro das 48h, e o PIN tem porta de volta.';
end $conferir$;
