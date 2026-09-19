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

export type ErroHumano = { texto: string; tecnico?: string; generico?: boolean };

/* =============================================================================
   16/09/2026 · O BANCO JÁ DIZIA O MOTIVO, E A TELA ESCONDIA

   O João Victor, na escala da Mídia, viu "Não consegui salvar. Tente de novo;
   se continuar, avise quem organiza a igreja." Nenhuma pista. O detalhe ia
   para o console de um celular, que ninguém abre.

   O banco tem regras que RECUSAM uma escala com uma frase em português,
   escrita por nós (`raise exception`): a pessoa já está em outra função ao
   mesmo tempo naquele culto; a pessoa avisou que não pode naquele dia; o
   ministério não veio; a função ou a pessoa é de outro ministério. Todas
   chegam com o código P0001 e nenhuma casava com a lista abaixo, então todas
   viravam a frase genérica. A regra certa, que dizia exatamente o que fazer,
   era jogada fora.

   Agora: as frases conhecidas ganham a forma da folha (com acento, e com o
   que fazer); qualquer outro P0001 passa como veio, porque foi a gente que
   escreveu. E `aviseHumano`, que é o atalho de quem só tem uma linha, mostra
   o detalhe técnico quando cai no genérico: melhor uma linha feia que dá para
   mandar por WhatsApp do que uma bonita que não diz nada.
   ============================================================================= */
type Tradutor = [RegExp, (m: RegExpMatchArray) => string];
const PORBANCO: Tradutor[] = [
  /* fn_conflito_simultaneo (migração 04): "% ja esta em % ao mesmo tempo neste domingo." */
  [/^(.+?) ja esta em (.+?) ao mesmo tempo neste domingo/i,
   m => `${m[1]} já está em ${m[2]} nesse mesmo culto. Uma pessoa não fica em duas funções ao mesmo tempo: tire de uma delas antes, ou escolha outra pessoa.`],
  /* a versão anterior da mesma regra (migração 01) */
  [/Essa pessoa já está em (.+?) neste domingo/i,
   m => `Essa pessoa já está em ${m[1]} nesse mesmo culto. Tire de lá antes, ou escolha outra pessoa.`],
  /* fn_indisponivel (04): "% avisou que nao pode neste domingo." */
  [/^(.+?) avisou que nao pode neste domingo/i,
   m => `${m[1]} avisou que não pode nesse dia. Escolha outra pessoa.`],
  /* fn_sexo_do_posto (migração 48): a regra do prédio. O SQL escreve sem
     acento (é o jeito de o arquivo atravessar qualquer editor sem virar
     mojibake); a frase que a pessoa lê tem que ter. */
  [/^Falta dizer se (.+?) e homem ou mulher, e (.+?) e um posto de (homens|mulheres)/i,
   m => `Falta dizer se ${m[1]} é homem ou mulher, e ${m[2]} é um posto de ${m[3]}. Informe na aba Time, no campo ao lado do WhatsApp.`],
  [/^(.+?) e um posto de (homens|mulheres)\./i,
   m => `${m[1]} é um posto de ${m[2]}. Escolha outra pessoa.`],
  /* a versão anterior (01): "Essa pessoa avisou que não pode em DD/MM." */
  [/Essa pessoa avisou que não pode em (\d\d\/\d\d)/i,
   m => `Essa pessoa avisou que não pode em ${m[1]}. Escolha outra pessoa.`],
  /* voluntario_nao_apaga_historico (migração 52): apagar quem já serviu
     levaria a escala inteira junto, sem volta. O gatilho recusa e manda
     pausar — e o recado tem que dizer isso, senão a pessoa fica tentando de
     novo um botão que nunca vai funcionar. O SQL escreve sem acento; a frase
     que a pessoa lê tem que ter. */
  [/VOLUNTARIO_COM_HISTORICO:\s*(.+?) ja serviu (\d+) vez/i,
   m => `${m[1]} já serviu ${m[2]} ${+m[2] === 1 ? 'vez' : 'vezes'}, e apagar levaria toda a escala dela junto, sem volta. Use "Pausar" — a pessoa sai das próximas escalas e o histórico fica.`],
  /* evento esporádico (migração 54): as recusas de `criar_evento` chegam como
     código curto, e cada uma tem um caminho de saída diferente */
  [/^JA_TEM_CULTO$/,
   () => 'Esse dia já tem culto marcado. O evento entra num dia sem culto — se ele for no mesmo dia do culto, a escala do culto já cobre esse ministério.'],
  [/^DATA_NO_PASSADO$/,
   () => 'Essa data já passou. Escolha hoje ou um dia à frente.'],
  [/^FALTA_NOME$/,
   () => 'Falta o nome do evento (por exemplo: GUIA Empreendedor).'],
  [/^FALTA_DATA$/, () => 'Falta a data do evento.'],
  [/^NAO_E_EVENTO$/,
   () => 'Isso é um culto da programação fixa, não um evento. Culto não se apaga por aqui.'],
  [/^EVENTO_NAO_CRIADO$/, () => 'Não consegui criar o evento. Confira a data e o nome.'],
  [/^EVENTO_NAO_APAGADO$/, () => 'Não consegui apagar o evento. Recarregue a tela e tente de novo.'],
  /* A ESCALA MUDOU DEBAIXO DA TELA.

     `mudarStatus` grava dizendo de quem é a vaga. Se ninguém casar, é porque
     outro organizador trocou a pessoa enquanto esta tela estava aberta — e
     marcar "furou" ali dentro poria o furo na ficha de quem não faltou. */
  [/ESCALA_MUDOU_NO_POSTO/i,
   () => 'Outra pessoa entrou nesse posto enquanto você olhava. Recarreguei a escala — confira quem está lá agora e marque de novo.'],
  /* salvar_dia. Aceita os dois nomes de propósito: a mensagem nasceu na RPC
     `salvar_dia` e passou a ser lançada por `salvarDia`, em JavaScript, quando
     a gravação virou diferença. A expressão tinha ficado para trás e a frase
     boa só valia para o cron, que não desenha tela nenhuma. */
  [/salvar_?dia sem minist[eé]rio/i,
   () => 'Não achei o ministério desta escala. Recarregue a página e tente de novo.'],
  [/funcao de outro ministerio|voluntario de outro ministerio/i,
   () => 'Alguém desta escala não é deste ministério. Recarregue a página e tente de novo; se continuar, avise quem organiza a igreja.'],
  /* eu_dados e companhia */
  [/^Link invalido/i,
   () => 'Esse link não é válido. Peça o seu link de novo para quem organiza a igreja.'],
];

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
  /* 16/09/2026: o Arthur viu "espere alguns segundos" quando o Supabase
     recusou MANDAR o e-mail do link ("email rate limit exceeded"): o
     serviço de e-mail embutido do Supabase manda pouquíssimos por hora, e
     "segundos" o fazia clicar de novo, o que só estende o bloqueio. Quem
     manda e-mail de acesso e cai no limite precisa saber que é por hora e
     que a senha continua funcionando. */
  [/email rate limit|over_email_send_rate_limit/i,
   'O sistema chegou ao limite de e-mails de acesso desta hora. Entre com a senha (o link "Prefiro entrar com senha", abaixo), ou peça o link de novo daqui a uma hora. Se você já pediu antes, confira a caixa de entrada e o spam: o primeiro pode ter chegado.'],
  [/security purposes|only request this after|can only request/i,
   'Você acabou de pedir um link. Espere um minuto antes de pedir outro; o primeiro já deve estar chegando.'],
  [/rate ?limit|too many/i,
   'Muita coisa ao mesmo tempo. Espere alguns segundos e tente de novo.'],
];

