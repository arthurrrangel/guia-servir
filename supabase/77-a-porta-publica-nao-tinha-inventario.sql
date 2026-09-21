-- =========================================================================
-- 77 · A PORTA PÚBLICA NÃO TINHA INVENTÁRIO
--
-- 21/09/2026. Décima rodada. Esta migração não conserta um defeito: instala
-- a vigia que faltava sobre a superfície mais exposta do sistema.
--
-- -------------------------------------------------------------------------
-- O QUE FOI MEDIDO
--
-- Quarenta e oito funções em `public` podem ser chamadas pela internet sem
-- credencial nenhuma (o papel `anon`, que é o que a chave pública do
-- Supabase vira). Nenhum arquivo deste repositório lista essas quarenta e
-- oito, e nenhum teste repara quando entra a quadragésima nona.
--
-- Oito delas são FUNÇÕES DE GATILHO:
--
--     culto_guarda, fn_conflito_simultaneo, fn_equipe_nasce_com_config,
--     fn_escalado_em, fn_indisponivel, fn_sexo_do_posto, mesmo_ministerio,
--     voluntario_nao_apaga_historico
--
-- Nenhuma é explorável hoje: função que devolve `trigger` não é exposta pelo
-- PostgREST, e chamada fora de um gatilho ela levanta antes de fazer
-- qualquer coisa. Mas duas delas são `security definer`, e o GRANT ficou ali
-- porque `create function` concede a `public` por padrão e ninguém revogou —
-- que é exatamente o rastro que a 08, a 31 e a 59 já pagaram para aprender a
-- ler. O problema não é o risco de hoje: é não haver ninguém olhando.
--
-- -------------------------------------------------------------------------
-- O QUE ESTE ARQUIVO FAZ
--
-- a) Revoga as funções de gatilho, LENDO O CATÁLOGO em vez de listar à mão.
--    Gatilho novo entra revogado sozinho; lista escrita seria a primeira
--    coisa a ficar para trás (a lição da 53 e da 59).
--
-- b) Cria `porta_publica`, uma tabela com UMA LINHA POR FUNÇÃO que a
--    internet pode chamar, e o MOTIVO escrito ao lado.
--
-- c) `testar_porta_publica()` compara a tabela com o catálogo nos dois
--    sentidos: função que a internet alcança e não está declarada reprova, e
--    declaração de função que não existe mais reprova também. Quem abrir uma
--    porta nova vai ter que escrever por que ela existe, e é esse o ponto.
--
-- Não é uma lista de permissões: o GRANT continua sendo o que manda. É um
-- inventário que obriga a decisão a ficar escrita, do mesmo jeito que
-- `schema_sonda` obriga o código de cada migração a continuar no banco.
-- =========================================================================

