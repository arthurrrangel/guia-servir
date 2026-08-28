/* =============================================================================
   PASSO 2 DE 2 — APLICAR AS MIGRACOES 31 E 32

   Este arquivo e a 31 e a 32 juntas, DENTRO DE UMA TRANSACAO SO.

   Por que numa transacao: se qualquer coisa falhar no meio, o Postgres
   desfaz tudo e o banco volta exatamente como estava. Nao existe estado
   pela metade. Foi por isso que o passo 1 existe separado: ele confere
   sem escrever, e este aqui escreve tudo ou nada.

   COMO USAR
     1. Rode antes o CONFERIR-antes-de-aplicar.sql. Se algo disser ATENCAO,
        pare e me mande o resultado.
     2. Painel do Supabase -> SQL Editor -> colar TUDO -> Run.
     3. No fim ele devolve uma tabela de conferencia. Me mande ela.

   SE DER ERRO: nada foi aplicado. Copie a mensagem inteira e me mande.

   O QUE ISTO MUDA, EM UMA LINHA CADA
     . aprovar candidatura passa a funcionar (hoje estoura e desfaz tudo)
     . equipe_entrar deixa de existir (dava o token pessoal de um voluntario
       para qualquer conta logada)
     . conflitos_entre_ministerios passa a exigir liderança e para de
       devolver telefone da igreja inteira
     . cadastro publico para de reescrever o nome de outra pessoa
     . perguntas obrigatorias passam a valer no banco, nao so na tela
     . PIN ganha freio por equipe contra varredura
     . todo voluntario passa a ter identidade, inclusive quem entrou pela
       porta antiga
     . lideres ganham ligacao com a identidade
     . duas escritas do lider viram transacao (criar voluntario, salvar postos)
     . restricoes que impedem duplicata de nascer
   ============================================================================= */

begin;

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


/* =============================================================================
   32 — INTEGRIDADE DOS DADOS E A ESPINHA DE IDENTIDADE

   A 31 fechou o que estava aberto. Esta arruma o que estava frouxo: a mesma
   pessoa virando duas linhas, a falta de restrição que permitiria isso de
   novo amanhã, e a ausência de ligação entre quem lidera e quem é.

     §1  inscrever passa a preencher pessoa_id, e backfill do que ficou para trás
     §2  lideres.pessoa_id: o líder deixa de ser um e-mail solto
     §3  as restrições que impedem duplicata de nascer

   SOBRE O §3: um `create unique index` estoura se já existir duplicata, e
   estourar no meio de uma migração deixa o banco pela metade. Por isso cada
   restrição está dentro de um bloco que confere primeiro e, se achar
   duplicata, LEVANTA uma mensagem dizendo exatamente quais linhas são, sem
   criar nada. Migração que falha tem que falhar explicando.
   ============================================================================= */


-- =========================================================================
-- §1  A porta antiga criava gente que o resto do sistema não reconhecia.
--
-- `inscrever` (a entrada por /equipe/[slug]) insere em `voluntarios` sem
-- preencher `pessoa_id`. Como `candidatar` e `decidir_candidatura` casam a
-- pessoa por `pessoa_id`, quem entrou por ali é invisível para eles: a mesma
-- pessoa vira duas linhas, com dois tokens e dois lugares na escala. É a
-- origem da duplicação de identidade que a auditoria apontou.
--
-- Aqui a função passa a fazer o que a 22 estabeleceu como regra da casa:
-- toda linha de `voluntarios` aponta para uma linha de `pessoas`.
--
-- O token e o pin_hash continuam no vínculo, como a 22 decidiu e explicou:
-- o PIN é sha256(pin || token), então mover o token quebraria em silêncio
-- todo PIN já criado. Isso segue como dívida registrada, não como esquecimento.
-- =========================================================================

-- 1a. cria pessoa para todo vínculo que ficou sem, casando por telefone
insert into pessoas (nome, telefone, email, criado_em)
select distinct on (tel_norm(v.telefone))
       v.nome, tel_norm(v.telefone), nullif(v.email,''), min(v.criado_em) over (partition by tel_norm(v.telefone))
  from voluntarios v
 where v.pessoa_id is null
   and coalesce(length(tel_norm(v.telefone)),0) >= 10
 order by tel_norm(v.telefone), v.pin_hash nulls last, v.criado_em
    on conflict (telefone) do nothing;

