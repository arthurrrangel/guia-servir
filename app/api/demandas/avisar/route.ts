/* OS AVISOS DE DEMANDA SAEM DAQUI.

   O pedido: "Queria mandar no email da pessoa que recebe a demanda o aviso de
   nova demanda. Pra ela ter algum formato de aviso."

   ---------------------------------------------------------------------------
   POR QUE ESTA ROTA EXISTE, E NÃO SÓ O CRON

   `vercel.json` tem UM cron, `0 12 * * *`: uma vez por dia, 9h no Rio. Uma
   demanda aberta às 10h da manhã só seria avisada no dia seguinte, e um aviso
   que chega 23 horas depois não é aviso, é arquivo. O plano não dá mais
   frequência, então o caminho principal é a chamada na hora, feita pela tela
   logo depois de a demanda nascer, e o cron vira a REDE: pega o que a rede
   derrubou, a aba fechada, o celular que perdeu o sinal no estacionamento.

   Os dois nunca se atropelam porque quem decide o que falta é o BANCO, e ele
   RESERVA o que entrega: `public.dem_avisos_pendentes` marca as linhas que
   devolve, então duas varreduras simultâneas não pegam o mesmo aviso.

   ---------------------------------------------------------------------------
   POR QUE AS CHAMADAS NÃO TÊM `.schema('demandas')`, E ISSO É LOAD-BEARING

   A versão anterior chamava `s.schema('demandas').rpc('a_avisar')`. Medido em
   produção, 22/09/2026:

     · a API do Supabase expõe `public` e `graphql_public`, e mais nada: o
       schema `demandas` nunca esteve na lista;
     · `has_schema_privilege('service_role','demandas','usage')` = false.

   Ou seja: as duas chamadas falhavam SEMPRE. `avisado_em` nunca foi carimbado
   e nenhum aviso saiu, nem pela tela nem pelo cron. A rota respondia 500 com o
   erro do PostgREST e ninguém lia. Todo o resto do sistema fala com funções
   `public.dem_*` justamente por isso; a migração 90 quebrou o padrão e a 91 o
   recolocou. Se alguém puser `.schema(...)` de volta aqui, o sistema de avisos
   volta a ser um cano tampado que responde 200 para quem olha de longe.

   ---------------------------------------------------------------------------
   QUEM PODE CHAMAR

     · o robô do cron, com `Authorization: Bearer $CRON_SECRET`
     · qualquer membro do sistema de demandas, com o token pessoal dele

   O segundo assusta menos do que parece: a varredura é IDEMPOTENTE e não
   devolve nada sobre as demandas, só quantas saíram. Quem chama não escolhe
   destinatário, não escolhe texto e não lê e-mail de ninguém. O pior que um
   membro mal-intencionado consegue é fazer sair, um pouco mais cedo, um aviso
   que ia sair de qualquer jeito.

   O que NÃO pode é ser aberta: sem nenhuma checagem, virava um gatilho de
   envio de e-mail para quem achasse a URL.

   ---------------------------------------------------------------------------
   O QUE ELA NÃO FAZ

   Não lê a tabela de membros por fora do banco, não monta consulta própria e
   não decide quem recebe: isso é da migração 91, onde dá para conferir com
   SQL. Aqui só se transforma jsonb em texto de e-mail.

   `scripts/demandas-avisar.test.mjs` EXECUTA esta rota com um Supabase e um
   Resend de mentira. Sete sabotagens ficavam verdes no `npm test` antes dele. */

import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://guiaservir.com';

function servidor() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const chave = process.env.SUPABASE_SERVICE_ROLE || '';
  return url && chave ? createClient(url, chave, { auth: { persistSession: false } }) : null;
}

