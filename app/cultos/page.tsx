import type { Metadata } from 'next';
import Link from 'next/link';
import { Site } from '@/components/Site';
import { Tit, Schema } from '@/components/Texto';
import { IcSeta } from '@/components/Icones';
import { IGREJA, ENDERECO_LINHA, SITE } from '@/lib/igreja';
import { Vaga, Vagas } from '@/components/Vaga';
import { FOTOS } from '@/lib/imagens';
import { Letreiro } from '@/components/Letreiro';

/* =============================================================================
   /cultos — A PÁGINA QUE TIRA ALGUÉM DE CASA

   Ela responde QUANDO e O QUE ESPERAR. O ONDE tem página própria
   (/como-chegar) e o CTA daqui aponta para lá — separar não é organograma, é
   intenção: quem quer saber como é ainda não decidiu ir; quem abre "como
   chegar" já decidiu, e misturar as duas obriga a primeira a rolar por um
   mapa que ela não pediu.

   AS CINCO PERGUNTAS SÃO O CONTEÚDO PRINCIPAL, não um rodapé de FAQ. Elas
   travam quem nunca foi numa igreja, e se não forem respondidas aqui a pessoa
   responde sozinha — a resposta que ela inventa é sempre a pior. É também o
   único bloco do site com chance real de resultado rico no Google (FAQPage).

   AS QUATRO PRIMEIRAS SÃO PALAVRA POR PALAVRA AS DA HOME. Não foram
   reescritas: são o texto que a igreja já usa, e página de igreja não é lugar
   de prosa inventada. A quinta — duração — é a única acrescentada, e sai do
   fato que a home já publica na régua do herói.
   ============================================================================= */

const PERGUNTAS = [
  {
    q: 'Como eu me visto?',
    r: 'Do jeito que você já está. Tem gente de terno e gente de chinelo na mesma fileira.',
  },
  {
    q: 'Vou ter que falar alguma coisa?',
    r: 'Não. Tem um momento de acolhida no meio do culto, e ficar sentado é uma resposta perfeitamente boa.',
  },
  {
    q: 'Quanto tempo dura?',
    r: 'Noventa minutos, e termina em ponto. Você sabe a que horas vai sair antes de entrar.',
  },
  {
    q: 'E o meu filho?',
    r: 'Tem o GUIA Kids, com sala e equipe próprias, dividido por faixa etária. Check-in na entrada.',
  },
  {
    q: 'Onde eu deixo o carro?',
    r: 'Tem equipe de estacionamento no domingo de manhã. Se vier de aplicativo, a porta é na Pedra de Itaúna, 534.',
  },
];

export const metadata: Metadata = {
  title: 'Cultos',
  description:
    'Culto aos domingos, às 10h, na Barra da Tijuca. Noventa minutos, e termina em ponto. As cinco perguntas de quem nunca foi, respondidas antes de você sair de casa.',
  alternates: { canonical: '/cultos' },
  openGraph: {
    title: 'Cultos · GUIA Church',
    description: 'Domingo, 10h, Barra da Tijuca. Noventa minutos, e termina em ponto.',
    url: `${SITE}/cultos`, type: 'website', locale: 'pt_BR',
  },
};

