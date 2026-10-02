/* =============================================================================
   A MENSAGEM SAI COMO O LOUVOR ESCREVE — 02/10/2026, noite

   O Arthur mandou a escala de domingo copiada do grupo do Louvor e disse: "as
   mensagens tem que sair assim". Este arquivo prende o formato inteiro, linha
   por linha, com nomes e músicas inventados (o repositório é público):

     - a saudação segue a hora de Brasília ("Boa tarde galera" às 15h);
     - o posto de quem é de fora da lista sai como o líder escreveu ("Guest",
       "Guest Rafa", o técnico de som de outro ministério), sem situação (108);
     - o bloco REPERTÓRIO tem primeiro as músicas, '1. Canção A (E, 67 BPM)
       Lead - Lia', e logo embaixo os links das plataformas;
     - as observações, quando existem, vêm depois do bloco.

   E as regras do posto com alguém de fora da lista: não é vaga, o sorteio não
   mexe, ninguém é chamado para cobrir, conta como coberto e entra na
   assinatura do envio só quando existe.

   Roda com `npm test`. */
import * as E from '../lib/engine.ts';
import { vagaAberta } from '../lib/chamadas.ts';
import { escalaDoMesParaImprimir } from '../lib/imprimir.ts';

let falhas = 0, feitas = 0;
const ok = (c, rot, extra = '') => { feitas++; if (!c) { falhas++; console.log('  FALHOU:', rot, extra ? '\n   ' + extra : ''); } };
const igual = (a, b, rot) => {
  const ok_ = a === b;
  if (!ok_) {
    const la = String(a).split('\n'), lb = String(b).split('\n');
    const i = la.findIndex((l, k) => l !== lb[k]);
    ok(false, rot, `primeira diferença na linha ${i + 1}:\n     obtido   ${JSON.stringify(la[i])}\n     esperado ${JSON.stringify(lb[i])}`);
  } else ok(true, rot);
};

const DIA = '2026-10-04';
const POSTOS = ['DIRIGENTE', 'VOCAL 1', 'VOCAL 2', 'GUITARRA', 'VIOLÃO', 'CONTRABAIXO', 'BATERIA', 'TECLADO', 'SOM'];
function louvor() {
  const S = E.estadoVazio();
  S.equipe = 'Louvor';
  S.config.repertorio = true;
  S.config.saudacao = 'Boa noite galera';
  S.config.prazoConfirmacao = 'Na quarta-feira da semana da escala';
  S.config.rodape = 'Confirma até {PRAZO}. Quem não puder, avisa agora e já indica o substituto.';
  S.funcoes = POSTOS.map((nome, i) => ({ id: 'f' + (i + 1), nome, ordem: i + 1, ativa: true, simultanea: true, tipos: ['domingo', 'follow'] }));
  S.voluntarios = [
    { id: 'v1', nome: 'Pessoa Um', ativo: true, funcoes: { 'VOCAL 1': 'titular' }, indisponivel: [] },
    { id: 'v2', nome: 'Pessoa Dois', ativo: true, funcoes: { 'VOCAL 2': 'titular' }, indisponivel: [] },
    { id: 'v3', nome: 'Pessoa Três', ativo: true, funcoes: { 'VIOLÃO': 'titular', GUITARRA: 'titular' }, indisponivel: [] },
    { id: 'v4', nome: 'Pessoa Quatro', ativo: true, funcoes: { CONTRABAIXO: 'titular' }, indisponivel: [] },
    { id: 'v5', nome: 'Pessoa Cinco', ativo: true, funcoes: { BATERIA: 'titular', TECLADO: 'titular', DIRIGENTE: 'titular', SOM: 'titular' }, indisponivel: [] },
  ];
  const d = E.garantirDia(S, DIA);
  d.cultoId = 'c1';
  d.slots['VOCAL 1'] = { vid: 'v1', status: 'confirmado', fixo: true };
  d.slots['VOCAL 2'] = { vid: 'v2', status: 'confirmado', fixo: true };
  d.slots['VIOLÃO'] = { vid: 'v3', status: 'pendente', fixo: true };
  d.slots['CONTRABAIXO'] = { vid: 'v4', status: 'confirmado', fixo: true };
  d.convidados = { DIRIGENTE: 'Guest Rafa', GUITARRA: 'Guest', BATERIA: 'Guest', TECLADO: 'Guest', SOM: 'Nome de Outro Ministério' };
  d.obs = '08h começa a passagem de som‼️ (se tem setup para montar chegue com 10min de antecedência)';
  d.repertorio = {
    spotify: 'https://open.spotify.com/playlist/0exemploA1b2C3d4E5f6G7',
    deezer: 'https://link.deezer.com/s/exemploAbc123',
    youtube: 'https://youtube.com/playlist?list=PLexemplo123',
  };
  d.ordem = [
    { t: 'musica', titulo: 'Canção A', tom: 'E', bpm: 67, quem: 'Lia' },
    { t: 'musica', titulo: 'Canção B', tom: 'G', bpm: 68, quem: 'Rafa' },
    { t: 'musica', titulo: 'Canção C', tom: 'G#m', bpm: 65, quem: 'Rafa' },
    { t: 'musica', titulo: 'Canção D', tom: 'E', bpm: 69, quem: 'Lia' },
    { t: 'musica', titulo: 'Canção E', tom: 'D', bpm: 65, quem: 'Rafa' },
  ];
  return S;
}
const AS_15H = new Date('2026-10-02T18:00:00Z');   // 15h em Brasília
const LINK = E.linkDoVoluntario('https://guiaservir.com', 'louvor');

