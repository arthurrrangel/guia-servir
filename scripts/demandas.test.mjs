/* As regras puras. Roda com `npm test`.

   O TESTE QUE JUSTIFICA O ARQUIVO é o 1: a tela e o banco decidem permissão
   em dois lugares diferentes, então aqui está escrito, à mão, o que
   `dem_mover` faz — lendo o SQL — e a matriz inteira de papel × setor × quem
   abriu × status × aprovação é conferida contra `acoesDe`.

   A direção importa: oferecer MENOS que o servidor permite é escolha de tela;
   oferecer MAIS é defeito, porque a pessoa toca, leva "sem permissão" e
   conclui que o sistema está quebrado. O teste falha só na direção do
   defeito. */

import {
  acoesDe, comoOPdfChama, oQueFalta, rascunhoVazio, situacao, prazoSugerido,
  somaDias, linkZap, soDigitos, telDoBanco, telVisivel, recadoDoErro, recado, diasDeAtraso,
  siteDoLink, siteNaLista, siteRecusado, dicaDeAnexo, nomesDosSites, recadoDeSite,
  horas, dinheiro, dataCheia, rotStatus, carimbo, CODIGOS, HOJE, TETO, tetoDe, pedidoPara, primariaDe,
  chaveDoSetor, setorDoLink, pedidoDoLink, buscaDoLink,
} from '../lib/demandas/regras.ts';
import { ehRecusaDeIdentidade, rpcCom } from '../lib/demandas/api.ts';

let falhas = 0, feitas = 0;
const ok = (cond, rotulo, extra = '') => {
  feitas++;
  if (!cond) { falhas++; console.log('  FALHOU:', rotulo, extra); }
};

/* =============================================================================
   1. O ESPELHO
   O que `supabase/50-demandas.sql` aceita, transcrito. Se você mudar o SQL,
   mude aqui e veja o teste apontar a divergência.
   ============================================================================= */
/* AS DIVERGÊNCIAS QUE SÃO DE PROPÓSITO — 20/09/2026.

   Rodando o espelho nos dois sentidos pela primeira vez, apareceram 118
   combinações em que o servidor aceita e a tela não oferece. Elas caíam em
   três ações, e cada uma ficou escrita aqui, uma a uma, para que QUALQUER
   divergência nova reprove — que é o ponto.

   Deixar o teste exigir zero seria mentir do outro lado: ele passaria a
   reprovar por escolhas conscientes, alguém relaxaria o teste, e aí nada mais
   seria pego.

   Eram três; são duas desde 22/09/2026, quando a de "travar" foi medida e se
   revelou falsa. O comentário logo abaixo conta o caso inteiro, e ele é o
   motivo de esta lista existir num lugar que dá para conferir: um combinado é
   uma afirmação sobre o SERVIDOR, e afirmação sobre o servidor envelhece. */
/* O COMBINADO DE "TRAVAR" SAIU DAQUI — 22/09/2026, E ELE ERA FALSO.

   Ele dizia, sobre a demanda já travada: "o servidor aceita re-travar (é
   idempotente); a tela esconde porque oferecer travar no que está travado é
   oferecer um botão que não muda nada."

   Medido no SQL que está no ar (85:337-353): re-travar NÃO é idempotente. O
   `update` grava `travada_por = v_motivo` e `travada_nota = v_txt`, ou seja,
   re-travar com outro motivo TROCA os dois. É a operação normal de quem
   atende: a demanda estava "esperando informação", a informação chegou, mas
   agora depende do fornecedor — isso é "esperando terceiros".

   Com o botão escondido, o único caminho pela tela era destravar e travar de
   novo: dois eventos no histórico para uma coisa que não aconteceu (a demanda
   nunca voltou a andar no meio), e um `status` intermediário gravado em
   `mexida_em`. O combinado não era uma escolha de produto: era uma descrição
   errada do servidor, sustentando uma tela errada.

   Combinado que vira falso SAI da lista. Não ganha redação nova — a redação
   nova é justamente como um combinado errado sobrevive à auditoria seguinte. */
const COMBINADAS = [
  {
    acao: 'destravar',
    /* 28 casos. Quem ABRIU a demanda destrava quando a trava é de INFORMAÇÃO:
       a informação pedida é dele, ele responde e segue. Trava de APROVAÇÃO e
       de TERCEIROS não são dele para soltar — quem aprova é gestor, e quem
       espera terceiro é o setor. O servidor é mais frouxo que isto
       (`52:710`), e a tela é que está certa. */
    quando: (d, eu) => eu.abriu && !eu.atende && d.travada_por !== 'informacao',
  },
  {
    acao: 'assumir',
    /* A demanda já está em EXECUÇÃO: alguém do setor já assumiu. A tela
       esconde.

       ESTE COMBINADO ENCOLHEU EM 21/09/2026. Ele dizia "o servidor deixa
       outro tomar por cima" — e esse era justamente o defeito. Medido: duas
       pessoas tocando em "assumir" no mesmo segundo, as duas passam, e a
       segunda rouba a demanda da primeira sem nenhum aviso. A migração 86 pôs
       a guarda `JA_TEM_DONO` no servidor.

       Sobra o caso legítimo: a demanda em execução SEM dono, que a migração
       84 provou existir (reabrir gravava `execucao` fixo mesmo quando
       ninguém era responsável). Aí o servidor aceita, e a tela esconde
       porque `status === 'execucao'` — o que deixava a demanda inalcançável.
       A 84 consertou a origem; este combinado cobre o que já está no banco.

       A pergunta para o Arthur continua de pé, e agora ela é outra: quando
       quem assumiu some, o colega deveria poder assumir? Hoje precisa de um
       gestor para redirecionar. */
    quando: (d) => d.status === 'execucao',
  },
];
const combinado = (acao, d, eu) =>
  COMBINADAS.some(c => c.acao === acao && c.quando(d, eu));

function servidorAceita(acao, d, eu) {
  const manda = eu.papel === 'gestor' || eu.papel === 'admin';
  const fechada = d.status === 'concluida' || d.status === 'cancelada';
  /* O PORTAO DO SERVIDOR E `demandas.falta_aprovacao(d)`, NAO A COLUNA.

     Este modelo dizia `d.aprovacao === 'pendente'`, que e o SQL de antes da
     migracao 84. Duas auditorias independentes mostraram o preco disso: a
     matriz de 84 casos ficava 84/84 e mesmo assim nao pegava dois defeitos
     reais, porque ela estava espelhando a versao errada do servidor.

       - `destravar`: o modelo olhava `travada_por === 'aprovacao'`. O servidor
         nao olha o rotulo desde a 67 — foi assim que a porta dos fundos
         nasceu. No estado que a cura produz, o modelo dizia "aceita" e o
         servidor recusava.
       - `aprovar`: o modelo dizia "nao esta pendente" num estado em que o
         servidor devolve {"ok": true}, porque ele cura antes de despachar.

     `falta_aprovacao` chega no caso vindo de `dem_ver`, e a matriz o varre
     junto com `aprovacao` para cobrir o dia em que os dois divergem. */
  const pendente = d.falta_aprovacao ?? (d.aprovacao === 'pendente');

  /* guarda do topo: fechada só aceita comentar, anexar, desanexar, reabrir e,
     desde a migração 91, validar. */
  if (fechada && !['comentar', 'anexar', 'desanexar', 'reabrir', 'validar'].includes(acao)) return false;

  switch (acao) {
    case 'comentar':    return true;                                   // basta pode_ver
    /* 85 · ERA `return true`, ou seja, todo mundo do setor. Medido: uma
       solicitante rasa pregou um "boleto atualizado.pdf" numa compra alheia.
       O servidor exige o mesmo par que `destravar` já exigia. */
    case 'anexar':      return eu.atende || eu.abriu;
    /* `desanexar` SAIU DE `TODAS` — 22/09/2026, e o modelo sai junto.

       O servidor e `pode_atender(m,d) OR a.membro_id = m.id`: quem abriu e
       nao atende so tira o que ELE colou. Isto nao e uma pergunta sobre a
       DEMANDA, e `acoesDe` so sabe responder sobre a demanda — por isso a
       acao saiu de la, e por isso o modelo nao tem o que espelhar aqui.

       Quem responde e `posso_tirar`, por ANEXO, calculado por `dem_ver` desde
       a migracao 89 com a MESMA expressao do `desanexar`, e a ficha ja o le em
       cada linha da lista de anexos. O modelo anterior dizia `atende || abriu`
       para `anexar` e `desanexar` juntos: ele CONCORDAVA com o defeito da tela,
       e a suite passava verde sobre um botao que o banco recusa. */
    /* 86 · a guarda de dono, e ela e sobre OUTRA pessoa.

       Isto dizia `!d.responsavel`, ou seja "recusa quando ha dono". O servidor
       recusa quando o dono e OUTRO: `d.responsavel_id is not null and <> m.id`.
       A propria conferencia da 86 prova que reassumir a PROPRIA demanda e
       aceito. E a matriz nunca punha `responsavel_id` no caso nem `id` em
       `eu`, entao a guarda `JA_TEM_DONO` de `acoesDe` nunca era exercitada:
       apagar a linha dela do `regras.ts` NAO reprovava a suite. Medido em
       22/09/2026. */
    case 'assumir':     return eu.atende && !pendente
                            && !(d.responsavel_id && eu.id && d.responsavel_id !== eu.id);
    /* `travar` COM O PORTAO ABERTO — 22/09/2026.

       Isto dizia so `eu.atende`, e era o modelo que sustentava o defeito.
       O servidor (85:340) recusa com FALTA_APROVACAO quando
       `demandas.falta_aprovacao(d)` e o motivo NAO e `aprovacao`.

       O modelo decide por ACAO, e o servidor por MOTIVO — entao a pergunta
       honesta e: a chamada que A TELA faria passa? Nao. O seletor da ficha
       abre em `informacao` por padrao (o primeiro item de `TRAVAS`), que e o
       motivo recusado. E o unico motivo que passaria, `aprovacao`, nao muda
       nada: a demanda JA esta esperando aprovacao, que e o que o portao
       aberto significa, e o aviso amarelo do topo da ficha ja diz isso.

       Com o portao aberto nao existe trava util. `!pendente` e o modelo
       certo, e nao e "tela mais restritiva que o banco": e a tela deixando de
       oferecer uma chamada que, do jeito que ela a faz, sempre deu erro. */
    case 'travar':      return eu.atende && !pendente;
    /* sem `travada_por` na condicao: o servidor le so o portao (67) */
    case 'destravar':   return (eu.atende || eu.abriu) && d.status === 'travada' && !pendente;
    case 'aprovar':
    case 'rejeitar':    return manda && pendente;
    case 'prazo':
    case 'prioridade':  return eu.atende;
    /* 67 no servidor, 21/09 aqui: `concluir` nunca passou com o portão
       aberto, e este modelo dizia que passava. Era o modelo que estava
       errado, não a tela — e por isso o espelho aprovava um botão morto. */
    case 'concluir':    return eu.atende && !pendente;
    case 'redirecionar':return manda || eu.atende;
    case 'cancelar':    return eu.atende || eu.abriu || manda;
    case 'reabrir':     return (eu.abriu || manda || eu.atende) && fechada;
    /* 91 · a etapa 5 do PDF. O contrato da migração, transcrito:
       guarda `d.aberta_por = m.id or m.papel in ('gestor','admin')`, exige
       `status = 'concluida'` (`NAO_ESTA_CONCLUIDA`) e ainda não validada
       (`JA_VALIDADA`). `cancelada` não entra: não há execução para validar. */
    case 'validar':     return (eu.abriu || manda) && d.status === 'concluida' && !d.validada_em;
    default:            return false;
  }
}

