import { cont } from '@/lib/plural';
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
  addDias, cultosAte, diasDoMes, fmtDia, funcoesAtivas, gerarMes, msgColeta, msgEscala,
  tipoDoDia, vagasDe, nomeDe, MESES, Estado, decisaoDoRobo,
} from '@/lib/engine';
import { montarEstado, paraSalvarDia, linhasDaEquipe, DIAS_DE_HISTORICO } from '@/lib/ponte';

export const dynamic = 'force-dynamic';

/* O TEMPO LIMITE DESTA ROTA ERA UM NÚMERO QUE NÃO ESTAVA EM LUGAR NENHUM.

   19/09/2026. Sem `maxDuration`, o limite é o padrão da plataforma: ele não
   está neste arquivo, não está em `vercel.json`, e muda quando o plano muda
   ou quando a Vercel muda o padrão. Ou seja, o tempo que o robô das 3h tem
   para rodar era decidido por fora do repositório, sem ninguém saber qual era.

   O que esta rota faz, por equipe, em SÉRIE: cerca de dez consultas, mais
   `gerarMes`, mais um `salvar_dia` por culto. Com quatro ministérios isso
   cabe folgado; o custo cresce a cada ministério novo, e `gerarMes` sozinho
   já foi medido em 6,5 segundos num caso de 40 postos.

   300 é o teto do plano Pro e dá margem de sobra para o crescimento previsto.
   O que importa mais que o número é ele estar ESCRITO: quando um dia o robô
   for cortado no meio, o primeiro lugar em que alguém vai olhar é aqui, e
   agora tem o que ler. Se a conta for Hobby, a plataforma corta antes — e aí
   o limite aparece no log como tal, em vez de virar mistério. */
export const maxDuration = 300;
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
  /* MESMA consulta que o navegador faz, pela mesma função. Antes eram duas
     cópias e o cron buscava uma tabela a menos — ver `linhasDaEquipe`. */
  const desde = addDias(dataSP().iso, DIAS_DE_HISTORICO);
  return montarEstado(await linhasDaEquipe(s, equipe.id, desde, equipe.nome));
}

/* O cron roda com service role: o RLS não vale aqui, então o escopo por
   ministério tem que ser aplicado à mão. Antes esta função devolvia TODOS os
   emails e o email saía com o bloco de todos os ministérios — o organizador do
   Louvor receberia a escala da Mídia no bolso no dia em que a RESEND_API_KEY
   fosse ligada. Agora cada ministério só alcança quem enxerga aquele
   ministério: organizador global (equipe_id nulo) ou preso a ele. */
type Lider = { email: string; equipe_id: string | null };

/* LEITURA QUE FALHA TEM QUE FALHAR.

   Esta função descartava `error`. supabase-js não lança em erro do
   PostgREST — devolve `{data: null, error}` —, então um 5xx passageiro
   virava `[]`, e `[]` aqui significa "nenhum líder existe". A partir daí
   `paraEquipe` devolve lista vazia, TODO envio responde "sem destinatário", e
   o alerta de `[ATENÇÃO] ministério não montado` também vai para ninguém. O
   mês é gravado certinho no banco e NINGUÉM é avisado de nada.

   É a mesma lição que `lib/ponte.ts` já tinha aprendido e escrito: "lista
   vazia não é ninguém, é não sei. Quem chama decide o que fazer com isso;
   ninguém decide nada com um vazio que mente." A lição estava aplicada lá
   dentro e não aqui, na rota que roda sozinha às 9h sem ninguém olhando. */
async function lideresTodos(s: any): Promise<Lider[]> {
  const { data, error } = await s.from('lideres').select('email,equipe_id');
  if (error) throw error;
  return (data || []) as Lider[];
}
const paraEquipe = (ls: Lider[], equipeId: string) =>
  ls.filter(l => l.equipe_id === null || l.equipe_id === equipeId).map(l => l.email);
const soGlobais = (ls: Lider[]) =>
  ls.filter(l => l.equipe_id === null).map(l => l.email);
