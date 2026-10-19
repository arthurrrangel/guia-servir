/* =============================================================================
   114 · O CARNÊ TEM PLANO E O PAGAMENTO TEM DONO

   19/10/2026. O Arthur: "preciso conseguir registrar com mais precisão os
   pagantes nesse formato de carnê", "e também de quem paga por cartão ou
   pix, temos que arrumar um jeito no sistema de conseguir ir controlando os
   pagamentos e o sistema ir acompanhando tudo". Decidiu (19/10): parcelas
   iguais com data (1, 2 ou 3, vencimento no dia 10, a última até 03/01) e um
   botão de cobrança com a mensagem pronta.

   O QUE ERA, MEDIDO NO PAINEL EM 19/10
     · 7 fichas, 4 pessoas: a mesma campista mandou 4 fichas no mesmo dia, e
       cada uma virou uma inscrição a cobrar.
     · 3 avisos de pagamento, 2 sem ficha: o aviso acha a ficha pelo NOME
       digitado na hora de pagar, e um nome com uma letra trocada ("Olivera")
       ou repetido em quatro fichas não acha ninguém.
     · o carnê não tinha plano: valor livre, sem vencimento. O painel só
       sabia dizer "pagou parte", nunca "atrasou".
     · o comprovante ia para o WhatsApp, fora do sistema.

   O QUE PASSA A SER
     1 · Cada ficha tem um LINK PESSOAL (`token`, 24 letras hex). Tudo o que a
         pessoa paga pelo link cai na ficha dela pelo token, sem depender de
         nome.
     2 · A ficha repetida (mesmo nome e mesmo nascimento, ficha viva) não vira
         outra inscrição: atualiza a que existe e devolve o mesmo link.
     3 · O carnê tem plano: `parcelas` (1 a 3) e `plano_em`. As datas e os
         valores são uma conta só, em lib/followcamp-carne.ts: o banco guarda a
         escolha, não repete a regra.
     4 · O comprovante entra pelo site e fica no banco (`comprovantes`), preso
         ao pagamento. Só a administração vê. Foto ou PDF, até 3 MB, até 3 por
         pagamento; o tipo é lido nos primeiros bytes, não no que o navegador
         diz.

   PORTA PÚBLICA: duas funções novas no inventário da 77 (as da
   administração). As da pessoa (pelo link) e as de gravação são SÓ da chave
   de serviço: quem fala com elas é o servidor do site.

   SEM `create temp table` (101). O EDITOR DO SUPABASE NÃO MOSTRA NOTICE: a
   última linha é um select com o resultado.

   ORDEM:  ... 111 → 112 → 113 → 114
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(114);
  end if;
  /* rodada antes da 113, a régua pularia e recusaria a 113 depois */
  if to_regclass('public.schema_versao') is not null
     and not exists (select 1 from public.schema_versao where n = 113) then
    raise exception 'FALTA A 113: rode antes a 112 e a 113. Nada foi mudado.';
  end if;
  if to_regclass('followcamp.fichas') is null then
    raise exception 'FALTA A 110: o painel do Follow Camp. Nada foi mudado.';
  end if;
end $tranca$;

begin;

-- =========================================================================
-- 1 · a ficha ganha link, plano e a marca de quando foi reenviada
-- =========================================================================
alter table followcamp.fichas
  add column if not exists token text not null default encode(extensions.gen_random_bytes(12), 'hex');
alter table followcamp.fichas add column if not exists parcelas smallint;
alter table followcamp.fichas add column if not exists plano_em timestamptz;
alter table followcamp.fichas add column if not exists atualizada_em timestamptz;
alter table followcamp.fichas drop constraint if exists fichas_parcelas_ck;
alter table followcamp.fichas add constraint fichas_parcelas_ck
  check (parcelas is null or parcelas between 1 and 3);
alter table followcamp.fichas drop constraint if exists fichas_token_ck;
alter table followcamp.fichas add constraint fichas_token_ck check (token ~ '^[0-9a-f]{24}$');
create unique index if not exists ux_fc27_ficha_token on followcamp.fichas (token);
comment on column followcamp.fichas.token is
  '114: o link pessoal da ficha (guiaservir.com/followcamp/minha/<token>). Tudo o que a pessoa paga por ele cai nesta ficha.';
comment on column followcamp.fichas.parcelas is
  '114: o plano do carne (1 a 3 parcelas iguais). As datas e os valores saem de lib/followcamp-carne.ts, a partir de plano_em.';

