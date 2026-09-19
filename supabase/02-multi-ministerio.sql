/* =============================================================================
   02 · MULTI-MINISTÉRIO — o arquivo que nunca existiu
   19/09/2026 · RECONSTRUÍDO, NÃO RECUPERADO. Leia o aviso abaixo.

   -------------------------------------------------------------------------
   POR QUE ESTE ARQUIVO ESTÁ SENDO ESCRITO HOJE, COM O NÚMERO 02

   O cabeçalho da 01 diz, desde o primeiro dia:

       Ordem correta em um banco vazio:
           01-schema-inicial.sql → 02-multi-ministerio.sql → 03-auditoria.sql

   `02-multi-ministerio.sql` NÃO EXISTE neste repositório. Nunca existiu. A
   passagem de mono para multi-ministério — a tabela `equipes`, a coluna
   `equipe_id` em cinco tabelas, `lidera_equipe()`, `lidera_tudo()` e a troca
   de todas as políticas de RLS — foi aplicada direto no banco e nunca virou
   arquivo. Depois, o número 02 foi ocupado por outro assunto
   (`02-recuperadas-do-banco.sql`), e o buraco deixou de ser visível na
   listagem da pasta.

   O QUE ISSO CUSTA, medido hoje, não estimado: aplicando os arquivos desta
   pasta, em ordem, num Postgres 16 vazio, 37 das 51 migrações falham. Trinta
   e cinco delas com a mesma linha: `relation "equipes" does not exist`. Não
   são trinta e sete problemas — é UM, repetido.

   E a consequência prática é a que importa: NÃO DÁ PARA RECONSTRUIR O BANCO
   DE PRODUÇÃO A PARTIR DESTE REPOSITÓRIO. Sem isso não existe cópia de
   homologação, não existe ensaio de migração antes de aplicar no que está no
   ar, e não existe volta se o projeto do Supabase se perder. É o ponto único
   de falha mais caro do sistema, e não fica no código: fica na ausência dele.

   -------------------------------------------------------------------------
   ⚠️  ESTE ARQUIVO É UMA RECONSTRUÇÃO. O QUE ISSO QUER DIZER, EXATAMENTE.

   O conteúdo abaixo NÃO saiu de `pg_get_functiondef` nem de `pg_dump`. Foi
   deduzido de três fontes, todas dentro deste repositório:

     · o inventário de colunas e políticas em `00-ESTADO-REAL-DO-BANCO.sql`,
       que foi extraído do banco e lista `equipes` com suas oito colunas e as
       catorze políticas por nome, expressão e comando;
     · os corpos de `lidera_equipe()` e `lidera_tudo()`, que estão no mesmo
       arquivo, esses sim vindos de `pg_get_functiondef`;
     · o que as migrações 03 a 52 exigem para aplicar — que é um teste duro,
       porque elas foram escritas contra o banco verdadeiro.

   O CRITÉRIO DE ACEITE foi um só, e é verificável por qualquer pessoa:
   com este arquivo no lugar, a pasta inteira aplica em ordem num Postgres
   vazio, e `testar_permissoes()` e `testar_identidade()` — que são os testes
   que o próprio sistema escreveu para si — passam no banco resultante.

   O QUE ISSO NÃO PROVA: que o esquema reconstruído é byte a byte o de
   produção. Pode haver um default, um nome de índice ou uma ordem de coluna
   diferente. Para nada que o sistema exercita isso muda o resultado, mas é
   uma diferença real e está dita aqui em vez de escondida.

   A FONTE DA VERDADE CONTINUA SENDO O BANCO. O passo que fecha esta lacuna
   de vez é um `pg_dump --schema-only` de produção salvo como
   `supabase/00-estado.sql` — `scripts/escala-banco.sh` se recusa a rodar sem
   ele e imprime a receita. Enquanto esse dump não existir, ESTE arquivo é o
   que separa "não dá para reconstruir" de "dá para reconstruir, com uma
   ressalva escrita".
   ============================================================================= */


