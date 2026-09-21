do $tranca$begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(84);
  end if;
end
$tranca$;

begin;

create or replace function demandas.limpo(t text) returns text
language sql immutable parallel safe as $fn$
  select nullif(pg_catalog.regexp_replace(
           pg_catalog.regexp_replace(coalesce(t, ''),
             '^[[:space:]  ᠎ -‏    ⁠　﻿]+', ''),
             '[[:space:]  ᠎ -‏    ⁠　﻿]+$', ''), '')
$fn$;

comment on function demandas.limpo(text) is
  'Tira todo espaco de verdade das pontas e devolve nulo se nao sobrou nada. '
  'Usada pelas funcoes dem_* E pelas CHECKs: uma definicao so, porque duas '
  'divergem. Ver a migracao 84.';

alter table demandas.demandas drop constraint if exists ck_conclusao;
alter table demandas.demandas add constraint ck_conclusao
  check (status <> 'concluida' or demandas.limpo(conclusao) is not null) not valid;

alter table demandas.demandas drop constraint if exists ck_cancelada;
alter table demandas.demandas add constraint ck_cancelada
  check (status <> 'cancelada' or demandas.limpo(cancelada_motivo) is not null) not valid;

alter table demandas.demandas drop constraint if exists ck_prazo;
alter table demandas.demandas add constraint ck_prazo
  check (prazo is not null or demandas.limpo(sem_prazo_porque) is not null) not valid;

alter table demandas.demandas drop constraint if exists ck_urgente;
alter table demandas.demandas add constraint ck_urgente
  check (prioridade <> 'urgente' or demandas.limpo(impacto) is not null) not valid;

alter table demandas.demandas drop constraint if exists ck_evento;
alter table demandas.demandas add constraint ck_evento
  check (demandas.limpo(evento) is null or evento_data is not null) not valid;

alter table demandas.demandas drop constraint if exists demandas_titulo_tam_ck;
alter table demandas.demandas add constraint demandas_titulo_tam_ck
  check (length(demandas.limpo(titulo)) between 3 and 200) not valid;

alter table demandas.demandas drop constraint if exists demandas_descricao_tam_ck;
alter table demandas.demandas add constraint demandas_descricao_tam_ck
  check (length(demandas.limpo(descricao)) between 1 and 20000) not valid;

create or replace function demandas.falta_aprovacao(d demandas.demandas)
returns boolean language sql stable as $fn$
  select d.aprovacao = 'pendente'
      or ( d.aprovacao is null
           and d.status not in ('concluida','cancelada')
           and exists (select 1 from demandas.categorias c
                        where c.id = d.categoria_id and c.exige_aprovacao) )
$fn$;

comment on function demandas.falta_aprovacao(demandas.demandas) is
  'O portao de aprovacao, e a unica copia dele. Le a categoria AGORA, nao no '
  'nascimento da demanda: ligar exige_aprovacao numa categoria passa a valer '
  'para as demandas dela que ainda estao vivas. Ver a migracao 84.';

