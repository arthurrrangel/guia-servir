do $tranca$begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(51);
  end if;
end
$tranca$;

create schema if not exists demandas;

create table if not exists demandas.setores (
  id     uuid primary key default gen_random_uuid(),
  nome   text not null,
  slug   text not null unique,
  atende boolean not null default false,
  ordem  int not null default 0,
  ativo  boolean not null default true
);

create table if not exists demandas.membros (
  id         uuid primary key default gen_random_uuid(),
  pessoa_id  uuid,
  nome       text not null,
  email      text,
  telefone   text,
  auth_email text,
  setor_id   uuid references demandas.setores(id),
  papel      text not null default 'solicitante',
  token      text unique,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);
do $$begin
  alter table demandas.membros add constraint ck_papel
    check (papel in ('solicitante','responsavel','gestor','admin'));
exception when duplicate_object then null; end
$$;
create unique index if not exists ix_membros_auth
  on demandas.membros (lower(auth_email)) where auth_email is not null;
create index if not exists ix_membros_setor on demandas.membros (setor_id);

create table if not exists demandas.categorias (
  id               uuid primary key default gen_random_uuid(),
  grupo            text not null,
  nome             text not null,
  setor_id         uuid references demandas.setores(id),
  exige_aprovacao  boolean not null default false,
  exige_orcamento  boolean not null default false,
  prazo_padrao_dias int,
  ordem            int not null default 0,
  ativa            boolean not null default true,
  unique (grupo, nome)
);

create sequence if not exists demandas.numero_seq start 1;

create table if not exists demandas.demandas (
  id                uuid primary key default gen_random_uuid(),
  numero            int not null unique default nextval('demandas.numero_seq'),

  titulo            text not null,
  descricao         text not null,
  objetivo          text,
  local             text,
  publico           text,

  categoria_id      uuid not null references demandas.categorias(id),
  setor_solicitante uuid not null references demandas.setores(id),
  setor_responsavel uuid not null references demandas.setores(id),
  prioridade        text not null default 'normal',
  impacto           text,

  prazo             date,
  sem_prazo_porque  text,
  evento            text,
  evento_data       date,
  orcamento         numeric(12,2),

  aberta_por        uuid not null references demandas.membros(id),
  responsavel_id    uuid references demandas.membros(id),

  status            text not null default 'aberta',
  travada_por       text,
  travada_nota      text,
  aprovacao         text,
  aprovada_por      uuid references demandas.membros(id),
  aprovada_em       timestamptz,
  aprovacao_nota    text,
  conclusao         text,
  concluida_em      timestamptz,
  atraso_motivo     text,
  cancelada_motivo  text,
  reaberturas       int not null default 0,

  criada_em         timestamptz not null default now(),
  mexida_em         timestamptz not null default now(),
  primeira_resposta_em timestamptz
);

do $$begin
  alter table demandas.demandas add constraint ck_status
    check (status in ('aberta','execucao','travada','concluida','cancelada'));
exception when duplicate_object then null; end
$$;
do $$begin
  alter table demandas.demandas add constraint ck_prioridade
    check (prioridade in ('baixa','normal','alta','urgente'));
exception when duplicate_object then null; end
$$;
do $$begin

  alter table demandas.demandas add constraint ck_prazo
    check (prazo is not null or nullif(btrim(coalesce(sem_prazo_porque,'')),'') is not null);
exception when duplicate_object then null; end
$$;
do $$begin

  alter table demandas.demandas add constraint ck_urgente
    check (prioridade <> 'urgente' or nullif(btrim(coalesce(impacto,'')),'') is not null);
exception when duplicate_object then null; end
$$;
do $$begin

  alter table demandas.demandas add constraint ck_evento
    check (nullif(btrim(coalesce(evento,'')),'') is null or evento_data is not null);
exception when duplicate_object then null; end
$$;
do $$begin

  alter table demandas.demandas add constraint ck_conclusao
    check (status <> 'concluida' or nullif(btrim(coalesce(conclusao,'')),'') is not null);
exception when duplicate_object then null; end
$$;
do $$begin
  alter table demandas.demandas add constraint ck_cancelada
    check (status <> 'cancelada' or nullif(btrim(coalesce(cancelada_motivo,'')),'') is not null);
