/* =============================================================================
   AS FOTOS DO SITE — um lugar por foto, uma linha por lugar · 11/10/2026

   O site novo (app/(igreja)/ e app/(servir)/) não escreve caminho de foto em página nenhuma:
   pede `foto('home-heroi')`. Cada lugar está registrado aqui com o arquivo
   ATUAL, o corte que o lugar faz, o ponto que não pode ser cortado e a
   instrução do que a foto precisa mostrar.

   20/10/2026: as fotos são do acervo do fotógrafo (scripts/site-fotos-
   drive.py grava public/site/<nome>-<l|p|h|v|s>.webp). Trocar uma foto é
   gerar os arquivos pelo script e trocar UMA linha aqui. Os heróis que
   andam com o scroll (home, cultos, servir, follow) listam as próprias
   fotos na página, na ordem do scroll.

   `corte`: H = horizontal (3:2 a 16:9), V = vertical (4:5), Q = quadrada
   (vira círculo). `foco`: o ponto da imagem que fica no centro quando o
   lugar corta ("50% 30%" = centro, um pouco acima).
   ============================================================================= */
export type Foto = {
  arquivo: string;
  /** a versão pequena (640px) para o celular, quando existe */
  pequena?: string;
  largura: number;
  altura: number;
  corte: 'H' | 'V' | 'Q';
  foco?: string;
  /** recorte em pé para tela em pé (herói e fecho no celular): outra foto ou
      outro corte da mesma, para não ampliar uma faixa estreita da horizontal.
      `celular`: o ponto no celular em pé (até 759 px), quando o texto do herói
      sobe tanto que cobriria o rosto: a foto sobe junto (21/10/2026, medido em
      quatro celulares, sem esconder a cabeça embaixo da barra) */
  retrato?: { arquivo: string; pequena?: string; largura: number; altura: number; foco?: string; celular?: string };
  alt: string;
  nota: string;
};

