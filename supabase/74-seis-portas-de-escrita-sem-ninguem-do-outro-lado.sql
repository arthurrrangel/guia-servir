-- =========================================================================
-- 74 · SEIS PORTAS DE ESCRITA QUE O APP NUNCA USOU
--
-- 21/09/2026. A própria migração 70 deixou a lista escrita: das 37 políticas,
-- 14 continuavam cegas ao `testar_permissoes`, e destas, seis foram marcadas
-- como "as candidatas óbvias da próxima rodada":
--
--     perg_criar, perg_editar, perg_apagar, onbf_tudo, hist_criar, cand_editar
--
-- Esta é a próxima rodada. O que se mediu, num banco nascido do repositório,
-- entrando como o organizador do Louvor (`jander.jpcris@gmail.com`):
--
-- 1. cand_editar — A TELA DA CANDIDATA PASSOU A MENTIR
--
--        update candidaturas set status = 'ativa';        -> UPDATE 1
--
--    e `candidatura_status` respondeu, para a candidata:
--
--        titulo:        "Você está servindo"
--        texto:         "Sua escala aparece no seu espaço pessoal."
--        link_pessoal:  null
--        funcoes:       []
--        etapa:         6      (de 4)
--
--    Não existia espaço pessoal: nenhuma linha em `voluntarios`, nenhuma
--    habilidade, nenhuma linha em `historico_candidatura` dizendo quem
--    decidiu. A pessoa sai achando que entrou; ninguém no ministério a vê em
--    lista nenhuma.
--
--    O que a auditoria tinha anotado era pior do que é: "aprova candidato de
--    TODO ministério". Não aprova — o `using` de `cand_editar` é
--    `lidera_equipe(equipe_id)` e vale linha a linha, então só a candidatura
--    do próprio ministério muda. Fica registrado porque anotação
--    superestimada gasta o crédito do resto.
--
-- 2. hist_criar — O `por` DO HISTÓRICO É FORJÁVEL
--
--        insert into historico_candidatura (candidatura_id, de, para, por, nota)
--          select id, 'enviada', 'aprovada', 'arthurrangel427@gmail.com', ...
--
--        -> INSERT 1, e a linha ficou com
--           por = arthurrangel427@gmail.com  (quem escreveu foi o Jander)
--
--    `historico_candidatura` é a única coisa no sistema que responde "quem
--    decidiu isso?". Ela aceita qualquer nome no campo `por`, porque a coluna
--    nunca é conferida contra quem está escrevendo.
--
-- 3. perg_apagar — O FORMULÁRIO PÚBLICO DO MINISTÉRIO, EM UMA LINHA
--
--        delete from perguntas;      -> DELETE 4
--
--    As quatro do Louvor. As gerais (`equipe_id is null`) e as dos outros
--    ministérios ficaram, porque o `using` exige `equipe_id is not null and
--    lidera_equipe(equipe_id)` — de novo, a anotação da auditoria dizia
--    "esvazia o formulário de todo ministério" e não esvazia. O que esvazia é
--    o formulário do próprio ministério, com cascata para as respostas de
--    quem já se candidatou, e sem volta.
--
-- 4. onbf_tudo — escrita em `onboarding_feito` pelo PostgREST: `INSERT 5`.
--
-- O QUE AS SEIS TÊM EM COMUM, E É ISSO QUE DECIDE O CONSERTO
--
-- NENHUMA TEM CONSUMIDOR. Levantado no catálogo e no código:
--
--   · `perguntas`  — nenhuma tela escreve, nenhuma função do banco escreve.
--     As perguntas nascem de migração. Três portas de escrita, zero usos.
--   · `onboarding_feito` — quem escreve é `eu_espaco` e `eu_marcar_passo`,
--     as duas `security definer`. A política não é usada por ninguém.
--   · `historico_candidatura` — quem escreve é `candidatar` (definer) e
--     `decidir_candidatura`. A aplicação só LÊ.
--   · `candidaturas` — a aplicação só LÊ (`lib/candidaturas.ts:122` é um
--     `select`). Quem escreve é `candidatar` (definer) e
--     `decidir_candidatura`.
--
-- Então as seis são apagadas, e `decidir_candidatura` — que era a única que
-- dependia de duas delas — vira `security definer` com a permissão escrita
-- como código. Porta sem ninguém do outro lado não se tranca melhor: se tira.
--
-- O QUE ISSO NÃO CONSERTA, escrito aqui em vez de descoberto depois:
--
--   · a barra da candidata mostrando "etapa 6 de 4" é outro defeito, na
--     conta de `candidatura_status`, e não entra nesta migração;
--   · `cand_apagar` continua de pé. Medido: `delete from candidaturas` como
--     o organizador do Louvor removeu ZERO linhas, então não há dano a
--     mostrar, e apagar política sem defeito medido é mexer por mexer;
--   · quando existir tela de editar perguntas, ela entra por uma função
--     `security definer` com a permissão escrita, como `decidir_candidatura`
--     ficou aqui — e não reabrindo estas políticas.
-- =========================================================================

