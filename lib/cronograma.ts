/* =============================================================================
   O CRONOGRAMA DO CULTO, NO PURO — 109, 03/10/2026

   O Roteiro Mestre que uma pessoa só montava virou UMA folha por culto, com
   cinco blocos e um dono para cada um (o Arthur aprovou o formato em 03/10):

     A Palavra ..... quem prega, tema, leitura, frase na tela, Santa Ceia.
                     O dirigente da semana preenche pelo link dele.
     No comando .... sai da escala: o posto marcado de cada área.
     Cronograma .... os horários, do modelo do tipo de culto.
     Louvor ........ as músicas da ordem do culto (105) e a música final.
     Avisos ........ o dirigente preenche (ou diz "sem avisos").

   Prazo: três dias antes do culto (o Arthur: "feito antecipadamente, três
   dias antes do culto").

   Este arquivo não importa nada de tela nem de banco: as regras moram aqui
   para o teste alcançar (`scripts/cronograma.test.mjs`), e a tela, a folha
   pública, o PDF e a mensagem do grupo usam as MESMAS funções. O banco
   (supabase/109) confere de novo tudo o que chega: o que este arquivo
   recusa, o banco também recusa, com os mesmos tetos.
   ============================================================================= */
import { addDias, diffDias, MESES } from './engine';

export type TipoCulto = 'domingo' | 'follow';
export type Bloco = 'palavra' | 'avisos' | 'louvor' | 'linha';
export type Papel = 'direcao' | 'dirigente' | 'lider';

export type Palavra = { quem?: string; tema?: string; leitura?: string; frase?: string; ceia?: boolean };
export type ComoAviso = 'falado' | 'video';
export type Aviso = { texto: string; como?: ComoAviso };
export type Louvor = { final?: string };
export type Horario = { h: string; o: string; q?: string };
export type Comando = {
  papel: Papel; equipe: string; equipeId: string; posto: string; funcaoId: string;
  nome: string | null; status: 'pendente' | 'confirmado' | null; convidado: string | null;
};
export type Musica = { equipe: string; titulo: string; tom?: string; bpm?: number; quem?: string };
export type Autoria = { por: string; em: string; via: 'lider' | 'dirigente' };
export type Folha = {
  data: string; tipo: TipoCulto; cultoId: string | null;
  inicio: string | null; fim: string | null;
  existe: boolean; token: string | null;
  palavra: Palavra | null; avisos: Aviso[] | null; louvor: Louvor | null;
  linha: Horario[]; linhaPropria: boolean;
  autoria: Partial<Record<Bloco, Autoria>>; atualizadoEm: string | null;
  comando: Comando[]; musicas: Musica[];
  repertorio: { equipe: string; equipeId: string }[];
};

/* os mesmos tetos dos CHECK da 109 */
export const TETO = {
  quem: 60, tema: 120, leitura: 80, frase: 240,
  aviso: 100, avisos: 12, final: 80,
  o: 80, q: 60, linhas: 30,
} as const;
export const PRAZO_DIAS = 3;

/* ------------------------------------------------------------ o texto ---- */
/** Uma linha: aparada, com os espaços de dentro juntados (uma quebra de linha
 *  colada vira espaço). É o que o banco faz em `cron_normalizar`. */
export const limparTexto = (s: unknown): string =>
  typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '';

/** O que o banco aceita como texto de uma linha (`cron_texto_ok`). */
export function textoValido(s: unknown, teto: number): s is string {
  return typeof s === 'string' && s !== '' && s === s.trim()
    // eslint-disable-next-line no-control-regex
    && !/[\u0000-\u001f\u007f-\u009f]/.test(s) && [...s].length <= teto;
}

/** A hora como a pessoa escreve ("9", "9h", "9:30", "09h30", "0930") vira
 *  "HH:MM". O que não dá para entender volta nulo, e a tela avisa. */
