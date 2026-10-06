/* =============================================================================
   112 · O SOM DA TRANSMISSÃO VIRA POSTO DA MÍDIA

   06/10/2026. Só de Escalas.

   O Arthur: "precisa adicionar o operador de som transmissão", "na escala da
   mídia". O som da live sai do computador da transmissão (a mesa no Logic,
   depois o OBS): é trabalho de alguém o culto inteiro, e não tinha posto.

   MEDIDO EM PRODUÇÃO em 06/10/2026, antes desta migração (lista pública
   `equipe_funcoes('midia')`):

       1 PROJEÇÃO · 2 ILUMINAÇÃO · 3 EDIÇÃO · 4 FOTO · 5 FILMAGEM · 6 HEAD ·
       7 TRANSMISSÃO (CORTE + PTZ) · 8 CÂMERA 1 · 9 CÂMERA 2 · 10 FILMAGEM 2

   Nenhum posto de som. Todos valem no domingo e no Follow (99).

   O QUE MUDA
     1 · posto novo TRANSMISSÃO (SOM), logo depois de TRANSMISSÃO (CORTE +
         PTZ): os dois da transmissão ficam juntos na escala e na mensagem.
         Os postos de depois descem uma casa na ordem, sem trocar entre si.
         O resto copia o corte: acontece durante o culto (simultâneo), vale
         nos mesmos cultos e chega na mesma hora.
     2 · o posto entra no grupo do WhatsApp que já recebe o corte
         (Multimídia · Transmissão): sem isso, a parte dele só sairia no
         Multimídia · Geral.
     3 · ninguém fica habilitado no posto: quem sabe mixar a live é o líder
         que marca, em Equipe. Até lá o posto aparece vazio na escala.

   O nome segue o do corte ("TRANSMISSÃO (...)"), e não "OPERADOR DE SOM":
   nenhum posto da Mídia leva "operador", e "SOM" sozinho confundiria com o
   som da sala, que não é da transmissão. O líder renomeia em Postos sem
   perder nada: escalação, habilidade e grupo apontam para o id.

   RODAR DE NOVO NÃO FAZ NADA: o posto é achado pelo nome e não é recriado,
   a ordem não desce outra vez, o grupo não ganha o posto duas vezes.

   A CONFERÊNCIA, no fim, dentro da transação: um posto só, na casa certa;
   a ordem dos outros igual à de antes; nenhum empate novo; todo grupo do
   corte com o posto; ninguém habilitado nem escalado no posto; e a lista
   pública mostrando o posto com a descrição.

   O EDITOR DO SUPABASE NÃO MOSTRA NOTICE: a última linha é um select com o
   resultado, para quem roda ver o que aconteceu.

   ORDEM:  ... 110 → 111 → 112
   ============================================================================= */

do $tranca$ begin
  if to_regprocedure('public.exige_versao_ate(int)') is not null then
    perform public.exige_versao_ate(112);
  end if;
  if to_regclass('public.schema_versao') is not null
     and not exists (select 1 from public.schema_versao where n = 111) then
    raise exception 'FALTA A 111: rode antes a 111 (supabase/111-compasso-segundos-letra-e-o-dirigente-do-louvor.sql). Nada foi mudado.';
  end if;
end $tranca$;

begin;

-- =========================================================================
-- 0 · a foto de antes, para a conferência comparar
-- =========================================================================
create temp table m112_antes on commit drop as
  select f.id, f.nome, f.ordem, f.ativa
    from funcoes f join equipes e on e.id = f.equipe_id
   where e.slug = 'midia';

-- =========================================================================
-- 1 e 2 · o posto, a ordem e o grupo do WhatsApp
-- =========================================================================
do $posto$
declare
  v_eq     uuid;
  v_corte  funcoes%rowtype;
  v_novo   uuid;
  v_criado boolean := false;
  v_desceu int := 0;
  v_grupos jsonb;
  v_entrou int := 0;