{
  const PAPEIS = ['solicitante', 'responsavel', 'gestor', 'admin'];
  const STATUS = ['aberta', 'execucao', 'travada', 'concluida', 'cancelada'];
  const TRAVAS = [null, 'informacao', 'aprovacao', 'terceiros'];
  const APROV = [null, 'pendente', 'aprovada', 'rejeitada'];
  /* o veredito do portao varre SEPARADO da coluna: e justamente quando os
     dois discordam que a tela e o servidor se desencontram */
  const FALTA = [false, true];
  /* ja validada ou nao: a celula nova da migracao 91. Varre em TODO status,
     e nao so em `concluida`, porque o jeito de `validar` virar botao morto e
     alguem esquecer a guarda de status — e isso so aparece se a matriz puser
     `validada_em` em demanda aberta tambem. */
  const VALIDADA = [null, '2026-09-22T12:00:00Z'];
  /* `desanexar` SAIU DA LISTA — 22/09/2026. Ver o comentario em
     `servidorAceita`: a pergunta e por ANEXO (`posso_tirar`, migracao 89), nao
     por demanda, e `acoesDe` nao devolve mais a acao. Continuar na lista faria
     o teste cobrar de `acoesDe` uma resposta que ela nao tem como dar certo.
     `validar` entrou no lugar. */
  const TODAS = ['assumir', 'travar', 'destravar', 'aprovar', 'rejeitar', 'prazo',
    'prioridade', 'redirecionar', 'concluir', 'cancelar', 'reabrir', 'validar',
    'comentar', 'anexar'];

  let casos = 0, oferecidasDemais = 0, escondidas = 0, primFora = 0, primSumiu = 0;
  const exemplos = [];
  /* as ações que tiram a demanda do estado em que ela está (o resto é ajuste
     ou conversa). `reabrir` fica de fora de propósito: é a exceção, não o
     gesto comum, e por isso nunca é primário. */
  const ANDAM = ['assumir', 'destravar', 'aprovar', 'concluir', 'validar'];
  for (const papel of PAPEIS)
    for (const atende of [false, true])
      for (const abriu of [false, true])
        for (const status of STATUS)
          for (const travada_por of TRAVAS)
            for (const aprovacao of APROV)
            for (const falta_aprovacao of FALTA) {
              if (status !== 'travada' && travada_por !== null) continue;   // estado impossível
              if (status === 'travada' && travada_por === null) continue;
              if (papel === 'solicitante' && atende) continue;              // solicitante não atende
              /* DONO E IDENTIDADE ENTRARAM NA VARREDURA — 22/09/2026.

                 A matriz montava `responsavel: null` e um `eu` sem `id`. Com
                 isso `deOutraPessoa` em `acoesDe` era sempre falso e a guarda
                 de dono nunca rodava em caso nenhum dos 784. Tres donos
                 possiveis: ninguem, eu, outra pessoa. */
              for (const dono of [null, 'eu-1', 'outra-2'])
              for (const validada_em of VALIDADA) {
              const d = { status, travada_por, aprovacao, falta_aprovacao, validada_em,
                          responsavel: dono ? 'Alguem' : null,
                          responsavel_id: dono === 'eu-1' ? 'eu-1' : dono };
              const eu = { papel, atende, abriu, id: 'eu-1' };
              const dadas = acoesDe(d, eu);
              casos++;
              for (const a of dadas) {
                if (!servidorAceita(a, d, eu)) {
                  oferecidasDemais++;
                  if (oferecidasDemais < 4) {
                    console.log('  botão que o servidor recusa:', a, JSON.stringify({ ...d, ...eu }));
                  }
                }
              }
              /* O ESPELHO SÓ OLHAVA PARA UM LADO — 20/09/2026, auditoria de QA.

                 A linha que estava aqui era:

                     for (const a of TODAS)
                       if (dadas.includes(a) && !TODAS.includes(a)) falhas++;

                 `a` vem de `TODAS`, então `!TODAS.includes(a)` é sempre falso
                 e o laço nunca incrementava nada. Parecia conferir "ação fora
                 do vocabulário" e não conferia coisa alguma.

                 Pior: o laço de cima só contava botão A MAIS (a tela oferece,
                 o servidor recusa). Botão A MENOS — o servidor aceitaria e a
                 tela esconde — não era contado por ninguém. Sabotando
                 `lib/demandas/regras.ts` para sumir com `cancelar` de TODO
                 MUNDO, ou para tirar `comentar` e `anexar` de demanda aberta,
                 a suíte passava 80/80.

                 Botão a menos é o defeito mais silencioso dos dois: ninguém
                 reclama de um botão que nunca viu. */
              for (const a of TODAS) {
                if (!dadas.includes(a) && servidorAceita(a, d, eu) && !combinado(a, d, eu)) {
                  escondidas++;
                  if (exemplos.length < 4) {
                    exemplos.push(`${a} — ${JSON.stringify({ ...d, ...eu })}`);
                  }
                }
                /* e o vocabulário, agora de verdade: nada fora da lista */
                if (!TODAS.includes(a)) falhas++;
              }
              for (const a of dadas) {
                if (!TODAS.includes(a)) {
                  falhas++;
                  console.log('  ação fora do vocabulário:', a);
                }
              }
              /* O PRIMÁRIO, UM SÓ POR VISTA — 23/09/2026 (risco 4 da
                 recomendação do Fable). `primariaDe` escolhe entre o que
                 `acoesDe` deu; se ela escolher algo que a matriz não deu, o
                 painel mostra um botão preto que o servidor recusa. E se
                 há uma ação que ANDA com a demanda (das PRINCIPAIS) e ela
                 devolve nulo, o gesto comum some do painel: o caso da
                 recomendação, "um estado esquecido faria uma ação sumir". */
              {
                const prim = primariaDe(d, dadas);
                if (prim !== null && !dadas.includes(prim)) {
                  primFora++;
                  if (primFora < 4) console.log('  primário que a matriz não deu:', prim, JSON.stringify({ ...d, ...eu }));
                }
                const anda = dadas.filter(a => ANDAM.includes(a));
                if (prim === null && anda.length) {
                  primSumiu++;
                  if (primSumiu < 4) console.log('  ação que anda sem primário:', anda.join(','), JSON.stringify({ ...d, ...eu }));
                }
              }
              }
            }
  /* 4 papéis x atende x abriu x estados possíveis x veredito x TRÊS DONOS
     (ninguém, eu, outra pessoa) x VALIDADA OU NÃO, tirando os impossíveis:
     travada sem motivo, motivo sem travada, solicitante que atende.

     Era 784 antes de 22/09/2026, quando o dono entrou na varredura; virou
     2352 ali mesmo, e 4704 quando `validada_em` entrou, na mesma data. O
     número está fixo de propósito: se ele mudar, alguém mexeu na matriz e tem
     que olhar por quê. */
  ok(casos === 4704, 'a matriz cobre a combinação inteira', 'casos=' + casos);
  ok(primFora === 0, 'o primário é sempre uma ação que a matriz deu', 'fora=' + primFora);
  ok(primSumiu === 0, 'e quando há ação que anda com a demanda, há um primário', 'sumiu=' + primSumiu);
  ok(oferecidasDemais === 0, 'nenhum botão oferecido que o servidor recusa', 'sobras=' + oferecidasDemais);
  if (escondidas) exemplos.forEach(e => console.log('  botão que o servidor aceita e a tela esconde:', e));
  ok(escondidas === 0, 'nenhum botão escondido que o servidor aceitaria, fora os combinados',
     'faltas=' + escondidas);

  /* e as combinadas TÊM que continuar acontecendo: se alguma sumir, ou o
     `acoesDe` mudou ou o espelho mudou, e nos dois casos a lista acima ficou
     velha. Um combinado que ninguém mais exercita é um comentário, não uma
     regra. */
  for (const c of COMBINADAS) {
    let vezes = 0;
    for (const papel of PAPEIS)
      for (const atende of [false, true])
        for (const abriu of [false, true])
          for (const status of STATUS)
            for (const travada_por of TRAVAS)
              for (const aprovacao of APROV) {
                if (status !== 'travada' && travada_por !== null) continue;
                if (status === 'travada' && travada_por === null) continue;
                if (papel === 'solicitante' && atende) continue;
                const d = { status, travada_por, aprovacao, responsavel: null };
                const eu = { papel, atende, abriu };
                if (!acoesDe(d, eu).includes(c.acao) && servidorAceita(c.acao, d, eu)
                    && c.quando(d, eu)) vezes++;
              }
    ok(vezes > 0, `a divergência combinada de "${c.acao}" ainda existe`, 'vezes=' + vezes);
  }
}

/* 1b. e o contrário, nos casos que importam: as ações principais TÊM que
   aparecer para quem pode. Um espelho que não oferece nada também passaria no
   teste de cima. */
{
  const atende = { papel: 'responsavel', atende: true, abriu: false };
  const aberta = { status: 'aberta', travada_por: null, aprovacao: null };
  for (const a of ['assumir', 'travar', 'prazo', 'prioridade', 'concluir', 'redirecionar']) {
    ok(acoesDe(aberta, atende).includes(a), `quem atende vê "${a}"`);
  }
  const gestor = { papel: 'gestor', atende: false, abriu: false };
  const esperando = { status: 'travada', travada_por: 'aprovacao', aprovacao: 'pendente' };
  ok(acoesDe(esperando, gestor).includes('aprovar'), 'gestor vê aprovar quando está pendente');
  ok(acoesDe(esperando, gestor).includes('rejeitar'), 'gestor vê rejeitar quando está pendente');
  ok(!acoesDe(esperando, { papel: 'responsavel', atende: true, abriu: false }).includes('aprovar'),
    'quem atende NÃO aprova');
  ok(!acoesDe(esperando, { papel: 'responsavel', atende: true, abriu: false }).includes('assumir'),
    'e nem assume antes da aprovação sair');

  const pediu = { papel: 'solicitante', atende: false, abriu: true };
  ok(acoesDe({ status: 'travada', travada_por: 'informacao', aprovacao: null }, pediu).includes('destravar'),
    'quem pediu responde e destrava — é o que tira a demanda do limbo');
  ok(!acoesDe({ status: 'travada', travada_por: 'terceiros', aprovacao: null }, pediu).includes('destravar'),
    'mas não destrava o que depende de gente de fora');
  ok(acoesDe({ status: 'concluida', travada_por: null, aprovacao: null }, pediu).includes('reabrir'),
    'quem pediu reabre o que não resolveu');
  ok(!acoesDe({ status: 'aberta', travada_por: null, aprovacao: null }, pediu).includes('reabrir'),
    'e não reabre o que nem fechou');
  ok(acoesDe({ status: 'concluida', travada_por: null, aprovacao: null }, pediu).includes('comentar'),
    'comentar continua valendo depois de fechada: é como se pede revisão');
}

