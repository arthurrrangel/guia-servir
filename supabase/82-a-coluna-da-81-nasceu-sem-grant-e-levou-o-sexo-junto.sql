/* A TRANCA. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(82);
  end if;
end $tranca$;

/* =============================================================================
   82 · A COLUNA DA 81 NASCEU SEM GRANT, E LEVOU O `sexo` JUNTO
   21/09/2026

   -------------------------------------------------------------------------
   O QUE ACONTECE HOJE, MEDIDO

   A migração 81 criou `voluntarios.identidade_reivindicada` e fez
   `revoke update` nela. Não fez `grant select`. E `voluntarios` não tem
   GRANT de SELECT em nível de tabela desde a 52: é coluna a coluna.

       select privilege_type, string_agg(column_name, ', ' order by column_name)
         from information_schema.role_column_grants
        where table_name='voluntarios' and grantee='authenticated'
        group by privilege_type;

       SELECT | ativo, conferido, criado_em, email, equipe_id, id, limite_mes,
                nome, pessoa_id, sexo, telefone, token

   `identidade_reivindicada` não está na lista. E:

       set role authenticated; select identidade_reivindicada from voluntarios limit 1;
       ERROR:  permission denied for table voluntarios

   -------------------------------------------------------------------------
   POR QUE ISSO NÃO CUSTA UMA COLUNA, E SIM DUAS

   `lib/ponte.ts` pede as opcionais numa lista só:

       const COLUNAS_OPCIONAIS = ['sexo', 'identidade_reivindicada', 'pessoas(nome)'];

   e a degradação é TUDO OU NADA: se qualquer uma for recusada, a segunda
   tentativa pede só as essenciais, e `sexo` NÃO é essencial.

   Então uma coluna sem grant desliga a regra do prédio inteira. Medido com
   o GRANT real deste banco e quatro pessoas com sexo F, F, M, M:

       sexo depois de montarEstado ....... todos NULL
       quem entra em BANHEIRO FEMININO ... NINGUÉM     (no banco: 2 pessoas)
       quem entra em GABINETE E BANHEIRO
         MASCULINO ....................... NINGUÉM     (no banco: 2 pessoas)
       e a tela do Time escreve:
         "4 pessoas estão sem informar se é homem ou mulher, e por isso ficam
          de fora dos postos que exigem: Ana, Bia, Caio, Dario"

   Os dois postos existem de verdade: `Connect · BANHEIRO FEMININO · F` e
   `Connect · GABINETE E BANHEIRO MASCULINO · M`. A líder do Connect seria
   cobrada a coletar um dado que as pessoas já deram, e "montar a escala do
   mês" deixaria os dois postos vazios para sempre, com a tela explicando
   pelo motivo errado.

   É o apagão de 18/09 outra vez — o `sexo` nasceu sem grant na 48 e derrubou
   Painel, Escala e Time. A diferença é que agora a rede de degradação
   transforma "tela que morre" em "dado que some calado", que é pior de achar.

   -------------------------------------------------------------------------
   E A 52 JÁ TINHA CONSTRUÍDO A DEFESA. ELA SÓ NÃO ERA UMA REGRA.

   A 52 trocou lista de INCLUSÃO por lista de EXCLUSÃO: o GRANT de SELECT
   passou a ser lido do catálogo, com `pin_hash` de fora. O comentário dela
   diz, com todas as letras, "para que coluna nova nao repita o apagao de
   18/09".

   Funcionou uma vez. Coluna criada DEPOIS da 52 não recebe nada, porque o
   bloco da 52 não roda de novo — e a tranca que esta mesma rodada pôs nela
   (com razão) garante que ele nunca mais rode.

   Esta migração faz duas coisas, e a segunda é a que importa:

     1. reaplica o GRANT lido do catálogo, o que conserta
        `identidade_reivindicada` e qualquer outra coluna nessa situação;

     2. instala `voluntarios_grant_conferir()`, que RESPONDE se alguma coluna
        ficou de fora. A partir daqui, o `banco-do-zero.sh` e o
        `escala-banco.sh` perguntam isso toda vez. Coluna nova sem grant
        deixa de ser um defeito que se descobre pela tela do usuário e passa
        a ser um teste vermelho.
   ============================================================================= */


-- =========================================================================
-- 1 · o GRANT relido do catálogo (a 52, de novo, agora com a coluna da 81)
-- =========================================================================

