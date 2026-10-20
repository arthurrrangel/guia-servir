/* =============================================================================
   AS FOTOS DO SITE — um lugar por foto, uma linha por lugar · 11/10/2026

   O site novo (app/(igreja)/ e app/(servir)/) não escreve caminho de foto em página nenhuma:
   pede `foto('home-heroi')`. Cada lugar está registrado aqui com o arquivo
   ATUAL, o corte que o lugar faz, o ponto que não pode ser cortado e a
   instrução do que a foto precisa mostrar.

   11/10/2026: o Arthur vai mandar fotos novas ("não quero fotos antigas").
   A lista que ele recebeu é a deste arquivo, na mesma ordem. Enquanto não
   chegam, cada lugar aponta para a melhor foto que já existe em
   public/fotos/. Trocar é: salvar a nova em public/site/<nome>.webp (o
   script scripts/site-fotos.py recorta, trata e gera a versão pequena) e
   trocar UMA linha aqui.

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
      outro corte da mesma, para não ampliar uma faixa estreita da horizontal */
  retrato?: { arquivo: string; pequena?: string; largura: number; altura: number; foco?: string };
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
  'sobre-comunidade': { arquivo: '/site/sobre-comunidade.webp', pequena: '/site/sobre-comunidade-s.webp', largura: 1080, altura: 590, corte: 'H', foco: '50% 35%', alt: 'Duas mulheres sorrindo juntas na igreja',
    nota: 'Duas amigas sorrindo.' },

  /* 20/10/2026: O ACERVO DO FOTÓGRAFO (Drive MKT/CULTOS/2026), tratado por
     scripts/site-fotos-drive.py: os heróis das páginas da igreja deixam o
     quadro de vídeo (1276 px, do reel) e ganham a foto de domingo em 1920 e,
     em pé, em 1080x1920. O código no fim da nota é o da folha de contato
     (culto e número da editada). */
  'sobre-heroi': { arquivo: '/site/sobre-heroi-l.webp', largura: 1920, altura: 1080, corte: 'H', foco: '64% 50%', alt: 'Cinco mulheres sorrindo juntas diante do muro da GUIA Church, num domingo de sol',
    retrato: { arquivo: '/site/sobre-heroi-p.webp', largura: 1080, altura: 1920, foco: '64% 50%' },
    nota: 'Cinco amigas no muro do GUI>, depois do culto (15.03, 65).' },
  'sobre-geracoes': { arquivo: '/site/sobre-geracoes-h.webp', pequena: '/site/sobre-geracoes-s.webp', largura: 1800, altura: 1200, corte: 'H', foco: '45% 45%', alt: 'Três gerações de mulheres sorrindo juntas na porta da igreja',
    nota: 'Três gerações na porta, num domingo de sol (15.03, 52).' },
  'eventos-heroi': { arquivo: '/site/eventos-heroi-l.webp', largura: 1920, altura: 1080, corte: 'H', foco: '50% 42%', alt: 'Um ministro de louvor cantando de braços abertos, com o telão azul atrás',
    retrato: { arquivo: '/site/eventos-heroi-p.webp', largura: 1080, altura: 1920, foco: '50% 42%' },
    nota: 'O louvor de braços abertos (31.05, 04).' },
  'pg-heroi': { arquivo: '/site/pg-heroi-l.webp', largura: 1920, altura: 1080, corte: 'H', foco: '45% 45%', alt: 'Um casal com dois filhos pequenos no colo, sorrindo na calçada da igreja',
    retrato: { arquivo: '/site/pg-heroi-p.webp', largura: 1080, altura: 1920, foco: '45% 45%' },
    nota: 'Uma família na calçada, depois do culto (31.05, 20).' },
  'ofertar-heroi': { arquivo: '/site/ofertar-heroi-l.webp', largura: 1920, altura: 1080, corte: 'H', foco: '55% 50%', alt: 'Mãos segurando o cálice da ceia, na luz azul do culto',
    retrato: { arquivo: '/site/ofertar-heroi-p.webp', largura: 1080, altura: 1920, foco: '55% 50%' },
    nota: 'O cálice da ceia nas mãos (07.06, 04).' },
} as const satisfies Record<string, Foto>;

export type LugarDeFoto = keyof typeof FOTOS;

export const foto = (id: LugarDeFoto): Foto => FOTOS[id];
