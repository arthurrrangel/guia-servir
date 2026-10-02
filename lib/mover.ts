/* =============================================================================
   MUDAR PESSOAS DE POSTO NUM DIA JÁ MONTADO · 02/10/2026

   Pedido do Arthur: "verifique se não há nenhum impedimento sobre mudar os
   nomes de posição de escalas já montadas, tava tendo bloqueio e não tava
   conseguindo mudar pessoas".

   O BLOQUEIO, PROVADO NA TELA: no dia montado, escolher num posto alguém que
   já está em outro posto do mesmo culto dava "Fulano já está em X nesse
   mesmo culto. Tire de lá antes, ou escolha outra pessoa." e nada mudava.
   Trocar duas pessoas de lugar custava três passos (esvaziar um posto,
   escolher, escolher de novo), com duas perguntas "trocar apaga essa
   resposta" no meio, e quem já tinha confirmado perdia a confirmação.

   AGORA, escolher quem já está em outro posto pergunta uma vez o que fazer:
     · trocar os dois de lugar (quem está no destino vai para o posto de
       origem), quando essa pessoa pode ir para lá;
     · passar só a pessoa escolhida (o posto de origem fica sem ninguém, e
       quem estava no destino sai do dia).
   Quem muda de posto leva a própria situação (confirmou continua
   confirmado; quem tinha dito que não pode volta a "falta confirmar"), a
   hora da resposta e a marca de 1ª vez. O link de quem mudou mostra "entrou
   hoje" (`escalado_em`, migração 38).

   UMA GRAVAÇÃO SÓ, TUDO OU NADA. O dia comum é salvo em partes
   (`salvarDia`, lib/db.ts): três requisições, três transações. Para mover,
   isso seria apagar as duas vagas e inserir de novo, e uma recusa no meio
   deixaria as duas vazias. Aqui as linhas das duas vagas são regravadas por
   id num único `upsert` (uma instrução, uma transação): o banco confere todas
   as regras dele (não posso, posto de homens ou de mulheres, ninguém em dois
   postos ao mesmo tempo, o ministério, o RLS do líder) e aceita as duas
   linhas ou nenhuma.

   No "passar só", a vaga de origem fica sem pessoa dentro da mesma instrução
   (é o que libera a pessoa para o destino) e a linha vazia sai logo depois.
   Se essa limpeza falhar, sobra uma linha sem ninguém, que a tela já lê como
   "precisa de alguém" e que o próximo salvamento do dia apaga.

   Este arquivo é puro: decide e planeja. Quem fala com o banco é
   `moverNoDia`, em lib/db.ts.
   ============================================================================= */
import { type Estado, type Status, nivelEfetivo, nomeDe, porqueNaoPode, postoSimultaneoNoDia, respostaDe, metaFuncao } from './engine';

/* ------------------------------------------------------------- a decisão --- */

export type ComoMover = {
  /** o posto onde a pessoa escolhida está agora */
  de: string;
  /** quem está no posto de destino agora, ou null se está vazio */
  ocupante: string | null;
  /** dá para trocar os dois de lugar */
  podeTrocar: boolean;
  /** quando há ocupante e não dá para trocar: o motivo, numa frase */
  semTroca: string;
};

/** null quando a escolha não é mudança de posto: a pessoa não está em outro
 *  posto ao mesmo tempo nesse dia (aí vale o caminho de sempre). */
export function comoMover(S: Estado, data: string, para: string, quem: string): ComoMover | null {
  const de = postoSimultaneoNoDia(S, data, quem, para);
  if (!de) return null;
  const ocupante = S.escalas[data]?.slots?.[para]?.vid || null;
  if (!ocupante || ocupante === quem) return { de, ocupante: null, podeTrocar: false, semTroca: '' };
  const motivo = porqueNaoTroca(S, data, de, para, ocupante);
  return { de, ocupante, podeTrocar: !motivo, semTroca: motivo };
}

/* Quem está no destino pode ir para o posto de origem? As mesmas perguntas
   que o banco faz (não posso, sexo do posto, ninguém em dois postos ao mesmo
   tempo), mais as da lista do líder (faz a função, está ativo), mais a
   situação: quem disse que não pode ou furou nesse dia não é levado para
   outro posto do mesmo dia. */
function porqueNaoTroca(S: Estado, data: string, de: string, para: string, ocupante: string): string {
  const v = S.voluntarios.find(x => x.id === ocupante);
  const nome = nomeDe(S, ocupante) || 'Quem está lá';
  if (!v) return `${nome} não é deste ministério`;
  const st = S.escalas[data]?.slots?.[para]?.status || 'pendente';
  if (st === 'recusado' || respostaDe(v, data) === 'nao') return `${nome} avisou que não pode nesse dia`;
  if (st === 'furou') return `${nome} está como furou nesse dia`;
  if (!v.ativo) return `${nome} está pausado no time`;
  if (!nivelEfetivo(v, de)) return `${nome} não faz ${de}`;
  const sexo = porqueNaoPode(S, v, de);
  if (sexo) return sexo.replace(/\.$/, '');
  if (metaFuncao(S, de).simultanea) {
    for (const [fn, sl] of Object.entries(S.escalas[data]?.slots || {})) {
      if (fn === de || fn === para || sl?.vid !== ocupante) continue;
      if (metaFuncao(S, fn).simultanea) return `${nome} também está em ${fn}`;
    }
  }
  return '';
}

/* --------------------------------------------------------- as palavras --- */

