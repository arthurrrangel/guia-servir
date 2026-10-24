import '../globals.css';
import '../editorial.css';
import '../identidade.css';
import Medidas from '@/components/Medidas';
import Transicao from '@/components/Transicao';
import Fronteira from '@/components/Fronteira';
import type { Metadata } from 'next';
import { SITE } from '@/lib/igreja';
import { SERVIR_NOME } from '@/lib/meta';

/* =============================================================================
   O CASCO DO SISTEMA — 11/10/2026

   Até aqui o layout raiz carregava globals.css (9 mil linhas), editorial.css
   e identidade.css para TODA rota, site público inclusive. Quando o site foi
   refeito do zero (app/(site)/), o CSS do sistema saiu da raiz e veio para
   cá: este grupo de rotas reúne tudo que é do sistema (painel, escala, time,
   ajustes, entrar, cronogramas, equipe, /eu, demandas, candidatura, porta
   do voluntário, cadastro de área, Follow Camp) e carrega exatamente o que
   a raiz carregava antes, na mesma ordem, com as mesmas peças (Medidas mede
   a barra de rolagem; Transicao faz o fade entre páginas).

   Nada do sistema mudou: as páginas só mudaram de pasta, e as URLs são as
   mesmas (grupo entre parênteses não entra no endereço). A prova está nas
   capturas antes/depois de cada tela, pixel a pixel.

   19/10/2026: a Fronteira (components/Fronteira.tsx). Link do sistema para
   o site (o logo, "Início", "Quero servir", "Áreas") navegava sem recarregar
   e levava estas folhas junto para a página do site. Agora atravessar vira
   carregamento inteiro; dentro do sistema, nada muda.

   19/10/2026, mais tarde: O NOME. O sistema mora no guiaservir.com e a aba
   dizia "Escala · GUIA Church" (o modelo da raiz é o da igreja). Aqui o
   modelo passa a ser "· GUIA Servir", o endereço base é o guiaservir.com e o
   cartão padrão dos links é /og-sistema.jpg. Página que define o próprio
   cartão (Demandas, as portas do grupo, o cadastro) continua com o dela. O
   Follow Camp é da igreja e tem casco próprio (followcamp/layout.tsx).

   24/10/2026: O NOME QUE AINDA SAÍA ERRADO. Com `default`, o título deste
   casco passa pelo modelo da raiz ("%s · GUIA Church") antes de chegar à
   página, e a página do sistema sem título próprio (a /candidatura/<token>)
   abria a aba e o cartão do WhatsApp como "GUIA Servir · GUIA Church". Com
   `absolute`, o título deste casco é só "GUIA Servir"; o modelo para as
   páginas de dentro continua o mesmo, e quem tem título próprio não muda.
   ============================================================================= */
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { absolute: SERVIR_NOME, template: `%s · ${SERVIR_NOME}` },
  openGraph: {
    siteName: SERVIR_NOME, type: 'website', locale: 'pt_BR',
    images: [{ url: '/og-sistema.jpg?v=20261019', width: 1200, height: 630, alt: `${SERVIR_NOME}, voluntários da GUIA Church` }],
  },
};

export default function SistemaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Medidas />
      <Fronteira lado="sistema" />
      <Transicao>{children}</Transicao>
    </>
  );
}
