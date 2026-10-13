/* =============================================================================
   113 · A LIDERANÇA DISTRIBUI OS POSTOS (A TROCA E O CHAMADO, NO BANCO)

   13/10/2026. Só de Escalas. O pedido do Connect, pelo Arthur:

     "Hoje cada voluntário escolhe e marca no sistema o local onde quer
     servir, e isso tem nos deixado sem flexibilidade para montar a escala,
     pois alguns setores ficam sem voluntário ou entendemos que tal posição
     necessita de outra pessoa, e não a que se inscreveu."

   O QUE JÁ ESTÁ NO CÓDIGO (não depende desta migração): Ajustes > Quem
   escolhe o posto grava `config.dados.distribuir` e `config.dados.
   postosFechados`. Ligado, o sorteio põe primeiro quem marcou o posto e
   completa o vazio com quem estiver livre, e a lista do posto na Escala
   mostra o time inteiro (`nivelNoSorteio`, lib/engine.ts).

   O QUE ESTA MIGRAÇÃO LEVA AO BANCO, que tem a mesma pergunta em outro lugar:
     1 · `posto_distribuido(funcao)` (interna): 'aberto', 'fechado' ou nulo
         (o ministério não distribui). Lê o mesmo config que a tela grava.
     2 · `troca_impede`, a regra da troca (103) e do chamado (106):
           de sempre ............ quem marcou o posto (titular ou reserva);
           posto aberto ......... qualquer um do time, menos quem está
                                  aprendendo NESTE posto;
           posto fechado ........ só quem a liderança marcou (habilidade
                                  conferida).
         As outras regras (sexo do posto, não posso, já escalado no dia)
         ficam como estavam.
     3 · `chamar_candidatos` e `eu_troca_candidatos`: a lista deixa de exigir
         a habilidade (left join), e `troca_impede` decide quem entra. A
         ordem: primeiro quem disse que pode no dia (como sempre: é quem
         aceita uma vaga em cima da hora, e é o que `quemPodeCobrir` faz no
         motor), depois quem marcou o posto antes de quem não marcou.
     4 · `chamar_para_cobrir`: sai a segunda conferência de habilidade. Ela
         repetia a de `troca_impede` palavra por palavra no modo de sempre, e
         no da liderança recusaria quem não marcou.
     5 · `equipe_distribui(slug)` (porta pública): sim ou não, para o
         cadastro dizer que o que a pessoa marca é preferência.

   FICA COMO ESTÁ, DE PROPÓSITO: `eu_quem_cobre` (quem desmarca em cima da
   hora vê quem pode cobrir, COM TELEFONE). Abrir para o time inteiro seria
   entregar o telefone de todo mundo a cada desmarcação (a 76 fechou
   exatamente esse caminho). Continua mostrando quem marcou o posto.

   FORA DO MODO DA LIDERANÇA, NADA MUDA: `troca_impede` cai no ramo de sempre,
   e nas duas listas toda linha tem habilidade (é o que `troca_impede` exige),
   então o left join e a ordem nova devolvem o mesmo de antes. A conferência
   abaixo mede os dois modos lado a lado.

   SÓ MEXE NO QUE CONHECE: cada função trocada confere antes o md5 do corpo
   atual. Corpo diferente do que o repositório tem (antes ou depois desta
   migração) aborta tudo. Rodar duas vezes não estraga nada.

   SEM `create temp table` (101). O EDITOR DO SUPABASE NÃO MOSTRA NOTICE: a
   última linha é um select com o resultado.

   ORDEM:  ... 111 → 112 → 113
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(113);
  end if;
  /* rodada antes da 112, a régua pularia e recusaria a 112 depois */
  if to_regclass('public.schema_versao') is not null
     and not exists (select 1 from public.schema_versao where n = 112) then
    raise exception 'FALTA A 112: rode antes a 112 (o som da transmissao). Nada foi mudado.';
  end if;
end $tranca$;

begin;

