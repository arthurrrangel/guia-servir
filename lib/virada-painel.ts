/* =============================================================================
   O PAINEL DA VIRADA 2027: AS CONTAS · 21/11/2026 (migração 118)

   O que a administração precisa saber da noite: quantas pessoas vão,
   quantos lugares restam, quem é membro e quem é visitante, e a lista para
   a porta (a planilha). Puro: a tela (components/virada/Painel.tsx) e o
   teste (scripts/virada.test.mjs) usam as mesmas contas.
   ============================================================================= */
import { mascaraCpf, mascaraTelefone } from './virada';

/* a hora em Brasília, e não a do servidor: "2027-01-01T02:10:00Z" foi dia 31 */
export function dataHoraBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
  const v = (t: string) => p.find(x => x.type === t)?.value ?? '';
  return `${v('day')}/${v('month')}/${v('year')} ${v('hour')}:${v('minute')}`;
}

export type ReservaBanco = {
  id: string; evento: string; criada_em: string; origem: 'site' | 'manual';
  nome: string; cpf: string | null; email: string | null; telefone: string | null;
  vinculo: 'membro' | 'visitante' | null; pessoas: number;
  lancada_por: string | null; cancelada_em: string | null; cancelada_por: string | null; motivo: string | null;
};
export type EventoBanco = { slug: string; nome: string; capacidade: number; max_por_reserva: number; fecha_em: string | null };

export type Resumo = { reservas: number; pessoas: number; restantes: number; membros: number; visitantes: number; semVinculo: number; canceladas: number };

/** As contas da noite: só as reservas vivas contam (pessoas, não reservas). */
export function resumoDe(reservas: readonly ReservaBanco[], capacidade: number): Resumo {
  const vivas = reservas.filter(r => !r.cancelada_em);
  const soma = (f: (r: ReservaBanco) => boolean) => vivas.filter(f).reduce((a, r) => a + r.pessoas, 0);
  const pessoas = soma(() => true);
  return {
    reservas: vivas.length,
    pessoas,
    restantes: Math.max(capacidade - pessoas, 0),
    membros: soma(r => r.vinculo === 'membro'),
    visitantes: soma(r => r.vinculo === 'visitante'),
    semVinculo: soma(r => !r.vinculo),
    canceladas: reservas.length - vivas.length,
  };
}

const celula = (v: string | number | null | undefined) => {
  const t = v == null ? '' : String(v);
  return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const linha = (xs: (string | number | null | undefined)[]) => xs.map(celula).join(';');

/** A planilha da porta: em ordem de nome, as vivas primeiro. Abre no Excel
 *  em português (ponto e vírgula, com o BOM do UTF-8). */
export function csvDasReservas(reservas: readonly ReservaBanco[]): string {
  const ordem = [...reservas].sort((a, b) =>
    (a.cancelada_em ? 1 : 0) - (b.cancelada_em ? 1 : 0) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const cab = ['Nome', 'Pessoas', 'Membro ou visitante', 'Telefone', 'E-mail', 'CPF', 'Reservou em', 'Origem', 'Cancelada em', 'Motivo'];
  const linhas = ordem.map(r => linha([
    r.nome, r.pessoas, r.vinculo === 'membro' ? 'Membro' : r.vinculo === 'visitante' ? 'Visitante' : '',
    r.telefone ? mascaraTelefone(r.telefone) : '', r.email, r.cpf ? mascaraCpf(r.cpf) : '',
    dataHoraBr(r.criada_em), r.origem === 'site' ? 'Site' : `Lançada${r.lancada_por ? ` por ${r.lancada_por}` : ''}`,
    r.cancelada_em ? dataHoraBr(r.cancelada_em) : '', r.motivo,
  ]));
  return '﻿' + [linha(cab), ...linhas].join('\r\n') + '\r\n';
}

export function nomeDoArquivo(agora = new Date()): string {
  return `virada-2027-reservas-${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora)}.csv`;
}
