/* =============================================================================
   104 · O AVISO NO CELULAR

   01/10/2026. Só de Escalas. Fase 2 do estudo do ServoApp
   (claude/estudo-servoapp-01-10-2026.md): o ServoApp promete "receber
   notificações importantes", e o GUIA Servir não avisava ninguém de nada
   sozinho. Tudo dependia do grupo e do link.

   O QUE PASSA A EXISTIR (aviso do próprio navegador, "web push", grátis):
     · o voluntário liga o aviso no próprio link (no iPhone, depois de pôr o
       link na Tela de Início, iOS 16.4 ou mais novo);
     · chega aviso quando um colega pede troca, quando o colega responde, e
       um lembrete 3 dias e 1 dia antes de cada escala (com "falta você
       confirmar" quando falta).

   SÓ ACRESCENTA. Nenhuma função existente muda.

   QUEM VÊ O QUÊ:
     · `avisos_celular` guarda o endereço de aviso de cada aparelho. Fechada:
       ninguém lê por fora. O voluntário liga, desliga e pergunta se está
       ligado pelo próprio token (três funções na porta pública da 77).
     · quem MANDA o aviso é o servidor (rota /api/aviso e o robô dos
       lembretes), com o papel de serviço. As três funções que ele usa NÃO
       abrem para anon nem para authenticated.

   O ENDEREÇO SÓ PODE SER DE UM SERVIÇO DE AVISO CONHECIDO (Google, Mozilla,
   Apple, Microsoft). Quem manda o aviso é o servidor, por POST, para o
   endereço que o navegador entregou: endereço livre seria o servidor da
   igreja fazendo POST para qualquer lugar que alguém digitasse.

   UM AVISO POR COISA: o pedido de troca avisa uma vez (`trocas.avisado_em`),
   a resposta uma vez (`trocas.resposta_avisada_em`), e o lembrete uma vez por
   pessoa, culto e tipo (`lembretes_enviados`). Repetir a chamada não repete
   o aviso.

   SEM `create temp table` (101). A última linha é um select com o resultado.

   ORDEM:  ... 102 → 103 → 104
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(104);
  end if;
end $tranca$;

begin;

-- =========================================================================
-- 1 · os aparelhos
-- =========================================================================
create table if not exists avisos_celular (
  voluntario_id uuid not null references voluntarios(id) on delete cascade,
  endpoint      text not null,
  p256dh        text not null,
  auth          text not null,
  /* clock_timestamp: dois aparelhos ligados na mesma transação têm ordem */
  criado_em     timestamptz not null default clock_timestamp(),
  usado_em      timestamptz,
  falhas        int not null default 0,
  primary key (voluntario_id, endpoint),
  constraint avisos_celular_endpoint_ck check (
    length(endpoint) <= 1000 and endpoint ~ ('^https://(fcm\.googleapis\.com|android\.googleapis\.com|'
      || 'updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/')),
  constraint avisos_celular_chaves_ck check (
    p256dh ~ '^[A-Za-z0-9_-]{80,100}={0,2}$' and auth ~ '^[A-Za-z0-9_-]{16,32}={0,2}$')
);
create index if not exists ix_avisos_endpoint on avisos_celular (endpoint);
alter table avisos_celular enable row level security;
revoke all on avisos_celular from public, anon, authenticated;
comment on table avisos_celular is
  'Aparelhos que ligaram o aviso no celular (web push), por vinculo de voluntario (104). A mesma pessoa em duas areas liga o mesmo aparelho nas duas. So o servidor le; o voluntario mexe pelas funcoes eu_aviso_*.';

/* um aviso por coisa */
alter table trocas add column if not exists avisado_em timestamptz;
alter table trocas add column if not exists resposta_avisada_em timestamptz;

create table if not exists lembretes_enviados (
  voluntario_id uuid not null references voluntarios(id) on delete cascade,
  culto_id      uuid not null references cultos(id) on delete cascade,
  tipo          text not null,
  enviado_em    timestamptz not null default now(),
  primary key (voluntario_id, culto_id, tipo),
  constraint lembretes_tipo_ck check (tipo in ('d3', 'd1'))
);
alter table lembretes_enviados enable row level security;
revoke all on lembretes_enviados from public, anon, authenticated;
comment on table lembretes_enviados is
  'Lembrete de escala ja mandado (104): um por pessoa, culto e tipo (d3 = 3 dias antes, d1 = 1 dia antes). E o que impede o robo de repetir o aviso.';

