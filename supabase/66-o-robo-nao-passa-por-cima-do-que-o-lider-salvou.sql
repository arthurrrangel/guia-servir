/* =============================================================================
   66 · O ROBÔ NÃO PASSA POR CIMA DO QUE O LÍDER ACABOU DE SALVAR

   21/09/2026. Só de Escalas. Depende da 61.

   -------------------------------------------------------------------------
   O DEFEITO, E POR QUE O PRÓPRIO ARQUIVO QUE O CONTÉM JÁ TINHA AVISADO

   `app/api/cron/route.ts:297-322` escreve, em letras garrafais, por que o
   robô pode usar `salvar_dia` (que apaga e regrava) enquanto a tela usa a
   gravação cirúrgica de `lib/db.ts`:

       "A divergência é segura por UM motivo, e só por ele: o laço acima só
        chega aqui quando `montados.length === 0` [...] Não há o que
        preservar, então diferença e wipe-and-write dão o mesmo resultado."

   O raciocínio está certo sobre o INSTANTE da leitura, e é aí que ele falha:
   `montados` é calculado com a foto tirada antes, e o `salvar_dia` do último
   dia acontece muito depois. No meio passam `gerarMes` e um ida-e-volta ao
   banco POR DIA, em série.

   -------------------------------------------------------------------------
   MEDIDO — NÃO DEDUZIDO

   Auditoria de 21/09/2026, com um arnês que roda a rota de verdade contra um
   banco nascido das 65 migrações:

     mês de outubro zerado. Dia 2026-10-18 -> (vazio)
     >> no meio do robô, o líder salvou pela tela:
        BATERIA = Bianca Caffaro / confirmado / TRAVADO

     HTTP 200 | resumo Louvor: {"equipe":"Louvor","vagas":8}
     falhas: []
     e-mail ao líder: ["Louvor"]   ("escala de outubro montada")

     DEPOIS do robô, 2026-10-18 ->
        BATERIA = Susanne Rangel / pendente
        ROADIE  = Bianca Caffaro / pendente

   Uma linha `fixo = true, status = 'confirmado'` — travada E confirmada, que
   é a promessa de "não mexe" — foi substituída por outra pessoa, em
   `pendente`. Sem erro, sem aviso, e com um e-mail dizendo que deu tudo
   certo. Não fica registro nenhum de que algo foi destruído.

   Largura da janela, medida com o estado real do Louvor (10 postos, 12
   pessoas, 8 domingos):

     gerarMes (puro CPU)                 206 ms
     8 chamadas de salvar_dia, em SÉRIE  ~640 ms com RTT de 80 ms
     janela total                        ~846 ms

   Para o Connect (18 postos) é maior; o próprio route.ts registra `gerarMes`
   medido em 6,5 s num caso de 40 postos.

   -------------------------------------------------------------------------
   E A HORA NÃO É 3 DA MANHÃ

   Seis comentários deste repositório dizem "o robô das 3h". `vercel.json`
   agenda `0 12 * * *`, e a Vercel agenda em UTC: são 09:00 em Brasília. O
   cabeçalho do próprio route.ts (linha 5) diz 09:00 e está certo.

   Isso não é briga de comentário. "Ninguém está no app às 3 da manhã" era o
   argumento implícito de que esta corrida não acontece. Às 9h do dia 26, que
   é quando o robô monta o mês, o líder ESTÁ no app — provavelmente montando
   o mês, que é a coisa que ele faz no dia 26. Os comentários são corrigidos
   no mesmo commit.

   -------------------------------------------------------------------------
   POR QUE A GUARDA VAI NO BANCO, E NÃO NA ROTA

   Porque na rota ela seria mais uma conferência ANTES, com a mesma janela
   depois. Dentro de `salvar_dia` ela é conferida na mesma transação que
   escreve: entre conferir e gravar não existe instante nenhum.

   A condição é idêntica à que a rota usa em `montados`: escalação desta
   equipe COM voluntário. Vaga sem gente não conta lá e não conta aqui — se
   contasse, o robô recusaria dias que ele deve montar.

   O QUE ISSO CUSTA: o robô recusa aquele dia em vez de sobrescrevê-lo. O
   erro entra em `errosDoDia`, o líder é avisado, e o dia fica com o que ELE
   pôs. É o resultado que a igreja quer nos dois casos.

   -------------------------------------------------------------------------
   O QUE ESTE ARQUIVO NÃO RESOLVE

   O mês fica pela metade quando um dia é recusado, e na execução seguinte
   `decisaoDoRobo` responde 'parcial' e o robô não completa. Isso é certo (ele
   re-sortearia o que o líder pôs à mão), mas o dia recusado depende de
   alguém abrir o app. A cobrança de quinta passa a enxergar esse estado — é
   a outra metade desta correção, e ela mora em `app/api/cron/route.ts`, no
   mesmo commit.
   ============================================================================= */


