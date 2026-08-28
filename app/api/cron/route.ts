/* =============================================================================
   AUTOMAÇÃO DO CICLO MENSAL — roda no servidor, para TODOS os ministérios.

   Um cron diário (09:00 BRT) decide pela data e percorre cada equipe:
   · dia 20  → pedido de indisponibilidade do mês seguinte
   · dia 26  → MONTA a escala do mês seguinte de cada equipe (mesmo motor),
               idempotente: não sobrescreve o que o líder já montou
   · quinta  → pendentes do próximo domingo, com link de WhatsApp 1-toque

   Um email por ação (quando há RESEND_API_KEY), com uma seção por ministério.
   Sem a chave, o trabalho de banco acontece igual e aparece no app.
   ============================================================================= */
import { createClient } from '@supabase/supabase-js';
import {
  addDias, cultosAte, cultosDoMes, fmtDia, funcoesAtivas, gerarMes, msgColeta, msgEscala,
  tipoDoDia, vagasDe, nomeDe, MESES, Estado,
} from '@/lib/engine';
import { montarEstado, paraSalvarDia } from '@/lib/ponte';

export const dynamic = 'force-dynamic';
/* Domínio próprio desde 26/08. O antigo `escala-midia-iota.vercel.app` continua
   respondendo, mas todo link NOVO tem que nascer no endereço definitivo: link de
   grupo de WhatsApp vive em descrição por meses, e link que envelhece amarra o
   sistema ao host para sempre.
   O front não usa esta constante — ele deriva de window.location.origin, então
   segue o domínio por onde a pessoa entrou. Aqui é o cron, que roda sem janela. */
const SITE = 'https://escalas.guiaservir.com';

function dataSP() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(new Date());
  const g = (t: string) => p.find(x => x.type === t)?.value || '';
  return { iso: `${g('year')}-${g('month')}-${g('day')}`, diaMes: +g('day'),
    diaSemana: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(g('weekday')) };
}

function servico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qjtcaijhgldypudzyafz.supabase.co';
  const chave = process.env.SUPABASE_SERVICE_ROLE || '';
  return chave ? createClient(url, chave, { auth: { persistSession: false } }) : null;
}

async function estadoDaEquipe(s: any, equipe: any): Promise<Estado> {
  const equipeId = equipe.id;
  const desde = addDias(dataSP().iso, -200);   // histórico só o que a carga usa
  const [funcoes, vols, cultos, cfg] = await Promise.all([
    s.from('funcoes').select('*').eq('equipe_id', equipeId).order('ordem'),
    /* colunas explícitas: a 18 tirou `pin_hash` do GRANT. O cron usa service
       role e passaria por cima, mas `select *` aqui é uma armadilha esperando
       o dia em que este código rodar com outra credencial. */
    s.from('voluntarios')
      .select('id,nome,telefone,ativo,limite_mes,token,criado_em,equipe_id,conferido,email')
      .eq('equipe_id', equipeId).order('nome'),
    s.from('cultos').select('id,data').gte('data', desde).order('data'),
    s.from('config').select('*').eq('equipe_id', equipeId).maybeSingle(),
  ]);
  const funcaoIds = (funcoes.data || []).map((f: any) => f.id);
  const volIds = (vols.data || []).map((v: any) => v.id);
  const cultoIds = (cultos.data || []).map((c: any) => c.id);
  const [habs, indis, escs, plants, recados] = await Promise.all([
    volIds.length ? s.from('habilidades').select('*').in('voluntario_id', volIds) : { data: [] },
    volIds.length ? s.from('indisponibilidades').select('*').in('voluntario_id', volIds) : { data: [] },
    funcaoIds.length ? s.from('escalacoes').select('*').in('funcao_id', funcaoIds) : { data: [] },
    volIds.length ? s.from('plantoes').select('*').in('voluntario_id', volIds) : { data: [] },
    cultoIds.length ? s.from('culto_obs').select('*').eq('equipe_id', equipeId).in('culto_id', cultoIds) : { data: [] },
  ]);
  return montarEstado({
    funcoes: funcoes.data || [], voluntarios: vols.data || [], habilidades: (habs as any).data || [],
    indisponibilidades: (indis as any).data || [], cultos: cultos.data || [],
    escalacoes: (escs as any).data || [], plantoes: (plants as any).data || [],
    recados: (recados as any).data || [], config: cfg.data || null, equipe: equipe.nome,
  });
}

/* O cron roda com service role: o RLS não vale aqui, então o escopo por
   ministério tem que ser aplicado à mão. Antes esta função devolvia TODOS os
   emails e o email saía com o bloco de todos os ministérios — o organizador do
   Louvor receberia a escala da Mídia no bolso no dia em que a RESEND_API_KEY
   fosse ligada. Agora cada ministério só alcança quem enxerga aquele
   ministério: organizador global (equipe_id nulo) ou preso a ele. */
