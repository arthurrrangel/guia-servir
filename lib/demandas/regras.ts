/* AS REGRAS, EM UM LUGAR SÓ.

   Nada aqui toca rede. É tudo função pura, e é por isso que dá para testar
   sem banco e sem navegador (`npm test`).

   A parte mais importante deste arquivo é `acoesDe`: ela decide quais botões
   a tela mostra, e tem que ser o ESPELHO EXATO das checagens de `dem_mover`
   no banco. Botão que o servidor recusa é pior que botão que não existe — a
   pessoa toca, toma um "sem permissão" e conclui que o sistema está quebrado.
   Se você mexer numa das duas pontas, mexa na outra e rode os testes: eles
   conferem a matriz inteira de papel × setor × status. */

import type {
  Aprovacao, Categoria, Prioridade, Resumo, Status, Trava,
} from './tipos';
/* o chão de transporte é o mesmo dos dois sistemas: mesmo Postgres, mesmo
   PostgREST, mesma rede. Ver a nota em `recadoDoErro`. `lib/erros.ts` é puro
   e não importa nada de escalas, então isto não acopla um sistema ao outro. */
import { humano } from '../erros';

/* ---------------------------------------------------------------- palavras */

export const STATUS: { v: Status; rot: string; tom: 'neutro' | 'ok' | 'warn' | 'bad' }[] = [
  { v: 'aberta',    rot: 'Aberta',      tom: 'neutro' },
  { v: 'execucao',  rot: 'Em execução', tom: 'ok' },
  { v: 'travada',   rot: 'Travada',     tom: 'warn' },
  { v: 'concluida', rot: 'Concluída',   tom: 'ok' },
  { v: 'cancelada', rot: 'Cancelada',   tom: 'bad' },
];

export const TRAVAS: { v: Trava; rot: string; curto: string }[] = [
  { v: 'informacao', rot: 'Esperando informação de quem pediu', curto: 'falta informação' },
  { v: 'aprovacao',  rot: 'Esperando aprovação',                curto: 'falta aprovação' },
  { v: 'terceiros',  rot: 'Esperando alguém de fora',           curto: 'esperando terceiros' },
];

export const PRIORIDADES: { v: Prioridade; rot: string; explica: string }[] = [
  { v: 'baixa',   rot: 'Baixa',   explica: 'Importante, mas não muda nada esta semana.' },
  { v: 'normal',  rot: 'Normal',  explica: 'Entra no fluxo regular do setor.' },
  { v: 'alta',    rot: 'Alta',    explica: 'Afeta uma atividade próxima, um evento ou uma equipe.' },
  { v: 'urgente', rot: 'Urgente', explica: 'Afeta um culto, um evento ou a operação. Precisa dizer qual.' },
];

export const rotStatus = (s: Status) => STATUS.find(x => x.v === s)?.rot ?? s;
export const tomStatus = (s: Status) => STATUS.find(x => x.v === s)?.tom ?? 'neutro';
export const rotTrava = (t: Trava | null) => (t ? TRAVAS.find(x => x.v === t)?.rot ?? t : '');
export const rotPrioridade = (p: Prioridade) => PRIORIDADES.find(x => x.v === p)?.rot ?? p;

/** O tom da pílula. `undefined` é o neutro: pílula sem cor, que é o padrão.
    Existe porque cor aqui significa estado, e "aberta" não é um estado que
    mereça cor — se tudo tem cor, cor para de significar. */
export const tomPill = (s: Status): 'ok' | 'warn' | 'bad' | undefined => {
  const t = tomStatus(s);
  return t === 'neutro' ? undefined : t;
};

/** A prioridade só ganha cor quando pede pressa. Baixa e normal ficam mudas. */
export const tomPrioridade = (p: Prioridade): 'warn' | 'bad' | undefined =>
  p === 'urgente' ? 'bad' : p === 'alta' ? 'warn' : undefined;

/* ------------------------------------------------- os 11 status do documento

   O PDF lista onze. Cinco mudam o que acontece em seguida; os outros seis são
   momentos ou motivos, e viram campo em vez de estado. Nenhum se perde: esta
   tabela é o de-para, e é ela que os indicadores usam para responder
   "quantas reabertas", "quantas esperando aprovação".

   Foi escrita aqui, e não num documento à parte, porque documento à parte
   ninguém abre quando muda o código.                                         */

export type EstadoDoPDF =
  | 'Rascunho' | 'Aberta' | 'Em triagem' | 'Aguardando aprovação' | 'Aprovada'
  | 'Em execução' | 'Aguardando informações' | 'Aguardando terceiros'
  | 'Concluída' | 'Cancelada' | 'Reaberta';