-- =========================================================================
-- 2 · o voluntário liga, desliga e pergunta (porta pública, pelo token)
-- =========================================================================
create or replace function eu_aviso_ligar(p_token text, p_endpoint text, p_p256dh text, p_auth text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  select v.id into v_id from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;
  begin
    insert into avisos_celular (voluntario_id, endpoint, p256dh, auth)
         values (v_id, p_endpoint, p_p256dh, p_auth)
    on conflict (voluntario_id, endpoint)
    do update set p256dh = excluded.p256dh, auth = excluded.auth, criado_em = clock_timestamp(), falhas = 0;
  exception when check_violation or not_null_violation then
    return jsonb_build_object('ok', false, 'erro', 'ENDERECO_INVALIDO');
  end;
  /* teto: cinco aparelhos por vínculo; o mais antigo sai */
  delete from avisos_celular a
   where a.voluntario_id = v_id
     and a.endpoint not in (select b.endpoint from avisos_celular b where b.voluntario_id = v_id
                             order by b.criado_em desc limit 5);
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function eu_aviso_ligar(text, text, text, text) from public;
grant execute on function eu_aviso_ligar(text, text, text, text) to anon, authenticated;

create or replace function eu_aviso_desligar(p_token text, p_endpoint text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_n int;
begin
  select v.id into v_id from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;
  delete from avisos_celular where voluntario_id = v_id and endpoint = p_endpoint;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'apagados', v_n);
end $fn$;
revoke all on function eu_aviso_desligar(text, text) from public;
grant execute on function eu_aviso_desligar(text, text) to anon, authenticated;

create or replace function eu_aviso_estado(p_token text, p_endpoint text)
returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare v_id uuid;
begin
  select v.id into v_id from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;
  return jsonb_build_object('ok', true,
    'ligado', exists (select 1 from avisos_celular a where a.voluntario_id = v_id and a.endpoint = p_endpoint));
end $fn$;
revoke all on function eu_aviso_estado(text, text) from public;
grant execute on function eu_aviso_estado(text, text) to anon, authenticated;

-- =========================================================================
-- 3 · o servidor manda (papel de serviço, e só ele)
-- =========================================================================

/* o aviso da troca: o pedido para quem recebeu, a resposta para quem pediu.
   Quem chama prova que é parte da troca pelo token; cada aviso sai uma vez. */
create or replace function aviso_da_troca(p_token text, p_troca uuid, p_evento text)
returns table(endpoint text, p256dh text, auth text, token_destino text, tipo text,
              outro text, funcao text, data date, evento text, inicio time, slug text)
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; t trocas%rowtype; v_destino uuid; v_tipo text;
begin
  select v.id into v_id from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then return; end if;

  if p_evento = 'pedido' then
    update trocas x set avisado_em = now()
     where x.id = p_troca and x.de_voluntario = v_id and x.status = 'aberta' and x.avisado_em is null
    returning x.* into t;
    if not found then return; end if;
    v_destino := t.para_voluntario; v_tipo := 'pedido';
  elsif p_evento = 'resposta' then
    update trocas x set resposta_avisada_em = now()
     where x.id = p_troca and x.para_voluntario = v_id and x.status in ('aceita', 'recusada')
       and x.resposta_avisada_em is null
    returning x.* into t;
    if not found then return; end if;
    v_destino := t.de_voluntario; v_tipo := t.status;
  else
    return;
  end if;

  return query
  select a.endpoint, a.p256dh, a.auth, d.token, v_tipo,
         (select o.nome from voluntarios o where o.id = case when v_tipo = 'pedido' then t.de_voluntario else t.para_voluntario end),
         f.nome, c.data, c.evento, c.inicio, e.slug
    from avisos_celular a
    join voluntarios d on d.id = a.voluntario_id
    join equipes e on e.id = d.equipe_id
    join cultos c on c.id = t.culto_id
    join funcoes f on f.id = t.funcao_id
   where a.voluntario_id = v_destino and d.ativo;
end $fn$;
revoke all on function aviso_da_troca(text, uuid, text) from public, anon, authenticated;
grant execute on function aviso_da_troca(text, uuid, text) to service_role;

/* os lembretes do dia: escala daqui a 3 dias e amanhã, de quem tem aviso
   ligado. Marca como mandado na mesma conta: chamar duas vezes não repete. */
create or replace function avisos_para_lembrar(p_hoje date)
returns table(endpoint text, p256dh text, auth text, token text, tipo text,
              data date, evento text, inicio time, funcoes text, pendente boolean)
language plpgsql security definer set search_path = public as $fn$
begin
  return query
  with alvo as (
    select e.voluntario_id, c.id as culto_id,
           case when c.data = p_hoje + 1 then 'd1' else 'd3' end as tipo,
           string_agg(f.nome, ' · ' order by f.ordem, f.nome) as funcoes,
           bool_or(e.status = 'pendente') as pendente
      from escalacoes e
      join cultos c on c.id = e.culto_id
      join funcoes f on f.id = e.funcao_id
      join voluntarios v on v.id = e.voluntario_id and v.ativo
     where c.data in (p_hoje + 1, p_hoje + 3)
       and e.status in ('pendente', 'confirmado')
       and exists (select 1 from avisos_celular a where a.voluntario_id = e.voluntario_id)
     group by e.voluntario_id, c.id, c.data
  ), novos as (
    insert into lembretes_enviados (voluntario_id, culto_id, tipo)
    select al.voluntario_id, al.culto_id, al.tipo from alvo al
    on conflict do nothing
    returning lembretes_enviados.voluntario_id, lembretes_enviados.culto_id, lembretes_enviados.tipo
  )
  select a.endpoint, a.p256dh, a.auth, v.token, n.tipo, c.data, c.evento, c.inicio, al.funcoes, al.pendente
    from novos n
    join alvo al on al.voluntario_id = n.voluntario_id and al.culto_id = n.culto_id and al.tipo = n.tipo
    join avisos_celular a on a.voluntario_id = n.voluntario_id
    join voluntarios v on v.id = n.voluntario_id
    join cultos c on c.id = n.culto_id;
end $fn$;
revoke all on function avisos_para_lembrar(date) from public, anon, authenticated;
grant execute on function avisos_para_lembrar(date) to service_role;

/* o que o serviço de aviso respondeu: endereço que sumiu (404/410) sai de
   todos os vínculos; falha comum conta, e cinco seguidas tiram o aparelho */
create or replace function aviso_resultado(p_endpoint text, p_ok boolean, p_sumiu boolean)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if coalesce(p_sumiu, false) then
    delete from avisos_celular where endpoint = p_endpoint;
  elsif coalesce(p_ok, false) then
    update avisos_celular set usado_em = now(), falhas = 0 where endpoint = p_endpoint;
  else
    update avisos_celular set falhas = falhas + 1 where endpoint = p_endpoint;
    delete from avisos_celular where endpoint = p_endpoint and falhas >= 5;
  end if;
end $fn$;
revoke all on function aviso_resultado(text, boolean, boolean) from public, anon, authenticated;
grant execute on function aviso_resultado(text, boolean, boolean) to service_role;

-- =========================================================================
-- 4 · inventário da porta pública (77)
-- =========================================================================
do $porta$ begin
  if to_regclass('public.porta_publica') is null then
    raise notice 'PULEI o inventario: este banco nao tem porta_publica (falta a 77).';
    return;
  end if;
  insert into public.porta_publica (funcao, motivo, n) values
    ('eu_aviso_ligar(p_token text, p_endpoint text, p_p256dh text, p_auth text)',
     'a pessoa liga o aviso no celular pelo proprio link; o endereco so pode ser de servico de aviso conhecido, e sao ate cinco aparelhos (104).', 104),
    ('eu_aviso_desligar(p_token text, p_endpoint text)',
     'a pessoa desliga o aviso deste aparelho pelo proprio link (104).', 104),
    ('eu_aviso_estado(p_token text, p_endpoint text)',
     'a tela pergunta se o aviso deste aparelho esta ligado para este link; devolve so sim ou nao (104).', 104)
  on conflict (funcao) do update set motivo = excluded.motivo, n = excluded.n;
end $porta$;

-- =========================================================================
-- 5 · conferência
-- =========================================================================
do $conf$
declare
  falhas text[] := '{}';
  r record; v_n int; v_txt text;
  m jsonb := '{}'::jsonb;
  montou boolean := false;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_eq uuid; v_f uuid; v_ana uuid; v_bia uuid; v_caio uuid; t_ana text; t_bia text; t_caio text;
  v_c1 uuid; v_c3 uuid; v_c9 uuid; v_troca uuid;
  E1 constant text := 'https://fcm.googleapis.com/fcm/send/conf104-aparelho-1';
  E2 constant text := 'https://web.push.apple.com/conf104-aparelho-2';
  K constant text := repeat('B', 87);
  A constant text := repeat('a', 22);
begin
  /* 1 · estrutura */
  for r in select * from (values ('avisos_celular'), ('lembretes_enviados')) as x(t) loop
    if not exists (select 1 from pg_class where oid = to_regclass('public.' || r.t) and relrowsecurity) then
      falhas := falhas || format('%s sem RLS', r.t); end if;
    if has_table_privilege('anon', 'public.' || r.t, 'select') or has_table_privilege('authenticated', 'public.' || r.t, 'select') then
      falhas := falhas || format('%s com grant para anon ou authenticated', r.t); end if;
  end loop;
  for r in select * from (values ('eu_aviso_ligar(text,text,text,text)'), ('eu_aviso_desligar(text,text)'),
                                 ('eu_aviso_estado(text,text)')) as x(f) loop
    if not has_function_privilege('anon', 'public.' || r.f, 'execute') then
      falhas := falhas || format('%s sem grant para anon', r.f); end if;
  end loop;
  for r in select * from (values ('aviso_da_troca(text,uuid,text)'), ('avisos_para_lembrar(date)'),
                                 ('aviso_resultado(text,boolean,boolean)')) as x(f) loop
    if has_function_privilege('anon', 'public.' || r.f, 'execute') or has_function_privilege('authenticated', 'public.' || r.f, 'execute') then
      falhas := falhas || format('%s alcancavel de fora', r.f); end if;
    if not has_function_privilege('service_role', 'public.' || r.f, 'execute') then
      falhas := falhas || format('%s sem grant para o servico', r.f); end if;
  end loop;
  if to_regprocedure('public.testar_porta_publica()') is not null then
    select count(*), string_agg(t.caso || ' (' || t.obtido || ')', '; ') into v_n, v_txt
      from public.testar_porta_publica() t where not t.passou;
    if v_n > 0 then falhas := falhas || format('porta publica reprovou: %s', v_txt); end if;
  end if;

  /* 2 · o caminho inteiro (desfeito no fim) */
  begin
    insert into equipes (nome, slug, ordem) values ('CONF104 Teste', 'conf104-teste', 995) returning id into v_eq;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq, 'CONF104 VOZ', 1, true, true, array['domingo','follow']) returning id into v_f;
    insert into voluntarios (equipe_id, nome, telefone) values (v_eq, 'Ana Conf Cento Quatro', '21900104001') returning id, token into v_ana, t_ana;
    insert into voluntarios (equipe_id, nome, telefone) values (v_eq, 'Bia Conf Cento Quatro', '21900104002') returning id, token into v_bia, t_bia;
    insert into voluntarios (equipe_id, nome, telefone) values (v_eq, 'Caio Conf Cento Quatro', '21900104003') returning id, token into v_caio, t_caio;
    insert into habilidades (voluntario_id, funcao_id, nivel) values (v_ana, v_f, 'titular'), (v_bia, v_f, 'titular'), (v_caio, v_f, 'titular');
    insert into cultos (data, evento, equipe_id, inicio) values (v_hoje + 1, 'CONF104 amanha', v_eq, time '19:30') returning id into v_c1;
    insert into cultos (data, evento, equipe_id) values (v_hoje + 3, 'CONF104 em tres dias', v_eq) returning id into v_c3;
    insert into cultos (data, evento, equipe_id) values (v_hoje + 9, 'CONF104 longe', v_eq) returning id into v_c9;
    insert into escalacoes (culto_id, funcao_id, voluntario_id, status) values
      (v_c1, v_f, v_ana, 'pendente'), (v_c3, v_f, v_bia, 'confirmado'), (v_c9, v_f, v_ana, 'pendente');
    montou := true;

    /* ligar: endereço de serviço conhecido, chaves no formato */
    m := m || jsonb_build_object('ligar_ok', eu_aviso_ligar(t_ana, E1, K, A) ->> 'ok');
    m := m || jsonb_build_object('ligar_2x', eu_aviso_ligar(t_ana, E1, K, A) ->> 'ok');
    m := m || jsonb_build_object('linhas_ana', (select count(*) from avisos_celular where voluntario_id = v_ana));
    m := m || jsonb_build_object('ligar_host', eu_aviso_ligar(t_ana, 'https://exemplo.com.br/push/1', K, A) ->> 'erro');
    m := m || jsonb_build_object('ligar_http', eu_aviso_ligar(t_ana, 'http://fcm.googleapis.com/x', K, A) ->> 'erro');
    m := m || jsonb_build_object('ligar_chave', eu_aviso_ligar(t_ana, E1 || '-b', 'curta', A) ->> 'erro');
    m := m || jsonb_build_object('ligar_disfarce', eu_aviso_ligar(t_ana, 'https://fcm.googleapis.com.exemplo.com/x', K, A) ->> 'erro');
    /* o mesmo aparelho, duas pessoas (quem serve em duas áreas, a família) */
    perform eu_aviso_ligar(t_bia, E1, K, A);
    perform eu_aviso_ligar(t_bia, E2, K, A);
    m := m || jsonb_build_object('estado_ana', eu_aviso_estado(t_ana, E1) ->> 'ligado');
    m := m || jsonb_build_object('estado_ana_e2', eu_aviso_estado(t_ana, E2) ->> 'ligado');
    m := m || jsonb_build_object('estado_bia', eu_aviso_estado(t_bia, E1) ->> 'ligado');
    /* teto de cinco aparelhos */
    for v_n in 1..6 loop perform eu_aviso_ligar(t_caio, E1 || '-teto-' || v_n, K, A); end loop;
    m := m || jsonb_build_object('teto', (select count(*) from avisos_celular where voluntario_id = v_caio));

    /* o aviso do pedido: uma vez, para quem recebeu, só a pedido de quem pediu */
    v_troca := (eu_troca_pedir(t_ana, v_c9, v_f, v_bia) ->> 'id')::uuid;
    m := m || jsonb_build_object('pedido_alheio', (select count(*) from aviso_da_troca(t_caio, v_troca, 'pedido')));
    select count(*), string_agg(distinct x.tipo || ':' || split_part(x.outro, ' ', 1) || ':' || x.slug || ':' || (x.token_destino = t_bia), ',')
      into v_n, v_txt from aviso_da_troca(t_ana, v_troca, 'pedido') x;
    m := m || jsonb_build_object('pedido', v_n || ':' || coalesce(v_txt, '-'));
    m := m || jsonb_build_object('pedido_2x', (select count(*) from aviso_da_troca(t_ana, v_troca, 'pedido')));
    /* a resposta: só depois de responder, para quem pediu, uma vez */
    m := m || jsonb_build_object('resposta_antes', (select count(*) from aviso_da_troca(t_bia, v_troca, 'resposta')));
    perform eu_troca_responder(t_bia, v_troca, false);
    select count(*), string_agg(distinct x.tipo || ':' || split_part(x.outro, ' ', 1) || ':' || (x.token_destino = t_ana), ',')
      into v_n, v_txt from aviso_da_troca(t_bia, v_troca, 'resposta') x;
    m := m || jsonb_build_object('resposta', v_n || ':' || coalesce(v_txt, '-'));
    m := m || jsonb_build_object('resposta_2x', (select count(*) from aviso_da_troca(t_bia, v_troca, 'resposta')));

    /* os lembretes: amanhã (pendente) e em três dias (confirmado); o de daqui
       a nove dias não; e a segunda volta do robô não repete */
    select string_agg(x.tipo || ':' || x.evento || ':' || x.funcoes || ':' || x.pendente || ':' || (x.token = t_ana or x.token = t_bia), ',' order by x.tipo, x.endpoint)
      into v_txt from avisos_para_lembrar(v_hoje) x where x.evento like 'CONF104%';
    m := m || jsonb_build_object('lembrar', coalesce(v_txt, '-'));
    m := m || jsonb_build_object('lembrar_2x', (select count(*) from avisos_para_lembrar(v_hoje) x where x.evento like 'CONF104%'));

    /* o resultado do envio */
    perform aviso_resultado(E2, false, true);
    m := m || jsonb_build_object('sumiu', (select count(*) from avisos_celular where endpoint = E2));
    for v_n in 1..5 loop perform aviso_resultado(E1, false, false); end loop;
    m := m || jsonb_build_object('cinco_falhas', (select count(*) from avisos_celular where endpoint = E1));

    /* desligar */
    m := m || jsonb_build_object('desligar', eu_aviso_desligar(t_caio, E1 || '-teto-6') ->> 'apagados');

    raise exception 'CONF104_DESFAZ';
  exception when others then
    if sqlerrm <> 'CONF104_DESFAZ' then
      falhas := falhas || ('o cenario nao rodou ate o fim (' || case when montou then 'medindo' else 'montando' end || '): ' || sqlerrm)::text;
    end if;
  end;

  if montou then
    for r in select * from (values
        ('ligar_ok',       'true'),
        ('ligar_2x',       'true'),
        ('linhas_ana',     '1'),
        ('ligar_host',     'ENDERECO_INVALIDO'),
        ('ligar_http',     'ENDERECO_INVALIDO'),
        ('ligar_chave',    'ENDERECO_INVALIDO'),
        ('ligar_disfarce', 'ENDERECO_INVALIDO'),
        ('estado_ana',     'true'),
        ('estado_ana_e2',  'false'),
        ('estado_bia',     'true'),
        ('teto',           '5'),
        ('pedido_alheio',  '0'),
        ('pedido',         '2:pedido:Ana:conf104-teste:true'),
        ('pedido_2x',      '0'),
        ('resposta_antes', '0'),
        ('resposta',       '1:recusada:Bia:true'),
        ('resposta_2x',    '0'),
        ('lembrar',        'd1:CONF104 amanha:CONF104 VOZ:true:true,d3:CONF104 em tres dias:CONF104 VOZ:false:true,d3:CONF104 em tres dias:CONF104 VOZ:false:true'),
        ('lembrar_2x',     '0'),
        ('sumiu',          '0'),
        ('cinco_falhas',   '0'),
        ('desligar',       '1')
      ) as x(chave, esperado)
    loop
      if (m ->> r.chave) is distinct from r.esperado then
        falhas := falhas || format('%s: obtido %s, esperado %s', r.chave, coalesce(m ->> r.chave, '(nada)'), r.esperado);
      end if;
    end loop;
  end if;

  if exists (select 1 from equipes where slug = 'conf104-teste')
     or exists (select 1 from voluntarios where nome like '% Conf Cento Quatro') then
    falhas := falhas || 'o cenario de teste ficou no banco'::text; end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'104 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  select count(*) into v_n from jsonb_object_keys(m);
  raise notice 'OK 104 · conferencia: % medidas do aviso no celular, todas como esperado. Cenario desfeito.', v_n;
end $conf$;

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (104, '104 · o pedido de troca avisa uma vez', 'aviso_da_troca', 'avisado_em is null'),
      (104, '104 · o lembrete nao se repete', 'avisos_para_lembrar', 'on conflict do nothing'),
      (104, '104 · endereco que sumiu sai', 'aviso_resultado', 'delete from avisos_celular where endpoint = p_endpoint'),
      (104, '104 · ligar recusa endereco estranho', 'eu_aviso_ligar', 'ENDERECO_INVALIDO')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (104, '104-o-aviso-no-celular.sql')
  on conflict (n) do nothing;

commit;

/* o que o editor mostra: só números */
select '104' as versao,
       (select count(*) from avisos_celular) as aparelhos,
       (select count(*) from porta_publica where n = 104) as portas_novas,
       (select count(*) from testar_porta_publica() where not passou) as porta_reprovada,
       (select count(*) from schema_versao_conferir() where not passou) as sondas_reprovadas,
       (select count(*) from schema_versao_conferir()) as sondas;
