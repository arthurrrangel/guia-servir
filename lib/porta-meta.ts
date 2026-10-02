import type { Metadata } from 'next';
import { rpcPublica } from '@/lib/publico';
import { cartao } from '@/lib/meta';

/* A PRÉVIA DO LINK NO GRUPO — 01/10/2026.

   O WhatsApp busca a página para montar o card do link, sem executar nada.
   O card diz o ministério e o que o link faz, e nada de ninguém: o link é o
   mesmo para o grupo inteiro. Se a busca do nome falhar, cai no genérico —
   nome errado é pior que nome ausente (mesma regra de /equipe/[slug]). */
export async function metadataDaPorta(slug: string, para: 'confirmar' | 'disponibilidade' | 'cheguei'): Promise<Metadata> {
  const linhas = await rpcPublica<any[]>('equipe_publica', { p_slug: slug });
  const nome = Array.isArray(linhas) && linhas[0]?.equipe ? String(linhas[0].equipe) : null;
  /* 107 · o cartaz da porta e o recado do dia: marcar que chegou */
  const titulo = para === 'confirmar'
    ? (nome ? `Confirmar a escala · ${nome}` : 'Confirmar a escala')
    : para === 'cheguei'
    ? (nome ? `Cheguei · ${nome}` : 'Cheguei')
    : (nome ? `Seus dias · ${nome}` : 'Seus dias');
  const descricao = para === 'confirmar'
    ? 'Abra para confirmar se você vai, ou avisar que não pode.'
    : para === 'cheguei'
    ? 'Abra para marcar que você chegou para servir hoje.'
    : 'Abra para marcar os dias em que você pode servir.';
  return {
    title: titulo,
    description: descricao,
    robots: { index: false, follow: false },
    ...cartao({ titulo, descricao, caminho: `/${para}/${encodeURIComponent(slug)}` }),
  };
}
