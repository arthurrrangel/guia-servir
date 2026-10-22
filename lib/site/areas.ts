/* =============================================================================
   AS CINCO ÁREAS, COMO O SITE FALA DELAS · 11/10/2026

   O banco sabe o que muda (postos, se a área está aberta, as funções, quem
   responde). O site sabe o que não muda: o nome público, a frase do cartão
   (tela 4 da apresentação), o parágrafo, a linha curta, o convite da página
   da área. Copy nova, na voz da apresentação: curta, direta, "pra".

   O slug `servico` é da área Connect por história: a URL já foi divulgada.
   ============================================================================= */
export type Area = {
  nome: string;
  /** o que a área faz, numa frase que convida (o itálico do cartão) */
  frase: string;
  /** o parágrafo do cartão (tela 4) */
  texto: string;
  /** uma linha, para onde só cabe uma linha */
  linha: string;
  artigo: 'a' | 'o';
  /** valores de partida até o banco responder */
  postos: number;
  aberto: boolean;
  /** a página da área: o que se espera de quem entra, em duas ou três frases */
  convite?: string;
  /** para quem é */
  perfil?: string;
};

export const AREAS: Record<string, Area> = {
  midia: {
    nome: 'Mídia', artigo: 'a', postos: 10, aberto: true,
    frase: 'Faça a mensagem chegar longe',
    texto: 'Da letra no telão à foto que alcança quem ainda não conhece a casa, passando pela transmissão pra quem acompanha de longe. Tem posto até pra quem prefere servir na semana: a edição é a única que não exige estar no domingo.',
    linha: 'Imagem, luz, som e transmissão.',
    convite: 'Você não precisa saber operar nada. Precisa gostar de câmera, de computador ou de edição, e querer aprender. O resto a equipe ensina no próprio domingo.',
    perfil: 'Pra quem gosta de tecnologia e de bastidor.',
  },
  louvor: {
    nome: 'Louvor', artigo: 'o', postos: 8, aberto: false,
    frase: 'Conduza a igreja à presença de Deus',
    texto: 'Do dirigente ao som, cada posto sustenta o ambiente pra que alguém tenha um encontro verdadeiro com o Pai. Se você toca, canta ou opera mesa, há um lugar pra você. A liderança conversa com você antes de escalar, porque adoração também se caminha em comunhão.',
    linha: 'Música e serviço para um encontro com Deus.',
    convite: 'Toca, canta ou opera mesa? Preenche o cadastro e a liderança do Louvor chama você pra uma conversa: entender seu instrumento, sua disponibilidade e onde você se encaixa.',
    perfil: 'Pra quem toca, canta ou opera som.',
  },
  kids: {
    nome: 'GUIA Kids', artigo: 'o', postos: 9, aberto: false,
    frase: 'Plante fé desde pequeno',
    texto: 'Do berçário à turma de 8 a 12 anos, cada sala precisa de duas voluntárias por culto: uma conduz, outra apoia. Tem também posto de lanche. Servir criança pede preparo, então a conversa vem antes da escala. Sempre. A semente de hoje é a fé de amanhã.',
    linha: 'Fé plantada no coração das crianças.',
    convite: 'Servir criança pede preparo, por isso a conversa com a liderança vem antes da escala. Você preenche o cadastro, a liderança chama você, e vocês decidem juntos a sala.',
    perfil: 'Pra quem tem paciência e alegria com criança.',
  },
  servico: {
    nome: 'Connect', artigo: 'o', postos: 18, aberto: true,
    frase: 'Receba cada pessoa como família',
    texto: 'É a maior equipe da igreja, e não por acaso: recepção, estacionamento, visitantes, segurança, cozinha, setor. Quem chega pela primeira vez encontra um rosto seu antes de encontrar o púlpito. Hospitalidade também é ministério.',
    linha: 'Acolher cada pessoa que chega à nossa casa.',
    convite: 'É a porta de entrada da igreja, e a área com mais postos. Se você gosta de gente, de receber bem e de resolver, tem lugar pra você já no próximo domingo.',
    perfil: 'Pra quem gosta de gente.',
  },
  livraria: {
    nome: 'Livraria', artigo: 'a', postos: 2, aberto: true,
    frase: 'Leve o culto pra fora dele',
    texto: 'Duas pessoas por domingo: uma abre antes do culto, as duas atendem na saída. Se você gosta de livros e de conversar com gente, é aqui. Cada recurso que sai da sua mão acompanha alguém na caminhada da semana.',
    linha: 'Recursos que prolongam o culto durante a semana.',
    convite: 'Dois postos por domingo, e uma conversa que começa na mesa de livros e continua na semana de quem levou um pra casa.',
    perfil: 'Pra quem gosta de livros e de conversar.',
  },
};

export const AREAS_ORDEM = ['midia', 'louvor', 'kids', 'servico', 'livraria'];

/* 21/10/2026, pedido do Arthur: quando a copy fala em "áreas", diz quais são.
   Os nomes saem daqui, na ordem do site: "Mídia, Louvor, GUIA Kids, Connect e
   Livraria" (a frase de cada uma, quando cabe, é a `linha`) */
export const NOMES_AREAS: readonly string[] = AREAS_ORDEM.map(k => AREAS[k].nome);
export function listaDeNomes(nomes: readonly string[]): string {
  return nomes.length < 2 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}
