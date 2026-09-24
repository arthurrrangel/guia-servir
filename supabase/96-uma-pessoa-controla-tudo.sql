/* =============================================================================
   96 · UMA PESSOA CONTROLA TUDO
   24/09/2026

   O pedido do Arthur: "tenho que ter o panorama de tudo do sistema das
   demandas, a unica pessoa que controla tudo". Perguntado se o papel Gestao
   continuava, para delegar por setor, ele escolheu: "So eu, sem Gestao para
   ninguem".

   O QUE EXISTIA

   Em producao, medido hoje pela sessao dele: 7 pessoas ativas, UMA
   administracao (ele), nenhuma gestao. Mas isso era um fato, e nao uma regra.
   `dem_ajustar` aceitava `papel = 'admin'` para qualquer pessoa: um toque
   errado no seletor da ficha de alguem, e essa pessoa passava a poder tudo,
   inclusive tirar a administracao dele (a guarda da 94 so protege o ULTIMO
   administrador, e com dois ele deixa de ser o ultimo). E a Gestao, com
   escopo, dava a outra pessoa o poder de aprovar gasto, cancelar, reabrir e
   mandar para outro setor as demandas dos setores dela.

   O QUE ESTA MIGRACAO POE NO BANCO

   · UMA ADMINISTRACAO SO. Indice unico parcial: no maximo uma pessoa ativa
     com `papel = 'admin'`. `dem_ajustar` recusa com nome proprio
     (ADMIN_UNICO) antes de chegar no indice: criar, promover ou reativar uma
     segunda administracao. A guarda da 94 continua: o ultimo administrador
     nao se rebaixa nem se desativa. E aceitar um pedido de papel na linha da
     administracao tambem nao a desfaz (a auditoria R15A achou esse caminho:
     o ramo `pedido` nao tinha a guarda).
   · A ADMINISTRACAO NAO SE TRANCA PARA FORA. Com uma administracao so, nao
     existe mais quem conserte pela tela. Trocar o e-mail com que ela entra
     pede confirmacao (CONFIRMAR_LOGIN), e deixar sem e-mail e recusado
     (LOGIN_VAZIO). Trocar o proprio link pessoal devolve o link novo, para a
     tela guardar e a sessao nao cair. E e-mail com caractere invisivel
     (espaco de largura zero, marca de direcao) e EMAIL_INVALIDO para todo
     mundo: colado do WhatsApp, ele ficava gravado e o login daquela pessoa
     nunca mais casava com o e-mail do link de entrada.
   · SEM GESTAO. `ck_papel` perde 'gestor'. `dem_ajustar` recusa o papel e o
     escopo (SEM_GESTAO). Quem era gestor, se houver, vira membro
     (solicitante), perde o escopo, e o historico da pessoa diz a troca e os
     setores que sairam. As demandas vivas que estavam com essa pessoa voltam
     para a fila do setor (ela nao conseguiria mais concluir nenhuma), e quem
     pediu cada uma recebe o aviso de estado, como em qualquer volta para a
     fila.
   · QUEM APROVA FICA SABENDO. Sem Gestao, toda aprovacao e da administracao, e
     o aviso por e-mail de demanda nova ia so para a equipe do setor. Agora a
     demanda que nasce (ou passa a) esperar aprovacao enfileira um aviso
     `aprovar` para a administracao, com o valor.
   · O PANORAMA. `dem_panorama(p_token)`, so para a administracao: a
     operacao agora (sem periodo), cada setor com a equipe que tem (e o
     desativado que ainda tem demanda viva), as pessoas por papel e os
     pedidos, quem esta com mais demandas, o que espera aprovacao, o que esta
     na fila ha mais tempo e os ultimos movimentos do sistema inteiro. As
     contas sao as mesmas das listas e dos Numeros (`atrasada`,
     `falta_aprovacao`, 7 dias para "parada").

   O QUE NAO MUDA, DE PROPOSITO

   As funcoes de visibilidade e de acao continuam com o ramo do gestor
   (`pode_ver`, `pode_atender`, `pode_aprovar`, `gere`, `no_escopo`). Sem
   gestor na tabela, o ramo nao alcanca ninguem; tirar o ramo seria reescrever
   as portas todas por um caminho que o `ck_papel` ja fecha, e cada reescrita
   inteira e uma chance de perder um conserto antigo (a historia da 67). A
   tabela `demandas.gestao` fica, vazia.

   A MIGRACAO PARA, SEM MUDAR NADA, se encontrar mais de uma administracao
   ativa (escolher qual fica e decisao de gente, nao de banco), ou uma
   administracao sem link pessoal (a conferencia entra por ele).

   CADA APLICACAO GASTA NUMEROS DE DEMANDA. A conferencia abre quatro
   demandas CONF96 e as apaga; a sequencia do numero nao volta (e nao deve: outra
   pessoa pode ter aberto uma no mesmo segundo). Numero pulado ja e normal
   aqui: toda abertura recusada gasta um.

   SE PRECISAR, POR SQL, NO PAINEL DO SUPABASE (que e do Arthur)

     -- passar a administracao para outra pessoa: DUAS instrucoes, nesta
     -- ordem (numa so, o indice ve duas administracoes no meio do caminho)
     update demandas.membros set papel = 'responsavel' where papel = 'admin' and ativo;
     update demandas.membros set papel = 'admin' where id = '<id da pessoa>';

     -- a administracao perdeu o e-mail de entrar: devolver (em minusculas,
     -- sem espaco, que e como `demandas.quem` compara)
     update demandas.membros set auth_email = lower(btrim('<e-mail>')) where papel = 'admin' and ativo;
   ============================================================================= */
do $tranca$begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(96);
  end if;
end
$tranca$;

begin;

/* -------------------------------------------------------------------------
   1 · A ADMINISTRACAO QUE EXISTE

   Zero e o banco novo (o harness monta a cadeia antes de semear gente). Uma
   e a producao. Duas ou mais: para aqui, antes de qualquer escrita.
   ------------------------------------------------------------------------- */
do $uma$
declare n int; v_sem_link int;
begin
  select count(*), count(*) filter (where token is null or btrim(token) = '')
    into n, v_sem_link
    from demandas.membros where papel = 'admin' and ativo;
  if n > 1 then
    raise exception '96 PAROU: ha % administracoes ativas. Esta migracao deixa uma so, e qual fica e decisao de quem administra. Desative as outras (papel ou situacao) e rode de novo.', n;
  end if;
  if v_sem_link > 0 then
    raise exception '96 PAROU: a administracao nao tem link pessoal, e a conferencia entra por ele. Gere um na ficha dela ("Novo link") e rode de novo.';
  end if;
end
$uma$;

/* -------------------------------------------------------------------------
   2 · QUEM ERA GESTOR

   Vira solicitante, sem escopo. O gatilho `fn_membro_historico` escreve o
   papel e o escopo que mudaram, com `por` vazio: foi a migracao, e nao uma
   pessoa. Os setores do escopo sao escritos a mao (o gatilho so ve o
   `escopo_total`). As demandas vivas com essa pessoa voltam para a fila: o
   gatilho da demanda escreve a troca de responsavel e de estado, sem autor.
   Reaplicar nao faz nada, porque nao sobra gestor.
   ------------------------------------------------------------------------- */
do $gestores$
declare n int; v_dem int;
begin
  perform set_config('demandas.membro', '', true);

  insert into demandas.pessoas_historico (membro_id, por, tipo, de, para)
    select x.id, null, 'escopo',
           (select string_agg(s.nome, ', ' order by s.ordem, s.nome)
              from demandas.gestao g join demandas.setores s on s.id = g.setor_id
             where g.membro_id = x.id),
           'nenhum'
      from demandas.membros x
     where x.papel = 'gestor'
       and exists (select 1 from demandas.gestao g where g.membro_id = x.id);

  update demandas.demandas d
     set responsavel_id = null,
         status = case when d.status = 'execucao' then 'aberta' else d.status end
   where d.status in ('aberta','execucao','travada')
     and d.responsavel_id in (select x.id from demandas.membros x where x.papel = 'gestor');
  get diagnostics v_dem = row_count;

  delete from demandas.gestao g
   where exists (select 1 from demandas.membros x where x.id = g.membro_id and x.papel = 'gestor');
  update demandas.membros set papel = 'solicitante', escopo_total = false
   where papel = 'gestor';
  get diagnostics n = row_count;
  if n > 0 then
    raise notice '96 · % pessoa(s) com o papel Gestao viraram Membro, sem escopo; % demanda(s) viva(s) com elas voltaram para a fila. O historico diz as duas coisas.', n, v_dem;
  end if;

  /* escopo sobrando de quem ja nao era gestor (a 94 apagava na troca de
     papel, mas uma linha manual passaria) */
  delete from demandas.gestao;
  update demandas.membros set escopo_total = false where escopo_total;

  /* o gatilho escreve "todos -> escolhidos" para quem via tudo, e depois da
     96 nao ha setores escolhidos: ha nenhum. So as linhas desta transacao. */
  update demandas.pessoas_historico set para = 'nenhum'
   where tipo = 'escopo' and em = now() and de = 'todos' and para = 'escolhidos';

  /* a administracao nao pede papel: aceitar esse pedido a rebaixaria (R15A) */
  update demandas.membros set papel_pedido = null, papel_pedido_em = null
   where papel = 'admin' and papel_pedido is not null;