export type Opcao = { v: 'trocar' | 'passar'; rot: string; sub: string; pri: boolean };
export type PerguntaDeMover = { titulo: string; texto: string; opcoes: Opcao[] };

const RESPONDEU: Partial<Record<Status, string>> = {
  confirmado: 'já tinha confirmado',
  furou: 'está marcado como furou',
};

export function perguntaDeMover(S: Estado, data: string, para: string, quem: string, m: ComoMover): PerguntaDeMover {
  const P = nomeDe(S, quem) || 'Essa pessoa';
  const titulo = `${P} já está em ${m.de} nesse culto.`;
  if (!m.ocupante) {
    return {
      titulo, texto: '',
      opcoes: [{ v: 'passar', rot: `Passar para ${para}`, sub: `${m.de} fica sem ninguém.`, pri: true }],
    };
  }
  const Q = nomeDe(S, m.ocupante) || 'quem está lá';
  const stQ = (S.escalas[data]?.slots?.[para]?.status || 'pendente') as Status;
  const respondeu = RESPONDEU[stQ];
  const opcoes: Opcao[] = [];
  if (m.podeTrocar) {
    opcoes.push({ v: 'trocar', rot: 'Trocar os dois de lugar', sub: `${Q} vai para ${m.de}.`, pri: true });
  }
  opcoes.push({
    v: 'passar', rot: `Passar só ${P}`,
    sub: `${m.de} fica sem ninguém e ${Q} sai desse dia${respondeu ? ` (${respondeu})` : ''}.`,
    pri: !m.podeTrocar,
  });
  return { titulo, texto: m.podeTrocar ? '' : `Não dá para trocar os dois de lugar: ${m.semTroca}.`, opcoes };
}

/* -------------------------------------------------------------- o plano --- */

/** a linha de `escalacoes` como o banco tem agora */
export type LinhaDaVaga = {
  id: string; funcao_id: string; voluntario_id: string | null; status: Status;
  respondido_em: string | null; fixo: boolean; primeira_vez: boolean;
};
/** o que vai no upsert: as mesmas chaves em todas as linhas (o PostgREST
 *  monta uma instrução só com a união delas) */
export type LinhaParaGravar = LinhaDaVaga & { culto_id: string; escalado_em: string };

export type PedidoDeMover = {
  culto: string;
  /** id da função de origem (onde a pessoa está) */
  de: string;
  /** id da função de destino (onde o líder escolheu a pessoa) */
  para: string;
  /** a pessoa escolhida */
  quem: string;
  /** quem a TELA acredita estar no destino (null = vazio) */
  ocupante: string | null;
  modo: 'trocar' | 'passar';
};

export type PlanoDeMover =
  | { ok: true; gravar: LinhaParaGravar[]; limpar: string[] }
  | { ok: false; erro: 'MUDOU' };

/* `agora` entra em `escalado_em`: no upsert, o gatilho da 38 (BEFORE INSERT)
   regrava esse campo com o relógio do banco antes do UPDATE, então o valor
   daqui só vale se o gatilho não existir. Mandar o campo é o que faz a linha
   que mudou de posto sem mudar de pessoa também mostrar "entrou hoje". */
export function planoDeMover(p: PedidoDeMover, linhas: LinhaDaVaga[], agora: string): PlanoDeMover {
  const lDe = linhas.find(l => l.funcao_id === p.de);
  const lPara = linhas.find(l => l.funcao_id === p.para);
  /* o banco tem de estar como a tela acredita: a pessoa na origem e, no
     destino, quem a tela mostra. Senão outro líder (ou uma troca aceita no
     link) mexeu nesse meio tempo, e mover agora apagaria o que ele fez. */
  if (!lDe || lDe.voluntario_id !== p.quem) return { ok: false, erro: 'MUDOU' };
  const noDestino = lPara?.voluntario_id || null;
  if (noDestino !== (p.ocupante || null)) return { ok: false, erro: 'MUDOU' };
  if (p.modo === 'trocar' && !lPara?.voluntario_id) return { ok: false, erro: 'MUDOU' };

  const leva = (l: LinhaDaVaga, funcao: string, id: string): LinhaParaGravar => {
    /* quem tinha dito que não pode e foi posto em outro posto pelo líder
       volta a "falta confirmar": a pessoa decide no link */
    const status: Status = l.status === 'recusado' ? 'pendente' : l.status;
    return {
      id, culto_id: p.culto, funcao_id: funcao, voluntario_id: l.voluntario_id, status,
      respondido_em: status === 'pendente' ? null : l.respondido_em,
      fixo: true, primeira_vez: !!l.primeira_vez, escalado_em: agora,
    };
  };
  const vazia = (id: string, funcao: string): LinhaParaGravar => ({
    id, culto_id: p.culto, funcao_id: funcao, voluntario_id: null, status: 'pendente',
    respondido_em: null, fixo: false, primeira_vez: false, escalado_em: agora,
  });

  if (p.modo === 'trocar') {
    return { ok: true, gravar: [leva(lPara!, p.de, lDe.id), leva(lDe, p.para, lPara!.id)], limpar: [] };
  }
  /* passar para a vaga que não tem linha: a própria linha muda de função */
  if (!lPara) return { ok: true, gravar: [leva(lDe, p.para, lDe.id)], limpar: [] };
  return { ok: true, gravar: [leva(lDe, p.para, lPara.id), vazia(lDe.id, p.de)], limpar: [lDe.id] };
}
