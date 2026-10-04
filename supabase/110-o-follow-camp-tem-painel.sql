/* =============================================================================
   110 · O FOLLOW CAMP TEM PAINEL

   04/10/2026. O Arthur: "veja quantas pessoas já confirmaram ir e qual forma
   de pagamento" e, em seguida, "preciso que o próprio site informe tudo o que
   foi pago, qual valor foi pago e tudo mais, tudo 100% organizado".

   O QUE ERA, MEDIDO: a ficha do site ia para uma planilha que nunca foi
   ligada (o Apps Script nunca foi publicado), e caía no WhatsApp da
   organização. O pagamento (Pix na chave da igreja e o link fixo da Stone)
   não passa pelo site. Ou seja: o site não sabia de nenhuma inscrição nem de
   nenhum real.

   O QUE PASSA A SER
     1 · `followcamp.fichas`: toda ficha que o site recebe, gravada pelo
         SERVIDOR (chave de serviço). A organização também lança à mão as que
         chegaram pelo WhatsApp ou no papel.
     2 · `followcamp.pagamentos`: o livro do dinheiro. Três origens:
           'site'   quem pagou no Pix direto ou no link da Stone e tocou em
                    "Avisar no WhatsApp" fica registrado como INFORMADO, sem
                    confirmação (conferido = false). O site não fala com
                    banco nenhum: quem confirma é a organização, no app da
                    Stone, com um toque no painel.
           'manual' a organização lança (dinheiro, Pix que veio sem aviso).
           'stone'  quando houver a chave da API da Stone, o servidor grava
                    os pedidos pagos que ela devolver (já confirmados).
     3 · O painel lê e escreve só pela porta das Demandas
         (`demandas.quem`), e só a ADMINISTRAÇÃO (a pessoa única da 96).

   DADO DE MENOR DE IDADE MORA AQUI (CPF do responsável, saúde, alergia).
   Por isso: esquema próprio sem `usage` para anon e authenticated, RLS ligado
   e nenhuma política (só as funções abaixo entram), e as três funções de
   gravação do site são SÓ da chave de serviço.

   PORTA PÚBLICA: seis funções novas no inventário da 77 (as do painel). Elas
   respondem SEM_ACESSO e SO_ADMIN para qualquer um que não seja a
   administração.

   SEM `create temp table` (101). O EDITOR DO SUPABASE NÃO MOSTRA NOTICE: a
   última linha é um select com o resultado.

   ORDEM:  ... 108 → 109 → 110
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(110);
  end if;
  if to_regclass('public.schema_versao') is not null
     and not exists (select 1 from public.schema_versao where n = 109) then
    raise exception 'FALTA A 109: rode antes a 109 (supabase/109-o-cronograma-do-culto.sql). Nada foi mudado.';
  end if;
  if to_regprocedure('demandas.quem(text)') is null then
    raise exception 'FALTA O SISTEMA DE DEMANDAS (94): o painel entra pela mesma porta. Nada foi mudado.';
  end if;
end $tranca$;

begin;

-- =========================================================================
-- 1 · o esquema e as duas tabelas
-- =========================================================================
create schema if not exists followcamp;
revoke all on schema followcamp from public;
do $g$ begin
  execute 'revoke all on schema followcamp from anon, authenticated';
exception when undefined_object then null;
end $g$;

create table if not exists followcamp.fichas (
  id                 uuid primary key default gen_random_uuid(),
  recebida_em        timestamptz not null default now(),
  origem             text not null default 'site' check (origem in ('site', 'whatsapp', 'manual')),
  campista           text not null check (char_length(btrim(campista)) between 3 and 80),
  nascimento         date,
  idade              int check (idade between 10 and 30),
  sexo               text check (sexo in ('feminino', 'masculino')),
  camisa             text check (char_length(camisa) <= 10),
  whats_campista     text check (char_length(whats_campista) <= 20),
  alergias           text check (char_length(alergias) <= 500),
  saude              text check (char_length(saude) <= 500),
  responsavel_nome   text check (char_length(responsavel_nome) <= 80),
  responsavel_cpf    text check (char_length(responsavel_cpf) <= 14),
  responsavel_whats  text check (char_length(responsavel_whats) <= 20),
  parentesco         text check (char_length(parentesco) <= 40),
  emergencia_nome    text check (char_length(emergencia_nome) <= 80),
  emergencia_whats   text check (char_length(emergencia_whats) <= 20),
  irmao              text check (char_length(irmao) <= 80),
  valor              numeric(10,2) check (valor is null or valor between 0 and 10000),
  pagamento          text check (pagamento in ('pix', 'cartao', 'dinheiro', 'carne')),
  imagem             boolean,
  termo              text check (char_length(termo) <= 4000),
  versao_termo       text check (char_length(versao_termo) <= 40),
  lancada_por        text check (char_length(lancada_por) <= 80),
  cancelada_em       timestamptz,
  cancelada_por      text check (char_length(cancelada_por) <= 80),
  motivo             text check (char_length(motivo) <= 200)
);
comment on table followcamp.fichas is
  '110: as fichas do Follow Camp 2027. O site grava pela chave de servico (fc27_ficha_gravar); a administracao le e lanca pelo painel (fc27_painel, fc27_ficha_lancar). Tem dado de menor: sem acesso direto para anon e authenticated.';

create table if not exists followcamp.pagamentos (
  id             uuid primary key default gen_random_uuid(),
  criado_em      timestamptz not null default now(),
  pago_em        date not null,
  ficha_id       uuid references followcamp.fichas(id) on delete set null,
  campista       text not null check (char_length(btrim(campista)) between 3 and 80),
  referente      text not null check (referente in ('inscricao', 'irmaos', 'parcela')),
  forma          text not null check (forma in ('pix_direto', 'link_stone', 'pix_stone', 'cartao_stone', 'dinheiro')),
  valor          numeric(10,2) not null check (valor > 0 and valor <= 10000),
  quem_pagou     text check (char_length(quem_pagou) <= 80),
  codigo         text check (char_length(codigo) <= 40),
  conferido      boolean not null default false,
  origem         text not null default 'manual' check (origem in ('manual', 'site', 'stone')),
  stone_pedido   text unique check (char_length(stone_pedido) <= 80),
  observacao     text check (char_length(observacao) <= 300),
  registrado_por text check (char_length(registrado_por) <= 80),
  apagado_em     timestamptz,
  apagado_por    text check (char_length(apagado_por) <= 80)
);
comment on table followcamp.pagamentos is
  '110: o livro do dinheiro do Follow Camp. origem site = a pessoa INFORMOU que pagou (conferido false ate a organizacao conferir na Stone); manual = a organizacao lancou; stone = veio da API da Stone, ja pago. Apagar e marcar apagado_em.';

/* o mesmo aviso de pagamento tocado duas vezes vira uma linha so */
create unique index if not exists ux_fc27_pagamento_site_codigo
  on followcamp.pagamentos (codigo) where origem = 'site' and apagado_em is null;