/* A TRANCA. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(74);
  end if;
end $tranca$;

CREATE OR REPLACE FUNCTION public.decidir_candidatura(p_id uuid, p_status text, p_nota text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c record; v_vol uuid; v_quem text; v_de status_candidatura; v_novo status_candidatura;
begin
  v_quem := coalesce(nullif(auth.jwt() ->> 'email', ''), 'sistema');
  begin v_novo := p_status::status_candidatura;
  exception when others then return jsonb_build_object('ok', false, 'erro', 'STATUS_INVALIDO'); end;

  /* ============================================================ 74 ======
     A AUTORIZAÇÃO PASSA A SER EXPLÍCITA, PORQUE A RLS SAIU DAQUI.

     Estava escrito `-- a RLS já filtra aqui`, e era verdade: a função era
     `security invoker`, então o `select` só enxergava a candidatura de quem
     chamou e o `update` passava pela política `cand_editar`.

     Só que `cand_editar` também deixava a MESMA escrita sair por fora desta
     função, pelo PostgREST. Medido em 21/09 num banco nascido do
     repositório, como o organizador do Louvor:

         update candidaturas set status = 'ativa';     -> UPDATE 1

     e a tela da candidata passou a dizer, palavra por palavra:

         "Você está servindo"
         "Sua escala aparece no seu espaço pessoal."
         link_pessoal: null

     Não havia espaço pessoal: `voluntarios` ficou sem linha, `funcoes` veio
     vazio, `historico_candidatura` ficou sem registro de quem decidiu, e a
     barra mostrava etapa 6 de 4. A tela afirmando à pessoa uma coisa que a
     igreja não fez — é o mesmo defeito da tela de oferta, no outro canto.

     A saída é tirar a porta de fora: `cand_editar` é apagada nesta migração,
     e esta função vira `security definer` para continuar podendo escrever. O
     preço é que o `select` abaixo passa a enxergar TODAS as candidaturas, e
     por isso a permissão precisa estar escrita aqui, como código, em vez de
     ficar implícita numa política que não existe mais. */
  select * into c from candidaturas where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  if not lidera_equipe(c.equipe_id) then
    return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO');
  end if;
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
end $function$

;

revoke all on function public.decidir_candidatura(uuid, text, text) from public, anon;
grant execute on function public.decidir_candidatura(uuid, text, text) to authenticated;
comment on function public.decidir_candidatura(uuid, text, text) is
  'O ÚNICO caminho para mudar o status de uma candidatura. Desde a 74 é `security definer` com a permissão escrita no corpo (`lidera_equipe`), porque a política `cand_editar` — que deixava a mesma escrita sair pelo PostgREST sem criar o voluntário nem o histórico — foi apagada. Ela faz o trabalho inteiro: cria/reativa o vínculo, transforma interesse em habilidade não confirmada, grava quem decidiu e escreve o histórico.';

