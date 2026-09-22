/* =============================================================================
   95 · O ANEXO VEM DE SITE QUE A IGREJA CONHECE
   22/09/2026

   A decisao que ficou aberta desde a 85, e que o Arthur mandou fechar:
   "configuracao restante de dominios de anexos".

   O QUE EXISTIA: anexo e link (a 85 decidiu isso), e qualquer `https://` com
   host de verdade passava. `url_boa` barra IP, localhost, arroba escondido,
   invisivel e autoridade torta, mas nao tem opiniao sobre QUAL site. Um link
   de phishing hospedado num dominio qualquer entrava como "orcamento.pdf". E o
   anexo e o UNICO texto clicavel do sistema: descricao e comentario nao viram
   link na tela.

   O QUE ESTA MIGRACAO POE NO BANCO

   · `demandas.sites_de_anexo`: a lista de sites aceitos. O site vale para os
     subdominios dele (`drive.google.com` aceita `x.drive.google.com`), com a
     fronteira no ponto: `evildrive.google.com` NAO e subdominio.
   · `demandas.regras_gerais`: uma linha so, com `anexo_restrito`. Ligado, so
     passa anexo de site da lista. Desligado, vale o que valia.
   · `demandas.anexo_permitido(url)` e `demandas.regra_de_anexo()`: a regra
     numa funcao so, lida pelas duas portas que gravam anexo (`dem_abrir` e
     `dem_mover('anexar')`) e mostrada por `dem_bases`, para a tela dizer os
     sites aceitos ANTES de a pessoa colar o link.
   · `dem_ajustar('anexos', ...)`: so a administracao liga, desliga, inclui
     e tira site. O endereco colado inteiro vira so o site.

   O DEFEITO QUE A LISTA TERIA HERDADO: A BARRA INVERTIDA

   Medido em 22/09 neste harness e no parser de URL do navegador (o WHATWG,
   que o Chrome e o Safari seguem):

     url                                    url_boa   o navegador vai para
     https://localhost\.example.com/x       true      localhost
     https://127.0.0.1\.example.com/x       true      127.0.0.1
     https://evil.org\.drive.google.com/x   true      evil.org

   Em URL `https`, o navegador trata `\` como `/`: a autoridade acaba ali.
   `url_autoridade` so cortava em `/`, `?` e `#`, entao o banco julgava um host
   e o navegador visitava outro. A guarda de localhost e IP da 89 ja era
   contornavel assim, e a lista de sites seria tambem: `evil.org\.drive...`
   termina em `.drive.google.com` para o banco e e `evil.org` para quem clica.
   O conserto e a regra do navegador: a autoridade acaba na primeira `\`; e
   `\` decodificada (`%5c`) na autoridade reprova, como `/`, `?` e `#` ja
   reprovavam (para o navegador, essa URL nem abre).

   A REGRA NASCE DESLIGADA, E QUEM LIGA E A ADMINISTRACAO. De proposito:
   ligada por padrao, a reaplicacao da cadeia (que `demandas-banco.sh` faz
   duas vezes para provar que reaplicar e seguro) faria as conferencias da 85
   em diante reprovarem, porque elas anexam em `a.example`. Em producao a
   regra e ligada pela tela de Administracao, que e onde ela deve morar: uma
   configuracao que a igreja muda sem migracao.

   A LISTA INICIAL e de onde gente de igreja costuma mandar arquivo, arte,
   video e produto. Fica de fora quem hospeda pagina de QUALQUER pessoa num
   subdominio (`sharepoint.com`, `github.io`, `blogspot.com`...): ali o
   atacante escolhe o nome e escreve a pagina inteira. Esses so entram pelo
   endereco exato (`igreja.github.io`), e a administracao e impedida de
   incluir o site aberto por engano.

   O QUE NAO MUDA: anexo que ja existe continua (a regra vale para anexo
   novo); o texto livre (descricao, comentario) continua aceitando link,
   porque nao e anexo e nao vira link na tela.
   ============================================================================= */
do $tranca$begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(95);
  end if;
end
$tranca$;

begin;

/* -------------------------------------------------------------------------
   1 · AS DUAS TABELAS

   A lista nasce preenchida so quando a tabela nasce: reaplicar esta
   migracao nao devolve um site que a administracao tirou.
   ------------------------------------------------------------------------- */
