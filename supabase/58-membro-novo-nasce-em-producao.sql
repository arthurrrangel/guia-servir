/* =============================================================================
   58 · CADASTRAR MEMBRO FUNCIONA EM PRODUÇÃO

   20/09/2026. Um arquivo, um sistema. Este é só de Demandas.

   O QUE ESTAVA ERRADO, MEDIDO NO BANCO DE PRODUÇÃO (não lido, medido):

       pgcrypto  →  esquema `extensions`   (versão 1.3)
       search_path da sessão  →  "$user", public, extensions

   `dem_ajustar` nasceu na 50 com `set search_path = demandas, public`. Dentro
   dela, `gen_random_bytes(12)` (que gera o token do link pessoal) procura em
   `demandas` e em `public`, e o pgcrypto não está em nenhum dos dois:

       ERROR: function gen_random_bytes(integer) does not exist
       CONTEXT: PL/pgSQL function dem_ajustar(text,text,jsonb) line 51

   Tradução: a tela Ajustes cadastra setor, cadastra categoria, e na hora de
   cadastrar a PRIMEIRA PESSOA cai com erro cru do Postgres. Sem pessoa não
   há demanda. O sistema subiria inteiro e não serviria para nada.

   POR QUE NENHUM TESTE PEGOU

   `scripts/demandas-banco.sh` instalava o pgcrypto em `public` (`create
   extension pgcrypto` sem esquema), e `demandas-banco.test.sql` cadastrava
   setor e categoria pelo `dem_ajustar`, mas nunca uma pessoa. Duas lacunas
   que se escondiam uma atrás da outra; as duas foram fechadas junto com
   este arquivo, e a base de teste passou a ter o pgcrypto onde a produção
   tem.

   O CONSERTO

   Qualificar a chamada: `extensions.gen_random_bytes`. Não é alargar o
   `search_path` da função porque uma função `security definer` com caminho
   curto é proteção contra sequestro de nome, e não há motivo para abrir
   mão dela por um único identificador. A sonda registrada abaixo faz a
   régua reclamar se alguém um dia reescrever a função sem o prefixo.

   O corpo é o da 50, com essa única mudança. A 50 não pode receber o
   conserto porque é passado: ela se recusa a rodar num banco que já passou
   da 51, e é assim que tem que ser.

   ORDEM:  ... 56 → 57 → 58
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(58);
  end if;
end $tranca$;

create or replace function public.dem_ajustar(p_token text, p_o_que text, p_d jsonb)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare m demandas.membros; v_id uuid;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  if m.papel <> 'admin' then return jsonb_build_object('ok', false, 'erro', 'SO_ADMIN'); end if;

  if p_o_que = 'setor' then
    if nullif(p_d->>'id','') is null then
      insert into demandas.setores (nome, slug, atende, ordem)
        values (btrim(p_d->>'nome'),
                coalesce(nullif(btrim(p_d->>'slug'),''),
                         lower(regexp_replace(unaccent_simples(btrim(p_d->>'nome')), '[^a-z0-9]+', '-', 'gi'))),
                coalesce((p_d->>'atende')::boolean, false),
                coalesce((p_d->>'ordem')::int, 99))
        returning id into v_id;
    else
      update demandas.setores set
        nome = coalesce(nullif(btrim(p_d->>'nome'),''), nome),
        atende = coalesce((p_d->>'atende')::boolean, atende),
        ordem = coalesce((p_d->>'ordem')::int, ordem),
        ativo = coalesce((p_d->>'ativo')::boolean, ativo)
       where id = (p_d->>'id')::uuid returning id into v_id;
    end if;

  elsif p_o_que = 'categoria' then
    if nullif(p_d->>'id','') is null then
      insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, exige_orcamento, prazo_padrao_dias, ordem)
        values (btrim(p_d->>'grupo'), btrim(p_d->>'nome'), nullif(p_d->>'setor_id','')::uuid,
                coalesce((p_d->>'exige_aprovacao')::boolean, false),
                coalesce((p_d->>'exige_orcamento')::boolean, false),
                nullif(p_d->>'prazo_padrao_dias','')::int,
                coalesce((p_d->>'ordem')::int, 99))
        on conflict (grupo, nome) do update set ativa = true
        returning id into v_id;
    else
      update demandas.categorias set
        nome = coalesce(nullif(btrim(p_d->>'nome'),''), nome),
        setor_id = coalesce(nullif(p_d->>'setor_id','')::uuid, setor_id),
        exige_aprovacao = coalesce((p_d->>'exige_aprovacao')::boolean, exige_aprovacao),
        exige_orcamento = coalesce((p_d->>'exige_orcamento')::boolean, exige_orcamento),
        prazo_padrao_dias = case when p_d ? 'prazo_padrao_dias'
                                 then nullif(p_d->>'prazo_padrao_dias','')::int
                                 else prazo_padrao_dias end,
        ativa = coalesce((p_d->>'ativa')::boolean, ativa)
       where id = (p_d->>'id')::uuid returning id into v_id;
    end if;

  elsif p_o_que = 'membro' then
    if nullif(p_d->>'id','') is null then
      insert into demandas.membros (nome, email, telefone, auth_email, setor_id, papel, token, pessoa_id)
        values (btrim(p_d->>'nome'), nullif(btrim(p_d->>'email'),''),
                nullif(regexp_replace(coalesce(p_d->>'telefone',''), '\D', '', 'g'),''),
                lower(nullif(btrim(p_d->>'auth_email'),'')),
                nullif(p_d->>'setor_id','')::uuid,
                coalesce(nullif(p_d->>'papel',''), 'solicitante'),
                /* 58: qualificado. O pgcrypto mora em `extensions`, que não
                   está no search_path curto desta função. */
                encode(extensions.gen_random_bytes(12), 'hex'),
                nullif(p_d->>'pessoa_id','')::uuid)
        returning id into v_id;
    else
      update demandas.membros set
        nome = coalesce(nullif(btrim(p_d->>'nome'),''), nome),
        email = case when p_d ? 'email' then nullif(btrim(p_d->>'email'),'') else email end,
        telefone = case when p_d ? 'telefone'
                        then nullif(regexp_replace(coalesce(p_d->>'telefone',''), '\D', '', 'g'),'')
                        else telefone end,
        auth_email = case when p_d ? 'auth_email' then lower(nullif(btrim(p_d->>'auth_email'),'')) else auth_email end,
        setor_id = coalesce(nullif(p_d->>'setor_id','')::uuid, setor_id),
        papel = coalesce(nullif(p_d->>'papel',''), papel),
        ativo = coalesce((p_d->>'ativo')::boolean, ativo)
       where id = (p_d->>'id')::uuid returning id into v_id;
    end if;

  else
    return jsonb_build_object('ok', false, 'erro', 'ALVO_DESCONHECIDO');
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
exception
  when unique_violation then return jsonb_build_object('ok', false, 'erro', 'JA_EXISTE');
  when check_violation  then return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