exception when duplicate_object then null; end
$$;
do $$begin

  alter table demandas.demandas add constraint ck_travada
    check (status <> 'travada' or travada_por in ('informacao','aprovacao','terceiros'));
exception when duplicate_object then null; end
$$;
do $$begin
  alter table demandas.demandas add constraint ck_aprovacao
    check (aprovacao is null or aprovacao in ('pendente','aprovada','rejeitada'));
exception when duplicate_object then null; end
$$;

create index if not exists ix_dem_status  on demandas.demandas (status);
create index if not exists ix_dem_resp    on demandas.demandas (setor_responsavel, status);
create index if not exists ix_dem_sol     on demandas.demandas (setor_solicitante, status);
create index if not exists ix_dem_abriu   on demandas.demandas (aberta_por);
create index if not exists ix_dem_prazo   on demandas.demandas (prazo) where status in ('aberta','execucao','travada');
create index if not exists ix_dem_mexida  on demandas.demandas (mexida_em desc);

create table if not exists demandas.eventos (
  id         bigserial primary key,
  demanda_id uuid not null references demandas.demandas(id) on delete cascade,
  em         timestamptz not null default now(),
  membro_id  uuid references demandas.membros(id),
  tipo       text not null,
  de         text,
  para       text,
  texto      text,
  interno    boolean not null default false
);
create index if not exists ix_ev_demanda on demandas.eventos (demanda_id, em);

create table if not exists demandas.anexos (
  id         uuid primary key default gen_random_uuid(),
  demanda_id uuid not null references demandas.demandas(id) on delete cascade,
  nome       text not null,
  url        text not null,
  em         timestamptz not null default now(),
  membro_id  uuid references demandas.membros(id)
);
create index if not exists ix_an_demanda on demandas.anexos (demanda_id);

create or replace function demandas.fn_antes() returns trigger
language plpgsql as $fn$
declare v_m uuid := nullif(current_setting('demandas.membro', true), '')::uuid;
begin
  new.mexida_em := now();
  /* primeira resposta: a primeira vez que alguém que NÃO abriu mexe nela.
     É o indicador "tempo médio até a primeira resposta". */
  if new.primeira_resposta_em is null and v_m is not null and v_m <> new.aberta_por then
    new.primeira_resposta_em := now();
  end if;
  return new;
end $fn$;

drop trigger if exists tg_antes on demandas.demandas;
create trigger tg_antes before update on demandas.demandas
  for each row execute function demandas.fn_antes();

create or replace function demandas.fn_historico() returns trigger
language plpgsql as $fn$
declare
  v_m uuid := nullif(current_setting('demandas.membro', true), '')::uuid;
begin
  if new.status is distinct from old.status then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para, texto)
      values (new.id, v_m, 'status', old.status, new.status,
              case new.status
                when 'travada'   then new.travada_nota
                when 'concluida' then new.conclusao
                when 'cancelada' then new.cancelada_motivo
                else null end);
  end if;
  if new.responsavel_id is distinct from old.responsavel_id then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para)
      values (new.id, v_m, 'responsavel',
              (select nome from demandas.membros where id = old.responsavel_id),
              (select nome from demandas.membros where id = new.responsavel_id));
  end if;
  if new.setor_responsavel is distinct from old.setor_responsavel then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para)
      values (new.id, v_m, 'setor',
              (select nome from demandas.setores where id = old.setor_responsavel),
              (select nome from demandas.setores where id = new.setor_responsavel));
  end if;
  if new.prazo is distinct from old.prazo then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para)
      values (new.id, v_m, 'prazo', old.prazo::text, new.prazo::text);
  end if;
  if new.prioridade is distinct from old.prioridade then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para)
      values (new.id, v_m, 'prioridade', old.prioridade, new.prioridade);
  end if;
  if new.aprovacao is distinct from old.aprovacao then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para, texto)
      values (new.id, v_m, 'aprovacao', old.aprovacao, new.aprovacao, new.aprovacao_nota);
  end if;
  if new.reaberturas > old.reaberturas then
    insert into demandas.eventos (demanda_id, membro_id, tipo)
      values (new.id, v_m, 'reabertura');
  end if;
  return null;
