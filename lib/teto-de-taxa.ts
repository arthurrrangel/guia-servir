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

/* A PODA QUE NÃO PODAVA, E QUE CUSTAVA CARO — 20/09/2026, reauditoria.

   A primeira versão era:

       if (baldes.size < PODA_ACIMA_DE) return;
       for (const [k, b] of baldes) if (b.ate <= agora) baldes.delete(k);

   Duas coisas erradas ao mesmo tempo, e as duas só aparecem sob o tráfego
   que este módulo existe para conter:

   1 · Ela só apaga balde EXPIRADO. Com muitos IPs VIVOS, nada é apagado e o
       mapa cresce sem teto, exatamente o contrário do que o comentário
       prometia.

   2 · E, acima do limiar, ela varria o mapa inteiro em TODA requisição.
       Medido: com 20 mil IPs vivos, 2.000 chamadas levaram 468 ms; com o mapa
       vazio, 1 ms. Quatrocentas e sessenta e oito vezes mais caro, crescendo
       linearmente — ou seja, o próprio teto de taxa virava o amplificador do
       ataque.

   Agora a varredura é no máximo uma por segundo, e existe um TETO DE
   ENTRADAS: cheio, saem os baldes que estão mais perto de expirar.

   E A CORREÇÃO DA CORREÇÃO, que eu só vi rodando: despejar exatamente até o
   teto tem a MESMA doença. Cada inserção nova empurra o mapa um acima do
   teto, dispara outra ordenação, e o custo por requisição volta a ser
   O(n log n). A primeira versão desta poda derrubou o teste de tempo por
   estouro de dois minutos.

   Por isso o despejo vai até `ALVO_BALDES`, três quartos do teto: depois de
   uma limpeza cabem mais cinco mil inserções antes da próxima. É histerese, e
   é o que transforma "toda requisição paga" em "uma em cinco mil paga".

   O QUE ISSO NÃO É, e vale dizer porque a primeira versão também não era:
   contagem em memória por instância não é defesa contra ataque distribuído.
   Passando de TETO_BALDES IPs vivos na mesma janela, alguém é despejado e
   recomeça do zero. A escolha é entre isso e o mapa comendo a memória da
   função; despejar quem está mais perto de expirar é a perda menor. Defesa de
   verdade contra flood é a firewall da Vercel ou um contador no banco, como o
   `entrar_tentativas_equipe` da migração 31. */
const PODA_ACIMA_DE = 5000;
const TETO_BALDES = 20000;
const ALVO_BALDES = Math.floor(TETO_BALDES * 0.75);   // a histerese
const PODA_A_CADA_MS = 1000;
let proximaPoda = 0;

function podar(agora: number) {
  if (baldes.size < PODA_ACIMA_DE) return;
  if (agora < proximaPoda && baldes.size <= TETO_BALDES) return;
  proximaPoda = agora + PODA_A_CADA_MS;

  for (const [k, b] of baldes) if (b.ate <= agora) baldes.delete(k);
  if (baldes.size <= TETO_BALDES) return;

  /* ainda cheio, e tudo que sobrou está vivo: sai quem expira primeiro, e vai
     até ALVO_BALDES e não até o teto — senão a próxima inserção paga tudo de
     novo (ver a nota da histerese, acima). */
  const porExpirar = [...baldes.entries()].sort((a, b) => a[1].ate - b[1].ate);
  for (let i = 0; i < porExpirar.length - ALVO_BALDES; i++) baldes.delete(porExpirar[i][0]);
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

/** Só para os testes: esvazia a contagem entre casos.
 *
 *  `proximaPoda` VAI JUNTO, e isso não é detalhe: ela é estado de módulo, e
 *  sem resetá-la um bloco de teste deixava a varredura DESLIGADA para o
 *  seguinte, se o seguinte usasse instantes menores. As asserções do bloco
 *  seguinte continuariam passando, porque nenhuma delas olhava o tamanho do
 *  mapa: o teste viraria decorativo por causa da ORDEM DOS BLOCOS, que é a
 *  última coisa em que alguém repara ao acrescentar um caso. */
export function zerar() { baldes.clear(); proximaPoda = 0; }

/** Também só para os testes: quantos baldes o mapa está guardando.
 *
 *  Sem isto a varredura é INVISÍVEL de fora, e foi assim que eu quase deixei
 *  passar um teste que não testava: `passe` trata balde vencido
 *  preguiçosamente (`if (!b || b.ate <= agora)` reinicia na hora), então
 *  varrer ou não varrer dá exatamente a mesma resposta a quem chama. A
 *  varredura é sobre MEMÓRIA, e memória só se mede olhando o tamanho.
 *
 *  Um teste de poda que só olha o retorno de `passe` passa com a poda
 *  desligada. É por esse buraco que teste decorativo entra. */
export const tamanho = () => baldes.size;
