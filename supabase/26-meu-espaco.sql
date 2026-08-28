/* =============================================================================
   26 — MEU ESPAÇO  (Fase 6 da spec, §13 e §14)

   Hoje /eu/<token> mostra escala e disponibilidade, e nada mais. A §13 é
   explícita: depois de aprovado, o voluntário tem que ter um ambiente PRÓPRIO,
   radicalmente mais simples que o do líder, que responda "o que eu preciso
   fazer?" — não "onde estão todas as funcionalidades".

   `eu_dados` continua intacta: ela é o que a tela já usa e funciona. Esta é
   uma função NOVA, ao lado, com o que faltava. Trocar a que funciona no dia da
   campanha seria trocar de asa em pleno voo.

   Devolve tudo num round-trip só, porque a pessoa abre isso no celular, no
   corredor da igreja, com 3G ruim.

   O que NÃO devolve, de propósito: nada de outro voluntário além do primeiro
   nome de quem cobre (que `eu_quem_cobre` já entrega), e nada de nota interna
   da liderança. O token abre a página de UMA pessoa.
   ============================================================================= */

create or replace function eu_espaco(p_token text)
returns jsonb
language plpgsql security definer stable set search_path = public as $fn$
/* a variavel NAO pode se chamar `v`: dentro do select o alias da tabela e `v`
   tambem, e o PL/pgSQL resolve v.id para a variavel ainda vazia em vez da
   coluna. Erro silencioso ate a primeira chamada. */
declare eu record; v_funcoes jsonb; v_onb jsonb; v_prox jsonb; v_falta int;
begin
  select v.id, v.nome, v.telefone, v.email, v.conferido, v.ativo, v.limite_mes,
         v.criado_em, v.pin_hash is not null as tem_pin,
         e.id as equipe_id, e.nome as equipe, e.slug, coalesce(e.artigo,'o') as artigo,
         e.responsavel_nome, e.responsavel_whatsapp
    into eu
    from voluntarios v join equipes e on e.id = v.equipe_id
   where v.token = p_token and v.ativo;
  if not found then return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO'); end if;

  /* o que ela faz, e o que está VALENDO. `confirmado` é a diferença entre o
     que a pessoa declarou e o que a liderança conferiu — e o motor rebaixa
     titular não conferido para reserva. Ela tem o direito de saber disso. */
  select jsonb_agg(jsonb_build_object(
           'funcao', f.nome, 'nivel', h.nivel::text, 'conferido', h.confirmado,
           'descricao', coalesce(f.descricao, f.descricao_familia)
         ) order by f.ordem)
    into v_funcoes
    from habilidades h join funcoes f on f.id = h.funcao_id
   where h.voluntario_id = eu.id and f.ativa;

  /* primeiros passos: as etapas do ministério (ou as gerais) e o que já foi
     marcado como feito */
  select jsonb_agg(jsonb_build_object(
           'id', et.id, 'titulo', et.titulo, 'descricao', et.descricao,
           'feito', fe.voluntario_id is not null
         ) order by et.ordem)
    into v_onb
    from onboarding_etapas et
    left join onboarding_feito fe on fe.etapa_id = et.id and fe.voluntario_id = eu.id
   where et.ativa and (et.equipe_id is null or et.equipe_id = eu.equipe_id);

  /* o próximo serviço: a §14 abre com isso, porque é a pergunta do dia */
  select jsonb_build_object('data', c.data, 'funcao', f.nome, 'status', x.status::text)
    into v_prox
    from escalacoes x
    join cultos  c on c.id = x.culto_id
    join funcoes f on f.id = x.funcao_id
   where x.voluntario_id = eu.id and c.data >= current_date and x.status <> 'recusado'
   order by c.data limit 1;

  /* quantos domingos à frente ela ainda não respondeu: é o que trava a escala */
  select count(*) into v_falta
    from cultos c
   where c.data >= current_date and c.data < current_date + 60
     and not exists (select 1 from disponibilidade d
                      where d.voluntario_id = eu.id and d.data = c.data)
     and not exists (select 1 from indisponibilidades i
                      where i.voluntario_id = eu.id and i.data = c.data);

  return jsonb_build_object(
    'ok', true,
    'nome', eu.nome, 'telefone', eu.telefone, 'email', eu.email,
    'equipe', eu.equipe, 'equipe_slug', eu.slug, 'artigo', eu.artigo,
    'conferido', eu.conferido, 'tem_pin', eu.tem_pin,
    'desde', eu.criado_em, 'teto_mes', eu.limite_mes,
    'funcoes', coalesce(v_funcoes, '[]'::jsonb),
    'onboarding', coalesce(v_onb, '[]'::jsonb),
    'proximo', v_prox,
    'dias_sem_responder', v_falta,
    'responsavel', eu.responsavel_nome,
    'whatsapp', eu.responsavel_whatsapp);
end $fn$;

revoke all on function eu_espaco(text) from public;
grant execute on function eu_espaco(text) to anon, authenticated;

comment on function eu_espaco(text) is
  'tudo que a pagina do voluntario precisa, num round-trip. Nao devolve dado de outro voluntario nem nota interna da lideranca.';


/* -------------------------------------------------------------------------
   A pessoa marca os próprios primeiros passos. É dela o caminho — obrigar a
   liderança a marcar transformaria o onboarding em mais uma fila para o líder
   olhar, e fila que ninguém olha é o que já mata a conferência hoje.
   ------------------------------------------------------------------------- */
create or replace function eu_marcar_passo(p_token text, p_etapa uuid, p_feito boolean)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_eq uuid;
begin
  select v.id, v.equipe_id into v_id, v_eq
    from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO'); end if;

  /* só etapa que vale para o ministério dela: sem isso, um token qualquer
     marcaria etapa de outro time trocando o uuid na chamada. */
  if not exists (select 1 from onboarding_etapas et
                  where et.id = p_etapa and et.ativa
                    and (et.equipe_id is null or et.equipe_id = v_eq)) then
    return jsonb_build_object('ok', false, 'erro', 'ETAPA_INVALIDA');
  end if;

  if p_feito then
    insert into onboarding_feito (voluntario_id, etapa_id, por)
         values (v_id, p_etapa, 'a própria pessoa')
      on conflict (voluntario_id, etapa_id) do nothing;
  else
    delete from onboarding_feito where voluntario_id = v_id and etapa_id = p_etapa;
  end if;
  return jsonb_build_object('ok', true);
end $fn$;

revoke all on function eu_marcar_passo(text, uuid, boolean) from public;
grant execute on function eu_marcar_passo(text, uuid, boolean) to anon, authenticated;
