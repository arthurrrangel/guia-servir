/* =============================================================================
   CHAMAR QUEM PODE COBRIR A VAGA — 106, 02/10/2026

   As frases, as contas e os tipos da Fase 4 (claude/estudo-servoapp). Mora
   aqui, e não nas telas, para o teste alcançar (`scripts/chamadas.test.mjs`).

   A IDEIA, EM UMA LINHA: vaga aberta (ninguém, ou quem estava disse que não
   pode) → o líder escolhe quem chamar → cada pessoa responde no próprio link
   → a primeira que aceita fica com a vaga, confirmada, e os outros convites
   fecham. Quem decide tudo isso é o banco (supabase/106); daqui sai o que a
   tela escreve.
   ============================================================================= */
import { type Estado, funcoesDoDia, nomeDe } from './engine';
import { motivoParaMim } from './trocas';

export type StatusDaChamada = 'aberta' | 'aceita' | 'recusada' | 'preenchida' | 'cancelada' | 'expirada';

/* uma linha de `chamadas_do_dia` (o líder) */
export type ChamadaDoLider = {
  id: string; culto_id: string; funcao_id: string; voluntario_id: string; nome: string;
  status: StatusDaChamada; criado_em: string; respondido_em: string | null;
};
/* uma linha de `chamar_candidatos` */
export type CandidatoDaVaga = {
  voluntario_id: string; nome: string; nivel: string; disse_que_pode: boolean;
  no_mes: number; limite: number; chamada: StatusDaChamada | null;
};
/* uma linha de `eu_chamadas` (o voluntário) */
export type ChamadaMinha = {
  id: string; culto_id: string; funcao_id: string; funcao: string; data: string;
  evento: string | null; inicio: string | null; status: StatusDaChamada; aberta: boolean;
  impede: string | null; criado_em: string;
};
type Volta = { ok?: boolean; erro?: string; motivo?: string; status?: string } | null | undefined;

/* ------------------------------------------------------------ a vaga */
/** a vaga está aberta: sem ninguém, ou com quem disse que não pode ou furou
    (a mesma regra de `vaga_aberta`, supabase/106) */
export function vagaAberta(S: Estado, data: string, funcao: string): boolean {
  const sl = S.escalas[data]?.slots?.[funcao];
  return !sl?.vid || sl.status === 'recusado' || sl.status === 'furou';
}
/** os postos do dia com vaga aberta, na ordem dos postos */
export function vagasAbertas(S: Estado, data: string) {
  return funcoesDoDia(S, data).filter(f => !!f.id && vagaAberta(S, data, f.nome));
}

/* ------------------------------------------------------- o que a tela diz */
export const ESTADO_DA_CHAMADA: Record<StatusDaChamada, string> = {
  aberta: 'esperando', aceita: 'aceitou', recusada: 'não pode', preenchida: 'vaga preenchida',
  cancelada: 'cancelado', expirada: 'expirou',
};

