import { IGREJA } from '@/lib/igreja';

/* =============================================================================
   OS TRÊS MODOS DE CHEGAR — 11/10/2026

   Moravam em dois arquivos iguais (app/cultos e app/como-chegar). O Arthur
   pediu o site "mais minimalista, menos texto embaixo": cada modo virou uma
   frase, cortada do texto dele de 08/09/2026 (as mesmas palavras, menos
   delas), e passou a existir num lugar só. O endereço sai de lib/igreja.ts
   para nunca divergir entre páginas.
   ============================================================================= */
export type Modo = { n: string; t: string; d: string; endereco?: string; d2?: string };

export const MODOS: Modo[] = [
  { n: '01', t: 'De carro',
    d: 'Nossa equipe orienta onde estacionar. Venha com 10 minutos de antecedência.' },
  { n: '02', t: 'De aplicativo',
    d: 'Insira o endereço no seu aplicativo:', endereco: `${IGREJA.rua}, ${IGREJA.bairro}`,
    d2: 'O desembarque é na entrada da GUIA Church.' },
  { n: '03', t: 'Chegando na nossa casa',
    d: 'Nossa equipe recebe você na entrada. Se for sua primeira vez, informe à recepção.' },
];

/** o modo em uma frase só, para o FAQ estruturado (schema.org) */
export const textoDoModo = (m: Modo) =>
  [m.d, m.endereco ? `${m.endereco}.` : '', m.d2 || ''].filter(Boolean).join(' ');