console.log('mensagem-do-louvor');

/* 1 · a mensagem inteira, linha por linha ------------------------------- */
igual(E.msgEscala(louvor(), DIA, { link: LINK, agora: AS_15H }), [
  'Boa tarde galera',
  'Escala de domingo (04/10)',
  '',
  'DIRIGENTE', 'Guest Rafa', '',
  'VOCAL 1', 'Pessoa Um (confirmou)', '',
  'VOCAL 2', 'Pessoa Dois (confirmou)', '',
  'GUITARRA', 'Guest', '',
  'VIOLÃO', 'Pessoa Três (falta confirmar)', '',
  'CONTRABAIXO', 'Pessoa Quatro (confirmou)', '',
  'BATERIA', 'Guest', '',
  'TECLADO', 'Guest', '',
  'SOM', 'Nome de Outro Ministério', '',
  '08h começa a passagem de som‼️ (se tem setup para montar chegue com 10min de antecedência)',
  '',
  'REPERTÓRIO',
  '1. Canção A (E, 67 BPM) Lead - Lia',
  '2. Canção B (G, 68 BPM) Lead - Rafa',
  '3. Canção C (G#m, 65 BPM) Lead - Rafa',
  '4. Canção D (E, 69 BPM) Lead - Lia',
  '5. Canção E (D, 65 BPM) Lead - Rafa',
  'Spotify: https://open.spotify.com/playlist/0exemploA1b2C3d4E5f6G7',
  'Deezer: https://link.deezer.com/s/exemploAbc123',
  'YouTube: https://youtube.com/playlist?list=PLexemplo123',
  '',
  'Confirma até Na quarta-feira da semana da escala. Quem não puder, avisa agora e já indica o substituto.',
  'Confirma por aqui: https://guiaservir.com/confirmar/louvor',
].join('\n'), 'a escala do Louvor sai como o ministério escreve');

/* as observações vêm depois do bloco, com o número da música */
{
  const S = louvor();
  S.escalas[DIA].ordem[2].nota = 'medley começando da ponte de outra música';
  const m = E.msgEscala(S, DIA, { link: LINK, agora: AS_15H });
  ok(m.includes('YouTube: https://youtube.com/playlist?list=PLexemplo123\n\nOBSERVAÇÕES\n3. Canção C: medley começando da ponte de outra música\n\nConfirma até'),
    'observação depois dos links, com o número da música', m.split('\n').slice(-8).join(' | '));
}