end $fn$;

comment on function public.dem_ajustar(text, text, jsonb) is
  'Ajustes do admin: setor, categoria e membro. Desde a 58 o token do membro novo vem de extensions.gen_random_bytes, porque o pgcrypto do Supabase mora em `extensions` e o search_path curto da funcao nao o alcancava: cadastrar pessoa caia com erro cru.';

-- =========================================================================
-- a sonda, para a régua reclamar se alguém tirar o prefixo de novo
-- =========================================================================

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura)
    values (58, '58 · dem_ajustar gera token com extensions.gen_random_bytes', 'dem_ajustar', 'extensions.gen_random_bytes')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

do $reg$ begin
  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo) values (58, '58-membro-novo-nasce-em-producao.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;


-- =========================================================================
-- A CONFERÊNCIA: cadastra uma pessoa DE VERDADE pelo mesmo caminho da tela
-- =========================================================================

do $conf$
declare
  v jsonb; v_corpo text; v_admin uuid; v_tok text; v_novo uuid;
begin
  select coalesce(lower(regexp_replace(prosrc, '\s+', ' ', 'g')), '') into v_corpo
    from pg_proc where proname = 'dem_ajustar' and pronamespace = 'public'::regnamespace limit 1;
  if v_corpo not like '%extensions.gen_random_bytes%' then
    raise exception 'A 58 NAO PEGOU: dem_ajustar continua chamando gen_random_bytes sem esquema.';
  end if;

  /* um admin descartável, com token fixo, só para chamar a função como a
     tela chama. O token é único, então a conferência não colide com gente
     real, e no fim os dois registros são apagados por id. */
  v_tok := 'conf58-' || md5(clock_timestamp()::text);
  insert into demandas.membros (nome, auth_email, papel, setor_id, token, ativo)
    values ('Conferência 58', 'conf58@teste.local', 'admin',
            (select id from demandas.setores where slug = 'secretaria'), v_tok, true)
    returning id into v_admin;

  v := public.dem_ajustar(v_tok, 'membro',
         jsonb_build_object('nome', 'Pessoa da Conferência 58', 'papel', 'solicitante'));

  if coalesce(v->>'ok', 'false') <> 'true' then
    delete from demandas.membros where id = v_admin;
    raise exception 'A 58 NAO CONSERTOU: cadastrar membro pelo dem_ajustar ainda falha: %', v::text;
  end if;
  v_novo := (v->>'id')::uuid;

  if (select length(token) from demandas.membros where id = v_novo) <> 24 then
    delete from demandas.membros where id in (v_admin, v_novo);
    raise exception 'A 58 GEROU TOKEN ERRADO: esperava 24 caracteres hex.';
  end if;

  delete from demandas.membros where id in (v_admin, v_novo);
  if exists (select 1 from demandas.membros where auth_email = 'conf58@teste.local'
                                               or nome = 'Pessoa da Conferência 58') then
    raise exception 'A 58 DEIXOU LIXO: os registros da conferencia nao foram apagados.';
  end if;

  raise notice '58 · conferencia: dem_ajustar cadastrou uma pessoa com token de 24 hex, e apagou o que criou.';
end $conf$;
