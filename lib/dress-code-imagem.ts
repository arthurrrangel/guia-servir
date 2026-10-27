'use client';
/* A IMAGEM DE INSPIRAÇÃO, ANTES DE SUBIR · 116 · 26/10/2026.

   Foto de celular tem 4 a 12 MB e 4000 px. Quem vê é a equipe, no celular,
   num link do WhatsApp: aqui ela vira no máximo 1600 px no lado maior, em
   WebP (ou JPG, no navegador que não gera WebP), com a orientação da câmera
   aplicada. O armário recusa acima de 5 MB e fora de JPG, PNG e WebP; esta
   folha resolve antes, e diz o que houve com palavras. */
import { LIMITES } from '@/lib/dress-code';

export type ImagemPreparada = { blob: Blob; ext: 'webp' | 'jpg'; largura: number; altura: number };

/* o celular manda até 25 MB (uma foto RAW passa disso e não é referência de roupa) */
const ENTRADA_MAX = 25 * 1024 * 1024;

function paraBlob(c: HTMLCanvasElement, tipo: string, q: number): Promise<Blob | null> {
  return new Promise(res => { try { c.toBlob(b => res(b), tipo, q); } catch { res(null); } });
}

async function decodificar(arq: Blob): Promise<{ desenhar: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; w: number; h: number; soltar: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(arq, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { desenhar: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h), w: bmp.width, h: bmp.height, soltar: () => bmp.close?.() };
    } catch { /* tenta pelo <img> (o Safari antigo decodifica HEIC por ali) */ }
  }
  const url = URL.createObjectURL(arq);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error('IMAGEM_FORMATO'));
      i.src = url;
    });
    return { desenhar: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), w: img.naturalWidth, h: img.naturalHeight, soltar: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

export async function prepararImagem(arq: File | Blob): Promise<ImagemPreparada> {
  if (arq.size > ENTRADA_MAX) throw new Error('IMAGEM_GRANDE');
  if (arq.type && !/^image\//i.test(arq.type)) throw new Error('IMAGEM_FORMATO');
  let d;
  try { d = await decodificar(arq); } catch { throw new Error('IMAGEM_FORMATO'); }
  try {
    if (!d.w || !d.h) throw new Error('IMAGEM_FORMATO');
    const escala = Math.min(1, LIMITES.ladoMaior / Math.max(d.w, d.h));
    const largura = Math.max(1, Math.round(d.w * escala));
    const altura = Math.max(1, Math.round(d.h * escala));
    const canvas = document.createElement('canvas');
    canvas.width = largura; canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('IMAGEM_FORMATO');
    /* PNG transparente vira fundo branco (o JPG não tem transparência) */
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, largura, altura);
    d.desenhar(ctx, largura, altura);
    let blob = await paraBlob(canvas, 'image/webp', 0.82);
    let ext: 'webp' | 'jpg' = 'webp';
    if (!blob || blob.type !== 'image/webp') { blob = await paraBlob(canvas, 'image/jpeg', 0.85); ext = 'jpg'; }
    if (!blob) throw new Error('IMAGEM_FORMATO');
    if (blob.size > LIMITES.bytes) throw new Error('IMAGEM_GRANDE');
    return { blob, ext, largura, altura };
  } finally {
    d.soltar();
  }
}

export function erroDaImagem(codigo: string): string {
  switch (codigo) {
    case 'IMAGEM_GRANDE': return 'Essa imagem é grande demais. Envie uma foto comum do celular (até 25 MB).';
    case 'IMAGEM_FORMATO': return 'Não consegui abrir essa imagem. Envie em JPG, PNG ou WebP.';
    case 'IMAGEM_SEM_PERMISSAO': return 'Só a liderança do Louvor envia imagens do dress code.';
    case 'IMAGEM_REDE': return 'A imagem não subiu. Confira a internet e tente de novo.';
    case 'IMAGEM_SEM_ARMARIO': return 'O armário das imagens do dress code ainda não foi ligado. Avise quem cuida do sistema.';
    default: return 'Não consegui usar essa imagem. Tente outra.';
  }
}
