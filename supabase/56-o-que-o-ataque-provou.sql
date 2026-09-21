/* =============================================================================
   56 · O QUE O ATAQUE PROVOU, E A LEITURA NÃO TINHA ACHADO

   19/09/2026. Três equipes de agentes varreram arquitetura, desempenho e QA.
   O que entra aqui é só a parte que eu REPRODUZI num Postgres vivo, como
   `authenticated`, com o ataque escrito e a resposta do banco colada. O resto
   do que foi relatado está no rodapé, separado em duas listas: o que virou
   correção em outro arquivo, e o que eu investiguei e DESCARTEI — inclusive
   um achado classificado como "quebra agora" que, medido, estava errado.

   AS TRÊS COISAS QUE O BANCO DEIXAVA PASSAR

   1. O LÍDER DE UM MINISTÉRIO MUDAVA O CULTO DA IGREJA INTEIRA.

      A política `cultos_editar` pede `sou_lider()`, que é verdadeiro para
      qualquer líder de qualquer ministério. O `culto_guarda` da 54 é
      cuidadoso, mas só vigia a TRANSIÇÃO: virar evento, deixar de ser
      evento, trocar de dono. Mudar `data`, `inicio`, `fim` ou `obs` de um
      culto REGULAR não era transição nenhuma, então passava.

      Medido, com um líder preso ao Louvor:

          select sou_lider(), lidera_tudo();     ->  true, false
          update cultos set data='2026-11-08'
           where data='2026-11-01' and evento is null;
                                                 ->  UPDATE 1
          update cultos set inicio='05:00' where evento is null;
                                                 ->  UPDATE 1

      O estrago não é o campo: é que `escalacoes.culto_id` aponta para essa
      linha. Mudar a data do domingo arrasta a escala de TODOS os ministérios
      daquele dia junto, e o Louvor nem fica sabendo que mexeu na Mídia.

      A 18 já tinha decidido isso para o APAGAR ("apagar um domingo derruba a
      escala de todos"). Editar derruba do mesmo jeito, e ficou de fora.

   2. DOIS EVENTOS NO MESMO DIA SUMIAM UM DENTRO DO OUTRO, CALADOS.

      `ux_cultos_evento` era `(data, equipe_id, evento)`. O nome entrava na
      chave, então dois eventos de nomes DIFERENTES, mesmo dia, mesmo
      ministério, eram duas linhas perfeitamente válidas para o banco.

          criar_evento(louvor, '2026-10-15', 'GUIA Empreendedor', '19:30') -> ok
          criar_evento(louvor, '2026-10-15', 'Ensaio da Cantata',  '15:00') -> ok
          select count(*) from cultos
           where data='2026-10-15' and evento is not null;   ->  2

      Só que `S.escalas` é UM DIA POR DATA. `montarEstado` percorre os cultos
      e faz `d.evento = c.evento`: o segundo sobrescreve o primeiro, e leva
      junto quem já estava escalado nele. O líder cadastra dois eventos numa
      quinta, vê um, e a tela diz `situacao: "ok"`, `vagas: []`.

      É exatamente a classe de defeito que a 53 fechou para os postos ("some
      CALADO"), reaberta pela 54 num canto diferente. Por isso a regra passa
      a ser a do modelo de dados, dita em voz alta: um dia é um dia.

   3. O ARQUIVO ANTIGO AINDA PODIA DESFAZER A CORREÇÃO NOVA.

      A 55 escreveu `exige_versao_ate()`, que é a tranca certa, e não a
      instalou em arquivo nenhum. Cobertura: 0 de 20. Medido reaplicando a 23
      num banco na versão 55:

          candidatar() antes:  contém a guarda 'pessoa_nova' da 51?  true
          psql -f supabase/23-candidatura-funcoes.sql   (sem um erro)
          candidatar() depois: contém a guarda 'pessoa_nova' da 51?  false
          schema_versao: max(n) = 55   (a régua não registrou nada)

      A correção de segurança da 51 foi desfeita em silêncio, e a régua
      continuou afirmando 55. Este arquivo instala a tranca nos 20 arquivos
      que podem reverter alguém — a lista foi COMPUTADA, não escolhida:
      cruzei `create or replace function` de todos os arquivos e marquei todo
      arquivo que define uma função que um arquivo MAIS NOVO redefine.

   ORDEM:  ... 54 → 55 → 56
   ============================================================================= */

