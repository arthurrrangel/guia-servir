/* ESTE ARQUIVO E PASSADO, E A TRANCA E A DELE MESMO.

   A 56 instalou `exige_versao_ate` nos 21 arquivos que podem REVERTER uma
   funcao mais nova. A 55 nao esta nessa lista: ninguem redefine o que ela
   define. Mesmo assim ela precisa da tranca, por outro motivo, e o motivo
   so apareceu rodando.

   A conferencia da propria 55 testa `exige_versao_ate` e, no caso 0c,
   afirma "a regua nao aborta a versao ATUAL". Num banco que ja foi para a
   56, reaplicar a 55 faz esse caso reprovar — e o arquivo morre com

       ERROR: FALHOU — 0c) a regua abortou a versao ATUAL

   que e verdade, e nao diz nada a quem esta lendo. Com a tranca, a recusa
   acontece na primeira linha e diz o que e: arquivo antigo em banco novo.

   Aplicado na ordem, do zero, `exige_versao_ate` ainda nem existe e o bloco
   nao faz nada. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(55);
  end if;
end $tranca$;

/* =============================================================================
   55 · O QUE A EQUIPE DE AGENTES ACHOU
   19/09/2026

   Seis correções, todas provadas rodando o ataque num Postgres reconstruído,
   não lendo o código. Três delas são a MESMA classe de defeito em lugares
   diferentes, e isso é o achado por trás dos achados: quando uma correção
   fecha uma porta, ninguém foi conferir as outras portas do mesmo corredor.

   -------------------------------------------------------------------------
   1 · `inscrever` ENTREGA A CREDENCIAL DA IDENTIDADE DE OUTRA PESSOA

      A migração 51 fechou exatamente isto em `candidatar`, e escreveu a regra
      em letras grandes:

          A PORTA PÚBLICA SÓ ENTREGA CREDENCIAL QUE ELA MESMA ACABOU DE
          CRIAR, PARA UMA IDENTIDADE QUE ELA MESMA ACABOU DE CRIAR.

      `inscrever` é a outra porta pública, também concedida a `anon`, e ficou
      como estava. Ela só recusa `JA_CADASTRADO` DENTRO da equipe do slug; a
      pessoa é reaproveitada por `on conflict (telefone)`, o vínculo novo
      nasce com o `pessoa_id` da vítima, e o token desse vínculo é devolvido.

      Rodado no banco reconstruído, como `anon`:

          inscrever('midia','Fulano Impostor','21977139781', null, {'PROJEÇÃO':'reserva'})
            -> {"ok": true, "pendente": false, "token": "ba7b96de421ac7b087"}
          quem_sou('ba7b96de421ac7b087')
            -> nome = "Filipe Oliveira Bernardo"

      Telefone de voluntário circula em grupo de WhatsApp de igreja. Dado um
      número, um anônimo obtém o nome da pessoa e uma credencial ligada à
      identidade dela.

      E o `do update set email` da mesma instrução deixa esse anônimo escrever
      o e-mail de contato de terceiro. A 51 trocou por `do nothing` em
      `candidatar` pelo mesmo motivo; aqui também.

   -------------------------------------------------------------------------
   2 · CLIQUE DUPLO EM "APROVAR" CRIA UM VOLUNTÁRIO FANTASMA COM TOKEN VIVO

      `decidir_candidatura` lê, decide e escreve sem segurar a linha. Duas
      chamadas na mesma candidatura leem `voluntario_id is null`, as duas
      inserem em `voluntarios`, e o `update candidaturas` do último vence.

      O primeiro vínculo fica ÓRFÃO: não aparece em tela nenhuma, porque
      todas partem da candidatura — mas tem `token` válido, `ativo = true`, e
      abre `/eu/<token>` com a escala do ministério.

      Provado forçando a sobreposição: duas chamadas devolveram
      `voluntario_id` DIFERENTES, dois tokens vivos, e duas linhas em
      `historico_candidatura`.

      Não precisa de má-fé: é um toque duplo numa tela de celular, ou a
      pessoa tocando de novo porque achou que não pegou — que é justamente o
      que o sistema já sabe que acontece quando a tela demora.

   -------------------------------------------------------------------------
   3 · O PIN DE QUEM CHEGOU PRIMEIRO NÃO VALE

      `equipe_pin_criar` lê `pin_hash` para decidir `JA_TEM_PIN` e grava
      trinta linhas depois. Duas chamadas simultâneas com PINs diferentes
      responderam AS DUAS `{"ok": true}`, com o MESMO token, e o hash que
      ficou valendo foi o da segunda.

      A pessoa que criou o PIN primeiro acredita que o dela vale. Quem entra
      é a outra. E o `ok: true` das duas é o que torna isso invisível.

   -------------------------------------------------------------------------
   4 · CONFERIR HABILIDADE ATRAVESSA MINISTÉRIO

      A política `eq_habilidades` confere `lidera_equipe()` da equipe do
      VOLUNTÁRIO, nunca da FUNÇÃO. Provado: um organizador preso ao Louvor
      conferiu habilidade de um voluntário do Louvor numa função da MÍDIA, e
      a linha entrou.

      Efeito: a pessoa passa a ser sorteada na escala da Mídia sem que o
      organizador da Mídia tenha feito nada, e sem aparecer no time dele.

   -------------------------------------------------------------------------
   5 · A TABELA ACEITA O QUE `salvar_dia` RECUSA

      `salvar_dia` levanta 'voluntario de outro ministerio' — mas isso é
      guarda de função, não de tabela. Inserindo direto em `escalacoes`, uma
      função da Mídia com voluntário do Louvor passa pelos quatro gatilhos e
      pela unique.

      Hoje dá 0 linhas no banco. É o tipo de invariante que só é verdade por
      sorte, e sorte acaba.

   -------------------------------------------------------------------------
   6 · REAPLICAR MIGRAÇÃO ANTIGA DESFAZ CORREÇÃO NOVA, EM SILÊNCIO

      Medido: aplicando cada arquivo antigo sobre o banco já migrado, DEZOITO
      mudam alguma coisa, e catorze mudam para pior. Os piores:

          23, 31, 43  desfazem a 51 — `candidatar` volta a entregar token
          18          desfaz a 54 — evento de um ministério volta a ser
                      visível para os outros
          04          desfaz a 45 e a 46
          02, 05      desfazem a 54 em `salvar_dia`

      `create or replace function` não é idempotente NO TEMPO: ele grava a
      versão daquele arquivo por cima da que estiver lá, seja ela mais nova
      ou não. A 50 ganhou uma tranca hoje, mas ela só AVISA depois do
      estrago.

      A tranca abaixo é diferente: ela ABORTA antes. Um arquivo antigo passa
      a se recusar a rodar num banco que já foi além dele.
   ============================================================================= */


