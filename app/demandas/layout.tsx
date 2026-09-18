import type { Metadata } from 'next';
import './demandas.css';

/* =============================================================================
   O LAYOUT DO SEGUNDO SISTEMA

   Duas funções, e as duas importam.

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

export const metadata: Metadata = {
  title: 'Demandas',
  description: 'Pedidos entre os setores da igreja: quem pediu, quem atende, para quando.',
  robots: { index: false, follow: false, nocache: true, noarchive: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
