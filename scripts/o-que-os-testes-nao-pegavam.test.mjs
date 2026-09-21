/* SETE LINHAS DE CÓDIGO QUE A SUÍTE INTEIRA DEIXAVA QUEBRAR.

   19/09/2026. Uma equipe de agentes adversariais fez a única coisa que prova
   um teste: SABOTOU o código de produção, uma linha por vez, numa cópia do
   repositório, e rodou `npm test` depois de cada sabotagem. Oitenta e seis
   sabotagens. Setenta e nove foram pegas. Sete passaram — ou seja, sete
   pedaços de comportamento que a suíte afirmava proteger e não protegia.

   POR QUE ISSO É PIOR QUE NÃO TER TESTE

   Um teste que não pode falhar compra confiança sem entregar nada. Já tinha
   acontecido aqui: `engine-orcamento.test.mjs` afirmava `vagasAbertas === 0`
   contando as entradas criadas, mas `gerarDia` só cria a entrada quando
   consegue preencher — a asserção era impossível de falhar. Aquele arquivo
   foi reescrito. Estes sete são a mesma classe, encontrada pelo método certo.

   O QUE CADA CASO AQUI PROTEGE, e a sabotagem que a suíte antiga não pegava:

     1  lib/ponte.ts        `if (ruim2?.error) throw`   apagado
     2  lib/engine.ts       `if (!v.ativo) return false` apagado
     3  lib/engine.ts       `c.dias.size` virando `c.funcoes.size`
     4  lib/demandas/regras `n.length <= 11` virando `n.startsWith('55')`
     5  regras.ts           teto de 200 letras do título, apagado
     6  regras.ts           teto de 20 mil letras da descrição, apagado
     7  regras.ts           teto de 120 letras do evento, apagado

   E mais quatro de correções de HOJE, que sem teste voltariam do mesmo jeito:

     8  msgEscala dizendo "domingo" numa quinta de evento
     9  o cache de datas servindo lista velha depois de apagar e criar dia
    10  `quantosPodem` tendo que contar exatamente o que `candidatos` conta
    11  a lista de ids indo inteira na URL, que estoura 8 KB e devolve 414

   CADA ASSERÇÃO DESTE ARQUIVO FOI VERIFICADA POR SABOTAGEM. Quebrei a linha
   de produção correspondente, rodei, e confirmei que o caso FALHA. Sem esse
   passo, este arquivo seria só mais uma lista de afirmações verdadeiras.

   Roda com `npm test`. */

import * as E from '../lib/engine.ts';
import { linhasDaEquipe, emLotes } from '../lib/ponte.ts';
import { oQueFalta, linkZap } from '../lib/demandas/regras.ts';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra); } };


/* =========================================================================
   1 · O ERRO DE LEITURA TEM QUE SUBIR, E NÃO SÓ O DA PRIMEIRA CONSULTA

   `linhasDaEquipe` faz sete consultas. A de `voluntarios` tinha o erro
   conferido e testado; as SEIS seguintes (habilidades, indisponibilidades,
   escalacoes, plantoes, culto_obs, disponibilidade) eram conferidas pelo
   mesmo `throw`, e nenhum teste passava por ele.

   Por que importa exatamente nesta: um 5xx passageiro em `escalacoes` que
   vira lista vazia faz o robô das 9h ler "o líder não montou", chamar
   `gerarMes` e depois `salvar_dia` — e `salvar_dia` APAGA toda escalação da
   equipe naquele culto. O comentário no arquivo já dizia isso. O teste é que
   não existia.
   ========================================================================= */
