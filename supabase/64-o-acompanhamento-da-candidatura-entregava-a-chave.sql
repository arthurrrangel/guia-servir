/* ESTE ARQUIVO E PASSADO. A TRANCA ESTA AQUI PORQUE ELE PODE DESFAZER.

   `create or replace function` nao e idempotente NO TEMPO: ele grava a versao
   deste arquivo por cima da que estiver la, seja ela mais nova ou nao, e sem
   um aviso.

   O que este arquivo consegue reverter, se rodar fora de hora:
     candidatar (a 63 e esta dividem a funcao; fora de ordem uma apaga a outra)

   Por isso ele se recusa a rodar num banco que ja passou da 64. Aplicado na
   ordem, do zero, `exige_versao_ate` ainda nem existe (ela nasce na 55) e o
   bloco nao faz nada — e e assim que tem que ser, senao o rebuild do
   repositorio parava aqui.

   Se voce REALMENTE precisa reaplicar, a mensagem do erro diz como. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(64);
  end if;
end $tranca$;

/* =============================================================================
   64 · A QUARTA PORTA: O ACOMPANHAMENTO DA CANDIDATURA ENTREGAVA A CHAVE

   21/09/2026. Só de Escalas. Depende da 51 e da 36.

   -------------------------------------------------------------------------
   A MESMA REGRA, O QUARTO LUGAR

   A 51 escreveu: a porta pública só entrega credencial que ela mesma acabou
   de criar, para uma identidade que ela mesma acabou de criar. Foi aplicada
   em `candidatar` (51), em `inscrever` (55) e na ESCRITA de `inscrever` (63).

   Falta `candidatura_status`. O comentário dela, escrito na 36, diz:

       "o token da candidatura provou a identidade dela o funil inteiro, e
        segurar o link para um humano mandar depois era o buraco que fazia a
        jornada não fechar."

   A primeira metade é falsa exatamente no caso que a 51 descreveu. Quando a
   pessoa JÁ EXISTIA, `candidatar` não criou identidade nenhuma: o token da
   candidatura prova apenas que quem chamou sabia um telefone.

   -------------------------------------------------------------------------
   A CADEIA, MEDIDA — NÃO DEDUZIDA

   Num banco nascido de `scripts/banco-do-zero.sh`, com as 63 migrações
   aplicadas, vítima sintética que existe em `pessoas` e serve só no Louvor:

     1. anon -> candidatar('kids', 'Atacante Segundo Nome', <telefone dela>)
        devolve pendente=true, por='ja_conhecida', e o TOKEN DA CANDIDATURA
        (que a 51 considerou seguro, e é: ele só abre o andamento)
     2. anon -> candidatura_status(<token>)  ANTES de qualquer aprovação
        devolve  nome = "Vitima Dois da Silva"
        <- o NOME COMPLETO da vítima, a partir de um telefone. É o item 3 do
           cabeçalho da 51, ainda aberto por este caminho.
     3. na fila da liderança a candidatura aparece com o NOME VERDADEIRO da
        vítima — porque a 51 parou de sobrescrever `pessoas.nome`, o que está
        certo e teve esta consequência não intencional: o que a líder lê é
        "uma pessoa conhecida da casa se ofereceu", e não é isso que está ali
     4. a liderança aprova
     5. anon -> candidatura_status(<token>)  DEPOIS
        devolve  link_pessoal = <token do vínculo, ligado à pessoa_id da
        vítima>
     6. anon -> quem_sou(link)      perfil da vítima
        anon -> eu_sexo(link, 'M')  REESCREVE o cadastro dela no Louvor

   O passo 3 é o que torna o passo 4 provável. Duas decisões corretas — não
   escrever em tabela de identidade pela porta anônima (51) e fechar a jornada
   entregando o link na tela (36) — compõem uma armadilha que nenhuma das
   duas contém sozinha. É o tipo de defeito que só aparece andando o caminho.

   -------------------------------------------------------------------------
   POR QUE NÃO BASTA TIRAR O `link_pessoal`

   Porque o passo 4 continuaria acontecendo. A liderança aprovaria uma
   candidatura fraudulenta lendo o nome de uma pessoa de verdade, e o
   resultado seria um vínculo novo, na `pessoa_id` da vítima, num ministério
   que ela nunca procurou. Sem token vazado, mas com o cadastro dela alterado
   por um estranho. Fechar só a saída deixa a fraude invisível.

   Então são duas correções, e elas se sustentam:

     · `identidade_nova` (coluna nova): congela a resposta que `candidatar` já
       calcula e jogava fora. `candidatura_status` só entrega `link_pessoal`
       quando ela é verdadeira.

     · `nome_informado` (coluna nova): guarda o nome DIGITADO na porta. A tela
       de acompanhamento passa a mostrar esse, e não o de quem tem o telefone.
       E a fila da liderança passa a poder mostrar OS DOIS quando divergem —
       que é o que transforma a aprovação num ato informado.

   A liderança NÃO é impedida de aprovar. Nome diferente tem explicação banal
   (apelido, nome de casada, a mãe cadastrando pelo telefone da família). O
   arquivo avisa; quem decide é quem conhece as pessoas.

   -------------------------------------------------------------------------
   O BACKFILL É EXATO, NÃO É CHUTE

   `pessoas.criado_em` e `candidaturas.criado_em` têm os dois `default now()`,
   e `now()` é o instante de início da TRANSAÇÃO. Quando `candidatar` cria a
   pessoa e a candidatura, as duas linhas recebem o MESMO carimbo, ao
   microssegundo. Quando não cria, os carimbos vêm de transações diferentes.

   Então `c.criado_em = p.criado_em` responde "esta candidatura criou esta
   identidade?" sem margem. Para não depender só disso, a condição também
   exige que não exista nada mais velho daquela pessoa — vínculo ou outra
   candidatura. Se a candidatura criou a identidade, não pode haver.

   -------------------------------------------------------------------------
   O QUE MUDA NO APP

   `app/candidatura/[token]`: o "Seu nome" pode vir nulo em candidatura antiga
   de pessoa que já existia (não gravamos o nome digitado naquela época). A
   tela deixa de mostrar o campo em vez de mostrar vazio.

   `app/painel/candidaturas`: quando o nome digitado difere do nome da pessoa
   que tem aquele telefone, a linha diz isso, com as duas grafias.
   ============================================================================= */


