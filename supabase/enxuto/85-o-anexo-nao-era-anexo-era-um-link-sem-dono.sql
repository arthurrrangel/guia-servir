do $tranca$begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(85);
  end if;
end
$tranca$;

begin;

create or replace function demandas.url_autoridade(u text) returns text
language sql immutable parallel safe as $fn$
  select pg_catalog.substring(
    pg_catalog.regexp_replace(coalesce(u,''), '^[A-Za-z][A-Za-z0-9+.-]*://', ''),
    '^[^/?#]*')
$fn$;

create or replace function demandas.url_host(u text) returns text
language sql immutable parallel safe as $fn$
  /* da autoridade, tira o `usuario:senha@` e a porta */
  select lower(pg_catalog.substring(
    pg_catalog.regexp_replace(demandas.url_autoridade(u), '^[^@]*@', ''),
    '^[^:]+'))
$fn$;

create or replace function demandas.url_boa(u text) returns boolean
language sql immutable parallel safe as $fn$
  select u is not null
     and u ~ '^https://'                               -- sem TLS nao entra
     and length(u) between 12 and 2048
     and u !~ '[[:space:]]'                            -- url com espaco nao e url
     and demandas.url_autoridade(u) !~ '@'             -- sem usuario:senha@
     /* host que e IP literal, ou nome sem ponto (localhost, intranet, um
        container qualquer): nao e lugar de onde a igreja guarda arquivo, e e
        exatamente o que se usa para fazer o navegador de quem aprova bater
        na rede interna. */
     and demandas.url_host(u) ~ '\.'
     and demandas.url_host(u) !~ '^[0-9.]+$'
     and demandas.url_host(u) !~ '^\[?[0-9a-f:]+\]?$'
     and demandas.url_host(u) !~ '(^|\.)localhost$'
$fn$;

comment on function demandas.url_boa(text) is
  'A unica definicao de "link aceitavel como anexo": https, sem credencial '
  'embutida, host com ponto e que nao seja IP nem localhost, ate 2048 letras. '
  'Usada pela CHECK e pelo dem_mover. Ver a migracao 85.';

create or replace function demandas.rotulo_do_anexo(p_nome text, p_url text)
returns text language sql immutable parallel safe as $fn$
  select left(
    case
      when demandas.url_host(p_url) is null then coalesce(demandas.limpo(p_nome), 'anexo')
      when coalesce(demandas.limpo(p_nome), '') = '' then demandas.url_host(p_url)
      /* se quem colou ja escreveu o host no rotulo, nao repete */
      when position(demandas.url_host(p_url) in lower(demandas.limpo(p_nome))) > 0
        then demandas.limpo(p_nome)
      else demandas.limpo(p_nome) || ' · ' || demandas.url_host(p_url)
    end, 200)
$fn$;

alter table demandas.anexos add column if not exists removido_em timestamptz;
alter table demandas.anexos add column if not exists removido_por uuid references demandas.membros(id);

alter table demandas.anexos drop constraint if exists anexos_url_http_ck;
alter table demandas.anexos drop constraint if exists anexos_url_ck;
alter table demandas.anexos add constraint anexos_url_ck
  check (demandas.url_boa(url)) not valid;
alter table demandas.anexos drop constraint if exists anexos_nome_tam_ck;
alter table demandas.anexos add constraint anexos_nome_tam_ck
  check (length(demandas.limpo(nome)) between 1 and 200) not valid;

create unique index if not exists ux_anexos_vivo
  on demandas.anexos (demanda_id, url) where removido_em is null;

