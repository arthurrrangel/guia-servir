/* =============================================================================
   O LINK DO CARTÃO AINDA ABRE? · 29/10/2026

   Em 29/10 uma pessoa avisou que o cartão "manda para outro site que dá
   inválido": o link de pagamento da Stone tinha expirado (ou sido cancelado
   no app) e o site continuou mandando gente para ele. Daqui em diante o
   SERVIDOR pergunta à Stone se cada link de LINKS_CARTAO ainda abre, e só os
   que abrem vão para a tela: /followcamp/pagar, a página pessoal
   (/followcamp/minha/<token>) e o /api/followcamp/meios, que por sua vez
   decide o botão da página do Camp, o da ficha e a mensagem do Cobrar. O
   painel mostra o motivo quando um link para (cartaoStone: 'parado').

   COMO SE SABE (medido em 29/10/2026, sem pagar nada). A página do link
   (payment-link-v3.stone.com.br/<id>) é montada no navegador a partir de
   checkout-bff-prd.pagar.me/paymentlinks/<id>:
     · pl_2nDZ… (no ar): 200, com o valor (cart_settings.total_cost, em
       centavos), os meios aceitos e as parcelas do crédito; a página mostra
       o checkout;
     · pl_b1ZM… e pl_LOm8… (mortos): 404, e a página mostra "Não encontramos
       seu link de pagamento. Esse link de pagamento não existe ou expirou".

   O QUE TIRA O LINK DA TELA:
     · 404 ou 410: o link não existe mais;
     · 200, mas o link diz outra coisa que o código: outro valor (a tela
       prometeria um preço que a Stone não cobra), outro máximo de parcelas,
       ou nada de cartão de crédito.
   O QUE NÃO TIRA: rede fora, tempo esgotado, 429, 5xx, resposta que não se
   entende. A trava existe para tirar link morto, não para esconder o cartão
   quando a Stone soluça: aí vale o que valia antes, o link fica.

   A resposta vale 5 minutos por instância do servidor (e no cache de dados
   do Next, onde ele vale): a Stone recebe pouquíssimas consultas. Os
   validadores do servidor (conferirInformado, conferirPagamentoDoLink)
   continuam com a lista inteira: quem pagou num link antes de ele morrer
   ainda consegue avisar.
   ============================================================================= */
import { LINKS_CARTAO, emReais, linkInvalido, loteVigente, type LinkCartao } from './followcamp';

const BFF = 'https://checkout-bff-prd.pagar.me/paymentlinks/';
const ID_DO_LINK = /^\/(pl_[A-Za-z0-9]{8,64})\/?$/;
const ESPERA_MS = 4000;
const VALE_MS = 5 * 60_000;
const VALE_SEM_RESPOSTA_MS = 60_000;

export type SituacaoDoLink = 'vivo' | 'morto' | 'divergente' | 'sem_resposta';
export type LinkConferido = { link: LinkCartao; situacao: SituacaoDoLink; motivo?: string };
type Leitura = Omit<LinkConferido, 'link'>;

/** O id do link (pl_…) no endereço da Stone, ou null. */
export function idDoLink(url: string): string | null {
  try { return ID_DO_LINK.exec(new URL(url).pathname)?.[1] ?? null; } catch { return null; }
}

const objeto = (x: unknown): Record<string, unknown> | null =>
  x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;

/** O que a resposta da Stone diz deste link. Puro: os testes passam o status
 *  e o corpo como a Stone mandaria. */
