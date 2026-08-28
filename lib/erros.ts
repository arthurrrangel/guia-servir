/* =============================================================================
   O QUE A TELA DIZ QUANDO DÁ ERRADO

   Contei 23 lugares no produto que jogavam a mensagem crua da exceção na
   cara da pessoa. O `/painel/candidaturas` chegou a exibir, no meio da tela
   vazia, o texto:

       TypeError: Failed to fetch

   Isso é o pior momento possível para a interface trocar de idioma. Quem lê
   isso não fez nada de errado — o wi-fi caiu — e a tela responde com o nome
   de uma classe de JavaScript. A pessoa conclui que quebrou alguma coisa, e
   normalmente conclui que a culpa é dela.

   O mesmo vale para o banco. `duplicate key value violates unique constraint
   "voluntarios_tel_key"` quer dizer "esse WhatsApp já está cadastrado aqui".
   Uma das duas frases dá para agir; a outra dá para copiar e mandar para o
   suporte que não existe.

   Toda mensagem daqui segue a mesma forma, nesta ordem:
     1. o que aconteceu, em português, sem culpar quem está lendo
     2. o que NÃO se perdeu, quando é o caso — é a primeira dúvida real
     3. o que fazer agora

   O detalhe técnico não some: ele vai no `tecnico`, para aparecer discreto
   embaixo, e para o console. Quem precisar dele sabe onde procurar; quem não
   precisa não tropeça nele.
   ============================================================================= */

export type ErroHumano = { texto: string; tecnico?: string };

/* Postgres devolve código; PostgREST devolve outro. Os que a gente realmente
   encontra estão aqui. O resto cai no genérico, que também é uma frase. */
const PORCODIGO: Record<string, string> = {
  '23505': 'Isso já está cadastrado. Confira se a pessoa não está na lista com outro nome.',
  '23503': 'Não dá para fazer isso enquanto houver escala ou cadastro ligado a este item.',
  '23514': 'Algum valor não é aceito aqui. Confira o que foi digitado.',
  '42501': 'Você não tem permissão para isso neste ministério. Fale com quem organiza a igreja.',
  '22P02': 'Algum valor está em formato inesperado. Confira o que foi digitado.',
  'PGRST301': 'Sua sessão expirou. Entre de novo para continuar.',
  'PGRST116': 'Não achei esse registro. Ele pode ter sido apagado por outra pessoa.',
};

/* Trechos que aparecem no texto do erro e dizem mais que o código. */
const PORTEXTO: [RegExp, string][] = [
  [/failed to fetch|networkerror|network request failed|load failed/i,
   'Sem conexão agora. Nada do que você fez se perdeu — quando a internet voltar, tente de novo.'],
  [/timeout|timed out|aborted/i,
   'A resposta demorou demais e eu parei de esperar. Tente de novo daqui a pouco.'],
  [/jwt|not authenticated|invalid claim/i,
   'Sua sessão expirou. Entre de novo para continuar.'],
  [/duplicate key|already exists|unique constraint/i,
   'Isso já está cadastrado. Confira se a pessoa não está na lista com outro nome.'],
  [/permission denied|row-level security|violates row-level/i,
   'Você não tem permissão para isso neste ministério. Fale com quem organiza a igreja.'],
  [/telefone|phone/i,
   'Confira o WhatsApp: precisa do DDD e só números.'],
  [/rate ?limit|too many/i,
   'Muita coisa ao mesmo tempo. Espere alguns segundos e tente de novo.'],
];

export function humano(e: unknown, oQueFazia?: string): ErroHumano {
  const obj = (e || {}) as { message?: string; code?: string; details?: string; hint?: string };
  const bruto = [obj.message, obj.details, obj.hint].filter(Boolean).join(' · ')
    || (typeof e === 'string' ? e : '');
  const codigo = obj.code || '';

  let texto = codigo && PORCODIGO[codigo];
  if (!texto) for (const [re, t] of PORTEXTO) if (re.test(bruto)) { texto = t; break; }

  /* O genérico também precisa dizer o que fazer. "Erro inesperado" é só a
     mensagem crua vestida de português. */
  if (!texto) {
    texto = oQueFazia
      ? `Não consegui ${oQueFazia}. Tente de novo; se continuar, avise quem organiza a igreja.`
      : 'Não consegui completar. Tente de novo; se continuar, avise quem organiza a igreja.';
  }

  if (bruto) { try { console.warn('[detalhe técnico]', bruto, codigo); } catch { /* console pode faltar */ } }
  return { texto, tecnico: bruto || undefined };
}

/* Atalho para os lugares que só têm uma linha de aviso e nenhum lugar para
   pendurar o detalhe. */
export const aviseHumano = (e: unknown, oQueFazia?: string) => humano(e, oQueFazia).texto;
