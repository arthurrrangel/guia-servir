#!/usr/bin/env python3
"""Corta as capturas de página inteira em telas e monta uma tira por página.

Uso: python3 scripts/tiras.py <pasta-com-png> <pasta-saida> [largura-da-tela=300]
Cada PNG vira <nome>-tira.jpg: as telas lado a lado, numeradas, com régua de
centro (linha fina no meio de cada tela) para conferir centralização a olho.
"""
import sys, os, glob
from PIL import Image, ImageDraw

ent = sys.argv[1]
sai = sys.argv[2]
LARG = int(sys.argv[3]) if len(sys.argv) > 3 else 300
os.makedirs(sai, exist_ok=True)
REGUA = os.environ.get('REGUA', '1') == '1'

for caminho in sorted(glob.glob(os.path.join(ent, '*.png'))):
    nome = os.path.splitext(os.path.basename(caminho))[0]
    im = Image.open(caminho).convert('RGB')
    w, h = im.size
    escala = LARG / w
    # altura de uma tela de celular (844 CSS) na escala da imagem
    dpr = round(w / 390)
    tela = int(844 * dpr)
    n = max(1, -(-h // tela))
    telas = []
    for i in range(n):
        y0 = i * tela
        y1 = min(h, y0 + tela)
        t = im.crop((0, y0, w, y1))
        if t.size[1] < tela:
            fundo = Image.new('RGB', (w, tela), (255, 255, 255))
            fundo.paste(t, (0, 0))
            t = fundo
        t = t.resize((LARG, int(tela * escala)), Image.LANCZOS)
        telas.append(t)
    th = telas[0].size[1]
    gap = 10
    tira = Image.new('RGB', (len(telas) * (LARG + gap) + gap, th + 26), (24, 24, 26))
    d = ImageDraw.Draw(tira)
    for i, t in enumerate(telas):
        x = gap + i * (LARG + gap)
        tira.paste(t, (x, 22))
        d.text((x + 4, 6), f'{nome} {i+1}/{len(telas)}', fill=(240, 240, 235))
        if REGUA:
            cx = x + LARG // 2
            for y in range(22, 22 + th, 14):
                d.line([(cx, y), (cx, y + 6)], fill=(233, 148, 47), width=1)
    tira.save(os.path.join(sai, f'{nome}-tira.jpg'), quality=86)
    print(f'{nome}: {n} telas, {w}x{h} -> {tira.size[0]}x{tira.size[1]}')
