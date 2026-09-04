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
};

/* A LISTA (04/09/2026), enviada pelo Arthur. Do que veio, entra aqui só o
   que pode ser público: nome, dia, hora, bairro, primeiro nome de quem
   lidera. FICAM FORA, DE PROPÓSITO: o endereço das casas (com bloco e
   apartamento) e os telefones pessoais — este repositório é público, e a
   página é indexada. A planilha completa fica com a igreja. */
export const PEQUENAS_GUIAS: PequenaGuia[] = [
  { nome: 'Betel', bairro: 'Barra da Tijuca', referencia: `${IGREJA.nome}, ${IGREJA.rua}`,
    dia: 'Quinta', hora: '20h', lideres: 'Wagner e Andréia', publico: 'na igreja' },
  { nome: 'Elas', bairro: 'Barra da Tijuca', referencia: `${IGREJA.nome}, ${IGREJA.rua}`,
    dia: 'Terça', hora: '17h30', lideres: 'Sonia Cristina', publico: 'mulheres · na igreja' },
  { nome: 'Farol de Itaúna', bairro: 'Barra da Tijuca', referencia: 'Av. Prefeito Dulcídio Cardoso, Barra da Tijuca',
    dia: 'Quinta', hora: '20h', lideres: 'Jonatas e Joice' },
  { nome: 'Barraspace', bairro: 'Barra da Tijuca', referencia: 'Av. das Américas, 1155',
    dia: 'Quarta', hora: '20h', lideres: 'Valério e Vanja' },
  { nome: 'Shamah', bairro: 'Barra Olímpica',
    dia: 'Quinta', hora: '20h', lideres: 'Alexandre e Janaína' },
  { nome: 'Elohim', bairro: 'Recreio dos Bandeirantes',
    dia: 'Quarta', hora: '20h', lideres: 'Egnaldo e Allyne' },
  { nome: 'Bali', bairro: 'Recreio dos Bandeirantes',
    dia: 'Quarta', hora: '20h', lideres: 'Hugo e Fernanda', publico: 'jovens · Follow' },
  { nome: 'Seasons', bairro: 'Jacarepaguá',
    dia: 'Quarta', hora: '20h', lideres: 'Thiago e Nádia', publico: 'jovens · Follow' },
  { nome: 'Chosen', bairro: 'Marechal Hermes',
    dia: 'Quinta', hora: '19h30', lideres: 'Cláudio e Greice' },
  { nome: 'Sião', bairro: 'Cachambi',
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
