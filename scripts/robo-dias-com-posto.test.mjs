/* =============================================================================
   O ROBÔ DO DIA 26 E O MINISTÉRIO QUE SÓ SERVE NO DOMINGO · 26/10/2026

   Achado no mês sintético encadeado (pacote de aceite do ciclo atual):
   `app/api/cron/route.ts` decide se monta o mês com

       const dias = diasDoMes(S, prox.ano, prox.mes);
       const montados = dias.filter(d => ...alguém no dia...);
       const decisao = decisaoDoRobo(montados.length, dias.length);

   `diasDoMes` é o calendário da igreja: TODO domingo e TODO sábado de
   Follow, mais os eventos do ministério. Connect, GUIA Kids e Livraria não
   têm posto no sábado (`funcoes.tipos`, migração 99), então o sábado nunca
   tem gente e nunca entra em `montados`. Resultado, com dados fictícios:
   o mês desses ministérios montado inteiro pela liderança antes do dia 26
   dá 5 de 9 → 'parcial'. A linha vai para `falhas`, o organizador geral
   recebe "[ATENÇÃO] ministério não montado" e a rota responde 500, todo
   mês, por um estado normal. É o mesmo defeito que a 82 tirou da cobrança
   de quinta (`avisarDiaSemNinguem`), pela outra porta.

   A correção conta só os dias em que o ministério tem posto
   (`funcoesDoDia`, a mesma pergunta que a cobrança de quinta já faz). Dia
   de evento continua contando: `funcoesDoDia` devolve os postos ativos do
   dono do evento.

   Teste puro, com linhas fictícias montadas por `montarEstado`. A rota não
   é executada: a forma da linha da rota é conferida como texto, como
   `cron-guarda.test.mjs` já faz com `decisaoDoRobo`. A conta abaixo
   (`comoConta`) repete as três linhas da rota; o vínculo com a rota é a
   conferência de texto no fim deste arquivo.

   Lote 6 (26/10/2026), três cenários a mais, pedidos na revisão:
     · 4 de 5 domingos montados continua 'parcial' (o aviso legítimo fica);
     · o evento de OUTRO ministério no mês não entra na conta: quem o tira é
       a consulta de cultos (`lib/ponte.ts`, `lerCultos`), e a prova passa
       por `linhasDaEquipe` de verdade, com um banco fictício que aplica o
       filtro que ela pede;
     · ministério sem posto ativo não é montado: a rota pula antes de
       decidir, e a conta nova dá 'ja-tem' com 0 de 0 (nunca 'monta').
   node --import ./scripts/_ts.mjs scripts/robo-dias-com-posto.test.mjs
   ============================================================================= */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { linhasDaEquipe, montarEstado } from '../lib/ponte.ts';
import { decisaoDoRobo, diasDoMes, funcoesDoDia } from '../lib/engine.ts';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (c) console.log('  ok', rot); else { falhas++; console.log('  FALHOU:', rot, extra); } };

const ANO = 2026, MES = 11;
const DOMINGOS = ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29'];
const SABADOS = ['2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28'];
const EVENTO = '2026-11-18';

/* um ministério fictício: dois postos, duas pessoas, os cultos regulares do
   mês (equipe_id nulo, como em produção) e, se pedido, um evento dele */
const EQ = 'eq-ficticia';
function linhasFicticias({ tipos, montar = [], evento = false, ativa = true }) {
  const eq = EQ;
  const funcoes = ['POSTO A', 'POSTO B'].map((nome, i) => ({
    id: `f${i + 1}`, nome, simultanea: true, ordem: i + 1, ativa, equipe_id: eq, tipos,
  }));
  const voluntarios = ['Pessoa Fictícia Um', 'Pessoa Fictícia Dois'].map((nome, i) => ({
    id: `v${i + 1}`, nome, telefone: null, ativo: true, limite_mes: null, token: `fict-${i + 1}`,
    equipe_id: eq, conferido: true,
  }));
  const cultos = [...DOMINGOS, ...SABADOS].sort().map(data => ({ id: `c-${data}`, data, evento: null, equipe_id: null, inicio: null }));
  if (evento) cultos.push({ id: `c-${EVENTO}-ev`, data: EVENTO, evento: 'Evento Fictício', equipe_id: eq, inicio: '19:30' });
  const idDe = (d) => cultos.find(c => c.data === d && (d === EVENTO ? !!c.evento : !c.evento)).id;
  const escalacoes = montar.flatMap((d, k) => funcoes.map((f, i) => ({
    id: `e-${k}-${i}`, culto_id: idDe(d), funcao_id: f.id, voluntario_id: `v${i + 1}`,
    status: 'pendente', fixo: false, primeira_vez: false, respondido_em: null, escalado_em: null,
  })));
  return {
    funcoes, voluntarios, habilidades: [], indisponibilidades: [], cultos, escalacoes,
    plantoes: [], config: { dados: {}, equipe_id: eq }, recados: [], disponibilidades: [],
  };
}
const estado = (opcoes) => montarEstado(linhasFicticias(opcoes));
const temGente = (S, d) => Object.values(S.escalas[d]?.slots || {}).some(x => x?.vid);
/* como a rota contava até aqui */
const comoContava = (S) => {
  const dias = diasDoMes(S, ANO, MES);
  const montados = dias.filter(d => temGente(S, d));
  return { decisao: decisaoDoRobo(montados.length, dias.length), conta: `${montados.length} de ${dias.length}` };
};
/* como a rota conta com a correção: só os dias em que o ministério tem posto */
const comoConta = (S) => {
  const dias = diasDoMes(S, ANO, MES).filter(d => funcoesDoDia(S, d).length > 0);
  const montados = dias.filter(d => temGente(S, d));
  return { decisao: decisaoDoRobo(montados.length, dias.length), conta: `${montados.length} de ${dias.length}` };
};