/* 56 E NÃO 55, E A DIFERENÇA IMPORTA.

   `exige_versao_ate(n)` aborta quando o banco passou de n. Com 55 aqui, este
   arquivo se recusaria A SI MESMO depois de aplicado — e isso é uma armadilha
   real, não teórica: a seção 5 registra a 56 na régua ANTES da conferência
   rodar. Se a conferência reprovasse, a régua já diria 56, e a tentativa de
   rodar o arquivo de novo (depois de corrigir) seria recusada.

   Com 56, este arquivo aceita rodar num banco que está em 56 (ele mesmo) e
   recusa num banco em 57 ou mais, que é exatamente a regra. */
select public.exige_versao_ate(56);


-- =========================================================================
-- 1 · o culto da igreja para de ser editável por líder de área
--
-- Corpo copiado do que a 54 pôs no ar, com UM ramo a mais e só um. A lição
-- da 54 vale de novo: quando a correção é pequena, o arquivo copia o resto,
-- porque reescrever é como eu quase apaguei `salvar_dia` naquele dia.
-- =========================================================================

create or replace function public.culto_guarda()
returns trigger language plpgsql security definer set search_path = public as $fn$
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
    if old.evento is null and not lidera_tudo()
       and (old.data     is distinct from new.data
         or old.inicio   is distinct from new.inicio
         or old.fim      is distinct from new.fim
         or old.obs      is distinct from new.obs) then
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
  end if;
  return new;
end $fn$;

drop trigger if exists tg_culto_guarda on cultos;
create trigger tg_culto_guarda
  before insert or update or delete on cultos
  for each row execute function public.culto_guarda();


-- =========================================================================
-- 2 · e a unicidade para de contar o nome
--
-- Trocar um índice único é a operação que quase quebrou a 54 (tirar
-- `cultos_data_key` tirou o alvo do `on conflict (data)` de `salvar_dia`).
-- Aqui é seguro e a conferência no fim PROVA que é: nenhum `on conflict`
-- aponta para `ux_cultos_evento`, que nasceu na 54 e nunca foi alvo de nada.
-- =========================================================================

/* se já houver duplicata no banco, o índice não nasce — e é melhor o arquivo
   parar aqui, dizendo qual é, do que criar o índice sem a garantia */
do $dup$
declare v text;
begin
  select string_agg(format('%s (%s eventos)', data, n), ', ')
    into v
    from (select data, count(*) n from cultos
           where evento is not null group by data, equipe_id having count(*) > 1) x;
  if v is not null then
    raise exception E'EVENTOS_DUPLICADOS: ha mais de um evento no mesmo dia para o mesmo ministerio: %.\n'
      '  Apague o que sobra antes de aplicar este arquivo: a escala e um dia por data,\n'
      '  entao hoje um deles esta invisivel na tela junto com quem foi escalado nele.', v;
  end if;
end $dup$;

drop index if exists ux_cultos_evento;
create unique index if not exists ux_cultos_evento
  on cultos (data, equipe_id) where evento is not null;

comment on index ux_cultos_evento is
  'Um evento por dia por ministerio. O NOME saiu da chave na 56: com ele dentro, dois eventos de nomes diferentes no mesmo dia eram duas linhas validas, e como S.escalas e um dia por data o segundo engolia o primeiro em silencio, junto com quem ja estava escalado nele.';


-- =========================================================================
-- 2b · E `criar_evento` PERDEU O ALVO DO `on conflict`. DE NOVO.
--
-- Isto é a segunda vez, no mesmo projeto, em dois dias. A 54 tirou
-- `cultos_data_key` e derrubou o `on conflict (data)` de `salvar_dia`; eu
-- escrevi lá, em letras grandes, que "mexer em unicidade é mexer em todo
-- `on conflict` que aponta para ela" — e então troquei outro índice sem
-- olhar quem apontava para ele.
--
--     ERROR: there is no unique or exclusion constraint matching
--            the ON CONFLICT specification
--
-- A regra não foi esquecida por falta de aviso. Foi esquecida porque a
-- CONFERÊNCIA desta própria migração escondeu o erro: o caso que criava o
-- evento tinha um `when others then ok := ok + 1` com um comentário
-- explicando que qualquer recusa serviria. Um teste que aceita qualquer
-- resposta não é um teste — é a mesma armadilha que a equipe de QA
-- encontrou nos testes de JavaScript, escrita por mim, no mesmo dia em que
-- eu li o relatório dela. O caso 4 abaixo passou a EXIGIR `ok = true`.
--
-- E a semântica muda junto: com o nome fora da chave, `do update` renomearia
-- o evento que já está lá, que é pior do que recusar. A porta passa a dizer
-- `JA_TEM_EVENTO` com o nome do que ocupa o dia, para a pessoa saber o que
-- apagar ou que dia escolher.
-- =========================================================================