/* 1c. OS ESTADOS QUE MUDARAM EM 22/09/2026, cada um escrito à mão.

   A matriz de 4704 pega tudo isso — e pega junto com 4703 outros casos, numa
   contagem. Quando ela reprova, a linha que sai é "faltas=108", que diz que
   algo quebrou e não diz o quê. Estes são os casos NOMEADOS: quem quebrar um
   deles lê o nome do defeito que voltou, e não um número. */
{
  const atende = { papel: 'responsavel', atende: true, abriu: false, id: 'eu-1' };
  const pediu = { papel: 'solicitante', atende: false, abriu: true, id: 'eu-1' };
  const gestor = { papel: 'gestor', atende: false, abriu: false, id: 'eu-9' };

  /* 1 · travar com o portão de aprovação ABERTO. O servidor só aceitaria com
         motivo `aprovacao`, e o seletor da ficha abre em `informacao`. */
  const portao = { status: 'aberta', travada_por: null, aprovacao: null, falta_aprovacao: true };
  ok(!acoesDe(portao, atende).includes('travar'),
    'travar NÃO aparece com o portão de aprovação aberto (o servidor recusa o motivo padrão)');
  ok(!acoesDe({ ...portao, status: 'execucao' }, atende).includes('travar'),
    'e nem em execução com o portão aberto');
  ok(!acoesDe({ status: 'travada', travada_por: 'informacao', aprovacao: 'pendente',
                falta_aprovacao: true }, atende).includes('travar'),
    'nem sobre uma trava que já existe, se o portão está aberto');

  /* 2 · travar sobre demanda JÁ TRAVADA, portão fechado: é como se muda o
         motivo de "esperando informação" para "esperando terceiros" sem
         gravar um destravar que não aconteceu. */
  for (const t of ['informacao', 'aprovacao', 'terceiros']) {
    ok(acoesDe({ status: 'travada', travada_por: t, aprovacao: null }, atende).includes('travar'),
      `travar aparece sobre a trava de "${t}": re-travar TROCA o motivo, não é idempotente`);
  }

  /* 3 · desanexar não é mais resposta desta função. */
  for (const quem of [atende, pediu, gestor]) {
    ok(!acoesDe({ status: 'aberta', travada_por: null, aprovacao: null }, quem).includes('desanexar'),
      'desanexar não sai de acoesDe: quem decide é o posso_tirar, por anexo');
  }
  ok(acoesDe({ status: 'aberta', travada_por: null, aprovacao: null }, pediu).includes('anexar'),
    'mas anexar continua saindo: essa pergunta é sobre a demanda');

  /* 4 · validar: a etapa 5 do PDF (migração 91). */
  const pronta = { status: 'concluida', travada_por: null, aprovacao: null, validada_em: null };
  ok(acoesDe(pronta, pediu).includes('validar'), 'quem pediu confirma que resolveu');
  ok(acoesDe(pronta, gestor).includes('validar'), 'e a liderança também');
  ok(!acoesDe(pronta, atende).includes('validar'),
    'quem EXECUTOU não valida o próprio trabalho: é o ponto inteiro da etapa 5');
  ok(!acoesDe({ ...pronta, validada_em: '2026-09-22T12:00:00Z' }, pediu).includes('validar'),
    'e não valida duas vezes');
  ok(!acoesDe({ status: 'cancelada', travada_por: null, aprovacao: null }, pediu).includes('validar'),
    'cancelada não se valida: não houve execução para conferir');
  ok(!acoesDe({ status: 'execucao', travada_por: null, aprovacao: null }, pediu).includes('validar'),
    'nem o que ainda está sendo feito');
  ok(acoesDe(pronta, pediu).includes('reabrir'),
    'e reabrir continua ao lado: confirmar e discordar são as duas respostas');
}

/* =============================================================================
   2. Os 11 status do PDF continuam existindo como leitura
   ============================================================================= */
{
  const casos = [
    [{ status: 'aberta', responsavel: null }, 'Aberta'],
    /* "EM TRIAGEM" ERA UM RAMO MORTO — 22/09/2026.

       O caso que estava aqui era `{ status:'aberta', responsavel:'Monik' }`, e
       ele dava verde sobre um par que o servidor NÃO produz: `assumir` grava
       responsável e `status='execucao'` na mesma instrução, e `redirecionar`
       zera o responsável. O teste montava à mão um estado impossível e o
       chamava de cobertura — é assim que um ramo morto ganha atestado de vivo.

       A triagem do PDF acontece no NASCIMENTO, na categoria (setor, prazo
       padrão e portão de aprovação saem dela em `dem_abrir`), e o estado
       colapsa em "Aberta". O caso vira a prova disso: demanda aberta COM
       responsável — se ela existisse — continua sendo "Aberta". */
    [{ status: 'aberta', responsavel: 'Monik' }, 'Aberta'],
    [{ status: 'aberta', aprovacao: 'aprovada' }, 'Aprovada'],
    [{ status: 'travada', travada_por: 'aprovacao' }, 'Aguardando aprovação'],
    [{ status: 'travada', travada_por: 'informacao' }, 'Aguardando informações'],
    [{ status: 'travada', travada_por: 'terceiros' }, 'Aguardando terceiros'],
    [{ status: 'execucao' }, 'Em execução'],
    [{ status: 'execucao', reaberturas: 1 }, 'Reaberta'],
    [{ status: 'concluida' }, 'Concluída'],
    [{ status: 'cancelada' }, 'Cancelada'],
  ];
  for (const [d, esperado] of casos) {
    ok(comoOPdfChama(d) === esperado, `de-para: ${esperado}`, comoOPdfChama(d));
  }
  const vistos = new Set(casos.map(c => c[1]));
  /* DOIS DOS ONZE NÃO SÃO LEITURA DE NADA, e os dois estão certos assim:

     · "Rascunho" — no documento é "ainda não enviada", e aqui uma demanda só
       existe depois de enviada. O rascunho mora no `localStorage` da tela de
       abertura, que é onde ele deve morar: linha de tabela para o que ainda
       não foi mandado é lixo que alguém vai ter que limpar.
     · "Em triagem" — a triagem acontece no nascimento, na categoria. Ver o
       caso comentado acima e o de-para em `regras.ts`.

     Era 10 até 22/09/2026, e o décimo era o ramo morto. O número baixou
     porque o de-para ficou honesto, não porque alguma leitura se perdeu. */
  ok(vistos.size === 9, 'nove dos onze nomes do PDF são alcançáveis', String(vistos.size));
  /* e o ramo morto não volta pela porta dos fundos: nenhuma entrada devolve
     o nome que saiu do tipo. */
  ok(!casos.some(c => comoOPdfChama(c[0]) === 'Em triagem'),
    'nenhum estado é lido como "Em triagem"');
}

/* =============================================================================
   2b. DATA, HORA E A FRASE RELATIVA NA MESMA LINHA
   O PDF pede "Data e horário da abertura" na Identificação, e a ficha mostrava
   só a frase relativa — que nos primeiros 30 dias nem data tem.
   ============================================================================= */
{
  const agora = Date.now();
  const recente = new Date(agora - 3 * 86400000).toISOString();
  const c = carimbo(recente);
  ok(/\d{2}\/\d{2}\/\d{4}/.test(c), 'o carimbo tem a data', c);
  ok(/\d{2}:\d{2}/.test(c), 'e a HORA, que é o que faltava', c);
  ok(/há 3 dias/.test(c), 'e a frase relativa continua lá, que é a que se lê rápido', c);

  /* passados 30 dias `quando()` já devolve a data: repeti-la seria ruído */
  const velha = new Date(agora - 200 * 86400000).toISOString();
  const cv = carimbo(velha);
  ok((cv.match(/\d{2}\/\d{2}\/\d{4}/g) || []).length === 1,
    'depois de 30 dias a data não aparece duas vezes', cv);
  ok(/\d{2}:\d{2}/.test(cv), 'e a hora continua', cv);

  ok(carimbo(null) === '', 'sem data não inventa carimbo');
  ok(carimbo('nada disso') === '', 'data podre não vira "Invalid Date" na tela');
  /* o fuso é o do Rio, como em `HOJE()`: às 22h30 do Rio ainda é o mesmo dia,
     e um carimbo que muda de dia conforme o celular de quem olha não serve
     para conferir nada. */
  ok(carimbo('2026-09-23T01:30:00Z').startsWith('22/09/2026 às 22:30'),
    'o carimbo é a hora do Rio, não a do aparelho', carimbo('2026-09-23T01:30:00Z'));
}

/* =============================================================================
   3. O que falta antes de enviar: as mesmas regras do banco, antes da ida
   ============================================================================= */
{
  const cheio = () => ({
    ...rascunhoVazio(), titulo: 'Arte do culto',
    descricao: 'Criar a arte do culto de celebração', categoria_id: 'c1', prazo: '2026-09-22',
  });
  ok(oQueFalta(cheio(), true).length === 0, 'rascunho completo não reclama',
    JSON.stringify(oQueFalta(cheio(), true)));

  ok(oQueFalta({ ...cheio(), prazo: '' }, true).length === 1, 'sem prazo e sem justificativa reclama');
  ok(oQueFalta({ ...cheio(), prazo: '', sem_prazo_porque: 'depende do pastor' }, true).length === 0,
    'sem prazo COM justificativa passa');
  ok(oQueFalta({ ...cheio(), prioridade: 'urgente' }, true).length === 1, 'urgente sem impacto reclama');
  ok(oQueFalta({ ...cheio(), prioridade: 'urgente', impacto: 'não tem culto' }, true).length === 0,
    'urgente com impacto passa');
  ok(oQueFalta({ ...cheio(), evento: 'Congresso' }, true).length === 1, 'evento sem data reclama');
  ok(oQueFalta({ ...cheio(), evento: 'Congresso', evento_data: '2026-10-01' }, true).length === 0,
    'evento com data passa');
  ok(oQueFalta(cheio(), false).some(x => x.includes('setor')), 'sem setor reclama do setor');
  ok(oQueFalta({ ...cheio(), titulo: 'ok' }, true).some(x => x.includes('título')), 'título curto reclama');
  ok(oQueFalta({ ...cheio(), descricao: 'faz aí' }, true).some(x => x.includes('descrição')),
    'descrição curta reclama');
  /* o texto tem que dizer O QUE fazer, não "campo obrigatório" */
  ok(oQueFalta({ ...cheio(), prazo: '' }, true)[0].includes('data'), 'a frase diz qual dado falta',
    oQueFalta({ ...cheio(), prazo: '' }, true)[0]);

  /* ---- 3b. O ORÇAMENTO DA CATEGORIA QUE EXIGE ORÇAMENTO -------------------

     Até 22/09/2026 NENHUM caso deste arquivo chamava `oQueFalta` com uma
     categoria. O terceiro parâmetro existia, o corpo da função tinha o ramo
     escrito, e apagar o ramo inteiro deixava a suíte verde.

     O defeito que o ramo mata está escrito no próprio `regras.ts`: doze das
     43 categorias exigem orçamento (todas as de Compras, Reembolso, Reserva
     financeira, Solicitação de pagamento, Alimentação, Transporte), e a
     pessoa preenchia o formulário inteiro, tocava em Enviar, e só então lia
     que faltava um valor — porque quem cobrava era o banco, com
     `ORCAMENTO_OBRIGATORIO`, depois da ida.

     `oQueFalta` promete, no comentário logo acima dela, ser "as mesmas regras
     que o banco impõe como CHECK, aqui só para a pessoa saber ANTES". Sem
     este bloco a promessa não tem quem cobre. */
  const exige = { id: 'c1', exige_orcamento: true, exige_aprovacao: false, prazo_padrao_dias: null };
  const naoExige = { ...exige, exige_orcamento: false };

  ok(oQueFalta(cheio(), true, exige).length === 1,
    'categoria que exige orçamento reclama quando o valor não veio',
    JSON.stringify(oQueFalta(cheio(), true, exige)));
  /* `?? ''` e não `[0].includes(...)`: com o ramo do orçamento apagado a
     lista volta vazia, e ler `[0]` derruba o processo no primeiro tropeço —
     os casos seguintes nunca rodariam e o estrago pareceria menor do que é. */
  ok((oQueFalta(cheio(), true, exige)[0] ?? '').includes('valor'),
    'e a frase diz que é o VALOR que falta, não "campo obrigatório"',
    String(oQueFalta(cheio(), true, exige)[0]));
  ok(oQueFalta({ ...cheio(), orcamento: '180,00' }, true, exige).length === 0,
    'com o valor preenchido, ela deixa passar',
    JSON.stringify(oQueFalta({ ...cheio(), orcamento: '180,00' }, true, exige)));
  /* espaço em branco não é valor: o banco cobra `orcamento is not null`, e
     " " passaria num `!r.orcamento` mal escrito */
  ok(oQueFalta({ ...cheio(), orcamento: '   ' }, true, exige).length === 1,
    'e espaço em branco não conta como valor');
  /* e a cobrança é da CATEGORIA, não de todo mundo: 31 das 43 não exigem, e
     cobrar de quem não deve é a outra metade do mesmo defeito */
  ok(oQueFalta(cheio(), true, naoExige).length === 0,
    'categoria que NÃO exige orçamento não cobra valor nenhum',
    JSON.stringify(oQueFalta(cheio(), true, naoExige)));
  ok(oQueFalta(cheio(), true, null).length === 0,
    'e sem categoria em mãos (carga ainda não chegou) a função não inventa cobrança');
  ok(oQueFalta(cheio(), true).length === 0,
    'nem quando ninguém passa o terceiro parâmetro');
}

