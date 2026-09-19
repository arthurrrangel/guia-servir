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

  /* `where evento is null` nos DOIS lugares: o alvo do on conflict é o índice
     parcial `ux_cultos_data_regular`, e a busca de reserva não pode pegar um
     evento que por acaso caia na mesma data — gravaria o domingo dentro do
     GUIA Empreendedor, e o líder veria a escala do evento aparecer no lugar
     da do domingo. */
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
  end loop;

  delete from escalacoes e
   using funcoes f
   where e.funcao_id = f.id and e.culto_id = v_culto and f.equipe_id = p_equipe;

  insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
  select v_culto, (x ->> 'funcao_id')::uuid, (x ->> 'voluntario_id')::uuid,
         coalesce(x ->> 'status', 'pendente')::status_escala,
         coalesce((x ->> 'fixo')::boolean, false),
         coalesce((x ->> 'primeira_vez')::boolean, false)
    from jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) x
   where nullif(x ->> 'voluntario_id', '') is not null;

  delete from plantoes p
   using voluntarios v
   where p.voluntario_id = v.id and p.culto_id = v_culto and v.equipe_id = p_equipe;

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
  v_erros text := ''; v_eq uuid; v_eq2 uuid; v_dia date := current_date + 30;
  v_id uuid; v_id2 uuid; v_n int; v_r jsonb; v_jwt text;
