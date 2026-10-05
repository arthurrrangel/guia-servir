/* =============================================================================
   A ORDEM DO CULTO — 105, 02/10/2026.

   Fase 3 do estudo do ServoApp: "música com tom, BPM, letra e cifra" e
   "ordem do culto com tempos". A ordem mora em `culto_obs.ordem`, por culto e
   por ministério, e só existe com o repertório ligado nos Ajustes (100).

   UM ITEM É UMA MÚSICA OU UM MOMENTO. Música: título, artista, tom, BPM,
   link da cifra, quem conduz, duração e uma nota ("começa só voz e
   teclado"). Momento (abertura, oração, avisos, palavra, ceia): título, quem,
   duração e nota. A hora de cada item não é guardada: sai da hora do culto
   mais a duração de tudo que vem antes, e por isso mudar a ordem ou a
   duração de um item acerta a hora dos outros sozinha.

   DUAS PORTAS DE ENTRADA, COM REGRAS DIFERENTES DE PROPÓSITO:
     · o que a pessoa digita passa por `itemDaTela`, que CONSERTA: apara,
       troca quebra de linha por espaço, põe https:// no link que veio sem;
     · o que vem do banco passa por `itemDoBanco`, que só CONFERE. O banco já
       recusou o que não presta (CHECK `ordem_valida`, 105), e consertar aqui
       faria a lista da tela ficar diferente da do banco: na hora de salvar,
       `salvar_ordem` compararia as duas e responderia MUDOU sem ninguém ter
       mexido. Para a ordem válida, `itemDoBanco` devolve o item igual.

   A CIFRA VIRA BOTÃO na página de quem serve. Por isso só `https://` de um
   domínio de verdade, sem `usuário@` (o `https://cifraclub.com.br@golpe.com`
   abre o golpe.com) e sem IP. O banco confere o mesmo.
   ============================================================================= */

import type { ItemOrdem, TipoItemOrdem } from './engine';
import {
  ORDEM_MAX_ITENS, ORDEM_TETO, ORDEM_BPM, ORDEM_MIN, ORDEM_SEG, tomValido, textoDaOrdemValido, cifraValida, inteiroEntre,
  compassoValido, letraValida, segundosDoItem,
} from './engine';
import { minutosDaHora } from './semana';
export type { ItemOrdem } from './engine';
/* a regra do banco mora no motor (a ponte, que não pode importar daqui, usa
   a mesma); aqui ela é só repassada, com os nomes que a tela usa */
export { linhaDaMusica, tomValido, cifraValida, itemDoBanco, ordemDoBanco, compassoValido, letraValida, segundosDoItem } from './engine';
type TipoItem = TipoItemOrdem;

export const MAX_ITENS = ORDEM_MAX_ITENS;
export const TETO = ORDEM_TETO;
export const BPM_MIN = ORDEM_BPM[0], BPM_MAX = ORDEM_BPM[1], MIN_MIN = ORDEM_MIN[0], MIN_MAX = ORDEM_MIN[1];
export const SEG_MAX = ORDEM_SEG[1];

/* os tons que a lista oferece, como o músico escreve. O banco aceita também
   as outras grafias (Db, D#, Gb...), e a tela mostra a que estiver salva. */
export const TONS_MAIORES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const TONS_MENORES = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];
/* 111 · os compassos que a lista oferece, do mais comum no louvor ao menos.
   O banco aceita qualquer um de 1 a 16 tempos (figura 2, 4, 8 ou 16), e a
   tela mostra o que estiver salvo, como faz com o tom. */
export const COMPASSOS = ['4/4', '3/4', '6/8', '2/4', '12/8', '6/4', '2/2', '5/4', '7/8', '9/8'];

