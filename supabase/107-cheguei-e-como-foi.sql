/* =============================================================================
   107 · "CHEGUEI" E "COMO FOI"

   02/10/2026. Só de Escalas. O resto da Fase 4 do estudo do ServoApp
   (claude/estudo-servoapp-01-10-2026.md): o check-in de presença e o retorno
   de quem serviu, que a categoria tem (Voluts: "check-in direto no app, sem
   QR Code"; "os voluntários contam como foi") e o GUIA Servir não tinha. O
   Arthur: "quero ter tudo ... e ser melhor ainda", "sem apagar nada".

   A DOR: ninguém registra quem veio. O banco tinha 0 furos marcados em 92
   escalações quando a situação de cada posto chegou à tela de Escala
   (setembro), e o líder do dia só descobre quem falta olhando em volta,
   minutos antes do culto.

   O QUE MUDA (só acrescenta)
     1 · `presencas`: quem chegou em cada culto e quem marcou (a própria
         pessoa, o líder do dia ou a liderança). Fechada para fora.
     2 · `eu_cheguei()`: a pessoa marca pelo próprio link, só no dia do culto
         e só se tem posto nele (que não recusou). Vale para todo ministério
         em que a MESMA pessoa (`pessoa_id`) serve naquele culto, e quem ainda
         não tinha confirmado fica confirmado: chegou, então vem. Desfazer
         tira a marca e não mexe na confirmação.
     3 · `eu_hoje()`: os cultos de hoje em que a pessoa serve, a hora em que
         ela chegou e, para quem tem posto de relato (o líder do dia), o time
         do dia com a hora de cada um. `eu_marcar_chegada()`: o líder do dia
         marca quem chegou sem tocar (só gente do time dele, só no dia). A
         marca feita por outra pessoa NÃO confirma ninguém: só a própria
         pessoa confirma a si mesma.
     4 · `presencas_do_dia()` e `marcar_chegada()`: a liderança vê e corrige,
         até 30 dias para trás.
     5 · `como_foi`: depois de servir (até 7 dias), a pessoa conta como foi:
         "foi bom", "foi puxado" ou "teve problema", e uma nota opcional de
         até 500 letras. Só a liderança do ministério lê
         (`como_foi_da_equipe`), e a tela diz isso a quem escreve.

   NADA VIRA FURO SOZINHO. Sem marca não quer dizer que a pessoa faltou (ela
   pode ter esquecido de tocar). Furo continua sendo decisão de quem lidera,
   na tela de Escala.

   PORTA PÚBLICA: cinco funções novas por token, no inventário da 77.

   SEM `create temp table` (101). O EDITOR DO SUPABASE NÃO MOSTRA NOTICE: a
   última linha é um select com o resultado.

   ORDEM:  ... 105 → 106 → 107
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(107);
  end if;
  /* rodada antes da 106, a régua pularia e recusaria a 106 depois */
  if to_regclass('public.schema_versao') is not null
     and not exists (select 1 from public.schema_versao where n = 106) then
    raise exception 'FALTA A 106: rode antes a 103, a 104, a 105 e a 106. Nada foi mudado.';
  end if;
end $tranca$;

begin;

-- =========================================================================
-- 1 · as tabelas
-- =========================================================================
create table if not exists public.presencas (
  culto_id       uuid not null references public.cultos(id) on delete cascade,
  voluntario_id  uuid not null references public.voluntarios(id) on delete cascade,
  chegou_em      timestamptz not null default clock_timestamp(),
  marcado_por    text not null check (marcado_por in ('eu', 'lider_do_dia', 'lideranca')),
  primary key (culto_id, voluntario_id)
);
create index if not exists ix_presencas_pessoa on public.presencas (voluntario_id);
alter table public.presencas enable row level security;
revoke all on table public.presencas from public, anon, authenticated;
comment on table public.presencas is
  '107: quem chegou em cada culto e quem marcou. So as funcoes eu_cheguei, eu_marcar_chegada e marcar_chegada mexem.';

create table if not exists public.como_foi (
  culto_id       uuid not null references public.cultos(id) on delete cascade,
  voluntario_id  uuid not null references public.voluntarios(id) on delete cascade,
  resposta       text not null check (resposta in ('bom', 'puxado', 'problema')),
  texto          text check (texto is null or char_length(texto) between 1 and 500),
  criado_em      timestamptz not null default clock_timestamp(),
  atualizado_em  timestamptz not null default clock_timestamp(),
  primary key (culto_id, voluntario_id)
);
create index if not exists ix_como_foi_pessoa on public.como_foi (voluntario_id);
alter table public.como_foi enable row level security;
revoke all on table public.como_foi from public, anon, authenticated;
comment on table public.como_foi is
  '107: como foi servir, contado pela pessoa. So a lideranca do ministerio le (como_foi_da_equipe).';

-- =========================================================================
-- 2 · as três perguntas que tudo abaixo faz
-- =========================================================================
/* serve no culto: tem posto nele e não disse que não pode (furou conta:
   quem chega atrasado depois de marcado como furo também chegou) */
create or replace function public.serve_no_culto(p_vol uuid, p_culto uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from escalacoes e
                  where e.culto_id = p_culto and e.voluntario_id = p_vol
                    and e.status <> 'recusado');
$fn$;
revoke all on function public.serve_no_culto(uuid, uuid) from public, anon, authenticated;

/* lidera o dia: está num posto de relato (`funcoes.relata`) do culto, sem ter
   dito que não pode e sem ter furado */
create or replace function public.lidera_o_dia(p_vol uuid, p_culto uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from escalacoes e join funcoes f on f.id = e.funcao_id
                  where e.culto_id = p_culto and e.voluntario_id = p_vol and f.relata
                    and e.status in ('pendente', 'confirmado'));
$fn$;
revoke all on function public.lidera_o_dia(uuid, uuid) from public, anon, authenticated;

