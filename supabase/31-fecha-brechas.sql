/* =============================================================================
   31 — FECHA AS BRECHAS DA AUDITORIA DE 27/08/2026

   Cinco correções, todas de segurança ou de bloqueio funcional. Nenhuma muda
   assinatura consumida pelo front, então nenhuma tela quebra.

   ORDEM DE LEITURA
     §1  historico_candidatura: policy de INSERT      (B1, bloqueador)
     §2  equipe_entrar: apagar de vez                 (S2, tomada de conta)
     §3  conflitos_entre_ministerios: escopo e guarda (S1, vazamento)
     §4  candidatar: para de reescrever identidade    (S4)
         e passa a exigir as perguntas obrigatórias   (S5)
     §5  PIN: freio por equipe contra varredura       (S3)

   ROLLBACK — cada seção tem o desfazer escrito no fim do arquivo. Só o §2 não
   deve ser desfeito: a função apagada foi declarada insegura pela migração 07.
   ============================================================================= */


-- =========================================================================
-- §1  O BLOQUEADOR: aprovar candidatura estourava e nem dava erro visível.
--
-- `historico_candidatura` nasceu com RLS ligada e UMA policy, de leitura.
-- `decidir_candidatura` é SECURITY INVOKER de propósito (o líder roda como
-- ele mesmo e cai na RLS, que é o que garante o escopo por ministério) e
-- insere nessa tabela. Sem policy de INSERT o comando é negado, a exceção
-- sobe e a transação inteira volta atrás: a candidatura não muda de status
-- e o voluntário não é criado.
--
-- O caminho público nunca sentiu isso porque `candidatar` é SECURITY DEFINER
-- e escreve como dono da função. É essa assimetria que escondeu o problema
-- desde a migração 22.
--
-- A policy espelha `hist_ler` exatamente: quem lidera a equipe da candidatura
-- pode escrever o histórico dela. Nem mais, nem menos.
-- =========================================================================
drop policy if exists hist_criar on historico_candidatura;
create policy hist_criar on historico_candidatura for insert to authenticated
  with check (exists (select 1 from candidaturas c
                       where c.id = candidatura_id and lidera_equipe(c.equipe_id)));

comment on table historico_candidatura is
  'toda mudança de status, com quem e quando. Lê e escreve quem lidera a equipe da candidatura (hist_ler + hist_criar). A porta pública escreve via candidatar(), que é DEFINER.';


-- =========================================================================
-- §2  equipe_entrar: a função que a 07 achou que tinha fechado.
--
-- A 03 concedeu a `anon, authenticated`. A 07 escreveu em letras maiúsculas
-- "NÃO REINTRODUZIR equipe_entrar para anon" e revogou de `anon, public`.
-- Só que revogar de `public` NÃO desfaz concessão feita a papel nomeado:
-- `authenticated` continuou com EXECUTE esse tempo todo.
--
-- O que ela faz: recebe o id do voluntário vindo do cliente, confere os 4
-- últimos dígitos do telefone e devolve o TOKEN PESSOAL. Como
-- `equipe_publica` entrega os ids sem login, e 4 dígitos são 10 mil
-- combinações, isso é um caminho para abrir o espaço pessoal de um
-- voluntário com qualquer conta autenticada.
--
-- Nenhum arquivo em app/, lib/ ou components/ chama essa função (conferido
-- por varredura). O substituto seguro é `equipe_pin_entrar`, da 08.
-- Apagar em vez de revogar: função com privilégio elevado e sem dono é
-- superfície de ataque que volta a ser concedida por engano.
-- =========================================================================
drop function if exists equipe_entrar(text, uuid, text);


-- =========================================================================
-- §3  conflitos_entre_ministerios: tinha privilégio e nenhuma guarda.
--
-- SECURITY DEFINER, concedida a `authenticated`, sem `sou_lider()`, sem
-- `lidera_equipe()` e sem parâmetro de equipe. Devolvia nome e telefone de
-- toda pessoa escalada em dois ministérios, da igreja inteira. Um organizador
-- limitado ao Louvor, que a RLS impede de ler uma linha da Mídia, lia aqui os
-- contatos da Mídia, do Kids e do Connect.
--
-- A funcionalidade é legítima e ninguém ligou em tela nenhuma ainda, então
-- ela sobrevive com escopo: passa a exigir a equipe e a liderança dela. O
-- conflito continua sendo mostrado por inteiro (é o sentido da função: saber
-- que a sua pessoa está escalada em outro lugar no mesmo dia), mas só para
-- quem lidera uma das pontas, e o telefone sai de cena.
--
-- Muda o tipo de retorno, então precisa de DROP antes: `create or replace`
-- não altera assinatura de função que devolve tabela.
-- =========================================================================
drop function if exists conflitos_entre_ministerios(date);

