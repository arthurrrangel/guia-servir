/* =============================================================================
   08 — PIN pessoal + lista da equipe por ÁREA

   POR QUE: a 07 tirou a lista de nomes para fechar a brecha dos 4 dígitos, mas
   isso deixou quem perdeu o link dependendo do líder — o líder virava gargalo,
   que é o oposto do que o sistema existe para resolver.

   SOLUÇÃO: a lista volta, agora agrupada por área. Os 4 últimos dígitos do
   WhatsApp servem UMA vez só, para a pessoa CRIAR um PIN próprio. Da segunda
   vez em diante o PIN é a credencial — e PIN é segredo de verdade, diferente
   do telefone, que todo mundo do grupo enxerga.

   O PIN nunca é gravado em texto: vai como sha256(pin || token) em pin_hash.
   O token é único por pessoa, então funciona como sal.
   `equipe_entrar` (a função antiga, insegura) continua REVOGADA da 07.
   ============================================================================= */

alter table voluntarios add column if not exists pin_hash text;

/* ------------------------------------------------- o time, por área */
create or replace function equipe_time(p_slug text)
returns table(area text, ordem int, voluntario_id uuid, primeiro_nome text, nivel text, tem_pin boolean, tem_tel boolean)
language sql security definer set search_path = public stable as $fn$
  select f.nome, f.ordem, v.id,
         split_part(btrim(v.nome), ' ', 1),
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

/* ------------- primeira entrada: confere os 4 dígitos e cria o PIN
   pgcrypto mora no schema `extensions`; como o search_path da função é só
   `public`, digest() precisa vir qualificado ou estoura em tempo de execução. */
create or replace function equipe_pin_criar(p_slug text, p_voluntario uuid, p_ult4 text, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_tel text; v_tok text; v_pin_atual text; v_n int; v_max constant int := 8;
begin
  if p_pin !~ '^[0-9]{4}$' then return jsonb_build_object('ok', false, 'erro', 'PIN_INVALIDO'); end if;

  select nullif(tel_norm(v.telefone),''), v.token, v.pin_hash
    into v_tel, v_tok, v_pin_atual
    from voluntarios v join equipes e on e.id = v.equipe_id
   where v.id = p_voluntario and e.slug = p_slug and v.ativo;

  if v_tok is null then return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO'); end if;
  if v_pin_atual is not null then return jsonb_build_object('ok', false, 'erro', 'JA_TEM_PIN'); end if;
  if v_tel is null or length(v_tel) < 4 then return jsonb_build_object('ok', false, 'erro', 'SEM_TELEFONE'); end if;

  insert into entrar_tentativas (voluntario_id) values (p_voluntario)
  on conflict (voluntario_id, dia) do update set n = entrar_tentativas.n + 1
  returning n into v_n;
  if v_n > v_max then return jsonb_build_object('ok', false, 'erro', 'MUITAS_TENTATIVAS'); end if;

  if right(v_tel, 4) <> tel_norm(coalesce(p_ult4,'')) then
    return jsonb_build_object('ok', false, 'erro', 'DIGITOS_NAO_CONFEREM', 'restam', greatest(v_max - v_n, 0));
  end if;

  update voluntarios set pin_hash = encode(extensions.digest(p_pin || v_tok, 'sha256'), 'hex') where id = p_voluntario;
  delete from entrar_tentativas where voluntario_id = p_voluntario;
  return jsonb_build_object('ok', true, 'token', v_tok);
end $fn$;

/* ------------------------------------------ entradas seguintes: só o PIN */
create or replace function equipe_pin_entrar(p_slug text, p_voluntario uuid, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_tok text; v_hash text; v_n int; v_max constant int := 8;
begin
  select v.token, v.pin_hash into v_tok, v_hash
    from voluntarios v join equipes e on e.id = v.equipe_id
   where v.id = p_voluntario and e.slug = p_slug and v.ativo;

  if v_tok is null then return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO'); end if;
  if v_hash is null then return jsonb_build_object('ok', false, 'erro', 'SEM_PIN'); end if;

  insert into entrar_tentativas (voluntario_id) values (p_voluntario)
  on conflict (voluntario_id, dia) do update set n = entrar_tentativas.n + 1
  returning n into v_n;
  if v_n > v_max then return jsonb_build_object('ok', false, 'erro', 'MUITAS_TENTATIVAS'); end if;

  if v_hash <> encode(extensions.digest(coalesce(p_pin,'') || v_tok, 'sha256'), 'hex') then
    return jsonb_build_object('ok', false, 'erro', 'PIN_NAO_CONFERE', 'restam', greatest(v_max - v_n, 0));
  end if;

  delete from entrar_tentativas where voluntario_id = p_voluntario;
  return jsonb_build_object('ok', true, 'token', v_tok);
end $fn$;
revoke all on function equipe_pin_criar(text, uuid, text, text) from public;
revoke all on function equipe_pin_entrar(text, uuid, text) from public;
grant execute on function equipe_pin_criar(text, uuid, text, text) to anon, authenticated;
grant execute on function equipe_pin_entrar(text, uuid, text) to anon, authenticated;