function fingeBanco({ quebrada = null } = {}) {
  const tabela = (nome) => {
    const eu = {
      select() { return eu; }, eq() { return eu; }, gte() { return eu; },
      or() { return eu; }, in() { return eu; },
      maybeSingle() { return resposta(); },
      /* devolve o CONSTRUTOR, como o cliente de verdade: desde 20/09
         `lerFuncoes` encadeia `.order('ordem').order('nome')` */
      order() { return eu; },
      then(res) { return Promise.resolve(resposta()).then(res); },
    };
    const resposta = () => {
      if (nome === quebrada) return { data: null, error: { code: '500', message: 'boom em ' + nome } };
      /* AS TRÊS PRIMEIRAS VERSÕES DESTE DUBLÊ DEVOLVIAM `[]` PARA TUDO, e o
         teste reprovava em `escalacoes`, `plantoes` e `culto_obs` — não
         porque o código estivesse errado, mas porque essas três só são
         consultadas quando existe `cultoIds`, e sem culto nenhum elas nem
         chegam a rodar. Dublê que não monta o cenário reprova código certo, e
         isso é tão ruim quanto teste que aprova código errado. */
      if (nome === 'voluntarios') return { data: [{ id: 'v1', nome: 'Ana', ativo: true, equipe_id: 'e1' }], error: null };
      if (nome === 'funcoes') return { data: [{ id: 'f1', nome: 'FOTO', ativa: true, equipe_id: 'e1', tipos: [] }], error: null };
      if (nome === 'cultos') return { data: [{ id: 'c1', data: '2026-10-04' }], error: null };
      return { data: [], error: null };
    };
    return eu;
  };
  return { from: tabela };
}

for (const t of ['habilidades', 'indisponibilidades', 'escalacoes', 'plantoes', 'culto_obs', 'disponibilidade']) {
  let erro = null;
  try { await linhasDaEquipe(fingeBanco({ quebrada: t }), 'e1', '2026-01-01'); } catch (e) { erro = e; }
  ok(!!erro, `erro de leitura em \`${t}\` SOBE em vez de virar lista vazia`,
    erro ? '' : 'a carga devolveu normalmente, e o robô leria isso como "não montou"');
}


/* =========================================================================
   2 · "PAUSAR" PRECISA PAUSAR

   `candidatos` tem `if (!v.ativo) return false` na primeira linha do filtro.
   Nenhum teste da suíte construía um voluntário pausado, então apagar essa
   linha passava em 98 de 98.

   É a promessa que o sistema faz em voz alta: `erros.ts` manda a pessoa usar
   "Pausar" em vez de apagar, dizendo que assim ela "sai das próximas escalas
   e o histórico fica". Metade dessa frase não tinha prova.
   ========================================================================= */
{
  const S = E.estadoVazio();
  S.funcoes = [{ nome: 'FOTO', ordem: 0, ativa: true, simultanea: true }];
  S.voluntarios = [
    { id: 'v1', nome: 'Pausado Silva', ativo: false, limiteMes: 4, funcoes: { FOTO: 'titular' } },
    { id: 'v2', nome: 'Ativa Souza', ativo: true, limiteMes: 4, funcoes: { FOTO: 'titular' } },
  ];
  const c = E.candidatos(S, 'FOTO', '2026-10-04');
  ok(!c.some(x => x.id === 'v1'), 'quem está pausado NÃO é candidato',
    JSON.stringify(c.map(x => x.id)));
  ok(c.some(x => x.id === 'v2'), 'e quem está ativo continua sendo');

  /* e a vaga fica ABERTA quando o único habilitado está pausado, em vez de
     ser preenchida por ele */
  const S2 = E.estadoVazio();
  S2.funcoes = S.funcoes;
  S2.voluntarios = [S.voluntarios[0]];
  E.gerarDia(S2, '2026-10-04');
  ok(!S2.escalas['2026-10-04']?.slots?.FOTO?.vid,
    'com só um habilitado e ele pausado, a vaga fica aberta',
    JSON.stringify(S2.escalas['2026-10-04']?.slots));

  /* e `quantosPodem` conta a mesma coisa que `candidatos` — o filtro é um só
     desde que ele foi separado da pontuação, e esta é a prova */
  ok(E.quantosPodem(S, 'FOTO', '2026-10-04') === c.length,
    'quantosPodem conta exatamente o que candidatos devolve',
    `${E.quantosPodem(S, 'FOTO', '2026-10-04')} vs ${c.length}`);
}


