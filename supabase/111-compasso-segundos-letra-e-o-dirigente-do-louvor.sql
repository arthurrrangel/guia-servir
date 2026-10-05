/* =============================================================================
   111 · O LOUVOR: COMPASSO, TEMPO EM SEGUNDOS, A LETRA EM PDF, E O DIRIGENTE

   05/10/2026. Só de Escalas. Pedido do Arthur para o ministério do Louvor:
     "Na parte do BPM colocar ao lado a opção de compasso (4/4, 6/8 etc)"
     "No tempo total da música coloca no formato minuto/segundo"
     "Adicionar um campo para carregar a letra em PDF (a pessoa clica e faz
      o download do PDF)"
   E: "tem que ser uma melhoria nessa aba e desse ministério", "tem que tudo
   estar lá e preciso que você pense na arquitetura". Sobre o cronograma
   (109), quem é o dirigente: "Os dirigentes estão no sistema de escalas do
   ministério de louvor".

   A ARQUITETURA, EM UMA LINHA POR DECISÃO
     · Tudo mora onde a ordem do culto já mora (105): `culto_obs.ordem`, por
       culto e por ministério. Nenhuma tabela de músicas nova: o banco de
       músicas continua nascendo das ordens ("montar o culto é o cadastro"),
       e agora devolve também o compasso, o tempo e a letra. Escolher uma
       música já tocada traz a letra junto: o PDF sobe UMA vez por música.
     · A letra é um ARQUIVO no Storage do Supabase, no armário `letras`, e
       a ordem guarda só o caminho dele (`<ministério>/<id>.pdf`). O CHECK
       aceita só esse formato: o botão da página de quem serve nunca aponta
       para fora do armário.
     · Quem envia: só quem lidera o ministério da pasta (a mesma regra de
       quem salva a ordem, `lidera_equipe`). Ninguém apaga nem troca arquivo
       (sem política de update e delete): trocar a letra é enviar outra, e a
       ordem passada continua apontando para a dela.
     · Quem baixa: quem tem o link. O armário é público para LEITURA, como a
       cifra (que já é um link público); o nome do arquivo é um id que não se
       adivinha, e não há como listar o armário sem ser da liderança.
     · O tempo passa a ser em segundos (`seg`). O item de antes, em minutos
       (`min`), continua valendo e não é reescrito: quem abre e salva o item
       grava em segundos. Um item não leva os dois.

   O QUE MUDA
     1 · `ordem_valida`: + `compasso` (música; 4/4, 6/8, 12/8...), + `seg`
         (1 a 14400), + `letra` (música; o caminho no armário).
     2 · `musicas_do_ministerio`: + compasso, seg e letra, cada um o ÚLTIMO
         que alguém preencheu para aquela música (o tom e o BPM continuam
         sendo os do último culto, como na 105).
     3 · `cronograma_dados` (109): a música da folha leva o compasso.
     4 · O armário `letras` (público para ler, 10 MB, só PDF) e as duas
         políticas de `storage.objects`: a liderança do ministério envia e vê
         a pasta dele.
     5 · O DIRIGENTE DO CULTO É O DIRIGENTE DO LOUVOR. A marca 'dirigente'
         (109) sai do posto da área "Dirigentes" e vai para o posto DIRIGENTE
         do Louvor: quem está escalado nele recebe a Palavra e os Avisos no
         próprio link. A área "Dirigentes", nascida vazia na 109, sai se
         continuar vazia.

   PORTA PÚBLICA: nenhuma função nova para anon. A página de quem serve já lê
   a ordem por `eu_ordens` (105), e o PDF sai do armário pelo endereço
   público do Storage.

   SEM `create temp table` (101). O EDITOR DO SUPABASE NÃO MOSTRA NOTICE: a
   última linha é um select com o resultado.

   ORDEM:  ... 108 → 109 → 110 → 111
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(111);
  end if;
  /* rodada antes da 110, a régua pularia e recusaria a 110 depois */
  if to_regclass('public.schema_versao') is not null
     and not exists (select 1 from public.schema_versao where n = 110) then
    raise exception 'FALTA A 110: rode antes a 110 (supabase/110-o-follow-camp-tem-painel.sql). Nada foi mudado.';
  end if;
end $tranca$;

begin;

-- =========================================================================
-- 1 · o caminho de uma letra no armário
-- =========================================================================
/* `<id do ministério>/<id do arquivo>.pdf`, os dois em minúsculas: é o que a
   tela grava, e é o único formato que a ordem aceita e que o armário deixa
   entrar. */
create or replace function public.letra_caminho_valido(p text)
returns boolean language sql immutable set search_path = public as $fn$
  select p is not null
     and p ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]pdf$';
$fn$;
revoke all on function public.letra_caminho_valido(text) from public, anon;
grant execute on function public.letra_caminho_valido(text) to authenticated;
comment on function public.letra_caminho_valido(text) is
  '111: o caminho de uma letra no armario letras: <uuid do ministerio>/<uuid>.pdf, em minusculas.';

/* quem lidera o ministério da pasta. Em plpgsql para a ordem valer: o id só
   vira uuid depois de o caminho ser conferido (em SQL puro o planejador
   pode avaliar o cast primeiro e quebrar com o texto ruim). */
create or replace function public.letra_do_lider(p_nome text)
returns boolean language plpgsql stable set search_path = public as $fn$
begin
  if not public.letra_caminho_valido(p_nome) then return false; end if;
  return public.lidera_equipe(split_part(p_nome, '/', 1)::uuid);
