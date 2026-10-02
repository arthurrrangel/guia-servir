/* =============================================================================
   106 · CHAMAR QUEM PODE COBRIR A VAGA

   02/10/2026. Só de Escalas. Fase 4 do estudo do ServoApp
   (claude/estudo-servoapp-01-10-2026.md): "substituição em cascata", que a
   categoria tem e o GUIA Servir não tinha. O Arthur: "quero ter tudo ... e
   ser melhor ainda", "sem apagar nada do que já existe".

   A DOR, MEDIDA EM PRODUÇÃO (01/10): o Louvor tinha 3 de 10 postos em 25/10
   e 31/10, o Kids 0 de 9 em todo domingo de outubro, a Mídia 4 postos novos
   vazios em cada Follow. Até aqui, preencher era trabalho do líder no
   privado: perguntar a um, esperar, perguntar a outro.

   O QUE MUDA (só acrescenta; ninguém é chamado sem um líder tocar no botão)
     1 · `chamadas`: o convite para UMA pessoa cobrir UMA vaga. Fechada para
         fora (RLS e nenhum grant); só as funções abaixo mexem.
     2 · `chamar_candidatos()`: quem pode cobrir, com as regras do sorteio e
         da troca (103, `troca_impede`): ativo, da área, sabe a função
         (titular ou reserva), o sexo do posto, não avisou que não pode e não
         está em posto nenhum no dia. Primeiro quem disse que pode, depois
         quem serviu menos no mês. Só o líder do ministério vê.
     3 · `chamar_para_cobrir()`: o líder chama quem escolheu (até 10 por vez).
         A vaga tem de estar aberta: sem ninguém, ou com quem disse que não
         pode (ou furou). Tetos: 10 chamados abertos por vaga, 80 por dia.
     4 · `eu_chamadas()` e `eu_chamada_responder()`: a pessoa vê o convite no
         próprio link e responde. ACEITAR confere tudo de novo com a vaga
         travada (ou, sem linha para travar, deixa a unicidade de
         `escalacoes` decidir): o primeiro que aceita fica com a vaga,
         CONFIRMADA; os outros chamados da vaga fecham como "preenchida" e os
         outros convites de quem aceitou, no mesmo dia, como "expirada".
     5 · `chamadas_do_dia()` e `cancelar_chamadas()`: o líder acompanha e para.
     6 · `aviso_da_chamada()`: o aviso no celular de quem foi chamado (104),
         uma vez por chamado. Só o servidor chama.

   PORTA PÚBLICA: duas funções novas por token, no inventário da 77.

   SEM `create temp table` (101). O EDITOR DO SUPABASE NÃO MOSTRA NOTICE: a
   última linha é um select com o resultado.

   ORDEM:  ... 104 → 105 → 106
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(106);
  end if;
  /* a 106 usa a regra da troca (103) e o aviso no celular (104), e vem
     depois da 105: rodada antes, a régua pularia e recusaria as outras */
  if to_regclass('public.schema_versao') is not null
     and not exists (select 1 from public.schema_versao where n = 105) then
    raise exception 'FALTA A 105: rode antes a 103, a 104 e a 105. Nada foi mudado.';
  end if;
end $tranca$;

begin;

-- =========================================================================
-- 1 · a tabela
-- =========================================================================
create table if not exists public.chamadas (
  id             uuid primary key default gen_random_uuid(),
  culto_id       uuid not null references public.cultos(id) on delete cascade,
  funcao_id      uuid not null references public.funcoes(id) on delete cascade,
  voluntario_id  uuid not null references public.voluntarios(id) on delete cascade,
  status         text not null default 'aberta'
                 check (status in ('aberta', 'aceita', 'recusada', 'preenchida', 'cancelada', 'expirada')),
  criado_em      timestamptz not null default clock_timestamp(),
  respondido_em  timestamptz,
  avisado_em     timestamptz
);
create unique index if not exists ux_chamadas_aberta
  on public.chamadas (culto_id, funcao_id, voluntario_id) where status = 'aberta';
create index if not exists ix_chamadas_pessoa on public.chamadas (voluntario_id, status);
create index if not exists ix_chamadas_vaga on public.chamadas (culto_id, funcao_id);
alter table public.chamadas enable row level security;
revoke all on table public.chamadas from public, anon, authenticated;
comment on table public.chamadas is
  '106: convite para uma pessoa cobrir uma vaga aberta. So as funcoes chamar_*, eu_chamada* e cancelar_chamadas mexem.';

-- =========================================================================
-- 2 · as duas perguntas que tudo abaixo faz
-- =========================================================================
/* o posto vale NAQUELE culto: evento leva todos os postos ativos do dono;
   culto da programação, os postos daquele tipo (funcoesDoDia, no motor) */
