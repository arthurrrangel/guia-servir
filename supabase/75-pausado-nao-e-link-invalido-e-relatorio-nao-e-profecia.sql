-- =========================================================================
-- 75 · QUATRO COISAS QUE A TELA DO VOLUNTÁRIO DIZIA SEM SER VERDADE
--
-- 21/09/2026. Oitava rodada, virada para a tela de quem serve — que é a
-- única tela do sistema que a igreja inteira abre, e a única em que não há
-- ninguém por perto para traduzir o que apareceu.
--
-- -------------------------------------------------------------------------
-- 1. QUEM FOI PAUSADO LÊ QUE O LINK DELE NÃO PRESTA
--
-- `quem_sou` e `eu_dados` buscavam `where v.token = p_token and v.ativo`.
-- Token de quem foi pausado caía no mesmo `null` de um token inventado, e a
-- tela escrevia:
--
--     "Esse link não é válido. Peça o seu link de novo para quem organiza a
--      igreja."
--
-- Pausar alguém é rotina — é um botão na tela do time, para quem vai viajar
-- ou tirar um tempo. Medido: pausei um voluntário, abri o link dele, e a
-- tela deu link inválido. Ele vai pedir um link novo, vão mandar o mesmo, e
-- vai dar de novo. Ninguém dos dois lados fica sabendo que o lugar está
-- pausado, que é a única informação que resolveria.
--
-- -------------------------------------------------------------------------
-- 2. RELATÓRIO DE CULTO QUE AINDA NÃO ACONTECEU, ESCRITO POR QUEM NÃO FOI
--
-- `eu_relatorio` perguntava só "você está escalado num posto que relata?".
-- Não perguntava quando, nem se a pessoa foi. Medido, num banco nascido do
-- repositório: uma voluntária com a escalação marcada `recusado` num culto a
-- SESSENTA DIAS de distância escreveu
--
--     "O culto foi otimo, todos vieram."
--
-- e `culto_obs` guardou. No painel, isso é o relatório do culto: a única
-- memória que a igreja tem de como o dia foi. Passou a ter a memória de um
-- dia que não aconteceu, escrita por quem disse que não ia.
--
-- A tela não desenha o formulário antes do culto começar — a regra estava na
-- TELA, e a função é chamada pela rede. Mesmo formato do defeito que a 71
-- consertou em `eu_responder`, e é o terceiro desta forma nesta auditoria.
--
-- -------------------------------------------------------------------------
-- 3. "CONFIRMADO. OBRIGADO!" QUANDO NADA FOI GRAVADO
--
-- `eu_responder` devolvia `void`. Quando não havia posto daquela pessoa
-- naquele culto — tela velha numa aba, link antigo no grupo, a líder tirou
-- ela do posto entre a tela carregar e ela responder — a função voltava em
-- silêncio (o que está certo: não é erro dela) e a tela escrevia
-- "Confirmado. Obrigado!". A pessoa fecha o celular achando que confirmou.
--
-- Agora ela devolve `{ok, mudou, motivo}`, e a tela tem como dizer a verdade.
--
-- -------------------------------------------------------------------------
-- O QUE FICA PARA OUTRA MIGRAÇÃO, medido mas não consertado aqui:
--
--   · "Quem serve com você: mais 1 pessoa" quando é a MESMA pessoa em dois
--     postos. Medido: `eu_quem_serve` devolve uma linha por POSTO, o que a
--     lista quer, e é a TELA que conta linha achando que conta gente — então
--     o conserto é na tela, e está no mesmo commit, fora desta migração.
--   · "Bem-vindo" para quem serve há meses e só não tem nada marcado à
--     frente: também da tela (`novo = agenda.length === 0`).
--   · `eu_sexo` sobrescrevendo resposta já dada em todos os vínculos. Ainda
--     não medi dano de verdade: a tela só pergunta quando está nulo, então
--     é porta de API sem consumidor — entra na próxima rodada, com medição.
-- =========================================================================

