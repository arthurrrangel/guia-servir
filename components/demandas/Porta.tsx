'use client';
/* A PORTA: a moldura das telas de quem ainda não está dentro · 23/09/2026.

   Entrar, cadastro, "falta o seu cadastro", "o sistema não foi instalado" e
   "entre para ver as suas demandas" eram cinco telas com a casca de dentro
   (topo, rodapé) e um formulário solto no meio de uma página branca. Agora
   as cinco são a MESMA moldura: a marca no alto, um cartão no centro sobre
   o fundo cinza, e o nome da igreja embaixo. É a cara de porta de produto, e
   ela diz à pessoa que ela ainda está do lado de fora.

   Nenhuma peça do outro sistema entra aqui (ver `demandas-porta-propria`). */

import Link from 'next/link';

/* a marca: o selo preto e o nome. O selo é um link para o Início com a
   própria classe (`dm-logo`), que a trava de `demandas-css.test.mjs` vigia:
   ele diz as duas cores, para uma nunca virar a outra. */
export function Marca() {
  return (
    <Link href="/demandas" className="dm-marca" aria-label="Demandas, início">
      <span className="dm-logo" aria-hidden="true">GUI{'>'}</span>
      <span className="dm-marca-nome">Demandas</span>
    </Link>
  );
}

/* UMA LARGURA SÓ PARA A PORTA INTEIRA (480px) — 23/09/2026: o cadastro
   crescia de 440 para 520 entre o passo 1 e o passo 2, e o cartão pulava no
   meio de um fluxo que devia parecer uma coisa só. */
export function Porta({ children }: { children: React.ReactNode }) {
  return (
    <div className="dm dm-auth">
      <header className="dm-auth-topo"><Marca /></header>
      <main className="dm-auth-meio">
        <div className="dm-auth-caixa">{children}</div>
      </main>
      <footer className="dm-auth-rodape">GUIA Church</footer>
    </div>
  );
}
