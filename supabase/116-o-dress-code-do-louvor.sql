/* =============================================================================
   116 · O DRESS CODE DO LOUVOR

   26/10/2026. O líder do Louvor pediu, e o Arthur trouxe: definir antes, em
   cada culto, como quem está escalado se veste. Cores (uma ou várias, em
   combinações), orientações do estilo e imagens de inspiração (enviadas ou
   geradas por IA). Quem serve vê na própria página; a mensagem do grupo leva
   as cores e o link das inspirações. "O objetivo é que ninguém precise ficar
   perguntando no grupo quais roupas ou cores deverá utilizar."

   O QUE PASSA A EXISTIR
     · `culto_obs.dress_code` (jsonb): o dress code de um culto para um
       ministério, ao lado do repertório e da ordem. Formato em
       `dress_code_valido`; o id (o do link público) é do banco e não muda.
     · `dress_code_ligado(equipe)`: só o Louvor, neste primeiro momento. O
       gatilho barra dress code de outro ministério, venha por onde vier.
     · `salvar_dress_code(...)`: a liderança grava; MUDOU se outra pessoa
       gravou no meio (a tela mostra a versão nova em vez de passar por cima).
     · `eu_dress_codes(token)`: quem serve vê o dress code dos cultos em que
       está escalado (porta pública, pelo link pessoal).
     · `dress_code_publico(id)`: a página do link da mensagem do grupo (porta
       pública, pelo id que não se adivinha). Sem nome nem telefone.
     · o armário `dress-code` (Storage): imagens de até 5 MB, JPG, PNG ou
       WebP, numa pasta por ministério. Só a liderança do Louvor envia; ler é
       público (é o que a página do link mostra). Nada se troca nem se apaga
       pela tabela: tirar uma imagem do dress code não apaga o arquivo, que
       pode estar em outro culto (reaproveitar um dress code anterior usa as
       mesmas imagens).
     · `dress_code_pode_gerar(equipe)`: a conta das imagens geradas por IA,
       12 por ministério a cada 24 horas (o gerador custa por imagem).

   PORTA PÚBLICA: `eu_dress_codes` e `dress_code_publico` entram no
   inventário da 77, com o motivo.

   SEM `create temp table` (101). O EDITOR DO SUPABASE NÃO MOSTRA NOTICE: a
   última linha é um select com o resultado.

   ORDEM:  ... 114 → 115 → 116
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(116);
  end if;
  if to_regclass('public.schema_versao') is not null
     and not exists (select 1 from public.schema_versao where n = 115) then
    raise exception 'FALTA A 115: rode antes a 115 (o botão do robô). Nada foi mudado.';
  end if;
end $tranca$;

begin;

-- =========================================================================
-- 1 · quem tem dress code: o Louvor
-- =========================================================================
create or replace function public.dress_code_ligado(p_equipe uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from equipes where id = p_equipe and slug = 'louvor');
$fn$;
revoke all on function public.dress_code_ligado(uuid) from public, anon;
grant execute on function public.dress_code_ligado(uuid) to authenticated;
comment on function public.dress_code_ligado(uuid) is
  '116: os ministerios com dress code. Neste primeiro momento, so o Louvor (pedido do lider do Louvor, 26/10/2026).';

-- =========================================================================
-- 2 · as imagens: <ministério>/<uuid>.<webp|jpg|png>, e quem envia
-- =========================================================================
create or replace function public.dress_caminho_valido(p text)
returns boolean language sql immutable set search_path = public as $fn$
  select coalesce(p ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$', false);
$fn$;
revoke all on function public.dress_caminho_valido(text) from public, anon;
grant execute on function public.dress_caminho_valido(text) to authenticated;

create or replace function public.dress_do_lider(p_nome text)
returns boolean language plpgsql stable set search_path = public as $fn$
declare v_eq uuid;
begin
  if not public.dress_caminho_valido(p_nome) then return false; end if;
  v_eq := split_part(p_nome, '/', 1)::uuid;
  return public.dress_code_ligado(v_eq) and public.lidera_equipe(v_eq);
end $fn$;
revoke all on function public.dress_do_lider(text) from public, anon;
grant execute on function public.dress_do_lider(text) to authenticated;
comment on function public.dress_do_lider(text) is
  '116: a politica do armario dress-code. Verdadeiro so para quem lidera o ministerio da pasta, e so se o ministerio tem dress code.';

-- =========================================================================
-- 3 · o formato
-- =========================================================================
/* {
     v: 1, id: <uuid do link>, atualizado_em,
     combinacoes: [ { cores: [ { hex: '#1f2a44', nome: 'Azul-marinho' } ] } ],   1 a 3, de 1 a 5 cores
     estilo: null | social | esporte-fino | casual-arrumado | casual | tematico,
     orientacoes: '' (até 400, quebra de linha vale),
     imagens: [ { caminho: '<ministério>/<uuid>.webp', ia: true|false } ]       até 8, sem repetir
   } */
