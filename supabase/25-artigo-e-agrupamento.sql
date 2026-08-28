/* =============================================================================
   25 — "DO MÍDIA", "DO DIACONIA"

   Achado no teste do fluxo completo em produção: o texto do sistema monta
   "A liderança do " || nome do ministério, e sai "a liderança do Diaconia",
   "entre no time do Mídia". Errado em dois dos três ministérios.

   Concordância não é detalhe de acabamento quando o sistema é a primeira coisa
   que a igreja vê. E não dá para adivinhar por regra: "o Louvor" e "a Mídia"
   não seguem terminação nenhuma confiável em português.

   Então o artigo vira dado, como o nome já é.
   ============================================================================= */

alter table equipes add column if not exists artigo text not null default 'o'
  check (artigo in ('o','a'));

comment on column equipes.artigo is
  'artigo definido do nome do ministerio: o Louvor, a Midia, a Diaconia. Vira dado porque nao ha regra de terminacao confiavel em portugues.';

update equipes set artigo = 'a' where slug in ('midia','servico');
update equipes set artigo = 'o' where slug = 'louvor';

/* candidatura_status volta a montar as frases, agora com o artigo certo */
create or replace function candidatura_status(p_token text)
returns jsonb
language plpgsql security definer stable set search_path = public as $fn$
declare
  c record; v_funcoes text[]; v_passo text; v_titulo text; v_texto text; v_etapa int;
  a text;    -- "o" ou "a"
  d text;    -- "do" ou "da"
begin
  select ca.*, e.nome as equipe_nome, e.slug as equipe_slug, e.artigo,
         e.responsavel_nome, e.responsavel_whatsapp, p.nome as pessoa_nome
    into c
    from candidaturas ca
    join equipes e on e.id = ca.equipe_id
    join pessoas p on p.id = ca.pessoa_id
   where ca.token = p_token;
  if not found then return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO'); end if;

  a := coalesce(c.artigo, 'o');
  d := case when a = 'a' then 'da' else 'do' end;

  select array_agg(f.nome order by f.ordem) into v_funcoes
    from candidatura_funcoes cf join funcoes f on f.id = cf.funcao_id
   where cf.candidatura_id = c.id;

  case c.status
    when 'enviada' then
      v_etapa := 1; v_titulo := 'Recebemos seu cadastro';
      v_texto := 'A liderança ' || d || ' ' || c.equipe_nome || ' já está com o seu nome.';
      v_passo := 'Chame no WhatsApp para se apresentar. Isso acelera tudo.';
    when 'em_analise' then
      v_etapa := 2; v_titulo := 'Estamos olhando o seu cadastro';
      v_texto := 'Alguém da liderança está vendo onde você se encaixa melhor.';
      v_passo := 'Se puder, chame no WhatsApp e se apresente.';
    when 'conversa' then
      v_etapa := 3; v_titulo := 'A liderança quer falar com você';
      v_texto := 'Antes de te encaixar, ' || a || ' ' || c.equipe_nome || ' conversa com cada pessoa.';
      v_passo := 'Chame no WhatsApp para marcar essa conversa.';
    when 'entrevista' then
      v_etapa := 3; v_titulo := 'Conversa marcada';
      v_texto := 'Falta só o encontro com a liderança.';
      v_passo := 'Confirme o horário no WhatsApp.';
    when 'aprovada' then
      v_etapa := 4; v_titulo := 'Você faz parte do time';
      v_texto := 'Bem-vindo ' || (case when a = 'a' then 'à' else 'ao' end) || ' ' || c.equipe_nome || '.';
      v_passo := 'A liderança vai te mandar o seu link pessoal, onde fica a sua escala.';
    when 'integrando' then
      v_etapa := 5; v_titulo := 'Integração em andamento';
      v_texto := 'Você já está no time e está conhecendo como tudo funciona.';
      v_passo := 'Siga os primeiros passos com quem te acompanha.';
    when 'ativa' then
      v_etapa := 6; v_titulo := 'Você está servindo';
      v_texto := 'Sua escala aparece na sua página pessoal.';
      v_passo := 'Responda sua disponibilidade todo mês — é o que monta a escala.';
    else
      v_etapa := 0; v_titulo := 'Seu cadastro está encerrado por enquanto';
      v_texto := 'Isso não quer dizer que não haja lugar para você. Às vezes é época, '
               || 'às vezes é outra área que combina mais.';
      v_passo := 'Chame a liderança no WhatsApp para conversar, ou veja as outras áreas.';
  end case;

  return jsonb_build_object(
    'ok', true, 'status', c.status::text, 'etapa', v_etapa,
    'titulo', v_titulo, 'texto', v_texto, 'proximo_passo', v_passo,
    'nome', c.pessoa_nome, 'equipe', c.equipe_nome, 'equipe_slug', c.equipe_slug,
    'artigo', a,
    'funcoes', coalesce(v_funcoes, '{}'),
    'responsavel', c.responsavel_nome, 'whatsapp', c.responsavel_whatsapp,
    'criado_em', c.criado_em);
end $fn$;

revoke all on function candidatura_status(text) from public;
grant execute on function candidatura_status(text) to anon, authenticated;

/* a lista pública leva o artigo junto, para as telas concordarem sem adivinhar.
   DROP antes do CREATE: acrescentar coluna ao retorno de uma função que devolve
   TABLE muda o tipo de retorno, e o Postgres recusa o `create or replace`. */
drop function if exists ministerios_publicos();
create function ministerios_publicos()
returns table (slug text, nome text, descricao text, convite text,
               postos int, aberto boolean, artigo text)
language sql security definer stable set search_path = public as $fn$
  select e.slug, e.nome, e.descricao, e.convite,
         (select count(*)::int from funcoes f where f.equipe_id = e.id and f.ativa),
         not e.exige_aprovacao, coalesce(e.artigo,'o')
    from equipes e
   where exists (select 1 from funcoes f where f.equipe_id = e.id and f.ativa)
   order by e.ordem, e.nome;
$fn$;
revoke all on function ministerios_publicos() from public;
grant execute on function ministerios_publicos() to anon, authenticated;