-- =========================================================================
-- 1 · as duas colunas, e o backfill
-- =========================================================================

alter table candidaturas add column if not exists nome_informado  text;
alter table candidaturas add column if not exists identidade_nova boolean not null default false;

comment on column candidaturas.nome_informado is
  'O nome DIGITADO na porta publica. Desde a 51 a porta nao sobrescreve pessoas.nome, entao sem esta coluna a fila da lideranca mostra o nome de quem TEM aquele telefone, qualquer que tenha sido o nome digitado.';
comment on column candidaturas.identidade_nova is
  'true quando foi ESTA candidatura que criou a linha em pessoas. E o que autoriza candidatura_status a entregar o link pessoal: token de candidatura so prova identidade quando a porta criou a identidade.';

do $bf$
declare v_n int;
begin
  update candidaturas c
     set identidade_nova = true
    from pessoas p
   where p.id = c.pessoa_id
     and not c.identidade_nova
     /* mesmo instante = mesma transação = foi esta chamada que criou a pessoa */
     and c.criado_em = p.criado_em
     /* e, por segurança, nada mais velho daquela pessoa pode existir */
     and not exists (select 1 from voluntarios v
                      where v.pessoa_id = p.id and v.criado_em < c.criado_em)
     and not exists (select 1 from candidaturas c2
                      where c2.pessoa_id = p.id and c2.criado_em < c.criado_em);
  get diagnostics v_n = row_count;
  raise notice '64 · backfill: % candidatura(s) marcadas como criadoras da propria identidade.', v_n;
