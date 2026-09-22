/* =============================================================================
   92 · O TETO ERA DE QUEM PEDE, E O INVISIVEL PASSAVA PELO MEIO
   22/09/2026

   Quinta auditoria adversarial, independente, contra o banco real na 91. Doze
   achados. Dez viraram conserto aqui; dois estao no fim do arquivo, com o
   motivo de nao terem virado.

   Cada paragrafo abaixo traz a MEDIDA que o conserto existe para matar. Onde
   nao ha medida, nao ha conserto.

   ---------------------------------------------------------------------------
   1 · A LISTA DE INVISIVEIS COBRIA 159 DE 4174, E O MIOLO DO TEXTO NAO ERA
       OLHADO POR NINGUEM

   Medido, contra a 91:

     select count(*) total,
            count(*) filter (where regexp_replace(chr(cp), demandas.invisiveis(),
                                                  '', 'g') <> '') passam
       from (<as faixas Default_Ignorable_Code_Point>) t;
      total | passam
       4174 |   4015

   A 89 escreveu "toda a categoria Cf, toda a Zs" e era verdade; o que ela nao
   cobriu foi o terceiro conjunto, `Default_Ignorable_Code_Point`, que tem 4174
   pontos. O buraco maior e o plano de tags, U+E0000 a U+E0FFF: 4096 pontos, dos
   quais a 89 conhecia 97.

   E `limpo()` apara nas PONTAS, de proposito, desde a 84. Entao um caractere de
   reordenacao bidirecional no MEIO do titulo atravessava tudo:

     select public.dem_abrir('tk-jovem', jsonb_build_object(
       'categoria_id', '<arte>',
       'titulo', 'Transferir R$ 10' || chr(8238) || '00,00 para o fornecedor', ...));
     -> {"ok": true, "numero": 122}
     select titulo from demandas.demandas where numero = 122;
     -> Transferir R$ 10<U+202E>00,00 para o fornecedor

   O U+202E (RIGHT-TO-LEFT OVERRIDE) manda o renderizador desenhar de tras para
   frente o que vem depois dele. Quem le a lista no celular ve um numero que nao
   e o numero gravado. Isto tem nome desde 2021: Trojan Source.

   A DECISAO SOBRE O MIOLO, QUE E A PARTE DIFICIL

   Apagar todo invisivel do meio quebraria texto legitimo: um `\n` dentro de uma
   descricao e conteudo, e uma descricao e varias linhas. Entao a regra se parte
   em duas, e as duas estao escritas em funcao separada para nao se confundirem:

     `limpo()`     · apara as pontas (como desde a 84) E apaga o REORDENADOR em
                     qualquer posicao. Reordenador e o subconjunto que inverte a
                     leitura: U+202A a U+202E e U+2066 a U+2069. Nenhum campo
                     deste sistema precisa de um, e o efeito de deixar passar e
                     mostrar na tela um texto diferente do gravado. O `\n` da
                     descricao continua intocado.
     `uma_linha()` · para o TITULO, que e uma linha so e e o que distingue uma
                     demanda de outra numa lista. Tudo que e invisivel no meio
                     vira UM espaco, e o que sobra nas pontas sai.

   O custo de `uma_linha()` esta medido e aceito: um titulo com emoji composto
   por ZWJ (familia, bandeira) se parte nos emoji componentes, e um seletor de
   variacao cai. Em troca, dois titulos que se LEEM iguais sao o MESMO texto, e
   e isso que um rotulo de lista precisa garantir. Descricao nao passa por aqui.

   ---------------------------------------------------------------------------
   2 · O PORTAO DE APROVACAO ERA ESCOLHIDO POR QUEM PEDE

   Medido, do comeco ao fim, com os tokens de teste:

     dem_abrir('tk-jovem', {categoria: 'Solicitação de orçamento',
                            orcamento: '999999.99'})   -> ok, numero 124
     select status, aprovacao from ... where numero = 124;   -> aberta | null
     dem_mover('tk-compras', 124, 'assumir')            -> ok
     dem_mover('tk-compras', 124, 'concluir')           -> ok
     select tipo from demandas.eventos ...;
       abertura | status | responsavel | status
       (nenhum evento de aprovacao)

   R$ 999.999,99 nasceram, andaram e fecharam com um `responsavel` sozinho,
   porque `exige_aprovacao` e uma flag da CATEGORIA e nada no banco olhava para
   o VALOR. Quem pede escolhe a categoria; logo, quem pede escolhe se o portao
   existe.

   O conserto e um TETO POR SETOR, `demandas.setores.teto_sem_aprovacao`, com
   default NULL. NULL significa "sem teto" e preserva o comportamento de hoje
   byte a byte: `falta_aprovacao` so soma o teto quando ele existe.

   NAO ESCOLHI UM VALOR PADRAO, e isso nao e omissao. Quanto um setor da igreja
   pode gastar sem passar por alguem e decisao de quem responde pelo dinheiro,
   nao de quem escreve a migracao. A coluna nasce vazia e a tela de Ajustes
   passa a ter onde escrever o numero.

   O teto e do setor que ATENDE, e nao do que pede: quem gasta e quem executa.

   ---------------------------------------------------------------------------
   3 · `dem_ajustar` VALIDAVA COM `limpo()` E GRAVAVA COM `btrim()`

   Medido:

     dem_ajustar('tk-admin','categoria',
       {grupo:'Comunicação e divulgação', nome: chr(8203) || 'Criação de arte'})
     -> {"ok": true, "id": "c75ee383-..."}

     select id, nome, length(nome) from demandas.categorias
      where grupo = 'Comunicação e divulgação' and nome like '%Criação de arte%';
       d79ca3b3... | Criação de arte  | 15
       c75ee383... | <ZWSP>Criação de arte | 16

   `btrim()` tira espaco ASCII e mais nada. `limpo()` disse "tem nome"; `btrim()`
   gravou o nome COM o invisivel; o UNIQUE (grupo, nome) viu dois textos
   diferentes; e o `on conflict do update` que a 88 escreveu para nao ignorar
   campo em silencio nao casou, porque a chave era outra. Duas categorias
   visualmente identicas nos seletores, e quem escolher a errada bate num portao
   que nao entende.

   Grava-se agora o MESMO texto que foi validado, e o texto de um cadastro e
   `uma_linha()`: nome de setor, de categoria e de pessoa sao rotulos de uma
   linha, igual ao titulo.

   ---------------------------------------------------------------------------
   4 · `url_boa` CAIA COM PERCENT-ENCODING

   Medido:

     select u, demandas.url_boa(u), demandas.url_host(u) from (values
       ('https://confiavel.com%40malicioso.com/x.pdf'),
       ('https://192.168.0.%31/segredo.pdf'),
       ('https://127.0.0.1%2e/x.pdf')) v(u);
       https://confiavel.com%40malicioso.com/x.pdf | t | confiavel.com%40malicioso.com
       https://192.168.0.%31/segredo.pdf           | t | 192.168.0.%31
       https://127.0.0.1%2e/x.pdf                  | t | 127.0.0.1%2e

   O navegador le `%40` como `@`, entao o host de verdade do primeiro e
   `malicioso.com` e o que aparece escrito e `confiavel.com`. O guarda do arroba
   olhava a autoridade CRUA e nao via arroba nenhum. O guarda de IP olhava o
   ultimo rotulo e `%31` nao e digito.

   O conserto e decodificar antes de julgar. Duas passadas, e nao uma, porque
   `%2540` volta a `%40` na primeira e so vira `@` na segunda; autoridade de
   verdade nunca tem `%25` dentro, entao a segunda passada nao custa nada
   legitimo. A decodificacao serve so para JULGAR: o que se grava continua sendo
   o que a pessoa colou.

   ---------------------------------------------------------------------------
   5 · `travar` COM MOTIVO `aprovacao`: A GUARDA ERA NULL

   Medido, numa demanda de categoria que nao exige aprovacao:

     select (aprovacao = 'aprovada') is null from ...;   -> t
     dem_mover('tk-com', 125, 'travar', {motivo:'aprovacao', texto:'...'}) -> ok
     select status, travada_por, aprovacao from ...;  -> travada | aprovacao | pendente
     dem_mover('tk-com',   125, 'destravar', ...) -> {"erro": "FALTA_APROVACAO"}
     dem_mover('tk-jovem', 125, 'destravar', ...) -> {"erro": "FALTA_APROVACAO"}
     dem_mover('tk-com',   125, 'aprovar')        -> {"erro": "SO_GESTOR"}
     dem_mover('tk-jovem', 125, 'aprovar')        -> {"erro": "SO_GESTOR"}

   Um `responsavel` pos a demanda num estado que nem ele nem quem abriu
   conseguem desfazer, e ela fica ali ate um gestor aparecer. A guarda dizia
   `d.aprovacao = 'aprovada'`, e com `aprovacao` NULL a comparacao inteira e
   NULL: `if NULL then` nao entra, e o `and` que vinha depois nunca foi lido.

   ---------------------------------------------------------------------------
   6 · 17 CHECK DO SCHEMA ESTAVAM `not valid`

     select count(*) from pg_constraint
      where connamespace = 'demandas'::regnamespace and contype = 'c'
        and not convalidated;   -> 17

   `not valid` quer dizer "vale para linha nova, nunca foi conferida nas
   antigas". Uma regra que nunca foi conferida nao e uma regra: e uma intencao.
   Elas passam a valer aqui, depois de um bloco de reparo, que e a ordem que a
   89 fixou.

   ---------------------------------------------------------------------------
   7 · `pode_ver` E `pode_atender` DEVOLVIAM NULL

     m.papel := null; m.setor_id := null;
     demandas.pode_ver(m, d)      -> NULL
     demandas.pode_atender(m, d)  -> NULL

   Hoje e latente: toda chamada confere `m.id is null` antes. Latente e o estado
   anterior de um defeito, nao a ausencia dele. `coalesce(..., false)` fecha.

   ---------------------------------------------------------------------------
   8 · `demandas.setores` NAO TINHA UNIQUE EM `nome`

     dem_ajustar('tk-admin','setor',
       {nome:'Compras e suprimentos', slug:'compras-2', atende:'true'}) -> ok
     select nome, slug, atende from demandas.setores where nome = 'Compras e suprimentos';
       Compras e suprimentos | compras   | t
       Compras e suprimentos | compras-2 | t

   Dois setores com o mesmo nome, os dois atendendo. `slug` ja era unique; o
   nome, que e o que a pessoa le na tela, nao era.

   ---------------------------------------------------------------------------
   9 · `fn_historico` REGISTRAVA TRES MUDANCAS QUE NENHUMA ACAO CONSEGUIA FAZER

     select p.oid::regprocedure from pg_proc p
      where pg_get_functiondef(p.oid) ~* 'update demandas.demandas' and p.prokind='f';
      -> dem_mover(text,integer,text,jsonb)          (e so ela)
     e `dem_mover` nao escreve em `titulo`, `descricao` nem `orcamento`.

   Tres ramos vivos aparencia, mortos de fato. O PDF pede, na regra 5, que
   "demandas de compra devem conter orcamento estimado, quando possivel", e a
   triagem precisa poder cobrar o valor DEPOIS da abertura, que e quando a
   pergunta costuma aparecer. Entao um dos tres ramos ganha uma acao: `destravar`
   passa a aceitar `orcamento`. Os outros dois saem: codigo morto com cara de
   vivo e a familia de defeito que estas auditorias existem para achar.

   ---------------------------------------------------------------------------
   10 · `dem_numeros` TINHA CAST CEGO NOS PARAMETROS `date`

     select public.dem_numeros('tk-gestor','2026-13-45',null);
     ERROR:  date/time field value out of range: "2026-13-45"

   O erro sai do cast do PostgREST antes de a funcao comecar, entao o
   `exception` dela nao alcanca. A tela de indicadores imprime `22008` cru para
   uma pessoa da igreja. A assinatura passa a ser `text` e a funcao decide
   sozinha, com `PERIODO_INVALIDO`.

   POR QUE A ANTIGA NAO FICA DELEGANDO PARA A NOVA

   Porque manter as duas QUEBRA o chamador, em vez de proteger. O PostgREST
   escolhe a funcao pelo NOME e pelo conjunto de nomes de argumento do corpo
   JSON; `lib/demandas/api.ts` manda `{p_token, p_de, p_ate}`, que casa
   exatamente com as duas, e a resposta vira `PGRST203 Could not choose the best
   candidate function`. E o chamador de hoje ja manda TEXTO: `somaDias(...)`
   devolve 'YYYY-MM-DD' e `p_de: de || null` vira string JSON ou null. Trocar a
   assinatura mantendo nome e nomes de argumento e a unica forma de o deploy
   poder acontecer em qualquer ordem, e nenhum arquivo da tela precisa mudar.

   O QUE QUASE PASSOU DESPERCEBIDO AQUI: assinatura nova nasce SEM grant. A
   primeira versao deste bloco deu EXECUTE so para `authenticated`, e isso
   fecharia a tela de indicadores para todo gestor que entra pelo LINK PESSOAL,
   que para o PostgREST e `anon`. A 50 da `anon, authenticated` para as nove
   funcoes `dem_*` por esse motivo, e a 92 repete os dois. Ha caso na conferencia
   e sabotagem na bateria para os dois papeis, porque este e o tipo de defeito
   que so aparece na mao de quem usa.

   DEPOIS DE APLICAR: o PostgREST guarda o desenho das funcoes em cache. O
   Supabase manda recarregar sozinho depois de DDL; se a tela responder
   `PGRST202` logo apos o deploy, e so isso, e passa com
   `notify pgrst, 'reload schema'`.

   ---------------------------------------------------------------------------
   O QUE ESTE ARQUIVO NAO FAZ, E POR QUE

   · `demandas.quem()` amarra identidade ao e-mail do JWT sem exigir e-mail
     confirmado, e CONTINUA assim. Nao da para decidir sem a configuracao do
     Auth do projeto: `/demandas/entrar` tem tres portas (link, senha e criar
     senha), e so a do link confirma o e-mail por construcao. Se "Confirm email"
     estiver desligado no painel, uma conta com senha existe sem e-mail
     confirmado; se estiver ligado, exigir o claim nao muda nada. Pior: nao vi
     um JWT de producao deste projeto, e nas versoes recentes do GoTrue o
     `email_verified` mora em `user_metadata`, nao na raiz. Exigir um claim que
     talvez nao exista tranca TODO MUNDO para fora. Sem ver o painel, mexer aqui
     e apostar com a porta de entrada de outra pessoa.

   · `authenticated` tem TRUNCATE em 22 tabelas de `public`, e este arquivo nao
     toca nelas. Medido: nenhuma tabela de Demandas mora em `public` (todas as
     dez estao no schema `demandas`, que nao tem USAGE para `anon` nem para
     `authenticated`), entao esse grant nao alcanca nada deste sistema. As 22
     sao do sistema de escalas, que nao e desta casa. Fica no relatorio; a
     conferencia deste arquivo prova o alcance, e nao conserta o que e de la.
   ============================================================================= */
