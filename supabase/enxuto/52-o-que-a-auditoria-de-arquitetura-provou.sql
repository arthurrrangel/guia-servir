do $tranca$begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(52);
  end if;
end
$tranca$;

create or replace function public.dem_mover(
  p_token text, p_numero int, p_acao text, p_d jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare
  m demandas.membros; d demandas.demandas;
  v_txt text := nullif(btrim(coalesce(p_d->>'texto','')),'');
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

  /* ---- a única mudança desta migração nesta função ----------------------
     `for update` segura a linha até o fim da transação. Quem chegar depois
     espera, e então relê o estado JÁ gravado — que é o estado que o guarda
     de JA_FECHADA precisa julgar. Sem isso, duas pessoas agindo no mesmo
     segundo leem a mesma foto antiga e as duas passam. */
  select * into d from demandas.demandas where numero = p_numero for update;

  if d.id is null then return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;
  if not demandas.pode_ver(m, d) then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

  /* Demanda fechada só aceita comentário, anexo e reabertura. Sem este
     guarda, cancelar uma demanda já concluída passaria — e o histórico
     ficaria contando uma história que não aconteceu. */
  if d.status in ('concluida','cancelada')
     and p_acao not in ('comentar','anexar','reabrir') then
    return jsonb_build_object('ok', false, 'erro', 'JA_FECHADA');
  end if;

  if p_acao = 'comentar' then
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'TEXTO_VAZIO'); end if;
    insert into demandas.eventos (demanda_id, membro_id, tipo, texto, interno)
      values (d.id, m.id, 'comentario', v_txt,
              coalesce((p_d->>'interno')::boolean, false) and demandas.pode_atender(m, d));
    update demandas.demandas set mexida_em = now() where id = d.id;

  elsif p_acao = 'anexar' then
    if nullif(btrim(coalesce(p_d->>'url','')),'') is null then
      return jsonb_build_object('ok', false, 'erro', 'URL_VAZIA'); end if;
    insert into demandas.anexos (demanda_id, nome, url, membro_id)
      values (d.id, coalesce(nullif(btrim(p_d->>'nome'),''),'anexo'), btrim(p_d->>'url'), m.id);
    insert into demandas.eventos (demanda_id, membro_id, tipo, texto)
      values (d.id, m.id, 'anexo', coalesce(nullif(btrim(p_d->>'nome'),''),'anexo'));
    update demandas.demandas set mexida_em = now() where id = d.id;

  elsif p_acao = 'assumir' then
    if not demandas.pode_atender(m, d) then return jsonb_build_object('ok', false, 'erro', 'NAO_E_SEU_SETOR'); end if;
    if d.aprovacao = 'pendente' then return jsonb_build_object('ok', false, 'erro', 'FALTA_APROVACAO'); end if;
    update demandas.demandas
       set responsavel_id = m.id, status = 'execucao', travada_por = null, travada_nota = null
     where id = d.id;

  elsif p_acao = 'travar' then
    if not demandas.pode_atender(m, d) then return jsonb_build_object('ok', false, 'erro', 'NAO_E_SEU_SETOR'); end if;
    if coalesce(p_d->>'motivo','') not in ('informacao','aprovacao','terceiros') then
      return jsonb_build_object('ok', false, 'erro', 'MOTIVO_INVALIDO'); end if;
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'TEXTO_VAZIO'); end if;
    update demandas.demandas
       set status = 'travada', travada_por = p_d->>'motivo', travada_nota = v_txt,
           aprovacao = case when p_d->>'motivo' = 'aprovacao' then 'pendente' else aprovacao end
     where id = d.id;

  elsif p_acao = 'destravar' then
    if not (demandas.pode_atender(m, d) or d.aberta_por = m.id) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    if d.status <> 'travada' then return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_TRAVADA'); end if;
    if d.travada_por = 'aprovacao' and d.aprovacao = 'pendente' then
      return jsonb_build_object('ok', false, 'erro', 'FALTA_APROVACAO'); end if;
    if v_txt is not null then
      insert into demandas.eventos (demanda_id, membro_id, tipo, texto)
        values (d.id, m.id, 'comentario', v_txt);
    end if;
    update demandas.demandas
       set status = case when responsavel_id is null then 'aberta' else 'execucao' end,
           travada_por = null, travada_nota = null
     where id = d.id;

  elsif p_acao in ('aprovar','rejeitar') then
    if m.papel not in ('gestor','admin') then return jsonb_build_object('ok', false, 'erro', 'SO_GESTOR'); end if;
    if d.aprovacao is distinct from 'pendente' then
      return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_PENDENTE'); end if;
    if p_acao = 'aprovar' then
      update demandas.demandas
         set aprovacao = 'aprovada', aprovada_por = m.id, aprovada_em = now(),
             aprovacao_nota = v_txt,
             status = case when responsavel_id is null then 'aberta' else 'execucao' end,
             travada_por = null, travada_nota = null
       where id = d.id;
    else
      if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'TEXTO_VAZIO'); end if;
      update demandas.demandas
         set aprovacao = 'rejeitada', aprovada_por = m.id, aprovada_em = now(),
             aprovacao_nota = v_txt, status = 'cancelada',
             cancelada_motivo = 'Aprovação recusada: ' || v_txt,
             travada_por = null, travada_nota = null
       where id = d.id;
    end if;

  elsif p_acao = 'prazo' then
    if not demandas.pode_atender(m, d) then return jsonb_build_object('ok', false, 'erro', 'NAO_E_SEU_SETOR'); end if;
    update demandas.demandas set prazo = nullif(p_d->>'prazo','')::date,
      sem_prazo_porque = case when nullif(p_d->>'prazo','') is null
                              then coalesce(v_txt, sem_prazo_porque) else sem_prazo_porque end
     where id = d.id;

  elsif p_acao = 'prioridade' then
    /* "a prioridade não deve ser definida apenas pelo solicitante" — quem
       atende revisa. */
    if not demandas.pode_atender(m, d) then return jsonb_build_object('ok', false, 'erro', 'NAO_E_SEU_SETOR'); end if;
    if coalesce(p_d->>'prioridade','') not in ('baixa','normal','alta','urgente') then
      return jsonb_build_object('ok', false, 'erro', 'PRIORIDADE_INVALIDA'); end if;
    update demandas.demandas set prioridade = p_d->>'prioridade',
      impacto = case when p_d->>'prioridade' = 'urgente' then coalesce(v_txt, impacto) else impacto end
     where id = d.id;

  elsif p_acao = 'redirecionar' then
    if m.papel not in ('gestor','admin') and not demandas.pode_atender(m, d) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    if not exists (select 1 from demandas.setores
                    where id = nullif(p_d->>'setor','')::uuid and ativo and atende) then
      return jsonb_build_object('ok', false, 'erro', 'SETOR_NAO_ATENDE'); end if;
    update demandas.demandas
       set setor_responsavel = (p_d->>'setor')::uuid, responsavel_id = null,
           status = case when status = 'execucao' then 'aberta' else status end
     where id = d.id;

  elsif p_acao = 'concluir' then
    if not demandas.pode_atender(m, d) then return jsonb_build_object('ok', false, 'erro', 'NAO_E_SEU_SETOR'); end if;
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'CONCLUSAO_VAZIA'); end if;
    update demandas.demandas
       set status = 'concluida', conclusao = v_txt, concluida_em = now(),
           responsavel_id = coalesce(responsavel_id, m.id),
           travada_por = null, travada_nota = null,
           atraso_motivo = case when prazo is not null and current_date > prazo
                                then nullif(btrim(coalesce(p_d->>'atraso','')),'') else null end
     where id = d.id;

  elsif p_acao = 'cancelar' then
    if not (demandas.pode_atender(m, d) or d.aberta_por = m.id or m.papel in ('gestor','admin')) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'MOTIVO_VAZIO'); end if;
    update demandas.demandas
       set status = 'cancelada', cancelada_motivo = v_txt, travada_por = null, travada_nota = null
     where id = d.id;

  elsif p_acao = 'reabrir' then
    /* "demandas concluídas podem ser reabertas caso o problema não tenha sido
       resolvido" — e quem julga isso é quem pediu. */
    if not (d.aberta_por = m.id or m.papel in ('gestor','admin') or demandas.pode_atender(m, d)) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    if d.status not in ('concluida','cancelada') then
      return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_FECHADA'); end if;
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'TEXTO_VAZIO'); end if;
    insert into demandas.eventos (demanda_id, membro_id, tipo, texto)
      values (d.id, m.id, 'comentario', v_txt);
    /* ---- 19/09/2026, item 7: REABRIR NÃO PODE DESFAZER UMA RECUSA -------

       `rejeitar` grava `aprovacao = 'rejeitada'` E `status = 'cancelada'`.
       `reabrir` aceita qualquer demanda fechada — cancelada inclusive — e
       punha `status = 'execucao'` sem tocar em `aprovacao`. A demanda voltava
       viva carregando `aprovacao = 'rejeitada'`, e nenhum guarda olhava para
       esse valor: `assumir` só recusa `'pendente'`, `destravar` idem.

       Quem podia fazer isso inclui `d.aberta_por = m.id` — ou seja, a própria
       pessoa que teve o pedido recusado. Numa categoria com `exige_aprovacao`
       (é o caso de compra), a liderança recusava o gasto e o solicitante
       devolvia a demanda para a fila de Compras como trabalho aprovado. O
       portão de aprovação É o controle de gasto; ele não pode ter uma porta
       dos fundos.

       Reabrir continua valendo, porque o motivo dele é legítimo. O que muda é
       que reabrir o que foi RECUSADO devolve a demanda AO PORTÃO, não à
       execução: a liderança decide de novo, com o texto da reabertura à
       vista. Reabrir o que foi concluído, ou cancelado sem recusa, segue
       exatamente como era. */
    update demandas.demandas
       set reaberturas = reaberturas + 1,
           conclusao = null, concluida_em = null, cancelada_motivo = null,
           atraso_motivo = null,
           status = case when d.aprovacao = 'rejeitada' then 'travada' else 'execucao' end,
           travada_por = case when d.aprovacao = 'rejeitada' then 'aprovacao' else null end,
           travada_nota = case when d.aprovacao = 'rejeitada'
                               then 'Reaberta depois de recusada: precisa de aprovação de novo.'
                               else null end,
           aprovacao = case when d.aprovacao = 'rejeitada' then 'pendente' else aprovacao end,
           aprovada_por = case when d.aprovacao = 'rejeitada' then null else aprovada_por end,
           aprovada_em = case when d.aprovacao = 'rejeitada' then null else aprovada_em end
     where id = d.id;

  else
    return jsonb_build_object('ok', false, 'erro', 'ACAO_DESCONHECIDA');
  end if;

  return jsonb_build_object('ok', true);
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
end $fn$;