async function enviar(para: string[], assunto: string, corpo: string) {
  const chave = process.env.RESEND_API_KEY;
  if (!chave || !para.length) return { enviado: false, motivo: chave ? 'sem destinatário' : 'sem RESEND_API_KEY' };
  /* 14/09/2026: o fetch pode REJEITAR (DNS, rede), não só responder mal. Sem o
     try, o primeiro email que falhasse estourava a rota inteira DEPOIS de as
     escalas já estarem no banco: nenhum líder recebia nada, o alerta de
     "não montado" não saía, e no dia seguinte o jaTem pulava tudo — os emails
     simplesmente nunca aconteciam. Falha de email é dado do relatório, não
     exceção. */
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Escala <onboarding@resend.dev>', to: para, subject: assunto, text: corpo }),
      signal: AbortSignal.timeout(15_000),
    });
    return { enviado: r.ok, motivo: r.ok ? 'ok' : `resend ${r.status}` };
  } catch (e) {
    return { enviado: false, motivo: `rede: ${String((e as Error)?.message || e).slice(0, 80)}` };
  }
}
const linkZap = (tel?: string, texto?: string) => {
  const n = String(tel || '').replace(/\D/g, '');
  return n ? `https://wa.me/${n.length <= 11 ? '55' + n : n}${texto ? `?text=${encodeURIComponent(texto)}` : ''}` : null;
};
const proxMes = (iso: string) => { const [a, m] = iso.split('-').map(Number); return m === 12 ? { ano: a + 1, mes: 1 } : { ano: a, mes: m + 1 }; };

/* ------------------------------------------------------------- rota --- */
/* O SEGREDO SAIU DA URL.
   Antes esta rota também aceitava `?secret=<CRON_SECRET>`, comentado como
   "atalho de teste". O atalho estava em produção, e o que ele abre é a única
   coisa do sistema que roda com SUPABASE_SERVICE_ROLE — a chave que passa por
   cima de toda política de RLS.

   Query string não é lugar de credencial. Ela fica gravada no log de requisição
   da Vercel (visível no painel), no histórico do navegador, na barra de
   endereço, e vai junto no cabeçalho Referer de qualquer link clicado a partir
   dali. Um segredo que já apareceu numa URL deve ser considerado conhecido.

   O Vercel Cron manda `Authorization: Bearer`, então nada muda para o robô.
   Para testar à mão:
     curl -H "Authorization: Bearer $CRON_SECRET" https://guiaservir.com/api/cron?forcar=coleta

   Se este segredo já foi usado em URL alguma vez, gire o CRON_SECRET na Vercel. */
export async function GET(req: Request) {
  try { return await rodar(req); }
  catch (e: any) {
    /* EXCEÇÃO AQUI NÃO PODE VIRAR TELA PADRÃO DO FRAMEWORK.

       Qualquer leitura que agora estoura (ver `lideresTodos` e a leitura de
       `equipes`) precisa chegar como 500 COM MOTIVO no corpo, para o log da
       Vercel guardar o que aconteceu. Sem isto, o throw viraria um
       "Internal Server Error" seco e a informação morreria. */
    return Response.json(
      { erro: 'o cron falhou', detalhe: String(e?.message || e).slice(0, 300) },
      { status: 500 },
    );
  }
}

