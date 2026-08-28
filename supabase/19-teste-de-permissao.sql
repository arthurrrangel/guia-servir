/* =============================================================================
   19 — TESTE AUTOMATIZADO DA MATRIZ DE PERMISSÃO

   POR QUE ISTO EXISTE: hoje o isolamento por ministério é conferido à mão, com
   JWT simulado, uma vez, por mim. Foi assim que se descobriu que a policy de
   `cultos` tinha ficado para trás na migração 13 — sobrou de 01 e ninguém viu
   por semanas.

   A arquitetura quer módulos novos (pessoas, eventos, comunicação, financeiro).
   Cada módulo novo é policy nova. Sem um teste que rode, a matriz apodrece em
   silêncio: nada quebra, nada avisa, e um dia o organizador de um ministério
   está lendo o time de outro.

   COMO USAR: `select * from testar_permissoes();`
   Toda linha com passou = false é um furo. Zero linhas falsas = matriz íntegra.

   Roda inteiro dentro da transação da própria consulta, só com SELECT, e
   devolve o papel ao original no fim de cada caso. Não escreve nada.

   É SECURITY INVOKER de propósito: o Postgres proíbe `set role` dentro de
   SECURITY DEFINER, e trocar de papel é o que o teste faz. Só quem já é dono do
   banco consegue rodar — que é exatamente quem deve.
   ============================================================================= */

create or replace function testar_permissoes()
returns table (grupo text, caso text, esperado text, obtido text, passou boolean)
language plpgsql security invoker set search_path = public as $fn$
declare
  v_louvor uuid; v_midia uuid; v_servico uuid;
  n bigint; ok boolean; erro text;
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
  set local role authenticated;
  perform set_config('request.jwt.claims', jwt_jander, true);

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
  select count(*) into n from voluntarios v where v.equipe_id = v_servico;
  reset role;
  return query select 'organizador escopado'::text, 'NÃO vê a Diaconia'::text,
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

  set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
  select count(*) into n from habilidades h
    join funcoes f on f.id = h.funcao_id where f.equipe_id <> v_louvor;
  reset role;
  return query select 'organizador escopado'::text, 'NÃO vê habilidade alheia'::text,
    '0'::text, n::text, n = 0;

  -- =====================================================================
  -- FURO 1 DA AUDITORIA DE 26/08 — pin_hash tem que estar fora do alcance
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

  /* o token continua legível DE PROPÓSITO: montarLinks() usa /eu/<token> para
     mandar o link de quem esqueceu o PIN. Se um dia isso mudar, este caso
     começa a falhar e obriga a decisão a ser consciente. */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    select count(*) into n from (select token from voluntarios limit 1) z;
    reset role; ok := true; erro := 'legível';
  exception when insufficient_privilege then
    reset role; ok := false; erro := 'permission denied';
  end;
  return query select 'segredo'::text, 'token legível (risco aceito)'::text,
    'legível'::text, erro, ok;

  -- =====================================================================
  -- FURO 2 DA AUDITORIA — apagar culto é só do organizador global
  -- =====================================================================
  select count(*) into n from pg_policy pol join pg_class c on c.oid = pol.polrelid
   where c.relname = 'cultos' and pol.polcmd = 'd'
     and pg_get_expr(pol.polqual, pol.polrelid) ilike '%lidera_tudo%';
  return query select 'destrutivo'::text, 'apagar culto exige papel global'::text,
    '1 policy'::text, n || ' policy', n = 1;

  select count(*) into n from pg_policy pol join pg_class c on c.oid = pol.polrelid
   where c.relname = 'cultos' and pol.polcmd = '*';
  return query select 'destrutivo'::text, 'nenhuma policy FOR ALL em cultos'::text,
    '0'::text, n::text, n = 0;

  -- =====================================================================
  -- ORGANIZADOR GLOBAL (Arthur) — tem que ver tudo
  -- =====================================================================
  set local role authenticated; perform set_config('request.jwt.claims', jwt_arthur, true);
  select count(*) into n from equipes;
  reset role;
  return query select 'organizador global'::text, 'enxerga todos os ministérios'::text,
    '3'::text, n::text, n = 3;

  set local role authenticated; perform set_config('request.jwt.claims', jwt_arthur, true);
  select count(*) into n from voluntarios where ativo;
  reset role;
  return query select 'organizador global'::text, 'enxerga todo voluntário ativo'::text,
    '35'::text, n::text, n = 35;

  -- =====================================================================
  -- EMAIL QUE NÃO ESTÁ NA LISTA — não é organizador de nada
  -- =====================================================================
  set local role authenticated; perform set_config('request.jwt.claims', jwt_zé, true);
  select count(*) into n from voluntarios;
  reset role;
  return query select 'estranho autenticado'::text, 'não vê voluntário nenhum'::text,
    '0'::text, n::text, n = 0;

  set local role authenticated; perform set_config('request.jwt.claims', jwt_zé, true);
  select count(*) into n from equipes;
  reset role;
  return query select 'estranho autenticado'::text, 'não vê ministério nenhum'::text,
    '0'::text, n::text, n = 0;

  set local role authenticated; perform set_config('request.jwt.claims', jwt_zé, true);
  select count(*) into n from lideres;
  reset role;
  return query select 'estranho autenticado'::text, 'não vê a lista de organizadores'::text,
    '0'::text, n::text, n = 0;

  -- =====================================================================
  -- ANON — a porta pública. Só as funções SECURITY DEFINER podem falar.
  -- =====================================================================
  /* depois da 18 o anon nem GRANT tem: a resposta certa é "permission denied",
     que é mais forte que "0 linhas" — a tabela não está vazia, está fechada. */
  begin
    set local role anon;
    select count(*) into n from voluntarios;
    reset role; ok := false; erro := 'leu ' || n || ' linha(s)';
  exception when insufficient_privilege then
    reset role; ok := true; erro := 'permission denied';
  end;
  return query select 'anon'::text, 'tabela de voluntários fechada'::text,
    'permission denied'::text, erro, ok;

  begin
    set local role anon;
    select count(*) into n from escalacoes;
    reset role; ok := (n = 0); erro := n || ' linha(s)';
  exception when insufficient_privilege then
    reset role; ok := true; erro := 'permission denied';
  end;
  return query select 'anon'::text, 'tabela de escalações fechada'::text,
    'nada visível'::text, erro, ok;

  /* mas a lista pública da equipe TEM que funcionar, senão ninguém se cadastra */
  set local role anon;
  select count(*) into n from equipe_publica('louvor');
  reset role;
  return query select 'anon'::text, 'lista pública do Louvor abre'::text,
    '12'::text, n::text, n = 12;

  -- =====================================================================
  -- RLS ligado em toda tabela: policy sem RLS é decoração
  -- =====================================================================
  select count(*) into n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  return query select 'estrutura'::text, 'nenhuma tabela sem RLS'::text,
    '0'::text, n::text, n = 0;

  /* FOR ALL junta leitura e escrita no mesmo teste. Enquanto forem muitas, a
     matriz não consegue expressar "lê aqui, escreve ali" — é o que trava o
     papel por módulo da Fase 3. Não é furo hoje; é dívida medida. */
  select count(*) into n from pg_policy where polcmd = '*';
  return query select 'estrutura'::text, 'policies FOR ALL (dívida da Fase 3)'::text,
    'medindo'::text, n::text, true;
