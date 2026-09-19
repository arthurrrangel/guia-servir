-- ================== LIMITE DE ESCALAS: UM BOTÃO SÓ, E QUE FUNCIONE ========
-- Sintoma: a escala de agosto não fechava de jeito nenhum. 19 pessoas ativas,
-- todas com limite_mes = 2, dá teto de 38 escalas no mês; o que restava de
-- agosto pedia 42 posições. Era impossível por aritmética, não por sorteio.
--
-- E o pior: o campo "Máximo de escalas por pessoa por mês" em Ajustes não
-- resolvia. O motor lê `v.limiteMes || config.limitePadrao`, e como TODA linha
-- de voluntario tinha 2 gravado, o padrão da equipe nunca era consultado. O
-- líder podia mexer no botão o dia inteiro sem efeito nenhum.
--
-- Correção: limite_mes passa a aceitar nulo, e nulo quer dizer "segue a
-- equipe". Assim existe um botão só, e ele manda de verdade. O limite por
-- pessoa continua existindo para o caso real de dar um teto diferente a
-- alguém específico.

-- 1) teto da equipe: 4. É TETO, não meta. O sorteio continua escolhendo quem
--    serviu menos, então ninguém chega em 4 sem necessidade.
update config set dados = jsonb_set(dados, '{limitePadrao}', '4'::jsonb);

-- 2) o campo por pessoa vira opcional
alter table voluntarios alter column limite_mes drop default;
alter table voluntarios alter column limite_mes drop not null;
update voluntarios set limite_mes = null;

comment on column voluntarios.limite_mes is
  'null = segue config.limitePadrao da equipe. Só preencha para dar um teto diferente a UMA pessoa.';

-- conferência
-- 19/09/2026: era `(select dados->>'limitePadrao' from config)`, sem dizer de
-- QUAL ministério. Com um só, funcionava; com vários, o Postgres recusa a
-- subconsulta por devolver mais de uma linha — e, pior, quando devolvia uma,
-- devolvia a de um ministério qualquer com o rótulo "padrao_da_equipe".
select (select e.nome from equipes e
         order by e.ordem, e.criado_em limit 1) as ministerio,
       (select c.dados->>'limitePadrao' from config c
          join equipes e on e.id = c.equipe_id
         order by e.ordem, e.criado_em limit 1) as padrao_da_equipe,
       (select count(*) from voluntarios where limite_mes is not null) as com_teto_proprio,
       (select count(*) from voluntarios where ativo) as ativos;
