/* ESTE ARQUIVO E PASSADO. A TRANCA ESTA AQUI PORQUE ELE PODE DESFAZER.

   `create or replace function` nao e idempotente NO TEMPO: ele grava a
   versao deste arquivo por cima da que estiver la, seja ela mais nova ou
   nao, e sem um aviso. Medido em 19/09/2026: reaplicar a 23 num banco na
   versao 55 desfez a correcao de seguranca da 51 em silencio, e a regua
   continuou afirmando 55.

   O que este arquivo consegue reverter, se rodar fora de hora:
     culto_guarda (a 56 refez)

   Por isso ele se recusa a rodar num banco que ja passou da 55. Aplicado na
   ordem, do zero, `exige_versao_ate` ainda nem existe e o bloco nao faz
   nada — e e assim que tem que ser, senao o rebuild do repositorio parava
   no primeiro arquivo.

   Se voce REALMENTE precisa reaplicar, a mensagem do erro diz como. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(55);
  end if;
end $tranca$;

/* =============================================================================
   54 · EVENTO ESPORÁDICO — o que não está na programação fixa
   19/09/2026

   -------------------------------------------------------------------------
   O PEDIDO, NAS PALAVRAS DE QUEM PEDIU

   "Ter dentro do sistema uma opção de 'Adicionar evento esporádico', para
   situações que não fazem parte da programação fixa da igreja. Por exemplo,
   amanhã teremos o GUIA Empreendedor. Eu, o JV ou você poderíamos cadastrar
   esse evento diretamente no sistema, informando a data, horário e a área
   responsável. Depois de cadastrado, o evento entraria no mesmo fluxo das
   escalas normais, permitindo gerar/sortear a escala automaticamente entre os
   voluntários disponíveis, seguindo as mesmas regras de disponibilidade e
   organização que já existem no sistema. Assim, não precisaríamos recorrer ao
   grupo dos coordenadores para descobrir manualmente quem pode ficar em cada
   evento."

   O trabalho que isso substitui é uma conversa no grupo dos coordenadores
   perguntando quem pode. O sistema já sabe quem pode: sabe quem avisou que
   não vem, quem já serviu demais no mês, quem faz cada posto, e quem pode
   entrar em cada lugar. Faltava só um jeito de dizer "tem isso no dia tal".

   -------------------------------------------------------------------------
   POR QUE UM EVENTO É UM CULTO, E NÃO UMA TABELA NOVA

   A tentação é criar `eventos`. Seria errado. Do ponto de vista da escala, um
   evento É um culto: tem data, tem postos para preencher, tem gente
   escalada, tem plantão, tem recado, e precisa obedecer às MESMAS regras —
   quem avisou que não pode, o teto do mês, a função simultânea, a regra do
   prédio.

   Tabela nova significaria `escalacoes_de_evento`, `plantoes_de_evento`, os
   gatilhos de novo, `eu_dados` de novo. Duas cópias de tudo, e a segunda
   esquecendo as correções da primeira — exatamente o que a auditoria de hoje
   encontrou em outros três lugares.

   Então evento é uma LINHA em `cultos` com duas colunas a mais.

   -------------------------------------------------------------------------
   AS DUAS COLUNAS, E POR QUE SÃO DUAS

   `evento`     — o nome. Nulo quer dizer "culto normal da programação fixa".
                  É o que separa os dois mundos numa coluna só.
   `equipe_id`  — de quem é. É a "área responsável" do pedido.

   E aqui está a diferença que importa: o culto de domingo é da IGREJA — a
   Mídia, o Louvor, o Connect e o Kids servem no mesmo domingo, e é por isso
   que `cultos` nunca teve `equipe_id`. Um evento esporádico não é assim: o
   GUIA Empreendedor é de UM ministério. Se ele aparecesse para todos, o
   Louvor abriria a escala e veria um dia que não é dele, com postos que não
   existem naquele evento.

   Por isso `equipe_id` é obrigatório QUANDO é evento, e proibido quando não
   é. O CHECK abaixo diz isso, e é o tipo de regra que não pode morar só na
   tela.

   -------------------------------------------------------------------------
   A UNICIDADE TINHA QUE MUDAR

   `cultos.data` era UNIQUE: um culto por data, para a igreja inteira. Com
   eventos isso quebra na primeira vez que alguém marcar um evento num
   domingo — e domingo é justamente quando a igreja mais faz coisa a mais.

   Passa a ser:
     · no máximo UM culto regular por data (o de antes, agora parcial);
     · e eventos à vontade, desde que o MESMO ministério não marque dois
       eventos com o mesmo nome no mesmo dia (isso é dedo duplo, não plano).

   -------------------------------------------------------------------------
   O QUE ESTA MIGRAÇÃO NÃO MEXE

   `cultos.tipo` é coluna GERADA a partir do dia da semana, e continua como
   está. Conferido antes de decidir: NADA lê essa coluna — nem função do
   banco, nem o app. Quem decide o tipo do dia é `tipoDoDia()` em
   lib/engine.ts, a partir da data. Mexer numa coluna gerada que ninguém lê
   seria risco sem troco.

   Quem passa a saber que o dia é evento é o motor, pelo nome do evento que
   chega junto com o dia. E a regra que ele aplica é simples: NUM EVENTO,
   VALEM TODOS OS POSTOS ATIVOS DO MINISTÉRIO DONO. `funcoes.tipos` governa
   em qual culto RECORRENTE o posto existe; um evento já diz de quem é, e
   quem é dono leva os postos todos. Sem isso seria preciso marcar posto por
   posto em cada evento, que é justamente o trabalho manual que o pedido quer
   acabar.
   ============================================================================= */


-- =========================================================================
-- 1 · as duas colunas
-- =========================================================================

alter table cultos add column if not exists evento    text;
alter table cultos add column if not exists equipe_id uuid references equipes(id) on delete cascade;

do $ck$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'cultos_evento_tem_dono_ck' and conrelid = 'cultos'::regclass) then
    /* evento sem dono não teria como escolher postos nem voluntários; culto
       regular COM dono apareceria só para um ministério e sumiria para os
       outros, que é o contrário do que domingo significa */
    alter table cultos add constraint cultos_evento_tem_dono_ck
      check ((evento is null and equipe_id is null)
          or (btrim(coalesce(evento,'')) <> '' and equipe_id is not null));
  end if;
  if not exists (select 1 from pg_constraint
                  where conname = 'cultos_evento_nome_ck' and conrelid = 'cultos'::regclass) then
    alter table cultos add constraint cultos_evento_nome_ck
      check (evento is null or length(btrim(evento)) between 2 and 80);
  end if;
end $ck$;

comment on column cultos.evento is
  'Nome do evento esporadico. NULO = culto normal da programacao fixa (domingo ou Follow). Preenchido = evento, e ai equipe_id diz de quem e.';
