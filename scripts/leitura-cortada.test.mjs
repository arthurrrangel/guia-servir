/* LISTA NO TETO NÃO É A LISTA, É "NÃO SEI" — 20/09/2026.

   Auditoria de backend. O PostgREST do Supabase corta a resposta no
   `max-rows` (1000 por padrão) e devolve 200, com menos linhas e SEM erro.
   Nenhuma consulta de `linhasDaEquipe` pedia contagem, então não havia como
   distinguir "a equipe tem 1000 escalações" de "vieram só as primeiras 1000".

   O que isso custa, simulado: 62 cultos por 20 postos = 1240 linhas, cortadas
   em 1000 sem erro. `montados` conta 0, `decisaoDoRobo` responde 'monta', e o
   laço do cron chama `salvar_dia`, que APAGA a escala da equipe no culto e
   regrava sorteada. O mês que o líder montou à mão some às 9h do dia 26, com
   HTTP 200 no log e um e-mail dizendo "montada".

   Este arquivo cobra que a leitura cortada vire ERRO, e que a leitura
   completa continue passando. Sem isso, toda decisão em cima da lista está
   sendo tomada sobre um pedaço dela. */
import { linhasDaEquipe, inteira } from '@/lib/ponte';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

/* 1) `inteira` sozinha: o contrato, nos três estados possíveis */
{
  const completa = inteira({ data: [1, 2, 3], count: 3 }, 'escalacoes');
  ok(!completa.error, 'leitura completa passa');

  const cortada = inteira({ data: [1, 2, 3], count: 1240 }, 'escalacoes');
  ok(cortada.error?.code === 'LEITURA_CORTADA', 'leitura cortada vira erro', JSON.stringify(cortada.error));
  ok(/3 de 1240/.test(cortada.error?.message || ''), 'e o erro diz quanto veio de quanto', cortada.error?.message);

  const semContagem = inteira({ data: [1, 2, 3] }, 'escalacoes');
  ok(!semContagem.error, 'sem contagem não inventa erro (consulta que não pediu count)');

  const jaRuim = inteira({ data: null, error: { code: '42501' } }, 'escalacoes');
  ok(jaRuim.error?.code === '42501', 'erro que já existia não é trocado pelo novo');
}

/* 2) e no caminho de verdade: `linhasDaEquipe` com o banco cortando. */
function fingeBanco({ corta = false } = {}) {
  const LINHAS = 1240, TETO = 1000;
  const tabela = (nome) => {
    let pediuCount = false;
    const eu = {
      select(_cols, opts) { pediuCount = opts?.count === 'exact'; return eu; },
      eq() { return eu; }, gte() { return eu; }, or() { return eu; },
      in() { return eu; }, order() { return eu; },
      maybeSingle() { return { data: null, error: null }; },
      then(res) { return Promise.resolve(resposta()).then(res); },
    };
    const resposta = () => {
      if (nome === 'funcoes') return { data: [{ id: 'f1', nome: 'PROJEÇÃO', equipe_id: 'e1', ativa: true, ordem: 1 }], error: null };
      if (nome === 'voluntarios') return { data: [{ id: 'v1', nome: 'Ana', ativo: true, equipe_id: 'e1' }], error: null };
      if (nome === 'cultos') return { data: [{ id: 'c1', data: '2026-10-04' }], error: null };
      if (nome === 'escalacoes') {
        const veio = corta ? TETO : LINHAS;
        const data = Array.from({ length: veio }, (_, i) => ({ id: `e${i}`, culto_id: 'c1', funcao_id: 'f1', voluntario_id: 'v1' }));
        return { data, error: null, ...(pediuCount ? { count: LINHAS } : {}) };
      }
      return { data: [], error: null, ...(pediuCount ? { count: 0 } : {}) };
    };
    return eu;
  };
  return { from: tabela };
}

{
  const r = await linhasDaEquipe(fingeBanco({ corta: false }), 'e1', '2026-01-01');
  ok((r.escalacoes || []).length === 1240, 'sem corte, a carga traz tudo', String((r.escalacoes || []).length));
}
{
  let subiu = null;
  try { await linhasDaEquipe(fingeBanco({ corta: true }), 'e1', '2026-01-01'); }
  catch (e) { subiu = e; }
  ok(subiu !== null, 'COM corte, a carga FALHA em vez de devolver o pedaço');
  ok(/cortada/i.test(String(subiu?.message || '')), 'e o motivo diz que veio cortada', String(subiu?.message).slice(0, 60));
}

