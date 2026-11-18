/* =============================================================================
   117 · O REENVIO DA FICHA NÃO APAGA O PREÇO

   18/11/2026. Duas famílias avisaram que não conseguiam pagar o Follow Camp:
   uma colou no banco o link da inscrição, achando que era o código ("Código
   fora do padrão Pix Copia e Cola"); a outra disse que "não aparece a chave
   Pix". Medido no painel: 7 fichas vivas sem valor ("a confirmar"), e a
   página pessoal não mostra Pix para ficha sem valor.

   DUAS CAUSAS
     · o 1º lote acabou em 03/11 sem 2º: a ficha NOVA saía do site sem valor.
       Isso é do código (lib/followcamp.ts, LOTES), e o Arthur decidiu em
       18/11: "R$ 697 até novo aviso".
     · a ficha REENVIADA (mesmo nome e mesmo nascimento) passava o valor de
       agora por cima do que tinha: reenviada depois de 03/11, perdia os R$ 697
       da inscrição. É o que esta migração corrige.

   O QUE PASSA A SER (fc27_ficha_gravar, na ficha repetida)
     · reenvio sem valor não apaga o valor da ficha;
     · ficha sem valor recebe o de agora;
     · com os dois, fica o MENOR: o preço não sobe porque a pessoa corrigiu um
       dado depois que o lote mudou, e o desconto de irmão informado no
       reenvio entra.

   E AS FICHAS QUE JÁ FICARAM SEM VALOR: as vivas, que vieram do site, recebem
   o preço do lote atual (R$ 697; com irmão, R$ 627,30), a mesma regra do site
   (valorDaFicha). Ficha lançada pela administração e ficha com valor não
   mudam.

   SEM `create temp table` (101). O EDITOR DO SUPABASE NÃO MOSTRA NOTICE: a
   última linha é um select com o resultado.

   ORDEM:  ... 115 → 116 → 117
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(117);
  end if;
  if to_regclass('public.schema_versao') is not null
     and not exists (select 1 from public.schema_versao where n = 116) then
    raise exception 'FALTA A 116: rode antes a 116 (o dress code do Louvor). Nada foi mudado.';
  end if;
end $tranca$;

begin;

-- =========================================================================
-- 1 · a ficha repetida guarda o valor que tinha
-- =========================================================================
create or replace function public.fc27_ficha_gravar(p jsonb)
returns jsonb language plpgsql security definer set search_path = followcamp, public as $fn$
declare v_id uuid; v_token text; v_repetida boolean := false;
begin
  /* `{"teste": true}` responde sem gravar: é como a rota sabe se o banco
     está pronto, sem criar ficha de mentira */
  if coalesce((p ->> 'teste')::boolean, false) then
    return jsonb_build_object('ok', true, 'teste', true);
  end if;

  select f.id into v_id from followcamp.fichas f
   where f.cancelada_em is null
     and followcamp.chave_nome(f.campista) = followcamp.chave_nome(p ->> 'campista')
     and f.nascimento = (p ->> 'nascimento')::date
   order by f.recebida_em desc
   limit 1
   for update;

  if v_id is not null then
    v_repetida := true;
    update followcamp.fichas set
      campista = followcamp.txt(p, 'campista', 80), idade = (p ->> 'idade')::int,
      sexo = followcamp.txt(p, 'sexo', 10), camisa = followcamp.txt(p, 'camisa', 10),
      whats_campista = followcamp.txt(p, 'whats_campista', 20),
      alergias = followcamp.txt(p, 'alergias', 500), saude = followcamp.txt(p, 'saude', 500),
      responsavel_nome = followcamp.txt(p, 'responsavel_nome', 80), responsavel_cpf = followcamp.txt(p, 'responsavel_cpf', 14),
      responsavel_whats = followcamp.txt(p, 'responsavel_whats', 20), parentesco = followcamp.txt(p, 'parentesco', 40),
      emergencia_nome = followcamp.txt(p, 'emergencia_nome', 80), emergencia_whats = followcamp.txt(p, 'emergencia_whats', 20),
      irmao = followcamp.txt(p, 'irmao', 80),
      /* 117: o reenvio nao apaga o valor que a ficha tinha; sem valor, recebe o de
         agora; com os dois, fica o menor (o preco nao sobe porque o lote mudou
         depois da inscricao, e o desconto de irmao informado no reenvio entra) */
      valor = case
        when nullif(p ->> 'valor', '') is null then valor
        when valor is null then (p ->> 'valor')::numeric
        else least(valor, (p ->> 'valor')::numeric)
      end,
      /* o plano escolhido continua; a forma só muda se a pessoa não tem plano */
      pagamento = case when parcelas is not null then pagamento else followcamp.txt(p, 'pagamento', 10) end,
      imagem = (p ->> 'imagem')::boolean, termo = followcamp.txt(p, 'termo', 4000),
      versao_termo = followcamp.txt(p, 'versao_termo', 40),
      atualizada_em = now()
     where id = v_id
    returning token into v_token;
  else
    insert into followcamp.fichas (origem, campista, nascimento, idade, sexo, camisa, whats_campista,
        alergias, saude, responsavel_nome, responsavel_cpf, responsavel_whats, parentesco,
        emergencia_nome, emergencia_whats, irmao, valor, pagamento, imagem, termo, versao_termo)
    values ('site',
        followcamp.txt(p, 'campista', 80), (p ->> 'nascimento')::date, (p ->> 'idade')::int,
        followcamp.txt(p, 'sexo', 10), followcamp.txt(p, 'camisa', 10), followcamp.txt(p, 'whats_campista', 20),
        followcamp.txt(p, 'alergias', 500), followcamp.txt(p, 'saude', 500),
        followcamp.txt(p, 'responsavel_nome', 80), followcamp.txt(p, 'responsavel_cpf', 14),
        followcamp.txt(p, 'responsavel_whats', 20), followcamp.txt(p, 'parentesco', 40),
        followcamp.txt(p, 'emergencia_nome', 80), followcamp.txt(p, 'emergencia_whats', 20),
        followcamp.txt(p, 'irmao', 80), (p ->> 'valor')::numeric, followcamp.txt(p, 'pagamento', 10),
        (p ->> 'imagem')::boolean, followcamp.txt(p, 'termo', 4000), followcamp.txt(p, 'versao_termo', 40))
    returning id, token into v_id, v_token;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'token', v_token, 'repetida', v_repetida);
