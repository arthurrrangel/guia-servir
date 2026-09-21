/* =============================================================================
   67 · O PORTÃO DE APROVAÇÃO TINHA TRÊS PORTAS DOS FUNDOS

   21/09/2026. Só de Demandas. Depende da 52.

   -------------------------------------------------------------------------
   A FRASE QUE A 52 ESCREVEU, E O QUE FALTOU CUMPRIR

   O cabeçalho do item 7 da migração 52 diz:

       "O portão de aprovação É o controle de gasto; ele não pode ter uma
        porta dos fundos."

   E fechou uma: `reabrir` sobre demanda RECUSADA. Sobraram três, e todas
   terminam no mesmo lugar — gasto concluído com `aprovada_por = NULL`.

   -------------------------------------------------------------------------
   AS TRÊS, MEDIDAS — NÃO DEDUZIDAS

   Auditoria de 21/09/2026, contra o banco de `scripts/demandas-banco.sh`
   com as quatro migrações aplicadas. As três passam pelos 62 casos da suíte,
   que estavam todos verdes.

   1. `concluir` NUNCA OLHOU O PORTÃO. Uma ação, sem truque nenhum:

        "Comprar projetor", R$ 9.000, categoria com exige_aprovacao
        nasceu:  travada / aprovacao / pendente
        Jander (responsável de Compras) -> concluir
          {"ok": true}
          status=concluida | aprovacao=pendente | aprovada_por=NULL

      `assumir` recusa com FALTA_APROVACAO. `destravar` recusa. `concluir` só
      conferia `pode_atender`. E ele nem exige assumir antes, porque preenche
      `responsavel_id` sozinho.

   2. CANCELAR + REABRIR, os dois botões de quem pediu:

        nasceu:                        travada/aprovacao/pendente
        Pedro destrava por fora:       FALTA_APROVACAO   <- o guarda funciona
        Pedro CANCELA (é o dono):      ok -> cancelada
        Pedro REABRE:                  ok -> EXECUCAO, aprovacao=pendente
        e a fila de Compras mostra a demanda como trabalho normal.

      A 52 tratou `aprovacao = 'rejeitada'` no `reabrir` e deixou `'pendente'`
      cair no `else`, que manda para `execucao`.

   3. TRAVAR POR CIMA DE TRAVAR apaga a trava de aprovação:

        nasceu:                              travada/aprovacao/pendente
        re-travar com motivo 'terceiros':    ok -> travada/TERCEIROS/pendente
        Pedro (só pediu) destrava:           ok -> aberta
        concluir:                            ok -> concluida, aprovada_por=NULL

      O guarda do `destravar` lia `d.travada_por = 'aprovacao'`, que é o
      RÓTULO da trava; e `travar` grava esse rótulo sem condição nenhuma.

   -------------------------------------------------------------------------
   A CORREÇÃO É UMA SÓ, DITA QUATRO VEZES

   As quatro condições passam a ler a MESMA coisa, que é a única que importa:

       aprovacao = 'pendente'

   · `destravar` para de ler `travada_por` e lê a aprovação;
   · `concluir` ganha o guarda que nunca teve;
   · `travar` não substitui a trava de aprovação enquanto ela vale (o guarda
     do destravar já não depende disso, mas trocar o rótulo tirava a demanda
     da fila do gestor: ele deixava de ver o que precisa decidir);
   · `reabrir` trata `'pendente'` como trata `'rejeitada'` — volta AO PORTÃO,
     não à execução.

   -------------------------------------------------------------------------
   O QUE FICA, E ESTÁ ESCRITO EM VEZ DE ESCONDIDO

   Uma demanda ainda pode ser CANCELADA com a aprovação pendente: quem pediu
   desistiu, e isso é legítimo. Ela fica para sempre com `aprovacao =
   'pendente'`, porque não existe valor para "retirado antes de decidir"
   (`ck_aprovacao` aceita pendente, aprovada, rejeitada) e inventar um seria
   reescrever o histórico de quatro demandas que já existem.

   O que NÃO pode é o painel contar isso como fila do gestor. Medido: quatro
   demandas encerradas apareciam como "4 esperam a sua aprovação", nenhuma
   abrível (`JA_FECHADA` barra `aprovar` e `rejeitar` em demanda fechada, e
   com razão). O contador nunca zerava. A conta passa a olhar só demanda VIVA,
   em `app/demandas/page.tsx`, no mesmo commit.

   -------------------------------------------------------------------------
   § 2 · E A AGENDA DA IGREJA INTEIRA, QUE IA JUNTO E NINGUÉM USAVA

   Achado da mesma auditoria, assunto diferente, e entra aqui porque são duas
   linhas e o mesmo módulo. `dem_bases` devolvia, para todo `responsavel`,
   `gestor` e `admin`, a lista COMPLETA de membros com nome, telefone, papel e
   setor. Medido: Monik, responsável de Comunicação, recebia os oito.

   E nenhuma tela lê esse campo. As três que chamam `bases()` guardam
   `membros` no estado e nunca o usam; a lista de gente da tela de Ajustes vem
   de `dem_pessoas`, que é SÓ_ADMIN. Era carga morta que vazava agenda.

   A própria 50 escreveu a regra contrária, em `dem_abrir`: "Devolver a lista
   inteira de telefones seria expor agenda sem necessidade — aqui vai um nome
   e um número, para este pedido."
   ============================================================================= */