comment on column cultos.equipe_id is
  'Dono do EVENTO. Sempre nulo em culto regular: domingo e da igreja inteira, e e por isso que cultos nunca teve essa coluna. Obrigatorio em evento, porque o evento e de uma area so.';


-- =========================================================================
-- 2 · a unicidade
-- =========================================================================

alter table cultos drop constraint if exists cultos_data_key;
drop index if exists cultos_data_key;

/* um culto REGULAR por data, como sempre foi */
create unique index if not exists ux_cultos_data_regular
  on cultos (data) where evento is null;

/* e o mesmo ministério não marca o mesmo evento duas vezes no mesmo dia */
create unique index if not exists ux_cultos_evento
  on cultos (data, equipe_id, evento) where evento is not null;

create index if not exists ix_cultos_equipe on cultos (equipe_id) where equipe_id is not null;


-- =========================================================================
-- 2b · O QUE A MUDANÇA DE UNICIDADE QUEBROU, E QUE EU SÓ VI MEDINDO
--
-- Tirar `cultos_data_key` não é só trocar uma garantia: é tirar o ALVO de
-- todo `on conflict (data)` que existe no banco. E existe um, no lugar mais
-- caro possível:
--
--     insert into cultos (data) values (p_data)
--       on conflict (data) do update set data = excluded.data
--
-- Isso é `salvar_dia`, a função por onde passa TODA gravação de escala — a
-- tela do líder e o robô das 3h. Com a restrição trocada por um índice
-- parcial, o Postgres responde:
--
--     ERROR: there is no unique or exclusion constraint matching the
--            ON CONFLICT specification  (42P10)
--
-- Ou seja: aplicar a parte de cima desta migração e parar ali derrubaria o
-- sistema inteiro de escalas, com um erro cru na tela, na primeira vez que
-- alguém salvasse um domingo. Não é hipótese — rodei e vi acontecer.
--
-- Fica escrito porque a lição vale mais que o conserto: mexer em restrição
-- de unicidade é mexer em todo `on conflict` que aponta para ela, e esses
-- não aparecem numa busca por nome de restrição.
--
-- O conserto tem duas partes, e as duas dizem a mesma coisa: quando o
-- assunto é o culto da programação fixa, a busca é por `evento is null`.
-- =========================================================================

create or replace function public.salvar_dia(
  p_equipe uuid, p_data date, p_obs text, p_slots jsonb, p_plantao uuid[])
returns uuid language plpgsql set search_path to 'public' as $fn$
declare v_culto uuid; r record;
begin
  if p_equipe is null then raise exception 'salvar_dia sem ministerio'; end if;

  /* ---- AS DUAS ÚNICAS LINHAS QUE ESTA MIGRAÇÃO MUDA AQUI --------------

     `where evento is null` nos dois lugares. O primeiro porque o alvo do
     `on conflict` passou a ser o índice PARCIAL `ux_cultos_data_regular`; o
     segundo porque a busca de reserva não pode pegar um evento que caia na
     mesma data e gravar o domingo dentro dele.

     TODO O RESTO DO CORPO É O DA MIGRAÇÃO 05, PALAVRA POR PALAVRA, E ISSO
     É O PONTO. A primeira versão desta migração reescreveu a função inteira
     "aproveitando" a passagem, e nessa reescrita o upsert por slot virou
     `delete` + `insert`. Duas coisas se perderam em silêncio:

       · o upsert preserva `status` e `respondido_em` QUANDO A PESSOA DA VAGA
         NÃO MUDA. Com `delete` na frente, quem tinha confirmado voltava para
         "pendente" e a data da confirmação sumia;
       · a migração 46 conserta `fn_indisponivel` deixando passar o INSERT
         quando "a vaga já tem essa pessoa". Com `delete` na frente essa
         condição nunca casa, e re-salvar um dia onde alguém avisou que não
         pode voltava a abortar a gravação inteira — o defeito que a 46
         existe para matar.

     A lição, que vale mais que o conserto: quando uma migração precisa de
     DUAS linhas dentro de uma função de cinquenta, ela copia as cinquenta e
     muda duas. Reescrever "já que estou aqui" é como se perde regra que
     alguém levou semanas para descobrir. */
  insert into cultos (data) values (p_data)
    on conflict (data) where evento is null do update set data = excluded.data
    returning id into v_culto;
  if v_culto is null then
    select id into v_culto from cultos where data = p_data and evento is null;
  end if;

  insert into culto_obs (culto_id, equipe_id, obs)
    values (v_culto, p_equipe, coalesce(p_obs, ''))
  on conflict (culto_id, equipe_id) do update set obs = excluded.obs;

  for r in
    select (x ->> 'funcao_id')::uuid fid,
           (x ->> 'voluntario_id')::uuid vid,
           coalesce(x ->> 'status', 'pendente')::status_escala st,
           coalesce((x ->> 'fixo')::boolean, false) fx,
           coalesce((x ->> 'primeira_vez')::boolean, false) pv
      from jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) x
  loop
    if not exists (select 1 from funcoes where id = r.fid and equipe_id = p_equipe) then
      raise exception 'funcao de outro ministerio'; end if;
    if not exists (select 1 from voluntarios where id = r.vid and equipe_id = p_equipe) then
      raise exception 'voluntario de outro ministerio'; end if;

    insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
      values (v_culto, r.fid, r.vid, r.st, r.fx, r.pv)
    on conflict (culto_id, funcao_id) do update
      set voluntario_id = excluded.voluntario_id,
          fixo          = excluded.fixo,
          primeira_vez  = excluded.primeira_vez,
          status        = case when escalacoes.voluntario_id is distinct from excluded.voluntario_id
                               then excluded.status else escalacoes.status end,
          respondido_em = case when escalacoes.voluntario_id is distinct from excluded.voluntario_id
                               then null else escalacoes.respondido_em end;
  end loop;

  delete from escalacoes e using funcoes f
   where f.id = e.funcao_id and e.culto_id = v_culto and f.equipe_id = p_equipe
     and not exists (select 1 from jsonb_array_elements(coalesce(p_slots,'[]'::jsonb)) x
                      where (x ->> 'funcao_id')::uuid = e.funcao_id);

  delete from plantoes p using voluntarios v
   where p.voluntario_id = v.id and p.culto_id = v_culto and v.equipe_id = p_equipe
     and not (p.voluntario_id = any (coalesce(p_plantao, '{}'::uuid[])));

  insert into plantoes (culto_id, voluntario_id)
  select v_culto, v.id from unnest(coalesce(p_plantao, '{}'::uuid[])) x
    join voluntarios v on v.id = x and v.equipe_id = p_equipe
  on conflict do nothing;

  return v_culto;
end $fn$;


