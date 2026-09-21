/* ESTE ARQUIVO E PASSADO. A TRANCA ESTA AQUI PORQUE ELE PODE DESFAZER.

   `create or replace function` nao e idempotente NO TEMPO: ele grava a versao
   deste arquivo por cima da que estiver la, seja ela mais nova ou nao, e sem
   um aviso.

   O que este arquivo consegue reverter, se rodar fora de hora:
     candidatar e candidatura_status (a 64 refez as duas)

   Por isso ele se recusa a rodar num banco que ja passou da 63. Aplicado na
   ordem, do zero, `exige_versao_ate` ainda nem existe (ela nasce na 55) e o
   bloco nao faz nada — e e assim que tem que ser, senao o rebuild do
   repositorio parava aqui.

   Se voce REALMENTE precisa reaplicar, a mensagem do erro diz como. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(63);
  end if;
end $tranca$;

/* =============================================================================
   63 · A PORTA PÚBLICA PARA DE DEIXAR A CHAVE DEBAIXO DO TAPETE

   21/09/2026. Só de Escalas. Depende da 55.

   -------------------------------------------------------------------------
   A REGRA QUE JÁ ESTAVA ESCRITA, E O LUGAR ONDE ELA NÃO FOI APLICADA

   O cabeçalho da 51 escreveu a regra em letras garrafais:

       A PORTA PÚBLICA SÓ ENTREGA CREDENCIAL QUE ELA MESMA ACABOU DE CRIAR,
       PARA UMA IDENTIDADE QUE ELA MESMA ACABOU DE CRIAR.

   A 51 aplicou em `candidatar`. A 55 aplicou em `inscrever`. As duas
   trataram o RETORNO: quando a pessoa já existia, a função passou a devolver
   `pendente: true` e a segurar o token.

   Nenhuma das duas tratou a ESCRITA. `inscrever` continuou criando o vínculo
   com `ativo = not v_gate` — isto é, ATIVO em qualquer ministério sem portão,
   inclusive quando ela acabara de decidir que não entregaria a chave.

   E um vínculo ativo É uma credencial, só que adiada. O caminho é curto e
   está todo no repositório:

     `equipe_time(slug)`      lista todo vínculo com `v.ativo`, com o id e
                              com `tem_pin = false`;
     `equipe_pin_criar(...)`  aceita esse id, confere os 4 últimos dígitos do
                              telefone e, acertando, devolve `v.token`.

   Os 4 dígitos são a defesa. Só que neste caminho quem chama JÁ SABE o
   telefone: foi ele quem digitou, três chamadas antes. O freio da 31 e da 44
   conta ERRO de dígito; aqui não há erro nenhum. A porta com tranca ficou
   trancada, e a chave ficou embaixo do tapete ao lado.

   -------------------------------------------------------------------------
   A CADEIA, MEDIDA — NÃO DEDUZIDA

   Rodada em 21/09/2026 num banco nascido de `scripts/banco-do-zero.sh`, com
   as 62 migrações aplicadas, contra uma vítima sintética que serve SÓ no
   Louvor (ministério COM portão) e organiza o Louvor:

     1. anon -> inscrever('midia', 'Atacante Qualquer Nome', <telefone dela>)
        devolve {"ok": true, "pendente": true}   <- a 55 funcionando: sem token
     2. e mesmo assim cria o vínculo na Mídia com ativo = TRUE
     3. anon -> equipe_time('midia')  lista esse vínculo, tem_pin = false
     4. anon -> equipe_pin_criar('midia', <id>, <os 4 dígitos que ele digitou
        no passo 1>, '4321')          devolve {"ok": true, "token": "..."}
     5. anon -> quem_sou(<token>)     devolve o NOME COMPLETO da vítima, o
        e-mail dela, a marca de administrador, a lista de ministérios que ela
        ORGANIZA e a lista dos que ela serve
     6. anon -> eu_sexo(<token>, 'M') o `sexo` do vínculo dela NO LOUVOR foi
        de F para M

   O passo 6 é o que tira isso de "vazamento de perfil" e põe em "escrita no
   cadastro de terceiro": `eu_sexo` grava em TODAS as linhas da mesma
   `pessoa_id`, de propósito (migração 49 — sexo é da pessoa, não da área). E
   desde a 48 o sexo decide quem pode entrar onde. Um anônimo que sabe um
   telefone reescreve a elegibilidade de uma pessoa num ministério onde ele
   nunca pôs o pé.

   Telefone não é segredo: numa igreja ele circula em grupo de WhatsApp. É a
   mesma frase da 51, e ela continua verdadeira.

   -------------------------------------------------------------------------
   POR QUE A GUARDA DE `JA_CADASTRADO` NÃO PEGAVA

   `inscrever` recusa telefone repetido, mas só DENTRO da mesma equipe:

       where v.equipe_id = v_eq and tel_norm(v.telefone) = v_tel

   O ataque mira exatamente o vão: uma equipe onde a vítima NÃO está. Quem
   serve só no Louvor é alvo pela Mídia, pelo Connect e pela Livraria.

   -------------------------------------------------------------------------
   A CORREÇÃO: UMA EXPRESSÃO

       ativo := not v_gate            ->   ativo := not v_gate and v_pessoa_nova

   Logo abaixo, inalterada, está a condição que decide o retorno:

       if v_gate or not v_pessoa_nova then ... pendente = true (sem token)

   As duas passam a ser complementos exatos — `not (A or not B)` é
   `not A and B`. O invariante que o arquivo passa a sustentar cabe numa
   linha, e é ele que a conferência cobra:

       A PORTA NUNCA DEVOLVE `pendente` E DEIXA O VÍNCULO ATIVO.

   Nada mais do corpo muda. A lição da 54 e da 55 vale de novo: quando a
   correção é pequena, o arquivo COPIA o resto. O corpo abaixo saiu de
   `supabase/55-o-que-a-equipe-de-agentes-achou.sql` por extração, e o `diff`
   contra ele tem uma linha de código.

   -------------------------------------------------------------------------
   O QUE ISSO CUSTA, DITO SEM MAQUIAGEM

   Quem já está no sistema e quer servir numa SEGUNDA área sem portão não
   entra mais sozinho: o cadastro acontece, o vínculo fica lá, e a liderança
   libera na aba Time. Numa igreja onde muita gente serve em duas áreas, isso
   é trabalho novo para quem lidera, e é real.

   O que se compra com ele: a porta anônima deixa de produzir vínculo ativo
   numa identidade que ela não criou. Não há terceira opção — o telefone é o
   único dado que a porta pede, e ele não prova identidade nenhuma.

   O ARQUIVO NÃO DESATIVA NINGUÉM QUE JÁ ESTÁ ATIVO. Desligar em massa
   derrubaria quem entrou legitimamente por essa porta antes da correção. A
   conferência LISTA os suspeitos (§ SUSPEITOS, no fim) e deixa a decisão com
   a liderança, que é quem sabe quem é quem.

   -------------------------------------------------------------------------
   O QUE MUDA NO APP

   `app/time/page.tsx`: um vínculo que nunca foi ativado aparecia como
   "pausado", palavra que descreve uma decisão da liderança. Passa a aparecer
   como "aguardando", com o botão "Liberar" no lugar de "Reativar". Nenhuma
   outra tela muda.
   ============================================================================= */


