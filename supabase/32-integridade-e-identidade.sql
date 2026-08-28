/* =============================================================================
   32 — INTEGRIDADE DOS DADOS E A ESPINHA DE IDENTIDADE

   A 31 fechou o que estava aberto. Esta arruma o que estava frouxo: a mesma
   pessoa virando duas linhas, a falta de restrição que permitiria isso de
   novo amanhã, e a ausência de ligação entre quem lidera e quem é.

     §1  inscrever passa a preencher pessoa_id, e backfill do que ficou para trás
     §2  lideres.pessoa_id: o líder deixa de ser um e-mail solto
     §3  as restrições que impedem duplicata de nascer

   SOBRE O §3: um `create unique index` estoura se já existir duplicata, e
   estourar no meio de uma migração deixa o banco pela metade. Por isso cada
   restrição está dentro de um bloco que confere primeiro e, se achar
   duplicata, LEVANTA uma mensagem dizendo exatamente quais linhas são, sem
   criar nada. Migração que falha tem que falhar explicando.
   ============================================================================= */


-- =========================================================================
-- §1  A porta antiga criava gente que o resto do sistema não reconhecia.
--
-- `inscrever` (a entrada por /equipe/[slug]) insere em `voluntarios` sem
-- preencher `pessoa_id`. Como `candidatar` e `decidir_candidatura` casam a
-- pessoa por `pessoa_id`, quem entrou por ali é invisível para eles: a mesma
-- pessoa vira duas linhas, com dois tokens e dois lugares na escala. É a
-- origem da duplicação de identidade que a auditoria apontou.
--
-- Aqui a função passa a fazer o que a 22 estabeleceu como regra da casa:
-- toda linha de `voluntarios` aponta para uma linha de `pessoas`.
--
-- O token e o pin_hash continuam no vínculo, como a 22 decidiu e explicou:
-- o PIN é sha256(pin || token), então mover o token quebraria em silêncio
-- todo PIN já criado. Isso segue como dívida registrada, não como esquecimento.
-- =========================================================================

-- 1a. cria pessoa para todo vínculo que ficou sem, casando por telefone
insert into pessoas (nome, telefone, email, criado_em)
select distinct on (tel_norm(v.telefone))
       v.nome, tel_norm(v.telefone), nullif(v.email,''), min(v.criado_em) over (partition by tel_norm(v.telefone))
  from voluntarios v
 where v.pessoa_id is null
   and coalesce(length(tel_norm(v.telefone)),0) >= 10
 order by tel_norm(v.telefone), v.pin_hash nulls last, v.criado_em
    on conflict (telefone) do nothing;

-- 1b. liga os vínculos órfãos
update voluntarios v set pessoa_id = p.id
  from pessoas p
 where p.telefone = tel_norm(v.telefone)
   and v.pessoa_id is null;

