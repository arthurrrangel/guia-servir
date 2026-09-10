import type { Metadata } from 'next';
import Link from 'next/link';
import { cartao } from '@/lib/meta';
import { Site } from '@/components/Site';
import { Tit, Schema, Luz } from '@/components/Texto';
import { IcSeta } from '@/components/Icones';
import { Chevron } from '@/components/Marca';
import { IGREJA, SITE, SIGLA, SIGLA_FRASE } from '@/lib/igreja';
import { src as cria, alt as criaAlt } from '@/lib/criativos';

/* =============================================================================
   /sobre — QUEM SOMOS

   TODO O TEXTO DE IDENTIDADE É DA IGREJA, palavra por palavra: a abertura
   (08/09/2026, do Arthur: "Uma comunidade que cultiva uma nova cultura" e os
   dois parágrafos), sigla, versículo, pilares e alvo. Aqui cada pedaço tem
   um recipiente, centrado: a sigla em quatro azulejos, o versículo de ponta a
   ponta sobre a foto da palavra, os pilares em três cartões, o alvo como
   de → para. O fecho convida para o culto e leva ao endereço.

   O bloco de liderança saiu da página enquanto nome e papel não estão
   definidos: quadro vazio com "entra aqui depois" é bastidor, não site.
   ============================================================================= */

const PILARES = [
  { q: 'Relacionamento', r: 'Ninguém foi chamado para caminhar sozinho. Pertencer é parte fundamental da vida cristã.' },
  { q: 'Generosidade', r: 'Tudo o que temos vem de Deus. Somos generosos com o tempo, os recursos e os dons que Ele colocou em nossas mãos.' },
  { q: 'Serviço', r: 'Serviço é característica de liderança no Reino. Quem serve se torna protagonista e agente de mudança na sociedade.' },
];

export const metadata: Metadata = {
  title: 'Quem somos',
  description:
    `Uma comunidade que cultiva uma nova cultura. GUIA é sigla: ${SIGLA_FRASE}. Uma igreja na Barra da Tijuca construída sobre relacionamento, generosidade e serviço.`,
  alternates: { canonical: '/sobre' },
  ...cartao({ titulo: 'Quem somos', descricao: `${SIGLA_FRASE}. Cultivando uma nova cultura, na Barra da Tijuca.`, caminho: '/sobre', imagem: 'sobre' }),
};

