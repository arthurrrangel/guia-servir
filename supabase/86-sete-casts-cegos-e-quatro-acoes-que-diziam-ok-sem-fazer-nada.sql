/* A TRANCA. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(86);
  end if;
end $tranca$;

/* =============================================================================
   86 · SETE CASTS CEGOS, E QUATRO ACOES QUE DIZIAM "OK" SEM FAZER O QUE
        A PESSOA PEDIU
   21/09/2026

   -------------------------------------------------------------------------
   COMO ESTE ARQUIVO MEXE NAS FUNCOES, E POR QUE ASSIM

   A 84 e a 85 reescreveram `dem_mover` e `dem_abrir` inteiras. Isso foi
   certo la, porque a mudanca era o desenho da funcao. Aqui nao e: sao nove
   consertos cirurgicos em nove pontos. Reescrever 300 linhas para mudar nove
   e justamente como se perde um guarda sem ninguem ver.

   Entao este arquivo LE o corpo vivo com `pg_get_functiondef`, troca os
   trechos e executa o resultado, EXIGINDO que cada troca case exatamente uma
   vez. Se o banco nao estiver onde este arquivo pensa, ele para e diz qual
   troca nao casou, em vez de gravar uma funcao meio antiga por cima.

   -------------------------------------------------------------------------
   DEFEITO 1 · SETE CASTS CEGOS AINDA VIVOS

   A 68 tirou o cast cego de `limite` em `dem_lista` e escreveu no cabecalho
   que "o mesmo padrao se copia para a proxima funcao". A 80 achou mais tres
   na mesma funcao. Sobraram sete, em `dem_abrir` e `dem_mover`, e eles sao
   piores: `dem_lista` nao tem `exception`, entao o erro cru sai puro; as
   outras duas TEM, e por isso o erro cru vira "REGRA" com o texto do Postgres
   dentro, que a tela imprime.

   MEDIDO, no banco local:

     dem_abrir(tok, '{"categoria_id":"x", ...}')
       -> 22P02 invalid input syntax for type uuid: "x"   (nao cai no exception)
     dem_abrir(tok, '{"orcamento":"mil reais", ...}')
       -> 22P02 invalid input syntax for type numeric
     dem_mover(tok, n, 'prazo', '{"prazo":"amanha"}')
       -> 22P02 invalid input syntax for type date
     dem_mover(tok, n, 'redirecionar', '{"setor":"x"}')
       -> 22P02 invalid input syntax for type uuid
     dem_mover(tok, n, 'comentar', '{"texto":"a","interno":"talvez"}')
       -> 22P02 invalid input syntax for type boolean

   Nenhum destes e culpa do usuario digitando: sao a forma de um bug de tela,
   de um link velho salvo no celular, ou de uma tentativa. Em todos, quem le e
   uma pessoa da igreja, e o que ela le e ingles com o nome do tipo do
   Postgres.

   -------------------------------------------------------------------------
   DEFEITO 2 · QUATRO ACOES QUE RESPONDIAM "OK" SEM FAZER O PEDIDO

   a. `dem_mover(..., 'prazo', '{}')` APAGAVA o prazo e devolvia `ok: true`.
      A tela manda `{}` quando o campo volta vazio, e a pessoa que so queria
      fechar o formulario perdia a data. MEDIDO: prazo vira nulo,
      `sem_prazo_porque` fica com o que estava, e `ck_prazo` nem reclama
      porque ja havia texto la de antes.

      Agora: apagar prazo e um pedido EXPLICITO (`"prazo": null` na chave) e
      exige dizer por que. `{}` sem a chave nao mexe em nada.

   b. `assumir` nao tinha guarda de "ja tem dono". Duas pessoas tocando no
      mesmo segundo: as duas passam, e a segunda rouba a demanda da primeira
      sem nenhum aviso. O `for update` da 67 serializa, mas serializar nao
      decide: sem a guarda, as duas escritas acontecem em ordem e vence a
      ultima.

   c. `redirecionar` levava a TRAVA junto para o setor novo. A demanda chegava
      em Manutencao travada por "esperando informacao" de uma conversa que
      aconteceu em Compras. Quem recebe nao tem como saber do que se trata, e
      `destravar` exige contexto que ele nao tem.

   d. `concluir` nunca exigia o motivo do atraso. A coluna `atraso_motivo`
      existe, a tela tem o campo, e o servidor aceitava concluir 51 dias
      depois do prazo sem uma palavra. O indicador de pontualidade que se
      calcula em cima disso nao tem como estar certo.

   -------------------------------------------------------------------------
   DEFEITO 3 · `exige_orcamento` NAO EXIGIA NADA, E ORCAMENTO NEGATIVO ENTRAVA

   `categorias.exige_orcamento` existe desde a 50, a tela de Ajustes deixa
   ligar, e nenhuma linha do banco olha para ela. E `orcamento` aceita numero
   negativo: uma compra de menos oito mil reais.

   -------------------------------------------------------------------------
   DEFEITO 4 · NENHUM TETO DE TAMANHO EM TEXTO LIVRE

   MEDIDO: um comentario de 200.000 letras entrou por `dem_mover`, e outro de
   49.600 numa medicao independente. `titulo`, `descricao` e `evento` tinham
   teto desde a 52; `conclusao`, `cancelada_motivo`, `travada_nota`,
   `impacto`, `objetivo`, `local`, `publico`, `sem_prazo_porque`,
   `atraso_motivo`, `aprovacao_nota` e `eventos.texto` eram `text` cru.

   A conta que importa: uma demanda com um comentario colado da ata faz
   `dem_ver` descer megabytes para TODA pessoa que abrir aquela ficha, para
   sempre, no 4G da igreja. Ninguem liga o lento ao comentario.

   -------------------------------------------------------------------------
   DEFEITO 5 · O ORACULO DE NUMERO

   `dem_ver` e `dem_mover` liam a demanda ANTES de conferir permissao, e
   respondiam `NAO_EXISTE` para numero vazio e `SEM_ACESSO` para numero que
   existe e nao e seu. MEDIDO, varrendo de 1 a 22 com um token de outro setor:
   21 vazios e 1 `SEM_ACESSO`, e a contagem real do banco era exatamente 1.

   Qualquer pessoa com um token valido conta quantas demandas a igreja tem e
   em que ritmo nascem. Nao le conteudo; e vazamento de volume. As duas portas
   passam a responder `NAO_EXISTE` nos dois casos, que e a resposta mais
   educada com quem so digitou o numero errado.

   -------------------------------------------------------------------------
   DEFEITO 6 · O HISTORICO SO OLHAVA SETE COLUNAS

   `fn_historico` comparava `status`, `responsavel_id`, `setor_responsavel`,
   `prazo`, `prioridade`, `aprovacao` e `reaberturas`. Ficaram de fora
   `titulo`, `descricao`, `orcamento` e `atraso_motivo`. Mudar o orcamento de
   uma compra ja aprovada nao deixava rastro nenhum: o valor que a lideranca
   aprovou e o valor que foi gasto podiam ser diferentes, e a ficha contava a
   mesma historia nos dois casos.
   ============================================================================= */