create or replace function public.criar_evento(
  p_equipe uuid, p_data date, p_nome text, p_inicio time default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_nome text := btrim(coalesce(p_nome, '')); v_ocupa text;
begin
  if not lidera_equipe(p_equipe) then
    return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO');
  end if;
  if p_data is null then
    return jsonb_build_object('ok', false, 'erro', 'FALTA_DATA');
  end if;
  if length(v_nome) < 2 then
    return jsonb_build_object('ok', false, 'erro', 'FALTA_NOME');
  end if;
  if p_data < current_date then
    return jsonb_build_object('ok', false, 'erro', 'DATA_NO_PASSADO');
  end if;

  /* O LIMITE DO MODELO, DITO EM VOZ ALTA (a 54 explica inteiro): a escala é
     UM DIA POR DATA. Evento em dia de culto precisaria de dois conjuntos de
     postos na mesma data, e o modelo não sabe dizer isso. */
  if extract(dow from p_data) = 0
     or (extract(dow from p_data) = 6 and extract(day from p_data) > 7) then
    return jsonb_build_object('ok', false, 'erro', 'DIA_DE_CULTO');
  end if;
  if exists (select 1 from cultos c where c.data = p_data and c.evento is null) then
    return jsonb_build_object('ok', false, 'erro', 'JA_TEM_CULTO');
  end if;

  /* e o mesmo limite vale entre dois EVENTOS, que era o buraco da 54 */
  select c.evento into v_ocupa from cultos c
   where c.data = p_data and c.equipe_id = p_equipe and c.evento is not null limit 1;
  if v_ocupa is not null then
    return jsonb_build_object('ok', false, 'erro', 'JA_TEM_EVENTO', 'ocupa', v_ocupa);
  end if;

  insert into cultos (data, evento, equipe_id, inicio)
       values (p_data, v_nome, p_equipe, p_inicio)
    returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'data', p_data, 'nome', v_nome);
exception
  /* a checagem acima resolve o caso normal; esta pega a CORRIDA, dois
     organizadores da mesma área cadastrando no mesmo segundo */
  when unique_violation then
    return jsonb_build_object('ok', false, 'erro', 'JA_TEM_EVENTO',
      'ocupa', (select c.evento from cultos c
                 where c.data = p_data and c.equipe_id = p_equipe
                   and c.evento is not null limit 1));
  when check_violation then
    return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
end $fn$;

comment on function public.criar_evento(uuid, date, text, time) is
  'Cadastra um evento esporadico. Desde a 56 RECUSA o segundo evento do mesmo dia no mesmo ministerio (JA_TEM_EVENTO, com o nome de quem ocupa) em vez de fazer upsert: a chave unica perdeu a coluna evento, e do update renomearia o evento que ja estava la.';


-- =========================================================================
-- 4 · a régua deixa de ser promessa e passa a ser conferível
--
-- `schema_versao` NASCEU declarando 1..55 sem conferir nada. Na trilha que
-- existe de verdade (aplicar em ordem) isso é verdade; num banco em que
-- alguém pulou um arquivo, vira mentira, e mentira de régua é pior que régua
-- nenhuma, porque a tranca do item 5 confia nela.
--
-- A saída não é declarar melhor: é poder CONFERIR. Esta função procura, no
-- catálogo, a assinatura de cada correção que importa, e compara com o que a
-- régua afirma. Não cobre as 56 — cobre as que doem, que são as que um
-- arquivo antigo consegue desfazer.
-- =========================================================================

