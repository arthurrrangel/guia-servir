import { TAMANHOS } from '@/lib/fotos-tamanhos';

/* =============================================================================
   A FOTO DE CARTÃO, RESPONSIVA — 11/10/2026

   Todo <img> de cartão do site público passa por aqui. O componente lê o
   tamanho real do arquivo em lib/fotos-tamanhos.ts e escreve:

   · width e height: o navegador reserva a proporção certa antes de baixar
     (zero pulo de layout, e o Lighthouse para de pedir "explicit width and
     height"). Quando o CSS fixa a caixa (object-fit: cover), os atributos
     não mudam nada visível;
   · srcSet com a versão pequena (`<nome>-s.webp`, 640px) e a inteira, com
     `sizes` dizendo quanto da tela a foto ocupa. O celular baixa a pequena;
     o monitor, a inteira. Em /cultos isso tira 200 kB dos quatro passos.

   `sizes` padrão: a largura toda no celular e um terço no desktop, que é o
   que os cartões ocupam na maioria das grades. Quem sabe melhor passa o seu.
   Foto fora de public/fotos (ou sem versão pequena) sai como um <img> comum,
   só com width e height quando o tamanho for conhecido.
   ============================================================================= */
type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> & {
  src: string;
  sizes?: string;
};

export function Foto({ src, sizes = '(max-width: 759px) 100vw, 33vw', alt = '', loading = 'lazy', decoding = 'async', ...resto }: Props) {
  const m = /^\/fotos\/([^/]+)\.webp$/.exec(src);
  const t = m ? TAMANHOS[m[1]] : undefined;
  const srcSet = t?.s ? `/fotos/${m![1]}-s.webp 640w, ${src} ${t.w}w` : undefined;
  return (
    <img
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      width={t?.w}
      height={t?.h}
      alt={alt}
      loading={loading}
      decoding={decoding}
      {...resto}
    />
  );
}
