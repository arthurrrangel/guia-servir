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