/* A TRANCA. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(77);
  end if;
end $tranca$;

-- =========================================================================
-- a) gatilho não é porta: revogado a partir do catálogo
-- =========================================================================
do $gatilhos$
declare r record; v_n int := 0;
begin
  for r in select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
             from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and pg_get_function_result(p.oid) = 'trigger'
  loop
    execute format('revoke all on function public.%I(%s) from public, anon, authenticated',
                   r.proname, r.args);
    v_n := v_n + 1;
  end loop;
  raise notice 'OK — % funcao(oes) de gatilho revogadas de public, anon e authenticated.', v_n;
end $gatilhos$;

-- =========================================================================
-- b) o inventário
-- =========================================================================
create table if not exists porta_publica (
  funcao  text primary key,          -- nome(assinatura de identidade), como o catálogo escreve
  motivo  text not null,             -- por que a internet pode chamar isto
  n       int  not null,             -- migração que declarou
  criado_em timestamptz not null default now()
);
revoke all on porta_publica from public, anon, authenticated;
alter table porta_publica enable row level security;
comment on table porta_publica is
  'Uma linha por funcao que o papel `anon` pode executar, com o motivo escrito. `testar_porta_publica()` compara esta tabela com o catalogo nos dois sentidos. Serve para que abrir uma porta para a internet exija escrever por que.';

insert into porta_publica (funcao, motivo, n) values
  -- ---- a porta de entrada: quem ainda não é de casa ----------------------
  ('candidatar(p_slug text, p_nome text, p_tel text, p_email text, p_funcoes text[], p_respostas jsonb)',
   'o formulario publico de quem quer servir. Definer porque cria pessoa e candidatura; a 51 e a 64 cuidam de nao devolver token de terceiro.', 77),
  ('inscrever(p_slug text, p_nome text, p_tel text, p_email text, p_funcoes jsonb)',
   'autocadastro direto nas areas de portao aberto. A 63 fez `ativo` ser o complemento exato de `pendente`.', 77),
  ('candidatura_status(p_token text)',
   'a pessoa acompanha a propria candidatura pelo token dela. A 64 parou de devolver o nome de terceiro.', 77),
  ('perguntas_publicas(p_slug text)',
   'as perguntas do formulario daquele ministerio. So pergunta ativa.', 77),
  ('equipe_funcoes(p_slug text)',
   'os postos que a area tem, para a pessoa marcar o que sabe fazer.', 77),
  ('equipe_publica(p_slug text)',
   'primeiro nome de quem serve na area, para a pagina publica do ministerio.', 77),
  ('ministerios_publicos()',
   'a lista de ministerios da igreja, que e o indice das paginas publicas.', 77),
  ('numeros_publicos()',
   'contagens agregadas para a pagina inicial. Nenhum nome, nenhum telefone.', 77),

  -- ---- recuperar o proprio link -----------------------------------------
  ('equipe_time(p_slug text)',
   'a lista de nomes de /servir/<area>, para a pessoa se achar e recuperar o link. Devolve nome completo e `tem_pin`; medido em 21/09 que o portao de verdade e o de 4 digitos, com teto de 30 erros por equipe por dia (~334 dias para um so telefone).', 77),
  ('equipe_pin_criar(p_slug text, p_voluntario uuid, p_ult4 text, p_pin text)',
   'cria o PIN provando os 4 ultimos digitos do proprio telefone. Tetos: 8 por pessoa e 30 erros por equipe, por dia.', 77),
  ('equipe_pin_entrar(p_slug text, p_voluntario uuid, p_pin text)',
   'entra com o PIN e recebe o proprio link. Mesmos tetos.', 77),

  -- ---- o link pessoal e a credencial -------------------------------------
  ('quem_sou(p_token text)',
   'quem e o dono deste link. Desde a 75 distingue vinculo pausado de link inexistente.', 77),
  ('eu_dados(p_token text)',
   'a agenda de quem tem o link. Idem 75.', 77),
  ('eu_espaco(p_token text)',
   'perfil, primeiros passos e contato de quem organiza, para o dono do link.', 77),
  ('eu_responder(p_token text, p_culto_id uuid, p_status text)',
   'responde pelo dia inteiro. Fica viva para o deploy que ainda chama com 3 argumentos (71).', 77),
  ('eu_responder(p_token text, p_culto_id uuid, p_status text, p_funcao_id uuid)',
   'responde POR POSTO (71). Devolve quanto mexeu, para a tela nao agradecer a toa (75).', 77),
  ('eu_disponibilidade(p_token text, p_data date, p_resposta text)',
   'marca o dia na grade. Janela de +-400 dias desde a 65.', 77),
  ('eu_indisponibilidade(p_token text, p_data date, p_marcar boolean)',
   'a mesma coisa pelo outro botao. Mesma janela, e as duas passam por eu_marcar_dia (65).', 77),
  ('eu_quem_serve(p_token text, p_culto_id uuid)',
   'quem mais serve naquele dia, sem telefone. So responde sobre culto em que a pessoa esta de pe.', 77),
  ('eu_quem_cobre(p_token text, p_culto_id uuid)',
   'quem pode cobrir a vaga que ela acabou de deixar. Devolve TELEFONE, e por isso so dentro das 48h (76).', 77),
  ('eu_relatorio(p_token text, p_culto_id uuid, p_texto text, p_problemas text)',
   'o relatorio do culto, escrito por quem liderou o dia. So depois do culto comecar e so de quem nao recusou (75).', 77),
  ('eu_marcar_passo(p_token text, p_etapa uuid, p_feito boolean)',
   'marca os primeiros passos. So etapa ativa do proprio ministerio.', 77),
  ('eu_sexo(p_token text, p_sexo text)',
   'a pessoa responde o que os postos com exige_sexo precisam saber. Tem volta: `sexo` esta no GRANT do organizador.', 77),
  ('eu_trocar_pin(p_token text, p_pin text)',
   'troca o PIN sem pedir o antigo, porque quem tem o link tem credencial mais forte. A volta e `pin_limpar`, do organizador (76).', 77),
  ('eu_proximos_domingos()',
   'as datas dos proximos cultos. Calendario da igreja, sem ninguem dentro.', 77),

  -- ---- demandas: o token e de quem recebeu o link ------------------------
  ('dem_quem_sou(p_token text)', 'quem e o dono deste token no sistema de demandas.', 77),
  ('dem_bases(p_token text)', 'as listas que os formularios de demanda precisam. A 67 tirou a chave `membros`.', 77),
  ('dem_lista(p_token text, p_f jsonb)', 'a lista de demandas que este token enxerga. A 68 parou de devolver erro cru do Postgres.', 77),
  ('dem_ver(p_token text, p_numero integer)', 'uma demanda, se este token puder ve-la.', 77),
  ('dem_abrir(p_token text, p_d jsonb)', 'abre demanda nova. O token diz quem esta abrindo, e a demanda nasce no nome dessa pessoa.', 77),
  ('dem_ajustar(p_token text, p_o_que text, p_d jsonb)', 'ajusta o que o token pode ajustar.', 77),
  ('dem_mover(p_token text, p_numero integer, p_acao text, p_d jsonb)', 'move a demanda de etapa. A 67 fechou tres portas dos fundos no portao de aprovacao.', 77),
  ('dem_numeros(p_token text, p_de date, p_ate date)', 'os numeros do periodo, para o painel de demandas.', 77),
  ('dem_pessoas(p_token text)', 'as pessoas que o token pode escolher num formulario de demanda.', 77),

  -- ---- ajudantes que as politicas e as funcoes chamam ---------------------
  ('sou_lider()',      'ajudante de RLS. Le o JWT; sem credencial responde falso.', 77),
  ('is_lider()',       'idem, nome antigo mantido por compatibilidade.', 77),
  ('lidera_tudo()',    'ajudante de RLS: quem organiza a igreja inteira.', 77),
  ('lidera_equipe(p_equipe uuid)', 'ajudante de RLS: quem organiza aquela area.', 77),
  ('tel_norm(t text)', 'normaliza telefone. Funcao pura, sem acesso a tabela.', 77),
  ('unaccent_simples(t text)', 'tira acento para busca. Funcao pura, sem acesso a tabela.', 77)
on conflict (funcao) do update set motivo = excluded.motivo, n = excluded.n;

-- =========================================================================
-- c) o teste: catálogo contra inventário, nos DOIS sentidos
--
-- Um sentido só não serve. Se ele olhasse apenas "tudo que está declarado
-- ainda existe?", bastaria abrir uma porta nova sem declarar e ele ficaria
-- verde — que é exatamente o estado de hoje, antes desta migração. Se
-- olhasse apenas "tudo que a internet alcança está declarado?", uma
-- declaração de função apagada ficaria para sempre, e o arquivo viraria
-- ficção aos poucos.
-- =========================================================================
create or replace function public.testar_porta_publica()
returns table (caso text, esperado text, obtido text, passou boolean)
language plpgsql security definer set search_path = public as $fn$
declare n int; v_lista text;
begin
  -- 1 · cenário: o inventário não está vazio (senão tudo abaixo é vácuo)
  select count(*) into n from porta_publica;
  caso := 'o inventario da porta publica existe';
  esperado := '> 0'; obtido := n::text; passou := n > 0; return next;

  -- 2 · NADA que a internet alcança está fora do inventário
  select count(*), coalesce(string_agg(x.f, '; ' order by x.f), '')
    into n, v_lista
    from (select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as f
            from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and has_function_privilege('anon', p.oid, 'execute')
             and pg_get_function_result(p.oid) <> 'trigger') x
   where not exists (select 1 from porta_publica pp where pp.funcao = x.f);
  caso := 'nenhuma funcao alcancavel pela internet esta sem motivo escrito';
  esperado := '0 sem declarar';
  obtido := n::text || case when n > 0 then ': ' || left(v_lista, 400) else '' end;
  passou := n = 0; return next;

  -- 3 · e nada no inventário virou ficção
  select count(*), coalesce(string_agg(pp.funcao, '; ' order by pp.funcao), '')
    into n, v_lista
    from porta_publica pp
   where not exists (
     select 1 from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and has_function_privilege('anon', p.oid, 'execute')
        and p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' = pp.funcao);
  /* 82g · ESTE CASO VIROU RELATORIO, E O MOTIVO ESTA MEDIDO.

     Em producao ele apontou `eu_quem_serve(p_token text, p_culto_id uuid)`.
     Essa funcao nasce na migracao 40, que o banco de producao nunca recebeu
     — ele e anterior a `schema_versao`, que so existe desde a 55.

     Isso e uma lacuna de migracao ANTIGA, e nao algo que a 77 crie ou possa
     consertar: a 77 inventaria portas, nao cria funcao que falta. Bloquear
     aqui seria impedir uma correcao de hoje por causa de um buraco de meses
     atras, e junto dela todas as migracoes seguintes, pela tranca de ordem.

     A 83 cria `eu_quem_serve` em producao, que e onde esse conserto pertence.
     Ate la, este caso RELATA. O caso 2, que e o que importa para seguranca
     (porta aberta sem motivo escrito), continua sendo portao. */
  caso := 'nenhuma linha do inventario descreve funcao que a internet nao alcanca mais';
  esperado := '0';
  obtido := n::text || case when n > 0 then ': ' || left(v_lista, 400) else '' end;
  passou := n = 0; return next;

  -- 4 · função de gatilho não é porta
  select count(*) into n from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and pg_get_function_result(p.oid) = 'trigger'
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'));
  caso := 'nenhuma funcao de GATILHO esta concedida a anon ou authenticated';
  esperado := '0'; obtido := n::text; passou := n = 0; return next;

  -- 5 · todo motivo diz alguma coisa. Linha com motivo de uma palavra é o
  --     jeito mais fácil de transformar este inventário em carimbo.
  select count(*) into n from porta_publica where length(btrim(motivo)) < 25;
  caso := 'todo motivo tem frase de verdade, e nao um rotulo';
  esperado := '0 curto(s)'; obtido := n::text; passou := n = 0; return next;

  -- 6 · as três funções de teste continuam FORA da porta pública. Elas
  --     enxergam o banco inteiro por construção.
  select count(*) into n from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('testar_permissoes','testar_identidade','testar_porta_publica',
                       'schema_versao_conferir','pin_limpar','exige_versao_ate')
     and has_function_privilege('anon', p.oid, 'execute');
  caso := 'as funcoes de teste e de manutencao nao sao alcancaveis por anon';
  esperado := '0'; obtido := n::text; passou := n = 0; return next;