create or replace function public.dem_mover(p_token text, p_numero integer, p_acao text,
                                            p_d jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'demandas','public'
as $function$
declare
  m demandas.membros; d demandas.demandas;
  v_txt text := demandas.limpo(p_d->>'texto');
  v_motivo text := coalesce(p_d->>'motivo','');
  v_url text; v_rot text; v_n int;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

  /* `for update` segura a linha ate o fim da transacao. Quem chegar depois
     espera, e entao rele o estado JA gravado, que e o estado que o guarda de
     JA_FECHADA precisa julgar. */
  select * into d from demandas.demandas where numero = p_numero for update;

  if d.id is null then return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;
  if not demandas.pode_ver(m, d) then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

  /* 84 · A CURA. Se o portao esta aberto pela categoria mas a coluna nunca
     soube disso, o banco passa a dizer em voz alta o que a guarda ja ia
     cobrar em silencio. */
  if d.aprovacao is null and demandas.falta_aprovacao(d) then
    update demandas.demandas
       set aprovacao = 'pendente',
           status = case when status in ('aberta','execucao') then 'travada' else status end,
           travada_por = case when status in ('aberta','execucao') then 'aprovacao' else travada_por end,
           travada_nota = case when status in ('aberta','execucao')
                               then 'A categoria passou a exigir aprovacao depois que esta demanda foi aberta.'
                               else travada_nota end
     where id = d.id;
    insert into demandas.eventos (demanda_id, membro_id, tipo, para, texto)
      values (d.id, null, 'aprovacao', 'pendente',
              'A categoria passou a exigir aprovacao depois que esta demanda foi aberta.');
    select * into d from demandas.demandas where id = d.id for update;
  end if;

  /* Demanda fechada so aceita comentario, anexo e reabertura. */
  if d.status in ('concluida','cancelada')
     and p_acao not in ('comentar','anexar','desanexar','reabrir') then
    return jsonb_build_object('ok', false, 'erro', 'JA_FECHADA');
  end if;

  if p_acao = 'comentar' then
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'TEXTO_VAZIO'); end if;
    /* 85 · O TOQUE DUPLO NAO E MA-FE, E 4G RUIM. O mesmo texto, da mesma
       pessoa, na mesma demanda, em 20 segundos, e o mesmo comentario.
       Devolve `ok` de proposito: para quem tocou duas vezes o resultado
       desejado ja aconteceu, e erro em tela para acao que deu certo e pior
       que silencio. */
    if exists (select 1 from demandas.eventos e
                where e.demanda_id = d.id and e.membro_id = m.id
                  and e.tipo = 'comentario' and e.texto = v_txt
                  and e.em > now() - interval '20 seconds') then
      return jsonb_build_object('ok', true, 'repetido', true);
    end if;
    insert into demandas.eventos (demanda_id, membro_id, tipo, texto, interno)
      values (d.id, m.id, 'comentario', v_txt,
              coalesce((p_d->>'interno')::boolean, false) and demandas.pode_atender(m, d));
    update demandas.demandas set mexida_em = now() where id = d.id;

  elsif p_acao = 'anexar' then
    /* 85 · ERA `pode_ver`, que e todo mundo do setor. `destravar`, que e
       menos perigosa, ja exigia este par. */
    if not (demandas.pode_atender(m, d) or d.aberta_por = m.id) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    v_url := demandas.limpo(p_d->>'url');
    if v_url is null then return jsonb_build_object('ok', false, 'erro', 'URL_VAZIA'); end if;
    if not demandas.url_boa(v_url) then
      return jsonb_build_object('ok', false, 'erro', 'URL_INVALIDA'); end if;
    select count(*) into v_n from demandas.anexos
     where demanda_id = d.id and removido_em is null;
    if v_n >= 20 then return jsonb_build_object('ok', false, 'erro', 'ANEXOS_DEMAIS'); end if;
    v_rot := demandas.rotulo_do_anexo(p_d->>'nome', v_url);
    /* o mesmo link duas vezes e toque duplo */
    if exists (select 1 from demandas.anexos
                where demanda_id = d.id and url = v_url and removido_em is null) then
      return jsonb_build_object('ok', true, 'repetido', true);
    end if;
    insert into demandas.anexos (demanda_id, nome, url, membro_id)
      values (d.id, v_rot, v_url, m.id);
    insert into demandas.eventos (demanda_id, membro_id, tipo, texto)
      values (d.id, m.id, 'anexo', v_rot);
    update demandas.demandas set mexida_em = now() where id = d.id;

  elsif p_acao = 'desanexar' then
    /* 85 · quem atende tira qualquer um; quem colou tira o proprio. Marca, nao
       apaga: a pergunta que se faz depois de um boleto trocado e "quem pos
       isso aqui, e quando", e apagar a linha faz o historico responder que
       nunca existiu. */
    update demandas.anexos a
       set removido_em = now(), removido_por = m.id
     where a.demanda_id = d.id and a.removido_em is null
       and a.id = nullif(p_d->>'anexo_id','')::uuid
       and (demandas.pode_atender(m, d) or a.membro_id = m.id)
     returning a.nome into v_rot;
    if v_rot is null then return jsonb_build_object('ok', false, 'erro', 'ANEXO_NAO_ENCONTRADO'); end if;
    insert into demandas.eventos (demanda_id, membro_id, tipo, texto)
      values (d.id, m.id, 'anexo', 'Tirou o anexo: ' || v_rot);
    update demandas.demandas set mexida_em = now() where id = d.id;

  elsif p_acao = 'assumir' then
    if not demandas.pode_atender(m, d) then return jsonb_build_object('ok', false, 'erro', 'NAO_E_SEU_SETOR'); end if;
    if demandas.falta_aprovacao(d) then return jsonb_build_object('ok', false, 'erro', 'FALTA_APROVACAO'); end if;
    update demandas.demandas
       set responsavel_id = m.id, status = 'execucao', travada_por = null, travada_nota = null
     where id = d.id;

  elsif p_acao = 'travar' then
    if not demandas.pode_atender(m, d) then return jsonb_build_object('ok', false, 'erro', 'NAO_E_SEU_SETOR'); end if;
    if v_motivo not in ('informacao','aprovacao','terceiros') then
      return jsonb_build_object('ok', false, 'erro', 'MOTIVO_INVALIDO'); end if;
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'TEXTO_VAZIO'); end if;
    if demandas.falta_aprovacao(d) and v_motivo <> 'aprovacao' then
      return jsonb_build_object('ok', false, 'erro', 'FALTA_APROVACAO'); end if;
    if v_motivo = 'aprovacao' and d.aprovacao = 'aprovada'
       and m.papel not in ('gestor','admin') then
      return jsonb_build_object('ok', false, 'erro', 'SO_GESTOR_REABRE_APROVACAO'); end if;
    update demandas.demandas
       set status = 'travada', travada_por = v_motivo, travada_nota = v_txt,
           aprovacao = case when v_motivo = 'aprovacao' then 'pendente' else aprovacao end,
           aprovada_por = case when v_motivo = 'aprovacao' then null else aprovada_por end,
           aprovada_em  = case when v_motivo = 'aprovacao' then null else aprovada_em end
     where id = d.id;

  elsif p_acao = 'destravar' then
    if not (demandas.pode_atender(m, d) or d.aberta_por = m.id) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    if d.status <> 'travada' then return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_TRAVADA'); end if;
    if demandas.falta_aprovacao(d) then
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
    if not demandas.falta_aprovacao(d) then
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
    if demandas.falta_aprovacao(d) then return jsonb_build_object('ok', false, 'erro', 'FALTA_APROVACAO'); end if;
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'CONCLUSAO_VAZIA'); end if;
    update demandas.demandas
       set status = 'concluida', conclusao = v_txt, concluida_em = now(),
           responsavel_id = coalesce(responsavel_id, m.id),
           travada_por = null, travada_nota = null,
           atraso_motivo = case when prazo is not null and current_date > prazo
                                then demandas.limpo(p_d->>'atraso') else null end
     where id = d.id;

  elsif p_acao = 'cancelar' then
    if not (demandas.pode_atender(m, d) or d.aberta_por = m.id or m.papel in ('gestor','admin')) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'MOTIVO_VAZIO'); end if;
    update demandas.demandas
       set status = 'cancelada', cancelada_motivo = v_txt, travada_por = null, travada_nota = null
     where id = d.id;

  elsif p_acao = 'reabrir' then
    if not (d.aberta_por = m.id or m.papel in ('gestor','admin') or demandas.pode_atender(m, d)) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    if d.status not in ('concluida','cancelada') then
      return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_FECHADA'); end if;
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'TEXTO_VAZIO'); end if;
    insert into demandas.eventos (demanda_id, membro_id, tipo, texto)
      values (d.id, m.id, 'comentario', v_txt);
    update demandas.demandas
       set reaberturas = reaberturas + 1,
           conclusao = null, concluida_em = null, cancelada_motivo = null,
           atraso_motivo = null,
           status = case when d.aprovacao in ('rejeitada','pendente') then 'travada'
                         when responsavel_id is null then 'aberta'
                         else 'execucao' end,
           travada_por = case when d.aprovacao in ('rejeitada','pendente') then 'aprovacao' else null end,
           travada_nota = case when d.aprovacao = 'rejeitada'
                               then 'Reaberta depois de recusada: precisa de aprovação de novo.'
                               when d.aprovacao = 'pendente'
                               then 'Reaberta antes de ser aprovada: continua esperando a aprovação.'
                               else null end,
           aprovacao = case when d.aprovacao in ('rejeitada','pendente') then 'pendente' else aprovacao end,
           aprovada_por = case when d.aprovacao in ('rejeitada','pendente') then null else aprovada_por end,
           aprovada_em = case when d.aprovacao in ('rejeitada','pendente') then null else aprovada_em end
     where id = d.id;

  else
    return jsonb_build_object('ok', false, 'erro', 'ACAO_DESCONHECIDA');
  end if;

  return jsonb_build_object('ok', true);
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
  when unique_violation then
    /* o indice dos vivos disparando e sempre o mesmo caso: o mesmo link
       chegou duas vezes no mesmo instante, por dois toques que correram
       juntos. O primeiro gravou; o segundo nao precisa gravar. */
    return jsonb_build_object('ok', true, 'repetido', true);
