#!/usr/bin/env python3
"""VÍDEOS DO SITE: um trecho próprio para cada página (13/10/2026)

O Arthur mandou três vídeos da igreja (reels do Instagram) e pediu o site
com menos foto e mais vídeo, "use mais os vídeos que te mandei somente".
Este script corta, monta e comprime os trechos de cada lugar do site a
partir desses três arquivos, sem nenhuma imagem de fora:

  va  1276x718  louvor, abraço, pregação, Bíblia no celular, congregação, Kids
  vb  1276x718  voluntários de colete, porta, câmera, palco, pregação
  v2  720x1280  vertical: camiseta do Connect, mesa da transmissão, louvor,
                congregação, pastores

Cada trecho é uma lista de planos (fonte, início, fim, foco). Os planos se
fundem em 0,35 s e o fim do trecho se funde no começo (0,5 s): o loop não
tem emenda. Formatos (o mesmo trecho pode sair em mais de um):

  L  1280x720  computador (herói, faixas)
  P  720x1280  celular em pé (herói): recorte 9:16 dos vídeos deitados,
               centrado no `foco` (fração da largura), ou o v2 inteiro
  V  720x900   4:5, o quadro em pé dentro das seções
  Q  640x640   o círculo

Saída em public/site/v/: <id>-<f>.mp4 (H.264, primeiro: iPhone e Chrome
decodificam no chip), <id>-<f>.webm (VP9, para navegador sem H.264) e
<id>-<f>.webp (o primeiro quadro: o pôster que aparece antes do vídeo e
fica para quem pede "reduzir movimento"). Grava também
lib/site/videos.gerado.json com tamanho, duração e, no trecho com
capítulos (o domingo), o segundo em que cada capítulo começa.

Uso: python3 scripts/site-videos.py [pasta-dos-videos]
     SO=servir,encaixe gera só esses trechos
     FOLHA=1           monta public/site/v/_folha.jpg com os pôsteres (não vai pro ar)
"""
import json, os, subprocess, sys, tempfile

FONTES_DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/.claude/uploads/fb14e54a-4194-57dc-93b8-847061e827f9')
FONTES = {
    'va': os.path.join(FONTES_DIR, '1d6a4ea4-guiachurch_DeX2MaNJeDt.mp4'),
    'vb': os.path.join(FONTES_DIR, '79ec7bb1-guiachurch_DdzHQk4Jn5b.mp4'),
    'v2': os.path.join(FONTES_DIR, 'd64b2cb0-guiachurch_DdhEdDlJkU8.mp4'),
}
SAIDA = 'public/site/v'
JSON = 'lib/site/videos.gerado.json'
FUSAO = 0.3    # entre planos
LOOP = 0.4     # do fim para o começo
LENTO = 0.8    # tudo um pouco mais lento: 30 quadros viram 24 por segundo, sem quadro repetido
MCI = 'minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1'

TAM = {'L': (1280, 720), 'P': (720, 1280), 'V': (720, 900), 'Q': (640, 640)}

# --------------------------------------------------------------------------
# OS TRECHOS. Um plano = (fonte, início, fim, foco). O foco é o centro do
# recorte: fração da LARGURA nos vídeos deitados (va, vb) e da ALTURA no
# vertical (v2). Os tempos são do arquivo original (folhas de 2 quadros por
# segundo em scratchpad/q/). Regra: nenhum plano se repete na mesma página,
# e nenhum herói repete o plano de outro herói.
# --------------------------------------------------------------------------
T = {
    # 20/10/2026: os heróis de foto (home, cultos, sobre, eventos, PG, ofertar,
    # Follow, as cinco áreas) deixaram o vídeo pelas fotos do acervo do
    # fotógrafo (scripts/site-fotos-drive.py); os trechos deles saíram daqui e
    # de public/site/v. Ficam os que seguem no ar: o herói de /acessar e de
    # /onde-me-encaixo, a área sem foto ('servir'), o domingo em capítulos, a
    # mensagem, o abraço e os dois círculos do Guia Servir.
    # ------------------------------------------------------------- heróis
    'servir': {
        'L': [('vb', 16.0, 18.9), ('vb', 14.5, 15.9)],
        # no celular só o voluntário rindo, um plano: o recorte em pé dos três
        # de polegar para cima pegava o braço, não os rostos
        'P': [('vb', 16.0, 18.9, .50)],
    },
    'encaixe': {
        'L': [('vb', 24.5, 25.4), ('vb', 27.5, 28.9), ('va', 30.0, 31.4), ('vb', 20.0, 20.9), ('va', 21.0, 22.2)],
        'P': [('vb', 24.5, 25.4, .45), ('vb', 27.5, 28.9, .55), ('va', 30.0, 31.4, .50), ('vb', 20.0, 20.9, .42), ('va', 21.0, 22.2, .45)],
    },
    # acessar (quem já serve): os voluntários de colete
    'acessar': {
        'L': [('vb', 11.5, 13.9), ('vb', 7.5, 8.9), ('vb', 0.0, 0.9)],
        'P': [('vb', 11.5, 13.9, .50), ('vb', 7.5, 8.9, .45), ('vb', 0.0, 0.9, .46)],
    },
    # ----------------------------------------------------- dentro das páginas
    # o domingo em quatro capítulos (acolhida, louvor, Palavra, oração), uns
    # 3 s cada: dá tempo de ler a linha que acende ao lado. `capitulos` diz
    # em que plano cada capítulo começa
    'domingo': {
        'V': [('vb', 4.0, 5.9, .42), ('vb', 21.0, 21.9, .40),
              ('vb', 29.0, 30.9, .58), ('vb', 27.5, 28.9, .55),
              ('v2', 19.5, 21.9, .40),
              ('v2', 12.0, 13.9, .42), ('va', 15.0, 16.4, .40)],
        'capitulos': [0, 2, 4, 5],
    },
    'mensagem': {
        'L': [('va', 18.5, 20.9), ('va', 13.0, 14.9)],
        'P': [('v2', 26.0, 27.9), ('v2', 16.0, 17.4)],
    },
    # "Deus se alegra com o seu servir": o abraço (tela 2 do PDF)
    'abraco': {
        'V': [('vb', 6.0, 7.4, .48), ('va', 9.5, 12.9, .40)],
    },
    # os dois círculos do /servir (tela 3 do PDF): o louvor e a voluntária de colete
    'circ-louvor': {'Q': [('va', 7.0, 9.4, .62)]},
    'circ-colete': {'Q': [('vb', 19.0, 19.9, .45), ('vb', 20.0, 20.9, .42), ('vb', 21.0, 21.9, .40)]},
}

