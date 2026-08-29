import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Espaço do voluntário',
  description: 'Sua escala, seus dias e seu líder. Acesse o seu espaço.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
