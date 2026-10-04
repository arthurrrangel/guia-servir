/* =============================================================================
   O PAINEL DO FOLLOW CAMP: AS CONTAS — 04/10/2026 (migração 110)

   O Arthur: "preciso que o próprio site informe tudo o que foi pago, qual
   valor foi pago e tudo mais, tudo 100% organizado". Este arquivo é a conta,
   sem tela e sem banco, para o teste segurar cada número
   (scripts/followcamp-painel.test.mjs).

   AS PALAVRAS, UMA VEZ SÓ
     · RECEBIDO   pagamento CONFERIDO: lançado pela organização, conferido na
                  Stone com um toque, ou vindo da API da Stone.
     · A CONFERIR quem pagou e avisou pelo site ("Avisar no WhatsApp"), e a
                  organização ainda não achou na Stone. NÃO entra no recebido.
     · DEVIDO     o valor da ficha (R$ 697 ou R$ 627,30 no 1º lote). Ficha sem
                  valor ("a confirmar") não entra na conta do que falta.
     · QUITADO    recebido >= devido. PARCIAL: recebido > 0 e menor.
   Ficha cancelada (desistência) sai de todas as contas e continua na lista.

   Dinheiro em CENTAVOS do começo ao fim: 0,1 + 0,2 não é 0,3 em ponto
   flutuante, e um painel de dinheiro que erra um centavo ensina a não confiar
   nele.
   ============================================================================= */
import { semFormula, CABECALHO } from './followcamp-ficha';
import { emReais, limpaNome, soDigitos } from './followcamp';

export type FormaDaFicha = 'pix' | 'cartao' | 'dinheiro' | 'carne';
export type Forma = 'pix_direto' | 'link_stone' | 'pix_stone' | 'cartao_stone' | 'dinheiro';
export type Referente = 'inscricao' | 'irmaos' | 'parcela';

export type FichaBanco = {
  id: string; recebida_em: string; origem: 'site' | 'whatsapp' | 'manual';
  campista: string; nascimento: string | null; idade: number | null;
  sexo: 'feminino' | 'masculino' | null; camisa: string | null; whats_campista: string | null;
  alergias: string | null; saude: string | null;
  responsavel_nome: string | null; responsavel_cpf: string | null; responsavel_whats: string | null; parentesco: string | null;
  emergencia_nome: string | null; emergencia_whats: string | null;
  irmao: string | null; valor: number | null; pagamento: FormaDaFicha | null; imagem: boolean | null;
  termo: string | null; versao_termo: string | null; lancada_por: string | null;
  cancelada_em: string | null; cancelada_por: string | null; motivo: string | null;
};

export type PagamentoBanco = {
  id: string; criado_em: string; pago_em: string; ficha_id: string | null; campista: string;
  referente: Referente; forma: Forma; valor: number; quem_pagou: string | null; codigo: string | null;
  conferido: boolean; origem: 'manual' | 'site' | 'stone'; stone_pedido: string | null;
  observacao: string | null; registrado_por: string | null;
};

export const ROTULO_FORMA: Record<Forma, string> = {
  pix_direto: 'Pix direto', link_stone: 'Link da Stone', pix_stone: 'Pix pela Stone',
  cartao_stone: 'Cartão pela Stone', dinheiro: 'Dinheiro',
};
export const FORMAS: readonly Forma[] = ['pix_direto', 'link_stone', 'dinheiro', 'pix_stone', 'cartao_stone'];
export const ROTULO_FORMA_DA_FICHA: Record<FormaDaFicha, string> = {
  pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro', carne: 'Carnê Follow',
};
export const ROTULO_REFERENTE: Record<Referente, string> = {
  inscricao: 'Inscrição', irmaos: 'Irmãos', parcela: 'Parcela do carnê',
};
export const ROTULO_ORIGEM: Record<PagamentoBanco['origem'], string> = {
  site: 'avisou pelo site', manual: 'lançado', stone: 'API da Stone',
};

export const centavos = (v: number | null | undefined) => Math.round(Number(v || 0) * 100);
export const reais = (c: number) => emReais(c / 100);

export type Status = 'quitado' | 'parcial' | 'a_conferir' | 'pendente' | 'cancelada';
export const ROTULO_STATUS: Record<Status, string> = {
  quitado: 'Pago', parcial: 'Pagou parte', a_conferir: 'A conferir', pendente: 'Não pagou', cancelada: 'Desistiu',
};