export function comoOPdfChama(d: {
  status: Status; travada_por?: Trava | null; aprovacao?: Aprovacao;
  responsavel?: string | null; reaberturas?: number;
}): EstadoDoPDF {
  if (d.status === 'cancelada') return 'Cancelada';
  if (d.status === 'concluida') return 'Concluída';
  if (d.status === 'travada') {
    if (d.travada_por === 'aprovacao') return 'Aguardando aprovação';
    if (d.travada_por === 'terceiros') return 'Aguardando terceiros';
    return 'Aguardando informações';
  }
  if (d.status === 'execucao') return (d.reaberturas ?? 0) > 0 ? 'Reaberta' : 'Em execução';
  /* aberta */
  if (d.aprovacao === 'aprovada') return 'Aprovada';
  return d.responsavel ? 'Em triagem' : 'Aberta';
}

/* ------------------------------------------------------------------ prazos */

/* O "HOJE" DO SISTEMA VIRAVA ÀS 21H — 20/09/2026.

   `new Date().toISOString()` é SEMPRE UTC, qualquer que seja o aparelho. A
   igreja é do Rio (UTC-03). Das 21h às 23h59, `HOJE()` já respondia amanhã.

   Medido com o instante 05/10/2026 21h30 no Rio:

       HOJE() respondia ......... 2026-10-06
       a data real no Rio era ... 2026-10-05
       demanda com prazo para HOJE (05/10):
         situacao()     -> 'atrasada'   (devia ser 'hoje')
         diasDeAtraso() -> 1            (o prazo só vence à meia-noite)
         prazo sugerido (categoria de 3 dias) -> 09/10 em vez de 08/10

   Quem consome: /demandas (quatro lugares) e /demandas/d/[numero] (três).
   Ou seja: toda noite, das 21h em diante, o painel inteiro ficava vermelho
   três horas antes da hora, e quem abrisse o app depois do culto de domingo
   à noite via as próprias demandas como atrasadas.

   `app/api/cron/route.ts` já resolve isso certo, com `dataSP()`. Este é o
   mesmo remédio.

   O BANCO TEM O MESMO DESVIO, POR OUTRO CAMINHO: `current_date` aparece em
   seis pontos de `supabase/50-demandas.sql` (`atrasada`, `dem_lista`,
   `atraso_motivo` em `concluir`, e três em `dem_numeros`). O Supabase roda em
   UTC e não há `set timezone` em migração nenhuma, então os dois lados erram
   JUNTO — o que é consistente e igualmente errado. Trocar para
   `(now() at time zone 'America/Sao_Paulo')::date` nos seis pontos fica para
   a próxima migração de Demandas; mexer neles é mexer em `dem_lista` e
   `dem_numeros`, que é cirurgia com conferência própria e não cabe de
   carona. Enquanto isso, a tela para de errar sozinha. */
export const HOJE = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

export function somaDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** A data que o formulário sugere quando a categoria tem prazo padrão. */
export function prazoSugerido(c: Categoria | undefined, hoje = HOJE()): string {
  if (!c?.prazo_padrao_dias) return '';
  return somaDias(hoje, c.prazo_padrao_dias);
}

export type Situacao = 'atrasada' | 'hoje' | 'parada' | 'fechada' | 'em dia';

/** Uma palavra para o estado de tempo. A ordem importa: atraso ganha de tudo. */
export function situacao(d: Pick<Resumo, 'status' | 'prazo' | 'parada_dias'>, hoje = HOJE()): Situacao {
  if (d.status === 'concluida' || d.status === 'cancelada') return 'fechada';
  if (d.prazo && d.prazo < hoje) return 'atrasada';
  if (d.prazo === hoje) return 'hoje';
  /* "demandas sem movimentação por determinado período devem aparecer como
     pendentes de atenção" — sete dias é o período. */
  if (d.parada_dias >= 7) return 'parada';
  return 'em dia';
}

export function diasDeAtraso(prazo: string | null, hoje = HOJE()): number {
  if (!prazo || prazo >= hoje) return 0;
  return Math.round((Date.parse(hoje) - Date.parse(prazo)) / 86400000);
}

/* --------------------------------------------- o que falta para poder abrir

   As mesmas regras que o banco impõe como CHECK, aqui só para a pessoa saber
   ANTES de tocar em enviar. Quem manda é o banco; isto é gentileza.          */

export type Rascunho = {
  titulo: string; descricao: string; categoria_id: string;
  prioridade: Prioridade; impacto: string;
  prazo: string; sem_prazo_porque: string;
  evento: string; evento_data: string;
  orcamento: string; objetivo: string; local: string; publico: string;
  setor_solicitante?: string;
};

