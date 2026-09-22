/* AS REGRAS, EM UM LUGAR SÓ.

   Nada aqui toca rede. É tudo função pura, e é por isso que dá para testar
   sem banco e sem navegador (`npm test`).

   A parte mais importante deste arquivo é `acoesDe`: ela decide quais botões
   a tela mostra. Botão que o servidor recusa é pior que botão que não existe
   — a pessoa toca, toma um "sem permissão" e conclui que o sistema está
   quebrado. Se você mexer numa das duas pontas, mexa na outra e rode os
   testes: eles conferem a matriz inteira de papel × setor × status.

   ---- 22/09/2026: A LISTA DE ONTEM ENVELHECEU, COMO ELA MESMA AVISOU -----

   A versão anterior deste cabeçalho listava NOVE divergências em cinco
   linhas e terminava dizendo, sobre si mesma, "esta lista é o que temos, e
   ela envelhece". Envelheceu em um dia.

   Uma auditoria nova varreu as 720 células de hoje (48 combinações de
   estado e papel × as 15 ações de `Acao`), chamando `dem_mover` de verdade
   em cada uma. Das cinco linhas que estavam escritas aqui, TRÊS já não
   divergem: as três de `travar` sobre demanda travada. Elas caíram sozinhas
   quando `acoesDe` parou de esconder `travar` do que já está travado (o
   porquê está lá embaixo, na própria linha: re-travar com outro motivo TROCA
   o motivo, e obrigar a destravar antes gravava dois eventos no histórico
   para uma coisa que não aconteceu).

   E a MAIOR classe de divergência de hoje não estava mencionada em lugar
   nenhum: `desanexar`, sozinha, é 48 das 720 células.

   O que diverge hoje são três, e todas na mesma direção de sempre: a tela
   ESCONDE, o banco ACEITA:

     assumir · demanda em execução cujo dono já é VOCÊ MESMO
       DECISÃO. O servidor (85:330, com a guarda de dono da 86) exige
       `pode_atender`, portão aberto e `responsavel_id is null or = m.id`; e
       não olha o status. Ou seja: aceita, e o efeito é reescrever o que já
       está escrito. A tela some com o botão porque "Assumir e começar" numa
       demanda que você já assumiu e já começou não oferece nada, e botão
       que não faz nada é como uma grade de doze fica ilegível.

     destravar · trava de TERCEIROS, por quem abriu
       DÍVIDA, e é a mesma de 21/09 com um dia a mais. A migração 67 tirou o
       rótulo da trava do guarda de propósito ("o portão é a APROVAÇÃO; a
       trava é só como ela aparece na tela"), então o servidor (85:354) aceita
       `pode_atender OR aberta_por` sobre QUALQUER rótulo. A tela só oferece
       sobre `informacao`, que é o único caso em que quem pediu tem a resposta
       na mão. Enquanto o banco não ler o rótulo, quem abriu destrava por
       chamada direta uma demanda que ainda espera alguém de fora, e a tela
       escondendo o botão é justamente o que faz ninguém descobrir.

     desanexar · as 48 células, em todo estado e todo papel
       DECISÃO, e a única das três que é divergência por CONSTRUÇÃO.
       `acoesDe` decide por DEMANDA; o servidor (85:314) decide por ANEXO:
       `pode_atender(m,d) OR a.membro_id = m.id`. Quem abriu e não atende só
       tira o que ele mesmo colou, e esta função nunca vai saber de quem é o
       anexo. Por isso `desanexar` saiu daqui em 22/09 e quem responde é o
       `posso_tirar` que a migração 89 pôs em `dem_ver`, com a MESMA expressão
       do `desanexar`, linha a linha da lista de anexos. A matriz conta as 48
       como divergência porque ela pergunta por demanda; a pergunta é que não
       cabe.

   A LIÇÃO, escrita para a próxima pessoa: tela mais restritiva que o banco
   NÃO é segurança, é um defeito escondido. A regra tem que existir no banco;
   esconder o botão só adia a descoberta. É por isso que as duas DECISÕES
   acima dizem o que a tela ganha em esconder, e a DÍVIDA diz o que se perde:
   a diferença entre as duas coisas é essa frase, e não o tamanho do desvio.

   DÍVIDA ANOTADA, E ELA É A RAIZ DAS OUTRAS: não existe teste que compare
   estas duas pontas automaticamente: o comparador da auditoria continua
   sendo um script de uma vez só, em JS, contra o banco. Enquanto ele não
   existir, esta lista é o que temos, e ela envelhece de novo. Em um dia, da
   última vez. */

import type {
  Aprovacao, Categoria, Papel, Prioridade, RegraDeAnexo, Resumo, Status, Trava,
} from './tipos';
/* o chão de transporte é o mesmo dos dois sistemas: mesmo Postgres, mesmo
   PostgREST, mesma rede. Ver a nota em `recadoDoErro`. `lib/erros.ts` é puro
   e não importa nada de escalas, então isto não acopla um sistema ao outro. */
import { humano } from '../erros';

/* ---------------------------------------------------------------- palavras */

export const STATUS: { v: Status; rot: string; tom: 'neutro' | 'ok' | 'warn' | 'bad' }[] = [
  { v: 'aberta',    rot: 'Aberta',      tom: 'neutro' },
  { v: 'execucao',  rot: 'Em execução', tom: 'ok' },
  { v: 'travada',   rot: 'Travada',     tom: 'warn' },
  { v: 'concluida', rot: 'Concluída',   tom: 'ok' },
  { v: 'cancelada', rot: 'Cancelada',   tom: 'bad' },
];

export const TRAVAS: { v: Trava; rot: string; curto: string }[] = [
  { v: 'informacao', rot: 'Esperando informação de quem pediu', curto: 'falta informação' },
  { v: 'aprovacao',  rot: 'Esperando aprovação',                curto: 'falta aprovação' },
  { v: 'terceiros',  rot: 'Esperando alguém de fora',           curto: 'esperando terceiros' },
];

export const PRIORIDADES: { v: Prioridade; rot: string; explica: string }[] = [
  { v: 'baixa',   rot: 'Baixa',   explica: 'Importante, mas não muda nada esta semana.' },
  { v: 'normal',  rot: 'Normal',  explica: 'Entra no fluxo regular do setor.' },
  { v: 'alta',    rot: 'Alta',    explica: 'Afeta uma atividade próxima, um evento ou uma equipe.' },
  { v: 'urgente', rot: 'Urgente', explica: 'Afeta um culto, um evento ou a operação. Precisa dizer qual.' },
];

export const rotStatus = (s: Status) => STATUS.find(x => x.v === s)?.rot ?? s;
export const tomStatus = (s: Status) => STATUS.find(x => x.v === s)?.tom ?? 'neutro';
export const rotTrava = (t: Trava | null) => (t ? TRAVAS.find(x => x.v === t)?.rot ?? t : '');
export const rotPrioridade = (p: Prioridade) => PRIORIDADES.find(x => x.v === p)?.rot ?? p;

/** O tom da pílula. `undefined` é o neutro: pílula sem cor, que é o padrão.
    Existe porque cor aqui significa estado, e "aberta" não é um estado que
    mereça cor — se tudo tem cor, cor para de significar. */
export const tomPill = (s: Status): 'ok' | 'warn' | 'bad' | undefined => {
  const t = tomStatus(s);
  return t === 'neutro' ? undefined : t;
};

/** A prioridade só ganha cor quando pede pressa. Baixa e normal ficam mudas. */
export const tomPrioridade = (p: Prioridade): 'warn' | 'bad' | undefined =>
  p === 'urgente' ? 'bad' : p === 'alta' ? 'warn' : undefined;

/* ------------------------------------------------- os 11 status do documento

   O PDF lista onze. Cinco mudam o que acontece em seguida; os outros seis são
   momentos ou motivos, e viram campo em vez de estado. Nenhum se perde: esta
   tabela é o de-para, e é ela que os indicadores usam para responder
   "quantas reabertas", "quantas esperando aprovação".

   Foi escrita aqui, e não num documento à parte, porque documento à parte
   ninguém abre quando muda o código.                                         */

