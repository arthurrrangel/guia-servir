/* =============================================================================
   A ORDEM DO CULTO, NO PURO — 105, 02/10/2026

   O que este arquivo exige:
     1. a cifra: só https de um domínio de verdade, sem usuário@ e sem IP, com
        a MESMA lista de casos que a conferência da 105 manda ao banco
        (`ordem_valida`), para a tela e o banco nunca discordarem;
     2. o que vem do banco chega IGUAL à tela (senão salvar responderia MUDOU
        sem ninguém ter mexido), e o que não presta não chega;
     3. o que a pessoa digita é consertado (aparado, sem quebra de linha) e o
        que não dá para consertar volta como erro do campo;
     4. a hora de cada item sai da hora do culto mais a duração de tudo antes,
        e some depois de um item sem duração;
     5. a mensagem do grupo leva as músicas com o tom e o BPM, e o envio só
        "muda" quando música ou tom mudam;
     6. a ponte leva a ordem do banco ao estado da tela.

   Roda com `npm test`. */
import { strict as assert } from 'node:assert';
import {
  normalizarCifra, cifraValida, siteDaCifra, itemDoBanco, ordemDoBanco, itemDaTela, rascunhoVazio, rascunhoDe,
  horarios, resumoDaOrdem, relogio, duracao, minutosDe, detalhesDaMusica, acharNoBanco, completarDoBanco,
  historicoDaMusica, textoValido, limparTexto, dicaDaMusica, DICA_DO_BANCO,
} from '@/lib/ordem-do-culto';
import { estadoVazio, garantirDia, msgEscala, assinaturaDoEnvio, linhaDaMusica } from '@/lib/engine';
import { montarEstado } from '@/lib/ponte';

let feitas = 0;
const caso = (nome, fn) => { fn(); feitas++; };

/* 1 · a cifra ------------------------------------------------------------- */
caso('aceita os links de cifra de verdade, e põe o https que faltou', () => {
  for (const [entra, sai] of [
    ['https://www.cifraclub.com.br/banda/musica/', 'https://www.cifraclub.com.br/banda/musica/'],
    ['cifraclub.com.br/banda/musica', 'https://cifraclub.com.br/banda/musica'],
    ['  https://www.cifras.com.br/cifra/x  ', 'https://www.cifras.com.br/cifra/x'],
    ['https://docs.google.com/document/d/abc/edit?usp=sharing', 'https://docs.google.com/document/d/abc/edit?usp=sharing'],
    ['https://tabs.ultimate-guitar.com/tab/x/y-chords-123', 'https://tabs.ultimate-guitar.com/tab/x/y-chords-123'],
    ["https://cifras.com.br/it's-a", 'https://cifras.com.br/it%27s-a'],
    ['https://CifraClub.com.br/X', 'https://cifraclub.com.br/X'],
  ]) {
    const r = normalizarCifra(entra);
    assert.equal(r.ok, true, `recusou ${entra}: ${r.erro}`);
    assert.equal(r.url, sai);
    assert.equal(cifraValida(r.url), true, `o banco recusaria ${r.url}`);
  }
  assert.deepEqual(normalizarCifra('   '), { ok: true, url: '' }, 'campo vazio é apagar');
});

caso('recusa o que viraria botão que faz outra coisa', () => {
  for (const ruim of [
    'http://www.cifraclub.com.br/x',
    'javascript:alert(1)',
    'https://cifraclub.com.br@golpe.com/x',
    'https://169.254.169.254/latest',
    'https://localhost/x',
    'ftp://cifraclub.com.br/x',
    'data:text/html,<b>oi</b>',
    'https://cifraclub.com.br/' + 'a'.repeat(490),
  ]) {
    const r = normalizarCifra(ruim);
    assert.equal(r.ok, false, `aceitou ${ruim.slice(0, 60)}`);
    assert.ok(r.erro && !/undefined/.test(r.erro), 'a frase diz o que colar');
  }
});