-- =========================================================================
-- 1 · a tabela que dá nome aos ministérios
--
-- Colunas conforme o inventário de 00-ESTADO-REAL-DO-BANCO.sql (linhas
-- 759-766): id, nome, slug, whatsapp_grupo, ordem, criado_em, sem_niveis,
-- aviso_cadastro.
-- =========================================================================

create table if not exists equipes (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  slug           text not null unique,
  whatsapp_grupo text,
  ordem          int  not null default 0,
  criado_em      timestamptz not null default now(),
  /* ministério que não trabalha com titular/reserva/treino — o Connect entrou
     assim. Quem organiza vê a lista sem a coluna de nível. */
  sem_niveis     boolean not null default false,
  /* texto que a porta pública mostra antes do formulário */
  aviso_cadastro text
);
alter table equipes enable row level security;

comment on table equipes is
  'Um ministério. Criada aqui em 19/09/2026 num arquivo que faltava desde o comeco: a passagem para multi-ministerio nunca virou migracao. Ver o cabecalho deste arquivo.';


-- =========================================================================
-- 2 · a coluna que atravessa o sistema inteiro
--
-- `cultos` de propósito NÃO ganha `equipe_id`: o domingo é o mesmo para
-- todos os ministérios, e é por isso que `salvar_dia` recebe `p_equipe` em
-- separado. Quem amarra escalação a ministério é `funcoes.equipe_id`.
-- =========================================================================

alter table funcoes     add column if not exists equipe_id uuid references equipes(id) on delete cascade;
alter table voluntarios add column if not exists equipe_id uuid references equipes(id) on delete cascade;
alter table config      add column if not exists equipe_id uuid references equipes(id) on delete cascade;
/* em `lideres`, nulo tem significado: é o organizador geral, que lidera tudo.
   É essa distinção que `lidera_tudo()` lê. */
alter table lideres     add column if not exists equipe_id uuid references equipes(id) on delete cascade;


-- =========================================================================
-- 3 · o ministério que já existia ganha nome
--
-- Antes desta passagem havia UM ministério sem nome: a Mídia. As linhas que
-- estão no banco são dele. Sem este passo, `equipe_id` fica nulo em tudo e o
-- `not null` do passo 4 não entra.
-- =========================================================================

do $semente$
declare v_eq uuid;
begin
  if not exists (select 1 from equipes) then
    insert into equipes (nome, slug, ordem)
      values ('Mídia', 'midia', 0) returning id into v_eq;
  else
    select id into v_eq from equipes order by ordem, criado_em limit 1;
  end if;

  update funcoes     set equipe_id = v_eq where equipe_id is null;
  update voluntarios set equipe_id = v_eq where equipe_id is null;
  update config      set equipe_id = v_eq where equipe_id is null;
  /* `lideres` NÃO: nulo lá quer dizer "lidera tudo", que é o certo para quem
     já era líder antes de existirem ministérios separados. */
end $semente$;

do $obriga$ begin
  /* só depois de preenchido, e só se ainda não for obrigatório */
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='funcoes'
                and column_name='equipe_id' and is_nullable='YES') then
    alter table funcoes alter column equipe_id set not null;
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='voluntarios'
                and column_name='equipe_id' and is_nullable='YES') then
    alter table voluntarios alter column equipe_id set not null;
  end if;
end $obriga$;

/* Dois ministérios podem ter um posto com o mesmo nome — Mídia e Louvor têm
   "FOTO" — mas dentro do mesmo ministério o nome continua único. A unicidade
   global vinda da 01 precisa sair, e ela é CONSTRAINT, não índice solto:
   `drop index` recusa, tem que ser `drop constraint`. */
alter table funcoes drop constraint if exists funcoes_nome_key;
drop index if exists funcoes_nome_key;
create unique index if not exists ux_funcoes_equipe_nome on funcoes (equipe_id, nome);