/* =============================================================================
   4. Tempo
   ============================================================================= */
{
  const H = '2026-09-18';
  ok(somaDias(H, 5) === '2026-09-23', 'soma dias', somaDias(H, 5));
  ok(somaDias('2026-09-28', 5) === '2026-10-03', 'soma virando o mês', somaDias('2026-09-28', 5));
  ok(somaDias('2026-12-30', 3) === '2027-01-02', 'soma virando o ano', somaDias('2026-12-30', 3));
  ok(prazoSugerido({ prazo_padrao_dias: 5 }, H) === '2026-09-23', 'prazo sugerido pela categoria');
  ok(prazoSugerido({ prazo_padrao_dias: null }, H) === '', 'categoria sem prazo padrão não sugere');
  ok(prazoSugerido(undefined, H) === '', 'sem categoria não sugere');

  const s = (o) => situacao({ status: 'aberta', prazo: null, parada_dias: 0, ...o }, H);
  ok(s({ prazo: '2026-09-17' }) === 'atrasada', 'prazo de ontem é atraso');
  ok(s({ prazo: '2026-09-18' }) === 'hoje', 'prazo de hoje é hoje');
  ok(s({ prazo: '2026-09-19' }) === 'em dia', 'prazo de amanhã é em dia');
  ok(s({ parada_dias: 7 }) === 'parada', 'sete dias sem movimento é pendente de atenção');
  ok(s({ parada_dias: 6 }) === 'em dia', 'seis não');
  ok(s({ prazo: '2026-09-17', parada_dias: 30 }) === 'atrasada', 'atraso ganha de parada');
  ok(s({ status: 'concluida', prazo: '2026-01-01' }) === 'fechada',
    'concluída não é atrasada: já acabou');
  ok(s({ status: 'cancelada', parada_dias: 900 }) === 'fechada', 'cancelada também não');
  ok(diasDeAtraso('2026-09-13', H) === 5, 'conta os dias de atraso', String(diasDeAtraso('2026-09-13', H)));
  ok(diasDeAtraso('2026-09-30', H) === 0, 'prazo no futuro não tem atraso');
  ok(diasDeAtraso(null, H) === 0, 'sem prazo não tem atraso');
}

/* =============================================================================
   4b. O "HOJE" DO SISTEMA, NO FUSO DO RIO E NÃO NO DO SERVIDOR

   TODO caso do bloco acima passa `hoje` explicitamente (`H`), e é por isso que
   eles são casos de aritmética de datas e não de fuso. NENHUM deles chama
   `HOJE()`. Medido em 22/09/2026: trocar `America/Sao_Paulo` por `UTC` dentro
   de `HOJE()` deixava `npm test` inteiro verde.

   E o defeito está descrito, em trinta linhas, no comentário da própria
   função — medido com o instante 05/10/2026 21h30 no Rio:

       HOJE() respondia ......... 2026-10-06
       a data real no Rio era ... 2026-10-05
       demanda com prazo para HOJE (05/10):
         situacao()     -> 'atrasada'   (devia ser 'hoje')
         diasDeAtraso() -> 1            (o prazo só vence à meia-noite)
         prazo sugerido (categoria de 3 dias) -> 09/10 em vez de 08/10

   Ou seja: das 21h às 23h59, todo dia, o painel ficava vermelho três horas
   antes da hora. Quem abrisse o app depois do culto de domingo à noite via as
   próprias demandas como atrasadas.

   O RELÓGIO É DE MENTIRA, E ELE PRECISA SER. Esperar dar 21h para medir é um
   teste que passa vinte e uma horas por dia e reprova três — que é a forma
   mais cara possível de não medir nada. `Date` é trocado pelo tempo do caso e
   devolvido no fim, dentro de `finally`: um relógio parado que vaza para os
   blocos seguintes faria este arquivo medir a ordem em que foi escrito.
   ============================================================================= */
{
  const Real = Date;
  /* só o construtor SEM argumento vira mentira. `somaDias` faz
     `new Date(iso + 'T12:00:00Z')` e `carimbo` faz `new Date(t)`: os dois
     precisam continuar sendo o `Date` de verdade, senão o relógio parado
     responderia por eles também e o teste mediria a si mesmo. */
  const congelar = (iso) => {
    const fixo = Real.parse(iso);
    function Mentira(...a) { return a.length ? new Real(...a) : new Real(fixo); }
    Mentira.now = () => fixo;
    Mentira.parse = Real.parse;
    Mentira.UTC = Real.UTC;
    Mentira.prototype = Real.prototype;
    globalThis.Date = Mentira;
  };
  const devolver = () => { globalThis.Date = Real; };

  try {
    /* 05/10/2026, 21h30 no Rio (UTC-03) é 06/10/2026 00h30 em UTC. É o
       instante exato do comentário de `HOJE()`. */
    congelar('2026-10-06T00:30:00Z');
    ok(HOJE() === '2026-10-05',
      'às 21h30 no Rio, HOJE() ainda é o dia 05 (e não o 06 do fuso do servidor)', HOJE());

    /* e as três consequências, cada uma pela função que as sofria. Elas usam
       `HOJE()` como PADRÃO do parâmetro, então chamá-las sem o segundo
       argumento é exatamente como a tela as chama. */
    ok(situacao({ status: 'aberta', prazo: '2026-10-05', parada_dias: 0 }) === 'hoje',
      'a demanda com prazo para hoje não vira "atrasada" às 21h',
      situacao({ status: 'aberta', prazo: '2026-10-05', parada_dias: 0 }));
    ok(diasDeAtraso('2026-10-05') === 0,
      'e ela não ganha um dia de atraso que não existe (o prazo vence à meia-noite)',
      String(diasDeAtraso('2026-10-05')));
    ok(prazoSugerido({ prazo_padrao_dias: 3 }) === '2026-10-08',
      'e o prazo sugerido de uma categoria de 3 dias é 08/10, não 09/10',
      prazoSugerido({ prazo_padrao_dias: 3 }));

    /* a virada de MÊS pelo mesmo caminho: 31/10 às 22h no Rio é 01/11 em UTC,
       e aí o erro não é de um dia, é de mês no rótulo de "Mês a mês". */
    congelar('2026-11-01T01:00:00Z');
    ok(HOJE() === '2026-10-31', 'e a virada de mês também espera a meia-noite do Rio', HOJE());

    /* o outro lado, para o teste não passar com um fuso fixo qualquer
       chumbado: de madrugada no Rio a data é a mesma dos dois lados, e às
       21h de um horário de verão do Norte o Rio continua no mesmo dia. */
    congelar('2026-10-05T13:00:00Z');
    ok(HOJE() === '2026-10-05', 'às 10h da manhã no Rio a data é o dia corrente', HOJE());
    congelar('2026-10-05T02:00:00Z');
    ok(HOJE() === '2026-10-04',
      'e às 23h do dia 4 no Rio ainda é dia 4, mesmo já sendo dia 5 em UTC', HOJE());

    /* e o carimbo de hora, que tem o mesmo fuso pelo mesmo motivo escrito:
       hora que muda conforme o celular de quem olha não confere nada */
    ok(/^05\/10\/2026 às 21:30/.test(carimbo('2026-10-06T00:30:00Z')),
      'o carimbo de hora também fala no fuso do Rio', carimbo('2026-10-06T00:30:00Z'));
  } finally {
    devolver();
  }
  ok(new Date().getTime() > Date.parse('2026-01-01'),
    'e o relógio de verdade voltou para os blocos seguintes');
}