-- =========================================================================
-- 0 · cada corpo que esta migração troca é o do repositório (antes ou depois)
-- =========================================================================
do $antes$
declare
  r record; v_md5 text;
begin
  for r in
    select * from (values
      /* a terceira coluna é a primeira versão desta 113 (13/10, antes da
         auditoria): quem já rodou aquela roda esta por cima sem parar */
      ('troca_impede(uuid,uuid,uuid)',            'd9d45c7e66c75b8b913418dec5dde14c', '4a46ee95e6aa9c5264110c42aed7edd3', '4a46ee95e6aa9c5264110c42aed7edd3'),
      ('eu_troca_candidatos(text,uuid,uuid)',     '10f05db97320bb74ec5eea81ff78bf5a', 'e8cf56fcd6e91eeb53248f88edc0e036', 'e8cf56fcd6e91eeb53248f88edc0e036'),
      ('chamar_candidatos(uuid,uuid)',            '111f926f30cc65f7ace0df8432dfb588', '0ce310d489fb3d3e3fea2933935567f5', '824afea678d4a141c4906881d4a95e51'),
      ('chamar_para_cobrir(uuid,uuid,uuid[])',    'ff2e56c5e06d6b61872806def98d8fe4', '71a430f814659eba1850078cdf8a5c38', '71a430f814659eba1850078cdf8a5c38')
    ) as x(assinatura, antes, depois, primeira)
  loop
    select md5(prosrc) into v_md5 from pg_proc where oid = to_regprocedure('public.' || r.assinatura);
    if v_md5 is null then
      raise exception '113 PAROU: %() nao existe neste banco', r.assinatura;
    elsif v_md5 not in (r.antes, r.depois, r.primeira) then
      raise exception E'113 PAROU: o corpo de %() neste banco nao e o do repositorio (md5 %).\n'
        '  Esta migracao troca corpos inteiros e nao vai adivinhar. Compare com scripts/impressao-digital.sql.',
        r.assinatura, v_md5;
    end if;
  end loop;
end $antes$;

-- =========================================================================
-- 1 · o modo do posto, lido do config do ministério
-- =========================================================================
create or replace function public.posto_distribuido(p_funcao uuid)
returns text
language sql stable security definer set search_path = public as $fn$
  /* nulo = o ministério não distribui (cada um entra só onde marcou);
     'fechado' = está em postosFechados, pelo id ou pelo nome (a tela grava
     o id; o nome é a linha antiga); 'aberto' = o resto */
  select case
           when coalesce(cf.dados ->> 'distribuir', '') <> 'true' then null
           when jsonb_typeof(cf.dados -> 'postosFechados') = 'array'
                and ((cf.dados -> 'postosFechados') ? f.id::text
                     or (cf.dados -> 'postosFechados') ? f.nome) then 'fechado'
           else 'aberto'
         end
    from funcoes f
    left join config cf on cf.equipe_id = f.equipe_id
   where f.id = p_funcao;
$fn$;
revoke all on function public.posto_distribuido(uuid) from public, anon, authenticated;
comment on function public.posto_distribuido(uuid) is
  '113: como o ministerio deste posto escolhe quem entra. Nulo = cada um so onde marcou; aberto = a lideranca distribui e o time inteiro pode; fechado = so quem a lideranca marcou (habilidade conferida). Interna: troca_impede chama.';

