/* =============================================================================
   17 — GUIA MUSIC (Louvor): equipe, funções, time e horários

   DECISÕES, e o porquê de cada uma:

   1) ENSAIO NÃO É CULTO. Vira coluna do culto (`ensaio_em`), não linha nova.
      Motivo prático: a banda que ensaia é a mesma que toca, então o ensaio não
      é uma segunda escala — é o compromisso de quem já está escalado. Motivo
      técnico: `cultos.data` é UNIQUE e o Follow já ocupa os sábados; um ensaio
      no mesmo sábado do Follow seria recusado pelo banco.

   2) `UNIQUE(data)` FICA COMO ESTÁ. Relaxar para (data, tipo) parecia o certo,
      mas quebraria a Mídia em silêncio: `lib/ponte.ts` monta um Map data->id
      dos cultos, e `salvar_dia` faz `select id from cultos where data = p_data`.
      Com dois cultos na mesma data, um sobrescreve o outro e escalações somem
      da tela sem erro nenhum. Consequência aceita e registrada: um EVENTO
      (cantata, Natal) só cabe em data que ainda não tem culto. Arrumar de
      verdade é mexer em ponte.ts + salvar_dia + motor, não é migração.

   3) HORÁRIO DE CHEGADA É DA FUNÇÃO, NÃO DO CULTO. O roadie e o som chegam
      antes da banda, que chega antes do vocal. Um campo só no culto obrigaria
      todo mundo ao horário do mais adiantado.

   4) DIRETORIA FORA DA ESCALA. Líder, vice, secretária e os coordenadores são
      cargo de gestão, não posto de domingo. Misturar os dois é o que gerou a
      confusão entre "líder do app" e "LÍDER do culto" na semana passada.

   5) BAIXO, GUITARRA, ROADIE E SOM NASCEM COM BURACO — de propósito. O time
      tem 1 guitarrista, 1 baixista (que também dirige) e nenhum roadie. Criar
      as funções mesmo assim faz o vazio aparecer na tela toda semana, em vez
      de a escala parecer completa porque a vaga não existe.
   ============================================================================= */

-- ------------------------------------------------------------- horários --
alter table cultos  add column if not exists inicio    time;
alter table cultos  add column if not exists fim       time;
alter table cultos  add column if not exists ensaio_em timestamptz;
alter table funcoes add column if not exists chegada   time;

comment on column cultos.inicio    is 'hora de início da programação';
comment on column cultos.fim       is 'hora prevista de término';
comment on column cultos.ensaio_em is 'quando a banda ensaia PARA este culto. Não é outro culto: é o compromisso de quem já está escalado aqui.';
comment on column funcoes.chegada  is 'horário de chegada deste posto. O roadie chega antes da banda, que chega antes do vocal.';

-- --------------------------------------------------------------- equipe --
insert into equipes (nome, slug, ordem)
select 'Louvor', 'louvor', 3
 where not exists (select 1 from equipes where slug = 'louvor');