/* DOIS DOS ONZE NÃO SÃO ESTADO, E UM DELES ERA UM RAMO MORTO — 22/09/2026.

   O tipo listava os onze nomes do documento. Dois nunca são devolvidos, e a
   diferença entre eles é o que este comentário existe para registrar:

   · "Em triagem" era um RAMO MORTO com cara de estado. A última linha da
     função pedia `status='aberta'` COM responsável, e NENHUMA ação do
     servidor produz esse par: `assumir` grava `responsavel_id` e
     `status='execucao'` na MESMA instrução (85:331), e `redirecionar` zera o
     responsável (50:745). Medido: não há caminho no `dem_mover` que deixe
     responsável em demanda aberta. A triagem do PDF ("qual setor atende,
     qual a prioridade, precisa de aprovação") foi resolvida na CATEGORIA, no
     nascimento — `dem_abrir` já escolhe o setor, o prazo padrão e o portão de
     aprovação pela categoria. Ela não é um estado por onde a demanda passa:
     ela já aconteceu quando a demanda existe. O estado colapsa em "Aberta".

   · "Rascunho" nunca existiu no banco de propósito: no documento é "ainda
     não enviada", e aqui uma demanda só existe depois de enviada. O rascunho
     mora no `localStorage` da tela de abertura, que é onde ele deve morar —
     linha de tabela para uma coisa que a pessoa ainda não mandou é lixo que
     alguém vai ter que limpar, e é a origem clássica do "sistema tem 4 mil
     demandas e 300 de verdade".

   Os dois saem do TIPO, e não só do corpo: tipo que promete um valor que
   nunca chega faz o `tsc` aceitar `if (x === 'Em triagem')` calado, que é
   como um ramo morto vira dois. */
export type EstadoDoPDF =
  | 'Aberta' | 'Aguardando aprovação' | 'Aprovada'
  | 'Em execução' | 'Aguardando informações' | 'Aguardando terceiros'
  | 'Concluída' | 'Cancelada' | 'Reaberta';

export function comoOPdfChama(d: {
  status: Status; travada_por?: Trava | null; aprovacao?: Aprovacao;
  falta_aprovacao?: boolean;
  reaberturas?: number;
}): EstadoDoPDF {
  if (d.status === 'cancelada') return 'Cancelada';
  if (d.status === 'concluida') return 'Concluída';
  /* A PÍLULA LIA A COLUNA ENQUANTO `acoesDe` JÁ LIA O VEREDITO — 22/09/2026.

     A migração 88 fez o servidor devolver `falta_aprovacao`, e `acoesDe`
     passou a usá-lo. Esta função ficou para trás, e o resultado medido é o
     pior dos dois mundos: com a categoria passando a exigir aprovação depois
     que a demanda nasceu, `acoesDe` (certo) tira "Concluir" e "Assumir", e a
     pílula (errada) continua escrita "Aberta".

       quem atende  -> grade sem Concluir, sem Assumir, pílula "Aberta"
       gestor       -> grade com "Aprovar",            pílula "Aberta"

     A demanda congela e a tela não tem uma palavra sobre o porquê. Tirar o
     botão certo sem dizer o motivo não é meio conserto: é o mesmo defeito
     com outra cara, porque a pessoa conclui que o sistema quebrou.

     Vem ANTES do teste de `travada` de propósito: o portão é o fato mais
     importante sobre a demanda enquanto estiver fechado, qualquer que seja o
     rótulo da trava. */
  if (d.falta_aprovacao) return 'Aguardando aprovação';
  if (d.status === 'travada') {
    if (d.travada_por === 'aprovacao') return 'Aguardando aprovação';
    if (d.travada_por === 'terceiros') return 'Aguardando terceiros';
    return 'Aguardando informações';
  }
  if (d.status === 'execucao') return (d.reaberturas ?? 0) > 0 ? 'Reaberta' : 'Em execução';
  /* aberta */
  if (d.aprovacao === 'aprovada') return 'Aprovada';
  return 'Aberta';
}

/* ------------------------------------------------------------------ prazos */

/* O "HOJE" DO SISTEMA VIRAVA ÀS 21H — 20/09/2026.

   `new Date().toISOString()` é SEMPRE UTC, qualquer que seja o aparelho. A
   igreja é do Rio (UTC-03). Das 21h às 23h59, `HOJE()` já respondia amanhã.

   Medido com o instante 05/10/2026 21h30 no Rio:

       HOJE() respondia ......... 2026-10-06
       a data real no Rio era ... 2026-10-05
       demanda com prazo para HOJE (05/10):
         situacao()     -> 'atrasada'   (devia ser 'hoje')
         diasDeAtraso() -> 1            (o prazo só vence à meia-noite)
         prazo sugerido (categoria de 3 dias) -> 09/10 em vez de 08/10

   Quem consome: /demandas (quatro lugares) e /demandas/d/[numero] (três).
   Ou seja: toda noite, das 21h em diante, o painel inteiro ficava vermelho
   três horas antes da hora, e quem abrisse o app depois do culto de domingo
   à noite via as próprias demandas como atrasadas.

   `app/api/cron/route.ts` já resolve isso certo, com `dataSP()`. Este é o
   mesmo remédio.

   O BANCO TEM O MESMO DESVIO, POR OUTRO CAMINHO: `current_date` aparece em
   seis pontos de `supabase/50-demandas.sql` (`atrasada`, `dem_lista`,
   `atraso_motivo` em `concluir`, e três em `dem_numeros`). O Supabase roda em
   UTC e não há `set timezone` em migração nenhuma, então os dois lados erram
   JUNTO — o que é consistente e igualmente errado. Trocar para
   `(now() at time zone 'America/Sao_Paulo')::date` nos seis pontos fica para
   a próxima migração de Demandas; mexer neles é mexer em `dem_lista` e
   `dem_numeros`, que é cirurgia com conferência própria e não cabe de
   carona. Enquanto isso, a tela para de errar sozinha. */
export const HOJE = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

export function somaDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** A data que o formulário sugere quando a categoria tem prazo padrão. */
export function prazoSugerido(c: Categoria | undefined, hoje = HOJE()): string {
  if (!c?.prazo_padrao_dias) return '';
  return somaDias(hoje, c.prazo_padrao_dias);
}

export type Situacao = 'atrasada' | 'hoje' | 'parada' | 'fechada' | 'em dia';

/** Uma palavra para o estado de tempo. A ordem importa: atraso ganha de tudo. */
export function situacao(d: Pick<Resumo, 'status' | 'prazo' | 'parada_dias'>, hoje = HOJE()): Situacao {
  if (d.status === 'concluida' || d.status === 'cancelada') return 'fechada';
  if (d.prazo && d.prazo < hoje) return 'atrasada';
  if (d.prazo === hoje) return 'hoje';
  /* "demandas sem movimentação por determinado período devem aparecer como
     pendentes de atenção" — sete dias é o período. */
  if (d.parada_dias >= 7) return 'parada';
  return 'em dia';
}

export function diasDeAtraso(prazo: string | null, hoje = HOJE()): number {
  if (!prazo || prazo >= hoje) return 0;
  return Math.round((Date.parse(hoje) - Date.parse(prazo)) / 86400000);
}

/* --------------------------------------------- o que falta para poder abrir

   As mesmas regras que o banco impõe como CHECK, aqui só para a pessoa saber
   ANTES de tocar em enviar. Quem manda é o banco; isto é gentileza.          */

export type Rascunho = {
  titulo: string; descricao: string; categoria_id: string;
  prioridade: Prioridade; impacto: string;
  prazo: string; sem_prazo_porque: string;
  evento: string; evento_data: string;
  orcamento: string; objetivo: string; local: string; publico: string;
  setor_solicitante?: string;
};

export const rascunhoVazio = (): Rascunho => ({
  titulo: '', descricao: '', categoria_id: '', prioridade: 'normal', impacto: '',
  prazo: '', sem_prazo_porque: '', evento: '', evento_data: '',
  orcamento: '', objetivo: '', local: '', publico: '',
});

export function oQueFalta(r: Rascunho, temSetor: boolean, cat?: Categoria | null): string[] {
  const f: string[] = [];
  if (r.titulo.trim().length < 4) f.push('um título que diga o que é');
  if (r.descricao.trim().length < 10) f.push('a descrição do que precisa ser feito');
  if (!r.categoria_id) f.push('a categoria');
  if (!temSetor) f.push('o setor que está pedindo');
  if (!r.prazo && !r.sem_prazo_porque.trim()) f.push('uma data desejada, ou o porquê de não ter data');
  if (r.prioridade === 'urgente' && !r.impacto.trim()) f.push('o que acontece se não for feito (urgente pede isso)');
  if (r.evento.trim() && !r.evento_data) f.push('a data do evento');
  /* 19/09/2026 — os tetos da migração 52, conferidos AQUI também.
     O comentário logo acima desta função promete "as mesmas regras que o
     banco impõe como CHECK, aqui só para a pessoa saber ANTES"; quando a 52
     acrescentou quatro CHECKs e esta função não acompanhou, a promessa virou
     mentira e o texto de 300 letras só era recusado depois de enviado. */
  if (r.titulo.trim().length > 200) f.push('um título mais curto (o limite é 200 letras; o texto longo cabe na descrição)');
  if (r.descricao.trim().length > 20000) f.push('uma descrição menor (o limite é 20 mil letras)');
  if (r.evento.trim().length > 120) f.push('um nome de evento mais curto (o limite é 120 letras)');
  /* 21/09/2026 — E ACONTECEU DE NOVO, EM DOBRO.

     O comentário de 19/09 aí em cima conta que esta função ficou para trás da
     migração 52 e que a promessa virou mentira. A migração 86 acrescentou
     `ORCAMENTO_OBRIGATORIO` e esta função ficou para trás outra vez. Doze das
     43 categorias exigem orçamento (todas as de Compras, Reembolso, Reserva
     financeira, Solicitação de pagamento, Alimentação, Transporte): a pessoa
     preenchia o formulário inteiro, tocava em Enviar, e só então lia que
     faltava um valor.

     Por isso a função passa a receber a CATEGORIA. Sem ela não havia como
     checar, e "não havia como" é a forma que este defeito usa para voltar. */
  if (cat?.exige_orcamento && !r.orcamento.trim()) {
    f.push('o valor estimado (esta categoria pede)');
  }
  return f;
}