end $fn$;

drop trigger if exists tg_historico on demandas.demandas;
create trigger tg_historico after update on demandas.demandas
  for each row execute function demandas.fn_historico();

create or replace function demandas.quem(p_token text)
returns demandas.membros
language plpgsql security definer set search_path = demandas, public as $fn$
declare m demandas.membros; v_email text;
begin
  if p_token is not null and btrim(p_token) <> '' then
    select * into m from demandas.membros where token = p_token and ativo;
  else
    v_email := nullif(auth.jwt() ->> 'email', '');
    if v_email is null then return null; end if;
    select * into m from demandas.membros where lower(auth_email) = lower(v_email) and ativo;
  end if;
  if m.id is not null then
    perform set_config('demandas.membro', m.id::text, true);
  end if;
  return m;
end $fn$;

create or replace function demandas.pode_ver(m demandas.membros, d demandas.demandas)
returns boolean language sql immutable as $fn$
  select m.papel in ('gestor','admin')
      or d.aberta_por = m.id
      or (m.setor_id is not null
          and (d.setor_solicitante = m.setor_id or d.setor_responsavel = m.setor_id));
$fn$;

create or replace function demandas.pode_atender(m demandas.membros, d demandas.demandas)
returns boolean language sql immutable as $fn$
  select m.papel in ('gestor','admin')
      or (m.papel = 'responsavel' and m.setor_id is not null and d.setor_responsavel = m.setor_id);
$fn$;

create or replace function demandas.resumo(d demandas.demandas) returns jsonb
language sql stable as $fn$
  select jsonb_build_object(
    'numero', d.numero, 'titulo', d.titulo,
    'status', d.status, 'travada_por', d.travada_por,
    'prioridade', d.prioridade,
    'categoria', (select c.nome from demandas.categorias c where c.id = d.categoria_id),
    'grupo', (select c.grupo from demandas.categorias c where c.id = d.categoria_id),
    'solicitante', (select s.nome from demandas.setores s where s.id = d.setor_solicitante),
    'responsavel_setor', (select s.nome from demandas.setores s where s.id = d.setor_responsavel),
    'responsavel', (select x.nome from demandas.membros x where x.id = d.responsavel_id),
    'abriu', (select x.nome from demandas.membros x where x.id = d.aberta_por),
    'prazo', d.prazo, 'evento_data', d.evento_data, 'evento', d.evento,
    'aprovacao', d.aprovacao,
    'criada_em', d.criada_em, 'mexida_em', d.mexida_em,
    'parada_dias', floor(extract(epoch from (now() - d.mexida_em)) / 86400)::int,
    'atrasada', (d.prazo is not null and d.prazo < current_date
                 and d.status in ('aberta','execucao','travada')),
    'reaberturas', d.reaberturas);
$fn$;

create or replace function public.dem_quem_sou(p_token text default null)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare m demandas.membros;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  return jsonb_build_object('ok', true,
    'id', m.id, 'nome', m.nome, 'primeiro_nome', split_part(m.nome,' ',1),
    'papel', m.papel, 'setor_id', m.setor_id,
    'setor', (select s.nome from demandas.setores s where s.id = m.setor_id),
    'setor_atende', coalesce((select s.atende from demandas.setores s where s.id = m.setor_id), false),
    'tem_login', m.auth_email is not null);
end $fn$;

create or replace function public.dem_bases(p_token text default null)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare m demandas.membros;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  return jsonb_build_object('ok', true,
    'setores', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'nome', s.nome, 'slug', s.slug, 'atende', s.atende) order by s.ordem, s.nome)
      from demandas.setores s where s.ativo), '[]'::jsonb),
    'categorias', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'grupo', c.grupo, 'nome', c.nome, 'setor_id', c.setor_id,
        'exige_aprovacao', c.exige_aprovacao, 'exige_orcamento', c.exige_orcamento,
        'prazo_padrao_dias', c.prazo_padrao_dias) order by c.ordem, c.grupo, c.nome)
      from demandas.categorias c where c.ativa), '[]'::jsonb),
    'membros', case when m.papel in ('responsavel','gestor','admin') then
      coalesce((select jsonb_agg(jsonb_build_object(
          'id', x.id, 'nome', x.nome, 'setor_id', x.setor_id, 'papel', x.papel,
          'telefone', x.telefone) order by x.nome)
        from demandas.membros x where x.ativo), '[]'::jsonb) else '[]'::jsonb end);
