/* =============================================================================
   94 · A BASE CENTRAL DE PESSOAS, E O ESCOPO QUE O BANCO COBRA
   22/09/2026

   O pedido, nas palavras do Arthur:

     "Onde os profissionais e membros dos ministerios se cadastram para
      utilizar o sistema?"
     "Um membro NAO pode enxergar as demandas dos outros membros."
     "Essa restricao deve existir no backend/banco/RLS, nao somente na
      interface."
     "Pessoa -> Ministerio/Setor -> Papel -> Permissoes -> Escopo de acesso
      -> Demandas."

   O QUE EXISTIA, MEDIDO ANTES DE ESCREVER UMA LINHA (banco `demcel`, cadeia
   inteira ate a 93, que e a versao de producao):

   ---------------------------------------------------------------------------
   1 · QUALQUER PESSOA COM SETOR VIA TODAS AS DEMANDAS DO SETOR

     demandas.pode_ver(m, d) =
          m.papel in ('gestor','admin')
       or d.aberta_por = m.id
       or (m.setor_id is not null
           and (d.setor_solicitante = m.setor_id or d.setor_responsavel = m.setor_id))

   O terceiro ramo nao olha o papel. Um `solicitante` do Louvor via, comentava
   e anexava em toda demanda que qualquer outra pessoa do Louvor abriu. E a
   aba "Tudo" de `/demandas` abria justamente nisso, com o titulo "O que a
   igreja esta pedindo". E exatamente a frase do pedido: "ele nao pode
   simplesmente abrir /demandas e enxergar toda a base".

   Pior: o setor era a UNICA credencial. Quem estivesse cadastrado como
   `solicitante` num setor que ATENDE (Administrativo e financeiro, por
   exemplo) via a fila inteira daquele setor, sem ser da equipe.

   2 · O CONTATO DO SETOR PODIA SER QUALQUER PESSOA DO SETOR

   `contato_do_setor` ordena por papel e cai no `else 3` para quem so pede.
   Num setor sem `responsavel` com telefone, o "fale com Fulano no WhatsApp"
   da tela de "pronto" apontava para um solicitante. Com cadastro proprio
   (item 5), isso vira porta de golpe: alguem se cadastra no Financeiro com o
   proprio numero e passa a ser o WhatsApp que o sistema indica para quem
   pede reembolso.

   3 · NAO HAVIA CADASTRO. Quem entrava por e-mail e nao estava em `membros`
   lia "Quem administra o sistema de demandas cadastra em Ajustes". O unico
   jeito de existir no sistema era o administrador digitar a pessoa.

   4 · NAO HAVIA IDENTIDADE UNICA. `membros` tinha UNIQUE so em `token` e em
   `lower(auth_email)`. `email` e `telefone` aceitavam repeticao, e nada
   impedia a mesma pessoa de existir duas vezes com dois links.

   5 · NAO HAVIA "PARTICIPANTE", NEM "LIDER", NEM ESCOPO DE GESTOR. O gestor
   via e aprovava tudo, sempre. O pedido e "visao mais ampla conforme seu
   escopo".

   ---------------------------------------------------------------------------
   O MODELO QUE ESTA MIGRACAO POE NO BANCO

   PESSOA        `membros`: uma linha por pessoa. E-mail unico (nas duas
                 colunas, cruzado), telefone unico entre ativos, nome, funcao,
                 origem (`admin` ou `cadastro`), data de cadastro, e o
                 historico em `pessoas_historico`, escrito por gatilho.
   SETOR         `setor_id`: o ministerio ou a area da pessoa.
   PAPEL         solicitante < lider < responsavel < gestor < admin.
                 `lider` e novo: e o lado de QUEM PEDE, para o ministerio dele.
   PERMISSOES    `demandas.permissoes(m)`: derivadas do papel e do escopo,
                 nunca digitadas uma a uma.
   ESCOPO        quem ve o que, decidido so aqui:
                   todo mundo   o que abriu, o que acompanha, o que e dele;
                   lider        + o que o ministerio dele pediu;
                   responsavel  + a fila do setor que ele atende;
                   gestor       + os setores do escopo dele (ou todos);
                   admin        tudo.
   DEMANDAS      `participantes`: a pessoa incluida explicitamente numa
                 demanda passa a ve-la e a conversar nela, e so nela.

   O CADASTRO E O E-MAIL CONFIRMADO. `dem_cadastrar` nao aceita token: so a
   sessao do login, cujo e-mail o Supabase so emite depois de confirmado
   (`mailer_autoconfirm = false`, lido em /auth/v1/settings de producao em
   22/09/2026). Quem se cadastra nasce `solicitante`, sempre. Pedir para ser
   lider ou equipe fica registrado em `papel_pedido` e so o administrador
   decide. Ninguem escolhe o proprio papel, em nenhuma porta.

   O QUE ESTA MIGRACAO NAO FAZ, DE PROPOSITO

   · Nao mexe em `demandas.avisos` nem na rota de e-mail. Participante recebe
     o aviso dentro do sistema (`dem_avisos`), e nao por e-mail: o texto do
     e-mail diz "A sua demanda", e para quem acompanha isso seria mentira.
   · Nao expoe tabela nenhuma. O schema `demandas` continua fora da API e
     sem grant para `anon`/`authenticated`; a unica porta sao as funcoes
     `dem_*`, e cada uma pergunta `demandas.quem()` antes de qualquer coisa.
   · Nao quebra a tela que esta no ar. Toda funcao que ja existia mantem a
     assinatura e todas as chaves que devolvia; o que muda e o recorte do que
     cada pessoa enxerga, que e o conserto.
   ============================================================================= */
do $tranca$begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(94);
  end if;
end
$tranca$;

begin;

/* -------------------------------------------------------------------------
   0a · O TELEFONE NUMA FORMA SO

   `3199998888`, `31 99999-8888` e `5531999998888` sao a mesma pessoa. O
   indice unico do bloco 2 compara texto, entao o texto tem que ser um so:
   so digitos, e com o 55 na frente quando o numero tem 10 ou 11 (DDD mais
   numero). A regra de comprimento e a de `linkZap` em
   `lib/demandas/regras.ts`, e nao a de prefixo, pelo motivo escrito la: o
   DDD 55 existe e comeca com 55.
   ------------------------------------------------------------------------- */
create or replace function demandas.tel(t text) returns text
language sql immutable parallel safe as $fn$
  select case
    when d = '' then null
    when length(d) in (10, 11) then '55' || d
    else d end
    from (select regexp_replace(coalesce(t, ''), '\D', '', 'g') as d) x
$fn$;
revoke all on function demandas.tel(text) from public;
comment on function demandas.tel(text) is
  'Telefone na forma unica do sistema: so digitos, com 55 quando tem 10 ou 11. Migracao 94.';

/* -------------------------------------------------------------------------
   0 · O BANCO TEM QUE ESTAR NA 93, E SEM PESSOA REPETIDA

   Os indices unicos do bloco 1 falhariam no meio se houvesse repeticao, e o
   erro do Postgres diria a chave, que e dado de gente. Aqui a conta e feita
   antes, e a mensagem diz QUANTOS, nunca QUEM.
   ------------------------------------------------------------------------- */
do $pre$
declare v_max int; v_n int;
begin
  if to_regclass('public.schema_versao') is not null then
    select max(n) into v_max from public.schema_versao;
    if v_max is not null and v_max < 93 then
      raise exception '94 · este banco esta na % e a 94 precisa da 93. Nada foi gravado.', v_max;
    end if;
  end if;
  if to_regclass('demandas.membros') is null then
    raise exception '94 · demandas.membros nao existe. Aplique a 50 e as seguintes antes.';
  end if;

  select count(*) into v_n from (
    select lower(btrim(email)) from demandas.membros
     where nullif(btrim(email), '') is not null group by 1 having count(*) > 1) x;
  if v_n > 0 then
    raise exception '94 · % e-mail(s) repetido(s) em membros.email. Resolva antes: uma pessoa, uma linha.', v_n;
  end if;

  select count(*) into v_n from (
    select lower(btrim(auth_email)) from demandas.membros
     where nullif(btrim(auth_email), '') is not null group by 1 having count(*) > 1) x;
  if v_n > 0 then
    raise exception '94 · % e-mail(s) de login repetido(s). Resolva antes.', v_n;
  end if;

  select count(*) into v_n from demandas.membros a join demandas.membros b
    on a.id <> b.id
   and nullif(btrim(a.email), '') is not null
   and lower(btrim(a.email)) = lower(btrim(b.auth_email));
  if v_n > 0 then
    raise exception '94 · % pessoa(s) com o e-mail igual ao login de OUTRA pessoa. Resolva antes.', v_n;
  end if;

  select count(*) into v_n from (
    select demandas.tel(telefone) from demandas.membros
     where ativo and demandas.tel(telefone) is not null
     group by 1 having count(*) > 1) x;
  if v_n > 0 then
    raise exception '94 · % telefone(s) repetido(s) entre pessoas ativas. Resolva antes.', v_n;
  end if;
end $pre$;

/* -------------------------------------------------------------------------
   1 · A PESSOA

   `funcao`         o que a pessoa faz ("Designer", "Lider do Kids"). Texto
                    livre, 80 letras. Nao decide permissao nenhuma.
   `origem`         `admin` (alguem cadastrou) ou `cadastro` (ela mesma).
   `papel_pedido`   o papel que a pessoa PEDIU e ainda nao foi decidido.
   `escopo_total`   so faz sentido para gestor: true = todos os setores.
                    Nasce FALSE. Gestor sem escopo ve o que qualquer pessoa ve,
                    e a tela de administracao nao deixa salvar gestor sem
                    escolher. Os gestores que ja existem recebem TRUE no bloco
                    3, porque ate hoje gestor via tudo e nada pode mudar para
                    eles sem alguem decidir.
   `avisos_vistos_em` ate onde a pessoa ja leu os avisos dentro do sistema.
   ------------------------------------------------------------------------- */
alter table demandas.membros add column if not exists funcao text;
alter table demandas.membros add column if not exists origem text not null default 'admin';
alter table demandas.membros add column if not exists papel_pedido text;
alter table demandas.membros add column if not exists papel_pedido_em timestamptz;
/* `escopo_total` nasce num bloco proprio porque a linha que da TRUE aos
   gestores de hoje so pode rodar UMA vez: `scripts/demandas-banco.sh` aplica
   a cadeia duas vezes para provar que ela e reaplicavel, e na segunda vez um
   `update ... where papel = 'gestor'` solto transformaria em gestor de tudo
   quem o administrador tinha acabado de restringir. */
do $escopo$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'demandas' and table_name = 'membros'
                    and column_name = 'escopo_total') then
    alter table demandas.membros add column escopo_total boolean not null default false;
    update demandas.membros set escopo_total = true where papel = 'gestor';
  end if;
end $escopo$;
alter table demandas.membros add column if not exists avisos_vistos_em timestamptz;
alter table demandas.membros add column if not exists atualizado_em timestamptz not null default now();

comment on column demandas.membros.funcao is
  'O que a pessoa faz, em palavras dela ("Designer", "Lider do Kids"). Nao decide permissao. Migracao 94.';
comment on column demandas.membros.origem is
  '`admin`: alguem cadastrou. `cadastro`: a propria pessoa, em /demandas/cadastro, com e-mail confirmado. Migracao 94.';
comment on column demandas.membros.papel_pedido is
  'O papel que a pessoa PEDIU (lider ou responsavel) e ainda nao foi decidido. Quem decide e o administrador; ate la ela continua no papel que tem. Migracao 94.';
comment on column demandas.membros.escopo_total is
  'Gestor: true = todos os setores; false = so os de demandas.gestao. Nasce false. Migracao 94.';

alter table demandas.membros drop constraint if exists ck_papel;
alter table demandas.membros add constraint ck_papel
  check (papel in ('solicitante','lider','responsavel','gestor','admin'));
alter table demandas.membros drop constraint if exists ck_origem;
alter table demandas.membros add constraint ck_origem check (origem in ('admin','cadastro'));
alter table demandas.membros drop constraint if exists ck_papel_pedido;
alter table demandas.membros add constraint ck_papel_pedido
  check (papel_pedido is null or papel_pedido in ('lider','responsavel'));
alter table demandas.membros drop constraint if exists ck_funcao_tam;
alter table demandas.membros add constraint ck_funcao_tam
  check (funcao is null or length(funcao) <= 80);

/* os e-mails e telefones que ja existem, na forma que o gatilho do bloco 4
   vai gravar dai em diante. Sem isto, o indice unico do bloco 2 veria
   'Ana@x' e 'ana@x' como duas pessoas. */
update demandas.membros set email = lower(btrim(email))
 where email is distinct from lower(btrim(email));
update demandas.membros set email = null where email = '';
update demandas.membros set auth_email = lower(btrim(auth_email))
 where auth_email is distinct from lower(btrim(auth_email));
update demandas.membros set auth_email = null where auth_email = '';
update demandas.membros set telefone = demandas.tel(telefone)
 where telefone is distinct from demandas.tel(telefone);

/* formato, e nao validacao de caixa postal: um `@` com alguma coisa dos dois
   lados. `arthur@teste` passa de proposito, porque e assim que os testes do
   repositorio escrevem e-mail, e a unica prova de que um e-mail e de alguem
   e o link que chega nele, nao uma expressao regular. */
alter table demandas.membros drop constraint if exists ck_email_formato;
alter table demandas.membros add constraint ck_email_formato
  check ((email is null or email ~ '^[^@\s]+@[^@\s]+$')
     and (auth_email is null or auth_email ~ '^[^@\s]+@[^@\s]+$')) not valid;
alter table demandas.membros drop constraint if exists ck_telefone_formato;
alter table demandas.membros add constraint ck_telefone_formato
  check (telefone is null or telefone ~ '^[0-9]{10,13}$') not valid;

/* as duas CHECKs nascem `not valid` e sao validadas aqui se o que ja existe
   passar. Se nao passar, valem para toda escrita nova e a linha antiga fica
   como esta, com um aviso de quantas. Travar a migracao inteira por um
   telefone antigo digitado com 9 digitos seria trocar um cadastro torto por
   um sistema sem isolamento. */
do $valida$
declare v_n int;
begin
  select count(*) into v_n from demandas.membros
   where not ((email is null or email ~ '^[^@\s]+@[^@\s]+$')
          and (auth_email is null or auth_email ~ '^[^@\s]+@[^@\s]+$'));
  if v_n = 0 then
    alter table demandas.membros validate constraint ck_email_formato;
  else
    raise notice '94 · % pessoa(s) com e-mail fora do formato. A regra vale para o que for escrito daqui em diante.', v_n;
  end if;
  select count(*) into v_n from demandas.membros
   where telefone is not null and telefone !~ '^[0-9]{10,13}$';
  if v_n = 0 then
    alter table demandas.membros validate constraint ck_telefone_formato;
  else
    raise notice '94 · % pessoa(s) com telefone fora de 10 a 13 digitos. A regra vale para o que for escrito daqui em diante.', v_n;
  end if;
end $valida$;

/* -------------------------------------------------------------------------
   2 · UMA PESSOA, UMA LINHA

   `ix_membros_auth` (lower(auth_email)) ja existia. Entram:
     · e-mail de aviso unico;
     · telefone unico ENTRE ATIVOS: numero de celular e reaproveitado pela
       operadora, e quem saiu da igreja ha dois anos nao pode impedir quem
       chegou agora de ter o numero dele cadastrado;
     · o cruzamento das duas colunas de e-mail, que indice nao alcanca, fica
       no gatilho do bloco 4.
   ------------------------------------------------------------------------- */
create unique index if not exists ux_membros_email
  on demandas.membros (lower(email)) where email is not null;
create unique index if not exists ux_membros_telefone_ativo
  on demandas.membros (telefone) where ativo and telefone is not null;

/* -------------------------------------------------------------------------
   3 · ESCOPO DE GESTOR, PARTICIPANTES E HISTORICO DA PESSOA
   ------------------------------------------------------------------------- */
create table if not exists demandas.gestao (
  membro_id   uuid not null references demandas.membros(id) on delete cascade,
  setor_id    uuid not null references demandas.setores(id) on delete cascade,
  incluido_em timestamptz not null default now(),
  primary key (membro_id, setor_id)
);
comment on table demandas.gestao is
  'Os setores que um gestor acompanha quando `escopo_total` e falso. Migracao 94.';

create table if not exists demandas.participantes (
  demanda_id   uuid not null references demandas.demandas(id) on delete cascade,
  membro_id    uuid not null references demandas.membros(id) on delete cascade,
  incluido_por uuid references demandas.membros(id) on delete set null,
  incluido_em  timestamptz not null default now(),
  primary key (demanda_id, membro_id)
);
create index if not exists ix_participantes_membro on demandas.participantes (membro_id);
comment on table demandas.participantes is
  'Quem foi incluido explicitamente numa demanda. Ve a demanda, conversa e anexa; nao decide nada que seja de quem pediu ou de quem atende. Migracao 94.';

create table if not exists demandas.pessoas_historico (
  id        bigserial primary key,
  membro_id uuid not null references demandas.membros(id) on delete cascade,
  em        timestamptz not null default now(),
  por       uuid references demandas.membros(id) on delete set null,
  tipo      text not null,
  de        text,
  para      text,
  constraint ck_ph_tipo check (tipo in
    ('cadastro','papel','setor','ativo','escopo','pedido','contato','nome','funcao','link'))
);
create index if not exists ix_pessoas_historico on demandas.pessoas_historico (membro_id, em desc);
comment on table demandas.pessoas_historico is
  'O que mudou no cadastro de cada pessoa, quem mudou e quando. Escrito por gatilho, nunca pela tela. Migracao 94.';

