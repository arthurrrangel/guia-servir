/* A ROTA DOS PEDIDOS AO ROBÔ, SEM O NEXT · 26/10/2026.

   O corpo de /api/robo/pedidos (app/api/robo/pedidos/route.ts), separado da
   rota para o teste executar de verdade, com um banco de mentira
   (scripts/robo-pedidos.test.mjs): o Next não deixa um route.ts exportar
   outra coisa além dos métodos.

   POST com o cabeçalho Authorization: Bearer <ROBO_WHATSAPP_SEGREDO>. O
   robô do WhatsApp (no MacBook do Arthur) chama a cada minuto com:
     · batimento: conectado ao WhatsApp, pausado, versão e os ministérios que
       ele sabe mandar (a tela mostra "robô ligado" por aqui);
     · relatos: o que ele fez com os pedidos (enviando, enviado, falhou).
   A resposta leva os pedidos abertos ("mandar a escala de tal dia agora"),
   que o líder fez pelo botão do "Mandar nos grupos" (robo_pedir, 115).

   A ORDEM DE CADA PASSADA (cada passo com o motivo):
     1. o batimento: lê a passada anterior antes de gravar esta;
     2. os relatos finais (mandou, não deu): a verdade do robô vale sempre,
        para pedido ainda aberto; pedido já fechado não volta;
     3. o robô que volta de mais de 3 minutos fora do ar não manda o que
        esperou: a tela disse ao líder "robô desligado, mande à mão";
     4. vence o que não vale mais: dia que passou, pendente há mais de 30
        minutos, envio parado há mais de 30 minutos;
     5. o "estou mandando": o robô só manda o pedido que conseguiu marcar
        aqui (`aplicados` volta com o que a marca alcançou). Pedido que
        venceu, ou que um segundo toque fechou, não sai;
     6. os pedidos abertos, para a próxima. */
import { autorizado } from '@/lib/robo-segredo';
import {
  lerCorpoDoRobo, VALIDADE_DO_PEDIDO_MIN, ROBO_LIGADO_ATE_S, MOTIVO_VENCIDO, MOTIVO_DIA_PASSOU, MOTIVO_PAROU, MOTIVO_ROBO_FORA,
} from '@/lib/robo-pedidos';

const SEM_CACHE = { 'Cache-Control': 'no-store' };
const responde = (corpo: unknown, status = 200) => Response.json(corpo, { status, headers: SEM_CACHE });
const ABERTOS = ['pendente', 'enviando'];
const motivo = (resumo: string) => ({ resumo, grupos: [], avisos: [] });

function diaSP(d: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
}

/* o pedaço do cliente do Supabase que a rota usa (o teste passa um de mentira) */
type Banco = { from: (tabela: string) => any };

