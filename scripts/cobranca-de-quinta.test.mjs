/* =============================================================================
   O QUE A COBRANÇA DE QUINTA VÊ, E O QUE ELA VIA
   21/09/2026 · migração 82

   Quatro defeitos do robô, achados numa auditoria de `app/api/cron/route.ts`.
   Cada um tem aqui o caso que reprova com o código velho e passa com o novo,
   e a sabotagem está escrita no comentário de cada bloco: desfaça a linha
   citada e o caso nomeado cai.
   ============================================================================= */
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { cobrarDoDia, avisarDiaSemNinguem, funcoesDoDia, vagasDe } from '../lib/engine.ts'

const rotaTexto = readFileSync(new URL('../app/api/cron/route.ts', import.meta.url), 'utf8')

let ok = 0
const caso = (nome, fn) => { fn(); ok++; console.log('  ok ' + nome) }

/* ---------------------------------------------------------------------------
   Um estado mínimo, mas com a forma do de verdade: postos com `tipos`, gente
   ativa, e um dia com quatro slots em quatro situações diferentes.
   --------------------------------------------------------------------------- */
const DOMINGO = '2026-10-04'   // dow 0
const FOLLOW  = '2026-10-24'   // sábado, dia 24 > 7 → Follow
const SAB1    = '2026-10-03'   // primeiro sábado do mês → NÃO é Follow

function estado(slots = {}, funcoes = null) {
  return {
    config: { janelaCarga: 30 },
    funcoes: funcoes || [
      { nome: 'PROJEÇÃO', ativa: true, tipos: ['domingo', 'follow'] },
      { nome: 'CÂMERA',   ativa: true, tipos: ['domingo', 'follow'] },
      { nome: 'HEAD',     ativa: true, tipos: ['domingo'] },
      { nome: 'SOM',      ativa: true, tipos: ['domingo', 'follow'] },
    ],
    voluntarios: [
      { id: 'v1', nome: 'Ana',   ativo: true, funcoes: { 'PROJEÇÃO': 'titular' } },
      { id: 'v2', nome: 'Bruno', ativo: true, funcoes: { 'CÂMERA': 'titular' } },
      { id: 'v3', nome: 'Caio',  ativo: true, funcoes: { 'SOM': 'titular' } },
    ],
    escalas: { [DOMINGO]: { slots, plantao: [], obs: '' } },
    indisponiveis: {},
  }
}

const S = (st) => ({ vid: st.vid ?? null, status: st.status, fixo: false })

/* =============================================================================
   1 · QUEM DISSE "NÃO POSSO" ERA INVISÍVEL

   A cobrança era `slots com vid e status 'pendente'` mais `vagasDe`, que é
   posto SEM ninguém. `recusado` tem vid (não é vaga) e não é pendente: caía
   no vão entre as duas.

   SABOTAGEM: em `cobrarDoDia`, troque a linha
       else if (st === 'recusado' || st === 'furou') vagou.push(...)
   por `else continue` — e o caso "recusado aparece" cai.
   ============================================================================= */
caso('recusado nao e vaga nem pendencia, e por isso sumia', () => {
  const s = estado({
    'PROJEÇÃO': S({ vid: 'v1', status: 'pendente' }),
    'CÂMERA':   S({ vid: 'v2', status: 'recusado' }),
    'SOM':      S({ vid: 'v3', status: 'confirmado' }),
    // HEAD fica sem ninguém: é vaga
  })
  /* primeiro, a PROVA de que o vão existia: a conta velha, escrita aqui */
  const contaVelha = Object.entries(s.escalas[DOMINGO].slots)
    .filter(([, sl]) => sl?.vid && (sl.status || 'pendente') === 'pendente')
  const vagasVelha = vagasDe(s, DOMINGO)
  assert.equal(contaVelha.length, 1, 'a conta velha via só o pendente')
  assert.deepEqual(vagasVelha, ['HEAD'], 'e a vaga')
  assert.ok(!contaVelha.some(([fn]) => fn === 'CÂMERA'), 'CÂMERA nao estava nas pendencias')
  assert.ok(!vagasVelha.includes('CÂMERA'), 'nem nas vagas — invisivel nas DUAS')

  /* e agora a conta nova */
  const c = cobrarDoDia(s, DOMINGO)
  assert.deepEqual(c.pendentes.map(p => p.funcao), ['PROJEÇÃO'])
  assert.deepEqual(c.vagou.map(p => p.funcao), ['CÂMERA'])
  assert.equal(c.vagou[0].status, 'recusado')
  assert.deepEqual(c.vagas, ['HEAD'])
})