-- =========================================================================
-- 2 · a regra da troca e do chamado
-- =========================================================================
create or replace function troca_impede(p_para uuid, p_culto uuid, p_funcao uuid)
returns text
language sql stable security definer set search_path = public as $fn$
  select case
    when c.id is null then 'CULTO'
    when v.id is null or not v.ativo then 'INATIVO'
    when f.id is null or not f.ativa or f.equipe_id is distinct from v.equipe_id then 'OUTRA_AREA'
    /* 113 · QUEM FAZ O POSTO, PELA REGRA DO MINISTÉRIO (`nivelNoSorteio`
       no motor). Posto aberto: qualquer um do time, menos quem está
       aprendendo nele. Fechado: só quem a liderança marcou. De sempre: quem
       marcou o posto, titular ou reserva. */
    when case posto_distribuido(f.id)
           when 'aberto' then exists (select 1 from habilidades h
                                       where h.voluntario_id = v.id and h.funcao_id = f.id
                                         and h.nivel = 'treino')
           when 'fechado' then not exists (select 1 from habilidades h
                                            where h.voluntario_id = v.id and h.funcao_id = f.id
                                              and h.nivel in ('titular','reserva') and h.confirmado)
           else not exists (select 1 from habilidades h
                             where h.voluntario_id = v.id and h.funcao_id = f.id
                               and h.nivel in ('titular','reserva'))
         end then 'NAO_FAZ'
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
  'Por que esta pessoa NAO pode receber esta vaga por troca ou chamado (nulo = pode). As regras do sorteio e dos gatilhos de escalacoes (103), com o modo do ministerio (113: posto_distribuido). Interna: so as funcoes eu_troca_*, chamar_* e eu_chamada* chamam.';

-- =========================================================================
-- 3 · as duas listas: quem marcou vem antes, e quem não marcou pode entrar
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

  /* 113 · left join: no posto que a liderança distribui, quem não marcou
     também pode receber (nivel nulo). Quem entra é `troca_impede` que diz;
     no modo de sempre toda linha daqui tem habilidade, como antes. */
  return query
  select o.id, o.nome, h.nivel::text,
         exists (select 1 from disponibilidade d
                  where d.voluntario_id = o.id and d.data = v_data and d.pode),
         exists (select 1 from trocas t
                  where t.culto_id = p_culto_id and t.funcao_id = p_funcao_id
                    and t.de_voluntario = v_id and t.para_voluntario = o.id
                    and t.status = 'aberta')
    from voluntarios o
    left join habilidades h on h.voluntario_id = o.id and h.funcao_id = p_funcao_id
   where o.equipe_id = v_eq and o.id <> v_id
     and troca_impede(o.id, p_culto_id, p_funcao_id) is null
   order by 4 desc, (h.voluntario_id is not null) desc, coalesce(h.nivel = 'titular', false) desc, o.nome
   limit 12;
end $fn$;
revoke all on function eu_troca_candidatos(text, uuid, uuid) from public;
grant execute on function eu_troca_candidatos(text, uuid, uuid) to anon, authenticated;

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

  /* 113 · left join: quem não marcou também entra (nivel nulo). A ordem:
     quem disse que pode no dia, depois quem marcou o posto, depois quem
     serviu menos no mês. Ver `eu_troca_candidatos`. */
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
    left join habilidades h on h.voluntario_id = o.id and h.funcao_id = p_funcao
   where o.equipe_id = v_eq
     and troca_impede(o.id, p_culto, p_funcao) is null
   order by 4 desc, (h.voluntario_id is not null) desc, 5 asc, coalesce(h.nivel = 'titular', false) desc, o.nome
   limit 60;
end $fn$;
revoke all on function public.chamar_candidatos(uuid, uuid) from public, anon;
grant execute on function public.chamar_candidatos(uuid, uuid) to authenticated;

-- =========================================================================
-- 4 · chamar: a regra é uma só, a de `troca_impede`
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
    /* 113 · só `troca_impede`: ela já recusa quem não faz o posto (NAO_FAZ),
       pela regra do ministério. A segunda conferência que estava aqui exigia
       habilidade de novo e recusaria quem a liderança chamou para um posto
       que ela distribui. */
    v_motivo := troca_impede(v_id, p_culto, p_funcao);
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
-- 5 · a porta pública: o ministério distribui?
-- =========================================================================
create or replace function public.equipe_distribui(p_slug text)
returns boolean
language sql stable security definer set search_path = public as $fn$
  /* só o sim ou não: nada do resto do config sai por aqui */
  select coalesce((select coalesce(cf.dados ->> 'distribuir', '') = 'true'
                     from equipes e join config cf on cf.equipe_id = e.id
                    where e.slug = p_slug), false);
