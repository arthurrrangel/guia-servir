/* =============================================================================
   61 · O ROBÔ CRIAVA UM CULTO FANTASMA NO DIA DO EVENTO

   20/09/2026. Só de Escalas.

   -------------------------------------------------------------------------
   O DEFEITO, E ELE NASCEU HOJE

   O commit de hoje "o robo sorteava o dia de evento e nunca gravava" trocou a
   lista de gravação do cron de `cultosDoMes(...)` para `diasDoMes(S, ...)`,
   que inclui os dias de evento esporádico. Corrigiu o que dizia corrigir: o
   robô passou a sortear E a tentar gravar o evento.

   E manteve a gravação em `rpc('salvar_dia')`, que só conhece culto REGULAR.
   A primeira coisa que ela faz é:

       insert into cultos (data) values (p_data)
         on conflict (data) where evento is null do update set data = excluded.data

   O índice único é PARCIAL (`ux_cultos_data_regular`, migração 54). Na data
   de um evento não existe linha regular, então nada conflita: o Postgres
   INSERE uma segunda linha em `cultos` naquela data, regular e sem dono, e
   grava as escalações e o recado NELA.

   Medido num Postgres nascido do repositório, com `role = service_role` e sem
   JWT (que é exatamente o robô):

       evento em 2026-11-26 criado
       salvar_dia gravou no culto e00319aa-... ; e o evento? f
       linhas em `cultos` nessa data: 2   (esperado 1)
       escalacoes gravadas NA LINHA DO EVENTO: 0   (esperado 1)

   TRÊS ESTRAGOS, E O SEGUNDO É O PIOR.

   1 · A correção não corrigia. A linha do evento continua com zero
       escalações, que é o defeito que ela existia para matar.

   2 · A TELA DO LÍDER MORRE NAQUELE DIA, PARA SEMPRE. `lib/db.ts` procura o
       culto com `.eq('data', d).or('equipe_id.is.null,equipe_id.eq.<id>')` e
       `.maybeSingle()`. As duas linhas casam, `.maybeSingle()` com duas
       linhas devolve PGRST116, e `salvarDia` faz `if (error) throw error`.
       O líder não consegue mais salvar aquele dia, nunca, com um erro cru de
       PostgREST na tela.

       É exatamente o modo de falha que o comentário de hoje em `lib/db.ts`
       diz ter eliminado: ele fechou a porta "dois ministérios com evento na
       mesma quinta", e o robô do mesmo dia abriu uma equivalente.

   3 · `montarEstado` monta `idDoCulto` com chave DATA, então as duas linhas
       colapsam e `d.cultoId` fica com a que vier por último, por ordem de
       heap. Se sair a do evento, `mudarStatus` casa zero linhas e a tela diz
       `ESCALA_MUDOU_NO_POSTO` sem nada ter mudado.

   -------------------------------------------------------------------------
   O CONSERTO

   Quando a data tem um evento DESTA equipe, é nele que se grava. Só quando
   não tem é que vale a linha regular, com o mesmo `on conflict` de sempre.

   É a mesma regra que o resto do sistema já usa: `montarEstado` materializa o
   dia do evento e assume UMA linha de culto por data por equipe, e
   `visao_geral()` (migração 60) já decide entre evento próprio e culto
   regular pelo mesmo critério.

   O RESTO DO CORPO É O DA 54, PALAVRA POR PALAVRA. A própria 54 escreveu por
   que, e a lição é dela: "quando uma migração precisa de duas linhas dentro
   de uma função de cinquenta, ela copia as cinquenta e muda duas. Reescrever
   'já que estou aqui' é como se perde regra que alguém levou semanas para
   descobrir." Aqui mudam seis linhas, e só elas.

   ORDEM:  ... 59 → 60 → 61
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(61);
  end if;
end $tranca$;


create or replace function public.salvar_dia(
  p_equipe uuid, p_data date, p_obs text, p_slots jsonb, p_plantao uuid[])
returns uuid language plpgsql set search_path to 'public' as $fn$
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
end $fn$;


-- =========================================================================
-- E A FAXINA: os fantasmas que o robô já pode ter criado
--
-- Só apaga linha REGULAR que (a) divide a data com um evento e (b) não tem
-- escalação, plantão nem recado de ninguém. Culto regular de verdade, com
-- gente ou com histórico, não é tocado: preferir deixar um fantasma vazio a
-- apagar um domingo de verdade.
-- =========================================================================

do $faxina$
declare n int := 0;
begin
  if to_regclass('public.cultos') is null then
    raise notice 'PULEI a faxina da 61: base sem public.cultos.'; return;
  end if;

  with fantasmas as (
    select c.id from cultos c
     where c.evento is null
       and exists (select 1 from cultos e where e.data = c.data and e.evento is not null)
       and not exists (select 1 from escalacoes x where x.culto_id = c.id)
       and not exists (select 1 from plantoes  p where p.culto_id = c.id)
       and not exists (select 1 from culto_obs o where o.culto_id = c.id
                         and coalesce(o.obs,'') <> '')
  )
  delete from culto_obs o using fantasmas f where o.culto_id = f.id;

  with fantasmas as (
    select c.id from cultos c
     where c.evento is null
       and exists (select 1 from cultos e where e.data = c.data and e.evento is not null)
       and not exists (select 1 from escalacoes x where x.culto_id = c.id)
       and not exists (select 1 from plantoes  p where p.culto_id = c.id)
       and not exists (select 1 from culto_obs o where o.culto_id = c.id)
  )
  delete from cultos c using fantasmas f where c.id = f.id;
  get diagnostics n = row_count;

  if n > 0 then
    raise notice '61 · faxina: % culto(s) fantasma apagado(s) (linha regular vazia dividindo data com evento).', n;
  else
    raise notice '61 · faxina: nenhum culto fantasma para apagar.';
  end if;

  /* o que sobrou com gente dentro NÃO é apagado, mas precisa ser visto */
  select count(*) into n from cultos c
   where c.evento is null
     and exists (select 1 from cultos e where e.data = c.data and e.evento is not null);
  if n > 0 then
    raise warning '61 · ATENCAO: % data(s) ainda tem culto regular E evento juntos, com gente escalada no regular. Nenhuma foi apagada. Confira uma a uma antes de mexer.', n;
  end if;
