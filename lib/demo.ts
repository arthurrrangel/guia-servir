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
import { Estado, Nivel, estadoVazio, garantirDia, cultosDoMes, hojeISO, funcoesDoDia, tipoDoDia } from './engine';

const F = (nome: string, ordem: number, simultanea = true, tipos = ['domingo', 'follow']) =>
  ({ id: 'f' + ordem, nome, ordem, simultanea, ativa: true, tipos: tipos as any });

const P = (
  nome: string, funcoes: Record<string, Nivel>, conferido = false, tel = '21999990000',
) => ({
  id: 'v' + nome.toLowerCase().replace(/\W/g, ''), nome, tel, ativo: true, limiteMes: 4,
  token: 'tok' + nome.toLowerCase().replace(/\W/g, ''),
  funcoes, conferido,
  confirmadas: Object.fromEntries(Object.keys(funcoes).map(f => [f, conferido])),
  indisponivel: [] as string[], disponivel: [] as string[],
});

export function estadoDemo(): Estado {
  const S = estadoVazio();
  (S as any).temAcesso = true;
  S.equipe = 'Mídia';
  S.funcoes = [
    F('PROJEÇÃO', 1), F('ILUMINAÇÃO', 2), F('EDIÇÃO', 3, false), F('FOTO', 4), F('FILMAGEM', 5),
    F('HEAD', 6, true, ['domingo']),
    F('TRANSMISSÃO (CORTE + PTZ)', 7, true, ['domingo']),
    F('CÂMERA 1', 8, true, ['domingo']),
    F('CÂMERA 2', 9, true, ['domingo']),
  ];
  S.voluntarios = [
    P('Arthur Rangel', { 'PROJEÇÃO': 'titular' }, true),
    P('Amanda Ribeiro de Souza', { 'PROJEÇÃO': 'titular', 'ILUMINAÇÃO': 'titular' }),
    P('Giovana Rosalem', { 'PROJEÇÃO': 'titular', 'ILUMINAÇÃO': 'titular', 'FOTO': 'titular', 'HEAD': 'titular', 'TRANSMISSÃO (CORTE + PTZ)': 'titular', 'CÂMERA 1': 'titular', 'CÂMERA 2': 'titular' }),
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
  const dias = cultosDoMes(ano, mes);
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
  S.voluntarios.forEach((v, i) => {
    if (i % 3 === 0) v.disponivel = dias.slice(0, 3);
    if (i % 5 === 0) v.indisponivel = [dias[1]];
  });
  return S;
}

export const demoLigado = () =>
  process.env.NODE_ENV === 'development'
  && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('demo');

/* Fixture da página do voluntário. Mesma forma que o eu_dados devolve. */
export function euDemo() {
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
  return {
    nome: 'Giovana Rosalem',
    equipe: 'Mídia',
    escalas: [
      { culto_id: 'c1', data: prox[0], funcao: 'PROJEÇÃO', status: 'pendente', primeira_vez: false, plantao: false },
      { culto_id: 'c1', data: prox[0], funcao: doTipo(0, 'CÂMERA 1', 'FILMAGEM'), status: 'pendente', primeira_vez: true, plantao: false },
      { culto_id: 'c2', data: prox[1] || prox[0], funcao: 'FOTO', status: 'confirmado', primeira_vez: false, plantao: false },
      { culto_id: 'c3', data: prox[2] || prox[0], funcao: doTipo(2, 'HEAD', 'ILUMINAÇÃO'), status: 'recusado', primeira_vez: false, plantao: false },
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
    dias: cultosDoMes(ano, mes).concat(cultosDoMes(ano, mes === 12 ? 1 : mes + 1)).filter(d => d >= hoje).slice(0, 12),
  };
}