do $tranca_tabelas$
declare t text;
begin
  foreach t in array array['gestao','participantes','pessoas_historico'] loop
    execute format('alter table demandas.%I enable row level security', t);
    execute format('revoke all on table demandas.%I from public', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table demandas.%I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on table demandas.%I from authenticated', t);
    end if;
  end loop;
  if exists (select 1 from pg_class where relname = 'pessoas_historico_id_seq'
              and relnamespace = 'demandas'::regnamespace) then
    execute 'revoke all on sequence demandas.pessoas_historico_id_seq from public';
  end if;
end $tranca_tabelas$;

/* a primeira linha do historico de quem ja existia, com a data real */
insert into demandas.pessoas_historico (membro_id, em, por, tipo, para)
select m.id, m.criado_em, null, 'cadastro', m.origem
  from demandas.membros m
 where not exists (select 1 from demandas.pessoas_historico h
                    where h.membro_id = m.id and h.tipo = 'cadastro');

/* -------------------------------------------------------------------------
   4 · OS GATILHOS DA PESSOA

   ANTES: a forma de gravar (e-mail minusculo, telefone so digitos, nome numa
   linha) e o cruzamento das duas colunas de e-mail. A forma mora aqui, e nao
   em cada funcao, porque sao quatro portas escrevendo em `membros` (cadastro,
   perfil, ajustes, e o que vier) e cada copia da regra e uma chance de uma
   delas esquecer.

   DEPOIS: o historico. `por` e quem a sessao diz que e (`demandas.membro`,
   posto por `demandas.quem`); nulo quando foi o sistema.
   ------------------------------------------------------------------------- */
create or replace function demandas.fn_membro_antes() returns trigger
language plpgsql as $fn$
begin
  new.nome       := coalesce(demandas.uma_linha(new.nome), new.nome);
  new.email      := nullif(lower(btrim(new.email)), '');
  new.auth_email := nullif(lower(btrim(new.auth_email)), '');
  new.telefone   := demandas.tel(new.telefone);
  new.funcao     := demandas.uma_linha(new.funcao);
  if tg_op = 'UPDATE' then new.atualizado_em := now(); end if;

  /* o cruzamento: o e-mail de uma pessoa nao pode ser o login de outra, nem
     o contrario. Sem isto, `quem()` acharia duas pessoas para o mesmo login. */
  if new.email is not null and exists (
       select 1 from demandas.membros x
        where x.id <> new.id and lower(x.auth_email) = new.email) then
    raise exception 'e-mail ja e o login de outra pessoa'
      using errcode = 'unique_violation', constraint = 'ux_membros_email_cruzado';
  end if;
  if new.auth_email is not null and exists (
       select 1 from demandas.membros x
        where x.id <> new.id and lower(x.email) = new.auth_email) then
    raise exception 'login ja e o e-mail de outra pessoa'
      using errcode = 'unique_violation', constraint = 'ux_membros_email_cruzado';
  end if;
  return new;
end $fn$;

drop trigger if exists tg_membro_antes on demandas.membros;
create trigger tg_membro_antes before insert or update on demandas.membros
  for each row execute function demandas.fn_membro_antes();

create or replace function demandas.fn_membro_historico() returns trigger
language plpgsql security definer set search_path = demandas, public as $fn$
declare
  v_por uuid := nullif(current_setting('demandas.membro', true), '')::uuid;
  v_campos text[] := '{}';
begin
  if tg_op = 'INSERT' then
    insert into demandas.pessoas_historico (membro_id, por, tipo, para)
      values (new.id, v_por, 'cadastro', new.origem);
    return null;
  end if;
  if new.papel is distinct from old.papel then
    insert into demandas.pessoas_historico (membro_id, por, tipo, de, para)
      values (new.id, v_por, 'papel', old.papel, new.papel);
  end if;
  if new.setor_id is distinct from old.setor_id then
    insert into demandas.pessoas_historico (membro_id, por, tipo, de, para)
      values (new.id, v_por, 'setor',
              (select s.nome from demandas.setores s where s.id = old.setor_id),
              (select s.nome from demandas.setores s where s.id = new.setor_id));
  end if;
  if new.ativo is distinct from old.ativo then
    insert into demandas.pessoas_historico (membro_id, por, tipo, de, para)
      values (new.id, v_por, 'ativo', old.ativo::text, new.ativo::text);
  end if;
  if new.escopo_total is distinct from old.escopo_total then
    insert into demandas.pessoas_historico (membro_id, por, tipo, de, para)
      values (new.id, v_por, 'escopo',
              case when old.escopo_total then 'todos' else 'escolhidos' end,
              case when new.escopo_total then 'todos' else 'escolhidos' end);
  end if;
  if new.papel_pedido is distinct from old.papel_pedido then
    insert into demandas.pessoas_historico (membro_id, por, tipo, de, para)
      values (new.id, v_por, 'pedido', old.papel_pedido, new.papel_pedido);
  end if;
  if new.nome is distinct from old.nome then
    insert into demandas.pessoas_historico (membro_id, por, tipo, de, para)
      values (new.id, v_por, 'nome', old.nome, new.nome);
  end if;
  if new.funcao is distinct from old.funcao then
    insert into demandas.pessoas_historico (membro_id, por, tipo, de, para)
      values (new.id, v_por, 'funcao', old.funcao, new.funcao);
  end if;
  /* contato: o historico diz QUAL campo mudou, e nao o valor. Ele e lido
     pelo administrador, e guardar cada telefone antigo de cada pessoa seria
     uma segunda agenda, que ninguem pediu. */
  if new.email is distinct from old.email then v_campos := v_campos || 'e-mail'::text; end if;
  if new.auth_email is distinct from old.auth_email then v_campos := v_campos || 'login'::text; end if;
  if new.telefone is distinct from old.telefone then v_campos := v_campos || 'telefone'::text; end if;
  if array_length(v_campos, 1) > 0 then
    insert into demandas.pessoas_historico (membro_id, por, tipo, para)
      values (new.id, v_por, 'contato', array_to_string(v_campos, ', '));
  end if;
  if new.token is distinct from old.token then
    insert into demandas.pessoas_historico (membro_id, por, tipo, para)
      values (new.id, v_por, 'link', 'link pessoal trocado');
  end if;
  return null;
end $fn$;

drop trigger if exists tg_membro_historico on demandas.membros;
create trigger tg_membro_historico after insert or update on demandas.membros
  for each row execute function demandas.fn_membro_historico();

revoke all on function demandas.fn_membro_antes() from public;
revoke all on function demandas.fn_membro_historico() from public;

/* -------------------------------------------------------------------------
   4b · QUEM ESTA CHAMANDO: O E-MAIL QUE O ADMINISTRADOR CADASTROU TAMBEM E
        PORTA

   Ate a 93, o login por e-mail so achava a pessoa por `auth_email`. Quem o
   administrador cadastrou com o e-mail no campo `email` (a coluna do aviso)
   tinha o e-mail certo no sistema e mesmo assim lia "voce nao esta no
   sistema" ao entrar com ele. Agora, sem `auth_email`, vale o `email`. Nao ha
   ambiguidade possivel: os dois sao unicos e o gatilho do bloco 4 proibe um
   ser o outro de outra pessoa.

   E o e-mail do login e comparado em minusculas dos dois lados; o JWT traz o
   que a pessoa digitou.
   ------------------------------------------------------------------------- */
create or replace function demandas.quem(p_token text)
returns demandas.membros
language plpgsql security definer set search_path = demandas, public as $fn$
declare m demandas.membros; v_email text;
begin
  if p_token is not null and btrim(p_token) <> '' then
    select * into m from demandas.membros where token = p_token and ativo;
  else
    v_email := lower(nullif(btrim(auth.jwt() ->> 'email'), ''));
    if v_email is null then return null; end if;
    select * into m from demandas.membros where lower(auth_email) = v_email and ativo;
    if m.id is null then
      select * into m from demandas.membros
       where auth_email is null and lower(email) = v_email and ativo;
    end if;
  end if;
  if m.id is not null then
    perform set_config('demandas.membro', m.id::text, true);
  end if;
  return m;
end $fn$;
revoke all on function demandas.quem(text) from public;

/* -------------------------------------------------------------------------
   5 · QUEM PODE O QUE, NUMA DEMANDA

   Cada pergunta tem UMA funcao, e toda porta que precisa da resposta chama a
   funcao em vez de reescrever a expressao. A 67 e a 88 contam o que acontece
   quando a mesma regra mora em tres lugares: um deles fica para tras e vira
   porta dos fundos.

   `pode_ver` e `pode_atender` deixam de ser IMMUTABLE porque passam a ler
   tabela (`participantes`, `gestao`). IMMUTABLE com consulta dentro deixa o
   planejador guardar a resposta, e uma pessoa tirada de uma demanda poderia
   continuar vendo o que ja nao e dela.
   ------------------------------------------------------------------------- */

/* o gestor alcanca este setor? admin sempre; gestor pelo escopo */
create or replace function demandas.no_escopo(m demandas.membros, p_setor uuid)
returns boolean language sql stable as $fn$
  select coalesce(
       m.papel = 'admin'
    or (m.papel = 'gestor' and p_setor is not null
        and (m.escopo_total
             or exists (select 1 from demandas.gestao g
                         where g.membro_id = m.id and g.setor_id = p_setor))), false)
$fn$;

/* o lado de QUEM PEDE: quem abriu, e o lider do ministerio que pediu */
create or replace function demandas.pede(m demandas.membros, d demandas.demandas)
returns boolean language sql stable as $fn$
  select coalesce(
       d.aberta_por = m.id
    or (m.papel = 'lider' and m.setor_id is not null
        and d.setor_solicitante = m.setor_id), false)
$fn$;

create or replace function demandas.participa(m demandas.membros, d demandas.demandas)
returns boolean language sql stable as $fn$
  select exists (select 1 from demandas.participantes p
                  where p.demanda_id = d.id and p.membro_id = m.id)
$fn$;

/* O CONSERTO DO ITEM 1 DO CABECALHO.

   O ramo do setor agora pede o PAPEL: so `responsavel` enxerga a fila do
   setor que atende, e so `lider` enxerga o que o ministerio dele pediu. Um
   `solicitante`, tenha o setor que tiver, enxerga o que abriu, o que
   acompanha e o que esta com ele. */
create or replace function demandas.pode_ver(m demandas.membros, d demandas.demandas)
returns boolean language sql stable as $fn$
  select coalesce(
       m.papel = 'admin'
    or d.aberta_por = m.id
    or d.responsavel_id = m.id
    or demandas.participa(m, d)
    or (m.papel = 'lider' and m.setor_id is not null
        and d.setor_solicitante = m.setor_id)
    or (m.papel = 'responsavel' and m.setor_id is not null
        and d.setor_responsavel = m.setor_id)
    or (m.papel = 'gestor'
        and (demandas.no_escopo(m, d.setor_responsavel)
             or demandas.no_escopo(m, d.setor_solicitante))), false)
$fn$;

create or replace function demandas.pode_atender(m demandas.membros, d demandas.demandas)
returns boolean language sql stable as $fn$
  select coalesce(
       m.papel = 'admin'
    or (m.papel = 'responsavel' and m.setor_id is not null
        and d.setor_responsavel = m.setor_id)
    or (m.papel = 'gestor' and demandas.no_escopo(m, d.setor_responsavel)), false)
$fn$;

/* aprovar e recusar: quem gasta e quem executa, entao o escopo que conta e o
   do setor que ATENDE, o mesmo do teto da 92 */
create or replace function demandas.pode_aprovar(m demandas.membros, d demandas.demandas)
returns boolean language sql stable as $fn$
  select coalesce(m.papel in ('gestor','admin')
                  and demandas.no_escopo(m, d.setor_responsavel), false)
$fn$;

/* "responsavel pela gestao", do documento: o gestor que alcanca QUALQUER um
   dos dois lados. Valida, cancela e reabre por quem sumiu. */
create or replace function demandas.gere(m demandas.membros, d demandas.demandas)
returns boolean language sql stable as $fn$
  select coalesce(m.papel in ('gestor','admin')
                  and (demandas.no_escopo(m, d.setor_responsavel)
                       or demandas.no_escopo(m, d.setor_solicitante)), false)
$fn$;

/* O QUE ESPERA POR ESTA PESSOA, DOS DOIS LADOS.

   `espera_pedido` e o lado de quem pede: a demanda parou esperando uma
   resposta dele, ou ficou pronta esperando ele dizer que resolveu.
   `espera_trabalho` e o lado de quem atende: chegou na fila e ninguem pegou,
   esta com ele em execucao, ou espera a aprovacao que so ele pode dar.

   O portal do solicitante le a primeira; o do profissional, a segunda. A
   mesma demanda pode esperar pela mesma pessoa dos dois lados (o
   responsavel que abriu para o proprio setor), e cada portal mostra a parte
   dele. */
create or replace function demandas.espera_pedido(m demandas.membros, d demandas.demandas)
returns text language sql stable as $fn$
  select case
    when not demandas.pede(m, d) then null
    when d.status = 'travada' and d.travada_por = 'informacao'
         and not demandas.falta_aprovacao(d) then 'responder'
    when d.status = 'concluida' and d.validada_em is null then 'validar'
    else null end
$fn$;

create or replace function demandas.espera_trabalho(m demandas.membros, d demandas.demandas)
returns text language sql stable as $fn$
  select case
    when d.status in ('concluida','cancelada') then null
    when demandas.falta_aprovacao(d) then
      case when demandas.pode_aprovar(m, d) then 'aprovar' else null end
    when d.status = 'execucao' and d.responsavel_id = m.id then 'concluir'
    when d.status = 'aberta' and d.responsavel_id is null
         and m.papel = 'responsavel' and demandas.pode_atender(m, d) then 'assumir'
    else null end
$fn$;

/* -------------------------------------------------------------------------
   6 · AS PERMISSOES, EM PALAVRAS QUE A TELA TRADUZ

   Nao existe tabela de permissao, e isso e decisao: permissao digitada uma a
   uma e o jeito mais comum de alguem ganhar, sem ninguem ver, uma coisa que o
   papel dele nao da. Aqui ela e DERIVADA do papel e do escopo, a mesma
   derivacao que as guardas usam, e a lista existe para ser LIDA (no perfil e
   na administracao), nao para ser editada.
   ------------------------------------------------------------------------- */
create or replace function demandas.permissoes(m demandas.membros)
returns jsonb language sql stable as $fn$
  select to_jsonb(array_remove(array[
    'pedir', 'acompanhar',
    case when m.papel = 'lider' then 'ver_ministerio' end,
    case when m.papel = 'lider' then 'validar_ministerio' end,
    case when m.papel = 'responsavel' then 'atender_setor' end,
    case when m.papel = 'gestor' and m.escopo_total then 'ver_tudo' end,
    case when m.papel = 'gestor' and not m.escopo_total then 'ver_escopo' end,
    case when m.papel = 'gestor' then 'atender_escopo' end,
    case when m.papel = 'gestor' then 'aprovar_escopo' end,
    case when m.papel = 'admin' then 'ver_tudo' end,
    case when m.papel = 'admin' then 'atender_tudo' end,
    case when m.papel = 'admin' then 'aprovar_tudo' end,
    case when m.papel in ('responsavel','gestor','admin') then 'ver_numeros' end,
    case when m.papel = 'admin' then 'gerir_pessoas' end,
    case when m.papel = 'admin' then 'gerir_setores' end
  ]::text[], null))
$fn$;

/* quem sou eu, numa resposta so. `dem_quem_sou`, `dem_portal`, `dem_perfil` e
   `dem_cadastrar` devolvem ISTO, e nao cada uma a sua versao. */
create or replace function demandas.eu(m demandas.membros)
returns jsonb language sql stable as $fn$
  select jsonb_build_object('ok', true,
    'id', m.id, 'nome', m.nome, 'primeiro_nome', split_part(m.nome, ' ', 1),
    'papel', m.papel, 'setor_id', m.setor_id,
    'setor', (select s.nome from demandas.setores s where s.id = m.setor_id),
    'setor_atende', coalesce((select s.atende from demandas.setores s where s.id = m.setor_id), false),
    'tem_login', m.auth_email is not null,
    'funcao', m.funcao,
    'email', coalesce(m.auth_email, m.email),
    'telefone', m.telefone,
    'criado_em', m.criado_em,
    'origem', m.origem,
    'papel_pedido', m.papel_pedido,
    'escopo_total', case when m.papel = 'admin' then true
                         when m.papel = 'gestor' then m.escopo_total else false end,
    'escopo', case when m.papel = 'gestor' and not m.escopo_total then
                coalesce((select jsonb_agg(s.nome order by s.ordem, s.nome)
                            from demandas.gestao g join demandas.setores s on s.id = g.setor_id
                           where g.membro_id = m.id), '[]'::jsonb)
              else '[]'::jsonb end,
    'atende', m.papel in ('responsavel','gestor','admin'),
    'permissoes', demandas.permissoes(m))
$fn$;

/* -------------------------------------------------------------------------
   7 · O CONTATO DO SETOR E SO DE QUEM ATENDE

   O item 2 do cabecalho. O `else 3` sai: quem so pede nao e contato de setor
   nenhum, e com cadastro proprio essa linha seria a porta de golpe.
   ------------------------------------------------------------------------- */
create or replace function demandas.contato_do_setor(p_setor uuid) returns jsonb
language sql stable as $fn$
  select jsonb_build_object('nome', x.nome, 'telefone', x.telefone)
    from demandas.membros x
   where x.ativo and x.telefone is not null
     and x.setor_id = p_setor
     and x.papel in ('responsavel','gestor','admin')
   order by case x.papel when 'responsavel' then 0 when 'gestor' then 1 else 2 end, x.nome
   limit 1
$fn$;

do $fechar$
declare r record;
begin
  for r in select p.oid::regprocedure::text as sig from pg_proc p
            where p.pronamespace = 'demandas'::regnamespace
              and p.proname in ('no_escopo','pede','participa','pode_ver','pode_atender',
                                'pode_aprovar','gere','espera_pedido','espera_trabalho',
                                'permissoes','eu','contato_do_setor','tel')
  loop
    execute format('revoke all on function %s from public', r.sig);
  end loop;
end $fechar$;

/* -------------------------------------------------------------------------
   8 · QUEM SOU, E A LISTA COM OS RECORTES DOS DOIS PORTAIS
   ------------------------------------------------------------------------- */
create or replace function public.dem_quem_sou(p_token text default null)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare m demandas.membros;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  /* 94 · as chaves de antes continuam todas aqui (id, nome, primeiro_nome,
     papel, setor_id, setor, setor_atende, tem_login); as novas vem junto. A
     tela que esta no ar le as antigas e ignora o resto.

     `avisos` e a contagem do que chegou desde a ultima vez que a pessoa abriu
     os avisos. Mora AQUI, e nao em `demandas.eu`, porque e a casca que mostra
     o numero em toda tela, e esta e a unica chamada que toda tela ja faz. */
  return demandas.eu(m) || jsonb_build_object('avisos',
    (select count(*) from demandas.avisos_de(m) a
      where a.em > coalesce(m.avisos_vistos_em, m.criado_em)));
end $fn$;

create or replace function public.dem_lista(p_token text default null, p_f jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare
  m demandas.membros; v jsonb; v_total int; v_lim int;
  v_aba text := coalesce(nullif(p_f->>'aba',''), 'tudo');
  v_busca text;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

  if (p_f ? 'setor') and nullif(p_f->>'setor','') is not null
     and p_f->>'setor' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'erro', 'SETOR_INVALIDO');
  end if;
  /* 94 · `urgentes` entra na mesma familia de `abertas` e `atrasadas`: um
     sim ou nao, e nada alem disso. */
  if (p_f ? 'abertas') and coalesce(p_f->>'abertas','') not in ('', 'true', 'false') then
    return jsonb_build_object('ok', false, 'erro', 'FILTRO_INVALIDO', 'campo', 'abertas');
  end if;
  if (p_f ? 'atrasadas') and coalesce(p_f->>'atrasadas','') not in ('', 'true', 'false') then
    return jsonb_build_object('ok', false, 'erro', 'FILTRO_INVALIDO', 'campo', 'atrasadas');
  end if;
  if (p_f ? 'urgentes') and coalesce(p_f->>'urgentes','') not in ('', 'true', 'false') then
    return jsonb_build_object('ok', false, 'erro', 'FILTRO_INVALIDO', 'campo', 'urgentes');
  end if;
  /* 89 · `-1` e `0` passavam por esta guarda, porque ela so conferia o
     FORMATO. Sao dois `if` e nao um `or` porque o segundo faz `::int`, e com
     `limite` presente e vazio o cast levantaria. */
  if (p_f ? 'limite') and coalesce(p_f->>'limite','') !~ '^[0-9]{1,6}$' then
    return jsonb_build_object('ok', false, 'erro', 'LIMITE_INVALIDO');
  end if;
  if (p_f ? 'limite') and (p_f->>'limite')::int < 1 then
    return jsonb_build_object('ok', false, 'erro', 'LIMITE_INVALIDO');
  end if;
  if (p_f ? 'status') and coalesce(p_f->>'status','')
     not in ('', 'aberta','execucao','travada','concluida','cancelada') then
    return jsonb_build_object('ok', false, 'erro', 'FILTRO_INVALIDO', 'campo', 'status');
  end if;
  /* 94 · QUATRO RECORTES NOVOS, E NENHUM DELES ALARGA NADA.

     Todo recorte e um filtro DENTRO de `pode_ver`, que continua sendo a
     primeira linha do `where`. Pedir `ministerio` sem ser lider, ou `setor`
     sem atender nada, devolve lista vazia, e nao erro: a pergunta e valida, a
     resposta e que nao ha nada ali para esta pessoa.

       participo   o que alguem incluiu esta pessoa para acompanhar
       ministerio  o que o ministerio do lider pediu
       responder   o que espera por esta pessoa do lado de quem pede
       agir        o que espera por esta pessoa do lado de quem atende

     `setor` deixa de ser "setor_responsavel = o meu" e passa a ser
     `pode_atender`: para o responsavel e a mesma coisa; para o gestor, e o
     escopo dele. */
  if v_aba not in ('tudo','minhas','setor','comigo','participo','ministerio','responder','agir') then
    return jsonb_build_object('ok', false, 'erro', 'ABA_INVALIDA');
  end if;
  /* 88 · `depois_de` SAIU (vazava a linha ancora sem `pode_ver`). Uma chave
     que sobrou de um cliente velho nao pode ser ignorada em silencio. */
  if p_f ? 'depois_de' then
    return jsonb_build_object('ok', false, 'erro', 'CURSOR_SAIU');
  end if;

  v_lim := least(greatest(coalesce((p_f->>'limite')::int, 300), 1), 300);
  v_busca := demandas.limpo(p_f->>'busca');

  with filtradas as (
    select d as linha, d.numero, d.prazo,
           (case when d.status in ('concluida','cancelada') then 1 else 0 end) k_fechada,
           (case when demandas.atrasada(d) then 0 else 1 end) k_atraso,
           (case d.prioridade when 'urgente' then 0 when 'alta' then 1
                              when 'normal' then 2 else 3 end) k_prio,
           case v_aba when 'responder' then demandas.espera_pedido(m, d)
                      when 'agir'      then demandas.espera_trabalho(m, d)
                      else null end as motivo
      from demandas.demandas d
     where demandas.pode_ver(m, d)
       and (v_aba <> 'minhas' or d.aberta_por = m.id)
       and (v_aba <> 'setor' or demandas.pode_atender(m, d))
       and (v_aba <> 'comigo' or d.responsavel_id = m.id)
       and (v_aba <> 'participo'
            or (demandas.participa(m, d) and d.aberta_por is distinct from m.id))
       and (v_aba <> 'ministerio'
            or (m.papel = 'lider' and m.setor_id is not null
                and d.setor_solicitante = m.setor_id))
       and (v_aba <> 'responder' or demandas.espera_pedido(m, d) is not null)
       and (v_aba <> 'agir' or demandas.espera_trabalho(m, d) is not null)
       and (nullif(p_f->>'status','') is null or d.status = p_f->>'status')
       and (coalesce(nullif(p_f->>'abertas','')::boolean, false) = false
            or d.status in ('aberta','execucao','travada'))
       and (coalesce(nullif(p_f->>'atrasadas','')::boolean, false) = false
            or demandas.atrasada(d))
       and (coalesce(nullif(p_f->>'urgentes','')::boolean, false) = false
            or (d.prioridade = 'urgente' and d.status in ('aberta','execucao','travada')))
       and (nullif(p_f->>'setor','') is null
            or d.setor_responsavel = (p_f->>'setor')::uuid)
       and (v_busca is null
            or d.titulo    ilike '%'||demandas.como_texto(v_busca)||'%'
            or d.descricao ilike '%'||demandas.como_texto(v_busca)||'%'
            or d.numero::text = v_busca)
  ), ordenadas as (
    select f.* from filtradas f
     order by f.k_fechada, f.k_atraso, f.k_prio, f.prazo nulls last, f.numero desc
     limit v_lim
  )
  select coalesce(jsonb_agg(
           demandas.resumo(o.linha)
             || case when o.motivo is null then '{}'::jsonb
                     else jsonb_build_object('motivo', o.motivo) end
           order by o.k_fechada, o.k_atraso, o.k_prio, o.prazo nulls last, o.numero desc), '[]'::jsonb),
         (select count(*) from filtradas)
    into v, v_total
    from ordenadas o;

  return jsonb_build_object('ok', true, 'itens', v,
                            'total', v_total, 'limite', v_lim,
                            'tem_mais', v_total > jsonb_array_length(v));
end $fn$;

/* -------------------------------------------------------------------------
   9 · A FICHA DIZ O QUE ESTA PESSOA PODE NELA, DECIDIDO AQUI

   `eu` ganha cinco respostas que a tela nao tem como calcular sozinha,
   porque dependem de escopo e de participacao: `pede`, `participa`,
   `aprova`, `gere` e `inclui`. O espelho de `lib/demandas/regras.ts` passa a
   ler estas, e para de adivinhar pelo nome do papel.
   ------------------------------------------------------------------------- */
create or replace function public.dem_ver(p_token text, p_numero integer)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare m demandas.membros; d demandas.demandas; v_interno boolean;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  select * into d from demandas.demandas where numero = p_numero;
  if d.id is null then return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;
  /* a mesma resposta para "nao existe" e "nao e sua": a diferenca entre as
     duas contaria quantas demandas a igreja tem (86). */
  if not demandas.pode_ver(m, d) then return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;
  v_interno := demandas.pode_atender(m, d);

  return jsonb_build_object('ok', true,
    'demanda', demandas.resumo(d) || jsonb_build_object(
      'descricao', d.descricao, 'objetivo', d.objetivo, 'local', d.local,
      'publico', d.publico, 'impacto', d.impacto, 'orcamento', d.orcamento,
      'sem_prazo_porque', d.sem_prazo_porque,
      'travada_nota', d.travada_nota, 'aprovacao_nota', d.aprovacao_nota,
      'conclusao', d.conclusao, 'concluida_em', d.concluida_em,
      'atraso_motivo', d.atraso_motivo, 'cancelada_motivo', d.cancelada_motivo,
      'categoria_id', d.categoria_id,
      'setor_responsavel_id', d.setor_responsavel,
      /* 91 · o nome, nao o id: a frase da ficha e "Validada por Fulano". */
      'validada_por', (select x.nome from demandas.membros x where x.id = d.validada_por),
      'responsavel_id', d.responsavel_id,
      'abriu_telefone', (select x.telefone from demandas.membros x where x.id = d.aberta_por),
      'resp_telefone', (select x.telefone from demandas.membros x where x.id = d.responsavel_id)),
    'eu', jsonb_build_object('id', m.id, 'papel', m.papel,
      'atende', demandas.pode_atender(m, d), 'abriu', d.aberta_por = m.id,
      'pede', demandas.pede(m, d),
      'participa', demandas.participa(m, d),
      'aprova', demandas.pode_aprovar(m, d),
      'gere', demandas.gere(m, d),
      'inclui', demandas.pede(m, d) or demandas.pode_atender(m, d) or demandas.gere(m, d)),
    /* 94 · quem acompanha: so o nome. E-mail e telefone de quem foi incluido
       nao saem daqui, e nem precisam: a conversa e dentro da ficha. */
    'participantes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'nome', x.nome, 'eu', x.id = m.id) order by p.incluido_em, x.nome)
      from demandas.participantes p join demandas.membros x on x.id = p.membro_id
     where p.demanda_id = d.id), '[]'::jsonb),
    'eventos', coalesce((select jsonb_agg(jsonb_build_object(
        'em', e.em, 'tipo', e.tipo, 'de', e.de, 'para', e.para, 'texto', e.texto,
        'interno', e.interno,
        'quem', (select x.nome from demandas.membros x where x.id = e.membro_id))
        order by e.em, e.id)
      /* 93 · teto de 200 no historico: sem ele a ficha media 20 MB. Os 200
         mais recentes, devolvidos em ordem crescente. */
      from (select * from demandas.eventos x
             where x.demanda_id = d.id
               and (v_interno or not x.interno)
             order by x.em desc, x.id desc
             limit 200) e), '[]'::jsonb),
    'eventos_total', (select count(*) from demandas.eventos e
                       where e.demanda_id = d.id
                         and (v_interno or not e.interno)),
    'anexos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'nome', a.nome, 'url', a.url, 'em', a.em,
        'quem', (select x.nome from demandas.membros x where x.id = a.membro_id),
        /* 89 · o servidor diz, a tela nao recalcula: a MESMA expressao do
           `desanexar`. */
        'posso_tirar', (demandas.pode_atender(m, d) or a.membro_id = m.id),
        'depois_de_fechar', d.concluida_em is not null and a.em > d.concluida_em)
        order by a.em)
      from (select * from demandas.anexos x
             where x.demanda_id = d.id and x.removido_em is null
             order by x.em limit 50) a), '[]'::jsonb));
