/* ===========================================================================
   MOTOR DE ESCALA — lógica pura, sem React, sem banco, sem DOM.
   Recebe um objeto de estado, devolve decisões. Testado em scripts/engine.test.mjs
   =========================================================================== */

export type Nivel = 'titular' | 'reserva' | 'treino';
export type Status = 'pendente' | 'confirmado' | 'recusado' | 'furou';

/* AS QUATRO PALAVRAS DO ESTADO — uma fonte só.
   Auditoria técnica, 29/08/2026. Esta lista existia idêntica em
   app/escala/page.tsx e app/painel/page.tsx. Duas cópias do vocabulário do
   produto: nada impedia a escala dizer "falta confirmar" e o painel dizer
   outra coisa para o mesmo estado. Vocabulário é domínio, e domínio mora
   aqui — não na tela que por acaso precisou dele primeiro. */
export const SITUACOES: { v: Status; rot: string }[] = [
  { v: 'pendente', rot: 'falta confirmar' },
  { v: 'confirmado', rot: 'confirmou' },
  { v: 'recusado', rot: 'não pode' },
  { v: 'furou', rot: 'furou' },
];

/* Tipos de culto que a igreja tem hoje. O Follow é no sábado e não usa
   todas as áreas — por isso a função guarda em quais cultos ela entra. */
export type TipoCulto = 'domingo' | 'follow';

/* ---------------------------------------------------------------- sexo ---
   18/09/2026. Em 22/08 a decisão registrada foi "não existe campo de sexo, e
   não precisa": estacionamento é dos homens, e isso já estaria dito pela
   habilidade, porque sexo seria só mais um motivo de saber ou não fazer.

   Estava errado, e a liderança do Connect mostrou por quê: "mulher não pode
   acessar banheiro masculino e nem sala dos pastores". Isso não é saber
   fazer, é poder entrar. E a diferença importa no ponto em que o sistema
   decide sozinho:

   · habilidade é POR PESSOA, e alguém precisa marcar uma por uma. Vale
     enquanto um humano lembrar, para sempre, inclusive para quem se cadastrar
     amanhã pelo link público;
   · a regra do prédio vale para TODO MUNDO de uma vez, e o sistema consegue
     aplicá-la sem ninguém lembrar.

   Guardar como habilidade era pedir que a pessoa certa lembrasse toda vez. Em
   18/09 eu mesmo provei o custo disso: ao dividir o posto do Connect, copiei
   as 21 habilidades para as três vagas novas e, naquele instante, o sorteio
   passou a poder pôr uma mulher no banheiro masculino.

   `exigeSexo` fica na FUNÇÃO porque a restrição é do lugar, não da pessoa.
   Sexo não informado (undefined) NÃO entra em posto com exigência: é melhor a
   vaga ficar visivelmente vazia do que preenchida por chute.               */
export type Sexo = 'M' | 'F';
export const SEXOS: { v: Sexo; rot: string; plural: string }[] = [
  { v: 'M', rot: 'homem', plural: 'homens' },
  { v: 'F', rot: 'mulher', plural: 'mulheres' },
];

export type Funcao = {
  id?: string; nome: string; simultanea: boolean; ordem: number; ativa: boolean;
  tipos?: TipoCulto[];
  /* quem está escalado aqui preenche o relatório do dia pelo próprio link */
  relata?: boolean;
  /* o posto só aceita esse sexo. undefined = qualquer pessoa. */
  exigeSexo?: Sexo;
};
export type Voluntario = {
  id: string; nome: string; tel?: string; ativo: boolean;
  /* null = SEGUE o limitePadrao da equipe, que é a regra escrita na migração
     11. O tipo dizia `number` e a ponte grava `v.limite_mes` cru, que é nulo
     no banco: o compilador jurava que este campo sempre tinha número. */
  limiteMes: number | null;
  token?: string; funcoes: Record<string, Nivel>; indisponivel: string[];
  /* undefined = ninguém informou ainda. Não é "não importa": é "não sei". */
  sexo?: Sexo;
  /* false = a pessoa se cadastrou sozinha pelo link e o líder ainda não
     conferiu o nível que ela declarou. Não bloqueia nada: só destaca. */
  conferido?: boolean;
  /* 81 · true quando este vínculo nasceu pelo formulário público COLADO numa
     pessoa que JÁ existia (o telefone digitado já era de alguém). Enquanto
     for true, o banco recusa criar PIN por aqui: os quatro dígitos não
     provam identidade quando foi o próprio inscrito que os digitou.
     `nomeDaPessoa` é o nome que a identidade tem, para a tela poder mostrar
     os dois lado a lado — foi a divergência entre eles que ninguém via. */
  identidadeReivindicada?: boolean;
  nomeDaPessoa?: string | null;
  /* por área: true quando alguém do time conferiu o nível, false quando é só
     o que a pessoa declarou no cadastro. Área que não está aqui vale como
     conferida (é cadastro antigo, feito pelo líder). */
  confirmadas?: Record<string, boolean>;
  /* domingos em que a pessoa respondeu "posso". Quem não está nem aqui nem
     em indisponivel simplesmente não respondeu ainda. */
  disponivel?: string[];
};

/* Como cada pessoa respondeu a um domingo: 'posso', 'nao' ou 'mudo'.
   'mudo' não impede escalar (decisão do líder), só aparece na cobrança. */
export type Resposta = 'posso' | 'nao' | 'mudo';
export function respostaDe(v: Voluntario, data: string): Resposta {
  if ((v.indisponivel || []).includes(data)) return 'nao';
  if ((v.disponivel || []).includes(data)) return 'posso';
  return 'mudo';
}
/* -------------------------------------------------- compromisso da escala

   Nada aqui bloqueia o voluntário de desmarcar. Tirar o botão só trocaria um
   aviso com antecedência por uma ausência surpresa — mesma cadeira vazia, sem
   as horas de reação. O que cria compromisso é a confirmação valer alguma
   coisa: ficar registrada, aparecer para o grupo e cobrar quem desmarca em
   cima da hora a ajudar a resolver.                                          */

/* A HORA DO CULTO, EM MINUTOS DESDE A MEIA-NOITE.

   Até 20/09 esta conta usava `18:00` fixo, com o comentário "o culto é à
   noite". O culto é às 10h: `lib/igreja.ts` diz `cultoHora: '10h'`, corrigido
   pelo Arthur em 03/09 justamente porque a hora errada tinha circulado.

   Eram oito horas de erro, sempre para o lado de perdoar. Quem avisava às
   11h30 de domingo, hora e meia DEPOIS de o culto começar, era registrado com
   sete horas de antecedência. O limiar de 48h escondia isso na maioria dos
   casos, mas deslocava a fronteira: quem desmarcava sexta às 18h tinha 40h
   reais de aviso (tardio) e o sistema calculava 48 (não tardio). A ficha de
   compromisso que o líder usa para conversar com a pessoa errava exatamente
   no ponto que decide a conversa.

   Por que os números estão AQUI e não importados de `lib/igreja.ts`: este
   arquivo é lógica pura e não importa nada, de propósito, e
   `scripts/engine.test.mjs` o carrega cru pelo node, que não resolve import
   sem extensão. A cópia é conferida contra a fonte por
   `scripts/hora-do-culto.test.mjs`, que reprova se as duas divergirem. */
export const MIN_CULTO_DOMINGO = 10 * 60;   // 10h — IGREJA.cultoHora
/* O Follow não tem hora confirmada em lugar nenhum (IGREJA.followHora é null,
   e `lib/semana.ts` diz o mesmo). 18h continua sendo palpite, e fica escrito
   que é. Quando a igreja confirmar, os dois lugares mudam juntos. */
export const MIN_FOLLOW_PALPITE = 18 * 60;

/** Hora de início deste dia, em minutos. Um evento com `inicio` informado
 *  manda; senão vale o tipo do dia. */
export function minutosDoCulto(S: Estado, data: string): number {
  const inicio = S.escalas[data]?.inicio;
  const m = inicio ? /^(\d{1,2})h(\d{2})?$/.exec(String(inicio).trim()) : null;
  if (m) return +m[1] * 60 + (m[2] ? +m[2] : 0);
  return tipoDoDia(data) === 'follow' ? MIN_FOLLOW_PALPITE : MIN_CULTO_DOMINGO;
}

/* Horas entre a resposta e o culto.
   Sem respondido_em não dá para julgar, e aí não conta como tardio. */
export function horasDeAntecedencia(data: string, respondidoEm?: string | null, minutos = MIN_CULTO_DOMINGO) {
  if (!respondidoEm) return null;
  const quando = Date.parse(respondidoEm);
  const culto = Date.parse(`${data}T${d2(Math.floor(minutos / 60))}:${d2(minutos % 60)}:00-03:00`);
  if (Number.isNaN(quando) || Number.isNaN(culto)) return null;
  return Math.round((culto - quando) / 3600000);
}

/* Desmarque em cima da hora: recusou dentro da janela de horasTardio. */
export function desmarqueTardio(S: Estado, data: string, sl?: Slot | null) {
  if (!sl || sl.status !== 'recusado') return false;
  const h = horasDeAntecedencia(data, sl.respondidoEm, minutosDoCulto(S, data));
  return h !== null && h < (S.config.horasTardio ?? 48);
}

/* Ficha de compromisso de uma pessoa, para o líder conversar com dado
   na mão em vez de com sensação. */
export function fichaDe(S: Estado, vid: string) {
  let confirmou = 0, avisouAntes = 0, tardios = 0, furos = 0;
  for (const data of Object.keys(S.escalas)) {
    for (const sl of Object.values(S.escalas[data].slots || {})) {
      if (sl?.vid !== vid) continue;
      if (sl.status === 'confirmado') confirmou++;
      else if (sl.status === 'furou') furos++;
      else if (sl.status === 'recusado') {
        if (desmarqueTardio(S, data, sl)) tardios++; else avisouAntes++;
      }
    }
  }
  return { confirmou, avisouAntes, tardios, furos };
}

/* Vagas que ficaram abertas por desmarque tardio ou furo — é o que o líder
   precisa resolver AGORA, não na próxima vez que abrir o app. */
export function furosAbertos(S: Estado, hoje = hojeISO()) {
  const out: { data: string; funcao: string; vid: string; nome: string; tardio: boolean }[] = [];
  for (const data of Object.keys(S.escalas)) {
    if (data < hoje) continue;
    for (const [funcao, sl] of Object.entries(S.escalas[data].slots || {})) {
      if (!sl?.vid) continue;
      const tardio = desmarqueTardio(S, data, sl);
      if (sl.status === 'furou' || tardio) {
        out.push({ data, funcao, vid: sl.vid, nome: nomeDe(S, sl.vid), tardio });
      }
    }
  }
  return out.sort((a, b) => a.data < b.data ? -1 : 1);
}

/* Quem pode cobrir esta vaga neste domingo, do melhor para o pior:
   quem disse que pode, depois quem tem menos carga. Aprendiz fica de fora,
   porque cobrir buraco de última hora não é hora de treinar. */
export function quemPodeCobrir(S: Estado, data: string, funcao: string, qtd = 3) {
  /* quem desmarcou está "livre" naquele domingo, então sem isto ela voltava
     na lista como substituta de si mesma. */
  const vagou = new Set<string>();
  for (const [fn, sl] of Object.entries(S.escalas[data]?.slots || {})) {
    if (fn === funcao && sl?.vid && (sl.status === 'recusado' || sl.status === 'furou')) vagou.add(sl.vid);
  }
  /* UM ALARME FALSO, E POR QUE ELE FICA ESCRITO — 20/09/2026, tarde.

     Uma reauditoria levantou que `vagou` só olha a vaga que está sendo
     coberta, e que quem recusou OUTRO posto do mesmo domingo entraria na
     lista — porque `gerarDia` deixou de escrever a recusa em `v.indisponivel`
     e o `respostaDe` lá embaixo perdeu a informação.

     O raciocínio está certo e a conclusão está errada, e eu cheguei a
     "corrigir" antes de conferir. Quem fecha esse caso é `ocupadoNoDia`, duas
     camadas abaixo: `elegiveis` roda com `excluirOcupados: true`, e
     `ocupadoNoDia` casa QUALQUER slot do dia, de qualquer status, pulando só
     a própria `funcaoAlvo`. Então:

       recusou o posto ALVO   -> `vagou` pega;
       recusou OUTRO posto    -> `ocupadoNoDia` pega, porque ela continua
                                 ocupando aquele slot.

     E não há terceiro caso: só enxergamos recusa de quem está num slot.

     A prova de que a "correção" era inócua: com o filtro extra removido, as
     quatro asserções escritas para prová-lo passavam igual. Era teste vazio,
     escrito no mesmo dia em que passei um commit inteiro caçando testes
     vazios. Fica escrito aqui porque a próxima auditoria vai chegar ao mesmo
     raciocínio, e porque o caminho da conclusão vale mais que ela.

     A assimetria que SOBRA, e que é inerte: `vagou` pega `recusado` E
     `furou`; um filtro por recusa só pegaria `recusado`. Como `ocupadoNoDia`
     cobre os dois, não muda nada. */
  return candidatos(S, funcao, data, { excluirOcupados: true, ignorarLimite: true })
    .filter(c => !vagou.has(c.id))
    .map(c => {
      const v = S.voluntarios.find(x => x.id === c.id)!;
      return { id: c.id, nome: c.nome, tel: v?.tel || '', nivel: c.nivel,
               resposta: respostaDe(v, data), carga: c.carga };
    })
    .filter(c => c.resposta !== 'nao')
    .sort((a, b) =>
      (a.resposta === 'posso' ? 0 : 1) - (b.resposta === 'posso' ? 0 : 1)
      || a.carga - b.carga
      || porNome(a, b))
    .slice(0, qtd);
}