-- =========================================================================
-- `dem_mover` com as quatro condições lendo a mesma coisa.
-- Corpo extraído do banco (versão da migração 52); nada foi removido.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.dem_mover(p_token text, p_numero integer, p_acao text, p_d jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'demandas', 'public'
AS $function$
declare
  m demandas.membros; d demandas.demandas;
  v_txt text := nullif(btrim(coalesce(p_d->>'texto','')),'');
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

  /* ---- a única mudança desta migração nesta função ----------------------
     `for update` segura a linha até o fim da transação. Quem chegar depois
     espera, e então relê o estado JÁ gravado — que é o estado que o guarda
     de JA_FECHADA precisa julgar. Sem isso, duas pessoas agindo no mesmo
     segundo leem a mesma foto antiga e as duas passam. */
  select * into d from demandas.demandas where numero = p_numero for update;

  if d.id is null then return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;
  if not demandas.pode_ver(m, d) then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

  /* Demanda fechada só aceita comentário, anexo e reabertura. Sem este
     guarda, cancelar uma demanda já concluída passaria — e o histórico
     ficaria contando uma história que não aconteceu. */
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
    if nullif(btrim(coalesce(p_d->>'url','')),'') is null then
      return jsonb_build_object('ok', false, 'erro', 'URL_VAZIA'); end if;
    insert into demandas.anexos (demanda_id, nome, url, membro_id)
      values (d.id, coalesce(nullif(btrim(p_d->>'nome'),''),'anexo'), btrim(p_d->>'url'), m.id);
    insert into demandas.eventos (demanda_id, membro_id, tipo, texto)
      values (d.id, m.id, 'anexo', coalesce(nullif(btrim(p_d->>'nome'),''),'anexo'));
    update demandas.demandas set mexida_em = now() where id = d.id;

  elsif p_acao = 'assumir' then
    if not demandas.pode_atender(m, d) then return jsonb_build_object('ok', false, 'erro', 'NAO_E_SEU_SETOR'); end if;
    if d.aprovacao = 'pendente' then return jsonb_build_object('ok', false, 'erro', 'FALTA_APROVACAO'); end if;
    update demandas.demandas
       set responsavel_id = m.id, status = 'execucao', travada_por = null, travada_nota = null
     where id = d.id;

  elsif p_acao = 'travar' then
    if not demandas.pode_atender(m, d) then return jsonb_build_object('ok', false, 'erro', 'NAO_E_SEU_SETOR'); end if;
    if coalesce(p_d->>'motivo','') not in ('informacao','aprovacao','terceiros') then
      return jsonb_build_object('ok', false, 'erro', 'MOTIVO_INVALIDO'); end if;
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'TEXTO_VAZIO'); end if;
    /* 67 · a trava de aprovação não é substituída enquanto a aprovação está
       pendente. O guarda do `destravar` logo acima já não depende mais disso,
       mas deixar o rótulo ser trocado transformava "esperando aprovação" em
       "esperando terceiros" na tela do gestor — e a fila dele deixava de
       mostrar o que ele precisa decidir. Quem quiser registrar o outro motivo
       tem o comentário. */
    if d.aprovacao = 'pendente' and coalesce(p_d->>'motivo','') <> 'aprovacao' then
      return jsonb_build_object('ok', false, 'erro', 'FALTA_APROVACAO'); end if;
    update demandas.demandas
       set status = 'travada', travada_por = p_d->>'motivo', travada_nota = v_txt,
           aprovacao = case when p_d->>'motivo' = 'aprovacao' then 'pendente' else aprovacao end
     where id = d.id;

  elsif p_acao = 'destravar' then
    if not (demandas.pode_atender(m, d) or d.aberta_por = m.id) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    if d.status <> 'travada' then return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_TRAVADA'); end if;
    /* 67 · ERA `d.travada_por = 'aprovacao' and d.aprovacao = 'pendente'`.
       Ler o RÓTULO da trava em vez do estado da aprovação abria uma porta de
       duas ações: `travar` grava `travada_por` sem condição nenhuma, então
       re-travar a mesma demanda com motivo 'terceiros' apagava a trava de
       aprovação, e aí este guarda deixava de casar. O portão é a APROVAÇÃO;
       a trava é só como ela aparece na tela. */
    if d.aprovacao = 'pendente' then
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
    if d.aprovacao is distinct from 'pendente' then
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
    /* "a prioridade não deve ser definida apenas pelo solicitante" — quem
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
    /* 67 · A LINHA QUE FALTAVA, E ELA É A MAIS CARA DAS QUATRO.
       `assumir` e `destravar` recusavam aprovação pendente. `concluir` não
       olhava. Medido: uma compra de R$ 9.000 foi concluída direto, sem passar
       pelo portão, com `aprovada_por = NULL`. Quem atende não precisava nem
       assumir antes — `concluir` preenche `responsavel_id` sozinho. */
    if d.aprovacao = 'pendente' then return jsonb_build_object('ok', false, 'erro', 'FALTA_APROVACAO'); end if;
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'CONCLUSAO_VAZIA'); end if;
    update demandas.demandas
       set status = 'concluida', conclusao = v_txt, concluida_em = now(),
           responsavel_id = coalesce(responsavel_id, m.id),
           travada_por = null, travada_nota = null,
           atraso_motivo = case when prazo is not null and current_date > prazo
                                then nullif(btrim(coalesce(p_d->>'atraso','')),'') else null end
     where id = d.id;

  elsif p_acao = 'cancelar' then
    if not (demandas.pode_atender(m, d) or d.aberta_por = m.id or m.papel in ('gestor','admin')) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'MOTIVO_VAZIO'); end if;
    update demandas.demandas
       set status = 'cancelada', cancelada_motivo = v_txt, travada_por = null, travada_nota = null
     where id = d.id;

  elsif p_acao = 'reabrir' then
    /* "demandas concluídas podem ser reabertas caso o problema não tenha sido
       resolvido" — e quem julga isso é quem pediu. */
    if not (d.aberta_por = m.id or m.papel in ('gestor','admin') or demandas.pode_atender(m, d)) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    if d.status not in ('concluida','cancelada') then
      return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_FECHADA'); end if;
    if v_txt is null then return jsonb_build_object('ok', false, 'erro', 'TEXTO_VAZIO'); end if;
    insert into demandas.eventos (demanda_id, membro_id, tipo, texto)
      values (d.id, m.id, 'comentario', v_txt);
    /* ---- 19/09/2026, item 7: REABRIR NÃO PODE DESFAZER UMA RECUSA -------

       `rejeitar` grava `aprovacao = 'rejeitada'` E `status = 'cancelada'`.
       `reabrir` aceita qualquer demanda fechada — cancelada inclusive — e
       punha `status = 'execucao'` sem tocar em `aprovacao`. A demanda voltava
       viva carregando `aprovacao = 'rejeitada'`, e nenhum guarda olhava para
       esse valor: `assumir` só recusa `'pendente'`, `destravar` idem.

       Quem podia fazer isso inclui `d.aberta_por = m.id` — ou seja, a própria
       pessoa que teve o pedido recusado. Numa categoria com `exige_aprovacao`
       (é o caso de compra), a liderança recusava o gasto e o solicitante
       devolvia a demanda para a fila de Compras como trabalho aprovado. O
       portão de aprovação É o controle de gasto; ele não pode ter uma porta
       dos fundos.

       Reabrir continua valendo, porque o motivo dele é legítimo. O que muda é
       que reabrir o que foi RECUSADO devolve a demanda AO PORTÃO, não à
       execução: a liderança decide de novo, com o texto da reabertura à
       vista. Reabrir o que foi concluído, ou cancelado sem recusa, segue
       exatamente como era.

       ---- 21/09/2026, migração 67: `pendente` CAI NO MESMO CASO -----------

       A 52 fechou a porta do `rejeitada` e deixou a do `pendente` aberta, e
       ela é mais curta: quem pediu CANCELA a própria demanda travada no
       portão e REABRE. Dois toques, os dois botões na tela dele
       (`lib/demandas/regras.ts:259` e `:238`), e a demanda voltava a
       `execucao` carregando `aprovacao = 'pendente'` — de onde `concluir`,
       que não olhava o portão, fechava a compra.

       As quatro condições deste arquivo passam a ler a MESMA coisa, que é a
       única que importa: `aprovacao = 'pendente'`. */
    update demandas.demandas
       set reaberturas = reaberturas + 1,
           conclusao = null, concluida_em = null, cancelada_motivo = null,
           atraso_motivo = null,
           status = case when d.aprovacao in ('rejeitada','pendente') then 'travada' else 'execucao' end,
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