create or replace function public.dem_mover(p_token text, p_numero integer, p_acao text,
                                            p_d jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to 'demandas','public'
as $function$
declare
  m demandas.membros; d demandas.demandas;
  v_txt text := demandas.limpo(p_d->>'texto');
  v_motivo text := coalesce(p_d->>'motivo','');
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

  /* `for update` segura a linha ate o fim da transacao. Quem chegar depois
     espera, e entao rele o estado JA gravado, que e o estado que o guarda de
     JA_FECHADA precisa julgar. Sem isso, duas pessoas agindo no mesmo segundo
     leem a mesma foto antiga e as duas passam. */
  select * into d from demandas.demandas where numero = p_numero for update;

  if d.id is null then return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;
  if not demandas.pode_ver(m, d) then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

  /* ---- 84 · A CURA -----------------------------------------------------
     A linha esta travada. Se o portao esta aberto pela categoria mas a coluna
     nunca soube disso, o banco passa a dizer em voz alta o que a guarda ja
     ia cobrar em silencio. Isso roda ANTES do despacho, e `d` e relido, para
     que as guardas abaixo julguem o estado curado e nao o antigo. */
  if d.aprovacao is null and demandas.falta_aprovacao(d) then
    update demandas.demandas
       set aprovacao = 'pendente',
           status = case when status in ('aberta','execucao') then 'travada' else status end,
           travada_por = case when status in ('aberta','execucao') then 'aprovacao' else travada_por end,
           travada_nota = case when status in ('aberta','execucao')
                               then 'A categoria passou a exigir aprovacao depois que esta demanda foi aberta.'
                               else travada_nota end
     where id = d.id;
    insert into demandas.eventos (demanda_id, membro_id, tipo, para, texto)
      values (d.id, null, 'aprovacao', 'pendente',
              'A categoria passou a exigir aprovacao depois que esta demanda foi aberta.');
    select * into d from demandas.demandas where id = d.id for update;
  end if;

  /* Demanda fechada so aceita comentario, anexo e reabertura. Sem este
     guarda, cancelar uma demanda ja concluida passaria, e o historico ficaria
     contando uma historia que nao aconteceu. */
  if d.status in ('concluida','cancelada')
     and p_acao not in ('comentar','anexar','reabrir') then
    return jsonb_build_object('ok', false, 'erro', 'JA_FECHADA');
  end if;

  if p_acao = 'comentar' then
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'TEXTO_VAZIO'); end if;
    insert into demandas.eventos (demanda_id, membro_id, tipo, texto, interno)
      values (d.id, m.id, 'comentario', v_txt,
              coalesce((p_d->>'interno')::boolean, false) and demandas.pode_atender(m, d));
    update demandas.demandas set mexida_em = now() where id = d.id;

  elsif p_acao = 'anexar' then
    if demandas.limpo(p_d->>'url') is null then
      return jsonb_build_object('ok', false, 'erro', 'URL_VAZIA'); end if;
    insert into demandas.anexos (demanda_id, nome, url, membro_id)
      values (d.id, coalesce(demandas.limpo(p_d->>'nome'),'anexo'), demandas.limpo(p_d->>'url'), m.id);
    insert into demandas.eventos (demanda_id, membro_id, tipo, texto)
      values (d.id, m.id, 'anexo', coalesce(demandas.limpo(p_d->>'nome'),'anexo'));
    update demandas.demandas set mexida_em = now() where id = d.id;

  elsif p_acao = 'assumir' then
    if not demandas.pode_atender(m, d) then return jsonb_build_object('ok', false, 'erro', 'NAO_E_SEU_SETOR'); end if;
    if demandas.falta_aprovacao(d) then return jsonb_build_object('ok', false, 'erro', 'FALTA_APROVACAO'); end if;
    update demandas.demandas
       set responsavel_id = m.id, status = 'execucao', travada_por = null, travada_nota = null
     where id = d.id;

  elsif p_acao = 'travar' then
    if not demandas.pode_atender(m, d) then return jsonb_build_object('ok', false, 'erro', 'NAO_E_SEU_SETOR'); end if;
    if v_motivo not in ('informacao','aprovacao','terceiros') then
      return jsonb_build_object('ok', false, 'erro', 'MOTIVO_INVALIDO'); end if;
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'TEXTO_VAZIO'); end if;
    /* 67 · a trava de aprovacao nao e substituida enquanto a aprovacao esta
       pendente. Deixar o rotulo ser trocado transformava "esperando
       aprovacao" em "esperando terceiros" na tela do gestor, e a fila dele
       deixava de mostrar o que ele precisa decidir. */
    if demandas.falta_aprovacao(d) and v_motivo <> 'aprovacao' then
      return jsonb_build_object('ok', false, 'erro', 'FALTA_APROVACAO'); end if;
    /* ---- 84 · TRAVAR NAO DESFAZ APROVACAO DE QUEM NAO DECIDE -----------
       `travar` gravava 'pendente' por cima de 'aprovada' sem olhar, e quem
       atende nao e quem decide gasto. Devolver ao portao o que ja foi
       aprovado continua possivel; e decisao de gestor. */
    if v_motivo = 'aprovacao' and d.aprovacao = 'aprovada'
       and m.papel not in ('gestor','admin') then
      return jsonb_build_object('ok', false, 'erro', 'SO_GESTOR_REABRE_APROVACAO'); end if;
    update demandas.demandas
       set status = 'travada', travada_por = v_motivo, travada_nota = v_txt,
           aprovacao = case when v_motivo = 'aprovacao' then 'pendente' else aprovacao end,
           /* e quando a aprovacao volta ao portao, o carimbo da decisao
              anterior sai junto: linha que diz "pendente" e "aprovada por
              fulano" ao mesmo tempo envenena qualquer relatorio. */
           aprovada_por = case when v_motivo = 'aprovacao' then null else aprovada_por end,
           aprovada_em  = case when v_motivo = 'aprovacao' then null else aprovada_em end
     where id = d.id;

  elsif p_acao = 'destravar' then
    if not (demandas.pode_atender(m, d) or d.aberta_por = m.id) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    if d.status <> 'travada' then return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_TRAVADA'); end if;
    /* 67 · ERA `d.travada_por = 'aprovacao' and d.aprovacao = 'pendente'`.
       Ler o ROTULO da trava em vez do estado da aprovacao abria uma porta de
       duas acoes. O portao e a APROVACAO; a trava e so como ela aparece na
       tela. */
    if demandas.falta_aprovacao(d) then
      return jsonb_build_object('ok', false, 'erro', 'FALTA_APROVACAO'); end if;
    if v_txt is not null then
      insert into demandas.eventos (demanda_id, membro_id, tipo, texto)
        values (d.id, m.id, 'comentario', v_txt);
    end if;
    update demandas.demandas
       set status = case when responsavel_id is null then 'aberta' else 'execucao' end,
           travada_por = null, travada_nota = null
     where id = d.id;

  elsif p_acao in ('aprovar','rejeitar') then
    if m.papel not in ('gestor','admin') then return jsonb_build_object('ok', false, 'erro', 'SO_GESTOR'); end if;
    /* ---- 84 · A MESMA CONDICAO DAS GUARDAS, E NAO UMA PARECIDA ---------
       Era `d.aprovacao is distinct from 'pendente'`. Com a cura acima isso
       quase nunca diverge, mas "quase nunca" nao e garantia: se `aprovar`
       lesse uma condicao mais estreita que a das guardas, existiria uma
       demanda que nao anda e nao pode ser aprovada. Impasse sem saida pela
       tela e pior que porta aberta, porque ninguem sabe reportar. */
    if not demandas.falta_aprovacao(d) then
      return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_PENDENTE'); end if;
    if p_acao = 'aprovar' then
      update demandas.demandas
         set aprovacao = 'aprovada', aprovada_por = m.id, aprovada_em = now(),
             aprovacao_nota = v_txt,
             status = case when responsavel_id is null then 'aberta' else 'execucao' end,
             travada_por = null, travada_nota = null
       where id = d.id;
    else
      if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'TEXTO_VAZIO'); end if;
      update demandas.demandas
         set aprovacao = 'rejeitada', aprovada_por = m.id, aprovada_em = now(),
             aprovacao_nota = v_txt, status = 'cancelada',
             cancelada_motivo = 'Aprovação recusada: ' || v_txt,
             travada_por = null, travada_nota = null
       where id = d.id;
    end if;

  elsif p_acao = 'prazo' then
    if not demandas.pode_atender(m, d) then return jsonb_build_object('ok', false, 'erro', 'NAO_E_SEU_SETOR'); end if;
    update demandas.demandas set prazo = nullif(p_d->>'prazo','')::date,
      sem_prazo_porque = case when nullif(p_d->>'prazo','') is null
                              then coalesce(v_txt, sem_prazo_porque) else sem_prazo_porque end
     where id = d.id;

  elsif p_acao = 'prioridade' then
    /* "a prioridade nao deve ser definida apenas pelo solicitante" — quem
       atende revisa. */
    if not demandas.pode_atender(m, d) then return jsonb_build_object('ok', false, 'erro', 'NAO_E_SEU_SETOR'); end if;
    if coalesce(p_d->>'prioridade','') not in ('baixa','normal','alta','urgente') then
      return jsonb_build_object('ok', false, 'erro', 'PRIORIDADE_INVALIDA'); end if;
    update demandas.demandas set prioridade = p_d->>'prioridade',
      impacto = case when p_d->>'prioridade' = 'urgente' then coalesce(v_txt, impacto) else impacto end
     where id = d.id;

  elsif p_acao = 'redirecionar' then
    if m.papel not in ('gestor','admin') and not demandas.pode_atender(m, d) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    if not exists (select 1 from demandas.setores
                    where id = nullif(p_d->>'setor','')::uuid and ativo and atende) then
      return jsonb_build_object('ok', false, 'erro', 'SETOR_NAO_ATENDE'); end if;
    update demandas.demandas
       set setor_responsavel = (p_d->>'setor')::uuid, responsavel_id = null,
           status = case when status = 'execucao' then 'aberta' else status end
     where id = d.id;

  elsif p_acao = 'concluir' then
    if not demandas.pode_atender(m, d) then return jsonb_build_object('ok', false, 'erro', 'NAO_E_SEU_SETOR'); end if;
    /* 67 · A LINHA QUE FALTAVA, E ELA E A MAIS CARA DAS QUATRO.
       `assumir` e `destravar` recusavam aprovacao pendente. `concluir` nao
       olhava. Medido: uma compra de R$ 9.000 foi concluida direto, sem passar
       pelo portao, com `aprovada_por = NULL`. */
    if demandas.falta_aprovacao(d) then return jsonb_build_object('ok', false, 'erro', 'FALTA_APROVACAO'); end if;
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'CONCLUSAO_VAZIA'); end if;
    update demandas.demandas
       set status = 'concluida', conclusao = v_txt, concluida_em = now(),
           responsavel_id = coalesce(responsavel_id, m.id),
           travada_por = null, travada_nota = null,
           atraso_motivo = case when prazo is not null and current_date > prazo
                                then demandas.limpo(p_d->>'atraso') else null end
     where id = d.id;

  elsif p_acao = 'cancelar' then
    if not (demandas.pode_atender(m, d) or d.aberta_por = m.id or m.papel in ('gestor','admin')) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'MOTIVO_VAZIO'); end if;
    update demandas.demandas
       set status = 'cancelada', cancelada_motivo = v_txt, travada_por = null, travada_nota = null
     where id = d.id;

  elsif p_acao = 'reabrir' then
    /* "demandas concluidas podem ser reabertas caso o problema nao tenha sido
       resolvido" — e quem julga isso e quem pediu. */
    if not (d.aberta_por = m.id or m.papel in ('gestor','admin') or demandas.pode_atender(m, d)) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    if d.status not in ('concluida','cancelada') then
      return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_FECHADA'); end if;
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'TEXTO_VAZIO'); end if;
    insert into demandas.eventos (demanda_id, membro_id, tipo, texto)
      values (d.id, m.id, 'comentario', v_txt);
    /* 19/09, item 7 · REABRIR NAO DESFAZ UMA RECUSA. `rejeitar` grava
       `rejeitada` E `cancelada`; reabrir devolvia a demanda viva carregando a
       recusa, e nenhum guarda olhava esse valor. Quem podia fazer isso inclui
       a propria pessoa que teve o pedido recusado.
       21/09, migracao 67 · `pendente` cai no mesmo caso: cancelar a propria
       demanda travada no portao e reabrir sao dois toques na tela de quem
       pediu.

       ---- 84 · E O STATUS DEIXA DE SER ESCRITO NA MAO --------------------
       Era `'execucao'` fixo. `destravar` e `aprovar` ja escreviam
       `case when responsavel_id is null then 'aberta' else 'execucao' end`, e
       a terceira copia divergia: reabrir o que nunca teve dono produzia uma
       demanda EM EXECUCAO e SEM NINGUEM, que `acoesDe` nao oferece assumir.
       Inalcancavel pela tela, e parecendo cuidada na lista. */
    update demandas.demandas
       set reaberturas = reaberturas + 1,
           conclusao = null, concluida_em = null, cancelada_motivo = null,
           atraso_motivo = null,
           status = case when d.aprovacao in ('rejeitada','pendente') then 'travada'
                         when responsavel_id is null then 'aberta'
                         else 'execucao' end,
           travada_por = case when d.aprovacao in ('rejeitada','pendente') then 'aprovacao' else null end,
           travada_nota = case when d.aprovacao = 'rejeitada'
                               then 'Reaberta depois de recusada: precisa de aprovação de novo.'
                               when d.aprovacao = 'pendente'
                               then 'Reaberta antes de ser aprovada: continua esperando a aprovação.'
                               else null end,
           aprovacao = case when d.aprovacao in ('rejeitada','pendente') then 'pendente' else aprovacao end,
           aprovada_por = case when d.aprovacao in ('rejeitada','pendente') then null else aprovada_por end,
           aprovada_em = case when d.aprovacao in ('rejeitada','pendente') then null else aprovada_em end
     where id = d.id;

  else
    return jsonb_build_object('ok', false, 'erro', 'ACAO_DESCONHECIDA');
  end if;

  return jsonb_build_object('ok', true);
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
end $function$;

