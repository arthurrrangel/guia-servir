/* AS QUATRO CONTAGENS DO MOTOR TÊM QUE DAR O MESMO DE ANTES.

   19/09/2026. `cargaJanela`, `escalasNoMes`, `furosJanela` e `diasDesdeUltima`
   respondiam varrendo o Estado inteiro através de `escalacoesDe()` — todos os
   dias, todos os postos, mais uma ordenação — para falar de UMA pessoa. Como
   `candidatos()` chama três delas por pessoa, e `gerarDia` chama `candidatos`
   duas vezes por posto, o trabalho crescia com (dias × postos) × (postos ×
   pessoas). Medido com 6 meses de histórico: 2.968 ms para 40 postos e 25
   pessoas, que num Android mediano é tela morta por 12 a 24 segundos.

   Reescrevi as quatro para olhar só a janela que elas precisam, e
   `diasDesdeUltima` para varrer de trás para frente e parar no primeiro
   achado. Ficou 223 ms — treze vezes mais rápido — com a mesma escala saindo
   do outro lado.

   O PERIGO DESSE TIPO DE MUDANÇA é que ela é invisível: uma contagem que erra
   por um não quebra nada na hora, só muda QUEM é sorteado, e ninguém relaciona
   o sorteio esquisito de novembro com uma otimização de setembro.

   Então este arquivo não testa "o número parece certo". Ele guarda a
   implementação ANTIGA, ingênua, palavra por palavra, e exige que as duas
   concordem em estados gerados ao acaso — incluindo os casos chatos: pessoa
   sem nenhuma escala, dois postos no mesmo dia, furo, dia exatamente na borda
   da janela, e mês sem nenhum dia carregado.

   Roda com `npm test`. */

import * as E from '../lib/engine.ts';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

/* ------------------------------------------------ a implementação ANTIGA
   Copiada do que estava no ar até 19/09/2026. Ela é a referência: se as duas
   divergirem, é a nova que está errada até prova em contrário. */
const d2 = (n) => String(n).padStart(2, '0');
const velhaEscalacoesDe = (S, vid) => {
  const out = [];
  for (const [data, dia] of Object.entries(S.escalas))
    for (const [fn, slot] of Object.entries(dia.slots || {}))
      if (slot?.vid === vid) out.push({ data, funcao: fn, status: slot.status || 'pendente' });
  return out.sort((a, b) => (a.data < b.data ? -1 : 1));
};
const velhaCargaJanela = (S, vid, ref, dias) => {
  const ini = E.addDias(ref, -dias);
  return new Set(velhaEscalacoesDe(S, vid).filter(e => e.data >= ini && e.data <= ref).map(e => e.data)).size;
};
const velhaEscalasNoMes = (S, vid, ano, mes) =>
  new Set(velhaEscalacoesDe(S, vid).filter(e => e.data.startsWith(`${ano}-${d2(mes)}`)).map(e => e.data)).size;
const velhaFurosJanela = (S, vid, ref, dias) => {
  const ini = E.addDias(ref, -dias);
  return velhaEscalacoesDe(S, vid).filter(e => e.data >= ini && e.data <= ref && e.status === 'furou').length;
};
const velhaDiasDesdeUltima = (S, vid, ref, funcao) => {
  const l = velhaEscalacoesDe(S, vid).filter(e => e.data < ref && (!funcao || e.funcao === funcao));
  return l.length ? E.diffDias(l[l.length - 1].data, ref) : 9999;
};

/* ------------------------------------------------------ estados ao acaso
   Semente fixa: um teste que muda de resultado entre execuções não serve de
   prova de nada. */
