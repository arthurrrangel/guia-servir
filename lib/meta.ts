import type { Metadata } from 'next';
import { IGREJA, SITE } from './igreja';

/* =============================================================================
   O CARTÃO DO LINK, PÁGINA POR PÁGINA

   O Next NÃO funde `openGraph` entre o layout e a página: se a página define
   o próprio `openGraph`, o objeto inteiro do layout some — inclusive a
   imagem. Foi assim que todas as páginas menos a home ficaram sem foto no
   WhatsApp (auditoria de 04/09/2026). Este helper devolve o bloco completo,
   com a imagem certa, para toda página pública usar de uma vez.

   As imagens são a mesma composição do site (foto tratada + marca no canto),
   uma por página. Sem texto, de propósito: o texto do cartão é o título e a
   descrição do meta — e a imagem não depende de fonte nenhuma.
   ============================================================================= */

type Cartao = {
  titulo: string;
  descricao: string;
  caminho: string;
  /** /og-<nome>.jpg em public; sem isto usa /og.jpg */
  imagem?: string;
};

export function cartao({ titulo, descricao, caminho, imagem }: Cartao): Pick<Metadata, 'openGraph' | 'twitter'> {
  const t = `${titulo} · ${IGREJA.nome}`;
  const img = imagem ? `/og-${imagem}.jpg` : '/og.jpg';
  return {
    openGraph: {
      title: t, description: descricao, url: `${SITE}${caminho}`,
      type: 'website', locale: 'pt_BR', siteName: IGREJA.nome,
      images: [{ url: img, width: 1200, height: 630, alt: `${IGREJA.nome}, ${IGREJA.bairro}` }],
    },
    twitter: { card: 'summary_large_image', title: t, description: descricao, images: [img] },
  };
}
