/* =============================================================================
   A PLANILHA DE PAGAMENTOS DO FOLLOW CAMP · 29/10/2026

   O botão "Exportar pagamentos" do painel. Era um CSV cru; o Arthur pediu
   "mais profissional, colorida e organizada". Agora é um .xlsx com três abas:

     Resumo        os números do painel, no mesmo vocabulário (Recebido = só o
                   conferido), por forma de pagamento, e o que pede atenção.
     Pagamentos    um por linha, em ordem de data, situação colorida, filtro
                   no cabeçalho e os totais embaixo.
     Por campista  quanto cada um deve, pagou, tem a conferir e falta, a
                   próxima parcela do carnê e com quem falar.

   As contas são as do painel (lib/followcamp-painel.ts, com teste); aqui é só
   a forma. As cores são as de ESTADO do sistema (app/globals.css): verde ok,
   âmbar atenção, vermelho atraso, azul esperando conferência, cinza neutro; o
   preto é o #252525 da marca. Nada de CPF, saúde ou alergia nesta planilha:
   isso é do "Exportar fichas".
   ============================================================================= */
import { planilha, ref, serialDe, type Aba, type Celula, type Estilo } from './xlsx';
import {
  resumoDe, situacaoDe, ordenarSituacoes, FORMAS, ROTULO_FORMA, ROTULO_FORMA_DA_FICHA, ROTULO_REFERENTE, ROTULO_STATUS,
  type FichaBanco, type PagamentoBanco, type Situacao, type Status,
} from './followcamp-painel';
import { contatoDe } from './followcamp-cobranca';
import { codigoLegivel } from './followcamp';

const PRETO = '252525';
const MUDO = '6B6B6B';
const FIO = 'E2E2E2';
const FAIXA = 'F7F7F8';
const BRANCO = 'FFFFFF';
type Tom = 'ok' | 'warn' | 'bad' | 'info' | 'neutro';
const TOM: Record<Tom, { cor: string; fundo: string }> = {
  ok: { cor: '0A6B3F', fundo: 'DCEFE4' },
  warn: { cor: '7A5005', fundo: 'FCEBCB' },
  bad: { cor: 'A82E24', fundo: 'F8DEDB' },
  info: { cor: '1B53AD', fundo: 'DFE8F7' },
  neutro: { cor: '4A4A4A', fundo: 'EDEDED' },
};
const MOEDA = '"R$ "#,##0.00';
const DATA = 'dd/mm/yyyy';
const INTEIRO = '0';

const TITULO: Estilo = { negrito: true, tamanho: 18, cor: PRETO };
const SUBTITULO: Estilo = { tamanho: 10, cor: MUDO };
const NOTA: Estilo = { italico: true, tamanho: 9, cor: MUDO, quebrar: true, vertical: 'topo' };
const SECAO: Estilo = { negrito: true, tamanho: 11, cor: PRETO, bordaBaixo: PRETO };
const CAB: Estilo = { negrito: true, cor: BRANCO, fundo: PRETO };

const reaisDe = (centavos: number) => Math.round(centavos) / 100;
const letra = (i: number) => ref(i, 0).replace(/\d+$/, '');
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const porcento = (x: number) => `${(Math.round(x * 1000) / 10).toLocaleString('pt-BR')}%`;

/** As partes da data e hora em Brasília. */
function emBrasilia(d: Date) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const v = (t: string) => Number(p.find(x => x.type === t)?.value ?? 0);
  return { ano: v('year'), mes: v('month'), dia: v('day'), hora: v('hour'), minuto: v('minute') };
}
const dois = (n: number) => String(n).padStart(2, '0');

/** 'AAAA-MM-DD' (ou um instante com fuso) → o número de data do Excel, no dia de Brasília. */
export function dataDoExcel(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  if (s.length === 10) return serialDe(+m[1], +m[2], +m[3]);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return serialDe(+m[1], +m[2], +m[3]);
  const b = emBrasilia(d);
  return serialDe(b.ano, b.mes, b.dia);
}

