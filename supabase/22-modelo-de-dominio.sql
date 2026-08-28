/* =============================================================================
   22 — O MODELO DE DOMÍNIO: PESSOA, CANDIDATURA, VÍNCULO

   Fase 2 e 3 da spec, na ordem que ela manda: o banco antes das telas.

   O que a §30 pede é separar cinco coisas que hoje moram numa linha só:

     PESSOA      quem ela é                    -> nova tabela `pessoas`
     CANDIDATURA o interesse dela em servir    -> nova tabela `candidaturas`
     VOLUNTÁRIO  o vínculo com um ministério   -> `voluntarios`, que já existe
     EQUIPE      o ministério                  -> `equipes`, que já existe
     FUNÇÃO      o papel                       -> `funcoes`, que já existe

   ---------------------------------------------------------------------------
   DECISÃO QUE PRECISA FICAR ESCRITA: o token e o PIN NÃO se mudam agora.

   A §30 quer a identidade em `pessoas`, e o token pessoal é identidade. Mas o
   PIN é guardado como sha256(pin || token): o token é o SAL. Mover o token
   para `pessoas` obriga a escolher um token por pessoa, e o PIN preso ao token
   descartado morre — em silêncio, sem erro, sem aviso. Hoje 20 das 35 linhas
   têm PIN criado.

   Medi o custo real: são 35 linhas para 33 pessoas; só duas estão duplicadas
   (Louvor + Mídia) e cada uma tem PIN em apenas UMA das duas linhas. Existe
   portanto uma migração que não perde PIN nenhum — a pessoa herda o token da
   linha que já tem PIN. Mas essa migração toca `eu_*`, `equipe_pin_*`,
   `salvar_dia`, a RLS de `voluntarios`, `ponte.ts` e `db.ts`, e ela cairia no
   mesmo dia em que os links vão para os grupos.

   Então: `pessoas` nasce como a espinha de identidade e `voluntarios.pessoa_id`
   liga as duas. O token continua no vínculo por mais uma etapa. É a §39 (não
   quebrar o que funciona) mandando na §30 (separar) por uma migração.
   A troca de credencial fica registrada como dívida, com o caminho já medido.
   ---------------------------------------------------------------------------
   ============================================================================= */

-- =========================================================================
-- 1. PESSOAS
--
-- Casada por telefone normalizado, que é o único identificador que a igreja
-- realmente usa: e-mail metade não tem, nome se escreve de dois jeitos (e há
-- exatamente esse caso no banco hoje, a mesma pessoa em dois ministérios com
-- grafias diferentes).
-- =========================================================================

create table if not exists pessoas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  telefone    text not null unique,          -- já normalizado por tel_norm()
  email       text,
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table  pessoas is 'a identidade da pessoa, independente de em quantos ministérios ela serve. Casada por telefone normalizado.';
comment on column pessoas.telefone is 'sempre tel_norm(): últimos dígitos, sem máscara. É a chave que junta a mesma pessoa entre ministérios.';

alter table pessoas enable row level security;

-- backfill: uma pessoa por telefone distinto entre os voluntários que já existem
insert into pessoas (nome, telefone, email, criado_em)
select distinct on (tel_norm(v.telefone))
       v.nome, tel_norm(v.telefone), nullif(v.email,''), min(v.criado_em) over (partition by tel_norm(v.telefone))
  from voluntarios v
 where coalesce(length(tel_norm(v.telefone)),0) >= 10
 order by tel_norm(v.telefone), v.pin_hash nulls last, v.criado_em
    on conflict (telefone) do nothing;

alter table voluntarios add column if not exists pessoa_id uuid references pessoas(id) on delete set null;
create index if not exists ix_voluntarios_pessoa on voluntarios(pessoa_id);

update voluntarios v set pessoa_id = p.id
  from pessoas p
 where p.telefone = tel_norm(v.telefone)
   and v.pessoa_id is distinct from p.id;

comment on column voluntarios.pessoa_id is
  'liga o vínculo (pessoa-em-um-ministério) à identidade. O token e o pin_hash continuam AQUI por enquanto — ver o cabeçalho da migração 22.';


-- =========================================================================
-- 2. PERGUNTAS CONFIGURÁVEIS POR MINISTÉRIO  (§8, §23)
--
-- equipe_id nulo = pergunta que vale para todos os ministérios. É o que
-- permite "tem disponibilidade aos domingos?" existir uma vez só.
-- =========================================================================

do $$ begin
  create type tipo_pergunta as enum ('texto','texto_longo','escolha','multipla','sim_nao','numero');
exception when duplicate_object then null; end $$;

