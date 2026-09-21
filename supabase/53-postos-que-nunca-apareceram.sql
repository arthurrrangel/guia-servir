/* ESTE ARQUIVO E PASSADO. A TRANCA ESTA AQUI PORQUE ELE PODE DESFAZER.

   `create or replace function` nao e idempotente NO TEMPO: ele grava a versao
   deste arquivo por cima da que estiver la, seja ela mais nova ou nao, e sem
   um aviso.

   O que este arquivo consegue reverter, se rodar fora de hora:
     funcoes de Connect e Kids (a 55 e a 65 mexeram nos mesmos postos)

   Por isso ele se recusa a rodar num banco que ja passou da 53. Aplicado na
   ordem, do zero, `exige_versao_ate` ainda nem existe (ela nasce na 55) e o
   bloco nao faz nada — e e assim que tem que ser, senao o rebuild do
   repositorio parava aqui.

   Se voce REALMENTE precisa reaplicar, a mensagem do erro diz como. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(53);
  end if;
end $tranca$;

/* =============================================================================
   53 · QUINZE POSTOS QUE NUNCA APARECERAM NA ESCALA
   19/09/2026

   -------------------------------------------------------------------------
   O QUE ESTÁ ACONTECENDO HOJE

   `funcoes.tipos` diz em que tipo de culto o posto existe. O motor conhece
   DUAS palavras, e só duas, porque `cultos.tipo` é COLUNA GERADA:

       case when extract(dow from data) = 6 then 'follow' else 'domingo' end

   E `funcoesDoDia` (lib/engine.ts) filtra assim:

       funcoesAtivas(S).filter(f => !f.tipos?.length || f.tipos.includes(tipo))

   Array VAZIO vale para os dois — é o "sem opinião". Array com qualquer
   outra palavra não casa com nada.

   Quinze postos ATIVOS estão hoje com `tipos = {culto}`:

       GUIA Kids ... 9 postos — BERÇÁRIO (professora e auxiliar), TURMA 2-4,
                     TURMA 5-7, TURMA 8-12 (professora e auxiliar) e LANCHE.
                     O ministério INTEIRO.
       Livraria .... 2 postos — LIVRARIA 1 e LIVRARIA 2. O ministério inteiro.
       Connect ..... 4 postos — SEGURANÇA 1 e 2, VISITANTES 1 e 2.

   Eles não aparecem em domingo nenhum, nem em sábado de Follow. Nenhum.

   -------------------------------------------------------------------------
   POR QUE NINGUÉM VIU

   Porque o sintoma é a AUSÊNCIA de sintoma. `vagasDe` lista o que falta
   preencher dentro de `funcoesDoDia` — e esses postos não estão lá, então não
   faltam. `resumoDia` conta o total em cima da mesma lista. O dia fecha
   "9 de 9" sem os postos existirem.

   Rodado no motor de verdade, com dois postos marcados assim:

       funcoesDoDia  : [ 'PROJEÇÃO' ]
       slots gerados : [ 'PROJEÇÃO' ]
       vagasDe       : []              ← nenhuma vaga aberta
       resumoDia     : { total: 1 }    ← e o dia diz que está completo

   Quem organiza o Kids abre a escala, vê uma tela vazia sem nenhum aviso, e
   conclui que o sistema "não serve para o Kids".

   -------------------------------------------------------------------------
   ESTE DEFEITO JÁ FOI MORTO UMA VEZ, NESTE MESMO REPOSITÓRIO

   A migração 18 tirou `'evento'` do array do Louvor, com esta justificativa
   escrita ali:

       "Só existem dois tipos possíveis. Nenhum culto jamais terá tipo
        'evento', então esse valor no array é lixo que nunca casa — e pior, dá
        a impressão de que o Coral está contemplado quando não está."

   A migração 29 é POSTERIOR à 18 e reintroduziu a mesma classe de defeito com
   outra palavra. Isso não é descuido de uma pessoa: é um vocabulário sem
   dono. `tipos` é `text[]` livre, escrito à mão em cada `insert`, e nada no
   banco recusa uma palavra inventada.

   Por isso esta migração faz DUAS coisas. Consertar as quinze linhas é o
   menos importante — o que impede a terceira vez é a restrição.

   -------------------------------------------------------------------------
   POR QUE 'domingo' E NÃO 'domingo,follow'

   Porque é o que os IRMÃOS de cada posto dizem. Os outros 14 postos do
   Connect estão todos em `{domingo}`; os quatro quebrados são do mesmo
   ministério e do mesmo culto. Kids e Livraria não têm posto são com que
   comparar, e o serviço deles acontece durante o culto de domingo.

   Trocar `'culto'` por `'domingo'` — e não simplesmente REMOVER a palavra —
   é deliberado: remover deixaria o array vazio, que vale para os DOIS tipos,
   e escalaria o Kids nos sábados de Follow sem ninguém ter pedido isso.

   SE O KIDS OU A LIVRARIA TAMBÉM SERVEM NO FOLLOW DE SÁBADO, isto aqui fica
   errado por omissão e o conserto é uma linha:

       update funcoes set tipos = array['domingo','follow']
        where equipe_id = (select id from equipes where slug = 'kids');

   Fica escrito porque é uma pergunta de igreja, não de código, e quem
   responde é quem organiza.
   ============================================================================= */


