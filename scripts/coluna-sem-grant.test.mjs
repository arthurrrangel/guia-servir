/* =============================================================================
   UMA COLUNA SEM GRANT NÃO PODE LEVAR AS OUTRAS JUNTO
   21/09/2026 · migração 82

   A 81 criou `voluntarios.identidade_reivindicada` e esqueceu o
   `grant select`. `lerVoluntarios` degradava TUDO OU NADA, então a segunda
   tentativa caía para `COLUNAS_ESSENCIAIS` e o `sexo` ia junto. A regra do
   prédio (postos que só aceitam homem ou só mulher, migrações 48/49/63)
   ficava desligada, e a tela do Time cobrava um dado que as pessoas já
   tinham dado.

   Este teste usa um dublê de Supabase que recusa exatamente as colunas que
   lhe mandarem recusar, com o código 42501 que o Postgres devolve de
   verdade, e mede quais colunas SOBREVIVEM.
   ============================================================================= */
import { strict as assert } from 'node:assert'
import { montarEstado, linhasDaEquipe } from '../lib/ponte.ts'

let ok = 0
const caso = (nome, fn) => { fn(); ok++; console.log('  ok ' + nome) }
const casoAsync = async (nome, fn) => { await fn(); ok++; console.log('  ok ' + nome) }

const PESSOAS = [
  { id: 'v1', nome: 'Ana',   telefone: '21900000001', ativo: true, limite_mes: 2, token: 't1', equipe_id: 'e1', conferido: true,  sexo: 'F', identidade_reivindicada: false, pessoas: null },
  { id: 'v2', nome: 'Bia',   telefone: '21900000002', ativo: true, limite_mes: 2, token: 't2', equipe_id: 'e1', conferido: true,  sexo: 'F', identidade_reivindicada: true,  pessoas: { nome: 'Beatriz' } },
  { id: 'v3', nome: 'Caio',  telefone: '21900000003', ativo: true, limite_mes: 2, token: 't3', equipe_id: 'e1', conferido: true,  sexo: 'M', identidade_reivindicada: false, pessoas: null },
]

/* ---------------------------------------------------------------------------
   O dublê. `recusar` é o conjunto de colunas que este "banco" não entrega;
   pedir qualquer uma delas devolve 42501, que é o código real.
   --------------------------------------------------------------------------- */
function bancoFalso(recusar = new Set()) {
  const pedidos = []
  const tabela = (nome) => {
    const q = {
      _cols: '', _nome: nome,
      select(cols) { this._cols = cols; if (this._nome === 'voluntarios') pedidos.push(cols); return this },
      eq() { return this }, in() { return this }, or() { return this },
      gte() { return this }, lte() { return this }, order() { return this },
      range() { return this }, limit() { return this }, maybeSingle() { return this.then() },
      then(res, rej) { return Promise.resolve(this._resultado()).then(res, rej) },
      _resultado() {
        if (this._nome !== 'voluntarios') return { data: [], error: null, count: 0 }
        const pedidas = this._cols.split(',').map(c => c.trim())
        const ruim = pedidas.find(c => recusar.has(c))
        if (ruim) return { data: null, error: { code: '42501', message: 'permission denied for table voluntarios' }, count: null }
        const linhas = PESSOAS.map(p => {
          const o = {}
          for (const c of pedidas) o[c === 'pessoas(nome)' ? 'pessoas' : c] = p[c === 'pessoas(nome)' ? 'pessoas' : c]
          return o
        })
        return { data: linhas, error: null, count: linhas.length }
      },
    }
    return q
  }
  return { cliente: { from: tabela, rpc: () => tabela('rpc') }, pedidos }
}

async function carregar(recusar) {
  const { cliente, pedidos } = bancoFalso(recusar)
  const linhas = await linhasDaEquipe(cliente, 'e1', '2026-01-01', 'Connect')
  return { S: montarEstado(linhas), pedidos }
}

/* =========================================================================== */

await casoAsync('banco certo: uma ida ao banco, e as tres opcionais chegam', async () => {
  const { S, pedidos } = await carregar(new Set())
  assert.equal(pedidos.length, 1, 'o caminho normal faz UMA consulta a voluntarios')
  assert.deepEqual(S.voluntarios.map(v => v.sexo), ['F', 'F', 'M'])
  assert.deepEqual(S.voluntarios.map(v => !!v.identidadeReivindicada), [false, true, false])
  assert.equal(S.voluntarios.find(v => v.id === 'v2')?.nomeDaPessoa, 'Beatriz')
})

