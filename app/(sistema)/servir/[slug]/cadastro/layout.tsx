import type { Metadata } from 'next';
import { cartao } from '@/lib/meta';
import { rpcPublica } from '@/lib/publico';
import Medidor from '@/components/site/Medidor';

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
    ...cartao({ titulo, descricao: desc, caminho: `/servir/${encodeURIComponent(slug)}/cadastro`, imagem: 'servir' }),
  };
}

/* o cadastro é a conversão do Servir: o Medidor mede a visita e o envio
   (components/site/Medidor.tsx); o resto do sistema não tem medição */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}<Medidor /></>;
}
