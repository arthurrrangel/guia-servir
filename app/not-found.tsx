import type { Metadata } from 'next';
import Link from 'next/link';
import { Site } from '@/components/Site';
import { Tit } from '@/components/Texto';
import { IcSeta } from '@/components/Icones';

/* =============================================================================
   404 — a página que ninguém planeja e todo mundo acaba vendo

   Link velho do Instagram, endereço digitado errado, story de três meses
   atrás. A pessoa cai aqui vinda de fora, sem contexto, e o padrão do Next é
   uma tela branca com "404" em Arial — a única página do site que não seria
   deste site.

   Ela faz o que a home faz em cinco segundos: diz quem somos, quando nos
   reunimos e por onde entrar. E não pede desculpa: página de erro que se
   desculpa chama atenção para o erro. */

export const metadata: Metadata = {
  title: 'Página não encontrada',
  robots: { index: false, follow: true },
};

export default function NaoEncontrada() {
  return (
    <Site>
      <section className="g-cheio alta rev">
        <img src="/fotos/predio.webp" alt="" />
        <div className="g">
          <p className="g-rot">404</p>
          <Tit as="h1" className="g-h1">Esse endereço não existe</Tit>
          <p className="g-ed">Mas o domingo existe.</p>
          <p className="g-corpo" style={{ maxWidth: '44ch' }}>
            Pode ter sido um link antigo ou uma letra fora do lugar. O que você
            procura provavelmente está a um clique daqui.
          </p>
          <div className="g-acoes">
            <Link href="/cultos" className="acao cheia">Ver o domingo <IcSeta /></Link>
            <Link href="/" className="acao">Ir para o início</Link>
          </div>
        </div>
      </section>
    </Site>
  );
}
