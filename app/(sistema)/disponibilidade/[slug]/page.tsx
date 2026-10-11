import type { Metadata } from 'next';
import { headers } from 'next/headers';
import PortaDoVoluntario from '@/components/PortaDoVoluntario';
import { PRINCIPAL } from '@/lib/meu-token';
import { metadataDaPorta } from '@/lib/porta-meta';

/* O link que vai no pedido de disponibilidade do mês, no grupo do WhatsApp.
   Leva cada pessoa direto aos dias dela. Ver components/PortaDoVoluntario.tsx. */
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const slug = decodificado((await params).slug);
  return metadataDaPorta(slug, 'disponibilidade');
}

/* o segmento pode chegar ainda codificado (m%C3%ADdia): decodifica uma vez,
   para a porta não codificar de novo e mandar para /equipe/m%25C3... */
const decodificado = (t: string) => { try { return decodeURIComponent(t); } catch { return t; } };

export default async function Pagina({ params }: { params: Promise<{ slug: string }> }) {
  const slug = decodificado((await params).slug);
  /* num dos endereços da igreja, o link de reserva (o que funciona sem
     JavaScript) já aponta para o endereço principal */
  const host = ((await headers()).get('host') || '').split(':')[0];
  const base = /(^|\.)guiaservir\.com$/i.test(host) ? PRINCIPAL : '';
  return <PortaDoVoluntario slug={slug} para="disponibilidade" base={base} />;
}