/* no recorte de um grupo, o convidado do posto vai junto */
{
  const S = louvor();
  const banda = { id: 'g1', nome: 'Louvor · Banda', funcoes: ['f4', 'f5', 'f6', 'f7', 'f8'] };
  const m = E.msgEscala(S, DIA, { link: LINK, grupo: banda, agora: AS_15H });
  ok(m.includes('GUITARRA\nGuest\n') && m.includes('VIOLÃO\nPessoa Três (falta confirmar)'), 'o grupo da banda leva o Guest e a pessoa da lista');
  ok(!m.includes('DIRIGENTE') && !m.includes('VOCAL 1'), 'e só os postos dele');
  ok(m.split('\n')[1] === 'Escala de domingo (04/10) · Louvor · Banda', 'com o nome do grupo no título');
}

/* 2 · a saudação pela hora de Brasília ---------------------------------- */
{
  const h = (iso) => new Date(iso);
  const casos = [
    ['Boa noite galera', '2026-10-02T12:00:00Z', 'Bom dia galera'],        // 9h
    ['Boa noite galera', '2026-10-02T18:00:00Z', 'Boa tarde galera'],      // 15h
    ['Boa tarde galera', '2026-10-02T22:58:00Z', 'Boa noite galera'],      // 19h58, o envio automático
    ['Bom dia galera', '2026-10-03T06:00:00Z', 'Boa noite galera'],        // 3h
    ['Boa tarde galera', '2026-10-02T08:00:00Z', 'Bom dia galera'],        // 5h em ponto
    ['Boa noite galera', '2026-10-02T15:00:00Z', 'Boa tarde galera'],      // 12h em ponto
    ['Bom dia galera', '2026-10-02T21:00:00Z', 'Boa noite galera'],        // 18h em ponto
    ['BOA TARDE, TIME!', '2026-10-02T12:00:00Z', 'BOM DIA, TIME!'],        // caixa alta fica
    ['boa noite pessoal', '2026-10-02T12:00:00Z', 'bom dia pessoal'],      // minúscula fica
    ['Fala, time!', '2026-10-02T12:00:00Z', 'Fala, time!'],                // sem hora no texto: igual
    ['', '2026-10-02T12:00:00Z', ''],
  ];
  for (const [t, quando, esperado] of casos) {
    igual(E.saudacaoNaHora(t, h(quando)), esperado, `saudação "${t}" às ${quando}`);
  }
  const m = E.msgColeta(louvor(), 2026, 11, '', '', h('2026-10-02T12:00:00Z'));
  ok(m.startsWith('Bom dia galera\n'), 'o pedido de disponibilidade também segue a hora');
}

