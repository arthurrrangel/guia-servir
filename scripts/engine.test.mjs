import * as E from '../lib/engine.ts';

let n = 0, f = 0;
const ok = (c, nome, extra) => { n++; if (c) console.log('  PASS  ' + nome); else { f++; console.log('  FAIL  ' + nome + (extra ? '\n        ' + extra : '')); } };

const FN = [
  { nome: 'PROJEÇÃO', simultanea: true, ordem: 1, ativa: true },
  { nome: 'ILUMINAÇÃO', simultanea: true, ordem: 2, ativa: true },
  { nome: 'EDIÇÃO', simultanea: false, ordem: 3, ativa: true },
  { nome: 'FOTO', simultanea: true, ordem: 4, ativa: true },
  { nome: 'FILMAGEM', simultanea: true, ordem: 5, ativa: true },
  { nome: 'HEAD', simultanea: true, ordem: 6, ativa: true, tipos: ['domingo'] },
  { nome: 'TRANSMISSÃO', simultanea: true, ordem: 7, ativa: true, tipos: ['domingo'] },
];
const v = (nome, funcoes, limite = 2, indisp = []) =>
  ({ id: 'id_' + nome.toLowerCase(), nome, ativo: true, limiteMes: limite, funcoes, indisponivel: indisp });

function base(vols, funcoes = FN) {
  const S = E.estadoVazio();
  S.funcoes = JSON.parse(JSON.stringify(funcoes));
  S.voluntarios = vols;
  return S;
}
const TIME = () => [
  v('Lele', { 'PROJEÇÃO': 'titular' }), v('Will', { 'ILUMINAÇÃO': 'titular' }),
  v('Duda', { 'EDIÇÃO': 'titular' }), v('Joao', { 'FOTO': 'titular', 'FILMAGEM': 'titular' }),
  v('Nadia', { 'FILMAGEM': 'titular' }), v('Arthur', { 'HEAD': 'titular' }),
  v('Tonho', { 'TRANSMISSÃO': 'titular' }),
];

console.log('\n1. Caso João Victor (FOTO + FILMAGEM no mesmo domingo)');
{
  const S = base(TIME());
  const D = E.domingosDoMes(2026, 8)[1];
  E.gerarDia(S, D);
  const fns = Object.entries(S.escalas[D].slots).filter(([, s]) => s.vid === 'id_joao').map(([f]) => f);
  ok(fns.length <= 1, 'não escala a mesma pessoa em duas funções simultâneas', 'ficou em ' + fns.join(','));
  ok(!E.problemas(S, D).some(p => p.grau === 'erro' && p.texto.includes('ao mesmo tempo')), 'sem conflito de horário');
}

console.log('\n2. Sem gente vira vaga, nunca duplicação');
{
  const S = base([v('Unico', { 'FOTO': 'titular', 'FILMAGEM': 'titular', 'HEAD': 'titular' })]);
  const D = E.domingosDoMes(2026, 8)[0];
  const r = E.gerarDia(S, D);
  ok(Object.values(S.escalas[D].slots).filter(s => s.vid === 'id_unico').length === 1, 'ocupa exatamente 1 slot');
  ok(r.vagas.length === 6, '6 funções ficam abertas', r.vagas.join(','));
  ok(E.msgEscala(S, D).includes('PRECISO DE ALGUÉM'), 'mensagem expõe o buraco');
}

console.log('\n3. Função pós-culto pode acumular');
{
  const S = base([v('Duda', { 'FOTO': 'titular', 'EDIÇÃO': 'titular' })]);
  const D = E.domingosDoMes(2026, 8)[0];
  const d = E.garantirDia(S, D);
  d.slots['FOTO'] = { vid: 'id_duda', status: 'pendente', fixo: true };
  d.slots['EDIÇÃO'] = { vid: 'id_duda', status: 'pendente', fixo: true };
  const p = E.problemas(S, D);
  ok(!p.some(x => x.texto.includes('ao mesmo tempo')), 'FOTO + EDIÇÃO não é erro');
  ok(p.some(x => x.grau === 'aviso'), 'mas é sinalizado como aviso');
}

console.log('\n4. Indisponibilidade');
{
  const doms = E.domingosDoMes(2026, 8);
  const S = base([...TIME(), v('Ana', { 'PROJEÇÃO': 'titular' })]);
  S.voluntarios.find(x => x.nome === 'Lele').indisponivel = [doms[0]];
  E.gerarDia(S, doms[0]);
  ok(S.escalas[doms[0]].slots['PROJEÇÃO'].vid === 'id_ana', 'quem avisou não é escalado, outro assume');
  E.gerarDia(S, doms[1]);
  ok(['id_lele', 'id_ana'].includes(S.escalas[doms[1]].slots['PROJEÇÃO'].vid), 'volta a ser elegível no domingo seguinte');
}

console.log('\n5. Teto mensal');
{
  const S = base([v('A', { 'PROJEÇÃO': 'titular' }, 2), v('B', { 'PROJEÇÃO': 'reserva' }, 4)]);
  const doms = E.domingosDoMes(2026, 8);
  for (const d of doms) E.gerarDia(S, d);
  ok(E.escalasNoMes(S, 'id_a', 2026, 8) <= 2, 'A não passa de 2');
  ok(E.escalasNoMes(S, 'id_b', 2026, 8) <= 4, 'B não passa de 4');
}