/* `config` NASCEU SINGLETON. A 01 a declara assim:

       create table config ( id int primary key default 1, ..., check (id = 1) );

   Uma linha, para sempre — o que fazia sentido com um ministério só. Com
   vários, cada um precisa do seu teto, da sua saudação e do seu rodapé, e o
   `check (id = 1)` recusa a segunda linha. A chave passa a ser `equipe_id`,
   que é o que a 12 já pressupõe quando faz `on conflict (equipe_id)`. */
alter table config drop constraint if exists config_id_check;
alter table config drop constraint if exists config_pkey;
alter table config alter column id drop not null;
alter table config alter column id drop default;
delete from config a using config b
 where a.equipe_id = b.equipe_id and a.ctid > b.ctid;
create unique index if not exists ux_config_equipe on config (equipe_id);

/* Ministério novo nasce com linha de config. Sem isto, criar um ministério
   pela tela deixa o teto, a saudação e o rodapé sem lugar onde morar, e a
   primeira gravação de escala falha num lugar que não explica por quê.
   (A 12 depende deste gatilho: o comentário dela diz "um gatilho em
   `equipes` já cria a linha de config vazia no INSERT".) */
create or replace function public.fn_equipe_nasce_com_config()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  insert into config (equipe_id, dados) values (new.id, '{}'::jsonb)
  on conflict (equipe_id) do nothing;
  return new;
end $fn$;

drop trigger if exists tg_equipe_nasce_com_config on equipes;
create trigger tg_equipe_nasce_com_config
  after insert on equipes
  for each row execute function public.fn_equipe_nasce_com_config();

create index if not exists ix_vol_equipe on voluntarios (equipe_id);
create index if not exists ix_fn_equipe  on funcoes (equipe_id);

/* sem isto, `authenticated` esbarra em "permission denied for table equipes"
   antes mesmo de a RLS ser consultada: RLS filtra LINHA, GRANT abre a PORTA. */
grant select on equipes to authenticated;
grant insert, update, delete on equipes to authenticated;


-- =========================================================================
-- 4 · quem lidera o quê
--
-- Os dois corpos abaixo são os de produção, copiados de
-- 00-ESTADO-REAL-DO-BANCO.sql (linhas 560-582), que os tirou com
-- pg_get_functiondef. Estes NÃO são reconstrução.
--
-- A regra em uma frase: `lideres.equipe_id` nulo lidera tudo; preenchido
-- lidera só aquele ministério.
-- =========================================================================

create or replace function public.lidera_equipe(p_equipe uuid)
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select exists (select 1 from lideres
     where email <> '' and lower(email) = lower(nullif(auth.jwt() ->> 'email', ''))
       and (equipe_id is null or equipe_id = p_equipe));
$fn$;

create or replace function public.lidera_tudo()
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select exists (select 1 from lideres
     where email <> '' and lower(email) = lower(nullif(auth.jwt() ->> 'email', ''))
       and equipe_id is null);
$fn$;

grant execute on function public.lidera_equipe(uuid), public.lidera_tudo() to authenticated;


-- =========================================================================
-- 5 · as políticas passam a perguntar DE QUAL MINISTÉRIO
--
-- Nomes, comandos e expressões conforme o inventário de POLICIES em
-- 00-ESTADO-REAL-DO-BANCO.sql (linhas 692-730). As políticas mono-ministério
-- da 01 saem de cena aqui: elas respondiam "é líder?", e a partir de agora a
-- pergunta certa é "é líder DESTE ministério?".
-- =========================================================================

do $pol$
declare r record;
begin
  /* fora as da fase mono-ministério, em cima das tabelas que ganharam dono */
  for r in select schemaname, tablename, policyname from pg_policies
            where schemaname = 'public'
              and tablename in ('funcoes','voluntarios','habilidades',
                                'indisponibilidades','escalacoes','plantoes','config')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $pol$;

