/* =============================================================================
   02 — RECUPERADA DO BANCO (não do histórico)

   Estas duas funções existem em produção desde o começo de agosto e NUNCA
   estiveram no SQL versionado. A auditoria de 26/08 achou o buraco: o
   repositório não era o banco, e qualquer migração grande estaria sendo escrita
   no escuro — `eu_quem_cobre` é chamada em app/eu/[token]/page.tsx e não existia
   em arquivo nenhum.

   O corpo abaixo foi extraído do próprio banco com pg_get_functiondef, então é
   o que está rodando, não uma reconstrução de memória.
   ============================================================================= */

CREATE OR REPLACE FUNCTION public.eu_quem_cobre(p_token text, p_culto_id uuid)
 RETURNS TABLE(nome text, telefone text, nivel text, disse_que_pode boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_eq uuid; v_fn uuid; v_data date;
begin
  select v.id, v.equipe_id into v_id, v_eq
    from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  select c.data into v_data from cultos c where c.id = p_culto_id;
  if v_data is null then return; end if;

  /* a vaga que ESTA pessoa deixou neste domingo */
  select e.funcao_id into v_fn
    from escalacoes e join funcoes f on f.id = e.funcao_id
   where e.culto_id = p_culto_id and e.voluntario_id = v_id
     and f.equipe_id = v_eq and e.status in ('recusado','furou')
   limit 1;
  if v_fn is null then return; end if;

  return query
  select v.nome, v.telefone, h.nivel::text,
         exists (select 1 from disponibilidade d
                  where d.voluntario_id = v.id and d.data = v_data and d.pode)
    from voluntarios v
    join habilidades h on h.voluntario_id = v.id and h.funcao_id = v_fn
   where v.equipe_id = v_eq and v.ativo and v.id <> v_id
     and h.nivel in ('titular','reserva')          -- aprendiz não cobre buraco
     and nullif(v.telefone,'') is not null
     /* fora quem avisou que não pode neste domingo */
     and not exists (select 1 from indisponibilidades i
                      where i.voluntario_id = v.id and i.data = v_data)
     /* fora quem já está escalado em outra função no mesmo domingo */
     and not exists (select 1 from escalacoes e2
                      join funcoes f2 on f2.id = e2.funcao_id and f2.simultanea
                     where e2.culto_id = p_culto_id and e2.voluntario_id = v.id
                       and e2.status <> 'recusado')
   order by exists (select 1 from disponibilidade d
                     where d.voluntario_id = v.id and d.data = v_data and d.pode) desc,
            (h.nivel = 'titular') desc, v.nome
   limit 3;
end $function$
;

$function$;

CREATE OR REPLACE FUNCTION public.tel_norm(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select nullif(right(regexp_replace(coalesce(t,''),'\D','','g'), 11), '');
$function$;
