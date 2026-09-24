/* =============================================================================
   PARA ONDE O LOGIN DEVOLVE A PESSOA
   21/09/2026 · 82d

   O DEFEITO, RELATADO POR QUEM USA

     "to entrando no sistema de demandas e ta direcionando pro painel das
      escalas"

   `app/entrar/page.tsx` tinha `location.href = '/painel'` escrito à mão em
   três pontos. `/painel` é o painel das ESCALAS. Quem chegava das DEMANDAS
   fazia login e era despejado noutro sistema, sem volta.

   A correção é `?volta=`, e a validação dela NÃO é zelo: sem ela isto vira
   redirecionamento aberto, e `/entrar?volta=https://site-falso` levaria
   alguém para fora do site no segundo seguinte a digitar a senha. Esse é o
   pior momento possível para um desvio, porque a pessoa acabou de provar que
   confia na tela.

   Este arquivo é a tabela-verdade dessa validação, e ela mora aqui em vez de
   só no componente porque componente de tela não se testa sem navegador — e
   uma regra de segurança que só existe dentro de um `useEffect` é uma regra
   que ninguém confere.
   ============================================================================= */
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'

let ok = 0
const caso = (nome, fn) => { fn(); ok++; console.log('  ok ' + nome) }

const PADRAO = '/painel'

/* A MESMA regra que está em `app/entrar/page.tsx`. Duplicar lógica é ruim, e
   por isso o último caso deste arquivo confere, lendo o arquivo, que as duas
   não se separaram. */
function destino(volta) {
  if (typeof volta !== 'string') return PADRAO
  if (!volta.startsWith('/')) return PADRAO
  if (volta.startsWith('//') || volta.includes('\\')) return PADRAO
  return volta
}

caso('sem `volta`: o padrao continua sendo o painel das escalas', () => {
  assert.equal(destino(''), PADRAO)
  assert.equal(destino(null), PADRAO)
  assert.equal(destino(undefined), PADRAO)
})

caso('caminho interno passa: e o conserto do defeito relatado', () => {
  assert.equal(destino('/demandas'), '/demandas')
  assert.equal(destino('/demandas/nova'), '/demandas/nova')
  assert.equal(destino('/demandas/d/42'), '/demandas/d/42')
  assert.equal(destino('/painel'), '/painel')
})

caso('URL absoluta NAO passa: seria redirecionamento aberto', () => {
  for (const mau of [
    'https://site-falso.example',
    'http://site-falso.example',
    'https://guiaservir.com.site-falso.example/',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
  ]) {
    assert.equal(destino(mau), PADRAO, `deixou passar: ${mau}`)
  }
})

caso('protocolo-relativo NAO passa: `//site` o navegador le como https://site', () => {
  assert.equal(destino('//site-falso.example'), PADRAO)
  assert.equal(destino('//site-falso.example/demandas'), PADRAO)
  /* e o caso que engana o olho: barra, barra, e um caminho que parece nosso */
  assert.equal(destino('///demandas'), PADRAO)
})

caso('contrabarra NAO passa: alguns navegadores normalizam \\ para /', () => {
  assert.equal(destino('/\\site-falso.example'), PADRAO)
  assert.equal(destino('\\\\site-falso.example'), PADRAO)
  assert.equal(destino('/demandas\\..\\painel'), PADRAO)
})

caso('o que passa e SEMPRE relativo: nunca sai deste site', () => {
  /* varredura: toda entrada aceita, resolvida contra uma origem qualquer,
     tem que continuar na mesma origem */
  const entradas = [
    '/demandas', '/demandas/nova', '/', '/a/b/c?x=1#y',
    'https://mau.example', '//mau.example', '\\\\mau.example', 'javascript:x',
    '/\\mau.example', 'demandas', '', '///x',
  ]
  let fugas = 0
  for (const e of entradas) {
    const d = destino(e)
    const resolvida = new URL(d, 'https://guiaservir.com')
    if (resolvida.origin !== 'https://guiaservir.com') {
      fugas++
      console.error('    FUGA:', JSON.stringify(e), '->', d, '->', resolvida.origin)
    }
  }
  assert.equal(fugas, 0, 'alguma entrada escapou da origem')
})

/* ---- e a regra do teste e a do produto sao a mesma? --------------------- */
const entrar = readFileSync(new URL('../app/entrar/page.tsx', import.meta.url), 'utf8')
/* CONTA CODIGO, NAO COMENTARIO. A primeira versao deste arquivo reprovou
   sozinha porque o regex de "nao sobrou `/painel` na mao" casou com o
   COMENTARIO que descreve o defeito antigo. E o mesmo tropeco que a migracao
   69 ja tinha registrado ("comentario nao e guarda"), e ele custa duas vezes:
   um teste que acusa o que nao existe hoje, e amanha um que deixa passar o
   que existe porque alguem afrouxou o regex para calar o falso positivo. */
