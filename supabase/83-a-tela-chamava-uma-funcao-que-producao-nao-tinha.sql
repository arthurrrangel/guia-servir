/* A TRANCA. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(83);
  end if;
end $tranca$;

/* =============================================================================
   83 · A TELA CHAMA UMA FUNCAO QUE PRODUCAO NUNCA RECEBEU
   21/09/2026

   -------------------------------------------------------------------------
   O QUE ESTA QUEBRADO AGORA, MEDIDO NO BANCO QUE ESTA NO AR

   Aplicando a 77 em producao, a conferencia dela acusou:

     nenhuma linha do inventario descreve funcao que a internet nao alcanca
     mais -> 1: eu_quem_serve(p_token text, p_culto_id uuid)

   Fui ver, e a funcao nao existe. Listei as catorze `eu_*` do banco de
   producao e `eu_quem_serve` nao esta entre elas.

   `app/eu/[token]/page.tsx:319` a chama:

       const { data, error } = await sb()!.rpc('eu_quem_serve', ...)

   Ou seja: a secao "quem serve com voce" da tela pessoal do voluntario esta
   quebrada em producao, e esta assim ha meses.

   -------------------------------------------------------------------------
   POR QUE ELA SUMIU, E POR QUE ISSO NAO E UM CASO ISOLADO

   Ela nasce na migracao 40. O banco de producao e ANTERIOR a disciplina de
   migracao: `schema_versao` so existe desde a 55, e nada garante que os
   arquivos de 01 a 54 tenham sido aplicados la. A 40 e um deles que nao foi.

   E o mesmo assunto de `producao-nao-e-o-que-o-repositorio-assume`: o
   repositorio descreve um banco, e o banco que esta no ar e outro. Cada vez
   que essa distancia aparece, ela aparece assim — uma funcao que a tela chama
   e que o servidor nao tem, falhando em silencio.

   -------------------------------------------------------------------------
   O QUE ESTA MIGRACAO FAZ

   Copia a funcao da 40, VERBATIM, e concede a anon como a 40 concede. Nao
   melhora nada nela de proposito: se houver o que melhorar, isso e outra
   migracao, com sua propria conferencia. Aqui o trabalho e fechar uma
   distancia entre o repositorio e o que esta no ar, e fechar distancia com
   uma mudanca junto e como se conserta duas coisas e nao se sabe qual das
   duas quebrou.

   Num banco que ja tenha a funcao (o que nasce do repositorio), o
   `create or replace` grava a mesma coisa por cima e a conferencia passa
   igual.
   ============================================================================= */