console.log('\n6. Carga equilibrada');
{
  const S = base([v('P1', { 'PROJEÇÃO': 'titular' }, 5), v('P2', { 'PROJEÇÃO': 'titular' }, 5), v('P3', { 'PROJEÇÃO': 'titular' }, 5)]);
  const doms = [...E.domingosDoMes(2026, 8), ...E.domingosDoMes(2026, 9)];
  for (const d of doms) E.gerarDia(S, d);
  const c = ['id_p1', 'id_p2', 'id_p3'].map(id => Object.values(S.escalas).filter(x => x.slots['PROJEÇÃO']?.vid === id).length);
  ok(Math.max(...c) - Math.min(...c) <= 1, 'diferença máxima de 1 escala entre os titulares', c.join('/'));
}

console.log('\n7. Titular antes de reserva, treino nunca sozinho');
{
  const S = base([v('Tit', { 'FOTO': 'titular' }, 5), v('Res', { 'FOTO': 'reserva' }, 5)]);
  const D = E.domingosDoMes(2026, 8)[0];
  E.gerarDia(S, D);
  ok(S.escalas[D].slots['FOTO'].vid === 'id_tit', 'titular primeiro');
  const S2 = base([v('Novato', { 'FOTO': 'treino' })]);
  const r = E.gerarDia(S2, D);
  ok(!S2.escalas[D].slots['FOTO'], 'aprendiz não preenche sozinho');
  ok(r.vagas.includes('FOTO'), 'e a vaga é reportada');
}

console.log('\n8. Cadeado');
{
  const S = base([...TIME(), v('Extra', { 'PROJEÇÃO': 'titular' })]);
  const D = E.domingosDoMes(2026, 8)[0];
  E.garantirDia(S, D).slots['PROJEÇÃO'] = { vid: 'id_extra', status: 'confirmado', fixo: true };
  E.gerarDia(S, D);
  ok(S.escalas[D].slots['PROJEÇÃO'].vid === 'id_extra', 'travado não é sobrescrito');
  ok(S.escalas[D].slots['PROJEÇÃO'].status === 'confirmado', 'confirmação preservada');
}

console.log('\n9. Datas e mensagem');
{
  const S = base(TIME());
  const doms = E.domingosDoMes(2026, 8);
  ok(doms.length === 5 && doms[0] === '2026-08-02', 'agosto/2026: 5 domingos começando em 02/08');
  ok(E.proximoDomingo('2026-08-05') === '2026-08-09', 'próximo domingo depois de uma quarta');
  ok(E.proximoDomingo('2026-08-09') === '2026-08-09', 'se hoje é domingo, é hoje');
  E.gerarDia(S, doms[0]);
  const m = E.msgEscala(S, doms[0]);
  ok(m.startsWith('Boa noite galera') && m.includes('Escala de domingo (02/08)'), 'formato do aviso preservado');
  ok(FN.every(f => m.includes(f.nome)), 'todas as funções na mensagem');
}

console.log('\n10. Plantão livre');
{
  const S = base([...TIME(), v('Reserva1', { 'FOTO': 'reserva' })]);
  const D = E.domingosDoMes(2026, 8)[0];
  E.gerarDia(S, D);
  const usados = new Set(Object.values(S.escalas[D].slots).map(s => s.vid));
  ok(S.escalas[D].plantao.every(p => !usados.has(p)), 'plantonista não está escalado no mesmo dia');
}

console.log('\n11. Mês fechado com pool apertado (14 pessoas, teto 4, domingos + Follow)');
{
  const S = base([
    v('Lele', { 'PROJEÇÃO': 'titular' }), v('Bia', { 'PROJEÇÃO': 'reserva', 'EDIÇÃO': 'titular' }),
    v('Will', { 'ILUMINAÇÃO': 'titular' }), v('Rafa', { 'ILUMINAÇÃO': 'reserva', 'PROJEÇÃO': 'reserva' }),
    v('Duda', { 'EDIÇÃO': 'titular' }), v('Joao', { 'FOTO': 'titular', 'FILMAGEM': 'reserva' }),
    v('Nadia', { 'FILMAGEM': 'titular' }), v('Pedro', { 'FILMAGEM': 'titular', 'FOTO': 'reserva' }),
    v('Mari', { 'FOTO': 'titular' }), v('Arthur', { 'HEAD': 'titular', 'TRANSMISSÃO': 'reserva' }),
    v('Tonho', { 'TRANSMISSÃO': 'titular' }), v('Lucas', { 'TRANSMISSÃO': 'reserva', 'ILUMINAÇÃO': 'reserva' }),
    v('Sara', { 'HEAD': 'reserva', 'PROJEÇÃO': 'reserva' }), v('Caio', { 'HEAD': 'reserva', 'EDIÇÃO': 'reserva' }),
  ].map(x => ({ ...x, limiteMes: 4 })));
  const r = E.gerarMes(S, 2026, 9);
  const vagas = r.reduce((a, x) => a + x.vagas.length, 0);
  ok(vagas === 0, 'mês inteiro preenchido, nenhuma vaga aberta', 'vagas: ' + vagas);
  let erros = 0;
  for (const d of E.cultosDoMes(2026, 9)) erros += E.problemas(S, d).filter(p => p.grau === 'erro').length;
  ok(erros === 0, 'nenhum erro no mês inteiro');
  const cargas = S.voluntarios.map(x => E.escalasNoMes(S, x.id, 2026, 9));
  ok(Math.max(...cargas) <= 4, 'ninguém passa do teto de 4', 'máx ' + Math.max(...cargas));
  console.log('        ' + S.voluntarios.map((x, i) => `${x.nome}:${cargas[i]}`).join('  '));
}