caso('cifraValida é a regra do banco: os mesmos casos da conferência da 105', () => {
  assert.equal(cifraValida('https://www.cifraclub.com.br/artista-exemplo/bondade-de-deus/'), true);
  for (const ruim of [
    'http://www.cifraclub.com.br/x', 'javascript:alert(1)', 'https://cifraclub.com.br@golpe.com/x',
    'https://169.254.169.254/x', 'https://cifraclub.com.br/a"b', 'https://cifraclub.com.br/a b',
    'https://cifraclub.com.br/' + 'a'.repeat(480),
  ]) assert.equal(cifraValida(ruim), false, ruim.slice(0, 60));
  assert.equal(siteDaCifra('https://www.cifraclub.com.br/x'), 'cifraclub.com.br');
});

/* 2 · do banco para a tela, igual ----------------------------------------- */
const BOA = [
  { t: 'momento', titulo: 'Abertura', quem: 'Pastor', min: 5 },
  { t: 'musica', titulo: 'Bondade de Deus', artista: 'Artista Exemplo', tom: 'G', bpm: 68,
    cifra: 'https://www.cifraclub.com.br/artista-exemplo/bondade-de-deus/', quem: 'Bia', min: 6, nota: 'Comeca so voz e teclado' },
  { t: 'musica', titulo: 'Ousado Amor', tom: 'F#m', bpm: 72 },
  { t: 'momento', titulo: 'Palavra', min: 40 },
];
caso('a ordem válida chega à tela igual, campo por campo', () => {
  assert.deepEqual(ordemDoBanco(BOA), BOA);
  assert.deepEqual(ordemDoBanco(JSON.parse(JSON.stringify(BOA))), BOA);
  assert.equal(textoValido('Ação de graças 🙏', 80), true, 'acento e emoji contam como letra');
});

caso('o item que o banco recusaria não chega, e o resto chega', () => {
  const ruins = [
    { titulo: 'x' }, { t: 'video', titulo: 'x' }, { t: 1, titulo: 'x' }, { t: 'musica', tom: 'G' },
    { t: 'musica', titulo: '' }, { t: 'musica', titulo: ' x' }, { t: 'musica', titulo: 'a\nb' },
    { t: 'musica', titulo: 'x', letra: '...' }, { t: 'musica', titulo: 'x', tom: 'H' },
    { t: 'musica', titulo: 'x', tom: 'Gmm' }, { t: 'momento', titulo: 'x', tom: 'G' },
    { t: 'momento', titulo: 'x', artista: 'y' }, { t: 'musica', titulo: 'x', bpm: '72' },
    { t: 'musica', titulo: 'x', bpm: 72.5 }, { t: 'musica', titulo: 'x', bpm: 10 }, { t: 'musica', titulo: 'x', bpm: 301 },
    { t: 'momento', titulo: 'x', min: 0 }, { t: 'momento', titulo: 'x', min: 241 },
    { t: 'musica', titulo: 'x', cifra: 'javascript:alert(1)' }, { t: 'momento', titulo: 'x', cifra: 'https://cifraclub.com.br/x' },
    { t: 'musica', titulo: 'a'.repeat(81) }, 'x', null, [1],
  ];
  for (const r of ruins) assert.equal(itemDoBanco(r), null, JSON.stringify(r)?.slice(0, 80));
  assert.deepEqual(ordemDoBanco([...ruins, BOA[2]]), [BOA[2]]);
  assert.deepEqual(ordemDoBanco({ t: 'musica', titulo: 'x' }), [], 'objeto solto não é lista');
  assert.equal(ordemDoBanco(Array.from({ length: 45 }, (_, i) => ({ t: 'momento', titulo: 'x' + i }))).length, 40);
});

/* 3 · da tela para o banco, consertado ------------------------------------ */
caso('o que a pessoa digita é aparado e a quebra de linha vira espaço', () => {
  const r = itemDaTela({ ...rascunhoVazio('musica'), titulo: '  Canção\nnova ', artista: ' ', tom: 'G', bpm: ' 72 ',
    cifra: 'cifraclub.com.br/x', quem: 'Lia', min: '6', nota: '' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.item, { t: 'musica', titulo: 'Canção nova', tom: 'G', bpm: 72,
    cifra: 'https://cifraclub.com.br/x', quem: 'Lia', min: 6 });
  assert.equal(itemDoBanco(r.item) !== null, true, 'o que a tela manda o banco aceita');
  assert.equal(limparTexto('a'.repeat(100), 80).length, 80);
});

caso('o que não dá para consertar volta como erro do campo', () => {
  const r = itemDaTela({ ...rascunhoVazio('musica'), titulo: '  ', bpm: '500', min: 'meia hora', cifra: 'http://x.com' });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.erros).sort(), ['bpm', 'cifra', 'min', 'titulo']);
  assert.match(r.erros.titulo, /nome da música/);
  const m = itemDaTela({ ...rascunhoVazio('momento'), titulo: '' });
  assert.match(m.erros.titulo, /momento/);
});

