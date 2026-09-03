import type { Metadata } from 'next';

/* O título da aba e o card do WhatsApp desta tela: sem isso ela herdava o
   título da home, e um link de "quero servir" colado num grupo aparecia como
   se fosse a página inicial da igreja. */
export const metadata: Metadata = {
  title: 'Servir',
  description: 'Escolha uma área para ver o que ela faz, quais funções existem e como entrar para a equipe.',
  /* canônica explícita: /servir é indexável e é a porta pública de quem ainda
     não serve. Sem ela, qualquer variação de URL (utm do Instagram, barra no
     fim) vira uma segunda página aos olhos do Google. */
  alternates: { canonical: '/servir' },
  openGraph: {
    title: 'Servir · GUIA Church',
    description: 'Todo trabalho conta. Encontre uma área onde você pode contribuir.',
    type: 'website', locale: 'pt_BR',
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
