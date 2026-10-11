import type { Metadata } from 'next';

/* A aba "Culto" (109): o cronograma de cada culto. Tela do sistema, nunca
   indexa (o cabeçalho de next.config.mjs é a primeira trava; esta é a
   segunda). */
export const metadata: Metadata = {
  title: 'Culto',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