const SO_DOMINGO = ['domingo'], AMBOS = ['domingo', 'follow'];
const casos = [
  ['só domingo, os 5 domingos montados', estado({ tipos: SO_DOMINGO, montar: DOMINGOS }), 'ja-tem', '5 de 5'],
  ['só domingo, 2 domingos montados', estado({ tipos: SO_DOMINGO, montar: DOMINGOS.slice(0, 2) }), 'parcial', '2 de 5'],
  ['só domingo, nada montado', estado({ tipos: SO_DOMINGO }), 'monta', '0 de 5'],
  ['domingo e Follow, os 9 cultos montados', estado({ tipos: AMBOS, montar: [...DOMINGOS, ...SABADOS] }), 'ja-tem', '9 de 9'],
  ['domingo e Follow, só os domingos montados', estado({ tipos: AMBOS, montar: DOMINGOS }), 'parcial', '5 de 9'],
  ['só domingo com evento numa quarta, tudo montado', estado({ tipos: SO_DOMINGO, montar: [...DOMINGOS, EVENTO], evento: true }), 'ja-tem', '6 de 6'],
  ['só domingo com evento numa quarta ainda vazio', estado({ tipos: SO_DOMINGO, montar: DOMINGOS, evento: true }), 'parcial', '5 de 6'],
  /* lote 6: o mês pela metade de verdade continua avisando */
  ['só domingo, 4 de 5 domingos montados', estado({ tipos: SO_DOMINGO, montar: DOMINGOS.slice(0, 4) }), 'parcial', '4 de 5'],
];
for (const [rot, S, esperado, conta] of casos) {
  const r = comoConta(S);
  ok(r.decisao === esperado && r.conta === conta, `${rot}: ${esperado} (${conta})`, JSON.stringify(r));
}
/* o defeito, reproduzido pela conta antiga */
{
  const antigo = comoContava(estado({ tipos: SO_DOMINGO, montar: DOMINGOS }));
  console.log(`  (conta antiga, só domingo e mês inteiro montado: ${antigo.decisao}, ${antigo.conta})`);
  ok(antigo.decisao === 'parcial', 'a conta antiga dava "parcial" para o mês inteiro montado de quem só serve no domingo');
}

/* ---- lote 6 · o evento de OUTRO ministério não entra na conta ------------
   Num dia de evento, `funcoesDoDia` devolve TODOS os postos ativos (o evento
   é do dono). Então, se um evento de outro ministério chegasse ao estado,
   ele viraria um dia "com posto" sem ninguém, e o mês montado inteiro
   voltaria a ser 'parcial'. Quem impede isso é a consulta de cultos de
   `linhasDaEquipe` (`.or(equipe_id.is.null,equipe_id.eq.<equipe>)`, também
   coberta em ponte-janela.test.mjs). Aqui a carga é a de verdade, e o banco
   fictício aplica exatamente o filtro que ela pede. */
