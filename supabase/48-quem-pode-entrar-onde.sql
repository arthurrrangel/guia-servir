/* =============================================================================
   48 · QUEM PODE ENTRAR ONDE
   18/09/2026.

   Supabase → SQL Editor → colar tudo → Run. Idempotente. Depende da 47.

   ---------------------------------------------------------------------------
   POR QUE ESTA MIGRAÇÃO EXISTE

   Em 22/08 ficou registrado que o sistema não teria campo de sexo, porque
   "sexo é só um dos motivos de poder ou não" e a habilidade já diria isso.
   A liderança do Connect mostrou o furo, em 18/09:

     "Uma pessoa somente no setor de cozinha/banheiro/gabinete é inviável.
      Tendo em vista que mulher não pode acessar banheiro masculino e nem sala
      dos pastores para colocação de água, café e limpeza."

   Isso não é saber fazer, é poder entrar. E a diferença aparece exatamente
   onde o sistema decide sozinho: habilidade é por pessoa e depende de alguém
   marcar uma a uma, para sempre, inclusive para quem se cadastrar amanhã pelo
   link público. A regra do prédio vale para todo mundo de uma vez.

   A prova do custo veio na mesma manhã: a migração 47 dividiu o posto em três
   e copiou as 21 habilidades do posto antigo para as vagas novas. Naquele
   instante o sorteio passou a poder pôr uma mulher no banheiro masculino.

   O QUE ESTA MIGRAÇÃO FAZ

   1. `voluntarios.sexo` ('M' / 'F' / nulo = ninguém informou).
   2. `funcoes.exige_sexo` ('M' / 'F' / nulo = qualquer pessoa).
   3. Um gatilho que recusa escalação de quem não pode entrar, com a mesma
      frase que a tela mostra.
   4. `salvar_funcoes` passa a gravar a exigência.
   5. O Connect fica com as TRÊS vagas que a liderança pediu, agrupadas por
      quem pode entrar onde:

        GABINETE E BANHEIRO MASCULINO   exige homem   (os dois lugares que ela
                                                       citou juntos)
        BANHEIRO FEMININO               exige mulher
        COZINHA                         qualquer pessoa

   Continuam sendo 3 vagas. O que muda é que agora o sistema sabe a regra, em
   vez de depender de alguém lembrar dela toda vez.

   O QUE ESTA MIGRAÇÃO **NÃO** FAZ

   Não preenche o sexo de ninguém. Chutar pelo primeiro nome escreveria
   suposição como se fosse cadastro. Enquanto ninguém informar, essas pessoas
   ficam de fora dos dois postos com exigência, e a tela do time diz quem
   falta. Também não mexe em ESTACIONAMENTO: a documentação diz que é dos
   homens, mas há escala montada, e isso passa a ser um toque em
   Ajustes → Funções, com a liderança decidindo.
   ============================================================================= */