console.log('\n12. Resumo do dia dirige o semáforo do painel');
{
  const S = base(TIME());
  const D = E.domingosDoMes(2026, 8)[0];
  E.gerarDia(S, D);
  ok(E.resumoDia(S, D).situacao === 'atencao', 'recém montado = amarelo (ninguém respondeu)');
  for (const s of Object.values(S.escalas[D].slots)) s.status = 'confirmado';
  ok(E.resumoDia(S, D).situacao === 'ok', 'todos confirmados = verde');
  S.escalas[D].slots['HEAD'].status = 'recusado';
  ok(E.resumoDia(S, D).situacao === 'critico', 'alguém não pode = vermelho');
}


console.log('\n13. AUDITORIA: acúmulo no mesmo domingo conta 1 no teto mensal');
{
  const S = base([v('Duda', { 'FOTO': 'titular', 'EDIÇÃO': 'titular' }, 2)]);
  const D = E.domingosDoMes(2026, 8)[1];
  const dia = E.garantirDia(S, D);
  dia.slots['FOTO'] = { vid: 'id_duda', status: 'pendente', fixo: true };
  dia.slots['EDIÇÃO'] = { vid: 'id_duda', status: 'pendente', fixo: true };
  ok(E.escalasNoMes(S, 'id_duda', 2026, 8) === 1, 'FOTO+EDIÇÃO no mesmo dia = 1 domingo no teto');
  ok(E.cargaJanela(S, 'id_duda', E.domingosDoMes(2026, 8)[4], 90) === 1, 'carga também conta por dia');
}

console.log('\n14. AUDITORIA: reparo nunca cria duas simultâneas');
{
  const S = base([
    v('P', { 'FOTO': 'titular', 'EDIÇÃO': 'titular', 'FILMAGEM': 'titular' }, 5),
    v('Q', { 'EDIÇÃO': 'reserva' }, 5),
  ]);
  const D = E.domingosDoMes(2026, 8)[1];
  const dia = E.garantirDia(S, D);
  dia.slots['EDIÇÃO'] = { vid: 'id_p', status: 'pendente', fixo: false };
  dia.slots['FOTO'] = { vid: 'id_p', status: 'pendente', fixo: false };
  E.repararDia(S, D);
  const errosDuros = E.problemas(S, D).filter(p => p.texto.includes('ao mesmo tempo'));
  ok(errosDuros.length === 0, 'reparo com pessoa em FOTO+EDIÇÃO não gera FOTO+FILMAGEM', JSON.stringify(E.problemas(S, D)));
}

console.log('\n15. AUDITORIA: plantão nunca é aprendiz puro');
{
  const S = base([v('Novato', { 'FOTO': 'treino' }), v('Vet', { 'FOTO': 'titular' })]);
  const D = E.domingosDoMes(2026, 8)[0];
  const p = E.sugerirPlantao(S, D, 2);
  ok(!p.includes('id_novato'), 'quem só está aprendendo não vira plantão');
}

console.log('\n16. AUDITORIA: função desativada não bloqueia nem renasce');
{
  const S = base([v('P', { 'FOTO': 'titular' }, 5), v('Q', { 'FOTO': 'reserva' }, 5)],
    [...FN.map(f => ({ ...f })), { nome: 'ANTIGA', simultanea: true, ordem: 99, ativa: false }]);
  S.voluntarios[0].funcoes['ANTIGA'] = 'titular';
  S.voluntarios[1].funcoes['ANTIGA'] = 'reserva';
  const D = E.domingosDoMes(2026, 8)[1];
  E.garantirDia(S, D).slots['ANTIGA'] = { vid: 'id_p', status: 'pendente', fixo: false };
  E.gerarDia(S, D);
  ok(!S.escalas[D].slots['ANTIGA'], 'slot de função desativada é descartado');
  ok(S.escalas[D].slots['FOTO']?.vid === 'id_p', 'a pessoa liberada volta ao rodízio normal');
}

console.log('\n17. AUDITORIA: recusa não volta no re-sorteio');
{
  const S = base([v('A', { 'PROJEÇÃO': 'titular' }, 5), v('B', { 'PROJEÇÃO': 'reserva' }, 5)]);
  const D = E.domingosDoMes(2026, 8)[1];
  E.gerarDia(S, D);
  ok(S.escalas[D].slots['PROJEÇÃO'].vid === 'id_a', 'titular escalado primeiro');
  S.escalas[D].slots['PROJEÇÃO'].status = 'recusado';
  E.gerarDia(S, D);
  ok(S.escalas[D].slots['PROJEÇÃO'].vid === 'id_b', 'quem recusou o dia não é re-escalado nele');
  const D2 = E.domingosDoMes(2026, 8)[2];
  E.gerarDia(S, D2);
  ok(S.escalas[D2].slots['PROJEÇÃO'].vid === 'id_a', 'mas continua elegível nos outros domingos');
}

