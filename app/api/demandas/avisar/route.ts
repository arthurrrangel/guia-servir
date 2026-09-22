/* O AVISO DE DEMANDA NOVA SAI DAQUI.

   O pedido: "Queria mandar no email da pessoa que recebe a demanda o aviso de
   nova demanda. Pra ela ter algum formato de aviso."

   ---------------------------------------------------------------------------
   POR QUE ESTA ROTA EXISTE, E NAO SO O CRON

   `vercel.json` tem UM cron, `0 12 * * *`: uma vez por dia, 9h no Rio. Uma
   demanda aberta as 10h da manha so seria avisada no dia seguinte, e um aviso
   que chega 23 horas depois nao e aviso, e arquivo. O plano nao da mais
   frequencia, entao o caminho principal e a chamada na hora, feita pela tela
   logo depois de a demanda nascer, e o cron vira a REDE: pega o que a rede
   derrubou, a aba fechada, o celular que perdeu o sinal no estacionamento.

   Os dois nunca se atropelam porque quem decide o que falta e o BANCO
   (`demandas.a_avisar`, migracao 90) e o carimbo e atomico
   (`demandas.marcar_avisado`). Chamar duas vezes no mesmo segundo manda uma
   vez so.

   ---------------------------------------------------------------------------
   QUEM PODE CHAMAR

     · o robo do cron, com `Authorization: Bearer $CRON_SECRET`
     · qualquer membro do sistema de demandas, com o token pessoal dele

   O segundo assusta menos do que parece: a varredura e IDEMPOTENTE e nao
   devolve nada sobre as demandas — so quantas sairam. Quem chama nao escolhe
   destinatario, nao escolhe texto e nao le email de ninguem. O pior que um
   membro mal-intencionado consegue e fazer sair, um pouco mais cedo, um aviso
   que ia sair de qualquer jeito.

   O que NAO pode e ser aberta: sem nenhuma checagem, virava um gatilho de
   envio de email para quem achasse a URL.

   ---------------------------------------------------------------------------
   O QUE ELA NAO FAZ

   Nao le a tabela de membros por fora do banco, nao monta consulta propria e
   nao decide quem recebe: isso e da migracao 90, onde da para conferir com
   SQL. Aqui so se transforma jsonb em texto de email. */

import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://guiaservir.com';

function servidor() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const chave = process.env.SUPABASE_SERVICE_ROLE || '';
  return url && chave ? createClient(url, chave, { auth: { persistSession: false } }) : null;
}

/* O MESMO `enviar` do cron, e de proposito NAO compartilhado.

   Compartilhar exigiria mover a funcao para `lib/`, e `app/api/cron/route.ts`
   e o coracao do sistema de ESCALAS. A regra do Arthur, de 21/09: os dois
   sistemas nao se encostam. Vinte linhas duplicadas custam menos que um
   import que amarra os dois — e o dia em que o email das escalas mudar de
   remetente, o das demandas nao muda junto sem ninguem decidir. */
async function enviar(para: string[], assunto: string, corpo: string) {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) return { enviado: false, motivo: 'sem RESEND_API_KEY' };
  if (!para.length) return { enviado: false, motivo: 'sem destinatário' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Demandas GUIA <onboarding@resend.dev>',
        to: para, subject: assunto, text: corpo,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    return { enviado: r.ok, motivo: r.ok ? 'ok' : `resend ${r.status}` };
  } catch (e) {
    return { enviado: false, motivo: `rede: ${String((e as Error)?.message || e).slice(0, 80)}` };
  }
}

type Aviso = {
  id: string; numero: number; titulo: string; categoria: string; grupo: string;
  prioridade: string; prazo: string | null; abriu: string | null; setor: string | null;
  criada_em: string; falta_aprovacao: boolean;
  para: { nome: string | null; email: string }[];
};

/* O TEXTO.

   Curto de proposito, e sem HTML: o que a pessoa precisa saber no aviso e o
   que E, de QUEM, para QUANDO, e o link. O resto ela le na ficha. Email de
   sistema que conta a vida inteira da demanda ensina a nao ler email de
   sistema.

   O PORTAO APARECE AQUI porque muda o que a pessoa deve fazer AGORA: sem essa
   linha, quem atende abre a ficha, encontra todos os botoes fora, e conclui
   que o sistema quebrou. */
