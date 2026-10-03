/* =============================================================================
   109 · O CRONOGRAMA DO CULTO, A PRODUÇÃO E OS DIRIGENTES

   03/10/2026. Só de Escalas. O Arthur, sobre o Roteiro Mestre que hoje uma
   pessoa só (o Paulo Roberto) monta: "quero descentralizar essa função",
   "tudo dentro do sistema, sendo registrado, feito antecipadamente, três
   dias antes do culto", "criar o nosso PDF do roteiro do culto e a
   divulgação nos grupos". E depois: "está extremamente complexo [...] tem
   que ser algo mais objetivo". Aprovou o formato de UMA página (03/10), e
   disse quem preenche a Palavra: "o dirigente da semana (vamos ter que
   cadastrar eles)".

   A FOLHA TEM CINCO BLOCOS, E CADA UM TEM DONO
     A Palavra ...... quem prega, tema, leitura, frase na tela, Santa Ceia.
                      O DIRIGENTE da semana preenche pelo link dele.
     No comando ..... sai da escala sozinho: quem está no posto marcado de
                      cada área. Ninguém digita.
     Cronograma ..... os horários. Nasce do modelo do tipo de culto
                      (domingo, Follow); a Produção ajusta quando muda.
     Louvor ......... as músicas saem da ordem do culto (105); a música
                      final é um campo daqui.
     Avisos ......... o dirigente preenche, ou diz "sem avisos".
   Qualquer líder logado também preenche qualquer bloco, e cada bloco guarda
   quem gravou e quando: ninguém fica dependendo de uma pessoa só.

   O QUE MUDA (só acrescenta, menos três funções públicas que ganham um filtro)
     1 · `equipes.publica`: área que serve no culto mas não aparece no site
         (/servir, a lista da página inicial e os números). A Produção e os
         Dirigentes nascem assim. `ministerios_publicos()` e
         `numeros_publicos()` passam a respeitar a coluna; `areas_do_espaco()`
         é a lista de TODAS as áreas, para a pessoa achar o próprio link em
         /eu (quem é dirigente também precisa achar o dele).
     2 · `funcoes.cronograma`: o posto que aparece em "No comando".
         'direcao' (Direção do culto, um só na igreja), 'dirigente' (um só
         na igreja; quem está nele preenche a Palavra e os Avisos pelo link)
         e 'lider' (um por área: a área aparece com o nome dela).
     3 · As áreas Produção (Coordenador do Dia, Aux. Prod. Técnica, Aux.
         Prod. Culto, Aux. Prod. Culto (salão)) e Dirigentes (Dirigente),
         com os postos por tipo de culto que o Arthur passou. Cadastrar as
         pessoas e escalar é pela tela, como em qualquer área.
     4 · `cronogramas` (um por culto) e `cronograma_modelos` (um por tipo de
         culto). Fechadas para fora: só as funções abaixo leem e gravam.
     5 · Leitura e gravação, com o CHECK de cada bloco e a mesma regra da
         105 contra apagar a edição de outra pessoa (MUDOU).
     6 · A página pública do cronograma, por um link que não se adivinha,
         para o grupo e para o PDF.

   PORTA PÚBLICA: quatro funções novas no inventário da 77.

   SEM `create temp table` (101). O EDITOR DO SUPABASE NÃO MOSTRA NOTICE: a
   última linha é um select com o resultado.

   ORDEM:  ... 107 → 108 → 109
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(109);
  end if;
  /* rodada antes da 108, a régua pularia e recusaria a 108 depois */
  if to_regclass('public.schema_versao') is not null
     and not exists (select 1 from public.schema_versao where n = 108) then
    raise exception 'FALTA A 108: rode antes a 108 (supabase/108-quem-e-de-fora-da-lista-no-posto.sql). Nada foi mudado.';
  end if;
end $tranca$;

begin;

-- =========================================================================
-- 1 · área que serve no culto e não aparece no site
-- =========================================================================
alter table public.equipes add column if not exists publica boolean not null default true;
comment on column public.equipes.publica is
  '109: false = a area serve no culto (escala, link, cronograma) mas nao aparece no site: /servir, a lista da pagina inicial e os numeros publicos. A pessoa ainda acha o proprio link em /eu (areas_do_espaco).';

/* a mesma função da 29, com o filtro. Mesmas colunas, mesma ordem. */
create or replace function public.ministerios_publicos()
returns table(slug text, nome text, descricao text, convite text, postos bigint, aberto boolean,
              artigo text, responsavel text, whatsapp text)
language sql stable security definer set search_path = public as $fn$
  select e.slug, e.nome, e.descricao, e.convite,
         count(f.id) filter (where f.ativa) as postos,
         not e.exige_aprovacao as aberto,
         e.artigo,
         e.responsavel_nome, e.responsavel_whatsapp
  from equipes e
  left join funcoes f on f.equipe_id = e.id
  where e.publica
  group by e.id, e.slug, e.nome, e.descricao, e.convite, e.exige_aprovacao,
           e.artigo, e.responsavel_nome, e.responsavel_whatsapp, e.ordem
  having count(f.id) filter (where f.ativa) > 0
  order by e.ordem;
$fn$;
revoke all on function public.ministerios_publicos() from public;
grant execute on function public.ministerios_publicos() to anon, authenticated;

/* a mesma da 28: áreas e postos que o site mostra. Pessoas continuam todas:
   quem serve na Produção também serve. */
create or replace function public.numeros_publicos()
returns jsonb language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
    'pessoas',     (select count(*) from voluntarios where ativo),
    'ministerios', (select count(*) from equipes e
                     where e.publica
                       and exists (select 1 from funcoes f where f.equipe_id = e.id and f.ativa)),
    'postos',      (select count(*) from funcoes f join equipes e on e.id = f.equipe_id
                     where f.ativa and e.publica),
    'cultos_no_mes', (select count(*) from cultos
                       where data >= date_trunc('month', current_date)
                         and data <  date_trunc('month', current_date) + interval '1 month'),
    'respostas',   (select count(*) from disponibilidade where data >= current_date - 60)
  );
$fn$;
revoke all on function public.numeros_publicos() from public;
grant execute on function public.numeros_publicos() to anon, authenticated;

/* /eu ("Acessar meu espaço"): a pessoa escolhe a área para achar o nome e
   entrar com o PIN. Ali entram TODAS as áreas com posto, públicas ou não. */
create or replace function public.areas_do_espaco()
returns table(slug text, nome text)
language sql stable security definer set search_path = public as $fn$
  select e.slug, e.nome
    from equipes e
   where exists (select 1 from funcoes f where f.equipe_id = e.id and f.ativa)
   order by e.publica desc, e.ordem, e.nome;
$fn$;
revoke all on function public.areas_do_espaco() from public;
grant execute on function public.areas_do_espaco() to anon, authenticated;

-- =========================================================================
-- 2 · o posto que aparece em "No comando"
-- =========================================================================
alter table public.funcoes add column if not exists cronograma text;
alter table public.funcoes drop constraint if exists funcoes_cronograma_ck;
alter table public.funcoes add constraint funcoes_cronograma_ck
  check (cronograma in ('direcao', 'dirigente', 'lider'));
/* Direção do culto e Dirigente: um posto só na igreja inteira. Líder: um
   por área. Posto oculto não conta (dá para trocar sem apagar). */
create unique index if not exists ux_funcoes_cronograma_igreja
  on public.funcoes (cronograma) where cronograma in ('direcao', 'dirigente') and ativa;
create unique index if not exists ux_funcoes_cronograma_lider
  on public.funcoes (equipe_id) where cronograma = 'lider' and ativa;
comment on column public.funcoes.cronograma is
  '109: o posto aparece em "No comando" do cronograma do culto. direcao = Direcao do culto (um na igreja); dirigente = Dirigente (um na igreja; quem esta nele preenche a Palavra e os Avisos pelo link); lider = a area aparece com o nome dela (um por area).';

-- =========================================================================
-- 3 · Produção e Dirigentes
-- =========================================================================
insert into public.equipes (nome, slug, ordem, publica, sem_niveis, exige_aprovacao, artigo)
values ('Produção',   'producao',   90, false, true, true, 'a'),
       ('Dirigentes', 'dirigentes', 91, false, true, true, 'o')
on conflict (slug) do nothing;

/* Os postos como o Arthur passou (03/10):
     Domingo  Coordenador do Dia, Aux. Prod. Técnica, Aux. Prod. Culto,
              Aux. Prod. Culto (fica no salão)
     Follow   Coordenador do Dia, Aux. Prod. Técnica, Aux. Prod. Culto (salão)
   O Coordenador do Dia é a Direção do culto e o líder do dia da Produção
   (marca a chegada do time e conta como foi, 107). */
/* Só na primeira vez (a área ainda sem posto nenhum): rodar de novo depois
   de alguém renomear um posto não recria o nome antigo. Se a marca de
   direção já estiver em outro posto (alguém marcou à mão), o Coordenador
   nasce sem ela, em vez de a migração parar no índice. */
insert into public.funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos, relata, cronograma, descricao)
select e.id, x.nome, x.ordem, true, true, x.tipos, x.relata,
       case when x.cron is not null and exists (select 1 from public.funcoes g
                                                 where g.cronograma = x.cron and g.ativa)
            then null else x.cron end,
       x.descr
  from public.equipes e
  cross join (values
    ('COORDENADOR DO DIA',       1, array['domingo','follow'], true,  'direcao',
     'Controla o roteiro, o tempo e o rádio do culto.'),
    ('AUX. PROD. TÉCNICA',       2, array['domingo','follow'], false, null::text, null::text),
    ('AUX. PROD. CULTO',         3, array['domingo'],          false, null, null),
    ('AUX. PROD. CULTO (SALÃO)', 4, array['domingo','follow'], false, null,
     'Fica no salão durante o culto.')
  ) as x(nome, ordem, tipos, relata, cron, descr)
 where e.slug = 'producao'
   and not exists (select 1 from public.funcoes g where g.equipe_id = e.id)
on conflict (equipe_id, nome) do nothing;

insert into public.funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos, relata, cronograma, descricao)
select e.id, 'DIRIGENTE', 1, true, true, array['domingo','follow'], false,
       case when exists (select 1 from public.funcoes g where g.cronograma = 'dirigente' and g.ativa)
            then null else 'dirigente' end,
       'Conduz o culto: leitura, oração, avisos e acolhimento.'
  from public.equipes e
 where e.slug = 'dirigentes'
   and not exists (select 1 from public.funcoes g where g.equipe_id = e.id)
on conflict (equipe_id, nome) do nothing;

/* quem comanda cada área no culto, pelo nome que o posto tem hoje no banco
   (medido em 03/10 pela porta pública): Louvor DIRIGENTE, Mídia HEAD,
   Connect LÍDER 1. Área que já tem a marca não é tocada. */
update public.funcoes f set cronograma = 'lider'
  from public.equipes e
 where e.id = f.equipe_id and f.cronograma is null and f.ativa
   and ((e.slug = 'louvor'  and f.nome = 'DIRIGENTE')
     or (e.slug = 'midia'   and f.nome = 'HEAD')
     or (e.slug = 'servico' and f.nome = 'LÍDER 1'))
   and not exists (select 1 from public.funcoes g
                    where g.equipe_id = f.equipe_id and g.cronograma = 'lider' and g.ativa);

-- =========================================================================
-- 4 · o que cabe em cada bloco (o CHECK das colunas)
-- =========================================================================
/* texto de uma linha: aparado, não vazio, sem quebra nem tabulação, com teto.
   Vai para uma linha da folha, do PDF e da mensagem do grupo. */
