#!/usr/bin/env python3
"""
AS FOTOS DE DOMINGO DO DRIVE NOS TRÊS SITES · 20/10/2026

O acervo do fotógrafo da igreja (Drive MKT/CULTOS/2026, pastas EDITADAS e
FOTOS de cada culto) é o material de verdade dos sites; nada gerado. De cada
foto entram dois arquivos: o original em tamanho máximo (4272x2848, o que o
lh3 devolve) e a versão tratada pelo fotógrafo (2048 px). O tratamento passa
para o arquivo grande por casamento de histograma canal a canal, e o corte
sai nas proporções que cada lugar do site pede, centrado no ponto de
interesse da foto. Irmão de scripts/follow-fotos.py (o Guia Follow).

  scripts/site-fotos-drive.py <pasta com bruto/ e orig/>   → public/site/<nome>-<l|p|h|v|s>.webp

Sufixos: l = 1920x1080 (herói, computador), p = 1080x1920 (herói, celular),
h = 1800x1200 (faixa 3:2), v = 1000x1250 (retrato 4:5), s = versão pequena
(640 px de largura) do h ou do v. O código (1503-64) é o da folha de contato
do Drive (culto 15.03, 64ª editada).
"""
import os, sys, glob
import numpy as np
from PIL import Image, ImageOps
from skimage.exposure import match_histograms

BASE = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'site')
os.makedirs(OUT, exist_ok=True)

TAM = {'l': (1920, 1080), 'p': (1080, 1920), 'h': (1800, 1200), 'v': (1000, 1250)}

# nome do arquivo, código no Drive, foco (x, y) em fração da foto, saídas
# (o foco em x vale para os cortes em pé, o foco em y para os deitados)
FOTOS = [
    # o herói da home do Guia Church: a chegada, em cinco fotos
    ('home-1', '1503-64', (0.42, 0.55), 'lp'),   # a chegada no muro do GUI>, de manhã
    ('home-2', '1503-58', (0.50, 0.42), 'lp'),   # o abraço na porta
    ('home-3', '1503-60', (0.33, 0.42), 'lp'),   # pai, filho e a risada
    ('home-4', '1005-15', (0.52, 0.42), 'lp'),   # a igreja adorando, de olhos fechados
    ('home-5', '1503-41', (0.38, 0.50), 'lp'),   # o pastor diante da igreja
    # "a igreja não é o prédio": a porta, a sala das crianças, o violão
    ('gente-porta', '1503-57', (0.46, 0.42), 'vs'),
    ('gente-kids', '0803-14', (0.48, 0.45), 'vs'),
    ('gente-violao', '1503-05', (0.50, 0.40), 'vs', 72),  # foto com grão de ISO alto: q72 segura o peso
    # o fecho da home e o convite: a igreja de pé, mãos abertas
    ('fecho-igreja', '1005-16', (0.50, 0.50), 'lp'),
    # /cultos: um domingo em quatro momentos (o herói anda sobre eles) e o pouso
    ('cultos-1', '1503-56', (0.42, 0.45), 'lp'),   # acolhida: a porta, o sorriso
    ('cultos-2', '1005-13', (0.55, 0.42), 'lp'),   # louvor: a igreja adora junto
    ('cultos-3', '0706-07', (0.45, 0.42), 'lp'),   # palavra: a mensagem
    ('cultos-4', '1406-15', (0.45, 0.45), 'lp'),   # oração: uns pelos outros
    ('cultos-5', '1503-43', (0.55, 0.42), 'lp'),   # o pouso: um domingo para pertencer
    # as outras páginas da igreja
    ('sobre-heroi', '1503-65', (0.64, 0.50), 'lp'),    # cinco mulheres no muro do GUI>, de manhã
    ('sobre-geracoes', '1503-52', (0.45, 0.45), 'hs'), # três gerações na porta
    ('eventos-heroi', '3105-04', (0.50, 0.42), 'lp'),  # o louvor, braços abertos
    ('pg-heroi', '3105-20', (0.45, 0.45), 'lp'),       # uma família na calçada
    ('ofertar-heroi', '0706-04', (0.55, 0.50), 'lp'),  # o cálice da ceia
    # o Guia Servir: quem serve
    ('servir-1', '1503-09', (0.55, 0.45), 'lp'),       # o Connect recebe na porta
    ('servir-2', '0803-10', (0.55, 0.45), 'lp'),       # o Kids, com o bebê no colo
    ('servir-3', '1503-16', (0.55, 0.45), 'lp'),       # o Louvor no palco
    ('servir-4', '0706-14', (0.50, 0.45), 'lp'),       # dois meninos do Kids
    ('servir-5', '1503-08', (0.55, 0.45), 'lp'),       # o abraço na recepção
    ('area-louvor', '3105-01', (0.45, 0.45), 'vs'),
    ('area-kids', '0803-10', (0.55, 0.45), 'vs'),
    ('area-connect', '1503-09', (0.55, 0.45), 'vs'),
    ('servir-adora', '1406-15', (0.50, 0.45), 'hs'),   # "Deus se alegra com o seu servir"
    ('servir-equipe', '1503-56', (0.50, 0.45), 'hs'),  # a equipe de preto na porta
]

def achar(pasta, codigo):
    m = glob.glob(os.path.join(BASE, pasta, f'{codigo}-*'))
    if not m:
        sys.exit(f'faltou {codigo} em {pasta}')
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

so = sys.argv[2:]  # opcional: só estes nomes
for nome, codigo, foco, saidas, *resto in FOTOS:
    q = resto[0] if resto else 82
    if so and nome not in so:
        continue
    bruto = ImageOps.exif_transpose(Image.open(achar('bruto', codigo))).convert('RGB')
    edit = ImageOps.exif_transpose(Image.open(achar('orig', codigo))).convert('RGB')
    if bruto.size[0] * bruto.size[1] <= edit.size[0] * edit.size[1] * 1.05:
        im = edit                       # a editada já é a resolução cheia
    else:
        graded = match_histograms(np.asarray(bruto), np.asarray(edit), channel_axis=-1)
        im = Image.fromarray(np.clip(graded, 0, 255).astype('uint8'))
    for o in saidas:
        if o == 's':
            continue
        w, h = TAM[o]
        c = cortar(im, w, h, foco)
        p = os.path.join(OUT, f'{nome}-{o}.webp')
        c.save(p, 'WEBP', quality=q, method=6)
        print(f'{nome}-{o}.webp  {w}x{h}  {os.path.getsize(p)//1024} KB')
        if 's' in saidas and o in 'hv':
            sw = 640; sh = int(round(h * sw / w))
            ps = os.path.join(OUT, f'{nome}-s.webp')
            c.resize((sw, sh), Image.LANCZOS).save(ps, 'WEBP', quality=80, method=6)
            print(f'{nome}-s.webp  {sw}x{sh}  {os.path.getsize(ps)//1024} KB')