/** Linha da tabela: faixa alternada e fio embaixo. */
/* o recuo só aparece com o lado dito: no alinhamento "geral" o Excel o ignora */
const linhaDe = (i: number, e: Estilo = {}): Estilo => ({ bordaBaixo: FIO, recuo: 1, alinhar: 'esquerda', ...(i % 2 ? { fundo: FAIXA } : {}), ...e });
const comTom = (base: Estilo, t: Tom): Estilo => ({ ...base, negrito: true, cor: TOM[t].cor, fundo: TOM[t].fundo, alinhar: 'centro' });

/** Altura da linha para um texto que quebra numa coluna de `largura` caracteres. */
function alturaPara(texto: string, largura: number, minimo = 20): number {
  const porLinha = Math.max(10, Math.floor(largura * 1.15));
  const linhas = texto.split('\n').reduce((s, l) => s + Math.max(1, Math.ceil(l.length / porLinha)), 0);
  return Math.max(minimo, linhas * 12.5 + 7);
}

const tomDoStatus = (x: Situacao): Tom =>
  x.atrasado ? 'bad' : ({ quitado: 'ok', parcial: 'warn', a_conferir: 'info', pendente: 'neutro', cancelada: 'neutro' } as Record<Status, Tom>)[x.status];
const rotuloDoStatus = (x: Situacao) => (x.atrasado ? 'Parcela vencida' : ROTULO_STATUS[x.status]);
const ORIGEM: Record<PagamentoBanco['origem'], string> = { site: 'Avisou pelo site', manual: 'Lançado no painel', stone: 'API da Stone' };

