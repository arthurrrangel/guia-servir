/* =============================================================================
   90 · O SETOR NAO FICAVA SABENDO QUE CHEGOU DEMANDA
   22/09/2026

   O pedido, com as palavras dele:

     "Queria mandar no email da pessoa que recebe a demanda o aviso de nova
      demanda."
     "Pra ela ter algum formato de aviso."

   E o buraco e real: hoje a demanda nasce, entra na lista, e ninguem e
   avisado. Quem abriu supoe que alguem viu. Quem atende so descobre se abrir
   o sistema por conta propria. Um sistema de demandas em que a demanda espera
   ser encontrada nao e um sistema de demandas, e um quadro de recados.

   ---------------------------------------------------------------------------
   POR QUE ISTO E UMA MIGRACAO, E NAO SO UMA ROTA QUE MANDA EMAIL

   Aviso sem marca no banco tem dois modos de falhar, e os dois acontecem:

     · manda duas vezes. A pessoa abre a demanda, a rede engasga, o cliente
       repete a chamada, e o setor recebe o mesmo aviso duplicado. Do lado de
       quem recebe, aviso repetido ensina a ignorar aviso.
     · nao manda nenhuma. A pessoa abre a demanda pelo celular no
       estacionamento da igreja, a aba fecha antes de a chamada sair, e o
       aviso simplesmente nunca existiu. Ninguem descobre, porque nao ha o que
       descobrir: nao ficou registro de que faltou.

   `avisado_em` resolve os dois de uma vez. Quem ja tem carimbo nao recebe de
   novo; quem nao tem, a varredura pega depois. E como a marca e do BANCO e
   nao do processo que mandou, os dois caminhos — o aviso na hora e a
   varredura — nunca se atropelam.

   ---------------------------------------------------------------------------
   QUEM RECEBE

   Quem ATENDE o setor responsavel: membros ativos daquele setor, com email,
   de papel `responsavel`, `gestor` ou `admin`. Solicitante nao recebe, porque
   solicitante nao atende — receber aviso de trabalho que nao e seu e a forma
   mais rapida de fazer alguem criar uma regra de caixa de entrada.

   NAO RECEBE quem abriu, nem que esteja no setor: a pessoa acabou de
   escrever a demanda, ela sabe.

   Se o setor responsavel nao tiver NINGUEM com email, a demanda e marcada
   como avisada mesmo assim, e o motivo fica gravado. Tentar de novo para
   sempre uma coisa que nao tem destinatario e so gastar o cron.

   ---------------------------------------------------------------------------
   O QUE ESTE ARQUIVO NAO FAZ

     · nao manda email. Banco nao fala com a internet, e nem deveria: quem
       manda e `app/api/demandas/avisar/route.ts`, com a chave que so o
       servidor tem.
     · nao decide o texto do email. O texto e da tela, onde da para ler.
     · nao toca em nada do sistema de escalas.
   ============================================================================= */
do $tranca$begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(90);
  end if;
end
$tranca$;

begin;

/* -------------------------------------------------------------------------
   1 · A MARCA

   `timestamptz` e nao booleano: "quando" responde perguntas que "se" nao
   responde — quanto tempo a demanda esperou pelo aviso, se a varredura esta
   atrasada, se alguem reclamou de nao ter sido avisado e o carimbo diz o
   contrario.

   `motivo` guarda o caso chato: avisada sem ninguem para avisar. Sem ele, uma
   demanda com carimbo e sem email enviado seria indistinguivel de uma que
   avisou direito.
   ------------------------------------------------------------------------- */
alter table demandas.demandas add column if not exists avisado_em timestamptz;
alter table demandas.demandas add column if not exists aviso_motivo text;

comment on column demandas.demandas.avisado_em is
  'Quando o aviso de demanda nova saiu (ou foi dado por encerrado). Nulo = a '
  'varredura ainda vai pegar. Ver a migracao 90.';