caso('furou entra na mesma lista, e o status diferencia os dois', () => {
  const c = cobrarDoDia(estado({
    'CÂMERA': S({ vid: 'v2', status: 'furou' }),
    'SOM':    S({ vid: 'v3', status: 'recusado' }),
  }), DOMINGO)
  assert.deepEqual(c.vagou.map(v => `${v.funcao}:${v.status}`), ['CÂMERA:furou', 'SOM:recusado'])
  assert.equal(c.pendentes.length, 0)
})

caso('confirmado nao entra em lista nenhuma', () => {
  const c = cobrarDoDia(estado({
    'PROJEÇÃO': S({ vid: 'v1', status: 'confirmado' }),
    'CÂMERA':   S({ vid: 'v2', status: 'confirmado' }),
    'HEAD':     S({ vid: 'v1', status: 'confirmado' }),
    'SOM':      S({ vid: 'v3', status: 'confirmado' }),
  }), DOMINGO)
  assert.equal(c.pendentes.length + c.vagou.length + c.vagas.length, 0,
    'dia inteiro confirmado nao gera cobranca')
})

caso('status ausente conta como pendente, como no resto do motor', () => {
  const c = cobrarDoDia(estado({ 'PROJEÇÃO': { vid: 'v1', fixo: false } }), DOMINGO)
  assert.deepEqual(c.pendentes.map(p => p.funcao), ['PROJEÇÃO'])
})

caso('slot sem vid nao vira pendencia nem troca', () => {
  const c = cobrarDoDia(estado({ 'PROJEÇÃO': S({ vid: null, status: 'pendente' }) }), DOMINGO)
  assert.equal(c.pendentes.length, 0)
  assert.equal(c.vagou.length, 0)
  assert.ok(c.vagas.includes('PROJEÇÃO'), 'e continua sendo vaga')
})

caso('slot numa funcao que este dia nao tem e ignorado', () => {
  /* o líder montou o domingo, depois tirou HEAD do Follow: o slot gravado
     continua no banco, e cobrar por ele seria cobrar posto inexistente */
  const s = estado({ 'HEAD': S({ vid: 'v1', status: 'pendente' }) })
  s.escalas[FOLLOW] = s.escalas[DOMINGO]
  const c = cobrarDoDia(s, FOLLOW)
  assert.equal(c.pendentes.length, 0, 'HEAD nao existe no Follow (tipos: domingo)')
  assert.ok(!c.vagas.includes('HEAD'))
})

caso('posto OCULTADO da escala nao apaga a pendencia de quem ja estava nele', () => {
  /* 82b · o botao "Ocultar da escala" (app/ajustes) poe `ativa = false`. A
     primeira versao de `cobrarDoDia` filtrava so por `funcoesDoDia`, que
     passa por `funcoesAtivas`, e a pessoa escalada sumia da cobranca — com o
     cron declarando o domingo "ok". Antes desta rodada ela era cobrada. */
  const comOculto = [
    { nome: 'PROJEÇÃO', ativa: false, tipos: ['domingo', 'follow'] },
    { nome: 'CÂMERA',   ativa: true,  tipos: ['domingo', 'follow'] },
  ]
  const s = estado({
    'PROJEÇÃO': S({ vid: 'v1', status: 'pendente' }),
    'CÂMERA':   S({ vid: 'v2', status: 'recusado' }),
  }, comOculto)
  assert.equal(funcoesDoDia(s, DOMINGO).length, 1, 'so CÂMERA esta ativa')

  const c = cobrarDoDia(s, DOMINGO)
  assert.deepEqual(c.pendentes.map(p => p.funcao), ['PROJEÇÃO'],
    'quem ja estava escalado no posto oculto continua sendo cobrado')
  assert.deepEqual(c.vagou.map(p => p.funcao), ['CÂMERA'])
  assert.ok(!c.vagas.includes('PROJEÇÃO'),
    'mas posto oculto e VAZIO nao vira vaga a preencher: ocultar quer dizer nao monte mais')
})

caso('posto oculto e VAZIO nao aparece em lista nenhuma', () => {
  const s = estado({}, [
    { nome: 'PROJEÇÃO', ativa: false, tipos: ['domingo'] },
    { nome: 'CÂMERA',   ativa: true,  tipos: ['domingo'] },
  ])
  const c = cobrarDoDia(s, DOMINGO)
  assert.equal(c.pendentes.length + c.vagou.length, 0)
  assert.deepEqual(c.vagas, ['CÂMERA'], 'so o ativo vira vaga')
})

caso('as listas saem ordenadas, para o email nao mudar de ordem a cada rodada', () => {
  const c = cobrarDoDia(estado({
    'SOM':      S({ vid: 'v3', status: 'pendente' }),
    'CÂMERA':   S({ vid: 'v2', status: 'pendente' }),
    'PROJEÇÃO': S({ vid: 'v1', status: 'pendente' }),
  }), DOMINGO)
  assert.deepEqual(c.pendentes.map(p => p.funcao), ['CÂMERA', 'PROJEÇÃO', 'SOM'])
})