/* =================================================================== Resumo */
function abaResumo(fichas: readonly FichaBanco[], pagamentos: readonly PagamentoBanco[], agora: Date, geradoEm: string): Aba {
  const r = resumoDe(fichas, pagamentos);
  const sits = ordenarSituacoes(fichas.filter(f => !f.cancelada_em).map(f => situacaoDe(f, pagamentos, agora)));
  const L = [2, 38, 18, 58];
  const linhas: Celula[][] = [];
  const alturas: Record<number, number> = {};
  const mesclas: string[] = [];
  const add = (l: Celula[], alt?: number) => { if (alt) alturas[linhas.length] = alt; linhas.push(l); return linhas.length - 1; };
  const largo = (i: number) => mesclas.push(`B${i + 1}:D${i + 1}`);

  largo(add([null, { v: 'Follow Camp 2027 · Pagamentos', e: TITULO }], 32));
  largo(add([null, { v: `Gerado em ${geradoEm} (horário de Brasília), a partir do painel do GUIA Servir.`, e: SUBTITULO }], 18));
  const aviso = 'Recebido conta só o pagamento conferido no extrato da Stone. O que a pessoa avisou pelo site e ainda não foi achado fica em "A conferir" e não entra no recebido.';
  largo(add([null, { v: aviso, e: NOTA }], alturaPara(aviso, 110, 26)));

  const secao = (t: string) => { add([], 10); add([null, { v: t, e: SECAO }, { e: SECAO }, { e: SECAO }], 24); };
  const item = (rot: string, valor: Celula, nota = '', tom?: Tom, formato = MOEDA) => {
    const base: Estilo = { bordaBaixo: FIO };
    const ev: Estilo = { ...base, negrito: true, formato, alinhar: 'direita', ...(tom ? { cor: TOM[tom].cor, fundo: TOM[tom].fundo } : {}) };
    const cel = valor !== null && typeof valor === 'object' ? { ...valor, e: ev } : { v: valor as number, e: ev };
    add([null, { v: rot, e: { ...base, recuo: 1, alinhar: 'esquerda' } }, cel, { v: nota, e: { ...base, cor: MUDO, recuo: 1, alinhar: 'esquerda', quebrar: true } }],
      nota ? alturaPara(nota, L[3], 20) : 20);
  };

  secao('Visão geral');
  item('Inscritos', r.inscritos, r.desistencias ? `${plural(r.desistencias, 'desistência fica', 'desistências ficam')} fora da conta` : '', undefined, INTEIRO);
  item('Total das inscrições', reaisDe(r.devido), 'a soma do valor de cada ficha, já com o desconto de irmãos');
  const pagoDasAtivas = r.devido - r.falta;
  const deDesistencia = pagamentos.filter(p => p.conferido && p.ficha_id && fichas.some(f => f.id === p.ficha_id && f.cancelada_em))
    .reduce((s, p) => s + Math.round(Number(p.valor) * 100), 0);
  const notaRecebido = [
    ...(r.devido ? [`${porcento(pagoDasAtivas / r.devido)} das inscrições ativas`] : []),
    ...(deDesistencia ? [`inclui ${reaisFmt(deDesistencia)} de desistência`] : []),
    ...(r.semFichaValor ? [`inclui ${reaisFmt(r.semFichaValor)} sem ficha ligada`] : []),
  ].join(' · ');
  item('Recebido (conferido)', reaisDe(r.recebido), notaRecebido, 'ok');
  item('A conferir', reaisDe(r.aConferir), r.aConferirQtd ? `${plural(r.aConferirQtd, 'aviso esperando', 'avisos esperando')} conferência na Stone` : 'nada esperando conferência', 'info');
  item('Falta receber', reaisDe(r.falta), '', 'warn');

  secao('Situação dos inscritos');
  const conta = (f: (x: Situacao) => boolean) => sits.filter(f).length;
  item('Pago', r.quitados, '', 'ok', INTEIRO);
  item('Pagou parte', conta(x => x.status === 'parcial' && !x.atrasado), '', 'warn', INTEIRO);
  item('A conferir', conta(x => x.status === 'a_conferir' && !x.atrasado), '', 'info', INTEIRO);
  item('Não pagou', conta(x => x.status === 'pendente' && !x.atrasado), '', 'neutro', INTEIRO);
  item('Parcela vencida', conta(x => x.atrasado), '', 'bad', INTEIRO);

  secao('Recebido por forma de pagamento');
  const formas = FORMAS.filter(f => r.recebidoPorForma[f] > 0 || f === 'pix_direto' || f === 'link_stone' || f === 'dinheiro');
  const primeira = linhas.length;
  for (const f of formas) item(ROTULO_FORMA[f], reaisDe(r.recebidoPorForma[f]), f === 'link_stone' ? 'cartão, Pix ou boleto pela página da Stone' : '');
  const ultima = linhas.length - 1;
  add([null, { v: 'Total', e: { negrito: true, recuo: 1, alinhar: 'esquerda', bordaCima: PRETO, bordaCimaGrossa: true } },
    { v: reaisDe(r.recebido), f: `SUM(C${primeira + 1}:C${ultima + 1})`, e: { negrito: true, formato: MOEDA, alinhar: 'direita', bordaCima: PRETO, bordaCimaGrossa: true } },
    { e: { bordaCima: PRETO, bordaCimaGrossa: true } }], 22);

  secao('Precisa de atenção');
  const nomes = (xs: Situacao[]) => xs.map(x => x.ficha.campista).join(', ');
  const vencidas = sits.filter(x => x.atrasado);
  const semPlano = sits.filter(x => x.conta.carne && !x.conta.plano && x.status !== 'quitado');
  const avisos = pagamentos.filter(p => !p.conferido);
  const nada = sits.filter(x => x.status === 'pendente' && !x.atrasado);
  item('Parcela vencida', vencidas.length, nomes(vencidas), vencidas.length ? 'bad' : 'ok', INTEIRO);
  item('Carnê sem plano escolhido', semPlano.length, semPlano.length ? `${nomes(semPlano)}. Sem plano, o sistema não sabe quanto cada um deve em cada vencimento.` : '', semPlano.length ? 'warn' : 'ok', INTEIRO);
  item('Avisos a conferir', avisos.length, [...new Set(avisos.map(p => p.campista))].join(', '), avisos.length ? 'info' : 'ok', INTEIRO);
  item('Não pagaram nada', nada.length, nomes(nada), nada.length ? 'neutro' : 'ok', INTEIRO);

  add([], 14);
  const legenda = 'Cores: verde, pago ou conferido · âmbar, pagou parte ou falta escolher · azul, esperando conferência · vermelho, parcela vencida · cinza, não pagou.';
  largo(add([null, { v: legenda, e: NOTA }], alturaPara(legenda, 110, 20)));

  return { nome: 'Resumo', larguras: L, linhas, alturas, mesclas, semGrade: true, corDaAba: PRETO, rodape: 'Follow Camp 2027 · Pagamentos' };
}