create table if not exists perguntas (
  id          uuid primary key default gen_random_uuid(),
  equipe_id   uuid references equipes(id) on delete cascade,   -- null = todas
  ordem       int  not null default 0,
  texto       text not null,
  ajuda       text,
  tipo        tipo_pergunta not null default 'texto',
  opcoes      text[] not null default '{}',                    -- escolha/multipla
  obrigatoria boolean not null default false,
  ativa       boolean not null default true,
  criado_em   timestamptz not null default now()
);
comment on table perguntas is 'formulário do cadastro, configurável por ministério. equipe_id nulo = pergunta de todos.';
alter table perguntas enable row level security;


-- =========================================================================
-- 3. CANDIDATURAS  (§12, §29, §30)
--
-- O status é do PEDIDO, não da pessoa. Uma pessoa pode se candidatar de novo,
-- para outra área, anos depois, e a segunda candidatura não pode reescrever a
-- história da primeira.
--
-- `token` e não id na URL: a página de acompanhamento é pública e o candidato
-- não tem sessão. Id na URL sem sessão para conferir é exatamente o que a §35
-- proíbe. Mesmo padrão de /eu/<token>, mesma entropia.
-- =========================================================================

do $$ begin
  create type status_candidatura as enum
    ('enviada','em_analise','conversa','entrevista','aprovada','recusada','integrando','ativa','inativa');
exception when duplicate_object then null; end $$;

create table if not exists candidaturas (
  id            uuid primary key default gen_random_uuid(),
  token         text not null unique default encode(extensions.gen_random_bytes(9),'hex'),
  pessoa_id     uuid not null references pessoas(id) on delete cascade,
  equipe_id     uuid not null references equipes(id) on delete cascade,
  status        status_candidatura not null default 'enviada',
  voluntario_id uuid references voluntarios(id) on delete set null,  -- preenchido ao aprovar
  observacao    text,          -- o que a PESSOA escreveu
  nota_interna  text,          -- o que a liderança anotou. Nunca sai para o candidato.
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  decidido_por  text,
  decidido_em   timestamptz
);
comment on table  candidaturas is 'o pedido de servir. Uma por pessoa por ministério em aberto; encerrada, pode haver outra depois.';
comment on column candidaturas.nota_interna is 'anotação da liderança. NUNCA é devolvida para o candidato por candidatura_status().';
comment on column candidaturas.token is 'credencial da página pública de acompanhamento. 72 bits, igual ao token do voluntário.';

/* uma candidatura EM ABERTO por pessoa por ministério. Encerradas não contam,
   senão quem foi recusado uma vez nunca mais poderia se candidatar. */
create unique index if not exists ux_candidatura_aberta
  on candidaturas (pessoa_id, equipe_id)
  where status not in ('recusada','inativa');

create index if not exists ix_candidaturas_equipe on candidaturas(equipe_id, status);
alter table candidaturas enable row level security;

create table if not exists candidatura_funcoes (
  candidatura_id uuid not null references candidaturas(id) on delete cascade,
  funcao_id      uuid not null references funcoes(id) on delete cascade,
  primary key (candidatura_id, funcao_id)
);
comment on table candidatura_funcoes is 'em que funções a pessoa demonstrou interesse. O líder decide a oficial depois (§7).';
alter table candidatura_funcoes enable row level security;

create table if not exists candidatura_respostas (
  candidatura_id uuid not null references candidaturas(id) on delete cascade,
  pergunta_id    uuid not null references perguntas(id) on delete cascade,
  resposta       text not null default '',
  primary key (candidatura_id, pergunta_id)
);
alter table candidatura_respostas enable row level security;

create table if not exists historico_candidatura (
  id             bigserial primary key,
  candidatura_id uuid not null references candidaturas(id) on delete cascade,
  de             status_candidatura,
  para           status_candidatura not null,
  quando         timestamptz not null default now(),
  por            text,
  nota           text
);
comment on table historico_candidatura is 'toda mudança de status, com quem e quando. É o que a §18 chama de HISTÓRICO.';
create index if not exists ix_hist_cand on historico_candidatura(candidatura_id, quando);
alter table historico_candidatura enable row level security;


-- =========================================================================
-- 4. ONBOARDING  (§20)
--
-- Etapas do ministério, progresso do VÍNCULO. Não da candidatura: a
-- candidatura termina quando é aprovada; integrar é coisa de quem já entrou.
-- =========================================================================

create table if not exists onboarding_etapas (
  id        uuid primary key default gen_random_uuid(),
  equipe_id uuid references equipes(id) on delete cascade,   -- null = todas
  ordem     int  not null default 0,
  titulo    text not null,
  descricao text,
  ativa     boolean not null default true
);
alter table onboarding_etapas enable row level security;

create table if not exists onboarding_feito (
  voluntario_id uuid not null references voluntarios(id) on delete cascade,
  etapa_id      uuid not null references onboarding_etapas(id) on delete cascade,
  feito_em      timestamptz not null default now(),
  por           text,
  primary key (voluntario_id, etapa_id)
);
alter table onboarding_feito enable row level security;


