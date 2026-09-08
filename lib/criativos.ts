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

export const CRIATIVOS: Record<string, Criativo> = {
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
    nota: 'O fim da home, atrás de uma frase branca. Clima, sem rosto no centro.',
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
};

export type IdCriativo = 'heroi' | 'domingo' | 'fecho' | 'cultos' | 'grupos' | 'servir' | 'sobre';

/** a proporção como número, para o CSS (aspect-ratio) */
export function razao(p: Proporcao): string {
  return p.replace(':', ' / ');
}
