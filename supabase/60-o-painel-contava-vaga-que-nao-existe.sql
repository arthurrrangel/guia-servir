/* =============================================================================
   60 · O PAINEL CONTAVA VAGA QUE NÃO EXISTE

   20/09/2026. Só de Escalas.

   Quatro achados da auditoria de arquitetura de hoje. Os dois primeiros já
   estão cobrando todo sábado.

   -------------------------------------------------------------------------
   1 · `visao_geral()` CONTA POSTO QUE O CULTO NÃO TEM

   A 09 tirou HEAD, TRANSMISSÃO, CÂMERA 1 e CÂMERA 2 do Follow. A 53 deu a
   `funcoes.tipos` o poder de dizer em que culto cada posto existe. O motor
   obedece: `funcoesDoDia` e `vagasDe`, em `lib/engine.ts`, filtram por tipo.

   `visao_geral()` obedece PELA METADE. A subconsulta `prox` já filtra por
   tipo (foi escrita assim desde a 35). A contagem de `postos`, dez linhas
   abaixo, não:

       (select count(*)::int from funcoes f
         where f.equipe_id = m.id and f.ativa)   as postos

   E `vagas` é `postos - preenchidos`. Então, num sábado de Follow, uma
   equipe com 9 postos ativos dos quais 4 valem no Follow aparece no painel
   com "5 sem ninguém", em vermelho, com o Follow 100% montado. O inverso
   também: equipe com posto `tipos = {follow}` mostra uma vaga fantasma todo
   domingo. E `app/painel/page.tsx` soma essas linhas para o cabeçalho ("N
   áreas precisam de gente"), então o número do topo mente junto.

   A correção é repetir aqui o filtro que `prox` já usa. A expressão fica
   escrita duas vezes no mesmo arquivo, e é de propósito: SQL não tem onde
   guardar isso sem criar uma função nova só para ela, e duas cópias a dez
   linhas de distância, com a conferência abaixo cobrando as duas, custa
   menos que uma indireção.

   -------------------------------------------------------------------------
   2 · UM EVENTO DE QUALQUER MINISTÉRIO VIRA "O PRÓXIMO CULTO" DE TODOS

   A 54 pôs eventos esporádicos dentro de `cultos`, com `evento` preenchido e
   `equipe_id` do dono. `prox` procura assim:

       select c.data from cultos c where c.data >= current_date and exists (...)

   Sem `c.evento is null`. Sem olhar `c.equipe_id`. E `visao_geral()` é
   `security definer`, então a RLS de `cultos_ler` — que separa por
   `lidera_equipe(equipe_id)` — não se aplica.

   O Connect marca um evento numa quinta. A partir daquele instante, TODAS as
   áreas do painel passam a apontar aquela quinta como "o próximo culto",
   classificada como 'domingo' (porque dow ≠ 6), com `preenchidos = 0` e
   portanto todos os postos em vermelho. O bloco "O domingo da igreja" some,
   porque `umaSoData` passa a valer para a data errada. O painel inteiro grita
   por causa de um evento de outro ministério.

   Aqui a decisão é de produto e está escrita: o painel de visão geral é sobre
   o CULTO REGULAR da equipe. Evento entra se for da própria equipe; evento de
   outro ministério não entra nunca.

   -------------------------------------------------------------------------
   3 · A RÉGUA SÓ TRANCA PARA TRÁS

   `exige_versao_ate(p_n)` pergunta "este arquivo é velho demais?" e nunca
   "este banco está pronto para este arquivo?". Rodar a 59 num banco na 20:
   `20 > 59` é falso, passa. Rodar a 57 num banco na 30: passa. A régua não
   impede aplicar fora de ordem PARA FRENTE, que é o caso mais comum num banco
   novo ou num ambiente de teste que ficou para trás — e é o que produz aquele
   erro de `relation ... does not exist` que ninguém relaciona à ordem.

   A guarda nova é uma linha: se o banco está mais de um degrau atrás deste
   arquivo, recusa e diz quantos faltam.

   Ela passa a valer para os arquivos 61 em diante, porque a 60 ainda é
   conferida pela versão antiga da função. É o preço de a régua morar no
   próprio banco, e é aceitável.

   -------------------------------------------------------------------------
   4 · DOIS TESTES QUE DESCREVIAM O DADO DE AGOSTO

   `testar_permissoes()` tem dois `n = 12` escritos à mão: quantas pessoas o
   organizador do Louvor enxerga, e quantos nomes `equipe_publica('louvor')`
   devolve. Doze era o tamanho do Louvor no dia em que a 34 foi escrita. Hoje
   o Louvor tem outro tamanho e os dois casos reprovam sem que nada de errado
   tenha acontecido — o que é pior que não testar, porque ensina a ignorar
   vermelho na saída.

   O que esses casos querem provar não é "doze": é que a RLS não esconde nem
   inventa ninguém. Então o esperado passa a ser CONTADO da própria tabela, e
   o caso compara o que o organizador vê com o que existe.

   `testar_identidade()` tem um caso vazio: compara organizadores com
   identidade contra o total de linhas em `papeis`, com `>=`. Como `papeis`
   tem admin e líder juntos, `>=` é quase sempre verdadeiro; apagar metade dos
   papéis continuaria passando. Vira uma comparação pessoa a pessoa.

   ORDEM:  ... 58 → 59 → 60
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(60);
  end if;
end $tranca$;


-- =========================================================================
-- 1 e 2 · `visao_geral()` passa a contar o culto que a equipe realmente tem
-- =========================================================================

create or replace function visao_geral()
returns table (
  slug text, equipe text, ordem int,
  proxima_data date, tipo text,
  postos int, preenchidos int, confirmados int,
  vagas int, furos int, recusados int, pendentes int,
  candidaturas_novas int
)
language sql security definer stable set search_path = public as $fn$
  with minhas as (
    select e.id, e.slug, e.nome, coalesce(e.ordem, 99) as ordem
      from equipes e
     where lidera_equipe(e.id)          -- a guarda: mesma regra da RLS
  ),
  /* o próximo culto de cada equipe. Não é "o próximo domingo": o Follow é no
     sábado e algumas áreas não entram nele, então a data certa é a do próximo
     culto em que ESTA equipe tem posto ativo.

     `c.evento is null or c.equipe_id = m.id` (60): a 54 pôs eventos
     esporádicos de todo mundo dentro de `cultos`, e esta função é DEFINER,
     logo a RLS que separa por equipe não a alcança. Sem esta linha, um evento
     do Connect numa quinta virava "o próximo culto" de todas as áreas da
     igreja, com todos os postos em vermelho. */
  prox as (
    select m.id,
           (select c.data from cultos c
             where c.data >= current_date
               and (c.evento is null or c.equipe_id = m.id)
               and exists (select 1 from funcoes f
                            where f.equipe_id = m.id and f.ativa
                              and (f.tipos is null or array_length(f.tipos,1) is null
                                   or (case when extract(dow from c.data) = 6
                                            then 'follow' else 'domingo' end) = any(f.tipos)))
             order by c.data limit 1) as data
      from minhas m
  ),
  /* POSTOS DO PRÓXIMO CULTO, e não postos da equipe (60).
     Mesmo filtro de tipo que `prox` usa dez linhas acima. Sem ele, o sábado
     de Follow contava HEAD, TRANSMISSÃO e as duas câmeras, que a 09 tirou do
     Follow, e o painel acusava cinco vagas num culto cheio. */
  conta as (
    select m.id,
           (select count(*)::int from funcoes f
             where f.equipe_id = m.id and f.ativa
               and (p.data is null
                    or f.tipos is null or array_length(f.tipos,1) is null
                    or (case when extract(dow from p.data) = 6
                             then 'follow' else 'domingo' end) = any(f.tipos))) as postos
      from minhas m left join prox p on p.id = m.id
  )
  select m.slug, m.nome, m.ordem,
         p.data,
         (case when p.data is null then null
               when extract(dow from p.data) = 6 then 'follow' else 'domingo' end)::text,
         q.postos,
         coalesce(x.preenchidos, 0)::int,
         coalesce(x.confirmados, 0)::int,
         /* vaga = posto ativo sem ninguém. É o número que decide se o culto
            acontece; tudo o mais é acabamento.

            NULO quando não há próximo culto marcado, e isso importa: sem esta
            distinção a área aparecia com "1 vaga" quando na verdade não há
            culto nenhum para preencher. Zero vagas e nenhum culto são estados
            diferentes e a tela precisa dizer coisas diferentes. */
         (case when p.data is null then null
               else greatest(q.postos - coalesce(x.preenchidos,0), 0) end)::int as vagas,
         coalesce(x.furos, 0)::int,
         coalesce(x.recusados, 0)::int,
         coalesce(x.pendentes, 0)::int,
         (select count(*)::int from candidaturas c
           where c.equipe_id = m.id and c.status = 'enviada')                   as candidaturas_novas
    from minhas m
    left join prox p on p.id = m.id
    join conta q on q.id = m.id
    left join lateral (
      select count(*) filter (where e.voluntario_id is not null)              as preenchidos,
             count(*) filter (where e.status = 'confirmado')                  as confirmados,
             count(*) filter (where e.status = 'furou')                       as furos,
             count(*) filter (where e.status = 'recusado')                    as recusados,
             count(*) filter (where coalesce(e.status::text,'pendente') = 'pendente') as pendentes
        from escalacoes e
        join funcoes f on f.id = e.funcao_id
        join cultos  c on c.id = e.culto_id
       where f.equipe_id = m.id and c.data = p.data
    ) x on true
   order by m.ordem, m.nome;
