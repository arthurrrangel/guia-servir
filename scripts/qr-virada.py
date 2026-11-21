#!/usr/bin/env python3
"""
O QR DA VIRADA 2027 · 21/11/2026

O Arthur pediu a landing page da Virada "COM QR PRA INSCRICAO CAINDO NA LP".
O QR guarda guiachurch.com/v27, o endereço curto que só redireciona para a
página (next.config.mjs; scripts/qr-impresso.test.mjs não deixa apagar): se
a página mudar de lugar, o QR já impresso continua valendo.

  scripts/qr-virada.py <pasta de saída>

Sai: o QR sozinho (SVG para gráfica, PNG grande) e o cartão na identidade do
site (noite com grão, a marca, a serifa itálica, o laranja só no chapéu), em
PNG 1080x1350 para redes e em PDF A5 para imprimir. Fontes e marca são as do
site (public/tipos, public/marca).
"""
import os, sys, re, base64
import segno

if len(sys.argv) < 2:
    sys.exit(__doc__)
SAIDA = os.path.abspath(sys.argv[1])
RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
URL = 'https://guiachurch.com/v27'
NOITE = '#111113'

os.makedirs(SAIDA, exist_ok=True)
qr = segno.make(URL, error='m', micro=False)
qr.save(os.path.join(SAIDA, 'virada-2027-qr.svg'), scale=10, border=4, dark=NOITE, light='#ffffff', xmldecl=False, svgns=True)
qr.save(os.path.join(SAIDA, 'virada-2027-qr.png'), scale=60, border=4, dark=NOITE, light='#ffffff')

def b64(caminho):
    with open(caminho, 'rb') as f:
        return base64.b64encode(f.read()).decode()

# o QR por dentro do cartão: SVG em linha, sem a declaração XML
qr_svg = qr.svg_inline(scale=10, border=0, dark=NOITE, light=None, omitsize=True)
marca = open(os.path.join(RAIZ, 'public', 'marca', 'guia-church.svg'), encoding='utf-8').read()
marca = re.sub(r'<title>.*?</title>', '', marca).replace('fill="#000"', 'fill="#fff"')
grao = b64(os.path.join(RAIZ, 'public', 'grao.png'))
inter = b64(os.path.join(RAIZ, 'public', 'tipos', 'inter.woff2'))
serifa = b64(os.path.join(RAIZ, 'public', 'tipos', 'instrument-serif-italic.woff2'))

HTML = f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
@font-face{{font-family:Inter;font-weight:100 900;src:url(data:font/woff2;base64,{inter}) format("woff2")}}
@font-face{{font-family:"Instrument Serif";font-style:italic;src:url(data:font/woff2;base64,{serifa}) format("woff2")}}
@page{{size:148mm 185mm;margin:0}}
*{{box-sizing:border-box;margin:0;padding:0}}
html,body{{background:{NOITE}}}
.c{{width:1080px;height:1350px;position:relative;overflow:hidden;background:{NOITE};color:#fff;font-family:Inter,system-ui,sans-serif;padding:84px 88px 80px;display:flex;flex-direction:column}}
.c::before{{content:"";position:absolute;inset:0;background:url(data:image/png;base64,{grao});opacity:.09;mix-blend-mode:screen;pointer-events:none}}
.marca svg{{height:52px;width:auto;display:block}}
.chapeu{{margin-top:64px;color:#e9942f;font-weight:600;font-size:30px;letter-spacing:.01em}}
h1{{margin-top:26px;font-weight:800;font-size:112px;line-height:.94;letter-spacing:-.05em}}
h1 i{{display:block;font-family:"Instrument Serif",Georgia,serif;font-style:italic;font-weight:400;font-size:132px;letter-spacing:-.02em;line-height:1}}
.qr{{margin-top:auto;display:grid;grid-template-columns:440px 1fr;gap:56px;align-items:center}}
.qr .q{{background:#fff;border-radius:28px;padding:36px;width:440px;height:440px}}
.qr .q svg{{width:100%;height:100%;display:block}}
.qr b{{display:block;font-weight:800;font-size:46px;line-height:1.02;letter-spacing:-.04em}}
.qr span{{display:block;margin-top:18px;font-weight:600;font-size:28px;color:#e9942f;letter-spacing:-.01em}}
.pe{{margin-top:56px;padding-top:26px;border-top:1px solid rgba(255,255,255,.22);font-weight:400;font-size:24px;color:rgba(255,255,255,.78);letter-spacing:-.005em}}
</style></head><body><div class="c">
<div class="marca">{marca}</div>
<p class="chapeu">Virada 2027 · 31 de dezembro, 19h30</p>
<h1>Entre em 2027 na presença <i>de Deus.</i></h1>
<div class="qr"><div class="q">{qr_svg}</div><div><b>Aponte a câmera e reserve seu lugar</b><span>guiachurch.com/virada</span></div></div>
<p class="pe">Espaço Bethel, Barra de Guaratiba · Reserva gratuita, vagas limitadas</p>
</div></body></html>"""
pagina = os.path.join(SAIDA, 'virada-2027-cartao.html')
with open(pagina, 'w', encoding='utf-8') as f:
    f.write(HTML)

from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    nav = p.chromium.launch()
    pg = nav.new_page(viewport={'width': 1080, 'height': 1350}, device_scale_factor=2)
    pg.goto('file://' + pagina)
    pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(SAIDA, 'virada-2027-cartao.png'), clip={'x': 0, 'y': 0, 'width': 1080, 'height': 1350})
    # A5 de largura (148 mm) na proporção do cartão (4:5 → 185 mm): a escala leva os 1080 px para 148 mm
    pg.pdf(path=os.path.join(SAIDA, 'virada-2027-cartao.pdf'), width='148mm', height='185mm', print_background=True,
           scale=148 / (1080 * 25.4 / 96), page_ranges='1')
    nav.close()
os.remove(pagina)
print('ok:', ', '.join(sorted(os.listdir(SAIDA))))
