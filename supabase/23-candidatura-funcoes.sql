/* =============================================================================
   23 — AS FUNÇÕES DA CANDIDATURA

   O ciclo inteiro da §44, em SQL: candidatar → acompanhar → decidir → virar
   voluntário. Nenhuma regra crítica fica na tela; a tela só desenha o que
   estas funções devolvem.

   Tudo que o VISITANTE chama é SECURITY DEFINER, porque ele não tem sessão e
   não pode tocar em tabela nenhuma. Tudo que o ORGANIZADOR chama é SECURITY
   INVOKER, para a RLS que a 22 escreveu continuar valendo — função definer no
   lado do líder seria um buraco por onde o escopo de ministério escaparia.
   ============================================================================= */

-- =========================================================================
-- PÚBLICO 1 — as perguntas do formulário  (§8)
-- =========================================================================

create or replace function perguntas_publicas(p_slug text)
returns table (id uuid, texto text, ajuda text, tipo text, opcoes text[], obrigatoria boolean)
language sql security definer stable set search_path = public as $fn$
  select q.id, q.texto, q.ajuda, q.tipo::text, q.opcoes, q.obrigatoria
    from perguntas q
    left join equipes e on e.id = q.equipe_id
   where q.ativa
     and (q.equipe_id is null or e.slug = p_slug)
   order by q.equipe_id nulls first, q.ordem, q.criado_em;
$fn$;
revoke all on function perguntas_publicas(text) from public;
grant execute on function perguntas_publicas(text) to anon, authenticated;


-- =========================================================================
-- PÚBLICO 2 — enviar a candidatura  (§9, §10)
--
-- Três recusas que a tela precisa distinguir, e por isso têm código próprio:
--   JA_NO_TIME     a pessoa já é voluntária deste ministério
--   JA_CANDIDATOU  já existe candidatura em aberto — devolve o token, para a
--                  pessoa cair na própria página de acompanhamento em vez de
--                  criar uma segunda
--   SEM_AREA       não marcou função nenhuma
--
-- Devolver o token de uma candidatura EXISTENTE é seguro porque a chave de
-- casamento é o telefone, e quem digita o telefone é dono dele. É diferente
-- de `inscrever`, que se recusa a devolver o token de um voluntário: lá o
-- token abre a escala e os dados de outra pessoa; aqui abre só o andamento
-- de um pedido feito com esse mesmo número.
-- =========================================================================