/* =========================================================================
   3 · A CARGA CONTA DIAS, NÃO POSTOS

   `cargaDoMes` devolve `n: c.dias.size`. Trocar por `c.funcoes.size` passava
   na suíte inteira, porque o único caso que tocava essa função punha a pessoa
   em UM posto de UM dia — onde os dois números são iguais.

   O caso que distingue é o que acontece toda semana: a mesma pessoa em FOTO e
   EDIÇÃO no mesmo domingo. Isso é UM dia de serviço, e o motor conta assim
   (`cargaJanela` usa `diasComAPessoa`). Se a tela contasse 2, ela
   contradiria o sorteio: mostraria "3/4" para quem o motor considera "2/4".
   ========================================================================= */
{
  const S = E.estadoVazio();
  S.funcoes = [
    { nome: 'FOTO', ordem: 0, ativa: true, simultanea: true },
    { nome: 'EDIÇÃO', ordem: 1, ativa: true, simultanea: true },
  ];
  S.voluntarios = [{ id: 'v1', nome: 'Ana', ativo: true, limiteMes: 4,
                     funcoes: { FOTO: 'titular', 'EDIÇÃO': 'titular' } }];
  const dia = E.garantirDia(S, '2026-10-04');
  dia.slots['FOTO'] = { vid: 'v1', status: 'pendente', fixo: false };
  dia.slots['EDIÇÃO'] = { vid: 'v1', status: 'pendente', fixo: false };

  const c = E.cargaDoMes(S, 2026, 10);
  const ana = c.pessoas.find(p => p.id === 'v1');
  ok(ana && ana.n === 1, 'dois postos no MESMO dia contam 1 na carga (dia, não posto)',
    ana ? `contou ${ana.n}` : 'não achou a pessoa');
  ok(ana && ana.funcoes.length === 2, 'e os dois postos aparecem na lista de funções',
    ana ? String(ana.funcoes.length) : '');
  ok(E.cargaJanela(S, 'v1', '2026-10-31', 60) === 1,
    'e o motor concorda: a mesma conta, o mesmo número',
    String(E.cargaJanela(S, 'v1', '2026-10-31', 60)));
}


/* =========================================================================
   4 · O DDI SE DECIDE PELO COMPRIMENTO

   `linkZap` foi corrigida hoje e subiu sem teste que a prove. Os dois casos
   que existiam — '(31) 99999-8888' e '5531999998888' — dão o MESMO resultado
   na versão certa e na errada, então a correção estava desprotegida desde o
   minuto em que foi escrita.

   O caso que distingue é o celular de DDD 55 (interior do Rio Grande do Sul):
   onze dígitos começando com 55.
   ========================================================================= */
{
  const casos = [
    ['55999998888', '5555999998888', 'celular de DDD 55: o 55 é DDD, não DDI'],
    ['5511987654321', '5511987654321', 'treze dígitos: o DDI já está lá'],
    ['21999998888', '5521999998888', 'onze dígitos: falta o DDI'],
    ['2133334444', '552133334444', 'dez dígitos (fixo): falta o DDI'],
    ['551133334444', '551133334444', 'doze dígitos: o DDI já está lá'],
  ];
  for (const [entrada, esperado, rot] of casos) {
    const url = linkZap(entrada, 'oi');
    ok(url === `https://wa.me/${esperado}?text=oi`, rot, `${entrada} -> ${url}`);
  }
  ok(linkZap('9999', 'oi') === '', 'número curto demais não vira link');
}


/* =========================================================================
   5, 6 e 7 · OS TETOS QUE O BANCO IMPÕE, CONFERIDOS ANTES DE ENVIAR

   `oQueFalta` promete, no comentário dela, ser o espelho dos CHECKs do banco
   "aqui só para a pessoa saber ANTES". Os testes existentes conferiam todos
   os MÍNIMOS e nenhum MÁXIMO, então apagar qualquer um dos três tetos passava
   na suíte. Sem eles, a pessoa escreve 300 letras de título, envia, e o banco
   recusa depois — com um texto de constraint que ninguém entende.
   ========================================================================= */
{
  const base = {
    titulo: 'Um título normal', descricao: 'Uma descrição com tamanho suficiente.',
    categoria_id: 'c1', setor_solicitante: 's1', prazo: '2026-12-01',
    sem_prazo_porque: '', prioridade: 'normal', impacto: '', evento: '', evento_data: '',
  };
  ok(oQueFalta(base, true).length === 0, 'o caso base não tem pendência',
    JSON.stringify(oQueFalta(base, true)));

  const longo = (n) => 'a'.repeat(n);
  const pede = (mud) => oQueFalta({ ...base, ...mud }, true).join(' | ');

  ok(/200 letras/.test(pede({ titulo: longo(201) })),
    'título com 201 letras é recusado ANTES de enviar', pede({ titulo: longo(201) }));
  ok(!/200 letras/.test(pede({ titulo: longo(200) })),
    'e com exatamente 200 passa (o limite é <=, como no banco)');

  ok(/20 mil/.test(pede({ descricao: longo(20001) })),
    'descrição com 20.001 letras é recusada', pede({ descricao: longo(20001) }));
  ok(!/20 mil/.test(pede({ descricao: longo(20000) })), 'e com exatamente 20 mil passa');

  ok(/120 letras/.test(pede({ evento: longo(121), evento_data: '2026-12-01' })),
    'nome de evento com 121 letras é recusado',
    pede({ evento: longo(121), evento_data: '2026-12-01' }));
  ok(!/120 letras/.test(pede({ evento: longo(120), evento_data: '2026-12-01' })),
    'e com exatamente 120 passa');
}


