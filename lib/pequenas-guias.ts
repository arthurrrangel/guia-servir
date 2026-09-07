import { IGREJA } from './igreja';

/* =============================================================================
   AS PEQUENAS GUIAS — o registro, e o mapa de cada uma

   Cada grupo entra aqui com nome, bairro, dia e hora. A página /pequena-guia
   monta um mapa por grupo a partir disto. A lista começa VAZIA de propósito:
   não existe, hoje, uma relação confirmada de grupos com dia e bairro — e
   página de igreja não é lugar de dado inventado. Enquanto ela estiver
   vazia, a página mostra o mapa da região e o convite; no primeiro grupo
   cadastrado, ele ganha o próprio mapa.

   O QUE NÃO ENTRA, E POR QUÊ: o endereço da casa. Pequena Guia acontece na
   casa de alguém. Publicar rua e número numa página indexável pelo Google é
   expor a casa de uma família a qualquer pessoa — problema de LGPD e de
   segurança real. O mapa aponta o BAIRRO (ou um ponto de referência
   público, como uma praça ou uma rua sem número); o endereço exato é dito
   na conversa, para quem vai.
   ============================================================================= */

export type PequenaGuia = {
  /** como o grupo é chamado, sem sobrenome de ninguém */
  nome: string;
  /** o bairro, exatamente como aparece no mapa. Para grupo online, "Online". */
  bairro: string;
  /** opcional: um endereço PÚBLICO para o mapa cair mais perto — a igreja,
      um prédio comercial, uma avenida sem número. Nunca a casa. */
  referencia?: string;
  dia: 'Segunda' | 'Terça' | 'Quarta' | 'Quinta' | 'Sexta' | 'Sábado';
  hora: string;
  /** primeiro nome de quem lidera — é o rosto do grupo, e é público na igreja */
  lideres?: string;
  /** para quem é, em poucas palavras */
  publico?: string;
  /** grupo que acontece por vídeo: sem mapa, com o nome da plataforma */
  online?: string;
  /** [lat, lon] do PONTO PÚBLICO do grupo. Ver a nota sobre a origem destes
      números logo abaixo: são geocodificados e conferidos, não estimados. */
  coord?: [number, number];
};

/* =============================================================================
   DE ONDE VÊM AS COORDENADAS

   07/09/2026. O mapa único com um pino por grupo precisa de latitude e
   longitude, e este arquivo tem uma regra que não podia ser quebrada para
   consegui-las: "página de igreja não é lugar de dado inventado". Chutar
   coordenada de bairro de memória é exatamente isso, e o erro sai bonito na
   tela — um pino no lugar errado parece tão certo quanto um pino no lugar
   certo.

   Então foram geocodificadas pelo Nominatim (OpenStreetMap) a partir das
   MESMAS strings que já estavam neste arquivo, e cada resultado foi conferido
   pelo `display_name` que voltou: os dez caíram no bairro esperado. Quem tem
   `referencia` recebeu a coordenada da referência; quem só tem `bairro`
   recebeu o centro do bairro, que é a promessa que a página faz.

   O QUE NÃO MUDOU: a casa continua fora. Um pino no centro de Recreio dos
   Bandeirantes diz "existe um grupo nesta região", que é o que a página
   sempre disse. O endereço continua saindo na conversa, com quem vai.
============================================================================= */

/* A LISTA (04/09/2026), enviada pelo Arthur. Do que veio, entra aqui só o
   que pode ser público: nome, dia, hora, bairro, primeiro nome de quem
   lidera. FICAM FORA, DE PROPÓSITO: o endereço das casas (com bloco e
   apartamento) e os telefones pessoais — este repositório é público, e a
   página é indexada. A planilha completa fica com a igreja. */
