/* ===========================================================================
   HARNESS DE DESIGN — só existe em desenvolvimento.

   Abre todas as telas de líder com dados realistas sem precisar de sessão do
   Supabase. É o que permite iterar no visual localmente em vez de publicar a
   cada ajuste. O Shell só olha para isto quando NODE_ENV === 'development',
   então em produção o bloco inteiro vira código morto e some no build.

   Os dados imitam o time real (17 pessoas, 9 áreas, níveis declarados e não
   conferidos) porque densidade falsa esconde problema de layout: uma tela
   linda com 3 pessoas costuma quebrar com 17.
   =========================================================================== */
import { Estado, Nivel, type Status, estadoVazio, garantirDia, cultosDoMes, cultosAte, hojeISO, funcoesDoDia, tipoDoDia, resumoDia } from './engine';

const F = (nome: string, ordem: number, simultanea = true, tipos = ['domingo', 'follow'], exigeSexo?: 'M' | 'F') =>
  ({ id: 'f' + ordem, nome, ordem, simultanea, ativa: true, tipos: tipos as any, exigeSexo });

const P = (
  nome: string, funcoes: Record<string, Nivel>, conferido = false, tel = '21999990000',
) => ({
  id: 'v' + nome.toLowerCase().replace(/\W/g, ''), nome, tel, ativo: true, limiteMes: 4,
  token: 'tok' + nome.toLowerCase().replace(/\W/g, ''),
  funcoes, conferido,
  confirmadas: Object.fromEntries(Object.keys(funcoes).map(f => [f, conferido])),
  indisponivel: [] as string[], disponivel: [] as string[],
});