begin;

/* -------------------------------------------------------------------------
   1 · OS TETOS DE TEXTO

   NOT VALID, pelo mesmo motivo da 84: a linha de 200 mil letras medida hoje
   existe, e a conferencia CONTA e IMPRIME em vez de bloquear. */
do $tetos$
declare
  v_col text; v_teto int;
  COLUNAS text[][] := array[
    ['conclusao','4000'], ['cancelada_motivo','2000'], ['travada_nota','2000'],
    ['impacto','2000'], ['objetivo','4000'], ['local','200'], ['publico','200'],
    ['sem_prazo_porque','500'], ['atraso_motivo','2000'], ['aprovacao_nota','2000']];
  i int;
begin
  for i in 1 .. array_length(COLUNAS, 1) loop
    v_col := COLUNAS[i][1]; v_teto := COLUNAS[i][2]::int;
    execute format('alter table demandas.demandas drop constraint if exists %I', 'ck_tam_'||v_col);
    execute format('alter table demandas.demandas add constraint %I check (%I is null or length(%I) <= %s) not valid',
                   'ck_tam_'||v_col, v_col, v_col, v_teto);
  end loop;
end $tetos$;

alter table demandas.eventos drop constraint if exists ck_tam_texto;
alter table demandas.eventos add constraint ck_tam_texto
  check (texto is null or length(texto) <= 4000) not valid;

/* -------------------------------------------------------------------------
   2 · O HISTORICO PASSA A OLHAR O QUE FALTAVA */
create or replace function demandas.fn_historico() returns trigger
language plpgsql as $function$
declare
  v_m uuid := nullif(current_setting('demandas.membro', true), '')::uuid;
begin
  if new.status is distinct from old.status then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para, texto)
      values (new.id, v_m, 'status', old.status, new.status,
              case new.status
                when 'travada'   then new.travada_nota
                when 'concluida' then new.conclusao
                when 'cancelada' then new.cancelada_motivo
                else null end);
  end if;
  if new.responsavel_id is distinct from old.responsavel_id then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para)
      values (new.id, v_m, 'responsavel',
              (select nome from demandas.membros where id = old.responsavel_id),
              (select nome from demandas.membros where id = new.responsavel_id));
  end if;
  if new.setor_responsavel is distinct from old.setor_responsavel then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para)
      values (new.id, v_m, 'setor',
              (select nome from demandas.setores where id = old.setor_responsavel),
              (select nome from demandas.setores where id = new.setor_responsavel));
  end if;
  if new.prazo is distinct from old.prazo then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para)
      values (new.id, v_m, 'prazo', old.prazo::text, new.prazo::text);
  end if;
  if new.prioridade is distinct from old.prioridade then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para)
      values (new.id, v_m, 'prioridade', old.prioridade, new.prioridade);
  end if;
  if new.aprovacao is distinct from old.aprovacao then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para, texto)
      values (new.id, v_m, 'aprovacao', old.aprovacao, new.aprovacao, new.aprovacao_nota);
  end if;
  if new.reaberturas > old.reaberturas then
    insert into demandas.eventos (demanda_id, membro_id, tipo)
      values (new.id, v_m, 'reabertura');
  end if;

  /* ---- 86 · O QUE ELE NAO OLHAVA ------------------------------------
     `orcamento` e o mais caro: mudar o valor de uma compra JA APROVADA nao
     deixava rastro nenhum, e a ficha ficava igual nos dois casos. */
  if new.orcamento is distinct from old.orcamento then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para)
      values (new.id, v_m, 'orcamento',
              to_char(old.orcamento, 'FM999G999G990D00'),
              to_char(new.orcamento, 'FM999G999G990D00'));
  end if;
  if new.titulo is distinct from old.titulo then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para)
      values (new.id, v_m, 'titulo', old.titulo, new.titulo);
  end if;
  /* descricao pode ter 20 mil letras: o evento guarda que MUDOU, nao o texto
     inteiro duas vezes. O historico e para saber que mexeram, e quem. */
  if new.descricao is distinct from old.descricao then
    insert into demandas.eventos (demanda_id, membro_id, tipo, texto)
      values (new.id, v_m, 'descricao', 'A descrição foi reescrita.');
  end if;
  /* o motivo do atraso sumia sem rastro no `reabrir` */
  if old.atraso_motivo is not null and new.atraso_motivo is null then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para)
      values (new.id, v_m, 'atraso', old.atraso_motivo, null);
  end if;
  return null;
