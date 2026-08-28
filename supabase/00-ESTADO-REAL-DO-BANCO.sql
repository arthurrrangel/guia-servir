-- ===== FUNÇÕES =====
CREATE OR REPLACE FUNCTION public._tmp_get()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select string_agg(dados,'' order by i) from _tmp_arq; $function$
;

CREATE OR REPLACE FUNCTION public.conferir_habilidade(p_voluntario uuid, p_funcao uuid, p_nivel text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if p_nivel is null or p_nivel = '' then
    delete from habilidades where voluntario_id = p_voluntario and funcao_id = p_funcao;
  else
    insert into habilidades (voluntario_id, funcao_id, nivel, confirmado)
         values (p_voluntario, p_funcao, p_nivel::nivel_habilidade, true)
    on conflict (voluntario_id, funcao_id)
      do update set nivel = excluded.nivel, confirmado = true;
  end if;

  update voluntarios v set conferido = true
   where v.id = p_voluntario
     and not exists (select 1 from habilidades h
                      where h.voluntario_id = v.id and h.confirmado = false);
end $function$
;

CREATE OR REPLACE FUNCTION public.conferir_voluntario(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  update habilidades set confirmado = true where voluntario_id = p_id;
  update voluntarios set conferido = true where id = p_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.conflitos_entre_ministerios(p_de date DEFAULT CURRENT_DATE)
 RETURNS TABLE(data date, telefone text, pessoa text, ministerios text, postos text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.data,
         tel_norm(v.telefone) as telefone,
         min(v.nome) as pessoa,
         string_agg(distinct e.nome, ' + ' order by e.nome) as ministerios,
         string_agg(e.nome || ': ' || f.nome, ' | ' order by e.nome, f.nome) as postos
    from escalacoes x
    join cultos      c on c.id = x.culto_id
    join voluntarios v on v.id = x.voluntario_id
    join funcoes     f on f.id = x.funcao_id
    join equipes     e on e.id = f.equipe_id
   where c.data >= p_de
     and coalesce(length(tel_norm(v.telefone)), 0) >= 10
     and x.status <> 'recusado'
   group by c.data, tel_norm(v.telefone)
  having count(distinct f.equipe_id) > 1
   order by c.data, 3;
$function$
;

CREATE OR REPLACE FUNCTION public.equipe_entrar(p_slug text, p_voluntario uuid, p_ult4 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_tel text; v_tok text; v_n int; v_max constant int := 8;
begin
  select nullif(tel_norm(v.telefone),''), v.token into v_tel, v_tok
    from voluntarios v join equipes e on e.id = v.equipe_id
   where v.id = p_voluntario and e.slug = p_slug and v.ativo;

  if v_tok is null then return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO'); end if;
  if v_tel is null or length(v_tel) < 4 then
    return jsonb_build_object('ok', false, 'erro', 'SEM_TELEFONE');
  end if;

  /* NADA de raise aqui: a excecao desfaria o proprio contador e o freio de
     forca bruta nunca contaria nada. Erro vira resposta, nao excecao. */
  insert into entrar_tentativas (voluntario_id) values (p_voluntario)
  on conflict (voluntario_id, dia) do update set n = entrar_tentativas.n + 1
  returning n into v_n;

  if v_n > v_max then
    return jsonb_build_object('ok', false, 'erro', 'MUITAS_TENTATIVAS');
  end if;

  if right(v_tel, 4) <> tel_norm(coalesce(p_ult4,'')) then
    return jsonb_build_object('ok', false, 'erro', 'DIGITOS_NAO_CONFEREM',
                              'restam', greatest(v_max - v_n, 0));
  end if;

  delete from entrar_tentativas where voluntario_id = p_voluntario;
  return jsonb_build_object('ok', true, 'token', v_tok);
end $function$
;

CREATE OR REPLACE FUNCTION public.equipe_funcoes(p_slug text)
 RETURNS TABLE(nome text, ordem integer, tipos text[], relata boolean, descricao text, descricao_familia text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select f.nome, f.ordem, coalesce(f.tipos, array['domingo','follow']), f.relata,
         f.descricao, f.descricao_familia
    from funcoes f join equipes e on e.id = f.equipe_id
   where e.slug = p_slug and f.ativa
   order by f.ordem, f.nome;
$function$
;

CREATE OR REPLACE FUNCTION public.equipe_pin_criar(p_slug text, p_voluntario uuid, p_ult4 text, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_tel text; v_tok text; v_pin_atual text; v_n int; v_max constant int := 8;
begin
  if p_pin !~ '^[0-9]{4}$' then return jsonb_build_object('ok', false, 'erro', 'PIN_INVALIDO'); end if;

  select nullif(tel_norm(v.telefone),''), v.token, v.pin_hash
    into v_tel, v_tok, v_pin_atual
    from voluntarios v join equipes e on e.id = v.equipe_id
   where v.id = p_voluntario and e.slug = p_slug and v.ativo;

  if v_tok is null then return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO'); end if;
  if v_pin_atual is not null then return jsonb_build_object('ok', false, 'erro', 'JA_TEM_PIN'); end if;
  if v_tel is null or length(v_tel) < 4 then return jsonb_build_object('ok', false, 'erro', 'SEM_TELEFONE'); end if;

  insert into entrar_tentativas (voluntario_id) values (p_voluntario)
  on conflict (voluntario_id, dia) do update set n = entrar_tentativas.n + 1
  returning n into v_n;
  if v_n > v_max then return jsonb_build_object('ok', false, 'erro', 'MUITAS_TENTATIVAS'); end if;

  if right(v_tel, 4) <> tel_norm(coalesce(p_ult4,'')) then
    return jsonb_build_object('ok', false, 'erro', 'DIGITOS_NAO_CONFEREM', 'restam', greatest(v_max - v_n, 0));
  end if;

  update voluntarios set pin_hash = encode(extensions.digest(p_pin || v_tok, 'sha256'), 'hex') where id = p_voluntario;
  delete from entrar_tentativas where voluntario_id = p_voluntario;
  return jsonb_build_object('ok', true, 'token', v_tok);
end $function$
;

CREATE OR REPLACE FUNCTION public.equipe_pin_entrar(p_slug text, p_voluntario uuid, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_tok text; v_hash text; v_n int; v_max constant int := 8;
begin
  select v.token, v.pin_hash into v_tok, v_hash
    from voluntarios v join equipes e on e.id = v.equipe_id
   where v.id = p_voluntario and e.slug = p_slug and v.ativo;

  if v_tok is null then return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO'); end if;
  if v_hash is null then return jsonb_build_object('ok', false, 'erro', 'SEM_PIN'); end if;

  insert into entrar_tentativas (voluntario_id) values (p_voluntario)
  on conflict (voluntario_id, dia) do update set n = entrar_tentativas.n + 1
  returning n into v_n;
  if v_n > v_max then return jsonb_build_object('ok', false, 'erro', 'MUITAS_TENTATIVAS'); end if;

  if v_hash <> encode(extensions.digest(coalesce(p_pin,'') || v_tok, 'sha256'), 'hex') then
    return jsonb_build_object('ok', false, 'erro', 'PIN_NAO_CONFERE', 'restam', greatest(v_max - v_n, 0));
  end if;

  delete from entrar_tentativas where voluntario_id = p_voluntario;
  return jsonb_build_object('ok', true, 'token', v_tok);
end $function$
;

CREATE OR REPLACE FUNCTION public.equipe_publica(p_slug text)
 RETURNS TABLE(equipe text, voluntario_id uuid, primeiro_nome text, precisa_link boolean, sem_niveis boolean, aviso_cadastro text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.nome, v.id, split_part(v.nome, ' ', 1),
         coalesce(length(nullif(tel_norm(v.telefone), '')), 0) < 4,
         e.sem_niveis, e.aviso_cadastro
    from equipes e
    left join voluntarios v on v.equipe_id = e.id and v.ativo
   where e.slug = p_slug
   order by v.nome;
$function$
;

CREATE OR REPLACE FUNCTION public.equipe_time(p_slug text)
 RETURNS TABLE(area text, ordem integer, voluntario_id uuid, primeiro_nome text, nivel text, tem_pin boolean, tem_tel boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select f.nome, f.ordem, v.id,
         split_part(btrim(v.nome), ' ', 1),
         h.nivel::text,
         v.pin_hash is not null,
         nullif(tel_norm(v.telefone),'') is not null
    from voluntarios v
    join equipes e on e.id = v.equipe_id and e.slug = p_slug
    join habilidades h on h.voluntario_id = v.id
    join funcoes f on f.id = h.funcao_id and f.ativa
   where v.ativo
   order by f.ordem, v.nome;
$function$
;

CREATE OR REPLACE FUNCTION public.eu_dados(p_token text)
 RETURNS TABLE(nome text, equipe text, escalas jsonb, indisponivel jsonb, disponivel jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_nome text; v_eq uuid; v_eqnome text;
begin
  select v.id, v.nome, v.equipe_id into v_id, v_nome, v_eq
    from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;
  select e.nome into v_eqnome from equipes e where e.id = v_eq;

  return query select v_nome, coalesce(v_eqnome,'Escala'),
    coalesce((select jsonb_agg(x order by x->>'data') from (
        select jsonb_build_object('culto_id',c.id,'data',c.data,'funcao',f.nome,'status',e.status,
                 'primeira_vez',e.primeira_vez,
                 'obs',(select o.obs from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'relata', f.relata,
                 'relatorio',(select o.relatorio from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'problemas',(select o.problemas from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'plantao',false) as x
          from escalacoes e join cultos c on c.id=e.culto_id join funcoes f on f.id=e.funcao_id
         where e.voluntario_id = v_id and c.data >= current_date - 1
        union all
        select jsonb_build_object('culto_id',c.id,'data',c.data,'funcao','PLANTAO','status','pendente',
                 'primeira_vez',false,
                 'obs',(select o.obs from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'relata', false, 'relatorio', null, 'problemas', null,
                 'plantao',true)
          from plantoes p join cultos c on c.id=p.culto_id
         where p.voluntario_id = v_id and c.data >= current_date - 1) t), '[]'::jsonb),
    coalesce((select jsonb_agg(i.data order by i.data) from indisponibilidades i
               where i.voluntario_id = v_id and i.data >= current_date), '[]'::jsonb),
    coalesce((select jsonb_agg(d.data order by d.data) from disponibilidade d
               where d.voluntario_id = v_id and d.pode = true and d.data >= current_date), '[]'::jsonb);
end $function$
;

CREATE OR REPLACE FUNCTION public.eu_disponibilidade(p_token text, p_data date, p_resposta text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  select id into v_id from voluntarios where token = p_token and ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  if p_resposta = 'posso' then
    insert into disponibilidade (voluntario_id, data, pode) values (v_id, p_data, true)
      on conflict (voluntario_id, data) do update set pode = true, respondido_em = now();
    delete from indisponibilidades where voluntario_id = v_id and data = p_data;
  elsif p_resposta = 'nao' then
    insert into disponibilidade (voluntario_id, data, pode) values (v_id, p_data, false)
      on conflict (voluntario_id, data) do update set pode = false, respondido_em = now();
    insert into indisponibilidades (voluntario_id, data) values (v_id, p_data)
      on conflict (voluntario_id, data) do nothing;
  else
    delete from disponibilidade where voluntario_id = v_id and data = p_data;
    delete from indisponibilidades where voluntario_id = v_id and data = p_data;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.eu_indisponibilidade(p_token text, p_data date, p_marcar boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  select id into v_id from voluntarios where token = p_token and ativo;
  if v_id is null then raise exception 'Link invalido'; end if;
  if p_marcar then
    insert into indisponibilidades (voluntario_id, data) values (v_id, p_data) on conflict do nothing;
    update escalacoes e set status = 'recusado', respondido_em = now()
      from cultos c where c.id = e.culto_id and c.data = p_data
       and e.voluntario_id = v_id and e.status <> 'furou';
  else
    delete from indisponibilidades where voluntario_id = v_id and data = p_data;
    update escalacoes e set status = 'pendente', respondido_em = null
      from cultos c where c.id = e.culto_id and c.data = p_data
       and e.voluntario_id = v_id and e.status = 'recusado';
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.eu_proximos_domingos()
 RETURNS TABLE(data date)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select d::date from generate_series(current_date, current_date + 60, '1 day') d
   where extract(dow from d) = 0
      or (extract(dow from d) = 6 and extract(day from d) > 7);
$function$
;

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

CREATE OR REPLACE FUNCTION public.eu_relatorio(p_token text, p_culto_id uuid, p_texto text, p_problemas text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_eq uuid;
begin
  select v.id, v.equipe_id into v_id, v_eq
    from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  /* só quem estava REALMENTE escalado num posto de relato naquele domingo.
     Sem isso qualquer token válido escreveria o relatório de qualquer culto. */
  if not exists (
    select 1 from escalacoes e join funcoes f on f.id = e.funcao_id
     where e.culto_id = p_culto_id and e.voluntario_id = v_id and f.relata
  ) then raise exception 'Voce nao e o lider deste culto'; end if;

  insert into culto_obs (culto_id, equipe_id, obs, relatorio, problemas, relatado_por, relatado_em)
       values (p_culto_id, v_eq, '', nullif(btrim(coalesce(p_texto,'')), ''),
               nullif(btrim(coalesce(p_problemas,'')), ''), v_id, now())
  on conflict (culto_id, equipe_id) do update
     set relatorio = excluded.relatorio, problemas = excluded.problemas,
         relatado_por = excluded.relatado_por, relatado_em = excluded.relatado_em;
end $function$
;

CREATE OR REPLACE FUNCTION public.eu_responder(p_token text, p_culto_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_data date;
begin
  if p_status not in ('confirmado','recusado') then raise exception 'Resposta invalida'; end if;
  select id into v_id from voluntarios where token = p_token and ativo;
  if v_id is null then raise exception 'Link invalido'; end if;
  select data into v_data from cultos where id = p_culto_id;
  if p_status = 'confirmado' then
    delete from indisponibilidades where voluntario_id = v_id and data = v_data;
  end if;
  update escalacoes set status = p_status::status_escala, respondido_em = now()
   where culto_id = p_culto_id and voluntario_id = v_id;
  if p_status = 'recusado' and v_data is not null then
    insert into indisponibilidades (voluntario_id, data) values (v_id, v_data)
    on conflict do nothing;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.eu_trocar_pin(p_token text, p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'erro', 'PIN_INVALIDO');
  end if;

  select v.id into v_id from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then
    return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO');
  end if;

  /* mesmo sal da 08: sha256(pin || token). Trocar a fórmula aqui e não lá
     faria o PIN novo nunca conferir na tela de entrada. */
  update voluntarios
     set pin_hash = encode(extensions.digest(p_pin || p_token, 'sha256'), 'hex')
   where id = v_id;

  delete from entrar_tentativas where voluntario_id = v_id;
  return jsonb_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_config_da_equipe()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  insert into config (equipe_id, dados) values (new.id, '{}'::jsonb)
  on conflict (equipe_id) do nothing;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_conflito_simultaneo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_nome text; v_outra text;
begin
  if not exists (select 1 from funcoes where id=new.funcao_id and simultanea) then return new; end if;
  select nome into v_nome from voluntarios where id=new.voluntario_id;
  select f.nome into v_outra
    from escalacoes e join funcoes f on f.id=e.funcao_id and f.simultanea
   where e.culto_id=new.culto_id and e.funcao_id<>new.funcao_id
     and e.voluntario_id=new.voluntario_id
   limit 1;
  if v_outra is not null then
    raise exception '% ja esta em % ao mesmo tempo neste domingo.', v_nome, v_outra;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fn_indisponivel()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_data date; v_nome text; v_bloq int;
begin
  if tg_op='UPDATE'
     and new.voluntario_id is not distinct from old.voluntario_id
     and new.culto_id is not distinct from old.culto_id then
    return new;
  end if;
  select data into v_data from cultos where id=new.culto_id;
  select nome into v_nome from voluntarios where id=new.voluntario_id;
  select count(*) into v_bloq from indisponibilidades where data=v_data and voluntario_id=new.voluntario_id;
  if v_bloq>0 then raise exception '% avisou que nao pode neste domingo.', v_nome; end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.inscrever(p_slug text, p_nome text, p_tel text, p_email text, p_funcoes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_eq uuid; v_id uuid; v_token text; v_nome text; v_tel text; v_mail text;
  v_areas int; v_recentes int;
begin
  select id into v_eq from equipes where slug = p_slug;
  if v_eq is null then return jsonb_build_object('ok', false, 'erro', 'EQUIPE'); end if;

  v_nome := btrim(coalesce(p_nome, ''));
  v_tel  := regexp_replace(coalesce(p_tel, ''), '[^0-9]', '', 'g');
  v_mail := nullif(btrim(lower(coalesce(p_email, ''))), '');
  if length(v_nome) < 3 then return jsonb_build_object('ok', false, 'erro', 'NOME'); end if;
  if length(v_tel) < 10 then return jsonb_build_object('ok', false, 'erro', 'TELEFONE'); end if;

  if exists (select 1 from voluntarios where equipe_id = v_eq
              and regexp_replace(coalesce(telefone,''), '[^0-9]', '', 'g') = v_tel) then
    return jsonb_build_object('ok', false, 'erro', 'JA_EXISTE');
  end if;

  select count(*) into v_areas from jsonb_each_text(coalesce(p_funcoes, '{}'::jsonb)) x
   where x.value in ('titular', 'reserva', 'treino');
  if v_areas = 0 then return jsonb_build_object('ok', false, 'erro', 'SEM_AREA'); end if;

  select count(*) into v_recentes from voluntarios v
   where v.equipe_id = v_eq and v.criado_em > now() - interval '1 hour';
  if v_recentes >= 40 then return jsonb_build_object('ok', false, 'erro', 'MUITOS_CADASTROS'); end if;

  insert into voluntarios (equipe_id, nome, telefone, email, conferido)
       values (v_eq, v_nome, v_tel, v_mail, false)
    returning id, token into v_id, v_token;

  insert into habilidades (voluntario_id, funcao_id, nivel, confirmado)
  select v_id, f.id, x.value::nivel_habilidade, false
    from jsonb_each_text(p_funcoes) x
    join funcoes f on f.equipe_id = v_eq and f.nome = x.key and f.ativa
   where x.value in ('titular', 'reserva', 'treino')
  on conflict (voluntario_id, funcao_id) do nothing;

  return jsonb_build_object('ok', true, 'token', v_token, 'nome', v_nome);
end $function$
;

CREATE OR REPLACE FUNCTION public.is_lider()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from lideres
     where email <> '' and lower(email) = lower(nullif(auth.jwt()->>'email','')));
$function$
;

CREATE OR REPLACE FUNCTION public.lidera_equipe(p_equipe uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from lideres
     where email <> '' and lower(email) = lower(nullif(auth.jwt() ->> 'email', ''))
       and (equipe_id is null or equipe_id = p_equipe));
$function$
;

CREATE OR REPLACE FUNCTION public.lidera_tudo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from lideres
     where email <> '' and lower(email) = lower(nullif(auth.jwt() ->> 'email', ''))
       and equipe_id is null);
$function$
;

CREATE OR REPLACE FUNCTION public.ocupados_fora(p_equipe uuid)
 RETURNS TABLE(data date, voluntario_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select c.data, meu.id
    from escalacoes e
    join funcoes f       on f.id = e.funcao_id and f.simultanea and f.equipe_id <> p_equipe
    join cultos c        on c.id = e.culto_id
    join voluntarios o   on o.id = e.voluntario_id
    join voluntarios meu on meu.equipe_id = p_equipe
                        and tel_norm(meu.telefone) is not null
                        and tel_norm(meu.telefone) = tel_norm(o.telefone)
   where c.data >= current_date - 30
  union
  select i.data, meu.id
    from indisponibilidades i
    join voluntarios o   on o.id = i.voluntario_id and o.equipe_id <> p_equipe
    join voluntarios meu on meu.equipe_id = p_equipe
                        and tel_norm(meu.telefone) is not null
                        and tel_norm(meu.telefone) = tel_norm(o.telefone)
   where i.data >= current_date - 30;
$function$
;

CREATE OR REPLACE FUNCTION public.salvar_dia(p_equipe uuid, p_data date, p_obs text, p_slots jsonb, p_plantao uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_culto uuid; r record;
begin
  if p_equipe is null then raise exception 'salvar_dia sem ministerio'; end if;

  insert into cultos (data) values (p_data)
    on conflict (data) do update set data = excluded.data
    returning id into v_culto;
  if v_culto is null then select id into v_culto from cultos where data = p_data; end if;

  insert into culto_obs (culto_id, equipe_id, obs)
    values (v_culto, p_equipe, coalesce(p_obs, ''))
  on conflict (culto_id, equipe_id) do update set obs = excluded.obs;

  for r in
    select (x ->> 'funcao_id')::uuid fid,
           (x ->> 'voluntario_id')::uuid vid,
           coalesce(x ->> 'status', 'pendente')::status_escala st,
           coalesce((x ->> 'fixo')::boolean, false) fx,
           coalesce((x ->> 'primeira_vez')::boolean, false) pv
      from jsonb_array_elements(coalesce(p_slots, '[]'::jsonb)) x
  loop
    if not exists (select 1 from funcoes where id = r.fid and equipe_id = p_equipe) then
      raise exception 'funcao de outro ministerio'; end if;
    if not exists (select 1 from voluntarios where id = r.vid and equipe_id = p_equipe) then
      raise exception 'voluntario de outro ministerio'; end if;

    insert into escalacoes (culto_id, funcao_id, voluntario_id, status, fixo, primeira_vez)
      values (v_culto, r.fid, r.vid, r.st, r.fx, r.pv)
    on conflict (culto_id, funcao_id) do update
      set voluntario_id = excluded.voluntario_id,
          fixo          = excluded.fixo,
          primeira_vez  = excluded.primeira_vez,
          status        = case when escalacoes.voluntario_id is distinct from excluded.voluntario_id
                               then excluded.status else escalacoes.status end,
          respondido_em = case when escalacoes.voluntario_id is distinct from excluded.voluntario_id
                               then null else escalacoes.respondido_em end;
  end loop;

  delete from escalacoes e using funcoes f
   where f.id = e.funcao_id and e.culto_id = v_culto and f.equipe_id = p_equipe
     and not exists (select 1 from jsonb_array_elements(coalesce(p_slots,'[]'::jsonb)) x
                      where (x ->> 'funcao_id')::uuid = e.funcao_id);

  delete from plantoes p using voluntarios v
   where v.id = p.voluntario_id and p.culto_id = v_culto and v.equipe_id = p_equipe
     and not (p.voluntario_id = any (coalesce(p_plantao, '{}'::uuid[])));

  insert into plantoes (culto_id, voluntario_id)
  select v_culto, v.id from voluntarios v
   where v.id = any (coalesce(p_plantao, '{}'::uuid[])) and v.equipe_id = p_equipe
  on conflict do nothing;

  return v_culto;
end $function$
;

CREATE OR REPLACE FUNCTION public.sou_lider()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from lideres
     where email <> '' and lower(email) = lower(nullif(auth.jwt() ->> 'email', '')));
$function$
;

CREATE OR REPLACE FUNCTION public.tel_norm(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select nullif(right(regexp_replace(coalesce(t,''),'\D','','g'), 11), '');
$function$
;

-- ===== POLICIES =====
-- config.eq_config [ALL]  using: lidera_equipe(equipe_id)  check: lidera_equipe(equipe_id)
-- culto_obs.eq_culto_obs [ALL]  using: lidera_equipe(equipe_id)  check: lidera_equipe(equipe_id)
-- cultos.cultos_apagar [d]  using: lidera_tudo()  check: -
-- cultos.cultos_criar [a]  using: -  check: sou_lider()
-- cultos.cultos_editar [w]  using: sou_lider()  check: sou_lider()
-- cultos.cultos_ler [r]  using: sou_lider()  check: -
-- disponibilidade.eq_disponibilidade [ALL]  using: (EXISTS ( SELECT 1
   FROM voluntarios v
  WHERE ((v.id = disponibilidade.voluntario_id) AND lidera_equipe(v.equipe_id))))  check: (EXISTS ( SELECT 1
   FROM voluntarios v
  WHERE ((v.id = disponibilidade.voluntario_id) AND lidera_equipe(v.equipe_id))))
-- equipes.eq_equipes_ler [r]  using: lidera_equipe(id)  check: -
-- equipes.eq_equipes_mexer [ALL]  using: lidera_tudo()  check: lidera_tudo()
-- escalacoes.eq_escalacoes [ALL]  using: (EXISTS ( SELECT 1
   FROM funcoes f
  WHERE ((f.id = escalacoes.funcao_id) AND lidera_equipe(f.equipe_id))))  check: (EXISTS ( SELECT 1
   FROM funcoes f
  WHERE ((f.id = escalacoes.funcao_id) AND lidera_equipe(f.equipe_id))))
-- funcoes.eq_funcoes [ALL]  using: lidera_equipe(equipe_id)  check: lidera_equipe(equipe_id)
-- habilidades.eq_habilidades [ALL]  using: (EXISTS ( SELECT 1
   FROM voluntarios v
  WHERE ((v.id = habilidades.voluntario_id) AND lidera_equipe(v.equipe_id))))  check: (EXISTS ( SELECT 1
   FROM voluntarios v
  WHERE ((v.id = habilidades.voluntario_id) AND lidera_equipe(v.equipe_id))))
-- indisponibilidades.eq_indisponibilidades [ALL]  using: (EXISTS ( SELECT 1
   FROM voluntarios v
  WHERE ((v.id = indisponibilidades.voluntario_id) AND lidera_equipe(v.equipe_id))))  check: (EXISTS ( SELECT 1
   FROM voluntarios v
  WHERE ((v.id = indisponibilidades.voluntario_id) AND lidera_equipe(v.equipe_id))))
-- lideres.eq_lideres_ler [r]  using: (lidera_tudo() OR (equipe_id IS NULL) OR lidera_equipe(equipe_id))  check: -
-- lideres.eq_lideres_mexer [ALL]  using: lidera_tudo()  check: lidera_tudo()
-- plantoes.eq_plantoes [ALL]  using: (EXISTS ( SELECT 1
   FROM voluntarios v
  WHERE ((v.id = plantoes.voluntario_id) AND lidera_equipe(v.equipe_id))))  check: (EXISTS ( SELECT 1
   FROM voluntarios v
  WHERE ((v.id = plantoes.voluntario_id) AND lidera_equipe(v.equipe_id))))
-- voluntarios.eq_voluntarios [ALL]  using: lidera_equipe(equipe_id)  check: lidera_equipe(equipe_id)

-- ===== COLUNAS =====
-- _tmp_arq.i integer NOT NULL
-- _tmp_arq.dados text NOT NULL
-- config.id integer
-- config.dados jsonb NOT NULL
-- config.equipe_id uuid
-- culto_obs.culto_id uuid NOT NULL
-- culto_obs.equipe_id uuid NOT NULL
-- culto_obs.obs text NOT NULL
-- culto_obs.relatorio text
-- culto_obs.problemas text
-- culto_obs.relatado_por uuid
-- culto_obs.relatado_em timestamp with time zone
-- cultos.id uuid NOT NULL
-- cultos.data date NOT NULL
-- cultos.obs text
-- cultos.tipo text [GERADA]
-- cultos.inicio time without time zone
-- cultos.fim time without time zone
-- cultos.ensaio_em timestamp with time zone
-- disponibilidade.voluntario_id uuid NOT NULL
-- disponibilidade.data date NOT NULL
-- disponibilidade.pode boolean NOT NULL
-- disponibilidade.respondido_em timestamp with time zone NOT NULL
-- entrar_tentativas.voluntario_id uuid NOT NULL
-- entrar_tentativas.dia date NOT NULL
-- entrar_tentativas.n integer NOT NULL
-- equipes.id uuid NOT NULL
-- equipes.nome text NOT NULL
-- equipes.slug text NOT NULL
-- equipes.whatsapp_grupo text
-- equipes.ordem integer NOT NULL
-- equipes.criado_em timestamp with time zone NOT NULL
-- equipes.sem_niveis boolean NOT NULL
-- equipes.aviso_cadastro text
-- escalacoes.id uuid NOT NULL
-- escalacoes.culto_id uuid NOT NULL
-- escalacoes.funcao_id uuid NOT NULL
-- escalacoes.voluntario_id uuid
-- escalacoes.status USER-DEFINED NOT NULL
-- escalacoes.fixo boolean NOT NULL
-- escalacoes.respondido_em timestamp with time zone
-- escalacoes.primeira_vez boolean NOT NULL
-- funcoes.id uuid NOT NULL
-- funcoes.nome text NOT NULL
-- funcoes.simultanea boolean NOT NULL
-- funcoes.ordem integer NOT NULL
-- funcoes.ativa boolean NOT NULL
-- funcoes.equipe_id uuid NOT NULL
-- funcoes.tipos ARRAY NOT NULL
-- funcoes.relata boolean NOT NULL
-- funcoes.descricao text
-- funcoes.descricao_familia text
-- funcoes.chegada time without time zone
-- habilidades.voluntario_id uuid NOT NULL
-- habilidades.funcao_id uuid NOT NULL
-- habilidades.nivel USER-DEFINED NOT NULL
-- habilidades.confirmado boolean NOT NULL
-- indisponibilidades.voluntario_id uuid NOT NULL
-- indisponibilidades.data date NOT NULL
-- lideres.email text NOT NULL
-- lideres.criado_em timestamp with time zone NOT NULL
-- lideres.equipe_id uuid
-- plantoes.culto_id uuid NOT NULL
-- plantoes.voluntario_id uuid NOT NULL
-- voluntarios.id uuid NOT NULL
-- voluntarios.nome text NOT NULL
-- voluntarios.telefone text
-- voluntarios.ativo boolean NOT NULL
-- voluntarios.limite_mes integer
-- voluntarios.token text NOT NULL
-- voluntarios.criado_em timestamp with time zone NOT NULL
-- voluntarios.equipe_id uuid NOT NULL
-- voluntarios.conferido boolean NOT NULL
-- voluntarios.email text
-- voluntarios.pin_hash text