begin
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

  /* 1) a porta RECUSA evento em dia que já tem culto regular — é o limite do
        modelo de um-dia-por-data, e ele tem que ser dito, não tropeçado */
  insert into cultos (data) values (v_dia)
    on conflict (data) where evento is null do nothing;
  if coalesce(criar_evento(v_eq, v_dia, 'GUIA Empreendedor')->>'erro','') <> 'JA_TEM_CULTO' then
    v_erros := v_erros || '1) criar_evento aceitou dia que ja tem culto regular; ';
  end if;
  delete from cultos where data = v_dia and evento is null;
  /* sem o culto regular no caminho, o evento entra */
  insert into cultos (data, evento, equipe_id) values (v_dia, 'GUIA Empreendedor', v_eq)
    returning id into v_id;
  if v_id is null then v_erros := v_erros || '1b) evento nao entrou em dia livre; '; end if;

  /* 2) dois cultos regulares no mesmo dia continuam proibidos */
  insert into cultos (data) values (v_dia);
  begin
    insert into cultos (data) values (v_dia);
    v_erros := v_erros || '2) entrou um SEGUNDO culto regular na mesma data; ';
  exception when unique_violation then null; end;
  delete from cultos where data = v_dia and evento is null;

  /* 3) o mesmo evento, do mesmo ministerio, no mesmo dia, nao duplica */
  begin
    insert into cultos (data, evento, equipe_id) values (v_dia, 'GUIA Empreendedor', v_eq);
    v_erros := v_erros || '3) o mesmo evento entrou duas vezes; ';
  exception when unique_violation then null; end;

  /* 4) mas OUTRO ministerio pode ter evento no mesmo dia */
  if v_eq2 is not null then
    insert into cultos (data, evento, equipe_id) values (v_dia, 'Ensaio geral', v_eq2)
      returning id into v_id2;
    if v_id2 is null then v_erros := v_erros || '4) outro ministerio nao pode marcar no mesmo dia; '; end if;
  end if;

  /* 5) evento sem dono e culto regular com dono: os dois proibidos */
  begin
    insert into cultos (data, evento) values (v_dia + 1, 'Sem dono');
    v_erros := v_erros || '5a) evento sem ministerio passou; ';
  exception when check_violation then null; end;
  begin
    insert into cultos (data, equipe_id) values (v_dia + 2, v_eq);
    v_erros := v_erros || '5b) culto regular com ministerio passou; ';
  exception when check_violation then null; end;

  /* 6) apagar_evento se recusa a apagar culto regular */
  declare v_reg uuid; v_r jsonb;
  begin
    insert into cultos (data) values (v_dia + 5) returning id into v_reg;
    v_r := apagar_evento(v_reg);
    if coalesce(v_r->>'erro','') <> 'NAO_E_EVENTO' then
      v_erros := v_erros || format('6) apagar_evento nao recusou culto regular: %s; ', v_r);
    end if;
    if not exists (select 1 from cultos where id = v_reg) then
      v_erros := v_erros || '6b) e ainda assim APAGOU o culto regular; ';
    end if;
    delete from cultos where id = v_reg;
  end;

  /* limpeza */
  delete from cultos where data between v_dia and v_dia + 5;

  select count(*) into v_n from cultos where evento is not null and equipe_id is null;
  if v_n > 0 then v_erros := v_erros || format('7) %s evento(s) sem dono no banco; ', v_n); end if;

  /* 8) quem NÃO lidera o ministério não cria evento nele */
  perform set_config('request.jwt.claims', '{"email":"ninguem@exemplo.invalido","role":"authenticated"}', true);
  v_r := criar_evento(v_eq, v_dia + 4, 'Evento de estranho');
  if coalesce(v_r->>'erro','') <> 'SEM_PERMISSAO' then
    v_erros := v_erros || format('8) estranho criou evento: %s; ', v_r);
  end if;
  perform set_config('request.jwt.claims', v_jwt, true);

  /* 9) data no passado é recusada */
  v_r := criar_evento(v_eq, current_date - 1, 'Ontem');
  if coalesce(v_r->>'erro','') <> 'DATA_NO_PASSADO' then
    v_erros := v_erros || format('9) evento no passado passou: %s; ', v_r);
  end if;

  /* 10) e o caminho feliz de verdade: dia livre, nome bom, cria */
  v_r := criar_evento(v_eq, v_dia + 6, 'GUIA Empreendedor', time '19:30');
  if not coalesce((v_r->>'ok')::boolean, false) then
    v_erros := v_erros || format('10) o caminho feliz nao criou: %s; ', v_r);
  elsif not exists (select 1 from cultos where data = v_dia + 6 and evento = 'GUIA Empreendedor'
                      and equipe_id = v_eq and inicio = time '19:30') then
    v_erros := v_erros || '10b) criou mas nao gravou horario/dono direito; ';
  else
    /* e apagar_evento apaga o que é evento */
    v_r := apagar_evento((select id from cultos where data = v_dia + 6 and evento = 'GUIA Empreendedor'));
    if not coalesce((v_r->>'ok')::boolean, false)
       or exists (select 1 from cultos where data = v_dia + 6) then
      v_erros := v_erros || format('10c) apagar_evento nao apagou o evento: %s; ', v_r);
    end if;
  end if;

  /* 11) A CHECAGEM QUE FALTOU E QUE DERRUBARIA TUDO.

     `salvar_dia` tem que continuar gravando. Foi ela que quebrou quando a
     restrição de unicidade mudou (`on conflict (data)` perdeu o alvo), e o
     sintoma seria o sistema inteiro de escalas parando com erro cru na
     primeira vez que alguém salvasse um domingo. Este caso é o que separa
     "a migração aplicou" de "o sistema funciona depois dela". */
  declare v_culto uuid; v_fn uuid; v_vol uuid; v_data date := v_dia + 8;
  begin
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

    /* 12) E O QUE IMPORTA DE VERDADE: com um EVENTO na mesma data, salvar o
       domingo não pode escrever dentro do evento. */
    insert into cultos (data, evento, equipe_id) values (v_data, 'Evento no mesmo dia', v_eq);
    if salvar_dia(v_eq, v_data, 'terceiro recado', '[]'::jsonb, '{}'::uuid[]) is distinct from v_culto then
      v_erros := v_erros || '12) com evento na mesma data, salvar_dia pegou o culto errado; ';
    end if;
  exception when others then
    v_erros := v_erros || format('11) salvar_dia QUEBROU: %s (%s); ', SQLERRM, SQLSTATE);
  end;

  delete from cultos where data between v_dia and v_dia + 9;

  if v_erros = '' then
    raise notice 'OK — 15/15: evento recusa dia com culto regular (limite dito), nao duplica, exige dono, outro ministerio pode no mesmo dia, estranho nao cria, passado nao entra, o caminho feliz grava data+hora+dono, apagar_evento so encosta em evento, e salvar_dia continua gravando (inclusive com evento na mesma data).';
  else
    raise exception 'FALHOU — %', v_erros;
  end if;
end $conf$;
