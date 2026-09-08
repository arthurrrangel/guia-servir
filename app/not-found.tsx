import type { Metadata } from 'next';
import Link from 'next/link';
import { Site } from '@/components/Site';
import { Cabecalho } from '@/components/Pagina';
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
    <Site escuro>
      <Cabecalho criativo="chegar" rot="404" titulo="Esse endereço não existe" ed="Mas o domingo existe."
        acoes={<>
          <Link href="/cultos" className="acao cheia">Ver o domingo <IcSeta /></Link>
          <Link href="/" className="g-link claro">Ir para o início</Link>
        </>} />
    </Site>
  );
}