end $function$;

/* -------------------------------------------------------------------------
   3 · AS TROCAS CIRURGICAS

   Cada uma tem que casar EXATAMENTE uma vez. Nao casou: para e diz qual. */
/* A ferramenta da cirurgia. Ela existe para que trocar um trecho de uma
   funcao viva seja uma operacao que FALHA quando o alvo nao esta la, em vez
   de uma que grava silenciosamente uma versao meio antiga. Fica no banco
   porque a proxima migracao cirurgica vai precisar dela. */
create or replace function public.troca_unica(s text, antes text, depois text, etiqueta text)
returns text language plpgsql immutable as $fn$
declare v_n int;
begin
  v_n := (length(s) - length(replace(s, antes, ''))) / nullif(length(antes), 0);
  if v_n is distinct from 1 then
    raise exception E'TROCA "%" casou % vez(es), e precisa casar exatamente 1.\n'
      '  O banco nao esta onde este arquivo pensa que esta. Nada foi gravado.\n'
      '  A CAUSA MAIS PROVAVEL e este arquivo ja ter sido aplicado: uma migracao\n'
      '  cirurgica procura o texto ANTIGO, e depois de aplicada ele nao existe\n'
      '  mais. Confira com: select max(n) from schema_versao;', etiqueta, coalesce(v_n, 0);
  end if;
  return replace(s, antes, depois);
end $fn$;

comment on function public.troca_unica(text,text,text,text) is
  'Troca um trecho de um corpo de funcao lido por pg_get_functiondef, exigindo '
  'que o trecho exista exatamente uma vez. Ver a migracao 86.';

do $cirurgia$
declare
  src text; novo text;
