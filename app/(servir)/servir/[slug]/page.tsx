import type { Metadata } from 'next';
import { og } from '@/lib/site/meta';
import Area from '@/components/site/Area';
import { AREAS, AREAS_ORDEM } from '@/lib/site/areas';

/* /servir/<área>: a página da área (components/site/Area.tsx). Os metadados
   saem da copy fixa quando a área é uma das cinco; área nova do banco
   ganha o título genérico e o próprio componente ajusta o document.title. */
/* 22/10/2026: as cinco áreas da copy saem prontas no build (●, e não ƒ). Com
   a página dinâmica, o Next 15 manda os metadados por streaming, no fim do
   <body>, a quem executa JavaScript (o Googlebot incluso), e o Google ignora
   rel=canonical fora do <head>. Pronta no build, o <head> sai completo para
   todo mundo. Área nova do banco segue funcionando (dynamicParams, o padrão). */
export function generateStaticParams() {
  return AREAS_ORDEM.map(slug => ({ slug }));
}

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
