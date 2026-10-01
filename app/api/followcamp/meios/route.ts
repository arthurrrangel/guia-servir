/* GET /api/followcamp/meios — quais formas de pagamento estão ligadas.

   A página do Camp é HTML estático em public/followcamp/ e não sabe ler
   variável de ambiente. Ela pergunta aqui e só mostra o botão "Pagar
   inscrição" quando existe pelo menos um meio de verdade E ainda há o que
   pagar (1º lote ou carnê abertos): sem isso, o botão levaria a uma tela de
   "em breve" ou a um formulário todo desligado. */
import { NextResponse } from 'next/server';
import { TEM_PAGARME } from '@/lib/pagarme';
import { TEM_PIX } from '@/lib/oferta';
import { loteVigente, carneAberto } from '@/lib/followcamp';

export const dynamic = 'force-dynamic';

export function GET() {
  const agora = new Date();
  const aberto = !!loteVigente(agora) || carneAberto(agora);
  return NextResponse.json(
    { pix: aberto && TEM_PAGARME, cartao: aberto && TEM_PAGARME, pixDireto: aberto && TEM_PIX, aberto },
    { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } },
  );
}