-- =========================================================================
-- `salvar_dia` com a guarda. Corpo extraído do banco (versão da migração 61),
-- com SETE linhas de código a mais e nada removido.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.salvar_dia(p_equipe uuid, p_data date, p_obs text, p_slots jsonb, p_plantao uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_culto uuid; r record;
begin
  if p_equipe is null then raise exception 'salvar_dia sem ministerio'; end if;

  /* ---- AS SEIS ÚNICAS LINHAS QUE ESTA MIGRAÇÃO MUDA (61) --------------

     O EVENTO DESTA EQUIPE VEM PRIMEIRO. Sem esta busca, uma data que tem
     evento e não tem culto regular não conflitava com o índice parcial, e o
     `insert` abaixo criava uma SEGUNDA linha regular naquela data — culto
     fantasma, escala gravada no lugar errado, e a tela do líder travada
     naquele dia por `.maybeSingle()` recebendo duas linhas. */
  select c.id into v_culto
    from cultos c
   where c.data = p_data and c.evento is not null and c.equipe_id = p_equipe
   order by c.id
   limit 1;

  if v_culto is null then
    insert into cultos (data) values (p_data)
      on conflict (data) where evento is null do update set data = excluded.data
      returning id into v_culto;
    if v_culto is null then
      select id into v_culto from cultos where data = p_data and evento is null;
    end if;
  end if;

  /* ===================================================================
     66 · A ÚNICA ADIÇÃO DESTE ARQUIVO: A JANELA ENTRE LER E ESCREVER.

     `salvar_dia` APAGA a escala da equipe naquele culto e regrava. O robô
     (`app/api/cron/route.ts:328`) é o único chamador, e ele só chega aqui
     depois de decidir que NENHUM dia do mês tem gente (`decisaoDoRobo`). O
     comentário da rota diz, com todas as letras, que a gravação por cima só
     é segura por causa dessa decisão.

     O furo é que a decisão foi tomada ANTES. Entre a leitura do estado e o
     `salvar_dia` do último dia passam `gerarMes` (medido: 206 ms no Louvor,
     6,5 s num caso de 40 postos) e um ida-e-volta ao banco POR DIA, em
     série. Medido no Louvor: ~850 ms de janela. Quem salvar pela tela dentro
     dela é apagado, e a rota responde HTTP 200 com zero falhas — inclusive
     quando a linha apagada estava `fixo = true` e `confirmado`, que é a
     promessa de "não mexe".

     E a janela não cai às 3 da manhã, como seis comentários deste
     repositório diziam: `vercel.json` agenda `0 12 * * *`, que é 09:00 em
     Brasília. Às 9h do dia 26 o líder ESTÁ no app.

     A guarda vai aqui dentro, e não na rota, porque aqui ela é conferida
     DENTRO da transação que escreve: não existe janela entre conferir e
     gravar. A condição é idêntica à que a rota usa (`montados`): escalação
     desta equipe COM voluntário. Vaga sem gente não conta, igual lá.

     Consequência assumida: o robô passa a recusar o dia em vez de
     sobrescrevê-lo, o erro entra em `errosDoDia`, e o líder é avisado. O dia
     fica com o que ELE pôs, que é o que ele queria.
     =================================================================== */
  if exists (select 1 from escalacoes e
               join funcoes f on f.id = e.funcao_id
              where e.culto_id = v_culto and f.equipe_id = p_equipe
                and e.voluntario_id is not null) then
    raise exception 'Alguem montou % enquanto eu trabalhava, e eu nao passo por cima: o dia ficou como essa pessoa deixou.', p_data
      using errcode = 'raise_exception';
  end if;

  insert into culto_obs (culto_id, equipe_id, obs)
    values (v_culto, p_equipe, coalesce(p_obs, ''))
  on conflict (culto_id, equipe_id) do update set obs = excluded.obs;

  for r in
    select (x ->> 'funcao_id')::uuid fid,
           (x ->> 'voluntario_id')::uuid vid,
           coalesce(x ->> 'status', 'pendente')::status_escala st,
           coalesce((x ->> 'fixo')::boolean, false) fx,
           coalesce((x ->> 'primeira_vez')::boolean, false) pv
      from jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) x
  loop
    if not exists (select 1 from funcoes where id = r.fid and equipe_id = p_equipe) then
      raise exception 'funcao de outro ministerio'; end if;
    if not exists (select 1 from voluntarios where id = r.vid and equipe_id = p_equipe) then
      raise exception 'voluntario de outro ministerio'; end if;

    insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
      values (v_culto, r.fid, r.vid, r.st, r.fx, r.pv)
    on conflict (culto_id, funcao_id) do update
      set voluntario_id = excluded.voluntario_id,
          fixo          = excluded.fixo,
          primeira_vez  = excluded.primeira_vez,
          status        = case when escalacoes.voluntario_id is distinct from excluded.voluntario_id
                               then excluded.status else escalacoes.status end,
          respondido_em = case when escalacoes.voluntario_id is distinct from excluded.voluntario_id
                               then null else escalacoes.respondido_em end;
  end loop;

  delete from escalacoes e using funcoes f
   where f.id = e.funcao_id and e.culto_id = v_culto and f.equipe_id = p_equipe
     and not exists (select 1 from jsonb_array_elements(coalesce(p_slots,'[]'::jsonb)) x
                      where (x ->> 'funcao_id')::uuid = e.funcao_id);

  delete from plantoes p using voluntarios v
   where p.voluntario_id = v.id and p.culto_id = v_culto and v.equipe_id = p_equipe
     and not (p.voluntario_id = any (coalesce(p_plantao, '{}'::uuid[])));

  insert into plantoes (culto_id, voluntario_id)
  select v_culto, v.id from unnest(coalesce(p_plantao, '{}'::uuid[])) x
    join voluntarios v on v.id = x and v.equipe_id = p_equipe
  on conflict do nothing;

  return v_culto;