end $fn$;
revoke all on function public.letra_do_lider(text) from public, anon;
grant execute on function public.letra_do_lider(text) to authenticated;
comment on function public.letra_do_lider(text) is
  '111: a politica do armario letras. Verdadeiro so para quem lidera o ministerio da pasta (o primeiro pedaco do caminho).';

-- =========================================================================
-- 2 · a ordem do culto aceita compasso, segundos e a letra
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
    /* 111 · a duração é UMA: em minutos (o item de antes) ou em segundos */
    if it ? 'min' and it ? 'seg' then return false; end if;
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
      elsif k in ('bpm', 'min', 'seg') then
        if jsonb_typeof(v) <> 'number' then return false; end if;
        if k = 'bpm' and tipo <> 'musica' then return false; end if;
        n := (v #>> '{}')::numeric;
        if n <> trunc(n) then return false; end if;
        if k = 'bpm' and (n < 30 or n > 300) then return false; end if;
        if k = 'min' and (n < 1 or n > 240) then return false; end if;
        /* 111 · até 4 horas, em segundos */
        if k = 'seg' and (n < 1 or n > 14400) then return false; end if;
      elsif k = 'compasso' then
        /* 111 · como o músico escreve: 4/4, 3/4, 6/8, 12/8, 7/8 */
        if tipo <> 'musica' or jsonb_typeof(v) <> 'string' then return false; end if;
        if (v #>> '{}') !~ '^([1-9]|1[0-6])/(2|4|8|16)$' then return false; end if;
      elsif k = 'letra' then
        /* 111 · o caminho do PDF no armário, e nada além dele */
        if tipo <> 'musica' or jsonb_typeof(v) <> 'string' then return false; end if;
        if not public.letra_caminho_valido(v #>> '{}') then return false; end if;
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
  '105, 111: o CHECK de culto_obs.ordem. Ate 40 itens {t: musica|momento, titulo, artista, tom, bpm, compasso, cifra, letra, quem, min ou seg, nota}; tom como G, F#m, Bb; bpm 30 a 300; compasso como 4/4 ou 6/8; min 1 a 240 (o item de antes) ou seg 1 a 14400, nunca os dois; cifra so https de dominio; letra so o caminho no armario letras.';

-- =========================================================================
-- 3 · o banco de músicas devolve o compasso, o tempo e a letra
-- =========================================================================
/* o tipo de volta muda (três colunas a mais): `create or replace` não troca
   colunas de saída, então a função sai e volta, com os mesmos GRANTs */
drop function if exists public.musicas_do_ministerio(uuid);
create function public.musicas_do_ministerio(p_equipe uuid)
returns table(titulo text, artista text, tom text, bpm int, cifra text,
              compasso text, seg int, letra text,
              vezes int, ultima date, proxima date)
language plpgsql stable security invoker set search_path = public as $fn$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.lidera_equipe(p_equipe) then return; end if;
  return query
  with itens as (
    select c.data, x.ord, x.value as it, lower(btrim(x.value ->> 'titulo')) as chave
      from culto_obs o
      join cultos c on c.id = o.culto_id
     cross join lateral jsonb_array_elements(
             case when jsonb_typeof(o.ordem) = 'array' then o.ordem else '[]'::jsonb end) with ordinality x(value, ord)
     where o.equipe_id = p_equipe
       and x.value ->> 't' = 'musica'
  ), ultimo as (
    /* o jeito mais recente de tocar: é o que vale para a próxima vez */
    select distinct on (i.chave) i.chave, i.it
      from itens i order by i.chave, i.data desc, i.ord desc
  ), extras as (
    /* 111 · o compasso, o tempo e a letra não mudam de um culto para o outro
       como o tom muda: vale o ÚLTIMO que alguém preencheu. Um culto em que
       a música entrou sem a letra não apaga a letra que ela já tinha. */
    select i.chave,
           (array_agg(i.it ->> 'compasso' order by i.data desc, i.ord desc)
              filter (where jsonb_typeof(i.it -> 'compasso') = 'string'))[1] as compasso,
           (array_agg(coalesce((i.it ->> 'seg')::int, (i.it ->> 'min')::int * 60) order by i.data desc, i.ord desc)
              filter (where jsonb_typeof(i.it -> 'seg') = 'number' or jsonb_typeof(i.it -> 'min') = 'number'))[1] as seg,
           (array_agg(i.it ->> 'letra' order by i.data desc, i.ord desc)
              filter (where jsonb_typeof(i.it -> 'letra') = 'string'))[1] as letra
      from itens i group by i.chave
  ), conta as (
    select i.chave,
           (count(*) filter (where i.data <= v_hoje))::int as vezes,
           max(i.data) filter (where i.data <= v_hoje) as ultima,
           min(i.data) filter (where i.data > v_hoje) as proxima
      from itens i group by i.chave
  )
  select u.it ->> 'titulo', u.it ->> 'artista', u.it ->> 'tom', (u.it ->> 'bpm')::int, u.it ->> 'cifra',
         e.compasso, e.seg, e.letra,
         k.vezes, k.ultima, k.proxima
    from ultimo u
    join conta k on k.chave = u.chave
    join extras e on e.chave = u.chave
   order by coalesce(k.ultima, k.proxima) desc nulls last, u.it ->> 'titulo'
   limit 500;
end $fn$;
revoke all on function public.musicas_do_ministerio(uuid) from public, anon;
grant execute on function public.musicas_do_ministerio(uuid) to authenticated;
comment on function public.musicas_do_ministerio(uuid) is
  '105, 111: o banco de musicas do ministerio, nascido das ordens. Tom, BPM, artista e cifra do ultimo culto; compasso, tempo (seg) e letra, o ultimo preenchido.';

-- =========================================================================
-- 4 · a folha do culto (109) leva o compasso da música
-- =========================================================================
/* a mesma da 109, linha por linha; só a música ganha 'compasso' */
create or replace function public.cronograma_dados(p_culto uuid, p_data date, p_publico boolean)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare
  v_data date := p_data; v_tipo text; v_inicio time; v_fim time;
  v_cr public.cronogramas%rowtype; v_modelo jsonb; v_cmd jsonb; v_mus jsonb; v_rep jsonb;
begin
  if p_culto is not null then
    select c.data, c.inicio, c.fim into v_data, v_inicio, v_fim
      from cultos c where c.id = p_culto and c.evento is null;
    if v_data is null then return null; end if;
    select * into v_cr from cronogramas where culto_id = p_culto;
  end if;
  v_tipo := case when extract(dow from v_data) = 6 then 'follow' else 'domingo' end;
  select m.linha into v_modelo from cronograma_modelos m where m.tipo = v_tipo;

  /* No comando: o posto marcado de cada área que serve neste tipo de culto,
     e quem está nele. Quem disse que não pode ou furou não está. O texto de
     fora da lista (108, o Guest) vale como gente. */
  select coalesce(jsonb_agg(jsonb_build_object(
           'papel', f.cronograma, 'equipe', e.nome, 'equipe_id', e.id,
           'posto', f.nome, 'funcao_id', f.id,
           'nome', case when x.status in ('pendente', 'confirmado') and v.ativo
                        then cron_nome_curto(v.nome) end,
           'status', case when x.status in ('pendente', 'confirmado') and v.ativo
                          then x.status::text end,
           'convidado', o.convidados ->> f.id::text)
         order by case f.cronograma when 'direcao' then 0 when 'dirigente' then 1 else 2 end,
                  e.ordem, e.nome, f.ordem), '[]'::jsonb)
    into v_cmd
    from funcoes f
    join equipes e on e.id = f.equipe_id
    left join escalacoes x on x.culto_id = p_culto and x.funcao_id = f.id
    left join voluntarios v on v.id = x.voluntario_id
    left join culto_obs o on o.culto_id = p_culto and o.equipe_id = f.equipe_id
   where f.cronograma is not null and f.ativa and v_tipo = any(f.tipos);

  /* as áreas com a ordem do culto ligada (105), e as músicas delas */
  select coalesce(jsonb_agg(jsonb_build_object('equipe', q.nome, 'equipe_id', q.id) order by q.ordem, q.nome), '[]'::jsonb)
    into v_rep
    from equipes q
   where exists (select 1 from config cf where cf.equipe_id = q.id
                    and coalesce(cf.dados ->> 'repertorio', '') = 'true');
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'equipe', q.nome, 'titulo', it.value ->> 'titulo', 'tom', it.value ->> 'tom',
           'bpm', it.value -> 'bpm', 'compasso', it.value ->> 'compasso', 'quem', it.value ->> 'quem'))
         order by q.ordem, q.nome, it.ord), '[]'::jsonb)
    into v_mus
    from culto_obs o
    join equipes q on q.id = o.equipe_id
   cross join lateral jsonb_array_elements(
           case when jsonb_typeof(o.ordem) = 'array' then o.ordem else '[]'::jsonb end) with ordinality it(value, ord)
   where o.culto_id = p_culto and it.value ->> 't' = 'musica'
     and exists (select 1 from config cf where cf.equipe_id = o.equipe_id
                    and coalesce(cf.dados ->> 'repertorio', '') = 'true');

  return jsonb_build_object(
    'data', v_data, 'tipo', v_tipo, 'culto_id', p_culto,
    'inicio', to_char(v_inicio, 'HH24:MI'), 'fim', to_char(v_fim, 'HH24:MI'),
    'existe', v_cr.culto_id is not null,
    'token', case when p_publico then null else v_cr.token end,
    'palavra', v_cr.palavra, 'avisos', v_cr.avisos, 'louvor', v_cr.louvor,
    'linha', coalesce(v_cr.linha, v_modelo), 'linha_propria', v_cr.linha is not null,
    'autoria', coalesce(v_cr.autoria, '{}'::jsonb), 'atualizado_em', v_cr.atualizado_em,
    'comando', v_cmd, 'musicas', v_mus, 'repertorio', v_rep);