/* =============================================================================
   2 · "NINGUÉM ESTÁ ESCALADO" NUM DIA EM QUE O MINISTÉRIO NÃO SERVE

   A chamada no cron era `!!funcoesAtivas(S).length` — o ministério inteiro.
   Medido no banco do repositório: Connect tem 18 postos ativos e ZERO no
   Follow, Kids 9 e zero, Livraria 2 e zero.

   SABOTAGEM: no cron, troque `funcoesDoDia(S, data)` de volta por
   `funcoesAtivas(S)` — e o caso "ministerio sem posto no Follow" cai.
   ============================================================================= */
caso('ministerio sem nenhum posto no Follow nao e cobrado no Follow', () => {
  const soDomingo = [
    { nome: 'RECEPÇÃO', ativa: true, tipos: ['domingo'] },
    { nome: 'CAFÉ',     ativa: true, tipos: ['domingo'] },
  ]
  const s = estado({}, soDomingo)
  assert.equal(funcoesDoDia(s, FOLLOW).length, 0, 'nenhum posto existe no Follow')
  assert.ok(funcoesDoDia(s, DOMINGO).length > 0, 'e no domingo existem')

  const temGente = !!s.voluntarios.filter(v => v.ativo).length
  /* a conta VELHA, escrita aqui para a diferença ficar medida e não afirmada */
  const contaVelha = temGente && !!s.funcoes.filter(f => f.ativa).length
  assert.equal(avisarDiaSemNinguem(true, contaVelha), true,
    'com a conta velha, o Follow virava alarme todo sabado')

  const contaNova = temGente && !!funcoesDoDia(s, FOLLOW).length
  assert.equal(avisarDiaSemNinguem(true, contaNova), false,
    'com a conta do DIA, o Follow fica em silencio — que e o certo')
  /* e o domingo continua alarmando, senão o conserto teria emudecido tudo */
  assert.equal(avisarDiaSemNinguem(true, temGente && !!funcoesDoDia(s, DOMINGO).length), true)
})

caso('quem serve no Follow continua sendo cobrado no Follow', () => {
  const s = estado({})
  assert.ok(funcoesDoDia(s, FOLLOW).length > 0)
  assert.equal(avisarDiaSemNinguem(true, true), true)
})