create index if not exists ix_fc27_pagamento_ficha on followcamp.pagamentos (ficha_id);

alter table followcamp.fichas enable row level security;
alter table followcamp.pagamentos enable row level security;
revoke all on all tables in schema followcamp from public;
do $g$ begin
  execute 'revoke all on all tables in schema followcamp from anon, authenticated';
exception when undefined_object then null;
end $g$;

-- =========================================================================
-- 2 · o nome que se compara: sem acento, sem caixa, sem espaço duplo
-- =========================================================================
create or replace function followcamp.chave_nome(t text)
returns text language sql immutable as $fn$
  select translate(lower(regexp_replace(btrim(coalesce(t, '')), '\s+', ' ', 'g')),
                   'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
$fn$;
revoke all on function followcamp.chave_nome(text) from public;

/* a ficha ativa de um nome, se houver EXATAMENTE uma (homônimo não se adivinha) */
create or replace function followcamp.ficha_do_nome(p_nome text)
returns uuid language sql stable security definer set search_path = followcamp, public as $fn$
  select case when count(*) = 1 then min(f.id::text)::uuid end
    from followcamp.fichas f
   where f.cancelada_em is null
     and followcamp.chave_nome(f.campista) = followcamp.chave_nome(p_nome)
$fn$;
revoke all on function followcamp.ficha_do_nome(text) from public;

/* o texto que veio de fora: corta, tira espaço das pontas, vazio vira null */
create or replace function followcamp.txt(p jsonb, k text, n int)
returns text language sql immutable as $fn$
  select nullif(left(btrim(coalesce(p ->> k, '')), n), '')
$fn$;
revoke all on function followcamp.txt(jsonb, text, int) from public;

-- =========================================================================
-- 3 · o site grava (SÓ a chave de serviço)
-- =========================================================================
create or replace function public.fc27_ficha_gravar(p jsonb)
returns jsonb language plpgsql security definer set search_path = followcamp, public as $fn$
declare v_id uuid;
begin
  /* `{"teste": true}` responde sem gravar: é como a rota sabe se o banco
     está pronto, sem criar ficha de mentira */
  if coalesce((p ->> 'teste')::boolean, false) then
    return jsonb_build_object('ok', true, 'teste', true);
  end if;
  insert into followcamp.fichas (origem, campista, nascimento, idade, sexo, camisa, whats_campista,
      alergias, saude, responsavel_nome, responsavel_cpf, responsavel_whats, parentesco,
      emergencia_nome, emergencia_whats, irmao, valor, pagamento, imagem, termo, versao_termo)
  values ('site',
      followcamp.txt(p, 'campista', 80), (p ->> 'nascimento')::date, (p ->> 'idade')::int,
      followcamp.txt(p, 'sexo', 10), followcamp.txt(p, 'camisa', 10), followcamp.txt(p, 'whats_campista', 20),
      followcamp.txt(p, 'alergias', 500), followcamp.txt(p, 'saude', 500),
      followcamp.txt(p, 'responsavel_nome', 80), followcamp.txt(p, 'responsavel_cpf', 14),
      followcamp.txt(p, 'responsavel_whats', 20), followcamp.txt(p, 'parentesco', 40),
      followcamp.txt(p, 'emergencia_nome', 80), followcamp.txt(p, 'emergencia_whats', 20),
      followcamp.txt(p, 'irmao', 80), (p ->> 'valor')::numeric, followcamp.txt(p, 'pagamento', 10),
      (p ->> 'imagem')::boolean, followcamp.txt(p, 'termo', 4000), followcamp.txt(p, 'versao_termo', 40))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;
revoke all on function public.fc27_ficha_gravar(jsonb) from public;
do $g$ begin
  execute 'revoke all on function public.fc27_ficha_gravar(jsonb) from anon, authenticated';
  execute 'grant execute on function public.fc27_ficha_gravar(jsonb) to service_role';
exception when undefined_object then null;
end $g$;

/* "Avisar no WhatsApp" depois do Pix direto ou do link: fica INFORMADO. */
create or replace function public.fc27_pagamento_informar(p jsonb)
returns jsonb language plpgsql security definer set search_path = followcamp, public as $fn$
declare
  v_codigo text := followcamp.txt(p, 'codigo', 40);
  v_meio text := p ->> 'meio';
  v_forma text;
  v_id uuid;
begin
  if v_codigo is null or v_codigo !~ '^FC27[A-HJ-NP-Z2-9]{8}$' then
    return jsonb_build_object('ok', false, 'erro', 'CODIGO_INVALIDO');
  end if;
  v_forma := case v_meio when 'pixdireto' then 'pix_direto' when 'cartaoLink' then 'link_stone' end;
  if v_forma is null then return jsonb_build_object('ok', false, 'erro', 'MEIO_INVALIDO'); end if;

  select id into v_id from followcamp.pagamentos
   where origem = 'site' and codigo = v_codigo and apagado_em is null;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'repetido', true);
  end if;

  insert into followcamp.pagamentos (pago_em, ficha_id, campista, referente, forma, valor, quem_pagou,
                                     codigo, conferido, origem, observacao)
  values ((now() at time zone 'America/Sao_Paulo')::date,
          followcamp.ficha_do_nome(p ->> 'campista'),
          followcamp.txt(p, 'campista', 80), p ->> 'referente', v_forma, (p ->> 'valor')::numeric,
          followcamp.txt(p, 'titular', 80), v_codigo, false, 'site',
          case when followcamp.txt(p, 'irmao', 80) is not null
               then 'irmão inscrito: ' || followcamp.txt(p, 'irmao', 80) end)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;
