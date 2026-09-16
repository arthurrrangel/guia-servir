/* =============================================================================
   OS CRIATIVOS — cada imagem do site público, em um lugar só

   08/09/2026. O Arthur pediu espaço para criativos novos. Cada lugar que
   mostra uma imagem no site está registrado aqui com o arquivo ATUAL, a
   proporção em que o lugar corta, a largura mínima e a instrução para quem
   vai produzir a peça nova. As páginas não escrevem caminho de foto: pedem
   `src('cultos')`. Trocar um criativo é trocar UMA linha aqui.

   COMO TROCAR UM CRIATIVO
   1. Exportar em WebP na proporção do lugar, na largura indicada ou maior.
      Nome curto, sem espaço, sem acento.
   2. Salvar em public/criativos/ (as fotos antigas moram em public/fotos/).
   3. Trocar o `arquivo` do lugar, ex.: '/criativos/heroi.webp'. Só isso.

   `foco` é o ponto da imagem que não pode ser cortado ("50% 30%" = centro,
   um pouco acima): o mesmo arquivo é cortado quase quadrado no celular e
   muito largo no monitor. As fotos das ÁREAS (Mídia, Louvor...) têm o
   próprio registro em lib/fotos.ts, porque três telas mostram a mesma área.

   VÍDEO NO HERÓI (08/09/2026, pedido do Arthur). O lugar `heroi` aceita um
   `video`: MP4 (H.264 + AAC ausente, ou seja SEM faixa de áudio), horizontal,
   1920×1080, 10 a 20 segundos, até uns 8 MB. Salvar em public/criativos/ e
   escrever `video: '/criativos/heroi.mp4'` na linha do herói. A foto do
   `arquivo` continua sendo a capa (poster) enquanto o vídeo carrega, e vira a
   imagem definitiva para quem pediu "reduzir movimento" no aparelho. Sem a
   linha `video`, a home mostra a foto, como sempre.
   ============================================================================= */

export type Criativo = {
  /** o arquivo em public/ */
  arquivo: string;
  /** o que a imagem mostra, para quem não enxerga. Vazio quando é só clima. */
  alt: string;
  /** a proporção em que o lugar corta a imagem */
  proporcao: '16:9' | '21:9' | '16:8' | '4:3' | '1:1';
  /** largura mínima para não amolecer no monitor */
  largura: number;
  foco?: string;
  /** só no herói: o MP4 mudo em loop; a foto do `arquivo` é a capa */
  video?: string;
  /** 16/09/2026: o corte VERTICAL (4:5) do mesmo lugar, para telas até 899px.
      Uma foto horizontal cortada quase quadrada pelo navegador some com a
      pessoa; um corte feito à mão a mantém no centro. Gerado por
      scripts/cortes-celular.py a partir da foto original. */
  celular?: string;
  /** o mesmo arquivo em AVIF (20 a 40% menor que o WebP), quando existe;
      o <picture> oferece primeiro e o navegador que não lê cai no WebP */
  avif?: string;
  celularAvif?: string;
  /** a instrução para quem vai produzir a peça nova */
  nota: string;
};

