/* =============================================================================
   18 — FASE 0: fechar os três furos achados na auditoria de 26/08

   Nenhum destes é hipótese: os três foram confirmados por consulta direta ao
   banco de produção antes de escrever esta migração.
   ============================================================================= */

-- =========================================================================
-- FURO 1 — o organizador lê o `pin_hash` do time inteiro
--
-- `eq_voluntarios` é FOR ALL, e FOR ALL inclui SELECT. O organizador recebia a
-- linha inteira, com `token` E `pin_hash`. Como o PIN é sha256(pin || token),
-- ter o hash e o sal juntos é ter o PIN: são 10.000 tentativas, microssegundos.
--
-- Isso vaza um segredo que a PESSOA escolheu e provavelmente reusa fora daqui.
-- É de outra categoria do que o organizador poder abrir a escala dela.
--
-- RLS no Postgres não filtra coluna. Quem filtra é o GRANT por coluna.
--
-- O `token` FICA acessível, e isso é decisão consciente: `montarLinks()` em
-- lib/engine.ts monta a mensagem de WhatsApp com /eu/<token>, que é como o
-- organizador manda o link pessoal de quem esqueceu o PIN — exatamente o que
-- resolveu o caso da Lana hoje. Tirar o token sem mover essa função para o
-- servidor quebraria o recurso. Fica registrado como risco aceito.
-- =========================================================================

revoke select, update on voluntarios from authenticated;

grant select (id, nome, telefone, ativo, limite_mes, token, criado_em,
              equipe_id, conferido, email)
   on voluntarios to authenticated;

grant update (nome, telefone, ativo, limite_mes, conferido, email)
   on voluntarios to authenticated;

/* anon nunca precisou: tudo que é público passa por função SECURITY DEFINER
   (equipe_publica, equipe_time, inscrever, eu_*). */
revoke select, update on voluntarios from anon;

comment on column voluntarios.pin_hash is
  'sha256(pin || token). Fora do GRANT de authenticated desde a 18: com o token junto, o hash entrega o PIN.';


-- =========================================================================
-- FURO 2 — qualquer organizador apaga culto de qualquer ministério
--
-- `cultos` é global e tinha UMA policy: `lider_tudo_cultos`, FOR ALL, com
-- is_lider() — "é organizador de alguma coisa". Sobrou da migração 01 e não foi
-- trocada quando o escopo por ministério entrou na 13.
--
-- Resultado: o Jander, preso ao Louvor em todo o resto, podia apagar o domingo
-- 30/08 e derrubar em cascata as 9 escalações da Mídia.
--
-- O calendário é compartilhado de propósito — todo ministério serve nos mesmos
-- domingos — então ler, criar e editar continua liberado para qualquer
-- organizador. O que muda é APAGAR: só quem enxerga todos os ministérios.
-- Destruição em cascata não pode caber em papel de escopo único.
-- =========================================================================

drop policy if exists lider_tudo_cultos on cultos;

create policy cultos_ler    on cultos for select to authenticated using (sou_lider());
create policy cultos_criar  on cultos for insert to authenticated with check (sou_lider());
create policy cultos_editar on cultos for update to authenticated
  using (sou_lider()) with check (sou_lider());
create policy cultos_apagar on cultos for delete to authenticated using (lidera_tudo());


-- =========================================================================
-- FURO 3 — a proteção de dupla escalação entre ministérios não existe
--
-- Eu afirmei duas vezes hoje que ela existia. Não existe: foi removida em 06/08
-- porque abortava o save do segundo ministério dentro do cron.
-- `fn_conflito_simultaneo` casa por voluntario_id, e a mesma pessoa em dois
-- ministérios são DOIS registros. Julia Baldez e Filipe Oliveira Bernardo estão
-- na Mídia e no Louvor com o mesmo telefone, e nada os impede de cair nas duas
-- escalas no mesmo domingo.
--
-- Não volto como gatilho: gatilho que aborta foi o motivo da remoção, e
-- derrubar o cron do mês inteiro é pior que a dupla escalação.
-- Volta como CONSULTA: o organizador vê o conflito e decide. Bloquear é do
-- humano; enxergar é do sistema.
-- =========================================================================

create or replace function conflitos_entre_ministerios(p_de date default current_date)
returns table (
  data date, telefone text, pessoa text,
  ministerios text, postos text
)
language sql security definer stable set search_path = public as $fn$
  select c.data,
         tel_norm(v.telefone) as telefone,
         min(v.nome) as pessoa,
         string_agg(distinct e.nome, ' + ' order by e.nome) as ministerios,
         string_agg(e.nome || ': ' || f.nome, ' | ' order by e.nome, f.nome) as postos
    from escalacoes x
    join cultos      c on c.id = x.culto_id
    join voluntarios v on v.id = x.voluntario_id
    join funcoes     f on f.id = x.funcao_id
    join equipes     e on e.id = f.equipe_id
   where c.data >= p_de
     and coalesce(length(tel_norm(v.telefone)), 0) >= 10
     and x.status <> 'recusado'
   group by c.data, tel_norm(v.telefone)
  having count(distinct f.equipe_id) > 1
   order by c.data, 3;
$fn$;

revoke all on function conflitos_entre_ministerios(date) from public, anon;
grant execute on function conflitos_entre_ministerios(date) to authenticated;

comment on function conflitos_entre_ministerios(date) is
  'quem está escalado em MAIS DE UM ministério no mesmo dia, casado por telefone. Não bloqueia nada: mostra. O gatilho que bloqueava foi removido em 06/08 por derrubar o cron.';


-- =========================================================================
-- CORREÇÃO DE ROTA — o tipo `evento` que eu inventei hoje não pode existir
--
-- Marquei as 11 funções do Louvor como válidas para 'evento', pensando na
-- cantata e no Coral. Mas `cultos.tipo` é COLUNA GERADA:
--     case when extract(dow from data) = 6 then 'follow' else 'domingo' end
-- Só existem dois tipos possíveis. Nenhum culto jamais terá tipo 'evento',
-- então esse valor no array é lixo que nunca casa — e pior, dá a impressão de
-- que o Coral está contemplado quando não está.
--
-- Tiro agora. Eventos voltam quando o calendário sair do código (Fase 4).
-- =========================================================================

update funcoes
   set tipos = array_remove(tipos, 'evento')
 where equipe_id = (select id from equipes where slug = 'louvor')
   and 'evento' = any(tipos);


----------------------------------------------------------------------------
-- CONFERÊNCIA
select
  (select count(*) from information_schema.column_privileges
    where table_name='voluntarios' and grantee='authenticated'
      and column_name='pin_hash' and privilege_type='SELECT')      as pin_hash_ainda_legivel,
  (select count(*) from pg_policy pol join pg_class c on c.oid=pol.polrelid
    where c.relname='cultos')                                       as policies_em_cultos,
  (select count(*) from pg_policy pol join pg_class c on c.oid=pol.polrelid
    where c.relname='cultos' and pol.polcmd='d'
      and pg_get_expr(pol.polqual,pol.polrelid) ilike '%lidera_tudo%') as apagar_so_global,
  (select count(*) from funcoes where 'evento' = any(tipos))        as ainda_tem_tipo_evento,
  (select count(*) from conflitos_entre_ministerios())              as conflitos_hoje;
