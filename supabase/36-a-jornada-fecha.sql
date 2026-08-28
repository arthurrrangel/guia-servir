/* =============================================================================
   36 — A JORNADA DE ENTRADA FECHA

   Esta migração nasceu de rodar a jornada inteira em produção pela primeira
   vez. A tabela `candidaturas` estava com ZERO linhas: o funil existia em
   código e nunca tinha carregado uma pessoa. Cadastrei uma de verdade pela
   porta pública, movi para conversa, aprovei como líder, e o voluntário foi
   criado com token e identidade. Funciona.

   O que apareceu no caminho, e que só aparece andando:

   1. O SISTEMA GUARDA A RESPOSTA E MANDA ESPERAR
      Aprovada a candidatura, o voluntário existe e o token dele está no banco
      naquele instante. E a tela dizia: "A liderança vai te mandar o seu link
      pessoal". O produto conduzia a pessoa da descoberta até a aprovação e
      parava, entregando o último passo para um humano lembrar de fazer no
      WhatsApp. É o pior momento da jornada: fez tudo certo, foi aprovada, e
      agora depende de alguém não esquecer dela.

      O link passa a vir na resposta. Não é afrouxar segurança: o token da
      candidatura é a credencial que provou a identidade dessa pessoa o funil
      inteiro. Entregar a ela o link dela mesma no fim é a mesma prova.

   2. MANDA CHAMAR NO WHATSAPP QUEM NÃO TEM WHATSAPP
      Três das cinco áreas não têm responsável cadastrado. Para elas, o passo
      seguinte dizia "Chame no WhatsApp para se apresentar" com `responsavel:
      null` e `whatsapp: null` ao lado. Instrução que a pessoa não tem como
      seguir é pior que instrução nenhuma: ela fica achando que falhou.
      Agora o texto muda quando não há quem chamar.

   3. TRAVESSÃO LONGO VINDO DO BANCO
      A ajuda de uma pergunta e o passo final tinham travessão longo, que está
      proibido na interface. Os arquivos de tela estavam limpos; o texto vinha
      daqui.

   4. ETAPA: seis no banco, seis na tela de acompanhamento, cinco na página da
      área e quatro na home. A pessoa via a mesma jornada contada de três
      jeitos. O banco passa a devolver também `etapa_de` e `etapa_total`, para
      que exista UM número e as telas parem de inventar o seu.
   ============================================================================= */

-- =========================================================================
-- §1  candidatura_status: reescrita inteira
--
-- Reescrita e não remendada porque quatro dos sete estados mudam de texto, e
-- porque a versão viva já não era a do arquivo 23 (a migração 25 substituiu
-- para acertar o artigo). Emendar sobre o que eu não tinha em mãos era como
-- fazer aquele agente ler o retrato antigo do banco achando que era o atual.
--
-- O CONTRATO NÃO MUDA: todos os campos que a tela já lia continuam saindo com
-- o mesmo nome. Só entram campos novos.
-- =========================================================================
create or replace function candidatura_status(p_token text)
returns jsonb
language plpgsql security definer stable set search_path = public as $fn$
declare
  c record; v_funcoes text[];
  v_passo text; v_titulo text; v_texto text; v_etapa int;
  v_da text; v_ao text; v_tem_quem boolean; v_link text;
