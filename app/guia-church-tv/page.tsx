import type { Metadata } from 'next';
import Link from 'next/link';
import { Site } from '@/components/Site';
import { Tit, Schema } from '@/components/Texto';
import { IcSeta } from '@/components/Icones';
import { IGREJA, SITE } from '@/lib/igreja';
import { Vaga } from '@/components/Vaga';
import { FOTOS } from '@/lib/imagens';

/* =============================================================================
   /guia-church-tv — RETENÇÃO, NÃO AQUISIÇÃO

   A URL é longa de propósito. "/tv" seria mais curta e não seria encontrada
   por ninguém: o termo que as pessoas digitam é "guia church tv", com a marca
   inteira. Numa página cuja função é ser reencontrada, o endereço carrega o
   nome.

   O CANAL NÃO ESTÁ LIGADO AQUI, E É DECISÃO, NÃO ESQUECIMENTO.

   O levantamento de 25/08 achou três coisas ao mesmo tempo: o canal que a
   igreja chama de "Guia Church TV" está publicado sob OUTRA marca, com 19 mil
   inscritos; @guiachurchtv existe com um vídeo; e o Linktree manda quem clica
   em "CANAL GUIA CHURCH TV" para a marca errada. Qual dos dois é o canal
   oficial é a decisão 02 da arquitetura, e continua aberta.

   Publicar o link errado numa página indexável é pior do que não publicar:
   consolida o erro que o Linktree já comete, e um link de canal é do tipo que
   as pessoas salvam. Enquanto `IGREJA.youtube` for null:
     · a página existe e fala do domingo, que é conteúdo verdadeiro;
     · ela NÃO promete um acervo que a pessoa não vai encontrar;
     · ela sai do sitemap sozinha (ver app/sitemap.ts) — página sem o conteúdo
       que o título promete não deve ser oferecida ao Google.
   Preencher a constante liga tudo de uma vez.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Guia Church TV',
  description:
    'A mensagem de domingo da GUIA Church, para ver de novo ou para quem não pôde vir.',
  alternates: { canonical: '/guia-church-tv' },
  /* enquanto não há canal, a página não é oferecida à busca. O robots por
     rota mora aqui e não no middleware de propósito: quem lê este arquivo
     precisa ver, na mesma tela, o motivo e a consequência. */
  robots: IGREJA.youtube ? undefined : { index: false, follow: true },
  openGraph: {
    title: 'Guia Church TV',
    description: 'A mensagem de domingo, para ver de novo.',
    url: `${SITE}/guia-church-tv`, type: 'website', locale: 'pt_BR',
  },
};

export default function TV() {
  const canal = IGREJA.youtube;

  return (
    <Site>
      {canal && (
        <Schema dados={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'Guia Church TV',
          url: `${SITE}/guia-church-tv`,
          isPartOf: { '@type': 'WebSite', name: IGREJA.nome, url: SITE },
        }} />
      )}

      <section className="faixa casa-escuro rev">
        <div className="casa-col">
          <p className="indice">Guia Church TV</p>
          <Tit as="h1" className="tit">A mensagem de domingo</Tit>
          <span className="chapeu">Para ver de novo, ou para quem não pôde vir</span>
          <p className="corpo" style={{ marginTop: 40 }}>
            O que é dito no domingo não termina no domingo. A palavra da semana
            fica publicada, e é o mesmo conteúdo que a Pequena Guia conversa
            durante a semana.
          </p>
          <div className="acoes">
            {canal ? (
              <a href={canal} target="_blank" rel="noreferrer" className="acao cheia">
                Ver no canal <IcSeta />
              </a>
            ) : (
              <a href={IGREJA.instagram} target="_blank" rel="noreferrer" className="acao cheia">
                Acompanhar no Instagram <IcSeta />
              </a>
            )}
            <Link href="/cultos" className="acao">Ver o domingo ao vivo</Link>
          </div>
        </div>
        <div className="casa-col larga" style={{ marginTop: 64 }}>
          <Vaga foto={FOTOS.tvPalavra} />
        </div>
      </section>

      {!canal && (
        <section className="faixa casa-papel rev">
          <div className="casa-col">
            <p className="indice">Onde assistir hoje</p>
            <Tit>Enquanto o canal se organiza</Tit>
            <p className="corpo">
              A publicação em vídeo está sendo reunida num canal só. Até lá, o
              que sai toda semana está em {IGREJA.instagramArroba} — e o
              domingo, ao vivo, continua sendo o lugar onde a mensagem acontece
              inteira.
            </p>
            <div className="acoes">
              <a href={IGREJA.instagram} target="_blank" rel="noreferrer" className="acao cheia">
                {IGREJA.instagramArroba} <IcSeta />
              </a>
              <Link href="/como-chegar" className="acao">Como chegar no domingo</Link>
            </div>
          </div>
        </section>
      )}

      <section className="faixa casa-papel rev">
        <div className="casa-col">
          <Tit>Ouviu alguma coisa que ficou</Tit>
          <p className="corpo">
            Mensagem que fica costuma pedir dois passos: uma conversa durante a
            semana, e um lugar para servir. Os dois existem aqui.
          </p>
          <div className="acoes">
            <Link href="/pequena-guia" className="acao cheia">Encontrar uma Pequena Guia <IcSeta /></Link>
            <Link href="/servir" className="acao">Quero servir</Link>
          </div>
        </div>
      </section>
    </Site>
  );
}
