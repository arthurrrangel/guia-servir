import type { Metadata } from 'next';
import { og } from '@/lib/site/meta';
import Area from '@/components/site/Area';
import { AREAS } from '@/lib/site/areas';

/* /servir/<área>: a página da área (components/site/Area.tsx). Os metadados
   saem da copy fixa quando a área é uma das cinco; área nova do banco
   ganha o título genérico e o próprio componente ajusta o document.title. */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = AREAS[slug];
  const titulo = a ? `${a.nome}: ${a.frase}` : 'Servir';
  const desc = a ? a.texto : 'Encontre o seu lugar pra servir. Escolha uma área e preencha o cadastro em menos de um minuto.';
  return {
    title: titulo, description: desc,
    alternates: { canonical: `/servir/${slug}` },
    openGraph: og('servir', `/servir/${slug}`, titulo, desc, a ? `/og-servir-${slug}.jpg` : '/og-servir.jpg'),
  };
}

export default function Pagina() {
  return <Area />;
}