-- =========================================================================
-- 1 · `inscrever` para de criar vínculo ativo em identidade de terceiro
--
-- Corpo extraído de `supabase/55-o-que-a-equipe-de-agentes-achou.sql`, com
-- UMA linha de código diferente. O `diff` entre os dois arquivos cabe na
-- tela, e é isso que torna este arquivo revisável.
-- =========================================================================

create or replace function public.inscrever(
  p_slug text, p_nome text, p_tel text, p_email text, p_funcoes jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
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

  insert into voluntarios (equipe_id, pessoa_id, nome, telefone, email, conferido, ativo)
       /* 63 · A ÚNICA MUDANÇA DESTE ARQUIVO.
          Era `not v_gate`. O vínculo nascia ATIVO mesmo quando a porta se
          recusava a devolver o token, e vínculo ativo é credencial adiada:
          `equipe_time` lista, `equipe_pin_criar` confere os 4 dígitos (que
          quem chamou acabou de digitar) e entrega o token.
          Agora `ativo` é o COMPLEMENTO EXATO da condição de `pendente` logo
          abaixo: ou a porta entrega a chave e o vínculo está vivo, ou ela
          segura as duas coisas. Nunca mais uma sem a outra. */
       values (v_eq, v_pessoa, v_nome, v_tel, v_mail, false, not v_gate and v_pessoa_nova)
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
end $fn$;


revoke all on function public.inscrever(text,text,text,text,jsonb) from public;
grant execute on function public.inscrever(text,text,text,text,jsonb) to anon, authenticated;
comment on function public.inscrever(text,text,text,text,jsonb) is
  'cadastro pela porta de /equipe/<area>. Desde a 63: so cria vinculo ATIVO quando a propria chamada criou a identidade. Pessoa que ja existia vira vinculo inativo e pendente, porque vinculo ativo e credencial adiada (equipe_time + equipe_pin_criar devolvem o token).';

-- =========================================================================
-- REGISTRO NA RÉGUA E NA SONDA
-- =========================================================================

do $reg$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (63, '63 · inscrever so ativa vinculo de identidade que ela criou', 'inscrever',
           'not v_gate and v_pessoa_nova')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;

  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo)
      values (63, '63-a-porta-publica-para-de-deixar-a-chave-debaixo-do-tapete.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;


-- =========================================================================
-- A CONFERÊNCIA
--
-- Monta a cadeia inteira do cabeçalho, passo por passo, e cobra que ela PARE
-- no degrau certo. Catálogo não serve aqui por um motivo específico: o texto
-- `not v_gate` estava escrito, era legível, e parecia razoável — o defeito só
-- aparece quando se ANDA o caminho, porque ele mora na composição de três
-- funções que, sozinhas, estão cada uma certa.
--
-- Os casos 5 e 6 existem para a correção não virar uma tranca no caminho de
-- quem tem razão: gente nova em ministério aberto PRECISA continuar entrando
-- sozinha, e é assim que a maior parte das pessoas chega.
-- =========================================================================

do $conf$
declare
  v_eq uuid; v_eq_gate uuid; v_fn uuid; v_fn_gate uuid;
  v_pessoa uuid; v_vinc_louvor uuid; v_id uuid; v_id2 uuid;
  v_r jsonb; v_token text; v_sexo text;
  v_tel_vitima  text := '21999990063';
  v_tel_novato  text := '21999990064';
  v_tel_outro   text := '21999990065';
  ok int := 0; falhou int := 0; msg text := ''; n int;
begin
  /* ---- cena ------------------------------------------------------------
     Duas equipes de teste, uma aberta e uma com portão, para o invariante
     ser cobrado nas duas pontas. Slugs com sufixo para não colidir com nada
     de produção. */
  insert into equipes (nome, slug, ordem, exige_aprovacao)
       values ('Conf63 Aberta', 'conf63-aberta', 9963, false) returning id into v_eq;
  insert into equipes (nome, slug, ordem, exige_aprovacao)
       values ('Conf63 Portao', 'conf63-portao', 9964, true)  returning id into v_eq_gate;
  insert into funcoes (equipe_id, nome, ordem, ativa)
       values (v_eq, 'POSTO63', 1, true) returning id into v_fn;
  insert into funcoes (equipe_id, nome, ordem, ativa)
       values (v_eq_gate, 'POSTO63G', 1, true) returning id into v_fn_gate;

  /* a vítima: existe em `pessoas`, serve só na equipe COM portão */
  insert into pessoas (nome, telefone, email)
       values ('Vitima Conf Sessentaetres', v_tel_vitima, 'v63@exemplo.invalido')
    returning id into v_pessoa;
  insert into voluntarios (equipe_id, pessoa_id, nome, telefone, conferido, ativo, sexo)
       values (v_eq_gate, v_pessoa, 'Vitima Conf Sessentaetres', v_tel_vitima, true, true, 'F')
    returning id into v_vinc_louvor;

  /* ---- 1. a porta continua NÃO devolvendo token (a 55 de pé) ----------- */
  v_r := inscrever('conf63-aberta', 'Atacante Conf Sessentaetres', v_tel_vitima, null,
                   '{"POSTO63":"reserva"}'::jsonb);
  if (v_r ->> 'ok')::boolean and (v_r ->> 'pendente')::boolean
     and (v_r ->> 'token') is null then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x inscrever mudou de comportamento no retorno: ' || v_r::text;
  end if;

  select v.id into v_id from voluntarios v
   where v.equipe_id = v_eq and v.pessoa_id = v_pessoa;

  /* ---- 2. O INVARIANTE: pendente e ativo não convivem ------------------ */
  if v_id is null then
    falhou := falhou + 1;
    msg := msg || E'\n  x o vinculo nao foi criado: o caso nao esta montado e o resto seria vacuo';
  elsif not (select ativo from voluntarios where id = v_id) then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x A CHAVE CONTINUA DEBAIXO DO TAPETE: a porta devolveu pendente e deixou o vinculo ATIVO';
  end if;

  /* ---- 3. e por isso a lista pública não o mostra ---------------------- */
  select count(*) into n from equipe_time('conf63-aberta') t where t.voluntario_id = v_id;
  if n = 0 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x equipe_time ainda lista o vinculo: o degrau 3 da cadeia esta aberto';
  end if;

  /* ---- 4. e a criação de PIN recusa, que é onde o token saía -----------

     82 · E RECUSA PELO MOTIVO CERTO.

     Era só `if (v_r ->> 'token') is null then ok := ok + 1`. Token nulo é o
     que sai de QUALQUER erro desta função — `LINK_INVALIDO`, `SEM_TELEFONE`,
     `MUITAS_TENTATIVAS`, `JA_TEM_PIN`, `PIN_INVALIDO`. Um slug errado no
     teste, um `v_id` que não existe, um limite de taxa herdado de um caso
     anterior: tudo devolvia token nulo e tudo ficava verde, sem que a porta
     que esta migração fecha tivesse sido encostada.

     -----------------------------------------------------------------------
     E EU ERREI QUAL ERA O MOTIVO CERTO. FICA ESCRITO.

     Escrevi `DIGITOS_NAO_CONFEREM`, raciocinando que o degrau da 63 era o
     dos quatro dígitos. Rodei, e a conferência me corrigiu:

         x equipe_pin_criar recusou, mas por OUTRO motivo
           (esperava DIGITOS_NAO_CONFEREM): {"ok": false, "erro": "LINK_INVALIDO"}

     `LINK_INVALIDO` é o certo, e é MELHOR notícia do que a que eu esperava.
     O vínculo existe (o caso 2 acabou de provar que ele foi criado), mas
     nasceu `ativo = false` — que é exatamente a correção desta migração. Com
     ele inativo, `equipe_pin_criar` nem chega a comparar dígito nenhum: não
     encontra link para reivindicar.

     Então a inversão importa: ver `DIGITOS_NAO_CONFEREM` AQUI seria sinal de
     que a correção caiu, porque significaria que a função encontrou um
     vínculo ATIVO e parou só no último degrau — com o telefone certo, o
     atacante passaria. Por isso o caso exige `LINK_INVALIDO` e trata os
     outros, inclusive o dos dígitos, como reprovação. */
  v_r := equipe_pin_criar('conf63-aberta', v_id, right(v_tel_vitima, 4), '4321');
  if (v_r ->> 'token') is not null then
    falhou := falhou + 1;
    msg := msg || E'\n  x equipe_pin_criar ENTREGOU O TOKEN: a cadeia inteira continua de pe';
  elsif coalesce(v_r ->> 'erro','') = 'LINK_INVALIDO' then ok := ok + 1;
  elsif coalesce(v_r ->> 'erro','') = 'DIGITOS_NAO_CONFEREM' then
    falhou := falhou + 1;
    msg := msg || E'\n  x A CORRECAO CAIU: equipe_pin_criar ACHOU um vinculo ativo e parou so nos digitos. '
               || 'Com o telefone certo (que e o que o atacante tem), ele passaria.';
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x equipe_pin_criar recusou, mas por OUTRO motivo (esperava LINK_INVALIDO): '
               || v_r::text || E' — o degrau da 63 nao foi testado.';
  end if;

  /* ---- 4b. a prova de que a cadeia morre: nada foi escrito na vítima ---
     Se o degrau 4 tivesse aberto, este token abriria `eu_sexo` e o `sexo`
     da vítima na OUTRA equipe mudaria. Cobrar o efeito, e não só o retorno,
     é o que separa esta conferência de uma que lê a própria correção. */
  v_token := v_r ->> 'token';
  if v_token is not null then
    perform eu_sexo(v_token, 'M');
  end if;
  select sexo into v_sexo from voluntarios where id = v_vinc_louvor;
  if v_sexo = 'F' then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x o cadastro da vitima em OUTRA equipe foi reescrito por quem so sabia o telefone dela';
  end if;

  /* ---- 5. O CAMINHO DE QUEM TEM RAZÃO: gente nova, área aberta --------- */
  v_r := inscrever('conf63-aberta', 'Novato Conf Sessentaetres', v_tel_novato, null,
                   '{"POSTO63":"reserva"}'::jsonb);
  select v.id into v_id2 from voluntarios v
   where v.equipe_id = v_eq and tel_norm(v.telefone) = v_tel_novato;
  if (v_r ->> 'token') is not null and (v_r ->> 'pendente')::boolean is false
     and (select ativo from voluntarios where id = v_id2) then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x A CORRECAO FECHOU A PORTA DE QUEM TEM RAZAO: gente nova em area aberta '
               || 'precisa continuar entrando sozinha. Retorno: ' || v_r::text;
  end if;

  /* ---- 6. e o portão continua segurando gente nova -------------------- */
  v_r := inscrever('conf63-portao', 'Outro Conf Sessentaetres', v_tel_outro, null,
                   '{"POSTO63G":"reserva"}'::jsonb);
  if (v_r ->> 'pendente')::boolean
     and (v_r ->> 'token') is null
     and not (select ativo from voluntarios v
               where v.equipe_id = v_eq_gate and tel_norm(v.telefone) = v_tel_outro)
  then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x o portao parou de segurar: ' || v_r::text;
  end if;

  /* ---- limpeza, POR ID -------------------------------------------------
     A lição da 61: apagar por data ou por slug numa conferência já derrubou
     dado de produção uma vez. Aqui só saem as linhas cujos ids este bloco
     criou, e as equipes saem por último. */
  delete from habilidades h using voluntarios v
   where h.voluntario_id = v.id and v.equipe_id in (v_eq, v_eq_gate);
  delete from voluntarios where equipe_id in (v_eq, v_eq_gate);
  delete from funcoes where id in (v_fn, v_fn_gate);
  delete from equipes where id in (v_eq, v_eq_gate);
  delete from pessoas where telefone in (v_tel_vitima, v_tel_novato, v_tel_outro);

  if falhou > 0 then
    raise exception 'A CONFERENCIA DA 63 REPROVOU: % de % casos', falhou, ok + falhou
      using detail = msg, errcode = 'raise_exception';
  end if;
  raise notice '63 · conferencia: %/% casos. A porta publica nao deixa mais vinculo ativo numa identidade que ela nao criou, e quem e novo em area aberta continua entrando sozinho.', ok, ok;
end $conf$;


-- =========================================================================
-- § SUSPEITOS
--
-- O que a correção NÃO faz: desativar quem já está ativo. Esta consulta é o
-- que ela oferece no lugar — a lista para a liderança olhar com nome.
--
-- O sinal: `inscrever` grava em `voluntarios.nome` o que QUEM CHAMOU digitou,
-- e a 51/55 deixaram `pessoas.nome` intacto (`on conflict do nothing`). Um
-- vínculo ativo, nunca conferido, cujo nome DIFERE do nome da pessoa é o
-- rastro exato que a cadeia deste arquivo deixava.
--
-- É HEURÍSTICA, e o arquivo diz isso em vez de fingir precisão: casa também
-- com quem digitou o nome abreviado, e não pega quem digitou o nome certo.
-- Zero linha aqui é a resposta boa; qualquer linha pede uma conversa.
-- =========================================================================

select e.slug                              as ministerio,
       v.nome                              as nome_digitado_na_porta,
       p.nome                              as nome_da_pessoa,
       right(coalesce(v.telefone, ''), 4)  as fim_do_telefone,
       v.criado_em,
       (select count(*) from voluntarios v2
         where v2.pessoa_id = p.id and v2.id <> v.id) as outros_vinculos_dela
  from voluntarios v
  join pessoas p  on p.id = v.pessoa_id
  join equipes e  on e.id = v.equipe_id
 where v.ativo
   and not v.conferido
   and not coalesce(e.exige_aprovacao, false)
   and btrim(lower(v.nome)) <> btrim(lower(p.nome))
   and exists (select 1 from voluntarios v2
                where v2.pessoa_id = p.id and v2.id <> v.id)
 order by v.criado_em desc;

/* A PRIMEIRA VERSÃO DESTA CONSULTA ERA VAZIA, E EU SÓ DESCOBRI PORQUE OLHEI.
   Ela pedia `v2.criado_em < v.criado_em` — "a pessoa já existia" — e a linha
   plantada para testar não aparecia: as duas tinham sido criadas na mesma
   transação, com o mesmo `now()`, e `<` estrito é falso entre iguais. Num
   banco de verdade os instantes diferem e a consulta funcionaria, o que é
   pior: seria uma peneira com um furo que ninguém veria.

   "A pessoa tem OUTRO vínculo" já diz a mesma coisa sem depender de relógio:
   `inscrever` nunca cria dois vínculos numa chamada, então o outro vínculo é
   necessariamente anterior. Menos condição, mesma pergunta. */


/* =============================================================================
   ROLLBACK
     Copiar o corpo de `inscrever` da migração 55 por cima. A única diferença
     é `not v_gate` no lugar de `not v_gate and v_pessoa_nova` — e o defeito
     do cabeçalho volta inteiro.

   VERIFICAÇÃO DEPOIS DE APLICAR
     select * from testar_permissoes();
     select * from schema_versao_conferir();
     -- e a conferência acima já roda sozinha ao aplicar o arquivo.
   ============================================================================= */
