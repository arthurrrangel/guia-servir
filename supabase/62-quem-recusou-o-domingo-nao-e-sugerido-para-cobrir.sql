/* =============================================================================
   62 · QUEM RECUSOU O DOMINGO NÃO É SUGERIDO PARA COBRIR

   21/09/2026. Só de Escalas.

   -------------------------------------------------------------------------
   O DEFEITO, E O CAMINHO ATÉ ELE

   Este achado levou TRÊS rodadas de auditoria para aparecer, e as duas
   primeiras discutiram a função errada. Vale contar, porque o erro de método
   custou mais que o defeito.

   A segunda rodada levantou que `quemPodeCobrir`, em `lib/engine.ts`, não
   excluía quem tinha recusado OUTRO posto do mesmo domingo. Eu "corrigi".
   A terceira rodada provou duas coisas:

     1. no motor o defeito NÃO existe (`ocupadoNoDia` já fecha o caso, e a
        minha correção era inócua: as asserções passavam sem ela);
     2. `quemPodeCobrir` NÃO TEM UM ÚNICO CHAMADOR no app.

   A tela que de fato lista quem pode cobrir é `/eu/[token]`, e ela chama a
   RPC `eu_quem_cobre`. É AQUI que o defeito mora:

       and not exists (select 1 from escalacoes e2
                        join funcoes f2 on f2.id = e2.funcao_id and f2.simultanea
                       where e2.culto_id = p_culto_id and e2.voluntario_id = v.id
                         and e2.status <> 'recusado')

   O `<> 'recusado'` está ali por um motivo legítimo: um posto recusado é uma
   vaga, não uma ocupação. Só que a consequência é a PESSOA voltar a ficar
   disponível: quem recusou a FOTO deste domingo passa a ser oferecida para
   cobrir a PROJEÇÃO do mesmo domingo.

   E fica de cabeça para baixo: `furou` conta como ocupação (o filtro só tira
   `recusado`), então quem faltou é excluído e quem avisou que não pode é
   oferecido. O contrário do que a igreja quer nos dois casos.

   -------------------------------------------------------------------------
   POR QUE A INDISPONIBILIDADE NÃO COBRIA ISSO

   A consulta já tira quem tem linha em `indisponibilidades` naquele dia. Por
   isso o defeito só aparece numa janela precisa, e ela é a janela comum:

     · recusa pelo LINK do voluntário -> `eu_responder` grava a
       indisponibilidade junto, e o `not exists` de cima pega;

     · recusa DIGITADA PELA LÍDER na tela de Escala -> é `mudarStatus`
       (`lib/db.ts`), um `update` cru em `escalacoes`, sem indisponibilidade
       nenhuma. Nada pega.

   Ou seja: "a Ana me mandou no zap que não pode", a líder marca na tela, e o
   link da Bia oferece a Ana para cobrir, com o telefone dela e um botão de
   WhatsApp. Comprovado rodando contra um banco nascido do repositório.

   -------------------------------------------------------------------------
   O CONSERTO

   Uma guarda a mais, e só ela: quem tem QUALQUER posto `recusado` ou `furou`
   neste culto está fora da lista de quem pode cobrir. A pessoa já sinalizou
   que não está disponível naquele domingo, e o slot vazio dela não pode virar
   permissão para ser chamada em outro.

   É exatamente a regra que o motor já aplica do outro lado (`vagou` pega
   `recusado` E `furou`), e é a assimetria que o comentário de `engine.ts`
   chamava de inerte — ela era inerte lá, e não era aqui.

   O resto do corpo é o da 02, palavra por palavra.

   ORDEM:  ... 60 → 61 → 62
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(62);
  end if;
end $tranca$;


CREATE OR REPLACE FUNCTION public.eu_quem_cobre(p_token text, p_culto_id uuid)
 RETURNS TABLE(nome text, telefone text, nivel text, disse_que_pode boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_eq uuid; v_fn uuid; v_data date;
begin
  select v.id, v.equipe_id into v_id, v_eq
    from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  select c.data into v_data from cultos c where c.id = p_culto_id;
  if v_data is null then return; end if;

  /* a vaga que ESTA pessoa deixou neste domingo */
  select e.funcao_id into v_fn
    from escalacoes e join funcoes f on f.id = e.funcao_id
   where e.culto_id = p_culto_id and e.voluntario_id = v_id
     and f.equipe_id = v_eq and e.status in ('recusado','furou')
   limit 1;
  if v_fn is null then return; end if;

  return query
  select v.nome, v.telefone, h.nivel::text,
         exists (select 1 from disponibilidade d
                  where d.voluntario_id = v.id and d.data = v_data and d.pode)
    from voluntarios v
    join habilidades h on h.voluntario_id = v.id and h.funcao_id = v_fn
   where v.equipe_id = v_eq and v.ativo and v.id <> v_id
     and h.nivel in ('titular','reserva')          -- aprendiz não cobre buraco
     and nullif(v.telefone,'') is not null
     /* fora quem avisou que não pode neste domingo */
     and not exists (select 1 from indisponibilidades i
                      where i.voluntario_id = v.id and i.data = v_data)
     /* fora quem já está escalado em outra função no mesmo domingo */
     and not exists (select 1 from escalacoes e2
                      join funcoes f2 on f2.id = e2.funcao_id and f2.simultanea
                     where e2.culto_id = p_culto_id and e2.voluntario_id = v.id
                       and e2.status <> 'recusado')
     /* A GUARDA QUE A 62 ACRESCENTA, E É A ÚNICA MUDANÇA DESTE CORPO.

        Fora quem RECUSOU ou FUROU qualquer posto deste culto. O filtro logo
        acima tira `recusado` da conta de "ocupação", e tem razão em tirar (um
        posto recusado é vaga, não ocupação), mas o efeito colateral era a
        PESSOA voltar a ficar disponível: quem recusou a FOTO deste domingo
        era oferecida para cobrir a PROJEÇÃO do mesmo domingo, com telefone e
        botão de WhatsApp.

        E ficava de cabeça para baixo: `furou` contava como ocupação (o filtro
        só tira `recusado`), então quem faltou era excluída e quem avisou que
        não pode era oferecida.

        `indisponibilidades`, no filtro de cima, não cobria isso, e é por isso
        que o defeito passou: a recusa pelo LINK do voluntário grava a
        indisponibilidade junto (`eu_responder`), mas a recusa DIGITADA PELA
        LÍDER na tela de Escala é `mudarStatus`, um update cru em `escalacoes`
        que não gera linha nenhuma lá. */
     and not exists (select 1 from escalacoes e3
                      join funcoes f3 on f3.id = e3.funcao_id and f3.equipe_id = v_eq
                     where e3.culto_id = p_culto_id and e3.voluntario_id = v.id
                       and e3.status in ('recusado','furou'))
   order by exists (select 1 from disponibilidade d
                     where d.voluntario_id = v.id and d.data = v_data and d.pode) desc,
            (h.nivel = 'titular') desc, v.nome
   limit 3;
