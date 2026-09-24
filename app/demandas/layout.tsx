import type { Metadata } from 'next';
import './demandas.css';

/* =============================================================================
   O LAYOUT DO SEGUNDO SISTEMA

   Três funções, e as três importam (a terceira está junto do `metadata`).

   1. TRAZ A FOLHA DE ESTILO. `demandas.css` entra por aqui, e só por aqui.
      O Next junta todo o CSS da aplicação numa folha só, então isto não isola
      nada por si — quem isola é o fato de cada classe e cada variável daquele
      arquivo viver dentro de `.dm`. Ver o cabeçalho de lá.

   2. TIRA /demandas DO ÍNDICE. Esta é uma tela de sistema, com nome, telefone
      e o que cada setor pediu; não pode virar resultado de busca.

      O `next.config.mjs` do sistema de escalas tem uma lista de rotas que
      recebem o cabeçalho `X-Robots-Tag`, e o lugar "certo" desta regra seria
      lá. Não foi acrescentada porque a ordem era não tocar em nenhum arquivo
      existente, e essa ordem vale mais do que a elegância.

      O que fica no lugar é suficiente, e é o mesmo mecanismo que
      `app/painel/layout.tsx` já usa como segunda trava: ESTE arquivo é
      componente de SERVIDOR, então a meta `robots` sai no HTML servido, antes
      de qualquer JavaScript. O que um robô que não executa JS não veria é a
      meta gerada por componente de cliente — e as páginas de dentro são de
      cliente, por isso a declaração mora aqui em cima, e não em cada uma.

      Quando quiser o cinto a mais, é uma linha em `ROTAS_FECHADAS`:
        '/demandas', '/demandas/:caminho+',
   ============================================================================= */

/* 3. O CARD DO LINK COMPARTILHADO É DO SISTEMA, E NÃO DO SITE — 23/09/2026.
      O link de /demandas colado no WhatsApp dos líderes saía com a foto e o
      título da home da igreja ("Cultivando uma nova cultura"), porque o
      `openGraph` do layout raiz vale para tudo que não diz o próprio. O
      Next não mistura objetos de `openGraph`: o daqui substitui o de lá
      inteiro, por isso os campos de sempre (tipo, idioma, nome do site)
      estão repetidos. A imagem é `public/og-demandas.jpg`, 1200×630. */
const TITULO = 'Demandas · GUIA Church';
const DESCRICAO = 'Pedidos entre os setores da GUIA Church: quem pediu, quem atende, para quando.';

export const metadata: Metadata = {
  title: 'Demandas',
  description: DESCRICAO,
  robots: { index: false, follow: false, nocache: true, noarchive: true },
  openGraph: {
    title: TITULO, description: DESCRICAO,
    url: 'https://guiaservir.com/demandas', type: 'website', locale: 'pt_BR', siteName: 'GUIA Church',
    images: [{ url: '/og-demandas.jpg', width: 1200, height: 630, alt: 'Demandas, o sistema de pedidos entre os setores da GUIA Church' }],
  },
  twitter: { card: 'summary_large_image', title: TITULO, description: DESCRICAO, images: ['/og-demandas.jpg'] },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