create or replace function public.posto_vale_no_culto(p_culto uuid, p_funcao uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select coalesce((
    select f.ativa and case
             when c.evento is not null then c.equipe_id = f.equipe_id
             else f.tipos is null or cardinality(f.tipos) = 0 or c.tipo = any(f.tipos)
           end
      from cultos c, funcoes f
     where c.id = p_culto and f.id = p_funcao), false);
$fn$;
revoke all on function public.posto_vale_no_culto(uuid, uuid) from public, anon, authenticated;

/* a vaga está aberta: sem ninguém, ou com quem disse que não pode ou furou */
create or replace function public.vaga_aberta(p_culto uuid, p_funcao uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select not exists (
    select 1 from escalacoes e
     where e.culto_id = p_culto and e.funcao_id = p_funcao
       and e.voluntario_id is not null and e.status not in ('recusado', 'furou'));
$fn$;
revoke all on function public.vaga_aberta(uuid, uuid) from public, anon, authenticated;

-- =========================================================================
-- 3 · quem pode cobrir (o líder vê)
-- =========================================================================
create or replace function public.chamar_candidatos(p_culto uuid, p_funcao uuid)
returns table(voluntario_id uuid, nome text, nivel text, disse_que_pode boolean,
              no_mes int, limite int, chamada text)
language plpgsql stable security definer set search_path = public as $fn$
declare v_eq uuid; v_data date; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select f.equipe_id into v_eq from funcoes f where f.id = p_funcao;
  if v_eq is null or not public.lidera_equipe(v_eq) then return; end if;
  select c.data into v_data from cultos c where c.id = p_culto;
  if v_data is null or v_data < v_hoje or not posto_vale_no_culto(p_culto, p_funcao) then return; end if;

  return query
  select o.id, o.nome, h.nivel::text,
         exists (select 1 from disponibilidade d
                  where d.voluntario_id = o.id and d.data = v_data and d.pode),
         (select count(*)::int from escalacoes e join cultos c2 on c2.id = e.culto_id
           where e.voluntario_id = o.id and e.status in ('pendente', 'confirmado')
             and date_trunc('month', c2.data) = date_trunc('month', v_data)),
         o.limite_mes,
         (select ch.status from chamadas ch
           where ch.culto_id = p_culto and ch.funcao_id = p_funcao and ch.voluntario_id = o.id
           order by ch.criado_em desc limit 1)
    from voluntarios o
    join habilidades h on h.voluntario_id = o.id and h.funcao_id = p_funcao
   where o.equipe_id = v_eq
     and troca_impede(o.id, p_culto, p_funcao) is null
   order by 4 desc, 5 asc, (h.nivel = 'titular') desc, o.nome
   limit 60;
end $fn$;
revoke all on function public.chamar_candidatos(uuid, uuid) from public, anon;
grant execute on function public.chamar_candidatos(uuid, uuid) to authenticated;

-- =========================================================================
-- 4 · chamar
-- =========================================================================
create or replace function public.chamar_para_cobrir(p_culto uuid, p_funcao uuid, p_voluntarios uuid[])
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_eq uuid; v_data date; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
        v_abertas int; v_dia int; v_id uuid; v_ids uuid[] := '{}'; v_novo uuid; v_recusados jsonb := '[]';
        v_motivo text;
begin
  select f.equipe_id into v_eq from funcoes f where f.id = p_funcao;
  if v_eq is null or not public.lidera_equipe(v_eq) then
    return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO');
  end if;
  select c.data into v_data from cultos c where c.id = p_culto;
  if v_data is null then return jsonb_build_object('ok', false, 'erro', 'CULTO_INEXISTENTE'); end if;
  if v_data < v_hoje then return jsonb_build_object('ok', false, 'erro', 'JA_PASSOU'); end if;
  if not posto_vale_no_culto(p_culto, p_funcao) then
    return jsonb_build_object('ok', false, 'erro', 'POSTO_NAO_VALE');
  end if;
  if not vaga_aberta(p_culto, p_funcao) then
    return jsonb_build_object('ok', false, 'erro', 'VAGA_OCUPADA');
  end if;
  if p_voluntarios is null or cardinality(p_voluntarios) = 0 then
    return jsonb_build_object('ok', false, 'erro', 'NINGUEM');
  end if;
  if cardinality(p_voluntarios) > 10 then
    return jsonb_build_object('ok', false, 'erro', 'MUITOS');
  end if;

  /* tetos: 10 abertos por vaga, 80 chamados por dia no ministério */
  select count(*) into v_abertas from chamadas
   where culto_id = p_culto and funcao_id = p_funcao and status = 'aberta';
  select count(*) into v_dia from chamadas ch join funcoes f on f.id = ch.funcao_id
   where f.equipe_id = v_eq and ch.criado_em >= now() - interval '1 day';
  if v_dia + cardinality(p_voluntarios) > 80 then
    return jsonb_build_object('ok', false, 'erro', 'MUITOS_HOJE');
  end if;

  foreach v_id in array (select array_agg(distinct x) from unnest(p_voluntarios) x where x is not null) loop
    v_motivo := troca_impede(v_id, p_culto, p_funcao);
    if v_motivo is null and not exists (select 1 from habilidades h
                                         where h.voluntario_id = v_id and h.funcao_id = p_funcao
                                           and h.nivel in ('titular', 'reserva')) then
      v_motivo := 'NAO_FAZ';
    end if;
    if v_motivo is not null then
      v_recusados := v_recusados || jsonb_build_object('voluntario_id', v_id, 'motivo', v_motivo);
      continue;
    end if;
    if v_abertas >= 10 then
      v_recusados := v_recusados || jsonb_build_object('voluntario_id', v_id, 'motivo', 'MUITOS_NA_VAGA');
      continue;
    end if;
    v_novo := null;
    insert into chamadas (culto_id, funcao_id, voluntario_id)
         values (p_culto, p_funcao, v_id)
    on conflict (culto_id, funcao_id, voluntario_id) where status = 'aberta' do nothing
    returning id into v_novo;
    if v_novo is not null then
      v_ids := v_ids || v_novo; v_abertas := v_abertas + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'chamadas', to_jsonb(v_ids), 'recusados', v_recusados);
end $fn$;
revoke all on function public.chamar_para_cobrir(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.chamar_para_cobrir(uuid, uuid, uuid[]) to authenticated;

-- =========================================================================
-- 5 · o líder acompanha e para
-- =========================================================================
create or replace function public.chamadas_do_dia(p_equipe uuid, p_data date)
returns table(id uuid, culto_id uuid, funcao_id uuid, voluntario_id uuid, nome text,
              status text, criado_em timestamptz, respondido_em timestamptz)
language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.lidera_equipe(p_equipe) then return; end if;
  return query
  select ch.id, ch.culto_id, ch.funcao_id, ch.voluntario_id, v.nome, ch.status, ch.criado_em, ch.respondido_em
    from chamadas ch
    join cultos c on c.id = ch.culto_id
    join funcoes f on f.id = ch.funcao_id
    join voluntarios v on v.id = ch.voluntario_id
   where f.equipe_id = p_equipe and c.data = p_data
   order by ch.criado_em, v.nome;
end $fn$;
revoke all on function public.chamadas_do_dia(uuid, date) from public, anon;
grant execute on function public.chamadas_do_dia(uuid, date) to authenticated;

create or replace function public.cancelar_chamadas(p_culto uuid, p_funcao uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_eq uuid; v_n int;
begin
  select f.equipe_id into v_eq from funcoes f where f.id = p_funcao;
  if v_eq is null or not public.lidera_equipe(v_eq) then
    return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO');
  end if;
  update chamadas set status = 'cancelada', respondido_em = now()
   where culto_id = p_culto and funcao_id = p_funcao and status = 'aberta';
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'canceladas', v_n);
end $fn$;
revoke all on function public.cancelar_chamadas(uuid, uuid) from public, anon;
grant execute on function public.cancelar_chamadas(uuid, uuid) to authenticated;

-- =========================================================================
-- 6 · a pessoa vê e responde, pelo próprio link
-- =========================================================================
create or replace function public.eu_chamadas(p_token text)
returns table(id uuid, culto_id uuid, funcao_id uuid, funcao text, data date, evento text,
              inicio time, status text, aberta boolean, impede text, criado_em timestamptz)
language plpgsql stable security definer set search_path = public as $fn$
declare v_id uuid; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select v.id into v_id from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  return query
  select ch.id, ch.culto_id, ch.funcao_id, f.nome, c.data, c.evento, c.inicio, ch.status,
         /* ainda dá para aceitar: a vaga continua aberta e o posto vale */
         (ch.status = 'aberta' and vaga_aberta(ch.culto_id, ch.funcao_id)
          and posto_vale_no_culto(ch.culto_id, ch.funcao_id)),
         case when ch.status = 'aberta' then troca_impede(v_id, ch.culto_id, ch.funcao_id) end,
         ch.criado_em
    from chamadas ch
    join cultos c on c.id = ch.culto_id
    join funcoes f on f.id = ch.funcao_id
   where ch.voluntario_id = v_id and c.data >= v_hoje
     and (ch.status = 'aberta' or ch.respondido_em >= now() - interval '3 days')
   order by c.data, c.inicio nulls first, f.ordem, f.nome;
end $fn$;
revoke all on function public.eu_chamadas(text) from public;
grant execute on function public.eu_chamadas(text) to anon, authenticated;

create or replace function public.eu_chamada_responder(p_token text, p_chamada uuid, p_aceita boolean)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; ch chamadas%rowtype; v_data date; v_motivo text; v_n int; v_linha boolean;
        v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select v.id into v_id from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  /* sem trava aqui: só para achar a vaga (a ordem das travas está abaixo) */
  select * into ch from chamadas where id = p_chamada;
  if not found or ch.voluntario_id <> v_id then
    return jsonb_build_object('ok', false, 'erro', 'NAO_E_SUA');
  end if;

  if not coalesce(p_aceita, false) then
    update chamadas set status = 'recusada', respondido_em = now()
     where id = ch.id and status = 'aberta';
    get diagnostics v_n = row_count;
    if v_n = 0 then return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_ABERTA'); end if;
    return jsonb_build_object('ok', true, 'status', 'recusada');
  end if;

  /* A ORDEM DAS TRAVAS, a mesma da troca (103): primeiro a vaga, depois o
     convite. Sem linha da vaga para travar (posto que nunca teve ninguém),
     quem decide entre dois aceites ao mesmo tempo é a unicidade de
     `escalacoes (culto_id, funcao_id)`, mais abaixo. */
  perform 1 from escalacoes e
   where e.culto_id = ch.culto_id and e.funcao_id = ch.funcao_id for update;
  v_linha := found;
  select * into ch from chamadas where id = p_chamada for update;
  if ch.status <> 'aberta' then
    return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_ABERTA', 'status', ch.status);
  end if;

  select c.data into v_data from cultos c where c.id = ch.culto_id;
  if v_data is null or v_data < v_hoje then
    update chamadas set status = 'expirada', respondido_em = now() where id = ch.id;
    return jsonb_build_object('ok', false, 'erro', 'JA_PASSOU');
  end if;
  if not vaga_aberta(ch.culto_id, ch.funcao_id) then
    update chamadas set status = 'preenchida', respondido_em = now() where id = ch.id;
    return jsonb_build_object('ok', false, 'erro', 'PREENCHIDA');
  end if;
  if not posto_vale_no_culto(ch.culto_id, ch.funcao_id) then
    update chamadas set status = 'expirada', respondido_em = now() where id = ch.id;
    return jsonb_build_object('ok', false, 'erro', 'MUDOU');
  end if;

  v_motivo := troca_impede(v_id, ch.culto_id, ch.funcao_id);
  if v_motivo is not null then
    return jsonb_build_object('ok', false, 'erro', 'NAO_PODE', 'motivo', v_motivo);
  end if;

  /* o conflito de posto simultâneo (45) é deferido; aqui ele confere na hora,
     para o erro voltar como resposta e não como falha no commit */
  set constraints tg_conflito immediate;
  begin
    if v_linha then
      update escalacoes
         set voluntario_id = v_id, status = 'confirmado', respondido_em = now(), primeira_vez = false
       where culto_id = ch.culto_id and funcao_id = ch.funcao_id
         and (voluntario_id is null or status in ('recusado', 'furou'));
      get diagnostics v_n = row_count;
    else
      insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez, respondido_em)
           values (ch.culto_id, ch.funcao_id, v_id, 'confirmado', false, false, now());
      v_n := 1;
    end if;
  exception
    when unique_violation then
      set constraints tg_conflito deferred;
      update chamadas set status = 'preenchida', respondido_em = now() where id = ch.id;
      return jsonb_build_object('ok', false, 'erro', 'PREENCHIDA');
    when others then
      set constraints tg_conflito deferred;
      return jsonb_build_object('ok', false, 'erro', 'NAO_PODE', 'motivo', 'REGRA', 'detalhe', sqlerrm);
  end;
  set constraints tg_conflito deferred;
  if v_n <> 1 then
    update chamadas set status = 'preenchida', respondido_em = now() where id = ch.id;
    return jsonb_build_object('ok', false, 'erro', 'PREENCHIDA');
  end if;

  update chamadas set status = 'aceita', respondido_em = now() where id = ch.id;
  /* os outros chamados da mesma vaga perdem o objeto */
  update chamadas set status = 'preenchida', respondido_em = now()
   where culto_id = ch.culto_id and funcao_id = ch.funcao_id and status = 'aberta' and id <> ch.id;
  /* e quem aceitou passou a servir nesse dia: os outros convites e pedidos de
     troca para ela, no mesmo dia, já não têm como ser aceitos */
  update chamadas c3 set status = 'expirada', respondido_em = now()
    from cultos c2
   where c2.id = c3.culto_id and c2.data = v_data
     and c3.voluntario_id = v_id and c3.status = 'aberta' and c3.id <> ch.id;
  update trocas t2 set status = 'expirada', respondido_em = now()
    from cultos c2
   where c2.id = t2.culto_id and c2.data = v_data
     and t2.para_voluntario = v_id and t2.status = 'aberta';

  /* aceitar é dizer que pode no dia; só preenche, nunca sobrescreve */
  if not exists (select 1 from disponibilidade d where d.voluntario_id = v_id and d.data = v_data) then
    perform eu_marcar_dia(v_id, v_data, true);
  end if;

  return jsonb_build_object('ok', true, 'status', 'aceita');
end $fn$;
revoke all on function public.eu_chamada_responder(text, uuid, boolean) from public;
grant execute on function public.eu_chamada_responder(text, uuid, boolean) to anon, authenticated;

-- =========================================================================
-- 7 · o aviso no celular de quem foi chamado (104), uma vez por chamado
-- =========================================================================
create or replace function public.aviso_da_chamada(p_chamada uuid)
returns table(endpoint text, p256dh text, auth text, token text, funcao text,
              data date, evento text, inicio time)
language plpgsql security definer set search_path = public as $fn$
declare ch chamadas%rowtype;
begin
  update chamadas x set avisado_em = now()
   where x.id = p_chamada and x.status = 'aberta' and x.avisado_em is null
  returning x.* into ch;
  if not found then return; end if;
  return query
  select a.endpoint, a.p256dh, a.auth, d.token, f.nome, c.data, c.evento, c.inicio
    from avisos_celular a
    join voluntarios d on d.id = a.voluntario_id and d.ativo
    join cultos c on c.id = ch.culto_id
    join funcoes f on f.id = ch.funcao_id
   where a.voluntario_id = ch.voluntario_id;
end $fn$;
revoke all on function public.aviso_da_chamada(uuid) from public, anon, authenticated;
grant execute on function public.aviso_da_chamada(uuid) to service_role;

-- =========================================================================
-- 8 · inventário da porta pública (77)
-- =========================================================================
do $porta$ begin
  if to_regclass('public.porta_publica') is null then
    raise notice 'PULEI o inventario: este banco nao tem porta_publica (falta a 77).';
    return;
  end if;
  insert into public.porta_publica (funcao, motivo, n) values
    ('eu_chamadas(p_token text)',
     'os convites para cobrir vaga que a pessoa recebeu da lideranca: os abertos e os respondidos nos ultimos tres dias (106).', 106),
    ('eu_chamada_responder(p_token text, p_chamada uuid, p_aceita boolean)',
     'a pessoa aceita ou recusa o convite pelo proprio link. Aceitar confere de novo a vaga, o dia e as regras do sorteio antes de dar a vaga (106).', 106)
  on conflict (funcao) do update set motivo = excluded.motivo, n = excluded.n;
end $porta$;

-- =========================================================================
-- 9 · conferência
-- =========================================================================
do $conf$
declare
  falhas text[] := '{}';
  r record; v_n int; v_txt text;
  m jsonb := '{}'::jsonb;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dia date;
  v_eq uuid; v_eq2 uuid;
  v_voz uuid; v_baixo uuid; v_teclado uuid; v_fora uuid; v_inativa uuid;
  v_ana uuid; v_bia uuid; v_caio uuid; v_duda uuid; v_eva uuid; v_fabi uuid; v_gil uuid; v_hugo uuid;
  t_ana text; t_bia text; t_caio text; t_duda text; t_eva text; t_fabi text; t_gil text; t_hugo text;
  v_culto uuid; v_passado uuid; v_evento uuid;
  v_j jsonb; v_c1 uuid; v_c2 uuid; v_c3 uuid; v_c4 uuid; v_cp uuid;
begin
  /* 1 · estrutura */
  if not exists (select 1 from pg_class where oid = 'public.chamadas'::regclass and relrowsecurity) then
    falhas := falhas || 'chamadas sem RLS'::text; end if;
  if has_table_privilege('anon', 'public.chamadas', 'select')
     or has_table_privilege('authenticated', 'public.chamadas', 'select')
     or has_table_privilege('authenticated', 'public.chamadas', 'insert')
     or has_table_privilege('anon', 'public.chamadas', 'update') then
    falhas := falhas || 'chamadas com grant para anon ou authenticated'::text; end if;
  for r in select * from (values ('eu_chamadas(text)'), ('eu_chamada_responder(text,uuid,boolean)')) as x(f) loop
    if not has_function_privilege('anon', 'public.' || r.f, 'execute') then
      falhas := falhas || format('%s sem grant para anon', r.f); end if;
  end loop;
  for r in select * from (values ('chamar_candidatos(uuid,uuid)'), ('chamar_para_cobrir(uuid,uuid,uuid[])'),
                                 ('chamadas_do_dia(uuid,date)'), ('cancelar_chamadas(uuid,uuid)'),
                                 ('aviso_da_chamada(uuid)'), ('posto_vale_no_culto(uuid,uuid)'), ('vaga_aberta(uuid,uuid)')) as x(f) loop
    if has_function_privilege('anon', 'public.' || r.f, 'execute') then
      falhas := falhas || format('%s alcancavel por anon', r.f); end if;
  end loop;
  for r in select * from (values ('aviso_da_chamada(uuid)'), ('posto_vale_no_culto(uuid,uuid)'), ('vaga_aberta(uuid,uuid)')) as x(f) loop
    if has_function_privilege('authenticated', 'public.' || r.f, 'execute') then
      falhas := falhas || format('%s alcancavel por authenticated', r.f); end if;
  end loop;
  if to_regprocedure('public.testar_porta_publica()') is not null then
    select count(*), string_agg(t.caso || ' (' || t.obtido || ')', '; ') into v_n, v_txt
      from public.testar_porta_publica() t where not t.passou;
    if v_n > 0 then falhas := falhas || format('porta publica reprovou: %s', v_txt); end if;
  end if;

  /* 2 · o caminho inteiro, em dois ministérios de teste (desfeito no fim) */
  begin
    v_dia := v_hoje + 8;
    while extract(dow from v_dia) <> 0 loop v_dia := v_dia + 1; end loop;
    insert into equipes (nome, slug, ordem) values ('CONF106 Louvor', 'conf106-louvor', 994) returning id into v_eq;
    insert into equipes (nome, slug, ordem) values ('CONF106 Outra', 'conf106-outra', 995) returning id into v_eq2;
    insert into lideres (email, equipe_id) values ('conf106-lider@exemplo.invalid', v_eq);
    insert into lideres (email, equipe_id) values ('conf106-outra@exemplo.invalid', v_eq2);
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq, 'CONF106 VOZ', 1, true, true, array['domingo','follow']) returning id into v_voz;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq, 'CONF106 BAIXO', 2, true, true, array['domingo','follow']) returning id into v_baixo;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq, 'CONF106 TECLADO', 3, true, true, array['follow']) returning id into v_teclado;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq, 'CONF106 PARADA', 4, false, true, array['domingo','follow']) returning id into v_inativa;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq2, 'CONF106 DE FORA', 1, true, true, array['domingo','follow']) returning id into v_fora;

    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Ana Conf Cento Seis', '21900106001', true, 'F') returning id, token into v_ana, t_ana;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Bia Conf Cento Seis', '21900106002', true, 'F') returning id, token into v_bia, t_bia;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Caio Conf Cento Seis', '21900106003', true, 'M') returning id, token into v_caio, t_caio;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Duda Conf Cento Seis', '21900106004', true, 'F') returning id, token into v_duda, t_duda;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Eva Conf Cento Seis', '21900106005', true, 'F') returning id, token into v_eva, t_eva;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Fabi Conf Cento Seis', '21900106006', false, 'F') returning id, token into v_fabi, t_fabi;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq2, 'Gil Conf Cento Seis', '21900106007', true, 'M') returning id, token into v_gil, t_gil;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Hugo Conf Cento Seis', '21900106008', true, 'M') returning id, token into v_hugo, t_hugo;

    /* Ana sabe VOZ e está no BAIXO no dia (ocupada); Bia sabe VOZ e disse que
       pode; Caio sabe VOZ, não respondeu, e já serviu uma vez no mês;
       Duda sabe VOZ e avisou que não pode; Eva só aprende VOZ; Fabi está
       inativa; Gil é de outra área; Hugo sabe VOZ, não respondeu, zero no mês */
    insert into habilidades (voluntario_id, funcao_id, nivel) values
      (v_ana, v_voz, 'titular'), (v_ana, v_baixo, 'titular'),
      (v_bia, v_voz, 'reserva'), (v_caio, v_voz, 'titular'), (v_duda, v_voz, 'titular'),
      (v_eva, v_voz, 'treino'), (v_fabi, v_voz, 'titular'), (v_gil, v_fora, 'titular'),
      (v_hugo, v_voz, 'titular'), (v_hugo, v_teclado, 'titular');

    select id into v_culto from cultos where data = v_dia and evento is null;
    if v_culto is null then insert into cultos (data) values (v_dia) returning id into v_culto; end if;
    insert into cultos (data, evento, equipe_id) values (v_hoje - 3, 'CONF106 passado', v_eq) returning id into v_passado;
    insert into cultos (data, evento, equipe_id, inicio) values (v_dia - 2, 'CONF106 evento', v_eq, time '19:30') returning id into v_evento;
    insert into indisponibilidades (voluntario_id, data) values (v_duda, v_dia);
    insert into disponibilidade (voluntario_id, data, pode) values (v_bia, v_dia, true);
    /* a VOZ do domingo: quem estava disse que não pode (a linha existe) */
    insert into escalacoes (culto_id, funcao_id, voluntario_id, status) values
      (v_culto, v_baixo, v_ana, 'confirmado'),
      (v_culto, v_voz, v_eva, 'recusado');
    /* Caio já serviu uma vez no mês do domingo (num evento do ministério, num
       dia do mesmo mês que não é o do domingo nem o do evento de teste) */
    insert into cultos (data, evento, equipe_id)
         values (case when extract(month from v_dia + 1) = extract(month from v_dia) then v_dia + 1 else v_dia - 1 end,
                 'CONF106 mes', v_eq) returning id into v_cp;
    insert into escalacoes (culto_id, funcao_id, voluntario_id, status) values (v_cp, v_voz, v_caio, 'confirmado');

    /* a pergunta do posto: VOZ vale no domingo; TECLADO não (só Follow);
       PARADA não; DE FORA vale no domingo, mas não no evento do Louvor */
    m := m || jsonb_build_object('vale',
           format('%s,%s,%s,%s,%s', posto_vale_no_culto(v_culto, v_voz), posto_vale_no_culto(v_culto, v_teclado),
                  posto_vale_no_culto(v_culto, v_inativa), posto_vale_no_culto(v_culto, v_fora),
                  posto_vale_no_culto(v_evento, v_fora)));
    m := m || jsonb_build_object('aberta',
           format('%s,%s', vaga_aberta(v_culto, v_voz), vaga_aberta(v_culto, v_baixo)));

    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf106-lider@exemplo.invalid","role":"authenticated"}', true);
    /* quem pode: Bia (disse que pode) primeiro, depois Hugo (zero no mês),
       depois Caio; Ana (ocupada), Duda (não pode), Eva (aprende), Fabi
       (inativa) e Gil (outra área) não */
    m := m || jsonb_build_object('candidatos',
           (select string_agg(split_part(nome, ' ', 1) || ':' || disse_que_pode || ':' || no_mes, ',')
              from chamar_candidatos(v_culto, v_voz)));
    m := m || jsonb_build_object('cand_passado', (select count(*) from chamar_candidatos(v_passado, v_voz)));
    m := m || jsonb_build_object('cand_nao_vale', (select count(*) from chamar_candidatos(v_culto, v_teclado)));

    /* chamar: quem não pode volta recusado, com o motivo; o resto vira convite */
    v_j := chamar_para_cobrir(v_culto, v_voz, array[v_bia, v_caio, v_hugo, v_duda, v_ana, v_gil]);
    m := m || jsonb_build_object('chamou', jsonb_array_length(v_j -> 'chamadas'));
    m := m || jsonb_build_object('chamou_recusados',
           (select string_agg(x ->> 'motivo', ',' order by x ->> 'motivo') from jsonb_array_elements(v_j -> 'recusados') x));
    v_j := chamar_para_cobrir(v_culto, v_voz, array[v_bia]);
    m := m || jsonb_build_object('chamou_de_novo', jsonb_array_length(v_j -> 'chamadas'));
    m := m || jsonb_build_object('ocupada', chamar_para_cobrir(v_culto, v_baixo, array[v_bia]) ->> 'erro');
    m := m || jsonb_build_object('passado', chamar_para_cobrir(v_passado, v_voz, array[v_bia]) ->> 'erro');
    m := m || jsonb_build_object('nao_vale', chamar_para_cobrir(v_culto, v_teclado, array[v_hugo]) ->> 'erro');
    m := m || jsonb_build_object('ninguem', chamar_para_cobrir(v_culto, v_voz, '{}') ->> 'erro');
    m := m || jsonb_build_object('muitos', chamar_para_cobrir(v_culto, v_voz,
           (select array_agg(gen_random_uuid()) from generate_series(1, 11))) ->> 'erro');
    m := m || jsonb_build_object('lider_ve', (select count(*) from chamadas_do_dia(v_eq, v_dia)));
    /* a líder de outro ministério não chama nem vê */
    perform set_config('request.jwt.claims', '{"email":"conf106-outra@exemplo.invalid","role":"authenticated"}', true);
    m := m || jsonb_build_object('alheia', chamar_para_cobrir(v_culto, v_voz, array[v_bia]) ->> 'erro');
    m := m || jsonb_build_object('alheia_ve', (select count(*) from chamadas_do_dia(v_eq, v_dia)));
    m := m || jsonb_build_object('alheia_cand', (select count(*) from chamar_candidatos(v_culto, v_voz)));
    m := m || jsonb_build_object('alheia_cancela', cancelar_chamadas(v_culto, v_voz) ->> 'erro');
    reset role;

    select id into v_c1 from chamadas where voluntario_id = v_bia and culto_id = v_culto and status = 'aberta';
    select id into v_c2 from chamadas where voluntario_id = v_caio and culto_id = v_culto and status = 'aberta';
    select id into v_c3 from chamadas where voluntario_id = v_hugo and culto_id = v_culto and status = 'aberta';

    /* a pessoa vê o convite, aberto */
    m := m || jsonb_build_object('bia_ve',
           (select string_agg(funcao || ':' || status || ':' || aberta, ',') from eu_chamadas(t_bia)));
    /* não é dela */
    m := m || jsonb_build_object('nao_e_sua', eu_chamada_responder(t_hugo, v_c1, true) ->> 'erro');
    /* o aviso no celular: a Bia tem um aparelho ligado; sai uma vez só */
    insert into avisos_celular (voluntario_id, endpoint, p256dh, auth)
         values (v_bia, 'https://fcm.googleapis.com/fcm/send/conf106-teste', repeat('B', 87), repeat('a', 22));
    m := m || jsonb_build_object('avisou', (select count(*) from aviso_da_chamada(v_c1)));
    m := m || jsonb_build_object('avisou_2x', (select count(*) from aviso_da_chamada(v_c1)));
    m := m || jsonb_build_object('aviso_alheio', (select count(*) from aviso_da_chamada(v_c2)));
    /* Caio recusa */
    m := m || jsonb_build_object('caio_recusa', eu_chamada_responder(t_caio, v_c2, false) ->> 'status');
    m := m || jsonb_build_object('caio_recusa_2x', eu_chamada_responder(t_caio, v_c2, false) ->> 'erro');
    /* Bia aceita: a vaga passa, confirmada; o convite do Hugo fecha */
    v_j := eu_chamada_responder(t_bia, v_c1, true);
    m := m || jsonb_build_object('bia_aceita', coalesce(v_j ->> 'status', v_j::text));
    m := m || jsonb_build_object('vaga',
           (select split_part(v.nome, ' ', 1) || ':' || e.status from escalacoes e join voluntarios v on v.id = e.voluntario_id
             where e.culto_id = v_culto and e.funcao_id = v_voz));
    m := m || jsonb_build_object('hugo_fechou', (select status from chamadas where id = v_c3));
    m := m || jsonb_build_object('hugo_aceita', eu_chamada_responder(t_hugo, v_c3, true) ->> 'erro');
    m := m || jsonb_build_object('bia_posso', (select pode::text from disponibilidade where voluntario_id = v_bia and data = v_dia));
    m := m || jsonb_build_object('hugo_ve', (select string_agg(status || ':' || aberta, ',') from eu_chamadas(t_hugo)));

    /* posto que nunca teve ninguém: a linha nasce no aceite */
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf106-lider@exemplo.invalid","role":"authenticated"}', true);
    v_j := chamar_para_cobrir(v_evento, v_voz, array[v_hugo, v_caio]);
    reset role;
    select id into v_c3 from chamadas where voluntario_id = v_hugo and culto_id = v_evento and status = 'aberta';
    select id into v_c4 from chamadas where voluntario_id = v_caio and culto_id = v_evento and status = 'aberta';
    m := m || jsonb_build_object('evento_chamou', jsonb_array_length(v_j -> 'chamadas'));
    v_j := eu_chamada_responder(t_hugo, v_c3, true);
    m := m || jsonb_build_object('evento_aceita', coalesce(v_j ->> 'status', v_j::text));
    m := m || jsonb_build_object('evento_linha',
           (select count(*) from escalacoes where culto_id = v_evento and funcao_id = v_voz and voluntario_id = v_hugo and status = 'confirmado'));
    m := m || jsonb_build_object('evento_caio', eu_chamada_responder(t_caio, v_c4, true) ->> 'erro');

    /* o líder para de chamar (a vaga volta a abrir: a Bia avisou que não pode) */
    update escalacoes set status = 'recusado' where culto_id = v_culto and funcao_id = v_voz;
    insert into chamadas (culto_id, funcao_id, voluntario_id) values (v_culto, v_voz, v_caio) returning id into v_c2;
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf106-lider@exemplo.invalid","role":"authenticated"}', true);
    m := m || jsonb_build_object('cancela', cancelar_chamadas(v_culto, v_voz) ->> 'canceladas');
    reset role;
    m := m || jsonb_build_object('cancelada_aceita', eu_chamada_responder(t_caio, v_c2, true) ->> 'erro');
    /* a vaga preenchida pelo líder: o convite que sobrou fecha como preenchida */
    insert into chamadas (culto_id, funcao_id, voluntario_id) values (v_culto, v_voz, v_caio) returning id into v_c2;
    update escalacoes set voluntario_id = v_hugo, status = 'pendente' where culto_id = v_culto and funcao_id = v_voz;
    m := m || jsonb_build_object('lider_preencheu', eu_chamada_responder(t_caio, v_c2, true) ->> 'erro');
    /* inativa e link falso */
    begin
      perform * from eu_chamadas(t_fabi);
      m := m || jsonb_build_object('inativa', 'viu');
    exception when others then m := m || jsonb_build_object('inativa', sqlerrm);
    end;
    begin
      perform eu_chamada_responder('nao-existe-' || md5(random()::text), v_c2, true);
      m := m || jsonb_build_object('token_falso', 'passou');
    exception when others then m := m || jsonb_build_object('token_falso', sqlerrm);
    end;

    raise exception 'CONF106_DESFAZ';
  exception when others then
    if sqlerrm <> 'CONF106_DESFAZ' then
      falhas := falhas || ('o cenario nao montou: ' || sqlerrm)::text;
    end if;
  end;
  reset role;

  for r in select * from (values
      ('vale',              't,f,f,t,f'),
      ('aberta',            't,f'),
      ('candidatos',        'Bia:true:0,Hugo:false:0,Caio:false:1'),
      ('cand_passado',      '0'),
      ('cand_nao_vale',     '0'),
      ('chamou',            '3'),
      ('chamou_recusados',  'INDISPONIVEL,JA_ESCALADO,OUTRA_AREA'),
      ('chamou_de_novo',    '0'),
      ('ocupada',           'VAGA_OCUPADA'),
      ('passado',           'JA_PASSOU'),
      ('nao_vale',          'POSTO_NAO_VALE'),
      ('ninguem',           'NINGUEM'),
      ('muitos',            'MUITOS'),
      ('lider_ve',          '3'),
      ('alheia',            'SEM_PERMISSAO'),
      ('alheia_ve',         '0'),
      ('alheia_cand',       '0'),
      ('alheia_cancela',    'SEM_PERMISSAO'),
      ('bia_ve',            'CONF106 VOZ:aberta:true'),
      ('nao_e_sua',         'NAO_E_SUA'),
      ('avisou',            '1'),
      ('avisou_2x',         '0'),
      ('aviso_alheio',      '0'),
      ('caio_recusa',       'recusada'),
      ('caio_recusa_2x',    'NAO_ESTA_ABERTA'),
      ('bia_aceita',        'aceita'),
      ('vaga',              'Bia:confirmado'),
      ('hugo_fechou',       'preenchida'),
      ('hugo_aceita',       'NAO_ESTA_ABERTA'),
      ('bia_posso',         'true'),
      ('hugo_ve',           'preenchida:false'),
      ('evento_chamou',     '2'),
      ('evento_aceita',     'aceita'),
      ('evento_linha',      '1'),
      ('evento_caio',       'NAO_ESTA_ABERTA'),
      ('cancela',           '1'),
      ('cancelada_aceita',  'NAO_ESTA_ABERTA'),
      ('lider_preencheu',   'PREENCHIDA'),
      ('inativa',           'Link invalido'),
      ('token_falso',       'Link invalido')
    ) as x(chave, esperado)
  loop
    if (m ->> r.chave) is distinct from r.esperado then
      falhas := falhas || format('%s: obtido %s, esperado %s', r.chave, coalesce(m ->> r.chave, '(nada)'), r.esperado);
    end if;
  end loop;

  if exists (select 1 from equipes where slug like 'conf106-%')
     or exists (select 1 from voluntarios where nome like '% Conf Cento Seis')
     or exists (select 1 from lideres where email like 'conf106%@exemplo.invalid') then
    falhas := falhas || 'o cenario de teste ficou no banco'::text; end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'106 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  select count(*) into v_n from jsonb_object_keys(m);
  raise notice 'OK 106 · conferencia: % medidas de chamar quem pode cobrir, todas como esperado. Cenario desfeito.', v_n;
end $conf$;

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (106, '106 · so o lider do ministerio chama', 'chamar_para_cobrir', 'lidera_equipe'),
      (106, '106 · chamar segue as regras do sorteio', 'chamar_para_cobrir', 'troca_impede'),
      (106, '106 · aceitar confere a vaga de novo', 'eu_chamada_responder', 'PREENCHIDA'),
      (106, '106 · aceitar confere o simultaneo na hora', 'eu_chamada_responder', 'set constraints tg_conflito immediate'),
      (106, '106 · o aviso sai uma vez por chamado', 'aviso_da_chamada', 'avisado_em is null')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (106, '106-chamar-quem-pode-cobrir-a-vaga.sql')
  on conflict (n) do nothing;

commit;

/* o que o editor mostra: só números */
select '106' as versao,
       (select count(*) from chamadas) as chamadas,
       (select count(*) from porta_publica where n = 106) as portas_novas,
       (select count(*) from testar_porta_publica() where not passou) as porta_reprovada,
       (select count(*) from schema_versao_conferir() where not passou) as sondas_reprovadas,
       (select count(*) from schema_versao_conferir()) as sondas;