-- =========================================================================
-- 5. QUEM RESPONDE PELO MINISTÉRIO  (§11, §27)
--
-- O botão "falar com o líder" precisa de um número, e a §27 proíbe número
-- espalhado no frontend. Ele mora aqui e sai pela função pública.
-- =========================================================================

alter table equipes add column if not exists responsavel_nome     text;
alter table equipes add column if not exists responsavel_whatsapp text;
comment on column equipes.responsavel_whatsapp is
  'só dígitos, com DDI. Alimenta o link wa.me gerado pelo sistema — a §27 proíbe número hardcoded na tela.';


-- =========================================================================
-- 6. RLS
--
-- Regra única e repetida: o organizador enxerga o que pertence ao ministério
-- que ele organiza. O visitante não enxerga tabela nenhuma — tudo que é
-- público passa por SECURITY DEFINER, que é o padrão que este banco já usa.
-- =========================================================================

drop policy if exists pessoas_ler on pessoas;
create policy pessoas_ler on pessoas for select to authenticated using (
  lidera_tudo()
  or exists (select 1 from voluntarios v where v.pessoa_id = pessoas.id and lidera_equipe(v.equipe_id))
  or exists (select 1 from candidaturas c where c.pessoa_id = pessoas.id and lidera_equipe(c.equipe_id))
);
drop policy if exists pessoas_editar on pessoas;
create policy pessoas_editar on pessoas for update to authenticated
  using (lidera_tudo()) with check (lidera_tudo());

drop policy if exists cand_ler on candidaturas;
create policy cand_ler on candidaturas for select to authenticated using (lidera_equipe(equipe_id));
drop policy if exists cand_editar on candidaturas;
create policy cand_editar on candidaturas for update to authenticated
  using (lidera_equipe(equipe_id)) with check (lidera_equipe(equipe_id));
drop policy if exists cand_apagar on candidaturas;
create policy cand_apagar on candidaturas for delete to authenticated using (lidera_tudo());

drop policy if exists cf_ler on candidatura_funcoes;
create policy cf_ler on candidatura_funcoes for select to authenticated using (
  exists (select 1 from candidaturas c where c.id = candidatura_id and lidera_equipe(c.equipe_id)));

drop policy if exists cr_ler on candidatura_respostas;
create policy cr_ler on candidatura_respostas for select to authenticated using (
  exists (select 1 from candidaturas c where c.id = candidatura_id and lidera_equipe(c.equipe_id)));

drop policy if exists hist_ler on historico_candidatura;
create policy hist_ler on historico_candidatura for select to authenticated using (
  exists (select 1 from candidaturas c where c.id = candidatura_id and lidera_equipe(c.equipe_id)));

drop policy if exists perg_ler on perguntas;
create policy perg_ler on perguntas for select to authenticated
  using (equipe_id is null or lidera_equipe(equipe_id));
drop policy if exists perg_criar on perguntas;
create policy perg_criar on perguntas for insert to authenticated
  with check (equipe_id is not null and lidera_equipe(equipe_id));
drop policy if exists perg_editar on perguntas;
create policy perg_editar on perguntas for update to authenticated
  using (equipe_id is not null and lidera_equipe(equipe_id))
  with check (equipe_id is not null and lidera_equipe(equipe_id));
drop policy if exists perg_apagar on perguntas;
create policy perg_apagar on perguntas for delete to authenticated
  using (equipe_id is not null and lidera_equipe(equipe_id));

drop policy if exists onb_ler on onboarding_etapas;
create policy onb_ler on onboarding_etapas for select to authenticated
  using (equipe_id is null or lidera_equipe(equipe_id));
drop policy if exists onb_escrever on onboarding_etapas;
create policy onb_escrever on onboarding_etapas for all to authenticated
  using (equipe_id is not null and lidera_equipe(equipe_id))
  with check (equipe_id is not null and lidera_equipe(equipe_id));

drop policy if exists onbf_tudo on onboarding_feito;
create policy onbf_tudo on onboarding_feito for all to authenticated using (
  exists (select 1 from voluntarios v where v.id = voluntario_id and lidera_equipe(v.equipe_id))
) with check (
  exists (select 1 from voluntarios v where v.id = voluntario_id and lidera_equipe(v.equipe_id))
);

/* o visitante não toca em nenhuma tabela nova */
revoke all on pessoas, candidaturas, candidatura_funcoes, candidatura_respostas,
              historico_candidatura, perguntas, onboarding_etapas, onboarding_feito
  from anon;


----------------------------------------------------------------------------
-- CONFERÊNCIA
select
  (select count(*) from pessoas)                                    as pessoas,
  (select count(*) from voluntarios)                                as vinculos,
  (select count(*) from voluntarios where pessoa_id is null)         as vinculo_sem_pessoa,
  (select count(distinct pessoa_id) from voluntarios)                as pessoas_com_vinculo,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity) as tabela_sem_rls;
