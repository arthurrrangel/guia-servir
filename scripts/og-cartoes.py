"""OS CARTÕES DE PRÉVIA (Open Graph) NA IDENTIDADE NOVA — 11/10/2026

Até aqui os cartões das páginas públicas (o que o WhatsApp e o Instagram
mostram quando alguém cola o link) eram só a foto com a marca em cima. O da
/servir já tinha a identidade do ApresentaSite.pdf: chapéu laranja, título em
duas vozes (Inter 800 + Instrument Serif itálica com ponto) e uma linha de
apoio. Este script gera todos os outros no mesmo desenho, a partir das fotos
dos heróis em public/site (20/10/2026; antes, public/fotos) e das fontes de
public/tipos (as mesmas do site).

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
    im = Image.open(nome if os.path.isabs(nome) else os.path.join(FOTOS, nome)).convert('RGB')
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

def quebra(d, texto, f, largura):
    """a linha de apoio em até duas linhas, quebrando por palavra"""
    linhas, atual = [], ''
    for pal in texto.split(' '):
        tent = (atual + ' ' + pal).strip()
        if d.textlength(tent, font=f) <= largura or not atual:
            atual = tent
        else:
            linhas.append(atual); atual = pal
    linhas.append(atual)
    return linhas

def cartao(nome_saida, arquivo_foto, chapeu, linhas, apoio, foco=(0.5, 0.5), tam=92, dominio='guiachurch.com', cor_chapeu=OURO):
    if SO and nome_saida not in SO:
        return
    im = foto(arquivo_foto, foco)
    d = ImageDraw.Draw(im)
    n = len(linhas)
    f_apoio = F(INTER_600, 27)
    apoios = quebra(d, apoio, f_apoio, W - 64 - 300)
    alt_tit = round(tam * 0.96) * n
    y0 = H - 64 - 40 - 30 - alt_tit - 36 - 24 - round(tam * 0.3) - 34 * (len(apoios) - 1)
    d.text((64, y0), chapeu, font=F(INTER_600, 24), fill=cor_chapeu)
    y = titulo(d, linhas, y0 + 24 + 20, tam)
    for k, l in enumerate(apoios):
        d.text((64, y + round(tam * 0.34) + 34 * k), l, font=f_apoio, fill=(255, 255, 255))
    marca(im, dominio)
    im.save(os.path.join(SAIDA, nome_saida), 'JPEG', quality=86, optimize=True, progressive=True)
    print(nome_saida)

P = lambda s: [(w, False) for w in s.split(' ')]
IT = lambda s: [(s, True)]

# 20/10/2026: os cartões saem das fotos do acervo do fotógrafo, as mesmas dos
# heróis (public/site, scripts/site-fotos-drive.py), e cada página pública
# tem o seu: a prévia no WhatsApp mostra a mesma foto que a página abre.
# Só o og-sistema.jpg (os links do sistema) segue com a foto da equipe em
# public/fotos.
SITE = os.path.join(RAIZ, 'public', 'site')
def S(nome): return os.path.join(SITE, nome)

cartao('og.jpg', S('home-1-l.webp'), 'GUIA Church · Barra da Tijuca',
       [P('Existe um lugar'), IT('para você.')],
       'Domingos às 10h · Follow aos sábados às 19h', foco=(0.42, 0.55))
cartao('og-cultos.jpg', S('cultos-5-l.webp'), 'Cultos · Domingo, 10h',
       [P('Um domingo'), P('para') + IT('pertencer.')],
       'Rua Pedra de Itaúna, 534 · Barra da Tijuca', foco=(0.55, 0.42))
cartao('og-como-chegar.jpg', S('chegar-heroi.webp'), 'Onde fica',
       [P('Como') + IT('chegar.')],
       'Rua Pedra de Itaúna, 534 · Barra da Tijuca, Rio de Janeiro', foco=(0.55, 0.55))
cartao('og-sobre.jpg', S('sobre-heroi-l.webp'), 'Quem somos',
       [P('Uma igreja que parece'), P('com a vida') + IT('de quem chega.')],
       'Grupo Unido, Interagindo e Avançando', foco=(0.64, 0.5), tam=76)
cartao('og-eventos.jpg', S('eventos-heroi-l.webp'), 'Eventos · GUIA Church',
       [P('O que acontece'), IT('na semana.')],
       'Domingo é o centro. Mas a vida da igreja não cabe num dia só.', foco=(0.5, 0.42))
cartao('og-pequena-guia.jpg', S('pg-heroi-l.webp'), 'Pequena Guia',
       [P('Relacionamentos'), P('que fortalecem') + IT('sua fé.')],
       'Grupos durante a semana, perto de você', foco=(0.45, 0.45), tam=80)
cartao('og-ofertar.jpg', S('ofertar-heroi-l.webp'), 'Doação · Dízimos e ofertas',
       [P('Ofertar é') + IT('adorar.')],
       'Leva menos de um minuto, e você decide o valor.', foco=(0.55, 0.5))
# o Guia Servir (guiaservir.com): a LP, as cinco áreas, o encaixo e o acesso
cartao('og-servir.jpg', S('servir-pouso-l.webp'), 'Servir · GUIA Church',
       [P('Encontre o seu lugar'), IT('pra servir.')],
       'Deus semeou dons em cada pessoa. O seu também tem um posto esperando.',
       foco=(0.5, 0.48), tam=84, dominio='guiaservir.com')
# a frase de cada área e a primeira frase do texto dela (lib/site/areas.ts, ao pé da letra)
AREAS = [
    ('midia', 'servir-midia-l.webp', 'Mídia', [P('Faça a mensagem'), IT('chegar longe.')], 'Da letra no telão à foto que alcança quem ainda não conhece a casa, passando pela transmissão pra quem acompanha de longe.'),
    ('louvor', 'servir-louvor-l.webp', 'Louvor', [P('Conduza a igreja'), P('à presença') + IT('de Deus.')], 'Do dirigente ao som, cada posto sustenta o ambiente pra que alguém tenha um encontro verdadeiro com o Pai.'),
    ('kids', 'servir-kids-l.webp', 'GUIA Kids', [P('Plante fé'), IT('desde pequeno.')], 'Do berçário à turma de 8 a 12 anos, cada sala precisa de duas voluntárias por culto: uma conduz, outra apoia.'),
    ('servico', 'servir-connect-l.webp', 'Connect', [P('Receba cada pessoa'), IT('como família.')], 'É a maior equipe da igreja, e não por acaso: recepção, estacionamento, visitantes, segurança, cozinha, setor.'),
    ('livraria', 'servir-livraria-l.webp', 'Livraria', [P('Leve o culto'), IT('pra fora dele.')], 'Duas pessoas por domingo: uma abre antes do culto, as duas atendem na saída.'),
]
for slug, arq, nome, linhas, apoio in AREAS:
    cartao(f'og-servir-{slug}.jpg', S(arq), f'Servir · {nome}', linhas, apoio, foco=(0.5, 0.45), tam=84, dominio='guiaservir.com')
cartao('og-encaixo.jpg', S('v/encaixe-l.webp'), 'Servir · GUIA Church',
       [P('Não sei onde'), P('me') + IT('encaixo.')],
       'É a resposta mais comum. E tem um caminho: três dúvidas, cinco áreas e uma conversa.', foco=(0.5, 0.45), dominio='guiaservir.com')
cartao('og-sistema.jpg', 'equipe.webp', 'Voluntários da GUIA Church',
       [P('GUIA') + IT('Servir.')],
       'Escalas, confirmações e avisos de quem serve',
       foco=(0.5, 0.4), dominio='guiaservir.com')
cartao('og-acessar.jpg', S('servir-midia-l.webp'), 'Acesso às equipes',
       [P('Quem é') + IT('você?')],
       'Sou voluntário · Sou da organização · Quero participar', foco=(0.5, 0.5), dominio='guiaservir.com')

# 20/10/2026: o cartão do guiafollow.com, no mesmo desenho da família, com a
# foto do Follow (public/follow, scripts/follow-fotos.py) e o chapéu no
# vermelho da marca dele (o acento do Follow em app/site.css).
VERMELHO_FOLLOW = (255, 0, 12)
cartao('follow/og.jpg', os.path.join(RAIZ, 'public', 'follow', 'f2-l.webp'), 'Follow · O culto de jovens da GUIA Church',
       [P('Um lugar'), P('para') + IT('todos.')],
       'Todo sábado às 19h · Barra da Tijuca', foco=(0.62, 0.4), dominio='guiafollow.com', cor_chapeu=VERMELHO_FOLLOW)