do $sites$
begin
  if to_regclass('demandas.sites_de_anexo') is null then
    create table demandas.sites_de_anexo (
      site text primary key
        check (site ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
               and length(site) <= 253),
      criado_em timestamptz not null default now(),
      criado_por uuid references demandas.membros(id) on delete set null
    );
    insert into demandas.sites_de_anexo (site) values
      -- arquivos e fotos
      ('drive.google.com'), ('docs.google.com'), ('photos.google.com'), ('photos.app.goo.gl'),
      ('dropbox.com'), ('onedrive.live.com'), ('1drv.ms'), ('icloud.com'),
      ('wetransfer.com'), ('we.tl'),
      -- arte, referencia e video
      ('canva.com'), ('figma.com'), ('pinterest.com'), ('pin.it'),
      ('youtube.com'), ('youtu.be'), ('vimeo.com'), ('instagram.com'), ('tiktok.com'),
      ('spotify.com'),
      -- compras (os encurtadores aqui sao os das proprias lojas)
      ('mercadolivre.com.br'), ('mercadolivre.com'), ('amazon.com.br'), ('a.co'), ('amzn.to'),
      ('magazineluiza.com.br'), ('shopee.com.br'), ('shope.ee'), ('kabum.com.br'),
      ('leroymerlin.com.br'),
      -- da igreja
      ('guiaservir.com');
  end if;
end
$sites$;

create table if not exists demandas.regras_gerais (
  id boolean primary key default true check (id),
  anexo_restrito boolean not null default false,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references demandas.membros(id) on delete set null
);
insert into demandas.regras_gerais (id) values (true) on conflict (id) do nothing;

/* as mesmas duas camadas das outras tabelas do schema: RLS ligado e nenhum
   grant. A unica porta e `dem_ajustar`, que e so da administracao. */
alter table demandas.sites_de_anexo enable row level security;
alter table demandas.regras_gerais enable row level security;
revoke all on demandas.sites_de_anexo from public;
revoke all on demandas.regras_gerais from public;
do $sem_grant$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on demandas.sites_de_anexo, demandas.regras_gerais from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on demandas.sites_de_anexo, demandas.regras_gerais from authenticated';
  end if;
end $sem_grant$;

/* -------------------------------------------------------------------------
   2 · A AUTORIDADE ACABA ONDE O NAVEGADOR ACHA QUE ACABA

   Cirurgia no corpo VIVO, com marca: reaplicar nao repete a troca, e se o
   corpo em producao nao for o esperado, nada e gravado.
   ------------------------------------------------------------------------- */
do $barra$
declare src text; novo text;
begin
  select pg_get_functiondef('demandas.url_autoridade(text)'::regprocedure) into src;
  novo := public.troca_se_faltar(src, $m$'^[^/?#\\]*'$m$,
    $a$'^[^/?#]*')$a$,
    $d$'^[^/?#\\]*')$d$, '95 url_autoridade: a barra invertida acaba a autoridade');
  execute novo;

  select pg_get_functiondef('demandas.url_boa(text)'::regprocedure) into src;
  novo := public.troca_se_faltar(src, $m$!~ '[/?#\\]'$m$,
    $a$and demandas.autoridade_lida(u) !~ '[/?#]'$a$,
    $d$and demandas.autoridade_lida(u) !~ '[/?#\\]'$d$, '95 url_boa: barra invertida decodificada');
  execute novo;
end
$barra$;

/* -------------------------------------------------------------------------
   3 · A REGRA, NUMA FUNCAO SO
   ------------------------------------------------------------------------- */

/* o site do link casa com um da lista, ou e subdominio dele. A fronteira e o
   ponto: `right(host, len+1) = '.' || site`, e nunca `like`, que trataria `_`
   como coringa e nao sabe onde um rotulo comeca. */
create or replace function demandas.anexo_permitido(u text) returns boolean
language sql stable set search_path = demandas, public as $fn$
  select coalesce(
       not coalesce((select g.anexo_restrito from demandas.regras_gerais g where g.id), false)
    or exists (select 1 from demandas.sites_de_anexo x
                where x.site = demandas.url_host(u)
                   or right(demandas.url_host(u), length(x.site) + 1) = '.' || x.site), false)
$fn$;

