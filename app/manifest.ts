import type { MetadataRoute } from 'next';
import { IGREJA } from '@/lib/igreja';

/* O manifesto é o que o celular usa quando alguém salva o site na tela
   inicial. Dizia "GUIA Servir" com fundo cinza-claro — o nome do sistema
   antigo, não o da igreja. Agora é a marca: nome, cor e o chevron. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: IGREJA.nome,
    short_name: 'GUIA',
    description: `${IGREJA.frase}. ${IGREJA.cultoDia} às ${IGREJA.cultoHora}, ${IGREJA.bairro}.`,
    start_url: '/',
    display: 'standalone',
    background_color: '#252525',
    theme_color: '#252525',
    icons: [
      { src: '/icone-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
