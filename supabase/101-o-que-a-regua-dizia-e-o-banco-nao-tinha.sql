/* =============================================================================
   101 · O QUE A RÉGUA DIZIA E O BANCO NÃO TINHA

   01/10/2026. Só de Escalas.

   O Arthur, com a captura de /equipe/louvor: três "João" sem sobrenome, um
   em Vocal 1, outro em Vocal 2, outro em Bateria. "Tem que ter o sobrenome e
   já havia te passado pra consertar."

   A CAUSA, MEDIDA EM PRODUÇÃO (select no editor, 01/10):
     `equipe_time` devolve (area, ordem, voluntario_id, primeiro_nome, nivel,
     tem_pin, tem_tel). É a versão da 08, sem `nome_completo`. A 42, que trouxe
     o nome inteiro, nunca entrou, e `schema_versao` diz que entrou: a 55
     encheu a régua com 1..55 de uma vez ("as que já rodaram"). Em 19/09 a
     casca de servidor de /equipe saiu confiando nessa régua, e a lista voltou
     a mostrar só o primeiro nome. No cadastro o sobrenome existe: Louvor 23
     de 23, Connect 30 de 30, Mídia 24 de 25.

   E NÃO ERA SÓ ELA. Uma impressão digital de cada objeto (corpo, segurança e
   permissão das funções; colunas; políticas; gatilhos; restrições; índices;
   visões; permissões de tabela) da produção contra um banco nascido do
   repositório deixou isto:

     objeto                     produção               repositório
     equipe_time                08                     42 (nome inteiro)
     fn_conflito_simultaneo     04                     45 (só quando a pessoa muda)
     fn_indisponivel            04                     46 (não trava quem já está)
     conferir_habilidade        texto antigo           10 (mesma lógica)
     is_lider                   texto antigo           03 (mesma lógica)
     gatilho de config          tg_config_equipe,      tg_equipe_nasce_com_config,
                                fn_config_da_equipe    fn_equipe_nasce_com_config (02)
     config(equipe_id)          restrição              índice único ux_config_equipe
                                config_equipe_uk
     funcoes(equipe_id, nome)   restrição              índice único ux_funcoes_equipe_nome
                                funcoes_equipe_nome
     funcoes.tipos              duas checagens iguais  só a funcoes_tipos_conhecidos_ck
     índices                    ix_vol_tel             ix_fn_equipe

   Colunas, políticas de RLS, visões e permissões de tabela: iguais nos dois.

   O QUE ESTA MIGRAÇÃO FAZ: traz cada objeto para o que o repositório diz,
   com o corpo copiado da última migração que o define, sem reescrever nada,
   e prende sondas para a régua não mentir de novo sobre eles.

     · A 45 e a 46 mudam comportamento, e só para recusar menos: o gatilho de
       conflito deixa de reavaliar a linha quando a pessoa não mudou
       (confirmar, travar, 1ª vez), e o de indisponível deixa passar o upsert
       que regrava quem já estava na vaga. Escalação NOVA de quem avisou que
       não pode, ou em duas funções simultâneas, continua recusada.
     · A unicidade de config(equipe_id) e de funcoes(equipe_id, nome) troca de
       nome: o índice único do repositório nasce ANTES de a restrição antiga
       sair, então nunca há um instante sem a regra.
     · ix_vol_tel, que só a produção tinha (busca por telefone), entra no
       repositório.

   FICAM DE FORA, de propósito: `ocupados_fora(uuid)` e
   `testar_conta_sem_papel()`, que só existem na produção, não são chamadas
   pelo app e não abrem para `anon`. Apagar função cujo fonte só está no
   banco não tem volta.

   O EDITOR DO SUPABASE NÃO MOSTRA NOTICE: a última linha é um select com o
   resultado.

   ORDEM:  ... 99 → 100 → 101
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(101);
  end if;
end $tranca$;

begin;

/* o que a lista de cada ministério mostrava antes: a conferência compara */
create temp table _equipe_time_antes on commit drop as
  select e.slug, t.area, t.voluntario_id
    from equipes e cross join lateral equipe_time(e.slug) t;

-- =========================================================================
-- 1 · equipe_time: o nome inteiro (corpo da 42, parte 1)
-- =========================================================================
/* O tipo de retorno muda (ganha uma coluna), e `create or replace` não muda
   tipo de retorno: tem que derrubar antes. O grant é refeito logo abaixo. */