/* A SONDA MORA NUMA TABELA, E NÃO NO CORPO DA FUNÇÃO.

   A primeira versão desta função tinha as nove sondas escritas por dentro,
   uma a uma. Isso quebrou no minuto seguinte: a correção de `dem_lista` foi
   para a 57 (um arquivo, um sistema), e a sonda dela teria que ser
   acrescentada AQUI — ou seja, um arquivo de Demandas reescrevendo uma função
   de Escalas para acrescentar uma linha. Isso é como a 50 e a 52 viraram
   arquivos que mexem nos dois sistemas.

   Com a tabela, cada migração registra a SUA sonda e esta função só percorre
   o que houver. Acrescentar uma verificação passa a ser um `insert`. */
create table if not exists schema_sonda (
  n        int  not null,
  caso     text not null,
  alvo     text not null,     -- nome da função em `public`
  procura  text not null,     -- trecho que TEM que estar no corpo dela
  primary key (n, caso)
);
revoke all on schema_sonda from public, anon, authenticated;
alter table schema_sonda enable row level security;

comment on table schema_sonda is
  'O que cada migracao deixou no banco, em forma de trecho procuravel no corpo de uma funcao. `schema_versao_conferir()` percorre esta tabela. Serve para responder "que versao esta no ar?" olhando o CATALOGO em vez de acreditar no que schema_versao declara.';

insert into schema_sonda (n, caso, alvo, procura) values
  (51, '51 · candidatar guarda a identidade preexistente', 'candidatar',   'pessoa_nova'),
  (55, '55 · inscrever só entrega token para identidade nova', 'inscrever', 'v_pessoa_nova'),
  (54, '54 · salvar_dia separa evento de culto regular', 'salvar_dia',     'evento is null'),
  (56, '56 · culto_guarda protege data/horário do culto regular', 'culto_guarda',
       'old.data is distinct from new.data'),
  (52, '52 · dem_mover trava a linha antes de decidir', 'dem_mover',       'for update')
on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;

create or replace function public.schema_versao_conferir()
returns table(caso text, esperado text, obtido text, passou boolean)
language plpgsql security definer set search_path = public as $fn$
declare
  v_regua int;
  r record;
  /* corpo da função, em minúsculas e com o espaço em branco NORMALIZADO.

     O espaço normalizado não é capricho: a primeira versão procurava
     `old.data is distinct from new.data` e não achava, porque no arquivo a
     linha está alinhada com a de baixo e tem cinco espaços no meio de
     `old.data     is distinct`. A sonda reprovou código correto e me mandou
     procurar defeito onde não havia. Sonda que quebra com indentação é sonda
     que ensina a ignorar a sonda. */
  v_corpo text;
begin
  select max(n) into v_regua from schema_versao;

  caso := 'a régua diz alguma coisa'; esperado := 'não nula';
  obtido := coalesce(v_regua::text, 'null'); passou := v_regua is not null; return next;

  for r in select * from schema_sonda order by n, caso loop
    select coalesce(lower(regexp_replace(prosrc, '\s+', ' ', 'g')), '') into v_corpo
      from pg_proc where proname = r.alvo and pronamespace = 'public'::regnamespace limit 1;
    caso := r.caso;
    esperado := format('%s no corpo de %s()', r.procura, r.alvo);
    if v_corpo is null or v_corpo = '' then
      obtido := format('%s() não existe', r.alvo); passou := false;
    elsif position(lower(r.procura) in v_corpo) > 0 then
      obtido := 'está lá'; passou := true;
    else
      obtido := 'SUMIU'; passou := false;
    end if;
    return next;
  end loop;

  /* estas duas não são sobre corpo de função, então ficam escritas aqui */
  caso := '53 · funcoes.tipos só aceita palavra conhecida';
  esperado := 'funcoes_tipos_conhecidos_ck existe';
  passou := exists (select 1 from pg_constraint where conname = 'funcoes_tipos_conhecidos_ck');
  obtido := case when passou then 'está lá' else 'SUMIU' end;
  return next;

  caso := '56 · um evento por dia por ministério';
  esperado := 'ux_cultos_evento sem a coluna evento';
  obtido := coalesce((select case when pg_get_indexdef(i.indexrelid) like '%evento)%'
                                  then 'AINDA CONTA O NOME' else 'certo' end
                        from pg_index i join pg_class c on c.oid = i.indexrelid
                       where c.relname = 'ux_cultos_evento'), 'índice não existe');
  passou := obtido = 'certo'; return next;
