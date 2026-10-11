/* =============================================================================
   OS TAMANHOS DAS FOTOS — gerado em 11/10/2026 (PIL, a partir de public/fotos)

   Para cada foto: a largura e a altura reais do arquivo (o navegador reserva
   o espaço certo antes de baixar, sem pulo de layout) e se existe a versão
   pequena `<nome>-s.webp` (640px de largura, qualidade 80), que o celular
   recebe nos cartões em vez do arquivo inteiro: o Lighthouse de /cultos
   marcava 200 kB a mais só nos quatro passos do domingo.

   Regenerar quando entrar foto nova: python3 scripts/fotos-tamanhos.py
   (o script está no fim deste arquivo, em comentário). Foto com menos de
   700px de largura não ganha versão pequena.
   ============================================================================= */
export const TAMANHOS: Record<string, { w: number; h: number; s: boolean }> = {
  'abraco-palco-v': { w: 496, h: 620, s: false },
  'abraco-palco': { w: 1080, h: 620, s: true },
  'abraco': { w: 545, h: 425, s: false },
  'acolhida': { w: 1200, h: 534, s: true },
  'casal': { w: 430, h: 595, s: false },
  'ceia': { w: 1080, h: 945, s: true },
  'congregacao': { w: 1500, h: 667, s: true },
  'equipe': { w: 1000, h: 1150, s: true },
  'fachada-m': { w: 1100, h: 1375, s: true },
  'fachada': { w: 2000, h: 1344, s: true },
  'heroi': { w: 1800, h: 1200, s: true },
  'kids-1': { w: 1000, h: 445, s: true },
  'kids-2': { w: 1000, h: 444, s: true },
  'kids-3': { w: 900, h: 400, s: true },
  'kids-brincar': { w: 1080, h: 379, s: true },
  'kids-sala': { w: 1080, h: 430, s: true },
  'livraria': { w: 1200, h: 1282, s: true },
  'louvor-cor': { w: 1012, h: 1174, s: true },
  'louvor-pb': { w: 1080, h: 1235, s: true },
  'louvor-q': { w: 900, h: 900, s: true },
  'midia': { w: 1800, h: 1012, s: true },
  'oferta': { w: 1200, h: 533, s: true },
  'oracao': { w: 1080, h: 582, s: true },
  'palavra': { w: 1200, h: 534, s: true },
  'palco': { w: 1600, h: 711, s: true },
  'pastor-aponta': { w: 1080, h: 765, s: true },
  'porta-q': { w: 533, h: 533, s: false },
  'porta-sorriso': { w: 730, h: 425, s: true },
  'predio': { w: 740, h: 498, s: true },
  'pregacao-m': { w: 904, h: 1130, s: true },
  'pregacao': { w: 1080, h: 1130, s: true },
  'recepcao': { w: 1200, h: 533, s: true },
  'teclado': { w: 800, h: 1067, s: true },
};

/* scripts/fotos-tamanhos.py:
   from PIL import Image; import glob, os
   for f in sorted(glob.glob('public/fotos/*.webp')):
       n = os.path.basename(f)[:-5]
       if n.endswith('-s'): continue
       im = Image.open(f); w, h = im.size
       if w > 700:
           sm = im.copy(); sm.thumbnail((640, 10000), Image.LANCZOS)
           sm.save(f'public/fotos/{n}-s.webp', 'WEBP', quality=80, method=6)
       print(n, w, h, w > 700)
*/
