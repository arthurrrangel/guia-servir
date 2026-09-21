/* ESTE ARQUIVO E PASSADO. A TRANCA ESTA AQUI PORQUE ELE PODE DESFAZER.

   `create or replace function` nao e idempotente NO TEMPO: ele grava a versao
   deste arquivo por cima da que estiver la, seja ela mais nova ou nao, e sem
   um aviso.

   O que este arquivo consegue reverter, se rodar fora de hora:
     culto_guarda (a 78 refez: reaplicar aqui devolve o defeito da coluna GERADA, que
     fazia o guarda recusar todo domingo)

   Por isso ele se recusa a rodar num banco que ja passou da 69. Aplicado na
   ordem, do zero, `exige_versao_ate` ainda nem existe (ela nasce na 55) e o
   bloco nao faz nada — e e assim que tem que ser, senao o rebuild do
   repositorio parava aqui.

   Se voce REALMENTE precisa reaplicar, a mensagem do erro diz como. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(69);
  end if;
end $tranca$;

/* =============================================================================
   69 · O ORGANIZADOR DE UMA ÁREA ESCREVIA NOS EVENTOS DE TODAS

   21/09/2026. Só de Escalas. Depende da 56.

   -------------------------------------------------------------------------
   O DEFEITO, MEDIDO — NÃO DEDUZIDO

   Num banco nascido de `scripts/banco-do-zero.sh` com um evento de cada
   ministério plantado, entrando como o organizador do Louvor:

     === o organizador do Louvor ENXERGA: ===  3
     === e ESCREVE em:  update cultos set obs = null;     ===  UPDATE 7
     === e no horario:  update cultos set inicio = null;  ===  UPDATE 7

         data    |        ev        |   dono   |     obs
     ------------+------------------+----------+-------------
      2026-09-26 | (domingo)        | -        | <<APAGADO>>
      2026-10-04 | (domingo)        | -        | <<APAGADO>>
      2026-11-01 | Evento GUIA Kids | kids     | <<APAGADO>>
      2026-11-02 | Evento Livraria  | livraria | <<APAGADO>>
      2026-11-03 | Evento Louvor    | louvor   | <<APAGADO>>
      2026-11-04 | Evento Mídia     | midia    | <<APAGADO>>
      2026-11-05 | Evento Connect   | servico  | <<APAGADO>>

   Ele lê três linhas e escreve em sete. A observação interna do evento de
   cada ministério da igreja foi apagada por quem organiza outro.

   -------------------------------------------------------------------------
   POR QUE `testar_permissoes()` DIZIA 37/37

   Três coisas somadas, e cada uma sozinha parecia certa.

   1. A POLÍTICA DE UPDATE NÃO TEM ESCOPO.

        cultos_ler    · SELECT · sou_lider() and (evento is null or lidera_equipe(equipe_id))
        cultos_editar · UPDATE · sou_lider()

      A de leitura sabe de quem é o evento. A de escrita não.

   2. `UPDATE` COM CONSTANTE E SEM `where` NÃO PASSA PELA POLÍTICA DE SELECT.

      Quando o comando cita uma coluna (no `where` ou no `set`), o Postgres
      também aplica a política de SELECT, e aí o alcance fica certo por
      acidente. `set obs = null`, sem `where`, não cita coluna nenhuma: sobra
      `sou_lider()`, que é verdadeiro para qualquer líder de qualquer área.

      Medido: `update cultos set obs = case when evento is null then obs else 'X' end`
      toca 3 linhas, e `update cultos set obs = null` toca 7. A diferença é a
      constante.

   3. O GATILHO VIGIA MUDANÇA, E QUEM ATACA ESCOLHE A CONSTANTE QUE NÃO MUDA.

      O ramo UPDATE de `culto_guarda()` protege o culto regular comparando
      `old.obs is distinct from new.obs`. Se a observação já era nula,
      `set obs = null` não muda nada e o guarda não acorda. E para EVENTO de
      outro ministério não havia guarda nenhuma no UPDATE — o DELETE tem a
      linha (`old.evento is not null and not lidera_equipe(old.equipe_id)`),
      o INSERT tem, o UPDATE não tinha.

   -------------------------------------------------------------------------
   O QUE ESTE ARQUIVO MUDA

   a) `cultos_editar` passa a ler o que `cultos_ler` já lia: evento é de
      quem o criou. Sozinha, essa linha já fecha o caso — as outras duas são
      profundidade, e elas importam porque a primeira é só uma política e
      políticas são fáceis de afrouxar sem querer.

   b) O ramo UPDATE do gatilho ganha a mesma linha que o DELETE e o INSERT
      têm, com as mesmas palavras.

   c) O guarda do culto regular deixa de comparar QUATRO COLUNAS e passa a
      comparar a linha inteira (`old is distinct from new`). O comentário da
      56 já dizia "não listo coluna por coluna de propósito [...] a lista
      fechada seria a primeira coisa a ficar para trás" — e listava quatro.
      `ensaio_em` já tinha ficado de fora: `update cultos set ensaio_em =
      '2030-01-01'` passava.

   d) O RECÍPROCO DE `JA_TEM_CULTO`. O ramo do evento recusa criar evento em
      dia que já tem culto regular; não havia o contrário. Criar culto
      regular num dia que já tem evento passava, e o dia ficava com dois —
      que é o culto fantasma da 61 entrando por outra porta, porque
      `idDoCulto` e `salvar_dia` preferem o evento e a escala fica na outra
      linha.

   -------------------------------------------------------------------------
   O QUE ISSO NÃO CONSERTA, E ENTRA NA 70

   `testar_permissoes()` passou 37/37 com este buraco aberto porque ele NÃO
   TEM UM ÚNICO CASO DE ESCRITA: os 37 são `select count(*)`, chamada de
   função ou leitura de `pg_policy`. Medido na mesma auditoria: derrubando
   cada política uma a uma, 31 das 37 não são acusadas; trocando cada uma por
   `using (true)`, 29 das 37 não são acusadas. Isso é assunto da 70, e é
   maior que este arquivo.
   ============================================================================= */


