/* =============================================================================
   IMPRESSÃO DIGITAL DO BANCO — 01/10/2026

   Para que serve: provar que a produção é o que o repositório diz, sem
   confiar em `schema_versao`. A 55 encheu a régua com 1..55 "as que já
   rodaram" e três delas (42, 45, 46) nunca tinham entrado; a 101 conserta e
   esta consulta é como se acha a próxima.

   Como usar:
     1. num banco nascido do repositório (scripts/banco-do-zero.sh mostra
        como subir um), rode este arquivo com psql;
     2. na produção, cole no SQL Editor e rode (só lê);
     3. compare as duas linhas. Cada item é `tipo+balde hash quantos`:
        f = funções (corpo, security definer, search_path, execute de anon e
        authenticated), c = colunas, p = políticas, t = gatilhos,
        k = restrições, i = índices, v = visões, g = permissões de tabela.
        Balde diferente: rode a consulta de detalhe do fim do arquivo com o
        tipo e o balde e compare item por item.

   Diferenças conhecidas e aceitas (só na produção, fonte fora do
   repositório ou função sem uso): ocupados_fora(uuid) no balde fa,
   testar_conta_sem_papel() no balde f2.
   ============================================================================= */
with objetos as (
select 'f' as k, p.oid::regprocedure::text as chave,
       md5(p.prosrc || '|' || p.prosecdef::text || '|' || coalesce(array_to_string(p.proconfig, ','), '') || '|'
           || has_function_privilege('anon', p.oid, 'EXECUTE')::text || has_function_privilege('authenticated', p.oid, 'EXECUTE')::text) as h
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public', 'demandas') and p.prokind in ('f','p')
union all
select 'c', c.table_schema || '.' || c.table_name || '.' || c.column_name, md5(c.data_type || '|' || c.is_nullable)
  from information_schema.columns c where c.table_schema in ('public', 'demandas')
union all
select 'p', pol.schemaname || '.' || pol.tablename || '.' || pol.policyname,
       md5(coalesce(pol.qual, '') || '|' || coalesce(pol.with_check, '') || '|' || pol.cmd || '|' || array_to_string(pol.roles, ','))
  from pg_policies pol where pol.schemaname in ('public', 'demandas')
union all
select 't' as k, n.nspname || '.' || c.relname || '.' || t.tgname as chave, md5(pg_get_triggerdef(t.oid)) as h
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
 where not t.tgisinternal and n.nspname in ('public', 'demandas')
union all
select 'k', n.nspname || '.' || c.relname || '.' || con.conname, md5(pg_get_constraintdef(con.oid))
  from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public', 'demandas')
union all
select 'i', schemaname || '.' || indexname, md5(indexdef) from pg_indexes where schemaname in ('public', 'demandas')
union all
select 'v', schemaname || '.' || viewname, md5(definition) from pg_views where schemaname in ('public', 'demandas')
union all
select 'g', table_schema || '.' || table_name || '.' || grantee, md5(string_agg(privilege_type, ',' order by privilege_type))
  from information_schema.role_table_grants
 where table_schema in ('public', 'demandas') and grantee in ('anon', 'authenticated')
 group by table_schema, table_name, grantee
),
baldes as (
  select k, left(md5(chave), 1) as bk,
         left(md5(string_agg(chave || ' ' || left(h, 10), ',' order by chave collate "C")), 8) as hb,
         count(*) as n
    from objetos group by 1, 2)
select string_agg(k || bk || ' ' || hb || ' ' || n, ' | ' order by k, bk) as impressao_digital from baldes;

/* DETALHE de um balde (troque o tipo e o balde):

with objetos as ( ...as duas consultas de cima... )
select string_agg(chave || ' hash ' || left(h, 10), ' | ' order by chave collate "C")
  from objetos where k = 'f' and left(md5(chave), 1) = 'a';
*/