do $tranca$begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(92);
  end if;
end
$tranca$;

begin;

/* -------------------------------------------------------------------------
   1 · A CLASSE DE INVISIVEIS, AGORA INTEIRA

   Tres conjuntos somados, e nao uma lista de casos vistos: Cf (170 pontos), Zs
   (17) e Default_Ignorable_Code_Point (4174). Continua escrita com `chr()`
   porque a versao com os caracteres literais era invisivel no editor e
   impossivel de conferir lendo.

   O que mudou em relacao a 89, ponto a ponto:
     U+17B4-17B5   entrou   (vogais inerentes khmer, nada desenham)
     U+180B-180F   ampliou  (so U+180E estava; faltavam os seletores mongois)
     U+2065        entrou   (buraco entre 2060-2064 e 2066-206F)
     U+FFF0-FFF8   entrou   (so FFF9-FFFB estavam)
     U+E0000-E0FFF ampliou  (so E0001 e E0020-E007F estavam: 97 de 4096)
   ------------------------------------------------------------------------- */
/* A CLASSE VEM EM DUAS METADES, E NAO E ARRUMACAO.

   Quem apaga invisivel do meio de um texto precisa saber se aquele caractere
   DESENHA UM VAO ou nao desenha nada. NBSP desenha um vao: tirar sem por espaco
   no lugar cola duas palavras. ZWSP nao desenha nada: por espaco no lugar
   inventa um vao que ninguem via. Sao tratamentos opostos, e uma lista so nao
   consegue expressar os dois.

   As duas metades sao o MIOLO da classe, sem colchete, para `invisiveis()`
   continuar sendo UMA lista, que foi o que a 89 comprou caro. */
create or replace function demandas.classe_vao() returns text
language sql immutable parallel safe as $fn$
  select '[:space:]'                           -- espaco, tab, quebras de linha
      || chr(133)                              -- U+0085  NEL
      || chr(160)                              -- U+00A0  NBSP
      || chr(5760)                             -- U+1680  ogham space
      || chr(8192) || '-' || chr(8202)         -- U+2000-200A  espacos tipograficos
      || chr(8232) || '-' || chr(8233)         -- U+2028-2029  line/paragraph separator
      || chr(8239)                             -- U+202F  narrow NBSP
      || chr(8287)                             -- U+205F  medium math space
      || chr(12288)                            -- U+3000  ideographic space
$fn$;

create or replace function demandas.classe_zero() returns text
language sql immutable parallel safe as $fn$
  select chr(173)                              -- U+00AD  soft hyphen
      || chr(847)                              -- U+034F  combining grapheme joiner
      || chr(1536) || '-' || chr(1541)         -- U+0600-0605  arabic number signs
      || chr(1564)                             -- U+061C  arabic letter mark
      || chr(1757)                             -- U+06DD  arabic end of ayah
      || chr(1807)                             -- U+070F  syriac abbreviation mark
      || chr(2192) || '-' || chr(2193)         -- U+0890-0891
      || chr(2274)                             -- U+08E2
      || chr(4447) || '-' || chr(4448)         -- U+115F-1160  preenchedores Hangul
      || chr(6068) || '-' || chr(6069)         -- U+17B4-17B5  vogais inerentes khmer
      || chr(6155) || '-' || chr(6159)         -- U+180B-180F  seletores mongois + MVS
      || chr(8203) || '-' || chr(8207)         -- U+200B-200F  ZWSP/ZWNJ/ZWJ/LRM/RLM
      || chr(8234) || '-' || chr(8238)         -- U+202A-202E  LRE RLE PDF LRO RLO
      || chr(8288) || '-' || chr(8303)         -- U+2060-206F  word joiner .. deprecated
      || chr(10240)                            -- U+2800  braille em branco
      || chr(12644)                            -- U+3164  hangul filler
      || chr(65024) || '-' || chr(65039)       -- U+FE00-FE0F  seletores de variacao
      || chr(65279)                            -- U+FEFF  BOM
      || chr(65440)                            -- U+FFA0  halfwidth hangul filler
      || chr(65520) || '-' || chr(65531)       -- U+FFF0-FFFB  reservados + interlinear
      || chr(69821) || chr(69837)              -- U+110BD U+110CD  kaithi number sign
      || chr(78896) || '-' || chr(78911)       -- U+13430-1343F  egyptian format controls
      || chr(113824) || '-' || chr(113827)     -- U+1BCA0-1BCA3  shorthand format
      || chr(119155) || '-' || chr(119162)     -- U+1D173-1D17A  musical format
      || chr(917504) || '-' || chr(921599)     -- U+E0000-E0FFF  plano de tags INTEIRO
$fn$;

create or replace function demandas.invisiveis() returns text
language sql immutable parallel safe as $fn$
  select '[' || demandas.classe_vao() || demandas.classe_zero() || ']'
$fn$;

comment on function demandas.invisiveis() is
  'A classe de caracteres que nao desenham nada: Cf + Zs + '
  'Default_Ignorable_Code_Point, os tres inteiros. Na 89 eram 159 dos 4174 '
  'pontos do terceiro conjunto; o buraco maior era o plano de tags. Ver a 92.';

/* -------------------------------------------------------------------------
   O SUBCONJUNTO QUE MUDA A ORDEM DE LEITURA

   Separado do resto porque ele e o unico que e apagado no MEIO do texto. Os
   outros invisiveis podem ser conteudo legitimo em algum lugar; um override
   bidirecional dentro de um pedido de compra da igreja nao pode.
   ------------------------------------------------------------------------- */
create or replace function demandas.reordenadores() returns text
language sql immutable parallel safe as $fn$
  select '[' || chr(8234) || '-' || chr(8238)   -- U+202A-202E  LRE RLE PDF LRO RLO
             || chr(8294) || '-' || chr(8297)   -- U+2066-2069  LRI RLI FSI PDI
             || ']'
$fn$;

/* as duas classes precisam ser regex valido ANTES de qualquer funcao usar, e a
   cobertura precisa ser medida aqui e nao so na conferencia: se a classe
   encolher, todo o resto do arquivo passa a medir outra coisa */
do $classe$
declare v_total int; v_passam int;
begin
  perform pg_catalog.regexp_replace('x', demandas.invisiveis(), '', 'g');
  perform pg_catalog.regexp_replace('x', demandas.reordenadores(), '', 'g');
  perform pg_catalog.regexp_replace('x', '[' || demandas.classe_vao() || ']', '', 'g');
  perform pg_catalog.regexp_replace('x', '[' || demandas.classe_zero() || ']', '', 'g');

  with faixas(lo,hi) as (values
    /* Default_Ignorable_Code_Point */
    (x'00AD'::int,x'00AD'::int),(x'034F'::int,x'034F'::int),(x'061C'::int,x'061C'::int),
    (x'115F'::int,x'1160'::int),(x'17B4'::int,x'17B5'::int),(x'180B'::int,x'180F'::int),
    (x'200B'::int,x'200F'::int),(x'202A'::int,x'202E'::int),(x'2060'::int,x'206F'::int),
    (x'3164'::int,x'3164'::int),(x'FE00'::int,x'FE0F'::int),(x'FEFF'::int,x'FEFF'::int),
    (x'FFA0'::int,x'FFA0'::int),(x'FFF0'::int,x'FFF8'::int),(x'1BCA0'::int,x'1BCA3'::int),
    (x'1D173'::int,x'1D17A'::int),(x'E0000'::int,x'E0FFF'::int),
    /* Cf */
    (x'0600'::int,x'0605'::int),(x'06DD'::int,x'06DD'::int),(x'070F'::int,x'070F'::int),
    (x'0890'::int,x'0891'::int),(x'08E2'::int,x'08E2'::int),(x'180E'::int,x'180E'::int),
    (x'FFF9'::int,x'FFFB'::int),(x'110BD'::int,x'110BD'::int),(x'110CD'::int,x'110CD'::int),
    (x'13430'::int,x'1343F'::int),
    /* Zs */
    (x'0020'::int,x'0020'::int),(x'00A0'::int,x'00A0'::int),(x'1680'::int,x'1680'::int),
    (x'2000'::int,x'200A'::int),(x'202F'::int,x'202F'::int),(x'205F'::int,x'205F'::int),
    (x'3000'::int,x'3000'::int))
  select count(*), count(*) filter (
           where pg_catalog.regexp_replace(chr(cp), demandas.invisiveis(), '', 'g') <> ''
              /* e as duas metades nao podem se sobrepor: um caractere nas duas
                 seria apagado pela primeira passada de `uma_linha` e nunca
                 chegaria a virar espaco */
              or (chr(cp) ~ ('[' || demandas.classe_vao() || ']')
              and chr(cp) ~ ('[' || demandas.classe_zero() || ']')))
    into v_total, v_passam
    from (select distinct generate_series(lo,hi) cp from faixas) t;

  if v_passam > 0 then
    raise exception '92 · a classe deixa passar (ou repete) % dos % pontos invisiveis', v_passam, v_total;
  end if;
  raise notice '92 · a classe cobre os % pontos de Cf + Zs + Default_Ignorable.', v_total;
end $classe$;

/* -------------------------------------------------------------------------
   2 · limpo() MATA O REORDENADOR EM QUALQUER POSICAO; uma_linha() E DO TITULO

   `limpo()` continua sendo apara de ponta para o resto da classe, e por um
   motivo que nao mudou: um nome proprio com ZWJ no meio e um nome proprio, e um
   `\n` dentro de uma descricao e conteudo. O que entrou foi a remocao do
   reordenador em qualquer posicao.

   `uma_linha()` e outra regra, para outro tipo de campo. Titulo e nome de
   cadastro sao rotulos de UMA linha, usados para distinguir uma coisa de outra
   numa lista. Se dois se leem iguais, precisam ser o mesmo texto, senao o
   UNIQUE deixa passar e a pessoa escolhe a errada. Como `[[:space:]]` esta
   dentro da classe, uma sequencia de espacos comuns tambem colapsa.
   ------------------------------------------------------------------------- */
create or replace function demandas.limpo(t text) returns text
language sql immutable parallel safe as $fn$
  select nullif(pg_catalog.regexp_replace(
           pg_catalog.regexp_replace(
             pg_catalog.regexp_replace(coalesce(t, ''), demandas.reordenadores(), '', 'g'),
             '^(' || demandas.invisiveis() || ')+', ''),
                  '(' || demandas.invisiveis() || ')+$', ''), '')
