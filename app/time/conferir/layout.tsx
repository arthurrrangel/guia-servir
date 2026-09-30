import type { Metadata } from 'next';
/* "absolute" pelo mesmo motivo de /painel/candidaturas: aninhada sob /time, o
   template do layout raiz não chegava aqui e a aba dizia só "Conferir nível". */
export const metadata: Metadata = { title: { absolute: 'Conferir nível · GUIA Church' } };
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
