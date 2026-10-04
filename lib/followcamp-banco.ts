/* =============================================================================
   O FOLLOW CAMP NO BANCO, PELO SERVIDOR — 04/10/2026 (migração 110)

   As três gravações que o site faz sozinho: a ficha, o aviso de pagamento
   ("Avisar no WhatsApp" depois do Pix direto ou do link) e, quando houver a
   chave da API da Stone, os pedidos pagos que ela devolver. As três funções
   do banco são SÓ da chave de serviço (`SUPABASE_SERVICE_ROLE`): a chave
   pública do navegador não alcança nem o esquema `followcamp`.

   Só o servidor usa este arquivo. Ele nunca escreve no log o que foi enviado:
   só o motivo da falha.

   CONFERÊNCIA ESTRITA: só conta como gravado um 200 com `ok: true` no corpo.
   Função que não existe (a 110 ainda não rodou) responde 404 PGRST202, e a
   rota da ficha cai no WhatsApp, como antes.
   ============================================================================= */
if (typeof window !== 'undefined') throw new Error('lib/followcamp-banco.ts é só do servidor');

export type Gravacao = { ok: true; id?: string; repetido?: boolean; novos?: number } | { ok: false; motivo: string };

const URL_PADRAO = 'https://qjtcaijhgldypudzyafz.supabase.co';

/* lido a cada chamada (e não na carga do módulo): o teste troca o endereço */
function config() {
  return {
    url: (process.env.NEXT_PUBLIC_SUPABASE_URL || URL_PADRAO).replace(/\/+$/, ''),
    chave: process.env.SUPABASE_SERVICE_ROLE || '',
  };
}

export const bancoLigado = () => !!config().chave;

async function rpcDeServico(nome: string, args: Record<string, unknown>, teto = 8000): Promise<Gravacao> {
  const { url, chave } = config();
  if (!chave) return { ok: false, motivo: 'sem SUPABASE_SERVICE_ROLE' };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), teto);
  try {
    const r = await fetch(`${url}/rest/v1/rpc/${nome}`, {
      method: 'POST',
      headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
      signal: ctl.signal,
      cache: 'no-store',
    });
    let j: unknown = null;
    try { j = await r.json(); } catch { /* corpo vazio ou HTML */ }
    const o = (j && typeof j === 'object' ? j : {}) as Record<string, unknown>;
    if (r.status === 200 && o.ok === true) {
      return {
        ok: true,
        ...(typeof o.id === 'string' ? { id: o.id } : {}),
        ...(o.repetido === true ? { repetido: true } : {}),
        ...(typeof o.novos === 'number' ? { novos: o.novos } : {}),
      };
    }
    if (r.status === 404 || o.code === 'PGRST202') return { ok: false, motivo: 'a migração 110 não rodou (função inexistente)' };
    return { ok: false, motivo: `banco respondeu ${r.status}${typeof o.erro === 'string' ? ` ${o.erro}` : typeof o.code === 'string' ? ` ${o.code}` : ''}` };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error && e.name === 'AbortError' ? 'banco demorou' : 'banco fora do ar' };
  } finally {
    clearTimeout(t);
  }
}

/** A ficha do site (os campos de `fichaParaBanco`, lib/followcamp-ficha.ts). */
export const gravarFicha = (p: Record<string, unknown>, teto = 8000) => rpcDeServico('fc27_ficha_gravar', { p }, teto);

/** Pergunta se o banco está pronto sem gravar nada (`{teste: true}`). */
export async function bancoResponde(): Promise<boolean> {
  const r = await rpcDeServico('fc27_ficha_gravar', { p: { teste: true } }, 5000);
  return r.ok;
}

/** "Paguei": vira uma linha INFORMADA, sem confirmação. */
export const informarPagamento = (p: Record<string, unknown>) => rpcDeServico('fc27_pagamento_informar', { p });

/** Os pedidos pagos que a API da Stone devolveu, já no formato da 110. */
export const gravarPedidosDaStone = (lista: Record<string, unknown>[]) => rpcDeServico('fc27_stone_gravar', { p: lista }, 15000);
