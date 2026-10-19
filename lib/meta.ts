import type { Metadata } from 'next';
import { SITE } from './igreja';

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

   19/10/2026: quem usa este cartão é o sistema (as portas do grupo, o /eu e o
   cadastro de área), que mora no guiaservir.com. Ele saía como "· GUIA
   Church", com o endereço do guiachurch.com e a foto da igreja; agora diz GUIA
   Servir, aponta para o guiaservir.com e usa /og-sistema.jpg, o cartão neutro
   dos voluntários (o cadastro pede /og-servir.jpg).
   ============================================================================= */

type Cartao = {
  titulo: string;
  descricao: string;
  caminho: string;
  /** /og-<nome>.jpg em public; sem isto usa /og-sistema.jpg */
  imagem?: string;
};

export const SERVIR_NOME = 'GUIA Servir';
/* a versão no endereço da imagem: o WhatsApp e a Meta guardam a prévia por
   endereço, e o mesmo nome com a foto nova continuaria mostrando a velha */
const VERSAO = '?v=20261019';

export function cartao({ titulo, descricao, caminho, imagem }: Cartao): Pick<Metadata, 'openGraph' | 'twitter'> {
  const t = `${titulo} · ${SERVIR_NOME}`;
  const img = `/og-${imagem || 'sistema'}.jpg${VERSAO}`;
  return {
    openGraph: {
      title: t, description: descricao, url: `${SITE}${caminho}`,
      type: 'website', locale: 'pt_BR', siteName: SERVIR_NOME,
      images: [{ url: img, width: 1200, height: 630, alt: `${SERVIR_NOME}, voluntários da GUIA Church` }],
    },
    twitter: { card: 'summary_large_image', title: t, description: descricao, images: [img] },
  };
}