-- =========================================================================
-- § 2 · `dem_bases` para de entregar a agenda
-- =========================================================================

/* `p_token` mantém o DEFAULT que ela já tinha: um `create or replace` que o
   remove é recusado pelo Postgres ("cannot remove parameter defaults"), e
   dropar para recriar apagaria os GRANTs num momento em que a tela está no ar. */
create or replace function public.dem_bases(p_token text default null)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare m demandas.membros;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  return jsonb_build_object('ok', true,
    'setores', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'nome', s.nome, 'slug', s.slug, 'atende', s.atende) order by s.ordem, s.nome)
      from demandas.setores s where s.ativo), '[]'::jsonb),
    'categorias', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'grupo', c.grupo, 'nome', c.nome, 'setor_id', c.setor_id,
        'exige_aprovacao', c.exige_aprovacao, 'exige_orcamento', c.exige_orcamento,
        'prazo_padrao_dias', c.prazo_padrao_dias) order by c.ordem, c.grupo, c.nome)
      from demandas.categorias c where c.ativa), '[]'::jsonb));
  /* 67 · A CHAVE `membros` SAIU.
     Ela trazia nome, telefone, papel e setor de TODO MUNDO para qualquer
     responsavel. Nenhuma tela lia (a lista de gente dos Ajustes vem de
     `dem_pessoas`, que e SO_ADMIN), entao isto nao quebra nada — e o tipo
     `Bases` em lib/demandas/tipos.ts perdeu o campo no mesmo commit, para o
     tsc cobrar quem tentar voltar a ler. */