/* =========================================================================
   8 · A MENSAGEM DO GRUPO PRECISA SABER QUE HOJE É EVENTO

   `msgEscala` montava o cabeçalho com `tituloDoCulto(data)`, sem o evento.
   Num evento de quinta a mensagem que vai para o WhatsApp de todo mundo dizia
   "Escala de domingo (15/10)". A tela acertava, porque ela passa o evento; a
   mensagem ficou para trás quando a 54 criou o terceiro tipo de dia.
   ========================================================================= */
{
  const S = E.estadoVazio();
  S.funcoes = [{ nome: 'FOTO', ordem: 0, ativa: true, simultanea: true }];
  S.voluntarios = [{ id: 'v1', nome: 'Ana Souza', ativo: true, limiteMes: 4, funcoes: { FOTO: 'titular' } }];
  S.config.saudacao = 'Bom dia!';

  const quinta = E.garantirDia(S, '2026-10-15');
  quinta.evento = 'GUIA Empreendedor';
  quinta.slots['FOTO'] = { vid: 'v1', status: 'confirmado', fixo: false };
  const m = E.msgEscala(S, '2026-10-15');
  ok(m.includes('GUIA Empreendedor'), 'a mensagem do evento diz o nome do evento', m.split('\n')[1]);
  ok(!/domingo/i.test(m), 'e NÃO diz "domingo" numa quinta', m.split('\n')[1]);

  /* e o domingo comum continua dizendo domingo */
  const dom = E.garantirDia(S, '2026-10-04');
  dom.slots['FOTO'] = { vid: 'v1', status: 'confirmado', fixo: false };
  const m2 = E.msgEscala(S, '2026-10-04');
  ok(/domingo/i.test(m2), 'o domingo comum continua dizendo domingo', m2.split('\n')[1]);
}


/* =========================================================================
   9 · O CACHE DE DATAS DEPOIS DE APAGAR E CRIAR UM DIA

   A guarda do cache era a CONTAGEM de dias, apostando que dia nunca é
   apagado. A rotina que restaura o retrato local quando a gravação falha
   (app/escala/page.tsx) apaga. Apagar um e criar outro mantém a contagem, e
   as contagens de carga passam a ler uma lista de datas velha.

   Não quebra nada na hora: só muda quem é sorteado, semanas depois. É o
   defeito mais caro que existe neste motor, porque ninguém liga o sorteio
   estranho de novembro a uma otimização de setembro.
   ========================================================================= */
{
  const S = E.estadoVazio();
  S.funcoes = [{ nome: 'FOTO', ordem: 0, ativa: true, simultanea: true }];
  S.voluntarios = [{ id: 'v1', nome: 'Ana', ativo: true, limiteMes: 9, funcoes: { FOTO: 'titular' } }];
  for (const d of ['2026-03-01', '2026-03-08', '2026-03-15']) {
    E.garantirDia(S, d).slots['FOTO'] = { vid: 'v1', status: 'pendente', fixo: false };
  }
  /* aquece o cache */
  ok(E.diasDesdeUltima(S, 'v1', '2026-04-01') === 17,
    'antes da troca, a última foi em 15/03 (17 dias)',
    String(E.diasDesdeUltima(S, 'v1', '2026-04-01')));

  /* A TROCA QUE ENGANAVA A CONTAGEM: sai 15/03, entra 25/03. Continuam 3. */
  delete S.escalas['2026-03-15'];
  E.garantirDia(S, '2026-03-25').slots['FOTO'] = { vid: 'v1', status: 'pendente', fixo: false };
  ok(Object.keys(S.escalas).length === 3, 'a contagem de dias continua 3 (é esse o ponto)');

  ok(E.diasDesdeUltima(S, 'v1', '2026-04-01') === 7,
    'depois da troca, a última é 25/03 (7 dias) — o cache se refez',
    String(E.diasDesdeUltima(S, 'v1', '2026-04-01')));
  ok(E.cargaJanela(S, 'v1', '2026-04-01', 10) === 1,
    'e a carga da janela de 10 dias enxerga o dia novo',
    String(E.cargaJanela(S, 'v1', '2026-04-01', 10)));

  /* e o aviso explícito também funciona, para quem mexer em S.escalas por
     fora sem passar por garantirDia */
  S.escalas['2026-03-20'] = { slots: { FOTO: { vid: 'v1', status: 'pendente', fixo: false } }, plantao: [], obs: '' };
  delete S.escalas['2026-03-01'];
  E.esqueceOsDias(S);
  ok(E.diasDesdeUltima(S, 'v1', '2026-03-22') === 2,
    'esqueceOsDias() faz o motor reler S.escalas depois de troca externa',
    String(E.diasDesdeUltima(S, 'v1', '2026-03-22')));
}