revoke all on function public.fc27_pagamento_informar(jsonb) from public;
do $g$ begin
  execute 'revoke all on function public.fc27_pagamento_informar(jsonb) from anon, authenticated';
  execute 'grant execute on function public.fc27_pagamento_informar(jsonb) to service_role';
exception when undefined_object then null;
end $g$;

/* Os pedidos PAGOS que a API da Stone devolver (quando houver a chave).
   `p` é uma lista; cada pedido entra uma vez (stone_pedido é único). */
create or replace function public.fc27_stone_gravar(p jsonb)
returns jsonb language plpgsql security definer set search_path = followcamp, public as $fn$
declare r jsonb; v_novos int := 0; v_forma text; v_nome text;
begin
  if jsonb_typeof(p) <> 'array' then return jsonb_build_object('ok', false, 'erro', 'LISTA'); end if;
  for r in select * from jsonb_array_elements(p) loop
    v_forma := case r ->> 'meio' when 'pix' then 'pix_stone' when 'credit_card' then 'cartao_stone'
                                 when 'debit_card' then 'cartao_stone' end;
    v_nome := coalesce(followcamp.txt(r, 'campista', 80), followcamp.txt(r, 'quem_pagou', 80), 'Sem nome');
    if v_forma is null or followcamp.txt(r, 'pedido', 80) is null or coalesce((r ->> 'valor')::numeric, 0) <= 0 then
      continue;
    end if;
    insert into followcamp.pagamentos (pago_em, ficha_id, campista, referente, forma, valor, quem_pagou,
                                       codigo, conferido, origem, stone_pedido)
    values (coalesce((r ->> 'pago_em')::date, (now() at time zone 'America/Sao_Paulo')::date),
            followcamp.ficha_do_nome(r ->> 'campista'), v_nome,
            coalesce(nullif(r ->> 'referente', ''), 'inscricao'), v_forma, (r ->> 'valor')::numeric,
            followcamp.txt(r, 'quem_pagou', 80), followcamp.txt(r, 'codigo', 40), true, 'stone',
            followcamp.txt(r, 'pedido', 80))
    on conflict (stone_pedido) do nothing;
    if found then v_novos := v_novos + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'novos', v_novos);