console.log('\n18. AUDITORIA: gerarMes com corte não toca o passado');
{
  const S = base([v('A', { 'FOTO': 'titular' }, 2), v('B', { 'FOTO': 'reserva' }, 2), v('C', { 'FOTO': 'reserva' }, 2)]);
  const doms = E.domingosDoMes(2026, 8); // 02,09,16,23,30
  const dia0 = E.garantirDia(S, doms[0]);
  dia0.slots['FOTO'] = { vid: 'id_a', status: 'furou', fixo: false };
  const antes = JSON.stringify(S.escalas[doms[0]]);
  E.gerarMes(S, 2026, 8, doms[1]); // corte: só de 09/08 em diante
  ok(JSON.stringify(S.escalas[doms[0]]) === antes, 'domingo passado intocado (furou preservado)');
  const deA = E.escalasNoMes(S, 'id_a', 2026, 8);
  ok(deA <= 2, 'teto respeita o que já aconteceu no passado', 'A com ' + deA);
}

console.log('\n19. AUDITORIA: furou pinta o dia de vermelho');
{
  const S = base(TIME());
  const D = E.domingosDoMes(2026, 8)[1];
  E.gerarDia(S, D);
  for (const sl of Object.values(S.escalas[D].slots)) sl.status = 'confirmado';
  S.escalas[D].slots['HEAD'].status = 'furou';
  const r = E.resumoDia(S, D);
  ok(r.situacao === 'critico' && r.furos === 1, 'domingo com furo nunca aparece verde', JSON.stringify(r));
}


console.log('\n20. AUDITORIA: confirmação vira cadeado — re-sortear não desmancha');
{
  const S = base(TIME());
  const D = E.domingosDoMes(2026, 8)[1];
  E.gerarDia(S, D);
  const quem = S.escalas[D].slots['PROJEÇÃO'].vid;
  S.escalas[D].slots['PROJEÇÃO'].status = 'confirmado';
  S.escalas[D].slots['ILUMINAÇÃO'].status = 'confirmado';
  const outro = S.escalas[D].slots['ILUMINAÇÃO'].vid;
  E.gerarDia(S, D);   // líder aperta "Sortear" de novo
  ok(S.escalas[D].slots['PROJEÇÃO']?.vid === quem, 'quem confirmou continua no lugar');
  ok(S.escalas[D].slots['PROJEÇÃO']?.status === 'confirmado', 'a confirmação não vira "não respondeu"');
  ok(S.escalas[D].slots['ILUMINAÇÃO']?.vid === outro, 'segunda confirmação também sobrevive');
}

console.log('\n21. AUDITORIA: remanejamento não arranca quem confirmou de outro domingo');
{
  // A é a ÚNICA de PROJEÇÃO; limite 1 no mês. Confirma o 1º domingo.
  // Ao montar o mês, o reparo não pode tirar A do domingo confirmado para
  // tapar o buraco do 2º domingo.
  const FN2 = [{ nome: 'PROJEÇÃO', simultanea: true, ordem: 1, ativa: true }];
  const S = base([v('Ana', { 'PROJEÇÃO': 'titular' }, 1)], FN2);
  const doms = E.domingosDoMes(2026, 8);
  E.gerarDia(S, doms[0]);
  S.escalas[doms[0]].slots['PROJEÇÃO'].status = 'confirmado';
  E.gerarMes(S, 2026, 8, doms[0]);
  ok(S.escalas[doms[0]].slots['PROJEÇÃO']?.vid === 'id_ana', 'Ana continua no domingo que confirmou');
  ok(S.escalas[doms[0]].slots['PROJEÇÃO']?.status === 'confirmado', 'status preservado depois de montar o mês');
}

console.log('\n22. AUDITORIA: dia de outro ministério não vira "escala vazia" nossa');
{
  /* ponte.ts importa './engine' sem extensão (o bundler resolve, o node não).
     Geramos uma cópia ao lado, com o import explícito, e testamos o código real. */
  const { writeFileSync, rmSync, readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../lib/ponte.ts', import.meta.url), 'utf8')
    // node só apaga tipos; import de tipo tem que virar `import type`
    .replace(/import \{[^}]*\} from '\.\/engine';/,
      "import { CONFIG_PADRAO, estadoVazio, garantirDia } from './engine.ts';\n"
      + "import type { Estado, Nivel, Status } from './engine.ts';");
  const tmp = new URL('../lib/__ponte.tmp.ts', import.meta.url);
  writeFileSync(tmp, src);
  const { montarEstado, paraSalvarDia } = await import(tmp.href);
  rmSync(tmp);
  const S = montarEstado({
    funcoes: [{ id: 'f1', nome: 'PROJEÇÃO', simultanea: true, ordem: 1, ativa: true }],
    voluntarios: [{ id: 'v1', nome: 'Ana', ativo: true, limite_mes: 2, token: 't' }],
    habilidades: [], indisponibilidades: [],
    cultos: [{ id: 'c1', data: '2026-09-06' }, { id: 'c2', data: '2026-09-13' }],
    escalacoes: [{ culto_id: 'c1', funcao_id: 'f1', voluntario_id: 'v1', status: 'pendente', fixo: false }],
    plantoes: [], recados: [], config: { dados: {} }, equipe: 'Mídia',
  });
  ok(!!S.escalas['2026-09-06'], 'o domingo que a equipe montou existe');
  ok(!S.escalas['2026-09-13'], 'o domingo que só outro ministério usou NÃO aparece como nosso');
  ok(S.equipe === 'Mídia', 'o estado sabe de qual ministério é');

  const p = paraSalvarDia(S, '2026-09-06', 'eq1');
  ok(p.p_equipe === 'eq1', 'salvar_dia leva o ministério junto');
  let erro = '';
  try { paraSalvarDia(S, '2026-09-06', ''); } catch (e) { erro = e.message; }
  ok(!!erro, 'sem ministério, salvar_dia se recusa a rodar');
}


