/* =============================================================================
   93 · O CARIMBO VELHO SOBRE TRABALHO NOVO, E A FICHA DE 20 MB
   22/09/2026

   Sexta auditoria adversarial contra o banco real na 92, feita por duas
   equipes independentes. Sete achados; seis viraram conserto aqui e o setimo
   e uma decisao de esquema que esta no bloco 7.

   Cada paragrafo abaixo traz a MEDIDA que o conserto existe para matar, feita
   contra o banco `dem` montado por `scripts/demandas-banco.sh` na 92. Onde nao
   ha medida, nao ha conserto.

   ---------------------------------------------------------------------------
   1 · `reabrir` NAO LIMPAVA `validada_em`, E A FICHA PASSAVA A MENTIR

   Medido, do comeco ao fim, com os tokens de teste:

     dem_abrir('tk-jovem', {categoria: 'Criação de arte', ...})  -> ok, #138
     dem_mover('tk-com',   138, 'assumir')                       -> ok
     dem_mover('tk-com',   138, 'concluir', {texto:'pronto'})    -> ok
     dem_mover('tk-jovem', 138, 'validar',  {texto:'conferi'})   -> ok
     dem_mover('tk-jovem', 138, 'reabrir',  {texto:'faltou...'}) -> ok
     select status, validada_em, validada_por from ... where numero = 138;
       execucao | 2026-09-22 16:05:21.491935+00 | 686e1fc3-...
     dem_mover('tk-com',   138, 'assumir')                       -> ok
     dem_mover('tk-com',   138, 'concluir', {texto:'agora sim'}) -> ok
     dem_mover('tk-jovem', 138, 'validar')      -> {"erro": "JA_VALIDADA"}
     dem_ver('tk-jovem', 138) -> demanda.validada_por = "Pedro Jovens"

   Duas coisas quebradas pela mesma linha que faltava.

   A primeira: o quinto passo do fluxo do documento ("Concluir -> Solicitar
   revisao -> Reabrir -> Ajustar -> VALIDAR NOVAMENTE") e impossivel. Uma
   demanda so pode ser validada uma vez na vida, e a vida dela inclui todas as
   reaberturas.

   A segunda e pior, porque e silenciosa: a ficha entra no ramo
   `d.validada_em ? frase : botao` e imprime "Validada por Pedro em 22/09"
   sobre uma conclusao NOVA, escrita depois, que ninguem conferiu. Carimbo
   velho afirmando coisa sobre trabalho novo. Num sistema cujo proposito
   declarado e responder "quem disse que isto esta resolvido", e registro
   falso.

   A causa e de calendario: `reabrir` nasceu na 85, as colunas `validada_em` e
   `validada_por` nasceram na 91, e a cirurgia da 91 passou por `dem_mover`
   para ensinar a acao `validar` sem reler a acao que a desfaz.

   O conserto sao duas atribuicoes no UPDATE do `reabrir`. A TELA NAO MUDA:
   `acoesDe` ja decide o botao por `!d.validada_em`, entao apagar o carimbo faz
   o botao "Confirmar que resolveu" voltar sozinho.

   ---------------------------------------------------------------------------
   2 · `travar` POR `aprovacao`: QUEM ATENDE ERA RECUSADO NUMA DEMANDA QUE
       NUNCA TEVE PORTAO

   Medido, numa demanda em execucao de categoria que nao exige aprovacao:

     select status, aprovacao, coalesce(aprovacao,'aprovada') from ...;
       execucao | NULL | aprovada
     dem_mover('tk-com',    n, 'travar', {motivo:'aprovacao', ...})
       -> {"erro": "SO_GESTOR_REABRE_APROVACAO"}
     dem_mover('tk-gestor', n, 'travar', {motivo:'aprovacao', ...})  -> ok

   O `coalesce(d.aprovacao, 'aprovada')` que a 92 escreveu le NULL como "ja foi
   aprovada" e barra quem atende. So que NULL nesta coluna nao quer dizer "ja
   foi aprovada": quer dizer "nunca houve portao". Sao coisas diferentes e a
   guarda tratava as duas igual.

   O que isso mata e a metade "equipe responsavel" da Etapa 2 do documento ("A
   lideranca OU EQUIPE RESPONSAVEL analisa... se sera necessario orcamento ou
   aprovacao") e o fluxo de excecao inteiro ("Executar -> identificar
   impedimento -> solicitar informacao OU APROVACAO -> retomar"). Quem esta com
   a demanda na mao e quem descobre, no meio da execucao, que aquilo virou
   dinheiro; e justamente ele que nao podia dizer isso.

   E a tela oferece a opcao assim mesmo: o seletor de motivo em
   `app/demandas/d/[numero]/page.tsx` so esconde "aprovacao" quando
   `aprovacao === 'aprovada'`. Com NULL a opcao aparece, a pessoa escolhe, e
   leva um erro. Botao morto.

   O conserto e distinguir os dois estados: `d.aprovacao is not distinct from
   'aprovada'` e FALSO para NULL e VERDADEIRO para 'aprovada'. Quem atende
   passa a poder ESCALAR (NULL), e continua sem poder REABRIR aprovacao ja
   concedida ('aprovada'), que e o beco que a 92 existe para fechar. A
   conferencia mede os dois lados, e a bateria sabota os dois.

   E o beco nao volta por outro caminho: a demanda que quem atende escala fica
   `aprovacao = 'pendente'`, e `aprovar`/`rejeitar` pedem gestor e so exigem
   `falta_aprovacao(d)`, que passa a ser verdadeira. Ou seja: a escalada tem
   quem a decida, que e a diferenca entre escalar e prender.

   ---------------------------------------------------------------------------
   3 · `dem_ver` DEVOLVIA O HISTORICO INTEIRO, SEM TETO

   Medido, inserindo eventos no teto da CHECK (`eventos.texto` aceita ate 4000
   letras) e medindo `length(dem_ver(...)::text)`:

        50 eventos ->    208.228 bytes  (203 kB)
       300 eventos ->  1.242.478 bytes  (1213 kB)
      1000 eventos ->  4.138.378 bytes  (4041 kB)
      5000 eventos -> 20.686.378 bytes  (20202 kB)

   Linear, sem teto nenhum, e 20 MB numa chamada so. Toda acao do sistema
   escreve evento, e esta porta abre no celular de quem serve na igreja, muitas
   vezes no 4G do estacionamento.

   E o mesmo defeito que a 57 mediu e resolveu na outra porta ("sem teto, a aba
   Tudo com 20 mil demandas media 10 MB"), de pe aqui desde sempre: a
   subconsulta de `anexos` ganhou `limit 50` na 85 e a de eventos nunca ganhou
   nada.

   O QUE A TELA PRECISA FAZER, QUE E A PARTE QUE PRECISAVA DE DECISAO

   Nada com a ordem, e uma linha nova com o total.

   O recorte pega os 200 MAIS RECENTES numa subconsulta (`order by em desc, id
   desc limit 200`) e o `jsonb_agg` de fora os devolve em ordem CRESCENTE, que
   e exatamente o que `app/demandas/d/[numero]/page.tsx` ja imprime hoje
   (`v.eventos.map`, sem ordenar nada). Devolver decrescente seria mais simples
   de escrever e viraria a ficha do avesso sem ninguem tocar numa linha de TSX:
   uma migracao que inverte a tela em silencio e pior que o defeito que ela
   conserta. E a mesma forma que a 85 usou nos anexos, e por isso as duas
   subconsultas agora se leem igual.

   DEPOIS, na mesma medida: 50 -> 203 kB, 300 -> 809 kB, 1000 -> 809 kB,
   5000 -> 809 kB. A curva deixa de subir, e o pior caso vira 809 kB, que
   ainda e muito, e e o pior caso de propaganda: 200 eventos com o texto todo
   no teto de 4000 letras, coisa que nenhuma demanda de igreja tem. O corte em
   200 e o numero do pedido; se um dia a medida em campo disser que a ficha
   real chega perto disso, o proximo passo nao e cortar mais: e parar de mandar
   `texto` inteiro no recorte antigo e deixar a ficha pedir o que abrir.

   O campo novo `eventos_total` conta os eventos QUE AQUELA PESSOA PODE VER
   (mesmo filtro de `interno` do recorte). Contar todos vazaria, para quem
   pediu, quantos comentarios internos a equipe escreveu sobre a demanda dela:
   volume, que e o que a 86 ja tinha decidido nao vazar.

   O que falta na ficha e UMA linha, e ela esta escrita no relatorio: quando
   `eventos_total > v.eventos.length`, dizer acima da lista quantos ficaram de
   fora. Sem ela a ficha fica correta e muda: mostra os 200 ultimos sem avisar
   que houve mais.

   ---------------------------------------------------------------------------
   4 · VALOR COM ONZE DIGITOS ESTOURAVA `numeric field overflow` CRU EM TRES
       PORTAS

   Medido:

     dem_abrir('tk-jovem', {..., orcamento: '999999999999999'})
       -> ERROR 22003: numeric field overflow
     dem_ajustar('tk-admin','setor', {id:..., teto_sem_aprovacao:'999999999999999'})
       -> ERROR 22003: numeric field overflow
     dem_mover('tk-jovem', n, 'destravar', {..., orcamento:'999999999999999'})
       -> ERROR 22003: numeric field overflow

   As tres colunas sao `numeric(12,2)`: cabem dez digitos inteiros e dois
   decimais. As tres regex dizem `^[0-9]+([.,][0-9]{1,2})?$`, que limita o
   FORMATO e nao o TAMANHO, e os tres blocos `exception` pegam
   `check_violation`, `not_null_violation`, `foreign_key_violation` e
   `unique_violation`, e nunca `numeric_value_out_of_range`.

   Na tela isso chega como "Não consegui. Tente de novo", que manda a pessoa
   repetir uma coisa que nunca vai funcionar, quantas vezes ela tiver paciencia.

   Conserto em duas camadas, de proposito:

     · a regex passa a limitar os digitos (`^[0-9]{1,10}([.,][0-9]{1,2})?$`),
       que e o caminho normal e devolve o codigo certo antes de tocar no banco;
     · cada uma das tres funcoes ganha `when numeric_value_out_of_range`, que e
       a rede embaixo.

   E A REDE NAO TEM, HOJE, CAMINHO PROPRIO, o que e uma coisa que eu escrevi
   errado antes de medir. A primeira versao deste cabecalho dizia que `ordem` e
   `prazo_padrao_dias` de `dem_ajustar` chegavam crus no `::int`, e a
   conferencia tinha um caso para isso. Medido:

     dem_ajustar('tk-admin','setor', {id:..., ordem:'99999999999'})
       -> {"ok": false, "erro": "NUMERO_INVALIDO", "campo": "ordem"}

   A 88 ja tinha fechado os dois com `^-?[0-9]{1,6}$`. Com as regex corrigidas,
   nenhuma entrada consegue chegar ao estouro: a rede so pode ser medida pelo
   TEXTO da funcao, e a conferencia a mede assim, dizendo o que esta fazendo.
   Ela fica porque a regra de "isto e dinheiro" e uma copia em tres lugares e a
   coluna e `numeric(12,2)` em tres tabelas: no dia em que alguem acrescentar a
   quarta porta, ou afrouxar uma das tres copias, o estouro vira recusa em vez
   de 22003 na cara de quem usa.

   O limite novo e exatamente o da coluna, e nao um numero escolhido: R$
   9.999.999.999,99 continua entrando, e a conferencia tem caso para isso.
   Regra mais apertada que a coluna seria inventar um teto de gasto na
   migracao, que e o que a 92 recusou fazer por escrito.

   ---------------------------------------------------------------------------
   5 · RE-TRAVAR TROCAVA MOTIVO E NOTA SEM ESCREVER NO HISTORICO

   Medido:

     dem_mover('tk-com', n, 'travar', {motivo:'informacao', texto:'Falta o arquivo'})
       -> ok;  eventos da demanda: 2  (abertura, status)
     dem_mover('tk-com', n, 'travar', {motivo:'terceiros',  texto:'Agora e a grafica'})
       -> ok;  estado: travada/terceiros/"Agora e a grafica"
               eventos da demanda: 2   <- nenhum evento novo
     dem_mover('tk-com', n, 'travar', {motivo:'terceiros',  texto:'outra nota'})
       -> ok;  eventos da demanda: 2   <- nenhum evento novo

   `fn_historico` so escreve quando `status` muda, e re-travar mantem
   `travada`. Entao o motivo pelo qual a demanda esta parada muda debaixo de
   quem pediu, de "falta informacao" (que e uma pergunta PARA ELE) para
   "depende de terceiros" (que nao e), e o historico continua contando a
   primeira versao. Quem abrir a ficha amanha le uma nota que nao explica o
   evento que ela acompanha.

   O ramo novo so dispara quando o `status` NAO mudou. Quando muda, o ramo de
   status ja grava a nota nova no `texto` do evento, e dois eventos sobre a
   mesma mexida sao pior que um: o historico passaria a ter linha dupla em toda
   trava, que e ruido em cima do registro que existe para ser lido.

   O evento novo tem `tipo = 'trava'`, com `de`/`para` nos motivos e a nota no
   `texto`. A FICHA PRECISA DE UM CASO EM `frase()` para ele, e isso esta no
   relatorio: hoje o `default` imprimiria "Monik: trava". O tipo `orcamento`,
   que a 92 criou, esta na mesma situacao neste minuto e cai no mesmo default.

   ---------------------------------------------------------------------------
   6 · `dem_abrir` NAO TINHA O GUARDA DE TOQUE DUPLO QUE `comentar` E `anexar`
       TEM

   Medido, duas chamadas identicas seguidas:

     dem_abrir('tk-jovem', carga) -> {"ok": true, "numero": 142}
     dem_abrir('tk-jovem', carga) -> {"ok": true, "numero": 143}
     select count(*) from demandas.demandas where titulo = '...';  -> 2

   `comentar` responde `{"ok":true,"repetido":true}` para carga igual da mesma
   pessoa em 20 segundos desde a 85, e o motivo esta escrito la: "o toque duplo
   nao e ma-fe, e 4G ruim". A abertura, que e a porta por onde entra gente que
   nunca usou o sistema, nao tinha nada.

   A tela protege com `disabled={indo}`, e isso cobre o clique duplo no mesmo
   botao. Nao cobre o caso que acontece de verdade: a barrinha gira, a pessoa
   acha que nao foi, recarrega a pagina e manda de novo. Duas demandas iguais
   na fila de quem atende, e alguem vai trabalhar duas vezes ou perguntar qual
   das duas vale.

   Mesmo padrao, mesma janela (20 segundos, o numero da 85, para nao existirem
   duas ideias de "toque duplo"), mesmo `aberta_por` e o mesmo titulo JA LIMPO
   por `uma_linha`: comparar o texto cru deixaria passar a mesma frase com um
   invisivel a mais, que e exatamente o que a 92 mediu acontecendo.

   A resposta da repeticao devolve o numero da demanda que JA EXISTE e o mesmo
   corpo da resposta normal (`setor_responsavel`, `contato`,
   `precisa_aprovacao`). Nao e capricho: a tela de "pronto" monta com esses
   tres campos o recado de WhatsApp para quem vai atender. Uma resposta
   encurtada faria a pessoa que tocou duas vezes perder o botao de avisar, que
   e o unico passo do fluxo que o sistema nao faz sozinho.

   ---------------------------------------------------------------------------
   7 · AS COLUNAS MORTAS DA 90, E POR QUE ELAS SAEM

   Medido:

     select count(*), count(avisado_em), count(aviso_motivo) from demandas.demandas;
       11 | 0 | 0          (e 18 | 0 | 0 na producao, pelas duas auditorias)
     select p.oid::regprocedure from pg_proc p
      where pg_get_functiondef(p.oid) ~ 'avisado_em|aviso_motivo'
        and p.pronamespace in ('demandas'::regnamespace,'public'::regnamespace);
       (0 linhas)

   Nenhuma linha preenchida, nenhuma funcao que escreva, nenhuma funcao que
   leia. A 91 as manteve com uma frase que eu reli e que nao se sustenta contra
   a medida: "elas sao registro do que aconteceu, e apagar registro e outra
   coisa". Sao, se registrarem alguma coisa. Estas nao registram: a fila de
   avisos mudou de lugar na 91 (`demandas.avisos`, uma linha por pessoa por
   aviso, com `enviado_em` proprio), e o unico codigo que um dia escreveu aqui
   (`demandas.marcar_avisado`) foi derrubado pela propria 91.

   Uma coluna com nome de registro e sem registro dentro e pior que coluna
   nenhuma: quem le o esquema conclui que o carimbo do aviso mora na linha da
   demanda, e vai procurar por que ele esta sempre vazio. E a familia de
   defeito que estas auditorias existem para achar, e a 91 deixou duas.

   MAS O `drop` E GUARDADO, e isso nao e indecisao. Se algum banco tiver
   carimbo gravado, a coluna FICA e ganha `comment on column` dizendo o que ela
   e, porque o que eu medi foram dois bancos, e apagar dado que eu nao vi e
   decidir no escuro. Onde ela estiver vazia, sai; onde nao estiver, fica
   explicada e o `notice` diz quantas linhas a seguraram.

   ---------------------------------------------------------------------------
   O QUE ESTE ARQUIVO NAO FAZ, E POR QUE

   · `demandas.eventos` nao ganha indice novo. O recorte de 200 le por
     (demanda_id, em desc, id desc), e o indice que existe e por `demanda_id`:
     para as centenas de eventos que uma demanda de igreja tem, o Postgres
     ordena em memoria sem sentir. Indice para uma ordenacao que custa
     microssegundos e escrita paga em toda acao do sistema para acelerar uma
     leitura que ja e rapida. Quando a medida disser outra coisa, o indice
     entra com ela junto.

   · A tela nao e tocada por este arquivo, e as duas mudancas que ela precisa
     (a linha de "ha mais N no historico" e o caso de `frase()` para `trava`)
     estao no relatorio. Migracao que mexe em TSX nao e migracao, e o deploy do
     banco e o da tela nao acontecem no mesmo segundo: tudo aqui foi escrito
     para a tela de HOJE continuar correta enquanto a de amanha nao chega.
   ============================================================================= */