$fn$;

revoke all on function visao_geral() from public, anon;
grant execute on function visao_geral() to authenticated;
comment on function visao_geral() is
  'estado do proximo culto de cada equipe que o chamador organiza, numa consulta so. Filtrada por lidera_equipe() dentro do where. Desde a 60: `postos` conta so o que vale NAQUELE culto (funcoes.tipos), e evento esporadico de outra equipe nao vira o proximo culto desta.';


-- =========================================================================
-- 4 · um índice que a 54 tirou sem querer
--
-- A 54 trocou o unique completo de `cultos(data)` por um PARCIAL
-- (`where evento is null`). O parcial serve ao unique, mas não serve a quem
-- filtra sem dizer `evento is null` — que são os dois consumidores reais:
-- `lib/ponte.ts` (a janela de 200 dias, em toda carga de tela) e `lib/db.ts`
-- (o `select id from cultos where data = ?`, uma vez por dia gravado).
--
-- Hoje custa nada: `cultos` tem algumas centenas de linhas e varredura nisso
-- é ruído. Está aqui porque é uma linha e porque a tabela só cresce.
-- =========================================================================

create index if not exists ix_cultos_data on cultos (data);


-- =========================================================================
-- 3 · a régua passa a trancar nos DOIS sentidos
-- =========================================================================