export type Situacao = {
  ficha: FichaBanco;
  /** em centavos; null = ficha "a confirmar" */
  devido: number | null;
  recebido: number;
  aConferir: number;
  falta: number | null;
  status: Status;
  pagamentos: PagamentoBanco[];
};

export function situacaoDe(f: FichaBanco, pagamentos: readonly PagamentoBanco[]): Situacao {
  const meus = pagamentos.filter(p => p.ficha_id === f.id);
  const recebido = meus.filter(p => p.conferido).reduce((s, p) => s + centavos(p.valor), 0);
  const aConferir = meus.filter(p => !p.conferido).reduce((s, p) => s + centavos(p.valor), 0);
  const devido = f.valor == null ? null : centavos(f.valor);
  const falta = devido == null ? null : Math.max(0, devido - recebido);
  const status: Status = f.cancelada_em ? 'cancelada'
    : devido != null && devido > 0 && recebido >= devido ? 'quitado'
    : recebido > 0 ? 'parcial'
    : aConferir > 0 ? 'a_conferir'
    : 'pendente';
  return { ficha: f, devido, recebido, aConferir, falta, status, pagamentos: meus };
}

export type Resumo = {
  inscritos: number; pelosite: number; lancadas: number; desistencias: number;
  escolheram: Record<FormaDaFicha | 'sem', number>;
  quitados: number; parciais: number; aConferirQtd: number; pendentes: number;
  /** centavos */
  recebido: number; aConferir: number; devido: number; falta: number;
  recebidoPorForma: Record<Forma, number>;
  semFicha: number; semFichaValor: number;
};

export function resumoDe(fichas: readonly FichaBanco[], pagamentos: readonly PagamentoBanco[]): Resumo {
  const ativas = fichas.filter(f => !f.cancelada_em);
  const sits = ativas.map(f => situacaoDe(f, pagamentos));
  const escolheram: Resumo['escolheram'] = { pix: 0, cartao: 0, dinheiro: 0, carne: 0, sem: 0 };
  for (const f of ativas) escolheram[f.pagamento ?? 'sem']++;
  const recebidoPorForma = Object.fromEntries(FORMAS.map(x => [x, 0])) as Record<Forma, number>;
  for (const p of pagamentos) if (p.conferido) recebidoPorForma[p.forma] += centavos(p.valor);
  const semFicha = pagamentos.filter(p => !p.ficha_id);
  return {
    inscritos: ativas.length,
    pelosite: ativas.filter(f => f.origem === 'site').length,
    lancadas: ativas.filter(f => f.origem !== 'site').length,
    desistencias: fichas.length - ativas.length,
    escolheram,
    quitados: sits.filter(s => s.status === 'quitado').length,
    parciais: sits.filter(s => s.status === 'parcial').length,
    aConferirQtd: pagamentos.filter(p => !p.conferido).length,
    pendentes: sits.filter(s => s.status === 'pendente' || s.status === 'a_conferir').length,
    recebido: pagamentos.filter(p => p.conferido).reduce((s, p) => s + centavos(p.valor), 0),
    aConferir: pagamentos.filter(p => !p.conferido).reduce((s, p) => s + centavos(p.valor), 0),
    devido: sits.reduce((s, x) => s + (x.devido ?? 0), 0),
    falta: sits.reduce((s, x) => s + (x.falta ?? 0), 0),
    recebidoPorForma,
    semFicha: semFicha.length,
    semFichaValor: semFicha.reduce((s, p) => s + centavos(p.valor), 0),
  };
}

/** A ordem da lista: quem mais precisa de olho primeiro (a conferir, parcial,
 *  não pagou), quitado depois, desistência no fim; dentro, por nome. */
const PESO: Record<Status, number> = { a_conferir: 0, parcial: 1, pendente: 2, quitado: 3, cancelada: 4 };
export function ordenarSituacoes(xs: Situacao[]): Situacao[] {
  return [...xs].sort((a, b) => PESO[a.status] - PESO[b.status]
    || a.ficha.campista.localeCompare(b.ficha.campista, 'pt-BR', { sensitivity: 'base' }));
}

/* -------------------------------------------------------------- exportar ---
   CSV com ponto e vírgula, vírgula decimal e BOM: é o que o Excel em
   português abre direto, em colunas, com acento. Toda célula de texto passa
   por `semFormula` (o "=IMPORTXML" digitado na alergia não roda na planilha
   de quem abrir). */