-- =========================================================================
-- a) a política de UPDATE passa a saber de quem é o evento
-- =========================================================================

drop policy if exists cultos_editar on cultos;
create policy cultos_editar on cultos for update to authenticated
  using      (sou_lider() and (evento is null or lidera_equipe(equipe_id)))
  with check (sou_lider() and (evento is null or lidera_equipe(equipe_id)));

comment on table cultos is
  'O dia da igreja. `evento is null` = o culto regular, da igreja inteira, so o organizador geral mexe. `evento is not null` = evento esporadico de UM ministerio (migracao 54). Desde a 69 a politica de UPDATE sabe dessa diferenca, como a de SELECT ja sabia.';


-- =========================================================================
-- b, c, d) o gatilho. Corpo extraído do banco (versão da 56), com as três
-- mudanças marcadas com `69` e nada removido.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.culto_guarda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_tem_culto boolean;
begin
  /* QUEM ESTE GUARDA PEGA (a explicação inteira está na 54).

     `current_setting('role')` e não `current_user`: dentro de uma função
     `security definer`, `current_user` é o DONO da função, nunca quem
     chamou. O GUC `role` é a assinatura do PostgREST, que faz `set role
     authenticated` antes de cada requisição, e volta a `none` no `reset
     role` — então manutenção legítima não é travada. */
  if coalesce(current_setting('role', true), '') <> 'authenticated' then
    return case when TG_OP = 'DELETE' then old else new end;
  end if;

  if TG_OP = 'DELETE' then
    if old.evento is null and not lidera_tudo() then
      raise exception 'CULTO_REGULAR_SO_ORGANIZADOR_GERAL: apagar o culto de % derruba a escala de todos os ministerios.', old.data
        using errcode = 'insufficient_privilege';
    end if;
    if old.evento is not null and not lidera_equipe(old.equipe_id) then
      raise exception 'EVENTO_DE_OUTRO_MINISTERIO: % nao e do seu ministerio.', old.evento
        using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;

  if TG_OP = 'UPDATE' then
    /* ================================================================ 69 ===
       A LINHA QUE O DELETE E O INSERT TÊM E O UPDATE NÃO TINHA.

       Os dois outros ramos recusam mexer em evento de outro ministério com
       esta mesma condição, escrita com estas mesmas palavras. O UPDATE
       vigiava só TRANSIÇÕES (virar evento, deixar de ser, trocar de dono) —
       e mudar o conteúdo de um evento alheio não é transição nenhuma.

       Medido em 21/09/2026: o organizador do Louvor enxergava 3 cultos e
       escrevia em 7, apagando a observação interna dos eventos do Kids, da
       Livraria, da Mídia e do Connect. */
    if old.evento is not null and not lidera_equipe(old.equipe_id) then
      raise exception 'EVENTO_DE_OUTRO_MINISTERIO: % nao e do seu ministerio.', old.evento
        using errcode = 'insufficient_privilege';
    end if;

    /* A TRANSIÇÃO é o que se nega. Virar evento, deixar de ser evento, ou
       trocar de dono: cada uma exige quem de direito. */
    if old.evento is null and new.evento is not null and not lidera_tudo() then
      raise exception 'CULTO_REGULAR_NAO_VIRA_EVENTO: o culto de % e da igreja inteira.', old.data
        using errcode = 'insufficient_privilege';
    end if;
    if old.evento is not null and new.evento is null and not lidera_tudo() then
      raise exception 'EVENTO_NAO_VIRA_CULTO_REGULAR: isso transformaria % num culto da igreja.', old.evento
        using errcode = 'insufficient_privilege';
    end if;
    if old.equipe_id is distinct from new.equipe_id
       and not (lidera_equipe(old.equipe_id) and lidera_equipe(new.equipe_id)) then
      raise exception 'EVENTO_NAO_TROCA_DE_DONO: so quem lidera os dois ministerios.'
        using errcode = 'insufficient_privilege';
    end if;

    /* ================================================================ 56 ===
       E O CONTEÚDO DO CULTO REGULAR TAMBÉM, QUE ERA O BURACO.

       Vigiar só a transição deixava de fora o caso mais simples e mais
       provável: o líder do Louvor mudando a data ou o horário do domingo.
       `escalacoes.culto_id` aponta para esta linha, então isso arrasta a
       escala de todos os ministérios daquele dia.

       Evento continua livre para o dono: `criar_evento`/`apagar_evento` já
       exigem `lidera_equipe`, e a linha acima protege a troca de dono.

       Não listo coluna por coluna de propósito. Coluna nova em `cultos` é
       do domingo da igreja até prova em contrário, e a lista fechada seria
       a primeira coisa a ficar para trás — foi assim que `tipos` deixou 15
       postos sumirem por meses (migração 53). */
    /* 69 · A LISTA FECHADA VIROU A LINHA INTEIRA.

       O comentário acima diz, em 20/09: "Não listo coluna por coluna de
       propósito [...] a lista fechada seria a primeira coisa a ficar para
       trás". E logo abaixo listava quatro colunas. `ensaio_em` já tinha
       ficado de fora: `update cultos set ensaio_em = '2030-01-01'` passava.

       `old is distinct from new` compara a linha toda. Coluna nova em
       `cultos` passa a ser protegida no dia em que nasce, sem ninguém
       lembrar. O `on conflict do update set data = excluded.data` de
       `salvar_dia` continua passando, porque ali nada muda de verdade. */
    if old.evento is null and not lidera_tudo()
       and old is distinct from new then
      raise exception 'CULTO_REGULAR_SO_ORGANIZADOR_GERAL: mudar o culto de % muda a escala de todos os ministerios daquele dia.', old.data
        using errcode = 'insufficient_privilege';
    end if;

    return new;
  end if;

  /* ------------------------------------------------------------ INSERT --- */
  if new.evento is not null then
    if new.equipe_id is null then
      raise exception 'EVENTO_SEM_MINISTERIO: evento e de um ministerio so.'
        using errcode = 'not_null_violation';
    end if;
    if not lidera_equipe(new.equipe_id) then
      raise exception 'EVENTO_DE_OUTRO_MINISTERIO: % nao e do seu ministerio.', new.evento
        using errcode = 'insufficient_privilege';
    end if;
    if new.data < current_date then
      raise exception 'DATA_NO_PASSADO: % ja passou.', new.data
        using errcode = 'check_violation';
    end if;
    /* DIA DE CULTO NÃO RECEBE EVENTO (a 54 explica os dois lados). A regra é
       sobre o CALENDÁRIO e não sobre o que já existe, porque o culto regular
       só nasce quando o líder salva o domingo. */
    if extract(dow from new.data) = 0 then
      raise exception 'DIA_DE_CULTO: % e domingo, e domingo ja tem culto. Evento esporadico e para dia sem culto.', new.data
        using errcode = 'check_violation';
    end if;
    if extract(dow from new.data) = 6 and extract(day from new.data) > 7 then
      raise exception 'DIA_DE_CULTO: % e sabado de Follow. Evento esporadico e para dia sem culto.', new.data
        using errcode = 'check_violation';
    end if;
    select exists (select 1 from cultos c where c.data = new.data and c.evento is null)
      into v_tem_culto;
    if v_tem_culto then
      raise exception 'JA_TEM_CULTO: % ja tem culto marcado.', new.data
        using errcode = 'check_violation';
    end if;

    /* ================================================================ 56 ===
       UM DIA É UM DIA, E ISSO PRECISA SER DITO ANTES DO ÍNDICE.

       O índice único abaixo é quem garante de verdade. Esta checagem existe
       só para a frase: violação de índice chega na tela como
       `23505 duplicate key value violates unique constraint "ux_..."`, que
       não diz a ninguém o que fazer. Aqui a pessoa lê o nome do evento que
       já está lá e entende que precisa escolher outro dia. */
    if exists (select 1 from cultos c
                where c.data = new.data and c.equipe_id = new.equipe_id
                  and c.evento is not null) then
      raise exception 'JA_TEM_EVENTO: % ja tem "%" marcado para este ministerio, e a escala e um dia por data.',
        new.data, (select c.evento from cultos c
                    where c.data = new.data and c.equipe_id = new.equipe_id
                      and c.evento is not null limit 1)
        using errcode = 'unique_violation';
    end if;

  elsif not sou_lider() then
    raise exception 'SEM_PERMISSAO' using errcode = 'insufficient_privilege';

  else
    /* ================================================================ 69 ===
       O RECÍPROCO DE `JA_TEM_CULTO`, QUE FALTAVA.

       O ramo do evento, logo acima, recusa criar evento em dia que já tem
       culto regular. Não havia o contrário: criar CULTO REGULAR num dia que
       já tem evento passava, e o dia ficava com dois.

       É exatamente o culto fantasma que a migração 61 existe para consertar,
       entrando por outra porta: `idDoCulto` (lib/ponte.ts) e `salvar_dia`
       preferem o evento, então a escala fica gravada numa linha e a tela
       aponta para a outra. A 56 já escreveu a regra — "um dia é um dia" — e
       aplicou num sentido só. */
    if exists (select 1 from cultos c where c.data = new.data and c.evento is not null) then
      raise exception 'DIA_TEM_EVENTO: % ja tem "%" marcado. Um dia e um dia: ou o culto da igreja, ou o evento.',
        new.data, (select c.evento from cultos c
                    where c.data = new.data and c.evento is not null
                    order by c.id limit 1)
        using errcode = 'unique_violation';
    end if;
  end if;
  return new;
