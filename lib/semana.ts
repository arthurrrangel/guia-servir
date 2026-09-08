import { IGREJA } from './igreja';
import { PEQUENAS_GUIAS, type PequenaGuia } from './pequenas-guias';

/* =============================================================================
   A SEMANA DA IGREJA — o motor do "agora"

   08/09/2026. O site v3 fala no presente: "Hoje, 20h · Barraspace, Av. das
   Américas", "Domingo, daqui a 2 dias · Culto, 10h". Para isso ele precisa
   saber, a partir de uma data qualquer, o que é a PRÓXIMA coisa que acontece
   na igreja e o que acontece em cada dia da semana. Este arquivo é a única
   fonte disso; a home, /cultos e /pequena-guia perguntam aqui.

   O QUE ENTRA, E DE ONDE:
   · o culto de domingo, 10h — de lib/igreja.ts, a mesma fonte do rodapé;
   · o Follow, o culto de jovens de sábado — acontece nos sábados do mês,
     MENOS no primeiro (dito pelo Arthur). O horário não está confirmado em
     lugar nenhum, então ele entra SEM hora: "Sábado · Follow". Página de
     igreja não é lugar de dado inventado. Quando IGREJA.followHora existir,
     a hora entra sozinha.
   · as Pequenas Guias, dia e hora de cada uma — de lib/pequenas-guias.ts.

   Tudo é calculado no aparelho da pessoa, depois de montar: o servidor
   pré-renderiza uma vez e ficaria com a data velha. Até montar, as telas
   mostram o texto fixo ("Domingo, 10h"), igual nos dois lados.
   ============================================================================= */

export type TipoEvento = 'culto' | 'follow' | 'grupo';

export type Evento = {
  tipo: TipoEvento;
  nome: string;
  /** 0 = domingo … 6 = sábado */
  dia: number;
  /** "20h", "17h30" — ausente quando a igreja ainda não confirmou */
  hora?: string;
  /** onde: bairro do grupo, ou a igreja */
  onde: string;
  href: string;
  grupo?: PequenaGuia;
};

export type Ocorrencia = {
  evento: Evento;
  /** o instante em que acontece (ou o fim do dia, para evento sem hora) */
  quando: Date;
  /** 0 = hoje, 1 = amanhã… */
  emDias: number;
};

export const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** o mesmo, sem acento, para URL (?dia=qua) */
export const DIAS_URL = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
export const DIAS_LONGOS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const DIA_DA_GUIA: Record<PequenaGuia['dia'], number> = {
  Segunda: 1, Terça: 2, Quarta: 3, Quinta: 4, Sexta: 5, Sábado: 6,
};

/** "20h" → 20:00, "17h30" → 17:30. Devolve null para texto que não é hora. */
export function minutosDaHora(hora?: string): number | null {
  if (!hora) return null;
  const m = /^(\d{1,2})h(\d{2})?$/.exec(hora.trim());
  if (!m) return null;
  return +m[1] * 60 + (m[2] ? +m[2] : 0);
}

/** O Follow acontece nos sábados do mês, menos no primeiro. */
export function ehSabadoDeFollow(d: Date): boolean {
  return d.getDay() === 6 && d.getDate() > 7;
}

/** Tudo que acontece numa semana típica, sem data: o calendário fixo. */
export function eventosDaSemana(): Evento[] {
  const lista: Evento[] = [
    { tipo: 'culto', nome: 'Culto', dia: 0, hora: IGREJA.cultoHora, onde: IGREJA.bairro, href: '/cultos' },
    { tipo: 'follow', nome: 'Follow', dia: 6, hora: IGREJA.followHora ?? undefined, onde: IGREJA.bairro, href: '/cultos#follow' },
  ];
  for (const g of PEQUENAS_GUIAS) {
    lista.push({
      tipo: 'grupo', nome: g.nome, dia: DIA_DA_GUIA[g.dia], hora: g.hora,
      onde: g.online ? g.online : g.bairro,
      href: `/pequena-guia?dia=${DIAS_URL[DIA_DA_GUIA[g.dia]]}`,
      grupo: g,
    });
  }
  return lista;
}

/** Os eventos de um dia da semana (0–6), na ordem da hora. */
export function eventosDoDia(dia: number): Evento[] {
  return eventosDaSemana()
    .filter(e => e.dia === dia)
    .sort((a, b) => (minutosDaHora(a.hora) ?? 24 * 60) - (minutosDaHora(b.hora) ?? 24 * 60));
}

/* A PRÓXIMA OCORRÊNCIA DE CADA EVENTO, a partir de `agora`.
   Um evento de hoje conta como próximo enquanto não passou (culto: até uma
   hora e meia depois de começar, porque quem chega atrasado ainda chega;
   grupo: até o começo). Evento sem hora conta o dia inteiro. */
export function proximas(agora: Date, n = 3): Ocorrencia[] {
  const out: Ocorrencia[] = [];
  for (const e of eventosDaSemana()) {
    for (let salto = 0; salto < 14; salto++) {
      const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + salto);
      if (d.getDay() !== e.dia) continue;
      if (e.tipo === 'follow' && !ehSabadoDeFollow(d)) continue;
      const min = minutosDaHora(e.hora);
      const quando = new Date(d);
      if (min == null) quando.setHours(23, 59, 0, 0);
      else quando.setHours(Math.floor(min / 60), min % 60, 0, 0);
      const tolerancia = e.tipo === 'culto' ? 90 * 60 * 1000 : 0;
      if (quando.getTime() + tolerancia < agora.getTime()) continue;
      out.push({ evento: e, quando, emDias: salto });
      break;
    }
  }
  out.sort((a, b) => a.quando.getTime() - b.quando.getTime());
  return out.slice(0, n);
}

/** A próxima coisa da igreja: o culto ou grupo mais perto de agora. */
export function proxima(agora: Date): Ocorrencia | null {
  return proximas(agora, 1)[0] ?? null;
}

/** "Hoje", "Amanhã", "Domingo" ou "Domingo, daqui a 3 dias". */
export function rotuloDoDia(o: Ocorrencia): string {
  if (o.emDias === 0) return 'Hoje';
  if (o.emDias === 1) return 'Amanhã';
  const nome = DIAS_LONGOS[o.quando.getDay()];
  return o.emDias <= 6 ? nome : `${nome}, dia ${o.quando.getDate()}`;
}

/** A frase do herói: "Hoje, 20h · Pequena Guia Barraspace" */
export function fraseDoAgora(o: Ocorrencia): { quando: string; oque: string } {
  const quando = o.evento.hora ? `${rotuloDoDia(o)}, ${o.evento.hora}` : rotuloDoDia(o);
  const oque = o.evento.tipo === 'grupo' ? `Pequena Guia ${o.evento.nome}`
    : o.evento.tipo === 'follow' ? 'Follow, o culto de jovens'
    : 'Culto de domingo';
  return { quando, oque };
}