-- ------------------------------------------------------------- funções --
do $$
declare v_eq uuid;
begin
  select id into v_eq from equipes where slug = 'louvor';

  insert into funcoes (equipe_id, nome, ordem, simultanea, tipos, chegada, descricao)
  select v_eq, d.nome, d.ordem, true, d.tipos, d.chegada, d.descricao
    from (values
      ('DIRIGENTE', 1, array['domingo','follow','evento'], time '08:30',
       'O lead, o condutor do louvor. Dá a direção e a dinâmica, entende o ambiente espiritual para estabelecer a dinâmica necessária durante o Louvor.'),
      ('VOCAL 1', 2, array['domingo','follow','evento'], time '08:45',
       'Dá suporte à voz do dirigente, preenchendo as músicas com divisão de vozes. Se o dirigente precisar, o vocal faz a ponta das melodias.'),
      ('VOCAL 2', 3, array['domingo','follow','evento'], time '08:45', null),
      ('VOCAL 3', 4, array['domingo','follow','evento'], time '08:45', null),
      ('GUITARRA', 5, array['domingo','follow','evento'], time '08:30',
       'Trabalha as linhas de bases harmônicas e os solos.'),
      ('VIOLÃO', 6, array['domingo','follow','evento'], time '08:30',
       'É um condutor harmônico e rítmico, dando direção precisa para a banda.'),
      ('CONTRABAIXO', 7, array['domingo','follow','evento'], time '08:30',
       'Faz o elo entre a harmonia e a percussão, trazendo comunicação entre essas duas vertentes na banda.'),
      ('BATERIA', 8, array['domingo','follow','evento'], time '08:30',
       'O principal condutor rítmico da banda: dá a cadência e o andamento das músicas.'),
      ('TECLADO', 9, array['domingo','follow','evento'], time '08:30',
       'Trabalha as linhas harmônicas e os efeitos necessários, com uma pluralidade de timbres a explorar durante o louvor.'),
      ('ROADIE', 10, array['domingo','follow','evento'], time '08:00',
       'Assistente de palco. Dá suporte a quem está servindo: corrige falhas em equipamentos e cabos, arruma o palco, fala com a mídia e com o operador de som, e faz a ponte com os outros setores do culto. Serve sempre perto do palco.'),
      ('SOM', 11, array['domingo','follow','evento'], time '08:00',
       'Opera o som do culto. Responde pela operação, manutenção e ambientação do sistema, em comunicação direta com o dirigente e com o roadie.')
    ) as d(nome, ordem, tipos, chegada, descricao)
   where not exists (select 1 from funcoes f where f.equipe_id = v_eq and f.nome = d.nome);

  update funcoes set descricao_familia =
    'Dá suporte à voz do dirigente, preenchendo as músicas com divisão de vozes. Se o dirigente precisar, o vocal faz a ponta das melodias.'
   where equipe_id = v_eq and nome like 'VOCAL%';
  update funcoes set descricao = null where equipe_id = v_eq and nome = 'VOCAL 1';

  /* O padrão do time é 2 ou 3 vocais, e quem decide é o líder ou o vice.
     O sistema não tem vaga opcional por culto: uma função ativa vira vaga em
     TODO culto daquele tipo. Então VOCAL 3 nasce DESLIGADA — o padrão vira 2 —
     e o Jander liga em Ajustes quando o time passar a cantar em 3.
     Deixá-la ligada e vazia seria pior: um buraco falso toda semana ensina o
     time a ignorar buraco, que é o oposto do que a tela existe para fazer. */
  update funcoes set ativa = false where equipe_id = v_eq and nome = 'VOCAL 3';
end $$;

-- ------------------------------------------------------- teto do mês ----
/* 8 eventos por mês (4 domingos + 4 Follows) x 10 postos ativos = 80 vagas, para 14
   pessoas: 5,7 escalas por pessoa. Qualquer teto abaixo de 6 garante buraco na
   tela. 6 não é confortável — é o mínimo aritmético. O caminho real é entrar
   gente ou o Louvor não cobrir todos os eventos. */
update config set dados = jsonb_set(coalesce(dados,'{}'::jsonb), '{limitePadrao}', '6')
 where equipe_id = (select id from equipes where slug = 'louvor');

-- ------------------------------------------------------------ o time ----
/* Só quem preencheu o formulário: sem telefone a pessoa não cria PIN (a
   confirmação é pelos 4 últimos dígitos do WhatsApp).
   FORA por falta de contato: Caio Baldez (bateria) e Ernande (guitarra) — e o
   Ernande é o ÚNICO guitarrista do time.
   Julia Baldez e Filipe Oliveira Bernardo entram com o MESMO telefone que já
   têm na Mídia: é isso que liga o gatilho que impede os dois de serem escalados
   nos dois ministérios no mesmo domingo. */
