/* =============================================================================
   O AVISO DA TROCA — 104, 01/10/2026

   A tela do voluntário chama esta rota logo depois de pedir troca (avisa
   quem recebeu) e logo depois de responder (avisa quem pediu). Quem decide
   se há aviso a mandar é o BANCO (`aviso_da_troca`): o token tem de ser de
   quem pediu (ou de quem respondeu), o pedido tem de estar no estado certo,
   e cada aviso sai uma vez só. Chamar de novo, ou com token de outra
   pessoa, não manda nada.

   Responde 200 sempre que a pergunta faz sentido, com quantos avisos
   saíram: a tela não mostra nada disso, e a troca já aconteceu no banco
   antes desta chamada. O aviso é um extra, nunca o caminho.
   ============================================================================= */
import { clienteDeServico, mandarParaTodos, pushConfigurado } from '@/lib/push';
import { mensagemDaTroca, type LinhaDaTroca } from '@/lib/aviso';
import { tokenValido, PRINCIPAL } from '@/lib/meu-token';
import { IGREJA } from '@/lib/igreja';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  let corpo: any = null;
  try { corpo = await req.json(); } catch { /* corpo inválido cai abaixo */ }
  const token = corpo?.token, troca = corpo?.troca, evento = corpo?.evento;
  if (!tokenValido(token) || typeof troca !== 'string' || !UUID.test(troca)
      || (evento !== 'pedido' && evento !== 'resposta')) {
    return Response.json({ erro: 'pedido inválido' }, { status: 400 });
  }
  if (!pushConfigurado()) return Response.json({ enviados: 0, motivo: 'sem chaves' });
  const s = clienteDeServico();
  if (!s) return Response.json({ enviados: 0, motivo: 'sem servico' });

  const { data, error } = await s.rpc('aviso_da_troca', { p_token: token, p_troca: troca, p_evento: evento });
  if (error) return Response.json({ erro: 'banco', detalhe: error.message.slice(0, 200) }, { status: 500 });
  const linhas = (data || []) as (LinhaDaTroca & { endpoint: string; p256dh: string; auth: string })[];
  const conta = await mandarParaTodos(s, linhas.map(l => ({
    aparelho: { endpoint: l.endpoint, p256dh: l.p256dh, auth: l.auth },
    msg: mensagemDaTroca(l, PRINCIPAL, IGREJA.cultoHora, IGREJA.followHora),
  })));
  return Response.json({ enviados: conta.ok, sumiram: conta.sumiu, falharam: conta.falhou });
}
