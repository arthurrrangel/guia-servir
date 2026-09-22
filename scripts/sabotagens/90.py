RESTAURA = [84, 85, 86, 87, 88, 89, 90]
CASOS = [
 {"nome": "a fila deixa de enxergar demanda nova",
  "sql": troca('a_avisar', "where d.avisado_em is null", "where false", schema='demandas'),
  "espera": "1: a demanda nova NAO entrou na fila de aviso"},

 {"nome": "o carimbo para de filtrar, e a demanda ja avisada volta para a fila",
  "sql": troca('a_avisar', "where d.avisado_em is null", "where true", schema='demandas'),
  "espera": "5: a demanda carimbada continua na fila"},

 {"nome": "o solicitante volta a receber aviso de trabalho que nao e dele",
  "sql": troca('a_avisar', "and m.papel in ('responsavel','gestor','admin')", "", schema='demandas'),
  "espera": "2: o solicitante entrou na lista de quem atende"},

 {"nome": "quem abriu volta a ser avisado do proprio pedido",
  "sql": troca('a_avisar', "and m.id is distinct from d.aberta_por", "", schema='demandas'),
  "espera": "3: quem abriu recebeu aviso da propria demanda"},

 {"nome": "o email para de ser normalizado, e o mesmo endereco vira dois",
  "sql": troca('a_avisar', "'email', lower(coalesce(m.auth_email, m.email))",
                           "'email', coalesce(m.auth_email, m.email)", schema='demandas'),
  "espera": "2: o email nao foi normalizado"},

 {"nome": "membro inativo volta a receber",
  "sql": troca('a_avisar', "and coalesce(m.ativo, true)", "", schema='demandas'),
  "espera": "2: devia avisar 2 pessoas"},

 {"nome": "o aviso para de dizer que a demanda espera aprovacao",
  "sql": troca('a_avisar', "'falta_aprovacao', demandas.falta_aprovacao(d),",
                           "'falta_aprovacao', false,", schema='demandas'),
  "espera": "4: o aviso nao diz que a demanda ja nasce esperando aprovacao"},

 {"nome": "demanda cancelada volta para a fila de aviso",
  "sql": troca('a_avisar', "and d.status not in ('concluida','cancelada')", "", schema='demandas'),
  "espera": "7: demanda cancelada continua na fila"},

 {"nome": "o carimbo passa a valer para quem ja tinha carimbo",
  "sql": troca('marcar_avisado', "and avisado_em is null", "", schema='demandas'),
  "espera": "5: carimbar duas vezes contou de novo"},

 {"nome": "o teto some e a varredura devolve a fila inteira",
  "sql": troca('a_avisar', "limit greatest(coalesce(p_limite, 50), 1)", "limit 1000", schema='demandas'),
  "espera": "9: o limite nao foi respeitado"},

 {"nome": "a funcao que le email de gente abre para a porta publica",
  "sql": "grant execute on function demandas.a_avisar(int) to anon;",
  "espera": "8: a_avisar esta aberta para a porta publica"},

 {"nome": "o carimbo abre para a porta publica",
  "sql": "grant execute on function demandas.marcar_avisado(uuid[], text) to authenticated;",
  "espera": "8: marcar_avisado esta aberta para a porta publica"},
]