/* =========================================================================
   11 · A LISTA DE IDs NÃO PODE ESTOURAR A URL

   `.in('voluntario_id', volIds)` vira query string de um GET: 36 letras por
   UUID mais vírgula. Medido com o próprio cliente do Supabase, a consulta de
   `plantoes` (que tem DOIS `.in`) passa de 8 KB por volta de 150 voluntários
   num mesmo ministério — e 8 KB é o teto padrão do nginx que roda na frente
   do PostgREST. Acima disso a resposta é 414, o erro sobe (e deve subir), e
   a tela do líder morre inteira.

   O gatilho é 150 pessoas em UM ministério, não na igreja. Hoje o maior tem
   17, então isto é defesa contra o crescimento — e o modo de falhar é o pior
   que existe: tela branca, sem pista, para quem não mudou nada.
   ========================================================================= */
{
  const chamadas = [];
  const consulta = (ids) => { chamadas.push(ids.length); return Promise.resolve({ data: ids.map(id => ({ id })) }); };

  const r0 = await emLotes([], consulta);
  ok(r0.data.length === 0 && chamadas.length === 0, 'lista vazia não consulta nada');

  chamadas.length = 0;
  const cem = Array.from({ length: 100 }, (_, i) => 'id' + i);
  const r1 = await emLotes(cem, consulta);
  ok(chamadas.length === 1 && r1.data.length === 100,
    '100 ids vão numa consulta só (é o tamanho do lote)', JSON.stringify(chamadas));

  chamadas.length = 0;
  const muitos = Array.from({ length: 250 }, (_, i) => 'id' + i);
  const r2 = await emLotes(muitos, consulta);
  ok(chamadas.length === 3, '250 ids viram três consultas', JSON.stringify(chamadas));
  ok(r2.data.length === 250, 'e NENHUM id se perde no caminho', String(r2.data.length));
  ok(new Set(r2.data.map(x => x.id)).size === 250, 'e nenhum vem repetido');

  /* E O ERRO DE UM LOTE DERRUBA O CONJUNTO. Meio resultado é pior que
     nenhum: lista parcial de `escalacoes` faz o robô das 9h ler "o líder não
     montou" e `salvar_dia` apaga o mês. */
  let n = 0;
  const comFalha = (ids) => Promise.resolve(
    ++n === 2 ? { data: null, error: { code: '500', message: 'boom' } } : { data: ids.map(id => ({ id })) });
  const r3 = await emLotes(muitos, comFalha);
  ok(!!r3.error, 'se UM lote falha, o conjunto devolve erro em vez de lista parcial',
    JSON.stringify(r3).slice(0, 80));
}


console.log(falhas
  ? `\no-que-os-testes-nao-pegavam: ${falhas} falha(s) em ${feitas}`
  : `\no-que-os-testes-nao-pegavam: ${feitas}/${feitas} ok`);
process.exit(falhas ? 1 : 0);