/* TÍTULO COM CRLF CHEGAVA INTEIRO AO ASSUNTO E AO CORPO.

   Medido em 22/09/2026: `dem_abrir` aceita o título

       "Arte do culto\r\nBcc: espiao@malicioso.com"

   e o aviso saía com assunto de duas linhas e, dentro do corpo, uma linha
   forjada com cara de campo do sistema. `demandas.limpo()` não pega isso: ela
   apara invisível nas PONTAS, e o estrago está no MEIO.

   Aqui todo campo que veio de gente digitando passa por esta função antes de
   ser interpolado: título, quem abriu, setor, categoria, grupo e a nota. Troca
   por espaço qualquer coisa que quebre linha ou finja largura (controle, NBSP,
   espaços tipográficos, U+2028 e U+2029), apaga largura-zero, junta o que
   sobrou e corta no teto. Uma linha entra, uma linha sai. */
function umaLinha(v: unknown, teto = 160): string {
  return String(v ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/g, ' ')
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, teto)
    .trim();
}

/* endereço que não é endereço não vira tentativa eterna: ver `permanentes` em
   `varrer`. A conferência é de forma, não de existência, e é só isso que dá
   para saber sem mandar. */
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

/* O MESMO `enviar` do cron, e de propósito NÃO compartilhado.

   Compartilhar exigiria mover a função para `lib/`, e `app/api/cron/route.ts`
   é o coração do sistema de ESCALAS. A regra do Arthur, de 21/09: os dois
   sistemas não se encostam. Vinte linhas duplicadas custam menos que um import
   que amarra os dois, e o dia em que o e-mail das escalas mudar de remetente,
   o das demandas não muda junto sem ninguém decidir.

   `text:` e nunca `html:`. Título e nota são texto que o usuário digita; num
   corpo HTML interpolado sem escapar, `<img src=x onerror=...>` e um `<a>`
   para outro domínio viajam dentro de um e-mail que parece ser do sistema. */
/* O REMETENTE — 22/09/2026.

   Era `onboarding@resend.dev`, o endereço de TESTE da Resend, e ela só
   entrega o que sai dele para o dono da conta. Ou seja: nenhum aviso chegava
   em ninguém do setor, e a fila marcava como enviado.

   O domínio `avisos.guiaservir.com` foi cadastrado na Resend em 22/09
   (região sa-east-1). Enquanto os registros de DNS não validam, a Resend
   recusa esse remetente com 403 e uma frase sobre o domínio não verificado —
   e SÓ nesse caso o envio tenta de novo pelo endereço de teste. Assim, subir
   este código antes ou depois de o DNS validar dá no mesmo, e o dia em que
   validar ninguém precisa voltar aqui. Qualquer outra recusa (chave errada,
   limite, e-mail inválido) não ganha segunda tentativa: repetir não conserta. */
const REMETENTE = 'Demandas GUIA <demandas@avisos.guiaservir.com>';
const REMETENTE_DE_TESTE = 'Demandas GUIA <onboarding@resend.dev>';

async function enviar(para: string, assunto: string, corpo: string) {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) return { enviado: false, motivo: 'sem RESEND_API_KEY' };
  const tentar = (from: string) => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [para], subject: assunto, text: corpo }),
    /* sem prazo, um Resend pendurado segura a varredura até o timeout da
       Vercel e os avisos seguintes nem chegam a ser tentados */
    signal: AbortSignal.timeout(15_000),
  });
  try {
    const r = await tentar(REMETENTE);
    if (r.ok) return { enviado: true, motivo: 'ok' };
    if (r.status === 403) {
      const porque = await r.text().catch(() => '');
      if (/domain|verif/i.test(porque)) {
        const t = await tentar(REMETENTE_DE_TESTE);
        return { enviado: t.ok, motivo: t.ok ? 'ok (dominio sem verificar: remetente de teste)' : `resend ${t.status}` };
      }
    }
    return { enviado: false, motivo: `resend ${r.status}` };
  } catch (e) {
    return { enviado: false, motivo: `rede: ${String((e as Error)?.message || e).slice(0, 80)}` };
  }
}

