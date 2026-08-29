import type { Metadata } from 'next';

/* Sem isto, toda aba do líder (Painel, Escala, Time…) mostrava o mesmo título
   genérico no navegador — quem trabalha com duas abas abertas não distinguia
   qual era qual. O template do layout raiz vira "Entrar · GUIA Church". */
export const metadata: Metadata = { title: 'Entrar' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