end $function$;

create or replace function public.dem_abrir(p_token text, p_d jsonb)
returns jsonb language plpgsql security definer set search_path to 'demandas','public'
as $function$
declare
  m demandas.membros; c demandas.categorias; v_setor uuid; v_num int; v_id uuid;
  v_prazo date; v_evd date; v_resp uuid; v_status text; v_maus int;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

  select * into c from demandas.categorias where id = (p_d->>'categoria_id')::uuid and ativa;
  if c.id is null then return jsonb_build_object('ok', false, 'erro', 'CATEGORIA_INVALIDA'); end if;

  v_setor := coalesce(nullif(p_d->>'setor_solicitante','')::uuid, m.setor_id);
  if m.papel not in ('gestor','admin') then v_setor := m.setor_id; end if;
  if v_setor is null then return jsonb_build_object('ok', false, 'erro', 'SEM_SETOR'); end if;

  v_resp := coalesce(nullif(p_d->>'setor_responsavel','')::uuid, c.setor_id, v_setor);
  if not exists (select 1 from demandas.setores s
                  where s.id = v_resp and s.ativo and s.atende) then
    return jsonb_build_object('ok', false, 'erro', 'SETOR_NAO_ATENDE');
  end if;

  /* 85 · os anexos sao julgados ANTES de a demanda nascer. Nascer e depois
     recusar o anexo deixaria a pessoa com uma demanda aberta sem o documento
     que era o motivo de ela estar abrindo. */
  if jsonb_typeof(p_d->'anexos') = 'array' then
    if jsonb_array_length(p_d->'anexos') > 20 then
      return jsonb_build_object('ok', false, 'erro', 'ANEXOS_DEMAIS'); end if;
    select count(*) into v_maus from jsonb_array_elements(p_d->'anexos') a
     where demandas.limpo(a->>'url') is not null
       and not demandas.url_boa(demandas.limpo(a->>'url'));
    if v_maus > 0 then return jsonb_build_object('ok', false, 'erro', 'URL_INVALIDA'); end if;
  end if;

  v_prazo := nullif(p_d->>'prazo','')::date;
  v_evd   := nullif(p_d->>'evento_data','')::date;
  v_status := case when c.exige_aprovacao then 'travada' else 'aberta' end;

  insert into demandas.demandas (
    titulo, descricao, objetivo, local, publico,
    categoria_id, setor_solicitante, setor_responsavel,
    prioridade, impacto, prazo, sem_prazo_porque, evento, evento_data, orcamento,
    aberta_por, status, travada_por, travada_nota, aprovacao)
  values (
    demandas.limpo(p_d->>'titulo'), demandas.limpo(p_d->>'descricao'), demandas.limpo(p_d->>'objetivo'),
    demandas.limpo(p_d->>'local'), demandas.limpo(p_d->>'publico'),
    c.id, v_setor, v_resp,
    coalesce(nullif(p_d->>'prioridade',''), 'normal'),
    demandas.limpo(p_d->>'impacto'),
    v_prazo, demandas.limpo(p_d->>'sem_prazo_porque'),
    demandas.limpo(p_d->>'evento'), v_evd,
    nullif(p_d->>'orcamento','')::numeric,
    m.id, v_status,
    case when c.exige_aprovacao then 'aprovacao' else null end,
    case when c.exige_aprovacao
         then 'Esta categoria exige aprovação antes da execução.' else null end,
    case when c.exige_aprovacao then 'pendente' else null end)
  returning id, numero into v_id, v_num;

  insert into demandas.eventos (demanda_id, membro_id, tipo, para, texto)
    values (v_id, m.id, 'abertura', v_status, null);

  if jsonb_typeof(p_d->'anexos') = 'array' then
    insert into demandas.anexos (demanda_id, nome, url, membro_id)
      select v_id,
             demandas.rotulo_do_anexo(a->>'nome', demandas.limpo(a->>'url')),
             demandas.limpo(a->>'url'), m.id
        from jsonb_array_elements(p_d->'anexos') a
       where demandas.limpo(a->>'url') is not null
      on conflict do nothing;
  end if;

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
  when foreign_key_violation then
    return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