drop function if exists equipe_time(text);

create function equipe_time(p_slug text)
returns table(area text, ordem int, voluntario_id uuid, primeiro_nome text,
              nome_completo text, nivel text, tem_pin boolean, tem_tel boolean)
language sql security definer set search_path = public stable as $fn$
  select f.nome, f.ordem, v.id,
         /* o primeiro nome CONTINUA vindo: é o que a busca casa quando a
            pessoa digita só ele, e é o último degrau da queda na tela */
         split_part(btrim(v.nome), ' ', 1),
         /* o nome como a pessoa se cadastrou, inteiro, sem cortar em sobrenome
            nenhum — é o que a lista mostra */
         btrim(v.nome),
         h.nivel::text,
         v.pin_hash is not null,
         nullif(tel_norm(v.telefone),'') is not null
    from voluntarios v
    join equipes e on e.id = v.equipe_id and e.slug = p_slug
    join habilidades h on h.voluntario_id = v.id
    join funcoes f on f.id = h.funcao_id and f.ativa
   where v.ativo
   order by f.ordem, v.nome;
$fn$;

revoke all on function equipe_time(text) from public;
grant execute on function equipe_time(text) to anon, authenticated;

-- =========================================================================
-- 2 · conflito só quando a pessoa muda (corpo e gatilho da 45)
-- =========================================================================
create or replace function fn_conflito_simultaneo() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare v_nome text; v_outra text;
begin
  /* só quando a pessoa entra ou muda. Status, travar, 1ª vez e recado não
     re-abrem a pergunta. */
  if tg_op = 'UPDATE'
     and new.voluntario_id is not distinct from old.voluntario_id
     and new.funcao_id     is not distinct from old.funcao_id
     and new.culto_id      is not distinct from old.culto_id then
    return new;
  end if;
  if new.voluntario_id is null then return new; end if;
  if not exists (select 1 from funcoes where id = new.funcao_id and simultanea) then
    return new;
  end if;
  select nome into v_nome from voluntarios where id = new.voluntario_id;
  select f.nome into v_outra
    from escalacoes e
    join funcoes f on f.id = e.funcao_id and f.simultanea
   where e.culto_id = new.culto_id
     and e.funcao_id <> new.funcao_id
     and e.voluntario_id = new.voluntario_id      -- só dentro do ministério
   limit 1;
  if v_outra is not null then
    raise exception '% ja esta em % ao mesmo tempo neste domingo.', v_nome, v_outra;
  end if;
  return new;
end $fn$;

drop trigger if exists tg_conflito on escalacoes;
create constraint trigger tg_conflito
  after insert or update on escalacoes
  deferrable initially deferred
  for each row execute function fn_conflito_simultaneo();

-- =========================================================================
-- 3 · "não posso" não trava quem já está na vaga (corpo e gatilho da 46)
-- =========================================================================
create or replace function fn_indisponivel() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare v_data date; v_nome text; v_bloq int;
begin
  if new.voluntario_id is null then return new; end if;
  /* UPDATE sem troca de pessoa nem de culto: status, travar, 1ª vez. Passa. */
  if tg_op = 'UPDATE'
     and new.voluntario_id is not distinct from old.voluntario_id
     and new.culto_id      is not distinct from old.culto_id then
    return new;
  end if;
  /* INSERT do upsert de salvar_dia: a vaga já tem essa pessoa. Passa. */
  if tg_op = 'INSERT' and exists (
       select 1 from escalacoes e
        where e.culto_id = new.culto_id
          and e.funcao_id = new.funcao_id
          and e.voluntario_id = new.voluntario_id) then
    return new;
  end if;
  select data into v_data from cultos where id = new.culto_id;
  select nome into v_nome from voluntarios where id = new.voluntario_id;
  select count(*) into v_bloq from indisponibilidades
   where data = v_data and voluntario_id = new.voluntario_id;
  if v_bloq > 0 then raise exception '% avisou que nao pode neste domingo.', v_nome; end if;
  return new;
end $fn$;

drop trigger if exists tg_indisp on escalacoes;
create trigger tg_indisp before insert or update on escalacoes
  for each row execute function fn_indisponivel();