/* =============================================================================
   111 · A ORDEM GANHA COMPASSO, SEGUNDOS E A LETRA — 05/10/2026.

   Pedido do Louvor, pelo Arthur: o compasso ao lado do BPM, o tempo da
   música em minuto e segundo, e a letra em PDF que a pessoa toca e baixa.

   DOIS MODOS DE GRAVAR A DURAÇÃO, E QUEM DECIDE É O BANCO. Com a 111 no
   banco, a duração vai em segundos (`seg`); sem ela, o banco só conhece
   minutos (`min`) e recusaria o resto. A tela pergunta ao próprio banco o
   que ele aceita (`ordem_valida`) e escolhe o modo. A leitura aceita os
   dois sempre: o item antigo, em minutos, aparece como 6:00.
   ============================================================================= */
export type ModoDaDuracao = 'segundos' | 'minutos';

/* --------------------------------------------------------------- texto */
const CONTROLE_G = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
/** texto que o banco aceita: aparado, não vazio, sem controle, dentro do teto */
export const textoValido = textoDaOrdemValido;
/** o que a pessoa digitou, consertado: '' quando não sobra nada */
export function limparTexto(s: unknown, teto: number): string {
  if (typeof s !== 'string') return '';
  const t = s.replace(CONTROLE_G, ' ').trim();
  return [...t].slice(0, teto).join('').trim();
}

/* --------------------------------------------------------------- cifra */
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;

/** o link colado, conferido: '' quando o campo ficou vazio (apagar vale) */
export function normalizarCifra(texto: string): { ok: true; url: string } | { ok: false; erro: string } {
  let t = (texto || '').trim();
  if (!t) return { ok: true, url: '' };
  /* quem copia da barra do celular às vezes leva sem o https */
  if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) t = 'https://' + t.replace(/^\/+/, '');
  let u: URL;
  try { u = new URL(t); } catch { return { ok: false, erro: 'Isso não é um link. Cole o endereço da página da cifra.' }; }
  if (u.protocol !== 'https:') return { ok: false, erro: 'Cole o link que começa com https://.' };
  if (u.username || u.password || !HOST.test(u.hostname))
    return { ok: false, erro: 'Esse endereço não é de um site. Cole o link da página da cifra.' };
  const url = u.toString().replace(/'/g, '%27');
  if (url.length > 500) return { ok: false, erro: 'Esse link é comprido demais. Use o botão Compartilhar da página.' };
  if (!cifraValida(url)) return { ok: false, erro: 'Esse link tem caracteres que não dá para guardar. Cole o link da página da cifra.' };
  return { ok: true, url };
}