/* 3 · o posto com alguém de fora da lista -------------------------------- */
{
  const S = louvor();
  const vagas = E.vagasDe(S, DIA);
  igual(vagas.join(','), '', 'os postos com Guest não são vaga');
  delete S.escalas[DIA].convidados.TECLADO;
  igual(E.vagasDe(S, DIA).join(','), 'TECLADO', 'sem o Guest, o posto volta a ser vaga');
  ok(E.problemas(S, DIA).some(p => /Sem ninguém em TECLADO/.test(p.texto)), 'e o aviso de vaga volta');
}
{
  /* o sorteio não mexe no posto do Guest, e preenche o resto */
  const S = louvor();
  delete S.escalas[DIA].convidados.TECLADO;
  E.gerarDia(S, DIA);
  const d = S.escalas[DIA];
  ok(!d.slots.DIRIGENTE && !d.slots.BATERIA && !d.slots.SOM && !d.slots.GUITARRA, 'o sorteio não põe ninguém onde há Guest',
    JSON.stringify(Object.keys(d.slots)));
  ok(d.slots.TECLADO?.vid === 'v5', 'e preenche o posto que ficou sem ninguém', JSON.stringify(d.slots.TECLADO));
  const r = E.gerarMes(S, 2026, 10, '2026-10-01').find(x => x.data === DIA);
  ok(r && r.vagas.length === 0 && S.escalas[DIA].convidados.DIRIGENTE === 'Guest Rafa', 'montar o mês também respeita', JSON.stringify(r));
}
{
  /* quem é da lista vale mais que o texto */
  const S = louvor();
  S.escalas[DIA].slots.GUITARRA = { vid: 'v3', status: 'pendente', fixo: true };
  igual(E.convidadoNoPosto(S, DIA, 'GUITARRA'), '', 'com alguém da lista no posto, o Guest não conta');
  ok(E.msgEscala(S, DIA, { agora: AS_15H }).includes('GUITARRA\nPessoa Três (falta confirmar)'), 'e a mensagem mostra a pessoa');
}
{
  /* contas */
  const S = louvor();
  const c = E.contaDoRecorte(S, DIA);
  ok(c.postos === 9 && c.vagas === 0 && c.preenchidos === 9 && c.semResposta === 1, 'o Guest conta como coberto, sem resposta a esperar', JSON.stringify(c));
  const r = E.resumoDia(S, DIA);
  ok(r.convidados === 5 && r.preenchidos === 4 && r.vagas.length === 0 && r.situacao === 'atencao', 'o resumo do dia separa quem é da lista', JSON.stringify(r));
  ok(E.diaTemGente(S, DIA), 'o dia tem gente');
  const so = E.estadoVazio(); so.funcoes = S.funcoes;
  E.garantirDia(so, DIA).convidados = { SOM: 'Guest' };
  ok(E.diaTemGente(so, DIA), 'mesmo que seja só Guest');
}
{
  /* chamar quem pode cobrir: posto com Guest não é vaga aberta */
  const S = louvor();
  ok(!vagaAberta(S, DIA, 'DIRIGENTE'), 'ninguém é chamado para o posto do Guest');
  delete S.escalas[DIA].convidados.DIRIGENTE;
  ok(vagaAberta(S, DIA, 'DIRIGENTE'), 'sem o Guest, a vaga abre');
  S.escalas[DIA].slots.VIOLÃO.status = 'recusado';
  ok(vagaAberta(S, DIA, 'VIOLÃO'), 'quem disse que não pode continua abrindo a vaga');
}
{
  /* a escala do mês em PDF */
  const S = louvor();
  const dia = escalaDoMesParaImprimir(S, 2026, 10, '10:00').dias.find(d => d.data === DIA);
  const dir = dia.postos.find(p => p.funcao === 'DIRIGENTE');
  ok(dir.quem === 'Guest Rafa' && dir.aberta === false, 'o PDF mostra o Guest e não chama de vaga', JSON.stringify(dir));
}
{
  /* a assinatura do envio: o Guest entra só quando existe */
  const S = louvor();
  const com = E.assinaturaDoEnvio(S, DIA);
  S.escalas[DIA].convidados.DIRIGENTE = 'Guest Marcos';
  ok(E.assinaturaDoEnvio(S, DIA) !== com, 'trocar o nome do Guest pede mensagem nova');
  const semGuest = louvor(); delete semGuest.escalas[DIA].convidados;
  const vazio = louvor(); vazio.escalas[DIA].convidados = {};
  igual(E.assinaturaDoEnvio(vazio, DIA), E.assinaturaDoEnvio(semGuest, DIA), 'sem Guest, a assinatura é a de sempre');
}
{
  /* o texto que o banco aceita (108) */
  ok(E.textoDeConvidadoValido('Guest') && E.textoDeConvidadoValido('Guest Rafa'), 'Guest e Guest com nome');
  ok(!E.textoDeConvidadoValido('') && !E.textoDeConvidadoValido(' Guest') && !E.textoDeConvidadoValido('a'.repeat(61))
    && !E.textoDeConvidadoValido('Guest\nRafa') && !E.textoDeConvidadoValido(42), 'vazio, espaço na ponta, mais de 60, quebra de linha e não texto: não');
}

if (falhas) { console.log(`mensagem-do-louvor: ${falhas} de ${feitas} FALHARAM`); process.exit(1); }
console.log(`mensagem-do-louvor: ${feitas}/${feitas} ok`);
