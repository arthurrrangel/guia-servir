/* =============================================================================
   103 · O LINK DO VOLUNTÁRIO GANHA TROCA, FUNÇÃO NOVA E A AGENDA DO MINISTÉRIO

   01/10/2026. Só de Escalas. Fase 1 do estudo do ServoApp
   (claude/estudo-servoapp-01-10-2026.md), escolhida pelo Arthur: "quero ter
   tudo que esse app tem e ser melhor ainda", "sem apagar nada do que já
   existe".

   SÓ ACRESCENTA. Nenhuma função existente é trocada, nenhuma coluna sai,
   nenhum comportamento antigo muda. O "Não vou mais poder" e a lista "Quem
   pode te cobrir" (76) continuam iguais; a troca é um caminho a mais.

   O QUE FALTAVA, MEDIDO CONTRA A CATEGORIA:

   1. TROCA COM ACEITE. Quem não podia ia, no máximo, à lista da 76, que só
      existe nas 48h antes do culto, devolve telefone e deixa a combinação por
      fora: a vaga continuava no nome de quem saiu até a liderança mexer.
      Agora a pessoa pede a um colega pelo próprio link, o colega aceita pelo
      dele e a vaga passa na hora, confirmada. Até alguém aceitar, a vaga
      continua de quem pediu.

   2. FUNÇÃO NOVA PELO PRÓPRIO VOLUNTÁRIO (o ServoApp tem). Entra com o nível
      que a pessoa declarou, NÃO conferida, e a pessoa volta para "Esperando
      sua conferência". É a regra do cadastro, que já vale para todo nível
      declarado (engine.ts, `nivelEfetivo`): até o líder conferir, "faz
      sozinho" vale como "ajuda quando falta" no sorteio, e "aprendendo" não
      entra sozinho. A função aparece nos lugares em que o líder já confere:
      Painel ("pessoa com nível declarado que você ainda não conferiu"), Time
      ("Esperando sua conferência", "Conferi, está certo") e Conferir níveis.
      `conferir_habilidade` já devolve `conferido = true` quando não sobra
      nada pendente: a regra nova fecha com a antiga dos dois lados.

   3. A AGENDA DO MINISTÉRIO. O link mostrava os dias em que a pessoa está
      escalada e a grade de sábados e domingos; os eventos do ministério (54)
      não apareciam para quem não estava neles.

   4. O LÍDER VÊ A TROCA. `escalacoes.trocou_de` guarda de quem a vaga veio
      quando ela passou por troca. Um gatilho novo limpa a coluna quando a
      vaga muda por outro caminho (o líder, o robô), para a marca nunca
      mentir.

   AS REGRAS DA TROCA (`troca_impede`), as mesmas do sorteio e dos gatilhos:
     ativo, da mesma área, sabe a função (titular ou reserva; aprendiz não
     cobre sozinho), o sexo que o posto pede (48), não avisou que não pode no
     dia (`indisponibilidades`), e não está em NENHUM posto naquele dia, com
     qualquer estado. É o `ocupadoNoDia` do motor, e cobre o simultâneo da 45
     e o "quem recusou não cobre" da 62.

     VAGA FIXA TROCA, SIM (02/10/2026, antes de esta migração rodar em
     produção). A primeira versão recusava a troca de vaga `fixo` ("quem
     travou decidiu quem fica"). Mas `fixo` é do SORTEIO: a tela diz "o
     sorteio não mexe", e todo posto que o líder escolhe à mão nasce fixo
     (é o que impede "Sortear de novo" de desfazer a escolha). Recusar por
     ele deixaria quase toda vaga que o líder mexeu sem troca pelo link: o
     voluntário pedia e ouvia "a liderança travou essa vaga". A troca segue
     as regras acima, quem aceita confirma, e o líder vê "trocou com".

   ACEITAR CONFERE TUDO DE NOVO, com a vaga travada (`for update`): ela ainda
   é de quem pediu, o dia não passou e quem aceita ainda pode. O conflito de posto simultâneo (45) é deferido; aqui ele confere na
   hora, para o erro voltar como resposta e não como falha no commit. Quem
   aceita e ainda não tinha respondido o dia fica com "posso" nele.

   SEM TELEFONE: a lista de quem pode receber o pedido devolve nome, nível e
   "disse que pode", nunca telefone. A lista com telefone continua sendo a da
   76, com a janela dela.

   TETOS: 20 pedidos por dia por pessoa, 6 abertos por vaga, 10 funções
   esperando conferência por pessoa.

   PORTA PÚBLICA: nove funções novas por token, todas no inventário da 77.

   SEM `create temp table` (101). O EDITOR DO SUPABASE NÃO MOSTRA NOTICE: a
   última linha é um select com o resultado.

   ORDEM:  ... 101 → 102 → 103
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(103);
  end if;
end $tranca$;

begin;

-- =========================================================================
-- 1 · trocas
-- =========================================================================
create table if not exists trocas (
  id              uuid primary key default gen_random_uuid(),
  culto_id        uuid not null references cultos(id) on delete cascade,
  funcao_id       uuid not null references funcoes(id) on delete cascade,
  de_voluntario   uuid not null references voluntarios(id) on delete cascade,
  para_voluntario uuid not null references voluntarios(id) on delete cascade,
  status          text not null default 'aberta',
  criado_em       timestamptz not null default now(),
  respondido_em   timestamptz,
  constraint trocas_status_ck check (status in ('aberta','aceita','recusada','cancelada','expirada')),
  constraint trocas_para_nao_e_de check (para_voluntario <> de_voluntario)
);
/* o mesmo pedido aberto duas vezes é toque duplo, não plano */
create unique index if not exists ux_trocas_aberta
  on trocas (culto_id, funcao_id, de_voluntario, para_voluntario) where status = 'aberta';
create index if not exists ix_trocas_para on trocas (para_voluntario, status);
create index if not exists ix_trocas_de   on trocas (de_voluntario, criado_em);
create index if not exists ix_trocas_vaga on trocas (culto_id, funcao_id) where status = 'aberta';

alter table trocas enable row level security;
/* no Supabase a tabela nova nasce com grant para anon e authenticated */
revoke all on trocas from public, anon, authenticated;

comment on table trocas is
  'Pedido de troca de escala entre voluntarios da mesma area (103). Quem esta na vaga pede; o colega aceita pelo proprio link e a vaga passa na hora. So se mexe por eu_troca_pedir/responder/cancelar; ninguem le a tabela direto.';

-- =========================================================================
-- 2 · de quem a vaga veio, para o líder ver a troca
-- =========================================================================
alter table escalacoes add column if not exists trocou_de uuid references voluntarios(id) on delete set null;

comment on column escalacoes.trocou_de is
  'Quem estava nesta vaga quando ela passou por troca aceita no link do voluntario (103). Nulo quando a vaga mudou de outro jeito: tg_trocou_de limpa a coluna quando voluntario_id muda sem ela.';

create or replace function fn_trocou_de() returns trigger
language plpgsql set search_path = public as $fn$
begin
  /* 103 · a vaga mudou de dono sem a troca dizer de quem veio: não foi troca */
  if new.voluntario_id is distinct from old.voluntario_id
     and new.trocou_de is not distinct from old.trocou_de then
    new.trocou_de := null;
  end if;
  return new;
end $fn$;
revoke all on function fn_trocou_de() from public, anon, authenticated;

