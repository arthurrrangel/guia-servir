#!/usr/bin/env python3
"""FOTOS DO SITE: recorta, trata e gera as versões web (12/10/2026)

20/10/2026: dos recortes daqui só a fachada (chegar-heroi e chegar-heroi-r)
continua no ar; os outros heróis passaram para as fotos do acervo do
fotógrafo (scripts/site-fotos-drive.py) e os arquivos saíram de public/site.
A lista fica como registro de onde cada recorte veio.

Os originais chegam como posts do Instagram (1080x1350, com logo e texto
gravados por cima) e quadros dos vídeos (1276x718 e 720x1280). Este script
recorta SÓ a área de foto limpa de cada um, aplica um tratamento leve e igual
para todos (contraste suave, preto um pouco aberto, nitidez de redução) e
grava em public/site/:

  <nome>.webp     no tamanho do recorte (sem ampliar nunca)
  <nome>-s.webp   640 px de largura, para o celular (srcset)

Uso: python3 scripts/site-fotos.py <pasta-dos-posts> <pasta-dos-quadros> [saida]
(SO=nome1,nome2 gera só esses recortes)
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
    ('area-midia', Q('v3-camera.png'), None),
    ('area-midia-r', Q('v3-camera3.png'), (600, 0, 1004, 718)),  # a câmera no tripé com o monitor aceso, no terço de cima (era a mesa: metade de cima era parede escura)
    ('area-louvor', Q('v1-cantora.png'), None),
    ('area-kids', Q('v1-menino.png'), None),
    ('area-kids-r', P('1d3a2b42-image.jpg'), (175, 330, 905, 1240)),
    ('area-servico', Q('v3-dois.png'), None),                    # dois voluntários acenando
    ('area-servico-r', P('3759b2ef-image.jpg'), (0, 100, 632, 845)),  # abraço na porta
    # -------------------------------------------------------------- cultos
    ('cultos-heroi', Q('v1-pregador.png'), None),
    ('cultos-heroi-r', P('f7f70184-image.jpg'), (200, 120, 1088, 1240)),
    ('momento-acolhida', Q('v3-acolhida.png'), (290, 0, 864, 718)),
    ('momento-palavra', Q('v2-pastor.png'), (0, 160, 720, 1060)),
    ('momento-oracao', P('12633d3e-image.jpg'), (40, 0, 1040, 1250)),
    # ---------------------------------------------------------- quem somos
    ('sobre-heroi', Q('v1-congregacao.png'), None),            # a igreja ouvindo (o abraço do palco tem letreiro atrás)
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
    # ------------------------------------------- 12/10/2026 (noite): o olho de designer
    # cada página com foto própria; no celular o rosto no terço de cima do herói
    ('servir-heroi-r', Q('v2-porta534.png'), (0, 200, 720, 1280)),  # sem o 534 borrado; rostos a 23%
    ('servir-circulo-1', P('bc48832e-image.jpg'), (190, 0, 900, 710)),  # o louvor no palco
    ('servir-circulo-2', Q('v3-colete.png'), (234, 0, 952, 718)),   # o voluntário de colete GUIA
    ('area-servico-r2', Q('v3-dois.png'), (338, 0, 742, 718)),     # Connect no celular: os dois de colete
    ('momento-louvor', Q('v1-cantora.png'), (100, 0, 674, 718)),    # o louvor da home (o cantor já é o herói)
    ('sobre-heroi-r', P('1d3a2b42-image.jpg'), (0, 322, 760, 1350), {'texto': [(1260, 1320, 380, 660)]}),  # líder e crianças rindo
    ('eventos-heroi-r', P('bc48832e-image.jpg'), (196, 0, 868, 1344), {'texto': [(1225, 1290, 420, 700)]}),
    ('encaixe-heroi-r', P('52c436d0-image.jpg'), (160, 95, 960, 1350), {'texto': [(580, 810, 160, 960), (1215, 1280, 560, 960)]}),  # sem a frase gravada
    ('follow-palco', P('ea30d322-image.jpg'), (0, 40, 1080, 620)),   # o palco do Follow, acima da frase gravada
    ('chegar-heroi', P('0a9e5a6e-image.jpg'), None, {'max': 1920}),  # a fachada em alta (era 740 px)
    ('chegar-heroi-r', P('0a9e5a6e-image.jpg'), (1000, 560, 1720, 1732)),  # a placa redonda a 1/3 da altura (era só palmeira e céu)
    ('fecho-maos-r', Q('v2-olhar.png'), None),                      # mãos levantadas no escuro (fecho no celular)
    ('acessar-heroi-r', Q('v2-mesa.png'), (0, 300, 720, 1280)),     # a mesa sem a parede escura de cima: os monitores sobem para o terço de cima
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


def escurecer(im, y0, rampa=80, nivel=0.12):
    """do y0 (no pixel do original) para baixo a foto fica quase preta: é a
    área que o herói do celular cobre com o escuro do texto. Serve para a
    frase gravada no post não aparecer como fantasma atrás do título."""
    from PIL import ImageChops
    w, h = im.size
    m = Image.new('L', (w, h), 255)
    d = ImageDraw.Draw(m)
    for y in range(h):
        if y >= y0 + rampa: v = nivel
        elif y >= y0: v = 1 - (1 - nivel) * (y - y0) / rampa
        else: continue
        d.line([(0, y), (w, y)], fill=round(255 * v))
    return Image.composite(im, Image.new('RGB', (w, h), (10, 10, 12)), m)


def sem_texto(im, faixas):
    """apaga letra branca gravada no post (a frase, a assinatura): dentro de
    cada caixa (y0, y1, x0, x1, no pixel do recorte) o que é quase branco
    vira máscara, cresce 4 px e o OpenCV preenche com o que está em volta"""
    import cv2, numpy as np
    a = np.array(im)
    m = np.zeros(a.shape[:2], np.uint8)
    for y0, y1, x0, x1 in faixas:
        y0, y1 = max(0, y0), min(a.shape[0], y1)
        x0, x1 = max(0, x0), min(a.shape[1], x1)
        faixa = a[y0:y1, x0:x1]
        m[y0:y1, x0:x1] = ((faixa.min(axis=2) > 150) * 255).astype(np.uint8)
    m = cv2.dilate(m, np.ones((9, 9), np.uint8))
    return Image.fromarray(cv2.inpaint(a, m, 7, cv2.INPAINT_TELEA))


from PIL import ImageDraw
folha = []
# SO=nome1,nome2 gera só esses (as outras fotos ficam como estão)
SO = set(filter(None, os.environ.get('SO', '').split(',')))
for item in RECORTES:
    nome, origem, caixa = item[:3]
    if SO and nome not in SO:
        continue
    opc = item[3] if len(item) > 3 else {}
    im = Image.open(origem).convert('RGB')
    if caixa:
        im = im.crop(caixa)
    if 'texto' in opc:
        dy = caixa[1] if caixa else 0
        dx = caixa[0] if caixa else 0
        im = sem_texto(im, [(a - dy, b - dy, c - dx, d - dx) for a, b, c, d in opc['texto']])
    if 'escuro' in opc:
        im = escurecer(im, opc['escuro'] - (caixa[1] if caixa else 0))
    if 'max' in opc and im.size[0] > opc['max']:
        alt = round(im.size[1] * opc['max'] / im.size[0])
        im = im.resize((opc['max'], alt), Image.LANCZOS)
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