do $$
declare v_eq uuid;
begin
  select id into v_eq from equipes where slug = 'louvor';

  insert into voluntarios (equipe_id, nome, telefone, email, conferido)
  select v_eq, d.nome, d.tel, d.email, false
    from (values
      ('Jander Rafael',            '21966664415', 'jander.jpcris@gmail.com'),
      ('Carlos Henrique da Costa Ferreira', '21983032308', 'henriquechinfo.treinador@gmail.com'),
      ('Bianca Caffaro',           '21980676189', 'bia.acaffaro@hotmail.com'),
      ('João Vitor Lima de Sousa', '21964994409', 'joaovitorlimadesousa0@gmail.com'),
      ('Julia Baldez Bomfim Rodrigues', '21975709201', 'juliabomfim231@gmail.com'),
      ('Wellington Santana da Silva',   '21972083403', 'wellsan35@gmail.com'),
      ('Susanne Rangel',           '21997168240', 'susudarebs@gmail.com'),
      ('João Paulo Frazão',        '21971790471', 'joao.frazao30@gmail.com'),
      ('Filipe Oliveira Bernardo', '21977139781', 'bernardofilipe097@gmail.com'),
      ('Ruan Duarte Jales Anselmo','21986624095', 'ruanduarte.152@gmail.com'),
      ('Alexandre Lima',           '21997659788', 'alexandrelimajunior13@gmail.com'),
      ('Felipe Souza da Silva',    '21984346062', 'foxsilva90@gmail.com')
    ) as d(nome, tel, email)
   where not exists (select 1 from voluntarios v where v.equipe_id = v_eq and v.nome = d.nome);
end $$;

-- -------------------------------------------------------- habilidades ---
/* `confirmado = false`: eles declararam num formulário, o Jander ainda não
   conferiu ninguém tocando. Entra na fila de conferência dele. */
do $$
declare v_eq uuid;
begin
  select id into v_eq from equipes where slug = 'louvor';

  insert into habilidades (voluntario_id, funcao_id, nivel, confirmado)
  select v.id, f.id, 'titular'::nivel_habilidade, false
    from (values
      ('Jander Rafael', 'DIRIGENTE'),
      ('Carlos Henrique da Costa Ferreira', 'DIRIGENTE'),
      ('Carlos Henrique da Costa Ferreira', 'VIOLÃO'),
      ('Carlos Henrique da Costa Ferreira', 'CONTRABAIXO'),
      ('Bianca Caffaro', 'VOCAL 1'), ('Bianca Caffaro', 'VOCAL 2'), ('Bianca Caffaro', 'VOCAL 3'),
      ('João Vitor Lima de Sousa', 'VOCAL 1'), ('João Vitor Lima de Sousa', 'VOCAL 2'), ('João Vitor Lima de Sousa', 'VOCAL 3'),
      ('Julia Baldez Bomfim Rodrigues', 'VOCAL 1'), ('Julia Baldez Bomfim Rodrigues', 'VOCAL 2'), ('Julia Baldez Bomfim Rodrigues', 'VOCAL 3'),
      ('Wellington Santana da Silva', 'VOCAL 1'), ('Wellington Santana da Silva', 'VOCAL 2'), ('Wellington Santana da Silva', 'VOCAL 3'),
      ('Susanne Rangel', 'VOCAL 1'), ('Susanne Rangel', 'VOCAL 2'), ('Susanne Rangel', 'VOCAL 3'),
      ('João Paulo Frazão', 'BATERIA'),
      ('Filipe Oliveira Bernardo', 'BATERIA'),
      ('Ruan Duarte Jales Anselmo', 'TECLADO'),
      ('Alexandre Lima', 'TECLADO'),
      ('Felipe Souza da Silva', 'VIOLÃO')
    ) as d(pessoa, funcao)
    join voluntarios v on v.equipe_id = v_eq and v.nome = d.pessoa
    join funcoes f     on f.equipe_id = v_eq and f.nome = d.funcao
   where not exists (select 1 from habilidades h where h.voluntario_id = v.id and h.funcao_id = f.id);
end $$;

-- ------------------------------------------- o Jander abre só o Louvor --
insert into lideres (email, equipe_id)
select 'jander.jpcris@gmail.com', (select id from equipes where slug='louvor')
 where not exists (select 1 from lideres where email = 'jander.jpcris@gmail.com');

----------------------------------------------------------------------------
-- CONFERÊNCIA: cobertura por posto. Quem tem 0 ou 1 é ponto único de falha.
select f.nome as posto,
       count(h.voluntario_id) as gente_apta,
       coalesce(string_agg(split_part(v.nome,' ',1), ', ' order by v.nome), '— NINGUÉM —') as quem
  from funcoes f
  left join habilidades h on h.funcao_id = f.id
  left join voluntarios v on v.id = h.voluntario_id and v.ativo
 where f.equipe_id = (select id from equipes where slug='louvor') and f.ativa
 group by f.nome, f.ordem order by f.ordem;