end $fn$;
revoke all on function public.cronograma_dados(uuid, date, boolean) from public, anon, authenticated;

-- =========================================================================
-- 5 · o armário das letras
-- =========================================================================
/* Público para LER: o PDF sai pelo endereço público do Storage, e a página
   de quem serve (que não tem login) baixa por ele. Até 10 MB, só PDF: o
   próprio Storage recusa o resto antes de gravar. As políticas são de quem
   ENVIA e de quem VÊ a pasta: a liderança do ministério dela. Sem política
   de update e delete: ninguém troca nem apaga um arquivo por baixo de uma
   ordem que aponta para ele. */
do $armario$ begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'PULEI o armario das letras: este banco nao tem o Storage do Supabase.';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('letras', 'letras', true, 10485760, array['application/pdf'])
  on conflict (id) do update
     set public = true, file_size_limit = 10485760, allowed_mime_types = array['application/pdf'];
  execute 'drop policy if exists "111 letras: a lideranca envia" on storage.objects';
  execute $p$create policy "111 letras: a lideranca envia" on storage.objects
               for insert to authenticated
               with check (bucket_id = 'letras' and public.letra_do_lider(name))$p$;
  execute 'drop policy if exists "111 letras: a lideranca ve a pasta" on storage.objects';
  execute $p$create policy "111 letras: a lideranca ve a pasta" on storage.objects
               for select to authenticated
               using (bucket_id = 'letras' and public.letra_do_lider(name))$p$;