create or replace function conflitos_entre_ministerios(p_equipe uuid, p_de date default current_date)
returns table (data date, pessoa text, ministerios text, postos text)
language sql security definer stable set search_path = public as $fn$
  select c.data,
         min(v.nome)                                                    as pessoa,
         string_agg(distinct e.nome, ' + ' order by e.nome)             as ministerios,
         string_agg(e.nome || ': ' || f.nome, ' | ' order by e.nome, f.nome) as postos
    from escalacoes x
    join cultos      c on c.id = x.culto_id
    join voluntarios v on v.id = x.voluntario_id
    join funcoes     f on f.id = x.funcao_id
    join equipes     e on e.id = f.equipe_id
   where lidera_equipe(p_equipe)                      -- a guarda que faltava
     and c.data >= p_de
     and coalesce(length(tel_norm(v.telefone)), 0) >= 10
     and x.status <> 'recusado'
   group by c.data, tel_norm(v.telefone)
  having count(distinct f.equipe_id) > 1
     and bool_or(f.equipe_id = p_equipe)              -- só conflito que toca a MINHA equipe
   order by c.data, 2;
$fn$;

revoke all on function conflitos_entre_ministerios(uuid, date) from public, anon;
grant execute on function conflitos_entre_ministerios(uuid, date) to authenticated;
comment on function conflitos_entre_ministerios(uuid, date) is
  'pessoas escaladas em mais de um ministério no mesmo dia, restrito a conflitos que envolvem p_equipe e só para quem lidera essa equipe. Sem telefone: o contato vem pelo time, não por aqui.';


