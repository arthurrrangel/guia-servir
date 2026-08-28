/* =============================================================================
   33 — UMA PESSOA, UM CADASTRO, VÁRIOS PAPÉIS

   O PROBLEMA, COM NOME E SOBRENOME

   Hoje o sistema não sabe que o Jander que organiza o Louvor é o mesmo Jander
   que serve no Louvor. São dois cadastros, duas credenciais e duas telas:
   ele entra por e-mail no painel e por um link com token no espaço dele. Se
   trocar de telefone, precisa avisar duas vezes. O mesmo vale para o João
   Victor, que organiza tudo e serve na Mídia.

   A causa é uma só: `lideres` é indexada por E-MAIL, e e-mail é CREDENCIAL,
   não identidade. Quem é a pessoa mora em `pessoas`, casada por telefone.
   Enquanto a autoridade estiver pendurada na credencial, cada credencial nova
   cria uma pessoa nova aos olhos do sistema.

   O QUE ESTA MIGRAÇÃO ESTABELECE

     IDENTIDADE   `pessoas`     quem a pessoa é. Uma linha por gente.
     CREDENCIAL   duas, e tudo bem: o e-mail do Supabase Auth (para quem
                  organiza) e o token do vínculo (para quem serve). Nenhuma
                  das duas É a pessoa; as duas APONTAM para ela.
     AUTORIDADE   `papeis`      admin e líder, presos à pessoa.
     SERVIÇO      `voluntarios` continua sendo o vínculo de quem serve.

   POR QUE `voluntarios` NÃO VIRA UMA LINHA DE `papeis`

   Porque seria duplicar. `voluntarios` já carrega token, PIN, limite mensal,
   nível conferido e as habilidades. Copiar "fulano é voluntário na Mídia"
   para uma segunda tabela criaria duas fontes da verdade que divergem no
   primeiro cadastro. `papeis` guarda só o que não existe em lugar nenhum:
   quem organiza o quê. `quem_sou()` junta os dois e devolve uma resposta só.

   SOBRE O TOKEN E O PIN: continuam no vínculo, como a migração 22 decidiu e
   explicou. O PIN é sha256(pin || token), então mover o token quebraria em
   silêncio todo PIN já criado. Isto segue registrado como dívida, não como
   esquecimento.
   ============================================================================= */


-- =========================================================================
-- §1  A IDENTIDADE DEIXA DE EXIGIR TELEFONE
--
-- `pessoas.telefone` é NOT NULL desde a 22, e faz sentido para quem serve:
-- o telefone é a chave que casa a mesma pessoa entre ministérios. Mas dois
-- dos quatro organizadores de hoje nunca serviram em área nenhuma, e o
-- sistema não tem o telefone deles. Exigir um obrigaria a inventar valor de
-- enchimento dentro da coluna que é chave de casamento, o que é pior que o
-- buraco: um telefone falso casa com alguém, um nulo não casa com ninguém.
--
-- A unicidade continua valendo. No Postgres, várias linhas podem ter o mesmo
-- NULL numa coluna única, então identidade sem telefone não colide.
-- =========================================================================
alter table pessoas alter column telefone drop not null;
comment on column pessoas.telefone is
  'tel_norm(), a chave que junta a mesma pessoa entre ministérios. Nulo é permitido: quem só organiza pode não ter telefone cadastrado. Quem serve sempre tem.';

/* O E-MAIL DE LOGIN, que é diferente do e-mail de contato.
   `pessoas.email` responde "onde eu falo com essa pessoa" e pode repetir,
   mudar e ficar vazio. Este responde "com qual conta ela entra", precisa ser
   único e é comparado sem diferenciar maiúsculas. São perguntas diferentes e
   por isso são colunas diferentes. */
alter table pessoas add column if not exists auth_email text;
create unique index if not exists ux_pessoas_auth_email on pessoas (lower(auth_email));
comment on column pessoas.auth_email is
  'e-mail da conta do Supabase Auth. É credencial, não identidade: serve para descobrir QUEM chegou, e quem a pessoa é continua sendo a linha inteira.';


