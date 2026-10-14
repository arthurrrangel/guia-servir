import type { Metadata } from 'next';
import { Chevron } from '@/components/Marca';
import { IGREJA, SITE_IGREJA as SITE, SIGLA, SIGLA_FRASE } from '@/lib/igreja';
import { Vozes, Sede, Arroba, Chapeu, Pil, Img, Fecho, UmaLinha, liga, ligaTexto } from '@/components/site/Blocos';
import { Fundo } from '@/components/site/Midia';
import { Schema } from '@/components/site/Schema';

/* =============================================================================
   /sobre — QUEM SOMOS · 11/10/2026

   A identidade da igreja na forma da apresentação: herói · mais do que um
   lugar para frequentar · somos GUIA (a sigla) · o versículo · os pilares
   (em passos) · o alvo (de → para, no cartão claro) · conheça de perto.
   14/10/2026, no celular: uma frase sob cada título; o "não queremos encher
   bancos" sai do começo porque o alvo, mais embaixo, diz o mesmo.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Quem somos',
  description: `Uma comunidade que cultiva uma nova cultura. GUIA é sigla: ${SIGLA_FRASE}. Uma igreja na Barra da Tijuca construída sobre relacionamento, generosidade e serviço.`,
  alternates: { canonical: '/sobre' },
  openGraph: { title: 'Quem somos · GUIA Church', description: `${SIGLA_FRASE}.`, url: `${SITE}/sobre`, images: [{ url: '/og-sobre.jpg', width: 1200, height: 630 }] },
};

const PILARES = [
  { n: '01', t: 'Relacionamento', d: 'Ninguém foi chamado pra caminhar sozinho. Pertencer é parte fundamental da vida cristã, e é por isso que a gente se encontra no domingo, no sábado e na semana.' },
  { n: '02', t: 'Generosidade', d: 'Tudo o que temos vem de Deus. Somos generosos com o tempo, os recursos e os dons que Ele colocou nas nossas mãos.' },
  { n: '03', t: 'Serviço', d: 'Serviço é característica de liderança no Reino. Quem serve se torna protagonista e agente de mudança na sociedade.' },
];

const VIRA = [
  { de: 'Encher bancos', para: 'Formar pessoas comprometidas com o Reino' },
  { de: 'Espectadores', para: 'Participantes' },
  { de: 'Pessoas que recebem', para: 'Pessoas que servem, contribuem e frutificam' },
];

export default function Sobre() {
  return (
    <>
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'AboutPage', name: `Quem somos · ${IGREJA.nome}`, url: `${SITE}/sobre`,
        about: { '@type': 'Church', name: IGREJA.nome, slogan: IGREJA.frase, url: SITE, address: { '@type': 'PostalAddress', streetAddress: IGREJA.rua, addressLocality: `${IGREJA.bairro}, ${IGREJA.cidade}`, addressRegion: IGREJA.uf, postalCode: IGREJA.cep, addressCountry: 'BR' } },
      }} />

      <section className="s-heroi" aria-labelledby="t-sobre">
        <Fundo video="sobre" prioridade />
        <div className="s-in s-heroi-in">
          <Chapeu forte="Quem somos" resto={IGREJA.nome} />
          <Vozes as="h1" id="t-sobre" className="s-h1 longa" it="uma nova cultura">Uma comunidade que cultiva uma nova cultura</Vozes>
          <p className="s-lead grande">A GUIA existe pra ajudar pessoas a viver uma fé prática.<span className="s-resto"> Uma fé construída em relacionamento com Deus e com outras pessoas.</span></p>
          <div className="s-acoes">
            <Pil href="/cultos">Ver os cultos</Pil>
            <Pil href="/servir">Quero servir</Pil>
          </div>
        </div>
      </section>

      <section className="s-faixa papel">
        <div className="s-in">
          <Arroba className="topo" />
          <div className="s-duas">
            <div className="s-rev">
              <Vozes className="s-h2 media" it="para frequentar">Mais do que um lugar para frequentar</Vozes>
              <p className="s-lead">{ligaTexto("Acreditamos que a igreja é uma comunidade: um lugar onde cada pessoa encontra acolhimento, cresce na fé, desenvolve seus dons e participa do que Deus está fazendo.")}</p>
              <p className="s-lead so-largo">{ligaTexto("Não queremos encher bancos. Queremos formar gente comprometida com o Reino.")}</p>
            </div>
            <div className="s-foto h s-rev d1"><Img lugar="sobre-comunidade" sizes="(max-width: 999px) 90vw, 34vw" /></div>
          </div>
          <Sede className="base" />
        </div>
      </section>

      <section className="s-faixa noite s-grao" aria-labelledby="t-sigla">
        <div className="s-in">
          <div className="s-cab centro s-rev">
            <Sede />
            <h2 id="t-sigla" className="s-h2">Somos GUIA.</h2>
            <p className="s-lead">{SIGLA_FRASE}.<span className="s-resto"> O chevron da marca é o avanço.</span></p>
          </div>
          <ul className="s-sigla s-rev d1">
            {SIGLA.map(l => (
              <li key={l.t}>
                <span className="s-letra">{l.l === '>' ? <Chevron /> : l.l}</span>
                <b>{l.t}</b>
                <p>{l.d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="s-faixa papel justa">
        <div className="s-in s-centro s-rev">
          <blockquote className="s-versiculo">Eis que o povo é um, e todos têm uma mesma língua; e isto é o que começam a fazer; e, agora, não haverá restrição para tudo o que eles intentarem fazer.</blockquote>
          <p className="s-versiculo-ref">Gênesis 11:6</p>
        </div>
      </section>

      <section className="s-faixa areia" aria-labelledby="t-pilares">
        <div className="s-in">
          <div className="s-passos-cab s-rev">
            <h2 id="t-pilares" className="s-serifa">{liga("Em que a gente se apoia?")}</h2>
            <p className="s-serifa it">{liga("três pilares, uma casa:")}</p>
          </div>
          <ol className="s-passos s-rev d1">
            {PILARES.map(p => <li key={p.n}><b>{p.n} - {p.t}</b><p><UmaLinha texto={p.d} semFim /></p></li>)}
          </ol>
          <Sede className="base" />
        </div>
      </section>

      <section className="s-faixa noite s-grao justa" aria-labelledby="t-alvo">
        <div className="s-in">
          <div className="s-claro s-rev">
            <Sede />
            <h2 id="t-alvo" className="s-h2 menor">{liga("Plantar cada cristão no solo da\u00a0responsabilidade do Reino.")}</h2>
            <p className="s-lead">{ligaTexto("É o nosso alvo. E ele muda o que a gente mede:")}</p>
            <ul className="s-vira" style={{ marginTop: 'clamp(24px,3vw,40px)' }}>
              {VIRA.map(v => <li key={v.de}><span>{v.de}</span><Chevron /><span>{v.para}</span></li>)}
            </ul>
            <div className="s-acoes centro"><Pil href="/servir" tom="preta">Quero servir</Pil></div>
          </div>
        </div>
      </section>

      {/* depois do cartão na noite, o fecho vem no papel */}
      <Fecho tom="papel" titulo="Conheça a GUIA de perto" it="de perto" chapeu={<Chapeu forte="Venha nos visitar" resto={`${IGREJA.cultoDia}, ${IGREJA.cultoHora}`} />}>
        <Pil href="/cultos#como-chegar" tom="preta">Como chegar</Pil>
        <Pil href="/cultos" tom="contorno">Ver os cultos</Pil>
      </Fecho>
    </>
  );
}