console.log('\n23. AUDITORIA: plantão só para curinga (2+ funções, sem treino)');
{
  const FN2 = [
    { nome: 'F1', simultanea: true, ordem: 1, ativa: true },
    { nome: 'F2', simultanea: true, ordem: 2, ativa: true },
  ];
  const S = base([
    v('Ana', { 'F1': 'titular' }),                     // 1 função -> não
    v('Bruno', { 'F1': 'titular', 'F2': 'reserva' }),  // 2 -> sim
    v('Carla', { 'F1': 'treino', 'F2': 'treino' }),    // 2 mas treino -> não
    v('Duda', { 'F1': 'reserva', 'F2': 'reserva' }),   // 2 reserva -> sim
  ], FN2);
  const D = E.domingosDoMes(2026, 8)[1];
  const p = E.sugerirPlantao(S, D, 4);
  ok(p.includes('id_bruno') && p.includes('id_duda'), 'curinga (2+ titular/reserva) entra no plantão', JSON.stringify(p));
  ok(!p.includes('id_ana'), 'quem sabe só 1 função NÃO vira plantão', JSON.stringify(p));
  ok(!p.includes('id_carla'), 'quem só tem treino NÃO vira plantão', JSON.stringify(p));
}

console.log('\n24. AUDITORIA: marca de "1ª vez" sobrevive ao ir e voltar do banco');
{
  const { readFileSync, writeFileSync, rmSync } = await import('node:fs');
  const src = readFileSync(new URL('../lib/ponte.ts', import.meta.url), 'utf8')
    .replace(/import \{[^}]*\} from '\.\/engine';/,
      "import { CONFIG_PADRAO, estadoVazio, garantirDia } from './engine.ts';\n"
      + "import type { Estado, Nivel, Status } from './engine.ts';");
  const tmp = new URL('../lib/__ponte2.tmp.ts', import.meta.url);
  writeFileSync(tmp, src);
  const { montarEstado, paraSalvarDia } = await import(tmp.href);
  rmSync(tmp);

  const S = montarEstado({
    funcoes: [{ id: 'f1', nome: 'PROJEÇÃO', simultanea: true, ordem: 1, ativa: true }],
    voluntarios: [{ id: 'v1', nome: 'Ana', ativo: true, limite_mes: 2, token: 't' }],
    habilidades: [], indisponibilidades: [],
    cultos: [{ id: 'c1', data: '2026-09-06' }],
    escalacoes: [{ culto_id: 'c1', funcao_id: 'f1', voluntario_id: 'v1', status: 'pendente', fixo: false, primeira_vez: true }],
    plantoes: [], recados: [], config: { dados: {} }, equipe: 'Mídia',
  });
  ok(S.escalas['2026-09-06'].slots['PROJEÇÃO'].primeiraVez === true, 'lê primeira_vez do banco para o slot');
  const salvar = paraSalvarDia(S, '2026-09-06', 'eq1');
  ok(salvar.p_slots[0].primeira_vez === true, 'manda primeira_vez de volta pro banco');
}

/* ---- 25. respostas de disponibilidade (o painel do líder depende disto) ---- */
{
  const S = base([
    v('Ana', { 'PROJEÇÃO': 'titular' }),
    v('Bia', { 'PROJEÇÃO': 'titular' }),
    v('Cau', { 'PROJEÇÃO': 'titular' }),
  ]);
  const D = '2026-09-06';
  S.voluntarios[0].disponivel = [D];          // disse que pode
  S.voluntarios[1].indisponivel = [D];        // disse que não
  // Cau não respondeu nada

  ok(E.respostaDe(S.voluntarios[0], D) === 'posso', 'quem marcou posso aparece como posso');
  ok(E.respostaDe(S.voluntarios[1], D) === 'nao', 'quem marcou não posso aparece como nao');
  ok(E.respostaDe(S.voluntarios[2], D) === 'mudo', 'quem não respondeu aparece como mudo');

  const r = E.respostasDoDia(S, D);
  ok(r.posso.length === 1 && r.nao.length === 1 && r.mudo.length === 1,
     'resumo do dia separa os três grupos', `posso=${r.posso.length} nao=${r.nao.length} mudo=${r.mudo.length}`);
  ok(r.total === 3, 'total conta só os ativos');

  // "não posso" vence: o eu_disponibilidade grava nas duas tabelas quando é 'nao'
  S.voluntarios[0].indisponivel = [D];
  ok(E.respostaDe(S.voluntarios[0], D) === 'nao', 'se está nas duas listas, vale o não posso');

  // pessoa pausada não entra no resumo
  S.voluntarios[2].ativo = false;
  ok(E.respostasDoDia(S, D).total === 2, 'pessoa pausada sai do resumo de disponibilidade');
}


