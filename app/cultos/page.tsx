import type { Metadata } from 'next';
import Link from 'next/link';
import { cartao } from '@/lib/meta';
import { Site } from '@/components/Site';
import { Tit, Schema } from '@/components/Texto';
import ProximoCulto from '@/components/ProximoCulto';
import { IcSeta } from '@/components/Icones';
import { IGREJA, SITE } from '@/lib/igreja';

/* =============================================================================
   /cultos — A PÁGINA QUE TIRA ALGUÉM DE CASA

   Responde QUANDO e O QUE ESPERAR. O ONDE tem página própria (/como-chegar).

   Quatro blocos, todos centrados: o herói com a hora, a ordem do culto em
   quatro fotos, as três perguntas de quem nunca foi, o fecho. O Kids virou
   uma das perguntas; a de estacionamento mora em /como-chegar.

   AS PERGUNTAS são palavra por palavra as da igreja. Três, não cinco: é o
   que cabe numa tela sem virar parede de texto.
   ============================================================================= */

/* A FICHA DO DOMINGO: os fatos de quem nunca foi, em rótulo + valor + uma
   linha. É a mesma informação das antigas "cinco perguntas", sem a prosa. */
const PERGUNTAS = [
  { q: 'Como eu me visto?', r: 'Do jeito que você já está. Tem gente de terno e gente de chinelo na mesma fileira.' },
  { q: 'Vou ter que falar alguma coisa?', r: 'Não. Tem um momento de acolhida no meio do culto, e ficar sentado é uma resposta perfeitamente boa.' },
  { q: 'E o meu filho?', r: 'Tem o GUIA Kids, com sala e equipe próprias, dividido por faixa etária. Check-in na entrada.' },
];
const FICHA = [
  { r: 'Quando', v: 'Domingo, 10h', d: 'Toda semana, no mesmo horário.' },
  { r: 'Onde', v: IGREJA.rua, d: `${IGREJA.bairro}, ${IGREJA.cidade}.`, href: '/como-chegar' },
  { r: 'Crianças', v: 'GUIA Kids', d: 'Sala e equipe próprias, por faixa etária. Check-in na entrada.' },
  { r: 'Roupa', v: 'A que você já usa', d: 'Tem gente de terno e gente de chinelo na mesma fileira.' },
  { r: 'Participação', v: 'Nenhuma obrigatória', d: 'Ficar sentado é uma resposta perfeitamente boa.' },
  { r: 'Estacionamento', v: 'Com equipe', d: 'Chegue com dez minutos de folga se vier dirigindo.' },
];

const PASSOS = [
  { n: '01', t: 'Acolhida', foto: 'recepcao.webp' },
  { n: '02', t: 'Louvor', foto: 'teclado.webp' },
  { n: '03', t: 'Palavra', foto: 'palavra.webp' },
  { n: '04', t: 'Oração e saída', foto: 'congregacao.webp' },
];

export const metadata: Metadata = {
  title: 'Cultos',
  description:
    'Culto aos domingos, às 10h, na Barra da Tijuca. O que esperar antes de você sair de casa.',
  alternates: { canonical: '/cultos' },
  ...cartao({ titulo: 'Cultos', descricao: 'Domingo, 10h, Barra da Tijuca. O que esperar antes de sair de casa.', caminho: '/cultos', imagem: 'cultos' }),
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
        eventSchedule: { '@type': 'Schedule', byDay: 'https://schema.org/Sunday', startTime: '10:00', scheduleTimezone: 'America/Sao_Paulo' },
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', isAccessibleForFree: true,
        organizer: { '@type': 'Church', name: IGREJA.nome, url: SITE },
        location: { '@type': 'Place', name: IGREJA.nome, address: { '@type': 'PostalAddress', streetAddress: IGREJA.rua, addressLocality: `${IGREJA.bairro}, ${IGREJA.cidade}`, addressRegion: IGREJA.uf, postalCode: IGREJA.cep, addressCountry: 'BR' } },
      }} />

      {/* ------------------------------------------------------------ herói */}
      <section className="g-cheio alta centro rev">
        <img src="/fotos/equipe.webp" alt="Momento de louvor no culto de domingo da GUIA Church" fetchPriority="high" />
        <div className="g">
          <p className="g-rot"><ProximoCulto /></p>
          <Tit as="h1" className="g-h1">Culto de domingo</Tit>
          <p className="g-ed">Às 10h, na Barra da Tijuca.</p>
          <div className="g-acoes">
            <Link href="/como-chegar" className="acao cheia">Como chegar <IcSeta /></Link>
            <Link href="/sobre" className="acao">Quem somos</Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- a ordem do culto */}
      <section className="casa-escuro retic rev">
        <div className="g g-secao">
          <div className="c">
            <p className="g-rot">Na prática</p>
            <Tit className="g-h2">Como é um domingo aqui</Tit>
            <p className="g-ed">Na mesma ordem, toda semana.</p>
          </div>
          <div className="g-passos centro c-bloco grande">
            {PASSOS.map(p => (
              <div key={p.n} className="g-passo">
                <img src={`/fotos/${p.foto}`} alt="" loading="lazy" decoding="async" />
                <span className="g-passo-n">{p.n}</span>
                <span className="g-passo-t">{p.t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------- a ficha do domingo */}
      <section className="casa-areia rev">
        <div className="g g-secao">
          <div className="c">
            <p className="g-rot">Primeira vez</p>
            <Tit className="g-h2">O que você precisa saber</Tit>
            <p className="g-ed">Seis coisas, nenhuma sobre doutrina.</p>
          </div>
          <div className="ficha c-bloco grande">
            {FICHA.map(f => (
              <div key={f.r}>
                <p className="ficha-r">{f.r}</p>
                {f.href
                  ? <Link href={f.href} className="ficha-v">{f.v} <IcSeta /></Link>
                  : <p className="ficha-v">{f.v}</p>}
                <p className="ficha-d">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ fecho */}
      <section className="g-cheio centro fecho rev">
        <img src="/fotos/palco.webp" alt="" loading="lazy" decoding="async" />
        <div className="g">
          <p className="g-rot">Te esperamos</p>
          <Tit className="g-h2">A porta é a mesma para todo mundo.</Tit>
          <div className="g-acoes">
            <Link href="/como-chegar" className="acao cheia">Traçar rota <IcSeta /></Link>
            <Link href="/pequena-guia" className="acao">Ou começar pela semana</Link>
          </div>
        </div>
      </section>
    </Site>
  );
}