end $fn$;
revoke all on function public.fc27_stone_gravar(jsonb) from public;
do $g$ begin
  execute 'revoke all on function public.fc27_stone_gravar(jsonb) from anon, authenticated';
  execute 'grant execute on function public.fc27_stone_gravar(jsonb) to service_role';
exception when undefined_object then null;
end $g$;

-- =========================================================================
-- 4 · o painel (SÓ a administração, pela porta das Demandas)
-- =========================================================================
create or replace function public.fc27_painel(p_token text default null)
returns jsonb language plpgsql stable security definer set search_path = demandas, followcamp, public as $fn$
declare m demandas.membros;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  if m.papel <> 'admin' then return jsonb_build_object('ok', false, 'erro', 'SO_ADMIN'); end if;
  return jsonb_build_object(
    'ok', true,
    'eu', m.nome,
    'agora', now(),
    'fichas', coalesce((select jsonb_agg(to_jsonb(f) order by f.recebida_em) from followcamp.fichas f), '[]'::jsonb),
    'pagamentos', coalesce((select jsonb_agg(to_jsonb(g) - 'apagado_em' - 'apagado_por' order by g.pago_em, g.criado_em)
                              from followcamp.pagamentos g where g.apagado_em is null), '[]'::jsonb));
end $fn$;
revoke all on function public.fc27_painel(text) from public;
grant execute on function public.fc27_painel(text) to anon, authenticated;

/* a ficha que chegou pelo WhatsApp ou no papel */
create or replace function public.fc27_ficha_lancar(p_token text, p jsonb)
returns jsonb language plpgsql security definer set search_path = demandas, followcamp, public as $fn$
declare m demandas.membros; v_id uuid; v_origem text := coalesce(p ->> 'origem', 'whatsapp');
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  if m.papel <> 'admin' then return jsonb_build_object('ok', false, 'erro', 'SO_ADMIN'); end if;
  if v_origem not in ('whatsapp', 'manual') then return jsonb_build_object('ok', false, 'erro', 'ORIGEM_INVALIDA'); end if;
  if followcamp.txt(p, 'campista', 80) is null or char_length(followcamp.txt(p, 'campista', 80)) < 3 then
    return jsonb_build_object('ok', false, 'erro', 'SEM_CAMPISTA');
  end if;
  if followcamp.txt(p, 'pagamento', 10) is not null and p ->> 'pagamento' not in ('pix', 'cartao', 'dinheiro', 'carne') then
    return jsonb_build_object('ok', false, 'erro', 'PAGAMENTO_INVALIDO');
  end if;
  insert into followcamp.fichas (origem, campista, nascimento, idade, sexo, camisa, whats_campista,
      alergias, saude, responsavel_nome, responsavel_cpf, responsavel_whats, parentesco,
      emergencia_nome, emergencia_whats, irmao, valor, pagamento, imagem, termo, versao_termo, lancada_por)
  values (v_origem,
      followcamp.txt(p, 'campista', 80), nullif(p ->> 'nascimento', '')::date, nullif(p ->> 'idade', '')::int,
      followcamp.txt(p, 'sexo', 10), followcamp.txt(p, 'camisa', 10), followcamp.txt(p, 'whats_campista', 20),
      followcamp.txt(p, 'alergias', 500), followcamp.txt(p, 'saude', 500),
      followcamp.txt(p, 'responsavel_nome', 80), followcamp.txt(p, 'responsavel_cpf', 14),
      followcamp.txt(p, 'responsavel_whats', 20), followcamp.txt(p, 'parentesco', 40),
      followcamp.txt(p, 'emergencia_nome', 80), followcamp.txt(p, 'emergencia_whats', 20),
      followcamp.txt(p, 'irmao', 80), nullif(p ->> 'valor', '')::numeric, followcamp.txt(p, 'pagamento', 10),
      nullif(p ->> 'imagem', '')::boolean, followcamp.txt(p, 'termo', 4000), followcamp.txt(p, 'versao_termo', 40),
      left(m.nome, 80))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;
revoke all on function public.fc27_ficha_lancar(text, jsonb) from public;
grant execute on function public.fc27_ficha_lancar(text, jsonb) to anon, authenticated;

/* desistência (ou volta atrás): a ficha fica, marcada, e sai das contas */
create or replace function public.fc27_ficha_cancelar(p_token text, p_id uuid, p_cancelar boolean, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = demandas, followcamp, public as $fn$
declare m demandas.membros;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  if m.papel <> 'admin' then return jsonb_build_object('ok', false, 'erro', 'SO_ADMIN'); end if;
  update followcamp.fichas
     set cancelada_em = case when p_cancelar then now() end,
         cancelada_por = case when p_cancelar then left(m.nome, 80) end,
         motivo = case when p_cancelar then nullif(left(btrim(coalesce(p_motivo, '')), 200), '') end
   where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'erro', 'NAO_ACHEI'); end if;
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.fc27_ficha_cancelar(text, uuid, boolean, text) from public;
grant execute on function public.fc27_ficha_cancelar(text, uuid, boolean, text) to anon, authenticated;

