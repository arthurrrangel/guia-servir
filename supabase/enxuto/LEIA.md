# Por que esta pasta existe

Estes arquivos são **o mesmo SQL** dos arquivos irmãos em `supabase/`, com os
comentários de fora das funções tirados. Eles não são uma versão alternativa
da migração: são a mesma migração, prensada para caber no editor.

## O motivo, medido

O editor SQL do Supabase congela o navegador com os arquivos desta rodada. A
84 tem 48 KB; colar isso na tela trava a thread principal a ponto de o
próprio screenshot não conseguir mais ser tirado. Medido em 21/09/2026,
colando em pedaços de 6 KB com 90 ms de respiro entre eles: trava igual, então
o custo é do tamanho do documento, não da edição. A 75, de 35 KB, tinha
passado dias antes.

## O que NÃO sai

Comentário dentro de corpo de função fica. Duas razões, e a segunda é a que
morde:

1. o corpo de uma função é uma string literal: mexer nele muda a função;
2. as migrações 86 e 87 são cirúrgicas — leem o corpo vivo com
   `pg_get_functiondef` e trocam trechos exigindo casamento exato. Tirar
   comentário de dentro de função quebraria a rodada inteira.

## Como se sabe que é equivalente

Não por leitura. `scripts/enxugar-conferir.sh` monta **dois bancos do zero**,
aplica o original num e o enxuto no outro, e compara o catálogo inteiro:
`pg_get_functiondef` de toda função, `pg_get_constraintdef` de toda
constraint, todo índice, todo gatilho, todo comentário de objeto e toda coluna
do esquema `demandas`.

Resultado em 21/09/2026:

    IGUAIS: 1342 linhas de catalogo conferem byte a byte.
      funcoes ..... 28
      constraints . 51
      indices ..... 22
      gatilhos .... 2

**O arquivo do repositório continua sendo o documento.** É ele que explica por
que cada linha existe. Esta pasta é um derivado, e é gerada:

    for n in 50 52 57 58 84 85 86 87; do
      f=$(ls supabase/$n-*.sql)
      python3 scripts/enxugar-migracao.py "$f" "supabase/enxuto/$(basename $f)"
    done