export const rascunhoVazio = (): Rascunho => ({
  titulo: '', descricao: '', categoria_id: '', prioridade: 'normal', impacto: '',
  prazo: '', sem_prazo_porque: '', evento: '', evento_data: '',
  orcamento: '', objetivo: '', local: '', publico: '',
});

export function oQueFalta(r: Rascunho, temSetor: boolean): string[] {
  const f: string[] = [];
  if (r.titulo.trim().length < 4) f.push('um título que diga o que é');
  if (r.descricao.trim().length < 10) f.push('a descrição do que precisa ser feito');
  if (!r.categoria_id) f.push('a categoria');
  if (!temSetor) f.push('o setor que está pedindo');
  if (!r.prazo && !r.sem_prazo_porque.trim()) f.push('uma data desejada, ou o porquê de não ter data');
  if (r.prioridade === 'urgente' && !r.impacto.trim()) f.push('o que acontece se não for feito (urgente pede isso)');
  if (r.evento.trim() && !r.evento_data) f.push('a data do evento');
  /* 19/09/2026 — os tetos da migração 52, conferidos AQUI também.
     O comentário logo acima desta função promete "as mesmas regras que o
     banco impõe como CHECK, aqui só para a pessoa saber ANTES"; quando a 52
     acrescentou quatro CHECKs e esta função não acompanhou, a promessa virou
     mentira e o texto de 300 letras só era recusado depois de enviado. */
  if (r.titulo.trim().length > 200) f.push('um título mais curto (o limite é 200 letras; o texto longo cabe na descrição)');
  if (r.descricao.trim().length > 20000) f.push('uma descrição menor (o limite é 20 mil letras)');
  if (r.evento.trim().length > 120) f.push('um nome de evento mais curto (o limite é 120 letras)');
  return f;
}

/* ------------------------------------------------------------- as ações ---
   ESPELHO de `dem_mover`. Ver o comentário do topo do arquivo.               */

export type Acao =
  | 'assumir' | 'travar' | 'destravar' | 'aprovar' | 'rejeitar'
  | 'prazo' | 'prioridade' | 'redirecionar' | 'concluir' | 'cancelar' | 'reabrir'
  | 'comentar' | 'anexar';

/** Quem está olhando, do ponto de vista de UMA demanda. Vem de `dem_ver`. */
export type Quem = { papel: string; atende: boolean; abriu: boolean };

export function acoesDe(
  d: Pick<Resumo, 'status' | 'travada_por' | 'aprovacao'> & { responsavel?: string | null },
  eu: Quem,
): Acao[] {
  const manda = eu.papel === 'gestor' || eu.papel === 'admin';
  const fechada = d.status === 'concluida' || d.status === 'cancelada';
  const esperandoAprovacao = d.aprovacao === 'pendente';
  const a: Acao[] = [];

  /* comentar e anexar valem sempre, inclusive depois de fechada: é como se
     pede revisão sem reabrir de cara. */
  a.push('comentar', 'anexar');

  if (fechada) {
    if (eu.abriu || manda || eu.atende) a.push('reabrir');
    return a;
  }

  if (esperandoAprovacao && manda) a.push('aprovar', 'rejeitar');

  if (eu.atende) {
    if (!esperandoAprovacao && d.status !== 'execucao') a.push('assumir');
    if (d.status === 'travada') {
      if (!(d.travada_por === 'aprovacao' && esperandoAprovacao)) a.push('destravar');
    } else {
      a.push('travar');
    }
    a.push('prazo', 'prioridade', 'concluir');
  } else if (d.status === 'travada' && d.travada_por === 'informacao' && eu.abriu) {
    /* quem pediu responde e destrava: é o caminho que tira a demanda do limbo
       sem depender do setor lembrar de voltar nela. */
    a.push('destravar');
  }

  if (manda || eu.atende) a.push('redirecionar');
  if (manda || eu.atende || eu.abriu) a.push('cancelar');

  return a;
}

export const pode = (acoes: Acao[], x: Acao) => acoes.includes(x);

/* ------------------------------------------------------------- o WhatsApp

   O documento pede que "o solicitante receba notificações". Servidor não
   manda WhatsApp, e o canal real da igreja é o WhatsApp — então o sistema
   prepara a mensagem e a pessoa toca uma vez para enviar. É menos automático
   e é honesto: chega onde a pessoa lê.                                       */

export function soDigitos(t: string | null | undefined): string {
  return (t || '').replace(/\D/g, '');
}