/* 3) O CORTE DEIXOU DE SER PANE E VIROU RECUPERAÇÃO — 20/09/2026, reauditoria.

   Transformar corte silencioso em erro duro (item 2 acima) era metade da
   correção. A outra metade é não deixar o app morrer por causa disso.

   Os lotes foram dimensionados contando BYTES DE URL contra os 8192 do nginx.
   O `max-rows` do PostgREST é um teto DIFERENTE, de LINHAS, e um lote de
   `escalacoes` são até `funções × cultos` linhas. Medido: o Connect, com 18
   postos e 106 cultos na janela, chega a ~960 de 1000 — 96% do teto, hoje.
   No dia em que encher os 18 postos, ou a janela passar de 106 cultos, a tela
   e o robô passariam a lançar, sem recuperação.

   Agora o lote que volta cortado é partido ao meio e pedido de novo. O corte
   é OBSERVÁVEL (`count` diz quantas existem, `data.length` diz quantas
   vieram), então dá para reagir em vez de prever. */
{
  /* um banco que corta em 1000 linhas por resposta, como o PostgREST faz */
  const TETO = 1000;
  let pedidos = 0, maiorPedido = 0;
  function bancoQueCorta({ porId = 40, vols = 60 } = {}) {
    const ids = Array.from({ length: vols }, (_, i) => 'v' + i);
    const tabela = (nome) => {
      let pediuCount = false, filtro = null;
      const eu = {
        select(_c, o) { pediuCount = o?.count === 'exact'; return eu; },
        eq() { return eu; }, gte() { return eu; }, or() { return eu; }, order() { return eu; },
        in(_col, l) { if (!filtro) filtro = l; return eu; },
        maybeSingle() { return { data: null, error: null }; },
        then(res) { return Promise.resolve(resposta()).then(res); },
      };
      const resposta = () => {
        if (nome === 'funcoes') return { data: [{ id: 'f1', nome: 'P', equipe_id: 'e1', ativa: true, ordem: 1, simultanea: true, tipos: ['domingo'] }], error: null };
        if (nome === 'voluntarios') return { data: ids.map(id => ({ id, nome: id, ativo: true, equipe_id: 'e1', telefone: null, limite_mes: null, token: 't'+id, conferido: true })), error: null };
        if (nome === 'cultos') return { data: [{ id: 'c1', data: '2026-10-04' }], error: null };
        if (nome === 'habilidades') {
          pedidos++; maiorPedido = Math.max(maiorPedido, (filtro || []).length);
          const total = (filtro || []).length * porId;
          const veio = Math.min(total, TETO);
          const data = Array.from({ length: veio }, (_, i) => ({ voluntario_id: (filtro || [])[0], funcao_id: 'f' + i, nivel: 'titular', confirmado: true }));
          return { data, error: null, ...(pediuCount ? { count: total } : {}) };
        }
        return { data: [], error: null, ...(pediuCount ? { count: 0 } : {}) };
      };
      return eu;
    };
    return { from: tabela };
  }

  /* 60 voluntários × 40 habilidades = 2400 linhas, cortadas em 1000 por
     resposta. Um lote só não cabe; partido, cabe. */
  pedidos = 0; maiorPedido = 0;
  /* em try: sem a partição, `linhasDaEquipe` LANÇA, e um teste que morre por
     exceção não diz qual asserção falhou — diz só que parou */
  let r = null, explodiu = null;
  try { r = await linhasDaEquipe(bancoQueCorta(), 'e1', '2026-01-01'); }
  catch (e) { explodiu = e; }
  ok(explodiu === null, 'a carga não falha só porque um lote não coube numa resposta',
     String(explodiu?.message || '').slice(0, 110));
  ok((r?.habilidades || []).length === 60 * 40,
     'o que não cabia numa resposta chega inteiro, partindo o lote',
     `vieram ${(r?.habilidades || []).length} de ${60 * 40}`);
  ok(pedidos > 1, 'e o lote foi de fato partido', `pedidos=${pedidos}`);
  ok(maiorPedido <= 60, 'nenhum pedido levou mais ids que o lote original', String(maiorPedido));

  /* e o caso que partir NÃO resolve: uma linha só que passa do teto. Aí tem
     que virar erro, e o erro tem que dizer que partir não adianta. */
  function bancoImpossivel() {
    const b = bancoQueCorta({ porId: 5000, vols: 2 });
    return b;
  }
  let subiu = null;
  try { await linhasDaEquipe(bancoImpossivel(), 'e1', '2026-01-01'); }
  catch (e) { subiu = e; }
  ok(subiu !== null, 'um id sozinho que não cabe ainda FALHA, em vez de mentir');
  ok(/um item por vez/.test(String(subiu?.message || '')),
     'e o erro diz que partir o lote não resolve esse caso',
     String(subiu?.message).slice(0, 110));
}