end $fn$;

create or replace function public.dem_abrir(p_token text, p_d jsonb)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare
  m demandas.membros; c demandas.categorias; v_setor uuid; v_num int; v_id uuid;
  v_prazo date; v_evd date;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

  select * into c from demandas.categorias where id = (p_d->>'categoria_id')::uuid and ativa;
  if c.id is null then return jsonb_build_object('ok', false, 'erro', 'CATEGORIA_INVALIDA'); end if;

  /* o setor solicitante é o de quem abre; gestor pode abrir em nome de outro */
  v_setor := coalesce(nullif(p_d->>'setor_solicitante','')::uuid, m.setor_id);
  if v_setor is null then return jsonb_build_object('ok', false, 'erro', 'SEM_SETOR'); end if;
  if m.papel not in ('gestor','admin') and v_setor <> coalesce(m.setor_id, v_setor) then
    v_setor := m.setor_id;
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
    c.id, v_setor,
    coalesce(nullif(p_d->>'setor_responsavel','')::uuid, c.setor_id, v_setor),
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
    'setor_responsavel', (select s.nome from demandas.setores s
                           where s.id = coalesce(c.setor_id, v_setor)),
    'contato', (select jsonb_build_object('nome', x.nome, 'telefone', x.telefone)
                  from demandas.membros x
                 where x.ativo and x.telefone is not null
                   and x.setor_id = coalesce(c.setor_id, v_setor)
                 order by case x.papel when 'responsavel' then 0 when 'gestor' then 1
                                       when 'admin' then 2 else 3 end, x.nome
                 limit 1));
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
  when not_null_violation then
    return jsonb_build_object('ok', false, 'erro', 'FALTA_CAMPO', 'regra', SQLERRM);
end $fn$;

create or replace function public.dem_lista(p_token text default null, p_f jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare m demandas.membros; v jsonb;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

  select coalesce(jsonb_agg(demandas.resumo(d) order by
           case d.prioridade when 'urgente' then 0 when 'alta' then 1
                             when 'normal' then 2 else 3 end,
           d.prazo nulls last, d.criada_em), '[]'::jsonb)
    into v
    from demandas.demandas d
   where demandas.pode_ver(m, d)
     and (coalesce(p_f->>'aba','tudo') <> 'minhas'  or d.aberta_por = m.id)
     and (coalesce(p_f->>'aba','tudo') <> 'setor'
          or (m.setor_id is not null and d.setor_responsavel = m.setor_id))
     and (coalesce(p_f->>'aba','tudo') <> 'comigo'  or d.responsavel_id = m.id)
     and (nullif(p_f->>'status','') is null or d.status = p_f->>'status')
     and (coalesce((p_f->>'abertas')::boolean, false) = false
          or d.status in ('aberta','execucao','travada'))
     and (coalesce((p_f->>'atrasadas')::boolean, false) = false
          or (d.prazo is not null and d.prazo < current_date
              and d.status in ('aberta','execucao','travada')))
     and (nullif(p_f->>'setor','') is null
          or d.setor_responsavel = (p_f->>'setor')::uuid)
     and (nullif(p_f->>'busca','') is null
          or d.titulo ilike '%'||(p_f->>'busca')||'%'
          or d.descricao ilike '%'||(p_f->>'busca')||'%'
          or d.numero::text = p_f->>'busca');

  return jsonb_build_object('ok', true, 'itens', v);
end $fn$;

create or replace function public.dem_ver(p_token text, p_numero int)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
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
        'nome', a.nome, 'url', a.url, 'em', a.em) order by a.em)
      from demandas.anexos a where a.demanda_id = d.id), '[]'::jsonb));
end $fn$;

