-- =========================================================================
-- 81 · "LIBERAR" NÃO PODIA VALER POR "CONFERIR"
--
-- 21/09/2026. Reauditoria da migração 63, que fechou uma cadeia de
-- personificação — e fechou de um jeito que um clique desfaz.
--
-- -------------------------------------------------------------------------
-- A CADEIA, MEDIDA INTEIRA
--
-- Num banco nascido do repositório, cinco passos:
--
--   1. anon chama `inscrever` numa área de portão aberto com o TELEFONE de
--      uma voluntária de outra área, e o nome que ele quiser:
--
--        inscrever('midia','Atacante Qualquer Nome', <telefone dela>, ...)
--          -> {"ok": true, "pendente": true}          (sem token: a 63 ok)
--        vinculo criado: ativo = false, pessoa_id = o DELA
--
--   2. a líder da Mídia vê "aguardando" na tela do Time e clica "Liberar".
--
--   3. `equipe_time('midia')` passa a mostrar o vínculo, com a marca
--      "criar PIN".
--
--   4. `equipe_pin_criar('midia', <id>, <os 4 dígitos que ELE digitou>, ...)`
--          -> RECEBEU O TOKEN
--
--   5. `quem_sou(token)` -> a ficha da voluntária, com nome, e-mail e final
--      do telefone. E `eu_sexo(token, ...)` reescreve o cadastro dela em
--      TODOS os ministérios.
--
-- A 63 fechou o passo 1 deixando o vínculo inativo, e escreveu que "o
-- vínculo fica lá, e a liderança libera na aba Time". O passo 2 é um clique,
-- e a tela não dizia nada: o cartão mostrava "Atacante Qualquer Nome" e a
-- pessoa por trás dele era "João Vitor Lima de Sousa". O sinal existia — a
-- própria 63 calcula `v.nome <> p.nome` numa consulta § SUSPEITOS no fim do
-- arquivo — e nunca chegou à tela onde o botão é clicado.
--
-- -------------------------------------------------------------------------
-- POR QUE NÃO BASTA AVISAR NA TELA
--
-- Aviso é bom e entra junto (a tela do Time passa a mostrar a divergência e
-- os dois nomes). Mas a divergência não é prova: "Maria" e "Maria Silva
-- Santos" divergem e são a mesma pessoa; e a 63 já tinha aprendido que regra
-- que só existe no navegador é regra que a próxima tela esquece.
--
-- E recusar a ativação também não serve: o caso legítimo — alguém que já
-- serve numa área se inscrevendo noutra — passa exatamente pelo mesmo
-- caminho, e é comum.
--
-- O QUE MUDA, ENTÃO: os quatro dígitos deixam de valer como prova enquanto
-- NINGUÉM tiver conferido aquele vínculo. `voluntarios.identidade_reivindicada`
-- nasce verdadeira quando `inscrever` cola o vínculo numa pessoa que JÁ
-- existia, e `equipe_pin_criar` recusa enquanto ela for verdadeira.
--
-- Quem limpa é `conferir_voluntario` — o botão "Conferi, está certo" da tela
-- do Time. A diferença entre LIBERAR (deixar servir) e CONFERIR (dizer quem
-- é) deixa de ser vocabulário e passa a ser a trava.
--
-- QUEM NÃO É AFETADO, conferido um a um:
--   · quem já serve e tem o link continua entrando pelo link;
--   · quem a líder cadastrou pela tela nunca passa por aqui, porque
--     `criar_voluntario` não marca a coluna — foi um humano que digitou;
--   · quem se inscreve com telefone que o sistema não conhece também não:
--     `v_pessoa_nova` é verdadeira e a coluna nasce falsa;
--   · e quem já tem PIN não é alcançado, porque `equipe_pin_criar` só cria o
--     primeiro.
-- =========================================================================

/* A TRANCA. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(81);
  end if;
end $tranca$;

alter table voluntarios
  add column if not exists identidade_reivindicada boolean not null default false;
comment on column voluntarios.identidade_reivindicada is
  'Verdadeira quando este vinculo nasceu pelo formulario publico COLADO numa pessoa que ja existia (o telefone digitado ja era de alguem). Enquanto for verdadeira, `equipe_pin_criar` recusa: os 4 digitos do telefone nao provam identidade quando foi o proprio inscrito que os digitou. Limpa em `conferir_voluntario`. Ver a migracao 81.';

/* a coluna é de decisão da liderança, como `conferido`: quem escreve é a
   função de conferir, e a porta pública não a toca depois de criada. */
