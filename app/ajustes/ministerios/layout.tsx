import type { Metadata } from 'next';
/* "absolute" pelo mesmo motivo de /painel/candidaturas: aninhada sob /ajustes,
   o template do layout raiz não chegava aqui e a aba dizia só "Ministérios". */
export const metadata: Metadata = { title: { absolute: 'Ministérios · GUIA Church' } };
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
