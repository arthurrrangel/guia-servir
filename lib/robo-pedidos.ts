/* OS PEDIDOS AO ROBÔ DO WHATSAPP · 26/10/2026.

   O Arthur: "Gostaria de na aba do sistema ter a opção de disparar escala,
   através desse robo, vou deixar o macbook ligado" e "Para todos os
   ministérios".

   O líder aperta "Mandar agora pelo robô" no "Mandar nos grupos"; o pedido
   vira uma linha no banco (robo_pedir, migração 115). O robô, no MacBook,
   passa a cada minuto pela rota /api/robo/pedidos: conta que está vivo,
   devolve o que fez e leva os pedidos abertos.

   Aqui ficam as regras puras dos dois lados (a rota e a tela), testadas em
   scripts/robo-pedidos.test.mjs:
     · o que a rota aceita do robô (nada de texto sem limite no banco);
     · quando um pedido venceu (o robô não pegou a tempo: nada foi mandado);
     · o que a tela diz ao líder sobre o robô e sobre o pedido. */

export const STATUS_DO_PEDIDO = ['pendente', 'enviando', 'enviado', 'falhou'] as const;
export type StatusDoPedido = (typeof STATUS_DO_PEDIDO)[number];

/* "Mandar agora" é agora: um pedido que o robô não pegou em 30 minutos vence
   (Mac dormindo, sem internet). Sem isso, o robô voltaria horas depois e
   mandaria em cima do que o líder já mandou à mão. O mesmo número está na
   migração 115 (robo_pedir) */
export const VALIDADE_DO_PEDIDO_MIN = 30;
/* o robô conta que está vivo a cada minuto; três minutos sem notícia é desligado */
export const ROBO_LIGADO_ATE_S = 180;

export const SITUACOES_DO_GRUPO = ['postado', 'ja_estava', 'incerto', 'pulado', 'erro'] as const;
export type SituacaoDoGrupo = (typeof SITUACOES_DO_GRUPO)[number];
/* `linha` e `ass`: a linha do "Mandar nos grupos" e a assinatura da mensagem
   que o robô mandou (lib/engine.ts, assinaturaDoEnvio). Com elas a tela marca
   a linha como mandada pelo robô, e "mudou depois do envio" quando a escala muda */
export type GrupoDoResultado = { nome: string; situacao: SituacaoDoGrupo; detalhe?: string; linha?: string; ass?: string };
export type ResultadoDoPedido = { resumo: string; grupos: GrupoDoResultado[]; avisos: string[] };

export type Batimento = { conectado: boolean; pausado: boolean; versao: string | null; ministerios: string[] | null };
export type RelatoDoRobo = { id: string; status: Exclude<StatusDoPedido, 'pendente'>; resultado: ResultadoDoPedido | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9-]{2,40}$/;
/* texto que vai para o banco e volta para a tela: sem controle, cortado */
const texto = (x: unknown, max: number): string =>
  typeof x === 'string' ? x.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max) : '';

export function limparResultado(x: unknown): ResultadoDoPedido | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const grupos: GrupoDoResultado[] = [];
  for (const g of Array.isArray(o.grupos) ? o.grupos.slice(0, 30) : []) {
    if (!g || typeof g !== 'object') continue;
    const gg = g as Record<string, unknown>;
    const nome = texto(gg.nome, 80);
    const situacao = SITUACOES_DO_GRUPO.find(s => s === gg.situacao);
    if (!nome || !situacao) continue;
    const g2: GrupoDoResultado = { nome, situacao };
    const detalhe = texto(gg.detalhe, 200);
    if (detalhe) g2.detalhe = detalhe;
    const linha = texto(gg.linha, 80);
    if (linha) g2.linha = linha;
    if (typeof gg.ass === 'string' && /^[0-9a-z]{1,16}$/.test(gg.ass)) g2.ass = gg.ass;
    grupos.push(g2);
  }
  const avisos = (Array.isArray(o.avisos) ? o.avisos.slice(0, 10) : []).map(a => texto(a, 300)).filter(Boolean);
  return { resumo: texto(o.resumo, 300), grupos, avisos };
}