create or replace function public.dem_abrir(p_token text, p_d jsonb)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare
  m demandas.membros; c demandas.categorias; v_setor uuid; v_num int; v_id uuid;
  v_prazo date; v_evd date; v_resp uuid;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

  select * into c from demandas.categorias where id = (p_d->>'categoria_id')::uuid and ativa;
  if c.id is null then return jsonb_build_object('ok', false, 'erro', 'CATEGORIA_INVALIDA'); end if;

  /* o setor solicitante é o de quem abre; gestor pode abrir em nome de outro.

     19/09/2026, item 8: o `coalesce(m.setor_id, v_setor)` da comparação se
     invertia quando `m.setor_id` era NULO — virava `v_setor <> v_setor`, que é
     falso, e o parâmetro do cliente passava inteiro. Membro sem setor podia
     abrir demanda dizendo-se de qualquer setor, e o histórico gravava uma
     origem falsa. Hoje a tela de Ajustes não deixa criar membro sem setor,
     então é porta destrancada em corredor vazio — mas `membros.setor_id` é
     nulável e `dem_ajustar` aceita nulo, então o corredor existe.

     Sem o `coalesce`: quem não é gestor abre pelo próprio setor, ponto. Se
     não tem setor, cai no `SEM_SETOR` logo abaixo, que é a resposta certa. */
  v_setor := coalesce(nullif(p_d->>'setor_solicitante','')::uuid, m.setor_id);
  if m.papel not in ('gestor','admin') then v_setor := m.setor_id; end if;
  if v_setor is null then return jsonb_build_object('ok', false, 'erro', 'SEM_SETOR'); end if;

  /* ---- quem vai ATENDER, e a checagem que faltava ----------------------
     A ordem de preferência é a de antes. O que muda é que o resultado dela
     passa pelo mesmo crivo que `redirecionar` já aplicava: demanda não
     nasce endereçada a setor que não recebe demanda. O caminho que isso
     salva é o do administrador que desativa um setor e esquece que uma
     categoria ainda aponta para ele. */
  v_resp := coalesce(nullif(p_d->>'setor_responsavel','')::uuid, c.setor_id, v_setor);
  if not exists (select 1 from demandas.setores s
                  where s.id = v_resp and s.ativo and s.atende) then
    return jsonb_build_object('ok', false, 'erro', 'SETOR_NAO_ATENDE');
  end if;

  v_prazo := nullif(p_d->>'prazo','')::date;
  v_evd   := nullif(p_d->>'evento_data','')::date;

  insert into demandas.demandas (
    titulo, descricao, objetivo, local, publico,
    categoria_id, setor_solicitante, setor_responsavel,
    prioridade, impacto, prazo, sem_prazo_porque, evento, evento_data, orcamento,
    aberta_por, status, travada_por, travada_nota, aprovacao)
  values (
    btrim(p_d->>'titulo'), btrim(p_d->>'descricao'), nullif(btrim(coalesce(p_d->>'objetivo','')),''),
    nullif(btrim(coalesce(p_d->>'local','')),''), nullif(btrim(coalesce(p_d->>'publico','')),''),
    c.id, v_setor, v_resp,
    coalesce(nullif(p_d->>'prioridade',''), 'normal'),
    nullif(btrim(coalesce(p_d->>'impacto','')),''),
    v_prazo, nullif(btrim(coalesce(p_d->>'sem_prazo_porque','')),''),
    nullif(btrim(coalesce(p_d->>'evento','')),''), v_evd,
    nullif(p_d->>'orcamento','')::numeric,
    m.id,
    case when c.exige_aprovacao then 'travada' else 'aberta' end,
    case when c.exige_aprovacao then 'aprovacao' else null end,
    case when c.exige_aprovacao
         then 'Esta categoria exige aprovação antes da execução.' else null end,
    case when c.exige_aprovacao then 'pendente' else null end)
  returning id, numero into v_id, v_num;

  insert into demandas.eventos (demanda_id, membro_id, tipo, para, texto)
    values (v_id, m.id, 'abertura', 'aberta', null);

  /* anexos por link, quando vieram junto */
  if jsonb_typeof(p_d->'anexos') = 'array' then
    insert into demandas.anexos (demanda_id, nome, url, membro_id)
      select v_id, coalesce(nullif(btrim(a->>'nome'),''), 'anexo'), btrim(a->>'url'), m.id
        from jsonb_array_elements(p_d->'anexos') a
       where btrim(coalesce(a->>'url','')) <> '';
  end if;

  /* UM contato do setor que vai atender, e só: é o que a tela usa para montar
     o link de WhatsApp do aviso. O documento pede notificação; servidor não
     manda WhatsApp, então o sistema prepara a mensagem e a pessoa toca uma
     vez. Devolver a lista inteira de telefones seria expor agenda sem
     necessidade — aqui vai um nome e um número, para este pedido. */
  return jsonb_build_object('ok', true, 'numero', v_num,
    'precisa_aprovacao', c.exige_aprovacao,
    'setor_responsavel', (select s.nome from demandas.setores s where s.id = v_resp),
    'contato', (select jsonb_build_object('nome', x.nome, 'telefone', x.telefone)
                  from demandas.membros x
                 where x.ativo and x.telefone is not null
                   and x.setor_id = v_resp
                 order by case x.papel when 'responsavel' then 0 when 'gestor' then 1
                                       when 'admin' then 2 else 3 end, x.nome
                 limit 1));
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
  when not_null_violation then
    return jsonb_build_object('ok', false, 'erro', 'FALTA_CAMPO', 'regra', SQLERRM);
  /* um uuid que não existe em `categorias`, `setores` ou `membros` chegava
     aqui como erro cru do Postgres e a tela mostrava o texto do banco */
  when foreign_key_violation then
    return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