/* ------------------------------------------------------------- as ações ---
   ESPELHO de `dem_mover`. Ver o comentário do topo do arquivo.               */

export type Acao =
  | 'assumir' | 'travar' | 'destravar' | 'aprovar' | 'rejeitar'
  | 'prazo' | 'prioridade' | 'redirecionar' | 'concluir' | 'cancelar' | 'reabrir'
  | 'validar'
  | 'comentar' | 'anexar' | 'desanexar'
  /* 94 · quem acompanha. Não saem de `acoesDe`: quem decide é `eu.inclui`,
     calculado pelo servidor, e a ficha mostra o cartão por ele. */
  | 'incluir' | 'tirar';

/** Quem está olhando, do ponto de vista de UMA demanda. Vem de `dem_ver`.

    OS QUATRO OPCIONAIS SÃO DA MIGRAÇÃO 94, E ELES MANDAM QUANDO VÊM.

    Até a 93 esta função adivinhava pelo nome do papel: gestor aprovava tudo,
    quem abriu confirmava. Com escopo de gestor e com o líder do ministério,
    o nome do papel não responde mais: o gestor da Comunicação é `gestor` e
    NÃO aprova a compra do Financeiro. Só o servidor sabe o escopo, então
    `dem_ver` passou a mandar a resposta pronta, e a tela usa a resposta.

    Sem eles (carga de um banco na 93), vale a regra antiga, byte a byte: é o
    que os 108 casos da matriz de `demandas.test.mjs` continuam medindo. */
export type Quem = {
  id?: string; papel: string; atende: boolean; abriu: boolean;
  /** o lado de quem pede: quem abriu, ou o líder do ministério que pediu */
  pede?: boolean;
  /** foi incluído para acompanhar */
  participa?: boolean;
  /** pode aprovar ou recusar ESTA demanda (escopo do setor que atende) */
  aprova?: boolean;
  /** gestão que alcança esta demanda por qualquer um dos dois lados */
  gere?: boolean;
};

/* QUEM MANDA, EM UM LUGAR SÓ — 20/09/2026.

   Esta expressão estava escrita três vezes: aqui, em
   `app/demandas/nova/page.tsx:73` e em `app/demandas/page.tsx:146`. Com
   quatro papéis e a lista estável, custava pouco. No dia em que nascer um
   quinto papel, ela custa três buscas e uma chance de esquecer a terceira.

   O espelho no banco é `m.papel in ('gestor','admin')`, e `dem_ajustar` usa
   `m.papel <> 'admin'` para a sua própria porta, que é mais estreita de
   propósito. */
export const quemManda = (p: Papel | string | null | undefined) =>
  p === 'gestor' || p === 'admin';

export function acoesDe(
  d: Pick<Resumo, 'status' | 'travada_por' | 'aprovacao'>
     & { falta_aprovacao?: boolean; responsavel?: string | null; responsavel_id?: string | null;
         /* opcional porque a migração 91 é nova: carga velha não traz o campo,
            e `undefined` aqui vale "ainda não validada", que é a verdade. */
         validada_em?: string | null },
  eu: Quem,
): Acao[] {
  const manda = quemManda(eu.papel);
  /* 94 · a resposta do servidor quando ela vem; a adivinhação de antes quando
     não vem. Ver o comentário de `Quem`. */
  const pede = eu.pede ?? eu.abriu;
  const aprova = eu.aprova ?? manda;
  const gere = eu.gere ?? manda;
  /* redirecionar: o servidor da 94 exige `pode_atender`, que para admin e
     gestor de todos os setores é sempre verdadeiro. O `manda ||` de antes só
     vale enquanto o servidor não disse nada. */
  const redireciona = eu.gere === undefined ? (manda || eu.atende) : eu.atende;
  const fechada = d.status === 'concluida' || d.status === 'cancelada';
  /* O SERVIDOR DECIDE O PORTÃO, NÃO ESTA FUNÇÃO — migração 88.

     Era `d.aprovacao === 'pendente'`, que é a COLUNA. O servidor cobra
     `demandas.falta_aprovacao(d)`, que lê a categoria agora. No dia em que o
     administrador liga "exige aprovação" numa categoria com demanda andando,
     os dois discordam: medido, a tela escondia "Aprovar" do gestor enquanto o
     servidor aceitava aprovar, e oferecia "Concluir" a quem atende enquanto o
     servidor recusava. A demanda ficava congelada sem ninguém entender.

     `dem_ver` e `dem_lista` passaram a devolver o veredito calculado. O
     `??` cobre uma carga antiga que ainda não tenha o campo. */
  const esperandoAprovacao = d.falta_aprovacao ?? (d.aprovacao === 'pendente');
  const a: Acao[] = [];

  /* Comentar vale sempre, inclusive depois de fechada: é como se pede revisão
     sem reabrir de cara.

     ANEXAR SAIU DAQUI E VIROU CONDICIONAL — 21/09/2026, migração 85.
     Ela era oferecida a todo mundo que enxerga a demanda, e o servidor
     aceitava: medido, uma solicitante rasa do setor pregou um "boleto
     atualizado.pdf" numa compra que não era dela. Hoje o servidor exige
     `pode_atender or aberta_por`, e este espelho precisa dizer o mesmo —
     senão a tela oferece um botão que o banco recusa, que é a outra metade
     do mesmo defeito. */
  a.push('comentar');
  /* `eu.atende` e nao `manda`: no servidor `pode_atender` ja devolve
     verdadeiro para gestor e admin, entao acrescentar `manda` aqui so
     produziria divergencia com a matriz do espelho em estados que o sistema
     real nao gera (gestor com atende=false nao existe).

     `desanexar` SAIU DAQUI — 22/09/2026.

     Ele vinha junto com `anexar`, e as duas não têm a mesma porta. O servidor
     é `pode_atender(m,d) OR a.membro_id = m.id` (85:322): quem abriu e não
     atende só tira o que ELE colou. Esta função decide por DEMANDA e nunca
     vai saber de quem é o anexo — a resposta é por ANEXO, e quem a dá é o
     `posso_tirar` que a migração 89 pôs em `dem_ver`, com a MESMA expressão
     do `desanexar`. A ficha já lê `a.posso_tirar` em cada linha da lista de
     anexos desde 22/09.

     Enquanto `acoesDe` também respondia, havia duas respostas para a mesma
     pergunta e a errada era a que a matriz conferia: o espelho concordava com
     o defeito, e a suíte passava verde sobre um botão que o banco recusa. */
  if (eu.atende || pede || eu.participa) a.push('anexar');

  if (fechada) {
    if (pede || gere || eu.atende) a.push('reabrir');
    /* A ETAPA 5 DO PDF, QUE NÃO EXISTIA — migração 91.

       "Depois da execução, o setor solicitante ou responsável pela gestão
       valida se a demanda foi atendida corretamente", e entre as capacidades
       do Solicitante: "Confirmar a conclusão". O modelo resumido do documento
       é `Solicitar → Triar → Aprovar → Executar → VALIDAR → Concluir`, e o
       fluxo de insatisfação termina em "Validar novamente".

       Até aqui quem EXECUTA era quem fechava, e o sistema registrava a
       discordância (`reabrir`) sem registrar a concordância. Quem pediu não
       tinha como dizer "resolveu" — só como dizer "não resolveu" —, então a
       ausência de reabertura era lida como sucesso, o que não é a mesma
       coisa: também é lida assim a demanda que a pessoa desistiu de cobrar.

       A guarda é a do servidor: `d.aberta_por = m.id or m.papel in
       ('gestor','admin')`, só sobre `concluida`, e uma vez só. `cancelada`
       fica de fora de propósito: não há execução para validar. */
    if (d.status === 'concluida' && !d.validada_em && (pede || gere)) a.push('validar');
    return a;
  }

  if (esperandoAprovacao && aprova) a.push('aprovar', 'rejeitar');

  if (eu.atende) {
    /* `assumir`: o servidor (migração 86) passou a recusar quando a demanda
       JÁ TEM outro dono. Duas pessoas tocando no mesmo segundo faziam a
       segunda roubar a demanda da primeira sem nenhum aviso. Oferecer aqui o
       botão que o servidor recusa transforma um conserto num botão morto. */
    const deOutraPessoa = !!d.responsavel_id && !!eu.id && d.responsavel_id !== eu.id;
    if (!esperandoAprovacao && d.status !== 'execucao' && !deOutraPessoa) a.push('assumir');
    if (d.status === 'travada') {
      /* SEM `travada_por` NA CONDIÇÃO — 21/09/2026.
         A migração 67 tirou o rótulo da guarda do servidor com o comentário
         "o portão é a APROVAÇÃO; a trava é só como ela aparece na tela", e foi
         exatamente ler o rótulo que abriu a porta dos fundos de duas ações.
         Esta função continuou lendo o rótulo por mais quatro migrações. */
      if (!esperandoAprovacao) a.push('destravar');
    }
    /* DUAS CORREÇÕES NA MESMA LINHA, E AS DUAS VINHAM DO `else` QUE SAIU.

       1 · `travar` ERA OFERECIDO COM O PORTÃO ABERTO. Este `if` empurrava
       `travar` sempre que `eu.atende` e o status não fosse `travada`, sem
       olhar `esperandoAprovacao` — enquanto `assumir`, `destravar` e
       `concluir`, logo aqui em volta, todos olham. Medido em 108 células da
       matriz. O servidor (85:340) recusa com `FALTA_APROVACAO` qualquer
       motivo que não seja `aprovacao`, e o motivo que o seletor da ficha abre
       por PADRÃO é `informacao`: ou seja, o caminho normal do dedo dava erro.
       E travar como `aprovacao` uma demanda que JÁ está esperando aprovação
       não muda nada — o aviso amarelo do topo da ficha já diz isso com todas
       as letras. Com o portão aberto não existe trava útil.

       2 · `travar` SUMIA QUANDO JÁ ESTAVA TRAVADA, com uma justificativa que
       o teste carregava como verdade: "o servidor é idempotente para
       re-travar". Não é. Re-travar com outro motivo TROCA `travada_por` e
       `travada_nota` (85:349). O que a tela fazia era obrigar quem atende a
       destravar e travar de novo para mudar "esperando informação" para
       "esperando terceiros" — dois eventos no histórico para uma coisa que
       não aconteceu: a demanda nunca voltou a andar no meio. O combinado saiu
       da lista do teste em vez de ganhar redação nova. */
    if (!esperandoAprovacao) a.push('travar');
    a.push('prazo', 'prioridade');
    /* `concluir` NÃO é oferecida com o portão aberto. A migração 67 fechou a
       porta no servidor e esta função não acompanhou: o botão continuava na
       tela, e tocar nele dava FALTA_APROVACAO. Um botão que sempre recusa é
       pior que botão nenhum, porque a pessoa tenta, lê um erro, e conclui que
       o sistema está quebrado em vez de que falta a aprovação. */
    if (!esperandoAprovacao) a.push('concluir');
  } else if (d.status === 'travada' && d.travada_por === 'informacao' && pede
             && !esperandoAprovacao) {
    /* quem pediu responde e destrava: é o caminho que tira a demanda do limbo
       sem depender do setor lembrar de voltar nela.

       `&& !esperandoAprovacao` entrou em 21/09. O servidor recusa desde a
       migração 67, que parou de ler o rótulo da trava e passou a ler só o
       portão; esta função continuou lendo o rótulo. A matriz de 84 casos não
       pegava porque o MODELO dela também estava na versão de antes da 67.
       Hoje o estado não deveria existir (a cura da 88 marca a trava como
       `aprovacao`), e mesmo assim o botão tem que sumir: espelho que depende
       de o estado não acontecer não é espelho. */
    a.push('destravar');
  }

  if (redireciona) a.push('redirecionar');
  if (eu.atende || pede || gere) a.push('cancelar');

  return a;
}

