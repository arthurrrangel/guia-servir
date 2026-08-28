/* =============================================================================
   21 — A PORTA PÚBLICA

   Hoje `guiaservir.com` abre o painel do organizador. Quem não é organizador vê
   "este email não tem acesso" — que é a primeira coisa que a igreja inteira vai
   encontrar quando o Arthur divulgar o domínio.

   A campanha de cadastro do Louvor e da Diaconia vai jogar dezenas de pessoas
   nesse endereço. Elas precisam de uma porta, não de um muro.

   Esta migração só cria o DADO que a porta precisa. As telas vêm no mesmo
   commit, em app/page.tsx e app/ministerios/[slug]/page.tsx.

   Duas colunas novas em `equipes`, e uma função pública que as devolve:

   · descricao — o que o ministério faz, em uma ou duas frases. É o que a pessoa
     lê para saber se é ali que ela se encaixa.
   · convite  — a frase que fala com quem está decidindo. Descrição explica;
     convite chama. São coisas diferentes e misturá-las produz texto morno.

   Por que função e não policy: a tabela `equipes` é lida por `lidera_equipe()`,
   e afrouxar isso para o visitante abriria a lista de ministérios junto com
   tudo mais que a policy protege. SECURITY DEFINER devolve exatamente as
   cinco colunas que a tela pública precisa e nada além.
   ============================================================================= */

alter table equipes add column if not exists descricao text;
alter table equipes add column if not exists convite   text;

comment on column equipes.descricao is
  'o que o ministério faz, 1-2 frases. Lido na porta pública por quem ainda não serve.';
comment on column equipes.convite is
  'a frase que chama quem está decidindo. Descrição explica, convite convida.';


-- =========================================================================
-- A LISTA PÚBLICA DE MINISTÉRIOS
--
-- `postos` sai daqui contado, e não do cliente, porque o visitante não pode
-- ler `funcoes`. `aberto` é a diferença entre "entre agora" e "fale com a
-- liderança": é `exige_aprovacao` invertido, com nome de gente.
-- =========================================================================

create or replace function ministerios_publicos()
returns table (
  slug text, nome text, descricao text, convite text,
  postos int, aberto boolean
)
language sql security definer stable set search_path = public as $fn$
  select e.slug, e.nome, e.descricao, e.convite,
         (select count(*)::int from funcoes f where f.equipe_id = e.id and f.ativa),
         not e.exige_aprovacao
    from equipes e
   where exists (select 1 from funcoes f where f.equipe_id = e.id and f.ativa)
   order by e.ordem, e.nome;
$fn$;

revoke all on function ministerios_publicos() from public;
grant execute on function ministerios_publicos() to anon, authenticated;

comment on function ministerios_publicos() is
  'lista de ministérios para a porta pública. Só quem tem posto ativo aparece — ministério sem função não tem como receber ninguém.';


-- =========================================================================
-- O TEXTO
--
-- Escrito para quem NUNCA viu o sistema e está decidindo se serve. Sem
-- vocabulário interno: nada de posto, escala, equipe_id, conferido.
-- Cada convite fala do que a pessoa VAI FAZER, não do que o ministério é.
-- =========================================================================

update equipes set
  descricao = 'A Mídia é quem registra e transmite o que acontece na igreja: câmera, projeção, luz, foto, edição e a transmissão ao vivo.',
  convite   = 'Se você gosta de câmera, computador ou edição — ou quer aprender — tem lugar aqui.'
 where slug = 'midia';

update equipes set
  descricao = 'O Louvor conduz a igreja na adoração, no domingo e no Follow: vocal, banda, som e palco.',
  convite   = 'Se você canta ou toca, o primeiro passo é conversar com a liderança.'
 where slug = 'louvor';

update equipes set
  descricao = 'A Diaconia cuida de quem chega: recepção, estacionamento, setores do salão e o que faz o culto acontecer sem ninguém perceber.',
  convite   = 'Não precisa saber nada antes. Precisa querer receber bem.'
 where slug = 'servico';


----------------------------------------------------------------------------
-- CONFERÊNCIA
select slug, nome, aberto, postos,
       length(coalesce(descricao,'')) as tam_desc,
       length(coalesce(convite,''))   as tam_convite
  from ministerios_publicos();

-- =========================================================================
-- O NOME QUE A IGREJA USA
--
-- Todo mundo chama de Diaconia, e a comunidade no WhatsApp nasceu com esse
-- nome. Só o sistema dizia "Serviço do Culto". O slug fica 'servico' para
-- nenhum link já espalhado quebrar — muda o rótulo, não o endereço.
-- =========================================================================
update equipes set nome = 'Diaconia' where slug = 'servico';