type Lider = { email: string; equipe_id: string | null };

async function lideresTodos(s: any): Promise<Lider[]> {
  const { data } = await s.from('lideres').select('email,equipe_id');
  return (data || []) as Lider[];
}
const paraEquipe = (ls: Lider[], equipeId: string) =>
  ls.filter(l => l.equipe_id === null || l.equipe_id === equipeId).map(l => l.email);
const soGlobais = (ls: Lider[]) =>
  ls.filter(l => l.equipe_id === null).map(l => l.email);
async function enviar(para: string[], assunto: string, corpo: string) {
  const chave = process.env.RESEND_API_KEY;
  if (!chave || !para.length) return { enviado: false, motivo: chave ? 'sem destinatário' : 'sem RESEND_API_KEY' };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Escala <onboarding@resend.dev>', to: para, subject: assunto, text: corpo }),
  });
  return { enviado: r.ok, motivo: r.ok ? 'ok' : `resend ${r.status}` };
}
const linkZap = (tel?: string, texto?: string) => {
  const n = String(tel || '').replace(/\D/g, '');
  return n ? `https://wa.me/${n.length <= 11 ? '55' + n : n}${texto ? `?text=${encodeURIComponent(texto)}` : ''}` : null;
};
const proxMes = (iso: string) => { const [a, m] = iso.split('-').map(Number); return m === 12 ? { ano: a + 1, mes: 1 } : { ano: a, mes: m + 1 }; };

