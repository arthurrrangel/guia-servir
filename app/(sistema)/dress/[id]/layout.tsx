import type { Metadata } from 'next';
import { rpcPublica } from '@/lib/publico';
import { cartao } from '@/lib/meta';
import { dressPublico, idDoDressValido, resumoDoDress } from '@/lib/dress-code';
import { diaLongo } from '@/lib/engine';

/* =============================================================================
   O TÍTULO QUE O WHATSAPP LÊ, PARA O DRESS CODE — 116, 26/10/2026

   O link do dress code vai na mensagem da escala, nos grupos. A prévia do
   WhatsApp lê o HTML do servidor e não executa nada: aqui ela sai "Dress
   code · Domingo, 1 de novembro", com as cores embaixo ("Azul-marinho +
   Bege · Esporte fino"). O cartão é o do sistema: a imagem da inspiração é
   WebP de até 5 MB, e a prévia do WhatsApp não garante nem um nem outro.

   A leitura é curta (60 s): o líder muda as cores até o dia do culto, e a
   prévia não pode prender a cor velha por uma hora. Falhou, cai no genérico.
   NUNCA INDEXA: o endereço é um link de grupo, não uma página do site.
   ============================================================================= */
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> }
): Promise<Metadata> {
  const { id } = await params;
  const idl = (id || '').toLowerCase();
  const r = idDoDressValido(idl) ? await rpcPublica<unknown>('dress_code_publico', { p_id: idl }, 60) : null;
  const x = dressPublico(r);
  const dia = x ? diaLongo(x.data, x.evento) : '';
  const titulo = x ? `Dress code · ${dia.charAt(0).toUpperCase()}${dia.slice(1)}` : 'Dress code do culto';
  const descricao = x ? resumoDoDress(x.dress) : 'As cores, o estilo e as inspirações de roupa de quem serve no culto.';
  return {
    title: titulo,
    description: descricao,
    robots: { index: false, follow: false, nocache: true },
    ...cartao({ titulo, descricao, caminho: `/dress/${idl}` }),
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
