/* ESTE ARQUIVO E PASSADO. A TRANCA ESTA AQUI PORQUE ELE PODE DESFAZER.

   `create or replace function` nao e idempotente NO TEMPO: ele grava a versao
   deste arquivo por cima da que estiver la, seja ela mais nova ou nao, e sem
   um aviso.

   O que este arquivo consegue reverter, se rodar fora de hora:
     dem_lista (a 80 refez com os guardas de cast)

   Por isso ele se recusa a rodar num banco que ja passou da 68. Aplicado na
   ordem, do zero, `exige_versao_ate` ainda nem existe (ela nasce na 55) e o
   bloco nao faz nada — e e assim que tem que ser, senao o rebuild do
   repositorio parava aqui.

   Se voce REALMENTE precisa reaplicar, a mensagem do erro diz como. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(68);
  end if;
end $tranca$;

/* =============================================================================
   68 · `dem_lista` DEVOLVIA O ERRO CRU DO POSTGRES

   21/09/2026. Só de Demandas. Depende da 57.

   -------------------------------------------------------------------------
   O DEFEITO

   `dem_lista(token, {"limite": "abc"})` não devolvia erro de aplicação:
   estourava com o erro cru do Postgres.

     ERROR:  invalid input syntax for type integer: "abc"
     CONTEXT:  PL/pgSQL function dem_lista(text,jsonb) line 7

   O `least(greatest(... ::int ...))` mora no `declare`, que roda ANTES do
   `begin` — então nem o `exception` da própria função alcançaria, se ela
   tivesse um.

   E o estrago não é o erro em si: é a TRADUÇÃO. `lib/erros.ts` não reconhece
   essa mensagem, e mensagem que ele não reconhece vira REDE — a tela diz
   "verifique sua conexão" sobre um problema que não tem nada a ver com rede.
   Quem estivesse depurando procuraria no lugar errado.

   -------------------------------------------------------------------------
   O ALCANCE, DITO SEM AUMENTAR

   Nenhuma tela manda `limite`: só chega por chamada direta à RPC. Isto é
   higiene de contrato, não incêndio. Entra porque custa duas linhas e porque
   o mesmo padrão — cast cego em parâmetro de fora — é o tipo de coisa que se
   copia para a próxima função.

   -------------------------------------------------------------------------
   POR QUE RECUSAR E NÃO ASSUMIR 300

   Assumir o padrão seria mais "liberal", e seria a mesma doença que a
   migração 65 tirou de `eu_disponibilidade`: lá, uma resposta desconhecida
   caía num `else` que APAGAVA a resposta da pessoa, em silêncio. Parâmetro
   que não faz sentido é erro de quem chamou, e dizer isso é mais barato do
   que deixar a pessoa descobrir sozinha que o filtro dela foi ignorado.
   ============================================================================= */

