/* A JANELA DE HISTÓRICO CORTA NO BANCO O QUE JÁ ERA JOGADO FORA NA MEMÓRIA.

   `lib/ponte.ts` declara `DIAS_DE_HISTORICO = -200` e passava essa janela
   para DUAS das seis consultas: `cultos` e `disponibilidade`. As outras
   quatro vinham inteiras — todo o histórico daquela equipe desde o primeiro
   domingo — e `montarEstado` descartava, na memória, o que não casasse com
   nenhum culto carregado. Ou seja: o navegador baixava anos de escala para
   calcular o mês que vem, a cada carga de tela e a cada `recarregar()`, que
   roda depois de CADA ação do líder.

   A correção é cortar no banco o que já era descartado aqui. E é justamente
   por isso que ela precisa de prova: se o corte tirar UMA linha a mais do que
   a memória já tirava, o resultado do sorteio muda em silêncio — `cargaJanela`
   e `escalasNoMes` contam em cima do que foi carregado, e alguém que bateu o
   limite volta a ser elegível sem ninguém perceber.

   Então este arquivo prova duas coisas:
     1. as quatro consultas que crescem com o tempo levam o corte;
     2. `habilidades` NÃO leva — ela é por pessoa e por função, não cresce com
        o tempo, e é o que diz quem pode fazer o quê;
     3. o `Estado` montado é IDÊNTICO com e sem o corte, quando as linhas
        extras são justamente as que `montarEstado` descartaria.

   Roda com `npm test`. */

import { linhasDaEquipe, montarEstado, DIAS_DE_HISTORICO } from '../lib/ponte.ts';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => {
  feitas++;
  if (!c) { falhas++; console.log('  FALHOU:', rot, extra); }
};

/* dublê que REGISTRA os filtros aplicados em cada tabela */
function fingeBanco(linhas = {}) {
  const pedidos = [];
  const tabela = (nome) => {
    const reg = { tabela: nome, gte: [], in: [], eq: [], or: [], cols: '' };
    const eu = {
      select(cols) { reg.cols = cols || ''; return eu; },
      or(expr) { reg.or.push(expr); return eu; },
      eq(col, v) { reg.eq.push(col); return eu; },
      gte(col, v) { reg.gte.push({ col, v }); return eu; },
      in(col, vs) { reg.in.push({ col, n: (vs || []).length }); return eu; },
      maybeSingle() { return resposta(); },
      order() { return resposta(); },
      then(res) { return Promise.resolve(resposta()).then(res); },
    };
    const resposta = () => {
      pedidos.push(reg);
      return { data: linhas[nome] ?? [], error: null };
    };
    return eu;
  };
  return { cliente: { from: tabela }, pedidos };
}

const DESDE = '2026-03-03';