end
$gestores$;

/* -------------------------------------------------------------------------
   3 · O BANCO RECUSA
   ------------------------------------------------------------------------- */
alter table demandas.membros drop constraint if exists ck_papel;
alter table demandas.membros add constraint ck_papel
  check (papel in ('solicitante','lider','responsavel','admin'));

create unique index if not exists ux_membros_uma_administracao
  on demandas.membros ((papel)) where papel = 'admin' and ativo;
comment on index demandas.ux_membros_uma_administracao is
  'No maximo uma administracao ativa. Pedido do Arthur em 24/09/2026: "a unica pessoa que controla tudo". Migracao 96.';

/* o aviso de "espera a sua aprovacao" e um tipo novo na fila */
alter table demandas.avisos drop constraint if exists ck_aviso_tipo;
alter table demandas.avisos add constraint ck_aviso_tipo
  check (tipo in ('nova','status','informacao','aprovar'));

/* -------------------------------------------------------------------------
   4 · AS PORTAS, POR CIRURGIA

   dem_ajustar: o papel e o escopo recusados antes de qualquer escrita; a
   segunda administracao recusada com nome; o login da administracao
   protegido; o pedido de papel que desfaria a administracao; o link novo
   devolvido a quem trocou o proprio; e o indice traduzido no `exception` (a
   rede embaixo da regra, pelo motivo escrito na 93).

   fn_enfileirar_aviso e dem_avisos_pendentes: o aviso `aprovar`.
   ------------------------------------------------------------------------- */
do $cirurgia$
declare src text; novo text;
begin
  select pg_get_functiondef('public.dem_ajustar(text,text,jsonb)'::regprocedure) into src;

  novo := public.troca_se_faltar(src, 'SEM_GESTAO',
$a$    if (p_d ? 'papel') and nullif(p_d->>'papel','') is not null
       and p_d->>'papel' not in ('solicitante','lider','responsavel','gestor','admin') then$a$,
$d$    /* 96 · a gestao acabou: ninguem recebe o papel, nem o escopo dele */
    if p_d->>'papel' = 'gestor' or (p_d ? 'escopo')
       or coalesce(p_d->>'escopo_total', '') = 'true' then
      return jsonb_build_object('ok', false, 'erro', 'SEM_GESTAO', 'campo', 'papel'); end if;
    if (p_d ? 'papel') and nullif(p_d->>'papel','') is not null
       and p_d->>'papel' not in ('solicitante','lider','responsavel','admin') then$d$,
    '96 dem_ajustar: sem gestao');

  novo := public.troca_se_faltar(novo, 'ADMIN_UNICO',
$a$    /* o ultimo administrador ativo */$a$,
$d$    /* 96 · uma administracao so: quem ja e continua sendo, e ninguem mais
       vira. Reativar uma administracao antiga cai no indice, e o `exception`
       diz o mesmo nome. */
    if v_papel = 'admin' and (x.id is null or x.papel is distinct from 'admin') then
      return jsonb_build_object('ok', false, 'erro', 'ADMIN_UNICO', 'campo', 'papel'); end if;

    /* o ultimo administrador ativo */$d$,
    '96 dem_ajustar: uma administracao');

  novo := public.troca_se_faltar(novo, 'LOGIN_VAZIO',
$a$    /* gestor sem escopo nao e gestor de nada */$a$,
$d$    /* 96 · O LOGIN DE QUEM ADMINISTRA. Com uma administracao so, trocar o
       e-mail com que ela entra tranca o sistema para todo mundo se o e-mail
       novo estiver errado (R15A: um ponto a mais e a proxima chamada ja
       voltava SEM_ACESSO). Vazio nunca; trocado, so confirmado. */
    if x.id is not null and x.papel = 'admin' and x.ativo
       and ((p_d ? 'auth_email') or (p_d ? 'email')) then
      /* esvaziar o e-mail de entrar e LOGIN_VAZIO mesmo havendo e-mail de
         contato: o login passaria em silencio para um e-mail que a ficha
         nem mostra (R15B) */
      if (p_d ? 'auth_email') and nullif(btrim(p_d->>'auth_email'), '') is null
         and x.auth_email is not null then
        return jsonb_build_object('ok', false, 'erro', 'LOGIN_VAZIO', 'campo', 'auth_email'); end if;
      /* o e-mail que entra e o de `demandas.quem`: o de login, e o de
         contato so quando nao ha login. Comparado na forma em que SERA
         GRAVADO (a do `update` abaixo), e nao limpo: um invisivel que a
         limpeza tirasse aqui ficaria gravado la, e o login sumiria sem
         pergunta (R15B) */
      v_ch := lower(coalesce(
                case when p_d ? 'auth_email' then lower(nullif(btrim(p_d->>'auth_email'), '')) else x.auth_email end,
                case when p_d ? 'email' then nullif(btrim(p_d->>'email'), '') else x.email end));
      if v_ch is distinct from lower(coalesce(x.auth_email, x.email)) then
        if v_ch is null then
          return jsonb_build_object('ok', false, 'erro', 'LOGIN_VAZIO', 'campo', 'auth_email'); end if;
        if coalesce(p_d->>'confirmar_login', '') <> 'true' then
          return jsonb_build_object('ok', false, 'erro', 'CONFIRMAR_LOGIN', 'campo', 'auth_email'); end if;
      end if;
    end if;

    /* gestor sem escopo nao e gestor de nada */$d$,
    '96 dem_ajustar: o login da administracao');

  novo := public.troca_se_faltar(novo, '96 · o pedido nao desfaz',
$a$    if x.papel_pedido is null then return jsonb_build_object('ok', false, 'erro', 'SEM_PEDIDO'); end if;$a$,
$d$    if x.papel_pedido is null then return jsonb_build_object('ok', false, 'erro', 'SEM_PEDIDO'); end if;
    /* 96 · o pedido nao desfaz a administracao: aceitar trocaria o papel dela
       pelo pedido, e o ultimo administrador sumiria sem a guarda da 94.
       Recusar continua: so limpa o pedido. */
    if x.papel = 'admin' and x.ativo and coalesce(p_d->>'decisao','') = 'aceitar' then
      return jsonb_build_object('ok', false, 'erro', 'ULTIMO_ADMIN'); end if;$d$,
    '96 dem_ajustar: o pedido da administracao');

  novo := public.troca_se_faltar(novo, '96 · o link novo volta',
$a$    update demandas.membros set token = encode(extensions.gen_random_bytes(12), 'hex')
     where id = (p_d->>'id')::uuid returning id into v_id;
    if v_id is null then return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;$a$,
$d$    update demandas.membros set token = encode(extensions.gen_random_bytes(12), 'hex')
     where id = (p_d->>'id')::uuid returning id, token into v_id, v_ch;
    if v_id is null then return jsonb_build_object('ok', false, 'erro', 'NAO_EXISTE'); end if;
    /* 96 · o link novo volta para quem trocou o PROPRIO: quem entrou pelo
       link antigo perderia a sessao na mesma hora, e o link novo so aparece
       na ficha, que ele ja nao consegue abrir (R15A) */
    if v_id = m.id then return jsonb_build_object('ok', true, 'id', v_id, 'token', v_ch); end if;$d$,
    '96 dem_ajustar: o link novo volta');

  /* e-mail com caractere invisivel (espaco de largura zero, marca de
     direcao, controle) passava na regra de forma e ficava gravado: o login
     dessa pessoa nunca mais casava com o e-mail do link de entrada, e na
     administracao isso e trancar o sistema (R15B). Vale para todo mundo. */
  novo := public.troca_se_faltar(novo, '96 · e-mail sem invisivel',
$a$         and btrim(p_d->>v_ch) !~ '^[^@\s]+@[^@\s]+$' then$a$,
$d$         and (btrim(p_d->>v_ch) !~ '^[^@\s]+@[^@\s]+$'
              /* 96 · e-mail sem invisivel (a classe da 89 ja inclui as marcas
                 de direcao, U+202A-202E e U+2066-2069) */
              or btrim(p_d->>v_ch) ~ demandas.invisiveis()
              or btrim(p_d->>v_ch) ~ '[[:cntrl:]]') then$d$,
    '96 dem_ajustar: e-mail sem invisivel');

  novo := public.troca_se_faltar(novo, 'ux_membros_uma_administracao',
$a$    get stacked diagnostics v_con = constraint_name;$a$,
$d$    get stacked diagnostics v_con = constraint_name;
    if v_con = 'ux_membros_uma_administracao' then
      return jsonb_build_object('ok', false, 'erro', 'ADMIN_UNICO', 'campo', 'papel'); end if;$d$,
    '96 dem_ajustar: o indice com nome');

  execute novo;

  -- ===================== fn_enfileirar_aviso: quem aprova fica sabendo =====================
  select pg_get_functiondef('demandas.fn_enfileirar_aviso()'::regprocedure) into src;
  novo := public.troca_se_faltar(src, '96 · a administracao aprova',
$a$         and m.id is distinct from new.aberta_por;
    return null;
  end if;$a$,
$d$         and m.id is distinct from new.aberta_por
         /* 96 · a administracao recebe o `aprovar` abaixo, e nao os dois */
         and not (m.papel = 'admin' and demandas.falta_aprovacao(new));
    /* 96 · a administracao aprova: a demanda que nasce esperando aprovacao
       vai para ela tambem, com o aviso proprio e o motivo do portao */
    if demandas.falta_aprovacao(new) then
      insert into demandas.avisos (demanda_id, membro_id, tipo, nota)
        select new.id, m.id, 'aprovar', new.travada_nota
          from demandas.membros m
         where m.papel = 'admin' and coalesce(m.ativo, true)
           and demandas.limpo(coalesce(m.auth_email, m.email)) is not null
           and m.id is distinct from new.aberta_por;
    end if;
    return null;
  end if;

  /* 96 · e a que passa a esperar aprovacao (travada por quem atende, ou a
     categoria que passou a exigir) tambem */
  if demandas.falta_aprovacao(new) and not demandas.falta_aprovacao(old) then
    insert into demandas.avisos (demanda_id, membro_id, tipo, nota)
      select new.id, m.id, 'aprovar', new.travada_nota
        from demandas.membros m
       where m.papel = 'admin' and coalesce(m.ativo, true)
         and demandas.limpo(coalesce(m.auth_email, m.email)) is not null
         and m.id is distinct from v_quem;
  end if;$d$,
    '96 fn_enfileirar_aviso: a administracao aprova');
  /* redirecionada para o setor da administracao, a que espera aprovacao
     mandava para ela o `nova` ("voce nao precisa fazer nada ainda") alem do
     `aprovar` (R15B) */
  novo := public.troca_se_faltar(novo, '96 · nem no setor trocado',
$a$         and m.id is distinct from new.aberta_por
         and m.id is distinct from v_quem;
  end if;$a$,
$d$         and m.id is distinct from new.aberta_por
         and m.id is distinct from v_quem
         /* 96 · nem no setor trocado: a administracao tem o `aprovar` */
         and not (m.papel = 'admin' and demandas.falta_aprovacao(new));
  end if;$d$,
    '96 fn_enfileirar_aviso: o setor trocado');
  execute novo;

  -- ===================== dem_avisos_pendentes: o valor, para o aviso de aprovar =====================
  select pg_get_functiondef('public.dem_avisos_pendentes(integer)'::regprocedure) into src;
  novo := public.troca_se_faltar(src, '''orcamento''',
$a$      'prazo',    d.prazo,$a$,
$d$      'prazo',    d.prazo,
      /* 96 · o aviso `aprovar` diz o valor: e o que se decide */
      'orcamento', d.orcamento,$d$,
    '96 dem_avisos_pendentes: o valor');
  execute novo;
