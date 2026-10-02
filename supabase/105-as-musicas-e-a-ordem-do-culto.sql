/* =============================================================================
   105 · AS MÚSICAS E A ORDEM DO CULTO

   02/10/2026. Só de Escalas. Fase 3 do estudo do ServoApp
   (claude/estudo-servoapp-01-10-2026.md): "música com tom, BPM, letra e
   cifra" e "ordem do culto com tempos", que Voluts, IDE, HubEscala e Church
   Calendar anunciam e o GUIA Servir não tinha. O Arthur: "quero ter tudo que
   esse app tem e ser melhor ainda", "sem apagar nada do que já existe".

   SÓ ACRESCENTA. O repertório da 100 (os links das playlists) continua igual,
   e `eu_dados` não é tocada: a ordem chega à página de quem serve por uma
   porta nova, e o que a página já mostrava não muda.

   O QUE MUDA
     1 · `culto_obs.ordem` (jsonb): a ordem do culto do ministério, item por
         item. Música: título, artista, tom, BPM, link da cifra, quem
         conduz, duração e uma nota. Momento (oração, avisos, palavra,
         ceia): título, quem, duração e nota. Mora na linha do recado e do
         repertório, por culto e por ministério, como eles.
     2 · `ordem_valida()`, CHECK da coluna: até 40 itens, só as chaves
         conhecidas, texto aparado, sem caractere de controle e com teto,
         tom escrito como o músico escreve (G, F#m, Bb), BPM de 30 a 300,
         duração de 1 a 240 minutos, cifra só `https://` de um domínio de
         verdade. A cifra vira botão na página de quem serve: `javascript:`
         ou `https://site-conhecido@outro-site` ali seria um botão que faz
         outra coisa.
     3 · `salvar_ordem()`: grava SÓ a ordem, e só quem lidera o ministério.
         Leva junto a ordem que a tela tinha lido: se ela mudou no meio
         (outro líder salvou antes), volta MUDOU com a ordem nova, e ninguém
         apaga o trabalho do outro em silêncio.
     4 · `musicas_do_ministerio()`: o banco de músicas que nasce sozinho das
         ordens já montadas. Cada música uma vez, pelo título, com o último
         tom, BPM, artista e cifra, quantas vezes já tocou, a última vez e a
         próxima. Ninguém cadastra música: montar o culto é o cadastro.
     5 · `eu_ordens()`: a ordem de cada culto em que a pessoa serve nos
         próximos 60 dias, de TODO ministério que ligou o repertório. A
         banda vê o tom e a cifra; a projeção da Mídia prepara as letras
         pela ordem do Louvor. Porta pública (77), com o motivo escrito.

   A CONFERÊNCIA, no fim, monta dois ministérios de teste e desfaz tudo.

   O EDITOR DO SUPABASE NÃO MOSTRA NOTICE: a última linha é um select.

   ORDEM:  ... 103 → 104 → 105
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(105);
  end if;
  /* a 105 vem DEPOIS da 104. Rodada antes, a régua iria para 105 e a tranca
     de cima recusaria a 103 e a 104 quando chegasse a vez delas. */
  if to_regclass('public.schema_versao') is not null
     and not exists (select 1 from public.schema_versao where n = 104) then
    raise exception 'FALTA A 104: rode antes a 103 e a 104 (supabase/103-... e supabase/104-...). Nada foi mudado.';
  end if;
end $tranca$;

begin;

