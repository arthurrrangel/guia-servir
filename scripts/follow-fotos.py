#!/usr/bin/env python3
"""
AS FOTOS DO HERO DO GUIA FOLLOW · 20/10/2026

O hero do guiafollow.com anda com o scroll sobre cinco fotos de verdade do
Follow (fotógrafo da igreja, Drive MKT/CULTOS/2026, pastas "07.02 - FOLLOW"
e "28.02 - FOLLOW"). Nada gerado: o Arthur reprovou vídeo de IA em 20/10.

De cada foto entram dois arquivos: o RAW revelado pelo Google (4272x2848, o
que o lh3 devolve para o .CR2 da pasta FOTOS) e a versão editada pelo
fotógrafo (2048 px, pasta EDITADAS). O tratamento do fotógrafo é transferido
para o arquivo grande por casamento de histograma canal a canal, e o corte
sai em duas orientações: 1920x1080 (computador) e 1080x1920 (celular),
cada um centrado no ponto de interesse da foto. WebP q82.

  scripts/follow-fotos.py <pasta com bruto/ e orig/>   → public/follow/f1-l.webp … f5-p.webp

Ordem e papel de cada foto no scroll (ver components/site/Scrub.tsx e a página):
  f1  _MG_7665  sofás, conversa                    "Vem como você está."
  f2  _MG_7669  três na porta, rindo               (a gente te espera na porta)
  f3  _MG_8167  adoração, mãos levantadas          "Jesus no centro."
  f4  _MG_8156  braços abertos diante do GUI>      "Uma família em volta."
  f5  _MG_8177  a sala inteira                     "Um lugar para todos."
"""
import os, sys, glob
import numpy as np
from PIL import Image, ImageOps
from skimage.exposure import match_histograms

BASE = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'follow')
os.makedirs(OUT, exist_ok=True)

# nome do RAW, nome da editada, foco (x, y) em fração: deitado usa o y, em pé usa o x
FOTOS = [
    ('f1', '_MG_7665', '0702-01', (0.50, 0.52)),
    ('f2', '_MG_7669', '0702-03', (0.60, 0.42)),
    ('f3', '_MG_8167', '2802-10', (0.70, 0.45)),
    ('f4', '_MG_8156', '2802-04', (0.50, 0.42)),
    ('f5', '_MG_8177', '2802-13', (0.55, 0.52)),
]

def achar(pasta, chave):
    m = glob.glob(os.path.join(BASE, pasta, f'*{chave}*'))
    if not m:
        sys.exit(f'faltou {chave} em {pasta}')
    return m[0]

def cortar(im, w, h, foco):
    """corte centrado no foco, na proporção w:h, sem esticar"""
    W, H = im.size
    r = w / h
    if W / H > r:   # mais largo que o alvo: corta nas laterais
        cw, ch = int(round(H * r)), H
        x0 = int(round(foco[0] * W - cw / 2)); x0 = max(0, min(W - cw, x0)); y0 = 0
    else:           # mais alto: corta em cima e embaixo
        cw, ch = W, int(round(W / r))
        y0 = int(round(foco[1] * H - ch / 2)); y0 = max(0, min(H - ch, y0)); x0 = 0
    return im.crop((x0, y0, x0 + cw, y0 + ch)).resize((w, h), Image.LANCZOS)

for nome, raw, ed, foco in FOTOS:
    bruto = ImageOps.exif_transpose(Image.open(achar('bruto', raw))).convert('RGB')
    edit = ImageOps.exif_transpose(Image.open(achar('orig', ed))).convert('RGB')
    # o tratamento do fotógrafo (cor, contraste) passa para o arquivo grande
    ref = np.asarray(edit)
    src = np.asarray(bruto)
    graded = match_histograms(src, ref, channel_axis=-1)
    im = Image.fromarray(np.clip(graded, 0, 255).astype('uint8'))
    for o, (w, h) in (('l', (1920, 1080)), ('p', (1080, 1920))):
        c = cortar(im, w, h, foco)
        p = os.path.join(OUT, f'{nome}-{o}.webp')
        c.save(p, 'WEBP', quality=82, method=6)
        print(f'{nome}-{o}.webp  {w}x{h}  {os.path.getsize(p)//1024} KB')
