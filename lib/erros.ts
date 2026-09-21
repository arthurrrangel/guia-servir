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
  /* OS QUATRO QUE FALTAVAM, E O PRIMEIRO É O MAIS PROVÁVEL DE TODOS.

     `criar_evento` e `apagar_evento` devolvem nove códigos; cinco estavam
     traduzidos e quatro chegavam crus na tela, como
     "Não consegui salvar. Detalhe: DIA_DE_CULTO".

     E `DIA_DE_CULTO` não é um caso de canto: o campo é um `<input
     type="date">` comum, que não impede escolher um domingo, e escolher um
     domingo é a primeira coisa que alguém tenta ao cadastrar um evento. O
     erro mais frequente do recurso inteiro era o que menos dizia. */
  [/^DIA_DE_CULTO$/,
   () => 'Esse dia já é dia de culto (domingo, ou sábado de Follow). O evento esporádico é para os dias em que não há culto — a escala do culto já cobre o ministério nesse dia.'],
  [/^SEM_PERMISSAO$/,
   () => 'Você não organiza esse ministério. Confira o ministério escolhido no topo da tela.'],
  [/^NAO_EXISTE$/,
   () => 'Esse evento não está mais lá — alguém pode ter apagado enquanto você olhava. Recarregue a tela.'],
  [/^REGRA$/,
   () => 'O banco recusou por uma regra da escala. Recarregue a tela e tente de novo; se continuar, avise quem organiza a igreja.'],
  /* e o que a 56 acrescentou: o segundo evento do mesmo dia */
  [/^JA_TEM_EVENTO$/,
   () => 'Esse ministério já tem um evento nesse dia, e a escala é um dia por data. Escolha outro dia, ou tire o evento que já está lá.'],
  /* A MESMA RECUSA, VINDO PELO GATILHO EM VEZ DA PORTA.

     `criar_evento` devolve código curto; o gatilho `culto_guarda` lança
     `raise exception` com o texto colado. Os dois caminhos existem porque a
     porta é a tela e o gatilho é a última linha de defesa — e o texto do
     gatilho é escrito sem acento, de máquina, para atravessar qualquer
     editor sem virar mojibake. Quem lê é gente. */
  [/^JA_TEM_EVENTO:\s*\S+ ja tem "(.+?)" marcado/i,
   m => `Esse ministério já tem "${m[1]}" marcado nesse dia, e a escala é um dia por data. Escolha outro dia, ou tire esse evento antes.`],
  [/^DIA_DE_CULTO:\s*(\S+) e (domingo|sabado de Follow)/i,
   m => `${m[1].split('-').reverse().join('/')} é ${m[2] === 'domingo' ? 'domingo' : 'sábado de Follow'}, e esse dia já tem culto. O evento esporádico é para dia sem culto.`],
  [/^CULTO_REGULAR_SO_ORGANIZADOR_GERAL:\s*(?:apagar|mudar) o culto de (\S+)/i,
   m => `O culto de ${m[1].split('-').reverse().join('/')} é da igreja inteira: mexer nele mexe na escala de todos os ministérios daquele dia. Só quem organiza a igreja pode. Fale com quem cuida disso.`],
  [/^CULTO_REGULAR_NAO_VIRA_EVENTO/i,
   () => 'Esse dia é um culto da igreja inteira, e não dá para transformá-lo num evento de um ministério só.'],
  [/^EVENTO_NAO_VIRA_CULTO_REGULAR/i,
   () => 'Isso transformaria o evento num culto da igreja inteira. Só quem organiza a igreja pode fazer isso.'],
  [/^EVENTO_NAO_TROCA_DE_DONO/i,
   () => 'Só quem organiza os dois ministérios pode passar um evento de um para o outro.'],
  [/^EVENTO_DE_OUTRO_MINISTERIO:\s*(.+?) nao e do seu ministerio/i,
   m => `"${m[1]}" é de outro ministério. Troque o ministério no topo da tela, ou fale com quem organiza aquele.`],
  [/^EVENTO_SEM_MINISTERIO/i,
   () => 'Falta dizer de qual ministério é o evento. Escolha o ministério no topo da tela.'],
  [/^DATA_NO_PASSADO:\s*(\S+) ja passou/i,
   m => `${m[1].split('-').reverse().join('/')} já passou. Escolha hoje ou um dia à frente.`],
  [/^JA_TEM_CULTO:\s*(\S+) ja tem culto/i,
   m => `${m[1].split('-').reverse().join('/')} já tem culto marcado. O evento entra num dia sem culto.`],
  [/^MINISTERIOS_DIFERENTES:\s*(.+?) nao e do ministerio de (.+?)\./i,
   m => `${m[1]} e ${m[2]} não são do mesmo ministério. Recarregue a tela; se continuar, avise quem organiza a igreja.`],
  [/^EVENTOS_DUPLICADOS/i,
   () => 'Há mais de um evento no mesmo dia para o mesmo ministério, e a escala é um dia por data. Avise quem organiza a igreja.'],
  /* a tranca de migração (55/56): quem vê isto é quem aplica SQL, não o
     líder — mas se vazar para uma tela, que vaze em português */
  [/^MIGRACAO SUPERADA/i,
   () => 'Esse arquivo de banco é mais antigo que o banco. Não aplique: ele desfaria correções mais novas.'],
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
  /* 75 · PAUSADO NÃO É LINK INVÁLIDO.

     Antes da 75, `eu_dados` buscava `where token = ? and ativo`, então quem
     tinha sido pausado pela própria líder caía na frase de cima e saía
     pedindo um link novo — que ia dar na mesma, porque o link está perfeito.
     Pausar é rotina: é um botão na tela do time, para quem vai viajar.

     A frase diz o que é, diz que o link continua valendo, e diz com quem
     falar. O artigo ("no Louvor", "na Mídia") vem do banco, de
     `equipes.artigo`, porque é a igreja falando o nome do próprio
     ministério. */
  [/^VINCULO_PAUSADO:\s*seu lugar (n[oa] .+?) esta pausado/i,
   m => `Seu lugar ${m[1]} está pausado no momento. Seu link continua valendo: quem organiza a sua área pode te reativar quando você voltar.`],
  [/^VINCULO_PAUSADO/i,
   () => 'Seu lugar está pausado no momento. Seu link continua valendo: quem organiza a sua área pode te reativar quando você voltar.'],

  /* ---- 20/09/2026: CINCO MENSAGENS QUE CHEGAVAM CRUAS NA TELA ----------

     Auditoria de backend. O repasse de `P0001` mais abaixo evita o genérico,
     mas entrega o texto de máquina literal, sem acento e às vezes com nome de
     coluna do banco. Duas destas aparecem na tela do VOLUNTÁRIO (/eu/<token>),
     onde não há líder por perto para traduzir.

     O acento é o detalhe que mais engana: o banco de produção lança
     `Link inválido` COM acento (01-schema-inicial.sql:185), e o padrão acima
     casa `invalido` SEM acento. Como `.` não casa acento e o `i` do regex não
     normaliza, o repasse cru vencia. Por isso `bruto` passa a ser comparado
     sem acento (ver `semAcento` no corpo de `aviseHumano`). */
  [/^Voce nao e o lider deste culto/i,
   () => 'Só quem organiza este ministério pode relatar este culto.'],
  [/^Resposta invalida/i,
   () => 'Essa resposta não vale. Responda se você pode ou não pode servir no dia.'],
  [/^funcao sem nome/i,
   () => 'Todo posto precisa de um nome. Preencha o nome antes de salvar.'],
  [/^exige_sexo invalido/i,
   () => 'O posto só aceita "qualquer pessoa", "só homens" ou "só mulheres". Escolha uma das três.'],
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

  /* A ORDEM MUDOU EM 19/09/2026, E A RAZÃO É ESPECÍFICO ANTES DE GENÉRICO.

     Era `PORCODIGO` primeiro. `PORCODIGO` responde pela CLASSE do erro
     (42501 = permissão, 23505 = duplicado); `PORBANCO` responde pela FRASE
     que nós mesmos escrevemos no `raise exception`. A frase é sempre mais
     específica que a classe dela, então checar a classe antes apagava a
     explicação boa em favor de uma genérica correta. Medido:

       CULTO_REGULAR_SO_ORGANIZADOR_GERAL: mudar o culto de 2026-11-01 ...
         com a ordem antiga -> "Você não tem permissão para isso neste
                                ministério."               (certo, e vazio)
         com a ordem nova   -> "O culto de 01/11/2026 é da igreja inteira:
                                mexer nele mexe na escala de todos os
                                ministérios daquele dia."  (diz o porquê)

     `PORBANCO` só tem padrões ancorados em texto nosso, então ele não
     rouba nada de `PORCODIGO`: o que ele não reconhecer cai adiante igual. */
  /* O MESMO RECADO CHEGA COM E SEM ACENTO, E ISSO JÁ CUSTOU UMA TRADUÇÃO.

     `eu_dados` lança `Link inválido` com acento em 01-schema-inicial.sql:185,
     e o retrato do banco (00-ESTADO-REAL-DO-BANCO.sql:228) traz a mesma frase
     sem acento. O padrão daqui casava só a versão sem, então metade dos
     bancos mostrava a frase traduzida e a outra metade mostrava o texto do
     Postgres. Comparar sem acento resolve os dois de uma vez, e não custa
     nada para os padrões que já casavam: nenhum deles depende de acento para
     ser específico. */
  const semAcento = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '');
  const achatado = semAcento(bruto);

  let texto: string | undefined;
  for (const [re, f] of PORBANCO) {
    const m = bruto.match(re) || achatado.match(re);
    if (m) { texto = f(m); break; }
  }
  if (!texto && codigo) texto = PORCODIGO[codigo];
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
