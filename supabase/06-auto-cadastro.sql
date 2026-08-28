/* =============================================================================
   06 — AUTO-CADASTRO: a própria pessoa se cadastra pelo link do grupo.

   1. TRANSMISSÃO vira "TRANSMISSÃO (CORTE + PTZ)". A PTZ NÃO é vaga própria:
      é o mesmo assento, monitor e equipamento de quem faz o corte. Duas vagas
      para uma cadeira deixaria o sorteio pôr duas pessoas no mesmo posto —
      e o gatilho de conflito simultâneo recusaria a mesma pessoa nas duas.
   2. voluntarios.conferido: quem se cadastra sozinho entra JÁ VALENDO, mas
      fica destacado até o líder conferir o nível que a pessoa declarou.
   3. voluntarios.email: contato alternativo, opcional.
      Sem CPF: nada na escala usa, e o formulário é público (LGPD/vazamento).
   4. equipe_funcoes(): o formulário lista as áreas sem login.
   5. inscrever(): cria voluntário + habilidades e devolve o token da pessoa.
   Idempotente.
   ============================================================================= */

/* --------------------------- 1. o corte e a PTZ são o mesmo posto */
update funcoes set nome = 'TRANSMISSÃO (CORTE + PTZ)'
 where nome = 'TRANSMISSÃO'
   and not exists (select 1 from funcoes f2
                    where f2.equipe_id = funcoes.equipe_id and f2.nome = 'TRANSMISSÃO (CORTE + PTZ)');

/* se uma PTZ separada existir e nunca tiver sido escalada, ela sai */
delete from funcoes f where f.nome = 'PTZ'
  and not exists (select 1 from escalacoes e where e.funcao_id = f.id);

/* padroniza o acento: o nome aparece no formulário e na mensagem do grupo */
update funcoes set nome = 'CÂMERA 2'
 where nome = 'CAMERA 2'
   and not exists (select 1 from funcoes f2
                    where f2.equipe_id = funcoes.equipe_id and f2.nome = 'CÂMERA 2');

/* ------------------------------- 2 e 3. colunas novas do voluntário */
alter table voluntarios add column if not exists conferido boolean not null default true;
alter table voluntarios add column if not exists email text;

/* --------------------------------- 4. áreas visíveis sem login */
create or replace function equipe_funcoes(p_slug text)
returns table(nome text, ordem int)
language sql security definer set search_path = public stable as $fn$
  select f.nome, f.ordem
    from funcoes f join equipes e on e.id = f.equipe_id
   where e.slug = p_slug and f.ativa
   order by f.ordem;
$fn$;
revoke all on function equipe_funcoes(text) from public;
grant execute on function equipe_funcoes(text) to anon, authenticated;

/* --------------------------------------------- 5. o auto-cadastro
   SECURITY DEFINER porque o anon não escreve em voluntarios direto.
   Devolve o token para a pessoa cair já na própria página. */
drop function if exists inscrever(text, text, text, jsonb);
create or replace function inscrever(p_slug text, p_nome text, p_tel text, p_email text, p_funcoes jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_eq uuid; v_id uuid; v_token text; v_tel text; v_nome text; v_mail text; v_areas int; v_recentes int;
begin
  v_nome := btrim(coalesce(p_nome, ''));
  v_tel  := tel_norm(coalesce(p_tel, ''));
  v_mail := nullif(lower(btrim(coalesce(p_email, ''))), '');

  if length(v_nome) < 3 or position(' ' in v_nome) = 0 then
    return jsonb_build_object('ok', false, 'erro', 'NOME_INCOMPLETO');
  end if;
  if length(v_tel) < 10 or length(v_tel) > 13 then
    return jsonb_build_object('ok', false, 'erro', 'TELEFONE_INVALIDO');
  end if;
  if v_mail is not null and v_mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    return jsonb_build_object('ok', false, 'erro', 'EMAIL_INVALIDO');
  end if;

  select id into v_eq from equipes where slug = p_slug;
  if v_eq is null then return jsonb_build_object('ok', false, 'erro', 'EQUIPE_NAO_ENCONTRADA'); end if;

  /* já existe alguém com esse WhatsApp. NÃO devolve o token do cadastro
     existente: quem digitasse o número de outra pessoa entraria na página dela. */
  if exists (select 1 from voluntarios v
              where v.equipe_id = v_eq and tel_norm(v.telefone) = v_tel) then
    return jsonb_build_object('ok', false, 'erro', 'JA_CADASTRADO');
  end if;

  select count(*) into v_areas from jsonb_each_text(coalesce(p_funcoes, '{}'::jsonb)) x
   where x.value in ('titular', 'reserva', 'treino');
  if v_areas = 0 then return jsonb_build_object('ok', false, 'erro', 'SEM_AREA'); end if;

  /* freio de mão: o link é público no grupo. 40/hora por equipe é muito acima
     do uso real e barra um script bobo. */
  select count(*) into v_recentes from voluntarios v
   where v.equipe_id = v_eq and v.criado_em > now() - interval '1 hour';
  if v_recentes >= 40 then return jsonb_build_object('ok', false, 'erro', 'MUITOS_CADASTROS'); end if;

  insert into voluntarios (equipe_id, nome, telefone, email, conferido)
       values (v_eq, v_nome, v_tel, v_mail, false)
    returning id, token into v_id, v_token;

  insert into habilidades (voluntario_id, funcao_id, nivel)
  select v_id, f.id, x.value::nivel_habilidade
    from jsonb_each_text(p_funcoes) x
    join funcoes f on f.equipe_id = v_eq and f.nome = x.key and f.ativa
   where x.value in ('titular', 'reserva', 'treino')
  on conflict (voluntario_id, funcao_id) do nothing;

  return jsonb_build_object('ok', true, 'token', v_token, 'nome', v_nome);
end $fn$;
revoke all on function inscrever(text, text, text, text, jsonb) from public;
grant execute on function inscrever(text, text, text, text, jsonb) to anon, authenticated;

/* ------------------------------- 6. líder marca que conferiu o nível */
create or replace function conferir_voluntario(p_id uuid)
returns void
language plpgsql security invoker set search_path = public as $fn$
begin
  update voluntarios set conferido = true where id = p_id;
end $fn$;
revoke all on function conferir_voluntario(uuid) from public, anon;
grant execute on function conferir_voluntario(uuid) to authenticated;
