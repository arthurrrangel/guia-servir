"""OS CORTES DO CELULAR · 16/09/2026

Gera, a partir das fotos de public/fotos/, os cortes verticais 4:5 que o site
usa em telas até 899px (public/fotos/m/), em WebP e AVIF. A pessoa fica no
centro: (cx, cy) é o ponto de interesse em fração da largura e da altura.

Por que à mão e não `object-fit`: o navegador corta a foto horizontal quase
quadrada e o assunto, que está num terço da imagem, vira metade de um ombro.
Um corte feito olhando a foto mantém o rosto.

Quando uma foto nova entrar, acrescente a linha e rode:
    python3 scripts/cortes-celular.py
"""
from PIL import Image, ImageFilter
import os

RAIZ = os.path.join(os.path.dirname(__file__), '..', 'public', 'fotos')
os.makedirs(os.path.join(RAIZ, 'm'), exist_ok=True)

CORTES = [
    # (origem, destino, cx, cy)
    ('congregacao.webp', 'heroi',    0.62, 0.50),
    ('midia.webp',       'midia',    0.30, 0.50),
    ('equipe.webp',      'louvor',   0.50, 0.50),
    ('kids-2.webp',      'kids',     0.42, 0.50),
    ('recepcao.webp',    'servico',  0.58, 0.50),
    ('livraria.webp',    'livraria', 0.50, 0.50),
]

def corte45(src, dst, cx, cy, minw=720):
    im = Image.open(src).convert('RGB'); W, H = im.size
    w = min(W, int(H * 4 / 5)); h = int(w * 5 / 4)
    if h > H:
        h = H; w = int(H * 4 / 5)
    x0 = min(max(0, int(cx * W - w / 2)), W - w); y0 = min(max(0, int(cy * H - h / 2)), H - h)
    c = im.crop((x0, y0, x0 + w, y0 + h))
    escala = 1.0
    if c.width < minw:   # foto pequena: sobe até 720 e devolve um pouco de nitidez
        escala = minw / c.width
        c = c.resize((minw, int(c.height * escala)), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.1, percent=55, threshold=2))
    c.save(dst + '.webp', quality=82, method=6)
    c.save(dst + '.avif', quality=62, speed=4)
    print(f"{os.path.basename(dst):10} {c.size} escala {escala:.2f}")

if __name__ == '__main__':
    for origem, destino, cx, cy in CORTES:
        corte45(os.path.join(RAIZ, origem), os.path.join(RAIZ, 'm', destino), cx, cy)
    # o herói horizontal também em AVIF
    Image.open(os.path.join(RAIZ, 'congregacao.webp')).convert('RGB').save(os.path.join(RAIZ, 'congregacao.avif'), quality=62, speed=4)