/* O indice e PARCIAL de proposito: a varredura procura sempre a mesma coisa,
   "o que ainda nao foi avisado", e essa lista e curta. Um indice cheio sobre
   uma coluna que fica quase toda preenchida seria pagar escrita em toda
   demanda para acelerar uma consulta que le cinco linhas. */
create index if not exists ix_dem_sem_aviso
  on demandas.demandas (criada_em) where avisado_em is null;

/* -------------------------------------------------------------------------
   2 · O QUE FALTA AVISAR

   `security definer` porque quem chama e o servidor com a chave de servico,
   fora de qualquer sessao de membro: nao ha `demandas.quem()` para consultar,
   e nao pode haver — o robo nao e ninguem.

   E por isso mesmo ela e REVOGADA da porta publica logo abaixo. A licao da
   88: o `pg_default_acl` do Supabase da EXECUTE para `anon` em toda funcao
   nova de `public`, e mesmo aqui em `demandas` (onde `anon` nao tem USAGE no
   schema) o revoke fica, porque um `grant usage` futuro nao pode abrir uma
   funcao que le email de gente.
   ------------------------------------------------------------------------- */
create or replace function demandas.a_avisar(p_limite int default 50)
returns jsonb language sql stable security definer set search_path to 'demandas','public' as $fn$
  select coalesce(jsonb_agg(x order by x->>'criada_em'), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', d.id,
      'numero', d.numero,
      'titulo', d.titulo,
      'categoria', c.nome,
      'grupo', c.grupo,
      'prioridade', d.prioridade,
      'prazo', d.prazo,
      'abriu', (select m.nome from demandas.membros m where m.id = d.aberta_por),
      'setor', (select s.nome from demandas.setores s where s.id = d.setor_responsavel),
      'criada_em', d.criada_em,
      /* e o PORTAO: se a demanda ja nasce esperando aprovacao, quem atende
         nao tem o que fazer ainda, e o aviso precisa dizer isso em vez de
         mandar a pessoa para uma ficha onde todos os botoes estao fora */
      'falta_aprovacao', demandas.falta_aprovacao(d),
      'para', coalesce((
        select jsonb_agg(distinct jsonb_build_object(
                 'nome', m.nome, 'email', lower(coalesce(m.auth_email, m.email))))
          from demandas.membros m
         where m.setor_id = d.setor_responsavel
           and coalesce(m.ativo, true)
           and m.papel in ('responsavel','gestor','admin')
           and coalesce(m.auth_email, m.email) is not null
           and demandas.limpo(coalesce(m.auth_email, m.email)) is not null
           /* quem abriu nao precisa ser avisado do que acabou de escrever */
           and m.id is distinct from d.aberta_por
      ), '[]'::jsonb)
    ) as x
      from demandas.demandas d
      join demandas.categorias c on c.id = d.categoria_id
     where d.avisado_em is null
       and d.status not in ('concluida','cancelada')
     order by d.criada_em
     limit greatest(coalesce(p_limite, 50), 1)
  ) t
$fn$;

revoke all on function demandas.a_avisar(int) from public;
do $g$ begin
  begin execute 'revoke all on function demandas.a_avisar(int) from anon, authenticated';
  exception when undefined_object then null; end;
end $g$;

/* -------------------------------------------------------------------------
   3 · A MARCA, DEPOIS QUE O EMAIL SAIU

   Recebe a lista inteira e carimba de uma vez: se o processo morrer no meio
   de um laco de um em um, metade das demandas fica avisada e a outra metade
   recebe duas vezes na proxima varredura.
   ------------------------------------------------------------------------- */
create or replace function demandas.marcar_avisado(p_ids uuid[], p_motivo text default null)
returns int language sql volatile security definer set search_path to 'demandas','public' as $fn$
  with mexeu as (
    update demandas.demandas
       set avisado_em = now(), aviso_motivo = demandas.limpo(left(p_motivo, 200))
     where id = any(coalesce(p_ids, '{}'::uuid[]))
       and avisado_em is null
    returning 1)
  select count(*)::int from mexeu
$fn$;