revoke update (identidade_reivindicada) on voluntarios from authenticated;

CREATE OR REPLACE FUNCTION public.inscrever(p_slug text, p_nome text, p_tel text, p_email text, p_funcoes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_eq uuid; v_eq_nome text; v_gate boolean;
  v_nome text; v_tel text; v_mail text;
  v_id uuid; v_token text; v_n int; v_pessoa uuid;
  v_pessoa_nova boolean := false;   -- MUDANÇA 1
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

  /* MUDANÇA 2: a pergunta "esta pessoa já existia?" precisa ser respondida
     ANTES de qualquer escrita, e a resposta precisa sobreviver até o fim —
     é ela que decide se a porta pode entregar chave. E `do nothing` no lugar
     de `do update set email`: escrita anônima em tabela de identidade não
     tem por que existir (a 51 tirou isso de `candidatar` pelo mesmo motivo). */
  select p.id into v_pessoa from pessoas p where p.telefone = v_tel;
  if v_pessoa is null then
    insert into pessoas (nome, telefone, email) values (v_nome, v_tel, v_mail)
    on conflict (telefone) do nothing
      returning id into v_pessoa;
    if v_pessoa is null then
      select p.id into v_pessoa from pessoas p where p.telefone = v_tel;
    else
      v_pessoa_nova := true;
    end if;
  end if;

  insert into voluntarios (equipe_id, pessoa_id, nome, telefone, email, conferido, ativo,
                           identidade_reivindicada)
       /* 63 · A ÚNICA MUDANÇA DESTE ARQUIVO.
          Era `not v_gate`. O vínculo nascia ATIVO mesmo quando a porta se
          recusava a devolver o token, e vínculo ativo é credencial adiada:
          `equipe_time` lista, `equipe_pin_criar` confere os 4 dígitos (que
          quem chamou acabou de digitar) e entrega o token.
          Agora `ativo` é o COMPLEMENTO EXATO da condição de `pendente` logo
          abaixo: ou a porta entrega a chave e o vínculo está vivo, ou ela
          segura as duas coisas. Nunca mais uma sem a outra. */
       values (v_eq, v_pessoa, v_nome, v_tel, v_mail, false, not v_gate and v_pessoa_nova,
               /* ====================================================== 81 ===
                  A IDENTIDADE FOI REIVINDICADA, E NINGUEM CONFERIU AINDA.

                  Quando o telefone digitado JA pertence a alguem, este
                  vinculo nasce colado na identidade dessa pessoa — e quem
                  digitou foi um anonimo. A 63 deixou o vinculo inativo por
                  isso, e essa era a guarda inteira: um clique em "Liberar"
                  a desfazia.

                  Esta coluna e o que sobrevive ao clique. Enquanto ela for
                  verdadeira, `equipe_pin_criar` recusa — porque os quatro
                  digitos que ela pede sao os mesmos que o anonimo digitou.
                  Quem limpa e `conferir_voluntario`, que e o botao "Conferi,
                  esta certo" da tela do Time: a diferenca entre liberar e
                  conferir passa a ser real. */
               not v_pessoa_nova)
    returning id, token into v_id, v_token;

  insert into habilidades (voluntario_id, funcao_id, nivel, confirmado)
  select v_id, f.id, x.value::nivel_habilidade, false
    from jsonb_each_text(p_funcoes) x
    join funcoes f on f.equipe_id = v_eq and f.nome = x.key and f.ativa
   where x.value in ('titular', 'reserva', 'treino')
      on conflict (voluntario_id, funcao_id) do nothing;

  /* MUDANÇA 3: só entrega a chave se a identidade também é nova. Quando a
     pessoa já existia, o cadastro ACONTECE (o vínculo está lá, a liderança
     vê e entrega o link pela mão) — o que não acontece é a porta pública
     devolver credencial ligada a uma identidade que ela não criou. */
  if v_gate or not v_pessoa_nova then
    return jsonb_build_object('ok', true, 'pendente', true,
                              'nome', v_nome, 'equipe', v_eq_nome);
  end if;

  return jsonb_build_object('ok', true, 'pendente', false, 'token', v_token,
                            'nome', v_nome, 'equipe', v_eq_nome);
end $function$

;
CREATE OR REPLACE FUNCTION public.equipe_pin_criar(p_slug text, p_voluntario uuid, p_ult4 text, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tel text; v_tok text; v_pin_atual text; v_n int; v_eq uuid; v_eq_n int;
  v_reivindicada boolean;
  v_max        constant int := 8;    -- por pessoa, por dia (como antes)
  v_max_equipe constant int := 30;   -- erros de dígitos somados da equipe, por dia (o mesmo teto da 31)
begin
  if p_pin !~ '^[0-9]{4}$' then return jsonb_build_object('ok', false, 'erro', 'PIN_INVALIDO'); end if;

  select nullif(tel_norm(v.telefone),''), v.token, v.pin_hash, v.equipe_id,
         v.identidade_reivindicada
    into v_tel, v_tok, v_pin_atual, v_eq, v_reivindicada
    from voluntarios v join equipes e on e.id = v.equipe_id
   where v.id = p_voluntario and e.slug = p_slug and v.ativo;

  if v_tok is null then return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO'); end if;
  /* ============================================================== 81 ======
     OS QUATRO DIGITOS NAO PROVAM NADA QUANDO FOI O ATACANTE QUE OS DIGITOU.

     Cadeia medida em 21/09, cinco passos, num banco nascido do repositorio:

       1. anon chama `inscrever` numa area de portao aberto com o TELEFONE
          de uma voluntaria de outra area, e o nome que ele quiser. O vinculo
          nasce colado na identidade dela (`pessoa_id`), inativo, sem token.
       2. a lider ve "aguardando" na tela do Time e clica "Liberar".
       3. `equipe_time` passa a mostrar o vinculo, com a marca "criar PIN".
       4. `equipe_pin_criar` com os quatro digitos que ELE digitou no passo 1
          -> devolve o token.
       5. `quem_sou(token)` -> a ficha da voluntaria.

     A 63 fechou o passo 1 deixando o vinculo inativo. O passo 2 e um clique
     e reabre tudo, e nada na tela dizia a lider que o nome do vinculo
     ("Atacante Qualquer Nome") nao era o nome da pessoa ("Joao Vitor Lima
     de Sousa").

     Aqui a guarda e outra: enquanto NINGUEM tiver conferido aquele vinculo,
     os quatro digitos nao valem como prova — porque quem os escolheu pode
     nao ser o dono do telefone. Liberar deixa a pessoa servir; conferir diz
     "eu olhei e e ela mesma", e e isso que destrava o PIN.

     Quem ja serve e tem o link continua entrando pelo link. Quem foi
     cadastrado pela lider nunca passa por aqui: `criar_voluntario` nao marca
     a coluna. */
  if coalesce(v_reivindicada, false) then
    return jsonb_build_object('ok', false, 'erro', 'PRECISA_CONFERIR');
  end if;
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

  update voluntarios set pin_hash = encode(extensions.digest(p_pin || v_tok, 'sha256'), 'hex') where id = p_voluntario and pin_hash is null;
  if not found then return jsonb_build_object('ok', false, 'erro', 'JA_TEM_PIN'); end if;
  delete from entrar_tentativas where voluntario_id = p_voluntario;
  return jsonb_build_object('ok', true, 'token', v_tok);
end $function$

;
CREATE OR REPLACE FUNCTION public.conferir_voluntario(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  update habilidades set confirmado = true where voluntario_id = p_id;
  /* 81 · conferir e o unico lugar que limpa `identidade_reivindicada`.
     "Conferi, esta certo" passa a querer dizer tambem "olhei e e ela mesma",
     e e o que destrava o PIN daquele vinculo. A diferenca entre LIBERAR
     (deixar servir) e CONFERIR (dizer quem e) deixa de ser so vocabulario. */
  update voluntarios set conferido = true, identidade_reivindicada = false where id = p_id;
end $function$

;

do $reg$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (81, '81 · o PIN espera alguem conferir a identidade', 'equipe_pin_criar', 'precisa_conferir'),
      (81, '81 · inscrever marca identidade reivindicada', 'inscrever', 'not v_pessoa_nova)'),
      (81, '81 · conferir limpa a marca', 'conferir_voluntario', 'identidade_reivindicada = false')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo)
      values (81, '81-liberar-nao-podia-valer-por-conferir.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;

-- =========================================================================
-- CONFERÊNCIA
--
-- Ela refaz A CADEIA INTEIRA, os cinco passos, e cobra que ela morra no
-- passo 4. Depois confere que o caminho legítimo continua andando — porque
-- fechar a porta trancando quem tem a chave não é fechar a porta.
-- =========================================================================
do $conferir$
declare
  v_falhas text := ''; v_suf text; v_eq uuid; v_slug text; v_fn uuid;
  v_vitima uuid; v_tel text; v_vinc uuid; v_r jsonb; v_n int;
  v_eq2 uuid; v_slug2 text; v_fn2 uuid; v_tel2 text; v_vinc2 uuid;
begin
  v_suf := substr(md5(random()::text || clock_timestamp()::text), 1, 8);

  /* cenário: uma área de PORTÃO ABERTO, e uma "vítima" que já existe */
  insert into equipes (nome, slug, ordem, exige_aprovacao)
       values ('Conf81 ' || v_suf, 'conf81-' || v_suf, 9990, false)
    returning id, slug into v_eq, v_slug;
  insert into funcoes (equipe_id, nome, ordem, ativa, tipos)
       values (v_eq, 'POSTO 81', 1, true, array['domingo','follow']) returning id into v_fn;

  v_tel := '21' || lpad((floor(random()*900000000)+100000000)::text, 9, '0');
  insert into pessoas (nome, telefone) values ('Vitima 81 ' || v_suf, v_tel)
    returning id into v_vitima;

  -- ===== 1 · o anônimo se inscreve com o telefone da vítima =============
  v_r := inscrever(v_slug, 'Atacante 81 ' || v_suf, v_tel, null,
                   jsonb_build_object('POSTO 81', 'reserva'));
  if coalesce(v_r ->> 'ok', '') <> 'true' then
    v_falhas := v_falhas || format(E'\n  1. inscrever recusou o cenario: %s', v_r::text);
  end if;
  if coalesce(v_r ->> 'token', '') <> '' then
    v_falhas := v_falhas || E'\n  1b. inscrever devolveu TOKEN (a 63 quebrou)';
  end if;
  select id into v_vinc from voluntarios
   where equipe_id = v_eq and pessoa_id = v_vitima order by criado_em desc limit 1;
  if v_vinc is null then
    v_falhas := v_falhas || E'\n  1c. o vinculo nao foi criado: o resto da cadeia seria vacuo';
    raise exception E'CONFERENCIA DA 81 REPROVOU:%s', v_falhas;
  end if;
  if (select ativo from voluntarios where id = v_vinc) then
    v_falhas := v_falhas || E'\n  1d. o vinculo nasceu ATIVO (a guarda da 63 sumiu)';
  end if;
  if not (select identidade_reivindicada from voluntarios where id = v_vinc) then
    v_falhas := v_falhas || E'\n  1e. o vinculo nao foi marcado como identidade reivindicada';
  end if;

  -- ===== 2 · a líder clica "Liberar" =====================================
  update voluntarios set ativo = true where id = v_vinc;

  -- ===== 3 · o vínculo aparece na lista pública ==========================
  if not exists (select 1 from equipe_time(v_slug) t where t.voluntario_id = v_vinc) then
    v_falhas := v_falhas || E'\n  3. o vinculo liberado nao aparece na lista: o cenario nao e o real';
  end if;

  -- ===== 4 · O PASSO QUE TEM QUE MORRER ==================================
  v_r := equipe_pin_criar(v_slug, v_vinc, right(v_tel, 4), '4321');
  if coalesce(v_r ->> 'erro', '') <> 'PRECISA_CONFERIR' then
    v_falhas := v_falhas || format(
      E'\n  4. A CADEIA SEGUIU: equipe_pin_criar respondeu %s', v_r::text);
  end if;
  if coalesce(v_r ->> 'token', '') <> '' then
    v_falhas := v_falhas || E'\n  4b. e entregou o TOKEN da vitima';
  end if;
  if (select pin_hash from voluntarios where id = v_vinc) is not null then
    v_falhas := v_falhas || E'\n  4c. e gravou um PIN mesmo tendo recusado';
  end if;

  -- ===== 5 · depois de CONFERIR, o caminho legítimo anda =================
  perform conferir_voluntario(v_vinc);
  if (select identidade_reivindicada from voluntarios where id = v_vinc) then
    v_falhas := v_falhas || E'\n  5. conferir nao limpou a marca';
  end if;
  v_r := equipe_pin_criar(v_slug, v_vinc, right(v_tel, 4), '4321');
  if coalesce(v_r ->> 'ok', '') <> 'true' then
    v_falhas := v_falhas || format(
      E'\n  5b. depois de conferido, criar o PIN AINDA e recusado: %s', v_r::text);
  end if;

  -- ===== 6 · e quem se inscreve com telefone NOVO nao e afetado ==========
  insert into equipes (nome, slug, ordem, exige_aprovacao)
       values ('Conf81b ' || v_suf, 'conf81b-' || v_suf, 9991, false)
    returning id, slug into v_eq2, v_slug2;
  insert into funcoes (equipe_id, nome, ordem, ativa, tipos)
       values (v_eq2, 'POSTO 81B', 1, true, array['domingo','follow']) returning id into v_fn2;
  v_tel2 := '21' || lpad((floor(random()*900000000)+100000000)::text, 9, '0');
  v_r := inscrever(v_slug2, 'Gente Nova 81 ' || v_suf, v_tel2, null,
                   jsonb_build_object('POSTO 81B', 'reserva'));
  select id into v_vinc2 from voluntarios where equipe_id = v_eq2 order by criado_em desc limit 1;
  if v_vinc2 is null then
    v_falhas := v_falhas || E'\n  6. o cadastro de gente nova nem criou vinculo';
  else
    if (select identidade_reivindicada from voluntarios where id = v_vinc2) then
      v_falhas := v_falhas || E'\n  6b. gente NOVA foi marcada como identidade reivindicada';
    end if;
    if not (select ativo from voluntarios where id = v_vinc2) then
      v_falhas := v_falhas || E'\n  6c. gente nova em area de portao aberto nasceu INATIVA';
    end if;
    /* e ela cria o PIN dela na hora, sem depender de ninguém */
    v_r := equipe_pin_criar(v_slug2, v_vinc2, right(v_tel2, 4), '1234');
    if coalesce(v_r ->> 'ok', '') <> 'true' then
      v_falhas := v_falhas || format(
        E'\n  6d. gente nova NAO consegue criar o proprio PIN: %s', v_r::text);
    end if;
  end if;

  -- ===== 7 · e quem a LÍDER cadastrou também não é afetado ===============
  declare v_vinc3 uuid; v_tel3 text; v_p3 uuid; begin
    v_tel3 := '21' || lpad((floor(random()*900000000)+100000000)::text, 9, '0');
    insert into pessoas (nome, telefone) values ('Ja Existia 81 ' || v_suf, v_tel3)
      returning id into v_p3;
    insert into voluntarios (equipe_id, pessoa_id, nome, telefone, conferido, ativo)
         values (v_eq2, v_p3, 'Ja Existia 81 ' || v_suf, v_tel3, true, true)
      returning id into v_vinc3;
    if (select identidade_reivindicada from voluntarios where id = v_vinc3) then
      v_falhas := v_falhas || E'\n  7. vinculo criado pela lideranca nasceu marcado';
    end if;
    v_r := equipe_pin_criar(v_slug2, v_vinc3, right(v_tel3, 4), '5678');
    if coalesce(v_r ->> 'ok', '') <> 'true' then
      v_falhas := v_falhas || format(
        E'\n  7b. quem a lider cadastrou nao consegue criar o PIN: %s', v_r::text);
    end if;
  end;

  -- limpeza
  delete from entrar_tentativas ent using voluntarios v
   where v.id = ent.voluntario_id and v.equipe_id in (v_eq, v_eq2);
  delete from entrar_tentativas_equipe where equipe_id in (v_eq, v_eq2);
  delete from habilidades h using voluntarios v
   where v.id = h.voluntario_id and v.equipe_id in (v_eq, v_eq2);
  delete from voluntarios where equipe_id in (v_eq, v_eq2);
  delete from pessoas where nome like '%81 ' || v_suf;
  delete from config where equipe_id in (v_eq, v_eq2);
  delete from funcoes where equipe_id in (v_eq, v_eq2);
  delete from equipes where id in (v_eq, v_eq2);

  if v_falhas <> '' then
    raise exception E'CONFERENCIA DA 81 REPROVOU:%s', v_falhas;
  end if;
  raise notice 'CONFERENCIA DA 81: 7/7. A cadeia morre no passo 4, e conferir continua sendo o que destrava.';
end $conferir$;