caso('o momento não leva campo de música, mesmo que o rascunho tenha', () => {
  const r = itemDaTela({ ...rascunhoVazio('momento'), titulo: 'Avisos', artista: 'x', tom: 'G', bpm: '72', cifra: 'https://x.com/y', min: '5' });
  assert.deepEqual(r.item, { t: 'momento', titulo: 'Avisos', min: 5 });
  assert.deepEqual(itemDaTela(rascunhoDe(BOA[1])).item, BOA[1], 'editar e salvar sem mudar devolve o mesmo item');
});

/* 4 · a hora de cada item -------------------------------------------------- */
caso('a hora sai da hora do culto mais a duração de tudo antes', () => {
  const o = [{ t: 'momento', titulo: 'a', min: 5 }, { t: 'musica', titulo: 'b', min: 6 },
             { t: 'musica', titulo: 'c' }, { t: 'momento', titulo: 'd', min: 40 }];
  assert.deepEqual(horarios(o, 19 * 60), [1140, 1145, 1151, null]);
  assert.deepEqual(horarios(o, null), [null, null, null, null], 'evento sem hora: nenhuma hora inventada');
  const r = resumoDaOrdem(o, 600);
  assert.deepEqual([r.musicas, r.total, r.completo, r.fim, r.semTempo], [2, 51, false, null, 1]);
  const cheio = resumoDaOrdem(BOA.map(i => ({ ...i, min: i.min || 5 })), 600);
  assert.equal(relogio(cheio.fim), '10h56', '5 + 6 + 5 + 40 minutos depois das 10h');
  assert.equal(relogio(605), '10h05'); assert.equal(relogio(1170), '19h30');
  assert.equal(duracao(40), '40 min'); assert.equal(duracao(60), '1h'); assert.equal(duracao(95), '1h35');
  assert.equal(minutosDe('19h30'), 1170); assert.equal(minutosDe(null), null);
  assert.equal(detalhesDaMusica(BOA[1]), 'G · 68 BPM');
});

/* banco de músicas */
caso('o banco de músicas completa só o campo vazio', () => {
  const banco = [{ titulo: 'Bondade de Deus', artista: 'Artista Exemplo', tom: 'G', bpm: 68,
    cifra: 'https://www.cifraclub.com.br/x/', vezes: 5, ultima: '2026-09-14', proxima: '2026-10-04' }];
  const m = acharNoBanco(banco, '  bondade DE deus ');
  assert.ok(m, 'acha pelo título, sem ligar para maiúscula e espaço');
  const r = completarDoBanco({ ...rascunhoVazio('musica'), titulo: 'Bondade de Deus', tom: 'A' }, m);
  assert.deepEqual([r.tom, r.bpm, r.artista, r.cifra], ['A', '68', 'Artista Exemplo', 'https://www.cifraclub.com.br/x/']);
  assert.equal(historicoDaMusica(m), 'tocada 5 vezes, a última em 14/09 · na ordem de 04/10');
  assert.equal(historicoDaMusica({ ...m, vezes: 0, ultima: null, proxima: null }), 'ainda não tocada');
  assert.equal(dicaDaMusica(m, true), 'Tom, BPM e cifra de 14/09 (tocada 5 vezes)');
  assert.equal(dicaDaMusica(m, false), 'Tocada 5 vezes, a última em 14/09');
  assert.equal(dicaDaMusica({ ...m, vezes: 0, ultima: null }, false), 'Já está na ordem de 04/10');
  assert.equal(dicaDaMusica({ ...m, vezes: 0, ultima: null }, true), 'Tom, BPM e cifra de 04/10 (ainda não tocada)');
  /* a dica cabe numa linha no celular: é o que impede o "Salvar" de pular */
  assert.ok([dicaDaMusica(m, true), dicaDaMusica({ ...m, vezes: 12 }, false), DICA_DO_BANCO].every(t => t.length <= 46));
});