end $function$;

create or replace function public.dem_ver(p_token text, p_numero integer)
returns jsonb language plpgsql security definer set search_path to 'demandas','public'
as $function$
declare m demandas.membros; d demandas.demandas; v_interno boolean;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  select * into d from demandas.demandas where numero = p_numero;
  if d.id is null then return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;
  if not demandas.pode_ver(m, d) then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  v_interno := demandas.pode_atender(m, d);

  return jsonb_build_object('ok', true,
    'demanda', demandas.resumo(d) || jsonb_build_object(
      'descricao', d.descricao, 'objetivo', d.objetivo, 'local', d.local,
      'publico', d.publico, 'impacto', d.impacto, 'orcamento', d.orcamento,
      'sem_prazo_porque', d.sem_prazo_porque,
      'travada_nota', d.travada_nota, 'aprovacao_nota', d.aprovacao_nota,
      'conclusao', d.conclusao, 'concluida_em', d.concluida_em,
      'atraso_motivo', d.atraso_motivo, 'cancelada_motivo', d.cancelada_motivo,
      'categoria_id', d.categoria_id,
      'setor_responsavel_id', d.setor_responsavel,
      'responsavel_id', d.responsavel_id,
      'abriu_telefone', (select x.telefone from demandas.membros x where x.id = d.aberta_por),
      'resp_telefone', (select x.telefone from demandas.membros x where x.id = d.responsavel_id)),
    'eu', jsonb_build_object('id', m.id, 'papel', m.papel,
      'atende', demandas.pode_atender(m, d), 'abriu', d.aberta_por = m.id),
    'eventos', coalesce((select jsonb_agg(jsonb_build_object(
        'em', e.em, 'tipo', e.tipo, 'de', e.de, 'para', e.para, 'texto', e.texto,
        'interno', e.interno,
        'quem', (select x.nome from demandas.membros x where x.id = e.membro_id))
        order by e.em, e.id)
      from demandas.eventos e where e.demanda_id = d.id
        and (v_interno or not e.interno)), '[]'::jsonb),
    'anexos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'nome', a.nome, 'url', a.url, 'em', a.em,
        /* quem colou, para que a pergunta "quem pos isso aqui" tenha resposta
           na propria ficha, e nao so no historico */
        'quem', (select x.nome from demandas.membros x where x.id = a.membro_id),
        /* e se chegou depois de a demanda fechar, a ficha diz. Anexo posterior
           continua permitido, mas prestacao de contas fechada em marco que
           recebe "nota fiscal REAL.pdf" em setembro nao pode parecer igual ao
           que estava la quando a decisao foi tomada. */
        'depois_de_fechar', d.concluida_em is not null and a.em > d.concluida_em)
        order by a.em)
      from (select * from demandas.anexos x
             where x.demanda_id = d.id and x.removido_em is null
             order by x.em limit 50) a), '[]'::jsonb));
