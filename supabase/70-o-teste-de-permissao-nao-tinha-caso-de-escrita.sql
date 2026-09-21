/* =============================================================================
   70 · O TESTE DE PERMISSÃO NÃO TINHA UM ÚNICO CASO DE ESCRITA

   21/09/2026. Só de Escalas. Depende da 69.

   -------------------------------------------------------------------------
   O QUE FOI MEDIDO

   `testar_permissoes()` passa 37/37 e é a coisa em que este repositório mais
   se apoia: toda migração termina mandando rodá-la. Uma auditoria de hoje
   afrouxou UMA política de cada vez, num banco nascido do repositório, e
   rodou o teste depois de cada afrouxamento:

     derrubando a política             31 das 37 NÃO são acusadas
     trocando por `using (true)`       29 das 37 NÃO são acusadas

   O pior caso, passo a passo e com a saída colada:

     drop policy papeis_criar on papeis;
     create policy papeis_criar on papeis for insert to authenticated
       with check (true);
     select ... from testar_permissoes();        ->  37/37

     -- agora, como um organizador escopado a UMA área:
     insert into papeis (pessoa_id, papel, criado_por)
       values ((quem_sou()->'pessoa'->>'id')::uuid, 'admin', 'eu mesmo');

      sou_admin_geral | equipes | pessoas | voluntarios
     -----------------+---------+---------+-------------
      t               |       5 |      15 |          12

     select ... from testar_permissoes();        ->  37/37

   `papeis_criar` é a única coisa entre "líder de uma área" e "dono da igreja
   inteira". O teste não a viu nem aberta, nem depois de arrombada.

   -------------------------------------------------------------------------
   AS DUAS CAUSAS

   1. TODO CASO "NÃO VÊ X" É VÁCUO, PORQUE X NÃO EXISTE.

      No banco nascido do repositório:

        voluntários fora do Louvor    0
        escalações (total)            0
        candidaturas (total)          0
        candidatura_respostas         0
        historico_candidatura         0

      "O organizador do Louvor não vê o time da Mídia" passa porque a Mídia
      não tem ninguém. Trocar `eq_voluntarios` por `using (true)` não muda o
      resultado: continua zero.

      O autor previu exatamente isso e escreveu a guarda — "o Louvor não está
      vazio (senão os casos do Louvor são vácuo)" — MAS SÓ PARA O LADO QUE
      PRECISA VER. Não existia a simétrica, e é dela que dependem todos os
      "NÃO vê".

   2. NÃO HAVIA UM ÚNICO CASO DE ESCRITA.

      Os 37 são `select count(*)`, chamada de função, ou leitura de
      `pg_policy`. Nenhum tenta `insert`, `update` ou `delete` como papel
      nenhum. Política de escrita que vira `true` não tem como ser notada — e
      foi assim que o buraco de `cultos_editar` (migração 69) sobreviveu a
      37/37 por três dias.

   -------------------------------------------------------------------------
   O QUE ESTE ARQUIVO FAZ

   a) O TESTE PASSA A CRIAR O CENÁRIO DE QUE ELE PRECISA. Uma área de teste,
      com voluntário, candidatura, histórico, escalação e um evento — tudo
      FORA do Louvor, apagado por id no fim da mesma chamada. Três casos novos
      cobram que o cenário exista ANTES de qualquer "não vê": cenário vazio
      reprova em voz alta, em vez de passar em silêncio.

   b) OITO CASOS DE ESCRITA, um por política que decide alguma coisa:

        C1  organizador de área NÃO se promove a admin      (papeis_criar)
        C2  ... nem muda o e-mail de acesso de ninguém      (pessoas_editar)
        C3  ... nem apaga a anotação do evento de outro     (cultos_editar,
            pelo ataque de constante sem `where` da 69)
        C4  ... nem cadastra voluntário na área de outro    (eq_voluntarios)
        C5  ... nem cria posto na área de outro             (eq_funcoes)
        C6  ... nem pausa voluntário de outra área          (eq_voluntarios)
        C7  quem não lidera nada não escreve em lugar nenhum
        C8  `anon` não escreve em `pessoas`

   c) O CASO COM ASSERÇÃO LITERAL `true` some. Ele media quantas políticas
      `FOR ALL` existem e devolvia `passou = true` fixo: um contador vestido
      de asserção, e um dos "37/37". Vira um teto no número de hoje — não
      manda consertar a dívida, manda não aumentá-la sem passar por aqui.

   -------------------------------------------------------------------------
   O RESULTADO, MEDIDO COM O MESMO EXPERIMENTO

   Rodei de novo a varredura da auditoria — afrouxa cada política para
   `using (true)`, roda o teste, repõe — contra o teste desta migração:

       antes da 70:   8 acusadas, 29 cegas
       depois:       23 acusadas, 14 cegas

   E o número de casos foi de 37 para 64.

   AS 14 QUE CONTINUAM CEGAS, uma a uma, porque lista sem explicação é a
   próxima coisa a virar ruído:

     cultos_ler, cultos_criar, cultos_editar, cultos_evento_mexer (4)
        Abrir a política sozinha não muda resultado nenhum, porque o gatilho
        `culto_guarda` recusa do mesmo jeito. É profundidade funcionando, não
        buraco: a conferência da 69 pina as duas camadas SEPARADAMENTE, que é
        onde esse par tem que ser medido.

     pessoas_editar (1)
        ESTA JUSTIFICATIVA ERA FALSA, e a migração 80 a corrigiu duas vezes:
        no texto e no banco. Estava escrito que "quem protege `auth_email` de
        verdade é o GRANT por coluna, não a política; abrir a política não
        abre a escrita". Não existia GRANT por coluna em `pessoas` — medido
        em 21/09, `authenticated` tinha UPDATE em TODAS as colunas, inclusive
        `auth_email`, que é a credencial com que `lidera_tudo()` decide quem
        é admin. Quem afrouxasse `pessoas_editar` entregaria a conta do admin,
        com este arquivo garantindo que o GRANT pegava. A 80 criou o GRANT
        por coluna de verdade, e o caso C2 continua sendo o que mede a
        política.

     perg_criar, perg_editar, perg_apagar, onbf_tudo, hist_criar,
     cand_editar (6)
        Escrita em tabela de configuração e de histórico. Não têm caso aqui, e
        entram na próxima rodada: são as candidatas óbvias.

     papeis_ler, papeis_apagar (2)
        `papeis_criar` — a que separa líder de área de dono da igreja — É
        acusada, e é ela que importa. Ler e apagar papel ficam para depois.

     cr_ler (1)
        `candidatura_respostas` sem linha no cenário: falta uma pergunta
        respondida. Uma linha de fixture resolve, e não entrou nesta.

   -------------------------------------------------------------------------
   O QUE ESTE ARQUIVO NÃO FAZ

   Não cobre as 37 políticas, e o parágrafo acima diz exatamente quais faltam
   e por quê. A medida que importa não é "quantos casos existem" e sim
   "quantas políticas podem virar `using (true)` sem o teste acusar". Essa
   medida não cabe dentro do próprio teste — afrouxar política de verdade num
   banco de produção não é coisa que uma função de conferência deva fazer —,
   então ela vira o roteiro da próxima auditoria, com o número de hoje (23/37)
   para comparar.

   O corpo abaixo saiu do banco por extração. Muda o caso do `true` literal e
   acrescenta uma seção no fim; nenhum dos 37 casos antigos foi tocado.
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(70);
  end if;
end $tranca$;

CREATE OR REPLACE FUNCTION public.testar_permissoes()
 RETURNS TABLE(grupo text, caso text, esperado text, obtido text, passou boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_louvor uuid; v_midia uuid; v_servico uuid;
  n bigint; m bigint; mm bigint; ok boolean; erro text; txt text;
  /* 70 · o cenário que os casos de isolamento precisam para não serem vácuo */
  v_suf text; v_eq_t uuid; v_fn_t uuid; v_p_t uuid; v_vol_t uuid;
  v_cand_t uuid; v_culto_t uuid; v_ev_t uuid; v_dia_t date; v_tel_t text; v_alvo uuid; v_perg_t uuid; v_onb_t uuid;
  jwt_jander constant text := '{"email":"jander.jpcris@gmail.com","role":"authenticated"}';
  jwt_arthur constant text := '{"email":"arthurrangel427@gmail.com","role":"authenticated"}';
  jwt_zé     constant text := '{"email":"ninguem@exemplo.invalido","role":"authenticated"}';