/* A TRANCA. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(75);
  end if;
end $tranca$;

CREATE OR REPLACE FUNCTION public.quem_sou(p_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pessoa uuid; v_email text; r jsonb;
  v_ativo boolean; v_eqnome text; v_achou boolean;
begin
  if p_token is not null and btrim(p_token) <> '' then
    /* ========================================================= 75 ======
       PAUSADO NÃO É LINK INVÁLIDO, E A DIFERENÇA É A PESSOA IR OU NÃO IR
       ATRÁS DA COISA CERTA.

       Estava `where v.token = p_token and v.ativo`: o token de quem foi
       PAUSADO caía no mesmo `null` de um token inventado, e a tela dizia
       "Esse link não é válido. Peça o seu link de novo para quem organiza a
       igreja." — mandando a pessoa pedir um link que vai dar na mesma.

       Pausar alguém é rotina: é um botão na tela do time, para quem vai
       viajar ou tirar um tempo. Medido em 21/09 num banco nascido do
       repositório: pausei um voluntário, abri o link dele, e a tela deu
       link inválido.

       `v_achou` é uma variável à parte de propósito: `not found` depois de
       um `select into` não serve aqui, porque a linha pode existir com
       `pessoa_id` nulo (cadastro antigo), e aí `found` é verdadeiro e
       `v_pessoa` é nulo ao mesmo tempo. */
    select true, v.pessoa_id, v.ativo, e.nome
      into v_achou, v_pessoa, v_ativo, v_eqnome
      from voluntarios v join equipes e on e.id = v.equipe_id
     where v.token = p_token;
    if not coalesce(v_achou, false) then
      return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO');
    end if;
    if not coalesce(v_ativo, false) then
      return jsonb_build_object('ok', false, 'erro', 'VINCULO_PAUSADO',
                                'equipe', v_eqnome);
    end if;
    if v_pessoa is null then
      return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO');
    end if;
  else
    v_email := nullif(auth.jwt() ->> 'email', '');
    if v_email is null then
      return jsonb_build_object('ok', false, 'erro', 'SEM_CREDENCIAL');
    end if;
    select p.id into v_pessoa from pessoas p where lower(p.auth_email) = lower(v_email);
    if v_pessoa is null then
      return jsonb_build_object('ok', true, 'conhecida', false,
                                'admin', false, 'organiza', '[]'::jsonb, 'serve', '[]'::jsonb);
    end if;
  end if;

  select jsonb_build_object(
    'ok', true,
    'conhecida', true,
    'pessoa', jsonb_build_object(
      'id', p.id,
      'nome', p.nome,
      'primeiro_nome', split_part(p.nome, ' ', 1),
      'email', p.email,
      'telefone_final', right(coalesce(p.telefone, ''), 4)),

    'admin', exists (select 1 from papeis x where x.pessoa_id = p.id and x.papel = 'admin'),

    'organiza', coalesce((
      select jsonb_agg(jsonb_build_object('equipe', e.nome, 'slug', e.slug) order by e.ordem)
        from papeis x join equipes e on e.id = x.equipe_id
       where x.pessoa_id = p.id and x.papel = 'lider'), '[]'::jsonb),

    'serve', coalesce((
      select jsonb_agg(jsonb_build_object(
               'equipe', e.nome, 'slug', e.slug, 'artigo', coalesce(e.artigo,'o'),
               'ativo', v.ativo, 'conferido', v.conferido, 'tem_pin', v.pin_hash is not null,
               'este', coalesce(v.token = p_token, false),
               /* 18/09/2026: o que a tela precisa para decidir se pergunta. */
               'sexo', v.sexo,
               'precisa_sexo', exists (
                 select 1 from habilidades h join funcoes f on f.id = h.funcao_id
                  where h.voluntario_id = v.id and f.ativa and f.exige_sexo is not null),
               'funcoes', coalesce((select jsonb_agg(f.nome order by f.ordem)
                                      from habilidades h join funcoes f on f.id = h.funcao_id
                                     where h.voluntario_id = v.id), '[]'::jsonb))
             order by e.ordem)
        from voluntarios v join equipes e on e.id = v.equipe_id
       where v.pessoa_id = p.id and v.ativo), '[]'::jsonb)
  ) into r
  from pessoas p where p.id = v_pessoa;

  return r;
end $function$

