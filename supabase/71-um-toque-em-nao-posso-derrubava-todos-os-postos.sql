/* =============================================================================
   71 · UM TOQUE EM "NÃO POSSO" DERRUBAVA TODOS OS POSTOS DA PESSOA

   21/09/2026. Só de Escalas. Depende da 65.

   A tela do voluntário é a que MAIS gente da igreja toca: cada pessoa abre o
   link dela toda semana. Esta é a primeira auditoria que andou a tela inteira,
   no navegador, contra um banco de verdade.

   -------------------------------------------------------------------------
   1 · A TELA RESPONDE POR POSTO. A FUNÇÃO RESPONDIA PELO DIA.

   `app/eu/[token]/page.tsx` desenha UM CARTÃO POR POSTO, cada um com "Eu vou"
   e "Não posso". `eu_responder` atualizava por `culto_id`, sem `funcao_id`.

   Medido num banco nascido do repositório, com FOTO e EDIÇÃO no mesmo domingo
   (o motor produz isso: `fn_conflito_simultaneo` só barra dois postos
   `simultanea`, e EDIÇÃO não é):

     ANTES:           [{"EDIÇÃO": "pendente"}, {"FOTO": "confirmado"}]
     >>> ela toca "Não posso" NO CARTÃO DA EDIÇÃO
     DEPOIS:          [{"EDIÇÃO": "recusado"}, {"FOTO": "recusado"}]
     >>> e agora "Consegui, posso sim" só na EDIÇÃO
     DEPOIS DA VOLTA: [{"EDIÇÃO": "confirmado"}, {"FOTO": "confirmado"}]

   Ela recusou um posto e perdeu os dois: a líder vê duas vagas e remaneja
   gente que não precisava. E o caminho de volta é pior — um toque
   RECONFIRMA um posto que ela tinha recusado de propósito, e ela aparece
   escalada num lugar onde disse que não podia.

   -------------------------------------------------------------------------
   2 · E O DIA SAÍA DA ÚLTIMA TECLA, NÃO DO ESTADO DELA

   `eu_marcar_dia(..., p_status = 'confirmado')`: recusar UM posto marcava o
   DIA inteiro como indisponível, mesmo com ela confirmada em outro. O motor
   então a tirava de um domingo em que ela tinha dito que ia.

   A pergunta certa não é "o que ela acabou de teclar" e sim "depois desta
   resposta, ela ainda vem neste dia?".

   -------------------------------------------------------------------------
   3 · A TERCEIRA TABELA QUE RESPONDE A MESMA PERGUNTA

   A 65 se chama "as duas tabelas que respondem a mesma pergunta" e conciliou
   `disponibilidade` com `indisponibilidades`. Sobrou a terceira:
   `escalacoes.status`.

   Medido: a pessoa confirma o domingo mais próximo e muda de ideia. O cartão
   "Sua próxima escala" não tem botão de desmarcar (a tela põe "Não vou mais
   poder" só na lista "Depois disso", e `restantes` exclui `proxima`), então o
   único caminho que sobra é a grade "Quando você pode". Ela toca "Não".

     escalacoes.status = 'confirmado'   E   indisponibilidades = 1

   ao mesmo tempo, e a tela mostra as duas coisas fielmente. Ela acredita que
   avisou. A líder tem uma pessoa confirmada que não vai.

   `eu_indisponibilidade` sincroniza a escalação desde o primeiro dia, com o
   comentário "avisa o líder na hora" — e NÃO TEM UM ÚNICO CHAMADOR no
   produto. A função que a tela usa de verdade é `eu_disponibilidade`, e ela
   não sincronizava.

   -------------------------------------------------------------------------
   4 · EVENTO ESPORÁDICO APARECIA COMO "DOMINGO"

   `eu_dados` não devolvia `evento` nem `inicio`, e `diaLongo`, na tela, chama
   de "domingo" tudo que não é sábado. `criar_evento` SÓ aceita dia que não é
   domingo nem sábado de Follow — então TODO evento, por construção, aparecia
   para quem serve nele como "domingo", com a hora do domingo no lembrete do
   calendário (`.ics` com `DTSTART` às 10h BRT para um evento das 19:30).

   Medido: evento da Mídia numa QUARTA, 07/10. A tela da voluntária disse
   "domingo, 7 de outubro", e o nome do evento não aparece em lugar nenhum. É
   a pessoa indo no dia errado. A tela da líder acerta desde a 54.

   -------------------------------------------------------------------------
   5 · O SEGUNDO LÍDER DO DIA APAGAVA O RELATÓRIO DO PRIMEIRO

   `culto_obs` tem UMA linha por (culto, equipe), e o Connect tem DOIS postos
   que relatam (LÍDER 1 e LÍDER 2, migração 12). Medido: a Ana escreve, o Caio
   abre a tela dele e encontra o texto DELA dentro da caixa dele, sob o rótulo
   "Relatório enviado", com o botão "Atualizar relatório". Nada diz de quem é.
   Ele escreve o dele e some o dela — junto com "bebedouro vazando", que era a
   manutenção que ninguém mais ia ver.

   Este arquivo dá à tela o que ela precisa para dizer de quem é o texto
   (`relatado_por`, `relatado_eu`); a frase é do commit que muda a tela.

   -------------------------------------------------------------------------
   O QUE MUDA NA ASSINATURA, E POR QUE NÃO QUEBRA DEPLOY

   `eu_responder` ganha uma versão de QUATRO argumentos. A de três continua
   existindo e passa a delegar — ela quer dizer "respondo pelo dia inteiro",
   que é uma resposta legítima. As duas são distinguíveis sem ambiguidade
   (aridade diferente, sem `default`), então o app velho continua funcionando
   entre a migração e o deploy.

   `eu_dados` NÃO muda de assinatura: as chaves novas entram dentro do `jsonb`
   de `escalas`, que é o motivo de ela ter sido escrita assim.
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(71);
  end if;
end $tranca$;

CREATE OR REPLACE FUNCTION public.eu_responder(p_token text, p_culto_id uuid, p_status text, p_funcao_id uuid)
 RETURNS void
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
    /* nada seu neste culto: não é erro da pessoa, e não há dia para marcar */
    return;
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
end $function$;