export default function Cultos() {
  return (
    <Site atual="/cultos">
      {/* FAQPage é o único schema deste site com chance real de aparecer
          expandido na busca. Ele só vale se as perguntas estiverem VISÍVEIS na
          página — schema de conteúdo escondido é violação de diretriz, não
          atalho. Por isso a lista é a mesma nos dois lugares. */}
      <Schema dados={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: PERGUNTAS.map(p => ({
          '@type': 'Question',
          name: p.q,
          acceptedAnswer: { '@type': 'Answer', text: p.r },
        })),
      }} />
      <Schema dados={{
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: `Culto de domingo · ${IGREJA.nome}`,
        description: 'Culto público semanal, aberto a visitantes.',
        eventSchedule: {
          '@type': 'Schedule',
          byDay: 'https://schema.org/Sunday',
          startTime: '10:00',
          duration: 'PT90M',
          scheduleTimezone: 'America/Sao_Paulo',
        },
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        isAccessibleForFree: true,
        organizer: { '@type': 'Church', name: IGREJA.nome, url: SITE },
        location: {
          '@type': 'Place',
          name: IGREJA.nome,
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

      {/* ------------------------------------------------------------ abertura */}
      <section className="faixa casa-papel rev">
        <div className="casa-col">
          <p className="indice">O domingo</p>
          <Tit as="h1" className="tit">Culto aos domingos, às 10h, na Barra da Tijuca</Tit>
          <span className="chapeu">Chega a hora que der · ninguém vai reparar</span>
          <p className="casa-hora" style={{ marginTop: 56 }}>
            Dom 10h
            <small>Noventa minutos, e termina em ponto</small>
          </p>
          <div className="acoes">
            <Link href="/como-chegar" className="acao cheia">Como chegar <IcSeta /></Link>
          </div>
        </div>
        <div className="casa-col larga" style={{ marginTop: 64 }}>
          <Vaga foto={FOTOS.cultoAmplo} />
        </div>
      </section>

      <Letreiro escuro />

      {/* ---------------------------------------------------- como é um domingo */}
      <section className="faixa casa-escuro rev">
        <div className="casa-col">
          <p className="indice">Na prática</p>
          <Tit>Como é um domingo aqui</Tit>
          <p className="corpo">
            Uma hora e meia, na mesma ordem toda semana. Saber o que vem a
            seguir é metade do medo que some.
          </p>
        </div>
        <div className="casa-col larga">
          <ol className="casa-tira" aria-label="A ordem do culto">
            <li><b>01</b> Acolhida na porta</li>
            <li><b>02</b> Momento de louvor</li>
            <li><b>03</b> A palavra</li>
            <li><b>04</b> Oração e saída</li>
          </ol>
          <p className="casa-tira-nota">
            Chegue a hora que der. Quem chega depois entra pela porta lateral e
            senta onde quiser — ninguém é conduzido para a frente.
          </p>
          <Vagas fotos={[FOTOS.cultoLouvor, FOTOS.cultoAcolhida]} quantas="duas" />
        </div>
      </section>

      {/* --------------------------------------------------- as cinco perguntas
          Na faixa de AREIA, e não no papel: é aqui que a página deixa de
          informar e passa a acolher. A cor marca essa virada melhor do que
          qualquer título faria. */}
      <section className="faixa casa-areia rev">
        <div className="casa-col">
          <p className="indice">Primeira vez</p>
          <Tit>As cinco perguntas de quem nunca foi</Tit>
          <p className="editorial">Nenhuma delas é sobre doutrina.</p>
          <p className="corpo" style={{ marginTop: 32 }}>
            São as cinco que realmente travam alguém na porta de casa — e a
            última é a que ninguém fala em voz alta.
          </p>
        </div>
        <dl className="casa-perguntas">
          {PERGUNTAS.map(p => (
            <div key={p.q}>
              <dt>{p.q}</dt>
              <dd>{p.r}</dd>
            </div>
          ))}
        </dl>
        <div className="casa-col" style={{ marginTop: 8 }}>
          <p className="corpo">
            Ficou faltando alguma? Manda no {IGREJA.instagramArroba} — alguém
            responde antes do domingo.
          </p>
          <div className="acoes">
            <a href={IGREJA.instagram} target="_blank" rel="noreferrer" className="acao">
              Perguntar no Instagram
            </a>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- kids */}
      <section className="faixa casa-escuro rev">
        <div className="casa-col">
          <p className="indice">Crianças</p>
          <Tit>GUIA Kids</Tit>
          <p className="corpo">
            Sala e equipe próprias, dividido por faixa etária, com check-in na
            entrada. A criança fica com a equipe do Kids durante o culto e é
            entregue só a quem fez o check-in.
          </p>
          <div className="acoes">
            <Link href="/servir" className="acao">Servir no Kids <IcSeta /></Link>
          </div>
        </div>
        <div className="casa-col larga" style={{ marginTop: 56 }}>
          <Vaga foto={FOTOS.kids} />
        </div>
      </section>

      {/* --------------------------------------------------------------- fecho */}
      <section className="faixa casa-papel rev">
        <div className="casa-col">
          <Tit>Te esperamos domingo</Tit>
          <p className="corpo">{ENDERECO_LINHA}</p>
          <div className="acoes">
            <Link href="/como-chegar" className="acao cheia">Traçar rota <IcSeta /></Link>
            <Link href="/sobre" className="acao">Conhecer a GUIA</Link>
          </div>
        </div>
      </section>
    </Site>
  );
}
