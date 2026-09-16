'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/* =============================================================================
   A ENTRADA DE PÁGINA · 17/09/2026

   Cada troca de rota remonta o invólucro (a chave é o caminho), e o CSS
   (.pg-entra, em editorial.css) faz a página nova entrar em fade de 340ms.
   Só opacidade: um transform aqui criaria bloco de contenção para a barra
   fixa e o menu, que pulariam durante a animação. Sem JS de animação, sem
   biblioteca; "reduzir movimento" desliga pelo CSS.

   A PRIMEIRA carga não anima: a pessoa que chega do Google vê o site na hora
   (um fade de 340ms na chegada atrasaria a primeira pintura de propósito).
   Só a navegação de dentro do site ganha o fade.

   Não é a View Transitions API: o React 19.0 estável não tem a peça que o
   Next 15.5 exige para ela (registrado em 16/09). Isto é o que dá para fazer
   hoje sem trocar o React, e é discreto de propósito.
   ============================================================================= */
export default function Transicao({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();
  const chegou = useRef(false);
  useEffect(() => { chegou.current = true; }, []);
  return <div key={caminho} className={chegou.current ? 'pg-entra' : undefined}>{children}</div>;
}