end $bf$;


-- =========================================================================
-- 2 · `candidatar` grava as duas
--
-- Corpo extraído de `supabase/51-a-porta-publica-nao-entrega-credencial.sql`.
-- Uma instrução muda: a que insere a candidatura.
-- =========================================================================

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

  /* 64 · AS DUAS COLUNAS NOVAS, E SÓ ELAS.
     `identidade_nova` congela aqui a resposta que a função já calculou e
     jogava fora: foi ESTA chamada que criou a pessoa? É ela que decide, lá
     em `candidatura_status`, se o token da candidatura pode virar link
     pessoal. Sem gravar, a pergunta não sobrevive à requisição, e quem lê a
     candidatura depois não tem como saber.
     `nome_informado` guarda o nome DIGITADO na porta. A 51 parou de
     sobrescrever `pessoas.nome` (certo: escrita anônima em tabela de
     identidade não tem por que existir), e a consequência não intencional foi
     a fila da liderança mostrar o nome VERDADEIRO de quem tem aquele
     telefone, qualquer que tenha sido o nome digitado. Guardar os dois é o
     que torna a divergência visível para quem aprova. */
  insert into candidaturas (pessoa_id, equipe_id, nome_informado, identidade_nova)
       values (v_pessoa, v_eq, v_nome, v_pessoa_nova)
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
  'cadastro pela porta publica do site. Desde a 64 grava nome_informado e identidade_nova: sem elas, ninguem depois consegue saber se a porta criou a identidade ou apenas encontrou uma que ja existia.';


-- =========================================================================
-- 3 · `candidatura_status` para de entregar chave de terceiro
--
-- Corpo extraído de `supabase/36-a-jornada-fecha.sql`. Duas expressões mudam:
-- a condição do `link_pessoal` e o `nome` devolvido.
-- =========================================================================

create or replace function candidatura_status(p_token text)
returns jsonb
language plpgsql security definer stable set search_path = public as $fn$
declare
  c record; v_funcoes text[];
  v_passo text; v_titulo text; v_texto text; v_etapa int;
  v_da text; v_ao text; v_tem_quem boolean; v_link text;