end $fn$;

revoke all on function public.schema_versao_conferir() from public, anon, authenticated;

comment on function public.schema_versao_conferir() is
  'Confere a regua contra o CATALOGO: para cada correcao que um arquivo antigo consegue desfazer, procura a assinatura dela no corpo da funcao. Serve para responder "que versao esta no ar?" sem confiar no que schema_versao declara. Rode: select * from schema_versao_conferir() where not passou;';


-- =========================================================================
-- 5 · esta migração se registra
--
-- Daqui para frente todo arquivo novo termina com a sua linha. A régua deixa
-- de depender de um `generate_series` escrito uma vez.
-- =========================================================================

insert into schema_versao (n, arquivo) values (56, '56-o-que-o-ataque-provou.sql')
on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();


-- =========================================================================
-- 6 · A CONFERÊNCIA
--
-- Roda os ataques de verdade, como `authenticated`, e ABORTA se algum passar.
-- Não é teste em arquivo separado: é a última seção da migração, porque
-- migração que não prova o que promete é migração que promete.
-- =========================================================================

do $conf$
declare
  v_eq uuid; v_eq2 uuid; v_p uuid; v_culto uuid;
  ok int := 0; falhou int := 0; v_regua_ruim int := 0; msg text := '';
  v_culto_meu boolean := false; v_data_teste date; v_i int;
  procedure_ret record;
