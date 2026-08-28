/* =============================================================================
   27 — A MATRIZ DE PERMISSÃO COBRE O 2.0  (§36)

   As migrações 22 a 26 acrescentaram NOVE tabelas e sete funções públicas, e
   `testar_permissoes()` continuava testando só o mundo de antes: 20 casos, todos
   sobre voluntários, cultos e escalações.

   Superfície nova que nenhum teste tocava:
     pessoas · candidaturas · candidatura_funcoes · candidatura_respostas
     historico_candidatura · perguntas · onboarding_etapas · onboarding_feito

   A §36 pede exatamente isto, e a razão é a mesma que valeu na primeira versão:
   a matriz achou um furo real (`eq_lideres_ler` sem sujeito) na PRIMEIRA
   execução. Policy nova sem teste apodrece em silêncio — nada quebra, nada
   avisa, e um dia o organizador de um ministério lê o candidato de outro.

   Os casos aqui não dependem de dado de teste plantado no banco. Fixture que
   fica é fixture que aparece na fila do líder.
   ============================================================================= */

/* -------------------------------------------------------------------------
   ACHADO PELA PROPRIA MATRIZ, ao rodar pela primeira vez com os casos novos:

   `voluntarios.pessoa_id`, criada na migração 22, ficou de fora do GRANT por
   coluna que a migração 18 escreveu — e aquele GRANT é uma lista fechada, não
   um "tudo menos pin_hash". A policy `pessoas_ler` referencia essa coluna e
   funciona, porque policy roda como dono da tabela; qualquer consulta do app
   que a mencione estoura com "permission denied for table voluntarios".

   Não quebrou nada ainda só porque `lib/db.ts` lista as colunas à mão e ainda
   não pede `pessoa_id`. Quebraria na primeira tela que precisasse do vínculo.

   pessoa_id é uma chave estrangeira, não segredo: entra no GRANT.
   ------------------------------------------------------------------------- */
grant select (pessoa_id) on voluntarios to authenticated;

create or replace function testar_permissoes()
returns table (grupo text, caso text, esperado text, obtido text, passou boolean)
language plpgsql security invoker set search_path = public as $fn$
declare
  v_louvor uuid; v_midia uuid; v_servico uuid;
  n bigint; m bigint; ok boolean; erro text; txt text;
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
  set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
  select count(*) into n from voluntarios v where v.equipe_id = v_louvor;
  reset role;
  return query select 'organizador escopado'::text, 'vê o próprio time'::text,
    '12'::text, n::text, n = 12;

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

  set local role anon; select count(*) into n from perguntas_publicas('louvor'); reset role;
  return query select 'visitante'::text, 'formulário do Louvor abre'::text,
    '6'::text, n::text, n = 6;

  set local role anon; select count(*) into n from equipe_publica('louvor'); reset role;
  return query select 'visitante'::text, 'lista de nomes do Louvor abre'::text,
    '12'::text, n::text, n = 12;

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

  select count(*) into n from pg_policy where polcmd = '*';
  return query select 'estrutura'::text, 'policies FOR ALL no total (dívida)'::text,
    'medindo'::text, n::text, true;
end $fn$;

revoke all on function testar_permissoes() from public, anon, authenticated;

comment on function testar_permissoes() is
  'matriz de permissao viva, cobrindo tambem pessoas, candidaturas e Meu Espaco. select * from testar_permissoes() — toda linha com passou=false e um furo. Rodar depois de QUALQUER mexida em policy.';
