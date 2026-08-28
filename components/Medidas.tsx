'use client';
import { useEffect } from 'react';

/* =============================================================================
   --barra: a largura da barra de rolagem

   Quem ocupa a largura inteira da janela usa 100vw, e 100vw INCLUI a barra de
   rolagem. Sem descontar, cada faixa fica alguns pixels mais larga que a
   janela e a página anda de lado — pouco, mas anda, e no celular vira um
   tranco a cada rolagem.

   Isto já foi um <script> inline no <head>, que rodava antes da pintura e era
   melhor por isso. Só que ele escrevia style="--barra:15px" no <html>, o
   servidor não tinha escrito nada, e o React reclamava de hidratação em toda
   carga. Um aviso de hidratação não é cosmético: quando o React desiste de
   casar a árvore, ele pode remontar pedaços e perder estado.

   Então o preço mudou de lado: um quadro com --barra em 0 (o padrão do CSS),
   e nenhuma divergência. Na home isso nem aparece — lá as faixas são filhas
   diretas da raiz e não usam 100vw. Só o herói das telas internas depende.
   ============================================================================= */
export default function Medidas() {
  useEffect(() => {
    const medir = () =>
      document.documentElement.style.setProperty(
        '--barra', (window.innerWidth - document.documentElement.clientWidth) + 'px',
      );
    medir();
    window.addEventListener('resize', medir, { passive: true });
    return () => window.removeEventListener('resize', medir);
  }, []);
  return null;
}