export const FOTOS = {
  /* 13/10/2026: o Arthur pediu menos foto e mais vídeo ("use apenas as fotos
     melhores"). Heróis, fechos, momentos do domingo, círculos e cartões
     passaram a ser trechos dos vídeos da igreja (components/site/Midia.tsx,
     scripts/site-videos.py). Ficaram duas fotos, onde a foto é melhor que o
     vídeo: a fachada (é a informação de quem procura o prédio) e as duas
     amigas do /sobre (a mais nítida e calorosa do material). */
  'chegar-heroi': { arquivo: '/site/chegar-heroi.webp', pequena: '/site/chegar-heroi-s.webp', largura: 1920, altura: 1291, corte: 'H', foco: '55% 55%', alt: 'A fachada da GUIA Church, com o letreiro na entrada',
    retrato: { arquivo: '/site/chegar-heroi-r.webp', pequena: '/site/chegar-heroi-r-s.webp', largura: 720, altura: 1172, foco: '50% 30%' },
    nota: 'A fachada em alta: a casa, a placa redonda e o GUI> no muro.' },

  /* 20/10/2026: O ACERVO DO FOTÓGRAFO (Drive MKT/CULTOS/2026), tratado por
     scripts/site-fotos-drive.py: os heróis das páginas da igreja deixam o
     quadro de vídeo (1276 px, do reel) e ganham a foto de domingo em 1920 e,
     em pé, em 1080x1920. O código no fim da nota é o da folha de contato
     (culto e número da editada). */
  'sobre-heroi': { arquivo: '/site/sobre-heroi-l.webp', largura: 1920, altura: 1080, corte: 'H', foco: '64% 50%', alt: 'Cinco mulheres sorrindo juntas diante do muro da GUIA Church, num domingo de sol',
    retrato: { arquivo: '/site/sobre-heroi-p.webp', largura: 1080, altura: 1920, foco: '64% 50%', celular: '64% 100%' },
    nota: 'Cinco amigas no muro do GUI>, depois do culto (15.03, 65).' },
  'sobre-geracoes': { arquivo: '/site/sobre-geracoes-h.webp', pequena: '/site/sobre-geracoes-s.webp', largura: 1800, altura: 1200, corte: 'H', foco: '45% 45%', alt: 'Três gerações de mulheres sorrindo juntas na porta da igreja',
    nota: 'Três gerações na porta, num domingo de sol (15.03, 52).' },
  'eventos-heroi': { arquivo: '/site/eventos-heroi-l.webp', largura: 1920, altura: 1080, corte: 'H', foco: '50% 42%', alt: 'Um ministro de louvor cantando de braços abertos, com o telão azul atrás',
    retrato: { arquivo: '/site/eventos-heroi-p.webp', largura: 1080, altura: 1920, foco: '50% 42%' },
    nota: 'O louvor de braços abertos (31.05, 04).' },
  'pg-heroi': { arquivo: '/site/pg-heroi-l.webp', largura: 1920, altura: 1080, corte: 'H', foco: '45% 45%', alt: 'Um casal com dois filhos pequenos no colo, sorrindo na calçada da igreja',
    retrato: { arquivo: '/site/pg-heroi-p.webp', largura: 1080, altura: 1920, foco: '45% 45%', celular: '45% 100%' },
    nota: 'Uma família na calçada, depois do culto (31.05, 20).' },
  'ofertar-heroi': { arquivo: '/site/ofertar-heroi-l.webp', largura: 1920, altura: 1080, corte: 'H', foco: '55% 50%', alt: 'Mãos segurando o cálice da ceia, na luz azul do culto',
    retrato: { arquivo: '/site/ofertar-heroi-p.webp', largura: 1080, altura: 1920, foco: '55% 50%' },
    nota: 'O cálice da ceia nas mãos (07.06, 04).' },

  /* 20/10/2026: os heróis das cinco áreas do Guia Servir (as mesmas fotos do
     herói da LP; Mídia e Livraria vêm das fotos de 12/10, em public/fotos) */
  'servir-midia': { arquivo: '/site/servir-midia-l.webp', largura: 1600, altura: 900, corte: 'H', alt: 'Um voluntário da Mídia de fone, na mesa de corte, com o telão ao fundo',
    retrato: { arquivo: '/site/servir-midia-p.webp', largura: 720, altura: 1280, celular: '50% 70%' }, nota: 'A mesa de corte (fotos de 12/10).' },
  'servir-louvor': { arquivo: '/site/servir-louvor-l.webp', largura: 1920, altura: 1080, corte: 'H', alt: 'Uma cantora e um guitarrista do Louvor no palco',
    retrato: { arquivo: '/site/servir-louvor-p.webp', largura: 1080, altura: 1920, celular: '50% 100%' }, nota: 'O Louvor no palco (15.03, 16).' },
  'servir-kids': { arquivo: '/site/servir-kids-l.webp', largura: 1920, altura: 1080, corte: 'H', alt: 'Uma voluntária do GUIA Kids com um bebê no colo, sorrindo',
    retrato: { arquivo: '/site/servir-kids-p.webp', largura: 1080, altura: 1920, celular: '50% 85%' }, nota: 'O Kids, com o bebê no colo (08.03, 10).' },
  'servir-connect': { arquivo: '/site/servir-connect-l.webp', largura: 1920, altura: 1080, corte: 'H', alt: 'A equipe do Connect abraçando quem chega na porta',
    retrato: { arquivo: '/site/servir-connect-p.webp', largura: 1080, altura: 1920, celular: '50% 100%' }, nota: 'O Connect recebe na porta (15.03, 09).' },
  'servir-livraria': { arquivo: '/site/servir-livraria-l.webp', largura: 1600, altura: 900, corte: 'H', alt: 'Mãos folheando uma Bíblia na livraria',
    retrato: { arquivo: '/site/servir-livraria-p.webp', largura: 720, altura: 1280 }, nota: 'A Bíblia na livraria (fotos de 12/10).' },
} as const satisfies Record<string, Foto>;

export type LugarDeFoto = keyof typeof FOTOS;

export const foto = (id: LugarDeFoto): Foto => FOTOS[id];
