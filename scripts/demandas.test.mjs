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
  somaDias, linkZap, soDigitos, recadoDoErro, recado, diasDeAtraso,
  horas, dinheiro, dataCheia, rotStatus,
} from '../lib/demandas/regras.ts';

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
/* AS TRÊS DIVERGÊNCIAS QUE SÃO DE PROPÓSITO — 20/09/2026.

   Rodando o espelho nos dois sentidos pela primeira vez, apareceram 118
   combinações em que o servidor aceita e a tela não oferece. Todas caem em
   três ações, e as três são decisão, não esquecimento. Ficam escritas aqui,
   uma a uma, para que QUALQUER divergência nova reprove — que é o ponto.

   Deixar o teste exigir zero seria mentir do outro lado: ele passaria a
   reprovar por três escolhas conscientes, alguém relaxaria o teste, e aí nada
   mais seria pego. */
const COMBINADAS = [
  {
    acao: 'travar',
    /* 72 casos. A demanda JÁ está travada. O servidor aceita re-travar (é
       idempotente); a tela esconde porque oferecer "travar" no que está
       travado é oferecer um botão que não muda nada. */
    quando: (d) => d.status === 'travada',
  },
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
  const pendente = d.aprovacao === 'pendente';

  // guarda do topo: fechada só aceita comentar, anexar, desanexar e reabrir
  if (fechada && !['comentar', 'anexar', 'desanexar', 'reabrir'].includes(acao)) return false;

  switch (acao) {
    case 'comentar':    return true;                                   // basta pode_ver
    /* 85 · ERA `return true`, ou seja, todo mundo do setor. Medido: uma
       solicitante rasa pregou um "boleto atualizado.pdf" numa compra alheia.
       O servidor exige o mesmo par que `destravar` já exigia. */
    case 'anexar':
    case 'desanexar':   return eu.atende || eu.abriu;
    /* 86 · a guarda de dono. `!d.responsavel` no modelo é o que o servidor
       faz com `d.responsavel_id is not null and <> m.id`. */
    case 'assumir':     return eu.atende && !pendente && !d.responsavel;
    case 'travar':      return eu.atende;
    case 'destravar':   return (eu.atende || eu.abriu) && d.status === 'travada'
                             && !(d.travada_por === 'aprovacao' && pendente);
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
    default:            return false;
  }
}

{
  const PAPEIS = ['solicitante', 'responsavel', 'gestor', 'admin'];
  const STATUS = ['aberta', 'execucao', 'travada', 'concluida', 'cancelada'];
  const TRAVAS = [null, 'informacao', 'aprovacao', 'terceiros'];
  const APROV = [null, 'pendente', 'aprovada', 'rejeitada'];
  const TODAS = ['assumir', 'travar', 'destravar', 'aprovar', 'rejeitar', 'prazo',
    'prioridade', 'redirecionar', 'concluir', 'cancelar', 'reabrir', 'comentar',
    'anexar', 'desanexar'];

  let casos = 0, oferecidasDemais = 0, escondidas = 0;
  const exemplos = [];
  for (const papel of PAPEIS)
    for (const atende of [false, true])
      for (const abriu of [false, true])
        for (const status of STATUS)
          for (const travada_por of TRAVAS)
            for (const aprovacao of APROV) {
              if (status !== 'travada' && travada_por !== null) continue;   // estado impossível
              if (status === 'travada' && travada_por === null) continue;
              if (papel === 'solicitante' && atende) continue;              // solicitante não atende
              const d = { status, travada_por, aprovacao, responsavel: null };
              const eu = { papel, atende, abriu };
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
            }
  /* 392 = 4 papéis x atende x abriu x os estados possíveis, tirando os
     impossíveis (travada sem motivo, motivo sem travada, solicitante que
     atende). O número está fixo de propósito: se ele mudar, alguém mexeu na
     matriz e tem que olhar por quê. */
  ok(casos === 392, 'a matriz cobre a combinação inteira', 'casos=' + casos);
  ok(oferecidasDemais === 0, 'nenhum botão oferecido que o servidor recusa', 'sobras=' + oferecidasDemais);
  if (escondidas) exemplos.forEach(e => console.log('  botão que o servidor aceita e a tela esconde:', e));
  ok(escondidas === 0, 'nenhum botão escondido que o servidor aceitaria, fora os três combinados',
     'faltas=' + escondidas);

  /* e as três combinadas TÊM que continuar acontecendo: se alguma sumir, ou o
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

/* =============================================================================
   2. Os 11 status do PDF continuam existindo como leitura
   ============================================================================= */
{
  const casos = [
    [{ status: 'aberta', responsavel: null }, 'Aberta'],
    [{ status: 'aberta', responsavel: 'Monik' }, 'Em triagem'],
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
  /* "Rascunho" é o único dos onze que não vira leitura de nada: no documento
     ele é "ainda não enviada", e aqui uma demanda só existe depois de enviada.
     Está anotado para ninguém procurar. */
  ok(vistos.size === 10, 'dez dos onze nomes do PDF são alcançáveis', String(vistos.size));
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

if (falhas) { console.log(`regras: ${falhas} falha(s) em ${feitas}`); process.exit(1); }
console.log(`regras: ${feitas}/${feitas} ok`);