create or replace function public.dem_abrir(p_token text, p_d jsonb)
returns jsonb language plpgsql security definer set search_path to 'demandas','public'
as $function$
declare
  m demandas.membros; c demandas.categorias; v_setor uuid; v_num int; v_id uuid;
  v_prazo date; v_evd date; v_resp uuid; v_status text;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

  select * into c from demandas.categorias where id = (p_d->>'categoria_id')::uuid and ativa;
  if c.id is null then return jsonb_build_object('ok', false, 'erro', 'CATEGORIA_INVALIDA'); end if;

  /* 19/09, item 8: o `coalesce(m.setor_id, v_setor)` da comparacao se
     invertia quando `m.setor_id` era NULO. Sem o coalesce: quem nao e gestor
     abre pelo proprio setor, ponto. */
  v_setor := coalesce(nullif(p_d->>'setor_solicitante','')::uuid, m.setor_id);
  if m.papel not in ('gestor','admin') then v_setor := m.setor_id; end if;
  if v_setor is null then return jsonb_build_object('ok', false, 'erro', 'SEM_SETOR'); end if;

  /* demanda nao nasce enderecada a setor que nao recebe demanda. O caminho
     que isso salva e o do administrador que desativa um setor e esquece que
     uma categoria ainda aponta para ele. */
  v_resp := coalesce(nullif(p_d->>'setor_responsavel','')::uuid, c.setor_id, v_setor);
  if not exists (select 1 from demandas.setores s
                  where s.id = v_resp and s.ativo and s.atende) then
    return jsonb_build_object('ok', false, 'erro', 'SETOR_NAO_ATENDE');
  end if;

  v_prazo := nullif(p_d->>'prazo','')::date;
  v_evd   := nullif(p_d->>'evento_data','')::date;
  v_status := case when c.exige_aprovacao then 'travada' else 'aberta' end;

  insert into demandas.demandas (
    titulo, descricao, objetivo, local, publico,
    categoria_id, setor_solicitante, setor_responsavel,
    prioridade, impacto, prazo, sem_prazo_porque, evento, evento_data, orcamento,
    aberta_por, status, travada_por, travada_nota, aprovacao)
  values (
    demandas.limpo(p_d->>'titulo'), demandas.limpo(p_d->>'descricao'), demandas.limpo(p_d->>'objetivo'),
    demandas.limpo(p_d->>'local'), demandas.limpo(p_d->>'publico'),
    c.id, v_setor, v_resp,
    coalesce(nullif(p_d->>'prioridade',''), 'normal'),
    demandas.limpo(p_d->>'impacto'),
    v_prazo, demandas.limpo(p_d->>'sem_prazo_porque'),
    demandas.limpo(p_d->>'evento'), v_evd,
    nullif(p_d->>'orcamento','')::numeric,
    m.id, v_status,
    case when c.exige_aprovacao then 'aprovacao' else null end,
    case when c.exige_aprovacao
         then 'Esta categoria exige aprovação antes da execução.' else null end,
    case when c.exige_aprovacao then 'pendente' else null end)
  returning id, numero into v_id, v_num;

  /* 84 · `para` era 'aberta' fixo. Agora diz o estado em que a demanda
     realmente nasceu. */
  insert into demandas.eventos (demanda_id, membro_id, tipo, para, texto)
    values (v_id, m.id, 'abertura', v_status, null);

  if jsonb_typeof(p_d->'anexos') = 'array' then
    insert into demandas.anexos (demanda_id, nome, url, membro_id)
      select v_id, coalesce(demandas.limpo(a->>'nome'), 'anexo'), demandas.limpo(a->>'url'), m.id
        from jsonb_array_elements(p_d->'anexos') a
       where demandas.limpo(a->>'url') is not null;
  end if;

  /* UM contato do setor que vai atender, e so: devolver a lista inteira de
     telefones seria expor agenda sem necessidade. */
  return jsonb_build_object('ok', true, 'numero', v_num,
    'precisa_aprovacao', c.exige_aprovacao,
    'setor_responsavel', (select s.nome from demandas.setores s where s.id = v_resp),
    'contato', (select jsonb_build_object('nome', x.nome, 'telefone', x.telefone)
                  from demandas.membros x
                 where x.ativo and x.telefone is not null
                   and x.setor_id = v_resp
                 order by case x.papel when 'responsavel' then 0 when 'gestor' then 1
                                       when 'admin' then 2 else 3 end, x.nome
                 limit 1));
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
  when not_null_violation then
    return jsonb_build_object('ok', false, 'erro', 'FALTA_CAMPO', 'regra', SQLERRM);
  when foreign_key_violation then
    return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