revoke all on function public.eu_responder(text, uuid, text, uuid) from public;
grant execute on function public.eu_responder(text, uuid, text, uuid) to anon, authenticated;
comment on function public.eu_responder(text, uuid, text, uuid) is
  'O voluntario responde a UM POSTO pelo link dele. Desde a 71: a tela desenha um cartao por posto, entao a resposta e por posto — antes um toque em "Nao posso" derrubava todos os postos dela naquele domingo. O dia so vira indisponivel quando nao sobra nenhum posto dela sem recusa.';

/* A DE TRÊS ARGUMENTOS CONTINUA, E QUER DIZER OUTRA COISA.

   "Respondo pelo dia inteiro" é uma resposta legítima, e é o que ela sempre
   quis dizer. Ela passa a delegar para a de quatro com o posto nulo, que é
   exatamente o comportamento antigo — agora com a conta do dia certa. Manter
   as duas é o que faz o app de ontem continuar funcionando entre a migração e
   o deploy: aridade diferente, sem `default`, sem ambiguidade. */
create or replace function public.eu_responder(p_token text, p_culto_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $fn$
begin
  perform public.eu_responder(p_token, p_culto_id, p_status, null::uuid);
end $fn$;
revoke all on function public.eu_responder(text, uuid, text) from public;
grant execute on function public.eu_responder(text, uuid, text) to anon, authenticated;
comment on function public.eu_responder(text, uuid, text) is
  'Responde pelo DIA inteiro. Desde a 71 delega para eu_responder(...,p_funcao_id) com posto nulo. Quem responde por POSTO e a versao de quatro argumentos, que e a que a tela usa.';

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

  if    p_resposta = 'posso'  then perform eu_marcar_dia(v_id, p_data, true);
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
end $function$;
CREATE OR REPLACE FUNCTION public.eu_dados(p_token text)
 RETURNS TABLE(nome text, equipe text, escalas jsonb, indisponivel jsonb, disponivel jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_nome text; v_eq uuid; v_eqnome text;
begin
  select v.id, v.nome, v.equipe_id into v_id, v_nome, v_eq
    from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;
  select e.nome into v_eqnome from equipes e where e.id = v_eq;

  return query select v_nome, coalesce(v_eqnome,'Escala'),
    coalesce((select jsonb_agg(x order by x->>'data') from (
        select jsonb_build_object('culto_id',c.id,'data',c.data,'funcao',f.nome,'status',e.status,
                 /* 71 · `funcao_id`: sem ele a tela não tem como responder POR
                    POSTO, e um toque em "Não posso" derrubava todos os postos
                    da pessoa naquele domingo. */
                 'funcao_id',f.id,
                 /* 71 · `evento` e `inicio`: a tela do voluntário não sabia que
                    evento esporádico existe. `diaLongo` chama de "domingo" tudo
                    que não é sábado, e `criar_evento` SÓ aceita dia que não é
                    domingo nem sábado de Follow — então TODO evento aparecia
                    como "domingo" para quem serve nele, com a hora do domingo
                    no lembrete do calendário. É a pessoa indo no dia errado.
                    A tela da líder já mostra o nome do evento desde a 54. */
                 'evento',c.evento,
                 'inicio',c.inicio,
                 /* 71 · de quem é o relatório que está no campo. `culto_obs` tem
                    UMA linha por (culto, equipe), e o Connect tem DOIS postos
                    que relatam: o segundo líder abria a tela, encontrava o
                    texto do primeiro dentro da caixa dele sob o rótulo
                    "Relatório enviado", escrevia o dele, e o do primeiro sumia
                    junto com os problemas que ele tinha anotado. */
                 'relatado_por',(select vr.nome from culto_obs o
                                   join voluntarios vr on vr.id = o.relatado_por
                                  where o.culto_id=c.id and o.equipe_id=v_eq),
                 'relatado_eu',(select o.relatado_por = v_id from culto_obs o
                                 where o.culto_id=c.id and o.equipe_id=v_eq),
                 'primeira_vez',e.primeira_vez,
                 'escalado_em',e.escalado_em,
                 'obs',(select o.obs from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'relata', f.relata,
                 'relatorio',(select o.relatorio from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'problemas',(select o.problemas from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'plantao',false) as x
          from escalacoes e join cultos c on c.id=e.culto_id join funcoes f on f.id=e.funcao_id
         where e.voluntario_id = v_id and c.data >= current_date - 1
        union all
        select jsonb_build_object('culto_id',c.id,'data',c.data,'funcao','PLANTAO','status','pendente',
                 'funcao_id',null,'evento',c.evento,'inicio',c.inicio,
                 'relatado_por',null,'relatado_eu',null,
                 'primeira_vez',false,
                 'escalado_em',null,
                 'obs',(select o.obs from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'relata', false, 'relatorio', null, 'problemas', null,
                 'plantao',true)
          from plantoes p join cultos c on c.id=p.culto_id
         where p.voluntario_id = v_id and c.data >= current_date - 1) t), '[]'::jsonb),
    coalesce((select jsonb_agg(i.data order by i.data) from indisponibilidades i
               where i.voluntario_id = v_id and i.data >= current_date), '[]'::jsonb),
    coalesce((select jsonb_agg(d.data order by d.data) from disponibilidade d
               where d.voluntario_id = v_id and d.pode = true and d.data >= current_date), '[]'::jsonb);
end $function$;

revoke all on function public.eu_disponibilidade(text, date, text) from public;
grant execute on function public.eu_disponibilidade(text, date, text) to anon, authenticated;
revoke all on function public.eu_dados(text) from public;
grant execute on function public.eu_dados(text) to anon, authenticated;

do $reg$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (71, '71 · eu_responder responde por posto', 'eu_responder',
           'p_funcao_id is null or funcao_id = p_funcao_id'),
      (71, '71 · o dia sai do estado de todos os postos', 'eu_responder',
           'not in (''recusado'',''furou'')'),
      (71, '71 · eu_disponibilidade sincroniza a escalacao', 'eu_disponibilidade',
           'set status = ''recusado'''),
      (71, '71 · eu_dados devolve o posto, o evento e a hora', 'eu_dados', '''evento'',c.evento')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;

  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo)
      values (71, '71-um-toque-em-nao-posso-derrubava-todos-os-postos.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;


-- =========================================================================
-- A CONFERÊNCIA
-- =========================================================================

do $conf$
declare
  v_eq uuid; v_f1 uuid; v_f2 uuid; v_p uuid; v_vol uuid; v_tok text;
  v_dia date; v_culto uuid; v_ev uuid; v_dia_ev date; v_txt text; v_n int;
  ok int := 0; falhou int := 0; msg text := ''; v_meu_culto boolean := false;
begin
  select id into v_eq from equipes where slug = 'midia';
  if v_eq is null then raise notice '71 · PULEI: base sem a equipe de exemplo.'; return; end if;

  insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
       values (v_eq, 'CONF71 A', 971, true, false, array['domingo']) returning id into v_f1;
  insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
       values (v_eq, 'CONF71 B', 972, true, false, array['domingo']) returning id into v_f2;
  insert into pessoas (nome, telefone) values ('Conf71', '21999997101') returning id into v_p;
  insert into voluntarios (equipe_id, pessoa_id, nome, telefone, conferido, ativo)
       values (v_eq, v_p, 'Conf71', '21999997101', true, true) returning id, token into v_vol, v_tok;

  v_dia := (current_date + 7)::date;
  while extract(dow from v_dia) <> 0 loop v_dia := v_dia + 1; end loop;
  /* REUSA o domingo que já está no calendário; só cria quando não há, e
     nesse caso a limpeza o apaga. Culto regular criado e deixado para trás é
     um domingo fantasma no calendário da igreja inteira. */
  select id into v_culto from cultos where data = v_dia and evento is null;
  if v_culto is null then
    insert into cultos (data) values (v_dia) returning id into v_culto;
    v_meu_culto := true;
  end if;
  insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
       values (v_culto, v_f1, v_vol, 'confirmado', false, false),
              (v_culto, v_f2, v_vol, 'pendente',   false, false);

  /* ---- 1. recusar UM posto mexe SÓ nele ------------------------------- */
  perform eu_responder(v_tok, v_culto, 'recusado', v_f2);
  select status::text into v_txt from escalacoes where culto_id = v_culto and funcao_id = v_f1;
  if v_txt = 'confirmado' then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || format(E'\n  x recusar o posto B derrubou o posto A junto (A virou %s)', v_txt);
  end if;
  select status::text into v_txt from escalacoes where culto_id = v_culto and funcao_id = v_f2;
  if v_txt = 'recusado' then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || format(E'\n  x o posto recusado nao virou recusado (virou %s)', v_txt);
  end if;

  /* ---- 2. e o DIA continua disponível, porque ela ainda vem ----------- */
  select count(*) into v_n from indisponibilidades where voluntario_id = v_vol and data = v_dia;
  if v_n = 0 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x recusar UM posto marcou o DIA inteiro como indisponivel, com ela confirmada no outro';
  end if;

  /* ---- 3. recusando o outro também, aí sim o dia fecha ---------------- */
  perform eu_responder(v_tok, v_culto, 'recusado', v_f1);
  select count(*) into v_n from indisponibilidades where voluntario_id = v_vol and data = v_dia;
  if v_n = 1 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x com TODOS os postos recusados, o dia devia virar indisponivel e nao virou';
  end if;

  /* ---- 4. e confirmar de volta um posto reabre o dia ------------------ */
  perform eu_responder(v_tok, v_culto, 'confirmado', v_f1);
  select count(*) into v_n from indisponibilidades where voluntario_id = v_vol and data = v_dia;
  select status::text into v_txt from escalacoes where culto_id = v_culto and funcao_id = v_f2;
  if v_n = 0 and v_txt = 'recusado' then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || format(E'\n  x confirmar o posto A reconfirmou o B (B=%s) ou nao reabriu o dia (indisp=%s)', v_txt, v_n);
  end if;

  /* ---- 5. a de TRÊS argumentos continua respondendo pelo dia ---------- */
  perform eu_responder(v_tok, v_culto, 'confirmado');
  select count(*) into v_n from escalacoes
   where culto_id = v_culto and voluntario_id = v_vol and status = 'confirmado';
  if v_n = 2 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || format(E'\n  x a versao de tres argumentos deixou de responder pelo dia inteiro (%s de 2)', v_n);
  end if;

  /* ---- 6. A TERCEIRA RESPOSTA: dizer "nao" na grade derruba a escala -- */
  perform eu_disponibilidade(v_tok, v_dia, 'nao');
  select count(*) into v_n from escalacoes
   where culto_id = v_culto and voluntario_id = v_vol and status = 'recusado';
  if v_n = 2 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || format(E'\n  x ela disse "nao posso" na grade e continuou CONFIRMADA na escala (%s de 2 recusadas)', v_n);
  end if;

  /* ---- 7. eu_dados devolve o posto, o evento e a hora ----------------- */
  v_dia_ev := (current_date + 30)::date;
  while extract(dow from v_dia_ev) in (0, 6) loop v_dia_ev := v_dia_ev + 1; end loop;
  insert into cultos (data, evento, equipe_id, inicio)
       values (v_dia_ev, 'Conf71 Evento', v_eq, time '19:30') returning id into v_ev;
  insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
       values (v_ev, v_f1, v_vol, 'pendente', false, false);

  select count(*) into v_n from eu_dados(v_tok) d,
       lateral jsonb_array_elements(d.escalas) x
   where (x ->> 'culto_id')::uuid = v_ev
     and x ->> 'evento' = 'Conf71 Evento'
     and x ->> 'inicio' = '19:30:00'
     and (x ->> 'funcao_id')::uuid = v_f1;
  if v_n = 1 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x eu_dados nao devolve evento/inicio/funcao_id: a tela chama o evento de "domingo" e manda a hora errada';
  end if;

  /* ---- 8. e diz de quem é o relatório ---------------------------------

     O RELATÓRIO É ESCRITO NO EVENTO DESTE CENÁRIO, E NÃO NO DOMINGO REAL.

     A primeira versão chamava `eu_relatorio(v_tok, v_culto, ...)`, e `v_culto`
     é o PRÓXIMO DOMINGO DA IGREJA — a linha real. `eu_relatorio` é um upsert
     em `culto_obs (culto_id, equipe_id)`, e essa é exatamente a linha onde
     `salvar_dia` guarda a anotação da líder daquele dia. A limpeza logo
     abaixo apagava a linha inteira.

     Medido em 21/09, com a anotação "Chegar 30min antes, o telão novo
     precisa de teste." no domingo da Mídia:

         ANTES  -> "Chegar 30min antes, o telao novo precisa de teste."
         DEPOIS -> <<SUMIU>>

     E o pior é quando: o bloco inteiro é uma instrução só, então o `raise`
     do caminho de REPROVA desfaz tudo. Os deletes só commitam no caminho de
     SUCESSO. Este arquivo destruía dado real exatamente quando dizia 8/8.

     A regra está escrita na 72: "um teste que suja o banco que ele deveria
     proteger é pior que teste nenhum." Eu escrevi essa frase um arquivo
     depois de quebrá-la aqui.

     `v_ev` é o evento que esta conferência criou dez linhas acima, e ela já
     o apaga por id no fim. A escalação dele é `pendente`, que é o que
     `eu_relatorio` aceita. */
  update funcoes set relata = true where id = v_f1;
  perform eu_relatorio(v_tok, v_ev, 'texto da conf71', null);
  select count(*) into v_n from eu_dados(v_tok) d,
       lateral jsonb_array_elements(d.escalas) x
   where (x ->> 'culto_id')::uuid = v_ev
     and x ->> 'relatado_por' = 'Conf71'
     and (x ->> 'relatado_eu')::boolean;
  if v_n >= 1 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x eu_dados nao diz de quem e o relatorio: o segundo lider do dia sobrescreve o do primeiro sem saber';
  end if;

  /* ---- limpeza, POR ID -------------------------------------------------

     `culto_obs` do DOMINGO REAL fica de fora: esta conferência não escreve
     mais lá (ver o caso 8), e apagar a linha que `salvar_dia` mantém levaria
     junto a anotação da líder. Só sai o que este bloco criou. */
  delete from culto_obs where culto_id = v_ev and equipe_id = v_eq;
  delete from escalacoes where culto_id in (v_culto, v_ev) and voluntario_id = v_vol;
  delete from disponibilidade where voluntario_id = v_vol;
  delete from indisponibilidades where voluntario_id = v_vol;
  delete from habilidades where voluntario_id = v_vol;
  delete from voluntarios where id = v_vol;
  delete from pessoas where id = v_p;
  delete from cultos where id = v_ev;
  if v_meu_culto then delete from cultos where id = v_culto; end if;
  delete from funcoes where id in (v_f1, v_f2);

  if falhou > 0 then
    raise exception 'A CONFERENCIA DA 71 REPROVOU: % de % casos', falhou, ok + falhou
      using detail = msg, errcode = 'raise_exception';
  end if;
  raise notice '71 · conferencia: %/% casos. A resposta e por POSTO, o dia sai do estado de todos eles, a grade derruba a escala junto, e a tela recebe evento, hora e autor do relatorio.', ok, ok;
end $conf$;


/* =============================================================================
   ROLLBACK
     `drop function eu_responder(text, uuid, text, uuid);` e copiar os corpos de
     `eu_responder`, `eu_disponibilidade` (migração 65) e `eu_dados`
     (migração 38) por cima.
   ============================================================================= */