/* ------------------------------------------------------------- rota --- */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const url = new URL(req.url);
  const forcarBearer = url.searchParams.get('secret'); // Vercel Cron manda header; ?secret= é atalho de teste
  if (!segredo || (auth !== `Bearer ${segredo}` && forcarBearer !== segredo)) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 });
  }
  const s = servico();
  if (!s) return Response.json({ erro: 'SUPABASE_SERVICE_ROLE ausente' }, { status: 500 });

  const { iso, diaMes, diaSemana } = dataSP();
  const forcar = url.searchParams.get('forcar'); // teste: coleta | mes | cobranca
  const fazColeta = forcar === 'coleta' || (!forcar && diaMes === 20);
  const fazMes = forcar === 'mes' || (!forcar && diaMes === 26);
  const fazCobranca = forcar === 'cobranca' || (!forcar && diaSemana === 4);

  const { data: equipes } = await s.from('equipes').select('*').order('ordem');
  const lideres = await lideresTodos(s);
  const rel: any = { hoje: iso, equipes: (equipes || []).length, acoes: [] };
  if (!equipes?.length) return Response.json({ ...rel, obs: 'nenhuma equipe' });

  // ---------- DIA 20: coleta ----------
  if (fazColeta) {
    const prox = proxMes(iso);
    /* um email POR ministério, para quem enxerga aquele ministério */
    const envios: any[] = [];
    for (const e of equipes) {
      const S = await estadoDaEquipe(s, e);
      if (!funcoesAtivas(S).length) continue;
      envios.push({
        equipe: e.nome,
        email: await enviar(paraEquipe(lideres, e.id),
          `${e.nome} · dia 20: pedir indisponibilidade de ${MESES[prox.mes - 1]}`,
          `Cole no grupo do ministério:\n\n${msgColeta(S, prox.ano, prox.mes, SITE)}`),
      });
    }
    rel.acoes.push({ acao: 'coleta', mes: `${prox.ano}-${String(prox.mes).padStart(2, '0')}`,
      ministerios: envios.length, envios });
  }

  // ---------- DIA 26: montar o mês de cada equipe ----------
  if (fazMes) {
    const prox = proxMes(iso);
    const dias = cultosDoMes(prox.ano, prox.mes);   // domingos + sábados do Follow
    const resumo: any[] = [];
    const blocos: { id: string; nome: string; vagas: number; texto: string }[] = [];
    const falhas: string[] = [];
    for (const e of equipes) {
      const S = await estadoDaEquipe(s, e);
      if (!S.voluntarios.filter(v => v.ativo).length || !funcoesAtivas(S).length) { resumo.push({ equipe: e.nome, pulado: 'sem time/funções ativas' }); continue; }
      const jaTem = dias.some(d => Object.values(S.escalas[d]?.slots || {}).some((x: any) => x?.vid));
      if (jaTem) { resumo.push({ equipe: e.nome, pulado: 'já tinha escala' }); continue; }
      const r = gerarMes(S, prox.ano, prox.mes, iso);
      let erro = '';
      for (const d of dias) {
        const params = paraSalvarDia(S, d, e.id);
        if (!params) continue;
        const { error } = await s.rpc('salvar_dia', params);
        if (error) { erro = `${d}: ${error.message}`; break; }
      }
      const vagas = r.reduce((a: number, x: any) => a + x.vagas.length, 0);
      resumo.push({ equipe: e.nome, vagas, erro: erro || undefined });
      if (erro) falhas.push(`${e.nome}: ${erro}`);
      else blocos.push({ id: e.id, nome: e.nome, vagas,
        texto: dias.map(d => msgEscala(S, d)).join('\n\n' + '-'.repeat(24) + '\n\n') });
    }
    /* falha de um ministério NÃO pode sumir: antes, o bloco dele simplesmente
       não entrava no email e o líder achava que estava tudo montado */
    /* um email por ministério, só para quem enxerga aquele ministério */
    const envios: any[] = [];
    for (const b of blocos) {
      envios.push({ equipe: b.nome,
        email: await enviar(paraEquipe(lideres, b.id),
          `${b.nome} · escala de ${MESES[prox.mes - 1]} montada${b.vagas ? ` (${b.vagas} vaga sem gente)` : ''}`,
          `Revise no app (${SITE}) e cole no grupo:\n\n${b.texto}`) });
    }
    /* falha de um ministério NÃO pode sumir. O alerta vai para o organizador
       GLOBAL: é ele quem conserta, e só ele pode ver nome de outro ministério. */
    const alerta = falhas.length
      ? await enviar(soGlobais(lideres), `[ATENÇÃO] ministério não montado em ${MESES[prox.mes - 1]}`,
          `\u26a0 NÃO MONTADO — resolva no app (${SITE}):\n${falhas.map(f => '• ' + f).join('\n')}`)
      : { enviado: false, motivo: 'nenhuma falha' };
    rel.acoes.push({ acao: 'montar-mes', mes: `${prox.ano}-${String(prox.mes).padStart(2, '0')}`,
      resumo, falhas, envios, alerta });
  }

  // ---------- QUINTA: cobrança dos cultos dos próximos 4 dias ----------
  /* 4 dias a partir da quinta alcança o sábado do Follow e o domingo. Mirar
     só no domingo deixava o Follow sem cobrança nenhuma. */
  if (fazCobranca) {
    const alvos = cultosAte(iso, 4);
    const porEquipe: Record<string, { nome: string; partes: string[] }> = {};
    const resumo: any[] = [];
    for (const data of alvos) {
      const rotulo = tipoDoDia(data) === 'follow' ? `Follow sáb ${fmtDia(data)}` : `domingo ${fmtDia(data)}`;
      for (const e of equipes) {
        const S = await estadoDaEquipe(s, e);
        const dia = S.escalas[data];
        if (!dia) continue;
        const pend = Object.entries(dia.slots).filter(([, sl]: any) => sl?.vid && (sl.status || 'pendente') === 'pendente');
        const vagas = vagasDe(S, data);
        if (!pend.length && !vagas.length) { resumo.push({ equipe: e.nome, culto: rotulo, ok: true }); continue; }
        resumo.push({ equipe: e.nome, culto: rotulo, pendentes: pend.length, vagas: vagas.length });
        const linhas = pend.map(([fn, sl]: any) => {
          const v = S.voluntarios.find(x => x.id === sl.vid);
          const texto = `${(v?.nome || '').split(' ')[0]}, você está na escala d${tipoDoDia(data) === 'follow' ? 'o Follow de sábado' : 'e domingo'} (${fmtDia(data)}) em ${fn}. Confirma? ${SITE}/eu/${v?.token}`;
          const zap = linkZap(v?.tel, texto);
          return `• ${nomeDe(S, sl.vid)} — ${fn}\n  ${zap ? `1 toque: ${zap}` : `sem telefone: ${SITE}/eu/${v?.token}`}`;
        }).join('\n\n');
        porEquipe[e.id] = porEquipe[e.id] || { nome: e.nome, partes: [] };
        porEquipe[e.id].partes.push(`### ${rotulo} ###\n${linhas}${vagas.length ? `\n\nVAGA sem ninguém: ${vagas.join(', ')} — resolva no app.` : ''}`);
      }
    }
    /* um email por ministério: a lista de pendentes carrega NOME e LINK PESSOAL
       de cada voluntário. Mandar isso para o organizador de outro ministério é
       entregar o acesso do time dele a um estranho. */
    const envios: any[] = [];
    for (const [id, b] of Object.entries(porEquipe)) {
      envios.push({ equipe: b.nome,
        email: await enviar(paraEquipe(lideres, id),
          `${b.nome} · pendentes de ${alvos.map(d => fmtDia(d)).join(' e ')}`,
          `Cada link abre o WhatsApp da pessoa com a cobrança digitada. Só apertar enviar.\n\n${b.partes.join('\n\n' + '='.repeat(34) + '\n\n')}`) });
    }
    rel.acoes.push({ acao: 'cobranca', cultos: alvos, resumo, envios });
  }

  if (!rel.acoes.length) rel.acoes = 'nada agendado para hoje';
  return Response.json(rel);
}