end $function$
;

revoke all on function public.eu_quem_cobre(text, uuid) from public;
grant execute on function public.eu_quem_cobre(text, uuid) to anon, authenticated;
comment on function public.eu_quem_cobre(text, uuid) is
  'Ate 3 sugestoes de quem pode cobrir a vaga de quem chamou, no culto dado. Desde a 62: quem RECUSOU ou FUROU qualquer posto daquele culto fica fora, porque recusa digitada pela lider nao gera linha em indisponibilidades.';


-- =========================================================================
-- REGISTRO NA RÉGUA E NA SONDA
-- =========================================================================

do $reg$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (62, '62 · eu_quem_cobre exclui quem recusou ou furou', 'eu_quem_cobre',
           'e3.status in (''recusado'',''furou'')')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;

  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo)
      values (62, '62-quem-recusou-o-domingo-nao-e-sugerido-para-cobrir.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;


-- =========================================================================
-- A CONFERÊNCIA
--
-- Monta o caso exato: a líder marca "recusado" na FOTO da Ana e a Bia,
-- escalada na PROJEÇÃO do mesmo domingo, pergunta quem pode cobrir.
-- Catálogo não serve: o `<> 'recusado'` estava lá, escrito, e parecia certo.
-- =========================================================================

do $conf$
declare
  v_eq uuid; v_foto uuid; v_proj uuid; v_dia date; v_culto uuid;
  v_ana uuid; v_bia uuid; v_carla uuid; v_tok text;
  n int; ok int := 0; falhou int := 0; msg text := '';
begin
  if to_regprocedure('public.eu_quem_cobre(text,uuid)') is null then
    raise notice 'PULEI a conferencia da 62: base sem eu_quem_cobre.'; return;
  end if;

  v_dia := (current_date + 500)::date;
  while exists (select 1 from cultos where data = v_dia)
        and v_dia < (current_date + 900)::date loop
    v_dia := (v_dia + 7)::date;
  end loop;
  if exists (select 1 from cultos where data = v_dia) then
    raise exception 'A conferencia da 62 nao achou data livre entre % e %. Nao escrevi nada.',
      (current_date + 500)::date, (current_date + 900)::date
      using errcode = 'raise_exception';
  end if;

  insert into equipes (slug, nome) values ('conf62','Conferencia 62') on conflict (slug) do nothing;
  select id into v_eq from equipes where slug = 'conf62';
  insert into funcoes (equipe_id, nome, simultanea, ordem, ativa, tipos)
       values (v_eq, 'FOTO CONF 62', true, 962, true, array['domingo']) returning id into v_foto;
  insert into funcoes (equipe_id, nome, simultanea, ordem, ativa, tipos)
       values (v_eq, 'PROJ CONF 62', true, 963, true, array['domingo']) returning id into v_proj;

  insert into voluntarios (equipe_id, nome, telefone, ativo)
       values (v_eq, 'Ana Conf Sessentaedois', '21911110062', true) returning id into v_ana;
  insert into voluntarios (equipe_id, nome, telefone, ativo)
       values (v_eq, 'Bia Conf Sessentaedois', '21922220062', true) returning id into v_bia;
  insert into voluntarios (equipe_id, nome, telefone, ativo)
       values (v_eq, 'Carla Conf Sessentaedois', '21933330062', true) returning id into v_carla;
  select token into v_tok from voluntarios where id = v_bia;

  /* as três sabem PROJ; a Ana também sabe FOTO */
  insert into habilidades (voluntario_id, funcao_id, nivel) values
    (v_ana, v_proj, 'titular'), (v_bia, v_proj, 'titular'), (v_carla, v_proj, 'titular'),
    (v_ana, v_foto, 'titular')
  on conflict do nothing;

  insert into cultos (data) values (v_dia) returning id into v_culto;

  /* O CENÁRIO, E ELE SÓ FAZ SENTIDO ASSIM.

     Quem CHAMA `eu_quem_cobre` é a pessoa que deixou a vaga: a função procura
     o posto dela com status `recusado` ou `furou` e devolve quem pode cobrir
     AQUELE posto. Então a Bia recusou a PROJEÇÃO e está perguntando quem
     cobre.

     A Ana, no mesmo domingo, teve a FOTO marcada como RECUSADO pela LÍDER.
     Repare no que NÃO existe: nenhuma linha em `indisponibilidades`. É
     exatamente o que `mudarStatus` faz, e é por isso que o filtro de
     indisponibilidade não pegava.

     A Ana sabe PROJEÇÃO. Antes da 62, ela aparecia na lista da Bia. */
  insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
       values (v_culto, v_foto, v_ana, 'recusado', false, false);
  insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
       values (v_culto, v_proj, v_bia, 'recusado', false, false);

  /* ---- 0. a lista não é vazia por outro motivo ------------------------- */
  select count(*) into n from eu_quem_cobre(v_tok, v_culto);
  if n > 0 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x a lista veio vazia: o caso nao esta montado e os testes abaixo seriam vacuos';
  end if;

  /* ---- 1. a Ana NÃO pode ser sugerida para cobrir a Bia ---------------- */
  select count(*) into n from eu_quem_cobre(v_tok, v_culto) q
   where q.nome = 'Ana Conf Sessentaedois';
  if n = 0 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x quem a lider marcou como RECUSADO no mesmo domingo foi sugerida para cobrir';
  end if;

  /* ---- 2. mas a Carla, que não recusou nada, TEM que ser --------------- */
  select count(*) into n from eu_quem_cobre(v_tok, v_culto) q
   where q.nome = 'Carla Conf Sessentaedois';
  if n = 1 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x a guarda nova esvaziou a lista: a Carla, que nao recusou nada, sumiu';
  end if;

  /* ---- 3. e o mesmo vale para quem FUROU ------------------------------- */
  update escalacoes set status = 'furou'
   where culto_id = v_culto and funcao_id = v_foto and voluntario_id = v_ana;
  select count(*) into n from eu_quem_cobre(v_tok, v_culto) q
   where q.nome = 'Ana Conf Sessentaedois';
  if n = 0 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x quem FUROU no mesmo domingo foi sugerida para cobrir';
  end if;

  /* ---- 4. e sem recusa nenhuma, a Ana volta a ser sugerida ------------- */
  delete from escalacoes where culto_id = v_culto and funcao_id = v_foto;
  select count(*) into n from eu_quem_cobre(v_tok, v_culto) q
   where q.nome = 'Ana Conf Sessentaedois';
  if n = 1 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x sem recusa nenhuma a Ana devia voltar a lista, e nao voltou';
  end if;

  /* ---- limpeza, por id ------------------------------------------------- */
  delete from escalacoes where culto_id = v_culto;
  delete from habilidades where funcao_id in (v_foto, v_proj);
  delete from voluntarios where id in (v_ana, v_bia, v_carla);
  delete from funcoes where id in (v_foto, v_proj);
  delete from cultos where id = v_culto;
  delete from equipes where id = v_eq;

  if falhou > 0 then
    raise exception 'A CONFERENCIA DA 62 REPROVOU: % de % casos', falhou, ok + falhou
      using detail = msg, errcode = 'raise_exception';
  end if;
  raise notice '62 · conferencia: %/% casos. Quem recusou ou furou o domingo nao e sugerido para cobrir, e quem nao recusou continua sendo.', ok, ok;
end $conf$;


/* =============================================================================
   ROLLBACK
     Copiar o corpo de `eu_quem_cobre` da migração 02 por cima. A única
     diferença é a guarda `e3.status in ('recusado','furou')`.
   ============================================================================= */
