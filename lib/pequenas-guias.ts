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
  /** como o grupo é chamado: "PG do Recreio", "Casa da Ana" — o que a
      igreja usa, sem sobrenome de ninguém */
  nome: string;
  /** o bairro, exatamente como aparece no mapa */
  bairro: string;
  /** opcional: um ponto de referência PÚBLICO para o mapa cair mais perto
      (uma praça, uma rua sem número, um shopping). Nunca a casa. */
  referencia?: string;
  dia: 'Segunda' | 'Terça' | 'Quarta' | 'Quinta' | 'Sexta' | 'Sábado';
  hora: string;
  /** para quem é, em três palavras: "casais", "jovens", "aberto a todos" */
  publico?: string;
};

export const PEQUENAS_GUIAS: PequenaGuia[] = [
  /* exemplo do formato — apagar quando o primeiro grupo real entrar:
  { nome: 'PG da Barra', bairro: 'Barra da Tijuca', referencia: 'Praça do Ó',
    dia: 'Quarta', hora: '20h', publico: 'aberto a todos' },
  */
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