begin
  select ca.*, e.nome as equipe_nome, e.slug as equipe_slug,
         coalesce(e.artigo, 'o') as artigo,
         e.responsavel_nome, e.responsavel_whatsapp, p.nome as pessoa_nome, p.id as pessoa_id
    into c
    from candidaturas ca
    join equipes e on e.id = ca.equipe_id
    join pessoas p on p.id = ca.pessoa_id
   where ca.token = p_token;
  if not found then return jsonb_build_object('ok', false, 'erro', 'LINK_INVALIDO'); end if;

  select array_agg(f.nome order by f.ordem) into v_funcoes
    from candidatura_funcoes cf join funcoes f on f.id = cf.funcao_id
   where cf.candidatura_id = c.id;

  /* concordância: "da Livraria" e não "do Livraria", "à Livraria" e não "ao".
     Um erro de artigo na primeira frase que a pessoa lê já diz que ninguém
     olhou com cuidado. */
  v_da := case when c.artigo = 'a' then 'da ' else 'do ' end;
  v_ao := case when c.artigo = 'a' then 'à '  else 'ao ' end;

  /* existe alguém nomeado para essa área? É isso que decide se faz sentido
     mandar a pessoa chamar alguém. */
  v_tem_quem := coalesce(nullif(btrim(coalesce(c.responsavel_nome, '')), ''), null) is not null
                and coalesce(nullif(btrim(coalesce(c.responsavel_whatsapp, '')), ''), null) is not null;

  /* o link pessoal, quando ela já é do time. Só depois de aprovada: antes
     disso não existe vínculo, e portanto não existe link. */
  if c.status in ('aprovada', 'integrando', 'ativa') then
    select v.token into v_link
      from voluntarios v
     where v.pessoa_id = c.pessoa_id and v.equipe_id = c.equipe_id and v.ativo
     limit 1;
  end if;

  case c.status
    when 'enviada' then
      v_etapa := 1; v_titulo := 'Recebemos seu cadastro';
      v_texto := 'A liderança ' || v_da || c.equipe_nome || ' já está com o seu nome.';
      v_passo := case when v_tem_quem
        then 'Se quiser adiantar, chame ' || c.responsavel_nome || ' no WhatsApp e se apresente.'
        else 'Agora é com a liderança. Você não precisa fazer nada: quando houver novidade, ela aparece aqui.' end;

    when 'em_analise' then
      v_etapa := 2; v_titulo := 'Estamos olhando o seu cadastro';
      v_texto := 'Alguém da liderança está vendo onde você se encaixa melhor.';
      /* mesmo enquadramento de 'enviada': do lado do líder as duas situações
         pedem a mesma coisa (ligar), então do lado da pessoa as duas precisam
         soar igual de opcionais. */
      v_passo := case when v_tem_quem
        then 'Se quiser adiantar, chame ' || c.responsavel_nome || ' no WhatsApp e se apresente.'
        else 'Nada a fazer por enquanto. Guarde este link e volte nele.' end;

    when 'conversa' then
      v_etapa := 3; v_titulo := 'A liderança quer falar com você';
      v_texto := 'Antes de te encaixar, ' || v_da || c.equipe_nome || ' conversa com cada pessoa.';
      /* QUEM LIGA PARA QUEM. Este texto dizia "chame X no WhatsApp para marcar
         essa conversa" enquanto a fila do líder marcava a mesma candidatura
         como "chamar para conversar". Cada lado mandava o outro ligar, e o
         resultado é o silêncio: ninguém liga, e a pessoa acha que sumiu.

         Quem liga é a liderança. Quem se ofereceu já fez a parte dela, e
         obrigar essa pessoa a correr atrás da igreja é exatamente a sensação
         que a jornada existe para eliminar. O WhatsApp continua oferecido
         aqui, mas como atalho de quem tem pressa, não como tarefa. */
      v_passo := case when v_tem_quem
        then c.responsavel_nome || ' vai te chamar no WhatsApp. Se quiser adiantar, você também pode chamar.'
        else 'A liderança vai te procurar pelo WhatsApp que você cadastrou.' end;

    when 'entrevista' then
      v_etapa := 3; v_titulo := 'Conversa marcada';
      v_texto := 'Falta só o encontro com a liderança.';
      v_passo := case when v_tem_quem
        then 'Confirme o horário com ' || c.responsavel_nome || ' no WhatsApp.'
        else 'Confirme o horário quando a liderança te chamar.' end;

    when 'aprovada' then
      v_etapa := 4; v_titulo := 'Você faz parte do time';
      v_texto := 'Bem-vindo ' || v_ao || c.equipe_nome || '.';
      /* AQUI ESTAVA O BURACO. O link existe; agora ele é entregue. */
      v_passo := case when v_link is not null
        then 'Seu espaço já está pronto. É lá que fica a sua escala e é por lá que você diz quando pode servir.'
        else 'A liderança vai te passar o acesso ao seu espaço.' end;

    when 'integrando' then
      v_etapa := 5; v_titulo := 'Integração em andamento';
      v_texto := 'Você já está no time e está conhecendo como tudo funciona.';
      v_passo := 'Siga os primeiros passos com quem está te acompanhando.';

    when 'ativa' then
      v_etapa := 6; v_titulo := 'Você está servindo';
      v_texto := 'Sua escala aparece no seu espaço pessoal.';
      /* sem travessão: proibido na interface, e este vinha do banco */
      v_passo := 'Responda sua disponibilidade todo mês. É ela que monta a escala.';

    else  -- recusada, inativa
      v_etapa := 0; v_titulo := 'Seu cadastro está encerrado por enquanto';
      v_texto := 'Isso não quer dizer que não haja lugar para você. Às vezes é época, '
               || 'às vezes é outra área que combina mais.';
      v_passo := case when v_tem_quem
        then 'Chame ' || c.responsavel_nome || ' no WhatsApp para conversar, ou veja as outras áreas.'
        else 'Veja as outras áreas: pode haver uma que combine mais com você agora.' end;
  end case;

  return jsonb_build_object(
    'ok', true,
    'status', c.status::text,
    'etapa', v_etapa,
    /* UM número para a jornada. As telas paravam de contar cada uma do seu
       jeito: quatro na home, cinco na página da área, seis aqui. */
    'etapa_de', case when v_etapa = 0 then 0
                     when v_etapa <= 2 then 1
                     when v_etapa <= 3 then 2
                     when v_etapa = 4 then 3
                     else 4 end,
    'etapa_total', 4,
    'titulo', v_titulo,
    'texto', v_texto,
    'proximo_passo', v_passo,
    'nome', c.pessoa_nome,
    'equipe', c.equipe_nome,
    'equipe_slug', c.equipe_slug,
    'artigo', c.artigo,
    'funcoes', coalesce(to_jsonb(v_funcoes), '[]'::jsonb),
    'responsavel', c.responsavel_nome,
    'whatsapp', c.responsavel_whatsapp,
    'tem_quem_falar', v_tem_quem,
    /* o link pessoal, quando já existe. Null antes da aprovação. */
    'link_pessoal', v_link,
    'criado_em', c.criado_em
  );
