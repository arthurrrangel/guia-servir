/* =============================================================================
   TETO DE TAXA PARA AS DUAS PORTAS ANÔNIMAS

   20/09/2026. Auditoria de arquitetura.

   O app tem quatro rotas de API. Uma exige `CRON_SECRET`, outra devolve um
   manifest estático, e duas aceitam POST de qualquer um, sem autenticação
   nenhuma e sem limite de frequência:

     app/api/ofertar/checkout  — faz o SERVIDOR chamar o adquirente COM A
       CHAVE SECRETA DA IGREJA e criar um link de pagamento por requisição. Um
       script cria milhares de cobranças na conta da igreja, e o limpa-limpa é
       no painel do adquirente, à mão.

     app/api/pequena-guia      — grava nome, telefone, CEP e idade numa
       planilha do Google da igreja. Tem campo-isca e validação estrita dos
       cinco campos, mas nada impede repetir. A planilha é o destino final e
       não tem desfazer em massa: um robô que passe a isca enche a planilha de
       linhas válidas, e o time de acolhimento liga para números falsos.

   O PADRÃO JÁ EXISTE NESTE SISTEMA, do lado do banco: `31-fecha-brechas.sql`
   criou `entrar_tentativas_equipe` exatamente para isto. Aqui a contagem é em
   memória porque o que precisa ser barato é o caminho de quem não está
   atacando.

   O QUE ESTE TETO É, E O QUE ELE NÃO É

   Ele NÃO é defesa contra ataque distribuído, e não adianta fingir que é: a
   memória é por instância de função, e a Vercel sobe várias. Uma instância
   nova nasce com a contagem zerada, e quem quiser passar por cima troca de
   IP.

   Ele É a diferença entre "um laço de `for` num terminal enche a planilha em
   dez segundos" e "não enche". Isso é o que está acontecendo hoje, e é o que
   este arquivo resolve. Teto de verdade, se um dia precisar, é
   `entrar_tentativas_equipe` do lado do banco, ou a firewall da Vercel.

   O limite é por IP e por janela deslizante simples (janela fixa, na
   verdade — deslizante custaria guardar os instantes, e a diferença não muda
   nada no caso que importa).
   ============================================================================= */

type Balde = { n: number; ate: number };

/* Módulo vive enquanto a instância viver, que é o ciclo de vida certo para
   isto. Map e não objeto: chave arbitrária vinda de cabeçalho HTTP não entra
   em objeto sem risco de esbarrar em `__proto__`. */
const baldes = new Map<string, Balde>();

/* Sem esta poda, uma instância de longa vida acumula uma entrada por IP para
   sempre. Roda quando o mapa cresce, não por tempo: não há timer em serverless
   que sobreviva à requisição. */
const PODA_ACIMA_DE = 5000;
function podar(agora: number) {
  if (baldes.size < PODA_ACIMA_DE) return;
  for (const [k, b] of baldes) if (b.ate <= agora) baldes.delete(k);
}

/** O IP de quem chamou, como a Vercel o entrega. Sem cabeçalho, todo mundo
 *  cai no mesmo balde 'sem-ip' — que é o comportamento certo: quem não se
 *  identifica compartilha o teto com os outros que não se identificam. */
export function deQuem(req: Request): string {
  const h = req.headers;
  const xff = h.get('x-forwarded-for') || '';
  return (xff.split(',')[0] || h.get('x-real-ip') || 'sem-ip').trim() || 'sem-ip';
}

/**
 * Consome um passe do balde de `chave`.
 * Devolve `{ ok: true }` enquanto couber, e `{ ok: false, esperar }` depois —
 * `esperar` em segundos, para ir no cabeçalho `Retry-After`.
 */
export function passe(chave: string, limite: number, janelaSeg: number, agora = Date.now()) {
  podar(agora);
  const b = baldes.get(chave);
  if (!b || b.ate <= agora) {
    baldes.set(chave, { n: 1, ate: agora + janelaSeg * 1000 });
    return { ok: true as const };
  }
  if (b.n < limite) { b.n++; return { ok: true as const }; }
  return { ok: false as const, esperar: Math.max(1, Math.ceil((b.ate - agora) / 1000)) };
}

/** Só para os testes: esvazia a contagem entre casos. */
export function zerar() { baldes.clear(); }