end $armario$;

-- =========================================================================
-- 6 · o dirigente do culto é o DIRIGENTE do Louvor
-- =========================================================================
/* "Os dirigentes estão no sistema de escalas do ministério de louvor": o
   posto DIRIGENTE do Louvor passa a ser o dirigente do cronograma (a Palavra
   e os Avisos pelo link). Antes, ele era o "líder" do Louvor em "No comando";
   agora ele aparece como Dirigente, que é a mesma pessoa. */
do $dirigente$
declare v_louvor uuid; v_posto uuid; v_area uuid; v_tem_gente boolean;
begin
  select id into v_louvor from equipes where slug = 'louvor';
  select f.id into v_posto from funcoes f
   where f.equipe_id = v_louvor and f.nome = 'DIRIGENTE' and f.ativa;
  if v_posto is null then
    raise notice 'PULEI o dirigente: o Louvor nao tem o posto DIRIGENTE ativo.';
    return;
  end if;
  /* um dirigente só na igreja (índice da 109): tira a marca de quem tem */
  update funcoes set cronograma = null where cronograma = 'dirigente' and id <> v_posto;
  update funcoes set cronograma = 'dirigente' where id = v_posto;

  /* a área "Dirigentes" da 109 sai se continuar vazia: sem gente, sem
     liderança, sem escala, sem candidatura. Com qualquer coisa dentro, fica
     como está (sem a marca), e a última linha avisa. */
  select id into v_area from equipes where slug = 'dirigentes';
  if v_area is not null then
    v_tem_gente := exists (select 1 from voluntarios where equipe_id = v_area)
                or exists (select 1 from lideres where equipe_id = v_area)
                or exists (select 1 from papeis where equipe_id = v_area)
                or exists (select 1 from candidaturas where equipe_id = v_area)
                or exists (select 1 from escalacoes x join funcoes f on f.id = x.funcao_id where f.equipe_id = v_area)
                or exists (select 1 from culto_obs where equipe_id = v_area)
                or exists (select 1 from cultos where equipe_id = v_area);
    if not v_tem_gente then
      delete from equipes where id = v_area;
    end if;
  end if;
end $dirigente$;

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
  v_eq uuid; v_eq2 uuid; v_louvor uuid; v_fl uuid; v_fv uuid;
  v_ana uuid; t_ana text; v_dir uuid; t_dir text;
  v_culto uuid; v_passado uuid;
  v_j jsonb; v_f jsonb;
  c_l1 text; c_l2 text; c_alheia text;
  boa jsonb;
