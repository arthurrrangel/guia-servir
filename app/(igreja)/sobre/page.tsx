import type { Metadata } from 'next';
import { Chevron } from '@/components/Marca';
import { IGREJA, SITE_IGREJA as SITE, SIGLA, SIGLA_FRASE } from '@/lib/igreja';
import { noServir } from '@/lib/site/sites';
import { Vozes, Sede, Arroba, Chapeu, Pil, Img, Heroi, Passos, Claro, Fecho, UmaLinha, ligaTexto } from '@/components/site/Blocos';
import { Schema } from '@/components/site/Schema';

/* =============================================================================
   /sobre — QUEM SOMOS · 11/10/2026

   A identidade da igreja na forma da apresentação: herói · mais do que um
   lugar para frequentar · somos GUIA (a sigla) · o versículo · os pilares
   (em passos) · o alvo (de → para, no cartão claro) · conheça de perto.
   14/10/2026, no celular: uma frase sob cada título; o "não queremos encher
   bancos" sai do começo porque o alvo, mais embaixo, diz o mesmo.

   19/10/2026, A COPY FINAL: o título deixa o conceito interno ("cultiva uma
   nova cultura") e fala com quem chega. O texto final tem três parágrafos,
   e cada um foi para onde ele conversa com o resto da página: o primeiro no
   herói; o terceiro (pertencer sem ter a vida resolvida) no "mais do que um
   lugar para frequentar"; o segundo (o nome) abre a sigla, que vem logo
   depois e diz o mesmo nome letra por letra. O "não queremos encher bancos"
   sai de vez: o alvo diz o mesmo, e o terceiro parágrafo já fala do banco.
   ============================================================================= */

export const metadata: Metadata = {
  title: 'Quem somos',
  description: `Uma igreja que parece com a vida de quem chega. GUIA é sigla: ${SIGLA_FRASE}. Uma igreja na Barra da Tijuca construída sobre relacionamento, generosidade e serviço.`,
  alternates: { canonical: '/sobre' },
  openGraph: { siteName: 'GUIA Church', type: 'website', locale: 'pt_BR', title: 'Quem somos · GUIA Church', description: `${SIGLA_FRASE}.`, url: `${SITE}/sobre`, images: [{ url: '/og-sobre.jpg?v=20261020', width: 1200, height: 630 }] },
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

      <Heroi id="t-sobre" lugar="sobre-heroi" chapeu={<Chapeu forte="Quem somos" resto={IGREJA.nome} />} titulo="Uma igreja que parece com a vida de quem chega" it="de quem chega" longa
             lead={<UmaLinha semFim texto="A GUIA existe pra uma coisa simples: ajudar você a viver uma fé prática, com Deus, com as pessoas e no dia a dia. Sem fórmula pronta, sem encenação. Fé que funciona de segunda a segunda." />}>
        <Pil href="/cultos">Ver os cultos</Pil>
        <Pil href="/pequena-guia" tom="vidro">Conhecer uma Pequena Guia</Pil>
      </Heroi>

      <section className="s-faixa papel">
        <div className="s-in">
          <Arroba className="topo" />
          <div className="s-duas">
            <div className="s-rev">
              <Vozes className="s-h2 media" it="para frequentar">Mais do que um lugar para frequentar</Vozes>
              <p className="s-lead"><UmaLinha semFim texto="Aqui, você não precisa ter a vida resolvida pra pertencer. Visitante vira família, a fé sai do banco e entra na vida. E sempre cabe mais um." /></p>
            </div>
            <div className="s-foto h s-rev d1"><Img lugar="sobre-geracoes" sizes="(max-width: 999px) 90vw, 34vw" /></div>
          </div>
          <Sede className="base" />
        </div>
      </section>

      <section className="s-faixa noite s-grao" aria-labelledby="t-sigla">
        <div className="s-in">
          <Sede className="topo" />
          <div className="s-cab centro s-rev">
            <h2 id="t-sigla" className="s-h2">Somos GUIA.</h2>
            <p className="s-lead"><UmaLinha semFim texto={`Somos um ${SIGLA_FRASE}. Não é só o nosso nome. É o jeito que escolhemos viver: de perto, em comunidade, caminhando juntos.`} /></p>
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

      <Passos tid="t-pilares" titulo="Em que a gente se apoia?" sub="três pilares, uma casa:" itens={PILARES} />

      <Claro tid="t-alvo" titulo={"Plantar cada cristão no solo da\u00a0responsabilidade do Reino."} lead={ligaTexto("É o nosso alvo. E ele muda o que a gente mede:")}>
        <ul className="s-vira s-miolo">
          {VIRA.map(v => <li key={v.de}><span>{v.de}</span><Chevron /><span>{v.para}</span></li>)}
        </ul>
        <div className="s-acoes centro"><Pil href={noServir('/')} tom="preta">Quero servir</Pil></div>
      </Claro>

      {/* depois do cartão na noite, o fecho vem no papel */}
      <Fecho tom="papel" titulo="Conheça a GUIA de perto" it="de perto" chapeu={<Chapeu forte="Venha nos visitar" resto={`${IGREJA.cultoDia}, ${IGREJA.cultoHora}`} />}>
        <Pil href="/como-chegar" tom="preta">Como chegar</Pil>
        <Pil href="/cultos" tom="contorno">Ver os cultos</Pil>
      </Fecho>
    </>
  );
}
