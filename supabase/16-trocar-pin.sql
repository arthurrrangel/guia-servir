/* =============================================================================
   16 — TROCAR O PIN SOZINHO, PELA PRÓPRIA PÁGINA

   POR QUE: a Lana criou o PIN, respondeu a disponibilidade até outubro e depois
   não conseguiu mais entrar. Os hashes estão todos íntegros (conferido: para
   cada uma das 19 pessoas com PIN existe exatamente UM código de 4 dígitos que
   gera o hash guardado com o token atual). Ou seja, o banco está certo — ela
   simplesmente esqueceu o PIN.

   E aí o sistema não tinha saída: `equipe_pin_criar` recusa com JA_TEM_PIN
   quando pin_hash já existe, e não havia nenhuma outra porta. Esqueceu o PIN =
   travado até o organizador mandar o link pessoal no privado. Isso é
   exatamente o gargalo que a migração 08 dizia estar resolvendo, só que
   deslocado: em vez de depender do líder para ENTRAR, você depende dele para
   VOLTAR A ENTRAR.

   SOLUÇÃO: quem já está com o link pessoal na mão já provou quem é — o token
   é a credencial mais forte do sistema. Então de dentro de /eu/<token> a
   pessoa pode gravar um PIN novo, sem saber o antigo.

   O que isto NÃO abre: nada. Quem tem o token já entra direto na página; poder
   definir o PIN não dá acesso a nada que ele já não desse. O PIN existe para
   quem NÃO tem o link guardado.

   De quebra, zera o contador de tentativas — quem se trancou fora com 8 erros
   destrava sozinho.
   ============================================================================= */

create or replace function eu_trocar_pin(p_token text, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'erro', 'PIN_INVALIDO');
  end if;

  select v.id into v_id from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then
    return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO');
  end if;

  /* mesmo sal da 08: sha256(pin || token). Trocar a fórmula aqui e não lá
     faria o PIN novo nunca conferir na tela de entrada. */
  update voluntarios
     set pin_hash = encode(extensions.digest(p_pin || p_token, 'sha256'), 'hex')
   where id = v_id;

  delete from entrar_tentativas where voluntario_id = v_id;
  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function eu_trocar_pin(text, text) from public;
grant execute on function eu_trocar_pin(text, text) to anon, authenticated;

comment on function eu_trocar_pin(text, text) is
  'grava um PIN novo para quem está com o link pessoal na mão. Não pede o PIN antigo: o token já é prova de identidade. Zera entrar_tentativas.';

----------------------------------------------------------------------------
-- conferência: o PIN novo tem que conferir na MESMA fórmula da tela de entrada
do $$
declare v_tok text; v_id uuid; v_hash text; v_ok boolean;
begin
  select id, token into v_id, v_tok from voluntarios where ativo and pin_hash is not null limit 1;
  if v_id is null then raise notice 'sem ninguem para testar'; return; end if;

  create temp table _bk as select id, pin_hash from voluntarios where id = v_id;

  perform eu_trocar_pin(v_tok, '4731');
  select pin_hash into v_hash from voluntarios where id = v_id;
  v_ok := v_hash = encode(extensions.digest('4731' || v_tok, 'sha256'), 'hex');

  update voluntarios v set pin_hash = b.pin_hash from _bk b where v.id = b.id;
  drop table _bk;

  if not v_ok then raise exception 'FORMULA DIVERGIU da 08'; end if;
  raise notice 'ok: PIN novo confere com sha256(pin||token), e o antigo foi restaurado';
end $$;

select 'eu_trocar_pin instalada' as feito;
