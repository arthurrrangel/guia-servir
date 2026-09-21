/* ESTE ARQUIVO E PASSADO. A TRANCA ESTA AQUI PORQUE ELE PODE DESFAZER.

   `create or replace function` nao e idempotente NO TEMPO: ele grava a versao
   deste arquivo por cima da que estiver la, seja ela mais nova ou nao, e sem
   um aviso.

   O que este arquivo consegue reverter, se rodar fora de hora:
     dem_mover (a 67 refez: MEDIDO em 21/09 num banco na 81 — reaplicar a 52 derruba as
     mencoes de `aprovacao` em dem_mover de 32 para 25, a conferencia da 67 reprova 6 de
     14 casos, e a primeira linha e `PORTA 1 ABERTA: concluir fechou o gasto sem
     aprovacao`. A 52 imprime tres OKs enquanto faz isso.)

   Por isso ele se recusa a rodar num banco que ja passou da 52. Aplicado na
   ordem, do zero, `exige_versao_ate` ainda nem existe (ela nasce na 55) e o
   bloco nao faz nada — e e assim que tem que ser, senao o rebuild do
   repositorio parava aqui.

   Se voce REALMENTE precisa reaplicar, a mensagem do erro diz como. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(52);
  end if;
end $tranca$;

/* =============================================================================
   52 · O QUE A AUDITORIA DE ARQUITETURA PROVOU
   19/09/2026

   Esta migração é o resíduo de uma auditoria que começou com quinze suspeitas
   e terminou com seis. As outras nove morreram na inspeção, e as mortes estão
   registradas no fim deste arquivo — porque uma suspeita descartada com
   motivo vale mais do que uma correção aplicada por via das dúvidas.

   Nenhum dos seis itens abaixo é hipótese. Cada um é uma consulta ao código
   que está no ar, e cada um traz, junto, a consulta que prova.

   -------------------------------------------------------------------------
   1 · `dem_mover` LÊ, DECIDE E ESCREVE SEM SEGURAR A LINHA

      A função inteira tem esta forma:

          select * into d from demandas.demandas where numero = p_numero;
          ...
          if d.status in ('concluida','cancelada') and p_acao not in (...) then
            return ... 'JA_FECHADA';
          ...
          update demandas.demandas set status = 'cancelada' where id = d.id;

      Entre o `select` e o `update` existe uma janela. Duas requisições que
      caem nela leem o MESMO `d`, as duas passam pelo mesmo guarda, as duas
      escrevem. A última ganha.

      O caso que dói: a Ana toca "Concluir" e, no mesmo segundo, o Pedro toca
      "Cancelar". Os dois leem status='execucao'. Os dois passam pelo guarda
      de JA_FECHADA, que só recusa o que JÁ estava fechado. A demanda termina
      cancelada com o texto de conclusão gravado, ou concluída com o motivo
      do cancelamento — e o histórico registra os dois eventos, contando uma
      coisa que não aconteceu.

      Não é raro por acaso: o funil concentra TODAS as transições nesta função
      (é o desenho, e é um bom desenho), o que significa que toda ação da tela
      passa por esta janela.

      `for update` fecha. Em READ COMMITTED, quem chega depois espera o
      primeiro terminar e então relê a linha JÁ atualizada — o guarda passa a
      julgar o estado verdadeiro, não o estado de um instante atrás.

   -------------------------------------------------------------------------
   2 · `dem_abrir` ACEITA QUALQUER SETOR; `dem_mover` NÃO

      Abrir resolve o setor que vai atender assim:

          coalesce(nullif(p_d->>'setor_responsavel','')::uuid, c.setor_id, v_setor)

      Sem nenhuma checagem. Redirecionar, na mesma migração, checa:

          if not exists (select 1 from demandas.setores
                          where id = ... and ativo and atende) then
            return ... 'SETOR_NAO_ATENDE';

      A assimetria é a prova da intenção: o autor já decidiu que demanda não
      pode parar em setor que não atende. Abrir só não recebeu a regra.

      E o caminho que isso quebra não é o do atacante — é o do administrador.
      Basta desativar um setor sem lembrar das categorias que apontam para
      ele: `c.setor_id` continua apontando, toda demanda daquela categoria
      nasce endereçada a um setor que não atende, `pode_atender` é falso para
      todo mundo, e o pedido fica num lugar que ninguém olha. Sem erro, sem
      aviso, sem fila onde apareça.

   -------------------------------------------------------------------------
   3 · O ANEXO ACEITA QUALQUER ESQUEMA, E A TELA TRANSFORMA EM LINK

      No banco, `anexos.url` é `text not null`, e a única checagem é

          where btrim(coalesce(a->>'url','')) <> ''

      Na tela (app/demandas/d/[numero]/page.tsx:151):

          <a href={a.url} target="_blank" rel="noopener noreferrer">{a.nome}</a>

      Um membro grava `javascript:` como anexo. Outro membro abre a demanda,
      vê um link com nome inocente, toca. O código roda na sessão de quem
      tocou, com o token dele no localStorage.

      Confiar no React para barrar isso é confiar no comportamento de uma
      versão de uma biblioteca para sustentar uma invariante do banco. O lugar
      da regra é aqui: vale para qualquer tela, hoje e depois.

      A restrição entra `not valid`: ela passa a valer para toda linha NOVA
      imediatamente, e não corre o risco de derrubar a migração por causa de
      uma linha antiga. A validação das antigas é tentada logo abaixo e, se
      não passar, avisa em vez de falhar.

   -------------------------------------------------------------------------
   4 · TÍTULO SEM TETO CHEGA NA TELA DE TODO MUNDO

      `demandas.titulo` é `text` sem limite, e `demandas.resumo()` — que
      monta CADA item de `dem_lista` — carrega o título inteiro. `dem_lista`
      devolve tudo que a pessoa pode ver, numa resposta só.

      Um título colado por engano (o conteúdo inteiro de um documento, no
      celular, no campo errado) passa a viajar em toda carga da lista, para
      todo membro que enxerga aquela demanda. E não existe tela que conserte:
      `dem_ajustar` mexe em setores e categorias, não em título de demanda.

      O mesmo vale para `evento`, que também vai no resumo. `descricao` fica
      com um teto generoso: ela só é carregada numa demanda por vez, então o
      limite aqui é sanidade, não desempenho.

   -------------------------------------------------------------------------
   5 · COLUNA NOVA EM `voluntarios` NÃO HERDA GRANT — E JÁ DERRUBOU A PRODUÇÃO

      Em 18/09 o Painel, a Escala e o Time morreram juntos, mostrando
      "LOUVOR · 0" com os treze voluntários intactos no banco. Causa: a
      migração 48 criou `voluntarios.sexo`; a 18 trocou o GRANT da tabela por
      GRANT POR COLUNA; e no Postgres coluna nova não herda GRANT nenhum.
      `linhasDaEquipe` passou a pedir `sexo` e o PostgREST recusou o pedido
      INTEIRO com 42501 — não a coluna, o pedido.

      O GRANT foi aplicado à mão, no painel, para levantar o sistema. Só que
      migração nenhuma o carrega. Ou seja: o banco de produção tem hoje uma
      permissão que NENHUM arquivo deste repositório reproduz. Quem
      reconstruir o banco a partir das migrações levanta um sistema que não é
      este — e descobre isso pela mesma tela preta.

      Esta migração fecha as duas pontas: grava o GRANT que faltava e troca a
      lista escrita à mão por uma que se lê do catálogo, com lista de exclusão
      explícita. Coluna nova passa a entrar sozinha; `pin_hash` continua fora,
      e continua fora por escrito.

      (O lado do cliente já foi consertado em 18/09: `linhasDaEquipe` tenta de
      novo sem as colunas opcionais quando o banco recusa, e o teste
      `ponte-colunas` guarda esse comportamento. As duas defesas são
      necessárias: uma impede a tela preta, a outra devolve o dado.)

   -------------------------------------------------------------------------
   6 · "REMOVER DO TIME" APAGA ANOS DE HISTÓRICO, E FICA AO LADO DE "PAUSAR"

      `removerVoluntario` faz `delete from voluntarios`. Sete tabelas
      referenciam `voluntarios(id)` com `on delete cascade`: escalações,
      habilidades, plantões, indisponibilidades, respostas, onboarding feito,
      histórico. Tudo vai junto, sem cópia, sem desfazer.

      A tela avisa ("O histórico de escalas dele some junto") e pede
      confirmação — o recurso é intencional e NÃO deve sumir: o autocadastro
      é aberto, linha errada aparece, e alguém precisa limpar sem esperar a
      liderança geral.

      O defeito não é o botão existir. É que o botão que resolve o cadastro
      errado (zero histórico, apagar é certo) e o botão que joga fora três
      anos da Letícia são O MESMO BOTÃO, com a mesma confirmação, na mesma
      linha da lista — e logo ao lado está "Pausar", que é a resposta certa
      para o segundo caso e já existe.

      O guarda abaixo separa os dois: sem histórico, apaga como sempre; com
      histórico, recusa e manda pausar. Ninguém perde recurso; a perda
      irreversível é a única que passa a exigir outro caminho.

   ============================================================================= */