end $function$;

do $cura$declare v_n int;
begin
  with alvo as (
    select d.id, d.status from demandas.demandas d
      join demandas.categorias c on c.id = d.categoria_id
     where d.aprovacao is null and c.exige_aprovacao
       and d.status not in ('concluida','cancelada')
     for update of d
  ), mexeu as (
    update demandas.demandas x
       set aprovacao = 'pendente',
           status = case when x.status in ('aberta','execucao') then 'travada' else x.status end,
           travada_por = case when x.status in ('aberta','execucao') then 'aprovacao' else x.travada_por end,
           travada_nota = case when x.status in ('aberta','execucao')
                               then 'A categoria passou a exigir aprovacao depois que esta demanda foi aberta.'
                               else x.travada_nota end
      from alvo where alvo.id = x.id returning x.id
  )
  select count(*) into v_n from mexeu;

  insert into demandas.eventos (demanda_id, membro_id, tipo, para, texto)
    select d.id, null, 'aprovacao', 'pendente',
           'A categoria passou a exigir aprovacao depois que esta demanda foi aberta.'
      from demandas.demandas d
     where d.aprovacao = 'pendente' and d.travada_nota =
           'A categoria passou a exigir aprovacao depois que esta demanda foi aberta.'
       and not exists (select 1 from demandas.eventos e
                        where e.demanda_id = d.id and e.tipo = 'aprovacao' and e.membro_id is null);

  raise notice '84 · cura: % demanda(s) viva(s) estavam fora do portao e voltaram para ele.', v_n;
