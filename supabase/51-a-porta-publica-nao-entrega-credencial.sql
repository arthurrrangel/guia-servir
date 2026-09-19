/* =============================================================================
   51 · A PORTA PÚBLICA PARA DE ENTREGAR CREDENCIAL DE OUTRA PESSOA
   19/09/2026

   O QUE ESTÁ ACONTECENDO HOJE

   `candidatar()` é `security definer` e está concedida a `anon`: qualquer
   pessoa, sem login nenhum, chama. Ela recebe nome, telefone, e-mail e as
   áreas desejadas. Em ministério com portão (`exige_aprovacao`), devolve uma
   candidatura pendente. Em ministério SEM portão — hoje Mídia, Connect e
   Livraria — cria o vínculo na hora e devolve o TOKEN PESSOAL, que é a
   credencial de /eu/<token>.

   Até aí é o produto, e está certo: autocadastro é o funil de entrada.

   O problema é o que ela faz quando a pessoa NÃO é nova. Três caminhos, em
   ordem de gravidade:

   1. VÍNCULO PAUSADO VIRA CONTA SEQUESTRADA.
      A checagem de "já está no time" tinha `and v.ativo`:

          if exists (select 1 from voluntarios v
                      where v.pessoa_id = v_pessoa and v.equipe_id = v_eq
                        and v.ativo) then ... JA_NO_TIME

      Quem está pausado não é pego por ela. Mais abaixo, o ramo sem portão
      procura o vínculo SEM filtrar por ativo, faz `update voluntarios set
      ativo = true`, lê `v.token` — o token que já existia, que está no
      WhatsApp da pessoa — e devolve para quem chamou.

      Ou seja: sabendo o telefone de alguém que a liderança pausou, um
      anônimo reativa o vínculo e recebe a credencial dessa pessoa. Com ela
      abre /eu/<token>: vê a escala, os dados de contato de quem cobre, e
      chama `eu_trocar_pin`, que redefine o PIN SEM pedir o antigo.

      Telefone não é segredo. Numa igreja ele circula em grupo de WhatsApp.
      Isso não é uma porta trancada com chave fraca: é uma porta encostada.

   2. PESSOA QUE JÁ EXISTE VIRA PERFIL EXPOSTO.
      Se a pessoa está em `pessoas` mas não tem vínculo naquele ministério,
      o ramo sem portão cria um vínculo novo apontando para a `pessoa_id`
      DELA e devolve o token novo. `quem_sou(token)` resolve por `pessoa_id`
      e responde com nome, e-mail de contato, final do telefone, a marca de
      administrador e a lista de ministérios que a pessoa organiza.

      Dado um telefone, um anônimo obtém o perfil da pessoa na igreja.

   3. `JA_CANDIDATOU` DEVOLVIA O TOKEN DA CANDIDATURA QUE JÁ EXISTIA.
      Era uma gentileza — em vez de um erro seco, a tela levava a pessoa
      para /candidatura/<token>, onde ela vê o andamento. Só que o token é
      de uma candidatura anterior, e quem chamou pode não ser a pessoa. De
      novo: nome e situação a partir de um telefone.

   O QUE ESTA MIGRAÇÃO MUDA

   Uma regra só, aplicada nos três lugares:

       A PORTA PÚBLICA SÓ ENTREGA CREDENCIAL QUE ELA MESMA ACABOU DE CRIAR,
       PARA UMA IDENTIDADE QUE ELA MESMA ACABOU DE CRIAR.

   Se a pessoa já existia, ou o vínculo já existia, ou a candidatura já
   existia, a porta devolve status — nunca chave. Reativar quem foi pausado
   volta a ser o que sempre deveria ter sido: ato de quem lidera, na tela de
   time, que já existe.

   O QUE ISSO CUSTA, DITO SEM MAQUIAGEM

   · Quem saiu e quer voltar não se recadastra sozinho: recebe JA_NO_TIME e
     precisa falar com a liderança. É uma volta por ano, talvez, contra uma
     conta que qualquer um abre sabendo um telefone.

   · Quem JÁ serve em Mídia e quer entrar também na Livraria deixa de entrar
     na hora: vira candidatura pendente, e a liderança aprova em
     /painel/candidaturas, que já existe e já faz exatamente isso. A pessoa
     continua entrando pelo próprio link antigo, que não mudou.

   · `JA_CANDIDATOU` deixa de levar para a tela de andamento. A tela passa a
     dizer que já existe um cadastro e que o link foi enviado no cadastro.

   Nenhuma pessoa perde acesso. Nenhum token existente é invalidado. Nenhuma
   linha é apagada. O que muda é só o que a porta pública devolve.

   `inscrever()` NÃO é tocada: a checagem dela nunca teve o `and ativo`
   (ver 32-integridade-e-identidade.sql §1), então aquela porta já estava
   certa. A divergência entre as duas é justamente o que deixou esta passar.

   COMO CONFERIR DEPOIS DE RODAR: a seção final desta migração testa os três
   caminhos com dados descartáveis e desfaz tudo no fim.
   ============================================================================= */