-- =========================================================================
-- 4 · os dois textos antigos de mesma lógica (corpos da 10 e da 03)
-- =========================================================================
create or replace function conferir_habilidade(
  p_voluntario uuid, p_funcao uuid, p_nivel text
) returns void
language plpgsql security invoker set search_path = public as $fn$
begin
  if p_nivel is null or p_nivel = '' then
    delete from habilidades where voluntario_id = p_voluntario and funcao_id = p_funcao;
  else
    insert into habilidades (voluntario_id, funcao_id, nivel, confirmado)
         values (p_voluntario, p_funcao, p_nivel::nivel_habilidade, true)
    on conflict (voluntario_id, funcao_id)
      do update set nivel = excluded.nivel, confirmado = true;
  end if;

  /* quando não sobra nenhuma habilidade pendente, a pessoa inteira está
     conferida: é isso que tira o selo de "novo" da aba Time. */
  update voluntarios v set conferido = true
   where v.id = p_voluntario
     and not exists (select 1 from habilidades h
                      where h.voluntario_id = v.id and h.confirmado = false);
end $fn$;

create or replace function is_lider() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from lideres
    where email <> '' and lower(email) = lower(nullif(auth.jwt() ->> 'email', '')));
$$;

-- =========================================================================
-- 5 · ministério novo nasce com config: o nome do repositório (02)
-- =========================================================================
create or replace function public.fn_equipe_nasce_com_config()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  insert into config (equipe_id, dados) values (new.id, '{}'::jsonb)
  on conflict (equipe_id) do nothing;
  return new;
end $fn$;

/* gatilho de função: ninguém chama pela API */
revoke all on function public.fn_equipe_nasce_com_config() from public, anon, authenticated;

drop trigger if exists tg_config_equipe on equipes;
drop trigger if exists tg_equipe_nasce_com_config on equipes;
create trigger tg_equipe_nasce_com_config
  after insert on equipes
  for each row execute function public.fn_equipe_nasce_com_config();
drop function if exists public.fn_config_da_equipe();

-- =========================================================================
-- 6 · as regras de unicidade e os índices com os nomes do repositório
-- =========================================================================
create unique index if not exists ux_config_equipe on config (equipe_id);
alter table config drop constraint if exists config_equipe_uk;

create unique index if not exists ux_funcoes_equipe_nome on funcoes (equipe_id, nome);
alter table funcoes drop constraint if exists funcoes_equipe_nome;

/* a cópia; a funcoes_tipos_conhecidos_ck (53) fica */
alter table funcoes drop constraint if exists funcoes_tipos_conhecidos;

create index if not exists ix_fn_equipe on funcoes (equipe_id);
/* só a produção tinha; a busca por telefone usa tel_norm(telefone) */
create index if not exists ix_vol_tel on voluntarios (tel_norm(telefone));

-- =========================================================================
-- 7 · conferência
-- =========================================================================
do $conf$
declare
  falhas text[] := '{}';
  r record;
  v_n int;
