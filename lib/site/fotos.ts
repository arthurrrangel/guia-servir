/* =============================================================================
   AS FOTOS DO SITE — um lugar por foto, uma linha por lugar · 11/10/2026

   O site novo (app/(igreja)/ e app/(servir)/) não escreve caminho de foto em página nenhuma:
   pede `foto('home-heroi')`. Cada lugar está registrado aqui com o arquivo
   ATUAL, o corte que o lugar faz, o ponto que não pode ser cortado e a
   instrução do que a foto precisa mostrar.

   18/11/2026: AS FOTOS TRATADAS. O Arthur mandou 31 fotos tratadas pelo
   designer ("use essas fotos no site, exclua todas as outras"), todas
   deitadas, em 2000 x 1000, numeradas de 1 a 31. Todas as fotos do
   guiachurch.com passaram a sair delas (scripts/site-fotos-tratadas.py grava
   public/site/<nome>-<l|p|h|v|s>.webp e tem a tabela de qual foto foi para
   qual lugar); as antigas da igreja saíram do repositório, a fachada
   inclusive (nenhuma das 31 mostra o prédio). Os heróis que andam com o
   scroll (home, cultos) listam as próprias fotos na página, na ordem do
   scroll. As do Guia Servir, no fim deste arquivo, seguem sendo as do acervo
   do fotógrafo (20/10/2026, scripts/site-fotos-drive.py).

   `corte`: H = horizontal (3:2 a 2:1), V = vertical (4:5), Q = quadrada
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
      quatro celulares, sem esconder a cabeça embaixo da barra).
      `alto` (18/11/2026): a foto no alto. O recorte é 4:5 (800 x 1000, da foto
      deitada de 2000 x 1000), vale só no celular e ocupa o alto do herói, acima
      do texto (app/site.css, "A FOTO NO ALTO"); o tablet em pé fica com a
      deitada.
      `tablet`: com `alto`, onde a foto deitada encosta no tablet em pé. A
      janela dela foi cortada para o computador, com as pessoas no lado direito
      (o texto mora à esquerda); no tablet em pé a caixa é mais estreita e o
      texto desce para baixo da foto, então a foto encosta onde as pessoas
      estão */
  retrato?: { arquivo: string; pequena?: string; largura: number; altura: number; foco?: string; celular?: string; alto?: boolean; tablet?: string };
  alt: string;
  nota: string;
};