begin
  select id into v_louvor  from equipes where slug = 'louvor';
  select id into v_midia   from equipes where slug = 'midia';
  select id into v_servico from equipes where slug = 'servico';

  -- =====================================================================
  -- ORGANIZADOR PRESO A UM MINISTÉRIO (Jander → Louvor)
  -- =====================================================================
  /* O ESPERADO É CONTADO, NÃO ESCRITO (60).
     Estava `n = 12` à mão. Doze era o tamanho do Louvor no dia em que a 34
     foi escrita; hoje é outro, e o caso reprova sem nada de errado ter
     acontecido — o que é pior que não testar, porque ensina a ignorar
     vermelho na saída. O que ele quer provar não é "doze": é que a RLS não
     esconde nem inventa ninguém.

     A verdade é lida COMO O ADMIN GERAL, e não fora de papel nenhum: esta
     função é `security invoker`, então ler a tabela sem `set role` é ler com
     o privilégio de quem chamou, que pode não ter nenhum. Ler como admin não
     é circular: as duas guardas abaixo cobram que a leitura do admin não
     esteja ela própria vazia nem escopada. Se estivesse, `m` seria zero ou
     igual ao total, e elas pegam. */
  set local role authenticated; perform set_config('request.jwt.claims', jwt_arthur, true);
  select count(*) into m  from voluntarios v where v.equipe_id = v_louvor;
  select count(*) into mm from voluntarios;
  reset role;
  return query select 'admin geral'::text, 'o Louvor não está vazio (senão os casos do Louvor são vácuo)'::text,
    '> 0'::text, m::text, m > 0;
  /* a segunda guarda NÃO pode ser `mm > m`: num banco recém-nascido do
     repositório só o Louvor tem gente, e `mm = m` é a verdade, não um
     defeito. O que prova que a leitura do admin não está escopada é ele
     enxergar mais de um ministério. */
  return query select 'admin geral'::text, 'não vê menos gente que o time do Louvor'::text,
    '>= ' || m::text, mm::text, mm >= m;
  set local role authenticated; perform set_config('request.jwt.claims', jwt_arthur, true);
  select count(*) into n from equipes;
  reset role;
  return query select 'admin geral'::text, 'enxerga mais de um ministério (senão a verdade está escopada)'::text,
    '> 1'::text, n::text, n > 1;

  set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
  select count(*) into n from voluntarios v where v.equipe_id = v_louvor;
  reset role;
  return query select 'organizador escopado'::text, 'vê o próprio time INTEIRO'::text,
    m::text, n::text, n = m;

  set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
  select count(*) into n from voluntarios v where v.equipe_id = v_midia;
  reset role;
  return query select 'organizador escopado'::text, 'NÃO vê o time da Mídia'::text,
    '0'::text, n::text, n = 0;

  set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
  select count(*) into n from equipes;
  reset role;
  return query select 'organizador escopado'::text, 'enxerga 1 ministério só'::text,
    '1'::text, n::text, n = 1;

  set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
  select count(*) into n from escalacoes x
    join funcoes f on f.id = x.funcao_id where f.equipe_id <> v_louvor;
  reset role;
  return query select 'organizador escopado'::text, 'NÃO vê escalação alheia'::text,
    '0'::text, n::text, n = 0;

  -- =====================================================================
  -- NOVO: CANDIDATURAS SÃO DO MINISTÉRIO, NÃO DO SISTEMA
  -- =====================================================================
  set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
  select count(*) into n from candidaturas c where c.equipe_id <> v_louvor;
  reset role;
  return query select 'candidatura'::text, 'organizador NÃO vê candidatura de outro ministério'::text,
    '0'::text, n::text, n = 0;

  set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
  select count(*) into n from candidatura_respostas r
    join candidaturas c on c.id = r.candidatura_id where c.equipe_id <> v_louvor;
  reset role;
  return query select 'candidatura'::text, 'NÃO vê resposta de candidato alheio'::text,
    '0'::text, n::text, n = 0;

  set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
  select count(*) into n from historico_candidatura h
    join candidaturas c on c.id = h.candidatura_id where c.equipe_id <> v_louvor;
  reset role;
  return query select 'candidatura'::text, 'NÃO vê histórico de candidato alheio'::text,
    '0'::text, n::text, n = 0;

  /* pessoas é a tabela mais sensível do 2.0: nome e telefone de todo mundo que
     já passou pelo sistema. Só quem tem vínculo ou candidatura no ministério
     que a pessoa organiza pode aparecer. */
  set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
  select count(*) into n from pessoas p
   where not exists (select 1 from voluntarios v where v.pessoa_id = p.id and v.equipe_id = v_louvor)
     and not exists (select 1 from candidaturas c where c.pessoa_id = p.id and c.equipe_id = v_louvor);
  reset role;
  return query select 'candidatura'::text, 'NÃO vê pessoa sem laço com o ministério dele'::text,
    '0'::text, n::text, n = 0;

  -- =====================================================================
  -- FURO 1 DA AUDITORIA DE 26/08 — pin_hash fora do alcance
  -- =====================================================================
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    select count(*) into n from (select pin_hash from voluntarios limit 1) z;
    reset role; ok := false; erro := 'leu ' || n || ' linha(s)';
  exception when insufficient_privilege then
    reset role; ok := true; erro := 'permission denied';
  end;
  return query select 'segredo'::text, 'pin_hash NEGADO ao organizador'::text,
    'permission denied'::text, erro, ok;

  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    select count(*) into n from (select token from voluntarios limit 1) z;
    reset role; ok := true; erro := 'legível';
  exception when insufficient_privilege then
    reset role; ok := false; erro := 'permission denied';
  end;
  return query select 'segredo'::text, 'token legível (risco aceito)'::text,
    'legível'::text, erro, ok;

  /* a anotação da liderança sobre um candidato NÃO pode sair pela URL pública */
  select coalesce((candidatura_status('naoexisteesse') ->> 'erro'), '?') into txt;
  return query select 'segredo'::text, 'token de candidatura inválido não entrega nada'::text,
    'LINK_INVALIDO'::text, txt, txt = 'LINK_INVALIDO';

  select coalesce((eu_espaco('naoexisteesse') ->> 'erro'), '?') into txt;
  return query select 'segredo'::text, 'token de voluntário inválido não abre Meu Espaço'::text,
    'LINK_INVALIDO'::text, txt, txt = 'LINK_INVALIDO';

  /* Meu Espaço de um token do Louvor não pode devolver dado da Mídia */
  select coalesce((eu_espaco((select v.token from voluntarios v
                               where v.equipe_id = v_louvor and v.ativo limit 1)) ->> 'equipe'), '?')
    into txt;
  return query select 'voluntário'::text, 'Meu Espaço devolve só o ministério do token'::text,
    'Louvor'::text, txt, txt = 'Louvor';

  select (eu_espaco((select v.token from voluntarios v
                      where v.equipe_id = v_louvor and v.ativo limit 1)) ? 'nota_interna')
    into ok;
  return query select 'voluntário'::text, 'Meu Espaço não devolve nota da liderança'::text,
    'false'::text, ok::text, not ok;

  -- =====================================================================
  -- FURO 2 — apagar culto é só do organizador global
  -- =====================================================================
  select count(*) into n from pg_policy pol join pg_class c on c.oid = pol.polrelid
   where c.relname = 'cultos' and pol.polcmd = 'd'
     and pg_get_expr(pol.polqual, pol.polrelid) ilike '%lidera_tudo%';
  return query select 'destrutivo'::text, 'apagar culto exige papel global'::text,
    '1 policy'::text, n || ' policy', n = 1;

  select count(*) into n from pg_policy pol join pg_class c on c.oid = pol.polrelid
   where c.relname = 'candidaturas' and pol.polcmd = 'd'
     and pg_get_expr(pol.polqual, pol.polrelid) ilike '%lidera_tudo%';
  return query select 'destrutivo'::text, 'apagar candidatura exige papel global'::text,
    '1 policy'::text, n || ' policy', n = 1;

  -- =====================================================================
  -- ORGANIZADOR GLOBAL
  -- =====================================================================
  /* a expectativa é lida do banco, não escrita à mão. Estes três casos
     falhavam desde que as migrações 29 e 30 criaram o Kids, o Connect e a
     Livraria: o comportamento estava certo e o número esperado é que tinha
     envelhecido. Teste com falha conhecida permanente deixa de ser sinal. */
  select count(*) into m from equipes;
  set local role authenticated; perform set_config('request.jwt.claims', jwt_arthur, true);
  select count(*) into n from equipes;
  reset role;
  return query select 'organizador global'::text, 'enxerga todos os ministérios'::text,
    m::text, n::text, n = m;

  select count(*) into m from pessoas;
  set local role authenticated; perform set_config('request.jwt.claims', jwt_arthur, true);
  select count(*) into n from pessoas;
  reset role;
  return query select 'organizador global'::text, 'enxerga todas as pessoas'::text,
    m::text, n::text, n = m;

  -- =====================================================================
  -- AUTENTICADO SEM CONVITE — o cadastro do app é aberto
  -- =====================================================================
  set local role authenticated; perform set_config('request.jwt.claims', jwt_zé, true);
  select count(*) into n from voluntarios;
  reset role;
  return query select 'estranho autenticado'::text, 'não vê voluntário nenhum'::text,
    '0'::text, n::text, n = 0;

  set local role authenticated; perform set_config('request.jwt.claims', jwt_zé, true);
  select count(*) into n from pessoas;
  reset role;
  return query select 'estranho autenticado'::text, 'não vê pessoa nenhuma'::text,
    '0'::text, n::text, n = 0;

  set local role authenticated; perform set_config('request.jwt.claims', jwt_zé, true);
  select count(*) into n from candidaturas;
  reset role;
  return query select 'estranho autenticado'::text, 'não vê candidatura nenhuma'::text,
    '0'::text, n::text, n = 0;

  set local role authenticated; perform set_config('request.jwt.claims', jwt_zé, true);
  select count(*) into n from lideres;
  reset role;
  return query select 'estranho autenticado'::text, 'não vê a lista de organizadores'::text,
    '0'::text, n::text, n = 0;

  -- =====================================================================
  -- VISITANTE (anon) — a porta pública
  -- =====================================================================
  begin
    set local role anon; select count(*) into n from voluntarios;
    reset role; ok := false; erro := 'leu ' || n || ' linha(s)';
  exception when insufficient_privilege then reset role; ok := true; erro := 'permission denied'; end;
  return query select 'visitante'::text, 'tabela de voluntários fechada'::text,
    'permission denied'::text, erro, ok;

  begin
    set local role anon; select count(*) into n from pessoas;
    reset role; ok := false; erro := 'leu ' || n || ' linha(s)';
  exception when insufficient_privilege then reset role; ok := true; erro := 'permission denied'; end;
  return query select 'visitante'::text, 'tabela de pessoas fechada'::text,
    'permission denied'::text, erro, ok;

  begin
    set local role anon; select count(*) into n from candidaturas;
    reset role; ok := false; erro := 'leu ' || n || ' linha(s)';
  exception when insufficient_privilege then reset role; ok := true; erro := 'permission denied'; end;
  return query select 'visitante'::text, 'tabela de candidaturas fechada'::text,
    'permission denied'::text, erro, ok;

  begin
    set local role anon; select count(*) into n from candidatura_respostas;
    reset role; ok := false; erro := 'leu ' || n || ' linha(s)';
  exception when insufficient_privilege then reset role; ok := true; erro := 'permission denied'; end;
  return query select 'visitante'::text, 'respostas do questionário fechadas'::text,
    'permission denied'::text, erro, ok;

  /* mas o que a porta pública PRECISA continua abrindo, senão ninguém entra */
  select count(*) into m from equipes;
  set local role anon; select count(*) into n from ministerios_publicos(); reset role;
  return query select 'visitante'::text, 'lista de ministérios abre'::text,
    m::text, n::text, n = m;

  /* O 6 ESCRITO À MÃO ERA O MESMO DEFEITO QUE ESTA MIGRAÇÃO VEIO REMOVER.

     Os dois casos vizinhos (ministérios, nomes do Louvor) foram corrigidos
     aqui mesmo para contar a FONTE em vez de repetir um número de agosto, e
     este escapou: `'6'::text, n::text, n = 6`. Bastava a líder do Louvor
     escrever uma pergunta nova no formulário dela para `testar_permissoes`
     ficar vermelho sem nada ter quebrado — e, pior, para a pessoa que lê o
     relatório aprender a ignorar uma linha vermelha.

     O esperado agora é a mesma consulta que `perguntas_publicas` faz (23:44):
     pergunta ativa, da equipe ou geral. Encontrado na reauditoria da própria
     70, em 21/09. */
  select count(*) into m
    from perguntas q left join equipes e on e.id = q.equipe_id
   where q.ativa and (q.equipe_id is null or e.slug = 'louvor');
  set local role anon; select count(*) into n from perguntas_publicas('louvor'); reset role;
  return query select 'visitante'::text, 'formulário do Louvor abre'::text,
    m::text, n::text, n = m and m > 0;

  /* mesma correção do caso de cima: `equipe_publica` devolve uma linha por
     voluntário ATIVO (14:86, com left join), e o 12 escrito à mão era o
     retrato de agosto. */
  set local role authenticated; perform set_config('request.jwt.claims', jwt_arthur, true);
  select count(*) into m from voluntarios v where v.equipe_id = v_louvor and v.ativo;
  reset role;
  set local role anon; select count(*) into n from equipe_publica('louvor'); reset role;
  return query select 'visitante'::text, 'lista de nomes do Louvor abre INTEIRA'::text,
    m::text, n::text, n = m;

  -- =====================================================================
  -- ESTRUTURA
  -- =====================================================================
  select count(*) into n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  return query select 'estrutura'::text, 'nenhuma tabela sem RLS'::text,
    '0'::text, n::text, n = 0;

  /* nenhuma das tabelas do 2.0 pode ter policy FOR ALL: ler e escrever
     compartilhando o mesmo teste é o que trava papel por módulo. */
  select count(*) into n from pg_policy pol join pg_class c on c.oid = pol.polrelid
   where c.relname in ('pessoas','candidaturas','candidatura_funcoes',
                       'candidatura_respostas','historico_candidatura','perguntas')
     and pol.polcmd = '*';
  return query select 'estrutura'::text, 'nenhuma policy FOR ALL nas tabelas novas'::text,
    '0'::text, n::text, n = 0;

  /* 70 · ESTE CASO TINHA `true` LITERAL NA COLUNA `passou`.

     Ele não podia reprovar, qualquer que fosse `n`: era um contador vestido de
     asserção, e um dos "37/37". A dívida que ele mede é real — política
     `FOR ALL` faz leitura e escrita dividirem o mesmo teste —, mas medir sem
     limite não impede nada.

     O limite é o número de hoje. Ele não manda ninguém consertar a dívida;
     manda NÃO AUMENTAR ela sem passar por aqui, que é o que um caso de teste
     pode honestamente cobrar. Quem converter uma `FOR ALL` em políticas
     separadas baixa este número no mesmo arquivo. */
  select count(*) into n from pg_policy where polcmd = '*';
  return query select 'estrutura'::text, 'policies FOR ALL não aumentaram (dívida travada)'::text,
    '<= 14'::text, n::text, n <= 14;

  -- =====================================================================
  -- O PAINEL NÃO INVENTA VAGA (60)
  -- =====================================================================
  /* `visao_geral().postos` tem que bater com os postos que VALEM naquele
     culto. Este é o caso que teria pego o defeito do Follow: a equipe com
     9 postos ativos dos quais 4 valem no sábado aparecia com 5 vagas num
     culto cheio. */
  set local role authenticated; perform set_config('request.jwt.claims', jwt_arthur, true);
  select count(*) into n from visao_geral() g
   where g.proxima_data is not null
     and g.postos <> (select count(*) from funcoes f
                       join equipes e on e.id = f.equipe_id
                      where e.slug = g.slug and f.ativa
                        and (f.tipos is null or array_length(f.tipos,1) is null
                             or g.tipo = any(f.tipos)));
  reset role;
  return query select 'painel'::text, 'postos do painel = postos que valem NAQUELE culto'::text,
    '0'::text, n::text, n = 0;

  /* e nenhum evento de outra equipe pode ser "o próximo culto" de alguém */
  set local role authenticated; perform set_config('request.jwt.claims', jwt_arthur, true);
  select count(*) into n from visao_geral() g
    join cultos c on c.data = g.proxima_data
    join equipes e on e.slug = g.slug
   where c.evento is not null and c.equipe_id is distinct from e.id;
  reset role;
  return query select 'painel'::text, 'evento de outra equipe não vira o próximo culto'::text,
    '0'::text, n::text, n = 0;

  -- =====================================================================
  -- 70 · O CENÁRIO, E POR QUE ELE PRECISOU EXISTIR
  --
  -- Auditoria de 21/09/2026, medida política por política: derrubando cada
  -- uma, 31 das 37 não eram acusadas; trocando cada uma por `using (true)`,
  -- 29 das 37. A mais grave: `papeis_criar` aberta deixa o organizador de UMA
  -- área se tornar admin da igreja inteira, e o teste dizia 37/37 antes e
  -- depois.
  --
  -- Duas causas, e as duas são consertadas daqui para baixo.
  --
  -- A PRIMEIRA: todo caso "NÃO vê X" era vácuo, porque X não existe. Medido no
  -- banco nascido do repositório: voluntários fora do Louvor = 0, escalações =
  -- 0, candidaturas = 0, respostas = 0, histórico = 0. O autor previu esse
  -- risco e escreveu a guarda — "o Louvor não está vazio (senão os casos do
  -- Louvor são vácuo)" — mas só para o lado que precisa VER. Não existia a
  -- simétrica, e é dela que dependem todos os "NÃO vê".
  --
  -- A SEGUNDA: não havia UM ÚNICO CASO DE ESCRITA. Os 37 eram `select
  -- count(*)`, chamada de função ou leitura de `pg_policy`. Política de INSERT
  -- e de UPDATE podia virar `true` sem ninguém notar — foi assim que o buraco
  -- de `cultos_editar` (migração 69) sobreviveu a 37/37.
  --
  -- O cenário abaixo é criado e apagado POR ID dentro desta mesma chamada. A
  -- função é `security invoker` e só `postgres` e `service_role` podem
  -- executá-la, então quem cria é quem já podia criar. Se algum caso levantar,
  -- a instrução inteira volta atrás e nada fica para trás.
  -- =====================================================================

  v_suf := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  v_tel_t := '21' || lpad((floor(random()*900000000)+100000000)::text, 9, '0');

  insert into equipes (nome, slug, ordem)
       values ('Perm ' || v_suf, 'perm-' || v_suf, 9990) returning id into v_eq_t;
  insert into funcoes (equipe_id, nome, ordem, ativa, tipos)
       values (v_eq_t, 'POSTO ' || v_suf, 1, true, array['domingo']) returning id into v_fn_t;
  insert into pessoas (nome, telefone) values ('Perm ' || v_suf, v_tel_t) returning id into v_p_t;
  insert into voluntarios (equipe_id, pessoa_id, nome, telefone, conferido, ativo)
       values (v_eq_t, v_p_t, 'Perm ' || v_suf, v_tel_t, true, true) returning id into v_vol_t;
  insert into candidaturas (pessoa_id, equipe_id) values (v_p_t, v_eq_t) returning id into v_cand_t;
  insert into historico_candidatura (candidatura_id, de, para, por, nota)
       values (v_cand_t, null, 'enviada', 'testar_permissoes', 'cenario do teste');
  insert into habilidades (voluntario_id, funcao_id, nivel, confirmado)
       values (v_vol_t, v_fn_t, 'titular', true);
  insert into indisponibilidades (voluntario_id, data) values (v_vol_t, current_date + 120)
    on conflict do nothing;
  insert into disponibilidade (voluntario_id, data, pode) values (v_vol_t, current_date + 121, true)
    on conflict do nothing;
  insert into config (equipe_id) values (v_eq_t) on conflict do nothing;
  insert into candidatura_funcoes (candidatura_id, funcao_id) values (v_cand_t, v_fn_t)
    on conflict do nothing;
  insert into perguntas (equipe_id, texto, ordem, ativa)
       values (v_eq_t, 'Pergunta ' || v_suf, 990, true) returning id into v_perg_t;
  insert into onboarding_etapas (equipe_id, titulo, ordem, ativa)
       values (v_eq_t, 'Etapa ' || v_suf, 990, true) returning id into v_onb_t;
  select id into v_culto_t from cultos where evento is null order by data limit 1;
  if v_culto_t is not null then
    insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
         values (v_culto_t, v_fn_t, v_vol_t, 'pendente', false, false);
    insert into plantoes (culto_id, voluntario_id) values (v_culto_t, v_vol_t)
      on conflict do nothing;
    insert into culto_obs (culto_id, equipe_id, obs) values (v_culto_t, v_eq_t, 'obs ' || v_suf)
      on conflict (culto_id, equipe_id) do update set obs = excluded.obs;
  end if;
  /* um evento DESTA equipe de teste, num dia sem culto, para o ataque da 69 */
  v_dia_t := (current_date + 90)::date;
  while extract(dow from v_dia_t) in (0, 6) loop v_dia_t := v_dia_t + 1; end loop;
  insert into cultos (data, evento, equipe_id, obs)
       values (v_dia_t, 'Perm ' || v_suf, v_eq_t, 'anotacao ' || v_suf) returning id into v_ev_t;

  -- ---------------------------------------------------------------------
  -- A · O CENÁRIO EXISTE (sem isto, tudo abaixo é vácuo)
  -- ---------------------------------------------------------------------
  select count(*) into n from voluntarios v where v.equipe_id <> v_louvor;
  return query select 'cenário'::text, 'existe voluntário FORA do Louvor para não ser visto'::text,
    '> 0'::text, n::text, n > 0;

  select count(*) into n from candidaturas c where c.equipe_id <> v_louvor;
  return query select 'cenário'::text, 'existe candidatura FORA do Louvor para não ser vista'::text,
    '> 0'::text, n::text, n > 0;

  select count(*) into n from escalacoes e join funcoes f on f.id = e.funcao_id
   where f.equipe_id <> v_louvor;
  return query select 'cenário'::text, 'existe escalação FORA do Louvor para não ser vista'::text,
    '> 0'::text, n::text, n > 0;

  -- ---------------------------------------------------------------------
  -- B · A VARREDURA, TABELA POR TABELA
  --
  -- Oito casos escritos à mão cobriam três tabelas, e a auditoria mediu o
  -- resultado disso: afrouxando cada política para `using (true)`, só 11 das
  -- 37 eram acusadas. As doze abaixo são as tabelas que a RLS separa POR
  -- EQUIPE, e o laço cobra a mesma coisa de todas: o organizador do Louvor
  -- não enxerga uma linha de NENHUMA outra área.
  --
  -- É um laço e não doze casos escritos porque tabela nova que nasça escopada
  -- entra aqui em uma linha — e porque doze casos copiados e colados é a
  -- forma que mais rápido fica para trás.
  --
  -- Cada entrada leva a consulta que conta as linhas DE FORA do Louvor. O
  -- cenário acima planta uma linha em cada, então nenhum destes casos pode
  -- passar por vácuo — e o caso do cenário, logo acima, reprova se algum dia
  -- puder.
  -- ---------------------------------------------------------------------
  /* CADA CONSULTA TOCA UMA TABELA SÓ, E ISSO CUSTOU UMA RODADA DE MEDIÇÃO.

     A primeira versão deste laço lia `escalacoes` com `join funcoes ... where
     f.equipe_id <> $1`. Medido abrindo `eq_escalacoes` de par em par: o caso
     continuava verde — porque quem filtrava o resultado era a política de
     `funcoes`, não a de `escalacoes`. Caso que passa com a política aberta é
     exatamente o que este arquivo existe para eliminar.

     Agora o parâmetro é um id do cenário, capturado ANTES da troca de papel, e
     a consulta não sai da tabela que está sendo testada. */
  for txt, erro, v_alvo in
    select * from (values
      ('voluntarios',           'select count(*) from voluntarios where equipe_id = $1',            v_eq_t),
      ('funcoes',               'select count(*) from funcoes where equipe_id = $1',                v_eq_t),
      ('config',                'select count(*) from config where equipe_id = $1',                 v_eq_t),
      ('culto_obs',             'select count(*) from culto_obs where equipe_id = $1',              v_eq_t),
      ('candidaturas',          'select count(*) from candidaturas where equipe_id = $1',           v_eq_t),
      ('escalacoes',            'select count(*) from escalacoes where funcao_id = $1',             v_fn_t),
      ('habilidades',           'select count(*) from habilidades where funcao_id = $1',            v_fn_t),
      ('indisponibilidades',    'select count(*) from indisponibilidades where voluntario_id = $1', v_vol_t),
      ('disponibilidade',       'select count(*) from disponibilidade where voluntario_id = $1',    v_vol_t),
      ('plantoes',              'select count(*) from plantoes where voluntario_id = $1',           v_vol_t),
      ('candidatura_funcoes',   'select count(*) from candidatura_funcoes where candidatura_id = $1', v_cand_t),
      ('historico_candidatura', 'select count(*) from historico_candidatura where candidatura_id = $1', v_cand_t),
      ('pessoas',               'select count(*) from pessoas where id = $1',                       v_p_t),
      ('perguntas',             'select count(*) from perguntas where id = $1',                     v_perg_t),
      ('onboarding_etapas',     'select count(*) from onboarding_etapas where id = $1',             v_onb_t)
    ) t(tabela, consulta, alvo)
  loop
    /* quanto existe, visto por quem enxerga tudo: zero aqui quer dizer que o
       cenário não montou e o caso seria vácuo — e é isso que se reprova */
    execute erro into m using v_alvo;

    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    execute erro into n using v_alvo;
    reset role;

    return query select 'isolamento'::text,
      format('o organizador do Louvor não vê a linha de outra área em `%s`', txt)::text,
      case when m > 0 then '0' else 'VÁCUO: o cenário não montou esta linha' end::text,
      n::text,
      m > 0 and n = 0;
  end loop;

  -- ---------------------------------------------------------------------
  -- C · ESCRITA. Era isto que não existia.
  -- ---------------------------------------------------------------------

  /* C1 · O MAIS GRAVE DE TODOS: virar admin da igreja.
     `papeis_criar` é a única coisa entre "líder de uma área" e "dono de
     tudo". Com ela aberta, o organizador de qualquer ministério se promove
     numa linha — e `quem_sou()` entrega o próprio `pessoa_id` de graça. */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    insert into papeis (pessoa_id, papel, criado_por)
    select p.id, 'admin', 'testar_permissoes'
      from pessoas p where lower(p.auth_email) = 'jander.jpcris@gmail.com';
    get diagnostics n = row_count;
    reset role;
  exception when others then reset role; n := 0; end;
  return query select 'escrita'::text, 'organizador de área NÃO se promove a admin (papeis_criar)'::text,
    '0'::text, n::text, n = 0;

  /* e se por acaso passou, isto diz em voz alta o que aconteceu */
  set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
  select count(*) into n from equipes;
  reset role;
  return query select 'escrita'::text, 'e ele continua enxergando UM ministério só'::text,
    '1'::text, n::text, n = 1;

  /* C2 · mudar a identidade de alguém (`pessoas_editar` é lidera_tudo()) */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    update pessoas set auth_email = 'invadido@exemplo.invalido' where id = v_p_t;
    get diagnostics n = row_count;
    reset role;
  exception when others then reset role; n := 0; end;
  return query select 'escrita'::text, 'organizador de área NÃO muda o e-mail de acesso de ninguém'::text,
    '0'::text, n::text, n = 0;

  /* C3 · O ATAQUE DA 69: constante sem `where`. `update` que não cita coluna
     nenhuma não passa pela política de SELECT, e sobra só o USING do UPDATE. */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    update cultos set obs = null;
    reset role;
  exception when others then reset role; end;
  select count(*) into n from cultos where id = v_ev_t and obs = 'anotacao ' || v_suf;
  return query select 'escrita'::text, 'a anotação do evento de outra área sobrevive a `update cultos set obs = null`'::text,
    '1'::text, n::text, n = 1;

  /* C4 · cadastrar gente no time dos outros */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    insert into voluntarios (equipe_id, nome, telefone, conferido, ativo)
         values (v_eq_t, 'Intruso ' || v_suf, '21988887777', true, true);
    get diagnostics n = row_count;
    reset role;
  exception when others then reset role; n := 0; end;
  return query select 'escrita'::text, 'organizador NÃO cadastra voluntário na área de outro'::text,
    '0'::text, n::text, n = 0;

  /* C5 · criar posto na área dos outros */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    insert into funcoes (equipe_id, nome, ordem, ativa) values (v_eq_t, 'INVASOR', 99, true);
    get diagnostics n = row_count;
    reset role;
  exception when others then reset role; n := 0; end;
  return query select 'escrita'::text, 'nem cria posto na área de outro'::text,
    '0'::text, n::text, n = 0;

  /* C6 · mexer no voluntário dos outros */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    update voluntarios set ativo = false where id = v_vol_t;
    get diagnostics n = row_count;
    reset role;
  exception when others then reset role; n := 0; end;
  return query select 'escrita'::text, 'nem pausa voluntário de outra área'::text,
    '0'::text, n::text, n = 0;

  /* C7 · e quem não lidera nada não escreve em lugar nenhum */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_zé, true);
    insert into funcoes (equipe_id, nome, ordem, ativa) values (v_louvor, 'DE FORA', 98, true);
    get diagnostics n = row_count;
    reset role;
  exception when others then reset role; n := 0; end;
  return query select 'escrita'::text, 'quem não lidera nada não cria posto em lugar nenhum'::text,
    '0'::text, n::text, n = 0;

  /* C8 · `anon` não escreve nada, em tabela nenhuma */
  begin
    set local role anon;
    insert into pessoas (nome, telefone) values ('Anon ' || v_suf, '21900000000');
    get diagnostics n = row_count;
    reset role;
  exception when others then reset role; n := 0; end;
  return query select 'escrita'::text, 'anon não escreve em `pessoas`'::text,
    '0'::text, n::text, n = 0;

  -- ---------------------------------------------------------------------
  -- LIMPEZA, POR ID
  -- ---------------------------------------------------------------------
  delete from papeis where criado_por = 'testar_permissoes';
  delete from escalacoes where funcao_id = v_fn_t;
  delete from plantoes p using voluntarios v where v.id = p.voluntario_id and v.equipe_id = v_eq_t;
  delete from culto_obs where equipe_id = v_eq_t;
  delete from config where equipe_id = v_eq_t;
  delete from disponibilidade d using voluntarios v where v.id = d.voluntario_id and v.equipe_id = v_eq_t;
  delete from indisponibilidades i using voluntarios v where v.id = i.voluntario_id and v.equipe_id = v_eq_t;
  delete from historico_candidatura where candidatura_id = v_cand_t;
  delete from candidatura_funcoes where candidatura_id = v_cand_t;
  delete from candidaturas where id = v_cand_t;
  delete from habilidades where voluntario_id = v_vol_t;
  delete from voluntarios where equipe_id = v_eq_t;
  delete from culto_obs where culto_id = v_ev_t;
  delete from cultos where id = v_ev_t;
  delete from onboarding_feito where etapa_id = v_onb_t;
  delete from onboarding_etapas where id = v_onb_t;
  delete from candidatura_respostas where pergunta_id = v_perg_t;
  delete from perguntas where id = v_perg_t;
  delete from funcoes where equipe_id = v_eq_t;
  delete from equipes where id = v_eq_t;
  delete from pessoas where id = v_p_t;