begin
  select ca.*, e.nome as equipe_nome, e.slug as equipe_slug,
         coalesce(e.artigo, 'o') as artigo,
         e.responsavel_nome, e.responsavel_whatsapp, p.nome as pessoa_nome, p.id as pessoa_id
    into c
    from candidaturas ca
    join equipes e on e.id = ca.equipe_id
    join pessoas p on p.id = ca.pessoa_id
   where ca.token = p_token;
  if not found then return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO'); end if;

  select array_agg(f.nome order by f.ordem) into v_funcoes
    from candidatura_funcoes cf join funcoes f on f.id = cf.funcao_id
   where cf.candidatura_id = c.id;

  /* concordância: "da Livraria" e não "do Livraria", "à Livraria" e não "ao".
     Um erro de artigo na primeira frase que a pessoa lê já diz que ninguém
     olhou com cuidado. */
  v_da := case when c.artigo = 'a' then 'da ' else 'do ' end;
  v_ao := case when c.artigo = 'a' then 'à '  else 'ao ' end;

  /* existe alguém nomeado para essa área? É isso que decide se faz sentido
     mandar a pessoa chamar alguém. */
  v_tem_quem := coalesce(nullif(btrim(coalesce(c.responsavel_nome, '')), ''), null) is not null
                and coalesce(nullif(btrim(coalesce(c.responsavel_whatsapp, '')), ''), null) is not null;

  /* O LINK PESSOAL, E A CONDIÇÃO QUE FALTAVA.

     O comentário original dizia "o token da candidatura provou a identidade
     dela o funil inteiro". Essa premissa é FALSA exatamente quando a pessoa
     já existia antes da candidatura: aí o token prova só que quem chamou
     sabia um telefone. Medido em 21/09/2026 num banco nascido do
     repositório: anônimo candidata o telefone de alguém ao Kids, a liderança
     aprova (a fila mostra o nome VERDADEIRO, então parece gente da casa), e
     esta função entrega o token do vínculo novo — ligado à `pessoa_id` da
     vítima. Com ele, `quem_sou` devolve o perfil dela e `eu_sexo` REESCREVE o
     cadastro dela em todos os outros ministérios.

     `identidade_nova` é a mesma regra da 51 e da 63, na quarta porta: a
     credencial só sai quando foi esta chamada que criou a identidade. */
  if c.identidade_nova and c.status in ('aprovada', 'integrando', 'ativa') then
    select v.token into v_link
      from voluntarios v
     where v.pessoa_id = c.pessoa_id and v.equipe_id = c.equipe_id and v.ativo
     limit 1;
  end if;

  case c.status
    when 'enviada' then
      v_etapa := 1; v_titulo := 'Recebemos seu cadastro';
      v_texto := 'A liderança ' || v_da || c.equipe_nome || ' já está com o seu nome.';
      v_passo := case when v_tem_quem
        then 'Se quiser adiantar, chame ' || c.responsavel_nome || ' no WhatsApp e se apresente.'
        else 'Agora é com a liderança. Você não precisa fazer nada: quando houver novidade, ela aparece aqui.' end;

    when 'em_analise' then
      v_etapa := 2; v_titulo := 'Estamos olhando o seu cadastro';
      v_texto := 'Alguém da liderança está vendo onde você se encaixa melhor.';
      /* mesmo enquadramento de 'enviada': do lado do líder as duas situações
         pedem a mesma coisa (ligar), então do lado da pessoa as duas precisam
         soar igual de opcionais. */
      v_passo := case when v_tem_quem
        then 'Se quiser adiantar, chame ' || c.responsavel_nome || ' no WhatsApp e se apresente.'
        else 'Nada a fazer por enquanto. Guarde este link e volte nele.' end;

    when 'conversa' then
      v_etapa := 3; v_titulo := 'A liderança quer falar com você';
      v_texto := 'Antes de te encaixar, ' || v_da || c.equipe_nome || ' conversa com cada pessoa.';
      /* QUEM LIGA PARA QUEM. Este texto dizia "chame X no WhatsApp para marcar
         essa conversa" enquanto a fila do líder marcava a mesma candidatura
         como "chamar para conversar". Cada lado mandava o outro ligar, e o
         resultado é o silêncio: ninguém liga, e a pessoa acha que sumiu.

         Quem liga é a liderança. Quem se ofereceu já fez a parte dela, e
         obrigar essa pessoa a correr atrás da igreja é exatamente a sensação
         que a jornada existe para eliminar. O WhatsApp continua oferecido
         aqui, mas como atalho de quem tem pressa, não como tarefa. */
      v_passo := case when v_tem_quem
        then c.responsavel_nome || ' vai te chamar no WhatsApp. Se quiser adiantar, você também pode chamar.'
        else 'A liderança vai te procurar pelo WhatsApp que você cadastrou.' end;

    when 'entrevista' then
      v_etapa := 3; v_titulo := 'Conversa marcada';
      v_texto := 'Falta só o encontro com a liderança.';
      v_passo := case when v_tem_quem
        then 'Confirme o horário com ' || c.responsavel_nome || ' no WhatsApp.'
        else 'Confirme o horário quando a liderança te chamar.' end;

    when 'aprovada' then
      v_etapa := 4; v_titulo := 'Você faz parte do time';
      v_texto := 'Bem-vindo ' || v_ao || c.equipe_nome || '.';
      /* AQUI ESTAVA O BURACO. O link existe; agora ele é entregue. */
      v_passo := case when v_link is not null
        then 'Seu espaço já está pronto. É lá que fica a sua escala e é por lá que você diz quando pode servir.'
        else 'A liderança vai te passar o acesso ao seu espaço.' end;

    when 'integrando' then
      v_etapa := 5; v_titulo := 'Integração em andamento';
      v_texto := 'Você já está no time e está conhecendo como tudo funciona.';
      v_passo := 'Siga os primeiros passos com quem está te acompanhando.';

    when 'ativa' then
      v_etapa := 6; v_titulo := 'Você está servindo';
      v_texto := 'Sua escala aparece no seu espaço pessoal.';
      /* sem travessão: proibido na interface, e este vinha do banco */
      v_passo := 'Responda sua disponibilidade todo mês. É ela que monta a escala.';

    else  -- recusada, inativa
      v_etapa := 0; v_titulo := 'Seu cadastro está encerrado por enquanto';
      v_texto := 'Isso não quer dizer que não haja lugar para você. Às vezes é época, '
               || 'às vezes é outra área que combina mais.';
      v_passo := case when v_tem_quem
        then 'Chame ' || c.responsavel_nome || ' no WhatsApp para conversar, ou veja as outras áreas.'
        else 'Veja as outras áreas: pode haver uma que combine mais com você agora.' end;
  end case;

  return jsonb_build_object(
    'ok', true,
    'status', c.status::text,
    'etapa', v_etapa,
    /* UM número para a jornada. As telas paravam de contar cada uma do seu
       jeito: quatro na home, cinco na página da área, seis aqui. */
    'etapa_de', case when v_etapa = 0 then 0
                     when v_etapa <= 2 then 1
                     when v_etapa <= 3 then 2
                     when v_etapa = 4 then 3
                     else 4 end,
    'etapa_total', 4,
    'titulo', v_titulo,
    'texto', v_texto,
    'proximo_passo', v_passo,
    /* 64 · o nome que a porta RECEBEU, não o nome de quem tem aquele
       telefone. Quando a candidatura criou a identidade os dois são o mesmo.
       Quando não criou, devolver `pessoas.nome` era entregar o nome completo
       de um terceiro a quem só digitou um número — o item 3 do cabeçalho da
       51, ainda aberto por este caminho. Candidatura antiga não tem
       `nome_informado` gravado; aí devolve nulo, e a tela trata. */
    'nome', coalesce(c.nome_informado,
                     case when c.identidade_nova then c.pessoa_nome end),
    'equipe', c.equipe_nome,
    'equipe_slug', c.equipe_slug,
    'artigo', c.artigo,
    'funcoes', coalesce(to_jsonb(v_funcoes), '[]'::jsonb),
    'responsavel', c.responsavel_nome,
    'whatsapp', c.responsavel_whatsapp,
    'tem_quem_falar', v_tem_quem,
    /* o link pessoal, quando já existe. Null antes da aprovação. */
    'link_pessoal', v_link,
    'criado_em', c.criado_em
  );
