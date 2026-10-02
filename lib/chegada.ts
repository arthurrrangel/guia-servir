/* =============================================================================
   "CHEGUEI" E "COMO FOI" — 107, 02/10/2026

   As frases, as contas e os tipos do resto da Fase 4 (claude/estudo-servoapp).
   Mora aqui, e não nas telas, para o teste alcançar (`scripts/chegada.test.mjs`).

   A IDEIA, EM DUAS LINHAS:
     · no dia do culto, a pessoa toca "Cheguei" no próprio link; o líder do
       dia vê o time chegando e marca quem esqueceu; a liderança vê tudo;
     · depois de servir, a pessoa conta como foi (bom, puxado ou problema) e
       só a liderança do ministério lê.
   Quem decide o que vale é o banco (supabase/107); daqui sai o que a tela
   escreve. Nada aqui marca furo: sem marca não quer dizer que faltou.
   ============================================================================= */
import { type Estado, funcoesDoDia, horaDoDia, nomeDe } from './engine';
import { minutosDaHora } from './semana';

export type MarcadoPor = 'eu' | 'lider_do_dia' | 'lideranca';
const MARCAS: MarcadoPor[] = ['eu', 'lider_do_dia', 'lideranca'];

/* uma pessoa do time do dia, como `eu_hoje` manda ao líder do dia */
export type GenteDoDia = {
  voluntario_id: string; nome: string; funcoes: string[];
  chegou_em: string | null; marcado_por: MarcadoPor | null; eu: boolean;
};
/* um culto de hoje no link da pessoa */
export type CultoDeHoje = {
  culto_id: string; data: string; evento: string | null; inicio: string | null;
  chegou_em: string | null; marcado_por: MarcadoPor | null; relata: boolean;
  time: GenteDoDia[] | null;
};

/* ------------------------------------------------- o que vem do banco ---
   A página do voluntário é pública: o que chega pela rede passa por aqui
   antes de virar tela. Forma errada vira nada, nunca erro na tela. */
/* id do banco (uuid); o harness usa ids curtos ('h1'), e a regra só barra lixo */
const ID = /^[A-Za-z0-9-]{1,64}$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}(:\d{2})?$/;
const texto = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
const instante = (v: unknown): string | null =>
  typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null;
const marca = (v: unknown): MarcadoPor | null =>
  MARCAS.includes(v as MarcadoPor) ? (v as MarcadoPor) : null;
const nomes = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(x => texto(x, 60)).filter((x): x is string => !!x).slice(0, 12) : [];

/** a resposta de `eu_hoje`, conferida */
export function hojeDoLink(raw: unknown): CultoDeHoje[] {
  const cultos = (raw as any)?.cultos;
  if (!Array.isArray(cultos)) return [];
  const out: CultoDeHoje[] = [];
  for (const c of cultos.slice(0, 6)) {
    if (!c || typeof c.culto_id !== 'string' || !ID.test(c.culto_id)) continue;
    if (typeof c.data !== 'string' || !DATA.test(c.data)) continue;
    const time = Array.isArray(c.time)
      ? c.time.slice(0, 80).flatMap((g: any): GenteDoDia[] => {
          if (!g || typeof g.voluntario_id !== 'string' || !ID.test(g.voluntario_id)) return [];
          const nome = texto(g.nome, 120);
          if (!nome) return [];
          return [{ voluntario_id: g.voluntario_id, nome, funcoes: nomes(g.funcoes),
                    chegou_em: instante(g.chegou_em), marcado_por: marca(g.marcado_por), eu: g.eu === true }];
        })
      : null;
    out.push({
      culto_id: c.culto_id, data: c.data,
      evento: texto(c.evento, 80),
      inicio: typeof c.inicio === 'string' && HORA.test(c.inicio) ? c.inicio : null,
      chegou_em: instante(c.chegou_em), marcado_por: marca(c.marcado_por),
      relata: c.relata === true && !!time, time: c.relata === true ? time : null,
    });
  }
  return out;
}

/* ------------------------------------------------------- a chegada ---- */
/** "9:12", no relógio da igreja (o aparelho pode estar em outro fuso) */
export function horaDaChegada(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const p = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: 'numeric', minute: '2-digit', hour12: false })
    .formatToParts(d);
  const h = p.find(x => x.type === 'hour')?.value ?? '';
  const m = p.find(x => x.type === 'minute')?.value ?? '';
  return h && m ? `${+h}:${m}` : '';
}