# um tratamento só para os três vídeos: contraste um pouco acima, cor um
# pouco abaixo (os reels vêm saturados e cada um com um tom)
COR = 'eq=contrast=1.04:saturation=0.9'


def quadro(fmt, fonte, foco):
    """o filtro que leva o plano ao formato: recorte (sem deformar) e escala"""
    W, H = TAM[fmt]
    if fonte == 'v2':
        fy = .45 if foco is None else foco
        if fmt == 'L':
            # o vertical vira 16:9 só em último caso (a mesa da transmissão):
            # uma faixa de 720x405 ampliada, atrás do degradê do herói
            y = max(0, min(1280 - 405, round(fy * 1280 - 202)))
            return f'crop=720:405:0:{y},scale={W}:{H}:flags=lanczos,unsharp=5:5:0.6'
        if fmt == 'P':
            return f'scale={W}:{H}:flags=lanczos'
        lado = 720 if fmt == 'Q' else 900
        y = max(0, min(1280 - lado, round(fy * 1280 - lado / 2)))
        return f'crop=720:{lado}:0:{y},scale={W}:{H}:flags=lanczos'
    # deitado (1276x718)
    if fmt == 'L':
        return f'scale={W}:{H}:flags=lanczos'
    fx = .5 if foco is None else foco
    larg = {'P': 404, 'V': 574, 'Q': 718}[fmt]
    x = max(0, min(1276 - larg, round(fx * 1276 - larg / 2)))
    x -= x % 2
    return f'crop={larg}:718:{x}:0,scale={W}:{H}:flags=lanczos,unsharp=5:5:0.5'