end $fn$;

revoke all on function candidatura_status(text) from public;
grant execute on function candidatura_status(text) to anon, authenticated;
comment on function candidatura_status(text) is
  'o estado da candidatura para a tela de acompanhamento. Desde a 64 so entrega o link pessoal quando foi esta candidatura que criou a identidade, e devolve o nome DIGITADO na porta, nunca o nome de quem tem aquele telefone.';


-- =========================================================================
-- REGISTRO NA RÉGUA E NA SONDA
-- =========================================================================

do $reg$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (64, '64 · candidatura_status exige identidade_nova para o link', 'candidatura_status',
           'c.identidade_nova and c.status in'),
      (64, '64 · candidatar grava o nome digitado na porta', 'candidatar',
           'nome_informado, identidade_nova')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;

  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo)
      values (64, '64-o-acompanhamento-da-candidatura-entregava-a-chave.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;


-- =========================================================================
-- A CONFERÊNCIA
--
-- Anda a cadeia inteira do cabeçalho, com a liderança aprovando de verdade, e
-- cobra que ela pare. Depois anda o caminho de quem tem razão — gente nova
-- pelo site, aprovada, recebendo o link na tela — e cobra que ele siga.
-- =========================================================================

do $conf$
declare
  v_eq uuid; v_eq2 uuid; v_fn uuid; v_pessoa uuid; v_vinc uuid; v_cand uuid;
  v_r jsonb; v_tok text; v_link text; v_resp jsonb; v_sexo text;
  v_tel_vitima text := '21999990064';
  v_tel_novo   text := '21999990065';
  ok int := 0; falhou int := 0; msg text := '';
begin
  insert into equipes (nome, slug, ordem, exige_aprovacao)
       values ('Conf64 Alvo', 'conf64', 9965, true) returning id into v_eq;
  insert into equipes (nome, slug, ordem, exige_aprovacao)
       values ('Conf64 Onde Ela Serve', 'conf64-outra', 9966, true) returning id into v_eq2;
  insert into funcoes (equipe_id, nome, ordem, ativa)
       values (v_eq, 'POSTO64', 1, true) returning id into v_fn;

  /* A VÍTIMA SERVE NA OUTRA EQUIPE, E É POR ISSO QUE SÃO DUAS.
     `candidatar` recusa com JA_NO_TIME quando a pessoa já tem vínculo na
     equipe alvo, então o caso a reproduzir é o da pessoa que EXISTE e não
     está naquela área — que é a maioria das pessoas, para a maioria das
     áreas. E o vínculo lá fora é o que dá o que medir no caso 4: é o cadastro
     dela naquela equipe que `eu_sexo` reescreveria. */
  insert into pessoas (nome, telefone) values ('Vitima Conf Sessentaequatro', v_tel_vitima)
    returning id into v_pessoa;
  insert into voluntarios (equipe_id, pessoa_id, nome, telefone, conferido, ativo, sexo)
       values (v_eq2, v_pessoa, 'Vitima Conf Sessentaequatro', v_tel_vitima, true, true, 'F')
    returning id into v_vinc;

  select jsonb_object_agg(q.id::text, 'x') into v_resp
    from perguntas q where q.ativa and q.obrigatoria;

  /* ---- 1. o telefone da vítima, digitado com OUTRO nome --------------- */
  v_r := candidatar('conf64', 'Atacante Conf Sessentaequatro', v_tel_vitima, null,
                    array['POSTO64'], v_resp);
  v_tok := v_r ->> 'token';
  /* A PREMISSA, E NÃO O RAMO QUE A PRODUZIU. A primeira versão deste caso
     cobrava `por = 'ja_conhecida'` e reprovou: numa equipe COM portão o `por`
     é 'portao', porque `v_gate` é testado primeiro. O ramo não importa — o
     que a cadeia precisa é de uma candidatura com token que NÃO criou a
     identidade. É isso que se cobra. */
  if v_tok is not null
     and not (select identidade_nova from candidaturas where token = v_tok)
  then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x o caso nao esta montado: candidatar devolveu ' || v_r::text;
  end if;

  /* ---- 2. o nome de terceiro NÃO sai pela tela de acompanhamento ------- */
  v_r := candidatura_status(v_tok);
  if (v_r ->> 'nome') = 'Atacante Conf Sessentaequatro' then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x candidatura_status devolveu o nome ' || coalesce(v_r ->> 'nome','<nulo>')
               || ' para quem so digitou um telefone';
  end if;

  /* ---- 3. a liderança aprova, e MESMO ASSIM o link não sai ------------- */
  select c.id into v_cand from candidaturas c where c.token = v_tok;
  perform decidir_candidatura(v_cand, 'aprovada', 'conferencia da 64');
  v_r := candidatura_status(v_tok);
  if (v_r ->> 'status') = 'aprovada' then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x a aprovacao nao andou: o resto seria vacuo. status=' || coalesce(v_r->>'status','<nulo>');
  end if;

  v_link := v_r ->> 'link_pessoal';
  if v_link is null then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x A CHAVE SAIU: candidatura_status entregou o token de um vinculo ligado a pessoa_id de terceiro';
  end if;

  /* ---- 4. e por isso nada foi escrito na vítima ------------------------ */
  if v_link is not null then perform eu_sexo(v_link, 'M'); end if;
  select v.sexo into v_sexo from voluntarios v where v.id = v_vinc;
  if coalesce(v_sexo, '-') <> 'M' then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x o cadastro da vitima foi reescrito por quem so sabia o telefone dela';
  end if;

  /* ---- 5. e a divergência de nome fica GRAVADA para a liderança ver ---- */
  if exists (select 1 from candidaturas c join pessoas p on p.id = c.pessoa_id
              where c.id = v_cand
                and c.nome_informado = 'Atacante Conf Sessentaequatro'
                and p.nome = 'Vitima Conf Sessentaequatro')
  then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x a fila da lideranca nao tem como mostrar a divergencia: nome_informado nao foi gravado';
  end if;

  /* ---- 6. O CAMINHO DE QUEM TEM RAZÃO: gente nova, aprovada, com link -- */
  v_r := candidatar('conf64', 'Novata Conf Sessentaequatro', v_tel_novo, null,
                    array['POSTO64'], v_resp);
  v_tok := v_r ->> 'token';
  select c.id into v_cand from candidaturas c where c.token = v_tok;
  if (select identidade_nova from candidaturas where id = v_cand) then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x identidade_nova nao foi gravada para quem a porta acabou de criar';
  end if;

  perform decidir_candidatura(v_cand, 'aprovada', 'conferencia da 64');
  v_r := candidatura_status(v_tok);
  if (v_r ->> 'link_pessoal') is not null and (v_r ->> 'nome') = 'Novata Conf Sessentaequatro'
  then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || E'\n  x A CORRECAO FECHOU A JORNADA DE QUEM TEM RAZAO: gente nova aprovada '
               || 'precisa receber o link na tela (era o buraco que a 36 fechou). Retorno: ' || v_r::text;
  end if;

  /* ---- limpeza, POR ID ------------------------------------------------- */
  delete from historico_candidatura h using candidaturas c
   where h.candidatura_id = c.id and c.equipe_id in (v_eq, v_eq2);
  delete from candidatura_respostas r using candidaturas c
   where r.candidatura_id = c.id and c.equipe_id in (v_eq, v_eq2);
  delete from candidatura_funcoes cf using candidaturas c
   where cf.candidatura_id = c.id and c.equipe_id in (v_eq, v_eq2);
  delete from candidaturas where equipe_id in (v_eq, v_eq2);
  delete from habilidades h using voluntarios v
   where h.voluntario_id = v.id and v.equipe_id in (v_eq, v_eq2);
  delete from voluntarios where equipe_id in (v_eq, v_eq2);
  delete from funcoes where id = v_fn;
  delete from equipes where id in (v_eq, v_eq2);
  delete from pessoas where telefone in (v_tel_vitima, v_tel_novo);

  if falhou > 0 then
    raise exception 'A CONFERENCIA DA 64 REPROVOU: % de % casos', falhou, ok + falhou
      using detail = msg, errcode = 'raise_exception';
  end if;
  raise notice '64 · conferencia: %/% casos. O acompanhamento nao entrega mais chave nem nome de terceiro, e a jornada de quem e novo continua fechando na tela.', ok, ok;
end $conf$;


/* =============================================================================
   ROLLBACK
     Copiar `candidatar` da 51 e `candidatura_status` da 36 por cima. As
     colunas podem ficar: sem as funções que as leem elas são inertes.
     (`alter table candidaturas drop column nome_informado, drop column
     identidade_nova;` se realmente quiser apagar.)

   VERIFICAÇÃO DEPOIS DE APLICAR
     select * from testar_permissoes();
     select * from schema_versao_conferir();
   ============================================================================= */
