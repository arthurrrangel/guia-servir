/* =============================================================================
   AS FOTOS DO SITE — um lugar por foto, uma linha por lugar · 11/10/2026

   O site novo (app/(site)/) não escreve caminho de foto em página nenhuma:
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
  /* 12/10/2026: fotos novas do Arthur (posts do Instagram da igreja e três
     vídeos). Recortadas sem o texto e o logo gravados por cima, tratadas por
     scripts/site-fotos.py em public/site/. As que seguem em /fotos/ são os
     lugares para os quais ainda não veio foto nova (livraria, Camp, fachada). */
  /* ---------------------------------------------------------------- home */
  'home-heroi': { arquivo: '/site/home-heroi.webp', pequena: '/site/home-heroi-s.webp', largura: 1276, altura: 718, corte: 'H', foco: '55% 40%', alt: 'Mãos levantadas no louvor de domingo',
    retrato: { arquivo: '/site/home-heroi-r.webp', pequena: '/site/home-heroi-r-s.webp', largura: 720, altura: 1280, foco: '50% 30%' },
    nota: 'Quadro do vídeo do culto (as mãos) e, no celular, o cantor de braço erguido. O vídeo roda por cima.' },
  'home-abraco': { arquivo: '/site/home-gente.webp', pequena: '/site/home-gente-s.webp', largura: 980, altura: 1225, corte: 'V', foco: '50% 35%', alt: 'Uma mulher sorrindo no meio da igreja durante o culto',
    nota: '"A igreja não é o prédio. É gente."' },
  'home-circulo-1': { arquivo: '/site/circulo-louvor.webp', pequena: '/site/circulo-louvor-s.webp', largura: 690, altura: 690, corte: 'Q', alt: '',
    nota: 'Louvor de mão levantada.' },
  'home-circulo-2': { arquivo: '/site/circulo-familia.webp', largura: 535, altura: 535, corte: 'Q', alt: '',
    nota: 'Adoração com a camisa GUIA Church Family.' },
  /* -------------------------------------------------------------- servir */
  'servir-heroi': { arquivo: '/site/servir-heroi.webp', pequena: '/site/servir-heroi-s.webp', largura: 1276, altura: 718, corte: 'H', foco: '50% 35%', alt: 'Voluntário de colete GUIA recebendo quem chega',
    retrato: { arquivo: '/site/servir-heroi-r.webp', pequena: '/site/servir-heroi-r-s.webp', largura: 720, altura: 1280, foco: '50% 35%' },
    nota: 'Voluntários de colete na porta (no celular, os dois embaixo do 534).' },
  'area-midia': { arquivo: '/site/area-midia.webp', pequena: '/site/area-midia-s.webp', largura: 1276, altura: 718, corte: 'H', foco: '60% 40%', alt: 'Câmera da transmissão operada durante o culto',
    retrato: { arquivo: '/site/area-midia-r.webp', pequena: '/site/area-midia-r-s.webp', largura: 720, altura: 1280, foco: '45% 45%' },
    nota: 'Câmera no tripé; no celular, a mesa da transmissão.' },
  'area-louvor': { arquivo: '/site/area-louvor.webp', pequena: '/site/area-louvor-s.webp', largura: 1276, altura: 718, corte: 'H', foco: '55% 35%', alt: 'Ministração do louvor no palco',
    retrato: { arquivo: '/site/fecho-r.webp', largura: 550, altura: 685, foco: '50% 40%' },
    nota: 'Cantora no palco; no celular, as duas cantoras no escuro (a de fundo branco apagava o título).' },
  'area-kids': { arquivo: '/site/area-kids.webp', pequena: '/site/area-kids-s.webp', largura: 1276, altura: 718, corte: 'H', foco: '60% 40%', alt: 'Criança sorrindo na sala da GUIA Kids',
    retrato: { arquivo: '/site/area-kids-r.webp', pequena: '/site/area-kids-r-s.webp', largura: 730, altura: 910, foco: '50% 40%' },
    nota: 'Sala da GUIA Kids; no celular, a voluntária com as crianças.' },
  'area-servico': { arquivo: '/site/area-servico.webp', pequena: '/site/area-servico-s.webp', largura: 1276, altura: 718, corte: 'H', foco: '35% 45%', alt: 'Dois voluntários de colete acenando na entrada',
    retrato: { arquivo: '/site/area-servico-r.webp', largura: 632, altura: 745, foco: '55% 40%' },
    nota: 'Connect: voluntários na entrada; no celular, o abraço na porta.' },
  'area-livraria': { arquivo: '/fotos/livraria.webp', largura: 1200, altura: 1282, corte: 'H', foco: '50% 45%', alt: 'A mesa da livraria',
    nota: 'Ainda a antiga: falta foto da livraria com alguém atendendo.' },
  /* -------------------------------------------------------------- cultos */
  'cultos-heroi': { arquivo: '/site/cultos-heroi.webp', pequena: '/site/cultos-heroi-s.webp', largura: 1276, altura: 718, corte: 'H', foco: '50% 35%', alt: 'A pregação no culto de domingo',
    retrato: { arquivo: '/site/cultos-heroi-r.webp', pequena: '/site/cultos-heroi-r-s.webp', largura: 888, altura: 1120, foco: '45% 25%' },
    nota: 'Pregação; no celular, o pastor de olhos fechados, mão no peito.' },
  'cultos-1': { arquivo: '/site/momento-acolhida.webp', largura: 574, altura: 718, corte: 'V', foco: '50% 35%', alt: 'Acolhida na porta', nota: 'Acolhida.' },
  'cultos-2': { arquivo: '/site/momento-louvor.webp', pequena: '/site/momento-louvor-s.webp', largura: 720, altura: 900, corte: 'V', foco: '45% 35%', alt: 'Louvor', nota: 'Louvor.' },
  'cultos-3': { arquivo: '/site/momento-palavra.webp', pequena: '/site/momento-palavra-s.webp', largura: 720, altura: 900, corte: 'V', foco: '50% 30%', alt: 'Palavra', nota: 'Palavra.' },
  'cultos-4': { arquivo: '/site/momento-oracao.webp', pequena: '/site/momento-oracao-s.webp', largura: 1000, altura: 1250, corte: 'V', foco: '50% 35%', alt: 'Oração no fim do culto', nota: 'Oração.' },
  /* ----------------------------------------------------------- quem somos */
  'sobre-heroi': { arquivo: '/site/sobre-heroi.webp', pequena: '/site/sobre-heroi-s.webp', largura: 1276, altura: 718, corte: 'H', foco: '45% 40%', alt: 'A igreja ouvindo a mensagem',
    retrato: { arquivo: '/site/sobre-heroi-r.webp', largura: 632, altura: 745, foco: '55% 40%' },
    nota: 'A igreja na mensagem; no celular, o abraço na porta.' },
  'sobre-comunidade': { arquivo: '/site/sobre-comunidade.webp', pequena: '/site/sobre-comunidade-s.webp', largura: 1080, altura: 590, corte: 'H', foco: '50% 35%', alt: 'Duas mulheres sorrindo juntas na igreja',
    nota: 'Duas amigas sorrindo.' },
  /* -------------------------------------------------- portas de entrada */
  'acessar-heroi': { arquivo: '/site/servir-heroi.webp', pequena: '/site/servir-heroi-s.webp', largura: 1276, altura: 718, corte: 'H', foco: '50% 35%', alt: '',
    retrato: { arquivo: '/site/servir-heroi-r.webp', pequena: '/site/servir-heroi-r-s.webp', largura: 720, altura: 1280, foco: '50% 35%' },
    nota: 'Quem já serve: voluntários de colete.' },
  'encaixe-heroi': { arquivo: '/site/encaixe-heroi.webp', pequena: '/site/encaixe-heroi-s.webp', largura: 1276, altura: 718, corte: 'H', foco: '45% 40%', alt: '',
    retrato: { arquivo: '/site/area-servico-r.webp', largura: 632, altura: 745, foco: '55% 40%' },
    nota: 'Abraço na entrada: ninguém fica sem lugar.' },
  'eventos-heroi': { arquivo: '/site/eventos-heroi.webp', pequena: '/site/eventos-heroi-s.webp', largura: 1276, altura: 718, corte: 'H', foco: '60% 35%', alt: '',
    retrato: { arquivo: '/site/home-heroi-r.webp', pequena: '/site/home-heroi-r-s.webp', largura: 720, altura: 1280, foco: '50% 30%' },
    nota: 'Palco do culto, para a agenda.' },
  /* --------------------------------------------------------- pequena guia */
  'pg-heroi': { arquivo: '/site/pg-heroi.webp', pequena: '/site/pg-heroi-s.webp', largura: 1080, altura: 635, corte: 'H', foco: '55% 50%', alt: 'Uma Pequena Guia reunida numa casa',
    nota: 'Um grupo numa sala, em preto e branco.' },
  'pg-biblia': { arquivo: '/fotos/teclado.webp', largura: 800, altura: 1067, corte: 'V', alt: '', nota: 'Sem uso no site novo.' },
  /* -------------------------------------------------------------- eventos */
  'evento-follow': { arquivo: '/site/follow.webp', pequena: '/site/follow-s.webp', largura: 690, altura: 517, corte: 'H', foco: '50% 30%', alt: 'Adoração no Follow, o culto de jovens',
    nota: 'Follow.' },
  'evento-camp': { arquivo: '/fotos/equipe.webp', largura: 1000, altura: 1150, corte: 'H', foco: '50% 35%', alt: 'Follow Camp',
    nota: 'Ainda a antiga: falta foto do acampamento.' },
  /* ------------------------------------------------------ ofertar e fecho */
  'ofertar-heroi': { arquivo: '/site/ofertar-heroi.webp', pequena: '/site/ofertar-heroi-s.webp', largura: 1080, altura: 640, corte: 'H', foco: '50% 45%', alt: '',
    retrato: { arquivo: '/site/ofertar-heroi-r.webp', pequena: '/site/ofertar-heroi-r-s.webp', largura: 1000, altura: 1250, foco: '50% 40%' },
    nota: 'Mãos postas em oração.' },
  'fecho': { arquivo: '/site/fecho.webp', pequena: '/site/fecho-s.webp', largura: 1080, altura: 685, corte: 'H', foco: '50% 40%', alt: '',
    retrato: { arquivo: '/site/fecho-r.webp', largura: 550, altura: 685, foco: '50% 40%' },
    nota: 'As duas cantoras no escuro, para o bloco final das páginas.' },
  'chegar-heroi': { arquivo: '/fotos/predio.webp', largura: 740, altura: 498, corte: 'H', alt: 'A fachada da GUIA Church de dia',
    nota: 'Ainda a antiga: fachada de dia, com a placa, pra pessoa reconhecer a porta.' },
} as const satisfies Record<string, Foto>;

export type LugarDeFoto = keyof typeof FOTOS;

export const foto = (id: LugarDeFoto): Foto => FOTOS[id];