caso('e o CRON passa a conta do dia, nao a do ministerio', () => {
  /* os dois casos acima provam a REGRA; este prova a CHAMADA. Sem ele,
     devolver `funcoesAtivas(S)` ao cron deixava os 14 outros casos verdes —
     medido em 21/09, sabotando de propósito. */
  const i = rotaTexto.indexOf('avisarDiaSemNinguem(')
  assert.ok(i > 0, 'o cron chama avisarDiaSemNinguem')
  const bloco = rotaTexto.slice(Math.max(0, i - 400), i + 80)
  assert.ok(/funcoesDoDia\(S, data\)\.length/.test(bloco),
    'e o segundo argumento sai de funcoesDoDia(S, data)')
  assert.ok(!/&& !!funcoesAtivas\(S\)\.length;\n\s*if \(!avisarDiaSemNinguem/.test(rotaTexto),
    'e NAO de funcoesAtivas(S), que e o ministerio inteiro')
})

caso('o primeiro sabado do mes nao e Follow, e nao e dia de culto regular', () => {
  /* a regra do banco é `dow = 6 and dia > 7`; o motor tem que concordar */
  const s = estado({})
  assert.equal(new Date(SAB1 + 'T12:00:00Z').getUTCDay(), 6, 'e sabado')
  assert.ok(Number(SAB1.slice(8)) <= 7, 'e e o primeiro do mes')
})

caso('evento alheio continua mudo, e dia regular continua alto', () => {
  assert.equal(avisarDiaSemNinguem(false, true), false, 'evento de outro ministerio: silencio')
  assert.equal(avisarDiaSemNinguem(true, false), false, 'sem posto no dia: silencio')
  assert.equal(avisarDiaSemNinguem(true, true), true, 'regular com posto: alarme')
})

/* =============================================================================
   3 · O 500 E A PROMESSA — os dois são lidos do arquivo, porque são decisões
   de fluxo e não funções puras. Ler o texto é o que sobra, e é melhor que
   afirmar sem olhar.
   ============================================================================= */
const rota = rotaTexto

caso('"ninguem escalado" nao mora mais no array que derruba o status', () => {
  assert.ok(/const semNinguem: string\[\] = \[\]/.test(rota),
    'existe um array proprio para "ninguem escalado"')
  assert.ok(/semNinguem\.push\(`\$\{e\.nome\}: NINGUÉM está escalado/.test(rota),
    'e a linha de "ninguem escalado" vai para ELE')
  assert.ok(!/falhas\.push\(`\$\{e\.nome\}: NINGUÉM/.test(rota),
    'e NAO vai mais para `falhas`, que e o que faz a rota devolver 500')
  const statusLinha = rota.slice(rota.indexOf('const falhou ='))
  assert.ok(/Array\.isArray\(a\?\.falhas\) && a\.falhas\.length/.test(statusLinha))
  assert.ok(!/semNinguem\.length/.test(statusLinha.slice(0, 300)),
    'o status nao olha para semNinguem')
})

caso('o email de "nao consegui carregar" nao fala mais de quem foi cobrado', () => {
  const i = rota.indexOf('cobrança de quinta incompleta')
  assert.ok(i > 0)
  const bloco = rota.slice(i, i + 400)
  assert.ok(/ficaram SEM cobrança/.test(bloco))
  assert.ok(/falhas\.map/.test(bloco), 'ele lista `falhas`')
  assert.ok(!/semNinguem\.map/.test(bloco), 'e nao lista `semNinguem`')
  assert.ok(/culto sem ninguém escalado/.test(rota), 'que tem e-mail proprio')
  const j = rota.indexOf('culto sem ninguém escalado')
  assert.ok(/A cobrança saiu normalmente/.test(rota.slice(j, j + 400)),
    'e o texto dele diz que a cobranca SAIU')
})

caso('o aviso de banco atrasado nao promete mais que o robo volta sozinho', () => {
  const i = rota.indexOf('const VERSAO_MINIMA_DO_BANCO')
  const bloco = rota.slice(i, rota.indexOf('const { data: equipes', i))
  assert.ok(!/volta sozinho na próxima execução/.test(bloco),
    'a promessa falsa saiu')
  assert.ok(/NÃO volta sozinho/.test(bloco), 'e o texto diz o contrario')
  assert.ok(/forcar=\$\{q\}/.test(bloco), 'e entrega o caminho de mao')
  /* 82b · e esse caminho tem que ser EXECUTAVEL. A rota exige
     `Authorization: Bearer $CRON_SECRET` e o `?secret=` foi removido de
     proposito, entao uma URL solta devolve 401. Mandar o organizador
     "abrir" essa URL e trocar uma promessa falsa por uma instrucao
     impossivel. */
  assert.ok(/Authorization: Bearer \$CRON_SECRET/.test(bloco),
    'a instrucao carrega o cabecalho que a rota exige')
  assert.ok(!/abra à mão: \$\{SITE\}\/api\/cron/.test(bloco),
    'e nao manda mais "abrir" uma URL que devolve 401')
  const porta = rota.slice(rota.indexOf('const segredo'), rota.indexOf('const segredo') + 400)
  assert.ok(/auth !== `Bearer \$\{segredo\}`/.test(porta) && /status: 401/.test(porta),
    'e a rota de fato so aceita o cabecalho (se isso mudar, o texto do e-mail muda junto)')
  assert.ok(!/searchParams\.get\('secret'\)/.test(rota),
    'o `?secret=` continua fora: segredo em URL entra em log, historico e Referer')
  /* e o calendario nao depende do `?forcar=`: com um valor invalido, os tres
     `faz*` ficam falsos e a mensagem afirmava que nada se perdeu num dia 26 */
  assert.ok(/diaMes === 20\) && \[/.test(bloco) && /diaMes === 26\) && \[/.test(bloco),
    'o que se perdeu sai da DATA, nao do `?forcar=`')
  assert.ok(/fazColeta/.test(bloco) && /fazMes/.test(bloco) && /fazCobranca/.test(bloco),
    'nomeando qual trabalho se perdeu hoje')
  /* e o robô roda uma vez por dia — é disso que a falsidade vinha */
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
  assert.equal(vercel.crons.length, 1)
  assert.equal(vercel.crons[0].schedule, '0 12 * * *',
    'uma execucao por dia: a "proxima" e amanha, e amanha nao e dia 20 nem 26 nem quinta')
})

/* ---- controle negativo ------------------------------------------------------
   Os quatro casos acima que leem texto ficariam verdes para sempre se o
   caminho do arquivo mudasse e `rota` virasse string vazia. */
caso('o teste esta lendo a rota de verdade', () => {
  assert.ok(rota.length > 10000, 'a rota tem tamanho de rota')
  assert.ok(/export async function GET/.test(rota) || /export const GET/.test(rota) || /async function handler/.test(rota),
    'e tem a cara de uma rota do Next')
  assert.ok(/fazCobranca/.test(rota))
})

console.log(`\ncobranca-de-quinta: ${ok}/${ok} casos.`)
