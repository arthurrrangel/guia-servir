import type { Metadata } from 'next';
import Link from 'next/link';
import { Site } from '@/components/Site';
import { Tit, Schema } from '@/components/Texto';
import { IcSeta } from '@/components/Icones';
import { Letreiro } from '@/components/Letreiro';
import { IGREJA, SITE } from '@/lib/igreja';

/* =============================================================================
   /cultos — A PÁGINA QUE TIRA ALGUÉM DE CASA

   Responde QUANDO e O QUE ESPERAR. O ONDE tem página própria (/como-chegar).

   COMPOSIÇÃO, não pilha: herói dividido (texto à esquerda, retrato à direita
   com o selo de areia), a ordem do culto como quatro fotos com numeral, as
   cinco perguntas com a coluna esquerda fixa enquanto a lista rola, o Kids
   com foto, e o fecho de ponta a ponta. Nenhuma seção é só texto.

   AS CINCO PERGUNTAS são palavra por palavra as da home + a de duração. Não
   foram reescritas: são o texto que a igreja usa.
   ============================================================================= */

const PERGUNTAS = [
  { q: 'Como eu me visto?',
    r: 'Do jeito que você já está. Tem gente de terno e gente de chinelo na mesma fileira.' },
  { q: 'Vou ter que falar alguma coisa?',
    r: 'Não. Tem um momento de acolhida no meio do culto, e ficar sentado é uma resposta perfeitamente boa.' },
  { q: 'Quanto tempo dura?',
    r: 'Noventa minutos, e termina em ponto. Você sabe a que horas vai sair antes de entrar.' },
  { q: 'E o meu filho?',
    r: 'Tem o GUIA Kids, com sala e equipe próprias, dividido por faixa etária. Check-in na entrada.' },
  { q: 'Onde eu deixo o carro?',
    r: 'Tem equipe de estacionamento no domingo de manhã. Se vier de aplicativo, a porta é na Pedra de Itaúna, 534.' },
];