/** Devolve '' quando não há telefone: quem chama decide se esconde o botão.

    O DDI SE DECIDE PELO COMPRIMENTO, NÃO PELO PREFIXO — 19/09/2026.

    Esta função usava `n.startsWith('55') ? n : '55' + n`, e essa é a única
    das dez montagens de `wa.me` do repositório que erra. Celular do DDD 55
    (Santa Maria, Bagé, Uruguaiana — o interior do Rio Grande do Sul) tem onze
    dígitos e COMEÇA com 55: `55999998888`. O teste de prefixo acha que o DDI
    já está lá e devolve `wa.me/55999998888`, que o WhatsApp lê como Brasil +
    DDD 99, no Maranhão. A mensagem vai para outra pessoa, ou para ninguém.

    Número brasileiro com DDD tem 10 ou 11 dígitos; com DDI, 12 ou 13. O
    comprimento responde sem ambiguidade, e é o que as outras nove fazem.

    Vale dizer o tamanho real disto: a igreja é na Barra da Tijuca, DDD 21. O
    defeito atinge perto de ninguém hoje. Está aqui porque a regra "como se
    monta um número brasileiro" tinha dez donos e um deles discordava — e a
    próxima vez que ela mudar, nove lugares mudam juntos e um fica para trás
    de novo. */
export function linkZap(telefone: string | null | undefined, texto: string): string {
  const n = soDigitos(telefone);
  if (n.length < 10) return '';
  const cheio = n.length <= 11 ? '55' + n : n;
  return `https://wa.me/${cheio}?text=${encodeURIComponent(texto)}`;
}

export function recado(d: Resumo, base: string, o: 'abriu' | 'mudou' | 'pergunta' | 'pronta'): string {
  const link = `${base.replace(/\/$/, '')}/d/${d.numero}`;
  const cab = `Demanda #${d.numero} — ${d.titulo}`;
  if (o === 'abriu') {
    return `${cab}\n${d.solicitante} pediu para ${d.responsavel_setor}.\n` +
      `${rotPrioridade(d.prioridade)}${d.prazo ? `, para ${dataCurta(d.prazo)}` : ''}.\n${link}`;
  }
  if (o === 'pergunta') {
    return `${cab}\nPrecisamos de uma informação sua para continuar.\n${link}`;
  }
  if (o === 'pronta') {
    return `${cab}\nFoi concluída. Se não resolveu, dá para reabrir na própria página.\n${link}`;
  }
  return `${cab}\nAgora está: ${rotStatus(d.status)}${d.travada_por ? ` (${rotTrava(d.travada_por)})` : ''}.\n${link}`;
}

/* ------------------------------------------------------------------ texto */

export function dataCurta(iso: string | null): string {
  if (!iso) return '';
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}

export function dataCheia(iso: string | null): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function quando(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const dias = Math.round(h / 24);
  if (dias < 30) return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  return dataCheia(iso.slice(0, 10));
}