end $fn$;

do $regras$declare
  v_falta text := '';
begin

  if not exists (select 1 from pg_constraint
                  where conname = 'anexos_url_http_ck'
                    and conrelid = 'demandas.anexos'::regclass) then
    alter table demandas.anexos
      add constraint anexos_url_http_ck check (url ~* '^https?://') not valid;
  end if;

  if not exists (select 1 from pg_constraint
                  where conname = 'demandas_titulo_tam_ck'
                    and conrelid = 'demandas.demandas'::regclass) then
    alter table demandas.demandas
      add constraint demandas_titulo_tam_ck
      check (length(btrim(titulo)) between 3 and 200) not valid;
  end if;

  if not exists (select 1 from pg_constraint
                  where conname = 'demandas_evento_tam_ck'
                    and conrelid = 'demandas.demandas'::regclass) then
    alter table demandas.demandas
      add constraint demandas_evento_tam_ck
      check (evento is null or length(evento) <= 120) not valid;
  end if;

  if not exists (select 1 from pg_constraint
                  where conname = 'demandas_descricao_tam_ck'
                    and conrelid = 'demandas.demandas'::regclass) then
    alter table demandas.demandas
      add constraint demandas_descricao_tam_ck
      check (length(btrim(descricao)) between 1 and 20000) not valid;
  end if;

  begin alter table demandas.anexos validate constraint anexos_url_http_ck;
  exception when check_violation then v_falta := v_falta || 'anexos.url; '; end;

  begin alter table demandas.demandas validate constraint demandas_titulo_tam_ck;
  exception when check_violation then v_falta := v_falta || 'demandas.titulo; '; end;

  begin alter table demandas.demandas validate constraint demandas_evento_tam_ck;
  exception when check_violation then v_falta := v_falta || 'demandas.evento; '; end;

  begin alter table demandas.demandas validate constraint demandas_descricao_tam_ck;
  exception when check_violation then v_falta := v_falta || 'demandas.descricao; '; end;

  if v_falta = '' then
    raise notice 'OK — as quatro regras de texto valem para o que já existe e para o que vier.';
  else
    raise notice 'ATENCAO — regra(s) valendo so para linhas NOVAS, ha linha antiga fora: %', v_falta;
    raise notice '  (as linhas antigas continuam la; conferir e corrigir a mao, depois: alter table ... validate constraint ...)';
  end if;
