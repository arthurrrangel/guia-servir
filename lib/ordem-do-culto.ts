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
  ORDEM_MAX_ITENS, ORDEM_TETO, ORDEM_BPM, ORDEM_MIN, tomValido, textoDaOrdemValido, cifraValida, inteiroEntre,
} from './engine';
import { minutosDaHora } from './semana';
export type { ItemOrdem } from './engine';
/* a regra do banco mora no motor (a ponte, que não pode importar daqui, usa
   a mesma); aqui ela é só repassada, com os nomes que a tela usa */
export { linhaDaMusica, tomValido, cifraValida, itemDoBanco, ordemDoBanco } from './engine';
type TipoItem = TipoItemOrdem;

export const MAX_ITENS = ORDEM_MAX_ITENS;
export const TETO = ORDEM_TETO;
export const BPM_MIN = ORDEM_BPM[0], BPM_MAX = ORDEM_BPM[1], MIN_MIN = ORDEM_MIN[0], MIN_MAX = ORDEM_MIN[1];

/* os tons que a lista oferece, como o músico escreve. O banco aceita também
   as outras grafias (Db, D#, Gb...), e a tela mostra a que estiver salva. */
export const TONS_MAIORES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const TONS_MENORES = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];

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
/** o rascunho que a pessoa preencheu: tudo em texto, como o campo guarda */
export type Rascunho = {
  t: TipoItem; titulo: string; artista: string; tom: string; bpm: string;
  cifra: string; quem: string; min: string; nota: string;
};
export const rascunhoVazio = (t: TipoItem): Rascunho =>
  ({ t, titulo: '', artista: '', tom: '', bpm: '', cifra: '', quem: '', min: '', nota: '' });
export const rascunhoDe = (it: ItemOrdem): Rascunho => ({
  t: it.t, titulo: it.titulo, artista: it.artista || '', tom: it.tom || '',
  bpm: it.bpm ? String(it.bpm) : '', cifra: it.cifra || '', quem: it.quem || '',
  min: it.min ? String(it.min) : '', nota: it.nota || '',
});

export type ErrosDoItem = Partial<Record<'titulo' | 'bpm' | 'min' | 'cifra', string>>;

/** o rascunho virando item: o item, ou o que falta consertar, campo a campo */
export function itemDaTela(r: Rascunho): { ok: true; item: ItemOrdem } | { ok: false; erros: ErrosDoItem } {
  const erros: ErrosDoItem = {};
  const musica = r.t === 'musica';
  const titulo = limparTexto(r.titulo, TETO.titulo);
  if (!titulo) erros.titulo = musica ? 'Escreva o nome da música.' : 'Escreva o que acontece neste momento.';
  const bpm = numeroDaTela(r.bpm, BPM_MIN, BPM_MAX);
  if (musica && r.bpm.trim() && bpm === undefined) erros.bpm = `BPM é um número de ${BPM_MIN} a ${BPM_MAX}.`;
  const min = numeroDaTela(r.min, MIN_MIN, MIN_MAX);
  if (r.min.trim() && min === undefined) erros.min = `A duração é em minutos, de ${MIN_MIN} a ${MIN_MAX}.`;
  let cifra = '';
  if (musica) {
    const c = normalizarCifra(r.cifra);
    if (!c.ok) erros.cifra = c.erro; else cifra = c.url;
  }
  if (Object.keys(erros).length) return { ok: false, erros };
  const it: ItemOrdem = { t: r.t, titulo };
  if (musica) {
    const artista = limparTexto(r.artista, TETO.artista); if (artista) it.artista = artista;
    if (tomValido(r.tom)) it.tom = r.tom;
    if (bpm !== undefined) it.bpm = bpm;
    if (cifra) it.cifra = cifra;
  }
  const quem = limparTexto(r.quem, TETO.quem); if (quem) it.quem = quem;
  if (min !== undefined) it.min = min;
  const nota = limparTexto(r.nota, TETO.nota); if (nota) it.nota = nota;
  return { ok: true, item: it };
}

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
/** '10h', '19h30' → minutos do dia (a hora como a igreja escreve) */
export const minutosDe = (hora: string | null | undefined): number | null => minutosDaHora(hora || undefined);

/** a hora de começo de cada item: a do culto mais a duração de tudo antes.
    Depois de um item sem duração, as horas seguintes não dá para saber. */
export function horarios(ordem: ItemOrdem[], inicio: number | null): (number | null)[] {
  const out: (number | null)[] = [];
  let t: number | null = inicio;
  for (const it of ordem) {
    out.push(t);
    t = t === null || !it.min ? null : t + it.min;
  }
  return out;
}

/** o resumo da ordem: quantas músicas, quanto tempo tem duração e a hora do fim */
export function resumoDaOrdem(ordem: ItemOrdem[], inicio: number | null) {
  const musicas = ordem.filter(i => i.t === 'musica').length;
  const comTempo = ordem.filter(i => i.min).length;
  const total = ordem.reduce((s, i) => s + (i.min || 0), 0);
  const completo = ordem.length > 0 && comTempo === ordem.length;
  return {
    musicas, total, completo,
    fim: completo && inicio !== null ? inicio + total : null,
    semTempo: ordem.length - comTempo,
  };
}

/* ----------------------------------------------------------- para mostrar */
/** 'G · 68 BPM' */
export function detalhesDaMusica(it: ItemOrdem): string {
  const p: string[] = [];
  if (it.tom) p.push(it.tom);
  if (it.bpm) p.push(`${it.bpm} BPM`);
  return p.join(' · ');
}

/* ------------------------------------------------------- banco de músicas */
export type MusicaDoBanco = {
  titulo: string; artista: string | null; tom: string | null; bpm: number | null;
  cifra: string | null; vezes: number; ultima: string | null; proxima: string | null;
};
export const chaveDaMusica = (t: string) => t.trim().toLocaleLowerCase('pt-BR');
export function acharNoBanco(banco: MusicaDoBanco[], titulo: string): MusicaDoBanco | null {
  const k = chaveDaMusica(titulo);
  if (!k) return null;
  return banco.find(m => chaveDaMusica(m.titulo) === k) || null;
}
/** completa o rascunho com o jeito da última vez, SÓ nos campos vazios */
export function completarDoBanco(r: Rascunho, m: MusicaDoBanco): Rascunho {
  return {
    ...r,
    artista: r.artista || m.artista || '',
    tom: r.tom || (tomValido(m.tom) ? m.tom : ''),
    bpm: r.bpm || (m.bpm ? String(m.bpm) : ''),
    cifra: r.cifra || (cifraValida(m.cifra) ? m.cifra : ''),
  };
}
/** a frase curta embaixo do nome, numa linha só até no celular (ela troca
    de texto quando o campo perde o foco, e uma linha a mais ali empurrava o
    "Salvar" para baixo no meio do toque: o dedo descia no botão e subia
    fora dele, e o toque se perdia) */
export function dicaDaMusica(m: MusicaDoBanco, trouxe: boolean): string {
  const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const vezes = m.vezes === 1 ? 'tocada 1 vez' : m.vezes > 1 ? `tocada ${m.vezes} vezes` : 'ainda não tocada';
  const quando = m.ultima || m.proxima;
  if (trouxe) return quando ? `Tom, BPM e cifra de ${dm(quando)} (${vezes})` : `Tom, BPM e cifra de antes (${vezes})`;
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