end $faxina$;


-- =========================================================================
-- A GUARDA "FORA DE ORDEM" DA 60 EXIGE NUMERAÇÃO DENSA, E O REPOSITÓRIO
-- JÁ TEM SALTO
--
-- A 60 acrescentou `if v_max < p_n - 1 then raise FORA DE ORDEM`. Ela impede
-- pular migração, que é o que se quer, e de quebra exige que os números
-- sejam consecutivos. Este repositório JÁ TEM precedente de salto: não existe
-- `39-*.sql`, e há o pulo `43 → 50`.
--
-- Hoje a régua é densa (1..61) e nada quebra. No dia em que alguém numerar o
-- próximo arquivo como 63 em vez de 62, a migração é recusada sem motivo
-- real, com uma mensagem que fala de migração faltando quando o que falta é
-- só um número.
--
-- Não dá para a função distinguir "número pulado" de "arquivo não aplicado":
-- ela vê a régua, não o diretório. Então o conserto é a mensagem DIZER a
-- saída, em vez de deixar quem tomou o erro descobrir sozinho.
-- =========================================================================

create or replace function public.exige_versao_ate(p_n int)
returns void language plpgsql as $fn$
declare v_max int;
begin
  select max(n) into v_max from schema_versao;
  if v_max is null then return; end if;

  if v_max > p_n then
    raise exception E'MIGRACAO SUPERADA: este arquivo e da versao %, e o banco ja esta na %.\n'
      '  Reaplicar aqui GRAVA a versao antiga por cima da nova, em silencio.\n'
      '  Medido em 19/09: reaplicar a 23, a 31 ou a 43 desfaz a 51 e `candidatar` volta a entregar token de terceiro.\n'
      '  Se voce REALMENTE quer, apague a linha da regua: delete from schema_versao where n > %;',
      p_n, v_max, p_n
      using errcode = 'raise_exception';
  end if;

  /* A GUARDA QUE FALTAVA (60). A régua respondia "este arquivo é velho
     demais?" e nunca "este banco está pronto para este arquivo?". Pular
     migração para frente produz `relation ... does not exist` num ponto
     qualquer do arquivo, e ninguém relaciona isso à ordem.

     A SAÍDA PARA NÚMERO PULADO (61): esta conta exige numeração densa, e o
     repositório já pulou o 39 e o 44..49. A mensagem diz como seguir, porque
     a função não tem como distinguir "número que ninguém usou" de "arquivo
     que ninguém aplicou": ela enxerga a régua, não o diretório. */
  if v_max < p_n - 1 then
    raise exception E'FORA DE ORDEM: este arquivo e a %, e o banco so chegou na %.\n'
      '  Faltam % numero(s) no meio. Aplique as migracoes que faltam, em ordem, antes desta.\n'
      '  Pular para frente nao da erro limpo: da `relation ... does not exist` no meio do arquivo.\n'
      '  SE O NUMERO FOI SO PULADO (nao existe arquivo com ele, como o 39 e o 44..49 deste\n'
      '  repositorio), registre o vazio e rode de novo:\n'
      '    insert into schema_versao (n, arquivo) select g.n, ''numero pulado: nao existe arquivo''\n'
      '      from generate_series(%, %) g(n) on conflict (n) do nothing;',
      p_n, v_max, p_n - 1 - v_max, v_max + 1, p_n - 1
      using errcode = 'raise_exception';
  end if;
