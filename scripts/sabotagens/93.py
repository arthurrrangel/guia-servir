# A bateria da 93. Cada conserto do arquivo tem aqui uma sabotagem que o desfaz
# no corpo VIVO da funcao, e a conferencia tem que reprovar nomeando o caso.
#
# Conserto sem sabotagem e conferencia por enfeite: o verde nao prova nada
# porque ninguem tentou fazer ficar vermelho.
#
# DUAS CAMADAS QUE A BATERIA PRECISA SABER SEPARAR: o conserto 4 poe uma regex
# (o caminho normal) e um `exception` (a rede) na mesma porta. Sabotar so uma
# das duas deixa a outra respondendo a mesma coisa, e um caso de comportamento
# saia verde com meia correcao de pe. Por isso o conserto 4 tem TRES sabotagens
# por porta: a regex sozinha e a rede sozinha, que so o caso de TEXTO acusa, e
# as duas juntas, que e o unico jeito de o caso de comportamento ficar vermelho.
#
# A 67 ABRE A LISTA, E NAO E DETALHE DE ORDEM. Ela e a unica migracao que
# reescreve `dem_bases` por inteiro (§ 2), e sem ela o banco da bateria fica com
# a `dem_bases` velha, que devolve nome, papel, setor e TELEFONE de todo mundo
# para qualquer `responsavel`. `scripts/demandas-banco.sh` a trouxe de volta em
# 22/09 pelo mesmo motivo, e um banco de bateria que nao e o do harness mede um
# sistema que nao existe em lugar nenhum.
RESTAURA = [67, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93]

