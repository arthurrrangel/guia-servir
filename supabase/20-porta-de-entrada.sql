/* =============================================================================
   20 — A PORTA DE ENTRADA

   A campanha de cadastro do Louvor e da Diaconia vai jogar dezenas de pessoas
   novas em /equipe/<slug>. Antes de mandar gente por essa porta, ela precisa
   parar de mentir e precisa respeitar a regra que cada ministério já tem.

   Três coisas, nesta ordem de gravidade:

   1. Os códigos de erro do `inscrever` não batem com os que a tela conhece.
      Quem digita um telefone já cadastrado recebe hoje "Não consegui entrar,
      fale com quem organiza" em vez de "ache seu nome na lista". A tela sabe
      escrever a mensagem certa desde a 06; a função é que parou de falar a
      mesma língua quando a 10 a reescreveu.

   2. A 10 também perdeu três validações que a 06 tinha: sobrenome obrigatório,
      teto de tamanho do telefone e formato de e-mail. Voltam.

   3. O Louvor JÁ TEM pré-requisitos escritos, na descrição do próprio grupo,
      desde antes deste sistema existir:
         · ser membro da GUIA CHURCH
         · passar por uma reunião com um dos líderes de PG
         · ser membro frequente nas programações ordinárias
         · vida cristã com boa reputação
         · vida de oração ativa e prática da palavra
         · disponibilidade para os ensaios
      Cadastro que entra valendo passa por cima de um portão que a liderança
      levantou. Não é o sistema que decide isso — é o ministério, e ele já
      decidiu. Entra `equipes.exige_aprovacao`.
   ============================================================================= */

-- =========================================================================
-- 1. O PORTÃO POR MINISTÉRIO
--
-- Desligado por padrão de propósito: Mídia e Diaconia não têm pré-requisito
-- escrito, e travar quem se oferece para carregar cabo é atrito sem ganho.
-- Ligado onde a liderança já pede conversa antes.
--
-- Quando ligado, a pessoa entra com ativo = false. Consequências, todas já
-- suportadas pelo que existe:
--   · o motor não escala (candidatos() filtra ativo)
--   · a lista pública não mostra (equipe_publica e equipe_time filtram ativo)
--   · o organizador VÊ na aba Time (carregarEstado não filtra ativo)
--   · a checagem de telefone duplicado continua pegando (não filtra ativo)
-- =========================================================================

alter table equipes
  add column if not exists exige_aprovacao boolean not null default false;

comment on column equipes.exige_aprovacao is
  'true = quem se cadastra entra com ativo=false e espera a liderança. Ligado onde o ministério já tem pré-requisito de entrada (Louvor). Desligado é o padrão.';


-- =========================================================================
-- 2. `inscrever` v3
--
-- Contrato de erro, agora igual ao que app/equipe/[slug]/page.tsx já escreve:
--   EQUIPE_INVALIDA · NOME_INCOMPLETO · TELEFONE_INVALIDO · EMAIL_INVALIDO
--   JA_CADASTRADO · SEM_AREA · MUITOS_CADASTROS
--
-- Retorno de sucesso, duas formas:
--   entrada direta   -> { ok:true, token, nome }
--   com aprovação    -> { ok:true, pendente:true, nome, equipe }   (sem token)
-- O `pendente` existe para a tela saber que NÃO deve redirecionar para
-- /eu/<token>: a pessoa ainda não tem página, tem um próximo passo.
-- =========================================================================