export const CRIATIVOS = {
  /* ------------------------------------------------------------- a home */
  /* 16/09/2026: o palco vazio (palco.webp) saiu do herói. "Existe um lugar
     para você" sobre um palco com gente do tamanho de um grão dizia "o lugar é
     um prédio"; sobre a congregação, diz "o lugar é entre pessoas". No celular,
     o corte vertical feito à mão deixa o rosto em cima e o texto embaixo. */
  heroi: { arquivo: '/fotos/congregacao.webp', avif: '/fotos/congregacao.avif',
    celular: '/fotos/m/heroi.webp', celularAvif: '/fotos/m/heroi.avif',
    alt: '', proporcao: '16:9', largura: 2400, foco: '62% 45%',
    nota: 'A primeira tela do site, atrás do título branco: PESSOAS, de perto, olhando para a câmera ou em adoração; área escura embaixo para o texto. Dois arquivos: o horizontal (2400 de largura) e o vertical 4:5 para o celular (`celular`, 1080×1350). Aceita `video` (ver o cabeçalho).' },
  domingo: { arquivo: '/fotos/congregacao.webp', alt: 'Congregação reunida no culto de domingo', proporcao: '16:8', largura: 1600,
    nota: '"Como é o domingo", na home: a congregação, o salão, de dentro.' },
  fecho: { arquivo: '/fotos/oferta.webp', alt: '', proporcao: '16:9', largura: 2400,
    nota: 'O fim da home, atrás de uma frase branca. Clima, sem rosto no centro.' },

  /* ----------------------------------------------------------- /cultos */
  cultos: { arquivo: '/fotos/equipe.webp', alt: 'Momento de louvor no culto de domingo da GUIA Church', proporcao: '16:9', largura: 2400,
    nota: 'Herói de /cultos: o salão no domingo, de dentro.' },
  'cultos-acolhida': { arquivo: '/fotos/recepcao.webp', alt: '', proporcao: '4:3', largura: 1200, nota: 'Passo 01 do domingo: a porta, alguém recebendo.' },
  'cultos-louvor': { arquivo: '/fotos/teclado.webp', alt: '', proporcao: '4:3', largura: 1200, nota: 'Passo 02: a banda, o palco.' },
  'cultos-palavra': { arquivo: '/fotos/palavra.webp', alt: '', proporcao: '4:3', largura: 1200, nota: 'Passo 03: a mensagem, o telão.' },
  'cultos-saida': { arquivo: '/fotos/congregacao.webp', alt: '', proporcao: '4:3', largura: 1200, nota: 'Passo 04: oração e saída, a congregação.' },
  'cultos-fecho': { arquivo: '/fotos/palco.webp', alt: '', proporcao: '16:9', largura: 2400, nota: 'Azulejo "Participe de um culto", no fim de /cultos: o salão cheio, de dentro.' },

  /* ------------------------------------------------------------ /sobre */
  sobre: { arquivo: '/fotos/congregacao.webp', alt: 'Congregação da GUIA Church reunida', proporcao: '16:9', largura: 2400,
    nota: 'Herói de /sobre: o prédio ou a congregação, de longe.' },
  palavra: { arquivo: '/fotos/palavra.webp', alt: '', proporcao: '21:9', largura: 2400,
    nota: 'Atrás do versículo em /sobre. Escuro, quase abstrato: a frase é o assunto.' },
  'sobre-fecho': { arquivo: '/fotos/acolhida.webp', alt: '', proporcao: '16:9', largura: 2400, nota: 'Fecho de /sobre.' },

  /* ----------------------------------------------------------- /servir */
  servir: { arquivo: '/fotos/midia.webp', alt: 'Equipe Creative na mesa de transmissão do culto', proporcao: '16:9', largura: 2400,
    nota: 'Herói de /servir: quem chega antes, de costas ou de lado, trabalhando.' },
  encaixo: { arquivo: '/fotos/recepcao.webp', alt: 'Duas pessoas da equipe de recepção conversando na porta da igreja', proporcao: '16:9', largura: 2400,
    nota: 'Herói de /servir/onde-me-encaixo.' },
  'encaixo-fecho': { arquivo: '/fotos/congregacao.webp', alt: '', proporcao: '16:9', largura: 2400, nota: 'Fecho de /servir/onde-me-encaixo.' },
  'area-fecho': { arquivo: '/fotos/palco.webp', alt: '', proporcao: '16:9', largura: 2400, nota: 'Fecho das páginas de área (/servir/<área>).' },

  /* ----------------------------------------------------- /pequena-guia */
  grupos: { arquivo: '/fotos/acolhida.webp', alt: 'Pessoas da GUIA Church se cumprimentando', proporcao: '16:9', largura: 2400,
    nota: 'Herói de /pequena-guia: uma sala de casa, gente sentada perto. Sem rosto de criança.' },
  'grupos-fecho': { arquivo: '/fotos/congregacao.webp', alt: '', proporcao: '16:9', largura: 2400, nota: 'Fecho de /pequena-guia.' },

  /* ------------------------------------------------------ /como-chegar */
  chegar: { arquivo: '/fotos/predio.webp', alt: 'Fachada da GUIA Church na Rua Pedra de Itaúna', proporcao: '16:9', largura: 2400,
    nota: 'Herói de /como-chegar: A FACHADA, de frente, de dia. É a foto que faz a pessoa reconhecer a porta.' },
  'chegar-fecho': { arquivo: '/fotos/recepcao.webp', alt: '', proporcao: '16:9', largura: 2400, nota: 'Fecho de /como-chegar.' },

  /* ---------------------------------------------------------- /acessar */
  'acesso-voluntario': { arquivo: '/fotos/equipe.webp', alt: '', proporcao: '1:1', largura: 900, nota: 'Azulejo "Sou voluntário".' },
  'acesso-organizacao': { arquivo: '/fotos/midia.webp', alt: '', proporcao: '1:1', largura: 900, nota: 'Azulejo "Sou da organização".' },
  'acesso-participar': { arquivo: '/fotos/acolhida.webp', alt: '', proporcao: '1:1', largura: 900, nota: 'Azulejo "Quero participar".' },

  /* ------------------------------------------------------------ outros */
  tv: { arquivo: '/fotos/palco.webp', alt: '', proporcao: '16:9', largura: 2400,
    nota: 'Herói de /guia-church-tv: o palco visto da mesa de transmissão, ou a câmera.' },
  'nao-encontrada': { arquivo: '/fotos/predio.webp', alt: '', proporcao: '16:9', largura: 2400, nota: 'A página 404.' },
} satisfies Record<string, Criativo>;

export type IdCriativo = keyof typeof CRIATIVOS;

/** o caminho do arquivo de um lugar */
export function src(id: IdCriativo): string {
  return CRIATIVOS[id].arquivo;
}

/** o texto alternativo de um lugar */
export function alt(id: IdCriativo): string {
  return CRIATIVOS[id].alt;
}

/** o vídeo de um lugar, quando registrado (hoje só o herói aceita) */
export function video(id: IdCriativo): string | null {
  return (CRIATIVOS[id] as Criativo).video ?? null;
}

/** as fontes de um <picture>: o corte do celular (até 899px) e o AVIF antes do
 *  WebP, cada um só quando o lugar tem o arquivo. A ordem importa: o navegador
 *  usa a PRIMEIRA <source> que casa mídia e tipo. */
export function fontes(id: IdCriativo): { media?: string; type?: string; srcSet: string }[] {
  const c = CRIATIVOS[id] as Criativo;
  const f: { media?: string; type?: string; srcSet: string }[] = [];
  if (c.celularAvif) f.push({ media: '(max-width: 899px)', type: 'image/avif', srcSet: c.celularAvif });
  if (c.celular) f.push({ media: '(max-width: 899px)', srcSet: c.celular });
  if (c.avif) f.push({ type: 'image/avif', srcSet: c.avif });
  return f;
}