export const pode = (acoes: Acao[], x: Acao) => acoes.includes(x);

/* ------------------------------------------------------------- o WhatsApp

   O documento pede que "o solicitante receba notificações". Servidor não
   manda WhatsApp, e o canal real da igreja é o WhatsApp — então o sistema
   prepara a mensagem e a pessoa toca uma vez para enviar. É menos automático
   e é honesto: chega onde a pessoa lê.                                       */

export function soDigitos(t: string | null | undefined): string {
  return (t || '').replace(/\D/g, '');
}

/** Devolve '' quando não há telefone: quem chama decide se esconde o botão.

    O DDI SE DECIDE PELO COMPRIMENTO, NÃO PELO PREFIXO — 19/09/2026.

    Esta função usava `n.startsWith('55') ? n : '55' + n`, e essa é a única
    das dez montagens de `wa.me` do repositório que erra. Celular do DDD 55
    (Santa Maria, Bagé, Uruguaiana — o interior do Rio Grande do Sul) tem onze
    dígitos e COMEÇA com 55: `55999998888`. O teste de prefixo acha que o DDI
    já está lá e devolve `wa.me/55999998888`, que o WhatsApp lê como Brasil +
    DDD 99, no Maranhão. A mensagem vai para outra pessoa, ou para ninguém.

    Número brasileiro com DDD tem 10 ou 11 dígitos; com DDI, 12 ou 13. O
    comprimento responde sem ambiguidade, e é o que as outras nove fazem.

    Vale dizer o tamanho real disto: a igreja é na Barra da Tijuca, DDD 21. O
    defeito atinge perto de ninguém hoje. Está aqui porque a regra "como se
    monta um número brasileiro" tinha dez donos e um deles discordava — e a
    próxima vez que ela mudar, nove lugares mudam juntos e um fica para trás
    de novo. */
export function linkZap(telefone: string | null | undefined, texto: string): string {
  const n = soDigitos(telefone);
  if (n.length < 10) return '';
  const cheio = n.length <= 11 ? '55' + n : n;
  return `https://wa.me/${cheio}?text=${encodeURIComponent(texto)}`;
}

/* O WHATSAPP COMO A PESSOA ESCREVE, E COMO O BANCO GUARDA · 22/09/2026.

   Desde a 94 o banco guarda o número com o DDI (`demandas.tel`: 10 ou 11
   dígitos ganham o 55 na frente), para a mesma pessoa não existir duas vezes
   com o número escrito de dois jeitos. O Perfil e a ficha da administração
   passaram a mostrar "5521999990005" no campo, e o botão Salvar do Perfil
   ligava sem mudança nenhuma, porque comparava o digitado sem DDI com o
   guardado com DDI.

   `telDoBanco` é a MESMA regra de `demandas.tel`, pelo comprimento (ver
   `linkZap` logo acima, sobre o DDD 55); `telVisivel` devolve o que a pessoa
   reconhece: (21) 99999-0005. */
export function telDoBanco(t: string | null | undefined): string {
  const d = soDigitos(t);
  return d.length === 10 || d.length === 11 ? '55' + d : d;
}
export function telVisivel(t: string | null | undefined): string {
  let d = soDigitos(t);
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t || '';
}

export function recado(d: Resumo, base: string, o: 'abriu' | 'mudou' | 'pergunta' | 'pronta'): string {
  const link = `${base.replace(/\/$/, '')}/d/${d.numero}`;
  const cab = `Demanda #${d.numero} — ${d.titulo}`;
  if (o === 'abriu') {
    return `${cab}\n${d.solicitante} pediu para ${d.responsavel_setor}.\n` +
      `${rotPrioridade(d.prioridade)}${d.prazo ? `, para ${dataCurta(d.prazo)}` : ''}.\n${link}`;
  }
  if (o === 'pergunta') {
    return `${cab}\nPrecisamos de uma informação sua para continuar.\n${link}`;
  }
  if (o === 'pronta') {
    return `${cab}\nFoi concluída. Se não resolveu, dá para reabrir na própria página.\n${link}`;
  }
  return `${cab}\nAgora está: ${rotStatus(d.status)}${d.travada_por ? ` (${rotTrava(d.travada_por)})` : ''}.\n${link}`;
}

/* ------------------------------------------------------------------ texto */

export function dataCurta(iso: string | null): string {
  if (!iso) return '';
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
}

export function dataCheia(iso: string | null): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function quando(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const dias = Math.round(h / 24);
  if (dias < 30) return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  return dataCheia(iso.slice(0, 10));
}

