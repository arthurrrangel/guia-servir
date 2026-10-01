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
import { Estado, Nivel, estadoVazio, garantirDia, cultosDoMes, cultosAte, hojeISO, funcoesDoDia, tipoDoDia, resumoDia } from './engine';

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

export function estadoDemo(): Estado {
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
  S.voluntarios.forEach((v, i) => {
    if (i % 3 === 0) v.disponivel = porVir.slice(0, 3);
    if (i % 5 === 0) v.indisponivel = [porVir[1]].filter(Boolean);
  });
  return S;
}

/* mora em ./demo-ligado agora, para poder ser perguntado sem carregar este
   arquivo. Reexportado só para quem já importava daqui. */
export { demoLigado } from './demo-ligado';

/* o setlist do harness (100): as três plataformas, com link de verdade na forma */
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
  return {
    nome: 'Giovana Rosalem',
    equipe: 'Mídia',
    escalas: [
      { culto_id: 'c1', data: prox[0], funcao: 'PROJEÇÃO', status: variante === 'confirmado' ? 'confirmado' : 'pendente', primeira_vez: false, plantao: false, repertorio: REP_DEMO },
      { culto_id: 'c1', data: prox[0], funcao: doTipo(0, 'CÂMERA 1', 'FILMAGEM'), status: variante === 'confirmado' ? 'confirmado' : 'pendente', primeira_vez: true, plantao: false, repertorio: REP_DEMO },
      /* o segundo culto só com o YouTube: o setlist pode vir parcial */
      { culto_id: 'c2', data: prox[1] || prox[0], funcao: 'FOTO', status: 'confirmado', primeira_vez: false, plantao: false,
        repertorio: { youtube: 'https://youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG' } },
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
    sem_disponibilidade: ativos.filter(v => ![...(v.disponivel || []), ...(v.indisponivel || [])].some(d => d >= hoje)).length,
    vagas_pendentes: vagasPendentes, funcoes_sem_gente: funcoesSemGente,
  };
}