/** quem pôs a marca, dito para quem lê */
export function quemMarcou(m: MarcadoPor | null | undefined, praMim = false): string {
  if (m === 'eu') return praMim ? 'você marcou' : 'pelo link';
  if (m === 'lider_do_dia') return 'pelo líder do dia';
  if (m === 'lideranca') return 'pela liderança';
  return '';
}

/** "6 de 9 chegaram" */
export function fraseDoTime(chegaram: number, total: number): string {
  if (!total) return '';
  if (!chegaram) return 'ninguém marcou ainda';
  if (chegaram >= total) return total === 1 ? 'chegou' : `os ${total} chegaram`;
  return `${chegaram} de ${total} chegaram`;
}
export const contaDoTime = (time: { chegou_em: string | null }[]) =>
  ({ chegaram: time.filter(g => !!g.chegou_em).length, total: time.length });

type Volta = { ok?: boolean; erro?: string } | null | undefined;
/** a recusa do banco, para quem marca a própria chegada ou a do time */
export function erroAoChegar(r: Volta): string {
  if (!r || r.ok) return '';
  switch (r.erro) {
    case 'CULTO_INEXISTENTE': return 'Esse culto não está mais na escala. Recarregue a página.';
    case 'FORA_DO_DIA':       return 'A chegada só pode ser marcada no dia do culto.';
    case 'SEM_POSTO':         return 'Você não está na escala desse culto. Se veio servir mesmo assim, avise a liderança.';
    case 'SEM_PERMISSAO':     return 'Só quem lidera o dia marca a chegada do time.';
    case 'NAO_E_DO_TIME':     return 'Essa pessoa não está mais no time de hoje. Recarregue a página.';
    default:                  return 'Não consegui marcar agora. Tente de novo.';
  }
}
/** a recusa do banco, para a liderança na tela de Escala */
export function erroAoMarcar(r: Volta): string {
  if (!r || r.ok) return '';
  switch (r.erro) {
    case 'SEM_PERMISSAO':     return 'Só a liderança deste ministério marca a chegada.';
    case 'CULTO_INEXISTENTE': return 'Esse culto não está mais na escala. Recarregue a tela.';
    case 'AINDA_NAO':         return 'Esse culto ainda não aconteceu.';
    case 'MUITO_ANTIGO':      return 'A chegada pode ser corrigida até 30 dias depois do culto.';
    case 'SEM_POSTO':         return 'Essa pessoa não está na escala desse culto. Recarregue a tela.';
    default:                  return 'Não consegui marcar agora. Tente de novo.';
  }
}

/* -------------------------------------------- a chegada, para o líder --- */
export type PresencaDoLider = { culto_id: string; voluntario_id: string; chegou_em: string; marcado_por: MarcadoPor };
export type GenteNaEscala = {
  vid: string; nome: string; funcoes: string[]; recusou: boolean;
  chegou_em: string | null; marcado_por: MarcadoPor | null;
};
/** quem está no dia, uma linha por pessoa, na ordem dos postos. Quem disse
    que não pode some, a não ser que tenha marca (veio mesmo assim). */
export function genteDoDia(S: Estado, data: string, presencas: PresencaDoLider[]): GenteNaEscala[] {
  const dia = S.escalas[data];
  if (!dia) return [];
  const marcas = new Map(presencas.map(p => [p.voluntario_id, p]));
  const porVid = new Map<string, GenteNaEscala>();
  for (const f of funcoesDoDia(S, data)) {
    const sl = dia.slots?.[f.nome];
    if (!sl?.vid) continue;
    const p = marcas.get(sl.vid);
    const recusou = sl.status === 'recusado';
    if (recusou && !p) continue;
    const ja = porVid.get(sl.vid);
    if (ja) { ja.funcoes.push(f.nome); ja.recusou = ja.recusou && recusou; continue; }
    porVid.set(sl.vid, {
      vid: sl.vid, nome: nomeDe(S, sl.vid) || 'Alguém do time', funcoes: [f.nome], recusou,
      chegou_em: p?.chegou_em ?? null, marcado_por: p?.marcado_por ?? null,
    });
  }
  return [...porVid.values()];
}

/* --------------------------------------------------------- como foi ---- */
export type RespostaComoFoi = 'bom' | 'puxado' | 'problema';
export const COMO_FOI: { v: RespostaComoFoi; rot: string }[] = [
  { v: 'bom', rot: 'Foi bom' },
  { v: 'puxado', rot: 'Foi puxado' },
  { v: 'problema', rot: 'Teve problema' },
];
export const ROTULO_COMO_FOI: Record<RespostaComoFoi, string> =
  { bom: 'foi bom', puxado: 'foi puxado', problema: 'teve problema' };