end
$cura$;

do $conf$declare
  falhas text[] := '{}'; avisos text[] := '{}';
  v_set uuid; v_set2 uuid; v_cat_livre uuid; v_cat_exige uuid;
  v_ana uuid; v_ges uuid; v_eva uuid;
  r jsonb; n int; n2 int;
  v_st text; v_ap text; v_apor uuid; v_txt text; v_resp uuid;
  v_i int; v_ch text; v_esp boolean; v_deu boolean;
  ESPACOS text[] := array[' ', chr(9), chr(10), chr(13), chr(12), chr(11), chr(160),
                          chr(8203), chr(65279), chr(8232), chr(12288), chr(8239),
                          chr(5760), chr(6158), chr(8288)];
  base jsonb;

begin

  insert into demandas.setores (nome, slug, ativo, atende, ordem)
    values ('CONF 84 setor', 'conf-84-setor', true, true, 90) returning id into v_set;
  insert into demandas.setores (nome, slug, ativo, atende, ordem)
    values ('CONF 84 fora', 'conf-84-fora', true, true, 91) returning id into v_set2;
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, ativa)
    values ('CONF 84', 'livre', v_set, false, true) returning id into v_cat_livre;
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, ativa)
    values ('CONF 84', 'exige', v_set, true, true) returning id into v_cat_exige;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('CONF Ana', 'conf84-ana', 'responsavel', v_set, true) returning id into v_ana;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('CONF Gestor', 'conf84-ges', 'gestor', v_set, true) returning id into v_ges;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('CONF Eva', 'conf84-eva', 'solicitante', v_set, true) returning id into v_eva;

  base := jsonb_build_object('descricao','Pedido da conferencia da migracao 84.',
                             'setor_solicitante', v_set, 'prazo', (current_date + 30)::text);

  for v_i in 1 .. array_length(ESPACOS, 1) loop
    if demandas.limpo(ESPACOS[v_i]) is not null then
      falhas := falhas || format('1: limpo() deixou passar o caractere U+%s como se fosse texto',
                                 to_hex(ascii(ESPACOS[v_i])));
    end if;
  end loop;
  if demandas.limpo(array_to_string(ESPACOS,'')) is not null then
    falhas := falhas || '1: limpo() deixou passar a mistura de todos os espacos'::text;
  end if;
  if demandas.limpo('  comprei o projetor  ') <> 'comprei o projetor' then
    falhas := falhas || '1: limpo() estragou texto de verdade'::text;
  end if;
  if demandas.limpo('a' || chr(160) || 'b') <> 'a' || chr(160) || 'b' then
    falhas := falhas || '1: limpo() mexeu no MIOLO do texto; ela so apara as pontas'::text;
  end if;

  r := public.dem_abrir('conf84-ana', base || jsonb_build_object('titulo','Conferencia dois','categoria_id', v_cat_livre));
  n := (r->>'numero')::int;
  for v_i in 1 .. array_length(ESPACOS, 1) loop
    r := public.dem_mover('conf84-ana', n, 'concluir', jsonb_build_object('texto', ESPACOS[v_i]));
    if coalesce((r->>'ok')::boolean, false) then
      falhas := falhas || format('2: concluir aceitou U+%s como conclusao escrita',
                                 to_hex(ascii(ESPACOS[v_i])));
    end if;
  end loop;
  select status into v_st from demandas.demandas where numero = n;
  if v_st = 'concluida' then falhas := falhas || '2: a demanda foi concluida por um espaco'::text; end if;

  begin
    update demandas.demandas set status = 'concluida', conclusao = chr(160) where numero = n;
    falhas := falhas || '2: ck_conclusao aceitou NBSP por SQL direto. A regra nao e do banco, e da tela.'::text;
    update demandas.demandas set status = 'aberta', conclusao = null where numero = n;
  exception when check_violation then null; end;

  r := public.dem_abrir('conf84-ana', base || jsonb_build_object('titulo','Compra que escapava','categoria_id', v_cat_livre));
  n := (r->>'numero')::int;
  select aprovacao into v_ap from demandas.demandas where numero = n;
  if v_ap is not null then falhas := falhas || '3: a demanda da categoria livre nasceu com aprovacao nao-nula'::text; end if;

  update demandas.categorias set exige_aprovacao = true where id = v_cat_livre;

  r := public.dem_mover('conf84-ana', n, 'concluir', '{"texto":"comprado"}'::jsonb);
  if coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || '3: CONCLUIR FECHOU O GASTO com a categoria exigindo aprovacao. O portao nao existe.'::text;
  elsif r->>'erro' <> 'FALTA_APROVACAO' then
    falhas := falhas || format('3: concluir recusou, mas pelo motivo errado: %s', r->>'erro');
  end if;
  select status, aprovacao, travada_por into v_st, v_ap, v_txt from demandas.demandas where numero = n;
  if v_ap <> 'pendente' or v_st <> 'travada' or v_txt <> 'aprovacao' then
    falhas := falhas || format('3: a cura nao gravou o estado: status=%s aprovacao=%s travada_por=%s',
                               v_st, coalesce(v_ap,'NULL'), coalesce(v_txt,'NULL'));
  end if;
  if not exists (select 1 from demandas.eventos e join demandas.demandas d on d.id = e.demanda_id
                  where d.numero = n and e.tipo = 'aprovacao' and e.membro_id is null) then
    falhas := falhas || '3: a cura nao deixou rastro no historico'::text;
  end if;

  for v_ch in select unnest(array['assumir','destravar']) loop
    r := public.dem_mover('conf84-ana', n, v_ch, '{"texto":"vamos la"}'::jsonb);
    if coalesce((r->>'ok')::boolean, false) then
      falhas := falhas || format('3: %s passou pelo portao', v_ch);
    end if;
  end loop;

  r := public.dem_mover('conf84-ges', n, 'aprovar', '{"texto":"autorizado"}'::jsonb);
  if not coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || format('4: IMPASSE. A demanda nao anda e o gestor nao consegue aprovar: %s', r::text);
  end if;
  r := public.dem_mover('conf84-ana', n, 'concluir', '{"texto":"comprado, com aprovacao"}'::jsonb);
  if not coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || format('4: depois de aprovada, concluir ainda recusa: %s', r::text);
  end if;
  update demandas.categorias set exige_aprovacao = false where id = v_cat_livre;

  r := public.dem_abrir('conf84-ana', base || jsonb_build_object('titulo','Buffet do Follow','categoria_id', v_cat_exige));
  n := (r->>'numero')::int;
  perform public.dem_mover('conf84-ges', n, 'aprovar', '{"texto":"ok"}'::jsonb);
  r := public.dem_mover('conf84-ana', n, 'travar', '{"motivo":"aprovacao","texto":"quero rever"}'::jsonb);
  if coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || '5: quem atende desfez a decisao do gestor e devolveu a demanda ao portao'::text;
  end if;
  select aprovacao, aprovada_por into v_ap, v_apor from demandas.demandas where numero = n;
  if v_ap <> 'aprovada' or v_apor is null then
    falhas := falhas || format('5: a aprovacao foi corrompida mesmo com a recusa: aprovacao=%s', coalesce(v_ap,'NULL'));
  end if;

  r := public.dem_mover('conf84-ges', n, 'travar', '{"motivo":"aprovacao","texto":"mudou o valor, quero rever"}'::jsonb);
  if not coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || format('5: o gestor NAO conseguiu devolver ao portao: %s', r::text);
  end if;
  select aprovacao, aprovada_por into v_ap, v_apor from demandas.demandas where numero = n;
  if v_ap <> 'pendente' then falhas := falhas || '5: o gestor travou e a aprovacao nao voltou a pendente'::text; end if;
  if v_apor is not null then
    falhas := falhas || '5: a linha ficou dizendo "pendente" e "aprovada por fulano" ao mesmo tempo'::text;
  end if;

  r := public.dem_mover('conf84-ana', n, 'travar', '{"motivo":"terceiros","texto":"esperando o fornecedor"}'::jsonb);
  if coalesce((r->>'ok')::boolean, false) then
    falhas := falhas || '5: trocar o rotulo da trava escondeu do gestor o que ele precisa decidir'::text;
  end if;

  r := public.dem_abrir('conf84-ana', base || jsonb_build_object('titulo','Trocar lampada','categoria_id', v_cat_livre));
  n := (r->>'numero')::int;
  perform public.dem_mover('conf84-ana', n, 'cancelar', '{"texto":"nao precisa mais"}'::jsonb);
  perform public.dem_mover('conf84-ana', n, 'reabrir', '{"texto":"precisa sim"}'::jsonb);
  select status, responsavel_id into v_st, v_resp from demandas.demandas where numero = n;
  if v_st = 'execucao' and v_resp is null then
    falhas := falhas || '6: reabriu EM EXECUCAO e SEM NINGUEM. A tela nao oferece assumir; a demanda fica inalcancavel.'::text;
  end if;
  if v_st <> 'aberta' then
    falhas := falhas || format('6: reabrir sem dono devia voltar para aberta, e voltou para %s', v_st);
  end if;

  perform public.dem_mover('conf84-ana', n, 'assumir', '{}'::jsonb);
  perform public.dem_mover('conf84-ana', n, 'concluir', '{"texto":"trocada"}'::jsonb);
  perform public.dem_mover('conf84-ana', n, 'reabrir', '{"texto":"queimou de novo"}'::jsonb);
  select status into v_st from demandas.demandas where numero = n;
  if v_st <> 'execucao' then
    falhas := falhas || format('6: reabrir COM dono devia voltar para execucao, e voltou para %s', v_st);
  end if;

  r := public.dem_abrir('conf84-ana', base || jsonb_build_object('titulo','Nasce travada','categoria_id', v_cat_exige));
  n := (r->>'numero')::int;
  select e.para into v_txt from demandas.eventos e join demandas.demandas d on d.id = e.demanda_id
   where d.numero = n and e.tipo = 'abertura';
  if v_txt <> 'travada' then
    falhas := falhas || format('7: a demanda nasceu travada e o historico abriu dizendo "%s"', v_txt);
  end if;

  r := public.dem_abrir('conf84-ana', base || jsonb_build_object('titulo','Caminho normal','categoria_id', v_cat_livre));
  n2 := (r->>'numero')::int;
  if not coalesce((r->>'ok')::boolean, false) then falhas := falhas || '8: abrir parou de funcionar'::text; end if;
  for v_ch, v_txt in select * from (values ('assumir','{}'), ('comentar','{"texto":"andando"}'),
                                           ('prioridade','{"prioridade":"alta"}'),
                                           ('concluir','{"texto":"feito"}')) x(a,b) loop
    r := public.dem_mover('conf84-ana', n2, v_ch, v_txt::jsonb);
    if not coalesce((r->>'ok')::boolean, false) then
      falhas := falhas || format('8: %s parou de funcionar no caminho normal: %s', v_ch, r::text);
    end if;
  end loop;
  select status, conclusao into v_st, v_txt from demandas.demandas where numero = n2;
  if v_st <> 'concluida' or v_txt <> 'feito' then
    falhas := falhas || '8: o caminho normal nao chegou em concluida com o texto certo'::text;
  end if;

  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('CONF Bruno', 'conf84-bru', 'responsavel', v_set2, true);
  if public.dem_ver('conf84-bru', n2)->>'erro' is null then
    falhas := falhas || '9: quem e de outro setor passou a enxergar a demanda'::text;
  end if;

  select count(*) into v_i from demandas.demandas
   where (status = 'concluida' and demandas.limpo(conclusao) is null)
      or (status = 'cancelada' and demandas.limpo(cancelada_motivo) is null);
  if v_i > 0 then
    avisos := avisos || format('%s demanda(s) fechada(s) com texto so de espaco, de antes desta migracao. '
      'As CHECKs entraram como NOT VALID de proposito: a regra vale do agora em diante.', v_i);
  end if;

  delete from demandas.eventos where demanda_id in
    (select id from demandas.demandas where setor_solicitante in (v_set, v_set2));
  delete from demandas.anexos where demanda_id in
    (select id from demandas.demandas where setor_solicitante in (v_set, v_set2));
  delete from demandas.demandas where setor_solicitante in (v_set, v_set2);
  delete from demandas.membros where token like 'conf84-%';
  delete from demandas.categorias where grupo = 'CONF 84';
  delete from demandas.setores where id in (v_set, v_set2);

  foreach v_ch in array avisos loop raise notice '84 · AVISO: %', v_ch; end loop;
  if array_length(falhas, 1) > 0 then
    raise exception E'84 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 84 · conferencia: 10 blocos. O portao le a categoria agora, espaco nao passa por texto nas funcoes NEM nas CHECKs, travar nao desfaz decisao de gestor, reabrir nao nasce orfa.';
end
$conf$;

insert into schema_versao (n, arquivo)
  values (84, '84-o-portao-congelava-no-nascimento-e-um-tab-passava-por-texto.sql')
  on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();

commit;