export function dinheiro(v: number | null): string {
  if (v === null || v === undefined) return '';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function horas(h: number | null): string {
  if (h === null || h === undefined) return '—';
  if (h < 24) return `${h} h`;
  return `${(h / 24).toFixed(1).replace('.', ',')} dias`;
}

/* --------------------------------------------------- recados do servidor */

const PORBANCO: Record<string, string> = {
  SEM_ACESSO: 'Este link não vale mais, ou você não tem acesso a esta demanda.',
  NAO_EXISTE: 'Essa demanda não existe.',
  SEM_SETOR: 'Falta dizer de qual setor você é. Quem organiza resolve isso em Ajustes.',
  CATEGORIA_INVALIDA: 'Escolha uma categoria.',
  NAO_E_SEU_SETOR: 'Quem atende esta demanda é outro setor.',
  SEM_PERMISSAO: 'Você não tem permissão para isso.',
  SO_GESTOR: 'Só a liderança aprova ou recusa.',
  SO_ADMIN: 'Só quem administra o sistema mexe aqui.',
  FALTA_APROVACAO: 'Esta demanda ainda espera aprovação.',
  NAO_ESTA_PENDENTE: 'Esta demanda não está esperando aprovação.',
  NAO_ESTA_TRAVADA: 'Esta demanda não está travada.',
  JA_FECHADA: 'Esta demanda já foi encerrada. Dá para reabrir, se precisar.',
  NAO_ESTA_FECHADA: 'Só dá para reabrir o que já foi concluído ou cancelado.',
  SETOR_NAO_ATENDE: 'Esse setor não recebe demandas. Escolha um dos que atendem.',
  MOTIVO_INVALIDO: 'Diga por que está travando.',
  PRIORIDADE_INVALIDA: 'Prioridade inválida.',
  TEXTO_VAZIO: 'Escreva alguma coisa antes de enviar.',
  CONCLUSAO_VAZIA: 'Diga o que foi feito. A conclusão precisa dizer.',
  MOTIVO_VAZIO: 'Diga por que está cancelando.',
  URL_VAZIA: 'Cole o endereço do arquivo.',
  JA_EXISTE: 'Já existe um com esse nome.',
  ALVO_DESCONHECIDO: 'Não sei ajustar isso.',
  ACAO_DESCONHECIDA: 'Não sei fazer isso.',
  FALTA_CAMPO: 'Falta preencher um campo obrigatório.',
};

/* As mensagens dos CHECK chegam sem acento, direto do Postgres. Traduzir aqui
   é o que impede a tela de mostrar "new row violates check constraint". */
const PORCHECK: [RegExp, string][] = [
  [/ck_prazo/,      'Falta a data desejada, ou o porquê de não ter data.'],
  [/ck_urgente/,    'Urgente precisa dizer o que acontece se não for feito.'],
  [/ck_evento/,     'Se tem evento, precisa da data do evento.'],
  [/ck_conclusao/,  'A conclusão precisa dizer o que foi realizado.'],
  [/ck_cancelada/,  'Cancelar precisa de um motivo.'],
  [/ck_travada/,    'Travar precisa de um motivo.'],
  [/ck_prioridade/, 'Prioridade inválida.'],
  [/ck_status/,     'Status inválido.'],
  [/ck_papel/,      'Papel inválido.'],
  /* 19/09/2026 — as quatro restrições da migração 52. Sem estas linhas, um
     título de 300 letras voltava como "Falta alguma coisa obrigatória nesta
     demanda", que não diz o que fazer. O limite do título não é capricho: o
     título viaja em TODA carga da lista, para todo membro. */
  [/demandas_titulo_tam_ck/,    'O título precisa ter entre 3 e 200 letras. Se o texto é longo, ele cabe na descrição.'],
  [/demandas_descricao_tam_ck/, 'A descrição passou de 20 mil letras. Anexe o arquivo por link em vez de colar o texto inteiro.'],
  [/demandas_evento_tam_ck/,    'O nome do evento precisa ter até 120 letras.'],
  [/anexos_url_http_ck/,        'O anexo precisa ser um endereço que comece com http:// ou https://.'],
];

/* O `ok?` na assinatura não é decoração. Sem ele, o tipo é "fraco" para o
   TypeScript — todas as propriedades opcionais — e passar a resposta INTEIRA
   da RPC (a união de ok:true e ok:false) vira erro de compilação por não ter
   nenhuma propriedade em comum com o ramo de sucesso. Com `ok?`, a união
   sempre tem ao menos uma. */
export function recadoDoErro(r: { ok?: boolean; erro?: string; regra?: string } | null | undefined): string {
  if (!r?.erro) return 'Não consegui. Tente de novo.';
  if (r.erro === 'REGRA' && r.regra) {
    for (const [re, txt] of PORCHECK) if (re.test(r.regra)) return txt;
    return 'Falta alguma coisa obrigatória nesta demanda.';
  }
  /* O TRANSPORTE É O MESMO DOS DOIS SISTEMAS; SÓ O NEGÓCIO É DAQUI.

     `lib/demandas/api.ts` colapsa tudo que não é recusa de regra em
     `erro:'REDE'`, guardando a mensagem verdadeira em `regra`. E `REDE` nunca
     esteve em `PORBANCO` — nem `SEM_CONFIG`, nem `VAZIO`. Resultado: sessão
     expirada, permissão faltando (42501), limite de e-mail do Supabase e
     wi-fi caído produziam a MESMA frase de quatro palavras, e a mensagem do
     banco era jogada fora sem nem ir para o console.

     É exatamente o defeito que `lib/erros.ts` foi escrito para matar do lado
     das escalas, de volta inteiro do lado das demandas. E não precisava: o
     Postgres é o mesmo, o PostgREST é o mesmo, a rede é a mesma. O que é
     legitimamente próprio daqui é o vocabulário de NEGÓCIO — `SEM_ACESSO`,
     `JA_FECHADA`, `SO_QUEM_ATENDE` —, e esse continua em `PORBANCO`, com
     precedência. O chão de transporte passa a ser compartilhado. */
  const doNegocio = PORBANCO[r.erro];
  if (doNegocio) return doNegocio;
  if (r.regra) return humano(new Error(r.regra), 'salvar').texto;
  return 'Não consegui. Tente de novo.';
}