create or replace function public.dem_mover(
  p_token text, p_numero int, p_acao text, p_d jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare
  m demandas.membros; d demandas.demandas;
  v_txt text := nullif(btrim(coalesce(p_d->>'texto','')),'');
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  select * into d from demandas.demandas where numero = p_numero;
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
    update demandas.demandas
       set status = 'execucao', reaberturas = reaberturas + 1,
           conclusao = null, concluida_em = null, cancelada_motivo = null,
           atraso_motivo = null, travada_por = null, travada_nota = null
     where id = d.id;

  else
    return jsonb_build_object('ok', false, 'erro', 'ACAO_DESCONHECIDA');
  end if;

  return jsonb_build_object('ok', true);
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
end $fn$;

create or replace function public.dem_numeros(
  p_token text, p_de date default null, p_ate date default null)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare
  m demandas.membros; v_de date; v_ate date; r jsonb;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  if m.papel not in ('gestor','admin','responsavel') then
    return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
  v_de  := coalesce(p_de, current_date - 90);
  v_ate := coalesce(p_ate, current_date);

  with base as (
    select d.* from demandas.demandas d
     where d.criada_em::date between v_de and v_ate
       and demandas.pode_ver(m, d))
  select jsonb_build_object(
    'de', v_de, 'ate', v_ate,
    'total',     (select count(*) from base),
    'abertas',   (select count(*) from base where status in ('aberta','execucao','travada')),
    'concluidas',(select count(*) from base where status = 'concluida'),
    'canceladas',(select count(*) from base where status = 'cancelada'),
    'atrasadas', (select count(*) from base
                   where prazo is not null and prazo < current_date
                     and status in ('aberta','execucao','travada')),
    'reabertas', (select count(*) from base where reaberturas > 0),
    'paradas',   (select count(*) from base
                   where status in ('aberta','execucao','travada')
                     and mexida_em < now() - interval '7 days'),
    'horas_ate_concluir', (select round(avg(extract(epoch from (concluida_em - criada_em))/3600)::numeric, 1)
                             from base where concluida_em is not null),
    'horas_ate_resposta', (select round(avg(extract(epoch from (primeira_resposta_em - criada_em))/3600)::numeric, 1)
                             from base where primeira_resposta_em is not null),
    'no_prazo_pct', (select case when count(*) = 0 then null else
                       round(100.0 * count(*) filter (
                         where prazo is null or concluida_em::date <= prazo) / count(*), 0) end
                       from base where status = 'concluida'),
    'por_setor', coalesce((select jsonb_agg(x order by x->>'nome')
      from (select jsonb_build_object(
              'nome', s.nome,
              'pediu', (select count(*) from base b where b.setor_solicitante = s.id),
              'atendeu', (select count(*) from base b where b.setor_responsavel = s.id),
              'abertas', (select count(*) from base b where b.setor_responsavel = s.id
                            and b.status in ('aberta','execucao','travada')),
              'atrasadas', (select count(*) from base b where b.setor_responsavel = s.id
                            and b.prazo is not null and b.prazo < current_date
                            and b.status in ('aberta','execucao','travada'))) as x
              from demandas.setores s where s.ativo) y
      where (x->>'pediu')::int > 0 or (x->>'atendeu')::int > 0), '[]'::jsonb),
    'por_categoria', coalesce((select jsonb_agg(jsonb_build_object(
        'grupo', c.grupo, 'nome', c.nome, 'n', t.n) order by t.n desc, c.nome)
      from (select categoria_id, count(*) n from base group by 1) t
      join demandas.categorias c on c.id = t.categoria_id), '[]'::jsonb),
    'por_prioridade', coalesce((select jsonb_object_agg(prioridade, n)
      from (select prioridade, count(*) n from base group by 1) t), '{}'::jsonb),
    'motivos_de_atraso', coalesce((select jsonb_agg(jsonb_build_object('motivo', mot, 'n', n) order by n desc)
      from (select coalesce(nullif(btrim(atraso_motivo),''),
                     case travada_por when 'informacao' then 'faltou informação do solicitante'
                                      when 'aprovacao'  then 'esperando aprovação'
                                      when 'terceiros'  then 'esperando terceiros'
                                      else 'sem motivo registrado' end) mot,
                   count(*) n
              from base
             where (prazo is not null and prazo < current_date and status in ('aberta','execucao','travada'))
                or (concluida_em is not null and prazo is not null and concluida_em::date > prazo)
             group by 1) t), '[]'::jsonb),
    'por_mes', coalesce((select jsonb_agg(jsonb_build_object('mes', mes, 'n', n) order by mes)
      from (select to_char(criada_em, 'YYYY-MM') mes, count(*) n from base group by 1) t), '[]'::jsonb)
  ) into r;
  return jsonb_build_object('ok', true, 'numeros', r);
end $fn$;

create or replace function public.dem_ajustar(p_token text, p_o_que text, p_d jsonb)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare m demandas.membros; v_id uuid;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  if m.papel <> 'admin' then return jsonb_build_object('ok', false, 'erro', 'SO_ADMIN'); end if;

  if p_o_que = 'setor' then
    if nullif(p_d->>'id','') is null then
      insert into demandas.setores (nome, slug, atende, ordem)
        values (btrim(p_d->>'nome'),
                coalesce(nullif(btrim(p_d->>'slug'),''),
                         lower(regexp_replace(unaccent_simples(btrim(p_d->>'nome')), '[^a-z0-9]+', '-', 'gi'))),
                coalesce((p_d->>'atende')::boolean, false),
                coalesce((p_d->>'ordem')::int, 99))
        returning id into v_id;
    else
      update demandas.setores set
        nome = coalesce(nullif(btrim(p_d->>'nome'),''), nome),
        atende = coalesce((p_d->>'atende')::boolean, atende),
        ordem = coalesce((p_d->>'ordem')::int, ordem),
        ativo = coalesce((p_d->>'ativo')::boolean, ativo)
       where id = (p_d->>'id')::uuid returning id into v_id;
    end if;

  elsif p_o_que = 'categoria' then
    if nullif(p_d->>'id','') is null then
      insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, exige_orcamento, prazo_padrao_dias, ordem)
        values (btrim(p_d->>'grupo'), btrim(p_d->>'nome'), nullif(p_d->>'setor_id','')::uuid,
                coalesce((p_d->>'exige_aprovacao')::boolean, false),
                coalesce((p_d->>'exige_orcamento')::boolean, false),
                nullif(p_d->>'prazo_padrao_dias','')::int,
                coalesce((p_d->>'ordem')::int, 99))
        on conflict (grupo, nome) do update set ativa = true
        returning id into v_id;
    else
      update demandas.categorias set
        nome = coalesce(nullif(btrim(p_d->>'nome'),''), nome),
        setor_id = coalesce(nullif(p_d->>'setor_id','')::uuid, setor_id),
        exige_aprovacao = coalesce((p_d->>'exige_aprovacao')::boolean, exige_aprovacao),
        exige_orcamento = coalesce((p_d->>'exige_orcamento')::boolean, exige_orcamento),
        prazo_padrao_dias = case when p_d ? 'prazo_padrao_dias'
                                 then nullif(p_d->>'prazo_padrao_dias','')::int
                                 else prazo_padrao_dias end,
        ativa = coalesce((p_d->>'ativa')::boolean, ativa)
       where id = (p_d->>'id')::uuid returning id into v_id;
    end if;

  elsif p_o_que = 'membro' then
    if nullif(p_d->>'id','') is null then
      insert into demandas.membros (nome, email, telefone, auth_email, setor_id, papel, token, pessoa_id)
        values (btrim(p_d->>'nome'), nullif(btrim(p_d->>'email'),''),
                nullif(regexp_replace(coalesce(p_d->>'telefone',''), '\D', '', 'g'),''),
                lower(nullif(btrim(p_d->>'auth_email'),'')),
                nullif(p_d->>'setor_id','')::uuid,
                coalesce(nullif(p_d->>'papel',''), 'solicitante'),
                encode(gen_random_bytes(12), 'hex'),
                nullif(p_d->>'pessoa_id','')::uuid)
        returning id into v_id;
    else
      update demandas.membros set
        nome = coalesce(nullif(btrim(p_d->>'nome'),''), nome),
        email = case when p_d ? 'email' then nullif(btrim(p_d->>'email'),'') else email end,
        telefone = case when p_d ? 'telefone'
                        then nullif(regexp_replace(coalesce(p_d->>'telefone',''), '\D', '', 'g'),'')
                        else telefone end,
        auth_email = case when p_d ? 'auth_email' then lower(nullif(btrim(p_d->>'auth_email'),'')) else auth_email end,
        setor_id = coalesce(nullif(p_d->>'setor_id','')::uuid, setor_id),
        papel = coalesce(nullif(p_d->>'papel',''), papel),
        ativo = coalesce((p_d->>'ativo')::boolean, ativo)
       where id = (p_d->>'id')::uuid returning id into v_id;
    end if;

  else
    return jsonb_build_object('ok', false, 'erro', 'ALVO_DESCONHECIDO');
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
exception
  when unique_violation then return jsonb_build_object('ok', false, 'erro', 'JA_EXISTE');
  when check_violation  then return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