end $function$;

do $conf$declare
  falhas text[] := '{}'; avisos text[] := '{}';
  v_set uuid; v_cat uuid; v_ana uuid; v_eva uuid; v_ges uuid;
  r jsonb; n int; v_i int; v_ch text; v_aid uuid; v_nome text; base jsonb;
  URLS_RUINS text[] := array[
    'http://sem-tls.example/a.pdf',
    'https://usuario:senha@evil.example/a.pdf',
    'http://192.168.0.1/admin',
    'https://169.254.169.254/latest/meta-data/',
    'https://localhost/a.pdf',
    'https://intranet/a.pdf',
    'javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'file:///etc/passwd',
    'https://[::1]/a.pdf',
    'https://10.0.0.1/a.pdf'];
begin
  insert into demandas.setores (nome, slug, ativo, atende, ordem)
    values ('CONF 85 setor', 'conf-85-setor', true, true, 92) returning id into v_set;
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, ativa)
    values ('CONF 85', 'livre', v_set, false, true) returning id into v_cat;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('CONF85 Ana', 'conf85-ana', 'responsavel', v_set, true) returning id into v_ana;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('CONF85 Eva', 'conf85-eva', 'solicitante', v_set, true) returning id into v_eva;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('CONF85 Gestor', 'conf85-ges', 'gestor', v_set, true) returning id into v_ges;

  base := jsonb_build_object('descricao','Pedido da conferencia da migracao 85.',
                             'setor_solicitante', v_set, 'prazo', (current_date + 30)::text,
                             'categoria_id', v_cat);

  for v_i in 1 .. array_length(URLS_RUINS, 1) loop
    if demandas.url_boa(URLS_RUINS[v_i]) then
      falhas := falhas || format('1: url_boa aceitou %s', URLS_RUINS[v_i]);
    end if;
  end loop;
  for v_ch in select unnest(array[
      'https://drive.google.com/file/d/1AbCd/view?usp=sharing',
      'https://photos.google.com/share/xyz',
      'https://igreja.sharepoint.com/sites/adm/nota.pdf',
      'https://www.dropbox.com/s/abc/orcamento.pdf?dl=0']) loop
    if not demandas.url_boa(v_ch) then
      falhas := falhas || format('1: url_boa recusou um link de verdade: %s', v_ch);
    end if;
  end loop;

  r := public.dem_abrir('conf85-ana', base || jsonb_build_object('titulo','Compra do projetor'));
  n := (r->>'numero')::int;
  r := public.dem_mover('conf85-eva', n, 'anexar',
        '{"url":"https://evil.example/boleto.pdf","nome":"boleto atualizado.pdf"}'::jsonb);
  if coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || '2: o solicitante do setor pregou um boleto na compra de outra pessoa'::text;
  end if;

  r := public.dem_abrir('conf85-eva', base || jsonb_build_object('titulo','Pedido da Eva'));
  v_i := (r->>'numero')::int;
  r := public.dem_mover('conf85-eva', v_i, 'anexar',
        '{"url":"https://drive.google.com/file/d/EVA/view","nome":"orcamento"}'::jsonb);
  if not coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || format('2: quem abriu nao consegue anexar na propria demanda: %s', r::text);
  end if;

  for v_i in 1 .. array_length(URLS_RUINS, 1) loop
    r := public.dem_mover('conf85-ana', n, 'anexar',
          jsonb_build_object('url', URLS_RUINS[v_i], 'nome','nota fiscal REAL.pdf'));
    if coalesce((r->>'ok')::boolean, false) then
      falhas := falhas || format('3: anexar aceitou %s', URLS_RUINS[v_i]);
    end if;
  end loop;

  r := public.dem_abrir('conf85-ana', base || jsonb_build_object('titulo','Com anexo ruim',
        'anexos', jsonb_build_array(jsonb_build_object('url','http://192.168.0.1/admin','nome','x'))));
  if coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || '4: dem_abrir deixou entrar um anexo apontando para a rede local'::text;
  elsif r->>'erro' <> 'URL_INVALIDA' then

    falhas := falhas || format('4: dem_abrir recusou pela CHECK e nao pelo guarda: erro=%s. '
      'A pessoa recebe texto de constraint em vez de "esse link nao serve".', r->>'erro');
  end if;
  r := public.dem_abrir('conf85-ana', base || jsonb_build_object('titulo','Com anexos demais',
        'anexos', (select jsonb_agg(jsonb_build_object('url','https://a.example/'||g,'nome','x'))
                     from generate_series(1,30) g)));
  if coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || '4: dem_abrir aceitou 30 anexos numa chamada so'::text;
  end if;

  r := public.dem_mover('conf85-ana', n, 'anexar',
        '{"url":"https://evil.example/x.pdf","nome":"nota fiscal REAL.pdf"}'::jsonb);
  select a.nome into v_nome from demandas.anexos a
    join demandas.demandas d on d.id = a.demanda_id
   where d.numero = n and a.url = 'https://evil.example/x.pdf';
  if v_nome is null then
    falhas := falhas || '5: o anexo de teste nao entrou; o caso 5 nao mediu nada'::text;
  elsif position('evil.example' in v_nome) = 0 then
    falhas := falhas || format('5: o rotulo nao diz para onde vai: "%s"', v_nome);
  end if;

  r := public.dem_mover('conf85-ana', n, 'anexar',
        '{"url":"https://drive.google.com/file/d/Z/view","nome":"orcamento no drive.google.com"}'::jsonb);
  select a.nome into v_nome from demandas.anexos a
    join demandas.demandas d on d.id = a.demanda_id
   where d.numero = n and a.url like '%file/d/Z%';
  if v_nome like '%drive.google.com%drive.google.com%' then
    falhas := falhas || format('5: o rotulo repetiu o host: "%s"', v_nome);
  end if;

  for v_i in 1 .. 30 loop
    perform public.dem_mover('conf85-ana', n, 'anexar',
      jsonb_build_object('url', 'https://a.example/doc-' || v_i, 'nome', 'doc'));
  end loop;
  select count(*) into v_i from demandas.anexos a
    join demandas.demandas d on d.id = a.demanda_id
   where d.numero = n and a.removido_em is null;
  if v_i > 20 then
    falhas := falhas || format('6: a demanda ficou com %s anexos; o teto e 20', v_i);
  end if;

  r := public.dem_abrir('conf85-ana', base || jsonb_build_object('titulo','Toque duplo'));
  v_i := (r->>'numero')::int;
  perform public.dem_mover('conf85-ana', v_i, 'anexar', '{"url":"https://a.example/mesmo.pdf","nome":"m"}'::jsonb);
  perform public.dem_mover('conf85-ana', v_i, 'anexar', '{"url":"https://a.example/mesmo.pdf","nome":"m"}'::jsonb);
  perform public.dem_mover('conf85-ana', v_i, 'anexar', '{"url":"https://a.example/mesmo.pdf","nome":"m"}'::jsonb);
  declare v_q int; begin
    select count(*) into v_q from demandas.anexos a
      join demandas.demandas d on d.id = a.demanda_id
     where d.numero = v_i and a.removido_em is null;
    if v_q <> 1 then
      falhas := falhas || format('6: tres toques no mesmo link geraram %s anexos', v_q);
    end if;
  end;
  perform public.dem_mover('conf85-ana', v_i, 'comentar', '{"texto":"mesmo texto"}'::jsonb);
  perform public.dem_mover('conf85-ana', v_i, 'comentar', '{"texto":"mesmo texto"}'::jsonb);
  perform public.dem_mover('conf85-ana', v_i, 'comentar', '{"texto":"mesmo texto"}'::jsonb);
  declare v_q int; begin
    select count(*) into v_q from demandas.eventos e
      join demandas.demandas d on d.id = e.demanda_id
     where d.numero = v_i and e.texto = 'mesmo texto';
    if v_q <> 1 then
      falhas := falhas || format('6: tres toques no mesmo comentario geraram %s linhas', v_q);
    end if;
  end;

  perform public.dem_mover('conf85-ana', v_i, 'comentar', '{"texto":"outra coisa"}'::jsonb);
  declare v_q int; begin
    select count(*) into v_q from demandas.eventos e
      join demandas.demandas d on d.id = e.demanda_id
     where d.numero = v_i and e.tipo = 'comentario';
    if v_q <> 2 then
      falhas := falhas || format('6: a janela de 20s comeu um comentario diferente (%s comentarios)', v_q);
    end if;
  end;

  r := public.dem_abrir('conf85-eva', base || jsonb_build_object('titulo','Para tirar'));
  v_i := (r->>'numero')::int;
  perform public.dem_mover('conf85-eva', v_i, 'anexar', '{"url":"https://a.example/da-eva.pdf","nome":"da eva"}'::jsonb);
  select a.id into v_aid from demandas.anexos a join demandas.demandas d on d.id = a.demanda_id
   where d.numero = v_i;

  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('CONF85 Rita', 'conf85-rita', 'solicitante', v_set, true);
  if public.dem_ver('conf85-rita', v_i)->>'erro' is not null then
    falhas := falhas || '7: a Rita nem enxerga a demanda; o caso nao mede o guarda do desanexar'::text;
  end if;
  r := public.dem_mover('conf85-rita', v_i, 'desanexar', jsonb_build_object('anexo_id', v_aid));
  if coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || '7: quem e do setor mas nao atende nem colou tirou o anexo dos outros'::text;
  end if;
  r := public.dem_mover('conf85-eva', v_i, 'desanexar', jsonb_build_object('anexo_id', v_aid));
  if not coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || format('7: quem colou nao consegue tirar o proprio anexo: %s', r::text);
  end if;
  if not exists (select 1 from demandas.anexos where id = v_aid and removido_em is not null) then
    falhas := falhas || '7: desanexar nao marcou removido_em'::text;
  end if;
  if not exists (select 1 from demandas.anexos where id = v_aid) then
    falhas := falhas || '7: desanexar APAGOU a linha; o historico passa a dizer que o anexo nunca existiu'::text;
  end if;
  if (public.dem_ver('conf85-eva', v_i)->'anexos') <> '[]'::jsonb then
    falhas := falhas || '7: a ficha continua mostrando o anexo tirado'::text;
  end if;
  if not exists (select 1 from demandas.eventos e join demandas.demandas d on d.id = e.demanda_id
                  where d.numero = v_i and e.texto like 'Tirou o anexo:%') then
    falhas := falhas || '7: tirar um anexo nao deixou rastro no historico'::text;
  end if;

  r := public.dem_abrir('conf85-ana', base || jsonb_build_object('titulo','Prestacao de contas'));
  v_i := (r->>'numero')::int;
  perform public.dem_mover('conf85-ana', v_i, 'anexar', '{"url":"https://a.example/antes.pdf","nome":"antes"}'::jsonb);
  perform public.dem_mover('conf85-ana', v_i, 'concluir', '{"texto":"comprado"}'::jsonb);
  perform public.dem_mover('conf85-ana', v_i, 'anexar', '{"url":"https://a.example/depois.pdf","nome":"depois"}'::jsonb);

  update demandas.anexos a set em = a.em + interval '1 hour'
    from demandas.demandas d
   where d.id = a.demanda_id and d.numero = v_i and a.url like '%depois.pdf';
  r := public.dem_ver('conf85-ana', v_i);
  if (select count(*) from jsonb_array_elements(r->'anexos') a
       where (a->>'depois_de_fechar')::boolean) <> 1 then
    falhas := falhas || '8: a ficha nao separa o anexo que chegou depois de a demanda fechar'::text;
  end if;
  if (select count(*) from jsonb_array_elements(r->'anexos') a
       where a->>'quem' is null) > 0 then
    falhas := falhas || '8: a ficha nao diz quem colou o anexo'::text;
  end if;
  if (select count(*) from jsonb_array_elements(r->'anexos') a
       where a->>'id' is null) > 0 then
    falhas := falhas || '8: a ficha nao devolve o id do anexo; a tela nao tem como oferecer tirar'::text;
  end if;

  r := public.dem_abrir('conf85-ana', base || jsonb_build_object('titulo','Caminho normal',
        'anexos', jsonb_build_array(
          jsonb_build_object('url','https://drive.google.com/file/d/OK/view','nome','orcamento.pdf'))));
  if not coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || format('9: abrir com anexo bom parou de funcionar: %s', r::text);
  end if;
  v_i := (r->>'numero')::int;
  if jsonb_array_length(public.dem_ver('conf85-ana', v_i)->'anexos') <> 1 then
    falhas := falhas || '9: o anexo bom nao chegou na ficha'::text;
  end if;

  select count(*) into v_i from demandas.anexos where not demandas.url_boa(url);
  if v_i > 0 then
    avisos := avisos || format('%s anexo(s) ja gravado(s) nao passariam na regra nova (http sem TLS, '
      'IP, credencial embutida ou tamanho). A CHECK entrou NOT VALID: eles continuam visiveis e '
      'agora podem ser tirados pela tela.', v_i);
  end if;

  delete from demandas.eventos where demanda_id in
    (select id from demandas.demandas where setor_solicitante = v_set);
  delete from demandas.anexos where demanda_id in
    (select id from demandas.demandas where setor_solicitante = v_set);
  delete from demandas.demandas where setor_solicitante = v_set;
  delete from demandas.membros where token like 'conf85-%';
  delete from demandas.categorias where grupo = 'CONF 85';
  delete from demandas.setores where slug = 'conf-85-setor';

  foreach v_ch in array avisos loop raise notice '85 · AVISO: %', v_ch; end loop;
  if array_length(falhas, 1) > 0 then
    raise exception E'85 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 85 · conferencia: 10 blocos. Anexo tem dono, o rotulo carrega o destino, a url passa por crivo nas DUAS portas, teto de 20, toque duplo nao duplica, e o que foi tirado sai da ficha sem sair do historico.';
end
$conf$;

insert into schema_versao (n, arquivo)
     values (85, '85-o-anexo-nao-era-anexo-era-um-link-sem-dono.sql')
on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();

commit;