$fn$;

create or replace function demandas.uma_linha(t text) returns text
language sql immutable parallel safe as $fn$
  select nullif(btrim(
    /* 2) o que DESENHA um vao vira UM espaco: tirar o NBSP sem por nada no
          lugar colaria duas palavras que a pessoa escreveu separadas */
    pg_catalog.regexp_replace(
      /* 1) o que nao desenha nada some, sem deixar vao no lugar: por espaco
            onde havia um ZWSP inventa um espaco que ninguem estava vendo, e e
            justamente esse espaco inventado que faria dois titulos iguais
            continuarem diferentes */
      pg_catalog.regexp_replace(coalesce(t, ''),
        '[' || demandas.classe_zero() || ']+', '', 'g'),
      '[' || demandas.classe_vao() || ']+', ' ', 'g')), '')
$fn$;

comment on function demandas.uma_linha(text) is
  'A regra do TITULO e do NOME DE CADASTRO: uma linha, sem invisivel no meio. '
  'Separada de limpo() porque descricao tem varias linhas e o \n dela e '
  'conteudo. Ver a 92.';

revoke all on function demandas.classe_vao() from public;
revoke all on function demandas.classe_zero() from public;
revoke all on function demandas.invisiveis() from public;
revoke all on function demandas.reordenadores() from public;
revoke all on function demandas.limpo(text) from public;
revoke all on function demandas.uma_linha(text) from public;

/* -------------------------------------------------------------------------
   3 · url_boa JULGA O QUE O NAVEGADOR LE, E NAO O QUE ESTA ESCRITO

   `url_percent` decodifica UMA passada; `autoridade_lida` aplica duas, pelo
   motivo do item 4 do cabecalho. `%00` fica literal de proposito: `chr(0)` nao
   cabe em `text` no Postgres e levantaria DENTRO de uma CHECK, que e o pior
   lugar para levantar.
   ------------------------------------------------------------------------- */
create or replace function demandas.url_percent(t text) returns text
language sql immutable parallel safe as $fn$
  select coalesce((
    select string_agg(
      /* o primeiro pedaco e o que vem ANTES do primeiro `%`: nao foi escapado */
      case when n = 1 then p
           when p ~ '^[0-9A-Fa-f]{2}' and upper(pg_catalog.substring(p,1,2)) <> '00'
             then chr(('x' || pg_catalog.substring(p,1,2))::bit(8)::int) || pg_catalog.substring(p,3)
           else '%' || p end, '' order by n)
      from pg_catalog.regexp_split_to_table(coalesce(t,''), '%') with ordinality x(p, n)
  ), '')
$fn$;

create or replace function demandas.autoridade_lida(u text) returns text
language sql immutable parallel safe as $fn$
  select demandas.url_percent(demandas.url_percent(demandas.url_autoridade(u)))
$fn$;

create or replace function demandas.url_host(u text) returns text
language sql immutable parallel safe as $fn$
  /* `coalesce(..., '')`: host vazio e string vazia, nao nulo. Nulo propaga
     para `url_boa` e vira "passa". Ver o item 1 da 89. */
  select coalesce(rtrim(lower(pg_catalog.substring(
    pg_catalog.regexp_replace(demandas.autoridade_lida(u), '^[^@]*@', ''),
    '^[^:]+')), '.'), '')
$fn$;

create or replace function demandas.url_boa(u text) returns boolean
language sql immutable parallel safe as $fn$
  select coalesce(
       u is not null
   and u ~* '^https://'
   and length(u) between 12 and 2048
   and u !~ demandas.invisiveis()
   /* 92 · O GUARDA DO ARROBA OLHA A AUTORIDADE DECODIFICADA.
      `https://confiavel.com%40malicioso.com/x.pdf` passava: a autoridade crua
      nao tem arroba nenhum, e o navegador le `%40` como arroba e vai para
      `malicioso.com`. */
   and demandas.autoridade_lida(u) !~ '@'
   /* nem `/`, `?` ou `#` decodificados: autoridade de verdade nao tem nenhum
      dos tres, e `%2f` existe na autoridade so para mover onde ela termina */
   and demandas.autoridade_lida(u) !~ '[/?#]'
   /* nem invisivel escondido atras de `%0A` e parentes */
   and demandas.autoridade_lida(u) !~ demandas.invisiveis()
   and demandas.url_host(u) ~ '\.'
   and demandas.url_host(u) !~ '(^|\.)localhost$'
   /* 89 · IP PELO ULTIMO ROTULO, e agora pelo ultimo rotulo DECODIFICADO:
      `https://192.168.0.%31/segredo.pdf` passava porque `%31` nao e digito. */
   and pg_catalog.regexp_replace(demandas.url_host(u), '^.*\.', '')
         !~* '^([0-9]+|0x[0-9a-f]*)$'
   and demandas.url_host(u) !~ '^\[?[0-9a-f:]+\]?$'
   , false)
$fn$;

revoke all on function demandas.url_percent(text) from public;
revoke all on function demandas.autoridade_lida(text) from public;
revoke all on function demandas.url_host(text) from public;
revoke all on function demandas.url_boa(text) from public;

/* -------------------------------------------------------------------------
   4 · O REPARO, ANTES DE A REGRA APERTAR

   Duas coisas na mesma passada, porque as duas precisam da janela em que as
   funcoes novas ja valem e as CHECKs ainda nao foram conferidas:

     a) linha antiga com invisivel que a regra nova nao aceitaria;
     b) linha antiga que reprovaria uma das 17 CHECK do bloco 4.

   OS GATILHOS SAEM DO AR DURANTE O REPARO, E ISSO E DELIBERADO. `fn_antes`
   escreve `mexida_em := now()` em todo UPDATE, e `mexida_em` alimenta o
   indicador "parada ha mais de 7 dias". Uma migracao que conserta texto nao
   pode fazer toda demanda parada parecer recem-mexida: esconderia por uma
   semana exatamente o que o indicador existe para mostrar. O rastro nao se
   perde: cada linha tocada ganha um evento escrito a mao, com o texto original
   em bytes, que e o que a 89 fez pelo mesmo motivo.

   `disable trigger user` nao desliga gatilho de chave estrangeira, e tudo isto
   vive dentro da transacao deste arquivo: se qualquer linha falhar, os gatilhos
   voltam junto com o resto.
   ------------------------------------------------------------------------- */
do $reparo$
declare
  r record; v_n int := 0; v_ev int := 0;
begin
  if not exists (
    select 1 from demandas.demandas d
     where d.titulo    is distinct from demandas.limpo(d.titulo)
        or d.descricao is distinct from demandas.limpo(d.descricao)
        or (d.status = 'cancelada' and demandas.limpo(d.cancelada_motivo) is null)
        or (d.status = 'concluida' and demandas.limpo(d.conclusao) is null)
        or (demandas.limpo(d.evento) is not null and d.evento_data is null)
        or (d.orcamento is not null and d.orcamento < 0)
        or (d.prazo is null and demandas.limpo(d.sem_prazo_porque) is null)
        or (d.prioridade = 'urgente' and demandas.limpo(d.impacto) is null)
        or length(d.aprovacao_nota)   > 2000 or length(d.atraso_motivo) > 2000
        or length(d.cancelada_motivo) > 2000 or length(d.conclusao)     > 4000
        or length(d.impacto)          > 2000 or length(d.local)         > 200
        or length(d.objetivo)         > 4000 or length(d.publico)       > 200
        or length(d.sem_prazo_porque) > 500  or length(d.travada_nota)  > 2000)
  then
    raise notice '92 · reparo: nenhuma demanda precisou de conserto.';
  else
    execute 'alter table demandas.demandas disable trigger user';
    for r in
      select d.* from demandas.demandas d
       where d.titulo    is distinct from demandas.limpo(d.titulo)
          or d.descricao is distinct from demandas.limpo(d.descricao)
          or (d.status = 'cancelada' and demandas.limpo(d.cancelada_motivo) is null)
          or (d.status = 'concluida' and demandas.limpo(d.conclusao) is null)
          or (demandas.limpo(d.evento) is not null and d.evento_data is null)
          or (d.orcamento is not null and d.orcamento < 0)
          or (d.prazo is null and demandas.limpo(d.sem_prazo_porque) is null)
          or (d.prioridade = 'urgente' and demandas.limpo(d.impacto) is null)
          or length(d.aprovacao_nota)   > 2000 or length(d.atraso_motivo) > 2000
          or length(d.cancelada_motivo) > 2000 or length(d.conclusao)     > 4000
          or length(d.impacto)          > 2000 or length(d.local)         > 200
          or length(d.objetivo)         > 4000 or length(d.publico)       > 200
          or length(d.sem_prazo_porque) > 500  or length(d.travada_nota)  > 2000
    loop
      insert into demandas.eventos (demanda_id, membro_id, tipo, texto)
        values (r.id, null, 'comentario',
          'A migracao 92 conferiu regras que nunca tinham sido conferidas nas '
          || 'linhas antigas e consertou esta. O titulo original, em bytes, era: '
          || encode(convert_to(coalesce(r.titulo, ''), 'UTF8'), 'hex'));

      update demandas.demandas set
        titulo = coalesce(nullif(left(demandas.uma_linha(titulo), 200), ''),
                          'Sem título legível (#' || r.numero || ')'),
        descricao = coalesce(nullif(left(demandas.limpo(descricao), 20000), ''),
                             'Sem descrição legível. Ver o histórico desta demanda.'),
        cancelada_motivo = case
          when status = 'cancelada' and demandas.limpo(cancelada_motivo) is null
            then 'Cancelada antes de o sistema exigir motivo. Ver o histórico.'
          else left(cancelada_motivo, 2000) end,
        conclusao = case
          when status = 'concluida' and demandas.limpo(conclusao) is null
            then 'Concluída antes de o sistema exigir o texto de conclusão.'
          else left(conclusao, 4000) end,
        evento = case when demandas.limpo(evento) is not null and evento_data is null
                      then null else demandas.uma_linha(evento) end,
        orcamento = case when orcamento < 0 then null else orcamento end,
        sem_prazo_porque = case
          when prazo is null and demandas.limpo(sem_prazo_porque) is null
            then 'Aberta antes de o sistema exigir prazo ou o motivo de não ter.'
          else left(sem_prazo_porque, 500) end,
        impacto = case
          when prioridade = 'urgente' and demandas.limpo(impacto) is null
            then 'Marcada como urgente antes de o sistema exigir o impacto.'
          else left(impacto, 2000) end,
        aprovacao_nota = left(aprovacao_nota, 2000),
        atraso_motivo  = left(atraso_motivo, 2000),
        local          = left(local, 200),
        objetivo       = left(objetivo, 4000),
        publico        = left(publico, 200),
        travada_nota   = left(travada_nota, 2000)
       where id = r.id;
      v_n := v_n + 1;
    end loop;
    execute 'alter table demandas.demandas enable trigger user';
    raise notice '92 · reparo: % demanda(s) tinham texto que so era texto para a regra antiga.', v_n;
  end if;

  /* O ANEXO SO E TOCADO SE A URL DELE AINDA PASSAR PELA REGRA NOVA.
     `anexos_url_ck` ja esta VALIDA desde a 85 e le `url_boa`, que este arquivo
     deixou mais rigorosa. Uma linha antiga com `%40` ou `%31` no host continua
     gravada (CHECK valida nao re-confere o passado), mas QUALQUER update nela
     passa pela CHECK nova e levanta. Sem esta guarda, um conserto de NOME
     derrubaria a migracao inteira por causa da URL, que nao e o que ele estava
     consertando. O bloco seguinte conta essas linhas em voz alta. */
  update demandas.anexos
     set nome = coalesce(nullif(left(demandas.uma_linha(nome), 200), ''), 'Anexo sem nome legível')
   where (coalesce(length(demandas.limpo(nome)), 0) not between 1 and 200
       or nome is distinct from demandas.uma_linha(nome))
     and (removido_em is not null or demandas.url_boa(url));

  select count(*)::int into v_ev from demandas.anexos
   where removido_em is null and not demandas.url_boa(url);
  if v_ev > 0 then
    raise notice '92 · % anexo(s) tem URL que a regra nova recusa (arroba ou IP escrito com %%NN). '
                 'Nada foi apagado: eles continuam na ficha e no historico, e qualquer edicao '
                 'neles vai ser recusada ate alguem olhar. Demandas: %',
      v_ev, (select string_agg(distinct d.numero::text, ', ')
               from demandas.anexos a join demandas.demandas d on d.id = a.demanda_id
              where a.removido_em is null and not demandas.url_boa(a.url));
  end if;

  with cortados as (
    update demandas.eventos set texto = left(texto, 4000)
     where length(texto) > 4000 returning 1)
  select count(*)::int into v_ev from cortados;
  if v_ev > 0 then
    raise notice '92 · reparo: % evento(s) tinham texto acima do teto da CHECK.', v_ev;
  end if;