/* ---------------------------------------- 1. quem leva o corte e quem não */
{
  const { cliente, pedidos } = fingeBanco({
    voluntarios: [{ id: 'v1', nome: 'Ana', ativo: true, equipe_id: 'e1' }],
    funcoes: [{ id: 'f1', nome: 'FOTO', ativa: true, ordem: 1, equipe_id: 'e1' }],
    cultos: [{ id: 'c1', data: '2026-10-04' }],
  });
  await linhasDaEquipe(cliente, 'e1', DESDE, 'Mídia');
  const achar = (t) => pedidos.filter(p => p.tabela === t).pop();

  ok(achar('cultos')?.gte.some(g => g.col === 'data'), 'cultos corta por data');
  ok(achar('disponibilidade')?.gte.some(g => g.col === 'data'), 'disponibilidade corta por data');
  ok(achar('indisponibilidades')?.gte.some(g => g.col === 'data'),
    'indisponibilidades passa a cortar por data',
    JSON.stringify(achar('indisponibilidades')));
  ok(achar('escalacoes')?.in.some(i => i.col === 'culto_id'),
    'escalacoes passa a cortar pelos cultos da janela',
    JSON.stringify(achar('escalacoes')));
  ok(achar('plantoes')?.in.some(i => i.col === 'culto_id'),
    'plantoes passa a cortar pelos cultos da janela',
    JSON.stringify(achar('plantoes')));
  ok(!achar('habilidades')?.gte.length && !achar('habilidades')?.in.some(i => i.col === 'culto_id'),
    'habilidades NÃO é cortada: ela não cresce com o tempo');
  ok(DIAS_DE_HISTORICO === -200, 'a janela continua em 200 dias', String(DIAS_DE_HISTORICO));

  /* EVENTO ESPORÁDICO (migração 54): a consulta de cultos passa a trazer
     `evento`, e o filtro é o que impede o Louvor de ver um dia do Connect.
     Sem ele, a lista de dias de um ministério mostraria os eventos de todos. */
  const c = achar('cultos');
  ok(/evento/.test(c?.cols || ''), 'cultos pede a coluna evento', c?.cols);
  ok(/equipe_id/.test(c?.cols || ''), 'e a coluna equipe_id (o dono)', c?.cols);
  ok(/inicio/.test(c?.cols || ''), 'e o horario', c?.cols);
  ok(c?.or.some(e => /equipe_id\.is\.null/.test(e) && /equipe_id\.eq\./.test(e)),
    'e filtra: culto da igreja (sem dono) OU evento DESTE ministerio',
    JSON.stringify(c?.or));
  ok(c.or.some(e => e.includes('e1')), 'o filtro usa o id da equipe pedida', JSON.stringify(c?.or));
}

/* ------------------------------ 2. o Estado montado não muda com o corte

   As linhas "de fora da janela" são exatamente as que `montarEstado` já
   descartava, porque ele resolve `culto_id → data` por um mapa montado a
   partir dos cultos carregados. Se o corte no banco e o descarte na memória
   concordam, os dois Estados são iguais. */
{
  const cultos = [{ id: 'c1', data: '2026-10-04' }, { id: 'c2', data: '2026-10-11' }];
  const dentro = {
    voluntarios: [{ id: 'v1', nome: 'Ana', ativo: true, equipe_id: 'e1', limite_mes: 3 }],
    funcoes: [{ id: 'f1', nome: 'FOTO', ativa: true, ordem: 1, equipe_id: 'e1', simultanea: true }],
    cultos,
    habilidades: [{ voluntario_id: 'v1', funcao_id: 'f1', nivel: 'titular', confirmado: true }],
    escalacoes: [{ culto_id: 'c1', funcao_id: 'f1', voluntario_id: 'v1', status: 'pendente' }],
    plantoes: [{ culto_id: 'c1', voluntario_id: 'v1' }],
    indisponibilidades: [{ voluntario_id: 'v1', data: '2026-10-11' }],
    disponibilidade: [], culto_obs: [], config: null,
  };
  /* o mesmo, MAIS linhas de um culto velho que não está na janela */
  const comLixo = JSON.parse(JSON.stringify(dentro));
  comLixo.escalacoes.push({ culto_id: 'c-velho', funcao_id: 'f1', voluntario_id: 'v1', status: 'ok' });
  comLixo.plantoes.push({ culto_id: 'c-velho', voluntario_id: 'v1' });

  const monta = async (linhas) => {
    const { cliente } = fingeBanco(linhas);
    return montarEstado(await linhasDaEquipe(cliente, 'e1', DESDE, 'Mídia'));
  };
  const a = await monta(dentro);
  const b = await monta(comLixo);
  ok(JSON.stringify(a.escalas) === JSON.stringify(b.escalas),
    'linha de culto fora da janela não muda o Estado (já era descartada)',
    `\n  com corte:  ${JSON.stringify(a.escalas).slice(0, 160)}\n  sem corte:  ${JSON.stringify(b.escalas).slice(0, 160)}`);
  ok(Object.keys(a.escalas).length === 1 && !!a.escalas['2026-10-04']?.slots?.['FOTO'],
    'e o Estado de verdade foi montado (o teste não passou por vazio)',
    JSON.stringify(Object.keys(a.escalas)));
}

console.log(falhas ? `\nponte-janela: ${falhas} falha(s) em ${feitas}` : `\nponte-janela: ${feitas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
