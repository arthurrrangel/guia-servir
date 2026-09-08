import type { Metadata } from 'next';
import { cartao } from '@/lib/meta';
import Link from 'next/link';
import { Site } from '@/components/Site';
import { Cabecalho, Fecho } from '@/components/Pagina';
import { Schema } from '@/components/Texto';
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
  ...cartao({ titulo: 'GUIA Church TV', descricao: 'A mensagem de domingo, para ver de novo.', caminho: '/guia-church-tv', imagem: 'cultos' }),
};

export default function TV() {
  const canal = IGREJA.youtube;
  return (
    <Site escuro>
      {canal && <Schema dados={{ '@context': 'https://schema.org', '@type': 'WebPage', name: 'Guia Church TV', url: `${SITE}/guia-church-tv`, isPartOf: { '@type': 'WebSite', name: IGREJA.nome, url: SITE } }} />}

      <Cabecalho criativo="tv" rot="GUIA Church TV" titulo="A mensagem de domingo"
        ed={canal ? 'Para ver de novo.' : `Toda semana, em ${IGREJA.instagramArroba}.`}
        acoes={<>
          {canal
            ? <a href={canal} target="_blank" rel="noreferrer" className="acao cheia">Ver no canal <IcSeta /></a>
            : <a href={IGREJA.instagram} target="_blank" rel="noreferrer" className="acao cheia">Acompanhar no Instagram <IcSeta /></a>}
          <Link href="/cultos" className="g-link claro">Ver o domingo ao vivo</Link>
        </>} />
      {/* o domingo, para quem chegou aqui procurando a mensagem: a página não
          fica só no cabeçalho (v3, 08/09/2026) */}
      <Fecho rot="Ao vivo" titulo="Domingo, 10h, na Barra da Tijuca."
        acoes={<>
          <Link href="/cultos" className="acao cheia">Ver o domingo <IcSeta /></Link>
          <Link href="/como-chegar" className="g-link claro">Como chegar</Link>
        </>} />
    </Site>
  );
}