drop trigger if exists tg_trocou_de on escalacoes;
create trigger tg_trocou_de
  before update of voluntario_id on escalacoes
  for each row execute function fn_trocou_de();

-- =========================================================================
-- 3 · quem pode receber a vaga
-- =========================================================================
create or replace function troca_impede(p_para uuid, p_culto uuid, p_funcao uuid)
returns text
language sql stable security definer set search_path = public as $fn$
  select case
    when c.id is null then 'CULTO'
    when v.id is null or not v.ativo then 'INATIVO'
    when f.id is null or not f.ativa or f.equipe_id is distinct from v.equipe_id then 'OUTRA_AREA'
    when not exists (select 1 from habilidades h
                      where h.voluntario_id = v.id and h.funcao_id = f.id
                        and h.nivel in ('titular','reserva')) then 'NAO_FAZ'
    when f.exige_sexo is not null and v.sexo is distinct from f.exige_sexo then 'SEXO'
    when exists (select 1 from indisponibilidades i
                  where i.voluntario_id = v.id and i.data = c.data) then 'INDISPONIVEL'
    /* em nenhum posto naquele dia, com qualquer estado: o `ocupadoNoDia` do
       motor, o simultâneo da 45 e o "quem recusou não cobre" da 62 */
    when exists (select 1 from escalacoes e join cultos c2 on c2.id = e.culto_id
                  where e.voluntario_id = v.id and c2.data = c.data) then 'JA_ESCALADO'
    else null end
  from (select 1) um
  left join voluntarios v on v.id = p_para
  left join funcoes f on f.id = p_funcao
  left join cultos c on c.id = p_culto;
$fn$;
revoke all on function troca_impede(uuid, uuid, uuid) from public, anon, authenticated;
comment on function troca_impede(uuid, uuid, uuid) is
  'Por que esta pessoa NAO pode receber esta vaga por troca (nulo = pode). As regras do sorteio e dos gatilhos de escalacoes (103). Interna: so as funcoes eu_troca_* chamam.';

-- =========================================================================
-- 4 · a lista de quem pode receber o pedido (sem telefone)
-- =========================================================================
create or replace function eu_troca_candidatos(p_token text, p_culto_id uuid, p_funcao_id uuid)
returns table(voluntario_id uuid, nome text, nivel text, disse_que_pode boolean, ja_pedi boolean)
language plpgsql stable security definer set search_path = public as $fn$
declare v_id uuid; v_eq uuid; v_data date;
begin
  select v.id, v.equipe_id into v_id, v_eq
    from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  select c.data into v_data from cultos c where c.id = p_culto_id;
  if v_data is null or v_data < (now() at time zone 'America/Sao_Paulo')::date then return; end if;
  /* só quem está na vaga pede troca dela */
  if not exists (select 1 from escalacoes e
                  where e.culto_id = p_culto_id and e.funcao_id = p_funcao_id
                    and e.voluntario_id = v_id and e.status <> 'furou') then
    return;
  end if;

  return query
  select o.id, o.nome, h.nivel::text,
         exists (select 1 from disponibilidade d
                  where d.voluntario_id = o.id and d.data = v_data and d.pode),
         exists (select 1 from trocas t
                  where t.culto_id = p_culto_id and t.funcao_id = p_funcao_id
                    and t.de_voluntario = v_id and t.para_voluntario = o.id
                    and t.status = 'aberta')
    from voluntarios o
    join habilidades h on h.voluntario_id = o.id and h.funcao_id = p_funcao_id
   where o.equipe_id = v_eq and o.id <> v_id
     and troca_impede(o.id, p_culto_id, p_funcao_id) is null
   order by 4 desc, (h.nivel = 'titular') desc, o.nome
   limit 12;
end $fn$;
revoke all on function eu_troca_candidatos(text, uuid, uuid) from public;
grant execute on function eu_troca_candidatos(text, uuid, uuid) to anon, authenticated;

-- =========================================================================
-- 5 · pedir
-- =========================================================================
create or replace function eu_troca_pedir(p_token text, p_culto_id uuid, p_funcao_id uuid, p_para uuid)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_data date; v_status text; v_motivo text; v_n int; v_troca uuid;
begin
  select v.id into v_id from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  select c.data into v_data from cultos c where c.id = p_culto_id;
  if v_data is null then return jsonb_build_object('ok', false, 'erro', 'CULTO_INEXISTENTE'); end if;
  if v_data < (now() at time zone 'America/Sao_Paulo')::date then
    return jsonb_build_object('ok', false, 'erro', 'JA_PASSOU');
  end if;

  select e.status::text into v_status
    from escalacoes e
   where e.culto_id = p_culto_id and e.funcao_id = p_funcao_id and e.voluntario_id = v_id;
  if not found or v_status = 'furou' then
    return jsonb_build_object('ok', false, 'erro', 'NAO_E_SUA');
  end if;
  /* vaga fixa troca (ver o topo): `fixo` é do sorteio */

  v_motivo := troca_impede(p_para, p_culto_id, p_funcao_id);
  if v_motivo is not null then
    return jsonb_build_object('ok', false, 'erro', 'NAO_PODE', 'motivo', v_motivo);
  end if;

  /* tetos: 20 pedidos por dia por pessoa, 6 abertos por vaga */
  select count(*) into v_n from trocas t
   where t.de_voluntario = v_id and t.criado_em > now() - interval '1 day';
  if v_n >= 20 then return jsonb_build_object('ok', false, 'erro', 'MUITOS_PEDIDOS'); end if;
  select count(*) into v_n from trocas t
   where t.culto_id = p_culto_id and t.funcao_id = p_funcao_id
     and t.de_voluntario = v_id and t.status = 'aberta';
  if v_n >= 6 then return jsonb_build_object('ok', false, 'erro', 'MUITOS_PEDIDOS'); end if;

  insert into trocas (culto_id, funcao_id, de_voluntario, para_voluntario)
       values (p_culto_id, p_funcao_id, v_id, p_para)
  on conflict (culto_id, funcao_id, de_voluntario, para_voluntario) where status = 'aberta'
  do nothing
  returning id into v_troca;
  if v_troca is null then
    /* o mesmo pedido já estava aberto: toque duplo não duplica */
    select t.id into v_troca from trocas t
     where t.culto_id = p_culto_id and t.funcao_id = p_funcao_id
       and t.de_voluntario = v_id and t.para_voluntario = p_para and t.status = 'aberta';
  end if;
  return jsonb_build_object('ok', true, 'id', v_troca);
end $fn$;
revoke all on function eu_troca_pedir(text, uuid, uuid, uuid) from public;
grant execute on function eu_troca_pedir(text, uuid, uuid, uuid) to anon, authenticated;

