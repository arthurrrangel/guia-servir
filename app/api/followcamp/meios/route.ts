/* GET /api/followcamp/meios — quais formas de pagamento estão ligadas.

   A página do Camp é HTML estático em public/followcamp/ e não sabe ler
   variável de ambiente. Ela pergunta aqui e só mostra o botão "Pagar
   inscrição" quando existe pelo menos um meio de verdade E ainda há o que
   pagar (1º lote ou carnê abertos): sem isso, o botão levaria a uma tela de
   "em breve" ou a um formulário todo desligado.

   `cartaoLink` (01/10/2026): o cartão pelo link fixo da Conta Stone
   (lib/followcamp.ts, LINKS_CARTAO). Só vale sem a API, como na tela.

   29/10/2026: só conta o link que a Stone diz que ainda abre
   (lib/followcamp-link-vivo.ts). `cartaoStone` diz o que ela disse do link
   do lote: 'vivo', 'parado' (morreu ou diverge do código, com o motivo em
   `cartaoMotivo`, que o painel mostra), 'sem_resposta' (o link fica) ou
   'sem_link'. Nada disso é segredo: o link é público. */
import { NextResponse } from 'next/server';
import { TEM_PAGARME } from '@/lib/pagarme';
import { TEM_PIX } from '@/lib/oferta';
import { loteVigente, carneAberto, temLinkCartao } from '@/lib/followcamp';
import { conferirLinks, linksQueAbrem, resumoDoCartao } from '@/lib/followcamp-link-vivo';

export const dynamic = 'force-dynamic';

export async function GET() {
  const agora = new Date();
  const aberto = !!loteVigente(agora) || carneAberto(agora);
  const conferidos = TEM_PAGARME ? [] : await conferirLinks();
  const stone = resumoDoCartao(conferidos, agora);
  return NextResponse.json(
    {
      pix: aberto && TEM_PAGARME,
      cartao: aberto && TEM_PAGARME,
      cartaoLink: !TEM_PAGARME && temLinkCartao(agora, linksQueAbrem(conferidos)),
      ...(TEM_PAGARME ? {} : { cartaoStone: stone.estado, ...(stone.motivo ? { cartaoMotivo: stone.motivo } : {}) }),
      pixDireto: aberto && TEM_PIX,
      aberto,
    },
    { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } },
  );
}