create or replace function demandas.regra_de_anexo() returns jsonb
language sql stable set search_path = demandas, public as $fn$
  select jsonb_build_object(
    'restrito', coalesce((select g.anexo_restrito from demandas.regras_gerais g where g.id), false),
    'sites', coalesce((select jsonb_agg(x.site order by x.site) from demandas.sites_de_anexo x), '[]'::jsonb))
$fn$;

/* O que a administracao cola vira site: sem esquema, sem caminho, sem porta,
   sem `www.`. Nulo quando nao sobra um site de verdade: sem ponto, com
   caractere estranho, IP, ou so a parte publica de um dominio (`com.br`),
   que aceitaria o pais inteiro. */
create or replace function demandas.site_do_texto(t text) returns text
language sql immutable set search_path = demandas, public as $fn$
  with s as (
    select rtrim(pg_catalog.regexp_replace(pg_catalog.regexp_replace(pg_catalog.regexp_replace(
             lower(btrim(coalesce(t, ''))), '^[a-z][a-z0-9+.-]*://', ''), '[/?#:\\].*$', ''),
             '^www\.', ''), '.') as v)
  select case
    when v !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' then null
    when length(v) > 253 then null
    when v ~ '\.[0-9]+$' then null
    when v ~ '^(com|net|org|gov|edu|art|blog|app|eco|ind|inf|nom|srv|tv|mil|jus|leg|mp|adv|med|eng|arq|co|ac|or|ne|go)\.[a-z]{2}$' then null
    else v end
  from s
$fn$;

/* Onde qualquer pessoa ganha um subdominio e escreve a pagina inteira. Incluir
   o site aberto aceitaria o phishing de qualquer um; o endereco exato
   (`igreja.github.io`) continua podendo entrar. */
create or replace function demandas.site_aberto(s text) returns boolean
language sql immutable set search_path = demandas, public as $fn$
  select coalesce(s, '') in (
    'sharepoint.com', 'github.io', 'gitlab.io', 'vercel.app', 'netlify.app', 'pages.dev',
    'workers.dev', 'web.app', 'firebaseapp.com', 'appspot.com', 'herokuapp.com',
    'blogspot.com', 'wordpress.com', 'wixsite.com', 'weebly.com', 'godaddysites.com',
    'azurewebsites.net', 'cloudfront.net', 'amazonaws.com', 'googleusercontent.com',
    'sites.google.com', 'canva.site', 'my.canva.site', 'figma.site', 'webflow.io',
    'framer.app', 'framer.website', 'glitch.me', 'repl.co', 'ngrok.io', 'ngrok-free.app',
    'carrd.co', 'notion.site', 'surge.sh', 'r2.dev', 'b-cdn.net')
$fn$;

revoke all on function demandas.anexo_permitido(text) from public;
revoke all on function demandas.regra_de_anexo() from public;
revoke all on function demandas.site_do_texto(text) from public;
revoke all on function demandas.site_aberto(text) from public;
/* e dos dois papeis da API pelo nome: um privilegio padrao do schema daria
   EXECUTE a eles por fora do `public` */
do $sem_execute$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function demandas.anexo_permitido(text), demandas.regra_de_anexo(),
             demandas.site_do_texto(text), demandas.site_aberto(text) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function demandas.anexo_permitido(text), demandas.regra_de_anexo(),
             demandas.site_do_texto(text), demandas.site_aberto(text) from authenticated';
  end if;
end $sem_execute$;

/* -------------------------------------------------------------------------
   4 · AS PORTAS, POR CIRURGIA
   ------------------------------------------------------------------------- */
