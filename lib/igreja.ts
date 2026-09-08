/* =============================================================================
   OS FATOS DA IGREJA, EM UM LUGAR SÓ

   Endereço, horário e canais estavam escritos à mão dentro de `app/page.tsx`.
   Enquanto a home era a única página pública, isso era inofensivo. Agora que
   existem seis páginas falando das mesmas coisas, cada cópia é uma chance de
   uma delas envelhecer sozinha — e endereço divergente entre páginas é
   exatamente o erro de SEO local que mais custa caro (o Google usa NAP
   idêntico para saber que é a mesma entidade).

   Regra: nenhuma página escreve endereço, horário, mapa ou @ na mão. Tudo
   sai daqui.
   ============================================================================= */

export const IGREJA = {
  nome: 'GUIA Church',
  /* o que o Google lê como nome da entidade. O domínio diz "guiaservir";
     tudo o que é LIDO diz GUIA Church, e é isso que forma a entidade. */
  nomeLegal: 'GUIA Church',
  frase: 'Cultivando uma nova cultura',

  rua: 'Rua Pedra de Itaúna, 534',
  bairro: 'Barra da Tijuca',
  cidade: 'Rio de Janeiro',
  uf: 'RJ',
  cep: '22793-390',
  /* [lat, lon] da porta da igreja, geocodificado pelo Nominatim a partir do
     endereço acima e conferido pelo display_name (07/09/2026). É o pino da
     igreja no mapa da cidade e o ponto das Pequenas Guias que acontecem nela. */
  coord: [-23.01036, -43.42369] as [number, number],

  /* domingo, 10h. Corrigido pelo Arthur em 03/09 — o material antigo dizia
     outra hora e chegou a circular. Uma fonte só evita a próxima divergência. */
  cultoDia: 'Domingo',
  cultoHora: '10h',
  /* O FOLLOW, culto de jovens: sábados do mês, menos o primeiro (dito pelo
     Arthur em ago/2026). O HORÁRIO não está confirmado em lugar nenhum e por
     isso é null: enquanto for, o site diz "Sábado · Follow" sem hora. Quando
     a igreja confirmar, escrever aqui ("19h") liga a hora em todas as telas. */
  followHora: null as string | null,

  instagram: 'https://instagram.com/guiachurch',
  instagramArroba: '@guiachurch',

  /* ------------------------------------------------------------------------
     OS DOIS CANAIS QUE AINDA NÃO TÊM DONO DECIDIDO

     WHATSAPP: o número que existe hoje é o da secretaria, e publicar o
     telefone de uma pessoa numa página indexável é decisão da igreja, não
     minha. Enquanto for null, todo CTA de contato cai no Instagram, que já é
     público e confirmado. Preencher aqui liga o botão de WhatsApp em todas as
     páginas de uma vez — formato: só dígitos, com 55 na frente.

     YOUTUBE: a decisão 02 da arquitetura está aberta. O canal que a igreja
     chama de "Guia Church TV" está publicado sob outra marca, e @guiachurchtv
     tem um vídeo. Linkar o canal errado numa página pública é pior do que não
     linkar: enquanto for null, /guia-church-tv sai do sitemap sozinha (ver
     app/sitemap.ts) e a página fala do domingo sem prometer um acervo que a
     pessoa não vai encontrar.
     ------------------------------------------------------------------------ */
  whatsapp: null as string | null,
  youtube: null as string | null,
} as const;

export const ENDERECO_LINHA =
  `${IGREJA.rua} · ${IGREJA.bairro}, ${IGREJA.cidade}, ${IGREJA.uf} · ${IGREJA.cep}`;

export const MAPA =
  'https://www.google.com/maps/search/?api=1&query=' +
  encodeURIComponent(
    `${IGREJA.nome}, ${IGREJA.rua}, ${IGREJA.bairro}, ${IGREJA.cidade}, ${IGREJA.uf}, ${IGREJA.cep}`,
  );

/* O embed do Google Maps SEM chave de API: é a URL de "compartilhar → incorporar",
   que o Google serve para qualquer domínio. Uma chave (Maps Embed API) daria
   controle de estilo e cota, mas exigiria conta de faturamento — e o mapa
   tratado por CSS chega no mesmo lugar sem isso. Se um dia houver chave, a
   troca é só esta constante. */
export const MAPA_EMBED =
  'https://www.google.com/maps?q=' +
  encodeURIComponent(`${IGREJA.nome}, ${IGREJA.rua}, ${IGREJA.bairro}, ${IGREJA.cidade}`) +
  '&z=16&hl=pt-BR&output=embed';

export const ROTA_WAZE =
  'https://waze.com/ul?q=' + encodeURIComponent(`${IGREJA.rua}, ${IGREJA.bairro}, ${IGREJA.cidade}`);

export const SITE = 'https://guiaservir.com';

/** O canal de conversa que existe hoje. Vira WhatsApp no dia em que o número
 *  entrar em IGREJA.whatsapp — nenhuma página precisa saber qual dos dois é. */
export function canalDeConversa(texto?: string): { href: string; rot: string } {
  if (IGREJA.whatsapp) {
    return {
      href: `https://wa.me/${IGREJA.whatsapp}` + (texto ? `?text=${encodeURIComponent(texto)}` : ''),
      rot: 'Falar no WhatsApp',
    };
  }
  return { href: IGREJA.instagram, rot: `Falar no Instagram` };
}

/* =============================================================================
   A SIGLA, EM UM LUGAR SÓ
   07/09/2026. Esta lista estava escrita à mão em DOIS arquivos: o `SIGLA` da
   home e os quatro azulejos da /sobre. Foi exatamente por isso que ela
   divergiu: a frase da igreja diz "Grupo Unido, Interagindo e Avançando" e os
   azulejos dos dois lugares diziam "Unidos" — plural, na mesma tela em que a
   itálica logo acima escrevia o singular. O Arthur pegou.

   Trocar a palavra nos dois conserta hoje. Tirar a duplicação conserta
   sempre: com uma fonte só, o próximo ajuste de texto não tem como pegar
   metade das telas.

   `l` é a letra ('>' vira o chevron da marca na hora de desenhar), `t` a
   palavra e `d` a linha que ela ganha onde há espaço para descrição.
============================================================================= */
export const SIGLA = [
  { l: 'G', t: 'Grupo', d: 'Somos um povo. Não caminhamos isoladamente.' },
  { l: 'U', t: 'Unido', d: 'Cada pessoa tem um papel na construção de algo maior do que si mesma.' },
  { l: 'I', t: 'Interagindo', d: 'Cultura se constrói por relacionamento, comunicação e participação.' },
  { l: '>', t: 'Avançando', d: 'Um povo unido, que se comunica e anda na mesma direção, tem força para avançar.' },
];

/** A sigla escrita como frase.
 *
 *  ELA É LITERAL, E ISSO É DE PROPÓSITO. Minha primeira versão gerava a frase
 *  a partir da lista com um join, e saiu "Grupo, Unido, Interagindo e
 *  Avançando" — com vírgula onde não pode haver. A sigla não é uma enumeração
 *  de quatro palavras: "Grupo Unido" é um sintagma, o adjetivo qualifica o
 *  substantivo, e só depois dele a enumeração começa. Nenhuma regra genérica
 *  de lista sabe disso.
 *
 *  Escrita à mão, mas AQUI, ao lado da lista: quem mudar uma vê a outra na
 *  mesma tela. Era a distância entre os dois arquivos que deixava divergir. */
export const SIGLA_FRASE = 'Grupo Unido, Interagindo e Avançando';
