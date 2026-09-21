/* ESTE ARQUIVO E PASSADO. A TRANCA ESTA AQUI PORQUE ELE PODE DESFAZER.

   `create or replace function` nao e idempotente NO TEMPO, e `drop function`
   + `create function` e pior: passa por cima ate de mudanca de tipo de
   retorno. Os dois gravam a versao deste arquivo por cima da que estiver la,
   seja ela mais nova ou nao, e sem um aviso.

   O que este arquivo consegue reverter, se rodar fora de hora:
     equipe_publica (a 14 refez com `drop function` + `create function`, que passa
     por cima ate de mudanca de tipo de retorno)

   Por isso ele se recusa a rodar num banco que ja passou da 7. Aplicado na
   ordem, do zero, `exige_versao_ate` ainda nem existe (ela nasce na 55) e o
   bloco nao faz nada — e e assim que tem que ser, senao o rebuild do
   repositorio parava aqui.

   Se voce REALMENTE precisa reaplicar, a mensagem do erro diz como. */
do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(7);
  end if;
end $tranca$;

/* =============================================================================
   07 — ACESSO (fecha a brecha dos 4 dígitos)

   PROBLEMA: a entrada era "escolha seu nome na lista + digite os 4 últimos
   dígitos do seu WhatsApp". Num grupo de WhatsApp o número de todos é visível,
   então esses 4 dígitos não são segredo. Qualquer membro da comunidade
   conseguia abrir a página de outro voluntário, ver a escala dele e confirmar
   ou recusar um domingo no lugar dele. O token entregue ainda era permanente.

   DECISÃO: o link pessoal passa a ser a credencial (magic link). Quem perde o
   link pede ao líder, que reenvia com um toque pelo botão de WhatsApp da aba
   Time. Não dá para trocar por código de uso único hoje: enviar código por
   WhatsApp exige a API oficial paga.

   NÃO REINTRODUZIR equipe_entrar para anon sem resolver a autenticação.
   ============================================================================= */

revoke execute on function equipe_entrar(text, uuid, text) from anon, public;

/* equipe_publica continua servindo só para validar o slug e dar o nome da
   equipe no cabeçalho. Deixa de listar voluntários: sem a entrada por
   dígitos, a lista de nomes é exposição sem finalidade. */
create or replace function equipe_publica(p_slug text)
returns table(equipe text, voluntario_id uuid, primeiro_nome text, precisa_link boolean)
language sql security definer set search_path = public stable as $fn$
  select e.nome, null::uuid, null::text, null::boolean
    from equipes e where e.slug = p_slug;
$fn$;
revoke all on function equipe_publica(text) from public;
grant execute on function equipe_publica(text) to anon, authenticated;

/* -----------------------------------------------------------------------------
   Painel de disponibilidade do líder: nenhuma mudança de schema.
   A tabela disponibilidade e a policy p_disp_lider (select para is_lider())
   já existiam na 06; o que faltava era o app do líder LER essa tabela.
   Isso foi feito no carregarEstado/montarEstado, não em SQL.
   ----------------------------------------------------------------------------- */