-- =========================================================================
-- 6 · responder (quem recebeu o pedido)
-- =========================================================================
create or replace function eu_troca_responder(p_token text, p_troca uuid, p_aceita boolean)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; t trocas%rowtype; v_data date; v_dono uuid; v_motivo text; v_n int;
begin
  select v.id into v_id from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  /* sem trava aqui: só para achar a vaga (a ordem das travas está abaixo) */
  select * into t from trocas where id = p_troca;
  if not found or t.para_voluntario <> v_id then
    return jsonb_build_object('ok', false, 'erro', 'NAO_E_SEU');
  end if;

  if not coalesce(p_aceita, false) then
    update trocas set status = 'recusada', respondido_em = now()
     where id = t.id and status = 'aberta';
    get diagnostics v_n = row_count;
    if v_n = 0 then return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_ABERTA'); end if;
    return jsonb_build_object('ok', true, 'status', 'recusada');
  end if;

  /* A ORDEM DAS TRAVAS: primeiro a vaga, depois o pedido. Dois colegas
     aceitando pedidos diferentes da MESMA vaga, cada um travando o próprio
     pedido antes, se esperariam em cruz (um quer expirar o pedido do outro).
     Com a vaga primeiro, o segundo espera o primeiro terminar e encontra o
     pedido dele já vencido. */
  select e.voluntario_id into v_dono
    from escalacoes e
   where e.culto_id = t.culto_id and e.funcao_id = t.funcao_id
     for update;
  select * into t from trocas where id = p_troca for update;
  if t.status <> 'aberta' then
    return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_ABERTA', 'status', t.status);
  end if;

  select c.data into v_data from cultos c where c.id = t.culto_id;
  if v_data is null or v_data < (now() at time zone 'America/Sao_Paulo')::date then
    update trocas set status = 'expirada', respondido_em = now() where id = t.id;
    return jsonb_build_object('ok', false, 'erro', 'JA_PASSOU');
  end if;

  /* a vaga ainda é de quem pediu? O líder pode ter mexido entre o pedido e o
     aceite. */
  if v_dono is distinct from t.de_voluntario then
    update trocas set status = 'expirada', respondido_em = now() where id = t.id;
    return jsonb_build_object('ok', false, 'erro', 'MUDOU');
  end if;

  v_motivo := troca_impede(v_id, t.culto_id, t.funcao_id);
  if v_motivo is not null then
    return jsonb_build_object('ok', false, 'erro', 'NAO_PODE', 'motivo', v_motivo);
  end if;

  /* o conflito de posto simultâneo (45) é deferido; aqui ele confere na hora,
     para o erro voltar como resposta e não como falha no commit */
  set constraints tg_conflito immediate;
  begin
    update escalacoes
       set voluntario_id = v_id, status = 'confirmado', respondido_em = now(),
           primeira_vez = false, trocou_de = t.de_voluntario
     where culto_id = t.culto_id and funcao_id = t.funcao_id and voluntario_id = t.de_voluntario;
    get diagnostics v_n = row_count;
  exception when others then
    set constraints tg_conflito deferred;
    return jsonb_build_object('ok', false, 'erro', 'NAO_PODE', 'motivo', 'REGRA', 'detalhe', sqlerrm);
  end;
  set constraints tg_conflito deferred;
  /* a vaga travada e conferida acima tem de ter passado: zero linhas aqui
     seria pedido marcado como aceito sem vaga nenhuma ter mudado de mão */
  if v_n <> 1 then
    update trocas set status = 'expirada', respondido_em = now() where id = t.id;
    return jsonb_build_object('ok', false, 'erro', 'MUDOU');
  end if;

  update trocas set status = 'aceita', respondido_em = now() where id = t.id;
  /* os outros pedidos da mesma vaga perdem o objeto */
  update trocas set status = 'expirada', respondido_em = now()
   where culto_id = t.culto_id and funcao_id = t.funcao_id
     and de_voluntario = t.de_voluntario and status = 'aberta' and id <> t.id;
  /* e quem aceitou passou a servir nesse dia: os outros pedidos para ela no
     mesmo dia já não têm como ser aceitos */
  update trocas t2 set status = 'expirada', respondido_em = now()
    from cultos c2
   where c2.id = t2.culto_id and c2.data = v_data
     and t2.para_voluntario = v_id and t2.status = 'aberta' and t2.id <> t.id;

  /* aceitar é dizer que pode no dia; só preenche, nunca sobrescreve */
  if not exists (select 1 from disponibilidade d where d.voluntario_id = v_id and d.data = v_data) then
    perform eu_marcar_dia(v_id, v_data, true);
  end if;

  return jsonb_build_object('ok', true, 'status', 'aceita');
end $fn$;
revoke all on function eu_troca_responder(text, uuid, boolean) from public;
grant execute on function eu_troca_responder(text, uuid, boolean) to anon, authenticated;

-- =========================================================================
-- 7 · cancelar (quem pediu)
-- =========================================================================
create or replace function eu_troca_cancelar(p_token text, p_troca uuid)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_n int;
begin
  select v.id into v_id from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;
  update trocas set status = 'cancelada', respondido_em = now()
   where id = p_troca and de_voluntario = v_id and status = 'aberta';
  get diagnostics v_n = row_count;
  if v_n = 0 then return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_ABERTA'); end if;
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function eu_troca_cancelar(text, uuid) from public;
grant execute on function eu_troca_cancelar(text, uuid) to anon, authenticated;

-- =========================================================================
-- 8 · os pedidos da pessoa (os que fez e os que recebeu)
-- =========================================================================
create or replace function eu_trocas(p_token text)
returns table(id uuid, papel text, culto_id uuid, data date, inicio time, evento text,
              funcao_id uuid, funcao text, outro text, status text, impede text,
              criado_em timestamptz, respondido_em timestamptz)
language plpgsql stable security definer set search_path = public as $fn$
declare v_id uuid; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select v.id into v_id from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  return query
  select t.id,
         case when t.de_voluntario = v_id then 'pedi' else 'me_pediram' end,
         c.id, c.data, c.inicio, c.evento, f.id, f.nome,
         (select o.nome from voluntarios o
           where o.id = case when t.de_voluntario = v_id then t.para_voluntario else t.de_voluntario end),
         t.status,
         /* aberto: o que impede quem recebeu de aceitar hoje (nulo = pode) */
         case when t.status = 'aberta' then troca_impede(t.para_voluntario, t.culto_id, t.funcao_id) end,
         t.criado_em, t.respondido_em
    from trocas t
    join cultos c on c.id = t.culto_id
    join funcoes f on f.id = t.funcao_id
   where (t.de_voluntario = v_id or t.para_voluntario = v_id)
     and (
       /* aberto, de culto que não passou, e a vaga ainda é de quem pediu */
       (t.status = 'aberta' and c.data >= v_hoje
        and exists (select 1 from escalacoes e
                     where e.culto_id = t.culto_id and e.funcao_id = t.funcao_id
                       and e.voluntario_id = t.de_voluntario))
       /* respondido nos últimos três dias, de culto de ontem em diante */
       or (t.status <> 'aberta' and c.data >= v_hoje - 1
           and t.respondido_em > now() - interval '3 days'))
   order by c.data, t.criado_em;
end $fn$;
revoke all on function eu_trocas(text) from public;
grant execute on function eu_trocas(text) to anon, authenticated;

-- =========================================================================
-- 9 · as funções da área, para a pessoa acrescentar a que falta
-- =========================================================================
create or replace function eu_funcoes(p_token text)
returns table(funcao_id uuid, nome text, ordem int, descricao text, nivel text, confirmado boolean,
              pode_pedir boolean, exige_sexo text, sem_niveis boolean)
