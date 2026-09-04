import type { Metadata } from 'next';
import Link from 'next/link';
import { cartao } from '@/lib/meta';
import { Site } from '@/components/Site';
import { Tit, Schema } from '@/components/Texto';
import { IcSeta } from '@/components/Icones';
import { IGREJA, SITE, canalDeConversa } from '@/lib/igreja';
import { PEQUENAS_GUIAS, mapaDaPequenaGuia, MAPA_REGIAO } from '@/lib/pequenas-guias';

/* =============================================================================
   /pequena-guia — O GRUPO DA SEMANA

   Três blocos: o herói (o que é, em uma linha), os grupos (um cartão por
   grupo, com o mapa do bairro — nunca da casa, ver lib/pequenas-guias), e
   o fecho com a conversa. O formulário é uma conversa por link: nenhum dado
   de visitante entra num banco que está no ar servindo a escala de todo mundo.

   No celular os cartões viram uma fila que desliza para o lado: doze mapas
   empilhados eram dez telas de rolagem.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Pequena Guia',
  description:
    'As Pequenas Guias são os grupos da GUIA Church que se encontram durante a semana, perto de onde você mora. Sem inscrição, sem custo — é só dizer onde você está.',
  alternates: { canonical: '/pequena-guia' },
  ...cartao({ titulo: 'Pequena Guia', descricao: 'O grupo da semana, perto de onde você mora. Uma hora, na casa de alguém.', caminho: '/pequena-guia', imagem: 'pequena-guia' }),
};

const CONVITE = canalDeConversa(
  'Oi! Vi o site da GUIA e quero participar de uma Pequena Guia. ' +
  'Meu nome é: \nMoro no bairro: \nMelhor dia e horário para mim: ',
);

export default function PequenaGuia() {
  const presenciais = PEQUENAS_GUIAS.filter(p => !p.online).length;
  const online = PEQUENAS_GUIAS.length - presenciais;
  return (
    <Site atual="/pequena-guia">
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'WebPage', name: 'Pequena Guia · grupos da GUIA Church', url: `${SITE}/pequena-guia`,
        isPartOf: { '@type': 'WebSite', name: IGREJA.nome, url: SITE },
        about: { '@type': 'Church', name: IGREJA.nome, url: SITE,
          address: { '@type': 'PostalAddress', streetAddress: IGREJA.rua, addressLocality: `${IGREJA.bairro}, ${IGREJA.cidade}`, addressRegion: IGREJA.uf, postalCode: IGREJA.cep, addressCountry: 'BR' } },
      }} />

      {/* ------------------------------------------------------------- herói */}
      <section className="g-cheio alta centro rev">
        <img src="/fotos/acolhida.webp" alt="Pessoas da GUIA Church se cumprimentando" fetchPriority="high" />
        <div className="g">
          <p className="g-rot">Durante a semana</p>
          <Tit as="h1" className="g-h1">Pequena Guia</Tit>
          <p className="g-ed">Uma hora por semana, perto de você.</p>
          <div className="g-acoes">
            <a href={CONVITE.href} target="_blank" rel="noreferrer" className="acao cheia">Quero participar <IcSeta /></a>
            <Link href="/cultos" className="acao">Prefiro começar pelo domingo</Link>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- onde elas acontecem */}
      <section className="casa-papel rev">
        <div className="g g-secao">
          <div className="c">
            <p className="g-rot">Onde elas acontecem</p>
            <Tit className="g-h2">{PEQUENAS_GUIAS.length ? 'Uma perto de você' : 'Espalhadas pela Barra e arredores'}</Tit>
            <p className="g-ed">
              {PEQUENAS_GUIAS.length
                ? `${presenciais} grupos na cidade${online ? `, ${online} por vídeo` : ''}.`
                : 'Diga o seu bairro e a gente aponta o mais perto.'}
            </p>
          </div>

          {PEQUENAS_GUIAS.length ? (
            <div className="pgs centro fila">
              {PEQUENAS_GUIAS.map(pg => {
                const conv = canalDeConversa(`Oi! Vi o site da GUIA e quero ir na ${pg.nome} (${pg.dia}, ${pg.hora}). Meu nome é: `);
                return (
                  <article key={pg.nome} className="pg">
                    <div className="pg-mapa">
                      {pg.online
                        ? <div className="pg-online" aria-hidden="true"><span>{pg.online}</span></div>
                        : <>
                            <iframe src={mapaDaPequenaGuia(pg)} title={`Mapa: ${pg.nome}, ${pg.bairro}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                            <span className="pg-mira" aria-hidden="true" />
                          </>}
                    </div>
                    <div className="pg-corpo">
                      <p className="g-rot">{pg.bairro}</p>
                      <span className="pg-nome">{pg.nome}</span>
                      <span className="pg-quando">{pg.dia}, {pg.hora}</span>
                      {(pg.lideres || pg.publico) && (
                        <span className="pg-nota">{[pg.lideres, pg.publico].filter(Boolean).join(' · ')}</span>
                      )}
                      <div className="g-acoes">
                        <a href={conv.href} target="_blank" rel="noreferrer" className="acao cheia">Quero ir nessa <IcSeta /></a>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="pg-regiao">
              <iframe src={MAPA_REGIAO} title={`Mapa: ${IGREJA.bairro} e arredores`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              <div className="mapa-cartao">
                <p className="g-rot">Sua região</p>
                <p className="g-h3">Diga o seu bairro</p>
                <div className="g-acoes">
                  <a href={CONVITE.href} target="_blank" rel="noreferrer" className="acao cheia">{CONVITE.rot} <IcSeta /></a>
                </div>
              </div>
            </div>
          )}
          <p className="pgs-dica" aria-hidden="true">Deslize para ver todas</p>
        </div>
      </section>

      {/* ------------------------------------------------------------ a conversa */}
      <section className="g-cheio centro fecho rev">
        <img src="/fotos/congregacao.webp" alt="" loading="lazy" decoding="async" />
        <div className="g">
          <p className="g-rot">Achar o seu</p>
          <Tit className="g-h2">Diga onde você mora. A gente diz qual fica perto.</Tit>
          <div className="g-acoes">
            <a href={CONVITE.href} target="_blank" rel="noreferrer" className="acao cheia">{CONVITE.rot} <IcSeta /></a>
          </div>
        </div>
      </section>
    </Site>
  );
}
