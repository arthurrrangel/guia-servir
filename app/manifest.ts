import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GUIA Servir',
    short_name: 'GUIA Servir',
    description: 'Onde a igreja GUIA organiza quem serve: cadastro, escala e confirmação.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f1f1f3',
    theme_color: '#f1f1f3',
    icons: [
      { src: '/icone-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