-- =========================================================================
-- 1 · o que é uma ordem de culto que pode virar tela e botão
-- =========================================================================
create or replace function public.ordem_valida(p jsonb)
returns boolean language plpgsql immutable set search_path = public as $fn$
declare it jsonb; k text; v jsonb; tipo text; s text; n numeric; teto int;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'array' then return false; end if;
  if jsonb_array_length(p) > 40 then return false; end if;
  for it in select x.value from jsonb_array_elements(p) x loop
    if jsonb_typeof(it) <> 'object' then return false; end if;
    if jsonb_typeof(it -> 't') is distinct from 'string' then return false; end if;
    tipo := it ->> 't';
    if tipo not in ('musica', 'momento') then return false; end if;
    if jsonb_typeof(it -> 'titulo') is distinct from 'string' then return false; end if;
    for k, v in select e.key, e.value from jsonb_each(it) e loop
      if k = 't' then
        continue;
      elsif k in ('titulo', 'artista', 'quem', 'nota') then
        if jsonb_typeof(v) <> 'string' then return false; end if;
        if k = 'artista' and tipo <> 'musica' then return false; end if;
        s := v #>> '{}';
        /* aparado, não vazio, sem quebra de linha nem tabulação: o texto vai
           para uma linha da mensagem do grupo e para uma linha da tela */
        if s <> btrim(s) or s = '' or s ~ '[[:cntrl:]]' then return false; end if;
        teto := case k when 'titulo' then 80 when 'artista' then 60
                       when 'quem' then 40 else 140 end;
        if length(s) > teto then return false; end if;
      elsif k = 'tom' then
        if tipo <> 'musica' or jsonb_typeof(v) <> 'string' then return false; end if;
        if (v #>> '{}') !~ '^[A-G](#|b)?m?$' then return false; end if;
      elsif k in ('bpm', 'min') then
        if jsonb_typeof(v) <> 'number' then return false; end if;
        if k = 'bpm' and tipo <> 'musica' then return false; end if;
        n := (v #>> '{}')::numeric;
        if n <> trunc(n) then return false; end if;
        if k = 'bpm' and (n < 30 or n > 300) then return false; end if;
        if k = 'min' and (n < 1 or n > 240) then return false; end if;
      elsif k = 'cifra' then
        if tipo <> 'musica' or jsonb_typeof(v) <> 'string' then return false; end if;
        s := v #>> '{}';
        if length(s) > 500 then return false; end if;
        /* https, um domínio de verdade logo depois (sem usuário@, sem IP),
           porta opcional, e o resto sem espaço, aspas, sinal de tag nem
           barra invertida */
        if s !~* '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}(:[0-9]{1,5})?([/?#].*)?$' then
          return false;
        end if;
        if s ~ '[[:space:][:cntrl:]<>"''\\]' then return false; end if;
      else
        return false;                                    -- chave que não é da ordem
      end if;
    end loop;
  end loop;
  return true;
end $fn$;
revoke all on function public.ordem_valida(jsonb) from public, anon;
grant execute on function public.ordem_valida(jsonb) to authenticated;
comment on function public.ordem_valida(jsonb) is
  '105: o CHECK de culto_obs.ordem. Ate 40 itens {t: musica|momento, titulo, artista, tom, bpm, cifra, quem, min, nota}; tom como G, F#m, Bb; bpm 30 a 300; min 1 a 240; cifra so https de dominio.';

-- =========================================================================
-- 2 · a coluna, com o CHECK
-- =========================================================================
alter table culto_obs add column if not exists ordem jsonb;
alter table culto_obs drop constraint if exists culto_obs_ordem_ok;
alter table culto_obs add constraint culto_obs_ordem_ok check (public.ordem_valida(ordem));
comment on column culto_obs.ordem is
  '105: a ordem do culto deste ministerio, item por item (musica com tom, BPM e cifra; momento com quem e duracao). Grava por salvar_ordem(); quem serve no culto ve por eu_ordens() quando config.dados.repertorio esta ligado no ministerio.';

-- =========================================================================
-- 3 · gravar só a ordem, sem apagar a edição de outro líder
-- =========================================================================
create or replace function public.salvar_ordem(p_culto uuid, p_equipe uuid, p_ordem jsonb, p_antes jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $fn$
declare v_nova jsonb; v_atual jsonb; v_ruim boolean;
begin
  if not public.lidera_equipe(p_equipe) then
    return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO');
  end if;
  if not exists (select 1 from cultos where id = p_culto) then
    return jsonb_build_object('ok', false, 'erro', 'CULTO_INEXISTENTE');
  end if;
  if p_ordem is not null and jsonb_typeof(p_ordem) <> 'array' then
    return jsonb_build_object('ok', false, 'erro', 'ORDEM_INVALIDA');
  end if;
  select bool_or(jsonb_typeof(x.value) <> 'object') into v_ruim
    from jsonb_array_elements(coalesce(p_ordem, '[]'::jsonb)) x;
  if coalesce(v_ruim, false) then
    return jsonb_build_object('ok', false, 'erro', 'ORDEM_INVALIDA');
  end if;

  /* texto aparado; campo apagado (vazio ou nulo) é chave fora */
  select coalesce(jsonb_agg(t.item order by t.ord), '[]'::jsonb) into v_nova
    from (select x.ord,
                 (select coalesce(jsonb_object_agg(e.key,
                           case when jsonb_typeof(e.value) = 'string'
                                then to_jsonb(btrim(e.value #>> '{}')) else e.value end), '{}'::jsonb)
                    from jsonb_each(x.value) e
                   where jsonb_typeof(e.value) <> 'null'
                     and not (jsonb_typeof(e.value) = 'string' and btrim(e.value #>> '{}') = '')) as item
            from jsonb_array_elements(coalesce(p_ordem, '[]'::jsonb)) with ordinality x(value, ord)) t;
  if not public.ordem_valida(v_nova) then
    return jsonb_build_object('ok', false, 'erro', 'ORDEM_INVALIDA');
  end if;

  /* a linha nasce se não existe, e fica TRAVADA até o fim: dois líderes
     salvando juntos passam um de cada vez, e o segundo vê o que o primeiro
     gravou */
  insert into culto_obs (culto_id, equipe_id) values (p_culto, p_equipe)
    on conflict (culto_id, equipe_id) do nothing;
  select o.ordem into v_atual from culto_obs o
   where o.culto_id = p_culto and o.equipe_id = p_equipe
     for update;
  if coalesce(v_atual, '[]'::jsonb) is distinct from coalesce(p_antes, '[]'::jsonb) then
    return jsonb_build_object('ok', false, 'erro', 'MUDOU', 'ordem', coalesce(v_atual, '[]'::jsonb));
  end if;

  update culto_obs
     set ordem = case when jsonb_array_length(v_nova) = 0 then null else v_nova end
   where culto_id = p_culto and equipe_id = p_equipe;
  return jsonb_build_object('ok', true, 'ordem', v_nova);
end $fn$;
revoke all on function public.salvar_ordem(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.salvar_ordem(uuid, uuid, jsonb, jsonb) to authenticated;

-- =========================================================================
-- 4 · o banco de músicas que nasce das ordens
-- =========================================================================
create or replace function public.musicas_do_ministerio(p_equipe uuid)
returns table(titulo text, artista text, tom text, bpm int, cifra text,
              vezes int, ultima date, proxima date)
language plpgsql stable security invoker set search_path = public as $fn$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.lidera_equipe(p_equipe) then return; end if;
  return query
  with itens as (
    select c.data, x.value as it, lower(btrim(x.value ->> 'titulo')) as chave
      from culto_obs o
      join cultos c on c.id = o.culto_id
     cross join lateral jsonb_array_elements(
             case when jsonb_typeof(o.ordem) = 'array' then o.ordem else '[]'::jsonb end) x
     where o.equipe_id = p_equipe
       and x.value ->> 't' = 'musica'
  ), ultimo as (
    /* o jeito mais recente de tocar: é o que vale para a próxima vez */
    select distinct on (i.chave) i.chave, i.it
      from itens i order by i.chave, i.data desc
  ), conta as (
    select i.chave,
           (count(*) filter (where i.data <= v_hoje))::int as vezes,
           max(i.data) filter (where i.data <= v_hoje) as ultima,
           min(i.data) filter (where i.data > v_hoje) as proxima
      from itens i group by i.chave
  )
  select u.it ->> 'titulo', u.it ->> 'artista', u.it ->> 'tom', (u.it ->> 'bpm')::int, u.it ->> 'cifra',
         k.vezes, k.ultima, k.proxima
    from ultimo u join conta k on k.chave = u.chave
   order by coalesce(k.ultima, k.proxima) desc nulls last, u.it ->> 'titulo'
   limit 500;
end $fn$;
revoke all on function public.musicas_do_ministerio(uuid) from public, anon;
grant execute on function public.musicas_do_ministerio(uuid) to authenticated;

-- =========================================================================
-- 5 · a ordem para quem serve no culto, de todo ministério que a publica
-- =========================================================================
create or replace function public.eu_ordens(p_token text)
returns table(culto_id uuid, data date, evento text, inicio time,
              equipe text, minha boolean, ordem jsonb)
language plpgsql stable security definer set search_path = public as $fn$
declare v_id uuid; v_eq uuid; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select v.id, v.equipe_id into v_id, v_eq
    from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  return query
  with meus as (
    /* os cultos em que a pessoa serve: escalada (menos onde disse que não
       pode) ou de plantão */
    select c.id, c.data, c.evento, c.inicio
      from cultos c
     where c.data between v_hoje and v_hoje + 60
       and (exists (select 1 from escalacoes e
                     where e.culto_id = c.id and e.voluntario_id = v_id
                       and coalesce(e.status, 'pendente') <> 'recusado')
            or exists (select 1 from plantoes p
                        where p.culto_id = c.id and p.voluntario_id = v_id))
  )
  select m.id, m.data, m.evento, m.inicio, q.nome, o.equipe_id = v_eq, o.ordem
    from meus m
    join culto_obs o on o.culto_id = m.id
    join equipes q on q.id = o.equipe_id
   where jsonb_typeof(o.ordem) = 'array' and jsonb_array_length(o.ordem) > 0
     /* só a de ministério com o repertório ligado: desligar nos Ajustes
        tira a ordem da tela de todo mundo, como tira os links (100) */
     and exists (select 1 from config cf
                  where cf.equipe_id = o.equipe_id
                    and coalesce(cf.dados ->> 'repertorio', '') = 'true')
   order by m.data, m.inicio nulls first, (o.equipe_id = v_eq) desc, q.nome;
end $fn$;
revoke all on function public.eu_ordens(text) from public;
grant execute on function public.eu_ordens(text) to anon, authenticated;

-- =========================================================================
-- 6 · inventário da porta pública (77)
-- =========================================================================
do $porta$ begin
  if to_regclass('public.porta_publica') is null then
    raise notice 'PULEI o inventario: este banco nao tem porta_publica (falta a 77).';
    return;
  end if;
  insert into public.porta_publica (funcao, motivo, n) values
    ('eu_ordens(p_token text)',
     'a ordem dos cultos em que a pessoa serve nos proximos 60 dias (musicas com tom, BPM e cifra; momentos com duracao), de todo ministerio com o repertorio ligado (105).', 105)
  on conflict (funcao) do update set motivo = excluded.motivo, n = excluded.n;
end $porta$;

-- =========================================================================
-- 7 · conferência
-- =========================================================================
do $conf$
declare
  falhas text[] := '{}';
  r record; v_n int; v_txt text;
  m jsonb := '{}'::jsonb;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dia date;
  v_eq uuid; v_eq2 uuid; v_eq3 uuid;
  v_fv uuid; v_fb uuid; v_fp uuid; v_fx uuid;
  v_ana uuid; v_bia uuid; v_caio uuid; v_duda uuid; v_eva uuid;
  t_ana text; t_bia text; t_caio text; t_duda text; t_eva text;
  v_culto uuid; v_passado uuid; v_outro uuid;
  v_j jsonb;
  boa constant jsonb := '[
    {"t":"momento","titulo":"Abertura","quem":"Pastor","min":5},
    {"t":"musica","titulo":"Bondade de Deus","artista":"Artista Exemplo","tom":"G","bpm":68,
     "cifra":"https://www.cifraclub.com.br/artista-exemplo/bondade-de-deus/","quem":"Bia","min":6,"nota":"Comeca so voz e teclado"},
    {"t":"musica","titulo":"Ousado Amor","tom":"F#m","bpm":72},
    {"t":"momento","titulo":"Palavra","min":40}
  ]';
begin
  /* 1 · o que é ordem válida, pela função */
  m := m || jsonb_build_object('valida_boa', ordem_valida(boa));
  m := m || jsonb_build_object('valida_vazia', ordem_valida('[]'));
  m := m || jsonb_build_object('valida_nula', ordem_valida(null));
  for r in select * from (values
      ('nao_lista',        '{"t":"musica","titulo":"x"}'),
      ('item_texto',       '["x"]'),
      ('sem_t',            '[{"titulo":"x"}]'),
      ('t_outro',          '[{"t":"video","titulo":"x"}]'),
      ('t_numero',         '[{"t":1,"titulo":"x"}]'),
      ('sem_titulo',       '[{"t":"musica","tom":"G"}]'),
      ('titulo_vazio',     '[{"t":"musica","titulo":""}]'),
      ('titulo_espaco',    '[{"t":"musica","titulo":" x"}]'),
      ('titulo_quebra',    '[{"t":"musica","titulo":"a\nb"}]'),
      ('chave_estranha',   '[{"t":"musica","titulo":"x","letra":"..."}]'),
      ('tom_h',            '[{"t":"musica","titulo":"x","tom":"H"}]'),
      ('tom_mm',           '[{"t":"musica","titulo":"x","tom":"Gmm"}]'),
      ('tom_momento',      '[{"t":"momento","titulo":"x","tom":"G"}]'),
      ('artista_momento',  '[{"t":"momento","titulo":"x","artista":"y"}]'),
      ('bpm_texto',        '[{"t":"musica","titulo":"x","bpm":"72"}]'),
      ('bpm_quebrado',     '[{"t":"musica","titulo":"x","bpm":72.5}]'),
      ('bpm_baixo',        '[{"t":"musica","titulo":"x","bpm":10}]'),
      ('bpm_alto',         '[{"t":"musica","titulo":"x","bpm":301}]'),
      ('min_zero',         '[{"t":"momento","titulo":"x","min":0}]'),
      ('min_alto',         '[{"t":"momento","titulo":"x","min":241}]'),
      ('cifra_http',       '[{"t":"musica","titulo":"x","cifra":"http://www.cifraclub.com.br/x"}]'),
      ('cifra_js',         '[{"t":"musica","titulo":"x","cifra":"javascript:alert(1)"}]'),
      ('cifra_usuario',    '[{"t":"musica","titulo":"x","cifra":"https://cifraclub.com.br@golpe.com/x"}]'),
      ('cifra_ip',         '[{"t":"musica","titulo":"x","cifra":"https://169.254.169.254/x"}]'),
      ('cifra_aspas',      '[{"t":"musica","titulo":"x","cifra":"https://cifraclub.com.br/a\"b"}]'),
      ('cifra_espaco',     '[{"t":"musica","titulo":"x","cifra":"https://cifraclub.com.br/a b"}]'),
      ('cifra_momento',    '[{"t":"momento","titulo":"x","cifra":"https://cifraclub.com.br/x"}]')
    ) as x(caso, j)
  loop
    if ordem_valida(r.j::jsonb) then falhas := falhas || format('ordem_valida aceitou %s', r.caso); end if;
  end loop;
  if ordem_valida(jsonb_build_array(jsonb_build_object('t', 'musica', 'titulo', repeat('a', 81)))) then
    falhas := falhas || 'ordem_valida aceitou titulo com 81 caracteres'::text; end if;
  if ordem_valida(jsonb_build_array(jsonb_build_object('t', 'musica', 'titulo', 'x',
       'cifra', 'https://cifraclub.com.br/' || repeat('a', 480)))) then
    falhas := falhas || 'ordem_valida aceitou cifra com mais de 500 caracteres'::text; end if;
  if ordem_valida((select jsonb_agg(jsonb_build_object('t', 'momento', 'titulo', 'x' || g)) from generate_series(1, 41) g)) then
    falhas := falhas || 'ordem_valida aceitou 41 itens'::text; end if;
  if not ordem_valida((select jsonb_agg(jsonb_build_object('t', 'momento', 'titulo', 'x' || g)) from generate_series(1, 40) g)) then
    falhas := falhas || 'ordem_valida recusou 40 itens'::text; end if;

  /* 2 · estrutura: a coluna tem o CHECK, as portas certas, nada sobrando */
  if not exists (select 1 from pg_constraint where conname = 'culto_obs_ordem_ok'
                  and conrelid = 'public.culto_obs'::regclass) then
    falhas := falhas || 'culto_obs sem o CHECK da ordem'::text; end if;
  if has_function_privilege('anon', 'public.salvar_ordem(uuid,uuid,jsonb,jsonb)', 'execute') then
    falhas := falhas || 'salvar_ordem alcancavel por anon'::text; end if;
  if has_function_privilege('anon', 'public.musicas_do_ministerio(uuid)', 'execute') then
    falhas := falhas || 'musicas_do_ministerio alcancavel por anon'::text; end if;
  if has_function_privilege('anon', 'public.ordem_valida(jsonb)', 'execute') then
    falhas := falhas || 'ordem_valida alcancavel por anon'::text; end if;
  if not has_function_privilege('anon', 'public.eu_ordens(text)', 'execute') then
    falhas := falhas || 'eu_ordens sem grant para anon'::text; end if;
  if not (select prosecdef from pg_proc where oid = 'public.eu_ordens(text)'::regprocedure) then
    falhas := falhas || 'eu_ordens nao e security definer'::text; end if;
  if (select prosecdef from pg_proc where oid = 'public.salvar_ordem(uuid,uuid,jsonb,jsonb)'::regprocedure) then
    falhas := falhas || 'salvar_ordem virou security definer (passaria por cima da RLS)'::text; end if;
  if to_regprocedure('public.testar_porta_publica()') is not null then
    select count(*), string_agg(t.caso || ' (' || t.obtido || ')', '; ') into v_n, v_txt
      from public.testar_porta_publica() t where not t.passou;
    if v_n > 0 then falhas := falhas || format('porta publica reprovou: %s', v_txt); end if;
  end if;

  /* 3 · o caminho inteiro, em três ministérios de teste (desfeito no fim) */
  begin
    v_dia := v_hoje + 8;
    while extract(dow from v_dia) <> 0 loop v_dia := v_dia + 1; end loop;
    insert into equipes (nome, slug, ordem) values ('CONF105 Louvor', 'conf105-louvor', 995) returning id into v_eq;
    insert into equipes (nome, slug, ordem) values ('CONF105 Midia', 'conf105-midia', 996) returning id into v_eq2;
    insert into equipes (nome, slug, ordem) values ('CONF105 Kids', 'conf105-kids', 997) returning id into v_eq3;
    insert into lideres (email, equipe_id) values ('conf105-louvor@exemplo.invalid', v_eq);
    insert into lideres (email, equipe_id) values ('conf105-midia@exemplo.invalid', v_eq2);
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq, 'CONF105 VOZ', 1, true, true, array['domingo','follow']) returning id into v_fv;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq, 'CONF105 BAIXO', 2, true, true, array['domingo','follow']) returning id into v_fb;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq2, 'CONF105 PROJECAO', 1, true, true, array['domingo','follow']) returning id into v_fp;
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq3, 'CONF105 SALA', 1, true, true, array['domingo','follow']) returning id into v_fx;
    insert into voluntarios (equipe_id, nome, telefone, ativo) values (v_eq,  'Ana Conf Cento Cinco',  '21900105001', true)  returning id, token into v_ana, t_ana;
    insert into voluntarios (equipe_id, nome, telefone, ativo) values (v_eq2, 'Bia Conf Cento Cinco',  '21900105002', true)  returning id, token into v_bia, t_bia;
    insert into voluntarios (equipe_id, nome, telefone, ativo) values (v_eq,  'Caio Conf Cento Cinco', '21900105003', true)  returning id, token into v_caio, t_caio;
    insert into voluntarios (equipe_id, nome, telefone, ativo) values (v_eq2, 'Duda Conf Cento Cinco', '21900105004', true)  returning id, token into v_duda, t_duda;
    insert into voluntarios (equipe_id, nome, telefone, ativo) values (v_eq,  'Eva Conf Cento Cinco',  '21900105005', false) returning id, token into v_eva, t_eva;
    insert into habilidades (voluntario_id, funcao_id, nivel) values
      (v_ana, v_fv, 'titular'), (v_bia, v_fp, 'titular'), (v_caio, v_fb, 'titular'),
      (v_duda, v_fp, 'titular'), (v_eva, v_fv, 'titular');

    /* o domingo de teste (o do banco, se já existir); um culto passado e um
       evento do Kids no mesmo dia, para a ordem dele NÃO aparecer */
    select id into v_culto from cultos where data = v_dia and evento is null;
    if v_culto is null then insert into cultos (data) values (v_dia) returning id into v_culto; end if;
    insert into cultos (data, evento, equipe_id) values (v_hoje - 14, 'CONF105 passado', v_eq) returning id into v_passado;
    insert into cultos (data, evento, equipe_id, inicio) values (v_dia, 'CONF105 Kids', v_eq3, time '16:00') returning id into v_outro;

    /* Ana (Louvor) e Bia (Mídia) servem no domingo; Caio (Louvor) disse que
       não pode; Duda (Mídia) está de plantão; Eva está inativa */
    insert into escalacoes (culto_id, funcao_id, voluntario_id, status) values
      (v_culto, v_fv, v_ana, 'pendente'), (v_culto, v_fp, v_bia, 'confirmado'),
      (v_culto, v_fb, v_caio, 'recusado'), (v_passado, v_fv, v_ana, 'confirmado');
    insert into plantoes (culto_id, voluntario_id) values (v_culto, v_duda);

    insert into config (equipe_id, dados) values (v_eq, '{"repertorio": true}') on conflict do nothing;
    update config set dados = coalesce(dados, '{}'::jsonb) || '{"repertorio": true}' where equipe_id = v_eq;
    insert into config (equipe_id, dados) values (v_eq3, '{"repertorio": true}') on conflict do nothing;
    update config set dados = coalesce(dados, '{}'::jsonb) || '{"repertorio": true}' where equipe_id = v_eq3;

    /* o CHECK segura até quem escreve direto na tabela */
    begin
      insert into culto_obs (culto_id, equipe_id, ordem)
           values (v_culto, v_eq3, '[{"t":"musica","titulo":"x","cifra":"javascript:x"}]');
      m := m || jsonb_build_object('check_direto', 'passou');
    exception when check_violation then
      m := m || jsonb_build_object('check_direto', 'barrou');
    end;

    /* a ordem do Kids no evento dele, que ninguém daqui serve */
    insert into culto_obs (culto_id, equipe_id, ordem)
         values (v_outro, v_eq3, '[{"t":"momento","titulo":"Kids","min":30}]');

    /* a líder do Louvor grava; o texto chega aparado e o campo vazio sai */
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf105-louvor@exemplo.invalid","role":"authenticated"}', true);
    v_j := salvar_ordem(v_culto, v_eq,
             '[{"t":"musica","titulo":"  Bondade de Deus ","artista":"","tom":"G","bpm":68,"quem":null},
               {"t":"momento","titulo":"Palavra","min":40}]', '[]');
    m := m || jsonb_build_object('grava', v_j ->> 'ok');
    m := m || jsonb_build_object('grava_limpa', (v_j -> 'ordem' -> 0)::text);
    /* a tela que leu antes da gravação tenta salvar por cima: MUDOU, com a nova */
    v_j := salvar_ordem(v_culto, v_eq, '[{"t":"momento","titulo":"Outra coisa"}]', '[]');
    m := m || jsonb_build_object('mudou', v_j ->> 'erro');
    m := m || jsonb_build_object('mudou_traz', jsonb_array_length(v_j -> 'ordem'));
    /* com a ordem certa na mão, grava: a ordem nova inteira */
    v_j := salvar_ordem(v_culto, v_eq, boa,
             '[{"t":"musica","titulo":"Bondade de Deus","tom":"G","bpm":68},{"t":"momento","titulo":"Palavra","min":40}]');
    m := m || jsonb_build_object('regrava', v_j ->> 'ok');
    /* ordem ruim não grava, e não apaga a que está lá */
    v_j := salvar_ordem(v_culto, v_eq, '[{"t":"musica","titulo":"x","tom":"H"}]', boa);
    m := m || jsonb_build_object('ruim', v_j ->> 'erro');
    v_j := salvar_ordem(v_culto, v_eq, '{"t":"musica"}', boa);
    m := m || jsonb_build_object('nao_lista', v_j ->> 'erro');
    v_j := salvar_ordem(v_culto, v_eq, '["x"]', boa);
    m := m || jsonb_build_object('item_texto', v_j ->> 'erro');
    v_j := salvar_ordem(gen_random_uuid(), v_eq, boa, '[]');
    m := m || jsonb_build_object('sem_culto', v_j ->> 'erro');
    /* o culto passado, com a mesma música escrita de outro jeito e outro tom */
    v_j := salvar_ordem(v_passado, v_eq, '[{"t":"musica","titulo":"bondade de deus","tom":"A","bpm":70}]', '[]');
    m := m || jsonb_build_object('grava_passado', v_j ->> 'ok');
    /* o banco de músicas do Louvor */
    m := m || jsonb_build_object('musicas',
           (select string_agg(format('%s|%s|%s|%s|%s|%s', titulo, coalesce(tom, '-'), coalesce(bpm::text, '-'),
                                     vezes, (ultima is not null), (proxima is not null)), ';' order by titulo)
              from musicas_do_ministerio(v_eq)));
    /* a líder da Mídia não grava no Louvor e não lê o banco dele */
    perform set_config('request.jwt.claims', '{"email":"conf105-midia@exemplo.invalid","role":"authenticated"}', true);
    v_j := salvar_ordem(v_culto, v_eq, '[]', boa);
    m := m || jsonb_build_object('alheia', v_j ->> 'erro');
    m := m || jsonb_build_object('musicas_alheia', (select count(*) from musicas_do_ministerio(v_eq)));
    reset role;
    m := m || jsonb_build_object('ficou', (select jsonb_array_length(ordem) from culto_obs
                                            where culto_id = v_culto and equipe_id = v_eq));

    /* 4 · quem serve vê */
    m := m || jsonb_build_object('ana',
           (select string_agg(format('%s:%s:%s', equipe, minha, jsonb_array_length(ordem)), ',') from eu_ordens(t_ana)));
    m := m || jsonb_build_object('bia',
           (select string_agg(format('%s:%s:%s', equipe, minha, jsonb_array_length(ordem)), ',') from eu_ordens(t_bia)));
    m := m || jsonb_build_object('caio_recusou', (select count(*) from eu_ordens(t_caio)));
    m := m || jsonb_build_object('duda_plantao', (select count(*) from eu_ordens(t_duda)));
    begin
      perform * from eu_ordens(t_eva);
      m := m || jsonb_build_object('inativa', 'viu');
    exception when others then
      m := m || jsonb_build_object('inativa', sqlerrm);
    end;
    begin
      perform * from eu_ordens('nao-existe-' || md5(random()::text));
      m := m || jsonb_build_object('token_falso', 'viu');
    exception when others then
      m := m || jsonb_build_object('token_falso', sqlerrm);
    end;
    /* desligado o repertório, a ordem some da tela de todo mundo */
    update config set dados = dados || '{"repertorio": false}' where equipe_id = v_eq;
    m := m || jsonb_build_object('desligado', (select count(*) from eu_ordens(t_bia)));
    /* apagar tudo pela tela deixa a coluna vazia */
    update config set dados = dados || '{"repertorio": true}' where equipe_id = v_eq;
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf105-louvor@exemplo.invalid","role":"authenticated"}', true);
    v_j := salvar_ordem(v_culto, v_eq, '[]', boa);
    reset role;
    m := m || jsonb_build_object('apagou', coalesce(v_j ->> 'ok', '-') || ':' ||
           coalesce((select ordem::text from culto_obs where culto_id = v_culto and equipe_id = v_eq), 'nulo'));

    raise exception 'CONF105_DESFAZ';
  exception when others then
    if sqlerrm <> 'CONF105_DESFAZ' then
      falhas := falhas || ('o cenario nao montou: ' || sqlerrm)::text;
    end if;
  end;
  reset role;

  begin
    for r in select * from (values
        ('valida_boa',      'true'),
        ('valida_vazia',    'true'),
        ('valida_nula',     'true'),
        ('check_direto',    'barrou'),
        ('grava',           'true'),
        ('grava_limpa',     '{"t": "musica", "bpm": 68, "tom": "G", "titulo": "Bondade de Deus"}'),
        ('mudou',           'MUDOU'),
        ('mudou_traz',      '2'),
        ('regrava',         'true'),
        ('ruim',            'ORDEM_INVALIDA'),
        ('nao_lista',       'ORDEM_INVALIDA'),
        ('item_texto',      'ORDEM_INVALIDA'),
        ('sem_culto',       'CULTO_INEXISTENTE'),
        ('grava_passado',   'true'),
        ('musicas',         'Bondade de Deus|G|68|1|t|t;Ousado Amor|F#m|72|0|f|t'),
        ('alheia',          'SEM_PERMISSAO'),
        ('musicas_alheia',  '0'),
        ('ficou',           '4'),
        ('ana',             'CONF105 Louvor:t:4'),
        ('bia',             'CONF105 Louvor:f:4'),
        ('caio_recusou',    '0'),
        ('duda_plantao',    '1'),
        ('inativa',         'Link invalido'),
        ('token_falso',     'Link invalido'),
        ('desligado',       '0'),
        ('apagou',          'true:nulo')
      ) as x(chave, esperado)
    loop
      if (m ->> r.chave) is distinct from r.esperado then
        falhas := falhas || format('%s: obtido %s, esperado %s', r.chave, coalesce(m ->> r.chave, '(nada)'), r.esperado);
      end if;
    end loop;
  end;

  /* o cenário foi desfeito */
  if exists (select 1 from equipes where slug like 'conf105-%')
     or exists (select 1 from voluntarios where nome like '% Conf Cento Cinco')
     or exists (select 1 from lideres where email like 'conf105%@exemplo.invalid') then
    falhas := falhas || 'o cenario de teste ficou no banco'::text; end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'105 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  select count(*) into v_n from jsonb_object_keys(m);
  raise notice 'OK 105 · conferencia: % medidas da ordem do culto, do banco de musicas e da pagina de quem serve, todas como esperado. Cenario desfeito.', v_n;
end $conf$;

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (105, '105 · salvar_ordem confere quem lidera', 'salvar_ordem', 'lidera_equipe'),
      (105, '105 · salvar_ordem nao apaga a edicao do outro lider', 'salvar_ordem', 'MUDOU'),
      (105, '105 · a cifra nao aceita usuario@ nem javascript', 'ordem_valida', '^https://[a-z0-9]'),
      (105, '105 · a ordem so sai com o repertorio ligado', 'eu_ordens', 'repertorio'),
      (105, '105 · quem disse que nao pode nao recebe a ordem', 'eu_ordens', '''recusado''')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (105, '105-as-musicas-e-a-ordem-do-culto.sql')
  on conflict (n) do nothing;

commit;

/* o que o editor mostra: só números */
select '105' as versao,
       (select count(*) from culto_obs where ordem is not null) as ordens,
       (select count(*) from porta_publica where n = 105) as portas_novas,
       (select count(*) from testar_porta_publica() where not passou) as porta_reprovada,
       (select count(*) from schema_versao_conferir() where not passou) as sondas_reprovadas,
       (select count(*) from schema_versao_conferir()) as sondas;