export const NOTA_MAX = 500;
const RESPOSTAS = COMO_FOI.map(o => o.v);

/* uma linha de `eu_como_foi` */
export type ComoFoiMeu = {
  culto_id: string; data: string; evento: string | null; inicio: string | null; funcoes: string[];
  resposta: RespostaComoFoi | null; texto: string | null; atualizado_em: string | null;
};
/** a resposta de `eu_como_foi`, conferida */
export function comoFoiDoLink(raw: unknown): ComoFoiMeu[] {
  if (!Array.isArray(raw)) return [];
  const out: ComoFoiMeu[] = [];
  for (const c of raw.slice(0, 20)) {
    if (!c || typeof c.culto_id !== 'string' || !ID.test(c.culto_id)) continue;
    if (typeof c.data !== 'string' || !DATA.test(c.data)) continue;
    out.push({
      culto_id: c.culto_id, data: c.data, evento: texto(c.evento, 80),
      inicio: typeof c.inicio === 'string' && HORA.test(c.inicio) ? c.inicio : null,
      funcoes: nomes(c.funcoes),
      resposta: RESPOSTAS.includes(c.resposta) ? c.resposta : null,
      texto: typeof c.texto === 'string' ? c.texto.slice(0, NOTA_MAX) : null,
      atualizado_em: instante(c.atualizado_em),
    });
  }
  return out;
}

/** a data de hoje no relógio da igreja */
export const hojeNaIgreja = (agora: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
const minutosNaIgreja = (agora: Date) => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(agora);
  return (+(p.find(x => x.type === 'hour')?.value ?? 0) % 24) * 60 + +(p.find(x => x.type === 'minute')?.value ?? 0);
};

/** já dá para perguntar como foi: o culto passou. No próprio dia, uma hora
    e meia depois de começar; sem hora conhecida, só à noite (21h). A pergunta
    feita no meio do culto é a que a pessoa aprende a ignorar. */
export function perguntaAberta(c: { data: string; inicio: string | null; evento: string | null },
                               agora: Date, cultoHora: string, followHora?: string | null): boolean {
  const hoje = hojeNaIgreja(agora);
  if (c.data < hoje) return true;
  if (c.data > hoje) return false;
  const ini = minutosDaHora(horaDoDia(c.inicio, c.evento, c.data, cultoHora, followHora) ?? undefined);
  return minutosNaIgreja(agora) >= (ini === null ? 21 * 60 : ini + 90);
}

export function erroAoContar(r: Volta): string {
  if (!r || r.ok) return '';
  switch (r.erro) {
    case 'CULTO_INEXISTENTE': return 'Esse culto não está mais na escala. Recarregue a página.';
    case 'FORA_DA_JANELA':    return 'Já passou uma semana desse culto. Se quiser contar, fale com a liderança.';
    case 'NAO_SERVIU':        return 'Esse culto não aparece como servido por você. Recarregue a página.';
    case 'TEXTO_LONGO':       return `A nota passou de ${NOTA_MAX} letras. Encurte um pouco.`;
    case 'RESPOSTA_INVALIDA': return 'Escolha uma das três respostas.';
    default:                  return 'Não consegui enviar agora. Tente de novo.';
  }
}

/* uma linha de `como_foi_da_equipe` (a liderança) */
export type ComoFoiDaEquipe = {
  culto_id: string; data: string; evento: string | null; voluntario_id: string; nome: string;
  funcoes: string[] | null; resposta: RespostaComoFoi; texto: string | null; atualizado_em: string;
};
/** "3 foi bom · 1 puxado · 1 teve problema", sem as respostas que ninguém deu */
export function resumoComoFoi(lista: { resposta: RespostaComoFoi }[]): string {
  const n = (v: RespostaComoFoi) => lista.filter(x => x.resposta === v).length;
  return [
    n('bom') && `${n('bom')} foi bom`,
    n('puxado') && `${n('puxado')} puxado`,
    n('problema') && `${n('problema')} ${n('problema') === 1 ? 'teve' : 'tiveram'} problema`,
  ].filter(Boolean).join(' · ');
}
/** o que pede atenção primeiro: problema, depois puxado, depois o resto */
export function emOrdemDeAtencao<T extends { resposta: RespostaComoFoi; nome: string }>(lista: T[]): T[] {
  const peso = (r: RespostaComoFoi) => (r === 'problema' ? 0 : r === 'puxado' ? 1 : 2);
  return [...lista].sort((a, b) => peso(a.resposta) - peso(b.resposta) || a.nome.localeCompare(b.nome, 'pt-BR'));
}