do $grants$
declare
  v_cols text;
  /* MESMA lista de exclusão da 52, e ela é curta de propósito: `pin_hash` é
     sha256(pin || token), e o token está no GRANT (risco aceito e escrito na
     18, por causa do `montarLinks`). Com o token legível, o hash entrega o
     PIN — que é um segredo que a PESSOA escolheu e provavelmente reusa fora
     daqui. */
  v_fora_do_select constant text[] := array['pin_hash'];
  /* o UPDATE continua MUITO mais estreito, pelos motivos da 52: mudar
     `equipe_id` moveria alguém de ministério por baixo do pano, mudar
     `token` invalidaria o link que já está no WhatsApp da pessoa, mudar
     `pessoa_id` trocaria a identidade.

     `identidade_reivindicada` NÃO entra aqui, e isso é a 81 de pé: quem a
     limpa é `conferir_voluntario`, que é SECURITY DEFINER. Se o organizador
     pudesse escrevê-la direto pelo PostgREST, o botão "Liberar" voltaria a
     valer por "Conferir", que é exatamente o que a 81 fechou. */
  v_pode_escrever constant text[] :=
    array['nome','telefone','ativo','limite_mes','conferido','email','sexo'];
  v_escrever text;
begin
  if to_regclass('public.voluntarios') is null then
    raise notice 'PULEI o GRANT de voluntarios: esta base nao tem public.voluntarios (banco isolado de Demandas).';
    return;
  end if;

  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'voluntarios'
     and column_name <> all (v_fora_do_select);

  select string_agg(quote_ident(c), ', ') into v_escrever
    from unnest(v_pode_escrever) c
   where exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='voluntarios'
                    and column_name = c);

  execute 'revoke select, insert, update on public.voluntarios from authenticated';
  execute format('grant select (%s) on public.voluntarios to authenticated', v_cols);
  execute format('grant update (%s) on public.voluntarios to authenticated', v_escrever);
  execute format('grant insert (%s, equipe_id) on public.voluntarios to authenticated', v_escrever);
  execute 'revoke select, update on public.voluntarios from anon';

  raise notice 'OK — GRANT de voluntarios relido do catalogo: SELECT em %.', v_cols;
end $grants$;

do $c$ begin
  if to_regclass('public.voluntarios') is null then return; end if;
  execute $x$comment on column voluntarios.identidade_reivindicada is
  'O vinculo nasceu colado numa identidade que ja existia, e quem digitou foi um anonimo (81). Enquanto for verdadeira, equipe_pin_criar recusa. Quem limpa e conferir_voluntario, que e SECURITY DEFINER: por isso a coluna esta no GRANT de SELECT e FORA do de UPDATE. Nasceu na 81 sem grant nenhum, e isso desligou a regra do predio inteira ate a 82.'$x$;
end $c$;


-- =========================================================================
-- 2 · A SONDA. É ela que faz disto uma regra, e não um conserto.
--
-- A 52 escreveu "para que coluna nova nao repita o apagao de 18/09" e
-- construiu o mecanismo certo — mas um `do $$` que roda uma vez não é uma
-- regra, é um evento. A prova: a 81 criou coluna quatro dias depois e o
-- apagão voltou, com a mesma forma.
--
-- Uma regra é algo que RESPONDE toda vez que perguntam. Esta função é a
-- pergunta, e `banco-do-zero.sh` e `escala-banco.sh` passam a fazê-la.
-- =========================================================================

create or replace function public.voluntarios_grant_conferir()
returns table (coluna text, problema text)
language sql security invoker set search_path = public, information_schema as $fn$
  with esperado as (
    select c.column_name::text as col
      from information_schema.columns c
     where c.table_schema = 'public' and c.table_name = 'voluntarios'
       and c.column_name <> 'pin_hash'
  ),
  tem as (
    select g.column_name::text as col
      from information_schema.role_column_grants g
     where g.table_schema = 'public' and g.table_name = 'voluntarios'
       and g.grantee = 'authenticated' and g.privilege_type = 'SELECT'
  )
  /* coluna que devia ser legível e não é: é o defeito da 48 e o da 81 */
  select e.col, 'sem GRANT de SELECT para authenticated'
    from esperado e where e.col not in (select col from tem)
  union all
  /* e o contrário, que é pior: `pin_hash` legível entrega o PIN de todo
     mundo, porque o `token` está no mesmo GRANT */
  select t.col, 'LEGIVEL e nao devia ser (pin_hash entrega o PIN, com o token no mesmo GRANT)'
    from tem t where t.col = 'pin_hash'
  order by 1;
$fn$;

revoke all on function public.voluntarios_grant_conferir() from public, anon;
grant execute on function public.voluntarios_grant_conferir() to authenticated;

comment on function public.voluntarios_grant_conferir() is
  'Devolve as colunas de voluntarios cujo GRANT de SELECT para authenticated esta errado: faltando (o apagao de 18/09 e o da 81) ou sobrando (pin_hash). Vazio = certo. Chamada por banco-do-zero.sh e escala-banco.sh.';


