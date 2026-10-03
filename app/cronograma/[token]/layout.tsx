import type { Metadata } from 'next';
import { rpcPublica } from '@/lib/publico';
import { folhaDoBanco, tituloDaFolha } from '@/lib/cronograma';

/* =============================================================================
   O TÍTULO QUE O WHATSAPP LÊ, PARA A FOLHA DO CULTO — 109, 03/10/2026

   O link do cronograma vai para os grupos. A prévia do WhatsApp lê o HTML do
   servidor e não executa nada: sem este layout, o card do link sairia com o
   título genérico da igreja. Aqui ele sai "Cronograma · Domingo, 13 de
   setembro", com o tema embaixo.

   A leitura é curta (60 s): o cronograma muda até o dia do culto, e a prévia
   não pode prender o tema velho por uma hora. Falhou, cai no genérico.
   NUNCA INDEXA: o endereço é um link de grupo, não uma página do site.
   ============================================================================= */
export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> }
): Promise<Metadata> {
  const { token } = await params;
  const valido = /^[0-9a-f]{18}$/.test(token);
  const r = valido ? await rpcPublica<any>('cronograma_publico', { p_token: token }, 60) : null;
  const f = r?.ok ? folhaDoBanco(r) : null;
  const titulo = f ? `Cronograma · ${tituloDaFolha(f.data)}` : 'Cronograma do culto';
  const desc = f?.palavra?.tema
    ? `${f.palavra.tema}${f.palavra.quem ? ` · ${f.palavra.quem}` : ''}`
    : 'Os horários, quem está no comando, o louvor e os avisos do culto.';
  return {
    title: titulo,
    description: desc,
    robots: { index: false, follow: false, nocache: true },
    openGraph: { title: `${titulo} · GUIA Church`, description: desc, type: 'website', locale: 'pt_BR' },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