/* =============================================================================
   5. O recado do WhatsApp
   ============================================================================= */
{
  ok(soDigitos('(31) 99999-8888') === '31999998888', 'tira tudo que não é dígito');
  ok(linkZap('(31) 99999-8888', 'oi').startsWith('https://wa.me/5531999998888?text='),
    'põe o 55 quando falta', linkZap('(31) 99999-8888', 'oi'));
  ok(linkZap('5531999998888', 'oi').startsWith('https://wa.me/5531999998888?'),
    'não duplica o 55 quando já tem');
  ok(linkZap('', 'oi') === '', 'sem telefone não inventa link');
  ok(linkZap('123', 'oi') === '', 'telefone curto não vira link');
  ok(linkZap('31999998888', 'a b&c').includes('a%20b%26c'), 'escapa o texto');

  /* 22/09/2026 · o número como o banco guarda (com o 55, pelo COMPRIMENTO,
     igual a `demandas.tel`) e como a pessoa reconhece. O DDD 55 é o caso que
     um teste de prefixo erraria, e por isso está aqui pelo nome. */
  ok(telDoBanco('(21) 99999-0005') === '5521999990005', 'o banco guarda com o 55', telDoBanco('(21) 99999-0005'));
  ok(telDoBanco('5521999990005') === '5521999990005', 'o 55 não dobra');
  ok(telDoBanco('+55 (21) 99999-0005') === telDoBanco('21999990005'), 'escrito de dois jeitos, o mesmo número');
  ok(telDoBanco('55999998888') === '5555999998888', 'DDD 55 com onze dígitos ganha o DDI', telDoBanco('55999998888'));
  ok(telVisivel('5521999990005') === '(21) 99999-0005', 'mostra como a pessoa escreve', telVisivel('5521999990005'));
  ok(telVisivel('552133334444') === '(21) 3333-4444', 'fixo de dez dígitos também', telVisivel('552133334444'));
  ok(telVisivel('5555999998888') === '(55) 99999-8888', 'e o DDD 55 continua sendo DDD', telVisivel('5555999998888'));
  ok(telVisivel(null) === '' && telVisivel('') === '', 'sem número, campo vazio');
  /* o sistema é brasileiro, igual ao banco: "+1 415 555 0100" tem onze
     dígitos e seria lido como DDD 14 pelos DOIS lados, o que ao menos é
     coerente. O caso que não se formata é o número incompleto. */
  ok(telVisivel('99999-0005') === '99999-0005', 'número incompleto fica como veio', telVisivel('99999-0005'));

  const d = {
    numero: 7, titulo: 'Arte do culto', status: 'aberta', travada_por: null,
    prioridade: 'alta', solicitante: 'Jovens', responsavel_setor: 'Comunicação',
    prazo: '2026-09-22',
  };
  const t = recado(d, 'https://demandas.exemplo.com/', 'abriu');
  ok(t.includes('#7') && t.includes('Arte do culto'), 'o recado identifica a demanda', t);
  ok(t.includes('https://demandas.exemplo.com/d/7'), 'e leva o link direto, sem barra dobrada', t);
  ok(t.includes('22/09'), 'e diz o prazo', t);
  ok(recado(d, 'https://x.com', 'pronta').includes('reabrir'),
    'o recado de conclusão já diz como pedir revisão');
}

/* =============================================================================
   6. Traduzir o que o banco recusa
   ============================================================================= */
{
  ok(recadoDoErro({ erro: 'NAO_E_SEU_SETOR' }).includes('outro setor'), 'traduz o erro conhecido');
  ok(recadoDoErro({ erro: 'REGRA', regra: 'new row violates check constraint "ck_urgente"' })
      .includes('Urgente'), 'traduz o CHECK do banco pelo nome da restrição');
  ok(recadoDoErro({ erro: 'REGRA', regra: 'check constraint "ck_conclusao"' })
      .includes('o que foi realizado'), 'e a conclusão também');
  ok(!recadoDoErro({ erro: 'REGRA', regra: 'check constraint "ck_inventada"' }).includes('constraint'),
    'restrição desconhecida não vaza jargão do Postgres para a tela',
    recadoDoErro({ erro: 'REGRA', regra: 'check constraint "ck_inventada"' }));
  ok(recadoDoErro(null).length > 0, 'sem erro nenhum ainda diz alguma coisa');
  ok(recadoDoErro({ erro: 'INVENTADO' }).length > 0, 'erro que eu não conheço não deixa a tela muda');

  /* ---- 6b. O VOCABULÁRIO DO OUTRO SISTEMA NÃO ENTRA AQUI ------------------

     A regra do dono, de 21/09/2026: Demandas e Escalas não se encostam. O
     chão de TRANSPORTE é compartilhado de propósito (mesmo Postgres, mesmo
     PostgREST, e `lib/erros.ts` é puro), mas o vocabulário não é: dentro de
     Demandas não existe ministério, escala, voluntário, organizador, posto
     nem culto — existe setor, demanda, categoria e prazo.

     Cada vez que isso vazou, vazou pelo mesmo buraco: um código do Postgres
     sem nome próprio em `PORBANCO` cai em `humano()`, e lá `PORCODIGO` tem
     frase pronta com a palavra do outro sistema. Aconteceu com o 42501
     ("neste MINISTÉRIO") e estava acontecendo com o 23503 ("enquanto houver
     ESCALA ou cadastro ligado a este item").

     Por isso a varredura é sobre a SAÍDA, e sobre a lista inteira: conferir
     um código por vez é como o segundo buraco sobreviveu ao conserto do
     primeiro. `CODIGOS` vem de `Object.keys(PORBANCO)`, então código novo
     entra na varredura sozinho. */
  const VAZAMENTO = /ministério|escala|voluntári|organizador|posto|culto/i;
  ok(CODIGOS.length > 40, 'a lista de códigos conhecidos veio inteira', String(CODIGOS.length));
  /* os códigos que nasceram em 22/09/2026, pelo nome: a varredura acima passa
     a varrer MENOS se um deles for apagado, e varrer menos não reprova nada.
     Código que a tela produz e não traduz vira palavra em MAIÚSCULA na cara
     da pessoa — ou, pior, a frase do outro sistema. */
  for (const c of ['SO_QUEM_PEDIU', 'NAO_ESTA_CONCLUIDA', 'JA_VALIDADA', 'VINCULO_EM_USO',
                   'SEM_CONFIG', 'VAZIO']) {
    ok(CODIGOS.includes(c), `"${c}" tem frase na tela`);
    ok(recadoDoErro({ erro: c }) !== 'Não consegui. Tente de novo.',
      `"${c}" não cai na frase genérica`, recadoDoErro({ erro: c }));
  }
  for (const c of CODIGOS) {
    const nu = recadoDoErro({ erro: c });
    ok(nu.length > 0 && !VAZAMENTO.test(nu), `"${c}" não fala a língua do outro sistema`, nu);
    /* e com `regra`/`codigo` junto, que é como a resposta chega de verdade:
       isto mede a PRECEDÊNCIA de `PORBANCO` sobre `humano()`. Se ela cair,
       todo código conhecido passa a ser traduzido pela tabela das escalas. */
    const cheio = recadoDoErro({ erro: c, regra: 'permission denied for schema demandas', codigo: '42501' });
    ok(!VAZAMENTO.test(cheio), `"${c}" continua no vocabulário daqui mesmo com regra junto`, cheio);
  }

  /* ---- 6c. E PELO CAMINHO DE VERDADE: `rpcCom` -> `recadoDoErro` ----------

     A varredura de cima mede a TABELA. Esta mede a TRADUÇÃO INTEIRA, do erro
     cru do Postgres até a frase na tela, porque é `api.ts` quem decide se um
     código ganha nome próprio ou vira `REDE` — e `REDE` é justamente o que
     cai em `humano()` e pega a frase do outro sistema.

     Sem este bloco, apagar a linha do 42501 ou a do 23503 de `rpcCom` não
     reprovaria nada: a tabela continuaria certa e a tela voltaria a dizer
     "ministério" / "escala". */
  const MENSAGEM = {
    '23505': 'duplicate key value violates unique constraint "demandas_numero_key"',
    '23503': 'update or delete on table "setores" violates foreign key constraint "demandas_setor_responsavel_fkey" on table "demandas"',
    '23514': 'new row for relation "demandas" violates check constraint "ck_prioridade"',
    '42501': 'permission denied for schema demandas',
    '22P02': 'invalid input syntax for type uuid: "amanha"',
    'P0001': 'Essa demanda não existe.',
    'PGRST301': 'JWT expired',
    'PGRST116': 'The result contains 0 rows',
    'XX000': 'internal error',
    '08006': 'connection failure',
  };
  for (const [codigo, message] of Object.entries(MENSAGEM)) {
    const r = await rpcCom({ rpc: async () => ({ data: null, error: { code: codigo, message } }) },
                           'dem_mover', {});
    const texto = recadoDoErro(r, 'gravar');
    ok(!VAZAMENTO.test(texto), `${codigo} chega na tela no vocabulário das Demandas`, texto);
    ok(texto.length > 0, `${codigo} não deixa a tela muda`);
  }

  /* os dois que ganharam nome próprio, pelo nome: um deles é o conserto de
     22/09, o outro é o que já existia e serviu de modelo. */
  const fk = await rpcCom({ rpc: async () => ({ data: null,
    error: { code: '23503', message: MENSAGEM['23503'] } }) }, 'dem_ajustar', {});
  ok(fk.erro === 'VINCULO_EM_USO', 'violação de chave estrangeira tem nome próprio', fk.erro);
  const perm = await rpcCom({ rpc: async () => ({ data: null,
    error: { code: '42501', message: MENSAGEM['42501'] } }) }, 'dem_mover', {});
  ok(perm.erro === 'SEM_PERMISSAO_DB', 'permissão do Postgres tem nome próprio', perm.erro);
  /* e nenhum dos dois queima o link da pessoa: são infraestrutura, não
     "esse token não é de ninguém". O link só existe na mensagem do WhatsApp. */
  ok(!ehRecusaDeIdentidade(fk), 'VINCULO_EM_USO não descarta o link guardado');
  ok(!ehRecusaDeIdentidade(perm), 'SEM_PERMISSAO_DB não descarta o link guardado');

  /* ---- 6d. OS DOIS QUE O PRÓPRIO `api.ts` PRODUZ E NINGUÉM TRADUZIA ------

     `SEM_CONFIG` (app sem as chaves do Supabase) e `VAZIO` (RPC respondendo
     200 com corpo nulo) caíam em "Não consegui. Tente de novo." — que manda a
     pessoa repetir uma coisa que nunca vai funcionar naquele aparelho. */
  for (const c of ['SEM_CONFIG', 'VAZIO']) {
    const t = recadoDoErro({ erro: c });
    ok(t !== 'Não consegui. Tente de novo.', `"${c}" tem frase própria`, t);
    ok(/avise|configuração|servidor/i.test(t), `e "${c}" diz o que fazer em vez de "tente de novo"`, t);
  }
  const sc = await rpcCom(null, 'dem_quem_sou', {});
  ok(recadoDoErro(sc) !== 'Não consegui. Tente de novo.',
    'e pelo caminho de verdade: sem cliente, a frase é a própria', recadoDoErro(sc));
}

/* =============================================================================
   7. Texto
   ============================================================================= */
{
  ok(dataCheia('2026-09-22') === '22/09/2026', 'data cheia');
  ok(dataCheia(null) === '', 'data nula não vira NaN');
  ok(horas(6) === '6 h', 'horas curtas');
  ok(horas(48) === '2,0 dias', 'horas longas viram dias', horas(48));
  ok(horas(null) === '—', 'sem medida ainda escreve alguma coisa');
  ok(dinheiro(4500).includes('4.500'), 'dinheiro em pt-BR', dinheiro(4500));
  ok(dinheiro(null) === '', 'sem orçamento não escreve R$ 0,00');
  ok(rotStatus('execucao') === 'Em execução', 'rótulo de status');
}