/* =============================================================== Pagamentos */
function abaPagamentos(pagamentos: readonly PagamentoBanco[], geradoEm: string): Aba {
  const ps = [...pagamentos].sort((a, b) => a.pago_em.localeCompare(b.pago_em) || a.criado_em.localeCompare(b.criado_em));
  const tem = (f: (p: PagamentoBanco) => unknown) => ps.some(p => !!f(p));
  type Col = { t: string; w: number; a?: Estilo['alinhar']; v: (p: PagamentoBanco, e: Estilo) => Celula };
  const cols: Col[] = [
    { t: 'Data', w: 12, a: 'centro', v: (p, e) => ({ v: dataDoExcel(p.pago_em), e: { ...e, formato: DATA } }) },
    { t: 'Campista', w: 32, v: (p, e) => ({ v: p.campista, e: { ...e, negrito: true } }) },
    { t: 'Referente', w: 18, v: (p, e) => ({ v: ROTULO_REFERENTE[p.referente], e }) },
    { t: 'Forma', w: 17, v: (p, e) => ({ v: ROTULO_FORMA[p.forma], e }) },
    { t: 'Valor', w: 15, a: 'direita', v: (p, e) => ({ v: reaisDe(Math.round(Number(p.valor) * 100)), e: { ...e, formato: MOEDA, negrito: true } }) },
    ...(tem(p => p.quem_pagou) ? [{ t: 'Quem pagou', w: 28, v: (p: PagamentoBanco, e: Estilo) => ({ v: p.quem_pagou || '', e }) }] : []),
    { t: 'Situação', w: 14, a: 'centro', v: (p, e) => ({ v: p.conferido ? 'Conferido' : 'A conferir', e: comTom(e, p.conferido ? 'ok' : 'info') }) },
    { t: 'Origem', w: 19, v: (p, e) => ({ v: ORIGEM[p.origem], e: { ...e, cor: MUDO } }) },
    { t: 'Código', w: 17, a: 'centro', v: (p, e) => ({ v: p.codigo ? codigoLegivel(p.codigo) : '', e: { ...e, cor: MUDO } }) },
    ...(tem(p => (p.comprovantes ?? 0) > 0) ? [{ t: 'Comprovante', w: 14, a: 'centro' as const, v: (p: PagamentoBanco, e: Estilo) => ({ v: (p.comprovantes ?? 0) > 0 ? 'Sim' : '', e }) }] : []),
    ...(tem(p => p.observacao) ? [{ t: 'Observação', w: 36, v: (p: PagamentoBanco, e: Estilo) => ({ v: p.observacao || '', e: { ...e, quebrar: true } }) }] : []),
    ...(tem(p => p.registrado_por) ? [{ t: 'Registrado por', w: 20, v: (p: PagamentoBanco, e: Estilo) => ({ v: p.registrado_por || '', e: { ...e, cor: MUDO } }) }] : []),
    ...(tem(p => p.stone_pedido) ? [{ t: 'Pedido na Stone', w: 24, v: (p: PagamentoBanco, e: Estilo) => ({ v: p.stone_pedido || '', e: { ...e, cor: MUDO } }) }] : []),
  ];
  const iValor = cols.findIndex(c => c.t === 'Valor');
  const iSituacao = cols.findIndex(c => c.t === 'Situação');
  const n = cols.length;
  const fim = ref(n - 1, 0).replace(/\d+$/, '');
  const conferido = ps.filter(p => p.conferido).reduce((s, p) => s + Math.round(Number(p.valor) * 100), 0);
  const aConferir = ps.filter(p => !p.conferido).reduce((s, p) => s + Math.round(Number(p.valor) * 100), 0);

  const linhas: Celula[][] = [
    [{ v: 'Pagamentos', e: TITULO }],
    [{ v: `${plural(ps.length, 'pagamento', 'pagamentos')} · ${reaisFmt(conferido)} conferido · ${reaisFmt(aConferir)} a conferir · gerado em ${geradoEm}`, e: SUBTITULO }],
    [],
    cols.map(c => ({ v: c.t, e: { ...CAB, alinhar: c.a ?? 'esquerda', recuo: 1 } })),
  ];
  const alturas: Record<number, number> = { 0: 32, 1: 18, 2: 8, 3: 24 };
  const mesclas = [`A1:${fim}1`, `A2:${fim}2`];
  if (!ps.length) {
    linhas.push([{ v: 'Nenhum pagamento registrado ainda.', e: { italico: true, cor: MUDO } }]);
    mesclas.push(`A5:${fim}5`);
    alturas[4] = 24;
    return { nome: 'Pagamentos', larguras: cols.map(c => c.w), linhas, alturas, mesclas, semGrade: true, corDaAba: TOM.ok.cor, paisagem: true, rodape: 'Follow Camp 2027 · Pagamentos' };
  }
  ps.forEach((p, i) => {
    alturas[linhas.length] = p.observacao ? alturaPara(p.observacao, 36, 20) : 20;
    linhas.push(cols.map(c => c.v(p, linhaDe(i, c.a ? { alinhar: c.a } : {}))));
  });
  const a = 5, b = 4 + ps.length;
  const V = letra(iValor), S = letra(iSituacao);
  const rotulo = (t: string, tom?: Tom, forte = false): Celula => ({ v: t, e: { negrito: true, alinhar: 'direita', ...(tom ? { cor: TOM[tom].cor } : {}), ...(forte ? { bordaCima: PRETO, bordaCimaGrossa: true } : {}) } });
  const total = (v: number, f: string, tom?: Tom, forte = false): Celula => ({ v: reaisDe(v), f, e: { negrito: true, formato: MOEDA, alinhar: 'direita', ...(tom ? { cor: TOM[tom].cor } : {}), ...(forte ? { bordaCima: PRETO, bordaCimaGrossa: true } : {}) } });
  const vazio = (forte: boolean): Celula => (forte ? { e: { bordaCima: PRETO, bordaCimaGrossa: true } } : null);
  linhas.push([]);
  alturas[linhas.length - 1] = 8;
  const totais: [string, number, string, Tom | undefined, boolean][] = [
    ['Conferido', conferido, `SUMIFS(${V}${a}:${V}${b},${S}${a}:${S}${b},"Conferido")`, 'ok', false],
    ['A conferir', aConferir, `SUMIFS(${V}${a}:${V}${b},${S}${a}:${S}${b},"A conferir")`, 'info', false],
    ['Total', conferido + aConferir, `SUM(${V}${a}:${V}${b})`, undefined, true],
  ];
  for (const [t, v, f, tom, forte] of totais) {
    alturas[linhas.length] = 20;
    linhas.push(cols.map((_, i) => (i === iValor - 1 ? rotulo(t, tom, forte) : i === iValor ? total(v, f, tom, forte) : vazio(forte))));
  }
  return {
    nome: 'Pagamentos', larguras: cols.map(c => c.w), linhas, alturas, mesclas, semGrade: true, corDaAba: TOM.ok.cor, paisagem: true,
    congelar: { linhas: 4 }, filtro: `A4:${fim}${b}`, repetirNaImpressao: [4, 4], rodape: 'Follow Camp 2027 · Pagamentos',
  };
}

