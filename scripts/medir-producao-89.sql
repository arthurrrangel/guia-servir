/* =============================================================================
   O TAMANHO DO ESTRAGO, ANTES DE ESCREVER O CONSERTO — 21/09/2026

   A terceira auditoria achou que a 88 aperta `limpo()` e `url_boa()` sem olhar
   para as linhas que JA ESTAO no banco. Apertar uma regra sobre acervo antigo
   congela linha viva: a CHECK `not valid` nao reprova o que ja existe, mas
   reprova TODO update daquela linha — e `dem_mover` sempre escreve `mexida_em`,
   entao ate "comentar" passa a ser recusado, com o texto cru do Postgres
   chegando na tela.

   Este arquivo NAO MUDA NADA. Ele conta. A migracao 89 e escrita a partir
   destes numeros, e nao de suposicao.
   ============================================================================= */
select
  /* 1 · titulo que sobrevive a 88 mas nao sobreviveria a uma classe maior.
         Medido com a classe Cf INTEIRA, que e o que a 89 vai usar. */
  (select count(*) from demandas.demandas
    where coalesce(length(demandas.limpo(titulo)), 0) not between 3 and 200) as titulo_ja_fora,
  (select count(*) from demandas.demandas
    where length(regexp_replace(coalesce(titulo,''),
      '[[:space:]' || chr(133)||chr(160)||chr(173)||chr(847)||chr(1564)||
      chr(4447)||chr(4448)||chr(5760)||chr(6158)||
      chr(8192)||'-'||chr(8207)||chr(8232)||chr(8233)||chr(8234)||'-'||chr(8238)||
      chr(8239)||chr(8287)||chr(8288)||'-'||chr(8292)||chr(8294)||'-'||chr(8303)||
      chr(10240)||chr(12288)||chr(12644)||chr(65279)||chr(65440)||
      chr(65024)||'-'||chr(65039)||chr(65529)||'-'||chr(65531)||
      chr(917505)||chr(917536)||'-'||chr(917631)||']', '', 'g')) < 3) as titulo_cairia_com_cf,

  /* 2 · descricao no mesmo exercicio (minimo 1) */
  (select count(*) from demandas.demandas
    where length(regexp_replace(coalesce(descricao,''),
      '[[:space:]' || chr(133)||chr(160)||chr(173)||chr(847)||chr(1564)||
      chr(8192)||'-'||chr(8207)||chr(8234)||'-'||chr(8238)||
      chr(8288)||'-'||chr(8292)||chr(8294)||'-'||chr(8303)||
      chr(10240)||chr(12288)||chr(12644)||chr(65279)||']', '', 'g')) < 1) as descricao_cairia,

  /* 3 · anexo vivo cuja url nao passa hoje, e o host vazio que a 88 deixou
         entrar por `url_boa` devolver NULO */
  (select count(*) from demandas.anexos
    where removido_em is null and not coalesce(demandas.url_boa(url), false)) as anexo_vivo_ruim,
  (select count(*) from demandas.anexos
    where demandas.url_boa(url) is null) as anexo_url_boa_nula,
  (select count(*) from demandas.anexos
    where removido_em is null and coalesce(demandas.url_host(url),'') = '') as anexo_sem_host,

  /* 4 · o veredito do portao que sai NULO onde deveria sair `false` */
  (select count(*) from demandas.demandas d
    where demandas.falta_aprovacao(d) is null) as veredito_nulo,
  (select count(*) from demandas.demandas) as demandas_total,

  /* 5 · nome vazio nas tabelas que a 88 nao olhou */
  (select count(*) from demandas.setores    where demandas.limpo(nome) is null) as setor_sem_nome,
  (select count(*) from demandas.categorias where demandas.limpo(nome) is null
                                                or demandas.limpo(grupo) is null) as categoria_sem_nome,
  (select count(*) from demandas.membros    where demandas.limpo(nome) is null) as membro_sem_nome,

  /* 6 · a linha em que `por_mes` discorda de `total`: instante cujo mes no Rio
         nao e o mes no fuso da sessao */
  (select count(*) from demandas.demandas
    where to_char(criada_em, 'YYYY-MM') <> to_char(demandas.dia(criada_em), 'YYYY-MM')) as mes_discorda,
  current_setting('TimeZone') as fuso_da_sessao,

  /* 7 · host legitimo que a regra de rotulo da 88 passou a recusar */
  (select count(*) from demandas.anexos
    where removido_em is null
      and coalesce(demandas.url_boa(url), false) = false
      and demandas.url_host(url) ~ '\.[a-z]{2,}$') as host_legitimo_recusado,

  'MEDIDO' as marca;
