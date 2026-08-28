/* =============================================================================
   37 — CONSERTA O QUE A TROCA MECÂNICA QUEBROU

   A migração 36 tirou o travessão longo do texto que vem do banco com
   `replace(x, ' — ', '. ')`. A regra rodou, o travessão sumiu, e o resultado
   ficou assim em cinco áreas:

       "Dá para mudar depois. isso é só para a liderança se organizar."
       "Se nunca fez nada, escreva 'nunca fiz'. tem gente para ensinar."

   Ponto final seguido de minúscula. A migração passou em todas as conferências
   que eu escrevi para ela — "travessões restantes: 0" — porque eu tinha
   conferido a ausência do caractere errado e não a presença do texto certo.

   O travessão longo em português quase nunca vira ponto: ele emenda duas
   partes da mesma frase. Quem emenda é o dois-pontos.

   A ASSINATURA DO ESTRAGO é ". " seguido de letra minúscula, que não acontece
   em português escrito. Por isso dá para consertar sem lista de ids: o padrão
   só existe onde a 36 passou. O `returning` mostra cada linha alterada, para a
   conferência ser o texto novo e não a contagem de um caractere.
   ============================================================================= */

with antes as (
  select id, ajuda as velho from perguntas where ajuda ~ '\. [[:lower:]]'
), mudou as (
  update perguntas p
     set ajuda = regexp_replace(p.ajuda, '\. ([[:lower:]])', ': \1', 'g')
    from antes a where a.id = p.id
  returning p.id, 'perguntas.ajuda' as onde, a.velho, p.ajuda as novo
) select * from mudou;

with antes as (
  select id, texto as velho from perguntas where texto ~ '\. [[:lower:]]'
), mudou as (
  update perguntas p
     set texto = regexp_replace(p.texto, '\. ([[:lower:]])', ': \1', 'g')
    from antes a where a.id = p.id
  returning p.id, 'perguntas.texto' as onde, a.velho, p.texto as novo
) select * from mudou;

with antes as (
  select id, convite as velho from equipes where convite ~ '\. [[:lower:]]'
), mudou as (
  update equipes e
     set convite = regexp_replace(e.convite, '\. ([[:lower:]])', ': \1', 'g')
    from antes a where a.id = e.id
  returning e.id, 'equipes.convite' as onde, a.velho, e.convite as novo
) select * from mudou;

with antes as (
  select id, descricao as velho from equipes where descricao ~ '\. [[:lower:]]'
), mudou as (
  update equipes e
     set descricao = regexp_replace(e.descricao, '\. ([[:lower:]])', ': \1', 'g')
    from antes a where a.id = e.id
  returning e.id, 'equipes.descricao' as onde, a.velho, e.descricao as novo
) select * from mudou;

with antes as (
  select id, descricao as velho from funcoes where descricao ~ '\. [[:lower:]]'
), mudou as (
  update funcoes f
     set descricao = regexp_replace(f.descricao, '\. ([[:lower:]])', ': \1', 'g')
    from antes a where a.id = f.id
  returning f.id, 'funcoes.descricao' as onde, a.velho, f.descricao as novo
) select * from mudou;

with antes as (
  select id, descricao_familia as velho from funcoes where descricao_familia ~ '\. [[:lower:]]'
), mudou as (
  update funcoes f
     set descricao_familia = regexp_replace(f.descricao_familia, '\. ([[:lower:]])', ': \1', 'g')
    from antes a where a.id = f.id
  returning f.id, 'funcoes.descricao_familia' as onde, a.velho, f.descricao_familia as novo
) select * from mudou;

/* =============================================================================
   CONFERÊNCIA: o texto, não o caractere.

     select texto, ajuda from perguntas where ajuda is not null order by ordem;

     -- e a assinatura do estrago, que precisa ser zero:
     select count(*) from perguntas where ajuda ~ '\. [[:lower:]]' or texto ~ '\. [[:lower:]]';

   ROLLBACK
     Não há. O estado anterior é gramaticalmente errado; voltar não é uma
     opção que alguém queira.
   ============================================================================= */