end $fn$;

/* -------------------------------------------------------------------------
   10 · OS AVISOS DENTRO DO SISTEMA

   O que aconteceu, feito por OUTRA pessoa, numa demanda que e desta pessoa
   de algum jeito: abriu, acompanha, esta com ela, e do ministerio que ela
   lidera, chegou na fila que ela atende, ou espera a aprovacao dela. Tudo
   passa por `pode_ver`, e comentario interno so aparece para quem atende,
   igual na ficha.

   Sai do historico (`eventos`), e nao de uma tabela nova: o aviso e o mesmo
   fato que a ficha conta, e duas copias do mesmo fato discordam no dia em que
   uma delas for corrigida.
   ------------------------------------------------------------------------- */
create or replace function demandas.avisos_de(m demandas.membros)
returns table (em timestamptz, tipo text, de text, para text, texto text,
               quem text, numero int, titulo text, motivo text)
language sql stable as $fn$
  select e.em, e.tipo, e.de, e.para, left(e.texto, 280),
         (select x.nome from demandas.membros x where x.id = e.membro_id),
         d.numero, d.titulo,
         case when d.aberta_por = m.id then 'pedi'
              when d.responsavel_id = m.id then 'comigo'
              when demandas.participa(m, d) then 'acompanho'
              when demandas.pede(m, d) then 'ministerio'
              when demandas.pode_atender(m, d) then 'fila'
              else 'aprovar' end
    from demandas.eventos e
    join demandas.demandas d on d.id = e.demanda_id
   where e.em > now() - interval '60 days'
     and e.membro_id is distinct from m.id
     and demandas.pode_ver(m, d)
     and (not e.interno or demandas.pode_atender(m, d))
     and (   demandas.pede(m, d)
          or d.responsavel_id = m.id
          or demandas.participa(m, d)
          or (e.tipo in ('abertura','setor') and m.papel = 'responsavel'
              and demandas.pode_atender(m, d))
          or (e.tipo = 'abertura' and demandas.falta_aprovacao(d)
              and demandas.pode_aprovar(m, d)))
$fn$;
revoke all on function demandas.avisos_de(demandas.membros) from public;

create or replace function public.dem_avisos(p_token text default null, p_marcar boolean default false)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare m demandas.membros; v_desde timestamptz; v jsonb; v_novos int;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  v_desde := coalesce(m.avisos_vistos_em, m.criado_em);
  select coalesce(jsonb_agg(jsonb_build_object(
           'em', a.em, 'tipo', a.tipo, 'de', a.de, 'para', a.para, 'texto', a.texto,
           'quem', a.quem, 'numero', a.numero, 'titulo', a.titulo, 'motivo', a.motivo,
           'novo', a.em > v_desde) order by a.em desc), '[]'::jsonb)
    into v
    from (select * from demandas.avisos_de(m) x order by x.em desc limit 50) a;
  select count(*) into v_novos from demandas.avisos_de(m) x where x.em > v_desde;
  if p_marcar then
    update demandas.membros set avisos_vistos_em = now() where id = m.id;
  end if;
  return jsonb_build_object('ok', true, 'itens', v, 'novos', v_novos, 'vistos_em', v_desde);
end $fn$;

/* -------------------------------------------------------------------------
   11 · O PORTAL: QUEM SOU, O QUE ESPERA POR MIM, E AS CONTAS

   Uma ida ao banco para a primeira tela. Todas as contas saem da mesma base
   (`pode_ver`), entao nenhuma delas conta o que a pessoa nao pode abrir.
   ------------------------------------------------------------------------- */
create or replace function public.dem_portal(p_token text default null)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare m demandas.membros; v_n jsonb; v_precisa jsonb; v_desde timestamptz; v_avisos int;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

  with base as (select d from demandas.demandas d where demandas.pode_ver(m, d))
  select jsonb_build_object(
    'responder',  count(*) filter (where demandas.espera_pedido(m, b.d) is not null),
    'minhas_andamento', count(*) filter (where (b.d).aberta_por = m.id
                          and (b.d).status in ('aberta','execucao','travada')),
    'minhas_concluidas', count(*) filter (where (b.d).aberta_por = m.id and (b.d).status = 'concluida'),
    'minhas_todas', count(*) filter (where (b.d).aberta_por = m.id),
    'participo',  count(*) filter (where (b.d).aberta_por is distinct from m.id
                          and demandas.participa(m, b.d)
                          and (b.d).status in ('aberta','execucao','travada')),
    'ministerio', count(*) filter (where m.papel = 'lider' and m.setor_id is not null
                          and (b.d).setor_solicitante = m.setor_id
                          and (b.d).status in ('aberta','execucao','travada')),
    'agir',       count(*) filter (where demandas.espera_trabalho(m, b.d) is not null),
    'aprovar',    count(*) filter (where demandas.espera_trabalho(m, b.d) = 'aprovar'),
    'fila',       count(*) filter (where demandas.pode_atender(m, b.d)
                          and (b.d).status = 'aberta' and (b.d).responsavel_id is null
                          and not demandas.falta_aprovacao(b.d)),
    'comigo',     count(*) filter (where (b.d).responsavel_id = m.id
                          and (b.d).status in ('aberta','execucao','travada')),
    /* o que a pessoa atende e ainda esta vivo, com ou sem dono */
    'setor_abertas', count(*) filter (where demandas.pode_atender(m, b.d)
                          and (b.d).status in ('aberta','execucao','travada')),
    /* o que a fila dela ja entregou: a mesma conta que a lista "Concluidas"
       mostra quando e tocada. Numero de atalho que nao bate com a lista do
       atalho ensina a pessoa a nao confiar em nenhum dos dois. */
    'concluidas', count(*) filter (where demandas.pode_atender(m, b.d)
                          and (b.d).status = 'concluida'),
    'atrasadas',  count(*) filter (where demandas.pode_atender(m, b.d) and demandas.atrasada(b.d)),
    'urgentes',   count(*) filter (where demandas.pode_atender(m, b.d)
                          and (b.d).prioridade = 'urgente'
                          and (b.d).status in ('aberta','execucao','travada')))
    into v_n
    from base b;

  select coalesce(jsonb_agg(demandas.resumo(x.d) || jsonb_build_object('motivo', x.motivo)
           order by x.k_atraso, x.k_prio, (x.d).prazo nulls last, (x.d).numero desc), '[]'::jsonb)
    into v_precisa
    from (select d, demandas.espera_pedido(m, d) as motivo,
                 (case when demandas.atrasada(d) then 0 else 1 end) k_atraso,
                 (case d.prioridade when 'urgente' then 0 when 'alta' then 1
                                    when 'normal' then 2 else 3 end) k_prio
            from demandas.demandas d
           where demandas.pode_ver(m, d)
             and demandas.espera_pedido(m, d) is not null
           order by 3, 4, d.prazo nulls last, d.numero desc
           limit 20) x;

  v_desde := coalesce(m.avisos_vistos_em, m.criado_em);
  select count(*) into v_avisos from demandas.avisos_de(m) a where a.em > v_desde;

  /* `pedidos`: quantas pessoas pediram outro papel e esperam decisao. So o
     administrador decide, entao so para ele o numero vem diferente de zero;
     para os outros, contar isso seria dizer quanta gente pediu o que. */
  return jsonb_build_object('ok', true, 'eu', demandas.eu(m),
    'n', v_n || jsonb_build_object('avisos', v_avisos,
      'pedidos', case when m.papel = 'admin'
                      then (select count(*) from demandas.membros x
                             where x.ativo and x.papel_pedido is not null)
                      else 0 end),
    'precisa', v_precisa);
end $fn$;

/* -------------------------------------------------------------------------
   12 · O PERFIL: A PESSOA MEXE NO QUE E DELA, E SO NISSO

   Nome, telefone e funcao. E PEDIR outro papel, que so registra o pedido.

   A lista de chaves aceitas e FECHADA: qualquer outra chave recusa a chamada
   inteira, dizendo qual. Ignorar em silencio seria pior que recusar, porque
   quem manda `{"papel":"admin"}` ouviria "ok" e nao saberia se funcionou; e
   o teste que prova que nao funcionou ficaria dependendo de ler a linha de
   volta, em vez de ouvir a recusa.
   ------------------------------------------------------------------------- */
create or replace function public.dem_perfil(p_token text, p_d jsonb)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare
  m demandas.membros; v_k text; v_nome text; v_tel text; v_fun text; v_ped text;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  if jsonb_typeof(p_d) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'erro', 'DADOS_INVALIDOS'); end if;
  for v_k in select jsonb_object_keys(p_d) loop
    if v_k not in ('nome','telefone','funcao','papel_pedido') then
      return jsonb_build_object('ok', false, 'erro', 'CAMPO_NAO_PERMITIDO', 'campo', v_k);
    end if;
  end loop;

  if p_d ? 'nome' then
    v_nome := demandas.uma_linha(p_d->>'nome');
    if v_nome is null or length(v_nome) < 3 or length(v_nome) > 120 then
      return jsonb_build_object('ok', false, 'erro', 'NOME_INVALIDO', 'campo', 'nome'); end if;
  end if;
  if p_d ? 'telefone' then
    v_tel := demandas.tel(p_d->>'telefone');
    if v_tel is not null and v_tel !~ '^[0-9]{12,13}$' then
      return jsonb_build_object('ok', false, 'erro', 'TELEFONE_INVALIDO', 'campo', 'telefone'); end if;
    if v_tel is not null and exists (select 1 from demandas.membros x
                                      where x.ativo and x.telefone = v_tel and x.id <> m.id) then
      return jsonb_build_object('ok', false, 'erro', 'TELEFONE_EM_USO', 'campo', 'telefone'); end if;
  end if;
  if p_d ? 'funcao' then
    v_fun := demandas.uma_linha(p_d->>'funcao');
    if v_fun is not null and length(v_fun) > 80 then
      return jsonb_build_object('ok', false, 'erro', 'FUNCAO_LONGA', 'campo', 'funcao'); end if;
  end if;
  if p_d ? 'papel_pedido' then
    v_ped := nullif(btrim(coalesce(p_d->>'papel_pedido', '')), '');
    if v_ped is not null and v_ped not in ('lider','responsavel') then
      return jsonb_build_object('ok', false, 'erro', 'PEDIDO_INVALIDO', 'campo', 'papel_pedido'); end if;
    if v_ped is not null and (v_ped = m.papel or m.papel in ('gestor','admin')) then
      return jsonb_build_object('ok', false, 'erro', 'NADA_A_PEDIR', 'campo', 'papel_pedido'); end if;
  end if;

  update demandas.membros set
    nome = case when p_d ? 'nome' then v_nome else nome end,
    telefone = case when p_d ? 'telefone' then v_tel else telefone end,
    funcao = case when p_d ? 'funcao' then v_fun else funcao end,
    papel_pedido = case when p_d ? 'papel_pedido' then v_ped else papel_pedido end,
    papel_pedido_em = case when p_d ? 'papel_pedido'
                           then case when v_ped is null then null else now() end
                           else papel_pedido_em end
   where id = m.id
  returning * into m;
  return demandas.eu(m);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'erro', 'TELEFONE_EM_USO', 'campo', 'telefone');
  when check_violation then
    return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
end $fn$;

/* -------------------------------------------------------------------------
   13 · O CADASTRO

   Duas funcoes, e nenhuma aceita token: quem ja tem link pessoal ja esta
   cadastrado. A identidade e a do login, `auth.jwt() ->> 'email'`, que o
   Supabase so emite depois de a pessoa abrir o link que chegou no e-mail
   dela.

   `dem_cadastro()` responde so sobre QUEM PERGUNTA: sem login, cadastro
   novo, ativo ou desativado. Nao existe forma de perguntar sobre outra
   pessoa, e a pessoa desativada nao recebe nem o proprio nome de volta.

   `dem_cadastrar(p_d)` cria a pessoa como `solicitante`, SEMPRE. A lista de
   chaves e fechada como a do perfil: `papel`, `setor` alheio, `ativo`,
   `escopo`, `token`, qualquer coisa fora de nome, telefone, setor, funcao e
   pedido recusa a chamada inteira.

   O SETOR E ESCOLHIDO PELA PESSOA, E ISSO E SEGURO POR CONSTRUCAO: depois do
   bloco 5, setor sem papel nao abre nada. Quem se cadastra no Financeiro ve
   exatamente o que veria cadastrado na Pastoral: o que ele mesmo abrir.
   ------------------------------------------------------------------------- */