/* O PDF PEDE "DATA E HORÁRIO DA ABERTURA", E O HORÁRIO NUNCA APARECIA.

   22/09/2026. A ficha imprimia só `quando()`, que é a frase relativa. Nos
   primeiros 30 dias ela nem mostra data: "Aberta — há 3 dias". Quem precisa
   responder "quando isso chegou?" numa reunião, ou conferir se o pedido
   entrou antes ou depois da decisão, não tem o dado. Passados 30 dias
   aparece a data, e nunca a hora.

   A frase relativa não sai: ela é a que responde rápido ("há 3 dias" é lido
   sem contar nos dedos). As três coisas cabem na mesma linha, e é o mesmo
   lugar de antes — nenhum elemento novo.

   O fuso é o do Rio, pelo mesmo motivo de `HOJE()`: `Date` formata no fuso
   do APARELHO, e carimbo de hora que muda conforme o celular de quem olha
   não serve para conferir nada.

   Depois de 30 dias a frase relativa É a data (`quando` devolve
   `dataCheia`), então o parêntese é suprimido: "22/08/2026 às 14:35
   (22/08/2026)" é ruído. */
export function carimbo(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const dh = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(t)).replace(', ', ' às ');
  const rel = quando(iso);
  return rel && rel !== dataCheia(iso.slice(0, 10)) ? `${dh} · ${rel}` : dh;
}

