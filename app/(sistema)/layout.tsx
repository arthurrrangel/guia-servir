import '../globals.css';
import '../editorial.css';
import '../identidade.css';
import Medidas from '@/components/Medidas';
import Transicao from '@/components/Transicao';

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
   ============================================================================= */
export default function SistemaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Medidas />
      <Transicao>{children}</Transicao>
    </>
  );
}