;
CREATE OR REPLACE FUNCTION public.eu_dados(p_token text)
 RETURNS TABLE(nome text, equipe text, escalas jsonb, indisponivel jsonb, disponivel jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_nome text; v_eq uuid; v_eqnome text; v_ativo boolean; v_artigo text;
begin
  /* ============================================================ 75 ======
     A MESMA CORREÇÃO DE `quem_sou`: pausado não é link inválido.

     `and v.ativo` fazia o vínculo pausado levantar `Link invalido`, e a tela
     do voluntário traduz isso para "Esse link não é válido. Peça o seu link
     de novo" — para alguém cujo link está perfeito e cujo lugar só está
     guardado. Agora a frase diz o que é, e diz de qual ministério. */
  select v.id, v.nome, v.equipe_id, v.ativo into v_id, v_nome, v_eq, v_ativo
    from voluntarios v where v.token = p_token;
  if v_id is null then raise exception 'Link invalido'; end if;
  /* o artigo vem da tabela: "n*o* Louvor" e "n*a* Midia". A coluna existe
     desde a 12 e `quem_sou` já a usa; escrever "no Mídia" na tela de alguém
     seria a igreja falando errado o nome do próprio ministério. */
  select e.nome, 'n' || coalesce(e.artigo, 'o') into v_eqnome, v_artigo
    from equipes e where e.id = v_eq;
  if not coalesce(v_ativo, false) then
    raise exception 'VINCULO_PAUSADO: seu lugar % % esta pausado.',
      coalesce(v_artigo, 'no'), coalesce(v_eqnome, 'ministerio')
      using errcode = 'raise_exception';
  end if;

  return query select v_nome, coalesce(v_eqnome,'Escala'),
    coalesce((select jsonb_agg(x order by x->>'data') from (
        select jsonb_build_object('culto_id',c.id,'data',c.data,'funcao',f.nome,'status',e.status,
                 /* 71 · `funcao_id`: sem ele a tela não tem como responder POR
                    POSTO, e um toque em "Não posso" derrubava todos os postos
                    da pessoa naquele domingo. */
                 'funcao_id',f.id,
                 /* 71 · `evento` e `inicio`: a tela do voluntário não sabia que
                    evento esporádico existe. `diaLongo` chama de "domingo" tudo
                    que não é sábado, e `criar_evento` SÓ aceita dia que não é
                    domingo nem sábado de Follow — então TODO evento aparecia
                    como "domingo" para quem serve nele, com a hora do domingo
                    no lembrete do calendário. É a pessoa indo no dia errado.
                    A tela da líder já mostra o nome do evento desde a 54. */
                 'evento',c.evento,
                 'inicio',c.inicio,
                 /* 71 · de quem é o relatório que está no campo. `culto_obs` tem
                    UMA linha por (culto, equipe), e o Connect tem DOIS postos
                    que relatam: o segundo líder abria a tela, encontrava o
                    texto do primeiro dentro da caixa dele sob o rótulo
                    "Relatório enviado", escrevia o dele, e o do primeiro sumia
                    junto com os problemas que ele tinha anotado. */
                 'relatado_por',(select vr.nome from culto_obs o
                                   join voluntarios vr on vr.id = o.relatado_por
                                  where o.culto_id=c.id and o.equipe_id=v_eq),
                 'relatado_eu',(select o.relatado_por = v_id from culto_obs o
                                 where o.culto_id=c.id and o.equipe_id=v_eq),
                 'primeira_vez',e.primeira_vez,
                 'escalado_em',e.escalado_em,
                 'obs',(select o.obs from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'relata', f.relata,
                 'relatorio',(select o.relatorio from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'problemas',(select o.problemas from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'plantao',false) as x
          from escalacoes e join cultos c on c.id=e.culto_id join funcoes f on f.id=e.funcao_id
         where e.voluntario_id = v_id and c.data >= current_date - 1
        union all
        select jsonb_build_object('culto_id',c.id,'data',c.data,'funcao','PLANTAO','status','pendente',
                 'funcao_id',null,'evento',c.evento,'inicio',c.inicio,
                 'relatado_por',null,'relatado_eu',null,
                 'primeira_vez',false,
                 'escalado_em',null,
                 'obs',(select o.obs from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'relata', false, 'relatorio', null, 'problemas', null,
                 'plantao',true)
          from plantoes p join cultos c on c.id=p.culto_id
         where p.voluntario_id = v_id and c.data >= current_date - 1) t), '[]'::jsonb),
    coalesce((select jsonb_agg(i.data order by i.data) from indisponibilidades i
               where i.voluntario_id = v_id and i.data >= current_date), '[]'::jsonb),
    coalesce((select jsonb_agg(d.data order by d.data) from disponibilidade d
               where d.voluntario_id = v_id and d.pode = true and d.data >= current_date), '[]'::jsonb);
end $function$

;
CREATE OR REPLACE FUNCTION public.eu_relatorio(p_token text, p_culto_id uuid, p_texto text, p_problemas text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_eq uuid; v_data date; v_inicio time;
begin
  select v.id, v.equipe_id into v_id, v_eq
    from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  /* só quem estava REALMENTE escalado num posto de relato naquele domingo.
     Sem isso qualquer token válido escreveria o relatório de qualquer culto. */
  if not exists (
    select 1 from escalacoes e join funcoes f on f.id = e.funcao_id
     where e.culto_id = p_culto_id and e.voluntario_id = v_id and f.relata
  ) then raise exception 'Voce nao e o lider deste culto'; end if;

  /* ============================================================ 75 ======
     DUAS COISAS QUE ESTA FUNÇÃO ACEITAVA E QUE VIRAM HISTÓRIA FALSA.

     O guarda acima pergunta "você está escalado num posto que relata?". Ele
     não pergunta QUANDO nem SE a pessoa foi. Medido em 21/09, num banco
     nascido do repositório: uma voluntária com a escalação marcada como
     `recusado` num culto a SESSENTA DIAS de distância escreveu

         "O culto foi otimo, todos vieram."

     e `culto_obs` guardou. No painel, isso é o relatório do culto — a única
     memória que a igreja tem de como o dia foi. Ela passou a ter a memória
     de um dia que não aconteceu, escrita por quem disse que não ia.

     A tela do voluntário já não desenha o formulário antes do culto começar,
     e é por isso que isto nunca apareceu: a regra estava na TELA, e a função
     é chamada pela rede. É o mesmo formato do defeito que a 71 consertou em
     `eu_responder`.

     O corte do dia é o começo do culto, e não a meia-noite: relatório se
     escreve no fim do culto, e quem abre a tela de manhã não deveria poder.
     Sem hora cadastrada vale 18:00, que é o que o resto do sistema já
     assume: `eu_quem_cobre` (76) e `horasAte` na tela do voluntário usam
     18h.

     A primeira versão usava meio-dia, e isso era um buraco de seis horas em
     TODO culto de produção: `cultos.inicio` é nullable sem default, e
     `salvar_dia` — a única função que cria culto regular — faz
     `insert into cultos (data) values (p_data)` sem hora. O ramo do
     `coalesce` não é a exceção, é o caso comum. Às 12h01 de um domingo de
     culto das 18h, quem estava escalado escrevia "o culto foi ótimo" pela
     rede.

     E os dois cultos da conferência abaixo passavam `inicio` explícito,
     então o ramo do `coalesce` — o único que roda em produção — não era
     exercitado por nenhum dos nove casos. O caso 4b agora exercita. */
  select c.data, c.inicio into v_data, v_inicio from cultos c where c.id = p_culto_id;
  if v_data is null then raise exception 'Esse culto nao existe'; end if;
  if (v_data + coalesce(v_inicio, time '18:00')) at time zone 'America/Sao_Paulo' > now() then
    raise exception 'RELATORIO_ANTES_DA_HORA: o culto de % ainda nao comecou, e relatorio se escreve depois.', v_data
      using errcode = 'raise_exception';
  end if;

  if not exists (
    select 1 from escalacoes e join funcoes f on f.id = e.funcao_id
     where e.culto_id = p_culto_id and e.voluntario_id = v_id and f.relata
       and e.status not in ('recusado','furou')
  ) then
    raise exception 'RELATORIO_DE_QUEM_NAO_FOI: voce marcou que nao ia neste dia, entao nao da para relatar como foi.'
      using errcode = 'raise_exception';
  end if;

  insert into culto_obs (culto_id, equipe_id, obs, relatorio, problemas, relatado_por, relatado_em)
       values (p_culto_id, v_eq, '', nullif(btrim(coalesce(p_texto,'')), ''),
               nullif(btrim(coalesce(p_problemas,'')), ''), v_id, now())
  on conflict (culto_id, equipe_id) do update
     set relatorio = excluded.relatorio, problemas = excluded.problemas,
         relatado_por = excluded.relatado_por, relatado_em = excluded.relatado_em;
end $function$

;

-- =========================================================================
-- `eu_responder` PASSA A DIZER O QUE ESCREVEU
--
-- `drop` antes de `create`: não dá para trocar o tipo de retorno com
-- `create or replace`. As duas versões caem e voltam juntas, porque a de três
-- argumentos delega para a de quatro e tem que devolver o mesmo.
--
-- A de três continua existindo pelo motivo da 71: o deploy que está no ar
-- chama com três, e migração não pode depender de deploy.
-- =========================================================================
drop function if exists public.eu_responder(text, uuid, text, uuid);
drop function if exists public.eu_responder(text, uuid, text);
CREATE OR REPLACE FUNCTION public.eu_responder(p_token text, p_culto_id uuid, p_status text, p_funcao_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_data date; v_n int;
begin
  if p_status not in ('confirmado','recusado') then raise exception 'Resposta invalida'; end if;
  select id into v_id from voluntarios where token = p_token and ativo;
  if v_id is null then raise exception 'Link invalido'; end if;
  select data into v_data from cultos where id = p_culto_id;

  /* 65 · MUDANÇA 1: culto que não existe. Antes `v_data` ficava nulo e a
     função seguia mexendo em `indisponibilidades` com `data = null`. */
  if v_data is null then raise exception 'Esse culto nao existe mais.'; end if;

  /* 65 · MUDANÇA 2: a ORDEM inverteu, e é o coração deste arquivo.
     Antes a função apagava a indisponibilidade ANTES de tentar atualizar a
     escalação — então um culto em que a pessoa não tem posto nenhum (tela
     velha aberta, id de outra equipe, link antigo no WhatsApp) apagava o "não
     posso" dela daquele dia, em silêncio, sem mudar mais nada. Agora a
     escalação decide: se nada meu mudou, o dia não é tocado.

     MUDANÇA 3, na mesma instrução: `and e.status <> 'furou'`. A irmã
     `eu_indisponibilidade` tem essa guarda desde o primeiro dia; esta não
     tinha, e por isso quem furou podia abrir o link, tocar "Eu vou" e apagar
     o registro que a liderança fez. Furo é fato observado por quem estava
     lá; desfazer é ato de quem lidera, na tela de Escala. */
  /* 71 · `and (p_funcao_id is null or funcao_id = p_funcao_id)`.

     A tela desenha UM CARTÃO POR POSTO, cada um com "Eu vou" e "Não posso", e
     esta função mexia no culto INTEIRO. Medido em 21/09: a pessoa tinha FOTO
     confirmada e EDIÇÃO pendente, tocou "Não posso" no cartão da EDIÇÃO, e as
     DUAS viraram `recusado`. A líder vê duas vagas e remaneja gente que não
     precisava.

     O caminho de volta era pior: "Consegui, posso sim" num posto RECONFIRMAVA
     o outro, que ela tinha recusado de propósito — e ela aparece escalada num
     lugar onde disse que não podia.

     `p_funcao_id` nulo continua querendo dizer "respondo pelo dia inteiro",
     que é uma resposta legítima e é o que a versão de três argumentos manda. */
  update escalacoes set status = p_status::status_escala, respondido_em = now()
   where culto_id = p_culto_id and voluntario_id = v_id
     and status <> 'furou'
     and (p_funcao_id is null or funcao_id = p_funcao_id);
  get diagnostics v_n = row_count;

  if v_n = 0 then
    if exists (select 1 from escalacoes
                where culto_id = p_culto_id and voluntario_id = v_id and status = 'furou') then
      raise exception 'A lideranca registrou falta nesse dia. Fale com quem organiza a sua area.';
    end if;
    /* ========================================================== 75 ======
       NADA FOI ESCRITO, E A TELA PRECISA SABER DISSO.

       Este `return` existe desde a 65 e está certo: não é erro da pessoa, e
       não há dia para marcar. O problema é que a função devolvia `void`,
       então a tela não tinha como distinguir "gravei" de "não havia o que
       gravar" — e escrevia, nos dois casos:

           "Confirmado. Obrigado!"

       Acontece com tela velha aberta numa aba, com link antigo mandado no
       grupo, e quando a líder tira a pessoa do posto entre a tela carregar e
       ela responder. A pessoa fecha o celular achando que confirmou. */
    return jsonb_build_object('ok', true, 'mudou', 0, 'motivo', 'SEM_POSTO_SEU');
  end if;

  /* 65 · as duas escritas passam pelo lugar só. 71 · E O DIA DEIXA DE SAIR DA
     ÚLTIMA TECLA.

     Era `eu_marcar_dia(..., p_status = 'confirmado')`: recusar UM posto
     marcava o DIA inteiro como indisponível, mesmo com a pessoa continuando
     escalada e confirmada em outro. O motor então a tirava de um domingo em
     que ela tinha dito que ia.

     A pergunta certa não é "o que ela acabou de teclar" e sim "depois desta
     resposta, ela ainda vem neste dia?". Ela vem se sobrou qualquer posto dela
     que não esteja recusado nem furado. */
  perform eu_marcar_dia(v_id, v_data,
    exists (select 1 from escalacoes e
             where e.culto_id = p_culto_id and e.voluntario_id = v_id
               and e.status not in ('recusado','furou')));

  return jsonb_build_object('ok', true, 'mudou', v_n, 'status', p_status);
end $function$;
CREATE OR REPLACE FUNCTION public.eu_responder(p_token text, p_culto_id uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return public.eu_responder(p_token, p_culto_id, p_status, null::uuid);
end $function$;

revoke all on function public.eu_responder(text, uuid, text, uuid) from public, authenticated;
revoke all on function public.eu_responder(text, uuid, text)       from public, authenticated;
grant execute on function public.eu_responder(text, uuid, text, uuid) to anon, authenticated;
grant execute on function public.eu_responder(text, uuid, text)       to anon, authenticated;

do $reg$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (75, '75 · pausado nao e link invalido (quem_sou)', 'quem_sou', 'vinculo_pausado'),
      (75, '75 · pausado nao e link invalido (eu_dados)', 'eu_dados', 'vinculo_pausado'),
      (75, '75 · relatorio so depois do culto comecar', 'eu_relatorio', 'relatorio_antes_da_hora'),
      (75, '75 · relatorio nao e de quem recusou', 'eu_relatorio', 'relatorio_de_quem_nao_foi'),
      (75, '75 · eu_responder diz o que escreveu', 'eu_responder', 'sem_posto_seu')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo)
      values (75, '75-pausado-nao-e-link-invalido-e-relatorio-nao-e-profecia.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;

-- =========================================================================
-- CONFERÊNCIA
-- =========================================================================
do $conferir$
declare
  v_falhas text := ''; v_eq uuid; v_p uuid; v_v uuid; v_tok text;
  v_fn uuid; v_fn2 uuid; v_futuro uuid; v_passado uuid; v_j jsonb; v_erro text; v_n int;
  v_suf text; v_meu_futuro boolean := false; v_meu_passado boolean := false;
  v_hoje uuid; v_meu_hoje boolean := false;
begin
  /* O CENÁRIO É CRIADO AQUI, e não lido do banco.

     A primeira versão procurava um posto com `relata` no Louvor e reprovava
     quando não achava — e num banco nascido do repositório não há nenhum.
     Conferência que depende do que o banco por acaso tem é a mesma família
     de defeito que a 70 e a 72 consertaram nas funções de teste: ou vira
     vermelho sem motivo, ou vira verde sem ter testado. */
  v_suf := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  insert into equipes (nome, slug, ordem)
       values ('Conf75 ' || v_suf, 'conf75-' || v_suf, 9995) returning id into v_eq;
  insert into funcoes (equipe_id, nome, ordem, ativa, tipos, relata)
       values (v_eq, 'LIDER DO DIA', 1, true, array['domingo'], true) returning id into v_fn;
  insert into funcoes (equipe_id, nome, ordem, ativa, tipos, relata)
       values (v_eq, 'OUTRO POSTO', 2, true, array['domingo'], false) returning id into v_fn2;

  insert into pessoas (nome, telefone) values ('Conf75 ' || v_suf, '21900000075') returning id into v_p;
  insert into voluntarios (equipe_id, pessoa_id, nome, telefone, conferido, ativo)
       values (v_eq, v_p, 'Conf75 ' || v_suf, '21900000075', true, true)
    returning id, token into v_v, v_tok;

  -- 1 · vínculo ATIVO responde normalmente (senão o resto é vácuo)
  if coalesce(quem_sou(v_tok) ->> 'ok', 'false') <> 'true' then
    v_falhas := v_falhas || E'\n  1. quem_sou nao responde para um vinculo ATIVO';
  end if;

  -- 2 · PAUSADO diz que está pausado, e diz de qual ministério
  update voluntarios set ativo = false where id = v_v;
  v_j := quem_sou(v_tok);
  if coalesce(v_j ->> 'erro', '') <> 'VINCULO_PAUSADO' then
    v_falhas := v_falhas || format(E'\n  2. quem_sou com vinculo pausado respondeu %s', v_j::text);
  end if;
  if coalesce(v_j ->> 'equipe', '') = '' then
    v_falhas := v_falhas || E'\n  2b. quem_sou nao disse de QUAL ministerio o lugar esta pausado';
  end if;

  begin
    perform * from eu_dados(v_tok); v_erro := 'RESPONDEU';
  exception when others then v_erro := sqlerrm; end;
  if v_erro not like 'VINCULO_PAUSADO%' then
    v_falhas := v_falhas || format(E'\n  2c. eu_dados com vinculo pausado disse "%s"', v_erro);
  end if;

  -- 3 · e token INVENTADO continua sendo link inválido, que é outra coisa
  if coalesce(quem_sou('nao-existe-este-token-75') ->> 'erro', '') <> 'LINK_INVALIDO' then
    v_falhas := v_falhas || E'\n  3. token inventado deixou de ser LINK_INVALIDO';
  end if;
  update voluntarios set ativo = true where id = v_v;

  -- 4 · RELATÓRIO DE CULTO QUE NÃO COMEÇOU
  /* REUSA o calendário, como a 76 faz. A primeira versão inseria direto e
     morria em `ux_cultos_data_regular` — o índice da 56 funcionando: culto
     regular é UM por data. Medido: aplicar esta migração num DOMINGO faz
     `current_date - 7` cair num domingo que tem culto há semanas, e o
     arquivo inteiro se recusa a aplicar com erro cru. Ela passou em 21/09
     por acidente de calendário: era segunda, e nem -7 nem +60 eram dia de
     culto. */
  select id into v_futuro from cultos where data = current_date + 60 and evento is null;
  if v_futuro is null then
    insert into cultos (data, inicio) values (current_date + 60, time '18:00') returning id into v_futuro;
    v_meu_futuro := true;
  end if;
  insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
       values (v_futuro, v_fn, v_v, 'confirmado', false, false);
  begin
    perform eu_relatorio(v_tok, v_futuro, 'O culto foi otimo.', null); v_erro := 'ACEITOU';
  exception when others then v_erro := sqlerrm; end;
  if v_erro not like 'RELATORIO_ANTES_DA_HORA%' then
    v_falhas := v_falhas || format(E'\n  4. relatorio de culto a 60 dias: "%s"', v_erro);
  end if;
  if exists (select 1 from culto_obs where culto_id = v_futuro and relatorio is not null) then
    v_falhas := v_falhas || E'\n  4b. e o texto FOI GRAVADO mesmo assim';
  end if;

  /* 4c · O RAMO DO `coalesce`, QUE É O ÚNICO QUE RODA EM PRODUÇÃO.

     `cultos.inicio` é nullable sem default e `salvar_dia` nunca o preenche,
     então TODO domingo e TODO sábado de Follow chegam aqui com `inicio`
     nulo. Os dois cultos do cenário acima passam hora explícita, então este
     ramo não era exercitado por caso nenhum — e foi onde o meio-dia da
     primeira versão abriu seis horas de janela.

     O culto é o de HOJE, sem hora: às 00h01 ele ainda não começou. */
  begin
    select id into v_hoje from cultos where data = current_date and evento is null;
    if v_hoje is null then
      insert into cultos (data) values (current_date) returning id into v_hoje;
      v_meu_hoje := true;
    else
      update cultos set inicio = null where id = v_hoje;
    end if;
    insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
         values (v_hoje, v_fn, v_v, 'confirmado', false, false)
      on conflict do nothing;
  end;
  if (current_date + time '18:00') at time zone 'America/Sao_Paulo' > now() then
    /* ainda não são 18h: o relatório tem que ser recusado */
    begin
      perform eu_relatorio(v_tok, v_hoje, 'Escrevi antes das 18h.', null); v_erro := 'ACEITOU';
    exception when others then v_erro := sqlerrm; end;
    if v_erro not like 'RELATORIO_ANTES_DA_HORA%' then
      v_falhas := v_falhas || format(
        E'\n  4c. culto de hoje SEM hora cadastrada, antes das 18h: "%s"', v_erro);
    end if;
  else
    /* já passou das 18h: tem que aceitar, senão a guarda tranca quem foi */
    begin
      perform eu_relatorio(v_tok, v_hoje, 'Escrevi depois das 18h.', null); v_erro := 'ok';
    exception when others then v_erro := sqlerrm; end;
    if v_erro <> 'ok' then
      v_falhas := v_falhas || format(
        E'\n  4c. culto de hoje SEM hora, DEPOIS das 18h, foi recusado: "%s"', v_erro);
    end if;
  end if;
  /* e o default é 18:00 e não outro: o caso acima só mede um dos dois lados
     por dia, então a constante fica pinada no corpo da função */
  select (position('coalesce(v_inicio, time ''18:00'')' in
                   regexp_replace(prosrc, '\s+', ' ', 'g')) > 0)::int
    into v_n from pg_proc where proname = 'eu_relatorio';
  if v_n <> 1 then
    v_falhas := v_falhas || E'\n  4d. a hora padrao do relatorio nao e 18:00 (era meio-dia, e abria 6h de janela)';
  end if;

  -- 5 · RELATÓRIO DE QUEM RECUSOU, num culto que JÁ PASSOU
  select id into v_passado from cultos where data = current_date - 7 and evento is null;
  if v_passado is null then
    insert into cultos (data, inicio) values (current_date - 7, time '18:00') returning id into v_passado;
    v_meu_passado := true;
  end if;
  insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
       values (v_passado, v_fn, v_v, 'recusado', false, false);
  begin
    perform eu_relatorio(v_tok, v_passado, 'Todos vieram.', null); v_erro := 'ACEITOU';
  exception when others then v_erro := sqlerrm; end;
  if v_erro not like 'RELATORIO_DE_QUEM_NAO_FOI%' then
    v_falhas := v_falhas || format(E'\n  5. relatorio de quem recusou: "%s"', v_erro);
  end if;

  -- 6 · E QUEM FOI, NUM CULTO QUE JÁ PASSOU, CONTINUA PODENDO RELATAR.
  --     Sem este caso os dois de cima poderiam ser um `raise` no topo da
  --     função, e a igreja ficaria sem relatório nenhum.
  update escalacoes set status = 'confirmado'
   where culto_id = v_passado and voluntario_id = v_v;
  begin
    perform eu_relatorio(v_tok, v_passado, 'Culto tranquilo, som ok.', 'Microfone 2 falhando.');
    v_erro := 'ok';
  exception when others then v_erro := sqlerrm; end;
  if v_erro <> 'ok' then
    v_falhas := v_falhas || format(E'\n  6. quem FOI nao conseguiu relatar: "%s"', v_erro);
  end if;
  if not exists (select 1 from culto_obs
                  where culto_id = v_passado and equipe_id = v_eq
                    and relatorio = 'Culto tranquilo, som ok.') then
    v_falhas := v_falhas || E'\n  6b. o relatorio de quem foi nao ficou gravado';
  end if;

  -- 7 · `eu_responder` DIZ O QUE ESCREVEU
  v_j := eu_responder(v_tok, v_passado, 'confirmado', null::uuid);
  if coalesce((v_j ->> 'mudou')::int, -1) < 1 then
    v_falhas := v_falhas || format(E'\n  7. eu_responder gravou e disse %s', v_j::text);
  end if;

  -- 8 · E DIZ QUANDO NÃO ESCREVEU NADA — era aqui que a tela agradecia à toa
  v_j := eu_responder(v_tok, v_futuro, 'confirmado', v_fn2);
  if coalesce((v_j ->> 'mudou')::int, -1) <> 0
     or coalesce(v_j ->> 'motivo', '') <> 'SEM_POSTO_SEU' then
    v_falhas := v_falhas || format(
      E'\n  8. eu_responder num posto que nao e dela devolveu %s (esperava mudou=0, SEM_POSTO_SEU)', v_j::text);
  end if;

  -- 9 · a versão de TRÊS argumentos, que o deploy no ar usa, devolve o mesmo
  v_j := eu_responder(v_tok, v_passado, 'recusado');
  if coalesce(v_j ->> 'ok', '') <> 'true' then
    v_falhas := v_falhas || format(E'\n  9. a versao de 3 argumentos devolveu %s', v_j::text);
  end if;
  select count(*) into v_n from pg_proc
   where proname = 'eu_responder' and pronamespace = 'public'::regnamespace;
  if v_n <> 2 then
    v_falhas := v_falhas || format(E'\n  9b. eu_responder tem %s versao(oes), esperava 2', v_n);
  end if;

  -- limpeza
  /* `culto_obs` do culto REUSADO: apaga só a linha da equipe de teste, que é
     a única que esta conferência escreveu. A linha da equipe real guarda a
     anotação da líder daquele dia. Mesmo defeito que a 71 tinha. */
  delete from culto_obs where culto_id in (v_futuro, v_passado) and equipe_id = v_eq;
  delete from escalacoes where voluntario_id = v_v;
  delete from disponibilidade where voluntario_id = v_v;
  delete from indisponibilidades where voluntario_id = v_v;
  delete from culto_obs where culto_id = v_hoje and equipe_id = v_eq;
  if v_meu_hoje    then delete from cultos where id = v_hoje;    end if;
  if v_meu_futuro  then delete from cultos where id = v_futuro;  end if;
  if v_meu_passado then delete from cultos where id = v_passado; end if;
  delete from voluntarios where id = v_v;
  delete from pessoas where id = v_p;
  delete from funcoes where equipe_id = v_eq;
  delete from equipes where id = v_eq;

  if v_falhas <> '' then
    raise exception E'CONFERENCIA DA 75 REPROVOU:%s', v_falhas;
  end if;
  raise notice 'CONFERENCIA DA 75: 11/11. Pausado diz pausado, relatorio espera o culto, e eu_responder nao agradece a toa.';
end $conferir$;