export function dinheiro(v: number | null): string {
  if (v === null || v === undefined) return '';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function horas(h: number | null): string {
  if (h === null || h === undefined) return '—';
  if (h < 24) return `${h} h`;
  return `${(h / 24).toFixed(1).replace('.', ',')} dias`;
}

/* --------------------------------------------------- recados do servidor */

const PORBANCO: Record<string, string> = {
  SEM_ACESSO: 'Este link não vale mais, ou você não tem acesso a esta demanda.',
  NAO_EXISTE: 'Essa demanda não existe.',
  SEM_SETOR: 'Falta dizer de qual setor você é. Quem organiza resolve isso em Ajustes.',
  CATEGORIA_INVALIDA: 'Escolha uma categoria.',
  NAO_E_SEU_SETOR: 'Quem atende esta demanda é outro setor.',
  SEM_PERMISSAO: 'Você não tem permissão para isso.',
  /* `humano()` sem código cai nas tabelas das ESCALAS e responde "Você não tem
     permissão para isso neste MINISTÉRIO". Aqui a palavra é SETOR, e a regra
     do Arthur de 21/09 é que os dois sistemas não se encostam. Essa frase
     encostava. Com `PORBANCO` tendo precedência, ela não chega mais lá. */
  SEM_PERMISSAO_DB: 'Você não tem permissão para isso neste setor. Fale com quem administra as demandas.',
  SEM_SISTEMA: 'O sistema de demandas ainda não foi instalado neste ambiente.',
  SO_GESTOR: 'Só a liderança aprova ou recusa.',
  SO_ADMIN: 'Só quem administra o sistema mexe aqui.',
  FALTA_APROVACAO: 'Esta demanda ainda espera aprovação.',
  NAO_ESTA_PENDENTE: 'Esta demanda não está esperando aprovação.',
  NAO_ESTA_TRAVADA: 'Esta demanda não está travada.',
  JA_FECHADA: 'Esta demanda já foi encerrada. Dá para reabrir, se precisar.',
  NAO_ESTA_FECHADA: 'Só dá para reabrir o que já foi concluído ou cancelado.',
  SETOR_NAO_ATENDE: 'Esse setor não recebe demandas. Escolha um dos que atendem.',
  MOTIVO_INVALIDO: 'Diga por que está travando.',
  PRIORIDADE_INVALIDA: 'Prioridade inválida.',
  TEXTO_VAZIO: 'Escreva alguma coisa antes de enviar.',
  CONCLUSAO_VAZIA: 'Diga o que foi feito. A conclusão precisa dizer.',
  MOTIVO_VAZIO: 'Diga por que está cancelando.',
  URL_VAZIA: 'Cole o endereço do arquivo.',
  JA_EXISTE: 'Já existe um com esse nome.',
  ALVO_DESCONHECIDO: 'Não sei ajustar isso.',
  /* ---- o vocabulário que nasceu nas migrações 84 a 87 ------------------
     Cada uma destas linhas é a diferença entre a pessoa saber o que fazer e
     a pessoa ver uma palavra em MAIÚSCULA que não quer dizer nada para ela. */
  SO_GESTOR_REABRE_APROVACAO: 'Esta demanda já foi aprovada. Devolver para aprovação é decisão da liderança.',
  JA_TEM_DONO: 'Outra pessoa assumiu esta demanda primeiro.',
  PRAZO_NAO_VEIO: 'Escolha a nova data, ou diga que não vai ter data.',
  PRAZO_INVALIDO: 'Essa data não existe. Use o seletor de data.',
  SEM_PRAZO_PRECISA_MOTIVO: 'Para tirar o prazo, diga por quê. "Não sei quando" serve.',
  ATRASO_PRECISA_MOTIVO: 'Esta demanda passou do prazo. Diga o que atrasou antes de concluir.',
  EVENTO_DATA_INVALIDA: 'Essa data de evento não existe.',
  ORCAMENTO_OBRIGATORIO: 'Esta categoria precisa de um valor estimado.',
  ORCAMENTO_INVALIDO: 'Escreva só o valor, em números. Exemplo: 1234,56.',
  URL_INVALIDA: 'Esse link não serve como anexo: precisa começar com https:// e apontar para um site.',
  ANEXOS_DEMAIS: 'Já são 20 anexos nesta demanda. Tire um antes de juntar outro.',
  ANEXO_NAO_ENCONTRADO: 'Esse anexo não está mais aqui, ou não é seu para tirar.',
  SETOR_INVALIDO: 'Escolha um setor da lista.',
  ABA_INVALIDA: 'Essa aba não existe.',
  FILTRO_INVALIDO: 'Um dos filtros veio errado. Recarregue a página.',
  LIMITE_INVALIDO: 'Não entendi quantas linhas mostrar.',
  /* ---- migração 88 ---------------------------------------------------- */
  PERIODO_INVERTIDO: 'A data inicial está depois da final. Troque as duas.',
  /* 92 · `dem_numeros` recebia os dois parâmetros como `date` e o cast
     acontecia ANTES do corpo da função: `2026-13-45` estourava um `22008`
     cru do Postgres, que chegava aqui como a frase genérica "Não consegui.
     Tente de novo." A assinatura virou `text`, a função decide sozinha, e
     este é o recado. */
  PERIODO_INVALIDO: 'Essa data não existe. Confira o dia e o mês.',
  /* 92 · a triagem passou a poder pedir o valor depois da abertura, junto
     com a resposta da trava. Sem esta linha, um valor mal escrito voltava
     como "Não consegui", e a pessoa não tinha como saber o que corrigir. */
  VALOR_INVALIDO: 'Escreva só o valor, em números. Exemplo: 1234,56.',
  NUMERO_INVALIDO: 'Esse campo só aceita número.',
  SIM_OU_NAO: 'Esse campo só aceita sim ou não.',
  /* `depois_de` saiu de `dem_lista` na 88 junto com o vazamento que ele
     tinha. Se uma aba velha ainda mandar a chave, isto é o que ela lê. */
  CURSOR_SAIU: 'Esta página está desatualizada. Recarregue.',
  ACAO_DESCONHECIDA: 'Não sei fazer isso.',
  FALTA_CAMPO: 'Falta preencher um campo obrigatório.',
  /* ---- migração 91: a etapa 5 do PDF ----------------------------------- */
  SO_QUEM_PEDIU: 'Quem confirma que resolveu é quem pediu, ou a liderança.',
  NAO_ESTA_CONCLUIDA: 'Só dá para confirmar depois que a demanda for concluída.',
  JA_VALIDADA: 'Esta demanda já foi confirmada.',
  /* ---- os dois que o próprio `api.ts` produz e ninguém traduzia --------

     `SEM_CONFIG` e `VAZIO` nascem em `rpcCom` (`api.ts:84` e `:114`) e nunca
     tiveram linha aqui. Medido: os dois caíam em "Não consegui. Tente de
     novo." — que manda a pessoa repetir uma coisa que NUNCA vai funcionar.

     `SEM_CONFIG` é o app sem as chaves do Supabase: tentar de novo no mesmo
     aparelho dá o mesmo nada, mil vezes. `VAZIO` é a RPC respondendo 200 com
     corpo nulo, que é defeito de servidor e não de quem toca o botão. Os dois
     têm o mesmo destino — avisar quem cuida do sistema —, e é isso que as
     frases dizem, em vez de convidar para a décima tentativa. */
  SEM_CONFIG: 'Este app está sem a configuração de acesso ao banco. Tentar de novo não resolve: avise quem cuida do sistema.',
  VAZIO: 'O servidor respondeu sem conteúdo. Isso é defeito daqui, não do que você fez: avise quem cuida do sistema.',
  /* ---- 23503, o irmão do 42501 que ficou para trás — 22/09/2026 --------

     `SEM_PERMISSAO_DB` ganhou nome próprio para o 42501 não cair na tabela
     das ESCALAS e responder "neste MINISTÉRIO" dentro das Demandas. A
     violação de chave estrangeira ficou de fora, e `PORCODIGO['23503']` de
     `lib/erros.ts:210` é, literalmente:

       "Não dá para fazer isso enquanto houver escala ou cadastro ligado a
        este item."

     A palavra ESCALA, no sistema que não pode encostar no outro. E o código
     não é hipotético: ele sai de `dem_ajustar` quando alguém tenta apagar um
     setor, uma categoria ou uma pessoa que já tem demanda pendurada.

     A regra do dono é que os dois sistemas não se encostam; o chão de
     transporte é compartilhado, o VOCABULÁRIO não. */
  VINCULO_EM_USO: 'Ainda há demanda ou cadastro ligado a este item. Desligue o vínculo antes de apagar, ou desative em vez de apagar.',
  /* ---- migração 94: a base de pessoas, o cadastro e o escopo ------------
     Frase curta e com o próximo passo. Quem lê isto está no meio de um
     cadastro ou de uma permissão, e o que precisa é saber o que fazer. */
  SEM_LOGIN: 'Entre com o seu e-mail antes de fazer o cadastro.',
  JA_CADASTRADO: 'Este e-mail já tem cadastro. É só entrar.',
  DESATIVADO: 'Este cadastro está desativado. Fale com quem administra as demandas.',
  DADOS_INVALIDOS: 'Os dados chegaram num formato que eu não entendo. Recarregue a página.',
  CAMPO_NAO_PERMITIDO: 'Esse dado não se muda por aqui. Quem administra as demandas muda para você.',
  NOME_INVALIDO: 'Escreva o nome completo, com pelo menos 3 letras.',
  TELEFONE_INVALIDO: 'Escreva o WhatsApp com DDD. Exemplo: 21 99999-8888.',
  TELEFONE_EM_USO: 'Esse telefone já é de outra pessoa cadastrada. Se for você, entre com o e-mail que já usa.',
  EMAIL_INVALIDO: 'Esse e-mail parece incompleto. Confira o que vem antes e depois do @.',
  EMAIL_EM_USO: 'Esse e-mail já é de outra pessoa cadastrada.',
  FUNCAO_LONGA: 'A função pode ter até 80 letras.',
  PEDIDO_INVALIDO: 'Escolha uma das opções.',
  NADA_A_PEDIR: 'Você já tem esse papel, ou um que faz mais.',
  PAPEL_INVALIDO: 'Escolha um dos papéis da lista.',
  ULTIMO_ADMIN: 'Esta é a única pessoa que administra. Dê esse papel a outra pessoa antes de tirar dela.',
  ESCOPO_VAZIO: 'Gestor precisa acompanhar todos os setores, ou pelo menos um. Escolha antes de salvar.',
  ESCOPO_INVALIDO: 'Um dos setores escolhidos não existe mais. Recarregue a página.',
  HOMONIMO: 'Já existe alguém com esse nome. Confira se não é a mesma pessoa.',
  SEM_PEDIDO: 'Essa pessoa não tem pedido esperando.',
  DECISAO_INVALIDA: 'Escolha aceitar ou recusar.',
  SETOR_FORA_DO_ESCOPO: 'Esse setor está fora dos que você acompanha.',
  MUITAS_DE_UMA_VEZ: 'Você abriu 10 demandas na última hora. Espere um pouco para abrir a próxima.',
  PESSOA_NAO_ENCONTRADA: 'Não achei ninguém ativo com esse e-mail ou telefone.',
  JA_E_QUEM_PEDIU: 'Essa pessoa é quem pediu. Ela já acompanha.',
  PARTICIPANTES_DEMAIS: 'Já são 20 pessoas acompanhando. Tire alguém antes de incluir outra.',
  NAO_PARTICIPA: 'Essa pessoa já não acompanha esta demanda.',
  /* ---- migração 95: a lista de sites de anexo ------------------------- */
  SITE_NAO_PERMITIDO: 'Esse site não é aceito como anexo. Use Google Drive, Dropbox, OneDrive ou iCloud.',
  SITE_INVALIDO: 'Isso não é um site. Exemplo: drive.google.com',
  SITE_ABERTO: 'Nesse site qualquer pessoa publica página. Inclua o endereço exato, como igreja.github.io.',
};

/* O SEGUNDO CADEADO DA MESMA PORTA, 22/09/2026.

   Uma varredura das 371 saídas de `recadoDoErro` achou QUATRO com palavra de
   Escalas dentro do sistema de Demandas, e as quatro pelo mesmo caminho: um
   erro chegando como `erro:'REDE'` com `codigo` 42501 ou 23503, caindo no
   `humano()` do fim da função e sendo traduzido por `PORCODIGO` de
   `lib/erros.ts:210-212`:

     42501 -> "Você não tem permissão para isso neste MINISTÉRIO. Fale com
               quem organiza a IGREJA."
     23503 -> "Não dá para fazer isso enquanto houver ESCALA ou cadastro
               ligado a este item."

   Hoje isso não acontece, e é justamente esse o problema. `rpcCom`
   (`api.ts:123` e `:141`) intercepta os dois códigos ANTES e devolve
   `SEM_PERMISSAO_DB` e `VINCULO_EM_USO`, que `PORBANCO` já traduz no
   vocabulário daqui. A porta está fechada, com UM cadeado, do lado de lá, e
   `recadoDoErro` é exportada: qualquer chamada que não passe por `rpcCom`
   (um teste, uma tela nova, um ajudante que colapse erro em `REDE` por conta
   própria) reabre a porta sem que nada acuse.

   O repositório já pagou exatamente essa conta: `api.ts:65-76` conta que a
   lista `NAO_E_IDENTIDADE` ficou para trás quando `rpcCom` ganhou os dois
   códigos novos, e a consequência foi QUEIMAR o link pessoal de quem tomasse
   um 42501. Proteção inteira de um lado só é proteção que depende de duas
   pessoas lembrarem da mesma coisa.

   O segundo cadeado reusa as MESMAS frases de `PORBANCO`, e não cópias
   delas: duas grafias para o mesmo recado é como se perde uma regra sem
   ninguém ver, que é o que o cabeçalho de `tipos.ts` diz na primeira linha. E
   como o caminho normal bate em `PORBANCO[r.erro]` primeiro, e as frases são
   as mesmas, ninguém lê nada diferente enquanto tudo funciona. */
const DO_TRANSPORTE: Record<string, string> = {
  '42501': PORBANCO.SEM_PERMISSAO_DB,
  '23503': PORBANCO.VINCULO_EM_USO,
};

/* A LISTA, PARA O TESTE PODER VARRER TODA ELA.

   Sem isto, um teste que quisesse conferir a SAÍDA de `recadoDoErro` para
   todos os códigos teria que repetir a lista à mão — e uma lista repetida à
   mão envelhece calada: o código novo entra em `PORBANCO`, ninguém lembra do
   teste, e a varredura passa a varrer menos do que existe. */
export const CODIGOS = Object.keys(PORBANCO);

/* As mensagens dos CHECK chegam sem acento, direto do Postgres. Traduzir aqui
   é o que impede a tela de mostrar "new row violates check constraint". */
const PORCHECK: [RegExp, string][] = [
  [/ck_prazo/,      'Falta a data desejada, ou o porquê de não ter data.'],
  [/ck_urgente/,    'Urgente precisa dizer o que acontece se não for feito.'],
  [/ck_evento/,     'Se tem evento, precisa da data do evento.'],
  [/ck_conclusao/,  'A conclusão precisa dizer o que foi realizado.'],
  [/ck_cancelada/,  'Cancelar precisa de um motivo.'],
  [/ck_travada/,    'Travar precisa de um motivo.'],
  [/ck_prioridade/, 'Prioridade inválida.'],
  [/ck_status/,     'Status inválido.'],
  [/ck_papel/,      'Papel inválido.'],
  /* 19/09/2026 — as quatro restrições da migração 52. Sem estas linhas, um
     título de 300 letras voltava como "Falta alguma coisa obrigatória nesta
     demanda", que não diz o que fazer. O limite do título não é capricho: o
     título viaja em TODA carga da lista, para todo membro. */
  [/demandas_titulo_tam_ck/,    'O título precisa ter entre 3 e 200 letras. Se o texto é longo, ele cabe na descrição.'],
  [/demandas_descricao_tam_ck/, 'A descrição passou de 20 mil letras. Anexe o arquivo por link em vez de colar o texto inteiro.'],
  [/demandas_evento_tam_ck/,    'O nome do evento precisa ter até 120 letras.'],
  /* `anexos_url_http_ck` SAIU DAQUI: a migração 85 apagou essa constraint, e
     a frase ainda dizia "http:// ou https://" sobre uma regra que hoje recusa
     `http://`. Regex que nunca casa é armadilha de leitura, e esta mentia. */
  /* as que nasceram nas migrações 84 a 86 */
  [/anexos_url_ck/,             'Esse link não serve como anexo: precisa começar com https:// e apontar para um site.'],
  [/anexos_nome_tam_ck/,        'O nome do anexo precisa ter até 200 letras.'],
  [/ck_orcamento/,              'O valor não pode ser negativo.'],
  /* 19/09 esta lista tinha DUAS linhas e um coringa, e o coringa comia nove
     restrições: `cancelada_motivo`, `travada_nota`, `impacto`, `objetivo`,
     `local`, `publico`, `sem_prazo_porque`, `atraso_motivo` e
     `aprovacao_nota`. Todas caíam em "Esse texto ficou longo demais para o
     campo." — sem dizer QUAL campo nem QUANTO cabe, que é a queixa que o
     comentário logo acima diz ter consertado. Cada uma tem nome e número
     agora, e o número é o da CHECK, conferido contra o catálogo. */
  [/ck_tam_texto/,              'Esse texto passou de 4 mil letras. Resuma, ou anexe o arquivo por link.'],
  [/ck_tam_conclusao/,          'A conclusão passou de 4 mil letras.'],
  [/ck_tam_objetivo/,           'O objetivo passou de 4 mil letras.'],
  [/ck_tam_travada_nota/,       'O motivo da trava passou de 2 mil letras.'],
  [/ck_tam_cancelada_motivo/,   'O motivo do cancelamento passou de 2 mil letras.'],
  [/ck_tam_aprovacao_nota/,     'O recado da aprovação passou de 2 mil letras.'],
  [/ck_tam_atraso_motivo/,      'O motivo do atraso passou de 2 mil letras.'],
  [/ck_tam_impacto/,            'O que acontece se não for feito passou de 2 mil letras.'],
  [/ck_tam_sem_prazo_porque/,   'O porquê de não ter data passou de 500 letras.'],
  [/ck_tam_local/,              'O local passou de 200 letras.'],
  [/ck_tam_publico/,            'O público passou de 200 letras.'],
  [/ck_tam_/,                   'Esse texto ficou longo demais para o campo.'],
  /* `ck_aprovacao` não tinha linha, e por isso um valor inválido de aprovação
     virava "Falta alguma coisa obrigatória nesta demanda", que é a frase de
     OUTRA coisa. */
  [/ck_aprovacao/,              'Esse valor de aprovação não existe.'],
];

/* ------------------------------------------------- o teto de cada caixa

   O CONTADOR PROMETIA 4000 EM QUATRO DAS SETE CAIXAS — 22/09/2026.

   `CaixaDeAcao` nasceu com `teto = 4000` e NENHUMA das sete chamadas passava
   o valor. Só que as colunas de destino não são todas de 4000: medido no
   catálogo, `travada_nota`, `cancelada_motivo`, `aprovacao_nota`, `impacto`
   e `atraso_motivo` são 2000, e `sem_prazo_porque` é 500.

   Entre 2001 e 4000 letras o navegador deixava digitar, o contador dizia que
   ainda sobrava, e o banco devolvia `check_violation`. Isto é exatamente o
   defeito que o comentário acima conta ter matado em 19/09 do outro lado.

   `rejeitar` é o menor de todos: o texto vai para `aprovacao_nota` (2000) E,
   prefixado com "Aprovação recusada: ", para `cancelada_motivo` (2000). O
   prefixo tem 20 letras, então o teto real é 1980. */
export const TETO: Record<string, number> = {
  comentar: 4000, concluir: 4000, destravar: 4000, reabrir: 4000,
  travar: 2000, cancelar: 2000, aprovar: 2000,
  rejeitar: 2000 - 'Aprovação recusada: '.length,
  prioridade: 2000, atraso: 2000, sem_prazo: 500,
};

/** O teto da caixa de uma ação. 4000 é o padrão das colunas de texto longo. */
export const tetoDe = (acao: string) => TETO[acao] ?? 4000;

/* O `ok?` na assinatura não é decoração. Sem ele, o tipo é "fraco" para o
   TypeScript — todas as propriedades opcionais — e passar a resposta INTEIRA
   da RPC (a união de ok:true e ok:false) vira erro de compilação por não ter
   nenhuma propriedade em comum com o ramo de sucesso. Com `ok?`, a união
   sempre tem ao menos uma. */
export function recadoDoErro(
  r: { ok?: boolean; erro?: string; regra?: string; codigo?: string; site?: string } | null | undefined,
  /* O VERBO VEM DE QUEM CHAMA — 21/09/2026.

     Era `humano(…, 'salvar')` fixo. Falhar ao CARREGAR a lista dizia "Não
     consegui salvar", sobre uma tela onde ninguém salvou nada. */
  oQueFazia = 'completar',
): string {
  if (!r?.erro) return 'Não consegui. Tente de novo.';
  if (r.erro === 'REGRA' && r.regra) {
    for (const [re, txt] of PORCHECK) if (re.test(r.regra)) return txt;
    return 'Falta alguma coisa obrigatória nesta demanda.';
  }
  /* O TRANSPORTE É O MESMO DOS DOIS SISTEMAS; SÓ O NEGÓCIO É DAQUI.

     `lib/demandas/api.ts` colapsa tudo que não é recusa de regra em
     `erro:'REDE'`, guardando a mensagem verdadeira em `regra`. E `REDE` nunca
     esteve em `PORBANCO` — nem `SEM_CONFIG`, nem `VAZIO`. Resultado: sessão
     expirada, permissão faltando (42501), limite de e-mail do Supabase e
     wi-fi caído produziam a MESMA frase de quatro palavras, e a mensagem do
     banco era jogada fora sem nem ir para o console.

     É exatamente o defeito que `lib/erros.ts` foi escrito para matar do lado
     das escalas, de volta inteiro do lado das demandas. E não precisava: o
     Postgres é o mesmo, o PostgREST é o mesmo, a rede é a mesma. O que é
     legitimamente próprio daqui é o vocabulário de NEGÓCIO — `SEM_ACESSO`,
     `JA_FECHADA`, `SO_QUEM_ATENDE` —, e esse continua em `PORBANCO`, com
     precedência. O chão de transporte passa a ser compartilhado. */
  /* 95 · a recusa diz QUAL site, e a frase também: "esse site" sobre um link
     com três domínios na mesma linha deixa a pessoa adivinhando. */
  if (r.erro === 'SITE_NAO_PERMITIDO' && r.site) return recadoDeSite(r.site);
  const doNegocio = PORBANCO[r.erro];
  if (doNegocio) return doNegocio;
  /* o segundo cadeado, antes de `humano()`. Ver `DO_TRANSPORTE` acima: é aqui
     que os dois códigos que carregam vocabulário de Escalas param, venha o
     erro por `rpcCom` ou por qualquer outro caminho. */
  const doTransporte = r.codigo ? DO_TRANSPORTE[r.codigo] : undefined;
  if (doTransporte) return doTransporte;
  if (r.regra) {
    /* e o código vai junto: sem ele, `humano()` não tem como distinguir um
       `raise exception` nosso (P0001, já em português) de um erro de
       transporte, e traduz os dois para a mesma frase genérica. */
    const e = new Error(r.regra) as Error & { code?: string };
    if (r.codigo) e.code = r.codigo;
    return humano(e, oQueFazia).texto;
  }
  return 'Não consegui. Tente de novo.';
}

/* =========================================================================
   MIGRAÇÃO 94: PESSOAS, PAPÉIS E O QUE CADA UM PODE

   As palavras de papel, de permissão e de "o que falta fazer" moram aqui, e
   não em cada tela, pelo mesmo motivo do cabeçalho de `tipos.ts`: duas
   grafias para o mesmo conceito é como se perde uma regra. A administração, o
   perfil e o portal leem esta lista.
   ========================================================================= */

/* Rótulo curto (cabe numa pílula e numa coluna de 320px) e a explicação de
   uma linha. A ordem é a do alcance, do menor para o maior. */
export const PAPEIS: { v: Papel; rot: string; explica: string }[] = [
  { v: 'solicitante', rot: 'Membro',        explica: 'Abre demandas e acompanha as próprias.' },
  { v: 'lider',       rot: 'Líder',         explica: 'Pede pelo ministério: vê e confirma o que o ministério pediu.' },
  { v: 'responsavel', rot: 'Equipe',        explica: 'Atende a fila do próprio setor: assume, ajusta o prazo e conclui.' },
  { v: 'gestor',      rot: 'Gestão',        explica: 'Acompanha os setores do escopo: vê, aprova gastos e redistribui.' },
  { v: 'admin',       rot: 'Administração', explica: 'Tudo isso, mais pessoas, setores e categorias.' },
];
export const rotPapel = (p: Papel | string | null | undefined) =>
  PAPEIS.find(x => x.v === p)?.rot ?? String(p || '');

/* O que a pessoa pode, em frase. As chaves vêm de `demandas.permissoes(m)`,
   que é derivada do papel e do escopo pelo servidor: a tela não calcula
   permissão nenhuma, só traduz a lista que chega. Chave sem frase aparece
   crua, e o teste de telas cobra que isso não aconteça. */
export const PERMISSOES: Record<string, string> = {
  pedir: 'Abrir demandas',
  acompanhar: 'Acompanhar as que abriu e as que foi incluído',
  ver_ministerio: 'Ver o que o ministério pediu',
  validar_ministerio: 'Confirmar a entrega do que o ministério pediu',
  atender_setor: 'Atender a fila do setor',
  ver_escopo: 'Ver as demandas dos setores que acompanha',
  ver_tudo: 'Ver todas as demandas',
  atender_escopo: 'Atender nos setores que acompanha',
  aprovar_escopo: 'Aprovar ou recusar gastos nos setores que acompanha',
  atender_tudo: 'Atender em qualquer setor',
  aprovar_tudo: 'Aprovar ou recusar gastos de qualquer setor',
  ver_numeros: 'Ver os números',
  gerir_pessoas: 'Cadastrar pessoas e definir papéis',
  gerir_setores: 'Configurar setores e categorias',
};

/* O que falta fazer, dito como o botão que resolve. */
export const MOTIVOS: Record<string, string> = {
  responder: 'Responder',
  validar: 'Confirmar se resolveu',
  aprovar: 'Aprovar ou recusar',
  assumir: 'Assumir',
  concluir: 'Concluir',
};

/* UMA FRASE POR FATO DO HISTÓRICO, PARA A FICHA E PARA OS AVISOS.

   Morava dentro da ficha. Os avisos contam os MESMOS fatos (vêm da mesma
   tabela), e uma segunda cópia desta função discordaria da primeira no dia em
   que alguém corrigisse só uma: a ficha diria "Maria assumiu" e o aviso
   "Maria passou para Maria Aparecida Gonçalves da Silva", que é exatamente o
   defeito que o ramo `responsavel` existe para matar. */
export function fraseDoEvento(e: { tipo: string; de: string | null; para: string | null; quem: string | null }): string {
  const q = e.quem ? e.quem.split(' ')[0] : 'alguém';
  switch (e.tipo) {
    case 'abertura':    return `${q} abriu a demanda`;
    case 'status':      return `${q} mudou de ${rotStatus((e.de || 'aberta') as never)} para ${rotStatus((e.para || 'aberta') as never)}`;
    case 'responsavel':
      /* assumir grava "Maria" como quem mexeu e "Maria Aparecida Gonçalves da
         Silva" como o novo responsável. Quando quem mexeu e quem recebeu são a
         mesma pessoa, o nome do gesto é "assumiu". */
      if (e.para && e.quem && e.para === e.quem) return `${q} assumiu`;
      return e.para ? `${q} passou para ${e.para}` : `${q} soltou o responsável`;
    case 'setor':       return `${q} mandou de ${e.de} para ${e.para}`;
    case 'prazo':       return `${q} mudou o prazo${e.de ? ` de ${dataCurta(e.de)}` : ''} para ${e.para ? dataCurta(e.para) : 'sem data'}`;
    case 'prioridade':  return `${q} mudou a prioridade de ${e.de} para ${e.para}`;
    case 'aprovacao':   return `${q} marcou a aprovação como ${e.para}`;
    case 'reabertura':  return `${q} reabriu`;
    case 'anexo':       return `${q} juntou um anexo`;
    case 'comentario':  return `${q} escreveu`;
    /* "confirmou que resolveu" e não "validou": a palavra do PDF é de
       processo, e quem lê esta linha é a pessoa que pediu. */
    case 'validacao':   return `${q} confirmou que resolveu`;
    /* 94 · quem acompanha. `para` é quem entrou; `de` é quem saiu. Sair por
       conta própria e ser tirado são gestos diferentes, e a frase diz qual. */
    case 'participante':
      if (e.para) return `${q} incluiu ${e.para.split(' ')[0]}`;
      if (e.de && e.quem && e.de === e.quem) return `${q} saiu`;
      return `${q} tirou ${(e.de || 'alguém').split(' ')[0]}`;
    default:            return `${q}: ${e.tipo}`;
  }
}

/* =========================================================================
   MIGRAÇÃO 95: DE QUE SITE VEM O ANEXO

   Quem decide é o banco (`demandas.anexo_permitido`). A tela usa a MESMA regra
   só para avisar antes, e não depois de a pessoa tocar em Juntar.

   O site é o que o NAVEGADOR visitaria, lido pelo parser de URL do próprio
   navegador (`new URL`), e não o que um regex acha que é. Medido em 22/09:
   `https://evil.org\.drive.google.com/x` termina em `.drive.google.com` para
   quem lê o texto e vai para `evil.org` para quem clica. A 95 ensinou isso ao
   banco; aqui o navegador já sabe.
   ========================================================================= */

/** O site de um link `https`, em minúsculas e sem o ponto final. Nulo se não for link `https`. */
export function siteDoLink(url: string | null | undefined): string | null {
  try {
    const u = new URL(String(url ?? '').trim());
    if (u.protocol !== 'https:') return null;
    return u.hostname.toLowerCase().replace(/\.$/, '') || null;
  } catch { return null; }
}

/** O site é um da lista, ou subdomínio dele. A fronteira é o ponto: `evildrive.google.com` não é `drive.google.com`. */
export function siteNaLista(site: string, sites: readonly string[]): boolean {
  return sites.some(s => site === s || site.endsWith('.' + s));
}

/** O site que a lista recusaria, ou nulo se pode (lista desligada, site aceito, ou link torto, que tem recado próprio). */
export function siteRecusado(url: string, regra: RegraDeAnexo | null | undefined): string | null {
  if (!regra?.restrito) return null;
  const site = siteDoLink(url);
  if (!site) return null;
  return siteNaLista(site, regra.sites) ? null : site;
}

/* O nome que a pessoa reconhece. Os encurtadores de cada serviço levam o
   nome do serviço, para a lista mostrar "OneDrive" uma vez e não `1drv.ms`. */
const NOME_DO_SITE: Record<string, string> = {
  'drive.google.com': 'Google Drive', 'docs.google.com': 'Google Docs',
  'photos.google.com': 'Google Fotos', 'photos.app.goo.gl': 'Google Fotos',
  'dropbox.com': 'Dropbox', 'onedrive.live.com': 'OneDrive', '1drv.ms': 'OneDrive',
  'icloud.com': 'iCloud', 'wetransfer.com': 'WeTransfer', 'we.tl': 'WeTransfer',
  'canva.com': 'Canva', 'figma.com': 'Figma', 'pinterest.com': 'Pinterest', 'pin.it': 'Pinterest',
  'youtube.com': 'YouTube', 'youtu.be': 'YouTube', 'vimeo.com': 'Vimeo',
  'instagram.com': 'Instagram', 'tiktok.com': 'TikTok', 'spotify.com': 'Spotify',
  'mercadolivre.com.br': 'Mercado Livre', 'mercadolivre.com': 'Mercado Livre',
  'amazon.com.br': 'Amazon', 'a.co': 'Amazon', 'amzn.to': 'Amazon',
  'magazineluiza.com.br': 'Magalu', 'shopee.com.br': 'Shopee', 'shope.ee': 'Shopee',
  'kabum.com.br': 'KaBuM', 'leroymerlin.com.br': 'Leroy Merlin', 'guiaservir.com': 'GUIA Servir',
};
export const nomeDoSite = (site: string) => NOME_DO_SITE[site] ?? site;

/** Os nomes da lista, sem repetir serviço, na ordem em que a lista vem. */
export function nomesDosSites(sites: readonly string[]): string[] {
  return [...new Set(sites.map(nomeDoSite))];
}

/** A dica curta do campo de anexo: os mais usados primeiro, e quantos mais. */
export function dicaDeAnexo(regra: RegraDeAnexo | null | undefined): string {
  if (!regra?.restrito) return 'Cole o link do arquivo: Drive, Dropbox, Fotos.';
  const nomes = nomesDosSites(regra.sites);
  if (!nomes.length) return 'A administração ainda não liberou nenhum site para anexo.';
  const preferidos = ['Google Drive', 'Dropbox', 'OneDrive', 'iCloud'];
  const frente = [...preferidos.filter(n => nomes.includes(n)),
                  ...nomes.filter(n => !preferidos.includes(n))].slice(0, 4);
  const mais = nomes.length - frente.length;
  return `Aceita links de ${frente.join(', ')}${mais > 0 ? ` e mais ${mais}` : ''}.`;
}

/** O recado de quando a tela já sabe que o site vai ser recusado. */
export const recadoDeSite = (site: string) =>
  `Links de ${site} não são aceitos como anexo. Use Google Drive, Dropbox, OneDrive ou iCloud.`;