/* serviu no culto: estava no posto (confirmado, ou sem ter respondido) ou
   tem marca de chegada. Quem disse que não pode ou furou sem chegar, não. */
create or replace function public.serviu_no_culto(p_vol uuid, p_culto uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from escalacoes e
                  where e.culto_id = p_culto and e.voluntario_id = p_vol
                    and e.status in ('pendente', 'confirmado'))
      or exists (select 1 from presencas p where p.culto_id = p_culto and p.voluntario_id = p_vol);
$fn$;
revoke all on function public.serviu_no_culto(uuid, uuid) from public, anon, authenticated;

-- =========================================================================
-- 3 · a pessoa marca que chegou, pelo próprio link
-- =========================================================================
create or replace function public.eu_cheguei(p_token text, p_culto uuid, p_chegou boolean)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_pessoa uuid; v_data date; v_quando timestamptz; v_conf int := 0; v_n int; r record;
        v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select v.id, v.pessoa_id into v_id, v_pessoa from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;
  select c.data into v_data from cultos c where c.id = p_culto;
  if v_data is null then return jsonb_build_object('ok', false, 'erro', 'CULTO_INEXISTENTE'); end if;
  if v_data <> v_hoje then return jsonb_build_object('ok', false, 'erro', 'FORA_DO_DIA'); end if;
  if not serve_no_culto(v_id, p_culto) then return jsonb_build_object('ok', false, 'erro', 'SEM_POSTO'); end if;

  if not coalesce(p_chegou, true) then
    /* desfazer: a marca deste vínculo, quem quer que tenha marcado (a pessoa
       sabe se chegou), e as que ela mesma espalhou pelos outros ministérios */
    delete from presencas p
     where p.culto_id = p_culto
       and (p.voluntario_id = v_id
            or (v_pessoa is not null and p.marcado_por = 'eu'
                and p.voluntario_id in (select o.id from voluntarios o where o.pessoa_id = v_pessoa)));
    return jsonb_build_object('ok', true, 'chegou_em', null, 'confirmou', 0);
  end if;

  /* a chegada vale para todo ministério em que a MESMA pessoa serve no culto */
  for r in select o.id from voluntarios o
            where o.ativo and (o.id = v_id or (v_pessoa is not null and o.pessoa_id = v_pessoa))
              and serve_no_culto(o.id, p_culto)
  loop
    /* a primeira hora fica: tocar de novo não muda a chegada */
    insert into presencas (culto_id, voluntario_id, marcado_por)
         values (p_culto, r.id, 'eu')
    on conflict (culto_id, voluntario_id) do nothing;
    /* chegou, então vem: o "falta confirmar" do dia some. Furo não muda:
       desfazer furo é de quem lidera. */
    update escalacoes set status = 'confirmado', respondido_em = now()
     where culto_id = p_culto and voluntario_id = r.id and status = 'pendente';
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_conf := v_conf + v_n;
      perform eu_marcar_dia(r.id, v_data, true);
    end if;
  end loop;

  select p.chegou_em into v_quando from presencas p where p.culto_id = p_culto and p.voluntario_id = v_id;
  return jsonb_build_object('ok', true, 'chegou_em', v_quando, 'confirmou', v_conf);
end $fn$;
revoke all on function public.eu_cheguei(text, uuid, boolean) from public;
grant execute on function public.eu_cheguei(text, uuid, boolean) to anon, authenticated;