language plpgsql stable security definer set search_path = public as $fn$
declare v_id uuid; v_eq uuid; v_sexo text; v_sem boolean;
begin
  select v.id, v.equipe_id, v.sexo into v_id, v_eq, v_sexo
    from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;
  select coalesce(e.sem_niveis, false) into v_sem from equipes e where e.id = v_eq;

  return query
  select f.id, f.nome, f.ordem, f.descricao, h.nivel::text, h.confirmado,
         (h.funcao_id is null and (f.exige_sexo is null or f.exige_sexo = v_sexo)),
         f.exige_sexo, v_sem
    from funcoes f
    left join habilidades h on h.voluntario_id = v_id and h.funcao_id = f.id
   where f.equipe_id = v_eq and f.ativa
   order by f.ordem, f.nome;
end $fn$;
revoke all on function eu_funcoes(text) from public;
grant execute on function eu_funcoes(text) to anon, authenticated;

create or replace function eu_funcao_adicionar(p_token text, p_funcao_id uuid, p_nivel text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_eq uuid; v_sexo text; v_exige text; v_sem boolean; v_nivel text; v_n int;
begin
  select v.id, v.equipe_id, v.sexo into v_id, v_eq, v_sexo
    from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  select f.exige_sexo, coalesce(e.sem_niveis, false) into v_exige, v_sem
    from funcoes f join equipes e on e.id = f.equipe_id
   where f.id = p_funcao_id and f.equipe_id = v_eq and f.ativa;
  if not found then return jsonb_build_object('ok', false, 'erro', 'FUNCAO_INVALIDA'); end if;

  /* área sem níveis (14): marcar o posto é "eu faço" */
  v_nivel := case when v_sem then 'titular' else p_nivel end;
  if v_nivel is null or v_nivel not in ('titular','reserva','treino') then
    return jsonb_build_object('ok', false, 'erro', 'NIVEL_INVALIDO');
  end if;
  if exists (select 1 from habilidades h where h.voluntario_id = v_id and h.funcao_id = p_funcao_id) then
    return jsonb_build_object('ok', false, 'erro', 'JA_TEM');
  end if;
  if v_exige is not null and v_sexo is null then
    return jsonb_build_object('ok', false, 'erro', 'SEXO_NAO_INFORMADO');
  end if;
  if v_exige is not null and v_sexo <> v_exige then
    return jsonb_build_object('ok', false, 'erro', 'SEXO');
  end if;
  select count(*) into v_n from habilidades h where h.voluntario_id = v_id and not h.confirmado;
  if v_n >= 10 then return jsonb_build_object('ok', false, 'erro', 'MUITAS_A_CONFERIR'); end if;

  insert into habilidades (voluntario_id, funcao_id, nivel, confirmado)
       values (v_id, p_funcao_id, v_nivel::nivel_habilidade, false);
  /* a pessoa volta para "Esperando sua conferência", como no cadastro */
  update voluntarios set conferido = false where id = v_id;
  return jsonb_build_object('ok', true, 'nivel', v_nivel);
end $fn$;
revoke all on function eu_funcao_adicionar(text, uuid, text) from public;
grant execute on function eu_funcao_adicionar(text, uuid, text) to anon, authenticated;

create or replace function eu_funcao_retirar(p_token text, p_funcao_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_conf boolean;
begin
  select v.id into v_id from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  select h.confirmado into v_conf from habilidades h
   where h.voluntario_id = v_id and h.funcao_id = p_funcao_id;
  if not found then return jsonb_build_object('ok', false, 'erro', 'NAO_TEM'); end if;
  /* o que o líder conferiu, só o líder tira */
  if v_conf then return jsonb_build_object('ok', false, 'erro', 'CONFERIDA'); end if;
  if not exists (select 1 from habilidades h
                  where h.voluntario_id = v_id and h.funcao_id <> p_funcao_id) then
    return jsonb_build_object('ok', false, 'erro', 'ULTIMA');
  end if;

  delete from habilidades where voluntario_id = v_id and funcao_id = p_funcao_id;
  /* a regra de `conferir_habilidade`: sem nada pendente, a pessoa está conferida */
  update voluntarios v set conferido = true
   where v.id = v_id
     and not exists (select 1 from habilidades h where h.voluntario_id = v.id and not h.confirmado);
  return jsonb_build_object('ok', true);
end $fn$;
revoke all on function eu_funcao_retirar(text, uuid) from public;
grant execute on function eu_funcao_retirar(text, uuid) to anon, authenticated;

-- =========================================================================
-- 10 · a agenda do ministério: os eventos dos próximos 60 dias
-- =========================================================================
create or replace function eu_eventos(p_token text)
returns table(culto_id uuid, data date, evento text, inicio time, fim time,
              escalado boolean, resposta text)
language plpgsql stable security definer set search_path = public as $fn$
declare v_id uuid; v_eq uuid; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select v.id, v.equipe_id into v_id, v_eq
    from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  return query
  select c.id, c.data, c.evento, c.inicio, c.fim,
         exists (select 1 from escalacoes e where e.culto_id = c.id and e.voluntario_id = v_id),
         case
           when exists (select 1 from indisponibilidades i
                         where i.voluntario_id = v_id and i.data = c.data) then 'nao'
           when exists (select 1 from disponibilidade d
                         where d.voluntario_id = v_id and d.data = c.data and d.pode) then 'posso'
         end
    from cultos c
   where c.evento is not null and c.equipe_id = v_eq
     and c.data between v_hoje and v_hoje + 60
   order by c.data, c.inicio nulls last, c.evento;
end $fn$;
revoke all on function eu_eventos(text) from public;
grant execute on function eu_eventos(text) to anon, authenticated;

-- =========================================================================
-- 11 · inventário da porta pública (77)
-- =========================================================================
do $porta$ begin
  if to_regclass('public.porta_publica') is null then
    raise notice 'PULEI o inventario: este banco nao tem porta_publica (falta a 77).';
    return;
  end if;
  insert into public.porta_publica (funcao, motivo, n) values
    ('eu_troca_candidatos(p_token text, p_culto_id uuid, p_funcao_id uuid)',
     'quem pode receber o pedido de troca da vaga que a pessoa ocupa: nome, nivel e se disse que pode, sem telefone (103).', 103),
    ('eu_troca_pedir(p_token text, p_culto_id uuid, p_funcao_id uuid, p_para uuid)',
     'pede a um colega que fique com a vaga. So quem esta na vaga pede, com as regras do sorteio e tetos de 20 por dia e 6 por vaga (103).', 103),
    ('eu_troca_responder(p_token text, p_troca uuid, p_aceita boolean)',
     'o colega aceita ou recusa pelo proprio link. Aceitar confere de novo a vaga, o dia, a trava e as regras antes de passar (103).', 103),
    ('eu_troca_cancelar(p_token text, p_troca uuid)',
     'quem pediu desiste de um pedido de troca que ainda esta aberto (103).', 103),
    ('eu_trocas(p_token text)',
     'os pedidos de troca que a pessoa fez e recebeu: os abertos e os respondidos nos ultimos tres dias (103).', 103),
    ('eu_funcoes(p_token text)',
     'as funcoes da area da pessoa, com o nivel dela em cada uma, para ela acrescentar a que falta (103).', 103),
    ('eu_funcao_adicionar(p_token text, p_funcao_id uuid, p_nivel text)',
     'a pessoa acrescenta uma funcao da propria area; entra nao conferida e volta para a conferencia do lider (103).', 103),
    ('eu_funcao_retirar(p_token text, p_funcao_id uuid)',
     'a pessoa tira uma funcao que ela mesma declarou e o lider ainda nao conferiu; a conferida so o lider tira (103).', 103),
    ('eu_eventos(p_token text)',
     'os eventos do ministerio da pessoa nos proximos 60 dias, com a resposta dela e se ela esta escalada (103).', 103)
  on conflict (funcao) do update set motivo = excluded.motivo, n = excluded.n;
end $porta$;

-- =========================================================================
-- 12 · conferência
-- =========================================================================
do $conf$
declare
  falhas text[] := '{}';
  r record; v_n int; v_txt text;
  m jsonb := '{}'::jsonb;
  montou boolean := false;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dia date;
  v_eq uuid; v_eq2 uuid;
  v_voz uuid; v_baixo uuid; v_soelas uuid; v_soeles uuid; v_tec uuid; v_fora uuid; v_x uuid;
  v_ana uuid; v_bia uuid; v_caio uuid; v_duda uuid; v_eva uuid; v_fabi uuid; v_hugo uuid; v_ivo uuid; v_gil uuid; v_jo uuid;
  t_ana text; t_bia text; t_caio text; t_duda text; t_eva text; t_fabi text; t_hugo text; t_ivo text; t_jo text;
  v_culto uuid; v_passado uuid;
  v_tb uuid; v_th uuid; v_ts uuid; v_t2 uuid; v_t3 uuid; v_t4 uuid; v_t5 uuid; v_t6 uuid; v_tf uuid;
  v_j jsonb;
begin
  /* 1 · estrutura: tabela fechada, funções com dono certo, porta inventariada */
  if not exists (select 1 from pg_class where oid = 'public.trocas'::regclass and relrowsecurity) then
    falhas := falhas || 'trocas sem RLS'::text; end if;
  if has_table_privilege('anon', 'public.trocas', 'select')
     or has_table_privilege('authenticated', 'public.trocas', 'select')
     or has_table_privilege('anon', 'public.trocas', 'insert')
     or has_table_privilege('authenticated', 'public.trocas', 'update') then
    falhas := falhas || 'trocas com grant para anon ou authenticated'::text; end if;
  for r in select * from (values
      ('eu_troca_candidatos(text,uuid,uuid)'), ('eu_troca_pedir(text,uuid,uuid,uuid)'),
      ('eu_troca_responder(text,uuid,boolean)'), ('eu_troca_cancelar(text,uuid)'),
      ('eu_trocas(text)'), ('eu_funcoes(text)'), ('eu_funcao_adicionar(text,uuid,text)'),
      ('eu_funcao_retirar(text,uuid)'), ('eu_eventos(text)')) as x(f)
  loop
    if to_regprocedure('public.' || r.f) is null then
      falhas := falhas || format('%s nao existe', r.f);
    elsif not has_function_privilege('anon', 'public.' || r.f, 'execute') then
      falhas := falhas || format('%s sem grant para anon', r.f);
    elsif not (select prosecdef from pg_proc where oid = to_regprocedure('public.' || r.f)) then
      falhas := falhas || format('%s nao e security definer', r.f);
    end if;
  end loop;
  if has_function_privilege('anon', 'public.troca_impede(uuid,uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.troca_impede(uuid,uuid,uuid)', 'execute') then
    falhas := falhas || 'troca_impede alcancavel de fora'::text; end if;
  if not exists (select 1 from pg_trigger where tgname = 'tg_trocou_de' and tgrelid = 'public.escalacoes'::regclass) then
    falhas := falhas || 'tg_trocou_de nao esta em escalacoes'::text; end if;
  if to_regprocedure('public.testar_porta_publica()') is not null then
    select count(*), string_agg(t.caso || ' (' || t.obtido || ')', '; ') into v_n, v_txt
      from public.testar_porta_publica() t where not t.passou;
    if v_n > 0 then falhas := falhas || format('porta publica reprovou: %s', v_txt); end if;
  end if;

  /* 2 · o caminho inteiro, num ministério de teste (desfeito no fim) */
  begin
    v_dia := v_hoje + 9;
    insert into equipes (nome, slug, ordem) values ('CONF103 Teste', 'conf103-teste', 996) returning id into v_eq;
    insert into equipes (nome, slug, ordem) values ('CONF103 Outra', 'conf103-outra', 997) returning id into v_eq2;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq, 'CONF103 VOZ', 1, true, true, array['domingo','follow']) returning id into v_voz;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq, 'CONF103 BAIXO', 2, true, true, array['domingo','follow']) returning id into v_baixo;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos, exige_sexo)
         values (v_eq, 'CONF103 SO ELAS', 3, true, false, array['domingo','follow'], 'F') returning id into v_soelas;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos, exige_sexo)
         values (v_eq, 'CONF103 SO ELES', 4, true, false, array['domingo','follow'], 'M') returning id into v_soeles;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq, 'CONF103 TECLADO', 5, true, true, array['domingo','follow']) returning id into v_tec;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq2, 'CONF103 DE FORA', 1, true, true, array['domingo','follow']) returning id into v_fora;

    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Ana Conf Cento Tres', '21900103001', true, 'F') returning id, token into v_ana, t_ana;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Bia Conf Cento Tres', '21900103002', true, 'F') returning id, token into v_bia, t_bia;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Caio Conf Cento Tres', '21900103003', true, 'M') returning id, token into v_caio, t_caio;
    insert into voluntarios (equipe_id, nome, telefone, ativo) values (v_eq, 'Duda Conf Cento Tres', '21900103004', true) returning id, token into v_duda, t_duda;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Eva Conf Cento Tres', '21900103005', true, 'F') returning id, token into v_eva, t_eva;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Fabi Conf Cento Tres', '21900103006', false, 'F') returning id, token into v_fabi, t_fabi;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Hugo Conf Cento Tres', '21900103007', true, 'M') returning id, token into v_hugo, t_hugo;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Ivo Conf Cento Tres', '21900103008', true, 'M') returning id, token into v_ivo, t_ivo;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq2, 'Gil Conf Cento Tres', '21900103009', true, 'M') returning id into v_gil;

    /* Ana está na VOZ e na SO ELAS; Bia sabe VOZ e SO ELAS e disse que pode;
       Caio só aprende VOZ; Duda sabe VOZ mas avisou que não pode; Eva sabe
       VOZ mas já está no BAIXO; Fabi está inativa; Hugo é homem e tem SO
       ELAS de antes da regra; Ivo ajuda na VOZ; Gil é de outra área */
    insert into habilidades (voluntario_id, funcao_id, nivel) values
      (v_ana, v_voz, 'titular'), (v_ana, v_soelas, 'titular'),
      (v_bia, v_voz, 'titular'), (v_bia, v_soelas, 'titular'),
      (v_caio, v_voz, 'treino'), (v_duda, v_voz, 'titular'),
      (v_eva, v_voz, 'reserva'), (v_eva, v_baixo, 'titular'),
      (v_fabi, v_voz, 'titular'), (v_hugo, v_voz, 'titular'), (v_hugo, v_soelas, 'titular'),
      (v_ivo, v_voz, 'reserva'), (v_gil, v_fora, 'titular');

    insert into cultos (data, evento, equipe_id, inicio)
         values (v_dia, 'CONF103 evento', v_eq, time '19:30') returning id into v_culto;
    insert into cultos (data, evento, equipe_id) values (v_hoje - 2, 'CONF103 passado', v_eq) returning id into v_passado;
    insert into cultos (data, evento, equipe_id, inicio) values (v_dia + 2, 'CONF103 sem mim', v_eq, time '20:00');
    insert into cultos (data, evento, equipe_id) values (v_hoje + 70, 'CONF103 longe', v_eq);
    insert into cultos (data, evento, equipe_id) values (v_dia + 1, 'CONF103 de outra area', v_eq2);
    insert into indisponibilidades (voluntario_id, data) values (v_duda, v_dia);
    insert into disponibilidade (voluntario_id, data, pode) values (v_bia, v_dia, true);
    insert into escalacoes (culto_id, funcao_id, voluntario_id, status) values
      (v_culto, v_voz, v_ana, 'pendente'), (v_culto, v_baixo, v_eva, 'confirmado'),
      (v_culto, v_soelas, v_ana, 'pendente'), (v_passado, v_voz, v_ana, 'confirmado');
    montou := true;

    /* a agenda: só eventos da área, nos próximos 60 dias */
    m := m || jsonb_build_object('agenda_ana',
           (select string_agg(evento || ':' || escalado || ':' || coalesce(resposta, '-'), ',' order by data) from eu_eventos(t_ana)));
    m := m || jsonb_build_object('agenda_bia',
           (select string_agg(evento || ':' || escalado || ':' || coalesce(resposta, '-'), ',' order by data) from eu_eventos(t_bia)));

    /* quem pode receber o pedido da Ana: Bia (disse que pode), Hugo, Ivo */
    m := m || jsonb_build_object('cand',
           (select string_agg(split_part(nome, ' ', 1), ',') from eu_troca_candidatos(t_ana, v_culto, v_voz)));
    m := m || jsonb_build_object('cand_alheio', (select count(*) from eu_troca_candidatos(t_bia, v_culto, v_voz)));
    m := m || jsonb_build_object('cand_passado', (select count(*) from eu_troca_candidatos(t_ana, v_passado, v_voz)));

    /* pedir para quem não pode */
    m := m || jsonb_build_object('pedir_caio', eu_troca_pedir(t_ana, v_culto, v_voz, v_caio) ->> 'motivo');
    m := m || jsonb_build_object('pedir_duda', eu_troca_pedir(t_ana, v_culto, v_voz, v_duda) ->> 'motivo');
    m := m || jsonb_build_object('pedir_eva',  eu_troca_pedir(t_ana, v_culto, v_voz, v_eva) ->> 'motivo');
    m := m || jsonb_build_object('pedir_fabi', eu_troca_pedir(t_ana, v_culto, v_voz, v_fabi) ->> 'motivo');
    m := m || jsonb_build_object('pedir_gil',  eu_troca_pedir(t_ana, v_culto, v_voz, v_gil) ->> 'motivo');
    m := m || jsonb_build_object('pedir_sexo', eu_troca_pedir(t_ana, v_culto, v_soelas, v_hugo) ->> 'motivo');
    m := m || jsonb_build_object('pedir_alheio', eu_troca_pedir(t_bia, v_culto, v_voz, v_hugo) ->> 'erro');
    m := m || jsonb_build_object('pedir_passado', eu_troca_pedir(t_ana, v_passado, v_voz, v_bia) ->> 'erro');
    m := m || jsonb_build_object('pedir_si', eu_troca_pedir(t_ana, v_culto, v_voz, v_ana) ->> 'motivo');

    /* pedir para a Bia, duas vezes: o mesmo pedido; e para o Hugo */
    v_tb := (eu_troca_pedir(t_ana, v_culto, v_voz, v_bia) ->> 'id')::uuid;
    m := m || jsonb_build_object('pedir_bia_2x', (eu_troca_pedir(t_ana, v_culto, v_voz, v_bia) ->> 'id')::uuid = v_tb);
    m := m || jsonb_build_object('abertas_par',
           (select count(*) from trocas where de_voluntario = v_ana and para_voluntario = v_bia and status = 'aberta'));
    v_th := (eu_troca_pedir(t_ana, v_culto, v_voz, v_hugo) ->> 'id')::uuid;
    m := m || jsonb_build_object('cand_ja_pedi',
           (select string_agg(split_part(nome, ' ', 1) || ':' || ja_pedi, ',') from eu_troca_candidatos(t_ana, v_culto, v_voz)));
    /* e a Ana também pede a SO ELAS para a Bia (mesmo dia) */
    v_ts := (eu_troca_pedir(t_ana, v_culto, v_soelas, v_bia) ->> 'id')::uuid;

    /* cada um vê o seu lado */
    m := m || jsonb_build_object('bia_ve', (select count(*) from eu_trocas(t_bia) where papel = 'me_pediram' and status = 'aberta'));
    m := m || jsonb_build_object('ana_ve', (select count(*) from eu_trocas(t_ana) where papel = 'pedi' and status = 'aberta'));

    /* o Hugo avisa que não pode: o pedido mostra o porquê, para os dois */
    insert into indisponibilidades (voluntario_id, data) values (v_hugo, v_dia);
    m := m || jsonb_build_object('impede_hugo', (select impede from eu_trocas(t_hugo) where id = v_th));
    m := m || jsonb_build_object('impede_ana_ve', (select impede from eu_trocas(t_ana) where id = v_th));
    m := m || jsonb_build_object('aceite_indisp', eu_troca_responder(t_hugo, v_th, true) ->> 'motivo');
    delete from indisponibilidades where voluntario_id = v_hugo and data = v_dia;

    /* quem não é o destinatário não responde */
    m := m || jsonb_build_object('caio_responde', eu_troca_responder(t_caio, v_tb, true) ->> 'erro');

    /* 02/10/2026 · vaga FIXA troca (ver o topo). O pedido com a vaga fixa
       abre (e sai em seguida, para não mexer no resto da conferência), e o
       aceite logo abaixo acontece com a vaga fixa. */
    update escalacoes set fixo = true where culto_id = v_culto and funcao_id = v_voz;
    v_tf := (eu_troca_pedir(t_ana, v_culto, v_voz, v_ivo) ->> 'id')::uuid;
    m := m || jsonb_build_object('pedir_fixo', v_tf is not null);
    delete from trocas where id = v_tf;

    /* a Bia aceita: a vaga é dela, confirmada, com a marca de onde veio, e
       continua fixa (o sorteio segue sem mexer nela) */
    m := m || jsonb_build_object('aceite', eu_troca_responder(t_bia, v_tb, true) ->> 'status');
    m := m || jsonb_build_object('vaga_depois',
           (select (e.voluntario_id = v_bia) || ':' || e.status || ':' || (e.trocou_de = v_ana)
              from escalacoes e where e.culto_id = v_culto and e.funcao_id = v_voz));
    m := m || jsonb_build_object('fixo_depois',
           (select fixo from escalacoes where culto_id = v_culto and funcao_id = v_voz));
    update escalacoes set fixo = false where culto_id = v_culto and funcao_id = v_voz;
    m := m || jsonb_build_object('outro_pedido_da_vaga', (select status from trocas where id = v_th));
    m := m || jsonb_build_object('pedido_mesmo_dia', (select status from trocas where id = v_ts));
    m := m || jsonb_build_object('aceite_2x', eu_troca_responder(t_bia, v_tb, true) ->> 'erro');
    m := m || jsonb_build_object('ana_historico',
           (select string_agg(papel || ':' || status || ':' || split_part(outro, ' ', 1), ',' order by status, outro)
              from eu_trocas(t_ana) where funcao_id = v_voz));
    m := m || jsonb_build_object('bia_tem_vaga',
           (select exists (select 1 from eu_dados(t_bia) d, jsonb_array_elements(d.escalas) x
                            where x ->> 'culto_id' = v_culto::text and x ->> 'funcao_id' = v_voz::text)));
    m := m || jsonb_build_object('ana_tem_vaga',
           (select exists (select 1 from eu_dados(t_ana) d, jsonb_array_elements(d.escalas) x
                            where x ->> 'culto_id' = v_culto::text and x ->> 'funcao_id' = v_voz::text)));

    /* o líder mexe na vaga: a marca some, e o pedido aberto dela perde o objeto */
    v_t2 := (eu_troca_pedir(t_bia, v_culto, v_voz, v_hugo) ->> 'id')::uuid;
    update escalacoes set voluntario_id = v_ivo where culto_id = v_culto and funcao_id = v_voz;
    m := m || jsonb_build_object('trocou_de_lider',
           (select trocou_de is null from escalacoes where culto_id = v_culto and funcao_id = v_voz));
    m := m || jsonb_build_object('hugo_ve_aberta', (select count(*) from eu_trocas(t_hugo) where status = 'aberta'));
    m := m || jsonb_build_object('aceite_mudou', eu_troca_responder(t_hugo, v_t2, true) ->> 'erro');
    m := m || jsonb_build_object('mudou_status', (select status from trocas where id = v_t2));

    /* recusar não mexe na vaga; pedir de novo abre outro pedido */
    v_t3 := (eu_troca_pedir(t_ivo, v_culto, v_voz, v_hugo) ->> 'id')::uuid;
    m := m || jsonb_build_object('recusa', eu_troca_responder(t_hugo, v_t3, false) ->> 'status');
    m := m || jsonb_build_object('recusa_dono',
           (select voluntario_id = v_ivo from escalacoes where culto_id = v_culto and funcao_id = v_voz));
    v_t4 := (eu_troca_pedir(t_ivo, v_culto, v_voz, v_hugo) ->> 'id')::uuid;
    m := m || jsonb_build_object('repedir_novo', v_t4 is not null and v_t4 <> v_t3);

    /* cancelar: só quem pediu, só aberto */
    v_t6 := (eu_troca_pedir(t_ivo, v_culto, v_voz, v_bia) ->> 'id')::uuid;
    m := m || jsonb_build_object('cancela_alheio', eu_troca_cancelar(t_bia, v_t6) ->> 'erro');
    m := m || jsonb_build_object('cancela', eu_troca_cancelar(t_ivo, v_t6) ->> 'ok');
    m := m || jsonb_build_object('cancela_2x', eu_troca_cancelar(t_ivo, v_t6) ->> 'erro');
    m := m || jsonb_build_object('recusa_cancelado', eu_troca_responder(t_bia, v_t6, false) ->> 'erro');

    /* o Hugo aceita sem ter respondido o dia: fica com "posso" nele */
    m := m || jsonb_build_object('aceite_hugo', eu_troca_responder(t_hugo, v_t4, true) ->> 'status');
    m := m || jsonb_build_object('auto_posso',
           (select pode from disponibilidade where voluntario_id = v_hugo and data = v_dia));
    m := m || jsonb_build_object('marca_hugo',
           (select trocou_de = v_ivo from escalacoes where culto_id = v_culto and funcao_id = v_voz));

    /* culto que passou: o pedido aberto vence ao responder */
    insert into trocas (culto_id, funcao_id, de_voluntario, para_voluntario)
         values (v_passado, v_voz, v_ana, v_bia) returning id into v_t5;
    m := m || jsonb_build_object('aceite_passado', eu_troca_responder(t_bia, v_t5, true) ->> 'erro');
    m := m || jsonb_build_object('passado_status', (select status from trocas where id = v_t5));

    /* tetos: 6 abertos por vaga; 20 por dia */
    insert into trocas (culto_id, funcao_id, de_voluntario, para_voluntario)
    select v_culto, v_voz, v_hugo, x from unnest(array[v_ana, v_bia, v_caio, v_duda, v_eva, v_fabi]) x;
    m := m || jsonb_build_object('teto_vaga', eu_troca_pedir(t_hugo, v_culto, v_voz, v_ivo) ->> 'erro');
    insert into trocas (culto_id, funcao_id, de_voluntario, para_voluntario, status)
    select v_culto, v_soelas, v_ana, v_bia, 'recusada' from generate_series(1, 20);
    m := m || jsonb_build_object('teto_dia', eu_troca_pedir(t_ana, v_culto, v_soelas, v_bia) ->> 'erro');

    /* função nova pela pessoa */
    m := m || jsonb_build_object('funcoes_ana',
           (select string_agg(replace(nome, 'CONF103 ', '') || ':' || coalesce(nivel, '-') || ':' || pode_pedir, ',' order by ordem)
              from eu_funcoes(t_ana)));
    m := m || jsonb_build_object('add_ok', eu_funcao_adicionar(t_ana, v_tec, 'titular') ->> 'ok');
    m := m || jsonb_build_object('add_estado',
           (select h.nivel || ':' || h.confirmado || ':' || v.conferido
              from habilidades h join voluntarios v on v.id = h.voluntario_id
             where h.voluntario_id = v_ana and h.funcao_id = v_tec));
    m := m || jsonb_build_object('add_2x', eu_funcao_adicionar(t_ana, v_tec, 'titular') ->> 'erro');
    m := m || jsonb_build_object('add_nivel', eu_funcao_adicionar(t_ana, v_baixo, 'chefe') ->> 'erro');
    m := m || jsonb_build_object('add_fora', eu_funcao_adicionar(t_ana, v_fora, 'reserva') ->> 'erro');
    m := m || jsonb_build_object('add_sexo', eu_funcao_adicionar(t_ana, v_soeles, 'reserva') ->> 'erro');
    m := m || jsonb_build_object('add_sem_sexo', eu_funcao_adicionar(t_duda, v_soelas, 'reserva') ->> 'erro');
    /* o líder confere pelo caminho de sempre: a pessoa volta a conferida */
    perform conferir_habilidade(v_ana, v_tec, 'titular');
    m := m || jsonb_build_object('conferir_volta', (select conferido from voluntarios where id = v_ana));

    /* área sem níveis: marcar é "eu faço" */
    update equipes set sem_niveis = true where id = v_eq;
    /* duas linhas de propósito: na mesma expressão, a subconsulta lê com a
       fotografia de antes da chamada e não vê a linha que ela inseriu */
    v_j := eu_funcao_adicionar(t_bia, v_baixo, 'treino');
    m := m || jsonb_build_object('add_sem_niveis',
           (v_j ->> 'ok') || ':' || (select nivel from habilidades where voluntario_id = v_bia and funcao_id = v_baixo));
    update equipes set sem_niveis = false where id = v_eq;

    /* retirar: só a não conferida, nunca a última */
    m := m || jsonb_build_object('retira_conferida', eu_funcao_retirar(t_ana, v_voz) ->> 'erro');
    m := m || jsonb_build_object('retira_nao_tem', eu_funcao_retirar(t_ana, v_baixo) ->> 'erro');
    m := m || jsonb_build_object('retira_ok', eu_funcao_retirar(t_bia, v_baixo) ->> 'ok');
    m := m || jsonb_build_object('retira_conferido', (select conferido from voluntarios where id = v_bia));
    insert into voluntarios (equipe_id, nome, telefone, ativo, conferido)
         values (v_eq, 'Jo Conf Cento Tres', '21900103010', true, false) returning id, token into v_jo, t_jo;
    insert into habilidades (voluntario_id, funcao_id, nivel, confirmado) values (v_jo, v_voz, 'reserva', false);
    m := m || jsonb_build_object('retira_ultima', eu_funcao_retirar(t_jo, v_voz) ->> 'erro');

    /* teto de dez esperando conferência */
    for v_n in 1..10 loop
      insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
           values (v_eq, 'CONF103 X' || v_n, 10 + v_n, true, true, array['domingo','follow']) returning id into v_x;
      v_j := eu_funcao_adicionar(t_jo, v_x, 'reserva');
    end loop;
    m := m || jsonb_build_object('add_teto', v_j ->> 'erro');

    /* link de quem está inativo não abre nada */
    begin
      perform * from eu_trocas(t_fabi);
      m := m || jsonb_build_object('inativo', 'abriu');
    exception when others then
      m := m || jsonb_build_object('inativo', sqlerrm);
    end;

    raise exception 'CONF103_DESFAZ';
  exception when others then
    if sqlerrm <> 'CONF103_DESFAZ' then
      falhas := falhas || ('o cenario nao rodou ate o fim (' || case when montou then 'medindo' else 'montando' end || '): ' || sqlerrm)::text;
    end if;
  end;

  if montou then
    for r in select * from (values
        ('agenda_ana',          'CONF103 evento:true:-,CONF103 sem mim:false:-'),
        ('agenda_bia',          'CONF103 evento:false:posso,CONF103 sem mim:false:-'),
        ('cand',                'Bia,Hugo,Ivo'),
        ('cand_alheio',         '0'),
        ('cand_passado',        '0'),
        ('pedir_caio',          'NAO_FAZ'),
        ('pedir_duda',          'INDISPONIVEL'),
        ('pedir_eva',           'JA_ESCALADO'),
        ('pedir_fabi',          'INATIVO'),
        ('pedir_gil',           'OUTRA_AREA'),
        ('pedir_sexo',          'SEXO'),
        ('pedir_alheio',        'NAO_E_SUA'),
        ('pedir_passado',       'JA_PASSOU'),
        ('pedir_si',            'JA_ESCALADO'),
        ('pedir_bia_2x',        'true'),
        ('abertas_par',         '1'),
        ('cand_ja_pedi',        'Bia:true,Hugo:true,Ivo:false'),
        ('bia_ve',              '2'),
        ('ana_ve',              '3'),
        ('impede_hugo',         'INDISPONIVEL'),
        ('impede_ana_ve',       'INDISPONIVEL'),
        ('aceite_indisp',       'INDISPONIVEL'),
        ('caio_responde',       'NAO_E_SEU'),
        ('pedir_fixo',          'true'),
        ('fixo_depois',         'true'),
        ('aceite',              'aceita'),
        ('vaga_depois',         'true:confirmado:true'),
        ('outro_pedido_da_vaga','expirada'),
        ('pedido_mesmo_dia',    'expirada'),
        ('aceite_2x',           'NAO_ESTA_ABERTA'),
        ('ana_historico',       'pedi:aceita:Bia,pedi:expirada:Hugo'),
        ('bia_tem_vaga',        'true'),
        ('ana_tem_vaga',        'false'),
        ('trocou_de_lider',     'true'),
        ('hugo_ve_aberta',      '0'),
        ('aceite_mudou',        'MUDOU'),
        ('mudou_status',        'expirada'),
        ('recusa',              'recusada'),
        ('recusa_dono',         'true'),
        ('repedir_novo',        'true'),
        ('cancela_alheio',      'NAO_ESTA_ABERTA'),
        ('cancela',             'true'),
        ('cancela_2x',          'NAO_ESTA_ABERTA'),
        ('recusa_cancelado',    'NAO_ESTA_ABERTA'),
        ('aceite_hugo',         'aceita'),
        ('auto_posso',          'true'),
        ('marca_hugo',          'true'),
        ('aceite_passado',      'JA_PASSOU'),
        ('passado_status',      'expirada'),
        ('teto_vaga',           'MUITOS_PEDIDOS'),
        ('teto_dia',            'MUITOS_PEDIDOS'),
        ('funcoes_ana',         'VOZ:titular:false,BAIXO:-:true,SO ELAS:titular:false,SO ELES:-:false,TECLADO:-:true'),
        ('add_ok',              'true'),
        ('add_estado',          'titular:false:false'),
        ('add_2x',              'JA_TEM'),
        ('add_nivel',           'NIVEL_INVALIDO'),
        ('add_fora',            'FUNCAO_INVALIDA'),
        ('add_sexo',            'SEXO'),
        ('add_sem_sexo',        'SEXO_NAO_INFORMADO'),
        ('conferir_volta',      'true'),
        ('add_sem_niveis',      'true:titular'),
        ('retira_conferida',    'CONFERIDA'),
        ('retira_nao_tem',      'NAO_TEM'),
        ('retira_ok',           'true'),
        ('retira_conferido',    'true'),
        ('retira_ultima',       'ULTIMA'),
        ('add_teto',            'MUITAS_A_CONFERIR'),
        ('inativo',             'Link invalido')
      ) as x(chave, esperado)
    loop
      if (m ->> r.chave) is distinct from r.esperado then
        falhas := falhas || format('%s: obtido %s, esperado %s', r.chave, coalesce(m ->> r.chave, '(nada)'), r.esperado);
      end if;
    end loop;
  end if;

  /* o cenário foi desfeito */
  if exists (select 1 from equipes where slug in ('conf103-teste', 'conf103-outra'))
     or exists (select 1 from voluntarios where nome like '% Conf Cento Tres') then
    falhas := falhas || 'o cenario de teste ficou no banco'::text; end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'103 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  select count(*) into v_n from jsonb_object_keys(m);
  raise notice 'OK 103 · conferencia: % medidas da troca, da funcao nova e da agenda, todas como esperado. Cenario desfeito.', v_n;