alter table funcoes            enable row level security;
alter table voluntarios        enable row level security;
alter table habilidades        enable row level security;
alter table indisponibilidades enable row level security;
alter table escalacoes         enable row level security;
alter table plantoes           enable row level security;
alter table config             enable row level security;
alter table lideres            enable row level security;

drop policy if exists eq_equipes_ler on equipes;
create policy eq_equipes_ler on equipes for select to authenticated
  using (lidera_equipe(id));
drop policy if exists eq_equipes_mexer on equipes;
create policy eq_equipes_mexer on equipes for all to authenticated
  using (lidera_tudo()) with check (lidera_tudo());

drop policy if exists eq_funcoes on funcoes;
create policy eq_funcoes on funcoes for all to authenticated
  using (lidera_equipe(equipe_id)) with check (lidera_equipe(equipe_id));

drop policy if exists eq_voluntarios on voluntarios;
create policy eq_voluntarios on voluntarios for all to authenticated
  using (lidera_equipe(equipe_id)) with check (lidera_equipe(equipe_id));

drop policy if exists eq_config on config;
create policy eq_config on config for all to authenticated
  using (lidera_equipe(equipe_id)) with check (lidera_equipe(equipe_id));

/* as quatro abaixo não têm `equipe_id` próprio: o dono vem por quem elas
   apontam. É o desenho certo — `equipe_id` repetido em tabela filha é dado
   que pode discordar de si mesmo. */
drop policy if exists eq_habilidades on habilidades;
create policy eq_habilidades on habilidades for all to authenticated
  using (exists (select 1 from voluntarios v
                  where v.id = habilidades.voluntario_id and lidera_equipe(v.equipe_id)))
  with check (exists (select 1 from voluntarios v
                  where v.id = habilidades.voluntario_id and lidera_equipe(v.equipe_id)));

drop policy if exists eq_indisponibilidades on indisponibilidades;
create policy eq_indisponibilidades on indisponibilidades for all to authenticated
  using (exists (select 1 from voluntarios v
                  where v.id = indisponibilidades.voluntario_id and lidera_equipe(v.equipe_id)))
  with check (exists (select 1 from voluntarios v
                  where v.id = indisponibilidades.voluntario_id and lidera_equipe(v.equipe_id)));

drop policy if exists eq_plantoes on plantoes;
create policy eq_plantoes on plantoes for all to authenticated
  using (exists (select 1 from voluntarios v
                  where v.id = plantoes.voluntario_id and lidera_equipe(v.equipe_id)))
  with check (exists (select 1 from voluntarios v
                  where v.id = plantoes.voluntario_id and lidera_equipe(v.equipe_id)));

/* escalação pertence ao ministério da FUNÇÃO, não ao do voluntário: é isso
   que permite alguém da Mídia cobrir um posto do Louvor sem que a linha mude
   de dono. */
drop policy if exists eq_escalacoes on escalacoes;
create policy eq_escalacoes on escalacoes for all to authenticated
  using (exists (select 1 from funcoes f
                  where f.id = escalacoes.funcao_id and lidera_equipe(f.equipe_id)))
  with check (exists (select 1 from funcoes f
                  where f.id = escalacoes.funcao_id and lidera_equipe(f.equipe_id)));

drop policy if exists eq_lideres_ler on lideres;
create policy eq_lideres_ler on lideres for select to authenticated
  using (lidera_tudo() or equipe_id is null or lidera_equipe(equipe_id));
drop policy if exists eq_lideres_mexer on lideres;
create policy eq_lideres_mexer on lideres for all to authenticated
  using (lidera_tudo()) with check (lidera_tudo());


