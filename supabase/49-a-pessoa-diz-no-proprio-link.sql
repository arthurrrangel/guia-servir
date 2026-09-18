/* =============================================================================
   49 · A PESSOA DIZ NO PRÓPRIO LINK
   18/09/2026. Depende da 48.

   Supabase → SQL Editor → colar tudo → Run. Idempotente.

   ---------------------------------------------------------------------------
   POR QUE

   A migração 48 ensinou o sistema a saber quem pode entrar onde, e de
   propósito não preencheu o sexo de ninguém: chutar pelo primeiro nome
   escreveria suposição como se fosse cadastro. Só que o único jeito de
   preencher era a liderança abrindo pessoa por pessoa na aba Time.

   Agora a própria pessoa responde no link dela. Duas mudanças:

     1. `eu_sexo(token, sexo)`: grava, provando identidade pelo token, do mesmo
        jeito que `eu_responder` e `eu_disponibilidade` já fazem.
     2. `quem_sou` passa a dizer, POR VÍNCULO, o sexo já informado e se aquele
        ministério tem posto que exige. Sem isso a tela não sabe se deve
        perguntar, e perguntar para quem serve só na Projeção seria coletar
        dado por coletar.

   UMA PESSOA, NÃO UM CADASTRO POR ÁREA

   A coluna `sexo` mora em `voluntarios`, que é uma linha POR ÁREA: quem serve
   na Mídia e no Connect tem duas. Sexo é da pessoa, não do vínculo, então
   `eu_sexo` grava em TODAS as linhas da mesma `pessoa_id`. Sem isso, quem
   serve em duas áreas responderia duas vezes a mesma pergunta, e poderia
   responder diferente em cada uma. É a mesma lição da migração 33, que existe
   porque o Jander, que organiza o Louvor e serve no Louvor, era duas pessoas
   para o sistema.

   `eu_dados` NÃO é tocada. É a função de que todo voluntário depende para ver
   a escala, e ela devolve tabela tipada: mudar a assinatura obriga a apagar e
   recriar. `quem_sou` devolve jsonb, então acrescentar chave não quebra
   ninguém que já lê as antigas.
   ============================================================================= */

-- 1 ------------------------------------------------- a pessoa grava o seu ---
create or replace function eu_sexo(p_token text, p_sexo text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_pessoa uuid; v_n int;
begin
  if p_sexo is null or p_sexo not in ('M','F') then
    return jsonb_build_object('ok', false, 'erro', 'SEXO_INVALIDO');
  end if;

  select v.id, v.pessoa_id into v_id, v_pessoa
    from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then
    return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO');
  end if;

  /* todas as áreas da MESMA pessoa. Quem não tem pessoa_id (cadastro antigo)
     atualiza só a própria linha. */
  if v_pessoa is not null then
    update voluntarios set sexo = p_sexo where pessoa_id = v_pessoa;
  else
    update voluntarios set sexo = p_sexo where id = v_id;
  end if;
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'sexo', p_sexo, 'vinculos', v_n);
end $fn$;

revoke all on function eu_sexo(text, text) from public;
grant execute on function eu_sexo(text, text) to anon, authenticated;
comment on function eu_sexo(text, text) is
  'a propria pessoa informa homem ou mulher pelo link dela. Grava em todos os vinculos da mesma pessoa: sexo e da pessoa, nao da area.';

-- 2 ----------------------------------------- quem_sou passa a dizer o que ---
/* Mesma função da migração 33, com duas chaves novas dentro de cada item de
   `serve`. Quem mexer aqui confira contra a 33 antes: o resto do corpo é
   igual, linha por linha. */
create or replace function quem_sou(p_token text default null)
returns jsonb
language plpgsql security definer stable set search_path = public as $fn$
declare
  v_pessoa uuid; v_email text; r jsonb;
begin
  if p_token is not null and btrim(p_token) <> '' then
    select v.pessoa_id into v_pessoa
      from voluntarios v where v.token = p_token and v.ativo;
    if v_pessoa is null then
      return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO');
    end if;
  else
    v_email := nullif(auth.jwt() ->> 'email', '');
    if v_email is null then
      return jsonb_build_object('ok', false, 'erro', 'SEM_CREDENCIAL');
    end if;
    select p.id into v_pessoa from pessoas p where lower(p.auth_email) = lower(v_email);
    if v_pessoa is null then
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
               'este', coalesce(v.token = p_token, false),
               /* 18/09/2026: o que a tela precisa para decidir se pergunta. */
               'sexo', v.sexo,
               'precisa_sexo', exists (
                 select 1 from habilidades h join funcoes f on f.id = h.funcao_id
                  where h.voluntario_id = v.id and f.ativa and f.exige_sexo is not null),
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

/* =============================================================================
   CONFERÊNCIA

   Esperado: as duas funções existem, `quem_sou` tem as chaves novas, e
   `precisa` conta quantas pessoas do Connect a tela vai perguntar.
   ============================================================================= */
select
  (select count(*) from pg_proc where proname = 'eu_sexo') as tem_eu_sexo,
  (select prosrc like '%precisa_sexo%' from pg_proc where proname = 'quem_sou') as quem_sou_atualizada,
  (select count(distinct v.id)
     from voluntarios v
     join habilidades h on h.voluntario_id = v.id
     join funcoes f on f.id = h.funcao_id
    where v.ativo and v.sexo is null and f.ativa and f.exige_sexo is not null) as pessoas_a_perguntar;

/* ROLLBACK
     drop function if exists eu_sexo(text, text);
     -- quem_sou: rodar o bloco da migração 33 (as chaves novas somem e a tela
     -- simplesmente para de perguntar).
   ============================================================================= */