begin
  select id into v_eq from equipes where slug = 'midia';
  if v_eq is null then
    raise exception '112: nao achei o ministerio da Midia (equipes.slug = midia). Nada foi mudado.';
  end if;

  select * into v_corte from funcoes
   where equipe_id = v_eq and nome = 'TRANSMISSÃO (CORTE + PTZ)';
  if v_corte.id is null then
    raise exception '112: nao achei o posto TRANSMISSÃO (CORTE + PTZ) na Midia. Nada foi mudado.';
  end if;

  select id into v_novo from funcoes
   where equipe_id = v_eq and nome = 'TRANSMISSÃO (SOM)';

  if v_novo is null then
    update funcoes set ordem = ordem + 1
     where equipe_id = v_eq and ordem > v_corte.ordem;
    get diagnostics v_desceu = row_count;

    insert into funcoes (equipe_id, nome, simultanea, ordem, ativa, tipos, chegada, relata, descricao)
    values (v_eq, 'TRANSMISSÃO (SOM)', true, v_corte.ordem + 1, true,
            v_corte.tipos, v_corte.chegada, false,
            'Mixa o som que vai para a live: faz a passagem de som sem transmitir e acompanha banda, vozes e pregação até o fim. É quem decide o que quem assiste de casa ouve.')
    returning id into v_novo;
    v_criado := true;
  end if;

  /* o grupo guarda a chave que a tela de Ajustes grava: o id do posto
     (`f.id || f.nome`, components/escalas/GruposPorArea.tsx). Grupo que
     conhece o corte pelo nome (gravado à mão) também ganha o som. */
  select jsonb_agg(
           case
             when jsonb_typeof(g -> 'funcoes') = 'array'
              and ((g -> 'funcoes') ? v_corte.id::text or (g -> 'funcoes') ? v_corte.nome)
              and not ((g -> 'funcoes') ? v_novo::text)
             then jsonb_set(g, '{funcoes}', (g -> 'funcoes') || to_jsonb(v_novo::text))
             else g
           end order by x.pos)
    into v_grupos
    from config c,
         jsonb_array_elements(case when jsonb_typeof(c.dados -> 'grupos') = 'array' then c.dados -> 'grupos' else '[]'::jsonb end) with ordinality as x(g, pos)
   where c.equipe_id = v_eq and jsonb_typeof(c.dados -> 'grupos') = 'array';

  if v_grupos is not null then
    select count(*) into v_entrou
      from jsonb_array_elements(v_grupos) n(g)
     where (g -> 'funcoes') ? v_novo::text;
    update config set dados = jsonb_set(dados, '{grupos}', v_grupos)
     where equipe_id = v_eq and dados -> 'grupos' is distinct from v_grupos;
  end if;

  raise notice '112 · posto %: % (% posto(s) desceram uma casa); grupos do WhatsApp com o som: %',
    case when v_criado then 'criado' else 'ja existia' end,
    v_novo, v_desceu, v_entrou;
end $posto$;

-- =========================================================================
-- CONFERÊNCIA, ainda dentro da transação. Reprovar desfaz tudo.
-- =========================================================================
do $conf$
declare
  falhas  text[] := '{}';
  v_eq    uuid;
  v_corte funcoes%rowtype;
  v_novo  funcoes%rowtype;
  v_n     int;
  v_antes text;
  v_agora text;
  v_seguinte text;
