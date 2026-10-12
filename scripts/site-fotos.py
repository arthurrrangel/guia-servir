#!/usr/bin/env python3
"""FOTOS DO SITE: recorta, trata e gera as versões web (12/10/2026)

Os originais chegam como posts do Instagram (1080x1350, com logo e texto
gravados por cima) e quadros dos vídeos (1276x718 e 720x1280). Este script
recorta SÓ a área de foto limpa de cada um, aplica um tratamento leve e igual
para todos (contraste suave, preto um pouco aberto, nitidez de redução) e
grava em public/site/:

  <nome>.webp     no tamanho do recorte (sem ampliar nunca)
  <nome>-s.webp   640 px de largura, para o celular (srcset)

Uso: python3 scripts/site-fotos.py <pasta-dos-posts> <pasta-dos-quadros> [saida]
A lista RECORTES é a fonte da verdade: (nome, arquivo, (x0, y0, x1, y1)).
Coordenadas no pixel do original. Para conferir, rode com FOLHA=1: monta
public/site/_folha.jpg com todos os recortes lado a lado (não vai pro ar).
"""
import os, sys
from PIL import Image, ImageEnhance, ImageFilter

POSTS = sys.argv[1]
QUADROS = sys.argv[2]
SAIDA = sys.argv[3] if len(sys.argv) > 3 else 'public/site'
os.makedirs(SAIDA, exist_ok=True)

P = lambda n: os.path.join(POSTS, n)
Q = lambda n: os.path.join(QUADROS, n)

RECORTES = [
    # ---------------------------------------------------------------- home
    ('home-heroi', Q('v1-maos.png'), None),                      # mãos levantadas, azul (desktop)
    ('home-heroi-r', Q('v2-cantor.png'), None),                  # cantor de braço erguido (celular)
    ('home-gente', P('b4b136f9-image.jpg'), (60, 0, 1040, 1225)),  # "É gente": mulher sorrindo no culto
    ('circulo-louvor', P('587b90fd-image.jpg'), (0, 95, 690, 785)),  # adoração de mão erguida
    ('circulo-familia', P('3b0e2d26-image.jpg'), (545, 30, 1080, 565)),  # camisa GUIA Church Family
    # -------------------------------------------------------------- servir
    ('servir-heroi', Q('v3-colete.png'), None),                  # voluntário de colete, na porta
    ('servir-heroi-r', Q('v2-porta534.png'), None),              # dois de colete embaixo do 534
    ('area-midia', Q('v3-camera.png'), None),
    ('area-midia-r', Q('v2-mesa.png'), None),                    # a mesa da transmissão
    ('area-louvor', Q('v1-cantora.png'), None),
    ('area-kids', Q('v1-menino.png'), None),
    ('area-kids-r', P('1d3a2b42-image.jpg'), (175, 330, 905, 1240)),
    ('area-servico', Q('v3-dois.png'), None),                    # dois voluntários acenando
    ('area-servico-r', P('3759b2ef-image.jpg'), (0, 100, 632, 845)),  # abraço na porta
    # -------------------------------------------------------------- cultos
    ('cultos-heroi', Q('v1-pregador.png'), None),
    ('cultos-heroi-r', P('f7f70184-image.jpg'), (200, 120, 1088, 1240)),
    ('momento-acolhida', Q('v3-acolhida.png'), (290, 0, 864, 718)),
    ('momento-louvor', Q('v2-cantor.png'), (0, 120, 720, 1020)),
    ('momento-palavra', Q('v2-pastor.png'), (0, 160, 720, 1060)),
    ('momento-oracao', P('12633d3e-image.jpg'), (40, 0, 1040, 1250)),
    # ---------------------------------------------------------- quem somos
    ('sobre-heroi', Q('v1-congregacao.png'), None),            # a igreja ouvindo (o abraço do palco tem letreiro atrás)
    ('sobre-heroi-r', P('3759b2ef-image.jpg'), (0, 100, 632, 845)),
    ('sobre-comunidade', P('ae8ddc32-image.jpg'), (0, 110, 1080, 700)),  # acima da frase gravada
    # ------------------------------------------- acessar e onde me encaixo
    ('encaixe-heroi', Q('v3-abraco.png'), None),                 # abraço na entrada
    ('eventos-heroi', Q('v1-cantora.png'), None),                # palco azul (o Follow é de fundo branco)
    # -------------------------------------------------------- pequena guia
    ('pg-heroi', P('0e7732ef-image.jpg'), (0, 715, 1080, 1350)),
    # ------------------------------------------------- eventos, oferta, fim
    ('follow', P('587b90fd-image.jpg'), (0, 95, 690, 612)),
    ('ofertar-heroi', P('12633d3e-image.jpg'), (0, 200, 1080, 840)),
    ('ofertar-heroi-r', P('12633d3e-image.jpg'), (40, 0, 1040, 1250)),
    ('fecho', P('f01a3843-image.jpg'), (0, 95, 1080, 780)),
    ('fecho-r', P('f01a3843-image.jpg'), (250, 95, 800, 780)),  # as duas cantoras, em pé
]


def tratar(im):
    """um tratamento só para todas: as fotos vêm de duas mãos (posts com
    película quente, vídeo com azul de cinema); um pouco de contraste e a
    saturação contida aproximam as duas sem apagar nenhuma"""
    im = ImageEnhance.Contrast(im).enhance(1.04)
    im = ImageEnhance.Color(im).enhance(0.94)
    return im


def gravar(im, caminho, largura=None):
    if largura and im.size[0] > largura:
        alt = round(im.size[1] * largura / im.size[0])
        im = im.resize((largura, alt), Image.LANCZOS)
        im = im.filter(ImageFilter.UnsharpMask(radius=0.8, percent=60, threshold=2))
    im.save(caminho, 'WEBP', quality=82, method=6)
    return im.size, os.path.getsize(caminho)


folha = []
for nome, origem, caixa in RECORTES:
    im = Image.open(origem).convert('RGB')
    if caixa:
        im = im.crop(caixa)
    im = tratar(im)
    (w, h), b = gravar(im, os.path.join(SAIDA, f'{nome}.webp'))
    if im.size[0] > 640:  # a pequena só existe quando é menor que a grande
        (ws, hs), bs = gravar(im, os.path.join(SAIDA, f'{nome}-s.webp'), 640)
        print(f'{nome:<18} {w}x{h} {b // 1024}KB   pequena {ws}x{hs} {bs // 1024}KB')
    else:
        print(f'{nome:<18} {w}x{h} {b // 1024}KB')
    folha.append((nome, im))

if os.environ.get('FOLHA'):
    from PIL import ImageDraw
    A = 300
    cols = 6
    linhas = -(-len(folha) // cols)
    F = Image.new('RGB', (cols * (A + 8) + 8, linhas * (A + 30) + 8), (22, 22, 24))
    d = ImageDraw.Draw(F)
    for k, (nome, im) in enumerate(folha):
        t = im.copy(); t.thumbnail((A, A))
        x = 8 + (k % cols) * (A + 8); y = 8 + (k // cols) * (A + 30)
        F.paste(t, (x + (A - t.size[0]) // 2, y + 22))
        d.text((x, y + 4), f'{nome} {im.size[0]}x{im.size[1]}', fill=(240, 180, 90))
    F.save(os.path.join(SAIDA, '_folha.jpg'), quality=86)
    print('folha:', os.path.join(SAIDA, '_folha.jpg'))