-- =========================================================================
-- AS SEIS PORTAS
--
-- `drop policy` e `revoke` juntos, de propósito. A política sozinha já
-- fecharia (tabela com RLS e sem política para aquele comando é negação),
-- mas o `revoke` é o que deixa a intenção legível no catálogo: quem for ver
-- os privilégios de `authenticated` amanhã lê "não escreve aqui" em vez de
-- ter que deduzir de uma ausência.
-- =========================================================================

drop policy if exists cand_editar on candidaturas;
revoke update on candidaturas from authenticated;

drop policy if exists hist_criar on historico_candidatura;
revoke insert, update, delete on historico_candidatura from authenticated;

drop policy if exists perg_criar  on perguntas;
drop policy if exists perg_editar on perguntas;
drop policy if exists perg_apagar on perguntas;
revoke insert, update, delete on perguntas from authenticated;

drop policy if exists onbf_tudo on onboarding_feito;
revoke insert, update, delete on onboarding_feito from authenticated;
/* `onbf_tudo` era ALL, então apagá-la tira também a LEITURA. Ninguém lê esta
   tabela pelo PostgREST — quem lê é `eu_espaco`, que é `security definer` —
   mas a leitura fica escrita aqui em vez de sumir por efeito colateral de um
   `drop`, para que a próxima pessoa veja a decisão e não o resto dela. */
drop policy if exists onbf_ler on onboarding_feito;
create policy onbf_ler on onboarding_feito for select to authenticated
  using (exists (select 1 from voluntarios v
                  where v.id = onboarding_feito.voluntario_id
                    and lidera_equipe(v.equipe_id)));