-- =========================================================================
-- 3 · quem pode criar e apagar
--
-- As políticas de `cultos` foram desenhadas para a programação fixa: criar e
-- editar é de qualquer organizador (`sou_lider`), e APAGAR exige papel global
-- (`lidera_tudo`), porque apagar um domingo derruba a escala de TODOS os
-- ministérios em cascata — a migração 18 fechou isso de propósito.
--
-- Evento é outra coisa: ele é de um ministério só, e apagá-lo derruba a
-- escala daquele ministério e de mais ninguém. Exigir o organizador geral
-- para desmarcar o GUIA Empreendedor seria transformar uma correção de dois
-- toques num pedido no WhatsApp — que é o problema que este arquivo existe
-- para resolver.
--
-- Então: quem lidera a equipe dona mexe no evento dela. O domingo continua
-- protegido como estava.
-- =========================================================================

drop policy if exists cultos_evento_mexer on cultos;
create policy cultos_evento_mexer on cultos for all to authenticated
  using      (evento is not null and lidera_equipe(equipe_id))
  with check (evento is not null and lidera_equipe(equipe_id));


-- =========================================================================
-- 3b · A ESCALADA QUE ESTA MIGRAÇÃO ABRIU, E QUE UM AGENTE ACHOU
--
-- A política acima, sozinha, é um furo grave, e o mecanismo é bonito de
-- ruim: políticas permissivas SE SOMAM, e a porta nova abre conforme o
-- CONTEÚDO DE DUAS COLUNAS QUE O PRÓPRIO ATACANTE PODE ESCREVER.
--
-- `cultos_editar` (migração 18) exige só `sou_lider()` — "é organizador de
-- alguma coisa" — no `using` e no `with check`. Então o pulo é de dois
-- comandos, direto pelo PostgREST, sem passar por RPC nenhuma:
--
--   1. UPDATE no domingo da igreja: set evento='x', equipe_id=<o meu>
--   2. DELETE nessa linha, que a política de evento agora autoriza
--
-- E `escalacoes`, `plantoes` e `culto_obs` apontam para `cultos` com
-- `on delete cascade`. Rodado no banco reconstruído, com a sessão de um
-- organizador preso ao Louvor:
--
--   A · DELETE direto do domingo ............ 0 linhas  (a 18 segura aqui)
--   B · UPDATE marcando como evento meu ..... 1 linha
--   C · DELETE .............................. 1 linha
--   DEPOIS · escalacoes da Midia = 0, recados da Midia = 0
--
-- O mesmo caminho rouba evento de outro ministério: `apagar_evento` recusa
-- com SEM_PERMISSAO, e o UPDATE direto passa por cima.
--
-- POR QUE UM GATILHO E NÃO MAIS UMA POLÍTICA. Porque o problema não é QUEM
-- pode escrever a linha: é a TRANSIÇÃO entre os dois mundos. Política
-- permissiva só soma; para negar uma transição eu precisaria acertar a
-- aritmética de três políticas e torcer para a próxima não somar de novo.
-- Um gatilho nega, e nega uma coisa dita em português.
--
-- As RPCs continuam existindo e continuam sendo o caminho normal. O gatilho
-- é o que garante que elas não sejam apenas decorativas — porque
-- `authenticated` tem INSERT, UPDATE e DELETE diretos nesta tabela, e o
-- PostgREST expõe os três.
-- =========================================================================

create or replace function public.culto_guarda()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_tem_culto boolean;
begin
  /* QUEM ESTE GUARDA PEGA, E A ARMADILHA QUE ME PEGOU PRIMEIRO.

     A primeira versão testava `current_user <> 'authenticated'`. Não funciona,
     e a falha é silenciosa: dentro de uma função `security definer`,
     `current_user` é o DONO da função, nunca quem chamou. O teste dava sempre
     verdadeiro, o guarda devolvia na primeira linha, e o ataque continuava
     passando inteiro. Só apareceu porque eu reproduzi o ataque em vez de
     reler o código.

     `session_user` também não serve: com `set role authenticated`, ele
     continua sendo a sessão original.

     O discriminador certo é `current_setting('role')`, e ele foi medido, não
     deduzido:

         antes do set role ......... role_guc = none
         set local role authenticated  role_guc = authenticated
         depois do reset role ...... role_guc = none

     enquanto `current_user` e `session_user` ficam em `postgres` nos três.

     E esse GUC é exatamente a assinatura do PostgREST: ele faz `set role
     authenticated` (ou `anon`) antes de cada requisição. O robô das 3h entra
     como `service_role` e as migrações rodam sem role nenhuma, então os dois
     passam — e os dois já ignoram RLS de qualquer jeito.

     A versão anterior usava o JWT, e quase funcionou: o JWT sobrevive ao
     `reset role`, então o guarda pegava até a limpeza de um teste que tinha
     assumido uma identidade. Guarda que trava manutenção legítima acaba
     desligado por quem estiver com pressa. */
  if coalesce(current_setting('role', true), '') <> 'authenticated' then
    return case when TG_OP = 'DELETE' then old else new end;
  end if;

  if TG_OP = 'DELETE' then
    /* culto da programação fixa continua exigindo papel global, como a 18
       decidiu: apagar um domingo derruba a escala de TODOS os ministérios */
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
    return new;
  end if;

  /* INSERT. As regras que `criar_evento` já aplica passam a valer também no
     insert direto — senão a RPC vira sugestão. O cabeçalho da seção 4
     promete "a regra fica num lugar só"; o lugar é aqui, e a RPC devolve o
     recado bonito. */
  if new.evento is not null then
    if not lidera_equipe(new.equipe_id) then
      raise exception 'EVENTO_DE_OUTRO_MINISTERIO: voce nao lidera esse ministerio.'
        using errcode = 'insufficient_privilege';
    end if;
    if new.data < current_date then
      raise exception 'DATA_NO_PASSADO: % ja passou.', new.data
        using errcode = 'check_violation';
    end if;
    /* DIA DE CULTO NÃO RECEBE EVENTO, E ISSO FECHA O BURACO DOS DOIS LADOS.

       A primeira versão recusava só quando JÁ EXISTIA um culto regular
       naquela data. Não bastava: o culto regular nasce quando o líder salva
       o domingo, então marcar um evento num domingo AINDA NÃO MONTADO
       passava, e o culto aparecia depois, por cima. As duas linhas
       coexistiriam na mesma data, e `S.escalas` é um dia por data.

       A regra passa a ser sobre o CALENDÁRIO, não sobre o que já existe:
       domingo é dia de culto, e sábado a partir do dia 8 é o Follow (é a
       mesma conta de `cultosAte` em lib/engine.ts). Evento esporádico é para
       o que NÃO é dia de culto, que é exatamente o caso que pediu o recurso
       (o GUIA Empreendedor numa quinta).

       Previsível, e explicável para quem tomar a recusa na tela. */
    if extract(dow from new.data) = 0 then
      raise exception 'DIA_DE_CULTO: % e domingo, e domingo ja tem culto. Evento esporadico e para dia sem culto.', new.data
        using errcode = 'check_violation';
    end if;
    if extract(dow from new.data) = 6 and extract(day from new.data) > 7 then
      raise exception 'DIA_DE_CULTO: % e sabado de Follow. Evento esporadico e para dia sem culto.', new.data
        using errcode = 'check_violation';
    end if;
    /* segunda tranca, para o caso de a igreja marcar culto fora do padrão */
    select exists (select 1 from cultos c where c.data = new.data and c.evento is null)
      into v_tem_culto;
    if v_tem_culto then
      raise exception 'JA_TEM_CULTO: % ja tem culto marcado.', new.data
        using errcode = 'check_violation';
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
-- 3c · e a leitura de evento alheio sai do navegador e vai para o banco
--
-- A migração justifica `equipe_id` dizendo que evento de um ministério não
-- pode aparecer para outro. Só que no banco `cultos_ler` é `sou_lider()`:
-- quem separava era o `.or()` do cliente, em lib/ponte.ts. Regra de acesso
-- que só existe no navegador é regra que a próxima tela esquece.
-- =========================================================================