-- =========================================================================
-- 2 · o comprovante, preso ao pagamento
-- =========================================================================
create table if not exists followcamp.comprovantes (
  id            uuid primary key default gen_random_uuid(),
  pagamento_id  uuid not null references followcamp.pagamentos(id) on delete cascade,
  tipo          text not null check (tipo in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  dados         bytea not null check (octet_length(dados) between 200 and 3000000),
  criado_em     timestamptz not null default now()
);
create index if not exists ix_fc27_comprovante_pagamento on followcamp.comprovantes (pagamento_id);
alter table followcamp.comprovantes enable row level security;
revoke all on followcamp.comprovantes from public;
do $g$ begin
  execute 'revoke all on followcamp.comprovantes from anon, authenticated';
exception when undefined_object then null;
end $g$;
comment on table followcamp.comprovantes is
  '114: o comprovante que a pessoa manda pelo link pessoal. So a administracao ve (fc27_comprovante_ver).';

-- =========================================================================
-- 3 · a ficha do site não se repete
--
-- Corpo da 110 com duas mudanças: antes de gravar, procura uma ficha VIVA com
-- o mesmo nome (sem acento, sem caixa) e o mesmo nascimento; achou, atualiza
-- ela e devolve o mesmo link. E devolve o `token`.
-- =========================================================================
create or replace function public.fc27_ficha_gravar(p jsonb)
returns jsonb language plpgsql security definer set search_path = followcamp, public as $fn$
declare v_id uuid; v_token text; v_repetida boolean := false;
begin
  /* `{"teste": true}` responde sem gravar: é como a rota sabe se o banco
     está pronto, sem criar ficha de mentira */
  if coalesce((p ->> 'teste')::boolean, false) then
    return jsonb_build_object('ok', true, 'teste', true);
  end if;

  select f.id into v_id from followcamp.fichas f
   where f.cancelada_em is null
     and followcamp.chave_nome(f.campista) = followcamp.chave_nome(p ->> 'campista')
     and f.nascimento = (p ->> 'nascimento')::date
   order by f.recebida_em desc
   limit 1
   for update;

  if v_id is not null then
    v_repetida := true;
    update followcamp.fichas set
      campista = followcamp.txt(p, 'campista', 80), idade = (p ->> 'idade')::int,
      sexo = followcamp.txt(p, 'sexo', 10), camisa = followcamp.txt(p, 'camisa', 10),
      whats_campista = followcamp.txt(p, 'whats_campista', 20),
      alergias = followcamp.txt(p, 'alergias', 500), saude = followcamp.txt(p, 'saude', 500),
      responsavel_nome = followcamp.txt(p, 'responsavel_nome', 80), responsavel_cpf = followcamp.txt(p, 'responsavel_cpf', 14),
      responsavel_whats = followcamp.txt(p, 'responsavel_whats', 20), parentesco = followcamp.txt(p, 'parentesco', 40),
      emergencia_nome = followcamp.txt(p, 'emergencia_nome', 80), emergencia_whats = followcamp.txt(p, 'emergencia_whats', 20),
      irmao = followcamp.txt(p, 'irmao', 80), valor = (p ->> 'valor')::numeric,
      /* o plano escolhido continua; a forma só muda se a pessoa não tem plano */
      pagamento = case when parcelas is not null then pagamento else followcamp.txt(p, 'pagamento', 10) end,
      imagem = (p ->> 'imagem')::boolean, termo = followcamp.txt(p, 'termo', 4000),
      versao_termo = followcamp.txt(p, 'versao_termo', 40),
      atualizada_em = now()
     where id = v_id
    returning token into v_token;
  else
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
    returning id, token into v_id, v_token;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'token', v_token, 'repetida', v_repetida);
end $fn$;
revoke all on function public.fc27_ficha_gravar(jsonb) from public;
do $g$ begin
  execute 'revoke all on function public.fc27_ficha_gravar(jsonb) from anon, authenticated';
  execute 'grant execute on function public.fc27_ficha_gravar(jsonb) to service_role';
exception when undefined_object then null;
end $g$;

-- =========================================================================
-- 4 · o aviso de pagamento acha a ficha pelo link
--
-- Corpo da 110 com uma mudança: com `ficha_token`, a ficha é a do link (e o
-- nome do pagamento é o da ficha); sem ele, continua pelo nome, como antes.
-- =========================================================================
create or replace function public.fc27_pagamento_informar(p jsonb)
returns jsonb language plpgsql security definer set search_path = followcamp, public as $fn$
declare
  v_codigo text := followcamp.txt(p, 'codigo', 40);
  v_meio text := p ->> 'meio';
  v_forma text;
  v_id uuid;
  v_ficha uuid;
  v_nome text;