/* ---- 26. compromisso: desmarque tardio, ficha e quem pode cobrir ---- */
{
  const S = base([
    v('Ana', { 'PROJEÇÃO': 'titular' }),
    v('Bia', { 'PROJEÇÃO': 'titular' }),
    v('Cau', { 'PROJEÇÃO': 'titular' }),
    v('Dan', { 'PROJEÇÃO': 'treino' }),
  ]);
  const D = '2026-09-06';                       // culto às 18h -03
  E.garantirDia(S, D);
  const culto = Date.parse(`${D}T18:00:00-03:00`);
  const hAntes = (h) => new Date(culto - h * 3600000).toISOString();

  // avisou com 5 dias: não é tardio
  S.escalas[D].slots['PROJEÇÃO'] = { vid: S.voluntarios[0].id, status: 'recusado', fixo: false, respondidoEm: hAntes(120) };
  ok(E.desmarqueTardio(S, D, S.escalas[D].slots['PROJEÇÃO']) === false, 'avisar com 5 dias não é tardio');

  // avisou faltando 3 horas: é tardio
  S.escalas[D].slots['PROJEÇÃO'].respondidoEm = hAntes(3);
  ok(E.desmarqueTardio(S, D, S.escalas[D].slots['PROJEÇÃO']) === true, 'desmarcar faltando 3h é tardio');

  // exatamente no limite de 48h não conta como tardio
  S.escalas[D].slots['PROJEÇÃO'].respondidoEm = hAntes(48);
  ok(E.desmarqueTardio(S, D, S.escalas[D].slots['PROJEÇÃO']) === false, 'exatamente 48h não é tardio');

  // sem respondido_em não dá para julgar
  S.escalas[D].slots['PROJEÇÃO'].respondidoEm = null;
  ok(E.desmarqueTardio(S, D, S.escalas[D].slots['PROJEÇÃO']) === false, 'sem horário registrado não acusa tardio');

  // quem confirmou nunca é tardio
  S.escalas[D].slots['PROJEÇÃO'] = { vid: S.voluntarios[0].id, status: 'confirmado', fixo: false, respondidoEm: hAntes(1) };
  ok(E.desmarqueTardio(S, D, S.escalas[D].slots['PROJEÇÃO']) === false, 'confirmado não conta como desmarque');

  // ficha da pessoa
  S.escalas[D].slots['PROJEÇÃO'] = { vid: S.voluntarios[0].id, status: 'recusado', fixo: false, respondidoEm: hAntes(2) };
  const f = E.fichaDe(S, S.voluntarios[0].id);
  ok(f.tardios === 1 && f.avisouAntes === 0, 'ficha conta o desmarque tardio', JSON.stringify(f));

  // quem pode cobrir: Bia disse que pode, Cau não respondeu, Dan é treino
  S.voluntarios[1].disponivel = [D];
  const cobre = E.quemPodeCobrir(S, D, 'PROJEÇÃO');
  ok(cobre[0]?.nome === 'Bia', 'quem disse que pode vem primeiro', cobre.map(c=>c.nome).join(','));
  ok(!cobre.some(c => c.nome === 'Dan'), 'aprendiz não entra para cobrir buraco', cobre.map(c=>c.nome).join(','));
  ok(!cobre.some(c => c.nome === 'Ana'), 'quem desmarcou não aparece como substituto', cobre.map(c=>c.nome).join(','));

  // quem avisou que não pode fica de fora
  S.voluntarios[2].indisponivel = [D];
  ok(!E.quemPodeCobrir(S, D, 'PROJEÇÃO').some(c => c.nome === 'Cau'), 'quem marcou não posso não é sugerido');

  // furo aberto aparece para o líder
  const abertos = E.furosAbertos(S, '2026-09-01');
  ok(abertos.length === 1 && abertos[0].tardio === true, 'furo aberto entra na lista do líder', JSON.stringify(abertos));

  // a mensagem do grupo mostra quem confirmou
  const S2 = base([v('Ana', { 'PROJEÇÃO': 'titular' })]);
  E.garantirDia(S2, D);
  S2.escalas[D].slots['PROJEÇÃO'] = { vid: S2.voluntarios[0].id, status: 'confirmado', fixo: false };
  ok(E.msgEscala(S2, D).includes('Ana (confirmou)'), 'mensagem marca quem confirmou');
  S2.escalas[D].slots['PROJEÇÃO'].status = 'pendente';
  ok(E.msgEscala(S2, D).includes('Ana (falta confirmar)'), 'mensagem marca quem falta confirmar');
}



