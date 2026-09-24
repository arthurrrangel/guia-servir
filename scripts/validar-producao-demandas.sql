/* =============================================================================
   VALIDACAO DE PRODUCAO — SISTEMA DE DEMANDAS
   21/09/2026

   "A MIGRACAO RODOU" NAO E "O COMPORTAMENTO ESTA CERTO".

   A conferencia de cada migracao roda no momento em que ela e aplicada, com a
   fixture dela. Este arquivo roda DEPOIS, no banco que esta no ar, e tenta
   FURAR cada guarda nova pela porta publica — as mesmas funcoes que o
   celular da igreja chama.

   Ele monta a propria fixture, ataca, limpa o que criou E TERMINA EM
   ROLLBACK. Os dois: a limpeza explicita existe porque depender so do
   rollback e depender de o editor nao ter partido a transacao no meio.

   O QUE ELE NAO TOCA: nenhuma demanda, membro, setor ou categoria que ja
   existia. Tudo que ele cria tem sufixo `-x9` ou grupo `VAL`.

   Rode e leia as duas saidas: o NOTICE do bloco e a linha de contagens.

   ATE A 95. A fixture daqui cria uma GESTORA ('VAL Ges') para aprovar, e a
   migracao 96 (24/09/2026) tirou o papel do banco: depois dela o primeiro
   `insert` deste arquivo morre em `ck_papel`, e a transacao inteira volta
   atras sem mexer em nada. Quem aprova agora e so a administracao, e ela e
   uma pessoa so: uma fixture nao pode criar outra. O que a 96 mudou e
   conferido em producao pela conferencia da propria 96 (bloco `$conf$`), com
   a administracao de verdade e sem gravar nada fora do CONF96.
   ============================================================================= */
begin;
do $v$
declare
  achados text[] := '{}';
  v_set uuid; v_set2 uuid; v_cat uuid; v_catx uuid;
  v_ana uuid; v_bia uuid; v_ges uuid; v_eva uuid;
  r jsonb; n int; v_st text; v_ap text; v_resp uuid; v_q int; v_ch text; base jsonb;