export function lerResposta(l: LinkCartao, status: number, corpo: unknown): Leitura {
  if (status === 404 || status === 410) {
    return { situacao: 'morto', motivo: 'a Stone diz que o link não existe mais (expirou ou foi cancelado no app)' };
  }
  if (status < 200 || status > 299) return { situacao: 'sem_resposta', motivo: `a Stone respondeu ${status}` };
  const c = objeto(corpo);
  if (!c) return { situacao: 'vivo' };
  const id = idDoLink(l.url);
  if (typeof c.id === 'string' && id && c.id !== id) return { situacao: 'sem_resposta', motivo: 'a Stone respondeu sobre outro link' };
  const pg = objeto(c.payment_settings);
  const meios = Array.isArray(pg?.accepted_payment_methods) ? (pg!.accepted_payment_methods as unknown[]) : null;
  if (meios && !meios.includes('credit_card')) {
    return { situacao: 'divergente', motivo: 'o link não aceita cartão de crédito' };
  }
  const total = objeto(c.cart_settings)?.total_cost;
  if (typeof total === 'number' && Number.isFinite(total) && Math.round(total) !== Math.round(l.valor * 100)) {
    return { situacao: 'divergente', motivo: `o link cobra ${emReais(total / 100)} e o site diz ${emReais(l.valor)}` };
  }
  const parcelas = objeto(pg?.credit_card_settings)?.installments;
  if (Array.isArray(parcelas)) {
    const max = Math.max(0, ...parcelas.map(p => Number(objeto(p)?.number)).filter(n => Number.isInteger(n) && n > 0));
    if (max > 0 && max !== l.parcelas) {
      return { situacao: 'divergente', motivo: `o link aceita até ${max}x no crédito e o site diz ${l.parcelas}x` };
    }
  }
  return { situacao: 'vivo' };
}

const memoria = new Map<string, { ate: number; leitura: Leitura }>();

/** Só para os testes: esquece o que já foi perguntado. */
export function esquecerConferencias() { memoria.clear(); }

/** Pergunta à Stone por um link. Nunca lança: na dúvida, 'sem_resposta'. */
export async function conferirLink(l: LinkCartao, f: typeof fetch = fetch, agora = Date.now()): Promise<LinkConferido> {
  const guardado = memoria.get(l.url);
  if (guardado && guardado.ate > agora) return { link: l, ...guardado.leitura };
  const id = idDoLink(l.url);
  let leitura: Leitura;
  if (!id) leitura = { situacao: 'sem_resposta', motivo: 'endereço de link que a trava não sabe ler' };
  else {
    try {
      const r = await f(BFF + id, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(ESPERA_MS),
        next: { revalidate: 300 },
      } as RequestInit);
      let corpo: unknown = null;
      if (r.ok) { try { corpo = await r.json(); } catch { corpo = null; } }
      leitura = lerResposta(l, r.status, corpo);
    } catch {
      leitura = { situacao: 'sem_resposta', motivo: 'a Stone não respondeu a tempo' };
    }
  }
  memoria.set(l.url, { ate: agora + (leitura.situacao === 'sem_resposta' ? VALE_SEM_RESPOSTA_MS : VALE_MS), leitura });
  return { link: l, ...leitura };
}

export function conferirLinks(links: readonly LinkCartao[] = LINKS_CARTAO, f: typeof fetch = fetch): Promise<LinkConferido[]> {
  return Promise.all(links.map(l => conferirLink(l, f)));
}

/** Os links que podem ir para a tela: os vivos e os que a Stone não
 *  respondeu (na dúvida, o link fica). */
export function linksQueAbrem(c: readonly LinkConferido[]): LinkCartao[] {
  return c.filter(x => x.situacao === 'vivo' || x.situacao === 'sem_resposta').map(x => x.link);
}

export async function linksNaTela(links: readonly LinkCartao[] = LINKS_CARTAO, f: typeof fetch = fetch): Promise<LinkCartao[]> {
  return linksQueAbrem(await conferirLinks(links, f));
}

export type EstadoDoCartao = 'vivo' | 'parado' | 'sem_resposta' | 'sem_link';

/** O cartão do lote vigente, para o painel: 'parado' quando algum link do
 *  lote que iria para a tela morreu ou diverge (com o motivo). */
export function resumoDoCartao(c: readonly LinkConferido[], agora = new Date()): { estado: EstadoDoCartao; motivo?: string } {
  const lote = loteVigente(agora);
  const doLote = lote ? c.filter(x => x.link.lote === lote.nome && !linkInvalido(x.link)) : [];
  if (doLote.length === 0) return { estado: 'sem_link' };
  const parado = doLote.find(x => x.situacao === 'morto' || x.situacao === 'divergente');
  if (parado) return { estado: 'parado', motivo: parado.motivo };
  return { estado: doLote.every(x => x.situacao === 'vivo') ? 'vivo' : 'sem_resposta' };
}