console.log('\n15. Culto do Follow (sábado, sem HEAD e sem transmissão)');
{
  /* setembro/2026: sábados 5, 12, 19, 26 — o dia 5 é o primeiro do mês e NÃO
     tem Follow. Se essa conta escorregar, o time é escalado num dia que não
     existe. */
  const sabs = E.sabadosDoFollow(2026, 9);
  ok(sabs.length === 3, 'três Follows em setembro/2026', sabs.join(','));
  ok(!sabs.includes('2026-09-05'), 'o primeiro sábado do mês fica de fora');
  ok(sabs[0] === '2026-09-12', 'começa no segundo sábado', sabs[0]);

  /* fevereiro/2026 tem 4 sábados (7,14,21,28) → 3 Follows. Um mês com 5
     sábados tem 4. A regra é "todos menos o primeiro", não "sempre 3". */
  ok(E.sabadosDoFollow(2026, 2).length === 3, 'fevereiro/2026: 3 Follows');
  ok(E.sabadosDoFollow(2026, 8).length === 4, 'agosto/2026 tem 5 sábados: 4 Follows',
     E.sabadosDoFollow(2026, 8).join(','));

  ok(E.tipoDoDia('2026-09-12') === 'follow', 'sábado é Follow');
  ok(E.tipoDoDia('2026-09-13') === 'domingo', 'domingo é domingo');
  ok(E.cultosDoMes(2026, 9).length === 7, '4 domingos + 3 Follows = 7 cultos',
     String(E.cultosDoMes(2026, 9).length));
  ok(E.cultosDoMes(2026, 9)[0] === '2026-09-06', 'a lista vem em ordem de data',
     E.cultosDoMes(2026, 9)[0]);

  const S = base(TIME());
  const SAB = '2026-09-12', DOM = '2026-09-13';
  ok(E.funcoesDoDia(S, DOM).length === 7, 'domingo tem as 7 áreas');
  const noSab = E.funcoesDoDia(S, SAB).map(x => x.nome);
  ok(noSab.length === 5, 'Follow tem 5 áreas', noSab.join(','));
  ok(!noSab.includes('HEAD') && !noSab.includes('TRANSMISSÃO'),
     'Follow não tem HEAD nem transmissão', noSab.join(','));

  E.gerarDia(S, SAB);
  const slots = Object.keys(S.escalas[SAB].slots);
  ok(!slots.includes('HEAD') && !slots.includes('TRANSMISSÃO'),
     'o sorteio do sábado não cria slot de HEAD/transmissão', slots.join(','));
  ok(E.vagasDe(S, SAB).length === 0, 'sábado fecha sem vaga', E.vagasDe(S, SAB).join(','));
  ok(E.resumoDia(S, SAB).total === 5, 'o resumo do sábado conta 5, não 7',
     String(E.resumoDia(S, SAB).total));

  /* quem só faz HEAD/transmissão não some do time: continua livre no sábado
     e escalado no domingo. */
  E.gerarDia(S, DOM);
  ok(S.escalas[DOM].slots['HEAD']?.vid === 'id_arthur', 'HEAD segue no domingo');

  const m = E.msgEscala(S, SAB);
  ok(m.includes('Follow'), 'a mensagem do sábado diz Follow');
  ok(!m.includes('HEAD') && !m.includes('TRANSMISSÃO'),
     'a mensagem do sábado não lista área que não existe nele');
  ok(E.msgEscala(S, DOM).includes('Escala de domingo'), 'a mensagem do domingo segue domingo');

  /* slot fantasma de HEAD gravado num sábado (dado velho) tem que ser limpo
     no sorteio, senão vira vaga que ninguém consegue fechar. */
  const S2 = base(TIME());
  E.garantirDia(S2, SAB).slots['HEAD'] = { vid: 'id_arthur', status: 'pendente', fixo: false };
  E.gerarDia(S2, SAB);
  ok(!S2.escalas[SAB].slots['HEAD'], 'sorteio limpa HEAD gravado por engano no sábado');

  /* a cobrança de quinta precisa alcançar o sábado E o domingo */
  const alvos = E.cultosAte('2026-09-10', 4);     // quinta
  ok(alvos.length === 2 && alvos[0] === SAB && alvos[1] === DOM,
     'da quinta, a cobrança pega o Follow e o domingo', alvos.join(','));
  ok(!E.cultosAte('2026-09-03', 4).includes('2026-09-05'),
     'a cobrança não inventa Follow no primeiro sábado');
}

console.log(`\n================  ${n - f}/${n} testes passaram  ================\n`);

console.log('\n16. Nível declarado x nível conferido');
{
  /* o caso real: a pessoa se cadastrou sozinha e marcou titular em tudo.
     Aceitar isso sem conferir deixa a escala apoiada num toque de tela. */
  const declarado = (nome, funcoes) => ({
    ...v(nome, funcoes),
    conferido: false,
    confirmadas: Object.fromEntries(Object.keys(funcoes).map(f => [f, false])),
  });

  const S = base([
    v('Tonho', { 'PROJEÇÃO': 'titular' }),                 // conferido (cadastro do líder)
    declarado('Gi', { 'PROJEÇÃO': 'titular', 'HEAD': 'titular', 'TRANSMISSÃO': 'titular' }),
  ]);
  const gi = S.voluntarios[1];

  ok(E.nivelEfetivo(gi, 'PROJEÇÃO') === 'reserva', 'titular não conferido vale como reserva no motor');
  ok(gi.funcoes['PROJEÇÃO'] === 'titular', 'o que a pessoa declarou continua guardado como está');
  ok(E.nivelEfetivo(S.voluntarios[0], 'PROJEÇÃO') === 'titular', 'titular conferido continua titular');
  ok(E.confirmada(S.voluntarios[0], 'PROJEÇÃO') === true, 'sem a coluna, vale como conferido');

  // reserva e treino declarados não mudam: só o degrau mais alto precisa de chancela
  const ap = declarado('Ap', { 'FOTO': 'reserva', 'FILMAGEM': 'treino' });
  ok(E.nivelEfetivo(ap, 'FOTO') === 'reserva', 'reserva declarada segue reserva');
  ok(E.nivelEfetivo(ap, 'FILMAGEM') === 'treino', 'treino declarado segue treino');

  // o sorteio prefere quem foi conferido
  const D = E.domingosDoMes(2026, 9)[0];
  const c = E.candidatos(S, 'PROJEÇÃO', D, { excluirOcupados: false });
  ok(c[0].nome === 'Tonho', 'conferido vem antes de quem só se declarou', c.map(x => x.nome + ':' + x.nivel).join(','));

  // mas quem só se declarou continua entrando: nada é bloqueado
  const S2 = base([declarado('Gi', { 'PROJEÇÃO': 'titular' })]);
  E.gerarDia(S2, D);
  ok(S2.escalas[D].slots['PROJEÇÃO']?.vid === 'id_gi', 'quem só se declarou ainda é escalado');

  // saúde do time para de mentir
  const saude = E.saudeDoTime(S).funcoes.find(x => x.nome === 'HEAD');
  ok(saude.aptos === 1, 'HEAD tem 1 apto');
  ok(saude.titulares === 0, 'nenhum titular conferido em HEAD', JSON.stringify(saude));
  ok(saude.grau === 'critico', 'área sem titular conferido é crítica, não ok');

  const proj = E.saudeDoTime(S).funcoes.find(x => x.nome === 'PROJEÇÃO');
  ok(proj.titulares === 1 && proj.declarados === 1, 'separa titular conferido de titular declarado',
     JSON.stringify(proj));
}