const celula = (v: string | number | boolean | null | undefined): string => {
  if (v == null) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : typeof v === 'boolean' ? (v ? 'Sim' : 'Não') : semFormula(String(v));
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const linhaCsv = (xs: (string | number | boolean | null | undefined)[]) => xs.map(celula).join(';');
const dataBr = (iso: string | null) => {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ''}` : iso;
};
/* a hora em Brasília, e não a do servidor: "2026-10-04T02:10:00Z" foi dia 3 */
export function dataHoraBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
  const v = (t: string) => p.find(x => x.type === t)?.value ?? '';
  return `${v('day')}/${v('month')}/${v('year')} ${v('hour')}:${v('minute')}`;
}

export function csvFichas(fichas: readonly FichaBanco[], pagamentos: readonly PagamentoBanco[]): string {
  const cab = [...CABECALHO, 'Recebido (conferido)', 'A conferir', 'Falta', 'Situação', 'Cancelada em', 'Motivo'];
  const linhas = fichas.map(f => {
    const s = situacaoDe(f, pagamentos);
    return linhaCsv([
      dataHoraBr(f.recebida_em), f.campista, dataBr(f.nascimento), f.idade,
      f.sexo === 'feminino' ? 'Feminino' : f.sexo === 'masculino' ? 'Masculino' : '', f.camisa, f.whats_campista,
      f.alergias, f.saude, f.responsavel_nome, f.responsavel_cpf, f.responsavel_whats, f.parentesco,
      f.emergencia_nome, f.emergencia_whats, f.irmao, f.valor, f.pagamento ? ROTULO_FORMA_DA_FICHA[f.pagamento] : '',
      f.imagem, f.termo, f.versao_termo, f.origem,
      s.recebido / 100, s.aConferir / 100, s.falta == null ? 'a confirmar' : s.falta / 100, ROTULO_STATUS[s.status],
      f.cancelada_em ? dataHoraBr(f.cancelada_em) : '', f.motivo,
    ]);
  });
  return '﻿' + [linhaCsv(cab), ...linhas].join('\r\n') + '\r\n';
}

export function csvPagamentos(pagamentos: readonly PagamentoBanco[]): string {
  const cab = ['Data', 'Campista', 'Referente', 'Forma', 'Valor', 'Quem pagou', 'Código', 'Conferido', 'Origem', 'Observação', 'Registrado por', 'Pedido na Stone'];
  const linhas = pagamentos.map(p => linhaCsv([
    dataBr(p.pago_em), p.campista, ROTULO_REFERENTE[p.referente], ROTULO_FORMA[p.forma], p.valor, p.quem_pagou,
    p.codigo, p.conferido, ROTULO_ORIGEM[p.origem], p.observacao, p.registrado_por, p.stone_pedido,
  ]));
  return '﻿' + [linhaCsv(cab), ...linhas].join('\r\n') + '\r\n';
}

/* ------------------------------------------------- a ficha que veio no zap ---
   O texto que a própria ficha manda quando o banco não grava
   (`mensagemDaFicha`, lib/followcamp-ficha.ts), colado do WhatsApp. Lê pelo
   rótulo de cada linha, e não pela posição: o WhatsApp põe "[04/10 14:32]
   Fulano:" na frente da primeira, e quem cola às vezes corta o começo. */
export type FichaLida = {
  campista: string; nascimento: string | null; idade: number | null; sexo: 'feminino' | 'masculino' | null;
  camisa: string | null; whats_campista: string | null; alergias: string | null; saude: string | null;
  responsavel_nome: string | null; responsavel_cpf: string | null; responsavel_whats: string | null; parentesco: string | null;
  emergencia_nome: string | null; emergencia_whats: string | null; irmao: string | null;
  valor: number | null; pagamento: FormaDaFicha | null; imagem: boolean | null; termo: string | null;
};

export function lerFichaDoWhatsApp(texto: string): { ok: true; ficha: FichaLida } | { ok: false; erro: string } {
  const linhas = String(texto || '').split(/\r?\n/).map(l => l.replace(/^\s*\[[^\]]*\]\s*[^:]{1,40}:\s*(?=Ficha)/, '').trim());
  const valorDe = (rot: string) => {
    const l = linhas.find(x => x.toLowerCase().startsWith(rot.toLowerCase() + ':'));
    return l ? l.slice(rot.length + 1).trim() : null;
  };
  const campista = limpaNome(valorDe('Campista') || '');
  if (campista.length < 3) return { ok: false, erro: 'Não achei a linha "Campista:" no texto colado.' };

  let nascimento: string | null = null, idade: number | null = null;
  const nasc = valorDe('Nascimento');
  const mN = nasc && /(\d{2})\/(\d{2})\/(\d{4})(?:\s*\((\d{1,2}) anos)?/.exec(nasc);
  if (mN) { nascimento = `${mN[3]}-${mN[2]}-${mN[1]}`; idade = mN[4] ? Number(mN[4]) : null; }

  let sexo: FichaLida['sexo'] = null, camisa: string | null = null;
  const sx = valorDe('Sexo');
  if (sx) {
    sexo = /^feminino/i.test(sx) ? 'feminino' : /^masculino/i.test(sx) ? 'masculino' : null;
    const c = /Camisa:\s*([A-Z]{1,3})\b/i.exec(sx);
    camisa = c ? c[1].toUpperCase() : null;
  }
  const semNada = (v: string | null, nada: RegExp) => (v && !nada.test(v) ? v.slice(0, 500) : null);
  const tel = (v: string | null) => {
    const d = soDigitos(v || '').replace(/^55(?=\d{11}$)/, '');
    return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : null;
  };

  let responsavel_nome: string | null = null, parentesco: string | null = null, responsavel_cpf: string | null = null, responsavel_whats: string | null = null;
  const resp = valorDe('Responsável');
  if (resp) {
    const partes = resp.split('·').map(x => x.trim());
    const mR = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(partes[0] || '');
    responsavel_nome = limpaNome(mR ? mR[1] : partes[0] || '') || null;
    parentesco = mR ? mR[2].slice(0, 40) : null;
    const cpf = partes.find(x => /^CPF/i.test(x));
    const dc = soDigitos(cpf || '');
    responsavel_cpf = dc.length === 11 ? `${dc.slice(0, 3)}.${dc.slice(3, 6)}.${dc.slice(6, 9)}-${dc.slice(9)}` : null;
    responsavel_whats = tel(partes[partes.length - 1] || null);
  }
  let emergencia_nome: string | null = null, emergencia_whats: string | null = null;
  const em = valorDe('Contato de emergência');
  if (em) {
    const partes = em.split('·').map(x => x.trim());
    emergencia_nome = limpaNome(partes[0] || '') || null;
    emergencia_whats = tel(partes[1] || null);
  }

  let valor: number | null = null, pagamento: FormaDaFicha | null = null;
  const lv = linhas.find(x => /^(Inscrição|Inscrição com desconto de irmãos):/i.test(x)) || '';
  const mv = /R\$\s*([\d.]+,\d{2})/.exec(lv);
  if (mv) valor = Number(mv[1].replace(/\./g, '').replace(',', '.'));
  const mp = /Pagamento:\s*(.+)$/i.exec(lv);
  if (mp) {
    const t = mp[1].toLowerCase();
    pagamento = t.startsWith('pix') ? 'pix' : t.startsWith('cart') ? 'cartao' : t.startsWith('dinheiro') ? 'dinheiro' : t.startsWith('carn') ? 'carne' : null;
  }
  const img = valorDe('Uso de imagem');
  const termo = linhas.find(x => /^(Termo de autorização|Declaração):/i.test(x)) || null;

  return {
    ok: true,
    ficha: {
      campista, nascimento, idade, sexo, camisa,
      whats_campista: tel(valorDe('WhatsApp do campista')),
      alergias: semNada(valorDe('Alergia ou restrição'), /^nenhuma$/i),
      saude: semNada(valorDe('Saúde ou remédio'), /^nada a informar$/i),
      responsavel_nome, responsavel_cpf, responsavel_whats, parentesco,
      emergencia_nome, emergencia_whats,
      irmao: limpaNome(valorDe('Irmão inscrito') || '') || null,
      valor, pagamento,
      imagem: img == null ? null : /^autorizado/i.test(img),
      termo: termo ? `${termo} (ficha do site, lançada pelo WhatsApp)` : null,
    },
  };
}

/** O nome do arquivo da exportação: "follow-camp-fichas-2026-10-04.csv". */
export function nomeDoArquivo(qual: 'fichas' | 'pagamentos', agora = new Date()): string {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
  return `follow-camp-${qual}-${d}.csv`;
}
