import type { Metadata } from 'next';
import { headers } from 'next/headers';
import PortaDoVoluntario from '@/components/PortaDoVoluntario';
import { PRINCIPAL } from '@/lib/meu-token';
import { metadataDaPorta } from '@/lib/porta-meta';

/* 107 · O link do cartaz da porta da igreja e do recado do dia: abre a
   página de quem chega no "Cheguei" (#hoje). O mesmo desenho do link da
   escala no grupo: um por ministério, sem token de ninguém. Ver
   components/PortaDoVoluntario.tsx. */
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const slug = decodificado((await params).slug);
  return metadataDaPorta(slug, 'cheguei');
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
  return <PortaDoVoluntario slug={slug} para="cheguei" base={base} />;
}