-- 1c. e a função para de criar novos órfãos
create or replace function inscrever(
  p_slug text, p_nome text, p_tel text, p_email text, p_funcoes jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_eq uuid; v_eq_nome text; v_gate boolean;
  v_nome text; v_tel text; v_mail text;
  v_id uuid; v_token text; v_n int; v_pessoa uuid;
begin
  select e.id, e.nome, coalesce(e.exige_aprovacao, false)
    into v_eq, v_eq_nome, v_gate
    from equipes e where e.slug = p_slug;
  if v_eq is null then
    return jsonb_build_object('ok', false, 'erro', 'EQUIPE_INVALIDA');
  end if;

  v_nome := btrim(coalesce(p_nome, ''));
  v_tel  := tel_norm(coalesce(p_tel, ''));
  v_mail := nullif(btrim(lower(coalesce(p_email, ''))), '');

  if length(v_nome) < 3 or position(' ' in v_nome) = 0 then
    return jsonb_build_object('ok', false, 'erro', 'NOME_INCOMPLETO');
  end if;
  if coalesce(length(v_tel), 0) < 10 or length(v_tel) > 13 then
    return jsonb_build_object('ok', false, 'erro', 'TELEFONE_INVALIDO');
  end if;
  if v_mail is not null and v_mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    return jsonb_build_object('ok', false, 'erro', 'EMAIL_INVALIDO');
  end if;

  if exists (
    select 1 from voluntarios v
     where v.equipe_id = v_eq and tel_norm(v.telefone) = v_tel
  ) then
    return jsonb_build_object('ok', false, 'erro', 'JA_CADASTRADO');
  end if;

  if not exists (
    select 1 from jsonb_each_text(coalesce(p_funcoes, '{}'::jsonb)) x
     where x.value in ('titular', 'reserva', 'treino')
  ) then
    return jsonb_build_object('ok', false, 'erro', 'SEM_AREA');
  end if;

  select count(*) into v_n from voluntarios v
   where v.equipe_id = v_eq and v.criado_em > now() - interval '1 hour';
  if v_n >= 40 then
    return jsonb_build_object('ok', false, 'erro', 'MUITOS_CADASTROS');
  end if;

  /* NOVO: a identidade primeiro, o vínculo depois. Mesma regra de `candidatar`,
     inclusive em não sobrescrever o nome de quem já existe: cadastro público
     não é prova de posse do número. */
  insert into pessoas (nome, telefone, email)
       values (v_nome, v_tel, v_mail)
  on conflict (telefone) do update
     set email = coalesce(pessoas.email, excluded.email),
         atualizado_em = now()
    returning id into v_pessoa;

  insert into voluntarios (equipe_id, pessoa_id, nome, telefone, email, conferido, ativo)
       values (v_eq, v_pessoa, v_nome, v_tel, v_mail, false, not v_gate)
    returning id, token into v_id, v_token;

  insert into habilidades (voluntario_id, funcao_id, nivel, confirmado)
  select v_id, f.id, x.value::nivel_habilidade, false
    from jsonb_each_text(p_funcoes) x
    join funcoes f on f.equipe_id = v_eq and f.nome = x.key and f.ativa
   where x.value in ('titular', 'reserva', 'treino')
      on conflict (voluntario_id, funcao_id) do nothing;

  if v_gate then
    return jsonb_build_object('ok', true, 'pendente', true,
                              'nome', v_nome, 'equipe', v_eq_nome);
  end if;

  return jsonb_build_object('ok', true, 'pendente', false, 'token', v_token,
                            'nome', v_nome, 'equipe', v_eq_nome);
end $fn$;

revoke all on function inscrever(text, text, text, text, jsonb) from public;
grant execute on function inscrever(text, text, text, text, jsonb) to anon, authenticated;


-- =========================================================================
-- §2  O líder deixa de ser um e-mail solto.
--
-- Hoje `lideres` casa por e-mail e `pessoas` casa por telefone, e nada liga
-- as duas. Consequências: não existe resposta para "o que esta pessoa faz na
-- igreja inteira", o papel só pode ser "manda em tudo" ou "manda numa área",
-- e não há onde pendurar um papel intermediário (um coordenador que vê a
-- escala mas não aprova candidatura, por exemplo).
--
-- Esta é a coluna que destrava isso, e só ela: a tabela de papéis vem depois,
-- quando as telas de líder forem refeitas. Aqui é a espinha, não o esqueleto
-- inteiro. Nada no app depende dessa coluna ainda, então ela é aditiva pura.
--
-- O casamento por e-mail acerta pouco de propósito: metade das pessoas não
-- tem e-mail cadastrado. O que sobrar em branco é preenchido a mão pelo líder
-- quando a tela existir. Preencher errado seria pior que deixar vazio.
-- =========================================================================
alter table lideres add column if not exists pessoa_id uuid references pessoas(id) on delete set null;
create index if not exists ix_lideres_pessoa on lideres(pessoa_id);
comment on column lideres.pessoa_id is
  'liga quem organiza a quem é, na mesma tabela de identidade dos voluntários. Preenchido por e-mail quando dá; o resto é ato de líder. O acesso continua sendo decidido por e-mail no JWT: esta coluna ainda não manda em nada.';

update lideres l set pessoa_id = p.id
  from pessoas p
 where l.pessoa_id is null
   and l.email <> ''
   and lower(p.email) = lower(l.email);


-- =========================================================================
-- §3  As restrições que impedem a duplicata de nascer.
--
-- "Já cadastrado" existe hoje só DENTRO de `inscrever`. Os outros dois
-- caminhos de inserção, o do líder pela tela de time e o de
-- `decidir_candidatura`, não checam nada. Sem restrição no banco, a regra
-- vale por convenção, e convenção não é integridade.
--
-- Cada bloco confere antes e recusa com mensagem útil em vez de estourar
-- críptico no meio da migração.
-- =========================================================================

-- 3a. uma pessoa não entra duas vezes na mesma equipe
do $$
declare v_dup text;
begin
  select string_agg(format('equipe=%s tel=%s (%s linhas)', equipe_id, tel, n), ' · ')
    into v_dup
    from (select equipe_id, tel_norm(telefone) as tel, count(*) n
            from voluntarios
           where coalesce(length(tel_norm(telefone)),0) >= 10
           group by 1,2 having count(*) > 1) d;

  if v_dup is not null then
    raise exception E'NAO CRIEI a unique de voluntarios(equipe_id, telefone): ja existe duplicata.\nResolva estas antes: %', v_dup;
  end if;

  create unique index if not exists ux_vol_equipe_tel
      on voluntarios (equipe_id, tel_norm(telefone))
   where coalesce(length(tel_norm(telefone)),0) >= 10;
end $$;

-- 3b. dois ministérios não dividem o mesmo slug
--     (a migração que criou `equipes` não está no repositório, então a unique
--      pode ou não existir. `if not exists` cobre os dois casos.)
do $$
declare v_dup text;
begin
  select string_agg(slug || ' (' || n || ')', ' · ') into v_dup
    from (select slug, count(*) n from equipes group by 1 having count(*) > 1) d;

  if v_dup is not null then
    raise exception E'NAO CRIEI a unique de equipes.slug: ja existe duplicata: %', v_dup;
  end if;

  create unique index if not exists ux_equipes_slug on equipes (slug);
end $$;

-- 3c. um vínculo aponta para no máximo uma pessoa, e o índice torna a busca
--     por identidade barata quando a tabela crescer
create index if not exists ix_voluntarios_pessoa_equipe on voluntarios (pessoa_id, equipe_id);


-- =========================================================================
-- §4  Escritas de várias etapas viram uma transação só.
--
-- Dois caminhos do líder faziam N gravações independentes a partir do
-- navegador, e nenhum dos dois olhava o erro:
--
--   criarVoluntario  insere a pessoa e DEPOIS as habilidades. Se o segundo
--                    insert falhava, a pessoa nascia sem função nenhuma e a
--                    tela anunciava que ela entrou no time.
--   salvarFuncoes    um update ou insert por função, em série. Cair no meio
--                    deixava a lista de postos da área pela metade.
--
-- Tratar o erro no front não resolve: o estado partido já aconteceu. O
-- padrão que este banco já usa para isso é `salvar_dia`, que grava um domingo
-- inteiro numa transação e desfaz tudo se qualquer regra barrar. As duas
-- funções abaixo seguem o mesmo idioma.
--
-- De quebra, o caminho do líder passa a ter a validação que só existia no
-- caminho público: nome com sobrenome e telefone de 10 a 13 dígitos. Antes,
-- `criarVoluntario` inseria qualquer coisa direto na tabela.
--
-- SECURITY INVOKER: é ação de líder, então roda como ele e cai na RLS, que é
-- o que garante que ninguém escreve na equipe do outro. Mesma decisão da 23.
-- =========================================================================
create or replace function criar_voluntario(
  p_equipe uuid, p_nome text, p_tel text, p_limite int, p_funcoes jsonb
) returns jsonb
language plpgsql security invoker set search_path = public as $fn$
declare v_nome text; v_tel text; v_pessoa uuid; v_id uuid;
begin
  v_nome := btrim(coalesce(p_nome, ''));
  v_tel  := tel_norm(coalesce(p_tel, ''));

  if length(v_nome) < 3 or position(' ' in v_nome) = 0 then
    return jsonb_build_object('ok', false, 'erro', 'NOME_INCOMPLETO');
  end if;
  if v_tel <> '' and (length(v_tel) < 10 or length(v_tel) > 13) then
    return jsonb_build_object('ok', false, 'erro', 'TELEFONE_INVALIDO');
  end if;
  if v_tel <> '' and exists (
    select 1 from voluntarios v where v.equipe_id = p_equipe and tel_norm(v.telefone) = v_tel
  ) then
    return jsonb_build_object('ok', false, 'erro', 'JA_CADASTRADO');
  end if;

  /* a identidade primeiro, como em `inscrever` e `candidatar`. Sem telefone
     não dá para casar pessoa: o vínculo nasce sem identidade e o líder
     completa depois. É o único caso em que isso é aceitável, porque foi um
     líder que digitou e ele sabe quem é. */
  if v_tel <> '' then
    insert into pessoas (nome, telefone) values (v_nome, v_tel)
    on conflict (telefone) do update set atualizado_em = now()
      returning id into v_pessoa;
  end if;

  insert into voluntarios (equipe_id, pessoa_id, nome, telefone, limite_mes, conferido)
       values (p_equipe, v_pessoa, v_nome, nullif(v_tel,''), p_limite, true)
    returning id into v_id;

  /* nível dado por líder nasce conferido: foi ele que olhou. */
  insert into habilidades (voluntario_id, funcao_id, nivel, confirmado)
  select v_id, f.id, x.value::nivel_habilidade, true
    from jsonb_each_text(coalesce(p_funcoes, '{}'::jsonb)) x
    join funcoes f on f.equipe_id = p_equipe and f.nome = x.key
   where x.value in ('titular', 'reserva', 'treino')
      on conflict (voluntario_id, funcao_id) do nothing;

  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;

revoke all on function criar_voluntario(uuid, text, text, int, jsonb) from public, anon;
grant execute on function criar_voluntario(uuid, text, text, int, jsonb) to authenticated;
comment on function criar_voluntario(uuid, text, text, int, jsonb) is
  'cadastro de voluntário pelo líder, em uma transação: identidade, vínculo e habilidades juntos. Substitui a sequência de inserts do lib/db.ts, que podia deixar a pessoa sem função nenhuma.';


create or replace function salvar_funcoes(p_equipe uuid, p_funcoes jsonb)
returns jsonb
language plpgsql security invoker set search_path = public as $fn$
declare r record; v_vistos uuid[] := '{}'; v_id uuid;
begin
  for r in
    select (x ->> 'id')::uuid                          as id,
           btrim(coalesce(x ->> 'nome',''))            as nome,
           coalesce((x ->> 'simultanea')::boolean,false) as simultanea,
           coalesce((x ->> 'ordem')::int, 0)           as ordem,
           coalesce((x ->> 'ativa')::boolean,true)     as ativa
      from jsonb_array_elements(coalesce(p_funcoes,'[]'::jsonb)) x
  loop
    if r.nome = '' then
      raise exception 'funcao sem nome';
    end if;

    if r.id is not null then
      /* a linha tem que ser DESTA equipe. A RLS já barraria, mas dizer não
         explicitamente é mais barato de depurar que uma linha que some. */
      if not exists (select 1 from funcoes where id = r.id and equipe_id = p_equipe) then
        raise exception 'funcao de outro ministerio';
      end if;
      update funcoes set nome = r.nome, simultanea = r.simultanea,
                         ordem = r.ordem, ativa = r.ativa
       where id = r.id;
      v_id := r.id;
    else
      insert into funcoes (equipe_id, nome, simultanea, ordem, ativa)
           values (p_equipe, r.nome, r.simultanea, r.ordem, r.ativa)
        returning id into v_id;
    end if;
    v_vistos := v_vistos || v_id;
  end loop;

  return jsonb_build_object('ok', true, 'salvas', coalesce(array_length(v_vistos,1),0));
end $fn$;

revoke all on function salvar_funcoes(uuid, jsonb) from public, anon;
grant execute on function salvar_funcoes(uuid, jsonb) to authenticated;
comment on function salvar_funcoes(uuid, jsonb) is
  'grava a lista de postos de uma equipe numa transação. Não apaga: remover posto continua sendo ação explícita, porque apagar função leva escalação e habilidade junto por cascade.';


/* =============================================================================
   CONFERÊNCIA DEPOIS DE APLICAR

     -- não pode sobrar vínculo sem identidade
     select count(*) as vinculos_orfaos from voluntarios
      where pessoa_id is null and coalesce(length(tel_norm(telefone)),0) >= 10;

     -- as três restrições existem?
     select indexname from pg_indexes
      where indexname in ('ux_vol_equipe_tel','ux_equipes_slug','ix_voluntarios_pessoa_equipe');

     -- quantos líderes ficaram ligados a uma pessoa
     select count(*) filter (where pessoa_id is not null) as ligados, count(*) as total from lideres;

   ROLLBACK
     §1  create or replace inscrever com o corpo de 20-porta-de-entrada.sql:70.
         O backfill NÃO precisa ser desfeito: preencher pessoa_id é correto
         mesmo na versão antiga.
     §2  alter table lideres drop column pessoa_id;
     §3  drop index ux_vol_equipe_tel, ux_equipes_slug, ix_voluntarios_pessoa_equipe;
   ============================================================================= */