begin
  -- ---------------------------------------------------------------- cenário
  insert into equipes (slug, nome) values ('conf56a','Conferencia 56 A')
    on conflict (slug) do nothing;
  insert into equipes (slug, nome) values ('conf56b','Conferencia 56 B')
    on conflict (slug) do nothing;
  select id into v_eq  from equipes where slug = 'conf56a';
  select id into v_eq2 from equipes where slug = 'conf56b';

  insert into pessoas (nome, telefone, email, auth_email)
       values ('Lider Conf 56','11900000056','conf56@teste.local','conf56@teste.local')
    on conflict (telefone) do update set auth_email = 'conf56@teste.local'
    returning id into v_p;
  if v_p is null then select id into v_p from pessoas where telefone = '11900000056'; end if;
  insert into papeis (pessoa_id, equipe_id, papel) values (v_p, v_eq, 'lider')
    on conflict do nothing;

  /* UM DOMINGO DE TESTE QUE SÓ EXISTE SE EU O CRIAR, E QUE SOME NO FIM.

     A primeira versão fazia `insert ... on conflict do nothing` e depois lia
     o id de volta. Duas consequências que só apareceram quando eu simulei a
     aplicação num banco com dados:

       · num banco onde JÁ EXISTE culto naquela data, o `on conflict` não
         cria nada e `v_culto` passa a apontar para o CULTO DE VERDADE. O
         caso 3 então gravava `inicio = '18:00'` nele: uma migração mudando
         o horário de um domingo real da igreja;

       · num banco onde não existe, a linha ficava para trás. A limpeza
         apagava `cultos where equipe_id in (...)`, e culto regular tem
         `equipe_id` NULO, então ela não alcançava. Medido: depois de aplicar
         as 57 num banco do zero, sobrava um `2026-11-01` órfão.

     Migração que deixa linha ou mexe em dado real não é conferência, é
     efeito colateral. O `returning` diz se a linha é MINHA; se não for, o
     teste procura outra data em vez de encostar no que é da igreja. */
  /* ==================================================== 82 ================
     A BUSCA PULAVA DE DOMINGO EM DOMINGO, E POR ISSO TINHA COMO ACABAR.

     Era `date_trunc('week', current_date + 40 + v_i * 7)::date + 6`, treze
     vezes: treze DOMINGOS, de hoje+40 a hoje+131. Num banco com o calendário
     montado à frente, os treze têm culto, e a migração se recusa a aplicar.

     MEDIDO em 21/09, com os domingos dos próximos 200 dias plantados:

       ERROR: A CONFERENCIA DA 56 NAO ACHOU DATA LIVRE: os 13 domingos a
              partir de 2026-11-01 ja tem culto.

     Recusar era CERTO — a alternativa é mexer num domingo de verdade, que é
     o defeito que este mesmo bloco existe para não repetir. Errada era a
     busca: os dois ataques deste bloco são "líder de área mudou a DATA do
     culto da igreja" e "mudou o HORÁRIO". Nenhum dos dois depende do dia da
     semana. A escolha de domingo era estética, e custava a aplicação.

     Agora anda DIA A DIA. `ux_cultos_data_regular` é um culto regular por
     data, em qualquer dia da semana, então qualquer dia livre serve — e num
     ano inteiro a partir de hoje+40 não existe calendário de igreja que não
     tenha um. Se um dia não tiver, a recusa continua de pé, e a mensagem diz
     quantos dias foram olhados. */
  v_culto := null;
  for v_i in 0..364 loop
    v_data_teste := (current_date + 40 + v_i)::date;
    if not exists (select 1 from cultos c where c.data = v_data_teste) then
      insert into cultos (data) values (v_data_teste) returning id into v_culto;
      v_culto_meu := true;
      exit;
    end if;
  end loop;
  if v_culto is null then
    raise exception 'A CONFERENCIA DA 56 NAO ACHOU DATA LIVRE: os 365 dias a partir de % ja tem culto. Nao vou mexer num culto de verdade para testar.', (current_date + 40)::date;
  end if;

  -- ------------------------------------------------- 1. o ataque da data
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf56@teste.local"}', true);
    update cultos set data = data + 7 where id = v_culto;
    reset role;
    falhou := falhou + 1;
    msg := msg || E'\n  ✗ lider de area MUDOU a data do culto da igreja';
  exception when insufficient_privilege then
    reset role; ok := ok + 1;
  end;

  -- ------------------------------------------------- 2. o ataque do horário
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf56@teste.local"}', true);
    update cultos set inicio = '05:00' where id = v_culto;
    reset role;
    falhou := falhou + 1;
    msg := msg || E'\n  ✗ lider de area MUDOU o horario do culto da igreja';
  exception when insufficient_privilege then
    reset role; ok := ok + 1;
  end;

  -- ------------------------------ 3. e o dono de tudo continua conseguindo
  begin
    update cultos set inicio = '18:00' where id = v_culto;   -- sem role: manutenção
    ok := ok + 1;
  exception when others then
    falhou := falhou + 1;
    msg := msg || E'\n  ✗ a manutencao (sem role) foi travada pelo guarda: ' || sqlerrm;
  end;

  -- -------------------------------- 4. O EVENTO LEGÍTIMO PRECISA ENTRAR
  --
  -- Este caso EXIGE `ok = true`. A primeira versão tinha
  -- `when others then ok := ok + 1` com um comentário dizendo que qualquer
  -- recusa serviria, e foi exatamente isso que escondeu, por uma rodada
  -- inteira, que eu tinha derrubado o `on conflict` de `criar_evento` ao
  -- trocar o índice único. Teste que aceita qualquer resposta compra
  -- confiança sem entregar nada.
  --
  -- A data é calculada para cair numa QUINTA (dow 4), que não é dia de culto
  -- em nenhum calendário, então "recusou por causa do dia" deixa de ser uma
  -- desculpa possível.
  declare v_quinta date := current_date + 7 +
    ((4 - extract(dow from current_date + 7)::int + 7) % 7);
          v_r jsonb;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf56@teste.local"}', true);
    v_r := criar_evento(v_eq, v_quinta, 'Conf 56 Primeiro', '19:00');
    reset role;
    if coalesce((v_r->>'ok')::boolean, false) then
      ok := ok + 1;
    else
      falhou := falhou + 1;
      msg := msg || E'\n  ✗ criar_evento RECUSOU um evento legitimo numa quinta ('
             || v_quinta || '): ' || coalesce(v_r->>'erro', v_r::text);
    end if;

    -- ------------------------ 5. e o SEGUNDO do mesmo dia precisa ser negado
    if coalesce((v_r->>'ok')::boolean, false) then
      set local role authenticated;
      perform set_config('request.jwt.claims', '{"email":"conf56@teste.local"}', true);
      v_r := criar_evento(v_eq, v_quinta, 'Conf 56 Segundo', '15:00');
      reset role;
      if v_r->>'erro' = 'JA_TEM_EVENTO' then
        ok := ok + 1;
      else
        falhou := falhou + 1;
        msg := msg || E'\n  ✗ o SEGUNDO evento do mesmo dia nao foi negado com JA_TEM_EVENTO: '
               || v_r::text || ' (ele some da tela junto com quem foi escalado nele)';
      end if;

      -- ---- 5b. e o insert direto também, porque a porta não é a única via
      begin
        set local role authenticated;
        perform set_config('request.jwt.claims', '{"email":"conf56@teste.local"}', true);
        insert into cultos (data, evento, equipe_id)
             values (v_quinta, 'Conf 56 Terceiro', v_eq);
        reset role;
        falhou := falhou + 1;
        msg := msg || E'\n  ✗ insert direto de um segundo evento no mesmo dia PASSOU';
      exception when unique_violation then
        reset role; ok := ok + 1;
      end;
    else
      falhou := falhou + 1;
      msg := msg || E'\n  ✗ sem o primeiro evento, os casos 5 e 5b nao puderam rodar';
    end if;
  end;

  -- ------------------------------- 6. a régua se confere contra o catálogo
  /* variável PRÓPRIA. A primeira versão fazia `into falhou` aqui e apagava a
     contagem dos cinco casos anteriores: a conferência passou a relatar só o
     que esta seção achou, e eu quase fui procurar defeito nos ataques. */
  select count(*) into v_regua_ruim from schema_versao_conferir() where not passou;
  if v_regua_ruim > 0 then
    falhou := falhou + v_regua_ruim;
    for procedure_ret in select * from schema_versao_conferir() where not passou loop
      msg := msg || E'\n  ✗ régua: ' || procedure_ret.caso ||
             ' (esperado ' || procedure_ret.esperado || ', obtido ' || procedure_ret.obtido || ')';
    end loop;
  else
    ok := ok + 1;
  end if;

  -- ------------------------------------------------------------- limpeza
  /* o culto de teste só é apagado se ele for MEU (ver o bloco do cenário).
     `v_culto_meu` é a diferença entre limpar o que eu sujei e apagar um
     domingo da igreja. */
  delete from cultos where equipe_id in (v_eq, v_eq2);
  if v_culto_meu and v_culto is not null then
    delete from escalacoes where culto_id = v_culto;
    delete from culto_obs where culto_id = v_culto;
    delete from plantoes where culto_id = v_culto;
    delete from cultos where id = v_culto;
  end if;
  delete from papeis where pessoa_id = v_p;
  delete from pessoas where id = v_p;
  delete from equipes where slug in ('conf56a','conf56b');

  if falhou > 0 then
    raise exception 'A CONFERENCIA DA 56 REPROVOU: % de % casos', falhou, ok + falhou
      using detail = msg, errcode = 'raise_exception';
  end if;
  raise notice '56 · conferencia: %/% casos', ok, ok;
