-- ============================== NÍVEL DECLARADO x NÍVEL CONFERIDO =========
-- O auto-cadastro deixou "titular" virar uma coisa que a pessoa se dá, não
-- uma coisa que ela recebe. De 16 cadastros, 15 se declararam e só 1 pessoa
-- usou "reserva": todo mundo tocou uma vez em cada área e foi embora, porque
-- um toque no chip já era titular.
--
-- O estrago não é social, é de motor: com todo mundo titular, o peso do nível
-- fica igual para todos e o sorteio deixa de considerar habilidade. E a saúde
-- do time mente, porque conta como "apto" quem ninguém verificou.
--
-- A correção NÃO é bloquear ninguém. É separar o que a pessoa DIZ do que o
-- líder CONFERIU, e fazer o motor confiar só no segundo.

-- 1) a coluna. Default true de propósito: o que já existia foi o líder que
--    cadastrou, então continua valendo. O backfill logo abaixo é que marca
--    como não conferido tudo que veio de auto-cadastro.
alter table habilidades add column if not exists confirmado boolean not null default true;

-- 2) backfill: quem entrou sozinho (voluntarios.conferido = false) tem TODAS
--    as habilidades como declaradas, não conferidas.
update habilidades h set confirmado = false
  from voluntarios v
 where v.id = h.voluntario_id and v.conferido = false;

comment on column habilidades.confirmado is
  'false = a pessoa declarou no auto-cadastro e ninguém do time conferiu ainda. O motor lê titular não confirmado como reserva.';

----------------------------------------------------------------------------

-- 3) auto-cadastro passa a gravar habilidade como DECLARADA.
create or replace function inscrever(
  p_slug text, p_nome text, p_tel text, p_email text, p_funcoes jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_eq uuid; v_id uuid; v_token text; v_nome text; v_tel text; v_mail text;
  v_areas int; v_recentes int;
begin
  select id into v_eq from equipes where slug = p_slug;
  if v_eq is null then return jsonb_build_object('ok', false, 'erro', 'EQUIPE'); end if;

  v_nome := btrim(coalesce(p_nome, ''));
  v_tel  := regexp_replace(coalesce(p_tel, ''), '[^0-9]', '', 'g');
  v_mail := nullif(btrim(lower(coalesce(p_email, ''))), '');
  if length(v_nome) < 3 then return jsonb_build_object('ok', false, 'erro', 'NOME'); end if;
  if length(v_tel) < 10 then return jsonb_build_object('ok', false, 'erro', 'TELEFONE'); end if;

  if exists (select 1 from voluntarios where equipe_id = v_eq
              and regexp_replace(coalesce(telefone,''), '[^0-9]', '', 'g') = v_tel) then
    return jsonb_build_object('ok', false, 'erro', 'JA_EXISTE');
  end if;

  select count(*) into v_areas from jsonb_each_text(coalesce(p_funcoes, '{}'::jsonb)) x
   where x.value in ('titular', 'reserva', 'treino');
  if v_areas = 0 then return jsonb_build_object('ok', false, 'erro', 'SEM_AREA'); end if;

  select count(*) into v_recentes from voluntarios v
   where v.equipe_id = v_eq and v.criado_em > now() - interval '1 hour';
  if v_recentes >= 40 then return jsonb_build_object('ok', false, 'erro', 'MUITOS_CADASTROS'); end if;

  insert into voluntarios (equipe_id, nome, telefone, email, conferido)
       values (v_eq, v_nome, v_tel, v_mail, false)
    returning id, token into v_id, v_token;

  insert into habilidades (voluntario_id, funcao_id, nivel, confirmado)
  select v_id, f.id, x.value::nivel_habilidade, false
    from jsonb_each_text(p_funcoes) x
    join funcoes f on f.equipe_id = v_eq and f.nome = x.key and f.ativa
   where x.value in ('titular', 'reserva', 'treino')
  on conflict (voluntario_id, funcao_id) do nothing;

  return jsonb_build_object('ok', true, 'token', v_token, 'nome', v_nome);
end $fn$;
revoke all on function inscrever(text, text, text, text, jsonb) from public;
grant execute on function inscrever(text, text, text, text, jsonb) to anon, authenticated;

----------------------------------------------------------------------------

-- 4) o líder confere uma habilidade. p_nivel null = a pessoa não faz essa área.
--    Confirmar é o único caminho para "titular" valer de verdade no sorteio.
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
revoke all on function conferir_habilidade(uuid, uuid, text) from public, anon;
grant execute on function conferir_habilidade(uuid, uuid, text) to authenticated;

----------------------------------------------------------------------------

-- 5) "conferi tudo dessa pessoa": o atalho da aba Time. Antes só tirava o selo
--    de "novo" e deixava as habilidades pendentes, ou seja, o botão mentia.
create or replace function conferir_voluntario(p_id uuid)
returns void
language plpgsql security invoker set search_path = public as $fn$
begin
  update habilidades set confirmado = true where voluntario_id = p_id;
  update voluntarios set conferido = true where id = p_id;
end $fn$;
revoke all on function conferir_voluntario(uuid) from public, anon;
grant execute on function conferir_voluntario(uuid) to authenticated;