-- =========================================================================
-- 3 · a régua
-- =========================================================================
insert into schema_versao (n, arquivo)
     values (82, '82-a-coluna-da-81-nasceu-sem-grant-e-levou-o-sexo-junto.sql')
on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();


-- =========================================================================
-- CONFERÊNCIA
-- =========================================================================
do $conf$
declare
  v_erros text := ''; v_n int; v_casos int := 0; v_col text;
begin
  /* 1 · a coluna da 81 passou a ser legível */
  if not exists (select 1 from information_schema.role_column_grants
                  where table_schema='public' and table_name='voluntarios'
                    and grantee='authenticated' and privilege_type='SELECT'
                    and column_name='identidade_reivindicada') then
    v_erros := v_erros || '1) identidade_reivindicada continua sem SELECT; ';
  end if;
  v_casos := v_casos + 1;

  /* 2 · e o `sexo` também, que era o dano colateral */
  if not exists (select 1 from information_schema.role_column_grants
                  where table_schema='public' and table_name='voluntarios'
                    and grantee='authenticated' and privilege_type='SELECT'
                    and column_name='sexo') then
    v_erros := v_erros || '2) sexo sem SELECT: a regra do predio esta desligada; ';
  end if;
  v_casos := v_casos + 1;

  /* 3 · `pin_hash` continua FORA. Sem este caso, um `grant select` na tabela
         inteira "consertaria" os casos 1 e 2 e entregaria o PIN de todo
         mundo junto. */
  if exists (select 1 from information_schema.role_column_grants
              where table_schema='public' and table_name='voluntarios'
                and grantee='authenticated' and privilege_type='SELECT'
                and column_name='pin_hash') then
    v_erros := v_erros || '3) pin_hash ficou legivel: com o token no mesmo GRANT, isso entrega o PIN de todo mundo; ';
  end if;
  v_casos := v_casos + 1;

  /* 4 · `identidade_reivindicada` continua FORA do UPDATE. Se entrasse, o
         organizador escreveria `false` direto pelo PostgREST e o botao
         "Liberar" voltaria a valer por "Conferir" — a 81 desfeita. */
  if exists (select 1 from information_schema.role_column_grants
              where table_schema='public' and table_name='voluntarios'
                and grantee='authenticated' and privilege_type='UPDATE'
                and column_name='identidade_reivindicada') then
    v_erros := v_erros || '4) identidade_reivindicada virou escrivel: "Liberar" volta a valer por "Conferir"; ';
  end if;
  v_casos := v_casos + 1;

  /* 5 · a sonda existe e concorda: zero problemas agora */
  select count(*) into v_n from voluntarios_grant_conferir();
  if v_n <> 0 then
    select string_agg(coluna || ' (' || problema || ')', '; ') into v_col from voluntarios_grant_conferir();
    v_erros := v_erros || format('5) a sonda achou %s problema(s): %s; ', v_n, v_col);
  end if;
  v_casos := v_casos + 1;

  /* 6 · CONTROLE NEGATIVO. A sonda tem que ser capaz de ACUSAR.

     Sem este caso, um erro na consulta dela (um `join` que não casa, um
     nome de schema errado) faria o caso 5 ficar verde para sempre sem olhar
     para nada — que é exatamente como a defesa da 52 morreu: ninguém nunca
     perguntou se ela ainda estava de pé.

     Tira o grant de UMA coluna, exige que a sonda a nomeie, e devolve. */
  declare v_achou int;
  begin
    execute 'revoke select (sexo) on public.voluntarios from authenticated';
    select count(*) into v_achou from voluntarios_grant_conferir() where coluna = 'sexo';
    execute 'grant select (sexo) on public.voluntarios to authenticated';
    if v_achou <> 1 then
      v_erros := v_erros || '6) CONTROLE NEGATIVO FALHOU: tirei o SELECT de `sexo` e a sonda nao viu; ';
    end if;
    /* e o banco volta ao lugar */
    select count(*) into v_n from voluntarios_grant_conferir();
    if v_n <> 0 then
      v_erros := v_erros || format('6b) o controle negativo nao devolveu o grant: %s problema(s); ', v_n);
    end if;
  exception when others then
    execute 'grant select (sexo) on public.voluntarios to authenticated';
    v_erros := v_erros || format('6) o controle negativo quebrou: %s; ', sqlerrm);
  end;
  v_casos := v_casos + 2;

  if v_erros = '' then
    raise notice 'OK — %/% casos: o GRANT de voluntarios foi relido do catalogo, identidade_reivindicada e sexo estao legiveis, pin_hash nao esta, identidade_reivindicada nao e escrivel pelo PostgREST, e a sonda voluntarios_grant_conferir() acusa quando tiram um grant (controle negativo medido).', v_casos, v_casos;
  else
    raise exception 'FALHOU (% casos) — %', v_casos, v_erros;
  end if;
end $conf$;