end $reparo$;

/* -------------------------------------------------------------------------
   5 · AS 17 CHECK PASSAM A VALER PARA AS LINHAS QUE JA ESTAVAM LA

   Uma a uma, pelo catalogo, para o arquivo nao ficar desatualizado no dia em
   que alguem acrescentar a decima oitava. `validate constraint` de uma CHECK ja
   valida e no-op, entao o bloco e re-aplicavel.
   ------------------------------------------------------------------------- */
do $valida$
declare r record; v_n int := 0;
begin
  for r in select c.conname, c.conrelid::regclass::text as tab
             from pg_constraint c
            where c.connamespace = 'demandas'::regnamespace
              and c.contype = 'c' and not c.convalidated
            order by 2, 1
  loop
    begin
      execute format('alter table %s validate constraint %I', r.tab, r.conname);
      v_n := v_n + 1;
    exception when check_violation then
      raise exception '92 · % nao vale para as linhas antigas de %, e o reparo nao alcancou: %',
        r.conname, r.tab, SQLERRM;
    end;
  end loop;
  raise notice '92 · % CHECK sairam de `not valid`.', v_n;
end $valida$;

/* -------------------------------------------------------------------------
   6 · O TETO DO SETOR

   Default NULL, que quer dizer "sem teto". Nenhuma linha existente muda de
   comportamento por causa desta coluna: `falta_aprovacao` so a soma quando ela
   nao e nula, e `dem_abrir` so trava por ela quando ha valor E ha teto.
   ------------------------------------------------------------------------- */
alter table demandas.setores add column if not exists teto_sem_aprovacao numeric(12,2);

comment on column demandas.setores.teto_sem_aprovacao is
  'Quanto este setor pode gastar sem passar por aprovacao. NULL = sem teto, '
  'que e como a coluna nasce: o numero e decisao de quem responde pelo '
  'dinheiro da igreja, e a migracao nao escolhe um por ele. Ver a 92.';

do $ck$ begin
  alter table demandas.setores add constraint ck_teto_sem_aprovacao
    check (teto_sem_aprovacao is null or teto_sem_aprovacao >= 0);
exception when duplicate_object then null; end $ck$;

/* o portao passa a olhar o VALOR, e nao so a flag da categoria */
create or replace function demandas.falta_aprovacao(d demandas.demandas)
returns boolean language sql stable as $fn$
  select coalesce(
       d.aprovacao is not distinct from 'pendente'
    or ( d.aprovacao is null
         and d.status not in ('concluida','cancelada')
         and ( exists (select 1 from demandas.categorias c
                        where c.id = d.categoria_id and c.exige_aprovacao)
            /* 92 · o teto do setor que ATENDE, porque quem gasta e quem
               executa. Com `teto_sem_aprovacao` nulo este ramo e sempre falso e
               a funcao devolve exatamente o que devolvia na 91. */
            or exists (select 1 from demandas.setores s
                        where s.id = d.setor_responsavel
                          and s.teto_sem_aprovacao is not null
                          and coalesce(d.orcamento, 0) > s.teto_sem_aprovacao) ) ), false)
$fn$;
revoke all on function demandas.falta_aprovacao(demandas.demandas) from public;

/* -------------------------------------------------------------------------
   7 · O VEREDITO DE PERMISSAO NUNCA E UM TERCEIRO VALOR

   Com `papel` ou `setor_id` nulos as duas devolviam NULL, e NULL num `if` nao
   entra em ramo nenhum. Hoje e latente porque toda chamada testa `m.id is null`
   antes; a proxima chamada que esquecer de testar herda um "pode" silencioso.
   ------------------------------------------------------------------------- */
create or replace function demandas.pode_ver(m demandas.membros, d demandas.demandas)
returns boolean language sql immutable as $fn$
  select coalesce(
      m.papel in ('gestor','admin')
   or d.aberta_por = m.id
   or (m.setor_id is not null
       and (d.setor_solicitante = m.setor_id or d.setor_responsavel = m.setor_id)), false);
$fn$;

create or replace function demandas.pode_atender(m demandas.membros, d demandas.demandas)
returns boolean language sql immutable as $fn$
  select coalesce(
      m.papel in ('gestor','admin')
   or (m.papel = 'responsavel' and m.setor_id is not null
       and d.setor_responsavel = m.setor_id), false);
$fn$;

revoke all on function demandas.pode_ver(demandas.membros, demandas.demandas) from public;
revoke all on function demandas.pode_atender(demandas.membros, demandas.demandas) from public;

/* -------------------------------------------------------------------------
   8 · UM SETOR, UM NOME

   O reparo vem antes do indice, e ele RENOMEIA em vez de apagar: apagar setor
   apaga o vinculo de quem esta nele. Quem ficar com o sufixo aparece na tela
   com o sufixo, que e como o administrador descobre que precisa juntar os dois.
   ------------------------------------------------------------------------- */
do $dup$
declare r record; v_n int := 0;
begin
  /* quem fica com o nome limpo e quem tem MAIS coisa pendurada nele: renomear o
     setor de 40 demandas para "(duplicado 2)" poria o sufixo justamente na tela
     que mais gente le. `setores` nao tem coluna de data, entao o desempate e o
     slug, que e unico. */
  for r in
    select s.id, s.nome,
           row_number() over (partition by s.nome order by (
             (select count(*) from demandas.demandas  d where d.setor_responsavel = s.id
                                                           or d.setor_solicitante = s.id)
           + (select count(*) from demandas.membros    m where m.setor_id = s.id)
           + (select count(*) from demandas.categorias c where c.setor_id = s.id)
           ) desc, s.slug) as pos
      from demandas.setores s
     where s.nome in (select nome from demandas.setores group by nome having count(*) > 1)
  loop
    if r.pos > 1 then
      update demandas.setores
         set nome = left(r.nome || ' (duplicado ' || r.pos || ')', 120)
       where id = r.id;
      v_n := v_n + 1;
    end if;
  end loop;
  if v_n > 0 then
    raise notice '92 · % setor(es) tinham nome repetido e ganharam sufixo. Junte-os pela tela.', v_n;
  end if;
end $dup$;

create unique index if not exists ux_dem_setores_nome on demandas.setores (nome);

/* -------------------------------------------------------------------------
   9 · fn_historico SEM OS DOIS RAMOS QUE NENHUMA ACAO ALCANCA

   Aqui o corpo e reescrito inteiro, e nao operado com `troca_se_faltar`, por um
   motivo mecanico: a troca e por texto, e APAGAR codigo nao deixa marca nova
   para a re-aplicacao reconhecer. O cuidado que a cirurgia daria vem do bloco
   de guarda logo abaixo, que le o corpo VIVO e recusa se ele nao for nem o da
   86 nem o desta migracao.

   O ramo de `orcamento` FICA, porque `destravar` passa a alcanca-lo no bloco
   11. Os de `titulo` e `descricao` saem.
   ------------------------------------------------------------------------- */
do $guarda$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p
   where p.pronamespace = 'demandas'::regnamespace and p.proname = 'fn_historico';
  if src is null then
    raise exception '92 · demandas.fn_historico nao existe. Nada foi gravado.';
  end if;
  if position('''titulo'', old.titulo, new.titulo' in src) > 0 then
    null;  -- o corpo da 86, que e o que este arquivo espera encontrar
  elsif position('''orcamento'',' in src) > 0 then
    raise notice '  (fn_historico ja esta sem os ramos mortos)';
  else
    raise exception
      '92 · demandas.fn_historico nao e o corpo da 86 nem o da 92. Nada foi gravado.';
  end if;
end $guarda$;

create or replace function demandas.fn_historico()
returns trigger language plpgsql as $fn$
declare
  v_m uuid := nullif(current_setting('demandas.membro', true), '')::uuid;
begin
  if new.status is distinct from old.status then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para, texto)
      values (new.id, v_m, 'status', old.status, new.status,
              case new.status
                when 'travada'   then new.travada_nota
                when 'concluida' then new.conclusao
                when 'cancelada' then new.cancelada_motivo
                else null end);
  end if;
  if new.responsavel_id is distinct from old.responsavel_id then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para)
      values (new.id, v_m, 'responsavel',
              (select nome from demandas.membros where id = old.responsavel_id),
              (select nome from demandas.membros where id = new.responsavel_id));
  end if;
  if new.setor_responsavel is distinct from old.setor_responsavel then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para)
      values (new.id, v_m, 'setor',
              (select nome from demandas.setores where id = old.setor_responsavel),
              (select nome from demandas.setores where id = new.setor_responsavel));
  end if;
  if new.prazo is distinct from old.prazo then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para)
      values (new.id, v_m, 'prazo', old.prazo::text, new.prazo::text);
  end if;
  if new.prioridade is distinct from old.prioridade then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para)
      values (new.id, v_m, 'prioridade', old.prioridade, new.prioridade);
  end if;
  if new.aprovacao is distinct from old.aprovacao then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para, texto)
      values (new.id, v_m, 'aprovacao', old.aprovacao, new.aprovacao, new.aprovacao_nota);
  end if;
  if new.reaberturas > old.reaberturas then
    insert into demandas.eventos (demanda_id, membro_id, tipo)
      values (new.id, v_m, 'reabertura');
  end if;

  /* 86 escreveu este ramo e ele ficou tres migracoes sem poder acontecer:
     nenhuma acao escrevia em `orcamento`. A 92 da a acao (`destravar` com
     valor), e por isso ele e o unico dos tres da 86 que fica. */
  if new.orcamento is distinct from old.orcamento then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para)
      values (new.id, v_m, 'orcamento',
              to_char(old.orcamento, 'FM999G999G990D00'),
              to_char(new.orcamento, 'FM999G999G990D00'));
  end if;

  /* OS RAMOS DE `titulo` E `descricao` SAIRAM AQUI, e nao e economia de linha.
     Eles nasceram na 86 junto com o de orcamento e nunca puderam disparar:
     `dem_mover` e a unica funcao que escreve na tabela e nao toca nesses dois
     campos. Um gatilho que parece registrar uma mudanca que o sistema nao sabe
     fazer e pior que gatilho nenhum: quem le o codigo conclui que a edicao de
     titulo existe em algum lugar, e vai procurar. */

  /* o motivo do atraso sumia sem rastro no `reabrir` */
  if old.atraso_motivo is not null and new.atraso_motivo is null then
    insert into demandas.eventos (demanda_id, membro_id, tipo, de, para)
      values (new.id, v_m, 'atraso', old.atraso_motivo, null);
  end if;
  return null;
end $fn$;
revoke all on function demandas.fn_historico() from public;

/* -------------------------------------------------------------------------
   10 · dem_numeros DECIDE SOZINHA O QUE E UMA DATA

   O corpo VIVO e lido e aproveitado inteiro: so o cabecalho e o trecho que
   resolve o periodo mudam. A funcao antiga e derrubada na mesma transacao,
   porque manter as duas com os mesmos nomes de argumento e o que QUEBRA o
   chamador (PGRST203). Ver o item 10 do cabecalho.
   ------------------------------------------------------------------------- */