def monta(id_, fmt, planos, lento=None, tmp='.', capitulos=None, mci=False):
    """filtro completo: planos → fusões → loop; devolve (intermediário, duração, capítulos)

    `lento` (padrão 0,8): a velocidade. A 0,8 cada quadro do original vira um
    quadro de 1/24 s (o cinema), sem repetir nem inventar quadro. Os planos
    curtos e quase parados (a mesa da transmissão, a Bíblia no colo) vão a
    0,6 com `mci`: o ffmpeg cria os quadros do meio pelo movimento."""
    lento = lento or LENTO
    fps = 30 if mci else round(30 * lento)
    entradas, filtros, durs = [], [], []
    for i, p in enumerate(planos):
        fonte, ini, fimp = p[0], p[1], p[2]
        foco = p[3] if len(p) > 3 else None
        d = round(fimp - ini, 3)
        entradas += ['-ss', f'{ini:.3f}', '-t', f'{d:.3f}', '-i', FONTES[fonte]]
        d = round(d / lento, 3)
        interp = f',{MCI}' if mci else ''
        filtros.append(f'[{i}:v]setpts=PTS-STARTPTS,setpts=PTS/{lento},{quadro(fmt, fonte, foco)}{interp},{COR},fps={fps},format=yuv420p,settb=AVTB,setsar=1[s{i}]')
        durs.append(d)
    # fusões entre planos
    atual, acum = 's0', durs[0]
    inicios = [0.0]
    for i in range(1, len(planos)):
        off = round(acum - FUSAO, 3)
        inicios.append(off)
        filtros.append(f'[{atual}][s{i}]xfade=transition=fade:duration={FUSAO}:offset={off}[x{i}]')
        atual = f'x{i}'
        acum = round(off + durs[i], 3)
    total = acum
    # o loop: o fim se funde no começo; a saída começa em LOOP segundos
    filtros.append(f'[{atual}]split[m1][m2]')
    filtros.append(f'[m1]trim=start={LOOP},setpts=PTS-STARTPTS[corpo]')
    filtros.append(f'[m2]trim=end={LOOP},setpts=PTS-STARTPTS[cabeca]')
    filtros.append(f'[corpo][cabeca]xfade=transition=fade:duration={LOOP}:offset={round(total - 2 * LOOP, 3)}[out]')
    dur = round(total - LOOP, 3)
    # capítulos: o meio de cada fusão, já no relógio da saída
    caps = [0.0] + [round(max(0.0, s + FUSAO / 2 - LOOP), 2) for s in inicios[1:]]
    if isinstance(capitulos, list):
        caps = [caps[i] for i in capitulos]
    inter = os.path.join(tmp, f'{id_}-{fmt}.mkv')
    cmd = ['ffmpeg', '-v', 'error', '-y', *entradas, '-filter_complex', ';'.join(filtros), '-map', '[out]',
           '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '10', '-pix_fmt', 'yuv420p', inter]
    subprocess.run(cmd, check=True)
    return inter, dur, caps


def comprime(inter, base, fmt, caps=None):
    # o vídeo fica atrás de um degradê escuro: CRF 29/30 não aparece, e um
    # tirar de ruído leve (hqdn3d) corta mais 5 a 8% do peso
    crf264 = 29 if fmt == 'L' else 30
    limpa = ['-vf', 'hqdn3d=1.5:1.5:4:3']
    chaves = ['-force_key_frames', ','.join(f'{c:.2f}' for c in caps)] if caps else []
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', inter, *limpa, '-an', '-c:v', 'libx264', '-preset', 'slow',
                    '-crf', str(crf264), '-profile:v', 'high', '-level:v', '4.0', '-pix_fmt', 'yuv420p',
                    '-g', '60', *chaves, '-movflags', '+faststart', base + '.mp4'], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', inter, *limpa, '-an', '-c:v', 'libvpx-vp9', '-b:v', '0',
                    '-crf', '41' if fmt == 'L' else '42', '-deadline', 'good', '-cpu-used', '2', '-row-mt', '1',
                    '-g', '60', *chaves, '-pix_fmt', 'yuv420p', base + '.webm'], check=True)
    # o pôster: o primeiro quadro (é o quadro em que o loop recomeça)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', inter, '-frames:v', '1', '-c:v', 'libwebp',
                    '-quality', '80', base + '.webp'], check=True)


def main():
    os.makedirs(SAIDA, exist_ok=True)
    so = set(filter(None, os.environ.get('SO', '').split(',')))
    reg = {}
    if os.path.exists(JSON):
        reg = json.load(open(JSON))
    guarda = os.environ.get('INTER')  # pasta para guardar os intermediários (recomprimir sem remontar)
    with tempfile.TemporaryDirectory() as tmp:
        if guarda:
            os.makedirs(guarda, exist_ok=True); tmp = guarda
        for id_, t in T.items():
            if so and id_ not in so:
                continue
            for fmt in ('L', 'P', 'V', 'Q'):
                if fmt not in t:
                    continue
                inter, dur, caps = monta(id_, fmt, t[fmt], t.get('lento'), tmp, t.get('capitulos'), t.get('mci', False))
                base = os.path.join(SAIDA, f'{id_}-{fmt.lower()}')
                comprime(inter, base, fmt, caps if t.get('capitulos') else None)
                W, H = TAM[fmt]
                kb = {e: round(os.path.getsize(f'{base}.{e}') / 1024) for e in ('mp4', 'webm', 'webp')}
                reg.setdefault(id_, {})[fmt] = {'largura': W, 'altura': H, 'duracao': dur, 'kb': kb,
                                                **({'capitulos': caps} if t.get('capitulos') else {})}
                print(f'{id_:12s} {fmt}  {dur:5.2f}s  mp4 {kb["mp4"]:4d} KB  webm {kb["webm"]:4d} KB  pôster {kb["webp"]:3d} KB'
                      + (f'  capítulos {caps}' if t.get('capitulos') else ''), flush=True)
    json.dump(reg, open(JSON, 'w'), ensure_ascii=False, indent=1, sort_keys=True)
    if os.environ.get('FOLHA'):
        from PIL import Image
        ims = []
        for id_ in sorted(reg):
            for fmt in reg[id_]:
                f = os.path.join(SAIDA, f'{id_}-{fmt.lower()}.webp')
                if os.path.exists(f):
                    im = Image.open(f).convert('RGB'); im.thumbnail((360, 360)); ims.append(im)
        cols = 8
        rows = (len(ims) + cols - 1) // cols
        out = Image.new('RGB', (cols * 364, rows * 364), (30, 30, 30))
        for i, im in enumerate(ims):
            out.paste(im, ((i % cols) * 364, (i // cols) * 364))
        out.save(os.path.join(SAIDA, '_folha.jpg'), quality=82)


if __name__ == '__main__':
    main()
