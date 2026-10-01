/* =============================================================================
   100 · O REPERTÓRIO DO CULTO

   01/10/2026. Só de Escalas.

   Pedido do Louvor, pelo Arthur: quem entra no site para confirmar a escala
   já deveria achar ali o setlist do dia. Quem lidera monta a playlist no
   Spotify e no Deezer, e uma no YouTube "para quem não usa nenhuma das duas
   plataformas", e cola os links no culto. Cada pessoa escalada vê os botões
   na própria página.

   O QUE MUDA
     1 · `culto_obs.repertorio` (jsonb): os três links, por culto e por
         ministério, na mesma linha do recado do dia;
     2 · `repertorio_valido()`: só `https://`, só os domínios de cada
         plataforma (com os links curtos do app do celular), só as três
         chaves, no máximo 500 caracteres por link. Vira CHECK da coluna: o
         link vira botão na tela de quem serve, e `javascript:` ou um endereço
         qualquer ali seria um botão que faz outra coisa;
     3 · `salvar_repertorio()`: grava SÓ o setlist. `salvar_dia` reescreve o
         dia por diferença, e um link colado não tem por que passar perto das
         escalações. Quem não lidera o ministério recebe {ok:false};
     4 · `eu_dados()`: cada dia da pessoa leva `repertorio`, quando o
         ministério ligou o repertório nos Ajustes (`config.dados.repertorio`).
         Corpo copiado da 75, com essa chave nos dois ramos e mais nada.

   A CONFERÊNCIA, no fim, monta um ministério de teste com uma pessoa
   escalada e desfaz tudo: o link bom passa e os ruins não (pela função e
   pelo CHECK); a líder grava o setlist e a de outro ministério não; a pessoa
   vê o repertório com ele ligado e não vê com ele desligado.

   O EDITOR DO SUPABASE NÃO MOSTRA NOTICE: a última linha é um select.

   ORDEM:  ... 98 → 99 → 100
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(100);
  end if;
end $tranca$;

begin;

-- =========================================================================
-- 1 · o que é um link de playlist que pode virar botão
-- =========================================================================
create or replace function public.repertorio_valido(p jsonb)
returns boolean language plpgsql immutable set search_path = public as $fn$
declare k text; v jsonb; u text; host text; dominios text[];
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'object' then return false; end if;
  for k, v in select * from jsonb_each(p) loop
    dominios := case k
      when 'spotify' then array['open.spotify.com','spotify.link','spotify.app.link']
      when 'deezer'  then array['deezer.com','deezer.page.link','link.deezer.com','dzr.page.link']
      when 'youtube' then array['youtube.com','youtu.be','music.youtube.com']
      else null end;
    if dominios is null then return false; end if;               -- chave que não é das três
    if jsonb_typeof(v) <> 'string' then return false; end if;
    u := v #>> '{}';
    if length(u) > 500 or u !~ '^https://' or u ~ '[[:space:]<>"''\\]' then return false; end if;
    host := lower(substring(u from '^https://([^/?#:]+)'));
    if host is null or not exists (
         select 1 from unnest(dominios) d where host = d or host like '%.' || d) then
      return false;
    end if;
  end loop;
  return true;
end $fn$;
revoke all on function public.repertorio_valido(jsonb) from public, anon;
grant execute on function public.repertorio_valido(jsonb) to authenticated;

-- =========================================================================
-- 2 · a coluna, com o CHECK
-- =========================================================================
alter table culto_obs add column if not exists repertorio jsonb;
alter table culto_obs drop constraint if exists culto_obs_repertorio_ok;
alter table culto_obs add constraint culto_obs_repertorio_ok check (public.repertorio_valido(repertorio));
comment on column culto_obs.repertorio is
  '100: o setlist do culto para este ministerio: {spotify, deezer, youtube}, links https das playlists. Grava por salvar_repertorio(); a pessoa escalada ve por eu_dados() quando config.dados.repertorio esta ligado.';

-- =========================================================================
-- 3 · gravar só o setlist
-- =========================================================================
create or replace function public.salvar_repertorio(p_culto uuid, p_equipe uuid, p_repertorio jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $fn$
declare v_rep jsonb;
begin
  if not public.lidera_equipe(p_equipe) then
    return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO');
  end if;
  if not exists (select 1 from cultos where id = p_culto) then
    return jsonb_build_object('ok', false, 'erro', 'CULTO_INEXISTENTE');
  end if;
  /* campo apagado é chave fora; nenhuma chave, nenhum repertório */
  select jsonb_object_agg(key, value) into v_rep
    from jsonb_each(coalesce(p_repertorio, '{}'::jsonb))
   where jsonb_typeof(value) = 'string' and btrim(value #>> '{}') <> '';
  if not public.repertorio_valido(v_rep) then
    return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO');
  end if;
  insert into culto_obs (culto_id, equipe_id, repertorio)
       values (p_culto, p_equipe, v_rep)
  on conflict (culto_id, equipe_id) do update set repertorio = excluded.repertorio;
  return jsonb_build_object('ok', true, 'repertorio', v_rep);
end $fn$;
revoke all on function public.salvar_repertorio(uuid, uuid, jsonb) from public, anon;
grant execute on function public.salvar_repertorio(uuid, uuid, jsonb) to authenticated;

-- =========================================================================
-- 4 · a pessoa escalada vê o setlist do dia
--
-- Corpo copiado da 75 (a versão no ar: pausado não é link inválido), com
-- UMA mudança: a chave `repertorio` nos dois ramos, e só com o repertório
-- ligado no ministério. A primeira versão desta migração copiou a 71 e
-- desfazia a 75 em silêncio; a sonda da 75 em `schema_versao_conferir()`
-- acusou no banco reconstruído ("vinculo_pausado ... SUMIU").
-- =========================================================================
CREATE OR REPLACE FUNCTION public.eu_dados(p_token text)
 RETURNS TABLE(nome text, equipe text, escalas jsonb, indisponivel jsonb, disponivel jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_nome text; v_eq uuid; v_eqnome text; v_ativo boolean; v_artigo text; v_rep_ligado boolean;
begin
  /* ============================================================ 75 ======
     A MESMA CORREÇÃO DE `quem_sou`: pausado não é link inválido.

     `and v.ativo` fazia o vínculo pausado levantar `Link invalido`, e a tela
     do voluntário traduz isso para "Esse link não é válido. Peça o seu link
     de novo" — para alguém cujo link está perfeito e cujo lugar só está
     guardado. Agora a frase diz o que é, e diz de qual ministério. */
  select v.id, v.nome, v.equipe_id, v.ativo into v_id, v_nome, v_eq, v_ativo
    from voluntarios v where v.token = p_token;
  if v_id is null then raise exception 'Link invalido'; end if;
  /* o artigo vem da tabela: "n*o* Louvor" e "n*a* Midia". A coluna existe
     desde a 12 e `quem_sou` já a usa; escrever "no Mídia" na tela de alguém
     seria a igreja falando errado o nome do próprio ministério. */
  select e.nome, 'n' || coalesce(e.artigo, 'o') into v_eqnome, v_artigo
    from equipes e where e.id = v_eq;
  if not coalesce(v_ativo, false) then
    raise exception 'VINCULO_PAUSADO: seu lugar % % esta pausado.',
      coalesce(v_artigo, 'no'), coalesce(v_eqnome, 'ministerio')
      using errcode = 'raise_exception';
  end if;

  /* 100 · o repertorio so sai com ele ligado nos Ajustes do ministerio */
  select bool_or(coalesce(c.dados ->> 'repertorio', '') = 'true') into v_rep_ligado
    from config c where c.equipe_id = v_eq;
  v_rep_ligado := coalesce(v_rep_ligado, false);

  return query select v_nome, coalesce(v_eqnome,'Escala'),
    coalesce((select jsonb_agg(x order by x->>'data') from (
        select jsonb_build_object('culto_id',c.id,'data',c.data,'funcao',f.nome,'status',e.status,
                 /* 71 · `funcao_id`: sem ele a tela não tem como responder POR
                    POSTO, e um toque em "Não posso" derrubava todos os postos
                    da pessoa naquele domingo. */
                 'funcao_id',f.id,
                 /* 71 · `evento` e `inicio`: a tela do voluntário não sabia que
                    evento esporádico existe. `diaLongo` chama de "domingo" tudo
                    que não é sábado, e `criar_evento` SÓ aceita dia que não é
                    domingo nem sábado de Follow — então TODO evento aparecia
                    como "domingo" para quem serve nele, com a hora do domingo
                    no lembrete do calendário. É a pessoa indo no dia errado.
                    A tela da líder já mostra o nome do evento desde a 54. */
                 'evento',c.evento,
                 'inicio',c.inicio,
                 /* 71 · de quem é o relatório que está no campo. `culto_obs` tem
                    UMA linha por (culto, equipe), e o Connect tem DOIS postos
                    que relatam: o segundo líder abria a tela, encontrava o
                    texto do primeiro dentro da caixa dele sob o rótulo
                    "Relatório enviado", escrevia o dele, e o do primeiro sumia
                    junto com os problemas que ele tinha anotado. */
                 'relatado_por',(select vr.nome from culto_obs o
                                   join voluntarios vr on vr.id = o.relatado_por
                                  where o.culto_id=c.id and o.equipe_id=v_eq),
                 'relatado_eu',(select o.relatado_por = v_id from culto_obs o
                                 where o.culto_id=c.id and o.equipe_id=v_eq),
                 'primeira_vez',e.primeira_vez,
                 'escalado_em',e.escalado_em,
                 'obs',(select o.obs from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'repertorio',(select o.repertorio from culto_obs o
                                where v_rep_ligado and o.culto_id=c.id and o.equipe_id=v_eq),
                 'relata', f.relata,
                 'relatorio',(select o.relatorio from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'problemas',(select o.problemas from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'plantao',false) as x
          from escalacoes e join cultos c on c.id=e.culto_id join funcoes f on f.id=e.funcao_id
         where e.voluntario_id = v_id and c.data >= current_date - 1
        union all
        select jsonb_build_object('culto_id',c.id,'data',c.data,'funcao','PLANTAO','status','pendente',
                 'funcao_id',null,'evento',c.evento,'inicio',c.inicio,
                 'relatado_por',null,'relatado_eu',null,
                 'primeira_vez',false,
                 'escalado_em',null,
                 'obs',(select o.obs from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'repertorio',(select o.repertorio from culto_obs o
                                where v_rep_ligado and o.culto_id=c.id and o.equipe_id=v_eq),
                 'relata', false, 'relatorio', null, 'problemas', null,
                 'plantao',true)
          from plantoes p join cultos c on c.id=p.culto_id
         where p.voluntario_id = v_id and c.data >= current_date - 1) t), '[]'::jsonb),
    coalesce((select jsonb_agg(i.data order by i.data) from indisponibilidades i
               where i.voluntario_id = v_id and i.data >= current_date), '[]'::jsonb),
    coalesce((select jsonb_agg(d.data order by d.data) from disponibilidade d
               where d.voluntario_id = v_id and d.pode = true and d.data >= current_date), '[]'::jsonb);
end $function$
;
revoke all on function public.eu_dados(text) from public;
grant execute on function public.eu_dados(text) to anon, authenticated;

-- =========================================================================
-- 5 · conferência
-- =========================================================================
do $conf$
declare
  falhas text[] := '{}';
  v_eq uuid; v_eq2 uuid; v_f uuid; v_p uuid; v_vol uuid; v_tok text; v_culto uuid; v_dia date;
  v_r jsonb; v_esc jsonb; v_n int;
  bom constant jsonb := '{"spotify":"https://open.spotify.com/playlist/37i9dQZF1DX0","deezer":"https://link.deezer.com/s/30AbC","youtube":"https://youtube.com/playlist?list=PLx1"}';
begin
  /* 1 · o que é link de playlist */
  if not repertorio_valido(bom) then falhas := falhas || 'o repertorio bom foi recusado'::text; end if;
  if not repertorio_valido('{"youtube":"https://youtu.be/abc","spotify":"https://spotify.link/x1"}') then
    falhas := falhas || 'os links curtos do celular foram recusados'::text; end if;
  if repertorio_valido('{"spotify":"javascript:alert(1)"}') then falhas := falhas || 'aceitou javascript:'::text; end if;
  if repertorio_valido('{"spotify":"http://open.spotify.com/playlist/x"}') then falhas := falhas || 'aceitou http sem s'::text; end if;
  if repertorio_valido('{"spotify":"https://open.spotify.com.golpe.com/x"}') then falhas := falhas || 'aceitou dominio que so comeca igual'::text; end if;
  if repertorio_valido('{"deezer":"https://youtube.com/playlist?list=x"}') then falhas := falhas || 'aceitou link de uma plataforma na chave de outra'::text; end if;
  if repertorio_valido('{"tidal":"https://tidal.com/x"}') then falhas := falhas || 'aceitou chave que nao e das tres'::text; end if;
  if repertorio_valido(jsonb_build_object('youtube', 'https://youtube.com/' || repeat('a', 500))) then
    falhas := falhas || 'aceitou link com mais de 500 caracteres'::text; end if;

  /* 2 a 5 · um ministério de teste, uma pessoa escalada; tudo desfeito no fim */
  begin
    insert into equipes (nome, slug, ordem) values ('CONF100 Teste', 'conf100-teste', 997) returning id into v_eq;
    insert into equipes (nome, slug, ordem) values ('CONF100 Outro', 'conf100-outro', 996) returning id into v_eq2;
    insert into lideres (email, equipe_id) values ('conf100@exemplo.invalid', v_eq);
    insert into lideres (email, equipe_id) values ('conf100-outro@exemplo.invalid', v_eq2);
    insert into funcoes (equipe_id, nome, ordem, ativa) values (v_eq, 'CONF100 TECLADO', 1, true) returning id into v_f;
    insert into pessoas (nome, telefone) values ('Conf100', '21999991000') returning id into v_p;
    insert into voluntarios (equipe_id, pessoa_id, nome, telefone, conferido, ativo)
         values (v_eq, v_p, 'Conf100', '21999991000', true, true) returning id, token into v_vol, v_tok;
    v_dia := (current_date + 7)::date;
    while extract(dow from v_dia) <> 0 loop v_dia := v_dia + 1; end loop;
    select id into v_culto from cultos where data = v_dia and evento is null;
    if v_culto is null then insert into cultos (data) values (v_dia) returning id into v_culto; end if;
    insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
         values (v_culto, v_f, v_vol, 'pendente', false, false);
    insert into config (equipe_id, dados) values (v_eq, '{"repertorio": true}')
      on conflict do nothing;
    update config set dados = coalesce(dados, '{}'::jsonb) || '{"repertorio": true}' where equipe_id = v_eq;

    /* 2 · o CHECK segura até quem escreve direto na tabela */
    begin
      insert into culto_obs (culto_id, equipe_id, repertorio) values (v_culto, v_eq, '{"spotify":"javascript:x"}');
      falhas := falhas || 'o CHECK deixou gravar javascript: direto na tabela'::text;
    exception when check_violation then null;
    end;

    /* 3 · a líder grava; a de outro ministério não; link ruim volta com erro */
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf100@exemplo.invalid","role":"authenticated"}', true);
    v_r := salvar_repertorio(v_culto, v_eq, bom || '{"deezer":""}');
    if coalesce(v_r->>'ok', '') <> 'true' then falhas := falhas || ('a lider nao gravou: ' || v_r::text); end if;
    if v_r->'repertorio' ? 'deezer' then falhas := falhas || 'o campo apagado ficou gravado como texto vazio'::text; end if;
    v_r := salvar_repertorio(v_culto, v_eq, '{"spotify":"https://golpe.com/x"}');
    if coalesce(v_r->>'erro', '') <> 'LINK_INVALIDO' then falhas := falhas || ('link ruim nao voltou LINK_INVALIDO: ' || v_r::text); end if;
    perform set_config('request.jwt.claims', '{"email":"conf100-outro@exemplo.invalid","role":"authenticated"}', true);
    v_r := salvar_repertorio(v_culto, v_eq, bom);
    if coalesce(v_r->>'erro', '') <> 'SEM_PERMISSAO' then falhas := falhas || ('a lider de outro ministerio gravou: ' || v_r::text); end if;
    reset role;

    /* 4 · a pessoa escalada vê, com o repertório ligado */
    select e.escalas into v_esc from eu_dados(v_tok) e;
    select count(*) into v_n from jsonb_array_elements(v_esc) x
     where x->>'culto_id' = v_culto::text
       and x->'repertorio'->>'spotify' = 'https://open.spotify.com/playlist/37i9dQZF1DX0';
    if v_n <> 1 then falhas := falhas || ('eu_dados nao trouxe o repertorio: ' || coalesce(v_esc::text, 'nada')); end if;

    /* 5 · e não vê, com ele desligado */
    update config set dados = dados || '{"repertorio": false}' where equipe_id = v_eq;
    select e.escalas into v_esc from eu_dados(v_tok) e;
    select count(*) into v_n from jsonb_array_elements(v_esc) x
     where x->>'culto_id' = v_culto::text and jsonb_typeof(x->'repertorio') = 'object';
    if v_n <> 0 then falhas := falhas || 'eu_dados trouxe o repertorio com ele desligado'::text; end if;

    raise exception 'CONF100_DESFAZ';
  exception when others then
    if sqlerrm <> 'CONF100_DESFAZ' then
      falhas := falhas || ('o cenario nao montou: ' || sqlerrm)::text;
    end if;
  end;
  if exists (select 1 from equipes where slug like 'conf100-%')
     or exists (select 1 from lideres where email like 'conf100%@exemplo.invalid') then
    falhas := falhas || 'o cenario de teste ficou no banco'::text; end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'100 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 100 · conferencia: so link https de playlist das tres plataformas (funcao e CHECK); a lider grava o setlist e a de outro ministerio nao; a pessoa escalada ve o repertorio com ele ligado e nao ve com ele desligado. Cenario desfeito.';
end $conf$;

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (100, '100 · eu_dados devolve o repertorio', 'eu_dados', '''repertorio'''),
      (100, '100 · salvar_repertorio confere o link', 'salvar_repertorio', 'repertorio_valido')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (100, '100-o-repertorio-do-culto.sql')
  on conflict (n) do nothing;

commit;

/* o que o editor mostra: a conta depois de aplicar */
select '100' as versao,
       (select count(*) from information_schema.columns
         where table_name = 'culto_obs' and column_name = 'repertorio') as coluna_repertorio,
       (select count(*) from pg_constraint where conname = 'culto_obs_repertorio_ok') as check_do_link,
       (select position('''repertorio''' in pg_get_functiondef('public.eu_dados(text)'::regprocedure)) > 0) as eu_dados_com_repertorio;