export function humano(e: unknown, oQueFazia?: string): ErroHumano {
  const obj = (e || {}) as { message?: string; code?: string; details?: string; hint?: string };
  const bruto = [obj.message, obj.details, obj.hint].filter(Boolean).join(' · ')
    || (typeof e === 'string' ? e : '');
  const codigo = obj.code || '';

  let texto = codigo && PORCODIGO[codigo];
  /* as recusas do próprio banco vêm antes dos trechos genéricos: "avisou que
     nao pode" não pode cair em /telefone|phone/ nem em nada parecido */
  if (!texto) for (const [re, f] of PORBANCO) { const m = bruto.match(re); if (m) { texto = f(m); break; } }
  /* P0001 é `raise exception` nosso, escrito em português para gente ler.
     Passa como veio, só com o ponto final garantido. */
  if (!texto && codigo === 'P0001' && obj.message) texto = obj.message.trim().replace(/[.!]*$/, '.');
  if (!texto) for (const [re, t] of PORTEXTO) if (re.test(bruto)) { texto = t; break; }

  /* O genérico também precisa dizer o que fazer. "Erro inesperado" é só a
     mensagem crua vestida de português. */
  let generico = false;
  if (!texto) {
    generico = true;
    texto = oQueFazia
      ? `Não consegui ${oQueFazia}. Tente de novo; se continuar, avise quem organiza a igreja.`
      : 'Não consegui completar. Tente de novo; se continuar, avise quem organiza a igreja.';
  }

  if (bruto) { try { console.warn('[detalhe técnico]', bruto, codigo); } catch { /* console pode faltar */ } }
  return { texto, tecnico: bruto || undefined, generico };
}

/* Atalho para os lugares que só têm uma linha de aviso e nenhum lugar para
   pendurar o detalhe. Quando a frase é a genérica, o detalhe vai junto, na
   mesma linha: é a única cópia dele que a pessoa consegue mandar para alguém. */
export function aviseHumano(e: unknown, oQueFazia?: string) {
  const h = humano(e, oQueFazia);
  if (!h.generico || !h.tecnico) return h.texto;
  const detalhe = h.tecnico.length > 140 ? h.tecnico.slice(0, 137) + '…' : h.tecnico;
  return `${h.texto} Detalhe: ${detalhe}`;
}