let semente = 20260919;
const rnd = () => (semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648;
const escolhe = (arr) => arr[Math.floor(rnd() * arr.length)];

function estadoAoAcaso(nPostos, nPessoas, nDias) {
  const S = E.estadoVazio();
  S.funcoes = Array.from({ length: nPostos }, (_, i) => ({ nome: 'P' + i, ordem: i, ativa: true, simultanea: true }));
  S.voluntarios = Array.from({ length: nPessoas }, (_, i) => ({
    id: 'v' + i, nome: 'Pessoa ' + i, ativo: true, funcoes: {}, indisponivel: [],
  }));
  /* dias espalhados por ~8 meses, para cair dentro e fora de qualquer janela */
  const base = new Date(Date.UTC(2026, 1, 1));
  for (let i = 0; i < nDias; i++) {
    const d = new Date(base.getTime() + Math.floor(rnd() * 250) * 86400000).toISOString().slice(0, 10);
    const dia = E.garantirDia(S, d);
    for (const f of S.funcoes) {
      if (rnd() < 0.45) continue;
      dia.slots[f.nome] = {
        vid: escolhe(S.voluntarios).id,
        status: escolhe(['pendente', 'confirmado', 'recusado', 'furou']),
        fixo: rnd() < 0.2,
      };
    }
  }
  return S;
}

/* ------------------------------------------------------------- a prova */
const REFS = ['2026-01-01', '2026-04-05', '2026-06-14', '2026-09-19', '2026-12-31'];
const JANELAS = [0, 1, 7, 30, 90, 200, 9999];

for (const [postos, pessoas, dias] of [[3, 4, 6], [7, 9, 20], [12, 6, 40], [1, 2, 3], [5, 5, 0]]) {
  const S = estadoAoAcaso(postos, pessoas, dias);
  for (const v of S.voluntarios) {
    for (const ref of REFS) {
      for (const j of JANELAS) {
        ok(E.cargaJanela(S, v.id, ref, j) === velhaCargaJanela(S, v.id, ref, j),
          `cargaJanela ${v.id} ${ref} ${j}`,
          `nova=${E.cargaJanela(S, v.id, ref, j)} velha=${velhaCargaJanela(S, v.id, ref, j)}`);
        ok(E.furosJanela(S, v.id, ref, j) === velhaFurosJanela(S, v.id, ref, j),
          `furosJanela ${v.id} ${ref} ${j}`,
          `nova=${E.furosJanela(S, v.id, ref, j)} velha=${velhaFurosJanela(S, v.id, ref, j)}`);
      }
      ok(E.diasDesdeUltima(S, v.id, ref) === velhaDiasDesdeUltima(S, v.id, ref),
        `diasDesdeUltima geral ${v.id} ${ref}`,
        `nova=${E.diasDesdeUltima(S, v.id, ref)} velha=${velhaDiasDesdeUltima(S, v.id, ref)}`);
      for (const f of S.funcoes) {
        ok(E.diasDesdeUltima(S, v.id, ref, f.nome) === velhaDiasDesdeUltima(S, v.id, ref, f.nome),
          `diasDesdeUltima ${f.nome} ${v.id} ${ref}`,
          `nova=${E.diasDesdeUltima(S, v.id, ref, f.nome)} velha=${velhaDiasDesdeUltima(S, v.id, ref, f.nome)}`);
      }
    }
    for (const [ano, mes] of [[2026, 1], [2026, 2], [2026, 6], [2026, 9], [2026, 10], [2026, 12], [2025, 12]]) {
      ok(E.escalasNoMes(S, v.id, ano, mes) === velhaEscalasNoMes(S, v.id, ano, mes),
        `escalasNoMes ${v.id} ${ano}-${mes}`,
        `nova=${E.escalasNoMes(S, v.id, ano, mes)} velha=${velhaEscalasNoMes(S, v.id, ano, mes)}`);
    }
  }
}

/* --------------------------------- a premissa do cache, dita em voz alta

   A lista de dias fica guardada e só é refeita quando o NÚMERO de dias muda.
   Isso vale porque dia é criado e nunca apagado. Se alguém um dia apagar um
   dia do Estado, a premissa cai — e este teste é onde isso aparece. */
{
  const S = estadoAoAcaso(3, 3, 5);
  const antes = E.diasDesdeUltima(S, 'v0', '2026-12-31');
  const dia = E.garantirDia(S, '2026-12-25');
  dia.slots['P0'] = { vid: 'v0', status: 'pendente', fixo: false };
  const depois = E.diasDesdeUltima(S, 'v0', '2026-12-31');
  ok(depois === 6, 'dia novo entra na conta na hora (o cache se refaz)', `antes=${antes} depois=${depois}`);

  /* e mexer NO SLOT de um dia que já existe também vale na hora */
  dia.slots['P0'] = { vid: 'v1', status: 'pendente', fixo: false };
  ok(E.diasDesdeUltima(S, 'v0', '2026-12-31') === antes,
    'tirar a pessoa do slot volta a resposta de antes',
    `virou ${E.diasDesdeUltima(S, 'v0', '2026-12-31')}, esperava ${antes}`);
  ok(E.diasDesdeUltima(S, 'v1', '2026-12-31') === 6, 'e quem entrou no slot conta na hora');
}

/* ---------------------------------------- o cache não vaza para o JSON
   `ponte-janela` compara Estados montados por JSON.stringify. Um campo novo
   enumerável ali faria aquele teste passar a comparar lixo. */
{
  const S = estadoAoAcaso(2, 2, 3);
  E.diasDesdeUltima(S, 'v0', '2026-09-19');
  ok(!JSON.stringify(S).includes('_diasOrd'), 'o cache de dias não aparece no JSON do Estado');
  ok(Object.keys(S).every(k => k[0] !== '_'), 'nem nas chaves enumeráveis', Object.keys(S).join(','));
}

console.log(falhas ? `\nengine-contagens: ${falhas} falha(s) em ${feitas}` : `\nengine-contagens: ${feitas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