end $fn$;

revoke all on function candidatura_status(text) from public;
grant execute on function candidatura_status(text) to anon, authenticated;
comment on function candidatura_status(text) is
  'o estado da candidatura para a tela de acompanhamento. Entrega o link pessoal assim que a pessoa é aprovada: o token da candidatura provou a identidade dela o funil inteiro, e segurar o link para um humano mandar depois era o buraco que fazia a jornada não fechar.';


-- =========================================================================
-- §2  O TRAVESSÃO QUE VINHA DO BANCO
--
-- Os arquivos de tela estavam limpos. O texto vinha daqui, e por isso a
-- varredura no código nunca achava.
-- =========================================================================
update perguntas
   set ajuda = replace(replace(ajuda, ' — ', ': '), '—', '-')
 where ajuda like '%—%';

update perguntas
   set texto = replace(replace(texto, ' — ', ': '), '—', '-')
 where texto like '%—%';

update equipes
   set convite = replace(replace(convite, ' — ', ': '), '—', '-')
 where convite like '%—%';

update equipes
   set descricao = replace(replace(descricao, ' — ', ': '), '—', '-')
 where descricao like '%—%';

update funcoes
   set descricao = replace(replace(descricao, ' — ', ': '), '—', '-')
 where descricao like '%—%';

update funcoes
   set descricao_familia = replace(replace(descricao_familia, ' — ', ': '), '—', '-')
 where descricao_familia like '%—%';


/* =============================================================================
   CONFERÊNCIA
     -- nenhum travessão sobrou no texto que vai para a tela
     select 'perguntas' t, count(*) n from perguntas where texto like '%—%' or ajuda like '%—%'
     union all select 'equipes', count(*) from equipes where convite like '%—%' or descricao like '%—%'
     union all select 'funcoes', count(*) from funcoes where descricao like '%—%' or descricao_familia like '%—%';

     -- a jornada, do começo ao fim, com o link entregue no final
     select candidatura_status('<token de uma candidatura aprovada>');

   ROLLBACK
     §1  a versão anterior está no banco de dados apenas; se precisar voltar,
         recriar a partir de 23-candidatura-funcoes.sql MAIS o acerto de artigo
         da 25. Não recomendado: aquela versão manda chamar no WhatsApp quem
         não tem WhatsApp e segura o link pessoal.
     §2  não desfazer. Travessão na interface é proibido.
   ============================================================================= */