create or replace function public.exige_versao_ate(p_n int)
returns void language plpgsql as $fn$
declare v_max int;
begin
  select max(n) into v_max from schema_versao;
  if v_max is null then return; end if;

  if v_max > p_n then
    raise exception E'MIGRACAO SUPERADA: este arquivo e da versao %, e o banco ja esta na %.\n'
      '  Reaplicar aqui GRAVA a versao antiga por cima da nova, em silencio.\n'
      '  Medido em 19/09: reaplicar a 23, a 31 ou a 43 desfaz a 51 e `candidatar` volta a entregar token de terceiro.\n'
      '  Se voce REALMENTE quer, apague a linha da regua: delete from schema_versao where n > %;',
      p_n, v_max, p_n
      using errcode = 'raise_exception';
  end if;

  /* A GUARDA QUE FALTAVA (60). A régua respondia "este arquivo é velho
     demais?" e nunca "este banco está pronto para este arquivo?". Pular
     migração para frente produz `relation ... does not exist` num ponto
     qualquer do arquivo, e ninguém relaciona isso à ordem. */
  if v_max < p_n - 1 then
    raise exception E'FORA DE ORDEM: este arquivo e a %, e o banco so chegou na %.\n'
      '  Faltam % migracoes no meio. Aplique-as em ordem antes desta.\n'
      '  Pular para frente nao da erro limpo: da `relation ... does not exist` no meio do arquivo.',
      p_n, v_max, p_n - 1 - v_max
      using errcode = 'raise_exception';
  end if;
end $fn$;
revoke all on function public.exige_versao_ate(int) from public, anon, authenticated;

comment on function public.exige_versao_ate(int) is
  'Tranca de migracao, nos dois sentidos: recusa rodar num banco mais NOVO (create or replace desfaz correcao) e num banco atrasado demais (pular migracao nao da erro limpo).';


-- =========================================================================
-- 5 · os testes param de descrever o dado de agosto
-- =========================================================================