-- =========================================================================
-- 1 · dem_mover segura a linha antes de julgar o estado dela
--
-- Uma linha muda: `for update` no select. O resto da função é o que já
-- estava no ar (migração 50), reproduzido inteiro porque `create or replace`
-- substitui o corpo todo.
-- =========================================================================

create or replace function public.dem_mover(
  p_token text, p_numero int, p_acao text, p_d jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
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
    update demandas.demandas
       set status = 'travada', travada_por = p_d->>'motivo', travada_nota = v_txt,
           aprovacao = case when p_d->>'motivo' = 'aprovacao' then 'pendente' else aprovacao end
     where id = d.id;

  elsif p_acao = 'destravar' then
    if not (demandas.pode_atender(m, d) or d.aberta_por = m.id) then
      return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
    if d.status <> 'travada' then return jsonb_build_object('ok', false, 'erro', 'NAO_ESTA_TRAVADA'); end if;
    if d.travada_por = 'aprovacao' and d.aprovacao = 'pendente' then
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
       exatamente como era. */
    update demandas.demandas
       set reaberturas = reaberturas + 1,
           conclusao = null, concluida_em = null, cancelada_motivo = null,
           atraso_motivo = null,
           status = case when d.aprovacao = 'rejeitada' then 'travada' else 'execucao' end,
           travada_por = case when d.aprovacao = 'rejeitada' then 'aprovacao' else null end,
           travada_nota = case when d.aprovacao = 'rejeitada'
                               then 'Reaberta depois de recusada: precisa de aprovação de novo.'
                               else null end,
           aprovacao = case when d.aprovacao = 'rejeitada' then 'pendente' else aprovacao end,
           aprovada_por = case when d.aprovacao = 'rejeitada' then null else aprovada_por end,
           aprovada_em = case when d.aprovacao = 'rejeitada' then null else aprovada_em end
     where id = d.id;

  else
    return jsonb_build_object('ok', false, 'erro', 'ACAO_DESCONHECIDA');
  end if;

  return jsonb_build_object('ok', true);
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
end $fn$;


-- =========================================================================
-- 2 · dem_abrir passa a exigir do setor que atende o mesmo que redirecionar
--
-- Duas mudanças: o setor resolvido é checado (`ativo and atende`), e
-- `foreign_key_violation` deixa de escapar como erro cru do Postgres.
-- =========================================================================

create or replace function public.dem_abrir(p_token text, p_d jsonb)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare
  m demandas.membros; c demandas.categorias; v_setor uuid; v_num int; v_id uuid;
  v_prazo date; v_evd date; v_resp uuid;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

  select * into c from demandas.categorias where id = (p_d->>'categoria_id')::uuid and ativa;
  if c.id is null then return jsonb_build_object('ok', false, 'erro', 'CATEGORIA_INVALIDA'); end if;

  /* o setor solicitante é o de quem abre; gestor pode abrir em nome de outro.

     19/09/2026, item 8: o `coalesce(m.setor_id, v_setor)` da comparação se
     invertia quando `m.setor_id` era NULO — virava `v_setor <> v_setor`, que é
     falso, e o parâmetro do cliente passava inteiro. Membro sem setor podia
     abrir demanda dizendo-se de qualquer setor, e o histórico gravava uma
     origem falsa. Hoje a tela de Ajustes não deixa criar membro sem setor,
     então é porta destrancada em corredor vazio — mas `membros.setor_id` é
     nulável e `dem_ajustar` aceita nulo, então o corredor existe.

     Sem o `coalesce`: quem não é gestor abre pelo próprio setor, ponto. Se
     não tem setor, cai no `SEM_SETOR` logo abaixo, que é a resposta certa. */
  v_setor := coalesce(nullif(p_d->>'setor_solicitante','')::uuid, m.setor_id);
  if m.papel not in ('gestor','admin') then v_setor := m.setor_id; end if;
  if v_setor is null then return jsonb_build_object('ok', false, 'erro', 'SEM_SETOR'); end if;

  /* ---- quem vai ATENDER, e a checagem que faltava ----------------------
     A ordem de preferência é a de antes. O que muda é que o resultado dela
     passa pelo mesmo crivo que `redirecionar` já aplicava: demanda não
     nasce endereçada a setor que não recebe demanda. O caminho que isso
     salva é o do administrador que desativa um setor e esquece que uma
     categoria ainda aponta para ele. */
  v_resp := coalesce(nullif(p_d->>'setor_responsavel','')::uuid, c.setor_id, v_setor);
  if not exists (select 1 from demandas.setores s
                  where s.id = v_resp and s.ativo and s.atende) then
    return jsonb_build_object('ok', false, 'erro', 'SETOR_NAO_ATENDE');
  end if;

  v_prazo := nullif(p_d->>'prazo','')::date;
  v_evd   := nullif(p_d->>'evento_data','')::date;

  insert into demandas.demandas (
    titulo, descricao, objetivo, local, publico,
    categoria_id, setor_solicitante, setor_responsavel,
    prioridade, impacto, prazo, sem_prazo_porque, evento, evento_data, orcamento,
    aberta_por, status, travada_por, travada_nota, aprovacao)
  values (
    btrim(p_d->>'titulo'), btrim(p_d->>'descricao'), nullif(btrim(coalesce(p_d->>'objetivo','')),''),
    nullif(btrim(coalesce(p_d->>'local','')),''), nullif(btrim(coalesce(p_d->>'publico','')),''),
    c.id, v_setor, v_resp,
    coalesce(nullif(p_d->>'prioridade',''), 'normal'),
    nullif(btrim(coalesce(p_d->>'impacto','')),''),
    v_prazo, nullif(btrim(coalesce(p_d->>'sem_prazo_porque','')),''),
    nullif(btrim(coalesce(p_d->>'evento','')),''), v_evd,
    nullif(p_d->>'orcamento','')::numeric,
    m.id,
    case when c.exige_aprovacao then 'travada' else 'aberta' end,
    case when c.exige_aprovacao then 'aprovacao' else null end,
    case when c.exige_aprovacao
         then 'Esta categoria exige aprovação antes da execução.' else null end,
    case when c.exige_aprovacao then 'pendente' else null end)
  returning id, numero into v_id, v_num;

  insert into demandas.eventos (demanda_id, membro_id, tipo, para, texto)
    values (v_id, m.id, 'abertura', 'aberta', null);

  /* anexos por link, quando vieram junto */
  if jsonb_typeof(p_d->'anexos') = 'array' then
    insert into demandas.anexos (demanda_id, nome, url, membro_id)
      select v_id, coalesce(nullif(btrim(a->>'nome'),''), 'anexo'), btrim(a->>'url'), m.id
        from jsonb_array_elements(p_d->'anexos') a
       where btrim(coalesce(a->>'url','')) <> '';
  end if;

  /* UM contato do setor que vai atender, e só: é o que a tela usa para montar
     o link de WhatsApp do aviso. O documento pede notificação; servidor não
     manda WhatsApp, então o sistema prepara a mensagem e a pessoa toca uma
     vez. Devolver a lista inteira de telefones seria expor agenda sem
     necessidade — aqui vai um nome e um número, para este pedido. */
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
  /* um uuid que não existe em `categorias`, `setores` ou `membros` chegava
     aqui como erro cru do Postgres e a tela mostrava o texto do banco */
  when foreign_key_violation then
    return jsonb_build_object('ok', false, 'erro', 'REGRA', 'regra', SQLERRM);
end $fn$;


-- =========================================================================
-- 3 e 4 · as regras que o texto precisa obedecer para chegar na tela
--
-- Todas entram `not valid`: valem para toda linha nova AGORA, e não põem a
-- migração à mercê de uma linha antiga. A validação do que já existe é
-- tentada logo abaixo, e avisa em vez de falhar.
-- =========================================================================

do $regras$
declare
  v_falta text := '';
begin
  /* anexo só aceita http(s). Ver item 3 do cabeçalho. */
  if not exists (select 1 from pg_constraint
                  where conname = 'anexos_url_http_ck'
                    and conrelid = 'demandas.anexos'::regclass) then
    alter table demandas.anexos
      add constraint anexos_url_http_ck check (url ~* '^https?://') not valid;
  end if;

  /* título tem teto porque viaja em toda carga da lista. Ver item 4. */
  if not exists (select 1 from pg_constraint
                  where conname = 'demandas_titulo_tam_ck'
                    and conrelid = 'demandas.demandas'::regclass) then
    alter table demandas.demandas
      add constraint demandas_titulo_tam_ck
      check (length(btrim(titulo)) between 3 and 200) not valid;
  end if;

  /* `evento` também vai no resumo */
  if not exists (select 1 from pg_constraint
                  where conname = 'demandas_evento_tam_ck'
                    and conrelid = 'demandas.demandas'::regclass) then
    alter table demandas.demandas
      add constraint demandas_evento_tam_ck
      check (evento is null or length(evento) <= 120) not valid;
  end if;

  /* descrição é carregada uma por vez: teto largo, só sanidade */
  if not exists (select 1 from pg_constraint
                  where conname = 'demandas_descricao_tam_ck'
                    and conrelid = 'demandas.demandas'::regclass) then
    alter table demandas.demandas
      add constraint demandas_descricao_tam_ck
      check (length(btrim(descricao)) between 1 and 20000) not valid;
  end if;

  /* agora a validação do que já está gravado, uma por uma: se alguma linha
     antiga não obedece, quero o AVISO com o número de linhas, não a migração
     abortada no meio. */
  begin alter table demandas.anexos validate constraint anexos_url_http_ck;
  exception when check_violation then v_falta := v_falta || 'anexos.url; '; end;

  begin alter table demandas.demandas validate constraint demandas_titulo_tam_ck;
  exception when check_violation then v_falta := v_falta || 'demandas.titulo; '; end;

  begin alter table demandas.demandas validate constraint demandas_evento_tam_ck;
  exception when check_violation then v_falta := v_falta || 'demandas.evento; '; end;

  begin alter table demandas.demandas validate constraint demandas_descricao_tam_ck;
  exception when check_violation then v_falta := v_falta || 'demandas.descricao; '; end;

  if v_falta = '' then
    raise notice 'OK — as quatro regras de texto valem para o que já existe e para o que vier.';
  else
    raise notice 'ATENCAO — regra(s) valendo so para linhas NOVAS, ha linha antiga fora: %', v_falta;
    raise notice '  (as linhas antigas continuam la; conferir e corrigir a mao, depois: alter table ... validate constraint ...)';
  end if;
end $regras$;


-- =========================================================================
-- 5 · o GRANT de `voluntarios` passa a se ler do catálogo
--
-- A lista de exclusão é a regra; o resto entra sozinho. Coluna nova deixa de
-- derrubar a tela por esquecimento.
-- =========================================================================

do $grants$
declare
  v_cols text;
  /* ESTA MIGRAÇÃO ATRAVESSA OS DOIS SISTEMAS, e isso é uma escolha, não um
     descuido: os itens 1 a 4 e 9 são de Demandas, os itens 5 e 6 são do GUIA
     Servir, e todos saíram da MESMA auditoria, no mesmo dia. Separar em dois
     arquivos faria a ordem de aplicação virar assunto.

     O preço aparece no banco de teste isolado de Demandas
     (`scripts/demandas-celular-subir.sh`), que tem o esquema `demandas` e
     NADA de `public.voluntarios`. Ali este bloco não tem em que mexer.

     Então ele confere antes e diz o que fez. Pular calado seria o defeito;
     pular dizendo por quê é a resposta certa para um banco onde a tabela
     legitimamente não existe. Num banco de verdade ela existe sempre, e o
     `raise notice` do fim prova que o GRANT foi aplicado. */
  /* fora do SELECT de `authenticated`, por escrito e com motivo:
       pin_hash — sha256(pin || token). Com o token junto (que É concedido,
       risco aceito e documentado na 18 para `montarLinks`), o hash entrega
       o PIN, que é um segredo que a PESSOA escolheu e provavelmente reusa
       fora daqui. */
  v_fora_do_select constant text[] := array['pin_hash'];
  /* o UPDATE é MUITO mais estreito do que o SELECT, e de propósito: mudar
     `equipe_id` moveria alguém de ministério por baixo do pano; mudar
     `token` invalidaria o link que já está no WhatsApp da pessoa; mudar
     `pessoa_id` trocaria a identidade. Nada disso é trabalho de organizador.
     Aqui a lista é explícita porque a decisão é por coluna, não por
     exclusão. */
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

  /* O INSERT entra nesta conta por causa de uma sutileza do Postgres que só
     aparece medindo: o Supabase concede INSERT no NÍVEL DA TABELA para
     `authenticated`, e permissão de tabela NÃO pode ser tirada por coluna —
     `revoke insert (pin_hash) ...` é aceito e não faz nada. Ou seja, com a 18
     no ar como estava, `authenticated` não LIA o `pin_hash` mas podia
     ESCREVER um, gravando credencial em nome de terceiro.

     Ninguém do lado do cliente insere em `voluntarios` direto — a criação
     passa por `criar_voluntario`, que é SECURITY DEFINER e roda como dona da
     tabela, fora deste GRANT (conferido: nenhum `from('voluntarios').insert`
     em lib/). Então dá para fechar o INSERT por coluna também, e é o que
     torna a regra completa: `pin_hash` fica sem NENHUM privilégio aqui. */
  execute 'revoke select, insert, update on public.voluntarios from authenticated';
  execute format('grant select (%s) on public.voluntarios to authenticated', v_cols);
  execute format('grant update (%s) on public.voluntarios to authenticated', v_escrever);
  execute format('grant insert (%s, equipe_id) on public.voluntarios to authenticated', v_escrever);

  /* `anon` nunca precisou: tudo que é público passa por função SECURITY
     DEFINER (equipe_publica, equipe_time, candidatar, eu_*). */
  execute 'revoke select, update on public.voluntarios from anon';

  raise notice 'OK — GRANT de voluntarios relido do catalogo: SELECT em %, UPDATE restrito.', v_cols;
end $grants$;

do $c1$ begin
  if to_regclass('public.voluntarios') is null then return; end if;
  execute $x$comment on column voluntarios.pin_hash is
  'sha256(pin || token). Fora do GRANT de authenticated desde a 18; a 52 fez dessa exclusao a REGRA (lista de exclusao no lugar de lista de inclusao), para que coluna nova nao repita o apagao de 18/09.'$x$;
  execute $x$comment on column voluntarios.sexo is
  'M ou F. Existe por causa dos postos que so aceitam um (banheiros do Connect, migracao 48). Criada na 48 SEM grant — foi o que derrubou Painel, Escala e Time em 18/09. Desde a 52 o grant se le do catalogo.'$x$;
end $c1$;


-- =========================================================================
-- 6 · apagar voluntário com histórico passa a exigir pausar
--
-- Um gatilho, não uma política: a distinção não é sobre QUEM apaga (isso a
-- RLS já resolve), é sobre O QUE se perde. Cadastro errado apaga como antes.
-- =========================================================================

create or replace function public.voluntario_nao_apaga_historico()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_n int;
begin
  select count(*) into v_n from escalacoes where voluntario_id = old.id;
  if v_n > 0 then
    raise exception
      'VOLUNTARIO_COM_HISTORICO: % ja serviu % vez(es). Apagar levaria junto toda a escala dele, sem volta. Use Pausar.',
      old.nome, v_n
      using errcode = 'restrict_violation';
  end if;
  return old;
end $fn$;

do $tg$ begin
  if to_regclass('public.voluntarios') is null then
    raise notice 'PULEI o gatilho de historico: esta base nao tem public.voluntarios.';
    return;
  end if;
  drop trigger if exists tg_voluntario_nao_apaga_historico on voluntarios;
  create trigger tg_voluntario_nao_apaga_historico
    before delete on voluntarios
    for each row execute function public.voluntario_nao_apaga_historico();
end $tg$;


-- =========================================================================
-- 9 · a segunda tranca do esquema `demandas`
--
-- Hoje o isolamento de Demandas repousa em DUAS coisas, e as duas são a
-- mesma: `revoke all on schema demandas from public, anon, authenticated`
-- (migração 50) e o esquema não estar na lista de esquemas expostos do
-- PostgREST — que é configuração do painel, e que NENHUM arquivo deste
-- repositório reproduz.
--
-- Não há segunda camada. Se alguém acrescentar `demandas` aos esquemas
-- expostos para depurar alguma coisa, ou se um `grant usage` entrar por
-- outra migração, TODAS as tabelas ficam legíveis de uma vez — inclusive
-- `demandas.membros`, que guarda os tokens em texto puro.
--
-- Do lado de `public` a disciplina é a oposta: 23 tabelas, todas com RLS.
--
-- Ligar RLS sem criar policy nenhuma não muda NADA do funcionamento: as
-- `dem_*` são `security definer` e rodam como dona das tabelas, fora da RLS.
-- O que muda é que, no dia do engano acima, a política padrão do Postgres é
-- negar tudo — e o engano vira uma tela vazia em vez de um vazamento.
-- =========================================================================

do $rls$
declare r record; n int := 0;
begin
  for r in select tablename from pg_tables where schemaname = 'demandas' loop
    execute format('alter table demandas.%I enable row level security', r.tablename);
    n := n + 1;
  end loop;
  raise notice 'OK — RLS ligada em % tabela(s) de demandas (sem policy: e a tranca de reserva).', n;
end $rls$;


/* =============================================================================
   CONFERÊNCIA — dados descartáveis, desfeitos no fim.
   Todas as linhas têm que dizer OK.
   ============================================================================= */
do $conf$
declare
  v_erros text := '';
  v_eq uuid; v_fn uuid; v_culto uuid;
  v_tel text := '21' || lpad((floor(random()*900000000)+100000000)::text, 9, '0');
  v_vol uuid;
  v_apagou boolean;
  v_setor_off uuid; v_cat_off uuid;
begin
  -- ---------------------------------------------------------------- item 5
  if to_regclass('public.voluntarios') is null then
    raise notice 'PULEI os itens 5 e 6 (public.voluntarios nao existe nesta base).';
  else
  if not exists (
    select 1 from information_schema.column_privileges
     where table_schema='public' and table_name='voluntarios'
       and grantee='authenticated' and privilege_type='SELECT'
       and column_name='sexo') then
    v_erros := v_erros || '5) sexo continua fora do SELECT de authenticated; ';
  end if;
  /* `REFERENCES` sobra do GRANT de tabela e é inofensivo (permite apontar uma
     chave estrangeira para a coluna, não ler nem escrever valor). O que não
     pode existir é SELECT, INSERT ou UPDATE. */
  if exists (
    select 1 from information_schema.column_privileges
     where table_schema='public' and table_name='voluntarios'
       and grantee='authenticated' and column_name='pin_hash'
       and privilege_type in ('SELECT','INSERT','UPDATE')) then
    v_erros := v_erros || '5) pin_hash com SELECT/INSERT/UPDATE para authenticated; ';
  end if;
  if exists (
    select 1 from information_schema.column_privileges
     where table_schema='public' and table_name='voluntarios'
       and grantee='authenticated' and privilege_type='UPDATE'
       and column_name in ('equipe_id','token','pessoa_id','id')) then
    v_erros := v_erros || '5) UPDATE alargou demais (equipe_id/token/pessoa_id/id); ';
  end if;

  -- ---------------------------------------------------------------- item 6
  select e.id into v_eq from equipes e limit 1;
  select f.id into v_fn from funcoes f where f.equipe_id = v_eq limit 1;
  if v_eq is not null and v_fn is not null then
    insert into voluntarios (nome, telefone, equipe_id, ativo)
      values ('Teste Cinquentaedois', v_tel, v_eq, true) returning id into v_vol;

    /* 6a) sem histórico: apaga como sempre */
    begin
      delete from voluntarios where id = v_vol;
      v_apagou := true;
    exception when others then v_apagou := false;
    end;
    if not v_apagou then
      v_erros := v_erros || '6a) cadastro SEM historico deixou de poder ser apagado — o gatilho ficou largo demais; ';
    end if;

    /* 6b) com histórico: recusa */
    insert into voluntarios (nome, telefone, equipe_id, ativo)
      values ('Teste Cinquentaedois', v_tel, v_eq, true) returning id into v_vol;
    /* `cultos` NÃO tem equipe_id: o domingo é o mesmo para todo ministério,
       e quem amarra a escalação ao ministério é `funcoes.equipe_id`. Um
       domingo antigo e improvável serve, e sai no fim. */
    select c.id into v_culto from cultos c where c.data = date '2019-01-06';
    if v_culto is null then
      insert into cultos (data) values (date '2019-01-06') returning id into v_culto;
    end if;
    insert into escalacoes (culto_id, funcao_id, voluntario_id, status)
      values (v_culto, v_fn, v_vol, 'pendente');

    begin
      delete from voluntarios where id = v_vol;
      v_apagou := true;
    exception when others then v_apagou := false;
    end;
    if v_apagou then
      v_erros := v_erros || '6b) voluntario COM historico foi apagado e levou a escala junto; ';
    end if;

    delete from escalacoes where voluntario_id = v_vol;
    delete from voluntarios where id = v_vol;
    delete from cultos where id = v_culto and data = date '2019-01-06';
  else
    raise notice 'PULEI 6: nenhuma equipe/funcao para testar.';
  end if;

  end if;   -- fim do bloco que depende de public.voluntarios (itens 5 e 6)

  -- ---------------------------------------------------------------- item 3
  if not exists (select 1 from pg_constraint
                  where conname='anexos_url_http_ck'
                    and conrelid='demandas.anexos'::regclass) then
    v_erros := v_erros || '3) a restricao de esquema do anexo nao existe; ';
  end if;

  -- ---------------------------------------------------------------- item 1
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='dem_mover'
       and p.prosrc like '%for update%') then
    v_erros := v_erros || '1) dem_mover nao esta segurando a linha (for update ausente); ';
  end if;

  -- ---------------------------------------------------------------- item 2
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='dem_abrir'
       and p.prosrc like '%SETOR_NAO_ATENDE%') then
    v_erros := v_erros || '2) dem_abrir nao checa o setor que atende; ';
  end if;

  -- ---------------------------------------------------------------- item 7
  -- reabrir o que foi RECUSADO tem que voltar ao portao, nao a execucao
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='dem_mover'
       and p.prosrc like '%Reaberta depois de recusada%') then
    v_erros := v_erros || '7) reabrir ainda desfaz a recusa do gestor; ';
  end if;

  -- ---------------------------------------------------------------- item 9
  if exists (
    select 1 from pg_tables where schemaname='demandas' and not rowsecurity) then
    v_erros := v_erros || '9) sobrou tabela de demandas sem RLS: '
      || (select string_agg(tablename, ', ') from pg_tables
           where schemaname='demandas' and not rowsecurity) || '; ';
  end if;

  if v_erros = '' then
    /* o numero tem que dizer a verdade: quando os itens 5 e 6 sao pulados
       (base sem `public.voluntarios`), foram SETE e nao nove. Mensagem que
       arredonda para cima e a mesma familia de defeito que esta migracao
       passou o dia consertando. */
    if to_regclass('public.voluntarios') is null then
      raise notice 'OK — 7/7 conferidos nesta base (5 e 6 pulados por falta de public.voluntarios): trava de concorrencia, setor validado, anexo so http, texto com teto, recusa que nao se desfaz, setor solicitante sem inversao, RLS de reserva.';
    else
      raise notice 'OK — 9/9 conferidos: trava de concorrencia, setor validado, anexo so http, texto com teto, grant do catalogo, historico protegido, recusa que nao se desfaz, setor solicitante sem inversao, RLS de reserva.';
    end if;
  else
    raise exception 'FALHOU — %', v_erros;
  end if;
