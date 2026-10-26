/* /api/robo/grupos · O QUE O ROBÔ DO WHATSAPP LÊ · 26/10/2026.

   GET ?equipe=<slug>&data=AAAA-MM-DD, com o cabeçalho
   Authorization: Bearer <ROBO_WHATSAPP_SEGREDO>.

   Só leitura. Carrega a escala do ministério com a mesma consulta do
   navegador (lib/ponte) e devolve o que o "Mandar nos grupos" mostra ao
   líder naquele dia, mais a cobrança com @ (lib/robo-grupos.ts). Não grava
   nada, não manda nada: quem posta é o robô, no MacBook do Arthur. */
import { createClient } from '@supabase/supabase-js';
import { addDias, funcoesDoDia, horaDoDia, linkDoVoluntario } from '@/lib/engine';
import { montarEstado, linhasDaEquipe, DIAS_DE_HISTORICO } from '@/lib/ponte';
import { cobrancaDoRobo, linhasDoRobo, preenchidosDoDia } from '@/lib/robo-grupos';
import { autorizado } from '@/lib/robo-segredo';
import { IGREJA } from '@/lib/igreja';

export const dynamic = 'force-dynamic';

/* o mesmo endereço do cron: o robô roda sem janela, e o link do grupo nasce
   no endereço definitivo (linkDoVoluntario já troca para guiaservir.com) */
const SITE = 'https://escalas.guiaservir.com';
const SEM_CACHE = { 'Cache-Control': 'no-store' };
const responde = (corpo: unknown, status = 200) => Response.json(corpo, { status, headers: SEM_CACHE });

function hojeSP() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function servico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qjtcaijhgldypudzyafz.supabase.co';
  const chave = process.env.SUPABASE_SERVICE_ROLE || '';
  return chave ? createClient(url, chave, { auth: { persistSession: false } }) : null;
}

export async function GET(req: Request) {
  if (!autorizado(req.headers.get('authorization'), process.env.ROBO_WHATSAPP_SEGREDO)) {
    return responde({ ok: false, erro: 'NAO_AUTORIZADO' }, 401);
  }
  const u = new URL(req.url);
  const slug = (u.searchParams.get('equipe') || '').trim();
  const data = (u.searchParams.get('data') || '').trim();
  if (!/^[a-z0-9-]{2,40}$/.test(slug) || !/^\d{4}-\d{2}-\d{2}$/.test(data) || Number.isNaN(Date.parse(data + 'T12:00:00Z'))) {
    return responde({ ok: false, erro: 'PEDIDO_INVALIDO' }, 400);
  }
  const s = servico();
  if (!s) return responde({ ok: false, erro: 'SEM_BANCO' }, 503);

  try {
    const r = await s.from('equipes').select('id, slug, nome').eq('slug', slug).maybeSingle();
    if (r.error) return responde({ ok: false, erro: 'BANCO' }, 502);
    if (!r.data) return responde({ ok: false, erro: 'EQUIPE_NAO_EXISTE' }, 404);
    const equipe = r.data as { id: string; slug: string; nome: string };

    const S = montarEstado(await linhasDaEquipe(s, equipe.id, addDias(hojeSP(), DIAS_DE_HISTORICO), equipe.nome));
    const link = linkDoVoluntario(SITE, equipe.slug, 'confirmar');
    const dia = S.escalas[data];
    const preenchidos = preenchidosDoDia(S, data);
    return responde({
      ok: true,
      equipe: { slug: equipe.slug, nome: equipe.nome },
      data,
      culto: {
        existe: !!dia,
        evento: dia?.evento || null,
        hora: horaDoDia(dia?.inicio, dia?.evento, data, IGREJA.cultoHora, IGREJA.followHora),
        postos: funcoesDoDia(S, data).length,
        preenchidos,
      },
      linhas: preenchidos ? linhasDoRobo(S, data, link) : [],
      cobranca: preenchidos ? cobrancaDoRobo(S, data, link) : null,
    });
  } catch {
    /* sem detalhe na resposta: o robô só precisa saber que não deu, e tenta depois */
    return responde({ ok: false, erro: 'FALHA_AO_LER' }, 502);
  }
}