begin
  /* 1 · cada função com o corpo exato do repositório */
  for r in
    select * from (values
      ('equipe_time(text)',            '456ed2a5fa55449a39406241a29d2824'),
      ('fn_conflito_simultaneo()',     'dc330ba62d962adf5f9d6ee83e9c1f6e'),
      ('fn_indisponivel()',            '39ce6b160eac63f3f1e14be1bf735d44'),
      ('conferir_habilidade(uuid,uuid,text)', '39b03a048c6ecda1e48ff904288d5938'),
      ('is_lider()',                   '64e433fa1fc3d65fe84ffc5bc0319ffd'),
      ('fn_equipe_nasce_com_config()', '4f264d653440f503964399c4e5e3a7cc')
    ) as x(assinatura, esperado)
  loop
    if to_regprocedure('public.' || r.assinatura) is null then
      falhas := falhas || format('%s nao existe', r.assinatura);
    elsif (select md5(prosrc) from pg_proc where oid = to_regprocedure('public.' || r.assinatura)) <> r.esperado then
      falhas := falhas || format('%s com corpo diferente do repositorio', r.assinatura);
    end if;
  end loop;

  /* 2 · a lista de cada ministério: as mesmas linhas, agora com o nome inteiro */
  select count(*) into v_n from (
    (select slug, area, voluntario_id from _equipe_time_antes
     except all
     select e.slug, t.area, t.voluntario_id from equipes e cross join lateral equipe_time(e.slug) t)
    union all
    (select e.slug, t.area, t.voluntario_id from equipes e cross join lateral equipe_time(e.slug) t
     except all
     select slug, area, voluntario_id from _equipe_time_antes)) d;
  if v_n > 0 then
    falhas := falhas || format('%s linha(s) da lista mudaram de lugar', v_n); end if;

  select count(*) into v_n
    from equipes e cross join lateral equipe_time(e.slug) t
    join voluntarios v on v.id = t.voluntario_id
   where t.nome_completo is distinct from btrim(v.nome);
  if v_n > 0 then
    falhas := falhas || format('%s linha(s) sem o nome inteiro', v_n); end if;

  /* 3 · o gatilho de config com o nome novo, e só ele */
  if not exists (select 1 from pg_trigger where tgname = 'tg_equipe_nasce_com_config'
                    and tgrelid = 'public.equipes'::regclass
                    and tgfoid = 'public.fn_equipe_nasce_com_config()'::regprocedure) then
    falhas := falhas || 'tg_equipe_nasce_com_config nao esta em equipes'::text; end if;
  if exists (select 1 from pg_trigger where tgname = 'tg_config_equipe') then
    falhas := falhas || 'tg_config_equipe continua'::text; end if;
  if to_regprocedure('public.fn_config_da_equipe()') is not null then
    falhas := falhas || 'fn_config_da_equipe continua'::text; end if;

  /* 4 · a unicidade continua, com o nome novo */
  if to_regclass('public.ux_config_equipe') is null or to_regclass('public.ux_funcoes_equipe_nome') is null then
    falhas := falhas || 'indice unico novo faltando'::text; end if;
  if exists (select 1 from pg_constraint where conname in ('config_equipe_uk', 'funcoes_equipe_nome', 'funcoes_tipos_conhecidos')) then
    falhas := falhas || 'restricao antiga continua'::text; end if;
  if not exists (select 1 from pg_constraint where conname = 'funcoes_tipos_conhecidos_ck') then
    falhas := falhas || 'funcoes_tipos_conhecidos_ck sumiu'::text; end if;
  if to_regclass('public.ix_fn_equipe') is null or to_regclass('public.ix_vol_tel') is null then
    falhas := falhas || 'indice faltando'::text; end if;

  /* 5 · ministério novo ainda nasce com config (desfeito) */
  begin
    insert into equipes (nome, slug, ordem) values ('CONF101 Teste', 'conf101-equipe', 995);
    if not exists (select 1 from config c join equipes e on e.id = c.equipe_id where e.slug = 'conf101-equipe') then
      falhas := falhas || 'ministerio novo nasceu sem config'::text; end if;
    raise exception 'CONF101_DESFAZ';
  exception when others then
    if sqlerrm <> 'CONF101_DESFAZ' then
      falhas := falhas || ('o cenario nao montou: ' || sqlerrm)::text;
    end if;
  end;
  if exists (select 1 from equipes where slug = 'conf101-equipe') then
    falhas := falhas || 'o cenario de teste ficou no banco'::text; end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'101 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 101 · conferencia: as seis funcoes com o corpo do repositorio; a lista de cada ministerio com as mesmas linhas e o nome inteiro; gatilho de config, unicidade e indices com os nomes do repositorio. Cenario desfeito.';
end $conf$;

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (101, '101 · equipe_time devolve o nome inteiro (42)', 'equipe_time', 'btrim(v.nome), h.nivel::text'),
      (101, '101 · conflito so quando a pessoa muda (45)', 'fn_conflito_simultaneo', 'new.voluntario_id is not distinct from old.voluntario_id and new.funcao_id'),
      (101, '101 · nao posso nao trava quem ja esta na vaga (46)', 'fn_indisponivel', 'insert do upsert de salvar_dia'),
      (101, '101 · ministerio novo nasce com config (02)', 'fn_equipe_nasce_com_config', 'insert into config (equipe_id, dados)')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (101, '101-o-que-a-regua-dizia-e-o-banco-nao-tinha.sql')
  on conflict (n) do nothing;

commit;

/* o que o editor mostra: a conta depois de aplicar */
select '101' as versao,
       pg_get_function_result('public.equipe_time(text)'::regprocedure) like '%nome_completo%' as lista_com_nome_inteiro,
       (select count(*) from schema_versao_conferir() where not passou) as sondas_reprovadas,
       (select count(*) from schema_versao_conferir()) as sondas;