-- =========================================================================
-- E `testar_permissoes` PASSA A COBRAR ISSO TODO DIA, NÃO SÓ HOJE
--
-- A conferência abaixo refaz os quatro ataques, mas roda uma vez: na hora de
-- aplicar este arquivo. Quem pergunta ao banco se ele está inteiro é
-- `testar_permissoes()`, e é ela que alguém roda contra produção meses
-- depois — quando o painel do Supabase já tiver sido aberto algumas vezes.
--
-- Quatro casos novos: um NOMINAL (as seis políticas continuam apagadas) e
-- três de ATAQUE. Os três importam mais: política recriada com outro nome
-- escapa do nominal e não escapa do ataque.
--
-- Corpo copiado verbatim do que está no ar, com uma inserção e só uma.
-- =========================================================================
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
  /* ============================================================ 78 ======
     ESTE CASO APAGAVA DADO REAL, E O VEREDITO VINHA DA CAMADA ERRADA.

     `update cultos set obs = null` sem `where`: a política `cultos_editar`
     deixa o Jander alcançar os EVENTOS que ele lidera, e `culto_guarda` não
     recusa evento do próprio dono. Então, quando nenhuma outra linha faz o
     gatilho levantar primeiro, a instrução conclui e zera a anotação de
     todos os eventos do ministério dele — sem volta, numa função que o
     cabeçalho diz que alguém roda contra produção.

     Hoje ela é salva por ACIDENTE: alguma linha de culto regular tem `obs`,
     o gatilho levanta, e o `exception` engole. Depender de outra linha
     levantar primeiro não é guarda.

     Agora o ataque roda dentro de um savepoint que sempre volta. */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    update cultos set obs = null;
    reset role;
    raise exception 'desfazendo' using errcode = 'triggered_action_exception';
  exception
    when triggered_action_exception then null;
    when others then reset role;
  end;
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

  /* ============================================================ 74 ======
     C9 · AS SEIS PORTAS QUE A 74 TIROU CONTINUAM TIRADAS.

     A conferência da 74 refaz os quatro ataques, mas ela roda uma vez, na
     hora de aplicar o arquivo. Isto aqui roda toda vez que alguém pergunta
     ao banco se ele está inteiro — inclusive contra produção, meses depois,
     quando alguém recriar uma delas pelo painel do Supabase achando que
     falta permissão.

     A lista é nominal de propósito: `cand_editar` recriada com outro nome
     não é pega por este caso, e é por isso que os casos de ATAQUE (C10 e
     C11 abaixo) existem ao lado dele. Nome some, comportamento fica. */
  select count(*) into n from pg_policies where schemaname = 'public'
   and policyname in ('cand_editar','hist_criar','perg_criar','perg_editar','perg_apagar','onbf_tudo');
  return query select 'escrita'::text,
    'as seis politicas sem consumidor continuam apagadas (74)'::text,
    '0'::text, n::text ||
      coalesce(' (' || (select string_agg(policyname, ', ') from pg_policies
                         where schemaname = 'public'
                           and policyname in ('cand_editar','hist_criar','perg_criar',
                                              'perg_editar','perg_apagar','onbf_tudo')) || ')', ''),
    n = 0;

  /* C10 · e o ATAQUE que `cand_editar` permitia continua recusado, venha a
     porta com o nome que vier. Era ele que fazia a tela da candidata dizer
     "Você está servindo" sem existir vínculo nenhum. */
  /* O ATAQUE VOLTA ATRÁS SOZINHO. `begin ... exception` é savepoint, e o
     `raise` no fim desfaz o `update` tenha ele alcançado o que for. Sem
     isso, o dia em que a política voltasse, ESTE TESTE aprovaria toda
     candidatura do ministério do Jander — e `testar_permissoes` é a função
     que o cabeçalho diz que alguém roda contra produção meses depois. */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    update candidaturas set status = 'ativa';
    get diagnostics n = row_count; reset role;
    raise exception 'desfazendo' using errcode = 'triggered_action_exception', detail = n::text;
  exception
    when triggered_action_exception then
      declare v_det text; begin
        get stacked diagnostics v_det = pg_exception_detail;
        n := coalesce(nullif(v_det,'')::int, 0);
      end;
    when others then reset role; n := 0;
  end;
  return query select 'escrita'::text,
    'organizador NÃO muda status de candidatura por fora de `decidir_candidatura`'::text,
    '0'::text, n::text, n = 0;

  /* C11 · e o `por` do histórico não é forjável: a coluna é a única coisa no
     sistema que responde "quem decidiu isso?" */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    insert into historico_candidatura (candidatura_id, de, para, por, nota)
      select c.id, 'enviada', 'aprovada', 'nao-fui-eu@exemplo.invalido', 'teste'
        from candidaturas c where c.equipe_id = v_louvor limit 1;
    get diagnostics n = row_count; reset role;
  exception when others then reset role; n := 0; end;
  return query select 'escrita'::text,
    'organizador NÃO escreve historico com `por` de outra pessoa'::text,
    '0'::text, n::text, n = 0;

  /* C12 · e o formulário público do ministério não some numa linha só */
  /* idem: o delete volta atrás sempre. Sem o savepoint, o dia em que
     `perg_apagar` voltasse, este caso apagaria o formulário público do
     Louvor ao ser executado — e ele existe para IMPEDIR isso. */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    delete from perguntas;
    get diagnostics n = row_count; reset role;
    raise exception 'desfazendo' using errcode = 'triggered_action_exception', detail = n::text;
  exception
    when triggered_action_exception then
      declare v_det text; begin
        get stacked diagnostics v_det = pg_exception_detail;
        n := coalesce(nullif(v_det,'')::int, 0);
      end;
    when others then reset role; n := 0;
  end;
  return query select 'escrita'::text,
    'organizador NÃO apaga as perguntas do proprio formulario'::text,
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
  /* 79 · C7 e C8 criam coisa FORA do cenário, e a limpeza não levava.
     C7 tenta inserir `funcoes` no Louvor e C8 tenta inserir em `pessoas`;
     nos dois o esperado é recusa, mas no dia em que a política se abrir —
     que é o que esses casos existem para detectar — as duas linhas ficavam.
     Limpar por nome do sufixo é preciso: o sufixo é sorteado por execução. */
  delete from funcoes where nome like '%' || v_suf and equipe_id <> v_eq_t;
  delete from pessoas where nome like '%' || v_suf and id <> v_p_t;
  delete from funcoes where equipe_id = v_eq_t;
  delete from equipes where id = v_eq_t;
  delete from pessoas where id = v_p_t;
