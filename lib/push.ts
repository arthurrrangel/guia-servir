/* =============================================================================
   MANDAR O AVISO — 104, 01/10/2026 · só no servidor

   O par de chaves (VAPID) mora nas variáveis do Vercel e só lá:
     VAPID_PUBLIC_KEY   a chave pública (vai para o navegador, não é segredo)
     VAPID_PRIVATE_KEY  a chave privada (segredo; nunca sai do servidor)
   Quem gera o par é o Arthur, no navegador dele (/ajustes/aviso-no-celular),
   e cola no Vercel. Sem as duas, nada aqui manda nada, e a tela do
   voluntário não oferece ligar o aviso.

   O que o serviço de aviso responde decide o destino do aparelho:
     201 ........... entregue
     404 / 410 ..... o endereço não existe mais (desinstalou, limpou dados):
                     sai do banco, em todos os vínculos
     outro ......... falha; cinco seguidas e o aparelho sai (aviso_resultado)
   ============================================================================= */
import webpush from 'web-push';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { enderecoPermitido, type Mensagem } from './aviso';

export const pushConfigurado = () =>
  !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

/* o cliente com papel de serviço: as funções que mandam aviso só abrem para
   ele (supabase/104). Mesmo par de variáveis que o robô de /api/cron usa. */
export function clienteDeServico(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qjtcaijhgldypudzyafz.supabase.co';
  const chave = process.env.SUPABASE_SERVICE_ROLE || '';
  return chave ? createClient(url, chave, { auth: { persistSession: false } }) : null;
}

let configurado = false;
function configurar() {
  if (configurado) return;
  webpush.setVapidDetails('https://guiaservir.com', process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configurado = true;
}

export type Aparelho = { endpoint: string; p256dh: string; auth: string };
export type Resultado = 'ok' | 'sumiu' | 'falhou';

export async function mandarAviso(a: Aparelho, m: Mensagem): Promise<Resultado> {
  /* a restrição do banco já recusa, e aqui confere de novo: é daqui que
     sai o POST */
  if (!enderecoPermitido(a.endpoint)) return 'falhou';
  configurar();
  try {
    await webpush.sendNotification(
      { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
      JSON.stringify(m),
      { TTL: 12 * 3600, urgency: 'normal', timeout: 8000 },
    );
    return 'ok';
  } catch (e: any) {
    const st = e?.statusCode;
    return st === 404 || st === 410 ? 'sumiu' : 'falhou';
  }
}

/* manda para todos e conta, gravando no banco o que cada um respondeu */
export async function mandarParaTodos(s: SupabaseClient, lista: { aparelho: Aparelho; msg: Mensagem }[]) {
  const conta = { ok: 0, sumiu: 0, falhou: 0 };
  /* em lotes de dez: o serviço de aviso aguenta, a função não estoura */
  for (let i = 0; i < lista.length; i += 10) {
    const lote = lista.slice(i, i + 10);
    const rs = await Promise.all(lote.map(x => mandarAviso(x.aparelho, x.msg)));
    await Promise.all(rs.map((r, j) => {
      conta[r]++;
      return s.rpc('aviso_resultado', { p_endpoint: lote[j].aparelho.endpoint, p_ok: r === 'ok', p_sumiu: r === 'sumiu' });
    }));
  }
  return conta;
}
