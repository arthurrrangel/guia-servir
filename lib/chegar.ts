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

/* 19/10/2026, A COPY FINAL: o "Insira o endereço no seu aplicativo" e o "O
   desembarque é na entrada" (a linguagem de aeroporto) viraram conversa, e o
   "De carro" saiu daqui: o estacionamento é a primeira linha do "Antes de
   vir" (ANTES, abaixo), que a copy criou na /como-chegar. Travessões da
   copy viraram dois-pontos (regra do Arthur). */
export const MODOS: Modo[] = [
  { n: '01', t: 'De aplicativo',
    d: 'Copie o endereço e cole no seu app de preferência:', endereco: `${IGREJA.rua}, ${IGREJA.bairro}`,
    d2: 'O carro para bem na frente: você desce já na entrada da GUIA Church.' },
  { n: '02', t: 'Chegando na nossa casa',
    d: 'Quando você chegar, vai ter alguém na porta esperando por você. É a sua primeira vez? Fale na recepção: vai ser um prazer te mostrar a casa e te apresentar a GUIA pelo nome.' },
];

/** "Antes de vir": a lista prática da copy final (19/10/2026) */
export const ANTES = [
  { q: 'De carro?', r: 'A equipe cuida do estacionamento e te orienta onde parar.' },
  { q: 'Com crianças?', r: 'A GUIA Kids recebe os pequenos do berçário aos 12 anos.' },
  { q: 'Atrasou?', r: 'Entra assim mesmo. Ninguém vai olhar a hora.' },
];

/** o modo em uma frase só, para o FAQ estruturado (schema.org) */
export const textoDoModo = (m: Modo) =>
  [m.d, m.endereco ? `${m.endereco}.` : '', m.d2 || ''].filter(Boolean).join(' ');