end
$regras$;

do $grants$declare
  v_cols text;

  v_fora_do_select constant text[] := array['pin_hash'];

  v_pode_escrever constant text[] :=
    array['nome','telefone','ativo','limite_mes','conferido','email','sexo'];
  v_escrever text;
begin
  if to_regclass('public.voluntarios') is null then
    raise notice 'PULEI o GRANT de voluntarios: esta base nao tem public.voluntarios (banco isolado de Demandas).';
    return;
  end if;

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'voluntarios'
     and column_name <> all (v_fora_do_select);

  select string_agg(quote_ident(c), ', ') into v_escrever
    from unnest(v_pode_escrever) c
   where exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='voluntarios'
                    and column_name = c);

  execute 'revoke select, insert, update on public.voluntarios from authenticated';
  execute format('grant select (%s) on public.voluntarios to authenticated', v_cols);
  execute format('grant update (%s) on public.voluntarios to authenticated', v_escrever);
  execute format('grant insert (%s, equipe_id) on public.voluntarios to authenticated', v_escrever);

  execute 'revoke select, update on public.voluntarios from anon';

  raise notice 'OK — GRANT de voluntarios relido do catalogo: SELECT em %, UPDATE restrito.', v_cols;
end
$grants$;

do $c1$begin
  if to_regclass('public.voluntarios') is null then return; end if;
  execute $x$comment on column voluntarios.pin_hash is
  'sha256(pin || token). Fora do GRANT de authenticated desde a 18; a 52 fez dessa exclusao a REGRA (lista de exclusao no lugar de lista de inclusao), para que coluna nova nao repita o apagao de 18/09.'$x$;
  execute $x$comment on column voluntarios.sexo is
  'M ou F. Existe por causa dos postos que so aceitam um (banheiros do Connect, migracao 48). Criada na 48 SEM grant — foi o que derrubou Painel, Escala e Time em 18/09. Desde a 52 o grant se le do catalogo.'$x$;
