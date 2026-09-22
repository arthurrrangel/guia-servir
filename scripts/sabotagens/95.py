# A bateria da 95. Cada guarda da migracao tem aqui uma sabotagem que a desfaz
# no corpo VIVO da funcao (ou no grant, ou na tabela), e a conferencia tem que
# reprovar nomeando o caso certo. Conserto sem sabotagem e conferencia por
# enfeite.
#
# A regra de anexo tem TRES portas (dem_abrir, dem_mover, dem_ajustar) e UMA
# funcao de decisao (anexo_permitido). Cada porta e sabotada sozinha, porque
# uma porta que esquece a lista deixa as outras duas dizendo nao e o caso
# geral ficaria verde com uma porta aberta.
RESTAURA = [67, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95]

CASOS = [
 # ---------------------------------------------------------- a decisao
 {"nome": "anexo_permitido diz sim para todo mundo",
  "sql": troca('anexo_permitido',
               "not coalesce((select g.anexo_restrito from demandas.regras_gerais g where g.id), false)",
               "true", schema='demandas'),
  "espera": "2: site fora da lista passou, ou a recusa nao disse qual"},

 {"nome": "a fronteira do subdominio deixa de ser o ponto",
  "sql": troca('anexo_permitido',
               "right(demandas.url_host(u), length(x.site) + 1) = '.' || x.site",
               "right(demandas.url_host(u), length(x.site)) = x.site", schema='demandas'),
  "espera": "3: site que so TERMINA com o nome de um da lista passou"},

 # ---------------------------------------------------------- as portas
 {"nome": "dem_mover anexa sem olhar a lista",
  "sql": troca('dem_mover', "if not demandas.anexo_permitido(v_url) then", "if false then"),
  "espera": "2: site fora da lista passou, ou a recusa nao disse qual"},

 {"nome": "a recusa de dem_mover nao diz qual site",
  "sql": troca('dem_mover', "'site', demandas.url_host(v_url)); end if;", "'site', null); end if;"),
  "espera": "2: site fora da lista passou, ou a recusa nao disse qual"},

 {"nome": "dem_abrir deixa a demanda nascer com anexo de fora",
  "sql": troca('dem_abrir', "and not demandas.anexo_permitido(demandas.limpo(a->>'url'))) then", "and false) then"),
  "espera": "5: a abertura aceitou anexo de site fora da lista"},

 {"nome": "dem_bases esconde a regra da tela",
  "sql": troca('dem_bases', "'anexos', demandas.regra_de_anexo()", "'anexos', null"),
  "espera": "7: dem_bases nao mostra a regra de anexo"},

 # ---------------------------------------------------------- a administracao
 {"nome": "qualquer papel mexe na lista",
  "sql": troca('dem_ajustar',
               "if m.papel <> 'admin' then return jsonb_build_object('ok', false, 'erro', 'SO_ADMIN'); end if;", ""),
  "espera": "6: quem nao administra mexeu na lista"},

 {"nome": "incluir grava o endereco colado como veio",
  "sql": troca('site_do_texto', "'^[a-z][a-z0-9+.-]*://', ''", "'^$', ''", schema='demandas'),
  "espera": "6: incluir pelo endereco colado nao guardou so o site"},

 {"nome": "o dominio de pais inteiro entra na lista",
  "sql": troca('site_do_texto',
               "when v ~ '^(com|net|org|gov|edu|art|blog|app|eco|ind|inf|nom|srv|tv|mil|jus|leg|mp|adv|med|eng|arq|co|ac|or|ne|go)\\.[a-z]{2}$' then null",
               "", schema='demandas'),
  "espera": "6: texto que nao e site, dominio de pais inteiro ou IP entrou na lista"},

 {"nome": "o IP entra na lista",
  "sql": troca('site_do_texto', "when v ~ '\\.[0-9]+$' then null", "", schema='demandas'),
  "espera": "6: texto que nao e site, dominio de pais inteiro ou IP entrou na lista"},

 {"nome": "o site aberto entra inteiro",
  "sql": troca('dem_ajustar', "if demandas.site_aberto(v_ch) then", "if false then"),
  "espera": "6: o site aberto entrou inteiro"},

 {"nome": "um pedido recusado grava a parte boa antes de recusar",
  "sql": troca('dem_ajustar',
               "if v_ch is null then return jsonb_build_object('ok', false, 'erro', 'SITE_INVALIDO', 'campo', 'incluir'); end if;",
               "if v_ch is null then update demandas.regras_gerais set anexo_restrito = coalesce((p_d->>'restrito')::boolean, anexo_restrito) where id; "
               "return jsonb_build_object('ok', false, 'erro', 'SITE_INVALIDO', 'campo', 'incluir'); end if;"),
  "espera": "6: um pedido recusado desligou a lista mesmo assim"},

 # ---------------------------------------------------------- a barra invertida
 # DUAS CAMADAS: `url_autoridade` corta a autoridade na barra crua (e o site
 # julgado vira o que o navegador visita), e `url_boa` recusa a barra
 # DECODIFICADA na autoridade. Sabotada so a primeira, a segunda ainda barra
 # `localhost\.x` (a barra crua chega ate ela) -- so que por URL_INVALIDA, e
 # `drive.google.com\arquivo`, que e legitimo, cai junto. E esse caso que
 # acusa a primeira camada sozinha; o de localhost so acusa as duas juntas.
 {"nome": "url_autoridade volta a ignorar a barra invertida",
  "sql": troca('url_autoridade', "'^[^/?#\\\\]*')", "'^[^/?#]*')", schema='demandas'),
  "espera": "4: site da lista com barra invertida no caminho foi recusado"},

 {"nome": "as duas camadas da barra invertida caem juntas",
  "sql": troca('url_autoridade', "'^[^/?#\\\\]*')", "'^[^/?#]*')", schema='demandas')
         + troca('url_boa', "and demandas.autoridade_lida(u) !~ '[/?#\\\\]'", "and demandas.autoridade_lida(u) !~ '[/?#]'", schema='demandas'),
  "espera": "4: localhost ou IP passou escondido atras de uma barra invertida"},

 {"nome": "url_boa deixa passar a barra invertida decodificada",
  "sql": troca('url_boa', "and demandas.autoridade_lida(u) !~ '[/?#\\\\]'", "and demandas.autoridade_lida(u) !~ '[/?#]'", schema='demandas'),
  "espera": "4: barra invertida decodificada (%5c) na autoridade passou"},

 # ---------------------------------------------------------- por fora das funcoes
 {"nome": "anon ganha a lista por fora da porta",
  "sql": "grant select on demandas.sites_de_anexo to anon;",
  "espera": "8: anon alcanca a regra de anexo por fora da porta"},

 {"nome": "anon executa a decisao por fora da porta",
  "sql": "grant execute on function demandas.anexo_permitido(text) to anon;",
  "espera": "8: anon alcanca a regra de anexo por fora da porta"},

 {"nome": "authenticated escreve o interruptor por fora da porta",
  "sql": "grant update on demandas.regras_gerais to authenticated;",
  "espera": "8: authenticated escreve na regra de anexo por fora da porta"},

 {"nome": "a tabela nova perde o RLS",
  "sql": "alter table demandas.regras_gerais disable row level security;",
  "espera": "8: tabela nova sem RLS"},

 {"nome": "a lista ganha um site onde qualquer pessoa publica pagina",
  "sql": "insert into demandas.sites_de_anexo (site) values ('github.io');",
  "espera": "8: a lista tem um site onde qualquer pessoa publica pagina"},
]