/** os chamados de uma vaga, o mais recente de cada pessoa, abertos primeiro */
export function chamadosDaVaga(lista: ChamadaDoLider[], culto: string, funcao: string): ChamadaDoLider[] {
  const ultimo = new Map<string, ChamadaDoLider>();
  for (const c of lista) {
    if (c.culto_id !== culto || c.funcao_id !== funcao) continue;
    const ja = ultimo.get(c.voluntario_id);
    if (!ja || c.criado_em > ja.criado_em) ultimo.set(c.voluntario_id, c);
  }
  const peso = (s: StatusDaChamada) => (s === 'aceita' ? 0 : s === 'aberta' ? 1 : s === 'recusada' ? 2 : 3);
  return [...ultimo.values()].sort((a, b) => peso(a.status) - peso(b.status) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** quem já vem marcado para chamar: os três primeiros da lista que ainda não
    foram chamados (ou cujo convite fechou sem resposta), nunca quem já disse
    que não pode cobrir esta vaga */
export function marcadosDeInicio(cands: CandidatoDaVaga[], quantos = 3): string[] {
  return cands.filter(c => !c.chamada || c.chamada === 'cancelada' || c.chamada === 'expirada')
    .slice(0, quantos).map(c => c.voluntario_id);
}

/** a linha de quem pode cobrir, para o líder escolher */
export function detalheDoCandidato(c: CandidatoDaVaga): string {
  const p: string[] = [];
  p.push(c.disse_que_pode ? 'disse que pode' : 'não respondeu o dia');
  p.push(`${c.no_mes} ${c.no_mes === 1 ? 'escala' : 'escalas'} no mês${c.limite ? ` (limite ${c.limite})` : ''}`);
  if (c.nivel === 'reserva') p.push('ajuda quando falta');
  if (c.chamada === 'aberta') p.push('já chamado, esperando');
  else if (c.chamada === 'recusada') p.push('disse que não pode cobrir');
  return p.join(' · ');
}

export function erroAoChamar(r: Volta): string {
  if (!r || r.ok) return '';
  switch (r.erro) {
    case 'SEM_PERMISSAO':     return 'Só a liderança deste ministério chama para esta vaga.';
    case 'CULTO_INEXISTENTE': return 'Esse culto não está mais na escala. Recarregue a tela.';
    case 'JA_PASSOU':         return 'Esse dia já passou.';
    case 'POSTO_NAO_VALE':    return 'Esse posto não existe nesse culto.';
    case 'VAGA_OCUPADA':      return 'A vaga já tem alguém. Recarregue a tela para ver quem.';
    case 'NINGUEM':           return 'Marque quem chamar.';
    case 'MUITOS':            return 'Chame até 10 pessoas por vez.';
    case 'MUITOS_HOJE':       return 'O ministério já chamou 80 pessoas hoje. Tente amanhã, ou fale direto com quem falta.';
    default:                  return 'Não consegui chamar agora. Tente de novo.';
  }
}

/** por que alguém marcado não foi chamado (volta de `chamar_para_cobrir`) */
export function motivoDeNaoChamar(m: string | null | undefined): string {
  switch (m) {
    case 'INDISPONIVEL':   return 'avisou que não pode nesse dia';
    case 'JA_ESCALADO':    return 'já está em outro posto nesse dia';
    case 'NAO_FAZ':        return 'não faz essa função';
    case 'SEXO':           return 'o posto é de outro sexo';
    case 'INATIVO':        return 'está pausado';
    case 'OUTRA_AREA':     return 'é de outra área';
    case 'MUITOS_NA_VAGA': return 'a vaga já tem 10 chamados abertos';
    default:               return 'não pode agora';
  }
}

/** o resultado de chamar, numa frase: "3 pessoas chamadas." e quem ficou de fora */
export function resultadoDeChamar(chamados: number, recusados: { nome: string; motivo: string }[]): string {
  const a = chamados === 0 ? 'Ninguém foi chamado.' : chamados === 1 ? '1 pessoa chamada.' : `${chamados} pessoas chamadas.`;
  if (!recusados.length) return a;
  return `${a} ${recusados.map(r => `${primeiro(r.nome)} ${motivoDeNaoChamar(r.motivo)}`).join('; ')}.`;
}

/* ------------------------------------------------------- o voluntário */
export function erroAoResponderChamada(r: Volta, exigeSexo?: string | null): string {
  if (!r || r.ok) return '';
  switch (r.erro) {
    case 'NAO_E_SUA':       return 'Esse convite não é para você.';
    case 'NAO_ESTA_ABERTA':
      return r.status === 'preenchida' ? 'Alguém já ficou com essa vaga. Obrigado por responder.'
        : r.status === 'cancelada' ? 'A liderança já não precisa de alguém nessa vaga.'
        : 'Esse convite já foi respondido.';
    case 'PREENCHIDA':      return 'Alguém já ficou com essa vaga. Obrigado por responder.';
    case 'JA_PASSOU':       return 'Esse dia já passou.';
    case 'MUDOU':           return 'Esse posto saiu da escala desse dia. Nada mudou na sua escala.';
    case 'NAO_PODE':        return motivoParaMim(r.motivo, exigeSexo);
    default:                return 'Não consegui responder agora. Tente de novo.';
  }
}

/** os convites que pedem resposta e os que só dão notícia */
export function separarChamadas(lista: ChamadaMinha[]) {
  return {
    abertas: lista.filter(c => c.status === 'aberta' && c.aberta),
    fechadas: lista.filter(c => !(c.status === 'aberta' && c.aberta)),
  };
}
export function noticiaDaChamada(c: ChamadaMinha): string {
  if (c.status === 'aceita') return 'Você ficou com essa vaga.';
  if (c.status === 'recusada') return 'Você respondeu que não pode.';
  if (c.status === 'cancelada') return 'A liderança já não precisa de alguém nessa vaga.';
  return 'Alguém já ficou com essa vaga.';
}

/* ------------------------------------------------- o recado no WhatsApp */
const primeiro = (n: string | null | undefined) => (n || '').trim().split(/\s+/)[0] || '';
/** o recado que o líder manda pelo WhatsApp, com o link pessoal de quem foi
    chamado (o mesmo que `msgConvite` já manda), aberto nos convites */
export function recadoDaChamada(nome: string, funcao: string, quando: string, base: string, token: string): string {
  const oi = primeiro(nome);
  return `${oi ? `Oi, ${oi}!` : 'Oi!'} Precisamos de alguém em ${funcao}, ${quando}. Você pode cobrir? `
    + `Responde por aqui, em um toque: ${base}/eu/${encodeURIComponent(token)}#chamadas`;
}
/** wa.me a partir do número guardado (o mesmo jeito de lib/candidaturas.ts) */
export function linkDoWhats(telefone: string | null | undefined, texto: string): string | null {
  const n = (telefone || '').replace(/\D/g, '');
  if (n.length < 10) return null;
  return `https://wa.me/${n.length <= 11 ? '55' + n : n}?text=${encodeURIComponent(texto)}`;
}
/** o nome da pessoa no estado do líder, ou o que o banco mandou */
export const nomeNaEscala = (S: Estado, id: string, reserva: string) => nomeDe(S, id) || reserva;