do $tranca$begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(93);
  end if;
end
$tranca$;

begin;

/* -------------------------------------------------------------------------
   1 · O CONTATO DO SETOR, NUM LUGAR SO

   A guarda de toque duplo do bloco 4 precisa responder a MESMA coisa que a
   abertura normal responde, e a resposta normal monta o contato com uma
   subconsulta de seis linhas dentro de `dem_abrir`. Copiar essas seis linhas
   para o outro `return` criaria duas ideias de "quem e o contato deste setor",
   e a que ninguem olhasse ia envelhecer sozinha.

   A ordem (`responsavel`, depois `gestor`, depois `admin`) e a da 84, copiada
   byte a byte: quem atende vem antes de quem manda, porque o recado de quem
   abriu a demanda e para quem vai fazer.
   ------------------------------------------------------------------------- */
create or replace function demandas.contato_do_setor(p_setor uuid) returns jsonb
language sql stable as $fn$
  select jsonb_build_object('nome', x.nome, 'telefone', x.telefone)
    from demandas.membros x
   where x.ativo and x.telefone is not null
     and x.setor_id = p_setor
   order by case x.papel when 'responsavel' then 0 when 'gestor' then 1
                         when 'admin' then 2 else 3 end, x.nome
   limit 1
$fn$;

