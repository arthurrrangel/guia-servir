import type { Metadata } from 'next';
import { cartao } from '@/lib/meta';
import { Site } from '@/components/Site';
import { Tit, Schema } from '@/components/Texto';
import { IGREJA, SITE } from '@/lib/igreja';
import { Ofertar } from '@/components/Ofertar';

/* =============================================================================
   /ofertar — O DESTINO DO QR

   Uma URL, um QR, e ele não muda nunca. É o que permite imprimir adesivo de
   cadeira e projetar o mesmo código no telão sem refazer nada quando a igreja
   trocar de adquirente, mudar o texto ou acrescentar um meio de pagamento.

   POR QUE O QR NÃO É UM QR DE PIX. Medido em 12/09/2026, com a zona de
   silêncio que o padrão exige:

     guiaservir.com/ofertar              33 módulos  →  ~2,0m de tela para ler a 20m
     Pix copia e cola com valor e txid   57 módulos  →  ~3,4m de tela para ler a 20m

   O código Pix carrega 141 caracteres e fica quase duas vezes mais denso. Num
   telão de 4m ele não cabe com folga, e três QRs lado a lado (Pix, cartão,
   carteira) reduzem cada um a ~1,1m, que morre em 11m — a última fileira não
   lê nenhum. Um QR só, apontando para cá, e os meios de pagamento AQUI DENTRO.

   FORA DO SITEMAP E FORA DO MENU, de propósito. Esta página não é conteúdo
   para quem procura a igreja no Google: é o destino de um código impresso, e
   uma igreja que aparece na busca pela página de doação diz do que ela trata
   antes de dizer no que ela crê. Quem chega aqui chegou pelo QR.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Ofertar',
  description:
    `Dízimos e ofertas da ${IGREJA.nome}, pelo celular, por Pix ou cartão.`,
  alternates: { canonical: '/ofertar' },
  robots: { index: false, follow: true },
  ...cartao({
    titulo: 'Ofertar',
    descricao: `Dízimos e ofertas da ${IGREJA.nome}.`,
    caminho: '/ofertar',
  }),
};

export default function Pagina() {
  return (
    <Site atual="/ofertar">
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'WebPage', name: `Ofertar · ${IGREJA.nome}`,
        url: `${SITE}/ofertar`,
        isPartOf: { '@type': 'WebSite', name: IGREJA.nome, url: SITE },
      }} />

      {/* `rev` não é enfeite: é o gancho que o observador de components/Movimento
          procura para marcar `.visto`. Sem ele, as palavras do <Tit> ficam em
          opacity:0 para sempre e o H1 some da tela — foi o que aconteceu na
          primeira captura desta página. */}
      <section className="g-secao rev">
        <div className="g g-cab">
          <div className="g-cab-txt">
            <p className="g-rot">Dízimos e ofertas</p>
            <Tit as="h1" className="g-h1">Ofertar</Tit>
            {/* a linha de apoio NÃO fica aqui: ela é verdadeira só no primeiro
                passo. Depois de pagar, um cabeçalho dizendo "leva menos de um
                minuto" fala de uma coisa que já terminou. Quem troca de frase
                a cada passo é o componente. */}
          </div>
        </div>

        <div className="g">
          <Ofertar />
        </div>
      </section>
    </Site>
  );
}