function reaisFmt(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ');
}

/* ============================================================= Por campista */
function abaPorCampista(fichas: readonly FichaBanco[], pagamentos: readonly PagamentoBanco[], agora: Date, geradoEm: string): Aba {
  const ativas = ordenarSituacoes(fichas.filter(f => !f.cancelada_em).map(f => situacaoDe(f, pagamentos, agora)));
  /* desistência só entra se tiver dinheiro no meio (devolução é conversa) */
  const canceladas = fichas.filter(f => f.cancelada_em).map(f => situacaoDe(f, pagamentos, agora)).filter(x => x.pagamentos.length > 0);
  const sits = [...ativas, ...canceladas];
  const fora = fichas.filter(f => f.cancelada_em).length - canceladas.length;
  type Col = { t: string; w: number; a?: Estilo['alinhar']; v: (x: Situacao, base: Estilo) => Celula };
  const money = (c: number | null, base: Estilo, extra: Estilo = {}): Celula =>
    c == null ? { v: 'a confirmar', e: { ...base, cor: MUDO, alinhar: 'direita' } } : { v: reaisDe(c), e: { ...base, formato: MOEDA, alinhar: 'direita', ...extra } };
  const cols: Col[] = [
    { t: 'Campista', w: 32, v: (x, e) => ({ v: x.ficha.campista, e: { ...e, negrito: true } }) },
    { t: 'Idade', w: 7, a: 'centro', v: (x, e) => ({ v: x.ficha.idade ?? null, e: { ...e, formato: INTEIRO, alinhar: 'centro' } }) },
    { t: 'Na ficha', w: 14, v: (x, e) => ({ v: x.ficha.pagamento ? ROTULO_FORMA_DA_FICHA[x.ficha.pagamento] : '', e }) },
    { t: 'Plano', w: 17, v: (x, e) => {
      const t = x.conta.carne ? (x.conta.plano ? `Carnê ${x.conta.plano.length}x` : 'Carnê sem plano') : 'À vista';
      return { v: t, e: !x.conta.plano && x.conta.carne && x.status !== 'quitado' && x.status !== 'cancelada' ? { ...e, cor: TOM.warn.cor, negrito: true } : e };
    } },
    { t: 'Total', w: 13, a: 'direita', v: (x, e) => money(x.devido, e) },
    { t: 'Recebido', w: 13, a: 'direita', v: (x, e) => money(x.recebido, e, x.recebido ? { cor: TOM.ok.cor, negrito: true } : {}) },
    { t: 'A conferir', w: 13, a: 'direita', v: (x, e) => money(x.aConferir, e, x.aConferir ? { cor: TOM.info.cor, negrito: true } : {}) },
    { t: 'Falta', w: 13, a: 'direita', v: (x, e) => (x.status === 'cancelada' ? { e } : money(x.falta, e, { negrito: true })) },
    { t: 'Situação', w: 16, a: 'centro', v: (x, e) => ({ v: rotuloDoStatus(x), e: comTom(e, tomDoStatus(x)) }) },
    { t: 'Próxima parcela', w: 17, a: 'direita', v: (x, e) => {
      const p = x.status === 'quitado' || x.status === 'cancelada' ? null : x.conta.situacao?.proxima ?? null;
      return p ? { v: reaisDe(p.falta), e: { ...e, formato: MOEDA, alinhar: 'direita' } } : { e };
    } },
    { t: 'Vence em', w: 12, a: 'centro', v: (x, e) => {
      const p = x.status === 'quitado' || x.status === 'cancelada' ? null : x.conta.situacao?.proxima ?? null;
      if (!p) return { e };
      const vencida = p.estado === 'vencida';
      return { v: dataDoExcel(p.vencimento), e: { ...e, formato: DATA, alinhar: 'centro', ...(vencida ? { cor: TOM.bad.cor, negrito: true } : {}) } };
    } },
    { t: 'Contato', w: 30, v: (x, e) => {
      const c = contatoDe(x.ficha);
      const quem = c?.quem === 'responsavel' ? `${c.nome}${x.ficha.parentesco ? ` (${x.ficha.parentesco.toLocaleLowerCase('pt-BR')})` : ' (responsável)'}`
        : c?.quem === 'emergencia' ? `${c.nome} (emergência)` : c ? 'Próprio campista' : '';
      return { v: quem, e: c?.quem === 'campista' ? { ...e, cor: MUDO } : e };
    } },
    { t: 'WhatsApp', w: 17, v: (x, e) => ({ v: contatoDe(x.ficha)?.whats ?? '', e }) },
  ];
  const n = cols.length;
  const fim = ref(n - 1, 0).replace(/\d+$/, '');
  const sub = [
    plural(ativas.length, 'inscrito ativo', 'inscritos ativos'),
    'quem precisa de atenção vem primeiro',
    ...(canceladas.length ? [`${plural(canceladas.length, 'desistência com pagamento no fim', 'desistências com pagamento no fim')}`] : []),
    ...(fora ? [`${plural(fora, 'desistência sem pagamento fora da lista', 'desistências sem pagamento fora da lista')}`] : []),
  ].join(' · ');
  const linhas: Celula[][] = [
    [{ v: 'Por campista', e: TITULO }],
    [{ v: `${sub} · gerado em ${geradoEm}`, e: SUBTITULO }],
    [],
    cols.map(c => ({ v: c.t, e: { ...CAB, alinhar: c.a ?? 'esquerda', recuo: 1 } })),
  ];
  const alturas: Record<number, number> = { 0: 32, 1: 18, 2: 8, 3: 24 };
  const mesclas = [`A1:${fim}1`, `A2:${fim}2`];
  sits.forEach((x, i) => {
    const base = linhaDe(i, x.status === 'cancelada' ? { cor: MUDO, italico: true } : {});
    alturas[linhas.length] = 20;
    linhas.push(cols.map(c => c.v(x, base)));
  });
  if (!sits.length) {
    linhas.push([{ v: 'Nenhuma inscrição ainda.', e: { italico: true, cor: MUDO } }]);
    mesclas.push(`A5:${fim}5`);
    return { nome: 'Por campista', larguras: cols.map(c => c.w), linhas, alturas, mesclas, semGrade: true, corDaAba: TOM.info.cor, paisagem: true, rodape: 'Follow Camp 2027 · Pagamentos' };
  }
  /* o total só das ATIVAS (a linha da desistência é informação, não conta) */
  const a = 5, b = 4 + ativas.length;
  const forte: Estilo = { negrito: true, bordaCima: PRETO, bordaCimaGrossa: true };
  const soma = (k: 'devido' | 'recebido' | 'aConferir' | 'falta', col: string): Celula =>
    ({ v: reaisDe(ativas.reduce((s, x) => s + (x[k] ?? 0), 0)), f: `SUM(${col}${a}:${col}${b})`, e: { ...forte, formato: MOEDA, alinhar: 'direita' } });
  linhas.push([]);
  alturas[linhas.length - 1] = 8;
  alturas[linhas.length] = 22;
  linhas.push([
    { v: 'Total dos inscritos ativos', e: forte }, { e: forte }, { e: forte }, { e: forte },
    soma('devido', 'E'), soma('recebido', 'F'), soma('aConferir', 'G'), soma('falta', 'H'),
    ...Array.from({ length: n - 8 }, () => ({ e: forte })),
  ]);
  return {
    nome: 'Por campista', larguras: cols.map(c => c.w), linhas, alturas, mesclas, semGrade: true, corDaAba: TOM.info.cor, paisagem: true,
    congelar: { linhas: 4, colunas: 1 }, filtro: `A4:${fim}${4 + sits.length}`, repetirNaImpressao: [4, 4], rodape: 'Follow Camp 2027 · Pagamentos',
  };
}

/* ================================================================== a pasta */
export function planilhaDePagamentos(fichas: readonly FichaBanco[], pagamentos: readonly PagamentoBanco[], agora = new Date()): Uint8Array {
  const b = emBrasilia(agora);
  const geradoEm = `${dois(b.dia)}/${dois(b.mes)}/${b.ano} às ${dois(b.hora)}:${dois(b.minuto)}`;
  return planilha([
    abaResumo(fichas, pagamentos, agora, geradoEm),
    abaPagamentos(pagamentos, geradoEm),
    abaPorCampista(fichas, pagamentos, agora, geradoEm),
  ], { titulo: 'Follow Camp 2027 · Pagamentos', autor: 'GUIA Servir', quando: agora });
}