end $fn$;

revoke all on function public.dem_bases(text) from public;
grant execute on function public.dem_bases(text) to anon, authenticated;
comment on function public.dem_bases(text) is
  'Setores e categorias ativos, para os formularios. Desde a 67 NAO devolve mais a lista de membros: ela ia para todo responsavel com nome e telefone de todo mundo, e nenhuma tela lia.';


revoke all on function public.dem_mover(text, integer, text, jsonb) from public;
grant execute on function public.dem_mover(text, integer, text, jsonb) to anon, authenticated;
comment on function public.dem_mover(text, integer, text, jsonb) is
  'Toda acao sobre uma demanda. Desde a 67 as quatro guardas do portao de aprovacao leem a MESMA condicao (aprovacao = pendente) em vez de quatro condicoes diferentes: concluir passou a olhar o portao, travar nao apaga a trava de aprovacao, destravar deixou de ler o rotulo da trava, e reabrir devolve ao portao tambem o que estava pendente.';


-- =========================================================================
-- REGISTRO NA RÉGUA E NA SONDA
-- =========================================================================

do $reg$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (67, '67 · concluir olha o portao de aprovacao', 'dem_mover',
           'A LINHA QUE FALTAVA'),
      (67, '67 · reabrir devolve ao portao o que estava pendente', 'dem_mover',
           'in (''rejeitada'',''pendente'')'),
      (67, '67 · dem_bases nao entrega mais a agenda', 'dem_bases',
           'A CHAVE `membros` SAIU')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;

  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo)
      values (67, '67-o-portao-de-aprovacao-tinha-tres-portas-dos-fundos.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;


-- =========================================================================
-- A CONFERÊNCIA
--
-- Anda as três portas dos fundos, uma por uma, e cobra que cada uma esteja
-- fechada. Depois anda o caminho certo inteiro — pedir, aprovar, assumir,
-- concluir — e cobra que ele siga funcionando: guarda que tranca o caminho
-- de quem tem razão não é guarda, é defeito novo.
--
-- Catálogo não serve aqui: as quatro condições estavam escritas, legíveis, e
-- três delas pareciam certas sozinhas. O defeito é que liam coisas
-- diferentes.
-- =========================================================================

do $conf$
declare
  v_sec uuid; v_cpr uuid; v_cat uuid; v_num int; v_r jsonb;
  v_ped text := 'tk-conf67-ped'; v_res text := 'tk-conf67-res'; v_ges text := 'tk-conf67-ges';
  v_st text; v_apr text; v_por uuid;
  ok int := 0; falhou int := 0; msg text := '';

begin
  select id into v_sec from demandas.setores where slug = 'jovens';
  select id into v_cpr from demandas.setores where slug = 'compras';
  if v_sec is null or v_cpr is null then
    raise notice '67 · PULEI a conferencia: esta base nao tem os setores de exemplo.'; return;
  end if;

  /* `grupo` é not null e sem default: a conferência usa o mesmo grupo de
     uma categoria que já existe, em vez de inventar um rótulo. */
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, ativa)
       values ((select grupo from demandas.categorias order by ordem, nome limit 1),
               'Conf67 Compra', v_cpr, true, true) returning id into v_cat;
  insert into demandas.membros (nome, telefone, papel, setor_id, token) values
    ('Conf67 Pediu',    '5531900067001', 'solicitante', v_sec, v_ped),
    ('Conf67 Atende',   '5531900067002', 'responsavel', v_cpr, v_res),
    ('Conf67 Gestor',   '5531900067003', 'gestor',      v_sec, v_ges);

  /* ---- porta 1: concluir sem passar pelo portão ----------------------- */
  v_r := dem_abrir(v_ped, jsonb_build_object('titulo','Conf67 projetor','descricao','x',
           'prazo',(current_date + 20)::text,'orcamento','9000','categoria_id',v_cat));
  select numero into v_num from demandas.demandas where titulo = 'Conf67 projetor';
  select status, aprovacao into v_st, v_apr from demandas.demandas where numero = v_num;
  if v_st = 'travada' and v_apr = 'pendente' then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || format(E'\n  x o caso nao esta montado: nasceu %s/%s', v_st, v_apr);
  end if;

  v_r := dem_mover(v_res, v_num, 'concluir', jsonb_build_object('texto','comprei'));
  if (v_r ->> 'erro') = 'FALTA_APROVACAO' then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x PORTA 1 ABERTA: concluir fechou o gasto sem aprovacao. ' || v_r::text;
  end if;

  /* ---- porta 2: cancelar + reabrir ------------------------------------ */
  perform dem_mover(v_ped, v_num, 'cancelar', jsonb_build_object('texto','deixa pra la'));
  perform dem_mover(v_ped, v_num, 'reabrir',  jsonb_build_object('texto','mudei de ideia'));
  select status, aprovacao into v_st, v_apr from demandas.demandas where numero = v_num;
  if v_st = 'travada' and v_apr = 'pendente' then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || format(E'\n  x PORTA 2 ABERTA: cancelar+reabrir devolveu a demanda como %s/%s', v_st, v_apr);
  end if;

  /* ---- porta 3: travar por cima de travar ----------------------------- */
  v_r := dem_mover(v_res, v_num, 'travar',
           jsonb_build_object('motivo','terceiros','texto','esperando o fornecedor'));
  select travada_por into v_st from demandas.demandas where numero = v_num;
  if (v_r ->> 'erro') = 'FALTA_APROVACAO' and v_st = 'aprovacao' then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || format(E'\n  x PORTA 3 ABERTA: a trava virou %s e o gestor perdeu a demanda de vista', v_st);
  end if;

  /* ---- e mesmo que a trava mudasse, destravar continua recusando ------
     Este caso existe porque a correção tem dois andares, e o de baixo é o
     que segura se alguém um dia afrouxar o de cima: o guarda do destravar
     não lê mais o rótulo. Aqui ele é forçado por fora, direto na tabela. */
  update demandas.demandas set travada_por = 'terceiros' where numero = v_num;
  v_r := dem_mover(v_ped, v_num, 'destravar', jsonb_build_object('texto','vamos tocar'));
  if (v_r ->> 'erro') = 'FALTA_APROVACAO' then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x destravar ainda depende do rotulo da trava: ' || v_r::text;
  end if;
  update demandas.demandas set travada_por = 'aprovacao' where numero = v_num;

  /* ---- O CAMINHO DE QUEM TEM RAZÃO, INTEIRO -------------------------- */
  v_r := dem_mover(v_ges, v_num, 'aprovar', jsonb_build_object('texto','aprovado'));
  select status, aprovacao, aprovada_por into v_st, v_apr, v_por
    from demandas.demandas where numero = v_num;
  if (v_r ->> 'ok')::boolean and v_apr = 'aprovada' and v_por is not null then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x o gestor nao consegue mais aprovar: ' || v_r::text;
  end if;

  v_r := dem_mover(v_res, v_num, 'assumir');
  if (v_r ->> 'ok')::boolean then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x depois de aprovada, quem atende nao consegue assumir: ' || v_r::text;
  end if;

  v_r := dem_mover(v_res, v_num, 'concluir', jsonb_build_object('texto','projetor comprado'));
  select status, aprovada_por into v_st, v_por from demandas.demandas where numero = v_num;
  if (v_r ->> 'ok')::boolean and v_st = 'concluida' and v_por is not null then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || format(E'\n  x o caminho certo nao fecha: %s / status=%s', v_r::text, v_st);
  end if;

  /* ---- e uma demanda SEM portao nao foi afetada ----------------------- */
  declare v_cat2 uuid; v_n2 int;
  begin
    insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, ativa)
         values ((select grupo from demandas.categorias order by ordem, nome limit 1),
                 'Conf67 Simples', v_cpr, false, true) returning id into v_cat2;
    perform dem_abrir(v_ped, jsonb_build_object('titulo','Conf67 trocar lampada','descricao','x',
              'prazo',(current_date + 5)::text,'categoria_id',v_cat2));
    select numero into v_n2 from demandas.demandas where titulo = 'Conf67 trocar lampada';
    v_r := dem_mover(v_res, v_n2, 'concluir', jsonb_build_object('texto','trocada'));
    if (v_r ->> 'ok')::boolean then ok := ok + 1;
    else
      falhou := falhou + 1;
      msg := msg || E'\n  x categoria SEM aprovacao passou a exigir aprovacao: ' || v_r::text;
    end if;
    delete from demandas.eventos e using demandas.demandas d where d.id = e.demanda_id and d.categoria_id = v_cat2;
    delete from demandas.demandas where categoria_id = v_cat2;
    delete from demandas.categorias where id = v_cat2;
  end;

  /* ---- § 2: a agenda nao vai mais junto ------------------------------ */
  v_r := dem_bases(v_res);          -- responsavel, que era quem recebia tudo
  if (v_r ->> 'ok')::boolean and not (v_r ? 'membros') then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x dem_bases ainda entrega a lista de membros a quem atende';
  end if;
  if jsonb_array_length(v_r -> 'categorias') > 0
     and jsonb_array_length(v_r -> 'setores') > 0 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x dem_bases parou de entregar o que os formularios precisam';
  end if;

  /* ---- limpeza, por id ------------------------------------------------ */
  delete from demandas.eventos e using demandas.demandas d
   where d.id = e.demanda_id and d.categoria_id = v_cat;
  delete from demandas.anexos a using demandas.demandas d
   where d.id = a.demanda_id and d.categoria_id = v_cat;
  delete from demandas.demandas where categoria_id = v_cat;
  delete from demandas.categorias where id = v_cat;
  delete from demandas.membros where token in (v_ped, v_res, v_ges);

  if falhou > 0 then
    raise exception 'A CONFERENCIA DA 67 REPROVOU: % de % casos', falhou, ok + falhou
      using detail = msg, errcode = 'raise_exception';
  end if;
  raise notice '67 · conferencia: %/% casos. As tres portas dos fundos do portao estao fechadas, e o caminho de pedir-aprovar-assumir-concluir segue inteiro.', ok, ok;
end $conf$;


/* =============================================================================
   ROLLBACK
     Copiar o corpo de `dem_mover` da migração 52 por cima. As três portas
     dos fundos voltam com ele.

   VERIFICAÇÃO DEPOIS DE APLICAR
     bash scripts/demandas-banco.sh    (62 casos + esta conferência)
   ============================================================================= */