create or replace function testar_permissoes()
returns table (grupo text, caso text, esperado text, obtido text, passou boolean)
language plpgsql security invoker set search_path = public as $fn$
declare
  v_louvor uuid; v_midia uuid; v_servico uuid;
  n bigint; m bigint; mm bigint; ok boolean; erro text; txt text;
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

  set local role anon; select count(*) into n from perguntas_publicas('louvor'); reset role;
  return query select 'visitante'::text, 'formulário do Louvor abre'::text,
    '6'::text, n::text, n = 6;

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

  select count(*) into n from pg_policy where polcmd = '*';
  return query select 'estrutura'::text, 'policies FOR ALL no total (dívida)'::text,
    'medindo'::text, n::text, true;

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
end $fn$;

revoke all on function testar_permissoes() from public, anon, authenticated;

/* CONFERÊNCIA
     select * from testar_permissoes() where not passou;   -- tem que vir vazio
     select * from testar_identidade() where not passou;   -- idem
*/


revoke all on function testar_permissoes() from public, anon;
comment on function testar_permissoes() is
  'Matriz de permissao, conferida contra o banco. Desde a 60 os esperados sao CONTADOS da propria tabela: numero escrito a mao descrevia o dado do dia em que o teste nasceu e reprovava sozinho quando a igreja crescia.';


create or replace function testar_identidade()
returns table (caso text, esperado text, obtido text, passou boolean)
language plpgsql security invoker set search_path = public as $fn$
declare n int; m int; v_eq uuid;
begin
  -- 1. todo organizador virou pessoa
  select count(*) into n from lideres where pessoa_id is null and email <> '';
  return query select 'organizador sem identidade'::text, '0'::text, n::text, n = 0;

  /* 2. TODO ORGANIZADOR VIROU PAPEL, PESSOA A PESSOA (60).
     Estava assim:
         n := count(lideres com pessoa_id);   m := count(*) from papeis;
         passou := m >= n
     `papeis` tem admin e líder juntos, então `>=` era quase sempre verdade:
     dá para apagar metade dos papéis e o caso continua passando. O que
     importa é que NENHUM organizador tenha ficado sem papel, e isso é uma
     conta por pessoa, não um total contra um total. */
  select count(*) into n from lideres l
   where l.pessoa_id is not null
     and not exists (select 1 from papeis x where x.pessoa_id = l.pessoa_id);
  return query select 'organizador com identidade e sem papel'::text, '0'::text, n::text, n = 0;

  -- 3. admin continua admin, líder continua líder
  select count(*) into n from lideres where equipe_id is null and pessoa_id is not null;
  select count(*) into m from papeis where papel = 'admin';
  return query select 'quantidade de admins bate'::text, n::text, m::text, n = m;

  select count(*) into n from lideres where equipe_id is not null and pessoa_id is not null;
  select count(*) into m from papeis where papel = 'lider';
  return query select 'quantidade de lideres de equipe bate'::text, n::text, m::text, n = m;

  -- 4. A PROVA PRINCIPAL: para cada equipe e cada organizador, o acesso pelo
  --    caminho novo é o mesmo do caminho antigo. Zero divergências.
  select count(*) into n from (
    select l.email, e.id as eq,
           (l.equipe_id is null or l.equipe_id = e.id) as antigo,
           exists (select 1 from papeis x join pessoas p on p.id = x.pessoa_id
                    where lower(p.auth_email) = lower(l.email)
                      and (x.papel = 'admin' or (x.papel = 'lider' and x.equipe_id = e.id))) as novo
      from lideres l cross join equipes e
     where l.email <> ''
  ) d where antigo is distinct from novo;
  return query select 'acesso novo diverge do antigo'::text, '0'::text, n::text, n = 0;

  /* 5. a constraint de escopo funciona.

     Os dois blocos abaixo tentam gravar uma linha inválida de propósito. Se a
     constraint estiver certa, ela recusa e nada é gravado. Se estiver errada,
     a linha entraria, e um teste que suja o banco que ele deveria proteger é
     pior que teste nenhum. Por isso, quando o insert PASSA, o bloco levanta
     uma exceção na sequência para desfazer o próprio estrago: o resultado do
     teste vem do código do erro, não de ter chegado ao fim. */
  begin
    insert into papeis (pessoa_id, papel, equipe_id)
    select id, 'admin', (select id from equipes limit 1) from pessoas limit 1;
    raise exception 'desfazendo' using errcode = 'triggered_action_exception';
  exception
    when check_violation then
      return query select 'admin com equipe e recusado'::text, 'recusado'::text, 'recusado'::text, true;
    when triggered_action_exception then
      return query select 'admin com equipe e recusado'::text, 'recusado'::text, 'ACEITOU'::text, false;
  end;

  begin
    insert into papeis (pessoa_id, papel, equipe_id) select id, 'lider', null from pessoas limit 1;
    raise exception 'desfazendo' using errcode = 'triggered_action_exception';
  exception
    when check_violation then
      return query select 'lider sem equipe e recusado'::text, 'recusado'::text, 'recusado'::text, true;
    when triggered_action_exception then
      return query select 'lider sem equipe e recusado'::text, 'recusado'::text, 'ACEITOU'::text, false;
  end;

  -- 6. quem_sou responde as duas portas
  select count(*) into n from voluntarios where ativo and token is not null;
  if n > 0 then
    return query
      select 'quem_sou pelo token do voluntario'::text, 'true'::text,
             (quem_sou((select token from voluntarios where ativo and token is not null
                         order by criado_em limit 1)) ->> 'ok'),
             (quem_sou((select token from voluntarios where ativo and token is not null
                         order by criado_em limit 1)) ->> 'ok') = 'true';
  end if;

  return query select 'quem_sou com token invalido'::text, 'LINK_INVALIDO'::text,
    coalesce(quem_sou('nao-existe-esse-token') ->> 'erro', '?'),
    coalesce(quem_sou('nao-existe-esse-token') ->> 'erro', '?') = 'LINK_INVALIDO';

  -- 7. meu_link exige credencial e nao vaza de terceiro
  perform set_config('request.jwt.claims', '', true);
  return query select 'meu_link sem login e recusado'::text, 'SEM_CREDENCIAL'::text,
    coalesce(meu_link() ->> 'erro', '?'),
    coalesce(meu_link() ->> 'erro', '?') = 'SEM_CREDENCIAL';

  perform set_config('request.jwt.claims',
    (select json_build_object('email', p.auth_email)::text from pessoas p
      join voluntarios v on v.pessoa_id = p.id
     where p.auth_email is not null and v.ativo limit 1), true);
  return query select 'meu_link devolve o proprio vinculo'::text, 'true'::text,
    (meu_link() ->> 'ok'), (meu_link() ->> 'ok') = 'true'
   where exists (select 1 from pessoas p join voluntarios v on v.pessoa_id = p.id
                  where p.auth_email is not null and v.ativo);
  perform set_config('request.jwt.claims', '', true);

  -- 8. papeis nao e legivel pelo anonimo
  return query select 'papeis fechada para anon'::text, 'sem grant'::text,
    case when has_table_privilege('anon', 'papeis', 'select') then 'TEM GRANT' else 'sem grant' end,
    not has_table_privilege('anon', 'papeis', 'select');
