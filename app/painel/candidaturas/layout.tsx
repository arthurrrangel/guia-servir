import type { Metadata } from 'next';

/* Sem isto, toda aba do líder (Painel, Escala, Time…) mostrava o mesmo título
   genérico no navegador — quem trabalha com duas abas abertas não distinguia
   qual era qual. O template do layout raiz vira "Entradas · GUIA Church". */
export const metadata: Metadata = { title: 'Entradas' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