/* UM AVISO É UMA PESSOA. O array `para[]` da versão anterior mandava o mesmo
   texto para o setor inteiro num `to:` só, o que (a) mostra o e-mail de cada
   um para todos os outros e (b) não deixa dizer "a SUA demanda" para quem
   pediu. A 91 devolve uma linha por destinatário. */
type Tipo = 'nova' | 'status' | 'informacao';
type Aviso = {
  aviso_id: string; tipo: Tipo;
  email: string; nome: string | null;
  numero: number; titulo: string; grupo: string; categoria: string;
  setor: string | null; abriu: string | null;
  prioridade: string; prazo: string | null; falta_aprovacao: boolean;
  estado: string | null; nota: string | null;
};

/* `new Date('lixo').toLocaleDateString()` devolve a string "Invalid Date", e
   ela ia inteira para dentro do e-mail no lugar do prazo */
function quando(prazo: string | null) {
  if (!prazo) return 'sem data definida';
  const t = Date.parse(`${prazo}T12:00:00Z`);
  if (!Number.isFinite(t)) return 'sem data definida';
  return new Date(t).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/* tipo que o banco não previu não pode virar e-mail sem texto: cai no `nova`,
   que é o único que não afirma nada sobre quem está lendo */
function tipoDe(d: Aviso): Tipo {
  return d.tipo === 'status' || d.tipo === 'informacao' ? d.tipo : 'nova';
}

/* OS TRÊS TEXTOS.

   Curtos de propósito, e sem HTML: o que a pessoa precisa saber no aviso é o
   que É, de QUEM, para QUANDO, e o link. O resto ela lê na ficha. E-mail de
   sistema que conta a vida inteira da demanda ensina a não ler e-mail de
   sistema.

   São três porque falam com pessoas diferentes sobre coisas diferentes, e um
   texto só para os três viraria o pior dos três: quem PEDIU não quer ler
   "abra para assumir", e quem ATENDE não quer ler "a sua demanda".

     · `nova`       quem atende o setor. O que fazer agora: abrir e assumir.
     · `status`     quem pediu. O que fazer agora: nada, e é justamente isso
                    que o texto precisa dizer, senão a pessoa vai à ficha
                    procurar um botão que não existe.
     · `informacao` quem pediu, e é ele que DESTRAVA: a demanda parou esperando
                    um dado dele. Por isso a pergunta viaja no corpo, e não só
                    o link: quem já sabe a resposta responde sem abrir nada.

   O PORTÃO APARECE NO `nova` porque muda o que a pessoa deve fazer AGORA: sem
   essa linha, quem atende abre a ficha, encontra todos os botões fora, e
   conclui que o sistema quebrou. */
function texto(d: Aviso) {
  const link = `${BASE}/demandas/d/${d.numero}`;
  const cabeca = `#${d.numero} · ${umaLinha(d.titulo)}`;
  const trilha = `${umaLinha(d.grupo, 60)} · ${umaLinha(d.categoria, 60)}`;
  const rodape = ['', link, '', 'GUIA Church · sistema de demandas'];
  const setor = umaLinha(d.setor, 60) || 'o setor responsável';

  /* 24/09/2026 (auditoria R13): "está agora em Em execução" repetia a
     preposição, e o setor se repetia quando é o nome do grupo */
  const estado = umaLinha(d.estado, 40) || 'outro estado';
  const trilhaESetor = umaLinha(d.setor, 60) && umaLinha(d.setor, 60) !== umaLinha(d.grupo, 60) ? `${trilha} · ${setor}` : trilha;
  if (tipoDe(d) === 'status') {
    return [
      `A sua demanda #${d.numero} agora está: ${estado}.`,
      '',
      cabeca,
      trilhaESetor,
      '',
      /* a concluída espera uma palavra de quem pediu: "não precisa fazer
         nada" contradizia o Início, que pede "Confirmar" */
      d.estado === 'Concluída'
        ? 'Se resolveu, confirme na ficha (“Resolveu, obrigado”). Se não resolveu, dá para reabrir lá.'
        /* cancelada não é "nada a fazer": a pessoa quer saber quem e por quê
           (24/09/2026, auditoria R14) */
        : d.estado === 'Cancelada'
          ? 'O motivo está na ficha, junto com quem cancelou. Se ainda precisar, dá para abrir uma nova.'
          : 'Você não precisa fazer nada: este aviso existe para você não ficar conferindo. Se alguma coisa não bater, diga na própria ficha.',
      ...rodape,
    ].join('\n');
  }

  if (tipoDe(d) === 'informacao') {
    return [
      `A sua demanda #${d.numero} parou esperando uma informação sua.`,
      '',
      cabeca,
      `${setor} perguntou:`,
      umaLinha(d.nota, 300) || '(a pergunta ficou em branco: abra a ficha para ver)',
      '',
      'Enquanto a resposta não chega, ninguém do outro lado consegue seguir. Responda na ficha:',
      ...rodape,
    ].join('\n');
  }

  const urgente = d.prioridade === 'urgente' || d.prioridade === 'alta';
  return [
    `${umaLinha(d.abriu, 60) || 'Alguém'} abriu uma demanda para ${umaLinha(d.setor, 60) || 'o seu setor'}.`,
    '',
    cabeca,
    trilha,
    `Prazo: ${quando(d.prazo)}${urgente ? `  ·  Prioridade ${umaLinha(d.prioridade, 20)}` : ''}`,
    '',
    d.falta_aprovacao
      ? 'Esta demanda precisa de aprovação da gestão antes de andar. Você não precisa fazer nada ainda.'
      : 'Abra para assumir, pedir informação ou mandar para outro setor.',
    ...rodape,
  ].join('\n');
}

function assunto(d: Aviso) {
  const titulo = umaLinha(d.titulo, 80);
  if (tipoDe(d) === 'status') {
    return umaLinha(`Demanda #${d.numero}: ${umaLinha(d.estado, 40) || 'outro estado'} · ${titulo}`, 140);
  }
  if (tipoDe(d) === 'informacao') {
    return umaLinha(`Demanda #${d.numero} espera uma informação sua: ${titulo}`, 140);
  }
  const marca = d.prioridade === 'urgente' ? '[URGENTE] ' : '';
  return umaLinha(`${marca}Demanda #${d.numero}: ${titulo}`, 140);
}

async function podeChamar(req: Request, s: ReturnType<typeof servidor>) {
  const auth = req.headers.get('authorization') || '';
  const segredo = process.env.CRON_SECRET;
  /* `segredo &&` antes da comparação: sem `CRON_SECRET` no ambiente, uma
     chamada sem cabeçalho nenhum casaria com `Bearer undefined` e a rota
     inteira viraria aberta para quem achasse a URL */
  if (segredo && auth === `Bearer ${segredo}`) return 'cron';

  /* o token pessoal vem no cabeçalho, NUNCA na URL: URL vai para log de
     servidor, para o Referer e para o histórico do navegador, e este token é
     uma senha. A mesma regra que `lib/demandas/api.ts` já segue. */
  const t = (req.headers.get('x-demandas-token') || '').trim();
  if (!t || !s) return null;
  const { data, error } = await s.rpc('dem_quem_sou', { p_token: t });
  if (error) return null;
  /* `=== true` e não só truthy: `dem_quem_sou` devolve jsonb, e no dia em que
     ela passar a responder `'ok': 'nao'` ou `'ok': 0`, um teste de veracidade
     abriria a porta para uma resposta que diz o contrário */
  return (data as { ok?: unknown })?.ok === true ? 'membro' : null;
}

async function varrer(req: Request) {
  const s = servidor();
  if (!s) return Response.json({ erro: 'SUPABASE_SERVICE_ROLE ausente' }, { status: 500 });

  const quem = await podeChamar(req, s);
  if (!quem) return Response.json({ erro: 'não autorizado' }, { status: 401 });

  const { data, error } = await s.rpc('dem_avisos_pendentes', { p_limite: 50 });
  if (error) return Response.json({ erro: error.message }, { status: 500 });

  const fila = (Array.isArray(data) ? data : []) as Aviso[];
  const feitos: string[] = [];
  const permanentes: string[] = [];
  const porErro = new Map<string, string[]>();
  const falhas: { numero: number; motivo: string }[] = [];
  let semIdentificacao = 0;

  for (const d of fila) {
    /* sem id não há o que carimbar, e mandar o e-mail assim mesmo faria o
       mesmo aviso sair de novo em toda varredura, para sempre */
    if (!d?.aviso_id) { semIdentificacao++; continue; }

    const alvo = umaLinha(d.email, 200).toLowerCase();
    if (!EMAIL.test(alvo)) {
      /* SEM DESTINATÁRIO É FALHA PERMANENTE, E POR ISSO CARIMBA COMO ENVIADO.
         `dem_aviso_falhou` devolve o aviso para a fila, e uma linha sem
         endereço válido nunca vai passar a ter um sozinha: seria a mesma
         tentativa falhando em toda varredura, para sempre, empurrando os
         avisos de verdade para fora do teto de 50. O que se perde ao carimbar
         é a memória de que faltou, e é isso que o log abaixo paga. */
      permanentes.push(d.aviso_id);
      falhas.push({ numero: Number(d.numero) || 0, motivo: 'sem e-mail válido de destino' });
      continue;
    }

    const r = await enviar(alvo, assunto(d), texto(d));
    if (r.enviado) { feitos.push(d.aviso_id); continue; }

    /* FALHA DE E-MAIL NÃO CARIMBA. É a diferença entre "tentei e não deu" e
       "dei por avisado": sem isso, um `resend 429` de um minuto ruim faria a
       demanda nunca mais ser avisada, e ninguém ficaria sabendo. O banco
       devolve o aviso para a fila, guarda o erro e conta a tentativa. */
    porErro.set(r.motivo, [...(porErro.get(r.motivo) || []), d.aviso_id]);
    falhas.push({ numero: Number(d.numero) || 0, motivo: r.motivo });
  }

  if (feitos.length) await s.rpc('dem_aviso_enviado', { p_ids: feitos });
  if (permanentes.length) {
    /* só a contagem no log: e-mail e título de ninguém vão para o registro da
       Vercel, que é lido por quem tem acesso ao projeto e não necessariamente
       ao sistema de demandas */
    console.warn(`[demandas/avisar] ${permanentes.length} aviso(s) sem e-mail válido, dados por encerrados`);
    await s.rpc('dem_aviso_enviado', { p_ids: permanentes });
  }
  for (const [motivo, ids] of porErro) {
    await s.rpc('dem_aviso_falhou', { p_ids: ids, p_erro: motivo.slice(0, 200) });
  }

  /* A RESPOSTA NÃO CARREGA DADO DE NINGUÉM.

     Quem chama pode ser qualquer membro do sistema, inclusive um que não vê a
     demanda na tela. Devolver a fila daria a ele nome, e-mail e título de todo
     mundo por uma rota que existe para mandar e-mail. Contagem, número da
     demanda e motivo da falha é tudo que cabe aqui. */
  return Response.json({
    ok: true, por: quem,
    naFila: fila.length,
    avisados: feitos.length,
    semDestinatario: permanentes.length,
    semIdentificacao,
    /* as falhas viajam na resposta em vez de sumirem num log que ninguém lê */
    falhas,
  });
}

export async function POST(req: Request) { return varrer(req); }
/* o cron do Vercel chama com GET */
export async function GET(req: Request) { return varrer(req); }