end
$c1$;

create or replace function public.voluntario_nao_apaga_historico()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_n int;
begin
  select count(*) into v_n from escalacoes where voluntario_id = old.id;
  if v_n > 0 then
    raise exception
      'VOLUNTARIO_COM_HISTORICO: % ja serviu % vez(es). Apagar levaria junto toda a escala dele, sem volta. Use Pausar.',
      old.nome, v_n
      using errcode = 'restrict_violation';
  end if;
  return old;
end $fn$;

do $tg$begin
  if to_regclass('public.voluntarios') is null then
    raise notice 'PULEI o gatilho de historico: esta base nao tem public.voluntarios.';
    return;
  end if;
  drop trigger if exists tg_voluntario_nao_apaga_historico on voluntarios;
  create trigger tg_voluntario_nao_apaga_historico
    before delete on voluntarios
    for each row execute function public.voluntario_nao_apaga_historico();
end
$tg$;

do $rls$declare r record; n int := 0;
begin
  for r in select tablename from pg_tables where schemaname = 'demandas' loop
    execute format('alter table demandas.%I enable row level security', r.tablename);
    n := n + 1;
  end loop;
  raise notice 'OK — RLS ligada em % tabela(s) de demandas (sem policy: e a tranca de reserva).', n;
end
$rls$;

