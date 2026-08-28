-- ===================== SERVIÇO DO CULTO DE DOMINGO (novo ministério) =======
-- Time separado da Mídia: outras pessoas, outras funções, outra escala. O que
-- compartilha é só o calendário de cultos, que é o mesmo domingo para todo
-- mundo, e as telas do app.
--
-- POR QUE POSTOS NUMERADOS E NÃO "QUANTIDADE"
-- A tabela escalacoes tem `unique (culto_id, funcao_id)`: uma pessoa por
-- função por culto. Dupla, casal e "4 no templo" não cabem nisso. Dava para
-- criar funcoes.vagas e trocar a chave única para (culto_id, funcao_id,
-- posicao), mas isso reescreve o motor, o salvar_dia e todas as telas, incluindo
-- as da Mídia que estão rodando com a escala do mês montada. Postos numerados
-- entregam a mesma escala hoje, sem risco. LÍDER 1 e LÍDER 2 são duas linhas.
--
-- POR QUE O CASAL É UM VOLUNTÁRIO SÓ
-- O gabinete é de casal e as tarefas se dividem por sexo. Duas vagas (ele/ela)
-- garantiriam um homem e uma mulher, mas nada impediria o sorteio de juntar a
-- esposa de um com o marido de outra: é uma regra ENTRE duas vagas, e o motor
-- só sabe julgar uma vaga por vez. Cadastrando "Fulano e Fulana" como um
-- voluntário, a vaga é uma só e é impossível dar errado.
--
-- POR QUE NÃO EXISTE CAMPO DE SEXO
-- Estacionamento é dos homens. Isso já é expressável: só quem tem a habilidade
-- entra no sorteio daquele posto. "Quem pode fazer" é a pergunta que o sistema
-- já responde, e sexo é só um dos motivos de poder ou não.

do $$
declare v_eq uuid;
begin
  insert into equipes (nome, slug, ordem)
       values ('Serviço do Culto', 'servico', 2)
  on conflict (slug) do update set nome = excluded.nome
  returning id into v_eq;

  if v_eq is null then select id into v_eq from equipes where slug = 'servico'; end if;

  -- ---------------------------------------------------------------- postos --
  -- Todos SIMULTÂNEOS (acontecem durante o culto), então o gatilho de conflito
  -- já impede a mesma pessoa em dois postos no mesmo domingo.
  -- Todos SÓ DOMINGO: este ministério não serve no Follow de sábado.
  insert into funcoes (equipe_id, nome, simultanea, ordem, ativa, tipos) values
    (v_eq, 'LÍDER 1',                        true,  1, true, array['domingo']),
    (v_eq, 'LÍDER 2',                        true,  2, true, array['domingo']),
    (v_eq, 'ESTACIONAMENTO 1',               true,  3, true, array['domingo']),
    (v_eq, 'ESTACIONAMENTO 2',               true,  4, true, array['domingo']),
    (v_eq, 'ESTACIONAMENTO 3',               true,  5, true, array['domingo']),
    (v_eq, 'RECEPÇÃO 1',                     true,  6, true, array['domingo']),
    (v_eq, 'RECEPÇÃO 2',                     true,  7, true, array['domingo']),
    (v_eq, 'GABINETE, COZINHA E BANHEIROS',  true,  8, true, array['domingo']),
    (v_eq, 'SETOR A',                        true,  9, true, array['domingo']),
    (v_eq, 'SETOR B',                        true, 10, true, array['domingo']),
    (v_eq, 'SETOR C',                        true, 11, true, array['domingo']),
    (v_eq, 'SETOR D',                        true, 12, true, array['domingo'])
  on conflict (equipe_id, nome) do nothing;

  -- ---------------------------------------------------------------- config --
  -- 12 postos por domingo, ~4,3 domingos por mês = ~52 posições. Com teto 3,
  -- o time precisa de no mínimo 18 pessoas para fechar o mês. Teto, não meta:
  -- o sorteio continua distribuindo para quem serviu menos.
  /* um gatilho em `equipes` já cria a linha de config vazia no INSERT, então
     "insert ... on conflict do nothing" não escrevia nada e o ministério
     nascia sem teto, sem saudação e sem rodapé. Tem que ser upsert de verdade. */
  insert into config (equipe_id, dados) values (v_eq, '{}'::jsonb)
  on conflict (equipe_id) do nothing;
  update config set dados = dados || jsonb_build_object(
    'limitePadrao', 3, 'janelaCarga', 90, 'plantaoQtd', 1,
    'prazoConfirmacao', 'quinta-feira',
    'saudacao', 'Bom dia, time do Serviço',
    'rodape', 'Confirma no seu link pessoal até {PRAZO}. Quem não puder, avisa agora e já indica quem cobre.'
  ) where equipe_id = v_eq;
end $$;

-- ============================ RELATÓRIO DO LÍDER DO DIA ====================
-- "Preencher o relatório no final do culto informando como foi o andamento do
-- trabalho." Quem preenche é quem estava escalado como líder naquele domingo,
-- não o líder do app: por isso a função ganha uma marca, e o relatório é
-- gravado pelo TOKEN da pessoa, do celular dela, no fim do culto.

alter table funcoes add column if not exists relata boolean not null default false;
comment on column funcoes.relata is
  'quem está escalado nesta função preenche o relatório do dia no próprio link';

update funcoes set relata = true
 where nome in ('LÍDER 1', 'LÍDER 2')
   and equipe_id = (select id from equipes where slug = 'servico');

