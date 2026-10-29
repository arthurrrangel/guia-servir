import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import Minha from '@/components/followcamp/Minha';
import { lerMinha } from '@/lib/followcamp-banco';
import { TOKEN_OK } from '@/lib/followcamp-cobranca';
import { TEM_PIX } from '@/lib/oferta';
import { linksNaTela } from '@/lib/followcamp-link-vivo';

/* =============================================================================
   /followcamp/minha/<token> — O LINK PESSOAL DA INSCRIÇÃO · 19/10/2026 (114)

   Cada ficha tem um link. Por ele a pessoa vê o que deve, o que já foi
   confirmado e o que está em conferência; escolhe o plano do carnê; paga no
   Pix (ou no cartão, pelo link da Stone) e manda o comprovante. Tudo o que
   ela faz aqui cai na ficha dela pelo token, sem depender do nome digitado.

   O token é a credencial: fora da busca (cabeçalho em next.config.mjs e o
   robots), e a página não mostra CPF, saúde nem telefone. Lida no servidor,
   pela chave de serviço (lib/followcamp-banco.ts, `lerMinha`), a cada visita.
   O cartão só aparece se a Stone disser que o link ainda abre (29/10/2026,
   lib/followcamp-link-vivo.ts).
   ============================================================================= */
const poppins = localFont({
  src: [
    { path: '../../../../../public/followcamp/a/poppins-400.woff2', weight: '400', style: 'normal' },
    { path: '../../../../../public/followcamp/a/poppins-600.woff2', weight: '600', style: 'normal' },
    { path: '../../../../../public/followcamp/a/poppins-700.woff2', weight: '700', style: 'normal' },
    { path: '../../../../../public/followcamp/a/poppins-900.woff2', weight: '900', style: 'normal' },
  ],
  variable: '--fc-poppins',
  display: 'swap',
});
const pixel = localFont({
  src: '../../../../../public/followcamp/a/silkscreen-400.woff2',
  variable: '--fc-pixel',
  display: 'swap',
});

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Minha inscrição · Follow Camp 2027',
  description: 'Pagamento e comprovantes da inscrição no Follow Camp 2027.',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  themeColor: '#F32402', colorScheme: 'light dark',
};

export default async function Pagina({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [dados, links] = await Promise.all([
    TOKEN_OK.test(token) ? lerMinha(token) : Promise.resolve({ ok: false, erro: 'LINK_INVALIDO' } as const),
    linksNaTela(),
  ]);
  return (
    <div className={`${poppins.variable} ${pixel.variable}`}>
      <Minha token={token} dados={dados} temPix={TEM_PIX} links={links} />
    </div>
  );
}