end $function$;

do $reg$ begin
  if to_regclass('public.schema_sonda') is not null then
    /* A SONDA DA 56 MUDA DE ALVO, E É DE PROPÓSITO.

       Ela procurava `old.data is distinct from new.data`, que era a primeira
       das quatro colunas da lista fechada. A lista virou `old is distinct
       from new` (item c), então o marcador antigo SUMIU de verdade — e a
       proteção que ele vigiava ficou mais forte, não mais fraca. Deixar a
       sonda apontando para o texto velho a faria acusar a correção. Ela
       passa a apontar para a linha inteira, que é o que protege agora.

       SONDA SÓ COM ASCII, E ISSO CUSTOU MEIA HORA HOJE. A primeira versão da
       sonda de baixo procurava uma frase do comentário, com acento, e vinha
       SUMIU num corpo onde a frase está. O motivo: `schema_versao_conferir`
       compara `position(lower(procura) in lower(corpo))`, e neste banco
       `lower()` não dobra `Ê` — sobra `tÊm` dos dois lados, mas os bytes das
       duas cópias não são os mesmos. Comentário não é guarda e acento não é
       marcador: sonda aponta para CÓDIGO, em ASCII. */
    update public.schema_sonda
       set procura = 'old is distinct from new'
     where n = 56 and alvo = 'culto_guarda'
       and procura = 'old.data is distinct from new.data';

    insert into public.schema_sonda (n, caso, alvo, procura) values
      /* presença, não contagem: o mecanismo da sonda é `position`, e não sabe
         contar. Esta pega o caso em que a guarda de evento alheio some dos
         DOIS ramos; a conferência deste arquivo é quem conta os dois e pega
         a remoção de um só. */
      (69, '69 · culto_guarda tem guarda de evento alheio', 'culto_guarda',
           'not lidera_equipe(old.equipe_id)'),
      (69, '69 · culto regular e vigiado pela linha inteira', 'culto_guarda',
           'old is distinct from new'),
      (69, '69 · culto regular nao nasce em dia de evento', 'culto_guarda', 'dia_tem_evento')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;

    delete from public.schema_sonda
     where n = 69 and caso = '69 · culto_guarda recusa UPDATE em evento alheio';
  end if;

  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo)
      values (69, '69-o-organizador-de-uma-area-escrevia-nos-eventos-de-todas.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;


-- =========================================================================
-- A CONFERÊNCIA
--
-- Ela PLANTA um evento de cada ministério, e é isso que a torna capaz de
-- reprovar: a auditoria de hoje mediu que todo caso "NÃO vê o time da Mídia"
-- de `testar_permissoes()` é vácuo porque a Mídia não tem uma única linha no
-- banco nascido do repositório. Caso de isolamento sem o dado do outro é
-- caso que passa sozinho.
-- =========================================================================

do $conf$
declare
  v_ensaio_antes timestamptz;
  v_lv uuid; v_md uuid; v_pessoa uuid; v_ev_lv uuid; v_ev_md uuid; v_reg uuid;
  v_dia_lv date; v_dia_md date; v_dom date;
  v_n int; v_email text := 'conf69@teste.local';
  ok int := 0; falhou int := 0; msg text := '';
begin
  select id into v_lv from equipes where slug = 'louvor';
  select id into v_md from equipes where slug = 'midia';
  if v_lv is null or v_md is null then
    raise notice '69 · PULEI: base sem as equipes de exemplo.'; return;
  end if;
  if exists (select 1 from pessoas where lower(auth_email) = v_email) then
    raise exception 'Ja existe alguem com auth_email % neste banco. Nao escrevi nada.', v_email
      using errcode = 'raise_exception';
  end if;

  /* uma quinta e uma sexta bem à frente: dia sem culto, que é onde evento mora */
  v_dia_lv := (current_date + 60)::date;
  while extract(dow from v_dia_lv) in (0, 6) loop v_dia_lv := v_dia_lv + 1; end loop;
  v_dia_md := v_dia_lv + 1;
  while extract(dow from v_dia_md) in (0, 6) loop v_dia_md := v_dia_md + 1; end loop;

  /* o organizador do LOUVOR, e só dele */
  insert into pessoas (nome, telefone, auth_email)
       values ('Org Conf69', '21' || lpad((floor(random()*900000000)+100000000)::text, 9, '0'), v_email)
    returning id into v_pessoa;
  insert into papeis (pessoa_id, equipe_id, papel) values (v_pessoa, v_lv, 'lider')
    on conflict do nothing;

  insert into cultos (data, evento, equipe_id, obs)
       values (v_dia_lv, 'Conf69 Louvor', v_lv, 'anotacao do louvor') returning id into v_ev_lv;
  insert into cultos (data, evento, equipe_id, obs)
       values (v_dia_md, 'Conf69 Midia',  v_md, 'anotacao da midia')  returning id into v_ev_md;
  select id into v_reg from cultos where evento is null order by data limit 1;
  select data into v_dom from cultos where id = v_reg;

  /* ---- 1. O ATAQUE, E O QUE ELE DEIXA ATRÁS -------------------------
     COBRAR O EFEITO, NÃO O "LEVANTOU".

     A primeira versão deste caso media só se o comando foi recusado, e eu
     descobri sabotando que ele não discriminava: com as quatro guardas deste
     arquivo, TRÊS delas fazem `set obs = null` levantar, então remover
     qualquer uma sozinha ainda dava "levantou" e o caso passava. Caso que
     passa com a proteção removida é decorativo, e este arquivo inteiro
     existe porque `testar_permissoes()` está cheio deles.

     O que a igreja precisa é que a anotação do outro ministério esteja lá
     depois. É isso que se mede. */
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      format('{"email":"%s","role":"authenticated"}', v_email), true);
    update cultos set obs = null;
    reset role;
  exception when others then
    reset role;   -- recusar também serve: o que importa é o estado depois
  end;

  select count(*) into v_n from cultos where id = v_ev_md and obs = 'anotacao da midia';
  if v_n = 1 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x a anotacao interna do evento da Midia foi apagada por quem organiza o Louvor';
  end if;

  /* ---- 2. mirando só o evento alheio, sem a linha do culto regular no
            caminho: aqui a única coisa entre o atacante e o dado são as
            guardas de EVENTO, e o estado depois é o que se cobra ------- */
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      format('{"email":"%s","role":"authenticated"}', v_email), true);
    update cultos set obs = 'invadido' where evento is not null and equipe_id = v_md;
    reset role;
  exception when others then
    reset role;
  end;
  select count(*) into v_n from cultos where id = v_ev_md and obs = 'invadido';
  if v_n = 0 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x escreveu no evento da Midia mirando so nele';
  end if;

  /* ---- 3. AS DUAS CAMADAS EXISTEM, E ESTE CASO É MAIS FRACO QUE OS
            OUTROS — ESTÁ ESCRITO EM VEZ DE FINGIDO.

     A política e o gatilho protegem a MESMA coisa de propósito. Medido: com
     a política aberta, o gatilho recusa; com o gatilho sem a guarda, a
     política devolve zero linha. Nenhum teste de comportamento consegue
     separar os dois, porque enquanto um segura o outro é invisível — é o que
     "profundidade" quer dizer.

     Então este caso lê o CATÁLOGO, e sabe que isso é inspeção de forma e não
     de comportamento. Ele existe para que remover UMA das camadas não passe
     em silêncio; quem remover as duas cai nos casos 1 e 2, que são de
     verdade. */
  select count(*) into v_n from pg_policies
   where tablename = 'cultos' and policyname = 'cultos_editar'
     and coalesce(qual,'') like '%lidera_equipe%';
  if v_n = 1 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x a camada 1 sumiu: cultos_editar voltou a nao olhar de quem e o evento';
  end if;

  /* CONTA CÓDIGO, NÃO COMENTÁRIO. A primeira versão procurava a frase do
     cabeçalho do bloco no `prosrc` — e a sabotagem que apaga o `if` DEIXANDO
     o comentário passou verde. Comentário não é guarda.

     `not lidera_equipe(old.equipe_id)` aparece uma vez no ramo DELETE, que é
     antigo, e uma vez no ramo UPDATE, que é desta migração. Duas é o certo;
     uma quer dizer que o ramo UPDATE voltou a não ter. */
  select (length(prosrc) - length(replace(prosrc, 'not lidera_equipe(old.equipe_id)', '')))
         / length('not lidera_equipe(old.equipe_id)')
    into v_n from pg_proc where proname = 'culto_guarda';
  if v_n = 2 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || format(E'\n  x a camada 2 sumiu: o gatilho tem %s guarda(s) de evento alheio, e sao 2 (DELETE e UPDATE)', v_n);
  end if;

  /* ---- 4. MAS O DONO CONTINUA DONO ------------------------------------
     Guarda que tranca o caminho de quem tem razão é defeito novo. */
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      format('{"email":"%s","role":"authenticated"}', v_email), true);
    update cultos set obs = 'anotacao nova do louvor' where id = v_ev_lv;
    reset role;
    select count(*) into v_n from cultos where id = v_ev_lv and obs = 'anotacao nova do louvor';
    if v_n = 1 then ok := ok + 1;
    else
      falhou := falhou + 1;
      msg := msg || E'\n  x A CORRECAO TRANCOU O DONO: o Louvor nao consegue mais editar o proprio evento';
    end if;
  exception when others then
    reset role; falhou := falhou + 1;
    msg := msg || E'\n  x A CORRECAO TRANCOU O DONO (levantou): ' || sqlerrm;
  end;

  /* 79 · o valor de `ensaio_em` e LIDO antes do ataque, para a limpeza
     poder repor em vez de assumir que era nulo. */
  select ensaio_em into v_ensaio_antes from cultos where id = v_reg;

  /* ---- 5. o culto regular e vigiado pela LINHA INTEIRA ----------------
     `ensaio_em` nao estava na lista de quatro colunas da 56. */
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      format('{"email":"%s","role":"authenticated"}', v_email), true);
    update cultos set ensaio_em = timestamptz '2030-01-01 03:00+00' where id = v_reg;
    reset role;
    select count(*) into v_n from cultos where id = v_reg and ensaio_em is not null;
    if v_n = 0 then ok := ok + 1;
    else
      falhou := falhou + 1;
      msg := msg || E'\n  x coluna fora da lista de quatro ainda passa: ensaio_em foi escrita no culto da igreja';
    end if;
  exception when others then
    reset role; ok := ok + 1;
  end;

  /* ---- 6. o RECIPROCO: culto regular nao nasce em dia de evento ------- */
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      format('{"email":"%s","role":"authenticated"}', v_email), true);
    insert into cultos (data) values (v_dia_md);
    reset role;
    falhou := falhou + 1;
    msg := msg || E'\n  x criou culto regular num dia que ja tem evento: o dia ficou com dois';
  exception when others then
    reset role;
    if sqlerrm like 'DIA_TEM_EVENTO%' then ok := ok + 1;
    else
      falhou := falhou + 1;
      msg := msg || E'\n  x recusou, mas por outro motivo: ' || sqlerrm;
    end if;
  end;

  /* ---- 7. e o lado que a 56 ja fechava continua fechado --------------- */
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      format('{"email":"%s","role":"authenticated"}', v_email), true);
    insert into cultos (data, evento, equipe_id) values (v_dom, 'Conf69 No Domingo', v_lv);
    reset role;
    falhou := falhou + 1;
    msg := msg || E'\n  x evento em dia de culto voltou a passar';
  exception when others then
    reset role; ok := ok + 1;
  end;

  /* ---- limpeza, POR ID ------------------------------------------------ */
  update cultos set obs = 'anotacao do louvor' where id = v_ev_lv;
  delete from culto_obs where culto_id in (v_ev_lv, v_ev_md);
  delete from cultos where id in (v_ev_lv, v_ev_md);
  /* 79 · e este delete POR DATA some. As duas datas sao escolhidas para NAO
     ter culto regular (o laco pula domingo e sabado), mas se tiver, o
     `on delete cascade` leva escalacoes, plantoes e culto_obs de todo mundo
     — e o caso 6 continua verde, porque o gatilho levanta antes do indice.
     Esta conferencia nao cria culto regular em lugar nenhum, entao ela
     tambem nao tem o que apagar aqui. */
  /* 79 · ESTA LINHA ZERAVA UMA COLUNA DE PRODUCAO SEM TER LIDO O VALOR.

     `v_reg` e o culto regular mais ANTIGO do banco — linha real. O caso 5
     roda dentro de `begin ... exception`, que ja e savepoint e ja devolveu
     `ensaio_em` ao valor original; esta linha vinha depois e zerava de novo,
     agora para valer, porque `falhou = 0` e o bloco commita.

     `ensaio_em` guarda quando a banda ensaia PARA aquele culto (17). Nenhuma
     tela escreve nela hoje, entao o dano e improvavel — mas o padrao e o
     mesmo do `culto_obs` da 66: limpeza que ASSUME o estado em vez de
     restaurar o que leu. */
  update cultos set ensaio_em = v_ensaio_antes where id = v_reg;
  delete from papeis where pessoa_id = v_pessoa;
  delete from pessoas where id = v_pessoa;

  if falhou > 0 then
    raise exception 'A CONFERENCIA DA 69 REPROVOU: % de % casos', falhou, ok + falhou
      using detail = msg, errcode = 'raise_exception';
  end if;
  raise notice '69 · conferencia: %/% casos. Evento e de quem o criou em toda operacao, o culto da igreja e vigiado pela linha inteira, e um dia continua sendo um dia nos dois sentidos.', ok, ok;
end $conf$;


/* =============================================================================
   ROLLBACK
     A política: recriar `cultos_editar` com `using (sou_lider())` nos dois
     lados (é a versão da 18). O gatilho: copiar o corpo de `culto_guarda` da
     migração 56 por cima. Os dois defeitos voltam juntos.

   VERIFICAÇÃO DEPOIS DE APLICAR
     select * from testar_permissoes();
     select * from schema_versao_conferir();
   ============================================================================= */