create or replace function public.dress_code_valido(p jsonb, p_equipe uuid)
returns boolean language plpgsql immutable set search_path = public as $fn$
declare c jsonb; cor jsonb; im jsonb; k text; n int; vistos text[] := '{}';
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'object' then return false; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('v', 'id', 'atualizado_em', 'combinacoes', 'estilo', 'orientacoes', 'imagens') then return false; end if;
  end loop;
  if coalesce(p ->> 'v', '') <> '1' then return false; end if;
  if not coalesce((p ->> 'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', false) then return false; end if;
  if jsonb_typeof(p -> 'combinacoes') is distinct from 'array' then return false; end if;
  n := jsonb_array_length(p -> 'combinacoes');
  if n < 1 or n > 3 then return false; end if;
  for c in select value from jsonb_array_elements(p -> 'combinacoes') loop
    if jsonb_typeof(c) <> 'object' or jsonb_typeof(c -> 'cores') is distinct from 'array' then return false; end if;
    for k in select jsonb_object_keys(c) loop
      if k <> 'cores' then return false; end if;
    end loop;
    n := jsonb_array_length(c -> 'cores');
    if n < 1 or n > 5 then return false; end if;
    for cor in select value from jsonb_array_elements(c -> 'cores') loop
      if jsonb_typeof(cor) <> 'object' then return false; end if;
      for k in select jsonb_object_keys(cor) loop
        if k not in ('hex', 'nome') then return false; end if;
      end loop;
      if not coalesce((cor ->> 'hex') ~ '^#[0-9a-f]{6}$', false) then return false; end if;
      if jsonb_typeof(cor -> 'nome') is distinct from 'string'
         or length(btrim(cor ->> 'nome')) not between 1 and 30
         or (cor ->> 'nome') ~ '[[:cntrl:]]' then return false; end if;
    end loop;
  end loop;
  if p ? 'estilo' and jsonb_typeof(p -> 'estilo') <> 'null'
     and coalesce(p ->> 'estilo', '') not in ('social', 'esporte-fino', 'casual-arrumado', 'casual', 'tematico') then
    return false;
  end if;
  if p ? 'orientacoes' and (jsonb_typeof(p -> 'orientacoes') <> 'string' or length(p ->> 'orientacoes') > 400
     or (p ->> 'orientacoes') ~ E'[\\x01-\\x09\\x0b-\\x1f\\x7f]') then
    return false;
  end if;
  if p ? 'imagens' then
    if jsonb_typeof(p -> 'imagens') <> 'array' or jsonb_array_length(p -> 'imagens') > 8 then return false; end if;
    for im in select value from jsonb_array_elements(p -> 'imagens') loop
      if jsonb_typeof(im) <> 'object' then return false; end if;
      for k in select jsonb_object_keys(im) loop
        if k not in ('caminho', 'ia') then return false; end if;
      end loop;
      if not public.dress_caminho_valido(im ->> 'caminho') then return false; end if;
      /* só imagem da pasta do próprio ministério */
      if split_part(im ->> 'caminho', '/', 1) <> p_equipe::text then return false; end if;
      if (im ->> 'caminho') = any (vistos) then return false; end if;
      vistos := vistos || (im ->> 'caminho');
      if im ? 'ia' and jsonb_typeof(im -> 'ia') <> 'boolean' then return false; end if;
    end loop;
  end if;
  return true;
end $fn$;
revoke all on function public.dress_code_valido(jsonb, uuid) from public, anon;
grant execute on function public.dress_code_valido(jsonb, uuid) to authenticated;

alter table culto_obs add column if not exists dress_code jsonb;
alter table culto_obs drop constraint if exists culto_obs_dress_code_ok;
alter table culto_obs add constraint culto_obs_dress_code_ok
  check (dress_code is null or public.dress_code_valido(dress_code, equipe_id));
comment on column culto_obs.dress_code is
  '116: o dress code do culto para o ministerio (formato em dress_code_valido). O id e do banco e nao muda: e o do link publico.';
/* o link público acha o dress code pelo id */
create unique index if not exists ux_culto_obs_dress_code_id on culto_obs ((dress_code ->> 'id')) where dress_code is not null;

/* O GATILHO: vale para a função e para quem escrever direto na tabela (o RLS
   da culto_obs deixa a liderança escrever a linha do próprio ministério).
     · dress code só de ministério que tem (o Louvor), também quando a linha
       muda de ministério (um `update` do equipe_id não passava por aqui:
       achado da revisão de 26/10);
     · o id é do banco: o primeiro fica (o link que já foi para o grupo
       continua abrindo), e o que veio do aparelho não vale (um id copiado de
       outro culto mostraria o dress code errado);
     · a versão e a hora da gravação, só quando o dress code muda: o upsert
       do PostgREST (o recado do dia, `salvarDia`) regrava as colunas da
       chave, e um carimbo novo ali acusaria MUDOU no dress code que a
       liderança está editando. */
create or replace function public.culto_obs_dress_code()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_id text;
begin
  if new.dress_code is null then return new; end if;
  if tg_op = 'UPDATE' and new.dress_code is not distinct from old.dress_code
     and new.equipe_id is not distinct from old.equipe_id then
    return new;
  end if;
  if not public.dress_code_ligado(new.equipe_id) then
    raise exception 'DRESS_SO_LOUVOR: so o Louvor tem dress code' using errcode = 'P0001';
  end if;
  if jsonb_typeof(new.dress_code) <> 'object' then return new; end if;  -- o CHECK recusa
  v_id := case when tg_op = 'UPDATE' then old.dress_code ->> 'id' end;
  new.dress_code := new.dress_code || jsonb_build_object(
    'v', 1, 'id', coalesce(v_id, gen_random_uuid()::text), 'atualizado_em', to_jsonb(clock_timestamp()));
  return new;
end $fn$;
revoke all on function public.culto_obs_dress_code() from public, anon, authenticated;
drop trigger if exists tg_culto_obs_dress_code on culto_obs;
create trigger tg_culto_obs_dress_code before insert or update of dress_code, equipe_id on culto_obs
  for each row execute function public.culto_obs_dress_code();

-- =========================================================================
-- 4 · a liderança grava
-- =========================================================================
create or replace function public.salvar_dress_code(p_culto uuid, p_equipe uuid, p_dress jsonb, p_antes jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_atual jsonb; v_novo jsonb;
begin
  if p_equipe is null or not public.lidera_equipe(p_equipe) then
    return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO');
  end if;
  if not public.dress_code_ligado(p_equipe) then
    return jsonb_build_object('ok', false, 'erro', 'SO_LOUVOR');
  end if;
  if p_culto is null or not exists (select 1 from cultos where id = p_culto) then
    return jsonb_build_object('ok', false, 'erro', 'CULTO_INEXISTENTE');
  end if;
  /* o formato, antes de escrever qualquer coisa. O aparelho não escolhe id,
     versão nem hora (o gatilho põe): o id daqui é provisório, só para a
     conferência, que exige um */
  if p_dress is not null then
    if jsonb_typeof(p_dress) <> 'object' then
      return jsonb_build_object('ok', false, 'erro', 'INVALIDO');
    end if;
    v_novo := (p_dress - 'id' - 'v' - 'atualizado_em') || jsonb_build_object('v', 1, 'id', gen_random_uuid()::text);
    if not public.dress_code_valido(v_novo, p_equipe) then
      return jsonb_build_object('ok', false, 'erro', 'INVALIDO');
    end if;
  end if;
  /* a linha nasce se não existe, e fica TRAVADA até o fim (como a ordem do
     culto, 105): dois líderes salvando o PRIMEIRO dress code do culto ao
     mesmo tempo passam um de cada vez, e o segundo vê MUDOU. Sem a linha, o
     `for update` não travava nada e o segundo passava por cima calado
     (achado da revisão de 26/10) */
  insert into culto_obs (culto_id, equipe_id) values (p_culto, p_equipe)
    on conflict (culto_id, equipe_id) do nothing;
  select dress_code into v_atual from culto_obs where culto_id = p_culto and equipe_id = p_equipe for update;
  /* outra pessoa gravou depois que a tela abriu: devolve o que está lá. A
     versão é a hora da gravação (o gatilho põe a cada mudança), e não o
     conteúdo inteiro: a tela guarda o dress code no formato dela */
  if (v_atual is null) <> (p_antes is null)
     or (v_atual is not null and (v_atual ->> 'atualizado_em') is distinct from (p_antes ->> 'atualizado_em')) then
    return jsonb_build_object('ok', false, 'erro', 'MUDOU', 'atual', v_atual);
  end if;
  update culto_obs set dress_code = v_novo
   where culto_id = p_culto and equipe_id = p_equipe
  returning dress_code into v_novo;
  return jsonb_build_object('ok', true, 'dress', v_novo);
end $fn$;
revoke all on function public.salvar_dress_code(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.salvar_dress_code(uuid, uuid, jsonb, jsonb) to authenticated;

-- =========================================================================
-- 5 · quem serve vê (pelo link pessoal) e o link do grupo (pelo id)
-- =========================================================================
create or replace function public.eu_dress_codes(p_token text)
returns table(culto_id uuid, data date, evento text, inicio time, equipe text, dress jsonb)
language plpgsql stable security definer set search_path = public as $fn$
declare v_id uuid; v_eq uuid; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select v.id, v.equipe_id into v_id, v_eq
    from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;
  /* o dress code é do ministério: quem serve no Louvor vê o do Louvor */
  if not public.dress_code_ligado(v_eq) then return; end if;
  return query
  select c.id, c.data, c.evento, c.inicio, q.nome, o.dress_code
    from cultos c
    join culto_obs o on o.culto_id = c.id and o.equipe_id = v_eq
    join equipes q on q.id = v_eq
   where c.data between v_hoje and v_hoje + 60
     and o.dress_code is not null
     and (exists (select 1 from escalacoes e
                   where e.culto_id = c.id and e.voluntario_id = v_id
                     and coalesce(e.status, 'pendente') <> 'recusado')
          or exists (select 1 from plantoes p where p.culto_id = c.id and p.voluntario_id = v_id))
   order by c.data, c.inicio nulls first;
end $fn$;
revoke all on function public.eu_dress_codes(text) from public;
grant execute on function public.eu_dress_codes(text) to anon, authenticated;

create or replace function public.dress_code_publico(p_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; r record;
begin
  if p_id is null or p_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false);
  end if;
  select c.data, c.evento, c.inicio, q.nome as equipe, o.dress_code as dress into r
    from culto_obs o
    join cultos c on c.id = o.culto_id
    join equipes q on q.id = o.equipe_id
   where o.dress_code ->> 'id' = p_id and public.dress_code_ligado(o.equipe_id);
  /* culto que passou há mais de uma semana: o link já não serve */
  if not found or r.data < v_hoje - 7 then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true, 'data', r.data, 'evento', r.evento, 'inicio', r.inicio,
                            'equipe', r.equipe, 'dress', r.dress);
end $fn$;
revoke all on function public.dress_code_publico(text) from public;
grant execute on function public.dress_code_publico(text) to anon, authenticated;

-- =========================================================================
-- 6 · a conta das imagens geradas por IA
-- =========================================================================
create table if not exists dress_code_geracoes (
  id        bigserial primary key,
  equipe_id uuid not null references equipes(id) on delete cascade,
  por       text,
  em        timestamptz not null default clock_timestamp()
);
create index if not exists ix_dress_code_geracoes on dress_code_geracoes (equipe_id, em desc);
alter table dress_code_geracoes enable row level security;
revoke all on dress_code_geracoes from public, anon, authenticated;
grant select, insert on dress_code_geracoes to service_role;

create or replace function public.dress_code_pode_gerar(p_equipe uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_n int;
begin
  if p_equipe is null or not public.lidera_equipe(p_equipe) then
    return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO');
  end if;
  if not public.dress_code_ligado(p_equipe) then
    return jsonb_build_object('ok', false, 'erro', 'SO_LOUVOR');
  end if;
  /* um de cada vez por ministério: dois toques juntos não passam do teto */
  perform pg_advisory_xact_lock(hashtext('dress_code_gerar:' || p_equipe::text));
  select count(*) into v_n from dress_code_geracoes where equipe_id = p_equipe and em > now() - interval '24 hours';
  if v_n >= 12 then
    return jsonb_build_object('ok', false, 'erro', 'LIMITE');
  end if;
  insert into dress_code_geracoes (equipe_id, por) values (p_equipe, left(lower(nullif(auth.jwt() ->> 'email', '')), 200));
  return jsonb_build_object('ok', true, 'restam', 12 - v_n - 1);
end $fn$;
revoke all on function public.dress_code_pode_gerar(uuid) from public, anon;
grant execute on function public.dress_code_pode_gerar(uuid) to authenticated;

-- =========================================================================
-- 7 · o armário das imagens
-- =========================================================================
do $armario$ begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'PULEI o armario do dress code: este banco nao tem o Storage do Supabase.';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('dress-code', 'dress-code', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
  on conflict (id) do update
     set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png'];
  execute 'drop policy if exists "116 dress-code: a lideranca envia" on storage.objects';
  execute $p$create policy "116 dress-code: a lideranca envia" on storage.objects
               for insert to authenticated
               with check (bucket_id = 'dress-code' and public.dress_do_lider(name))$p$;
  execute 'drop policy if exists "116 dress-code: a lideranca ve a pasta" on storage.objects';
  execute $p$create policy "116 dress-code: a lideranca ve a pasta" on storage.objects
               for select to authenticated
               using (bucket_id = 'dress-code' and public.dress_do_lider(name))$p$;
end $armario$;

-- =========================================================================
-- 8 · o inventário da porta pública (77)
-- =========================================================================
do $porta$ begin
  if to_regclass('public.porta_publica') is null then
    raise notice 'PULEI o inventario: este banco nao tem porta_publica (falta a 77).';
    return;
  end if;
  insert into public.porta_publica (funcao, motivo, n) values
    ('eu_dress_codes(p_token text)',
     'o dress code (cores, orientacoes e imagens de inspiracao) dos cultos dos proximos 60 dias em que a pessoa serve, pelo link pessoal, so do ministerio dela e so com dress code (116).', 116),
    ('dress_code_publico(p_id text)',
     'a pagina do link do dress code que vai na mensagem do grupo: cores, orientacoes e imagens de um culto, pelo id que nao se adivinha, sem nome nem telefone, ate uma semana depois (116).', 116)
  on conflict (funcao) do update set motivo = excluded.motivo, n = excluded.n;
end $porta$;

-- =========================================================================
-- 9 · conferência: o cenário entra, é medido e sai
-- =========================================================================
do $conf$
declare
  falhas text[] := '{}';
  m jsonb := '{}'::jsonb;
  r record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_louvor uuid; v_midia uuid; v_culto uuid; v_func uuid; v_vol uuid; v_j jsonb; v_d jsonb; v_id text; v_n int; v_t text;
  c_img text; c_alheia text; v_base jsonb; v_nome_louvor text; v_dia date; v_hora jsonb; v_antigo uuid;
begin
  begin
    select id into v_louvor from equipes where slug = 'louvor';
    select id into v_midia from equipes where slug = 'midia';
    if v_louvor is null or v_midia is null then raise exception 'sem o Louvor ou a Midia neste banco'; end if;
    select nome into v_nome_louvor from equipes where id = v_louvor;
    insert into lideres (email, equipe_id) values ('conf116-lider@exemplo.invalid', v_louvor);
    insert into lideres (email, equipe_id) values ('conf116-midia@exemplo.invalid', v_midia);
    /* O CENÁRIO NÃO ENCOSTA NO QUE É DE VERDADE (revisão de 26/10). O dress
       code é só do Louvor de verdade (`dress_code_ligado` olha o slug), então
       a conferência não pode usar um ministério de teste como a 105 e a 111.
       Ela usava o culto regular de daqui a 20 dias e o primeiro posto do
       Louvor: com a escala do mês montada, o posto já tinha gente (o único de
       `escalacoes` derrubava tudo), e posto que exige sexo recusava a pessoa
       de teste. Agora: um evento do Louvor só da conferência, num dia sem
       outro evento dele, um posto só dela e uma pessoa só dela; e a conta da
       IA começa do zero. Tudo se desfaz no fim. */
    v_dia := v_hoje + 20;
    while exists (select 1 from cultos where data = v_dia and equipe_id = v_louvor and evento is not null) loop
      v_dia := v_dia + 1;
    end loop;
    insert into cultos (data, evento, equipe_id) values (v_dia, 'CONF116 evento', v_louvor) returning id into v_culto;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_louvor, 'CONF116 POSTO', 999, true, true, array['domingo','follow']) returning id into v_func;
    insert into voluntarios (equipe_id, nome, telefone, ativo, token, sexo)
         values (v_louvor, 'Conf Cento Dezesseis', '21900116001', true, 'conf116tok00000000', 'F') returning id into v_vol;
    insert into escalacoes (culto_id, funcao_id, voluntario_id, status) values (v_culto, v_func, v_vol, 'pendente');
    delete from dress_code_geracoes where equipe_id = v_louvor;
    c_img := v_louvor::text || '/0b8f6c1e-1d2a-4c3b-9e4f-5a6b7c8d9e0f.webp';
    c_alheia := v_midia::text || '/0b8f6c1e-1d2a-4c3b-9e4f-5a6b7c8d9e0f.webp';
    v_base := jsonb_build_object(
      'combinacoes', jsonb_build_array(jsonb_build_object('cores', jsonb_build_array(
         jsonb_build_object('hex', '#1f2a44', 'nome', 'Azul-marinho'), jsonb_build_object('hex', '#e8dcc6', 'nome', 'Bege')))),
      'estilo', 'esporte-fino', 'orientacoes', 'Camisa lisa, sem estampa.',
      'imagens', jsonb_build_array(jsonb_build_object('caminho', c_img, 'ia', false)),
      /* o id que vier do aparelho não vale */
      'id', '11111111-1111-4111-8111-111111111111');

    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf116-lider@exemplo.invalid","role":"authenticated"}', true);
    v_j := salvar_dress_code(v_culto, v_louvor, v_base, null);
    v_d := v_j -> 'dress';
    v_id := v_d ->> 'id';
    m := m || jsonb_build_object('salva', format('%s:%s:%s', v_j ->> 'ok', v_id is not null and v_id <> '11111111-1111-4111-8111-111111111111', v_d ->> 'v'));
    /* gravar de novo sobre o que está lá: o id fica */
    v_j := salvar_dress_code(v_culto, v_louvor, v_base || '{"estilo":"social"}', v_d);
    m := m || jsonb_build_object('regrava', format('%s:%s', v_j ->> 'ok', (v_j #>> '{dress,id}') = v_id));
    v_d := v_j -> 'dress';
    /* outra pessoa gravou no meio: MUDOU, com o que está lá */
    v_j := salvar_dress_code(v_culto, v_louvor, v_base, v_base);
    m := m || jsonb_build_object('mudou', format('%s:%s', v_j ->> 'erro', (v_j #>> '{atual,estilo}')));
    m := m || jsonb_build_object('cor_torta', coalesce(salvar_dress_code(v_culto, v_louvor,
           jsonb_set(v_base, '{combinacoes,0,cores,0,hex}', '"azul"'), v_d) ->> 'erro', '-'));
    m := m || jsonb_build_object('quatro_combinacoes', coalesce(salvar_dress_code(v_culto, v_louvor,
           jsonb_set(v_base, '{combinacoes}', (v_base -> 'combinacoes') || (v_base -> 'combinacoes') || (v_base -> 'combinacoes') || (v_base -> 'combinacoes')), v_d) ->> 'erro', '-'));
    m := m || jsonb_build_object('imagem_alheia', coalesce(salvar_dress_code(v_culto, v_louvor,
           jsonb_set(v_base, '{imagens,0,caminho}', to_jsonb(c_alheia)), v_d) ->> 'erro', '-'));
    m := m || jsonb_build_object('chave_estranha', coalesce(salvar_dress_code(v_culto, v_louvor, v_base || '{"x":1}', v_d) ->> 'erro', '-'));
    begin
      update culto_obs set dress_code = jsonb_set(dress_code, '{id}', '"22222222-2222-4222-8222-222222222222"')
       where culto_id = v_culto and equipe_id = v_louvor;
      m := m || jsonb_build_object('id_direto', (select dress_code ->> 'id' from culto_obs where culto_id = v_culto and equipe_id = v_louvor) = v_id);
    exception when insufficient_privilege then
      m := m || jsonb_build_object('id_direto', true);
    end;
    begin
      perform 1 from dress_code_geracoes limit 1;
      m := m || jsonb_build_object('le_geracoes', 'leu');
    exception when insufficient_privilege then
      m := m || jsonb_build_object('le_geracoes', 'negado');
    end;
    /* a conta da IA: 12 em 24 horas */
    for v_n in 1..12 loop v_j := dress_code_pode_gerar(v_louvor); end loop;
    m := m || jsonb_build_object('gera_doze', format('%s:%s', v_j ->> 'ok', v_j ->> 'restam'));
    m := m || jsonb_build_object('gera_treze', coalesce(dress_code_pode_gerar(v_louvor) ->> 'erro', '-'));
    m := m || jsonb_build_object('gera_midia', coalesce(dress_code_pode_gerar(v_midia) ->> 'erro', '-'));

    /* quem não lidera o Louvor (a liderança da Mídia) */
    perform set_config('request.jwt.claims', '{"email":"conf116-midia@exemplo.invalid","role":"authenticated"}', true);
    m := m || jsonb_build_object('outro_ministerio', coalesce(salvar_dress_code(v_culto, v_midia, v_base, null) ->> 'erro', '-'));
    m := m || jsonb_build_object('gera_outro', coalesce(dress_code_pode_gerar(v_midia) ->> 'erro', '-'));
    /* nem direto na tabela: o RLS deixa a liderança da Mídia escrever a linha
       dela, e o gatilho barra o dress code */
    begin
      insert into culto_obs (culto_id, equipe_id, dress_code) values (v_culto, v_midia, v_base);
      m := m || jsonb_build_object('direto_midia', 'entrou');
    exception when others then
      m := m || jsonb_build_object('direto_midia', case when sqlerrm like 'DRESS_SO_LOUVOR%' then 'barrou' else sqlerrm end);
    end;
    m := m || jsonb_build_object('nao_lidera', coalesce(salvar_dress_code(v_culto, v_louvor, v_base, v_d) ->> 'erro', '-'));
    m := m || jsonb_build_object('nao_lidera_gera', coalesce(dress_code_pode_gerar(v_louvor) ->> 'erro', '-'));
    m := m || jsonb_build_object('envia_midia', dress_do_lider(c_img));
    /* nem na pasta da própria Mídia: o armário é só do ministério que tem dress code */
    m := m || jsonb_build_object('envia_midia_propria', dress_do_lider(c_alheia));
    perform set_config('request.jwt.claims', '{"email":"conf116-lider@exemplo.invalid","role":"authenticated"}', true);
    m := m || jsonb_build_object('envia_lider', format('%s:%s:%s', dress_do_lider(c_img), dress_do_lider(c_alheia),
           dress_do_lider(v_louvor::text || '/../segredo.webp')));

    /* o armário de verdade, quando o banco tem o Storage */
    if to_regclass('storage.objects') is not null then
      begin
        insert into storage.objects (bucket_id, name) values ('dress-code', c_img);
        m := m || jsonb_build_object('rls_propria', 'entrou');
      exception when insufficient_privilege then m := m || jsonb_build_object('rls_propria', 'barrou');
      end;
      begin
        insert into storage.objects (bucket_id, name) values ('dress-code', c_alheia);
        m := m || jsonb_build_object('rls_alheia', 'entrou');
      exception when insufficient_privilege then m := m || jsonb_build_object('rls_alheia', 'barrou');
      end;
      begin
        update storage.objects set name = c_alheia where bucket_id = 'dress-code' and name = c_img;
      exception when insufficient_privilege then null;
      end;
      m := m || jsonb_build_object('rls_troca', (select count(*) from storage.objects where bucket_id = 'dress-code' and name = c_alheia));
      reset role;
      set local role anon;
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      begin
        insert into storage.objects (bucket_id, name) values ('dress-code', v_louvor::text || '/1b8f6c1e-1d2a-4c3b-9e4f-5a6b7c8d9e0f.webp');
        m := m || jsonb_build_object('rls_anon', 'entrou');
      exception when insufficient_privilege then m := m || jsonb_build_object('rls_anon', 'barrou');
      end;
    else
      m := m || jsonb_build_object('rls_propria', 'entrou', 'rls_alheia', 'barrou', 'rls_troca', 0, 'rls_anon', 'barrou');
    end if;
    reset role;

    /* quem serve vê, pelo link pessoal; e o link do grupo, sem login */
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    select count(*), max(e.dress ->> 'id') into v_n, v_t from eu_dress_codes('conf116tok00000000') e;
    m := m || jsonb_build_object('quem_serve', format('%s:%s', v_n, v_t = v_id));
    v_j := dress_code_publico(v_id);
    m := m || jsonb_build_object('publico', format('%s:%s:%s', v_j ->> 'ok', v_j ->> 'equipe' = v_nome_louvor,
           (v_j #>> '{dress,combinacoes,0,cores,0,nome}')));
    m := m || jsonb_build_object('publico_torto', format('%s:%s', dress_code_publico('nada') ->> 'ok', dress_code_publico('33333333-3333-4333-8333-333333333333') ->> 'ok'));
    /* o link de um culto que passou há mais de uma semana já não abre (o
       evento antigo é da conferência, gravado pelo dono do banco) */
    reset role;
    v_dia := v_hoje - 10;
    while exists (select 1 from cultos where data = v_dia and equipe_id = v_louvor and evento is not null) loop
      v_dia := v_dia - 1;
    end loop;
    insert into cultos (data, evento, equipe_id) values (v_dia, 'CONF116 antigo', v_louvor) returning id into v_antigo;
    /* escrita direta, com um id escolhido de fora: o do banco vale */
    insert into culto_obs (culto_id, equipe_id, dress_code) values (v_antigo, v_louvor,
      '{"id":"44444444-4444-4444-8444-444444444444","combinacoes":[{"cores":[{"hex":"#111111","nome":"Preto"}]}],"imagens":[]}'::jsonb)
      returning dress_code ->> 'id' into v_t;
    m := m || jsonb_build_object('id_inserido', v_t is not null and v_t <> '44444444-4444-4444-8444-444444444444');
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    m := m || jsonb_build_object('publico_antigo', dress_code_publico(v_t) ->> 'ok');
    begin
      perform salvar_dress_code(v_culto, v_louvor, v_base, null);
      m := m || jsonb_build_object('anon_grava', 'gravou');
    exception when insufficient_privilege then
      m := m || jsonb_build_object('anon_grava', 'negado');
    end;
    reset role;
    /* o ministério que não tem (mais) dress code não mostra o que ficou: com
       o Louvor desligado (outro slug, só aqui dentro), nem o link pessoal nem
       o do grupo mostram */
    update equipes set slug = 'conf116-desligado' where id = v_louvor;
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    select count(*) into v_n from eu_dress_codes('conf116tok00000000');
    m := m || jsonb_build_object('desligado_ve', v_n, 'desligado_publico', dress_code_publico(v_id) ->> 'ok');
    reset role;
    update equipes set slug = 'louvor' where id = v_louvor;
    /* quem não está escalado não vê */
    update escalacoes set status = 'recusado' where voluntario_id = v_vol;
    select count(*) into v_n from eu_dress_codes('conf116tok00000000');
    m := m || jsonb_build_object('recusou', v_n);

    /* o recado do dia pelo upsert do PostgREST (regrava as colunas da chave):
       não mexe no dress code, e não carimba hora nova (senão a tela de quem
       está editando o dress code acusaria MUDOU) */
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf116-lider@exemplo.invalid","role":"authenticated"}', true);
    select dress_code -> 'atualizado_em' into v_hora from culto_obs where culto_id = v_culto and equipe_id = v_louvor;
    insert into culto_obs (culto_id, equipe_id, obs) values (v_culto, v_louvor, 'CONF116 recado')
      on conflict (culto_id, equipe_id) do update
        set culto_id = excluded.culto_id, equipe_id = excluded.equipe_id, obs = excluded.obs;
    m := m || jsonb_build_object('recado_sem_carimbo', (select (dress_code -> 'atualizado_em') = v_hora and obs = 'CONF116 recado'
           from culto_obs where culto_id = v_culto and equipe_id = v_louvor));
    reset role;
    /* a linha com dress code (sem imagem, para a conferência do formato não
       barrar antes) não muda de ministério: o gatilho barra */
    update culto_obs set dress_code = dress_code || '{"imagens":[]}'::jsonb where culto_id = v_culto and equipe_id = v_louvor;
    begin
      update culto_obs set equipe_id = v_midia where culto_id = v_culto and equipe_id = v_louvor;
      m := m || jsonb_build_object('muda_ministerio', 'entrou');
    exception when others then
      m := m || jsonb_build_object('muda_ministerio', case when sqlerrm like 'DRESS_SO_LOUVOR%' then 'barrou' else sqlerrm end);
    end;

    /* tirar o dress code */
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf116-lider@exemplo.invalid","role":"authenticated"}', true);
    /* o que está lá agora (as escritas diretas acima mudaram a hora da gravação) */
    select dress_code into v_d from culto_obs where culto_id = v_culto and equipe_id = v_louvor;
    v_j := salvar_dress_code(v_culto, v_louvor, null, v_d);
    m := m || jsonb_build_object('tira', format('%s:%s', v_j ->> 'ok',
           (select dress_code is null from culto_obs where culto_id = v_culto and equipe_id = v_louvor)));
    reset role;
    m := m || jsonb_build_object('porta', (select count(*) from testar_porta_publica() where not passou));

    raise exception 'CONF116_DESFAZ';
  exception when others then
    if sqlerrm <> 'CONF116_DESFAZ' then
      falhas := falhas || ('o cenario nao montou: ' || sqlerrm)::text;
    end if;
  end;
  reset role;

  for r in select * from (values
      ('salva',              'true:t:1'),
      ('regrava',            'true:t'),
      ('mudou',              'MUDOU:social'),
      ('cor_torta',          'INVALIDO'),
      ('quatro_combinacoes', 'INVALIDO'),
      ('imagem_alheia',      'INVALIDO'),
      ('chave_estranha',     'INVALIDO'),
      ('outro_ministerio',   'SO_LOUVOR'),
      ('gera_outro',         'SO_LOUVOR'),
      ('direto_midia',       'barrou'),
      ('id_direto',          'true'),
      ('le_geracoes',        'negado'),
      ('gera_doze',          'true:0'),
      ('gera_treze',         'LIMITE'),
      ('gera_midia',         'SEM_PERMISSAO'),
      ('nao_lidera',         'SEM_PERMISSAO'),
      ('nao_lidera_gera',    'SEM_PERMISSAO'),
      ('envia_midia',        'false'),
      ('envia_midia_propria','false'),
      ('envia_lider',        't:f:f'),
      ('rls_propria',        'entrou'),
      ('rls_alheia',         'barrou'),
      ('rls_troca',          '0'),
      ('rls_anon',           'barrou'),
      ('quem_serve',         '1:t'),
      ('publico',            'true:t:Azul-marinho'),
      ('publico_torto',      'false:false'),
      ('publico_antigo',     'false'),
      ('id_inserido',        'true'),
      ('desligado_ve',       '0'),
      ('desligado_publico',  'false'),
      ('anon_grava',         'negado'),
      ('recusou',            '0'),
      ('recado_sem_carimbo', 'true'),
      ('muda_ministerio',    'barrou'),
      ('tira',               'true:t'),
      ('porta',              '0')
    ) as x(chave, esperado)
  loop
    if (m ->> r.chave) is distinct from r.esperado then
      falhas := falhas || format('%s: obtido %s, esperado %s', r.chave, coalesce(m ->> r.chave, '(nada)'), r.esperado);
    end if;
  end loop;

  if exists (select 1 from lideres where email like 'conf116%@exemplo.invalid')
     or exists (select 1 from voluntarios where token = 'conf116tok00000000')
     or exists (select 1 from cultos where evento in ('CONF116 evento', 'CONF116 antigo'))
     or exists (select 1 from funcoes where nome = 'CONF116 POSTO') then
    falhas := falhas || 'o cenario de teste ficou no banco'::text;
  end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'116 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  select count(*) into v_n from jsonb_object_keys(m);
  raise notice 'OK 116 · conferencia: % medidas do dress code (gravar, formato, permissao, armario, link pessoal, link do grupo e a conta da IA), todas como esperado. Cenario desfeito.', v_n;
end $conf$;

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (116, '116 · so a lideranca grava o dress code', 'salvar_dress_code', 'lidera_equipe'),
      (116, '116 · so o Louvor tem dress code', 'dress_code_ligado', 'louvor'),
      (116, '116 · o id do link e do banco', 'culto_obs_dress_code', 'gen_random_uuid'),
      (116, '116 · quem serve ve so o do proprio ministerio', 'eu_dress_codes', 'dress_code_ligado'),
      (116, '116 · a IA tem teto por ministerio', 'dress_code_pode_gerar', 'pg_advisory_xact_lock')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (116, '116-o-dress-code-do-louvor.sql')
  on conflict (n) do nothing;

commit;

/* o PostgREST guarda o desenho do banco em cache; o Supabase recarrega
   sozinho depois de DDL, e isto só garante */
notify pgrst, 'reload schema';

/* o que o editor mostra: só números */
select '116' as versao,
       (select count(*) from culto_obs where dress_code is not null) as dress_codes,
       (select count(*) from storage.buckets where id = 'dress-code') as armario,
       (select count(*) from testar_porta_publica() where not passou) as porta_reprovada,
       (select count(*) from schema_versao_conferir() where not passou) as sondas_reprovadas;
