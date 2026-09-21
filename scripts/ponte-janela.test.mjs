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
function fingeBanco(linhas = {}, recusa = null) {
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
      /* devolve o CONSTRUTOR, como o cliente de verdade: desde 20/09
         `lerFuncoes` encadeia `.order('ordem').order('nome')` */
      order() { return eu; },
      then(res) { return Promise.resolve(resposta()).then(res); },
    };
    const resposta = () => {
      pedidos.push(reg);
      /* `recusa` simula o banco que ainda não recebeu a migração: a coluna não
         existe e o PostgREST recusa o PEDIDO INTEIRO, não a coluna. */
      if (recusa && recusa.tabela === nome && recusa.cols.some(c => (reg.cols || '').includes(c))) {
        return { data: null, error: { code: '42703', message: `column cultos.${recusa.cols[0]} does not exist` } };
      }
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

/* ---- 1b. O CÓDIGO PODE SUBIR ANTES DA MIGRAÇÃO 54 SEM DERRUBAR A TELA

   A Vercel publica sozinha no `git push`. Então existe uma janela entre o
   deploy e a aplicação da migração em que o app pede `evento`, `equipe_id` e
   `inicio` de uma tabela que ainda não tem essas colunas — e o PostgREST
   recusa o PEDIDO INTEIRO, não a coluna. Sem rede, Painel, Escala e Time
   morrem juntos, que é exatamente o apagão de 18/09.

   A carga tem que degradar: sem as colunas, segue com `id,data`, sem o filtro
   `.or()` (que fala justamente de `equipe_id`), e os eventos simplesmente não
   aparecem até a migração rodar. */
{
  const { cliente, pedidos } = fingeBanco(
    { voluntarios: [], funcoes: [], cultos: [{ id: 'c1', data: '2026-10-04' }] },
    { tabela: 'cultos', cols: ['evento', 'equipe_id', 'inicio'] },
  );
  let estourou = null, l = null;
  try { l = await linhasDaEquipe(cliente, 'e1', DESDE, 'Mídia'); }
  catch (e) { estourou = e; }

  ok(!estourou, 'banco sem a migração 54 NÃO derruba a carga',
    estourou ? String(estourou.message || estourou) : '');
  ok(Array.isArray(l?.cultos) && l.cultos.length === 1,
    'e os cultos chegam mesmo assim', JSON.stringify(l?.cultos));

  const deCultos = pedidos.filter(p => p.tabela === 'cultos');
  ok(deCultos.length === 2, 'tentou com as colunas novas e, recusado, tentou sem',
    `${deCultos.length} tentativa(s)`);
  ok(/evento/.test(deCultos[0]?.cols || ''), 'a primeira tentativa pede as colunas da 54', deCultos[0]?.cols);
  ok(!/evento/.test(deCultos[1]?.cols || ''), 'a segunda vai sem elas', deCultos[1]?.cols);
  ok(deCultos[1]?.or.length === 0,
    'e sem o filtro .or(), que fala da coluna que não existe', JSON.stringify(deCultos[1]?.or));

  /* e o Estado montado a partir disso é o de antes da 54: sem evento nenhum */
  const S = montarEstado(l);
  ok(!Object.values(S.escalas).some(d => d.evento),
    'nenhum dia vira evento quando o banco não tem a coluna');
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

/* ------------------------------ 3. DUAS LINHAS NA MESMA DATA: QUEM GANHA

   21/09/2026, 3ª auditoria. `idDoCulto` chaveia por DATA, e desde a migração
   54 uma data pode ter DUAS linhas nesta lista: a do culto regular e a do
   evento DESTA equipe (a consulta já filtra os de outras equipes).

   Com `new Map(pares)`, vencia a última, e a última é a ordem em que o banco
   devolveu — que muda sozinha. Isso importa porque `salvar_dia` (migração 61)
   e `salvarDia` (lib/db.ts) gravam SEMPRE no evento: se `d.cultoId` apontasse
   para a linha regular, a tela escreveria num id e gravaria em outro, e
   `mudarStatus` casaria zero linhas dizendo `ESCALA_MUDOU_NO_POSTO` sem nada
   ter mudado.

   A correção foi feita num commit e ficou SEM TESTE, o que a auditoria provou
   desfazendo-a e rodando a suíte inteira: exit 0, zero falhas. Este bloco é
   o teste que faltava, e ele roda `montarEstado` de verdade, nas duas ordens
   possíveis de leitura. */
{
  const linhas = (cultos) => ({
    funcoes: [{ id: 'f1', nome: 'FOTO', simultanea: true, ordem: 1, ativa: true, equipe_id: 'e1', tipos: ['domingo'] }],
    voluntarios: [{ id: 'v1', nome: 'Ana', telefone: null, ativo: true, limite_mes: null, token: 't1', equipe_id: 'e1', conferido: true }],
    habilidades: [], indisponibilidades: [], cultos,
    escalacoes: [], plantoes: [], config: null,
  });
  const REG = { id: 'c-regular', data: '2026-10-04' };
  const EVE = { id: 'c-evento', data: '2026-10-04', evento: 'GUIA Empreendedor', equipe_id: 'e1', inicio: null };

  for (const [rot, cs] of [['regular primeiro', [REG, EVE]], ['evento primeiro', [EVE, REG]]]) {
    const S = montarEstado(linhas(cs));
    ok(S.escalas['2026-10-04']?.cultoId === 'c-evento',
       `com as duas linhas (${rot}), o dia aponta para o EVENTO`,
       String(S.escalas['2026-10-04']?.cultoId));
  }

  /* e sem evento nenhum, continua apontando para o regular */
  const so = montarEstado(linhas([REG]));
  ok(!so.escalas['2026-10-04'], 'domingo regular sozinho não é materializado (regra de sempre)');

  /* o evento sozinho materializa o dia e leva o id dele */
  const ev = montarEstado(linhas([EVE]));
  ok(ev.escalas['2026-10-04']?.cultoId === 'c-evento', 'evento sozinho materializa o dia com o id dele',
     String(ev.escalas['2026-10-04']?.cultoId));
  ok(ev.escalas['2026-10-04']?.evento === 'GUIA Empreendedor', 'e com o nome dele');
}

console.log(falhas ? `\nponte-janela: ${falhas} falha(s) em ${feitas}` : `\nponte-janela: ${feitas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
