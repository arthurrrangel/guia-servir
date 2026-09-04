import type { Metadata } from 'next';
import Link from 'next/link';
import { Site } from '@/components/Site';
import { Tit, Schema } from '@/components/Texto';
import { IcSeta } from '@/components/Icones';
import { IGREJA, SITE } from '@/lib/igreja';

/* =============================================================================
   /guia-church-tv — RETENÇÃO, NÃO AQUISIÇÃO

   O canal não está ligado (decisão 02 em aberto: o canal que a igreja chama
   de "Guia Church TV" está publicado sob outra marca; @guiachurchtv tem um
   vídeo). Enquanto IGREJA.youtube for null a página fala do domingo sem
   prometer acervo, e sai do sitemap sozinha. Preencher a constante liga tudo.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Guia Church TV',
  description: 'A mensagem de domingo da GUIA Church, para ver de novo ou para quem não pôde vir.',
  alternates: { canonical: '/guia-church-tv' },
  robots: IGREJA.youtube ? undefined : { index: false, follow: true },
  openGraph: { title: 'Guia Church TV', description: 'A mensagem de domingo, para ver de novo.', url: `${SITE}/guia-church-tv`, type: 'website', locale: 'pt_BR' },
};

export default function TV() {
  const canal = IGREJA.youtube;
  return (
    <Site>
      {canal && <Schema dados={{ '@context': 'https://schema.org', '@type': 'WebPage', name: 'Guia Church TV', url: `${SITE}/guia-church-tv`, isPartOf: { '@type': 'WebSite', name: IGREJA.nome, url: SITE } }} />}

      <section className="g-cheio alta rev">
        <img src="/fotos/palco.webp" alt="" fetchPriority="high" />
        <div className="g">
          <p className="g-rot">Guia Church TV</p>
          <Tit as="h1" className="g-h1">A mensagem de domingo</Tit>
          <p className="g-ed">Para ver de novo, ou para quem não pôde vir.</p>
          <div className="g-acoes">
            {canal
              ? <a href={canal} target="_blank" rel="noreferrer" className="acao cheia">Ver no canal <IcSeta /></a>
              : <a href={IGREJA.instagram} target="_blank" rel="noreferrer" className="acao cheia">Acompanhar no Instagram <IcSeta /></a>}
            <Link href="/cultos" className="acao">Ver o domingo ao vivo</Link>
          </div>
        </div>
      </section>

      <section className="casa-papel rev">
        <div className="g g-secao">
          <div className="g-grade meio">
            <div className="g-c6">
              <div className="g-foto larga leva">
                <img src="/fotos/palavra.webp" alt="Momento da palavra no culto de domingo" loading="lazy" decoding="async" />
              </div>
            </div>
            <div className="g-c5 g-d8">
              <p className="g-rot">{canal ? 'Toda semana' : 'Onde assistir hoje'}</p>
              <Tit className="g-h2">{canal ? 'O que é dito no domingo não termina no domingo' : 'Enquanto o canal se organiza'}</Tit>
              <p className="g-corpo">
                {canal
                  ? 'A palavra da semana fica publicada, e é o mesmo conteúdo que a Pequena Guia conversa durante a semana.'
                  : `A publicação em vídeo está sendo reunida num canal só. Até lá, o que sai toda semana está em ${IGREJA.instagramArroba} — e o domingo, ao vivo, continua sendo o lugar onde a mensagem acontece inteira.`}
              </p>
              <div className="g-acoes">
                <Link href="/pequena-guia" className="acao cheia">Encontrar uma Pequena Guia <IcSeta /></Link>
                <Link href="/como-chegar" className="acao">Como chegar no domingo</Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </Site>
  );
}