comment on function demandas.contato_do_setor(uuid) is
  'UM contato do setor que vai atender, para o recado que a tela de "pronto" '
  'escreve. Saiu de dentro de dem_abrir na 93, quando a resposta de toque '
  'duplo passou a precisar da mesma frase.';

revoke all on function demandas.contato_do_setor(uuid) from public;

/* -------------------------------------------------------------------------
   2 · AS COLUNAS MORTAS DA 90

   Guardado de proposito: onde houver carimbo, a coluna fica e ganha o
   comentario que explica o que ela e. Ver o item 7 do cabecalho.

   Re-aplicavel nos dois ramos: se ja sairam, o bloco nao acha a coluna e
   devolve; se ficaram, `comment on` por cima de `comment on` e no-op.
   ------------------------------------------------------------------------- */
do $morta$
declare v_col int; v_uso int;
begin
  select count(*)::int into v_col from information_schema.columns c
   where c.table_schema = 'demandas' and c.table_name = 'demandas'
     and c.column_name in ('avisado_em','aviso_motivo');
  if v_col = 0 then
    raise notice '93 · as colunas avisado_em/aviso_motivo ja nao existem.';
    return;
  end if;

  execute (select 'select count(*)::int from demandas.demandas where '
                  || string_agg(c.column_name || ' is not null', ' or ')
             from information_schema.columns c
            where c.table_schema = 'demandas' and c.table_name = 'demandas'
              and c.column_name in ('avisado_em','aviso_motivo')) into v_uso;

  if v_uso = 0 then
    execute 'alter table demandas.demandas drop column if exists avisado_em';
    execute 'alter table demandas.demandas drop column if exists aviso_motivo';
    raise notice '93 · as % coluna(s) da 90 sairam: nenhuma linha tinha carimbo, '
                 'nenhuma funcao escrevia e nenhuma lia. A fila de avisos e demandas.avisos, desde a 91.', v_col;
  else
    execute $c$comment on column demandas.demandas.avisado_em is
      'REGISTRO HISTORICO DA 90, e nao a fila de hoje: a fila de avisos e '
      'demandas.avisos, uma linha por pessoa por aviso, desde a 91. Nenhuma '
      'funcao escreve aqui desde que a 91 derrubou demandas.marcar_avisado. '
      'A 93 manteve a coluna porque este banco tem linha carimbada.'$c$;
    begin
      execute $c$comment on column demandas.demandas.aviso_motivo is
        'REGISTRO HISTORICO DA 90. Ver o comentario de avisado_em.'$c$;
    exception when undefined_column then null; end;
    raise notice '93 · % linha(s) tem carimbo da 90: as colunas FICAM, agora com comentario '
                 'dizendo que a fila de verdade e demandas.avisos.', v_uso;
  end if;
end $morta$;

/* -------------------------------------------------------------------------
   3 · fn_historico REGISTRA A TRAVA QUE MUDA SEM MUDAR O STATUS

   Cirurgia sobre o corpo VIVO, e nao reescrita: a 92 reescreve `fn_historico`
   inteiro toda vez que roda, e um arquivo que tambem a reescrevesse teria de
   copiar o corpo dela para ca e envelhecer junto. `troca_se_faltar` le o que
   estiver la e recusa o que nao reconhecer.

   A MARCA E COMPARADA BYTE A BYTE, E ISSO ME CUSTOU UMA RODADA. A primeira
   versao deste bloco alinhava a condicao com dois espacos
   (`new.travada_por  is distinct from`) e a marca tinha um so. Resultado:
   aplicar o arquivo duas vezes seguidas inseriu o ramo DUAS vezes, e a
   conferencia reprovou com "trocar so a nota da trava nao entrou no historico
   (4 de 2)": quatro eventos onde deviam ser dois, cada trava registrada em
   duplicata. `position(marca in s)` nao normaliza espaco; alinhamento bonito
   dentro de um texto que vai ser procurado depois e armadilha.
   ------------------------------------------------------------------------- */