end $fn$;

revoke all on function testar_permissoes() from public, anon, authenticated;

comment on function testar_permissoes() is
  'matriz de permissão viva. select * from testar_permissoes() — toda linha com passou=false é um furo. Rodar depois de QUALQUER mexida em policy.';

----------------------------------------------------------------------------
select grupo, caso, esperado, obtido, passou from testar_permissoes();

/* ---------------------------------------------------------------------------
   FURO ACHADO PELO PRÓPRIO TESTE, na primeira execução (26/08)

   `eq_lideres_ler` estava assim:

       lidera_tudo() OR (equipe_id IS NULL) OR lidera_equipe(equipe_id)

   O termo do meio não tem sujeito. `equipe_id IS NULL` é propriedade da LINHA,
   não de quem consulta — então toda linha de organizador global ficava visível
   para QUALQUER autenticado. E o cadastro do app é aberto: bastava criar conta
   com um email qualquer para ler quem administra o sistema e qual ministério
   cada um comanda.

   A intenção ("organizador global vê linha global") já está no primeiro termo.
   O do meio era só o bug.

   Conferido depois da troca: Arthur (global) vê 4, Jander (escopado) vê 1,
   estranho vê 0. A tela de Ajustes continua funcionando para os dois primeiros.
--------------------------------------------------------------------------- */
drop policy if exists eq_lideres_ler on lideres;
create policy eq_lideres_ler on lideres for select to authenticated
  using (lidera_tudo() or lidera_equipe(equipe_id));
