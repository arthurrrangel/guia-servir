/* =============================================================================
   O LEMBRETE DE ESCALA NO CELULAR — 104, 01/10/2026

   Uma vez por dia (vercel.json), para quem ligou o aviso: a escala de daqui
   a 3 dias e a de amanhã, com "falta você confirmar" quando falta. Quem
   escolhe o que mandar é o banco (`avisos_para_lembrar`), que marca o que
   devolve: rodar duas vezes no mesmo dia não repete aviso nenhum.

   Mesma porta do robô de /api/cron: só com `Authorization: Bearer
   $CRON_SECRET`. Sem as chaves do aviso no Vercel, não faz nada e diz isso.
   ============================================================================= */
import { clienteDeServico, mandarParaTodos, pushConfigurado } from '@/lib/push';
import { mensagemDoLembrete, type LinhaDoLembrete } from '@/lib/aviso';
import { PRINCIPAL } from '@/lib/meu-token';
import { IGREJA } from '@/lib/igreja';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

function hojeEmSaoPaulo() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date());
  const g = (t: string) => p.find(x => x.type === t)?.value || '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || req.headers.get('authorization') !== `Bearer ${segredo}`) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 });
  }
  if (!pushConfigurado()) return Response.json({ enviados: 0, motivo: 'sem as chaves do aviso no Vercel' });
  const s = clienteDeServico();
  if (!s) return Response.json({ erro: 'SUPABASE_SERVICE_ROLE ausente' }, { status: 500 });

  const hoje = hojeEmSaoPaulo();
  const { data, error } = await s.rpc('avisos_para_lembrar', { p_hoje: hoje });
  if (error) return Response.json({ erro: 'banco', detalhe: error.message.slice(0, 200) }, { status: 500 });
  const linhas = (data || []) as (LinhaDoLembrete & { endpoint: string; p256dh: string; auth: string })[];
  const conta = await mandarParaTodos(s, linhas.map(l => ({
    aparelho: { endpoint: l.endpoint, p256dh: l.p256dh, auth: l.auth },
    msg: mensagemDoLembrete(l, PRINCIPAL, IGREJA.cultoHora, IGREJA.followHora),
  })));
  return Response.json({ hoje, avisos: linhas.length, enviados: conta.ok, sumiram: conta.sumiu, falharam: conta.falhou });
}
