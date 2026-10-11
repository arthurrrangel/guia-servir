import { redirect } from 'next/navigation';

/* =============================================================================
   /ministerios/[slug] — ENDEREÇO ANTIGO

   Esta era a página da área. Ela virou /servir/[slug], porque quem clica em
   "servir" espera a área e não o formulário, e os nomes contavam a história
   ao contrário.

   O endereço antigo não pode morrer: ele já foi colado em grupo de WhatsApp,
   e link de igreja circula por meses. Redirecionamento permanente, feito no
   servidor, sem tela intermediária.
   ============================================================================= */

export default async function Antigo({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/servir/${slug}`);
}
