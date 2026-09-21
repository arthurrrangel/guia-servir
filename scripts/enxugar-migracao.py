#!/usr/bin/env python3
"""Tira os comentarios de FORA das funcoes, e so eles.

POR QUE ISTO EXISTE

O editor SQL do Supabase congela o navegador com os arquivos desta rodada: a
84 tem 48 KB, e colar isso na tela trava a thread principal a ponto de o
screenshot nao conseguir mais ser tirado. Medido em 21/09/2026, com pedacos
de 6 KB e 90 ms de respiro entre eles: trava do mesmo jeito, entao o custo e
do tamanho do documento, nao da edicao.

O arquivo do repositorio continua sendo o documento: ele e que explica por que
cada linha existe, e e ele que fica no historico. O que vai para o editor e o
MESMO SQL com a prosa de fora tirada.

O QUE ELE NAO TIRA, E ISSO E O PONTO

Comentario dentro de `$tag$ ... $tag$` e dentro de string NAO sai. Duas
razoes, e a segunda e a que morde:

  1. o corpo de uma funcao e uma string literal: mexer nela muda a funcao.
  2. as migracoes 86 e 87 sao CIRURGICAS — elas leem o corpo vivo com
     `pg_get_functiondef` e trocam trechos exigindo casamento exato. Se a 84
     e a 85 gravassem as funcoes sem os comentarios internos, e a 86 fosse
     aplicada a partir do arquivo cheio, a troca casaria zero vezes e a
     migracao pararia. Tirar comentario de dentro de funcao quebra a rodada.

Entao o scanner precisa saber onde comeca e termina cada dollar-quote e cada
string. E um analisador pequeno, mas nao e um regex.

COMO SE SABE QUE O RESULTADO E EQUIVALENTE

Nao se sabe por leitura. `scripts/enxugar-conferir.sh` aplica o original num
banco novo, aplica o enxuto noutro banco novo, e compara o `pg_get_functiondef`
de TODAS as funcoes e a definicao de TODAS as constraints dos dois. Se
divergir em um byte, reprova.
"""
import re
import sys


ABRE_DO = re.compile(r"\bdo\s*$", re.I)


def enxugar(sql: str) -> str:
    """Tira comentario de fora das funcoes, e de dentro dos blocos `do $$`.

    A DIFERENCA ENTRE OS DOIS DOLLAR-QUOTES, QUE E O TODO DESTE ARQUIVO:

      create function ... as $fn$ ... $fn$   -> o corpo VIRA `prosrc`. Mexer
                                                nele muda a funcao gravada, e
                                                a 86 e a 87 procuram trechos
                                                dela por texto exato.
      do $tetos$ ... $tetos$                 -> executa e some. O que esta
                                                dentro nao fica em lugar
                                                nenhum do banco.

    So o segundo pode ser enxugado, e ele e a maior parte do peso: as
    conferencias sao os blocos mais comentados dos arquivos.
    """
    fora = []          # pedacos que ficam
    i = 0
    n = len(sql)
    while i < n:
        c = sql[i]

        # ---- dollar quote: $tag$ ... $tag$ -------------------------------
        if c == '$':
            m = re.match(r"\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$", sql[i:])
            if m:
                tag = m.group(0)
                fim = sql.find(tag, i + len(tag))
                if fim == -1:
                    fora.append(sql[i:])
                    break
                corpo = sql[i + len(tag):fim]
                # o que vem ANTES do tag decide: `do $x$` e descartavel,
                # `as $x$` de um create function nao e
                antes = ''.join(fora)[-40:]
                if ABRE_DO.search(antes):
                    corpo = enxugar(corpo)
                fora.append(tag + corpo + tag)
                i = fim + len(tag)
                continue

        # ---- string comum: '...' com '' para aspas dentro -----------------
        if c == "'":
            j = i + 1
            while j < n:
                if sql[j] == "'":
                    if j + 1 < n and sql[j + 1] == "'":
                        j += 2
                        continue
                    break
                j += 1
            fora.append(sql[i:j + 1])
            i = j + 1
            continue

        # ---- identificador entre aspas duplas ----------------------------
        if c == '"':
            j = sql.find('"', i + 1)
            j = n - 1 if j == -1 else j
            fora.append(sql[i:j + 1])
            i = j + 1
            continue

        # ---- comentario de bloco, com aninhamento (o Postgres aninha) -----
        if sql.startswith('/*', i):
            nivel = 1
            j = i + 2
            while j < n and nivel:
                if sql.startswith('/*', j):
                    nivel += 1
                    j += 2
                elif sql.startswith('*/', j):
                    nivel -= 1
                    j += 2
                else:
                    j += 1
            fora.append(' ')
            i = j
            continue

        # ---- comentario de linha -----------------------------------------
        if sql.startswith('--', i):
            j = sql.find('\n', i)
            i = n if j == -1 else j
            continue

        fora.append(c)
        i += 1

    texto = ''.join(fora)
    # linhas que ficaram so com espaco somem; o resto da formatacao fica
    texto = '\n'.join(l.rstrip() for l in texto.split('\n'))
    texto = re.sub(r'\n{3,}', '\n\n', texto)
    return texto.strip() + '\n'


if __name__ == '__main__':
    entrada = open(sys.argv[1], encoding='utf-8').read()
    saida = enxugar(entrada)
    if len(sys.argv) > 2:
        open(sys.argv[2], 'w', encoding='utf-8').write(saida)
    else:
        sys.stdout.write(saida)
    print(f'{sys.argv[1]}: {len(entrada)} -> {len(saida)} bytes '
          f'({100 - round(100 * len(saida) / len(entrada))}% menor)', file=sys.stderr)