/* =============================================================================
   8. O TEXTO DA PESSOA NÃO SE PERDE QUANDO O SERVIDOR RECUSA

   `CaixaDeAcao` fazia `onClick={() => { aoEnviar(t.trim()); setT(''); }}`:
   dispara e limpa, na mesma linha, sem esperar resposta nenhuma. Em QUALQUER
   recusa — concluir, cancelar, reabrir, aprovar, recusar, destravar, travar —
   a pessoa lê o aviso vermelho com a caixa vazia e redigita tudo.

   Isto não dá para testar importando: é componente com `useState`, e este
   repositório não tem renderizador de React. O jeito que a casa já usa está
   em `scripts/demandas-porta-propria.test.mjs`: ARRANCA a função do arquivo e
   a EXECUTA com um mundo de mentira. É o contrário de casar expressão regular
   com a grafia da linha — se alguém reescrever o conserto de outro jeito que
   funcione, passa; se voltar a limpar antes da hora, reprova.
   ============================================================================= */
{
  const { readFileSync } = await import('node:fs');

  /* Contador de chaves, e não expressão regular, porque o corpo tem chaves
     dentro (objetos, blocos) e regex não conta.

     O QUE SE ARRANCA É A EXPRESSÃO INTEIRA, e isso não é detalhe: a primeira
     versão deste bloco procurava `onClick={async () => {` e arrancava só o
     MIOLO. Sabotando o conserto de volta para a forma síncrona, o teste
     reprovava — mas reprovava porque não ACHOU a marca, e não porque mediu o
     comportamento. Teste que depende da grafia da linha que ele mede é o
     defeito que `scripts/_ts.mjs` descreve no próprio cabeçalho, cometido
     aqui dentro. Pegando a função inteira, síncrona ou `async`, quem reprova
     é o comportamento. */
  const bloco = (txt, i) => {
    let n = 0;
    for (let j = i; j < txt.length; j++) {
      if (txt[j] === '{') n++;
      else if (txt[j] === '}') { n--; if (n === 0) return txt.slice(i + 1, j); }
    }
    return null;
  };
  /* o que está entre as chaves de `marca` (que termina em `{`) */
  const depoisDe = (txt, marca, de = 0) => {
    const i = txt.indexOf(marca, de);
    return i < 0 ? null : bloco(txt, i + marca.length - 1);
  };
  /* o corpo de `function nome(...)`, pulando os parênteses da assinatura —
     que têm `{}` dentro, no valor padrão de `dados` */
  const corpoDe = (txt, marca) => {
    let i = txt.indexOf(marca);
    if (i < 0) return null;
    i = txt.indexOf('(', i);
    let n = 0, j = i;
    for (; j < txt.length; j++) {
      if (txt[j] === '(') n++;
      else if (txt[j] === ')') { n--; if (n === 0) break; }
    }
    return bloco(txt, txt.indexOf('{', j));
  };

  /* ---- 8a. a decisão de limpar, dentro da `CaixaDeAcao` ------------------ */
  const ui = readFileSync('components/demandas/Ui.tsx', 'utf8');
  /* âncora no `disabled` do botão: é a única ocorrência, e não depende de
     como o `onClick` está escrito */
  const corpoClique = depoisDe(ui, 'onClick={', ui.indexOf('disabled={salvando'));
  ok(corpoClique !== null, 'achei o clique do botão da CaixaDeAcao para executar');
  const fabricaClique = new Function('aoEnviar', 't', 'setT', `return (${corpoClique});`);

  const roda = async (resposta, texto = '  oi  ') => {
    const visto = { enviou: null, limpou: false };
    await fabricaClique(x => { visto.enviou = x; return resposta; }, texto,
                        () => { visto.limpou = true; })();
    return visto;
  };

  ok((await roda(false)).limpou === false,
    'servidor recusou (false): a caixa NÃO apaga o que a pessoa escreveu');
  ok((await roda(Promise.resolve(false))).limpou === false,
    'e recusa que chega por promessa também segura o texto');
  ok((await roda(Promise.resolve(true))).limpou === true,
    'deu certo: a caixa limpa, senão o próximo comentário nasce sujo');
  ok((await roda(undefined)).limpou === true,
    'quem não responde nada continua limpando, como antes');
  ok((await roda(false)).enviou === 'oi', 'e o texto vai aparado, sem os espaços');

  /* e ela ESPERA: limpar antes de a promessa voltar é o defeito com outra
     cara, porque a recusa chega depois do sumiço do texto. */
  {
    let limpou = false, solta;
    const espera = new Promise(r => { solta = r; });
    const indo = fabricaClique(() => espera, 'texto', () => { limpou = true; })();
    await Promise.resolve();
    ok(limpou === false, 'não limpa enquanto o servidor ainda não respondeu');
    solta(false);
    await indo;
    ok(limpou === false, 'e se a resposta for recusa, não limpa nunca');
  }

  /* ---- 8b. e a outra ponta: `agir`, na ficha, devolvendo `false` --------- */
  const ficha = readFileSync('app/demandas/d/[numero]/page.tsx', 'utf8');
  const corpoAgir = corpoDe(ficha, 'async function agir');
  ok(corpoAgir !== null, 'achei o `agir` da ficha para executar');
  const agir = new Function('acao', 'dados', 'setIndo', 'setErro', 'mover', 'numero',
                            'recadoDoErro', 'setAberto', 'carregar',
    `return (async () => {${corpoAgir}})();`);
  const nada = () => {};
  const recusa = await agir('concluir', {}, nada, nada,
    async () => ({ ok: false, erro: 'ATRASO_PRECISA_MOTIVO' }), 7,
    () => 'qualquer frase', nada, async () => {});
  ok(recusa === false, 'recusa do servidor devolve false, que é o que segura o texto');
  const passou = await agir('concluir', {}, nada, nada,
    async () => ({ ok: true }), 7, () => '', nada, async () => {});
  ok(passou === true, 'e o caminho bom devolve true');

  /* ---- 8c. o comentário interno: a chave que ninguém mandava -------------

     Desde 23/09/2026 a caixa é a peça `Escrever`, no fim do histórico: a
     ficha entrega `aoEnviar={(texto, interno) => agir('comentar', …)}` e o
     clique do botão, dentro da peça, é quem limpa o texto e desmarca "só
     para a equipe" quando o servidor aceitou. São dois pedaços, e os dois
     são executados aqui, encaixados um no outro. */
  const iChamada = ficha.indexOf('<Escrever ');
  ok(iChamada > 0, 'achei a caixa de comentário da ficha');
  const corpoChamada = depoisDe(ficha, 'aoEnviar={', iChamada);
  ok(corpoChamada !== null, 'achei o envio do comentário para executar');
  const chamada = new Function('agir', `return (${corpoChamada});`);
  const iComentario = ficha.indexOf('rot="Escrever alguma coisa"');
  ok(iComentario > 0, 'achei a peça Escrever');
  const corpoClique2 = depoisDe(ficha, 'onClick={', iComentario);
  ok(corpoClique2 !== null, 'achei o clique do botão Comentar para executar');
  const clique = new Function('aoEnviar', 't', 'interno', 'setT', 'setInterno', `return (${corpoClique2});`);
  {
    /* `null` e não `false` de propósito: começar em `false` faz "ninguém
       chamou" parecer "chamou com false", e o teste passa a aprovar a
       ausência do conserto. Medido sabotando: com `false` inicial, apagar o
       `setInterno(false)` da ficha não reprovava nada. */
    let mandou = null, desmarcou = null, limpou = null;
    const enviar = chamada(async (a, d) => { mandou = { a, d }; return true; });
    await clique(enviar, ' combinei com a Monik ', true, x => { limpou = x; }, x => { desmarcou = x; })();
    ok(mandou?.a === 'comentar', 'o comentário é gravado como comentário');
    ok(mandou?.d.interno === true,
      'e a chave `interno` VAI junto: sem ela a coluna do banco é inalcançável',
      JSON.stringify(mandou?.d));
    ok(mandou?.d.texto === 'combinei com a Monik', 'o texto vai aparado');
    ok(limpou === '', 'deu certo: a caixa limpa');
    ok(desmarcou === false,
      'e a caixinha volta para desmarcada, senão o PRÓXIMO comentário some sem ninguém ver',
      String(desmarcou));
  }
  {
    /* recusou: nem grava, nem limpa, nem desmarca — a pessoa tenta de novo
       com o mesmo texto E a mesma marcação */
    let desmarcou = null, limpou = null;
    const enviar = chamada(async () => false);
    await clique(enviar, 'x', true, x => { limpou = x; }, x => { desmarcou = x; })();
    ok(limpou === null, 'recusa do servidor: o texto fica na caixa');
    ok(desmarcou === null, 'e a marcação de interno não se perde na recusa');
  }

  /* ---- 8d. as duas datas de prazo do PDF, na mesma linha -----------------

     O PDF pede "Data desejada para conclusão" (Detalhamento) E "Prazo
     definido" (Acompanhamento), e existe uma coluna só: quando o setor muda o
     prazo, o pedido original só sobrevive como evento no histórico.

     São DOIS pedaços, e os dois precisam ser executados. O primeiro é qual
     evento se lê — tem que ser o PRIMEIRO de tipo `prazo`, porque é o único
     cujo `de` é a data que quem pediu escreveu; qualquer outro é uma data que
     o setor já tinha trocado. Medido sabotando: trocar `find` por pegar o
     último passava calado enquanto só a linha da tabela era testada. */
  const corpoPedido = depoisDe(ficha, 'useMemo(() => {', ficha.indexOf('const prazoPedido'));
  ok(corpoPedido !== null, 'achei a escolha do prazo pedido para executar');
  const qualPrazo = new Function('v', corpoPedido);
  const ev = (de, para) => ({ tipo: 'prazo', de, para });
  ok(qualPrazo({ eventos: [{ tipo: 'abertura' }, ev('2026-09-22', '2026-09-25'),
                            ev('2026-09-25', '2026-09-28')] }) === '2026-09-22',
    'o prazo pedido é o `de` do PRIMEIRO evento de prazo, não o da última troca',
    qualPrazo({ eventos: [{ tipo: 'abertura' }, ev('2026-09-22', '2026-09-25'),
                           ev('2026-09-25', '2026-09-28')] }));
  ok(qualPrazo({ eventos: [{ tipo: 'comentario' }] }) === '',
    'demanda sem troca de prazo não inventa data pedida');
  ok(qualPrazo({ eventos: [ev(null, '2026-09-28')] }) === '',
    'demanda que NASCEU sem prazo também não: o `de` é nulo, e nulo não é pedido');
  ok(qualPrazo(null) === '', 'e a ficha ainda carregando não quebra');

  /* A SEGUNDA LINHA DO FATO "PRAZO" (desde 23/09/2026 a ficha tem uma faixa
     de fatos, e o prazo é um deles): a data em cima, e embaixo o prazo em
     palavras mais, se for outra, a data que quem pediu tinha pedido. A parte
     que decide é `pedidoPara`, em regras.ts, executada aqui; a ficha tem que
     ser quem a chama, senão o teste mede uma função que ninguém usa. */
  const iPrazo = ficha.indexOf('<span>Prazo</span>');
  ok(iPrazo > 0, 'achei o fato do prazo na ficha');
  ok(/pedidoPara\(d\.prazo, prazoPedido\)/.test(ficha.slice(iPrazo, iPrazo + 700)),
    'e o fato chama `pedidoPara(d.prazo, prazoPedido)`, que é o que se executa abaixo');
  ok(pedidoPara('2026-09-28', '2026-09-22') === ' (pedido para 22/09/2026)',
    'prazo trocado mostra o que quem pediu tinha pedido',
    pedidoPara('2026-09-28', '2026-09-22'));
  ok(pedidoPara('2026-09-22', '2026-09-22') === '',
    'prazo que não mudou não ganha parêntese repetindo a mesma data');
  ok(pedidoPara('2026-09-28', '') === '',
    'demanda que nunca teve o prazo mexido também não');
  ok(pedidoPara(null, '2026-09-22') === ' (pedido para 22/09/2026)',
    'e o prazo tirado continua dizendo qual era a data pedida',
    pedidoPara(null, '2026-09-22'));

  /* ---- 8d-bis. "Resolveu, obrigado", que grava direto ---------------------
     Desde 23/09/2026 `validar` é um botão do painel de ação (o primário de
     quem pediu, na demanda concluída), e não mora mais no cartão verde. O
     toque passa por `tocar`: `assumir` e `validar` gravam na hora, o resto
     abre o formulário. Executado, e não lido. */
  const iTocar = ficha.indexOf('const tocar = ');
  ok(iTocar > 0, 'achei o `tocar` da ficha para executar');
  const srcTocar = ficha.slice(iTocar + 'const tocar = '.length, ficha.indexOf(';\n', iTocar))
    .replace('(a: Acao)', '(a)');
  const tocar = new Function('agir', 'setAberto', `return (${srcTocar});`);
  {
    const roda = (a) => {
      let pedida = null, abriu = null;
      tocar(x => { pedida = x; }, x => { abriu = x; })(a);
      return { pedida, abriu };
    };
    ok(roda('validar').pedida === 'validar' && roda('validar').abriu === null,
      '"Resolveu, obrigado" chama `validar` na hora, sem formulário', JSON.stringify(roda('validar')));
    ok(roda('assumir').pedida === 'assumir' && roda('assumir').abriu === null,
      '"Assumir e começar" também grava direto', JSON.stringify(roda('assumir')));
    ok(roda('concluir').pedida === null && roda('concluir').abriu === 'concluir',
      'e "Concluir" abre o formulário em vez de gravar', JSON.stringify(roda('concluir')));
  }
  ok(/case 'validar':\s*return 'Resolveu, obrigado'/.test(ficha),
    'o botão de validar se chama "Resolveu, obrigado"');

  /* ---- 8e. as ações que NÃO viram botão na grade ------------------------- */
  const fora = new Function(`return (${/FORA_DA_GRADE[^=]*=\s*(\[[^\]]*\])/.exec(ficha)[1]});`)();
  ok(fora.includes('comentar') && !fora.includes('validar'),
    'o painel sabe que `comentar` não tem botão nele, e `validar` agora tem', JSON.stringify(fora));
  ok(!fora.includes('desanexar'),
    '`desanexar` saiu da lista junto com a ação: ela não sai mais de acoesDe');
  /* quem pode reabrir vê botão; quem só enxerga a demanda validada cai no
     painel sem ação ("Esta demanda"), que tem frase em vez de botão */
  {
    const so = acoesDe({ status: 'concluida', travada_por: null, aprovacao: null, validada_em: null },
                       { papel: 'solicitante', atende: false, abriu: true, id: 'eu-1' });
    ok(so.filter(a => !fora.includes(a)).length > 0,
      'quem pode reabrir ainda vê botão no painel', JSON.stringify(so));
    ok(so.includes('validar'), 'e quem pediu vê "Resolveu, obrigado" na concluída', JSON.stringify(so));
    const validada = acoesDe({ status: 'concluida', travada_por: null, aprovacao: null,
                               validada_em: '2026-09-22T12:00:00Z' },
                             { papel: 'solicitante', atende: false, abriu: false, id: 'eu-1' });
    ok(validada.filter(a => !fora.includes(a)).length === 0,
      'e quem só enxerga cai no painel sem ação, que tem frase', JSON.stringify(validada));
  }
}

