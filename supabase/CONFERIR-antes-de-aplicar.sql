/* =============================================================================
   PASSO 1 DE 2 — CONFERIR ANTES DE APLICAR

   Este arquivo NÃO ESCREVE NADA. Só lê e responde se o banco está no estado
   que as migrações 31 e 32 esperam encontrar.

   COMO USAR
     Painel do Supabase → SQL Editor → colar tudo → Run.
     Ele devolve UMA tabela com uma linha por checagem e uma coluna `situacao`.
     Se todas disserem OK, pode aplicar o passo 2.
     Se alguma disser ATENCAO, me mande o resultado antes de aplicar.

   Por que existe: `create unique index` estoura se já houver duplicata, e
   migração que estoura no meio deixa o banco pela metade. É mais barato
   descobrir agora, sem escrever nada, do que no meio da transação.
   ============================================================================= */

with

/* 1. o bloqueador: a policy de INSERT que falta em historico_candidatura.
      Se já existir (alguém pode ter criado a mão), o passo 2 é idempotente. */
policy_historico as (
  select 'policy de INSERT em historico_candidatura' as checagem,
         case when count(*) = 0 then 'FALTA (esperado antes de aplicar)'
              else 'JA EXISTE, o passo 2 recria sem problema' end as situacao,
         count(*)::text as detalhe
    from pg_policies
   where schemaname = 'public' and tablename = 'historico_candidatura' and cmd = 'INSERT'
),

/* 2. duplicata que impediria a unique de voluntarios(equipe_id, telefone) */
dup_voluntarios as (
  select 'duplicata de telefone dentro da mesma equipe' as checagem,
         case when count(*) = 0 then 'OK, nenhuma'
              else 'ATENCAO: ' || count(*) || ' par(es) duplicado(s). A unique NAO sera criada.' end as situacao,
         coalesce(string_agg(equipe_id::text || ' / ' || tel || ' (' || n || ' linhas)', ' · '), '-') as detalhe
    from (select equipe_id, tel_norm(telefone) as tel, count(*) n
            from voluntarios
           where coalesce(length(tel_norm(telefone)),0) >= 10
           group by 1,2 having count(*) > 1) d
),

/* 3. duplicata que impediria a unique de equipes.slug */
dup_slug as (
  select 'duplicata de slug em equipes' as checagem,
         case when count(*) = 0 then 'OK, nenhuma'
              else 'ATENCAO: ' || count(*) || ' slug(s) repetido(s)' end as situacao,
         coalesce(string_agg(slug || ' (' || n || ')', ' · '), '-') as detalhe
    from (select slug, count(*) n from equipes group by 1 having count(*) > 1) d
),

/* 4. quantos vínculos estão sem identidade. O passo 2 conserta estes. */
vinculos_orfaos as (
  select 'vinculos sem pessoa_id (a migracao 32 liga todos)' as checagem,
         case when count(*) = 0 then 'OK, nenhum'
              else count(*) || ' vinculo(s) serao ligados a uma pessoa' end as situacao,
         coalesce(string_agg(distinct nome, ', '), '-') as detalhe
    from voluntarios
   where pessoa_id is null and coalesce(length(tel_norm(telefone)),0) >= 10
),

/* 5. tel_norm precisa ser IMMUTABLE para entrar num indice */
tel_imutavel as (
  select 'tel_norm() e IMMUTABLE (a unique depende disso)' as checagem,
         case when bool_or(p.provolatile = 'i') then 'OK, immutable'
              else 'ATENCAO: nao e immutable, a unique de telefone falharia' end as situacao,
         coalesce(string_agg(p.provolatile, ','), 'funcao nao encontrada') as detalhe
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'tel_norm'
),

/* 6. as duas funções que a migração 31 fecha ainda existem? */
funcoes_abertas as (
  select 'funcoes que a 31 fecha (equipe_entrar, conflitos_entre_ministerios)' as checagem,
         case when count(*) = 0 then 'ja nao existem, nada a fechar'
              else count(*) || ' presente(s), a 31 vai tratar' end as situacao,
         coalesce(string_agg(p.proname, ', '), '-') as detalhe
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('equipe_entrar','conflitos_entre_ministerios')
),

/* 7. retrato do que existe hoje, para comparar depois de aplicar */
retrato as (
  select 'retrato de hoje (guarde para comparar depois)' as checagem,
         'pessoas=' || (select count(*) from pessoas)
      || ' voluntarios=' || (select count(*) from voluntarios)
      || ' candidaturas=' || (select count(*) from candidaturas)
      || ' equipes=' || (select count(*) from equipes)
      || ' lideres=' || (select count(*) from lideres) as situacao,
         'policies=' || (select count(*) from pg_policies where schemaname='public')
      || ' funcoes=' || (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                          where n.nspname='public') as detalhe
)

select * from policy_historico
union all select * from dup_voluntarios
union all select * from dup_slug
union all select * from vinculos_orfaos
union all select * from tel_imutavel
union all select * from funcoes_abertas
union all select * from retrato;