-- =========================================================================
-- 4 · o dia de hoje no link, e o líder do dia marcando o time
-- =========================================================================
create or replace function public.eu_hoje(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_id uuid; v_eq uuid; v_out jsonb := '[]'::jsonb; v_time jsonb; r record;
        v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select v.id, v.equipe_id into v_id, v_eq from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  for r in select c.id, c.data, c.evento, c.inicio, p.chegou_em, p.marcado_por,
                  lidera_o_dia(v_id, c.id) as relata
             from cultos c
             left join presencas p on p.culto_id = c.id and p.voluntario_id = v_id
            where c.data = v_hoje and serve_no_culto(v_id, c.id)
            order by c.inicio nulls first, c.id
  loop
    v_time := null;
    /* o time do dia só para quem lidera o dia: nome, posto e a hora da
       chegada. Sem telefone, como `eu_quem_serve` (40). */
    if r.relata then
      select coalesce(jsonb_agg(jsonb_build_object(
               'voluntario_id', x.vid, 'nome', x.nome, 'funcoes', to_jsonb(x.funcoes),
               'chegou_em', x.chegou_em, 'marcado_por', x.marcado_por, 'eu', x.vid = v_id)
               order by x.ordem, x.nome), '[]'::jsonb)
        into v_time
        from (select o.id as vid, o.nome,
                     array_agg(f.nome order by f.ordem, f.nome) as funcoes,
                     min(f.ordem) as ordem,
                     max(p2.chegou_em) as chegou_em, max(p2.marcado_por) as marcado_por
                from escalacoes e
                join funcoes f on f.id = e.funcao_id and f.equipe_id = v_eq
                join voluntarios o on o.id = e.voluntario_id and o.ativo
                left join presencas p2 on p2.culto_id = e.culto_id and p2.voluntario_id = o.id
               where e.culto_id = r.id and e.status <> 'recusado'
               group by o.id, o.nome) x;
    end if;
    v_out := v_out || jsonb_build_object(
      'culto_id', r.id, 'data', r.data, 'evento', r.evento, 'inicio', r.inicio,
      'chegou_em', r.chegou_em, 'marcado_por', r.marcado_por, 'relata', r.relata, 'time', v_time);
  end loop;
  return jsonb_build_object('ok', true, 'cultos', v_out);
end $fn$;
revoke all on function public.eu_hoje(text) from public;
grant execute on function public.eu_hoje(text) to anon, authenticated;

create or replace function public.eu_marcar_chegada(p_token text, p_culto uuid, p_voluntario uuid, p_chegou boolean)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_eq uuid; v_data date; v_quando timestamptz; v_por text;
        v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select v.id, v.equipe_id into v_id, v_eq from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;
  select c.data into v_data from cultos c where c.id = p_culto;
  if v_data is null then return jsonb_build_object('ok', false, 'erro', 'CULTO_INEXISTENTE'); end if;
  if v_data <> v_hoje then return jsonb_build_object('ok', false, 'erro', 'FORA_DO_DIA'); end if;
  if not lidera_o_dia(v_id, p_culto) then return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
  /* só gente do time do dia: posto DESTE ministério no culto, sem ter dito
     que não pode, e com o vínculo ativo */
  if not exists (select 1 from escalacoes e
                   join funcoes f on f.id = e.funcao_id
                   join voluntarios o on o.id = e.voluntario_id
                  where e.culto_id = p_culto and e.voluntario_id = p_voluntario
                    and f.equipe_id = v_eq and e.status <> 'recusado' and o.ativo) then
    return jsonb_build_object('ok', false, 'erro', 'NAO_E_DO_TIME');
  end if;

  if coalesce(p_chegou, true) then
    /* só a marca: quem marca o outro não confirma por ele */
    insert into presencas (culto_id, voluntario_id, marcado_por)
         values (p_culto, p_voluntario, 'lider_do_dia')
    on conflict (culto_id, voluntario_id) do nothing;
  else
    delete from presencas where culto_id = p_culto and voluntario_id = p_voluntario;
  end if;
  select p.chegou_em, p.marcado_por into v_quando, v_por
    from presencas p where p.culto_id = p_culto and p.voluntario_id = p_voluntario;
  return jsonb_build_object('ok', true, 'chegou_em', v_quando, 'marcado_por', v_por);
end $fn$;
revoke all on function public.eu_marcar_chegada(text, uuid, uuid, boolean) from public;
grant execute on function public.eu_marcar_chegada(text, uuid, uuid, boolean) to anon, authenticated;

-- =========================================================================
-- 5 · a liderança vê e corrige
-- =========================================================================
create or replace function public.presencas_do_dia(p_equipe uuid, p_data date)
returns table(culto_id uuid, voluntario_id uuid, chegou_em timestamptz, marcado_por text)
language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.lidera_equipe(p_equipe) then return; end if;
  return query
  select p.culto_id, p.voluntario_id, p.chegou_em, p.marcado_por
    from presencas p
    join cultos c on c.id = p.culto_id
    join voluntarios o on o.id = p.voluntario_id
   where c.data = p_data and o.equipe_id = p_equipe
   order by p.chegou_em;
end $fn$;
revoke all on function public.presencas_do_dia(uuid, date) from public, anon;
grant execute on function public.presencas_do_dia(uuid, date) to authenticated;

create or replace function public.marcar_chegada(p_culto uuid, p_voluntario uuid, p_chegou boolean)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_eq uuid; v_data date; v_quando timestamptz; v_por text;
        v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select o.equipe_id into v_eq from voluntarios o where o.id = p_voluntario;
  if v_eq is null or not public.lidera_equipe(v_eq) then
    return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO');
  end if;
  select c.data into v_data from cultos c where c.id = p_culto;
  if v_data is null then return jsonb_build_object('ok', false, 'erro', 'CULTO_INEXISTENTE'); end if;
  if v_data > v_hoje then return jsonb_build_object('ok', false, 'erro', 'AINDA_NAO'); end if;
  if v_data < v_hoje - 30 then return jsonb_build_object('ok', false, 'erro', 'MUITO_ANTIGO'); end if;
  /* qualquer posto da pessoa no culto: quem disse que não pode e veio mesmo
     assim também chegou */
  if not exists (select 1 from escalacoes e where e.culto_id = p_culto and e.voluntario_id = p_voluntario) then
    return jsonb_build_object('ok', false, 'erro', 'SEM_POSTO');
  end if;

  if coalesce(p_chegou, true) then
    insert into presencas (culto_id, voluntario_id, marcado_por)
         values (p_culto, p_voluntario, 'lideranca')
    on conflict (culto_id, voluntario_id) do nothing;
  else
    delete from presencas where culto_id = p_culto and voluntario_id = p_voluntario;
  end if;
  select p.chegou_em, p.marcado_por into v_quando, v_por
    from presencas p where p.culto_id = p_culto and p.voluntario_id = p_voluntario;
  return jsonb_build_object('ok', true, 'chegou_em', v_quando, 'marcado_por', v_por);
end $fn$;
revoke all on function public.marcar_chegada(uuid, uuid, boolean) from public, anon;
grant execute on function public.marcar_chegada(uuid, uuid, boolean) to authenticated;

-- =========================================================================
-- 6 · como foi servir
-- =========================================================================
create or replace function public.eu_como_foi(p_token text)
returns table(culto_id uuid, data date, evento text, inicio time, funcoes text[],
              resposta text, texto text, atualizado_em timestamptz)
language plpgsql stable security definer set search_path = public as $fn$
declare v_id uuid; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select v.id into v_id from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  return query
  select c.id, c.data, c.evento, c.inicio,
         (select array_agg(f.nome order by f.ordem, f.nome)
            from escalacoes e join funcoes f on f.id = e.funcao_id
           where e.culto_id = c.id and e.voluntario_id = v_id and e.status <> 'recusado'),
         cf.resposta, cf.texto, cf.atualizado_em
    from cultos c
    left join como_foi cf on cf.culto_id = c.id and cf.voluntario_id = v_id
   where c.data between v_hoje - 7 and v_hoje
     and serviu_no_culto(v_id, c.id)
   order by c.data desc, c.inicio nulls first, c.id;
end $fn$;
revoke all on function public.eu_como_foi(text) from public;
grant execute on function public.eu_como_foi(text) to anon, authenticated;

create or replace function public.eu_como_foi_responder(p_token text, p_culto uuid, p_resposta text, p_texto text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_data date; v_texto text;
        v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select v.id into v_id from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;
  select c.data into v_data from cultos c where c.id = p_culto;
  if v_data is null then return jsonb_build_object('ok', false, 'erro', 'CULTO_INEXISTENTE'); end if;
  if v_data > v_hoje or v_data < v_hoje - 7 then
    return jsonb_build_object('ok', false, 'erro', 'FORA_DA_JANELA');
  end if;
  if not serviu_no_culto(v_id, p_culto) then
    return jsonb_build_object('ok', false, 'erro', 'NAO_SERVIU');
  end if;

  /* sem resposta: a pessoa apaga o que tinha contado */
  if p_resposta is null then
    delete from como_foi where culto_id = p_culto and voluntario_id = v_id;
    return jsonb_build_object('ok', true, 'resposta', null, 'texto', null);
  end if;
  if p_resposta not in ('bom', 'puxado', 'problema') then
    return jsonb_build_object('ok', false, 'erro', 'RESPOSTA_INVALIDA');
  end if;

  /* a nota: sem caractere de controle (a quebra de linha fica), sem espaço
     sobrando, no máximo duas linhas em branco seguidas */
  v_texto := regexp_replace(coalesce(p_texto, ''), E'[\\x01-\\x09\\x0B-\\x1F\\x7F]', ' ', 'g');
  v_texto := regexp_replace(v_texto, ' {2,}', ' ', 'g');
  v_texto := regexp_replace(v_texto, E' *\n *', E'\n', 'g');
  v_texto := regexp_replace(v_texto, E'\n{3,}', E'\n\n', 'g');
  v_texto := nullif(btrim(v_texto, E' \n'), '');
  if char_length(v_texto) > 500 then
    return jsonb_build_object('ok', false, 'erro', 'TEXTO_LONGO');
  end if;

  insert into como_foi (culto_id, voluntario_id, resposta, texto)
       values (p_culto, v_id, p_resposta, v_texto)
  on conflict (culto_id, voluntario_id) do update
     set resposta = excluded.resposta, texto = excluded.texto, atualizado_em = clock_timestamp();
  return jsonb_build_object('ok', true, 'resposta', p_resposta, 'texto', v_texto);
end $fn$;
revoke all on function public.eu_como_foi_responder(text, uuid, text, text) from public;
grant execute on function public.eu_como_foi_responder(text, uuid, text, text) to anon, authenticated;

/* o que o ministério contou, num intervalo de até dois meses: um dia (a tela
   de Escala) ou as duas últimas semanas (o Painel) */
create or replace function public.como_foi_da_equipe(p_equipe uuid, p_de date, p_ate date)
returns table(culto_id uuid, data date, evento text, voluntario_id uuid, nome text, funcoes text[],
              resposta text, texto text, atualizado_em timestamptz)
language plpgsql stable security definer set search_path = public as $fn$
begin
  if not public.lidera_equipe(p_equipe) then return; end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 62 then return; end if;
  return query
  select cf.culto_id, c.data, c.evento, o.id, o.nome,
         (select array_agg(f.nome order by f.ordem, f.nome)
            from escalacoes e join funcoes f on f.id = e.funcao_id
           where e.culto_id = cf.culto_id and e.voluntario_id = o.id),
         cf.resposta, cf.texto, cf.atualizado_em
    from como_foi cf
    join cultos c on c.id = cf.culto_id
    join voluntarios o on o.id = cf.voluntario_id
   where o.equipe_id = p_equipe and c.data between p_de and p_ate
   order by c.data desc,
            (case cf.resposta when 'problema' then 0 when 'puxado' then 1 else 2 end),
            o.nome;
end $fn$;
revoke all on function public.como_foi_da_equipe(uuid, date, date) from public, anon;
grant execute on function public.como_foi_da_equipe(uuid, date, date) to authenticated;

-- =========================================================================
-- 7 · inventário da porta pública (77)
-- =========================================================================
do $porta$ begin
  if to_regclass('public.porta_publica') is null then
    raise notice 'PULEI o inventario: este banco nao tem porta_publica (falta a 77).';
    return;
  end if;
  insert into public.porta_publica (funcao, motivo, n) values
    ('eu_hoje(p_token text)',
     'os cultos de hoje em que a pessoa serve e a hora em que ela chegou; para o lider do dia, o time do dia com nome, posto e chegada, sem telefone (107).', 107),
    ('eu_cheguei(p_token text, p_culto uuid, p_chegou boolean)',
     'a pessoa marca que chegou (ou desfaz) pelo proprio link, so no dia do culto e so se tem posto nele; quem nao tinha confirmado fica confirmado (107).', 107),
    ('eu_marcar_chegada(p_token text, p_culto uuid, p_voluntario uuid, p_chegou boolean)',
     'o lider do dia marca quem do time dele chegou, so no dia; a marca nao confirma ninguem por ninguem (107).', 107),
    ('eu_como_foi(p_token text)',
     'os cultos dos ultimos sete dias em que a pessoa serviu e o que ela contou sobre cada um (107).', 107),
    ('eu_como_foi_responder(p_token text, p_culto uuid, p_resposta text, p_texto text)',
     'a pessoa conta como foi servir (bom, puxado ou problema, nota de ate 500 letras), so ate sete dias depois e so onde serviu (107).', 107)
  on conflict (funcao) do update set motivo = excluded.motivo, n = excluded.n;
end $porta$;

-- =========================================================================
-- 8 · conferência
-- =========================================================================
do $conf$
declare
  falhas text[] := '{}';
  r record; v_n int; v_txt text;
  m jsonb := '{}'::jsonb;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_eq uuid; v_eq2 uuid; v_pessoa uuid;
  v_voz uuid; v_baixo uuid; v_lider uuid; v_guitarra uuid; v_teclado uuid; v_camera uuid;
  v_ana uuid; v_ana_m uuid; v_bia uuid; v_caio uuid; v_duda uuid; v_eva uuid; v_fabi uuid; v_gil uuid; v_hugo uuid;
  t_ana text; t_ana_m text; t_bia text; t_caio text; t_duda text; t_eva text; t_fabi text; t_gil text; t_hugo text;
  v_hoje_c uuid; v_ontem uuid; v_velho uuid; v_antigo uuid; v_amanha uuid;
  v_j jsonb; v_t1 text;
begin
  /* 1 · estrutura */
  for r in select * from (values ('presencas'), ('como_foi')) as x(t) loop
    if not exists (select 1 from pg_class where oid = ('public.' || r.t)::regclass and relrowsecurity) then
      falhas := falhas || format('%s sem RLS', r.t); end if;
    if has_table_privilege('anon', 'public.' || r.t, 'select')
       or has_table_privilege('authenticated', 'public.' || r.t, 'select')
       or has_table_privilege('authenticated', 'public.' || r.t, 'insert')
       or has_table_privilege('authenticated', 'public.' || r.t, 'update')
       or has_table_privilege('anon', 'public.' || r.t, 'delete') then
      falhas := falhas || format('%s com grant para anon ou authenticated', r.t); end if;
  end loop;
  for r in select * from (values ('eu_hoje(text)'), ('eu_cheguei(text,uuid,boolean)'),
                                 ('eu_marcar_chegada(text,uuid,uuid,boolean)'), ('eu_como_foi(text)'),
                                 ('eu_como_foi_responder(text,uuid,text,text)')) as x(f) loop
    if not has_function_privilege('anon', 'public.' || r.f, 'execute') then
      falhas := falhas || format('%s sem grant para anon', r.f); end if;
  end loop;
  for r in select * from (values ('presencas_do_dia(uuid,date)'), ('marcar_chegada(uuid,uuid,boolean)'),
                                 ('como_foi_da_equipe(uuid,date,date)'), ('serve_no_culto(uuid,uuid)'),
                                 ('lidera_o_dia(uuid,uuid)'), ('serviu_no_culto(uuid,uuid)')) as x(f) loop
    if has_function_privilege('anon', 'public.' || r.f, 'execute') then
      falhas := falhas || format('%s alcancavel por anon', r.f); end if;
  end loop;
  for r in select * from (values ('serve_no_culto(uuid,uuid)'), ('lidera_o_dia(uuid,uuid)'),
                                 ('serviu_no_culto(uuid,uuid)')) as x(f) loop
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
    insert into equipes (nome, slug, ordem) values ('CONF107 Louvor', 'conf107-louvor', 992) returning id into v_eq;
    insert into equipes (nome, slug, ordem) values ('CONF107 Midia', 'conf107-midia', 993) returning id into v_eq2;
    insert into lideres (email, equipe_id) values ('conf107-lider@exemplo.invalid', v_eq);
    insert into lideres (email, equipe_id) values ('conf107-midia@exemplo.invalid', v_eq2);
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq, 'CONF107 VOZ', 1, true, true, array['domingo','follow']) returning id into v_voz;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq, 'CONF107 BAIXO', 2, true, true, array['domingo','follow']) returning id into v_baixo;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos, relata)
         values (v_eq, 'CONF107 LIDER', 3, true, true, array['domingo','follow'], true) returning id into v_lider;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq, 'CONF107 GUITARRA', 4, true, true, array['domingo','follow']) returning id into v_guitarra;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq, 'CONF107 TECLADO', 5, true, true, array['domingo','follow']) returning id into v_teclado;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq2, 'CONF107 CAMERA', 1, true, true, array['domingo','follow']) returning id into v_camera;

    /* Ana serve no Louvor e na Mídia: dois vínculos, a mesma pessoa */
    insert into pessoas (nome, telefone) values ('Ana Conf Cento Sete', '21900107001') returning id into v_pessoa;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo, pessoa_id)
         values (v_eq, 'Ana Conf Cento Sete', '21900107001', true, 'F', v_pessoa) returning id, token into v_ana, t_ana;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo, pessoa_id)
         values (v_eq2, 'Ana Conf Cento Sete', '21900107001', true, 'F', v_pessoa) returning id, token into v_ana_m, t_ana_m;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Bia Conf Cento Sete', '21900107002', true, 'F') returning id, token into v_bia, t_bia;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Caio Conf Cento Sete', '21900107003', true, 'M') returning id, token into v_caio, t_caio;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Duda Conf Cento Sete', '21900107004', true, 'F') returning id, token into v_duda, t_duda;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Eva Conf Cento Sete', '21900107005', true, 'F') returning id, token into v_eva, t_eva;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Fabi Conf Cento Sete', '21900107006', false, 'F') returning id, token into v_fabi, t_fabi;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq2, 'Gil Conf Cento Sete', '21900107007', true, 'M') returning id, token into v_gil, t_gil;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Hugo Conf Cento Sete', '21900107008', true, 'M') returning id, token into v_hugo, t_hugo;

    /* o culto de hoje (o da programação, se já existe; senão um de teste) e
       eventos do Louvor ontem, há 10 dias, há 40 dias e amanhã */
    select id into v_hoje_c from cultos where data = v_hoje and evento is null;
    if v_hoje_c is null then insert into cultos (data) values (v_hoje) returning id into v_hoje_c; end if;
    insert into cultos (data, evento, equipe_id) values (v_hoje - 1, 'CONF107 ontem', v_eq) returning id into v_ontem;
    insert into cultos (data, evento, equipe_id) values (v_hoje - 10, 'CONF107 velho', v_eq) returning id into v_velho;
    insert into cultos (data, evento, equipe_id) values (v_hoje - 40, 'CONF107 antigo', v_eq) returning id into v_antigo;
    insert into cultos (data, evento, equipe_id) values (v_hoje + 1, 'CONF107 amanha', v_eq) returning id into v_amanha;

    /* hoje: Ana sem responder na VOZ (e na CÂMERA da Mídia), Bia confirmada
       no posto de relato, Caio disse que não pode, Duda sem responder, Eva
       marcada como furo; Gil confirmado na Mídia; Hugo fora da escala */
    insert into escalacoes (culto_id, funcao_id, voluntario_id, status) values
      (v_hoje_c, v_voz, v_ana, 'pendente'),
      (v_hoje_c, v_camera, v_ana_m, 'pendente'),
      (v_hoje_c, v_lider, v_bia, 'confirmado'),
      (v_hoje_c, v_baixo, v_caio, 'recusado'),
      (v_hoje_c, v_guitarra, v_duda, 'pendente'),
      (v_hoje_c, v_teclado, v_eva, 'furou'),
      (v_ontem, v_voz, v_ana, 'confirmado'),
      (v_ontem, v_lider, v_bia, 'confirmado'),
      (v_ontem, v_baixo, v_caio, 'recusado'),
      (v_ontem, v_teclado, v_eva, 'furou'),
      (v_velho, v_voz, v_ana, 'confirmado'),
      (v_antigo, v_voz, v_ana, 'confirmado'),
      (v_amanha, v_voz, v_ana, 'pendente');

    /* o dia, antes de alguém chegar */
    v_j := eu_hoje(t_ana);
    m := m || jsonb_build_object('hoje_ana', format('%s:%s:%s:%s', jsonb_array_length(v_j -> 'cultos'),
           ((v_j -> 'cultos' -> 0 ->> 'chegou_em') is null)::text, v_j -> 'cultos' -> 0 ->> 'relata',
           jsonb_typeof(v_j -> 'cultos' -> 0 -> 'time')));

    /* Ana chega: vale para os dois vínculos, e os dois ficam confirmados */
    v_j := eu_cheguei(t_ana, v_hoje_c, true);
    v_t1 := v_j ->> 'chegou_em';
    m := m || jsonb_build_object('cheguei', format('%s:%s', v_j ->> 'ok', v_j ->> 'confirmou'));
    m := m || jsonb_build_object('ana_status',
           (select string_agg(e.status::text, ',' order by e.status::text) from escalacoes e
             where e.culto_id = v_hoje_c and e.voluntario_id in (v_ana, v_ana_m)));
    m := m || jsonb_build_object('ana_marcas',
           (select count(*) from presencas p where p.culto_id = v_hoje_c and p.voluntario_id in (v_ana, v_ana_m) and p.marcado_por = 'eu'));
    m := m || jsonb_build_object('ana_posso',
           (select string_agg(d.pode::text, ',') from disponibilidade d where d.voluntario_id in (v_ana, v_ana_m) and d.data = v_hoje));
    /* tocar de novo não muda a hora */
    m := m || jsonb_build_object('cheguei_2x', (eu_cheguei(t_ana, v_hoje_c, true) ->> 'chegou_em') = v_t1);
    /* quem disse que não pode, outro dia, link falso */
    m := m || jsonb_build_object('caio_recusou', eu_cheguei(t_caio, v_hoje_c, true) ->> 'erro');
    m := m || jsonb_build_object('ontem', eu_cheguei(t_ana, v_ontem, true) ->> 'erro');
    m := m || jsonb_build_object('amanha', eu_cheguei(t_ana, v_amanha, true) ->> 'erro');
    m := m || jsonb_build_object('fora_da_escala', eu_cheguei(t_hugo, v_hoje_c, true) ->> 'erro');
    /* Eva (furo) chega atrasada: a marca entra, o furo fica para a liderança */
    v_j := eu_cheguei(t_eva, v_hoje_c, true);
    m := m || jsonb_build_object('eva_furou', format('%s:%s', v_j ->> 'ok',
           (select status::text from escalacoes where culto_id = v_hoje_c and voluntario_id = v_eva)));

    /* o líder do dia vê o time do Louvor (sem Caio, que não pode, e sem a Mídia) */
    v_j := eu_hoje(t_bia);
    m := m || jsonb_build_object('bia_relata', v_j -> 'cultos' -> 0 ->> 'relata');
    m := m || jsonb_build_object('bia_time',
           (select string_agg(split_part(x.el ->> 'nome', ' ', 1) || ':' || ((x.el ->> 'chegou_em') is not null)::text, ','
                              order by x.n)
              from jsonb_array_elements(v_j -> 'cultos' -> 0 -> 'time') with ordinality as x(el, n)));
    m := m || jsonb_build_object('ana_sem_time', jsonb_typeof(eu_hoje(t_ana) -> 'cultos' -> 0 -> 'time'));
    /* e marca a Duda, sem confirmar por ela */
    v_j := eu_marcar_chegada(t_bia, v_hoje_c, v_duda, true);
    m := m || jsonb_build_object('bia_marca', format('%s:%s', v_j ->> 'ok', v_j ->> 'marcado_por'));
    m := m || jsonb_build_object('duda_status', (select status::text from escalacoes where culto_id = v_hoje_c and voluntario_id = v_duda));
    m := m || jsonb_build_object('ana_marca', eu_marcar_chegada(t_ana, v_hoje_c, v_duda, true) ->> 'erro');
    /* a Ana da Mídia está no culto, mas não no time do Louvor */
    m := m || jsonb_build_object('bia_marca_midia', eu_marcar_chegada(t_bia, v_hoje_c, v_ana_m, true) ->> 'erro');
    m := m || jsonb_build_object('bia_marca_fora', eu_marcar_chegada(t_bia, v_hoje_c, v_gil, true) ->> 'erro');
    m := m || jsonb_build_object('bia_marca_caio', eu_marcar_chegada(t_bia, v_hoje_c, v_caio, true) ->> 'erro');
    m := m || jsonb_build_object('bia_ontem', eu_marcar_chegada(t_bia, v_ontem, v_ana, true) ->> 'erro');

    /* a liderança do Louvor vê três marcas (a da Ana na Mídia é da Mídia) */
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf107-lider@exemplo.invalid","role":"authenticated"}', true);
    m := m || jsonb_build_object('lider_ve', (select count(*) from presencas_do_dia(v_eq, v_hoje)));
    m := m || jsonb_build_object('lider_marca_caio', marcar_chegada(v_hoje_c, v_caio, true) ->> 'marcado_por');
    m := m || jsonb_build_object('lider_amanha', marcar_chegada(v_amanha, v_ana, true) ->> 'erro');
    m := m || jsonb_build_object('lider_antigo', marcar_chegada(v_antigo, v_ana, true) ->> 'erro');
    m := m || jsonb_build_object('lider_ontem', marcar_chegada(v_ontem, v_ana, true) ->> 'marcado_por');
    m := m || jsonb_build_object('lider_sem_posto', marcar_chegada(v_hoje_c, v_hugo, true) ->> 'erro');
    m := m || jsonb_build_object('lider_tira_ontem', coalesce(marcar_chegada(v_ontem, v_ana, false) ->> 'chegou_em', 'tirou'));
    /* a da Mídia vê a dela e não vê nem marca a do Louvor */
    perform set_config('request.jwt.claims', '{"email":"conf107-midia@exemplo.invalid","role":"authenticated"}', true);
    m := m || jsonb_build_object('midia_ve', (select count(*) from presencas_do_dia(v_eq2, v_hoje)));
    m := m || jsonb_build_object('alheia_ve', (select count(*) from presencas_do_dia(v_eq, v_hoje)));
    m := m || jsonb_build_object('alheia_marca', marcar_chegada(v_hoje_c, v_duda, false) ->> 'erro');
    reset role;

    /* o líder do dia desmarca a Duda; Ana desfaz a própria chegada (as duas
       marcas somem, a confirmação fica) */
    m := m || jsonb_build_object('bia_desmarca', coalesce(eu_marcar_chegada(t_bia, v_hoje_c, v_duda, false) ->> 'chegou_em', 'tirou'));
    perform eu_cheguei(t_ana, v_hoje_c, false);
    m := m || jsonb_build_object('ana_desfaz', format('%s:%s',
           (select count(*) from presencas p where p.culto_id = v_hoje_c and p.voluntario_id in (v_ana, v_ana_m)),
           (select string_agg(distinct e.status::text, ',') from escalacoes e
             where e.culto_id = v_hoje_c and e.voluntario_id in (v_ana, v_ana_m))));

    /* como foi: os cultos em que a Ana serviu nos últimos 7 dias (hoje e ontem) */
    m := m || jsonb_build_object('ana_lista', (select string_agg(x.data::text, ',' order by x.data desc) from eu_como_foi(t_ana) x));
    m := m || jsonb_build_object('ana_lista_ok', (select string_agg(x.data::text, ',' order by x.data desc) from eu_como_foi(t_ana) x)
                                                  = format('%s,%s', v_hoje, v_hoje - 1));
    v_j := eu_como_foi_responder(t_ana, v_ontem, 'puxado', E'  muito\x01   cansada \n\n\n\n hoje  ');
    m := m || jsonb_build_object('conta', format('%s:%s', v_j ->> 'resposta', replace(v_j ->> 'texto', E'\n', '|')));
    perform eu_como_foi_responder(t_ana, v_ontem, 'bom', null);
    m := m || jsonb_build_object('conta_de_novo',
           (select format('%s:%s:%s', count(*), max(resposta), coalesce(max(texto), 'null')) from como_foi
             where culto_id = v_ontem and voluntario_id = v_ana));
    m := m || jsonb_build_object('caio_nao_serviu', eu_como_foi_responder(t_caio, v_ontem, 'bom', null) ->> 'erro');
    m := m || jsonb_build_object('eva_furou_ontem', eu_como_foi_responder(t_eva, v_ontem, 'bom', null) ->> 'erro');
    m := m || jsonb_build_object('resposta_ruim', eu_como_foi_responder(t_ana, v_ontem, 'otimo', null) ->> 'erro');
    m := m || jsonb_build_object('texto_longo', eu_como_foi_responder(t_ana, v_ontem, 'bom', repeat('a', 501)) ->> 'erro');
    m := m || jsonb_build_object('velho', eu_como_foi_responder(t_ana, v_velho, 'bom', null) ->> 'erro');
    m := m || jsonb_build_object('amanha_cf', eu_como_foi_responder(t_ana, v_amanha, 'bom', null) ->> 'erro');

    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf107-lider@exemplo.invalid","role":"authenticated"}', true);
    m := m || jsonb_build_object('lider_le',
           (select string_agg(split_part(x.nome, ' ', 1) || ':' || x.resposta || ':' || array_to_string(x.funcoes, '+'), ',')
              from como_foi_da_equipe(v_eq, v_hoje - 7, v_hoje) x));
    m := m || jsonb_build_object('janela_grande', (select count(*) from como_foi_da_equipe(v_eq, v_hoje - 100, v_hoje)));
    perform set_config('request.jwt.claims', '{"email":"conf107-midia@exemplo.invalid","role":"authenticated"}', true);
    m := m || jsonb_build_object('alheia_le', (select count(*) from como_foi_da_equipe(v_eq, v_hoje - 7, v_hoje)));
    reset role;

    perform eu_como_foi_responder(t_ana, v_ontem, null, null);
    m := m || jsonb_build_object('apaga', (select count(*) from como_foi where voluntario_id = v_ana));

    /* inativa e link falso */
    begin
      perform eu_hoje(t_fabi);
      m := m || jsonb_build_object('inativa', 'viu');
    exception when others then m := m || jsonb_build_object('inativa', sqlerrm);
    end;
    begin
      perform eu_cheguei('nao-existe-' || md5(random()::text), v_hoje_c, true);
      m := m || jsonb_build_object('token_falso', 'passou');
    exception when others then m := m || jsonb_build_object('token_falso', sqlerrm);
    end;
    begin
      perform * from eu_como_foi('nao-existe-' || md5(random()::text));
      m := m || jsonb_build_object('token_falso_cf', 'passou');
    exception when others then m := m || jsonb_build_object('token_falso_cf', sqlerrm);
    end;

    raise exception 'CONF107_DESFAZ';
  exception when others then
    if sqlerrm <> 'CONF107_DESFAZ' then
      falhas := falhas || ('o cenario nao montou: ' || sqlerrm)::text;
    end if;
  end;
  reset role;

  for r in select * from (values
      ('hoje_ana',          '1:true:false:null'),
      ('cheguei',           'true:2'),
      ('ana_status',        'confirmado,confirmado'),
      ('ana_marcas',        '2'),
      ('ana_posso',         'true,true'),
      ('cheguei_2x',        'true'),
      ('caio_recusou',      'SEM_POSTO'),
      ('ontem',             'FORA_DO_DIA'),
      ('amanha',            'FORA_DO_DIA'),
      ('fora_da_escala',    'SEM_POSTO'),
      ('eva_furou',         'true:furou'),
      ('bia_relata',        'true'),
      ('bia_time',          'Ana:true,Bia:false,Duda:false,Eva:true'),
      ('ana_sem_time',      'null'),
      ('bia_marca',         'true:lider_do_dia'),
      ('duda_status',       'pendente'),
      ('ana_marca',         'SEM_PERMISSAO'),
      ('bia_marca_midia',   'NAO_E_DO_TIME'),
      ('bia_marca_fora',    'NAO_E_DO_TIME'),
      ('bia_marca_caio',    'NAO_E_DO_TIME'),
      ('bia_ontem',         'FORA_DO_DIA'),
      ('lider_ve',          '3'),
      ('lider_marca_caio',  'lideranca'),
      ('lider_amanha',      'AINDA_NAO'),
      ('lider_antigo',      'MUITO_ANTIGO'),
      ('lider_ontem',       'lideranca'),
      ('lider_sem_posto',   'SEM_POSTO'),
      ('lider_tira_ontem',  'tirou'),
      ('midia_ve',          '1'),
      ('alheia_ve',         '0'),
      ('alheia_marca',      'SEM_PERMISSAO'),
      ('bia_desmarca',      'tirou'),
      ('ana_desfaz',        '0:confirmado'),
      ('ana_lista_ok',      'true'),
      ('conta',             'puxado:muito cansada||hoje'),
      ('conta_de_novo',     '1:bom:null'),
      ('caio_nao_serviu',   'NAO_SERVIU'),
      ('eva_furou_ontem',   'NAO_SERVIU'),
      ('resposta_ruim',     'RESPOSTA_INVALIDA'),
      ('texto_longo',       'TEXTO_LONGO'),
      ('velho',             'FORA_DA_JANELA'),
      ('amanha_cf',         'FORA_DA_JANELA'),
      ('lider_le',          'Ana:bom:CONF107 VOZ'),
      ('janela_grande',     '0'),
      ('alheia_le',         '0'),
      ('apaga',             '0'),
      ('inativa',           'Link invalido'),
      ('token_falso',       'Link invalido'),
      ('token_falso_cf',    'Link invalido')
    ) as x(chave, esperado)
  loop
    if (m ->> r.chave) is distinct from r.esperado then
      falhas := falhas || format('%s: obtido %s, esperado %s', r.chave, coalesce(m ->> r.chave, '(nada)'), r.esperado);
    end if;
  end loop;

  if exists (select 1 from equipes where slug like 'conf107-%')
     or exists (select 1 from voluntarios where nome like '% Conf Cento Sete')
     or exists (select 1 from pessoas where nome like '% Conf Cento Sete')
     or exists (select 1 from lideres where email like 'conf107%@exemplo.invalid') then
    falhas := falhas || 'o cenario de teste ficou no banco'::text; end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'107 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  select count(*) into v_n from jsonb_object_keys(m);
  raise notice 'OK 107 · conferencia: % medidas de chegada e de como foi, todas como esperado. Cenario desfeito.', v_n;
end $conf$;

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (107, '107 · cheguei so no dia do culto', 'eu_cheguei', 'FORA_DO_DIA'),
      (107, '107 · cheguei so quem tem posto', 'eu_cheguei', 'serve_no_culto'),
      (107, '107 · o lider do dia so marca o time dele', 'eu_marcar_chegada', 'NAO_E_DO_TIME'),
      (107, '107 · o time do dia so para quem lidera o dia', 'eu_hoje', 'if r.relata then'),
      (107, '107 · so a lideranca le o como foi', 'como_foi_da_equipe', 'lidera_equipe'),
      (107, '107 · a nota do como foi tem teto', 'eu_como_foi_responder', 'TEXTO_LONGO')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (107, '107-cheguei-e-como-foi.sql')
  on conflict (n) do nothing;

commit;

/* o que o editor mostra: só números */
select '107' as versao,
       (select count(*) from presencas) as presencas,
       (select count(*) from porta_publica where n = 107) as portas_novas,
       (select count(*) from testar_porta_publica() where not passou) as porta_reprovada,
       (select count(*) from schema_versao_conferir() where not passou) as sondas_reprovadas,
       (select count(*) from schema_versao_conferir()) as sondas;