create or replace function candidatar(
  p_slug      text,
  p_nome      text,
  p_tel       text,
  p_email     text,
  p_funcoes   text[],      -- nomes das funções, como aparecem na tela
  p_respostas jsonb        -- { "<pergunta_id>": "resposta", ... }
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_eq uuid; v_eq_nome text;
  v_nome text; v_tel text; v_mail text;
  v_pessoa uuid; v_cand uuid; v_token text; v_n int;
begin
  select e.id, e.nome into v_eq, v_eq_nome from equipes e where e.slug = p_slug;
  if v_eq is null then return jsonb_build_object('ok', false, 'erro', 'EQUIPE_INVALIDA'); end if;

  v_nome := btrim(coalesce(p_nome, ''));
  v_tel  := tel_norm(coalesce(p_tel, ''));
  v_mail := nullif(btrim(lower(coalesce(p_email, ''))), '');

  if length(v_nome) < 3 or position(' ' in v_nome) = 0 then
    return jsonb_build_object('ok', false, 'erro', 'NOME_INCOMPLETO');
  end if;
  if coalesce(length(v_tel),0) < 10 or length(v_tel) > 13 then
    return jsonb_build_object('ok', false, 'erro', 'TELEFONE_INVALIDO');
  end if;
  if v_mail is not null and v_mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    return jsonb_build_object('ok', false, 'erro', 'EMAIL_INVALIDO');
  end if;
  if coalesce(array_length(p_funcoes, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'erro', 'SEM_AREA');
  end if;

  -- freio de enxurrada, igual ao de `inscrever`
  select count(*) into v_n from candidaturas c
   where c.equipe_id = v_eq and c.criado_em > now() - interval '1 hour';
  if v_n >= 40 then return jsonb_build_object('ok', false, 'erro', 'MUITOS_CADASTROS'); end if;

  /* a pessoa é casada por telefone. Se já existe, o nome mais recente vale —
     gente troca de sobrenome, e o cadastro novo é o mais atual. */
  insert into pessoas (nome, telefone, email)
       values (v_nome, v_tel, v_mail)
  on conflict (telefone) do update
     set nome = excluded.nome,
         email = coalesce(excluded.email, pessoas.email),
         atualizado_em = now()
    returning id into v_pessoa;

  if exists (select 1 from voluntarios v
              where v.pessoa_id = v_pessoa and v.equipe_id = v_eq and v.ativo) then
    return jsonb_build_object('ok', false, 'erro', 'JA_NO_TIME');
  end if;

  select c.id, c.token into v_cand, v_token
    from candidaturas c
   where c.pessoa_id = v_pessoa and c.equipe_id = v_eq
     and c.status not in ('recusada','inativa');
  if v_cand is not null then
    return jsonb_build_object('ok', false, 'erro', 'JA_CANDIDATOU', 'token', v_token);
  end if;

  insert into candidaturas (pessoa_id, equipe_id)
       values (v_pessoa, v_eq)
    returning id, token into v_cand, v_token;

  insert into candidatura_funcoes (candidatura_id, funcao_id)
  select v_cand, f.id from funcoes f
   where f.equipe_id = v_eq and f.ativa and f.nome = any(p_funcoes)
      on conflict do nothing;

  insert into candidatura_respostas (candidatura_id, pergunta_id, resposta)
  select v_cand, q.id, x.value
    from jsonb_each_text(coalesce(p_respostas, '{}'::jsonb)) x
    join perguntas q on q.id::text = x.key and q.ativa
   where btrim(x.value) <> ''
      on conflict do nothing;

  insert into historico_candidatura (candidatura_id, de, para, por, nota)
       values (v_cand, null, 'enviada', 'a própria pessoa', 'cadastro pela porta pública');

  return jsonb_build_object('ok', true, 'token', v_token,
                            'nome', v_nome, 'equipe', v_eq_nome);
end $fn$;

revoke all on function candidatar(text,text,text,text,text[],jsonb) from public;
grant execute on function candidatar(text,text,text,text,text[],jsonb) to anon, authenticated;


-- =========================================================================
-- PÚBLICO 3 — acompanhar a candidatura  (§11, §12, §26)
--
-- Devolve o PRÓXIMO PASSO em português, não o enum. A §26 é explícita: a
-- pessoa nunca pode ficar pensando "e agora?".
--
-- `nota_interna` NÃO sai daqui. É a anotação da liderança sobre uma pessoa;
-- vazar isso pela URL dela seria pior que qualquer furo de escala.
--
-- Sobre `recusada`: o status existe porque o líder precisa fechar a fila, mas
-- o texto que volta para o candidato nunca diz "recusado". Numa igreja a
-- pessoa reencontra o líder no corredor no domingo seguinte.
-- =========================================================================

create or replace function candidatura_status(p_token text)
returns jsonb
language plpgsql security definer stable set search_path = public as $fn$
declare c record; v_funcoes text[]; v_passo text; v_titulo text; v_texto text; v_etapa int;
begin
  select ca.*, e.nome as equipe_nome, e.slug as equipe_slug,
         e.responsavel_nome, e.responsavel_whatsapp, p.nome as pessoa_nome
    into c
    from candidaturas ca
    join equipes e on e.id = ca.equipe_id
    join pessoas p on p.id = ca.pessoa_id
   where ca.token = p_token;
  if not found then return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO'); end if;

  select array_agg(f.nome order by f.ordem) into v_funcoes
    from candidatura_funcoes cf join funcoes f on f.id = cf.funcao_id
   where cf.candidatura_id = c.id;

  /* etapa alimenta a linha do tempo de MEU CAMINHO; titulo/texto/passo são o
     que a tela mostra grande. Um lugar só, para as duas telas não divergirem. */
  case c.status
    when 'enviada' then
      v_etapa := 1; v_titulo := 'Recebemos seu cadastro';
      v_texto := 'A liderança do ' || c.equipe_nome || ' já está com o seu nome.';
      v_passo := 'Chame no WhatsApp para se apresentar. Isso acelera tudo.';
    when 'em_analise' then
      v_etapa := 2; v_titulo := 'Estamos olhando o seu cadastro';
      v_texto := 'Alguém da liderança está vendo onde você se encaixa melhor.';
      v_passo := 'Se puder, chame no WhatsApp e se apresente.';
    when 'conversa' then
      v_etapa := 3; v_titulo := 'A liderança quer falar com você';
      v_texto := 'Antes de te encaixar, o ' || c.equipe_nome || ' conversa com cada pessoa.';
      v_passo := 'Chame no WhatsApp para marcar essa conversa.';
    when 'entrevista' then
      v_etapa := 3; v_titulo := 'Conversa marcada';
      v_texto := 'Falta só o encontro com a liderança.';
      v_passo := 'Confirme o horário no WhatsApp.';
    when 'aprovada' then
      v_etapa := 4; v_titulo := 'Você faz parte do time';
      v_texto := 'Bem-vindo ao ' || c.equipe_nome || '.';
      v_passo := 'A liderança vai te mandar o seu link pessoal, onde fica a sua escala.';
    when 'integrando' then
      v_etapa := 5; v_titulo := 'Integração em andamento';
      v_texto := 'Você já está no time e está conhecendo como tudo funciona.';
      v_passo := 'Siga os primeiros passos com quem te acompanha.';
    when 'ativa' then
      v_etapa := 6; v_titulo := 'Você está servindo';
      v_texto := 'Sua escala aparece na sua página pessoal.';
      v_passo := 'Responda sua disponibilidade todo mês — é o que monta a escala.';
    else  -- recusada, inativa
      v_etapa := 0; v_titulo := 'Seu cadastro está encerrado por enquanto';
      v_texto := 'Isso não quer dizer que não haja lugar para você. Às vezes é época, '
               || 'às vezes é outra área que combina mais.';
      v_passo := 'Chame a liderança no WhatsApp para conversar, ou veja as outras áreas.';
  end case;

  return jsonb_build_object(
    'ok', true,
    'status', c.status::text,
    'etapa', v_etapa,
    'titulo', v_titulo,
    'texto', v_texto,
    'proximo_passo', v_passo,
    'nome', c.pessoa_nome,
    'equipe', c.equipe_nome,
    'equipe_slug', c.equipe_slug,
    'funcoes', coalesce(v_funcoes, '{}'),
    'responsavel', c.responsavel_nome,
    'whatsapp', c.responsavel_whatsapp,
    'criado_em', c.criado_em
  );
end $fn$;

revoke all on function candidatura_status(text) from public;
grant execute on function candidatura_status(text) to anon, authenticated;


-- =========================================================================
-- LÍDER — decidir  (§18, §19)
--
-- SECURITY INVOKER de propósito: quem pode mexer é quem a RLS de
-- `candidaturas` deixa mexer, e é lidera_equipe(equipe_id). Se fosse DEFINER,
-- um organizador do Louvor aprovaria candidato da Mídia trocando o id.
--
-- Aprovar faz os nove passos da §19 numa transação só: se qualquer um falhar,
-- nada acontece — não existe candidatura aprovada sem voluntário criado.
-- =========================================================================

create or replace function decidir_candidatura(
  p_id uuid, p_status text, p_nota text default null
) returns jsonb
language plpgsql security invoker set search_path = public as $fn$
declare
  c record; v_vol uuid; v_quem text; v_de status_candidatura; v_novo status_candidatura;
begin
  v_quem := coalesce(nullif(auth.jwt() ->> 'email', ''), 'sistema');
  begin v_novo := p_status::status_candidatura;
  exception when others then return jsonb_build_object('ok', false, 'erro', 'STATUS_INVALIDO'); end;

  select * into c from candidaturas where id = p_id;   -- a RLS já filtra aqui
  if not found then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  v_de := c.status;

  if v_novo in ('aprovada','integrando','ativa') and c.voluntario_id is null then
    /* reaproveita o vínculo se ele já existir (pessoa que saiu e voltou),
       em vez de criar uma segunda linha para a mesma pessoa no mesmo time */
    select v.id into v_vol from voluntarios v
     where v.pessoa_id = c.pessoa_id and v.equipe_id = c.equipe_id
     limit 1;

    if v_vol is null then
      insert into voluntarios (equipe_id, nome, telefone, email, conferido, ativo, pessoa_id)
      select c.equipe_id, p.nome, p.telefone, p.email, false, true, p.id
        from pessoas p where p.id = c.pessoa_id
      returning id into v_vol;
    else
      update voluntarios set ativo = true where id = v_vol;
    end if;

    /* o interesse declarado vira habilidade NÃO confirmada: o motor lê titular
       não conferido como reserva, então aprovar não promove ninguém a pilar
       de uma área sem alguém ter olhado. */
    insert into habilidades (voluntario_id, funcao_id, nivel, confirmado)
    select v_vol, cf.funcao_id, 'reserva'::nivel_habilidade, false
      from candidatura_funcoes cf where cf.candidatura_id = c.id
        on conflict (voluntario_id, funcao_id) do nothing;

    update candidaturas set voluntario_id = v_vol where id = c.id;
  end if;

  update candidaturas
     set status = v_novo,
         nota_interna = coalesce(p_nota, nota_interna),
         atualizado_em = now(),
         decidido_por = case when v_novo in ('aprovada','recusada') then v_quem else decidido_por end,
         decidido_em  = case when v_novo in ('aprovada','recusada') then now() else decidido_em end
   where id = c.id;

  insert into historico_candidatura (candidatura_id, de, para, por, nota)
       values (c.id, v_de, v_novo, v_quem, p_nota);

  return jsonb_build_object('ok', true, 'status', v_novo::text, 'voluntario_id', coalesce(v_vol, c.voluntario_id));
end $fn$;

revoke all on function decidir_candidatura(uuid, text, text) from public, anon;
grant execute on function decidir_candidatura(uuid, text, text) to authenticated;

comment on function decidir_candidatura(uuid, text, text) is
  'move o status e, ao aprovar, cria/religa o voluntário na mesma transação. SECURITY INVOKER: quem decide é quem a RLS deixa.';


-- =========================================================================
-- LÍDER — o que precisa de atenção  (§16)
--
-- Os números do dashboard, num round-trip só. INVOKER: cada contagem já passa
-- pela RLS da tabela que ela conta, então o organizador escopado recebe os
-- números do ministério dele e zero do resto — sem nenhum filtro no cliente.
-- =========================================================================

create or replace function painel_ministerio(p_equipe uuid)
returns jsonb
language sql security invoker stable set search_path = public as $fn$
  select jsonb_build_object(
    'voluntarios',      (select count(*) from voluntarios v where v.equipe_id = p_equipe and v.ativo),
    'funcoes',          (select count(*) from funcoes f where f.equipe_id = p_equipe and f.ativa),
    'candidaturas_novas',(select count(*) from candidaturas c
                           where c.equipe_id = p_equipe and c.status in ('enviada','em_analise')),
    'aguardando_conversa',(select count(*) from candidaturas c
                           where c.equipe_id = p_equipe and c.status in ('conversa','entrevista')),
    'sem_conferir',     (select count(*) from voluntarios v
                          where v.equipe_id = p_equipe and v.ativo and not v.conferido),
    'sem_disponibilidade',(select count(*) from voluntarios v
                          where v.equipe_id = p_equipe and v.ativo
                            and not exists (select 1 from disponibilidade d
                                             where d.voluntario_id = v.id and d.data >= current_date)),
    'vagas_pendentes',  (select count(*) from escalacoes x
                          join funcoes f on f.id = x.funcao_id
                          join cultos ct on ct.id = x.culto_id
                         where f.equipe_id = p_equipe and x.status = 'pendente' and ct.data >= current_date),
    'funcoes_sem_gente',(select count(*) from funcoes f
                          where f.equipe_id = p_equipe and f.ativa
                            and not exists (select 1 from habilidades h
                                             join voluntarios v on v.id = h.voluntario_id
                                            where h.funcao_id = f.id and v.ativo))
  );
$fn$;
revoke all on function painel_ministerio(uuid) from public, anon;
grant execute on function painel_ministerio(uuid) to authenticated;


----------------------------------------------------------------------------
-- CONFERÊNCIA
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname in
      ('perguntas_publicas','candidatar','candidatura_status','decidir_candidatura','painel_ministerio')) as funcoes_criadas,
  (select count(*) from testar_permissoes() where not passou) as furos;