const semComentario = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

caso('o `/entrar` usa a funcao nos TRES destinos, e nao mais o caminho na mao', () => {
  const chamadas = (entrar.match(/destinoDoLogin\(\)/g) || []).length
  assert.ok(chamadas >= 3, `esperava 3+ usos de destinoDoLogin(), achei ${chamadas}`)
  assert.ok(!/location\.href = '\/painel'/.test(semComentario(entrar)),
    'nenhum `location.href = \'/painel\'` escrito a mao sobrou')
})

caso('a validacao do produto tem as TRES travas que este arquivo testa', () => {
  const corpo = entrar.slice(entrar.indexOf('function destinoDoLogin'))
    .slice(0, entrar.slice(entrar.indexOf('function destinoDoLogin')).indexOf('\n}') + 2)
  assert.ok(/startsWith\('\/'\)/.test(corpo), 'trava 1: precisa comecar com barra')
  assert.ok(/startsWith\('\/\/'\)/.test(corpo), 'trava 2: nao pode ser protocolo-relativo')
  assert.ok(/includes\('\\\\\\\\'\)/.test(corpo) || corpo.includes("includes('\\\\')"),
    'trava 3: nao pode ter contrabarra')
})

caso('o link por e-mail CARREGA o destino, senao o desvio volta um passo adiante', () => {
  assert.ok(/emailRedirectTo: window\.location\.origin \+ '\/entrar' \+ voltaNaUrl\(\)/.test(entrar),
    'o link de acesso por e-mail leva o ?volta=')
  assert.ok(/redirectTo: window\.location\.origin \+ '\/entrar' \+ voltaNaUrl\(\)/.test(entrar),
    'o link de criar/trocar senha tambem')
})

/* ---- e o sistema de demandas nao linka mais para as escalas ------------- */
const casca = readFileSync(new URL('../components/demandas/Casca.tsx', import.meta.url), 'utf8')

caso('a casca das demandas nao tem NENHUM link para as escalas', () => {
  /* a regra do Arthur, 21/09: "sistema de demanda tem que ser um sistema
     totalmente desconectado com sistema de escalas" */
  const semComentarios = casca.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  for (const alvo of ['href="/painel"', 'href="/escala"', 'href="/time"', 'href="/ajustes"']) {
    assert.ok(!semComentarios.includes(alvo), `ainda linka para as escalas: ${alvo}`)
  }
  /* ISTO EXIGIA `href="/entrar?volta=%2Fdemandas"` ATE 22/09/2026.

     Era a solucao de 82d, e ela funciona: medi em producao, o `?volta=`
     sobrevive e o login devolve a pessoa para as demandas. So que `/entrar` E
     A TELA DAS ESCALAS ("ESPACO DO ORGANIZADOR", "voluntario nao entra por
     aqui"), entao quem tocava no botao JA tinha entrado no outro sistema,
     mesmo voltando dois segundos depois.

     A frase dele, depois de repetir o dia inteiro: "nesse entrar eu entro
     diretamente pro sistema de escalas cara". Tinha razao. O botao passa a
     apontar para `/demandas/entrar`, porta propria, e este caso passa a
     exigir o contrario do que exigia: a casca NAO pode ter a rota do outro
     sistema.

     Quem cuida do resto e `scripts/demandas-porta-propria.test.mjs`, que
     varre `app/demandas/` e `components/demandas/` inteiros. */
  /* 23/09/2026: a casca leva sozinha para a porta (`router.replace`, com o
     `?volta=` de onde a pessoa estava) e o link fica como reserva; os dois
     apontam para `/demandas/entrar` */
  assert.ok(semComentarios.includes('href="/demandas/entrar"'),
    'o caminho para fora e a porta PROPRIA do demandas')
  assert.ok(/router\.replace\('\/demandas\/entrar'/.test(semComentarios),
    'e a casca leva para ela sozinha, sem a tela do meio')
  assert.ok(!/replace\(\s*['"`]\/entrar/.test(semComentarios),
    'nunca para a porta das escalas')
  assert.ok(!/href=\{?["'`]\/entrar/.test(semComentarios),
    'e a casca nao aponta mais para a porta das escalas')
})

console.log(`\nvolta-do-login: ${ok}/${ok} casos.`)
