/* =============================================================================
   A FOTO DE CADA ÁREA

   Mora aqui, e não dentro de cada tela, porque três telas mostram a mesma
   área e a foto tem que ser a mesma nas três: a home, a página do ministério
   e o acompanhamento da candidatura. Se cada uma escolhesse a sua, a pessoa
   veria uma foto diferente a cada clique do mesmo caminho.

   É um mapa por slug, não uma coluna no banco, porque hoje o arquivo mora no
   repositório. Quando o líder puder trocar a foto da própria área pelo painel
   (§23), isto vira `equipes.foto` e este arquivo só guarda o padrão.
   ============================================================================= */
const FOTO: Record<string, string> = {
  /* a foto da Mídia é a mesa, não o palco. Quem entra na área vai operar
     switcher, câmera e projeção; a foto do palco mostrava o resultado do
     trabalho de outra equipe. Esta mostra o trabalho em si, e o escuro dela
     ainda deixa o texto branco do herói com folga (luminância média 35). */
  midia: '/fotos/midia.webp',
  louvor: '/fotos/equipe.webp',    // a banda no domingo
  /* kids-2 e não kids-1 de propósito: a primeira é um retrato de rosto
     inteiro de uma criança, e essa foto ia virar a imagem de capa da área num
     site público. Esta mostra a atividade, com as crianças de cabeça baixa
     desenhando. Se a igreja tiver autorização de imagem assinada dos pais,
     dá para trocar; enquanto não tiver, a escolha é a menos identificável. */
  kids: '/fotos/kids-2.webp',
  servico: '/fotos/recepcao.webp', // quem recebe na porta
  /* ATENÇÃO: o original desta chegou com 278x297 px, e o herói da área é
     full-bleed. Está ampliada para 1200 e o véu de 62% preto do herói esconde
     boa parte da moleza, mas em tela grande ela amolece. Trocar assim que o
     arquivo original aparecer. */
  livraria: '/fotos/livraria.webp',
};

/* a igreja cheia serve para qualquer área que ainda não tenha foto própria */
export const fotoDaArea = (slug?: string | null) =>
  (slug && FOTO[slug]) || '/fotos/congregacao.webp';

/* -------------------------------------------------------------- O FOCO

   O herói da área é full-bleed: quase quadrado no celular, muito largo no
   monitor. O mesmo arquivo é cortado de dois jeitos diferentes, e um ponto
   focal só, fixo no CSS (50% 45%), acerta uma foto e erra outra.

   Mediu-se isso na Livraria: com 45% o corte de 1440px jogava fora a mão e o
   marca-texto (que é o assunto) e deixava no centro da tela o título da capa
   do livro, de cabeça para baixo, como o elemento mais legível da página.
   Subindo o foco, o corte largo passa a guardar a mão e o corte estreito do
   celular continua igual.

   Fica aqui, e não no CSS, porque foco é propriedade da FOTO, não da tela. */
const FOCO: Record<string, string> = {
  livraria: '50% 20%',   // a mão e o marca-texto, não a capa invertida
};

export const focoDaArea = (slug?: string | null) =>
  (slug && FOCO[slug]) || '50% 45%';
