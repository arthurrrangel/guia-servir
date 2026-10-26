/* O E-MAIL DO ROBÔ DAS ESCALAS · 26/10/2026.

   A rota do cron mandava tudo de `onboarding@resend.dev`, o endereço de TESTE
   da Resend. O Demandas descobriu em 22/09 o que isso faz (comentário em
   app/api/demandas/avisar/route.ts): a Resend só entrega o que sai desse
   endereço para o dono da conta. Os líderes não recebiam nada.

   Agora o robô sai do domínio da igreja, o mesmo do Demandas, com o mesmo
   recuo: só quando a Resend recusa o remetente por domínio não verificado
   (403 com a frase do domínio), aquela mensagem tenta de novo pelo endereço
   de teste. Qualquer outra recusa não ganha segunda tentativa.

   E um e-mail por pessoa. Com o domínio entregando de verdade, um `to` com
   todos os líderes mostraria o endereço de cada um para todos os outros (o
   mesmo motivo do "UM AVISO É UMA PESSOA" do Demandas). Entre um envio e o
   seguinte, uma pausa curta, para não passar do limite de requisições por
   segundo da Resend.

   O contrato com a rota não muda: `{ enviado, motivo }`. `enviado` só é
   verdade quando TODOS receberam; o motivo diz quantos e por quê, sem a
   chave e sem endereço. */

export const REMETENTE = 'Escala GUIA <escala@avisos.guiaservir.com>';
export const REMETENTE_DE_TESTE = 'Escala <onboarding@resend.dev>';
export const PAUSA_ENTRE_ENVIOS_MS = 600;

export type Envio = { enviado: boolean; motivo: string };

const espera = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* a mesma pessoa duas vezes (líder da igreja e do ministério, ou o mesmo
   endereço com outra caixa) recebe uma vez só */
export function destinatarios(para: readonly (string | null | undefined)[]): string[] {
  const vistos = new Set<string>();
  const lista: string[] = [];
  for (const bruto of para || []) {
    const email = String(bruto || '').trim();
    const chave = email.toLowerCase();
    if (!email || vistos.has(chave)) continue;
    vistos.add(chave);
    lista.push(email);
  }
  return lista;
}

export async function enviarEmail(
  para: readonly (string | null | undefined)[], assunto: string, corpo: string,
  pausa = PAUSA_ENTRE_ENVIOS_MS,
): Promise<Envio> {
  const chave = process.env.RESEND_API_KEY;
  const lista = destinatarios(para);
  if (!chave || !lista.length) return { enviado: false, motivo: chave ? 'sem destinatário' : 'sem RESEND_API_KEY' };

  const tentar = (from: string, to: string) => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: assunto, text: corpo }),
    /* 14/09/2026: o fetch pode REJEITAR (DNS, rede), não só responder mal, e
       sem prazo um Resend pendurado segura a rota inteira */
    signal: AbortSignal.timeout(15_000),
  });

  let entregues = 0;
  let peloTeste = 0;
  const falhas: string[] = [];
  for (const [i, to] of lista.entries()) {
    if (i > 0 && pausa > 0) await espera(pausa);
    /* falha de e-mail é dado do relatório, não exceção: a rota já gravou a
       escala no banco quando chega aqui */
    try {
      let r = await tentar(REMETENTE, to);
      if (r.status === 403) {
        const porque = await r.text().catch(() => '');
        if (/domain|verif/i.test(porque)) {
          r = await tentar(REMETENTE_DE_TESTE, to);
          if (r.ok) peloTeste++;
        }
      }
      if (r.ok) entregues++;
      else falhas.push(`resend ${r.status}`);
    } catch (e) {
      falhas.push(`rede: ${String((e as Error)?.message || e).slice(0, 80)}`);
    }
  }

  const teste = peloTeste ? ` (domínio sem verificar: ${peloTeste} pelo remetente de teste)` : '';
  if (!falhas.length) return { enviado: true, motivo: 'ok' + teste };
  return { enviado: false, motivo: `${entregues}/${lista.length} ok; ${[...new Set(falhas)].join('; ')}${teste}` };
}