CREATE OR REPLACE FUNCTION public.dem_lista(p_token text DEFAULT NULL::text, p_f jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'demandas', 'public'
AS $function$
declare
  m demandas.membros; v jsonb; v_total int;
  /* 300 é o teto duro. A tela pede menos quando sabe o que quer; quem não
     pedir nada recebe 300, que é mais do que cabe num polegar e MUITO menos
     que 20 mil. */
  /* 68 · O CÁLCULO SAIU DO `declare`, E O CAST DEIXOU DE SER CEGO.
     Aqui em cima nada é alcançável por `exception`: o `declare` roda ANTES do
     `begin`. Com `limite` = "abc", o `::int` estourava com o erro cru do
     Postgres ("invalid input syntax for type integer") e `lib/erros.ts`, que
     não reconhece a mensagem, traduzia para REDE — "verifique sua conexão"
     sobre um problema que não é de conexão. */
  v_lim int;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;

  if (p_f ? 'limite') and coalesce(p_f->>'limite','') !~ '^-?[0-9]{1,9}$' then
    return jsonb_build_object('ok', false, 'erro', 'LIMITE_INVALIDO');
  end if;
  v_lim := least(greatest(coalesce((p_f->>'limite')::int, 300), 1), 300);

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
end $function$;

revoke all on function public.dem_lista(text, jsonb) from public;
grant execute on function public.dem_lista(text, jsonb) to anon, authenticated;
comment on function public.dem_lista(text, jsonb) is
  'A lista de demandas que o token enxerga, com teto de 300 e o total de verdade. Desde a 68 recusa `limite` que nao e numero com LIMITE_INVALIDO, em vez de estourar com o erro cru do Postgres — que lib/erros.ts traduzia para REDE.';

do $reg$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (68, '68 · dem_lista recusa limite invalido', 'dem_lista', 'LIMITE_INVALIDO')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
  if to_regclass('public.schema_versao') is not null then
    insert into public.schema_versao (n, arquivo)
      values (68, '68-dem-lista-devolvia-o-erro-cru-do-postgres.sql')
    on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();
  end if;
end $reg$;

-- =========================================================================
-- A CONFERÊNCIA
-- =========================================================================

do $conf$
declare
  v_tok text := 'tk-conf68'; v_sec uuid; v_r jsonb;
  ok int := 0; falhou int := 0; msg text := '';
begin
  select id into v_sec from demandas.setores where slug = 'jovens';
  if v_sec is null then raise notice '68 · PULEI: base sem os setores de exemplo.'; return; end if;
  insert into demandas.membros (nome, telefone, papel, setor_id, token)
       values ('Conf68', '5531900068001', 'gestor', v_sec, v_tok);

  /* 1. texto que não é número: erro de aplicação, não erro cru */
  begin
    v_r := dem_lista(v_tok, '{"limite":"abc"}'::jsonb);
    if (v_r ->> 'erro') = 'LIMITE_INVALIDO' then ok := ok + 1;
    else
      falhou := falhou + 1;
      msg := msg || E'\n  x limite "abc" nao virou LIMITE_INVALIDO: ' || v_r::text;
    end if;
  exception when others then
    falhou := falhou + 1;
    msg := msg || E'\n  x limite "abc" AINDA estoura com erro cru: ' || sqlerrm;
  end;

  /* 2. e um número absurdamente longo também, sem estourar no int4 */
  begin
    v_r := dem_lista(v_tok, '{"limite":"99999999999999"}'::jsonb);
    if (v_r ->> 'erro') = 'LIMITE_INVALIDO' then ok := ok + 1;
    else
      falhou := falhou + 1;
      msg := msg || E'\n  x numero maior que o int4 nao virou LIMITE_INVALIDO: ' || v_r::text;
    end if;
  exception when others then
    falhou := falhou + 1;
    msg := msg || E'\n  x numero maior que o int4 estoura com erro cru: ' || sqlerrm;
  end;

  /* 3. os limites legítimos continuam funcionando, inclusive os que o
        least/greatest corrige (-1 vira 1, 9000 vira 300) */
  v_r := dem_lista(v_tok, '{"limite":"-1"}'::jsonb);
  if (v_r ->> 'ok')::boolean and (v_r ->> 'limite')::int = 1 then ok := ok + 1;
  else
    falhou := falhou + 1; msg := msg || E'\n  x limite -1 devia virar 1: ' || v_r::text;
  end if;

  v_r := dem_lista(v_tok, '{"limite":"9000"}'::jsonb);
  if (v_r ->> 'ok')::boolean and (v_r ->> 'limite')::int = 300 then ok := ok + 1;
  else
    falhou := falhou + 1; msg := msg || E'\n  x limite 9000 devia virar 300: ' || v_r::text;
  end if;

  /* 4. e quem não manda limite nenhum continua recebendo o padrão */
  v_r := dem_lista(v_tok, '{}'::jsonb);
  if (v_r ->> 'ok')::boolean and (v_r ->> 'limite')::int = 300 then ok := ok + 1;
  else
    falhou := falhou + 1; msg := msg || E'\n  x sem limite devia ser 300: ' || v_r::text;
  end if;

  delete from demandas.membros where token = v_tok;

  if falhou > 0 then
    raise exception 'A CONFERENCIA DA 68 REPROVOU: % de % casos', falhou, ok + falhou
      using detail = msg, errcode = 'raise_exception';
  end if;
  raise notice '68 · conferencia: %/% casos. limite invalido vira erro de aplicacao, e os validos seguem como eram.', ok, ok;
end $conf$;

/* =============================================================================
   ROLLBACK
     Copiar o corpo de `dem_lista` da migração 57 por cima.
   ============================================================================= */