/** o site da cifra, como a pessoa reconhece: "cifraclub.com.br" */
export function siteDaCifra(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/* ------------------------------------------------------------- números */
/** o número digitado: undefined quando vazio ou fora da faixa */
export function numeroDaTela(s: unknown, a: number, b: number): number | undefined {
  if (typeof s === 'number') return inteiroEntre(s, a, b) ? s : undefined;
  if (typeof s !== 'string' || !s.trim()) return undefined;
  const n = Number(s.trim().replace(',', '.'));
  return inteiroEntre(n, a, b) ? n : undefined;
}

/* --------------------------------------------------------------- itens */
/** o rascunho que a pessoa preencheu: tudo em texto, como o campo guarda.
    A duração são dois campos: `min` (os minutos) e `seg` (os segundos, de 0
    a 59). A letra é o caminho do PDF que JÁ está no armário; o arquivo que
    a pessoa acabou de escolher fica fora do rascunho, até subir. */
export type Rascunho = {
  t: TipoItem; titulo: string; artista: string; tom: string; bpm: string; compasso: string;
  cifra: string; letra: string; quem: string; min: string; seg: string; nota: string;
};
export const rascunhoVazio = (t: TipoItem): Rascunho =>
  ({ t, titulo: '', artista: '', tom: '', bpm: '', compasso: '', cifra: '', letra: '', quem: '', min: '', seg: '', nota: '' });
export function rascunhoDe(it: ItemOrdem): Rascunho {
  const s = segundosDoItem(it);
  return {
    t: it.t, titulo: it.titulo, artista: it.artista || '', tom: it.tom || '',
    bpm: it.bpm ? String(it.bpm) : '', compasso: it.compasso || '', cifra: it.cifra || '', letra: it.letra || '',
    quem: it.quem || '',
    min: s ? String(Math.floor(s / 60)) : '',
    seg: s && s % 60 ? String(s % 60).padStart(2, '0') : '',
    nota: it.nota || '',
  };
}

export type ErrosDoItem = Partial<Record<'titulo' | 'bpm' | 'min' | 'cifra' | 'letra', string>>;

/** a duração dos dois campos, em segundos: undefined quando os dois estão
    vazios, null quando o que foi escrito não dá uma duração */
export function segundosDaTela(min: string, seg: string): number | undefined | null {
  const m = (min || '').trim(), s = (seg || '').trim();
  if (!m && !s) return undefined;
  const mm = m ? Number(m) : 0, ss = s ? Number(s) : 0;
  if (!Number.isInteger(mm) || !Number.isInteger(ss) || mm < 0 || mm > MIN_MAX || ss < 0 || ss > 59) return null;
  const total = mm * 60 + ss;
  return inteiroEntre(total, ORDEM_SEG[0], ORDEM_SEG[1]) ? total : null;
}

/** o rascunho virando item: o item, ou o que falta consertar, campo a campo.
    `modo` é o que o banco aceita para a duração (ver o topo da seção 111). */
export function itemDaTela(r: Rascunho, modo: ModoDaDuracao = 'segundos'): { ok: true; item: ItemOrdem } | { ok: false; erros: ErrosDoItem } {
  const erros: ErrosDoItem = {};
  const musica = r.t === 'musica';
  const titulo = limparTexto(r.titulo, TETO.titulo);
  if (!titulo) erros.titulo = musica ? 'Escreva o nome da música.' : 'Escreva o que acontece neste momento.';
  const bpm = numeroDaTela(r.bpm, BPM_MIN, BPM_MAX);
  if (musica && r.bpm.trim() && bpm === undefined) erros.bpm = `BPM é um número de ${BPM_MIN} a ${BPM_MAX}.`;
  let min: number | undefined, seg: number | undefined;
  if (modo === 'minutos') {
    min = numeroDaTela(r.min, MIN_MIN, MIN_MAX);
    if (r.min.trim() && min === undefined) erros.min = `A duração é em minutos, de ${MIN_MIN} a ${MIN_MAX}.`;
    /* os segundos só existem com a 111 no banco: aqui nada os guardaria */
    else if (Number(r.seg || 0)) erros.min = 'Os segundos ainda não podem ser salvos. Use só os minutos.';
  } else {
    const s = segundosDaTela(r.min, r.seg);
    if (s === null) erros.min = `A duração vai de 0:01 a ${MIN_MAX}:00, com os segundos de 0 a 59.`;
    else seg = s;
  }
  let cifra = '';
  if (musica) {
    const c = normalizarCifra(r.cifra);
    if (!c.ok) erros.cifra = c.erro; else cifra = c.url;
  }
  if (musica && r.letra && !letraValida(r.letra)) erros.letra = 'A letra salva não abre mais. Tire e envie o PDF de novo.';
  if (Object.keys(erros).length) return { ok: false, erros };
  const it: ItemOrdem = { t: r.t, titulo };
  if (musica) {
    const artista = limparTexto(r.artista, TETO.artista); if (artista) it.artista = artista;
    if (tomValido(r.tom)) it.tom = r.tom;
    if (bpm !== undefined) it.bpm = bpm;
    if (compassoValido(r.compasso)) it.compasso = r.compasso;
    if (cifra) it.cifra = cifra;
    if (r.letra) it.letra = r.letra;
  }
  const quem = limparTexto(r.quem, TETO.quem); if (quem) it.quem = quem;
  if (min !== undefined) it.min = min;
  if (seg !== undefined) it.seg = seg;
  const nota = limparTexto(r.nota, TETO.nota); if (nota) it.nota = nota;
  return { ok: true, item: it };
}

/** 111 · o item usa algo que só existe com a 111 no banco */
export const itemDa111 = (it: ItemOrdem) => it.seg !== undefined || !!it.compasso || !!it.letra;

/* --------------------------------------------------------------- tempo */
/** 'HH:MM' do relógio a partir dos minutos do dia: '10h', '10h05' */
export function relogio(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  return mm ? `${h}h${String(mm).padStart(2, '0')}` : `${h}h`;
}
/** duração: '40 min', '1h', '1h35' */
export function duracao(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), mm = min % 60;
  return mm ? `${h}h${String(mm).padStart(2, '0')}` : `${h}h`;
}
/** 111 · minuto e segundo: '4:35', '6:00', '0:45' (e '1:02:05' de uma hora
    para cima, que música não chega a ter) */