export const PEQUENAS_GUIAS: PequenaGuia[] = [
  { nome: 'Betel', coord: [-23.01036, -43.42369], bairro: 'Barra da Tijuca', referencia: `${IGREJA.nome}, ${IGREJA.rua}`,
    dia: 'Quinta', hora: '20h', lideres: 'Wagner e Andréia', publico: 'na igreja' },
  { nome: 'Elas', coord: [-23.01036, -43.42369], bairro: 'Barra da Tijuca', referencia: `${IGREJA.nome}, ${IGREJA.rua}`,
    dia: 'Terça', hora: '17h30', lideres: 'Sonia Cristina', publico: 'mulheres · na igreja' },
  { nome: 'Farol de Itaúna', coord: [-23.00528, -43.36117], bairro: 'Barra da Tijuca', referencia: 'Av. Prefeito Dulcídio Cardoso, Barra da Tijuca',
    dia: 'Quinta', hora: '20h', lideres: 'Jonatas e Joice' },
  { nome: 'Barraspace', coord: [-23.00495, -43.42962], bairro: 'Barra da Tijuca', referencia: 'Av. das Américas, 1155',
    dia: 'Quarta', hora: '20h', lideres: 'Valério e Vanja' },
  { nome: 'Shamah', coord: [-22.97135, -43.38672], bairro: 'Barra Olímpica',
    dia: 'Quinta', hora: '20h', lideres: 'Alexandre e Janaína' },
  { nome: 'Elohim', coord: [-23.01852, -43.46340], bairro: 'Recreio dos Bandeirantes',
    dia: 'Quarta', hora: '20h', lideres: 'Egnaldo e Allyne' },
  { nome: 'Bali', coord: [-23.01852, -43.46340], bairro: 'Recreio dos Bandeirantes',
    dia: 'Quarta', hora: '20h', lideres: 'Hugo e Fernanda', publico: 'jovens · Follow' },
  { nome: 'Seasons', coord: [-22.95317, -43.37158], bairro: 'Jacarepaguá',
    dia: 'Quarta', hora: '20h', lideres: 'Thiago e Nádia', publico: 'jovens · Follow' },
  { nome: 'Chosen', coord: [-22.85997, -43.37046], bairro: 'Marechal Hermes',
    dia: 'Quinta', hora: '19h30', lideres: 'Cláudio e Greice' },
  { nome: 'Sião', coord: [-22.88977, -43.27433], bairro: 'Cachambi',
    dia: 'Quinta', hora: '19h', lideres: 'Emílio e Selma' },
  { nome: 'Kairós', bairro: 'Online', online: 'Google Meet ou Zoom',
    dia: 'Quarta', hora: '20h', lideres: 'Fagner e Joice' },
  { nome: 'Online', bairro: 'Online', online: 'Discord',
    dia: 'Quinta', hora: '20h', lideres: 'Will, Giovana e Lucas', publico: 'jovens · Follow' },
];

/** A URL do embed (sem chave) centrada no bairro ou na referência. */
export function mapaDaPequenaGuia(pg: PequenaGuia): string {
  const alvo = pg.referencia
    ? `${pg.referencia}, ${pg.bairro}, ${IGREJA.cidade}`
    : `${pg.bairro}, ${IGREJA.cidade}, ${IGREJA.uf}`;
  return 'https://www.google.com/maps?q=' + encodeURIComponent(alvo) +
    (pg.referencia ? '&z=15' : '&z=13') + '&hl=pt-BR&output=embed';
}

/** O mapa da região inteira, para quando a lista ainda está vazia. */
export const MAPA_REGIAO =
  'https://www.google.com/maps?q=' +
  encodeURIComponent(`${IGREJA.bairro}, ${IGREJA.cidade}, ${IGREJA.uf}`) +
  '&z=12&hl=pt-BR&output=embed';

/* =============================================================================
   O BOTÃO DE NAVEGAR SÓ APARECE ONDE EXISTE PARA ONDE NAVEGAR

   Waze pede um destino. Quatro grupos têm `referencia` — um endereço público
   de verdade (a igreja, uma avenida) — e para esses o link leva a pessoa até
   a porta. Os outros seis têm só o bairro, e mandar o Waze para o centro de
   Jacarepaguá não é navegação: é um botão que promete "te levo lá" e larga a
   pessoa a dois quilômetros de um endereço que a página nunca publicou.

   Por isso a função devolve null nesse caso, e o cartão mostra a conversa,
   que é onde o endereço realmente está. Botão que mente é pior que botão que
   falta.
============================================================================= */
export function wazeDaPequenaGuia(pg: PequenaGuia): string | null {
  if (pg.online || !pg.referencia) return null;
  const alvo = `${pg.referencia}, ${pg.bairro}, ${IGREJA.cidade}`;
  return 'https://waze.com/ul?q=' + encodeURIComponent(alvo) + '&navigate=yes';
}

/** Google Maps, que é o que a maioria tem instalado. Vale para todo grupo com
    ponto no mapa: aqui a pessoa VÊ o lugar, não é promessa de rota. */
export function mapaExterno(pg: PequenaGuia): string | null {
  if (pg.online || !pg.coord) return null;
  return 'https://www.google.com/maps/search/?api=1&query=' + pg.coord[0] + '%2C' + pg.coord[1];
}