await casoAsync('a coluna da 81 sem GRANT nao leva o `sexo` junto', async () => {
  /* EXATAMENTE o estado que a 81 deixou em producao ate a 82 */
  const { S, pedidos } = await carregar(new Set(['identidade_reivindicada']))
  assert.ok(pedidos.length >= 2, 'degradou')
  assert.deepEqual(S.voluntarios.map(v => v.sexo), ['F', 'F', 'M'],
    'o sexo SOBREVIVE — era isto que se perdia')
  assert.ok(S.voluntarios.every(v => v.identidadeReivindicada === undefined || v.identidadeReivindicada === false),
    'e so a coluna recusada some')

  /* e a PRECISAO: `pessoas(nome)` nao e colateral. A primeira versao desta
     correcao tirava da ultima para a primeira e derrubava `pessoas(nome)`
     junto; o teste mediu isso e a busca passou a ser uma por uma. */
  assert.equal(S.voluntarios.find(v => v.id === 'v2')?.nomeDaPessoa, 'Beatriz',
    'so a coluna recusada some — nenhuma outra vai de carona')

  /* e a conta VELHA, escrita aqui, para a diferenca ficar medida */
  const comoEraAntes = ['id,nome,telefone,ativo,limite_mes,token,equipe_id,conferido']
  assert.ok(!comoEraAntes[0].includes('sexo'),
    'a lista essencial, que era o unico degrau da degradacao velha, nao tem sexo')
})

await casoAsync('`pessoas(nome)` sem GRANT tambem nao leva ninguem junto', async () => {
  const { S } = await carregar(new Set(['pessoas(nome)']))
  assert.deepEqual(S.voluntarios.map(v => v.sexo), ['F', 'F', 'M'])
  assert.deepEqual(S.voluntarios.map(v => !!v.identidadeReivindicada), [false, true, false])
})

await casoAsync('duas recusadas: as duas somem, a terceira fica', async () => {
  const { S } = await carregar(new Set(['identidade_reivindicada', 'pessoas(nome)']))
  assert.deepEqual(S.voluntarios.map(v => v.sexo), ['F', 'F', 'M'], 'o sexo ainda sobrevive')
})

await casoAsync('as tres recusadas: sobra o essencial, e a carga NAO quebra', async () => {
  const { S } = await carregar(new Set(['sexo', 'identidade_reivindicada', 'pessoas(nome)']))
  assert.equal(S.voluntarios.length, 3, 'a tela do lider continua de pe')
  assert.ok(S.voluntarios.every(v => !v.sexo))
})

await casoAsync('coluna ESSENCIAL recusada: o erro SOBE, nao vira tela vazia', async () => {
  /* `conferido` e essencial. Recusa-la nao e "coluna nova sem grant", e a
     tabela fechada — e esconder isso faria a tela do lider mentir. */
  let subiu = false
  try { await carregar(new Set(['conferido'])) } catch { subiu = true }
  assert.ok(subiu, 'carga com coluna essencial recusada tem que estourar')
})

/* ---- e o banco de verdade concorda? -------------------------------------
   Este caso le o catalogo do Postgres local, se ele estiver no ar. Sem
   banco, ele se pula em vez de mentir — e diz que se pulou. */
await casoAsync('o GRANT do banco local cobre as tres opcionais (ou o caso se pula)', async () => {
  const { execSync } = await import('node:child_process')
  let saida = null
  try {
    saida = execSync(
      `psql -h /tmp -p 5439 -U postgres -d guia -At -c "select coluna || ':' || problema from voluntarios_grant_conferir()"`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).trim()
  } catch {
    console.log('     (pulei: sem Postgres local na 5439 — rode bash scripts/banco-do-zero.sh)')
    return
  }
  assert.equal(saida, '',
    'voluntarios_grant_conferir() achou coluna com GRANT errado: ' + saida)
})

console.log(`\ncoluna-sem-grant: ${ok}/${ok} casos.`)