export function minutoESegundo(seg: number): string {
  const s = Math.max(0, Math.round(seg));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
/** 111 · a duração de um item como a tela mostra: a música SEMPRE em minuto e
    segundo ('4:35', '6:00'), que é como o Louvor pediu; o momento em minutos
    ('40 min', '1h35'), ou em minuto e segundo quando tem segundos */
export function tempoDoItem(it: ItemOrdem): string {
  const s = segundosDoItem(it);
  if (!s) return '';
  if (it.t === 'musica' || s % 60) return minutoESegundo(s);
  return duracao(s / 60);
}
/** 111 · o tempo da ordem inteira: '38 min', '38:20', '1h12' */
export function duracaoTotal(seg: number): string {
  if (seg % 60 === 0) return duracao(seg / 60);
  if (seg < 3600) return minutoESegundo(seg);
  return duracao(Math.floor(seg / 60));
}
/** '10h', '19h30' → minutos do dia (a hora como a igreja escreve) */
export const minutosDe = (hora: string | null | undefined): number | null => minutosDaHora(hora || undefined);

/** a hora de começo de cada item (em minutos do dia): a do culto mais a
    duração de tudo antes, contada em segundos. Depois de um item sem
    duração, as horas seguintes não dá para saber. */
export function horarios(ordem: ItemOrdem[], inicio: number | null): (number | null)[] {
  const out: (number | null)[] = [];
  let t: number | null = inicio === null ? null : inicio * 60;
  for (const it of ordem) {
    out.push(t === null ? null : Math.floor(t / 60));
    const s = segundosDoItem(it);
    t = t === null || !s ? null : t + s;
  }
  return out;
}

/** o resumo da ordem: quantas músicas, quanto tempo tem duração (em
    segundos) e a hora do fim (em minutos do dia) */
export function resumoDaOrdem(ordem: ItemOrdem[], inicio: number | null) {
  const musicas = ordem.filter(i => i.t === 'musica').length;
  const comTempo = ordem.filter(i => segundosDoItem(i)).length;
  const totalSeg = ordem.reduce((s, i) => s + (segundosDoItem(i) || 0), 0);
  const completo = ordem.length > 0 && comTempo === ordem.length;
  return {
    musicas, totalSeg, completo,
    fim: completo && inicio !== null ? Math.floor((inicio * 60 + totalSeg) / 60) : null,
    semTempo: ordem.length - comTempo,
  };
}

/* ----------------------------------------------------------- para mostrar */
/** 'G · 68 BPM · 6/8': o compasso ao lado do BPM */
export function detalhesDaMusica(it: ItemOrdem): string {
  const p: string[] = [];
  if (it.tom) p.push(it.tom);
  if (it.bpm) p.push(`${it.bpm} BPM`);
  if (it.compasso) p.push(it.compasso);
  return p.join(' · ');
}

/* ------------------------------------------------------------ a letra (111) */
/** o teto do armário (o Storage recusa acima disso antes de gravar) */
export const LETRA_MAX_BYTES = 10 * 1024 * 1024;
/** o PDF escolhido, conferido antes de subir: a frase do problema, ou null.
    O rótulo do arquivo é só o primeiro filtro, e frouxo de propósito: há
    celular que entrega PDF sem tipo, ou como `application/x-pdf`. Quem
    decide é o conteúdo (`conferirConteudoDoPdf`), e o envio vai sempre
    rotulado como PDF (`enviarLetra`). */
export function conferirPdf(f: { name?: string; size?: number; type?: string } | null | undefined): string | null {
  if (!f) return 'Escolha o PDF da letra.';
  const ehPdf = /pdf/i.test(f.type || '') || /\.pdf$/i.test(f.name || '');
  if (!ehPdf) return NAO_E_PDF;
  if (!f.size) return 'Esse PDF está vazio. Escolha outro.';
  if (f.size > LETRA_MAX_BYTES) return `Esse PDF tem ${tamanhoLegivel(f.size)}. O limite é 10 MB.`;
  return null;
}
const NAO_E_PDF = 'Esse arquivo não é PDF. Escolha o PDF da letra.';
/** O CONTEÚDO É DE PDF? Todo PDF começa com `%PDF-` (o padrão tolera lixo
    antes, até 1024 bytes). Uma foto renomeada para `.pdf` passaria pelo
    rótulo, subiria, e quem serve no culto baixaria um arquivo que não abre.
    Lê só o começo do arquivo. A frase do problema, ou null. */
export async function conferirConteudoDoPdf(f: Blob): Promise<string | null> {
  let b: Uint8Array;
  try { b = new Uint8Array(await f.slice(0, 1024).arrayBuffer()); } catch {
    return 'Não consegui ler esse arquivo. Escolha de novo.';
  }
  for (let i = 0; i + 5 <= b.length; i++) {
    if (b[i] === 0x25 && b[i + 1] === 0x50 && b[i + 2] === 0x44 && b[i + 3] === 0x46 && b[i + 4] === 0x2d) return null;
  }
  return NAO_E_PDF;
}
/** '850 KB', '1,2 MB' */
export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
/** onde a letra nova mora: a pasta do ministério e um id que não se adivinha */
export function caminhoNovoDaLetra(equipeId: string, id: string): string {
  const c = `${(equipeId || '').toLowerCase()}/${(id || '').toLowerCase()}.pdf`;
  if (!letraValida(c)) throw new Error('CAMINHO_DA_LETRA');
  return c;
}
/** o nome com que o PDF chega no aparelho: 'Leão - letra.pdf'.

    SEM ASPAS SIMPLES NEM PARÊNTESES. O Storage monta o cabeçalho do download
    com `encodeURIComponent`, que deixa `'`, `(` e `)` como estão, e no
    `filename*=UTF-8''...` esses três não valem (RFC 8187; o apóstrofo é o
    próprio separador). O Chromium aceita assim mesmo (medido em 05/10/2026),
    mas leitor estrito cai no nome de reserva, que lá vai codificado
    ("Ousado%20Amor..."). Ver supabase/storage#1385. Com `’` e colchetes, o
    nome é válido para qualquer leitor, e "(Ao Vivo)" chega "[Ao Vivo]". */
export function nomeDoPdf(titulo: string): string {
  const t = (titulo || '').replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ')
    .replace(/'/g, '’').replace(/\(/g, '[').replace(/\)/g, ']')
    .replace(/\s+/g, ' ').trim();
  return `${[...t].slice(0, 70).join('').trim() || 'Letra'} - letra.pdf`;
}
/** o endereço público da letra no Storage. Com o título, o Storage manda o
    arquivo como download, com esse nome (o toque baixa, não abre outra aba) */
export function urlDaLetra(base: string, caminho: string, titulo?: string): string {
  if (!letraValida(caminho)) return '';
  const raiz = (base || '').replace(/\/+$/, '');
  const url = `${raiz}/storage/v1/object/public/letras/${caminho}`;
  return titulo ? `${url}?download=${encodeURIComponent(nomeDoPdf(titulo))}` : url;
}

/* ------------------------------------------------------- banco de músicas */
export type MusicaDoBanco = {
  titulo: string; artista: string | null; tom: string | null; bpm: number | null;
  cifra: string | null; vezes: number; ultima: string | null; proxima: string | null;
  /** 111 · o último compasso, tempo (em segundos) e letra que alguém
      preencheu para esta música (sem a 111 no banco, não vêm) */
  compasso?: string | null; seg?: number | null; letra?: string | null;
};
export const chaveDaMusica = (t: string) => t.trim().toLocaleLowerCase('pt-BR');
export function acharNoBanco(banco: MusicaDoBanco[], titulo: string): MusicaDoBanco | null {
  const k = chaveDaMusica(titulo);
  if (!k) return null;
  return banco.find(m => chaveDaMusica(m.titulo) === k) || null;
}
/** completa o rascunho com o jeito da última vez, SÓ nos campos vazios.
    111: o compasso, o tempo e a letra vêm junto; a letra é o que faz o PDF
    subir UMA vez por música, e não uma vez por culto. `comExtras` diz se o
    banco aceita gravar esses campos (sem a 111, nada disso entra). */
export function completarDoBanco(r: Rascunho, m: MusicaDoBanco, comExtras = true): Rascunho {
  const novo: Rascunho = {
    ...r,
    artista: r.artista || m.artista || '',
    tom: r.tom || (tomValido(m.tom) ? m.tom : ''),
    bpm: r.bpm || (m.bpm ? String(m.bpm) : ''),
    cifra: r.cifra || (cifraValida(m.cifra) ? m.cifra : ''),
  };
  if (!comExtras) return novo;
  if (!r.compasso && compassoValido(m.compasso)) novo.compasso = m.compasso;
  if (!r.letra && letraValida(m.letra)) novo.letra = m.letra;
  if (!r.min.trim() && !r.seg.trim() && inteiroEntre(m.seg, ORDEM_SEG[0], ORDEM_SEG[1])) {
    novo.min = String(Math.floor(m.seg / 60));
    novo.seg = m.seg % 60 ? String(m.seg % 60).padStart(2, '0') : '';
  }
  return novo;
}
/** a frase curta embaixo do nome, numa linha só até no celular (ela troca
    de texto quando o campo perde o foco, e uma linha a mais ali empurrava o
    "Salvar" para baixo no meio do toque: o dedo descia no botão e subia
    fora dele, e o toque se perdia) */
export function dicaDaMusica(m: MusicaDoBanco, trouxe: boolean): string {
  const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const vezes = m.vezes === 1 ? 'tocada 1 vez' : m.vezes > 1 ? `tocada ${m.vezes} vezes` : 'ainda não tocada';
  const quando = m.ultima || m.proxima;
  /* 111: o que vem da última vez é mais que tom, BPM e cifra (compasso,
     tempo e a letra também): a frase diz de onde, sem listar, e cabe */
  if (trouxe) return quando ? `Preenchido como em ${dm(quando)} (${vezes})` : `Preenchido como antes (${vezes})`;
  return m.ultima ? `Tocada ${m.vezes === 1 ? '1 vez' : `${m.vezes} vezes`}, a última em ${dm(m.ultima)}`
    : m.proxima ? `Já está na ordem de ${dm(m.proxima)}` : 'Ainda não tocada';
}
export const DICA_DO_BANCO = 'Digite e escolha uma música já tocada';

/** 'tocada 5 vezes, a última em 14/09' */
export function historicoDaMusica(m: MusicaDoBanco): string {
  const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const partes: string[] = [];
  if (m.vezes > 0 && m.ultima) partes.push(`${m.vezes === 1 ? 'tocada 1 vez' : `tocada ${m.vezes} vezes`}, a última em ${dm(m.ultima)}`);
  else partes.push('ainda não tocada');
  if (m.proxima) partes.push(`na ordem de ${dm(m.proxima)}`);
  return partes.join(' · ');
}