-- =========================================================================
-- 1 · os quinze postos passam a existir
-- =========================================================================

do $conserto$
declare v_n int;
begin
  select count(*) into v_n from funcoes where 'culto' = any(tipos);

  update funcoes
     set tipos = array_replace(tipos, 'culto', 'domingo')
   where 'culto' = any(tipos);

  raise notice 'OK — % posto(s) sairam de {culto} para {domingo} e passam a aparecer na escala.', v_n;
end $conserto$;


-- =========================================================================
-- 2 · a palavra inventada para de entrar
--
-- Esta é a parte que importa. Sem ela, a próxima migração que semear um
-- ministério novo repete o erro pela terceira vez, em silêncio, e alguém
-- descobre meses depois que um ministério inteiro nunca foi escalado.
--
-- A restrição não tenta adivinhar o futuro: quando o calendário sair do
-- código e `cultos.tipo` passar a ter um terceiro valor, o `create` de lá
-- vai falhar aqui — e falhar NA MIGRAÇÃO é exatamente o que se quer, porque
-- é o momento em que alguém está olhando.
-- =========================================================================

do $regra$ begin
  if not exists (select 1 from pg_constraint
                  where conname = 'funcoes_tipos_conhecidos_ck'
                    and conrelid = 'funcoes'::regclass) then
    alter table funcoes
      add constraint funcoes_tipos_conhecidos_ck
      check (tipos <@ array['domingo','follow']::text[]);
  end if;
end $regra$;

comment on column funcoes.tipos is
  'Em que tipo de culto o posto existe. SO aceita domingo e follow — sao os dois unicos valores que cultos.tipo pode ter, porque a coluna e GERADA a partir do dia da semana. Array vazio vale para os dois. Palavra fora dessa lista faz o posto sumir da escala EM SILENCIO: foi assim com evento (migracao 18) e com culto (migracao 53, 15 postos, o GUIA Kids inteiro). Desde a 53 o banco recusa.';


/* =============================================================================
   CONFERÊNCIA
   ============================================================================= */
do $conf$
declare v_erros text := ''; v_sobrou int; v_kids int;
begin
  select count(*) into v_sobrou from funcoes
   where cardinality(tipos) > 0 and not (tipos && array['domingo','follow']);
  if v_sobrou > 0 then
    v_erros := v_erros || format('1) %s posto(s) ainda nao aparecem em dia nenhum; ', v_sobrou);
  end if;

  /* a restrição tem que RECUSAR de verdade — restrição que não recusa é
     comentário com sintaxe de SQL */
  begin
    insert into funcoes (equipe_id, nome, simultanea, ordem, ativa, tipos)
      values ((select id from equipes order by ordem limit 1),
              'POSTO DE TESTE 53', true, 999, false, array['cantata']);
    v_erros := v_erros || '2) a restricao aceitou uma palavra inventada; ';
    delete from funcoes where nome = 'POSTO DE TESTE 53';
  exception when check_violation then null;
  end;

  /* e tem que ACEITAR o que é legítimo, incluindo o array vazio */
  begin
    insert into funcoes (equipe_id, nome, simultanea, ordem, ativa, tipos)
      values ((select id from equipes order by ordem limit 1),
              'POSTO DE TESTE 53', true, 999, false, array[]::text[]);
    delete from funcoes where nome = 'POSTO DE TESTE 53';
  exception when others then
    v_erros := v_erros || '3) a restricao recusou array vazio, que vale para os dois tipos; ';
  end;

  select count(*) into v_kids from funcoes f join equipes e on e.id = f.equipe_id
   where e.slug = 'kids' and f.ativa and (f.tipos && array['domingo','follow'] or cardinality(f.tipos) = 0);

  if v_erros = '' then
    raise notice 'OK — 3/3: nenhum posto invisivel, a palavra inventada e recusada, o array vazio continua valendo. GUIA Kids com % posto(s) visiveis.', v_kids;
  else
    raise exception 'FALHOU — %', v_erros;
  end if;
end $conf$;