end $fn$;
revoke all on function public.fc27_ficha_gravar(jsonb) from public;
do $g$ begin
  execute 'revoke all on function public.fc27_ficha_gravar(jsonb) from anon, authenticated';
  execute 'grant execute on function public.fc27_ficha_gravar(jsonb) to service_role';
exception when undefined_object then null;
end $g$;

-- =========================================================================
-- 2 · as fichas que já ficaram sem valor
-- =========================================================================
update followcamp.fichas
   set valor = case when nullif(btrim(coalesce(irmao, '')), '') is null then 697 else 627.30 end
 where cancelada_em is null and valor is null and origem = 'site';

-- =========================================================================
-- 3 · a conferência (cenário de teste, desfeito no fim)
-- =========================================================================
do $conf$
declare
  falhas text[] := '{}';
  r jsonb; v numeric; n int;
  base jsonb := jsonb_build_object(
    'campista', 'Conf Cento Dezessete Reenvio', 'nascimento', '2008-05-05', 'idade', 18,
    'sexo', 'feminino', 'camisa', 'M', 'whats_campista', '(21) 90000-1170',
    'emergencia_nome', 'Conf Contato', 'emergencia_whats', '(21) 90000-1171',
    'pagamento', 'carne', 'imagem', true, 'termo', 'conferencia 117', 'versao_termo', 'conf');
begin
  r := public.fc27_ficha_gravar(base || '{"valor": 697}');
  if (r ->> 'repetida') <> 'false' then falhas := falhas || ('a primeira ficha veio como repetida: ' || r::text); end if;

  r := public.fc27_ficha_gravar(base || '{"valor": null}');
  select valor into v from followcamp.fichas where id = (r ->> 'id')::uuid;
  if (r ->> 'repetida') <> 'true' then falhas := falhas || ('o reenvio virou outra ficha: ' || r::text); end if;
  if v is distinct from 697 then falhas := falhas || format('reenvio sem valor apagou o preco: ficou %s', coalesce(v::text, 'null')); end if;

  r := public.fc27_ficha_gravar(base || '{"valor": 797}');
  select valor into v from followcamp.fichas where id = (r ->> 'id')::uuid;
  if v is distinct from 697 then falhas := falhas || format('reenvio com lote mais caro subiu o preco: ficou %s', v); end if;

  r := public.fc27_ficha_gravar(base || '{"valor": 627.30, "irmao": "Conf Irmao"}');
  select valor into v from followcamp.fichas where id = (r ->> 'id')::uuid;
  if v is distinct from 627.30 then falhas := falhas || format('o desconto de irmao no reenvio nao entrou: ficou %s', v); end if;

  update followcamp.fichas set valor = null where id = (r ->> 'id')::uuid;
  r := public.fc27_ficha_gravar(base || '{"valor": 697}');
  select valor into v from followcamp.fichas where id = (r ->> 'id')::uuid;
  if v is distinct from 697 then falhas := falhas || format('ficha sem valor nao recebeu o de agora: ficou %s', coalesce(v::text, 'null')); end if;

  select count(*) into n from followcamp.fichas where followcamp.chave_nome(campista) = followcamp.chave_nome('Conf Cento Dezessete Reenvio');
  if n <> 1 then falhas := falhas || format('o cenario gravou %s fichas, e nao 1', n); end if;

  delete from followcamp.fichas where followcamp.chave_nome(campista) = followcamp.chave_nome('Conf Cento Dezessete Reenvio');
  if exists (select 1 from followcamp.fichas where followcamp.chave_nome(campista) like '%conf%cento dezessete%') then
    falhas := falhas || 'o cenario de teste ficou no banco'::text; end if;

  if exists (select 1 from followcamp.fichas where cancelada_em is null and valor is null and origem = 'site') then
    falhas := falhas || 'ficou ficha viva do site sem valor'::text; end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'117 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 117 · o reenvio guarda o preco. Cenario desfeito.';
end $conf$;

do $sonda$ begin
  if to_regclass('public.schema_sonda') is not null then
    insert into public.schema_sonda (n, caso, alvo, procura) values
      (117, '117 · o reenvio nao apaga o valor da ficha', 'fc27_ficha_gravar', 'least(valor')
    on conflict (n, caso) do update set alvo = excluded.alvo, procura = excluded.procura;
  end if;
end $sonda$;

insert into public.schema_versao (n, arquivo)
  values (117, '117-o-reenvio-da-ficha-nao-apaga-o-preco.sql')
  on conflict (n) do nothing;

commit;

notify pgrst, 'reload schema';

/* o que o editor mostra: só números */
select '117' as versao,
       (select count(*) from followcamp.fichas where cancelada_em is null) as fichas_vivas,
       (select count(*) from followcamp.fichas where cancelada_em is null and valor is null) as fichas_sem_valor,
       (select count(*) from testar_porta_publica() where not passou) as porta_reprovada,
       (select count(*) from schema_versao_conferir() where not passou) as sondas_reprovadas;