-- O relatório mora junto do recado do dia: mesma linha (culto, equipe), mesma
-- RLS, mesmo carregamento. Tabela nova aqui só criaria plumbing repetido.
alter table culto_obs add column if not exists relatorio    text;
alter table culto_obs add column if not exists problemas    text;
alter table culto_obs add column if not exists relatado_por uuid references voluntarios(id) on delete set null;
alter table culto_obs add column if not exists relatado_em  timestamptz;

comment on column culto_obs.relatorio is 'como foi o andamento do trabalho, escrito pelo líder escalado no dia';
comment on column culto_obs.problemas is 'defeitos encontrados: banheiro, bebedouro, estrutura';

----------------------------------------------------------------------------
-- o líder escalado grava pelo próprio link. Não precisa de conta no app.
create or replace function eu_relatorio(
  p_token text, p_culto_id uuid, p_texto text, p_problemas text
) returns void
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_eq uuid;
begin
  select v.id, v.equipe_id into v_id, v_eq
    from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;

  /* só quem estava REALMENTE escalado num posto de relato naquele domingo.
     Sem isso qualquer token válido escreveria o relatório de qualquer culto. */
  if not exists (
    select 1 from escalacoes e join funcoes f on f.id = e.funcao_id
     where e.culto_id = p_culto_id and e.voluntario_id = v_id and f.relata
  ) then raise exception 'Voce nao e o lider deste culto'; end if;

  insert into culto_obs (culto_id, equipe_id, obs, relatorio, problemas, relatado_por, relatado_em)
       values (p_culto_id, v_eq, '', nullif(btrim(coalesce(p_texto,'')), ''),
               nullif(btrim(coalesce(p_problemas,'')), ''), v_id, now())
  on conflict (culto_id, equipe_id) do update
     set relatorio = excluded.relatorio, problemas = excluded.problemas,
         relatado_por = excluded.relatado_por, relatado_em = excluded.relatado_em;
end $fn$;
revoke all on function eu_relatorio(text, uuid, text, text) from public;
grant execute on function eu_relatorio(text, uuid, text, text) to anon, authenticated;

----------------------------------------------------------------------------
-- eu_dados passa a dizer, por escalação: se aquele posto relata, e o que já
-- foi escrito. Sem isso a tela do voluntário não teria como mostrar o campo.
drop function if exists eu_dados(text);
create function eu_dados(p_token text)
 returns table(nome text, equipe text, escalas jsonb, indisponivel jsonb, disponivel jsonb)
 language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid; v_nome text; v_eq uuid; v_eqnome text;
begin
  select v.id, v.nome, v.equipe_id into v_id, v_nome, v_eq
    from voluntarios v where v.token = p_token and v.ativo;
  if v_id is null then raise exception 'Link invalido'; end if;
  select e.nome into v_eqnome from equipes e where e.id = v_eq;

  return query select v_nome, coalesce(v_eqnome,'Escala'),
    coalesce((select jsonb_agg(x order by x->>'data') from (
        select jsonb_build_object('culto_id',c.id,'data',c.data,'funcao',f.nome,'status',e.status,
                 'primeira_vez',e.primeira_vez,
                 'obs',(select o.obs from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'relata', f.relata,
                 'relatorio',(select o.relatorio from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'problemas',(select o.problemas from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'plantao',false) as x
          from escalacoes e join cultos c on c.id=e.culto_id join funcoes f on f.id=e.funcao_id
         where e.voluntario_id = v_id and c.data >= current_date - 1
        union all
        select jsonb_build_object('culto_id',c.id,'data',c.data,'funcao','PLANTAO','status','pendente',
                 'primeira_vez',false,
                 'obs',(select o.obs from culto_obs o where o.culto_id=c.id and o.equipe_id=v_eq),
                 'relata', false, 'relatorio', null, 'problemas', null,
                 'plantao',true)
          from plantoes p join cultos c on c.id=p.culto_id
         where p.voluntario_id = v_id and c.data >= current_date - 1) t), '[]'::jsonb),
    coalesce((select jsonb_agg(i.data order by i.data) from indisponibilidades i
               where i.voluntario_id = v_id and i.data >= current_date), '[]'::jsonb),
    coalesce((select jsonb_agg(d.data order by d.data) from disponibilidade d
               where d.voluntario_id = v_id and d.pode = true and d.data >= current_date), '[]'::jsonb);
end $function$;
revoke all on function eu_dados(text) from public;
grant execute on function eu_dados(text) to anon, authenticated;

----------------------------------------------------------------------------
-- equipe_funcoes já devolve tipos; passa a devolver relata também, para a tela
-- pública de cadastro poder explicar o posto.
drop function if exists equipe_funcoes(text);
create function equipe_funcoes(p_slug text)
returns table (nome text, ordem int, tipos text[], relata boolean)
language sql security definer set search_path = public as $$
  select f.nome, f.ordem, coalesce(f.tipos, array['domingo','follow']), f.relata
    from funcoes f join equipes e on e.id = f.equipe_id
   where e.slug = p_slug and f.ativa
   order by f.ordem, f.nome;
$$;
revoke all on function equipe_funcoes(text) from public;
grant execute on function equipe_funcoes(text) to anon, authenticated;

-- conferência
select e.nome as equipe, e.slug, count(f.*) as postos,
       count(*) filter (where f.relata) as postos_que_relatam,
       (select dados->>'limitePadrao' from config c where c.equipe_id = e.id) as teto
  from equipes e left join funcoes f on f.equipe_id = e.id and f.ativa
 group by e.id, e.nome, e.slug order by e.ordem;
