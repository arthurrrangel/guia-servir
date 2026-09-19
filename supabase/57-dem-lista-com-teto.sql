/* =============================================================================
   57 · `dem_lista` PARA DE DEVOLVER O BANCO INTEIRO

   19/09/2026. Um arquivo, um sistema. Este é só de Demandas.

   Ele começou dentro da 56 e saiu de lá por dois motivos, os dois
   descobertos rodando e não lendo:

   1. `scripts/demandas-celular-subir.sh` monta uma base ISOLADA de Demandas,
      sem `cultos` e sem `voluntarios`, e é ela que roda as 252 conferências
      de tela. A 56 depende de `cultos` da primeira linha à última, então
      aquele roteiro jamais a aplicaria — e as 252 continuariam verdes
      medindo a `dem_lista` ANTIGA. Verde sobre a versão errada é pior que
      vermelho.

   2. A auditoria de arquitetura apontou, com razão, que a 52 mexe nos dois
      sistemas no mesmo arquivo, e que o roteiro roda cada arquivo sem
      `--single-transaction`: um erro no meio deixa um sistema corrigido e o
      outro não, sem dizer até onde foi. Eu estava repetindo isso na 56.

   O QUE ELE CORRIGE

   `dem_lista` não tinha `limit`, `offset`, cursor nem janela de data.
   Medido com 20 mil demandas semeadas:

       aba "Tudo" (so='tudo')      20.000 itens   10 MB de JSON   1.341 ms
       filtro padrão (abertas)      2.000 itens    1.065 kB         134 ms

   Os 134 ms são do banco e não são o problema. O problema é 1 MB descendo
   num 4G antes do primeiro pixel — e o filtro padrão só ATRASA isso, porque
   o backlog de demandas abertas não tem teto natural.

   O teto é do BANCO e não da tela de propósito: tela nova esquece de pedir
   limite, e foi assim que `dem_lista` nasceu sem. E a tela passa a DIZER que
   cortou (`total`, `tem_mais`), porque teto silencioso é a mesma classe de
   defeito que este repositório mais paga caro: a pessoa olharia uma lista
   incompleta achando que é a lista.

   ORDEM:  ... 55 → 56 → 57
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(57);
  end if;
end $tranca$;

create or replace function public.dem_lista(p_token text default null, p_f jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = demandas, public as $fn$
declare
  m demandas.membros; v jsonb; v_total int;
  /* 300 é o teto duro. A tela pede menos quando sabe o que quer; quem não
     pedir nada recebe 300, que é mais do que cabe num polegar e MUITO menos
     que 20 mil. */
  v_lim int := least(greatest(coalesce((p_f->>'limite')::int, 300), 1), 300);
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

  with filtradas as (
    select d.* from demandas.demandas d
     where demandas.pode_ver(m, d)
       and (coalesce(p_f->>'aba','tudo') <> 'minhas'  or d.aberta_por = m.id)
       and (coalesce(p_f->>'aba','tudo') <> 'setor'
            or (m.setor_id is not null and d.setor_responsavel = m.setor_id))
       and (coalesce(p_f->>'aba','tudo') <> 'comigo'  or d.responsavel_id = m.id)
       and (nullif(p_f->>'status','') is null or d.status = p_f->>'status')
       and (coalesce((p_f->>'abertas')::boolean, false) = false
            or d.status in ('aberta','execucao','travada'))
       and (coalesce((p_f->>'atrasadas')::boolean, false) = false
            or (d.prazo is not null and d.prazo < current_date
                and d.status in ('aberta','execucao','travada')))
       and (nullif(p_f->>'setor','') is null
            or d.setor_responsavel = (p_f->>'setor')::uuid)
       and (nullif(p_f->>'busca','') is null
            or d.titulo ilike '%'||(p_f->>'busca')||'%'
            or d.descricao ilike '%'||(p_f->>'busca')||'%'
            or d.numero::text = p_f->>'busca')
  ), ordenadas as (
    select f.* from filtradas f
     order by case f.prioridade when 'urgente' then 0 when 'alta' then 1
                                when 'normal' then 2 else 3 end,
              f.prazo nulls last, f.criada_em
     limit v_lim
  )
  select coalesce(jsonb_agg(demandas.resumo(o) order by
           case o.prioridade when 'urgente' then 0 when 'alta' then 1
                             when 'normal' then 2 else 3 end,
           o.prazo nulls last, o.criada_em), '[]'::jsonb),
         (select count(*) from filtradas)
    into v, v_total
    from ordenadas o;

  return jsonb_build_object('ok', true, 'itens', v,
                            'total', v_total, 'limite', v_lim,
                            'tem_mais', v_total > jsonb_array_length(v));
end $fn$;

comment on function public.dem_lista(text, jsonb) is
  'Lista as demandas que a pessoa pode ver. Desde a 56 tem teto de 300 e devolve total/tem_mais: sem teto, a aba Tudo com 20 mil demandas media 10 MB de JSON, e o backlog aberto nao tem limite natural.';

-- =========================================================================
-- a sonda, para quem vier depois conseguir perguntar ao banco
--
-- `schema_versao_conferir()` (migração 56) lê as sondas de uma TABELA em vez
-- de tê-las escritas no corpo. Assim cada migração registra a SUA, e um
-- arquivo de Demandas não precisa reescrever uma função de Escalas para
-- acrescentar uma linha. A tabela só existe onde a 56 rodou — numa base
-- isolada de Demandas ela não existe, e o bloco não faz nada.
-- =========================================================================

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura)
    values (57, '57 · dem_lista tem teto de linhas', 'dem_lista', 'tem_mais')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

do $reg$ begin
  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo) values (57, '57-dem-lista-com-teto.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;


-- =========================================================================
-- A CONFERÊNCIA
-- =========================================================================

do $conf$
declare v jsonb; v_corpo text;
begin
  select coalesce(lower(regexp_replace(prosrc, '\s+', ' ', 'g')), '') into v_corpo
    from pg_proc where proname = 'dem_lista' and pronamespace = 'public'::regnamespace limit 1;
  if v_corpo not like '%tem_mais%' then
    raise exception 'A 57 NAO PEGOU: dem_lista continua sem teto.';
  end if;
  if v_corpo not like '%limit v_lim%' then
    raise exception 'A 57 NAO PEGOU: dem_lista nao tem o limit.';
  end if;

  /* e a chamada continua respondendo o que a tela espera: `itens` é a chave
     que `lib/demandas/api.ts` lê desde o primeiro dia, e trocá-la calaria a
     lista inteira sem um erro */
  v := public.dem_lista(null, '{}'::jsonb);
  if v->>'erro' is distinct from 'SEM_ACESSO' and not (v ? 'itens') then
    raise exception 'A 57 QUEBROU O CONTRATO: dem_lista nao devolve `itens`: %', v::text;
  end if;
  raise notice '57 · conferencia: dem_lista tem teto, diz o total, e ainda devolve `itens`.';
end $conf$;