function texto(d: Aviso) {
  const quando = d.prazo
    ? new Date(d.prazo + 'T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : 'sem data definida';
  const urgente = d.prioridade === 'urgente' || d.prioridade === 'alta';
  return [
    `${d.abriu || 'Alguém'} abriu uma demanda para ${d.setor || 'o seu setor'}.`,
    '',
    `#${d.numero} · ${d.titulo}`,
    `${d.grupo} · ${d.categoria}`,
    `Prazo: ${quando}${urgente ? `  ·  Prioridade ${d.prioridade}` : ''}`,
    '',
    d.falta_aprovacao
      ? 'Esta demanda precisa de aprovação da liderança antes de andar. Você não precisa fazer nada ainda.'
      : 'Abra para assumir, pedir informação ou mandar para outro setor.',
    '',
    `${BASE}/demandas/d/${d.numero}`,
    '',
    '— GUIA Church · sistema de demandas',
  ].join('\n');
}

function assunto(d: Aviso) {
  const marca = d.prioridade === 'urgente' ? '[URGENTE] ' : '';
  return `${marca}Demanda #${d.numero}: ${String(d.titulo).slice(0, 80)}`;
}

async function podeChamar(req: Request, s: ReturnType<typeof servidor>) {
  const auth = req.headers.get('authorization') || '';
  const segredo = process.env.CRON_SECRET;
  if (segredo && auth === `Bearer ${segredo}`) return 'cron';

  /* o token pessoal vem no corpo ou no cabecalho, NUNCA na URL: URL vai para
     log de servidor, para o Referer e para o historico do navegador, e este
     token e uma senha. A mesma regra que `lib/demandas/api.ts` ja segue. */
  const t = (req.headers.get('x-demandas-token') || '').trim();
  if (!t || !s) return null;
  const { data, error } = await s.rpc('dem_quem_sou', { p_token: t });
  if (error) return null;
  return (data as { ok?: boolean })?.ok ? 'membro' : null;
}

async function varrer(req: Request) {
  const s = servidor();
  if (!s) return Response.json({ erro: 'SUPABASE_SERVICE_ROLE ausente' }, { status: 500 });

  const quem = await podeChamar(req, s);
  if (!quem) return Response.json({ erro: 'nao autorizado' }, { status: 401 });

  const { data, error } = await s.schema('demandas').rpc('a_avisar', { p_limite: 50 });
  if (error) return Response.json({ erro: error.message }, { status: 500 });

  const fila = (data || []) as Aviso[];
  const feitos: string[] = [];
  const semDestino: string[] = [];
  const falhou: { numero: number; motivo: string }[] = [];

  for (const d of fila) {
    const para = (d.para || []).map(p => p.email).filter(Boolean);
    if (!para.length) { semDestino.push(d.id); continue; }
    const r = await enviar(para, assunto(d), texto(d));
    /* FALHA DE EMAIL NAO CARIMBA. E a diferenca entre "tentei e nao deu" e
       "dei por avisado": sem isso, um `resend 429` de um minuto ruim faria a
       demanda nunca mais ser avisada, e ninguem ficaria sabendo. Fica para a
       proxima varredura. */
    if (r.enviado) feitos.push(d.id);
    else falhou.push({ numero: d.numero, motivo: r.motivo });
  }

  if (feitos.length) await s.schema('demandas').rpc('marcar_avisado', { p_ids: feitos, p_motivo: null });
  if (semDestino.length) {
    await s.schema('demandas').rpc('marcar_avisado', {
      p_ids: semDestino, p_motivo: 'o setor responsavel nao tem ninguem com email cadastrado',
    });
  }

  return Response.json({
    ok: true, por: quem,
    naFila: fila.length, avisadas: feitos.length,
    semDestinatario: semDestino.length,
    /* as falhas viajam na resposta em vez de sumirem num log que ninguem le */
    falhas: falhou,
  });
}

export async function POST(req: Request) { return varrer(req); }
/* o cron do Vercel chama com GET */
export async function GET(req: Request) { return varrer(req); }
