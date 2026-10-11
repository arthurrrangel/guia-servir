import type { Metadata } from 'next';

/* "absolute" porque esta rota fica aninhada sob /painel: sem ele o template do
   titulo (definido no layout raiz) nao chegava ate aqui, e a aba do navegador
   vinha so "Entradas", sem o "· GUIA Church" que as outras telas do lider tem. */
export const metadata: Metadata = { title: { absolute: 'Entradas · GUIA Church' } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
