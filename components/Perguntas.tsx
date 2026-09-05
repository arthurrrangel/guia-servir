'use client';
import { useEffect, useState } from 'react';

/* =============================================================================
   PERGUNTAS — a lista que se dobra no celular

   No desktop, as perguntas ficam abertas: são poucas e cabem. No celular,
   uma lista de perguntas abertas vira uma parede de texto — e foi o que o
   Arthur viu ("muito poluído, cheio de texto longo"). Aqui, no celular, só a
   pergunta aparece; a resposta abre no toque.

   É <details>/<summary> nativo: funciona sem JavaScript, é acessível por
   teclado, e o Google lê a resposta mesmo fechada. O único JS é decidir, na
   montagem, se a tela é larga (abre tudo) ou não (fecha tudo). O servidor
   renderiza FECHADO de propósito: o celular é o caso que importa, e no
   desktop as listas ficam abaixo da dobra, atrás da revelação por rolagem —
   ninguém vê a abertura acontecer.

   Regra de conteúdo, não de código: no máximo três perguntas por página, e
   cada resposta cabe numa frase. Menos informação, só a necessária.
   ============================================================================= */

/* `r` é a resposta em uma frase. `corpo` é para quando a resposta não é
   texto (a lista de funções de uma área, em /servir/onde-me-encaixo): entra
   no lugar do parágrafo, com a mesma dobra no celular. */
export type Pergunta = { q: string; r?: string; corpo?: React.ReactNode };

export function Perguntas({ itens, className = '' }: { itens: Pergunta[]; className?: string }) {
  const [largo, setLargo] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const ler = () => setLargo(mq.matches);
    ler();
    mq.addEventListener('change', ler);
    return () => mq.removeEventListener('change', ler);
  }, []);

  return (
    <ol className={'qa ' + className}>
      {itens.map((p, i) => (
        <li key={p.q}>
          <details open={largo || undefined}>
            <summary>
              <span className="qa-n" aria-hidden="true">0{i + 1}</span>
              <h3 className="qa-q">{p.q}</h3>
              <span className="qa-mais" aria-hidden="true" />
            </summary>
            {p.corpo ? <div className="qa-c">{p.corpo}</div> : <p className="qa-r">{p.r}</p>}
          </details>
        </li>
      ))}
    </ol>
  );
}