-- =========================================================================
-- §4  candidatar: duas correções na mesma função.
--
-- (a) IDENTIDADE — a versão anterior fazia
--       on conflict (telefone) do update set nome = excluded.nome
--     tratando o telefone digitado como prova de posse do número, sem prova
--     nenhuma. Quem digitasse o número de um terceiro reescrevia o nome dele
--     na tabela de identidade, e isso acontecia ANTES dos retornos que
--     recusam a candidatura: a alteração persistia mesmo no cadastro
--     rejeitado. Pior, `decidir_candidatura` copia esse nome para
--     `voluntarios`, então o dado envenenado se espalhava.
--
--     Agora o nome de pessoa que já existe NÃO é tocado por cadastro
--     público. O e-mail continua sendo preenchido quando está vazio, porque
--     preencher buraco não sobrescreve ninguém. Trocar o nome de alguém
--     passa a ser ato de líder, que é quem tem como saber se é a mesma
--     pessoa.
--
-- (b) PERGUNTAS OBRIGATÓRIAS — a regra existia só no TypeScript da tela de
--     cadastro. Como o navegador fala direto com o banco, regra que só mora
--     no front não existe: uma chamada direta criava candidatura sem
--     responder nada. Agora o banco recusa.
--
-- O resto do corpo é idêntico ao da migração 23. Está reproduzido inteiro
-- porque `create or replace` substitui a função toda.
-- =========================================================================
create or replace function candidatar(
  p_slug text, p_nome text, p_tel text, p_email text,
  p_funcoes text[], p_respostas jsonb
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

  /* (b) as obrigatórias da área, e as globais, precisam vir respondidas.
     Mesma regra que a tela aplica, agora onde ela vale de verdade. */
  if exists (
    select 1 from perguntas q
     where q.ativa and q.obrigatoria
       and (q.equipe_id is null or q.equipe_id = v_eq)
       and btrim(coalesce(p_respostas ->> q.id::text, '')) = ''
  ) then
    return jsonb_build_object('ok', false, 'erro', 'PERGUNTA_OBRIGATORIA');
  end if;

  -- freio de enxurrada, igual ao de `inscrever`
  select count(*) into v_n from candidaturas c
   where c.equipe_id = v_eq and c.criado_em > now() - interval '1 hour';
  if v_n >= 40 then return jsonb_build_object('ok', false, 'erro', 'MUITOS_CADASTROS'); end if;

  /* (a) a pessoa é casada por telefone. Se já existe, o nome dela fica como
     está: cadastro público não é prova de posse do número. */
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

  return jsonb_build_object('ok', true, 'token', v_token,
                            'nome', v_nome, 'equipe', v_eq_nome);
end $fn$;

revoke all on function candidatar(text,text,text,text,text[],jsonb) from public;
grant execute on function candidatar(text,text,text,text,text[],jsonb) to anon, authenticated;


-- =========================================================================
-- §5  PIN: o limite por pessoa não protegia o time.
--
-- O limite de 8 tentativas por dia por voluntário é sólido contra ataque a
-- UMA pessoa: 10 mil combinações levariam 1.250 dias. Ele não protege contra
-- o outro eixo. `equipe_time` e `equipe_publica` entregam a lista de ids sem
-- login, então dá para tentar UM PIN comum contra TODAS as pessoas da área.
-- Com 20 pessoas com PIN, isso é 160 tentativas por dia contra combinações
-- que ninguém sorteia: aniversário, 1234, 0000.
--
-- O freio novo é por equipe e conta só ERRO. Uso legítimo quase nunca chega
-- perto: são 30 erros somados de todo o time num dia. Varredura estoura no
-- primeiro round.
--
-- Escolha consciente sobre negação de serviço: um atacante pode queimar os 30
-- e deixar a RECUPERAÇÃO por PIN indisponível até a virada do dia. Isso não
-- tranca ninguém para fora, porque o caminho normal do voluntário é o link
-- pessoal que ele já tem no WhatsApp; o PIN é o plano B. Trocar
-- indisponibilidade temporária do plano B por imunidade a varredura é um bom
-- negócio.
-- =========================================================================
create table if not exists entrar_tentativas_equipe (
  equipe_id uuid not null references equipes(id) on delete cascade,
  dia       date not null default current_date,
  n         int  not null default 1,
  primary key (equipe_id, dia)
);
comment on table entrar_tentativas_equipe is
  'erros de PIN somados por equipe por dia. Freio contra varredura de PIN entre vários voluntários da mesma área. Ninguém lê isso pelo app: só a função de entrada escreve, como dona.';
alter table entrar_tentativas_equipe enable row level security;
revoke all on table entrar_tentativas_equipe from anon, public, authenticated;

create or replace function equipe_pin_entrar(p_slug text, p_voluntario uuid, p_pin text)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_tok text; v_hash text; v_n int; v_eq uuid; v_eq_n int;
  v_max        constant int := 8;    -- por pessoa, por dia
  v_max_equipe constant int := 30;   -- erros somados da equipe, por dia
begin
  select v.token, v.pin_hash, v.equipe_id into v_tok, v_hash, v_eq
    from voluntarios v join equipes e on e.id = v.equipe_id
   where v.id = p_voluntario and e.slug = p_slug and v.ativo;

  if v_tok is null then return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO'); end if;
  if v_hash is null then return jsonb_build_object('ok', false, 'erro', 'SEM_PIN'); end if;

  /* o teto da equipe é conferido ANTES de gastar tentativa da pessoa: assim a
     varredura não consome o crédito de quem não tem nada a ver com isso. */
  select n into v_eq_n from entrar_tentativas_equipe
   where equipe_id = v_eq and dia = current_date;
  if coalesce(v_eq_n, 0) >= v_max_equipe then
    return jsonb_build_object('ok', false, 'erro', 'MUITAS_TENTATIVAS_EQUIPE');
  end if;

  insert into entrar_tentativas (voluntario_id) values (p_voluntario)
  on conflict (voluntario_id, dia) do update set n = entrar_tentativas.n + 1
  returning n into v_n;
  if v_n > v_max then return jsonb_build_object('ok', false, 'erro', 'MUITAS_TENTATIVAS'); end if;

  if v_hash <> encode(extensions.digest(coalesce(p_pin,'') || v_tok, 'sha256'), 'hex') then
    insert into entrar_tentativas_equipe (equipe_id) values (v_eq)
    on conflict (equipe_id, dia) do update set n = entrar_tentativas_equipe.n + 1;
    return jsonb_build_object('ok', false, 'erro', 'PIN_NAO_CONFERE', 'restam', greatest(v_max - v_n, 0));
  end if;

  delete from entrar_tentativas where voluntario_id = p_voluntario;
  return jsonb_build_object('ok', true, 'token', v_tok);
end $fn$;

revoke all on function equipe_pin_entrar(text, uuid, text) from public;
grant execute on function equipe_pin_entrar(text, uuid, text) to anon, authenticated;


/* =============================================================================
   ROLLBACK

   §1  drop policy hist_criar on historico_candidatura;
       (mas isso volta a travar toda aprovação de candidatura)

   §2  NÃO DESFAZER. A função apagada foi declarada insegura pela migração 07.
       Se por algum motivo precisar dela, o corpo está em 03-auditoria.sql:96,
       e ela NÃO deve ser concedida a anon nem a authenticated.

   §3  drop function conflitos_entre_ministerios(uuid, date);
       e recriar a versão de 18-fechar-furos.sql:85. Não recomendado: aquela
       versão vaza contato entre ministérios.

   §4  create or replace com o corpo de 23-candidatura-funcoes.sql:60.
       Isso devolve a reescrita de nome por terceiro e derruba a exigência das
       perguntas obrigatórias no banco.

   §5  create or replace com o corpo de 08-pin-e-lista-por-area.sql:73,
       e drop table entrar_tentativas_equipe.

   VERIFICAÇÃO DEPOIS DE APLICAR (roda em 27-matriz-expandida.sql):
       select * from testar_permissoes();
   ============================================================================= */