create or replace function candidatar(
  p_slug text, p_nome text, p_tel text, p_email text,
  p_funcoes text[], p_respostas jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_eq uuid; v_eq_nome text; v_gate boolean;
  v_nome text; v_tel text; v_mail text;
  v_pessoa uuid; v_cand uuid; v_token text; v_n int;
  v_vol uuid; v_vol_token text;
  v_pessoa_nova boolean := false;
begin
  select e.id, e.nome, coalesce(e.exige_aprovacao, false)
    into v_eq, v_eq_nome, v_gate
    from equipes e where e.slug = p_slug;
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

  if exists (
    select 1 from perguntas q
     where q.ativa and q.obrigatoria
       and (q.equipe_id is null or q.equipe_id = v_eq)
       and btrim(coalesce(p_respostas ->> q.id::text, '')) = ''
  ) then
    return jsonb_build_object('ok', false, 'erro', 'PERGUNTA_OBRIGATORIA');
  end if;

  select count(*) into v_n from candidaturas c
   where c.equipe_id = v_eq and c.criado_em > now() - interval '1 hour';
  if v_n >= 40 then return jsonb_build_object('ok', false, 'erro', 'MUITOS_CADASTROS'); end if;

  /* ---------------------------------------------------------------- quem é

     A pergunta "esta pessoa já existia antes desta chamada?" precisa ser
     respondida ANTES de qualquer escrita, e a resposta precisa sobreviver
     até o fim da função: é ela que decide se a porta pode entregar chave.

     O `on conflict do nothing` no lugar do `do update` também para de deixar
     um anônimo preencher o e-mail de contato de terceiro. Não era caminho de
     tomada de conta (quem manda na identidade é `pessoas.auth_email`, não
     `pessoas.email` — ver 33 §3), mas escrita anônima em tabela de
     identidade não tem por que existir. */
  select p.id into v_pessoa from pessoas p where p.telefone = v_tel;
  if v_pessoa is null then
    insert into pessoas (nome, telefone, email) values (v_nome, v_tel, v_mail)
    on conflict (telefone) do nothing
      returning id into v_pessoa;
    if v_pessoa is null then
      /* alguém inseriu entre o select e o insert: a pessoa não é nova */
      select p.id into v_pessoa from pessoas p where p.telefone = v_tel;
    else
      v_pessoa_nova := true;
    end if;
  end if;

  /* ------------------------------------------------ vínculo, ativo ou não

     SEM o `and v.ativo` de propósito. Vínculo pausado é decisão da
     liderança; desfazê-la pela porta pública é desfazer a decisão. E é por
     aqui que o token de outra pessoa saía. */
  if exists (select 1 from voluntarios v
              where v.pessoa_id = v_pessoa and v.equipe_id = v_eq) then
    return jsonb_build_object('ok', false, 'erro', 'JA_NO_TIME');
  end if;

  /* candidatura anterior: devolve o estado, não a chave */
  select c.id into v_cand
    from candidaturas c
   where c.pessoa_id = v_pessoa and c.equipe_id = v_eq
     and c.status not in ('recusada','inativa');
  if v_cand is not null then
    return jsonb_build_object('ok', false, 'erro', 'JA_CANDIDATOU');
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

  /* ---------------------------------------------------------------- portão

     Duas razões para segurar em pendente, e a segunda é nova:
       · o ministério exige aprovação; ou
       · a pessoa já existia no sistema antes desta chamada.

     No segundo caso o vínculo seria novo, mas o token novo resolveria, por
     `quem_sou`, para a identidade de alguém que já está aqui — e quem
     chamou provou apenas que sabe um telefone. A liderança confere quem é.
     O token devolvido abaixo é o da candidatura, criado agora, e ele só
     abre o andamento da própria candidatura. */
  if v_gate or not v_pessoa_nova then
    return jsonb_build_object('ok', true, 'pendente', true, 'token', v_token,
                              'nome', v_nome, 'equipe', v_eq_nome,
                              'por', case when v_gate then 'portao' else 'ja_conhecida' end);
  end if;

  /* -------------------------------------------- área sem portão, gente nova

     Chegou aqui: a identidade nasceu nesta chamada e não havia vínculo
     nenhum nesta equipe. O vínculo é novo, o token é novo, e quem recebe é
     quem acabou de criá-lo. O `select ... limit 1` de reaproveitamento saiu:
     a guarda de JA_NO_TIME acima já garante que não existe vínculo aqui, e
     reaproveitar era justamente o caminho por onde o token vazava. */
  insert into voluntarios (equipe_id, nome, telefone, email, conferido, ativo, pessoa_id)
       values (v_eq, v_nome, v_tel, v_mail, false, true, v_pessoa)
    returning id, token into v_vol, v_vol_token;

  insert into habilidades (voluntario_id, funcao_id, nivel, confirmado)
  select v_vol, cf.funcao_id, 'reserva'::nivel_habilidade, false
    from candidatura_funcoes cf where cf.candidatura_id = v_cand
      on conflict (voluntario_id, funcao_id) do nothing;

  update candidaturas
     set voluntario_id = v_vol,
         status        = 'aprovada',
         atualizado_em = now(),
         decidido_por  = 'porta pública (ministério aberto)',
         decidido_em   = now()
   where id = v_cand;

  insert into historico_candidatura (candidatura_id, de, para, por, nota)
       values (v_cand, 'enviada', 'aprovada', 'sistema',
               'ministério sem portão: entrou direto. A liderança confere as funções em /time/conferir.');

  return jsonb_build_object('ok', true, 'pendente', false, 'token', v_vol_token,
                            'nome', v_nome, 'equipe', v_eq_nome);
end $fn$;

revoke all on function candidatar(text,text,text,text,text[],jsonb) from public;
grant execute on function candidatar(text,text,text,text,text[],jsonb) to anon, authenticated;

comment on function candidatar(text,text,text,text,text[],jsonb) is
  'cadastro pela porta pública do site. Só devolve token pessoal quando a identidade E o vínculo nasceram nesta chamada; em qualquer outro caso devolve pendente=true com o token da candidatura, ou JA_NO_TIME / JA_CANDIDATOU sem token. Reativar vínculo pausado é ato de liderança, não da porta pública (ver migração 51).';


/* =============================================================================
   CONFERÊNCIA — roda com dados descartáveis e desfaz tudo no fim.
   Todas as linhas têm que dizer OK.
   ============================================================================= */
do $conf$
declare
  v_eq uuid; v_slug text;
  v_tel_novo text := '21' || lpad((floor(random()*900000000)+100000000)::text, 9, '0');
  v_tel_paus text := '21' || lpad((floor(random()*900000000)+100000000)::text, 9, '0');
  v_pessoa uuid; v_vol uuid; v_token_antigo text;
  r jsonb; v_erros text := '';
  v_fn uuid;
begin
  select e.id, e.slug into v_eq, v_slug
    from equipes e where not coalesce(e.exige_aprovacao, false) limit 1;
  if v_eq is null then
    raise notice 'PULEI: nenhum ministério sem portão para testar.';
    return;
  end if;
  select f.id into v_fn from funcoes f where f.equipe_id = v_eq and f.ativa limit 1;

  /* 1) gente nova em área aberta continua entrando na hora */
  r := candidatar(v_slug, 'Teste Um Cinquentaeum', v_tel_novo, null,
                  array[(select nome from funcoes where id = v_fn)], '{}'::jsonb);
  if not (r->>'ok')::boolean or (r->>'pendente')::boolean or coalesce(r->>'token','') = '' then
    v_erros := v_erros || format('1) gente nova NAO entrou: %s; ', r);
  end if;

  /* 2) a mesma pessoa, agora pausada, não recupera o token pela porta */
  select v.id, v.token, v.pessoa_id into v_vol, v_token_antigo, v_pessoa
    from voluntarios v where v.equipe_id = v_eq and v.telefone = v_tel_novo;
  update voluntarios set ativo = false where id = v_vol;
  r := candidatar(v_slug, 'Teste Um Cinquentaeum', v_tel_novo, null,
                  array[(select nome from funcoes where id = v_fn)], '{}'::jsonb);
  if coalesce(r->>'erro','') <> 'JA_NO_TIME' then
    v_erros := v_erros || format('2) pausado NAO recusado: %s; ', r);
  end if;
  if r ? 'token' then
    v_erros := v_erros || '2) pausado ainda devolve token; ';
  end if;
  if (select ativo from voluntarios where id = v_vol) then
    v_erros := v_erros || '2) a porta REATIVOU o vinculo pausado; ';
  end if;

  /* 3) pessoa que já existe entrando em outra área vira pendente, sem chave pessoal */
  insert into pessoas (nome, telefone) values ('Teste Dois Cinquentaeum', v_tel_paus);
  r := candidatar(v_slug, 'Teste Dois Cinquentaeum', v_tel_paus, null,
                  array[(select nome from funcoes where id = v_fn)], '{}'::jsonb);
  if not (r->>'ok')::boolean or not (r->>'pendente')::boolean then
    v_erros := v_erros || format('3) pessoa conhecida NAO virou pendente: %s; ', r);
  end if;
  if exists (select 1 from voluntarios v
              where v.telefone = v_tel_paus and v.equipe_id = v_eq) then
    v_erros := v_erros || '3) criou vinculo para pessoa ja conhecida; ';
  end if;

  /* 4) segunda tentativa devolve JA_CANDIDATOU e nenhum token */
  r := candidatar(v_slug, 'Teste Dois Cinquentaeum', v_tel_paus, null,
                  array[(select nome from funcoes where id = v_fn)], '{}'::jsonb);
  if coalesce(r->>'erro','') <> 'JA_CANDIDATOU' then
    v_erros := v_erros || format('4) esperava JA_CANDIDATOU: %s; ', r);
  end if;
  if r ? 'token' then
    v_erros := v_erros || '4) JA_CANDIDATOU ainda devolve token; ';
  end if;

  /* ---- limpeza: tira tudo que este bloco criou */
  delete from historico_candidatura h using candidaturas c
   where h.candidatura_id = c.id
     and c.pessoa_id in (select id from pessoas where telefone in (v_tel_novo, v_tel_paus));
  delete from candidatura_funcoes cf using candidaturas c
   where cf.candidatura_id = c.id
     and c.pessoa_id in (select id from pessoas where telefone in (v_tel_novo, v_tel_paus));
  delete from candidatura_respostas cr using candidaturas c
   where cr.candidatura_id = c.id
     and c.pessoa_id in (select id from pessoas where telefone in (v_tel_novo, v_tel_paus));
  delete from candidaturas
   where pessoa_id in (select id from pessoas where telefone in (v_tel_novo, v_tel_paus));
  delete from voluntarios where telefone in (v_tel_novo, v_tel_paus);
  delete from pessoas where telefone in (v_tel_novo, v_tel_paus);

  if v_erros = '' then
    raise notice 'OK — 4/4: a porta publica nao entrega mais credencial de terceiro.';
  else
    raise exception 'FALHOU — %', v_erros;
  end if;
end $conf$;