end
$cirurgia$;

/* -------------------------------------------------------------------------
   5 · O PANORAMA

   Uma chamada, so para a administracao, porta estreita (`<> 'admin'`). Nada
   de telefone, e-mail ou link pessoal: nomes, numeros e demandas, que a
   administracao ja ve inteiros nas outras telas.
   ------------------------------------------------------------------------- */
create or replace function public.dem_panorama(p_token text default null)
returns jsonb language plpgsql stable security definer set search_path = demandas, public as $fn$
declare
  m demandas.membros;
  v_op jsonb; v_set jsonb; v_pes jsonb; v_carga jsonb; v_apr jsonb; v_fila jsonb; v_rec jsonb;
begin
  m := demandas.quem(p_token);
  if m.id is null then return jsonb_build_object('ok', false, 'erro', 'SEM_ACESSO'); end if;
  if m.papel <> 'admin' then return jsonb_build_object('ok', false, 'erro', 'SO_ADMIN'); end if;

  /* a operacao agora, sem periodo. "Aprovar" e "travadas" nao se somam: a
     que espera aprovacao conta so em "aprovar", ainda que esteja travada */
  select jsonb_build_object(
    'vivas',       count(*) filter (where d.status in ('aberta','execucao','travada')),
    'na_fila',     count(*) filter (where d.status = 'aberta' and d.responsavel_id is null
                                      and not demandas.falta_aprovacao(d)),
    'em_execucao', count(*) filter (where d.status = 'execucao' and not demandas.falta_aprovacao(d)),
    'aprovar',     count(*) filter (where d.status in ('aberta','execucao','travada')
                                      and demandas.falta_aprovacao(d)),
    'travadas',    count(*) filter (where d.status = 'travada' and not demandas.falta_aprovacao(d)),
    'esperando_quem_pediu', count(*) filter (where d.status = 'travada' and d.travada_por = 'informacao'
                                      and not demandas.falta_aprovacao(d)),
    'atrasadas',   count(*) filter (where demandas.atrasada(d)),
    'paradas',     count(*) filter (where d.status in ('aberta','execucao','travada')
                                      and d.mexida_em < now() - interval '7 days'),
    'a_confirmar', count(*) filter (where d.status = 'concluida' and d.validada_em is null),
    'recebidas_30d',  count(*) filter (where d.criada_em >= now() - interval '30 days'),
    'concluidas_30d', count(*) filter (where d.status = 'concluida'
                                         and d.concluida_em >= now() - interval '30 days'),
    'total', count(*))
    into v_op
    from demandas.demandas d;

  /* cada setor ativo que atende; e o que nao atende, ou foi desativado, mas
     tem demanda viva com ele (trabalho pendurado num setor que ninguem olha:
     sem esta linha a soma por setor nao batia com "Em aberto", R15A) */
  select coalesce(jsonb_agg(x.j order by x.ordem, x.nome), '[]'::jsonb) into v_set
    from (select s.ordem, s.nome, jsonb_build_object(
            'id', s.id, 'nome', s.nome, 'atende', s.atende, 'ativo', s.ativo,
            'equipe', (select count(*) from demandas.membros p
                        where p.ativo and p.papel = 'responsavel' and p.setor_id = s.id),
            'vivas', count(d.id) filter (where d.status in ('aberta','execucao','travada')),
            'na_fila', count(d.id) filter (where d.status = 'aberta' and d.responsavel_id is null
                                             and not demandas.falta_aprovacao(d)),
            'aprovar', count(d.id) filter (where d.status in ('aberta','execucao','travada')
                                             and demandas.falta_aprovacao(d)),
            'atrasadas', count(d.id) filter (where demandas.atrasada(d)),
            'concluidas_30d', count(d.id) filter (where d.status = 'concluida'
                                                    and d.concluida_em >= now() - interval '30 days')) j
            from demandas.setores s
            left join demandas.demandas d on d.setor_responsavel = s.id
           group by s.id
          having (s.ativo and s.atende)
              or count(d.id) filter (where d.status in ('aberta','execucao','travada')) > 0) x;

  select jsonb_build_object(
    'ativas', count(*) filter (where p.ativo),
    'sem_acesso', count(*) filter (where not p.ativo),
    'pedidos', count(*) filter (where p.ativo and p.papel_pedido is not null),
    'por_papel', jsonb_build_object(
      'admin', count(*) filter (where p.ativo and p.papel = 'admin'),
      'responsavel', count(*) filter (where p.ativo and p.papel = 'responsavel'),
      'lider', count(*) filter (where p.ativo and p.papel = 'lider'),
      'solicitante', count(*) filter (where p.ativo and p.papel = 'solicitante')),
    /* equipe que nao atende nada: sem setor, ou num setor que nao atende */
    'equipe_sem_setor', count(*) filter (where p.ativo and p.papel = 'responsavel'
      and not exists (select 1 from demandas.setores s
                       where s.id = p.setor_id and s.atende and s.ativo)))
    into v_pes
    from demandas.membros p;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'nome', c.nome, 'setor', c.setor, 'com_ela', c.n, 'atrasadas', c.a)
           order by c.a desc, c.n desc, c.nome), '[]'::jsonb) into v_carga
    from (select p.id, p.nome,
                 (select s.nome from demandas.setores s where s.id = p.setor_id) setor,
                 count(*) n, count(*) filter (where demandas.atrasada(d)) a
            from demandas.demandas d
            join demandas.membros p on p.id = d.responsavel_id
           where d.status in ('aberta','execucao','travada')
           group by p.id
           order by 5 desc, 4 desc, p.nome
           limit 8) c;

  /* o que so a administracao decide, a mais antiga primeiro. Ate 50: a tela
     mostra oito e abre o resto ali mesmo, sem mandar para uma lista com outra
     conta (R15A) */
  select coalesce(jsonb_agg(demandas.resumo(x.d)
           || jsonb_build_object('motivo', 'aprovar', 'orcamento', (x.d).orcamento)
           order by (x.d).criada_em), '[]'::jsonb) into v_apr
    from (select d from demandas.demandas d
           where d.status in ('aberta','execucao','travada') and demandas.falta_aprovacao(d)
           order by d.criada_em limit 50) x;

  /* na fila sem ninguem, a mais antiga primeiro */
  select coalesce(jsonb_agg(demandas.resumo(x.d) order by (x.d).criada_em), '[]'::jsonb) into v_fila
    from (select d from demandas.demandas d
           where d.status = 'aberta' and d.responsavel_id is null
             and not demandas.falta_aprovacao(d)
           order by d.criada_em limit 5) x;

  /* os ultimos movimentos do sistema inteiro, no formato dos avisos, para a
     tela juntar o gesto com a mesma funcao. Com os da propria administracao:
     o panorama e de tudo. */
  select coalesce(jsonb_agg(jsonb_build_object(
           'em', e.em, 'tipo', e.tipo, 'de', e.de, 'para', e.para, 'texto', left(e.texto, 280),
           'interno', e.interno,
           'quem', (select p.nome from demandas.membros p where p.id = e.membro_id),
           'numero', d.numero, 'titulo', d.titulo)
           order by e.em desc, e.id desc), '[]'::jsonb) into v_rec
    from (select * from demandas.eventos x
           where x.em > now() - interval '60 days'
           order by x.em desc, x.id desc limit 60) e
    join demandas.demandas d on d.id = e.demanda_id;

  return jsonb_build_object('ok', true, 'agora', now(),
    'operacao', v_op, 'setores', v_set, 'pessoas', v_pes,
    'carga', v_carga, 'aprovar', v_apr, 'fila', v_fila, 'recentes', v_rec);
