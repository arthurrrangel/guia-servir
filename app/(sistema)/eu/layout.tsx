import type { Metadata } from 'next';
import { cartao } from '@/lib/meta';

/* =============================================================================
   O LAYOUT QUE PROTEGE O LINK PESSOAL

   Este layout vale para /eu E para /eu/[token]. Isso não é acidente: é a
   defesa. A página do token é 'use client' e não gera metadata própria, então
   o título e o card de prévia que saem no HTML são ESTES — fixos, iguais para
   todo mundo, sem nome e sem escala.

   Por que isso importa mais do que parece: quando alguém encaminha o link
   pessoal num grupo, o WhatsApp BUSCA a página para montar a prévia. Se o
   card fosse gerado a partir do conteúdo, a prévia mostraria o nome e a
   escala da pessoa para o grupo inteiro — sem ninguém abrir nada. Card
   genérico não é preguiça aqui; é requisito.

   Regra para quem mexer nisto depois: nada em /eu/* pode virar
   generateMetadata que leia o token. */
export const metadata: Metadata = {
  title: 'Espaço do voluntário',
  description: 'Sua escala, seus dias e seu líder. Acesse o seu espaço.',
  robots: { index: false, follow: false, nocache: true },
  ...cartao({ titulo: 'Espaço do voluntário', descricao: 'Acesso pessoal. Não repasse este link.', caminho: '/eu' }),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