/* o corpo do POST do robô; null = recusa inteira (400) */
export function lerCorpoDoRobo(x: unknown): { batimento: Batimento; relatos: RelatoDoRobo[] } | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const b = o.batimento as Record<string, unknown> | undefined;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  if (typeof b.conectado !== 'boolean' || typeof b.pausado !== 'boolean') return null;
  let ministerios: string[] | null = null;
  if (b.ministerios !== undefined && b.ministerios !== null) {
    if (!Array.isArray(b.ministerios) || b.ministerios.length > 30) return null;
    if (!b.ministerios.every(m => typeof m === 'string' && SLUG.test(m))) return null;
    ministerios = [...new Set(b.ministerios as string[])];
  }
  const batimento: Batimento = { conectado: b.conectado, pausado: b.pausado, versao: texto(b.versao, 40) || null, ministerios };

  const relatos: RelatoDoRobo[] = [];
  if (o.relatos !== undefined) {
    if (!Array.isArray(o.relatos) || o.relatos.length > 20) return null;
    for (const r of o.relatos) {
      if (!r || typeof r !== 'object') return null;
      const rr = r as Record<string, unknown>;
      if (typeof rr.id !== 'string' || !UUID.test(rr.id)) return null;
      if (rr.status !== 'enviando' && rr.status !== 'enviado' && rr.status !== 'falhou') return null;
      relatos.push({ id: rr.id.toLowerCase(), status: rr.status, resultado: limparResultado(rr.resultado) });
    }
  }
  return { batimento, relatos };
}

/* a passagem de status que a rota aceita: o que já terminou não volta */
export function passagemValida(de: StatusDoPedido, para: StatusDoPedido): boolean {
  if (de === 'enviado' || de === 'falhou') return false;
  if (para === 'pendente') return false;
  return true;
}

/* pendente que o robô não pegou a tempo. A idade vem do banco (idade_s), e
   não do relógio do celular, que pode estar errado; sem ela, a hora do pedido */
export function pedidoVencido(p: { status: StatusDoPedido; criado_em: string; idade_s?: number | null }, agoraMs: number): boolean {
  if (p.status !== 'pendente') return false;
  if (typeof p.idade_s === 'number' && Number.isFinite(p.idade_s)) return p.idade_s > VALIDADE_DO_PEDIDO_MIN * 60;
  const t = Date.parse(p.criado_em);
  return Number.isFinite(t) && agoraMs - t > VALIDADE_DO_PEDIDO_MIN * 60_000;
}

export const MOTIVO_VENCIDO = `O robô não pegou o pedido em ${VALIDADE_DO_PEDIDO_MIN} minutos (Mac desligado, dormindo ou sem internet). Nada foi mandado por ele.`;
export const MOTIVO_DIA_PASSOU = 'O dia passou antes de o robô mandar. Nada foi mandado por ele.';
export const MOTIVO_PAROU = 'O robô parou no meio do envio e não voltou. Confira os grupos antes de mandar de novo.';
/* O ROBÔ QUE VOLTA NÃO MANDA O QUE ESPEROU. Fora do ar por mais de 3 minutos,
   a tela disse ao líder "robô desligado, mande à mão"; se ele mandou, o robô
   mandaria de novo ao voltar. Então, na volta, o que estava esperando cai */
export const MOTIVO_ROBO_FORA = 'O robô ficou fora do ar (Mac desligado, dormindo ou sem internet) enquanto o pedido esperava. Nada foi mandado por ele; peça de novo se ainda precisar.';

/* ========================= o que a tela diz ========================= */

export type RoboNaTela = {
  visto_em: string | null; conectado: boolean | null; pausado: boolean | null;
  segundos: number | null; sabe: boolean | null;
};
export type PedidoNaTela = {
  id: string; status: StatusDoPedido; criado_em: string; atualizado_em: string;
  pedido_por: string | null; resultado: unknown; idade_s?: number | null;
};
export type Tom = 'ok' | 'alerta' | 'fora';