begin
  -- ===================== dem_mover =====================
  select pg_get_functiondef('public.dem_mover(text,integer,text,jsonb)'::regprocedure) into src;
  novo := src;

  /* (a) o oraculo: numero que existe e nao e seu responde igual a numero que
     nao existe. Sao DUAS linhas, e a de cima ja diz NAO_EXISTE; a de baixo e
     o `pode_ver`. */
  novo := public.troca_unica(novo,
    'if not demandas.pode_ver(m, d) then return jsonb_build_object(''ok'', false, ''erro'', ''SEM_ACESSO''); end if;
',
    'if not demandas.pode_ver(m, d) then
    /* 86 · ERA ''SEM_ACESSO''. A diferenca entre as duas respostas contava,
       para quem tivesse qualquer token valido, quantas demandas a igreja tem
       e em que ritmo nascem: `numero` e sequencial. Nao vaza conteudo; vaza
       volume. */
    return jsonb_build_object(''ok'', false, ''erro'', ''NAO_EXISTE''); end if;
', 'dem_mover: oraculo');

  /* (b) `interno` com cast cego */
  novo := public.troca_unica(novo,
    'coalesce((p_d->>''interno'')::boolean, false) and demandas.pode_atender(m, d));',
    'coalesce(nullif(p_d->>''interno'','''') in (''true'',''t''), false) and demandas.pode_atender(m, d));',
    'dem_mover: cast de interno');

  /* (c) `assumir` sem guarda de dono */
  novo := public.troca_unica(novo,
    'if demandas.falta_aprovacao(d) then return jsonb_build_object(''ok'', false, ''erro'', ''FALTA_APROVACAO''); end if;
    update demandas.demandas
       set responsavel_id = m.id, status = ''execucao'', travada_por = null, travada_nota = null',
    'if demandas.falta_aprovacao(d) then return jsonb_build_object(''ok'', false, ''erro'', ''FALTA_APROVACAO''); end if;
    /* 86 · Duas pessoas tocando em "assumir" no mesmo segundo: o `for update`
       serializa, mas serializar nao decide. Sem esta guarda as duas escritas
       acontecem em ordem e vence a ultima, e a primeira nao fica sabendo que
       perdeu a demanda. */
    if d.responsavel_id is not null and d.responsavel_id <> m.id then
      return jsonb_build_object(''ok'', false, ''erro'', ''JA_TEM_DONO'',
        ''quem'', (select x.nome from demandas.membros x where x.id = d.responsavel_id)); end if;
    update demandas.demandas
       set responsavel_id = m.id, status = ''execucao'', travada_por = null, travada_nota = null',
    'dem_mover: assumir sem dono');

  /* (d) `prazo`: cast cego, e apagar sem pedir */
  novo := public.troca_unica(novo,
    'update demandas.demandas set prazo = nullif(p_d->>''prazo'','''')::date,
      sem_prazo_porque = case when nullif(p_d->>''prazo'','''') is null
                              then coalesce(v_txt, sem_prazo_porque) else sem_prazo_porque end
     where id = d.id;',
    '/* 86 · TRES COISAS AQUI.
       1. cast cego: "amanha" virava `22P02 invalid input syntax for type
          date`, e a tela imprimia isso.
       2. `{}` (a tela manda isso quando o campo volta vazio) APAGAVA o prazo
          e respondia ok. Agora sem a chave nao mexe em nada, e apagar e um
          pedido explicito.
       3. apagar o prazo sem dizer por que deixava `ck_prazo` satisfeita pelo
          texto que ja estava la, de outra vez. */
    if not (p_d ? ''prazo'') then return jsonb_build_object(''ok'', false, ''erro'', ''PRAZO_NAO_VEIO''); end if;
    if nullif(p_d->>''prazo'','''') is not null
       and p_d->>''prazo'' !~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$'' then
      return jsonb_build_object(''ok'', false, ''erro'', ''PRAZO_INVALIDO''); end if;
    if nullif(p_d->>''prazo'','''') is null and v_txt is null then
      return jsonb_build_object(''ok'', false, ''erro'', ''SEM_PRAZO_PRECISA_MOTIVO''); end if;
    begin
      update demandas.demandas set prazo = nullif(p_d->>''prazo'','''')::date,
        sem_prazo_porque = case when nullif(p_d->>''prazo'','''') is null
                                then v_txt else sem_prazo_porque end
       where id = d.id;
    exception when invalid_datetime_format or datetime_field_overflow then
      return jsonb_build_object(''ok'', false, ''erro'', ''PRAZO_INVALIDO'');
    end;',
    'dem_mover: prazo');

  /* (e) `redirecionar`: cast cego, e a trava que ia junto */
  novo := public.troca_unica(novo,
    'update demandas.demandas
       set setor_responsavel = (p_d->>''setor'')::uuid, responsavel_id = null,
           status = case when status = ''execucao'' then ''aberta'' else status end
     where id = d.id;',
    '/* 86 · a trava NAO vai junto. A demanda chegava no setor novo travada por
       "esperando informacao" de uma conversa que aconteceu no setor antigo, e
       quem recebe nao tem como saber do que se trata. A trava de APROVACAO
       fica, porque essa nao e do setor: e do dinheiro. */
    update demandas.demandas
       set setor_responsavel = (p_d->>''setor'')::uuid, responsavel_id = null,
           status = case when demandas.falta_aprovacao(d) then ''travada''
                         when status in (''execucao'',''travada'') then ''aberta''
                         else status end,
           travada_por = case when demandas.falta_aprovacao(d) then ''aprovacao'' else null end,
           travada_nota = case when demandas.falta_aprovacao(d) then travada_nota else null end
     where id = d.id;',
    'dem_mover: redirecionar leva a trava');

  /* (f) `concluir` atrasada sem uma palavra */
  novo := public.troca_unica(novo,
    'if v_txt is null then return jsonb_build_object(''ok'', false, ''erro'', ''CONCLUSAO_VAZIA''); end if;
    update demandas.demandas
       set status = ''concluida'', conclusao = v_txt, concluida_em = now(),',
    'if v_txt is null then return jsonb_build_object(''ok'', false, ''erro'', ''CONCLUSAO_VAZIA''); end if;
    /* 86 · A coluna existe, a tela tem o campo, e o servidor aceitava concluir
       51 dias depois do prazo sem uma palavra. Qualquer indicador de
       pontualidade calculado em cima disso e ficcao. */
    if d.prazo is not null and d.prazo < current_date
       and demandas.limpo(p_d->>''atraso'') is null then
      return jsonb_build_object(''ok'', false, ''erro'', ''ATRASO_PRECISA_MOTIVO''); end if;
    update demandas.demandas
       set status = ''concluida'', conclusao = v_txt, concluida_em = now(),',
    'dem_mover: concluir atrasada');

  /* (g) `redirecionar` com setor que nao e uuid */
  novo := public.troca_unica(novo,
    'if not exists (select 1 from demandas.setores
                    where id = nullif(p_d->>''setor'','''')::uuid and ativo and atende) then',
    'if nullif(p_d->>''setor'','''') is null
       or p_d->>''setor'' !~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then
      return jsonb_build_object(''ok'', false, ''erro'', ''SETOR_INVALIDO''); end if;
    if not exists (select 1 from demandas.setores
                    where id = (p_d->>''setor'')::uuid and ativo and atende) then',
    'dem_mover: cast de setor');

  execute novo;

  -- ===================== dem_abrir =====================
  select pg_get_functiondef('public.dem_abrir(text,jsonb)'::regprocedure) into src;
  novo := src;

  novo := public.troca_unica(novo,
    'select * into c from demandas.categorias where id = (p_d->>''categoria_id'')::uuid and ativa;',
    '/* 86 · cast cego. Uma categoria que nao e uuid (link velho no celular,
       bug de tela) virava `22P02 invalid input syntax for type uuid` e a
       tela imprimia o nome do tipo do Postgres para uma pessoa da igreja. */
  if coalesce(p_d->>''categoria_id'','''') !~* ''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' then
    return jsonb_build_object(''ok'', false, ''erro'', ''CATEGORIA_INVALIDA''); end if;
  select * into c from demandas.categorias where id = (p_d->>''categoria_id'')::uuid and ativa;',
    'dem_abrir: cast de categoria');

  novo := public.troca_unica(novo,
    'v_prazo := nullif(p_d->>''prazo'','''')::date;
  v_evd   := nullif(p_d->>''evento_data'','''')::date;',
    '/* 86 · os outros tres casts cegos, e as duas regras que faltavam */
  if nullif(p_d->>''prazo'','''') is not null and p_d->>''prazo'' !~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$'' then
    return jsonb_build_object(''ok'', false, ''erro'', ''PRAZO_INVALIDO''); end if;
  if nullif(p_d->>''evento_data'','''') is not null and p_d->>''evento_data'' !~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$'' then
    return jsonb_build_object(''ok'', false, ''erro'', ''EVENTO_DATA_INVALIDA''); end if;
  if nullif(p_d->>''orcamento'','''') is not null then
    if p_d->>''orcamento'' !~ ''^[0-9]+([.,][0-9]{1,2})?$'' then
      return jsonb_build_object(''ok'', false, ''erro'', ''ORCAMENTO_INVALIDO''); end if;
  end if;
  /* `exige_orcamento` existe desde a 50, a tela de Ajustes deixa ligar, e
     nenhuma linha do banco olhava para ela. */
  if c.exige_orcamento and nullif(p_d->>''orcamento'','''') is null then
    return jsonb_build_object(''ok'', false, ''erro'', ''ORCAMENTO_OBRIGATORIO''); end if;
  begin
    v_prazo := nullif(p_d->>''prazo'','''')::date;
    v_evd   := nullif(p_d->>''evento_data'','''')::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    return jsonb_build_object(''ok'', false, ''erro'', ''PRAZO_INVALIDO'');
  end;
  /* prazo no passado no momento da abertura e sempre engano de digitacao: a
     demanda nasceria ja atrasada, e a fila de quem atende passaria a mentir
     no primeiro dia. */
  if v_prazo is not null and v_prazo < current_date then
    return jsonb_build_object(''ok'', false, ''erro'', ''PRAZO_NO_PASSADO''); end if;',
    'dem_abrir: casts de data e orcamento');

  novo := public.troca_unica(novo,
    'nullif(p_d->>''orcamento'','''')::numeric,',
    'replace(nullif(p_d->>''orcamento'',''''), '','', ''.'')::numeric,',
    'dem_abrir: orcamento com virgula');

  execute novo;

  -- ===================== dem_ver: o mesmo oraculo =====================
  select pg_get_functiondef('public.dem_ver(text,integer)'::regprocedure) into src;
  novo := src;
  novo := public.troca_unica(novo,
    'if not demandas.pode_ver(m, d) then return jsonb_build_object(''ok'', false, ''erro'', ''SEM_ACESSO''); end if;',
    'if not demandas.pode_ver(m, d) then return jsonb_build_object(''ok'', false, ''erro'', ''NAO_EXISTE''); end if;',
    'dem_ver: oraculo');
  execute novo;
end $cirurgia$;

/* o orcamento nao pode ser negativo */
alter table demandas.demandas drop constraint if exists ck_orcamento;
alter table demandas.demandas add constraint ck_orcamento
  check (orcamento is null or orcamento >= 0) not valid;

/* =============================================================================
   CONFERENCIA
   ============================================================================= */
do $conf$
declare
  falhas text[] := '{}'; avisos text[] := '{}';
  v_set uuid; v_set2 uuid; v_cat uuid; v_cat_orc uuid;
  v_ana uuid; v_bia uuid; v_ges uuid;
  r jsonb; n int; v_i int; v_ch text; v_d date; base jsonb; v_q int; v_json text;
begin
  insert into demandas.setores (nome, slug, ativo, atende, ordem)
    values ('CONF 86 setor', 'conf-86-setor', true, true, 94) returning id into v_set;
  insert into demandas.setores (nome, slug, ativo, atende, ordem)
    values ('CONF 86 outro', 'conf-86-outro', true, true, 95) returning id into v_set2;
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, exige_orcamento, ativa)
    values ('CONF 86', 'livre', v_set, false, false, true) returning id into v_cat;
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, exige_orcamento, ativa)
    values ('CONF 86', 'com orcamento', v_set, false, true, true) returning id into v_cat_orc;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('CONF86 Ana', 'conf86-ana', 'responsavel', v_set, true) returning id into v_ana;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('CONF86 Bia', 'conf86-bia', 'responsavel', v_set, true) returning id into v_bia;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('CONF86 Fora', 'conf86-fora', 'responsavel', v_set2, true);

  base := jsonb_build_object('descricao','Pedido da conferencia da migracao 86.',
                             'setor_solicitante', v_set, 'prazo', (current_date + 30)::text,
                             'categoria_id', v_cat);

  /* ---- 1 · nenhum cast cego sobra: o erro e nosso, nao do Postgres ---- */
  for v_ch in select unnest(array[
      '{"categoria_id":"nao-e-uuid"}',
      '{"prazo":"amanha"}',
      '{"evento_data":"32/13/2026"}',
      '{"orcamento":"mil reais"}']) loop
    begin
      r := public.dem_abrir('conf86-ana', base || v_ch::jsonb);
      if coalesce((r->>'ok')::boolean, false) then
        falhas := falhas || format('1: dem_abrir aceitou %s', v_ch);
      elsif r->>'erro' = 'REGRA' or coalesce(r->>'regra','') ~* 'invalid input syntax' then
        falhas := falhas || format('1: %s vazou o erro cru do Postgres: %s', v_ch, r::text);
      end if;
    exception when others then
      falhas := falhas || format('1: %s LEVANTOU em vez de devolver erro: %s', v_ch, SQLERRM);
    end;
  end loop;

  r := public.dem_abrir('conf86-ana', base || '{"titulo":"Base boa"}'::jsonb);
  n := (r->>'numero')::int;
  for v_ch in select unnest(array[
      '{"prazo":"amanha"}', '{"prazo":"2026-99-99"}']) loop
    begin
      r := public.dem_mover('conf86-ana', n, 'prazo', v_ch::jsonb);
      if coalesce((r->>'ok')::boolean, false) then
        falhas := falhas || format('1: dem_mover prazo aceitou %s', v_ch);
      elsif coalesce(r->>'regra','') ~* 'invalid input syntax' then
        falhas := falhas || format('1: dem_mover prazo vazou o erro cru: %s', r::text);
      end if;
    exception when others then
      falhas := falhas || format('1: dem_mover prazo %s LEVANTOU: %s', v_ch, SQLERRM);
    end;
  end loop;
  begin
    r := public.dem_mover('conf86-ana', n, 'redirecionar', '{"setor":"x"}'::jsonb);
    if coalesce(r->>'erro','') <> 'SETOR_INVALIDO' then
      falhas := falhas || format('1: redirecionar com setor invalido devolveu %s', r::text);
    end if;
  exception when others then
    falhas := falhas || format('1: redirecionar com setor invalido LEVANTOU: %s', SQLERRM);
  end;
  begin
    r := public.dem_mover('conf86-ana', n, 'comentar', '{"texto":"a","interno":"talvez"}'::jsonb);
    if not coalesce((r->>'ok')::boolean, false) then
      falhas := falhas || format('1: comentar com interno="talvez" devia tratar como falso, e deu %s', r::text);
    end if;
  exception when others then
    falhas := falhas || format('1: comentar com interno="talvez" LEVANTOU: %s', SQLERRM);
  end;

  /* ---- 2 · `prazo` nao apaga sozinho --------------------------------- */
  select prazo into v_d from demandas.demandas where numero = n;
  /* O CORPO TEM QUE TRAZER TEXTO. A primeira versao deste caso mandava `{}`
     puro, e a sabotagem passou despercebida: sem a chave E sem texto, quem
     recusa e o guarda de "sem prazo precisa de motivo", nao este. O `{}` que
     a tela manda de verdade e o do formulario fechado com uma nota digitada,
     e e esse que apagava a data. */
  for v_json in select unnest(array['{}', '{"texto":"so fechei o formulario"}']) loop
    r := public.dem_mover('conf86-ana', n, 'prazo', v_json::jsonb);
    if coalesce((r->>'ok')::boolean, false) then
      falhas := falhas || format('2: `prazo` sem a chave respondeu OK para %s', v_json);
    end if;
    if (select prazo from demandas.demandas where numero = n) is distinct from v_d then
      falhas := falhas || format('2: `prazo` sem a chave APAGOU a data que estava la (%s)', v_json);
    end if;
  end loop;
  r := public.dem_mover('conf86-ana', n, 'prazo', '{"prazo":null}'::jsonb);
  if coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || '2: apagou o prazo sem exigir o motivo'::text;
  elsif r->>'erro' <> 'SEM_PRAZO_PRECISA_MOTIVO' then
    /* `ck_prazo` tambem pega, e devolve "REGRA" com o texto da constraint. Exigir
       o erro com nome e o que separa "o banco recusou" de "o sistema explicou". */
    falhas := falhas || format('2: apagar o prazo sem motivo foi barrado pela CHECK e nao pelo guarda: %s', r::text);
  end if;
  r := public.dem_mover('conf86-ana', n, 'prazo', '{"prazo":null,"texto":"o fornecedor ainda nao respondeu"}'::jsonb);
  if not coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || format('2: apagar o prazo COM motivo foi recusado: %s', r::text);
  end if;
  if (select sem_prazo_porque from demandas.demandas where numero = n)
     <> 'o fornecedor ainda nao respondeu' then
    falhas := falhas || '2: o motivo de nao ter prazo nao foi gravado'::text;
  end if;
  r := public.dem_mover('conf86-ana', n, 'prazo', jsonb_build_object('prazo',(current_date+10)::text));
  if not coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || format('2: por uma data nova parou de funcionar: %s', r::text);
  end if;

  /* ---- 3 · `assumir` com dono ---------------------------------------- */
  r := public.dem_mover('conf86-ana', n, 'assumir', '{}'::jsonb);
  if not coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || format('3: a primeira pessoa nao conseguiu assumir: %s', r::text);
  end if;
  r := public.dem_mover('conf86-bia', n, 'assumir', '{}'::jsonb);
  if coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || '3: a segunda pessoa roubou a demanda sem nenhum aviso'::text;
  elsif r->>'quem' is null then
    falhas := falhas || '3: recusou sem dizer de quem a demanda ja e'::text;
  end if;
  /* e assumir de novo, a propria, continua valendo */
  r := public.dem_mover('conf86-ana', n, 'assumir', '{}'::jsonb);
  if not coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || '3: quem ja e dono nao consegue mais tocar em assumir'::text;
  end if;

  /* ---- 4 · `redirecionar` nao leva a trava --------------------------- */
  perform public.dem_mover('conf86-ana', n, 'travar',
    '{"motivo":"informacao","texto":"esperando o orcamento do fornecedor de Compras"}'::jsonb);
  r := public.dem_mover('conf86-ana', n, 'redirecionar', jsonb_build_object('setor', v_set2));
  if not coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || format('4: redirecionar parou de funcionar: %s', r::text);
  end if;
  select status, coalesce(travada_por,'-') into v_ch, v_json from demandas.demandas where numero = n;
  if v_ch = 'travada' or v_json <> '-' then
    falhas := falhas || format('4: a demanda chegou no setor novo TRAVADA (status=%s, travada_por=%s) '
      'por uma conversa do setor antigo', v_ch, v_json);
  end if;

  /* ---- 5 · `concluir` atrasada exige uma palavra ---------------------- */
  r := public.dem_abrir('conf86-ana', base || '{"titulo":"Vai atrasar"}'::jsonb);
  v_i := (r->>'numero')::int;
  update demandas.demandas set prazo = current_date - 51 where numero = v_i;
  r := public.dem_mover('conf86-ana', v_i, 'concluir', '{"texto":"feito"}'::jsonb);
  if coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || '5: concluiu 51 dias depois do prazo sem uma palavra sobre o atraso'::text;
  end if;
  r := public.dem_mover('conf86-ana', v_i, 'concluir',
        '{"texto":"feito","atraso":"o fornecedor sumiu"}'::jsonb);
  if not coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || format('5: concluir COM o motivo do atraso foi recusado: %s', r::text);
  end if;
  if (select atraso_motivo from demandas.demandas where numero = v_i) <> 'o fornecedor sumiu' then
    falhas := falhas || '5: o motivo do atraso nao foi gravado'::text;
  end if;
  /* e no prazo continua sem pedir nada */
  r := public.dem_abrir('conf86-ana', base || '{"titulo":"No prazo"}'::jsonb);
  v_i := (r->>'numero')::int;
  r := public.dem_mover('conf86-ana', v_i, 'concluir', '{"texto":"feito"}'::jsonb);
  if not coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || format('5: concluir NO PRAZO passou a pedir motivo de atraso: %s', r::text);
  end if;

  /* ---- 6 · orcamento --------------------------------------------------- */
  r := public.dem_abrir('conf86-ana', base || jsonb_build_object('titulo','Sem orcamento','categoria_id', v_cat_orc));
  if coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || '6: a categoria exige orcamento e a demanda nasceu sem'::text;
  end if;
  r := public.dem_abrir('conf86-ana', base || jsonb_build_object('titulo','Negativo','orcamento','-8000'));
  if coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || '6: aceitou uma compra de menos oito mil reais'::text;
  end if;
  r := public.dem_abrir('conf86-ana', base || jsonb_build_object('titulo','Com virgula',
        'categoria_id', v_cat_orc, 'orcamento','1234,56'));
  if not coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || format('6: orcamento com virgula (o teclado brasileiro) foi recusado: %s', r::text);
  end if;
  if (select orcamento from demandas.demandas where numero = (r->>'numero')::int) <> 1234.56 then
    falhas := falhas || '6: o orcamento com virgula nao virou o numero certo'::text;
  end if;

  /* ---- 7 · prazo no passado na abertura ------------------------------- */
  r := public.dem_abrir('conf86-ana', base || jsonb_build_object('titulo','Ja nasce atrasada',
        'prazo', (current_date - 5)::text));
  if coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || '7: a demanda nasceu ja atrasada; a fila de quem atende mente no primeiro dia'::text;
  end if;

  /* ---- 8 · o oraculo de numero --------------------------------------- */
  /* DUAS ARMADILHAS AQUI, E A PRIMEIRA VERSAO DESTE CASO CAIU NAS DUAS.
     1. eu media contra a demanda `n`, que o bloco 4 tinha acabado de
        REDIRECIONAR para o setor da "fora". Ela enxergava, entao `->>'erro'`
        vinha nulo, e a sabotagem passava.
     2. `null <> 'NAO_EXISTE'` e NULO, nao verdadeiro: o `if` nao dispara e a
        assercao vira enfeite. `is distinct from` e o que compara de verdade.
     Por isso o caso usa uma demanda NOVA, que fica no setor de origem. */
  r := public.dem_abrir('conf86-ana', base || '{"titulo":"Demanda alheia para o oraculo"}'::jsonb);
  v_i := (r->>'numero')::int;
  if public.dem_ver('conf86-fora', v_i)->>'ok' = 'true' then
    falhas := falhas || '8: quem e de outro setor ENXERGA a demanda; o caso nao mede oraculo nenhum'::text;
  end if;
  if (public.dem_ver('conf86-fora', v_i)->>'erro') is distinct from 'NAO_EXISTE' then
    falhas := falhas || format('8: dem_ver diferencia demanda alheia de numero vazio: %s',
                               coalesce(public.dem_ver('conf86-fora', v_i)->>'erro','<sem erro>'));
  end if;
  if (public.dem_ver('conf86-fora', 999999)->>'erro') is distinct from 'NAO_EXISTE' then
    falhas := falhas || '8: dem_ver mudou a resposta para numero que nao existe'::text;
  end if;
  if (public.dem_mover('conf86-fora', v_i, 'comentar', '{"texto":"oi"}'::jsonb)->>'erro')
       is distinct from 'NAO_EXISTE' then
    falhas := falhas || '8: dem_mover ainda diferencia alheia de vazia'::text;
  end if;

  /* ---- 9 · o historico olha o que faltava ---------------------------- */
  r := public.dem_abrir('conf86-ana', base || jsonb_build_object('titulo','Para o historico','orcamento','1000'));
  v_i := (r->>'numero')::int;
  update demandas.demandas set orcamento = 9000 where numero = v_i;
  if not exists (select 1 from demandas.eventos e join demandas.demandas d on d.id = e.demanda_id
                  where d.numero = v_i and e.tipo = 'orcamento') then
    falhas := falhas || '9: mudar o orcamento de uma compra nao deixou rastro nenhum'::text;
  end if;
  update demandas.demandas set titulo = 'Titulo trocado' where numero = v_i;
  if not exists (select 1 from demandas.eventos e join demandas.demandas d on d.id = e.demanda_id
                  where d.numero = v_i and e.tipo = 'titulo') then
    falhas := falhas || '9: trocar o titulo nao deixou rastro'::text;
  end if;
  update demandas.demandas set atraso_motivo = 'sumiu' where numero = v_i;
  update demandas.demandas set atraso_motivo = null where numero = v_i;
  if not exists (select 1 from demandas.eventos e join demandas.demandas d on d.id = e.demanda_id
                  where d.numero = v_i and e.tipo = 'atraso') then
    falhas := falhas || '9: apagar o motivo do atraso nao deixou rastro'::text;
  end if;

  /* ---- 10 · teto de texto -------------------------------------------- */
  r := public.dem_mover('conf86-ana', n, 'comentar', jsonb_build_object('texto', repeat('x', 200000)));
  if coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || '10: um comentario de 200 mil letras entrou'::text;
  end if;
  select coalesce(max(length(e.texto)),0) into v_q from demandas.eventos e
    join demandas.demandas d on d.id = e.demanda_id where d.setor_solicitante = v_set;
  if v_q > 4000 then
    falhas := falhas || format('10: o maior evento gravado tem %s letras', v_q);
  end if;
  /* e um comentario de tamanho normal continua entrando */
  r := public.dem_mover('conf86-ana', n, 'comentar', jsonb_build_object('texto', repeat('a', 3000)));
  if not coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || format('10: um comentario de 3 mil letras foi recusado: %s', r::text);
  end if;

  /* ---- 11 · CONTROLE NEGATIVO: o caminho normal inteiro --------------- */
  r := public.dem_abrir('conf86-ana', base || '{"titulo":"Caminho normal completo"}'::jsonb);
  if not coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || format('11: abrir parou de funcionar: %s', r::text);
  end if;
  v_i := (r->>'numero')::int;
  for v_ch, v_json in select * from (values
      ('assumir','{}'), ('comentar','{"texto":"andando"}'),
      ('prioridade','{"prioridade":"alta"}'),
      ('travar','{"motivo":"terceiros","texto":"esperando"}'),
      ('destravar','{"texto":"chegou"}'),
      ('concluir','{"texto":"feito"}'),
      ('reabrir','{"texto":"voltou"}')) x(a,b) loop
    r := public.dem_mover('conf86-ana', v_i, v_ch, v_json::jsonb);
    if not coalesce((r->>'ok')::boolean, false) then
      falhas := falhas || format('11: %s parou de funcionar: %s', v_ch, r::text);
    end if;
  end loop;

  /* ---- 12 · RELATORIO -------------------------------------------------- */
  select count(*) into v_q from demandas.eventos where length(texto) > 4000;
  if v_q > 0 then
    avisos := avisos || format('%s evento(s) ja gravado(s) passam de 4000 letras. A CHECK entrou '
      'NOT VALID: eles continuam la e pesam em toda abertura daquelas fichas.', v_q);
  end if;
  select count(*) into v_q from demandas.demandas where orcamento < 0;
  if v_q > 0 then
    avisos := avisos || format('%s demanda(s) com orcamento negativo, de antes desta migracao.', v_q);
  end if;

  /* ---- desmonta ------------------------------------------------------- */
  delete from demandas.eventos where demanda_id in
    (select id from demandas.demandas where setor_solicitante in (v_set, v_set2));
  delete from demandas.anexos where demanda_id in
    (select id from demandas.demandas where setor_solicitante in (v_set, v_set2));
  delete from demandas.demandas where setor_solicitante in (v_set, v_set2);
  delete from demandas.membros where token like 'conf86-%';
  delete from demandas.categorias where grupo = 'CONF 86';
  delete from demandas.setores where slug in ('conf-86-setor','conf-86-outro');

  foreach v_ch in array avisos loop raise notice '86 · AVISO: %', v_ch; end loop;
  if array_length(falhas, 1) > 0 then
    raise exception E'86 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 86 · conferencia: 12 blocos. Nenhum cast cego vaza o Postgres, prazo nao apaga sozinho, assumir nao rouba, redirecionar nao leva a trava, concluir atrasada pede uma palavra, orcamento e obrigatorio quando a categoria pede e nunca negativo, o numero nao vira oraculo, o historico olha orcamento e titulo, e texto tem teto.';
end $conf$;

insert into schema_versao (n, arquivo)
     values (86, '86-sete-casts-cegos-e-quatro-acoes-que-diziam-ok-sem-fazer-nada.sql')
on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();

commit;