end $fn$;

comment on function public.dem_panorama(text) is
  'O panorama do sistema de demandas para a administracao: operacao agora, setores com equipe, pessoas por papel, carga, aprovacoes, fila antiga e ultimos movimentos. SO_ADMIN. Migracao 96.';

do $grants$
begin
  execute 'revoke all on function public.dem_panorama(text) from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'grant execute on function public.dem_panorama(text) to anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.dem_panorama(text) to authenticated';
  end if;
end $grants$;

do $porta$ begin
  if to_regclass('public.porta_publica') is null then
    raise notice '96 · este banco nao tem o inventario da porta publica (a 77 nao esta na cadeia). Nada a declarar.';
    return;
  end if;
  insert into public.porta_publica (funcao, motivo, n) values
    ('dem_panorama(p_token text)',
     'o panorama do sistema de demandas para quem administra: contas da operacao, setores, pessoas por papel, carga, aprovacoes e ultimos movimentos. SO_ADMIN, porta estreita; sem telefone, e-mail ou link pessoal.', 96)
  on conflict (funcao) do update set motivo = excluded.motivo, n = excluded.n;
end $porta$;

/* -------------------------------------------------------------------------
   6 · A CONFERENCIA

   Com a administracao de verdade (a de producao), porque uma segunda nao
   pode nascer nem para o teste: o proprio indice e o que se confere. Num
   banco sem ninguem (a cadeia do harness), a conferencia cria a sua e a
   apaga no fim, e so ali testa o que ESCREVERIA na linha da administracao
   (trocar o login confirmado, aceitar o pedido dela, trocar o proprio link).
   Com a administracao de verdade, toda chamada feita em nome dela aqui e
   recusada antes da primeira escrita, ou mexe so em gente e demanda CONF96.
   Tudo que cria tem o prefixo CONF96; os e-mails sao `.invalid` (RFC 2606) e
   os avisos de e-mail que as demandas CONF96 enfileiram saem junto com elas,
   antes do commit.
   ------------------------------------------------------------------------- */
do $conf$
declare
  falhas text[] := '{}';
  v_adm demandas.membros; v_tok text; v_criei boolean := false; v_super boolean;
  s_pede uuid; s_at uuid; c_a uuid; c_ap uuid; v_prazo text; v_md5 text;
  v_r jsonb; v_p0 jsonb; v_p1 jsonb; v_p2 jsonb; v_p3 jsonb; v_id uuid; v_n int;
  n1 int; n2 int; n3 int; n4 int; v_novo text; v_fila_email jsonb; v_av0 int; v_estrutura jsonb;
  s_fora uuid; c_fora uuid;