-- =========================================================================
-- §2  AUTORIDADE: admin e líder, presos à pessoa
--
-- `admin` organiza a igreja inteira. `lider` organiza uma equipe.
-- Não existe papel 'voluntario' aqui de propósito: serviço é vínculo, e
-- vínculo mora em `voluntarios`. Ver o cabeçalho.
-- =========================================================================
do $$ begin
  create type papel_organizacional as enum ('admin', 'lider');
exception when duplicate_object then null; end $$;

create table if not exists papeis (
  id         uuid primary key default gen_random_uuid(),
  pessoa_id  uuid not null references pessoas(id) on delete cascade,
  papel      papel_organizacional not null,
  equipe_id  uuid references equipes(id) on delete cascade,
  criado_em  timestamptz not null default now(),
  criado_por text,
  /* admin é da igreja inteira e não pode ter equipe; líder é de uma equipe e
     não pode ficar sem. Sem esta regra, um 'lider' com equipe nula viraria
     admin por acidente, que é exatamente o tipo de furo que a auditoria
     achou na policy eq_lideres_ler. */
  constraint papel_com_escopo_certo check (
    (papel = 'admin' and equipe_id is null) or
    (papel = 'lider' and equipe_id is not null))
);
comment on table papeis is
  'quem organiza o quê. admin = igreja inteira, lider = uma equipe. Serviço NÃO entra aqui: quem serve tem linha em voluntarios, e quem_sou() junta os dois.';

/* uma pessoa não recebe o mesmo papel duas vezes na mesma equipe. Como
   equipe_id é nulo para admin e nulo não colide com nulo numa unique comum,
   o coalesce força a comparação a valer também para os admins. */
