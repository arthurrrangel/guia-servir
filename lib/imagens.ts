import fs from 'node:fs';
import path from 'node:path';

/* ESTE ARQUIVO É SÓ DE SERVIDOR. Ele lê o disco, e disco não existe no
   navegador. Um `import` dele a partir de um componente 'use client' passa
   pelo build calado enquanto ninguém usa o valor, e explode no dia em que
   alguém usar — que é o pior tipo de defeito: o que espera.

   Aconteceu comigo nesta sessão: importei FOTOS dentro de app/page.tsx, que é
   cliente, e o build continuou verde porque o import ficou sem uso. A guarda
   abaixo transforma isso num erro em vez de numa armadilha. */
if (typeof window !== 'undefined') {
  throw new Error(
    'lib/imagens.ts é só de servidor: ele lê public/fotos do disco. ' +
    'Renderize <Vaga> a partir de um componente de servidor.',
  );
}

/* =============================================================================
   O REGISTRO DE IMAGENS — a lista de produção do site, em código

   Cada foto que o site precisa e ainda não tem está aqui, com o nome do
   arquivo, a proporção e o que ela precisa mostrar. As páginas não sabem se a
   foto existe: elas pedem a vaga, e a vaga vira foto no minuto em que o
   arquivo aparecer em `public/fotos/`.

   POR QUE VERIFICAR NO DISCO, E NÃO POR UM `pronta: true` NA MÃO. Uma flag
   manual é uma segunda verdade: alguém salva a foto e esquece de virar a
   flag, ou vira a flag e a foto não subiu — e aí a página mostra um quadrado
   quebrado, que é o pior dos dois mundos. Aqui a única verdade é o arquivo.
   A checagem roda no BUILD (as páginas são estáticas), então não custa nada
   em produção; para ver uma foto nova é preciso um deploy, o que é exatamente
   o fluxo: a foto entra pelo repositório, como todo o resto.

   FOTO DE IGREJA É INSUMO, NÃO ENFEITE. Banco de imagem numa página de igreja
   é detectável e destrói confiança mais rápido do que qualquer texto ruim
   constrói. Toda vaga aqui pede foto REAL, feita na casa, com gente da casa.
   ============================================================================= */

export type Foto = {
  /** nome do arquivo dentro de public/fotos/ */
  arquivo: string;
  /** proporção CSS: "3/2", "4/5", "16/9" */
  proporcao: string;
  /** texto alternativo. Obrigatório — é acessibilidade e é SEO de imagem. */
  alt: string;
  /** o que a foto precisa mostrar. Aparece na vaga, é briefing de produção. */
  pede: string;
};

const DIR = path.join(process.cwd(), 'public', 'fotos');

/** Existe o arquivo? Lido do disco no build, nunca de uma flag na mão. */
export function existeFoto(arquivo: string): boolean {
  try { return fs.existsSync(path.join(DIR, arquivo)); } catch { return false; }
}

/* ---------------------------------------------------------------------------
   AS VAGAS, POR PÁGINA
   --------------------------------------------------------------------------- */

export const FOTOS = {
  /* --- /cultos ---------------------------------------------------------- */
  cultoAmplo: {
    arquivo: 'culto-amplo.webp', proporcao: '16/9',
    alt: 'Congregação reunida no culto de domingo da GUIA Church',
    pede: 'O salão cheio, do fundo para a frente, num domingo de manhã. Precisa mostrar quantidade de gente e luz natural — é a foto que responde “vai ter gente como eu ali?”.',
  },
  cultoLouvor: {
    arquivo: 'culto-louvor.webp', proporcao: '4/5',
    alt: 'Momento de louvor no culto de domingo',
    pede: 'O momento de louvor, do meio da congregação. Vertical. Gente cantando, não só o palco.',
  },
  cultoAcolhida: {
    arquivo: 'culto-acolhida.webp', proporcao: '4/5',
    alt: 'Equipe de acolhida recebendo pessoas na entrada',
    pede: 'A acolhida na porta, recebendo alguém. Vertical. É a prova visual de que ninguém chega e fica perdido.',
  },
  kids: {
    arquivo: 'culto-kids.webp', proporcao: '3/2',
    alt: 'Sala do GUIA Kids durante o culto',
    pede: 'A sala do Kids em atividade. Sem rosto de criança em primeiro plano identificável, ou com autorização dos pais — é o único bloco do site com essa restrição.',
  },

  /* --- /como-chegar ------------------------------------------------------ */
  entrada: {
    arquivo: 'entrada.webp', proporcao: '3/2',
    alt: 'Entrada da GUIA Church vista da calçada',
    pede: 'A porta de entrada vista de quem chega a pé pela calçada. Complementa a fachada: uma diz “é este prédio”, a outra diz “é por aqui que eu entro”.',
  },
  estacionamento: {
    arquivo: 'estacionamento.webp', proporcao: '3/2',
    alt: 'Acesso ao estacionamento da GUIA Church',
    pede: 'O acesso do carro, com a equipe de estacionamento no domingo. Tira a dúvida de onde entrar dirigindo.',
  },

  /* --- /sobre ------------------------------------------------------------ */
  povo: {
    arquivo: 'sobre-povo.webp', proporcao: '16/9',
    alt: 'Pessoas da GUIA Church conversando depois do culto',
    pede: 'Gente conversando DEPOIS do culto, no saguão ou na calçada. Não é foto de palco: é a foto que prova a palavra “relacionamento”.',
  },
  lideranca: {
    arquivo: 'sobre-lideranca.webp', proporcao: '3/2',
    alt: 'Liderança da GUIA Church',
    pede: 'A liderança. Fica pronta para entrar, mas o bloco só sobe quando estiver decidido como cada nome é apresentado — “Pastor Presidente” ou “Evangelista” ainda é decisão em aberto.',
  },

  /* --- /pequena-guia ----------------------------------------------------- */
  pgEncontro: {
    arquivo: 'pg-encontro.webp', proporcao: '16/9',
    alt: 'Encontro de uma Pequena Guia na casa de um membro',
    pede: 'Um encontro real, numa sala de casa, com comida na mesa. Luz de casa, não de estúdio. É a foto que diferencia Pequena Guia de “mais uma reunião de igreja”.',
  },
  pgRoda: {
    arquivo: 'pg-roda.webp', proporcao: '4/5',
    alt: 'Roda de conversa numa Pequena Guia',
    pede: 'A roda de conversa, vertical, de dentro do grupo. Poucas pessoas, próximas — o oposto de plateia.',
  },

  /* --- /guia-church-tv --------------------------------------------------- */
  tvPalavra: {
    arquivo: 'tv-palavra.webp', proporcao: '16/9',
    alt: 'Momento da palavra no culto de domingo',
    pede: 'O momento da palavra, enquadrado como capa de vídeo: espaço à esquerda ou à direita para o título entrar por cima depois.',
  },

  /* A HOME NÃO TEM VAGA, e é o único caso: ela é 'use client' (barra, menu,
     revelação ao rolar) e este registro lê o disco. Ela também é a única
     página que JÁ tem fotografia real — herói, fachada e congregação. Quando
     as fotos novas existirem, a home aproveita as mesmas por caminho direto,
     sem passar por aqui. */
} as const satisfies Record<string, Foto>;

/** Quantas vagas ainda faltam. Usado no relatório, não na página. */
export function vagasAbertas(): Foto[] {
  return Object.values(FOTOS).filter(f => !existeFoto(f.arquivo));
}