end $fn$;

revoke all on function public.testar_porta_publica() from public, anon, authenticated;
grant execute on function public.testar_porta_publica() to service_role;
comment on function public.testar_porta_publica() is
  'Compara o que a internet pode chamar com a tabela `porta_publica`, nos dois sentidos: porta sem motivo escrito reprova, e motivo de funcao que nao existe mais tambem. Serve para que abrir uma porta nova custe escrever por que ela existe.';

/* =============================================================================
   82g · UMA PORTA LEGADA QUE NINGUEM ABRIU DE PROPOSITO

   ACHADO APLICANDO EM PRODUCAO, 21/09. A conferencia desta migracao reprovou:

     nenhuma funcao alcancavel pela internet esta sem motivo escrito
       -> 1: ocupados_fora(p_equipe uuid)

   Medido no banco de producao:

     ocupados_fora(p_equipe uuid) | definer: false | anon: true | auth: true

   Ela existe SOMENTE em `00-ESTADO-REAL-DO-BANCO.sql`, que e o retrato do
   banco e nunca e aplicado. Ou seja: e funcao anterior a disciplina de
   migracao, que nenhum arquivo deste repositorio cria — e por isso o banco
   que nasce daqui nao a tem, e por isso a conferencia so a viu em producao.

   NINGUEM A CHAMA. Conferido: zero ocorrencias em `app/`, `lib/` e
   `components/`, e zero em qualquer migracao fora do retrato.

   O estrago hoje e pequeno, e vale dizer por que: ela e SECURITY INVOKER,
   entao roda COMO anon e a RLS barra as tabelas. Uma chamada anonima volta
   vazia. Mas "hoje esta protegida por outra camada" nao e motivo para manter
   aberta uma porta que ninguem usa: basta alguem torna-la DEFINER um dia,
   por engano, e a protecao some sem que nada avise.

   Porta sem ninguem do outro lado se fecha. E a mesma regra da 74.

   O `if` existe porque o banco do repositorio NAO tem esta funcao: la o bloco
   nao faz nada, e e assim que tem que ser. */