do $cirurgia$
declare src text; novo text;
begin
  -- ===================== dem_abrir: os anexos da abertura =====================
  select pg_get_functiondef('public.dem_abrir(text,jsonb)'::regprocedure) into src;
  novo := public.troca_se_faltar(src, 'SITE_NAO_PERMITIDO',
$a$    if v_maus > 0 then return jsonb_build_object('ok', false, 'erro', 'URL_INVALIDA'); end if;
$a$,
$d$    if v_maus > 0 then return jsonb_build_object('ok', false, 'erro', 'URL_INVALIDA'); end if;
    /* 95 · o site precisa estar na lista, quando a lista esta ligada. Julgado
       antes de a demanda nascer, pelo mesmo motivo do bloco de cima, e a
       recusa diz QUAL site, para a tela nao deixar a pessoa adivinhando. */
    if exists (select 1 from jsonb_array_elements(p_d->'anexos') a
                where demandas.limpo(a->>'url') is not null
                  and not demandas.anexo_permitido(demandas.limpo(a->>'url'))) then
      return jsonb_build_object('ok', false, 'erro', 'SITE_NAO_PERMITIDO',
        'site', (select demandas.url_host(demandas.limpo(a->>'url'))
                   from jsonb_array_elements(p_d->'anexos') a
                  where demandas.limpo(a->>'url') is not null
                    and not demandas.anexo_permitido(demandas.limpo(a->>'url')) limit 1));
    end if;
$d$, '95 dem_abrir: site do anexo');
  execute novo;

  -- ===================== dem_mover: anexar =====================
  select pg_get_functiondef('public.dem_mover(text,integer,text,jsonb)'::regprocedure) into src;
  novo := public.troca_se_faltar(src, 'SITE_NAO_PERMITIDO',
$a$      return jsonb_build_object('ok', false, 'erro', 'URL_INVALIDA'); end if;
    select count(*) into v_n from demandas.anexos$a$,
$d$      return jsonb_build_object('ok', false, 'erro', 'URL_INVALIDA'); end if;
    /* 95 · a lista de sites, quando ligada */
    if not demandas.anexo_permitido(v_url) then
      return jsonb_build_object('ok', false, 'erro', 'SITE_NAO_PERMITIDO',
                                'site', demandas.url_host(v_url)); end if;
    select count(*) into v_n from demandas.anexos$d$, '95 dem_mover: site do anexo');
  execute novo;

  -- ===================== dem_bases: a tela sabe a regra antes =====================
  select pg_get_functiondef('public.dem_bases(text)'::regprocedure) into src;
  novo := public.troca_se_faltar(src, 'regra_de_anexo()',
$a$      from demandas.categorias c where c.ativa), '[]'::jsonb));$a$,
$d$      from demandas.categorias c where c.ativa), '[]'::jsonb),
    /* 95 · os sites aceitos para anexo, para a tela dizer antes de a pessoa
       colar o link, e nao depois de recusar. Nao e dado de ninguem. */
    'anexos', demandas.regra_de_anexo());$d$, '95 dem_bases: regra de anexo');
  execute novo;

  -- ===================== dem_ajustar: so a administracao =====================
  /* O SO_ADMIN do topo de `dem_ajustar` ja vale para este ramo. Tudo e
     validado ANTES de gravar: um pedido com "ligar" e um site invalido nao
     pode ligar a lista e depois recusar. */
  select pg_get_functiondef('public.dem_ajustar(text,text,jsonb)'::regprocedure) into src;
  novo := public.troca_se_faltar(src, $m$p_o_que = 'anexos'$m$,
$a$  else
    return jsonb_build_object('ok', false, 'erro', 'ALVO_DESCONHECIDO');$a$,
$d$  elsif p_o_que = 'anexos' then
    /* 95 · ligar e desligar a lista, incluir e tirar site */
    if (p_d ? 'restrito') and coalesce(p_d->>'restrito', '') not in ('true', 'false') then
      return jsonb_build_object('ok', false, 'erro', 'SIM_OU_NAO', 'campo', 'restrito'); end if;
    if p_d ? 'incluir' then
      v_ch := demandas.site_do_texto(p_d->>'incluir');
      if v_ch is null then
        return jsonb_build_object('ok', false, 'erro', 'SITE_INVALIDO', 'campo', 'incluir'); end if;
      if demandas.site_aberto(v_ch) then
        return jsonb_build_object('ok', false, 'erro', 'SITE_ABERTO', 'campo', 'incluir', 'site', v_ch); end if;
    end if;
    if (p_d ? 'tirar') and not exists (select 1 from demandas.sites_de_anexo
                                        where site = coalesce(demandas.site_do_texto(p_d->>'tirar'), '')) then
      return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;

    if p_d ? 'restrito' then
      update demandas.regras_gerais
         set anexo_restrito = (p_d->>'restrito')::boolean, atualizado_em = now(), atualizado_por = m.id
       where id;
    end if;
    if p_d ? 'incluir' then
      insert into demandas.sites_de_anexo (site, criado_por) values (v_ch, m.id)
        on conflict (site) do nothing;
    end if;
    if p_d ? 'tirar' then
      delete from demandas.sites_de_anexo where site = demandas.site_do_texto(p_d->>'tirar');
    end if;
    return jsonb_build_object('ok', true) || demandas.regra_de_anexo();

  else
    return jsonb_build_object('ok', false, 'erro', 'ALVO_DESCONHECIDO');$d$, '95 dem_ajustar: anexos');
  execute novo;
