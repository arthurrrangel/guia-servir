/* O EVENTO ESPORÁDICO ENTRA NO MESMO FLUXO — COM AS MESMAS REGRAS.

   19/09/2026, migração 54. O pedido foi: "cadastrar o evento informando data,
   horário e área responsável; depois de cadastrado, ele entra no mesmo fluxo
   das escalas normais, permitindo gerar/sortear automaticamente entre os
   voluntários disponíveis, seguindo as mesmas regras de disponibilidade e
   organização que já existem".

   A frase que este arquivo protege é "AS MESMAS REGRAS". Um evento que
   escalasse quem avisou que não pode, ou que ignorasse o teto do mês, ou que
   pusesse a mesma pessoa em dois postos simultâneos, seria pior que não ter o
   recurso: a liderança confiaria num sorteio que não obedece o que o sistema
   promete, e descobriria no dia.

   A parte de banco (quem pode criar, o que é recusado, e o fato de
   `salvar_dia` continuar gravando) está na conferência da própria migração 54,
   que roda 15 casos com dados descartáveis. Aqui fica o lado do motor.

   Roda com `npm test`. */

import * as E from '../lib/engine.ts';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };

/* Uma quinta-feira de outubro de 2026 — dia que NÃO é domingo nem sábado, que
   é exatamente o caso do GUIA Empreendedor. */
const QUINTA = '2026-10-15';
const DOMINGO = E.domingosDoMes(2026, 10)[0];

function base() {
  const S = E.estadoVazio();
  S.funcoes = [
    { nome: 'PROJEÇÃO', ordem: 1, ativa: true, simultanea: true, tipos: ['domingo', 'follow'] },
    { nome: 'HEAD', ordem: 2, ativa: true, simultanea: true, tipos: ['domingo'] },
    { nome: 'TRANSMISSÃO', ordem: 3, ativa: true, simultanea: true, tipos: ['follow'] },
  ];
  S.voluntarios = [
    { id: 'v1', nome: 'Ana Silva', ativo: true, indisponivel: [], funcoes: { 'PROJEÇÃO': 'titular', HEAD: 'titular', 'TRANSMISSÃO': 'titular' } },
    { id: 'v2', nome: 'Bia Costa', ativo: true, indisponivel: [], funcoes: { 'PROJEÇÃO': 'titular', HEAD: 'titular', 'TRANSMISSÃO': 'titular' } },
    { id: 'v3', nome: 'Caio Dias', ativo: true, indisponivel: [], funcoes: { 'PROJEÇÃO': 'titular', HEAD: 'titular', 'TRANSMISSÃO': 'titular' } },
  ];
  return S;
}
const comEvento = (nome = 'GUIA Empreendedor', data = QUINTA) => {
  const S = base();
  const d = E.garantirDia(S, data);
  d.evento = nome; d.inicio = '19:30';
  return S;
};

/* ------------------------------------- 1. o dia do evento entra na lista */
{
  const S = comEvento();
  const dias = E.diasDoMes(S, 2026, 10);
  ok(dias.includes(QUINTA), 'o dia do evento entra na lista do mês', JSON.stringify(dias));
  ok(dias.includes(DOMINGO), 'e os domingos continuam lá');
  ok(dias.join(',') === [...dias].sort().join(','), 'a lista sai em ordem de data');
  /* sem evento, a lista é a de sempre — a função não pode inventar dias */
  ok(!E.diasDoMes(base(), 2026, 10).includes(QUINTA),
    'sem evento, a quinta NÃO aparece');
  ok(E.diasDoMes(base(), 2026, 10).join(',') === E.cultosDoMes(2026, 10).join(','),
    'e a lista é exatamente a aritmética de antes');
  /* evento de OUTRO mês não vaza para este */
  const S2 = comEvento('Conferência', '2026-11-12');
  ok(!E.diasDoMes(S2, 2026, 10).includes('2026-11-12'), 'evento de novembro não entra em outubro');
  ok(E.diasDoMes(S2, 2026, 11).includes('2026-11-12'), 'e entra em novembro');
}

/* ------------------------------------ 2. num evento valem TODOS os postos */
{
  const S = comEvento();
  const noEvento = E.funcoesDoDia(S, QUINTA).map(f => f.nome).sort();
  ok(noEvento.join(',') === 'HEAD,PROJEÇÃO,TRANSMISSÃO',
    'evento usa todos os postos ativos do ministério, sem olhar `tipos`', noEvento.join(','));
  /* e o domingo continua obedecendo `tipos` — a regra do evento não pode
     vazar para os dias normais */
  const noDomingo = E.funcoesDoDia(S, DOMINGO).map(f => f.nome).sort();
  ok(noDomingo.join(',') === 'HEAD,PROJEÇÃO',
    'e o domingo continua filtrando por tipos (TRANSMISSÃO é só do Follow)', noDomingo.join(','));
  /* posto desativado continua fora, inclusive em evento */
  const S2 = comEvento();
  S2.funcoes[1].ativa = false;
  ok(!E.funcoesDoDia(S2, QUINTA).some(f => f.nome === 'HEAD'),
    'posto desativado fica fora até no evento');
}