end $conf$;


/* =============================================================================
   O QUE FOI INVESTIGADO E *NÃO* VIROU MUDANÇA

   Nove suspeitas entraram nesta rodada e não saíram. Ficam aqui porque a
   próxima auditoria vai levantá-las de novo, e vai gastar o mesmo tempo.

   · `perg_ler` e `onb_ler` deixam qualquer autenticado ler as linhas com
     `equipe_id is null`.
     NÃO É FURO. O próprio schema documenta: "equipe_id nulo = pergunta de
     todos" (22:94) e "null = todas" (22:191). São os modelos compartilhados
     que TODO ministério usa no formulário de cadastro. Estreitar a política
     quebraria o cadastro de todos os ministérios para fechar uma porta que é
     a sala de estar.

   · `dem_ver` responde NAO_EXISTE e SEM_ACESSO de formas distintas, o que
     permite descobrir quais números existem.
     NÃO COMPENSA. `demandas.numero` é sequencial: quem abriu a demanda #50
     já sabe que 1 a 49 existem, sem sondar nada. O oráculo não entrega nada
     que a numeração não entregue de graça. E juntar as duas mensagens
     trocaria "Essa demanda não existe" por "Este link não vale mais" no caso
     comum, que é digitar o número errado. Custo real de uso, ganho zero.

   · Separar `eq_voluntarios` para que DELETE exija `lidera_tudo()`.
     ERA A CORREÇÃO ERRADA. Removeria um recurso intencional, com aviso na
     tela ("O histórico de escalas dele some junto") e confirmação. O
     autocadastro é aberto: linha errada aparece, e quem organiza precisa
     limpar sem esperar a liderança geral. O que o item 6 faz é separar o
     caso reversível do irreversível — sem tirar recurso de ninguém.

   · Índice funcional em `tel_norm(voluntarios.telefone)`.
     AINDA NÃO. Existem dois lugares que justificariam: o auto-join de
     `conflitos_de_outras_areas` (tel_norm = tel_norm entre voluntários de
     equipes diferentes) e o gatilho de função simultânea, que roda a cada
     inserção de escalação. Os dois são O(n²) no papel. Só que `voluntarios`
     tem ordem de centenas de linhas: o planejador vai varrer a tabela de
     qualquer jeito e o índice fica sem uso, cobrando escrita a cada
     cadastro. Anotado como item de ESCALA, com gatilho declarado: quando
     `select count(*) from voluntarios` passar de ~5.000, medir de novo com
     EXPLAIN ANALYZE no auto-join e criar
     `create index ix_vol_telnorm on voluntarios (tel_norm(telefone))`
     (tel_norm é IMMUTABLE, então é legal). Antes disso é peso morto.

   · `anexos` sem limite de quantidade por demanda; `eventos` sem limite de
     tamanho de texto.
     MESMO RACIOCÍNIO DO ÍNDICE, invertido: aqui o teto do texto JÁ entrou
     (item 4) para os campos que viajam na lista. Comentário e anexo são
     carregados uma demanda por vez, por quem já tem acesso a ela. Sem
     evidência de abuso e sem caminho de amplificação, um teto arbitrário
     atrapalharia o uso legítimo (colar um log inteiro num comentário
     técnico é exatamente o que se quer poder fazer).

   · `dem_lista` não pagina.
     VERDADE, E FICA. São centenas de demandas por ano numa igreja, e a tela
     filtra por aba. Paginação aqui é complexidade a mais em troca de nada
     hoje. Item de ESCALA, gatilho: passar de ~2.000 demandas vivas.

   · `demandas.eventos` cresce sem arquivamento.
     Item de ESCALA. Mesma família do anterior, mesmo gatilho.

   · Mover a lógica de `pode_ver`/`pode_atender` para a aplicação, para poder
     testar sem banco.
     NÃO. A regra está no `security definer` porque é DALI que ela precisa
     valer — a aplicação é um cliente entre outros possíveis, e o token do
     membro está no localStorage de quem usa. Regra de acesso testável só na
     aplicação é regra que o próximo cliente esquece. O teste certo é o de
     banco (`scripts/demandas-banco.sh`), e ele existe.

   · Unificar a autenticação de Demandas com a do GUIA Servir.
     ESTA ENTRADA ESTAVA ERRADA, e o conserto dela é mais útil que o resto
     desta lista. Ela dizia "PROIBIDO POR DECISÃO DE 27/08". Duas coisas
     erradas numa frase:

     Primeira: a decisão de 27/08 é sobre o FINANCEIRO — outro projeto do
     Supabase, outro banco — e diz "zero link a partir do GUIA Servir". Ela
     continua certa PARA O FINANCEIRO. Citá-la aqui foi emprestar a
     autoridade de uma decisão sobre outro sistema.

     Segunda, e pior: a autenticação de Demandas JÁ É a do GUIA Servir, de
     propósito, e o cabeçalho da migração 50 diz isso com todas as letras —
     "quem já entra no GUIA Servir com e-mail e senha entra aqui com a MESMA
     senha, porque o Auth é do projeto". Mesmo projeto, mesmo `auth.users`,
     mesmo JWT (`demandas.quem` resolve por `auth.jwt() ->> 'email'`), mesma
     tela de /entrar, mesmo cliente do Supabase. Não há nada a proibir: já
     aconteceu, com motivo escrito.

     O QUE É SEPARADO, e deve continuar, não é a autenticação — é a
     AUTORIZAÇÃO. `demandas.membros` é uma lista de gente própria, com papel
     próprio, e o esquema `demandas` está fora da API (`revoke all on schema`,
     migração 50): as nove funções `dem_*` são a única porta. Quem entra é a
     mesma pessoa; o que ela pode fazer de cada lado é decidido em lugares
     diferentes. Essa é a linha que não deve ser cruzada, e é outra linha.

     Fica registrado assim porque um registro de decisão errado é pior que
     registro nenhum: a próxima auditoria usaria esta nota para "provar" uma
     separação que não existe, e defenderia a fronteira errada.
   ============================================================================= */
