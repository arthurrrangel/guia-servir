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

if (falhas) { console.log(`leitura-cortada: ${falhas} falha(s) em ${feitas}`); process.exit(1); }
console.log(`leitura-cortada: ${feitas}/${feitas} ok`);
