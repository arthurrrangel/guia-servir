/* =============================================================================
   A VIRADA 2027 NO BANCO, PELO SERVIDOR · 21/11/2026 (migração 118)

   As duas falas do site com o banco: gravar a reserva e contar as vagas. As
   duas funções do banco são SÓ da chave de serviço (`SUPABASE_SERVICE_ROLE`):
   a chave pública do navegador não alcança o esquema `virada`, onde mora o
   CPF de quem reservou. O mesmo desenho do Follow Camp (lib/followcamp-banco.ts).

   Só o servidor usa este arquivo, e ele nunca escreve no log o que a pessoa
   mandou: só o motivo da falha.

   CONFERÊNCIA ESTRITA: só conta como gravado um 200 com `ok: true`. Função
   que não existe (a 118 ainda não rodou) responde 404 PGRST202, e a rota
   manda a pessoa confirmar pelo WhatsApp, com a reserva escrita.
   ============================================================================= */
import type { Reserva } from './virada';
import { VIRADA } from './virada';

if (typeof window !== 'undefined') throw new Error('lib/virada-banco.ts é só do servidor');

const URL_PADRAO = 'https://qjtcaijhgldypudzyafz.supabase.co';

/* lido a cada chamada (e não na carga do módulo): o teste troca o endereço */
function config() {
  return {
    url: (process.env.NEXT_PUBLIC_SUPABASE_URL || URL_PADRAO).replace(/\/+$/, ''),
    chave: process.env.SUPABASE_SERVICE_ROLE || '',
  };
}
export const bancoLigado = () => !!config().chave;

type Resposta = { status: number; corpo: Record<string, unknown> } | { status: 0; corpo: Record<string, unknown>; falha: string };

async function rpc(nome: string, args: Record<string, unknown>, teto = 8000): Promise<Resposta> {
  const { url, chave } = config();
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
    return { status: r.status, corpo: (j && typeof j === 'object' ? j : {}) as Record<string, unknown> };
  } catch (e) {
    return { status: 0, corpo: {}, falha: (e as Error)?.name === 'AbortError' ? 'o banco demorou' : 'o banco não respondeu' };
  } finally {
    clearTimeout(t);
  }
}

const motivoDe = (r: Resposta) =>
  'falha' in r ? r.falha
    : r.status === 404 || r.corpo.code === 'PGRST202' ? 'falta a migração 118 no banco'
    : `o banco respondeu ${r.status}${typeof r.corpo.erro === 'string' ? ` (${r.corpo.erro})` : ''}`;

const numero = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);

export type Gravacao =
  | { ok: true; id?: string; repetida?: boolean; restantes?: number }
  | { ok: false; erro: 'ESGOTADO' | 'ENCERRADA'; restantes?: number }
  | { ok: false; erro: 'FALHA'; motivo: string };

export async function reservarNoBanco(r: Reserva): Promise<Gravacao> {
  if (!bancoLigado()) return { ok: false, erro: 'FALHA', motivo: 'sem SUPABASE_SERVICE_ROLE' };
  const res = await rpc('virada_reservar', { p: { evento: VIRADA.slug, ...r } });
  const o = res.corpo;
  if (res.status === 200 && o.ok === true) {
    return {
      ok: true,
      ...(typeof o.id === 'string' ? { id: o.id } : {}),
      ...(o.repetida === true ? { repetida: true } : {}),
      ...(numero(o.restantes) !== undefined ? { restantes: numero(o.restantes) } : {}),
    };
  }
  if (res.status === 200 && (o.erro === 'ESGOTADO' || o.erro === 'ENCERRADA')) {
    return { ok: false, erro: o.erro, ...(numero(o.restantes) !== undefined ? { restantes: numero(o.restantes) } : {}) };
  }
  return { ok: false, erro: 'FALHA', motivo: motivoDe(res) };
}

/** As vagas de agora, ou null quando o banco não responde (a página segue
 *  aberta: quem confere de verdade é a gravação). */
export async function vagasNoBanco(): Promise<{ restantes: number; aberta: boolean } | null> {
  if (!bancoLigado()) return null;
  const res = await rpc('virada_vagas', { p_evento: VIRADA.slug }, 4000);
  const o = res.corpo;
  if (res.status !== 200 || o.ok !== true || numero(o.restantes) === undefined) return null;
  return { restantes: numero(o.restantes)!, aberta: o.aberta === true };
}