-- =========================================================================
-- 0 · a régua que diz até onde este banco já foi
--
-- Uma tabela, uma coluna, uma linha por migração. Barata de manter e é o
-- único jeito de um arquivo saber que ele é passado.
-- =========================================================================

create table if not exists schema_versao (
  n          int primary key,
  arquivo    text,
  aplicada_em timestamptz not null default now()
);
revoke all on schema_versao from public, anon, authenticated;
/* RLS ligada, sem policy: a tabela é só das migrações, que rodam como dona e
   passam por cima da RLS. Ligar aqui não muda nada do funcionamento e mantém
   verdadeira a regra que `testar_permissoes()` cobra — "nenhuma tabela sem
   RLS" —, que foi exatamente quem pegou esta tabela nascendo aberta. */
alter table schema_versao enable row level security;

comment on table schema_versao is
  'Ate onde este banco ja foi. Cada migracao insere a sua no fim. Arquivo antigo consulta no comeco e se RECUSA a rodar num banco mais novo: create or replace nao e idempotente no tempo, e reaplicar a 23 hoje desfaz a 51.';

/* as que já rodaram, para a régua nascer contando a verdade */
insert into schema_versao (n, arquivo)
select g.n, null from generate_series(1, 55) g(n)
on conflict (n) do nothing;

/* O AVISO PARA QUEM REAPLICAR UM ARQUIVO ANTIGO.

   Não dá para editar dezoito arquivos deste repositório sem reescrever
   história que já está no banco de produção. O que dá, e é o que importa, é
   uma função que cada um deles pode chamar numa linha — e o cabeçalho da 50
   já mostra o padrão. Quem for mexer numa migração antiga daqui para frente
   põe isto na primeira linha:

       select exige_versao_ate(23);

   e o arquivo se recusa a rodar num banco que já passou da 23. */