/* =============================================================================
   9. O TETO DE CADA CAIXA, CONTRA A CHECK QUE ELE PROMETE ESPELHAR

   `TETO` e `tetoDe` existem para o contador da caixa dizer a verdade: entre
   2001 e 4000 letras o navegador deixava digitar, o contador dizia que ainda
   sobrava, e o banco devolvia `check_violation` com o texto inteiro perdido.

   Medido em 22/09/2026: NENHUM teste da suíte lia `TETO` nem chamava
   `tetoDe`. Trocar `rejeitar: 2000 - 'Aprovação recusada: '.length` por
   `rejeitar: 4000` ficava verde — e 4000 é o DOBRO do que a coluna aceita.

   COMO ESTE BLOCO SABE O NÚMERO CERTO. Ele não repete 2000 e 4000 à mão: os
   limites saem do SQL da migração 86, que é quem cria as onze restrições
   `ck_tam_*`, e a única coisa escrita aqui é PARA ONDE cada caixa escreve —
   que é afirmação sobre `dem_mover`, não sobre o número. Se a 86 (ou uma
   migração futura) mudar um limite e `regras.ts` não acompanhar, isto reprova
   sozinho.

   O número de `rejeitar` é o mais delicado e é o que a auditoria mediu no
   banco: 1980 letras passam, 1981 devolve `ck_tam_cancelada_motivo`. O texto
   vai para DUAS colunas, e numa delas prefixado com "Aprovação recusada: ",
   que tem 20 letras. Quem manda é a mais apertada das duas.
   `scripts/demandas-banco.test.sql` mede esses 1980/1981 contra o Postgres.
   ============================================================================= */
{
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
  const sql86 = readFileSync(join(raiz,
    'supabase/86-sete-casts-cegos-e-quatro-acoes-que-diziam-ok-sem-fazer-nada.sql'), 'utf8');

  /* os dez tetos de `demandas.demandas` vêm do array que a migração percorre,
     e o de `eventos.texto` da linha própria dele */
  const LIMITE = {};
  const arr = sql86.slice(sql86.indexOf('COLUNAS text[][] := array['));
  for (const m of arr.slice(0, arr.indexOf('];')).matchAll(/\['(\w+)'\s*,\s*'(\d+)'\]/g)) {
    LIMITE[m[1]] = Number(m[2]);
  }
  const mTexto = /add constraint ck_tam_texto\s+check \(texto is null or length\(texto\) <= (\d+)\)/
    .exec(sql86);
  if (mTexto) LIMITE.texto = Number(mTexto[1]);

  ok(Object.keys(LIMITE).length === 11,
    'os onze tetos de coluna foram lidos do SQL', JSON.stringify(LIMITE));

  /* E NENHUMA OUTRA MIGRAÇÃO MEXE NESSES NÚMEROS.

     Ler só a 86 seria certo hoje e errado no dia em que a 93 reapertar uma
     coluna. A varredura conta: se um `ck_tam_*` nascer fora da 86, este teste
     reprova pedindo que o leitor acima seja atualizado, em vez de continuar
     lendo o número velho em silêncio. */
  {
    const { readdirSync } = await import('node:fs');
    const foraDa86 = readdirSync(join(raiz, 'supabase'))
      .filter(f => f.endsWith('.sql') && !f.startsWith('86-'))
      .filter(f => /(add|drop)\s+constraint\s+(if exists\s+)?%?I?'?ck_tam_/i
        .test(readFileSync(join(raiz, 'supabase', f), 'utf8')));
    ok(foraDa86.length === 0,
      'os tetos de coluna nascem só na 86, então ler a 86 é ler o limite vivo',
      foraDa86.join(', '));
  }

  /* PARA ONDE CADA CAIXA ESCREVE, lido em `dem_mover` (85:378-402, 92:610).
     Uma caixa pode ter mais de um destino: quem manda é o mais apertado. O
     número que acompanha é o PREFIXO que o servidor gruda antes de gravar. */
  const DESTINO = {
    comentar:   [['texto', 0]],
    concluir:   [['conclusao', 0]],
    destravar:  [['texto', 0]],
    reabrir:    [['texto', 0]],
    travar:     [['travada_nota', 0]],
    cancelar:   [['cancelada_motivo', 0]],
    aprovar:    [['aprovacao_nota', 0]],
    /* o texto vai inteiro para `aprovacao_nota` E, prefixado, para
       `cancelada_motivo`: `cancelada_motivo = 'Aprovação recusada: ' || v_txt` */
    rejeitar:   [['aprovacao_nota', 0], ['cancelada_motivo', 'Aprovação recusada: '.length]],
    prioridade: [['impacto', 0]],
    atraso:     [['atraso_motivo', 0]],
    sem_prazo:  [['sem_prazo_porque', 0]],
  };

  ok(Object.keys(TETO).length === Object.keys(DESTINO).length,
    'toda caixa do mapa TETO tem destino conhecido neste teste',
    `TETO: ${Object.keys(TETO).join(',')} | destinos: ${Object.keys(DESTINO).join(',')}`);

  for (const [acao, destinos] of Object.entries(DESTINO)) {
    ok(Object.prototype.hasOwnProperty.call(TETO, acao),
      `"${acao}" continua no mapa TETO`);
    const cabe = Math.min(...destinos.map(([col, pre]) => LIMITE[col] - pre));
    ok(Number.isFinite(cabe),
      `os destinos de "${acao}" existem no catálogo de CHECKs`, JSON.stringify(destinos));
    ok(TETO[acao] === cabe,
      `o teto de "${acao}" é o que a CHECK aceita`,
      `mapa diz ${TETO[acao]}, a coluna aceita ${cabe} ` +
      `(${destinos.map(([c, p]) => `${c}=${LIMITE[c]}${p ? `-${p} de prefixo` : ''}`).join(' e ')})`);
    /* e pela função, que é o que a tela chama de verdade */
    ok(tetoDe(acao) === cabe, `e tetoDe("${acao}") devolve o mesmo`, String(tetoDe(acao)));
  }

  /* o número que a auditoria mediu no banco, escrito por extenso: se alguém
     mudar o prefixo do servidor sem mexer aqui, os dois lados reprovam */
  ok(TETO.rejeitar === 1980, 'e "rejeitar" é 1980, que é o que o banco aceita',
    String(TETO.rejeitar));

  /* o padrão de quem não está no mapa: 4000 é o teto das colunas de texto
     longo, e devolver `undefined` faria o contador da caixa sumir */
  ok(tetoDe('uma_acao_que_nao_existe') === 4000,
    'ação sem teto próprio cai no padrão de 4000, e não em undefined',
    String(tetoDe('uma_acao_que_nao_existe')));
  /* e nenhum teto do mapa é maior que o padrão: se fosse, o contador
     prometeria mais do que a coluna mais folgada aceita */
  for (const [acao, n] of Object.entries(TETO)) {
    ok(n > 0 && n <= 4000, `o teto de "${acao}" cabe em alguma coluna`, String(n));
  }
}

