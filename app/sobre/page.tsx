import type { Metadata } from 'next';
import Link from 'next/link';
import { Site } from '@/components/Site';
import { Tit, Schema } from '@/components/Texto';
import { IcSeta } from '@/components/Icones';
import { Chevron } from '@/components/Marca';
import { IGREJA, SITE } from '@/lib/igreja';

/* =============================================================================
   /sobre — QUERO CONHECER A GUIA CHURCH

   TODO O TEXTO DE IDENTIDADE DESTA PÁGINA É DA IGREJA, palavra por palavra —
   sigla, versículo, pilares e alvo saem exatamente como estão na home, que por
   sua vez saiu do que o Arthur mandou. Definição de identidade não é minha
   para editar, e página de igreja não é lugar de prosa inventada.

   O QUE ESTA PÁGINA ACRESCENTA em relação à seção da home é o ENQUADRAMENTO:
   a home apresenta a identidade a quem chegou por outro motivo; aqui ela é o
   assunto, e a primeira frase é de quem está de fora. O texto do material
   original fala de dentro para fora ("plantar cada cristão no solo da
   responsabilidade do Reino para frutificar") — quem está de fora não
   decodifica isso. A doutrina fica inteira; o que muda é a ordem de leitura.

   O QUE NÃO ESTÁ AQUI, E POR QUÊ: o bloco de liderança. A bio do Instagram
   diz "Pastor Presidente" e a regra fixa do canal diz que Altomir é
   evangelista, nunca pastor. Escrever um dos dois numa página pública é tomar
   uma decisão que o Arthur marcou como aberta. Fica fora até ele decidir — é
   mais barato acrescentar depois do que corrigir um título publicado.
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
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        name: `Quem somos · ${IGREJA.nome}`,
        url: `${SITE}/sobre`,
        about: {
          '@type': 'Church',
          name: IGREJA.nome,
          slogan: IGREJA.frase,
          url: SITE,
          address: {
            '@type': 'PostalAddress',
            streetAddress: IGREJA.rua,
            addressLocality: `${IGREJA.bairro}, ${IGREJA.cidade}`,
            addressRegion: IGREJA.uf,
            postalCode: IGREJA.cep,
            addressCountry: 'BR',
          },
        },
      }} />

      {/* --------------------------------------------- abertura, de quem chega */}
      <section className="faixa casa-papel">
        <div className="casa-col">
          <p className="indice">A igreja</p>
          <Tit as="h1" className="tit">Quem somos</Tit>
          <span className="chapeu">{IGREJA.frase}</span>
          <p className="corpo" style={{ marginTop: 40 }}>
            Uma igreja na Barra da Tijuca que se reúne no domingo de manhã e
            passa a semana tentando ser um povo, não uma plateia. Se você está
            chegando agora, o resumo honesto é esse — o resto desta página
            explica de onde ele vem.
          </p>
          <div className="acoes">
            <Link href="/cultos" className="acao cheia">Ver o domingo <IcSeta /></Link>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- a sigla */}
      <section className="faixa casa-escuro">
        <div className="casa-col">
          <p className="indice">O nome</p>
          <Tit>Somos GUIA</Tit>
          <p className="corpo">
            GUIA é sigla, e é a razão de a marca ser <b style={{ fontWeight: 500 }}>GUI&gt;</b>:
            o chevron é o avanço. Ela vem do princípio de Gênesis 11:6.
          </p>
        </div>

        <div className="casa-col larga">
          <blockquote className="versiculo">
            Eis que o povo é um, e todos têm uma mesma língua; e isto é o que
            começam a fazer; e, agora, não haverá restrição para tudo o que eles
            intentarem fazer.
            <cite>Gênesis 11:6</cite>
          </blockquote>

          <div className="sigla" style={{ marginTop: 64 }}>
            <div>
              <b>G</b><span>Grupo</span>
              <p>Somos um povo. Não caminhamos isoladamente.</p>
            </div>
            <div>
              <b>U</b><span>Unidos</span>
              <p>Cada pessoa tem um papel na construção de algo maior do que si mesma.</p>
            </div>
            <div>
              <b>I</b><span>Interagindo</span>
              <p>Cultura se constrói por relacionamento, comunicação e participação.</p>
            </div>
            <div>
              <span className="marca-chev" aria-hidden="true"><Chevron /></span>
              <span>Avançando</span>
              <p>Um povo unido, que se comunica e anda na mesma direção, tem força para avançar.</p>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- os pilares */}
      <section className="faixa casa-papel">
        <div className="casa-col">
          <p className="indice">Nossos pilares</p>
          <Tit>Relacionamento, generosidade e serviço</Tit>
        </div>
        <div className="casa-col larga">
          <div className="pilares">
            <div>
              <b>Relacionamento</b>
              <p>Ninguém foi chamado para caminhar sozinho. Pertencer é parte fundamental da vida cristã.</p>
            </div>
            <div>
              <b>Generosidade</b>
              <p>Tudo o que temos vem de Deus. Somos generosos com o tempo, os recursos e os dons que Ele colocou em nossas mãos.</p>
            </div>
            <div>
              <b>Serviço</b>
              <p>Serviço é característica de liderança no Reino. Quem serve se torna protagonista e agente de mudança na sociedade.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- o alvo */}
      <section className="faixa casa-escuro">
        <div className="casa-col">
          <p className="indice">Nosso alvo</p>
          <Tit>Plantar cada cristão no solo da responsabilidade do Reino</Tit>
          <p className="corpo">
            Que cada pessoa encontre seu lugar, compreenda sua responsabilidade e
            desenvolva aquilo que Deus depositou na vida dela.
          </p>
        </div>
        <div className="casa-col larga">
          <div className="alvo">
            <div><b>Encher bancos</b><span>Formar pessoas comprometidas com o Reino</span></div>
            <div><b>Espectadores</b><span>Participantes</span></div>
            <div><b>Pessoas que recebam</b><span>Pessoas que sirvam, contribuam e frutifiquem</span></div>
          </div>
          <p className="corpo" style={{ marginTop: 56 }}>
            Quando cada cristão entende seu lugar e assume sua responsabilidade, a
            igreja deixa de ser um lugar onde as pessoas chegam e passa a ser um
            povo que vive, serve e avança junto.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------- onde isso vira prática */}
      <section className="faixa casa-papel">
        <div className="casa-col">
          <p className="indice">Na prática</p>
          <Tit>Isso tem dois endereços na semana</Tit>
          <p className="corpo">
            Pertencer não acontece só no domingo. A Pequena Guia é o grupo que
            se encontra durante a semana; servir é o que faz o domingo de outra
            pessoa funcionar. As duas portas estão abertas.
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