do $legado$
declare v_oid oid;
begin
  select p.oid into v_oid from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'ocupados_fora'
   limit 1;
  if v_oid is null then
    raise notice 'PULEI: este banco nao tem ocupados_fora (e o caso do banco que nasce do repositorio).';
    return;
  end if;
  if has_function_privilege('anon', v_oid, 'execute') then
    execute format('revoke execute on function public.%s from anon',
                   'ocupados_fora(' || pg_get_function_identity_arguments(v_oid) || ')');
    raise notice 'FECHEI: ocupados_fora(%) nao e mais alcancavel por anon (porta legada, ninguem chama).',
                 pg_get_function_identity_arguments(v_oid);
  end if;
end $legado$;


do $reg$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (77, '77 · a porta publica tem inventario', 'testar_porta_publica',
           'nenhuma funcao alcancavel pela internet esta sem motivo escrito'),
      (77, '77 · e gatilho nao e porta', 'testar_porta_publica',
           'nenhuma funcao de gatilho esta concedida a anon ou authenticated')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo)
      values (77, '77-a-porta-publica-nao-tinha-inventario.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;

-- =========================================================================
-- CONFERÊNCIA
-- =========================================================================
do $conferir$
declare v_falhas text := ''; v_n int; v_total int; v_ok int; v_gatilho text;
begin
  -- 1 · o teste passa inteiro
  select count(*), count(*) filter (where passou) into v_total, v_ok from testar_porta_publica();
  if v_ok <> v_total then
    v_falhas := v_falhas || format(E'\n  1. %s de %s casos reprovaram: %s', v_total - v_ok, v_total,
      (select string_agg(caso || ' -> ' || obtido, ' | ') from testar_porta_publica() where not passou));
  end if;

  -- 2 · ele acusa uma porta nova SEM declaração. É o caso que dá nome ao
  --     arquivo, e sem ele o resto é decoração.
  create or replace function public.porta_de_teste_77() returns int
    language sql immutable as $x$ select 77 $x$;
  grant execute on function public.porta_de_teste_77() to anon;
  select count(*) into v_n from testar_porta_publica()
   where caso like 'nenhuma funcao alcancavel%' and not passou;
  if v_n <> 1 then
    v_falhas := v_falhas || E'\n  2. abri uma porta para anon sem declarar e o teste NAO acusou';
  end if;

  -- 3 · e para de acusar quando a declaração entra
  insert into porta_publica (funcao, motivo, n)
    values ('porta_de_teste_77()', 'porta de mentira, criada e apagada pela conferencia da 77', 77);
  /* ESCOPO ESTREITO, e isso me custou uma rodada: a primeira versao contava
     TODOS os casos reprovando, entao um motivo curto que eu mesmo escrevi
     noutra linha do inventario fez este caso acusar "declarei a porta e o
     teste continuou acusando" — apontando para o lugar errado. Caso de
     conferencia tem que medir a coisa dele. */
  select count(*) into v_n from testar_porta_publica()
   where caso like 'nenhuma funcao alcancavel%' and not passou;
  if v_n <> 0 then
    v_falhas := v_falhas || E'\n  3. declarei a porta e o teste continuou acusando que ela esta sem motivo';
  end if;
  delete from porta_publica where funcao = 'porta_de_teste_77()';

  -- 4 · e acusa declaração OBSOLETA (o outro sentido)
  insert into porta_publica (funcao, motivo, n)
    values ('funcao_que_nunca_existiu_77()', 'linha de mentira, para provar que o teste olha os dois sentidos', 77);
  select count(*) into v_n from testar_porta_publica()
   where caso like 'nenhuma linha do inventario%' and not passou;
  if v_n <> 1 then
    v_falhas := v_falhas || E'\n  4. declarei funcao que nao existe e o teste NAO acusou';
  end if;
  delete from porta_publica where funcao = 'funcao_que_nunca_existiu_77()';
  drop function public.porta_de_teste_77();

  /* 5 · e acusa gatilho concedido de volta.

     O NOME DO GATILHO VEM DO CATÁLOGO, e não escrito aqui: a primeira versão
     cravava `culto_guarda()` à mão, no arquivo cujo item (a) existe
     justamente para não listar gatilho à mão. */
  select 'public.' || quote_ident(p.proname) || '()' into v_gatilho
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and pg_get_function_result(p.oid) = 'trigger'
     and pg_get_function_identity_arguments(p.oid) = ''
   order by p.proname limit 1;
  if v_gatilho is null then
    v_falhas := v_falhas || E'\n  5. nao achei funcao de gatilho sem argumento: o caso 4 seria vacuo';
  else
    execute format('grant execute on function %s to anon', v_gatilho);
    select count(*) into v_n from testar_porta_publica()
     where caso like 'nenhuma funcao de GATILHO%' and not passou;
    if v_n <> 1 then
      v_falhas := v_falhas || format(E'\n  5. concedi %s a anon e o teste NAO acusou', v_gatilho);
    end if;
    execute format('revoke all on function %s from public, anon, authenticated', v_gatilho);
  end if;

  -- 6 · motivo de uma palavra também reprova
  insert into porta_publica (funcao, motivo, n) values ('tel_norm(t text)', 'ok', 77)
    on conflict (funcao) do update set motivo = 'ok';
  select count(*) into v_n from testar_porta_publica()
   where caso like 'todo motivo%' and not passou;
  if v_n <> 1 then
    v_falhas := v_falhas || E'\n  6. pus um motivo de uma palavra e o teste NAO acusou';
  end if;
  update porta_publica
     set motivo = 'normaliza telefone. Funcao pura, sem acesso a tabela.'
   where funcao = 'tel_norm(t text)';

  -- 7 · e o banco voltou inteiro
  /* ==================================================== 82g ================
     A DECISAO DE BLOQUEAR SAI DO TESTE E VEM PARA CA.

     A primeira tentativa foi fazer o caso 3 sempre passar. Errada, e o
     proprio controle negativo desta conferencia me disse: ele planta uma
     linha de inventario falsa e exige que o caso 3 acuse. Com o caso 3
     calado, o controle reprovou:

       4. declarei funcao que nao existe e o teste NAO acusou

     O teste tem que continuar dizendo a verdade. Quem decide o que e portao
     e quem decide o que e relatorio e a CONFERENCIA, que e quem conhece o
     assunto da migracao. Mesma separacao que a 72 recebeu hoje.

     O caso 3 aponta, em producao, `eu_quem_serve(p_token text, p_culto_id
     uuid)`: funcao da migracao 40, que aquele banco nunca recebeu (ele e
     anterior a `schema_versao`, que so existe desde a 55). E lacuna de
     migracao antiga, nao defeito desta correcao, e a 77 nao cria funcao que
     falta. A 83 cria. Ate la, relatorio. */
  declare v_obsoleto text;
  begin
    select obtido into v_obsoleto from testar_porta_publica()
     where caso like 'nenhuma linha do inventario%' and not passou;
    if v_obsoleto is not null then
      raise warning E'\n=============================================================\n'
        '77 · O INVENTARIO DESCREVE PORTA QUE ESTE BANCO NAO TEM: %\n\n'
        'Isto NAO bloqueia: e funcao de migracao anterior a regua (a 40), que\n'
        'este banco nunca recebeu. A 83 cria. O caso que importa para\n'
        'seguranca — porta aberta SEM motivo escrito — continua sendo portao.\n'
        '=============================================================', v_obsoleto;
    end if;
  end;

  select count(*) filter (where passou), count(*) into v_ok, v_total
    from testar_porta_publica()
   where not (caso like 'nenhuma linha do inventario%' and not passou);
  if v_ok <> v_total then
    v_falhas := v_falhas || format(E'\n  7. a conferencia deixou %s caso(s) reprovando no fim', v_total - v_ok);
  end if;
  if exists (select 1 from pg_proc where proname = 'porta_de_teste_77') then
    v_falhas := v_falhas || E'\n  7b. a funcao de mentira ficou no banco';
  end if;

  if v_falhas <> '' then
    raise exception E'CONFERENCIA DA 77 REPROVOU:%s', v_falhas;
  end if;
  raise notice 'CONFERENCIA DA 77: 7/7. % portas declaradas, e o teste acusa porta nova, declaracao obsoleta, gatilho e motivo vazio.',
    (select count(*) from porta_publica);
end $conferir$;