create or replace function public.dem_cadastro()
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare v_email text; m demandas.membros;
begin
  v_email := lower(nullif(btrim(auth.jwt() ->> 'email'), ''));
  if v_email is null then return jsonb_build_object('ok', true, 'situacao', 'sem_login'); end if;
  select * into m from demandas.membros where lower(auth_email) = v_email;
  if m.id is null then
    select * into m from demandas.membros where auth_email is null and lower(email) = v_email;
  end if;
  if m.id is not null then
    if not m.ativo then return jsonb_build_object('ok', true, 'situacao', 'inativo'); end if;
    return jsonb_build_object('ok', true, 'situacao', 'ativo',
                              'primeiro_nome', split_part(m.nome, ' ', 1));
  end if;
  return jsonb_build_object('ok', true, 'situacao', 'novo', 'email', v_email,
    'setores', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'nome', s.nome, 'atende', s.atende) order by s.ordem, s.nome)
      from demandas.setores s where s.ativo), '[]'::jsonb));
end $fn$;

create or replace function public.dem_cadastrar(p_d jsonb)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare
  v_email text; m demandas.membros; v_k text; v_nome text; v_tel text;
  v_setor uuid; v_fun text; v_ped text; v_id uuid := gen_random_uuid(); v_con text;
begin
  v_email := lower(nullif(btrim(auth.jwt() ->> 'email'), ''));
  if v_email is null then return jsonb_build_object('ok', false, 'erro', 'SEM_LOGIN'); end if;
  if jsonb_typeof(p_d) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'erro', 'DADOS_INVALIDOS'); end if;
  for v_k in select jsonb_object_keys(p_d) loop
    if v_k not in ('nome','telefone','setor_id','funcao','papel_pedido') then
      return jsonb_build_object('ok', false, 'erro', 'CAMPO_NAO_PERMITIDO', 'campo', v_k);
    end if;
  end loop;

  /* uma pessoa, uma linha: quem ja existe (pelo login ou pelo e-mail que o
     administrador cadastrou) nao ganha segunda linha. Ativo entra direto;
     desativado nao se reativa sozinho. */
  select * into m from demandas.membros
   where lower(auth_email) = v_email or (auth_email is null and lower(email) = v_email)
   limit 1;
  /* cada codigo escrito por extenso, na chamada de `jsonb_build_object`: e
     assim que `scripts/demandas-banco.sh` acha os codigos para cruzar com as
     frases da tela, e um codigo dentro de `case` escaparia da conferencia. */
  if m.id is not null and m.ativo then
    return jsonb_build_object('ok', false, 'erro', 'JA_CADASTRADO'); end if;
  if m.id is not null then
    return jsonb_build_object('ok', false, 'erro', 'DESATIVADO'); end if;

  v_nome := demandas.uma_linha(p_d->>'nome');
  if v_nome is null or length(v_nome) < 3 or length(v_nome) > 120 then
    return jsonb_build_object('ok', false, 'erro', 'NOME_INVALIDO', 'campo', 'nome'); end if;
  v_tel := demandas.tel(p_d->>'telefone');
  if v_tel is null or v_tel !~ '^[0-9]{12,13}$' then
    return jsonb_build_object('ok', false, 'erro', 'TELEFONE_INVALIDO', 'campo', 'telefone'); end if;
  if coalesce(p_d->>'setor_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'erro', 'SETOR_INVALIDO', 'campo', 'setor_id'); end if;
  select s.id into v_setor from demandas.setores s
   where s.id = (p_d->>'setor_id')::uuid and s.ativo;
  if v_setor is null then
    return jsonb_build_object('ok', false, 'erro', 'SETOR_INVALIDO', 'campo', 'setor_id'); end if;
  v_fun := demandas.uma_linha(p_d->>'funcao');
  if v_fun is not null and length(v_fun) > 80 then
    return jsonb_build_object('ok', false, 'erro', 'FUNCAO_LONGA', 'campo', 'funcao'); end if;
  v_ped := nullif(btrim(coalesce(p_d->>'papel_pedido', '')), '');
  if v_ped is not null and v_ped not in ('lider','responsavel') then
    return jsonb_build_object('ok', false, 'erro', 'PEDIDO_INVALIDO', 'campo', 'papel_pedido'); end if;
  if exists (select 1 from demandas.membros x where x.ativo and x.telefone = v_tel) then
    return jsonb_build_object('ok', false, 'erro', 'TELEFONE_EM_USO', 'campo', 'telefone'); end if;

  /* `por` do historico e a propria pessoa: o id nasce antes, para o gatilho
     de historico ja gravar quem fez. */
  perform set_config('demandas.membro', v_id::text, true);
  insert into demandas.membros (id, nome, auth_email, telefone, setor_id, papel, funcao,
                                origem, papel_pedido, papel_pedido_em, token)
  values (v_id, v_nome, v_email, v_tel, v_setor, 'solicitante', v_fun,
          'cadastro', v_ped, case when v_ped is null then null else now() end,
          encode(extensions.gen_random_bytes(12), 'hex'))
  returning * into m;
  return demandas.eu(m) || jsonb_build_object('novo', true);
exception
  when unique_violation then
    get stacked diagnostics v_con = constraint_name;
    if v_con like '%telefone%' then
      return jsonb_build_object('ok', false, 'erro', 'TELEFONE_EM_USO', 'campo', 'telefone'); end if;
    return jsonb_build_object('ok', false, 'erro', 'JA_CADASTRADO');
  when check_violation then
    return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
end $fn$;

/* -------------------------------------------------------------------------
   14 · A BASE DE PESSOAS, PARA QUEM ADMINISTRA

   `dem_pessoas` continua devolvendo `membros` com as mesmas chaves de antes
   (a tela que esta no ar le essas), mais o que a administracao nova precisa.
   `dem_pessoa` e a ficha de uma pessoa: permissoes, historico e atividade.
   As duas sao SO_ADMIN, com a porta estreita (`<> 'admin'`), e nao a larga.
   ------------------------------------------------------------------------- */
create or replace function public.dem_pessoas(p_token text default null)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare m demandas.membros;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  if m.papel <> 'admin' then return jsonb_build_object('ok', false, 'erro', 'SO_ADMIN'); end if;
  return jsonb_build_object('ok', true,
    'membros', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'nome', x.nome, 'email', x.email, 'telefone', x.telefone,
        'auth_email', x.auth_email, 'setor_id', x.setor_id, 'papel', x.papel,
        'token', x.token, 'ativo', x.ativo,
        'funcao', x.funcao, 'origem', x.origem, 'criado_em', x.criado_em,
        'papel_pedido', x.papel_pedido, 'papel_pedido_em', x.papel_pedido_em,
        'escopo_total', x.escopo_total,
        'escopo', coalesce((select jsonb_agg(g.setor_id) from demandas.gestao g
                             where g.membro_id = x.id), '[]'::jsonb),
        'pediu', (select count(*) from demandas.demandas d where d.aberta_por = x.id),
        'com_ela', (select count(*) from demandas.demandas d
                     where d.responsavel_id = x.id
                       and d.status in ('aberta','execucao','travada')))
        order by x.ativo desc, x.nome)
      from demandas.membros x), '[]'::jsonb));
end $fn$;

create or replace function public.dem_pessoa(p_token text, p_id text)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare m demandas.membros; x demandas.membros;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  if m.papel <> 'admin' then return jsonb_build_object('ok', false, 'erro', 'SO_ADMIN'); end if;
  if coalesce(p_id, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;
  select * into x from demandas.membros where id = p_id::uuid;
  if x.id is null then return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;
  return jsonb_build_object('ok', true,
    'pessoa', jsonb_build_object(
      'id', x.id, 'nome', x.nome, 'email', x.email, 'auth_email', x.auth_email,
      'telefone', x.telefone, 'setor_id', x.setor_id,
      'setor', (select s.nome from demandas.setores s where s.id = x.setor_id),
      'papel', x.papel, 'funcao', x.funcao, 'ativo', x.ativo, 'token', x.token,
      'origem', x.origem, 'criado_em', x.criado_em, 'atualizado_em', x.atualizado_em,
      'papel_pedido', x.papel_pedido, 'papel_pedido_em', x.papel_pedido_em,
      'escopo_total', x.escopo_total,
      'escopo', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome)
                                           order by s.ordem, s.nome)
                            from demandas.gestao g join demandas.setores s on s.id = g.setor_id
                           where g.membro_id = x.id), '[]'::jsonb)),
    'permissoes', demandas.permissoes(x),
    'atividade', jsonb_build_object(
      'pediu', (select count(*) from demandas.demandas d where d.aberta_por = x.id),
      'pediu_abertas', (select count(*) from demandas.demandas d
                         where d.aberta_por = x.id and d.status in ('aberta','execucao','travada')),
      'com_ela', (select count(*) from demandas.demandas d
                   where d.responsavel_id = x.id and d.status in ('aberta','execucao','travada')),
      'concluiu', (select count(*) from demandas.demandas d
                    where d.responsavel_id = x.id and d.status = 'concluida'),
      'acompanha', (select count(*) from demandas.participantes p where p.membro_id = x.id),
      'ultima', (select max(e.em) from demandas.eventos e where e.membro_id = x.id)),
    'historico', coalesce((select jsonb_agg(jsonb_build_object(
        'em', h.em, 'tipo', h.tipo, 'de', h.de, 'para', h.para,
        'por', (select y.nome from demandas.membros y where y.id = h.por)) order by h.em desc, h.id desc)
      from (select * from demandas.pessoas_historico h2
             where h2.membro_id = x.id order by h2.em desc, h2.id desc limit 100) h), '[]'::jsonb));
end $fn$;

/* -------------------------------------------------------------------------
   15 · `dem_ajustar`: A PESSOA INTEIRA, E TRES GUARDAS NOVAS

   · papel fora da lista vira PAPEL_INVALIDO, e nao `REGRA` com o texto da
     CHECK;
   · o ULTIMO administrador ativo nao deixa de ser administrador nem e
     desativado. Sem isto, um toque errado na lista trancava o sistema para
     todo mundo, sem ninguem capaz de desfazer;
   · gestor precisa de escopo: todos os setores, ou pelo menos um. Tudo e
     julgado ANTES da primeira escrita, porque `ok:false` no fim de uma
     funcao nao desfaz o que ela ja gravou.
   · pessoa nova com o mesmo nome de uma que ja existe volta HOMONIMO com a
     lista, e so entra com `confirmar_homonimo`. Homonimo existe; o que nao
     pode e o administrador cadastrar a mesma pessoa duas vezes sem ver.

   E dois alvos novos: `pedido` (aceitar ou recusar o papel que a pessoa
   pediu) e `link` (trocar o link pessoal, que invalida o antigo).
   ------------------------------------------------------------------------- */