/* o dinheiro que a organização lança (já conferido por quem lança) */
create or replace function public.fc27_pagamento_registrar(p_token text, p jsonb)
returns jsonb language plpgsql security definer set search_path = demandas, followcamp, public as $fn$
declare
  m demandas.membros; v_id uuid; v_ficha uuid; v_nome text; v_valor numeric;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  if m.papel <> 'admin' then return jsonb_build_object('ok', false, 'erro', 'SO_ADMIN'); end if;
  if coalesce(p ->> 'forma', '') not in ('pix_direto', 'link_stone', 'pix_stone', 'cartao_stone', 'dinheiro') then
    return jsonb_build_object('ok', false, 'erro', 'FORMA_INVALIDA');
  end if;
  if coalesce(p ->> 'referente', '') not in ('inscricao', 'irmaos', 'parcela') then
    return jsonb_build_object('ok', false, 'erro', 'REFERENTE_INVALIDO');
  end if;
  begin
    v_valor := (p ->> 'valor')::numeric;
  exception when others then v_valor := null;
  end;
  if v_valor is null or v_valor <= 0 or v_valor > 10000 or v_valor <> round(v_valor, 2) then
    return jsonb_build_object('ok', false, 'erro', 'VALOR_INVALIDO');
  end if;
  if nullif(p ->> 'ficha_id', '') is not null then
    select id, campista into v_ficha, v_nome from followcamp.fichas where id = (p ->> 'ficha_id')::uuid;
    if v_ficha is null then return jsonb_build_object('ok', false, 'erro', 'FICHA_INEXISTENTE'); end if;
  else
    v_nome := followcamp.txt(p, 'campista', 80);
    if v_nome is null or char_length(v_nome) < 3 then return jsonb_build_object('ok', false, 'erro', 'SEM_CAMPISTA'); end if;
    v_ficha := followcamp.ficha_do_nome(v_nome);
  end if;
  insert into followcamp.pagamentos (pago_em, ficha_id, campista, referente, forma, valor, quem_pagou,
                                     codigo, conferido, origem, observacao, registrado_por)
  values (coalesce(nullif(p ->> 'pago_em', '')::date, (now() at time zone 'America/Sao_Paulo')::date),
          v_ficha, v_nome, p ->> 'referente', p ->> 'forma', v_valor,
          followcamp.txt(p, 'quem_pagou', 80), followcamp.txt(p, 'codigo', 40),
          coalesce((p ->> 'conferido')::boolean, true), 'manual',
          followcamp.txt(p, 'observacao', 300), left(m.nome, 80))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;
revoke all on function public.fc27_pagamento_registrar(text, jsonb) from public;
grant execute on function public.fc27_pagamento_registrar(text, jsonb) to anon, authenticated;

