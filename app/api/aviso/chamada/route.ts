/* =============================================================================
   O AVISO DE QUEM FOI CHAMADO PARA COBRIR — 106, 02/10/2026

   A tela do líder chama esta rota logo depois de chamar (`chamar_para_cobrir`
   devolve os ids dos convites novos). Quem decide se há aviso a mandar é o
   BANCO (`aviso_da_chamada`): o convite tem de estar aberto e sem aviso
   ainda, e cada um sai uma vez só. Chamar de novo, ou com id inventado, não
   manda nada. Os ids são uuid v4 que só a tela do líder recebeu.

   Responde 200 com quantos avisos saíram: o convite já está no link da
   pessoa antes desta chamada. O aviso é um extra, nunca o caminho.
   ============================================================================= */
import { clienteDeServico, mandarParaTodos, pushConfigurado } from '@/lib/push';
import { mensagemDaChamada, type LinhaDaChamada } from '@/lib/aviso';
import { PRINCIPAL } from '@/lib/meu-token';
import { IGREJA } from '@/lib/igreja';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  let corpo: any = null;
  try { corpo = await req.json(); } catch { /* corpo inválido cai abaixo */ }
  const ids: unknown = corpo?.chamadas;
  if (!Array.isArray(ids) || !ids.length || ids.length > 10 || !ids.every(i => typeof i === 'string' && UUID.test(i))) {
    return Response.json({ erro: 'pedido inválido' }, { status: 400 });
  }
  if (!pushConfigurado()) return Response.json({ enviados: 0, motivo: 'sem chaves' });
  const s = clienteDeServico();
  if (!s) return Response.json({ enviados: 0, motivo: 'sem servico' });

  const envios: Parameters<typeof mandarParaTodos>[1] = [];
  for (const id of new Set(ids as string[])) {
    const { data, error } = await s.rpc('aviso_da_chamada', { p_chamada: id });
    if (error) return Response.json({ erro: 'banco', detalhe: error.message.slice(0, 200) }, { status: 500 });
    for (const l of (data || []) as (LinhaDaChamada & { endpoint: string; p256dh: string; auth: string })[]) {
      envios.push({
        aparelho: { endpoint: l.endpoint, p256dh: l.p256dh, auth: l.auth },
        msg: mensagemDaChamada(l, PRINCIPAL, IGREJA.cultoHora, IGREJA.followHora),
      });
    }
  }
  const conta = await mandarParaTodos(s, envios);
  return Response.json({ enviados: conta.ok, sumiram: conta.sumiu, falharam: conta.falhou });
}