export const FOTOS = {
  /* 18/11/2026: AS FOTOS TRATADAS nos heróis de página da igreja. O número no
     fim da nota é o da foto na pasta que o Arthur mandou (1 a 31). No
     computador o texto do herói mora à esquerda: a janela de cada foto
     (scripts/site-fotos-tratadas.py) põe as pessoas no lado direito, depois
     de onde o título acaba. No celular, a foto no alto, em 4:5.
     O `foco` do retrato: no iPhone com o Safari a página visível tem uns
     664 px, o texto do herói toma quase tudo e só os primeiros 100 px da foto
     ficam claros. A caixa da foto fica mais baixa que o corte 4:5 e o que
     sobra dele sai por cima: o segundo número do foco diz quanto, e foi
     medido para o rosto de cada foto subir até essa faixa (em tela alta a
     caixa tem a altura do corte e nada muda). */
  'chegar-heroi': { arquivo: '/site/chegar-heroi-l.webp', largura: 1720, altura: 930, corte: 'H', foco: '50% 35%', alt: 'Duas mulheres sorrindo na entrada da igreja, diante da placa com o horário do culto',
    retrato: { arquivo: '/site/chegar-heroi-p.webp', largura: 800, altura: 1000, alto: true, foco: '50% 62%', tablet: '63% 50%' },
    nota: 'As duas na porta, com a placa do culto atrás (foto 22). Nenhuma das 31 mostra a fachada.' },
  'sobre-heroi': { arquivo: '/site/sobre-heroi-l.webp', largura: 1260, altura: 703, corte: 'H', foco: '50% 50%', alt: 'Um casal jovem sorrindo, abraçado, na entrada da igreja',
    retrato: { arquivo: '/site/sobre-heroi-p.webp', largura: 800, altura: 1000, alto: true, foco: '50% 50%', tablet: '100% 50%' },
    nota: 'O casal na entrada, com o GUI> no vidro (foto 31).' },
  'sobre-geracoes': { arquivo: '/site/sobre-geracoes-h.webp', pequena: '/site/sobre-geracoes-s.webp', largura: 1500, altura: 1000, corte: 'H', alt: 'Um jovem de olhos fechados na água, no momento do batismo, amparado por duas pessoas',
    nota: 'O batismo (foto 18). O nome do lugar é o de antes (as três gerações na porta).' },
  'eventos-heroi': { arquivo: '/site/eventos-heroi-l.webp', largura: 1650, altura: 892, corte: 'H', foco: '50% 30%', alt: 'Uma cantora de braços abertos e olhos fechados no palco, durante o louvor',
    retrato: { arquivo: '/site/eventos-heroi-p.webp', largura: 800, altura: 1000, alto: true, foco: '50% 45%', tablet: '88% 50%' },
    nota: 'O louvor de braços abertos (foto 8).' },
  'eventos-follow': { arquivo: '/site/eventos-follow-v.webp', pequena: '/site/eventos-follow-s.webp', largura: 800, altura: 1000, corte: 'V', alt: 'Um jovem de olhos fechados e mãos abertas, em adoração',
    nota: 'O jovem em adoração, em preto e branco (foto 23).' },
  'pg-heroi': { arquivo: '/site/pg-heroi-l.webp', largura: 1400, altura: 757, corte: 'H', foco: '50% 40%', alt: 'Duas mulheres num abraço apertado, num jardim',
    retrato: { arquivo: '/site/pg-heroi-p.webp', largura: 800, altura: 1000, alto: true, foco: '50% 100%', tablet: '100% 50%' },
    nota: 'O abraço no jardim (foto 26).' },
  'ofertar-heroi': { arquivo: '/site/ofertar-heroi-l.webp', largura: 1700, altura: 773, corte: 'H', foco: '50% 40%', alt: 'Uma mulher de olhos fechados, com o cálice da ceia na mão',
    retrato: { arquivo: '/site/ofertar-heroi-p.webp', largura: 800, altura: 1000, alto: true, foco: '50% 38%', tablet: '100% 50%' },
    nota: 'O cálice da ceia na mão (foto 4).' },
  /* 21/11/2026: a Virada 2027 (guiachurch.com/virada), com duas das fotos tratadas que ainda não tinham lugar */
  'virada-heroi': { arquivo: '/site/virada-heroi-l.webp', largura: 1450, altura: 784, corte: 'H', foco: '50% 35%', alt: 'Uma cantora de olhos fechados e braço erguido, na luz do palco',
    retrato: { arquivo: '/site/virada-heroi-p.webp', largura: 800, altura: 1000, alto: true, foco: '50% 45%', tablet: '80% 50%' },
    nota: 'A cantora de braço erguido, em preto e branco (foto 13).' },
  'virada-noite': { arquivo: '/site/virada-noite-v.webp', pequena: '/site/virada-noite-s.webp', largura: 800, altura: 1000, corte: 'V', alt: 'Pessoas da igreja orando juntas, de olhos fechados e mão no peito',
    nota: 'A igreja orando junto (foto 17).' },
  /* 21/11/2026 (tarde), "mais chamativo": a faixa de fotos da Virada (o que a noite tem: louvor, oração, as crianças, a igreja) */
  'virada-louvor': { arquivo: '/site/virada-louvor-v.webp', pequena: '/site/virada-louvor-s.webp', largura: 800, altura: 1000, corte: 'V', alt: 'Uma cantora de olhos fechados canta no louvor, na luz azul do palco', nota: 'Foto 30.' },
  'virada-oracao': { arquivo: '/site/virada-oracao-v.webp', pequena: '/site/virada-oracao-s.webp', largura: 800, altura: 1000, corte: 'V', alt: 'Uma mulher de óculos ora de olhos fechados, com as mãos juntas', nota: 'Foto 27.' },
  'virada-kids': { arquivo: '/site/virada-kids-v.webp', pequena: '/site/virada-kids-s.webp', largura: 800, altura: 1000, corte: 'V', alt: 'Uma menina sorrindo, sentada na sala das crianças', nota: 'Foto 9.' },
  'virada-gente': { arquivo: '/site/virada-gente-v.webp', pequena: '/site/virada-gente-s.webp', largura: 800, altura: 1000, corte: 'V', alt: 'Um homem sorrindo no meio da igreja, durante o culto', nota: 'Foto 12.' },

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