$fn$;
revoke all on function public.equipe_distribui(text) from public;
grant execute on function public.equipe_distribui(text) to anon, authenticated;
comment on function public.equipe_distribui(text) is
  '113: se a lideranca deste ministerio distribui os postos (Ajustes > Quem escolhe o posto). O cadastro usa para dizer que o que a pessoa marca e preferencia.';

do $porta$ begin
  if to_regclass('public.porta_publica') is null then
    raise notice 'PULEI o inventario: este banco nao tem porta_publica (falta a 77).';
    return;
  end if;
  insert into public.porta_publica (funcao, motivo, n) values
    ('equipe_distribui(p_slug text)',
     'se a lideranca do ministerio distribui os postos: o cadastro diz que o que a pessoa marca e preferencia. So um sim ou nao do config, nada mais (113).', 113)
  on conflict (funcao) do update set motivo = excluded.motivo, n = excluded.n;
end $porta$;

-- =========================================================================
-- 6 · conferência
-- =========================================================================
do $conf$
declare
  falhas text[] := '{}';
  r record; v_n int; v_txt text;
  m jsonb := '{}'::jsonb;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dia date;
  v_eq uuid; v_eq2 uuid;
  v_setor uuid; v_lider uuid; v_estac uuid; v_setor2 uuid; v_lider2 uuid;
  v_zara uuid; v_bia uuid; v_caio uuid; v_duda uuid; v_eva uuid; v_fabi uuid; v_gil uuid;
  v_zara2 uuid; v_bia2 uuid; v_duda2 uuid; v_hugo2 uuid;
  t_gil text; t_bia text; t_hugo2 text;
  v_culto uuid; v_j jsonb; v_ch uuid;