/* Resumo do dia para o líder: quem topou, quem recusou, quem sumiu. */
export function respostasDoDia(S: Estado, data: string) {
  const ativos = S.voluntarios.filter(v => v.ativo);
  const posso = ativos.filter(v => respostaDe(v, data) === 'posso');
  const nao = ativos.filter(v => respostaDe(v, data) === 'nao');
  const mudo = ativos.filter(v => respostaDe(v, data) === 'mudo');
  return { posso, nao, mudo, total: ativos.length };
}
export type Slot = {
  vid: string | null; status: Status; fixo: boolean; primeiraVez?: boolean;
  /* quando a pessoa respondeu (ISO com hora). É o que permite saber se o
     "não posso" veio com antecedência ou em cima da hora. */
  respondidoEm?: string | null;
  /* quando ESTA PESSOA entrou NESTA vaga (migração 38). Nulo nas linhas
     anteriores à migração: nulo é "não sei", nunca "é antigo". */
  escaladoEm?: string | null;
};
export type Dia = {
  cultoId?: string; slots: Record<string, Slot>; plantao: string[]; obs: string;
  /* relatório que o líder escalado escreve no fim do culto */
  relatorio?: string; problemas?: string; relatadoEm?: string | null; relatadoPor?: string | null;
  /* EVENTO ESPORÁDICO (migração 54) — nome do evento quando este dia NÃO é da
     programação fixa. Nulo/ausente = domingo ou Follow, como sempre.

     É por este campo, e não pela data, que o motor sabe que o dia é evento:
     `tipoDoDia()` só olha o dia da semana, e um evento pode cair em qualquer
     dia — inclusive num domingo, junto com o culto. */
  evento?: string;
  /* horário de início, quando informado. É a "hora" do pedido do Arthur. */
  inicio?: string | null;
};
export type Config = {
  limitePadrao: number; janelaCarga: number; plantaoQtd: number;
  prazoConfirmacao: string; saudacao: string; rodape: string;
  /* desmarcar com menos de X horas do culto conta como "em cima da hora".
     Não bloqueia nada: entra no histórico e dispara a busca por substituto. */
  horasTardio: number;
};
export type Estado = {
  /* CAMPO FANTASMA, AGORA DECLARADO — auditoria 29/08/2026.
     `ponte.ts` e `demo.ts` escreviam isto com `(S as any).temAcesso = ...`:
     um campo que existe em execução e não existe no tipo. Quem lê `Estado`
     não sabia que ele estava lá, e o compilador não avisaria se alguém
     escrevesse `temacesso` minúsculo em vez de `temAcesso`.
     Hoje NINGUÉM lê este campo — o Shell decide "sem acesso" por `souLider()`.
     Fica declarado, e não apagado, porque o custo de declarar é zero e apagar
     um campo que a ponte preenche é o tipo de limpeza que quebra na semana
     seguinte. Se em três meses continuar sem leitor, aí sim ele sai. */
  temAcesso?: boolean;
  funcoes: Funcao[]; voluntarios: Voluntario[];
  escalas: Record<string, Dia>; config: Config;
  /* nome do ministério dono deste estado — usado nos textos que o voluntário lê */
  equipe?: string;
};

export const CONFIG_PADRAO: Config = {
  limitePadrao: 2, janelaCarga: 90, plantaoQtd: 1,
  prazoConfirmacao: 'quinta-feira',
  horasTardio: 48,
  saudacao: 'Boa noite galera',
  rodape: 'Confirma no seu link pessoal até {PRAZO}. Quem não puder, avisa agora e já indica o substituto.',
};

export const estadoVazio = (): Estado => ({
  funcoes: [], voluntarios: [], escalas: {}, config: { ...CONFIG_PADRAO },
});