end $conf$;

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (103, '103 · troca segue as regras do sorteio', 'troca_impede', 'JA_ESCALADO'),
      (103, '103 · aceitar confere a vaga de novo', 'eu_troca_responder', 'MUDOU'),
      (103, '103 · aceitar confere o simultaneo na hora', 'eu_troca_responder', 'set constraints tg_conflito immediate'),
      (103, '103 · funcao nova entra a conferir', 'eu_funcao_adicionar', 'set conferido = false'),
      (103, '103 · a conferida so o lider tira', 'eu_funcao_retirar', 'CONFERIDA'),
      (103, '103 · agenda do ministerio', 'eu_eventos', 'c.evento is not null'),
      (103, '103 · a marca da troca some quando o lider mexe', 'fn_trocou_de', 'new.trocou_de := null')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (103, '103-o-link-do-voluntario-ganha-troca-funcao-e-agenda.sql')
  on conflict (n) do nothing;

commit;

/* o que o editor mostra: só números */
select '103' as versao,
       (select count(*) from trocas) as trocas,
       (select count(*) from porta_publica where n = 103) as portas_novas,
       (select count(*) from testar_porta_publica() where not passou) as porta_reprovada,
       (select count(*) from schema_versao_conferir() where not passou) as sondas_reprovadas,
       (select count(*) from schema_versao_conferir()) as sondas;