-- 1b. liga os vínculos órfãos
update voluntarios v set pessoa_id = p.id
  from pessoas p
 where p.telefone = tel_norm(v.telefone)
   and v.pessoa_id is null;

-- 1c. e a função para de criar novos órfãos
create or replace function inscrever(
  p_slug text, p_nome text, p_tel text, p_email text, p_funcoes jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_eq uuid; v_eq_nome text; v_gate boolean;
  v_nome text; v_tel text; v_mail text;
  v_id uuid; v_token text; v_n int; v_pessoa uuid;
begin
  select e.id, e.nome, coalesce(e.exige_aprovacao, false)
    into v_eq, v_eq_nome, v_gate
    from equipes e where e.slug = p_slug;
  if v_eq is null then
    return jsonb_build_object('ok', false, 'erro', 'EQUIPE_INVALIDA');
  end if;

  v_nome := btrim(coalesce(p_nome, ''));
  v_tel  := tel_norm(coalesce(p_tel, ''));
  v_mail := nullif(btrim(lower(coalesce(p_email, ''))), '');

  if length(v_nome) < 3 or position(' ' in v_nome) = 0 then
    return jsonb_build_object('ok', false, 'erro', 'NOME_INCOMPLETO');
  end if;
  if coalesce(length(v_tel), 0) < 10 or length(v_tel) > 13 then
    return jsonb_build_object('ok', false, 'erro', 'TELEFONE_INVALIDO');
  end if;
  if v_mail is not null and v_mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    return jsonb_build_object('ok', false, 'erro', 'EMAIL_INVALIDO');
  end if;

  if exists (
    select 1 from voluntarios v
     where v.equipe_id = v_eq and tel_norm(v.telefone) = v_tel
  ) then
    return jsonb_build_object('ok', false, 'erro', 'JA_CADASTRADO');
  end if;

  if not exists (
    select 1 from jsonb_each_text(coalesce(p_funcoes, '{}'::jsonb)) x
     where x.value in ('titular', 'reserva', 'treino')
  ) then
    return jsonb_build_object('ok', false, 'erro', 'SEM_AREA');
  end if;

  select count(*) into v_n from voluntarios v
   where v.equipe_id = v_eq and v.criado_em > now() - interval '1 hour';
  if v_n >= 40 then
    return jsonb_build_object('ok', false, 'erro', 'MUITOS_CADASTROS');
  end if;

  /* NOVO: a identidade primeiro, o vínculo depois. Mesma regra de `candidatar`,
     inclusive em não sobrescrever o nome de quem já existe: cadastro público
     não é prova de posse do número. */
  insert into pessoas (nome, telefone, email)
       values (v_nome, v_tel, v_mail)
  on conflict (telefone) do update
     set email = coalesce(pessoas.email, excluded.email),
         atualizado_em = now()
    returning id into v_pessoa;

  insert into voluntarios (equipe_id, pessoa_id, nome, telefone, email, conferido, ativo)
       values (v_eq, v_pessoa, v_nome, v_tel, v_mail, false, not v_gate)
    returning id, token into v_id, v_token;

  insert into habilidades (voluntario_id, funcao_id, nivel, confirmado)
  select v_id, f.id, x.value::nivel_habilidade, false
    from jsonb_each_text(p_funcoes) x
    join funcoes f on f.equipe_id = v_eq and f.nome = x.key and f.ativa
   where x.value in ('titular', 'reserva', 'treino')
      on conflict (voluntario_id, funcao_id) do nothing;

  if v_gate then
    return jsonb_build_object('ok', true, 'pendente', true,
                              'nome', v_nome, 'equipe', v_eq_nome);
  end if;

  return jsonb_build_object('ok', true, 'pendente', false, 'token', v_token,
                            'nome', v_nome, 'equipe', v_eq_nome);
end $fn$;

revoke all on function inscrever(text, text, text, text, jsonb) from public;
grant execute on function inscrever(text, text, text, text, jsonb) to anon, authenticated;


-- =========================================================================
-- §2  O líder deixa de ser um e-mail solto.
--
-- Hoje `lideres` casa por e-mail e `pessoas` casa por telefone, e nada liga
-- as duas. Consequências: não existe resposta para "o que esta pessoa faz na
-- igreja inteira", o papel só pode ser "manda em tudo" ou "manda numa área",
-- e não há onde pendurar um papel intermediário (um coordenador que vê a
-- escala mas não aprova candidatura, por exemplo).
--
-- Esta é a coluna que destrava isso, e só ela: a tabela de papéis vem depois,
-- quando as telas de líder forem refeitas. Aqui é a espinha, não o esqueleto
-- inteiro. Nada no app depende dessa coluna ainda, então ela é aditiva pura.
--
-- O casamento por e-mail acerta pouco de propósito: metade das pessoas não
-- tem e-mail cadastrado. O que sobrar em branco é preenchido a mão pelo líder
-- quando a tela existir. Preencher errado seria pior que deixar vazio.
-- =========================================================================
alter table lideres add column if not exists pessoa_id uuid references pessoas(id) on delete set null;
create index if not exists ix_lideres_pessoa on lideres(pessoa_id);
comment on column lideres.pessoa_id is
  'liga quem organiza a quem é, na mesma tabela de identidade dos voluntários. Preenchido por e-mail quando dá; o resto é ato de líder. O acesso continua sendo decidido por e-mail no JWT: esta coluna ainda não manda em nada.';

update lideres l set pessoa_id = p.id
  from pessoas p
 where l.pessoa_id is null
   and l.email <> ''
   and lower(p.email) = lower(l.email);


-- =========================================================================
-- §3  As restrições que impedem a duplicata de nascer.
--
-- "Já cadastrado" existe hoje só DENTRO de `inscrever`. Os outros dois
-- caminhos de inserção, o do líder pela tela de time e o de
-- `decidir_candidatura`, não checam nada. Sem restrição no banco, a regra
-- vale por convenção, e convenção não é integridade.
--
-- Cada bloco confere antes e recusa com mensagem útil em vez de estourar
-- críptico no meio da migração.
-- =========================================================================

-- 3a. uma pessoa não entra duas vezes na mesma equipe
do $$
declare v_dup text;
begin
  select string_agg(format('equipe=%s tel=%s (%s linhas)', equipe_id, tel, n), ' · ')
    into v_dup
    from (select equipe_id, tel_norm(telefone) as tel, count(*) n
            from voluntarios
           where coalesce(length(tel_norm(telefone)),0) >= 10
           group by 1,2 having count(*) > 1) d;

  if v_dup is not null then
    raise exception E'NAO CRIEI a unique de voluntarios(equipe_id, telefone): ja existe duplicata.\nResolva estas antes: %', v_dup;
  end if;

  create unique index if not exists ux_vol_equipe_tel
      on voluntarios (equipe_id, tel_norm(telefone))
   where coalesce(length(tel_norm(telefone)),0) >= 10;
end $$;

-- 3b. dois ministérios não dividem o mesmo slug
--     (a migração que criou `equipes` não está no repositório, então a unique
--      pode ou não existir. `if not exists` cobre os dois casos.)
do $$
declare v_dup text;
begin
  select string_agg(slug || ' (' || n || ')', ' · ') into v_dup
    from (select slug, count(*) n from equipes group by 1 having count(*) > 1) d;

  if v_dup is not null then
    raise exception E'NAO CRIEI a unique de equipes.slug: ja existe duplicata: %', v_dup;
  end if;

  create unique index if not exists ux_equipes_slug on equipes (slug);
end $$;

-- 3c. um vínculo aponta para no máximo uma pessoa, e o índice torna a busca
--     por identidade barata quando a tabela crescer
create index if not exists ix_voluntarios_pessoa_equipe on voluntarios (pessoa_id, equipe_id);


-- =========================================================================
-- §4  Escritas de várias etapas viram uma transação só.
--
-- Dois caminhos do líder faziam N gravações independentes a partir do
-- navegador, e nenhum dos dois olhava o erro:
--
--   criarVoluntario  insere a pessoa e DEPOIS as habilidades. Se o segundo
--                    insert falhava, a pessoa nascia sem função nenhuma e a
--                    tela anunciava que ela entrou no time.
--   salvarFuncoes    um update ou insert por função, em série. Cair no meio
--                    deixava a lista de postos da área pela metade.
--
-- Tratar o erro no front não resolve: o estado partido já aconteceu. O
-- padrão que este banco já usa para isso é `salvar_dia`, que grava um domingo
-- inteiro numa transação e desfaz tudo se qualquer regra barrar. As duas
-- funções abaixo seguem o mesmo idioma.
--
-- De quebra, o caminho do líder passa a ter a validação que só existia no
-- caminho público: nome com sobrenome e telefone de 10 a 13 dígitos. Antes,
-- `criarVoluntario` inseria qualquer coisa direto na tabela.
--
-- SECURITY INVOKER: é ação de líder, então roda como ele e cai na RLS, que é
-- o que garante que ninguém escreve na equipe do outro. Mesma decisão da 23.
-- =========================================================================
create or replace function criar_voluntario(
  p_equipe uuid, p_nome text, p_tel text, p_limite int, p_funcoes jsonb
) returns jsonb
language plpgsql security invoker set search_path = public as $fn$
declare v_nome text; v_tel text; v_pessoa uuid; v_id uuid;
begin
  v_nome := btrim(coalesce(p_nome, ''));
  v_tel  := tel_norm(coalesce(p_tel, ''));

  if length(v_nome) < 3 or position(' ' in v_nome) = 0 then
    return jsonb_build_object('ok', false, 'erro', 'NOME_INCOMPLETO');
  end if;
  if v_tel <> '' and (length(v_tel) < 10 or length(v_tel) > 13) then
    return jsonb_build_object('ok', false, 'erro', 'TELEFONE_INVALIDO');
  end if;
  if v_tel <> '' and exists (
    select 1 from voluntarios v where v.equipe_id = p_equipe and tel_norm(v.telefone) = v_tel
  ) then
    return jsonb_build_object('ok', false, 'erro', 'JA_CADASTRADO');
  end if;

  /* a identidade primeiro, como em `inscrever` e `candidatar`. Sem telefone
     não dá para casar pessoa: o vínculo nasce sem identidade e o líder
     completa depois. É o único caso em que isso é aceitável, porque foi um
     líder que digitou e ele sabe quem é. */
  if v_tel <> '' then
    insert into pessoas (nome, telefone) values (v_nome, v_tel)
    on conflict (telefone) do update set atualizado_em = now()
      returning id into v_pessoa;
  end if;

  insert into voluntarios (equipe_id, pessoa_id, nome, telefone, limite_mes, conferido)
       values (p_equipe, v_pessoa, v_nome, nullif(v_tel,''), p_limite, true)
    returning id into v_id;

  /* nível dado por líder nasce conferido: foi ele que olhou. */
  insert into habilidades (voluntario_id, funcao_id, nivel, confirmado)
  select v_id, f.id, x.value::nivel_habilidade, true
    from jsonb_each_text(coalesce(p_funcoes, '{}'::jsonb)) x
    join funcoes f on f.equipe_id = p_equipe and f.nome = x.key
   where x.value in ('titular', 'reserva', 'treino')
      on conflict (voluntario_id, funcao_id) do nothing;

  return jsonb_build_object('ok', true, 'id', v_id);
end $fn$;

revoke all on function criar_voluntario(uuid, text, text, int, jsonb) from public, anon;
grant execute on function criar_voluntario(uuid, text, text, int, jsonb) to authenticated;
comment on function criar_voluntario(uuid, text, text, int, jsonb) is
  'cadastro de voluntário pelo líder, em uma transação: identidade, vínculo e habilidades juntos. Substitui a sequência de inserts do lib/db.ts, que podia deixar a pessoa sem função nenhuma.';


create or replace function salvar_funcoes(p_equipe uuid, p_funcoes jsonb)
returns jsonb
language plpgsql security invoker set search_path = public as $fn$
declare r record; v_vistos uuid[] := '{}'; v_id uuid;
begin
  for r in
    select (x ->> 'id')::uuid                          as id,
           btrim(coalesce(x ->> 'nome',''))            as nome,
           coalesce((x ->> 'simultanea')::boolean,false) as simultanea,
           coalesce((x ->> 'ordem')::int, 0)           as ordem,
           coalesce((x ->> 'ativa')::boolean,true)     as ativa
      from jsonb_array_elements(coalesce(p_funcoes,'[]'::jsonb)) x
  loop
    if r.nome = '' then
      raise exception 'funcao sem nome';
    end if;

    if r.id is not null then
      /* a linha tem que ser DESTA equipe. A RLS já barraria, mas dizer não
         explicitamente é mais barato de depurar que uma linha que some. */
      if not exists (select 1 from funcoes where id = r.id and equipe_id = p_equipe) then
        raise exception 'funcao de outro ministerio';
      end if;
      update funcoes set nome = r.nome, simultanea = r.simultanea,
                         ordem = r.ordem, ativa = r.ativa
       where id = r.id;
      v_id := r.id;
    else
      insert into funcoes (equipe_id, nome, simultanea, ordem, ativa)
           values (p_equipe, r.nome, r.simultanea, r.ordem, r.ativa)
        returning id into v_id;
    end if;
    v_vistos := v_vistos || v_id;
  end loop;

  return jsonb_build_object('ok', true, 'salvas', coalesce(array_length(v_vistos,1),0));
end $fn$;

revoke all on function salvar_funcoes(uuid, jsonb) from public, anon;
grant execute on function salvar_funcoes(uuid, jsonb) to authenticated;
comment on function salvar_funcoes(uuid, jsonb) is
  'grava a lista de postos de uma equipe numa transação. Não apaga: remover posto continua sendo ação explícita, porque apagar função leva escalação e habilidade junto por cascade.';


/* =============================================================================
   CONFERÊNCIA DEPOIS DE APLICAR

     -- não pode sobrar vínculo sem identidade
     select count(*) as vinculos_orfaos from voluntarios
      where pessoa_id is null and coalesce(length(tel_norm(telefone)),0) >= 10;

     -- as três restrições existem?
     select indexname from pg_indexes
      where indexname in ('ux_vol_equipe_tel','ux_equipes_slug','ix_voluntarios_pessoa_equipe');

     -- quantos líderes ficaram ligados a uma pessoa
     select count(*) filter (where pessoa_id is not null) as ligados, count(*) as total from lideres;

   ROLLBACK
     §1  create or replace inscrever com o corpo de 20-porta-de-entrada.sql:70.
         O backfill NÃO precisa ser desfeito: preencher pessoa_id é correto
         mesmo na versão antiga.
     §2  alter table lideres drop column pessoa_id;
     §3  drop index ux_vol_equipe_tel, ux_equipes_slug, ix_voluntarios_pessoa_equipe;
   ============================================================================= */


-- =========================================================================
-- CONFERENCIA FINAL, ainda dentro da transacao.
-- Se alguma linha disser FALTA, de ROLLBACK em vez de COMMIT.
-- =========================================================================
select 'policy hist_criar' as item,
       case when exists (select 1 from pg_policies where schemaname='public'
                          and tablename='historico_candidatura' and policyname='hist_criar')
            then 'OK' else 'FALTA' end as situacao
union all
select 'equipe_entrar apagada',
       case when not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                              where n.nspname='public' and p.proname='equipe_entrar')
            then 'OK' else 'FALTA' end