create or replace function public.cron_texto_ok(v jsonb, teto int)
returns boolean language sql immutable set search_path = public as $fn$
  select jsonb_typeof(v) = 'string'
     and (v #>> '{}') = btrim(v #>> '{}')
     and (v #>> '{}') <> ''
     and (v #>> '{}') !~ '[[:cntrl:]]'
     and length(v #>> '{}') <= teto;
$fn$;

create or replace function public.cron_palavra_valida(p jsonb)
returns boolean language plpgsql immutable set search_path = public as $fn$
declare k text; v jsonb;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'object' then return false; end if;
  for k, v in select e.key, e.value from jsonb_each(p) e loop
    if k = 'ceia' then
      if jsonb_typeof(v) <> 'boolean' then return false; end if;
    elsif k in ('quem', 'tema', 'leitura', 'frase') then
      if not public.cron_texto_ok(v, case k when 'quem' then 60 when 'tema' then 120
                                            when 'leitura' then 80 else 240 end) then
        return false;
      end if;
    else
      return false;                                   -- chave que não é da Palavra
    end if;
  end loop;
  return true;
end $fn$;

/* lista vazia é resposta: "sem avisos neste culto". Nulo é "falta". */
create or replace function public.cron_avisos_validos(p jsonb)
returns boolean language plpgsql immutable set search_path = public as $fn$
declare it jsonb; k text; v jsonb;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 12 then return false; end if;
  for it in select x.value from jsonb_array_elements(p) x loop
    if jsonb_typeof(it) <> 'object' or not (it ? 'texto') then return false; end if;
    for k, v in select e.key, e.value from jsonb_each(it) e loop
      if k = 'texto' then
        if not public.cron_texto_ok(v, 100) then return false; end if;
      elsif k = 'como' then
        if jsonb_typeof(v) <> 'string' or (v #>> '{}') not in ('falado', 'video') then return false; end if;
      else
        return false;
      end if;
    end loop;
  end loop;
  return true;
end $fn$;

create or replace function public.cron_louvor_valido(p jsonb)
returns boolean language plpgsql immutable set search_path = public as $fn$
declare k text; v jsonb;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'object' then return false; end if;
  for k, v in select e.key, e.value from jsonb_each(p) e loop
    if k <> 'final' or not public.cron_texto_ok(v, 80) then return false; end if;
  end loop;
  return true;
end $fn$;

/* os horários: de 1 a 30 linhas {h: "HH:MM", o: o que acontece, q: quem} */
create or replace function public.cron_linha_valida(p jsonb)
returns boolean language plpgsql immutable set search_path = public as $fn$
declare it jsonb; k text; v jsonb;
begin
  if p is null then return true; end if;
  if jsonb_typeof(p) <> 'array' then return false; end if;
  if jsonb_array_length(p) < 1 or jsonb_array_length(p) > 30 then return false; end if;
  for it in select x.value from jsonb_array_elements(p) x loop
    if jsonb_typeof(it) <> 'object' or not (it ? 'h') or not (it ? 'o') then return false; end if;
    for k, v in select e.key, e.value from jsonb_each(it) e loop
      if k = 'h' then
        if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
      elsif k = 'o' then
        if not public.cron_texto_ok(v, 80) then return false; end if;
      elsif k = 'q' then
        if not public.cron_texto_ok(v, 60) then return false; end if;
      else
        return false;
      end if;
    end loop;
  end loop;
  return true;
end $fn$;

do $priv$ declare f text; begin
  foreach f in array array['public.cron_texto_ok(jsonb,int)', 'public.cron_palavra_valida(jsonb)',
                           'public.cron_avisos_validos(jsonb)', 'public.cron_louvor_valido(jsonb)',
                           'public.cron_linha_valida(jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $priv$;

-- =========================================================================
-- 5 · as tabelas
-- =========================================================================
create table if not exists public.cronograma_modelos (
  tipo           text primary key check (tipo in ('domingo', 'follow')),
  linha          jsonb not null,
  atualizado_em  timestamptz not null default now(),
  atualizado_por text
);
alter table public.cronograma_modelos drop constraint if exists cronograma_modelos_linha_ok;
alter table public.cronograma_modelos add constraint cronograma_modelos_linha_ok
  check (linha is not null and public.cron_linha_valida(linha));
alter table public.cronograma_modelos enable row level security;
revoke all on table public.cronograma_modelos from public, anon, authenticated;
comment on table public.cronograma_modelos is
  '109: os horarios de cada tipo de culto. Todo cronograma sem horarios proprios usa o do seu tipo. Grava por cronograma_salvar(..., p_modelo => true).';

create table if not exists public.cronogramas (
  culto_id       uuid primary key references public.cultos(id) on delete cascade,
  token          text not null unique default encode(extensions.gen_random_bytes(9), 'hex'),
  palavra        jsonb,
  avisos         jsonb,
  louvor         jsonb,
  linha          jsonb,
  autoria        jsonb not null default '{}'::jsonb,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
alter table public.cronogramas drop constraint if exists cronogramas_palavra_ok;
alter table public.cronogramas add constraint cronogramas_palavra_ok check (public.cron_palavra_valida(palavra));
alter table public.cronogramas drop constraint if exists cronogramas_avisos_ok;
alter table public.cronogramas add constraint cronogramas_avisos_ok check (public.cron_avisos_validos(avisos));
alter table public.cronogramas drop constraint if exists cronogramas_louvor_ok;
alter table public.cronogramas add constraint cronogramas_louvor_ok check (public.cron_louvor_valido(louvor));
alter table public.cronogramas drop constraint if exists cronogramas_linha_ok;
alter table public.cronogramas add constraint cronogramas_linha_ok check (public.cron_linha_valida(linha));
alter table public.cronogramas drop constraint if exists cronogramas_autoria_ok;
alter table public.cronogramas add constraint cronogramas_autoria_ok check (jsonb_typeof(autoria) = 'object');
alter table public.cronogramas enable row level security;
revoke all on table public.cronogramas from public, anon, authenticated;
comment on table public.cronogramas is
  '109: o cronograma de cada culto da igreja (domingo e Follow). palavra {quem, tema, leitura, frase, ceia}; avisos [{texto, como}] (lista vazia = sem avisos); louvor {final}; linha [{h, o, q}] (nulo = o modelo do tipo); autoria {bloco: {por, em, via}}. Token = o link publico da folha.';

/* o modelo do domingo é o do Roteiro Mestre de 13/09/2026, enxuto (a folha
   aprovada pelo Arthur em 03/10). O do Follow nasce do domingo, sem o que o
   Connect faz (o Connect não serve no sábado), para a Produção ajustar uma
   vez e marcar "usar nos próximos". */
insert into public.cronograma_modelos (tipo, linha, atualizado_por) values
('domingo', '[
  {"h":"09:00","o":"Líderes chegam e conferem escala e ambientes","q":"Todos os líderes"},
  {"h":"09:15","o":"Pílula da Diaconia (20 min)","q":"Diaconia"},
  {"h":"09:40","o":"Reunião operacional","q":"Pastor, Direção e líderes"},
  {"h":"09:50","o":"Posições assumidas, portas abertas","q":"Todos"},
  {"h":"10:00","o":"Louvor","q":"Louvor e Mídia"},
  {"h":"10:30","o":"Saudação, leitura e oração","q":"Dirigente"},
  {"h":"10:38","o":"Avisos","q":"Dirigente e Mídia"},
  {"h":"10:47","o":"Acolhimento aos visitantes","q":"Dirigente e Recepção"},
  {"h":"10:55","o":"Transição para a Palavra","q":"Louvor"},
  {"h":"11:00","o":"Palavra","q":"Pastor"},
  {"h":"11:40","o":"Apelo e ministração","q":"Pastor, Louvor e Intercessão"},
  {"h":"11:48","o":"Dízimos e ofertas","q":"Diaconia e Mídia"},
  {"h":"11:54","o":"Bênção e louvor final","q":"Pastor e Louvor"},
  {"h":"12:00","o":"Encerramento","q":"Recepção e Diaconia"}
]'::jsonb, 'migração 109'),
('follow', '[
  {"h":"18:00","o":"Líderes chegam e conferem escala e ambientes","q":"Todos os líderes"},
  {"h":"18:40","o":"Reunião operacional","q":"Direção e líderes"},
  {"h":"18:50","o":"Posições assumidas, portas abertas","q":"Todos"},
  {"h":"19:00","o":"Louvor","q":"Louvor e Mídia"},
  {"h":"19:30","o":"Saudação, leitura e oração","q":"Dirigente"},
  {"h":"19:38","o":"Avisos","q":"Dirigente e Mídia"},
  {"h":"19:47","o":"Acolhimento aos visitantes","q":"Dirigente"},
  {"h":"19:55","o":"Transição para a Palavra","q":"Louvor"},
  {"h":"20:00","o":"Palavra","q":"Pregador"},
  {"h":"20:40","o":"Apelo e ministração","q":"Pregador e Louvor"},
  {"h":"20:48","o":"Dízimos e ofertas","q":"Mídia"},
  {"h":"20:54","o":"Bênção e louvor final","q":"Pregador e Louvor"},
  {"h":"21:00","o":"Encerramento","q":"Todos"}
]'::jsonb, 'migração 109')
on conflict (tipo) do nothing;

-- =========================================================================
-- 6 · o que a tela manda vira o que o banco guarda
-- =========================================================================
/* texto aparado e com os espaços de dentro juntados (uma quebra de linha
   colada vira espaço); campo vazio sai; Santa Ceia "não" sai (ausente =
   sem Ceia); aviso sem texto sai; linha sem "o que" sai; os horários em
   ordem. O que sobrar do jeito errado continua errado, e o CHECK recusa. */
create or replace function public.cron_normalizar(p_bloco text, p jsonb)
returns jsonb language plpgsql immutable set search_path = public as $fn$
declare v jsonb;
  /* string: aparada, espaços juntados. O resto passa como veio. */
begin
  if p is null or jsonb_typeof(p) = 'null' then return null; end if;

  if p_bloco in ('palavra', 'louvor') then
    if jsonb_typeof(p) <> 'object' then return p; end if;
    select coalesce(jsonb_object_agg(e.key,
             case when jsonb_typeof(e.value) = 'string'
                  then to_jsonb(btrim(regexp_replace(e.value #>> '{}', '\s+', ' ', 'g')))
                  else e.value end), '{}'::jsonb)
      into v
      from jsonb_each(p) e
     where jsonb_typeof(e.value) <> 'null'
       and not (jsonb_typeof(e.value) = 'string' and btrim(regexp_replace(e.value #>> '{}', '\s+', ' ', 'g')) = '')
       and not (e.key = 'ceia' and e.value = 'false'::jsonb);
    return case when v = '{}'::jsonb then null else v end;
  end if;

  if p_bloco = 'avisos' then
    if jsonb_typeof(p) <> 'array' then return p; end if;
    select coalesce(jsonb_agg(t.item order by t.ord), '[]'::jsonb) into v
      from (select x.ord,
                   case when jsonb_typeof(x.value) <> 'object' then x.value
                   else (select coalesce(jsonb_object_agg(e.key,
                                  case when jsonb_typeof(e.value) = 'string'
                                       then to_jsonb(btrim(regexp_replace(e.value #>> '{}', '\s+', ' ', 'g')))
                                       else e.value end), '{}'::jsonb)
                           from jsonb_each(x.value) e
                          where jsonb_typeof(e.value) <> 'null'
                            and not (jsonb_typeof(e.value) = 'string'
                                     and btrim(regexp_replace(e.value #>> '{}', '\s+', ' ', 'g')) = ''))
                   end as item
              from jsonb_array_elements(p) with ordinality x(value, ord)) t
     where not (jsonb_typeof(t.item) = 'object' and not (t.item ? 'texto'));
    return v;                                          -- [] fica: "sem avisos"
  end if;

  if p_bloco = 'linha' then
    if jsonb_typeof(p) <> 'array' then return p; end if;
    select jsonb_agg(t.item order by t.item ->> 'h', t.ord) into v
      from (select x.ord,
                   case when jsonb_typeof(x.value) <> 'object' then x.value
                   else (select coalesce(jsonb_object_agg(e.key,
                                  case when jsonb_typeof(e.value) = 'string'
                                       then to_jsonb(btrim(regexp_replace(e.value #>> '{}', '\s+', ' ', 'g')))
                                       else e.value end), '{}'::jsonb)
                           from jsonb_each(x.value) e
                          where jsonb_typeof(e.value) <> 'null'
                            and not (jsonb_typeof(e.value) = 'string'
                                     and btrim(regexp_replace(e.value #>> '{}', '\s+', ' ', 'g')) = ''))
                   end as item
              from jsonb_array_elements(p) with ordinality x(value, ord)) t
     where not (jsonb_typeof(t.item) = 'object' and not (t.item ? 'o'));
    return v;                                          -- nada sobrou: nulo, volta ao modelo
  end if;

  return p;
end $fn$;

create or replace function public.cron_bloco_valido(p_bloco text, p jsonb)
returns boolean language sql immutable set search_path = public as $fn$
  select case p_bloco
           when 'palavra' then public.cron_palavra_valida(p)
           when 'avisos'  then public.cron_avisos_validos(p)
           when 'louvor'  then public.cron_louvor_valido(p)
           when 'linha'   then public.cron_linha_valida(p)
           else false end;
$fn$;

/* o nome como a folha escreve: as duas primeiras palavras */
create or replace function public.cron_nome_curto(p_nome text)
returns text language sql immutable set search_path = public as $fn$
  select nullif(array_to_string((regexp_split_to_array(btrim(coalesce(p_nome, '')), '\s+'))[1:2], ' '), '');
$fn$;

/* quem está gravando, com login: o nome da pessoa se a base central (94)
   conhece o e-mail; senão, o começo do e-mail */
create or replace function public.cron_quem_grava()
returns text language sql stable security definer set search_path = public as $fn$
  select coalesce(
    (select public.cron_nome_curto(p.nome) from pessoas p
      where lower(p.auth_email) = lower(nullif(auth.jwt() ->> 'email', '')) limit 1),
    (select public.cron_nome_curto(p.nome) from lideres l join pessoas p on p.id = l.pessoa_id
      where lower(l.email) = lower(nullif(auth.jwt() ->> 'email', '')) limit 1),
    nullif(split_part(coalesce(auth.jwt() ->> 'email', ''), '@', 1), ''),
    'liderança');
$fn$;

do $priv$ declare f text; begin
  foreach f in array array['public.cron_normalizar(text,jsonb)', 'public.cron_bloco_valido(text,jsonb)',
                           'public.cron_nome_curto(text)', 'public.cron_quem_grava()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $priv$;

-- =========================================================================
-- 7 · a folha de um culto (por dentro: as portas abaixo é que decidem quem lê)
-- =========================================================================
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
           'bpm', it.value -> 'bpm', 'quem', it.value ->> 'quem'))
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

/* gravar UM bloco, com a linha do cronograma travada: duas pessoas salvando
   juntas passam uma de cada vez, e a segunda recebe MUDOU com o que a
   primeira gravou, em vez de apagar o trabalho dela em silêncio */
create or replace function public.cronograma_gravar(p_culto uuid, p_bloco text, p_valor jsonb, p_antes jsonb,
                                                    p_por text, p_via text, p_modelo boolean)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_nova jsonb; v_atual jsonb; v_tipo text; v_modelo jsonb; v_cr public.cronogramas%rowtype; v_data date;
        v_antes jsonb := case when jsonb_typeof(p_antes) = 'null' then null else p_antes end;
begin
  if p_bloco is null or p_bloco not in ('palavra', 'avisos', 'louvor', 'linha') then
    return jsonb_build_object('ok', false, 'erro', 'BLOCO_INVALIDO');
  end if;
  v_nova := cron_normalizar(p_bloco, p_valor);
  if not coalesce(cron_bloco_valido(p_bloco, v_nova), false) then
    return jsonb_build_object('ok', false, 'erro', 'VALOR_INVALIDO');
  end if;

  select c.data into v_data from cultos c where c.id = p_culto and c.evento is null;
  if v_data is null then return jsonb_build_object('ok', false, 'erro', 'CULTO_INEXISTENTE'); end if;
  v_tipo := case when extract(dow from v_data) = 6 then 'follow' else 'domingo' end;

  insert into cronogramas (culto_id) values (p_culto) on conflict (culto_id) do nothing;
  select * into v_cr from cronogramas where culto_id = p_culto for update;
  select m.linha into v_modelo from cronograma_modelos m where m.tipo = v_tipo for update;

  v_atual := case p_bloco when 'palavra' then v_cr.palavra when 'avisos' then v_cr.avisos
                          when 'louvor' then v_cr.louvor else coalesce(v_cr.linha, v_modelo) end;
  /* o null do JSON (`"p_antes": null` dentro de um objeto) e o nulo do
     banco são a mesma coisa aqui: "estava vazio" */
  if v_atual is distinct from v_antes then
    return jsonb_build_object('ok', false, 'erro', 'MUDOU', 'atual', v_atual);
  end if;

  /* "usar nos próximos": o modelo vira estes horários, e este culto passa a
     seguir o modelo (sem cópia própria). Os cultos que tinham horários
     próprios continuam com os deles. */
  if p_bloco = 'linha' and coalesce(p_modelo, false) and v_nova is not null then
    update cronograma_modelos set linha = v_nova, atualizado_em = now(), atualizado_por = p_por
     where tipo = v_tipo;
    v_modelo := v_nova;
    v_nova := null;
  end if;

  update cronogramas set
    palavra = case when p_bloco = 'palavra' then v_nova else palavra end,
    avisos  = case when p_bloco = 'avisos'  then v_nova else avisos  end,
    louvor  = case when p_bloco = 'louvor'  then v_nova else louvor  end,
    linha   = case when p_bloco = 'linha'   then v_nova else linha   end,
    autoria = autoria || jsonb_build_object(p_bloco, jsonb_build_object('por', p_por, 'em', now(), 'via', p_via)),
    atualizado_em = now()
  where culto_id = p_culto;

  return jsonb_build_object('ok', true, 'bloco', p_bloco,
    'valor', case when p_bloco = 'linha' then coalesce(v_nova, v_modelo) else v_nova end,
    'linha_propria', case when p_bloco = 'linha' then v_nova is not null end,
    'autoria', jsonb_build_object('por', p_por, 'em', now(), 'via', p_via));
end $fn$;
revoke all on function public.cronograma_gravar(uuid, text, jsonb, jsonb, text, text, boolean) from public, anon, authenticated;

-- =========================================================================
-- 8 · as portas de quem lidera (login)
-- =========================================================================
create or replace function public.cronograma_do_dia(p_data date)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_culto uuid; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not sou_lider() then return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
  if p_data is null or extract(dow from p_data) not in (0, 6) then
    return jsonb_build_object('ok', false, 'erro', 'DATA_SEM_CULTO');
  end if;
  select c.id into v_culto from cultos c where c.data = p_data and c.evento is null;
  return jsonb_build_object('ok', true,
           'pode_editar', p_data >= v_hoje or lidera_tudo(), 'admin', lidera_tudo())
         || cronograma_dados(v_culto, p_data, false);
end $fn$;
revoke all on function public.cronograma_do_dia(date) from public, anon;
grant execute on function public.cronograma_do_dia(date) to authenticated;

/* a lista dos próximos: até 20 datas de uma vez, cada uma a folha inteira
   (a tela conta as pendências com a mesma regra da folha) */
create or replace function public.cronogramas_das_datas(p_datas date[])
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_out jsonb := '[]'::jsonb; d date; v_culto uuid;
begin
  if not sou_lider() then return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
  if p_datas is null or coalesce(array_length(p_datas, 1), 0) > 20 then
    return jsonb_build_object('ok', false, 'erro', 'DATAS_INVALIDAS');
  end if;
  for d in select distinct x from unnest(p_datas) x where x is not null and extract(dow from x) in (0, 6) order by 1 loop
    select c.id into v_culto from cultos c where c.data = d and c.evento is null;
    v_out := v_out || jsonb_build_array(cronograma_dados(v_culto, d, false));
  end loop;
  return jsonb_build_object('ok', true, 'cultos', v_out);
end $fn$;
revoke all on function public.cronogramas_das_datas(date[]) from public, anon;
grant execute on function public.cronogramas_das_datas(date[]) to authenticated;

/* o histórico: os cultos que já têm cronograma gravado, do mais novo para trás */
create or replace function public.cronogramas_registrados(p_antes date, p_limite int)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_out jsonb;
begin
  if not sou_lider() then return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'data', c.data, 'tipo', c.tipo,
           'tema', r.palavra ->> 'tema', 'quem', r.palavra ->> 'quem',
           'ceia', (r.palavra ->> 'ceia')::boolean, 'atualizado_em', r.atualizado_em))
         order by c.data desc), '[]'::jsonb)
    into v_out
    from (select r0.* from cronogramas r0 join cultos c0 on c0.id = r0.culto_id
           where c0.evento is null and c0.data < coalesce(p_antes, 'infinity'::date)
           order by c0.data desc
           limit greatest(1, least(coalesce(p_limite, 60), 200))) r
    join cultos c on c.id = r.culto_id;
  return jsonb_build_object('ok', true, 'cultos', v_out);
end $fn$;
revoke all on function public.cronogramas_registrados(date, int) from public, anon;
grant execute on function public.cronogramas_registrados(date, int) to authenticated;

/* o culto regular da data, criado se ainda não existe (o culto da igreja
   nasce quando alguém salva o primeiro pedaço dele, como na escala) */
create or replace function public.cron_culto_da_data(p_data date)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare v_culto uuid;
begin
  select c.id into v_culto from cultos c where c.data = p_data and c.evento is null;
  if v_culto is null then
    begin
      insert into cultos (data) values (p_data) returning id into v_culto;
    exception when unique_violation then
      select c.id into v_culto from cultos c where c.data = p_data and c.evento is null;
    end;
  end if;
  return v_culto;
end $fn$;
revoke all on function public.cron_culto_da_data(date) from public, anon, authenticated;

create or replace function public.cronograma_salvar(p_data date, p_bloco text, p_valor jsonb, p_antes jsonb,
                                                    p_modelo boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_culto uuid; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not sou_lider() then return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
  if p_data is null or extract(dow from p_data) not in (0, 6) then
    return jsonb_build_object('ok', false, 'erro', 'DATA_SEM_CULTO');
  end if;
  if p_bloco is null or p_bloco not in ('palavra', 'avisos', 'louvor', 'linha') then
    return jsonb_build_object('ok', false, 'erro', 'BLOCO_INVALIDO');
  end if;
  /* o que passou fica registrado como foi: só quem organiza a igreja inteira
     corrige depois */
  if p_data < v_hoje and not lidera_tudo() then
    return jsonb_build_object('ok', false, 'erro', 'JA_PASSOU');
  end if;
  if p_data > v_hoje + 400 then
    return jsonb_build_object('ok', false, 'erro', 'LONGE_DEMAIS');
  end if;
  /* valor errado não cria culto à toa */
  if not coalesce(cron_bloco_valido(p_bloco, cron_normalizar(p_bloco, p_valor)), false) then
    return jsonb_build_object('ok', false, 'erro', 'VALOR_INVALIDO');
  end if;
  begin
    v_culto := cron_culto_da_data(p_data);
  exception when others then
    return jsonb_build_object('ok', false, 'erro', 'CULTO_RECUSADO', 'motivo', sqlerrm);
  end;
  return cronograma_gravar(v_culto, p_bloco, p_valor, p_antes, cron_quem_grava(), 'lider', coalesce(p_modelo, false));
end $fn$;
revoke all on function public.cronograma_salvar(date, text, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.cronograma_salvar(date, text, jsonb, jsonb, boolean) to authenticated;

/* o link da folha para o grupo: garante o culto e o cronograma, e devolve o
   token (o mesmo para sempre) */
create or replace function public.cronograma_link(p_data date)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_culto uuid; v_token text;
begin
  if not sou_lider() then return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
  if p_data is null or extract(dow from p_data) not in (0, 6) then
    return jsonb_build_object('ok', false, 'erro', 'DATA_SEM_CULTO');
  end if;
  begin
    v_culto := cron_culto_da_data(p_data);
  exception when others then
    return jsonb_build_object('ok', false, 'erro', 'CULTO_RECUSADO', 'motivo', sqlerrm);
  end;
  insert into cronogramas (culto_id) values (v_culto) on conflict (culto_id) do nothing;
  select r.token into v_token from cronogramas r where r.culto_id = v_culto;
  return jsonb_build_object('ok', true, 'token', v_token);
end $fn$;
revoke all on function public.cronograma_link(date) from public, anon;
grant execute on function public.cronograma_link(date) to authenticated;

-- =========================================================================
-- 9 · as portas públicas: a folha pelo link, e o dirigente pelo link dele
-- =========================================================================
create or replace function public.cronograma_publico(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_culto uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{18}$' then
    return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO');
  end if;
  select r.culto_id into v_culto from cronogramas r where r.token = p_token;
  if v_culto is null then return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO'); end if;
  return jsonb_build_object('ok', true) || cronograma_dados(v_culto, null, true);
end $fn$;
revoke all on function public.cronograma_publico(text) from public;
grant execute on function public.cronograma_publico(text) to anon, authenticated;

/* é o dirigente deste culto: está (ou outro vínculo da MESMA pessoa está,
   94) no posto de dirigente, sem ter dito que não pode e sem ter furado */
create or replace function public.cron_dirige(p_vol uuid, p_culto uuid)
returns boolean language sql stable security definer set search_path = public as $fn$
  select exists (
    select 1 from escalacoes e
      join funcoes f on f.id = e.funcao_id
      join voluntarios o on o.id = e.voluntario_id
     where e.culto_id = p_culto and f.cronograma = 'dirigente' and f.ativa
       and e.status in ('pendente', 'confirmado') and o.ativo
       and (o.id = p_vol
            or o.pessoa_id is not null
               and o.pessoa_id = (select v.pessoa_id from voluntarios v where v.id = p_vol)));
$fn$;
revoke all on function public.cron_dirige(uuid, uuid) from public, anon, authenticated;

/* os cultos dos próximos 21 dias em que a pessoa é o dirigente, cada um com
   a folha inteira (o link dela mostra o que falta e abre o formulário) */
create or replace function public.eu_cronogramas(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare v_id uuid; v_out jsonb := '[]'::jsonb; r record;
        v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select v.id into v_id from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;
  for r in select c.id, c.data from cultos c
            where c.evento is null and c.data between v_hoje and v_hoje + 21
              and cron_dirige(v_id, c.id)
            order by c.data
  loop
    v_out := v_out || jsonb_build_array(cronograma_dados(r.id, r.data, true));
  end loop;
  return jsonb_build_object('ok', true, 'cultos', v_out);
end $fn$;
revoke all on function public.eu_cronogramas(text) from public;
grant execute on function public.eu_cronogramas(text) to anon, authenticated;

create or replace function public.eu_cronograma_salvar(p_token text, p_data date, p_bloco text,
                                                       p_valor jsonb, p_antes jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_nome text; v_culto uuid;
        v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select v.id, v.nome into v_id, v_nome from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;
  /* o dirigente escreve a Palavra e os Avisos; o resto é da liderança */
  if p_bloco is null or p_bloco not in ('palavra', 'avisos') then
    return jsonb_build_object('ok', false, 'erro', 'BLOCO_INVALIDO');
  end if;
  select c.id into v_culto from cultos c where c.data = p_data and c.evento is null;
  if v_culto is null then return jsonb_build_object('ok', false, 'erro', 'CULTO_INEXISTENTE'); end if;
  if p_data < v_hoje then return jsonb_build_object('ok', false, 'erro', 'JA_PASSOU'); end if;
  if not cron_dirige(v_id, v_culto) then return jsonb_build_object('ok', false, 'erro', 'SEM_PERMISSAO'); end if;
  return cronograma_gravar(v_culto, p_bloco, p_valor, p_antes, cron_nome_curto(v_nome), 'dirigente', false);
end $fn$;
revoke all on function public.eu_cronograma_salvar(text, date, text, jsonb, jsonb) from public;
grant execute on function public.eu_cronograma_salvar(text, date, text, jsonb, jsonb) to anon, authenticated;

-- =========================================================================
-- 10 · inventário da porta pública (77)
-- =========================================================================
do $porta$ begin
  if to_regclass('public.porta_publica') is null then
    raise notice 'PULEI o inventario: este banco nao tem porta_publica (falta a 77).';
    return;
  end if;
  insert into public.porta_publica (funcao, motivo, n) values
    ('areas_do_espaco()',
     'a lista de areas em /eu, para a pessoa achar o proprio nome e entrar com o PIN. Inclui as areas que nao aparecem no site (109): so slug e nome.', 109),
    ('cronograma_publico(p_token text)',
     'a folha do cronograma de um culto pelo link do grupo (token de 18 hex, sem data na URL). Nomes curtos de quem comanda, sem telefone (109).', 109),
    ('eu_cronogramas(p_token text)',
     'os cultos dos proximos 21 dias em que o dono do link e o dirigente, com a folha de cada um, para ele ver o que falta (109).', 109),
    ('eu_cronograma_salvar(p_token text, p_data date, p_bloco text, p_valor jsonb, p_antes jsonb)',
     'o dirigente da semana grava a Palavra e os Avisos do culto em que esta escalado, ate o dia; nada de outro bloco nem de outro culto (109).', 109)
  on conflict (funcao) do update set motivo = excluded.motivo, n = excluded.n;
end $porta$;


-- =========================================================================
-- 11 · o teste de permissão conta as áreas que o site mostra
-- =========================================================================
/* O corpo é o da 70, como está no banco, com UMA mudança: o caso "lista de
   ministérios abre" contava TODAS as equipes e comparava com
   `ministerios_publicos()`. Com áreas fora do site (seção 1), a conta
   passou a ser a das áreas públicas com posto ativo, que é o que a função
   promete. Medido: sem esta mudança, 67/68, e o caso que reprova é o certo. */
CREATE OR REPLACE FUNCTION public.testar_permissoes()
 RETURNS TABLE(grupo text, caso text, esperado text, obtido text, passou boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_louvor uuid; v_midia uuid; v_servico uuid;
  n bigint; m bigint; mm bigint; ok boolean; erro text; txt text;
  /* 70 · o cenário que os casos de isolamento precisam para não serem vácuo */
  v_suf text; v_eq_t uuid; v_fn_t uuid; v_p_t uuid; v_vol_t uuid;
  v_cand_t uuid; v_culto_t uuid; v_ev_t uuid; v_dia_t date; v_tel_t text; v_alvo uuid; v_perg_t uuid; v_onb_t uuid;
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
  /* 109 · A FONTE É O QUE O SITE MOSTRA: área pública (equipes.publica) com
     posto ativo. A Produção e os Dirigentes servem no culto e ficam fora
     do site de propósito; contar todas as equipes reprovaria o certo. */
  select count(*) into m from equipes e
   where e.publica and exists (select 1 from funcoes f where f.equipe_id = e.id and f.ativa);
  set local role anon; select count(*) into n from ministerios_publicos(); reset role;
  return query select 'visitante'::text, 'lista de ministérios abre'::text,
    m::text, n::text, n = m;

  /* O 6 ESCRITO À MÃO ERA O MESMO DEFEITO QUE ESTA MIGRAÇÃO VEIO REMOVER.

     Os dois casos vizinhos (ministérios, nomes do Louvor) foram corrigidos
     aqui mesmo para contar a FONTE em vez de repetir um número de agosto, e
     este escapou: `'6'::text, n::text, n = 6`. Bastava a líder do Louvor
     escrever uma pergunta nova no formulário dela para `testar_permissoes`
     ficar vermelho sem nada ter quebrado — e, pior, para a pessoa que lê o
     relatório aprender a ignorar uma linha vermelha.

     O esperado agora é a mesma consulta que `perguntas_publicas` faz (23:44):
     pergunta ativa, da equipe ou geral. Encontrado na reauditoria da própria
     70, em 21/09. */
  select count(*) into m
    from perguntas q left join equipes e on e.id = q.equipe_id
   where q.ativa and (q.equipe_id is null or e.slug = 'louvor');
  set local role anon; select count(*) into n from perguntas_publicas('louvor'); reset role;
  return query select 'visitante'::text, 'formulário do Louvor abre'::text,
    m::text, n::text, n = m and m > 0;

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

  /* 70 · ESTE CASO TINHA `true` LITERAL NA COLUNA `passou`.

     Ele não podia reprovar, qualquer que fosse `n`: era um contador vestido de
     asserção, e um dos "37/37". A dívida que ele mede é real — política
     `FOR ALL` faz leitura e escrita dividirem o mesmo teste —, mas medir sem
     limite não impede nada.

     O limite é o número de hoje. Ele não manda ninguém consertar a dívida;
     manda NÃO AUMENTAR ela sem passar por aqui, que é o que um caso de teste
     pode honestamente cobrar. Quem converter uma `FOR ALL` em políticas
     separadas baixa este número no mesmo arquivo. */
  select count(*) into n from pg_policy where polcmd = '*';
  return query select 'estrutura'::text, 'policies FOR ALL não aumentaram (dívida travada)'::text,
    '<= 14'::text, n::text, n <= 14;

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

  -- =====================================================================
  -- 70 · O CENÁRIO, E POR QUE ELE PRECISOU EXISTIR
  --
  -- Auditoria de 21/09/2026, medida política por política: derrubando cada
  -- uma, 31 das 37 não eram acusadas; trocando cada uma por `using (true)`,
  -- 29 das 37. A mais grave: `papeis_criar` aberta deixa o organizador de UMA
  -- área se tornar admin da igreja inteira, e o teste dizia 37/37 antes e
  -- depois.
  --
  -- Duas causas, e as duas são consertadas daqui para baixo.
  --
  -- A PRIMEIRA: todo caso "NÃO vê X" era vácuo, porque X não existe. Medido no
  -- banco nascido do repositório: voluntários fora do Louvor = 0, escalações =
  -- 0, candidaturas = 0, respostas = 0, histórico = 0. O autor previu esse
  -- risco e escreveu a guarda — "o Louvor não está vazio (senão os casos do
  -- Louvor são vácuo)" — mas só para o lado que precisa VER. Não existia a
  -- simétrica, e é dela que dependem todos os "NÃO vê".
  --
  -- A SEGUNDA: não havia UM ÚNICO CASO DE ESCRITA. Os 37 eram `select
  -- count(*)`, chamada de função ou leitura de `pg_policy`. Política de INSERT
  -- e de UPDATE podia virar `true` sem ninguém notar — foi assim que o buraco
  -- de `cultos_editar` (migração 69) sobreviveu a 37/37.
  --
  -- O cenário abaixo é criado e apagado POR ID dentro desta mesma chamada. A
  -- função é `security invoker` e só `postgres` e `service_role` podem
  -- executá-la, então quem cria é quem já podia criar. Se algum caso levantar,
  -- a instrução inteira volta atrás e nada fica para trás.
  -- =====================================================================

  v_suf := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  v_tel_t := '21' || lpad((floor(random()*900000000)+100000000)::text, 9, '0');

  insert into equipes (nome, slug, ordem)
       values ('Perm ' || v_suf, 'perm-' || v_suf, 9990) returning id into v_eq_t;
  insert into funcoes (equipe_id, nome, ordem, ativa, tipos)
       values (v_eq_t, 'POSTO ' || v_suf, 1, true, array['domingo']) returning id into v_fn_t;
  insert into pessoas (nome, telefone) values ('Perm ' || v_suf, v_tel_t) returning id into v_p_t;
  insert into voluntarios (equipe_id, pessoa_id, nome, telefone, conferido, ativo)
       values (v_eq_t, v_p_t, 'Perm ' || v_suf, v_tel_t, true, true) returning id into v_vol_t;
  insert into candidaturas (pessoa_id, equipe_id) values (v_p_t, v_eq_t) returning id into v_cand_t;
  insert into historico_candidatura (candidatura_id, de, para, por, nota)
       values (v_cand_t, null, 'enviada', 'testar_permissoes', 'cenario do teste');
  insert into habilidades (voluntario_id, funcao_id, nivel, confirmado)
       values (v_vol_t, v_fn_t, 'titular', true);
  insert into indisponibilidades (voluntario_id, data) values (v_vol_t, current_date + 120)
    on conflict do nothing;
  insert into disponibilidade (voluntario_id, data, pode) values (v_vol_t, current_date + 121, true)
    on conflict do nothing;
  insert into config (equipe_id) values (v_eq_t) on conflict do nothing;
  insert into candidatura_funcoes (candidatura_id, funcao_id) values (v_cand_t, v_fn_t)
    on conflict do nothing;
  insert into perguntas (equipe_id, texto, ordem, ativa)
       values (v_eq_t, 'Pergunta ' || v_suf, 990, true) returning id into v_perg_t;
  insert into onboarding_etapas (equipe_id, titulo, ordem, ativa)
       values (v_eq_t, 'Etapa ' || v_suf, 990, true) returning id into v_onb_t;
  select id into v_culto_t from cultos where evento is null order by data limit 1;
  if v_culto_t is not null then
    insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
         values (v_culto_t, v_fn_t, v_vol_t, 'pendente', false, false);
    insert into plantoes (culto_id, voluntario_id) values (v_culto_t, v_vol_t)
      on conflict do nothing;
    insert into culto_obs (culto_id, equipe_id, obs) values (v_culto_t, v_eq_t, 'obs ' || v_suf)
      on conflict (culto_id, equipe_id) do update set obs = excluded.obs;
  end if;
  /* um evento DESTA equipe de teste, num dia sem culto, para o ataque da 69 */
  v_dia_t := (current_date + 90)::date;
  while extract(dow from v_dia_t) in (0, 6) loop v_dia_t := v_dia_t + 1; end loop;
  insert into cultos (data, evento, equipe_id, obs)
       values (v_dia_t, 'Perm ' || v_suf, v_eq_t, 'anotacao ' || v_suf) returning id into v_ev_t;

  -- ---------------------------------------------------------------------
  -- A · O CENÁRIO EXISTE (sem isto, tudo abaixo é vácuo)
  -- ---------------------------------------------------------------------
  select count(*) into n from voluntarios v where v.equipe_id <> v_louvor;
  return query select 'cenário'::text, 'existe voluntário FORA do Louvor para não ser visto'::text,
    '> 0'::text, n::text, n > 0;

  select count(*) into n from candidaturas c where c.equipe_id <> v_louvor;
  return query select 'cenário'::text, 'existe candidatura FORA do Louvor para não ser vista'::text,
    '> 0'::text, n::text, n > 0;

  select count(*) into n from escalacoes e join funcoes f on f.id = e.funcao_id
   where f.equipe_id <> v_louvor;
  return query select 'cenário'::text, 'existe escalação FORA do Louvor para não ser vista'::text,
    '> 0'::text, n::text, n > 0;

  -- ---------------------------------------------------------------------
  -- B · A VARREDURA, TABELA POR TABELA
  --
  -- Oito casos escritos à mão cobriam três tabelas, e a auditoria mediu o
  -- resultado disso: afrouxando cada política para `using (true)`, só 11 das
  -- 37 eram acusadas. As doze abaixo são as tabelas que a RLS separa POR
  -- EQUIPE, e o laço cobra a mesma coisa de todas: o organizador do Louvor
  -- não enxerga uma linha de NENHUMA outra área.
  --
  -- É um laço e não doze casos escritos porque tabela nova que nasça escopada
  -- entra aqui em uma linha — e porque doze casos copiados e colados é a
  -- forma que mais rápido fica para trás.
  --
  -- Cada entrada leva a consulta que conta as linhas DE FORA do Louvor. O
  -- cenário acima planta uma linha em cada, então nenhum destes casos pode
  -- passar por vácuo — e o caso do cenário, logo acima, reprova se algum dia
  -- puder.
  -- ---------------------------------------------------------------------
  /* CADA CONSULTA TOCA UMA TABELA SÓ, E ISSO CUSTOU UMA RODADA DE MEDIÇÃO.

     A primeira versão deste laço lia `escalacoes` com `join funcoes ... where
     f.equipe_id <> $1`. Medido abrindo `eq_escalacoes` de par em par: o caso
     continuava verde — porque quem filtrava o resultado era a política de
     `funcoes`, não a de `escalacoes`. Caso que passa com a política aberta é
     exatamente o que este arquivo existe para eliminar.

     Agora o parâmetro é um id do cenário, capturado ANTES da troca de papel, e
     a consulta não sai da tabela que está sendo testada. */
  for txt, erro, v_alvo in
    select * from (values
      ('voluntarios',           'select count(*) from voluntarios where equipe_id = $1',            v_eq_t),
      ('funcoes',               'select count(*) from funcoes where equipe_id = $1',                v_eq_t),
      ('config',                'select count(*) from config where equipe_id = $1',                 v_eq_t),
      ('culto_obs',             'select count(*) from culto_obs where equipe_id = $1',              v_eq_t),
      ('candidaturas',          'select count(*) from candidaturas where equipe_id = $1',           v_eq_t),
      ('escalacoes',            'select count(*) from escalacoes where funcao_id = $1',             v_fn_t),
      ('habilidades',           'select count(*) from habilidades where funcao_id = $1',            v_fn_t),
      ('indisponibilidades',    'select count(*) from indisponibilidades where voluntario_id = $1', v_vol_t),
      ('disponibilidade',       'select count(*) from disponibilidade where voluntario_id = $1',    v_vol_t),
      ('plantoes',              'select count(*) from plantoes where voluntario_id = $1',           v_vol_t),
      ('candidatura_funcoes',   'select count(*) from candidatura_funcoes where candidatura_id = $1', v_cand_t),
      ('historico_candidatura', 'select count(*) from historico_candidatura where candidatura_id = $1', v_cand_t),
      ('pessoas',               'select count(*) from pessoas where id = $1',                       v_p_t),
      ('perguntas',             'select count(*) from perguntas where id = $1',                     v_perg_t),
      ('onboarding_etapas',     'select count(*) from onboarding_etapas where id = $1',             v_onb_t)
    ) t(tabela, consulta, alvo)
  loop
    /* quanto existe, visto por quem enxerga tudo: zero aqui quer dizer que o
       cenário não montou e o caso seria vácuo — e é isso que se reprova */
    execute erro into m using v_alvo;

    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    execute erro into n using v_alvo;
    reset role;

    return query select 'isolamento'::text,
      format('o organizador do Louvor não vê a linha de outra área em `%s`', txt)::text,
      case when m > 0 then '0' else 'VÁCUO: o cenário não montou esta linha' end::text,
      n::text,
      m > 0 and n = 0;
  end loop;

  -- ---------------------------------------------------------------------
  -- C · ESCRITA. Era isto que não existia.
  -- ---------------------------------------------------------------------

  /* C1 · O MAIS GRAVE DE TODOS: virar admin da igreja.
     `papeis_criar` é a única coisa entre "líder de uma área" e "dono de
     tudo". Com ela aberta, o organizador de qualquer ministério se promove
     numa linha — e `quem_sou()` entrega o próprio `pessoa_id` de graça. */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    insert into papeis (pessoa_id, papel, criado_por)
    select p.id, 'admin', 'testar_permissoes'
      from pessoas p where lower(p.auth_email) = 'jander.jpcris@gmail.com';
    get diagnostics n = row_count;
    reset role;
  exception when others then reset role; n := 0; end;
  return query select 'escrita'::text, 'organizador de área NÃO se promove a admin (papeis_criar)'::text,
    '0'::text, n::text, n = 0;

  /* e se por acaso passou, isto diz em voz alta o que aconteceu */
  set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
  select count(*) into n from equipes;
  reset role;
  return query select 'escrita'::text, 'e ele continua enxergando UM ministério só'::text,
    '1'::text, n::text, n = 1;

  /* C2 · mudar a identidade de alguém (`pessoas_editar` é lidera_tudo()) */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    update pessoas set auth_email = 'invadido@exemplo.invalido' where id = v_p_t;
    get diagnostics n = row_count;
    reset role;
  exception when others then reset role; n := 0; end;
  return query select 'escrita'::text, 'organizador de área NÃO muda o e-mail de acesso de ninguém'::text,
    '0'::text, n::text, n = 0;

  /* C3 · O ATAQUE DA 69: constante sem `where`. `update` que não cita coluna
     nenhuma não passa pela política de SELECT, e sobra só o USING do UPDATE. */
  /* ============================================================ 78 ======
     ESTE CASO APAGAVA DADO REAL, E O VEREDITO VINHA DA CAMADA ERRADA.

     `update cultos set obs = null` sem `where`: a política `cultos_editar`
     deixa o Jander alcançar os EVENTOS que ele lidera, e `culto_guarda` não
     recusa evento do próprio dono. Então, quando nenhuma outra linha faz o
     gatilho levantar primeiro, a instrução conclui e zera a anotação de
     todos os eventos do ministério dele — sem volta, numa função que o
     cabeçalho diz que alguém roda contra produção.

     Hoje ela é salva por ACIDENTE: alguma linha de culto regular tem `obs`,
     o gatilho levanta, e o `exception` engole. Depender de outra linha
     levantar primeiro não é guarda.

     Agora o ataque roda dentro de um savepoint que sempre volta. */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    update cultos set obs = null;
    reset role;
    raise exception 'desfazendo' using errcode = 'triggered_action_exception';
  exception
    when triggered_action_exception then null;
    when others then reset role;
  end;
  select count(*) into n from cultos where id = v_ev_t and obs = 'anotacao ' || v_suf;
  return query select 'escrita'::text, 'a anotação do evento de outra área sobrevive a `update cultos set obs = null`'::text,
    '1'::text, n::text, n = 1;

  /* C4 · cadastrar gente no time dos outros */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    insert into voluntarios (equipe_id, nome, telefone, conferido, ativo)
         values (v_eq_t, 'Intruso ' || v_suf, '21988887777', true, true);
    get diagnostics n = row_count;
    reset role;
  exception when others then reset role; n := 0; end;
  return query select 'escrita'::text, 'organizador NÃO cadastra voluntário na área de outro'::text,
    '0'::text, n::text, n = 0;

  /* C5 · criar posto na área dos outros */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    insert into funcoes (equipe_id, nome, ordem, ativa) values (v_eq_t, 'INVASOR', 99, true);
    get diagnostics n = row_count;
    reset role;
  exception when others then reset role; n := 0; end;
  return query select 'escrita'::text, 'nem cria posto na área de outro'::text,
    '0'::text, n::text, n = 0;

  /* C6 · mexer no voluntário dos outros */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    update voluntarios set ativo = false where id = v_vol_t;
    get diagnostics n = row_count;
    reset role;
  exception when others then reset role; n := 0; end;
  return query select 'escrita'::text, 'nem pausa voluntário de outra área'::text,
    '0'::text, n::text, n = 0;

  /* C7 · e quem não lidera nada não escreve em lugar nenhum.

     ============================================================== 79 ======
     O ATAQUE ESCREVIA FORA DO CENÁRIO, E A LIMPEZA NÃO LEVAVA.

     `v_louvor` é o Louvor de VERDADE, e o nome era `'DE FORA'`, sem sufixo.
     `funcoes.tipos` tem default `{domingo,follow}` e a linha nasce `ativa`:
     no dia em que a política se abrisse — que é o que este caso existe para
     detectar — 'DE FORA' viraria uma vaga vazia permanente em todo domingo e
     todo Follow do Louvor, para sempre, e a limpeza por id do cenário não a
     alcançava.

     Agora: savepoint que sempre volta, e o nome leva o sufixo sorteado, para
     que uma linha que escape possa ser achada e apagada. */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_zé, true);
    insert into funcoes (equipe_id, nome, ordem, ativa)
         values (v_louvor, 'DE FORA ' || v_suf, 98, true);
    get diagnostics n = row_count;
    reset role;
    raise exception 'desfazendo' using errcode = 'triggered_action_exception', detail = n::text;
  exception
    when triggered_action_exception then
      declare v_det text; begin
        get stacked diagnostics v_det = pg_exception_detail;
        n := coalesce(nullif(v_det,'')::int, 0);
      end;
    when others then reset role; n := 0;
  end;
  return query select 'escrita'::text, 'quem não lidera nada não cria posto em lugar nenhum'::text,
    '0'::text, n::text, n = 0;

  /* C8 · `anon` não escreve nada, em tabela nenhuma */
  /* 79 · savepoint aqui também, e telefone SORTEADO: o fixo '21900000000'
     colide com `pessoas.telefone unique` se alguém de verdade tiver esse
     número, e aí o caso passa por 23505 em vez de por falta de permissão. */
  begin
    set local role anon;
    insert into pessoas (nome, telefone)
         values ('Anon ' || v_suf, '21' || lpad((floor(random()*900000000)+100000000)::text, 9, '0'));
    get diagnostics n = row_count;
    reset role;
    raise exception 'desfazendo' using errcode = 'triggered_action_exception', detail = n::text;
  exception
    when triggered_action_exception then
      declare v_det text; begin
        get stacked diagnostics v_det = pg_exception_detail;
        n := coalesce(nullif(v_det,'')::int, 0);
      end;
    when others then reset role; n := 0;
  end;
  return query select 'escrita'::text, 'anon não escreve em `pessoas`'::text,
    '0'::text, n::text, n = 0;

  /* ============================================================ 74 ======
     C9 · AS SEIS PORTAS QUE A 74 TIROU CONTINUAM TIRADAS.

     A conferência da 74 refaz os quatro ataques, mas ela roda uma vez, na
     hora de aplicar o arquivo. Isto aqui roda toda vez que alguém pergunta
     ao banco se ele está inteiro — inclusive contra produção, meses depois,
     quando alguém recriar uma delas pelo painel do Supabase achando que
     falta permissão.

     A lista é nominal de propósito: `cand_editar` recriada com outro nome
     não é pega por este caso, e é por isso que os casos de ATAQUE (C10 e
     C11 abaixo) existem ao lado dele. Nome some, comportamento fica. */
  select count(*) into n from pg_policies where schemaname = 'public'
   and policyname in ('cand_editar','hist_criar','perg_criar','perg_editar','perg_apagar','onbf_tudo');
  return query select 'escrita'::text,
    'as seis politicas sem consumidor continuam apagadas (74)'::text,
    '0'::text, n::text ||
      coalesce(' (' || (select string_agg(policyname, ', ') from pg_policies
                         where schemaname = 'public'
                           and policyname in ('cand_editar','hist_criar','perg_criar',
                                              'perg_editar','perg_apagar','onbf_tudo')) || ')', ''),
    n = 0;

  /* C10 · e o ATAQUE que `cand_editar` permitia continua recusado, venha a
     porta com o nome que vier. Era ele que fazia a tela da candidata dizer
     "Você está servindo" sem existir vínculo nenhum. */
  /* O ATAQUE VOLTA ATRÁS SOZINHO. `begin ... exception` é savepoint, e o
     `raise` no fim desfaz o `update` tenha ele alcançado o que for. Sem
     isso, o dia em que a política voltasse, ESTE TESTE aprovaria toda
     candidatura do ministério do Jander — e `testar_permissoes` é a função
     que o cabeçalho diz que alguém roda contra produção meses depois. */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    update candidaturas set status = 'ativa';
    get diagnostics n = row_count; reset role;
    raise exception 'desfazendo' using errcode = 'triggered_action_exception', detail = n::text;
  exception
    when triggered_action_exception then
      declare v_det text; begin
        get stacked diagnostics v_det = pg_exception_detail;
        n := coalesce(nullif(v_det,'')::int, 0);
      end;
    when others then reset role; n := 0;
  end;
  return query select 'escrita'::text,
    'organizador NÃO muda status de candidatura por fora de `decidir_candidatura`'::text,
    '0'::text, n::text, n = 0;

  /* C11 · e o `por` do histórico não é forjável: a coluna é a única coisa no
     sistema que responde "quem decidiu isso?" */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    insert into historico_candidatura (candidatura_id, de, para, por, nota)
      select c.id, 'enviada', 'aprovada', 'nao-fui-eu@exemplo.invalido', 'teste'
        from candidaturas c where c.equipe_id = v_louvor limit 1;
    get diagnostics n = row_count; reset role;
  exception when others then reset role; n := 0; end;
  return query select 'escrita'::text,
    'organizador NÃO escreve historico com `por` de outra pessoa'::text,
    '0'::text, n::text, n = 0;

  /* C12 · e o formulário público do ministério não some numa linha só */
  /* idem: o delete volta atrás sempre. Sem o savepoint, o dia em que
     `perg_apagar` voltasse, este caso apagaria o formulário público do
     Louvor ao ser executado — e ele existe para IMPEDIR isso. */
  begin
    set local role authenticated; perform set_config('request.jwt.claims', jwt_jander, true);
    delete from perguntas;
    get diagnostics n = row_count; reset role;
    raise exception 'desfazendo' using errcode = 'triggered_action_exception', detail = n::text;
  exception
    when triggered_action_exception then
      declare v_det text; begin
        get stacked diagnostics v_det = pg_exception_detail;
        n := coalesce(nullif(v_det,'')::int, 0);
      end;
    when others then reset role; n := 0;
  end;
  return query select 'escrita'::text,
    'organizador NÃO apaga as perguntas do proprio formulario'::text,
    '0'::text, n::text, n = 0;

  -- ---------------------------------------------------------------------
  -- LIMPEZA, POR ID
  -- ---------------------------------------------------------------------
  delete from papeis where criado_por = 'testar_permissoes';
  delete from escalacoes where funcao_id = v_fn_t;
  delete from plantoes p using voluntarios v where v.id = p.voluntario_id and v.equipe_id = v_eq_t;
  delete from culto_obs where equipe_id = v_eq_t;
  delete from config where equipe_id = v_eq_t;
  delete from disponibilidade d using voluntarios v where v.id = d.voluntario_id and v.equipe_id = v_eq_t;
  delete from indisponibilidades i using voluntarios v where v.id = i.voluntario_id and v.equipe_id = v_eq_t;
  delete from historico_candidatura where candidatura_id = v_cand_t;
  delete from candidatura_funcoes where candidatura_id = v_cand_t;
  delete from candidaturas where id = v_cand_t;
  delete from habilidades where voluntario_id = v_vol_t;
  delete from voluntarios where equipe_id = v_eq_t;
  delete from culto_obs where culto_id = v_ev_t;
  delete from cultos where id = v_ev_t;
  delete from onboarding_feito where etapa_id = v_onb_t;
  delete from onboarding_etapas where id = v_onb_t;
  delete from candidatura_respostas where pergunta_id = v_perg_t;
  delete from perguntas where id = v_perg_t;
  /* 79 · C7 e C8 criam coisa FORA do cenário, e a limpeza não levava.
     C7 tenta inserir `funcoes` no Louvor e C8 tenta inserir em `pessoas`;
     nos dois o esperado é recusa, mas no dia em que a política se abrir —
     que é o que esses casos existem para detectar — as duas linhas ficavam.
     Limpar por nome do sufixo é preciso: o sufixo é sorteado por execução. */
  delete from funcoes where nome like '%' || v_suf and equipe_id <> v_eq_t;
  delete from pessoas where nome like 'Anon ' || v_suf;
  delete from funcoes where equipe_id = v_eq_t;
  delete from equipes where id = v_eq_t;
  delete from pessoas where id = v_p_t;
end $function$;
revoke all on function public.testar_permissoes() from public, anon, authenticated;
grant execute on function public.testar_permissoes() to service_role;

-- =========================================================================
-- 12 · conferência
-- =========================================================================
do $conf$
declare
  falhas text[] := '{}';
  r record; v_n int; v_txt text;
  m jsonb := '{}'::jsonb;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dia date; v_sab date; v_dia2 date; v_passado date; v_quarta date;
  v_eq uuid; v_dir uuid; v_prod uuid;
  v_fl uuid; v_fd uuid; v_fc uuid;
  v_ana uuid; v_bia uuid; v_caio uuid; v_duda uuid;
  t_ana text; t_bia text; t_caio text; t_duda text;
  v_culto uuid; v_j jsonb; v_tok text; v_modelo_antes jsonb; v_mod_fol jsonb;
  /* rodada de novo (a régua já tem a 109), os postos podem ter sido
     renomeados pela tela: a lista exata só é conferida na primeira vez */
  v_primeira boolean := not exists (select 1 from schema_versao where n = 109);
  boa_palavra constant jsonb := '{"quem":"Pr. Teste Cento Nove","tema":"Peniel","leitura":"Gênesis 32:30","frase":"Uma frase","ceia":true}';
begin
  /* 1 · o que cabe em cada bloco, pelas funções */
  m := m || jsonb_build_object('palavra_boa', cron_palavra_valida(boa_palavra));
  m := m || jsonb_build_object('avisos_vazio', cron_avisos_validos('[]'));
  m := m || jsonb_build_object('linha_modelo', (select bool_and(cron_linha_valida(linha)) from cronograma_modelos));
  for r in select * from (values
      ('palavra', 'palavra_lista',     '["x"]'),
      ('palavra', 'palavra_chave',     '{"autor":"x"}'),
      ('palavra', 'palavra_vazia',     '{"tema":""}'),
      ('palavra', 'palavra_espaco',    '{"tema":" x"}'),
      ('palavra', 'palavra_quebra',    '{"tema":"a\nb"}'),
      ('palavra', 'palavra_ceia_txt',  '{"ceia":"sim"}'),
      ('palavra', 'palavra_numero',    '{"tema":1}'),
      ('avisos',  'avisos_objeto',     '{"texto":"x"}'),
      ('avisos',  'avisos_sem_texto',  '[{"como":"falado"}]'),
      ('avisos',  'avisos_como',       '[{"texto":"x","como":"cantado"}]'),
      ('avisos',  'avisos_chave',      '[{"texto":"x","url":"y"}]'),
      ('louvor',  'louvor_chave',      '{"final":"x","tom":"G"}'),
      ('louvor',  'louvor_lista',      '[{"final":"x"}]'),
      ('linha',   'linha_vazia',       '[]'),
      ('linha',   'linha_hora',        '[{"h":"24:00","o":"x"}]'),
      ('linha',   'linha_hora_curta',  '[{"h":"9:00","o":"x"}]'),
      ('linha',   'linha_sem_o',       '[{"h":"09:00"}]'),
      ('linha',   'linha_chave',       '[{"h":"09:00","o":"x","cor":"red"}]'),
      ('linha',   'linha_q_vazio',     '[{"h":"09:00","o":"x","q":""}]')
    ) as x(bloco, caso, j)
  loop
    if cron_bloco_valido(r.bloco, r.j::jsonb) then falhas := falhas || format('%s aceitou %s', r.bloco, r.caso); end if;
  end loop;
  if cron_palavra_valida(jsonb_build_object('tema', repeat('a', 121))) then
    falhas := falhas || 'palavra aceitou tema com 121 letras'::text; end if;
  if not cron_palavra_valida(jsonb_build_object('tema', repeat('a', 120))) then
    falhas := falhas || 'palavra recusou tema com 120 letras'::text; end if;
  if cron_avisos_validos((select jsonb_agg(jsonb_build_object('texto', 'a' || g)) from generate_series(1, 13) g)) then
    falhas := falhas || 'avisos aceitou 13'::text; end if;
  if cron_linha_valida((select jsonb_agg(jsonb_build_object('h', '09:00', 'o', 'a' || g)) from generate_series(1, 31) g)) then
    falhas := falhas || 'linha aceitou 31'::text; end if;
  /* a normalização: apara, junta espaços, tira vazio, tira Ceia "não", ordena */
  m := m || jsonb_build_object('norm_palavra',
         cron_normalizar('palavra', '{"tema":"  Peniel   hoje\n Deus ","leitura":"","ceia":false,"quem":null}')::text);
  m := m || jsonb_build_object('norm_avisos',
         cron_normalizar('avisos', '[{"texto":"  Batismo "},{"texto":"   "},{"texto":"Ceia","como":"video"}]')::text);
  m := m || jsonb_build_object('norm_linha',
         cron_normalizar('linha', '[{"h":"10:00","o":"Louvor"},{"h":"09:00","o":" Chegada ","q":""},{"h":"09:30","o":""}]')::text);
  m := m || jsonb_build_object('norm_linha_nada', coalesce(cron_normalizar('linha', '[{"h":"09:00","o":" "}]')::text, 'nulo'));

  /* 2 · estrutura: tabelas fechadas, portas certas, nada sobrando */
  if not (select relrowsecurity from pg_class where oid = 'public.cronogramas'::regclass) then
    falhas := falhas || 'cronogramas sem RLS'::text; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.cronograma_modelos'::regclass) then
    falhas := falhas || 'cronograma_modelos sem RLS'::text; end if;
  if has_table_privilege('anon', 'public.cronogramas', 'select')
     or has_table_privilege('authenticated', 'public.cronogramas', 'select')
     or has_table_privilege('authenticated', 'public.cronogramas', 'update') then
    falhas := falhas || 'cronogramas legivel ou gravavel direto'::text; end if;
  if has_table_privilege('authenticated', 'public.cronograma_modelos', 'update') then
    falhas := falhas || 'cronograma_modelos gravavel direto'::text; end if;
  for r in select * from (values
      ('public.cronograma_do_dia(date)'), ('public.cronogramas_das_datas(date[])'),
      ('public.cronogramas_registrados(date,integer)'), ('public.cronograma_salvar(date,text,jsonb,jsonb,boolean)'),
      ('public.cronograma_link(date)')) as x(f)
  loop
    if has_function_privilege('anon', r.f, 'execute') then falhas := falhas || format('%s alcancavel por anon', r.f); end if;
    if not has_function_privilege('authenticated', r.f, 'execute') then falhas := falhas || format('%s sem grant para quem lidera', r.f); end if;
  end loop;
  for r in select * from (values
      ('public.cronograma_dados(uuid,date,boolean)'), ('public.cronograma_gravar(uuid,text,jsonb,jsonb,text,text,boolean)'),
      ('public.cron_culto_da_data(date)'), ('public.cron_dirige(uuid,uuid)'), ('public.cron_quem_grava()'),
      ('public.cron_normalizar(text,jsonb)')) as x(f)
  loop
    if has_function_privilege('anon', r.f, 'execute') or has_function_privilege('authenticated', r.f, 'execute') then
      falhas := falhas || format('%s alcancavel de fora (e de uso interno)', r.f); end if;
  end loop;
  for r in select * from (values
      ('public.cronograma_publico(text)'), ('public.eu_cronogramas(text)'),
      ('public.eu_cronograma_salvar(text,date,text,jsonb,jsonb)'), ('public.areas_do_espaco()')) as x(f)
  loop
    if not has_function_privilege('anon', r.f, 'execute') then falhas := falhas || format('%s sem grant para anon', r.f); end if;
    if not (select prosecdef from pg_proc where oid = r.f::regprocedure) then falhas := falhas || format('%s nao e definer', r.f); end if;
  end loop;
  if to_regprocedure('public.testar_porta_publica()') is not null then
    select count(*), string_agg(t.caso || ' (' || t.obtido || ')', '; ') into v_n, v_txt
      from public.testar_porta_publica() t where not t.passou;
    if v_n > 0 then falhas := falhas || format('porta publica reprovou: %s', v_txt); end if;
  end if;

  /* 3 · as áreas novas e o site */
  select id into v_prod from equipes where slug = 'producao';
  select id into v_dir from equipes where slug = 'dirigentes';
  m := m || jsonb_build_object('producao', (select string_agg(f.nome || ':' || array_to_string(f.tipos, '+')
                                                              || coalesce(':' || f.cronograma, ''), ',' order by f.ordem)
                                              from funcoes f where f.equipe_id = v_prod));
  m := m || jsonb_build_object('dirigentes', (select string_agg(f.nome || ':' || coalesce(f.cronograma, '-'), ',')
                                                from funcoes f where f.equipe_id = v_dir));
  m := m || jsonb_build_object('fora_do_site', (select count(*) from ministerios_publicos() x
                                                  where x.slug in ('producao', 'dirigentes')));
  m := m || jsonb_build_object('no_espaco', (select count(*) from areas_do_espaco() x
                                               where x.slug in ('producao', 'dirigentes')));
  m := m || jsonb_build_object('publicas', (select bool_and(e.publica) from equipes e
                                              where e.slug not in ('producao', 'dirigentes')));

  /* 4 · o caminho inteiro, num cenário de teste (desfeito no fim) */
  begin
    v_dia := v_hoje + 8;
    while extract(dow from v_dia) <> 0 loop v_dia := v_dia + 1; end loop;
    v_dia2 := v_dia + 7;
    v_sab := v_dia + 6;
    v_quarta := v_dia + 3;
    v_passado := v_hoje - 1;
    while extract(dow from v_passado) <> 0 loop v_passado := v_passado - 1; end loop;

    insert into equipes (nome, slug, ordem) values ('CONF109 Louvor', 'conf109-louvor', 995) returning id into v_eq;
    insert into lideres (email, equipe_id) values ('conf109-louvor@exemplo.invalid', v_eq);
    insert into lideres (email, equipe_id) values ('conf109-geral@exemplo.invalid', null);
    insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos, cronograma)
         values (v_eq, 'CONF109 DIRIGE', 1, true, true, array['domingo','follow'], 'lider') returning id into v_fl;
    select id into v_fd from funcoes where equipe_id = v_dir and cronograma = 'dirigente';
    select id into v_fc from funcoes where equipe_id = v_prod and cronograma = 'direcao';
    insert into voluntarios (equipe_id, nome, telefone, ativo) values (v_dir, 'Ana Conf Cento Nove',  '21900109001', true) returning id, token into v_ana, t_ana;
    insert into voluntarios (equipe_id, nome, telefone, ativo) values (v_eq,  'Bia Conf Cento Nove',  '21900109002', true) returning id, token into v_bia, t_bia;
    insert into voluntarios (equipe_id, nome, telefone, ativo) values (v_dir, 'Caio Conf Cento Nove', '21900109003', true) returning id, token into v_caio, t_caio;
    insert into voluntarios (equipe_id, nome, telefone, ativo) values (v_dir, 'Duda Conf Cento Nove', '21900109004', false) returning id, token into v_duda, t_duda;

    /* sem culto no banco ainda: a folha vem do modelo, e ninguém no comando */
    delete from cronogramas where culto_id in (select id from cultos where data in (v_dia, v_dia2, v_sab) and evento is null);
    v_modelo_antes := (select linha from cronograma_modelos where tipo = 'domingo');
    v_mod_fol := (select linha from cronograma_modelos where tipo = 'follow');
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf109-louvor@exemplo.invalid","role":"authenticated"}', true);
    v_j := cronograma_do_dia(v_dia);
    m := m || jsonb_build_object('le', v_j ->> 'ok');
    m := m || jsonb_build_object('le_modelo', ((v_j -> 'linha') = v_modelo_antes)::text || ':' || (v_j ->> 'linha_propria'));
    m := m || jsonb_build_object('le_comando', (select string_agg(x ->> 'papel', ',') from jsonb_array_elements(v_j -> 'comando') x
                                                 where x ->> 'papel' in ('direcao', 'dirigente')));
    m := m || jsonb_build_object('le_token', coalesce(v_j ->> 'token', 'sem'));
    m := m || jsonb_build_object('quarta', cronograma_do_dia(v_quarta) ->> 'erro');

    /* grava a Palavra: o culto nasce, o texto chega aparado, a autoria fica */
    v_j := cronograma_salvar(v_dia, 'palavra', '{"quem":" Pr. Teste ","tema":"Peniel","ceia":false}', null);
    m := m || jsonb_build_object('grava', v_j ->> 'ok');
    m := m || jsonb_build_object('grava_limpa', (v_j -> 'valor')::text);
    m := m || jsonb_build_object('grava_por', v_j -> 'autoria' ->> 'por');
    reset role;
    select id into v_culto from cultos where data = v_dia and evento is null;
    m := m || jsonb_build_object('culto_nasceu', v_culto is not null);
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"email":"conf109-louvor@exemplo.invalid","role":"authenticated"}', true);
    /* a tela que leu antes tenta gravar por cima: MUDOU, com o que está lá */
    v_j := cronograma_salvar(v_dia, 'palavra', '{"tema":"Outro"}', null);
    m := m || jsonb_build_object('mudou', v_j ->> 'erro');
    m := m || jsonb_build_object('mudou_traz', v_j -> 'atual' ->> 'tema');
    v_j := cronograma_salvar(v_dia, 'palavra', boa_palavra, '{"quem":"Pr. Teste","tema":"Peniel"}');
    m := m || jsonb_build_object('regrava', v_j ->> 'ok');
    /* valor errado não grava e não apaga o que está lá */
    v_j := cronograma_salvar(v_dia, 'palavra', '{"autor":"x"}', boa_palavra);
    m := m || jsonb_build_object('ruim', v_j ->> 'erro');
    v_j := cronograma_salvar(v_dia, 'avisos', '[{"texto":"x","como":"cantado"}]', null);
    m := m || jsonb_build_object('ruim_aviso', v_j ->> 'erro');
    v_j := cronograma_salvar(v_dia, 'credito', '{}', null);
    m := m || jsonb_build_object('bloco_ruim', v_j ->> 'erro');
    v_j := cronograma_salvar(v_quarta, 'louvor', '{"final":"x"}', null);
    m := m || jsonb_build_object('quarta_grava', v_j ->> 'erro');
    v_j := cronograma_salvar(v_passado, 'louvor', '{"final":"x"}', null);
    m := m || jsonb_build_object('passado_lider', v_j ->> 'erro');
    /* avisos: lista vazia é "sem avisos", e fica */
    v_j := cronograma_salvar(v_dia, 'avisos', '[]', null);
    m := m || jsonb_build_object('sem_avisos', (v_j -> 'valor')::text);
    v_j := cronograma_salvar(v_dia, 'louvor', '{"final":"  Bondade de Deus "}', null);
    m := m || jsonb_build_object('final', v_j -> 'valor' ->> 'final');

    /* os horários: deste culto só, ou para os próximos (o modelo) */
    v_j := cronograma_salvar(v_dia, 'linha', '[{"h":"09:30","o":"Chegada"},{"h":"10:00","o":"Louvor","q":"Louvor"}]', v_modelo_antes);
    m := m || jsonb_build_object('linha_propria', (v_j ->> 'linha_propria') || ':' || jsonb_array_length(v_j -> 'valor'));
    reset role;
    m := m || jsonb_build_object('modelo_intacto', (select linha from cronograma_modelos where tipo = 'domingo') = v_modelo_antes);
    set local role authenticated;
    m := m || jsonb_build_object('outro_domingo_modelo', (cronograma_do_dia(v_dia2) -> 'linha') = v_modelo_antes);
    v_j := cronograma_salvar(v_dia2, 'linha', '[{"h":"08:45","o":"Chegada nova"}]', v_modelo_antes, true);
    m := m || jsonb_build_object('modelo_grava', (v_j ->> 'ok') || ':' || coalesce(v_j ->> 'linha_propria', '-'));
    reset role;
    m := m || jsonb_build_object('modelo_novo', (select linha -> 0 ->> 'o' from cronograma_modelos where tipo = 'domingo'));
    set local role authenticated;
    m := m || jsonb_build_object('proprio_fica', cronograma_do_dia(v_dia) -> 'linha' -> 0 ->> 'o');
    m := m || jsonb_build_object('sabado_nao_muda', (cronograma_do_dia(v_sab) -> 'linha') = v_mod_fol);
    /* voltar ao modelo: lista vazia */
    v_j := cronograma_salvar(v_dia, 'linha', '[]', '[{"h":"09:30","o":"Chegada"},{"h":"10:00","o":"Louvor","q":"Louvor"}]');
    m := m || jsonb_build_object('volta_modelo', (v_j ->> 'linha_propria') || ':' || (v_j -> 'valor' -> 0 ->> 'o'));

    /* o link da folha: o mesmo token sempre */
    v_tok := cronograma_link(v_dia) ->> 'token';
    m := m || jsonb_build_object('token', v_tok ~ '^[0-9a-f]{18}$' and (cronograma_link(v_dia) ->> 'token') = v_tok);

    /* o líder geral corrige o passado */
    perform set_config('request.jwt.claims', '{"email":"conf109-geral@exemplo.invalid","role":"authenticated"}', true);
    v_j := cronograma_salvar(v_passado, 'louvor', '{"final":"Correção"}', (cronograma_do_dia(v_passado) -> 'louvor'));
    m := m || jsonb_build_object('passado_geral', v_j ->> 'ok');
    m := m || jsonb_build_object('historico', (select count(*) from jsonb_array_elements(cronogramas_registrados(v_hoje, 50) -> 'cultos') x
                                                 where (x ->> 'data')::date = v_passado));
    /* quem não lidera nada não lê nem grava */
    perform set_config('request.jwt.claims', '{"email":"ninguem-109@exemplo.invalid","role":"authenticated"}', true);
    m := m || jsonb_build_object('estranho_le', cronograma_do_dia(v_dia) ->> 'erro');
    m := m || jsonb_build_object('estranho_grava', cronograma_salvar(v_dia, 'louvor', '{"final":"x"}', null) ->> 'erro');
    m := m || jsonb_build_object('estranho_lista', cronogramas_das_datas(array[v_dia]) ->> 'erro');
    reset role;

    /* 5 · No comando sai da escala (o posto de dirigente do domingo de
       teste fica livre para a Ana, mesmo que já tenha alguém de verdade) */
    delete from escalacoes where culto_id = v_culto and funcao_id = v_fd;
    insert into escalacoes (culto_id, funcao_id, voluntario_id, status) values
      (v_culto, v_fd, v_ana, 'pendente'), (v_culto, v_fl, v_bia, 'confirmado');
    insert into culto_obs (culto_id, equipe_id, ordem) values
      (v_culto, v_eq, '[{"t":"musica","titulo":"Leão","tom":"E","bpm":67,"quem":"Bia"},{"t":"momento","titulo":"Oração"},{"t":"musica","titulo":"Ousado Amor"}]');
    insert into config (equipe_id, dados) values (v_eq, '{"repertorio": true}') on conflict do nothing;
    update config set dados = coalesce(dados, '{}'::jsonb) || '{"repertorio": true}' where equipe_id = v_eq;
    v_j := cronograma_dados(v_culto, null, false);
    m := m || jsonb_build_object('comando', (select string_agg(coalesce(x ->> 'nome', '-') || ':' || coalesce(x ->> 'status', '-'), ',')
                                               from jsonb_array_elements(v_j -> 'comando') x
                                              where x ->> 'papel' = 'dirigente' or x ->> 'equipe_id' = v_eq::text));
    m := m || jsonb_build_object('musicas', (select string_agg(x ->> 'titulo', ',') from jsonb_array_elements(v_j -> 'musicas') x
                                               where x ->> 'equipe' = 'CONF109 Louvor'));
    update escalacoes set status = 'recusado' where culto_id = v_culto and funcao_id = v_fl;
    m := m || jsonb_build_object('recusou_sai', (select count(*) from jsonb_array_elements(cronograma_dados(v_culto, null, false) -> 'comando') x
                                                   where x ->> 'equipe_id' = v_eq::text and x ->> 'nome' is not null));
    update config set dados = dados || '{"repertorio": false}' where equipe_id = v_eq;
    m := m || jsonb_build_object('sem_repertorio', (select count(*) from jsonb_array_elements(cronograma_dados(v_culto, null, false) -> 'musicas') x
                                                      where x ->> 'equipe' = 'CONF109 Louvor'));

    /* 6 · o dirigente, pelo link dele */
    set local role anon;
    m := m || jsonb_build_object('eu_lista', (select string_agg(x ->> 'data', ',') from jsonb_array_elements(eu_cronogramas(t_ana) -> 'cultos') x));
    v_j := eu_cronograma_salvar(t_ana, v_dia, 'avisos', '[{"texto":" Batismo dia 20 ","como":"falado"}]', '[]');
    m := m || jsonb_build_object('eu_avisos', (v_j ->> 'ok') || ':' || (v_j -> 'autoria' ->> 'por') || ':' || (v_j -> 'autoria' ->> 'via'));
    v_j := eu_cronograma_salvar(t_ana, v_dia, 'louvor', '{"final":"x"}', null);
    m := m || jsonb_build_object('eu_louvor', v_j ->> 'erro');
    v_j := eu_cronograma_salvar(t_caio, v_dia, 'palavra', '{"tema":"x"}', boa_palavra);
    m := m || jsonb_build_object('eu_outro', v_j ->> 'erro');
    v_j := eu_cronograma_salvar(t_bia, v_dia, 'palavra', '{"tema":"x"}', boa_palavra);
    m := m || jsonb_build_object('eu_outra_area', v_j ->> 'erro');
    v_j := eu_cronograma_salvar(t_ana, v_quarta, 'palavra', '{"tema":"x"}', null);
    m := m || jsonb_build_object('eu_quarta', v_j ->> 'erro');
    begin
      perform eu_cronogramas(t_duda);
      m := m || jsonb_build_object('eu_inativa', 'viu');
    exception when others then m := m || jsonb_build_object('eu_inativa', sqlerrm);
    end;
    begin
      perform eu_cronograma_salvar('nao-existe-' || md5(random()::text), v_dia, 'palavra', '{}', null);
      m := m || jsonb_build_object('eu_falso', 'gravou');
    exception when others then m := m || jsonb_build_object('eu_falso', sqlerrm);
    end;
    /* a folha pública: tem a Palavra, não tem o token, recusa o link errado */
    v_j := cronograma_publico(v_tok);
    m := m || jsonb_build_object('publico', (v_j ->> 'ok') || ':' || (v_j -> 'palavra' ->> 'tema') || ':' || coalesce(v_j ->> 'token', 'sem'));
    m := m || jsonb_build_object('publico_falso', cronograma_publico('0123456789abcdef01') ->> 'erro');
    m := m || jsonb_build_object('publico_lixo', cronograma_publico('x'' or 1=1') ->> 'erro');
    reset role;
    /* quem disse que não pode deixa de dirigir */
    update escalacoes set status = 'recusado' where culto_id = v_culto and funcao_id = v_fd;
    set local role anon;
    v_j := eu_cronograma_salvar(t_ana, v_dia, 'palavra', '{"tema":"x"}', boa_palavra);
    m := m || jsonb_build_object('eu_recusou', v_j ->> 'erro');
    m := m || jsonb_build_object('eu_recusou_lista', jsonb_array_length(eu_cronogramas(t_ana) -> 'cultos'));
    reset role;

    /* 7 · o CHECK segura quem escreve direto na tabela */
    begin
      update cronogramas set avisos = '[{"texto":"x","como":"cantado"}]' where culto_id = v_culto;
      m := m || jsonb_build_object('check_direto', 'passou');
    exception when check_violation then m := m || jsonb_build_object('check_direto', 'barrou');
    end;
    /* dois dirigentes na igreja: o índice recusa */
    begin
      insert into funcoes (equipe_id, nome, ordem, ativa, simultanea, tipos, cronograma)
           values (v_eq, 'CONF109 OUTRO DIRIGENTE', 9, true, true, array['domingo'], 'dirigente');
      m := m || jsonb_build_object('dois_dirigentes', 'passou');
    exception when unique_violation then m := m || jsonb_build_object('dois_dirigentes', 'barrou');
    end;

    raise exception 'CONF109_DESFAZ';
  exception when others then
    if sqlerrm <> 'CONF109_DESFAZ' then
      falhas := falhas || ('o cenario nao montou: ' || sqlerrm)::text;
    end if;
  end;
  reset role;

  for r in select * from (values
      ('palavra_boa',          'true'),
      ('avisos_vazio',         'true'),
      ('linha_modelo',         'true'),
      ('norm_palavra',         '{"tema": "Peniel hoje Deus"}'),
      ('norm_avisos',          '[{"texto": "Batismo"}, {"como": "video", "texto": "Ceia"}]'),
      ('norm_linha',           '[{"h": "09:00", "o": "Chegada"}, {"h": "10:00", "o": "Louvor"}]'),
      ('norm_linha_nada',      'nulo'),
      ('producao',             'COORDENADOR DO DIA:domingo+follow:direcao,AUX. PROD. TÉCNICA:domingo+follow,AUX. PROD. CULTO:domingo,AUX. PROD. CULTO (SALÃO):domingo+follow'),
      ('dirigentes',           'DIRIGENTE:dirigente'),
      ('fora_do_site',         '0'),
      ('no_espaco',            '2'),
      ('publicas',             'true'),
      ('le',                   'true'),
      ('le_modelo',            'true:false'),
      ('le_comando',           'direcao,dirigente'),
      ('le_token',             'sem'),
      ('quarta',               'DATA_SEM_CULTO'),
      ('grava',                'true'),
      ('grava_limpa',          '{"quem": "Pr. Teste", "tema": "Peniel"}'),
      ('grava_por',            'conf109-louvor'),
      ('culto_nasceu',         'true'),
      ('mudou',                'MUDOU'),
      ('mudou_traz',           'Peniel'),
      ('regrava',              'true'),
      ('ruim',                 'VALOR_INVALIDO'),
      ('ruim_aviso',           'VALOR_INVALIDO'),
      ('bloco_ruim',           'BLOCO_INVALIDO'),
      ('quarta_grava',         'DATA_SEM_CULTO'),
      ('passado_lider',        'JA_PASSOU'),
      ('sem_avisos',           '[]'),
      ('final',                'Bondade de Deus'),
      ('linha_propria',        'true:2'),
      ('modelo_intacto',       'true'),
      ('outro_domingo_modelo', 'true'),
      ('modelo_grava',         'true:false'),
      ('modelo_novo',          'Chegada nova'),
      ('proprio_fica',         'Chegada'),
      ('sabado_nao_muda',      'true'),
      ('volta_modelo',         'false:Chegada nova'),
      ('token',                'true'),
      ('passado_geral',        'true'),
      ('historico',            '1'),
      ('estranho_le',          'SEM_PERMISSAO'),
      ('estranho_grava',       'SEM_PERMISSAO'),
      ('estranho_lista',       'SEM_PERMISSAO'),
      ('comando',              'Ana Conf:pendente,Bia Conf:confirmado'),
      ('musicas',              'Leão,Ousado Amor'),
      ('recusou_sai',          '0'),
      ('sem_repertorio',       '0'),
      ('eu_lista',             v_dia::text),
      ('eu_avisos',            'true:Ana Conf:dirigente'),
      ('eu_louvor',            'BLOCO_INVALIDO'),
      ('eu_outro',             'SEM_PERMISSAO'),
      ('eu_outra_area',        'SEM_PERMISSAO'),
      ('eu_quarta',            'CULTO_INEXISTENTE'),
      ('eu_inativa',           'Link invalido'),
      ('eu_falso',             'Link invalido'),
      ('publico',              'true:Peniel:sem'),
      ('publico_falso',        'LINK_INVALIDO'),
      ('publico_lixo',         'LINK_INVALIDO'),
      ('eu_recusou',           'SEM_PERMISSAO'),
      ('eu_recusou_lista',     '0'),
      ('check_direto',         'barrou'),
      ('dois_dirigentes',      'barrou')
    ) as x(chave, esperado)
  loop
    if not v_primeira and r.chave in ('producao', 'dirigentes') then continue; end if;
    if (m ->> r.chave) is distinct from r.esperado then
      falhas := falhas || format('%s: obtido %s, esperado %s', r.chave, coalesce(m ->> r.chave, '(nada)'), r.esperado);
    end if;
  end loop;

  if exists (select 1 from equipes where slug like 'conf109-%')
     or exists (select 1 from voluntarios where nome like '% Conf Cento Nove')
     or exists (select 1 from lideres where email like 'conf109%@exemplo.invalid') then
    falhas := falhas || 'o cenario de teste ficou no banco'::text; end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'109 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 109 · conferencia: % medidas, todas como esperado. Cenario desfeito.', (select count(*) from jsonb_object_keys(m));
end $conf$;

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (109, '109 · so quem lidera grava o cronograma', 'cronograma_salvar', 'sou_lider'),
      (109, '109 · o passado so o organizador geral corrige', 'cronograma_salvar', 'JA_PASSOU'),
      (109, '109 · gravar nao apaga a edicao do outro', 'cronograma_gravar', 'MUDOU'),
      (109, '109 · o dirigente so grava Palavra e Avisos', 'eu_cronograma_salvar', '''palavra'', ''avisos'''),
      (109, '109 · o dirigente e quem esta no posto e nao recusou', 'cron_dirige', '''pendente'', ''confirmado'''),
      (109, '109 · area fora do site nao aparece em /servir', 'ministerios_publicos', 'e.publica'),
      (109, '109 · a folha publica nao entrega o token', 'cronograma_dados', 'p_publico')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (109, '109-o-cronograma-do-culto.sql')
  on conflict (n) do nothing;

commit;

/* o que o editor mostra: só números */
select '109' as versao,
       (select count(*) from funcoes f join equipes e on e.id = f.equipe_id
         where e.slug in ('producao', 'dirigentes')) as postos_novos,
       (select count(*) from cronograma_modelos) as modelos,
       (select count(*) from funcoes where cronograma is not null and ativa) as no_comando,
       (select count(*) from testar_porta_publica() where not passou) as porta_reprovada,
       (select count(*) from schema_versao_conferir() where not passou) as sondas_reprovadas;
