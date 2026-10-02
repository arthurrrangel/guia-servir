/* =============================================================================
   A TROCA ATRAVESSA A PONTE E A FOLHA DO MÊS — 103, 01/10/2026

   Três coisas puras que a tela do líder precisa para conviver com a troca
   feita pelo link do voluntário:

     1. a ponte lê `trocou_de` (quando a coluna existe) e guarda quem o banco
        tinha na vaga ao carregar (`vidNoBanco`);
     2. salvar o dia leva esse "quem o banco tinha" junto (`carregado`), e o
        plano NÃO devolve a vaga a quem pediu a troca quando a tela do líder
        abriu antes do aceite e ele salvou outra vaga do mesmo dia;
     3. a folha do mês (PDF) mostra quem está, e a vaga de quem avisou que não
        pode como aberta, com o nome de quem não pode ao lado.
   ============================================================================= */
import { strict as assert } from 'node:assert'
import { montarEstado, paraSalvarDia } from '../lib/ponte.ts'
import { planoDoDia } from '../lib/escala-diff.ts'
import { escalaDoMesParaImprimir } from '../lib/imprimir.ts'

let ok = 0
const caso = (nome, fn) => { fn(); ok++; console.log('  ok ' + nome) }

const DIA = '2026-10-04'      // um domingo
const linhas = (escalacoes) => ({
  equipe: 'Louvor',
  config: { dados: {} },
  funcoes: [
    { id: 'f1', nome: 'VOZ', simultanea: true, ordem: 1, ativa: true, tipos: null },
    { id: 'f2', nome: 'BAIXO', simultanea: true, ordem: 2, ativa: true, tipos: null },
  ],
  voluntarios: [
    { id: 'ana', nome: 'Ana Souza', telefone: '1', ativo: true, limite_mes: 4, token: 'a', equipe_id: 'e1', conferido: true },
    { id: 'bia', nome: 'Bia Lima', telefone: '2', ativo: true, limite_mes: 4, token: 'b', equipe_id: 'e1', conferido: true },
    { id: 'caio', nome: 'Caio Reis', telefone: '3', ativo: true, limite_mes: 4, token: 'c', equipe_id: 'e1', conferido: true },
    { id: 'eva', nome: 'Eva Melo', telefone: '4', ativo: true, limite_mes: 4, token: 'e', equipe_id: 'e1', conferido: true },
  ],
  habilidades: [],
  cultos: [{ id: 'c1', data: DIA, evento: null, inicio: null, equipe_id: null }],
  escalacoes, plantoes: [], recados: [], indisponibilidades: [], disponibilidade: [],
})
const esc = (funcao_id, vid, extra = {}) => ({ id: 'l-' + funcao_id, culto_id: 'c1', funcao_id, voluntario_id: vid,
  status: 'confirmado', fixo: false, primeira_vez: false, respondido_em: null, escalado_em: null, ...extra })

caso('a ponte le a marca da troca e quem o banco tinha', () => {
  const S = montarEstado(linhas([esc('f1', 'bia', { trocou_de: 'ana' }), esc('f2', 'eva')]))
  assert.equal(S.escalas[DIA].slots['VOZ'].trocouDe, 'ana')
  assert.equal(S.escalas[DIA].slots['VOZ'].vidNoBanco, 'bia')
  assert.equal(S.escalas[DIA].slots['BAIXO'].trocouDe, undefined, 'linha sem a coluna (banco antes da 103): fica indefinido')
})

caso('salvar o dia leva quem o banco tinha, e a vaga refeita na tela vai sem', () => {
  const S = montarEstado(linhas([esc('f1', 'ana'), esc('f2', 'eva')]))
  S.escalas[DIA].slots['BAIXO'] = { vid: 'caio', status: 'pendente', fixo: true }   // o líder troca o BAIXO
  const p = paraSalvarDia(S, DIA, 'e1')
  const voz = p.p_slots.find(x => x.funcao_id === 'f1'); const baixo = p.p_slots.find(x => x.funcao_id === 'f2')
  assert.equal(voz.carregado, 'ana')
  assert.equal('carregado' in baixo, false)
})

caso('a troca aceita depois que a tela abriu sobrevive ao salvar de outra vaga', () => {
  /* a tela carregou com a Ana na VOZ; no banco, a Bia aceitou a troca */
  const S = montarEstado(linhas([esc('f1', 'ana'), esc('f2', 'eva')]))
  S.escalas[DIA].slots['BAIXO'] = { vid: 'caio', status: 'pendente', fixo: true }
  const p = paraSalvarDia(S, DIA, 'e1')
  const noBanco = [
    { id: 'l-f1', funcao_id: 'f1', voluntario_id: 'bia', fixo: false, primeira_vez: false },
    { id: 'l-f2', funcao_id: 'f2', voluntario_id: 'eva', fixo: false, primeira_vez: false },
  ]
  const plano = planoDoDia(p.p_slots, noBanco)
  assert.ok(!plano.apagar.includes('l-f1') && !plano.trocar.some(x => x.id === 'l-f1'), 'a vaga da Bia fica')
  assert.ok(!plano.inserir.some(x => x.funcao_id === 'f1'), 'a Ana nao volta')
  /* 02/10/2026: trocar de pessoa num posto ocupado muda a propria linha
     (lib/escala-diff.ts); era DELETE + INSERT e o INSERT estourava o unique */
  assert.ok(plano.trocar.some(x => x.id === 'l-f2' && x.voluntario_id === 'caio'), 'o BAIXO do lider grava')
})

caso('a folha do mes: quem esta, a vaga aberta de quem nao pode, e o dia certo', () => {
  const S = montarEstado(linhas([esc('f1', 'bia', { trocou_de: 'ana' }), esc('f2', 'eva', { status: 'recusado' })]))
  const f = escalaDoMesParaImprimir(S, 2026, 10, '10h', '19h')
  assert.equal(f.titulo, 'Escala de outubro de 2026')
  const d = f.dias.find(x => x.data === DIA)
  assert.equal(d.titulo, 'domingo, 4 de outubro, 10h')
  assert.deepEqual(d.postos.map(p => `${p.funcao}=${p.quem}${p.nota ? ' (' + p.nota + ')' : ''}`),
    ['VOZ=Bia Lima', 'BAIXO=falta alguém (Eva Melo não pode)'])
  assert.equal(f.montados, 1)
  /* os sábados de Follow do mês entram também, vazios */
  assert.ok(f.dias.some(x => x.titulo.startsWith('sábado (Follow), 3 de outubro')), 'o Follow entra na folha')
  assert.ok(f.dias.filter(x => x.data !== DIA).every(x => x.postos.every(p => p.aberta)), 'dia sem escala sai com as vagas abertas')
})

console.log(`troca-ponte: ${ok}/${ok} ok`)
