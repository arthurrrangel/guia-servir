#!/usr/bin/env python3
"""
AS FOTOS TRATADAS NO SITE DA IGREJA · 18/11/2026

O Arthur mandou 31 fotos já tratadas pelo designer ("use essas fotos no site,
exclua todas as outras"), todas deitadas, em 2000 x 1000 (2:1), numeradas de 1
a 31. Este script corta cada lugar do guiachurch.com a partir delas e grava em
public/site, com os mesmos nomes de lugar de antes (home-1, cultos-3...).
Nada de tratamento aqui: a cor é a do designer. Só o corte.

  scripts/site-fotos-tratadas.py <pasta com 01.png ... 31.png> [nome ...]

Sufixos e o que cada um é (as medidas são as da foto de origem, sem ampliar):
  l  herói que anda com o scroll, no computador: 16:9 (1778 x 1000)
  l  herói de página (texto à esquerda): a janela pedida, com a pessoa no
     lado direito, depois de onde o título acaba (de 1260 a 1720 px de largura)
  l  fecho da home: a foto inteira na largura (2000 x 900)
  p  celular em pé: 4:5 (800 x 1000). A foto ocupa o alto da tela (app/site.css,
     "A FOTO NO ALTO"), e não uma coluna 9:16 de 562 px ampliada duas vezes e meia.
     No fecho da home, 584 x 730 (a tabela diz por quê)
  v  retrato 4:5 dentro da página (800 x 1000) e s, a pequena (640 x 800)
  h  faixa 3:2 (1500 x 1000) e s, a pequena (640 x 427)

A FOTO DE CADA LUGAR está na tabela abaixo; lib/site/fotos.ts e as páginas
(app/(igreja)) apontam para os arquivos. Trocar uma foto é trocar o número
aqui e rodar de novo (e, se a janela mudar de tamanho, a largura e a altura
em lib/site/fotos.ts). Os cartões de compartilhamento saem destes arquivos:
depois de trocar, scripts/og-cartoes.py com os nomes dos sete da igreja.

As 31 originais não estão no repositório (vieram pela conversa, em PNG). Não
usadas em nenhum lugar: 1, 2, 5, 7, 15, 16 e 28 (a 13, a 17, a 9 e a 12 foram
para a Virada 2027, em 21/11/2026, com a 30 e a 27 de novo).
"""
import os, sys
from PIL import Image

if len(sys.argv) < 2:
    sys.exit(__doc__)
ORIGEM = sys.argv[1]
SO = set(sys.argv[2:])
SAIDA = os.environ.get('SAIDA_FOTOS') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'site')
W, H = 2000, 1000

def L(x0):            # 16:9 de altura inteira, a partir de x0
    return ('l', (x0, 0, 1778, 1000))
def J(x0, y0, w, h):  # a janela do herói de página
    return ('l', (x0, y0, w, h))
def P(x0, y0=0, h=1000):  # 4:5 do celular
    return ('p', (x0, y0, round(h * 0.8), h))
def V(x0):            # 4:5 dentro da página, com a pequena
    return ('v', (x0, 0, 800, 1000))
def Hh(x0):           # 3:2, com a pequena
    return ('h', (x0, 0, 1500, 1000))