end
$cirurgia$;

/* -------------------------------------------------------------------------
   5 · A CONFERENCIA

   Liga a lista dentro da transacao, testa as duas portas, a barra invertida
   e a administracao, e devolve o interruptor como achou. Tudo que cria tem o
   prefixo CONF95.
   ------------------------------------------------------------------------- */
do $conf$
declare
  falhas text[] := '{}';
  v_restrito boolean; v_r jsonb; n1 int; v_antes int; v_dep int; v_n int;
  s_pede uuid; s_at uuid; c_a uuid; v_prazo text;
begin
  perform set_config('demandas.membro', '', true);
  perform set_config('teste.jwt', '', true);
  perform set_config('request.jwt.claim', '', true);
  perform set_config('request.jwt.claims', '', true);
  v_prazo := to_char(demandas.hoje() + 10, 'YYYY-MM-DD');
  select anexo_restrito into v_restrito from demandas.regras_gerais where id;

  insert into demandas.setores (nome, slug, atende) values ('CONF95 Pede', 'conf95-pede', false) returning id into s_pede;
  insert into demandas.setores (nome, slug, atende) values ('CONF95 Atende', 'conf95-atende', true) returning id into s_at;
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, prazo_padrao_dias)
    values ('CONF95 grupo', 'CONF95 arte', s_at, false, 5) returning id into c_a;
  insert into demandas.membros (nome, papel, setor_id, token) values
    ('CONF95 Admin', 'admin', s_pede, 'CONF95ADM'),
    ('CONF95 Pede', 'solicitante', s_pede, 'CONF95SOL'),
    ('CONF95 Equipe', 'responsavel', s_at, 'CONF95RESP');

  v_r := public.dem_abrir('CONF95SOL', jsonb_build_object('titulo', 'CONF95 demanda',
           'descricao', 'x', 'categoria_id', c_a, 'prazo', v_prazo));
  n1 := (v_r->>'numero')::int;
  if n1 is null then falhas := falhas || ('0: a demanda de teste nao nasceu: ' || v_r::text); end if;

  /* ---- 1 · desligada, vale o que valia ---- */
  update demandas.regras_gerais set anexo_restrito = false where id;
  if (public.dem_mover('CONF95SOL', n1, 'anexar', '{"url":"https://a.example/livre.pdf","nome":"x"}')->>'ok') is distinct from 'true' then
    falhas := falhas || '1: com a lista desligada, um anexo comum foi recusado'::text; end if;

  /* ---- 2 · ligada: so site da lista ---- */
  update demandas.regras_gerais set anexo_restrito = true where id;
  delete from demandas.sites_de_anexo where site like 'conf95%';
  v_r := public.dem_mover('CONF95SOL', n1, 'anexar', '{"url":"https://conf95.example.org/golpe.pdf","nome":"x"}');
  if (v_r->>'erro') is distinct from 'SITE_NAO_PERMITIDO' or (v_r->>'site') is distinct from 'conf95.example.org' then
    falhas := falhas || ('2: site fora da lista passou, ou a recusa nao disse qual: ' || v_r::text); end if;
  if (public.dem_mover('CONF95SOL', n1, 'anexar', '{"url":"https://drive.google.com/file/d/CONF95/view","nome":"x"}')->>'ok') is distinct from 'true' then
    falhas := falhas || '2: site da lista foi recusado'::text; end if;
  if (public.dem_mover('CONF95SOL', n1, 'anexar', '{"url":"https://DRIVE.Google.com./file/d/CONF95b/view","nome":"x"}')->>'ok') is distinct from 'true' then
    falhas := falhas || '2: o mesmo site em maiusculas e com ponto no fim foi recusado'::text; end if;

  /* ---- 3 · a fronteira do subdominio e o ponto ---- */
  if (public.dem_mover('CONF95SOL', n1, 'anexar', '{"url":"https://abc.drive.google.com/conf95","nome":"x"}')->>'ok') is distinct from 'true' then
    falhas := falhas || '3: subdominio de site da lista foi recusado'::text; end if;
  if (public.dem_mover('CONF95SOL', n1, 'anexar', '{"url":"https://evildrive.google.com/conf95","nome":"x"}')->>'erro') is distinct from 'SITE_NAO_PERMITIDO' then
    falhas := falhas || '3: site que so TERMINA com o nome de um da lista passou (evildrive.google.com)'::text; end if;
  if (public.dem_mover('CONF95SOL', n1, 'anexar', '{"url":"https://drive.google.com.conf95.example.org/x","nome":"x"}')->>'erro') is distinct from 'SITE_NAO_PERMITIDO' then
    falhas := falhas || '3: site que so COMECA com um da lista passou'::text; end if;

  /* ---- 4 · a barra invertida: o banco julga o host que o navegador visita ---- */
  update demandas.regras_gerais set anexo_restrito = false where id;
  if (public.dem_mover('CONF95SOL', n1, 'anexar', E'{"url":"https://localhost\\\\.conf95.example.org/x","nome":"x"}')->>'erro') is distinct from 'URL_INVALIDA'
     or (public.dem_mover('CONF95SOL', n1, 'anexar', E'{"url":"https://127.0.0.1\\\\.conf95.example.org/x","nome":"x"}')->>'erro') is distinct from 'URL_INVALIDA' then
    falhas := falhas || '4: localhost ou IP passou escondido atras de uma barra invertida'::text; end if;
  if (public.dem_mover('CONF95SOL', n1, 'anexar', '{"url":"https://conf95.example.org%5c.drive.google.com/x","nome":"x"}')->>'erro') is distinct from 'URL_INVALIDA' then
    falhas := falhas || '4: barra invertida decodificada (%5c) na autoridade passou'::text; end if;
  update demandas.regras_gerais set anexo_restrito = true where id;
  v_r := public.dem_mover('CONF95SOL', n1, 'anexar', E'{"url":"https://conf95.example.org\\\\.drive.google.com/x","nome":"x"}');
  if (v_r->>'erro') is distinct from 'SITE_NAO_PERMITIDO' or (v_r->>'site') is distinct from 'conf95.example.org' then
    falhas := falhas || ('4: a barra invertida fez um site fora da lista passar por drive.google.com: ' || v_r::text); end if;
  if (public.dem_mover('CONF95SOL', n1, 'anexar', E'{"url":"https://drive.google.com\\\\conf95-barra","nome":"x"}')->>'ok') is distinct from 'true' then
    falhas := falhas || '4: site da lista com barra invertida no caminho foi recusado'::text; end if;

  /* ---- 5 · a abertura julga antes de nascer ---- */
  select count(*) into v_antes from demandas.demandas where titulo like 'CONF95%';
  v_r := public.dem_abrir('CONF95SOL', jsonb_build_object('titulo', 'CONF95 com anexo ruim',
           'descricao', 'x', 'categoria_id', c_a, 'prazo', v_prazo,
           'anexos', jsonb_build_array(
             jsonb_build_object('url', 'https://drive.google.com/ok', 'nome', 'bom'),
             jsonb_build_object('url', 'https://conf95.example.org/x.pdf', 'nome', 'ruim'))));
  select count(*) into v_dep from demandas.demandas where titulo like 'CONF95%';
  if (v_r->>'erro') is distinct from 'SITE_NAO_PERMITIDO' or (v_r->>'site') is distinct from 'conf95.example.org'
     or v_dep <> v_antes then
    falhas := falhas || ('5: a abertura aceitou anexo de site fora da lista, nao disse qual, ou a demanda nasceu: ' || v_r::text); end if;
  v_r := public.dem_abrir('CONF95SOL', jsonb_build_object('titulo', 'CONF95 com anexo bom',
           'descricao', 'x', 'categoria_id', c_a, 'prazo', v_prazo,
           'anexos', jsonb_build_array(jsonb_build_object('url', 'https://www.dropbox.com/s/conf95', 'nome', 'bom'))));
  if (v_r->>'ok') is distinct from 'true' then
    falhas := falhas || ('5: a abertura recusou anexo de site da lista: ' || v_r::text); end if;

  /* ---- 6 · a administracao inclui e tira, e so ela ---- */
  if (public.dem_ajustar('CONF95SOL', 'anexos', '{"incluir":"conf95.example.org"}')->>'erro') is distinct from 'SO_ADMIN'
     or (public.dem_ajustar('CONF95RESP', 'anexos', '{"restrito":"false"}')->>'erro') is distinct from 'SO_ADMIN'
     or (public.dem_ajustar('CONF95RESP', 'anexos', '{"tirar":"drive.google.com"}')->>'erro') is distinct from 'SO_ADMIN' then
    falhas := falhas || '6: quem nao administra mexeu na lista'::text; end if;
  v_r := public.dem_ajustar('CONF95ADM', 'anexos', '{"incluir":"https://www.CONF95.example.org:8443/qualquer/coisa?x=1"}');
  if (v_r->>'ok') is distinct from 'true' or not (v_r->'sites' ? 'conf95.example.org') then
    falhas := falhas || ('6: incluir pelo endereco colado nao guardou so o site: ' || v_r::text); end if;
  if (public.dem_mover('CONF95SOL', n1, 'anexar', '{"url":"https://conf95.example.org/agora-pode.pdf","nome":"x"}')->>'ok') is distinct from 'true' then
    falhas := falhas || '6: site incluido continuou recusado'::text; end if;
  if (public.dem_ajustar('CONF95ADM', 'anexos', '{"incluir":"nao e site"}')->>'erro') is distinct from 'SITE_INVALIDO'
     or (public.dem_ajustar('CONF95ADM', 'anexos', '{"incluir":"com.br"}')->>'erro') is distinct from 'SITE_INVALIDO'
     or (public.dem_ajustar('CONF95ADM', 'anexos', '{"incluir":"10.0.0.1"}')->>'erro') is distinct from 'SITE_INVALIDO' then
    falhas := falhas || '6: texto que nao e site, dominio de pais inteiro ou IP entrou na lista'::text; end if;
  v_r := public.dem_ajustar('CONF95ADM', 'anexos', '{"incluir":"https://conf95-igreja.sharepoint.com/x"}');
  if (v_r->>'ok') is distinct from 'true'
     or (public.dem_ajustar('CONF95ADM', 'anexos', '{"incluir":"sharepoint.com"}')->>'erro') is distinct from 'SITE_ABERTO' then
    falhas := falhas || ('6: o site aberto entrou inteiro, ou o endereco exato dele foi barrado: ' || v_r::text); end if;
  delete from demandas.sites_de_anexo where site = 'conf95-igreja.sharepoint.com';
  -- um pedido com erro nao grava nada, nem a parte boa
  v_r := public.dem_ajustar('CONF95ADM', 'anexos', '{"restrito":false,"incluir":"nao e site"}');
  if (v_r->>'erro') is distinct from 'SITE_INVALIDO'
     or not (select anexo_restrito from demandas.regras_gerais where id) then
    falhas := falhas || ('6: um pedido recusado desligou a lista mesmo assim: ' || v_r::text); end if;
  if (public.dem_ajustar('CONF95ADM', 'anexos', '{"restrito":"talvez"}')->>'erro') is distinct from 'SIM_OU_NAO'
     or (public.dem_ajustar('CONF95ADM', 'anexos', '{"tirar":"conf95-nunca-existiu.example.org"}')->>'erro') is distinct from 'NAO_EXISTE' then
    falhas := falhas || '6: valor que nao e sim ou nao, ou tirar o que nao existe, deu ok'::text; end if;
  if (public.dem_ajustar('CONF95ADM', 'anexos', '{"tirar":"https://conf95.example.org/"}')->>'ok') is distinct from 'true'
     or (public.dem_mover('CONF95SOL', n1, 'anexar', '{"url":"https://conf95.example.org/de-novo.pdf","nome":"x"}')->>'erro') is distinct from 'SITE_NAO_PERMITIDO' then
    falhas := falhas || '6: tirar o site da lista nao voltou a recusar'::text; end if;
  v_r := public.dem_ajustar('CONF95ADM', 'anexos', '{"restrito":false}');
  if (v_r->>'ok') is distinct from 'true' or (v_r->>'restrito') is distinct from 'false'
     or (select anexo_restrito from demandas.regras_gerais where id) then
    falhas := falhas || ('6: a administracao nao conseguiu desligar a lista: ' || v_r::text); end if;
  update demandas.regras_gerais set anexo_restrito = true where id;

  /* ---- 7 · a tela sabe a regra antes ---- */
  v_r := public.dem_bases('CONF95SOL');
  if (v_r->'anexos'->>'restrito') is distinct from 'true' or not (v_r->'anexos'->'sites' ? 'drive.google.com') then
    falhas := falhas || ('7: dem_bases nao mostra a regra de anexo: ' || coalesce(v_r->>'anexos', 'nada')); end if;

  /* ---- 8 · nada fora das funcoes ---- */
  if exists (select 1 from pg_roles where rolname = 'anon') then
    if has_function_privilege('anon', 'demandas.anexo_permitido(text)', 'execute')
       or has_function_privilege('anon', 'demandas.site_do_texto(text)', 'execute')
       or has_table_privilege('anon', 'demandas.sites_de_anexo', 'select')
       or has_table_privilege('anon', 'demandas.regras_gerais', 'update') then
      falhas := falhas || '8: anon alcanca a regra de anexo por fora da porta'::text; end if;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    if has_table_privilege('authenticated', 'demandas.sites_de_anexo', 'insert')
       or has_table_privilege('authenticated', 'demandas.regras_gerais', 'update') then
      falhas := falhas || '8: authenticated escreve na regra de anexo por fora da porta'::text; end if;
  end if;
  if not (select relrowsecurity from pg_class where oid = 'demandas.sites_de_anexo'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'demandas.regras_gerais'::regclass) then
    falhas := falhas || '8: tabela nova sem RLS'::text; end if;
  if exists (select 1 from demandas.sites_de_anexo x where demandas.site_aberto(x.site)) then
    falhas := falhas || '8: a lista tem um site onde qualquer pessoa publica pagina'::text; end if;
  if to_regprocedure('public.testar_porta_publica()') is not null then
    if exists (select 1 from public.testar_porta_publica() t where not t.passou) then
      falhas := falhas || format('8: o inventario da porta publica nao bate com o catalogo: %s',
        (select string_agg(t.caso || ' esperava ' || t.esperado || ', veio ' || t.obtido, ' ; ')
           from public.testar_porta_publica() t where not t.passou));
    end if;
  end if;

  /* anexo que ja existia e nao passaria pela regra nova: nao reprova (a regra
     vale para anexo novo), mas fica dito no log */
  select count(*) into v_n from demandas.anexos a
   where a.removido_em is null and not demandas.url_boa(a.url);
  if v_n > 0 then
    raise notice '95 · % anexo(s) antigo(s) nao passariam pela url_boa nova (barra invertida). Continuam onde estao.', v_n;
  end if;

  /* ---- limpeza: o interruptor volta como estava, e o CONF95 sai ---- */
  update demandas.regras_gerais set anexo_restrito = v_restrito where id;
  delete from demandas.sites_de_anexo where site like 'conf95%';
  perform set_config('demandas.membro', '', true);
  delete from demandas.demandas where titulo like 'CONF95%';
  delete from demandas.membros where nome like 'CONF95%';
  delete from demandas.categorias where grupo like 'CONF95%';
  delete from demandas.setores where nome like 'CONF95%';

  if array_length(falhas, 1) > 0 then
    raise exception E'95 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 95 · conferencia: 8 blocos. Desligada, a lista nao muda nada; ligada, so passa anexo de site da lista e de subdominio dele, com a fronteira no ponto; a barra invertida nao esconde mais localhost, IP nem site de fora; a abertura recusa antes de a demanda nascer e diz qual site; so a administracao liga, inclui e tira, o endereco colado vira so o site, site aberto e dominio de pais nao entram, e pedido recusado nao grava nada; a tela recebe a regra por dem_bases; e nada disso e alcancavel por fora das funcoes.';
end $conf$;

/* a sonda: se um arquivo antigo reescrever as portas por cima desta, a regua
   diz SUMIU em vez de o banco perder a lista em silencio */
do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (95, '95 · anexar respeita a lista de sites', 'dem_mover', 'demandas.anexo_permitido(v_url)'),
      (95, '95 · abrir respeita a lista de sites', 'dem_abrir', 'demandas.anexo_permitido(demandas.limpo('),
      (95, '95 · a tela recebe a regra de anexo', 'dem_bases', 'demandas.regra_de_anexo()')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (95, '95-o-anexo-vem-de-site-que-a-igreja-conhece.sql')
  on conflict (n) do nothing;

commit;
