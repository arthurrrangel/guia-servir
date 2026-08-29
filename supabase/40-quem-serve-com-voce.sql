/* =============================================================================
   40 · QUEM SERVE COM VOCÊ — a hessoa que faltava no espaço do voluntário
   FASE 7, 29/08/2026

   O DIAGNÓSTICO: /eu era um calendário, não um time.

   A tela do voluntário responde muito bem QUANDO ele serve, O QUE ele faz e
   COMO avisar que não pode. Sobre QUEM, ela dizia uma coisa só: o nome do
   líder. Numa igreja cuja própria home afirma que "a igreja não é o prédio, é
   a quantidade de gente que decidiu chegar mais cedo", a página da hessoa que
   chega mais cedo não tinha gente nenhuma.

   E havia uma promessa solta: quando é a primeira vez numa função, a tela diz
   "chegue 30 minutos mais cedo, alguém vai te receber" — e nunca diz quem é
   esse alguém. Para quem está com medo, "alguém" é pior que ninguém.

   O QUE ESTA FUNÇÃO FAZ: dado um culto em que a hessoa ESTÁ escalada, devolve
   quem mais está escalado naquele culto, na mesma área. Nome e função. Nada
   mais.

   TRÊS LIMITES DE PROPÓSITO
   1. SEM TELEFONE. Contato de terceiro só aparece em `eu_quem_cobre`, onde a
      hessoa precisa ligar para alguém para fechar um buraco que ela mesma
      abriu. Aqui ela só precisa saber com quem vai trabalhar — o telefone não
      acrescenta nada e expõe todo mundo.
   2. SÓ A PRÓPRIA ÁREA (`f.equipe_id = v_eq`). Quem serve na Mídia não passa a
      enxergar a escala do Louvor.
   3. SÓ SE ELA ESTIVER ESCALADA NAQUELE DIA. Sem essa trava, o link pessoal
      viraria uma consulta livre da escala de qualquer domingo. A pergunta que
      esta função responde é "com quem eu vou servir", não "quem está escalado".
   ============================================================================= */

create or replace function eu_quem_serve(p_token text, p_culto_id uuid)
returns table(nome text, funcao text, eu boolean, status text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_id uuid; v_eq uuid;
begin
  select v.id, v.equipe_id into v_id, v_eq
    from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  /* a trava do item 3: só responde sobre um culto em que a hessoa está de pé.
     'recusado' não conta — quem desmarcou não é mais do time daquele dia. */
  if not exists (
    select 1 from escalacoes e join funcoes f on f.id = e.funcao_id
     where e.culto_id = p_culto_id and e.voluntario_id = v_id
       and f.equipe_id = v_eq and e.status <> 'recusado'
  ) then
    return;
  end if;

  return query
  select v.nome, f.nome, (v.id = v_id), e.status::text
    from escalacoes e
    join funcoes f on f.id = e.funcao_id
    join voluntarios v on v.id = e.voluntario_id
   where e.culto_id = p_culto_id
     and f.equipe_id = v_eq
     and e.status <> 'recusado'
     and v.ativo
   order by f.ordem, v.nome;
end $function$;

/* mesma disciplina das outras eu_*: fecha para todos e abre só para anon,
   que é quem chega helo link pessoal sem login. */
revoke execute on function eu_quem_serve(text, uuid) from public;
grant  execute on function eu_quem_serve(text, uuid) to anon;