do $cirurgia$
declare src text; novo text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p
   where p.pronamespace = 'demandas'::regnamespace and p.proname = 'fn_historico';
  if src is null then
    raise exception '93 · demandas.fn_historico nao existe. Nada foi gravado.';
  end if;

  novo := public.troca_se_faltar(src, 'new.travada_por is distinct from old.travada_por',
'  /* o motivo do atraso sumia sem rastro no `reabrir` */',
'  /* 93 · RE-TRAVAR TROCAVA O MOTIVO E A NOTA SEM DEIXAR RASTRO.
     Medido na 92: travar por `informacao` e depois re-travar por `terceiros`
     com outra nota deixa o historico com UM evento so, o `status` da primeira
     trava; trocando so a nota, com o mesmo motivo, nao entra nada. O motivo
     pelo qual a demanda esta parada mudava debaixo de quem pediu, e a ficha
     continuava contando a primeira versao.

     `new.status is not distinct from old.status` e a guarda contra a linha
     dupla: quando o status MUDA, o ramo la de cima ja grava a nota nova no
     `texto` do evento de status, e duas linhas sobre a mesma mexida sao ruido
     em cima do registro que existe para ser lido. */
  if new.status is not distinct from old.status
     and (new.travada_por is distinct from old.travada_por
       or new.travada_nota is distinct from old.travada_nota) then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para, texto)
      values (new.id, v_m, ''trava'', old.travada_por, new.travada_por, new.travada_nota);
  end if;

  /* o motivo do atraso sumia sem rastro no `reabrir` */',
    'fn_historico: a trava que muda sem mudar o status');
  execute novo;

  -- ============ dem_mover: o carimbo, a escalada, o valor e a rede =========
  select pg_get_functiondef('public.dem_mover(text,int,text,jsonb)'::regprocedure) into src;

  novo := public.troca_se_faltar(src, 'validada_em = null',
'    update demandas.demandas
       set reaberturas = reaberturas + 1,
           conclusao = null, concluida_em = null, cancelada_motivo = null,
           atraso_motivo = null,',
'    update demandas.demandas
       set reaberturas = reaberturas + 1,
           conclusao = null, concluida_em = null, cancelada_motivo = null,
           atraso_motivo = null,
           /* 93 · O CARIMBO VELHO AFIRMAVA COISA SOBRE TRABALHO NOVO.
              `reabrir` nasceu na 85 e estas duas colunas na 91, e a cirurgia
              da 91 nao passou por aqui. Medido: reabrir uma demanda validada,
              concluir de novo e chamar `validar` devolve JA_VALIDADA, o que
              torna impossivel o quinto passo do fluxo do documento; e ate la a
              ficha imprime "Validada por Fulano em 22/09" sobre uma conclusao
              que ninguem conferiu. A tela nao muda: `acoesDe` decide o botao
              por `!d.validada_em`. */
           validada_em = null, validada_por = null,',
    'dem_mover: reabrir apaga o carimbo da validacao');

  novo := public.troca_se_faltar(novo, 'd.aprovacao is not distinct from ''aprovada''',
'    if v_motivo = ''aprovacao''
       and coalesce(d.aprovacao, ''aprovada'') is not distinct from ''aprovada''
       and m.papel not in (''gestor'',''admin'') then',
'    /* 93 · NULL NAO E "JA FOI APROVADA", E "NUNCA HOUVE PORTAO".
       O `coalesce` da 92 lia os dois estados como um so e barrava quem atende
       numa demanda que nunca teve aprovacao nenhuma. Medido: em execucao,
       categoria sem portao, `responsavel` -> SO_GESTOR_REABRE_APROVACAO, e o
       gestor passando. Isso mata a metade "equipe responsavel" da Etapa 2 do
       documento e o fluxo de excecao inteiro, e a tela oferece a opcao assim
       mesmo (o seletor so a esconde com `aprovacao === ''aprovada''`).

       `NULL is not distinct from ''aprovada''` e FALSO, entao quem atende
       escala; `''aprovada'' is not distinct from ''aprovada''` e VERDADEIRO,
       entao o beco que a 92 fechou continua fechado. E a escalada tem saida:
       ela deixa `aprovacao = ''pendente''`, e ai `aprovar` e `rejeitar` do
       gestor enxergam a demanda. */
    if v_motivo = ''aprovacao''
       and d.aprovacao is not distinct from ''aprovada''
       and m.papel not in (''gestor'',''admin'') then',
    'dem_mover: quem atende escala para aprovacao');

  novo := public.troca_se_faltar(novo, '''^[0-9]{1,10}([.,][0-9]{1,2})?$''',
'      if p_d->>''orcamento'' !~ ''^[0-9]+([.,][0-9]{1,2})?$'' then',
'      /* 93 · a regex limitava o FORMATO e nao o TAMANHO. `orcamento` e
         numeric(12,2) e o valor de quinze digitos da medida levantava 22003
         cru, que chega na tela como "Não consegui. Tente de novo". Dez digitos
         inteiros e exatamente o que a coluna aceita: R$ 9.999.999.999,99
         continua entrando. */
      if p_d->>''orcamento'' !~ ''^[0-9]{1,10}([.,][0-9]{1,2})?$'' then',
    'dem_mover: o valor do destravar cabe na coluna');

  novo := public.troca_se_faltar(novo, 'when numeric_value_out_of_range then',
'  when unique_violation then',
'  /* 93 · A REDE EMBAIXO DA REGRA. A regex de cima pega o caminho normal; este
     ramo pega o que escapar dela por qualquer outro caminho. Sem ele o 22003
     subia cru, porque os tres `exception` desta familia so conheciam
     check/not_null/foreign_key/unique. */
  when numeric_value_out_of_range then
    return jsonb_build_object(''ok'', false, ''erro'', ''ORCAMENTO_INVALIDO'');
  when unique_violation then',
    'dem_mover: o estouro de numero vira recusa, e nao 22003');
  execute novo;

  -- ============ dem_abrir: o contato, o toque duplo, o valor e a rede ======
  select pg_get_functiondef('public.dem_abrir(text,jsonb)'::regprocedure) into src;

  novo := public.troca_se_faltar(src, 'v_rep int',
'  v_exige boolean; v_teto numeric;',
'  v_exige boolean; v_teto numeric; v_rep int;',
    'dem_abrir: declara a demanda que ja existe');

  /* ESTA TROCA VEM ANTES DA GUARDA DE TOQUE DUPLO, E A ORDEM E OBRIGATORIA:
     a guarda tambem escreve `demandas.contato_do_setor(v_resp))`, e se ela
     rodasse primeiro a marca desta troca ja estaria no corpo e a subconsulta
     antiga ficaria de pe, com as duas formas convivendo. */
  novo := public.troca_se_faltar(novo, '''contato'', demandas.contato_do_setor(v_resp))',
'    ''contato'', (select jsonb_build_object(''nome'', x.nome, ''telefone'', x.telefone)
                  from demandas.membros x
                 where x.ativo and x.telefone is not null
                   and x.setor_id = v_resp
                 order by case x.papel when ''responsavel'' then 0 when ''gestor'' then 1
                                       when ''admin'' then 2 else 3 end, x.nome
                 limit 1));',
'    /* 93 · a mesma frase que a resposta de toque duplo devolve, e por isso ela
       mora numa funcao so. Ver o bloco 1. */
    ''contato'', demandas.contato_do_setor(v_resp));',
    'dem_abrir: o contato sai para a funcao');

  novo := public.troca_se_faltar(novo, 'v_rep is not null',
'  insert into demandas.demandas (
    titulo, descricao, objetivo, local, publico,',
'  /* 93 · O TOQUE DUPLO NAO E MA-FE, E 4G RUIM. A frase e da 85, e vale aqui.
     Medido: duas chamadas identicas seguidas criaram as demandas 142 e 143.
     `comentar` e `anexar` tem este guarda desde a 85; a abertura, que e a porta
     por onde entra quem nunca usou o sistema, nao tinha nada. O
     `disabled={indo}` da tela cobre o clique duplo; nao cobre recarregar a
     pagina achando que nao foi.

     Mesma janela da 85 (20 segundos), mesma pessoa, e o titulo JA LIMPO por
     `uma_linha`: comparar o texto cru deixaria passar a mesma frase com um
     invisivel a mais, que e o que a 92 mediu acontecendo. */
  select d2.numero into v_rep from demandas.demandas d2
   where d2.aberta_por = m.id
     and d2.titulo is not distinct from demandas.uma_linha(p_d->>''titulo'')
     and d2.criada_em > now() - interval ''20 seconds''
   order by d2.criada_em desc, d2.numero desc
   limit 1;
  if v_rep is not null then
    /* a resposta e a MESMA da abertura normal, com o numero da que ja existe:
       a tela de "pronto" monta o recado de WhatsApp com estes tres campos, e
       uma resposta encurtada faria quem tocou duas vezes perder o botao de
       avisar quem vai atender. */
    return jsonb_build_object(''ok'', true, ''numero'', v_rep, ''repetido'', true,
      ''precisa_aprovacao'', v_exige,
      ''setor_responsavel'', (select s.nome from demandas.setores s where s.id = v_resp),
      ''contato'', demandas.contato_do_setor(v_resp));
  end if;

  insert into demandas.demandas (
    titulo, descricao, objetivo, local, publico,',
    'dem_abrir: o toque duplo devolve a demanda que ja existe');

  novo := public.troca_se_faltar(novo, '''^[0-9]{1,10}([.,][0-9]{1,2})?$''',
'    if p_d->>''orcamento'' !~ ''^[0-9]+([.,][0-9]{1,2})?$'' then',
'    /* 93 · dez digitos inteiros, que e o que numeric(12,2) aceita. Medido:
       ''999999999999999'' levantava 22003 cru na cara de quem abria a demanda. */
    if p_d->>''orcamento'' !~ ''^[0-9]{1,10}([.,][0-9]{1,2})?$'' then',
    'dem_abrir: o valor cabe na coluna');

  novo := public.troca_se_faltar(novo, 'when numeric_value_out_of_range then',
'  when not_null_violation then',
'  /* 93 · a rede embaixo da regex. Ver o item 4 do cabecalho. */
  when numeric_value_out_of_range then
    return jsonb_build_object(''ok'', false, ''erro'', ''ORCAMENTO_INVALIDO'');
  when not_null_violation then',
    'dem_abrir: o estouro de numero vira recusa, e nao 22003');
  execute novo;

  -- ============ dem_ajustar: o teto e a rede ===============================
  select pg_get_functiondef('public.dem_ajustar(text,text,jsonb)'::regprocedure) into src;

  novo := public.troca_se_faltar(src, '''^[0-9]{1,10}([.,][0-9]{1,2})?$''',
'     and p_d->>''teto_sem_aprovacao'' !~ ''^[0-9]+([.,][0-9]{1,2})?$'' then',
'     /* 93 · `teto_sem_aprovacao` tambem e numeric(12,2), e a regex da 92
        copiou a de `dem_abrir` inteira, com o mesmo buraco. */
     and p_d->>''teto_sem_aprovacao'' !~ ''^[0-9]{1,10}([.,][0-9]{1,2})?$'' then',
    'dem_ajustar: o teto cabe na coluna');

  novo := public.troca_se_faltar(novo, 'when numeric_value_out_of_range then',
'  when unique_violation then return jsonb_build_object(''ok'', false, ''erro'', ''JA_EXISTE'');',
'  /* 93 · a rede embaixo da regex do teto. A recusa NAO nomeia campo de
     proposito: esta funcao tem outros tres casts numericos (`ordem` e
     `prazo_padrao_dias`, hoje fechados pela regex da 88), e se um dia o
     estouro vier de um deles, apontar `teto_sem_aprovacao` seria mandar a
     pessoa consertar o campo errado. */
  when numeric_value_out_of_range then
    return jsonb_build_object(''ok'', false, ''erro'', ''VALOR_INVALIDO'');
  when unique_violation then return jsonb_build_object(''ok'', false, ''erro'', ''JA_EXISTE'');',
    'dem_ajustar: o estouro de numero vira recusa, e nao 22003');
  execute novo;

  -- ============ dem_ver: o historico com teto ==============================
  select pg_get_functiondef('public.dem_ver(text,int)'::regprocedure) into src;

  novo := public.troca_se_faltar(src, '''eventos_total''',
'      from demandas.eventos e where e.demanda_id = d.id
        and (v_interno or not e.interno)), ''[]''::jsonb),',
'      /* 93 · SEM TETO, A FICHA MEDIA 20 MB. Medido contra a 92, com eventos no
         teto da CHECK (4000 letras): 50 -> 203 kB, 300 -> 1213 kB, 1000 ->
         4041 kB, 5000 -> 20202 kB. Linear, numa porta que abre no celular de
         quem serve. A subconsulta de `anexos` tem `limit 50` desde a 85; esta
         nunca teve nada.

         O recorte pega os 200 MAIS RECENTES aqui dentro e o `jsonb_agg` de
         fora os devolve em ordem CRESCENTE, que e a ordem que
         `app/demandas/d/[numero]/page.tsx` ja imprime. Devolver decrescente
         viraria a ficha do avesso sem ninguem tocar numa linha de tela. */
      from (select * from demandas.eventos x
             where x.demanda_id = d.id
               and (v_interno or not x.interno)
             order by x.em desc, x.id desc
             limit 200) e), ''[]''::jsonb),
    /* e o TOTAL, para a ficha poder dizer quantos ficaram de fora. Conta so o
       que esta pessoa pode ver: contar os internos junto diria a quem pediu
       quantos comentarios a equipe escreveu sem ele, que e o volume que a 86
       decidiu nao vazar. */
    ''eventos_total'', (select count(*) from demandas.eventos e
                       where e.demanda_id = d.id
                         and (v_interno or not e.interno)),',
    'dem_ver: o historico chega com teto e com o total');
  execute novo;
end $cirurgia$;

/* -------------------------------------------------------------------------
   4 · CONFERENCIA

   UM bloco de conferencia neste arquivo, e nenhum outro. Os blocos auxiliares
   acima usam etiquetas proprias (`tranca`, `morta`, `cirurgia`) porque
   `scripts/sabotar-migracao.py` conta a etiqueta da conferencia TEXTUALMENTE e
   recusa arquivo com mais de uma ocorrencia, inclusive dentro de comentario.

   As duas armadilhas de sempre, escritas porque este tipo de bloco ja caiu nas
   duas: `falhas || 'texto'` sem `::text` o Postgres resolve como `text[] ||
   text[]` e estoura; e `<>` contra NULL devolve NULL, e `if NULL then` nao
   entra em ramo nenhum, que e a porta por onde a sabotagem passa por baixo da
   guarda. Toda comparacao aqui e `is distinct from`.

   E a conferencia olha SO os proprios dados: `demandas-banco.test.sql` abre
   dezenas de demandas antes, e contar a tabela inteira mede o banco e nao a
   regra.
   ------------------------------------------------------------------------- */
/* -------------------------------------------------------------------------
   8 · O INVENTARIO DA PORTA PUBLICA FICOU FALANDO DE UMA FUNCAO QUE NAO EXISTE

   A 92 trocou a assinatura de `dem_numeros` de `(text, date, date)` para
   `(text, text, text)`, porque o cast dos parametros `date` acontecia ANTES do
   corpo da funcao e `2026-13-45` estourava um `22008` cru na tela. Ela nao
   atualizou a linha correspondente em `public.porta_publica`.

   Medido: `bash scripts/escala-banco.sh` e `bash scripts/banco-do-zero.sh`
   reprovam em `testar_porta_publica()`, que compara inventario e catalogo NOS
   DOIS SENTIDOS: a assinatura velha esta declarada e nao existe mais, e a nova
   existe e nao esta declarada.

   Isso e o guarda funcionando, e nao um incomodo: o inventario da 77 existe
   para que abrir (ou mexer em) uma porta para a internet exija escrever por
   que. Uma migracao que muda a assinatura e nao mexe no inventario deixa o
   arquivo virando ficcao aos poucos, que e a frase que a propria 77 usa.
   ------------------------------------------------------------------------- */
/* o inventario nasce na 77, que e do sistema de escalas e NAO entra na cadeia
   de `scripts/demandas-banco.sh`. Sem esta guarda, a 93 derruba o harness de
   Demandas num banco onde a tabela nunca existiu, que e o oposto do que ela
   esta consertando. */
do $porta$ begin
  if to_regclass('public.porta_publica') is null then
    raise notice '93 · este banco nao tem o inventario da porta publica (a 77 nao esta na cadeia). Nada a declarar.';
    return;
  end if;
  delete from public.porta_publica
   where funcao = 'dem_numeros(p_token text, p_de date, p_ate date)';
  insert into public.porta_publica (funcao, motivo, n) values
    ('dem_numeros(p_token text, p_de text, p_ate text)',
     'os numeros do periodo, para o painel de demandas. A 92 trocou os dois '
     'parametros de `date` para `text`: o cast acontecia antes do corpo da '
     'funcao e uma data impossivel estourava erro cru do Postgres na tela.', 93)
  on conflict (funcao) do update set motivo = excluded.motivo, n = excluded.n;
end $porta$;

do $conf$
declare
  falhas text[] := '{}';
  v_set_com uuid; v_set_adm uuid; v_cat uuid;
  v_sol uuid; v_resp uuid; v_ges uuid; v_id uuid;
  v_tok_sol text; v_tok_sol2 text; v_tok_resp text; v_tok_ges text; v_tok_adm text;
  v_num int; v_num2 int; v_num3 int; v_n int; v_uso int; k int;
  v_d demandas.demandas; v_r jsonb; v_r2 jsonb; v_ev jsonb; v_carga jsonb;
  v_fn text; v_prazo text; v_zwsp text := chr(8203);
begin
  perform set_config('demandas.membro', '', true);
  v_prazo := to_char(demandas.hoje() + 10, 'YYYY-MM-DD');

  /* ---- cenario ---- */
  insert into demandas.setores (nome, slug, atende) values ('CONF93 Comunicação', 'conf93-com', true)
    returning id into v_set_com;
  insert into demandas.setores (nome, slug, atende) values ('CONF93 Administrativo', 'conf93-adm', false)
    returning id into v_set_adm;
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, prazo_padrao_dias)
    values ('CONF93 grupo', 'CONF93 arte', v_set_com, false, 5) returning id into v_cat;

  insert into demandas.membros (nome, email, papel, setor_id, token, ativo)
    values ('CONF93 Solicitante', 'conf93sol@exemplo.test', 'solicitante', v_set_adm, 'CONF93TOKSOL', true)
    returning id, token into v_sol, v_tok_sol;
  insert into demandas.membros (nome, email, papel, setor_id, token, ativo)
    values ('CONF93 Outra Pessoa', 'conf93sol2@exemplo.test', 'solicitante', v_set_adm, 'CONF93TOKSOL2', true)
    returning token into v_tok_sol2;
  insert into demandas.membros (nome, email, papel, setor_id, token, ativo, telefone)
    values ('CONF93 Responsavel', 'conf93resp@exemplo.test', 'responsavel', v_set_com, 'CONF93TOKRESP', true,
            '5531900000093')
    returning id, token into v_resp, v_tok_resp;
  /* O GESTOR TAMBEM TEM TELEFONE, E O NOME DELE VEM ANTES NO ALFABETO.
     Sem isso, `contato_do_setor` devolveria a mesma pessoa com qualquer ordem
     (so haveria uma com telefone) e o caso 6 estaria medindo o vazio: a ordem
     que importa e papel primeiro, nome depois, e ela so aparece quando as duas
     ordens discordam. */
  insert into demandas.membros (nome, email, papel, setor_id, token, ativo, telefone)
    values ('CONF93 Gestor', 'conf93ges@exemplo.test', 'gestor', v_set_com, 'CONF93TOKGES', true,
            '5531900000094')
    returning id, token into v_ges, v_tok_ges;
  insert into demandas.membros (nome, email, papel, setor_id, token, ativo)
    values ('CONF93 Admin', 'conf93adm@exemplo.test', 'admin', v_set_adm, 'CONF93TOKADM', true)
    returning token into v_tok_adm;

  /* ---- 1 · reabrir apaga o carimbo, e a etapa 5 do documento acontece duas vezes ---- */
  v_r := public.dem_abrir(v_tok_sol, jsonb_build_object(
    'categoria_id', v_cat, 'titulo', 'CONF93 Arte para validar duas vezes',
    'descricao', 'Vai ser concluida, validada, reaberta, concluida e validada de novo',
    'prazo', v_prazo));
  v_num := (v_r->>'numero')::int;
  perform public.dem_mover(v_tok_resp, v_num, 'assumir');
  perform public.dem_mover(v_tok_resp, v_num, 'concluir', jsonb_build_object('texto', 'Pronto, primeira versao'));
  v_r := public.dem_mover(v_tok_sol, v_num, 'validar', jsonb_build_object('texto', 'Conferi'));
  if not coalesce((v_r->>'ok')::boolean, false) then
    falhas := falhas || format('1: a primeira validacao foi recusada: %s', v_r); end if;

  v_r := public.dem_mover(v_tok_sol, v_num, 'reabrir', jsonb_build_object('texto', 'Faltou a versao vertical'));
  if not coalesce((v_r->>'ok')::boolean, false) then
    falhas := falhas || format('1: reabrir foi recusada: %s', v_r); end if;
  select * into v_d from demandas.demandas where numero = v_num;
  if v_d.validada_em is distinct from null then
    falhas := falhas || '1: reabrir deixou o carimbo de validacao de pe sobre uma demanda reaberta'::text; end if;
  if v_d.validada_por is distinct from null then
    falhas := falhas || '1: reabrir deixou o nome de quem validou de pe sobre uma demanda reaberta'::text; end if;
  if (public.dem_ver(v_tok_sol, v_num)->'demanda'->>'validada_por') is distinct from null then
    falhas := falhas || '1: a ficha continua dizendo quem validou uma demanda que foi reaberta'::text; end if;

  perform public.dem_mover(v_tok_resp, v_num, 'assumir');
  perform public.dem_mover(v_tok_resp, v_num, 'concluir', jsonb_build_object('texto', 'Agora com a vertical'));
  v_r := public.dem_mover(v_tok_sol, v_num, 'validar', jsonb_build_object('texto', 'Conferi de novo'));
  if not coalesce((v_r->>'ok')::boolean, false) then
    falhas := falhas || format('1: validar de novo depois de reabrir foi recusada: %s', v_r); end if;

  /* ---- 2 · quem atende escala; a aprovacao ja concedida continua so do gestor ---- */
  v_r := public.dem_abrir(v_tok_sol, jsonb_build_object(
    'categoria_id', v_cat, 'titulo', 'CONF93 Arte que virou pedido de aval',
    'descricao', 'Nasce sem portao nenhum e no meio da execucao vira dinheiro',
    'prazo', v_prazo));
  v_num2 := (v_r->>'numero')::int;
  perform public.dem_mover(v_tok_resp, v_num2, 'assumir');
  select * into v_d from demandas.demandas where numero = v_num2;
  if v_d.aprovacao is distinct from null then
    falhas := falhas || format('2: o cenario perdeu o sentido, esta demanda devia estar sem portao: %s',
      coalesce(v_d.aprovacao, 'null')); end if;

  v_r := public.dem_mover(v_tok_resp, v_num2, 'travar',
    jsonb_build_object('motivo', 'aprovacao', 'texto', 'Isto passou a envolver dinheiro, precisa de aval'));
  if not coalesce((v_r->>'ok')::boolean, false) then
    falhas := falhas || format('2: quem atende nao consegue pedir aprovacao numa demanda sem portao: %s', v_r); end if;
  select * into v_d from demandas.demandas where numero = v_num2;
  if v_d.status is distinct from 'travada' or v_d.travada_por is distinct from 'aprovacao'
     or v_d.aprovacao is distinct from 'pendente' then
    falhas := falhas || format('2: a escalada nao pos a demanda esperando aprovacao, ficou %s/%s/%s',
      v_d.status, coalesce(v_d.travada_por, 'null'), coalesce(v_d.aprovacao, 'null')); end if;

  /* e ela tem saida, que e a diferenca entre escalar e prender */
  v_r := public.dem_mover(v_tok_ges, v_num2, 'aprovar', jsonb_build_object('texto', 'Pode gastar'));
  if not coalesce((v_r->>'ok')::boolean, false) then
    falhas := falhas || format('2: o gestor nao conseguiu decidir a aprovacao que quem atende pediu: %s', v_r); end if;

  /* O BECO QUE A 92 FECHOU CONTINUA FECHADO: aprovacao ja CONCEDIDA nao volta
     pela mao de quem atende. */
  v_r := public.dem_mover(v_tok_resp, v_num2, 'travar',
    jsonb_build_object('motivo', 'aprovacao', 'texto', 'Quero desfazer o aval que ja foi dado'));
  if (v_r->>'erro') is distinct from 'SO_GESTOR_REABRE_APROVACAO' then
    falhas := falhas || format('2: quem atende reabriu uma aprovacao que o gestor ja tinha concedido: %s', v_r); end if;
  select * into v_d from demandas.demandas where numero = v_num2;
  if v_d.aprovacao is distinct from 'aprovada' then
    falhas := falhas || format('2: a aprovacao concedida mudou de estado na recusa: %s',
      coalesce(v_d.aprovacao, 'null')); end if;
  /* e quem decide continua podendo */
  v_r := public.dem_mover(v_tok_ges, v_num2, 'travar',
    jsonb_build_object('motivo', 'aprovacao', 'texto', 'Mudou o valor, quero olhar de novo'));
  if not coalesce((v_r->>'ok')::boolean, false) then
    falhas := falhas || format('2: o gestor perdeu o direito de reabrir a aprovacao: %s', v_r); end if;

  /* ---- 3 · o historico chega com teto, na ordem que a ficha imprime ---- */
  v_r := public.dem_abrir(v_tok_sol, jsonb_build_object(
    'categoria_id', v_cat, 'titulo', 'CONF93 Demanda com historico longo',
    'descricao', 'Duzentos e sessenta eventos visiveis e tres internos',
    'prazo', v_prazo));
  v_num3 := (v_r->>'numero')::int;
  select id into v_id from demandas.demandas where numero = v_num3;
  /* a abertura vai para tras de tudo: assim ela e o evento MAIS ANTIGO, e o
     recorte dos 200 mais recentes tem que deixa-la de fora */
  update demandas.eventos set em = now() - interval '1 hour' where demanda_id = v_id;
  for k in 1..259 loop
    insert into demandas.eventos (demanda_id, membro_id, tipo, texto, em)
      values (v_id, v_resp, 'comentario',
              'CONF93 evento ' || lpad(k::text, 4, '0') || ' ' || repeat('a', 3960),
              now() - interval '1 second' * (260 - k));
  end loop;
  insert into demandas.eventos (demanda_id, membro_id, tipo, texto, interno, em)
    select v_id, v_resp, 'comentario', 'CONF93 interno ' || i, true, now() - interval '500 milliseconds'
      from generate_series(1, 3) i;

  v_r := public.dem_ver(v_tok_sol, v_num3);
  v_ev := v_r->'eventos';
  if jsonb_array_length(v_ev) is distinct from 200 then
    falhas := falhas || format('3: dem_ver devolveu %s eventos numa demanda de 260, e o teto e 200',
      jsonb_array_length(v_ev)); end if;
  if length(v_r::text) > 950000 then
    falhas := falhas || format('3: a ficha voltou com %s bytes numa chamada so', length(v_r::text)); end if;
  if exists (select 1 from jsonb_array_elements(v_ev) x where x->>'tipo' is not distinct from 'abertura') then
    falhas := falhas || '3: o recorte pegou o comeco do historico, e nao os 200 mais recentes'::text; end if;
  if not exists (select 1 from jsonb_array_elements(v_ev) x
                  where x->>'texto' like 'CONF93 evento 0259%') then
    falhas := falhas || '3: o evento MAIS RECENTE ficou de fora do recorte'::text; end if;
  if (v_ev->0->>'em')::timestamptz >= (v_ev->199->>'em')::timestamptz then
    falhas := falhas || '3: o historico chegou de tras para frente, e a ficha imprime na ordem em que recebe'::text; end if;
  if (v_r->>'eventos_total')::int is distinct from 260 then
    falhas := falhas || format('3: eventos_total disse %s para quem pediu, e ele ve 260',
      coalesce(v_r->>'eventos_total', 'nada')); end if;
  if (public.dem_ver(v_tok_resp, v_num3)->>'eventos_total')::int is distinct from 263 then
    falhas := falhas || format('3: eventos_total disse %s para quem atende, e ele ve 263 (com os tres internos)',
      coalesce(public.dem_ver(v_tok_resp, v_num3)->>'eventos_total', 'nada')); end if;
  /* e o interno continua invisivel para quem pediu, que e a regra da 50 */
  if exists (select 1 from jsonb_array_elements(v_ev) x where (x->>'interno')::boolean) then
    falhas := falhas || '3: o recorte trouxe comentario interno para quem pediu'::text; end if;

  /* ---- 4 · dinheiro com digito demais ---- */
  begin
    v_r := public.dem_abrir(v_tok_sol, jsonb_build_object(
      'categoria_id', v_cat, 'titulo', 'CONF93 Valor de onze digitos',
      'descricao', 'Nao cabe em numeric(12,2)', 'orcamento', '99999999999', 'prazo', v_prazo));
    if (v_r->>'erro') is distinct from 'ORCAMENTO_INVALIDO' then
      falhas := falhas || format('4: dem_abrir aceitou um valor que nao cabe na coluna: %s', v_r); end if;
  exception when others then
    falhas := falhas || format('4: dem_abrir levantou %s cru com um valor de onze digitos', SQLSTATE);
  end;
  /* e o maior valor que CABE continua entrando: regra mais apertada que a
     coluna seria a migracao inventando um teto de gasto */
  v_r := public.dem_abrir(v_tok_sol, jsonb_build_object(
    'categoria_id', v_cat, 'titulo', 'CONF93 Valor no limite da coluna',
    'descricao', 'Dez digitos inteiros e dois decimais', 'orcamento', '9999999999.99', 'prazo', v_prazo));
  if not coalesce((v_r->>'ok')::boolean, false) then
    falhas := falhas || format('4: o maior valor que cabe na coluna foi recusado: %s', v_r); end if;

  v_r := public.dem_abrir(v_tok_sol, jsonb_build_object(
    'categoria_id', v_cat, 'titulo', 'CONF93 Valor que chega na resposta da trava',
    'descricao', 'A triagem pergunta quanto custa e a resposta traz o numero', 'prazo', v_prazo));
  v_num2 := (v_r->>'numero')::int;
  perform public.dem_mover(v_tok_resp, v_num2, 'travar',
    jsonb_build_object('motivo', 'informacao', 'texto', 'Quanto custa?'));
  begin
    v_r := public.dem_mover(v_tok_sol, v_num2, 'destravar',
      jsonb_build_object('texto', 'Custa isto aqui', 'orcamento', '99999999999'));
    if (v_r->>'erro') is distinct from 'ORCAMENTO_INVALIDO' then
      falhas := falhas || format('4: destravar aceitou um valor que nao cabe na coluna: %s', v_r); end if;
  exception when others then
    falhas := falhas || format('4: destravar levantou %s cru com um valor de onze digitos', SQLSTATE);
  end;

  begin
    v_r := public.dem_ajustar(v_tok_adm, 'setor',
      jsonb_build_object('id', v_set_com, 'teto_sem_aprovacao', '99999999999'));
    if (v_r->>'erro') is distinct from 'VALOR_INVALIDO' then
      falhas := falhas || format('4: o teto do setor aceitou um valor que nao cabe na coluna: %s', v_r); end if;
  exception when others then
    falhas := falhas || format('4: dem_ajustar levantou %s cru com um teto de onze digitos', SQLSTATE);
  end;
  /* AS DUAS CAMADAS, UMA A UMA, NAS TRES PORTAS.

     Os casos de cima ficam verdes com QUALQUER uma das duas: com a regex, a
     funcao recusa antes de tocar no banco; sem ela, o estouro cai na rede e
     vira a mesma resposta. Entao eles nao distinguem uma camada da outra, e
     este bloco e o que distingue. Ele le o texto da funcao, que e o que a 92
     ja fazia com os ramos mortos de `fn_historico`, e esta escrito aqui que e
     isso que ele esta fazendo, porque conferencia que pergunta ao acusado
     precisa dizer que perguntou. */
  foreach v_fn in array array['public.dem_abrir(text,jsonb)',
                              'public.dem_mover(text,int,text,jsonb)',
                              'public.dem_ajustar(text,text,jsonb)'] loop
    if position('[0-9]{1,10}' in pg_get_functiondef(v_fn::regprocedure)) = 0 then
      falhas := falhas || format('4: %s voltou a aceitar dinheiro sem limite de digitos', v_fn); end if;
    if position('numeric_value_out_of_range' in pg_get_functiondef(v_fn::regprocedure)) = 0 then
      falhas := falhas || format('4: %s ficou sem rede: o estouro que escapar da regex sai 22003 cru', v_fn); end if;
  end loop;

  /* ---- 5 · re-travar entra no historico, e nao duplica o evento de status ---- */
  v_r := public.dem_abrir(v_tok_sol, jsonb_build_object(
    'categoria_id', v_cat, 'titulo', 'CONF93 Trava que troca de motivo',
    'descricao', 'Trava por informacao, depois por terceiros, depois so a nota',
    'prazo', v_prazo));
  v_num2 := (v_r->>'numero')::int;
  select id into v_id from demandas.demandas where numero = v_num2;
  perform public.dem_mover(v_tok_resp, v_num2, 'assumir');
  perform public.dem_mover(v_tok_resp, v_num2, 'travar',
    jsonb_build_object('motivo', 'informacao', 'texto', 'Falta o arquivo do convite'));
  select count(*)::int into v_n from demandas.eventos where demanda_id = v_id and tipo = 'trava';
  if v_n is distinct from 0 then
    falhas := falhas || format('5: a primeira trava virou evento duplo (status e trava): %s de trava', v_n); end if;

  perform public.dem_mover(v_tok_resp, v_num2, 'travar',
    jsonb_build_object('motivo', 'terceiros', 'texto', 'A grafica e que nao respondeu'));
  select count(*)::int into v_n from demandas.eventos where demanda_id = v_id and tipo = 'trava';
  if v_n is distinct from 1 then
    falhas := falhas || format('5: re-travar com outro motivo deixou %s evento(s) de trava, e devia deixar 1', v_n); end if;
  if not exists (select 1 from demandas.eventos e
                  where e.demanda_id = v_id and e.tipo = 'trava'
                    and e.de is not distinct from 'informacao'
                    and e.para is not distinct from 'terceiros'
                    and e.texto is not distinct from 'A grafica e que nao respondeu'
                    and e.membro_id is not distinct from v_resp) then
    falhas := falhas || '5: o evento da trava nao diz de onde, para onde, com que nota e por quem'::text; end if;

  perform public.dem_mover(v_tok_resp, v_num2, 'travar',
    jsonb_build_object('motivo', 'terceiros', 'texto', 'A grafica respondeu, agora e o prazo dela'));
  select count(*)::int into v_n from demandas.eventos where demanda_id = v_id and tipo = 'trava';
  if v_n is distinct from 2 then
    falhas := falhas || format('5: trocar so a nota da trava nao entrou no historico (%s de 2)', v_n); end if;
  /* e a trava identica nao inventa linha: toque duplo nao e mudanca */
  perform public.dem_mover(v_tok_resp, v_num2, 'travar',
    jsonb_build_object('motivo', 'terceiros', 'texto', 'A grafica respondeu, agora e o prazo dela'));
  select count(*)::int into v_n from demandas.eventos where demanda_id = v_id and tipo = 'trava';
  if v_n is distinct from 2 then
    falhas := falhas || format('5: re-travar com o mesmo motivo e a mesma nota inventou evento (%s de 2)', v_n); end if;
  /* e destravar continua com UM evento so, o de status */
  perform public.dem_mover(v_tok_sol, v_num2, 'destravar', jsonb_build_object('texto', 'Respondido'));
  select count(*)::int into v_n from demandas.eventos where demanda_id = v_id and tipo = 'trava';
  if v_n is distinct from 2 then
    falhas := falhas || format('5: destravar escreveu evento de trava por cima do de status (%s de 2)', v_n); end if;

  /* ---- 6 · o toque duplo devolve a demanda que ja existe ---- */
  v_carga := jsonb_build_object('categoria_id', v_cat,
    'titulo', 'CONF93 A mesma demanda no 4G ruim',
    'descricao', 'Tocou, a barrinha girou, recarregou a pagina e mandou de novo',
    'prazo', v_prazo);
  v_r  := public.dem_abrir(v_tok_sol, v_carga);
  v_r2 := public.dem_abrir(v_tok_sol, v_carga);
  if (v_r2->>'numero')::int is distinct from (v_r->>'numero')::int then
    falhas := falhas || format('6: o toque duplo abriu duas demandas: #%s e #%s',
      v_r->>'numero', v_r2->>'numero'); end if;
  if (v_r2->>'repetido')::boolean is distinct from true then
    falhas := falhas || format('6: a segunda chamada nao disse que era repeticao: %s', v_r2); end if;
  select count(*)::int into v_n from demandas.demandas
   where titulo = 'CONF93 A mesma demanda no 4G ruim';
  if v_n is distinct from 1 then
    falhas := falhas || format('6: %s demandas com o mesmo titulo, da mesma pessoa, no mesmo instante', v_n); end if;
  /* a resposta da repeticao precisa servir a MESMA tela de "pronto": e ali que
     o recado de WhatsApp para quem vai atender e montado */
  if (v_r2->>'setor_responsavel') is distinct from (v_r->>'setor_responsavel')
     or (v_r2->'contato') is distinct from (v_r->'contato')
     or (v_r2->>'precisa_aprovacao') is distinct from (v_r->>'precisa_aprovacao') then
    falhas := falhas || format('6: a resposta da repeticao nao serve a tela de pronto: %s', v_r2); end if;
  /* e o contato continua sendo quem ATENDE, e nao quem manda: o recado e para
     quem vai fazer. Ver o bloco 1. */
  if (v_r->'contato'->>'nome') is distinct from 'CONF93 Responsavel' then
    falhas := falhas || format('6: o contato do setor deixou de ser quem atende: %s',
      coalesce(v_r->'contato'->>'nome', 'ninguem')); end if;

  /* o titulo e comparado JA LIMPO: a mesma frase com um invisivel no meio e a
     mesma frase, e a 92 mediu esse invisivel chegando de tela de celular */
  v_r2 := public.dem_abrir(v_tok_sol, v_carga || jsonb_build_object(
    'titulo', 'CONF93 A mesma demanda no 4G' || v_zwsp || ' ruim'));
  if (v_r2->>'numero')::int is distinct from (v_r->>'numero')::int then
    falhas := falhas || format('6: o mesmo titulo com um invisivel no meio abriu outra demanda: #%s',
      v_r2->>'numero'); end if;

  /* titulo diferente da mesma pessoa e demanda nova */
  v_r2 := public.dem_abrir(v_tok_sol,
    v_carga || jsonb_build_object('titulo', 'CONF93 Outra demanda no mesmo minuto'));
  if (v_r2->>'numero')::int is not distinct from (v_r->>'numero')::int then
    falhas := falhas || '6: a guarda do toque duplo engoliu uma demanda de titulo diferente'::text; end if;
  /* o mesmo titulo de OUTRA pessoa tambem e demanda nova */
  v_r2 := public.dem_abrir(v_tok_sol2, v_carga);
  if (v_r2->>'numero')::int is not distinct from (v_r->>'numero')::int then
    falhas := falhas || '6: a guarda do toque duplo engoliu a demanda de outra pessoa'::text; end if;
  /* e fora da janela e outra demanda, e nao repeticao: quem pede duas vezes a
     mesma coisa em dias diferentes esta pedindo duas vezes */
  update demandas.demandas set criada_em = now() - interval '5 minutes'
   where titulo = 'CONF93 A mesma demanda no 4G ruim';
  v_r2 := public.dem_abrir(v_tok_sol, v_carga);
  if (v_r2->>'repetido') is not distinct from 'true' then
    falhas := falhas || '6: uma demanda de cinco minutos atras foi tratada como toque duplo'::text; end if;

  /* ---- 7 · as colunas mortas da 90 ---- */
  select count(*)::int into v_n from information_schema.columns c
   where c.table_schema = 'demandas' and c.table_name = 'demandas'
     and c.column_name in ('avisado_em','aviso_motivo');
  if v_n is distinct from 0 then
    execute (select 'select count(*)::int from demandas.demandas where '
                    || string_agg(c.column_name || ' is not null', ' or ')
               from information_schema.columns c
              where c.table_schema = 'demandas' and c.table_name = 'demandas'
                and c.column_name in ('avisado_em','aviso_motivo')) into v_uso;
    if v_uso is distinct from 0 then
      raise notice '93 · conferencia: as colunas da 90 ficaram porque % linha(s) tem carimbo.', v_uso;
    else
      falhas := falhas || format(
        '7: %s coluna(s) da 90 continuam na tabela sem uma unica linha carimbada', v_n);
    end if;
  end if;

  /* ---- limpeza ---- */
  delete from demandas.avisos a using demandas.demandas d
   where a.demanda_id = d.id and d.titulo like 'CONF93%';
  delete from demandas.eventos e using demandas.demandas d
   where e.demanda_id = d.id and d.titulo like 'CONF93%';
  delete from demandas.anexos a using demandas.demandas d
   where a.demanda_id = d.id and d.titulo like 'CONF93%';
  delete from demandas.demandas where titulo like 'CONF93%';
  delete from demandas.membros where nome like 'CONF93%';
  /* `like`, e nao `=`: a licao da 92. Se uma sabotagem mexer na funcao que
     limpa texto, o que foi gravado nao e o que este bloco escreveu, a limpeza
     erra a linha, a chave estrangeira segura o delete do setor e a bateria ve
     um erro de FK no lugar da reprovacao que o bloco ja tinha escrito. */
  delete from demandas.categorias where grupo like 'CONF93%';
  delete from demandas.setores where nome like 'CONF93%';

  /* ---- 8 · o inventario da porta publica bate com o catalogo ----

     Nao basta conferir que a linha nova entrou: quem mede isto de verdade e
     `testar_porta_publica()`, que a 77 escreveu para olhar nos DOIS sentidos.
     Chamar a funcao dela aqui e o que faz esta conferencia reprovar no dia em
     que a proxima migracao mudar uma assinatura e esquecer o inventario. */
  if to_regprocedure('public.testar_porta_publica()') is not null then
    if exists (select 1 from public.testar_porta_publica() t where not t.passou) then
      falhas := falhas || format('8: o inventario da porta publica nao bate com o catalogo: %s',
        (select string_agg(t.caso || ' esperava ' || t.esperado || ', veio ' || t.obtido, ' ; ')
           from public.testar_porta_publica() t where not t.passou));
    end if;
  end if;
  if to_regclass('public.porta_publica') is not null then
    if not exists (select 1 from public.porta_publica
                    where funcao = 'dem_numeros(p_token text, p_de text, p_ate text)') then
      falhas := falhas || '8: a assinatura nova de dem_numeros nao foi declarada no inventario'::text; end if;
    if exists (select 1 from public.porta_publica
                where funcao = 'dem_numeros(p_token text, p_de date, p_ate date)') then
      falhas := falhas || '8: a assinatura velha de dem_numeros continua declarada'::text; end if;
  end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'93 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 93 · conferencia: 8 blocos. Reabrir apaga o carimbo da validacao e a etapa 5 do documento acontece de novo, quem atende escala para aprovacao sem conseguir reabrir a que ja foi concedida, o historico chega com teto de 200 na ordem crescente e com o total que a pessoa pode ver, valor de onze digitos vira recusa em vez de 22003 nas tres portas, re-travar entra no historico sem duplicar o evento de status, o toque duplo devolve a demanda que ja existe com a resposta inteira, as colunas mortas da 90 sairam, e o inventario da porta publica voltou a bater com o catalogo.';
end $conf$;

insert into public.schema_versao (n, arquivo)
  values (93, '93-o-carimbo-velho-sobre-trabalho-novo-e-a-ficha-de-20-mb.sql')
  on conflict (n) do nothing;

commit;
