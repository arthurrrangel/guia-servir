import type { Metadata } from 'next';
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
    openGraph: { title: `${titulo} · GUIA Servir`, description: desc, type: 'website', locale: 'pt_BR' },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