begin
  /* 1 · estrutura */
  if has_function_privilege('anon', 'public.posto_distribuido(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.posto_distribuido(uuid)', 'execute') then
    falhas := falhas || 'posto_distribuido alcancavel de fora'::text; end if;
  if has_function_privilege('anon', 'public.troca_impede(uuid,uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.troca_impede(uuid,uuid,uuid)', 'execute') then
    falhas := falhas || 'troca_impede alcancavel de fora'::text; end if;
  if not has_function_privilege('anon', 'public.equipe_distribui(text)', 'execute') then
    falhas := falhas || 'equipe_distribui sem grant para anon'::text; end if;
  if has_function_privilege('anon', 'public.chamar_candidatos(uuid,uuid)', 'execute')
     or has_function_privilege('anon', 'public.chamar_para_cobrir(uuid,uuid,uuid[])', 'execute') then
    falhas := falhas || 'chamar_* alcancavel por anon'::text; end if;
  if to_regprocedure('public.testar_porta_publica()') is not null then
    select count(*), string_agg(t.caso || ' (' || t.obtido || ')', '; ') into v_n, v_txt
      from public.testar_porta_publica() t where not t.passou;
    if v_n > 0 then falhas := falhas || format('porta publica reprovou: %s', v_txt); end if;
  end if;

  /* 2 · dois ministérios de teste, um que distribui e um de sempre (desfeito
     no fim). No primeiro: SETOR aberto, LIDER fechado, ESTAC aberto e de
     homens. Zara marcou SETOR sozinha; Bia e Caio não marcaram nada; Duda
     marcou LIDER sozinha; a liderança marcou a Eva em LIDER; Fabi está
     aprendendo SETOR; Gil estava no SETOR do domingo e avisou que não pode. */
  begin
    v_dia := v_hoje + 8;
    while extract(dow from v_dia) <> 0 loop v_dia := v_dia + 1; end loop;
    insert into equipes (nome, slug, ordem) values ('CONF113 Distribui', 'conf113-distribui', 996) returning id into v_eq;
    insert into equipes (nome, slug, ordem) values ('CONF113 Sempre', 'conf113-sempre', 997) returning id into v_eq2;
    insert into lideres (email, equipe_id) values ('conf113-lider@exemplo.invalid', v_eq);
    insert into lideres (email, equipe_id) values ('conf113-sempre@exemplo.invalid', v_eq2);
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq, 'CONF113 SETOR', 1, true, true, array['domingo','follow']) returning id into v_setor;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq, 'CONF113 LIDER', 2, true, true, array['domingo','follow']) returning id into v_lider;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos, exige_sexo)
         values (v_eq, 'CONF113 ESTAC', 3, true, true, array['domingo','follow'], 'M') returning id into v_estac;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq2, 'CONF113 SETOR2', 1, true, true, array['domingo','follow']) returning id into v_setor2;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq2, 'CONF113 LIDER2', 2, true, true, array['domingo','follow']) returning id into v_lider2;
    /* o que a tela de Ajustes grava (a linha nasce pelo gatilho da equipe) */
    update config set dados = dados || jsonb_build_object('distribuir', true, 'postosFechados', jsonb_build_array(v_lider::text))
     where equipe_id = v_eq;

    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Zara Conf Cento Treze', '21900113001', true, 'F') returning id into v_zara;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Bia Conf Cento Treze', '21900113002', true, 'F') returning id, token into v_bia, t_bia;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Caio Conf Cento Treze', '21900113003', true, 'M') returning id into v_caio;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Duda Conf Cento Treze', '21900113004', true, 'F') returning id into v_duda;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Eva Conf Cento Treze', '21900113005', true, 'F') returning id into v_eva;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Fabi Conf Cento Treze', '21900113006', true, 'F') returning id into v_fabi;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq, 'Gil Conf Cento Treze', '21900113007', true, 'M') returning id, token into v_gil, t_gil;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq2, 'Zara Dois Conf Cento Treze', '21900113011', true, 'F') returning id into v_zara2;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq2, 'Bia Dois Conf Cento Treze', '21900113012', true, 'F') returning id into v_bia2;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq2, 'Duda Dois Conf Cento Treze', '21900113014', true, 'F') returning id into v_duda2;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo) values (v_eq2, 'Hugo Dois Conf Cento Treze', '21900113018', true, 'M') returning id, token into v_hugo2, t_hugo2;
    insert into habilidades (voluntario_id, funcao_id, nivel, confirmado) values
      (v_zara, v_setor, 'reserva', false), (v_duda, v_lider, 'reserva', false),
      (v_eva, v_lider, 'titular', true), (v_fabi, v_setor, 'treino', true),
      (v_zara2, v_setor2, 'reserva', false), (v_duda2, v_lider2, 'reserva', false),
      (v_hugo2, v_setor2, 'titular', true);

    select id into v_culto from cultos where data = v_dia and evento is null;
    if v_culto is null then insert into cultos (data) values (v_dia) returning id into v_culto; end if;
    insert into escalacoes (culto_id, funcao_id, voluntario_id, status) values
      (v_culto, v_setor, v_gil, 'recusado'),
      (v_culto, v_setor2, v_hugo2, 'pendente');

    /* a regra, pessoa por pessoa (nulo = pode) */
    m := m || jsonb_build_object('modo', format('%s,%s,%s,%s',
           coalesce(posto_distribuido(v_setor), '-'), coalesce(posto_distribuido(v_lider), '-'),
           coalesce(posto_distribuido(v_estac), '-'), coalesce(posto_distribuido(v_setor2), '-')));
    m := m || jsonb_build_object('distribui', format('%s,%s,%s',
           equipe_distribui('conf113-distribui'), equipe_distribui('conf113-sempre'), equipe_distribui('conf113-nao-existe')));
    m := m || jsonb_build_object('impede', format('%s,%s,%s,%s,%s,%s,%s,%s',
           coalesce(troca_impede(v_bia,  v_culto, v_setor), '-'),
           coalesce(troca_impede(v_zara, v_culto, v_setor), '-'),
           coalesce(troca_impede(v_fabi, v_culto, v_setor), '-'),
           coalesce(troca_impede(v_bia,  v_culto, v_lider), '-'),
           coalesce(troca_impede(v_duda, v_culto, v_lider), '-'),
           coalesce(troca_impede(v_eva,  v_culto, v_lider), '-'),
           coalesce(troca_impede(v_bia,  v_culto, v_estac), '-'),
           coalesce(troca_impede(v_caio, v_culto, v_estac), '-')));
    m := m || jsonb_build_object('impede_sempre', format('%s,%s,%s',
           coalesce(troca_impede(v_bia2,  v_culto, v_setor2), '-'),
           coalesce(troca_impede(v_zara2, v_culto, v_setor2), '-'),
           coalesce(troca_impede(v_duda2, v_culto, v_lider2), '-')));

    /* a troca pedida pelo Gil (no SETOR do domingo): quem marcou na frente */
    m := m || jsonb_build_object('troca',
           (select string_agg(split_part(nome, ' ', 1) || ':' || coalesce(nivel, '-'), ',')
              from eu_troca_candidatos(t_gil, v_culto, v_setor)));
    m := m || jsonb_build_object('troca_sempre',
           (select string_agg(split_part(nome, ' ', 1) || ':' || coalesce(nivel, '-'), ',')
              from eu_troca_candidatos(t_hugo2, v_culto, v_setor2)));

    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf113-lider@exemplo.invalid","role":"authenticated"}', true);
    m := m || jsonb_build_object('chamar',
           (select string_agg(split_part(nome, ' ', 1) || ':' || coalesce(nivel, '-'), ',')
              from chamar_candidatos(v_culto, v_setor)));
    m := m || jsonb_build_object('chamar_lider',
           (select string_agg(split_part(nome, ' ', 1) || ':' || coalesce(nivel, '-'), ',')
              from chamar_candidatos(v_culto, v_lider)));
    v_j := chamar_para_cobrir(v_culto, v_lider, array[v_duda, v_bia]);
    m := m || jsonb_build_object('chamou_lider', format('%s:%s', jsonb_array_length(v_j -> 'chamadas'),
           (select string_agg(x ->> 'motivo', ',' order by x ->> 'motivo') from jsonb_array_elements(v_j -> 'recusados') x)));
    v_j := chamar_para_cobrir(v_culto, v_setor, array[v_bia, v_fabi]);
    m := m || jsonb_build_object('chamou', format('%s:%s', jsonb_array_length(v_j -> 'chamadas'),
           (select string_agg(x ->> 'motivo', ',' order by x ->> 'motivo') from jsonb_array_elements(v_j -> 'recusados') x)));
    perform set_config('request.jwt.claims', '{"email":"conf113-sempre@exemplo.invalid","role":"authenticated"}', true);
    m := m || jsonb_build_object('chamar_sempre',
           (select string_agg(split_part(nome, ' ', 1) || ':' || coalesce(nivel, '-'), ',')
              from chamar_candidatos(v_culto, v_lider2)));
    v_j := chamar_para_cobrir(v_culto, v_lider2, array[v_bia2]);
    m := m || jsonb_build_object('chamou_sempre', format('%s:%s', jsonb_array_length(v_j -> 'chamadas'),
           (select string_agg(x ->> 'motivo', ',' order by x ->> 'motivo') from jsonb_array_elements(v_j -> 'recusados') x)));
    reset role;

    /* a Bia, que não marcou nada, aceita e fica com o SETOR, confirmada */
    select id into v_ch from chamadas where voluntario_id = v_bia and culto_id = v_culto and status = 'aberta';
    v_j := eu_chamada_responder(t_bia, v_ch, true);
    m := m || jsonb_build_object('aceita', coalesce(v_j ->> 'status', v_j::text));
    m := m || jsonb_build_object('vaga',
           (select split_part(v.nome, ' ', 1) || ':' || e.status from escalacoes e join voluntarios v on v.id = e.voluntario_id
             where e.culto_id = v_culto and e.funcao_id = v_setor));

    raise exception 'CONF113_DESFAZ';
  exception when others then
    if sqlerrm <> 'CONF113_DESFAZ' then
      falhas := falhas || ('o cenario nao montou: ' || sqlerrm)::text;
    end if;
  end;
  reset role;

  for r in select * from (values
      ('modo',           'aberto,fechado,aberto,-'),
      ('distribui',      't,f,f'),
      /* aberto: Bia pode, Zara pode, Fabi (aprendendo) não; fechado: Bia e
         Duda (marcou sozinha) não, Eva (a liderança marcou) pode; o posto
         de homens: Bia não pelo sexo, Caio pode */
      ('impede',         '-,-,NAO_FAZ,NAO_FAZ,NAO_FAZ,-,SEXO,-'),
      /* de sempre: quem não marcou não faz; quem marcou sozinha faz */
      ('impede_sempre',  'NAO_FAZ,-,-'),
      /* a Zara marcou o SETOR e vem antes, mesmo sendo a última no nome;
         Fabi (aprendendo) e Gil (ele mesmo) fora; Duda e Eva não marcaram
         o SETOR e entram */
      ('troca',          'Zara:reserva,Bia:-,Caio:-,Duda:-,Eva:-'),
      ('troca_sempre',   'Zara:reserva'),
      ('chamar',         'Zara:reserva,Bia:-,Caio:-,Duda:-,Eva:-'),
      ('chamar_lider',   'Eva:titular'),
      ('chamou_lider',   '0:NAO_FAZ,NAO_FAZ'),
      ('chamou',         '1:NAO_FAZ'),
      ('chamar_sempre',  'Duda:reserva'),
      ('chamou_sempre',  '0:NAO_FAZ'),
      ('aceita',         'aceita'),
      ('vaga',           'Bia:confirmado')
    ) as x(chave, esperado)
  loop
    if (m ->> r.chave) is distinct from r.esperado then
      falhas := falhas || format('%s: obtido %s, esperado %s', r.chave, coalesce(m ->> r.chave, '(nada)'), r.esperado);
    end if;
  end loop;

  if exists (select 1 from equipes where slug like 'conf113-%')
     or exists (select 1 from voluntarios where nome like '% Conf Cento Treze')
     or exists (select 1 from lideres where email like 'conf113%@exemplo.invalid') then
    falhas := falhas || 'o cenario de teste ficou no banco'::text; end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'113 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  select count(*) into v_n from jsonb_object_keys(m);
  raise notice 'OK 113 · conferencia: % medidas da regra da troca e do chamado nos dois modos, todas como esperado. Cenario desfeito.', v_n;
end $conf$;

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (113, '113 · a troca segue o modo do ministerio', 'troca_impede', 'posto_distribuido'),
      (113, '113 · a lista de chamar aceita quem nao marcou', 'chamar_candidatos', 'left join habilidades'),
      (113, '113 · a lista de troca aceita quem nao marcou', 'eu_troca_candidatos', 'left join habilidades'),
      (113, '113 · o posto fechado so aceita quem a lideranca marcou', 'troca_impede', 'h.confirmado')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (113, '113-a-lideranca-distribui-os-postos.sql')
  on conflict (n) do nothing;

commit;

/* o que o editor mostra: quem distribui hoje, e as provas */
select '113' as versao,
       (select coalesce(string_agg(e.nome, ', ' order by e.ordem), 'nenhum ainda')
          from equipes e join config cf on cf.equipe_id = e.id
         where coalesce(cf.dados ->> 'distribuir', '') = 'true') as ministerios_que_distribuem,
       (select count(*) from porta_publica where n = 113) as portas_novas,
       (select count(*) from testar_porta_publica() where not passou) as porta_reprovada,
       (select count(*) from schema_versao_conferir() where not passou) as sondas_reprovadas,
       (select count(*) from schema_versao_conferir()) as sondas;