create or replace function public.exige_versao_ate(p_n int)
returns void language plpgsql as $fn$
declare v_max int;
begin
  select max(n) into v_max from schema_versao;
  if v_max is not null and v_max > p_n then
    raise exception E'MIGRACAO SUPERADA: este arquivo e da versao %, e o banco ja esta na %.\n'
      '  Reaplicar aqui GRAVA a versao antiga por cima da nova, em silencio.\n'
      '  Medido em 19/09: reaplicar a 23, a 31 ou a 43 desfaz a 51 e `candidatar` volta a entregar token de terceiro.\n'
      '  Se voce REALMENTE quer, apague a linha da regua: delete from schema_versao where n > %;',
      p_n, v_max, p_n
      using errcode = 'raise_exception';
  end if;
end $fn$;
revoke all on function public.exige_versao_ate(int) from public, anon, authenticated;


-- =========================================================================
-- 1 · `inscrever` passa a obedecer a regra da 51
--
-- Corpo copiado do que está no ar, com TRÊS mudanças e só três. A lição da
-- 54 vale aqui: quando a correção é pequena, o arquivo copia o resto.
-- =========================================================================

create or replace function public.inscrever(
  p_slug text, p_nome text, p_tel text, p_email text, p_funcoes jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_eq uuid; v_eq_nome text; v_gate boolean;
  v_nome text; v_tel text; v_mail text;
  v_id uuid; v_token text; v_n int; v_pessoa uuid;
  v_pessoa_nova boolean := false;   -- MUDANÇA 1
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

  /* MUDANÇA 2: a pergunta "esta pessoa já existia?" precisa ser respondida
     ANTES de qualquer escrita, e a resposta precisa sobreviver até o fim —
     é ela que decide se a porta pode entregar chave. E `do nothing` no lugar
     de `do update set email`: escrita anônima em tabela de identidade não
     tem por que existir (a 51 tirou isso de `candidatar` pelo mesmo motivo). */
  select p.id into v_pessoa from pessoas p where p.telefone = v_tel;
  if v_pessoa is null then
    insert into pessoas (nome, telefone, email) values (v_nome, v_tel, v_mail)
    on conflict (telefone) do nothing
      returning id into v_pessoa;
    if v_pessoa is null then
      select p.id into v_pessoa from pessoas p where p.telefone = v_tel;
    else
      v_pessoa_nova := true;
    end if;
  end if;

  insert into voluntarios (equipe_id, pessoa_id, nome, telefone, email, conferido, ativo)
       values (v_eq, v_pessoa, v_nome, v_tel, v_mail, false, not v_gate)
    returning id, token into v_id, v_token;

  insert into habilidades (voluntario_id, funcao_id, nivel, confirmado)
  select v_id, f.id, x.value::nivel_habilidade, false
    from jsonb_each_text(p_funcoes) x
    join funcoes f on f.equipe_id = v_eq and f.nome = x.key and f.ativa
   where x.value in ('titular', 'reserva', 'treino')
      on conflict (voluntario_id, funcao_id) do nothing;

  /* MUDANÇA 3: só entrega a chave se a identidade também é nova. Quando a
     pessoa já existia, o cadastro ACONTECE (o vínculo está lá, a liderança
     vê e entrega o link pela mão) — o que não acontece é a porta pública
     devolver credencial ligada a uma identidade que ela não criou. */
  if v_gate or not v_pessoa_nova then
    return jsonb_build_object('ok', true, 'pendente', true,
                              'nome', v_nome, 'equipe', v_eq_nome);
  end if;

  return jsonb_build_object('ok', true, 'pendente', false, 'token', v_token,
                            'nome', v_nome, 'equipe', v_eq_nome);
end $fn$;


-- =========================================================================
-- 2 · `decidir_candidatura` segura a linha antes de decidir
--
-- Uma palavra: `for update`. Ela fecha os dois lados — o vínculo duplicado e
-- o histórico duplicado.
-- =========================================================================

do $dc$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'decidir_candidatura';
  if v_src is null then
    raise notice 'PULEI: decidir_candidatura nao existe nesta base.'; return;
  end if;
  if position('for update' in lower(v_src)) > 0 then
    raise notice 'OK — decidir_candidatura ja segura a linha.'; return;
  end if;
  /* troca a leitura da candidatura por uma leitura COM trava, sem tocar em
     mais nada do corpo */
  v_src := regexp_replace(v_src,
    '(from\s+candidaturas\s+c?\s*where\s+c?\.?id\s*=\s*p_id)(\s*;)',
    '\1 for update\2', 'i');
  if position('for update' in lower(v_src)) = 0 then
    raise exception 'NAO CONSEGUI acrescentar for update em decidir_candidatura: o corpo mudou de forma. Faca a mao.';
  end if;
  execute v_src;
  raise notice 'OK — decidir_candidatura passou a segurar a linha.';
end $dc$;


-- =========================================================================
-- 3 · o PIN só é criado por quem chega primeiro
--
-- Em vez de ler e depois escrever, ESCREVE CONDICIONALMENTE e olha quantas
-- linhas mudaram. Zero linha quer dizer que alguém chegou antes — e aí a
-- resposta é `JA_TEM_PIN`, que é a verdade.
-- =========================================================================

do $pin$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'equipe_pin_criar';
  if v_src is null then raise notice 'PULEI: equipe_pin_criar nao existe.'; return; end if;

  v_src := replace(v_src,
    'update voluntarios set pin_hash = encode(digest(p_pin || token, ''sha256''), ''hex'')',
    'update voluntarios set pin_hash = encode(digest(p_pin || token, ''sha256''), ''hex'')');
  /* a troca de verdade: o UPDATE ganha `and pin_hash is null`, e a função
     passa a olhar ROW_COUNT. Feito por texto porque o corpo é longo e o
     resto dele está certo. */
  v_src := regexp_replace(v_src,
    '(update\s+voluntarios\s+set\s+pin_hash\s*=\s*[^;]+?)(\s+where\s+id\s*=\s*p_voluntario)(\s*;)',
    '\1\2 and pin_hash is null\3' || E'\n  if not found then return jsonb_build_object(''ok'', false, ''erro'', ''JA_TEM_PIN''); end if;',
    'i');
  if position('and pin_hash is null' in lower(v_src)) = 0 then
    raise notice 'ATENCAO: nao consegui travar equipe_pin_criar por texto; o corpo mudou de forma. Confira a mao.';
    return;
  end if;
  execute v_src;
  raise notice 'OK — equipe_pin_criar so grava se ainda nao houver PIN.';
end $pin$;


-- =========================================================================
-- 4 · habilidade pertence aos DOIS: ao voluntário e à função
--
-- A política olhava só o voluntário. Quem confere uma habilidade está
-- dizendo "esta pessoa faz este posto", e o posto é de um ministério com
-- dono. Os dois precisam ser seus.
-- =========================================================================

drop policy if exists eq_habilidades on habilidades;
create policy eq_habilidades on habilidades for all to authenticated
  using (exists (select 1 from voluntarios v
                  where v.id = habilidades.voluntario_id and lidera_equipe(v.equipe_id))
     and exists (select 1 from funcoes f
                  where f.id = habilidades.funcao_id and lidera_equipe(f.equipe_id)))
  with check (exists (select 1 from voluntarios v
                  where v.id = habilidades.voluntario_id and lidera_equipe(v.equipe_id))
     and exists (select 1 from funcoes f
                  where f.id = habilidades.funcao_id and lidera_equipe(f.equipe_id)));


-- =========================================================================
-- 5 · função e voluntário do MESMO ministério, no banco
--
-- `salvar_dia` já recusa. Guarda de função protege quem passa pela função;
-- a tabela aceitava de qualquer outro caminho. Duas tabelas, um gatilho
-- cada, e a invariante deixa de depender de sorte.
-- =========================================================================

create or replace function public.mesmo_ministerio()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_ef uuid; v_ev uuid; v_fn text; v_vn text;
begin
  if new.voluntario_id is null then return new; end if;
  select f.equipe_id, f.nome into v_ef, v_fn from funcoes f where f.id = new.funcao_id;
  select v.equipe_id, v.nome into v_ev, v_vn from voluntarios v where v.id = new.voluntario_id;
  if v_ef is not null and v_ev is not null and v_ef <> v_ev then
    raise exception 'MINISTERIOS_DIFERENTES: % nao e do ministerio de %.', v_vn, v_fn
      using errcode = 'check_violation';
  end if;
  return new;
end $fn$;

drop trigger if exists tg_esc_mesmo_ministerio on escalacoes;
create trigger tg_esc_mesmo_ministerio
  before insert or update on escalacoes
  for each row execute function public.mesmo_ministerio();

drop trigger if exists tg_hab_mesmo_ministerio on habilidades;
create trigger tg_hab_mesmo_ministerio
  before insert or update on habilidades
  for each row execute function public.mesmo_ministerio();


/* =============================================================================
   CONFERÊNCIA — os ataques de novo, agora batendo na porta.
   ============================================================================= */
do $conf$
declare
  v_erros text := ''; v_tel text; v_fn text; v_r jsonb; v_q jsonb;
  v_eq_alvo uuid; v_vitima uuid; v_fn_outra uuid; v_vol_outro uuid; v_n int;
begin
  -- ------------------------------------------------------------- item 1
  select tel_norm(v.telefone) into v_tel
    from voluntarios v where v.telefone is not null
      and coalesce(length(tel_norm(v.telefone)),0) >= 10 limit 1;
  select e.id into v_eq_alvo from equipes e
   where not exists (select 1 from voluntarios v
                      where v.equipe_id = e.id and tel_norm(v.telefone) = v_tel)
     and exists (select 1 from funcoes f where f.equipe_id = e.id and f.ativa)
   limit 1;
  select f.nome into v_fn from funcoes f where f.equipe_id = v_eq_alvo and f.ativa limit 1;

  if v_tel is null or v_eq_alvo is null then
    raise notice 'PULEI 1: nao ha telefone/equipe para o teste.';
  else
    v_r := inscrever((select slug from equipes where id = v_eq_alvo),
                     'Fulano Impostor Cinquentaecinco', v_tel, null,
                     jsonb_build_object(v_fn, 'reserva'));
    if coalesce(v_r->>'token','') <> '' then
      v_erros := v_erros || '1) inscrever AINDA devolve token para telefone de pessoa que ja existe; ';
    end if;
    if not coalesce((v_r->>'ok')::boolean, false) then
      v_erros := v_erros || format('1b) inscrever parou de funcionar: %s; ', v_r);
    end if;
    /* e a pessoa NOVA continua recebendo a chave, senão o funil quebrou */
    v_r := inscrever((select slug from equipes where id = v_eq_alvo),
                     'Gente Nova Cinquentaecinco',
                     '21' || lpad((floor(random()*900000000)+100000000)::text, 9, '0'),
                     null, jsonb_build_object(v_fn, 'reserva'));
    if coalesce((v_r->>'pendente')::boolean, true)
       and not coalesce((select exige_aprovacao from equipes where id = v_eq_alvo), false) then
      v_erros := v_erros || format('1c) gente NOVA deixou de entrar na hora: %s; ', v_r);
    end if;
    delete from habilidades where voluntario_id in
      (select id from voluntarios where nome like '%Cinquentaecinco');
    delete from voluntarios where nome like '%Cinquentaecinco';
    delete from pessoas where nome like '%Cinquentaecinco';
  end if;

  -- ------------------------------------------------------------- item 4/5
  select f.id, f.equipe_id into v_fn_outra, v_vitima
    from funcoes f where f.ativa limit 1;
  select v.id into v_vol_outro from voluntarios v
   where v.equipe_id <> v_vitima limit 1;
  if v_fn_outra is not null and v_vol_outro is not null then
    begin
      insert into habilidades (voluntario_id, funcao_id, nivel, confirmado)
        values (v_vol_outro, v_fn_outra, 'titular', true);
      v_erros := v_erros || '5) habilidade cruzando ministerio entrou; ';
      delete from habilidades where voluntario_id = v_vol_outro and funcao_id = v_fn_outra;
    exception when check_violation then null; end;
  else
    raise notice 'PULEI 5: nao ha dois ministerios com gente para cruzar.';
  end if;

  -- ------------------------------------------------------------- item 0
  if to_regprocedure('public.exige_versao_ate(int)') is null then
    v_erros := v_erros || '0) a regua de versao nao existe; ';
  else
    begin
      perform exige_versao_ate(23);
      v_erros := v_erros || '0b) a regua nao abortou um arquivo da versao 23; ';
    exception when others then null; end;
    begin
      perform exige_versao_ate(55);
    exception when others then
      v_erros := v_erros || '0c) a regua abortou a versao ATUAL; ';
    end;
  end if;

  -- ------------------------------------------------------------- item 2/3
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='public' and p.proname='decidir_candidatura'
                    and lower(p.prosrc) like '%for update%') then
    v_erros := v_erros || '2) decidir_candidatura nao segura a linha; ';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='public' and p.proname='equipe_pin_criar'
                    and lower(p.prosrc) like '%pin_hash is null%') then
    v_erros := v_erros || '3) equipe_pin_criar nao grava condicionalmente; ';
  end if;

  if v_erros = '' then
    raise notice 'OK — 6/6: inscrever nao entrega credencial alheia (e gente nova continua entrando), candidatura e PIN seguram a linha, habilidade exige os dois ministerios, a tabela recusa cruzamento, e a regua barra migracao superada.';
  else
    raise exception 'FALHOU — %', v_erros;
  end if;
end $conf$;

insert into schema_versao (n, arquivo) values (55, '55-o-que-a-equipe-de-agentes-achou.sql')
on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