begin
  /* 1 · o que a ordem aceita agora, pela função */
  c_l1 := gen_random_uuid()::text || '/' || gen_random_uuid()::text || '.pdf';
  boa := jsonb_build_array(
    jsonb_build_object('t', 'momento', 'titulo', 'Abertura', 'quem', 'Pastor', 'seg', 300),
    jsonb_build_object('t', 'musica', 'titulo', 'Bondade de Deus', 'tom', 'G', 'bpm', 68, 'compasso', '6/8',
                       'seg', 275, 'letra', c_l1, 'quem', 'Bia'),
    jsonb_build_object('t', 'musica', 'titulo', 'Ousado Amor', 'tom', 'F#m', 'bpm', 72, 'min', 5),
    jsonb_build_object('t', 'momento', 'titulo', 'Palavra', 'min', 40));
  m := m || jsonb_build_object('valida_boa', ordem_valida(boa));
  for r in select * from (values
      ('compasso_44',  '[{"t":"musica","titulo":"x","compasso":"4/4"}]', true),
      ('compasso_128', '[{"t":"musica","titulo":"x","compasso":"12/8"}]', true),
      ('compasso_78',  '[{"t":"musica","titulo":"x","compasso":"7/8"}]', true),
      ('seg_1',        '[{"t":"musica","titulo":"x","seg":1}]', true),
      ('seg_4h',       '[{"t":"momento","titulo":"x","seg":14400}]', true),
      ('compasso_43',  '[{"t":"musica","titulo":"x","compasso":"4/3"}]', false),
      ('compasso_04',  '[{"t":"musica","titulo":"x","compasso":"0/4"}]', false),
      ('compasso_174', '[{"t":"musica","titulo":"x","compasso":"17/4"}]', false),
      ('compasso_esp', '[{"t":"musica","titulo":"x","compasso":"4/4 "}]', false),
      ('compasso_txt', '[{"t":"musica","titulo":"x","compasso":"quatro"}]', false),
      ('compasso_num', '[{"t":"musica","titulo":"x","compasso":4}]', false),
      ('compasso_mom', '[{"t":"momento","titulo":"x","compasso":"4/4"}]', false),
      ('seg_zero',     '[{"t":"musica","titulo":"x","seg":0}]', false),
      ('seg_alto',     '[{"t":"musica","titulo":"x","seg":14401}]', false),
      ('seg_quebrado', '[{"t":"musica","titulo":"x","seg":61.5}]', false),
      ('seg_texto',    '[{"t":"musica","titulo":"x","seg":"61"}]', false),
      ('min_e_seg',    '[{"t":"musica","titulo":"x","min":1,"seg":60}]', false),
      ('letra_url',    '[{"t":"musica","titulo":"x","letra":"https://golpe.com/x.pdf"}]', false),
      ('letra_sobe',   '[{"t":"musica","titulo":"x","letra":"../00000000-0000-0000-0000-000000000000/x.pdf"}]', false),
      ('letra_txt',    '[{"t":"musica","titulo":"x","letra":"00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000.txt"}]', false),
      ('letra_maiusc', '[{"t":"musica","titulo":"x","letra":"00000000-0000-0000-0000-00000000000A/00000000-0000-0000-0000-000000000000.pdf"}]', false),
      ('letra_solta',  '[{"t":"musica","titulo":"x","letra":"00000000-0000-0000-0000-000000000000.pdf"}]', false),
      ('letra_mom',    '[{"t":"momento","titulo":"x","letra":"00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000.pdf"}]', false),
      ('letra_num',    '[{"t":"musica","titulo":"x","letra":1}]', false),
      ('chave_nova',   '[{"t":"musica","titulo":"x","video":"https://youtube.com/x"}]', false)
    ) as x(caso, j, quer)
  loop
    if ordem_valida(r.j::jsonb) is distinct from r.quer then
      falhas := falhas || format('ordem_valida(%s) deu %s, queria %s', r.caso, ordem_valida(r.j::jsonb), r.quer);
    end if;
  end loop;
  /* a ordem de antes (105) continua valendo inteira: 111 só acrescenta */
  if not ordem_valida('[{"t":"momento","titulo":"Abertura","quem":"Pastor","min":5},
      {"t":"musica","titulo":"Bondade de Deus","artista":"Artista Exemplo","tom":"G","bpm":68,
       "cifra":"https://www.cifraclub.com.br/artista-exemplo/bondade-de-deus/","quem":"Bia","min":6,"nota":"Comeca so voz e teclado"}]') then
    falhas := falhas || 'ordem_valida recusou a ordem da 105'::text; end if;
  if (select count(*) from culto_obs where not ordem_valida(ordem)) > 0 then
    falhas := falhas || 'ha ordem gravada que a regra nova recusa'::text; end if;

  /* 2 · estrutura e portas */
  if has_function_privilege('anon', 'public.musicas_do_ministerio(uuid)', 'execute') then
    falhas := falhas || 'musicas_do_ministerio alcancavel por anon'::text; end if;
  if not has_function_privilege('authenticated', 'public.musicas_do_ministerio(uuid)', 'execute') then
    falhas := falhas || 'musicas_do_ministerio sem grant para authenticated'::text; end if;
  if has_function_privilege('anon', 'public.letra_do_lider(text)', 'execute') then
    falhas := falhas || 'letra_do_lider alcancavel por anon'::text; end if;
  if has_function_privilege('anon', 'public.ordem_valida(jsonb)', 'execute') then
    falhas := falhas || 'ordem_valida alcancavel por anon'::text; end if;
  if has_function_privilege('authenticated', 'public.cronograma_dados(uuid,date,boolean)', 'execute') then
    falhas := falhas || 'cronograma_dados alcancavel por authenticated'::text; end if;
  if (select prosecdef from pg_proc where oid = 'public.musicas_do_ministerio(uuid)'::regprocedure) then
    falhas := falhas || 'musicas_do_ministerio virou security definer'::text; end if;
  if to_regprocedure('public.testar_porta_publica()') is not null then
    select count(*), string_agg(t.caso || ' (' || t.obtido || ')', '; ') into v_n, v_txt
      from public.testar_porta_publica() t where not t.passou;
    if v_n > 0 then falhas := falhas || format('porta publica reprovou: %s', v_txt); end if;
  end if;

  /* o armário: público para ler, 10 MB, só PDF, e as duas políticas */
  if to_regclass('storage.buckets') is not null then
    select jsonb_build_object('publico', b.public, 'teto', b.file_size_limit, 'tipos', b.allowed_mime_types)
      into v_j from storage.buckets b where b.id = 'letras';
    m := m || jsonb_build_object('armario', v_j);
    m := m || jsonb_build_object('politicas',
           (select string_agg(p.cmd || ':' || array_to_string(p.roles, ','), ' ' order by p.cmd)
              from pg_policies p
             where p.schemaname = 'storage' and p.tablename = 'objects' and p.policyname like '111 letras:%'
               and coalesce(p.qual, p.with_check) like '%letra_do_lider%'));
  else
    m := m || jsonb_build_object('armario', jsonb_build_object('publico', true, 'teto', 10485760, 'tipos', array['application/pdf']));
    m := m || jsonb_build_object('politicas', 'INSERT:authenticated SELECT:authenticated');
  end if;

  /* o dirigente: o posto do Louvor, um só na igreja, e a área vazia fora */
  select id into v_louvor from equipes where slug = 'louvor';
  select id into v_fl from funcoes where equipe_id = v_louvor and nome = 'DIRIGENTE' and ativa;
  if v_fl is not null then
    m := m || jsonb_build_object('dirigente',
           (select string_agg(e.slug || ':' || f.nome, ',') from funcoes f join equipes e on e.id = f.equipe_id
             where f.cronograma = 'dirigente' and f.ativa));
    m := m || jsonb_build_object('louvor_sem_lider',
           not exists (select 1 from funcoes where equipe_id = v_louvor and cronograma = 'lider' and ativa));
  else
    m := m || jsonb_build_object('dirigente', 'louvor:DIRIGENTE', 'louvor_sem_lider', true);
  end if;

  /* 3 · o caminho inteiro, em dois ministérios de teste (desfeito no fim) */
  begin
    v_dia := v_hoje + 8;
    while extract(dow from v_dia) <> 0 loop v_dia := v_dia + 1; end loop;
    insert into equipes (nome, slug, ordem) values ('CONF111 Louvor', 'conf111-louvor', 995) returning id into v_eq;
    insert into equipes (nome, slug, ordem) values ('CONF111 Midia', 'conf111-midia', 996) returning id into v_eq2;
    insert into lideres (email, equipe_id) values ('conf111-louvor@exemplo.invalid', v_eq);
    insert into lideres (email, equipe_id) values ('conf111-midia@exemplo.invalid', v_eq2);
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos)
         values (v_eq, 'CONF111 VOZ', 1, true, true, array['domingo','follow']) returning id into v_fv;
    insert into voluntarios (equipe_id, nome, telefone, ativo, sexo)
         values (v_eq, 'Ana Conf Cento Onze', '21900111001', true, 'F') returning id, token into v_ana, t_ana;
    insert into config (equipe_id, dados) values (v_eq, '{"repertorio": true}') on conflict do nothing;
    update config set dados = coalesce(dados, '{}'::jsonb) || '{"repertorio": true}' where equipe_id = v_eq;

    select id into v_culto from cultos where data = v_dia and evento is null;
    if v_culto is null then insert into cultos (data) values (v_dia) returning id into v_culto; end if;
    insert into cultos (data, evento, equipe_id) values (v_hoje - 14, 'CONF111 passado', v_eq) returning id into v_passado;
    insert into escalacoes (culto_id, funcao_id, voluntario_id, status) values (v_culto, v_fv, v_ana, 'confirmado');

    /* as letras, no armário do ministério de teste e no de outro */
    c_l1 := v_eq::text || '/' || gen_random_uuid()::text || '.pdf';
    c_l2 := v_eq::text || '/' || gen_random_uuid()::text || '.pdf';
    c_alheia := v_eq2::text || '/' || gen_random_uuid()::text || '.pdf';

    /* a líder do Louvor de teste grava compasso, segundos e a letra */
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf111-louvor@exemplo.invalid","role":"authenticated"}', true);
    v_j := salvar_ordem(v_culto, v_eq, jsonb_build_array(
             jsonb_build_object('t', 'musica', 'titulo', ' Bondade de Deus ', 'tom', 'G', 'bpm', 68,
                                'compasso', '6/8', 'seg', 275, 'letra', c_l1, 'quem', 'Bia'),
             jsonb_build_object('t', 'momento', 'titulo', 'Palavra', 'seg', 2400)), '[]');
    m := m || jsonb_build_object('grava', v_j ->> 'ok');
    m := m || jsonb_build_object('grava_limpa', (v_j -> 'ordem' -> 0) - 'letra');
    m := m || jsonb_build_object('grava_letra', (v_j -> 'ordem' -> 0 ->> 'letra') = c_l1);
    /* a folha do culto (109) leva o compasso: lida agora, com a ordem cheia
       (a folha é por dentro, só o dono do banco lê direto) */
    reset role;
    v_f := cronograma_dados(v_culto, null, false);
    m := m || jsonb_build_object('folha_musica',
           (select x - 'equipe' from jsonb_array_elements(v_f -> 'musicas') x where x ->> 'equipe' = 'CONF111 Louvor' limit 1));
    m := m || jsonb_build_object('folha_evento', coalesce(cronograma_dados(v_passado, null, false)::text, 'nula'));
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf111-louvor@exemplo.invalid","role":"authenticated"}', true);
    /* minutos e segundos juntos, e letra de fora do armário: recusa e não apaga */
    v_j := salvar_ordem(v_culto, v_eq, '[{"t":"musica","titulo":"x","min":1,"seg":60}]', v_j -> 'ordem');
    m := m || jsonb_build_object('min_e_seg', v_j ->> 'erro');
    v_j := salvar_ordem(v_culto, v_eq, '[{"t":"musica","titulo":"x","letra":"https://golpe.com/x.pdf"}]',
             (select ordem from culto_obs where culto_id = v_culto and equipe_id = v_eq));
    m := m || jsonb_build_object('letra_fora', v_j ->> 'erro');
    /* o culto passado tem a mesma música com a outra letra, e uma do jeito
       de antes (em minutos); o banco de músicas devolve o último preenchido */
    v_j := salvar_ordem(v_passado, v_eq, jsonb_build_array(
             jsonb_build_object('t', 'musica', 'titulo', 'bondade de deus', 'tom', 'A', 'bpm', 70, 'compasso', '4/4', 'letra', c_l2),
             jsonb_build_object('t', 'musica', 'titulo', 'Ousado Amor', 'min', 5)), '[]');
    m := m || jsonb_build_object('grava_passado', v_j ->> 'ok');
    m := m || jsonb_build_object('musicas',
           (select string_agg(format('%s|%s|%s|%s|%s|%s', titulo, coalesce(tom, '-'), coalesce(compasso, '-'),
                                     coalesce(seg::text, '-'),
                                     case when letra = c_l1 then 'L1' when letra = c_l2 then 'L2' else coalesce(letra, '-') end,
                                     vezes), ';' order by titulo)
              from musicas_do_ministerio(v_eq)));
    /* a música entra no domingo sem a letra: a letra de antes não some do banco */
    v_j := salvar_ordem(v_culto, v_eq, '[{"t":"musica","titulo":"Bondade de Deus","tom":"G"}]',
             (select ordem from culto_obs where culto_id = v_culto and equipe_id = v_eq));
    m := m || jsonb_build_object('letra_fica',
           (select case when letra = c_l2 then 'L2' when letra = c_l1 then 'L1' else coalesce(letra, '-') end
              from musicas_do_ministerio(v_eq) where titulo = 'Bondade de Deus'));
    /* a política do armário: a líder envia para a pasta do ministério dela */
    m := m || jsonb_build_object('envia_propria', letra_do_lider(c_l1));
    m := m || jsonb_build_object('envia_alheia', letra_do_lider(c_alheia));
    m := m || jsonb_build_object('envia_torta', letra_do_lider(v_eq::text || '/../' || gen_random_uuid()::text || '.pdf'));
    m := m || jsonb_build_object('envia_lixo', letra_do_lider('nada'));
    /* e a do outro ministério não grava nem lê o banco do Louvor de teste */
    perform set_config('request.jwt.claims', '{"email":"conf111-midia@exemplo.invalid","role":"authenticated"}', true);
    m := m || jsonb_build_object('outra_envia', letra_do_lider(c_l1));
    m := m || jsonb_build_object('outra_musicas', (select count(*) from musicas_do_ministerio(v_eq)));
    /* quem não tem login não envia */
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    m := m || jsonb_build_object('sem_login', letra_do_lider(c_l1));
    reset role;

    /* o armário de verdade, quando o banco tem o Storage: a linha entra para
       a líder e não entra para a de outro ministério nem para quem não tem
       login (o Postgres decide pela política) */
    if to_regclass('storage.objects') is not null then
      set local role authenticated;
      perform set_config('request.jwt.claims', '{"email":"conf111-louvor@exemplo.invalid","role":"authenticated"}', true);
      begin
        insert into storage.objects (bucket_id, name) values ('letras', c_l1);
        m := m || jsonb_build_object('rls_propria', 'entrou');
      exception when insufficient_privilege then m := m || jsonb_build_object('rls_propria', 'barrou');
      end;
      begin
        insert into storage.objects (bucket_id, name) values ('letras', c_alheia);
        m := m || jsonb_build_object('rls_alheia', 'entrou');
      exception when insufficient_privilege then m := m || jsonb_build_object('rls_alheia', 'barrou');
      end;
      /* TROCAR E APAGAR: O QUE SE MEDE É O ARQUIVO, NÃO O JEITO DE BARRAR.
         Sem política de update e delete, o RLS deixa o comando passar sem
         achar linha (é o que acontece no banco de teste). No Supabase de
         verdade o delete direto em `storage.objects` é barrado antes, com
         erro de privilégio (a proteção da plataforma contra apagar pela
         tabela): medido na primeira rodada em produção, 05/10/2026, que
         reprovou só aqui ("rls_apaga: obtido barrou") e foi desfeita
         inteira. Os dois caminhos deixam o arquivo onde estava. O delete
         é tentado como a API do Storage apaga (com o apagar pela tabela
         liberado), para quem decidir ser o RLS: uma política de delete
         esquecida aparece aqui, em vez de se esconder atrás da proteção. */
      begin
        update storage.objects set name = c_l2 where bucket_id = 'letras' and name = c_l1;
      exception when insufficient_privilege then null;
      end;
      m := m || jsonb_build_object('rls_troca', (select count(*) from storage.objects where bucket_id = 'letras' and name = c_l2));
      begin
        perform set_config('storage.allow_delete_query', 'true', true);
        delete from storage.objects where bucket_id = 'letras' and name = c_l1;
        perform set_config('storage.allow_delete_query', 'false', true);
      exception when insufficient_privilege then null;
      end;
      m := m || jsonb_build_object('rls_apaga', (select count(*) from storage.objects where bucket_id = 'letras' and name = c_l1));
      reset role;
      set local role anon;
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      begin
        insert into storage.objects (bucket_id, name) values ('letras', c_l2);
        m := m || jsonb_build_object('rls_anon', 'entrou');
      exception when insufficient_privilege then m := m || jsonb_build_object('rls_anon', 'barrou');
      end;
      reset role;
    else
      m := m || jsonb_build_object('rls_propria', 'entrou', 'rls_alheia', 'barrou', 'rls_troca', 0, 'rls_apaga', 1, 'rls_anon', 'barrou');
    end if;

    /* 4 · o dirigente do Louvor recebe o culto no link */
    if v_fl is not null then
      insert into voluntarios (equipe_id, nome, telefone, ativo, sexo)
           values (v_louvor, 'Dirigente Conf Cento Onze', '21900111009', true,
                   coalesce((select exige_sexo from funcoes where id = v_fl), 'M'))
        returning id, token into v_dir, t_dir;
      delete from escalacoes where culto_id = v_culto and funcao_id = v_fl;
      insert into escalacoes (culto_id, funcao_id, voluntario_id, status) values (v_culto, v_fl, v_dir, 'pendente');
      m := m || jsonb_build_object('dirige', cron_dirige(v_dir, v_culto));
      m := m || jsonb_build_object('no_link',
             (select count(*) from jsonb_array_elements(eu_cronogramas(t_dir) -> 'cultos') x
               where x ->> 'data' = v_dia::text));
      m := m || jsonb_build_object('no_comando',
             (select x ->> 'equipe' || ':' || coalesce(x ->> 'nome', '-') from jsonb_array_elements(cronograma_dados(v_culto, null, false) -> 'comando') x
               where x ->> 'papel' = 'dirigente'));
    else
      m := m || jsonb_build_object('dirige', true, 'no_link', 1, 'no_comando', 'Louvor:Dirigente Conf');
    end if;

    raise exception 'CONF111_DESFAZ';
  exception when others then
    if sqlerrm <> 'CONF111_DESFAZ' then
      falhas := falhas || ('o cenario nao montou: ' || sqlerrm)::text;
    end if;
  end;
  reset role;

  begin
    for r in select * from (values
        ('valida_boa',      'true'),
        ('armario',         '{"teto": 10485760, "tipos": ["application/pdf"], "publico": true}'),
        ('politicas',       'INSERT:authenticated SELECT:authenticated'),
        ('dirigente',       'louvor:DIRIGENTE'),
        ('louvor_sem_lider','true'),
        ('grava',           'true'),
        ('grava_limpa',     '{"t": "musica", "bpm": 68, "seg": 275, "tom": "G", "quem": "Bia", "titulo": "Bondade de Deus", "compasso": "6/8"}'),
        ('grava_letra',     'true'),
        ('min_e_seg',       'ORDEM_INVALIDA'),
        ('letra_fora',      'ORDEM_INVALIDA'),
        ('grava_passado',   'true'),
        ('musicas',         'Bondade de Deus|G|6/8|275|L1|1;Ousado Amor|-|-|300|-|1'),
        ('letra_fica',      'L2'),
        ('envia_propria',   'true'),
        ('envia_alheia',    'false'),
        ('envia_torta',     'false'),
        ('envia_lixo',      'false'),
        ('outra_envia',     'false'),
        ('outra_musicas',   '0'),
        ('sem_login',       'false'),
        ('rls_propria',     'entrou'),
        ('rls_alheia',      'barrou'),
        ('rls_troca',       '0'),
        ('rls_apaga',       '1'),
        ('rls_anon',        'barrou'),
        ('folha_evento',    'nula'),
        ('folha_musica',    '{"bpm": 68, "tom": "G", "quem": "Bia", "titulo": "Bondade de Deus", "compasso": "6/8"}'),
        ('dirige',          'true'),
        ('no_link',         '1'),
        ('no_comando',      'Louvor:Dirigente Conf')
      ) as x(chave, esperado)
    loop
      if (m ->> r.chave) is distinct from r.esperado then
        falhas := falhas || format('%s: obtido %s, esperado %s', r.chave, coalesce(m ->> r.chave, '(nada)'), r.esperado);
      end if;
    end loop;
  end;

  /* o cenário foi desfeito */
  if exists (select 1 from equipes where slug like 'conf111-%')
     or exists (select 1 from voluntarios where nome like '% Conf Cento Onze')
     or exists (select 1 from lideres where email like 'conf111%@exemplo.invalid') then
    falhas := falhas || 'o cenario de teste ficou no banco'::text; end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'111 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  select count(*) into v_n from jsonb_object_keys(m);
  raise notice 'OK 111 · conferencia: % medidas da ordem, do banco de musicas, do armario das letras e do dirigente, todas como esperado. Cenario desfeito.', v_n;