CASOS = [
 # ---------------------------------- o carimbo da validacao no reabrir (A1)
 {"nome": "reabrir volta a deixar o carimbo da validacao de pe",
  # o defeito medido: a ficha imprime "Validada por Fulano em 22/09" sobre uma
  # conclusao nova, e `validar` devolve JA_VALIDADA para sempre.
  "sql": troca('dem_mover', "validada_em = null, validada_por = null,",
                            "validada_em = validada_em, validada_por = validada_por,"),
  "espera": "1: reabrir deixou o carimbo de validacao de pe"},

 {"nome": "reabrir limpa a data e esquece quem validou",
  # meia limpeza deixa um nome pendurado numa validacao que nao existe mais.
  "sql": troca('dem_mover', "validada_em = null, validada_por = null,", "validada_em = null,"),
  "espera": "1: reabrir deixou o nome de quem validou de pe"},

 # -------------------------------- a escalada de quem atende (A2)
 {"nome": "a guarda volta ao coalesce da 92 e le NULL como 'ja foi aprovada'",
  "sql": troca('dem_mover',
               "and d.aprovacao is not distinct from 'aprovada'"
               " and m.papel not in ('gestor','admin') then",
               "and coalesce(d.aprovacao, 'aprovada') is not distinct from 'aprovada'"
               " and m.papel not in ('gestor','admin') then"),
  "espera": "2: quem atende nao consegue pedir aprovacao numa demanda sem portao"},

 {"nome": "a guarda some de vez e o beco que a 92 fechou reabre",
  # o contrapeso: sem este caso a bateria premiaria apagar a guarda inteira.
  "sql": troca('dem_mover',
               "if v_motivo = 'aprovacao' and d.aprovacao is not distinct from 'aprovada'"
               " and m.papel not in ('gestor','admin') then",
               "if false then"),
  "espera": "2: quem atende reabriu uma aprovacao que o gestor ja tinha concedido"},

 {"nome": "a guarda passa a barrar tambem quem decide",
  "sql": troca('dem_mover',
               "and d.aprovacao is not distinct from 'aprovada'"
               " and m.papel not in ('gestor','admin') then",
               "and d.aprovacao is not distinct from 'aprovada' then"),
  "espera": "2: o gestor perdeu o direito de reabrir a aprovacao"},

 # ------------------------------------- o historico com teto (A3)
 {"nome": "o teto do historico some e a ficha volta a crescer sem limite",
  "sql": troca('dem_ver', "order by x.em desc, x.id desc limit 200) e)",
                          "order by x.em desc, x.id desc) e)"),
  "espera": "3: dem_ver devolveu 260 eventos"},

 {"nome": "o recorte pega os 200 mais ANTIGOS",
  # o erro facil de cometer: `limit` sem `desc` devolve o comeco do historico, e
  # a ficha de uma demanda de tres meses passa a mostrar so o primeiro dia.
  "sql": troca('dem_ver', "order by x.em desc, x.id desc", "order by x.em, x.id"),
  "espera": "3: o recorte pegou o comeco do historico"},

 {"nome": "o historico chega em ordem decrescente e a ficha imprime de tras para frente",
  # o motivo de o recorte ser reordenado por fora: a tela imprime na ordem em
  # que recebe, sem ordenar nada.
  "sql": troca('dem_ver', "order by e.em, e.id)", "order by e.em desc, e.id desc)"),
  "espera": "3: o historico chegou de tras para frente"},

 {"nome": "eventos_total passa a contar o recorte em vez do historico",
  "sql": troca('dem_ver',
               "'eventos_total', (select count(*) from demandas.eventos e"
               " where e.demanda_id = d.id and (v_interno or not e.interno)),",
               "'eventos_total', 200,"),
  "espera": "3: eventos_total disse 200 para quem pediu"},

 {"nome": "eventos_total conta os internos e conta para quem pediu quantos existem",
  "sql": troca('dem_ver',
               "'eventos_total', (select count(*) from demandas.eventos e"
               " where e.demanda_id = d.id and (v_interno or not e.interno)),",
               "'eventos_total', (select count(*) from demandas.eventos e"
               " where e.demanda_id = d.id),"),
  "espera": "3: eventos_total disse 263 para quem pediu"},

 {"nome": "o recorte esquece o filtro de interno e entrega o que so a equipe ve",
  "sql": troca('dem_ver', "where x.demanda_id = d.id and (v_interno or not x.interno)",
                          "where x.demanda_id = d.id"),
  "espera": "3: o recorte trouxe comentario interno para quem pediu"},

 # ------------------------------------ dinheiro que nao cabe na coluna (A4)
 {"nome": "dem_abrir: a regex volta a nao limitar digitos (a rede segura)",
  "sql": troca('dem_abrir', "'^[0-9]{1,10}([.,][0-9]{1,2})?$'", "'^[0-9]+([.,][0-9]{1,2})?$'"),
  "espera": "4: public.dem_abrir(text,jsonb) voltou a aceitar dinheiro sem limite de digitos"},

 {"nome": "dem_abrir: a rede some (a regex segura)",
  "sql": troca('dem_abrir',
               "when numeric_value_out_of_range then"
               " return jsonb_build_object('ok', false, 'erro', 'ORCAMENTO_INVALIDO');"
               " when not_null_violation then",
               "when not_null_violation then"),
  "espera": "4: public.dem_abrir(text,jsonb) ficou sem rede"},

 {"nome": "dem_abrir: as duas camadas somem e o 22003 volta para a tela",
  "sql": troca('dem_abrir',
               "when numeric_value_out_of_range then"
               " return jsonb_build_object('ok', false, 'erro', 'ORCAMENTO_INVALIDO');"
               " when not_null_violation then",
               "when not_null_violation then")
         + "\n"
         + troca('dem_abrir', "'^[0-9]{1,10}([.,][0-9]{1,2})?$'", "'^[0-9]+([.,][0-9]{1,2})?$'"),
  "espera": "4: dem_abrir levantou 22003 cru com um valor de onze digitos"},

 {"nome": "dem_abrir: a regra fica mais apertada que a coluna",
  # o contrapeso, na forma da 92: sem ele a bateria premiaria qualquer limite
  # mais duro, inclusive um que recusasse R$ 9.999.999.999,99, que CABE.
  "sql": troca('dem_abrir', "'^[0-9]{1,10}([.,][0-9]{1,2})?$'", "'^[0-9]{1,6}([.,][0-9]{1,2})?$'"),
  "espera": "4: o maior valor que cabe na coluna foi recusado"},

 {"nome": "destravar: a regex volta a nao limitar digitos (a rede segura)",
  "sql": troca('dem_mover', "'^[0-9]{1,10}([.,][0-9]{1,2})?$'", "'^[0-9]+([.,][0-9]{1,2})?$'"),
  "espera": "4: public.dem_mover(text,int,text,jsonb) voltou a aceitar dinheiro sem limite de digitos"},

 {"nome": "destravar: a rede some (a regex segura)",
  "sql": troca('dem_mover',
               "when numeric_value_out_of_range then"
               " return jsonb_build_object('ok', false, 'erro', 'ORCAMENTO_INVALIDO');"
               " when unique_violation then",
               "when unique_violation then"),
  "espera": "4: public.dem_mover(text,int,text,jsonb) ficou sem rede"},

 {"nome": "destravar: as duas camadas somem e o 22003 volta para a tela",
  "sql": troca('dem_mover',
               "when numeric_value_out_of_range then"
               " return jsonb_build_object('ok', false, 'erro', 'ORCAMENTO_INVALIDO');"
               " when unique_violation then",
               "when unique_violation then")
         + "\n"
         + troca('dem_mover', "'^[0-9]{1,10}([.,][0-9]{1,2})?$'", "'^[0-9]+([.,][0-9]{1,2})?$'"),
  "espera": "4: destravar levantou 22003 cru com um valor de onze digitos"},

 {"nome": "o teto do setor: a regex volta a nao limitar digitos (a rede segura)",
  "sql": troca('dem_ajustar', "'^[0-9]{1,10}([.,][0-9]{1,2})?$'", "'^[0-9]+([.,][0-9]{1,2})?$'"),
  "espera": "4: public.dem_ajustar(text,text,jsonb) voltou a aceitar dinheiro sem limite de digitos"},

 {"nome": "o teto do setor: a rede some (a regex segura)",
  "sql": troca('dem_ajustar',
               "when numeric_value_out_of_range then"
               " return jsonb_build_object('ok', false, 'erro', 'VALOR_INVALIDO');"
               " when unique_violation then",
               "when unique_violation then"),
  "espera": "4: public.dem_ajustar(text,text,jsonb) ficou sem rede"},

 {"nome": "o teto do setor: as duas camadas somem e o 22003 volta para Ajustes",
  "sql": troca('dem_ajustar',
               "when numeric_value_out_of_range then"
               " return jsonb_build_object('ok', false, 'erro', 'VALOR_INVALIDO');"
               " when unique_violation then",
               "when unique_violation then")
         + "\n"
         + troca('dem_ajustar', "'^[0-9]{1,10}([.,][0-9]{1,2})?$'", "'^[0-9]+([.,][0-9]{1,2})?$'"),
  "espera": "4: dem_ajustar levantou 22003 cru com um teto de onze digitos"},

 # ------------------------------ a trava que muda sem mudar o status (A5)
 {"nome": "o ramo da trava sai do gatilho e re-travar volta a nao deixar rastro",
  "sql": troca('fn_historico',
               "if new.status is not distinct from old.status"
               " and (new.travada_por is distinct from old.travada_por"
               " or new.travada_nota is distinct from old.travada_nota) then",
               "if false then", schema='demandas'),
  "espera": "5: re-travar com outro motivo deixou 0 evento(s) de trava"},

 {"nome": "a guarda do status sai e toda trava vira linha dupla no historico",
  # o motivo de a guarda existir: com o status mudando, o ramo de cima ja grava
  # a nota nova no texto do evento.
  "sql": troca('fn_historico',
               "if new.status is not distinct from old.status and (new.travada_por",
               "if (new.travada_por", schema='demandas'),
  "espera": "5: a primeira trava virou evento duplo"},

 {"nome": "o ramo olha so o motivo e a troca de nota some de novo",
  "sql": troca('fn_historico', "or new.travada_nota is distinct from old.travada_nota)",
                               "or false)", schema='demandas'),
  "espera": "5: trocar so a nota da trava nao entrou no historico (1 de 2)"},

 {"nome": "o evento da trava perde o de-onde e o para-onde",
  "sql": troca('fn_historico', "'trava', old.travada_por, new.travada_por, new.travada_nota)",
                               "'trava', null, null, new.travada_nota)", schema='demandas'),
  "espera": "5: o evento da trava nao diz de onde, para onde"},

 # ------------------------------------------- o toque duplo na abertura (A6)
 {"nome": "a guarda do toque duplo some e duas chamadas iguais viram duas demandas",
  "sql": troca('dem_abrir', "if v_rep is not null then", "if false then"),
  "espera": "6: o toque duplo abriu duas demandas"},

 {"nome": "a janela do toque duplo vira uma hora e engole pedido legitimo",
  # o contrapeso: janela larga transforma "pedi de novo porque preciso de novo"
  # em silencio, e a pessoa fica achando que o sistema nao gravou.
  "sql": troca('dem_abrir', "d2.criada_em > now() - interval '20 seconds'",
                            "d2.criada_em > now() - interval '1 hour'"),
  "espera": "6: uma demanda de cinco minutos atras foi tratada como toque duplo"},

 {"nome": "a guarda esquece de quem e a demanda e engole a de outra pessoa",
  "sql": troca('dem_abrir', "where d2.aberta_por = m.id and d2.titulo", "where d2.titulo"),
  "espera": "6: a guarda do toque duplo engoliu a demanda de outra pessoa"},

 {"nome": "a guarda compara o titulo cru e um invisivel no meio fura o toque duplo",
  # exatamente o que a 92 mediu chegando de tela de celular: a mesma frase com
  # um caractere que nao desenha nada.
  "sql": troca('dem_abrir', "and d2.titulo is not distinct from demandas.uma_linha(p_d->>'titulo')",
                            "and d2.titulo is not distinct from p_d->>'titulo'"),
  "espera": "6: o mesmo titulo com um invisivel no meio abriu outra demanda"},

 {"nome": "a resposta da repeticao e encurtada e a tela de pronto perde o botao de avisar",
  "sql": troca('dem_abrir',
               "return jsonb_build_object('ok', true, 'numero', v_rep, 'repetido', true,"
               " 'precisa_aprovacao', v_exige,"
               " 'setor_responsavel', (select s.nome from demandas.setores s where s.id = v_resp),"
               " 'contato', demandas.contato_do_setor(v_resp));",
               "return jsonb_build_object('ok', true, 'numero', v_rep, 'repetido', true);"),
  "espera": "6: a resposta da repeticao nao serve a tela de pronto"},

 {"nome": "o contato do setor passa a sair por ordem alfabetica e o recado vai para quem manda",
  # a funcao nova saiu de dentro de dem_abrir, e extracao sem caso e mudanca
  # sem medida: a ordem (papel primeiro, nome depois) e o que ela carrega.
  "sql": troca('contato_do_setor',
               "order by case x.papel when 'responsavel' then 0 when 'gestor' then 1"
               " when 'admin' then 2 else 3 end, x.nome",
               "order by x.nome", schema='demandas'),
  "espera": "6: o contato do setor deixou de ser quem atende"},

 # ------------------------------------------ as colunas mortas da 90 (A7)
 {"nome": "uma das colunas mortas da 90 volta para a tabela",
  "sql": "alter table demandas.demandas add column if not exists avisado_em timestamptz;",
  "espera": "7: 1 coluna(s) da 90 continuam na tabela"},

 {"nome": "as duas colunas mortas da 90 voltam para a tabela",
  "sql": "alter table demandas.demandas add column if not exists avisado_em timestamptz;\n"
         "alter table demandas.demandas add column if not exists aviso_motivo text;",
  "espera": "7: 2 coluna(s) da 90 continuam na tabela"},

# O INVENTARIO DA PORTA PUBLICA NAO TEM CASO AQUI, E ISSO E DECISAO.
#
# `public.porta_publica` nasce na migracao 77, que e do sistema de ESCALAS e
# nao entra na cadeia de `scripts/demandas-banco.sh` nem na desta bateria. Um
# caso aqui morreria com `relation "public.porta_publica" does not exist`, que
# nao e reprovacao: e a sabotagem nao chegando a acontecer. Deixa-lo na lista
# com essa saida seria a mentira que esta bateria existe para pegar.
#
# Quem prova o bloco 8 da 93 e `bash scripts/escala-banco.sh`, que roda
# `testar_porta_publica()` (a funcao da 77, que compara inventario e catalogo
# NOS DOIS SENTIDOS) contra o banco com as duas cadeias juntas. Medido em
# 22/09/2026: com a 92 e sem o bloco 8, reprova; com o bloco 8, `6/6`.
]