export default function Sobre() {
  return (
    <Site atual="/sobre" escuro>
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'AboutPage', name: `Quem somos · ${IGREJA.nome}`, url: `${SITE}/sobre`,
        about: { '@type': 'Church', name: IGREJA.nome, slogan: IGREJA.frase, url: SITE,
          address: { '@type': 'PostalAddress', streetAddress: IGREJA.rua, addressLocality: `${IGREJA.bairro}, ${IGREJA.cidade}`, addressRegion: IGREJA.uf, postalCode: IGREJA.cep, addressCountry: 'BR' } },
      }} />

      {/* ------------------------------------------------------------- herói */}
      <section className="g-cheio alta centro rev">
        <img src={cria('sobre')} alt={criaAlt('sobre')} fetchPriority="high" />
        <div className="g">
          <p className="g-rot">Quem somos</p>
          <Tit as="h1" className="g-h1">Uma comunidade que cultiva uma nova cultura</Tit>
          <p className="g-ed">A GUIA é uma igreja que existe para ajudar pessoas a viverem uma fé prática, construída em relacionamento com Deus e com outras pessoas.</p>
          <div className="g-acoes">
            <Link href="/cultos" className="acao cheia">Ver os cultos <IcSeta /></Link>
            <Link href="/pequena-guia" className="g-link claro">Pequena Guia</Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ o que acreditamos
          O segundo parágrafo do Arthur, sozinho numa faixa clara: é a frase
          que explica a de cima, e merece respirar antes da sigla. */}
      <section className="casa-papel rev">
        <div className="g g-secao justa">
          <div className="c">
            <p className="g-rot">O que acreditamos</p>
            <p className="g-ed g-ed-grande">Acreditamos que a igreja é mais do que um lugar para frequentar. É uma comunidade onde cada pessoa pode encontrar acolhimento, crescer na fé, desenvolver seus dons e participar do que Deus está fazendo.</p>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- a sigla */}
      <section className="casa-escuro retic rev">
        <div className="g g-secao">
          <div className="c">
            <p className="g-rot">O nome</p>
            <Tit className="g-h2">Somos GUIA</Tit>
            <p className="g-ed">O chevron é o avanço.</p>
          </div>
          {/* os quatro vêm de lib/igreja.ts, a mesma lista da home. Eram
              escritos à mão aqui, e foi assim que "Unido" virou "Unidos" só
              deste lado. */}
          <div className="g-tiles quatro centro c-larga c-bloco grande">
            {SIGLA.map(x => (
              <div className="g-tile" key={x.t}>
                <span className="g-tile-l">
                  {x.l === '>' ? <span className="marca-chev" aria-hidden="true"><Chevron /></span> : x.l}
                </span>
                <span>
                  <span className="g-tile-t">{x.t}</span>
                  <span className="g-tile-d">{x.d}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------- o versículo, de ponta a ponta */}
      <section className="g-cheio meio centro rev">
        <img src={cria('palavra')} alt="" loading="lazy" decoding="async" />
        <div className="g">
          <blockquote className="g-ed g-versiculo">
            <Luz>Eis que o povo é um, e todos têm uma mesma língua; e isto é o que começam a fazer; e, agora, não haverá restrição para tudo o que eles intentarem fazer.</Luz>
          </blockquote>
          <p className="g-rot g-versiculo-ref">Gênesis 11:6</p>
        </div>
      </section>

      {/* ------------------------------------------------------------ pilares */}
      <section className="casa-areia rev">
        <div className="g g-secao">
          <div className="g-cab">
            <div className="g-cab-txt">
              <p className="g-rot">Nossos pilares</p>
              <Tit className="g-h2">Relacionamento, generosidade e serviço</Tit>
            </div>
          </div>
          <div className="cartoes c-bloco grande">
            {PILARES.map((p, i) => (
              <div key={p.q} className="cartao">
                <span className="cartao-n">0{i + 1}</span>
                <h3 className="cartao-t">{p.q}</h3>
                <p className="cartao-d">{p.r}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- o alvo */}
      <section className="casa-papel rev">
        <div className="g g-secao">
          <div className="g-cab">
            <div className="g-cab-txt">
              <p className="g-rot">Nosso alvo</p>
              <Tit className="g-h2">Plantar cada cristão no solo da responsabilidade do Reino</Tit>
            </div>
          </div>
          <div className="c-media c-bloco">
            <ul className="g-vira">
              <li><span className="g-vira-de">Encher bancos</span><span className="g-vira-chev"><Chevron /></span><span className="g-vira-para">Formar pessoas comprometidas com o Reino</span></li>
              <li><span className="g-vira-de">Espectadores</span><span className="g-vira-chev"><Chevron /></span><span className="g-vira-para">Participantes</span></li>
              <li><span className="g-vira-de">Pessoas que recebam</span><span className="g-vira-chev"><Chevron /></span><span className="g-vira-para">Pessoas que sirvam, contribuam e frutifiquem</span></li>
            </ul>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- fecho */}
      <section className="g-cheio centro fecho rev">
        <img src={cria('sobre-fecho')} alt="" loading="lazy" decoding="async" />
        <div className="g">
          <p className="g-rot">Venha nos visitar</p>
          <Tit className="g-h2">Conheça a GUIA de perto</Tit>
          <p className="g-ed">Participe de um culto e descubra uma comunidade preparada para receber você e sua família.</p>
          <div className="g-acoes">
            <Link href="/como-chegar" className="acao cheia">Quero conhecer a GUIA <IcSeta /></Link>
            <Link href="/cultos" className="g-link claro">Ver os cultos</Link>
          </div>
        </div>
      </section>
    </Site>
  );
}
