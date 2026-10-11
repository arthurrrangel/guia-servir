import type { Metadata } from 'next';
/* "absolute" pelo mesmo motivo de /ajustes/ministerios: aninhada sob /ajustes,
   o template do layout raiz não chegava aqui. */
export const metadata: Metadata = { title: { absolute: 'Aviso no celular · GUIA Church' }, robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