begin
  select id into v_eq from equipes where slug = 'midia';
  select * into v_corte from funcoes where equipe_id = v_eq and nome = 'TRANSMISSÃO (CORTE + PTZ)';
  select * into v_novo  from funcoes where equipe_id = v_eq and nome = 'TRANSMISSÃO (SOM)';

  select count(*) into v_n from funcoes where equipe_id = v_eq and nome = 'TRANSMISSÃO (SOM)';
  if v_n <> 1 then falhas := falhas || format('TRANSMISSÃO (SOM) aparece %s vez(es) na Midia', v_n); end if;

  if v_novo.id is not null then
    if not v_novo.ativa then falhas := falhas || 'o posto nasceu inativo'::text; end if;
    if not v_novo.simultanea then falhas := falhas || 'o posto nao e simultaneo'::text; end if;
    if v_novo.tipos is distinct from v_corte.tipos then
      falhas := falhas || format('tipos %s, o corte tem %s', v_novo.tipos, v_corte.tipos); end if;
    if v_novo.chegada is distinct from v_corte.chegada then
      falhas := falhas || 'chegada diferente da do corte'::text; end if;
    if v_novo.cronograma is not null then falhas := falhas || 'o posto ganhou area no cronograma'::text; end if;
    if coalesce(v_novo.descricao, '') = '' then falhas := falhas || 'posto sem descricao'::text; end if;

    /* o posto logo depois do corte, contando só os ativos */
    select nome into v_seguinte from funcoes
     where equipe_id = v_eq and ativa and (ordem, nome) > (v_corte.ordem, v_corte.nome)
     order by ordem, nome limit 1;
    if v_seguinte is distinct from 'TRANSMISSÃO (SOM)' then
      falhas := falhas || format('depois do corte vem %s', coalesce(v_seguinte, 'nada')); end if;
  end if;

  /* a ordem dos outros postos: a mesma sequência de antes */
  select string_agg(nome, ' · ' order by ordem, nome) into v_antes
    from m112_antes where nome <> 'TRANSMISSÃO (SOM)';
  select string_agg(nome, ' · ' order by ordem, nome) into v_agora
    from funcoes where equipe_id = v_eq and nome <> 'TRANSMISSÃO (SOM)';
  if v_antes is distinct from v_agora then
    falhas := falhas || format('a ordem dos outros postos mudou: antes %s, agora %s', v_antes, v_agora); end if;

  /* nenhum empate novo de ordem entre os ativos */
  if (select count(*) - count(distinct ordem) from funcoes where equipe_id = v_eq and ativa)
     > (select count(*) - count(distinct ordem) from m112_antes where ativa) then
    falhas := falhas || 'a ordem ganhou empate'::text; end if;

  /* todo grupo que leva o corte leva o som */
  select count(*) into v_n
    from config c, jsonb_array_elements(case when jsonb_typeof(c.dados -> 'grupos') = 'array' then c.dados -> 'grupos' else '[]'::jsonb end) x(g)
   where c.equipe_id = v_eq and jsonb_typeof(c.dados -> 'grupos') = 'array'
     and jsonb_typeof(g -> 'funcoes') = 'array'
     and ((g -> 'funcoes') ? v_corte.id::text or (g -> 'funcoes') ? v_corte.nome)
     and not ((g -> 'funcoes') ? v_novo.id::text);
  if v_n > 0 then falhas := falhas || format('%s grupo(s) do corte sem o som', v_n); end if;

  /* e nenhum grupo leva o som duas vezes */
  select count(*) into v_n
    from config c, jsonb_array_elements(case when jsonb_typeof(c.dados -> 'grupos') = 'array' then c.dados -> 'grupos' else '[]'::jsonb end) x(g)
   where c.equipe_id = v_eq and jsonb_typeof(c.dados -> 'grupos') = 'array'
     and jsonb_typeof(g -> 'funcoes') = 'array'
     and (select count(*) from jsonb_array_elements_text(g -> 'funcoes') k where k = v_novo.id::text) > 1;
  if v_n > 0 then falhas := falhas || format('%s grupo(s) com o som repetido', v_n); end if;

  /* ninguém habilitado nem escalado no posto que acabou de nascer */
  if exists (select 1 from habilidades where funcao_id = v_novo.id) then
    falhas := falhas || 'ja tem gente habilitada no posto'::text; end if;
  if exists (select 1 from escalacoes where funcao_id = v_novo.id) then
    falhas := falhas || 'ja tem escalacao no posto'::text; end if;

  /* a lista pública (porta de entrada e link da equipe) mostra o posto */
  if not exists (select 1 from equipe_funcoes('midia') p
                  where p.nome = 'TRANSMISSÃO (SOM)' and coalesce(p.descricao, '') <> '') then
    falhas := falhas || 'a lista publica da Midia nao mostra o posto'::text; end if;

  if array_length(falhas, 1) > 0 then
    raise exception E'112 REPROVOU:\n  - %', array_to_string(falhas, E'\n  - ');
  end if;
  raise notice 'OK 112 · conferencia: TRANSMISSÃO (SOM) logo depois do corte, ordem dos outros igual, grupo do corte com o som, ninguem habilitado.';
end $conf$;

insert into public.schema_versao (n, arquivo)
  values (112, '112-o-som-da-transmissao-vira-posto-da-midia.sql')
  on conflict (n) do nothing;

commit;

/* o que o editor mostra: a lista da Mídia e os grupos do som */
select '112' as versao,
       (select string_agg(f.ordem || ' ' || f.nome, ' · ' order by f.ordem, f.nome)
          from funcoes f join equipes e on e.id = f.equipe_id
         where e.slug = 'midia' and f.ativa) as postos_da_midia,
       (select string_agg(g ->> 'nome', ', ')
          from config c join equipes e on e.id = c.equipe_id,
               jsonb_array_elements(case when jsonb_typeof(c.dados -> 'grupos') = 'array'
                                         then c.dados -> 'grupos' else '[]'::jsonb end) x(g)
         where e.slug = 'midia'
           and (g -> 'funcoes') ? (select f.id::text from funcoes f join equipes e2 on e2.id = f.equipe_id
                                    where e2.slug = 'midia' and f.nome = 'TRANSMISSÃO (SOM)')) as grupos_com_o_som,
       (select count(*) from habilidades h join funcoes f on f.id = h.funcao_id join equipes e on e.id = f.equipe_id
         where e.slug = 'midia' and f.nome = 'TRANSMISSÃO (SOM)') as habilitados;