end $function$;

revoke all on function public.testar_permissoes() from public, anon, authenticated;
grant execute on function public.testar_permissoes() to service_role;
comment on function public.testar_permissoes() is
  'Confere a RLS CHAMANDO como cada papel. Desde a 70 ela CRIA o cenario de que precisa (uma area de teste fora do Louvor) e apaga por id no fim, porque todo caso "nao ve X" era vacuo quando X nao existia; e tem casos de ESCRITA, que nao existiam — medido: 31 das 37 politicas podiam ser derrubadas sem o teste acusar.';

do $reg$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (70, '70 · o teste de permissao tem caso de escrita', 'testar_permissoes',
           'papeis_criar)'),
      (70, '70 · e cria o cenario de que precisa', 'testar_permissoes',
           'existe voluntário fora do louvor')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;

  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo)
      values (70, '70-o-teste-de-permissao-nao-tinha-caso-de-escrita.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;


-- =========================================================================
-- A CONFERÊNCIA
--
-- Ela não confere o teste lendo o teste: ela AFROUXA uma política de verdade,
-- roda `testar_permissoes()`, e cobra que ele reprove. É o experimento da
-- auditoria, reduzido à política mais grave e feito dentro de uma transação
-- que volta atrás.
--
-- Um teste de permissão que não reprova quando a permissão some é pior que
-- nenhum: ele ensina a confiar. Esta conferência é a única coisa neste
-- repositório que mede isso.
-- =========================================================================

do $conf$
declare
  v_antes int; v_depois int; v_src text;
  ok int := 0; falhou int := 0; msg text := '';
begin
  if to_regprocedure('public.testar_permissoes()') is null then
    raise notice '70 · PULEI: testar_permissoes() nao existe nesta base.'; return;
  end if;

  /* ---- 1. verde antes ------------------------------------------------- */
  select count(*) filter (where not passou) into v_antes from testar_permissoes();
  if v_antes = 0 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || format(E'\n  x o teste ja esta reprovando %s caso(s) ANTES de qualquer sabotagem', v_antes);
  end if;

  /* ---- 2. E REPROVA QUANDO `papeis_criar` ABRE -----------------------
     O texto original é guardado e reposto logo abaixo, no mesmo bloco. */
  select pg_get_expr(pol.polwithcheck, pol.polrelid) into v_src
    from pg_policy pol join pg_class c on c.oid = pol.polrelid
   where c.relname = 'papeis' and pol.polname = 'papeis_criar';

  if v_src is null then
    falhou := falhou + 1;
    msg := msg || E'\n  x nao achei a politica papeis_criar para sabotar: o caso ficaria vazio';
  else
    execute 'drop policy papeis_criar on papeis';
    execute 'create policy papeis_criar on papeis for insert to authenticated with check (true)';

    select count(*) filter (where not passou) into v_depois from testar_permissoes();

    /* repõe ANTES de julgar: se a asserção levantasse, o bloco voltaria
       atrás sozinho, mas deixar a política de pé por menos tempo é melhor */
    execute 'drop policy papeis_criar on papeis';
    execute format('create policy papeis_criar on papeis for insert to authenticated with check (%s)', v_src);

    if v_depois > 0 then ok := ok + 1;
    else
      falhou := falhou + 1;
      msg := msg || E'\n  x COM `papeis_criar` ABERTA O TESTE CONTINUOU VERDE: ele nao ve a politica '
                 || 'que separa lider de area de dono da igreja';
    end if;
  end if;

  /* ---- 3. e voltou ao normal depois de repor -------------------------- */
  select count(*) filter (where not passou) into v_depois from testar_permissoes();
  if v_depois = 0 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || format(E'\n  x a politica nao foi reposta direito: %s caso(s) reprovando', v_depois);
  end if;

  /* ---- 4. e o cenario nao ficou para tras ----------------------------- */
  select count(*) into v_depois from equipes where slug like 'perm-%';
  if v_depois = 0 then ok := ok + 1;
  else
    falhou := falhou + 1;
    msg := msg || format(E'\n  x sobraram %s equipe(s) de teste no banco: a limpeza nao limpou', v_depois);
  end if;

  if falhou > 0 then
    raise exception 'A CONFERENCIA DA 70 REPROVOU: % de % casos', falhou, ok + falhou
      using detail = msg, errcode = 'raise_exception';
  end if;
  raise notice '70 · conferencia: %/% casos. O teste de permissao REPROVA quando a politica mais grave e afrouxada, e nao deixa cenario para tras.', ok, ok;
end $conf$;


/* =============================================================================
   ROLLBACK
     Copiar o corpo de `testar_permissoes` da migração 60 por cima. Os casos de
     escrita e o cenário somem, e o teste volta a dizer 37/37 com a igreja
     aberta.

   VERIFICAÇÃO DEPOIS DE APLICAR
     select * from testar_permissoes();
     select * from schema_versao_conferir();
   ============================================================================= */