export function horaNormalizada(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim().toLowerCase().replace(/\s+/g, '');
  const m = /^(\d{1,2})(?:(?:[:h.])(\d{2})?|(\d{2}))?h?$/.exec(t);
  if (!m) return null;
  const h = +m[1], min = m[2] !== undefined ? +m[2] : m[3] !== undefined ? +m[3] : 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
export const horaValida = (s: unknown): s is string =>
  typeof s === 'string' && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(s);

/** "10:00" vira "10h"; "10:30" vira "10h30". É como a igreja fala. */
export function horaFalada(hhmm: string | null | undefined): string {
  if (!hhmm || !horaValida(hhmm)) return '';
  const [h, m] = hhmm.split(':');
  return m === '00' ? `${+h}h` : `${+h}h${m}`;
}

/* ------------------------------------------------- o que vem do banco ---- */
const str = (x: unknown) => (typeof x === 'string' && x !== '' ? x : undefined);
const obj = (x: unknown): Record<string, unknown> | null =>
  x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;

function palavraDoBanco(x: unknown): Palavra | null {
  const o = obj(x); if (!o) return null;
  const p: Palavra = {};
  for (const k of ['quem', 'tema', 'leitura', 'frase'] as const) { const v = str(o[k]); if (v) p[k] = v; }
  if (o.ceia === true) p.ceia = true;
  return Object.keys(p).length ? p : null;
}
function avisosDoBanco(x: unknown): Aviso[] | null {
  if (!Array.isArray(x)) return null;                 // nulo = "falta"; [] = "sem avisos"
  const out: Aviso[] = [];
  for (const it of x) {
    const o = obj(it); const t = o && str(o.texto); if (!t) continue;
    out.push(o!.como === 'falado' || o!.como === 'video' ? { texto: t, como: o!.como } : { texto: t });
  }
  return out;
}
function louvorDoBanco(x: unknown): Louvor | null {
  const o = obj(x); const f = o && str(o.final);
  return f ? { final: f } : null;
}
function linhaDoBanco(x: unknown): Horario[] {
  if (!Array.isArray(x)) return [];
  const out: Horario[] = [];
  for (const it of x) {
    const o = obj(it); if (!o) continue;
    const h = str(o.h), oq = str(o.o); if (!h || !oq || !horaValida(h)) continue;
    const q = str(o.q);
    out.push(q ? { h, o: oq, q } : { h, o: oq });
  }
  return out;
}
function autoriaDoBanco(x: unknown): Partial<Record<Bloco, Autoria>> {
  const o = obj(x); const out: Partial<Record<Bloco, Autoria>> = {};
  if (!o) return out;
  for (const b of ['palavra', 'avisos', 'louvor', 'linha'] as const) {
    const a = obj(o[b]); if (!a) continue;
    const por = str(a.por), em = str(a.em);
    if (por && em) out[b] = { por, em, via: a.via === 'dirigente' ? 'dirigente' : 'lider' };
  }
  return out;
}

/** A folha como a RPC devolve (`cronograma_dados`), já no tipo da tela. O que
 *  não presta fica de fora em vez de quebrar a página. */
export function folhaDoBanco(x: unknown): Folha | null {
  const o = obj(x); if (!o) return null;
  const data = str(o.data);
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const comando: Comando[] = [];
  for (const it of Array.isArray(o.comando) ? o.comando : []) {
    const c = obj(it); if (!c) continue;
    const papel = c.papel === 'direcao' || c.papel === 'dirigente' || c.papel === 'lider' ? c.papel : null;
    const equipe = str(c.equipe), equipeId = str(c.equipe_id), posto = str(c.posto), funcaoId = str(c.funcao_id);
    if (!papel || !equipe || !equipeId || !posto || !funcaoId) continue;
    comando.push({
      papel, equipe, equipeId, posto, funcaoId,
      nome: str(c.nome) || null,
      status: c.status === 'confirmado' || c.status === 'pendente' ? c.status : null,
      convidado: str(c.convidado) || null,
    });
  }
  const musicas: Musica[] = [];
  for (const it of Array.isArray(o.musicas) ? o.musicas : []) {
    const m = obj(it); const titulo = m && str(m.titulo); if (!titulo) continue;
    const mu: Musica = { equipe: str(m!.equipe) || '', titulo };
    const tom = str(m!.tom); if (tom) mu.tom = tom;
    if (typeof m!.bpm === 'number' && Number.isFinite(m!.bpm)) mu.bpm = m!.bpm;
    const quem = str(m!.quem); if (quem) mu.quem = quem;
    musicas.push(mu);
  }
  const repertorio: { equipe: string; equipeId: string }[] = [];
  for (const it of Array.isArray(o.repertorio) ? o.repertorio : []) {
    const r = obj(it); const e = r && str(r.equipe), id = r && str(r.equipe_id);
    if (e && id) repertorio.push({ equipe: e, equipeId: id });
  }
  return {
    data,
    tipo: o.tipo === 'follow' ? 'follow' : 'domingo',
    cultoId: str(o.culto_id) || null,
    inicio: str(o.inicio) || null,
    fim: str(o.fim) || null,
    existe: o.existe === true,
    token: str(o.token) || null,
    palavra: palavraDoBanco(o.palavra),
    avisos: avisosDoBanco(o.avisos),
    louvor: louvorDoBanco(o.louvor),
    linha: linhaDoBanco(o.linha),
    linhaPropria: o.linha_propria === true,
    autoria: autoriaDoBanco(o.autoria),
    atualizadoEm: str(o.atualizado_em) || null,
    comando, musicas, repertorio,
  };
}

/** O que a tela LEU de um bloco, do jeito que o banco tem. Vai junto na
 *  gravação (`p_antes`): se alguém gravou no meio, volta MUDOU. */
export function antesDoBloco(f: Folha, b: Bloco): unknown {
  if (b === 'palavra') return f.palavra;
  if (b === 'avisos') return f.avisos;
  if (b === 'louvor') return f.louvor;
  return f.linha;
}

/* --------------------------------------------- o que vai para o banco ---- */
export function palavraParaGravar(p: Palavra): Palavra | null {
  const out: Palavra = {};
  for (const k of ['quem', 'tema', 'leitura', 'frase'] as const) { const v = limparTexto(p[k]); if (v) out[k] = v; }
  if (p.ceia === true) out.ceia = true;
  return Object.keys(out).length ? out : null;
}
export function avisosParaGravar(a: Aviso[]): Aviso[] {
  const out: Aviso[] = [];
  for (const it of a) {
    const t = limparTexto(it.texto); if (!t) continue;
    out.push(it.como === 'falado' || it.como === 'video' ? { texto: t, como: it.como } : { texto: t });
  }
  return out;
}
export function louvorParaGravar(l: Louvor): Louvor | null {
  const f = limparTexto(l.final);
  return f ? { final: f } : null;
}

/** Os horários: hora entendida ("9h30" vira "09:30"), linha sem "o que" sai,
 *  em ordem de hora (empate fica na ordem escrita). Hora que não dá para
 *  entender volta como erro da linha, e nada é gravado. */
export function linhaParaGravar(rows: { h: string; o: string; q?: string }[]):
  { ok: true; linha: Horario[] } | { ok: false; erro: 'HORA'; indice: number } {
  const out: { it: Horario; i: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const o = limparTexto(rows[i].o);
    const hBruta = (rows[i].h || '').trim();
    if (!o && !hBruta && !limparTexto(rows[i].q)) continue;   // linha em branco: sai
    if (!o) continue;                                          // sem "o que": sai, como no banco
    const h = horaNormalizada(hBruta);
    if (!h) return { ok: false, erro: 'HORA', indice: i };
    const q = limparTexto(rows[i].q);
    out.push({ it: q ? { h, o, q } : { h, o }, i });
  }
  out.sort((a, b) => (a.it.h < b.it.h ? -1 : a.it.h > b.it.h ? 1 : a.i - b.i));
  return { ok: true, linha: out.map(x => x.it) };
}

/* as mesmas perguntas que o CHECK do banco faz */
export function palavraValida(p: Palavra | null): boolean {
  if (p === null) return true;
  for (const [k, v] of Object.entries(p)) {
    if (k === 'ceia') { if (typeof v !== 'boolean') return false; continue; }
    if (!(k in TETO) || !['quem', 'tema', 'leitura', 'frase'].includes(k)) return false;
    if (!textoValido(v, TETO[k as 'quem' | 'tema' | 'leitura' | 'frase'])) return false;
  }
  return true;
}
export function avisosValidos(a: Aviso[] | null): boolean {
  if (a === null) return true;
  if (!Array.isArray(a) || a.length > TETO.avisos) return false;
  return a.every(it => textoValido(it.texto, TETO.aviso)
    && (it.como === undefined || it.como === 'falado' || it.como === 'video')
    && Object.keys(it).every(k => k === 'texto' || k === 'como'));
}
export function louvorValido(l: Louvor | null): boolean {
  if (l === null) return true;
  return Object.keys(l).every(k => k === 'final') && (l.final === undefined || textoValido(l.final, TETO.final));
}
export function linhaValida(l: Horario[] | null): boolean {
  if (l === null) return true;
  if (!Array.isArray(l) || l.length < 1 || l.length > TETO.linhas) return false;
  return l.every(it => horaValida(it.h) && textoValido(it.o, TETO.o)
    && (it.q === undefined || textoValido(it.q, TETO.q))
    && Object.keys(it).every(k => k === 'h' || k === 'o' || k === 'q'));
}

/* ------------------------------------------------------- o dia e a hora -- */
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const meioDia = (s: string) => new Date(s + 'T12:00:00Z');
const dd = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;

/** "Domingo, 13 de setembro" / "Sábado (Follow), 4 de outubro" */
export function tituloDaFolha(data: string): string {
  const d = meioDia(data);
  const dia = d.getUTCDay() === 6 ? 'Sábado (Follow)' : DIAS[d.getUTCDay()];
  return `${dia}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}
/** "dom, 13/09" — o dia nas listas */
export function diaCurto(data: string): string {
  return `${DIAS_CURTOS[meioDia(data).getUTCDay()]}, ${dd(data)}`;
}

export const prazoDaFolha = (data: string) => addDias(data, -PRAZO_DIAS);
/** "qui, 10/09" */
export const rotuloDoPrazo = (data: string) => diaCurto(prazoDaFolha(data));

/** "10h às 12h": o começo é o do culto (evento com hora manda; senão a hora
 *  da igreja para o tipo do dia), o fim é o do culto se houver, senão o
 *  último horário do cronograma, se ele vier depois do começo. */
export function horarioDaFolha(f: Folha, cultoHora: string, followHora?: string | null): string {
  const ini = f.inicio ? horaFalada(f.inicio) : (f.tipo === 'follow' ? (followHora || '') : cultoHora);
  const iniHHMM = f.inicio || horaDeFalada(f.tipo === 'follow' ? (followHora || '') : cultoHora);
  let fim = f.fim ? horaFalada(f.fim) : '';
  if (!fim && f.linha.length) {
    const ult = f.linha[f.linha.length - 1].h;
    if (!iniHHMM || ult > iniHHMM) fim = horaFalada(ult);
  }
  if (!ini) return fim ? `até ${fim}` : '';
  return fim ? `${ini} às ${fim}` : ini;
}
/** "10h" vira "10:00"; "19h30" vira "19:30" */
export function horaDeFalada(s: string): string | null {
  const m = /^(\d{1,2})h(\d{2})?$/.exec((s || '').trim());
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2] || '00'}`;
}

/* ------------------------------------------------------- quem é quem ----- */
export const rotuloDoPapel = (c: Pick<Comando, 'papel' | 'equipe'>) =>
  c.papel === 'direcao' ? 'Direção do culto' : c.papel === 'dirigente' ? 'Dirigente' : c.equipe;

/** quem está no posto: o nome, o texto de fora da lista (108) ou nada */
export const quemNoComando = (c: Comando): string | null => c.nome || c.convidado || null;

export const dirigenteDa = (f: Folha) => f.comando.find(c => c.papel === 'dirigente') || null;
export const direcaoDa = (f: Folha) => f.comando.find(c => c.papel === 'direcao') || null;

/** O dono da Palavra e dos Avisos: "Dirigente" e, se já tem, o nome. */
export function donoDoDirigente(f: Folha): string {
  const d = dirigenteDa(f);
  const n = d && quemNoComando(d);
  return n ? `Dirigente: ${n}` : 'Dirigente';
}
/** A área do Louvor (a que tem a ordem do culto ligada) */
export const donoDoLouvor = (f: Folha) => f.repertorio[0]?.equipe || 'Louvor';

/* ---------------------------------------------------------- o que falta -- */
export type Pendencia = {
  chave: string;
  bloco: Bloco | 'comando';
  /** o que falta, numa frase curta */
  texto: string;
  /** quem preenche: "Dirigente: Paulo", "Louvor", "Mídia" */
  dono: string;
  /** a área dona, quando há uma (para o líder ver "é com você") */
  equipeId: string | null;
  /** o posto, quando a falta é de gente no comando ("HEAD") */
  posto?: string;
};

function juntar(xs: string[]): string {
  return xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`;
}

/** O que falta nesta folha, na ordem da folha. */
export function pendenciasDaFolha(f: Folha): Pendencia[] {
  const out: Pendencia[] = [];
  const dir = dirigenteDa(f);
  const donoDir = donoDoDirigente(f);
  const p = f.palavra || {};
  const faltaPalavra = [!p.quem && 'quem prega', !p.tema && 'tema', !p.leitura && 'leitura'].filter(Boolean) as string[];
  if (faltaPalavra.length) {
    out.push({ chave: 'palavra', bloco: 'palavra', texto: `A Palavra: ${juntar(faltaPalavra)}`, dono: donoDir, equipeId: dir?.equipeId || null });
  }
  for (const c of f.comando) {
    if (quemNoComando(c)) continue;
    out.push({ chave: `comando:${c.funcaoId}`, bloco: 'comando', texto: `${rotuloDoPapel(c)}: ninguém escalado`, dono: c.equipe, equipeId: c.equipeId, posto: c.posto });
  }
  if (!f.linha.length) {
    const d = direcaoDa(f);
    out.push({ chave: 'linha', bloco: 'linha', texto: 'Os horários do culto', dono: d?.equipe || 'Produção', equipeId: d?.equipeId || null });
  }
  const rep = f.repertorio[0];
  if (rep && !f.musicas.length) {
    out.push({ chave: 'musicas', bloco: 'louvor', texto: 'As músicas (na ordem do culto)', dono: rep.equipe, equipeId: rep.equipeId });
  }
  if (!f.louvor?.final) {
    out.push({ chave: 'final', bloco: 'louvor', texto: 'A música final', dono: donoDoLouvor(f), equipeId: rep?.equipeId || null });
  }
  if (f.avisos === null) {
    out.push({ chave: 'avisos', bloco: 'avisos', texto: 'Os avisos', dono: donoDir, equipeId: dir?.equipeId || null });
  }
  return out;
}

export type EstadoDaFolha = {
  tipo: 'pronto' | 'cedo' | 'aberto' | 'atrasado' | 'passou';
  tom: 'ok' | 'warn' | 'bad' | 'neutro';
  texto: string;
};
/** De longe: pronto, no prazo, atrasado ou já passou. Mais de quatro dias
 *  antes do prazo, o que falta não é alarme (tom neutro). */
export function estadoDaFolha(f: Folha, hoje: string): EstadoDaFolha {
  const n = pendenciasDaFolha(f).length;
  if (f.data < hoje) return { tipo: 'passou', tom: 'neutro', texto: 'Culto realizado' };
  if (!n) return { tipo: 'pronto', tom: 'ok', texto: 'Tudo pronto' };
  const prazo = prazoDaFolha(f.data);
  const falta = n === 1 ? '1 pendência' : `${n} pendências`;
  if (hoje > prazo) return { tipo: 'atrasado', tom: 'bad', texto: `${falta} · prazo era ${rotuloDoPrazo(f.data)}` };
  if (diffDias(hoje, prazo) > 4) return { tipo: 'cedo', tom: 'neutro', texto: `${falta} · até ${rotuloDoPrazo(f.data)}` };
  return { tipo: 'aberto', tom: 'warn', texto: `${falta} · até ${rotuloDoPrazo(f.data)}` };
}

/** "qua 20h05": o dia da semana e a hora, no horário de Brasília */
function diaEHora(em: string, fuso: string): string | null {
  const d = new Date(em);
  if (isNaN(d.getTime())) return null;
  const p = new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d);
  const g = (t: string) => p.find(x => x.type === t)?.value || '';
  const dia = g('weekday').replace('.', '').toLowerCase().slice(0, 3);
  const h = +g('hour'), m = g('minute');
  return `${dia} ${m === '00' ? `${h}h` : `${h}h${m}`}`;
}

/** "por Paulo (dirigente), qua 20h05" */
export function rotuloDaAutoria(a: Autoria | undefined, fuso = 'America/Sao_Paulo'): string {
  if (!a) return '';
  const q = diaEHora(a.em, fuso);
  return `por ${a.por}${a.via === 'dirigente' ? ' (dirigente)' : ''}${q ? `, ${q}` : ''}`;
}

/** "Atualizado qua, 09/09, 20h05" (o rodapé da folha) */
export function rotuloDaAtualizacao(em: string | null | undefined, fuso = 'America/Sao_Paulo'): string {
  if (!em) return '';
  const d = new Date(em);
  if (isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, day: '2-digit', month: '2-digit' }).formatToParts(d);
  const g = (t: string) => p.find(x => x.type === t)?.value || '';
  const [dia, hora] = (diaEHora(em, fuso) || '').split(' ');
  return `Atualizado ${dia}, ${g('day')}/${g('month')}, ${hora}`;
}

/* ----------------------------------------------------- a música, curta --- */
/** "Leão (E, 67 BPM) Lead - Letícia", como o Louvor escreve no grupo */
export function linhaDaMusicaNaFolha(m: Musica): string {
  const det = [m.tom, m.bpm ? `${m.bpm} BPM` : ''].filter(Boolean).join(', ');
  return `${m.titulo}${det ? ` (${det})` : ''}${m.quem ? ` Lead - ${m.quem}` : ''}`;
}

/* -------------------------------------------------- a mensagem do grupo -- */
/** O texto que vai para o grupo do WhatsApp: o essencial da folha e o link
 *  dela (onde está o PDF). O que ainda falta não sai: quem manda vê as
 *  pendências na tela antes de mandar. */
export function mensagemDoGrupo(f: Folha, link: string, cultoHora: string, followHora?: string | null): string {
  const linhas: string[] = ['Cronograma do culto'];
  const hora = horarioDaFolha(f, cultoHora, followHora);
  linhas.push(`${tituloDaFolha(f.data)}${hora ? `, ${hora}` : ''}`);
  const p = f.palavra || {};
  const palavra = [
    p.quem && `Palavra: ${p.quem}`,
    p.tema && `Tema: ${p.tema}`,
    p.leitura && `Leitura: ${p.leitura}`,
    p.ceia && 'Com Santa Ceia',
  ].filter(Boolean) as string[];
  if (palavra.length) linhas.push('', ...palavra);
  const cmd = f.comando
    .map(c => { const q = quemNoComando(c); return q ? `${rotuloDoPapel(c)}: ${q}` : ''; })
    .filter(Boolean);
  if (cmd.length) linhas.push('', ...cmd);
  linhas.push('', 'Cronograma completo e PDF:', link);
  return linhas.join('\n');
}

/** O endereço da folha pública */
export const linkDaFolha = (base: string, token: string) => `${base.replace(/\/+$/, '')}/cronograma/${token}`;

/* ----------------------------------------------------- erro, em português -- */
/** A frase para a pessoa, a partir do `erro` que a RPC devolve. */
export function erroDoCronograma(r: { erro?: string } | null | undefined): string {
  switch (r?.erro) {
    case 'MUDOU': return 'Alguém gravou este bloco enquanto você editava. Trouxe o que está salvo agora: confira e salve de novo.';
    case 'VALOR_INVALIDO': return 'Algum campo passou do tamanho ou tem um valor que o sistema não aceita. Confira e salve de novo.';
    case 'JA_PASSOU': return 'Este culto já passou. Só quem organiza a igreja inteira corrige o registro.';
    case 'SEM_PERMISSAO': return 'Seu acesso não permite gravar isto.';
    case 'DATA_SEM_CULTO': return 'Esta data não tem culto da igreja (só domingo e sábado do Follow).';
    case 'BLOCO_INVALIDO': return 'Este bloco não é seu para preencher.';
    case 'CULTO_INEXISTENTE': return 'Este culto não está mais na escala.';
    case 'LONGE_DEMAIS': return 'Esta data está longe demais para montar o cronograma agora.';
    case 'CULTO_RECUSADO': return 'O sistema não conseguiu marcar este culto. Recarregue a página e tente de novo.';
    default: return 'Não consegui gravar. Confira a conexão e tente de novo.';
  }
}

/** A RPC ainda não existe no banco (a 109 não rodou): o PostgREST devolve
 *  PGRST202, e a tela esconde o cronograma em vez de mostrar erro. */
export function semCronogramaNoBanco(e: unknown): boolean {
  const o = (e && typeof e === 'object' ? e : {}) as { code?: string; message?: string; status?: number };
  return o.code === 'PGRST202' || o.code === '42883'
    || /could not find the function|function .* does not exist/i.test(o.message || '');
}
