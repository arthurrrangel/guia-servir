/* ESTE ARQUIVO E PASSADO. A TRANCA ESTA AQUI PORQUE ELE PODE DESFAZER.

   `create or replace function` nao e idempotente NO TEMPO: ele grava a versao
   deste arquivo por cima da que estiver la, seja ela mais nova ou nao, e sem
   um aviso.

   O que este arquivo consegue reverter, se rodar fora de hora:
     equipe_pin_criar (a 81 refez: reaplicar aqui tira PRECISA_CONFERIR e `Liberar`
     volta a valer por `Conferir`)

   Por isso ele se recusa a rodar num banco que ja passou da 44. Aplicado na
   ordem, do zero, `exige_versao_ate` ainda nem existe (ela nasce na 55) e o
   bloco nao faz nada — e e assim que tem que ser, senao o rebuild do
   repositorio parava aqui.

   Se voce REALMENTE precisa reaplicar, a mensagem do erro diz como. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(44);
  end if;
end $tranca$;

/* =============================================================================
   44 · O OUTRO EIXO, NA CRIAÇÃO DO PIN
   15/09/2026. Achado da auditoria completa de 14/09.

   A migração 31 (§5) fechou a varredura de PIN em `equipe_pin_entrar`: um
   freio POR EQUIPE que conta só erro, 30 por dia, conferido antes de gastar o
   crédito da pessoa. E deixou `equipe_pin_criar` como estava: só o limite de
   8 tentativas por pessoa por dia.

   O eixo que ficou aberto é o mesmo. `equipe_time` entrega a lista de ids da
   área sem login e diz quem ainda NÃO tem PIN (`tem_pin`). Para cada um desses,
   a criação do PIN pede os 4 últimos dígitos do WhatsApp — e aceita 8 palpites
   por dia. Quatro dígitos de telefone não têm "1234" nem aniversário, são
   quase uniformes: 8 em 10.000 é 0,08% por pessoa por dia. Só que ninguém
   ataca uma pessoa; ataca a lista. Com 20 pessoas sem PIN, é 1,6% ao dia de
   entrar como ALGUÉM — e quem entra assim cria o PIN daquela pessoa, recebe o
   token dela e passa a ser ela no sistema. Num mês, a chance passa de 1 em 3.

   O freio é o MESMO da 31: a mesma tabela `entrar_tentativas_equipe`, o mesmo
   teto de 30 erros somados por equipe por dia, conferido ANTES de consumir a
   tentativa da pessoa, e só o erro de dígitos incrementa. Uso legítimo não
   chega perto: no domingo em que a liderança manda o link no grupo e trinta
   pessoas criam PIN de uma vez, os acertos não contam, e os erros de digitação
   de trinta pessoas não somam trinta.

   A mesma escolha consciente da 31 sobre negação de serviço: um atacante pode
   queimar os 30 e deixar a criação de PIN da área parada até a virada do dia.
   O caminho normal continua sendo o link pessoal que cada um já tem no
   WhatsApp. Trocar isso por imunidade a varredura é um bom negócio.

   PRÉ-REQUISITO: a 31 aplicada (a tabela existe). O bloco abaixo confere e
   para, em vez de criar uma função que quebra em tempo de execução.

   O QUE O APP FAZ COM O ERRO NOVO: `MUITAS_TENTATIVAS_EQUIPE` já era possível
   em `equipe_pin_entrar` desde a 31 e a tela respondia com a frase genérica;
   `app/equipe/[slug]/Lista.tsx` ganhou a frase certa no mesmo commit desta
   migração. Nada mais muda no app.
   ============================================================================= */

do $$ begin
  if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'entrar_tentativas_equipe') then
    raise exception 'A migração 31 ainda não foi aplicada: entrar_tentativas_equipe não existe. Aplique a 31 antes desta.';
  end if;
end $$;

create or replace function equipe_pin_criar(p_slug text, p_voluntario uuid, p_ult4 text, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_tel text; v_tok text; v_pin_atual text; v_n int; v_eq uuid; v_eq_n int;
  v_max        constant int := 8;    -- por pessoa, por dia (como antes)
  v_max_equipe constant int := 30;   -- erros de dígitos somados da equipe, por dia (o mesmo teto da 31)
begin
  if p_pin !~ '^[0-9]{4}$' then return jsonb_build_object('ok', false, 'erro', 'PIN_INVALIDO'); end if;

  select nullif(tel_norm(v.telefone),''), v.token, v.pin_hash, v.equipe_id
    into v_tel, v_tok, v_pin_atual, v_eq
    from voluntarios v join equipes e on e.id = v.equipe_id
   where v.id = p_voluntario and e.slug = p_slug and v.ativo;

  if v_tok is null then return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO'); end if;
  if v_pin_atual is not null then return jsonb_build_object('ok', false, 'erro', 'JA_TEM_PIN'); end if;
  if v_tel is null or length(v_tel) < 4 then return jsonb_build_object('ok', false, 'erro', 'SEM_TELEFONE'); end if;

  /* o teto da equipe é conferido ANTES de gastar tentativa da pessoa: a
     varredura não consome o crédito de quem não tem nada a ver com isso */
  select n into v_eq_n from entrar_tentativas_equipe
   where equipe_id = v_eq and dia = current_date;
  if coalesce(v_eq_n, 0) >= v_max_equipe then
    return jsonb_build_object('ok', false, 'erro', 'MUITAS_TENTATIVAS_EQUIPE');
  end if;

  insert into entrar_tentativas (voluntario_id) values (p_voluntario)
  on conflict (voluntario_id, dia) do update set n = entrar_tentativas.n + 1
  returning n into v_n;
  if v_n > v_max then return jsonb_build_object('ok', false, 'erro', 'MUITAS_TENTATIVAS'); end if;

  if right(v_tel, 4) <> tel_norm(coalesce(p_ult4,'')) then
    /* só o ERRO conta para a equipe; acerto e recusas anteriores não somam */
    insert into entrar_tentativas_equipe (equipe_id) values (v_eq)
    on conflict (equipe_id, dia) do update set n = entrar_tentativas_equipe.n + 1;
    return jsonb_build_object('ok', false, 'erro', 'DIGITOS_NAO_CONFEREM', 'restam', greatest(v_max - v_n, 0));
  end if;

  update voluntarios set pin_hash = encode(extensions.digest(p_pin || v_tok, 'sha256'), 'hex') where id = p_voluntario;
  delete from entrar_tentativas where voluntario_id = p_voluntario;
  return jsonb_build_object('ok', true, 'token', v_tok);
end $fn$;

revoke all on function equipe_pin_criar(text, uuid, text, text) from public;
grant execute on function equipe_pin_criar(text, uuid, text, text) to anon, authenticated;

/* =============================================================================
   ROLLBACK
     create or replace com o corpo de 08-pin-e-lista-por-area.sql:42
     (é a versão sem o freio por equipe; a tabela fica, a 31 ainda usa).

   VERIFICAÇÃO DEPOIS DE APLICAR
     select * from testar_permissoes();
     -- e, numa equipe de teste, 30 palpites errados de dígitos seguidos em
     -- pessoas diferentes: o 31º responde MUITAS_TENTATIVAS_EQUIPE.
   ============================================================================= */