/* ---------------------------------------------------------------- datas --- */
const d2 = (n: number) => String(n).padStart(2, '0');
export const isoDe = (y: number, m: number, d: number) => `${y}-${d2(m)}-${d2(d)}`;
const DIA = 86400000;
const t = (s: string) => Date.parse(s + 'T00:00:00Z');
export const diffDias = (a: string, b: string) => Math.round((t(b) - t(a)) / DIA);
export function addDias(s: string, n: number) {
  const dt = new Date(t(s) + n * DIA);
  return isoDe(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
export const hojeISO = () => { const d = new Date(); return isoDe(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
export const fmtDia = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
export const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
export const fmtLongo = (s: string) => `${+s.slice(8, 10)} de ${MESES[+s.slice(5, 7) - 1]}`;

/* =============================================================================
   QUE DIA É ESSE, DITO PARA A PESSOA QUE VAI SERVIR — 71, 21/09/2026

   Esta regra morava solta dentro de `app/eu/[token]/page.tsx`, que é um
   componente de cliente: nenhum teste conseguia importá-la, e ela é a frase
   que manda a pessoa sair de casa num dia. É o mesmo motivo que tirou
   `decisaoDoRobo`, `avisarDiaSemNinguem` e `bancoAtrasado` de dentro de um
   `if` no meio de um laço e trouxe para cá.

   O QUE ESTAVA ERRADO. A tela escrevia `ehSabado(s) ? 'sábado (Follow)' :
   'domingo'` — quer dizer: TUDO que não é sábado virava "domingo". Só que
   evento esporádico, por construção, NUNCA cai num domingo nem no sábado de
   Follow: `culto_guarda` recusa os dois com `DIA_DE_CULTO`. Logo todo evento
   caía no `else` e era anunciado como domingo.

   Medido em 21/09/2026: evento da Mídia numa QUARTA, 07/10, e a tela da
   voluntária dizia "domingo, 7 de outubro", sem o nome do evento. A tela da
   líder acerta isso desde a 54; a da pessoa que ia servir, não.

   A REGRA, em uma frase: dia com evento é chamado pelo dia da semana que ele
   realmente é, e com o nome do evento na frente; dia sem evento é o culto da
   igreja, e aí sábado é o Follow e o resto é domingo. */
const DIAS_DA_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
/* MEIO-DIA UTC DE PROPÓSITO, e esta é a SEGUNDA camada, não a primeira.

   A data vem do banco como 'AAAA-MM-DD'. Quem protege o dia hoje são os
   acessores `getUTC*` logo abaixo: com eles, `new Date('2026-10-04')` e
   `new Date('2026-10-04T12:00:00Z')` respondem o mesmo dia em qualquer fuso,
   e `scripts/dia-longo.test.mjs` mostra isso medido — sabotar só o meio-dia
   passa verde, sabotar os acessores reprova.

   O meio-dia fica porque a primeira camada é frágil por natureza: basta
   alguém escrever `dt.getDate()` numa linha nova (é o que a mão escreve
   primeiro) para o Acre passar a ver o dia anterior, e aí o domingo vira
   "sábado (Follow)". Com o meio-dia, esse erro custa nada de UTC-11 a
   UTC+11, que cobre o Brasil inteiro com folga.

   As duas camadas protegem a mesma coisa, então nenhum teste de
   comportamento consegue separar uma da outra. Por isso `paraTeste` abaixo
   expõe esta linha diretamente — mesmo motivo do `paraTeste` em lib/pix.ts. */
const noMeioDia = (s: string) => new Date(s + 'T12:00:00Z');
export const ehSabadoDeCulto = (s: string) => noMeioDia(s).getUTCDay() === 6;
export const diaLongo = (s: string, evento?: string | null) => {
  const dt = noMeioDia(s);
  const q = evento ? DIAS_DA_SEMANA[dt.getUTCDay()]
          : ehSabadoDeCulto(s) ? 'sábado (Follow)' : 'domingo';
  const quando = `${q}, ${dt.getUTCDate()} de ${MESES[dt.getUTCMonth()]}`;
  return evento ? `${evento} · ${quando}` : quando;
};
/* só para o teste enxergar a camada de baixo (ver o comentário de `noMeioDia`) */
export const paraTesteDeDia = { noMeioDia };

/* =============================================================================
   QUEM SERVE COM VOCÊ: GENTE, E NÃO LINHA — 75, 21/09/2026

   `eu_quem_serve` devolve UMA LINHA POR POSTO, e isso está certo: a lista
   quer mostrar quem faz o quê. A tela do voluntário então escrevia
   `juntos.length - 1` como "mais N pessoas" e listava o mesmo nome uma vez
   por posto.

   Medido em 21/09, num banco nascido do repositório: um culto com UMA pessoa
   escalada em DOIS postos. A tela escreveu "Quem serve com você — mais 1
   pessoa" e listou "Você" duas vezes. A pessoa está sozinha naquele dia e a
   tela diz que tem companhia; se for a primeira vez dela, ela chega
   procurando alguém que não existe.

   Esta função mora aqui, e não dentro do componente, pelo motivo de sempre
   neste repositório: regra que decide o que a pessoa lê não pode viver solta
   num `.tsx` onde nenhum teste alcança. É o mesmo caminho de `diaLongo`.

   DUAS DECISÕES QUE PRECISAM ESTAR ESCRITAS:

   · o agrupamento é pelo NOME, porque é o que `eu_quem_serve` devolve. Dois
     voluntários homônimos na mesma área viram uma linha só — e isso é menos
     errado que a contagem inflada, porque a lista serve para a pessoa achar
     alguém quando chegar, e dois nomes iguais já não resolviam isso. O dia
     em que `eu_quem_serve` devolver id, este agrupamento passa a ser por id.

   · o status que sobra vem de uma PRECEDÊNCIA declarada, e não da ordem de
     chegada. A primeira versão fazia `if (j.status === 'pendente')` e só
     isso: qualquer outro par mantinha quem chegou primeiro. Medido na
     reauditoria de 21/09:

         [{Ana,VOCAL,furou}, {Ana,TECLADO,confirmado}]  ->  "furou"
         [{Ana,TECLADO,confirmado}, {Ana,VOCAL,furou}]  ->  "confirmado"

     e quem decide a ordem é o `order by f.ordem` de `eu_quem_serve`. O
     comentário dizia "o mais aberto" e o código não implementava ordem
     nenhuma. Hoje a tela só desenha algo para `pendente`, então ainda não
     aparece — é armadilha, não defeito vivo, e por isso fica consertada com
     regra escrita em vez de deixada como está.

     A ordem é "a notícia menos boa ganha": quem furou um posto e confirmou
     outro não é uma pessoa confirmada, e quem não respondeu um posto ainda
     está decidindo o dia.

   · o agrupamento é por NOME **e por `eu`**. Homônimas na mesma área são
     raras e existem, e juntar "você" com outra pessoa de mesmo nome faria a
     contagem cair para zero e a seção sumir — o defeito original ao
     contrário, escondendo gente que está lá. Enquanto `eu_quem_serve` não
     devolver id, separar por `eu` é o que dá para fazer sem inventar dado. */
export type ServeCom = { nome: string; funcao: string; eu: boolean; status: string };
export type ServeComAgrupado = { nome: string; funcoes: string[]; eu: boolean; status: string };
/* menor = mais "aberto". Status que não está aqui entra como neutro (2):
   status novo no banco não pode mudar o que a tela já afirma. */
const PESO_STATUS: Record<string, number> = { furou: 0, pendente: 1, confirmado: 3 };
const pesoDe = (s: string) => PESO_STATUS[s] ?? 2;
/* =============================================================================
   O RÓTULO CURTO E A HORA DO DIA — 78, 21/09/2026

   O cartão "Sua próxima escala" tem um distintivo com mês e dia da semana, e
   uma linha com a data por extenso e a hora. Os dois liam só
   `ehSabado(data)`, do jeito que `diaLongo` lia antes da 71: tudo que não é
   sábado era "dom", com a hora do domingo.

   Medido em 21/09, com o mesmo evento da 71 — Mídia, quarta 07/10, início
   19:30 — o cartão dizia:

       out · dom
       Ensaio Geral · quarta, 7 de outubro, 10h

   e duas linhas abaixo o arquivo `.ics` que a pessoa salva no calendário
   dizia 19:30, porque o `.ics` já lia `proxima.inicio`. A mesma tela
   afirmando duas horas diferentes para o mesmo compromisso.

   `eu_dados` passou a trazer `evento` e `inicio` na 71; só o consumidor do
   `.ics` tinha sido atualizado. */
/* o nome é `distintivoDoDia` e não `rotuloCurto` porque `rotuloCurto` já
   existe neste arquivo, com outra regra (a do `tipoDoDia`, que sabe que o
   primeiro sábado do mês não tem Follow). Duas funções com o mesmo nome
   curto num arquivo só é como se escolhe a errada. */
export const distintivoDoDia = (s: string, evento?: string | null) => {
  const mes = MESES[+s.slice(5, 7) - 1].slice(0, 3);
  const dt = noMeioDia(s);
  /* com evento, o dia da semana de verdade, abreviado em três letras como o
     resto do distintivo. Sem evento, o culto: sábado é o Follow. */
  const dia = evento ? DIAS_DA_SEMANA[dt.getUTCDay()].slice(0, 3)
            : ehSabadoDeCulto(s) ? 'sáb' : 'dom';
  return `${mes} · ${dia}`;
};
/* a hora que a tela ESCREVE, e a mesma que vai para o `.ics`.
   `inicio` vem do banco como 'HH:MM:SS'; a tela mostra 'HH:MM' e tira o ':00'
   redondo, porque "19h" é como a igreja fala. */
export const horaDoDia = (
  inicio: string | null | undefined, evento: string | null | undefined,
  data: string, cultoHora: string, followHora?: string | null,
): string | null => {
  if (evento) {
    if (!inicio) return null;
    const [h, m] = inicio.split(':');
    return m === '00' ? `${+h}h` : `${+h}h${m}`;
  }
  return ehSabadoDeCulto(data) ? (followHora ?? null) : cultoHora;
};

export function agruparQuemServe(linhas: ServeCom[]): ServeComAgrupado[] {
  const mapa = new Map<string, ServeComAgrupado>();
  for (const j of linhas) {
    const chave = `${j.eu ? '1' : '0'}\u0000${j.nome}`;
    const atual = mapa.get(chave);
    if (!atual) {
      mapa.set(chave, { nome: j.nome, funcoes: [j.funcao], eu: j.eu, status: j.status });
      continue;
    }
    if (!atual.funcoes.includes(j.funcao)) atual.funcoes.push(j.funcao);
    if (pesoDe(j.status) < pesoDe(atual.status)) atual.status = j.status;
  }
  return [...mapa.values()];
}

/* =============================================================================
   O QUE O ROBÔ DAS 3H PODE FAZER SOZINHO

   19/09/2026. Esta decisão morava dentro de dois `if` no meio do laço de
   `app/api/cron/route.ts`, escrita como regra de produto. Ela é isso, mas é
   também a coisa que segura uma divergência de gravação:

     · a tela grava pela DIFERENÇA (`salvarDia` → `planoDoDia`): toca só no
       que mudou, porque regravar linha que não mudou fazia o gatilho recusar
       quem avisou "não posso" depois de escalado;
     · o robô grava pela RPC `salvar_dia`, que APAGA a escala da equipe no
       domingo inteiro e regrava.

   Os dois dão o mesmo resultado enquanto — e SOMENTE enquanto — o robô só
   grava em mês onde não há nada. É por isso que a regra saiu de dentro do
   `if` e virou função: aqui ela tem nome, tem motivo escrito e tem teste.

   Três casos, e o do meio é o que faltava quando o mês ficou pela metade e
   rodar de novo não consertava:
     · nenhum dia montado → 'monta'
     · todos montados     → 'ja-tem'   (não toca)
     · alguns montados    → 'parcial'  (não monta, mas AVISA — completar por
       conta própria re-sortearia o que o líder pôs à mão, porque `gerarDia`
       só respeita o que está travado ou confirmado)

   ⚠️  SE UM DIA 'parcial' PASSAR A MONTAR, a gravação do robô tem que virar
   `salvarDia` ANTES — senão o robô apaga o trabalho manual do líder por cima
   do ombro dele.

   82 · "às 3h da manhã, sem ninguém olhando" saiu daqui, e o motivo é o
   assunto inteiro da migração 66: `vercel.json` agenda `0 12 * * *`, ou seja
   MEIO-DIA UTC — 9h da manhã no Rio. O robô roda na hora em que o líder
   também está no app, e era exatamente esse erro de leitura que fazia a
   gravação por cima parecer inofensiva. */
export type DecisaoDoRobo = 'monta' | 'ja-tem' | 'parcial';
export function decisaoDoRobo(diasMontados: number, diasNoMes: number): DecisaoDoRobo {
  if (diasNoMes <= 0) return 'ja-tem';          // mês sem culto: nada a fazer
  if (diasMontados <= 0) return 'monta';
  if (diasMontados >= diasNoMes) return 'ja-tem';
  return 'parcial';
}

/* A COBRANÇA DE QUINTA ENCONTROU UM DIA SEM NADA DESTA EQUIPE: AVISA OU CALA?
   21/09/2026, auditoria do robô.

   `app/api/cron/route.ts` tinha um `if (!dia) continue` e nada mais, com um
   motivo legítimo escrito acima dele: dia que OUTRO ministério montou (um
   evento do Connect, digamos) não é problema do Louvor, e cobrar seria ruído.

   Só que `montarEstado` (lib/ponte.ts) também não materializa um domingo
   REGULAR quando a equipe não tem nada nele — e essa é uma decisão de TELA,
   escrita lá com todas as letras ("materializar um domingo só porque outro
   ministério montou nele fazia o app mostrar 7 funções sem ninguém e sumir
   com o botão de montar o mês"). O cron herdou a decisão como SILÊNCIO.

   O efeito, medido: um domingo em que o robô do dia 26 falhou ao gravar não
   aparecia em lugar nenhum da cobrança de quinta. A cobrança existe para
   ninguém descobrir o furo no sábado de manhã, e ela era muda exatamente
   sobre "ninguém escalado", que é o furo inteiro.

   Os dois casos são diferentes e a diferença cabe numa pergunta: o dia é um
   culto REGULAR (domingo ou Follow, pelo mesmo calendário que `diasDoMes`
   usa) ou está na lista só por ser evento de algum ministério? Regular sem
   nada é alarme; evento alheio é silêncio.

   `temTime` repete a condição que o bloco do dia 26 já usa para pular equipe
   sem gente ou sem função ativa: quem não tem time não tem o que montar, e
   cobrar isso toda quinta é o jeito mais rápido de ensinar alguém a ignorar
   o e-mail do robô.

   Esta regra sai de dentro do `if` pelo mesmo motivo que `decisaoDoRobo`
   saiu: aqui ela tem nome, motivo escrito e teste.

   ========================================================= 82 =============
   E `temTime` OLHAVA O MINISTÉRIO INTEIRO, NÃO O DIA.

   A chamada no cron era `!!funcoesAtivas(S).length` — TODOS os postos ativos
   do ministério, de qualquer tipo de culto. Mas `funcoes.tipos` existe
   justamente para dizer em qual culto recorrente cada posto existe, e
   `funcoesDoDia` é quem lê isso. Um ministério pode ter dezoito postos
   ativos e NENHUM no sábado de Follow.

   MEDIDO em 21/09, no banco que o repositório constrói:

       ministério    postos ativos   postos no Follow
       GUIA Kids           9                0
       Connect            18                0
       Livraria            2                0

   Esses três não servem no Follow, e isso é o produto, não um furo. Com o
   `temTime` velho, toda quinta-feira o sábado de Follow entra na janela de 4
   dias e cada um deles recebe "NINGUÉM ESTÁ ESCALADO neste culto. Abra o app
   e monte a escala deste dia." Toda semana. Para um dia em que eles não
   servem.

   E pior: essa linha ia para `falhas`, e `falhas.length` é o que faz a rota
   devolver HTTP 500. O robô ficaria VERMELHO toda quinta, para sempre, por
   um estado perfeitamente normal — que é exatamente o que o comentário no
   fim de `app/api/cron/route.ts` diz para não fazer ("um cron que fica
   vermelho todo dia por estado normal é um cron que ninguém olha mais em
   duas semanas").

   Hoje só o Louvor tem voluntário ativo, então o alarme ainda não dispara.
   A 58 existe para membro novo nascer em produção: no dia em que o Connect
   ganhar um voluntário ativo, dispara.

   O parâmetro passa a ser `temPostosNesteDia`, e o nome é a correção: quem
   chamar isto tem que ter olhado para o DIA. */
export function avisarDiaSemNinguem(regular: boolean, temPostosNesteDia: boolean): boolean {
  return regular && temPostosNesteDia;
}

/* ===========================================================================
   O QUE A COBRANÇA DE QUINTA PRECISA DIZER SOBRE UM DIA — 21/09/2026.

   A cobrança lia só isto:

       const pend = Object.entries(dia.slots)
         .filter(([, sl]) => sl?.vid && (sl.status || 'pendente') === 'pendente');
       const vagas = vagasDe(S, data);

   E `vagasDe` é `funcoesDoDia(...).filter(f => !slots[f.nome]?.vid)`: posto
   SEM NINGUÉM. Então um posto cujo ocupante apertou "não posso" cai no vão
   entre as duas: tem `vid` (não é vaga) e não está `pendente` (não é
   pendência).

   É INVISÍVEL. E é o pior estado dos três, porque os outros dois ainda podem
   se resolver sozinhos — o pendente confirma, a vaga é preenchida pelo robô
   do dia 26 — enquanto este já foi respondido: a pessoa avisou que não vem,
   o posto está ocupado por ela, e ninguém está sendo procurado.

   `furou` é o mesmo buraco com um dia a mais de estrago: quem furou o
   domingo passado continua escalado no próximo enquanto ninguém mexer.

   Os três estados precisam de mensagens DIFERENTES, e é por isso que esta
   função devolve três listas em vez de uma soma:

     · `pendentes` → cobrança à PESSOA ("confirma?"), com link de WhatsApp;
     · `vagou`     → recado ao LÍDER ("troque"), porque não há o que cobrar
                     de quem já respondeu que não vem;
     · `vagas`     → recado ao LÍDER ("resolva no app").
   =========================================================================== */
export type CobrancaDoDia = {
  pendentes: { funcao: string; vid: string }[];
  vagou: { funcao: string; vid: string; status: Status }[];
  vagas: string[];
};
export function cobrarDoDia(S: Estado, data: string): CobrancaDoDia {
  const slots = S.escalas[data]?.slots || {};
  const pendentes: CobrancaDoDia['pendentes'] = [];
  const vagou: CobrancaDoDia['vagou'] = [];
  /* só os postos que ESTE dia tem. Um slot gravado numa função que não existe
     mais no dia (o líder mudou `tipos` depois de montar) não vira cobrança:
     o caminho dele é a tela, não o e-mail. */
  const doDia = new Set(funcoesDoDia(S, data).map(f => f.nome));
  for (const [funcao, sl] of Object.entries(slots)) {
    if (!sl?.vid || !doDia.has(funcao)) continue;
    const st = (sl.status || 'pendente') as Status;
    if (st === 'pendente') pendentes.push({ funcao, vid: sl.vid });
    else if (st === 'recusado' || st === 'furou') vagou.push({ funcao, vid: sl.vid, status: st });
  }
  const porNomeDoPosto = (a: { funcao: string }, b: { funcao: string }) =>
    a.funcao < b.funcao ? -1 : a.funcao > b.funcao ? 1 : 0;
  return {
    pendentes: pendentes.sort(porNomeDoPosto),
    vagou: vagou.sort(porNomeDoPosto),
    vagas: vagasDe(S, data),
  };
}

/* O BANCO ESTÁ ATRÁS DO QUE ESTE CÓDIGO PRECISA? 21/09/2026.

   `schema_versao` existe desde a 55 e, até hoje, só as MIGRAÇÕES a liam, uma
   à outra: nenhuma linha de `app/` ou `lib/` consultava a régua. Só que
   `PUBLICAR.md` diz que os dois atos são separados — o `vercel --prod` é meu,
   o `psql` é do Arthur — e entre um e outro o robô roda com o código novo
   sobre o banco velho.

   Medido: código de hoje sobre banco na 60 (`salvar_dia` ainda na versão da
   54) criou um culto fantasma numa quinta de evento, gravou dez pessoas nele,
   deixou o evento vazio e respondeu HTTP 200 com zero falhas.

   Banco À FRENTE do código não é erro: aplicar a migração antes do deploy é a
   ordem recomendada. Por isso `>=` e não `=`. E `noBanco` nulo ou zero conta
   como atrasado: banco sem régua nenhuma é banco de antes da 55, e o robô de
   hoje não tem o que fazer lá. */
export function bancoAtrasado(noBanco: number | null | undefined, minimo: number): boolean {
  return (noBanco ?? 0) < minimo;
}

export function domingosDoMes(ano: number, mes: number): string[] {
  const out: string[] = [];
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  for (let d = 1; d <= ultimo; d++) {
    if (new Date(Date.UTC(ano, mes - 1, d)).getUTCDay() === 0) out.push(isoDe(ano, mes, d));
  }
  return out;
}

/* Culto do Follow: todo sábado do mês MENOS o primeiro.

   ATENÇÃO AO QUE ESTAVA ESCRITO AQUI ANTES — 19/09/2026.

   Esta linha dizia: "a mesma regra vale no banco (coluna gerada em
   cultos.tipo), então app e banco nunca discordam sobre o que é um sábado de
   Follow". É FALSO, e foi medido:

       2026-10-03 (1º sábado)  cultos.tipo (coluna gerada) -> 'follow'
                               sabadosDoFollow / cultosAte -> não é dia de culto

   A coluna gerada é `case when dow = 6 then 'follow' else 'domingo' end`, sem
   a exceção do primeiro sábado. Quem tem a exceção são `sabadosDoFollow`
   aqui, `cultosAte` abaixo, `culto_guarda` (migração 54) e
   `eu_proximos_domingos` (migração 09), todos com `dia > 7`.

   NA PRÁTICA NÃO DÓI, e por isso não virou migração: no primeiro sábado não
   existe culto em nenhum dos dois lados, então a coluna gerada só rotula uma
   linha que, naquele dia, só existe se for EVENTO — e evento ignora `tipos`.
   Trocar a expressão de uma coluna gerada exige reescrever a tabela inteira.

   O que doía era o comentário: ele mandava confiar numa igualdade que não
   existe, e quem fosse depurar calendário procuraria no lugar errado. */
export function sabadosDoFollow(ano: number, mes: number): string[] {
  const out: string[] = [];
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  for (let d = 1; d <= ultimo; d++) {
    if (new Date(Date.UTC(ano, mes - 1, d)).getUTCDay() === 6) out.push(isoDe(ano, mes, d));
  }
  return out.slice(1);          // fora o primeiro sábado
}

/* O tipo sai do dia da semana: sábado é Follow, o resto é domingo. */
export const tipoDoDia = (data: string): TipoCulto =>
  new Date(t(data)).getUTCDay() === 6 ? 'follow' : 'domingo';

/* Como o culto é chamado nas mensagens e na tela. Uma função só, para não
   sobrar "domingo" escrito na mão em canto nenhum. */
export const tituloDoCulto = (data: string, evento?: string) =>
  evento ? `Escala do ${evento}`
    : tipoDoDia(data) === 'follow' ? 'Escala do Follow, sábado' : 'Escala de domingo';
export const nomeDoCulto = (data: string) =>
  tipoDoDia(data) === 'follow' ? 'o Follow de sábado' : 'o domingo';
export const rotuloCurto = (data: string) =>
  tipoDoDia(data) === 'follow' ? `sáb ${fmtDia(data)}` : fmtDia(data);

/* Todos os cultos do mês, domingos e Follows, em ordem de data. */
export function cultosDoMes(ano: number, mes: number): string[] {
  return [...domingosDoMes(ano, mes), ...sabadosDoFollow(ano, mes)].sort();
}

/* =============================================================================
   QUEM ESTÁ CARREGANDO O MÊS

   O produto inteiro olha um culto por vez. `resumoDia` responde "este domingo
   está de pé?", `problemas` responde "alguém está em dois postos hoje?", e a
   /escala empilha essas respostas. Nenhuma delas soma o mês, e é aí que mora
   a pergunta que o líder não consegue fazer: quem está indo em TODOS, e quem
   não vai servir nenhuma vez.

   O motor já equilibra carga ao sortear — `candidatos` ordena por `cargaJanela`
   antes de escolher. Mas o resultado desse equilíbrio nunca aparece em lugar
   nenhum: `carga` só é lida dentro do texto de um `<option>`, no momento da
   troca manual. Ou seja, o líder confia num equilíbrio que ele não pode
   conferir, e quando o sorteio é desfeito na mão — que é o caso comum, porque
   travar e trocar existem — ninguém percebe que a Amanda ficou com cinco e o
   João com zero.

   Conta DIAS distintos, não postos: quem faz FOTO e EDIÇÃO no mesmo domingo
   foi à igreja uma vez. É a mesma regra que `cargaJanela` usa (ver a nota em
   "carga e teto contam DOMINGOS distintos"), e divergir dela aqui faria a tela
   contradizer o sorteio.

   `montados` existe porque comparar contra o mês inteiro mente num mês pela
   metade: com dois de seis cultos montados, quem está nos dois estaria "em
   todos" e a tela gritaria um alarme falso.
============================================================================= */
export function cargaDoMes(S: Estado, ano: number, mes: number) {
  /* evento conta como serviço: quem ficou no GUIA Empreendedor foi à igreja
     naquele dia, e a conta de carga do mês tem que enxergar isso — senão o
     sorteio do domingo seguinte acha que a pessoa está descansada */
  const dias = diasDoMes(S, ano, mes);
  const conta = new Map<string, { dias: Set<string>; funcoes: Set<string> }>();
  for (const d of dias) {
    for (const [fn, sl] of Object.entries(S.escalas[d]?.slots || {})) {
      if (!sl?.vid) continue;
      const at = conta.get(sl.vid) || { dias: new Set<string>(), funcoes: new Set<string>() };
      at.dias.add(d); at.funcoes.add(fn);
      conta.set(sl.vid, at);
    }
  }
  const pessoas = S.voluntarios.filter(v => v.ativo).map(v => {
    const c = conta.get(v.id);
    return {
      id: v.id, nome: v.nome, n: c ? c.dias.size : 0,
      dias: c ? [...c.dias].sort() : [],
      funcoes: c ? [...c.funcoes].sort() : [],
      limite: v.limiteMes ?? S.config.limitePadrao,
    };
  }).sort((a, b) => b.n - a.n || porNome(a, b));
  const montados = dias.filter(d => Object.values(S.escalas[d]?.slots || {}).some(s => s?.vid));
  return {
    dias, montados, pessoas,
    escalados: pessoas.filter(p => p.n > 0),
    zerados: pessoas.filter(p => p.n === 0),
    /* "em todos" só é um fato quando há mais de um culto montado para estar */
    emTodos: montados.length > 1 ? pessoas.filter(p => p.n === montados.length) : [],
    /* sem a guarda `p.limite > 0`: ela existia para tratar zero como "sem
       teto", e zero é teto. Agora `p.limite` já vem de `?? limitePadrao`. */
    acimaDoLimite: pessoas.filter(p => p.n > p.limite),
  };
}

/* As áreas que este dia precisa. O Follow não tem HEAD nem transmissão,
   então escalar essas funções num sábado seria criar vaga que não existe. */
export function funcoesDoDia(S: Estado, data: string) {
  /* EVENTO ESPORÁDICO: valem TODOS os postos ativos do ministério.

     `funcoes.tipos` responde "em qual culto RECORRENTE este posto existe" —
     PROJEÇÃO no domingo e no Follow, HEAD só no domingo. Evento não é
     recorrente: ele já diz de quem é (`cultos.equipe_id`), e quem é dono leva
     os postos todos.

     A alternativa seria marcar posto por posto a cada evento — que é
     exatamente o trabalho manual no grupo dos coordenadores que este recurso
     existe para acabar. Se um dia um evento precisar de menos postos, o
     caminho é o líder tirar da escala depois de montada, que é o mesmo
     caminho de qualquer outro dia. */
  if (S.escalas[data]?.evento) return funcoesAtivas(S);
  const tipo = tipoDoDia(data);
  return funcoesAtivas(S).filter(f => !f.tipos?.length || f.tipos.includes(tipo));
}

/* OS DIAS DO MÊS QUE ESTE MINISTÉRIO PRECISA MONTAR.

   `cultosDoMes` é aritmética pura: domingos mais os sábados de Follow. Ela
   continua existindo e continua pura, porque o texto das mensagens e a
   `lib/demo.ts` dependem disso.

   Mas a lista de TRABALHO não é mais só aritmética: desde a 54 existem
   eventos esporádicos, que vêm do banco e caem em qualquer dia da semana.
   Quem monta escala tem que ver os dois, em ordem.

   A união é feita sobre `S.escalas` porque `ponte.ts` materializa os dias de
   evento DESTE ministério ao montar o Estado — e só os deste, para o Louvor
   não abrir a escala e ver um dia do Connect. */
export function diasDoMes(S: Estado, ano: number, mes: number): string[] {
  const pre = `${ano}-${d2(mes)}`;
  const eventos = Object.keys(S.escalas).filter(d => d.startsWith(pre) && S.escalas[d]?.evento);
  return [...new Set([...cultosDoMes(ano, mes), ...eventos])].sort();
}

/* Cultos de hoje até daqui a n dias. A cobrança de quinta precisa pegar o
   Follow de sábado E o domingo: mirando só no domingo, o sábado ficava sem
   cobrança nenhuma e o líder só descobria o furo na hora. */
export function cultosAte(ref: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i <= n; i++) {
    const d = addDias(ref, i);
    const dow = new Date(t(d)).getUTCDay();
    if (dow === 0 || (dow === 6 && +d.slice(8, 10) > 7)) out.push(d);
  }
  return out;
}

export function proximoDomingo(ref = hojeISO()): string {
  let d = ref;
  for (let i = 0; i < 8; i++) {
    if (new Date(t(d)).getUTCDay() === 0) return d;
    d = addDias(d, 1);
  }
  return ref;
}

/* ------------------------------------------------------------- consultas --- */
export const vol = (S: Estado, id: string | null) => S.voluntarios.find(v => v.id === id) || null;
export const nomeDe = (S: Estado, id: string | null) => vol(S, id)?.nome ?? '';
export const metaFuncao = (S: Estado, nome: string) =>
  S.funcoes.find(f => f.nome === nome) || { nome, simultanea: true, ordem: 99, ativa: true };
/* O DESEMPATE POR NOME NÃO É ENFEITE — 20/09/2026.

   `funcoes.ordem` é `int not null default 0` e NÃO tem unique. Empate é
   alcançável pela tela: `app/ajustes/page.tsx` cria posto novo com
   `ordem: S.funcoes.length + 1`, então apagar um posto e criar outro produz
   dois postos com a mesma ordem. A migração 47 também empurrou ordens em
   bloco.

   Com empate e sem desempate, a ordem final era a que o banco devolveu — que
   é ordem de heap e muda sozinha a cada UPDATE. E `gerarDia` usa a POSIÇÃO
   no array para desempatar prioridade entre postos, então "Sortear de novo"
   com os mesmos dados dava escalas diferentes, e qual posto ficava vazio
   dependia de qual linha veio primeiro. Medido: mesma equipe, mesmas pessoas,
   só trocando a ordem física das linhas, a mesma pessoa caiu em PROJEÇÃO numa
   execução e em ILUMINAÇÃO na outra.

   `lerFuncoes` (lib/ponte.ts) pede `.order('ordem').order('nome')` pelo mesmo
   motivo; aqui o desempate é repetido porque o motor também roda sobre estado
   montado à mão, nos testes e no cron. */
export const funcoesAtivas = (S: Estado) =>
  S.funcoes.filter(f => f.ativa !== false)
    .sort((a, b) => a.ordem - b.ordem || (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0));

/* A REGRA DO PRÉDIO, EM UM LUGAR SÓ.
   Todo caminho que decide "esta pessoa pode ficar nesta vaga" passa por aqui:
   o sorteio, a lista de nomes que o líder abre, a conta de quantos seguram a
   área e o diagnóstico do painel. Espalhar a comparação por essas quatro
   telas seria a mesma consulta em quatro cópias, que é como a busca da equipe
   divergiu em silêncio antes de virar `linhasDaEquipe`.

   Quem não tem sexo informado fica de fora do posto com exigência, de
   propósito. O banco recusa de qualquer jeito (gatilho da migração 48), e
   vaga vazia com motivo na tela é melhor que erro na hora de salvar. */
export function podeNoPosto(S: Estado, v: Voluntario, funcao: string): boolean {
  const exige = metaFuncao(S, funcao).exigeSexo;
  return !exige || v.sexo === exige;
}

/* Por que esta pessoa não pode, em uma frase para a tela. '' = pode. */
export function porqueNaoPode(S: Estado, v: Voluntario, funcao: string): string {
  const exige = metaFuncao(S, funcao).exigeSexo;
  if (!exige || v.sexo === exige) return '';
  const rot = SEXOS.find(s => s.v === exige)!;
  return v.sexo
    ? `${funcao} é um posto de ${rot.plural}.`
    : `Falta dizer se ${v.nome.split(' ')[0]} é homem ou mulher, e ${funcao} é um posto de ${rot.plural}.`;
}

export function escalacoesDe(S: Estado, vid: string) {
  const out: { data: string; funcao: string; status: Status }[] = [];
  for (const [data, dia] of Object.entries(S.escalas)) {
    for (const [fn, slot] of Object.entries(dia.slots || {})) {
      if (slot?.vid === vid) out.push({ data, funcao: fn, status: slot.status || 'pendente' });
    }
  }
  return out.sort((a, b) => (a.data < b.data ? -1 : 1));
}

/* =============================================================================
   19/09/2026 — O CUSTO DE "MONTAR A ESCALA DESTE MÊS" NÃO ESTAVA ONDE EU ACHEI.

   Eu tinha posto um teto de passos no backtracking de `aumentar()` e anotado
   que ele derrubava o mês difícil de 5.591 ms para 711 ms. MEDI DE NOVO, com o
   teto variando de 20 a 200.000 passos, e o tempo e a cobertura não se mexem:
   são os mesmos em todos os valores. O teto nunca chega a pesar, porque o
   conjunto `visto` já limita a busca a (pessoa × dia) uma vez só. O número
   estava errado e a explicação também. Ficam o registro e o método: só vale
   como prova a medição que varia o que se afirma ser a causa.

   O custo real é ESTE PEDAÇO. `escalacoesDe` varre O ESTADO INTEIRO — todos os
   dias carregados, todos os postos de cada dia — e ainda ORDENA, para
   responder sobre UMA pessoa. E ela é chamada três vezes por pessoa dentro de
   `candidatos()` (uma em `cargaJanela`, duas em `diasDesdeUltima`), que por
   sua vez roda duas vezes por posto dentro de `gerarDia`.

   Ou seja, o trabalho cresce com (dias carregados × postos) × (postos ×
   pessoas). Medido, com 6 meses de histórico no Estado — que é o que a carga
   traz de verdade:

       11 postos / 17 pessoas ..........    85 ms
       24 postos / 17 pessoas ...........  565 ms
       40 postos / 25 pessoas ........... 2.968 ms

   E o histórico dobra a conta: os mesmos 40 postos sem histórico levam
   1.459 ms. Num Android mediano, 2.968 ms viram algo entre 12 e 24 segundos de
   tela morta — e a igreja está ANDANDO para lá, porque a migração 47 dividiu
   um posto do Connect em três sem somar uma pessoa.

   A correção abaixo não muda nenhuma resposta: muda o caminho até ela.
     · `diasDesdeUltima` quer a ÚLTIMA data antes da referência. Varrer tudo e
       pegar o fim da lista é o jeito caro de responder isso. Varrendo os dias
       de trás para frente e parando no primeiro achado, o caso comum olha um
       ou dois dias em vez de sessenta.
     · `cargaJanela`, `escalasNoMes` e `furosJanela` querem uma janela. Só os
       dias DA JANELA precisam ser olhados.

   As duas precisam das datas em ordem. Ordenar a cada chamada seria trocar um
   custo por outro, então a lista de dias fica guardada e é refeita quando o
   NÚMERO de dias muda — que é o único jeito de o conjunto mudar aqui: dia é
   criado por `garantirDia` e nunca apagado durante a geração (o que se apaga
   são slots DENTRO do dia). Se um dia algo passar a apagar dia, esta premissa
   cai junto, e é por isso que ela está escrita.
   ============================================================================= */
type ComCache = Estado & { _diasOrd?: string[]; _diasN?: number; _diasSelo?: number };
let SELO = 0;

/* A GUARDA ERA A CONTAGEM DE DIAS, E A CONTAGEM NÃO BASTA — 19/09/2026.

   A versão anterior refazia o cache quando `Object.keys(S.escalas).length`
   mudava, apostando que dia só nasce e nunca morre. O parágrafo acima até
   avisava: "se um dia algo passar a apagar dia, esta premissa cai junto".
   Esse algo já estava no repositório, em app/escala/page.tsx, na rotina que
   restaura o retrato local quando a gravação falha:

       if (!est) for (const [d, dia] of snap) { if (dia) S.escalas[d] = dia;
                                                else delete S.escalas[d]; }

   Apagar um dia e criar outro deixa a CONTAGEM igual, e o cache continua
   servindo a lista velha. Medido:

       escalas: 01/03, 08/03, 15/03  ->  apaga 15/03, cria 25/03  (ainda 3)
       diasDesdeUltima(ref=01/04) devolveu 24   (a resposta certa é 7)
       cargaJanela(ref=01/04, janela=10) devolveu 0   (a certa é 1)

   Nada quebra na hora: só muda quem é sorteado, semanas depois, sem ninguém
   ligar uma coisa à outra. É o defeito mais caro que existe neste motor.

   A GUARDA NOVA É CONTAGEM **MAIS SELO**, e o selo é o que fecha o buraco:
   um número global que sobe toda vez que `garantirDia` CRIA um dia e toda vez
   que alguém avisa, por `esqueceOsDias`, que mexeu em `S.escalas` por fora.
   A troca que enganava a contagem (apaga um, cria outro) mexe no selo pela
   criação, então o cache se refaz.

   E A TENTATIVA QUE EU MEDI E JOGUEI FORA, que é o motivo deste parágrafo:

   A primeira versão desta correção trocava a contagem por uma chave
   `contagem|primeiro|último`, varrendo `S.escalas` a cada chamada. Eu escrevi
   no comentário que ela era "O(1) e mais barata". As duas coisas eram
   falsas, e a medição disse o contrário do que eu tinha afirmado:

       40 postos / 60 pessoas / limite 2   antes 6.222 ms   com a chave 7.754 ms

   Varrer as chaves é O(n) e roda 1,4 milhão de vezes numa geração de mês:
   ficou 25% MAIS LENTO que o `Object.keys().length` que eu estava tentando
   otimizar. Correção de segurança paga com 25% de lentidão continua valendo;
   o que não vale é anunciá-la como ganho. O selo faz o mesmo trabalho em
   tempo constante, e é o que ficou.

   Quem mexe em `S.escalas` fora do motor chama `esqueceOsDias(S)`. */

/** Diz ao motor que o conjunto de dias mudou por fora. O(1) e idempotente. */
export function esqueceOsDias(_S?: Estado) { SELO++; }

function diasEmOrdem(S: Estado): string[] {
  const s = S as ComCache;
  const n = Object.keys(S.escalas).length;
  if (s._diasOrd && s._diasN === n && s._diasSelo === SELO) return s._diasOrd;
  const ord = Object.keys(S.escalas).sort();
  Object.defineProperty(s, '_diasOrd', { value: ord, writable: true, enumerable: false, configurable: true });
  Object.defineProperty(s, '_diasN', { value: n, writable: true, enumerable: false, configurable: true });
  Object.defineProperty(s, '_diasSelo', { value: SELO, writable: true, enumerable: false, configurable: true });
  return ord;
}

/** Dias distintos, dentro de [ini, fim], em que a pessoa aparece. */
function diasComAPessoa(S: Estado, vid: string, ini: string, fim: string, filtro?: (s: any, fn: string) => boolean) {
  let n = 0;
  for (const data of diasEmOrdem(S)) {
    if (data < ini) continue;
    if (data > fim) break;
    const slots = S.escalas[data]?.slots;
    if (!slots) continue;
    for (const fn in slots) {
      const sl = (slots as any)[fn];
      if (sl?.vid !== vid) continue;
      if (filtro && !filtro(sl, fn)) continue;
      n++; break;                       // o dia conta UMA vez
    }
  }
  return n;
}

/* carga e teto contam DOMINGOS distintos: FOTO+EDIÇÃO no mesmo dia vale 1 */
export const cargaJanela = (S: Estado, vid: string, ref: string, dias: number) =>
  diasComAPessoa(S, vid, addDias(ref, -dias), ref);
export const escalasNoMes = (S: Estado, vid: string, ano: number, mes: number) => {
  const pre = `${ano}-${d2(mes)}`;
  return diasComAPessoa(S, vid, pre + '-01', pre + '-31');
};
/* `furou` conta POSTOS, não dias: furar dois postos no mesmo domingo é furar
   duas vezes. Era assim antes e continua sendo — por isso este não usa
   `diasComAPessoa`, que conta dia. */
export const furosJanela = (S: Estado, vid: string, ref: string, dias: number) => {
  const ini = addDias(ref, -dias);
  let n = 0;
  for (const data of diasEmOrdem(S)) {
    if (data < ini) continue;
    if (data > ref) break;
    const slots = S.escalas[data]?.slots || {};
    for (const fn in slots) {
      const sl = (slots as any)[fn];
      if (sl?.vid === vid && sl.status === 'furou') n++;
    }
  }
  return n;
};
export function diasDesdeUltima(S: Estado, vid: string, ref: string, funcao?: string) {
  const dias = diasEmOrdem(S);
  for (let i = dias.length - 1; i >= 0; i--) {
    const data = dias[i];
    if (data >= ref) continue;
    const slots = S.escalas[data]?.slots;
    if (!slots) continue;
    if (funcao) {
      if ((slots as any)[funcao]?.vid === vid) return diffDias(data, ref);
      continue;
    }
    for (const fn in slots) if ((slots as any)[fn]?.vid === vid) return diffDias(data, ref);
  }
  return 9999;
}

export function ocupadoNoDia(S: Estado, data: string, vid: string, funcaoAlvo: string | null) {
  const dia = S.escalas[data];
  if (!dia) return null;
  for (const [fn, slot] of Object.entries(dia.slots || {})) {
    if (fn === funcaoAlvo) continue;
    if (slot?.vid === vid) return fn;
  }
  return null;
}

export function garantirDia(S: Estado, data: string): Dia {
  /* CRIAR dia sobe o selo do cache de datas (ver `diasEmOrdem`). Sem isso,
     apagar um dia e criar outro mantém a contagem e a lista em ordem fica
     velha, o que muda quem é sorteado semanas depois sem nada quebrar na
     hora. Uma soma, e só quando o dia realmente nasce. */
  if (!S.escalas[data]) { S.escalas[data] = { slots: {}, plantao: [], obs: '' }; esqueceOsDias(); }
  const d = S.escalas[data];
  d.slots ||= {}; d.plantao ||= []; d.obs ??= '';
  return d;
}

/* ---------------------------------------------------------- elegibilidade --- */

/* NÍVEL DECLARADO x NÍVEL EFETIVO.
   No auto-cadastro a pessoa escolhe o próprio nível, e "titular" quer dizer
   "eu faço isso sozinho, a área fica de pé em mim". Aceitar isso sem conferir
   é deixar a escala inteira apoiada num toque de tela: foi assim que 15 dos 16
   cadastros entraram como titular e só uma pessoa usou "reserva".

   Enquanto ninguém confere, titular vale como RESERVA. A pessoa continua
   entrando na escala normalmente e nada quebra; o que ela não faz é virar o
   primeiro nome da fila nem sustentar a área sozinha. Reserva e treino não
   mudam: só o degrau mais alto precisa de alguém do time chancelando. */
export const confirmada = (v: Voluntario, funcao: string) =>
  v.confirmadas?.[funcao] !== false;

export function nivelEfetivo(v: Voluntario, funcao: string): Nivel | undefined {
  const n = v.funcoes?.[funcao];
  if (!n) return undefined;
  return n === 'titular' && !confirmada(v, funcao) ? 'reserva' : n;
}

export type Candidato = { id: string; nome: string; nivel: Nivel; carga: number; paradoGeral: number; paradoFuncao: number };

/* QUEM PODE, SEM PONTUAR NINGUÉM.

   Esta metade saiu de `candidatos` em 19/09/2026 por causa de uma linha em
   `gerarDia` que só queria o TAMANHO da lista:

       .map((f, i) => ({ f, i, n: candidatos(S, f.nome, data, {...}).length }))

   Contar assim custava, para CADA pessoa elegível de CADA posto, uma
   `cargaJanela` e duas `diasDesdeUltima` — as três funções mais caras do
   arquivo — e o resultado ia para o lixo uma linha depois. Aparecia no perfil
   como 9,7% do tempo, com o nome de uma função anônima.

   Filtrar é barato; pontuar e ordenar é que não é. Separar as duas deixa o
   `candidatos` idêntico (ele chama esta e pontua em cima) e dá a `gerarDia`
   uma contagem que custa o que uma contagem deve custar. */
function elegiveis(
  S: Estado, funcao: string, data: string,
  o: { excluirOcupados?: boolean; incluirTreino?: boolean; ignorarLimite?: boolean; fora?: ForaDoDia } = {},
): Voluntario[] {
  const excluirOcupados = o.excluirOcupados !== false;
  const [ano, mes] = data.split('-').map(Number);

  return S.voluntarios.filter(v => {
    if (!v.ativo) return false;
    const nivel = nivelEfetivo(v, funcao);
    if (!nivel) return false;
    if (nivel === 'treino' && !o.incluirTreino) return false;
    /* a regra do prédio vem antes de qualquer outra: não adianta estar livre,
       ter nível e estar em dia com o limite se a pessoa não pode entrar ali.
       Fica acima do `ignorarLimite` de propósito — nenhuma opção desta função
       destrava isso, porque o banco também não destrava. */
    if (!podeNoPosto(S, v, funcao)) return false;
    if ((v.indisponivel || []).includes(data)) return false;
    if (foraDe(o.fora, data, v.id)) return false;
    if (!o.ignorarLimite) {
      /* `??` e não `||`: zero é um teto ("nenhuma vez este mês"), e com `||`
         ele caía em falsy e virava o padrão da equipe. Medido: pessoa com
         limiteMes 0 e limitePadrao 2 era escalada duas vezes, e o alarme da
         tela não acusava porque ele também tinha a mesma guarda. */
      const limite = v.limiteMes ?? S.config.limitePadrao;
      /* O teto conta DIAS (`escalasNoMes` -> `diasComAPessoa`), e o dia atual
         já entrou nessa conta quando a pessoa está em QUALQUER posto dele. O
         desconto olhava só a mesma vaga, então quem já servia FOTO no dia era
         barrada de EDIÇÃO no mesmo dia — um segundo posto que custa zero dia.
         A vaga ficava aberta à toa, e é exatamente o acúmulo pós-culto que a
         nota de `cargaJanela` descreve como legal. */
      const jaNesteDia = Object.values(S.escalas[data]?.slots || {}).some(s => s?.vid === v.id);
      const desconto = jaNesteDia ? 1 : 0;
      if (escalasNoMes(S, v.id, ano, mes) - desconto >= limite) return false;
    }
    if (excluirOcupados && ocupadoNoDia(S, data, v.id, funcao)) return false;
    return true;
  });
}

/** Quantas pessoas podem, sem pontuar nenhuma. Mesmo filtro de `candidatos`. */
export const quantosPodem = (
  S: Estado, funcao: string, data: string,
  o: { excluirOcupados?: boolean; incluirTreino?: boolean; ignorarLimite?: boolean; fora?: ForaDoDia } = {},
) => elegiveis(S, funcao, data, o).length;

export function candidatos(
  S: Estado, funcao: string, data: string,
  o: { excluirOcupados?: boolean; incluirTreino?: boolean; ignorarLimite?: boolean; fora?: ForaDoDia } = {},
): Candidato[] {
  const peso = (n: Nivel) => (n === 'titular' ? 0 : n === 'reserva' ? 1 : 2);
  return elegiveis(S, funcao, data, o)
    .map(v => ({
      id: v.id, nome: v.nome, nivel: nivelEfetivo(v, funcao)!,
      carga: cargaJanela(S, v.id, data, S.config.janelaCarga),
      paradoGeral: diasDesdeUltima(S, v.id, data),
      paradoFuncao: diasDesdeUltima(S, v.id, data, funcao),
    }))
    .sort((a, b) =>
      peso(a.nivel) - peso(b.nivel) ||
      a.carga - b.carga ||
      b.paradoFuncao - a.paradoFuncao ||
      b.paradoGeral - a.paradoGeral ||
      porNome(a, b));
}

export const vagasDe = (S: Estado, data: string) =>
  funcoesDoDia(S, data).filter(f => !S.escalas[data]?.slots?.[f.nome]?.vid).map(f => f.nome);

/* Plantão só recebe quem é CURINGA: cobre 2+ funções sem depender de treino
   (titular ou reserva). Alguém que só sabe uma coisa não serve de plantão —
   se o furo for em outra função, ele não resolve. */
export function ehCuringa(v: Voluntario) {
  return Object.values(v.funcoes || {}).filter(n => n === 'titular' || n === 'reserva').length >= 2;
}
export function sugerirPlantao(S: Estado, data: string, qtd: number, fora?: ForaDoDia) {
  return S.voluntarios
    .filter(v => v.ativo && ehCuringa(v) &&
      !(v.indisponivel || []).includes(data) && !foraDe(fora, data, v.id) &&
      !ocupadoNoDia(S, data, v.id, null))
    .map(v => ({ id: v.id, nome: v.nome, carga: cargaJanela(S, v.id, data, S.config.janelaCarga), parado: diasDesdeUltima(S, v.id, data) }))
    .sort((a, b) => a.carga - b.carga || b.parado - a.parado || porNome(a, b))
    .slice(0, qtd).map(p => p.id);
}

/* O MÊS SEGUINTE, EM UM LUGAR SÓ — 20/09/2026.

   Esta aritmética estava copiada em dois lugares, nenhum deles em `lib/`:
   `app/api/cron/route.ts:125` e `app/painel/page.tsx:355`. Ela decide QUAL
   MÊS o botão "Montar" do líder e o robô do dia 26 agem sobre. As duas
   divergirem é o líder montar outubro e o robô montar novembro no mesmo dia,
   e nenhuma tela dizer que isso aconteceu.

   Mora aqui, ao lado de `MESES`, `cultosDoMes` e `diasDoMes`, que é onde o
   resto do vocabulário de calendário já estava. */
export const proxMes = (iso: string): { ano: number; mes: number } => {
  const [a, m] = iso.split('-').map(Number);
  return m === 12 ? { ano: a + 1, mes: 1 } : { ano: a, mes: m + 1 };
};

/* Empate de nome: o comparador de DUAS vias (`a.nome < b.nome ? -1 : 1`)
   devolve 1 nos dois sentidos quando os nomes são IGUAIS, e aí a ordem final
   passa a ser a ordem física com que o banco devolveu as linhas — que muda
   sozinha. É o mesmo defeito que `funcoesAtivas` já corrigiu para postos, e
   que não tinha sido replicado para pessoas. Duas Marias no mesmo ministério
   não é hipótese remota. O `id` é o desempate estável. */
type ComNome = { nome: string; id?: string; vid?: string };
const chaveEstavel = (x: ComNome) => x.id ?? x.vid ?? '';
export const porNome = (a: ComNome, b: ComNome) => {
  if (a.nome !== b.nome) return a.nome < b.nome ? -1 : 1;
  const ka = chaveEstavel(a), kb = chaveEstavel(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};

/* Quem RECUSOU um posto num dia não volta no re-sorteio DAQUELE dia.

   Isto é um fato deste sorteio, não uma indisponibilidade que a pessoa
   declarou. Até 20/09 o motor transportava o fato escrevendo a data dentro de
   `v.indisponivel`, ou seja, inventando no objeto do voluntário uma linha que
   a tabela `indisponibilidades` não tem. O estrago era em três lugares, todos
   dentro da mesma sessão do navegador: `problemas()` passava a acusar "avisou
   que não pode, mas está em FOTO" depois que o líder repunha a pessoa;
   /time mostrava a data sob "Avisou que não pode"; e o motor deixava de ser
   função do estado que recebeu.

   Agora o fato é lido dos próprios slots, ANTES de o sorteio apagá-los, e
   viaja num mapa por dia. Um mapa e não um conjunto porque `aumentar`
   atravessa dias: remanejar alguém para o dia 11 precisa saber quem recusou
   o dia 11, não quem recusou o dia de onde a busca partiu. */
export type ForaDoDia = Map<string, Set<string>>;
export function quemRecusou(S: Estado, data: string): Set<string> {
  const out = new Set<string>();
  for (const sl of Object.values(S.escalas[data]?.slots || {}))
    if (sl?.vid && sl.status === 'recusado') out.add(sl.vid);
  return out;
}
const foraDe = (fora: ForaDoDia | undefined, data: string, vid: string) =>
  !!fora?.get(data)?.has(vid);

/* ------------------------------------------------------------- geração ----- */
export function gerarDia(S: Estado, data: string, fora?: ForaDoDia) {
  const dia = garantirDia(S, data);
  /* quem RECUSOU este dia não volta no re-sorteio deste dia. Lido dos slots
     ANTES de o sorteio apagá-los, e carregado à parte — ver `quemRecusou`.
     Quando `gerarMes` chama, o mapa já vem pronto para o mês inteiro. */
  const F: ForaDoDia = fora ?? new Map([[data, quemRecusou(S, data)]]);
  /* quem JÁ CONFIRMOU vale cadeado: a pessoa combinou o domingo dela e o
     sorteio não desmancha isso pelas costas do líder. Para trocar mesmo assim,
     o líder usa o select da tela (que avisa antes). */
  const intocavel = (nome: string) => {
    const sl = dia.slots[nome];
    return !!sl && (sl.fixo || sl.status === 'confirmado');
  };
  for (const f of funcoesAtivas(S)) {
    if (intocavel(f.nome)) continue;
    delete dia.slots[f.nome];
  }
  /* resto de função desativada — ou de função que este culto não tem (HEAD e
     transmissão num sábado de Follow) — não sobrevive nem bloqueia ninguém */
  const doDia = new Set(funcoesDoDia(S, data).map(f => f.nome));
  for (const nome of Object.keys(dia.slots)) {
    const meta = S.funcoes.find(f => f.nome === nome);
    if ((!meta || meta.ativa === false || !doDia.has(nome)) && !intocavel(nome)) delete dia.slots[nome];
  }
  /* `quantosPodem` e não `candidatos(...).length`: aqui só o número importa, e
     pontuar para descartar a pontuação custava 9,7% da geração do mês. A
     ORDEM que sai daqui é idêntica — é o mesmo filtro. */
  const ordem = funcoesDoDia(S, data)
    .map((f, i) => ({ f, i, n: quantosPodem(S, f.nome, data, { excluirOcupados: false, fora: F }) }))
    .sort((a, b) => a.n - b.n || a.i - b.i);

  for (const { f } of ordem) {
    if (dia.slots[f.nome]) continue;
    const c = candidatos(S, f.nome, data, { fora: F });
    if (c.length) dia.slots[f.nome] = { vid: c[0].id, status: 'pendente', fixo: false };
  }
  repararDia(S, data, F);
  dia.plantao = sugerirPlantao(S, data, S.config.plantaoQtd, F);
  return { vagas: vagasDe(S, data) };
}

/* Slot que o remanejamento não pode desmanchar: travado no cadeado OU já
   confirmado pela pessoa. Mover alguém que confirmou é quebrar um combinado. */
const travado = (sl?: Slot | null) => !!sl && (sl.fixo || sl.status === 'confirmado');

/* O ORÇAMENTO DE BUSCA QUE ESTEVE AQUI, E POR QUE ELE SAIU — 19/09/2026.

   Durante algumas horas deste dia, este arquivo teve um teto de passos para o
   backtracking de `aumentar()`, com um comentário que dizia, em números, que
   ele derrubava o mês difícil de 5.591 ms para 711 ms.

   O número estava errado, e a explicação também. Medindo com o teto variando
   de 50 a 500.000 passos, em casos de 24 a 90 postos e de 17 a 60 pessoas, a
   cobertura sai IDÊNTICA e o tempo sai IDÊNTICO. Em 90 postos e 60 pessoas —
   cinco vezes o maior ministério da igreja — são 516/900 vagas preenchidas em
   ~1.100 ms com teto 50, com teto 3.000 e com teto 500.000.

   A razão é estrutural, e estava no próprio código o tempo todo: o conjunto
   `visto` registra o par (pessoa, dia) ANTES de recursar e nunca o solta.
   Então a busca já é limitada a pessoas × dias, que é pequeno. O teto nunca
   chegava a pesar porque nunca era alcançado.

   Um botão que não liga nada é pior que botão nenhum: o próximo a passar por
   aqui vai confiar nele, vai ajustá-lo para resolver alguma lentidão, e vai
   concluir que "não adiantou nada" sem descobrir onde o tempo realmente está.
   Por isso ele saiu, e por isso este comentário fica.

   ONDE O TEMPO ESTAVA DE VERDADE: nas quatro contagens por pessoa
   (`cargaJanela`, `escalasNoMes`, `furosJanela`, `diasDesdeUltima`), que
   varriam o Estado inteiro a cada chamada. A nota delas, mais acima, tem a
   medição e o resultado — 2.968 ms para 223 ms, com a mesma escala saindo do
   outro lado, provado em `scripts/engine-contagens.test.mjs`.

   A LIÇÃO, que vale mais que a correção: uma medição só prova causa quando
   VARIA aquilo que se afirma ser a causa. Eu tinha medido "antes e depois" de
   uma mudança que fez duas coisas ao mesmo tempo e creditei a errada. */

function aumentar(S: Estado, data: string, F: string, visto: Set<string>, dias: string[], fora?: ForaDoDia): boolean {
  /* `ignorarLimite` de propósito: quem já bateu o teto do mês ainda é
     candidato AQUI, porque a linha mais abaixo confere o teto e, se ele
     estourou, tenta liberar um domingo dessa pessoa em outro dia. É esse
     remanejamento que `aumentar` existe para achar. */
  const lista = candidatos(S, F, data, { excluirOcupados: false, ignorarLimite: true, fora });
  for (const c of lista) {
    const chave = c.id + '|' + data;
    if (visto.has(chave)) continue;
    visto.add(chave);

    /* candidato já ocupado hoje: só serve se conseguirmos liberar TODOS os
       slots que CONFLITAM com F (simultâneos, quando F é simultânea).
       Slot de função pós-culto não conflita; slot de função inativa é lixo
       e é só removido, sem repor. */
    const ehSim = metaFuncao(S, F).simultanea;
    const ocupadas = Object.entries(S.escalas[data]?.slots || {})
      .filter(([fn, sl]) => fn !== F && sl?.vid === c.id).map(([fn]) => fn);
    const conflitantes = ehSim ? ocupadas.filter(fn => metaFuncao(S, fn).simultanea) : [];
    if (conflitantes.length > 1) continue;
    if (conflitantes.some(fn => travado(S.escalas[data].slots[fn]))) continue;
    if (conflitantes.length === 1) {
      const ocup = conflitantes[0];
      const meta = S.funcoes.find(f => f.nome === ocup);
      const s2 = S.escalas[data].slots[ocup];
      delete S.escalas[data].slots[ocup];
      garantirDia(S, data).slots[F] = { vid: c.id, status: 'pendente', fixo: false };
      if (!meta || meta.ativa === false) return true;      // função morta: não repõe
      if (aumentar(S, data, ocup, visto, dias, fora)) return true;
      delete S.escalas[data].slots[F];
      S.escalas[data].slots[ocup] = s2;
      continue;
    }
    if (ocupadas.length && !ehSim) {
      /* F é pós-culto: acumular é legal, não precisa liberar nada */
    } else if (ocupadas.length) {
      /* ocupado só em pós-culto e F simultânea: também é legal */
    }

    const [ano, mes] = data.split('-').map(Number);
    /* `??`: zero é teto. Mesma correção de `elegiveis`. */
    const limite = vol(S, c.id)?.limiteMes ?? S.config.limitePadrao;
    /* pôr esta pessoa aqui só gasta um DIA novo se ela ainda não está neste
       dia em nenhum outro posto. */
    const jaNesteDia = Object.values(S.escalas[data]?.slots || {}).some(x => x?.vid === c.id);
    const custa = jaNesteDia ? 0 : 1;
    if (escalasNoMes(S, c.id, ano, mes) + custa <= limite) {
      garantirDia(S, data).slots[F] = { vid: c.id, status: 'pendente', fixo: false };
      return true;
    }

    /* REMANEJAMENTO ENTRE DIAS: tirar a pessoa de outro dia para caber aqui.
       Só é neutro no teto quando tirar aquele posto LIBERA O DIA d2, ou seja,
       quando é o único posto dela lá. Sem essa guarda, quem tinha FOTO e
       EDIÇÃO no mesmo domingo perdia um dos dois, continuava naquele domingo,
       e ganhava mais um — um dia a mais no mês, acima do teto.

       Medido em 20/09: 17 pessoas, 11 postos, teto 2. Depois de `gerarDia` em
       todos os dias, ninguém acima do teto; depois da segunda passada de
       `gerarMes`, 6 das 17 com 3 domingos. O teste que deveria ter pego isso
       (`engine-tempo`, "ninguem passou do limite do mes") rodava com
       `limite: 10`, e o próprio arquivo escreve que nenhum ministério usa 10.
       Produção usa 4, e o Louvor usa 6: os dois valores quebrados. */
    for (const d2 of dias) {
      if (d2 === data) continue;
      const postosLa = Object.entries(S.escalas[d2]?.slots || {}).filter(([, sl]) => sl?.vid === c.id);
      if (postosLa.length !== 1) continue;
      for (const [F2, s] of postosLa) {
        if (travado(s)) continue;
        delete S.escalas[d2].slots[F2];
        garantirDia(S, data).slots[F] = { vid: c.id, status: 'pendente', fixo: false };
        if (aumentar(S, d2, F2, visto, dias, fora)) return true;
        delete S.escalas[data].slots[F];
        S.escalas[d2].slots[F2] = s!;
      }
    }
  }
  return false;
}

export function repararDia(S: Estado, data: string, fora?: ForaDoDia) {
  const Fo: ForaDoDia = fora ?? new Map([[data, quemRecusou(S, data)]]);
  let n = 0;
  for (const F of vagasDe(S, data)) if (aumentar(S, data, F, new Set(), [data], Fo)) n++;
  return n;
}

export function gerarMes(S: Estado, ano: number, mes: number, aPartirDe?: string) {
  /* `diasDoMes` e não `cultosDoMes`: os eventos esporádicos da 54 entram no
     mesmo sorteio, com as mesmas regras, que é o pedido inteiro. */
  const todos = diasDoMes(S, ano, mes);
  /* dias antes do corte são história: contam na carga e no teto, mas nunca
     são regenerados nem usados como origem/destino de remanejamento */
  const dias = aPartirDe ? todos.filter(d => d >= aPartirDe) : todos;
  /* o mapa de recusas é montado para o mês INTEIRO antes do primeiro sorteio,
     porque `gerarDia` apaga os slots recusados e o remanejamento do segundo
     laço atravessa dias: ele precisa saber quem recusou o dia de DESTINO. */
  const fora: ForaDoDia = new Map(dias.map(d => [d, quemRecusou(S, d)]));
  for (const d of dias) gerarDia(S, d, fora);
  for (const D of dias) {
    for (const F of vagasDe(S, D)) aumentar(S, D, F, new Set(), dias, fora);
  }
  for (const d of dias) S.escalas[d].plantao = sugerirPlantao(S, d, S.config.plantaoQtd, fora);
  return dias.map(d => ({ data: d, vagas: vagasDe(S, d) }));
}

/* ------------------------------------------------------------- problemas --- */
/* `foco` são os postos que o problema aponta. Sem isso o aviso era só uma
   frase: "Fulano está em PROJEÇÃO e ILUMINAÇÃO ao mesmo tempo" e o líder que
   se virasse para achar as duas linhas numa lista de nove. Com o foco, a
   frase vira caminho. */
export type Problema = { grau: 'erro' | 'aviso'; texto: string; foco?: string[] };

export function problemas(S: Estado, data: string): Problema[] {
  const dia = S.escalas[data];
  const out: Problema[] = [];
  if (!dia) return out;

  const porPessoa: Record<string, string[]> = {};
  for (const [fn, slot] of Object.entries(dia.slots || {})) {
    if (slot?.vid) (porPessoa[slot.vid] ||= []).push(fn);
  }
  for (const [vid, fns] of Object.entries(porPessoa)) {
    if (fns.length < 2) continue;
    const sim = fns.filter(f => metaFuncao(S, f).simultanea);
    if (sim.length >= 2) out.push({ grau: 'erro', foco: sim, texto: `${nomeDe(S, vid)} está em ${sim.join(' e ')} ao mesmo tempo.` });
    else out.push({ grau: 'aviso', foco: fns, texto: `${nomeDe(S, vid)} está em duas funções (${fns.join(' + ')}).` });
  }
  for (const [fn, slot] of Object.entries(dia.slots || {})) {
    const v = vol(S, slot?.vid);
    if (v && (v.indisponivel || []).includes(data)) {
      out.push({ grau: 'erro', foco: [fn], texto: `${v.nome} avisou que não pode neste dia, mas está em ${fn}.` });
    }
  }
  const vagas = vagasDe(S, data);
  if (vagas.length) out.push({ grau: 'erro', foco: vagas, texto: `Sem ninguém em ${vagas.join(', ')}.` });
  return out;
}

/* Quem está escalado neste dia e ainda não respondeu. Uma mensagem só, para o
   grupo, com os nomes.

   Por que isso não existia e por que faz falta: 50 das 64 escalações futuras
   estão pendentes. A cobrança que já existia era individual (msgCobranca, um
   WhatsApp por pessoa, no painel) ou era sobre DISPONIBILIDADE do mês, que é
   outra pergunta. Cobrar confirmação de um domingo, no grupo, de uma vez, não
   tinha botão em lugar nenhum, e é o que o líder faz na terça de manhã. */
export function msgConfirmar(S: Estado, data: string) {
  const dia = S.escalas[data];
  const faltam = funcoesDoDia(S, data)
    .map(f => dia?.slots?.[f.nome])
    .filter(sl => sl?.vid && (sl.status || 'pendente') === 'pendente')
    .map(sl => nomeDe(S, sl!.vid!));
  const nomes = [...new Set(faltam)];
  if (!nomes.length) return '';
  const quem = nomes.length === 1 ? nomes[0]
    : nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1];
  const dia_ = tipoDoDia(data) === 'follow' ? 'o Follow de sábado' : 'domingo';
  return `${quem}: vocês estão na escala d${dia_ === 'domingo' ? 'e domingo' : 'o Follow de sábado'} (${fmtDia(data)}) `
    + `e ainda falta confirmar. Entrem no link de vocês e toquem em EU VOU. `
    + `Se não puder, marca "não posso" que eu chamo outra pessoa, sem problema.`;
}

/* A COR DO DIA, EM UM LUGAR SÓ — 20/09/2026.

   Esta decisão estava escrita duas vezes: aqui, dentro de `resumoDia`, e à
   mão dentro de `app/painel/page.tsx`, na função `leitura()`. As duas JÁ
   DIVERGIRAM uma vez, em 05/09: "1 não pode" saía âmbar na visão geral e
   vermelho no bloco de baixo, na mesma rolagem. O comentário que conta essa
   história ainda está no painel, e ele termina dizendo "a regra agora é a
   mesma dos dois lados" — o que era verdade naquele dia e continuaria sendo
   por acaso, até a próxima regra nova entrar só de um lado.

   Cor é a primeira coisa que se lê num painel. Se ela discorda de si mesma,
   o líder para de confiar na cor, e aí o painel inteiro vira decoração.

   A regra: falta gente (vaga, furo ou recusa) = vermelho; ninguém respondeu
   ainda = âmbar; o resto = verde. */
export type Situacao = 'ok' | 'atencao' | 'critico';
export function classificar(n: {
  vagas: number; furos: number; recusados: number; pendentes: number;
}): Situacao {
  if (n.vagas > 0 || n.furos > 0 || n.recusados > 0) return 'critico';
  return n.pendentes > 0 ? 'atencao' : 'ok';
}

export function resumoDia(S: Estado, data: string) {
  const dia = S.escalas[data];
  const ativos = funcoesDoDia(S, data);
  const preenchidos = ativos.filter(f => dia?.slots?.[f.nome]?.vid);
  const confirmados = preenchidos.filter(f => dia.slots[f.nome].status === 'confirmado');
  const recusados = preenchidos.filter(f => dia.slots[f.nome].status === 'recusado');
  const furos = preenchidos.filter(f => dia.slots[f.nome].status === 'furou');
  const pendentes = preenchidos.filter(f => (dia.slots[f.nome].status || 'pendente') === 'pendente');
  const vagas = vagasDe(S, data);
  const situacao = classificar({
    vagas: vagas.length, furos: furos.length,
    recusados: recusados.length, pendentes: pendentes.length,
  });
  return {
    total: ativos.length, preenchidos: preenchidos.length,
    confirmados: confirmados.length, pendentes: pendentes.length,
    recusados: recusados.length, furos: furos.length, vagas, situacao,
  };
}

/* ------------------------------------------------------------- mensagens --- */
export function msgEscala(S: Estado, data: string) {
  const dia = S.escalas[data] || { slots: {}, plantao: [], obs: '' };
  /* `dia.evento` e não só `data`: sem ele a mensagem do grupo saía dizendo
     "Escala de domingo (15/10)" numa QUINTA de evento. A tela já acertava,
     porque passa o evento; a mensagem ficou para trás quando a 54 criou o
     terceiro tipo de dia, e é ela que vai para o WhatsApp de todo mundo. */
  const L: string[] = [S.config.saudacao,
    `${tituloDoCulto(data, dia.evento)} (${fmtDia(data)})`, ''];
  for (const f of funcoesDoDia(S, data)) {
    const sl = dia.slots?.[f.nome];
    L.push(f.nome);
    /* mostrar quem já confirmou é o empurrão mais barato que existe: o
       compromisso deixa de ser combinado no privado e passa a ser público. */
    if (!sl?.vid) L.push('*** PRECISO DE ALGUÉM ***');
    else if (sl.status === 'confirmado') L.push(`${nomeDe(S, sl.vid)} (confirmou)`);
    else if (sl.status === 'recusado') L.push('*** PRECISO DE ALGUÉM ***');
    else if (sl.status === 'furou') L.push('*** PRECISO DE ALGUÉM ***');
    else L.push(`${nomeDe(S, sl.vid)} (falta confirmar)`);
    L.push('');
  }
  if (dia.plantao?.length) {
    L.push('PLANTÃO (entra se alguém furar)');
    dia.plantao.forEach(p => L.push(nomeDe(S, p)));
    L.push('');
  }
  if (dia.obs) { L.push(dia.obs); L.push(''); }
  L.push((S.config.rodape || '').replace('{PRAZO}', S.config.prazoConfirmacao));
  return L.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function msgConvite(S: Estado, vid: string, base: string) {
  const v = vol(S, vid);
  if (!v) return '';
  return `${v.nome.trim()}, esse é o seu link pessoal da escala${S.equipe ? ` de ${S.equipe}` : ''}. `
    + `Salva no favorito: sempre que você for escalado, é aqui que você confirma e é aqui que você avisa quando não pode.\n\n`
    + `${base}/eu/${v.token}`;
}

export function msgCobranca(S: Estado, vid: string, data: string, base: string) {
  const v = vol(S, vid);
  const fns = Object.entries(S.escalas[data]?.slots || {}).filter(([, s]) => s?.vid === vid).map(([f]) => f);
  return `${(v?.nome || '').trim()}, você está na escala d${tipoDoDia(data) === 'follow' ? `o Follow de sábado` : 'e domingo'} (${fmtDia(data)}) em ${fns.join(' e ')}. `
    + `Confirma no seu link até ${S.config.prazoConfirmacao}?\n${base}/eu/${v?.token}#confirmar`;
}

export function msgColeta(S: Estado, ano: number, mes: number, _base: string) {
  const doms = domingosDoMes(ano, mes).map(fmtDia).join(', ');
  const sabs = sabadosDoFollow(ano, mes).map(fmtDia).join(', ');
  return `${S.config.saudacao}\n\nVou montar a escala de ${MESES[mes - 1]}. Domingos: ${doms}.`
    + (sabs ? `\nFollow (sábado): ${sabs}.` : '') + `\n\n`
    + `Entra no seu link pessoal e marca só os dias em que você NÃO pode. `
    + `Quem não marcar nada entra no rodízio normal.\n\nSe você quer aprender uma função nova, me chama que eu encaixo você como dupla de treino.`;
}

/* ------------------------------------------- auditoria do que foi declarado

   O que o sistema consegue afirmar sozinho é pouco, e o pouco tem que ser
   certo: alerta falso ensina o líder a ignorar o painel.

   NÃO serve como sinal: a pessoa ser titular em duas áreas simultâneas. Isso
   é o normal de quem serve — num domingo ela faz uma, no outro faz a outra, e
   o banco já impede as duas no mesmo culto. Acusar isso enche a tela de gente
   inocente.

   Serve como sinal:

   1. PILAR ÚNICO. Se esta declaração estiver errada, a área fica com uma
      pessoa ou com nenhuma. Não julga a pessoa, mede o risco: é o que decide
      o que o líder confere primeiro.

   2. SEM GRADIENTE. Marcou 4 ou mais áreas, todas exatamente no mesmo nível,
      nada conferido. Ninguém tem competência idêntica em 4 coisas diferentes;
      é a assinatura de quem tocou uma vez em cada chip e saiu.

   Nada bloqueia ninguém. O resultado é uma fila de conferência ordenada por
   quanto a escala depende daquilo estar certo.                              */
export type Suspeita = {
  vid: string; nome: string; motivo: 'pilar_unico' | 'sem_gradiente';
  areas: string[]; nivel?: Nivel; texto: string;
};

/* Quantas pessoas seguem aptas nesta área se tirarmos esta pessoa. */
function aptosSem(S: Estado, funcao: string, vid: string) {
  return S.voluntarios.filter(v =>
    v.ativo && v.id !== vid && podeNoPosto(S, v, funcao)
    && ['titular', 'reserva'].includes(nivelEfetivo(v, funcao) as string)).length;
}

export function declaracoesSuspeitas(S: Estado): Suspeita[] {
  const out: Suspeita[] = [];
  const ativas = funcoesAtivas(S).map(f => f.nome);
  for (const v of S.voluntarios) {
    if (!v.ativo) continue;
    const areas = Object.keys(v.funcoes || {}).filter(f => ativas.includes(f));
    const naoConferidas = areas.filter(f => !confirmada(v, f));
    if (!naoConferidas.length) continue;
    const p = v.nome.trim();

    const pilar = naoConferidas.filter(f =>
      ['titular', 'reserva'].includes(v.funcoes[f]) && aptosSem(S, f, v.id) <= 1);
    if (pilar.length) {
      const detalhe = pilar.map(f => {
        const n = aptosSem(S, f, v.id);
        return `${f} (fica com ${n === 0 ? 'ninguém' : '1 pessoa'})`;
      }).join(', ');
      out.push({
        vid: v.id, nome: v.nome, motivo: 'pilar_unico', areas: pilar,
        texto: `A escala inteira depende desta declaração de ${p}: ${detalhe}. `
          + `Ninguém conferiu ainda, então confira estas primeiro.`,
      });
    }

    const niveis = new Set(naoConferidas.map(f => v.funcoes[f]));
    if (naoConferidas.length >= 4 && niveis.size === 1) {
      const nivel = [...niveis][0];
      out.push({
        vid: v.id, nome: v.nome, motivo: 'sem_gradiente', areas: naoConferidas, nivel,
        texto: `${p} marcou ${naoConferidas.length} áreas e todas exatamente como ${nivel}, `
          + `sem diferença nenhuma entre elas. Vale perguntar em quais dessas a pessoa realmente `
          + `segura sozinha e em quais ela prefere estar acompanhada.`,
      });
    }
  }
  /* risco primeiro: o que quebra a escala antes do que só parece estranho */
  return out.sort((a, b) =>
    (a.motivo === 'pilar_unico' ? 0 : 1) - (b.motivo === 'pilar_unico' ? 0 : 1)
    || b.areas.length - a.areas.length
    || porNome(a, b));
}

/* A fila de conferência do líder, uma área por vez: quem declarou o quê e
   ainda não passou por ninguém. Área vazia some da fila. */
export function filaDeConferencia(S: Estado) {
  return funcoesAtivas(S).map(f => ({
    funcao: f.nome, funcaoId: f.id,
    pendentes: S.voluntarios
      .filter(v => v.ativo && v.funcoes?.[f.nome] && !confirmada(v, f.nome))
      .map(v => ({ id: v.id, nome: v.nome, declarou: v.funcoes[f.nome], efetivo: nivelEfetivo(v, f.nome)! }))
      .sort(porNome),
  })).filter(x => x.pendentes.length);
}

/* O QUE A REGRA DO PRÉDIO ESTÁ SEGURANDO HOJE.
   Uma regra que o sistema aplica sozinho e em silêncio é uma vaga que fica
   vazia sem ninguém entender por quê. Esta função existe para a tela poder
   dizer a frase inteira: quem falta informar, e qual posto ficou sem gente.

   `semSexo` só lista quem a falta de informação realmente atrapalha — alguém
   habilitado num posto que exige. Pedir o sexo de quem só serve na Projeção
   seria coletar dado por coletar. */
export function pendenciasDeSexo(S: Estado) {
  const comExigencia = funcoesAtivas(S).filter(f => f.exigeSexo);
  const ativos = S.voluntarios.filter(v => v.ativo);

  const semSexo = ativos
    .filter(v => !v.sexo && comExigencia.some(f => nivelEfetivo(v, f.nome)))
    .map(v => ({ id: v.id, nome: v.nome }))
    .sort(porNome);

  /* posto que exige e não tem ninguém que possa: a vaga nunca vai preencher */
  const postosSemNinguem = comExigencia
    .filter(f => !ativos.some(v => podeNoPosto(S, v, f.nome)
      && ['titular', 'reserva'].includes(nivelEfetivo(v, f.nome) as string)))
    .map(f => ({ nome: f.nome, exigeSexo: f.exigeSexo! }));

  /* já está escalado num posto que não aceita: entrou antes da regra existir */
  const escaladosErrados: { data: string; funcao: string; nome: string }[] = [];
  for (const [data, dia] of Object.entries(S.escalas)) {
    for (const [fn, slot] of Object.entries(dia.slots || {})) {
      if (!slot?.vid) continue;
      const v = S.voluntarios.find(x => x.id === slot.vid);
      if (v && !podeNoPosto(S, v, fn)) escaladosErrados.push({ data, funcao: fn, nome: v.nome });
    }
  }
  escaladosErrados.sort((a, b) => (a.data < b.data ? -1 : 1));

  return { semSexo, postosSemNinguem, escaladosErrados };
}

/* ----------------------------------------------------------- diagnóstico --- */
export function saudeDoTime(S: Estado) {
  const ref = hojeISO();
  const funcoes = funcoesAtivas(S).map(f => {
    /* quem NÃO PODE entrar no posto não conta como gente da área. Contar
       fazia o painel dizer "ok, 21 pessoas" para um posto de homens em que
       só 9 podem entrar — o mesmo jeito de mentir que já tinha acontecido
       ao contar declaração não conferida como titular. */
    const ativos = S.voluntarios.filter(v => v.ativo && podeNoPosto(S, v, f.nome));
    const aptos = ativos.filter(v => ['titular', 'reserva'].includes(nivelEfetivo(v, f.nome) as string));
    const treino = ativos.filter(v => nivelEfetivo(v, f.nome) === 'treino');
    /* quem a gente SABE que segura a área sozinho. Contar declaração como
       titular fazia o painel dizer "ok" para área que na real tem uma pessoa
       só, e o líder só descobria no domingo. */
    const titulares = ativos.filter(v => v.funcoes?.[f.nome] === 'titular' && confirmada(v, f.nome));
    const declarados = ativos.filter(v => v.funcoes?.[f.nome] === 'titular' && !confirmada(v, f.nome));
    const grau = aptos.length <= 1 ? 'critico'
      : titulares.length === 0 ? 'critico'
      : aptos.length === 2 || titulares.length === 1 ? 'atencao' : 'ok';
    const texto = aptos.length === 0 ? 'ninguém sabe fazer'
      : aptos.length === 1 ? 'uma pessoa só'
      : titulares.length === 0 ? (declarados.length ? 'ninguém conferido: só o que se declararam' : 'sem titular')
      : titulares.length === 1 ? 'um titular só'
      : aptos.length === 2 ? 'sem folga' : 'ok';
    return {
      nome: f.nome, aptos: aptos.length, treino: treino.length,
      titulares: titulares.length, declarados: declarados.length, grau, texto,
    };
  });
  const pessoas = S.voluntarios.map(v => ({
    id: v.id, nome: v.nome, ativo: v.ativo,
    carga: cargaJanela(S, v.id, ref, S.config.janelaCarga),
    furos: furosJanela(S, v.id, ref, S.config.janelaCarga),
    parado: diasDesdeUltima(S, v.id, ref),
    funcoes: Object.keys(v.funcoes || {}),
  })).sort((a, b) => b.carga - a.carga || porNome(a, b));
  return { funcoes, pessoas };
}
