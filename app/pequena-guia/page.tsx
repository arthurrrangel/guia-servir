import type { Metadata } from 'next';
import Link from 'next/link';
import { cartao } from '@/lib/meta';
import { Site } from '@/components/Site';
import { Tit, Schema } from '@/components/Texto';
import { IcSeta } from '@/components/Icones';
import { IGREJA, SITE, canalDeConversa } from '@/lib/igreja';
import { PEQUENAS_GUIAS, MAPA_REGIAO } from '@/lib/pequenas-guias';
import { Grupos } from '@/components/Grupos';
import { src as cria, alt as criaAlt } from '@/lib/criativos';
import { FormPequenaGuia } from '@/components/FormPequenaGuia';

/* =============================================================================
   /pequena-guia — O GRUPO DA SEMANA

   Quatro blocos: o herói (a frase do Arthur, 08/09/2026), os grupos (um mapa
   com um pino por grupo e a lista, nunca a casa de ninguém, ver
   lib/pequenas-guias), o pedido "Encontre uma Pequena Guia perto de você"
   com o formulário, e o fecho com a conversa.

   O FORMULÁRIO (components/FormPequenaGuia.tsx) grava numa planilha da igreja
   pela rota /api/pequena-guia e abre a conversa com a mensagem pronta. O que
   continua valendo desde o primeiro dia: nenhum dado de visitante entra no
   banco que está no ar servindo a escala de todo mundo.

   No celular os cartões viram uma fila que desliza para o lado: doze mapas
   empilhados eram dez telas de rolagem.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Pequena Guia',
  description:
    'Relacionamentos que fortalecem sua fé. A Pequena Guia é o grupo da GUIA Church que se reúne durante a semana para compartilhar a vida, estudar a Palavra e crescer em comunidade, perto de onde você mora.',
  alternates: { canonical: '/pequena-guia' },
  ...cartao({ titulo: 'Pequena Guia', descricao: 'Relacionamentos que fortalecem sua fé. Um grupo perto de onde você mora.', caminho: '/pequena-guia', imagem: 'pequena-guia' }),
};

const CONVITE = canalDeConversa(
  'Oi! Vi o site da GUIA e quero participar de uma Pequena Guia. ' +
  'Meu nome é: \nMoro no bairro: \nMelhor dia e horário para mim: ',
);

export default function PequenaGuia() {
  const presenciais = PEQUENAS_GUIAS.filter(p => !p.online).length;
  const online = PEQUENAS_GUIAS.length - presenciais;
  return (
    <Site atual="/pequena-guia" escuro>
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'WebPage', name: 'Pequena Guia · grupos da GUIA Church', url: `${SITE}/pequena-guia`,
        isPartOf: { '@type': 'WebSite', name: IGREJA.nome, url: SITE },
        about: { '@type': 'Church', name: IGREJA.nome, url: SITE,
          address: { '@type': 'PostalAddress', streetAddress: IGREJA.rua, addressLocality: `${IGREJA.bairro}, ${IGREJA.cidade}`, addressRegion: IGREJA.uf, postalCode: IGREJA.cep, addressCountry: 'BR' } },
      }} />

      {/* ------------------------------------------------------------- herói */}
      <section className="g-cheio alta centro rev">
        <img src={cria('grupos')} alt={criaAlt('grupos')} fetchPriority="high" />
        <div className="g">
          <p className="g-rot">Pequena Guia</p>
          <Tit as="h1" className="g-h1">Relacionamentos que fortalecem sua fé.</Tit>
          <p className="g-ed">Um espaço para compartilhar a vida, estudar a Palavra e crescer em comunidade.</p>
          <div className="g-acoes">
            <a href="#encontrar" className="acao cheia">Quero encontrar uma Pequena Guia <IcSeta /></a>
            <Link href="/cultos" className="g-link claro">Prefiro começar pelo domingo</Link>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- onde elas acontecem */}
      <section className="casa-papel rev">
        <div className="g g-secao">
          <div className="g-cab">
            <div className="g-cab-txt">
              <p className="g-rot">Onde elas acontecem</p>
              <Tit className="g-h2">{PEQUENAS_GUIAS.length ? 'Uma perto de você' : 'Espalhadas pela Barra e arredores'}</Tit>
              <p className="g-ed">
                {PEQUENAS_GUIAS.length
                  ? `${presenciais} grupos na cidade${online ? `, ${online} por vídeo` : ''}.`
                  : 'Diga o seu bairro e a gente aponta o mais perto.'}
              </p>
            </div>
          </div>

          {PEQUENAS_GUIAS.length ? (
            <Grupos />
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

      {/* ------------------------------------------ encontre a sua: o pedido
          O texto do Arthur e o formulário de cinco campos. A âncora #encontrar
          é o destino do botão do herói. */}
      <section id="encontrar" className="casa-areia rev" aria-labelledby="encontrar-t">
        <div className="g g-secao">
          <div className="c">
            <p className="g-rot">Perto de você</p>
            <Tit className="g-h2" id="encontrar-t">Encontre uma Pequena Guia perto de você</Tit>
            <p className="g-ed">A Pequena Guia é um grupo que se reúne durante a semana para compartilhar a vida, estudar a Palavra e crescer em comunidade. É um espaço de relacionamento, cuidado e fé, onde você pode caminhar com outras pessoas e encontrar um grupo próximo da sua casa.</p>
            <p className="g-form-chamada">Preencha seus dados e encontre um grupo próximo da sua casa.</p>
          </div>
          <div className="c c-bloco">
            <FormPequenaGuia />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ a conversa */}
      <section className="g-cheio centro fecho rev">
        <img src={cria('grupos-fecho')} alt="" loading="lazy" decoding="async" />
        <div className="g">
          <p className="g-rot">Achar o seu</p>
          <Tit className="g-h2">Diga onde você mora. A gente diz qual fica perto.</Tit>
          <div className="g-acoes">
            <a href="#encontrar" className="acao cheia">Quero encontrar uma Pequena Guia <IcSeta /></a>
            <a href={CONVITE.href} target="_blank" rel="noreferrer" className="g-link claro">Prefiro conversar direto</a>
          </div>
        </div>
      </section>
    </Site>
  );
}