begin
  if v_codigo is null or v_codigo !~ '^FC27[A-HJ-NP-Z2-9]{8}$' then
    return jsonb_build_object('ok', false, 'erro', 'CODIGO_INVALIDO');
  end if;
  v_forma := case v_meio when 'pixdireto' then 'pix_direto' when 'cartaoLink' then 'link_stone' end;
  if v_forma is null then return jsonb_build_object('ok', false, 'erro', 'MEIO_INVALIDO'); end if;

  if nullif(p ->> 'ficha_token', '') is not null then
    select f.id, f.campista into v_ficha, v_nome from followcamp.fichas f
     where f.token = p ->> 'ficha_token' and f.cancelada_em is null;
    if v_ficha is null then return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO'); end if;
  else
    v_ficha := followcamp.ficha_do_nome(p ->> 'campista');
  end if;

  select id into v_id from followcamp.pagamentos
   where origem = 'site' and codigo = v_codigo and apagado_em is null;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'id', v_id, 'repetido', true);
  end if;

  insert into followcamp.pagamentos (pago_em, ficha_id, campista, referente, forma, valor, quem_pagou,
                                     codigo, conferido, origem, observacao)
  values ((now() at time zone 'America/Sao_Paulo')::date,
          v_ficha,
          coalesce(v_nome, followcamp.txt(p, 'campista', 80)), p ->> 'referente', v_forma, (p ->> 'valor')::numeric, followcamp.txt(p, 'titular', 80), v_codigo, false, 'site',
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

-- =========================================================================
-- 5 · a pessoa, pelo link (SÓ a chave de serviço: quem chama é o servidor)
-- =========================================================================

/* O que a página pessoal mostra. Sem CPF, sem saúde, sem telefone: só o que
   a pessoa precisa para pagar e acompanhar. */
create or replace function public.fc27_minha(p_token text)
returns jsonb language plpgsql stable security definer set search_path = followcamp, public as $fn$
declare f followcamp.fichas;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{24}$' then
    return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO');
  end if;
  select * into f from followcamp.fichas where token = p_token;
  if f.id is null then return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO'); end if;
  if f.cancelada_em is not null then return jsonb_build_object('ok', false, 'erro', 'CANCELADA'); end if;
  return jsonb_build_object(
    'ok', true,
    'agora', now(),
    'ficha', jsonb_build_object(
      'campista', f.campista, 'idade', f.idade, 'irmao', f.irmao, 'valor', f.valor,
      'pagamento', f.pagamento, 'parcelas', f.parcelas, 'plano_em', f.plano_em, 'recebida_em', f.recebida_em),
    'pagamentos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'codigo', g.codigo, 'valor', g.valor, 'referente', g.referente, 'forma', g.forma,
               'conferido', g.conferido, 'pago_em', g.pago_em, 'criado_em', g.criado_em,
               'comprovantes', (select count(*) from followcamp.comprovantes c where c.pagamento_id = g.id))
             order by g.pago_em, g.criado_em)
        from followcamp.pagamentos g
       where g.ficha_id = f.id and g.apagado_em is null), '[]'::jsonb));
end $fn$;
revoke all on function public.fc27_minha(text) from public;
do $g$ begin
  execute 'revoke all on function public.fc27_minha(text) from anon, authenticated';
  execute 'grant execute on function public.fc27_minha(text) to service_role';
exception when undefined_object then null;
end $g$;

/* A pessoa escolhe em quantas parcelas. Uma vez: trocar depois é com a
   organização (fc27_ficha_plano). Quem escolhe plano passa a ser do carnê. */
create or replace function public.fc27_plano_escolher(p_token text, p_parcelas int)
returns jsonb language plpgsql security definer set search_path = followcamp, public as $fn$
declare v_id uuid; v_atual smallint;
begin
  if p_parcelas is null or p_parcelas not between 1 and 3 then
    return jsonb_build_object('ok', false, 'erro', 'PARCELAS_INVALIDAS');
  end if;
  select id, parcelas into v_id, v_atual from followcamp.fichas
   where token = p_token and cancelada_em is null
   for update;
  if v_id is null then return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO'); end if;
  if v_atual is not null then return jsonb_build_object('ok', false, 'erro', 'PLANO_JA_ESCOLHIDO'); end if;
  update followcamp.fichas set parcelas = p_parcelas, plano_em = now(), pagamento = 'carne' where id = v_id;
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.fc27_plano_escolher(text, int) from public;
do $g$ begin
  execute 'revoke all on function public.fc27_plano_escolher(text, int) from anon, authenticated';
  execute 'grant execute on function public.fc27_plano_escolher(text, int) to service_role';
exception when undefined_object then null;
end $g$;

/* O comprovante: cria o aviso (se ainda não existe) na ficha do link e guarda
   o arquivo. O tipo é o dos primeiros bytes. */
