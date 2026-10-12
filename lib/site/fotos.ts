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
    retrato: { arquivo: '/site/servir-heroi-r.webp', pequena: '/site/servir-heroi-r-s.webp', largura: 720, altura: 1080, foco: '50% 22%' },
    nota: 'Voluntários de colete na porta (no celular, os dois embaixo do 534, sem o número borrado do topo; rostos a 23% da altura).' },
  /* 12/10 (noite): a /servir tinha a mesma foto e os mesmos círculos da home.
     Agora a tela 2 é o abraço da apresentação e os círculos são o louvor e
     o voluntário de colete (como na tela 3 do PDF). */
  'servir-abraco': { arquivo: '/site/area-servico-r.webp', largura: 632, altura: 745, corte: 'V', foco: '50% 30%', alt: 'Duas mulheres se abraçando na entrada da igreja',
    nota: '"Deus se alegra com o seu servir": o abraço da tela 2 do PDF.' },
  'servir-circulo-1': { arquivo: '/site/servir-circulo-1.webp', pequena: '/site/servir-circulo-1-s.webp', largura: 710, altura: 710, corte: 'Q', alt: '',
    nota: 'O louvor no palco.' },
  'servir-circulo-2': { arquivo: '/site/servir-circulo-2.webp', pequena: '/site/servir-circulo-2-s.webp', largura: 718, altura: 718, corte: 'Q', foco: '50% 30%', alt: '',
    nota: 'O voluntário de colete GUIA.' },
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
    retrato: { arquivo: '/site/area-servico-r2.webp', largura: 404, altura: 718, foco: '50% 30%' },
    nota: 'Connect: voluntários na entrada (no celular, os dois de colete acenando; o abraço ficou na /servir).' },
  'area-livraria': { arquivo: '/fotos/livraria.webp', largura: 1200, altura: 1282, corte: 'H', foco: '50% 45%', alt: 'A mesa da livraria',
    nota: 'Ainda a antiga: falta foto da livraria com alguém atendendo.' },
  /* -------------------------------------------------------------- cultos */
  'cultos-heroi': { arquivo: '/site/cultos-heroi.webp', pequena: '/site/cultos-heroi-s.webp', largura: 1276, altura: 718, corte: 'H', foco: '50% 35%', alt: 'A pregação no culto de domingo',
    retrato: { arquivo: '/site/cultos-heroi-r.webp', pequena: '/site/cultos-heroi-r-s.webp', largura: 888, altura: 1120, foco: '45% 25%' },
    nota: 'Pregação; no celular, o pastor de olhos fechados, mão no peito.' },
  'cultos-1': { arquivo: '/site/momento-acolhida.webp', largura: 574, altura: 718, corte: 'V', foco: '50% 35%', alt: 'Acolhida na porta', nota: 'Acolhida.' },
  'cultos-2': { arquivo: '/site/momento-louvor.webp', largura: 574, altura: 718, corte: 'V', foco: '50% 35%', alt: 'Louvor', nota: 'Louvor: a cantora no palco azul (o cantor já é o herói da home).' },
  'cultos-3': { arquivo: '/site/momento-palavra.webp', pequena: '/site/momento-palavra-s.webp', largura: 720, altura: 900, corte: 'V', foco: '50% 30%', alt: 'Palavra', nota: 'Palavra.' },
  'cultos-4': { arquivo: '/site/momento-oracao.webp', pequena: '/site/momento-oracao-s.webp', largura: 1000, altura: 1250, corte: 'V', foco: '50% 35%', alt: 'Oração no fim do culto', nota: 'Oração.' },
  /* ----------------------------------------------------------- quem somos */
  'sobre-heroi': { arquivo: '/site/sobre-heroi.webp', pequena: '/site/sobre-heroi-s.webp', largura: 1276, altura: 718, corte: 'H', foco: '45% 40%', alt: 'A igreja ouvindo a mensagem',
    retrato: { arquivo: '/site/sobre-heroi-r.webp', pequena: '/site/sobre-heroi-r-s.webp', largura: 760, altura: 1028, foco: '45% 18%' },
    nota: 'A igreja na mensagem; no celular, a líder e as crianças rindo (comunidade).' },
  'sobre-comunidade': { arquivo: '/site/sobre-comunidade.webp', pequena: '/site/sobre-comunidade-s.webp', largura: 1080, altura: 590, corte: 'H', foco: '50% 35%', alt: 'Duas mulheres sorrindo juntas na igreja',
    nota: 'Duas amigas sorrindo.' },
  /* -------------------------------------------------- portas de entrada */
  'acessar-heroi': { arquivo: '/site/servir-heroi.webp', pequena: '/site/servir-heroi-s.webp', largura: 1276, altura: 718, corte: 'H', foco: '50% 35%', alt: '',
    retrato: { arquivo: '/site/area-midia-r.webp', pequena: '/site/area-midia-r-s.webp', largura: 720, altura: 1280, foco: '45% 40%' },
    nota: 'Quem já serve: voluntários de colete (no celular, a mesa da transmissão; a porta do 534 é da /servir).' },
  'encaixe-heroi': { arquivo: '/site/encaixe-heroi.webp', pequena: '/site/encaixe-heroi-s.webp', largura: 1276, altura: 718, corte: 'H', foco: '45% 40%', alt: '',
    retrato: { arquivo: '/site/encaixe-heroi-r.webp', pequena: '/site/encaixe-heroi-r-s.webp', largura: 800, altura: 1255, foco: '50% 20%' },
    nota: 'Abraço na entrada: ninguém fica sem lugar (no celular, a mulher orando; a frase do post foi apagada).' },
  'eventos-heroi': { arquivo: '/site/eventos-heroi.webp', pequena: '/site/eventos-heroi-s.webp', largura: 1276, altura: 718, corte: 'H', foco: '60% 35%', alt: '',
    retrato: { arquivo: '/site/eventos-heroi-r.webp', pequena: '/site/eventos-heroi-r-s.webp', largura: 672, altura: 1344, foco: '50% 10%' },
    nota: 'Palco do culto, para a agenda (no celular, o louvor com a banda; o cantor da home não se repete).' },
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
  'chegar-heroi': { arquivo: '/site/chegar-heroi.webp', pequena: '/site/chegar-heroi-s.webp', largura: 1920, altura: 1291, corte: 'H', foco: '55% 55%', alt: 'A fachada da GUIA Church, com o letreiro na entrada',
    retrato: { arquivo: '/site/chegar-heroi-r.webp', pequena: '/site/chegar-heroi-r-s.webp', largura: 720, altura: 1172, foco: '50% 30%' },
    nota: 'A fachada em alta (o arquivo era de 740 px): a casa, a placa redonda e o GUI> no muro.' },
  /* 12/10 (noite): fotos para não repetir a mesma imagem duas vezes na
     página (o Follow do /eventos e do /cultos) e um segundo fecho */
  'follow-palco': { arquivo: '/site/follow-palco.webp', pequena: '/site/follow-palco-s.webp', largura: 1080, altura: 580, corte: 'H', foco: '45% 40%', alt: 'O louvor no palco do Follow',
    nota: 'Palco com o letreiro "Neste lugar tu és rei", acima da frase gravada no post.' },
  'fecho-maos': { arquivo: '/site/home-heroi.webp', pequena: '/site/home-heroi-s.webp', largura: 1276, altura: 718, corte: 'H', foco: '55% 40%', alt: '',
    retrato: { arquivo: '/site/fecho-maos-r.webp', pequena: '/site/fecho-maos-r-s.webp', largura: 720, altura: 1280, foco: '50% 35%' },
    nota: 'Mãos levantadas no escuro: o fecho das páginas que não usam as cantoras.' },
} as const satisfies Record<string, Foto>;

export type LugarDeFoto = keyof typeof FOTOS;

export const foto = (id: LugarDeFoto): Foto => FOTOS[id];