do $conf$declare
  v_erros text := '';
  v_eq uuid; v_fn uuid; v_culto uuid;
  v_tel text := '21' || lpad((floor(random()*900000000)+100000000)::text, 9, '0');
  v_vol uuid;
  v_apagou boolean;
  v_setor_off uuid; v_cat_off uuid;
begin

  if to_regclass('public.voluntarios') is null then
    raise notice 'PULEI os itens 5 e 6 (public.voluntarios nao existe nesta base).';
  else
  if not exists (
    select 1 from information_schema.column_privileges
     where table_schema='public' and table_name='voluntarios'
       and grantee='authenticated' and privilege_type='SELECT'
       and column_name='sexo') then
    v_erros := v_erros || '5) sexo continua fora do SELECT de authenticated; ';
  end if;

  if exists (
    select 1 from information_schema.column_privileges
     where table_schema='public' and table_name='voluntarios'
       and grantee='authenticated' and column_name='pin_hash'
       and privilege_type in ('SELECT','INSERT','UPDATE')) then
    v_erros := v_erros || '5) pin_hash com SELECT/INSERT/UPDATE para authenticated; ';
  end if;
  if exists (
    select 1 from information_schema.column_privileges
     where table_schema='public' and table_name='voluntarios'
       and grantee='authenticated' and privilege_type='UPDATE'
       and column_name in ('equipe_id','token','pessoa_id','id')) then
    v_erros := v_erros || '5) UPDATE alargou demais (equipe_id/token/pessoa_id/id); ';
  end if;

  select e.id into v_eq from equipes e limit 1;
  select f.id into v_fn from funcoes f where f.equipe_id = v_eq limit 1;
  if v_eq is not null and v_fn is not null then
    insert into voluntarios (nome, telefone, equipe_id, ativo)
      values ('Teste Cinquentaedois', v_tel, v_eq, true) returning id into v_vol;

    begin
      delete from voluntarios where id = v_vol;
      v_apagou := true;
    exception when others then v_apagou := false;
    end;
    if not v_apagou then
      v_erros := v_erros || '6a) cadastro SEM historico deixou de poder ser apagado — o gatilho ficou largo demais; ';
    end if;

    insert into voluntarios (nome, telefone, equipe_id, ativo)
      values ('Teste Cinquentaedois', v_tel, v_eq, true) returning id into v_vol;

    select c.id into v_culto from cultos c where c.data = date '2019-01-06';
    if v_culto is null then
      insert into cultos (data) values (date '2019-01-06') returning id into v_culto;
    end if;
    insert into escalacoes (culto_id, funcao_id, voluntario_id, status)
      values (v_culto, v_fn, v_vol, 'pendente');

    begin
      delete from voluntarios where id = v_vol;
      v_apagou := true;
    exception when others then v_apagou := false;
    end;
    if v_apagou then
      v_erros := v_erros || '6b) voluntario COM historico foi apagado e levou a escala junto; ';
    end if;

    delete from escalacoes where voluntario_id = v_vol;
    delete from voluntarios where id = v_vol;
    delete from cultos where id = v_culto and data = date '2019-01-06';
  else
    raise notice 'PULEI 6: nenhuma equipe/funcao para testar.';
  end if;

  end if;

  if not exists (select 1 from pg_constraint
                  where conname='anexos_url_http_ck'
                    and conrelid='demandas.anexos'::regclass) then
    v_erros := v_erros || '3) a restricao de esquema do anexo nao existe; ';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='dem_mover'
       and p.prosrc like '%for update%') then
    v_erros := v_erros || '1) dem_mover nao esta segurando a linha (for update ausente); ';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='dem_abrir'
       and p.prosrc like '%SETOR_NAO_ATENDE%') then
    v_erros := v_erros || '2) dem_abrir nao checa o setor que atende; ';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='dem_mover'
       and p.prosrc like '%Reaberta depois de recusada%') then
    v_erros := v_erros || '7) reabrir ainda desfaz a recusa do gestor; ';
  end if;

  if exists (
    select 1 from pg_tables where schemaname='demandas' and not rowsecurity) then
    v_erros := v_erros || '9) sobrou tabela de demandas sem RLS: '
      || (select string_agg(tablename, ', ') from pg_tables
           where schemaname='demandas' and not rowsecurity) || '; ';
  end if;

  if v_erros = '' then

    if to_regclass('public.voluntarios') is null then
      raise notice 'OK — 7/7 conferidos nesta base (5 e 6 pulados por falta de public.voluntarios): trava de concorrencia, setor validado, anexo so http, texto com teto, recusa que nao se desfaz, setor solicitante sem inversao, RLS de reserva.';
    else
      raise notice 'OK — 9/9 conferidos: trava de concorrencia, setor validado, anexo so http, texto com teto, grant do catalogo, historico protegido, recusa que nao se desfaz, setor solicitante sem inversao, RLS de reserva.';
    end if;
  else
    raise exception 'FALHOU — %', v_erros;
  end if;
end
$conf$;
