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

  /* domingo, 10h. Corrigido pelo Arthur em 03/09 — o material antigo dizia
     outra hora e chegou a circular. Uma fonte só evita a próxima divergência. */
  cultoDia: 'Domingo',
  cultoHora: '10h',
  cultoDuracao: 90,

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