create or replace function public.dem_ajustar(p_token text, p_o_que text, p_d jsonb)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare
  m demandas.membros; v_id uuid; v_ch text; x demandas.membros; v_con text;
  v_papel text; v_ativo boolean; v_total boolean; v_n int; v_escopo uuid[]; v_lista jsonb;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  if m.papel <> 'admin' then return jsonb_build_object('ok', false, 'erro', 'SO_ADMIN'); end if;

  /* 88 · os casts cegos da tela de ajustes */
  if (p_d ? 'id') and nullif(p_d->>'id','') is not null
     and p_d->>'id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;
  if (p_d ? 'setor_id') and nullif(p_d->>'setor_id','') is not null
     and p_d->>'setor_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'erro', 'SETOR_INVALIDO'); end if;
  if (p_d ? 'pessoa_id') and nullif(p_d->>'pessoa_id','') is not null
     and p_d->>'pessoa_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;
  for v_ch in select unnest(array['ordem','prazo_padrao_dias']) loop
    if (p_d ? v_ch) and coalesce(p_d->>v_ch,'') <> '' and p_d->>v_ch !~ '^-?[0-9]{1,6}$' then
      return jsonb_build_object('ok', false, 'erro', 'NUMERO_INVALIDO', 'campo', v_ch); end if;
  end loop;
  for v_ch in select unnest(array['atende','ativo','ativa','exige_aprovacao','exige_orcamento',
                                  'escopo_total','confirmar_homonimo']) loop
    if (p_d ? v_ch) and coalesce(p_d->>v_ch,'') not in ('','true','false') then
      return jsonb_build_object('ok', false, 'erro', 'SIM_OU_NAO', 'campo', v_ch); end if;
  end loop;
  /* 92 · o teto do setor e dinheiro; 93 · e numeric(12,2) */
  if (p_d ? 'teto_sem_aprovacao') and coalesce(p_d->>'teto_sem_aprovacao','') <> ''
     and p_d->>'teto_sem_aprovacao' !~ '^[0-9]{1,10}([.,][0-9]{1,2})?$' then
    return jsonb_build_object('ok', false, 'erro', 'VALOR_INVALIDO', 'campo', 'teto_sem_aprovacao'); end if;

  /* 89 · nome de cadastro; 92 · valida com a MESMA funcao que grava */
  if p_o_que in ('setor','categoria','membro') and nullif(p_d->>'id','') is null
     and demandas.uma_linha(p_d->>'nome') is null then
    return jsonb_build_object('ok', false, 'erro', 'FALTA_CAMPO', 'campo', 'nome'); end if;
  if p_o_que = 'categoria' and nullif(p_d->>'id','') is null
     and demandas.uma_linha(p_d->>'grupo') is null then
    return jsonb_build_object('ok', false, 'erro', 'FALTA_CAMPO', 'campo', 'grupo'); end if;
  if (p_d ? 'nome') and nullif(p_d->>'id','') is not null
     and (p_d->>'nome') is not null and demandas.uma_linha(p_d->>'nome') is null then
    return jsonb_build_object('ok', false, 'erro', 'FALTA_CAMPO', 'campo', 'nome'); end if;

  if p_o_que = 'setor' then
    if nullif(p_d->>'id','') is null then
      insert into demandas.setores (nome, slug, atende, ordem, teto_sem_aprovacao)
        values (demandas.uma_linha(p_d->>'nome'),
                coalesce(demandas.uma_linha(p_d->>'slug'),
                         lower(regexp_replace(unaccent_simples(demandas.uma_linha(p_d->>'nome')), '[^a-z0-9]+', '-', 'gi'))),
                coalesce(nullif(p_d->>'atende','')::boolean, false),
                coalesce(nullif(p_d->>'ordem','')::int, 99),
                replace(nullif(p_d->>'teto_sem_aprovacao',''), ',', '.')::numeric)
        returning id into v_id;
    else
      update demandas.setores set
        nome = coalesce(demandas.uma_linha(p_d->>'nome'), nome),
        teto_sem_aprovacao = case when p_d ? 'teto_sem_aprovacao'
                                  then replace(nullif(p_d->>'teto_sem_aprovacao',''), ',', '.')::numeric
                                  else teto_sem_aprovacao end,
        atende = coalesce(nullif(p_d->>'atende','')::boolean, atende),
        ordem = coalesce(nullif(p_d->>'ordem','')::int, ordem),
        ativo = coalesce(nullif(p_d->>'ativo','')::boolean, ativo)
       where id = (p_d->>'id')::uuid returning id into v_id;
    end if;

  elsif p_o_que = 'categoria' then
    if nullif(p_d->>'id','') is null then
      insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, exige_orcamento, prazo_padrao_dias, ordem)
        values (demandas.uma_linha(p_d->>'grupo'), demandas.uma_linha(p_d->>'nome'), nullif(p_d->>'setor_id','')::uuid,
                coalesce(nullif(p_d->>'exige_aprovacao','')::boolean, false),
                coalesce(nullif(p_d->>'exige_orcamento','')::boolean, false),
                nullif(p_d->>'prazo_padrao_dias','')::int,
                coalesce(nullif(p_d->>'ordem','')::int, 99))
        on conflict (grupo, nome) do update set
             ativa = true,
             /* 88 · os campos enviados eram IGNORADOS EM SILENCIO com ok:true */
             setor_id = excluded.setor_id,
             exige_aprovacao = excluded.exige_aprovacao,
             exige_orcamento = excluded.exige_orcamento,
             prazo_padrao_dias = excluded.prazo_padrao_dias,
             ordem = excluded.ordem
        returning id into v_id;
    else
      update demandas.categorias set
        nome = coalesce(demandas.uma_linha(p_d->>'nome'), nome),
        setor_id = coalesce(nullif(p_d->>'setor_id','')::uuid, setor_id),
        exige_aprovacao = coalesce(nullif(p_d->>'exige_aprovacao','')::boolean, exige_aprovacao),
        exige_orcamento = coalesce(nullif(p_d->>'exige_orcamento','')::boolean, exige_orcamento),
        prazo_padrao_dias = case when p_d ? 'prazo_padrao_dias'
                                 then nullif(p_d->>'prazo_padrao_dias','')::int
                                 else prazo_padrao_dias end,
        ativa = coalesce(nullif(p_d->>'ativa','')::boolean, ativa)
       where id = (p_d->>'id')::uuid returning id into v_id;
    end if;

  elsif p_o_que = 'membro' then
    /* ---- 94 · tudo que pode recusar, antes de qualquer escrita ---- */
    if (p_d ? 'papel') and nullif(p_d->>'papel','') is not null
       and p_d->>'papel' not in ('solicitante','lider','responsavel','gestor','admin') then
      return jsonb_build_object('ok', false, 'erro', 'PAPEL_INVALIDO', 'campo', 'papel'); end if;
    if (p_d ? 'telefone') and nullif(p_d->>'telefone','') is not null
       and coalesce(demandas.tel(p_d->>'telefone'), '') !~ '^[0-9]{12,13}$' then
      return jsonb_build_object('ok', false, 'erro', 'TELEFONE_INVALIDO', 'campo', 'telefone'); end if;
    for v_ch in select unnest(array['email','auth_email']) loop
      if (p_d ? v_ch) and nullif(btrim(p_d->>v_ch),'') is not null
         and btrim(p_d->>v_ch) !~ '^[^@\s]+@[^@\s]+$' then
        return jsonb_build_object('ok', false, 'erro', 'EMAIL_INVALIDO', 'campo', v_ch); end if;
    end loop;
    if (p_d ? 'funcao') and length(coalesce(demandas.uma_linha(p_d->>'funcao'), '')) > 80 then
      return jsonb_build_object('ok', false, 'erro', 'FUNCAO_LONGA', 'campo', 'funcao'); end if;
    if (p_d ? 'escopo') then
      if jsonb_typeof(p_d->'escopo') is distinct from 'array'
         or exists (select 1 from jsonb_array_elements_text(p_d->'escopo') e
                     where e !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
        return jsonb_build_object('ok', false, 'erro', 'ESCOPO_INVALIDO', 'campo', 'escopo'); end if;
      select coalesce(array_agg(distinct e::uuid), '{}') into v_escopo
        from jsonb_array_elements_text(p_d->'escopo') e;
      if (select count(*) from demandas.setores s where s.id = any(v_escopo))
         is distinct from coalesce(array_length(v_escopo, 1), 0) then
        return jsonb_build_object('ok', false, 'erro', 'ESCOPO_INVALIDO', 'campo', 'escopo'); end if;
    end if;

    if nullif(p_d->>'id','') is not null then
      select * into x from demandas.membros where id = (p_d->>'id')::uuid;
      if x.id is null then return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;
    end if;

    v_papel := coalesce(nullif(p_d->>'papel',''), x.papel, 'solicitante');
    v_ativo := coalesce(nullif(p_d->>'ativo','')::boolean, x.ativo, true);
    v_total := coalesce(nullif(p_d->>'escopo_total','')::boolean, x.escopo_total, false);

    /* o ultimo administrador ativo */
    if x.id is not null and x.papel = 'admin' and x.ativo
       and (v_papel <> 'admin' or not v_ativo)
       and not exists (select 1 from demandas.membros y
                        where y.papel = 'admin' and y.ativo and y.id <> x.id) then
      return jsonb_build_object('ok', false, 'erro', 'ULTIMO_ADMIN'); end if;

    /* gestor sem escopo nao e gestor de nada */
    if v_papel = 'gestor' and not v_total then
      v_n := case when p_d ? 'escopo' then coalesce(array_length(v_escopo, 1), 0)
                  when x.id is not null then (select count(*) from demandas.gestao g where g.membro_id = x.id)
                  else 0 end;
      if v_n = 0 then return jsonb_build_object('ok', false, 'erro', 'ESCOPO_VAZIO', 'campo', 'escopo'); end if;
    end if;

    /* o mesmo nome, numa pessoa nova */
    if x.id is null and not coalesce(nullif(p_d->>'confirmar_homonimo','')::boolean, false) then
      select jsonb_agg(jsonb_build_object('id', y.id, 'nome', y.nome,
               'setor', (select s.nome from demandas.setores s where s.id = y.setor_id),
               'ativo', y.ativo) order by y.nome)
        into v_lista
        from demandas.membros y
       where lower(unaccent_simples(y.nome)) = lower(unaccent_simples(demandas.uma_linha(p_d->>'nome')));
      if v_lista is not null then
        return jsonb_build_object('ok', false, 'erro', 'HOMONIMO', 'quem', v_lista); end if;
    end if;

    /* ---- as escritas ---- */
    if x.id is null then
      insert into demandas.membros (nome, email, telefone, auth_email, setor_id, papel, token,
                                    pessoa_id, funcao, escopo_total, origem, ativo)
        values (demandas.uma_linha(p_d->>'nome'), nullif(btrim(p_d->>'email'),''),
                demandas.tel(p_d->>'telefone'),
                lower(nullif(btrim(p_d->>'auth_email'),'')),
                nullif(p_d->>'setor_id','')::uuid,
                v_papel,
                /* 58: qualificado. O pgcrypto mora em `extensions`. */
                encode(extensions.gen_random_bytes(12), 'hex'),
                nullif(p_d->>'pessoa_id','')::uuid,
                demandas.uma_linha(p_d->>'funcao'),
                v_papel = 'gestor' and v_total,
                'admin', v_ativo)
        returning id into v_id;
    else
      update demandas.membros set
        nome = coalesce(demandas.uma_linha(p_d->>'nome'), nome),
        email = case when p_d ? 'email' then nullif(btrim(p_d->>'email'),'') else email end,
        telefone = case when p_d ? 'telefone' then demandas.tel(p_d->>'telefone') else telefone end,
        auth_email = case when p_d ? 'auth_email' then lower(nullif(btrim(p_d->>'auth_email'),'')) else auth_email end,
        setor_id = coalesce(nullif(p_d->>'setor_id','')::uuid, setor_id),
        papel = v_papel,
        ativo = v_ativo,
        funcao = case when p_d ? 'funcao' then demandas.uma_linha(p_d->>'funcao') else funcao end,
        escopo_total = (v_papel = 'gestor' and v_total),
        /* quem virou o papel que tinha pedido nao continua com o pedido aberto */
        papel_pedido = case when papel_pedido is not distinct from v_papel then null else papel_pedido end,
        papel_pedido_em = case when papel_pedido is not distinct from v_papel then null else papel_pedido_em end
       where id = x.id returning id into v_id;
    end if;

    /* o escopo de gestor: so para gestor, e trocado inteiro quando vem */
    if v_papel <> 'gestor' then
      delete from demandas.gestao where membro_id = v_id;
    elsif p_d ? 'escopo' then
      delete from demandas.gestao where membro_id = v_id;
      insert into demandas.gestao (membro_id, setor_id) select v_id, unnest(v_escopo);
      insert into demandas.pessoas_historico (membro_id, por, tipo, para)
        values (v_id, m.id, 'escopo',
                coalesce((select string_agg(s.nome, ', ' order by s.ordem, s.nome)
                            from demandas.setores s where s.id = any(v_escopo)), 'nenhum'));
    end if;

  elsif p_o_que = 'pedido' then
    if nullif(p_d->>'id','') is null then return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;
    select * into x from demandas.membros where id = (p_d->>'id')::uuid;
    if x.id is null then return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;
    if x.papel_pedido is null then return jsonb_build_object('ok', false, 'erro', 'SEM_PEDIDO'); end if;
    if coalesce(p_d->>'decisao','') = 'aceitar' then
      /* equipe de setor que nao atende nao atende nada: o administrador acerta
         o setor antes, e a tela diz isso */
      if x.papel_pedido = 'responsavel' and not exists (
           select 1 from demandas.setores s where s.id = x.setor_id and s.atende and s.ativo) then
        return jsonb_build_object('ok', false, 'erro', 'SETOR_NAO_ATENDE'); end if;
      update demandas.membros set papel = x.papel_pedido, papel_pedido = null, papel_pedido_em = null
       where id = x.id returning id into v_id;
    elsif coalesce(p_d->>'decisao','') = 'recusar' then
      update demandas.membros set papel_pedido = null, papel_pedido_em = null
       where id = x.id returning id into v_id;
    else
      return jsonb_build_object('ok', false, 'erro', 'DECISAO_INVALIDA');
    end if;

  elsif p_o_que = 'link' then
    if nullif(p_d->>'id','') is null then return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;
    update demandas.membros set token = encode(extensions.gen_random_bytes(12), 'hex')
     where id = (p_d->>'id')::uuid returning id into v_id;
    if v_id is null then return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;

  else
    return jsonb_build_object('ok', false, 'erro', 'ALVO_DESCONHECIDO');
  end if;

  if v_id is null then return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;
  return jsonb_build_object('ok', true, 'id', v_id);
exception
  when foreign_key_violation then
    return jsonb_build_object('ok', false, 'erro', 'SETOR_INVALIDO');
  when not_null_violation then
    return jsonb_build_object('ok', false, 'erro', 'FALTA_CAMPO');
  when numeric_value_out_of_range then
    return jsonb_build_object('ok', false, 'erro', 'VALOR_INVALIDO');
  when unique_violation then
    /* o codigo por extenso em cada ramo, pelo motivo escrito em
       `dem_cadastrar`: e so assim que a conferencia de `demandas-banco.sh`
       enxerga o codigo */
    get stacked diagnostics v_con = constraint_name;
    if v_con like '%telefone%' then
      return jsonb_build_object('ok', false, 'erro', 'TELEFONE_EM_USO', 'campo', 'telefone'); end if;
    if v_con like '%email%' or v_con like '%auth%' then
      return jsonb_build_object('ok', false, 'erro', 'EMAIL_EM_USO', 'campo', 'email'); end if;
    return jsonb_build_object('ok', false, 'erro', 'JA_EXISTE');
  when check_violation then return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
end $fn$;

/* -------------------------------------------------------------------------
   16 · ABRIR: O ESCOPO DO GESTOR E O TETO POR HORA

   O corpo e o da 93, inteiro, com dois trechos a mais, marcados com "94".
   ------------------------------------------------------------------------- */
create or replace function public.dem_abrir(p_token text, p_d jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'demandas', 'public'
AS $function$
declare
  m demandas.membros; c demandas.categorias; v_setor uuid; v_num int; v_id uuid;
  v_prazo date; v_evd date; v_resp uuid; v_status text; v_maus int;
  v_exige boolean; v_teto numeric; v_rep int;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

  /* 86 · cast cego. Uma categoria que nao e uuid (link velho no celular,
       bug de tela) virava `22P02 invalid input syntax for type uuid` e a
       tela imprimia o nome do tipo do Postgres para uma pessoa da igreja. */
  if coalesce(p_d->>'categoria_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'erro', 'CATEGORIA_INVALIDA'); end if;
  select * into c from demandas.categorias where id = (p_d->>'categoria_id')::uuid and ativa;
  if c.id is null then return jsonb_build_object('ok', false, 'erro', 'CATEGORIA_INVALIDA'); end if;

  /* 89 · guarda dos setores. A 88 afirmou que a 86 tinha fechado os casts de
     dem_abrir; estes dois ficaram, e o de `setor_solicitante` dispara para
     QUALQUER membro, porque o cast acontece antes da linha que descarta o
     valor de quem nao e gestor. */
  if coalesce(p_d->>'setor_solicitante','') <> ''
     and p_d->>'setor_solicitante' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'erro', 'SETOR_INVALIDO', 'campo', 'setor_solicitante'); end if;
  if coalesce(p_d->>'setor_responsavel','') <> ''
     and p_d->>'setor_responsavel' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'erro', 'SETOR_INVALIDO', 'campo', 'setor_responsavel'); end if;
  v_setor := coalesce(nullif(p_d->>'setor_solicitante','')::uuid, m.setor_id);
  if m.papel not in ('gestor','admin') then v_setor := m.setor_id; end if;
  /* 94 · gestor com escopo pede em nome dos setores do escopo dele (e do
     proprio), e nao de qualquer um. O admin e o gestor de todos continuam
     escolhendo qualquer setor, como antes. */
  if m.papel = 'gestor' and v_setor is distinct from m.setor_id
     and not demandas.no_escopo(m, v_setor) then
    return jsonb_build_object('ok', false, 'erro', 'SETOR_FORA_DO_ESCOPO'); end if;
  if v_setor is null then return jsonb_build_object('ok', false, 'erro', 'SEM_SETOR'); end if;

  v_resp := coalesce(nullif(p_d->>'setor_responsavel','')::uuid, c.setor_id, v_setor);
  if not exists (select 1 from demandas.setores s
                  where s.id = v_resp and s.ativo and s.atende) then
    return jsonb_build_object('ok', false, 'erro', 'SETOR_NAO_ATENDE');
  end if;

  /* 85 · os anexos sao julgados ANTES de a demanda nascer. Nascer e depois
     recusar o anexo deixaria a pessoa com uma demanda aberta sem o documento
     que era o motivo de ela estar abrindo. */
  if jsonb_typeof(p_d->'anexos') = 'array' then
    if jsonb_array_length(p_d->'anexos') > 20 then
      return jsonb_build_object('ok', false, 'erro', 'ANEXOS_DEMAIS'); end if;
    select count(*) into v_maus from jsonb_array_elements(p_d->'anexos') a
     where demandas.limpo(a->>'url') is not null
       and not demandas.url_boa(demandas.limpo(a->>'url'));
    if v_maus > 0 then return jsonb_build_object('ok', false, 'erro', 'URL_INVALIDA'); end if;
  end if;

  /* 86 · os outros tres casts cegos, e as duas regras que faltavam */
  if nullif(p_d->>'prazo','') is not null and p_d->>'prazo' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return jsonb_build_object('ok', false, 'erro', 'PRAZO_INVALIDO'); end if;
  if nullif(p_d->>'evento_data','') is not null and p_d->>'evento_data' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return jsonb_build_object('ok', false, 'erro', 'EVENTO_DATA_INVALIDA'); end if;
  if nullif(p_d->>'orcamento','') is not null then
    /* 93 · dez digitos inteiros, que e o que numeric(12,2) aceita. Medido:
       '999999999999999' levantava 22003 cru na cara de quem abria a demanda. */
    if p_d->>'orcamento' !~ '^[0-9]{1,10}([.,][0-9]{1,2})?$' then
      return jsonb_build_object('ok', false, 'erro', 'ORCAMENTO_INVALIDO'); end if;
  end if;
  /* `exige_orcamento` existe desde a 50, a tela de Ajustes deixa ligar, e
     nenhuma linha do banco olhava para ela. */
  if c.exige_orcamento and nullif(p_d->>'orcamento','') is null then
    return jsonb_build_object('ok', false, 'erro', 'ORCAMENTO_OBRIGATORIO'); end if;
  begin
    v_prazo := nullif(p_d->>'prazo','')::date;
    v_evd   := nullif(p_d->>'evento_data','')::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    return jsonb_build_object('ok', false, 'erro', 'PRAZO_INVALIDO');
  end;
  /* prazo no passado no momento da abertura e sempre engano de digitacao: a
     demanda nasceria ja atrasada, e a fila de quem atende passaria a mentir
     no primeiro dia. */
  /* 88 · A GUARDA DE PRAZO NO PASSADO SAIU, E A CULPA E MINHA.

     A 86 passou a recusar prazo no passado chamando isso de "sempre engano de
     digitacao". O repositorio ja tinha decidido o contrario, por escrito, em
     `scripts/demandas-banco.test.sql:227`:

       "o banco aceita prazo no passado DE PROPOSITO: demanda registrada
        depois do fato existe"

     E e verdade: "a lampada do corredor queimou semana passada, poe ai no
     sistema" e o caso normal numa igreja. Eu revertí uma decisao deliberada
     sem ler o motivo dela, e o efeito em cadeia derrubou tres casos da suite
     de 62, porque a demanda vencida que ela monta deixou de nascer.

     O que a regra realmente queria pegar e erro de digitacao, e isso se pega
     ONDE SE DIGITA: `min` no campo de data, em `app/demandas/nova/page.tsx`.
     Guarda de servidor que impede o uso legitimo para evitar um engano de
     tela e a arquitetura pagando por um problema que nao e dela. */
  /* 92 · O PORTAO DEIXA DE SER ESCOLHIDO POR QUEM PEDE.
     Medido na 91: R$ 999.999,99 na categoria "Solicitação de orçamento", que
     nao exige aprovacao, nasceram `aberta`, foram assumidos e concluidos por um
     `responsavel` sozinho, e o historico nao tem um unico evento de aprovacao.
     `exige_aprovacao` e flag da CATEGORIA, e a categoria e escolhida por quem
     pede. O teto e do setor que ATENDE, porque quem gasta e quem executa. Com
     `teto_sem_aprovacao` nulo (como a coluna nasce) esta linha nao muda nada. */
  v_teto := (select s.teto_sem_aprovacao from demandas.setores s where s.id = v_resp);
  v_exige := c.exige_aprovacao
             or (v_teto is not null
                 and coalesce(replace(nullif(p_d->>'orcamento',''), ',', '.')::numeric, 0) > v_teto);
  v_status := case when v_exige then 'travada' else 'aberta' end;

  /* 93 · O TOQUE DUPLO NAO E MA-FE, E 4G RUIM. A frase e da 85, e vale aqui.
     Medido: duas chamadas identicas seguidas criaram as demandas 142 e 143.
     `comentar` e `anexar` tem este guarda desde a 85; a abertura, que e a porta
     por onde entra quem nunca usou o sistema, nao tinha nada. O
     `disabled={indo}` da tela cobre o clique duplo; nao cobre recarregar a
     pagina achando que nao foi.

     Mesma janela da 85 (20 segundos), mesma pessoa, e o titulo JA LIMPO por
     `uma_linha`: comparar o texto cru deixaria passar a mesma frase com um
     invisivel a mais, que e o que a 92 mediu acontecendo. */
  select d2.numero into v_rep from demandas.demandas d2
   where d2.aberta_por = m.id
     and d2.titulo is not distinct from demandas.uma_linha(p_d->>'titulo')
     and d2.criada_em > now() - interval '20 seconds'
   order by d2.criada_em desc, d2.numero desc
   limit 1;
  if v_rep is not null then
    /* a resposta e a MESMA da abertura normal, com o numero da que ja existe:
       a tela de "pronto" monta o recado de WhatsApp com estes tres campos, e
       uma resposta encurtada faria quem tocou duas vezes perder o botao de
       avisar quem vai atender. */
    return jsonb_build_object('ok', true, 'numero', v_rep, 'repetido', true,
      'precisa_aprovacao', v_exige,
      'setor_responsavel', (select s.nome from demandas.setores s where s.id = v_resp),
      'contato', demandas.contato_do_setor(v_resp));
  end if;

  /* 94 · O CADASTRO E ABERTO, ENTAO A PORTA DE ABRIR PRECISA DE TETO.

     Cada demanda nova manda e-mail para a equipe do setor. Com cadastro
     proprio, uma conta criada para isso poderia abrir centenas numa tarde e
     encher a caixa de quem atende. Dez por hora e mais do que alguem de um
     ministerio abre num dia normal, e a equipe (que registra pedido dos
     outros em lote) nao entra na conta. Vem DEPOIS do toque duplo, que
     devolve a demanda que ja existe e nao conta como abertura nova. */
  if m.papel in ('solicitante','lider')
     and (select count(*) from demandas.demandas x
           where x.aberta_por = m.id and x.criada_em > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'erro', 'MUITAS_DE_UMA_VEZ');
  end if;

  insert into demandas.demandas (
    titulo, descricao, objetivo, local, publico,
    categoria_id, setor_solicitante, setor_responsavel,
    prioridade, impacto, prazo, sem_prazo_porque, evento, evento_data, orcamento,
    aberta_por, status, travada_por, travada_nota, aprovacao)
  values (
    /* 92 · o titulo e UMA linha e e o que distingue uma demanda de outra na
       lista; a descricao e varias e o `\n` dela e conteudo. Ver o item 1. */
    demandas.uma_linha(p_d->>'titulo'), demandas.limpo(p_d->>'descricao'), demandas.limpo(p_d->>'objetivo'),
    demandas.limpo(p_d->>'local'), demandas.limpo(p_d->>'publico'),
    c.id, v_setor, v_resp,
    coalesce(nullif(p_d->>'prioridade',''), 'normal'),
    demandas.limpo(p_d->>'impacto'),
    v_prazo, demandas.limpo(p_d->>'sem_prazo_porque'),
    demandas.limpo(p_d->>'evento'), v_evd,
    replace(nullif(p_d->>'orcamento',''), ',', '.')::numeric,
    m.id, v_status,
    case when v_exige then 'aprovacao' else null end,
    case when v_exige and not c.exige_aprovacao
         then 'O valor passa do teto que este setor pode gastar sem aprovação.'
         when v_exige
         then 'Esta categoria exige aprovação antes da execução.' else null end,
    case when v_exige then 'pendente' else null end)
  returning id, numero into v_id, v_num;

  insert into demandas.eventos (demanda_id, membro_id, tipo, para, texto)
    values (v_id, m.id, 'abertura', v_status, null);

  if jsonb_typeof(p_d->'anexos') = 'array' then
    insert into demandas.anexos (demanda_id, nome, url, membro_id)
      select v_id,
             demandas.rotulo_do_anexo(a->>'nome', demandas.limpo(a->>'url')),
             demandas.limpo(a->>'url'), m.id
        from jsonb_array_elements(p_d->'anexos') a
       where demandas.limpo(a->>'url') is not null
      on conflict do nothing;
  end if;

  return jsonb_build_object('ok', true, 'numero', v_num,
    'precisa_aprovacao', v_exige,
    'setor_responsavel', (select s.nome from demandas.setores s where s.id = v_resp),
    /* 93 · a mesma frase que a resposta de toque duplo devolve, e por isso ela
       mora numa funcao so. Ver o bloco 1. */
    'contato', demandas.contato_do_setor(v_resp));
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
  /* 93 · a rede embaixo da regex. Ver o item 4 do cabecalho. */
  when numeric_value_out_of_range then
    return jsonb_build_object('ok', false, 'erro', 'ORCAMENTO_INVALIDO');
  when not_null_violation then
    return jsonb_build_object('ok', false, 'erro', 'FALTA_CAMPO', 'regra', SQLERRM);
  when foreign_key_violation then
    return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
end $function$
;

/* -------------------------------------------------------------------------
   17 · MOVER: AS GUARDAS PASSAM A PERGUNTAR AS FUNCOES DO BLOCO 5

   O corpo e o da 93, inteiro. O que muda, e so isto:

     anexar        + lider de quem pediu e participante
     travar        reabrir aprovacao concedida: `pode_aprovar`, e nao papel
     destravar     `pede` no lugar de `aberta_por`
     aprovar       `pode_aprovar`, e nao "qualquer gestor"
     redirecionar  so quem ATENDE (o gestor de fora nao mexe na fila dos outros)
     cancelar      `pede` ou `gere` no lugar de `aberta_por` ou papel
     reabrir       idem
     validar       idem
     incluir/tirar novas: a lista de quem acompanha

   Nenhuma guarda fica mais larga do que era para quem ja existia: admin e
   gestor de todos os setores passam em tudo que passavam.
   ------------------------------------------------------------------------- */
create or replace function public.dem_mover(p_token text, p_numero integer, p_acao text, p_d jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'demandas', 'public'
AS $function$
declare
  m demandas.membros; d demandas.demandas; x demandas.membros;
  v_chave text; v_dig text; v_n2 int;
  v_txt text := demandas.limpo(p_d->>'texto');
  v_motivo text := coalesce(p_d->>'motivo','');
  v_url text; v_rot text; v_n int;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

  /* `for update` segura a linha ate o fim da transacao. Quem chegar depois
     espera, e entao rele o estado JA gravado, que e o estado que o guarda de
     JA_FECHADA precisa julgar. */
  select * into d from demandas.demandas where numero = p_numero for update;

  if d.id is null then return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;
  if not demandas.pode_ver(m, d) then
    /* 86 · ERA 'SEM_ACESSO'. A diferenca entre as duas respostas contava,
       para quem tivesse qualquer token valido, quantas demandas a igreja tem
       e em que ritmo nascem: `numero` e sequencial. Nao vaza conteudo; vaza
       volume. */
    return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;

  /* 84 · A CURA. Se o portao esta aberto pela categoria mas a coluna nunca
     soube disso, o banco passa a dizer em voz alta o que a guarda ja ia
     cobrar em silencio. */
  if d.aprovacao is null and demandas.falta_aprovacao(d) then
    /* 88 · TRES CONSERTOS NESTE BLOCO.

       1. `travada_por` passa a ser 'aprovacao' SEMPRE, e nao so quando a
          demanda estava aberta ou em execucao. Uma demanda travada por
          'informacao' cuja categoria passa a exigir aprovacao ficava
          dizendo "falta informacao" sobre uma compra parada na lideranca, e
          `destravar` recusava para quem atende E para quem abriu: dois botoes
          mortos. A trava antiga vai para a nota, para nao se perder.

       2. O `insert` manual de evento SAIU. `fn_historico` ja grava a mudanca
          de `aprovacao`; os dois juntos escreviam a mesma coisa duas vezes.

       3. `demandas.membro` e limpo durante o update, para o gatilho gravar
          `membro_id` nulo. Sem isso o historico afirmava que quem passou por
          ali e so comentou tinha posto a demanda em aprovacao. Num sistema
          que existe para responder "quem pos isso aqui", isso e registro
          falso. */
    perform set_config('demandas.membro', '', true);
    update demandas.demandas
       set aprovacao = 'pendente',
           status = case when status in ('aberta','execucao') then 'travada' else status end,
           travada_por = 'aprovacao',
           travada_nota = 'A categoria passou a exigir aprovação depois que esta demanda foi aberta.'
             || case when travada_nota is not null and travada_por is distinct from 'aprovacao'
                     then ' (antes estava parada por: ' || travada_nota || ')' else '' end
     where id = d.id;
    perform set_config('demandas.membro', coalesce(m.id::text, ''), true);
    select * into d from demandas.demandas where id = d.id for update;
  end if;

  /* Demanda fechada so aceita comentario, anexo e reabertura. */
  /* 94 · `tirar` entra: sair de uma demanda que ja fechou tem que ser
     possivel, senao quem foi incluido por engano fica preso nela para sempre. */
  if d.status in ('concluida','cancelada')
     and p_acao not in ('comentar','anexar','desanexar','reabrir','validar','tirar') then
    return jsonb_build_object('ok', false, 'erro', 'JA_FECHADA');
  end if;

  if p_acao = 'comentar' then
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'TEXTO_VAZIO'); end if;
    /* 85 · O TOQUE DUPLO NAO E MA-FE, E 4G RUIM. O mesmo texto, da mesma
       pessoa, na mesma demanda, em 20 segundos, e o mesmo comentario.
       Devolve `ok` de proposito: para quem tocou duas vezes o resultado
       desejado ja aconteceu, e erro em tela para acao que deu certo e pior
       que silencio. */
    if exists (select 1 from demandas.eventos e
                where e.demanda_id = d.id and e.membro_id = m.id
                  and e.tipo = 'comentario' and e.texto = v_txt
                  and e.em > now() - interval '20 seconds') then
      return jsonb_build_object('ok', true, 'repetido', true);
    end if;
    insert into demandas.eventos (demanda_id, membro_id, tipo, texto, interno)
      values (d.id, m.id, 'comentario', v_txt,
              coalesce(nullif(p_d->>'interno','') in ('true','t'), false) and demandas.pode_atender(m, d));
    update demandas.demandas set mexida_em = now() where id = d.id;

  elsif p_acao = 'anexar' then
    /* 85 · ERA `pode_ver`, que e todo mundo do setor. `destravar`, que e
       menos perigosa, ja exigia este par. */
    /* 94 · o lider do ministerio que pediu e quem foi incluido tambem juntam
       documento. Quem so enxergava por ser do setor, nao: esse ramo acabou. */
    if not (demandas.pode_atender(m, d) or demandas.pede(m, d) or demandas.participa(m, d)) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    v_url := demandas.limpo(p_d->>'url');
    if v_url is null then return jsonb_build_object('ok', false, 'erro', 'URL_VAZIA'); end if;
    if not demandas.url_boa(v_url) then
      return jsonb_build_object('ok', false, 'erro', 'URL_INVALIDA'); end if;
    select count(*) into v_n from demandas.anexos
     where demanda_id = d.id and removido_em is null;
    if v_n >= 20 then return jsonb_build_object('ok', false, 'erro', 'ANEXOS_DEMAIS'); end if;
    v_rot := demandas.rotulo_do_anexo(p_d->>'nome', v_url);
    /* o mesmo link duas vezes e toque duplo */
    if exists (select 1 from demandas.anexos
                where demanda_id = d.id and url = v_url and removido_em is null) then
      return jsonb_build_object('ok', true, 'repetido', true);
    end if;
    insert into demandas.anexos (demanda_id, nome, url, membro_id)
      values (d.id, v_rot, v_url, m.id);
    insert into demandas.eventos (demanda_id, membro_id, tipo, texto)
      values (d.id, m.id, 'anexo', v_rot);
    update demandas.demandas set mexida_em = now() where id = d.id;

  elsif p_acao = 'desanexar' then
    /* 88 · guarda do anexo_id. A unica acao de dem_mover que LEVANTAVA em vez de devolver
       {ok:false}: o cast de `anexo_id` era cego, e o `exception` da funcao so
       pega check_violation e unique_violation. A 86 fechou os casts de
       dem_mover, e este nasceu na 85, depois da leitura. */
    if coalesce(p_d->>'anexo_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('ok', false, 'erro', 'ANEXO_NAO_ENCONTRADO', 'campo', 'anexo_id'); end if;
    /* 85 · quem atende tira qualquer um; quem colou tira o proprio. Marca, nao
       apaga: a pergunta que se faz depois de um boleto trocado e "quem pos
       isso aqui, e quando", e apagar a linha faz o historico responder que
       nunca existiu. */
    update demandas.anexos a
       set removido_em = now(), removido_por = m.id
     where a.demanda_id = d.id and a.removido_em is null
       and a.id = (p_d->>'anexo_id')::uuid
       and (demandas.pode_atender(m, d) or a.membro_id = m.id)
     returning a.nome into v_rot;
    if v_rot is null then return jsonb_build_object('ok', false, 'erro', 'ANEXO_NAO_ENCONTRADO', 'campo', 'anexo_id'); end if;
    insert into demandas.eventos (demanda_id, membro_id, tipo, texto)
      values (d.id, m.id, 'anexo', 'Tirou o anexo: ' || v_rot);
    update demandas.demandas set mexida_em = now() where id = d.id;

  elsif p_acao = 'assumir' then
    if not demandas.pode_atender(m, d) then return jsonb_build_object('ok', false, 'erro', 'NAO_E_SEU_SETOR'); end if;
    if demandas.falta_aprovacao(d) then return jsonb_build_object('ok', false, 'erro', 'FALTA_APROVACAO'); end if;
    /* 86 · Duas pessoas tocando em "assumir" no mesmo segundo: o `for update`
       serializa, mas serializar nao decide. Sem esta guarda as duas escritas
       acontecem em ordem e vence a ultima, e a primeira nao fica sabendo que
       perdeu a demanda. */
    if d.responsavel_id is not null and d.responsavel_id <> m.id then
      return jsonb_build_object('ok', false, 'erro', 'JA_TEM_DONO',
        'quem', (select x.nome from demandas.membros x where x.id = d.responsavel_id)); end if;
    update demandas.demandas
       set responsavel_id = m.id, status = 'execucao', travada_por = null, travada_nota = null
     where id = d.id;

  elsif p_acao = 'travar' then
    if not demandas.pode_atender(m, d) then return jsonb_build_object('ok', false, 'erro', 'NAO_E_SEU_SETOR'); end if;
    if v_motivo not in ('informacao','aprovacao','terceiros') then
      return jsonb_build_object('ok', false, 'erro', 'MOTIVO_INVALIDO'); end if;
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'TEXTO_VAZIO'); end if;
    if demandas.falta_aprovacao(d) and v_motivo <> 'aprovacao' then
      return jsonb_build_object('ok', false, 'erro', 'FALTA_APROVACAO'); end if;
    /* 92 · A GUARDA ERA NULL, E NULL NAO ENTRA EM RAMO NENHUM.
       Com a categoria sem aprovacao, `d.aprovacao` e NULL, `d.aprovacao =
       'aprovada'` e NULL, e o `and` inteiro e NULL. Medido: um `responsavel`
       travava por aprovacao uma demanda que nunca teve portao, e depois disso
       nem ele nem quem abriu conseguiam desfazer (`destravar` devolve
       FALTA_APROVACAO, `aprovar` devolve SO_GESTOR). O `coalesce` le NULL como
       "nao ha aprovacao pendente", que e o que NULL significa nesta coluna. */
    /* 93 · NULL NAO E "JA FOI APROVADA", E "NUNCA HOUVE PORTAO".
       O `coalesce` da 92 lia os dois estados como um so e barrava quem atende
       numa demanda que nunca teve aprovacao nenhuma. Medido: em execucao,
       categoria sem portao, `responsavel` -> SO_GESTOR_REABRE_APROVACAO, e o
       gestor passando. Isso mata a metade "equipe responsavel" da Etapa 2 do
       documento e o fluxo de excecao inteiro, e a tela oferece a opcao assim
       mesmo (o seletor so a esconde com `aprovacao === 'aprovada'`).

       `NULL is not distinct from 'aprovada'` e FALSO, entao quem atende
       escala; `'aprovada' is not distinct from 'aprovada'` e VERDADEIRO,
       entao o beco que a 92 fechou continua fechado. E a escalada tem saida:
       ela deixa `aprovacao = 'pendente'`, e ai `aprovar` e `rejeitar` do
       gestor enxergam a demanda. */
    /* 94 · "quem decide" e quem pode aprovar ESTA demanda, e nao qualquer
       gestor: com escopo, o gestor de outro setor nao reabre a aprovacao que
       o do setor concedeu. */
    if v_motivo = 'aprovacao'
       and d.aprovacao is not distinct from 'aprovada'
       and not demandas.pode_aprovar(m, d) then
      return jsonb_build_object('ok', false, 'erro', 'SO_GESTOR_REABRE_APROVACAO'); end if;
    update demandas.demandas
       set status = 'travada', travada_por = v_motivo, travada_nota = v_txt,
           aprovacao = case when v_motivo = 'aprovacao' then 'pendente' else aprovacao end,
           aprovada_por = case when v_motivo = 'aprovacao' then null else aprovada_por end,
           aprovada_em  = case when v_motivo = 'aprovacao' then null else aprovada_em end
     where id = d.id;

  elsif p_acao = 'destravar' then
    if not (demandas.pode_atender(m, d) or demandas.pede(m, d)) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    if d.status <> 'travada' then return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_TRAVADA'); end if;
    if demandas.falta_aprovacao(d) then
      return jsonb_build_object('ok', false, 'erro', 'FALTA_APROVACAO'); end if;
    /* 92 · A ETAPA QUE FALTAVA PARA A REGRA 5 DO DOCUMENTO.
       "demandas de compra devem conter orcamento estimado, quando possivel",
       e a triagem so descobre que falta valor DEPOIS da abertura. A trava por
       informacao e justamente a pergunta; a resposta dela agora pode trazer o
       numero. A expressao regular e a mesma de `dem_abrir`, para nao existirem
       duas ideias de "isto e dinheiro". */
    if (p_d ? 'orcamento') and nullif(p_d->>'orcamento','') is not null then
      /* 93 · a regex limitava o FORMATO e nao o TAMANHO. `orcamento` e
         numeric(12,2) e o valor de quinze digitos da medida levantava 22003
         cru, que chega na tela como "Não consegui. Tente de novo". Dez digitos
         inteiros e exatamente o que a coluna aceita: R$ 9.999.999.999,99
         continua entrando. */
      if p_d->>'orcamento' !~ '^[0-9]{1,10}([.,][0-9]{1,2})?$' then
        return jsonb_build_object('ok', false, 'erro', 'ORCAMENTO_INVALIDO'); end if;
      update demandas.demandas
         set orcamento = replace(p_d->>'orcamento', ',', '.')::numeric
       where id = d.id;
      select * into d from demandas.demandas where id = d.id for update;
    end if;
    if v_txt is not null then
      insert into demandas.eventos (demanda_id, membro_id, tipo, texto)
        values (d.id, m.id, 'comentario', v_txt);
    end if;
    /* 92 · se o valor que acabou de chegar passa do teto do setor, destravar
       nao e soltar: e trocar de portao. Sem isto a demanda voltaria para
       `aberta` com `falta_aprovacao` ja verdadeiro, e a proxima acao qualquer
       e que a travaria, com a pessoa sem entender o que mudou. */
    update demandas.demandas
       set status = case when demandas.falta_aprovacao(d) then 'travada'
                         when responsavel_id is null then 'aberta' else 'execucao' end,
           travada_por = case when demandas.falta_aprovacao(d) then 'aprovacao' else null end,
           travada_nota = case when demandas.falta_aprovacao(d)
                               then 'O valor informado passa do teto que este setor pode gastar sem aprovação.'
                               else null end,
           aprovacao = case when demandas.falta_aprovacao(d) then 'pendente' else aprovacao end
     where id = d.id;

  elsif p_acao in ('aprovar','rejeitar') then
    /* 94 · o escopo do gestor alcanca o setor que ATENDE (quem gasta) */
    if not demandas.pode_aprovar(m, d) then return jsonb_build_object('ok', false, 'erro', 'SO_GESTOR'); end if;
    if not demandas.falta_aprovacao(d) then
      return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_PENDENTE'); end if;
    if p_acao = 'aprovar' then
      update demandas.demandas
         set aprovacao = 'aprovada', aprovada_por = m.id, aprovada_em = now(),
             aprovacao_nota = v_txt,
             status = case when responsavel_id is null then 'aberta' else 'execucao' end,
             travada_por = null, travada_nota = null
       where id = d.id;
    else
      if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'TEXTO_VAZIO'); end if;
      update demandas.demandas
         set aprovacao = 'rejeitada', aprovada_por = m.id, aprovada_em = now(),
             aprovacao_nota = v_txt, status = 'cancelada',
             cancelada_motivo = 'Aprovação recusada: ' || v_txt,
             travada_por = null, travada_nota = null
       where id = d.id;
    end if;

  elsif p_acao = 'prazo' then
    if not demandas.pode_atender(m, d) then return jsonb_build_object('ok', false, 'erro', 'NAO_E_SEU_SETOR'); end if;
    /* 86 · TRES COISAS AQUI.
       1. cast cego: "amanha" virava `22P02 invalid input syntax for type
          date`, e a tela imprimia isso.
       2. `{}` (a tela manda isso quando o campo volta vazio) APAGAVA o prazo
          e respondia ok. Agora sem a chave nao mexe em nada, e apagar e um
          pedido explicito.
       3. apagar o prazo sem dizer por que deixava `ck_prazo` satisfeita pelo
          texto que ja estava la, de outra vez. */
    if not (p_d ? 'prazo') then return jsonb_build_object('ok', false, 'erro', 'PRAZO_NAO_VEIO'); end if;
    if nullif(p_d->>'prazo','') is not null
       and p_d->>'prazo' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      return jsonb_build_object('ok', false, 'erro', 'PRAZO_INVALIDO'); end if;
    if nullif(p_d->>'prazo','') is null and v_txt is null then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PRAZO_PRECISA_MOTIVO'); end if;
    begin
      update demandas.demandas set prazo = nullif(p_d->>'prazo','')::date,
        sem_prazo_porque = case when nullif(p_d->>'prazo','') is null
                                then v_txt else sem_prazo_porque end
       where id = d.id;
    exception when invalid_datetime_format or datetime_field_overflow then
      return jsonb_build_object('ok', false, 'erro', 'PRAZO_INVALIDO');
    end;

  elsif p_acao = 'prioridade' then
    if not demandas.pode_atender(m, d) then return jsonb_build_object('ok', false, 'erro', 'NAO_E_SEU_SETOR'); end if;
    if coalesce(p_d->>'prioridade','') not in ('baixa','normal','alta','urgente') then
      return jsonb_build_object('ok', false, 'erro', 'PRIORIDADE_INVALIDA'); end if;
    update demandas.demandas set prioridade = p_d->>'prioridade',
      impacto = case when p_d->>'prioridade' = 'urgente' then coalesce(v_txt, impacto) else impacto end
     where id = d.id;

  elsif p_acao = 'redirecionar' then
    /* 94 · `pode_atender` ja devolve verdadeiro para admin e para o gestor
       cujo escopo alcanca o setor que atende. O `m.papel in (...)` de antes
       deixava o gestor de OUTRO setor tirar a demanda de uma fila que nao e
       dele. */
    if not demandas.pode_atender(m, d) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    if nullif(p_d->>'setor','') is null
       or p_d->>'setor' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('ok', false, 'erro', 'SETOR_INVALIDO'); end if;
    if not exists (select 1 from demandas.setores
                    where id = (p_d->>'setor')::uuid and ativo and atende) then
      return jsonb_build_object('ok', false, 'erro', 'SETOR_NAO_ATENDE'); end if;
    /* 86 · a trava NAO vai junto. A demanda chegava no setor novo travada por
       "esperando informacao" de uma conversa que aconteceu no setor antigo, e
       quem recebe nao tem como saber do que se trata. A trava de APROVACAO
       fica, porque essa nao e do setor: e do dinheiro. */
    update demandas.demandas
       set setor_responsavel = (p_d->>'setor')::uuid, responsavel_id = null,
           status = case when demandas.falta_aprovacao(d) then 'travada'
                         when status in ('execucao','travada') then 'aberta'
                         else status end,
           travada_por = case when demandas.falta_aprovacao(d) then 'aprovacao' else null end,
           travada_nota = case when demandas.falta_aprovacao(d) then travada_nota else null end
     where id = d.id;

  elsif p_acao = 'concluir' then
    if not demandas.pode_atender(m, d) then return jsonb_build_object('ok', false, 'erro', 'NAO_E_SEU_SETOR'); end if;
    if demandas.falta_aprovacao(d) then return jsonb_build_object('ok', false, 'erro', 'FALTA_APROVACAO'); end if;
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'CONCLUSAO_VAZIA'); end if;
    /* 86 · A coluna existe, a tela tem o campo, e o servidor aceitava concluir
       51 dias depois do prazo sem uma palavra. Qualquer indicador de
       pontualidade calculado em cima disso e ficcao. */
    if d.prazo is not null and d.prazo < demandas.hoje()
       and demandas.limpo(p_d->>'atraso') is null then
      return jsonb_build_object('ok', false, 'erro', 'ATRASO_PRECISA_MOTIVO'); end if;
    update demandas.demandas
       set status = 'concluida', conclusao = v_txt, concluida_em = now(),
           responsavel_id = coalesce(responsavel_id, m.id),
           travada_por = null, travada_nota = null,
           atraso_motivo = case when prazo is not null and demandas.hoje() > prazo
                                then demandas.limpo(p_d->>'atraso') else null end
     where id = d.id;

  elsif p_acao = 'cancelar' then
    if not (demandas.pode_atender(m, d) or demandas.pede(m, d) or demandas.gere(m, d)) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'MOTIVO_VAZIO'); end if;
    update demandas.demandas
       set status = 'cancelada', cancelada_motivo = v_txt, travada_por = null, travada_nota = null
     where id = d.id;

  elsif p_acao = 'reabrir' then
    if not (demandas.pede(m, d) or demandas.gere(m, d) or demandas.pode_atender(m, d)) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    if d.status not in ('concluida','cancelada') then
      return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_FECHADA'); end if;
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'TEXTO_VAZIO'); end if;
    insert into demandas.eventos (demanda_id, membro_id, tipo, texto)
      values (d.id, m.id, 'comentario', v_txt);
    update demandas.demandas
       set reaberturas = reaberturas + 1,
           conclusao = null, concluida_em = null, cancelada_motivo = null,
           atraso_motivo = null,
           /* 93 · O CARIMBO VELHO AFIRMAVA COISA SOBRE TRABALHO NOVO.
              `reabrir` nasceu na 85 e estas duas colunas na 91, e a cirurgia
              da 91 nao passou por aqui. Medido: reabrir uma demanda validada,
              concluir de novo e chamar `validar` devolve JA_VALIDADA, o que
              torna impossivel o quinto passo do fluxo do documento; e ate la a
              ficha imprime "Validada por Fulano em 22/09" sobre uma conclusao
              que ninguem conferiu. A tela nao muda: `acoesDe` decide o botao
              por `!d.validada_em`. */
           validada_em = null, validada_por = null,
           status = case when d.aprovacao in ('rejeitada','pendente') then 'travada'
                         when responsavel_id is null then 'aberta'
                         else 'execucao' end,
           travada_por = case when d.aprovacao in ('rejeitada','pendente') then 'aprovacao' else null end,
           travada_nota = case when d.aprovacao = 'rejeitada'
                               then 'Reaberta depois de recusada: precisa de aprovação de novo.'
                               when d.aprovacao = 'pendente'
                               then 'Reaberta antes de ser aprovada: continua esperando a aprovação.'
                               else null end,
           aprovacao = case when d.aprovacao in ('rejeitada','pendente') then 'pendente' else aprovacao end,
           aprovada_por = case when d.aprovacao in ('rejeitada','pendente') then null else aprovada_por end,
           aprovada_em = case when d.aprovacao in ('rejeitada','pendente') then null else aprovada_em end
     where id = d.id;

  elsif p_acao = 'validar' then
    /* 91 · A ETAPA 5 DO DOCUMENTO.

       "o setor solicitante ou responsavel pela gestao valida se a demanda foi
        atendida corretamente"

       Quem atende NAO entra na guarda de proposito, nem sendo responsavel:
       validar o proprio trabalho nao e validacao, e o unico ponto da etapa e
       ter uma segunda pessoa dizendo que resolveu. Gestor e admin entram
       porque o documento diz "ou responsavel pela gestao", e porque
       solicitante que sumiu nao pode deixar demanda pendurada para sempre. */
    /* 94 · "o setor solicitante ou responsavel pela gestao": o lado de quem
       pede (quem abriu e o lider do ministerio) ou o gestor que alcanca a
       demanda. Quem atende continua fora, pelo motivo de cima. */
    if not (demandas.pede(m, d) or demandas.gere(m, d)) then
      return jsonb_build_object('ok', false, 'erro', 'SO_QUEM_PEDIU'); end if;
    if d.status <> 'concluida' then
      return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_CONCLUIDA'); end if;
    if d.validada_em is not null then
      return jsonb_build_object('ok', false, 'erro', 'JA_VALIDADA'); end if;
    update demandas.demandas
       set validada_em = now(), validada_por = m.id
     where id = d.id;
    /* o evento e escrito aqui e nao no gatilho de historico: `fn_historico`
       nao conhece estas colunas, e ensina-lo a conhecer custaria reescrever
       um gatilho que hoje funciona por uma linha que cabe aqui. */
    insert into demandas.eventos (demanda_id, membro_id, tipo, para, texto)
      values (d.id, m.id, 'validacao', m.nome, v_txt);

  /* 94 · QUEM ACOMPANHA.

     Incluir: quem pede, quem atende e quem gere a demanda. A pessoa e achada
     pelo e-mail ou pelo telefone, EXATOS, e nunca por nome: busca por nome
     seria uma lista telefonica da igreja aberta para qualquer membro. A
     resposta para "nao achei" e a mesma para quem nao existe e para quem
     esta desativado.

     Tirar: as mesmas pessoas, e o proprio participante, que pode sair. */
  elsif p_acao = 'incluir' then
    if not (demandas.pede(m, d) or demandas.pode_atender(m, d) or demandas.gere(m, d)) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    v_chave := lower(btrim(coalesce(p_d->>'quem', '')));
    if v_chave = '' then return jsonb_build_object('ok', false, 'erro', 'PESSOA_NAO_ENCONTRADA'); end if;
    if position('@' in v_chave) > 0 then
      select * into x from demandas.membros y
       where y.ativo and (lower(y.auth_email) = v_chave or lower(y.email) = v_chave) limit 1;
    else
      v_dig := demandas.tel(v_chave);
      if v_dig is not null and v_dig ~ '^[0-9]{12,13}$' then
        select * into x from demandas.membros y where y.ativo and y.telefone = v_dig limit 1;
      end if;
    end if;
    if x.id is null then return jsonb_build_object('ok', false, 'erro', 'PESSOA_NAO_ENCONTRADA'); end if;
    if x.id = d.aberta_por then return jsonb_build_object('ok', false, 'erro', 'JA_E_QUEM_PEDIU'); end if;
    if exists (select 1 from demandas.participantes p where p.demanda_id = d.id and p.membro_id = x.id) then
      return jsonb_build_object('ok', true, 'repetido', true, 'nome', x.nome); end if;
    select count(*) into v_n2 from demandas.participantes p where p.demanda_id = d.id;
    if v_n2 >= 20 then return jsonb_build_object('ok', false, 'erro', 'PARTICIPANTES_DEMAIS'); end if;
    insert into demandas.participantes (demanda_id, membro_id, incluido_por)
      values (d.id, x.id, m.id);
    insert into demandas.eventos (demanda_id, membro_id, tipo, para)
      values (d.id, m.id, 'participante', x.nome);
    return jsonb_build_object('ok', true, 'nome', x.nome);

  elsif p_acao = 'tirar' then
    if coalesce(p_d->>'membro_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('ok', false, 'erro', 'NAO_PARTICIPA'); end if;
    if not ((p_d->>'membro_id')::uuid = m.id
            or demandas.pede(m, d) or demandas.pode_atender(m, d) or demandas.gere(m, d)) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    delete from demandas.participantes p
     where p.demanda_id = d.id and p.membro_id = (p_d->>'membro_id')::uuid;
    if not found then return jsonb_build_object('ok', false, 'erro', 'NAO_PARTICIPA'); end if;
    insert into demandas.eventos (demanda_id, membro_id, tipo, de)
      values (d.id, m.id, 'participante',
              (select y.nome from demandas.membros y where y.id = (p_d->>'membro_id')::uuid));

  else
    return jsonb_build_object('ok', false, 'erro', 'ACAO_DESCONHECIDA');
  end if;

  return jsonb_build_object('ok', true);
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
  /* 93 · A REDE EMBAIXO DA REGRA. A regex de cima pega o caminho normal; este
     ramo pega o que escapar dela por qualquer outro caminho. Sem ele o 22003
     subia cru, porque os tres `exception` desta familia so conheciam
     check/not_null/foreign_key/unique. */
  when numeric_value_out_of_range then
    return jsonb_build_object('ok', false, 'erro', 'ORCAMENTO_INVALIDO');
  when unique_violation then
    /* o indice dos vivos disparando e sempre o mesmo caso: o mesmo link
       chegou duas vezes no mesmo instante, por dois toques que correram
       juntos. O primeiro gravou; o segundo nao precisa gravar. */
    return jsonb_build_object('ok', true, 'repetido', true);
end $function$
;

/* -------------------------------------------------------------------------
   18 · AS PORTAS NOVAS: GRANT E INVENTARIO

   Funcao nova em `public` nasce executavel por PUBLIC (e, no Supabase, pelo
   default privilege de `anon`). As seis daqui sao portas DE PROPOSITO, e cada
   uma pergunta quem e antes de qualquer coisa. O grant e explicito e o
   inventario da 77 ganha uma linha para cada, com o motivo.
   ------------------------------------------------------------------------- */
do $grants$
declare f text;
begin
  foreach f in array array[
    'public.dem_portal(text)',
    'public.dem_avisos(text, boolean)',
    'public.dem_perfil(text, jsonb)',
    'public.dem_cadastro()',
    'public.dem_cadastrar(jsonb)',
    'public.dem_pessoa(text, text)'] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('grant execute on function %s to anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function %s to authenticated', f);
    end if;
  end loop;
end $grants$;

do $porta$ begin
  if to_regclass('public.porta_publica') is null then
    raise notice '94 · este banco nao tem o inventario da porta publica (a 77 nao esta na cadeia). Nada a declarar.';
    return;
  end if;
  insert into public.porta_publica (funcao, motivo, n) values
    ('dem_portal(p_token text)',
     'a primeira tela do sistema de demandas: quem e a pessoa, o que espera por ela e as contas do que ela pode ver. Tudo passa por pode_ver.', 94),
    ('dem_avisos(p_token text, p_marcar boolean)',
     'os avisos dentro do sistema: o que outras pessoas fizeram nas demandas desta pessoa. Sai do historico, com pode_ver e sem comentario interno para quem nao atende.', 94),
    ('dem_perfil(p_token text, p_d jsonb)',
     'a pessoa muda o proprio nome, telefone e funcao, e pede outro papel. Lista de chaves fechada: papel, setor e ativo recusam a chamada.', 94),
    ('dem_cadastro()',
     'responde so sobre quem pergunta, pelo e-mail confirmado do login: sem login, novo, ativo ou desativado. Devolve a lista de setores para o formulario.', 94),
    ('dem_cadastrar(p_d jsonb)',
     'o cadastro proprio. So com login de e-mail confirmado, nasce solicitante sempre, uma pessoa por e-mail e um telefone por pessoa ativa.', 94),
    ('dem_pessoa(p_token text, p_id text)',
     'a ficha de uma pessoa para quem administra: permissoes, historico e atividade. SO_ADMIN.', 94)
  on conflict (funcao) do update set motivo = excluded.motivo, n = excluded.n;
  update public.porta_publica
     set motivo = 'a base de pessoas do sistema de demandas, com o link pessoal de cada uma. SO_ADMIN, porta estreita. A 94 acrescentou funcao, origem, pedido e escopo.',
         n = 94
   where funcao = 'dem_pessoas(p_token text)';
end $porta$;

/* -------------------------------------------------------------------------
   19 · A CONFERENCIA

   UM bloco `$conf$` neste arquivo, e nenhum outro (ver `sabotar-migracao.py`).
   Os quatro ataques do pedido estao aqui, com os nomes que ele usou:

     A · usuario A tentando acessar a demanda do usuario B       (casos 1 a 3)
     B · profissional do setor A tentando a demanda do setor B   (casos 5 a 7)
     C · usuario comum tentando a area administrativa            (caso 9)
     D · usuario tentando alterar o proprio papel para admin     (casos 10 e 11)

   E o controle positivo de cada um: guarda que tranca tambem quem devia
   passar nao e guarda, e o sistema parado.

   As duas armadilhas de sempre: `falhas || 'texto'` sem `::text` vira
   `text[] || text[]`; e comparacao com NULL nao entra em ramo nenhum, entao
   tudo aqui e `is distinct from`.
   ------------------------------------------------------------------------- */
do $conf$
declare
  falhas text[] := '{}';
  s_a uuid; s_b uuid; s_m uuid; s_k uuid; s_c uuid; c_a uuid; c_b uuid;
  i_sol1 uuid; i_sol2 uuid; i_lid uuid; i_ra uuid; i_ga uuid; i_adm uuid; i_novo uuid;
  n1 int; n2 int; n3 int; v_r jsonb; v_t text; k int; v_prazo text;
  v_ano text := to_char(now(), 'YYYYMMDDHH24MISS');
begin
  perform set_config('demandas.membro', '', true);
  perform set_config('teste.jwt', '', true);
  perform set_config('request.jwt.claim', '', true);
  perform set_config('request.jwt.claims', '', true);
  v_prazo := to_char(demandas.hoje() + 10, 'YYYY-MM-DD');

  /* ---- cenario ---- */
  insert into demandas.setores (nome, slug, atende) values ('CONF94 Comunicacao', 'conf94-a', true) returning id into s_a;
  insert into demandas.setores (nome, slug, atende) values ('CONF94 Financeiro', 'conf94-b', true) returning id into s_b;
  insert into demandas.setores (nome, slug, atende) values ('CONF94 Louvor', 'conf94-m', false) returning id into s_m;
  insert into demandas.setores (nome, slug, atende) values ('CONF94 Kids', 'conf94-k', false) returning id into s_k;
  insert into demandas.setores (nome, slug, atende) values ('CONF94 Sem equipe', 'conf94-c', true) returning id into s_c;
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, prazo_padrao_dias)
    values ('CONF94 grupo', 'CONF94 arte', s_a, false, 5) returning id into c_a;
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, prazo_padrao_dias)
    values ('CONF94 grupo', 'CONF94 compra', s_b, true, 5) returning id into c_b;

  insert into demandas.membros (nome, papel, setor_id, token) values
    ('CONF94 Sol Um', 'solicitante', s_m, 'CONF94SOL1') returning id into i_sol1;
  insert into demandas.membros (nome, papel, setor_id, token, email) values
    ('CONF94 Sol Dois', 'solicitante', s_m, 'CONF94SOL2', 'conf94sol2@exemplo.test') returning id into i_sol2;
  insert into demandas.membros (nome, papel, setor_id, token, telefone) values
    ('CONF94 Sol Financeiro', 'solicitante', s_b, 'CONF94SOLFIN', '21911110001');
  insert into demandas.membros (nome, papel, setor_id, token) values
    ('CONF94 Lider Louvor', 'lider', s_m, 'CONF94LID') returning id into i_lid;
  insert into demandas.membros (nome, papel, setor_id, token) values
    ('CONF94 Lider Kids', 'lider', s_k, 'CONF94LIDK');
  insert into demandas.membros (nome, papel, setor_id, token, telefone) values
    ('CONF94 Resp A', 'responsavel', s_a, 'CONF94RA', '21911110002') returning id into i_ra;
  insert into demandas.membros (nome, papel, setor_id, token, telefone) values
    ('CONF94 Resp B', 'responsavel', s_b, 'CONF94RB', '21911110003');
  insert into demandas.membros (nome, papel, setor_id, token, escopo_total) values
    ('CONF94 Gestor A', 'gestor', s_a, 'CONF94GA', false) returning id into i_ga;
  insert into demandas.gestao (membro_id, setor_id) values (i_ga, s_a);
  insert into demandas.membros (nome, papel, setor_id, token, escopo_total) values
    ('CONF94 Gestor Todos', 'gestor', s_a, 'CONF94GT', true);
  insert into demandas.membros (nome, papel, setor_id, token) values
    ('CONF94 Admin', 'admin', s_a, 'CONF94ADM') returning id into i_adm;
  insert into demandas.membros (nome, papel, setor_id, token, telefone) values
    ('CONF94 So Pede Com Tel', 'solicitante', s_c, 'CONF94SOLC', '21911110004');

  v_r := public.dem_abrir('CONF94SOL1', jsonb_build_object('titulo', 'CONF94 D1 do Sol Um',
           'descricao', 'x', 'categoria_id', c_a, 'prazo', v_prazo));
  n1 := (v_r->>'numero')::int;
  v_r := public.dem_abrir('CONF94SOL2', jsonb_build_object('titulo', 'CONF94 D2 do Sol Dois',
           'descricao', 'x', 'categoria_id', c_a, 'prazo', v_prazo));
  n2 := (v_r->>'numero')::int;
  v_r := public.dem_abrir('CONF94LIDK', jsonb_build_object('titulo', 'CONF94 D3 Kids pede ao Financeiro',
           'descricao', 'x', 'categoria_id', c_b, 'prazo', v_prazo, 'orcamento', '100'));
  n3 := (v_r->>'numero')::int;
  if n1 is null or n2 is null or n3 is null then
    raise exception '94 REPROVOU: o cenario nao nasceu (%, %, %)', n1, n2, n3;
  end if;

  /* ---- 1 · A: o colega do MESMO setor nao ve, nao conversa, nao anexa ---- */
  if (public.dem_ver('CONF94SOL2', n1)->>'erro') is distinct from 'NAO_EXISTE' then
    falhas := falhas || '1: solicitante via a demanda de outro solicitante do mesmo setor'::text; end if;
  if (public.dem_mover('CONF94SOL2', n1, 'comentar', '{"texto":"oi"}')->>'erro') is distinct from 'NAO_EXISTE' then
    falhas := falhas || '1: solicitante comentava na demanda do colega'::text; end if;
  if (public.dem_mover('CONF94SOL2', n1, 'anexar', '{"url":"https://exemplo.com/a.pdf"}')->>'erro') is distinct from 'NAO_EXISTE' then
    falhas := falhas || '1: solicitante anexava na demanda do colega'::text; end if;
  if exists (select 1 from jsonb_array_elements(public.dem_lista('CONF94SOL2', '{"aba":"tudo"}')->'itens') i
              where (i->>'numero')::int = n1) then
    falhas := falhas || '1: a lista Tudo do solicitante trazia a demanda do colega'::text; end if;
  if (public.dem_ver('CONF94SOL1', n1)->>'ok') is distinct from 'true' then
    falhas := falhas || '1: quem abriu deixou de ver a propria demanda'::text; end if;
  /* o oraculo: numero que nao existe e numero que nao e seu respondem igual */
  if (public.dem_ver('CONF94SOL2', 2147483000)->>'erro') is distinct from 'NAO_EXISTE' then
    falhas := falhas || '1: numero inexistente responde diferente de numero alheio'::text; end if;

  /* ---- 2 · participante: incluido ve e conversa; tirado deixa de ver ---- */
  v_r := public.dem_mover('CONF94SOL1', n1, 'incluir', '{"quem":"CONF94SOL2@EXEMPLO.TEST"}');
  if (v_r->>'ok') is distinct from 'true' then
    falhas := falhas || ('2: quem pediu nao conseguiu incluir alguem pelo e-mail: ' || v_r::text); end if;
  if (public.dem_ver('CONF94SOL2', n1)->>'ok') is distinct from 'true' then
    falhas := falhas || '2: o participante incluido nao ve a demanda'::text; end if;
  if not exists (select 1 from jsonb_array_elements(public.dem_lista('CONF94SOL2', '{"aba":"participo"}')->'itens') i
                  where (i->>'numero')::int = n1) then
    falhas := falhas || '2: a aba participo nao traz a demanda que a pessoa acompanha'::text; end if;
  if (public.dem_mover('CONF94SOL2', n1, 'comentar', '{"texto":"acompanhando"}')->>'ok') is distinct from 'true' then
    falhas := falhas || '2: o participante nao consegue comentar'::text; end if;
  if (public.dem_mover('CONF94SOL2', n1, 'cancelar', '{"texto":"nao"}')->>'erro') is distinct from 'SEM_PERMISSAO' then
    falhas := falhas || '2: o participante cancelou a demanda de outra pessoa'::text; end if;
  if (public.dem_mover('CONF94SOL2', n1, 'incluir', '{"quem":"21911110001"}')->>'erro') is distinct from 'SEM_PERMISSAO' then
    falhas := falhas || '2: o participante incluiu mais gente'::text; end if;
  if (public.dem_mover('CONF94SOL1', n1, 'incluir', '{"quem":"ninguem@exemplo.test"}')->>'erro') is distinct from 'PESSOA_NAO_ENCONTRADA' then
    falhas := falhas || '2: incluir quem nao existe nao respondeu PESSOA_NAO_ENCONTRADA'::text; end if;
  if (public.dem_mover('CONF94SOL2', n1, 'tirar', jsonb_build_object('membro_id', i_sol2))->>'ok') is distinct from 'true' then
    falhas := falhas || '2: o participante nao consegue sair'::text; end if;
  if (public.dem_ver('CONF94SOL2', n1)->>'erro') is distinct from 'NAO_EXISTE' then
    falhas := falhas || '2: quem saiu continua vendo a demanda'::text; end if;

  /* ---- 3 · o lider ve o que o ministerio dele pediu, e so isso ---- */
  if (public.dem_ver('CONF94LID', n1)->>'ok') is distinct from 'true'
     or (public.dem_ver('CONF94LID', n2)->>'ok') is distinct from 'true' then
    falhas := falhas || '3: o lider nao ve o que o proprio ministerio pediu'::text; end if;
  if (public.dem_ver('CONF94LIDK', n1)->>'erro') is distinct from 'NAO_EXISTE' then
    falhas := falhas || '3: o lider de outro ministerio ve o pedido do Louvor'::text; end if;
  if (select count(*) from jsonb_array_elements(public.dem_lista('CONF94LID', '{"aba":"ministerio"}')->'itens') i
       where (i->>'numero')::int in (n1, n2)) <> 2 then
    falhas := falhas || '3: a aba ministerio do lider nao traz os dois pedidos do Louvor'::text; end if;
  if jsonb_array_length(public.dem_lista('CONF94SOL1', '{"aba":"ministerio"}')->'itens') <> 0 then
    falhas := falhas || '3: a aba ministerio devolveu alguma coisa para quem nao e lider'::text; end if;

  /* ---- 4 · o avisos e o portal ---- */
  perform public.dem_mover('CONF94RA', n1, 'assumir');
  perform public.dem_mover('CONF94RA', n1, 'comentar', '{"texto":"CONF94 interno","interno":true}');
  if not exists (select 1 from jsonb_array_elements(public.dem_avisos('CONF94SOL1')->'itens') i
                  where (i->>'numero')::int = n1 and i->>'tipo' = 'responsavel') then
    falhas := falhas || '4: quem pediu nao recebeu o aviso de que alguem assumiu'::text; end if;
  if exists (select 1 from jsonb_array_elements(public.dem_avisos('CONF94SOL1')->'itens') i
              where i->>'texto' = 'CONF94 interno') then
    falhas := falhas || '4: o comentario interno apareceu nos avisos de quem pediu'::text; end if;
  if exists (select 1 from jsonb_array_elements(public.dem_avisos('CONF94SOL2')->'itens') i
              where (i->>'numero')::int = n1 and i->>'tipo' <> 'participante') then
    falhas := falhas || '4: quem saiu da demanda continua recebendo aviso dela'::text; end if;
  perform public.dem_mover('CONF94RA', n1, 'travar', '{"motivo":"informacao","texto":"qual tamanho?"}');
  if (public.dem_portal('CONF94SOL1')->'n'->>'responder') is distinct from '1' then
    falhas := falhas || '4: o portal nao conta a demanda que espera resposta de quem pediu'::text; end if;
  if (public.dem_portal('CONF94SOL1')->'precisa'->0->>'motivo') is distinct from 'responder' then
    falhas := falhas || '4: o portal nao diz o que falta fazer'::text; end if;
  perform public.dem_mover('CONF94SOL1', n1, 'destravar', '{"texto":"A4"}');
  perform public.dem_mover('CONF94RA', n1, 'concluir', '{"texto":"pronto"}');
  if (public.dem_portal('CONF94SOL1')->'precisa'->0->>'motivo') is distinct from 'validar' then
    falhas := falhas || '4: a demanda pronta nao espera a confirmacao de quem pediu'::text; end if;
  if (public.dem_mover('CONF94LID', n1, 'validar', '{"texto":"conferi"}')->>'ok') is distinct from 'true' then
    falhas := falhas || '4: o lider do ministerio que pediu nao consegue validar'::text; end if;

  /* ---- 5 · B: o profissional do setor A nao alcanca o setor B ---- */
  if (public.dem_ver('CONF94RA', n3)->>'erro') is distinct from 'NAO_EXISTE' then
    falhas := falhas || '5: o profissional de um setor ve demanda de outro setor'::text; end if;
  if (public.dem_mover('CONF94RA', n3, 'assumir')->>'erro') is distinct from 'NAO_EXISTE' then
    falhas := falhas || '5: o profissional de um setor mexe em demanda de outro setor'::text; end if;
  if (public.dem_ver('CONF94RB', n3)->>'ok') is distinct from 'true' then
    falhas := falhas || '5: o profissional do setor certo deixou de ver a propria fila'::text; end if;
  if (public.dem_ver('CONF94RA', n2)->>'ok') is distinct from 'true' then
    falhas := falhas || '5: o profissional deixou de ver a fila do setor dele'::text; end if;

  /* ---- 6 · setor sem papel nao e credencial ---- */
  if (public.dem_ver('CONF94SOLFIN', n3)->>'erro') is distinct from 'NAO_EXISTE' then
    falhas := falhas || '6: solicitante cadastrado num setor que atende ve a fila do setor'::text; end if;
  if jsonb_array_length(public.dem_lista('CONF94SOLFIN', '{"aba":"setor"}')->'itens') <> 0 then
    falhas := falhas || '6: a aba setor devolveu fila para quem nao atende'::text; end if;
  if (public.dem_numeros('CONF94SOLFIN')->>'erro') is distinct from 'SEM_PERMISSAO' then
    falhas := falhas || '6: os numeros abriram para quem so pede'::text; end if;

  /* ---- 7 · o contato do setor e so de quem atende ---- */
  if demandas.contato_do_setor(s_c) is not null then
    falhas := falhas || '7: o contato do setor apontou para quem so pede'::text; end if;
  if (demandas.contato_do_setor(s_b)->>'nome') is distinct from 'CONF94 Resp B' then
    falhas := falhas || '7: o contato do setor deixou de ser quem atende'::text; end if;

  /* ---- 8 · o escopo do gestor ---- */
  if (public.dem_ver('CONF94GA', n3)->>'erro') is distinct from 'NAO_EXISTE' then
    falhas := falhas || '8: o gestor de um setor ve demanda fora do escopo'::text; end if;
  if (public.dem_ver('CONF94GA', n2)->>'ok') is distinct from 'true' then
    falhas := falhas || '8: o gestor nao ve o que esta no escopo dele'::text; end if;
  if (public.dem_mover('CONF94GT', n3, 'aprovar', '{"texto":"ok"}')->>'ok') is distinct from 'true' then
    falhas := falhas || '8: o gestor de todos os setores nao consegue aprovar'::text; end if;
  if (public.dem_ver('CONF94ADM', n3)->>'ok') is distinct from 'true' then
    falhas := falhas || '8: o administrador deixou de ver tudo'::text; end if;

  /* ---- 9 · C: area administrativa ---- */
  if (public.dem_pessoas('CONF94SOL1')->>'erro') is distinct from 'SO_ADMIN'
     or (public.dem_pessoas('CONF94LID')->>'erro') is distinct from 'SO_ADMIN'
     or (public.dem_pessoas('CONF94RA')->>'erro') is distinct from 'SO_ADMIN'
     or (public.dem_pessoas('CONF94GT')->>'erro') is distinct from 'SO_ADMIN' then
    falhas := falhas || '9: a base de pessoas abriu para quem nao administra'::text; end if;
  if (public.dem_pessoa('CONF94SOL1', i_adm::text)->>'erro') is distinct from 'SO_ADMIN' then
    falhas := falhas || '9: a ficha de uma pessoa abriu para quem nao administra'::text; end if;
  if (public.dem_ajustar('CONF94GT', 'membro', jsonb_build_object('id', i_sol1, 'papel', 'admin'))->>'erro')
     is distinct from 'SO_ADMIN' then
    falhas := falhas || '9: o gestor mudou o papel de alguem'::text; end if;
  if (public.dem_pessoa('CONF94ADM', i_sol1::text)->>'ok') is distinct from 'true' then
    falhas := falhas || '9: o administrador nao abre a ficha de uma pessoa'::text; end if;

  /* ---- 10 · D: ninguem muda o proprio papel, setor ou situacao ---- */
  if (public.dem_ajustar('CONF94SOL1', 'membro', jsonb_build_object('id', i_sol1, 'papel', 'admin'))->>'erro')
     is distinct from 'SO_ADMIN' then
    falhas := falhas || '10: o solicitante chamou dem_ajustar sobre si mesmo'::text; end if;
  if (public.dem_perfil('CONF94SOL1', '{"papel":"admin"}')->>'erro') is distinct from 'CAMPO_NAO_PERMITIDO' then
    falhas := falhas || '10: o perfil aceitou a chave papel'::text; end if;
  if (public.dem_perfil('CONF94SOL1', jsonb_build_object('setor_id', s_b))->>'erro') is distinct from 'CAMPO_NAO_PERMITIDO' then
    falhas := falhas || '10: o perfil aceitou a chave setor_id'::text; end if;
  if (public.dem_perfil('CONF94SOL1', '{"nome":"CONF94 Sol Um","escopo_total":true}')->>'erro') is distinct from 'CAMPO_NAO_PERMITIDO' then
    falhas := falhas || '10: o perfil aceitou escopo junto com um campo valido'::text; end if;
  if (select papel from demandas.membros where id = i_sol1) is distinct from 'solicitante' then
    falhas := falhas || '10: o papel mudou'::text; end if;
  v_r := public.dem_perfil('CONF94SOL1', '{"papel_pedido":"lider","funcao":"Baterista"}');
  if (v_r->>'papel') is distinct from 'solicitante' or (v_r->>'papel_pedido') is distinct from 'lider'
     or (v_r->>'funcao') is distinct from 'Baterista' then
    falhas := falhas || ('10: pedir papel mudou o papel, ou o perfil nao gravou: ' || v_r::text); end if;
  if (public.dem_ajustar('CONF94ADM', 'membro', jsonb_build_object('id', i_sol2, 'papel', 'gestor'))->>'erro')
     is distinct from 'ESCOPO_VAZIO' then
    falhas := falhas || '10: virou gestor sem escopo nenhum'::text; end if;

  /* ---- 11 · o cadastro: so com login, sempre solicitante, uma vez ---- */
  if (public.dem_cadastrar('{"nome":"CONF94 Sem Login","telefone":"21911110009"}')->>'erro') is distinct from 'SEM_LOGIN' then
    falhas := falhas || '11: cadastrou sem login'::text; end if;
  perform set_config('teste.jwt', '{"email":"conf94novo' || v_ano || '@exemplo.test"}', true);
  perform set_config('request.jwt.claims', '{"email":"conf94novo' || v_ano || '@exemplo.test"}', true);
  if (public.dem_cadastro()->>'situacao') is distinct from 'novo' then
    falhas := falhas || '11: o login novo nao foi reconhecido como cadastro novo'::text; end if;
  if (public.dem_cadastrar(jsonb_build_object('nome', 'CONF94 Novo', 'telefone', '21911110010',
        'setor_id', s_b, 'papel', 'admin'))->>'erro') is distinct from 'CAMPO_NAO_PERMITIDO' then
    falhas := falhas || '11: o cadastro aceitou a chave papel'::text; end if;
  /* o numero do Resp A foi gravado como `21911110002`; aqui ele volta com o
     55 e com pontuacao. Sem a forma unica de `demandas.tel`, seriam dois
     textos diferentes para o mesmo telefone, e o indice nao veria. */
  if (public.dem_cadastrar(jsonb_build_object('nome', 'CONF94 Novo', 'telefone', '+55 (21) 91111-0002',
        'setor_id', s_b))->>'erro') is distinct from 'TELEFONE_EM_USO' then
    falhas := falhas || '11: o cadastro aceitou o telefone de outra pessoa ativa, escrito de outro jeito'::text; end if;
  v_r := public.dem_cadastrar(jsonb_build_object('nome', 'CONF94 Novo', 'telefone', '21911110010',
           'setor_id', s_b, 'funcao', 'Tesouraria', 'papel_pedido', 'responsavel'));
  i_novo := (v_r->>'id')::uuid;
  if (v_r->>'ok') is distinct from 'true' or (v_r->>'papel') is distinct from 'solicitante'
     or (v_r->>'papel_pedido') is distinct from 'responsavel' then
    falhas := falhas || ('11: o cadastro nao nasceu solicitante com o pedido anotado: ' || v_r::text); end if;
  if (select origem from demandas.membros where id = i_novo) is distinct from 'cadastro' then
    falhas := falhas || '11: o cadastro nao registrou a origem'::text; end if;
  if (public.dem_ver(null, n3)->>'erro') is distinct from 'NAO_EXISTE' then
    falhas := falhas || '11: quem acabou de se cadastrar no Financeiro ve a fila do Financeiro'::text; end if;
  if (public.dem_cadastrar(jsonb_build_object('nome', 'CONF94 Novo', 'telefone', '21911110011',
        'setor_id', s_b))->>'erro') is distinct from 'JA_CADASTRADO' then
    falhas := falhas || '11: o mesmo login cadastrou duas vezes'::text; end if;
  if (public.dem_cadastro()->>'situacao') is distinct from 'ativo' then
    falhas := falhas || '11: depois do cadastro, a situacao nao e ativo'::text; end if;
  if not exists (select 1 from demandas.pessoas_historico h
                  where h.membro_id = i_novo and h.tipo = 'cadastro' and h.por = i_novo) then
    falhas := falhas || '11: o historico nao registrou que a propria pessoa se cadastrou'::text; end if;
  /* o e-mail que o administrador cadastrou e a porta dessa pessoa: ela entra
     com ele e nao ganha segunda linha */
  insert into demandas.membros (nome, papel, setor_id, token, email)
    values ('CONF94 Convidada', 'responsavel', s_a, 'CONF94CONV', 'conf94conv' || v_ano || '@exemplo.test');
  perform set_config('teste.jwt', '{"email":"CONF94CONV' || v_ano || '@EXEMPLO.TEST"}', true);
  perform set_config('request.jwt.claims', '{"email":"CONF94CONV' || v_ano || '@EXEMPLO.TEST"}', true);
  if (public.dem_quem_sou(null)->>'nome') is distinct from 'CONF94 Convidada' then
    falhas := falhas || '11: quem o administrador cadastrou pelo e-mail nao entra com esse e-mail'::text; end if;
  if (public.dem_cadastrar(jsonb_build_object('nome', 'CONF94 Convidada 2', 'telefone', '21911110012',
        'setor_id', s_a))->>'erro') is distinct from 'JA_CADASTRADO' then
    falhas := falhas || '11: quem ja estava cadastrado ganhou uma segunda linha'::text; end if;
  perform set_config('teste.jwt', '', true);
  perform set_config('request.jwt.claims', '', true);

  /* ---- 12 · uma pessoa, uma linha, tambem pela porta do administrador ---- */
  if (public.dem_ajustar('CONF94ADM', 'membro', jsonb_build_object('nome', 'CONF94 Outra',
        'telefone', '21911110003', 'setor_id', s_a))->>'erro') is distinct from 'TELEFONE_EM_USO' then
    falhas := falhas || '12: o administrador cadastrou um telefone que ja e de outra pessoa ativa'::text; end if;
  if (public.dem_ajustar('CONF94ADM', 'membro', jsonb_build_object('nome', 'CONF94 Outra',
        'auth_email', 'conf94sol2@exemplo.test', 'setor_id', s_a))->>'erro') is distinct from 'EMAIL_EM_USO' then
    falhas := falhas || '12: o login de uma pessoa nova pode ser o e-mail de outra'::text; end if;
  if (public.dem_ajustar('CONF94ADM', 'membro', jsonb_build_object('nome', 'CONF94 Resp A',
        'setor_id', s_a))->>'erro') is distinct from 'HOMONIMO' then
    falhas := falhas || '12: o mesmo nome entrou sem ninguem confirmar'::text; end if;

  /* ---- 13 · o teto por hora ---- */
  for k in 1..9 loop
    perform public.dem_abrir('CONF94SOL1', jsonb_build_object('titulo', 'CONF94 teto ' || k,
      'descricao', 'x', 'categoria_id', c_a, 'prazo', v_prazo));
  end loop;
  if (public.dem_abrir('CONF94SOL1', jsonb_build_object('titulo', 'CONF94 teto 10',
        'descricao', 'x', 'categoria_id', c_a, 'prazo', v_prazo))->>'erro') is distinct from 'MUITAS_DE_UMA_VEZ' then
    falhas := falhas || '13: a decima primeira demanda da mesma hora nasceu'::text; end if;
  /* a equipe registra pedido dos outros em lote: dez seguidas e a decima
     primeira tem que nascer. Com uma so, um teto que pegasse todo mundo
     passaria por este caso sem ser visto (a bateria mediu isso). */
  for k in 1..10 loop
    perform public.dem_abrir('CONF94RA', jsonb_build_object('titulo', 'CONF94 equipe em lote ' || k,
      'descricao', 'x', 'categoria_id', c_a, 'prazo', v_prazo));
  end loop;
  if (public.dem_abrir('CONF94RA', jsonb_build_object('titulo', 'CONF94 equipe em lote 11',
        'descricao', 'x', 'categoria_id', c_a, 'prazo', v_prazo))->>'ok') is distinct from 'true' then
    falhas := falhas || '13: o teto pegou a equipe'::text; end if;

  /* ---- 14 · nada fora das funcoes ---- */
  if exists (select 1 from pg_roles where rolname = 'anon') then
    if has_schema_privilege('anon', 'demandas', 'usage') then
      falhas := falhas || '14: anon tem USAGE no schema demandas'::text; end if;
    if has_table_privilege('anon', 'demandas.membros', 'select')
       or has_table_privilege('anon', 'demandas.participantes', 'select')
       or has_table_privilege('anon', 'demandas.pessoas_historico', 'select') then
      falhas := falhas || '14: anon le tabela do schema demandas'::text; end if;
    if has_function_privilege('anon', 'demandas.pode_ver(demandas.membros, demandas.demandas)', 'execute')
       or has_function_privilege('anon', 'demandas.eu(demandas.membros)', 'execute') then
      falhas := falhas || '14: anon executa funcao interna'::text; end if;
    if not has_function_privilege('anon', 'public.dem_portal(text)', 'execute') then
      falhas := falhas || '14: a porta nova do portal nao tem grant'::text; end if;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    if has_table_privilege('authenticated', 'demandas.membros', 'update')
       or has_table_privilege('authenticated', 'demandas.gestao', 'insert') then
      falhas := falhas || '14: authenticated escreve direto em tabela'::text; end if;
  end if;
  if (public.dem_portal('CONF94-NINGUEM')->>'erro') is distinct from 'SEM_ACESSO'
     or (public.dem_avisos('CONF94-NINGUEM')->>'erro') is distinct from 'SEM_ACESSO'
     or (public.dem_perfil('CONF94-NINGUEM', '{}')->>'erro') is distinct from 'SEM_ACESSO' then
    falhas := falhas || '14: uma porta nova respondeu sem saber quem pergunta'::text; end if;

  /* ---- limpeza: so o que este bloco criou ---- */
  perform set_config('demandas.membro', '', true);
  delete from demandas.demandas where titulo like 'CONF94%';
  delete from demandas.membros where nome like 'CONF94%';
  delete from demandas.categorias where grupo like 'CONF94%';
  delete from demandas.setores where nome like 'CONF94%';

  if array_length(falhas, 1) > 0 then
    raise exception E'94 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 94 · conferencia: 14 blocos. O colega do mesmo setor nao ve, nao comenta e nao anexa; participante incluido ve e quem saiu deixa de ver; o lider ve o que o ministerio pediu e so isso; os avisos e o portal contam so o que e da pessoa; o profissional de um setor nao alcanca outro; setor sem papel nao e credencial; o contato do setor e so de quem atende; o gestor fica no escopo; a administracao so abre para o administrador; ninguem muda o proprio papel, setor ou escopo; o cadastro exige login, nasce solicitante e nao duplica; o administrador tambem nao duplica; ha teto por hora para quem pede; e nada fora das funcoes e alcancavel.';
end $conf$;

insert into public.schema_versao (n, arquivo)
  values (94, '94-a-base-central-de-pessoas-e-o-escopo-que-o-banco-cobra.sql')
  on conflict (n) do nothing;

commit;