export function estadoDemo(variante = ''): Estado {
  const S = estadoVazio();
  S.temAcesso = true;
  S.equipe = 'Mídia';
  S.funcoes = [
    F('PROJEÇÃO', 1), F('ILUMINAÇÃO', 2), F('EDIÇÃO', 3, false), F('FOTO', 4), F('FILMAGEM', 5),
    F('HEAD', 6, true, ['domingo']),
    F('TRANSMISSÃO (CORTE + PTZ)', 7, true, ['domingo']),
    F('CÂMERA 1', 8, true, ['domingo']),
    F('CÂMERA 2', 9, true, ['domingo']),
    /* 18/09/2026: um posto com a regra do prédio, para o harness cobrir o
       estado que só existe quando alguém não informou o sexo. Sem ele, os
       três avisos do topo do /time nunca apareciam no desenvolvimento e eu
       só veria o layout deles em produção, com gente de verdade. */
    F('APOIO NO BANHEIRO', 10, true, ['domingo'], 'F'),
  ];
  /* 01/10/2026: grupos por área, para o harness mostrar "Mandar nos grupos"
     já configurado. APOIO NO BANHEIRO fica de fora de propósito: é o caso
     da função que só vai no grupo geral. */
  S.config.grupos = [
    { id: 'gd1', nome: 'Mídia · Projeção e luz', funcoes: ['f1', 'f2'] },
    { id: 'gd2', nome: 'Mídia · Foto e vídeo', funcoes: ['f3', 'f4', 'f5'] },
    { id: 'gd3', nome: 'Mídia · Transmissão', funcoes: ['f6', 'f7', 'f8', 'f9'] },
  ];
  S.voluntarios = [
    P('Arthur Rangel', { 'PROJEÇÃO': 'titular' }, true),
    /* Amanda informou, Giovana não: é o par que faz os avisos do topo do
       /time aparecerem no harness. */
    { ...P('Amanda Ribeiro de Souza', { 'PROJEÇÃO': 'titular', 'ILUMINAÇÃO': 'titular', 'APOIO NO BANHEIRO': 'titular' }), sexo: 'F' as const },
    P('Giovana Rosalem', { 'PROJEÇÃO': 'titular', 'ILUMINAÇÃO': 'titular', 'FOTO': 'titular', 'HEAD': 'titular', 'TRANSMISSÃO (CORTE + PTZ)': 'titular', 'CÂMERA 1': 'titular', 'CÂMERA 2': 'titular', 'APOIO NO BANHEIRO': 'titular' }),
    P('William Silva', { 'PROJEÇÃO': 'titular', 'ILUMINAÇÃO': 'titular', 'TRANSMISSÃO (CORTE + PTZ)': 'titular' }),
    P('Eduardo Rodrigues', { 'ILUMINAÇÃO': 'titular', 'CÂMERA 1': 'reserva', 'CÂMERA 2': 'reserva', 'TRANSMISSÃO (CORTE + PTZ)': 'treino' }),
    P('Mateus Dourado', { 'ILUMINAÇÃO': 'titular', 'TRANSMISSÃO (CORTE + PTZ)': 'treino', 'CÂMERA 1': 'treino', 'CÂMERA 2': 'treino' }),
    P('João Victor', { 'EDIÇÃO': 'titular', 'FOTO': 'titular', 'FILMAGEM': 'titular', 'HEAD': 'titular' }),
    P('Kaylane Brito', { 'EDIÇÃO': 'titular', 'FOTO': 'titular' }, true),
    P('Maria Eduarda', { 'EDIÇÃO': 'titular', 'FILMAGEM': 'titular', 'FOTO': 'treino' }, true),
    P('Milena Sales', { 'FOTO': 'titular' }, true),
    P('Fernanda Alencar', { 'FILMAGEM': 'titular' }, true),
    P('Nadia Madeira', { 'FILMAGEM': 'titular', 'CÂMERA 1': 'treino', 'CÂMERA 2': 'treino' }),
    P('Natan Gomes Pontes', { 'FOTO': 'treino', 'FILMAGEM': 'treino' }),
    P('Simone Alencar', { 'HEAD': 'titular' }, true),
    P('Julia Baldez', { 'TRANSMISSÃO (CORTE + PTZ)': 'titular' }, true),
    P('Lana Baldez', { 'TRANSMISSÃO (CORTE + PTZ)': 'treino' }),
    P('Malu Caffaro', { 'FOTO': 'reserva', 'FILMAGEM': 'reserva' }),
  ];

  /* Um mês montado de verdade: escala cheia, alguns confirmados, um recusado e
     um furo. Sem isso eu desenharia só o estado feliz. */
  const hoje = hojeISO();
  const [ano, mes] = [+hoje.slice(0, 4), +hoje.slice(5, 7)];
  /* ESTE MÊS E O PRÓXIMO (30/09/2026). Só o mês corrente deixava o harness
     cego no fim de todo mês: no dia 30 os cultos de setembro já tinham
     passado, o próximo culto caía em outubro sem escala, e o painel e a
     escala só desenhavam o estado "monte o mês", nunca um culto por vir
     montado. Com o mês seguinte montado, o fim do mês desenha o que o líder
     vê de verdade quando o robô do dia 26 já rodou. */
  const [anoS, mesS] = mes === 12 ? [ano + 1, 1] : [ano, mes + 1];
  const dias = [...cultosDoMes(ano, mes), ...cultosDoMes(anoS, mesS)];
  /* O DEMO NÃO PODE MENTIR. Ele usava um ciclo único de status para o mês
     inteiro, e com isso um domingo que ainda vai acontecer nascia com alguém
     marcado como FUROU. Eu desenhei a tela olhando para esse dado e quase
     tratei "furo no futuro" como um caso a suportar. Passado e futuro têm
     estados diferentes porque são coisas diferentes. */
  const passadas = ['confirmado', 'confirmado', 'confirmado', 'furou', 'confirmado', 'recusado'] as const;
  const futuras = ['pendente', 'pendente', 'confirmado', 'pendente', 'recusado', 'pendente', 'confirmado'] as const;
  let n = 0;
  for (const d of dias) {
    const dia = garantirDia(S, d);
    dia.cultoId = 'c' + d;
    const ciclo = d < hoje ? passadas : futuras;
    for (const f of funcoesDoDia(S, d)) {
      const aptos = S.voluntarios.filter(v => ['titular', 'reserva'].includes(v.funcoes[f.nome]));
      if (!aptos.length) continue;
      const v = aptos[n % aptos.length];
      dia.slots[f.nome] = {
        vid: v.id, status: ciclo[n % ciclo.length], fixo: n % 11 === 0,
        primeiraVez: n % 13 === 0,
        respondidoEm: new Date(Date.parse(d + 'T12:00:00Z') - 3 * 86400000).toISOString(),
        /* metade entrou junto com o mês, metade entrou nos últimos dias:
           é assim que a escala real muda depois de publicada */
        escaladoEm: new Date(Date.now() - (n % 4 === 0 ? 2 : 26) * 86400000).toISOString(),
      };
      n++;
    }
    dia.plantao = [S.voluntarios[(n + 3) % S.voluntarios.length].id];
    if (d === dias[0]) dia.obs = 'Chegar 18h, tem batismo antes do culto.';
  }
  /* respostas de disponibilidade, para o painel do dia não ficar vazio */
  const porVir = dias.filter(d => d >= hoje);
  /* 01/10/2026: o repertório ligado, com o setlist no primeiro culto que vem
     (Spotify e YouTube; o Deezer em branco, para o harness mostrar campo
     preenchido e campo vazio juntos) */
  S.config.repertorio = true;
  if (porVir[0] && S.escalas[porVir[0]]) {
    S.escalas[porVir[0]].repertorio = {
      spotify: 'https://open.spotify.com/playlist/37i9dQZF1DX0XUfTFmNBRM',
      youtube: 'https://youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG',
    };
  }
  /* 105 · a ordem do culto no SEGUNDO culto que vem: o primeiro continua
     desenhando o repertório só com os links, como as provas da 100 conhecem */
  if (porVir[1] && S.escalas[porVir[1]]) S.escalas[porVir[1]].ordem = ORDEM_DEMO.map(i => ({ ...i }));
  S.voluntarios.forEach((v, i) => {
    if (i % 3 === 0) v.disponivel = porVir.slice(0, 3);
    if (i % 5 === 0) v.indisponivel = [porVir[1]].filter(Boolean);
  });
  /* 108 · `?demo=convidado`: o banco já sabe guardar quem é de fora da
     lista, e o primeiro culto que vem tem a FOTO com um "Guest Rafa" (nome
     inventado), para o harness desenhar o posto coberto por alguém de fora. */
  if (variante === 'convidado') {
    S.recursos = { convidados: true };
    const d0 = porVir[0] && S.escalas[porVir[0]];
    if (d0) { delete d0.slots['FOTO']; d0.convidados = { FOTO: 'Guest Rafa' }; }
  }
  /* 107 · `?demo=hoje`: um evento HOJE e outro ontem, montados, para o
     harness desenhar a chegada do dia e o "como foi" (o mês do demo quase
     nunca tem culto no próprio dia). Sem a variante, o estado é o de sempre. */
  if (variante === 'hoje') {
    const ontem = new Date(Date.parse(hoje + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10);
    for (const [d, nome] of [[hoje, 'Culto de teste'], [ontem, 'Ensaio de teste']] as const) {
      const dia = garantirDia(S, d);
      dia.cultoId = 'e' + d; dia.evento = nome; dia.inicio = '19:30';
      const pares: [string, number, Status][] = [['PROJEÇÃO', 0, 'confirmado'], ['ILUMINAÇÃO', 3, 'pendente'],
                                                  ['FOTO', 6, 'confirmado'], ['FILMAGEM', 8, 'recusado']];
      for (const [f, i, st] of pares) dia.slots[f] = { vid: S.voluntarios[i].id, status: st, fixo: false };
      dia.plantao = [];
    }
  }
  return S;
}

/* mora em ./demo-ligado agora, para poder ser perguntado sem carregar este
   arquivo. Reexportado só para quem já importava daqui. */
export { demoLigado } from './demo-ligado';

/* o setlist do harness (100): as três plataformas, com link de verdade na forma */
/* 105 · músicas e artistas inventados: a fixture desenha a tela, não toca */
export const ORDEM_DEMO = [
  { t: 'momento' as const, titulo: 'Abertura', quem: 'Pastor', min: 5 },
  { t: 'musica' as const, titulo: 'Canção da Manhã', artista: 'Banda Exemplo', tom: 'G', bpm: 72,
    cifra: 'https://www.cifraclub.com.br/banda-exemplo/cancao-da-manha/', quem: 'Lia', min: 6,
    nota: 'Começa só voz e teclado' },
  { t: 'musica' as const, titulo: 'Rio de Graça', artista: 'Coral Modelo', tom: 'F#m', bpm: 68, min: 5 },
  { t: 'musica' as const, titulo: 'Luz no Caminho', tom: 'Bb', min: 6 },
  { t: 'momento' as const, titulo: 'Avisos', min: 5 },
  { t: 'momento' as const, titulo: 'Palavra', quem: 'Pastor', min: 40 },
];
/* 02/10/2026 · o setlist só de músicas (variante `setlist`): tom e BPM em
   todas, a cifra em uma, e uma observação de medley na terceira */
export const SETLIST_DEMO = [
  { t: 'musica' as const, titulo: 'Canção da Manhã', tom: 'E', bpm: 137,
    cifra: 'https://www.cifraclub.com.br/banda-exemplo/cancao-da-manha/' },
  { t: 'musica' as const, titulo: 'Rio de Graça', tom: 'D', bpm: 65 },
  { t: 'musica' as const, titulo: 'Luz no Caminho', tom: 'C', bpm: 62,
    nota: 'Medley começando da ponte de Manhã de Sol (Coral Modelo).' },
  { t: 'musica' as const, titulo: 'Só a Tua Presença', tom: 'C', bpm: 65 },
];
const REP_DEMO = {
  spotify: 'https://open.spotify.com/playlist/37i9dQZF1DX0XUfTFmNBRM',
  deezer: 'https://link.deezer.com/s/30AbCdEfGh',
  youtube: 'https://youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG',
};

/* Fixture da página do voluntário. Mesma forma que o eu_dados devolve. */
/* `?demo=confirmado` mostra a tela de quem já respondeu tudo: é a única em
   que o ingresso da próxima escala aparece (16/09/2026). */
export function euDemo(variante: string = '') {
  const hoje = hojeISO();
  const [ano, mes] = [+hoje.slice(0, 4), +hoje.slice(5, 7)];
  const dias = cultosDoMes(ano, mes).filter(d => d >= hoje);
  const prox = dias.length ? dias : cultosDoMes(ano, mes === 12 ? 1 : mes + 1);
  /* último culto que já aconteceu neste mês */
  const jaForam = cultosDoMes(ano, mes).filter(d => d < hoje);
  const passado = jaForam[jaForam.length - 1] || '';
  /* HEAD e CÂMERA só existem no domingo. A primeira versão desta fixture
     escalava HEAD num sábado e a tela mostrava, sem erro nenhum, um estado
     que o motor nunca produz. Harness que mente é pior que harness nenhum:
     eu passo a revisar uma tela que não existe. */
  const doTipo = (i: number, doDomingo: string, doFollow: string) =>
    tipoDoDia(prox[i] || prox[0]) === 'domingo' ? doDomingo : doFollow;
  /* 103 · a troca e a agenda só entram na variante `troca`: a de sempre
     continua desenhando a tela que as outras auditorias conhecem */
  const comTroca = variante === 'troca';
  const todos = cultosDoMes(ano, mes).concat(cultosDoMes(ano, mes === 12 ? 1 : mes + 1)).filter(d => d >= hoje);
  const quarta = (() => {
    /* um evento numa quarta, entre 5 e 12 dias daqui: a agenda do ministério */
    const base = new Date(hoje + 'T12:00:00Z');
    for (let k = 5; k < 13; k++) {
      const d = new Date(base.getTime() + k * 86400000);
      if (d.getUTCDay() === 3) return d.toISOString().slice(0, 10);
    }
    return '';
  })();
  const agoraISO = new Date().toISOString();
  /* 107 · o dia do culto (variantes `hoje` e `hoje-lider`) e o "como foi"
     (variante `comofoi`). As pessoas do time são fictícias. */
  const diaAntes = (n: number) => new Date(new Date(hoje + 'T12:00:00Z').getTime() - n * 86400000).toISOString().slice(0, 10);
  /* os dois últimos cultos (sábado ou domingo) dos últimos sete dias */
  const ultimos = [1, 2, 3, 4, 5, 6, 7].map(diaAntes).filter(d => [0, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay()));
  const ehHoje = variante === 'hoje' || variante === 'hoje-lider';
  const chegou = (min: number) => new Date(Date.now() - min * 60000).toISOString();
  const fixture = {
    nome: 'Giovana Rosalem',
    equipe: 'Mídia',
    escalas: [
      ...(ehHoje ? [{ culto_id: 'h1', funcao_id: 'f1', data: hoje, funcao: 'PROJEÇÃO', status: 'confirmado',
        primeira_vez: false, plantao: false }] : []),
      ...(variante === 'hoje-lider' ? [{ culto_id: 'h1', funcao_id: 'f9', data: hoje, funcao: 'LÍDER 1', status: 'confirmado',
        primeira_vez: false, plantao: false, relata: true, relatorio: '', problemas: '' }] : []),
      { culto_id: 'c1', funcao_id: 'f1', data: prox[0], funcao: 'PROJEÇÃO', status: variante === 'confirmado' ? 'confirmado' : 'pendente', primeira_vez: false, plantao: false, repertorio: REP_DEMO },
      { culto_id: 'c1', funcao_id: 'f2', data: prox[0], funcao: doTipo(0, 'CÂMERA 1', 'FILMAGEM'), status: variante === 'confirmado' ? 'confirmado' : 'pendente', primeira_vez: true, plantao: false, repertorio: REP_DEMO },
      /* o segundo culto só com o YouTube: o setlist pode vir parcial */
      { culto_id: 'c2', funcao_id: 'f3', data: prox[1] || prox[0], funcao: 'FOTO', status: 'confirmado', primeira_vez: false, plantao: false,
        repertorio: { youtube: 'https://youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG' } },
      { culto_id: 'c3', funcao_id: 'f4', data: prox[2] || prox[0], funcao: doTipo(2, 'HEAD', 'ILUMINAÇÃO'), status: 'recusado', primeira_vez: false, plantao: false },
      /* 103 · escalada no evento da quarta, para a agenda destacar o dia */
      ...(comTroca && quarta ? [{ culto_id: 'e1', funcao_id: 'f1', data: quarta, funcao: 'PROJEÇÃO', status: 'confirmado',
        primeira_vez: false, plantao: false, evento: 'Ensaio Geral', inicio: '19:30:00' }] : []),
      { culto_id: 'c4', data: prox[3] || prox[0], funcao: '', status: '', primeira_vez: false, plantao: true },
      /* posto de líder do dia num culto que JÁ passou: é a única combinação em
         que o formulário de relatório aparece. Sem esta linha o componente
         nunca renderizava no harness e eu estaria revisando uma tela que não
         existe (foi o que aconteceu com o HEAD escalado num sábado). */
      ...(passado ? [{
        culto_id: 'c9', data: passado, funcao: 'LÍDER 1', status: 'confirmado',
        primeira_vez: false, plantao: false,
        relata: true, relatorio: '', problemas: '',
      }] : []),
    ],
    indisponivel: [prox[4] || ''].filter(Boolean),
    disponivel: [prox[1] || ''].filter(Boolean),
    dias: todos.slice(0, 12),
    /* 103 · dois pedidos recebidos (um que dá, um num dia em que ela avisou
       que não pode), um feito e esperando, e uma resposta "não pode" */
    ...(comTroca ? {
      trocas: [
        { id: 't1', papel: 'me_pediram', culto_id: 'c7', data: todos[5] || todos[todos.length - 1], inicio: null, evento: null,
          funcao_id: 'f5', funcao: 'EDIÇÃO', outro: 'Rafael Prado', status: 'aberta', impede: null,
          criado_em: agoraISO, respondido_em: null },
        { id: 't2', papel: 'me_pediram', culto_id: 'c8', data: prox[4] || todos[4], inicio: null, evento: null,
          funcao_id: 'f3', funcao: 'FOTO', outro: 'Bruno Lima', status: 'aberta', impede: 'INDISPONIVEL',
          criado_em: agoraISO, respondido_em: null },
        { id: 't3', papel: 'pedi', culto_id: 'c3', data: prox[2] || prox[0], inicio: null, evento: null,
          funcao_id: 'f4', funcao: doTipo(2, 'HEAD', 'ILUMINAÇÃO'), outro: 'Larissa Moura', status: 'aberta', impede: null,
          criado_em: agoraISO, respondido_em: null },
        { id: 't4', papel: 'pedi', culto_id: 'c3', data: prox[2] || prox[0], inicio: null, evento: null,
          funcao_id: 'f4', funcao: doTipo(2, 'HEAD', 'ILUMINAÇÃO'), outro: 'Caio Mendes', status: 'recusada', impede: null,
          criado_em: agoraISO, respondido_em: agoraISO },
      ],
      eventos: quarta ? [{ culto_id: 'e1', data: quarta, evento: 'Ensaio Geral', inicio: '19:30:00', fim: null,
                           escalado: true, resposta: null }] : [],
      espaco: {
        ok: true, equipe_slug: 'midia', responsavel: 'Arthur', tem_pin: true,
        voluntario: { desde: '2026-03-01' },
        funcoes: [
          { funcao: 'PROJEÇÃO', nivel: 'titular', conferido: true },
          { funcao: 'FOTO', nivel: 'reserva', conferido: true },
          { funcao: 'EDIÇÃO', nivel: 'reserva', conferido: false },
        ],
      },
    } : {}),
    /* 106 · os convites para cobrir, só na variante `chamada`: um aberto,
       um num dia em que ela avisou que não pode, e um que outra pessoa
       já preencheu */
    ...(variante === 'chamada' ? {
      chamadas: [
        { id: 'ch1', culto_id: 'c5', funcao_id: 'f6', funcao: 'HEAD', data: todos[3] || todos[todos.length - 1],
          evento: null, inicio: null, status: 'aberta', aberta: true, impede: null, criado_em: agoraISO },
        { id: 'ch2', culto_id: 'c8', funcao_id: 'f5', funcao: 'EDIÇÃO', data: prox[4] || todos[4],
          evento: null, inicio: null, status: 'aberta', aberta: true, impede: 'INDISPONIVEL', criado_em: agoraISO },
        { id: 'ch3', culto_id: 'c6', funcao_id: 'f4', funcao: 'FOTO', data: todos[6] || todos[todos.length - 1],
          evento: null, inicio: null, status: 'preenchida', aberta: false, impede: null, criado_em: agoraISO },
      ],
    } : {}),
    /* 107 · o dia de hoje: na `hoje`, a pessoa ainda não chegou; na
       `hoje-lider`, ela lidera o dia, já chegou, e o time vem chegando */
    ...(ehHoje ? {
      hoje: { ok: true, cultos: [{
        culto_id: 'h1', data: hoje, evento: null, inicio: null,
        chegou_em: variante === 'hoje-lider' ? chegou(42) : null,
        marcado_por: variante === 'hoje-lider' ? 'eu' : null,
        relata: variante === 'hoje-lider',
        time: variante === 'hoje-lider' ? [
          { voluntario_id: '00000000-0000-4000-8000-000000000001', nome: 'Giovana Rosalem', funcoes: ['PROJEÇÃO', 'LÍDER 1'], chegou_em: chegou(42), marcado_por: 'eu', eu: true },
          { voluntario_id: '00000000-0000-4000-8000-000000000002', nome: 'Marina Teixeira', funcoes: ['CÂMERA 1'], chegou_em: chegou(31), marcado_por: 'eu', eu: false },
          { voluntario_id: '00000000-0000-4000-8000-000000000003', nome: 'Lucas Andrade', funcoes: ['FOTO'], chegou_em: null, marcado_por: null, eu: false },
          { voluntario_id: '00000000-0000-4000-8000-000000000004', nome: 'Paula Ribeiro', funcoes: ['ILUMINAÇÃO'], chegou_em: chegou(12), marcado_por: 'lider_do_dia', eu: false },
          { voluntario_id: '00000000-0000-4000-8000-000000000005', nome: 'Tiago Nunes', funcoes: ['EDIÇÃO'], chegou_em: null, marcado_por: null, eu: false },
        ] : null,
      }] },
    } : {}),
    /* 107 · como foi: ontem sem resposta, e um culto de seis dias atrás já
       respondido */
    ...(variante === 'comofoi' ? {
      comoFoi: [
        { culto_id: 'cf1', data: ultimos[0], evento: null, inicio: null, funcoes: ['PROJEÇÃO', 'CÂMERA 1'],
          resposta: null, texto: null, atualizado_em: null },
        { culto_id: 'cf2', data: ultimos[1], evento: null, inicio: null, funcoes: ['FOTO'],
          resposta: 'bom', texto: null, atualizado_em: agoraISO },
      ],
      espaco: { ok: true, equipe_slug: 'midia', artigo: 'a', responsavel: 'Arthur', tem_pin: true,
                voluntario: { desde: '2026-03-01' }, funcoes: [{ funcao: 'PROJEÇÃO', nivel: 'titular', conferido: true }] },
    } : {}),
    /* 105 · a ordem do culto só na variante `ordem`: a do Louvor (outro
       ministério) no primeiro culto, e a do segundo culto sem hora de evento.
       O terceiro é o dia recusado: a ordem dele vem do banco, e a tela não
       pode mostrá-la. */
    ...(variante === 'ordem' ? {
      ordens: [
        { culto_id: 'c1', data: prox[0], evento: null, inicio: null, equipe: 'Louvor', minha: false, ordem: ORDEM_DEMO },
        { culto_id: 'c2', data: prox[1] || prox[0], evento: null, inicio: null, equipe: 'Louvor', minha: false,
          ordem: ORDEM_DEMO.slice(1, 3) },
        { culto_id: 'c3', data: prox[2] || prox[0], evento: null, inicio: null, equipe: 'Louvor', minha: false,
          ordem: ORDEM_DEMO.slice(0, 2) },
      ],
    } : {}),
  };
  /* 02/10/2026 · `?demo=setlist`: alguém do Louvor, com os links do
     repertório e a ordem do próprio ministério. No primeiro culto a ordem é
     só música (vai inteira para baixo dos links, com tom, BPM e observações,
     e a seção "Ordem do culto" não a repete); no segundo ela tem momentos e
     continua na seção. Nomes e músicas inventados. */
  if (variante === 'setlist') {
    return {
      ...fixture,
      nome: 'Lia Martins', equipe: 'Louvor',
      escalas: [
        { culto_id: 'c1', funcao_id: 'fv1', data: prox[0], funcao: 'VOZ', status: 'pendente', primeira_vez: false, plantao: false, repertorio: REP_DEMO },
        { culto_id: 'c2', funcao_id: 'fv2', data: prox[1] || prox[0], funcao: 'VIOLÃO', status: 'confirmado', primeira_vez: false, plantao: false,
          repertorio: { youtube: 'https://youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG' } },
      ],
      ordens: [
        { culto_id: 'c1', data: prox[0], evento: null, inicio: null, equipe: 'Louvor', minha: true, ordem: SETLIST_DEMO },
        { culto_id: 'c2', data: prox[1] || prox[0], evento: null, inicio: null, equipe: 'Louvor', minha: true, ordem: ORDEM_DEMO },
      ],
    };
  }
  return fixture;
}

/* Fixture da visão da igreja. Cinco áreas, com os cinco estados que a leitura
   do painel distingue (sem ninguém, sem responder, coberto, não pode, sem
   culto) — senão o harness desenha um estado só e o resto continua invisível.
   Os números vieram da produção do Arthur em 04/09, que é onde o defeito de
   "nome colado na linha de baixo" apareceu. */
export function visaoGeralDemo() {
  const hoje = hojeISO();
  const [ano, mes] = [+hoje.slice(0, 4), +hoje.slice(5, 7)];
  /* o próximo culto de verdade, mesmo que caia no mês seguinte: no fim do
     mês esta linha voltava para o primeiro domingo do mês que já passou, e o
     painel desenhava "A igreja no domingo 06/09" no dia 30/09 */
  const prox = cultosAte(hoje, 8)[0] || cultosDoMes(ano, mes)[0];
  const a = (
    slug: string, equipe: string, ordem: number, postos: number, preenchidos: number,
    extra: Partial<{ vagas: number | null; furos: number; recusados: number; pendentes: number; candidaturas_novas: number; proxima_data: string | null }> = {},
  ) => ({
    slug, equipe, ordem, proxima_data: prox, tipo: 'domingo',
    postos, preenchidos, confirmados: preenchidos,
    vagas: postos - preenchidos, furos: 0, recusados: 0, pendentes: 0,
    candidaturas_novas: 0, ...extra,
  });
  /* A LINHA DA MÍDIA SAI DO ESTADO DA MÍDIA (30/09/2026): escrita à mão, ela
     dizia "9 de 9, 4 sem resposta" ao lado dos números do próprio Painel,
     que o harness monta de `estadoDemo()` (10 de 10, 6 sem resposta, 1 não
     pode). As outras áreas não têm estado no harness e seguem à mão. */
  const S = estadoDemo();
  const r = S.escalas[prox] ? resumoDia(S, prox) : null;
  const midia = r
    ? a('midia', 'Mídia', 10, r.total, r.preenchidos, {
        vagas: r.vagas.length, furos: r.furos, recusados: r.recusados, pendentes: r.pendentes,
        candidaturas_novas: (candidaturasDemo() as { status: string }[]).filter(c => c.status === 'enviada' || c.status === 'em_analise').length,
      })
    : a('midia', 'Mídia', 10, funcoesDoDia(S, prox).length, 0);
  return [
    { ...midia, confirmados: r ? r.confirmados : 0, tipo: tipoDoDia(prox) },
    a('louvor', 'Louvor', 20, 10, 0, { candidaturas_novas: 4 }),
    a('kids', 'GUIA Kids', 30, 9, 0),
    a('servico', 'Connect', 40, 16, 0, { candidaturas_novas: 6 }),
    a('livraria', 'Livraria', 50, 2, 2, { vagas: 0, recusados: 1 }),
  ];
}

/* Fixture de "quem quer entrar". Os quatro estados que a tela distingue —
   esperando, aprovada, encerrada e uma com observação longa — porque com uma
   candidatura só o harness desenha um caso e os outros três continuam
   invisíveis. */
export function candidaturasDemo() {
  const dias = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
  const c = (
    id: string, status: string, nome: string, tel: string, funcoes: string[],
    criado: number, extra: Partial<{ observacao: string | null; decidido_em: string | null }> = {},
  ) => ({
    id, status: status as any, criado_em: dias(criado), atualizado_em: dias(criado),
    observacao: null, nota_interna: null, decidido_por: null, decidido_em: null,
    voluntario_id: status === 'aprovada' ? 'v' + id : null,
    pessoas: { id: 'p' + id, nome, telefone: tel, email: null },
    candidatura_funcoes: funcoes.map(f => ({ funcoes: { nome: f } })),
    ...extra,
  });
  return [
    c('c1', 'enviada', 'Beatriz Marques', '21999990001', ['PROJEÇÃO', 'FOTO'], 1),
    c('c2', 'conversa', 'Rafael Nogueira do Nascimento', '21999990002', ['EDIÇÃO'], 3,
      { observacao: 'Sirvo na mídia da igreja onde eu congregava antes, mexo com Premiere e um pouco de After. Só não posso no primeiro domingo do mês.' }),
    c('c3', 'aprovada', 'Luana Prado', '21999990003', ['ILUMINAÇÃO'], 9, { decidido_em: dias(8) }),
    c('c4', 'recusada', 'Thiago Alves', '21999990004', ['TRANSMISSÃO (CORTE + PTZ)'], 22, { decidido_em: dias(20) }),
  ] as any;
}

/* Os ministérios da casa. Espelha visaoGeralDemo() de propósito: se a lista do
   seletor e a visão da igreja discordarem, o harness desenha uma tela que o
   produto nunca produz — e revisar tela que não existe é pior que não revisar.
   A Mídia carrega o id 'demo' porque estadoDemo() é a Mídia. */
export function equipesDemo() {
  return [
    { id: 'demo',       nome: 'Mídia',     slug: 'midia',    whatsapp_grupo: null, ordem: 10 },
    { id: 'demo-louvor',nome: 'Louvor',    slug: 'louvor',   whatsapp_grupo: null, ordem: 20 },
    { id: 'demo-kids',  nome: 'GUIA Kids', slug: 'kids',     whatsapp_grupo: null, ordem: 30 },
    { id: 'demo-conn',  nome: 'Connect',   slug: 'servico',  whatsapp_grupo: null, ordem: 40 },
    { id: 'demo-livr',  nome: 'Livraria',  slug: 'livraria', whatsapp_grupo: null, ordem: 50 },
  ] as any[];
}

/* Os números do bloco de pendências do /painel. Todos os cinco itens vêm
   diferentes de zero de propósito: a lista é `.filter(Boolean)` e um zero
   apaga a linha. Com um item só, a varredura mede uma linha e as outras
   quatro continuam invisíveis — inclusive a variante `grave`, que é a única
   com marca vermelha. */
/* 30/09/2026 · AS CONTAS SAEM DAS FIXTURES, E NÃO DE NÚMEROS ESCRITOS À MÃO.
   Eram 2 candidaturas novas e 1 em conversa, enquanto `candidaturasDemo()`
   tem uma de cada: o selo de Entradas na casca nova dizia 3 e a própria tela
   de Entradas dizia "2 pessoas esperando você". O mesmo com "3 pessoas sem
   conferir" num time de fixture com 10. Harness que discorda de si mesmo
   desenha uma tela que o produto nunca produz. A conta aqui é a mesma da
   RPC `painel_ministerio` (supabase/23), só que sobre as fixtures. */
export function painelDemo() {
  const S = estadoDemo();
  const hoje = hojeISO();
  const ativos = S.voluntarios.filter(v => v.ativo);
  const cands = candidaturasDemo() as { status: string }[];
  const funcoesSemGente = S.funcoes.filter(f => f.ativa && !ativos.some(v => v.funcoes[f.nome])).length;
  const vagasPendentes = Object.entries(S.escalas).filter(([d]) => d >= hoje)
    .reduce((n, [, dia]) => n + Object.values(dia.slots).filter(x => x?.vid && x.status === 'pendente').length, 0);
  return {
    voluntarios: ativos.length, funcoes: S.funcoes.filter(f => f.ativa).length,
    candidaturas_novas: cands.filter(c => c.status === 'enviada' || c.status === 'em_analise').length,
    aguardando_conversa: cands.filter(c => c.status === 'conversa' || c.status === 'entrevista').length,
    sem_conferir: ativos.filter(v => !v.conferido).length,
    /* 102: a mesma conta da RPC, sobre as fixtures */
    esperando_liberacao: S.voluntarios.filter(v => !v.ativo && v.liberadoEm === null).length,
    sem_disponibilidade: ativos.filter(v => ![...(v.disponivel || []), ...(v.indisponivel || [])].some(d => d >= hoje)).length,
    vagas_pendentes: vagasPendentes, funcoes_sem_gente: funcoesSemGente,
  };
}
