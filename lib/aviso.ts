/* =============================================================================
   O AVISO NO CELULAR: O QUE ELE DIZ — 104, 01/10/2026

   As frases e o endereço de cada aviso. Mora aqui, e não na rota, para o
   teste alcançar (`scripts/aviso.test.mjs`). Quem manda é lib/push.ts.

   Três avisos, e nenhum outro:
     · pedido de troca: "Ana pediu para você ficar com VOZ, domingo, 5 de
       outubro, 10h." Abre a página de quem recebeu, nas trocas;
     · resposta da troca, para quem pediu: ficou com a vaga, ou não pode;
     · lembrete 3 dias e 1 dia antes, com "falta você confirmar" quando falta.

   O endereço leva o token de quem RECEBE o aviso: o aviso chega cifrado no
   aparelho dela (é o que o "web push" faz), e é a própria página dela.
   ============================================================================= */
import { quandoDaVaga } from './trocas';

/* O endereço de aviso só pode ser de um serviço conhecido. É a mesma regra
   da restrição `avisos_celular_endpoint_ck` (supabase/104): quem manda é o
   servidor, por POST, e endereço livre seria o servidor da igreja fazendo
   POST para onde alguém quisesse. As duas pontas conferem. */
export const ENDERECO_DE_AVISO =
  /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//;
export const enderecoPermitido = (e: unknown): e is string =>
  typeof e === 'string' && e.length <= 1000 && ENDERECO_DE_AVISO.test(e);

export type Mensagem = { titulo: string; corpo: string; url: string; tag: string };

const primeiro = (n: string | null | undefined) => (n || '').trim().split(/\s+/)[0] || 'Um colega';

/* uma linha de `aviso_da_troca` */
export type LinhaDaTroca = {
  token_destino: string; tipo: 'pedido' | 'aceita' | 'recusada';
  outro: string | null; funcao: string; data: string; evento: string | null; inicio: string | null;
};

export function mensagemDaTroca(l: LinhaDaTroca, base: string, cultoHora: string, followHora?: string | null): Mensagem {
  const quando = quandoDaVaga(l, cultoHora, followHora);
  const url = `${base}/eu/${encodeURIComponent(l.token_destino)}#trocas`;
  const tag = `troca-${l.data}-${l.funcao}`;
  if (l.tipo === 'pedido') return {
    titulo: 'Pedido de troca', tag, url,
    corpo: `${primeiro(l.outro)} pediu para você ficar com ${l.funcao}, ${quando}. Toque para responder.`,
  };
  if (l.tipo === 'aceita') return {
    titulo: 'Troca feita', tag, url,
    corpo: `${primeiro(l.outro)} ficou com a sua vaga de ${l.funcao}, ${quando}. Ela saiu da sua escala.`,
  };
  return {
    titulo: 'Pedido de troca', tag, url,
    corpo: `${primeiro(l.outro)} não pode ficar com ${l.funcao}, ${quando}. A vaga continua sua.`,
  };
}

/* 106 · uma linha de `aviso_da_chamada`: a liderança chamou para cobrir */
export type LinhaDaChamada = {
  token: string; funcao: string; data: string; evento: string | null; inicio: string | null;
};
export function mensagemDaChamada(l: LinhaDaChamada, base: string, cultoHora: string, followHora?: string | null): Mensagem {
  const quando = quandoDaVaga(l, cultoHora, followHora);
  return {
    titulo: 'Precisam de você',
    corpo: `A liderança chamou você para cobrir ${l.funcao}, ${quando}. Toque para responder.`,
    url: `${base}/eu/${encodeURIComponent(l.token)}#chamadas`,
    tag: `chamada-${l.data}-${l.funcao}`,
  };
}

/* uma linha de `avisos_para_lembrar` */
export type LinhaDoLembrete = {
  token: string; tipo: 'd3' | 'd1'; data: string; evento: string | null; inicio: string | null;
  funcoes: string; pendente: boolean;
};

export function mensagemDoLembrete(l: LinhaDoLembrete, base: string, cultoHora: string, followHora?: string | null): Mensagem {
  const quando = quandoDaVaga(l, cultoHora, followHora);
  return {
    titulo: l.tipo === 'd1' ? 'Sua escala é amanhã' : 'Sua escala é daqui a 3 dias',
    corpo: `${l.funcoes}, ${quando}.${l.pendente ? ' Falta você confirmar.' : ''}`,
    url: `${base}/eu/${encodeURIComponent(l.token)}${l.pendente ? '#confirmar' : ''}`,
    tag: `lembrete-${l.data}`,
  };
}