create or replace function public.fc27_comprovante_gravar(p jsonb)
returns jsonb language plpgsql security definer set search_path = followcamp, public as $fn$
declare
  v_ficha uuid; v_nome text; v_pag uuid; v_dono uuid;
  v_codigo text := followcamp.txt(p, 'codigo', 40);
  v_bin bytea; v_tipo text; v_n int; r jsonb;
begin
  select f.id, f.campista into v_ficha, v_nome from followcamp.fichas f
   where f.token = p ->> 'ficha_token' and f.cancelada_em is null;
  if v_ficha is null then return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO'); end if;
  if v_codigo is null or v_codigo !~ '^FC27[A-HJ-NP-Z2-9]{8}$' then
    return jsonb_build_object('ok', false, 'erro', 'CODIGO_INVALIDO');
  end if;

  begin
    v_bin := decode(regexp_replace(coalesce(p ->> 'dados', ''), '\s', '', 'g'), 'base64');
  exception when others then
    return jsonb_build_object('ok', false, 'erro', 'ARQUIVO_INVALIDO');
  end;
  if v_bin is null or octet_length(v_bin) < 200 then return jsonb_build_object('ok', false, 'erro', 'ARQUIVO_INVALIDO'); end if;
  if octet_length(v_bin) > 3000000 then return jsonb_build_object('ok', false, 'erro', 'ARQUIVO_GRANDE'); end if;
  v_tipo := case
    when substring(v_bin from 1 for 3) = '\xffd8ff'::bytea then 'image/jpeg'
    when substring(v_bin from 1 for 8) = '\x89504e470d0a1a0a'::bytea then 'image/png'
    when substring(v_bin from 1 for 4) = '\x52494646'::bytea and substring(v_bin from 9 for 4) = '\x57454250'::bytea then 'image/webp'
    when substring(v_bin from 1 for 5) = '\x255044462d'::bytea then 'application/pdf'
  end;
  if v_tipo is null then return jsonb_build_object('ok', false, 'erro', 'TIPO_INVALIDO'); end if;

  select id, ficha_id into v_pag, v_dono from followcamp.pagamentos
   where origem = 'site' and codigo = v_codigo and apagado_em is null;
  if v_pag is null then
    r := public.fc27_pagamento_informar(p);
    if (r ->> 'ok') is distinct from 'true' then return r; end if;
    v_pag := (r ->> 'id')::uuid;
  elsif v_dono is null then
    /* o aviso veio antes pelo nome e não achou ficha: o link diz de quem é */
    update followcamp.pagamentos set ficha_id = v_ficha, campista = v_nome where id = v_pag;
  elsif v_dono <> v_ficha then
    /* o mesmo código em outra ficha: não se mistura */
    return jsonb_build_object('ok', false, 'erro', 'CODIGO_DE_OUTRA_FICHA');
  end if;

  select count(*) into v_n from followcamp.comprovantes where pagamento_id = v_pag;
  if v_n >= 3 then return jsonb_build_object('ok', false, 'erro', 'LIMITE'); end if;
  insert into followcamp.comprovantes (pagamento_id, tipo, dados) values (v_pag, v_tipo, v_bin);
  return jsonb_build_object('ok', true, 'id', v_pag, 'comprovantes', v_n + 1);
end $fn$;
revoke all on function public.fc27_comprovante_gravar(jsonb) from public;
do $g$ begin
  execute 'revoke all on function public.fc27_comprovante_gravar(jsonb) from anon, authenticated';
  execute 'grant execute on function public.fc27_comprovante_gravar(jsonb) to service_role';
exception when undefined_object then null;
end $g$;

-- =========================================================================
-- 6 · a administração (pela porta das Demandas)
-- =========================================================================

/* Corpo da 110 com uma mudança: cada pagamento diz quantos comprovantes tem.
   As colunas novas da ficha (token, parcelas, plano_em) já vêm no to_jsonb. */
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
    'pagamentos', coalesce((select jsonb_agg((to_jsonb(g) - 'apagado_em' - 'apagado_por')
                                             || jsonb_build_object('comprovantes',
                                                  (select count(*) from followcamp.comprovantes c where c.pagamento_id = g.id))
                                             order by g.pago_em, g.criado_em)
                              from followcamp.pagamentos g where g.apagado_em is null), '[]'::jsonb));
end $fn$;
revoke all on function public.fc27_painel(text) from public;
grant execute on function public.fc27_painel(text) to anon, authenticated;

/* ver os comprovantes de um pagamento */
create or replace function public.fc27_comprovante_ver(p_token text, p_pagamento uuid)
returns jsonb language plpgsql stable security definer set search_path = demandas, followcamp, public as $fn$
declare m demandas.membros;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  if m.papel <> 'admin' then return jsonb_build_object('ok', false, 'erro', 'SO_ADMIN'); end if;
  return jsonb_build_object('ok', true, 'comprovantes', coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'tipo', c.tipo, 'criado_em', c.criado_em,
                                        'dados', encode(c.dados, 'base64')) order by c.criado_em)
      from followcamp.comprovantes c where c.pagamento_id = p_pagamento), '[]'::jsonb));
