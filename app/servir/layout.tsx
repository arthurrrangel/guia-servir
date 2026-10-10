import type { Metadata } from 'next';
import { cartao } from '@/lib/meta';
import './servir.css';

/* O título da aba e o card do WhatsApp desta tela: sem isso ela herdava o
   título da home, e um link de "quero servir" colado num grupo aparecia como
   se fosse a página inicial da igreja.

   10/10/2026: a descrição passou a ser a frase do herói da identidade nova
   (copy "LP GUIA SERVIR"). A folha servir.css entra por aqui: ela veste só
   a /servir (escopo `.sv`); as páginas filhas a carregam sem serem tocadas. */
export const metadata: Metadata = {
  title: 'Servir',
  description: 'Existe um lugar para você. Deus semeou dons em cada pessoa; o seu também tem um posto esperando. Escolha uma área, conheça o que ela faz e entre para a equipe.',
  /* canônica explícita: /servir é indexável e é a porta pública de quem ainda
     não serve. Sem ela, qualquer variação de URL (utm do Instagram, barra no
     fim) vira uma segunda página aos olhos do Google. */
  alternates: { canonical: '/servir' },
  ...cartao({ titulo: 'Existe um lugar para você', descricao: 'Deus semeou dons em cada pessoa. O seu também tem um posto esperando: escolha uma área e entre para a equipe.', caminho: '/servir', imagem: 'servir' }),
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
