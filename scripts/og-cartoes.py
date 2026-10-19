"""OS CARTÕES DE PRÉVIA (Open Graph) NA IDENTIDADE NOVA — 11/10/2026

Até aqui os cartões das páginas públicas (o que o WhatsApp e o Instagram
mostram quando alguém cola o link) eram só a foto com a marca em cima. O da
/servir já tinha a identidade do ApresentaSite.pdf: chapéu laranja, título em
duas vozes (Inter 800 + Instrument Serif itálica com ponto) e uma linha de
apoio. Este script gera todos os outros no mesmo desenho, a partir das fotos
de public/fotos e das fontes de public/tipos (as mesmas do site).

Uso: python3 scripts/og-cartoes.py        (grava public/og*.jpg, 1200×630)
     python3 scripts/og-cartoes.py og.jpg   (só os cartões citados)
Precisa de Pillow e fontTools (com brotli, para ler woff2).

19/10/2026: a copy final tirou o "Cultivando uma nova cultura" das páginas
(og.jpg e og-sobre.jpg ganharam os títulos novos), e o /acessar mudou para o
Guia Servir: o cartão dele leva guiaservir.com no canto, não guiachurch.com.
Mais tarde, no mesmo dia: og-servir.jpg passou a sair daqui (título próprio
do Servir) e nasceu og-sistema.jpg, o cartão dos links do sistema.
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
import io, os, sys

RAIZ = os.path.join(os.path.dirname(__file__), '..')
FOTOS = os.path.join(RAIZ, 'public', 'fotos')
TIPOS = os.path.join(RAIZ, 'public', 'tipos')
SAIDA = os.path.join(RAIZ, 'public')
W, H = 1200, 630
OURO = (240, 164, 60)

def fonte_ttf(caminho_woff2, peso=None):
    f = TTFont(caminho_woff2)
    if peso is not None and 'fvar' in f:
        f = instancer.instantiateVariableFont(f, {'wght': peso})
    f.flavor = None
    b = io.BytesIO(); f.save(b); b.seek(0)
    return b.getvalue()

INTER = fonte_ttf(os.path.join(TIPOS, 'inter.woff2'), 800)
INTER_600 = fonte_ttf(os.path.join(TIPOS, 'inter.woff2'), 600)
SERIF = fonte_ttf(os.path.join(TIPOS, 'instrument-serif-italic.woff2'))

def F(dados, tam):
    return ImageFont.truetype(io.BytesIO(dados), tam)

def foto(nome, foco=(0.5, 0.5)):
    im = Image.open(os.path.join(FOTOS, nome)).convert('RGB')
    # cobre 1200×630 como object-fit: cover, com o foco
    r = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x = round((im.width - W) * foco[0]); y = round((im.height - H) * foco[1])
    im = im.crop((x, y, x + W, y + H))
    # saturação um pouco abaixo, como no site (filter: saturate(.86))
    cinza = im.convert('L').convert('RGB')
    im = Image.blend(cinza, im, 0.86)
    # véu: pesado à esquerda e embaixo, como o herói
    veu = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(veu)
    for i in range(W):
        a = int(200 * (1 - i / W) ** 1.1 + 40)
        d.line([(i, 0), (i, H)], fill=(8, 8, 10, min(230, a)))
    base = Image.new('RGBA', (W, H)); base.paste(im)
    base = Image.alpha_composite(base, veu)
    veu2 = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d2 = ImageDraw.Draw(veu2)
    for j in range(H):
        a = int(150 * max(0, (j - H * 0.45) / (H * 0.55)) ** 1.2)
        d2.line([(0, j), (W, j)], fill=(8, 8, 10, a))
    return Image.alpha_composite(base, veu2).convert('RGB')

def marca(im, txt='guiachurch.com'):
    """o domínio do site no canto de baixo à direita, em branco"""
    d = ImageDraw.Draw(im)
    f = F(INTER_600, 22)
    w = d.textlength(txt, font=f)
    d.text((W - 64 - w, H - 64 - 22), txt, font=f, fill=(255, 255, 255, 230))

def titulo(d, linhas, y, tam, x=64, cor=(255, 255, 255)):
    """linhas: lista de (texto, italico). A última palavra itálica ganha o ponto."""
    fi = F(INTER, tam); fs = F(SERIF, round(tam * 1.06))
    lh = round(tam * 0.96)
    for linha in linhas:
        cx = x
        for pal, it in linha:
            f = fs if it else fi
            d.text((cx, y), pal, font=f, fill=cor)
            cx += d.textlength(pal, font=f) + d.textlength(' ', font=fi) * 0.9
        y += lh
    return y

SO = set(sys.argv[1:])

def cartao(nome_saida, arquivo_foto, chapeu, linhas, apoio, foco=(0.5, 0.5), tam=92, dominio='guiachurch.com'):
    if SO and nome_saida not in SO:
        return
    im = foto(arquivo_foto, foco)
    d = ImageDraw.Draw(im)
    n = len(linhas)
    alt_tit = round(tam * 0.96) * n
    y0 = H - 64 - 40 - 30 - alt_tit - 36 - 24 - round(tam * 0.3)
    d.text((64, y0), chapeu, font=F(INTER_600, 24), fill=OURO)
    y = titulo(d, linhas, y0 + 24 + 20, tam)
    d.text((64, y + round(tam * 0.34)), apoio, font=F(INTER_600, 27), fill=(255, 255, 255))
    marca(im, dominio)
    im.save(os.path.join(SAIDA, nome_saida), 'JPEG', quality=86, optimize=True, progressive=True)
    print(nome_saida)

P = lambda s: [(w, False) for w in s.split(' ')]
IT = lambda s: [(s, True)]

cartao('og.jpg', 'pregacao.webp', 'GUIA Church · Barra da Tijuca',
       [P('Existe um lugar'), IT('para você.')],
       'Domingos às 10h · Follow aos sábados às 19h', foco=(0.6, 0.3))
cartao('og-cultos.jpg', 'louvor-pb.webp', 'Cultos · Domingo, 10h',
       [P('Um domingo'), P('para') + IT('pertencer.')],
       'Rua Pedra de Itaúna, 534 · Barra da Tijuca', foco=(0.5, 0.25))
cartao('og-como-chegar.jpg', 'predio.webp', 'Onde fica',
       [P('Como') + IT('chegar.')],
       'Rua Pedra de Itaúna, 534 · Barra da Tijuca, Rio de Janeiro', foco=(0.5, 0.4))
cartao('og-sobre.jpg', 'abraco-palco.webp', 'Quem somos',
       [P('Uma igreja que parece'), P('com a vida') + IT('de quem chega.')],
       'Grupo Unido, Interagindo e Avançando', foco=(0.5, 0.3), tam=76)
cartao('og-pequena-guia.jpg', 'acolhida.webp', 'Pequena Guia',
       [P('Relacionamentos'), P('que fortalecem sua') + IT('fé.')],
       'Grupos durante a semana, perto de você', foco=(0.5, 0.4), tam=80)
# 19/10/2026: o Guia Servir com o título próprio (deixou de repetir o
# "Existe um lugar para você" da igreja) e o cartão do sistema, para os links
# que circulam nos grupos (confirmar, seus dias, cheguei, cadastro, /eu):
# antes eles saíam com o cartão da igreja. Os dois levam guiaservir.com.
cartao('og-servir.jpg', 'fachada.webp', 'Servir · GUIA Church',
       [P('Encontre o seu lugar'), IT('pra servir.')],
       'Deus semeou dons em cada pessoa. O seu também tem um posto esperando.',
       foco=(0.5, 0.45), tam=84, dominio='guiaservir.com')
cartao('og-sistema.jpg', 'equipe.webp', 'Voluntários da GUIA Church',
       [P('GUIA') + IT('Servir.')],
       'Escalas, confirmações e avisos de quem serve',
       foco=(0.5, 0.4), dominio='guiaservir.com')
cartao('og-acessar.jpg', 'midia.webp', 'Acesso às equipes',
       [P('Quem é') + IT('você?')],
       'Sou voluntário · Sou da organização · Quero participar', foco=(0.5, 0.5), dominio='guiaservir.com')