do $numeros$
declare src text; novo text;
begin
  if to_regprocedure('public.dem_numeros(text,date,date)') is null then
    raise notice '  (dem_numeros ja recebe texto)';
    return;
  end if;
  select pg_get_functiondef('public.dem_numeros(text,date,date)'::regprocedure) into src;

  novo := public.troca_se_faltar(src, 'p_de text DEFAULT NULL::text',
'public.dem_numeros(p_token text, p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date)',
'public.dem_numeros(p_token text, p_de text DEFAULT NULL::text, p_ate text DEFAULT NULL::text)',
    'dem_numeros: a assinatura passa a ser texto');

  novo := public.troca_se_faltar(novo, '''PERIODO_INVALIDO''',
'  v_de  := coalesce(p_de, demandas.hoje() - 90);
  v_ate := coalesce(p_ate, demandas.hoje());',
'  /* 92 · ERA `p_de date`, e o cast acontecia no PostgREST, ANTES de a funcao
     comecar: `dem_numeros(tok, ''2026-13-45'', null)` levantava 22008 cru e a
     tela de indicadores imprimia o codigo do Postgres para uma pessoa da
     igreja. O `exception` daqui nao alcanca o que estoura antes da primeira
     linha. Agora o texto chega inteiro e quem decide e esta funcao. */
  if demandas.limpo(p_de) is null then
    v_de := demandas.hoje() - 90;
  else
    if demandas.limpo(p_de) !~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$'' then
      return jsonb_build_object(''ok'', false, ''erro'', ''PERIODO_INVALIDO'', ''campo'', ''de''); end if;
    begin
      v_de := demandas.limpo(p_de)::date;
    exception when invalid_datetime_format or datetime_field_overflow then
      return jsonb_build_object(''ok'', false, ''erro'', ''PERIODO_INVALIDO'', ''campo'', ''de'');
    end;
  end if;
  if demandas.limpo(p_ate) is null then
    v_ate := demandas.hoje();
  else
    if demandas.limpo(p_ate) !~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$'' then
      return jsonb_build_object(''ok'', false, ''erro'', ''PERIODO_INVALIDO'', ''campo'', ''ate''); end if;
    begin
      v_ate := demandas.limpo(p_ate)::date;
    exception when invalid_datetime_format or datetime_field_overflow then
      return jsonb_build_object(''ok'', false, ''erro'', ''PERIODO_INVALIDO'', ''campo'', ''ate'');
    end;
  end if;',
    'dem_numeros: a funcao decide o periodo');

  execute novo;
  drop function public.dem_numeros(text, date, date);

  /* A FUNCAO NOVA NASCE COM OS MESMOS GRANTS DA ANTIGA, E ISSO PRECISOU SER
     MEDIDO ANTES DE SER ESCRITO.

     A primeira versao deste bloco dava EXECUTE so para `authenticated`, achando
     que "quem ve indicadores esta logado". Esta errado: a maior parte de quem
     usa Demandas entra pelo LINK PESSOAL (`p_token`), sem sessao do Supabase
     Auth, e para o PostgREST essa pessoa e `anon`. `supabase/50-demandas.sql`
     da `anon, authenticated` para as nove funcoes `dem_*` exatamente por isso.
     Tirar `anon` aqui fecharia a tela de indicadores para todo gestor que entra
     pelo link, e o sintoma seria "permission denied for function", que ninguem
     ia ligar a esta migracao. */
  execute 'revoke all on function public.dem_numeros(text,text,text) from public';
  begin
    execute 'grant execute on function public.dem_numeros(text,text,text) to anon, authenticated';
  exception when undefined_object then null; end;
end $numeros$;

/* -------------------------------------------------------------------------
   11 · CIRURGIA NAS FUNCOES DA TELA

   Cada troca le o corpo vivo com `pg_get_functiondef` e exige casamento exato.
   A marca de `troca_se_faltar` e sempre CODIGO EXECUTAVEL unico do conserto,
   nunca comentario e nunca codigo de erro que ja exista: as duas licoes caras
   das migracoes 88 e 89.
   ------------------------------------------------------------------------- */