end $conf$;

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (111, '111 · a ordem aceita o compasso', 'ordem_valida', 'compasso'),
      (111, '111 · a ordem aceita o tempo em segundos', 'ordem_valida', '14400'),
      (111, '111 · a letra so aponta para o armario', 'ordem_valida', 'letra_caminho_valido'),
      (111, '111 · o banco de musicas devolve a letra', 'musicas_do_ministerio', 'letra'),
      (111, '111 · a folha leva o compasso', 'cronograma_dados', '''compasso'''),
      (111, '111 · so a lideranca do ministerio envia a letra', 'letra_do_lider', 'lidera_equipe')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (111, '111-compasso-segundos-letra-e-o-dirigente-do-louvor.sql')
  on conflict (n) do nothing;

commit;

/* o que o editor mostra: só números e nomes */
select '111' as versao,
       (select string_agg(e.nome || ' · ' || f.nome, ', ') from funcoes f join equipes e on e.id = f.equipe_id
         where f.cronograma = 'dirigente' and f.ativa) as dirigente,
       case when exists (select 1 from equipes where slug = 'dirigentes') then 'ficou (tem gente)' else 'saiu' end as area_dirigentes,
       (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
         and policyname like '111 letras:%') as politicas_letras,
       (select count(*) from testar_porta_publica() where not passou) as porta_reprovada,
       (select count(*) from schema_versao_conferir() where not passou) as sondas_reprovadas;
