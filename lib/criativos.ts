/* =============================================================================
   OS CRIATIVOS — os lugares do site que esperam uma imagem

   08/09/2026. O Arthur pediu para esquecer as fotos atuais e deixar espaço
   para criativos novos. Então o site v3 não DEPENDE de foto: cada lugar que
   pode receber uma imagem é um "criativo" registrado aqui, e enquanto o
   arquivo não existe o lugar mostra um painel da marca (a retícula e o
   chevron), que é desenho, não buraco.

   COMO COLOCAR UM CRIATIVO NOVO
   1. Exportar a imagem na proporção do lugar (abaixo), em WebP, na largura
      indicada ou maior. Nome curto, sem espaço, sem acento.
   2. Salvar em public/criativos/.
   3. Escrever o caminho em `arquivo` no lugar certo, ex.: '/criativos/heroi.webp'.
   Só isso: a página troca o painel pela imagem, com o mesmo corte e o mesmo
   véu de leitura. Para tirar, é só apagar a linha.

   `foco` é o ponto da imagem que não pode ser cortado ("50% 30%" = centro,
   um pouco acima), porque o mesmo arquivo é cortado de dois jeitos: quase
   quadrado no celular, muito largo no monitor.
   ============================================================================= */

export type Proporcao = '16:9' | '21:9' | '4:5' | '1:1' | '3:2';

export type Criativo = {
  /** o arquivo em public/. Ausente = painel da marca. */
  arquivo?: string;
  /** o que a imagem mostra, para quem não enxerga. Vazio quando é só clima. */
  alt: string;
  proporcao: Proporcao;
  /** largura mínima para não amolecer no monitor */
  largura: number;
  foco?: string;
  /** a instrução para quem vai produzir a peça */
  nota: string;
};

export const CRIATIVOS = {
  heroi: {
    alt: '', proporcao: '16:9', largura: 2400,
    nota: 'A primeira tela do site. Fica atrás do título branco: precisa de área escura ou de um véu. Cortada quase quadrada no celular: o assunto no centro.',
  },
  domingo: {
    alt: '', proporcao: '4:5', largura: 1200,
    nota: 'O domingo por dentro: a equipe trabalhando (mesa, palco, porta), não o público.',
  },
  fecho: {
    alt: '', proporcao: '16:9', largura: 2400,
    nota: 'O fim de todas as páginas, atrás de uma frase branca. Clima, sem rosto no centro.',
  },
  cultos: {
    alt: '', proporcao: '16:9', largura: 2400,
    nota: 'Herói de /cultos: o salão no domingo, de dentro.',
  },
  grupos: {
    alt: '', proporcao: '16:9', largura: 2400,
    nota: 'Herói de /pequena-guia: uma sala de casa, gente sentada perto. Sem rosto de criança.',
  },
  servir: {
    alt: '', proporcao: '16:9', largura: 2400,
    nota: 'Herói de /servir: quem chega antes, de costas ou de lado, trabalhando.',
  },
  sobre: {
    alt: '', proporcao: '16:9', largura: 2400,
    nota: 'Herói de /sobre: o prédio ou a congregação, de longe.',
  },
  palavra: {
    alt: '', proporcao: '21:9', largura: 2400,
    nota: 'Atrás do versículo em /sobre. Escuro, quase abstrato: a frase é o assunto.',
  },
  chegar: {
    alt: 'Fachada da GUIA Church na Rua Pedra de Itaúna', proporcao: '16:9', largura: 2400,
    nota: 'Herói de /como-chegar: A FACHADA, de frente, de dia. É a foto que faz a pessoa reconhecer a porta.',
  },
  tv: {
    alt: '', proporcao: '16:9', largura: 2400,
    nota: 'Herói de /guia-church-tv: o palco visto da mesa de transmissão, ou a câmera.',
  },
  /* AS ÁREAS: um por slug do banco (area-midia, area-servico, area-kids,
     area-louvor, area-livraria). Área sem criativo próprio usa `area`. */
  area: {
    alt: '', proporcao: '16:9', largura: 2400,
    nota: 'Herói genérico de área: a equipe trabalhando, de lado, sem rosto em close.',
  },
  'area-midia': { alt: '', proporcao: '16:9', largura: 2400, nota: 'Mídia: a mesa de transmissão ou a câmera, durante o culto.' },
  'area-servico': { alt: '', proporcao: '16:9', largura: 2400, nota: 'Connect: a porta, alguém recebendo.' },
  'area-kids': { alt: '', proporcao: '16:9', largura: 2400, nota: 'Kids: a sala, de longe, sem rosto de criança.' },
  'area-louvor': { alt: '', proporcao: '16:9', largura: 2400, nota: 'Louvor: a banda no palco, de lado.' },
  'area-livraria': { alt: '', proporcao: '16:9', largura: 2400, nota: 'Livraria: a bancada com os livros.' },
} satisfies Record<string, Criativo>;

/* id conhecido, ou qualquer área (o slug vem do banco) */
export type IdCriativo = keyof typeof CRIATIVOS | `area-${string}`;

/** o criativo de um lugar; uma área sem criativo próprio cai no genérico */
export function criativo(id: IdCriativo): Criativo {
  const tudo = CRIATIVOS as Record<string, Criativo>;
  return tudo[id] || (id.startsWith('area-') ? tudo.area : tudo.heroi);
}

/** a proporção como número, para o CSS (aspect-ratio) */
export function razao(p: Proporcao): string {
  return p.replace(':', ' / ');
}