end $fn$;
revoke all on function public.exige_versao_ate(int) from public, anon, authenticated;


-- =========================================================================
-- REGISTRO NA RÉGUA E NA SONDA
-- =========================================================================

do $reg$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (61, '61 · salvar_dia grava no evento da propria equipe', 'salvar_dia',
           'c.evento is not null and c.equipe_id = p_equipe')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;

  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo)
      values (61, '61-o-robo-criava-um-culto-fantasma-no-dia-do-evento.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;


-- =========================================================================
-- A CONFERÊNCIA
--
-- Cria um evento de verdade, chama `salvar_dia` como o robô chama, e conta
-- as linhas. Catálogo não serve: o defeito era de COMPORTAMENTO, e o
-- catálogo dizia que `salvar_dia` estava perfeita.
-- =========================================================================

do $conf$
declare
  v_eq uuid; v_fn uuid; v_vol uuid; v_p uuid; v_tel text;
  v_dia date; v_culto uuid; v_ev uuid;
  n int; ok int := 0; falhou int := 0; msg text := '';
begin
  if to_regprocedure('public.salvar_dia(uuid,date,text,jsonb,uuid[])') is null then
    raise notice 'PULEI a conferencia da 61: base sem salvar_dia.'; return;
  end if;

  v_tel := '21' || lpad((floor(random()*900000000)+100000000)::text, 9, '0');
  v_dia := (current_date + 400)::date;      -- longe de tudo que exista
  if exists (select 1 from cultos where data = v_dia)
     or exists (select 1 from pessoas where telefone = v_tel) then
    raise exception 'A conferencia da 61 sorteou data ou telefone que ja existe. Nao escrevi nada.'
      using errcode = 'raise_exception';
  end if;

  insert into equipes (slug, nome) values ('conf61','Conferencia 61') on conflict (slug) do nothing;
  select id into v_eq from equipes where slug = 'conf61';
  insert into funcoes (equipe_id, nome, simultanea, ordem, ativa, tipos)
       values (v_eq, 'POSTO CONF 61', true, 961, true, array['domingo'])
    on conflict do nothing;
  select id into v_fn from funcoes where equipe_id = v_eq and nome = 'POSTO CONF 61';
  insert into voluntarios (equipe_id, nome, telefone, ativo)
       values (v_eq, 'Fulano Conf Sessentaeum', v_tel, true) returning id into v_vol;

  /* o evento, como `criar_evento` faria */
  insert into cultos (data, evento, equipe_id) values (v_dia, 'Evento Conf 61', v_eq)
    returning id into v_ev;

  /* ---- 1. salvar_dia grava NO EVENTO, e nao cria linha regular --------- */
  begin
    v_culto := salvar_dia(v_eq, v_dia, 'recado da conferencia 61',
      jsonb_build_array(jsonb_build_object(
        'funcao_id', v_fn, 'voluntario_id', v_vol, 'status', 'pendente',
        'fixo', false, 'primeira_vez', false)),
      '{}'::uuid[]);
    if v_culto = v_ev then ok := ok + 1;
    else
      falhou := falhou + 1;
      msg := msg || E'\n  x salvar_dia gravou fora do evento (devolveu ' || coalesce(v_culto::text,'null') || ')';
    end if;
  exception when others then
    falhou := falhou + 1;
    msg := msg || E'\n  x salvar_dia EXPLODIU no dia de evento: ' || sqlerrm;
  end;

  select count(*) into n from cultos where data = v_dia;
  if n = 1 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x a data ficou com ' || n || ' linha(s) em cultos; esperava 1 (culto fantasma)';
  end if;

  select count(*) into n from escalacoes where culto_id = v_ev;
  if n = 1 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x a linha do evento ficou com ' || n || ' escalacao(oes); esperava 1';
  end if;

  select count(*) into n from culto_obs where culto_id = v_ev and equipe_id = v_eq;
  if n = 1 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x o recado nao entrou no evento (' || n || ' linha(s))';
  end if;

  /* ---- 2. e num dia SEM evento nada mudou: cria o regular como sempre -- */
  begin
    v_culto := salvar_dia(v_eq, (v_dia + 7)::date, '', '[]'::jsonb, '{}'::uuid[]);
    select count(*) into n from cultos where data = (v_dia + 7)::date and evento is null;
    if v_culto is not null and n = 1 then ok := ok + 1;
    else
      falhou := falhou + 1;
      msg := msg || E'\n  x dia sem evento parou de criar o culto regular (' || n || ' linha(s))';
    end if;
  exception when others then
    falhou := falhou + 1;
    msg := msg || E'\n  x dia sem evento EXPLODIU: ' || sqlerrm;
  end;

  /* ---- limpeza, por id ------------------------------------------------- */
  delete from escalacoes where funcao_id = v_fn;
  delete from plantoes  where voluntario_id = v_vol;
  delete from culto_obs where equipe_id = v_eq;
  delete from voluntarios where id = v_vol;
  delete from funcoes where equipe_id = v_eq;
  delete from cultos where data in (v_dia, (v_dia + 7)::date);
  delete from equipes where id = v_eq;

  if falhou > 0 then
    raise exception 'A CONFERENCIA DA 61 REPROVOU: % de % casos', falhou, ok + falhou
      using detail = msg, errcode = 'raise_exception';
  end if;
  raise notice '61 · conferencia: %/% casos. salvar_dia grava no evento da propria equipe, nao cria culto fantasma, e dia sem evento segue igual.', ok, ok;
end $conf$;


/* =============================================================================
   CONFERÊNCIA À MÃO, depois de aplicar

     -- nenhuma data com culto regular E evento ao mesmo tempo:
     select c.data, count(*) from cultos c
      group by c.data having count(*) > 1;

     select * from schema_versao_conferir() where not passou;
     select max(n) from schema_versao;          -- 61

   ROLLBACK
     Copiar o corpo de `salvar_dia` da migração 54 por cima. A faxina não tem
     volta, e não precisa: ela só apaga linha regular VAZIA que divide data
     com um evento, que é lixo por definição.
   ============================================================================= */