create or replace function inscrever(
  p_slug text, p_nome text, p_tel text, p_email text, p_funcoes jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_eq uuid; v_eq_nome text; v_gate boolean;
  v_nome text; v_tel text; v_mail text;
  v_id uuid; v_token text; v_n int;
begin
  select e.id, e.nome, e.exige_aprovacao into v_eq, v_eq_nome, v_gate
    from equipes e where e.slug = p_slug;
  if v_eq is null then
    return jsonb_build_object('ok', false, 'erro', 'EQUIPE_INVALIDA');
  end if;

  v_nome := btrim(coalesce(p_nome, ''));
  v_tel  := tel_norm(coalesce(p_tel, ''));
  v_mail := nullif(btrim(lower(coalesce(p_email, ''))), '');

  /* sobrenome: sem ele, duas Marias na lista pública são indistinguíveis, e a
     lista pública é como a pessoa se acha para entrar com o PIN. */
  if length(v_nome) < 3 or position(' ' in v_nome) = 0 then
    return jsonb_build_object('ok', false, 'erro', 'NOME_INCOMPLETO');
  end if;

  /* 10 a 13 dígitos: DDD + número, com ou sem 55 na frente. Acima disso é
     dedo escorregando, e o telefone é o que casa a pessoa entre ministérios. */
  if coalesce(length(v_tel), 0) < 10 or length(v_tel) > 13 then
    return jsonb_build_object('ok', false, 'erro', 'TELEFONE_INVALIDO');
  end if;

  if v_mail is not null and v_mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    return jsonb_build_object('ok', false, 'erro', 'EMAIL_INVALIDO');
  end if;

  /* casa por telefone normalizado, e NÃO devolve o token de quem já existe:
     senão bastava digitar o número de outra pessoa para abrir a página dela. */
  if exists (
    select 1 from voluntarios v
     where v.equipe_id = v_eq and tel_norm(v.telefone) = v_tel
  ) then
    return jsonb_build_object('ok', false, 'erro', 'JA_CADASTRADO');
  end if;

  if not exists (
    select 1 from jsonb_each_text(coalesce(p_funcoes, '{}'::jsonb)) x
     where x.value in ('titular', 'reserva', 'treino')
  ) then
    return jsonb_build_object('ok', false, 'erro', 'SEM_AREA');
  end if;

  select count(*) into v_n from voluntarios v
   where v.equipe_id = v_eq and v.criado_em > now() - interval '1 hour';
  if v_n >= 40 then
    return jsonb_build_object('ok', false, 'erro', 'MUITOS_CADASTROS');
  end if;

  insert into voluntarios (equipe_id, nome, telefone, email, conferido, ativo)
       values (v_eq, v_nome, v_tel, v_mail, false, not v_gate)
    returning id, token into v_id, v_token;

  /* confirmado = false sempre: o nível é o que a PESSOA disse, e o motor lê
     titular não conferido como reserva até o líder olhar. */
  insert into habilidades (voluntario_id, funcao_id, nivel, confirmado)
  select v_id, f.id, x.value::nivel_habilidade, false
    from jsonb_each_text(p_funcoes) x
    join funcoes f on f.equipe_id = v_eq and f.nome = x.key and f.ativa
   where x.value in ('titular', 'reserva', 'treino')
      on conflict (voluntario_id, funcao_id) do nothing;

  if v_gate then
    return jsonb_build_object('ok', true, 'pendente', true,
                              'nome', v_nome, 'equipe', v_eq_nome);
  end if;
  return jsonb_build_object('ok', true, 'token', v_token, 'nome', v_nome);
end $fn$;

revoke all on function inscrever(text, text, text, text, jsonb) from public;
grant execute on function inscrever(text, text, text, text, jsonb) to anon, authenticated;

comment on function inscrever(text, text, text, text, jsonb) is
  'auto-cadastro público. Códigos de erro iguais aos de textoDoErro() na tela. Com equipes.exige_aprovacao, devolve pendente=true e NÃO devolve token.';


-- =========================================================================
-- 3. OS 9 POSTOS DA MÍDIA ESTAVAM SEM UMA LINHA DE TEXTO
--
-- A tela de cadastro mostra a descrição de cada posto para a pessoa decidir
-- o que marcar. No ministério que mais usa o sistema, ela mostrava só o nome.
--
-- RASCUNHO — escrito por mim a partir do nome do posto, não do funcionamento
-- real da equipe. Diz o COMPROMISSO (quando é, o culto inteiro ou não), que é
-- o que a pessoa precisa para decidir, e evita inventar processo interno.
-- O João Vitor tem que corrigir o que estiver errado.
-- =========================================================================

update funcoes f set descricao = v.txt
  from (values
    ('PROJEÇÃO',
     'Passa a letra do louvor e os slides da pregação no telão, acompanhando o culto inteiro.'),
    ('ILUMINAÇÃO',
     'Comanda a mesa de luz durante todo o culto, seguindo os momentos da programação.'),
    ('EDIÇÃO',
     'Edita o material depois do culto, durante a semana. É o único posto que não exige estar presente no domingo.'),
    ('FOTO',
     'Fotografa o culto e entrega as fotos para as redes.'),
    ('FILMAGEM',
     'Grava com a câmera na mão, andando pelo salão. É diferente das câmeras fixas da transmissão.'),
    ('HEAD',
     'Coordena a equipe da mídia no domingo: confere quem chegou, cobre o que falta e resolve problema na hora. Chega antes de todo mundo.'),
    ('TRANSMISSÃO (CORTE + PTZ)',
     'Faz o corte ao vivo entre as câmeras e comanda as PTZ. É quem decide o que quem assiste de casa vê.'),
    ('CÂMERA 1',
     'Câmera fixa, posição principal. Fica no posto o culto inteiro.'),
    ('CÂMERA 2',
     'Câmera fixa, segunda posição. Fica no posto o culto inteiro.')
  ) as v(nome, txt)
 where f.nome = v.nome
   and f.equipe_id = (select id from equipes where slug = 'midia');


-- =========================================================================
-- 4. LIGA O PORTÃO NO LOUVOR
--
-- Só no Louvor, e só porque a regra já existia escrita. Para desligar:
--   update equipes set exige_aprovacao = false where slug = 'louvor';
-- =========================================================================

update equipes set exige_aprovacao = true  where slug = 'louvor';
update equipes set exige_aprovacao = false where slug in ('midia', 'servico');

/* o aviso que a pessoa lê ANTES de preencher, para o "aguarde" não ser
   surpresa no fim do formulário */
update equipes set aviso_cadastro =
  'O Louvor tem pré-requisitos: ser membro da GUIA CHURCH, ter passado por uma reunião com um líder de PG, ser frequente nas programações e ter disponibilidade para os ensaios. Preencha aqui e a liderança fala com você.'
 where slug = 'louvor' and coalesce(aviso_cadastro, '') = '';


----------------------------------------------------------------------------
-- CONFERÊNCIA
select
  (select count(*) from funcoes f join equipes e on e.id = f.equipe_id
    where e.slug = 'midia' and f.ativa and coalesce(f.descricao,'') <> '')  as midia_com_texto,
  (select count(*) from equipes where exige_aprovacao)                       as ministerios_com_portao,
  (select string_agg(slug, ', ' order by slug) from equipes where exige_aprovacao) as quais,
  (select count(*) from voluntarios where not ativo)                         as inativos_hoje;