/* conferir na Stone, ligar a uma ficha, anotar */
create or replace function public.fc27_pagamento_ajustar(p_token text, p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = demandas, followcamp, public as $fn$
declare m demandas.membros; v_ficha uuid; v_nome text;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  if m.papel <> 'admin' then return jsonb_build_object('ok', false, 'erro', 'SO_ADMIN'); end if;
  if not exists (select 1 from followcamp.pagamentos where id = p_id and apagado_em is null) then
    return jsonb_build_object('ok', false, 'erro', 'NAO_ACHEI');
  end if;
  if p ? 'conferido' then
    update followcamp.pagamentos set conferido = coalesce((p ->> 'conferido')::boolean, false) where id = p_id;
  end if;
  if p ? 'ficha_id' then
    if nullif(p ->> 'ficha_id', '') is null then
      update followcamp.pagamentos set ficha_id = null where id = p_id;
    else
      select id, campista into v_ficha, v_nome from followcamp.fichas where id = (p ->> 'ficha_id')::uuid;
      if v_ficha is null then return jsonb_build_object('ok', false, 'erro', 'FICHA_INEXISTENTE'); end if;
      update followcamp.pagamentos set ficha_id = v_ficha, campista = v_nome where id = p_id;
    end if;
  end if;
  if p ? 'observacao' then
    update followcamp.pagamentos set observacao = followcamp.txt(p, 'observacao', 300) where id = p_id;
  end if;
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.fc27_pagamento_ajustar(text, uuid, jsonb) from public;
grant execute on function public.fc27_pagamento_ajustar(text, uuid, jsonb) to anon, authenticated;

/* lançado errado: sai das contas, e a linha fica com quem apagou e quando */
create or replace function public.fc27_pagamento_apagar(p_token text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = demandas, followcamp, public as $fn$
declare m demandas.membros;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  if m.papel <> 'admin' then return jsonb_build_object('ok', false, 'erro', 'SO_ADMIN'); end if;
  update followcamp.pagamentos set apagado_em = now(), apagado_por = left(m.nome, 80)
   where id = p_id and apagado_em is null;
  if not found then return jsonb_build_object('ok', false, 'erro', 'NAO_ACHEI'); end if;
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.fc27_pagamento_apagar(text, uuid) from public;
grant execute on function public.fc27_pagamento_apagar(text, uuid) to anon, authenticated;

-- =========================================================================
-- 5 · inventário da porta pública (77)
-- =========================================================================
do $porta$ begin
  if to_regclass('public.porta_publica') is null then
    raise notice 'PULEI o inventario: este banco nao tem porta_publica (falta a 77).';
    return;
  end if;
  insert into public.porta_publica (funcao, motivo, n) values
    ('fc27_painel(p_token text)',
     'o painel do Follow Camp: fichas e pagamentos, so para a administracao das Demandas (SEM_ACESSO e SO_ADMIN para o resto) (110).', 110),
    ('fc27_ficha_lancar(p_token text, p jsonb)',
     'a administracao lanca a ficha que chegou pelo WhatsApp ou no papel; SO_ADMIN para o resto (110).', 110),
    ('fc27_ficha_cancelar(p_token text, p_id uuid, p_cancelar boolean, p_motivo text)',
     'a administracao marca desistencia (ou desfaz); a ficha fica no banco. SO_ADMIN para o resto (110).', 110),
    ('fc27_pagamento_registrar(p_token text, p jsonb)',
     'a administracao lanca um pagamento do Follow Camp; SO_ADMIN para o resto (110).', 110),
    ('fc27_pagamento_ajustar(p_token text, p_id uuid, p jsonb)',
     'a administracao confere na Stone, liga a uma ficha ou anota um pagamento; SO_ADMIN para o resto (110).', 110),
    ('fc27_pagamento_apagar(p_token text, p_id uuid)',
     'a administracao tira das contas um pagamento lancado errado (fica marcado); SO_ADMIN para o resto (110).', 110)
  on conflict (funcao) do update set motivo = excluded.motivo, n = excluded.n;
end $porta$;

-- =========================================================================
-- 6 · conferência: o cenário entra, é medido e sai
-- =========================================================================
do $conf$
declare
  falhas text[] := '{}';
  v_adm demandas.membros; v_criei boolean := false; v_md5 text; v_tok text; s_conf uuid;
  r jsonb; v_ficha uuid; v_pag uuid; v_inf uuid; n int;
begin
  perform set_config('demandas.membro', '', true);
  perform set_config('request.jwt.claims', '', true);

  select * into v_adm from demandas.membros where papel = 'admin' and ativo limit 1;
  if v_adm.id is null then
    insert into demandas.setores (nome, slug, atende) values ('CONF110 Setor', 'conf110-setor', false) returning id into s_conf;
    insert into demandas.membros (nome, papel, setor_id, token) values ('CONF110 Admin', 'admin', s_conf, 'CONF110ADM')
      returning * into v_adm;
    v_criei := true;
  else
    select md5(x::text) into v_md5 from demandas.membros x where x.id = v_adm.id;
    insert into demandas.setores (nome, slug, atende) values ('CONF110 Setor', 'conf110-setor', false) returning id into s_conf;
  end if;
  insert into demandas.membros (nome, papel, setor_id, token) values ('CONF110 Pede', 'solicitante', s_conf, 'CONF110SOL');

  /* a administracao entra pelo link ou, sem link, pelo e-mail do login */
  v_tok := v_adm.token;
  if v_tok is null then
    perform set_config('request.jwt.claims',
      jsonb_build_object('email', coalesce(v_adm.auth_email, v_adm.email))::text, true);
  end if;

  -- quem nao e a administracao nao entra
  if (public.fc27_painel('CONF110-NINGUEM') ->> 'erro') is distinct from 'SEM_ACESSO' then
    falhas := falhas || 'painel com link falso nao respondeu SEM_ACESSO'::text; end if;
  if (public.fc27_painel('CONF110SOL') ->> 'erro') is distinct from 'SO_ADMIN' then
    falhas := falhas || 'painel de quem pede nao respondeu SO_ADMIN'::text; end if;
  if (public.fc27_pagamento_registrar('CONF110SOL', '{"forma":"dinheiro","referente":"inscricao","valor":697,"campista":"Conf Cento Dez"}') ->> 'erro') is distinct from 'SO_ADMIN' then
    falhas := falhas || 'quem pede lancou pagamento'::text; end if;

  -- o site grava a ficha
  if (public.fc27_ficha_gravar('{"teste": true}') ->> 'teste') is distinct from 'true' then
    falhas := falhas || 'o teste da rota gravou ou nao respondeu'::text; end if;
  r := public.fc27_ficha_gravar(jsonb_build_object(
    'campista', '  Conf  Cento Dez ', 'nascimento', '2010-03-14', 'idade', 16, 'sexo', 'feminino', 'camisa', 'M',
    'responsavel_nome', 'Mae Conf', 'responsavel_cpf', '529.982.247-25', 'responsavel_whats', '(21) 98888-7777',
    'parentesco', 'Mãe', 'valor', 697, 'pagamento', 'pix', 'imagem', true, 'termo', 'termo', 'versao_termo', 'v1'));
  v_ficha := (r ->> 'id')::uuid;
  if v_ficha is null then falhas := falhas || ('o site nao gravou a ficha: ' || r::text); end if;
  if (select campista from followcamp.fichas where id = v_ficha) is distinct from 'Conf  Cento Dez' then
    falhas := falhas || 'o nome da ficha nao saiu aparado'::text; end if;
  begin
    perform public.fc27_ficha_gravar('{"campista":"Conf Cento Dez Errada","sexo":"outro"}');
    falhas := falhas || 'o banco aceitou sexo fora da lista'::text;
  exception when check_violation then null;
  end;

  -- o painel le
  r := public.fc27_painel(v_tok);
  if (r ->> 'ok') is distinct from 'true' then falhas := falhas || ('o painel da administracao falhou: ' || r::text); end if;
  if not exists (select 1 from jsonb_array_elements(r -> 'fichas') x where x ->> 'id' = v_ficha::text) then
    falhas := falhas || 'o painel nao trouxe a ficha'::text; end if;

  -- o aviso do site: informado, ligado a ficha pelo nome, uma linha so
  r := public.fc27_pagamento_informar(jsonb_build_object('codigo', 'FC27CQNFAAAA', 'meio', 'pixdireto',
        'campista', 'conf cento dez', 'referente', 'inscricao', 'valor', 697, 'titular', 'Pai Conf'));
  v_inf := (r ->> 'id')::uuid;
  if v_inf is null then falhas := falhas || ('o aviso do site nao gravou: ' || r::text); end if;
  if (select ficha_id from followcamp.pagamentos where id = v_inf) is distinct from v_ficha then
    falhas := falhas || 'o aviso nao achou a ficha pelo nome'::text; end if;
  if (select conferido from followcamp.pagamentos where id = v_inf) then
    falhas := falhas || 'o aviso do site nasceu conferido'::text; end if;
  perform public.fc27_pagamento_informar(jsonb_build_object('codigo', 'FC27CQNFAAAA', 'meio', 'pixdireto',
        'campista', 'Conf Cento Dez', 'referente', 'inscricao', 'valor', 697));
  if (select count(*) from followcamp.pagamentos where codigo = 'FC27CQNFAAAA') <> 1 then
    falhas := falhas || 'o mesmo aviso tocado duas vezes virou duas linhas'::text; end if;
  if (public.fc27_pagamento_informar('{"codigo":"FC27-ERRADO","meio":"pixdireto","campista":"Conf Cento Dez","referente":"inscricao","valor":697}') ->> 'erro') is distinct from 'CODIGO_INVALIDO' then
    falhas := falhas || 'o aviso aceitou codigo fora do formato'::text; end if;

  -- a administracao lanca, confere e apaga
  if (public.fc27_pagamento_registrar(v_tok, '{"forma":"boleto","referente":"inscricao","valor":697,"campista":"Conf Cento Dez"}') ->> 'erro') is distinct from 'FORMA_INVALIDA' then
    falhas := falhas || 'o banco aceitou forma fora da lista'::text; end if;
  if (public.fc27_pagamento_registrar(v_tok, '{"forma":"dinheiro","referente":"inscricao","valor":0,"campista":"Conf Cento Dez"}') ->> 'erro') is distinct from 'VALOR_INVALIDO' then
    falhas := falhas || 'o banco aceitou valor zero'::text; end if;
  if (public.fc27_pagamento_registrar(v_tok, '{"forma":"dinheiro","referente":"inscricao","valor":10.001,"campista":"Conf Cento Dez"}') ->> 'erro') is distinct from 'VALOR_INVALIDO' then
    falhas := falhas || 'o banco aceitou fracao de centavo'::text; end if;
  r := public.fc27_pagamento_registrar(v_tok, jsonb_build_object('ficha_id', v_ficha, 'forma', 'dinheiro',
        'referente', 'parcela', 'valor', 100, 'pago_em', '2026-10-04'));
  v_pag := (r ->> 'id')::uuid;
  if v_pag is null then falhas := falhas || ('a administracao nao lancou: ' || r::text); end if;
  if (select conferido::text || ':' || origem from followcamp.pagamentos where id = v_pag) is distinct from 'true:manual' then
    falhas := falhas || 'o lancamento da administracao nao nasceu conferido'::text; end if;
  /* a função e a leitura em comandos SEPARADOS: no mesmo comando, a leitura
     usa a fotografia do começo e não vê o que a função acabou de gravar */
  r := public.fc27_pagamento_ajustar(v_tok, v_inf, '{"conferido": true}');
  if (r ->> 'ok') is distinct from 'true'
     or not (select conferido from followcamp.pagamentos where id = v_inf) then
    falhas := falhas || 'conferir o aviso nao pegou'::text; end if;
  if (public.fc27_pagamento_apagar(v_tok, v_pag) ->> 'ok') is distinct from 'true' then
    falhas := falhas || 'apagar o lancamento falhou'::text; end if;
  if exists (select 1 from jsonb_array_elements(public.fc27_painel(v_tok) -> 'pagamentos') x where x ->> 'id' = v_pag::text) then
    falhas := falhas || 'o pagamento apagado continua nas contas'::text; end if;
  if (public.fc27_pagamento_apagar(v_tok, v_pag) ->> 'erro') is distinct from 'NAO_ACHEI' then
    falhas := falhas || 'apagar duas vezes nao respondeu NAO_ACHEI'::text; end if;

  -- a Stone grava uma vez por pedido
  r := public.fc27_stone_gravar('[{"pedido":"or_CONF110","meio":"pix","valor":697,"campista":"Conf Cento Dez","quem_pagou":"Pai Conf"},{"pedido":"or_CONF110","meio":"pix","valor":697}]');
  if (r ->> 'novos') is distinct from '1' then falhas := falhas || ('a Stone gravou o mesmo pedido duas vezes: ' || r::text); end if;

  -- desistencia
  r := public.fc27_ficha_cancelar(v_tok, v_ficha, true, 'teste');
  if (r ->> 'ok') is distinct from 'true'
     or (select cancelada_em from followcamp.fichas where id = v_ficha) is null then
    falhas := falhas || 'cancelar a ficha nao pegou'::text; end if;

  -- a porta: a internet nao chega nas tabelas nem nas gravacoes do site
  if has_schema_privilege('anon', 'followcamp', 'usage') or has_schema_privilege('authenticated', 'followcamp', 'usage') then
    falhas := falhas || 'anon ou authenticated alcancam o esquema followcamp'::text; end if;
  if has_function_privilege('anon', 'public.fc27_ficha_gravar(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.fc27_ficha_gravar(jsonb)', 'execute')
     or has_function_privilege('anon', 'public.fc27_pagamento_informar(jsonb)', 'execute')
     or has_function_privilege('anon', 'public.fc27_stone_gravar(jsonb)', 'execute') then
    falhas := falhas || 'a internet alcanca uma gravacao que e so do servidor'::text; end if;
  if not has_function_privilege('service_role', 'public.fc27_ficha_gravar(jsonb)', 'execute') then
    falhas := falhas || 'o servidor nao alcanca fc27_ficha_gravar'::text; end if;

  -- limpeza
  perform set_config('request.jwt.claims', '', true);
  perform set_config('demandas.membro', '', true);
  delete from followcamp.pagamentos where codigo = 'FC27CQNFAAAA' or stone_pedido = 'or_CONF110' or id = v_pag;
  delete from followcamp.fichas where campista like 'Conf  Cento Dez%' or campista like 'Conf Cento Dez%';
  delete from demandas.membros where nome like 'CONF110%' and (not v_criei or id <> v_adm.id);
  if v_criei then delete from demandas.membros where id = v_adm.id; end if;
  delete from demandas.setores where nome = 'CONF110 Setor';
  if not v_criei and (select md5(x::text) from demandas.membros x where x.id = v_adm.id) is distinct from v_md5 then
    falhas := falhas || 'limpeza: a linha da administracao de verdade mudou'::text; end if;
  select count(*) into n from followcamp.fichas where campista ilike '%conf%cento dez%';
  if n > 0 then falhas := falhas || 'o cenario de teste ficou no banco'::text; end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'110 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 110 · conferencia do painel do Follow Camp: tudo como esperado. Cenario desfeito.';
end $conf$;

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (110, '110 · o painel e so da administracao', 'fc27_painel', 'so_admin'),
      (110, '110 · o aviso do site nasce sem conferir', 'fc27_pagamento_informar', 'v_forma, (p ->> ''valor'')::numeric, followcamp.txt(p, ''titular'', 80), v_codigo, false'),
      (110, '110 · o mesmo aviso nao vira duas linhas', 'fc27_pagamento_informar', '''repetido'', true'),
      (110, '110 · apagar pagamento so marca', 'fc27_pagamento_apagar', 'set apagado_em = now()')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (110, '110-o-follow-camp-tem-painel.sql')
  on conflict (n) do nothing;

commit;

/* o que o editor mostra: só números */
select '110' as versao,
       (select count(*) from followcamp.fichas) as fichas,
       (select count(*) from followcamp.pagamentos) as pagamentos,
       (select count(*) from testar_porta_publica() where not passou) as porta_reprovada,
       (select count(*) from schema_versao_conferir() where not passou) as sondas_reprovadas;