async function rodar(req: Request) {
  const segredo = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  const url = new URL(req.url);
  if (!segredo || auth !== `Bearer ${segredo}`) {
    return Response.json({ erro: 'não autorizado' }, { status: 401 });
  }
  const s = servico();
  if (!s) return Response.json({ erro: 'SUPABASE_SERVICE_ROLE ausente' }, { status: 500 });

  const { iso, diaMes, diaSemana } = dataSP();
  const forcar = url.searchParams.get('forcar'); // teste: coleta | mes | cobranca
  const fazColeta = forcar === 'coleta' || (!forcar && diaMes === 20);
  const fazMes = forcar === 'mes' || (!forcar && diaMes === 26);
  const fazCobranca = forcar === 'cobranca' || (!forcar && diaSemana === 4);

  /* SEM ESTAS DUAS LEITURAS NÃO HÁ TRABALHO POSSÍVEL, E FALHAR CALADO É PIOR
     QUE NÃO RODAR.

     `from('equipes')` descartava `error` do mesmo jeito. Com `equipes` nulo, a
     linha de baixo devolvia `{obs:'nenhuma equipe'}` com HTTP 200 — e o dia 26
     passava sem a escala do mês ser montada, sem e-mail, sem alerta, com a
     Vercel registrando sucesso. O líder descobria no dia 1º, olhando o app
     vazio. Agora isso estoura, vira 500 no `catch` lá embaixo, e 500 é o
     único sinal que a plataforma já sabe ler sem instalar nada. */
  const { data: equipes, error: erroEquipes } = await s.from('equipes').select('*').order('ordem');
  if (erroEquipes) throw erroEquipes;
  const lideres = await lideresTodos(s);
  const rel: any = { hoje: iso, equipes: (equipes || []).length, acoes: [] };
  if (!equipes?.length) return Response.json({ ...rel, obs: 'nenhuma equipe' });

  // ---------- DIA 20: coleta ----------
  if (fazColeta) {
    const prox = proxMes(iso);
    /* um email POR ministério, para quem enxerga aquele ministério */
    const envios: any[] = [];
    const falhas: string[] = [];
    for (const e of equipes) {
      /* uma equipe que não carrega não pode calar as outras quatro */
      try {
        const S = await estadoDaEquipe(s, e);
        if (!funcoesAtivas(S).length) continue;
        envios.push({
          equipe: e.nome,
          email: await enviar(paraEquipe(lideres, e.id),
            `${e.nome} · dia 20: pedir indisponibilidade de ${MESES[prox.mes - 1]}`,
            `Cole no grupo do ministério:\n\n${msgColeta(S, prox.ano, prox.mes, SITE)}`),
        });
      } catch (err) {
        falhas.push(`${e.nome}: ${String((err as Error)?.message || err).slice(0, 120)}`);
      }
    }
    rel.acoes.push({ acao: 'coleta', mes: `${prox.ano}-${String(prox.mes).padStart(2, '0')}`,
      ministerios: envios.length, envios, falhas });
  }

  // ---------- DIA 26: montar o mês de cada equipe ----------
  if (fazMes) {
    const prox = proxMes(iso);
    /* OS DIAS SAEM DE DENTRO DO LAÇO, E O MOTIVO É UM DEFEITO MEDIDO — 20/09.

       Aqui era `cultosDoMes(prox.ano, prox.mes)`, calculado UMA vez antes do
       laço: aritmética pura de domingos mais sábados de Follow. Só que
       `gerarMes` usa `diasDoMes` (engine.ts:962), que inclui os eventos
       esporádicos da 54. As duas listas divergiam, e a divergência custava
       duas coisas de uma vez:

         · o dia do evento era SORTEADO e nunca GRAVADO, porque o laço de
           gravação percorria `dias` (sem evento). Medido com um evento numa
           quinta: três pessoas escaladas em memória, zero linhas no banco;
         · e quem foi escalado no evento GASTOU a vaga do mês mesmo assim
           (`escalasNoMes` conta o dia do evento, engine.ts:381), então um
           domingo terminava vazio por causa de um dia que nunca existiu.
           Medido: mesma equipe, mesmo mês, só criando o evento — o domingo
           31/10 passou de completo para uma vaga aberta.

       `diasDoMes` precisa do estado, que só existe depois de
       `estadoDaEquipe`. Por isso a lista passa a ser por equipe: cada
       ministério tem os seus eventos, e é assim que a tela já fazia
       (app/escala/page.tsx:91). */
    const resumo: any[] = [];
    const blocos: { id: string; nome: string; vagas: number; texto: string }[] = [];
    const falhas: string[] = [];
    const envios: any[] = [];
    for (const e of equipes) {
      /* 14/09/2026: a carga do estado agora LANÇA quando qualquer leitura
         falha (lib/ponte.ts). É de propósito: antes, escalação que não carregava
         virava "não tem escala", e daí gerarMes + salvar_dia apagavam o mês.
         Aqui a falha vira linha em `falhas`, o organizador global recebe o
         alerta, e as outras equipes seguem. Nada é escrito no banco de uma
         equipe cujo estado não se sabe. */
      let S: Estado;
      try { S = await estadoDaEquipe(s, e); }
      catch (err) {
        const m = `${e.nome}: não carregou o estado (${String((err as Error)?.message || err).slice(0, 100)})`;
        resumo.push({ equipe: e.nome, erro: m }); falhas.push(m); continue;
      }
      if (!S.voluntarios.filter(v => v.ativo).length || !funcoesAtivas(S).length) { resumo.push({ equipe: e.nome, pulado: 'sem time/funções ativas' }); continue; }
      /* "JÁ TINHA ESCALA" PRECISA DISTINGUIR QUEM MONTOU.

         O guarda existe para não passar por cima do que o líder montou à mão,
         e isso está certo. Mas ele olhava `.some(...)`: BASTAVA UM dia com
         gente. Se o dia 26 falhasse no terceiro dos sete cultos, dois ficavam
         gravados e cinco não — e rodar de novo não consertava, porque agora
         "já tinha escala" era verdade. O mês ficava permanentemente pela
         metade até alguém montar na mão.

         Agora são três casos, e o do meio é o que faltava:
           · nenhum dia montado  → monta o mês;
           · TODOS montados      → não toca (é o guarda original);
           · alguns montados     → não monta sozinho, mas AVISA, porque
             completar por conta própria re-sortearia o que o líder pôs à mão
             (`gerarDia` só respeita o que está travado ou confirmado). */
      /* por equipe, porque os eventos são de UM ministério (migração 54) */
      const dias = diasDoMes(S, prox.ano, prox.mes);
      const montados = dias.filter(d => Object.values(S.escalas[d]?.slots || {}).some((x: any) => x?.vid));
      /* a regra mora em lib/engine.ts (`decisaoDoRobo`), com o motivo escrito
         e com teste: ela é o que segura a divergência de gravação explicada
         mais abaixo, e regra load-bearing não pode viver solta dentro de um
         `if` no meio de um laço */
      const decisao = decisaoDoRobo(montados.length, dias.length);
      if (decisao === 'ja-tem') { resumo.push({ equipe: e.nome, pulado: 'já tinha escala' }); continue; }
      if (decisao === 'parcial') {
        const m = `${e.nome}: mês pela metade (${montados.length} de ${dias.length} dias já têm gente). Não montei sozinho para não re-sortear o que já está lá — abra o app e use "Remontar".`;
        resumo.push({ equipe: e.nome, pulado: 'mês parcial', dias: `${montados.length}/${dias.length}` });
        falhas.push(m);
        continue;
      }
      const r = gerarMes(S, prox.ano, prox.mes, iso);
      /* UM DIA RUIM NÃO PODE IMPEDIR OS OUTROS SEIS.

         Era `break`: o primeiro `salvar_dia` recusado abortava o laço e os
         dias seguintes nem eram tentados. Um gatilho que recusa um domingo
         específico (alguém avisou que não pode) levava o mês inteiro junto.
         Agora cada dia é tentado, e os erros são acumulados para o alerta. */
      /* POR QUE AQUI USA `salvar_dia` E A TELA NÃO — 19/09/2026.

         São dois caminhos de gravação diferentes para a mesma coisa, e isso
         normalmente seria um defeito:

           · a tela usa `salvarDia` (lib/db.ts), que calcula a DIFERENÇA
             (`planoDoDia`) e toca só no que mudou. Ela precisa disso porque
             regravar uma linha que não mudou fazia o gatilho recusar quem
             tinha avisado "não posso" depois de escalado — o caso do João
             Victor, 17/09 — e porque a ordem entre apagar e inserir importa
             na permuta (19/09);

           · aqui usa a RPC `salvar_dia`, que APAGA a escala inteira da equipe
             naquele domingo e regrava.

         A divergência é segura por UM motivo, e só por ele: o laço acima só
         chega aqui quando `montados.length === 0`, ou seja, quando NENHUM dia
         do mês tem gente. Não há o que preservar, então diferença e
         wipe-and-write dão o mesmo resultado.

         ⚠️  O GUARDA DE `montados` É O QUE SEGURA ISSO. Se alguém um dia
         afrouxar aquele `if` para o robô completar mês pela metade, este
         laço passa a apagar o que o líder pôs à mão — e nenhum teste daqui
         vai acusar, porque o teste que protege a gravação cirúrgica
         (`scripts/escala-diff.test.mjs`) só cobre o caminho da tela.
         Afrouxou o guarda? Troque este `rpc('salvar_dia')` por `salvarDia`
         ANTES, não depois. */
      const errosDoDia: string[] = [];
      for (const d of dias) {
        const params = paraSalvarDia(S, d, e.id);
        if (!params) continue;
        const { error } = await s.rpc('salvar_dia', params);
        if (error) errosDoDia.push(`${d}: ${error.message}`);
      }
      const erro = errosDoDia.join(' | ');
      const vagas = r.reduce((a: number, x: any) => a + x.vagas.length, 0);
      resumo.push({ equipe: e.nome, vagas, erro: erro || undefined });
      if (erro) falhas.push(`${e.nome}: ${erro}`);
      else {
        /* O EMAIL SAI AQUI DENTRO, E NÃO DEPOIS DO LAÇO — 20/09/2026.

           Auditoria de backend. Os blocos eram acumulados e enviados só no
           fim, e essa ordem tinha um modo de falhar sem volta: o laço grava
           no banco por equipe, mas o envio dependia do laço INTEIRO terminar.

           Dez ministérios, corte por `maxDuration` no sexto:
             1. cinco meses já estão gravados no banco;
             2. o handler morre antes do envio: NENHUM email sai, nem os de
                escala montada, nem o `[ATENÇÃO] não montado`;
             3. no dia 27 `fazMes` é falso, então não há segunda chance;
             4. no dia 26 seguinte, os cinco gravados caem em 'ja-tem' e o
                email deles nunca acontece;
             5. os cinco que faltaram ficam sem escala E sem alerta.

           Ou seja, o único sinal que a plataforma sabe emitir sumia
           justamente na falha que o `maxDuration` existe para tornar visível.
           Enviando por equipe, um corte custa os que faltaram, não todos. */
        const texto = dias.map(d => msgEscala(S, d)).join('\n\n' + '-'.repeat(24) + '\n\n');
        blocos.push({ id: e.id, nome: e.nome, vagas, texto });
        envios.push({ equipe: e.nome,
          email: await enviar(paraEquipe(lideres, e.id),
            `${e.nome} · escala de ${MESES[prox.mes - 1]} montada${vagas ? ` (${cont(vagas, 'vaga', 'vagas')} sem gente)` : ''}`,
            `Revise no app (${SITE}) e cole no grupo:\n\n${texto}`) });
      }
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
    const porEquipe: Record<string, { nome: string; partes: string[] }> = {};
    const resumo: any[] = [];
    const falhas: string[] = [];
    /* 14/09/2026: o estado de cada equipe é carregado UMA vez, não uma vez por
       data. Eram 5 datas × 5 equipes = 25 cargas de ~10 consultas cada, para um
       dado que só depende da equipe. E a carga que falha vira linha em
       `falhas`, em vez de derrubar a cobrança de todo mundo. */
    const estados = new Map<string, Estado>();
    for (const e of equipes) {
      try { estados.set(e.id, await estadoDaEquipe(s, e)); }
      catch (err) { falhas.push(`${e.nome}: não carregou o estado (${String((err as Error)?.message || err).slice(0, 100)})`); }
    }

    /* O ROBÔ DE QUINTA NUNCA COBRAVA UM EVENTO — 20/09/2026.

       Esta linha era `const alvos = cultosAte(iso, 4)`, e `cultosAte` só
       produz domingos e sábados de Follow: nunca um dia de evento. Ou seja, o
       robô do dia 26 montava a escala do GUIA Empreendedor na quinta e, na
       quinta anterior ao evento, ninguém era cobrado. E era silencioso: o
       relatório do cron não mencionava o evento porque ele não estava na
       lista.

       É a mesma classe de divergência que o bloco do dia 26 já tinha
       consertado, doze dias atrás, trocando `cultosDoMes` por `diasDoMes`
       porque as duas listas discordavam. Aqui não tinha sido replicada.

       Os dias de evento saem dos ESTADOS já carregados, um por equipe, e
       entram na mesma janela de 4 dias. O laço de baixo já ignora dia que a
       equipe não tem (`if (!dia) continue`), então o evento do Connect não
       cobra ninguém do Louvor. */
    const ate = addDias(iso, 4);
    const alvos = [...new Set([
      ...cultosAte(iso, 4),
      ...[...estados.values()].flatMap(S => Object.keys(S.escalas)
        .filter(d => S.escalas[d]?.evento && d >= iso && d <= ate)),
    ])].sort();

    for (const data of alvos) {
      /* o rótulo do evento sai do estado de quem o tem; se ninguém tiver
         (não acontece, mas o tipo permite), cai no rótulo do dia da semana */
      const nomeEvento = [...estados.values()]
        .map(S => S.escalas[data]?.evento).find(Boolean);
      const rotulo = nomeEvento ? `${nomeEvento} · ${fmtDia(data)}`
        : tipoDoDia(data) === 'follow' ? `Follow sáb ${fmtDia(data)}` : `domingo ${fmtDia(data)}`;
      for (const e of equipes) {
        const S = estados.get(e.id);
        if (!S) continue;
        const dia = S.escalas[data];
        if (!dia) continue;
        const pend = Object.entries(dia.slots).filter(([, sl]: any) => sl?.vid && (sl.status || 'pendente') === 'pendente');
        const vagas = vagasDe(S, data);
        if (!pend.length && !vagas.length) { resumo.push({ equipe: e.nome, culto: rotulo, ok: true }); continue; }
        resumo.push({ equipe: e.nome, culto: rotulo, pendentes: pend.length, vagas: vagas.length });
        const linhas = pend.map(([fn, sl]: any) => {
          const v = S.voluntarios.find(x => x.id === sl.vid);
          const onde = nomeEvento ? `o ${nomeEvento}`
            : tipoDoDia(data) === 'follow' ? 'o Follow de sábado' : 'e domingo';
          const texto = `${(v?.nome || '').trim()}, você está na escala d${onde} (${fmtDia(data)}) em ${fn}. Confirma? ${SITE}/eu/${v?.token}`;
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
    /* falha de carga vai para o organizador global, como no dia 26 */
    const alertaCob = falhas.length
      ? await enviar(soGlobais(lideres), `[ATENÇÃO] cobrança de quinta incompleta`,
          `\u26a0 Não consegui carregar estes ministérios, e eles ficaram SEM cobrança:\n${falhas.map(f => '• ' + f).join('\n')}`)
      : { enviado: false, motivo: 'nenhuma falha' };
    rel.acoes.push({ acao: 'cobranca', cultos: alvos, resumo, envios, falhas, alerta: alertaCob });
  }

  if (!rel.acoes.length) rel.acoes = 'nada agendado para hoje';
  /* O STATUS PRECISA DIZER A VERDADE.

     A rota devolvia 200 mesmo quando um ministério não foi montado, e a
     Vercel guarda o status — não o corpo. Um dia 26 que falhou parcialmente
     ficava indistinguível de um que deu certo.

     Conta só `falhas`, NUNCA `pulado`: "sem time/funções ativas" e "já tinha
     escala" são estados normais, e um cron que fica vermelho todo dia por
     estado normal é um cron que ninguém olha mais em duas semanas. */
  const falhou = Array.isArray(rel.acoes)
    && rel.acoes.some((a: any) => Array.isArray(a?.falhas) && a.falhas.length);
  return Response.json(rel, { status: falhou ? 500 : 200 });
}
