/* =============================================================================
   43 · A PORTA PÚBLICA ABRE
   10/09/2026.

   Supabase → SQL Editor → colar tudo → Run. Idempotente.
   Pode rodar antes ou depois da 42; as duas não se tocam.

   ---------------------------------------------------------------------------
   O QUE ESTÁ ERRADO HOJE

   Existem duas portas de entrada, e elas fazem coisas OPOSTAS com a mesma
   pessoa, no mesmo ministério:

     /equipe/<área>          → inscrever()   → LÊ exige_aprovacao.
                                               Área aberta: entra no time e
                                               recebe o token pessoal.
     /servir/<área>/cadastro → candidatar()  → NÃO lê exige_aprovacao.
                                               Todo mundo vira candidatura
                                               pendente, sempre.

   A segunda é a porta do SITE: `app/servir/[slug]/page.tsx` manda todo
   visitante para lá ("Quero servir na …"). E `ministerios_publicos` publica
   `aberto` como `not e.exige_aprovacao` — ou seja, o site anuncia "Connect
   está aberto", "Mídia está aberta", "Livraria está aberta", e o formulário
   que ele oferece põe as três na fila.

   Medido em 10/09/2026, pelas RPCs públicas:

     Livraria   aberto=true  exige_aprovacao=false  2 postos  ZERO pessoas
                responsavel=null  whatsapp=null

   O convite publicado da Livraria é "São duas pessoas por domingo. Se você
   gosta de livro e de conversar com gente, é aqui." Quem responde a esse
   convite hoje entra numa fila que não tem dono para chamar.

   ---------------------------------------------------------------------------
   O CONSERTO, E O QUE ELE NÃO FAZ

   `candidatar` passa a ler `exige_aprovacao`.

   Área COM portão (hoje: Louvor, Kids): nada muda. Vira candidatura, espera a
   liderança. A única diferença é que a resposta agora diz `pendente: true`
   explicitamente, para a tela não ter que deduzir isso da ausência de campo.

   Área SEM portão (Connect, Mídia, Livraria): a candidatura CONTINUA sendo
   criada, com as funções e as respostas — é justamente por causa das
   perguntas que esta função existe, e a liderança quer lê-las. Só que ela já
   nasce aprovada, o voluntário é criado na hora, e a resposta devolve
   `pendente: false` com o token pessoal. A pessoa sai do formulário dentro do
   próprio espaço, e não numa sala de espera.

   O que ele NÃO faz, de propósito: não promove ninguém. A habilidade entra
   como `reserva` NÃO confirmada, exatamente como `decidir_candidatura` já faz
   (`23-candidatura-funcoes.sql:271-277`) — o motor lê titular não conferido
   como reserva, e entrar sozinho pelo site não é motivo para virar pilar de
   uma área. Quem confirma é a liderança, em /time/conferir.

   E não mexe em `inscrever`: aquela porta já estava certa.
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

  insert into pessoas (nome, telefone, email)
       values (v_nome, v_tel, v_mail)
  on conflict (telefone) do update
     set email = coalesce(pessoas.email, excluded.email),
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

  /* ---------------------------------------------------------------- portão */
  if v_gate then
    return jsonb_build_object('ok', true, 'pendente', true, 'token', v_token,
                              'nome', v_nome, 'equipe', v_eq_nome);
  end if;

  /* ------------------------------------------------------- área sem portão
     Mesmo caminho de `decidir_candidatura`, para não existirem duas maneiras
     de virar voluntário: reaproveita o vínculo de quem saiu e voltou, e a
     habilidade entra como reserva não confirmada. */
  select v.id into v_vol from voluntarios v
   where v.pessoa_id = v_pessoa and v.equipe_id = v_eq
   limit 1;

  if v_vol is null then
    insert into voluntarios (equipe_id, nome, telefone, email, conferido, ativo, pessoa_id)
         values (v_eq, v_nome, v_tel, v_mail, false, true, v_pessoa)
      returning id into v_vol;
  else
    update voluntarios set ativo = true where id = v_vol;
  end if;

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

  select v.token into v_vol_token from voluntarios v where v.id = v_vol;

  return jsonb_build_object('ok', true, 'pendente', false, 'token', v_vol_token,
                            'nome', v_nome, 'equipe', v_eq_nome);
end $fn$;

revoke all on function candidatar(text,text,text,text,text[],jsonb) from public;
grant execute on function candidatar(text,text,text,text,text[],jsonb) to anon, authenticated;

comment on function candidatar(text,text,text,text,text[],jsonb) is
  'cadastro pela porta pública do site. Lê equipes.exige_aprovacao: com portão devolve pendente=true e o token da candidatura; sem portão cria o voluntário na hora (habilidade reserva NÃO confirmada) e devolve pendente=false com o token pessoal.';

/* ------------------------------------------------------------ conferência ---
   1) Quem tem portão e quem não tem. Louvor e Kids têm que aparecer com
      portão; Connect, Mídia e Livraria sem. */
select slug, nome, exige_aprovacao as portao,
       coalesce(responsavel_nome, '— SEM RESPONSÁVEL —') as responsavel,
       coalesce(responsavel_whatsapp, '— SEM WHATSAPP —') as whatsapp
  from equipes
 order by exige_aprovacao, ordem;

/* 2) O buraco que este arquivo NÃO conserta, porque é dado e não código:
      ministério aberto ao público sem ninguém para receber. Se voltar alguma
      linha, é gente podendo se cadastrar numa área que não tem para quem
      perguntar. Preencha `responsavel_nome` e `responsavel_whatsapp`, ou
      feche a área com `exige_aprovacao = true`. */
select slug, nome
  from equipes
 where not coalesce(exige_aprovacao, false)
   and (nullif(btrim(coalesce(responsavel_nome, '')), '') is null
     or nullif(btrim(coalesce(responsavel_whatsapp, '')), '') is null)
 order by ordem;