const PASSOS = [
  { n: '01', t: 'Acolhida na porta', d: 'Alguém te recebe antes de você achar a porta.', foto: 'recepcao.webp' },
  { n: '02', t: 'Momento de louvor', d: 'Quem quiser canta. Quem não quiser, ouve.', foto: 'teclado.webp' },
  { n: '03', t: 'A palavra', d: 'Uma mensagem, um assunto, nada de discurso longo.', foto: 'palavra.webp' },
  { n: '04', t: 'Oração e saída', d: 'Termina em ponto. Café na saída para quem ficar.', foto: 'congregacao.webp' },
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
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'FAQPage',
        mainEntity: PERGUNTAS.map(p => ({ '@type': 'Question', name: p.q, acceptedAnswer: { '@type': 'Answer', text: p.r } })),
      }} />
      <Schema dados={{
        '@context': 'https://schema.org', '@type': 'Event',
        name: `Culto de domingo · ${IGREJA.nome}`, description: 'Culto público semanal, aberto a visitantes.',
        eventSchedule: { '@type': 'Schedule', byDay: 'https://schema.org/Sunday', startTime: '10:00', duration: 'PT90M', scheduleTimezone: 'America/Sao_Paulo' },
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', isAccessibleForFree: true,
        organizer: { '@type': 'Church', name: IGREJA.nome, url: SITE },
        location: { '@type': 'Place', name: IGREJA.nome, address: { '@type': 'PostalAddress', streetAddress: IGREJA.rua, addressLocality: `${IGREJA.bairro}, ${IGREJA.cidade}`, addressRegion: IGREJA.uf, postalCode: IGREJA.cep, addressCountry: 'BR' } },
      }} />

      {/* ------------------------------------------------------------ herói */}
      <section className="casa-papel rev">
        <div className="g g-secao primeira">
          <div className="g-grade meio">
            <div className="g-c6">
              <p className="g-rot">O domingo</p>
              <Tit as="h1" className="g-h1">Culto aos domingos, às 10h</Tit>
              <p className="g-ed">na Barra da Tijuca.</p>
              <p className="g-corpo">
                Noventa minutos, e termina em ponto. Chega a hora que der —
                ninguém vai reparar, e tem alguém na porta para te receber.
              </p>
              <div className="g-acoes">
                <Link href="/como-chegar" className="acao cheia">Como chegar <IcSeta /></Link>
                <Link href="/sobre" className="acao">Conhecer a GUIA</Link>
              </div>
            </div>
            <div className="g-c5 g-d8">
              <div className="g-foto alta leva">
                <img src="/fotos/equipe.webp" alt="Momento de louvor no culto de domingo da GUIA Church" fetchPriority="high" />
                <div className="g-selo">Dom 10h<small>{IGREJA.cultoDuracao} minutos · termina em ponto</small></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Letreiro escuro />

      {/* ------------------------------------------------- a ordem do culto */}
      <section className="casa-escuro rev">
        <div className="g g-secao">
          <div className="g-grade fim">
            <div className="g-c7">
              <p className="g-rot">Na prática</p>
              <Tit className="g-h2">Como é um domingo aqui</Tit>
            </div>
            <div className="g-c4 g-d9">
              <p className="g-corpo">
                Uma hora e meia, na mesma ordem toda semana. Saber o que vem a
                seguir é metade do medo que some.
              </p>
            </div>
          </div>
          <div className="g-passos">
            {PASSOS.map(p => (
              <div key={p.n} className="g-passo">
                <img src={`/fotos/${p.foto}`} alt="" loading="lazy" decoding="async" />
                <span className="g-passo-n">{p.n}</span>
                <span className="g-passo-t">{p.t}</span>
                <span className="g-passo-d">{p.d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ as cinco perguntas */}
      <section className="casa-areia rev">
        <div className="g g-secao">
          <div className="g-grade">
            <div className="g-c4">
              <div className="g-fixa">
                <p className="g-rot">Primeira vez</p>
                <Tit className="g-h2">As cinco perguntas de quem nunca foi</Tit>
                <p className="g-ed">Nenhuma delas é sobre doutrina.</p>
                <p className="g-corpo">
                  São as cinco que realmente travam alguém na porta de casa — e a
                  última é a que ninguém fala em voz alta.
                </p>
              </div>
            </div>
            <div className="g-c7 g-d6">
              <ol className="g-perg">
                {PERGUNTAS.map((p, i) => (
                  <li key={p.q}>
                    <span className="g-perg-n">0{i + 1}</span>
                    <div>
                      <h3 className="g-perg-q">{p.q}</h3>
                      <p className="g-perg-r">{p.r}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="g-acoes">
                <a href={IGREJA.instagram} target="_blank" rel="noreferrer" className="acao">
                  Ficou faltando alguma? Pergunta no Instagram
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- kids */}
      <section className="casa-papel rev">
        <div className="g g-secao">
          <div className="g-grade meio">
            <div className="g-c7">
              <div className="g-foto larga leva">
                <img src="/fotos/kids-2.webp" alt="Crianças desenhando na sala do GUIA Kids" loading="lazy" decoding="async" />
              </div>
            </div>
            <div className="g-c4 g-d9">
              <p className="g-rot">Crianças</p>
              <Tit className="g-h2">GUIA Kids</Tit>
              <p className="g-corpo">
                Sala e equipe próprias, dividido por faixa etária, com check-in
                na entrada. A criança fica com a equipe do Kids durante o culto
                e é entregue só a quem fez o check-in.
              </p>
              <div className="g-acoes">
                <Link href="/servir" className="acao">Servir no Kids <IcSeta /></Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ fecho */}
      <section className="g-cheio rev">
        <img src="/fotos/palco.webp" alt="" loading="lazy" decoding="async" />
        <div className="g">
          <p className="g-rot">Te esperamos</p>
          <Tit className="g-h2">Domingo, 10h. A porta é a mesma para todo mundo.</Tit>
          <div className="g-acoes">
            <Link href="/como-chegar" className="acao cheia">Traçar rota <IcSeta /></Link>
            <Link href="/pequena-guia" className="acao">Ou começar pela semana</Link>
          </div>
        </div>
      </section>
    </Site>
  );
}
