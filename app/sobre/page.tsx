import type { Metadata } from 'next';
import Link from 'next/link';
import { Site } from '@/components/Site';
import { Tit, Schema } from '@/components/Texto';
import { IcSeta } from '@/components/Icones';
import { Chevron } from '@/components/Marca';
import { Vaga } from '@/components/Vaga';
import { FOTOS } from '@/lib/imagens';
import { IGREJA, SITE } from '@/lib/igreja';

/* =============================================================================
   /sobre — QUEM SOMOS

   TODO O TEXTO DE IDENTIDADE É DA IGREJA, palavra por palavra: sigla,
   versículo, pilares e alvo. O que esta página faz de diferente da home é a
   ORDEM e o RECIPIENTE — abre por quem chega, e dá a cada pedaço uma forma:
   a sigla em quatro azulejos, o versículo de ponta a ponta sobre a foto da
   palavra, os pilares numerados na areia, o alvo como de → para.

   O bloco de liderança tem a foto reservada e o texto em espera: "Pastor
   Presidente" ou "Evangelista" é decisão em aberto, e título publicado é
   mais caro de corrigir do que de esperar.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Quem somos',
  description:
    'GUIA é sigla: Grupo Unido, Interagindo e Avançando. Uma igreja na Barra da Tijuca construída sobre relacionamento, generosidade e serviço.',
  alternates: { canonical: '/sobre' },
  openGraph: {
    title: 'Quem somos · GUIA Church',
    description: 'Grupo Unido, Interagindo e Avançando. Cultivando uma nova cultura, na Barra da Tijuca.',
    url: `${SITE}/sobre`, type: 'website', locale: 'pt_BR',
  },
};

export default function Sobre() {
  return (
    <Site atual="/sobre">
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'AboutPage', name: `Quem somos · ${IGREJA.nome}`, url: `${SITE}/sobre`,
        about: { '@type': 'Church', name: IGREJA.nome, slogan: IGREJA.frase, url: SITE,
          address: { '@type': 'PostalAddress', streetAddress: IGREJA.rua, addressLocality: `${IGREJA.bairro}, ${IGREJA.cidade}`, addressRegion: IGREJA.uf, postalCode: IGREJA.cep, addressCountry: 'BR' } },
      }} />

      {/* ------------------------------------------------------------- herói */}
      <section className="casa-papel rev">
        <div className="g g-secao primeira">
          <div className="g-grade meio">
            <div className="g-c5 g-d8">
              <div className="g-foto alta leva">
                <img src="/fotos/equipe.webp" alt="Equipe de louvor da GUIA Church" fetchPriority="high" />
                <div className="g-selo escuro">GUI&gt;<small>{IGREJA.frase}</small></div>
              </div>
            </div>
            <div className="g-c6 g-inv">
              <p className="g-rot">A igreja</p>
              <Tit as="h1" className="g-h1">Quem somos</Tit>
              <p className="g-ed">Um povo, não uma plateia.</p>
              <p className="g-corpo">
                Uma igreja na Barra da Tijuca que se reúne no domingo de manhã e
                passa a semana tentando ser um povo. Se você está chegando agora,
                o resumo honesto é esse — o resto desta página explica de onde
                ele vem.
              </p>
              <div className="g-acoes">
                <Link href="/cultos" className="acao cheia">Ver o domingo <IcSeta /></Link>
                <Link href="/pequena-guia" className="acao">Encontrar uma Pequena Guia</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- a sigla */}
      <section className="casa-escuro rev">
        <div className="g g-secao">
          <div className="g-grade fim">
            <div className="g-c7">
              <p className="g-rot">O nome</p>
              <Tit className="g-h2">Somos GUIA</Tit>
            </div>
            <div className="g-c4 g-d9">
              <p className="g-corpo">
                GUIA é sigla, e é a razão de a marca ser <b style={{ fontWeight: 600, color: '#fff' }}>GUI&gt;</b>:
                o chevron é o avanço. Ela vem do princípio de Gênesis 11:6.
              </p>
            </div>
          </div>
          <div className="g-tiles quatro">
            <div className="g-tile"><span className="g-tile-l">G</span><span><span className="g-tile-t">Grupo</span><span className="g-tile-d">Somos um povo. Não caminhamos isoladamente.</span></span></div>
            <div className="g-tile"><span className="g-tile-l">U</span><span><span className="g-tile-t">Unidos</span><span className="g-tile-d">Cada pessoa tem um papel na construção de algo maior do que si mesma.</span></span></div>
            <div className="g-tile"><span className="g-tile-l">I</span><span><span className="g-tile-t">Interagindo</span><span className="g-tile-d">Cultura se constrói por relacionamento, comunicação e participação.</span></span></div>
            <div className="g-tile"><span className="g-tile-l"><span className="marca-chev" aria-hidden="true"><Chevron /></span></span><span><span className="g-tile-t">Avançando</span><span className="g-tile-d">Um povo unido, que se comunica e anda na mesma direção, tem força para avançar.</span></span></div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------- o versículo, de ponta a ponta */}
      <section className="g-cheio meio rev">
        <img src="/fotos/palavra.webp" alt="" loading="lazy" decoding="async" />
        <div className="g">
          <div className="g-grade">
            <div className="g-c9 g-d2">
              <blockquote className="g-ed" style={{ margin: 0, fontSize: 'clamp(28px,4.2vw,62px)', color: '#fff' }}>
                Eis que o povo é um, e todos têm uma mesma língua; e isto é o que
                começam a fazer; e, agora, não haverá restrição para tudo o que
                eles intentarem fazer.
              </blockquote>
              <p className="g-rot" style={{ marginTop: 28, marginBottom: 0 }}>Gênesis 11:6</p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ pilares */}
      <section className="casa-areia rev">
        <div className="g g-secao">
          <div className="g-grade">
            <div className="g-c4">
              <div className="g-fixa">
                <p className="g-rot">Nossos pilares</p>
                <Tit className="g-h2">Relacionamento, generosidade e serviço</Tit>
                <p className="g-ed">Ninguém foi chamado para caminhar sozinho.</p>
              </div>
            </div>
            <div className="g-c7 g-d6">
              <ol className="g-perg">
                <li><span className="g-perg-n">01</span><div><h3 className="g-perg-q">Relacionamento</h3>
                  <p className="g-perg-r">Ninguém foi chamado para caminhar sozinho. Pertencer é parte fundamental da vida cristã.</p></div></li>
                <li><span className="g-perg-n">02</span><div><h3 className="g-perg-q">Generosidade</h3>
                  <p className="g-perg-r">Tudo o que temos vem de Deus. Somos generosos com o tempo, os recursos e os dons que Ele colocou em nossas mãos.</p></div></li>
                <li><span className="g-perg-n">03</span><div><h3 className="g-perg-q">Serviço</h3>
                  <p className="g-perg-r">Serviço é característica de liderança no Reino. Quem serve se torna protagonista e agente de mudança na sociedade.</p></div></li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- o alvo */}
      <section className="casa-papel rev">
        <div className="g g-secao">
          <div className="g-grade">
            <div className="g-c5">
              <p className="g-rot">Nosso alvo</p>
              <Tit className="g-h2">Plantar cada cristão no solo da responsabilidade do Reino</Tit>
              <p className="g-corpo">
                Que cada pessoa encontre seu lugar, compreenda sua responsabilidade e
                desenvolva aquilo que Deus depositou na vida dela.
              </p>
            </div>
            <div className="g-c6 g-d7">
              <ul className="g-vira" style={{ marginTop: 0 }}>
                <li><span className="g-vira-de">Encher bancos</span><span className="g-vira-chev"><Chevron /></span><span className="g-vira-para">Formar pessoas comprometidas com o Reino</span></li>
                <li><span className="g-vira-de">Espectadores</span><span className="g-vira-chev"><Chevron /></span><span className="g-vira-para">Participantes</span></li>
                <li><span className="g-vira-de">Pessoas que recebam</span><span className="g-vira-chev"><Chevron /></span><span className="g-vira-para">Pessoas que sirvam, contribuam e frutifiquem</span></li>
              </ul>
              <p className="g-corpo">
                Quando cada cristão entende seu lugar e assume sua responsabilidade, a
                igreja deixa de ser um lugar onde as pessoas chegam e passa a ser um
                povo que vive, serve e avança junto.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ liderança */}
      <section className="casa-escuro rev">
        <div className="g g-secao justa">
          <div className="g-grade meio">
            <div className="g-c4">
              <p className="g-rot">Quem conduz</p>
              <Tit className="g-h2">A liderança</Tit>
              <p className="g-corpo">Nome e papel entram aqui assim que estiverem definidos.</p>
            </div>
            <div className="g-c7 g-d6">
              <Vaga foto={FOTOS.lideranca} />
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- fecho */}
      <section className="g-cheio rev">
        <img src="/fotos/congregacao.webp" alt="" loading="lazy" decoding="async" />
        <div className="g">
          <p className="g-rot">Na prática</p>
          <Tit className="g-h2">Isso tem dois endereços na semana.</Tit>
          <div className="g-acoes">
            <Link href="/pequena-guia" className="acao cheia">Encontrar uma Pequena Guia <IcSeta /></Link>
            <Link href="/servir" className="acao">Quero servir</Link>
          </div>
        </div>
      </section>
    </Site>
  );
}