drop policy if exists cultos_ler on cultos;
create policy cultos_ler on cultos for select to authenticated
  using (sou_lider() and (evento is null or lidera_equipe(equipe_id)));


-- =========================================================================
-- 4 · as duas portas do app
--
-- Por RPC, e não por insert direto, pelo mesmo motivo de sempre: a regra
-- ("o nome não pode ser vazio", "a data não pode ser no passado", "o
-- ministério tem que ser seu") fica num lugar só, e vale para qualquer tela
-- que venha depois.
-- =========================================================================

create or replace function public.criar_evento(
  p_equipe uuid, p_data date, p_nome text, p_inicio time default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_nome text := btrim(coalesce(p_nome, ''));
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
  /* passado não: a escala de um evento que já aconteceu não serve para nada,
     e digitar o ano errado é o engano mais comum de campo de data */
  if p_data < current_date then
    return jsonb_build_object('ok', false, 'erro', 'DATA_NO_PASSADO');
  end if;

  /* ---- O LIMITE DO MODELO, DITO EM VOZ ALTA ---------------------------

     O app guarda a escala como UM DIA POR DATA (`S.escalas['2026-09-20']`).
     Isso vale desde o começo e atravessa tudo: a tela, o sorteio, a conta de
     carga, a mensagem de WhatsApp.

     Um evento no MESMO dia de um culto regular precisaria de dois conjuntos
     de postos na mesma data — o ministério servindo de manhã no culto e de
     novo à noite no evento. O modelo de hoje não sabe dizer isso, e fingir
     que sabe daria uma tela onde os dois se misturam e ninguém entende qual
     escala é qual.

     Então a porta recusa, e explica. Não é capricho: é a diferença entre um
     limite conhecido e um defeito.

     PARA LEVANTAR ESTE LIMITE um dia, o caminho é trocar a chave de
     `S.escalas` de data para `culto_id` — mexe em `ponte.ts`, no motor, nas
     telas de escala e painel, e nas mensagens. É trabalho de verdade, e só
     vale a pena quando a igreja realmente marcar evento em dia de culto com
     o mesmo ministério servindo nos dois. */
  if extract(dow from p_data) = 0
     or (extract(dow from p_data) = 6 and extract(day from p_data) > 7) then
    return jsonb_build_object('ok', false, 'erro', 'DIA_DE_CULTO');
  end if;
  if exists (select 1 from cultos c where c.data = p_data and c.evento is null) then
    return jsonb_build_object('ok', false, 'erro', 'JA_TEM_CULTO');
  end if;

  insert into cultos (data, evento, equipe_id, inicio)
    values (p_data, v_nome, p_equipe, p_inicio)
  on conflict (data, equipe_id, evento) where evento is not null
    do update set inicio = excluded.inicio
    returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'data', p_data, 'nome', v_nome);
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
end $fn$;

create or replace function public.apagar_evento(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare c cultos;
begin
  select * into c from cultos where id = p_id;
  if c.id is null then return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;
  /* o guarda que importa: esta porta NUNCA apaga culto regular. Domingo se
     apaga pela política de `cultos`, que exige papel global. */
  if c.evento is null then return jsonb_build_object('ok', false, 'erro', 'NAO_E_EVENTO'); end if;
  if not lidera_equipe(c.equipe_id) then
    return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO');
  end if;
  delete from cultos where id = p_id;
  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function public.criar_evento(uuid, date, text, time) from public, anon;
revoke all on function public.apagar_evento(uuid) from public, anon;
grant execute on function public.criar_evento(uuid, date, text, time) to authenticated;
grant execute on function public.apagar_evento(uuid) to authenticated;


/* =============================================================================
   CONFERÊNCIA — dados descartáveis, desfeitos no fim.
   ============================================================================= */
do $conf$
declare
  v_erros text := ''; v_eq uuid; v_eq2 uuid;
  /* uma QUINTA-FEIRA la na frente: evento esporadico so entra em dia que nao
     e domingo nem sabado de Follow, entao a conferencia tem que usar um dia
     valido, senao ela testa a recusa em vez do recurso */
  v_dia date := (current_date + 30) + ((4 - extract(dow from current_date + 30)::int + 7) % 7);
  v_id uuid; v_id2 uuid; v_n int; v_r jsonb; v_jwt text;
  /* 82 · cada culto REGULAR que esta conferencia toca guarda se foi ela que o
     criou. Culto regular é a linha da escala de domingo: apagar um que já
     existia leva escalação, plantão e recado junto, por `on delete cascade`. */
  v_d1 uuid; v_meu_d1 boolean := false;
  v_d5 uuid; v_meu_d5 boolean := false;
  /* 82 · e o placar deixa de ser um número escrito à mão */
  v_casos int := 0;
  /* ==================================================== 82 ================
     A IMPRESSÃO DIGITAL DO CALENDÁRIO, ANTES E DEPOIS.

     Esta conferência NÃO CONSEGUE se policiar sozinha no que mais importa: o
     caminho destrutivo é o caminho de SUCESSO. Medido em 21/09, com o
     `delete ... between` de volta e todo o resto já corrigido:

         "OK — 28/28 casos"  ... e 2 cultos, 2 escalacoes e 4 recados a menos.

     Nenhum dos 28 casos olha para isso, porque nenhum caso tem motivo para
     olhar. Se um caso reprovasse, o bloco voltaria atrás e o estrago sumiria
     junto — é exatamente por isso que o estrago só acontece quando tudo dá
     certo.

     Então a trava fica FORA dos casos: o calendário regular é fotografado na
     entrada e conferido na saída, antes de qualquer "OK". Qualquer `delete`
     por faixa de data que volte a este arquivo (meu ou de quem vier depois)
     bate aqui. */
  v_foto_antes text; v_foto_depois text; v_reg_antes int; v_reg_depois int;
begin
  select count(*), md5(coalesce(string_agg(c.id::text || '|' || c.data, E'\n' order by c.data), ''))
    into v_reg_antes, v_foto_antes
    from cultos c where c.evento is null;
  select id into v_eq  from equipes order by ordem, criado_em limit 1;
  select id into v_eq2 from equipes where id <> v_eq order by ordem, criado_em limit 1;
  if v_eq is null then raise notice 'PULEI: nenhum ministerio.'; return; end if;

  /* As duas RPCs checam `lidera_equipe()`, que lê o e-mail do JWT. Sem
     sessão, tudo devolve SEM_PERMISSAO e o teste não testaria nada — foi
     exatamente o que aconteceu na primeira tentativa, e o teste pegou. Então
     a conferência se veste de organizador geral, como a 34 já faz. */
  select '{"email":"' || l.email || '","role":"authenticated"}' into v_jwt
    from lideres l where l.equipe_id is null and coalesce(l.email,'') <> '' limit 1;
  if v_jwt is null then
    raise notice 'PULEI: nenhum organizador geral para assinar o teste.'; return;
  end if;
  perform set_config('request.jwt.claims', v_jwt, true);

  /* 1) a porta RECUSA domingo e sabado de Follow: evento esporadico e para
        dia SEM culto, e a regra e sobre o calendario, nao sobre o que ja
        existe (senao marcar num domingo ainda nao montado passaria).

     ====================================================== 82 ==============
     OS DOIS CASOS TESTAVAM O MESMO DIA.

     Estava `date_trunc('week', current_date + 40)::date + 6` para o "sabado
     de Follow" e `... - 1` para o "domingo". Em Postgres `date_trunc('week')`
     cai na SEGUNDA, entao `+6` e domingo e `-1` e domingo da semana anterior:
     os dois casos eram domingo, e a porta do SABADO DE FOLLOW nunca foi
     exercida por ninguem.

     Medido em 21/09: `date_trunc('week', date '2026-10-31')::date` = 26/10
     (segunda), `+6` = 01/11 (dow 0), `-1` = 25/10 (dow 0).

     Agora o sabado e calculado pela regra de verdade, que e a mesma do
     gatilho: `dow = 6 AND day > 7` (o primeiro sabado do mes nao tem Follow).
     A conferencia anda para a frente ate achar um. */
  declare v_sab date := current_date + 40; v_dom_t date := current_date + 40;
  begin
    while not (extract(dow from v_sab) = 6 and extract(day from v_sab) > 7) loop
      v_sab := v_sab + 1;
    end loop;
    while extract(dow from v_dom_t) <> 0 loop v_dom_t := v_dom_t + 1; end loop;

    if coalesce(criar_evento(v_eq, v_sab, 'No sabado de Follow')->>'erro','') not in ('DIA_DE_CULTO', 'JA_TEM_CULTO') then
      v_erros := v_erros || format('1) criar_evento aceitou sabado de Follow (%s, dow=%s, dia=%s); ',
                                   v_sab, extract(dow from v_sab), extract(day from v_sab));
    end if;
    v_casos := v_casos + 1;
    if coalesce(criar_evento(v_eq, v_dom_t, 'No domingo')->>'erro','') <> 'DIA_DE_CULTO' then
      v_erros := v_erros || format('1b) criar_evento aceitou domingo (%s); ', v_dom_t);
    end if;
    v_casos := v_casos + 1;
    /* controle negativo: se as duas datas acima nao forem o que dizem ser, os
       dois casos acima estao verdes por engano — foi exatamente o que
       aconteceu ate a 82 */
    if extract(dow from v_sab) <> 6 or extract(day from v_sab) <= 7 then
      v_erros := v_erros || format('1d) a data do caso 1 nao e sabado de Follow: %s; ', v_sab);
    end if;
    if extract(dow from v_dom_t) <> 0 then
      v_erros := v_erros || format('1e) a data do caso 1b nao e domingo: %s; ', v_dom_t);
    end if;
    v_casos := v_casos + 1;
  end;
  /* e em dia util entra */
  insert into cultos (data, evento, equipe_id) values (v_dia, 'GUIA Empreendedor', v_eq)
    returning id into v_id;
  if v_id is null then v_erros := v_erros || '1c) evento nao entrou em dia util; '; end if;
  v_casos := v_casos + 1;

  /* 2) dois cultos regulares no mesmo dia continuam proibidos.

     82 · REUSA. `v_dia + 1` e sexta, e sexta nao tem culto no calendario da
     igreja — mas "nao tem hoje" nao e garantia, e `salvar_dia` cria culto
     regular em QUALQUER data que um lider salve. Se ja houver um ali, o
     insert cru levantava `unique_violation` FORA do `begin` protegido e
     derrubava a conferencia inteira; e o `delete ... where data = v_dia + 1`
     logo abaixo apagava o culto de verdade, com escala junto. */
  select id into v_d1 from cultos where data = v_dia + 1 and evento is null;
  if v_d1 is null then
    insert into cultos (data) values (v_dia + 1) returning id into v_d1;
    v_meu_d1 := true;
  end if;
  begin
    insert into cultos (data) values (v_dia + 1);
    v_erros := v_erros || '2) entrou um SEGUNDO culto regular na mesma data; ';
  exception when unique_violation then null; end;
  v_casos := v_casos + 1;

  /* 3) o mesmo evento, do mesmo ministerio, no mesmo dia, nao duplica */
  begin
    insert into cultos (data, evento, equipe_id) values (v_dia, 'GUIA Empreendedor', v_eq);
    v_erros := v_erros || '3) o mesmo evento entrou duas vezes; ';
  exception when unique_violation then null; end;
  v_casos := v_casos + 1;

  /* 4) mas OUTRO ministerio pode ter evento no mesmo dia */
  if v_eq2 is not null then
    insert into cultos (data, evento, equipe_id) values (v_dia, 'Ensaio geral', v_eq2)
      returning id into v_id2;
    if v_id2 is null then v_erros := v_erros || '4) outro ministerio nao pode marcar no mesmo dia; '; end if;
    v_casos := v_casos + 1;
  end if;

  /* 5) evento sem dono e culto regular com dono: os dois proibidos */
  begin
    insert into cultos (data, evento) values (v_dia + 1, 'Sem dono');
    v_erros := v_erros || '5a) evento sem ministerio passou; ';
  exception when check_violation then null; end;
  v_casos := v_casos + 1;
  begin
    insert into cultos (data, equipe_id) values (v_dia + 2, v_eq);
    v_erros := v_erros || '5b) culto regular com ministerio passou; ';
  exception when check_violation then null; end;
  v_casos := v_casos + 1;

  /* 6) apagar_evento se recusa a apagar culto regular.
     82 · reusa em vez de inserir cru, pelo mesmo motivo do caso 2: o insert
     estava fora de qualquer `begin ... exception`, entao um culto ja
     existente em `v_dia + 5` derrubava a migracao inteira — e o
     `delete ... where id = v_reg` apagaria esse culto de verdade. */
  declare v_r jsonb;
  begin
    select id into v_d5 from cultos where data = v_dia + 5 and evento is null;
    if v_d5 is null then
      insert into cultos (data) values (v_dia + 5) returning id into v_d5;
      v_meu_d5 := true;
    end if;
    v_r := apagar_evento(v_d5);
    if coalesce(v_r->>'erro','') <> 'NAO_E_EVENTO' then
      v_erros := v_erros || format('6) apagar_evento nao recusou culto regular: %s; ', v_r);
    end if;
    if not exists (select 1 from cultos where id = v_d5) then
      v_erros := v_erros || '6b) e ainda assim APAGOU o culto regular; ';
    end if;
  end;
  v_casos := v_casos + 2;

  /* ============================================================== 82 ======
     LIMPEZA POR ID, E NÃO POR FAIXA DE DATA.

     Estava `delete from cultos where data between v_dia and v_dia + 5`, e
     mais abaixo `between v_dia and v_dia + 9`. `v_dia` é a quinta-feira
     depois de hoje+30, então a faixa de nove dias sempre contém um sábado de
     Follow e um domingo — e `escalacoes`, `plantoes` e `culto_obs` têm
     `on delete cascade` para `cultos`.

     MEDIDO em 21/09, com um calendário no formato do de produção plantado na
     faixa:

         ANTES  -> 3 cultos, 3 escalacoes, 3 recados entre 22/10 e 31/10
         DEPOIS -> 0, 0, 0     e a conferência imprimiu "OK — 22/22"

     O caminho destrutivo é o de SUCESSO: se algum caso reprovasse, o bloco
     inteiro voltaria atrás e nada se perderia. Este arquivo apagava escala de
     verdade exatamente quando dizia que estava tudo certo.

     E isto NÃO aparecia em teste nenhum: o banco que nasce do repositório tem
     dois cultos, nenhum nessa faixa.

     Agora os eventos são apagados por id (são deste bloco), e culto regular
     não é apagado por data em lugar nenhum — este arquivo cria culto regular
     em quatro pontos (casos 2, 6, 11 e o bloco 13), e os quatro passaram a
     guardar se foram eles que criaram.

     E caiu junto um `delete from cultos where evento = 'GUIA Empreendedor'
     and equipe_id in (v_eq, v_eq2)`. "GUIA Empreendedor" não é um nome
     inventado para o teste: é o nome do evento de verdade da igreja, o que
     deu nome ao recurso. Aquela linha apagava os eventos REAIS dos dois
     primeiros ministérios da lista, em qualquer data, junto com os recados
     deles. Era redundante — `v_id` e `v_id2` já são exatamente as duas linhas
     que este bloco criou. */
  delete from cultos where id in (v_id, v_id2) and evento is not null;
  if v_meu_d1 then delete from cultos where id = v_d1; end if;
  if v_meu_d5 then delete from cultos where id = v_d5; end if;

  select count(*) into v_n from cultos where evento is not null and equipe_id is null;
  if v_n > 0 then v_erros := v_erros || format('7) %s evento(s) sem dono no banco; ', v_n); end if;
  v_casos := v_casos + 1;

  /* 8) quem NÃO lidera o ministério não cria evento nele */
  perform set_config('request.jwt.claims', '{"email":"ninguem@exemplo.invalido","role":"authenticated"}', true);
  v_r := criar_evento(v_eq, v_dia + 4, 'Evento de estranho');
  if coalesce(v_r->>'erro','') <> 'SEM_PERMISSAO' then
    v_erros := v_erros || format('8) estranho criou evento: %s; ', v_r);
  end if;
  v_casos := v_casos + 1;
  perform set_config('request.jwt.claims', v_jwt, true);

  /* 9) data no passado é recusada */
  v_r := criar_evento(v_eq, current_date - 1, 'Ontem');
  if coalesce(v_r->>'erro','') <> 'DATA_NO_PASSADO' then
    v_erros := v_erros || format('9) evento no passado passou: %s; ', v_r);
  end if;
  v_casos := v_casos + 1;

  /* 10) e o caminho feliz de verdade: dia livre, nome bom, cria.

     82 · o nome do evento ganhou sufixo e as checagens passaram a ser por id.
     `'GUIA Empreendedor'` é o nome do evento REAL da igreja: se já existisse
     um em `v_dia + 6`, a busca por nome pegaria a linha errada e
     `apagar_evento` apagaria o evento de verdade. E
     `exists (... where data = v_dia + 6)` reprovava por causa de qualquer
     culto regular que já estivesse naquela quarta. */
  declare v_nome10 text := 'Conf54 feliz ' || substr(md5(random()::text), 1, 6); v_ev10 uuid;
  begin
    v_r := criar_evento(v_eq, v_dia + 6, v_nome10, time '19:30');
    if not coalesce((v_r->>'ok')::boolean, false) then
      v_erros := v_erros || format('10) o caminho feliz nao criou: %s; ', v_r);
    else
      select id into v_ev10 from cultos
        where data = v_dia + 6 and evento = v_nome10 and equipe_id = v_eq and inicio = time '19:30';
      if v_ev10 is null then
        v_erros := v_erros || '10b) criou mas nao gravou horario/dono direito; ';
        delete from cultos where data = v_dia + 6 and evento = v_nome10;
      else
        /* e apagar_evento apaga o que é evento */
        v_r := apagar_evento(v_ev10);
        if not coalesce((v_r->>'ok')::boolean, false)
           or exists (select 1 from cultos where id = v_ev10) then
          v_erros := v_erros || format('10c) apagar_evento nao apagou o evento: %s; ', v_r);
          delete from cultos where id = v_ev10;
        end if;
      end if;
    end if;
  end;
  v_casos := v_casos + 3;

  /* 11) A CHECAGEM QUE FALTOU E QUE DERRUBARIA TUDO.

     `salvar_dia` tem que continuar gravando. Foi ela que quebrou quando a
     restrição de unicidade mudou (`on conflict (data)` perdeu o alvo), e o
     sintoma seria o sistema inteiro de escalas parando com erro cru na
     primeira vez que alguém salvasse um domingo. Este caso é o que separa
     "a migração aplicou" de "o sistema funciona depois dela".

     ====================================================== 82 ==============
     ESTE CASO PRECISA DE UM DIA VIRGEM, E AGORA PROCURA UM.

     `salvar_dia` REESCREVE a escala do ministério no dia: o caso 12 abaixo
     manda uma escala de uma função só. Rodando em cima de um culto que já
     existe, ele apagava a escala de verdade daquele ministério naquele dia e
     sobrescrevia o recado. E, no fim, ninguém apagava nada: a limpeza por
     faixa de data que a 82 removeu era o que levava este culto embora, então
     a primeira correção deixou um culto órfão com escalação e recado.

     Agora: anda para a frente até um dia sem culto nenhum, e apaga por id (o
     `on delete cascade` leva escalação e recado junto). */
  declare v_culto uuid; v_fn uuid; v_vol uuid; v_data date := v_dia + 8;
  begin
    while exists (select 1 from cultos where data = v_data) loop
      v_data := v_data + 1;
    end loop;
    v_culto := salvar_dia(v_eq, v_data, 'recado de teste', '[]'::jsonb, '{}'::uuid[]);
    if v_culto is null then
      v_erros := v_erros || '11) salvar_dia devolveu nulo; ';
    elsif not exists (select 1 from cultos where id = v_culto and data = v_data and evento is null) then
      v_erros := v_erros || '11b) salvar_dia nao gravou no culto regular; ';
    end if;

    /* e gravar DUAS vezes no mesmo dia continua funcionando (é o caminho de
       todo re-salvamento da tela) */
    if salvar_dia(v_eq, v_data, 'segundo recado', '[]'::jsonb, '{}'::uuid[]) is distinct from v_culto then
      v_erros := v_erros || '11c) salvar_dia criou um culto novo em vez de reusar; ';
    end if;

    /* 12) e `salvar_dia` continua PRESERVANDO quem ja confirmou — a regra da
       05 que a primeira versao desta migracao tinha apagado ao reescrever a
       funcao em vez de copiar */
    declare v_f uuid; v_v uuid; v_st text; v_resp timestamptz;
    begin
      select f.id into v_f from funcoes f where f.equipe_id = v_eq and f.ativa limit 1;
      select v.id into v_v from voluntarios v where v.equipe_id = v_eq limit 1;
      if v_f is not null and v_v is not null then
        perform salvar_dia(v_eq, v_data, '', jsonb_build_array(jsonb_build_object(
          'funcao_id', v_f, 'voluntario_id', v_v, 'status', 'pendente')), '{}'::uuid[]);
        update escalacoes set status='confirmado', respondido_em=now()
         where culto_id = v_culto and funcao_id = v_f;
        perform salvar_dia(v_eq, v_data, '', jsonb_build_array(jsonb_build_object(
          'funcao_id', v_f, 'voluntario_id', v_v, 'status', 'pendente')), '{}'::uuid[]);
        select status::text, respondido_em into v_st, v_resp
          from escalacoes where culto_id = v_culto and funcao_id = v_f;
        if v_st is distinct from 'confirmado' or v_resp is null then
          v_erros := v_erros || format('12) salvar_dia apagou a confirmacao: status=%s respondido_em=%s; ', v_st, v_resp);
        end if;
      end if;
    end;
    /* 82 · e leva embora o que este caso criou. Por id: `v_data` foi escolhida
       livre logo acima, entao este culto e deste bloco, e so dele. */
    if v_culto is not null then delete from cultos where id = v_culto; end if;
  exception when others then
    v_erros := v_erros || format('11) salvar_dia QUEBROU: %s (%s); ', SQLERRM, SQLSTATE);
  end;
  v_casos := v_casos + 4;

  /* ---- 13. A BATERIA DE ATAQUE ----------------------------------------

     Um agente adversarial achou, nesta migração, uma escalada de privilégio
     que eu tinha aberto: `cultos_evento_mexer` decide a permissão pelo
     CONTEÚDO de duas colunas que o próprio atacante escreve, e
     `cultos_editar` (migração 18) só exige `sou_lider()`. O pulo era de dois
     comandos pelo PostgREST: marcar o domingo da igreja como evento meu, e
     apagar. Com `on delete cascade` em escalações, plantões e recados.

     Medido antes do conserto, com um organizador preso ao Louvor:
       A · DELETE direto ............ 0 linhas   (a 18 segurava)
       B · UPDATE marcando .......... 1 linha
       C · DELETE ................... 1 linha
       escalacoes da Midia .......... 0

     Estes casos ficam aqui porque uma correção de escalada sem teste é uma
     correção que a próxima migração desfaz sem ninguém ver. */
  declare
    v_jwt text; v_outro uuid; v_dom uuid; v_evt uuid; v_fn2 uuid; v_vol2 uuid; v_n int;
    v_meu_dom boolean := false;
    v_vitima uuid; v_esc_antes int := 0;
  begin
    select id into v_outro from equipes where id <> v_eq limit 1;
    select '{"email":"' || l.email || '","role":"authenticated"}' into v_jwt
      from lideres l where l.equipe_id = v_outro limit 1;

    if v_jwt is null or v_outro is null then
      raise notice 'PULEI 13: nenhum organizador preso a um ministerio para atacar com.';
    else
      /* ========================================================= 82 ======
         REUSA o culto que já existe. O `on conflict do update` fazia `v_dom`
         apontar para a LINHA REAL daquele sábado, e a limpeza lá embaixo a
         apagava — com escalação, plantão e recado de todo mundo junto, por
         `on delete cascade`. */
      select id into v_dom from cultos where data = v_dia + 2 and evento is null;
      if v_dom is null then
        insert into cultos (data) values (v_dia + 2) returning id into v_dom;
        v_meu_dom := true;
      end if;
      /* A VÍTIMA PRECISA TER ESCALA DE VERDADE, e o teste cria a dele.

         Depender dos dados que existem faz o caso mais importante deste bloco
         (a escala do outro ministério sobreviveu ao ataque?) virar um `PULEI`
         justamente no banco reconstruído, onde só um ministério tem gente. Um
         teste que se pula sozinho é um teste que passa sem testar. */
      /* 82 · uma função que AINDA NÃO esteja escalada neste culto. Com
         `v_dom` reusando o sábado real, a primeira função ativa do
         ministério podia já ter escalação ali, e o insert abaixo morreria
         de unique_violation no meio do bloco de ataque. */
      select f.equipe_id, f.id into v_vitima, v_fn2
        from funcoes f
       where f.ativa and f.equipe_id <> v_outro
         and not exists (select 1 from escalacoes e where e.culto_id = v_dom and e.funcao_id = f.id)
       limit 1;
      if v_fn2 is null then
        select f.equipe_id, f.id into v_vitima, v_fn2
          from funcoes f where f.ativa and f.equipe_id <> v_outro limit 1;
      end if;
      /* e o placar da escala passa a ser RELATIVO: o que importa é que nada
         sumiu, não que o número seja 1 */
      select count(*) into v_esc_antes from escalacoes where culto_id = v_dom;
      insert into voluntarios (nome, telefone, equipe_id, ativo)
        values ('Vitima Cinquentaequatro',
                '21' || lpad((floor(random()*900000000)+100000000)::text, 9, '0'),
                v_vitima, true)
        returning id into v_vol2;
      if v_fn2 is not null and v_vol2 is not null
         and not exists (select 1 from escalacoes e where e.culto_id = v_dom and e.funcao_id = v_fn2) then
        insert into escalacoes (culto_id, funcao_id, voluntario_id, status)
          values (v_dom, v_fn2, v_vol2, 'pendente');
        v_esc_antes := v_esc_antes + 1;
      end if;
      insert into cultos (data, evento, equipe_id) values (v_dia + 3, 'Evento alheio', v_vitima)
        returning id into v_evt;

      set local role authenticated;
      perform set_config('request.jwt.claims', v_jwt, true);

      begin
        update cultos set evento = 'roubado', equipe_id = v_outro where id = v_dom;
        v_erros := v_erros || '13a) ESCALADA: o domingo da igreja virou evento de um ministerio; ';
      exception when others then null; end;

      begin
        update cultos set equipe_id = v_outro where id = v_evt;
        get diagnostics v_n = ROW_COUNT;
        if v_n > 0 then v_erros := v_erros || '13b) evento de outro ministerio trocou de dono; '; end if;
      exception when others then null; end;

      begin
        delete from cultos where id = v_evt;
        get diagnostics v_n = ROW_COUNT;
        if v_n > 0 then v_erros := v_erros || '13c) evento de outro ministerio foi apagado; '; end if;
      exception when others then null; end;

      begin
        insert into cultos (data, evento, equipe_id) values (current_date - 5, 'No passado', v_outro);
        v_erros := v_erros || '13d) insert direto driblou DATA_NO_PASSADO; ';
      exception when others then null; end;

      begin
        insert into cultos (data, evento, equipe_id) values (v_dia + 7, 'Em nome alheio', v_vitima);
        v_erros := v_erros || '13e) insert direto criou evento em nome de outro ministerio; ';
      exception when others then null; end;

      reset role;
      perform set_config('request.jwt.claims', v_jwt, true);

      /* só julga o que foi de fato montado: se o ministério do teste não tem
         função ou voluntário, não houve escala para sobreviver, e acusar isso
         seria o teste reprovando a si mesmo */
      if v_fn2 is not null and v_vol2 is not null and v_dom is not null then
        select count(*) into v_n from escalacoes where culto_id = v_dom;
        if v_n <> v_esc_antes then
          v_erros := v_erros || format('13f) a escala do domingo nao sobreviveu (%s, esperava %s); ', v_n, v_esc_antes);
        end if;
      else
        raise notice 'PULEI 13f: ministerio de teste sem funcao/voluntario (fn=%, vol=%, culto=%).', v_fn2, v_vol2, v_dom;
      end if;
      select count(*) into v_n from cultos where id = v_evt and equipe_id = v_vitima;
      if v_n <> 1 then v_erros := v_erros || '13g) o evento mudou de dono ou sumiu; '; end if;

      v_casos := v_casos + 7;

      delete from escalacoes where culto_id = v_dom and voluntario_id = v_vol2;
      delete from escalacoes where voluntario_id = v_vol2;
      delete from culto_obs where culto_id = v_evt;
      delete from cultos where id = v_evt;
      if v_meu_dom then delete from cultos where id = v_dom; end if;
      /* 82 · e os três nomes de ataque saem POR DATA também: eles só podem
         existir nas datas que este bloco tentou, e um `delete ... where
         evento in (...)` solto é uma varredura no calendário inteiro. */
      delete from cultos where evento in ('No passado', 'Em nome alheio')
         and data in (current_date - 5, v_dia + 7);
      delete from voluntarios where id = v_vol2;
    end if;
  end;

  /* 82 · a segunda faixa some pelo mesmo motivo. O que resta deste bloco são
     os eventos que ele criou, apagados por id acima e no bloco 13. */
  delete from cultos where evento in ('No passado', 'Em nome alheio', 'roubado')
     and equipe_id in (v_eq, v_eq2)
     and data in (current_date - 5, v_dia + 2, v_dia + 7);

  /* ================================================================ 82 ====
     O PLACAR ERA UM NÚMERO ESCRITO À MÃO.

     "OK — 22/22" era texto literal: a conferência imprimia 22 tendo rodado
     qualquer quantidade de casos. Dois casos do bloco 1 testavam o mesmo
     domingo (o sábado de Follow nunca foi exercido) e o 22 não mudou; o
     bloco 13 inteiro podia virar `PULEI` e o 22 não mudava também.

     Agora o número é contado, e existe um piso: menos de 20 casos significa
     que a conferência pulou coisa e não tem direito de dizer OK. */
  if v_casos < 20 then
    v_erros := v_erros || format('0) a conferencia so rodou %s casos, e o piso e 20; ', v_casos);
  end if;

  /* 82 · e a foto de saída. Compara id E data: apagar e recriar o mesmo
     domingo não passa, porque o id novo não bate — e escalação, plantão e
     recado teriam ido embora no caminho pelo `on delete cascade`. */
  select count(*), md5(coalesce(string_agg(c.id::text || '|' || c.data, E'\n' order by c.data), ''))
    into v_reg_depois, v_foto_depois
    from cultos c where c.evento is null;
  if v_foto_depois is distinct from v_foto_antes then
    v_erros := v_erros || format(
      '0b) A CONFERENCIA MEXEU NO CALENDARIO REGULAR: entrou com %s cultos e saiu com %s. '
      || 'Nenhum caso deste bloco tem o direito de apagar (nem de deixar para tras) culto regular; '
      || 'se isto disparou, procure um delete por faixa de data. ',
      v_reg_antes, v_reg_depois);
  end if;

  if v_erros = '' then
    raise notice 'OK — %/% casos: evento recusa domingo E sabado de Follow (datas conferidas pela regra dow=6 e dia>7), nao duplica, exige dono, outro ministerio pode no mesmo dia, estranho nao cria, passado nao entra, o caminho feliz grava data+hora+dono, apagar_evento so encosta em evento, salvar_dia continua gravando e PRESERVA quem ja confirmou, e a bateria de ataque (escalada pelo UPDATE, roubo de evento, insert direto) bate na porta e volta. Nenhum culto regular preexistente foi apagado: tudo que este bloco criou saiu por id.', v_casos, v_casos;
  else
    raise exception 'FALHOU (% casos rodados) — %', v_casos, v_erros;
  end if;
end $conf$;
