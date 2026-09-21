/* =============================================================================
   UM DIA COM DUAS LINHAS EM `cultos` — 21/09/2026, migração 82b

   `ux_cultos_data_regular` é único só `where evento is null`, então uma data
   pode ter a linha REGULAR e o EVENTO desta equipe. O banco chaveia escalação
   por culto (`unique (culto_id, funcao_id)`); `montarEstado` chaveia por data
   e nome de posto. Duas escalações do mesmo posto viravam UM slot, e vencia a
   última linha do array — que muda sozinha, porque `escalacoes` era a única
   leitura da carga sem `.order()` e o Postgres devolve na ordem do heap.

   Medido em 21/09, com a forma exata da consulta:
     1a leitura ............ evento (Bianca), depois regular (Alexandre)
     o líder marca "furou" na linha regular
     a MESMA consulta ...... regular (Alexandre), depois evento (Bianca)

   Para a líder: o posto mostra Ana, ela mexe em qualquer coisa, recarrega, e
   o posto mostra Bruno — sem ninguém ter trocado nada.
   ============================================================================= */
import { strict as assert } from 'node:assert'
import { montarEstado } from '../lib/ponte.ts'

let ok = 0
const caso = (nome, fn) => { fn(); ok++; console.log('  ok ' + nome) }

const DIA = '2026-10-04'
const base = (escalacoes, plantoes = [], recados = []) => ({
  equipe: 'Louvor',
  config: { dados: {} },
  funcoes: [{ id: 'f1', nome: 'VOZ', simultanea: true, ordem: 1, ativa: true, tipos: null }],
  voluntarios: [
    { id: 'v1', nome: 'Ana', telefone: '1', ativo: true, limite_mes: 2, token: 'a', equipe_id: 'e1', conferido: true },
    { id: 'v2', nome: 'Bruno', telefone: '2', ativo: true, limite_mes: 2, token: 'b', equipe_id: 'e1', conferido: true },
  ],
  habilidades: [], cultos: [
    { id: 'c-regular', data: DIA, evento: null, inicio: null, equipe_id: null },
    { id: 'c-evento', data: DIA, evento: 'Ensaio geral', inicio: '19:00', equipe_id: 'e1' },
  ],
  escalacoes, plantoes, recados, indisponibilidades: [], disponibilidade: [],
})
const esc = (culto_id, vid) => ({ culto_id, funcao_id: 'f1', voluntario_id: vid, status: 'confirmado', fixo: false })

caso('as duas ordens de leitura dao o MESMO slot', () => {
  const a = montarEstado(base([esc('c-regular', 'v1'), esc('c-evento', 'v2')]))
  const b = montarEstado(base([esc('c-evento', 'v2'), esc('c-regular', 'v1')]))
  assert.equal(a.escalas[DIA].slots['VOZ'].vid, b.escalas[DIA].slots['VOZ'].vid,
    'a ordem das linhas nao pode mais decidir quem aparece no posto')
})

caso('quem ganha e a linha que `cultoId` aponta: o evento da propria equipe', () => {
  const S = montarEstado(base([esc('c-regular', 'v1'), esc('c-evento', 'v2')]))
  assert.equal(S.escalas[DIA].cultoId, 'c-evento', 'a regra de `idDoCulto`, que ja existia')
  assert.equal(S.escalas[DIA].slots['VOZ'].vid, 'v2',
    'e o slot vem da MESMA linha onde `salvar_dia` grava — senao a tela escreve num id e grava em outro')
})

caso('sem evento, uma linha so: nada muda', () => {
  const l = base([esc('c-regular', 'v1')])
  l.cultos = [{ id: 'c-regular', data: DIA, evento: null, inicio: null, equipe_id: null }]
  const S = montarEstado(l)
  assert.equal(S.escalas[DIA].slots['VOZ'].vid, 'v1')
})

caso('plantao vira CONJUNTO: a mesma pessoa nas duas linhas entra uma vez', () => {
  /* `plantoes` tem `primary key (culto_id, voluntario_id)`. Duplicado aqui
     chegava ao INSERT e derrubava o "salvar o dia" com 23505 — que
     `aviseHumano` traduz como "Isso ja esta cadastrado. Confira se a pessoa
     nao esta na lista com outro nome", falando de cadastro de pessoa. */
  const S = montarEstado(base([], [
    { culto_id: 'c-regular', voluntario_id: 'v2' },
    { culto_id: 'c-evento', voluntario_id: 'v2' },
  ]))
  assert.deepEqual(S.escalas[DIA].plantao, ['v2'], 'uma vez, nao duas')
})

caso('plantao com pessoas diferentes nas duas linhas guarda as duas', () => {
  const S = montarEstado(base([], [
    { culto_id: 'c-regular', voluntario_id: 'v1' },
    { culto_id: 'c-evento', voluntario_id: 'v2' },
  ]))
  assert.deepEqual([...S.escalas[DIA].plantao].sort(), ['v1', 'v2'],
    'dedupe e por PESSOA, nao um corte cego')
})

caso('o recado do dia tambem nao depende da ordem', () => {
  const a = montarEstado(base([], [], [
    { culto_id: 'c-regular', equipe_id: 'e1', obs: 'RECADO DO DOMINGO' },
    { culto_id: 'c-evento', equipe_id: 'e1', obs: 'RECADO DO EVENTO' },
  ]))
  const b = montarEstado(base([], [], [
    { culto_id: 'c-evento', equipe_id: 'e1', obs: 'RECADO DO EVENTO' },
    { culto_id: 'c-regular', equipe_id: 'e1', obs: 'RECADO DO DOMINGO' },
  ]))
  assert.equal(a.escalas[DIA].obs, b.escalas[DIA].obs, 'mesma resposta nas duas ordens')
  assert.equal(a.escalas[DIA].obs, 'RECADO DO EVENTO', 'e vem da linha que `cultoId` aponta')
})

caso('duas linhas SEM evento (legado): o desempate e estavel, nao cara ou coroa', () => {
  /* nao devia existir — `ux_cultos_data_regular` impede — mas se existir, a
     resposta tem que ser a MESMA nas duas leituras */
  const comDuasRegulares = (ordem) => {
    const l = base(ordem)
    l.cultos = [
      { id: 'c-aaa', data: DIA, evento: null, inicio: null, equipe_id: null },
      { id: 'c-bbb', data: DIA, evento: null, inicio: null, equipe_id: null },
    ]
    return montarEstado(l)
  }
  const a = comDuasRegulares([esc('c-aaa', 'v1'), esc('c-bbb', 'v2')])
  const b = comDuasRegulares([esc('c-bbb', 'v2'), esc('c-aaa', 'v1')])
  assert.equal(a.escalas[DIA].slots['VOZ'].vid, b.escalas[DIA].slots['VOZ'].vid)
})

console.log(`\ndia-com-duas-linhas: ${ok}/${ok} casos.`)