end $fn$;

create or replace function public.dem_pessoas(p_token text default null)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare m demandas.membros;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  if m.papel <> 'admin' then return jsonb_build_object('ok', false, 'erro', 'SO_ADMIN'); end if;
  return jsonb_build_object('ok', true,
    'membros', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'nome', x.nome, 'email', x.email, 'telefone', x.telefone,
        'auth_email', x.auth_email, 'setor_id', x.setor_id, 'papel', x.papel,
        'token', x.token, 'ativo', x.ativo) order by x.nome)
      from demandas.membros x), '[]'::jsonb));
end $fn$;

create or replace function public.unaccent_simples(t text) returns text
language sql immutable as $fn$
  select translate(coalesce(t,''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC');
$fn$;

revoke all on schema demandas from public, anon, authenticated;
do $$declare f record; begin
  for f in
    select p.oid::regprocedure::text as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('dem_quem_sou','dem_bases','dem_abrir','dem_lista','dem_ver',
                         'dem_mover','dem_numeros','dem_ajustar','dem_pessoas')
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
end
$$;

insert into demandas.setores (nome, slug, atende, ordem) values
  ('Comunicação',              'comunicacao',   true,  10),
  ('Compras e suprimentos',    'compras',       true,  20),
  ('Manutenção e infraestrutura','manutencao',  true,  30),
  ('Tecnologia e audiovisual', 'tecnologia',    true,  40),
  ('Eventos e logística',      'eventos',       true,  50),
  ('Administrativo e financeiro','administrativo', true, 60),
  ('Pastoral',                 'pastoral',      false, 70),
  ('Louvor',                   'louvor',        false, 80),
  ('Mídia',                    'midia',         false, 90),
  ('Connect',                  'connect',       false, 100),
  ('Jovens',                   'jovens',        false, 110),
  ('Kids',                     'kids',          false, 120),
  ('Secretaria',               'secretaria',    false, 130)
on conflict (slug) do nothing;

do $$declare
  com uuid; cpr uuid; man uuid; tec uuid; evt uuid; adm uuid;
begin
  select id into com from demandas.setores where slug = 'comunicacao';
  select id into cpr from demandas.setores where slug = 'compras';
  select id into man from demandas.setores where slug = 'manutencao';
  select id into tec from demandas.setores where slug = 'tecnologia';
  select id into evt from demandas.setores where slug = 'eventos';
  select id into adm from demandas.setores where slug = 'administrativo';

  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, exige_orcamento, prazo_padrao_dias, ordem) values
    ('Comunicação e divulgação','Divulgação de culto',        com,false,false, 5, 11),
    ('Comunicação e divulgação','Divulgação de evento',       com,false,false, 7, 12),
    ('Comunicação e divulgação','Criação de arte',            com,false,false, 5, 13),
    ('Comunicação e divulgação','Criação de vídeo',           com,false,false,10, 14),
    ('Comunicação e divulgação','Publicação nas redes sociais',com,false,false,3, 15),
    ('Comunicação e divulgação','Criação de texto ou anúncio',com,false,false, 4, 16),
    ('Comunicação e divulgação','Cobertura fotográfica',      com,false,false, 7, 17),
    ('Comunicação e divulgação','Cobertura audiovisual',      com,false,false, 7, 18),

    ('Compras e suprimentos','Compra de material de escritório',cpr,true, true,10, 21),
    ('Compras e suprimentos','Compra de material para eventos', cpr,true, true,10, 22),
    ('Compras e suprimentos','Compra de equipamentos',          cpr,true, true,15, 23),
    ('Compras e suprimentos','Solicitação de orçamento',        cpr,false,false,7, 24),
    ('Compras e suprimentos','Reposição de estoque',            cpr,true, true, 7, 25),
    ('Compras e suprimentos','Contratação de fornecedor',       cpr,true, true,15, 26),

    ('Manutenção e infraestrutura','Reparo elétrico',        man,false,false, 3, 31),
    ('Manutenção e infraestrutura','Reparo hidráulico',      man,false,false, 3, 32),
    ('Manutenção e infraestrutura','Manutenção predial',     man,false,false, 7, 33),
    ('Manutenção e infraestrutura','Limpeza',                man,false,false, 2, 34),
    ('Manutenção e infraestrutura','Climatização',           man,false,false, 5, 35),
    ('Manutenção e infraestrutura','Manutenção de móveis',   man,false,false, 7, 36),
    ('Manutenção e infraestrutura','Manutenção de equipamentos',man,false,false,5,37),

    ('Tecnologia e audiovisual','Instalação ou configuração de equipamento',tec,false,false,5,41),
    ('Tecnologia e audiovisual','Suporte de som',            tec,false,false, 3, 42),
    ('Tecnologia e audiovisual','Suporte de transmissão',    tec,false,false, 3, 43),
    ('Tecnologia e audiovisual','Suporte de projeção',       tec,false,false, 3, 44),
    ('Tecnologia e audiovisual','Acesso a sistemas',         tec,false,false, 2, 45),
    ('Tecnologia e audiovisual','Criação de usuários',       tec,false,false, 2, 46),
    ('Tecnologia e audiovisual','Problemas de internet ou rede',tec,false,false,1,47),

    ('Eventos e logística','Reserva de espaço',      evt,false,false, 5, 51),
    ('Eventos e logística','Reserva de veículo',     evt,true, false, 5, 52),
    ('Eventos e logística','Montagem de estrutura',  evt,false,false, 5, 53),
    ('Eventos e logística','Organização de cadeiras e mesas',evt,false,false,3,54),
    ('Eventos e logística','Apoio de recepção',      evt,false,false, 5, 55),
    ('Eventos e logística','Escala de voluntários',  evt,false,false, 7, 56),
    ('Eventos e logística','Transporte',             evt,true, true,  7, 57),
    ('Eventos e logística','Alimentação',            evt,true, true,  7, 58),

    ('Administrativo e financeiro','Solicitação de pagamento',adm,true, true, 7, 61),
    ('Administrativo e financeiro','Reembolso',               adm,true, true, 7, 62),
    ('Administrativo e financeiro','Prestação de contas',     adm,false,false,10, 63),
    ('Administrativo e financeiro','Emissão de documentos',   adm,false,false, 5, 64),
    ('Administrativo e financeiro','Apoio jurídico ou contratual',adm,true,false,15,65),
    ('Administrativo e financeiro','Reserva financeira',      adm,true, true, 10, 66),
    ('Administrativo e financeiro','Organização de cadastro', adm,false,false,10, 67)
  on conflict (grupo, nome) do nothing;
end
$$;

select
  (select count(*) from demandas.setores)    as setores,
  (select count(*) from demandas.categorias) as categorias,
  (select count(*) from demandas.membros)    as membros,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'dem\_%') as funcoes;

do $tranca$begin

  if exists (select 1 from pg_constraint where conname = 'anexos_url_http_ck') then
    raise warning E'\n\n  ####################################################################\n  #  ATENCAO: a 52 ja tinha rodado neste banco, e esta migracao\n  #  acabou de SOBRESCREVER dem_abrir e dem_mover com a versao antiga.\n  #\n  #  Voltaram cinco defeitos: corrida em dem_mover (duas pessoas agindo\n  #  no mesmo segundo passam as duas), demanda nascendo em setor que nao\n  #  atende, recusa de aprovacao que da para desfazer reabrindo, setor\n  #  solicitante aceitando o que o cliente mandar, e erro cru do Postgres\n  #  na tela.\n  #\n  #  RODE A MIGRACAO 52 AGORA, antes de usar o sistema.\n  ####################################################################\n';
  else
    raise notice 'OK — banco novo. Rode a 52 em seguida, como de costume.';
  end if;
end
$tranca$;