# lugar, número da foto, cortes e, quando a foto pede, a qualidade do WebP
# (ver Q, mais abaixo)
FOTOS = [
    # a home: a chegada em cinco fotos
    ('home-1', 19, [L(111), P(640)]),          # o abraço de quem chega, o colete da equipe e a placa do culto
    ('home-2', 21, [L(111), P(1120)], 76),     # quatro sorrisos na porta (no celular, as duas da direita)
    ('home-3', 14, [L(100), P(830)]),          # o abraço
    ('home-4', 3,  [L(89),  P(560)]),          # a mão no peito, no louvor
    ('home-5', 11, [L(133), P(780)]),          # a Palavra
    # "a igreja não é o prédio": a porta, a sala das crianças, a música
    ('gente-porta', 25, [V(600)], 78),         # a 25 tem grão forte: 126 kB a 84
    ('gente-kids', 29, [V(120)]),
    ('gente-violao', 10, [V(1080)]),
    # o fecho da home: a igreja de pé. A faixa é larga e baixa (2,2:1 a 2,7:1) e o
    # texto ocupa o meio dela: a foto entra inteira na largura, que é como os rostos
    # ficam menores. No celular a faixa é em pé e o terço de cima fica livre: o corte
    # põe ali o grupo que olha para cima (584 x 730, o maior que deixa os rostos
    # acima do título)
    ('fecho-igreja', 24, [J(0, 50, 2000, 900), P(240, 270, 730)]),
    # /cultos: o pouso na porta e os quatro momentos
    ('cultos-1', 25, [J(165, 60, 1671, 940), P(620)], 76),  # acolhida: o abraço na porta de vidro
    ('cultos-2', 30, [L(111), P(520)]),        # louvor
    ('cultos-3', 6,  [L(89),  P(500)]),        # Palavra
    ('cultos-4', 27, [L(111), P(700)], 76),    # oração
    ('cultos-5', 20, [L(111), P(620)]),        # saída: a conversa
    # as outras páginas. Herói de página: o texto fica à esquerda, e a janela
    # deixa as pessoas no lado direito, depois de onde o título acaba
    ('sobre-heroi', 31, [J(0, 0, 1260, 703), P(690)]),       # o casal na entrada (1260: o rosto dele começa depois do fim do título em 1440 x 900)
    ('sobre-geracoes', 18, [Hh(250)]),                       # o batismo
    ('eventos-heroi', 8, [J(0, 40, 1650, 892), P(500)]),     # o louvor de braços abertos
    ('eventos-follow', 23, [V(560)]),                        # o jovem em adoração
    ('pg-heroi', 26, [J(0, 120, 1400, 757), P(470)]),        # o abraço no jardim
    ('ofertar-heroi', 4, [J(0, 130, 1700, 773), P(620)]),    # o cálice da ceia
    ('chegar-heroi', 22, [J(130, 40, 1720, 930), P(640)]),   # as duas na porta, a placa do culto atrás
    # 21/11/2026: a Virada 2027 (guiachurch.com/virada), com duas das que não tinham lugar
    ('virada-heroi', 13, [J(0, 50, 1450, 784), P(650)], 74), # grão forte do palco: 74 · a cantora de braço erguido, na luz do palco (P&B): ela fica à direita do título
    ('virada-noite', 17, [V(860)]),                          # a igreja orando junto, mão no peito
    # 21/11/2026 (tarde), "mais chamativo": a faixa de fotos da Virada, quatro cortes 4:5
    ('virada-louvor', 30, [V(540)]),                         # a cantora de olhos fechados, na luz azul
    ('virada-oracao', 27, [V(460)]),                         # a mulher de óculos orando, de mãos juntas
    ('virada-kids', 9, [V(600)]),                            # a menina sorrindo na sala das crianças
    ('virada-gente', 12, [V(900)]),                          # o sorriso no meio da igreja
]

PEQUENA = {'v': (640, 800), 'h': (640, 427)}
# A qualidade do WebP. Os cortes de herói (l e p) saem a 80: comparados lado a
# lado com 84 e com o original, nas áreas lisas e escuras e nos rostos, não se
# vê diferença, e pesam um quinto a menos. O retrato e a faixa de dentro da
# página (v e h), que se olham de perto e sem escuro por cima, ficam em 84. As
# três fotos de grão forte (21, 25 e 27) pesavam de 230 a 290 kB a 84 no corte
# deitado; a 76 ficam em 150 a 180 kB, e o que se perde é grão.
Q = {'l': 80, 'p': 80, 'v': 84, 'h': 84}

def gravar(im, caminho, q):
    im.save(caminho, 'WEBP', quality=q, method=6)
    return os.path.getsize(caminho) / 1024

os.makedirs(SAIDA, exist_ok=True)
total = 0
for nome, num, cortes, *resto in FOTOS:
    if SO and nome not in SO:
        continue
    q_do_lugar = resto[0] if resto else None
    im = Image.open(os.path.join(ORIGEM, f'{num:02d}.png')).convert('RGB')
    assert im.size == (W, H), f'{num:02d}.png tem {im.size}, esperava {(W, H)}'
    for suf, (x0, y0, w, h) in cortes:
        assert 0 <= x0 and x0 + w <= W and 0 <= y0 and y0 + h <= H, f'{nome}-{suf}: janela fora da foto'
        c = im.crop((x0, y0, x0 + w, y0 + h))
        kb = gravar(c, os.path.join(SAIDA, f'{nome}-{suf}.webp'), q_do_lugar or Q[suf])
        total += kb
        linha = f'{nome}-{suf}.webp  foto {num:02d}  {w}x{h}  {kb:.0f} kB'
        if suf in PEQUENA:
            kb2 = gravar(c.resize(PEQUENA[suf], Image.LANCZOS), os.path.join(SAIDA, f'{nome}-s.webp'), 80)
            total += kb2
            linha += f'  + s {PEQUENA[suf][0]}x{PEQUENA[suf][1]} {kb2:.0f} kB'
        print(linha)
print(f'total: {total:.0f} kB')
