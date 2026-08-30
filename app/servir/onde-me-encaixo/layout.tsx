import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Onde eu me encaixo',
  description: 'O que se faz de verdade em cada área de voluntários da GUIA Church, e as três dúvidas que travam quem nunca serviu.',
};
export default function Layout({ children }: { children: React.ReactNode }) { return <>{children}</>; }
