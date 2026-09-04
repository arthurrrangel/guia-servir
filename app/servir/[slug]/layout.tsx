import type { Metadata } from 'next';
import { cartao } from '@/lib/meta';
import { rpcPublica } from '@/lib/publico';

/* A prévia do link no WhatsApp lê o HTML do servidor, e a página é client
   component: sem este layout o card sai com o título genérico do site. A
   descrição da área, que já está no banco, vira o texto do card, então o link
   compartilhado no grupo já explica o que a área faz antes de alguém tocar.

   Este é o link que mais circula. Vale o server component. */

type Min = { slug: string; nome: string; descricao: string | null };

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const lista = await rpcPublica<Min[]>('ministerios_publicos');
  const m = (Array.isArray(lista) ? lista : []).find(x => x.slug === slug) || null;

  const titulo = m?.nome || 'Áreas';
  const desc = m?.descricao || 'Conheça as áreas onde você pode servir na GUIA Church.';
  return {
    title: titulo,
    description: desc,
    ...cartao({ titulo, descricao: desc, caminho: '/servir', imagem: 'servir' }),
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