export function haQuanto(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  if (s < 90) return 'agora há pouco';
  const min = Math.round(s / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.round(s / 3600);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(s / 86400)} dias`;
}

/* o robô passou há pouco (está no ar), mesmo pausado ou sem WhatsApp */
export const roboNoAr = (r: RoboNaTela | null) => typeof r?.segundos === 'number' && r.segundos <= ROBO_LIGADO_ATE_S;

export function leituraDoRobo(r: RoboNaTela | null): { tom: Tom; titulo: string; detalhe: string; podePedir: boolean } {
  if (!r || r.segundos === null || r.segundos === undefined) {
    return { tom: 'fora', titulo: 'Robô ainda não ligado', detalhe: 'Mande pelos botões abaixo, como antes.', podePedir: false };
  }
  if (r.segundos > ROBO_LIGADO_ATE_S) {
    return {
      tom: 'fora', titulo: 'Robô desligado agora',
      detalhe: `Visto pela última vez ${haQuanto(r.segundos)}. O MacBook precisa estar ligado, com a tampa aberta e internet. Enquanto isso, mande pelos botões abaixo.`,
      podePedir: false,
    };
  }
  if (r.sabe === false) {
    return { tom: 'alerta', titulo: 'Robô ligado, mas sem os grupos deste ministério', detalhe: 'Peça ao Arthur para incluir os grupos do WhatsApp deste ministério no robô.', podePedir: false };
  }
  if (r.pausado) {
    return { tom: 'alerta', titulo: 'Robô pausado', detalhe: 'Ele não manda nada até ser retomado (retomar.command, no MacBook).', podePedir: false };
  }
  if (!r.conectado) {
    return { tom: 'alerta', titulo: 'Robô sem WhatsApp agora', detalhe: 'O MacBook está ligado, mas o robô perdeu a conexão com o WhatsApp da igreja. Ele tenta de novo sozinho.', podePedir: false };
  }
  return { tom: 'ok', titulo: 'Robô ligado', detalhe: 'Manda pelo WhatsApp da igreja, nos grupos deste ministério.', podePedir: true };
}

const ROTULO_DO_GRUPO: Record<SituacaoDoGrupo, { texto: string; tom: Tom }> = {
  postado: { texto: 'mandada agora', tom: 'ok' },
  ja_estava: { texto: 'já estava no grupo', tom: 'ok' },
  incerto: { texto: 'pode não ter saído: confira o grupo', tom: 'alerta' },
  pulado: { texto: 'não mandou', tom: 'alerta' },
  erro: { texto: 'não saiu', tom: 'fora' },
};

const DIA_SP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });
const HORA_SP = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
/* "às 17:59" no mesmo dia; "em 25/10 às 17:59" se foi outro dia (hora de Brasília) */
export function quandoSP(iso: string, agoraMs: number): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const dia = DIA_SP.format(new Date(t));
  const hora = HORA_SP.format(new Date(t));
  return dia === DIA_SP.format(new Date(agoraMs)) ? `às ${hora}` : `em ${dia.slice(8, 10)}/${dia.slice(5, 7)} às ${hora}`;
}

/* o robô manda escala de hoje até daqui a 14 dias (o mesmo limite de robo_pedir) */
export const JANELA_DO_ROBO_DIAS = 14;
export function dentroDaJanelaDoRobo(hoje: string, d: string): boolean {
  const a = Date.parse(hoje + 'T12:00:00Z'), b = Date.parse(d + 'T12:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const n = Math.round((b - a) / 86400000);
  return n >= 0 && n <= JANELA_DO_ROBO_DIAS;
}

export function leituraDoPedido(p: PedidoNaTela, agoraMs: number, noAr = true): {
  tom: Tom; titulo: string; detalhe: string; aberto: boolean;
  grupos: { nome: string; texto: string; tom: Tom }[]; avisos: string[];
} {
  const quem = p.pedido_por ? ` por ${p.pedido_por}` : '';
  const quando = quandoSP(p.criado_em, agoraMs);
  const base = `Pedido${quando ? ` ${quando}` : ''}${quem}.`;
  const res = limparResultado(p.resultado);
  const grupos = (res?.grupos || []).map(g => {
    const r = ROTULO_DO_GRUPO[g.situacao];
    return { nome: g.nome, texto: g.detalhe ? `${r.texto} (${g.detalhe})` : r.texto, tom: r.tom };
  });
  const avisos = res?.avisos || [];
  if (p.status === 'pendente') {
    if (pedidoVencido(p, agoraMs)) return { tom: 'fora', titulo: 'O pedido venceu', detalhe: `${base} ${MOTIVO_VENCIDO}`, aberto: false, grupos, avisos };
    /* a mesma regra da rota: o robô que volta não manda o que esperou */
    if (!noAr) return { tom: 'fora', titulo: 'Não vai sair', detalhe: `${base} ${MOTIVO_ROBO_FORA}`, aberto: false, grupos, avisos };
    return { tom: 'alerta', titulo: 'Esperando o robô', detalhe: `${base} Ele passa a cada 30 segundos.`, aberto: true, grupos, avisos };
  }
  if (p.status === 'enviando') {
    if (!noAr) return { tom: 'fora', titulo: 'Parou no meio', detalhe: `${base} O robô saiu do ar no meio do envio. Confira os grupos antes de mandar à mão.`, aberto: false, grupos, avisos };
    return { tom: 'alerta', titulo: 'Mandando agora', detalhe: `${base} Uma mensagem a cada 15 a 40 segundos, como uma pessoa faria.`, aberto: true, grupos, avisos };
  }
  /* o resumo do robô é uma frase; na pílula, sem o ponto final */
  const titulo = (res?.resumo || '').replace(/\.$/, '');
  if (p.status === 'enviado') {
    const algum = grupos.some(g => g.tom !== 'ok');
    return { tom: algum ? 'alerta' : 'ok', titulo: titulo || 'Mandado', detalhe: base, aberto: false, grupos, avisos };
  }
  return { tom: 'fora', titulo: titulo || 'Não deu', detalhe: base, aberto: false, grupos, avisos };
}

/* AS LINHAS QUE O ROBÔ JÁ MANDOU, para o "Mandar nos grupos" marcar como
   faz com o envio à mão: de cada linha, o pedido mais novo em que ela foi
   mandada ou já estava no grupo, com a hora e a assinatura da mensagem */
export function marcasDoRobo(pedidos: PedidoNaTela[]): Record<string, { em: string; ass: string | null }> {
  const out: Record<string, { em: string; ass: string | null }> = {};
  const ordem = [...pedidos].sort((a, b) => Date.parse(b.criado_em) - Date.parse(a.criado_em));
  for (const p of ordem) {
    if (p.status !== 'enviado' && p.status !== 'falhou') continue;
    for (const g of limparResultado(p.resultado)?.grupos || []) {
      if (!g.linha || out[g.linha] || (g.situacao !== 'postado' && g.situacao !== 'ja_estava')) continue;
      out[g.linha] = { em: p.atualizado_em, ass: g.ass || null };
    }
  }
  return out;
}

/* as linhas que este aparelho já mandou à mão, com a mensagem de agora: o
   robô não sabe delas, e mandaria de novo (o aviso da confirmação) */
export function mandadasAMao(linhas: { gid: string; nome: string; ass: string }[], envios: Record<string, { ass: string }>): string[] {
  return linhas.filter(l => envios[l.gid] && envios[l.gid].ass === l.ass).map(l => l.nome);
}

/* a mensagem para o erro de robo_pedir */
export function erroDoPedido(codigo: string | null | undefined): string {
  switch (codigo) {
    case 'ROBO_DESLIGADO': return 'O robô está fora do ar agora. Mande pelas linhas abaixo.';
    case 'ROBO_PAUSADO': return 'O robô está pausado. Mande pelas linhas abaixo.';
    case 'ROBO_SEM_WHATSAPP': return 'O robô está sem WhatsApp agora. Tente em alguns minutos, ou mande pelas linhas abaixo.';
    case 'SEM_PERMISSAO': return 'Só a liderança deste ministério pode pedir.';
    case 'DATA_FORA': return 'O robô manda escala de hoje até daqui a 14 dias.';
    case 'SEM_GRUPOS': return 'O robô não tem os grupos do WhatsApp deste ministério.';
    case 'MUITOS_HOJE': return 'Muitos pedidos nas últimas 24 horas. Espere um pouco.';
    case 'SEM_EQUIPE': return 'Ministério não encontrado.';
    default: return 'Não consegui fazer o pedido. Tente de novo em instantes.';
  }
}
