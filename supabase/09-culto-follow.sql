/* ESTE ARQUIVO E PASSADO. A TRANCA ESTA AQUI PORQUE ELE PODE DESFAZER.

   `create or replace function` nao e idempotente NO TEMPO, e `drop function`
   + `create function` e pior: passa por cima ate de mudanca de tipo de
   retorno. Os dois gravam a versao deste arquivo por cima da que estiver la,
   seja ela mais nova ou nao, e sem um aviso.

   O que este arquivo consegue reverter, se rodar fora de hora:
     equipe_funcoes (a 12, a 14 e a 15 refizeram. MEDIDO em 21/09 num banco na 81:
     reaplicar este arquivo APLICA SEM ERRO e o tipo de retorno de `equipe_funcoes`
     cai de TABLE(nome, ordem, tipos, relata, descricao, descricao_familia) para
     TABLE(nome, ordem, tipos). Quatro telas publicas chamam essa funcao, e a
     bateria inteira continua verde: 68/68, 27/27, 6/6)

   Por isso ele se recusa a rodar num banco que ja passou da 9. Aplicado na
   ordem, do zero, `exige_versao_ate` ainda nem existe (ela nasce na 55) e o
   bloco nao faz nada — e e assim que tem que ser, senao o rebuild do
   repositorio parava aqui.

   Se voce REALMENTE precisa reaplicar, a mensagem do erro diz como. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(9);
  end if;
end $tranca$;

-- ================================================== CULTO DO FOLLOW =======
-- Até aqui o sistema inteiro assumia "culto = domingo". O Follow acontece no
-- SÁBADO, em todo sábado do mês MENOS o primeiro, e não tem HEAD nem
-- transmissão — só as outras áreas.
--
-- A regra do dia mora em DOIS lugares (banco e motor) de propósito: o banco
-- é quem impede dado errado entrar, o motor é quem monta a escala. Os dois
-- usam a mesma definição para nunca discordarem.
--
-- Rodar por partes: cada bloco separado por ---- é uma transação.

-- 1) o tipo do culto sai da própria data. Coluna gerada = impossível gravar
--    um culto de sábado marcado como domingo.
alter table cultos add column if not exists tipo text
  generated always as (case when extract(dow from data) = 6 then 'follow' else 'domingo' end) stored;

-- 2) em que tipo de culto cada área existe. Default cobre os dois, então
--    nenhuma função antiga muda de comportamento sozinha.
alter table funcoes add column if not exists tipos text[] not null
  default array['domingo','follow'];

-- 3) o Follow tem SÓ 5 áreas: PROJEÇÃO, ILUMINAÇÃO, EDIÇÃO, FOTO e FILMAGEM.
--    Fora HEAD e fora tudo que é transmissão — corte, PTZ e as duas câmeras
--    (sem transmissão, câmera não tem para onde mandar imagem).
update funcoes set tipos = array['domingo']
 where nome in ('HEAD', 'TRANSMISSÃO (CORTE + PTZ)', 'TRANSMISSÃO', 'CÂMERA 1', 'CÂMERA 2');

----------------------------------------------------------------------------

-- 4) a lista pública de áreas por equipe passa a dizer em que culto cada uma
--    existe (a tela do time separa por área e precisa saber disso).
--    DROP antes: mudar o retorno de uma função exige recriar.
drop function if exists equipe_funcoes(text);
create function equipe_funcoes(p_slug text)
returns table (nome text, ordem int, tipos text[])
language sql security definer stable set search_path = public as $$
  select f.nome, f.ordem, f.tipos
    from funcoes f join equipes e on e.id = f.equipe_id
   where e.slug = p_slug and f.ativa
   order by f.ordem;
$$;
grant execute on function equipe_funcoes(text) to anon, authenticated;

----------------------------------------------------------------------------

-- 5) a lista de dias que o voluntário responde no link pessoal.
--    Antes só trazia domingo; agora traz também os sábados do Follow.
--    "menos o primeiro sábado do mês" = dia do mês maior que 7 (o primeiro
--    sábado sempre cai entre os dias 1 e 7).
--    O nome da função fica como está de propósito: trocar quebraria o app
--    publicado sem ganho nenhum.
create or replace function eu_proximos_domingos()
returns table (data date)
language sql security definer set search_path = public as $$
  select d::date from generate_series(current_date, current_date + 60, '1 day') d
   where extract(dow from d) = 0
      or (extract(dow from d) = 6 and extract(day from d) > 7);
$$;
grant execute on function eu_proximos_domingos() to anon, authenticated;