console.log('\n17. O sistema aponta sozinho a declaração implausível');
{
  const declarado = (nome, funcoes) => ({
    ...v(nome, funcoes),
    conferido: false,
    confirmadas: Object.fromEntries(Object.keys(funcoes).map(f => [f, false])),
  });

  /* ser titular em duas áreas simultâneas é o NORMAL de quem serve: num
     domingo faz uma, no outro faz a outra. Acusar isso é alarme falso. */
  const S0 = base([
    declarado('Ana', { 'PROJEÇÃO': 'titular', 'ILUMINAÇÃO': 'titular' }),
    v('B1', { 'PROJEÇÃO': 'titular' }), v('B2', { 'PROJEÇÃO': 'titular' }),
    v('B3', { 'ILUMINAÇÃO': 'titular' }), v('B4', { 'ILUMINAÇÃO': 'titular' }),
  ]);
  ok(E.declaracoesSuspeitas(S0).length === 0,
     'titular em 2 áreas simultâneas NÃO é suspeito quando a área tem folga',
     JSON.stringify(E.declaracoesSuspeitas(S0)));

  /* pilar único: se a declaração estiver errada, a área cai */
  const S1 = base([
    declarado('Gi', { 'CÂMERA 1': 'titular' }),
    v('Edu', { 'CÂMERA 1': 'reserva' }),
  ]);
  S1.funcoes = [{ nome: 'CÂMERA 1', simultanea: true, ordem: 1, ativa: true }];
  const s1 = E.declaracoesSuspeitas(S1);
  ok(s1.length === 1 && s1[0].motivo === 'pilar_unico', 'área que fica com 1 pessoa é acusada', JSON.stringify(s1));
  ok(s1[0].texto.includes('1 pessoa'), 'o texto diz com quantos a área fica', s1[0].texto);

  const S2 = base([declarado('Só', { 'CÂMERA 1': 'titular' })]);
  S2.funcoes = [{ nome: 'CÂMERA 1', simultanea: true, ordem: 1, ativa: true }];
  ok(E.declaracoesSuspeitas(S2)[0].texto.includes('ninguém'), 'e quando fica sem ninguém, diz isso');

  /* sem gradiente: 4 ou mais áreas idênticas */
  const S3 = base([declarado('Gi', {
    'PROJEÇÃO': 'titular', 'ILUMINAÇÃO': 'titular', 'FOTO': 'titular', 'HEAD': 'titular',
  })]);
  ok(E.declaracoesSuspeitas(S3).some(x => x.motivo === 'sem_gradiente'), '4 áreas idênticas é acusado');

  const S4 = base([declarado('Zé', { 'PROJEÇÃO': 'titular', 'FOTO': 'titular', 'HEAD': 'titular' })]);
  ok(!E.declaracoesSuspeitas(S4).some(x => x.motivo === 'sem_gradiente'),
     '3 áreas ainda não bastam: seria acusar gente demais');

  const S5 = base([{ ...v('Edu', { 'PROJEÇÃO': 'titular', 'FOTO': 'reserva', 'HEAD': 'treino', 'FILMAGEM': 'reserva' }),
                     conferido: false,
                     confirmadas: { 'PROJEÇÃO': false, 'FOTO': false, 'HEAD': false, 'FILMAGEM': false } }]);
  ok(!E.declaracoesSuspeitas(S5).some(x => x.motivo === 'sem_gradiente'),
     'quem variou o nível não é acusado de tocar uma vez em tudo');

  /* já conferido some da lista e da fila */
  const S6 = base([{ ...v('Ok', { 'PROJEÇÃO': 'titular', 'HEAD': 'titular', 'FOTO': 'titular', 'FILMAGEM': 'titular' }),
                     conferido: true, confirmadas: {} }]);
  ok(E.declaracoesSuspeitas(S6).length === 0, 'quem já foi conferido não aparece como suspeito');
  ok(E.filaDeConferencia(S6).length === 0, 'nem entra na fila de conferência');

  /* a fila é por área e mostra declarado x valendo */
  const fila = E.filaDeConferencia(S3);
  ok(fila.length === 4, 'fila tem uma entrada por área declarada', fila.map(x=>x.funcao).join(','));
  ok(fila[0].pendentes[0].declarou === 'titular' && fila[0].pendentes[0].efetivo === 'reserva',
     'a fila mostra o declarado e o que está valendo');
}


process.exit(f ? 1 : 0);