-- 1 ------------------------------------------------------------- colunas ---
alter table voluntarios add column if not exists sexo text;
alter table funcoes     add column if not exists exige_sexo text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'voluntarios_sexo_ck') then
    alter table voluntarios add constraint voluntarios_sexo_ck check (sexo in ('M','F'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'funcoes_exige_sexo_ck') then
    alter table funcoes add constraint funcoes_exige_sexo_ck check (exige_sexo in ('M','F'));
  end if;
end $$;

comment on column voluntarios.sexo is
  'M ou F. Nulo = ninguem informou ainda, e nao entra em posto com exige_sexo.';
comment on column funcoes.exige_sexo is
  'regra do predio, nao da pessoa: so este sexo entra na vaga. Nulo = qualquer um.';

-- 2 ------------------------------------------------------------- gatilho ---
/* O guarda do INSERT é o mesmo da migração 46, e pelo mesmo motivo: quem já
   está na vaga não pode travar o dia inteiro. Se a regra for criada depois de
   a escala estar montada, o líder precisa conseguir abrir o domingo e trocar
   a pessoa; travar na hora de salvar deixaria ele sem saída, que foi
   exatamente o que aconteceu com o João Victor em 20/09. */
create or replace function fn_sexo_do_posto() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare v_exige text; v_sexo text; v_nome text; v_funcao text;
begin
  if new.voluntario_id is null then return new; end if;

  if tg_op = 'UPDATE'
     and new.voluntario_id is not distinct from old.voluntario_id
     and new.funcao_id     is not distinct from old.funcao_id then
    return new;
  end if;

  if tg_op = 'INSERT' and exists (
       select 1 from escalacoes e
        where e.culto_id = new.culto_id
          and e.funcao_id = new.funcao_id
          and e.voluntario_id = new.voluntario_id) then
    return new;
  end if;

  select exige_sexo, nome into v_exige, v_funcao from funcoes where id = new.funcao_id;
  if v_exige is null then return new; end if;

  select sexo, nome into v_sexo, v_nome from voluntarios where id = new.voluntario_id;
  if v_sexo is distinct from v_exige then
    if v_sexo is null then
      raise exception 'Falta dizer se % e homem ou mulher, e % e um posto de %.',
        v_nome, v_funcao, case v_exige when 'M' then 'homens' else 'mulheres' end;
    else
      raise exception '% e um posto de %.',
        v_funcao, case v_exige when 'M' then 'homens' else 'mulheres' end;
    end if;
  end if;
  return new;
end $fn$;

drop trigger if exists tg_sexo_posto on escalacoes;
create trigger tg_sexo_posto before insert or update on escalacoes
  for each row execute function fn_sexo_do_posto();

-- 3 --------------------------------------------------- salvar_funcoes ------
/* mesma função da migração 32, com a exigência junto. O resto do corpo é
   igual: quem mexer aqui confira contra a 32 antes. */
create or replace function salvar_funcoes(p_equipe uuid, p_funcoes jsonb)
returns jsonb
language plpgsql security invoker set search_path = public as $fn$
declare r record; v_vistos uuid[] := '{}'; v_id uuid;
begin
  for r in
    select (x ->> 'id')::uuid                            as id,
           btrim(coalesce(x ->> 'nome',''))              as nome,
           coalesce((x ->> 'simultanea')::boolean,false)  as simultanea,
           coalesce((x ->> 'ordem')::int, 0)             as ordem,
           coalesce((x ->> 'ativa')::boolean,true)       as ativa,
           nullif(x ->> 'exige_sexo','')                 as exige_sexo
      from jsonb_array_elements(coalesce(p_funcoes,'[]'::jsonb)) x
  loop
    if r.nome = '' then
      raise exception 'funcao sem nome';
    end if;
    if r.exige_sexo is not null and r.exige_sexo not in ('M','F') then
      raise exception 'exige_sexo invalido';
    end if;

    if r.id is not null then
      if not exists (select 1 from funcoes where id = r.id and equipe_id = p_equipe) then
        raise exception 'funcao de outro ministerio';
      end if;
      update funcoes set nome = r.nome, simultanea = r.simultanea,
                         ordem = r.ordem, ativa = r.ativa, exige_sexo = r.exige_sexo
       where id = r.id;
      v_id := r.id;
    else
      insert into funcoes (equipe_id, nome, simultanea, ordem, ativa, exige_sexo)
           values (p_equipe, r.nome, r.simultanea, r.ordem, r.ativa, r.exige_sexo)
        returning id into v_id;
    end if;
    v_vistos := v_vistos || v_id;
  end loop;

  return jsonb_build_object('ok', true, 'salvas', coalesce(array_length(v_vistos,1),0));
end $fn$;

revoke all on function salvar_funcoes(uuid, jsonb) from public, anon;
grant execute on function salvar_funcoes(uuid, jsonb) to authenticated;

-- 4 ------------------------------------------------- o Connect, 3 vagas ---
do $$
declare v_eq uuid;
begin
  select id into v_eq from equipes where slug = 'servico';
  if v_eq is null then raise exception 'equipe servico (Connect) nao encontrada'; end if;

  /* GABINETE (criado hoje pela 47) recebe junto o banheiro masculino: são os
     dois lugares que a liderança citou na mesma frase, e quem faz um faz o
     outro. Renomear mantém id, escalações e habilidades. */
  update funcoes set nome = 'GABINETE E BANHEIRO MASCULINO', exige_sexo = 'M',
         descricao = 'Cuida do gabinete dos pastores (leva o cafe e a agua, deixa tudo pronto) e do banheiro masculino, conferindo limpeza e falta de material. Defeito encontrado vai para o lider do dia anotar no relatorio.'
   where equipe_id = v_eq and nome = 'GABINETE';

  update funcoes set nome = 'BANHEIRO FEMININO', exige_sexo = 'F',
         descricao = 'Confere o banheiro feminino antes e durante o culto: limpeza e falta de material. Defeito encontrado vai para o lider do dia anotar no relatorio.'
   where equipe_id = v_eq and nome = 'BANHEIROS';

  /* COZINHA continua sem exigência: qualquer pessoa entra. */
  update funcoes set exige_sexo = null
   where equipe_id = v_eq and nome = 'COZINHA';
end $$;

/* =============================================================================
   CONFERÊNCIA (o SQL Editor mostra o resultado da última consulta)

   Esperado, três linhas do Connect em sequência:
     GABINETE E BANHEIRO MASCULINO  exige M
     BANHEIRO FEMININO              exige F
     COZINHA                        exige (vazio)

   `podem` vai vir 0 nas duas primeiras enquanto ninguem tiver sexo informado.
   Isso é o certo: a vaga fica visivelmente vazia em vez de ser preenchida por
   chute. A tela do time lista quem falta informar.
   ============================================================================= */
select f.ordem, f.nome, coalesce(f.exige_sexo,'(qualquer)') as exige,
       (select count(*) from habilidades h where h.funcao_id = f.id) as habilitados,
       (select count(*) from habilidades h join voluntarios v on v.id = h.voluntario_id
         where h.funcao_id = f.id and v.ativo
           and (f.exige_sexo is null or v.sexo = f.exige_sexo)) as podem
  from funcoes f join equipes e on e.id = f.equipe_id
 where e.slug = 'servico' and f.ativa
 order by f.ordem;

/* ROLLBACK
     drop trigger if exists tg_sexo_posto on escalacoes;
     drop function if exists fn_sexo_do_posto();
     update funcoes set exige_sexo = null;
     -- os nomes voltam com:
     --   'GABINETE E BANHEIRO MASCULINO' -> 'GABINETE'
     --   'BANHEIRO FEMININO'             -> 'BANHEIROS'
     -- as colunas podem ficar: nulas, nao mudam comportamento nenhum.
     -- salvar_funcoes: rodar o bloco da migracao 32.
   ============================================================================= */