/* ===========================================================================
   4) AS TRÊS LEITURAS QUE FICARAM DE FORA ATÉ 21/09

   `linhasDaEquipe` protegia seis leituras e deixava seis sem rede. Três delas
   são as de cima — `funcoes`, `voluntarios`, `cultos` — e as outras três
   moram na rota do cron (`equipes`, `lideres`) e em `config`, que é
   `.maybeSingle()` e não tem teto de lista.

   O que cortar SÓ `cultos` fazia, medido com a rota de verdade: `cultoIds`
   curto -> `escalacoes` lida para menos cultos -> `montados = 0` ->
   `decisaoDoRobo` diz 'monta' -> um mês já montado é REESCRITO, com HTTP 200
   e zero falhas. O dirigente do domingo trocado, e nada no relatório.

   Cada caso aqui corta UMA tabela e deixa as outras inteiras: se o teste
   cortasse todas de uma vez, ele passaria mesmo com duas das três leituras
   ainda desprotegidas. */
{
  const bancoQueCortaUma = (qual) => ({
    from: (nome) => {
      let pediuCount = false;
      const eu = {
        select(_c, o) { pediuCount = o?.count === 'exact'; return eu; },
        eq: () => eu, gte: () => eu, or: () => eu, order: () => eu, in: () => eu,
        maybeSingle: () => ({ data: null, error: null }),
        then(res) { return Promise.resolve(resp()).then(res); },
      };
      const cortada = (linhas, total) => ({ data: linhas, error: null, ...(pediuCount ? { count: total } : {}) });
      const resp = () => {
        if (nome === 'funcoes') return cortada(
          [{ id: 'f1', nome: 'P', equipe_id: 'e1', ativa: true, ordem: 1, simultanea: true, tipos: ['domingo'] }],
          qual === 'funcoes' ? 900 : 1);
        if (nome === 'voluntarios') return cortada(
          [{ id: 'v1', nome: 'V', ativo: true, equipe_id: 'e1', telefone: null, limite_mes: null, token: 't1', conferido: true }],
          qual === 'voluntarios' ? 900 : 1);
        if (nome === 'cultos') return cortada([{ id: 'c1', data: '2026-10-04' }], qual === 'cultos' ? 900 : 1);
        return cortada([], 0);
      };
      return eu;
    },
  });

  for (const qual of ['cultos', 'voluntarios', 'funcoes']) {
    let subiu = null;
    try { await linhasDaEquipe(bancoQueCortaUma(qual), 'e1', '2026-01-01'); }
    catch (e) { subiu = e; }
    ok(subiu !== null, `leitura cortada de ${qual} vira erro, em vez de virar decisao`);
    ok(/veio cortada/.test(String(subiu?.message || '')),
       `e o erro de ${qual} diz que a lista veio pela metade`,
       String(subiu?.message || '').slice(0, 90));
  }

  /* e com as tres inteiras a carga passa, para o teste acima nao estar
     medindo "qualquer banco falso quebra" */
  let explodiu = null;
  try { await linhasDaEquipe(bancoQueCortaUma('nenhuma'), 'e1', '2026-01-01'); }
  catch (e) { explodiu = e; }
  ok(explodiu === null, 'com as tres leituras inteiras, a carga passa',
     String(explodiu?.message || '').slice(0, 90));
}

if (falhas) { console.log(`leitura-cortada: ${falhas} falha(s) em ${feitas}`); process.exit(1); }
console.log(`leitura-cortada: ${feitas}/${feitas} ok`);