end $fn$;
revoke all on function public.fc27_comprovante_ver(text, uuid) from public;
grant execute on function public.fc27_comprovante_ver(text, uuid) to anon, authenticated;

/* a administração define, troca ou tira o plano de uma ficha */
create or replace function public.fc27_ficha_plano(p_token text, p_ficha uuid, p_parcelas int)
returns jsonb language plpgsql security definer set search_path = demandas, followcamp, public as $fn$
declare m demandas.membros;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  if m.papel <> 'admin' then return jsonb_build_object('ok', false, 'erro', 'SO_ADMIN'); end if;
  if p_parcelas is not null and p_parcelas not between 1 and 3 then
    return jsonb_build_object('ok', false, 'erro', 'PARCELAS_INVALIDAS');
  end if;
  update followcamp.fichas
     set parcelas = p_parcelas,
         plano_em = case when p_parcelas is null then null else coalesce(plano_em, now()) end,
         pagamento = case when p_parcelas is null then pagamento else 'carne' end
   where id = p_ficha;
  if not found then return jsonb_build_object('ok', false, 'erro', 'NAO_ACHEI'); end if;
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function public.fc27_ficha_plano(text, uuid, int) from public;
grant execute on function public.fc27_ficha_plano(text, uuid, int) to anon, authenticated;

-- =========================================================================
-- 7 · inventário da porta pública (77)
-- =========================================================================
do $porta$ begin
  if to_regclass('public.porta_publica') is null then
    raise notice 'PULEI o inventario: este banco nao tem porta_publica (falta a 77).';
    return;
  end if;
  insert into public.porta_publica (funcao, motivo, n) values
    ('fc27_comprovante_ver(p_token text, p_pagamento uuid)',
     'a administracao ve o comprovante que a pessoa mandou pelo link pessoal; SO_ADMIN para o resto (114).', 114),
    ('fc27_ficha_plano(p_token text, p_ficha uuid, p_parcelas integer)',
     'a administracao define ou troca o plano do carne de uma ficha; SO_ADMIN para o resto (114).', 114)
  on conflict (funcao) do update set motivo = excluded.motivo, n = excluded.n;
end $porta$;

-- =========================================================================
-- 8 · conferência: o cenário entra, é medido e sai
-- =========================================================================
do $conf$
declare
  falhas text[] := '{}';
  v_adm demandas.membros; v_criei boolean := false; v_md5 text; v_tok text; s_conf uuid;
  r jsonb; v_a uuid; v_b uuid; v_tok_a text; v_tok_b text; v_pag uuid; n int;
  v_jpg text := encode(decode('ffd8ffe0' || repeat('00', 300), 'hex'), 'base64');
  v_txt text := encode(convert_to(repeat('nao e imagem ', 40), 'UTF8'), 'base64');
  v_ficha jsonb := jsonb_build_object(
    'campista', 'Conf Cento Catorze', 'nascimento', '2009-05-20', 'idade', 17, 'sexo', 'feminino', 'camisa', 'M',
    'responsavel_nome', 'Mae Conf', 'responsavel_cpf', '529.982.247-25', 'responsavel_whats', '(21) 98888-7777',
    'parentesco', 'Mãe', 'valor', 697, 'pagamento', 'cartao', 'imagem', true, 'termo', 'termo', 'versao_termo', 'v1');
