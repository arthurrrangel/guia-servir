import type { Metadata } from 'next';
import { IGREJA, SITE_IGREJA as SITE, MAPA, MAPA_EMBED, ROTA_WAZE, canalDeConversa } from '@/lib/igreja';
import { MODOS, textoDoModo } from '@/lib/chegar';
import { Vozes, Sede, Chapeu, Pil, Img, fim } from '@/components/site/Blocos';
import { Schema } from '@/components/site/Schema';

/* =============================================================================
   /como-chegar — A PÁGINA DE MAIOR INTENÇÃO · 11/10/2026
   Quem abre já decidiu ir. Está nas respostas rápidas e no perfil do
   WhatsApp da igreja, por isso continua existindo fora do menu: a fachada,
   o endereço, as duas rotas, os três modos e o mapa. O CTA leva pra fora.
   ============================================================================= */
export const metadata: Metadata = {
  title: 'Como chegar',
  description: `${IGREJA.nome} fica na ${IGREJA.rua}, ${IGREJA.bairro}, ${IGREJA.cidade}. Rota no Maps e no Waze, estacionamento e a fachada para você reconhecer a porta.`,
  alternates: { canonical: '/como-chegar' },
  openGraph: { title: 'Como chegar · GUIA Church', description: `${IGREJA.rua}, ${IGREJA.bairro}.`, url: `${SITE}/como-chegar`, images: [{ url: '/og-como-chegar.jpg', width: 1200, height: 630 }] },
};

export default function ComoChegar() {
  const conversa = canalDeConversa('Oi! Estou indo para a GUIA e queria uma orientação de como chegar. ');
  return (
    <>
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'Place', name: IGREJA.nome, hasMap: MAPA, url: `${SITE}/como-chegar`,
        address: { '@type': 'PostalAddress', streetAddress: IGREJA.rua, addressLocality: `${IGREJA.bairro}, ${IGREJA.cidade}`, addressRegion: IGREJA.uf, postalCode: IGREJA.cep, addressCountry: 'BR' },
      }} />
      <Schema dados={{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: MODOS.map(m => ({ '@type': 'Question', name: m.t, acceptedAnswer: { '@type': 'Answer', text: textoDoModo(m) } })) }} />

      <section className="s-heroi" aria-labelledby="t-chegar">
        <Img lugar="chegar-heroi" prioridade />
        <div className="s-in s-heroi-in">
          <Chapeu forte="Onde fica" resto={`${IGREJA.cultoDia}, ${IGREJA.cultoHora}`} />
          <Vozes as="h1" id="t-chegar" className="s-h1" it="chegar">Como chegar</Vozes>
          <p className="s-lead grande"><span style={{ whiteSpace: 'nowrap' }}>{IGREJA.rua}</span>, {IGREJA.bairro}, {IGREJA.cidade}.</p>
          <div className="s-acoes">
            <Pil href={MAPA} fora>Traçar rota no Maps</Pil>
            <Pil href={ROTA_WAZE} fora>Abrir no Waze</Pil>
          </div>
          <p className="s-micro">Tem alguém na porta esperando você.</p>
        </div>
      </section>

      <section className="s-faixa papel" aria-labelledby="t-modos">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-cab centro s-rev">
            <Vozes id="t-modos" className="s-h2" it="gente">Como chegar até a gente</Vozes>
            <p className="s-lead">De carro, de aplicativo ou a pé.</p>
          </div>
          <div className="s-cartoes tres s-rev d1">
            {MODOS.map(m => (
              <div key={m.n} className="s-cartao">
                <span className="s-cartao-n">{m.n}</span>
                <span className="s-cartao-t" style={{ fontSize: 'clamp(26px,2.4vw,34px)' }}>{m.t}</span>
                <span className="s-cartao-d">{fim(m.d)}{m.endereco && <><br /><b style={{ fontWeight: 600, color: '#fff' }}>{m.endereco}</b></>}{m.d2 && <><br />{fim(m.d2)}</>}</span>
              </div>
            ))}
          </div>
          <div className="s-mapa s-rev" style={{ marginTop: 'clamp(16px,2vw,24px)' }}>
            <iframe src={MAPA_EMBED} title={`Mapa: ${IGREJA.nome}, ${IGREJA.rua}, ${IGREJA.bairro}`} loading="lazy" allowFullScreen={false} referrerPolicy="no-referrer-when-downgrade" />
            <div className="s-mapa-cartao">
              <span className="s-selo">{IGREJA.cultoDia}, {IGREJA.cultoHora}</span>
              <b className="s-h3">{IGREJA.rua}</b>
              <span className="s-micro">{fim(`${IGREJA.bairro}, ${IGREJA.cidade} · ${IGREJA.cep}`)}</span>
              <div className="s-acoes">
                <Pil href={MAPA} fora>Maps</Pil>
                <Pil href={ROTA_WAZE} fora>Waze</Pil>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="conversa" className="s-fecho s-rev" aria-labelledby="t-fim">
        <Img lugar="fecho" />
        <div className="s-in">
          <Vozes id="t-fim" className="s-h2 media" it="domingo">O que esperar de um domingo</Vozes>
          <p className="s-lead">Louvor, Palavra e café. Se é a sua primeira vez, diga na porta.</p>
          <div className="s-acoes centro">
            <Pil href="/cultos">Ver os cultos</Pil>
            <Pil href={conversa.href} fora>Falar no WhatsApp</Pil>
          </div>
        </div>
      </section>
    </>
  );
}