function bancoFicticio(tabelas) {
  const filtrosDeCultos = [];
  const tabela = (nome) => {
    const or = [], gte = [];
    const eu = {
      select() { return eu; }, eq() { return eu; }, in() { return eu; }, order() { return eu; },
      or(expr) { or.push(expr); return eu; },
      gte(col, v) { gte.push([col, v]); return eu; },
      maybeSingle() { return Promise.resolve({ data: null, error: null }); },
      then(res, rej) { return Promise.resolve(resposta()).then(res, rej); },
    };
    const resposta = () => {
      let linhas = tabelas[nome] ?? [];
      if (nome === 'cultos') {
        filtrosDeCultos.push([...or]);
        /* `col.is.null` e `col.eq.valor`, separados por vírgula, valem como OU */
        for (const expr of or) {
          const alternativas = expr.split(',').map(a => a.split('.'));
          linhas = linhas.filter(l => alternativas.some(([col, op, ...v]) =>
            (op === 'is' && v.join('.') === 'null' && l[col] == null) || (op === 'eq' && String(l[col]) === v.join('.'))));
        }
        for (const [col, v] of gte) linhas = linhas.filter(l => l[col] >= v);
      }
      return { data: linhas, error: null };
    };
    return eu;
  };
  return { cliente: { from: tabela }, filtrosDeCultos };
}
{
  const mes = linhasFicticias({ tipos: SO_DOMINGO, montar: DOMINGOS });
  /* no banco: os cultos da igreja e um evento numa quarta que é de OUTRO ministério */
  const alheio = { id: `c-${EVENTO}-outro`, data: EVENTO, evento: 'Evento de Outro Ministério', equipe_id: 'eq-de-outro-ministerio', inicio: '19:30' };
  const { cliente, filtrosDeCultos } = bancoFicticio({ ...mes, cultos: [...mes.cultos, alheio] });
  const S = montarEstado(await linhasDaEquipe(cliente, EQ, '2026-10-01', 'Ministério Fictício'));
  ok(filtrosDeCultos.length === 1 && filtrosDeCultos[0].length === 1 && filtrosDeCultos[0][0] === `equipe_id.is.null,equipe_id.eq.${EQ}`,
    'a consulta de cultos pede só os cultos da igreja e os eventos deste ministério', JSON.stringify(filtrosDeCultos));
  ok(!S.escalas[EVENTO], 'o evento do outro ministério não entra no estado deste', JSON.stringify(S.escalas[EVENTO] || null));
  const r = comoConta(S);
  ok(r.decisao === 'ja-tem' && r.conta === '5 de 5',
    'só domingo, mês inteiro montado, com evento de outro ministério no mês: ja-tem (5 de 5)', JSON.stringify(r));
  /* controle: as mesmas linhas SEM o filtro da consulta. Mostra que a
     exclusão mora na consulta, e não na conta da rota */
  const semFiltro = comoConta(montarEstado({ ...mes, cultos: [...mes.cultos, alheio] }));
  ok(semFiltro.decisao === 'parcial' && semFiltro.conta === '5 de 6',
    'controle: sem o filtro da consulta, o evento alheio entraria na conta (5 de 6, parcial)', JSON.stringify(semFiltro));
}

/* ---- lote 6 · ministério sem posto ativo não é montado -------------------
   A rota pula o ministério antes de decidir ("sem time/funções ativas"), e a
   conta nova, mesmo sem esse pulo, não manda montar: sem dia com posto, a
   decisão é 'ja-tem' (`decisaoDoRobo`: mês sem culto, nada a fazer). A conta
   antiga, sem o pulo da rota, mandaria montar. */
{
  const S = estado({ tipos: SO_DOMINGO, ativa: false });
  const r = comoConta(S);
  ok(r.decisao === 'ja-tem' && r.conta === '0 de 0', 'sem posto ativo: a conta nova não manda montar (ja-tem, 0 de 0)', JSON.stringify(r));
  const antigo = comoContava(S);
  ok(antigo.decisao === 'monta', `sem posto ativo: a conta antiga, sem o pulo da rota, mandaria montar (${antigo.decisao}, ${antigo.conta})`, JSON.stringify(antigo));
}

/* a rota usa a conta nova (forma da linha, como cron-guarda.test.mjs) */
{
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
  const cron = readFileSync(join(raiz, 'app/api/cron/route.ts'), 'utf8');
  ok(/const dias = diasDoMes\(S, prox\.ano, prox\.mes\)\s*\.filter\(d => funcoesDoDia\(S, d\)\.length > 0\);/.test(cron),
    'a rota do dia 26 conta só os dias em que o ministério tem posto');
  ok(/decisaoDoRobo\(montados\.length, dias\.length\)/.test(cron), 'e continua decidindo por decisaoDoRobo');
  /* lote 6: e o ministério sem time ou sem posto ativo sai ANTES dessa conta */
  const pulo = cron.search(/if \(!S\.voluntarios\.filter\(v => v\.ativo\)\.length \|\| !funcoesAtivas\(S\)\.length\) \{ resumo\.push\(\{ equipe: e\.nome, pulado: 'sem time\/funções ativas' \}\); continue; \}/);
  const conta = cron.search(/const dias = diasDoMes\(S, prox\.ano, prox\.mes\)/);
  ok(pulo > -1 && conta > -1 && pulo < conta, 'e a rota pula quem não tem posto ativo antes de contar os dias', `pulo ${pulo}, conta ${conta}`);
}

console.log(`\nrobô do dia 26 por dias com posto: ${feitas - falhas}/${feitas}`);
if (falhas) process.exit(1);