begin
  perform set_config('demandas.membro', '', true);
  perform set_config('request.jwt.claims', '', true);

  select * into v_adm from demandas.membros where papel = 'admin' and ativo limit 1;
  if v_adm.id is null then
    insert into demandas.setores (nome, slug, atende) values ('CONF114 Setor', 'conf114-setor', false) returning id into s_conf;
    insert into demandas.membros (nome, papel, setor_id, token) values ('CONF114 Admin', 'admin', s_conf, 'CONF114ADM')
      returning * into v_adm;
    v_criei := true;
  else
    select md5(x::text) into v_md5 from demandas.membros x where x.id = v_adm.id;
    insert into demandas.setores (nome, slug, atende) values ('CONF114 Setor', 'conf114-setor', false) returning id into s_conf;
  end if;
  insert into demandas.membros (nome, papel, setor_id, token) values ('CONF114 Pede', 'solicitante', s_conf, 'CONF114SOL');
  v_tok := v_adm.token;
  if v_tok is null then
    perform set_config('request.jwt.claims',
      jsonb_build_object('email', coalesce(v_adm.auth_email, v_adm.email))::text, true);
  end if;

  -- a ficha repetida nao vira outra inscricao
  r := public.fc27_ficha_gravar(v_ficha);
  v_a := (r ->> 'id')::uuid; v_tok_a := r ->> 'token';
  if v_a is null or v_tok_a !~ '^[0-9a-f]{24}$' or (r ->> 'repetida') <> 'false' then
    falhas := falhas || ('a ficha nova nao voltou com link: ' || r::text); end if;
  r := public.fc27_ficha_gravar(v_ficha || jsonb_build_object('campista', ' CONF  cento catorze ', 'camisa', 'G'));
  if (r ->> 'id')::uuid is distinct from v_a or (r ->> 'token') is distinct from v_tok_a or (r ->> 'repetida') <> 'true' then
    falhas := falhas || ('a ficha repetida virou outra: ' || r::text); end if;
  if (select count(*) from followcamp.fichas where followcamp.chave_nome(campista) = 'conf cento catorze') <> 1 then
    falhas := falhas || 'a ficha repetida gravou duas linhas'::text; end if;
  if (select camisa from followcamp.fichas where id = v_a) is distinct from 'G' then
    falhas := falhas || 'a ficha repetida nao atualizou os dados'::text; end if;
  r := public.fc27_ficha_gravar(v_ficha || jsonb_build_object('nascimento', '2008-01-02'));
  v_b := (r ->> 'id')::uuid; v_tok_b := r ->> 'token';
  if v_b is null or v_b = v_a then
    falhas := falhas || 'homonimo com outro nascimento nao virou outra ficha'::text; end if;

  -- a pagina pessoal
  r := public.fc27_minha(v_tok_a);
  if (r ->> 'ok') is distinct from 'true' or (r -> 'ficha' ->> 'campista') is null then
    falhas := falhas || ('a pagina pessoal nao abriu: ' || r::text); end if;
  if (r -> 'ficha') ? 'responsavel_cpf' or (r -> 'ficha') ? 'saude' or (r -> 'ficha') ? 'token' then
    falhas := falhas || 'a pagina pessoal mostra dado que nao e dela'::text; end if;
  if (public.fc27_minha('0123456789abcdef01234567') ->> 'erro') is distinct from 'LINK_INVALIDO'
     or (public.fc27_minha('nao-e-link') ->> 'erro') is distinct from 'LINK_INVALIDO' then
    falhas := falhas || 'link falso nao respondeu LINK_INVALIDO'::text; end if;

  -- o plano: uma vez pela pessoa; a administracao troca
  if (public.fc27_plano_escolher(v_tok_a, 4) ->> 'erro') is distinct from 'PARCELAS_INVALIDAS' then
    falhas := falhas || 'plano de 4 parcelas passou'::text; end if;
  r := public.fc27_plano_escolher(v_tok_a, 3);
  if (r ->> 'ok') is distinct from 'true' then falhas := falhas || ('escolher o plano falhou: ' || r::text); end if;
  if (select parcelas::text || ':' || pagamento || ':' || (plano_em is not null)::text from followcamp.fichas where id = v_a)
     is distinct from '3:carne:true' then
    falhas := falhas || 'o plano nao gravou parcelas, carne e data'::text; end if;
  if (public.fc27_plano_escolher(v_tok_a, 2) ->> 'erro') is distinct from 'PLANO_JA_ESCOLHIDO' then
    falhas := falhas || 'a pessoa trocou o plano sozinha'::text; end if;
  if (public.fc27_ficha_plano('CONF114SOL', v_a, 2) ->> 'erro') is distinct from 'SO_ADMIN' then
    falhas := falhas || 'quem pede trocou o plano'::text; end if;
  r := public.fc27_ficha_plano(v_tok, v_a, 2);
  if (r ->> 'ok') is distinct from 'true' or (select parcelas from followcamp.fichas where id = v_a) <> 2 then
    falhas := falhas || ('a administracao nao trocou o plano: ' || r::text); end if;

  -- o aviso pelo link acha a ficha mesmo com outro nome
  r := public.fc27_pagamento_informar(jsonb_build_object('codigo', 'FC27CATRZEAA', 'meio', 'pixdireto',
        'campista', 'Nome Digitado Errado', 'referente', 'parcela', 'valor', 232.33, 'ficha_token', v_tok_a));
  v_pag := (r ->> 'id')::uuid;
  if (select ficha_id from followcamp.pagamentos where id = v_pag) is distinct from v_a then
    falhas := falhas || ('o aviso pelo link nao caiu na ficha: ' || r::text); end if;
  if (select campista from followcamp.pagamentos where id = v_pag) is distinct from (select campista from followcamp.fichas where id = v_a) then
    falhas := falhas || 'o aviso pelo link ficou com o nome digitado'::text; end if;
  if (public.fc27_pagamento_informar(jsonb_build_object('codigo', 'FC27CATRZEBB', 'meio', 'pixdireto',
        'campista', 'X', 'referente', 'parcela', 'valor', 50, 'ficha_token', '0123456789abcdef01234567')) ->> 'erro')
     is distinct from 'LINK_INVALIDO' then
    falhas := falhas || 'aviso com link falso passou'::text; end if;

  -- o comprovante
  r := public.fc27_comprovante_gravar(jsonb_build_object('ficha_token', v_tok_a, 'codigo', 'FC27CATRZEAA',
        'meio', 'pixdireto', 'referente', 'parcela', 'valor', 232.33, 'dados', v_jpg));
  if (r ->> 'ok') is distinct from 'true' or (r ->> 'id')::uuid is distinct from v_pag then
    falhas := falhas || ('o comprovante do aviso nao gravou: ' || r::text); end if;
  if (select tipo from followcamp.comprovantes where pagamento_id = v_pag limit 1) is distinct from 'image/jpeg' then
    falhas := falhas || 'o tipo do comprovante nao saiu dos bytes'::text; end if;
  if (public.fc27_comprovante_gravar(jsonb_build_object('ficha_token', v_tok_a, 'codigo', 'FC27CATRZEAA',
        'meio', 'pixdireto', 'referente', 'parcela', 'valor', 232.33, 'dados', v_txt)) ->> 'erro') is distinct from 'TIPO_INVALIDO' then
    falhas := falhas || 'arquivo que nao e foto nem PDF passou'::text; end if;
  if (public.fc27_comprovante_gravar(jsonb_build_object('ficha_token', v_tok_a, 'codigo', 'FC27CATRZEAA',
        'meio', 'pixdireto', 'referente', 'parcela', 'valor', 232.33, 'dados', '%%%nao-base64%%%')) ->> 'erro') is distinct from 'ARQUIVO_INVALIDO' then
    falhas := falhas || 'arquivo quebrado passou'::text; end if;
  if (public.fc27_comprovante_gravar(jsonb_build_object('ficha_token', v_tok_b, 'codigo', 'FC27CATRZEAA',
        'meio', 'pixdireto', 'referente', 'parcela', 'valor', 232.33, 'dados', v_jpg)) ->> 'erro') is distinct from 'CODIGO_DE_OUTRA_FICHA' then
    falhas := falhas || 'o comprovante entrou no pagamento de outra ficha'::text; end if;
  /* comprovante sem aviso antes: cria o aviso na ficha do link */
  r := public.fc27_comprovante_gravar(jsonb_build_object('ficha_token', v_tok_b, 'codigo', 'FC27CATRZECC',
        'meio', 'cartaoLink', 'referente', 'inscricao', 'valor', 697, 'titular', 'Pai Conf', 'dados', v_jpg));
  if (r ->> 'ok') is distinct from 'true'
     or (select ficha_id::text || ':' || forma || ':' || conferido::text from followcamp.pagamentos where codigo = 'FC27CATRZECC')
        is distinct from v_b::text || ':link_stone:false' then
    falhas := falhas || ('o comprovante sem aviso nao criou o aviso certo: ' || r::text); end if;
  perform public.fc27_comprovante_gravar(jsonb_build_object('ficha_token', v_tok_b, 'codigo', 'FC27CATRZECC', 'meio', 'cartaoLink', 'referente', 'inscricao', 'valor', 697, 'dados', v_jpg));
  perform public.fc27_comprovante_gravar(jsonb_build_object('ficha_token', v_tok_b, 'codigo', 'FC27CATRZECC', 'meio', 'cartaoLink', 'referente', 'inscricao', 'valor', 697, 'dados', v_jpg));
  if (public.fc27_comprovante_gravar(jsonb_build_object('ficha_token', v_tok_b, 'codigo', 'FC27CATRZECC',
        'meio', 'cartaoLink', 'referente', 'inscricao', 'valor', 697, 'dados', v_jpg)) ->> 'erro') is distinct from 'LIMITE' then
    falhas := falhas || 'passou do limite de 3 comprovantes'::text; end if;

  -- a administracao ve
  r := public.fc27_painel(v_tok);
  if not exists (select 1 from jsonb_array_elements(r -> 'fichas') x
                  where x ->> 'id' = v_a::text and x ->> 'token' = v_tok_a and x ->> 'parcelas' = '2') then
    falhas := falhas || 'o painel nao trouxe o link e o plano'::text; end if;
  if not exists (select 1 from jsonb_array_elements(r -> 'pagamentos') x
                  where x ->> 'codigo' = 'FC27CATRZEAA' and x ->> 'comprovantes' = '1') then
    falhas := falhas || 'o painel nao contou o comprovante'::text; end if;
  r := public.fc27_comprovante_ver(v_tok, v_pag);
  if jsonb_array_length(coalesce(r -> 'comprovantes', '[]'::jsonb)) <> 1
     or decode(r -> 'comprovantes' -> 0 ->> 'dados', 'base64') <> decode(v_jpg, 'base64') then
    falhas := falhas || ('a administracao nao viu o comprovante: ' || left(r::text, 200)); end if;
  if (public.fc27_comprovante_ver('CONF114SOL', v_pag) ->> 'erro') is distinct from 'SO_ADMIN'
     or (public.fc27_comprovante_ver('CONF114-NINGUEM', v_pag) ->> 'erro') is distinct from 'SEM_ACESSO' then
    falhas := falhas || 'o comprovante abriu para quem nao e a administracao'::text; end if;

  -- ficha cancelada: o link para de servir
  perform public.fc27_ficha_cancelar(v_tok, v_b, true, 'teste');
  if (public.fc27_minha(v_tok_b) ->> 'erro') is distinct from 'CANCELADA' then
    falhas := falhas || 'o link de ficha cancelada continuou abrindo'::text; end if;

  -- a porta
  if has_function_privilege('anon', 'public.fc27_minha(text)', 'execute')
     or has_function_privilege('anon', 'public.fc27_plano_escolher(text,integer)', 'execute')
     or has_function_privilege('anon', 'public.fc27_comprovante_gravar(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.fc27_comprovante_gravar(jsonb)', 'execute') then
    falhas := falhas || 'a internet alcanca uma funcao que e so do servidor'::text; end if;
  if not has_function_privilege('service_role', 'public.fc27_minha(text)', 'execute')
     or not has_function_privilege('service_role', 'public.fc27_comprovante_gravar(jsonb)', 'execute') then
    falhas := falhas || 'o servidor nao alcanca as funcoes do link'::text; end if;
  if has_table_privilege('anon', 'followcamp.comprovantes', 'select') then
    falhas := falhas || 'anon le comprovantes'::text; end if;

  -- limpeza (por id e por codigo, nunca por data)
  perform set_config('request.jwt.claims', '', true);
  perform set_config('demandas.membro', '', true);
  delete from followcamp.pagamentos where codigo in ('FC27CATRZEAA', 'FC27CATRZEBB', 'FC27CATRZECC');
  delete from followcamp.fichas where id in (v_a, v_b);
  delete from demandas.membros where nome like 'CONF114%' and (not v_criei or id <> v_adm.id);
  if v_criei then delete from demandas.membros where id = v_adm.id; end if;
  delete from demandas.setores where nome = 'CONF114 Setor';
  if not v_criei and (select md5(x::text) from demandas.membros x where x.id = v_adm.id) is distinct from v_md5 then
    falhas := falhas || 'limpeza: a linha da administracao de verdade mudou'::text; end if;
  select count(*) into n from followcamp.fichas where followcamp.chave_nome(campista) like '%conf%cento catorze%';
  if n > 0 then falhas := falhas || 'o cenario de teste ficou no banco'::text; end if;
  if exists (select 1 from followcamp.comprovantes c left join followcamp.pagamentos g on g.id = c.pagamento_id where g.id is null) then
    falhas := falhas || 'comprovante sem pagamento ficou no banco'::text; end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'114 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 114 · conferencia do link pessoal, do plano e do comprovante. Cenario desfeito.';
end $conf$;

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (114, '114 · a ficha repetida atualiza a que existe', 'fc27_ficha_gravar', 'v_repetida := true'),
      (114, '114 · o aviso pelo link acha a ficha pelo token', 'fc27_pagamento_informar', 'f.token = p ->> ''ficha_token'''),
      (114, '114 · o tipo do comprovante sai dos bytes', 'fc27_comprovante_gravar', '\x255044462d'),
      (114, '114 · o comprovante e so da administracao', 'fc27_comprovante_ver', 'so_admin')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (114, '114-o-carne-tem-plano-e-o-pagamento-tem-dono.sql')
  on conflict (n) do nothing;

commit;

/* o que o editor mostra: só números */
select '114' as versao,
       (select count(*) from followcamp.fichas where cancelada_em is null) as fichas_vivas,
       (select count(*) from followcamp.fichas where token is null) as fichas_sem_link,
       (select count(*) from followcamp.comprovantes) as comprovantes,
       (select count(*) from testar_porta_publica() where not passou) as porta_reprovada,
       (select count(*) from schema_versao_conferir() where not passou) as sondas_reprovadas;