begin
  insert into demandas.setores (nome, slug, ativo, atende, ordem)
    values ('VAL setor', 'val-setor-x9', true, true, 99) returning id into v_set;
  insert into demandas.setores (nome, slug, ativo, atende, ordem)
    values ('VAL fora', 'val-fora-x9', true, true, 99) returning id into v_set2;
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, exige_orcamento, ativa)
    values ('VAL', 'livre', v_set, false, false, true) returning id into v_cat;
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, exige_orcamento, ativa)
    values ('VAL', 'exige', v_set, true, true, true) returning id into v_catx;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('VAL Ana', 'val-ana-x9', 'responsavel', v_set, true) returning id into v_ana;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('VAL Bia', 'val-bia-x9', 'responsavel', v_set, true) returning id into v_bia;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('VAL Ges', 'val-ges-x9', 'gestor', v_set, true) returning id into v_ges;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('VAL Eva', 'val-eva-x9', 'solicitante', v_set, true) returning id into v_eva;
  insert into demandas.membros (nome, token, papel, setor_id, ativo)
    values ('VAL Bru', 'val-bru-x9', 'responsavel', v_set2, true);

  base := jsonb_build_object('descricao','Validacao de producao 21/09.',
            'setor_solicitante', v_set, 'categoria_id', v_cat,
            'prazo', (demandas.hoje() + 20)::text);

  /* 1 · o portao le a categoria AGORA */
  r := public.dem_abrir('val-ana-x9', base || '{"titulo":"Compra que escapava"}'::jsonb);
  n := (r->>'numero')::int;
  update demandas.categorias set exige_aprovacao = true where id = v_cat;
  r := public.dem_mover('val-ana-x9', n, 'concluir', '{"texto":"comprado"}'::jsonb);
  if coalesce((r->>'ok')::boolean,false) then achados := achados || '1 O PORTAO NAO EXISTE: concluiu sem aprovacao'::text; end if;
  select status, aprovacao into v_st, v_ap from demandas.demandas where numero = n;
  if v_ap <> 'pendente' or v_st <> 'travada' then achados := achados || format('1 a cura nao gravou: %s/%s', v_st, v_ap); end if;
  r := public.dem_mover('val-ges-x9', n, 'aprovar', '{"texto":"ok"}'::jsonb);
  if not coalesce((r->>'ok')::boolean,false) then achados := achados || format('1 IMPASSE: gestor nao aprova: %s', r::text); end if;
  update demandas.categorias set exige_aprovacao = false where id = v_cat;

  /* 2 · espaco nao passa por texto, nas funcoes e nas CHECKs */
  for v_ch in select unnest(array[chr(9), chr(10), chr(160), chr(8203), chr(65279), chr(12288)]) loop
    r := public.dem_mover('val-ana-x9', n, 'concluir', jsonb_build_object('texto', v_ch));
    if coalesce((r->>'ok')::boolean,false) then achados := achados || format('2 concluiu com U+%s', to_hex(ascii(v_ch))); end if;
  end loop;
  begin
    update demandas.demandas set status='concluida', conclusao=chr(160) where numero = n;
    achados := achados || '2 ck_conclusao aceitou NBSP por SQL direto'::text;
  exception when check_violation then null; end;

  /* 3 · travar nao desfaz aprovacao de quem nao decide */
  r := public.dem_abrir('val-ana-x9', base || jsonb_build_object('titulo','Buffet','categoria_id',v_catx,'orcamento','1200'));
  n := (r->>'numero')::int;
  perform public.dem_mover('val-ges-x9', n, 'aprovar', '{"texto":"ok"}'::jsonb);
  r := public.dem_mover('val-ana-x9', n, 'travar', '{"motivo":"aprovacao","texto":"quero rever"}'::jsonb);
  if coalesce((r->>'ok')::boolean,false) then achados := achados || '3 quem atende desfez a decisao do gestor'::text; end if;

  /* 4 · assumir nao rouba */
  r := public.dem_abrir('val-ana-x9', base || '{"titulo":"Disputa"}'::jsonb);
  n := (r->>'numero')::int;
  perform public.dem_mover('val-ana-x9', n, 'assumir', '{}'::jsonb);
  r := public.dem_mover('val-bia-x9', n, 'assumir', '{}'::jsonb);
  if coalesce((r->>'ok')::boolean,false) then achados := achados || '4 a segunda pessoa roubou a demanda'::text; end if;

  /* 5 · anexo: dono, url e teto */
  r := public.dem_mover('val-eva-x9', n, 'anexar', '{"url":"https://evil.example/b.pdf","nome":"boleto"}'::jsonb);
  if coalesce((r->>'ok')::boolean,false) then achados := achados || '5 solicitante pregou anexo em demanda alheia'::text; end if;
  for v_ch in select unnest(array['http://192.168.0.1/admin','https://usuario:senha@evil.example/x','javascript:alert(1)','https://localhost/x.pdf']) loop
    r := public.dem_mover('val-ana-x9', n, 'anexar', jsonb_build_object('url', v_ch, 'nome','x'));
    if coalesce((r->>'ok')::boolean,false) then achados := achados || format('5 aceitou url %s', v_ch); end if;
  end loop;
  r := public.dem_mover('val-ana-x9', n, 'anexar', '{"url":"https://drive.google.com/file/d/X/view","nome":"orcamento"}'::jsonb);
  if not coalesce((r->>'ok')::boolean,false) then achados := achados || format('5 recusou um link bom: %s', r::text); end if;
  select a.nome into v_ch from demandas.anexos a join demandas.demandas d on d.id=a.demanda_id
   where d.numero = n and a.url like '%file/d/X%';
  if position('drive.google.com' in coalesce(v_ch,'')) = 0 then achados := achados || format('5 o rotulo nao diz o destino: %s', coalesce(v_ch,'<nulo>')); end if;

  /* 6 · casts cegos */
  for v_ch in select unnest(array['{"categoria_id":"x"}','{"prazo":"amanha"}','{"orcamento":"mil"}']) loop
    begin
      r := public.dem_abrir('val-ana-x9', base || v_ch::jsonb);
      if coalesce(r->>'regra','') ~* 'invalid input syntax' then achados := achados || format('6 vazou erro cru: %s', v_ch); end if;
    exception when others then achados := achados || format('6 LEVANTOU em %s: %s', v_ch, SQLERRM); end;
  end loop;

  /* 7 · a lista: atrasada primeiro, aba fechada, curinga e texto */
  r := public.dem_lista('val-ana-x9','{"aba":"inventada"}'::jsonb);
  if coalesce((r->>'ok')::boolean,false) then achados := achados || '7 aba desconhecida falhou ABERTO'::text; end if;
  if (public.dem_lista('val-ana-x9','{"busca":"%"}'::jsonb)->>'total')::int
     = (public.dem_lista('val-ana-x9','{}'::jsonb)->>'total')::int
     and (public.dem_lista('val-ana-x9','{}'::jsonb)->>'total')::int > 0 then
    achados := achados || '7 busca "%" devolveu tudo'::text;
  end if;
  begin
    r := public.dem_lista('val-ana-x9','{"setor":"x"}'::jsonb);
    if coalesce((r->>'ok')::boolean,false) then achados := achados || '7 setor invalido aceito'::text; end if;
  exception when others then achados := achados || format('7 dem_lista LEVANTOU P0001: %s', SQLERRM); end;

  /* 8 · hoje() e o Rio */
  if demandas.hoje() <> (now() at time zone 'America/Sao_Paulo')::date then
    achados := achados || '8 hoje() nao e o dia do Rio'::text; end if;

  /* limpa a fixture antes do rollback, para nao depender so dele */
  delete from demandas.eventos where demanda_id in (select id from demandas.demandas where setor_solicitante in (v_set,v_set2));
  delete from demandas.anexos  where demanda_id in (select id from demandas.demandas where setor_solicitante in (v_set,v_set2));
  delete from demandas.demandas where setor_solicitante in (v_set,v_set2);
  delete from demandas.membros where token like 'val-%-x9';
  delete from demandas.categorias where grupo = 'VAL';
  delete from demandas.setores where slug in ('val-setor-x9','val-fora-x9');

  if array_length(achados,1) > 0 then
    raise exception E'PRODUCAO REPROVOU:\n  - %', array_to_string(achados, E'\n  - ');
  end if;
  raise notice 'PRODUCAO OK: 8 blocos.';
end $v$;
rollback;

select (select max(n) from public.schema_versao) as versao,
       (select count(*) from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
         where ns.nspname='demandas' and p.proname in
           ('limpo','falta_aprovacao','hoje','atrasada','como_texto','url_boa','url_host','url_autoridade','rotulo_do_anexo')) as funcoes_novas_9,
       (select count(*) from demandas.demandas d join demandas.categorias c on c.id=d.categoria_id
         where d.aprovacao is null and c.exige_aprovacao and d.status not in ('concluida','cancelada')) as fora_do_portao,
       (select count(*) from demandas.demandas
         where travada_nota = 'A categoria passou a exigir aprovacao depois que esta demanda foi aberta.') as curadas,
       (select count(*) from demandas.demandas
         where (status='concluida' and demandas.limpo(conclusao) is null)
            or (status='cancelada' and demandas.limpo(cancelada_motivo) is null)) as fechadas_sem_texto,
       (select count(*) from demandas.anexos where not demandas.url_boa(url)) as anexos_fora_da_regra,
       (select count(*) from demandas.eventos where length(texto) > 4000) as eventos_gigantes,
       'VALIDADO' as marca;