union all
select 'conflitos_entre_ministerios com escopo de equipe',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                          where n.nspname='public' and p.proname='conflitos_entre_ministerios'
                            and pg_get_function_identity_arguments(p.oid) like '%p_equipe uuid%')
            then 'OK' else 'FALTA' end
union all
select 'tabela entrar_tentativas_equipe',
       case when to_regclass('public.entrar_tentativas_equipe') is not null then 'OK' else 'FALTA' end
union all
select 'lideres.pessoa_id',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='lideres' and column_name='pessoa_id')
            then 'OK' else 'FALTA' end
union all
select 'unique voluntarios(equipe_id, telefone)',
       case when to_regclass('public.ux_vol_equipe_tel') is not null then 'OK' else 'FALTA' end
union all
select 'unique equipes.slug',
       case when to_regclass('public.ux_equipes_slug') is not null then 'OK' else 'FALTA' end
union all
select 'funcao criar_voluntario',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                          where n.nspname='public' and p.proname='criar_voluntario') then 'OK' else 'FALTA' end
union all
select 'funcao salvar_funcoes',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                          where n.nspname='public' and p.proname='salvar_funcoes') then 'OK' else 'FALTA' end
union all
select 'vinculos ainda sem identidade (tem que ser 0)',
       (select count(*)::text from voluntarios
         where pessoa_id is null and coalesce(length(tel_norm(telefone)),0) >= 10)
union all
select 'lideres ligados a uma pessoa',
       (select count(*) filter (where pessoa_id is not null)::text || ' de ' || count(*)::text from lideres);

commit;

/* Se preferir conferir antes de gravar de vez: troque o `commit;` acima por
   `rollback;`, rode, leia a tabela, e so entao rode de novo com `commit;`. */
