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

/* O que cada arquivo REESCREVE.

   ======================================================= 82 ================
   A PRIMEIRA VERSÃO SÓ VIA `create or replace function`, E ISSO DEIXOU
   PASSAR A FORMA MAIS PERIGOSA DAS DUAS.

   `drop function if exists X; create function X` passa por cima até de
   MUDANÇA DE TIPO DE RETORNO, que o `create or replace` recusa. Quatro
   arquivos do repositório usam essa forma, e dois deles revertem de verdade
   num banco na 81. Medido:

     reaplicando 09-culto-follow.sql num banco na 81 ....... aplicou, exit 0
       equipe_funcoes antes  TABLE(nome, ordem, tipos, relata, descricao,
                                   descricao_familia)
       equipe_funcoes depois TABLE(nome, ordem, tipos)
     reaplicando 14-postos-explicados.sql .................. aplicou, exit 0
     e a bateria depois do estrago: 68/68, 27/27, 6/6 — toda verde.

   `equipe_funcoes` é chamada por quatro telas públicas (`/servir/[slug]`,
   `/servir/[slug]/cadastro`, `/servir/onde-me-encaixo`, `equipe/[slug]`).
   Perder `relata`, `descricao` e `descricao_familia` quebra a porta pública
   inteira, em silêncio, e o teste que existe para impedir exatamente isso
   dizia "ok".

   Então o extrator passou a ver:
     · `create or replace function`  (o que via antes)
     · `drop function` + `create function`  (o buraco)
     · `create or replace trigger`  (o comentário antigo dizia que via; não via)
     · `create or replace view`
     · política com `drop policy` + `create policy`

   E o schema entrou na chave. Antes, `create or replace function
   demandas.dem_algo` virava a chave `"funcao demandas"` — as seis funções de
   `50-demandas.sql` colidiam todas numa chave só. Não dava falso positivo
   hoje, mas era uma bomba de relógio: bastava um arquivo posterior mexer em
   qualquer `demandas.*` para o teste acusar os cinco outros. */
function objetos(sql) {
  const o = new Set()
  const fn = (schema, nome) =>
    'funcao ' + (schema ? schema.replace(/["\s]/g, '').toLowerCase() : 'public') + '.' + nome.toLowerCase()

  /* `create [or replace] function [schema.]nome` — o `or replace` é
     opcional de propósito: sem ele, o arquivo ou tem um `drop` antes (e aí é
     o caso perigoso) ou falha ao reaplicar (e aí não há o que trancar, mas
     listar é inofensivo). */
  for (const m of sql.matchAll(
      /create\s+(?:or\s+replace\s+)?function\s+(?:("?[a-z0-9_]+"?)\s*\.\s*)?"?([a-z0-9_]+)"?\s*\(/gi)) {
    o.add(fn(m[1], m[2]))
  }
  for (const m of sql.matchAll(
      /drop\s+function\s+(?:if\s+exists\s+)?(?:("?[a-z0-9_]+"?)\s*\.\s*)?"?([a-z0-9_]+)"?/gi)) {
    o.add(fn(m[1], m[2]))
  }
  for (const m of sql.matchAll(
      /create\s+or\s+replace\s+(?:view|trigger)\s+(?:("?[a-z0-9_]+"?)\s*\.\s*)?"?([a-z0-9_]+)"?/gi)) {
    o.add('objeto ' + (m[1] || 'public').replace(/["\s]/g, '').toLowerCase() + '.' + m[2].toLowerCase())
  }
  for (const m of sql.matchAll(
      /(?:create|drop)\s+policy\s+(?:if\s+exists\s+)?"?([a-z0-9_ -]+?)"?\s+on\s+(?:public\.)?"?([a-z0-9_.]+)"?/gi)) {
    o.add('politica ' + m[2].toLowerCase() + '.' + m[1].trim().toLowerCase())
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
/* Uma forma por linha, e todas TÊM que ser reconhecidas. A primeira versão
   deste teste só via a primeira, e foi assim que `drop function` + `create
   function` passou. Cada linha aqui é um buraco que já existiu ou que
   existiria na próxima migração que usasse a forma. */
const FORMAS = [
  ['create or replace', 'create or replace function public.eu_dados(p text)', 'funcao public.eu_dados'],
  ['sem o schema', 'create or replace function eu_dados(p text)', 'funcao public.eu_dados'],
  ['MAIUSCULAS', 'CREATE OR REPLACE FUNCTION public.eu_dados(p text)', 'funcao public.eu_dados'],
  ['quebra de linha', 'create or replace function\n  public.eu_dados(p text)', 'funcao public.eu_dados'],
  ['schema entre aspas', 'create or replace function "public".eu_dados(p text)', 'funcao public.eu_dados'],
  ['nome entre aspas', 'create or replace function public."eu_dados"(p text)', 'funcao public.eu_dados'],
  ['outro schema', 'create or replace function demandas.dem_lista(p text)', 'funcao demandas.dem_lista'],
  ['drop function if exists', 'drop function if exists equipe_funcoes(text);', 'funcao public.equipe_funcoes'],
  ['create function sem replace', 'create function equipe_funcoes(p text) returns setof record', 'funcao public.equipe_funcoes'],
  ['create or replace trigger', 'create or replace trigger culto_guarda_tg on cultos', 'objeto public.culto_guarda_tg'],
  ['create or replace view', 'create or replace view vw_escala as select 1', 'objeto public.vw_escala'],
  ['create policy', 'create policy cultos_ler on cultos for select', 'politica cultos.cultos_ler'],
  ['drop policy', 'drop policy if exists cultos_ler on cultos;', 'politica cultos.cultos_ler'],
]
const cegueiras = FORMAS.filter(([, sql, esperado]) => !objetos(sql).has(esperado))
if (cegueiras.length) {
  console.error('\nFALHOU — o extrator nao reconhece forma(s) de redefinicao:\n')
  for (const [rotulo, sql, esperado] of cegueiras) {
    console.error(`  ${rotulo.padEnd(28)} esperava "${esperado}", extraiu ${JSON.stringify([...objetos(sql)])}`)
  }
  console.error('\n  Extrator cego = teste verde por nao olhar. Conserte `objetos()`.\n')
  process.exit(1)
}
/* e o extrator nao pode ver o que NAO e redefinicao */
for (const inocente of ['create table if not exists cultos (id uuid)',
                        'create unique index if not exists ux_cultos on cultos (data)',
                        'alter table cultos add column if not exists evento text',
                        'comment on function eu_dados(text) is \'x\'']) {
  if (objetos(inocente).size) {
    console.error('FALHOU — o extrator viu redefinicao onde nao ha:', inocente,
                  '->', JSON.stringify([...objetos(inocente)]))
    process.exit(1)
  }
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
