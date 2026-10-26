/* O BOTÃO "MANDAR AGORA PELO ROBÔ", DO LADO DO SISTEMA · 26/10/2026.

   O Arthur: "Gostaria de na aba do sistema ter a opção de disparar escala,
   através desse robo, vou deixar o macbook ligado" e "Para todos os
   ministérios".

   Executa (não lê texto) as duas pontas do servidor:
     · lib/robo-pedidos-rota.ts, o corpo de /api/robo/pedidos, com um banco
       de mentira que aplica os filtros de verdade (eq, in, lt, order, limit):
       sem o segredo nada toca o banco; o que terminou não volta; o pedido
       velho vence antes de chegar ao robô; o robô só recebe o que está aberto;
     · lib/robo-pedidos.ts: o que a rota aceita e o que a tela diz ao líder.

   O banco de verdade (robo_pedir, robo_situacao) se confere sozinho na
   migração 115, na reconstrução do zero (scripts/banco-do-zero.sh).

   Roda com `npm test`. */

import { atenderOPedidoDoRobo } from '@/lib/robo-pedidos-rota';
import {
  lerCorpoDoRobo, limparResultado, leituraDoRobo, leituraDoPedido, pedidoVencido, passagemValida,
  haQuanto, erroDoPedido, quandoSP, dentroDaJanelaDoRobo, marcasDoRobo, mandadasAMao, roboNoAr,
  VALIDADE_DO_PEDIDO_MIN, ROBO_LIGADO_ATE_S,
} from '@/lib/robo-pedidos';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

const SEG = 'x'.repeat(40);
const AGORA = new Date('2026-10-26T21:00:00.000Z'); // 18:00 em Brasília
const iso = (minAtras) => new Date(AGORA.getTime() - minAtras * 60_000).toISOString();

/* --------------------------------------------- o banco de mentira */
function bancoDeMentira(tabelas, { falharEm } = {}) {
  const chamadas = [];
  const abertos = { n: 0 };
  const filtra = (linhas, filtros) => linhas.filter(l => filtros.every(f => f(l)));
  function construtor(tabela) {
    const st = { op: null, valor: null, filtros: [], ordem: null, limite: null };
    const b = {
      upsert(v) { st.op = 'upsert'; st.valor = v; return b; },
      update(v) { st.op = 'update'; st.valor = v; return b; },
      /* select depois do update: devolve as linhas que o update alcançou */
      select() { if (st.op === 'update') st.devolver = true; else st.op = st.op || 'select'; return b; },
      eq(c, v) { st.filtros.push(l => l[c] === v); return b; },
      in(c, vs) { st.filtros.push(l => vs.includes(l[c])); return b; },
      lt(c, v) { st.filtros.push(l => l[c] !== null && l[c] !== undefined && String(l[c]) < String(v)); return b; },
      order(c, o) { st.ordem = [c, o?.ascending !== false]; return b; },
      limit(n) { st.limite = n; return b; },
      then(res, rej) {
        try {
          chamadas.push(`${tabela}:${st.op}`);
          /* "tabela:op" cai na primeira vez; "tabela:op#2", só na segunda */
          const vez = chamadas.filter(c => c === `${tabela}:${st.op}`).length;
          if (falharEm && (falharEm === `${tabela}:${st.op}` || falharEm === `${tabela}:${st.op}#${vez}`)) return Promise.resolve({ data: null, error: { message: 'caiu' } }).then(res, rej);
          const t = tabelas[tabela] || (tabelas[tabela] = []);
          if (st.op === 'upsert') {
            const i = t.findIndex(l => l.id === st.valor.id);
            if (i >= 0) t[i] = { ...t[i], ...st.valor }; else t.push({ ...st.valor });
            return Promise.resolve({ data: null, error: null }).then(res, rej);
          }
          if (st.op === 'update') {
            const alcancou = filtra(t, st.filtros);
            for (const l of alcancou) Object.assign(l, JSON.parse(JSON.stringify(st.valor)));
            return Promise.resolve({ data: st.devolver ? alcancou.map(l => ({ id: l.id })) : null, error: null }).then(res, rej);
          }
          let d = filtra(t, st.filtros).map(l => ({ ...l }));
          if (st.ordem) { const [c, asc] = st.ordem; d.sort((a, z) => (a[c] < z[c] ? -1 : a[c] > z[c] ? 1 : 0) * (asc ? 1 : -1)); }
          if (st.limite !== null) d = d.slice(0, st.limite);
          return Promise.resolve({ data: d, error: null }).then(res, rej);
        } catch (e) { return Promise.reject(e).then(res, rej); }
      },
    };
    return b;
  }
  return {
    chamadas, abertos,
    abrir: () => { abertos.n++; return { from: construtor }; },
  };
}