/* --------------- 3. o sorteio do evento obedece as MESMAS regras duras */
{
  /* 3a) quem avisou que não pode NAQUELE dia não é escalado */
  const S = comEvento();
  S.voluntarios[0].indisponivel = [QUINTA];
  S.voluntarios[1].indisponivel = [QUINTA];
  E.gerarMes(S, 2026, 10, QUINTA);
  const noDia = Object.values(S.escalas[QUINTA].slots).map(s => s?.vid).filter(Boolean);
  ok(!noDia.includes('v1') && !noDia.includes('v2'),
    'quem avisou que não pode no dia do evento não entra', JSON.stringify(noDia));
  ok(noDia.length > 0, 'e quem pode entra (o teste não passou por vazio)', JSON.stringify(noDia));

  /* 3b) ninguém em dois postos simultâneos no mesmo evento */
  const S2 = comEvento();
  E.gerarMes(S2, 2026, 10, QUINTA);
  const doDia = Object.values(S2.escalas[QUINTA].slots).map(s => s?.vid).filter(Boolean);
  ok(new Set(doDia).size === doDia.length,
    'ninguém ocupa dois postos simultâneos no mesmo evento', JSON.stringify(doDia));

  /* 3c) o teto do mês conta o evento junto com os domingos */
  const S3 = comEvento();
  S3.config.limitePadrao = 1;
  E.gerarMes(S3, 2026, 10, QUINTA);
  const vezes = {};
  for (const [data, dia] of Object.entries(S3.escalas)) {
    for (const sl of Object.values(dia.slots || {})) {
      if (!sl?.vid) continue;
      (vezes[sl.vid] ||= new Set()).add(data);
    }
  }
  const acima = Object.entries(vezes).filter(([, s]) => s.size > 1);
  ok(acima.length === 0, 'com teto 1, ninguém serve em dois dias — o evento conta',
    acima.map(([v, s]) => `${v}:${s.size}`).join(', '));
}

/* --------------------------- 4. a carga do mês enxerga o evento

   Se o evento não contasse na carga, o sorteio do domingo seguinte acharia
   que quem ficou no GUIA Empreendedor está descansado — e a pessoa serviria
   duas vezes achando que serviu uma. */
{
  const S = comEvento();
  E.garantirDia(S, QUINTA).slots['PROJEÇÃO'] = { vid: 'v1', status: 'pendente', fixo: false };
  const carga = E.cargaDoMes(S, 2026, 10);
  const ana = carga.pessoas.find(x => x.id === 'v1');
  ok(ana?.n === 1, 'quem serviu no evento conta 1 na carga do mês', JSON.stringify(ana));
  ok(ana?.dias.includes(QUINTA), 'e o dia contado é o do evento', JSON.stringify(ana?.dias));
  ok(carga.dias.includes(QUINTA), 'a carga olha o mês COM o dia do evento dentro');
  ok(carga.montados.includes(QUINTA), 'e enxerga o evento como dia montado');
  /* sem o evento na conta, a Ana apareceria zerada — e o sorteio do domingo
     seguinte a trataria como descansada */
  ok(!carga.zerados.some(x => x.id === 'v1'), 'e ela NÃO aparece entre os zerados');
}

/* ----------------------------------- 5. o título do dia diz o nome */
{
  ok(E.tituloDoCulto(QUINTA, 'GUIA Empreendedor') === 'Escala do GUIA Empreendedor',
    'o título do evento usa o nome dele', E.tituloDoCulto(QUINTA, 'GUIA Empreendedor'));
  ok(E.tituloDoCulto(DOMINGO) === 'Escala de domingo',
    'e o domingo continua "Escala de domingo"', E.tituloDoCulto(DOMINGO));
  ok(E.tituloDoCulto('2026-10-10') === 'Escala do Follow, sábado',
    'e o sábado continua Follow', E.tituloDoCulto('2026-10-10'));
}

/* ------- 6. evento num domingo NÃO existe: o banco recusa, e é de propósito

   Não dá para representar dois conjuntos de postos na mesma data — `S.escalas`
   é um dia por data. A migração 54 recusa criar evento em dia com culto
   regular justamente por isso. Este caso documenta o limite do lado do motor:
   se um dia a chave virar `culto_id`, este teste é o lugar de mudar. */
{
  const S = comEvento('Evento no domingo', DOMINGO);
  const f = E.funcoesDoDia(S, DOMINGO).map(x => x.nome).sort();
  ok(f.join(',') === 'HEAD,PROJEÇÃO,TRANSMISSÃO',
    'se um evento marcar num domingo, o dia vira evento por inteiro — é o limite do modelo de um-dia-por-data',
    f.join(','));
}

console.log(falhas ? `\nevento-esporadico: ${falhas} falha(s) em ${feitas}` : `\nevento-esporadico: ${feitas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
