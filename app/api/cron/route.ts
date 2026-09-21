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
  addDias, cultosAte, diasDoMes, fmtDia, funcoesAtivas, funcoesDoDia, gerarMes, msgColeta, msgEscala,
  tipoDoDia, nomeDe, MESES, Estado, decisaoDoRobo, avisarDiaSemNinguem, bancoAtrasado, proxMes,
  cobrarDoDia,
} from '@/lib/engine';
import { montarEstado, paraSalvarDia, linhasDaEquipe, inteira, CONTA, DIAS_DE_HISTORICO } from '@/lib/ponte';

export const dynamic = 'force-dynamic';

/* O TEMPO LIMITE DESTA ROTA ERA UM NÚMERO QUE NÃO ESTAVA EM LUGAR NENHUM.

   19/09/2026. Sem `maxDuration`, o limite é o padrão da plataforma: ele não
   está neste arquivo, não está em `vercel.json`, e muda quando o plano muda
   ou quando a Vercel muda o padrão. Ou seja, o tempo que o robô das 9h tem
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
  const r = inteira(await s.from('lideres').select('email,equipe_id', CONTA), 'lideres');
  if (r.error) throw r.error;
  return (r.data || []) as Lider[];
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
/* `proxMes` mora em lib/engine.ts desde 20/09: ele decide qual mês o robô
   monta, e o painel usa a mesma conta. Duas cópias divergirem e o líder
   montar outubro enquanto o robô monta novembro. */

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

  /* O BANCO PRECISA ESTAR NA VERSÃO QUE ESTE CÓDIGO ASSUME — 21/09/2026.

     `schema_versao` e `exige_versao_ate` existem desde a 55, e até hoje só as
     MIGRAÇÕES os consultavam, uma à outra. Nenhuma linha de `app/` ou `lib/`
     lia a régua. Só que `PUBLICAR.md:190` diz, com todas as letras, que os
     dois atos são separados: "As migrações em `supabase/` são do Arthur: ele
     cola e roda. O site não pode depender de uma migração que ainda não
     rodou." O `vercel --prod` e o `psql` acontecem em momentos diferentes, e
     entre um e outro o robô roda com o código novo sobre o banco velho.

     Medido em 21/09: com o código de hoje e o banco na 60 (`salvar_dia` ainda
     na versão da 54), o robô criou um culto fantasma numa quinta-feira de
     evento, gravou dez pessoas nele, deixou o evento vazio, e respondeu
     HTTP 200 com zero falhas. Exatamente o estrago que a 61 existe para
     consertar.

     A régua vale para a PRÓXIMA migração tanto quanto para aquela. Então o
     robô passa a conferir antes de escrever: banco atrás do mínimo, ele não
     faz nada, diz por quê, e devolve 500 — que é alto e reversível, ao
     contrário de escrever torto em silêncio.

     Banco À FRENTE do código é normal e não é erro: migração aplicada antes
     do deploy é a ordem recomendada. Por isso a conta é `>=`, não `=`.

     QUANDO MEXER AQUI: subiu uma migração de que o robô depende? Este número
     sobe no mesmo commit. */
  /* QUE DIA É HOJE, E O QUE HOJE PEDE — 82.

     Estas cinco linhas moravam DEPOIS da conferência da régua. Subiram porque
     o aviso de "banco atrasado" precisa saber qual trabalho está sendo
     perdido hoje para poder dizer como recuperá-lo, e porque são cálculo
     puro: não leem o banco, não escrevem nada, e não podem falhar. */
  const { iso, diaMes, diaSemana } = dataSP();
  const forcar = url.searchParams.get('forcar'); // teste: coleta | mes | cobranca
  const fazColeta = forcar === 'coleta' || (!forcar && diaMes === 20);
  const fazMes = forcar === 'mes' || (!forcar && diaMes === 26);
  const fazCobranca = forcar === 'cobranca' || (!forcar && diaSemana === 4);

  const VERSAO_MINIMA_DO_BANCO = 66;
  {
    const { data: regua, error: erroRegua } = await s
      .from('schema_versao').select('n').order('n', { ascending: false }).limit(1);
    if (erroRegua) {
      return Response.json(
        { erro: 'não consegui ler a régua do banco (schema_versao)', detalhe: erroRegua.message },
        { status: 500 });
    }
    const noBanco = regua?.[0]?.n as number | undefined;
    if (bancoAtrasado(noBanco, VERSAO_MINIMA_DO_BANCO)) {
      /* ================================================== 82 ================
         "O ROBÔ VOLTA SOZINHO NA PRÓXIMA EXECUÇÃO" ERA FALSO.

         O cron roda UMA VEZ POR DIA (vercel.json: `0 12 * * *`), e o que ele
         faz depende do dia: coleta no dia 20, escala do mês no dia 26,
         cobrança na quinta. A próxima execução é AMANHÃ — e amanhã não é dia
         20, nem dia 26, nem quinta.

         Então: banco atrasado no dia 26 e consertado no dia 27 significa que
         o mês NÃO FOI MONTADO e não será. A execução seguinte roda, não
         encontra nada agendado para o dia, e devolve 200 dizendo "nada
         agendado para hoje" — o mais parecido com sucesso que existe.

         A mensagem dizia o contrário e mandava o organizador esperar. Agora
         ela nomeia o trabalho perdido e o caminho de mão para recuperá-lo. */
      const perdido = [
        fazColeta   && ['a coleta de disponibilidade do dia 20', 'coleta'],
        fazMes      && ['a montagem da escala do mês (dia 26)', 'mes'],
        fazCobranca && ['a cobrança de quinta', 'cobranca'],
      ].filter(Boolean) as [string, string][];
      const m = `O banco está na migração ${noBanco ?? 0} e este código precisa da ${VERSAO_MINIMA_DO_BANCO}. `
              + `Não escrevi nada: rodar sobre banco atrasado grava escala no lugar errado, em silêncio. `
              + `Aplique as migrações que faltam no Supabase.`
              + (perdido.length
                  ? ` ATENÇÃO: hoje era dia de ${perdido.map(([r]) => r).join(' e ')}, e isso NÃO volta sozinho — `
                    + `o robô roda uma vez por dia e amanhã não é este dia. Depois de aplicar, abra à mão: `
                    + perdido.map(([, q]) => `${SITE}/api/cron?forcar=${q}`).join(' e ') + '.'
                  : ` Hoje não havia trabalho agendado, então nada se perdeu.`);
      /* o aviso é melhor-esforço: se a leitura de `lideres` também falhar
         (e ela LANÇA de propósito), o que não pode acontecer é a mensagem
         específica virar um 500 genérico e a causa se perder no log. */
      try { await enviar(soGlobais(await lideresTodos(s)), '[ATENÇÃO] o robô parou: banco atrasado', '\u26a0 ' + m); }
      catch { /* o corpo da resposta abaixo continua dizendo tudo */ }
      return Response.json({ erro: 'banco atrasado', banco: noBanco ?? 0, minimo: VERSAO_MINIMA_DO_BANCO, detalhe: m },
                           { status: 500 });
    }
  }


  /* SEM ESTAS DUAS LEITURAS NÃO HÁ TRABALHO POSSÍVEL, E FALHAR CALADO É PIOR
     QUE NÃO RODAR.

     `from('equipes')` descartava `error` do mesmo jeito. Com `equipes` nulo, a
     linha de baixo devolvia `{obs:'nenhuma equipe'}` com HTTP 200 — e o dia 26
     passava sem a escala do mês ser montada, sem e-mail, sem alerta, com a
     Vercel registrando sucesso. O líder descobria no dia 1º, olhando o app
     vazio. Agora isso estoura, vira 500 no `catch` lá embaixo, e 500 é o
     único sinal que a plataforma já sabe ler sem instalar nada. */
  const { data: equipes, error: erroEquipes } =
    inteira(await s.from('equipes').select('*', CONTA).order('ordem'), 'equipes');
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
      if (erro) {
        /* QUEM CONSERTA O MÊS DO LOUVOR É O LÍDER DO LOUVOR — 21/09/2026.

           O envio ao líder morava só no `else`, então bastava UM dia recusado
           para o líder daquele ministério não receber nada: nem "montada",
           nem "faltou um dia". O único aviso ia para o organizador GLOBAL, e
           a mensagem do caso 'parcial' ainda dizia "abra o app e use
           Remontar" — instrução dirigida a quem lidera aquele ministério,
           entregue a quem não é ele.

           Sete de oito dias gravados é o estado que MAIS precisa de e-mail, e
           era o único que não gerava nenhum. */
        falhas.push(`${e.nome}: ${erro}`);
        envios.push({ equipe: e.nome, parcial: true,
          email: await enviar(paraEquipe(lideres, e.id),
            `${e.nome} · a escala de ${MESES[prox.mes - 1]} ficou incompleta`,
            `Montei o mês, menos o que está abaixo. Abra o app (${SITE}), confira estes dias e complete à mão:\n\n`
            + errosDoDia.map(x => '• ' + x).join('\n')) });
      }
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
    /* ==================================================== 82 ===============
       DUAS COISAS DIFERENTES DIVIDIAM UM ARRAY SÓ.

       `falhas` recebia as duas: "não carreguei o estado do Connect" e
       "ninguém está escalado no Follow". E `falhas.length` é o que faz a
       rota devolver HTTP 500 (última linha do arquivo).

       São estados opostos. O primeiro é o robô falhando: aquele ministério
       ficou SEM cobrança, e ninguém sabe o que tem lá. O segundo é o robô
       funcionando: ele olhou, viu que não tem ninguém, e AVISOU — a cobrança
       saiu, com o aviso dentro.

       Juntos, o segundo levava o cron para vermelho por estado normal, e o
       e-mail de alerta dizia "Não consegui carregar estes ministérios, e
       eles ficaram SEM cobrança" sobre ministérios que receberam a cobrança
       inteira. O organizador que fosse conferir encontraria o e-mail no
       lugar e não entenderia o alarme.

       Agora são dois. `falhas` derruba o status; `semNinguem` não. */
    const falhas: string[] = [];
    const semNinguem: string[] = [];
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
      /* é um culto REGULAR (domingo ou Follow), pelo mesmo calendário que
         `diasDoMes` usa para montar o mês? Se não é, o dia só está em `alvos`
         porque é evento de ALGUM ministério, e aí o silêncio abaixo é certo. */
      const regular = !nomeEvento;
      for (const e of equipes) {
        const S = estados.get(e.id);
        if (!S) continue;
        const dia = S.escalas[data];
        if (!dia) {
          /* O PIOR ESTADO ERA O ÚNICO MUDO — 21/09/2026, auditoria do robô.

             `if (!dia) continue` estava certo pelo motivo escrito acima: dia
             que outro ministério montou não é problema deste. Só que
             `montarEstado` (lib/ponte.ts) também não materializa um domingo
             REGULAR quando a equipe não tem NADA nele — e essa é uma decisão
             de tela ("não mostrar 7 funções sem ninguém e sumir com o botão
             de montar"), que o cron herdou como silêncio.

             O resultado, medido: um domingo em que o robô falhou ao gravar
             não aparecia em NENHUM lugar da cobrança de quinta. A cobrança
             existe exatamente para ninguém descobrir o furo no sábado, e ela
             era muda sobre "ninguém escalado", que é o furo inteiro.

             Este aviso não carrega nome nem link de ninguém, então ele pode
             ir também para o organizador global — ao contrário da lista de
             pendentes logo abaixo. */
          /* 82 · `funcoesAtivas` era o ministério INTEIRO; `funcoesDoDia` é
             este dia. Medido: Connect tem 18 postos ativos e ZERO no Follow,
             Kids 9 e zero, Livraria 2 e zero. Com a conta velha, os três
             recebiam "monte a escala deste dia" todo sábado de Follow, para
             sempre, e o cron ficava 500 por causa disso. */
          const temPostosNesteDia =
            !!S.voluntarios.filter(v => v.ativo).length && !!funcoesDoDia(S, data).length;
          if (!avisarDiaSemNinguem(regular, temPostosNesteDia)) continue;
          resumo.push({ equipe: e.nome, culto: rotulo, ninguem: true });
          semNinguem.push(`${e.nome}: NINGUÉM está escalado em ${rotulo}.`);
          porEquipe[e.id] = porEquipe[e.id] || { nome: e.nome, partes: [] };
          porEquipe[e.id].partes.push(
            `### ${rotulo} ###\nNINGUÉM ESTÁ ESCALADO neste culto. Abra o app (${SITE}) e monte a escala deste dia.`);
          continue;
        }
        /* ==================================================== 82 =============
           QUEM DISSE "NÃO POSSO" SUMIA DA COBRANÇA.

           Era `pend = slots com vid e status 'pendente'` mais
           `vagas = vagasDe(...)`, que é posto SEM ninguém. Um posto cujo
           ocupante apertou "não posso" tem `vid` (não é vaga) e não está
           `pendente` (não é pendência): caía no vão entre as duas e não
           aparecia em lugar nenhum da cobrança de quinta.

           É o PIOR dos três estados. O pendente ainda pode confirmar, a vaga
           ainda pode ser preenchida — este já foi respondido: a pessoa avisou
           que não vem, o posto continua no nome dela, e ninguém está sendo
           procurado. `furou` é o mesmo buraco com o domingo passado dentro.

           `cobrarDoDia` (lib/engine.ts) separa os três, porque eles pedem
           recados diferentes: pendente é cobrança À PESSOA, recusado e vaga
           são recado AO LÍDER — não há o que cobrar de quem já respondeu. */
        const { pendentes, vagou, vagas } = cobrarDoDia(S, data);
        if (!pendentes.length && !vagou.length && !vagas.length) {
          resumo.push({ equipe: e.nome, culto: rotulo, ok: true }); continue;
        }
        resumo.push({ equipe: e.nome, culto: rotulo,
                      pendentes: pendentes.length, vagou: vagou.length, vagas: vagas.length });
        const linhas = pendentes.map(({ funcao: fn, vid }) => {
          const v = S.voluntarios.find(x => x.id === vid);
          const onde = nomeEvento ? `o ${nomeEvento}`
            : tipoDoDia(data) === 'follow' ? 'o Follow de sábado' : 'e domingo';
          const texto = `${(v?.nome || '').trim()}, você está na escala d${onde} (${fmtDia(data)}) em ${fn}. Confirma? ${SITE}/eu/${v?.token}`;
          const zap = linkZap(v?.tel, texto);
          return `• ${nomeDe(S, vid)} — ${fn}\n  ${zap ? `1 toque: ${zap}` : `sem telefone: ${SITE}/eu/${v?.token}`}`;
        }).join('\n\n');
        /* o bloco de quem já respondeu que não vem. Sem link de cobrança de
           propósito: mandar "confirma?" para quem acabou de dizer que não
           pode é o robô não ter lido a resposta. */
        const saiu = vagou.map(({ funcao: fn, vid, status }) =>
          `• ${fn} — ${nomeDe(S, vid)} ${status === 'furou' ? 'FUROU' : 'disse que NÃO PODE'}, e o posto continua no nome dela.`
        ).join('\n');
        porEquipe[e.id] = porEquipe[e.id] || { nome: e.nome, partes: [] };
        porEquipe[e.id].partes.push(
          `### ${rotulo} ###`
          + (linhas ? `\n${linhas}` : '')
          + (saiu ? `\n\nPRECISA DE TROCA (já responderam, ninguém está procurando):\n${saiu}` : '')
          + (vagas.length ? `\n\nVAGA sem ninguém: ${vagas.join(', ')} — resolva no app.` : ''));
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
    /* falha de carga vai para o organizador global, como no dia 26.

       82 · e diz só o que é verdade. Antes este e-mail levava junto as linhas
       de "ninguém está escalado", com o texto "ficaram SEM cobrança" por
       cima — sobre ministérios que tinham recebido a cobrança inteira, com o
       aviso dentro dela. O alarme contradizia o e-mail que estava na caixa
       ao lado. */
    const alertaCob = falhas.length
      ? await enviar(soGlobais(lideres), `[ATENÇÃO] cobrança de quinta incompleta`,
          `\u26a0 Não consegui carregar estes ministérios, e eles ficaram SEM cobrança:\n${falhas.map(f => '• ' + f).join('\n')}`)
      : { enviado: false, motivo: 'nenhuma falha' };
    /* "ninguém escalado" é o robô FUNCIONANDO, e por isso tem e-mail próprio
       e não derruba o status. O aviso já foi para o líder do ministério junto
       com a cobrança dele; este é o resumo para quem organiza o geral. */
    const alertaVazio = semNinguem.length
      ? await enviar(soGlobais(lideres), `[ATENÇÃO] culto sem ninguém escalado`,
          `\u26a0 A cobrança saiu normalmente. Estes cultos estão SEM NINGUÉM, e cada líder recebeu o aviso no e-mail dele:\n${semNinguem.map(f => '• ' + f).join('\n')}`)
      : { enviado: false, motivo: 'nenhum culto vazio' };
    rel.acoes.push({ acao: 'cobranca', cultos: alvos, resumo, envios,
                     falhas, alerta: alertaCob,
                     semNinguem, alertaVazio });
  }

  if (!rel.acoes.length) rel.acoes = 'nada agendado para hoje';
  /* O STATUS PRECISA DIZER A VERDADE.

     A rota devolvia 200 mesmo quando um ministério não foi montado, e a
     Vercel guarda o status — não o corpo. Um dia 26 que falhou parcialmente
     ficava indistinguível de um que deu certo.

     Conta só `falhas`, NUNCA `pulado`: "sem time/funções ativas" e "já tinha
     escala" são estados normais, e um cron que fica vermelho todo dia por
     estado normal é um cron que ninguém olha mais em duas semanas.

     82 · E NUNCA `semNinguem`, pelo mesmo motivo. Ele morava dentro de
     `falhas`, e com a conta de postos errada (ver `avisarDiaSemNinguem`)
     isso deixava o cron VERMELHO toda quinta-feira, para sempre, porque o
     Connect não serve no sábado de Follow. Duas semanas disso e o 500 vira
     papel de parede — e aí o 500 de verdade, o do dia 26 que não montou a
     escala do mês, chega e ninguém olha.

     A régua: 500 é "o robô não fez o trabalho". "Ninguém está escalado" é o
     robô tendo feito o trabalho e contado o que viu. */
  const falhou = Array.isArray(rel.acoes)
    && rel.acoes.some((a: any) => Array.isArray(a?.falhas) && a.falhas.length);
  return Response.json(rel, { status: falhou ? 500 : 200 });
}
