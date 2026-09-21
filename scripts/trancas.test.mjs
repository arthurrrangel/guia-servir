/* =============================================================================
   TODA MIGRAÇÃO QUE PODE DESFAZER OUTRA PRECISA DE TRANCA.
   21/09/2026

   O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR

   `create or replace function` não é idempotente no tempo: ele grava a versão
   do arquivo por cima da que estiver no banco, seja ela mais nova ou não, em
   silêncio. Quem aplica uma migração antiga num banco novo desfaz correção
   sem receber um único aviso.

   `exige_versao_ate(n)` (migração 55, endurecida na 60) é a tranca. O
   problema é que ela era posta À MÃO, arquivo por arquivo — e em 21/09,
   auditando, vinte e uma migrações estavam sem ela. Entre elas a 52 e a 67.

   MEDIDO em 21/09, num banco na versão 81:

     · reaplicar a 52 derruba as menções de `aprovacao` em `dem_mover`
       de 32 para 25, e a 52 imprime três "OK" enquanto faz isso;
     · a conferência da própria 67 passa a reprovar 6 de 14 casos, e a
       primeira linha é:
           "x PORTA 1 ABERTA: concluir fechou o gasto sem aprovacao"
       ou seja: uma demanda que exige aprovação e ninguém aprovou pode ser
       dada como concluída, e o gasto fecha.

   Nenhum teste pegava isso, porque nenhum teste perguntava. Este pergunta.

   -------------------------------------------------------------------------
   A REGRA, E POR QUE ELA É EXATAMENTE ESTA

   Se o arquivo N redefine um objeto que algum arquivo M > N também redefine,
   então N pode desfazer M, e N precisa de tranca. Se ninguém depois toca no
   que N escreve, N é inofensivo e a tranca seria cerimônia.

   A regra é mecânica de propósito: ela não depende de alguém LEMBRAR. Migração
   nova que mexa em função antiga passa a acender esta luz sozinha.

   O teste NÃO confere o número dentro de `exige_versao_ate(...)`. Os arquivos
   antigos usam tetos escolhidos a dedo (a 23 usa 35, a 31 usa 50), e
   substituir esse raciocínio por uma fórmula seria trocar uma decisão pensada
   por uma automática. O que se exige é a PRESENÇA da tranca.
   ============================================================================= */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = new URL('../supabase/', import.meta.url).pathname
const arquivos = readdirSync(DIR)
  .filter((f) => /^\d{2}-.*\.sql$/.test(f))
  .sort((a, b) => (Number(a.slice(0, 2)) - Number(b.slice(0, 2))) || a.localeCompare(b))

/* O que cada arquivo REESCREVE. Só entra o que `create or replace` pode
   sobrescrever sem erro — função e gatilho. Tabela, índice e constraint usam
   `if not exists` e não têm esse problema. Política entra porque
   `drop policy` + `create policy` é o mesmo efeito. */
function objetos(sql) {
  const o = new Set()
  for (const m of sql.matchAll(/create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)/gi)) {
    o.add('funcao ' + m[1].toLowerCase())
  }
  for (const m of sql.matchAll(/create\s+policy\s+"?([a-z0-9_]+)"?\s+on\s+(?:public\.)?([a-z0-9_.]+)/gi)) {
    o.add('politica ' + m[2].toLowerCase() + '.' + m[1].toLowerCase())
  }
  return o
}

const corpo = new Map()
for (const f of arquivos) corpo.set(f, readFileSync(join(DIR, f), 'utf8'))

const defs = new Map()
for (const f of arquivos) defs.set(f, objetos(corpo.get(f)))

const faltando = []
const temTranca = (f) => /exige_versao_ate\s*\(/.test(corpo.get(f))

for (let i = 0; i < arquivos.length; i++) {
  const f = arquivos[i]
  const n = Number(f.slice(0, 2))
  if (temTranca(f)) continue

  const colisoes = new Map()
  for (let j = i + 1; j < arquivos.length; j++) {
    const g = arquivos[j]
    if (Number(g.slice(0, 2)) <= n) continue
    for (const obj of defs.get(f)) {
      if (defs.get(g).has(obj)) {
        if (!colisoes.has(obj)) colisoes.set(obj, [])
        colisoes.get(obj).push(g.slice(0, 2))
      }
    }
  }
  if (colisoes.size) faltando.push({ f, colisoes })
}

/* ---- e o controle negativo: o teste tem que ser capaz de acusar -------------
   Sem isto, um erro na extração de objetos (um regex que deixa de casar, por
   exemplo) faria a lista vir vazia e o teste ficaria verde para sempre sem
   olhar para nada. */
const semTranca = arquivos.filter((f) => !temTranca(f))
const comTranca = arquivos.filter((f) => temTranca(f))
const plantado = objetos(`create or replace function public.eu_dados(p text)`)
if (!plantado.has('funcao eu_dados')) {
  console.error('FALHOU — o extrator de objetos nao reconhece nem um `create or replace function`.')
  process.exit(1)
}
if (comTranca.length === 0) {
  console.error('FALHOU — nenhum arquivo tem tranca; o teste esta lendo o diretorio errado.')
  process.exit(1)
}

if (faltando.length) {
  console.error('\nFALHOU — migracao sem tranca que pode desfazer outra:\n')
  for (const { f, colisoes } of faltando) {
    console.error('  ' + f)
    for (const [obj, ns] of [...colisoes].sort()) {
      console.error(`      ${obj.padEnd(40)} refeito depois por ${[...new Set(ns)].join(', ')}`)
    }
  }
  console.error(`
  Ponha no topo do arquivo, antes de tudo:

    do $tranca$ begin
      if to_regprocedure('public.exige_versao_ate(int)') is not null then
        perform public.exige_versao_ate(<numero do arquivo>);
      end if;
    end $tranca$;

  O \`if\` e obrigatorio: aplicado do zero, \`exige_versao_ate\` so nasce na 55,
  e sem ele o rebuild do repositorio para no primeiro arquivo.
`)
  process.exit(1)
}

console.log(
  `trancas: ok — ${arquivos.length} migracoes, ${comTranca.length} com tranca, ` +
  `${semTranca.length} sem (nenhuma delas redefine algo que um arquivo posterior refaca).`
)