create unique index if not exists ux_papeis_unico
  on papeis (pessoa_id, papel, coalesce(equipe_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists ix_papeis_pessoa on papeis (pessoa_id);
create index if not exists ix_papeis_equipe on papeis (equipe_id);

alter table papeis enable row level security;
revoke all on table papeis from anon, public;
grant select on table papeis to authenticated;


-- =========================================================================
-- §3  BACKFILL: cada organizador de hoje vira pessoa e papel
--
-- Ordem importa. Primeiro casa com a pessoa que já existe (por e-mail de
-- contato ou pela ligação que a migração 32 já fez). Só quem sobrar ganha
-- linha nova, e ela nasce sem telefone, que é exatamente o caso do §1.
-- =========================================================================

-- 3a. quem já tem pessoa ligada mas não tem auth_email preenchido
update pessoas p set auth_email = l.email
  from lideres l
 where p.id = l.pessoa_id and l.email <> '' and p.auth_email is null;

-- 3b. quem casa por e-mail de contato e ainda não estava ligado
update lideres l set pessoa_id = p.id
  from pessoas p
 where l.pessoa_id is null and l.email <> '' and lower(p.email) = lower(l.email);

update pessoas p set auth_email = l.email
  from lideres l
 where p.id = l.pessoa_id and l.email <> '' and p.auth_email is null;

-- 3c. quem sobrou nasce como identidade sem telefone
insert into pessoas (nome, telefone, email, auth_email)
select split_part(l.email, '@', 1), null, l.email, l.email
  from lideres l
 where l.pessoa_id is null and l.email <> ''
   and not exists (select 1 from pessoas p where lower(p.auth_email) = lower(l.email))
    on conflict do nothing;

update lideres l set pessoa_id = p.id
  from pessoas p
 where l.pessoa_id is null and lower(p.auth_email) = lower(l.email);

-- 3d. e agora o papel, derivado exatamente do que a linha de lideres já dizia
insert into papeis (pessoa_id, papel, equipe_id, criado_por)
select l.pessoa_id,
       case when l.equipe_id is null then 'admin' else 'lider' end::papel_organizacional,
       l.equipe_id,
       'migracao 33'
  from lideres l
 where l.pessoa_id is not null
    on conflict do nothing;


-- =========================================================================
-- §4  quem_sou(): a resposta única sobre uma pessoa
--
-- É a função que faz o sistema parar de ser dois. Ela atende as DUAS portas:
--
--   com token  -> quem serve, vindo do link pessoal
--   sem token  -> quem organiza, vindo do login por e-mail
--
-- e devolve a mesma forma de resposta nos dois casos: quem é, o que organiza,
-- onde serve. A tela deixa de perguntar "que tipo de usuário é esse" e passa
-- a perguntar "o que essa pessoa pode fazer".
--
-- DECISÃO DE SEGURANÇA QUE PRECISA FICAR ESCRITA: a função lista os vínculos
-- da pessoa, mas NÃO devolve o token dos outros vínculos. Quem chega com o
-- token do Louvor descobre que também serve na Mídia, e vê os dados da Mídia
-- pelas funções que recebem o token e resolvem a pessoa. Devolver os outros
-- tokens transformaria um link vazado em chave de tudo, sem ganhar nada: a
-- pessoa não precisa do token para ver os próprios dados, precisa do token
-- para PROVAR que é ela, e um já prova.
-- =========================================================================
create or replace function quem_sou(p_token text default null)
returns jsonb
language plpgsql security definer stable set search_path = public as $fn$
declare
  v_pessoa uuid; v_email text; r jsonb;
begin
  if p_token is not null and btrim(p_token) <> '' then
    /* porta do voluntário: o token prova quem é */
    select v.pessoa_id into v_pessoa
      from voluntarios v where v.token = p_token and v.ativo;
    if v_pessoa is null then
      return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO');
    end if;
  else
    /* porta de quem organiza: o e-mail do JWT prova quem é */
    v_email := nullif(auth.jwt() ->> 'email', '');
    if v_email is null then
      return jsonb_build_object('ok', false, 'erro', 'SEM_CREDENCIAL');
    end if;
    select p.id into v_pessoa from pessoas p where lower(p.auth_email) = lower(v_email);
    if v_pessoa is null then
      /* conta autenticada que não é ninguém aqui dentro. Responde ok com
         acesso vazio em vez de erro: quem chega assim não é invasor, é
         alguém sem papel, e a tela precisa saber a diferença. */
      return jsonb_build_object('ok', true, 'conhecida', false,
                                'admin', false, 'organiza', '[]'::jsonb, 'serve', '[]'::jsonb);
    end if;
  end if;

  select jsonb_build_object(
    'ok', true,
    'conhecida', true,
    'pessoa', jsonb_build_object(
      'id', p.id,
      'nome', p.nome,
      'primeiro_nome', split_part(p.nome, ' ', 1),
      'email', p.email,
      /* só os 4 últimos: a tela precisa confirmar "é este o seu número?",
         não precisa do número inteiro trafegando. */
      'telefone_final', right(coalesce(p.telefone, ''), 4)),

    'admin', exists (select 1 from papeis x where x.pessoa_id = p.id and x.papel = 'admin'),

    'organiza', coalesce((
      select jsonb_agg(jsonb_build_object('equipe', e.nome, 'slug', e.slug) order by e.ordem)
        from papeis x join equipes e on e.id = x.equipe_id
       where x.pessoa_id = p.id and x.papel = 'lider'), '[]'::jsonb),

    'serve', coalesce((
      select jsonb_agg(jsonb_build_object(
               'equipe', e.nome, 'slug', e.slug, 'artigo', coalesce(e.artigo,'o'),
               'ativo', v.ativo, 'conferido', v.conferido, 'tem_pin', v.pin_hash is not null,
               /* o token SÓ do vínculo que a pessoa apresentou. Ver o
                  cabeçalho: um token já prova, e devolver os outros
                  transformaria um link vazado em chave de tudo. */
               /* coalesce porque sem token a comparação devolve nulo, e a
                  tela precisa de sim ou não, não de "talvez". */
               'este', coalesce(v.token = p_token, false),
               'funcoes', coalesce((select jsonb_agg(f.nome order by f.ordem)
                                      from habilidades h join funcoes f on f.id = h.funcao_id
                                     where h.voluntario_id = v.id), '[]'::jsonb))
             order by e.ordem)
        from voluntarios v join equipes e on e.id = v.equipe_id
       where v.pessoa_id = p.id and v.ativo), '[]'::jsonb)
  ) into r
  from pessoas p where p.id = v_pessoa;

  return r;
end $fn$;

revoke all on function quem_sou(text) from public;
grant execute on function quem_sou(text) to anon, authenticated;
comment on function quem_sou(text) is
  'quem é a pessoa e o que ela pode, atendendo as duas portas: token de voluntário ou e-mail de quem organiza. Não devolve token de outro vínculo, de propósito.';


-- =========================================================================
-- §5  AS PERMISSÕES PASSAM A LER PAPEIS, SEM TRANCAR NINGUÉM PARA FORA
--
-- Estas três funções alimentam as 32 policies de RLS. Errar aqui é o pior
-- estrago possível do sistema: ou um líder perde acesso ao próprio time, ou
-- alguém ganha acesso ao time do outro.
--
-- Por isso a mudança é ADITIVA, não substitutiva: cada função passa a aceitar
-- o papel NOVO **ou** a linha antiga de `lideres`. O conjunto de quem tem
-- acesso só pode crescer, e como `papeis` foi preenchida exatamente a partir
-- de `lideres` no §3, ele na prática não muda. `testar_identidade()` prova
-- isso comparando os dois caminhos linha a linha.
--
-- Quando a tela de gestão de papéis existir e `lideres` estiver vazia, o
-- segundo `or` sai numa migração de uma linha. Não antes.
-- =========================================================================
create or replace function lidera_equipe(p_equipe uuid) returns boolean
language sql security definer stable set search_path = public as $fn$
  select exists (
    -- caminho novo: papel preso à pessoa
    select 1 from papeis x
      join pessoas p on p.id = x.pessoa_id
     where lower(p.auth_email) = lower(nullif(auth.jwt() ->> 'email', ''))
       and (x.papel = 'admin' or (x.papel = 'lider' and x.equipe_id = p_equipe))
  ) or exists (
    -- caminho legado, ainda válido durante a transição
    select 1 from lideres l
     where l.email <> '' and lower(l.email) = lower(nullif(auth.jwt() ->> 'email', ''))
       and (l.equipe_id is null or l.equipe_id = p_equipe)
  );
$fn$;
grant execute on function lidera_equipe(uuid) to authenticated, anon;

create or replace function sou_lider() returns boolean
language sql security definer stable set search_path = public as $fn$
  select exists (
    select 1 from papeis x join pessoas p on p.id = x.pessoa_id
     where lower(p.auth_email) = lower(nullif(auth.jwt() ->> 'email', ''))
  ) or exists (
    select 1 from lideres l
     where l.email <> '' and lower(l.email) = lower(nullif(auth.jwt() ->> 'email', ''))
  );
$fn$;
grant execute on function sou_lider() to authenticated, anon;

create or replace function lidera_tudo() returns boolean
language sql security definer stable set search_path = public as $fn$
  select exists (
    select 1 from papeis x join pessoas p on p.id = x.pessoa_id
     where lower(p.auth_email) = lower(nullif(auth.jwt() ->> 'email', ''))
       and x.papel = 'admin'
  ) or exists (
    select 1 from lideres l
     where l.email <> '' and lower(l.email) = lower(nullif(auth.jwt() ->> 'email', ''))
       and l.equipe_id is null
  );
$fn$;
grant execute on function lidera_tudo() to authenticated, anon;

/* quem lê e escreve papeis: só admin. Líder de equipe organiza a escala, não
   distribui autoridade. */
drop policy if exists papeis_ler on papeis;
create policy papeis_ler on papeis for select to authenticated using (lidera_tudo());
drop policy if exists papeis_criar on papeis;
create policy papeis_criar on papeis for insert to authenticated with check (lidera_tudo());
drop policy if exists papeis_apagar on papeis;
create policy papeis_apagar on papeis for delete to authenticated using (lidera_tudo());


-- =========================================================================
-- §6  meu_link(): o líder que também serve chega ao próprio espaço
--
-- `quem_sou` conta que a pessoa serve em outras áreas mas NÃO devolve o token
-- delas, para que um link vazado não vire chave de tudo. Isso deixava um
-- buraco que só aparece na tela: o Jander entra por e-mail, o sistema diz
-- "você também serve no Louvor", e ele não tem como abrir o próprio espaço.
--
-- A saída não é afrouxar o `quem_sou`. É reconhecer que existem duas provas
-- de identidade de forças diferentes: o token, que é um segredo em uma URL, e
-- a sessão do Supabase Auth, que é login de verdade. Quem provou pelo login
-- pode pedir os próprios links, porque com aquela sessão ela já alcança o
-- painel inteiro. Quem provou só pelo token, não.
--
-- Devolve exclusivamente os vínculos DA PRÓPRIA PESSOA, casados por
-- pessoa_id. Não existe parâmetro que aponte para outra gente.
-- =========================================================================
create or replace function meu_link()
returns jsonb
language plpgsql security definer stable set search_path = public as $fn$
declare v_email text; v_pessoa uuid; r jsonb;
begin
  v_email := nullif(auth.jwt() ->> 'email', '');
  if v_email is null then
    return jsonb_build_object('ok', false, 'erro', 'SEM_CREDENCIAL');
  end if;

  select p.id into v_pessoa from pessoas p where lower(p.auth_email) = lower(v_email);
  if v_pessoa is null then
    return jsonb_build_object('ok', true, 'links', '[]'::jsonb);
  end if;

  select jsonb_build_object('ok', true, 'links', coalesce(jsonb_agg(
           jsonb_build_object('slug', e.slug, 'equipe', e.nome, 'token', v.token)
           order by e.ordem), '[]'::jsonb))
    into r
    from voluntarios v join equipes e on e.id = v.equipe_id
   where v.pessoa_id = v_pessoa and v.ativo;

  return r;
end $fn$;

revoke all on function meu_link() from public, anon;
grant execute on function meu_link() to authenticated;
comment on function meu_link() is
  'os links pessoais de quem está logado por e-mail, e só os dela. Existe porque quem_sou() não devolve token de outro vínculo de propósito: sessão autenticada é prova mais forte que um token em URL, então ela pode pedir o próprio link.';


-- =========================================================================
-- §7  testar_identidade(): a prova de que nada mudou de dono
--
-- `testar_permissoes()` já cobre a matriz de acesso por ministério e continua
-- valendo. Esta função cobre o que a 33 introduziu, e principalmente a
-- pergunta que decide se a migração pode ficar de pé: o conjunto de acessos
-- depois é IGUAL ao conjunto de antes?
-- =========================================================================
create or replace function testar_identidade()
returns table (caso text, esperado text, obtido text, passou boolean)
language plpgsql security invoker set search_path = public as $fn$
declare n int; m int; v_eq uuid;
begin
  -- 1. todo organizador virou pessoa
  select count(*) into n from lideres where pessoa_id is null and email <> '';
  return query select 'organizador sem identidade'::text, '0'::text, n::text, n = 0;

  -- 2. todo organizador virou papel
  select count(*) into n from lideres l where l.pessoa_id is not null;
  select count(*) into m from papeis;
  return query select 'papeis criados para cada organizador'::text, n::text, m::text, m >= n;

  -- 3. admin continua admin, líder continua líder
  select count(*) into n from lideres where equipe_id is null and pessoa_id is not null;
  select count(*) into m from papeis where papel = 'admin';
  return query select 'quantidade de admins bate'::text, n::text, m::text, n = m;

  select count(*) into n from lideres where equipe_id is not null and pessoa_id is not null;
  select count(*) into m from papeis where papel = 'lider';
  return query select 'quantidade de lideres de equipe bate'::text, n::text, m::text, n = m;

  -- 4. A PROVA PRINCIPAL: para cada equipe e cada organizador, o acesso pelo
  --    caminho novo é o mesmo do caminho antigo. Zero divergências.
  select count(*) into n from (
    select l.email, e.id as eq,
           (l.equipe_id is null or l.equipe_id = e.id) as antigo,
           exists (select 1 from papeis x join pessoas p on p.id = x.pessoa_id
                    where lower(p.auth_email) = lower(l.email)
                      and (x.papel = 'admin' or (x.papel = 'lider' and x.equipe_id = e.id))) as novo
      from lideres l cross join equipes e
     where l.email <> ''
  ) d where antigo is distinct from novo;
  return query select 'acesso novo diverge do antigo'::text, '0'::text, n::text, n = 0;

  /* 5. a constraint de escopo funciona.

     Os dois blocos abaixo tentam gravar uma linha inválida de propósito. Se a
     constraint estiver certa, ela recusa e nada é gravado. Se estiver errada,
     a linha entraria, e um teste que suja o banco que ele deveria proteger é
     pior que teste nenhum. Por isso, quando o insert PASSA, o bloco levanta
     uma exceção na sequência para desfazer o próprio estrago: o resultado do
     teste vem do código do erro, não de ter chegado ao fim. */
  begin
    insert into papeis (pessoa_id, papel, equipe_id)
    select id, 'admin', (select id from equipes limit 1) from pessoas limit 1;
    raise exception 'desfazendo' using errcode = 'triggered_action_exception';
  exception
    when check_violation then
      return query select 'admin com equipe e recusado'::text, 'recusado'::text, 'recusado'::text, true;
    when triggered_action_exception then
      return query select 'admin com equipe e recusado'::text, 'recusado'::text, 'ACEITOU'::text, false;
  end;

  begin
    insert into papeis (pessoa_id, papel, equipe_id) select id, 'lider', null from pessoas limit 1;
    raise exception 'desfazendo' using errcode = 'triggered_action_exception';
  exception
    when check_violation then
      return query select 'lider sem equipe e recusado'::text, 'recusado'::text, 'recusado'::text, true;
    when triggered_action_exception then
      return query select 'lider sem equipe e recusado'::text, 'recusado'::text, 'ACEITOU'::text, false;
  end;

  -- 6. quem_sou responde as duas portas
  select count(*) into n from voluntarios where ativo and token is not null;
  if n > 0 then
    return query
      select 'quem_sou pelo token do voluntario'::text, 'true'::text,
             (quem_sou((select token from voluntarios where ativo and token is not null
                         order by criado_em limit 1)) ->> 'ok'),
             (quem_sou((select token from voluntarios where ativo and token is not null
                         order by criado_em limit 1)) ->> 'ok') = 'true';
  end if;

  return query select 'quem_sou com token invalido'::text, 'LINK_INVALIDO'::text,
    coalesce(quem_sou('nao-existe-esse-token') ->> 'erro', '?'),
    coalesce(quem_sou('nao-existe-esse-token') ->> 'erro', '?') = 'LINK_INVALIDO';

  -- 7. meu_link exige credencial e nao vaza de terceiro
  perform set_config('request.jwt.claims', '', true);
  return query select 'meu_link sem login e recusado'::text, 'SEM_CREDENCIAL'::text,
    coalesce(meu_link() ->> 'erro', '?'),
    coalesce(meu_link() ->> 'erro', '?') = 'SEM_CREDENCIAL';

  perform set_config('request.jwt.claims',
    (select json_build_object('email', p.auth_email)::text from pessoas p
      join voluntarios v on v.pessoa_id = p.id
     where p.auth_email is not null and v.ativo limit 1), true);
  return query select 'meu_link devolve o proprio vinculo'::text, 'true'::text,
    (meu_link() ->> 'ok'), (meu_link() ->> 'ok') = 'true'
   where exists (select 1 from pessoas p join voluntarios v on v.pessoa_id = p.id
                  where p.auth_email is not null and v.ativo);
  perform set_config('request.jwt.claims', '', true);

  -- 8. papeis nao e legivel pelo anonimo
  return query select 'papeis fechada para anon'::text, 'sem grant'::text,
    case when has_table_privilege('anon', 'papeis', 'select') then 'TEM GRANT' else 'sem grant' end,
    not has_table_privilege('anon', 'papeis', 'select');
end $fn$;

revoke all on function testar_identidade() from public, anon, authenticated;
comment on function testar_identidade() is
  'prova que a migração 33 não mudou o dono de nada. O caso 4 é o que importa: acesso pelo caminho novo tem que ser idêntico ao do antigo, para toda combinação de organizador e equipe.';


/* =============================================================================
   CONFERÊNCIA
     select * from testar_identidade();     -- tem que ser tudo passou = true
     select * from testar_permissoes();     -- a matriz antiga continua valendo
     select quem_sou('<token de alguem>');  -- a resposta única

   ROLLBACK
     §5  recriar lidera_equipe, sou_lider e lidera_tudo com os corpos de
         13-organizador-por-ministerio.sql e 18-fechar-furos.sql. Como a
         mudança é aditiva, desfazer só remove o caminho novo.
     §4  drop function quem_sou(text);
     §2  drop table papeis; drop type papel_organizacional;
     §1  alter table pessoas drop column auth_email;
         (o NOT NULL de telefone NÃO deve voltar: haveria linhas sem telefone)
     §3  o backfill não precisa ser desfeito; ele só preencheu buraco.
   ============================================================================= */