end $function$;

revoke all on function public.salvar_dia(uuid, date, text, jsonb, uuid[]) from public;
comment on function public.salvar_dia(uuid, date, text, jsonb, uuid[]) is
  'Grava o dia inteiro de UMA equipe, apagando e regravando. Unico chamador: o robo (app/api/cron/route.ts). Desde a 66 RECUSA o dia que ja tem escalacao com voluntario daquela equipe: a decisao de que o dia estava vazio e tomada segundos antes, e a janela entre as duas ja apagou linha travada e confirmada.';


-- =========================================================================
-- REGISTRO NA RÉGUA E NA SONDA
-- =========================================================================

do $reg$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (66, '66 · salvar_dia recusa dia que ja tem gente', 'salvar_dia',
           'Alguem montou % enquanto eu trabalhava')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;

  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo)
      values (66, '66-o-robo-nao-passa-por-cima-do-que-o-lider-salvou.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;


-- =========================================================================
-- A CONFERÊNCIA
--
-- Cinco casos, e os dois últimos existem porque uma guarda mal calibrada
-- estraga mais do que conserta: se ela contasse VAGA, o robô recusaria dias
-- que ele deve montar; se fosse por culto e não por equipe, o Louvor
-- bloquearia a Mídia no mesmo domingo.
-- =========================================================================

do $conf$
declare
  v_eq uuid; v_eq2 uuid; v_f1 uuid; v_f2 uuid; v_v1 uuid; v_v2 uuid;
  v_p1 uuid; v_p2 uuid; v_dia date; v_culto uuid; v_n int; v_id uuid;
  ok int := 0; falhou int := 0; msg text := '';
begin
  v_dia := (current_date + 40)::date;

  insert into equipes (nome, slug, ordem) values ('Conf66 A','conf66a',9980) returning id into v_eq;
  insert into equipes (nome, slug, ordem) values ('Conf66 B','conf66b',9981) returning id into v_eq2;
  insert into funcoes (equipe_id, nome, ordem, ativa) values (v_eq,'P66A',1,true) returning id into v_f1;
  insert into funcoes (equipe_id, nome, ordem, ativa) values (v_eq2,'P66B',1,true) returning id into v_f2;
  insert into pessoas (nome, telefone) values ('Conf66 Um','21999990091') returning id into v_p1;
  insert into pessoas (nome, telefone) values ('Conf66 Dois','21999990092') returning id into v_p2;
  insert into voluntarios (equipe_id,pessoa_id,nome,telefone,conferido,ativo)
       values (v_eq, v_p1,'Conf66 Um','21999990091',true,true) returning id into v_v1;
  insert into voluntarios (equipe_id,pessoa_id,nome,telefone,conferido,ativo)
       values (v_eq2,v_p2,'Conf66 Dois','21999990092',true,true) returning id into v_v2;

  /* ---- 1. dia vazio: o robô monta, como sempre ------------------------ */
  begin
    v_culto := salvar_dia(v_eq, v_dia, '',
      jsonb_build_array(jsonb_build_object('funcao_id', v_f1, 'voluntario_id', v_v1,
                                           'status','pendente','fixo',false,'primeira_vez',false)),
      '{}'::uuid[]);
    ok := ok + 1;
  exception when others then
    falhou := falhou + 1;
    msg := msg || E'\n  x a guarda recusou um dia VAZIO: o robo parou de montar. ' || sqlerrm;
  end;

  /* ---- 2. agora o dia tem gente: a segunda gravação é RECUSADA -------- */
  begin
    perform salvar_dia(v_eq, v_dia, '',
      jsonb_build_array(jsonb_build_object('funcao_id', v_f1, 'voluntario_id', v_v1,
                                           'status','pendente','fixo',false,'primeira_vez',false)),
      '{}'::uuid[]);
    falhou := falhou + 1;
    msg := msg || E'\n  x o robo passou por cima de um dia que ja tinha gente';
  exception when others then
    ok := ok + 1;
  end;

  /* ---- 3. e o que estava lá continua exatamente como estava ----------- */
  select count(*) into v_n from escalacoes e join funcoes f on f.id = e.funcao_id
   where e.culto_id = v_culto and f.equipe_id = v_eq and e.voluntario_id = v_v1;
  if v_n = 1 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || format(E'\n  x a recusa nao preservou a linha do lider: %s linha(s)', v_n);
  end if;

  /* ---- 4. VAGA (escalação sem voluntário) NÃO bloqueia ----------------
     `montados`, na rota, exige `x?.vid`. Se a guarda contasse vaga, as duas
     condições divergiriam e o robô recusaria dia que ele deve montar. */
  delete from escalacoes where culto_id = v_culto;
  insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
       values (v_culto, v_f1, null, 'pendente', false, false);
  begin
    perform salvar_dia(v_eq, v_dia, '',
      jsonb_build_array(jsonb_build_object('funcao_id', v_f1, 'voluntario_id', v_v1,
                                           'status','pendente','fixo',false,'primeira_vez',false)),
      '{}'::uuid[]);
    ok := ok + 1;
  exception when others then
    falhou := falhou + 1;
    msg := msg || E'\n  x vaga sem gente bloqueou o robo: a guarda diverge de `montados` na rota. ' || sqlerrm;
  end;

  /* ---- 5. a guarda é POR EQUIPE: o Louvor nao bloqueia a Midia -------- */
  begin
    perform salvar_dia(v_eq2, v_dia, '',
      jsonb_build_array(jsonb_build_object('funcao_id', v_f2, 'voluntario_id', v_v2,
                                           'status','pendente','fixo',false,'primeira_vez',false)),
      '{}'::uuid[]);
    ok := ok + 1;
  exception when others then
    falhou := falhou + 1;
    msg := msg || E'\n  x a escala de uma equipe bloqueou a gravacao de OUTRA no mesmo domingo. ' || sqlerrm;
  end;

  /* ---- 6. a recusa nao deixa culto fantasma para tras -----------------
     A guarda roda DEPOIS de resolver `v_culto`, e esse caminho pode ter
     acabado de inserir a linha em `cultos`. Como a funcao inteira e uma
     instrucao so, o `raise` desfaz o insert junto. Se nao desfizesse, cada
     recusa criaria um domingo orfao. */
  delete from escalacoes where culto_id = v_culto;
  insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
       values (v_culto, v_f1, v_v1, 'pendente', false, false);
  select count(*) into v_n from cultos where data = (current_date + 41)::date;
  begin
    perform salvar_dia(v_eq, (current_date + 41)::date, '', '[]'::jsonb, '{}'::uuid[]);
  exception when others then null;
  end;
  select count(*) into v_n from cultos where data = (current_date + 41)::date;
  /* aqui a gravacao do dia 41 DEVE ter funcionado (dia vazio), entao o culto
     existe: o caso que importa e o de cima, e este so confere que a funcao
     nao deixou lixo quando recusou o dia 40 */
  select count(*) into v_n from cultos where data = v_dia;
  if v_n = 1 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || format(E'\n  x sobraram %s linha(s) de culto na data recusada', v_n);
  end if;

  /* ---- limpeza, POR ID ------------------------------------------------ */
  delete from escalacoes e using cultos c
   where c.id = e.culto_id and c.data in (v_dia, (current_date + 41)::date);
  delete from culto_obs o where o.equipe_id in (v_eq, v_eq2);
  delete from plantoes p using voluntarios v where v.id = p.voluntario_id and v.equipe_id in (v_eq, v_eq2);
  delete from cultos where data in (v_dia, (current_date + 41)::date);
  delete from voluntarios where id in (v_v1, v_v2);
  delete from pessoas where id in (v_p1, v_p2);
  delete from funcoes where id in (v_f1, v_f2);
  delete from equipes where id in (v_eq, v_eq2);

  if falhou > 0 then
    raise exception 'A CONFERENCIA DA 66 REPROVOU: % de % casos', falhou, ok + falhou
      using detail = msg, errcode = 'raise_exception';
  end if;
  raise notice '66 · conferencia: %/% casos. O robo monta dia vazio, recusa dia com gente, ignora vaga e nao bloqueia outra equipe.', ok, ok;
end $conf$;


/* =============================================================================
   ROLLBACK
     Copiar o corpo de `salvar_dia` da migração 61 por cima (é este, sem o
     bloco `if exists ... raise exception` do topo).

   VERIFICAÇÃO DEPOIS DE APLICAR
     select * from testar_permissoes();
     select * from schema_versao_conferir();
   ============================================================================= */