const MIDIA = '11111111-1111-4111-8111-111111111111';
const LOUVOR = '22222222-2222-4222-8222-222222222222';
const P = (n) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
function cenario() {
  return {
    equipes: [{ id: MIDIA, slug: 'midia' }, { id: LOUVOR, slug: 'louvor' }],
    /* o robô passou há 30 s: está no ar (a regra da volta não entra) */
    robo_estado: [{ id: 1, visto_em: iso(0.5) }],
    robo_pedidos: [
      { id: P(1), equipe_id: MIDIA, data: '2026-11-01', status: 'pendente', criado_em: iso(2), atualizado_em: iso(2), resultado: null },
      { id: P(2), equipe_id: LOUVOR, data: '2026-10-31', status: 'pendente', criado_em: iso(1), atualizado_em: iso(1), resultado: null },
      /* o robô não pegou a tempo */
      { id: P(3), equipe_id: MIDIA, data: '2026-10-31', status: 'pendente', criado_em: iso(VALIDADE_DO_PEDIDO_MIN + 1), atualizado_em: iso(40), resultado: null },
      /* o dia passou */
      { id: P(4), equipe_id: LOUVOR, data: '2026-10-25', status: 'enviando', criado_em: iso(5), atualizado_em: iso(5), resultado: null },
      /* o envio parou e não voltou */
      { id: P(5), equipe_id: LOUVOR, data: '2026-11-01', status: 'enviando', criado_em: iso(50), atualizado_em: iso(VALIDADE_DO_PEDIDO_MIN + 5), resultado: null },
      /* terminado: não volta */
      { id: P(6), equipe_id: MIDIA, data: '2026-11-01', status: 'enviado', criado_em: iso(100), atualizado_em: iso(90), resultado: { resumo: 'Mandado', grupos: [], avisos: [] } },
    ],
  };
}
const req = (corpo, cab = `Bearer ${SEG}`) => new Request('https://x/api/robo/pedidos', {
  method: 'POST', headers: cab ? { authorization: cab, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
  body: typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
});
const BAT = { conectado: true, pausado: false, versao: '9d', ministerios: ['midia', 'louvor', 'servico'] };

/* ---------------------------------------------- sem segredo, nada */
for (const [rot, cab, seg] of [
  ['sem cabeçalho', null, SEG], ['segredo errado', `Bearer ${'y'.repeat(40)}`, SEG],
  ['sem segredo no servidor', `Bearer ${SEG}`, undefined], ['segredo curto no servidor', 'Bearer abc', 'abc'],
  ['segredo na forma errada', SEG, SEG],
]) {
  const b = bancoDeMentira(cenario());
  const r = await atenderOPedidoDoRobo(req({ batimento: BAT }, cab), seg, b.abrir, AGORA);
  ok(r.status === 401, `${rot}: 401`, String(r.status));
  ok(b.abertos.n === 0 && b.chamadas.length === 0, `${rot}: o banco nem abre`);
}

/* ------------------------------------------- corpo ruim, nada */
for (const [rot, corpo] of [
  ['vazio', ''], ['não é JSON', '{x'], ['sem batimento', {}], ['conectado não booleano', { batimento: { ...BAT, conectado: 'sim' } }],
  ['ministério com caractere estranho', { batimento: { ...BAT, ministerios: ['mi dia'] } }],
  ['relato com id que não é uuid', { batimento: BAT, relatos: [{ id: '1; drop', status: 'enviado' }] }],
  ['relato voltando a pendente', { batimento: BAT, relatos: [{ id: P(1), status: 'pendente' }] }],
  ['relatos demais', { batimento: BAT, relatos: Array.from({ length: 21 }, (_, i) => ({ id: P(i), status: 'enviado' })) }],
  ['grande demais', JSON.stringify({ batimento: BAT, lixo: 'x'.repeat(100_001) })],
]) {
  const b = bancoDeMentira(cenario());
  const r = await atenderOPedidoDoRobo(req(corpo), SEG, b.abrir, AGORA);
  ok(r.status === 400, `${rot}: 400`, String(r.status));
  ok(b.abertos.n === 0, `${rot}: o banco nem abre`);
}

/* ------------------------------------------------ a passada boa */
{
  const t = cenario();
  const b = bancoDeMentira(t);
  const r = await atenderOPedidoDoRobo(req({
    batimento: BAT,
    relatos: [
      { id: P(1), status: 'enviado', resultado: { resumo: 'Mandado em 8 grupos.', grupos: [{ nome: 'Multimídia · Geral', situacao: 'postado' }], avisos: [] } },
      /* já terminado: o banco não deixa voltar */
      { id: P(6), status: 'falhou', resultado: { resumo: 'tentou mudar', grupos: [], avisos: [] } },
    ],
  }), SEG, b.abrir, AGORA);
  const j = await r.json();
  ok(r.status === 200 && j.ok === true, 'a passada responde 200', JSON.stringify(j));
  ok(r.headers.get('cache-control') === 'no-store', 'a resposta não fica em cache');
  const est = t.robo_estado[0];
  ok(est.visto_em === AGORA.toISOString() && est.conectado === true && est.pausado === false && est.versao === '9d', 'o batimento grava quando e como o robô está');
  ok(JSON.stringify(est.ministerios) === JSON.stringify(['midia', 'louvor', 'servico']), 'e os ministérios que ele sabe');
  const p = id => t.robo_pedidos.find(x => x.id === id);
  ok(p(P(1)).status === 'enviado' && p(P(1)).resultado.resumo === 'Mandado em 8 grupos.', 'o relato do robô vira o resultado do pedido');
  ok(p(P(6)).status === 'enviado' && p(P(6)).resultado.resumo === 'Mandado', 'o que terminou não volta');
  ok(JSON.stringify(j.vistos) === JSON.stringify([P(1), P(6)]), 'o robô fica sabendo que os dois relatos chegaram (e para de mandar)', JSON.stringify(j.vistos));
  ok(p(P(3)).status === 'falhou' && /30 minutos/.test(p(P(3)).resultado.resumo), 'o pendente velho vence, com o motivo');
  ok(p(P(4)).status === 'falhou' && /parou no meio/.test(p(P(4)).resultado.resumo), 'o do dia que passou, que estava mandando, fecha como "parou no meio" (pode ter saído em parte)');
  ok(p(P(5)).status === 'falhou' && /parou no meio/.test(p(P(5)).resultado.resumo), 'o envio parado vence, pedindo para conferir os grupos');
  ok(p(P(2)).status === 'pendente', 'o pendente novo continua');
  ok(JSON.stringify(j.pedidos.map(x => [x.id, x.equipe, x.data, x.status])) === JSON.stringify([[P(2), 'louvor', '2026-10-31', 'pendente']]),
    'o robô recebe só o que está aberto e vale, com o ministério pelo nome', JSON.stringify(j.pedidos));
  /* a ordem importa: o relato antes do vencimento, senão um envio que acabou
     de terminar viraria "parou no meio" */
  const iRel = b.chamadas.indexOf('robo_pedidos:update');
  ok(b.chamadas[0] === 'robo_estado:select' && b.chamadas[1] === 'robo_estado:upsert' && iRel === 2,
    'a passada anterior, o batimento, depois relatos, depois vencimentos', b.chamadas.join(' '));
}

/* o "estou mandando" só pega pedido aberto e dentro do prazo; o robô só manda o que pegou */
{
  const t = cenario();
  const b = bancoDeMentira(t);
  const r = await atenderOPedidoDoRobo(req({ batimento: BAT, relatos: [{ id: P(2), status: 'enviando' }, { id: P(3), status: 'enviando' }, { id: P(6), status: 'enviando' }] }), SEG, b.abrir, AGORA);
  const j = await r.json();
  ok(JSON.stringify(j.aplicados) === JSON.stringify([P(2)]), 'a marca pega o pendente novo; o velho (vencido antes) e o já enviado não', JSON.stringify(j.aplicados));
  ok(t.robo_pedidos.find(x => x.id === P(3)).status === 'falhou', 'o velho fecha como vencido, sem sair');
  ok(j.voltou === false, 'robô que passou há 30 s não "voltou"');
  /* relato final de pedido já fechado: o robô fica sabendo que chegou (vistos), mas não aplica */
  const t2 = cenario();
  const b2 = bancoDeMentira(t2);
  const j2 = await (await atenderOPedidoDoRobo(req({ batimento: BAT, relatos: [{ id: P(6), status: 'falhou', resultado: { resumo: 'x', grupos: [], avisos: [] } }, { id: P(1), status: 'enviado' }] }), SEG, b2.abrir, AGORA)).json();
  ok(JSON.stringify(j2.vistos) === JSON.stringify([P(6), P(1)]) && JSON.stringify(j2.aplicados) === JSON.stringify([P(1)]), 'relato de pedido fechado: visto, não aplicado', JSON.stringify(j2));
}

/* O ROBÔ QUE VOLTA NÃO MANDA O QUE ESPEROU: fora do ar por mais de 3 minutos,
   a tela mandou o líder mandar à mão */
{
  const t = cenario();
  t.robo_estado[0].visto_em = iso(5);
  const b = bancoDeMentira(t);
  const j = await (await atenderOPedidoDoRobo(req({ batimento: BAT, relatos: [{ id: P(2), status: 'enviando' }] }), SEG, b.abrir, AGORA)).json();
  const p = id => t.robo_pedidos.find(x => x.id === id);
  ok(j.voltou === true && p(P(1)).status === 'falhou' && /ficou fora do ar/.test(p(P(1)).resultado.resumo) && p(P(2)).status === 'falhou',
    'volta depois de 5 min: os pendentes caem, com o motivo', JSON.stringify(t.robo_pedidos.map(x => [x.id.slice(-2), x.status])));
  ok(p(P(5)).status === 'falhou' && /parou no meio/.test(p(P(5)).resultado.resumo), 'o que estava mandando fecha como "parou no meio"');
  ok(JSON.stringify(j.aplicados) === '[]' && j.pedidos.length === 0, 'nenhuma marca pega, e o robô não recebe nada para mandar', JSON.stringify(j));
  const t2 = cenario();
  t2.robo_estado[0].visto_em = iso(ROBO_LIGADO_ATE_S / 60 - 0.5);
  const b2 = bancoDeMentira(t2);
  await atenderOPedidoDoRobo(req({ batimento: BAT }), SEG, b2.abrir, AGORA);
  ok(t2.robo_pedidos.find(x => x.id === P(1)).status === 'pendente', 'dentro dos 3 minutos: nada cai');
  const t3 = cenario();
  t3.robo_estado = [];
  const b3 = bancoDeMentira(t3);
  const j3 = await (await atenderOPedidoDoRobo(req({ batimento: BAT }), SEG, b3.abrir, AGORA)).json();
  ok(j3.voltou === true && t3.robo_estado[0]?.visto_em === AGORA.toISOString(), 'a primeira passada de todas grava o batimento e conta como volta');
}

/* um envio longo que acabou agora não vira "parou no meio" */
{
  const t = cenario();
  t.robo_pedidos.find(x => x.id === P(5)).status = 'enviando';
  const b = bancoDeMentira(t);
  await atenderOPedidoDoRobo(req({ batimento: BAT, relatos: [{ id: P(5), status: 'enviado', resultado: { resumo: 'Mandado em 5 grupos.', grupos: [], avisos: [] } }] }), SEG, b.abrir, AGORA);
  ok(t.robo_pedidos.find(x => x.id === P(5)).status === 'enviado', 'o relato que chega junto com o vencimento vale');
}

/* o robô em "enviando" renova o prazo */
{
  const t = cenario();
  const b = bancoDeMentira(t);
  await atenderOPedidoDoRobo(req({ batimento: BAT, relatos: [{ id: P(2), status: 'enviando' }] }), SEG, b.abrir, AGORA);
  const p2 = t.robo_pedidos.find(x => x.id === P(2));
  ok(p2.status === 'enviando' && p2.atualizado_em === AGORA.toISOString(), 'enviando: o pedido fica aberto com a hora do robô');
}

/* banco caindo no meio: 502, e o robô tenta de novo (nada de "vistos": um
   relato que não gravou não pode sair da fila do robô) */
for (const onde of ['robo_estado:select', 'robo_estado:upsert', 'robo_pedidos:update#1', 'robo_pedidos:update#2', 'robo_pedidos:update#4', 'robo_pedidos:select', 'equipes:select']) {
  const b = bancoDeMentira(cenario(), { falharEm: onde });
  const r = await atenderOPedidoDoRobo(req({ batimento: BAT, relatos: [{ id: P(1), status: 'enviado' }] }), SEG, b.abrir, AGORA);
  const j = await r.json();
  ok(r.status === 502 && j.ok === false && !('vistos' in j), `banco caindo em ${onde}: 502 sem "vistos"`, `${r.status} ${JSON.stringify(j)}`);
}
{
  const r = await atenderOPedidoDoRobo(req({ batimento: BAT }), SEG, () => null, AGORA);
  ok(r.status === 503, 'sem a chave do banco no servidor: 503');
}

/* ------------------------------------------- o que a rota aceita */
{
  const c = lerCorpoDoRobo({ batimento: { conectado: true, pausado: false, versao: 'v'.repeat(90), ministerios: ['midia', 'midia'] } });
  ok(c && c.batimento.versao.length === 40 && c.batimento.ministerios.length === 1, 'versão cortada e ministério repetido uma vez só');
  ok(lerCorpoDoRobo({ batimento: { conectado: true, pausado: true } })?.batimento.ministerios === null, 'sem lista de ministérios: nulo (o banco aceita qualquer um)');
  const r = limparResultado({
    resumo: 'ok\u0007' + 'x'.repeat(400), avisos: Array.from({ length: 15 }, () => 'a'),
    grupos: [{ nome: 'G', situacao: 'postado' }, { nome: 'H', situacao: 'inventado' }, { nome: '', situacao: 'postado' }, { nome: 'I', situacao: 'erro', detalhe: 'd'.repeat(500) }],
  });
  ok(r.resumo.length === 300 && !r.resumo.includes('\u0007'), 'resumo sem caractere de controle e cortado');
  ok(r.grupos.length === 2 && r.grupos[1].detalhe.length === 200, 'grupo sem nome ou com situação inventada sai; detalhe cortado');
  ok(r.avisos.length === 10, 'no máximo 10 avisos');
  ok(limparResultado([1]) === null && limparResultado('x') === null, 'resultado que não é objeto: nulo');
  ok(!passagemValida('enviado', 'falhou') && !passagemValida('falhou', 'enviado') && !passagemValida('pendente', 'pendente')
    && passagemValida('pendente', 'enviando') && passagemValida('enviando', 'enviado'), 'as passagens de status');
}

/* ------------------------------------------- o que a tela diz */
{
  ok(leituraDoRobo(null).podePedir === false && leituraDoRobo({ segundos: null }).titulo === 'Robô ainda não ligado', 'robô que nunca passou: sem botão');
  const ligado = { visto_em: iso(0), conectado: true, pausado: false, segundos: 40, sabe: true };
  ok(leituraDoRobo(ligado).podePedir === true && leituraDoRobo(ligado).tom === 'ok', 'robô ligado: botão');
  ok(leituraDoRobo({ ...ligado, segundos: ROBO_LIGADO_ATE_S }).podePedir === true, 'três minutos ainda é ligado');
  const fora = leituraDoRobo({ ...ligado, segundos: ROBO_LIGADO_ATE_S + 1 });
  ok(fora.podePedir === false && fora.tom === 'fora' && /botões abaixo/.test(fora.detalhe), 'mais de três minutos sem notícia: desligado, e o caminho de antes');
  ok(leituraDoRobo({ ...ligado, sabe: false }).podePedir === false, 'ministério sem grupos no robô: sem botão');
  ok(leituraDoRobo({ ...ligado, sabe: null }).podePedir === true, 'robô que ainda não contou os ministérios: deixa pedir (o banco confere)');
  ok(leituraDoRobo({ ...ligado, pausado: true }).podePedir === false, 'pausado: sem botão');
  ok(leituraDoRobo({ ...ligado, conectado: false }).podePedir === false, 'sem WhatsApp: sem botão');
  ok(haQuanto(30) === 'agora há pouco' && haQuanto(600) === 'há 10 min' && haQuanto(7200) === 'há 2 h' && haQuanto(3 * 86400) === 'há 3 dias', 'há quanto tempo');

  const base = { id: P(1), criado_em: iso(1), atualizado_em: iso(1), pedido_por: 'Arthur Rangel', resultado: null };
  const agoraMs = AGORA.getTime();
  const pend = leituraDoPedido({ ...base, status: 'pendente' }, agoraMs);
  ok(pend.aberto && pend.titulo === 'Esperando o robô' && /às 17:59 por Arthur Rangel/.test(pend.detalhe), 'pendente: esperando, com a hora de Brasília e quem pediu', pend.detalhe);
  const venc = leituraDoPedido({ ...base, status: 'pendente', criado_em: iso(VALIDADE_DO_PEDIDO_MIN + 1) }, agoraMs);
  ok(!venc.aberto && venc.titulo === 'O pedido venceu' && /Nada foi mandado/.test(venc.detalhe), 'pendente velho: a tela já diz que venceu, sem esperar o robô');
  ok(pedidoVencido({ status: 'pendente', criado_em: iso(VALIDADE_DO_PEDIDO_MIN - 1) }, agoraMs) === false
    && pedidoVencido({ status: 'enviando', criado_em: iso(999) }, agoraMs) === false, 'vence só o pendente, e só depois do prazo');
  ok(leituraDoPedido({ ...base, status: 'enviando' }, agoraMs).aberto, 'enviando: aberto');
  const env = leituraDoPedido({ ...base, status: 'enviado', resultado: {
    resumo: 'Mandado em 2 grupos; 1 já estava.', avisos: ['Linha sem grupo: Multimídia · Áudio'],
    grupos: [{ nome: 'Multimídia · Geral', situacao: 'postado' }, { nome: 'Multimídia · Foto', situacao: 'ja_estava' }, { nome: 'Multimídia · Edição', situacao: 'incerto' }],
  } }, agoraMs);
  ok(!env.aberto && env.titulo === 'Mandado em 2 grupos; 1 já estava' && env.tom === 'alerta', 'enviado com um incerto: alerta');
  ok(env.grupos.map(g => g.texto).join('|') === 'mandada agora|já estava no grupo|pode não ter saído: confira o grupo', 'cada grupo com o que aconteceu');
  ok(env.avisos.length === 1, 'os avisos do robô aparecem');
  ok(leituraDoPedido({ ...base, status: 'falhou', resultado: { resumo: 'O culto já começou.' } }, agoraMs).titulo === 'O culto já começou', 'falhou: o motivo do robô');
  ok(leituraDoPedido({ ...base, status: 'falhou', resultado: '<b>x</b>' }, agoraMs).titulo === 'Não deu', 'resultado estranho não vira texto da tela');
  ok(quandoSP('2026-10-26T20:59:00Z', agoraMs) === 'às 17:59' && quandoSP('2026-10-25T13:05:00Z', agoraMs) === 'em 25/10 às 10:05',
    'a hora do pedido em Brasília, com o dia quando não é hoje', quandoSP('2026-10-25T13:05:00Z', agoraMs));
  /* 02:30 UTC de 27/10 ainda é 26/10 em Brasília */
  ok(quandoSP('2026-10-27T02:30:00Z', Date.parse('2026-10-27T02:40:00Z')) === 'às 23:30', 'meia-noite de Brasília, não a de Londres');
  ok(dentroDaJanelaDoRobo('2026-10-26', '2026-10-26') && dentroDaJanelaDoRobo('2026-10-26', '2026-11-09')
    && !dentroDaJanelaDoRobo('2026-10-26', '2026-11-10') && !dentroDaJanelaDoRobo('2026-10-26', '2026-10-25'), 'a janela do robô: hoje até 14 dias');
  ok(roboNoAr({ segundos: 100 }) && !roboNoAr({ segundos: ROBO_LIGADO_ATE_S + 1 }) && !roboNoAr({ segundos: null }) && !roboNoAr(null), 'robô no ar: passou há menos de 3 minutos');
  const naoSai = leituraDoPedido({ ...base, status: 'pendente' }, agoraMs, false);
  ok(!naoSai.aberto && naoSai.titulo === 'Não vai sair' && /ficou fora do ar/.test(naoSai.detalhe), 'pendente com o robô fora do ar: "Não vai sair" (a mesma regra da rota), sem ficar esperando');
  const parou = leituraDoPedido({ ...base, status: 'enviando' }, agoraMs, false);
  ok(!parou.aberto && parou.titulo === 'Parou no meio' && /Confira os grupos/.test(parou.detalhe), 'mandando com o robô fora do ar: "Parou no meio", confira os grupos');
  ok(leituraDoPedido({ ...base, status: 'pendente', criado_em: iso(1), idade_s: VALIDADE_DO_PEDIDO_MIN * 60 + 5 }, agoraMs).titulo === 'O pedido venceu'
    && leituraDoPedido({ ...base, status: 'pendente', criado_em: iso(999), idade_s: 30 }, agoraMs).titulo === 'Esperando o robô',
    'a idade do pedido vem do banco, não do relógio do celular');
  const PED = (id, criado, atualizado, status, grupos) => ({ id, status, criado_em: criado, atualizado_em: atualizado, pedido_por: null, resultado: { resumo: 'x', grupos, avisos: [] } });
  const marcas = marcasDoRobo([
    PED('a', iso(50), iso(48), 'enviado', [{ nome: 'Louvor · Equipe', situacao: 'postado', linha: 'Grupo geral', ass: 'aaa' }, { nome: 'Louvor · Banda', situacao: 'incerto', linha: 'Louvor · Banda', ass: 'bbb' }]),
    PED('b', iso(10), iso(9), 'enviado', [{ nome: 'Louvor · Equipe', situacao: 'ja_estava', linha: 'Grupo geral', ass: 'aaa2' }, { nome: 'Louvor · Vocal', situacao: 'pulado', linha: 'Louvor · Vocal' }]),
    PED('c', iso(5), iso(5), 'pendente', [{ nome: 'Louvor · Vocal', situacao: 'postado', linha: 'Louvor · Vocal', ass: 'v' }]),
  ]);
  ok(JSON.stringify(marcas) === JSON.stringify({ 'Grupo geral': { em: iso(9), ass: 'aaa2' } }), 'as marcas do robô: o pedido mais novo que mandou a linha; incerto, pulado e pedido aberto não marcam', JSON.stringify(marcas));
  ok(JSON.stringify(mandadasAMao([{ gid: 'geral', nome: 'Grupo geral', ass: 'x1' }, { gid: 'gb', nome: 'Louvor · Banda', ass: 'y1' }, { gid: 'gv', nome: 'Louvor · Vocal', ass: 'z1' }],
    { geral: { ass: 'x1' }, gb: { ass: 'velha' } })) === JSON.stringify(['Grupo geral']), 'mandadas à mão neste aparelho, com a mensagem de agora');
  ok(/fora do ar/.test(erroDoPedido('ROBO_DESLIGADO')) && /pausado/.test(erroDoPedido('ROBO_PAUSADO')) && /sem WhatsApp/.test(erroDoPedido('ROBO_SEM_WHATSAPP')), 'os erros do robô fora, pausado e sem WhatsApp');
  const lg = limparResultado({ resumo: 'x', grupos: [{ nome: 'G', situacao: 'postado', linha: 'Grupo geral', ass: 'abc12' }, { nome: 'H', situacao: 'postado', ass: '<b>' }] });
  ok(lg.grupos[0].linha === 'Grupo geral' && lg.grupos[0].ass === 'abc12' && !('ass' in lg.grupos[1]), 'a linha e a assinatura passam; assinatura torta, não');
  ok(/14 dias/.test(erroDoPedido('DATA_FORA')) && /grupos/.test(erroDoPedido('SEM_GRUPOS')) && /Tente de novo/.test(erroDoPedido('???')), 'os erros do pedido em português');
}

console.log(`robo-pedidos: ${feitas - falhas}/${feitas}`);
if (falhas) process.exit(1);