create or replace function eu_quem_serve(p_token text, p_culto_id uuid)
returns table(nome text, funcao text, eu boolean, status text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_id uuid; v_eq uuid;
begin
  select v.id, v.equipe_id into v_id, v_eq
    from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  /* a trava do item 3: só responde sobre um culto em que a pessoa está de pé.
     'recusado' não conta — quem desmarcou não é mais do time daquele dia. */
  if not exists (
    select 1 from escalacoes e join funcoes f on f.id = e.funcao_id
     where e.culto_id = p_culto_id and e.voluntario_id = v_id
       and f.equipe_id = v_eq and e.status <> 'recusado'
  ) then
    return;
  end if;

  return query
  select v.nome, f.nome, (v.id = v_id), e.status::text
    from escalacoes e
    join funcoes f on f.id = e.funcao_id
    join voluntarios v on v.id = e.voluntario_id
   where e.culto_id = p_culto_id
     and f.equipe_id = v_eq
     and e.status <> 'recusado'
     and v.ativo
   order by f.ordem, v.nome;
end $function$;

/* mesma disciplina das outras eu_*: fecha para todos e abre só para anon,
   que é quem chega pelo link pessoal sem login. */
revoke execute on function eu_quem_serve(text, uuid) from public;
grant  execute on function eu_quem_serve(text, uuid) to anon;

/* e ela entra no inventario da porta publica com o motivo escrito, que e a
   regra que a 77 instalou: porta alcancavel pela internet sem motivo escrito
   reprova. `on conflict` porque num banco que ja tenha a linha (o do
   repositorio) isto e releitura, nao insercao. */
do $inv$ begin
  if to_regclass('public.porta_publica') is null then
    raise notice 'PULEI o inventario: este banco nao tem porta_publica (falta a 77).';
    return;
  end if;
  insert into public.porta_publica (funcao, motivo, n) values (
    'eu_quem_serve(p_token text, p_culto_id uuid)',
    'Quem chega pelo link pessoal nao tem login, e a tela mostra com quem a pessoa vai servir naquele dia. Tres travas no corpo: o token tem que ser de vinculo ATIVO, so enxerga a PROPRIA area, e so responde sobre um culto em que a pessoa esta de pe (recusado nao conta). Nasceu na 40; producao nunca recebeu a 40, e a 83 a trouxe.', 83)
  on conflict (funcao) do update set motivo = excluded.motivo;
end $inv$;


-- =========================================================================
-- a regua
-- =========================================================================
insert into schema_versao (n, arquivo)
     values (83, '83-a-tela-chamava-uma-funcao-que-producao-nao-tinha.sql')
on conflict (n) do update set arquivo = excluded.arquivo, aplicada_em = now();


-- =========================================================================
-- CONFERENCIA
-- =========================================================================
do $conf$
declare v_erros text := ''; v_casos int := 0; v_n int; v_oid oid;
begin
  -- 1 · a funcao existe, com a assinatura que a TELA chama
  select p.oid into v_oid from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname = 'eu_quem_serve'
     and pg_get_function_identity_arguments(p.oid) = 'p_token text, p_culto_id uuid';
  if v_oid is null then
    v_erros := v_erros || '1) eu_quem_serve(p_token text, p_culto_id uuid) nao existe; ';
  end if;
  v_casos := v_casos + 1;

  if v_oid is not null then
    -- 2 · a internet alcanca, que e o ponto: quem chega pelo link nao tem login
    if not has_function_privilege('anon', v_oid, 'execute') then
      v_erros := v_erros || '2) anon nao executa: o link pessoal nao abriria a secao; ';
    end if;
    v_casos := v_casos + 1;

    -- 3 · e e DEFINER, senao a RLS barraria a propria consulta
    if not (select prosecdef from pg_proc where oid = v_oid) then
      v_erros := v_erros || '3) nao e security definer: rodaria como anon e voltaria vazia; ';
    end if;
    v_casos := v_casos + 1;

    -- 4 · as TRES travas do corpo continuam escritas (a 40 as explica uma a uma)
    declare v_src text := (select prosrc from pg_proc where oid = v_oid);
    begin
      if position('p_token' in v_src) = 0 or position('v.ativo' in v_src) = 0 then
        v_erros := v_erros || '4) a trava do token/ativo sumiu do corpo; ';
      end if;
      if position('f.equipe_id = v_eq' in v_src) = 0 then
        v_erros := v_erros || '4b) a trava de SO A PROPRIA AREA sumiu: a pessoa enxergaria a escala de outro ministerio; ';
      end if;
      if position('recusado' in v_src) = 0 then
        v_erros := v_erros || '4c) a trava de `recusado` sumiu; ';
      end if;
    end;
    v_casos := v_casos + 3;

    -- 5 · e ela entra no inventario da porta publica, senao a 77 reprova
    if to_regclass('public.porta_publica') is not null then
      select count(*) into v_n from porta_publica
       where funcao = 'eu_quem_serve(p_token text, p_culto_id uuid)';
      if v_n <> 1 then
        v_erros := v_erros || format('5) o inventario da porta publica tem %s linha(s) para ela, e tem que ter 1; ', v_n);
      end if;
      v_casos := v_casos + 1;
    end if;

    -- 6 · CONTROLE NEGATIVO: a conferencia sabe acusar?
    --     Sem isto, um erro nas consultas acima deixaria tudo verde sem olhar.
    declare v_achou int;
    begin
      execute 'revoke execute on function public.eu_quem_serve(text, uuid) from anon';
      v_achou := case when has_function_privilege('anon', v_oid, 'execute') then 0 else 1 end;
      execute 'grant execute on function public.eu_quem_serve(text, uuid) to anon';
      if v_achou <> 1 then
        v_erros := v_erros || '6) CONTROLE NEGATIVO FALHOU: tirei o acesso de anon e a leitura nao viu; ';
      end if;
      if not has_function_privilege('anon', v_oid, 'execute') then
        v_erros := v_erros || '6b) e o controle negativo nao devolveu o acesso; ';
      end if;
    exception when others then
      execute 'grant execute on function public.eu_quem_serve(text, uuid) to anon';
      v_erros := v_erros || format('6) o controle negativo quebrou: %s; ', sqlerrm);
    end;
    v_casos := v_casos + 2;
  end if;

  if v_erros = '' then
    raise notice 'OK — %/% casos: eu_quem_serve existe com a assinatura que a tela chama, e alcancavel por quem chega pelo link, e DEFINER, mantem as tres travas da 40 (token ativo, so a propria area, recusado fora), esta no inventario da porta publica, e o controle negativo provou que esta conferencia acusa.', v_casos, v_casos;
  else
    raise exception 'FALHOU (% casos) — %', v_casos, v_erros;
  end if;
end $conf$;