revoke all on function demandas.marcar_avisado(uuid[], text) from public;
do $g$ begin
  begin execute 'revoke all on function demandas.marcar_avisado(uuid[], text) from anon, authenticated';
  exception when undefined_object then null; end;
end $g$;

/* -------------------------------------------------------------------------
   4 · O QUE JA EXISTIA NAO VIRA ENXURRADA

   Sem isto, a primeira varredura depois desta migracao manda um email por
   demanda ja aberta — e quem recebe dez avisos de uma vez, de coisa que ja
   conhece, cria uma regra de caixa de entrada e nunca mais le nenhum.

   O aviso comeca a valer AGORA, para o que nascer daqui em diante.
   ------------------------------------------------------------------------- */
do $antigas$
declare v_n int;
begin
  update demandas.demandas
     set avisado_em = now(), aviso_motivo = 'aberta antes de o aviso existir'
   where avisado_em is null;
  get diagnostics v_n = row_count;
  raise notice '90 · % demanda(s) que ja existiam foram marcadas como avisadas, para a primeira varredura nao virar enxurrada.', v_n;
end $antigas$;

/* =============================================================================
   CONFERENCIA
   ============================================================================= */
do $conf$
declare
  falhas text[] := '{}';
  v_set uuid; v_set2 uuid; v_cat uuid; v_catx uuid;
  v_ana uuid; v_bia uuid; v_eva uuid; v_mudo uuid;
  r jsonb; n int; v_id uuid; v_q int;
