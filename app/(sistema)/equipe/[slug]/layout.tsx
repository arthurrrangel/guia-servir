import type { Metadata } from 'next';
import { rpcPublica } from '@/lib/publico';

/* =============================================================================
   O TÍTULO QUE O WHATSAPP LÊ

   A página é 'use client', então o `document.title` que ela ajusta só existe
   DEPOIS que o navegador executa o JavaScript. A prévia do link no WhatsApp
   não executa nada: ela lê o HTML que o servidor devolveu. Sem este layout, o
   link do Louvor aparecia no grupo com o título de outro ministério.

   Server component de propósito: busca o nome no servidor e devolve o <title>
   e o card de prévia já prontos no HTML. Se a busca falhar, cai no genérico —
   nome errado é pior que nome ausente.
   ============================================================================= */

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const linhas = await rpcPublica<any[]>('equipe_publica', { p_slug: slug });
  const nome = Array.isArray(linhas) && linhas[0]?.equipe ? String(linhas[0].equipe) : null;

  /* "do Mídia" e "do Diaconia" saíam errados: o artigo é dado, não regra —
     "o Louvor" e "a Mídia" não seguem terminação nenhuma confiável. */
  const lista = await rpcPublica<{ slug: string; artigo: string }[]>('ministerios_publicos');
  const artigo = (Array.isArray(lista) ? lista : []).find(m => m.slug === slug)?.artigo || 'o';
  const doDa = artigo === 'a' ? 'da' : 'do';

  const titulo = nome ? `Servir · ${nome}` : 'Servir';
  const desc = nome
    ? `Entre no time ${doDa} ${nome} ou abra a sua escala. Leva menos de um minuto.`
    : 'Entre no time ou abra a sua escala.';
  return {
    title: titulo,
    description: desc,
    openGraph: { title: `${titulo} · GUIA Servir`, description: desc, type: 'website', locale: 'pt_BR' },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