export async function atenderOPedidoDoRobo(
  req: Request, segredo: string | undefined, abrirBanco: () => Banco | null, agora: Date = new Date(),
): Promise<Response> {
  if (!autorizado(req.headers.get('authorization'), segredo)) {
    return responde({ ok: false, erro: 'NAO_AUTORIZADO' }, 401);
  }
  const bruto = await req.text().catch(() => '');
  if (!bruto || bruto.length > 100_000) return responde({ ok: false, erro: 'PEDIDO_INVALIDO' }, 400);
  let json: unknown;
  try { json = JSON.parse(bruto); } catch { return responde({ ok: false, erro: 'PEDIDO_INVALIDO' }, 400); }
  const corpo = lerCorpoDoRobo(json);
  if (!corpo) return responde({ ok: false, erro: 'PEDIDO_INVALIDO' }, 400);

  const s = abrirBanco();
  if (!s) return responde({ ok: false, erro: 'SEM_BANCO' }, 503);

  try {
    const agoraIso = agora.toISOString();
    const fechar = (resumo: string) => ({ status: 'falhou', resultado: motivo(resumo), atualizado_em: agoraIso });

    /* 1 · o batimento, sabendo de quando era o anterior */
    const ant = await s.from('robo_estado').select('visto_em').eq('id', 1).limit(1);
    if (ant.error) return responde({ ok: false, erro: 'BANCO' }, 502);
    const antes = Date.parse((ant.data as { visto_em: string | null }[] | null)?.[0]?.visto_em || '');
    const voltou = !Number.isFinite(antes) || agora.getTime() - antes > ROBO_LIGADO_ATE_S * 1000;
    const b = corpo.batimento;
    const est = await s.from('robo_estado').upsert({
      id: 1, visto_em: agoraIso, conectado: b.conectado, pausado: b.pausado, versao: b.versao, ministerios: b.ministerios,
    });
    if (est.error) return responde({ ok: false, erro: 'BANCO' }, 502);

    const vistos: string[] = [];
    const aplicados: string[] = [];
    const relatar = async (r: (typeof corpo.relatos)[number]) => {
      const u = await s.from('robo_pedidos')
        .update(r.status === 'enviando'
          ? { status: 'enviando', atualizado_em: agoraIso }
          : { status: r.status, resultado: r.resultado, atualizado_em: agoraIso })
        .eq('id', r.id).in('status', ABERTOS).select('id');
      if (u.error) return false;
      vistos.push(r.id);
      if ((u.data || []).length) aplicados.push(r.id);
      return true;
    };

    /* 2 · o que o robô fez */
    for (const r of corpo.relatos.filter(x => x.status !== 'enviando')) {
      if (!(await relatar(r))) return responde({ ok: false, erro: 'BANCO' }, 502);
    }

    /* 3 · o robô que volta não manda o que esperou; 4 · o que venceu */
    const limite = new Date(agora.getTime() - VALIDADE_DO_PEDIDO_MIN * 60_000).toISOString();
    const vencer = [
      ...(voltou ? [
        () => s.from('robo_pedidos').update(fechar(MOTIVO_ROBO_FORA)).eq('status', 'pendente'),
        () => s.from('robo_pedidos').update(fechar(MOTIVO_PAROU)).eq('status', 'enviando'),
      ] : []),
      () => s.from('robo_pedidos').update(fechar(MOTIVO_DIA_PASSOU)).eq('status', 'pendente').lt('data', diaSP(agora)),
      () => s.from('robo_pedidos').update(fechar(MOTIVO_PAROU)).eq('status', 'enviando').lt('data', diaSP(agora)),
      () => s.from('robo_pedidos').update(fechar(MOTIVO_VENCIDO)).eq('status', 'pendente').lt('criado_em', limite),
      () => s.from('robo_pedidos').update(fechar(MOTIVO_PAROU)).eq('status', 'enviando').lt('atualizado_em', limite),
    ];
    for (const q of vencer) {
      const v = await q();
      if (v.error) return responde({ ok: false, erro: 'BANCO' }, 502);
    }

    /* 5 · "estou mandando": só o que ainda está aberto (e, depois do passo
       4, dentro do prazo) */
    for (const r of corpo.relatos.filter(x => x.status === 'enviando')) {
      if (!(await relatar(r))) return responde({ ok: false, erro: 'BANCO' }, 502);
    }

    /* 6 · os abertos */
    const abertos = await s.from('robo_pedidos').select('id, equipe_id, data, status, criado_em')
      .in('status', ABERTOS).order('criado_em', { ascending: true }).limit(5);
    if (abertos.error) return responde({ ok: false, erro: 'BANCO' }, 502);
    const linhas = (abertos.data || []) as { id: string; equipe_id: string; data: string; status: string; criado_em: string }[];
    const ids = [...new Set(linhas.map(l => l.equipe_id))];
    const slugs = new Map<string, string>();
    if (ids.length) {
      const eq = await s.from('equipes').select('id, slug').in('id', ids);
      if (eq.error) return responde({ ok: false, erro: 'BANCO' }, 502);
      for (const e of (eq.data || []) as { id: string; slug: string }[]) slugs.set(e.id, e.slug);
    }
    const pedidos = linhas
      .filter(l => slugs.has(l.equipe_id))
      .map(l => ({ id: l.id, equipe: slugs.get(l.equipe_id)!, data: l.data, status: l.status, criado_em: l.criado_em }));
    return responde({ ok: true, agora: agoraIso, voltou, vistos, aplicados, pedidos });
  } catch {
    /* sem detalhe na resposta: o robô só precisa saber que não deu, e tenta depois */
    return responde({ ok: false, erro: 'FALHA' }, 502);
  }
}