/* 1d. MIGRAÇÃO 94: O ESPELHO OBEDECE AO QUE O SERVIDOR DIZ POR DEMANDA.

   Com escopo de gestor, líder de ministério e participante, o nome do papel
   deixou de responder "pode ou não pode". `dem_ver` passou a mandar `pede`,
   `participa`, `aprova` e `gere`, e `acoesDe` usa esses quando vêm. Sem eles
   (banco na 93), a regra antiga continua byte a byte, e é isso que a matriz
   de 4704 acima mede. Aqui, os casos que só existem com os quatro: */
{
  const aberta = { status: 'aberta', travada_por: null, aprovacao: null };
  const pronta = { status: 'concluida', travada_por: null, aprovacao: null, validada_em: null };
  const esperando = { status: 'travada', travada_por: 'aprovacao', aprovacao: 'pendente', falta_aprovacao: true };
  const pergunta = { status: 'travada', travada_por: 'informacao', aprovacao: null };

  /* o líder do ministério que pediu: fala por quem pediu, sem ter aberto */
  const lider = { papel: 'lider', atende: false, abriu: false, pede: true, participa: false, aprova: false, gere: false };
  ok(acoesDe(pronta, lider).includes('validar'), 'o líder confirma a entrega do que o ministério pediu');
  ok(acoesDe(pronta, lider).includes('reabrir'), 'e reabre o que não resolveu');
  ok(acoesDe(pergunta, lider).includes('destravar'), 'e responde a pergunta feita ao ministério');
  ok(acoesDe(aberta, lider).includes('cancelar'), 'e cancela o pedido do ministério');
  ok(!acoesDe(aberta, lider).includes('assumir'), 'mas não atende nada');

  /* quem foi incluído: vê, conversa, junta documento; não decide */
  const incluido = { papel: 'solicitante', atende: false, abriu: false, pede: false, participa: true, aprova: false, gere: false };
  const dele = acoesDe(aberta, incluido);
  ok(dele.includes('comentar') && dele.includes('anexar'), 'o participante comenta e anexa', dele.join(','));
  ok(!dele.includes('cancelar') && !dele.includes('redirecionar') && !dele.includes('assumir'),
    'e não cancela, não redireciona, não assume', dele.join(','));
  ok(!acoesDe(pronta, incluido).includes('validar') && !acoesDe(pronta, incluido).includes('reabrir'),
    'nem confirma nem reabre: isso é de quem pediu');

  /* o gestor de OUTRO setor: é `gestor` e não aprova, não redistribui */
  const deFora = { papel: 'gestor', atende: false, abriu: false, pede: false, participa: false, aprova: false, gere: false };
  const fora = acoesDe(esperando, deFora);
  ok(!fora.includes('aprovar') && !fora.includes('rejeitar'), 'gestor fora do escopo não aprova', fora.join(','));
  ok(!acoesDe(aberta, deFora).includes('redirecionar'), 'nem manda para outro setor');
  ok(!acoesDe(aberta, deFora).includes('cancelar'), 'nem cancela');

  /* o gestor do setor que atende: aprova, e só porque o servidor disse */
  const doSetor = { papel: 'gestor', atende: true, abriu: false, pede: false, participa: false, aprova: true, gere: true };
  ok(acoesDe(esperando, doSetor).includes('aprovar'), 'gestor com escopo no setor que atende aprova');
  ok(acoesDe(aberta, doSetor).includes('redirecionar'), 'e redistribui');

  /* e a regra antiga, quando o servidor não manda os quatro */
  const velho = { papel: 'gestor', atende: false, abriu: false };
  ok(acoesDe(esperando, velho).includes('aprovar'), 'sem as respostas da 94, gestor aprova como antes');
}

/* ============ migração 95: de que site vem o anexo =====================
   A tela avisa com a MESMA regra do banco. O que se mede aqui é que ela lê o
   site que o NAVEGADOR visitaria (a barra invertida, o ponto final, as
   maiúsculas) e que a fronteira do subdomínio é o ponto. */
{
  const lista = ['drive.google.com', 'dropbox.com', 'a.co'];
  const ligada = { restrito: true, sites: lista };
  ok(siteDoLink('https://evil.org\\.drive.google.com/x') === 'evil.org',
    'a barra invertida acaba o site, como no navegador', siteDoLink('https://evil.org\\.drive.google.com/x'));
  ok(siteDoLink('https://DRIVE.Google.com./file') === 'drive.google.com', 'maiúsculas e ponto final viram o mesmo site');
  ok(siteDoLink('http://drive.google.com/x') === null, 'http sem s não é link de anexo');
  ok(siteDoLink('drive.google.com/x') === null && siteDoLink('') === null && siteDoLink(null) === null,
    'texto sem https:// não é link');
  ok(siteNaLista('abc.drive.google.com', lista), 'subdomínio de site da lista passa');
  ok(!siteNaLista('evildrive.google.com', lista), 'evildrive.google.com NÃO é drive.google.com');
  ok(!siteNaLista('drive.google.com.evil.org', lista), 'site que só começa com um da lista não passa');
  ok(!siteNaLista('pa.co', lista), '"pa.co" não é subdomínio de "a.co"');
  ok(siteRecusado('https://drive.google.com/file/d/1', ligada) === null, 'site da lista: pode');
  ok(siteRecusado('https://evil.org\\.drive.google.com/x', ligada) === 'evil.org',
    'a barra invertida não esconde site de fora');
  ok(siteRecusado('https://golpe.example/x.pdf', { restrito: false, sites: lista }) === null,
    'lista desligada: a tela não recusa nada');
  ok(siteRecusado('https://golpe.example/x.pdf', undefined) === null, 'banco anterior à 95: a tela não inventa regra');
  ok(siteRecusado('nao e link', ligada) === null, 'link torto tem recado próprio, não o de site');
  ok(nomesDosSites(['drive.google.com', '1drv.ms', 'onedrive.live.com', 'x.example']).join('|')
     === 'Google Drive|OneDrive|x.example', 'o encurtador leva o nome do serviço, sem repetir',
     nomesDosSites(['drive.google.com', '1drv.ms', 'onedrive.live.com', 'x.example']).join('|'));
  const dica = dicaDeAnexo({ restrito: true, sites: ['canva.com', 'dropbox.com', 'drive.google.com', 'icloud.com', 'onedrive.live.com', 'youtube.com'] });
  ok(dica === 'Aceita links de Google Drive, Dropbox, OneDrive, iCloud e mais 2.', 'a dica põe os quatro de arquivo na frente', dica);
  ok(dicaDeAnexo({ restrito: true, sites: [] }).includes('nenhum site'), 'lista ligada e vazia diz que nada entra');
  ok(!/Aceita/.test(dicaDeAnexo({ restrito: false, sites: lista })), 'lista desligada não promete lista');
  ok(recadoDoErro({ ok: false, erro: 'SITE_NAO_PERMITIDO', site: 'golpe.example' }) === recadoDeSite('golpe.example'),
    'a recusa do banco diz QUAL site');
  ok(/^Esse site não é aceito como anexo/.test(recadoDoErro({ ok: false, erro: 'SITE_NAO_PERMITIDO' })),
    'sem o site, a frase geral', recadoDoErro({ ok: false, erro: 'SITE_NAO_PERMITIDO' }));
  ok(/Exemplo: drive.google.com/.test(recadoDoErro({ ok: false, erro: 'SITE_INVALIDO' })), 'SITE_INVALIDO tem frase');
  ok(/endereço exato/.test(recadoDoErro({ ok: false, erro: 'SITE_ABERTO' })), 'SITE_ABERTO tem frase');
  ok(!/—/.test(recadoDeSite('x.example') + recadoDoErro({ ok: false, erro: 'SITE_INVALIDO' })
              + recadoDoErro({ ok: false, erro: 'SITE_ABERTO' })), 'sem travessão nas frases novas');
}

/* =============================================================================
   O LINK DE CADASTRO DE CADA SETOR (23/09/2026)

   Os treze setores de produção, pelo nome que o banco devolve. A primeira
   palavra de cada um tem que achar um setor só; é o que vai no link do grupo
   de cada setor na comunidade do WhatsApp.
   ============================================================================= */
{
  const NOMES = ['Comunicação', 'Compras e suprimentos', 'Manutenção e infraestrutura',
    'Tecnologia e audiovisual', 'Eventos e logística', 'Administrativo e financeiro',
    'Pastoral', 'Louvor', 'Mídia', 'Connect', 'Jovens', 'Kids', 'Secretaria'];
  const S = NOMES.map((nome, i) => ({ id: `0000000${i}-aaaa-4bbb-8ccc-00000000000${i}`.slice(0, 36), nome, atende: i < 6 }));
  ok(chaveDoSetor('Manutenção e infraestrutura') === 'manutencao-e-infraestrutura', 'a chave tira acento e junta com hífen',
    chaveDoSetor('Manutenção e infraestrutura'));
  for (const s of S) {
    const primeira = chaveDoSetor(s.nome).split('-')[0];
    ok(setorDoLink(S, primeira) === s, `"${primeira}" acha ${s.nome}, e só ele`, String(setorDoLink(S, primeira)?.nome));
  }
  ok(setorDoLink(S, 'tecnologia-e-audiovisual')?.nome === 'Tecnologia e audiovisual', 'a chave inteira também acha');
  ok(setorDoLink(S, 'Mídia')?.nome === 'Mídia', 'com acento e maiúscula também');
  ok(setorDoLink(S, S[3].id) === S[3], 'o id do setor também acha');
  ok(setorDoLink(S, 'e') === null, 'pedaço que não é começo de palavra não acha nada');
  ok(setorDoLink(S, 'painel') === null, 'setor que não existe não acha nada');
  ok(setorDoLink(S, '') === null && setorDoLink(S, undefined) === null, 'link sem setor não escolhe nada');
  const dois = [{ id: 'a', nome: 'Kids manhã' }, { id: 'b', nome: 'Kids noite' }];
  ok(setorDoLink(dois, 'kids') === null, 'dois setores que casam é nenhum: o link não escolhe por sorte');
  ok(setorDoLink([...dois, { id: 'c', nome: 'Kids' }], 'kids')?.id === 'c', 'o nome exato ganha dos que só começam igual');

  ok(JSON.stringify(pedidoDoLink('?equipe=Comunicação')) === '{"equipe":"comunicacao"}', 'o link de equipe chega limpo',
    JSON.stringify(pedidoDoLink('?equipe=Comunicação')));
  ok(JSON.stringify(pedidoDoLink('?setor=louvor&x=1')) === '{"setor":"louvor"}', 'só as duas chaves conhecidas',
    JSON.stringify(pedidoDoLink('?setor=louvor&x=1')));
  ok(JSON.stringify(pedidoDoLink('?equipe=kids&setor=louvor')) === '{"equipe":"kids"}', 'equipe manda quando vêm as duas');
  ok(!/[./%]/.test(buscaDoLink(pedidoDoLink('?setor=..%2F..%2Fpainel'))),
    'nada de barra, ponto ou escape sobrevive no que viaja no link do e-mail',
    buscaDoLink(pedidoDoLink('?setor=..%2F..%2Fpainel')));
  ok(JSON.stringify(pedidoDoLink('?equipe=' + 'x'.repeat(61))) === '{}', 'chave maior que 60 é descartada');
  ok(buscaDoLink({}) === '' && buscaDoLink({ equipe: 'compras' }) === '?equipe=compras'
     && buscaDoLink({ setor: 'kids' }) === '?setor=kids', 'o que viaja no link do e-mail');
}

if (falhas) { console.log(`regras: ${falhas} falha(s) em ${feitas}`); process.exit(1); }
console.log(`regras: ${feitas}/${feitas} ok`);