/* 5 · a mensagem do grupo ------------------------------------------------- */
function estadoCom(ordem, ligado = true) {
  const S = estadoVazio();
  S.config.repertorio = ligado;
  S.funcoes = [{ id: 'f1', nome: 'VOZ', ordem: 1, simultanea: true, ativa: true, tipos: ['domingo', 'follow'] }];
  const d = garantirDia(S, '2026-10-04');
  d.ordem = ordem;
  return S;
}
caso('a mensagem leva as músicas como o Louvor escreve, e não os momentos', () => {
  const t = msgEscala(estadoCom(BOA), '2026-10-04');
  /* 02/10/2026, noite: "as mensagens tem que sair assim" (a escala do Louvor):
     '1. Canção A (E, 67 BPM) Lead - Lia', dentro do bloco REPERTÓRIO */
  assert.match(t, /REPERTÓRIO\n1\. Bondade de Deus \(G, 68 BPM\) Lead - Bia\n2\. Ousado Amor \(F#m, 72 BPM\)\n/);
  assert.doesNotMatch(t, /Abertura|Palavra|SETLIST/);
  assert.equal(linhaDaMusica({ t: 'musica', titulo: 'Sem tom' }, 3), '3. Sem tom');
  assert.equal(linhaDaMusica({ t: 'musica', titulo: 'Só tom', tom: 'Bb' }, 1), '1. Só tom (Bb)');
  assert.equal(linhaDaMusica({ t: 'musica', titulo: 'Só BPM', bpm: 90 }, 2), '2. Só BPM (90 BPM)');
  assert.equal(linhaDaMusica({ t: 'musica', titulo: 'Só lead', quem: 'Ana' }, 4), '4. Só lead Lead - Ana');
  assert.equal(linhaDaMusica({ t: 'musica', titulo: 'Tudo', tom: 'G#m', bpm: 65, quem: 'Rafa e Lia' }, 5), '5. Tudo (G#m, 65 BPM) Lead - Rafa e Lia');
});
caso('com os links, as músicas vêm primeiro e os links logo embaixo, no mesmo bloco; desligado, nada aparece', () => {
  const S = estadoCom(BOA);
  S.escalas['2026-10-04'].repertorio = { spotify: 'https://open.spotify.com/playlist/x', youtube: 'https://youtube.com/playlist?list=PLx' };
  assert.match(msgEscala(S, '2026-10-04'),
    /REPERTÓRIO\n1\. Bondade de Deus \(G, 68 BPM\) Lead - Bia\n2\. Ousado Amor \(F#m, 72 BPM\)\nSpotify: https:\/\/open\.spotify\.com\/playlist\/x\nYouTube: https:\/\/youtube\.com\/playlist\?list=PLx\n\n/);
  /* só os links, sem música na ordem: o bloco de antes da 105 */
  const soLinks = estadoCom(undefined);
  soLinks.escalas['2026-10-04'].repertorio = { spotify: 'https://open.spotify.com/playlist/x' };
  assert.match(msgEscala(soLinks, '2026-10-04'), /REPERTÓRIO\nSpotify: https:\/\/open\.spotify\.com\/playlist\/x\n\n/);
  assert.doesNotMatch(msgEscala(estadoCom(BOA, false), '2026-10-04'), /REPERTÓRIO|Bondade/);
});
caso('as observações: a nota de cada música, com o número dela, depois do repertório', () => {
  const t = msgEscala(estadoCom(BOA), '2026-10-04');
  assert.match(t, /2\. Ousado Amor \(F#m, 72 BPM\)\n\nOBSERVAÇÕES\n1\. Bondade de Deus: Comeca so voz e teclado\n/);
  /* a nota de um momento não é observação do setlist */
  const comNotaNoMomento = BOA.map(i => (i.titulo === 'Palavra' ? { ...i, nota: 'Pastor convidado' } : i));
  assert.doesNotMatch(msgEscala(estadoCom(comNotaNoMomento), '2026-10-04'), /Pastor convidado/);
  /* sem nota nenhuma, sem o cabeçalho */
  const semNota = BOA.map(i => ({ ...i, nota: undefined }));
  assert.doesNotMatch(msgEscala(estadoCom(semNota), '2026-10-04'), /OBSERVAÇÕES/);
  /* o número da observação é o da música no setlist, não o da ordem inteira */
  const terceira = BOA.map(i => (i.titulo === 'Ousado Amor' ? { ...i, nota: 'Medley com outra música' } : { ...i, nota: undefined }));
  assert.match(msgEscala(estadoCom(terceira), '2026-10-04'), /OBSERVAÇÕES\n2\. Ousado Amor: Medley com outra música/);
});
caso('o envio só "muda" quando música, tom, BPM ou observação mudam', () => {
  const sem = assinaturaDoEnvio(estadoCom(undefined), '2026-10-04');
  assert.equal(assinaturaDoEnvio(estadoCom([BOA[0], BOA[3]]), '2026-10-04'), sem, 'só momentos: a assinatura de antes');
  const com = assinaturaDoEnvio(estadoCom(BOA), '2026-10-04');
  assert.notEqual(com, sem);
  const outroTom = BOA.map(i => (i.titulo === 'Ousado Amor' ? { ...i, tom: 'Gm' } : i));
  assert.notEqual(assinaturaDoEnvio(estadoCom(outroTom), '2026-10-04'), com, 'trocar o tom pede mensagem nova');
  /* 02/10/2026: a nota da música virou observação na mensagem, então pede */
  const outraNota = BOA.map(i => (i.titulo === 'Bondade de Deus' ? { ...i, nota: 'outra' } : i));
  assert.notEqual(assinaturaDoEnvio(estadoCom(outraNota), '2026-10-04'), com, 'mudar a observação pede mensagem nova');
  const notaDeMomento = BOA.map(i => (i.titulo === 'Palavra' ? { ...i, nota: 'outra' } : i));
  assert.equal(assinaturaDoEnvio(estadoCom(notaDeMomento), '2026-10-04'), com, 'a nota de um momento não vai na mensagem e não pede');
  /* 02/10/2026, noite: o Lead vai na mensagem, então mudar quem conduz pede */
  const outroLead = BOA.map(i => (i.titulo === 'Bondade de Deus' ? { ...i, quem: 'Ana' } : i));
  assert.notEqual(assinaturaDoEnvio(estadoCom(outroLead), '2026-10-04'), com, 'mudar o Lead pede mensagem nova');
  const quemDeMomento = BOA.map(i => (i.titulo === 'Abertura' ? { ...i, quem: 'Outro' } : i));
  assert.equal(assinaturaDoEnvio(estadoCom(quemDeMomento), '2026-10-04'), com, 'quem conduz um momento não vai na mensagem e não pede');
});

/* 6 · a ponte -------------------------------------------------------------- */
caso('a ponte leva a ordem do banco ao estado, sem o item que não presta', () => {
  const linhas = {
    equipe: 'Louvor', config: { dados: { repertorio: true } },
    funcoes: [{ id: 'f1', nome: 'VOZ', simultanea: true, ordem: 1, ativa: true, tipos: null }],
    voluntarios: [], habilidades: [], escalacoes: [], plantoes: [], indisponibilidades: [], disponibilidade: [],
    cultos: [{ id: 'c1', data: '2026-10-04', evento: null, inicio: null, equipe_id: null }],
    recados: [{ culto_id: 'c1', equipe_id: 'e1', obs: '', relatorio: null, problemas: null, relatado_por: null,
      relatado_em: null, ordem: [...BOA, { t: 'musica', titulo: 'x', cifra: 'javascript:x' }] }],
  };
  const S = montarEstado(linhas);
  assert.deepEqual(S.escalas['2026-10-04'].ordem, BOA);
  const sem = montarEstado({ ...linhas, recados: [{ ...linhas.recados[0], ordem: undefined }] });
  assert.equal(sem.escalas['2026-10-04']?.ordem, undefined, 'banco antes da 105: nada');
});

console.log(`ordem-do-culto: ${feitas}/${feitas} ok`);
