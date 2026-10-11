import type { Metadata } from 'next';
import './(site)/site.css';
import Topo from '@/components/site/Topo';
import Pe from '@/components/site/Pe';
import { IGREJA } from '@/lib/igreja';
import { Vozes, Chapeu, Pil, Img } from '@/components/site/Blocos';

/* =============================================================================
   404 — a página que ninguém planeja e todo mundo acaba vendo

   Mora na raiz (o Next só aceita o not-found global aqui) e por isso veste
   o site por conta própria: a folha, a barra e o pé do app/(site). Diz quem
   somos, quando nos reunimos e por onde entrar. Não pede desculpa.
   ============================================================================= */
export const metadata: Metadata = { title: 'Página não encontrada', robots: { index: false, follow: true } };

export default function NaoEncontrada() {
  return (
    <div className="s">
      <Topo />
      <main id="conteudo">
        <section className="s-heroi curto" aria-labelledby="t-404">
          <Img lugar="chegar-heroi" prioridade />
          <div className="s-in s-heroi-in">
            <Chapeu forte="404" resto="Esse endereço não existe" />
            <Vozes as="h1" id="t-404" className="s-h1" it="existe">Mas o domingo existe</Vozes>
            <p className="s-lead grande">{IGREJA.cultoDia}, {IGREJA.cultoHora}, na {IGREJA.rua}, {IGREJA.bairro}. Comece por aqui.</p>
            <div className="s-acoes">
              <Pil href="/">Ir para o início</Pil>
              <Pil href="/cultos">Ver os cultos</Pil>
            </div>
          </div>
        </section>
      </main>
      <Pe />
    </div>
  );
}