end $fn$;

revoke all on function testar_identidade() from public, anon, authenticated;
comment on function testar_identidade() is
  'prova que a migração 33 não mudou o dono de nada. O caso 4 é o que importa: acesso pelo caminho novo tem que ser idêntico ao do antigo, para toda combinação de organizador e equipe.';


/* =============================================================================
   CONFERÊNCIA
     select * from testar_identidade();     -- tem que ser tudo passou = true
     select * from testar_permissoes();     -- a matriz antiga continua valendo
     select quem_sou('<token de alguem>');  -- a resposta única

   ROLLBACK
     §5  recriar lidera_equipe, sou_lider e lidera_tudo com os corpos de
         13-organizador-por-ministerio.sql e 18-fechar-furos.sql. Como a
         mudança é aditiva, desfazer só remove o caminho novo.
     §4  drop function quem_sou(text);
     §2  drop table papeis; drop type papel_organizacional;
     §1  alter table pessoas drop column auth_email;
         (o NOT NULL de telefone NÃO deve voltar: haveria linhas sem telefone)
     §3  o backfill não precisa ser desfeito; ele só preencheu buraco.
   ============================================================================= */


revoke all on function testar_identidade() from public, anon;


-- =========================================================================
-- REGISTRO NA RÉGUA E NA SONDA
-- =========================================================================

