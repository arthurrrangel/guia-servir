/* ESTE ARQUIVO E PASSADO. A TRANCA ESTA AQUI PORQUE ELE PODE DESFAZER.

   `create or replace function` nao e idempotente NO TEMPO: ele grava a versao
   deste arquivo por cima da que estiver la, seja ela mais nova ou nao, e sem
   um aviso.

   O que este arquivo consegue reverter, se rodar fora de hora:
     eu_quem_serve (a 83 a recriou em producao, que nunca recebeu esta 40:
     aquele banco e anterior a `schema_versao`, que so existe desde a 55)

   Por isso ele se recusa a rodar num banco que ja passou da 40. Aplicado na
   ordem, do zero, `exige_versao_ate` ainda nem existe (ela nasce na 55) e o
   bloco nao faz nada — e e assim que tem que ser, senao o rebuild do
   repositorio parava aqui.

   Se voce REALMENTE precisa reaplicar, a mensagem do erro diz como. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(40);
  end if;
end $tranca$;

/* =============================================================================
   40 · QUEM SERVE COM VOCÊ — a pessoa que faltava no espaço do voluntário
   FASE 7, 29/08/2026

   O DIAGNÓSTICO: /eu era um calendário, não um time.

   A tela do voluntário responde muito bem QUANDO ele serve, O QUE ele faz e
   COMO avisar que não pode. Sobre QUEM, ela dizia uma coisa só: o nome do
   líder. Numa igreja cuja própria home afirma que "a igreja não é o prédio, é
   a quantidade de gente que decidiu chegar mais cedo", a página da pessoa que
   chega mais cedo não tinha gente nenhuma.

   E havia uma promessa solta: quando é a primeira vez numa função, a tela diz
   "chegue 30 minutos mais cedo, alguém vai te receber" — e nunca diz quem é
   esse alguém. Para quem está com medo, "alguém" é pior que ninguém.

   O QUE ESTA FUNÇÃO FAZ: dado um culto em que a pessoa ESTÁ escalada, devolve
   quem mais está escalado naquele culto, na mesma área. Nome e função. Nada
   mais.

   TRÊS LIMITES DE PROPÓSITO
   1. SEM TELEFONE. Contato de terceiro só aparece em `eu_quem_cobre`, onde a
      pessoa precisa ligar para alguém para fechar um buraco que ela mesma
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

  /* a trava do item 3: só responde sobre um culto em que a pessoa está de pé.
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
   que é quem chega pelo link pessoal sem login. */
revoke execute on function eu_quem_serve(text, uuid) from public;
grant  execute on function eu_quem_serve(text, uuid) to anon;