begin
  insert into demandas.setores (nome, slug, ativo, atende, ordem)
    values ('CONF90 dentro', 'conf-90-setor', true, true, 99) returning id into v_set;
  insert into demandas.setores (nome, slug, ativo, atende, ordem)
    values ('CONF90 mudo', 'conf-90-mudo', true, true, 99) returning id into v_set2;
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, ativa)
    values ('CONF 90', 'livre', v_set, false, true) returning id into v_cat;
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, ativa)
    values ('CONF 90', 'exige', v_set, true, true) returning id into v_catx;
  insert into demandas.membros (nome, token, papel, setor_id, ativo, email)
    values ('CONF90 Ana', 'conf90-ana', 'responsavel', v_set, true, 'ana@exemplo.test') returning id into v_ana;
  insert into demandas.membros (nome, token, papel, setor_id, ativo, auth_email)
    values ('CONF90 Bia', 'conf90-bia', 'gestor', v_set, true, 'BIA@Exemplo.TEST') returning id into v_bia;
  insert into demandas.membros (nome, token, papel, setor_id, ativo, email)
    values ('CONF90 Eva', 'conf90-eva', 'solicitante', v_set, true, 'eva@exemplo.test') returning id into v_eva;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('CONF90 Mudo', 'conf90-mudo', 'responsavel', v_set2, true) returning id into v_mudo;
  /* A FIXTURE PRECISOU DESTES DOIS, E A SABOTAGEM E QUE DISSE.

     Sem eles, duas sabotagens PASSAVAM — tirar `papel in (...)` e tirar
     `coalesce(ativo, true)` nao mudavam o resultado de nenhum bloco:

       · a unica solicitante com email era a Eva, que abre as demandas do
         teste, entao ja era descartada pelo `is distinct from aberta_por`. A
         regra do papel nao estava sendo medida por ninguem;
       · nao havia membro inativo em lugar nenhum.

     Duas linhas de fixture e a diferenca entre uma conferencia que mede e uma
     que da verde. */
  insert into demandas.membros (nome, token, papel, setor_id, ativo, email)
    values ('CONF90 Rai', 'conf90-rai', 'solicitante', v_set, true, 'rai@exemplo.test');
  insert into demandas.membros (nome, token, papel, setor_id, ativo, email)
    values ('CONF90 Ex', 'conf90-ex', 'responsavel', v_set, false, 'ex@exemplo.test');

  /* -- 1 · demanda nova entra na fila de aviso -------------------------- */
  r := public.dem_abrir('conf90-eva', jsonb_build_object(
        'titulo','Trocar a lampada do corredor', 'descricao','Queimou ontem.',
        'setor_solicitante', v_set, 'categoria_id', v_cat,
        'prazo', (demandas.hoje() + 5)::text));
  n := (r->>'numero')::int;
  if not coalesce((r->>'ok')::boolean,false) then
    falhas := falhas || format('1: a demanda nao nasceu: %s', r::text); end if;

  r := demandas.a_avisar(50);
  if (select count(*) from jsonb_array_elements(r) x where (x->>'numero')::int = n) <> 1 then
    falhas := falhas || '1: a demanda nova NAO entrou na fila de aviso'::text; end if;

  /* -- 2 · quem recebe, e quem nao recebe ------------------------------ */
  select x into r from jsonb_array_elements(demandas.a_avisar(50)) x where (x->>'numero')::int = n;
  if (select count(*) from jsonb_array_elements(r->'para')) <> 2 then
    falhas := falhas || format('2: devia avisar 2 pessoas e vai avisar %s: %s',
      (select count(*) from jsonb_array_elements(r->'para')), (r->'para')::text); end if;
  if (select count(*) from jsonb_array_elements(r->'para') p
       where p->>'email' in ('eva@exemplo.test','rai@exemplo.test')) > 0 then
    falhas := falhas || '2: o solicitante entrou na lista de quem atende'::text; end if;
  if (select count(*) from jsonb_array_elements(r->'para') p where p->>'email' = 'ex@exemplo.test') > 0 then
    falhas := falhas || '2: membro inativo continua recebendo aviso'::text; end if;
  if (select count(*) from jsonb_array_elements(r->'para') p where p->>'email' = 'bia@exemplo.test') <> 1 then
    falhas := falhas || format('2: o email nao foi normalizado para minuscula: %s', (r->'para')::text); end if;

  /* -- 3 · quem abriu nao e avisado do que escreveu --------------------- */
  r := public.dem_abrir('conf90-ana', jsonb_build_object(
        'titulo','Aberta por quem atende', 'descricao','x',
        'setor_solicitante', v_set, 'categoria_id', v_cat, 'sem_prazo_porque','nao sei'));
  select x into r from jsonb_array_elements(demandas.a_avisar(50)) x
   where (x->>'numero')::int = (r->>'numero')::int;
  if (select count(*) from jsonb_array_elements(r->'para') p where p->>'email' = 'ana@exemplo.test') > 0 then
    falhas := falhas || '3: quem abriu recebeu aviso da propria demanda'::text; end if;

  /* -- 4 · o aviso diz que o portao esta fechado ------------------------ */
  r := public.dem_abrir('conf90-eva', jsonb_build_object(
        'titulo','Compra que espera aprovacao', 'descricao','x',
        'setor_solicitante', v_set, 'categoria_id', v_catx, 'sem_prazo_porque','nao sei'));
  select x into r from jsonb_array_elements(demandas.a_avisar(50)) x
   where (x->>'numero')::int = (r->>'numero')::int;
  if not coalesce((r->>'falta_aprovacao')::boolean, false) then
    falhas := falhas || '4: o aviso nao diz que a demanda ja nasce esperando aprovacao'::text; end if;
  if jsonb_typeof(r->'falta_aprovacao') <> 'boolean' then
    falhas := falhas || '4: falta_aprovacao no aviso nao e booleano'::text; end if;

  /* -- 5 · marcar NAO manda de novo ------------------------------------ */
  select id into v_id from demandas.demandas where numero = n;
  v_q := demandas.marcar_avisado(array[v_id]);
  if v_q <> 1 then falhas := falhas || format('5: marcar devia carimbar 1 e carimbou %s', v_q); end if;
  if (select count(*) from jsonb_array_elements(demandas.a_avisar(50)) x
       where (x->>'numero')::int = n) > 0 then
    falhas := falhas || '5: a demanda carimbada continua na fila, e o setor vai receber duas vezes'::text; end if;
  /* e carimbar de novo nao mexe em nada: a varredura e o aviso na hora podem
     chegar juntos, e o segundo tem que ser um nao-evento */
  if demandas.marcar_avisado(array[v_id]) <> 0 then
    falhas := falhas || '5: carimbar duas vezes contou de novo'::text; end if;

  /* -- 6 · setor sem ninguem com email nao trava a fila para sempre ----- */
  update demandas.categorias set setor_id = v_set2 where id = v_cat;
  r := public.dem_abrir('conf90-eva', jsonb_build_object(
        'titulo','Para um setor sem email', 'descricao','x',
        'setor_solicitante', v_set, 'categoria_id', v_cat, 'sem_prazo_porque','nao sei'));
  select x into r from jsonb_array_elements(demandas.a_avisar(50)) x
   where (x->>'numero')::int = (r->>'numero')::int;
  if r is null then
    falhas := falhas || '6: a demanda de setor sem email sumiu da fila em silencio'::text;
  elsif (select count(*) from jsonb_array_elements(r->'para')) <> 0 then
    falhas := falhas || format('6: inventou destinatario onde nao ha: %s', (r->'para')::text); end if;
  update demandas.categorias set setor_id = v_set where id = v_cat;

  /* -- 7 · fechada nao gera aviso -------------------------------------- */
  r := public.dem_abrir('conf90-eva', jsonb_build_object(
        'titulo','Cancelada antes de avisar', 'descricao','x',
        'setor_solicitante', v_set, 'categoria_id', v_cat, 'sem_prazo_porque','nao sei'));
  n := (r->>'numero')::int;
  perform public.dem_mover('conf90-eva', n, 'cancelar', '{"texto":"foi engano"}'::jsonb);
  if (select count(*) from jsonb_array_elements(demandas.a_avisar(50)) x
       where (x->>'numero')::int = n) > 0 then
    falhas := falhas || '7: demanda cancelada continua na fila de aviso'::text; end if;

  /* -- 8 · a porta publica nao alcanca estas duas ----------------------- */
  if has_function_privilege('anon', 'demandas.a_avisar(int)', 'EXECUTE')
     or has_function_privilege('authenticated', 'demandas.a_avisar(int)', 'EXECUTE') then
    falhas := falhas || '8: a_avisar esta aberta para a porta publica, e ela le email de gente'::text; end if;
  if has_function_privilege('anon', 'demandas.marcar_avisado(uuid[], text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'demandas.marcar_avisado(uuid[], text)', 'EXECUTE') then
    falhas := falhas || '8: marcar_avisado esta aberta para a porta publica'::text; end if;

  /* -- 9 · o teto existe ----------------------------------------------- */
  if (select count(*) from jsonb_array_elements(demandas.a_avisar(1))) > 1 then
    falhas := falhas || '9: o limite nao foi respeitado'::text; end if;
  if (select count(*) from jsonb_array_elements(demandas.a_avisar(0))) < 1 then
    falhas := falhas || '9: limite 0 devia virar 1, e devolveu vazio'::text; end if;

  /* ---- desmonta ------------------------------------------------------- */
  delete from demandas.eventos where demanda_id in (select id from demandas.demandas where setor_solicitante in (v_set,v_set2));
  delete from demandas.anexos  where demanda_id in (select id from demandas.demandas where setor_solicitante in (v_set,v_set2));
  delete from demandas.demandas where setor_solicitante in (v_set,v_set2);
  delete from demandas.membros where token like 'conf90-%';
  delete from demandas.categorias where grupo = 'CONF 90';
  delete from demandas.setores where slug in ('conf-90-setor','conf-90-mudo');

  if array_length(falhas, 1) > 0 then
    raise exception E'90 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 90 · conferencia: 9 blocos. A demanda nova entra na fila, quem atende recebe e o solicitante nao, quem abriu nao e avisado do proprio pedido, o aviso carrega o portao, o carimbo impede o aviso dobrado, setor sem email nao trava a fila, cancelada sai, a porta publica nao alcanca e o teto vale.';
end $conf$;

insert into public.schema_versao (n, arquivo)
  values (90, '90-o-setor-nao-ficava-sabendo-que-chegou-demanda.sql')
  on conflict (n) do nothing;

commit;