do $cirurgia$
declare src text; novo text;
begin
  -- ============ dem_abrir: o titulo e uma linha, e o teto trava ============
  select pg_get_functiondef('public.dem_abrir(text,jsonb)'::regprocedure) into src;

  novo := public.troca_se_faltar(src, 'v_teto numeric',
'  v_prazo date; v_evd date; v_resp uuid; v_status text; v_maus int;',
'  v_prazo date; v_evd date; v_resp uuid; v_status text; v_maus int;
  v_exige boolean; v_teto numeric;',
    'dem_abrir: declara o teto');

  novo := public.troca_se_faltar(novo, 'v_exige := c.exige_aprovacao',
'  v_status := case when c.exige_aprovacao then ''travada'' else ''aberta'' end;',
'  /* 92 · O PORTAO DEIXA DE SER ESCOLHIDO POR QUEM PEDE.
     Medido na 91: R$ 999.999,99 na categoria "Solicitação de orçamento", que
     nao exige aprovacao, nasceram `aberta`, foram assumidos e concluidos por um
     `responsavel` sozinho, e o historico nao tem um unico evento de aprovacao.
     `exige_aprovacao` e flag da CATEGORIA, e a categoria e escolhida por quem
     pede. O teto e do setor que ATENDE, porque quem gasta e quem executa. Com
     `teto_sem_aprovacao` nulo (como a coluna nasce) esta linha nao muda nada. */
  v_teto := (select s.teto_sem_aprovacao from demandas.setores s where s.id = v_resp);
  v_exige := c.exige_aprovacao
             or (v_teto is not null
                 and coalesce(replace(nullif(p_d->>''orcamento'',''''), '','', ''.'')::numeric, 0) > v_teto);
  v_status := case when v_exige then ''travada'' else ''aberta'' end;',
    'dem_abrir: o teto do setor trava no nascimento');

  novo := public.troca_se_faltar(novo, 'demandas.uma_linha(p_d->>''titulo'')',
'    demandas.limpo(p_d->>''titulo''), demandas.limpo(p_d->>''descricao''), demandas.limpo(p_d->>''objetivo''),',
'    /* 92 · o titulo e UMA linha e e o que distingue uma demanda de outra na
       lista; a descricao e varias e o `\n` dela e conteudo. Ver o item 1. */
    demandas.uma_linha(p_d->>''titulo''), demandas.limpo(p_d->>''descricao''), demandas.limpo(p_d->>''objetivo''),',
    'dem_abrir: titulo de uma linha');

  novo := public.troca_se_faltar(novo, 'case when v_exige then ''aprovacao''',
'    case when c.exige_aprovacao then ''aprovacao'' else null end,
    case when c.exige_aprovacao
         then ''Esta categoria exige aprovação antes da execução.'' else null end,
    case when c.exige_aprovacao then ''pendente'' else null end)',
'    case when v_exige then ''aprovacao'' else null end,
    case when v_exige and not c.exige_aprovacao
         then ''O valor passa do teto que este setor pode gastar sem aprovação.''
         when v_exige
         then ''Esta categoria exige aprovação antes da execução.'' else null end,
    case when v_exige then ''pendente'' else null end)',
    'dem_abrir: a trava diz qual dos dois portoes fechou');

  novo := public.troca_se_faltar(novo, '''precisa_aprovacao'', v_exige',
'    ''precisa_aprovacao'', c.exige_aprovacao,',
'    ''precisa_aprovacao'', v_exige,',
    'dem_abrir: a resposta conta o portao de verdade');
  execute novo;

  -- ============ dem_mover: a guarda do travar e o orcamento do destravar ===
  select pg_get_functiondef('public.dem_mover(text,int,text,jsonb)'::regprocedure) into src;

  novo := public.troca_se_faltar(src, 'coalesce(d.aprovacao, ''aprovada'') is not distinct from ''aprovada''',
'    if v_motivo = ''aprovacao'' and d.aprovacao = ''aprovada''
       and m.papel not in (''gestor'',''admin'') then',
'    /* 92 · A GUARDA ERA NULL, E NULL NAO ENTRA EM RAMO NENHUM.
       Com a categoria sem aprovacao, `d.aprovacao` e NULL, `d.aprovacao =
       ''aprovada''` e NULL, e o `and` inteiro e NULL. Medido: um `responsavel`
       travava por aprovacao uma demanda que nunca teve portao, e depois disso
       nem ele nem quem abriu conseguiam desfazer (`destravar` devolve
       FALTA_APROVACAO, `aprovar` devolve SO_GESTOR). O `coalesce` le NULL como
       "nao ha aprovacao pendente", que e o que NULL significa nesta coluna. */
    if v_motivo = ''aprovacao''
       and coalesce(d.aprovacao, ''aprovada'') is not distinct from ''aprovada''
       and m.papel not in (''gestor'',''admin'') then',
    'dem_mover: travar por aprovacao nao cai no NULL');

  novo := public.troca_se_faltar(novo, '''ORCAMENTO_INVALIDO''',
'    if d.status <> ''travada'' then return jsonb_build_object(''ok'', false, ''erro'', ''NAO_ESTA_TRAVADA''); end if;
    if demandas.falta_aprovacao(d) then
      return jsonb_build_object(''ok'', false, ''erro'', ''FALTA_APROVACAO''); end if;',
'    if d.status <> ''travada'' then return jsonb_build_object(''ok'', false, ''erro'', ''NAO_ESTA_TRAVADA''); end if;
    if demandas.falta_aprovacao(d) then
      return jsonb_build_object(''ok'', false, ''erro'', ''FALTA_APROVACAO''); end if;
    /* 92 · A ETAPA QUE FALTAVA PARA A REGRA 5 DO DOCUMENTO.
       "demandas de compra devem conter orcamento estimado, quando possivel",
       e a triagem so descobre que falta valor DEPOIS da abertura. A trava por
       informacao e justamente a pergunta; a resposta dela agora pode trazer o
       numero. A expressao regular e a mesma de `dem_abrir`, para nao existirem
       duas ideias de "isto e dinheiro". */
    if (p_d ? ''orcamento'') and nullif(p_d->>''orcamento'','''') is not null then
      if p_d->>''orcamento'' !~ ''^[0-9]+([.,][0-9]{1,2})?$'' then
        return jsonb_build_object(''ok'', false, ''erro'', ''ORCAMENTO_INVALIDO''); end if;
      update demandas.demandas
         set orcamento = replace(p_d->>''orcamento'', '','', ''.'')::numeric
       where id = d.id;
      select * into d from demandas.demandas where id = d.id for update;
    end if;',
    'dem_mover: destravar aceita o orcamento');

  novo := public.troca_se_faltar(novo, 'when demandas.falta_aprovacao(d) then ''travada''
                         when responsavel_id is null',
'    update demandas.demandas
       set status = case when responsavel_id is null then ''aberta'' else ''execucao'' end,
           travada_por = null, travada_nota = null
     where id = d.id;',
'    /* 92 · se o valor que acabou de chegar passa do teto do setor, destravar
       nao e soltar: e trocar de portao. Sem isto a demanda voltaria para
       `aberta` com `falta_aprovacao` ja verdadeiro, e a proxima acao qualquer
       e que a travaria, com a pessoa sem entender o que mudou. */
    update demandas.demandas
       set status = case when demandas.falta_aprovacao(d) then ''travada''
                         when responsavel_id is null then ''aberta'' else ''execucao'' end,
           travada_por = case when demandas.falta_aprovacao(d) then ''aprovacao'' else null end,
           travada_nota = case when demandas.falta_aprovacao(d)
                               then ''O valor informado passa do teto que este setor pode gastar sem aprovação.''
                               else null end,
           aprovacao = case when demandas.falta_aprovacao(d) then ''pendente'' else aprovacao end
     where id = d.id;',
    'dem_mover: o valor novo pode trocar o portao');
  execute novo;

  -- ============ dem_ajustar: grava o que validou, e ganha o teto ===========
  select pg_get_functiondef('public.dem_ajustar(text,text,jsonb)'::regprocedure) into src;

  novo := public.troca_se_faltar(src, '''VALOR_INVALIDO''',
'  for v_ch in select unnest(array[''atende'',''ativo'',''ativa'',''exige_aprovacao'',''exige_orcamento'']) loop
    if (p_d ? v_ch) and coalesce(p_d->>v_ch,'''') not in ('''',''true'',''false'') then
      return jsonb_build_object(''ok'', false, ''erro'', ''SIM_OU_NAO'', ''campo'', v_ch); end if;
  end loop;',
'  for v_ch in select unnest(array[''atende'',''ativo'',''ativa'',''exige_aprovacao'',''exige_orcamento'']) loop
    if (p_d ? v_ch) and coalesce(p_d->>v_ch,'''') not in ('''',''true'',''false'') then
      return jsonb_build_object(''ok'', false, ''erro'', ''SIM_OU_NAO'', ''campo'', v_ch); end if;
  end loop;
  /* 92 · o teto do setor e dinheiro, e dinheiro tem a mesma regra de
     `dem_abrir`. Mandar a chave com texto vazio LIMPA o teto: sem isso nao
     haveria como voltar atras de um numero digitado errado. */
  if (p_d ? ''teto_sem_aprovacao'') and coalesce(p_d->>''teto_sem_aprovacao'','''') <> ''''
     and p_d->>''teto_sem_aprovacao'' !~ ''^[0-9]+([.,][0-9]{1,2})?$'' then
    return jsonb_build_object(''ok'', false, ''erro'', ''VALOR_INVALIDO'', ''campo'', ''teto_sem_aprovacao''); end if;',
    'dem_ajustar: o teto e validado como dinheiro');

  novo := public.troca_se_faltar(novo, 'demandas.uma_linha(p_d->>''nome'') is null',
'  if p_o_que in (''setor'',''categoria'') and nullif(p_d->>''id'','''') is null
     and demandas.limpo(p_d->>''nome'') is null then
    return jsonb_build_object(''ok'', false, ''erro'', ''FALTA_CAMPO'', ''campo'', ''nome''); end if;
  if p_o_que = ''categoria'' and nullif(p_d->>''id'','''') is null
     and demandas.limpo(p_d->>''grupo'') is null then
    return jsonb_build_object(''ok'', false, ''erro'', ''FALTA_CAMPO'', ''campo'', ''grupo''); end if;
  if (p_d ? ''nome'') and nullif(p_d->>''id'','''') is not null
     and (p_d->>''nome'') is not null and demandas.limpo(p_d->>''nome'') is null then
    return jsonb_build_object(''ok'', false, ''erro'', ''FALTA_CAMPO'', ''campo'', ''nome''); end if;',
'  /* 92 · valida com a MESMA funcao que grava. Antes validava com `limpo()` e
     gravava com `btrim()`, e um ZWSP no comeco do nome entrava no banco: o
     UNIQUE (grupo, nome) via dois textos, o `on conflict do update` da 88 nao
     casava, e apareciam duas categorias identicas no seletor. */
  if p_o_que in (''setor'',''categoria'') and nullif(p_d->>''id'','''') is null
     and demandas.uma_linha(p_d->>''nome'') is null then
    return jsonb_build_object(''ok'', false, ''erro'', ''FALTA_CAMPO'', ''campo'', ''nome''); end if;
  if p_o_que = ''categoria'' and nullif(p_d->>''id'','''') is null
     and demandas.uma_linha(p_d->>''grupo'') is null then
    return jsonb_build_object(''ok'', false, ''erro'', ''FALTA_CAMPO'', ''campo'', ''grupo''); end if;
  if (p_d ? ''nome'') and nullif(p_d->>''id'','''') is not null
     and (p_d->>''nome'') is not null and demandas.uma_linha(p_d->>''nome'') is null then
    return jsonb_build_object(''ok'', false, ''erro'', ''FALTA_CAMPO'', ''campo'', ''nome''); end if;',
    'dem_ajustar: valida com a funcao que grava');

  novo := public.troca_se_faltar(novo, 'insert into demandas.setores (nome, slug, atende, ordem, teto_sem_aprovacao)',
'      insert into demandas.setores (nome, slug, atende, ordem)
        values (btrim(p_d->>''nome''),
                coalesce(nullif(btrim(p_d->>''slug''),''''),
                         lower(regexp_replace(unaccent_simples(btrim(p_d->>''nome'')), ''[^a-z0-9]+'', ''-'', ''gi''))),
                coalesce(nullif(p_d->>''atende'','''')::boolean, false),
                coalesce(nullif(p_d->>''ordem'','''')::int, 99))
        returning id into v_id;',
'      insert into demandas.setores (nome, slug, atende, ordem, teto_sem_aprovacao)
        values (demandas.uma_linha(p_d->>''nome''),
                coalesce(demandas.uma_linha(p_d->>''slug''),
                         lower(regexp_replace(unaccent_simples(demandas.uma_linha(p_d->>''nome'')), ''[^a-z0-9]+'', ''-'', ''gi''))),
                coalesce(nullif(p_d->>''atende'','''')::boolean, false),
                coalesce(nullif(p_d->>''ordem'','''')::int, 99),
                replace(nullif(p_d->>''teto_sem_aprovacao'',''''), '','', ''.'')::numeric)
        returning id into v_id;',
    'dem_ajustar: setor novo grava o texto limpo e o teto');

  novo := public.troca_se_faltar(novo, 'teto_sem_aprovacao = case when p_d ? ''teto_sem_aprovacao''',
'      update demandas.setores set
        nome = coalesce(nullif(btrim(p_d->>''nome''),''''), nome),',
'      update demandas.setores set
        nome = coalesce(demandas.uma_linha(p_d->>''nome''), nome),
        teto_sem_aprovacao = case when p_d ? ''teto_sem_aprovacao''
                                  then replace(nullif(p_d->>''teto_sem_aprovacao'',''''), '','', ''.'')::numeric
                                  else teto_sem_aprovacao end,',
    'dem_ajustar: setor existente recebe o teto');

  novo := public.troca_se_faltar(novo, 'values (demandas.uma_linha(p_d->>''grupo'')',
'        values (btrim(p_d->>''grupo''), btrim(p_d->>''nome''), nullif(p_d->>''setor_id'','''')::uuid,',
'        values (demandas.uma_linha(p_d->>''grupo''), demandas.uma_linha(p_d->>''nome''), nullif(p_d->>''setor_id'','''')::uuid,',
    'dem_ajustar: categoria nova grava o texto limpo');

  novo := public.troca_se_faltar(novo, 'update demandas.categorias set
        nome = coalesce(demandas.uma_linha',
'      update demandas.categorias set
        nome = coalesce(nullif(btrim(p_d->>''nome''),''''), nome),',
'      update demandas.categorias set
        nome = coalesce(demandas.uma_linha(p_d->>''nome''), nome),',
    'dem_ajustar: categoria existente grava o texto limpo');

  novo := public.troca_se_faltar(novo, 'values (demandas.uma_linha(p_d->>''nome''), nullif(btrim(p_d->>''email'')',
'        values (btrim(p_d->>''nome''), nullif(btrim(p_d->>''email''),''''),',
'        values (demandas.uma_linha(p_d->>''nome''), nullif(btrim(p_d->>''email''),''''),',
    'dem_ajustar: pessoa nova grava o texto limpo');

  novo := public.troca_se_faltar(novo, 'update demandas.membros set
        nome = coalesce(demandas.uma_linha',
'      update demandas.membros set
        nome = coalesce(nullif(btrim(p_d->>''nome''),''''), nome),',
'      update demandas.membros set
        nome = coalesce(demandas.uma_linha(p_d->>''nome''), nome),',
    'dem_ajustar: pessoa existente grava o texto limpo');
  execute novo;

  -- ============ dem_bases: a tela precisa LER o teto para poder escrever ===
  select pg_get_functiondef('public.dem_bases(text)'::regprocedure) into src;
  novo := public.troca_se_faltar(src, '''teto_sem_aprovacao'', s.teto_sem_aprovacao',
'        ''id'', s.id, ''nome'', s.nome, ''slug'', s.slug, ''atende'', s.atende) order by s.ordem, s.nome)',
'        ''id'', s.id, ''nome'', s.nome, ''slug'', s.slug, ''atende'', s.atende,
        /* 92 · sem ler de volta, o administrador nao tem como saber qual teto
           esta valendo, e um numero que so da para escrever e um numero que
           ninguem confere. Nao e dado sensivel: saber que compra acima de X
           precisa de aprovacao ajuda quem pede a nao ser surpreendido. */
        ''teto_sem_aprovacao'', s.teto_sem_aprovacao) order by s.ordem, s.nome)',
    'dem_bases: devolve o teto do setor');
  execute novo;
end $cirurgia$;

/* -------------------------------------------------------------------------
   12 · CONFERENCIA

   UM bloco de conferencia neste arquivo, e nenhum outro. Os blocos auxiliares
   acima usam etiquetas proprias (`classe`, `reparo`, `valida`, `dup`,
   `guarda`, `numeros`, `cirurgia`) porque `scripts/sabotar-migracao.py` conta a
   etiqueta da conferencia TEXTUALMENTE e recusa arquivo com mais de uma
   ocorrencia, inclusive dentro de comentario.

   Duas armadilhas que este tipo de bloco ja caiu, e por isso estao escritas:
   `falhas || 'texto'` sem `::text` o Postgres resolve como `text[] || text[]` e
   estoura; e `<>` contra NULL devolve NULL, e `if NULL then` nao entra, que e a
   porta por onde a sabotagem passa por baixo da guarda. Toda comparacao aqui e
   `is distinct from`.

   E a conferencia olha SO os proprios dados: `demandas-banco.test.sql` abre
   dezenas de demandas antes, e contar a tabela inteira mede o banco, nao a
   regra.
   ------------------------------------------------------------------------- */
do $conf$
declare
  falhas text[] := '{}';
  v_set_com uuid; v_set_adm uuid; v_cat uuid; v_cat2 uuid;
  v_sol uuid; v_resp uuid; v_ges uuid;
  v_tok_sol text; v_tok_resp text; v_tok_ges text; v_tok_adm text;
  v_num int; v_num2 int; v_d demandas.demandas; v_m demandas.membros;
  v_r jsonb; v_n int; v_txt text; v_dois int;
  v_rlo text := chr(8238); v_zwsp text := chr(8203); v_tag text := chr(918000);
  v_nbsp text := chr(160);
  /* A CLASSE DOS REORDENADORES ESCRITA A MAO, E NAO `demandas.reordenadores()`.
     Uma conferencia que pergunta ao proprio acusado qual e a lista nao mede
     nada: encolher a lista faria a pergunta e a resposta encolherem juntas, e o
     caso sairia verde. Os cinco de U+202A a U+202E e os quatro de U+2066 a
     U+2069 estao aqui por extenso de proposito. */
  v_bidi text := '[' || chr(8234) || '-' || chr(8238) || chr(8294) || '-' || chr(8297) || ']';
begin
  perform set_config('demandas.membro', '', true);

  /* ---- 1 · a classe cobre os tres conjuntos inteiros ---- */
  with faixas(lo,hi) as (values
    (x'00AD'::int,x'00AD'::int),(x'034F'::int,x'034F'::int),(x'061C'::int,x'061C'::int),
    (x'115F'::int,x'1160'::int),(x'17B4'::int,x'17B5'::int),(x'180B'::int,x'180F'::int),
    (x'200B'::int,x'200F'::int),(x'202A'::int,x'202E'::int),(x'2060'::int,x'206F'::int),
    (x'3164'::int,x'3164'::int),(x'FE00'::int,x'FE0F'::int),(x'FEFF'::int,x'FEFF'::int),
    (x'FFA0'::int,x'FFA0'::int),(x'FFF0'::int,x'FFF8'::int),(x'1BCA0'::int,x'1BCA3'::int),
    (x'1D173'::int,x'1D17A'::int),(x'E0000'::int,x'E0FFF'::int),
    (x'0600'::int,x'0605'::int),(x'06DD'::int,x'06DD'::int),(x'070F'::int,x'070F'::int),
    (x'0890'::int,x'0891'::int),(x'08E2'::int,x'08E2'::int),(x'180E'::int,x'180E'::int),
    (x'FFF9'::int,x'FFFB'::int),(x'110BD'::int,x'110BD'::int),(x'110CD'::int,x'110CD'::int),
    (x'13430'::int,x'1343F'::int),
    (x'0020'::int,x'0020'::int),(x'00A0'::int,x'00A0'::int),(x'1680'::int,x'1680'::int),
    (x'2000'::int,x'200A'::int),(x'202F'::int,x'202F'::int),(x'205F'::int,x'205F'::int),
    (x'3000'::int,x'3000'::int))
  select count(*) filter (
           where pg_catalog.regexp_replace(chr(cp), demandas.invisiveis(), '', 'g') <> '')
    into v_n from (select distinct generate_series(lo,hi) cp from faixas) t;
  if v_n is distinct from 0 then
    falhas := falhas || format('1: a classe de invisiveis deixa passar %s pontos (na 91 eram 4015)', v_n); end if;
  if demandas.limpo('a' || v_tag || 'b') is distinct from 'a' || v_tag || 'b' then
    falhas := falhas || '1: o plano de tags nao pode ser apagado do MEIO, so das pontas'::text; end if;
  if demandas.limpo(v_tag || 'x' || v_tag) is distinct from 'x' then
    falhas := falhas || '1: o plano de tags continua passando pelas pontas'::text; end if;
  /* as duas metades da classe, cada uma com o seu tratamento */
  if demandas.uma_linha('Culto' || v_nbsp || 'de domingo') is distinct from 'Culto de domingo' then
    falhas := falhas || format('1: o vao invisivel devia virar UM espaco, virou %s',
      demandas.uma_linha('Culto' || v_nbsp || 'de domingo')); end if;
  if demandas.uma_linha('Arte' || v_zwsp || 'final') is distinct from 'Artefinal' then
    falhas := falhas || format('1: o invisivel de largura zero devia sumir sem deixar vao, virou %s',
      demandas.uma_linha('Arte' || v_zwsp || 'final')); end if;
  /* as duas familias de reordenador, uma a uma: a lista tem dois pedacos e ja
     aconteceu neste repositorio de so um deles crescer */
  if demandas.limpo('a' || chr(8234) || 'b') is distinct from 'ab' then
    falhas := falhas || '1: o override bidirecional (U+202A a U+202E) continua passando pelo meio'::text; end if;
  if demandas.limpo('a' || chr(8297) || 'b') is distinct from 'ab' then
    falhas := falhas || '1: o isolamento bidirecional (U+2066 a U+2069) continua passando pelo meio'::text; end if;

  /* ---- cenario ---- */
  insert into demandas.setores (nome, slug, atende) values ('CONF92 Comunicação', 'conf92-com', true)
    returning id into v_set_com;
  insert into demandas.setores (nome, slug, atende) values ('CONF92 Administrativo', 'conf92-adm', false)
    returning id into v_set_adm;
  insert into demandas.categorias (grupo, nome, setor_id, exige_aprovacao, prazo_padrao_dias)
    values ('CONF92 grupo', 'CONF92 arte', v_set_com, false, 5) returning id into v_cat;

  insert into demandas.membros (nome, email, papel, setor_id, token, ativo)
    values ('CONF92 Solicitante', 'conf92sol@exemplo.test', 'solicitante', v_set_adm, 'CONF92TOKSOL', true)
    returning id, token into v_sol, v_tok_sol;
  insert into demandas.membros (nome, email, papel, setor_id, token, ativo)
    values ('CONF92 Responsavel', 'conf92resp@exemplo.test', 'responsavel', v_set_com, 'CONF92TOKRESP', true)
    returning id, token into v_resp, v_tok_resp;
  insert into demandas.membros (nome, email, papel, setor_id, token, ativo)
    values ('CONF92 Gestor', 'conf92ges@exemplo.test', 'gestor', v_set_com, 'CONF92TOKGES', true)
    returning id, token into v_ges, v_tok_ges;
  insert into demandas.membros (nome, email, papel, setor_id, token, ativo)
    values ('CONF92 Admin', 'conf92adm@exemplo.test', 'admin', v_set_adm, 'CONF92TOKADM', true)
    returning token into v_tok_adm;

  /* ---- 2 · o reordenador no MEIO do titulo nao sobrevive ---- */
  v_r := public.dem_abrir(v_tok_sol, jsonb_build_object(
    'categoria_id', v_cat,
    'titulo', 'CONF92 Transferir R$ 10' || v_rlo || '00,00 para o fornecedor',
    'descricao', 'Primeira linha' || chr(10) || 'segunda linha, com ' || v_zwsp
                 || ' e ' || v_rlo || ' no meio',
    'prazo', to_char(demandas.hoje() + 10, 'YYYY-MM-DD')));
  if not coalesce((v_r->>'ok')::boolean, false) then
    falhas := falhas || format('2: dem_abrir recusou o caso do reordenador: %s', v_r); end if;
  v_num := (v_r->>'numero')::int;
  select * into v_d from demandas.demandas where numero = v_num;
  if v_d.titulo ~ v_bidi then
    falhas := falhas || '2: o reordenador bidirecional sobreviveu no meio do titulo'::text; end if;
  if v_d.titulo is distinct from 'CONF92 Transferir R$ 1000,00 para o fornecedor' then
    falhas := falhas || format('2: o titulo gravado nao e o titulo legivel: %s', v_d.titulo); end if;

  /* ---- 3 · a descricao e varias linhas, e a quebra dela e conteudo ---- */
  if position(chr(10) in v_d.descricao) = 0 then
    falhas := falhas || '3: a quebra de linha legitima da descricao foi apagada'::text; end if;
  if v_d.descricao ~ v_bidi then
    falhas := falhas || '3: a descricao aceita reordenador bidirecional'::text; end if;
  if position(v_zwsp in v_d.descricao) = 0 then
    falhas := falhas || '3: a descricao perdeu o invisivel do meio, que nela e texto da pessoa'::text; end if;

  /* ---- 4 · dois titulos que se leem iguais viram o MESMO texto ---- */
  v_r := public.dem_abrir(v_tok_sol, jsonb_build_object(
    'categoria_id', v_cat,
    'titulo', 'CONF92 Transferir R$ 10' || v_zwsp || '00,00 para o fornecedor',
    'descricao', 'A mesma frase, com um invisivel no meio do numero',
    'prazo', to_char(demandas.hoje() + 10, 'YYYY-MM-DD')));
  v_num2 := (v_r->>'numero')::int;
  select count(*)::int into v_dois from demandas.demandas
   where titulo = 'CONF92 Transferir R$ 1000,00 para o fornecedor';
  if v_dois is distinct from 2 then
    falhas := falhas || format('4: dois titulos visualmente iguais nao viraram o mesmo texto (%s de 2)', v_dois); end if;

  /* ---- 5 · o teto NULL nao muda nada, e o teto cheio trava no nascimento ---- */
  v_r := public.dem_abrir(v_tok_sol, jsonb_build_object(
    'categoria_id', v_cat, 'titulo', 'CONF92 Compra sem teto nenhum',
    'descricao', 'O setor que atende nao tem teto, entao nada muda',
    'orcamento', '999999.99',
    'prazo', to_char(demandas.hoje() + 10, 'YYYY-MM-DD')));
  select * into v_d from demandas.demandas where numero = (v_r->>'numero')::int;
  if v_d.status is distinct from 'aberta' or v_d.aprovacao is not null then
    falhas := falhas || format('5: com teto NULL a demanda devia nascer aberta e sem aprovacao, nasceu %s/%s',
      v_d.status, coalesce(v_d.aprovacao, 'null')); end if;
  if demandas.falta_aprovacao(v_d) is distinct from false then
    falhas := falhas || '5: com teto NULL o portao passou a existir sozinho'::text; end if;

  v_r := public.dem_ajustar(v_tok_adm, 'setor',
    jsonb_build_object('id', v_set_com, 'teto_sem_aprovacao', '500,00'));
  if not coalesce((v_r->>'ok')::boolean, false) then
    falhas := falhas || format('5: o admin nao conseguiu definir o teto: %s', v_r); end if;
  select s.teto_sem_aprovacao into v_txt from demandas.setores s where s.id = v_set_com;
  if v_txt is distinct from '500.00' then
    falhas := falhas || format('5: o teto gravado nao e o teto enviado: %s', coalesce(v_txt,'null')); end if;

  v_r := public.dem_abrir(v_tok_sol, jsonb_build_object(
    'categoria_id', v_cat, 'titulo', 'CONF92 Compra acima do teto',
    'descricao', 'O valor passa do teto do setor que atende',
    'orcamento', '999999.99',
    'prazo', to_char(demandas.hoje() + 10, 'YYYY-MM-DD')));
  if (v_r->>'precisa_aprovacao')::boolean is distinct from true then
    falhas := falhas || format('6: dem_abrir nao avisou que o valor precisa de aprovacao: %s', v_r); end if;
  select * into v_d from demandas.demandas where numero = (v_r->>'numero')::int;
  if v_d.status is distinct from 'travada' or v_d.travada_por is distinct from 'aprovacao'
     or v_d.aprovacao is distinct from 'pendente' then
    falhas := falhas || format('6: o valor acima do teto devia nascer travado por aprovacao, nasceu %s/%s/%s',
      v_d.status, coalesce(v_d.travada_por,'null'), coalesce(v_d.aprovacao,'null')); end if;
  if demandas.falta_aprovacao(v_d) is distinct from true then
    falhas := falhas || '6: falta_aprovacao nao soma o teto do setor'::text; end if;

  v_r := public.dem_abrir(v_tok_sol, jsonb_build_object(
    'categoria_id', v_cat, 'titulo', 'CONF92 Compra abaixo do teto',
    'descricao', 'O valor cabe no teto do setor que atende',
    'orcamento', '499,99',
    'prazo', to_char(demandas.hoje() + 10, 'YYYY-MM-DD')));
  select * into v_d from demandas.demandas where numero = (v_r->>'numero')::int;
  if v_d.status is distinct from 'aberta' then
    falhas := falhas || format('6: o valor DENTRO do teto nao podia travar, nasceu %s', v_d.status); end if;

  /* e o portao le o teto DE AGORA, nao o do dia em que a demanda nasceu: esta
     demanda esta com `aprovacao` nula, entao o unico ramo de `falta_aprovacao`
     que pode responder verdadeiro e o do teto */
  if demandas.falta_aprovacao(v_d) is distinct from false then
    falhas := falhas || '6: o valor dentro do teto ja pedia aprovacao'::text; end if;
  perform public.dem_ajustar(v_tok_adm, 'setor',
    jsonb_build_object('id', v_set_com, 'teto_sem_aprovacao', '100'));
  select * into v_d from demandas.demandas where numero = (v_r->>'numero')::int;
  if demandas.falta_aprovacao(v_d) is distinct from true then
    falhas := falhas || '6: falta_aprovacao nao soma o teto do setor'::text; end if;
  perform public.dem_ajustar(v_tok_adm, 'setor',
    jsonb_build_object('id', v_set_com, 'teto_sem_aprovacao', '500,00'));

  /* e a tela consegue ler de volta o numero que ela escreveu */
  if (select x->>'teto_sem_aprovacao' from jsonb_array_elements(public.dem_bases(v_tok_adm)->'setores') x
       where (x->>'id')::uuid = v_set_com) is distinct from '500.00' then
    falhas := falhas || '7: dem_bases nao devolve o teto que o admin definiu'::text; end if;
  /* o `begin` existe porque as duas formas de errar contam igual: aceitar o
     texto e deixar o cast estourar 22P02 cru na tela sao o MESMO defeito, e sem
     o `exception` a segunda derrubaria este bloco antes de ele acusar */
  begin
    v_r := public.dem_ajustar(v_tok_adm, 'setor',
      jsonb_build_object('id', v_set_com, 'teto_sem_aprovacao', 'quinhentos'));
    if (v_r->>'erro') is distinct from 'VALOR_INVALIDO' then
      falhas := falhas || format('7: teto que nao e numero passou: %s', v_r); end if;
  exception when others then
    falhas := falhas || format('7: teto que nao e numero passou e levantou %s cru', SQLSTATE);
  end;

  /* ---- 8 · dem_ajustar grava o texto que validou ---- */
  /* o payload vai INTEIRO de proposito: desde a 88 o `on conflict do update`
     grava o que foi enviado em vez de ignorar em silencio, e mandar so o nome
     apagaria o `setor_id` da categoria, que e o que decide quem atende */
  v_r := public.dem_ajustar(v_tok_adm, 'categoria',
    jsonb_build_object('grupo', 'CONF92 grupo', 'nome', v_zwsp || 'CONF92 arte',
                       'setor_id', v_set_com, 'prazo_padrao_dias', '5'));
  v_cat2 := nullif(v_r->>'id','')::uuid;
  select count(*)::int into v_n from demandas.categorias
   where grupo = 'CONF92 grupo' and nome like '%CONF92 arte%';
  if v_n is distinct from 1 then
    falhas := falhas || format('8: nome com invisivel furou o UNIQUE da categoria (%s linhas, devia ser 1)', v_n); end if;
  if v_cat2 is distinct from v_cat then
    falhas := falhas || '8: o on conflict da 88 nao casou com o nome limpo'::text; end if;

  /* ---- 9 · url_boa julga o que o navegador le ---- */
  if demandas.url_boa('https://confiavel.com%40malicioso.com/x.pdf') is distinct from false then
    falhas := falhas || '9: o arroba escrito como %40 continua passando'::text; end if;
  if demandas.url_boa('https://confiavel.com%2540malicioso.com/x.pdf') is distinct from false then
    falhas := falhas || '9: o arroba escrito duas vezes continua passando'::text; end if;
  if demandas.url_boa('https://192.168.0.%31/segredo.pdf') is distinct from false then
    falhas := falhas || '9: IP com o ultimo octeto escapado continua passando'::text; end if;
  if demandas.url_boa('https://127.0.0.1%2e/x.pdf') is distinct from false then
    falhas := falhas || '9: IP com ponto escapado no fim continua passando'::text; end if;
  if demandas.url_boa('https://malicioso.com%2f.confiavel.com/x.pdf') is distinct from false then
    falhas := falhas || '9: barra escapada dentro da autoridade continua passando'::text; end if;
  /* e o legitimo nao pode cair junto */
  if demandas.url_boa('https://drive.google.com/file/d/abc/view') is distinct from true
     or demandas.url_boa('https://1.bp.blogspot.com/x.png') is distinct from true
     or demandas.url_boa('https://exemplo.com.br/arquivo%20com%20espaco.pdf') is distinct from true then
    falhas := falhas || '9: a decodificacao derrubou link legitimo'::text; end if;

  /* ---- 10 · travar por aprovacao com o portao inexistente ---- */
  v_r := public.dem_abrir(v_tok_sol, jsonb_build_object(
    'categoria_id', v_cat, 'titulo', 'CONF92 Arte do culto de domingo',
    'descricao', 'Uma arte para o culto, sem valor nenhum envolvido',
    'prazo', to_char(demandas.hoje() + 10, 'YYYY-MM-DD')));
  v_num := (v_r->>'numero')::int;
  v_r := public.dem_mover(v_tok_resp, v_num, 'travar',
    jsonb_build_object('motivo','aprovacao','texto','Vou travar isto aqui'));
  if (v_r->>'erro') is distinct from 'SO_GESTOR_REABRE_APROVACAO' then
    falhas := falhas || format('10: quem atende travou por aprovacao uma demanda sem portao: %s', v_r); end if;
  select * into v_d from demandas.demandas where numero = v_num;
  if v_d.status is distinct from 'aberta' then
    falhas := falhas || format('10: a demanda ficou presa em %s por uma trava que ninguem desfaz', v_d.status); end if;
  /* e o gestor continua podendo, que e o ponto da guarda */
  v_r := public.dem_mover(v_tok_ges, v_num, 'travar',
    jsonb_build_object('motivo','aprovacao','texto','Quero olhar isto antes'));
  if not coalesce((v_r->>'ok')::boolean, false) then
    falhas := falhas || format('10: o gestor perdeu o direito de travar por aprovacao: %s', v_r); end if;
  perform public.dem_mover(v_tok_ges, v_num, 'aprovar', jsonb_build_object('texto','Pode seguir'));

  /* ---- 11 · nenhuma CHECK do schema ficou `not valid` ---- */
  select count(*)::int into v_n from pg_constraint
   where connamespace = 'demandas'::regnamespace and contype = 'c' and not convalidated;
  if v_n is distinct from 0 then
    falhas := falhas || format('11: sobraram %s CHECK `not valid` no schema (na 91 eram 17): %s', v_n,
      (select string_agg(conname, ', ') from pg_constraint
        where connamespace = 'demandas'::regnamespace and contype = 'c' and not convalidated)); end if;

  /* ---- 12 · o veredito de permissao e sempre booleano ---- */
  select * into v_m from demandas.membros where token = v_tok_sol;
  select * into v_d from demandas.demandas where numero = v_num;
  v_m.papel := null; v_m.setor_id := null; v_m.id := v_resp;
  if demandas.pode_ver(v_m, v_d) is null then
    falhas := falhas || '12: pode_ver devolve NULL em vez de false'::text; end if;
  if demandas.pode_atender(v_m, v_d) is null then
    falhas := falhas || '12: pode_atender devolve NULL em vez de false'::text; end if;

  /* ---- 13 · dois setores nao podem ter o mesmo nome ---- */
  begin
    insert into demandas.setores (nome, slug, atende)
      values ('CONF92 Comunicação', 'conf92-com-2', true);
    falhas := falhas || '13: dois setores com o mesmo nome entraram'::text;
  exception when unique_violation then null; end;

  /* ---- 14 · destravar aceita o valor, e o historico registra ---- */
  v_r := public.dem_abrir(v_tok_sol, jsonb_build_object(
    'categoria_id', v_cat, 'titulo', 'CONF92 Compra sem valor informado',
    'descricao', 'A triagem vai perguntar quanto custa depois da abertura',
    'prazo', to_char(demandas.hoje() + 10, 'YYYY-MM-DD')));
  v_num2 := (v_r->>'numero')::int;
  perform public.dem_mover(v_tok_resp, v_num2, 'travar',
    jsonb_build_object('motivo','informacao','texto','Quanto custa?'));
  begin
    v_r := public.dem_mover(v_tok_sol, v_num2, 'destravar',
      jsonb_build_object('texto','Custa isto aqui','orcamento','quarenta reais'));
    if (v_r->>'erro') is distinct from 'ORCAMENTO_INVALIDO' then
      falhas := falhas || format('14: orcamento que nao e numero passou por destravar: %s', v_r); end if;
  exception when others then
    falhas := falhas || format('14: orcamento que nao e numero passou por destravar e levantou %s cru', SQLSTATE);
  end;
  v_r := public.dem_mover(v_tok_sol, v_num2, 'destravar',
    jsonb_build_object('texto','Custa isto aqui','orcamento','120,50'));
  if not coalesce((v_r->>'ok')::boolean, false) then
    falhas := falhas || format('14: destravar com valor foi recusado: %s', v_r); end if;
  select * into v_d from demandas.demandas where numero = v_num2;
  if v_d.orcamento is distinct from 120.50 then
    falhas := falhas || format('14: o valor informado na resposta nao foi gravado: %s',
      coalesce(v_d.orcamento::text,'null')); end if;
  /* o `para` do evento sai de `to_char(..., 'FM999G999G990D00')`, e o separador
     depende do lc_numeric do banco: comparar com a mesma expressao, e nao com
     um literal, e o que impede este caso de reprovar por causa de locale */
  if not exists (select 1 from demandas.eventos e
                  where e.demanda_id = v_d.id and e.tipo = 'orcamento'
                    and e.para = to_char(120.50, 'FM999G999G990D00')) then
    falhas := falhas || '14: o gatilho nao registrou a chegada do valor'::text; end if;
  if v_d.status is distinct from 'aberta' then
    falhas := falhas || format('14: o valor DENTRO do teto nao podia travar de novo, ficou %s', v_d.status); end if;

  /* e o valor que passa do teto troca o portao em vez de soltar */
  v_r := public.dem_abrir(v_tok_sol, jsonb_build_object(
    'categoria_id', v_cat, 'titulo', 'CONF92 Compra cara sem valor informado',
    'descricao', 'A triagem pergunta, e a resposta passa do teto do setor',
    'prazo', to_char(demandas.hoje() + 10, 'YYYY-MM-DD')));
  v_num2 := (v_r->>'numero')::int;
  perform public.dem_mover(v_tok_resp, v_num2, 'travar',
    jsonb_build_object('motivo','informacao','texto','Quanto custa?'));
  perform public.dem_mover(v_tok_sol, v_num2, 'destravar',
    jsonb_build_object('texto','Custa isto','orcamento','5000.00'));
  select * into v_d from demandas.demandas where numero = v_num2;
  if v_d.status is distinct from 'travada' or v_d.travada_por is distinct from 'aprovacao' then
    falhas := falhas || format('15: o valor acima do teto devia trocar de portao, ficou %s/%s',
      v_d.status, coalesce(v_d.travada_por,'null')); end if;

  /* ---- 16 · o gatilho de historico nao tem ramo inalcancavel ---- */
  select pg_get_functiondef(p.oid) into v_txt from pg_proc p
   where p.pronamespace = 'demandas'::regnamespace and p.proname = 'fn_historico';
  if position('new.titulo is distinct from old.titulo' in v_txt) > 0 then
    falhas := falhas || '16: fn_historico ainda registra mudanca de titulo, que nenhuma acao faz'::text; end if;
  if position('new.descricao is distinct from old.descricao' in v_txt) > 0 then
    falhas := falhas || '16: fn_historico ainda registra mudanca de descricao, que nenhuma acao faz'::text; end if;
  if position('new.orcamento is distinct from old.orcamento' in v_txt) = 0 then
    falhas := falhas || '16: o ramo de orcamento saiu junto, e ele agora e alcancavel'::text; end if;

  /* ---- 17 · dem_numeros decide sozinha o que e uma data ---- */
  if to_regprocedure('public.dem_numeros(text,date,date)') is not null then
    falhas := falhas || '17: a assinatura antiga de dem_numeros continua la, e duas iguais quebram o PostgREST'::text; end if;
  begin
    v_r := public.dem_numeros(v_tok_ges, '2026-13-45', null);
    if (v_r->>'erro') is distinct from 'PERIODO_INVALIDO' then
      falhas := falhas || format('17: data impossivel nao virou PERIODO_INVALIDO: %s', v_r); end if;
  exception when others then
    falhas := falhas || format('17: dem_numeros levantou %s em vez de devolver PERIODO_INVALIDO', SQLSTATE);
  end;
  begin
    v_r := public.dem_numeros(v_tok_ges, 'ontem', 'hoje');
    if (v_r->>'erro') is distinct from 'PERIODO_INVALIDO' then
      falhas := falhas || format('17: texto que nao e data nao virou PERIODO_INVALIDO: %s', v_r); end if;
  exception when others then
    falhas := falhas || format('17: dem_numeros levantou %s com texto que nao e data', SQLSTATE);
  end;
  v_r := public.dem_numeros(v_tok_ges,
    to_char(demandas.hoje() - 30, 'YYYY-MM-DD'), to_char(demandas.hoje(), 'YYYY-MM-DD'));
  if not coalesce((v_r->>'ok')::boolean, false) then
    falhas := falhas || format('17: o periodo valido parou de funcionar: %s', v_r); end if;
  if (v_r->'numeros'->>'de') is distinct from to_char(demandas.hoje() - 30, 'YYYY-MM-DD') then
    falhas := falhas || format('17: a funcao nao usou o periodo que recebeu: %s', v_r->'numeros'->>'de'); end if;
  v_r := public.dem_numeros(v_tok_ges,
    to_char(demandas.hoje(), 'YYYY-MM-DD'), to_char(demandas.hoje() - 30, 'YYYY-MM-DD'));
  if (v_r->>'erro') is distinct from 'PERIODO_INVERTIDO' then
    falhas := falhas || format('17: o periodo invertido da 88 parou de avisar: %s', v_r); end if;
  /* a funcao trocou de assinatura, e assinatura nova nasce SEM grant nenhum: a
     tela de indicadores e alcancada por quem entra pelo link pessoal, que para
     o PostgREST e `anon`, e nao por quem tem sessao do Supabase Auth */
  if not has_function_privilege('anon', 'public.dem_numeros(text,text,text)', 'execute') then
    falhas := falhas || '17: dem_numeros fechou para quem entra pelo link pessoal'::text; end if;
  if not has_function_privilege('authenticated', 'public.dem_numeros(text,text,text)', 'execute') then
    falhas := falhas || '17: dem_numeros fechou para quem entra pelo login'::text; end if;

  /* ---- 18 · a porta publica nao apaga tabela de Demandas ---- */
  if exists (select 1 from pg_class c
              where c.relnamespace = 'demandas'::regnamespace and c.relkind = 'r'
                and (has_table_privilege('anon', c.oid, 'truncate')
                  or has_table_privilege('authenticated', c.oid, 'truncate'))) then
    falhas := falhas || format('18: a porta publica pode esvaziar tabela de Demandas: %s',
      (select string_agg(c.relname, ', ') from pg_class c
        where c.relnamespace = 'demandas'::regnamespace and c.relkind = 'r'
          and (has_table_privilege('anon', c.oid, 'truncate')
            or has_table_privilege('authenticated', c.oid, 'truncate')))); end if;
  if exists (select 1 from pg_class c
              where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
                and c.relname like 'dem\_%') then
    falhas := falhas || '18: apareceu tabela de Demandas em `public`, onde o TRUNCATE de authenticated alcanca'::text; end if;

  /* ---- limpeza ---- */
  delete from demandas.avisos a using demandas.demandas d
   where a.demanda_id = d.id and d.titulo like 'CONF92%';
  delete from demandas.eventos e using demandas.demandas d
   where e.demanda_id = d.id and d.titulo like 'CONF92%';
  delete from demandas.anexos a using demandas.demandas d
   where a.demanda_id = d.id and d.titulo like 'CONF92%';
  delete from demandas.demandas where titulo like 'CONF92%';
  delete from demandas.membros where nome like 'CONF92%';
  /* `like`, e nao `=`: o bloco 8 cria categoria PELA FUNCAO QUE ESTA SENDO
     JULGADA, e uma sabotagem que mexe em `uma_linha` muda o texto gravado. Com
     `grupo = 'CONF92 grupo'` a limpeza errava a linha, a chave estrangeira
     segurava o `delete` do setor, e a bateria via um erro de FK no lugar da
     reprovacao que o bloco ja tinha escrito. Limpeza que depende do acusado e
     limpeza que some junto com ele. */
  delete from demandas.categorias where grupo like 'CONF92%';
  delete from demandas.setores where nome like 'CONF92%';

  if array_length(falhas, 1) > 0 then
    raise exception E'92 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 92 · conferencia: 18 blocos. A classe de invisiveis cobre os tres conjuntos inteiros, o reordenador nao sobrevive no meio do titulo e a quebra de linha da descricao sobrevive, dois titulos que se leem iguais sao o mesmo texto, o teto do setor trava no nascimento e some quando e NULL, dem_ajustar grava o que validou, url_boa le a autoridade decodificada, travar por aprovacao nao cai no NULL, nenhuma CHECK ficou `not valid`, o veredito de permissao e booleano, dois setores nao repetem nome, destravar aceita o valor e o gatilho registra, e dem_numeros devolve PERIODO_INVALIDO em vez de estourar.';
end $conf$;

insert into public.schema_versao (n, arquivo)
  values (92, '92-o-teto-era-de-quem-pede-e-o-invisivel-passava-pelo-meio.sql')
  on conflict (n) do nothing;

commit;