end $function$

;

revoke all on function public.testar_permissoes() from public, anon, authenticated;
grant execute on function public.testar_permissoes() to service_role;

do $reg$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (74, '74 · decidir_candidatura confere a permissao no corpo', 'decidir_candidatura',
           'if not lidera_equipe(c.equipe_id) then'),
      (74, '74 · testar_permissoes refaz o ataque do status', 'testar_permissoes',
           'por fora de `decidir_candidatura`'),
      (74, '74 · testar_permissoes refaz o ataque do historico forjado', 'testar_permissoes',
           'com `por` de outra pessoa')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo)
      values (74, '74-seis-portas-de-escrita-sem-ninguem-do-outro-lado.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;

-- =========================================================================
-- CONFERÊNCIA
--
-- Ela não pergunta "a política sumiu?". Ela REFAZ os quatro ataques medidos
-- no cabeçalho, como o organizador do Louvor, e cobra que nenhum funcione —
-- e, no mesmo fôlego, que `decidir_candidatura` continue fazendo o trabalho
-- inteiro, porque tranca que também tranca o dono não serve.
-- =========================================================================
do $conferir$
declare
  v_falhas text := ''; v_n int; v_eq uuid; v_outra uuid;
  v_p uuid; v_c uuid; v_p2 uuid; v_c2 uuid; v_perg int; v_jwt text; v_r jsonb;
  v_lider text; v_vol uuid; v_erro text;
begin
  select id into v_eq    from equipes where slug = 'louvor';
  select id into v_outra from equipes where slug <> 'louvor' limit 1;
  select p.auth_email into v_lider
    from papeis x join pessoas p on p.id = x.pessoa_id
   where x.papel = 'lider' and x.equipe_id = v_eq limit 1;
  if v_lider is null then
    raise exception 'CONFERENCIA DA 74: nao achei o organizador do Louvor, o cenario nao existe';
  end if;
  v_jwt := json_build_object('email', v_lider, 'role', 'authenticated')::text;

  /* cenário: uma candidatura no Louvor e uma FORA dele */
  insert into pessoas (nome, telefone) values ('Conf74 A', '21900000074') returning id into v_p;
  insert into candidaturas (pessoa_id, equipe_id, status) values (v_p, v_eq, 'enviada') returning id into v_c;
  insert into pessoas (nome, telefone) values ('Conf74 B', '21900000075') returning id into v_p2;
  insert into candidaturas (pessoa_id, equipe_id, status) values (v_p2, v_outra, 'enviada') returning id into v_c2;
  select count(*) into v_perg from perguntas;

  -- 1 · o ataque do status direto não muda nada
  begin
    set local role authenticated; perform set_config('request.jwt.claims', v_jwt, true);
    update candidaturas set status = 'ativa';
    get diagnostics v_n = row_count; reset role;
  exception when insufficient_privilege then reset role; v_n := 0; end;
  if v_n > 0 then
    v_falhas := v_falhas || format(E'\n  1. `update candidaturas set status` mudou %s linha(s)', v_n);
  end if;
  select count(*) into v_n from candidaturas where status <> 'enviada' and id in (v_c, v_c2);
  if v_n > 0 then
    v_falhas := v_falhas || format(E'\n  1b. %s candidatura(s) sairam de `enviada` sem ninguem decidir', v_n);
  end if;

  -- 2 · o histórico não aceita linha forjada
  begin
    set local role authenticated; perform set_config('request.jwt.claims', v_jwt, true);
    insert into historico_candidatura (candidatura_id, de, para, por, nota)
      values (v_c, 'enviada', 'aprovada', 'nao-fui-eu@exemplo.invalido', 'conf74');
    reset role; v_erro := 'ACEITOU';
  exception when insufficient_privilege then reset role; v_erro := 'recusado'; end;
  if v_erro <> 'recusado' then
    v_falhas := v_falhas || E'\n  2. `historico_candidatura` aceitou linha com `por` forjado';
  end if;

  -- 3 · as perguntas não somem
  begin
    set local role authenticated; perform set_config('request.jwt.claims', v_jwt, true);
    delete from perguntas;
    get diagnostics v_n = row_count; reset role;
  exception when insufficient_privilege then reset role; v_n := 0; end;
  if v_n > 0 then
    v_falhas := v_falhas || format(E'\n  3. `delete from perguntas` apagou %s pergunta(s)', v_n);
  end if;
  select count(*) into v_n from perguntas;
  if v_n <> v_perg then
    v_falhas := v_falhas || format(E'\n  3b. sobraram %s perguntas de %s', v_n, v_perg);
  end if;

  -- 4 · e `onboarding_feito` não recebe escrita de fora
  begin
    set local role authenticated; perform set_config('request.jwt.claims', v_jwt, true);
    insert into onboarding_feito (voluntario_id, etapa_id)
      select v.id, (select id from onboarding_etapas limit 1)
        from voluntarios v where v.equipe_id = v_eq limit 1;
    get diagnostics v_n = row_count; reset role;
  exception when insufficient_privilege then reset role; v_n := 0; end;
  if v_n > 0 then
    v_falhas := v_falhas || format(E'\n  4. `onboarding_feito` aceitou %s escrita(s) pelo PostgREST', v_n);
  end if;

  -- 5 · E O DONO CONTINUA PASSANDO: `decidir_candidatura` faz o trabalho inteiro
  /* o `begin/exception` aqui não é zelo: sabotando a função de volta para
     `security invoker`, o `update` dela bate no `revoke` acima e levanta
     `permission denied for table candidaturas` — a migração até recusava
     aplicar, mas com um erro cru que não diz qual das oito coisas quebrou.
     Uma conferência que reprova sem nomear o caso é meia conferência. */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', v_jwt, true);
    v_r := decidir_candidatura(v_c, 'aprovada', 'conferencia da 74');
    reset role;
  exception when others then
    reset role;
    v_r := jsonb_build_object('ok', false, 'erro', 'EXPLODIU: ' || sqlerrm);
  end;
  if coalesce(v_r ->> 'ok', 'false') <> 'true' then
    v_falhas := v_falhas || format(E'\n  5. decidir_candidatura falhou para o proprio dono: %s', v_r::text);
  end if;
  select voluntario_id into v_vol from candidaturas where id = v_c;
  if v_vol is null then
    v_falhas := v_falhas || E'\n  5b. decidir_candidatura aprovou sem criar o vinculo';
  end if;
  select count(*) into v_n from historico_candidatura where candidatura_id = v_c;
  if v_n = 0 then
    v_falhas := v_falhas || E'\n  5c. decidir_candidatura aprovou sem escrever o historico';
  end if;
  select count(*) into v_n from historico_candidatura
   where candidatura_id = v_c and por = v_lider;
  if v_n = 0 then
    v_falhas := v_falhas || format(E'\n  5d. o historico nao registrou QUEM decidiu (esperava %s)', v_lider);
  end if;

  -- 6 · e ela NÃO decide no ministério dos outros, que é o que a RLS fazia antes
  begin
    set local role authenticated; perform set_config('request.jwt.claims', v_jwt, true);
    v_r := decidir_candidatura(v_c2, 'aprovada', null);
    reset role;
  exception when others then
    reset role;
    v_r := jsonb_build_object('erro', 'SEM_ACESSO', 'como', 'exceção: ' || sqlerrm);
  end;
  if coalesce(v_r ->> 'erro', '') <> 'SEM_ACESSO' then
    v_falhas := v_falhas || format(
      E'\n  6. decidir_candidatura decidiu candidatura de OUTRO ministerio: %s', v_r::text);
  end if;
  select count(*) into v_n from candidaturas where id = v_c2 and status <> 'enviada';
  if v_n > 0 then
    v_falhas := v_falhas || E'\n  6b. a candidatura do outro ministerio mudou de status';
  end if;

  -- 7 · e o visitante continua sem ver nada disso
  begin
    set local role anon; select count(*) into v_n from candidaturas;
    reset role; v_erro := 'leu ' || v_n;
  exception when insufficient_privilege then reset role; v_erro := 'recusado'; end;
  if v_erro <> 'recusado' then
    v_falhas := v_falhas || format(E'\n  7. `anon` leu candidaturas: %s', v_erro);
  end if;

  -- 8 · as seis politicas sumiram mesmo, e `onbf_ler` ficou no lugar
  select count(*) into v_n from pg_policies where schemaname = 'public'
   and policyname in ('cand_editar','hist_criar','perg_criar','perg_editar','perg_apagar','onbf_tudo');
  if v_n > 0 then
    v_falhas := v_falhas || format(E'\n  8. %s das seis politicas continuam no catalogo', v_n);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and policyname='onbf_ler') then
    v_falhas := v_falhas || E'\n  8b. `onbf_ler` nao foi criada: onboarding_feito ficou sem leitura';
  end if;

  /* 8c · E `testar_permissoes` NÃO DEIXA NADA PARA TRÁS.
     Ela cria uma área inteira de teste e escreve em quinze tabelas. A
     limpeza dela é por id, mas C7 e C8 escrevem FORA do cenário — e a
     conferência nunca tinha olhado. Rodar duas vezes e contar o que sobrou é
     a única forma de saber. */
  select count(*) into v_n from equipes where slug like 'perm-%';
  if v_n > 0 then
    v_falhas := v_falhas || format(E'\n  8c. %s equipe(s) de teste sobraram de execucoes anteriores', v_n);
  end if;
  perform count(*) from testar_permissoes();
  perform count(*) from testar_permissoes();
  select count(*) into v_n from equipes where slug like 'perm-%';
  if v_n > 0 then
    v_falhas := v_falhas || format(E'\n  8d. depois de rodar duas vezes, %s equipe(s) de teste ficaram', v_n);
  end if;
  select count(*) into v_n from funcoes where nome like 'POSTO %';
  if v_n > 0 then
    v_falhas := v_falhas || format(E'\n  8e. e %s posto(s) de teste ficaram soltos em outra area', v_n);
  end if;

  -- 9 · `testar_permissoes` cresceu e continua inteiro
  select count(*) into v_n from testar_permissoes();
  if v_n < 68 then
    v_falhas := v_falhas || format(E'\n  9. testar_permissoes emitiu %s casos, esperava 68 ou mais', v_n);
  end if;
  select count(*) into v_n from testar_permissoes() where not passou;
  if v_n > 0 then
    v_falhas := v_falhas || format(E'\n  9b. %s caso(s) de testar_permissoes reprovaram: %s', v_n,
      (select string_agg(caso, '; ') from testar_permissoes() where not passou));
  end if;

  if v_falhas <> '' then
    raise exception E'CONFERENCIA DA 74 REPROVOU:%s', v_falhas;
  end if;
  raise notice 'CONFERENCIA DA 74: 10/10. Os quatro ataques recusados, e decidir_candidatura faz o trabalho inteiro.';

  /* desfaz o cenário: a conferência aprovou uma candidatura de verdade */
  delete from historico_candidatura where candidatura_id in (v_c, v_c2);
  delete from habilidades where voluntario_id = v_vol;
  delete from candidaturas where id in (v_c, v_c2);
  delete from voluntarios where id = v_vol;
  delete from pessoas where id in (v_p, v_p2);
end $conferir$;