-- =========================================================================
-- 6 · `salvar_dia` passa a receber o ministério
--
-- A versão da 01 gravava o dia inteiro sem saber de quem era, e por isso
-- apagava a escala dos outros ministérios naquele domingo — é o aviso em
-- letras garrafais no topo da 01. A assinatura muda, então a antiga precisa
-- sair antes: `create or replace` não troca a lista de parâmetros.
--
-- O corpo definitivo vem na 12 (`12-servico-do-culto.sql`), que é a versão
-- que está no ar. O que entra aqui é o mínimo para a cadeia seguir: a
-- assinatura nova e o recorte por ministério.
-- =========================================================================

drop function if exists public.salvar_dia(date, text, jsonb, uuid[]);

create or replace function public.salvar_dia(
  p_equipe uuid, p_data date, p_obs text, p_slots jsonb, p_plantao uuid[])
returns uuid language plpgsql security invoker set search_path to 'public' as $fn$
declare v_culto uuid;
begin
  if p_equipe is null then raise exception 'salvar_dia sem ministerio'; end if;

  select id into v_culto from cultos where data = p_data;
  if v_culto is null then
    insert into cultos (data, obs) values (p_data, p_obs) returning id into v_culto;
  elsif p_obs is not null then
    update cultos set obs = p_obs where id = v_culto;
  end if;

  /* SÓ as funções DESTE ministério: era exatamente isto que faltava na
     versão mono e que apagava a escala dos outros. */
  delete from escalacoes e
   using funcoes f
   where e.funcao_id = f.id and e.culto_id = v_culto and f.equipe_id = p_equipe;

  insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo)
  select v_culto, f.id, (s->>'voluntario_id')::uuid,
         coalesce((s->>'status')::status_escala, 'pendente'),
         coalesce((s->>'fixo')::boolean, false)
    from jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) s
    join funcoes f on f.id = (s->>'funcao_id')::uuid and f.equipe_id = p_equipe
   where nullif(s->>'voluntario_id','') is not null;

  delete from plantoes p
   using voluntarios v
   where p.voluntario_id = v.id and p.culto_id = v_culto and v.equipe_id = p_equipe;

  insert into plantoes (culto_id, voluntario_id)
  select v_culto, v.id from unnest(coalesce(p_plantao, '{}'::uuid[])) x
    join voluntarios v on v.id = x and v.equipe_id = p_equipe
  on conflict do nothing;

  return v_culto;
end $fn$;


/* =============================================================================
   CONFERÊNCIA — o critério de aceite deste arquivo, verificável.
   ============================================================================= */
do $conf$
declare v_erros text := '';
begin
  if to_regclass('public.equipes') is null then
    v_erros := v_erros || 'equipes nao existe; ';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='voluntarios'
                    and column_name='equipe_id' and is_nullable='NO') then
    v_erros := v_erros || 'voluntarios.equipe_id nao e obrigatoria; ';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='funcoes'
                    and column_name='equipe_id' and is_nullable='NO') then
    v_erros := v_erros || 'funcoes.equipe_id nao e obrigatoria; ';
  end if;
  if to_regprocedure('public.lidera_equipe(uuid)') is null
     or to_regprocedure('public.lidera_tudo()') is null then
    v_erros := v_erros || 'lidera_equipe/lidera_tudo ausentes; ';
  end if;
  if to_regprocedure('public.salvar_dia(uuid,date,text,jsonb,uuid[])') is null then
    v_erros := v_erros || 'salvar_dia nao recebe o ministerio; ';
  end if;
  if exists (select 1 from pg_policies
              where schemaname='public' and tablename='voluntarios'
                and qual not like '%lidera_equipe%') then
    v_erros := v_erros || 'sobrou politica mono-ministerio em voluntarios; ';
  end if;

  if v_erros = '' then
    raise notice 'OK — multi-ministerio de pe: equipes, equipe_id obrigatorio, lidera_equipe/tudo, politicas e salvar_dia por ministerio.';
  else
    raise exception 'FALHOU — %', v_erros;
  end if;
end $conf$;