do $reg$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (60, '60 · visao_geral conta posto por tipo de culto', 'visao_geral', 'conta as'),
      (60, '60 · visao_geral ignora evento de outra equipe', 'visao_geral', 'c.evento is null or c.equipe_id'),
      (60, '60 · a regua tranca fora de ordem para frente', 'exige_versao_ate', 'FORA DE ORDEM')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;

  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo) values (60, '60-o-painel-contava-vaga-que-nao-existe.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;


-- =========================================================================
-- A CONFERÊNCIA
--
-- Monta um sábado de Follow e um evento de outra equipe, DE VERDADE, e
-- pergunta ao painel o que ele responde. Catálogo não serve aqui: a 52 já
-- disse que estava tudo certo lendo catálogo, e estava errado.
-- =========================================================================

do $conf$
declare
  v_eq uuid; v_outra uuid; v_p uuid; v_tel text;
  v_fn_dom uuid; v_fn_amb uuid;
  v_sab date; v_qui date;
  r record; v_n int;
  ok int := 0; falhou int := 0; msg text := '';
begin
  if to_regclass('public.visao_geral') is null and to_regprocedure('public.visao_geral()') is null then
    raise notice 'PULEI a conferencia da 60: base sem visao_geral().'; return;
  end if;

  v_tel := '21' || lpad((floor(random()*900000000)+100000000)::text, 9, '0');
  if exists (select 1 from pessoas where telefone = v_tel)
     or exists (select 1 from pessoas where lower(auth_email) = 'conf60@teste.local') then
    raise exception 'A conferencia da 60 sorteou um telefone que ja existe, ou conf60@teste.local ja esta no banco. Nao escrevi nada.'
      using errcode = 'raise_exception';
  end if;

  /* um sábado de Follow e uma quinta, os dois no futuro */
  select min(d)::date into v_sab from generate_series(current_date + 1, current_date + 40, '1 day') d
   where extract(dow from d) = 6 and extract(day from d) > 7;
  select min(d)::date into v_qui from generate_series(current_date + 1, v_sab - 1, '1 day') d
   where extract(dow from d) = 4;
  if v_sab is null or v_qui is null then
    raise notice 'PULEI a conferencia da 60: nao achei sabado de Follow e quinta na janela.'; return;
  end if;

  insert into equipes (slug, nome) values ('conf60','Conferencia 60') on conflict (slug) do nothing;
  insert into equipes (slug, nome) values ('conf60b','Conferencia 60 outra') on conflict (slug) do nothing;
  select id into v_eq    from equipes where slug = 'conf60';
  select id into v_outra from equipes where slug = 'conf60b';

  /* dois postos: um só de domingo, um dos dois tipos. No sábado, só um vale. */
  insert into funcoes (equipe_id, nome, simultanea, ordem, ativa, tipos)
       values (v_eq, 'SO DOMINGO 60', true, 960, true, array['domingo'])
    on conflict do nothing;
  insert into funcoes (equipe_id, nome, simultanea, ordem, ativa, tipos)
       values (v_eq, 'OS DOIS 60', true, 961, true, array['domingo','follow'])
    on conflict do nothing;
  select id into v_fn_dom from funcoes where equipe_id = v_eq and nome = 'SO DOMINGO 60';
  select id into v_fn_amb from funcoes where equipe_id = v_eq and nome = 'OS DOIS 60';

  insert into pessoas (nome, telefone, auth_email)
       values ('Lider Conf 60', v_tel, 'conf60@teste.local') returning id into v_p;
  insert into papeis (pessoa_id, equipe_id, papel) values (v_p, v_eq, 'lider') on conflict do nothing;

  /* o sábado de Follow, como culto regular */
  insert into cultos (data) values (v_sab) on conflict do nothing;

  /* ---- 1. no Follow, o painel conta SÓ o posto que vale nele ----------- */
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf60@teste.local","role":"authenticated"}', true);
    select * into r from visao_geral() g where g.slug = 'conf60';
    reset role;
    if r.proxima_data = v_sab and r.tipo = 'follow' and r.postos = 1 and r.vagas = 1 then
      ok := ok + 1;
    else
      falhou := falhou + 1;
      msg := msg || E'\n  x no Follow o painel contou ' || coalesce(r.postos::text,'?')
           || ' posto(s) e ' || coalesce(r.vagas::text,'?') || ' vaga(s); esperava 1 e 1.'
           || ' (culto=' || coalesce(r.proxima_data::text,'null') || ' tipo=' || coalesce(r.tipo,'null') || ')';
    end if;
  exception when others then
    reset role; falhou := falhou + 1;
    msg := msg || E'\n  x o caso do Follow EXPLODIU: ' || sqlerrm;
  end;

  /* ---- 2. evento de OUTRA equipe não vira o próximo culto desta -------- */
  insert into cultos (data, evento, equipe_id) values (v_qui, 'Evento da outra 60', v_outra)
    on conflict do nothing;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf60@teste.local","role":"authenticated"}', true);
    select * into r from visao_geral() g where g.slug = 'conf60';
    reset role;
    if r.proxima_data = v_sab then ok := ok + 1;
    else
      falhou := falhou + 1;
      msg := msg || E'\n  x um evento de outra equipe virou o proximo culto desta: '
           || coalesce(r.proxima_data::text,'null') || ' (esperava ' || v_sab::text || ')';
    end if;
  exception when others then
    reset role; falhou := falhou + 1;
    msg := msg || E'\n  x o caso do evento EXPLODIU: ' || sqlerrm;
  end;

  /* ---- 3. ... mas o evento DA PRÓPRIA equipe vira ---------------------- */
  update cultos set equipe_id = v_eq where data = v_qui and evento = 'Evento da outra 60';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf60@teste.local","role":"authenticated"}', true);
    select * into r from visao_geral() g where g.slug = 'conf60';
    reset role;
    if r.proxima_data = v_qui then ok := ok + 1;
    else
      falhou := falhou + 1;
      msg := msg || E'\n  x o evento DA PROPRIA equipe nao entrou: '
           || coalesce(r.proxima_data::text,'null') || ' (esperava ' || v_qui::text || ')';
    end if;
  exception when others then
    reset role; falhou := falhou + 1;
    msg := msg || E'\n  x o caso do evento proprio EXPLODIU: ' || sqlerrm;
  end;

  /* ---- 4. a régua recusa pular migração para frente -------------------- */
  begin
    select max(sv.n) into v_n from schema_versao sv;
    begin
      perform public.exige_versao_ate(v_n + 5);
      falhou := falhou + 1;
      msg := msg || E'\n  x a regua aceitou um arquivo 5 versoes a frente do banco';
    exception when others then
      if sqlerrm like 'FORA DE ORDEM%' then ok := ok + 1;
      else
        falhou := falhou + 1;
        msg := msg || E'\n  x a regua recusou pelo motivo errado: ' || sqlerrm;
      end if;
    end;
    /* e o degrau seguinte continua passando, senão nada mais aplica */
    begin
      perform public.exige_versao_ate(v_n + 1);
      ok := ok + 1;
    exception when others then
      falhou := falhou + 1;
      msg := msg || E'\n  x a regua recusou a PROXIMA migracao, que tem que passar: ' || sqlerrm;
    end;
  end;

  /* ---- limpeza: tudo que este bloco criou, por id --------------------- */
  delete from escalacoes where funcao_id in (v_fn_dom, v_fn_amb);
  delete from funcoes where equipe_id in (v_eq, v_outra);
  delete from cultos where data = v_qui and evento = 'Evento da outra 60';
  delete from papeis where pessoa_id = v_p;
  delete from pessoas where id = v_p;
  delete from equipes where id in (v_eq, v_outra);
  /* o sábado de Follow fica: é culto regular e pode já existir por direito */

  if falhou > 0 then
    raise exception 'A CONFERENCIA DA 60 REPROVOU: % de % casos', falhou, ok + falhou
      using detail = msg, errcode = 'raise_exception';
  end if;
  raise notice '60 · conferencia: %/% casos. O painel conta posto por tipo de culto, evento de outra equipe nao vira o proximo culto, e a regua tranca fora de ordem nos dois sentidos.', ok, ok;
end $conf$;


/* =============================================================================
   CONFERÊNCIA À MÃO, depois de aplicar

     select * from testar_permissoes() where not passou;   -- 0 linhas
     select * from testar_identidade()  where not passou;  -- 0 linhas
     select * from schema_versao_conferir() where not passou;
     select max(n) from schema_versao;                     -- 60

   ROLLBACK
     Não há. `visao_geral()` volta ao corpo da 35 se for preciso (o arquivo
     está no repositório), e `ix_cultos_data` sai com `drop index`. A régua
     nova é mais restritiva que a antiga: desfazê-la é copiar o corpo da 55.
   ============================================================================= */