begin
  perform set_config('demandas.membro', '', true);
  perform set_config('teste.jwt', '', true);
  perform set_config('request.jwt.claim', '', true);
  perform set_config('request.jwt.claims', '', true);
  v_prazo := to_char(demandas.hoje() + 10, 'YYYY-MM-DD');
  select rolsuper into v_super from pg_roles where rolname = current_user;
  /* os avisos que ESTA transacao ja criou antes da conferencia (a volta para
     a fila das demandas de quem era gestor avisa quem pediu): a limpeza
     confere que a conferencia nao deixou nenhum alem destes (R15B) */
  select count(*) into v_av0 from demandas.avisos where criado_em = now();

  insert into demandas.setores (nome, slug, atende) values ('CONF96 Pede', 'conf96-pede', false) returning id into s_pede;
  insert into demandas.setores (nome, slug, atende) values ('CONF96 Atende', 'conf96-atende', true) returning id into s_at;
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, prazo_padrao_dias)
    values ('CONF96 grupo', 'CONF96 arte', s_at, false, 5) returning id into c_a;
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, prazo_padrao_dias)
    values ('CONF96 grupo', 'CONF96 compra', s_at, true, 5) returning id into c_ap;

  select * into v_adm from demandas.membros where papel = 'admin' and ativo limit 1;
  if v_adm.id is null then
    /* no setor que ATENDE: e ai que a administracao receberia, alem do aviso
       de aprovar, o de demanda nova da mesma demanda, e o bloco 5 confere que
       nao recebe os dois */
    /* com e-mail de contato alem do de entrar: e o caso em que esvaziar o
       de entrar trocaria o login em silencio (R15B) */
    insert into demandas.membros (nome, papel, setor_id, token, auth_email, email)
      values ('CONF96 Admin', 'admin', s_at, 'CONF96ADM', 'conf96.adm@exemplo.invalid', 'conf96.contato@exemplo.invalid')
      returning * into v_adm;
    v_criei := true;
  end if;
  v_tok := v_adm.token;
  select md5(x::text) into v_md5 from demandas.membros x where x.id = v_adm.id;
  /* gente CONF96 COM telefone e e-mail: sem eles, a conferencia do vazamento
     so via o nome da chave, e um "contato" novo passava (R15A) */
  insert into demandas.membros (nome, papel, setor_id, token, auth_email, telefone) values
    ('CONF96 Pede', 'solicitante', s_pede, 'CONF96SOL', 'conf96.pede@exemplo.invalid', '5599960000001'),
    ('CONF96 Equipe', 'responsavel', s_at, 'CONF96RESP', 'conf96.equipe@exemplo.invalid', '5599960000002'),
    ('CONF96 Lider', 'lider', s_pede, 'CONF96LID', 'conf96.lider@exemplo.invalid', '5599960000003'),
    /* do setor que atende, sem ser equipe: nao conta na equipe */
    ('CONF96 Membro do setor', 'solicitante', s_at, 'CONF96MEM', 'conf96.membro@exemplo.invalid', '5599960000004');

  /* ---- 1 · o banco nao aceita gestor, nem por fora das funcoes ---- */
  begin
    insert into demandas.membros (nome, papel, setor_id, token) values ('CONF96 Gestor', 'gestor', s_at, 'CONF96GES');
    falhas := falhas || '1: o banco aceitou uma pessoa com o papel gestor'::text;
  exception when check_violation then null;
  end;
  begin
    update demandas.membros set papel = 'gestor' where token = 'CONF96RESP';
    falhas := falhas || '1: o banco deixou uma pessoa virar gestor por update'::text;
  exception when check_violation then null;
  end;
  if exists (select 1 from demandas.membros where papel = 'gestor')
     or exists (select 1 from demandas.gestao)
     or exists (select 1 from demandas.membros where escopo_total) then
    falhas := falhas || '1: sobrou gestor, escopo ou escopo total'::text; end if;

  /* ---- 2 · o banco nao aceita segunda administracao, nem por fora ---- */
  begin
    insert into demandas.membros (nome, papel, setor_id, token) values ('CONF96 Admin 2', 'admin', s_pede, 'CONF96ADM2');
    falhas := falhas || '2: o banco aceitou uma segunda administracao ativa'::text;
  exception when unique_violation then null;
  end;
  begin
    update demandas.membros set papel = 'admin' where token = 'CONF96SOL';
    falhas := falhas || '2: o banco deixou uma segunda pessoa virar administracao por update'::text;
  exception when unique_violation then null;
  end;
  /* uma administracao inativa pode existir (a historia de quem ja foi), mas
     nao volta a ser ativa enquanto houver outra */
  insert into demandas.membros (nome, papel, setor_id, token, ativo)
    values ('CONF96 Admin antiga', 'admin', s_pede, 'CONF96ADMV', false) returning id into v_id;
  begin
    update demandas.membros set ativo = true where id = v_id;
    falhas := falhas || '2: uma administracao antiga voltou a ser ativa ao lado da atual'::text;
  exception when unique_violation then null;
  end;

  /* ---- 3 · dem_ajustar diz o nome da recusa, e nao grava nada ---- */
  v_r := public.dem_ajustar(v_tok, 'membro', jsonb_build_object('nome', 'CONF96 Novo gestor', 'papel', 'gestor', 'setor_id', s_at));
  if (v_r->>'erro') is distinct from 'SEM_GESTAO' then
    falhas := falhas || ('3: criar gestor nao foi SEM_GESTAO: ' || v_r::text); end if;
  v_r := public.dem_ajustar(v_tok, 'membro', jsonb_build_object('id', (select id from demandas.membros where token = 'CONF96RESP'), 'papel', 'gestor'));
  if (v_r->>'erro') is distinct from 'SEM_GESTAO' then
    falhas := falhas || ('3: promover a gestor nao foi SEM_GESTAO: ' || v_r::text); end if;
  v_r := public.dem_ajustar(v_tok, 'membro', jsonb_build_object('id', (select id from demandas.membros where token = 'CONF96RESP'), 'escopo', jsonb_build_array(s_at)));
  if (v_r->>'erro') is distinct from 'SEM_GESTAO' then
    falhas := falhas || ('3: dar escopo nao foi SEM_GESTAO: ' || v_r::text); end if;
  v_r := public.dem_ajustar(v_tok, 'membro', jsonb_build_object('id', (select id from demandas.membros where token = 'CONF96RESP'), 'escopo_total', 'true'));
  if (v_r->>'erro') is distinct from 'SEM_GESTAO' then
    falhas := falhas || ('3: dar escopo total nao foi SEM_GESTAO: ' || v_r::text); end if;
  if (select papel from demandas.membros where token = 'CONF96RESP') <> 'responsavel' then
    falhas := falhas || '3: uma recusa de gestao mudou o papel mesmo assim'::text; end if;

  v_r := public.dem_ajustar(v_tok, 'membro', jsonb_build_object('nome', 'CONF96 Nova administracao', 'papel', 'admin', 'setor_id', s_pede));
  if (v_r->>'erro') is distinct from 'ADMIN_UNICO'
     or exists (select 1 from demandas.membros where nome = 'CONF96 Nova administracao') then
    falhas := falhas || ('3: criar outra administracao nao foi ADMIN_UNICO, ou a pessoa nasceu: ' || v_r::text); end if;
  v_r := public.dem_ajustar(v_tok, 'membro', jsonb_build_object('id', (select id from demandas.membros where token = 'CONF96SOL'), 'papel', 'admin'));
  if (v_r->>'erro') is distinct from 'ADMIN_UNICO'
     or (select papel from demandas.membros where token = 'CONF96SOL') <> 'solicitante' then
    falhas := falhas || ('3: promover a administracao nao foi ADMIN_UNICO, ou o papel mudou: ' || v_r::text); end if;
  v_r := public.dem_ajustar(v_tok, 'membro', jsonb_build_object('id', v_id, 'ativo', 'true'));
  if (v_r->>'erro') is distinct from 'ADMIN_UNICO'
     or (select ativo from demandas.membros where id = v_id) then
    falhas := falhas || ('3: reativar a administracao antiga nao foi ADMIN_UNICO: ' || v_r::text); end if;

  /* a administracao de verdade nao se desfaz, nem pela propria mao */
  v_r := public.dem_ajustar(v_tok, 'membro', jsonb_build_object('id', v_adm.id, 'papel', 'responsavel'));
  if (v_r->>'erro') is distinct from 'ULTIMO_ADMIN'
     or (select papel from demandas.membros where id = v_adm.id) <> 'admin' then
    falhas := falhas || ('3: a unica administracao deixou de ser, ou a recusa mudou: ' || v_r::text); end if;
  v_r := public.dem_ajustar(v_tok, 'membro', jsonb_build_object('id', v_adm.id, 'ativo', 'false'));
  if (v_r->>'erro') is distinct from 'ULTIMO_ADMIN'
     or not (select ativo from demandas.membros where id = v_adm.id) then
    falhas := falhas || ('3: a unica administracao foi desativada: ' || v_r::text); end if;
  /* nem se tranca para fora pelo e-mail */
  v_r := public.dem_ajustar(v_tok, 'membro', jsonb_build_object('id', v_adm.id, 'auth_email', '', 'email', ''));
  if (v_r->>'erro') is distinct from 'LOGIN_VAZIO' then
    falhas := falhas || ('3: a administracao ficou sem e-mail de entrar: ' || v_r::text); end if;
  /* esvaziar so o de entrar, com o de contato de pe, tambem nao (R15B) */
  if v_adm.auth_email is not null then
    v_r := public.dem_ajustar(v_tok, 'membro', jsonb_build_object('id', v_adm.id, 'auth_email', ''));
    if (v_r->>'erro') is distinct from 'LOGIN_VAZIO' then
      falhas := falhas || ('3: esvaziar o e-mail de entrar da administracao nao foi LOGIN_VAZIO: ' || v_r::text); end if;
  end if;
  /* e-mail com invisivel nao entra, de ninguem: o login nunca mais casaria
     com o e-mail do link de entrada (R15B) */
  v_r := public.dem_ajustar(v_tok, 'membro', jsonb_build_object('id', v_adm.id,
           'auth_email', coalesce(v_adm.auth_email, 'conf96.adm@exemplo.invalid') || chr(8203)));
  if (v_r->>'erro') is distinct from 'EMAIL_INVALIDO' then
    falhas := falhas || ('3: e-mail de entrar com espaco de largura zero nao foi EMAIL_INVALIDO: ' || v_r::text); end if;
  v_r := public.dem_ajustar(v_tok, 'membro', jsonb_build_object('id', (select id from demandas.membros where token = 'CONF96MEM'),
           'auth_email', 'conf96.' || chr(8238) || 'membro@exemplo.invalid'));
  if (v_r->>'erro') is distinct from 'EMAIL_INVALIDO' then
    falhas := falhas || ('3: e-mail com marca de direcao nao foi EMAIL_INVALIDO: ' || v_r::text); end if;
  v_r := public.dem_ajustar(v_tok, 'membro', jsonb_build_object('id', v_adm.id, 'auth_email', 'conf96.troca@exemplo.invalid'));
  if (v_r->>'erro') is distinct from 'CONFIRMAR_LOGIN' then
    falhas := falhas || ('3: o e-mail de entrar da administracao mudou sem confirmacao: ' || v_r::text); end if;
  if (select md5(x::text) from demandas.membros x where x.id = v_adm.id) is distinct from v_md5 then
    falhas := falhas || '3: uma recusa escreveu na linha da administracao'::text; end if;
  /* o que escreveria na linha dela, so com a administracao da conferencia */
  if v_criei then
    v_r := public.dem_ajustar(v_tok, 'membro', jsonb_build_object('id', v_adm.id, 'auth_email', 'conf96.nova@exemplo.invalid', 'confirmar_login', 'true'));
    if (v_r->>'ok') is distinct from 'true'
       or (select auth_email from demandas.membros where id = v_adm.id) is distinct from 'conf96.nova@exemplo.invalid' then
      falhas := falhas || ('3: a troca confirmada do e-mail de entrar nao gravou: ' || v_r::text); end if;
    /* pedido de lider: aceito sem a guarda, rebaixaria de verdade */
    update demandas.membros set papel_pedido = 'lider', papel_pedido_em = now() where id = v_adm.id;
    v_r := public.dem_ajustar(v_tok, 'pedido', jsonb_build_object('id', v_adm.id, 'decisao', 'aceitar'));
    if (v_r->>'erro') is distinct from 'ULTIMO_ADMIN'
       or (select papel from demandas.membros where id = v_adm.id) <> 'admin' then
      falhas := falhas || ('3: aceitar o pedido de papel da administracao a desfez: ' || v_r::text); end if;
    /* recusar continua: so limpa o pedido */
    v_r := public.dem_ajustar(v_tok, 'pedido', jsonb_build_object('id', v_adm.id, 'decisao', 'recusar'));
    if (v_r->>'ok') is distinct from 'true'
       or (select papel_pedido from demandas.membros where id = v_adm.id) is not null then
      falhas := falhas || ('3: recusar o pedido da administracao nao limpou o pedido: ' || v_r::text); end if;
    /* a administracao que entra pelo e-mail de CONTATO (sem o de entrar) nao
       o esvazia: seria ficar sem e-mail nenhum */
    update demandas.membros set auth_email = null where id = v_adm.id;
    v_r := public.dem_ajustar(v_tok, 'membro', jsonb_build_object('id', v_adm.id, 'email', ''));
    if (v_r->>'erro') is distinct from 'LOGIN_VAZIO'
       or (select email from demandas.membros where id = v_adm.id) is null then
      falhas := falhas || ('3: a administracao que entra pelo e-mail de contato ficou sem e-mail: ' || v_r::text); end if;
    update demandas.membros set auth_email = 'conf96.nova@exemplo.invalid' where id = v_adm.id;
    v_r := public.dem_ajustar(v_tok, 'link', jsonb_build_object('id', v_adm.id));
    v_novo := v_r->>'token';
    if (v_r->>'ok') is distinct from 'true' or v_novo is null or v_novo = v_tok
       or (public.dem_quem_sou(v_novo)->>'ok') is distinct from 'true'
       or (public.dem_quem_sou(v_tok)->>'ok') = 'true' then
      falhas := falhas || ('3: trocar o proprio link nao devolveu um link novo que entra: ' || v_r::text); end if;
    if v_novo is not null then v_tok := v_novo; end if;
  end if;
  /* trocar o link de OUTRA pessoa nao devolve o link dela */
  v_r := public.dem_ajustar(v_tok, 'link', jsonb_build_object('id', (select id from demandas.membros where token = 'CONF96MEM')));
  if (v_r->>'ok') is distinct from 'true' or v_r ? 'token' then
    falhas := falhas || ('3: trocar o link de outra pessoa devolveu o link dela: ' || v_r::text); end if;

  /* o resto continua: Membro, Lider e Equipe, e o pedido de papel */
  v_r := public.dem_ajustar(v_tok, 'membro', jsonb_build_object('id', (select id from demandas.membros where token = 'CONF96SOL'), 'papel', 'lider'));
  if (v_r->>'ok') is distinct from 'true'
     or (select papel from demandas.membros where token = 'CONF96SOL') <> 'lider' then
    falhas := falhas || ('3: a administracao nao conseguiu fazer um membro virar lider: ' || v_r::text); end if;
  update demandas.membros set papel_pedido = 'responsavel', papel_pedido_em = now() where token = 'CONF96LID';
  update demandas.membros set setor_id = s_at where token = 'CONF96LID';
  v_r := public.dem_ajustar(v_tok, 'pedido', jsonb_build_object('id', (select id from demandas.membros where token = 'CONF96LID'), 'decisao', 'aceitar'));
  if (v_r->>'ok') is distinct from 'true'
     or (select papel from demandas.membros where token = 'CONF96LID') <> 'responsavel' then
    falhas := falhas || ('3: aceitar o pedido de papel parou de funcionar: ' || v_r::text); end if;
  /* quem nao administra continua sem porta nenhuma */
  if (public.dem_ajustar('CONF96RESP', 'membro', jsonb_build_object('id', (select id from demandas.membros where token = 'CONF96RESP'), 'papel', 'admin'))->>'erro') is distinct from 'SO_ADMIN' then
    falhas := falhas || '3: quem nao administra chegou na regra da administracao'::text; end if;

  /* ---- 4 · o panorama: so a administracao, e as contas andam juntas ---- */
  if (public.dem_panorama(null)->>'erro') is distinct from 'SEM_ACESSO'
     or (public.dem_panorama('CONF96-nao-existe')->>'erro') is distinct from 'SEM_ACESSO' then
    falhas := falhas || '4: o panorama respondeu sem identidade'::text; end if;
  if (public.dem_panorama('CONF96SOL')->>'erro') is distinct from 'SO_ADMIN'
     or (public.dem_panorama('CONF96RESP')->>'erro') is distinct from 'SO_ADMIN'
     or (public.dem_panorama('CONF96LID')->>'erro') is distinct from 'SO_ADMIN' then
    falhas := falhas || '4: o panorama abriu para quem nao administra'::text; end if;

  v_p0 := public.dem_panorama(v_tok);
  if (v_p0->>'ok') is distinct from 'true'
     or not (v_p0 ? 'operacao' and v_p0 ? 'setores' and v_p0 ? 'pessoas' and v_p0 ? 'carga'
             and v_p0 ? 'aprovar' and v_p0 ? 'fila' and v_p0 ? 'recentes') then
    falhas := falhas || ('4: o panorama nao trouxe as sete partes: ' || left(coalesce(v_p0::text, 'nulo'), 200)); end if;

  /* equipe num setor que nao atende: "equipe sem setor" anda */
  insert into demandas.membros (nome, papel, setor_id, token, telefone)
    values ('CONF96 Equipe perdida', 'responsavel', s_pede, 'CONF96PERD', '5599960000005');

  v_r := public.dem_abrir('CONF96SOL', jsonb_build_object('titulo', 'CONF96 na fila',
           'descricao', 'x', 'categoria_id', c_a, 'prazo', v_prazo));
  n1 := (v_r->>'numero')::int;
  v_r := public.dem_abrir('CONF96SOL', jsonb_build_object('titulo', 'CONF96 para aprovar',
           'descricao', 'x', 'categoria_id', c_ap, 'prazo', v_prazo, 'orcamento', '1500.00'));
  n2 := (v_r->>'numero')::int;
  v_r := public.dem_abrir('CONF96SOL', jsonb_build_object('titulo', 'CONF96 para concluir',
           'descricao', 'x', 'categoria_id', c_a, 'prazo', v_prazo));
  n3 := (v_r->>'numero')::int;
  if n1 is null or n2 is null or n3 is null then
    falhas := falhas || ('4: as demandas de teste nao nasceram: ' || v_r::text); end if;
  v_p1 := public.dem_panorama(v_tok);
  /* a que espera aprovacao nasce travada: conta em "aprovar", e nao em
     "travadas" nem na fila */
  if ((v_p1->'operacao'->>'vivas')::int - (v_p0->'operacao'->>'vivas')::int) <> 3
     or ((v_p1->'operacao'->>'na_fila')::int - (v_p0->'operacao'->>'na_fila')::int) <> 2
     or ((v_p1->'operacao'->>'aprovar')::int - (v_p0->'operacao'->>'aprovar')::int) <> 1
     or ((v_p1->'operacao'->>'travadas')::int - (v_p0->'operacao'->>'travadas')::int) <> 0
     or ((v_p1->'operacao'->>'recebidas_30d')::int - (v_p0->'operacao'->>'recebidas_30d')::int) <> 3 then
    falhas := falhas || ('4: as contas da operacao nao andaram com as tres demandas novas: '
      || (v_p0->>'operacao') || ' -> ' || (v_p1->>'operacao')); end if;
  if ((v_p1->'pessoas'->>'equipe_sem_setor')::int - (v_p0->'pessoas'->>'equipe_sem_setor')::int) <> 1 then
    falhas := falhas || '4: a equipe num setor que nao atende nao contou como equipe sem setor'::text; end if;
  /* a equipe e quem atende o setor agora: a Equipe e o Lider que virou
     equipe pelo pedido aceito no bloco 3 */
  select (x->>'equipe')::int into v_n from jsonb_array_elements(v_p1->'setores') x where x->>'nome' = 'CONF96 Atende';
  if v_n is distinct from (select count(*)::int from demandas.membros
                            where ativo and papel = 'responsavel' and setor_id = s_at)
     or v_n is distinct from 2 then
    falhas := falhas || ('4: o setor de teste nao mostrou a equipe (2): ' || coalesce(v_n::text, 'ausente')); end if;
  if not exists (select 1 from jsonb_array_elements(v_p1->'setores') x
                  where x->>'nome' = 'CONF96 Atende' and (x->>'na_fila')::int = 2 and (x->>'aprovar')::int = 1)
     or exists (select 1 from jsonb_array_elements(v_p1->'setores') x where x->>'nome' = 'CONF96 Pede') then
    falhas := falhas || '4: o setor que atende nao contou a fila e a aprovacao, ou o que so pede entrou'::text; end if;
  /* a lista mostra ate 50, as mais antigas: com mais que isso esperando (em
     producao, um dia), a de teste pode ficar de fora, e o que se confere e a
     forma de cada linha */
  if (v_p1->'operacao'->>'aprovar')::int <= 50 then
    if not exists (select 1 from jsonb_array_elements(v_p1->'aprovar') x
                    where (x->>'numero')::int = n2 and (x->>'orcamento')::numeric = 1500 and x->>'motivo' = 'aprovar') then
      falhas := falhas || '4: a demanda que espera aprovacao nao apareceu com o valor'::text; end if;
  elsif exists (select 1 from jsonb_array_elements(v_p1->'aprovar') x
                 where not (x ? 'orcamento') or x->>'motivo' is distinct from 'aprovar'
                    or (x->>'falta_aprovacao') is distinct from 'true') then
    falhas := falhas || '4: a demanda que espera aprovacao nao apareceu com o valor'::text; end if;
  if exists (select 1 from jsonb_array_elements(v_p1->'fila') x
              where x->>'status' <> 'aberta' or x->>'responsavel_id' is not null) then
    falhas := falhas || '4: a fila antiga do panorama tem demanda andando ou com dono'::text; end if;
  if not exists (select 1 from jsonb_array_elements(v_p1->'recentes') x
                  where (x->>'numero')::int = n2 and x->>'tipo' = 'abertura' and x->>'quem' = 'CONF96 Pede') then
    falhas := falhas || '4: a abertura nao apareceu nos ultimos movimentos'::text; end if;
  if ((v_p1->'pessoas'->'por_papel'->>'admin')::int) <> 1
     or (v_p1->'pessoas'->'por_papel') ? 'gestor' then
    falhas := falhas || ('4: as pessoas por papel nao dizem uma administracao e nenhuma gestao: ' || (v_p1->'pessoas')::text); end if;

  /* ---- 5 · quem aprova fica sabendo, e so ela ---- */
  if demandas.limpo(coalesce(v_adm.auth_email, v_adm.email)) is not null then
    select count(*) into v_n from demandas.avisos a join demandas.demandas d on d.id = a.demanda_id
     where d.numero = n2 and a.membro_id = v_adm.id and a.tipo = 'aprovar';
    if v_n <> 1 then
      falhas := falhas || ('5: a demanda que espera aprovacao nao avisou a administracao uma vez (avisos: ' || v_n || ')'); end if;
    /* so se ve quando a administracao e do setor que atende (a da
       conferencia e); a de producao so recebe o `aprovar` */
    if exists (select 1 from demandas.avisos a join demandas.demandas d on d.id = a.demanda_id
                where d.numero = n2 and a.membro_id = v_adm.id and a.tipo = 'nova') then
      falhas := falhas || '5: a administracao recebeu dois avisos da mesma demanda'::text; end if;
    /* o e-mail sai de `dem_avisos_pendentes`, que RESERVA o que devolve: a
       leitura roda numa subtransacao desfeita, e nada fica reservado */
    begin
      v_fila_email := public.dem_avisos_pendentes(1000);
      raise exception using errcode = 'P0001', message = 'CONF96 desfaz a reserva';
    exception when raise_exception then null;
    end;
    if not exists (select 1 from jsonb_array_elements(coalesce(v_fila_email, '[]'::jsonb)) x
                    where (x->>'numero')::int = n2 and x->>'tipo' = 'aprovar'
                      and (x->>'orcamento')::numeric = 1500) then
      falhas := falhas || '5: o aviso de aprovar nao leva o valor para o e-mail'::text; end if;
    v_fila_email := null;
  end if;
  if exists (select 1 from demandas.avisos a join demandas.demandas d on d.id = a.demanda_id
              where d.numero in (n1, n3) and a.tipo = 'aprovar') then
    falhas := falhas || '5: houve aviso de aprovar de demanda que nao espera aprovacao'::text; end if;
  if exists (select 1 from demandas.avisos a join demandas.demandas d on d.id = a.demanda_id
              where d.numero = n2 and a.tipo = 'aprovar' and a.membro_id <> v_adm.id) then
    falhas := falhas || '5: alguem alem da administracao recebeu o aviso de aprovar'::text; end if;
  if not exists (select 1 from demandas.avisos a join demandas.demandas d on d.id = a.demanda_id
                  where d.numero = n2 and a.tipo = 'nova'
                    and a.membro_id = (select id from demandas.membros where token = 'CONF96RESP')) then
    falhas := falhas || '5: a equipe do setor deixou de ser avisada da demanda nova'::text; end if;

  /* ---- 6 · as contas andam com o trabalho ---- */
  /* a Equipe assume a da fila: sai da fila, entra em execucao, e ela aparece
     na carga (sem link, telefone nem e-mail) */
  v_r := public.dem_mover('CONF96RESP', n1, 'assumir', '{}'::jsonb);
  if (v_r->>'ok') is distinct from 'true' then
    falhas := falhas || ('6: a equipe de teste nao conseguiu assumir: ' || v_r::text); end if;
  v_p2 := public.dem_panorama(v_tok);
  if ((v_p2->'operacao'->>'na_fila')::int - (v_p1->'operacao'->>'na_fila')::int) <> -1
     or ((v_p2->'operacao'->>'em_execucao')::int - (v_p1->'operacao'->>'em_execucao')::int) <> 1
     or exists (select 1 from jsonb_array_elements(v_p2->'fila') x where (x->>'numero')::int = n1) then
    falhas := falhas || ('6: assumir nao tirou da fila e pos em execucao no panorama: '
      || (v_p1->>'operacao') || ' -> ' || (v_p2->>'operacao')); end if;
  if jsonb_array_length(v_p2->'carga') < 8
     and not exists (select 1 from jsonb_array_elements(v_p2->'carga') x
                      where x->>'nome' = 'CONF96 Equipe' and (x->>'com_ela')::int = 1) then
    falhas := falhas || '6: quem assumiu nao apareceu na carga'::text; end if;

  /* concluida sem confirmacao conta em "a confirmar"; confirmada, sai */
  v_r := public.dem_mover('CONF96RESP', n3, 'assumir', '{}'::jsonb);
  v_r := public.dem_mover('CONF96RESP', n3, 'concluir', '{"texto":"feito"}'::jsonb);
  if (v_r->>'ok') is distinct from 'true' then
    falhas := falhas || ('6: a equipe de teste nao conseguiu concluir: ' || v_r::text); end if;
  v_p3 := public.dem_panorama(v_tok);
  if ((v_p3->'operacao'->>'a_confirmar')::int - (v_p2->'operacao'->>'a_confirmar')::int) <> 1 then
    falhas := falhas || ('6: a concluida sem confirmacao nao entrou em "a confirmar": '
      || (v_p2->>'operacao') || ' -> ' || (v_p3->>'operacao')); end if;
  v_r := public.dem_mover('CONF96SOL', n3, 'validar', '{}'::jsonb);
  if (v_r->>'ok') is distinct from 'true'
     or ((public.dem_panorama(v_tok)->'operacao'->>'a_confirmar')::int) <> (v_p2->'operacao'->>'a_confirmar')::int then
    falhas := falhas || ('6: a confirmada continuou em "a confirmar": ' || v_r::text); end if;

  /* parada ha 8 dias conta; ha 6, nao (so onde da para mexer no relogio
     da demanda sem o gatilho: no harness, que roda como superusuario) */
  if v_super then
    perform set_config('session_replication_role', 'replica', true);
    update demandas.demandas set mexida_em = now() - interval '8 days' where numero = n1;
    update demandas.demandas set mexida_em = now() - interval '6 days' where numero = n2;
    perform set_config('session_replication_role', 'origin', true);
    if ((public.dem_panorama(v_tok)->'operacao'->>'paradas')::int
        - (v_p2->'operacao'->>'paradas')::int) <> 1 then
      falhas := falhas || '6: a parada ha 8 dias nao contou, ou a de 6 contou'::text; end if;
    /* e o evento de 61 dias nao entra nos ultimos movimentos */
    perform set_config('session_replication_role', 'replica', true);
    update demandas.eventos set em = now() - interval '61 days'
     where demanda_id = (select id from demandas.demandas where numero = n2) and tipo = 'abertura';
    perform set_config('session_replication_role', 'origin', true);
    if exists (select 1 from jsonb_array_elements(public.dem_panorama(v_tok)->'recentes') x
                where (x->>'numero')::int = n2 and x->>'tipo' = 'abertura') then
      falhas := falhas || '6: um movimento de 61 dias entrou nos ultimos movimentos'::text; end if;
  end if;

  /* a que passa a esperar aprovacao tambem avisa a administracao */
  v_r := public.dem_mover('CONF96RESP', n1, 'travar',
           '{"motivo":"aprovacao","texto":"CONF96 precisa de compra"}'::jsonb);
  if (v_r->>'ok') is distinct from 'true' then
    falhas := falhas || ('6: a equipe de teste nao conseguiu travar por aprovacao: ' || v_r::text);
  elsif demandas.limpo(coalesce(v_adm.auth_email, v_adm.email)) is not null
        and not exists (select 1 from demandas.avisos a join demandas.demandas d on d.id = a.demanda_id
                         where d.numero = n1 and a.membro_id = v_adm.id and a.tipo = 'aprovar'
                           and a.nota = 'CONF96 precisa de compra') then
    falhas := falhas || '6: a demanda travada por aprovacao nao avisou a administracao, com o motivo'::text; end if;

  /* a que espera aprovacao, redirecionada para o setor da administracao por
     quem atende no outro setor: a equipe nova recebe o `nova`, e a
     administracao, que ja tem o `aprovar`, nao recebe o `nova` junto (R15B).
     So se ve com a administracao no setor que atende (a da conferencia). */
  insert into demandas.setores (nome, slug, atende) values ('CONF96 Fora', 'conf96-fora', true) returning id into s_fora;
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, prazo_padrao_dias)
    values ('CONF96 grupo', 'CONF96 compra fora', s_fora, true, 5) returning id into c_fora;
  insert into demandas.membros (nome, papel, setor_id, token, auth_email, telefone)
    values ('CONF96 Equipe fora', 'responsavel', s_fora, 'CONF96FORA', 'conf96.fora@exemplo.invalid', '5599960000006');
  v_r := public.dem_abrir('CONF96SOL', jsonb_build_object('titulo', 'CONF96 redirecionada',
           'descricao', 'x', 'categoria_id', c_fora, 'prazo', v_prazo));
  n4 := (v_r->>'numero')::int;
  v_r := public.dem_mover('CONF96FORA', n4, 'redirecionar', jsonb_build_object('setor', s_at));
  if (v_r->>'ok') is distinct from 'true' then
    falhas := falhas || ('6: a equipe de fora nao conseguiu redirecionar: ' || v_r::text);
  else
    if exists (select 1 from demandas.avisos a join demandas.demandas d on d.id = a.demanda_id
                where d.numero = n4 and a.membro_id = v_adm.id and a.tipo = 'nova') then
      falhas := falhas || '6: a redirecionada que espera aprovacao mandou o aviso de demanda nova para a administracao'::text; end if;
    if not exists (select 1 from demandas.avisos a join demandas.demandas d on d.id = a.demanda_id
                    where d.numero = n4 and a.tipo = 'nova'
                      and a.membro_id = (select id from demandas.membros where token = 'CONF96RESP')) then
      falhas := falhas || '6: a equipe do setor novo nao soube da redirecionada'::text; end if;
  end if;

  /* o setor desativado com demanda viva continua no panorama, e diz que foi
     desativado: sem a linha, a soma por setor nao bate com "Em aberto" */
  update demandas.setores set ativo = false where id = s_at;
  if not exists (select 1 from jsonb_array_elements(public.dem_panorama(v_tok)->'setores') x
                  where x->>'nome' = 'CONF96 Atende' and x->>'ativo' = 'false' and (x->>'vivas')::int = 3) then
    falhas := falhas || '6: o setor desativado com demanda viva sumiu do panorama'::text; end if;
  update demandas.setores set ativo = true where id = s_at;

  /* nada de link, telefone ou e-mail, nem pelo nome da chave nem pelo valor
     (o da administracao de verdade incluido: o link dela e uma senha) */
  v_p3 := public.dem_panorama(v_tok);
  /* o que alguem DIGITOU (titulo, comentario, nota) pode conter um e-mail
     ou um telefone de proposito, e isso nao e vazamento do panorama: a
     conferencia do valor da administracao de verdade olha so os campos que
     o panorama monta, e nao o texto livre (R15B). A do CONF96 olha tudo,
     porque o texto do CONF96 e desta conferencia. */
  select jsonb_build_object(
      'operacao', v_p3->'operacao', 'setores', v_p3->'setores', 'pessoas', v_p3->'pessoas',
      'carga', v_p3->'carga',
      'aprovar', (select coalesce(jsonb_agg(x - array['titulo','texto','travada_nota','nota','descricao']), '[]'::jsonb)
                    from jsonb_array_elements(v_p3->'aprovar') x),
      'fila', (select coalesce(jsonb_agg(x - array['titulo','texto','travada_nota','nota','descricao']), '[]'::jsonb)
                 from jsonb_array_elements(v_p3->'fila') x),
      'recentes', (select coalesce(jsonb_agg(x - array['titulo','texto','de','para']), '[]'::jsonb)
                     from jsonb_array_elements(v_p3->'recentes') x))
    into v_estrutura;
  if jsonb_path_exists(v_p3, '$.** ? (exists (@.token) || exists (@.telefone) || exists (@.email) || exists (@.auth_email) || exists (@.contato))')
     or v_p3::text ~ 'CONF96(ADM|SOL|RESP|LID|MEM|PERD|FORA)|559996000000|exemplo\.invalid'
     or strpos(v_estrutura::text, v_tok) > 0
     or (v_adm.telefone is not null and strpos(v_estrutura::text, v_adm.telefone) > 0)
     or (demandas.limpo(v_adm.auth_email) is not null and strpos(lower(v_estrutura::text), lower(v_adm.auth_email)) > 0) then
    falhas := falhas || '6: o panorama carrega link pessoal, telefone ou e-mail'::text; end if;

  /* ---- 7 · nada fora das funcoes ---- */
  if exists (select 1 from pg_roles where rolname = 'anon') then
    if has_table_privilege('anon', 'demandas.membros', 'update')
       or has_table_privilege('anon', 'demandas.membros', 'select') then
      falhas := falhas || '7: anon alcanca a tabela de pessoas por fora'::text; end if;
  end if;
  if to_regprocedure('public.testar_porta_publica()') is not null then
    if exists (select 1 from public.testar_porta_publica() t where not t.passou) then
      falhas := falhas || format('7: o inventario da porta publica nao bate com o catalogo: %s',
        (select string_agg(t.caso || ' esperava ' || t.esperado || ', veio ' || t.obtido, ' ; ')
           from public.testar_porta_publica() t where not t.passou));
    end if;
  end if;

  /* ---- limpeza: o CONF96 sai (os avisos saem junto, em cascata), e a
         administracao de verdade fica como estava ---- */
  perform set_config('demandas.membro', '', true);
  delete from demandas.demandas where titulo like 'CONF96%';
  if v_criei then
    delete from demandas.membros where id = v_adm.id;
  end if;
  delete from demandas.membros where nome like 'CONF96%';
  delete from demandas.categorias where grupo like 'CONF96%';
  delete from demandas.setores where nome like 'CONF96%';
  if not v_criei and (select md5(x::text) from demandas.membros x where x.id = v_adm.id) is distinct from v_md5 then
    falhas := falhas || 'limpeza: a linha da administracao de verdade mudou'::text; end if;
  /* todo aviso que esta transacao criou tem `criado_em = now()` (o relogio da
     transacao), e os de outras sessoes nao: alem dos que ja havia antes da
     conferencia (`v_av0`), nenhum pode sobrar */
  if (select count(*) from demandas.avisos a where a.criado_em = now()) <> v_av0 then
    falhas := falhas || 'limpeza: sobrou aviso de e-mail das demandas de teste'::text; end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'96 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 96 · conferencia: 7 blocos. O banco nao aceita gestor nem segunda administracao, nem por fora das funcoes; dem_ajustar recusa com nome (SEM_GESTAO, ADMIN_UNICO, LOGIN_VAZIO, CONFIRMAR_LOGIN) e nao grava nada; a unica administracao nao se desfaz, nem pelo pedido nem pelo e-mail, e o proprio link novo volta para ela; Membro, Lider, Equipe e o pedido de papel continuam; o panorama e so da administracao, sem contato nem link, e as contas andam com as demandas; quem aprova recebe o aviso, e so ela; e nada fora das funcoes.';
end $conf$;

/* a sonda: se um arquivo antigo reescrever as portas por cima desta, a regua
   diz SUMIU em vez de a segunda administracao voltar em silencio */
do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (96, '96 · dem_ajustar recusa a gestao', 'dem_ajustar', 'SEM_GESTAO'),
      (96, '96 · dem_ajustar recusa a segunda administracao', 'dem_ajustar', 'ADMIN_UNICO'),
      (96, '96 · a administracao nao perde o e-mail de entrar', 'dem_ajustar', 'CONFIRMAR_LOGIN'),
      (96, '96 · o panorama e so da administracao', 'dem_panorama', 'SO_ADMIN'),
      /* `schema_versao_conferir` (73) so procura funcoes em `public`: a
         sonda do aviso fica na funcao publica que a 96 mudou para ele, e
         nao em `fn_enfileirar_aviso`, que mora em `demandas` (R15B) */
      (96, '96 · o e-mail de aprovar leva o valor', 'dem_avisos_pendentes', '''orcamento''')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
    delete from public.schema_sonda where n = 96 and alvo = 'fn_enfileirar_aviso';
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (96, '96-uma-pessoa-controla-tudo.sql')
  on conflict (n) do nothing;

commit;
