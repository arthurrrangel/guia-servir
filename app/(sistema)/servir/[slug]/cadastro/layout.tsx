import type { Metadata } from 'next';
import { cartao } from '@/lib/meta';
import { rpcPublica } from '@/lib/publico';

/* O wizard é o link que mais vai circular no grupo. A prévia precisa dizer o
   nome da área e um convite — não "GUIA Servir" genérico. */

type Min = { slug: string; nome: string; convite: string | null };

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const lista = await rpcPublica<Min[]>('ministerios_publicos');
  const m = (Array.isArray(lista) ? lista : []).find(x => x.slug === slug) || null;

  const titulo = m ? `Quero servir · ${m.nome}` : 'Quero servir';
  const desc = m?.convite || 'Faça seu cadastro para servir na igreja GUIA. Leva menos de um minuto.';
  return {
    title: titulo,
    description: desc,
    ...cartao({ titulo, descricao: desc, caminho: '/servir', imagem: 'servir' }),
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