end $conf$;


/* =============================================================================
   RODAPÉ · O QUE FOI RELATADO E NÃO ENTROU AQUI

   Três equipes de agentes entregaram 30 e poucos achados. Nem todo achado
   vira migração, e dizer POR QUE um não virou vale tanto quanto a correção,
   porque senão ele é redescoberto daqui a três meses.

   ── POR QUE `dem_lista` FOI PARAR NA 57, E NÃO AQUI ──────────────────────

   A correção do teto de `dem_lista` estava escrita dentro deste arquivo, e
   saiu por dois motivos que só apareceram rodando.

   O primeiro é de teste. `scripts/demandas-celular-subir.sh` monta uma base
   ISOLADA de Demandas, sem `cultos` e sem `voluntarios`, e aplica só a 50 e a
   52. Ela é quem roda as 252 conferências de tela do sistema de Demandas.
   Com o teto aqui dentro, aquele roteiro nunca o aplicaria — este arquivo
   depende de `cultos` da primeira seção à última — e as 252 continuariam
   verdes medindo a `dem_lista` ANTIGA. Verde sobre a versão errada é pior
   que vermelho.

   O segundo é o que a auditoria de arquitetura apontou na 52, com razão: ela
   mexe nos dois sistemas no mesmo arquivo, e o roteiro roda cada arquivo sem
   `--single-transaction`, então um erro no meio deixa um sistema corrigido e
   o outro não, sem dizer até onde foi. Eu estava repetindo isso aqui.

   Um arquivo, um sistema. A 57 é só de Demandas e a 56 é só de Escalas.

   ── FOI CORRIGIDO, mas em TypeScript e não no banco ──────────────────────

   · `msgEscala` mandava "Escala de domingo" numa quinta de evento: ela não
     passava `evento` para `tituloDoCulto`. É texto de mensagem, mora em
     lib/engine.ts.
   · Quatro dos nove códigos de `criar_evento`/`apagar_evento` chegavam crus
     na tela (`DIA_DE_CULTO`, `SEM_PERMISSAO`, `NAO_EXISTE`, `REGRA`), e
     `DIA_DE_CULTO` é o erro MAIS provável do recurso: o `<input type=date>`
     não impede escolher um domingo. Foram para lib/erros.ts, junto com os
     textos P0001 que esta migração e a 54 lançam.
   · `?m=2026-13` era aceito pela tela e produzia "undefined" no diálogo.
     Validação em app/escala/page.tsx.
   · As listas `.in(...)` da carga passavam de 8 KB de URL por volta de 150
     voluntários num mesmo ministério, o que devolve 414 e mata a tela
     inteira. Passaram a ir em lotes, em lib/ponte.ts.

   ── INVESTIGUEI E DESCARTEI ──────────────────────────────────────────────

   1. "O TETO MENSAL NÃO ESTÁ NO BANCO, E ISSO É QUEBRA AGORA."

      Comprovado que não está: com `limite_mes = 1`, quatro `insert into
      escalacoes` no mesmo mês passam. O que está errado é a CONCLUSÃO.

      `limite_mes` não é invariante, é PREFERÊNCIA: o motor a respeita e o
      líder a atropela de propósito. A lista de escolha manual passa
      `ignorarLimite: true` (app/escala/page.tsx), e a busca por troca
      também (lib/engine.ts). Gatilho no banco quebraria os dois, que são
      fluxos legítimos e usados.

      As quatro regras irmãs que ESTÃO no banco (indisponibilidade,
      simultaneidade, sexo do posto, mesmo ministério) são invariantes: não
      existe caso em que o líder queira furá-las. Essa é a linha, e o teto
      mensal está do lado certo dela.

   2. "PÔR `gerarMes` NO SERVIDOR."

      A medição é real e concorda comigo: 40 postos por 25 pessoas custam
      6,5 s de servidor, e mais num celular. Mas isso é mudança de
      arquitetura com superfície nova (rota, autenticação, tempo limite,
      fila), e o gatilho medido não é o tamanho: é `limitePadrao = 2`, que
      faz cada vaga impossível pagar a busca inteira antes de desistir.
      Migração não é lugar de decidir isso, e trocar o padrão sem o Arthur
      mudaria o comportamento do sorteio de todo ministério novo. Fica
      registrado, com número, para ser decisão dele.

   3. "A COLUNA GERADA `cultos.tipo` E `tipoDoDia` DIVERGEM NO PRIMEIRO
      SÁBADO DO MÊS."

      Verdade, e o comentário em lib/engine.ts que afirmava o contrário foi
      corrigido. Mas não vira migração: o primeiro sábado NÃO é dia de culto
      em nenhum dos dois lados (`sabadosDoFollow` tira o primeiro,
      `cultosAte` e o guarda usam `dia > 7`). A coluna gerada só diz
      'follow' para uma linha que só existe se for EVENTO, e evento ignora
      `tipos`. Trocar a expressão de uma coluna gerada exige reescrever a
      tabela inteira; pagar isso por um rótulo que ninguém lê seria caro e
      arriscado à toa.

   4. "`is_lider()` E `sou_lider()` SÃO DUAS DEFINIÇÕES DE QUEM MANDA."

      São, e é dívida real. Mas unificar mexe em política de RLS de quase
      toda tabela, e este arquivo já troca um guarda e um índice único. Duas
      mudanças de autorização no mesmo arquivo é como se perde a capacidade
      de dizer qual delas quebrou. Fica para um arquivo só dela.

   5. "`ux_cultos_data_regular` É PARCIAL E `lerCultos` FILTRA SÓ POR DATA,
      ENTÃO VARRE A TABELA."

      Verdade e irrelevante: `cultos` tem cerca de 96 linhas por ano. Índice
      novo aqui seria custo de manutenção sem ganho medível. Registrado para
      não ser redescoberto.
   ============================================================================= */
